import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,statSync} from 'node:fs';
import {DIALOGUES} from '../src/story.js';
import {cinemaCues,cinemaAsset} from '../src/cinema-player.js';
const path=new URL('../public/media/cinema-v3-manifest.json',import.meta.url);
const available=existsSync(path),manifest=available?JSON.parse(readFileSync(path,'utf8')):null;
const local=(url,minSize=1000)=>{assert.ok(cinemaAsset(url),url);const p=new URL(`../public${url}`,import.meta.url);assert.ok(statSync(p).size>=minSize,url);return p;};
const cuesFor=scene=>{if(!scene.cues)return [];if(Array.isArray(scene.cues))return cinemaCues(scene.cues);const value=JSON.parse(readFileSync(local(scene.cues,1),'utf8'));return cinemaCues(Array.isArray(value)?value:value.cues);};
test('five final chapter movies and independent stems are shipped locally',{skip:!available},()=>{
 assert.equal(manifest.version,3);
 for(const id of ['prologue','granny','chef','dock','ending']){
  const scene=manifest.scenes[id];assert.ok(scene,id);local(scene.url);assert.ok(Number.isFinite(scene.duration)&&scene.duration>=20,`${id} has a complete-event runtime`);
  for(const channel of ['music','effects'])local(scene.stems[channel]);
  if(id!=='prologue')local(cinemaAsset(scene.stems.voice));
  for(const cue of cuesFor(scene))assert.ok(cue.end<=scene.duration+.08,`${id}/${cue.lineId??cue.id} fits inside the film`);
 }
});
test('every approved past-tense line appears once, verbatim, in its chapter timeline',{skip:!available},()=>{
 for(const [movie,key]of Object.entries({granny:'grannyMemory',chef:'chefMemory',dock:'dock',ending:'ending'})){
  const expected=DIALOGUES[key].filter(line=>line.time==='memory'),cues=cuesFor(manifest.scenes[movie]);
  assert.deepEqual(cues.map(c=>c.lineId??c.id),expected.map(l=>l.id),movie);
  for(let i=0;i<cues.length;i++){assert.equal(cues[i].text,expected[i].text);assert.equal(cues[i].who,expected[i].who);if(i)assert.ok(cues[i].start>=cues[i-1].end-.01,`${movie}: intelligible sequential dialogue`);}
 }
});
