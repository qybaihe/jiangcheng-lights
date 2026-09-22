#!/usr/bin/env node
/**
 * Read-only source audit / explicit public-asset staging for EdgeOne.
 * Never edits public/, src/, dist/, existing videos, credentials or save data.
 * node tools/edgeone-assets.mjs [--public public] [--out output/edgeone-assets] [--stage NEW_DIRECTORY]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const argv=process.argv.slice(2);
function option(name,fallback){const i=argv.indexOf(name);return i<0?fallback:argv[i+1];}
const PUBLIC=path.resolve(ROOT,option('--public','public'));
const OUT=path.resolve(ROOT,option('--out','output/edgeone-assets'));
const STAGE=option('--stage',null);
const sha=b=>createHash('sha256').update(b).digest('hex');
const localUrl=s=>typeof s==='string'&&/^\/(media|models|textures)\/[\w./-]+\.[\w]+$/.test(s)&&!s.includes('..');
const bytes=s=>Buffer.byteLength(s);
const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>value?.[k]!==undefined).map(k=>[k,value[k]]));
async function walk(dir){const out=[];for(const entry of await fs.readdir(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isSymbolicLink())throw Error(`Symlink not permitted: ${path.relative(ROOT,full)}`);if(entry.isDirectory())out.push(...await walk(full));else if(entry.isFile())out.push(full);}return out;}
const readJSON=async name=>JSON.parse(await fs.readFile(path.join(PUBLIC,name),'utf8'));
const inventory=await Promise.all((await walk(PUBLIC)).map(async full=>({path:path.relative(PUBLIC,full).split(path.sep).join('/'),bytes:(await fs.stat(full)).size})));
const all=new Map(inventory.map(x=>[x.path,x]));
const required=new Map();
function add(url,reason){const rel=url.replace(/^\//,'');if(!all.has(rel))throw Error(`Required public asset missing: ${rel} (${reason})`);if(!required.has(rel))required.set(rel,new Set());required.get(rel).add(reason);}
function collect(value,reason){if(localUrl(value))add(value,reason);else if(Array.isArray(value))value.forEach(x=>collect(x,reason));else if(value&&typeof value==='object')Object.values(value).forEach(x=>collect(x,reason));}

// Full literal paths in application JS/CSS and the HTML entry.
const sources=[path.join(ROOT,'index.html'),...(await walk(path.join(ROOT,'src'))).filter(p=>/\.(js|css)$/.test(p))];
for(const full of sources){const text=await fs.readFile(full,'utf8');for(const hit of text.matchAll(/\/(?:media|models|textures)\/[^'"`\s)<>]+/g)){if(localUrl(hit[0]))add(hit[0],path.relative(ROOT,full));}}
for(const name of ['site.webmanifest','favicon.ico'])add('/'+name,'web entry / browser fallback');

// Evaluate authored, side-effect-free data catalogs to resolve template paths.
for(const name of ['avatar-catalog.js','resident-avatar-catalog.js','wuhan-memories.js','endings.js','story-art.js']){
  const mod=await import(pathToFileURL(path.join(ROOT,'src',name)));
  collect(mod,'computed catalog '+name);
  if(name==='story-art.js')for(const person of mod.STORY_PEOPLE)for(const gender of ['female','male']){
    add(mod.personPortrait(person.id,gender),'character portrait');
    add(mod.personHeadshot(person.id,gender),'character headshot');
  }
}
// Dynamic paths are intentionally bounded by their authored finite domains.
for(const name of ['arrival','granny','chef','dock','ending'])add(`/media/${name}.webp`,'main storyArt dynamic map');
const memorySource=await fs.readFile(path.join(ROOT,'src/ui/memory-game.js'),'utf8');
const pieces=memorySource.match(/DRAWING_PIECES=Object\.freeze\(\[([^\]]+)\]\)/)?.[1].match(/'([^']+)'/g)?.map(s=>s.slice(1,-1));
if(!pieces?.length)throw Error('Review drawing-piece parser for changed source');
for(const id of pieces)add(`/media/child-drawing-${id}.webp`,'drawing game dynamic pieces');
// Surface helper combines material names + suffixes. Keep all 24 material maps.
for(const entry of inventory.filter(x=>x.path.startsWith('textures/')))add('/'+entry.path,'bounded texture surface family');
// Keep legal notices even when only linked indirectly from the main notice.
for(const entry of inventory.filter(x=>/LICENSE|ATTRIBUTION|CREDITS/i.test(x.path)))add('/'+entry.path,'third-party attribution');

// Public runtime contracts, not offline generation manifests or review evidence.
const overrides=new Map();
function runtimeJSON(name,value){const body=JSON.stringify(value);overrides.set(name,body);add('/'+name,'runtime manifest');collect(value,'runtime manifest '+name);}
const cinema=await readJSON('media/cinema-v3-manifest.json');
runtimeJSON('media/cinema-v3-manifest.json',{
  version:cinema.version,revision:cinema.revision,
  scenes:Object.fromEntries(Object.entries(cinema.scenes).map(([id,s])=>[id,{
    ...pick(s,['id','title','url','poster','duration','resolution','fps','stems','defaultPlaybackRate','voiceDucking']),
    cues:typeof s.cues==='string'?s.cues:s.cues.map(c=>pick(c,['start','end','text','who']))
  }]))
});
const clip=c=>pick(c,['url','fallbackUrl','duration','voiceId','title','loop','gain','cooldown']);
const lines=value=>Object.fromEntries(Object.entries(value??{}).map(([id,line])=>[id,{text:line.text,variants:Object.fromEntries(Object.entries(line.variants).map(([variant,c])=>[variant,clip(c)]))}]));
const voice=await readJSON('media/story-voice-manifest.json');
runtimeJSON('media/story-voice-manifest.json',{version:voice.version,storyVersion:voice.storyVersion,lines:lines(voice.lines)});
const town=await readJSON('media/town-audio-v1/manifest.json');
runtimeJSON('media/town-audio-v1/manifest.json',{version:town.version,lines:lines(town.lines),effects:Object.fromEntries(Object.entries(town.effects).map(([id,c])=>[id,clip(c)]))});
const music=await readJSON('media/story-music-manifest.json');
runtimeJSON('media/story-music-manifest.json',{version:music.version,tracks:Object.fromEntries(Object.entries(music.tracks).map(([id,c])=>[id,clip(c)])),sfx:Object.fromEntries(Object.entries(music.sfx).map(([id,c])=>[id,clip(c)]))});
collect(await readJSON('site.webmanifest'),'web manifest icons');

const risks=[];
function inspect(v,file,pointer=''){
  if(Array.isArray(v))v.forEach((x,i)=>inspect(x,file,pointer+'/'+i));
  else if(v&&typeof v==='object')for(const[k,x]of Object.entries(v)){
    if(/^(?:token|api.?key|secret|password|authorization)$/i.test(k)&&x)risks.push({file,pointer:pointer+'/'+k,kind:'sensitive-key'});
    inspect(x,file,pointer+'/'+k);
  }else if(typeof v==='string'){
    if(/(?:\/Users\/|\/home\/|[A-Z]:\\)/.test(v))risks.push({file,pointer,kind:'local-absolute-path'});
    if(/https?:\/\//.test(v))risks.push({file,pointer,kind:'remote-url-review'});
    if(/(?:Bearer\s+|[?&](?:token|key|auth|signature|X-Amz-[^=]+)=)/i.test(v))risks.push({file,pointer,kind:'credential-like-string'});
    if(/^(?:output|tools|tmp|media)\//.test(v)&&/(?:request|prompt|\.env|review|raw)/i.test(v))risks.push({file,pointer,kind:'offline-provenance-only'});
  }
}
for(const entry of inventory.filter(x=>/\.(json|webmanifest)$/.test(x.path)))inspect(await readJSON(entry.path),entry.path);
const selected=[];
for(const[rel,reasons]of [...required].sort(([a],[b])=>a.localeCompare(b))){const data=overrides.has(rel)?Buffer.from(overrides.get(rel)):await fs.readFile(path.join(PUBLIC,rel));selected.push({...all.get(rel),publishBytes:data.length,sha256:sha(data),transformed:overrides.has(rel),reasons:[...reasons]});}
const excluded=inventory.filter(x=>!required.has(x.path)).sort((a,b)=>b.bytes-a.bytes);
const sum=(a,k='bytes')=>a.reduce((n,x)=>n+x[k],0);
const report={version:1,generatedAt:new Date().toISOString(),sourcePublic:path.relative(ROOT,PUBLIC),scope:'all gameplay, both avatars, residents, 4 endings, gallery, CG and sound; source audit, not network coverage proof',source:{files:inventory.length,bytes:sum(inventory)},runtime:{files:selected.length,bytes:sum(selected,'publishBytes')},savingsBytes:sum(inventory)-sum(selected,'publishBytes'),security:{credentialMaterialIncluded:false,findings:risks,note:'Findings contain only file paths and JSON pointers, never values. Offline provenance omitted from staged runtime manifests.'},over25MiB:selected.filter(x=>x.publishBytes>25*1024*1024).map(x=>({path:x.path,bytes:x.publishBytes})),files:selected,excluded};
await fs.mkdir(OUT,{recursive:true});
await fs.writeFile(path.join(OUT,'asset-plan.json'),JSON.stringify(report,null,2));
await fs.writeFile(path.join(OUT,'public-files.txt'),selected.map(x=>x.path).join('\n')+'\n');
await fs.writeFile(path.join(OUT,'excluded-files.txt'),excluded.map(x=>`${x.bytes}\t${x.path}`).join('\n')+'\n');
await fs.mkdir(path.join(OUT,'runtime-manifests'),{recursive:true});
for(const[rel,body]of overrides){const to=path.join(OUT,'runtime-manifests',rel);await fs.mkdir(path.dirname(to),{recursive:true});await fs.writeFile(to,body);}
if(STAGE){
  const dest=path.resolve(ROOT,STAGE);
  if(dest===PUBLIC||dest.startsWith(PUBLIC+path.sep)||dest===path.join(ROOT,'dist'))throw Error('Refusing to alter a source/production asset directory');
  try{await fs.access(dest);throw Error('Stage directory already exists; choose a new empty destination');}catch(e){if(e.code!=='ENOENT')throw e;}
  await fs.mkdir(dest,{recursive:true});
  for(const entry of selected){const to=path.join(dest,entry.path);await fs.mkdir(path.dirname(to),{recursive:true});if(overrides.has(entry.path))await fs.writeFile(to,overrides.get(entry.path));else await fs.copyFile(path.join(PUBLIC,entry.path),to);}
}
console.log(JSON.stringify({source:report.source,runtime:report.runtime,savingsBytes:report.savingsBytes,over25MiB:report.over25MiB,securityFindings:risks.reduce((out,x)=>(out[x.kind]=(out[x.kind]||0)+1,out),{}),report:path.relative(ROOT,path.join(OUT,'asset-plan.json')),staged:STAGE},null,2));
