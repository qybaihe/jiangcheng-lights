async page=>{
 const before=await page.evaluate(()=>({meals:__JIANGCHENG__.getState().meals,props:__JIANGCHENG__.getProps().runtime,position:__JIANGCHENG__.getWorld().position}));
 await page.keyboard.press('f');await page.waitForFunction(()=>__JIANGCHENG__.getProps().runtime.mode==='walk');
 const dismounted=await page.evaluate(()=>({meals:__JIANGCHENG__.getState().meals,props:__JIANGCHENG__.getProps().runtime,position:__JIANGCHENG__.getWorld().position}));if(JSON.stringify(before.meals)!==JSON.stringify(dismounted.meals))throw new Error('dismount lost meals');
 await page.locator('#map').click();await page.locator('#map-destination').selectOption('meal-west');await page.locator('#map-go').click();const samples=[];
 for(let n=0;n<120;n++){const s=await page.evaluate(()=>({p:__JIANGCHENG__.getWorld().position,route:__JIANGCHENG__.getWorld().remainingRoute,near:__JIANGCHENG__.getPlayfulLife().nearbyOrder}));samples.push(s);if(s.near==='lin'&&!s.route)break;await page.waitForTimeout(250);}
 if(samples.at(-1).near!=='lin')throw new Error('on-foot handover point not reached');await page.locator('.life-world-action').click();
 await page.waitForFunction(()=>__JIANGCHENG__.getState().meals.rounds.evening.boxes.lin.delivered);
 const after=await page.evaluate(()=>({state:__JIANGCHENG__.getState(),life:__JIANGCHENG__.getPlayfulLife()}));
 if(after.state.meals.rounds.evening.boxes.chen.delivered||after.state.meals.rounds.evening.boxes.xu.delivered)throw new Error('one click handed multiple boxes');
 await page.screenshot({path:'output/playwright/meal-relay-vehicle/dismounted-one-handover.png'});
 return {passed:true,before,dismounted,samples,after};
}
