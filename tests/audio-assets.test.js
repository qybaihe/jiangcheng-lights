import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DIALOGUES,EXTRA_DIALOGUES} from '../src/story.js';
import {voiceClipFor} from '../src/audio-director.js';

import {ENDING_DIALOGUES} from '../src/ending-v3-data.js';

const read=name=>JSON.parse(readFileSync(new URL(`../public/media/${name}`,import.meta.url),'utf8'));
const voice=read('story-voice-manifest.json'),music=read('story-music-manifest.json');
const localFile=url=>{
 assert.ok(url.startsWith('/media/'));
 const path=new URL(`../public${url}`,import.meta.url);assert.ok(statSync(path).size>1000,url);return path;
};

test('every authored line has matching, decoded, local speech for either protagonist',()=>{
 const lines=Object.values({...DIALOGUES,...EXTRA_DIALOGUES,...ENDING_DIALOGUES}).flat().filter(line=>!line.silent&&line.kind!=='action');
 assert.equal(Object.keys(voice.lines).length,lines.length);
 let files=0;
 for(const line of lines){
  const entry=voice.lines[line.id];assert.ok(entry,line.id);
  assert.equal(entry.text,line.text);assert.equal(entry.sha256,createHash('sha256').update(line.text).digest('hex'));
  for(const gender of ['female','male'])assert.ok(voiceClipFor(voice,line,gender),`${line.id}/${gender}`);
  if(line.who==='阿遥'){assert.ok(entry.variants.female&&entry.variants.male);assert.notEqual(entry.variants.female.voiceId,entry.variants.male.voiceId);}
  for(const clip of Object.values(entry.variants)){
   const file=localFile(clip.url);assert.ok(Number.isFinite(clip.duration)&&clip.duration>.2);assert.ok(clip.voiceId.startsWith('zh-CN-'));
   assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),clip.audioSha256,clip.url);files++;
  }
 }
 assert.equal(files,233);
});

test('all three independent music cues and authored effects ship locally',()=>{
 assert.deepEqual(Object.keys(music.tracks).sort(),['ending','explore','memory']);
 assert.equal(new Set(Object.values(music.tracks).map(track=>track.source.sourceSha256)).size,3);
 for(const [id,track] of Object.entries(music.tracks)){
  localFile(track.url);localFile(track.fallbackUrl);assert.ok(track.duration>=60,id);assert.equal(track.loop,true);
  assert.equal(track.source.kind,'api-generated');assert.ok(track.source.generatedDuration>=60);
  assert.ok(track.loudness.truePeakDbTP<=-1.5,id);
 }
 for(const id of ['page','radio','rain']){const effect=music.sfx[id];assert.ok(effect,id);localFile(effect.url);assert.ok(effect.duration>0);}
});
