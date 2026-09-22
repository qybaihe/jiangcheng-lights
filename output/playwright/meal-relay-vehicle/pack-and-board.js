async page=>{
 const records=[];
 async function walk(id){await page.locator('#map').click();await page.locator('#map-destination').selectOption(id);await page.locator('#map-go').click();const positions=[];for(let n=0;n<240;n++){const w=await page.evaluate(()=>__JIANGCHENG__.getWorld());positions.push(w.position);if(!w.remainingRoute){if(await page.locator('#first-vehicle-guide-confirm').isVisible()){await page.locator('#first-vehicle-guide-confirm').click();}break;}if(await page.locator('#first-vehicle-guide-confirm').isVisible()){await page.locator('#first-vehicle-guide-confirm').click();}await page.waitForTimeout(250);}records.push({id,positions});}
 async function finishTalk(){for(let n=0;n<30;n++){if(await page.locator('#story-next').isVisible())await page.locator('#story-next').click();else break;}}
 await page.getByRole('button',{name:'窗口游玩'}).click();await page.locator('#prop-guide').click();await page.getByRole('button',{name:'到蔡姨的分装台 ↗'}).click();await walk('chef');await page.keyboard.press('e');await finishTalk();
 await page.getByRole('button',{name:'热干面',exact:true}).click();await page.getByRole('button',{name:'不放葱',exact:true}).click();await page.getByRole('button',{name:'不放辣',exact:true}).click();await page.getByRole('button',{name:'林婆婆',exact:true}).click();await page.getByRole('button',{name:'核对这份，封好盒',exact:true}).click();
 await page.getByRole('button',{name:/02 陈姐/}).click();await page.getByRole('button',{name:'三鲜豆皮',exact:true}).click();await page.getByRole('button',{name:'撒在上面',exact:true}).click();await page.getByRole('group',{name:'辣椒的放法',exact:true}).getByRole('button',{name:'小碟另放',exact:true}).click();await page.getByRole('button',{name:'陈姐',exact:true}).click();await page.getByRole('button',{name:'核对这份，封好盒',exact:true}).click();
 await page.getByRole('button',{name:/03 小许/}).click();await page.getByRole('button',{name:'藕汤',exact:true}).click();await page.getByRole('button',{name:'撒在上面',exact:true}).click();await page.getByRole('button',{name:'不放辣',exact:true}).click();await page.getByRole('button',{name:'小许',exact:true}).click();await page.getByRole('button',{name:'核对这份，封好盒',exact:true}).click();await page.getByRole('button',{name:'提起保温篮，去交接'}).click();await finishTalk();
 await walk('prop-bicycle');
 if(await page.locator('#first-vehicle-guide-confirm').isVisible())await page.locator('#first-vehicle-guide-confirm').click();
 await page.keyboard.press('f');
 if(await page.locator('#first-vehicle-guide-confirm').isVisible()){await page.locator('#first-vehicle-guide-confirm').click();await page.keyboard.press('f');}
 await page.waitForFunction(()=>__JIANGCHENG__.getProps().runtime.mode==='bicycle',null,{timeout:10000});
 const before=await page.evaluate(()=>({p:__JIANGCHENG__.getWorld().position,meals:__JIANGCHENG__.getState().meals,life:__JIANGCHENG__.getPlayfulLife(),props:__JIANGCHENG__.getProps().runtime}));
 await page.keyboard.down('w');await page.waitForTimeout(1200);await page.keyboard.up('w');
 const after=await page.evaluate(()=>({p:__JIANGCHENG__.getWorld().position,meals:__JIANGCHENG__.getState().meals,life:__JIANGCHENG__.getPlayfulLife(),props:__JIANGCHENG__.getProps().runtime}));
 if(Math.hypot(before.p.x-after.p.x,before.p.z-after.p.z)<1)throw new Error('bicycle did not move');if(JSON.stringify(before.meals)!==JSON.stringify(after.meals))throw new Error('bicycle lost meals');if(after.life.scenery.carried!==3)throw new Error('carrier not visible');await page.screenshot({path:'output/playwright/meal-relay-vehicle/riding-with-three-meals.png'});
 return {records,before,after,passed:true};
}
