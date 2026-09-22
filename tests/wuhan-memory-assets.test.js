import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {WUHAN_MEMORIES} from '../src/wuhan-memories.js';
const root=new URL('../',import.meta.url),hash=buffer=>createHash('sha256').update(buffer).digest('hex');
const file=relative=>new URL(relative,root);
function webpSize(buffer){
 assert.equal(buffer.toString('ascii',0,4),'RIFF');assert.equal(buffer.toString('ascii',8,12),'WEBP');
 for(let offset=12;offset+8<=buffer.length;){
  const type=buffer.toString('ascii',offset,offset+4),size=buffer.readUInt32LE(offset+4),at=offset+8;
  if(type==='VP8X')return {width:buffer.readUIntLE(at+4,3)+1,height:buffer.readUIntLE(at+7,3)+1};
  if(type==='VP8L'){assert.equal(buffer[at],0x2f);const bits=buffer.readUInt32LE(at+1);return {width:(bits&0x3fff)+1,height:((bits>>>14)&0x3fff)+1};}
  if(type==='VP8 ')return {width:buffer.readUInt16LE(at+6)&0x3fff,height:buffer.readUInt16LE(at+8)&0x3fff};
  offset=at+size+(size%2);
 }
 throw new Error('WEBP image has no supported dimensions');
}
test('all 44 independently generated Image2 memories are real landscape WEBPs with unique image bytes',()=>{
 const manifest=JSON.parse(readFileSync(file('media/wuhan-memory-art-v1-generated.json'),'utf8'));
 assert.equal(manifest.records.length,44);assert.equal(new Set(manifest.records.map(r=>r.id)).size,44);
 const hashes=[];
 for(const memory of WUHAN_MEMORIES){
  const record=manifest.records.find(r=>r.id===memory.id);assert.ok(record,memory.id);assert.equal(record.url,memory.image);assert.equal(record.model,'gpt-image-2');
  const image=readFileSync(file('public'+memory.image)),actualHash=hash(image),dimensions=webpSize(image);hashes.push(actualHash);
  assert.equal(actualHash,record.sha256,memory.id);assert.equal(image.length,record.bytes,memory.id);assert.ok(image.length>15000,memory.id);
  assert.deepEqual(dimensions,{width:record.width,height:record.height});assert.equal(record.width/record.height,16/9,memory.id);assert.ok(record.width>=1280&&record.height>=720,memory.id);
  assert.ok(record.original&&record.prompt,memory.id+' generation provenance');assert.ok(statSync(file(record.original)).size>15000);assert.ok(statSync(file(record.prompt)).size>200);
  assert.equal(hash(readFileSync(file(record.original))),record.originalSHA256,memory.id+' immutable original');assert.equal(hash(readFileSync(file(record.prompt))),record.promptSHA256,memory.id+' authored prompt');
 }
 assert.equal(new Set(hashes).size,44,'distinct filenames must not mask reused image content');
});
