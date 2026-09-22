"""Collect already-submitted cinematic tasks. This tool never creates a task."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import time
import httpx
from media import ENV, ROOT, read_jobs, save_jobs

PLAN = ROOT/'media/cinema/seedance-requests-v1.json'


def now():
    return datetime.now(timezone.utc).isoformat()


def collect_once(plan_path=PLAN):
    plan=json.loads(plan_path.read_text())
    jobs=read_jobs()
    key=ENV.get('ARK_API_KEY')
    if not key:raise RuntimeError('ARK_API_KEY is missing')
    host=ENV.get('ARK_HOST','ark-i18n-tt.tiktok-row.net')
    headers={'Authorization':f'Bearer {key}'}
    finished=True
    for item in plan['requests']:
        name=item['job_name'];job=jobs.get(name)
        if not job:raise RuntimeError(f'{name}: no submitted task exists; collection cannot submit')
        target=ROOT/'public/media'/f'{name}.mp4'
        if job.get('downloaded_at') and target.exists():
            item.update(state='succeeded',result=job.get('result',{}),source_path=str(target.relative_to(ROOT)))
            continue
        response=httpx.get(f'https://{host}/api/v3/contents/generations/tasks/{job["id"]}',headers=headers,timeout=45)
        if not response.is_success:
            print(name,'query HTTP',response.status_code,flush=True);finished=False;continue
        data=response.json();data=data.get('data',data)
        status=data.get('status','unknown')
        if job.get('status')!=status:print(name,status,flush=True)
        job['status']=status;job['last_checked_at']=now();item['state']=status
        if status=='succeeded':
            metadata={k:data[k] for k in ['model','duration','ratio','resolution','framespersecond','generate_audio','seed','created_at','updated_at'] if k in data}
            link=data.get('content',{}).get('video_url')
            if not link:raise RuntimeError(f'{name}: succeeded without a video URL')
            download=httpx.get(link,timeout=150,follow_redirects=True)
            if not download.is_success:raise RuntimeError(f'{name}: download HTTP {download.status_code}')
            part=target.with_suffix('.mp4.part');part.write_bytes(download.content);part.replace(target)
            metadata.update(bytes=target.stat().st_size,sha256=hashlib.sha256(target.read_bytes()).hexdigest())
            job.update(result=metadata,downloaded_at=now())
            item.update(result=metadata,source_path=str(target.relative_to(ROOT)))
            print(name,'saved',metadata['bytes'],'bytes',flush=True)
        elif status in ('failed','canceled','cancelled'):
            error=data.get('error',{}).get('code','unknown')
            job['error_code']=str(error)[:120];item['error_code']=str(error)[:120]
            print(name,'terminal failure:',str(error)[:120],flush=True)
        else:finished=False
        jobs[name]=job;save_jobs(jobs)
    states=[item['state'] for item in plan['requests']]
    plan.update(status='succeeded' if all(s=='succeeded' for s in states) else 'failed_or_partial' if finished else 'generating',last_checked_at=now())
    plan['notes']='Actual submitted first/last-frame video tasks. Result metadata is from the provider; visual acceptance is recorded separately. No API credentials or delivery URLs are stored here.'
    plan_path.write_text(json.dumps(plan,ensure_ascii=False,indent=2))
    (ROOT/'output/cinema'/plan_path.name).write_text(plan_path.read_text())
    return finished


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--once',action='store_true');parser.add_argument('--plan',type=Path,default=PLAN);args=parser.parse_args()
    deadline=time.monotonic()+2400
    try:
        while True:
            done=collect_once(args.plan)
            if done or args.once:break
            if time.monotonic()>deadline:raise RuntimeError('Collection timeout; submitted task IDs remain available for resuming')
            time.sleep(30)
    except Exception as error:
        # Never print authenticated URLs, response bodies or headers on errors.
        if isinstance(error,httpx.HTTPError):print('Video collection network error; saved tasks can be resumed.',flush=True)
        else:print(type(error).__name__+': '+str(error)[:220],flush=True)
        raise SystemExit(1)
