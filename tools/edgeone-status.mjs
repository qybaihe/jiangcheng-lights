/** Read-only production inventory; records domain status, never credentials. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Makers} from '../output/edgeone-tooling/node_modules/@edgeone/makers-sdk/dist/index.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.resolve(root,process.argv[2]??'output/edgeone-release/status.json');
const env=await fs.readFile(path.join(root,'.env.edgeone'),'utf8');
const token=process.env.EDGEONE_API_TOKEN??env.match(/^EDGEONE_API_TOKEN=(.+)$/m)?.[1]?.trim();
if(!token)throw Error('Missing local deployment credential');
const projectId='makers-esms8yh8juk5';
let access=null;
// Public SDK normalizes away custom-domain fields. Observe only this explicit
// non-secret allowlist from its ordinary read-only project response.
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(input,options)=>{
  const response=await nativeFetch(input,options);
  let action;
  try{action=JSON.parse(options?.body??'{}').Action;}catch{}
  if(action==='DescribePagesProjects'&&response.ok){
    try{
      const body=await response.clone().json();
      const find=value=>{
        if(!value||typeof value!=='object')return;
        if(value.ProjectId===projectId&&Array.isArray(value.CustomDomains)){
          access={presetDomain:value.PresetDomain??null,isTld:value.IsTld??null,
            customDomains:value.CustomDomains.map(d=>({domain:d.Domain??null,status:d.Status??null,
              fields:Object.keys(d).sort(),
              ...Object.fromEntries(['Cname','CnameStatus','DomainStatus','CertStatus','HttpsStatus','Env']
                .filter(key=>d[key]!==undefined).map(key=>[key,d[key]]))}))};
        }
        for(const child of Object.values(value))if(child&&typeof child==='object')find(child);
      };
      find(body);
    }catch{}
  }
  return response;
};
try{
  const sdk=new Makers({token,region:'china',timeout:120,retries:2});
  const project=await sdk.projects.get({projectId});
  if(project.name!=='jiangcheng-lights')throw Error('Unexpected project identity');
  const deployments=await sdk.deployments.list({projectId,pageSize:20,order:{field:'createdOn',direction:'desc'}});
  const result={checkedAt:new Date().toISOString(),project,access,
    deployments:{...deployments,items:deployments.items.map(({previewUrl,...d})=>d)},
    note:'Read-only. Default signed preview links are temporary; only a verified custom domain is a permanent submission candidate.'};
  await fs.mkdir(path.dirname(output),{recursive:true});
  await fs.writeFile(output,JSON.stringify(result,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify(result,null,2));
}catch(error){
  console.error(JSON.stringify({name:error.name,code:error.code??null,httpStatus:error.httpStatus??null,
    message:String(error.message??'').split(token).join('[redacted]').replace(/Bearer\s+\S+/gi,'Bearer [redacted]')}));
  process.exitCode=1;
}
