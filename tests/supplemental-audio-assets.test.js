import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,statSync} from 'node:fs';import {createHash} from 'node:crypto';
import {SUPPLEMENTAL_AUDIO_LINES} from '../src/supplemental-audio-lines.js';
const publicRoot=new URL('../public/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('media/town-audio-v1/manifest.json',publicRoot),'utf8'));
const sha=data=>createHash('sha256').update(data).digest('hex');
const asset=url=>{assert.match(url,/^\/media\/town-audio-v1\/(voice|sfx)\/[a-z0-9.-]+\.mp3$/);return new URL(url.slice(1),publicRoot);};
test('all 179 exact supplemental lines ship 194 complete local voice files and retain role profiles',()=>{
 assert.equal(manifest.coverage.expectedLines,179);assert.equal(manifest.coverage.availableLines,179);assert.equal(manifest.coverage.availableVariants,194);
 for(const line of SUPPLEMENTAL_AUDIO_LINES){const entry=manifest.lines[line.id];assert.ok(entry,line.id);assert.equal(entry.text,line.text);assert.equal(entry.speaker,line.who);assert.equal(entry.sha256,sha(line.text));assert.deepEqual(Object.keys(entry.variants).sort(),line.profileId==='hero'?['female','male']:['default']);
 for(const[variant,clip]of Object.entries(entry.variants)){const file=asset(clip.url),profile=manifest.voices[clip.profileId];assert.equal(statSync(file).size,clip.bytes);assert.equal(sha(readFileSync(file)),clip.audioSha256);assert.ok(clip.duration>.25&&clip.duration<150);assert.equal(clip.voiceId,profile.voiceId);assert.equal(clip.rate,profile.rate);assert.equal(clip.pitch,profile.pitch);assert.ok(clip.loudness.truePeakDbtp<=-2);assert.ok(Math.abs(clip.loudness.integratedLufs+19)<=2.5);if(line.profileId!=='hero')assert.equal(clip.profileId,line.profileId);}}
});
test('fourteen distinct quiet SFX ship with millisecond cooldown and only three ambient loops',()=>{
 const expected=['map-fold','ui-confirm','collect','car-door-open','car-door-close','engine','bicycle-freewheel','chair-sit','ferry','breakfast','breeze','water','bicycle-bell','car-horn'];assert.deepEqual(Object.keys(manifest.effects).sort(),expected.sort());
 for(const[id,clip]of Object.entries(manifest.effects)){const file=asset(clip.url);assert.equal(sha(readFileSync(file)),clip.audioSha256);assert.equal(statSync(file).size,clip.bytes);assert.ok(clip.gain>0&&clip.gain<=1);assert.equal(clip.cooldownUnit,'ms');assert.equal(Number.isInteger(clip.cooldown),true);assert.equal(clip.loop,['breakfast','breeze','water'].includes(id));assert.ok(clip.loop?clip.cooldown===0:clip.cooldown>=180);assert.equal(clip.signal.clippedSamples,0);assert.ok(clip.loudness.truePeakDbtp<=-2);assert.ok(clip.loop?clip.duration>=8:clip.duration<=3);}
 for(const existing of['page','radio','rain'])assert.equal(manifest.effects[existing],undefined);
});
