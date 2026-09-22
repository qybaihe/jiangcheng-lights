"""Restore invariant shutter geometry from C09's first frame into its lit last frame."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT=Path(__file__).resolve().parents[1]
start=Image.open(ROOT/'output/imagegen/cinema-c09-start-v1.png').convert('RGB')
end=Image.open(ROOT/'output/imagegen/cinema-c09-end-v1.png').convert('RGB')
assert start.size==end.size==(2048,1152)
mask=Image.new('L',start.size,0)
draw=ImageDraw.Draw(mask)
# Two formerly closed shutters must not turn into glass as neighboring lights appear.
# Include their immediate masonry edge; a narrow feather avoids an editing seam.
draw.rectangle((1308,106,1380,300),fill=255)
draw.rectangle((1266,417,1336,560),fill=255)
mask=mask.filter(ImageFilter.GaussianBlur(3))
result=Image.composite(start,end,mask)
dest=ROOT/'output/imagegen/cinema-c09-end-v2.png'
result.save(dest)
result.save(ROOT/'public/media/cinema-c09-end-v2.webp',quality=90)
print('Saved C09 v2: original shutter geometry restored; no model call.')
