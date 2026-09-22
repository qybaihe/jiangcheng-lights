async page => {
 const before=await page.evaluate(()=>__JIANGCHENG__.getState());
 await page.reload();await page.waitForFunction(()=>window.__JIANGCHENG__?.getPresentation().loading.state==='complete',null,{timeout:120000});await page.getByRole('button',{name:'窗口游玩'}).click();
 const restored=await page.evaluate(()=>__JIANGCHENG__.getState());if(JSON.stringify(restored.meals)!==JSON.stringify(before.meals))throw new Error('delivered meals lost on refresh');
 await page.getByRole('button',{name:'街区地图 M'}).click();await page.locator('#map-destination').selectOption('meal-community');await page.screenshot({path:'output/playwright/meal-relay-migration/map-community.png'});
 const samples=[];await page.locator('#map-go').click();
 for(let n=0;n<220;n++){const p=await page.evaluate(()=>({position:__JIANGCHENG__.getWorld().position,remaining:__JIANGCHENG__.getWorld().remainingRoute,near:__JIANGCHENG__.getPlayfulLife().nearbyOrder,grounded:__JIANGCHENG__.getWorld().playerMotion.grounded}));samples.push(p);if(!p.remaining&&p.near==='xu'&&p.grounded)break;await page.waitForTimeout(250);}
 if(samples.at(-1).near!=='xu')throw new Error('could not walk to community handover');
 await page.locator('.life-world-action').click();await page.waitForFunction(()=>__JIANGCHENG__.getState().meals.rounds.morning.boxes.xu.delivered);
 await page.screenshot({path:'output/playwright/meal-relay-migration/xu-handed-over.png'});
 const dialogue=[];for(let n=0;n<20;n++){if(await page.locator('#story-next').isVisible()){dialogue.push(await page.locator('#overlay').textContent());await page.locator('#story-next').click();}else break;}
 const state=await page.evaluate(()=>__JIANGCHENG__.getState()),gallery=await page.evaluate(()=>JSON.parse(localStorage.getItem('jiangcheng-lights-gallery-v3')));
 if(Object.values(state.meals.rounds.morning.boxes).some(box=>!box.delivered))throw new Error('not all meals handed over');
 if(state.meals.rounds.evening.started||Object.values(state.meals.rounds.evening.boxes).some(box=>box.sealed||box.delivered))throw new Error('morning leaked into evening');
 if(JSON.stringify(state.flags)!==JSON.stringify(before.flags)||state.lastEnding!==before.lastEnding||JSON.stringify(state.storyChoices)!==JSON.stringify(before.storyChoices))throw new Error('morning changed old ending');
 if(!gallery.unlocked['meal-morning']||gallery.unlocked['meal-evening'])throw new Error('incorrect gallery reward');
 await page.getByRole('button',{name:'巷中生活：骑车、驾驶、划船与小赛'}).click();
 const receipts=page.getByRole('button',{name:'看看回执 ↗'});if(await receipts.count()!==1)throw new Error('morning receipt missing or fake evening receipt');await receipts.click();
 await page.screenshot({path:'output/playwright/meal-relay-migration/morning-receipt.png'});
 return {passed:true,samples,dialogue,state,gallery,deliveredRefreshPreserved:true,flagsPreserved:true,roundsIsolated:true};
}
