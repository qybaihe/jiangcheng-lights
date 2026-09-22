async page => {
 await page.reload();await page.waitForFunction(()=>window.__JIANGCHENG__?.getPresentation().loading.state==='complete',null,{timeout:120000});
 await page.getByRole('button',{name:'窗口游玩'}).click();
 await page.getByRole('button',{name:'巷中生活：骑车、驾驶、划船与小赛'}).click();
 await page.getByRole('button',{name:'翻到次晨，送过早 ↗'}).click();
 return await page.evaluate(()=>({modal:__JIANGCHENG__.getModal(),life:__JIANGCHENG__.getPlayfulLife(),state:__JIANGCHENG__.getState(),build:[...document.scripts].map(s=>s.src)}));
}
