import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {DIALOGUES,SAVE_KEY} from '../src/story.js';
import {presentationFor} from '../src/dialogue-presentation.js';
const BASE=process.env.GAME_URL||'http://127.0.0.1:4197',dir=process.env.QA_DIR||'output/qa/story-v2/cg-layout';
await mkdir(dir,{recursive:true});const save=JSON.parse(await readFile('output/qa/story-v2/final/completed-save.json','utf8'));
const b=await chromium.launch({channel:'chrome',headless:true});const p=await b.newPage({viewport:{width:1440,height:900}});await p.addInitScript(({key,save})=>localStorage.setItem(key,JSON.stringify(save)),{key:SAVE_KEY,save});
const report={base:BASE,checks:[],errors:[],assets:[]};p.on('pageerror',e=>report.errors.push(e.message));p.on('response',r=>{if(['script','stylesheet'].includes(r.request().resourceType()))report.assets.push(r.url());});
try{
 await p.goto(BASE);await p.locator('#boot').waitFor({state:'hidden',timeout:60000});await p.locator('#start').click();await p.locator('#journal').click();
 for(const key of ['grannyMemory','chefMemory','dock','community','ending']){
  await p.locator(`[data-memory="${key}"]`).click();let previous=null;
  for(let index=0;index<DIALOGUES[key].length;index++){
   const {cgId}=presentationFor(key,index);
   if(cgId&&cgId!==previous){
    await p.waitForTimeout(650);const art=await p.locator('.story-art').boundingBox(),box=await p.locator('.dialogue-box').boundingBox();
    assert.ok(art.y+art.height<=box.y-10,`${cgId} art stays above dialogue`);assert.equal(await p.locator('.story-art').evaluate(el=>getComputedStyle(el).backgroundSize),'contain');
    await p.screenshot({path:`${dir}/${cgId}-desktop.png`});
    await p.setViewportSize({width:390,height:844});await p.waitForTimeout(120);const mobileArt=await p.locator('.story-art').boundingBox(),mobileBox=await p.locator('.dialogue-box').boundingBox();assert.ok(mobileArt.y+mobileArt.height<=mobileBox.y-10,cgId+' mobile');assert.ok(mobileArt.height>150,cgId+' mobile art height');await p.screenshot({path:`${dir}/${cgId}-mobile.png`});
    await p.locator('#cg-inspect').click();assert.equal(await p.locator('.dialogue-box').isVisible(),false);await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>window.__JIANGCHENG__.getModal()),'story');await p.setViewportSize({width:1440,height:900});report.checks.push(cgId+' complete image, desktop/mobile, inspection returns to same dialogue');
   }
   previous=cgId;await p.locator('#story-next').click();
  }
  assert.ok(await p.locator('.journal-panel').isVisible());
 }
 assert.equal(report.checks.length,8);assert.deepEqual(report.errors,[]);const current=await p.evaluate(()=>window.__JIANGCHENG__.getState());assert.deepEqual(current.flags,save.flags);assert.deepEqual(current.supplies,save.supplies);assert.deepEqual(current.milestones,save.milestones);
 report.checks.push('All five replays preserve completed gameplay progress');
}catch(e){report.failure=e.stack;await p.screenshot({path:`${dir}/failure.png`});process.exitCode=1;}finally{await writeFile(`${dir}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));await b.close();}
