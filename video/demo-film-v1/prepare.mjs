import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..'),out=path.join(root,'output/demo-film-v1');
const [capture,keyframe,voiceA,voiceB]=process.argv.slice(2).map(p=>p&&path.resolve(p));
if(!capture||!keyframe||!voiceA||!voiceB)throw Error('Usage: node prepare.mjs CAPTURE_1080P KEYFRAME VOICE_A VOICE_B');
const probe=p=>JSON.parse(execFileSync('/opt/homebrew/bin/ffprobe',['-v','error','-show_streams','-show_format','-of','json',p],{encoding:'utf8'}));
const cap=probe(capture),v=cap.streams.find(s=>s.codec_type==='video');
if(v.width<1920||v.height<1080||Number(cap.format.duration)<12)throw Error('Capture must be genuine >=1920x1080 and >=12 seconds. No hidden upscale/freeze.');
const assets=path.join(here,'public/assets');fs.mkdirSync(assets,{recursive:true});
const ledger=[];
function copy(p,name,type){
 const data=fs.readFileSync(p),sha256=crypto.createHash('sha256').update(data).digest('hex');
 fs.writeFileSync(path.join(assets,name),data);
 ledger.push({source:path.relative(root,p),asset:`assets/${name}`,sourceType:type,bytes:data.length,sha256});
 return `assets/${name}`;
}
const prologue=copy(path.join(root,'public/media/cinema-upscale-v1/prologue-1080p.mp4'),'prologue-1080p.mp4','Seedance CG; Real-ESRGAN upscaled 720p to 1080p');
const game=copy(capture,'navigation-capture.mp4','current-build real game capture; checkpoint fixture documented in capture report');
const tail=copy(keyframe,`closing-keyframe${path.extname(keyframe)}`,'Image2 promotional keyframe; not animated CG or gameplay');
const a=copy(voiceA,'narration-opening.wav','new API-generated promotional narration');
const b=copy(voiceB,'narration-ending.wav','new API-generated promotional narration');
const errandPath=path.join(root,'public/media/opening-narration-v1/opening-errand.mp3');
const errand=copy(errandPath,'narration-errand.mp3','existing approved API narration, unchanged');
const music=copy(path.join(root,'public/media/audio/bgm-ending.mp3'),'bgm-ending.mp3','existing approved API-generated score');
const effects=copy(path.join(root,'public/media/cinema-v3-prologue-effects.mp3'),'prologue-effects.mp3','existing cinematic environment stem');
const logo=copy(path.join(root,'public/media/game-logo-v1-transparent.webp'),'game-logo.webp','existing approved Image2 game logo');
const durations=[voiceA,errandPath,voiceB].map(p=>Number(probe(p).format.duration));
if(durations[0]>6||durations[1]>9||durations[2]>6)throw Error('Voice exceeds reserved slot; review pacing instead of truncating words.');
const plan={title:'江城有灯',kind:'proof',duration:30,gameAudio:cap.streams.some(s=>s.codec_type==='audio'),music,effects,logo,
 shots:[
  {id:'P01-wuhan-river',type:'cg',from:0,duration:5,src:prologue,sourceIn:0,title:'汉口江岸 · 返程'},
  {id:'P02-return-to-the-alley',type:'cg',from:5,duration:3,src:prologue,sourceIn:14.625,title:'晴川里 · 一条虚构的老巷'},
  {id:'R01-find-granny',type:'game',from:8,duration:12,src:game,sourceIn:0,title:'前往林婆婆的小院',detail:'打开地图 · 选择目标 · 按指引前往'},
  {id:'K01-leave-a-light',type:'keyframe',from:20,duration:10,src:tail}
 ],
 captions:[
  {from:.6,duration:durations[0],text:'本来，只打算在武汉住一晚。',who:'旁白'},
  {from:8.6,duration:durations[1],text:'外公在姨妈家休养，托阿遥回来，给街坊送几件东西。',who:'旁白'},
  {from:22,duration:durations[2],text:'总有人，替你留一盏灯。',who:'旁白',presentation:'title'}
 ],
 voice:[{from:.6,duration:durations[0],src:a},{from:8.6,duration:durations[1],src:errand},{from:22,duration:durations[2],src:b}],
 annotations:[
  {from:8,duration:2.807,text:'把修好的收音机，送回林婆婆家',detail:'沿主巷步行'},
  {from:10.807,duration:1.442,text:'地图：林婆婆的小院',detail:'点选目的地'},
  {from:12.249,duration:7.751,text:'跟着光点，前往林婆婆的小院',detail:'点击「走到这里」· 沿路自动前往'}
 ]
};
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'proof-props.json'),JSON.stringify(plan,null,2)+'\n');
fs.writeFileSync(path.join(here,'src/proof-props.json'),JSON.stringify(plan,null,2)+'\n');
fs.writeFileSync(path.join(out,'proof-asset-ledger.json'),JSON.stringify({kind:'style-proof-not-final',captureProbe:cap,assets:ledger},null,2)+'\n');
const stamp=t=>{let ms=Math.round(t*1000);const h=Math.floor(ms/3600000);ms%=3600000;const m=Math.floor(ms/60000);ms%=60000;const s=Math.floor(ms/1000);return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;};
fs.writeFileSync(path.join(out,'风格样片-旁白.srt'),plan.captions.map((c,i)=>`${i+1}\n${stamp(c.from)} --> ${stamp(c.from+c.duration)}\n${c.text}\n`).join('\n'));
console.log(JSON.stringify({status:'prepared',kind:plan.kind,duration:30,realGameplaySeconds:12,assets:ledger.length,voiceDurations:durations}));
