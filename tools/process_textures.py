"""Create project PBR approximations from the generated orthographic material atlas.
The normal/roughness channels are art-directed image derivatives, not measured scans.
"""
from pathlib import Path
from PIL import Image, ImageOps, ImageFilter, ImageChops
ROOT=Path(__file__).resolve().parents[1]
import sys
source=sys.argv[1] if len(sys.argv)>1 else 'material-atlas'
src=Image.open(ROOT/f'output/imagegen/{source}.png').convert('RGB')
w,h=src.size
names=['brick','roof','paving','plaster'] if source=='material-atlas' else ['painted-wood','fabric','wood','iron']
for name,box in zip(names,[(0,0,w//2,h//2),(w//2,0,w,h//2),(0,h//2,w//2,h),(w//2,h//2,w,h)]):
 im=src.crop(box)
 # Keep the source color detail; edge repetition remains part of visual QA.
 im.save(ROOT/f'public/textures/{name}-color.webp',quality=93)
 gray=ImageOps.grayscale(im).filter(ImageFilter.GaussianBlur(.65))
 dx=ImageChops.subtract(ImageChops.offset(gray,-1,0),ImageChops.offset(gray,1,0),scale=.65,offset=128)
 dy=ImageChops.subtract(ImageChops.offset(gray,0,1),ImageChops.offset(gray,0,-1),scale=.65,offset=128)
 Image.merge('RGB',(dx,dy,Image.new('L',gray.size,245))).save(ROOT/f'public/textures/{name}-normal.webp',quality=92)
 rough=gray.point(lambda p:135+p*.36)
 rough.save(ROOT/f'public/textures/{name}-roughness.webp',quality=90)
 print('Created material:',name)
