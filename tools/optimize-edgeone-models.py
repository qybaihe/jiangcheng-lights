#!/usr/bin/env python3
"""Pixel-lossless image optimization for a separate EdgeOne GLB/VRM release.

Only edits models in the explicitly selected release site's models directory.
Stores originals and reports beside (never inside) that public site.
All mesh, skeleton, accessor, animation and VRM metadata stay unchanged.
"""
from __future__ import annotations
import argparse
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import struct
import time
from PIL import Image, ImageChops, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser()
parser.add_argument('--site',default='output/edgeone-release/site')
parser.add_argument('--only',help='Relative model path, e.g. ayao.vrm or residents/granny.vrm')
parser.add_argument('--png-fallback',action='store_true',help='Retain core PNG compatibility; lossless re-encode only')
args=parser.parse_args()
SITE=(ROOT/args.site).resolve()
if SITE==ROOT/'public' or not SITE.is_relative_to(ROOT/'output'):
    raise SystemExit('Expected a separate release directory underneath output/')
MODELS=SITE/'models'
AUDIT=SITE.parent/'model-audit'
ORIGINALS=SITE.parent/'model-originals'
CACHE=SITE.parent/'model-image-cache'
for p in (AUDIT,ORIGINALS,CACHE):p.mkdir(parents=True,exist_ok=True)

def sha(data):return hashlib.sha256(data).hexdigest()
def align(n):return (n+3)&~3
def parse_glb(raw):
    magic,version,length=struct.unpack_from('<4sII',raw)
    assert magic==b'glTF' and version==2 and length==len(raw)
    chunks=[];offset=12
    while offset<len(raw):
        n,kind=struct.unpack_from('<II',raw,offset)
        chunks.append((kind,raw[offset+8:offset+8+n]));offset+=8+n
    assert [c[0] for c in chunks]==[0x4e4f534a,0x004e4942], 'Expected JSON + one BIN'
    data=json.loads(chunks[0][1]);binary=chunks[1][1]
    assert len(data['buffers'])==1 and 'uri' not in data['buffers'][0]
    assert len(binary)>=data['buffers'][0]['byteLength']
    return data,binary

def build_glb(data,binary):
    encoded=json.dumps(data,ensure_ascii=False,separators=(',',':')).encode()
    encoded+=b' '*(align(len(encoded))-len(encoded))
    binary+=b'\0'*(align(len(binary))-len(binary))
    length=12+8+len(encoded)+8+len(binary)
    return struct.pack('<4sII',b'glTF',2,length)+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(binary),0x004e4942)+binary

def view_bytes(data,binary,index):
    v=data['bufferViews'][index];assert v.get('buffer',0)==0
    start=v.get('byteOffset',0);end=start+v['byteLength']
    assert 0<=start<=end<=len(binary)
    return binary[start:end]

def image_rgba(raw):
    with Image.open(io.BytesIO(raw)) as im:return im.convert('RGBA')

def optimize_image(raw,mime):
    # Cache deterministic lossless encodes across eleven related model families.
    key=sha(raw);original=image_rgba(raw)
    candidates=[(raw,mime,'original')]
    png_path=CACHE/(key+'.png')
    if not png_path.exists():
        out=io.BytesIO()
        with Image.open(io.BytesIO(raw)) as im:im.save(out,format='PNG',optimize=True,compress_level=9)
        png_path.write_bytes(out.getvalue())
    candidates.append((png_path.read_bytes(),'image/png','optimized-png-lossless'))
    if not args.png_fallback:
        webp_path=CACHE/(key+'.webp')
        if not webp_path.exists():
            out=io.BytesIO()
            # exact=True also preserves RGB in pixels with zero alpha.
            original.save(out,format='WEBP',lossless=True,quality=100,method=6,exact=True)
            webp_path.write_bytes(out.getvalue())
        candidates.append((webp_path.read_bytes(),'image/webp','webp-lossless-exact'))
    for data,kind,method in sorted(candidates,key=lambda x:len(x[0])):
        decoded=image_rgba(data)
        if decoded.size==original.size and decoded.tobytes()==original.tobytes():
            return data,kind,method,original.size
    raise AssertionError('No pixel-identical image candidate')

def font(size):
    try:return ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',size)
    except OSError:return ImageFont.load_default()

def comparison_sheet(name,images):
    chosen=sorted(images,key=lambda x:x['originalBytes'],reverse=True)[:3]
    w,h=1080,60+len(chosen)*340;sheet=Image.new('RGB',(w,h),'#f3f1eb');draw=ImageDraw.Draw(sheet)
    draw.text((24,16),name+' | exact RGBA lossless texture comparison',fill='#263d35',font=font(22))
    for row,item in enumerate(chosen):
        y=60+row*340
        for col,(caption,raw) in enumerate([('Original PNG',item['_source']),('Release '+item['mimeType'].split('/')[-1],item['_result']),('Difference x 8',None)]):
            x=col*360+16;draw.text((x,y),caption,fill='#263d35',font=font(18))
            bg=Image.new('RGBA',(328,276),'#e8e6df');checker=ImageDraw.Draw(bg)
            for cy in range(0,276,16):
                for cx in range(0,328,16):
                    if (cx//16+cy//16)%2==0:checker.rectangle((cx,cy,cx+15,cy+15),fill='#cdd5d0')
            if raw is None:
                src=image_rgba(item['_source']);out=image_rgba(item['_result']);im=ImageChops.difference(src,out).convert('RGB').point(lambda p:min(p*8,255)).convert('RGBA')
            else:im=image_rgba(raw)
            im.thumbnail((328,276),Image.Resampling.LANCZOS)
            bg.alpha_composite(im,((328-im.width)//2,(276-im.height)//2));sheet.paste(bg.convert('RGB'),(x,y+28))
        draw.text((20,y+308),f"image {item['index']} / {item['size'][0]} x {item['size'][1]} / {item['originalBytes']:,} -> {item['optimizedBytes']:,} bytes / RGBA identical",fill='#42594e',font=font(15))
    path=AUDIT/(name.replace('/','-').removesuffix('.vrm')+'-textures.jpg');sheet.save(path,quality=94)
    return path.relative_to(ROOT).as_posix()

def verify(original,original_bin,after,after_bin,image_views):
    checks={}
    # Only view offsets/image lengths, image MIME, WebP texture extension and
    # the root extension capability list/buffer length may change.
    a=copy.deepcopy(original);b=copy.deepcopy(after)
    for obj in (a,b):
        obj.pop('bufferViews');obj.pop('buffers');obj.pop('images');obj.pop('textures');obj.pop('extensionsUsed',None);obj.pop('extensionsRequired',None)
    assert a==b,'Non-image scene/VRM metadata changed'
    checks['sceneSkeletonGeometryAccessorsAnimationVRMMetadataUnchanged']=True
    assert original['accessors']==after['accessors']
    assert len(original['bufferViews'])==len(after['bufferViews'])
    nonimage=0
    for i,(av,bv) in enumerate(zip(original['bufferViews'],after['bufferViews'])):
        assert bv.get('byteOffset',0)%4==0
        ap=copy.deepcopy(av);bp=copy.deepcopy(bv);ap.pop('byteOffset',None);bp.pop('byteOffset',None)
        if i in image_views:ap.pop('byteLength');bp.pop('byteLength')
        assert ap==bp,f'view {i} properties changed'
        if i not in image_views:
            assert view_bytes(original,original_bin,i)==view_bytes(after,after_bin,i),f'view {i} non-image payload changed'
            nonimage+=1
    checks['bufferViewCountAndIndicesUnchanged']=True
    checks['nonImageBufferViewsByteIdentical']=nonimage
    checks['allAccessorDefinitionsUnchanged']=len(original['accessors'])
    checks['offsetNote']='BIN repacked at 4-byte alignment; offsets change because original PNG views precede geometry. Non-image byteLength/stride/target and exact payload unchanged.'
    assert len(original['images'])==len(after['images'])
    for i,(ai,bi) in enumerate(zip(original['images'],after['images'])):
        a=copy.deepcopy(ai);b=copy.deepcopy(bi);a.pop('mimeType',None);b.pop('mimeType',None);assert a==b
        src=image_rgba(view_bytes(original,original_bin,ai['bufferView']));out=image_rgba(view_bytes(after,after_bin,bi['bufferView']))
        assert src.size==out.size and src.tobytes()==out.tobytes(),f'image {i} differs'
    checks['allImageDimensionsAndRGBAUnchanged']=len(original['images'])
    assert len(original['textures'])==len(after['textures'])
    for i,(at,bt) in enumerate(zip(original['textures'],after['textures'])):
        a=copy.deepcopy(at);b=copy.deepcopy(bt)
        if after['images'][bt['source']].get('mimeType')=='image/webp':
            assert bt['extensions']['EXT_texture_webp']['source']==at['source']
            b['extensions'].pop('EXT_texture_webp')
            if not b['extensions']:b.pop('extensions')
        assert a==b,f'texture source/sampler/index {i} changed'
    checks['textureIndicesAndSourceReferencesUnchanged']=True
    checks['webpCapabilityDeclaredRequired']=not any(i.get('mimeType')=='image/webp' for i in after['images']) or all('EXT_texture_webp' in after.get(k,[]) for k in ['extensionsUsed','extensionsRequired'])
    assert checks['webpCapabilityDeclaredRequired']
    return checks

def optimize(model):
    started=time.time();relative=model.relative_to(MODELS);name=relative.as_posix();backup=ORIGINALS/relative
    if not backup.exists():backup.parent.mkdir(parents=True,exist_ok=True);backup.write_bytes(model.read_bytes())
    source=backup.read_bytes();original,binary=parse_glb(source);data=copy.deepcopy(original)
    image_views={im['bufferView'] for im in original['images']};replacements={};report_images=[]
    used_views=[(v.get('byteOffset',0),v.get('byteOffset',0)+v['byteLength'],i) for i,v in enumerate(original['bufferViews'])]
    used_views.sort()
    assert all(a[1]<=b[0] for a,b in zip(used_views,used_views[1:])),'Overlapping bufferViews require a separate path'
    for i,im in enumerate(original['images']):
        assert 'uri' not in im and im.get('mimeType')=='image/png','Expected original embedded PNG'
        raw=view_bytes(original,binary,im['bufferView']);encoded,mime,method,size=optimize_image(raw,im['mimeType'])
        assert len(encoded)<=len(raw)
        data['images'][i]['mimeType']=mime;replacements[im['bufferView']]=encoded
        report_images.append({'index':i,'bufferView':im['bufferView'],'size':list(size),'originalBytes':len(raw),'optimizedBytes':len(encoded),'mimeType':mime,'method':method,'rgbaExact':True,'alphaExact':True,'PSNR':'infinite (pixel-identical)','sourceSha256':sha(raw),'optimizedSha256':sha(encoded),'_source':raw,'_result':encoded})
    any_webp=False
    for texture in data['textures']:
        idx=texture['source']
        if data['images'][idx]['mimeType']=='image/webp':
            texture.setdefault('extensions',{})['EXT_texture_webp']={'source':idx};any_webp=True
    if any_webp:
        for key in ('extensionsUsed','extensionsRequired'):
            data.setdefault(key,[])
            if 'EXT_texture_webp' not in data[key]:data[key].append('EXT_texture_webp')
    out_bin=bytearray()
    for i,view in enumerate(data['bufferViews']):
        out_bin.extend(b'\0'*(align(len(out_bin))-len(out_bin)))
        payload=replacements.get(i,view_bytes(original,binary,i))
        view['byteOffset']=len(out_bin);view['byteLength']=len(payload);out_bin.extend(payload)
    data['buffers'][0]['byteLength']=len(out_bin)
    output=build_glb(data,bytes(out_bin));decoded,decoded_bin=parse_glb(output)
    checks=verify(original,binary,decoded,decoded_bin,image_views)
    assert len(output)<len(source),'Optimized model should be smaller'
    sheet=comparison_sheet(name,report_images)
    temp=model.with_suffix('.vrm.partial');temp.write_bytes(output);os.replace(temp,model)
    report={'path':'models/'+name,'mode':'png-fallback' if args.png_fallback else 'lossless-webp','originalBytes':len(source),'optimizedBytes':len(output),'savingsBytes':len(source)-len(output),'savingsPercent':round(100*(1-len(output)/len(source)),2),'originalSha256':sha(source),'optimizedSha256':sha(output),'backup':backup.relative_to(ROOT).as_posix(),'comparisonSheet':sheet,'verification':checks,'images':[{k:v for k,v in item.items() if not k.startswith('_')} for item in report_images],'seconds':round(time.time()-started,2)}
    (AUDIT/(name.replace('/','-')+'.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps({k:report[k] for k in ['path','originalBytes','optimizedBytes','savingsPercent','seconds']},ensure_ascii=False),flush=True)
    return report

models=[MODELS/args.only] if args.only else sorted(MODELS.rglob('*.vrm'))
for model in models:
    if not model.resolve().is_relative_to(MODELS) or model.suffix!='.vrm':raise SystemExit('Model must be inside release models/')
    optimize(model)
reports=[json.loads(p.read_text()) for p in AUDIT.glob('*.vrm.json')]
summary={'version':1,'generatedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'sourcePreserved':True,'site':SITE.relative_to(ROOT).as_posix(),'modelCount':len(reports),'originalBytes':sum(x['originalBytes'] for x in reports),'optimizedBytes':sum(x['optimizedBytes'] for x in reports),'lossless':True,'geometryMetadataUnchanged':True,'models':reports,'compatibility':'EXT_texture_webp is required; original source texture indices retained for VRM0 MToon. Runtime browser rendering acceptance is a separate check. --png-fallback restores core PNG using the original backups.'}
(AUDIT/'model-optimization.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
print(json.dumps({k:summary[k] for k in ['modelCount','originalBytes','optimizedBytes','lossless']},ensure_ascii=False),flush=True)
