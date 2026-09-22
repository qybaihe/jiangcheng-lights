"""One-shot continuation of this render, not a scheduled/recurring job."""
from pathlib import Path
import subprocess,time,json
ROOT=Path(__file__).resolve().parents[2]
marker=ROOT/'output/demo-film-v1/final-render.json'
deadline=time.monotonic()+1200
while not marker.exists():
 if time.monotonic()>deadline:raise TimeoutError('Final render did not finish within 20 minutes')
 time.sleep(10)
info=json.loads(marker.read_text());assert info['frames']==3540
subprocess.run([str(ROOT/'.venv/bin/python'),str(ROOT/'video/demo-film-v1/master-final.py')],check=True,cwd=ROOT)
subprocess.run([str(ROOT/'.venv/bin/python'),str(ROOT/'video/demo-film-v1/verify-final.py')],check=True,cwd=ROOT)
