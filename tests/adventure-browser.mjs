// Run only after the preview build is frozen. All game mutations are real UI
// clicks/keys; the debug API is read-only. No save, position or route injection.
// GAME_URL=http://127.0.0.1:4173 QA_OUTPUT_DIR=output/qa/adventure/candidate
// EXPECTED_BUILD_ASSET=/assets/index-<hash>.js node tests/adventure-browser.mjs
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ADVENTURE_STOPS} from '../src/adventure.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const base=process.env.GAME_URL||'http://127.0.0.1:4173';
const dir=path.resolve(root,process.env.QA_OUTPUT_DIR||'output/qa/adventure/candidate');
const expectedAsset=process.env.EXPECTED_BUILD_ASSET||null;
const viewport={width:1440,height:900};
const [first,second,third]=ADVENTURE_STOPS;
const ids=ADVENTURE_STOPS.map(s=>s.id);
const report={started:new Date().toISOString(),base,expectedAsset,viewport,status:'running',checks:[],screenshots:[],routes:[],errors:[],failedResponses:[],failedRequests:[],assets:[],limitations:[
  'Desktop Chrome correctness run, not a frame-rate benchmark or a human first-play duration.',
  'No save corruption is injected; malformed saves are covered by adventure.test.js.',
  'No mobile/touch coverage or complete main-story walkthrough in this script.',
]};
let browser,page,stage='initialisation';
await mkdir(dir,{recursive:true});

function check(condition,name,details){
  report.checks.push({name,passed:Boolean(condition),stage,...(details===undefined?{}:{details})});
  assert.ok(condition,name);console.log('PASS',name);
}
async function read(){
  return page.evaluate(()=>{
    const api=window.__JIANGCHENG__,w=api.getWorld(),s=api.getState();
    return {at:performance.now(),near:api.getNearest(),modal:api.getModal(),state:{flags:s.flags,adventure:s.adventure,supplies:s.supplies,lore:s.lore,settings:s.settings},world:{active:w.active,position:w.position,groundHeight:w.groundHeight,playerMotion:w.playerMotion,cameraMode:w.cameraMode,heading:w.heading,camera:w.camera,cameraTarget:w.cameraTarget,remainingRoute:w.remainingRoute,moveSpeed:w.moveSpeed,renderFrame:w.renderFrame,suspended:w.suspended,blocked:w.blocked,conversation:w.conversation,adventure:w.adventure},ui:{quest:document.querySelector('#quest-title')?.textContent,count:document.querySelector('#adventure-count')?.textContent,region:document.querySelector('.adventure-region.visible strong')?.textContent||null}};
  });
}
async function until(predicate,label,timeout=60000){
  const start=Date.now();let last;
  while(Date.now()-start<timeout){last=await read();if(predicate(last))return last;await page.waitForTimeout(80);}
  report.timeout={label,last};throw new Error(`${label} timed out after ${timeout} ms`);
}
async function snap(label){
  const name=`${String(report.screenshots.length+1).padStart(2,'0')}-${label}.png`,state=await read();
  await page.screenshot({path:path.join(dir,name)});
  await writeFile(path.join(dir,name.replace('.png','.json')),JSON.stringify(state,null,2));
  report.screenshots.push({name,label,at:state.at});
}
async function focusWorld(){
  // A single canvas click only focuses/starts look input; double-click travel
  // is never used. Calls are separated by modal/route work, well over 500 ms.
  await page.locator('#world').click({position:{x:viewport.width*.5,y:viewport.height*.42}});
}
async function assertMainUntouched(label){
  const s=await read();check(s.state.flags.length===0&&s.state.supplies.length===0&&s.state.lore.length===0,label,{flags:s.state.flags,supplies:s.state.supplies,lore:s.state.lore});
  return s;
}
async function mapVisibility(foundCount,label){
  await page.locator('#map').click();await page.locator('#map-destination').waitFor();
  const actual=await page.locator('#map-destination option').evaluateAll(options=>options.map(o=>o.value).filter(id=>id.startsWith('kite-')));
  const expected=ids.slice(0,Math.min(foundCount+1,ids.length));
  assert.deepEqual(actual,expected,`${label}: reveal only found stops and the next stop`);
  check(true,label,{visibleStops:actual});await snap(`map-${foundCount}-of-3`);await page.keyboard.press('Escape');
}
async function go(id,{ramp=false}={}){
  stage=`route-${id}`;
  await page.locator('#map').click();await page.locator('#map-destination').selectOption(id);
  assert.equal(await page.locator('#map-go').isEnabled(),true,`${id} must have an available public route`);
  const route={id,started:Date.now(),samples:[],rampMidpoint:null};report.routes.push(route);
  await page.locator('#map-go').click();
  const began=Date.now();let arrival;
  while(Date.now()-began<60000){
    const s=await read();route.samples.push({at:s.at,position:s.world.position,groundHeight:s.world.groundHeight,grounded:s.world.playerMotion?.grounded,remainingRoute:s.world.remainingRoute,renderFrame:s.world.renderFrame,region:s.ui.region});
    const p=s.world.position;
    if(ramp&&!route.rampMidpoint&&p.x>=31.8&&p.x<=35.4&&p.z<-.3&&p.z>-14.7&&p.y>.7&&p.y<1.4){
      route.rampMidpoint=s;await snap('ramp-midpoint');
    }
    if(s.near===id&&s.world.remainingRoute===0&&s.world.moveSpeed<.05){arrival=s;break;}
    await page.waitForTimeout(80);
  }
  route.finished=Date.now();route.arrival=arrival??await read();
  check(Boolean(arrival),`${id} is reachable through the visible map and automatic public route`,{position:route.arrival.world.position,remainingRoute:route.arrival.world.remainingRoute,nearest:route.arrival.near});
  if(ramp){
    const slope=route.samples.filter(s=>s.position.x>=31.8&&s.position.x<=35.4&&s.position.z<=-.3&&s.position.z>=-14.7&&s.grounded);
    const heights=slope.map(s=>s.position.y),zs=slope.map(s=>s.position.z);
    check(slope.length>=5&&Math.min(...heights)<.38&&Math.max(...heights)>1.75&&Math.max(...zs)>-1.5&&Math.min(...zs)<-13.5,
      'The route climbs the full ramp from street level through intermediate heights',
      {samples:slope.length,heightRange:[Math.min(...heights),Math.max(...heights)],zRange:[Math.min(...zs),Math.max(...zs)]});
    check(Boolean(route.rampMidpoint),'A real midway ramp frame is captured before reaching the terrace');
    check(Math.abs(arrival.world.position.y-1.93)<.08&&Math.abs(arrival.world.groundHeight-1.93)<.08,'The terrace arrival is on the elevated 1.93 m ground',{position:arrival.world.position,groundHeight:arrival.world.groundHeight});
  }
  return arrival;
}
async function openReading(location,label){
  stage=label;const before=await read();
  assert.equal(before.near,location.id);assert.equal(before.world.playerMotion.grounded,true);
  await focusWorld();await page.keyboard.press('e');await page.locator('.note-text').waitFor({state:'visible'});
  assert.equal((await page.locator('.note-text').innerText()).trim(),location.lines[0].text);
  const opened=await read();
  await until(s=>s.world.renderFrame>opened.world.renderFrame+2,`${label} keeps rendering`,10000);
  const after=await read();
  check(after.modal==='adventure'&&after.world.suspended===false&&after.world.cameraMode===before.world.cameraMode&&after.world.conversation===null,
    `${label} stays in the original 3D view without entering a cutscene`,{cameraMode:after.world.cameraMode,frameBefore:opened.world.renderFrame,frameAfter:after.world.renderFrame});
  await snap(label);return before;
}
async function lookWhileReading(label,dx=200){
  stage=label;const before=await read();assert.equal(before.modal,'adventure');
  const start={x:viewport.width*.40,y:viewport.height*.36};
  assert.equal(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.id,start),'world','The real drag must begin on exposed 3D canvas, outside the note');
  await page.mouse.move(start.x,start.y);await page.mouse.down();
  try{await page.mouse.move(start.x+dx,start.y,{steps:14});}finally{await page.mouse.up();}
  await until(s=>s.world.renderFrame>before.world.renderFrame+2,`${label} renders after dragging`,10000);
  const after=await read();
  const turn=Math.atan2(Math.sin(after.world.heading-before.world.heading),Math.cos(after.world.heading-before.world.heading));
  const displacement=Math.hypot(after.world.position.x-before.world.position.x,after.world.position.y-before.world.position.y,after.world.position.z-before.world.position.z);
  check(Math.abs(turn)>.10&&after.world.cameraMode===before.world.cameraMode&&after.modal==='adventure'&&!after.world.suspended,
    'A real 200 px drag while reading turns toward the clue without changing camera mode',{dragPixels:dx,headingBefore:before.world.heading,headingAfter:after.world.heading,turnRadians:turn});
  check(displacement<.01&&after.world.playerMotion.grounded&&after.world.playerMotion.jumpCount===before.world.playerMotion.jumpCount,
    'Looking around during a note neither moves nor jumps the player',{displacement,jumpCount:after.world.playerMotion.jumpCount});
  report.readingLook={input:{start,dx},before,after};await snap(label);
}
async function finishReading(location,label){
  for(let i=0;i<location.lines.length;i++){
    assert.equal((await page.locator('.note-text').innerText()).trim(),location.lines[i].text,`${location.id} line ${i+1}`);
    await page.locator('#adventure-next').click();
  }
  await page.locator('.adventure-note').waitFor({state:'hidden'});
  const after=await read();check(after.world.suspended===false&&after.modal===null,`${label} immediately returns control to the same world`);
  return after;
}
async function jump(){
  stage='terrace-jump';await focusWorld();const before=await read();
  await page.keyboard.press('Space',{delay:25});
  const air=await until(s=>!s.world.playerMotion.grounded&&s.world.playerMotion.jumpCount===before.world.playerMotion.jumpCount+1,'Stationary jump takes off',5000);
  await snap('terrace-jump-air');
  const landed=await until(s=>s.world.playerMotion.grounded&&s.world.playerMotion.landingCount>before.world.playerMotion.landingCount,'Stationary jump lands',5000);
  check(landed.world.playerMotion.jumpCount===before.world.playerMotion.jumpCount+1&&Math.hypot(landed.world.position.x-before.world.position.x,landed.world.position.z-before.world.position.z)<.06&&Math.abs(landed.world.position.y-1.93)<.08,
    'One in-place jump returns to the terrace without falling through or moving the player',{before:before.world.position,air:air.world.position,landed:landed.world.position});
}

try{
  browser=await chromium.launch({headless:true,channel:'chrome'});
  const context=await browser.newContext({viewport,deviceScaleFactor:1});page=await context.newPage();
  page.on('pageerror',error=>report.errors.push(error.stack||error.message));
  page.on('response',response=>{if(response.status()>=400)report.failedResponses.push({status:response.status(),url:response.url()});});
  page.on('requestfailed',request=>report.failedRequests.push({url:request.url(),error:request.failure()?.errorText}));
  await page.goto(base);await page.locator('#boot').waitFor({state:'hidden',timeout:60000});
  report.assets=await page.locator('script[src],link[rel="stylesheet"]').evaluateAll(nodes=>nodes.map(n=>n.src||n.href));
  if(expectedAsset)check(report.assets.some(url=>new URL(url).pathname===new URL(expectedAsset,base).pathname),'The browser loaded the frozen requested build',{assets:report.assets});
  await page.locator('#start').click();await until(s=>s.world.active!==false&&s.modal===null&&s.world.remainingRoute===0,'Initial world is ready',10000);
  let s=await assertMainUntouched('A fresh session starts with no main-story completion or inventory');
  assert.deepEqual(s.state.adventure,{found:[]});const initialQuest=s.ui.quest;
  check(s.world.cameraMode==='street','Optional exploration starts in the normal street camera');
  await mapVisibility(0,'The initial map reveals the first clue only');

  await go(first.id);await snap('tools-alley-arrival');
  await openReading(first,'first-note-interrupted');
  await lookWhileReading('first-note-east-wall',200);
  await page.locator('#adventure-next').click();await page.locator('#adventure-next').click();
  await snap('first-note-half-read');await page.keyboard.press('Escape');
  s=await read();check(s.state.adventure.found.length===0&&s.modal===null&&!s.world.blocked&&!s.world.suspended,'Leaving a half-read note does not collect it or trap controls');
  await openReading(first,'first-note-complete');await finishReading(first,'First clue completion');
  assert.deepEqual((await read()).state.adventure.found,[first.id]);
  await page.reload();await page.locator('#boot').waitFor({state:'hidden',timeout:60000});
  s=await read();check(s.state.adventure.found.length===1&&s.state.adventure.found[0]===first.id,'Reload restores exactly one collected clue');
  await page.locator('#start').click();await until(s=>s.modal===null&&s.world.moveSpeed<.05,'Resume after reload',10000);
  await mapVisibility(1,'The map reveals the second clue after saving the first');

  await go(second.id);await snap('courtyard-north-arrival');await openReading(second,'second-note');await finishReading(second,'Second clue completion');
  assert.deepEqual((await read()).state.adventure.found,[first.id,second.id]);
  await mapVisibility(2,'The map reveals the terrace only after the second clue');
  await go(third.id,{ramp:true});await snap('terrace-river-view');
  await jump();await openReading(third,'third-note');await finishReading(third,'Third clue completion');
  s=await assertMainUntouched('All three optional clues finish without main-story flags, supplies or lore rewards');
  check(JSON.stringify(s.state.adventure.found)===JSON.stringify(ids)&&s.ui.quest===initialQuest,'The complete optional chain leaves the original main objective intact');
  await snap('adventure-complete');await mapVisibility(3,'All discovered stops remain available on the completed map');

  await page.locator('#first-person').click();assert.equal((await read()).world.cameraMode,'first');
  await openReading(third,'first-person-reread');await finishReading(third,'First-person reread');
  s=await read();check(JSON.stringify(s.state.adventure.found)===JSON.stringify(ids)&&s.world.cameraMode==='first','Rereading does not duplicate discoveries or change first-person mode');
  await go('shop');await snap('first-person-return-shop');
  await focusWorld();await page.keyboard.press('e');await page.locator('#dialogue-text').waitFor({state:'visible'});
  check(await page.locator('.story').evaluate(el=>el.classList.contains('in-world')),'The original shop story remains available as live 3D dialogue after the detour');
  assert.ok((await page.locator('#dialogue-text').innerText()).length>10);await snap('original-shop-dialogue');await page.keyboard.press('Escape');
  s=await assertMainUntouched('Leaving the untouched main intro preserves its uncompleted state');
  assert.equal(s.world.cameraMode,'first');assert.deepEqual(s.state.adventure.found,ids);
  check(report.errors.length===0&&report.failedResponses.length===0&&!report.failedRequests.some(r=>r.error!=='net::ERR_ABORTED'),'No browser exceptions or missing assets',{errors:report.errors,failedResponses:report.failedResponses,failedRequests:report.failedRequests});
  report.status='passed';report.completed=new Date().toISOString();report.final=s;
}catch(error){
  report.status='failed';report.failure={stage,message:error.stack||String(error)};process.exitCode=1;console.error(error);
  if(page)try{await snap('failure');}catch(screenshotError){report.failure.screenshotError=String(screenshotError);}
}finally{
  if(page)for(const key of ['w','a','s','d','Shift','Space'])try{await page.keyboard.up(key);}catch{}
  await writeFile(path.join(dir,'adventure-report.json'),JSON.stringify(report,null,2));await browser?.close();
}
