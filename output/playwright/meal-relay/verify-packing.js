async (page) => {
 await page.getByRole('button',{name:'核对这份，封好盒',exact:true}).click();
 if(!(await page.getByRole('status').textContent()).includes('热食')) throw new Error('missing correction');
 if(!(await page.getByRole('button',{name:'核对这份，封好盒',exact:true}).evaluate(b=>b===document.activeElement))) throw new Error('lost keyboard focus');
 await page.getByRole('button',{name:'热干面',exact:true}).click();
 await page.getByRole('button',{name:'不放葱',exact:true}).click();
 await page.getByRole('button',{name:'先收好，待会儿继续',exact:true}).click();
 await page.getByRole('button',{name:'打开分装台',exact:true}).click();
 if(await page.getByRole('button',{name:'热干面',exact:true}).getAttribute('aria-pressed')!=='true') throw new Error('cancel lost food');
 if(await page.getByRole('button',{name:'不放葱',exact:true}).getAttribute('aria-pressed')!=='true') throw new Error('cancel lost condiment');
 await page.getByRole('button',{name:'不放辣',exact:true}).click();
 await page.getByRole('button',{name:'林婆婆',exact:true}).click();
 await page.screenshot({path:'output/playwright/meal-relay/packing-selected.png'});
 await page.getByRole('button',{name:'核对这份，封好盒',exact:true}).click();
 if(!(await page.getByRole('status').textContent()).includes('封好了')) throw new Error('not sealed');
 await page.screenshot({path:'output/playwright/meal-relay/packing-sealed.png'});
 console.log('Empty-box correction, keyboard focus, four ingredient controls, cancel-resume, explicit seal: passed.');
}
