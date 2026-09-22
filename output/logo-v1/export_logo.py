"""Deterministic exports from the retained Image2 original; no generation calls."""
from pathlib import Path
import json, hashlib
import numpy as np
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[2]
SRC=ROOT/'output/imagegen/game-logo-v1.png'
OUT=ROOT/'public/media'
a=np.asarray(Image.open(SRC).convert('RGB')).astype(np.float32)
edges=np.concatenate([a[:15].reshape(-1,3),a[-15:].reshape(-1,3),a[:,:15].reshape(-1,3),a[:,-15:].reshape(-1,3)])
bg=np.median(edges,axis=0)
ink_mask=(a[:,:,1]-a[:,:,0]>20)&(a[:,:,1]<140)&(a[:,:,0]<100)
gold_mask=(a[:,:,0]-a[:,:,1]>35)&(a[:,:,1]-a[:,:,2]>50)&(a[:,:,0]>180)&(a[:,:,1]<205)
ink=np.median(a[ink_mask],axis=0);gold=np.median(a[gold_mask],axis=0)
colors=np.stack([ink,gold]);directions=bg[None,:]-colors
flat=a.reshape(-1,3);delta=bg[None,:]-flat
projections=np.einsum('nc,kc->nk',delta,directions)/np.sum(directions*directions,axis=1)[None,:]
projected=bg[None,None,:]-projections[:,:,None]*directions[None,:,:]
residual=((projected-flat[:,None,:])**2).sum(axis=2)
chosen=residual.argmin(axis=1);alpha=np.clip(projections[np.arange(len(flat)),chosen],0,1)
# Remove only cream background noise. Thin anti-alias colors are un-premultiplied.
alpha[(np.linalg.norm(delta,axis=1)<22)|(alpha<.085)]=0
alpha[alpha>.985]=1
safe=np.maximum(alpha,.001)[:,None]
fg=np.clip((flat-(1-alpha[:,None])*bg[None,:])/safe,0,255)
fg[alpha==0]=0
rgba=np.concatenate([fg,alpha[:,None]*255],axis=1).reshape(a.shape[:2]+(4,)).round().astype(np.uint8)
full=Image.fromarray(rgba,'RGBA')
bounds=full.getbbox();pad=48
box=(max(0,bounds[0]-pad),max(0,bounds[1]-pad),min(full.width,bounds[2]+pad),min(full.height,bounds[3]+pad))
logo=full.crop(box)
cream=(247,240,223,255);plate=Image.new('RGBA',logo.size,cream);plate.alpha_composite(logo)
plate.convert('RGB').save(OUT/'game-logo-v1.webp',lossless=True,method=6,exact=True)
plate.convert('RGB').save(OUT/'game-logo-v1.png')
logo.save(OUT/'game-logo-v1-transparent.png')
logo.save(OUT/'game-logo-v1-transparent.webp',lossless=True,method=6,exact=True)
# Dark-surface adaptation recolors the same generated pixel shapes, never re-typesets.
dark=np.zeros_like(rgba);light=np.array([250,241,216],dtype=np.float32);warm=np.array([236,178,81],dtype=np.float32)
color=np.where(chosen[:,None]==0,light,warm)
dark[:,:,:3]=color.reshape(a.shape).astype(np.uint8);dark[:,:,3]=rgba[:,:,3]
dark_img=Image.fromarray(dark,'RGBA').crop(box)
dark_img.save(OUT/'game-logo-v1-dark.webp',lossless=True,method=6,exact=True)
dark_img.save(OUT/'game-logo-v1-dark.png')
# The isolated final character and roof/window serve as a recognisable app mark.
icon_section=full.crop((1360,170,1765,585))
# Remove only the isolated clipped fragment of the preceding character at the crop's left edge.
icon_data=np.array(icon_section);icon_data[124:155,0:13,3]=0;icon_section=Image.fromarray(icon_data,'RGBA')
bb=icon_section.getbbox();glyph=icon_section.crop(bb)
icon=Image.new('RGBA',(512,512));glyph.thumbnail((448,448),Image.Resampling.LANCZOS);icon.alpha_composite(glyph,((512-glyph.width)//2,(512-glyph.height)//2))
icon.save(OUT/'game-logo-v1-mark.png');icon.save(OUT/'game-logo-v1-mark.webp',lossless=True,method=6,exact=True)
icon_dark_section=Image.fromarray(dark,'RGBA').crop((1360,170,1765,585));m=np.array(icon_dark_section);m[124:155,0:13,3]=0;icon_dark_section=Image.fromarray(m,'RGBA')
icon_dark_glyph=icon_dark_section.crop(bb);icon_dark_glyph.thumbnail((448,448),Image.Resampling.LANCZOS);icon_dark=Image.new('RGBA',(512,512));icon_dark.alpha_composite(icon_dark_glyph,((512-icon_dark_glyph.width)//2,(512-icon_dark_glyph.height)//2))
icon_dark.save(OUT/'game-logo-v1-mark-dark.png');icon_dark.save(OUT/'game-logo-v1-mark-dark.webp',lossless=True,method=6,exact=True)
for size in (32,64,128):
 icon.resize((size,size),Image.Resampling.LANCZOS).save(OUT/f'game-logo-v1-mark-{size}.png')
# Fixed-size proofs on light, dark and scene-like muted green surfaces.
proof=Image.new('RGB',(1080,800),(232,228,216));d=ImageDraw.Draw(proof)
for i,(image,color,label) in enumerate([(logo,(247,240,223),'transparent / cream'),(dark_img,(28,51,49),'light lettering / dark')]):
 y=20+i*240;d.rectangle((20,y,1060,y+220),fill=color);small=image.copy();small.thumbnail((900,180),Image.Resampling.LANCZOS);proof.paste(small,(40,y+10),small);d.text((40,y+195),label,fill=(100,130,120))
for width,x in [(480,20),(320,530),(160,880)]:
 small=logo.copy();small.thumbnail((width,180),Image.Resampling.LANCZOS);proof.paste(small,(x,535),small);d.text((x,645),f'{width}px logo width',fill=(35,65,60))
for size,x in [(128,30),(64,210),(32,320)]:
 small=icon.resize((size,size),Image.Resampling.LANCZOS);proof.paste(small,(x,670),small);d.text((x+size+5,700),f'{size}px',fill=(35,65,60))
proof.save(ROOT/'output/logo-v1/size-and-background-review.jpg',quality=94)
record={'source':str(SRC.relative_to(ROOT)),'backgroundEstimate':bg.tolist(),'inkEstimate':ink.tolist(),'goldEstimate':gold.tolist(),'contentBounds':list(bounds),'cropWithPadding':list(box),'outputSize':list(logo.size),'matteMethod':'Two generated ink/gold color-line projections, remove cream noise and unpremultiply edge colors; no glyph redraw.','alphaNote':'Postprocessed extraction from opaque Image2 original, not native generated transparency.','darkMethod':'Same alpha and pixel shapes, deterministic light-ink/amber recolor.','markMethod':'Crop generated final character with its roof/window; remove isolated 12px-wide fragment of previous character at crop edge; no new symbol drawing.','transparentPixels':int((rgba[:,:,3]==0).sum()),'totalPixels':len(flat)}
(ROOT/'output/logo-v1/export-details.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(record,ensure_ascii=False,indent=2))
