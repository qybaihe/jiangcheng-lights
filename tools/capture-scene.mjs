import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const output=fileURLToPath(new URL('../output/qa/',import.meta.url));
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1600,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const base=process.env.GAME_URL||'http://localhost:5173';
await page.goto(base);await page.locator('#boot').waitFor({state:'hidden',timeout:60000});
await page.waitForTimeout(1000);await page.locator('#start').click();
await page.locator('#map').click();await page.locator('[data-place="shop"]').click();await page.locator('#map-go').click();
await page.waitForFunction(()=>window.__JIANGCHENG__.getNearest()==='shop'&&window.__JIANGCHENG__.getWorld().remainingRoute===0,null,{timeout:60000});
await page.waitForTimeout(1800);await page.screenshot({path:output+'14-shop-atmosphere.png'});
const sample=()=>page.evaluate(()=>new Promise(resolve=>{
 const frames=[];let previous=performance.now(),started=previous;
 function next(now){frames.push(now-previous);previous=now;if(now-started<5000)requestAnimationFrame(next);else{
 frames.shift();const sorted=[...frames].sort((a,b)=>a-b),gl=document.querySelector('#world').getContext('webgl2');
 const debug=gl.getExtension('WEBGL_debug_renderer_info');
 resolve({fps:Math.round(1000/(frames.reduce((a,b)=>a+b,0)/frames.length)*10)/10,medianFrameMs:sorted[Math.floor(sorted.length/2)],p95FrameMs:sorted[Math.floor(sorted.length*.95)],renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),world:window.__JIANGCHENG__.getWorld()});
 }}requestAnimationFrame(next);
}));
const high=await sample();
await page.locator('#view-mode').click();await page.waitForTimeout(900);await page.screenshot({path:output+'15-street-overview.png'});
const highOverview=await sample();
await page.locator('#settings').click();await page.locator('#set-quality').selectOption('low');await page.locator('.close').click();await page.waitForTimeout(900);const lowOverview=await sample();
await page.locator('#view-mode').click();await page.waitForTimeout(1200);const low=await sample();
await writeFile(output+'visual-performance.json',JSON.stringify({base,viewport:{width:1600,height:1000},high,low,highOverview,lowOverview,conditions:'Isolated headless Chrome page; in-app preview paused on title; high/low use the same shop and overview camera modes.',errors,when:new Date().toISOString()},null,2));
console.log(JSON.stringify({high,low,highOverview,lowOverview,errors}));await browser.close();
