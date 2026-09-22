import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {selectComposition,renderMedia,renderStill} from '@remotion/renderer';

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const out=path.join(root,'output/demo-film-v1'),mode=process.argv[2]??'proof';
const final=mode.startsWith('final'),propsFile=path.join(out,final?'final-props.json':'proof-props.json');
if(!fs.existsSync(propsFile))throw Error(`Missing reviewed timeline: ${propsFile}. No placeholder render is allowed.`);
const inputProps=JSON.parse(fs.readFileSync(propsFile,'utf8'));
if(inputProps.duration>120)throw Error('Competition duration exceeds 120 seconds.');
if(mode==='final'&&inputProps.readyForFinal!==true)throw Error('Final footage and audio require review before final delivery.');
for(const p of [...inputProps.shots.flatMap(s=>[s.src,s.secondary]),...inputProps.voice.map(s=>s.src),...(inputProps.sounds??[]).map(s=>s.src),inputProps.music,inputProps.effects,inputProps.logo].filter(Boolean)){
 if(!fs.existsSync(path.join(here,'public',p)))throw Error(`Missing asset: ${p}`);
}
const browserExecutable='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
fs.mkdirSync(path.join(out,'frames'),{recursive:true});
const serveUrl=await bundle({entryPoint:path.join(here,'src/index.tsx'),rootDir:here,publicDir:path.join(here,'public'),outDir:path.join(here,'build'),onProgress:p=>{if(p===100)console.log('Bundle ready');}});
const composition=await selectComposition({serveUrl,id:final?'CompetitionDemo':'StyleProof',inputProps,browserExecutable});
const common={serveUrl,composition,inputProps,browserExecutable,logLevel:'warn'};
for(const t of (final?[3,12,20,28,37,45,53,64,70,79,85,91,98,105,115]:[3,7,11,16,25])){
 await renderStill({...common,frame:Math.round(t*30),output:path.join(out,'frames',`${mode}-${String(t).padStart(3,'0')}s.png`),imageFormat:'png'});
}
if(mode==='stills'||mode==='final-stills'){console.log('Stills rendered; video not rendered.');process.exit(0);}
const target=path.join(out,final?'江城有灯-比赛Demo-1080p-v1-render.mp4':'江城有灯-30秒风格样片-1080p-v1.mp4');
let last=-1;
await renderMedia({...common,codec:'h264',crf:18,x264Preset:'medium',imageFormat:'png',colorSpace:'bt709',pixelFormat:'yuv420p',audioCodec:'aac',audioBitrate:'192k',sampleRate:48000,encodingMaxRate:'16M',encodingBufferSize:'32M',concurrency:3,enforceAudioTrack:true,outputLocation:target,onProgress:({progress})=>{const n=Math.floor(progress*10);if(n!==last){last=n;console.log(`Render ${n*10}%`);}},metadata:{title:final?'江城有灯 · 比赛 Demo':'江城有灯 · 30秒视听风格样片（非最终参赛片）'}});
fs.writeFileSync(path.join(out,`${mode}-render.json`),JSON.stringify({status:'rendered-not-yet-reviewed',output:target,composition:composition.id,width:composition.width,height:composition.height,fps:composition.fps,frames:composition.durationInFrames},null,2)+'\n');
console.log(target);
