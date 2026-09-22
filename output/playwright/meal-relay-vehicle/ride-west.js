async page=>{
 await page.locator('#map').click();await page.locator('#map-destination').selectOption('meal-west');await page.locator('#map-go').click();
 const samples=[];
 for(let n=0;n<180;n++){const s=await page.evaluate(()=>({p:__JIANGCHENG__.getWorld().position,route:__JIANGCHENG__.getWorld().remainingRoute,mode:__JIANGCHENG__.getProps().runtime.mode,near:__JIANGCHENG__.getPlayfulLife().nearbyOrder}));samples.push(s);if(s.near==='lin'||(!s.route&&n>8))break;await page.waitForTimeout(250);}
 const end=samples.at(-1);await page.screenshot({path:'output/playwright/meal-relay-vehicle/riding-route.png'});
 return {samples,end};
}
