async (page) => {
 await page.reload();
 const progress=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('meal-test')));
 if(Object.values(progress.rounds.evening.boxes).some(box=>!box.sealed||box.delivered))throw new Error('packing should not deliver');
 await page.getByRole('button',{name:'提起保温篮，去交接',exact:true}).click();
 await page.screenshot({path:'output/playwright/meal-relay/delivery-hud.png'});
 await page.getByRole('button',{name:'陈姐 西巷接力点'}).click();
 if(!(await page.locator('#events').textContent()).includes('meal-west'))throw new Error('missing route callback');
 await page.getByRole('button',{name:'打开分装台'}).click();
 await page.setViewportSize({width:390,height:844});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
 if(overflow)throw new Error('mobile overflow');
 await page.screenshot({path:'output/playwright/meal-relay/packing-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1000});
 await page.screenshot({path:'output/playwright/meal-relay/packing-complete.png'});
 console.log('All 3 sealed, no fake delivery, HUD navigation, 390px responsiveness: passed.');
}
