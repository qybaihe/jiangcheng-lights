import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const out=path.join(root,'output/demo-film-v1'),assets=path.join(here,'public/final');
fs.mkdirSync(assets,{recursive:true});
const input=JSON.parse(fs.readFileSync(path.join(root,'output/demo-film-final/edit-decision.json'),'utf8'));
const ledger=[];
const probe=p=>JSON.parse(execFileSync('/opt/homebrew/bin/ffprobe',['-v','error','-show_streams','-show_format','-of','json',p],{encoding:'utf8'}));
function copy(src,type){
 const abs=path.resolve(root,src),name=path.basename(path.dirname(abs))+'--'+path.basename(abs),target=path.join(assets,name);
 const bytes=fs.readFileSync(abs),sha256=crypto.createHash('sha256').update(bytes).digest('hex');
 const existing=ledger.find(x=>x.asset===`final/${name}`);
 if(existing&&existing.sha256!==sha256)throw Error(`Asset name collision: ${name}`);
 if(!existing){fs.copyFileSync(abs,target);ledger.push({source:abs,asset:`final/${name}`,sourceType:type,bytes:bytes.length,sha256});}
 return `final/${name}`;
}
const props={title:'江城有灯 · 这一趟，不只是送东西。',kind:'final',duration:118,readyForFinal:input.reviewed===true,gameAudio:true,shots:[],captions:input.captions,voice:[],sounds:[],music:copy(input.music,'API generated score; remixed continuous music bed'),effects:copy('public/media/cinema-v3-prologue-effects.mp3','generated environment stem'),logo:copy('public/media/game-logo-v1-transparent.webp','GPT Image 2 logo')};
let cursor=0;
for(const s of input.shots){
 if(Math.abs(s.from-cursor)>.00001)throw Error(`Timeline gap/overlap at ${s.id}: ${cursor}`);
 cursor=s.from+s.duration;
 if(s.type!=='evidence'&&s.type!=='keyframe'){
  const p=probe(path.resolve(root,s.src)),v=p.streams.find(x=>x.codec_type==='video');
  const end=(s.sourceIn??0)+s.duration*(s.playbackRate??1);
  if(end>Number(p.format.duration)+.07)throw Error(`Source overrun: ${s.id} ends ${end}, available ${p.format.duration}`);
  if(v.width<1920||v.height<1080)throw Error(`Not 1080P: ${s.id}`);
 }
 const type=s.type==='game'?'genuine native-tab capture; see capture manifest':s.type==='cg'?'Seedance generated CG; not gameplay':'GPT Image 2 still/production evidence';
 props.shots.push({...s,src:copy(s.src,type),...(s.secondary?{secondary:copy(s.secondary,'Seedance production sample, not gameplay')}:{} )});
}
if(Math.abs(cursor-118)>.00001)throw Error(`118 seconds required, got ${cursor}`);
for(const v of input.voice){const p=probe(path.resolve(root,v.src)),duration=Number(p.format.duration);if(Math.abs(v.duration-duration)>.10)throw Error(`Voice duration mismatch ${v.src}`);if(v.from+v.duration>118)throw Error('Voice overrun');props.voice.push({...v,src:copy(v.src,'API-generated promotional narration')});}
for(let i=0;i<props.voice.length-1;i++)if(props.voice[i].from+props.voice[i].duration>props.voice[i+1].from+.02)throw Error(`Narration overlaps at ${i}`);
for(const v of (input.sounds??[]))props.sounds.push({...v,src:copy(v.src,'existing API-generated SFX, editorial sound design')});
const stamp=t=>{const ms=Math.round(t*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;};
fs.writeFileSync(path.join(out,'final-props.json'),JSON.stringify(props,null,2)+'\n');
fs.writeFileSync(path.join(out,'final-asset-ledger.json'),JSON.stringify({duration:118,assets:ledger,editDecision:path.join(root,'output/demo-film-final/edit-decision.json'),timeline:props.shots.map(s=>({id:s.id,from:s.from,duration:s.duration,type:s.type,src:s.src,sourceIn:s.sourceIn??0,playbackRate:s.playbackRate??1})),sourceEvidence:input.evidence},null,2)+'\n');
fs.writeFileSync(path.join(out,'参赛片-旁白字幕.srt'),props.captions.map((c,i)=>`${i+1}\n${stamp(c.from)} --> ${stamp(c.from+c.duration)}\n${c.text}\n`).join('\n'));
fs.writeFileSync(path.join(out,'参赛片-操作说明.srt'),props.shots.filter(s=>s.type==='game').map((s,i)=>`${i+1}\n${stamp(s.from)} --> ${stamp(s.from+s.duration)}\n${s.title}｜${s.detail}\n`).join('\n'));
console.log(JSON.stringify({status:'prepared',seconds:118,gameplay:props.shots.filter(s=>s.type==='game').reduce((a,s)=>a+s.duration,0),shots:props.shots.length,voices:props.voice.length,assets:ledger.length,reviewed:props.readyForFinal}));
