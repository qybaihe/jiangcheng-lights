async page => {
 await page.getByRole('button',{name:'翻到第二天，去看便签 →'}).click();
 const dialogue=[];
 for(let n=0;n<40;n++){if(await page.locator('.meal-packing').isVisible())break;if(await page.locator('#story-next').isVisible()){dialogue.push((await page.locator('#overlay').textContent()).trim());await page.locator('#story-next').click();}else await page.waitForTimeout(100);}
 if(!(await page.locator('.meal-packing').isVisible()))throw new Error('morning packing did not open');
 await page.screenshot({path:'output/playwright/meal-relay-migration/morning-packing.png'});
 return {dialogue,state:await page.evaluate(()=>__JIANGCHENG__.getState()),modal:await page.evaluate(()=>__JIANGCHENG__.getModal())};
}
