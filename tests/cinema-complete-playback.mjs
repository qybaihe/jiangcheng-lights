import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';

// This complements transport-control tests: no seeking, skipping, stubbing,
// playback-rate change, or synthetic completion is permitted in this run.
const base = process.env.GAME_URL || 'http://127.0.0.1:4198';
const manifest = JSON.parse(await readFile(new URL('../public/media/cinema-v3-manifest.json', import.meta.url), 'utf8'));
const out = new URL('../output/qa/story-v3/complete-playback/', import.meta.url);
await mkdir(out, {recursive: true});
const report = {scope: 'Five published chapters played naturally from beginning through onComplete, at normal speed, with real media and independent stems', checks: [], errors: [], failedRequests: []};
const browser = await chromium.launch({headless: true, channel: 'chrome'});
const context = await browser.newContext({viewport: {width: 1280, height: 720}});
const page = await context.newPage();
page.on('pageerror', error => report.errors.push(error.message));
page.on('response', response => {if (response.status() >= 400) report.failedRequests.push({url: response.url(), status: response.status()});});
await page.route('**/__cinema-complete*', route => route.fulfill({contentType: 'text/html', body: `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%}#root{position:absolute;inset:0}#begin{position:relative;z-index:3}</style><button id="begin">播放章节</button><div id="root"></div><script type="module">
import {mountCinema} from '/src/cinema-player.js';
import '/src/ui/cinema-player.css';
let prefs={sound:true,musicVolume:.48,effectsVolume:.6,voiceVolume:.9};
window.result={finished:false,completeCount:0,samples:[],captions:[]};
document.querySelector('#begin').onclick=()=>{
 document.querySelector('#begin').hidden=true;
 window.player=mountCinema(document.querySelector('#root'),{id:new URL(location.href).searchParams.get('id'),getPreferences:()=>prefs,onComplete:()=>{result.completeCount++;result.finished=true;clearInterval(window.monitor)},onSkip:()=>result.finished='skipped',onClose:()=>result.finished='closed',onFallback:()=>result.finished='fallback'});
 window.monitor=setInterval(()=>{
  const d=player.diagnostics();
  if(!d.loaded)return;
  const v=document.querySelector('video');
  result.samples.push({...d,wall:performance.now(),readyState:v.readyState});
  const caption=document.querySelector('#cinema-caption').textContent;
  if(caption&&!result.captions.includes(caption))result.captions.push(caption);
 },100);
};
</script>`}));
try {
 for (const [id, scene] of Object.entries(manifest.scenes)) {
  await page.goto(`${base}/__cinema-complete?id=${id}`);
  const started = Date.now();
  await page.locator('#begin').click();
  await page.waitForFunction(() => window.result.finished, null, {timeout: (scene.duration + 45) * 1000, polling: 100});
  const result = await page.evaluate(() => ({...window.result, cleanup: [...document.querySelectorAll('video,audio')].every(el => el.paused && !el.getAttribute('src'))}));
  assert.equal(result.finished, true, `${id}: natural completion`);
  assert.equal(result.completeCount, 1, `${id}: completion emitted once`);
  assert.equal(result.cleanup, true, `${id}: all media released`);
  const active = result.samples.filter(sample => sample.time > .3 && sample.time < scene.duration - .35 && sample.readyState >= 2);
  assert.ok(active.length > scene.duration * 7, `${id}: continuous playback samples`);
  const lastTime = Math.max(...result.samples.map(sample => sample.time));
  assert.ok(lastTime > scene.duration - .3, `${id}: played through last frame`);
  const drifts = active.flatMap(sample => Object.values(sample.stems).map(stem => Math.abs(stem.time - sample.time)));
  const maxDrift = Math.max(...drifts);
  assert.ok(maxDrift < .22, `${id}: audio drift ${maxDrift}`);
  assert.ok(active.every(sample => !sample.paused && Object.values(sample.stems).every(stem => !stem.paused)), `${id}: no unintended pause`);
  assert.ok(active.every(sample => sample.muted && Object.values(sample.stems).every(stem => !stem.muted)), `${id}: stems audible, silent video muted`);
  for (const cue of scene.cues) assert.ok(result.captions.includes(cue.text), `${id}: visible caption ${cue.id || cue.text}`);
  const entry = {id, status: 'passed', duration: scene.duration, elapsedSeconds: (Date.now() - started) / 1000, lastTime, activeSamples: active.length, maximumStemDriftSeconds: maxDrift, displayedCueCount: scene.cues.length, completeCount: result.completeCount, cleanup: result.cleanup};
  report.checks.push(entry);
  await writeFile(new URL(`${id}-samples.json`, out), JSON.stringify(result, null, 2));
  console.log('PASS complete chapter', JSON.stringify(entry));
 }
 assert.deepEqual(report.errors, []);
 assert.deepEqual(report.failedRequests, []);
 report.status = 'passed';
} catch (error) {
 report.status = 'failed'; report.failure = error.stack; throw error;
} finally {
 await writeFile(new URL('report.json', out), JSON.stringify(report, null, 2));
 await browser.close();
 console.log(JSON.stringify(report, null, 2));
}
