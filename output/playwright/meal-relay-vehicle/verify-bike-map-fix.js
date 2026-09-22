async page=>{
 const saved=await page.evaluate(()=>__JIANGCHENG__.getState().meals);
 await page.reload();await page.waitForFunction(()=>window.__JIANGCHENG__?.getPresentation().loading.state==='complete',null,{timeout:120000});await page.getByRole('button',{name:'窗口游玩'}).click();
 if(JSON.stringify(saved)!==JSON.stringify(await page.evaluate(()=>__JIANGCHENG__.getState().meals)))throw new Error('reload changed earned meals');
 await page.locator('#map').click();await page.locator('#map-destination').selectOption('prop-bicycle');await page.locator('#map-go').click();
 const toBike=[];for(let n=0;n<180;n++){const s=await page.evaluate(()=>({position:__JIANGCHENG__.getWorld().position,route:__JIANGCHENG__.getWorld().remainingRoute,near:__JIANGCHENG__.getProps().nearby?.id}));toBike.push(s);if(!s.route&&s.near==='prop-bicycle')break;await page.waitForTimeout(250);}
 await page.keyboard.press('f');await page.waitForFunction(()=>__JIANGCHENG__.getProps().runtime.mode==='bicycle');
 await page.locator('#map').click();await page.locator('#map-destination').selectOption('meal-west');
 const label=await page.locator('#map-go').textContent(),inMapMode=await page.evaluate(()=>__JIANGCHENG__.getProps().runtime.mode);
 if(label!=='下车并步行过去')throw new Error('new bicycle map label missing');if(inMapMode!=='bicycle')throw new Error('map itself dismounted unexpectedly');
 await page.screenshot({path:'output/playwright/meal-relay-vehicle/map-dismount-fixed.png'});
 await page.locator('#map-go').click();
 await page.waitForFunction(()=>__JIANGCHENG__.getProps().runtime.mode==='walk');
 const walk=[];for(let n=0;n<180;n++){const s=await page.evaluate(()=>({position:__JIANGCHENG__.getWorld().position,route:__JIANGCHENG__.getWorld().remainingRoute,mode:__JIANGCHENG__.getProps().runtime.mode,near:__JIANGCHENG__.getPlayfulLife().nearbyOrder}));walk.push(s);if(!s.route&&s.near==='chen')break;await page.waitForTimeout(250);}
 if(walk.at(-1).near!=='chen'||walk.some(s=>s.mode!=='walk'))throw new Error('did not safely walk to recipient');
 if(JSON.stringify(saved)!==JSON.stringify(await page.evaluate(()=>__JIANGCHENG__.getState().meals)))throw new Error('navigation changed meals');
 await page.screenshot({path:'output/playwright/meal-relay-vehicle/map-walk-arrived-fixed.png'});
 return {passed:true,build:await page.evaluate(()=>[...document.scripts].map(s=>s.src)),buttonLabel:label,inMapMode,toBike,walk,mealsUnchanged:true};
}
