import {chromium} from '@playwright/test';
const b=await chromium.launch({headless:true,channel:'chrome'}),p=await b.newPage({viewport:{width:1000,height:750}});
await p.goto('http://localhost:5173');await p.locator('#boot').waitFor({state:'hidden'});await p.locator('#start').click();await p.locator('#settings').click();await p.locator('#set-quality').selectOption('low');await p.locator('.close').click();
for(const id of ['box','water','battery','chef']){await p.locator('#map').click();await p.locator(`[data-place="${id}"]`).click();await p.locator('#map-go').click();const before=Date.now();try{await p.waitForFunction(id=>window.__JIANGCHENG__.getNearest()===id,id,{timeout:45000});console.log(id,'arrived',Date.now()-before,await p.evaluate(()=>window.__JIANGCHENG__.getWorld().position));}catch(e){console.log('FAILED',id,await p.evaluate(()=>window.__JIANGCHENG__.getWorld().position));throw e;}}
await b.close();
