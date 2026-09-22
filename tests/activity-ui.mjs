import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {CIRCUIT,MEMORY_ORDER,circuitConnected} from '../src/story.js';

// Isolated module harness. Does not import main.js, start WebGL, change game
// progress, or connect to the user's browser. This is not a story walkthrough.
const BASE=process.env.GAME_URL||'http://127.0.0.1:5173';
const output=fileURLToPath(new URL('../output/qa/activity-ui/',import.meta.url));
const root=fileURLToPath(new URL('../',import.meta.url));
const report={suite:'activity-ui',date:new Date().toISOString(),base:BASE,
  scope:'isolated activity modules in the production panel shell; no world or story walkthrough',
  viewportCases:[{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844}],
  sourceHashes:{},checks:[],errors:[],cases:[]};
const viewports=report.viewportCases.filter(v=>!process.env.VIEWPORT_FILTER||v.name===process.env.VIEWPORT_FILTER);
const titles={circuit:'让声音找到回家的路',memory:'把那一天，慢慢拼回来',pack:'雨来以前，带好这些',choice:'先停下来，看清楚'};
const kinds=Object.keys(titles).filter(kind=>!process.env.ACTIVITY_FILTER||kind===process.env.ACTIVITY_FILTER);
assert.ok(viewports.length&&kinds.length,'unknown activity or viewport filter');
report.selectedCases={viewports:viewports.map(v=>v.name),activities:kinds};
const caseFilter=process.env.CASE_FILTER?.split(',');
if(caseFilter)report.selectedCases.pairs=caseFilter;
const reportName=process.env.REPORT_NAME||'report.json';
assert.match(reportName,/^[a-zA-Z0-9_.-]+\.json$/);
const submit={circuit:'#circuit-check',memory:'#order-check',pack:'#pack-check'};
const feedback={circuit:'#puzzle-feedback',memory:'#puzzle-feedback',pack:'#puzzle-feedback',choice:'#choice-feedback'};
const sourceFiles=['src/style.css','src/story.js','src/ui/activity-shell.css',...Object.keys(titles).flatMap(k=>[`src/ui/${k}-game.js`,`src/ui/${k}-game.css`])];
for(const name of sourceFiles){try{report.sourceHashes[name]=createHash('sha256').update(await readFile(root+name)).digest('hex');}catch(error){if(!name.endsWith('-game.css'))throw error;}}
const check=(context,name,data={})=>{report.checks.push({...context,name,status:'passed',...data});console.log('PASS',context.viewport,context.kind,name);};
const harness=kind=>`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>活动组件专项</title><style>body{background:#183c36 url('/media/arrival.webp') center/cover fixed}.qa-complete{display:none}</style><div id="overlay" class="scrim"><section class="paper-panel activity-panel ${kind}-panel" role="dialog" aria-modal="true" aria-label="${titles[kind]}"><div class="panel-head"><div><span class="eyebrow">江城有灯 · 街坊的委托</span><h2>${titles[kind]}</h2></div><button class="close icon-btn" aria-label="关闭">×</button></div><div id="activity-root"></div></section></div><script type="module">
import '/src/style.css';import '/src/ui/activity-shell.css';
import {mountCircuitGame} from '/src/ui/circuit-game.js';
import {mountMemoryGame} from '/src/ui/memory-game.js';
import {mountPackGame} from '/src/ui/pack-game.js';
import {mountChoiceGame} from '/src/ui/choice-game.js';
window.activityQa={kind:${JSON.stringify(kind)},completions:0,completedOptions:[]};
const onComplete=option=>{activityQa.completions++;activityQa.completedOptions.push(option?.text||null);};
const root=document.querySelector('#activity-root');
const choices=[{text:'沿积水处走近，亲手查看电箱。',correct:false,feedback:'先停在干燥、安全的位置。不要涉水，也不要靠近或触碰电气设备。'},{text:'保持安全距离，把位置和积水情况报告给社区。',correct:true,feedback:'你把观察到的情况交给了合适的人，街坊会按安排确认路线。'},{text:'请其他居民先走过去，替大家试一试。',correct:false,feedback:'不能让他人代替自己冒险。避开积水和电气设施，及时联系社区或专业人员。'}];
const mounts={circuit:mountCircuitGame,memory:mountMemoryGame,pack:mountPackGame,choice:mountChoiceGame};
mounts[activityQa.kind](root,{title:${JSON.stringify(titles.choice)},text:'东巷旧配电箱附近出现积水。你站在干燥的通道口，接下来怎么做？',options:choices,onComplete});
document.querySelector('.close').onclick=()=>{document.querySelector('#overlay').hidden=true;};
// main.panel owns initial dialog focus and its focus trap. Only reproduce the
// initial focus here; action-to-action focus remains entirely module-owned.
document.querySelector('.close').focus();
window.activityQa.ready=true;
</script></html>`;

async function layout(page,context,state){
  const metrics=await page.evaluate(()=>{
    const panel=document.querySelector('.paper-panel'),root=document.querySelector('#activity-root');
    const boxes=[document.documentElement,document.body,panel,root].map(e=>({tag:e.id||e.className||e.tagName,width:e.clientWidth,scrollWidth:e.scrollWidth}));
    const bad=Array.from(root.querySelectorAll('*')).filter(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.position!=='absolute'&&s.position!=='fixed'&&(r.left<-.5||r.right>innerWidth+.5);}).map(e=>({tag:e.tagName,class:e.className,text:e.textContent.slice(0,35)}));
    return {boxes,offscreen:bad.slice(0,12),panelHeight:panel.clientHeight,panelScrollHeight:panel.scrollHeight};
  });
  assert.ok(metrics.boxes.every(e=>e.scrollWidth<=e.width+1),`${state}: horizontal overflow ${JSON.stringify(metrics.boxes)}`);
  assert.deepEqual(metrics.offscreen,[],`${state}: content extends past viewport`);
  check(context,`${state} has no horizontal overflow`,metrics);
}
async function screenshot(page,context,state,focusSelector){
  if(focusSelector&&await page.locator(focusSelector).isVisible())await page.locator(focusSelector).scrollIntoViewIfNeeded();
  else await page.locator('.paper-panel').evaluate(e=>{e.scrollTop=0;});
  await page.screenshot({path:output+`${context.viewport}-${context.kind}-${state}.png`,animations:'disabled'});
}
async function reachControls(page,context,state){
  const controls=page.locator('#activity-root button:enabled,#activity-root summary');
  const sizes=[];
  for(let i=0;i<await controls.count();i++){
    const control=controls.nth(i);if(!await control.isVisible())continue;
    await control.scrollIntoViewIfNeeded();
    const info=await control.evaluate(e=>{const r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);let top=0,bottom=innerHeight,left=0,right=innerWidth;for(let p=e.parentElement;p;p=p.parentElement){const s=getComputedStyle(p),b=p.getBoundingClientRect();if(/auto|scroll|hidden|clip/.test(s.overflowY)){top=Math.max(top,b.top+p.clientTop);bottom=Math.min(bottom,b.top+p.clientTop+p.clientHeight);}if(/auto|scroll|hidden|clip/.test(s.overflowX)){left=Math.max(left,b.left+p.clientLeft);right=Math.min(right,b.left+p.clientLeft+p.clientWidth);}if(s.position==='fixed')break;}return {name:e.getAttribute('aria-label')||e.textContent.trim().slice(0,45),width:r.width,height:r.height,left:r.left,right:r.right,top:r.top,bottom:r.bottom,clip:{top,bottom,left,right},hit:Boolean(hit&&(hit===e||e.contains(hit))),focusable:e.tabIndex>=0};});
    assert.ok(info.left>=-.5&&info.right<=context.width+.5&&info.top>=-.5&&info.bottom<=context.height+.5,`${state}: unreachable control ${info.name}`);
    assert.ok(info.hit,`${state}: covered control ${info.name}`);
    assert.ok(info.top>=info.clip.top-.5&&info.bottom<=info.clip.bottom+.5&&info.left>=info.clip.left-.5&&info.right<=info.clip.right+.5,`${state}: ancestor clips control ${JSON.stringify(info)}`);
    assert.ok(info.focusable,`${state}: keyboard-inaccessible control ${info.name}`);
    if(context.viewport==='mobile')assert.ok(info.width>=44&&info.height>=44,`${state}: touch target below 44px ${JSON.stringify(info)}`);
    sizes.push({name:info.name,width:info.width,height:info.height});
  }
  assert.ok(sizes.length>0);check(context,`${state} controls can be reached by scrolling and are focusable`,{controls:sizes});
}
async function keyActivate(page,selector,key='Enter'){
  const button=page.locator(selector);await button.focus();await page.keyboard.press(key);
}
async function expectItemFocus(page,selector){
  assert.equal(await page.locator(selector).evaluate(e=>e===document.activeElement||e.contains(document.activeElement)),true,`focus lost after operating ${selector}`);
}
async function visibleBeforeTestScroll(page,context,selector,name){
  const visible=await page.locator(selector).evaluate(e=>{const b=e.getBoundingClientRect(),panel=e.closest('.paper-panel'),p=panel.getBoundingClientRect();return {top:b.top,bottom:b.bottom,left:b.left,right:b.right,clipTop:Math.max(0,p.top+panel.clientTop),clipBottom:Math.min(innerHeight,p.top+panel.clientTop+panel.clientHeight),clipLeft:Math.max(0,p.left+panel.clientLeft),clipRight:Math.min(innerWidth,p.left+panel.clientLeft+panel.clientWidth),scrollTop:panel.scrollTop};});
  assert.ok(visible.top>=visible.clipTop-.5&&visible.bottom<=visible.clipBottom+.5&&visible.left>=visible.clipLeft-.5&&visible.right<=visible.clipRight+.5,`${name}: not visible before test scrolling ${JSON.stringify(visible)}`);
  check(context,name,visible);
}
async function stateSnapshot(page,context,state,focusSelector){
  await layout(page,context,state);
  if(context.viewport==='desktop'&&['memory','pack'].includes(context.kind)&&['default','success'].includes(state)){
    await page.locator('.paper-panel').evaluate(e=>{e.scrollTop=0;});
    const selector=state==='success'?'[data-activity-continue]':submit[context.kind];
    const visible=await page.locator(selector).evaluate(e=>{const b=e.getBoundingClientRect(),panel=e.closest('.paper-panel'),p=panel.getBoundingClientRect();return {top:b.top,bottom:b.bottom,panelTop:p.top+panel.clientTop,panelBottom:p.top+panel.clientTop+panel.clientHeight,scrollTop:panel.scrollTop};});
    assert.ok(visible.top>=visible.panelTop&&visible.bottom<=Math.min(visible.panelBottom,context.height)+.5,`${state}: desktop primary action requires scrolling ${JSON.stringify(visible)}`);
    check(context,`${state} desktop primary action is visible without scrolling`,visible);
  }
  await screenshot(page,context,state,focusSelector);await reachControls(page,context,state);
}
async function expectError(page,context,initial){
  const text=(await page.locator(feedback[context.kind]).innerText()).trim();assert.ok(text);assert.notEqual(text,initial);
  assert.equal(await page.locator('[data-activity-continue]').isVisible(),false);assert.equal(await page.evaluate(()=>activityQa.completions),0);
  check(context,'wrong answer keeps the activity open with retry guidance',{feedback:text});
  await stateSnapshot(page,context,'error',feedback[context.kind]);
}
async function expectSuccess(page,context){
  await page.locator('[data-activity-continue]').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>activityQa.completions),0,'success must wait for explicit continue');
  if(context.kind==='choice')await visibleBeforeTestScroll(page,context,'[data-activity-continue]','choice continue is visible before test scrolling');
  const successFocus=await page.evaluate(()=>{const e=document.activeElement;return {tag:e?.tagName,name:e?.getAttribute('aria-label')||e?.textContent?.trim().slice(0,50),interactive:Boolean(e&&e.tabIndex>=0&&!e.disabled&&e.closest('.paper-panel'))};});
  assert.ok(successFocus.interactive,'success must retain focus on an available dialog control');
  check(context,'success keeps keyboard focus inside the dialog',successFocus);
  if(submit[context.kind])await page.locator(submit[context.kind]).evaluateAll(els=>els.forEach(e=>{e.click();e.click();}));
  else await page.locator('[data-choice="1"]').evaluateAll(els=>els.forEach(e=>{e.click();e.click();}));
  assert.equal(await page.evaluate(()=>activityQa.completions),0,'repeated success submission must not complete early');
  await stateSnapshot(page,context,'success','[data-activity-continue]');
  const next=page.locator('[data-activity-continue]');await next.focus();
  assert.equal(await next.evaluate(e=>e===document.activeElement),true);
  await page.keyboard.press('Enter');
  await next.evaluateAll(els=>els.forEach(e=>{e.click();e.click();}));
  const completion=await page.evaluate(()=>({count:activityQa.completions,options:activityQa.completedOptions}));
  assert.equal(completion.count,1,'continue must complete at most once');
  if(context.kind==='choice')assert.deepEqual(completion.options,['保持安全距离，把位置和积水情况报告给社区。']);
  check(context,'success waits for continue; repeated submissions and continue fire one completion',completion);
}
async function circuit(page,context){
  const initial=(await page.locator(feedback.circuit).innerText()).trim();await keyActivate(page,submit.circuit);await expectError(page,context,initial);
  const initialRotation=await page.locator('[data-tile="4"] .radio-connector').getAttribute('style');
  await keyActivate(page,'[data-tile="4"]');await keyActivate(page,'#circuit-undo');
  assert.equal(await page.locator('[data-tile="4"] .radio-connector').getAttribute('style'),initialRotation);await expectItemFocus(page,'[data-tile="4"]');
  await keyActivate(page,'[data-tile="3"]','Space');await keyActivate(page,'#circuit-reset');await expectItemFocus(page,'[data-tile="3"]');
  await page.keyboard.press('ArrowRight');await expectItemFocus(page,'[data-tile="4"]');await page.keyboard.press('ArrowUp');await expectItemFocus(page,'[data-tile="1"]');
  check(context,'undo restores rotation, reset restores the board, and arrows move grid focus');
  // Use the six-piece route described by the visible workbench hint. Rotate
  // through real keyboard events; never mutate the activity's internal state.
  const route=[3,0,1,2,5,8],rotations=CIRCUIT.map(t=>t.rot);
  for(const i of route){const turns=(4-rotations[i]%4)%4;
    for(let j=0;j<turns;j++){
      const selector=`[data-tile="${i}"]`,before=await page.locator(selector).evaluate(e=>e.outerHTML);
      await keyActivate(page,selector,j%2?'Space':'Enter');
      assert.notEqual(await page.locator(selector).evaluate(e=>e.outerHTML),before,'keyboard should rotate the copper connection');
      await expectItemFocus(page,selector);rotations[i]++;
    }
  }
  assert.ok(circuitConnected(CIRCUIT.map((t,i)=>({...t,rot:rotations[i]}))));
  check(context,'Enter and Space rotate copper connections and retain tile focus');
  await keyActivate(page,submit.circuit);await expectSuccess(page,context);
}
const memoryTitles=MEMORY_ORDER.map(x=>x.title);
async function memoryOrder(page){return page.locator('[data-up]').evaluateAll((els,titles)=>els.map(button=>{let e=button;while(e&&titles.filter(t=>e.textContent.includes(t)).length!==1)e=e.parentElement;return titles.find(t=>e?.textContent.includes(t))||null;}),memoryTitles);}
async function memory(page,context){
  const initial=(await page.locator(feedback.memory).innerText()).trim();await keyActivate(page,submit.memory);await expectError(page,context,initial);
  const original=await memoryOrder(page);await keyActivate(page,'[data-down="0"]','Space');
  let moved=await memoryOrder(page);assert.equal(moved[1],original[0]);
  assert.equal(await page.evaluate(()=>document.activeElement?.closest('[data-memory-id]')?.dataset.memoryId),MEMORY_ORDER.find(x=>x.title===original[0]).id);
  await keyActivate(page,'[data-up="1"]');assert.deepEqual(await memoryOrder(page),original);
  check(context,'both photo movement directions work with keyboard activation');
  let moves=0;
  for(let target=0;target<memoryTitles.length;target++){
    let order=await memoryOrder(page),index=order.indexOf(memoryTitles[target]);assert.ok(index>=target,`cannot locate memory card ${memoryTitles[target]}`);
    while(index>target){
      const movedTitle=order[index];await keyActivate(page,`[data-up="${index}"]`,moves%2?'Space':'Enter');moves++;
      const focus=await page.evaluate(titles=>{let e=document.activeElement;const enabled=e?.tabIndex>=0&&!e?.disabled;while(e&&titles.filter(t=>e.textContent.includes(t)).length!==1)e=e.parentElement;return {enabled,title:titles.find(t=>e?.textContent.includes(t))||null};},memoryTitles);
      assert.ok(focus.enabled,'reordering lost focus to a noninteractive element');assert.equal(focus.title,movedTitle,'focus should follow the same memory card');
      order=await memoryOrder(page);index=order.indexOf(memoryTitles[target]);assert.ok(moves<20,'memory order did not converge');
    }
  }
  assert.deepEqual(await memoryOrder(page),memoryTitles);check(context,'keyboard moves photos into order and focus follows each moved card',{moves});
  await keyActivate(page,submit.memory);await expectSuccess(page,context);
}
async function pack(page,context){
  const wrong=['water','light','food','aid','candle'];
  for(let i=0;i<wrong.length;i++){const selector=`[data-pack="${wrong[i]}"]`;await keyActivate(page,selector,i%2?'Space':'Enter');assert.equal(await page.locator(selector).getAttribute('aria-pressed'),'true');await expectItemFocus(page,selector);}
  await keyActivate(page,'[data-pack="contact"]');assert.equal(await page.locator('[data-pack="contact"]').getAttribute('aria-pressed'),'false');assert.equal(await page.locator('[data-pack][aria-pressed="true"]').count(),5);
  check(context,'a full bag prevents a sixth item and keeps the five selections');
  const initial=(await page.locator(feedback.pack).innerText()).trim();await keyActivate(page,submit.pack);await expectError(page,context,initial);
  await keyActivate(page,'[data-remove-pack="candle"]','Space');await expectItemFocus(page,'[data-pack="candle"]');
  await keyActivate(page,'[data-pack="contact"]','Space');await expectItemFocus(page,'[data-pack="contact"]');
  assert.equal(await page.locator('[data-pack="candle"]').getAttribute('aria-pressed'),'false');assert.equal(await page.locator('[data-pack="contact"]').getAttribute('aria-pressed'),'true');
  check(context,'keyboard selects and replaces supplies without losing item focus');
  await keyActivate(page,submit.pack);await expectSuccess(page,context);
}
async function choice(page,context){
  const initial=(await page.locator(feedback.choice).innerText()).trim();await keyActivate(page,'[data-choice="0"]','Space');await expectItemFocus(page,'[data-choice="0"]');
  await visibleBeforeTestScroll(page,context,feedback.choice,'choice retry explanation is visible before test scrolling');await expectError(page,context,initial);
  assert.equal(await page.locator('[data-choice="1"]').isEnabled(),true);await keyActivate(page,'[data-choice="1"]');
  check(context,'keyboard can retry a scenario choice after reading its explanation');await expectSuccess(page,context);
}

await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
  report.browser=browser.version();
  for(const viewport of viewports)for(const kind of kinds){
    if(caseFilter&&!caseFilter.includes(`${viewport.name}:${kind}`))continue;
    const context={viewport:viewport.name,width:viewport.width,height:viewport.height,kind};
    const browserContext=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},deviceScaleFactor:1,reducedMotion:'reduce'});
    const page=await browserContext.newPage();
    page.on('pageerror',error=>report.errors.push({...context,message:error.message}));
    await page.route(/\/__activity-ui(?:\?.*)?$/,route=>route.fulfill({contentType:'text/html',body:harness(kind)}));
    try{
      await page.goto(BASE+'/__activity-ui?kind='+kind);await page.waitForFunction(()=>window.activityQa?.ready,{timeout:30000});
      await page.waitForLoadState('networkidle');await page.evaluate(()=>document.fonts.ready);
      assert.equal(await page.locator('#world,canvas').count(),0);assert.equal(await page.evaluate(()=>localStorage.length),0);
      await stateSnapshot(page,context,'default');
      await ({circuit,memory,pack,choice})[kind](page,context);
      assert.equal(await page.evaluate(()=>localStorage.length),0);
      report.cases.push({...context,status:'passed'});
    }catch(error){
      report.cases.push({...context,status:'failed',message:error.message,stack:error.stack});
      await page.screenshot({path:output+`${context.viewport}-${kind}-failure.png`,animations:'disabled'}).catch(()=>{});
      console.error('FAIL',context.viewport,kind,error.message);process.exitCode=1;
    }finally{await browserContext.close();}
  }
  report.status=report.cases.every(c=>c.status==='passed')&&report.errors.length===0?'passed':'failed';
  if(report.status==='failed')process.exitCode=1;
}finally{
  await browser.close();
  report.browserClosed=true;
  await writeFile(output+reportName,JSON.stringify(report,null,2));
  await writeFile(output+`report-${report.date.replace(/[:.]/g,'-')}.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify({status:report.status,cases:report.cases,checks:report.checks.length,errors:report.errors,browserClosed:report.browserClosed},null,2));
}
