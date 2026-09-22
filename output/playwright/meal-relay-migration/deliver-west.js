async page => {
 await page.getByRole('button',{name:'街区地图 M'}).click();await page.locator('#map-destination').selectOption('meal-west');await page.screenshot({path:'output/playwright/meal-relay-migration/map-west.png'});
 const samples=[];await page.locator('#map-go').click();
 for(let n=0;n<220;n++){const p=await page.evaluate(()=>({position:__JIANGCHENG__.getWorld().position,remaining:__JIANGCHENG__.getWorld().remainingRoute,near:__JIANGCHENG__.getPlayfulLife().nearbyOrder,grounded:__JIANGCHENG__.getWorld().playerMotion.grounded}));samples.push(p);if(!p.remaining&&p.near==='lin'&&p.grounded)break;await page.waitForTimeout(250);}
 if(samples.at(-1).near!=='lin')throw new Error('could not walk to west handover');
 await page.locator('.life-world-action').click();
 await page.waitForFunction(()=>__JIANGCHENG__.getState().meals.rounds.morning.boxes.lin.delivered);
 await page.screenshot({path:'output/playwright/meal-relay-migration/lin-handed-over.png'});
 await page.waitForFunction(()=>document.querySelector('.life-world-action')?.textContent.includes('陈姐的'));
 await page.locator('.life-world-action').click();
 await page.waitForFunction(()=>__JIANGCHENG__.getState().meals.rounds.morning.boxes.chen.delivered);
 await page.screenshot({path:'output/playwright/meal-relay-migration/chen-handed-over.png'});
 return {samples,state:await page.evaluate(()=>__JIANGCHENG__.getState()),life:await page.evaluate(()=>__JIANGCHENG__.getPlayfulLife())};
}
