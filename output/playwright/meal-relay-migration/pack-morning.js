async page => {
 const before=await page.evaluate(()=>__JIANGCHENG__.getState());
 await page.getByRole('button',{name:'三鲜豆皮',exact:true}).click();await page.getByRole('button',{name:'不放葱',exact:true}).click();await page.getByRole('button',{name:'不放辣',exact:true}).click();await page.getByRole('button',{name:'林婆婆',exact:true}).click();await page.getByRole('button',{name:'核对这份，封好盒',exact:true}).click();
 await page.getByRole('button',{name:/02 陈姐/}).click();await page.getByRole('button',{name:'热干面',exact:true}).click();await page.getByRole('button',{name:'撒在上面',exact:true}).click();
 await page.getByRole('button',{name:'先收好，待会儿继续'}).click();
 const saved=await page.evaluate(()=>__JIANGCHENG__.getState());
 if(!saved.meals.rounds.morning.boxes.lin.sealed||saved.meals.rounds.morning.boxes.chen.food!=='noodles')throw new Error('partial prepare not saved');
 await page.reload();await page.waitForFunction(()=>window.__JIANGCHENG__?.getPresentation().loading.state==='complete',null,{timeout:120000});
 await page.getByRole('button',{name:'窗口游玩'}).click();
 const restored=await page.evaluate(()=>__JIANGCHENG__.getState());
 if(JSON.stringify(saved.meals)!==JSON.stringify(restored.meals))throw new Error('refresh lost meal state');
 if(JSON.stringify(before.flags)!==JSON.stringify(restored.flags)||restored.lastEnding!=='true'||!restored.mealMorning)throw new Error('refresh lost old ending or morning');
 await page.keyboard.press('e');await page.getByRole('button',{name:'热干面',exact:true}).waitFor();
 if(await page.getByRole('button',{name:'热干面',exact:true}).getAttribute('aria-pressed')!=='true')throw new Error('UI did not restore unfinished box');
 await page.getByRole('group',{name:'辣椒的放法',exact:true}).getByRole('button',{name:'小碟另放',exact:true}).click();await page.getByRole('button',{name:'陈姐',exact:true}).click();await page.getByRole('button',{name:'核对这份，封好盒',exact:true}).click();
 await page.getByRole('button',{name:/03 小许/}).click();await page.getByRole('button',{name:'三鲜豆皮',exact:true}).click();await page.getByRole('group',{name:'葱花的放法',exact:true}).getByRole('button',{name:'小碟另放',exact:true}).click();await page.getByRole('button',{name:'不放辣',exact:true}).click();await page.getByRole('button',{name:'小许',exact:true}).click();await page.getByRole('button',{name:'核对这份，封好盒',exact:true}).click();
 await page.screenshot({path:'output/playwright/meal-relay-migration/morning-three-boxes.png'});
 await page.getByRole('button',{name:'提起保温篮，去交接'}).click();
 const dialogue=[];for(let n=0;n<20;n++){if(await page.locator('#story-next').isVisible()){dialogue.push(await page.locator('#overlay').textContent());await page.locator('#story-next').click();}else break;}
 const after=await page.evaluate(()=>__JIANGCHENG__.getState());
 if(Object.values(after.meals.rounds.morning.boxes).some(box=>!box.sealed||box.delivered))throw new Error('packed falsely delivered');
 if(after.meals.rounds.evening.started)throw new Error('morning wrote evening');
 return {refreshPreserved:true,oldFlagsPreserved:true,lastEnding:after.lastEnding,morning:after.meals.rounds.morning,evening:after.meals.rounds.evening,dialogue};
}
