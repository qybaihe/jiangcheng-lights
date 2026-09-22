import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:900}}),report={errors:[],avatars:{}};page.on('pageerror',e=>report.errors.push(e.message));
await page.goto('http://127.0.0.1:4197/output/qa/props/world.html');await page.waitForFunction(()=>window.ready,null,{timeout:90000});
for(const avatar of['female','male']){
 await page.evaluate(async id=>{world.endPropInteraction({immediate:true});await world.setAvatar(id);},avatar);
 report.avatars[avatar]={};
 for(const id of['prop-bicycle','prop-newspaper','prop-ferry']){
 await page.evaluate(id=>{world.endPropInteraction({immediate:true});world.setPosition(world.getPropAnchors().find(a=>a.id===id));world.startPropInteraction(id);},id);await page.waitForTimeout(400);
 report.avatars[avatar][id]=await page.evaluate(()=>{const p=world.player,r=p.userData.rig,c=p.userData.avatarRig,V=p.position.constructor;const local=bone=>p.worldToLocal(bone.getWorldPosition(new V())).toArray();return {mode:world.getPropState().mode,driver:{feet:r.ankles.map(local),hands:r.hands.map(local)},avatar:{feet:c.metrics.sideMap.map(s=>local(c.vrm.humanoid.getNormalizedBoneNode(s+'Foot'))),hands:c.metrics.sideMap.map(s=>local(c.vrm.humanoid.getNormalizedBoneNode(s+'Hand')))},metrics:c.metrics};});
 await page.screenshot({path:`output/qa/props/${id}-${avatar}.png`});
 }
}
await fs.writeFile('output/qa/props/pose-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();
