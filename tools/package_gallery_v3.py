"""Publish the visually accepted gallery assets without changing source generations."""
from pathlib import Path
import hashlib,json,shutil
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
SPECS=[
 ('ending-true','ending-v3-true-r2','ending-v3-true','灯下有你'),
 ('ending-good','ending-v3-good-r2','ending-v3-good','明早见'),
 ('ending-neutral','ending-v3-neutral','ending-v3-neutral','顺路归来'),
 ('ending-regret','ending-v3-regret-r2','ending-v3-regret','未赴的约'),
 ('drawing','story-v3-child-drawing','story-v3-child-drawing','画里的人'),
 ('wuhan','gallery-v3-wuhan','gallery-v3-wuhan','江城拾光'),
 ('neighbors','gallery-v3-neighbors','gallery-v3-neighbors','一件一件，做到一起'),
]
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def main():
 records=[]
 # Preflight every asset before replacing any public alias.
 for id,source,alias,title in SPECS:
  png=ROOT/f'output/imagegen/{source}.png';webp=ROOT/f'public/media/{source}.webp';prompt=ROOT/f'media/prompts/{source}.txt'
  with Image.open(png) as im:im.load();width,height=im.size
  with Image.open(webp) as im:im.load();assert im.size==(width,height)
  assert (width,height)==((1536,1536) if id=='drawing' else (1792,1008))
  records.append({'id':id,'title':title,'source':str(png.relative_to(ROOT)),'sourceSha256':sha(png),'url':f'/media/{alias}.webp','width':width,'height':height,'generator':'gpt-image-2 via authorized Image2 gateway and bundled CLI','prompt':str(prompt.relative_to(ROOT)),'promptSha256':sha(prompt),'review':'assistant visual inspection of generated image; not human sign-off','acceptedVariant':source,'sha256':sha(webp),'bytes':webp.stat().st_size})
 for (_,source,alias,_),record in zip(SPECS,records):
  if source!=alias:
   temp=ROOT/f'public/media/{alias}.webp.tmp';shutil.copyfile(ROOT/f'public/media/{source}.webp',temp);temp.replace(ROOT/f'public/media/{alias}.webp')
 manifest={'version':3,'generatedArtworkCount':len(records),'endingArtworkCount':4,'existingMemoryArtworkCount':8,'gallerySlots':15,'records':records,'continuityCorrections':['Rectangular ivory lunchbox with red lid and white scuff in three ending variants','Wuhan doupi squares instead of folded dumplings in good ending'],'childDrawingCrops':{id:f'/media/child-drawing-{id}.webp' for id in ['close','bowl','talk','open']}}
 path=ROOT/'media/gallery-art-v3.json';path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
 print(f'Published {len(records)} generated artworks; 15 total gallery slots')
if __name__=='__main__':main()
