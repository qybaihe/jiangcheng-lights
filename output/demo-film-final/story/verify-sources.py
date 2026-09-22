import json,subprocess,pathlib,concurrent.futures
root=pathlib.Path(__file__).resolve().parent
manifest=json.loads((root/'manifest.json').read_text())
def check(x):
 p=pathlib.Path(x['path']);d=json.loads(subprocess.check_output(['/opt/homebrew/bin/ffprobe','-v','error','-show_streams','-show_format','-of','json',str(p)]));v=next(t for t in d['streams'] if t['codec_type']=='video');a=next(t for t in d['streams'] if t['codec_type']=='audio');r=subprocess.run(['/opt/homebrew/bin/ffmpeg','-v','error','-i',str(p),'-f','null','-'],capture_output=True,text=True)
 assert r.returncode==0 and not r.stderr,(p.name,r.stderr)
 assert (v['width'],v['height'],v['codec_name'],v['pix_fmt'],v['avg_frame_rate'])==(1920,1080,'h264','yuv420p','30/1')
 assert v['color_space']=='bt709' and v['color_range']=='tv'
 assert a['codec_name']=='aac' and a['sample_rate']=='48000' and a['channels']==2
 return {'name':x['name'],'path':str(p),'duration':float(d['format']['duration']),'videoDuration':float(v['duration']),'frames':int(v['nb_frames']),'MB':p.stat().st_size/1e6,'decode':'passed','video':'1080p30 H.264 yuv420p BT.709 TV','audio':'AAC 48k stereo'}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex: result=list(ex.map(check,manifest))
(root/'SOURCE-VERIFICATION.json').write_text(json.dumps({'clips':len(result),'allPassed':True,'results':result},indent=2,ensure_ascii=False))
print(json.dumps({'clips':len(result),'allPassed':True,'totalSeconds':sum(x['videoDuration'] for x in result)},ensure_ascii=False))
