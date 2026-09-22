async page => {
 await page.getByRole('button',{name:'街区地图 M'}).click();
 await page.locator('#map-destination').selectOption('chef');
 await page.screenshot({path:'output/playwright/meal-relay-migration/map-to-chef.png'});
 const start=await page.evaluate(()=>__JIANGCHENG__.getWorld().position), samples=[];
 await page.locator('#map-go').click();
 for(let n=0;n<180;n++){const sample=await page.evaluate(()=>({position:__JIANGCHENG__.getWorld().position,remaining:__JIANGCHENG__.getWorld().remainingRoute,near:__JIANGCHENG__.getNearest()}));samples.push(sample);if(sample.remaining===0&&Math.hypot(sample.position.x-10,sample.position.z-12)<3.2)break;await page.waitForTimeout(250);}
 const end=samples.at(-1);if(Math.hypot(end.position.x-10,end.position.z-12)>=3.2)throw new Error('did not physically reach chef');
 await page.screenshot({path:'output/playwright/meal-relay-migration/male-at-chef.png'});
 await page.keyboard.press('e');
 return {start,samples,modal:await page.evaluate(()=>__JIANGCHENG__.getModal())};
}
