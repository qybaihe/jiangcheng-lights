import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../public/',import.meta.url);
const read=url=>readFileSync(new URL(url.replace(/^\//,''),root));
const manifest=JSON.parse(read('/media/cinema-v3-manifest.json'));
const narration=JSON.parse(read('/media/opening-narration-v1/manifest.json'));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');

test('the background narration stays separate from approved character dialogue and inside the existing film',()=>{
 const scene=manifest.scenes.prologue;
 assert.equal(scene.defaultPlaybackRate,1.15);assert.equal(scene.voiceDucking,true);
 assert.equal(scene.stems.voice,narration.stems.voice);assert.deepEqual(scene.cues,narration.cues);
 assert.equal(scene.cues.length,3);assert.equal(scene.duration,29.25);
 let previousEnd=0;
 for(const cue of scene.cues){
  assert.equal(cue.who,'旁白');assert.ok(cue.start>=previousEnd&&cue.end<=scene.duration);previousEnd=cue.end;
  assert.equal(digest(read(cue.audioUrl)),cue.audioSha256);
 }
 assert.ok(previousEnd<24.25,'the door-lock shot retains its quiet ending');
 assert.equal(digest(read(scene.stems.voice)),scene.qa.stems.voice.sha256);
 assert.ok(scene.qa.stems.voice.samplePeak>0,'the new narration is not the old silent stem');
 assert.equal(digest(read(scene.narrationManifest)),scene.qa.sourceVoiceManifestSha256);
});
test('all five shipped chapter masters use reviewed 1080p AI outputs while retaining source clocks',()=>{
 for(const id of ['prologue','granny','chef','dock','ending']){
  const scene=manifest.scenes[id];assert.equal(scene.resolution,'1920x1080',id);
  assert.equal(scene.upscale.model,'realesr-animevideov3',id);assert.equal(scene.upscale.modelScale,2);
  assert.equal(scene.upscale.frameCount,Math.round(scene.duration*scene.fps));assert.equal(scene.upscale.sourceUnchanged,true);
  assert.equal(digest(read(scene.url)),scene.silentSha256,id+' silent master');
  assert.equal(digest(read(scene.previewUrl)),scene.previewSha256,id+' mixed preview');
  assert.ok(existsSync(new URL(scene.poster.replace(/^\//,''),root)));
  for(const license of scene.upscale.licenseFiles)assert.ok(existsSync(new URL(license.replace(/^\//,''),root)));
 }
});
