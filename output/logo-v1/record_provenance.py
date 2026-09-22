from pathlib import Path
from PIL import Image
import json,hashlib,datetime,numpy as np
root=Path(__file__).resolve().parents[2]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
src=root/'output/imagegen/game-logo-v1.png'
prompt=root/'media/prompts/game-logo-v1.txt'
roles={
 'game-logo-v1.webp':'main: dark teal lettering on uniform warm cream',
 'game-logo-v1.png':'lossless PNG counterpart of main',
 'game-logo-v1-transparent.webp':'dark teal lettering, post-extracted transparent background',
 'game-logo-v1-transparent.png':'PNG counterpart of transparent lettering',
 'game-logo-v1-dark.webp':'light lettering on transparent background for dark scenes',
 'game-logo-v1-dark.png':'PNG counterpart of dark-surface variant',
 'game-logo-v1-mark.webp':'square final-character and window mark, transparent',
 'game-logo-v1-mark.png':'PNG counterpart of square mark',
 'game-logo-v1-mark-dark.webp':'light-ink square mark for dark surfaces',
 'game-logo-v1-mark-dark.png':'PNG counterpart of dark-surface square mark',
 'game-logo-v1-mark-128.png':'128 px mark',
 'game-logo-v1-mark-64.png':'64 px mark',
 'game-logo-v1-mark-32.png':'32 px mark'}
assets=[]
for name,role in roles.items():
 p=root/'public/media'/name;im=Image.open(p);im.load()
 assets.append({'url':'/media/'+name,'role':role,'format':im.format,'width':im.width,'height':im.height,'mode':im.mode,'bytes':p.stat().st_size,'sha256':sha(p)})
checks=[]
for suffix in ('','-transparent','-dark','-mark','-mark-dark'):
 a=np.array(Image.open(root/f'public/media/game-logo-v1{suffix}.png').convert('RGBA'))
 b=np.array(Image.open(root/f'public/media/game-logo-v1{suffix}.webp').convert('RGBA'))
 same=np.array_equal(a,b);assert same,(suffix,'roundtrip')
 checks.append({'variant':suffix or 'main','losslessWebpRoundTrip':same})
ocr=json.loads((root/'output/logo-v1/ocr.json').read_text())
assert all(x['success'] and len(x['results'])==1 and x['results'][0]['candidates'][0]['text']=='江城有灯' for x in ocr)
exports=json.loads((root/'output/logo-v1/export-details.json').read_text())
record={
 'id':'game-logo-v1','status':'accepted','exactTitle':'江城有灯',
 'generatedAt':datetime.datetime.fromtimestamp(src.stat().st_mtime,datetime.timezone.utc).isoformat(),
 'generator':{'model':'gpt-image-2','mode':'explicitly requested Image2 gateway via existing tools/media.py adapter and installed imagegen CLI','cli':'/Users/baihe/.codex/skills/.system/imagegen/scripts/image_gen.py','operation':'generate','quality':'high','requestedSize':'2048x768','requestedFormat':'png','requestCount':1,'newSDKCreated':False},
 'prompt':{'path':str(prompt.relative_to(root)),'sha256':sha(prompt),'text':prompt.read_text()},
 'original':{'path':str(src.relative_to(root)),'width':2048,'height':768,'mode':'RGB','bytes':src.stat().st_size,'sha256':sha(src),'retainedUnmodified':True},
 'exports':assets,'derivation':exports,
 'qa':{'status':'passed',
  'reviewMethod':['agent visual inspection of actual generated image, four glyph structures, background composites, 320 px and 160 px readability','offline macOS Vision OCR via JXA; accurate level, zh-Hans/en-US, language correction disabled','Pillow full decode plus exact pixel comparison of PNG and lossless WebP counterparts'],
  'ocrReport':'output/logo-v1/ocr.json','ocrExactTextAtWidths':['original 2048','main 1522','320','160'],
  'visualProof':'output/logo-v1/size-and-background-review.jpg','roundTripChecks':checks,
  'findings':['Exactly the four intended Chinese characters; no extra slogan or English.','Warm window and roof are decorative additions; all title glyphs remain legible.','No complex scene or tourism-poster composition.','Transparent matte inspected on cream and dark surfaces; cropped preceding-character fragment removed from icon only.'],
  'recommendedMinimumTitleWidth':160,'recommendedMinimumDetailedMarkWidth':64,
  'icon32':'Recognisable coarse mark; fine roof/window details naturally reduce at favicon size.'},
 'usage':{'main':'/media/game-logo-v1.webp','overLightScene':'/media/game-logo-v1-transparent.webp','overDarkScene':'/media/game-logo-v1-dark.webp','mark':'/media/game-logo-v1-mark.webp','markOnDark':'/media/game-logo-v1-mark-dark.webp'},
 'scope':'Asset generation/export/provenance only; no game page, scene, CSS, or runtime code was changed.'}
(root/'media/game-logo-v1.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
print('Accepted exports:',len(assets))
print('Main SHA:',assets[0]['sha256'])
print('Original SHA:',record['original']['sha256'])
print('Main bytes:',assets[0]['bytes'])
