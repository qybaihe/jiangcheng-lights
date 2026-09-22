// Read-only encoding verification against the current recorded deployment.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {gunzipSync,brotliDecompressSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const release=path.join(root,'output/edgeone-release'),site=path.join(release,'site');
const output=path.resolve(root,process.env.EDGEONE_HTTP_QA_DIR??'output/qa/edgeone-release/http');
const deployment=JSON.parse(await fs.readFile(path.join(release,'deployment.json'),'utf8'));
const candidate=new URL(process.env.EDGEONE_HTTP_BASE_URL??deployment.publicUrl??deployment.deployment.previewUrl);
if(candidate.protocol!=='https:')throw Error('CDN verification requires HTTPS');
const origin=candidate.origin;
const report={checkedAt:new Date().toISOString(),origin,deploymentId:deployment.deployment.deploymentId,checks:[]};
await fs.mkdir(output,{recursive:true});
const bodyFile=path.join(output,'compression-body.tmp'),headerFile=path.join(output,'compression-headers.tmp');
try{
 for(const file of (await fs.readdir(path.join(site,'assets'))).filter(f=>/\.(js|css)$/.test(f)).sort()){
  const local=await fs.readFile(path.join(site,'assets',file));
  for(const accept of ['gzip','br, gzip','br']){
   execFileSync('curl',['-fsS','--max-time','90','-D',headerFile,'-o',bodyFile,'-H',`Accept-Encoding: ${accept}`,`${origin}/assets/${file}`]);
   const raw=await fs.readFile(bodyFile),headerText=await fs.readFile(headerFile,'utf8');
   const block=headerText.trim().split(/\r?\n\r?\n/).at(-1),lines=block.split(/\r?\n/);
   const status=Number(lines.shift().split(' ')[1]);
   const headers=Object.fromEntries(lines.filter(l=>l.includes(':')).map(l=>{const i=l.indexOf(':');return[l.slice(0,i).toLowerCase(),l.slice(i+1).trim()];}));
   const encoding=headers['content-encoding'];
   const decoded=encoding==='gzip'?gunzipSync(raw):encoding==='br'?brotliDecompressSync(raw):raw;
   const match=decoded.equals(local);
   report.checks.push({path:`/assets/${file}`,requestAcceptEncoding:accept,status,headers,
    wireBytes:raw.length,decodedBytes:decoded.length,decodedSha256:createHash('sha256').update(decoded).digest('hex'),
    matchesLocalArtifact:match,savedPercentVsIdentity:Number(((1-raw.length/local.length)*100).toFixed(2))});
   if(status!==200||!match)throw Error(`Encoding response mismatch: ${file}`);
  }
 }
 report.passed=true;
 report.observedEncodings=[...new Set(report.checks.map(c=>c.headers['content-encoding']??'identity'))];
 report.note='Cache-miss responses can be identity; repeat after edge encodings warm. This does not imply all edge locations are warm.';
}catch(error){report.passed=false;report.error=error.message;process.exitCode=1;}
finally{
 await fs.rm(bodyFile,{force:true});await fs.rm(headerFile,{force:true});
 await fs.writeFile(path.join(output,'compression.json'),JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,observedEncodings:report.observedEncodings}));
