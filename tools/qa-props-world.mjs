import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:4197/output/qa/props/world.html');await page.waitForFunction(()=>window.ready,{},{timeout:90000});
console.log('READY',await page.evaluate(()=>({anchors:world.getPropAnchors(),rig:Object.fromEntries(Object.entries(world.player.userData.rig).filter(([k,v])=>typeof v==='number')),errors:[]})));
for(const id of['prop-bicycle','prop-newspaper','prop-ferry']){
 const start=await page.evaluate(id=>{world.endPropInteraction({immediate:true});const a=world.getPropAnchors().find(a=>a.id===id);world.setPosition(a);const before=world.getShadowStats();return {result:world.startPropInteraction(id),before,position:world.player.position.toArray(),state:world.getPropState()};},id);console.log(id,JSON.stringify(start));
 await page.waitForTimeout(id==='prop-ferry'?5000:900);await page.screenshot({path:`output/qa/props/${id}-female.png`});
 if(id==='prop-bicycle'){await page.evaluate(()=>{world.keys.w=true;});await page.waitForTimeout(1000);await page.evaluate(()=>world.keys={});console.log('moved',await page.evaluate(()=>({state:world.getPropState(),shadow:world.getShadowStats()})));}
}
console.log('ERRORS',errors);await browser.close();
