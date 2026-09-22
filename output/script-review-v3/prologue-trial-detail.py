from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import subprocess,io,json,math
ROOT=Path.cwd()
p=ROOT/'public/media/cinema-v3-prologue-ferry-v1.mp4'
out=ROOT/'output/script-review-v3/prologue-trial-qa'
font=ImageFont.truetype('/System/Library/Fonts/Menlo.ttc',18)
def frame(t):
 r=subprocess.run(['/opt/homebrew/bin/ffmpeg','-v','error','-ss',f'{t:.6f}','-i',str(p),'-frames:v','1','-f','image2pipe','-vcodec','png','-'],capture_output=True,check=True)
 return Image.open(io.BytesIO(r.stdout)).convert('RGB')
def save_sheet(items,name,width=390,cols=4):
 h=round(items[0][1].height/items[0][1].width*width)
 sheet=Image.new('RGB',(cols*(width+16)+16,math.ceil(len(items)/cols)*(h+44)+16),'#102622')
 d=ImageDraw.Draw(sheet)
 for i,(t,im) in enumerate(items):
  x=16+(i%cols)*(width+16);y=16+(i//cols)*(h+44)
  sheet.paste(im.resize((width,h)),(x,y));d.text((x,y+h+6),f'{t:.4f}s',font=font,fill='white')
 sheet.save(out/name,quality=95)
 return str(out/name)
# Full-resolution source first, cut approach, exact cut, and final frames.
times=[0,5.291667,5.333333,5.375,5.416667,7.5,8,8.5,9,9.5,12.25,12.291667,12.333333,12.375,13.5,15]
all=[]
for t in times:
 im=frame(t);im.save(out/f'detail-{t:09.4f}s.png');all.append((t,im))
save_sheet(all,'cut-boundaries.jpg')
# Inspect key motion every four frames across the entire insert, enlarged hand crop.
keys=[]
for n in range(129,296,4):
 t=n/24;im=frame(t).crop((0,200,1050,660));keys.append((t,im))
for j in range(0,len(keys),16): save_sheet(keys[j:j+16],f'key-motion-{j//16+1}.jpg',width=450)
# 24fps dense crop of the actual rotation and glint interval.
rotation=[]
for n in range(180,229):
 t=n/24;im=frame(t).crop((0,220,1060,650));rotation.append((t,im))
for j in range(0,len(rotation),16):save_sheet(rotation[j:j+16],f'key-rotation-24fps-{j//16+1}.jpg',width=450)
# Large structural crops at the starts/ends of the water shots.
water=[]
for t in [0,5.333333,12.333333,15]:
 water.append((t,frame(t)))
save_sheet(water,'water-shots-large.jpg',width=720,cols=2)
print('Written QA-only detail frames and contact sheets.')
