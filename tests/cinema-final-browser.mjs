import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const BASE=process.env.GAME_URL||'http://127.0.0.1:4198';
const manifest=JSON.parse(await readFile(process.env.CINEMA_MANIFEST||new URL('../public/media/cinema-v3-manifest.json',import.meta.url),'utf8'));
const selected=(process.env.CINEMA_SCENES||'prologue,granny,chef,dock,ending').split(',');
const out=new URL(`../output/qa/story-v3/${process.env.CINEMA_QA_DIR||'final-movies'}/`,import.meta.url);await mkdir(out,{recursive:true});
const report={scope:'actual chapter files and stems, mounted through the production player in an isolated browser harness',manifestMode:process.env.CINEMA_MANIFEST?'explicit staged scene manifest':'published final manifest',selected,checks:[],errors:[],failedRequests:[]};
const browser=await chromium.launch({headless:true,channel:'chrome'}),context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();
page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.status()>=400)report.failedRequests.push({url:r.url(),status:r.status()});});
if(process.env.CINEMA_MANIFEST)await page.route('**/media/cinema-v3-manifest.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(manifest)}));
await page.route('**/__cinema-final*',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;font-family:sans-serif}#root{position:absolute;inset:0}#begin{position:relative;z-index:3}</style><button id="begin">播放章节</button><div id="root"></div><script type="module">import {mountCinema} from '/src/cinema-player.js';import '/src/ui/cinema-player.css';let prefs={sound:true,musicVolume:.48,effectsVolume:.6,voiceVolume:.9};window.finished=false;document.querySelector('#begin').onclick=()=>{document.querySelector('#begin').hidden=true;window.player=mountCinema(document.querySelector('#root'),{id:new URL(location.href).searchParams.get('id'),getPreferences:()=>prefs,onPreferences:patch=>Object.assign(prefs,patch),onComplete:()=>{window.finished=true},onSkip:()=>{window.finished='skipped'},onClose:()=>{window.finished='closed'}})};</script>`}));
try{
 for(const id of selected){
  await page.goto(`${BASE}/__cinema-final?id=${id}`);await page.locator('#begin').click();await page.waitForFunction(()=>document.querySelector('#cinematic')?.readyState>=2,null,{timeout:30000});
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-cinema-stem]')].every(a=>a.readyState>=2),null,{timeout:30000});
  const firstTime=await page.evaluate(()=>document.querySelector('#cinematic').currentTime);
  await page.waitForFunction(start=>{const v=document.querySelector('#cinematic');return !v.paused&&v.currentTime>=start+1.05&&[...document.querySelectorAll('[data-cinema-stem]')].every(a=>!a.paused&&Math.abs(a.currentTime-v.currentTime)<.18);},firstTime,{timeout:15000});
  const playback=await page.evaluate(start=>{const v=document.querySelector('#cinematic');return {from:start,to:v.currentTime,advancedSeconds:v.currentTime-start,stems:[...document.querySelectorAll('[data-cinema-stem]')].map(a=>({channel:a.dataset.cinemaStem,time:a.currentTime,drift:a.currentTime-v.currentTime,paused:a.paused}))};},firstTime);
  await page.evaluate(()=>player.pause());const detail=await page.evaluate(()=>({video:{duration:document.querySelector('video').duration,width:document.querySelector('video').videoWidth,height:document.querySelector('video').videoHeight},audio:[...document.querySelectorAll('[data-cinema-stem]')].map(a=>({channel:a.dataset.cinemaStem,duration:a.duration}))}));
  assert.ok(detail.video.width>detail.video.height);assert.ok(Math.abs(detail.video.duration-manifest.scenes[id].duration)<.12,id);for(const stem of detail.audio)assert.ok(Math.abs(stem.duration-detail.video.duration)<.2,`${id}/${stem.channel}: matched timeline length`);
  const value=manifest.scenes[id].cues;const cues=!value?[]:Array.isArray(value)?value:JSON.parse(await readFile(new URL(`../public${value}`,import.meta.url)));
  const cue=(Array.isArray(cues)?cues:cues.cues)[0],target=cue?(cue.start+cue.end)/2:3;
  await page.locator('#cinema-seek').evaluate((el,target)=>{el.value=target;el.dispatchEvent(new Event('input',{bubbles:true}));},target);await page.waitForTimeout(200);
  if(cue)assert.equal(await page.locator('#cinema-caption').innerText(),cue.text);
  const paused=await page.evaluate(()=>player.diagnostics());for(const stem of Object.values(paused.stems)){assert.equal(stem.paused,true);assert.ok(Math.abs(stem.time-paused.time)<.17);}
  await page.locator('.chapter-film__mix summary').click();const captionBox=await page.locator('.chapter-film__subtitle').boundingBox(),footerBox=await page.locator('.chapter-film footer').boundingBox();assert.ok(captionBox.y+captionBox.height<footerBox.y,`${id}: expanded mixer does not cover the subtitles`);
  await page.locator('[data-cinema-volume="music"]').evaluate(el=>{el.value=19;el.dispatchEvent(new Event('input',{bubbles:true}));});await page.locator('[data-cinema-volume="voice"]').evaluate(el=>{el.value=83;el.dispatchEvent(new Event('input',{bubbles:true}));});
  const mixed=await page.evaluate(()=>player.diagnostics());assert.equal(mixed.stems.music.volume,.19);if(mixed.stems.voice)assert.equal(mixed.stems.voice.volume,.83);assert.equal(mixed.muted,true);
  await page.screenshot({path:fileURLToPath(new URL(`${id}.png`,out))});await page.locator('#film-close').click();assert.equal(await page.evaluate(()=>finished),'closed');assert.ok(await page.locator('audio').evaluateAll(els=>els.every(a=>a.paused&&!a.getAttribute('src'))));
  report.checks.push({id,status:'passed',...detail,playback});console.log('PASS final movie:',id);
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.failedRequests,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack;await page.screenshot({path:fileURLToPath(new URL('failure.png',out))}).catch(()=>{});throw error;}
finally{await writeFile(new URL('report.json',out),JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report,null,2));}
