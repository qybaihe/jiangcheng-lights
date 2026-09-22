"""Build nine compact, dressed Jiangcheng NPC VRM0 adaptations.

Sources, separate licences and original hashes are recorded in the manifest.
No generation service or paid asset is used. Requires numpy + Pillow.
"""
from pathlib import Path
import copy, hashlib, io, json, re, struct
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'output/research/resident-models-v3'
OUT=ROOT/'public/models/residents'
PRESET='https://vroid.pixiv.help/hc/en-us/articles/4402394424089'
SOURCE={
 'AvatarSample_A':('stable',PRESET,'VRoid sample terms; NOT CC0','https://hub.vroid.com/en/characters/2843975675147313744/models/5644550979324015604'),
 'AvatarSample_C':('stable',PRESET,'VRoid sample terms; NOT CC0','https://hub.vroid.com/en/characters/1248981995540129234/models/8640547963669442173'),
 'Sendagaya_Shibu':('beta','https://vroid.pixiv.help/hc/en-us/articles/360012381793','CC0-1.0','https://hub.vroid.com/characters/675572020956181239/models/4479743608263344465'),
 'Sendagaya_Shino':('beta','https://vroid.pixiv.help/hc/en-us/articles/360013482714','CC0-1.0','https://hub.vroid.com/characters/5860098757548846785/models/6567311261748429976'),
 'Sakurada_Fumiriya':('beta','https://vroid.pixiv.help/hc/en-us/articles/360014788554','CC0-1.0','https://hub.vroid.com/characters/6912965120285194650/models/2261505926203110716'),
}
# Hair and garments are genuine authored geometry from five distinct models.
# Elder age is this project's adaptation, NOT an advertised premade elder.
CAST=[
 dict(id='granny',name='林婆婆',source='Sendagaya_Shibu',sex='female',age=72,height=1.52,width=1.06,hair='#adaba3',top='#7f7287',bottom='#414b58',skin=.95,eyes=.76,hem=.30,appearance='银灰短发、柔和皱纹、紫灰针织背心、米白衬衫、膝下炭灰裙'),
 dict(id='chef',name='蔡姨',source='AvatarSample_A',sex='female',age=49,height=1.62,width=1.10,hair='#65493b',top='#b88761',bottom='#394e5c',skin=.99,eyes=.90,appearance='栗色短发、暖茶色开衫、米白内搭、靛蓝长裤'),
 dict(id='dock',name='周伯',source='Sakurada_Fumiriya',sex='male',age=68,height=1.73,width=1.08,hair='#828680',top='#465c6c',bottom='#555648',skin=.89,eyes=.81,appearance='灰白短发、成熟眼角、海军蓝针织背心、米白短袖衬衫、卡其长裤'),
 dict(id='community',name='小许',source='AvatarSample_A',sex='female',age=29,height=1.67,width=.97,hair='#4d3c33',top='#c58a69',bottom='#435f54',skin=1.,eyes=.95,appearance='深栗短发、杏橘针织开衫、米白内搭、玉绿长裤'),
 dict(id='walker0',name='陈姐',source='Sendagaya_Shino',sex='female',age=46,height=1.65,width=1.04,hair='#574237',top='#a06e71',bottom='#54667a',skin=.98,eyes=.88,hem=.27,appearance='深棕长发、旧玫瑰针织背心、雾蓝膝下裙'),
 dict(id='walker1',name='贺师傅',source='Sakurada_Fumiriya',sex='male',age=57,height=1.72,width=1.05,hair='#8d8576',top='#92775c',bottom='#46584e',skin=.93,eyes=.86,appearance='灰棕短发、暖棕针织背心、米白衬衫、橄榄长裤'),
 dict(id='walker2',name='罗娟',source='AvatarSample_A',sex='female',age=35,height=1.66,width=1.,hair='#382e28',top='#b79a57',bottom='#394b54',skin=.98,eyes=.96,appearance='深棕短发、芥末金针织开衫、深青长裤'),
 dict(id='walker3',name='程岚',source='Sendagaya_Shibu',sex='female',age=24,height=1.64,width=.96,hair='#3d3634',top='#65927e',bottom='#3f536a',skin=1.,eyes=.98,hem=.22,appearance='黑茶短发、玉绿针织背心、海蓝膝下裙'),
 dict(id='walker4',name='宋远',source='AvatarSample_C',sex='male',age=31,height=1.80,width=1.02,hair='#49372b',top='#657f98',bottom='#55564b',skin=.97,eyes=.98,appearance='棕黑层次短发、牛仔蓝休闲夹克、灰橄榄长裤'),
]
COMP={5126:np.dtype('<f4'),5125:np.dtype('<u4'),5123:np.dtype('<u2'),5121:np.dtype('u1')}
NCOMP={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def rgb(s):return np.array([int(s[i:i+2],16) for i in (1,3,5)],dtype=np.float32)
def shade(lum,colour,low=.45,high=.8): return rgb(colour)[None,None,:]*(low+high*lum[:,:,None]/255.)

class GLB:
 def __init__(self,path):
  self.raw=path.read_bytes();n=struct.unpack_from('<I',self.raw,12)[0];self.d=json.loads(self.raw[20:20+n]);self.bin=self.raw[28+n:];self.views={i:self.bin[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']] for i,v in enumerate(self.d['bufferViews'])}
 def array(self,i):
  a=self.d['accessors'][i];v=self.d['bufferViews'][a['bufferView']];assert not v.get('byteStride');return np.frombuffer(self.views[a['bufferView']],dtype=COMP[a['componentType']],offset=a.get('byteOffset',0),count=a['count']*NCOMP[a['type']]).reshape(a['count'],-1).copy()
 def put_array(self,i,arr):
  a=self.d['accessors'][i];arr=np.asarray(arr,dtype=COMP[a['componentType']]);old=self.views[a['bufferView']];off=a.get('byteOffset',0);self.views[a['bufferView']]=old[:off]+arr.tobytes()+old[off+arr.nbytes:]
  if 'min' in a:a['min']=arr.min(0).tolist()
  if 'max' in a:a['max']=arr.max(0).tolist()
 def new_indices(self,arr):
  a=np.asarray(arr,dtype='<u4'); vi=len(self.d['bufferViews']);self.d['bufferViews'].append(dict(buffer=0,byteOffset=0,byteLength=a.nbytes,target=34963));self.views[vi]=a.tobytes(); ai=len(self.d['accessors']);self.d['accessors'].append(dict(bufferView=vi,componentType=5125,count=a.size,type='SCALAR',min=[int(a.min())],max=[int(a.max())]));return ai
 def write(self,path):
  # Remove accessors/views that became unused after pruning face expressions,
  # hairpin/tie primitives and index batching. Other VRM node indices stay fixed.
  used=set()
  for m in self.d['meshes']:
   for p in m['primitives']:
    used.update(p['attributes'].values());used.add(p['indices'])
    for t in p.get('targets',[]):used.update(t.values())
  for s in self.d['skins']:
   if 'inverseBindMatrices'in s:used.add(s['inverseBindMatrices'])
  for a in self.d.get('animations',[]):
   for s in a['samplers']:used.update([s['input'],s['output']])
  remap={old:new for new,old in enumerate(sorted(used))};self.d['accessors']=[a for i,a in enumerate(self.d['accessors']) if i in used]
  for m in self.d['meshes']:
   for p in m['primitives']:
    p['attributes']={k:remap[v] for k,v in p['attributes'].items()};p['indices']=remap[p['indices']]
    p['targets']=[{k:remap[v] for k,v in t.items()} for t in p.get('targets',[])]
    if not p['targets']:p.pop('targets')
  for s in self.d['skins']:
   if 'inverseBindMatrices'in s:s['inverseBindMatrices']=remap[s['inverseBindMatrices']]
  for a in self.d.get('animations',[]):
   for s in a['samplers']:s['input']=remap[s['input']];s['output']=remap[s['output']]
  used={a['bufferView'] for a in self.d['accessors']}|{i['bufferView'] for i in self.d['images']}
  remap={old:new for new,old in enumerate(sorted(used))};chunks=bytearray(); views=[]
  for old in sorted(used):
   chunks.extend(b'\0'*(-len(chunks)%4));v=copy.deepcopy(self.d['bufferViews'][old]);v['byteOffset']=len(chunks);v['byteLength']=len(self.views[old]);chunks.extend(self.views[old]);views.append(v)
  self.d['bufferViews']=views
  for a in self.d['accessors']:a['bufferView']=remap[a['bufferView']]
  for i in self.d['images']:i['bufferView']=remap[i['bufferView']]
  chunks.extend(b'\0'*(-len(chunks)%4));self.d['buffers'][0]['byteLength']=len(chunks)
  encoded=json.dumps(self.d,ensure_ascii=False,separators=(',',':')).encode();encoded+=b' '*(-len(encoded)%4)
  raw=struct.pack('<III',0x46546c67,2,28+len(encoded)+len(chunks))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(chunks),0x004e4942)+chunks
  path.write_bytes(raw);return raw

def skin_age(im,age,skin):
 p=np.array(im).astype(np.float32);p[:,:,:3]*=skin;im=Image.fromarray(np.clip(p,0,255).astype('uint8'))
 if age<42:return im
 # Authored UV-local, soft age linework; no AI face photograph is used.
 overlay=Image.new('RGBA',im.size,(0,0,0,0));dr=ImageDraw.Draw(overlay);w,h=im.size;s=w/1024.;a=min(70,int((age-32)*1.7));ink=(129,82,62,a)
 def curve(points,width=2): dr.line([(int(x*s),int(y*s)) for x,y in points],fill=ink,width=max(1,int(width*s)),joint='curve')
 for cx in (346,678):
  sign=-1 if cx<512 else 1
  for dy in (-9,6,19):curve([(cx+sign*48,562+dy),(cx+sign*61,564+dy),(cx+sign*75,568+dy)])
  curve([(cx-27,600),(cx,605),(cx+24,602)],2)
 for yy in (380,397):curve([(435,yy),(478,yy-3),(524,yy-4),(575,yy)],2)
 curve([(460,661),(448,680),(446,703)],2);curve([(564,661),(576,680),(578,703)],2)
 im=Image.alpha_composite(im,overlay.filter(ImageFilter.GaussianBlur(.8*s)))
 return im

def face_shape(g,c):
 if c['eyes']>=.995:return
 m=g.d['meshes'][0];p=m['primitives'][0];posi=p['attributes']['POSITION'];pos=g.array(posi);iris=[]
 for q in m['primitives']:
  if 'EyeIris' in g.d['materials'][q['material']]['name']:iris.extend(g.array(q['indices']).ravel().tolist())
 eye=pos[np.unique(iris)];centres=[eye[eye[:,0]<0].mean(0),eye[eye[:,0]>=0].mean(0)];chin=pos[:,1].min(); ey=centres[0][1]
 def deform(v):
  v=v.copy()
  for ce in centres:
   # Compact eye opening while preserving its own topological eyelid/eyeball
   # relationship; same mapping is applied to retained expression deltas.
   dx=(v[:,0]-ce[0])/.047;dy=(v[:,1]-ce[1])/.040;dz=(v[:,2]-ce[2])/.060
   wt=np.exp(-(dx*dx+dy*dy+dz*dz)*.60)*(1-c['eyes'])
   v[:,0]-=(v[:,0]-ce[0])*wt*.55;v[:,1]-=(v[:,1]-ce[1])*wt
  if c['age']>=45:
   a=min(.16,(c['age']-40)*.004); jaw=np.clip((ey-v[:,1])/(ey-chin+.0001),0,1);v[:,0]*=1+a*jaw
  return v
 changed=deform(pos);g.put_array(posi,changed)
 seen=set()
 for q in m['primitives']:
  for target in q.get('targets',[]):
   k=target.get('POSITION')
   if k is not None and k not in seen:
    seen.add(k);delta=g.array(k);g.put_array(k,deform(pos+delta)-changed)

def extend_skirt(g,c):
 if 'hem' not in c:return
 m=g.d['meshes'][1];p=m['primitives'][0];ai=p['attributes']['POSITION'];pos=g.array(ai);idx=[]
 for q in m['primitives']:
  if 'Bottoms' in g.d['materials'][q['material']]['name']:idx.extend(g.array(q['indices']).ravel().tolist())
 idx=np.unique(idx);pts=pos[idx];lo,hi=pts[:,1].min(),pts[:,1].max(); t=np.clip((hi-pts[:,1])/(hi-lo),0,1);pts[:,1]-=c['hem']*t
 # A little extra hem room rather than an ankle-length hobble skirt.
 pts[:,0]*=1+.12*t;pts[:,2]*=1+.10*t;pos[idx]=pts;g.put_array(ai,pos)
 # Legs retain authored material and skinning, under the below-knee skirt.

def texture(g,c):
 changed=[]
 source=c['source'];male=source in ('AvatarSample_C','Sakurada_Fumiriya')
 for i,item in enumerate(g.d['images']):
  name=item.get('name','');im=Image.open(io.BytesIO(g.views[item['bufferView']])).convert('RGBA'); original=im.size
  pixels=np.array(im).astype(np.float32);col=pixels[:,:,:3];authored=col.copy();lum=col@np.array([.299,.587,.114]);alpha=pixels[:,:,3]
  is_main=not any(s in name.lower() for s in ('_nml','_spe','_out','matcap','thumbnail'))
  if is_main and ('Hair' in name):
   col[:]=shade(lum,c['hair'],.54,.69);changed.append(name)
  elif is_main and 'EyeIris' in name:
   mask=alpha>0; col[mask]=(np.array([11,8,5])+lum[:,:,None]*np.array([1.0,.69,.41]))[mask];changed.append(name)
  elif is_main and 'FaceBrow' in name:
   col[:]=rgb(c['hair'])*.68;changed.append(name)
  elif is_main and '_Tops_' in name:
   if source=='AvatarSample_A':
    # Preserve knit relief; neutral/blue sample garments become everyday
    # warm cardigans. The source's bright jade ribbons are desaturated.
    col[:]=shade(lum,c['top'],.38,.77)
    # Remove coloured sample ribbon prints with the adjacent knit tone.
    ribbons=(authored[:,:,1]>authored[:,:,0]*1.16)&(authored[:,:,2]>authored[:,:,0]*1.16)&(alpha>0)
    ribbons=np.array(Image.fromarray(ribbons.astype('uint8')*255).filter(ImageFilter.MaxFilter(5)))>0
    col[ribbons]=rgb(c['top'])*.98
    # Inner white panels remain warm ivory, not completely monochrome.
    mask=(lum>202)&((np.max(pixels[:,:,:3],2)-np.min(pixels[:,:,:3],2))<22)
    col[mask]=(np.array([164,160,142])+lum[:,:,None]*np.array([.31,.32,.34]))[mask]
   elif source=='AvatarSample_C':
    col[:]=shade(lum,c['top'],.54,.65)
    # Remove sample shoulder/collar print from the coat texture.
    h,w=lum.shape;x0,y0,x1,y1=[int(a*b) for a,b in zip([.536,.164,.564,.191],[w,h,w,h])];col[y0:y1,x0:x1]=col[y0:y1,x0-5:x0].mean(1)[:,None,:]
   else:
    dark=lum<118;col[dark]=shade(lum,c['top'],.65,.80)[dark];col[~dark]=(np.array([169,163,143])+lum[:,:,None]*np.array([.31,.32,.34]))[~dark]
   changed.append(name)
  elif is_main and '_Bottoms_' in name:
   col[:]=shade(lum,c['bottom'],.76,.55);changed.append(name)
  elif is_main and '_Shoes_' in name:
   col[:]=np.array([23,23,21])+lum[:,:,None]*np.array([.46,.45,.40]);changed.append(name)
  elif is_main and '_Body_' in name:
   col[:]*=c['skin']
   if source=='AvatarSample_A':
    # Full-length matte trousers on authored legs, joined to the source's
    # shorts at the hip. Body atlas reserved leg islands, never arms/face.
    h,w=lum.shape;yy,xx=np.mgrid[0:h,0:w];legs=((xx<w*.24)|(xx>w*.76))&(yy>h*.515)
    col[legs]=(rgb(c['bottom'])[None,None,:]*(.79+.40*lum[:,:,None]/255))[legs]
    undershirt=(yy<h*.455)&(lum<115)
    col[undershirt]=(np.array([190,185,167])+lum[:,:,None]*np.array([.40,.40,.39]))[undershirt]
   changed.append(name)
  pixels[:,:,:3]=np.clip(col,0,255);im=Image.fromarray(pixels.astype(np.uint8))
  if is_main and re.search(r'_Face_00$',name):im=skin_age(im,c['age'],c['skin']);changed.append(name)
  if '_nml' in name.lower():
   p=np.array(im);im=im.resize((8,8),Image.Resampling.NEAREST) if np.ptp(p[:,:,:3],axis=(0,1)).max()<2 else im.copy();im.thumbnail((256,256),Image.Resampling.LANCZOS)
  elif name=='Thumbnail':im.thumbnail((128,128),Image.Resampling.LANCZOS)
  elif 'Face_' in name and 'FaceMouth' not in name:im.thumbnail((1024,1024),Image.Resampling.LANCZOS)
  else:im.thumbnail((512,512),Image.Resampling.LANCZOS)
  # PNG preserves full MToon alpha and has universal browser GLTF support.
  stream=io.BytesIO();im.save(stream,format='PNG',optimize=True);g.views[item['bufferView']]=stream.getvalue();item['mimeType']='image/png'
  if c['id'] in ['granny','dock'] and re.search(r'_Face_00$',name):im.save(WORK/(c['id']+'-face-adapted.png'))
 # All diffuse map tinting is now baked; do not multiply old blue/fantasy
 # material colour over the new neutral hair. Disable redundant outline pass.
 for i,m in enumerate(g.d['materials']):
  m.setdefault('pbrMetallicRoughness',{})['baseColorFactor']=[1,1,1,1]
  prop=g.d['extensions']['VRM']['materialProperties'][i];v=prop.setdefault('vectorProperties',{});v['_Color']=[1,1,1,1];v['_ShadeColor']=[.87,.85,.82,1];v['_EmissionColor']=[0,0,0,0]
  f=prop.setdefault('floatProperties',{});f['_OutlineWidthMode']=0;f['_OutlineWidth']=0
  if '_HAIR' in m['name']:
   m['alphaMode']='MASK';m['alphaCutoff']=.45;f['_BlendMode']=1;f['_ZWrite']=1;f['_Cutoff']=.45;f['_SrcBlend']=1;f['_DstBlend']=0;prop['renderQueue']=2450;prop.setdefault('tagMap',{})['RenderType']='TransparentCutout'
 return changed

def build(c):
 path=WORK/'originals'/(c['source']+'.vrm');g=GLB(path);before=copy.deepcopy(g.d)
 vrm=g.d['extensions']['VRM'];keep={'neutral','blink','a','joy','fun'};groups=[x for x in vrm['blendShapeMaster']['blendShapeGroups'] if x.get('presetName') in keep]
 for mi,m in enumerate(g.d['meshes']):
  needed=sorted({b['index'] for group in groups for b in group['binds'] if b['mesh']==mi});remap={old:new for new,old in enumerate(needed)}
  for p in m['primitives']:
   if p.get('targets'):p['targets']=[p['targets'][j] for j in needed]
   if not p.get('targets'):p.pop('targets',None)
  if 'weights'in m:m['weights']=[m['weights'][j] for j in needed]
  for group in groups:
   for b in group['binds']:
    if b['mesh']==mi:b['index']=remap[b['index']]
 vrm['blendShapeMaster']['blendShapeGroups']=groups
 face_shape(g,c);extend_skirt(g,c);changed=texture(g,c)
 # Remove ties / ribbons / decorative P hair pins rather than recolouring
 # school or fantasy identity cues. Neck and actual garment remain covered.
 removed=[]
 for m in g.d['meshes']:
  retained=[]
  for p in m['primitives']:
   mat=g.d['materials'][p['material']]['name']
   remove=('AccessoryNeck' in mat) or (c['source'].startswith('Sendagaya_') and mat.endswith('HAIR_02'))
   if remove:removed.append(mat)
   else:retained.append(p)
  m['primitives']=retained
  # All source primitives in a mesh share attribute accessors. Batch indices
  # by actual material + morph layout while retaining UV/skin/bone indices.
  grouped={}
  for p in m['primitives']:
   key=json.dumps({k:v for k,v in p.items() if k!='indices'},sort_keys=True)
   grouped.setdefault(key,[]).append(p)
  merged=[]
  for parts in grouped.values():
   p=copy.deepcopy(parts[0]);p['indices']=g.new_indices(np.concatenate([g.array(x['indices']).ravel() for x in parts]));merged.append(p)
  m['primitives']=merged
 # NPCs use deterministic head/torso bone animation. Static authored hair is
 # deliberately retained: nine independent physics spring solvers waste CPU
 # and old beta initial springs pull hair across the face after VRM0 rotation.
 vrm['secondaryAnimation']['boneGroups']=[]
 terms=SOURCE[c['source']][1];vrm['meta']['title']=c['name']+' / Jiangcheng resident adaptation';vrm['meta']['author']='VRoid / pixiv Inc.; Jiangcheng project adaptations';vrm['meta']['reference']='Base: '+c['source']+'. See RESIDENT-LICENSE.md. Elder age is project adaptation, not a premade elderly model.';vrm['meta']['otherLicenseUrl']=terms
 output=OUT/(c['id']+'.vrm');raw=g.write(output)
 return {**c,'url':'/models/residents/'+output.name,'sourcePath':str(path.relative_to(ROOT)),'sourceSha256':hashlib.sha256(g.raw).hexdigest(),'sourceBytes':len(g.raw),'outputBytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'format':'VRM0 / GLB2','humanoidBones':len(vrm['humanoid']['humanBones']),'triangles':sum(g.d['accessors'][p['indices']]['count']//3 for m in g.d['meshes'] for p in m['primitives']),'drawPrimitives':sum(len(m['primitives']) for m in g.d['meshes']),'retainedExpressionPresets':sorted(keep),'ageAdaptation':c['age']>=42,'sourceIsPremadeElder':False,'changes':['diffuse palette and natural brown iris','1024px face / 512px cloth-hair / 256px detailed normal maps','eye proportion and older jaw adaptation','retained expressions and unchanged skin bone indices','batched same-material primitives','static hair no secondary physics']+(['below-knee skirt geometry extension'] if 'hem'in c else [])+(['painted full-length trousers on source leg atlas'] if c['source']=='AvatarSample_A' else []),'removedMaterialNames':sorted(set(removed)),'licence':SOURCE[c['source']][2],'licenceUrl':terms}

if __name__=='__main__':
 OUT.mkdir(parents=True,exist_ok=True);rows=[]
 for c in CAST:
  r=build(c);rows.append(r);print(r['id'],r['source'],round(r['outputBytes']/1e6,2),'MB',r['triangles'],'tri',r['drawPrimitives'],'draws',flush=True)
 sources=[]
 for name,(folder,terms,licence,official) in SOURCE.items():
  p=WORK/'originals'/(name+'.vrm');sources.append(dict(id=name,author='VRoid / pixiv Inc.',licence=licence,termsUrl=terms,officialModelUrl=official,downloadUrl=f'https://raw.githubusercontent.com/madjin/vrm-samples/master/vroid/{folder}/{name}.vrm',mirror='Third-party free distribution mirror, not pixiv-owned',officialBinaryHashCompared=False,sha256=hashlib.sha256(p.read_bytes()).hexdigest(),bytes=p.stat().st_size,evidence='output/research/resident-models-v3/terms-'+terms.rsplit('/',1)[-1]+'.json'))
 report=dict(version=3,created='2026-09-12',sources=sources,residents=rows,totalBytes=sum(x['outputBytes'] for x in rows),distinctSourceCount=len({x['source'] for x in rows}),noPurchase=True,noGeneratedAssets=True,notes=['Original model characters, names and biographies are not imported; Jiangcheng story identities stay unchanged.','Older appearances are authored adaptations of youthful base meshes, not premade elderly characters.','A/C retain separate sample-use terms and must never be relabeled CC0.'])
 assert report['totalBytes']<=35000000,report['totalBytes']
 (ROOT/'media/resident-model-sources.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');(WORK/'build-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print('total',report['totalBytes'])
