import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const OUT=new URL('./',import.meta.url),browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']}),context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await context.route('**/__rowboat_vest__',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html><head><style>*{box-sizing:border-box}body{margin:0}canvas{display:block;width:100vw;height:100vh}#test{position:fixed;top:15px;left:15px;color:#fff;background:#213c35cf;padding:8px;font:15px sans-serif;z-index:10}</style></head><body><canvas id="world" tabindex="0"></canvas><div id="test">TEST ONLY - Safety vest fit - Not competition footage</div><script type="module">import {World} from '/src/world.js';import {updateThirdPerson} from '/src/exploration.js';window.setTestCamera=()=>{w.thirdYaw=-Math.PI/2-.3;w.resolvedYaw=w.thirdYaw;w.thirdPitch=.23;w.thirdDistance=4.5;w.lastManualLook=w.elapsed+100;updateThirdPerson(w,0,true);};window.w=new World(document.getElementById('world'));await w.heroReady;await w.residentAvatarsReady;w.start();w.setPosition({x:35,z:-21.8});w.startPropInteraction('prop-rowboat');setTestCamera();window.ready=true;</script></body></html>`}));
await page.goto('http://127.0.0.1:4193/__rowboat_vest__');await page.waitForFunction(()=>window.ready,null,{timeout:90000});await page.waitForTimeout(500);
const fits=[];for(const avatar of['female','male']){
 if(avatar==='male'){await page.evaluate(()=>w.setAvatar('male'));await page.waitForFunction(()=>w.avatarStatus.id==='male'&&w.avatarStatus.state==='ready');await page.evaluate(()=>setTestCamera());await page.waitForTimeout(200);}
 fits.push(await page.evaluate(()=>({fit:w.propInteractions.lifeJacket.fit,visible:w.propInteractions.lifeJacket.root.visible,mode:w.getPropState().mode,player:w.avatarStatus.id})));
 await page.screenshot({path:fileURLToPath(new URL(`vest-${avatar}-front.png`,OUT))});
 await page.keyboard.down('w');await page.waitForTimeout(450);await page.keyboard.up('w');await page.screenshot({path:fileURLToPath(new URL(`vest-${avatar}-rowing.png`,OUT))});
}
await page.evaluate(()=>{w.thirdYaw=Math.PI/2;w.resolvedYaw=w.thirdYaw;w.lastManualLook=w.elapsed+100;});await page.waitForTimeout(300);await page.screenshot({path:fileURLToPath(new URL('vest-male-back.png',OUT))});
const life=await page.evaluate(()=>{w.endPropInteraction({immediate:true});const exitHidden=!w.propInteractions.lifeJacket.root.visible;return {exitHidden,mode:w.getPropState().mode,position:w.player.position.toArray(),parentIsScene:w.propInteractions.lifeJacket.root.parent===w.scene};});
await writeFile(new URL('life-jacket-report.json',OUT),JSON.stringify({fits,life,errors},null,2));console.log(JSON.stringify({fits,life,errors},null,2));await browser.close();
