/** Official Makers SDK deployment. Credentials never enter the artifact or logs. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Makers} from '../output/edgeone-tooling/node_modules/@edgeone/makers-sdk/dist/index.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'output/edgeone-release'),site=path.join(out,'site');
const env=await fs.readFile(path.join(root,'.env.edgeone'),'utf8');
const token=process.env.EDGEONE_API_TOKEN??env.match(/^EDGEONE_API_TOKEN=(.+)$/m)?.[1]?.trim();
if(!token)throw Error('Missing local deployment credential');
// Opt-in diagnostics expose only official action names, status and elapsed time.
// Never log URLs, headers, request bodies or returned credential payloads.
if(process.env.EDGEONE_TRACE==='1'){
 const nativeFetch=globalThis.fetch;
 globalThis.fetch=async(input,options)=>{
  let action='transport';
  try{const candidate=typeof options?.body==='string'?JSON.parse(options.body).Action:null;if(/^[A-Za-z]+$/.test(candidate??''))action=candidate;}catch{}
  const started=Date.now();console.log(`API ${action} started`);
  try{const response=await nativeFetch(input,options);console.log(`API ${action} HTTP ${response.status} ${Date.now()-started}ms`);return response;}
  catch(error){console.log(`API ${action} network error ${Date.now()-started}ms`);throw error;}
 };
}
const sdk=new Makers({token,region:'china',timeout:120,retries:2});
const name='jiangcheng-lights';
const save=async(file,value)=>fs.writeFile(path.join(out,file),JSON.stringify(value,null,2)+'\n',{mode:0o600});
const action=process.argv[2]??'list';
try{
 const listed=await sdk.projects.list({name,pageSize:100});
 const exact=listed.items.find(p=>p.name===name);
 if(action==='list'){console.log(JSON.stringify({projects:listed.items,total:listed.total}));process.exit(0);}
 if(action!=='deploy'&&action!=='refresh')throw Error('Use list, deploy or refresh');
 let projectId=exact?.projectId;
 if(action==='refresh'){
  const previous=JSON.parse(await fs.readFile(path.join(out,'deployment.json'),'utf8'));
  const deployment=await sdk.deployments.wait({projectId:previous.project.projectId,deploymentId:previous.deployment.deploymentId,timeout:120,pollInterval:5});
  const result={...previous,checkedAt:new Date().toISOString(),deployment};await save('deployment.json',result);console.log(JSON.stringify(result));process.exit(0);
 }
 // Explicit static artifact boundary: no source, dotenv, symlinks or tool output.
 const files=[];
 async function walk(dir,base=''){
  for(const e of await fs.readdir(dir,{withFileTypes:true})){
   const relative=base+e.name,full=path.join(dir,e.name);
   if(e.isSymbolicLink()||e.name.startsWith('.')||/^(?:node_modules|src|tools|output|\.git)$/.test(e.name))throw Error('Forbidden artifact entry');
   if(e.isDirectory()){await walk(full,relative+'/');continue;}
   if(/\.(?:map|log|bak|tmp|env)$/.test(e.name))throw Error('Offline file in artifact');
   const bytes=await fs.readFile(full);
   if(bytes.length>=25_000_000)throw Error(`Asset exceeds 25 MB: ${relative}`);
   if(bytes.includes(Buffer.from(token)))throw Error('Credential detected in artifact');
   files.push({path:relative,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
  }
 }
 await walk(site);
 if(!files.some(f=>f.path==='index.html')||files.length>20000)throw Error('Invalid static artifact');
 const audit={checkedAt:new Date().toISOString(),files,bytes:files.reduce((n,f)=>n+f.bytes,0),count:files.length,credentialsIncluded:false};
 await save('audit/final-artifact.json',audit);
 if(!projectId){({projectId}=await sdk.projects.create({name,area:'overseas'}));await save('project-created.json',{projectId,name,area:'overseas',createdAt:new Date().toISOString()});}
 const startedAt=new Date().toISOString();let last=-1;
 const deployment=await sdk.deployments.deploy({projectId,artifact:{directory:site},env:'Production',wait:true,timeout:1200,pollInterval:8,
  onUploadProgress:e=>{const p=Math.floor(e.uploadedBytes/Math.max(1,e.totalBytes)*10);if(p!==last){last=p;console.log(`Upload ${p*10}%`);}},
  onStatusChange:e=>console.log(`Deployment ${e.deployment.status}`),
 });
 const project=await sdk.projects.get({projectId});
 const result={startedAt,completedAt:new Date().toISOString(),project,deployment,artifact:{files:audit.count,bytes:audit.bytes},sdk:'@edgeone/makers-sdk@0.1.0'};
 await save('deployment.json',result);
 if(deployment.status!=='Success')throw Error(`Deployment ended with ${deployment.status}`);
 console.log(JSON.stringify(result));
}catch(error){
 const message=String(error.message??'').split(token).join('[redacted]').replace(/Bearer\s+\S+/gi,'Bearer [redacted]');
 console.error(JSON.stringify({name:error.name,code:error.code??null,httpStatus:error.httpStatus??null,message}));process.exit(1);
}
