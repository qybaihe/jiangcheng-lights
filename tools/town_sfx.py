#!/usr/bin/env python3
"""Generate exact-purpose quiet game foley via the existing media.py audio API.
Raw WAV, prompts, fingerprints and measured results stay in the production log.
"""
from __future__ import annotations
import argparse,array,concurrent.futures,hashlib,json,math,os,re,shutil,subprocess,sys,time
from pathlib import Path
import media
import story_voice as voice
ROOT=media.ROOT;WORK=ROOT/'output/audio/town-audio-v1';PUBLIC=ROOT/'public/media/town-audio-v1';RATE=48000
COMMON='生成4秒原创游戏拟音，纯音效，录音棚干净近场细节，温暖克制，不刺耳，不夸张。没有人声、说话、唱歌、口号、音乐、背景旋律或说明朗读。只有一次完整事件，不要重复。前0.2秒安静，随后发生动作，尾音自然衰减，剩余安静。'
SPECS={
 'mapFold':{'slug':'map-fold','title':'展开旧街地图','duration':1.8,'gain':.48,'cooldown':.18,'prompt':COMMON+'一张薄而柔软的旧纸地图被手轻轻展开，清楚但轻柔的一次纸张折痕和摩擦，动作1秒内结束。没有撕裂。'},
 'repairComplete':{'slug':'repair-complete','title':'旧物修好的轻响','duration':1.2,'gain':.5,'cooldown':.7,'prompt':COMMON+'老式收音机一个小小的塑料按钮轻轻扣到位，随后一颗细小温暖的玻璃音点，完整动作0.7秒，尾音很短。不用电子游戏升级音，不要风铃连响。'},
 'memoryCollect':{'slug':'memory-collect','title':'把旧照夹进手账','duration':1.5,'gain':.42,'cooldown':.8,'prompt':COMMON+'一张旧照片轻轻滑进厚纸相册，柔和纸张摩擦，接着一个细小木夹轻轻合上。亲密清晰，动作一秒内结束，无相机闪光声，无奖品音乐。'},
 'carDoorOpen':{'slug':'car-door-open','title':'拉开车门','duration':1.4,'gain':.48,'cooldown':.5,'prompt':COMMON+'从路边近处听一辆普通小轿车的车门把手轻轻拉起，金属门锁咔哒解开，门铰链轻轻转动。只有开门一次，无关门、警报、发动机和车辆驶过。'},
 'carDoorClose':{'slug':'car-door-close','title':'轻轻关上车门','duration':1.0,'gain':.42,'cooldown':.5,'prompt':COMMON+'普通小轿车车门克制地关上一次，柔软低沉的短闷响与锁扣声，不能像枪声、爆炸或巨大撞击。无开门、发动机、警报。'},
 'carStart':{'slug':'car-start','title':'钥匙转动，发动机醒来','duration':3.0,'gain':.36,'cooldown':1.5,'prompt':COMMON+'从车内听普通小轿车转动钥匙，一次很短启动马达带出温和低沉的发动机怠速，2秒后平稳，不加速、不轰鸣、不喇叭、不路噪。低频轻，适合安静街巷游戏。'},
 'bicycleFreewheel':{'slug':'bicycle-freewheel','title':'自行车轮的轻快空转','duration':1.8,'gain':.34,'cooldown':1,'prompt':COMMON+'自行车脚踏停下后后轮自由轮发出柔和细密的机械嗒嗒，逐渐慢下来，一次短促滑行，1.3秒后结束。没有铃声、车流、刹车尖叫。'},
 'chairSit':{'slug':'chair-sit','title':'在竹椅上坐稳','duration':1.5,'gain':.35,'cooldown':.7,'prompt':COMMON+'一个人很轻地坐在武汉老巷的结实竹椅上，竹条和榫接发出温柔短吱呀，随后衣服布料极轻摩擦。一次坐下，1秒内结束，无人声、脚步或椅子倒地。'},
 'ferryMooring':{'slug':'ferry-mooring','title':'小渡船轻轻离岸','duration':3,'gain':.36,'cooldown':1.5,'prompt':COMMON+'小渡船靠泊处解开粗绳，绳子在木头上柔和摩擦，船边水轻轻拍两下，随后一声很轻木质碰靠。只有近处细节，不要大船汽笛、发动机、海浪或人群。'},
 'breakfastStall':{'slug':'breakfast-stall','title':'过早铺的锅边烟火','duration':11,'gain':.4,'cooldown':0,'loop':True,'prompt':'生成12秒连续平稳的原创立体声纯环境音：武汉温暖小巷过早摊，从3米外听锅中食物轻微滋滋与偶尔小瓷碗轻放在木桌，声音稀疏安静柔和，油声不爆裂、不刺耳，无突发重击。绝对没有人声、叫卖、说话、唱歌、音乐、可辨歌词、汽车声。全段稳定连贯，头尾无静音无淡出，适合低音量自然循环。只输出环境拟音。'},
}
SPECS['breakfastStall'].update({'slug':'breakfast-stall-v2','prompt':'Create twelve seconds of clean stereo location sound, NO MUSIC and NO VOICES. The unmistakable close acoustic sizzle of batter frying gently on a warm flat iron griddle at a small breakfast food stall, like making doupi. A steady fine dry tssss frying texture fills the entire recording from the first sample to the last. Twice a small metal spatula very lightly touches the pan rim with a short soft ting. Warm, quiet, intimate everyday cooking foley. No water flowing, no dripping, no bubbles, no liquid pouring, no cloth rubbing, no wind, no crowd, no road noise, no fire roar. Low uniform intensity, no loud pops. Continuous subtle frying bed, do not fade out, do not add opening or closing silence. Suitable for a seamless quiet game ambience loop.'})
SPECS['ferryMooring'].update({'slug':'ferry-mooring-v2','prompt':'Create four seconds of original close-up wooden river boat foley, NO MUSIC and NO VOICES. Start with unmistakable gentle river water lapping against the wooden side of a small moored boat. At half a second, a short braided rope slides through a wooden cleat with a brief soft fibrous shhh and soft wood tap, while the light lapping water continues underneath. The rope movement happens ONLY ONCE and ends within one second. The gentle small water laps continue until three seconds then naturally settle. Clearly small water splashes and one short rope movement, no engines, no traffic, no gravel, no dragging heavy objects, no footsteps, no storm and no large sea waves. Quiet, warm, realistic details for a tranquil game.'})
SPECS.update({
 'bicycleBell':{'slug':'bicycle-bell','title':'自行车铃轻响一下','duration':1.25,'gain':.33,'cooldown':1,'prompt':COMMON+'一声老式自行车机械车铃，轻巧明亮但不尖利，叮铃一小下，铜质余音短短散开，只有按铃一次，无踩踏、刹车、车流。'},
 'carHorn':{'slug':'car-horn','title':'街巷里的短喇叭','duration':.9,'gain':.28,'cooldown':1.2,'prompt':COMMON+'一辆普通小轿车礼貌地轻按一次车喇叭，短短0.25秒，温和圆润低音而不是刺耳警报，不要重复、不持续、不恐吓。没有发动机、轮胎或交通噪声。'},
})
REUSE={
 'riverBreeze':{'slug':'river-breeze','title':'江边轻风','source':'public/media/cinema-v3-sfx-breeze-v2-pcm.wav','duration':11,'gain':.28,'cooldown':0,'loop':True},
 'riverWater':{'slug':'river-water','title':'栏外轻轻的水声','source':'public/media/cinema-v3-sfx-water-v2-pcm.wav','duration':11,'gain':.38,'cooldown':0,'loop':True},
}
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def run(args):return subprocess.run(args,check=True,capture_output=True)
def dump(path,value):voice.atomic_json(path,value)
def generated(ident,spec):
 raw=WORK/'sfx-raw'/f"{spec['slug']}.wav";raw.parent.mkdir(parents=True,exist_ok=True)
 prompt=ROOT/'media/prompts/town-audio-v1'/f"generated-{spec['slug']}-audio.txt";prompt.parent.mkdir(parents=True,exist_ok=True)
 if prompt.exists() and prompt.read_text()!=spec['prompt']:raise ValueError('Existing prompt changed; version the asset')
 prompt.write_text(spec['prompt'])
 if not raw.exists():
  name=f"town-audio-v1/generated-{spec['slug']}";PUBLIC.mkdir(parents=True,exist_ok=True)
  media.audio(name)
  shutil.move(str(ROOT/'public/media'/f'{name}.wav'),raw)
  (ROOT/'public/media'/f'{name}.mp3').unlink(missing_ok=True)
 record={'id':ident,'promptPath':str(prompt.relative_to(ROOT)),'requestSha256':hashlib.sha256(json.dumps({'prompt':spec['prompt']},sort_keys=True,ensure_ascii=False).encode()).hexdigest(),'rawPath':str(raw.relative_to(ROOT)),'rawSha256':sha(raw),'generatedAt':voice.read_json(raw.with_suffix('.json'),{}).get('generatedAt',voice.now()),'provider':'text_to_audio','model':'not exposed by endpoint'}
 dump(raw.with_suffix('.json'),record);print('RAW',ident,flush=True);return raw,record

def decode(path):
 result=run(['ffmpeg','-v','error','-i',str(path),'-ar',str(RATE),'-ac','2','-f','f32le','-']);pcm=array.array('f');pcm.frombytes(result.stdout);return pcm

def process(ident,spec,raw,source):
 pcm=decode(raw);frames=len(pcm)//2;length=frames/RATE;loop=spec.get('loop',False)
 if loop:
  # Keep a constant-energy circular overlap. Head/tail seam occupies the last
  # .65s; no silence or frame jump is introduced at the decoded buffer boundary.
  start=0;count=min(frames,int((spec['duration']+.65)*RATE));segment=pcm[:count*2];fade=int(.65*RATE);out=array.array('f',segment[fade*2:]);n=len(out)//2
  for i in range(fade):
   f=i/fade;a=math.cos(f*math.pi/2);b=math.sin(f*math.pi/2)
   for ch in range(2):out[(n-fade+i)*2+ch]=segment[(count-fade+i)*2+ch]*a+segment[i*2+ch]*b
 else:
  # Trim only the initial blank lead, then retain one bounded, faded event.
  threshold=10**(-48/20);block=240;first=0
  for p in range(0,len(pcm),block*2):
   chunk=pcm[p:p+block*2];rms=math.sqrt(sum(v*v for v in chunk)/max(1,len(chunk)))
   if rms>threshold:first=max(0,p//2-int(.06*RATE));break
  start=first/RATE;count=min(frames-first,int(spec['duration']*RATE));out=array.array('f',pcm[first*2:(first+count)*2]);fade=min(int(.05*RATE),count//4)
  for i in range(fade):
   for ch in range(2):out[i*2+ch]*=i/fade;out[(count-fade+i)*2+ch]*=(fade-i)/fade
 work=WORK/'sfx-processed'/f"{spec['slug']}.wav";work.parent.mkdir(parents=True,exist_ok=True)
 proc=subprocess.run(['ffmpeg','-y','-v','error','-f','f32le','-ar',str(RATE),'-ac','2','-i','pipe:0','-c:a','pcm_f32le',str(work)],input=out.tobytes(),capture_output=True,check=True)
 target=-29 if loop else -23
 analysis=run(['ffmpeg','-hide_banner','-i',str(work),'-af',f'loudnorm=I={target}:TP=-5:LRA=9:print_format=json','-f','null','-']);m=json.loads(re.findall(rb'\{\s*"input_i".*?\}',analysis.stderr,re.S)[-1])
 filt=f'loudnorm=I={target}:TP=-5:LRA=9:measured_I={m["input_i"]}:measured_TP={m["input_tp"]}:measured_LRA={m["input_lra"]}:measured_thresh={m["input_thresh"]}:offset={m["target_offset"]}:linear=true'
 dest=PUBLIC/'sfx'/f"{spec['slug']}.mp3";dest.parent.mkdir(parents=True,exist_ok=True)
 run(['ffmpeg','-y','-v','error','-i',str(work),'-af',filt,'-ar','48000','-ac','2','-c:a','libmp3lame','-b:a','128k','-map_metadata','-1',str(dest)])
 info=voice.probe(dest,decode=True);level=voice.measure_encoded_loudness(dest);final=decode(dest)
 peak=max(abs(v) for v in final);step=max(abs(final[ch]-final[-2+ch]) for ch in range(2));db=lambda v:round(20*math.log10(max(v,1e-12)),2)
 if level['truePeakDbtp']>-2:raise ValueError('Effect true peak exceeds headroom')
 return {'url':f"/media/town-audio-v1/sfx/{spec['slug']}.mp3",'title':spec['title'],'duration':round(len(final)/2/RATE,3),'bytes':dest.stat().st_size,'audioSha256':sha(dest),'gain':spec['gain'],'cooldown':int(spec['cooldown']*1000),'cooldownUnit':'ms','loop':loop,'loudness':level,'source':source,'processing':{'rawDuration':round(length,3),'sourceTrimStart':round(start,3),'circularCrossfadeSeconds':.65 if loop else 0,'edgeFadeSeconds':0 if loop else .05,'targetIntegratedLufs':target},'signal':{'samplePeakDbFS':db(peak),'loopBoundaryStepDbFS':db(step),'clippedSamples':sum(abs(x)>=1 for x in final)},'listeningStatus':'pending'}

def one(ident,spec):
 if ident in REUSE:
  raw=ROOT/spec['source'];source={'kind':'reuse-existing-generated-source','rawPath':spec['source'],'rawSha256':sha(raw)}
 else:raw,source=generated(ident,spec)
 return ident,process(ident,spec,raw,source)

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--ids');parser.add_argument('--workers',type=int,default=2);args=parser.parse_args();WORK.mkdir(parents=True,exist_ok=True)
 chosen={k:v for k,v in {**SPECS,**REUSE}.items() if not args.ids or k in args.ids.split(',')};existing=voice.read_json(WORK/'effects-manifest.json',{'effects':{}})
 try:
  with concurrent.futures.ThreadPoolExecutor(max_workers=min(4,args.workers)) as pool:
   for ident,record in pool.map(lambda pair:one(*pair),chosen.items()):
    existing['effects'][ident]=record;existing['updatedAt']=voice.now();dump(WORK/'effects-manifest.json',existing);print('SFX',ident,record['duration'],record['loudness'],flush=True)
 except Exception as exc:print(f'{type(exc).__name__}: SFX stage failed; request details omitted',file=sys.stderr);sys.exit(1)
