#!/usr/bin/env node
/**
 * Stage a Vite build without offline drafts, raw media, prompts or credentials.
 * Input: --input dist  Output: --output output/edgeone-release/site
 * Output must not already exist. Sources and pre-existing deliverables stay intact.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const argv=process.argv.slice(2);
const option=(key,fallback)=>argv.includes(key)?argv[argv.indexOf(key)+1]:fallback;
const input=path.resolve(ROOT,option('--input','dist'));
const dest=path.resolve(ROOT,option('--output','output/edgeone-release/site'));
const reportDir=path.join(path.dirname(dest),'audit');
const entry=path.join(input,'index.html');
await fs.access(entry);
if(dest===input||dest.startsWith(input+path.sep)||[ROOT,path.join(ROOT,'public'),path.join(ROOT,'dist')].includes(dest))throw Error('Output must be a separate new release directory');
const result=spawnSync(process.execPath,[path.join(ROOT,'tools/edgeone-assets.mjs'),'--public',input,'--out',reportDir,'--stage',dest],{cwd:ROOT,encoding:'utf8'});
if(result.status!==0){process.stderr.write(result.stderr);process.exit(result.status||1);}
process.stdout.write(result.stdout);

// Vite's hashed entry chunks are the only build-only subdirectory we ship.
const bundle=[];
async function copyBundle(dir,relative='assets'){
  for(const ent of await fs.readdir(dir,{withFileTypes:true})){
    if(ent.isSymbolicLink())throw Error('Symlink in compiled bundle');
    const rel=relative+'/'+ent.name,full=path.join(dir,ent.name);
    if(ent.isDirectory()){await copyBundle(full,rel);continue;}
    if(!/\.(?:js|css|woff2?|png|jpe?g|webp|svg|avif)$/.test(ent.name))throw Error(`Unexpected bundle output: ${rel}`);
    const data=await fs.readFile(full);await fs.mkdir(path.dirname(path.join(dest,rel)),{recursive:true});await fs.copyFile(full,path.join(dest,rel));
    bundle.push({path:rel,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
  }
}
await copyBundle(path.join(input,'assets'));
await fs.copyFile(entry,path.join(dest,'index.html'));
const html=await fs.readFile(entry);
bundle.push({path:'index.html',bytes:html.length,sha256:createHash('sha256').update(html).digest('hex')});
const plan=JSON.parse(await fs.readFile(path.join(reportDir,'asset-plan.json'),'utf8'));
// Defense-in-depth: ensure the directory boundary and explicit allowlist held.
const forbidden=plan.files.filter(x=>/(^|\/)(?:\.env(?:\.|$)|request|prompts?|raw|\.git|node_modules)|\.(?:log|bak|map)$/.test(x.path));
if(forbidden.length)throw Error('Release allowlist contains an offline/private filename; inspect audit');
const report={version:1,createdAt:new Date().toISOString(),input:path.relative(ROOT,input),output:path.relative(ROOT,dest),assetPlan:path.relative(ROOT,path.join(reportDir,'asset-plan.json')),public:plan.runtime,bundle:{files:bundle.length,bytes:bundle.reduce((n,x)=>n+x.bytes,0)},totalFiles:plan.runtime.files+bundle.length,totalBytes:plan.runtime.bytes+bundle.reduce((n,x)=>n+x.bytes,0),compiledFiles:bundle,licenses:plan.files.filter(x=>/LICENSE|ATTRIBUTION|CREDITS/i.test(x.path)).map(x=>x.path),note:'A source-preserving staging pass. Any later compression/cache/header steps should regenerate final hashes.'};
await fs.writeFile(path.join(reportDir,'release-stage.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({output:dest,totalFiles:report.totalFiles,totalBytes:report.totalBytes,licenses:report.licenses},null,2));
