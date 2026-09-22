"""Deterministic, non-cropping icon exports from one retained Image2 original.
No generation, network, SDK, credential reads, tracing, or background removal.
"""
from pathlib import Path
import hashlib
import json
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'output/imagegen/game-icon-v2.png'
OUT = ROOT / 'public/media'
REVIEW = ROOT / 'output/icon-v2'
image = Image.open(SOURCE)
assert image.size == (1024, 1024), f'Unexpected source dimensions: {image.size}'
# Keep the complete generated square. No crop, compositing, or rounded mask.
if 'A' in image.getbands():
    assert image.getchannel('A').getextrema() == (255, 255), 'Source must be fully opaque'
image = image.convert('RGB')
image.save(OUT / 'game-icon-v2.png', optimize=True)
image.save(OUT / 'game-icon-v2.webp', quality=94, method=6)
for size in (16, 32, 64, 128, 180, 192, 512):
    image.resize((size, size), Image.Resampling.LANCZOS).save(
        OUT / f'game-icon-v2-{size}.png', optimize=True)
image.save(OUT / 'game-icon-v2.ico', format='ICO', sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
# The conventional endpoint is a byte-identical alias for fallback browser requests.
(ROOT / 'public/favicon.ico').write_bytes((OUT / 'game-icon-v2.ico').read_bytes())

fontpath = '/System/Library/Fonts/HelveticaNeue.ttc'
font = ImageFont.truetype(fontpath, 20)
smallfont = ImageFont.truetype(fontpath, 15)
heading = ImageFont.truetype(fontpath, 30)
canvas = Image.new('RGB', (1220, 1010), '#dadfd9')
draw = ImageDraw.Draw(canvas)
draw.text((30, 20), 'JIANGCHENG GAME ICON  /  v2', font=heading, fill='#163e39')
draw.text((30, 58), 'Full 1:1 square source. Native-size proofs; corner mask shown separately only.', font=smallfont, fill='#34544e')
for x, bg, fg, label in [(20, '#f7f0df', '#234f49', 'Light surface'), (620, '#142e2b', '#f7f0df', 'Dark surface')]:
    draw.rectangle((x, 90, x+580, 990), fill=bg)
    draw.text((x+28, 106), label + '  /  512 px', font=font, fill=fg)
    proof512 = image.resize((512,512), Image.Resampling.LANCZOS)
    canvas.paste(proof512, (x+34,142))
    xpos=x+24
    for size in (16,32,64,128,180):
        y=689+(180-size)//2
        canvas.paste(Image.open(OUT / f'game-icon-v2-{size}.png'), (xpos,y))
        draw.text((xpos,880), str(size), font=smallfont, fill=fg)
        xpos+=size+27
    draw.text((x+28, 923), 'Native pixels: 16 / 32 / 64 / 128 / 180', font=smallfont, fill=fg)
    draw.text((x+28, 950), 'No border. No transparency. No clipping.', font=smallfont, fill=fg)
canvas.save(REVIEW / 'review.jpg', quality=96, subsampling=0)
# A secondary platform-only mask proof. These masks are NOT applied to exports.
proof = Image.new('RGB', (800,330), '#f7f0df')
d = ImageDraw.Draw(proof)
d.text((24,20), 'Platform mask safety preview (exports stay square)', font=font, fill='#234f49')
for x, radius, label in [(30,0,'Square'),(290,44,'Rounded by OS'),(550,96,'Circle stress test')]:
    tile=image.resize((192,192),Image.Resampling.LANCZOS)
    mask=Image.new('L',(192,192),0)
    md=ImageDraw.Draw(mask)
    if radius == 96:
        md.ellipse((0,0,191,191),fill=255)
    else:
        md.rounded_rectangle((0,0,191,191),radius=radius,fill=255)
    proof.paste(tile,(x,76),mask)
    d.text((x,287),label,font=smallfont,fill='#234f49')
proof.save(REVIEW/'platform-mask-review.jpg',quality=95,subsampling=0)

def file_record(path):
    with Image.open(path) as im:
        record={'path':str(path.relative_to(ROOT)), 'width':im.width, 'height':im.height,
                'format':im.format, 'mode':im.mode,
                'bytes':path.stat().st_size, 'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
        if im.format=='ICO':
            record['embeddedSizes']=[list(s) for s in sorted(im.ico.sizes())]
        return record
paths=[OUT/'game-icon-v2.png',OUT/'game-icon-v2.webp']
paths += [OUT/f'game-icon-v2-{s}.png' for s in (16,32,64,128,180,192,512)]
paths += [OUT/'game-icon-v2.ico',ROOT/'public/favicon.ico']
report={'source':file_record(SOURCE),'exports':[file_record(p) for p in paths],
        'transforms':['Convert to RGB after opaque-alpha check', 'PNG/WebP encoding',
                      'Full-image LANCZOS resize, no crop', 'Multi-size ICO container'],
        'noCrop':True,'noPreRoundedCorners':True,'noTransparentMargin':True,
        'review':file_record(REVIEW/'review.jpg'),
        'platformMaskPreview':file_record(REVIEW/'platform-mask-review.jpg')}
(REVIEW/'export-details.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'source':report['source'], 'exports':len(paths),
                  'review':str(REVIEW/'review.jpg')},ensure_ascii=False,indent=2))
