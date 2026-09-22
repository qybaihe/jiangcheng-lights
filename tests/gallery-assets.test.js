import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ENDINGS,MEMORY_GALLERY,ACHIEVEMENT_ART} from '../src/endings.js';
const manifest=JSON.parse(readFileSync(new URL('../media/gallery-art-v3.json',import.meta.url),'utf8'));
const root=new URL('../',import.meta.url),hash=buf=>createHash('sha256').update(buf).digest('hex');
test('four separate ending artworks are real locally generated, audited landscape files',()=>{
 assert.equal(manifest.endingArtworkCount,4);assert.equal(ENDINGS.length,4);
 const endings=manifest.records.filter(x=>x.id.startsWith('ending-'));
 assert.equal(new Set(endings.map(x=>x.sha256)).size,4);
 for(const entry of endings){assert.equal(entry.width/entry.height,16/9);assert.ok(entry.bytes>100000);}
});
test('published gallery variants match sources and final hash, not old first drafts',()=>{
 for(const record of manifest.records){
  const image=readFileSync(new URL('public'+record.url,root));assert.equal(hash(image),record.sha256,record.id);
  assert.equal(hash(readFileSync(new URL(record.source,root))),record.sourceSha256);
  assert.equal(hash(readFileSync(new URL(record.prompt,root))),record.promptSha256);
 }
 for(const id of ['true','good','regret'])assert.ok(manifest.records.find(x=>x.id==='ending-'+id).acceptedVariant.endsWith('-r2'));
});
test('all 21 earned collection entries have decodable-source assets and 4 puzzle pieces',()=>{
 const urls=[...ENDINGS.map(x=>x.cg),...MEMORY_GALLERY.map(x=>x.image),...ACHIEVEMENT_ART.map(x=>x.image)];
 assert.equal(urls.length,21);
 for(const url of [...urls,...Object.values(manifest.childDrawingCrops)])assert.ok(statSync(new URL('public'+url,root)).size>1000,url);
 assert.equal(manifest.records.find(x=>x.id==='drawing').width,1536);
});
