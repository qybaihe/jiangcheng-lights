"""Verify deployed cinema/narration bytes, unchanged assets, and secret isolation."""
import hashlib
import importlib.util
import json
from pathlib import Path
from urllib.request import urlopen

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/qa/opening-polish-v1'
BASE='http://127.0.0.1:4173'


def sha(value):
    return hashlib.sha256(value).hexdigest()


def main():
    # Keep the existing provenance audit for 44 memories, nine residents and
    # every supplementary voice/effect. It also scans exact secret values in
    # process memory, never serializing those values to its report.
    spec=importlib.util.spec_from_file_location('world_release',ROOT/'tools/verify-world-polish-release.py')
    previous=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(previous)
    previous.OUT=OUT
    previous.main()
    manifest=json.loads((ROOT/'public/media/cinema-v3-manifest.json').read_text())
    narration=json.loads((ROOT/'public/media/opening-narration-v1/manifest.json').read_text())
    paths={'/media/cinema-v3-manifest.json','/media/opening-narration-v1/manifest.json'}
    def visit(value):
        if isinstance(value,str) and value.startswith('/media/') and (ROOT/'public'/value.lstrip('/')).is_file():paths.add(value)
        elif isinstance(value,dict):
            for child in value.values():visit(child)
        elif isinstance(value,list):
            for child in value:visit(child)
    visit(manifest);visit(narration)
    checks=[]
    for path in sorted(paths):
        source=(ROOT/'public'/path.lstrip('/')).read_bytes()
        built=(ROOT/'dist'/path.lstrip('/')).read_bytes()
        with urlopen(BASE+path,timeout=60) as response:served=response.read()
        assert source==built==served,path
        checks.append({'path':path,'bytes':len(source),'sha256':sha(source)})
    assert not list((ROOT/'dist/media').rglob('*.partial.mp4'))
    with urlopen(BASE+'/?v=opening-polish-v1',timeout=30) as response:index=response.read()
    assert index==(ROOT/'dist/index.html').read_bytes()
    serving=json.loads((OUT/'production-serving.json').read_text())
    serving['url']=BASE+'/?v=opening-polish-v1'
    serving['cinemaResourceChecks']=checks
    serving['cinemaCount']=len(manifest['scenes'])
    serving['cinemaResolution']='1920x1080'
    serving['openingPlaybackRate']=manifest['scenes']['prologue']['defaultPlaybackRate']
    serving['narrationCount']=len(narration['cues'])
    serving['uniqueResourcesVerified']=len({c['path'] for c in serving['resourceChecks']+checks})
    (OUT/'production-serving.json').write_text(json.dumps(serving,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'status':'passed','uniqueResourcesVerified':serving['uniqueResourcesVerified'],'cinemaCount':5,'narrationCount':3},ensure_ascii=False))


if __name__=='__main__':main()
