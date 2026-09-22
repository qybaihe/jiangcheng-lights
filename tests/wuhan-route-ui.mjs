import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

// Isolated file-based UI verification: no dev server, build, 3D runtime, media
// generation or player save is touched. Main integration owns the real scene QA.
const out=new URL('../output/playwright/wuhan-route/',import.meta.url);
await mkdir(out,{recursive:true});
const asset=path=>new URL('../'+path,import.meta.url).href;
const styles=['src/style.css','src/ui/wuhan-exploration.css','src/ui/prop-interactions.css','src/ui/world-hud-theme.css','src/ui/wuhan-route.css'];
const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>外公的顺路地图 · 独立 UI 验收</title>${styles.map(path=>`<link rel="stylesheet" href="${asset(path)}">`).join('')}<style>
*{box-sizing:border-box}body{margin:0;background:#dce5cd;--serif:"Songti SC","SimSun",serif;--sans:"PingFang SC",sans-serif}button{font-family:inherit}#fixture-map{position:absolute;inset:25px 32px auto;width:calc(100% - 64px);margin:auto;max-height:calc(100vh - 50px);overflow:auto}.fixture-map-head{display:flex;align-items:center;justify-content:space-between;padding:0 0 15px;margin:0 0 16px;border-bottom:1px solid #ccbd91}.fixture-map-head h1{margin:0;font:500 23px var(--serif);color:#315e51}.fixture-map-head small{font-size:10px;color:#88764e}.fixture-tabs{display:flex;gap:28px;margin-bottom:20px;color:#516f5b;font-size:12px}.fixture-tabs strong{border-bottom:2px solid #3b715b;padding-bottom:9px}.wuhan-route-sheet{margin-bottom:4px}#hud{position:absolute;inset:0}#fixture-map[hidden],#hud[hidden]{display:none}.fixture-label{position:fixed;right:28px;top:32px;font-size:11px;letter-spacing:1px;color:#6d8064}.fixture-ground{position:fixed;inset:0;background:radial-gradient(ellipse at 75% 15%,#eff3ded9,transparent 65%),linear-gradient(140deg,#c0d5b3,#e1e7cd);z-index:-2}.location-note{height:59px}.route-guide{display:grid!important}.quest p{max-width:230px}.controls-hint{min-height:65px}.fixture-blank{position:absolute;left:37%;top:47%;color:#6d806459;font:24px var(--serif);letter-spacing:6px}.wuhan-route-hud{z-index:10}
</style></head><body class="playing"><div class="fixture-ground"></div><main id="fixture-map" class="paper-panel map-panel wuhan-map-panel"><header class="fixture-map-head"><h1>晴川里 · 江城漫游图</h1><small>WUHAN · 从里分巷口，走到轮渡江风</small></header><nav class="fixture-tabs"><span>街区地图</span><strong>外公的顺路地图</strong></nav><div id="fixture-sheet"></div></main><div id="hud" hidden><small class="fixture-label">独立 UI 尺寸验收 · 实景由主程序绘制</small><div class="fixture-blank">让画面中央留给街巷</div><section class="quest"><div class="quest-chapter">第一章 · 一条巷子的照应</div><div class="quest-line"><i class="quest-dot"></i><h2>把外公留下的东西送到</h2></div><p>收音机、旧灯和手电，各有要去的地方。先问问街坊，再接着走。</p><button id="quest-route">看看接下来的委托 ↗</button></section><aside class="route-guide" id="route-guide"><span class="route-direction">↑</span><div><strong>燕归里的门牌</strong><small>沿公共通道往东，停好车，再走进里分。</small></div><span id="route-distance">约 46 米</span><button id="route-stop">×</button></aside><div class="location-note"><span>晴川里 · 旧修理铺</span><small>屋檐下的日常，沿着江风连起来。</small></div><div class="controls-hint">W / A / S / D 走动 · M 地图 · J 手账<button id="help-btn">?</button></div></div><script type="module">
import {wuhanRouteMarkup,bindWuhanRoute,mountWuhanRouteHUD} from '${asset('src/ui/wuhan-route.js')}';
const state={lore:[],wuhanVisits:[],props:{ferryRides:0},flags:[]};let active=false,selectedId=null,modal=false,targetId=null;const world={active:true,blocked:false};
const sheet=document.querySelector('#fixture-sheet'),map=document.querySelector('#fixture-map'),parent=document.querySelector('#hud');const calls=[];
function render(){sheet.innerHTML=wuhanRouteMarkup(state,{active,selectedId});}
function start(id){calls.push(['route',id]);active=true;targetId=id;map.hidden=true;parent.hidden=false;hud.update();}
const binding=bindWuhanRoute(sheet,{onRoute:start,onStop(id){calls.push(['stop',id]);selectedId=id;render();},onCollapse(){active=false;render();},onMain(){calls.push(['main']);active=false;render();}});
const hud=mountWuhanRouteHUD({parent,getState:()=>state,getWorld:()=>world,isActive:()=>active,isModal:()=>modal,getTargetId:()=>targetId,onRoute:start,onCollapse(){active=false;hud.update();},onMain(){calls.push(['main']);active=false;hud.update();}});
render();window.fixture={state,calls,showMap(){map.hidden=false;parent.hidden=true;render();},showHUD(){map.hidden=true;parent.hidden=false;hud.update();},setActive(value){active=value;hud.update();},setModal(value){modal=value;hud.update();},setProgress(value){Object.assign(state,value);render();hud.update();},snapshot(){return {active,selectedId,targetId,hud:hud.diagnostics()};},dispose(){binding.dispose();hud.dispose();}};window.__ready=true;
</script></body></html>`;
const fixture=new URL('fixture.html',out);await writeFile(fixture,html);
const report={scope:'File-based isolated UI at 1440×900 and 1280×720; real source modules, no 3D/map navigation or save integration.',startedAt:new Date().toISOString(),checks:[],screenshots:[],errors:[]};
const check=(ok,name,details={})=>{report.checks.push({name,passed:Boolean(ok),...details});assert.ok(ok,name);};
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--allow-file-access-from-files']});
try{
 for(const viewport of [{width:1440,height:900},{width:1280,height:720}]){
  const page=await browser.newPage({viewport,deviceScaleFactor:1});page.on('pageerror',error=>report.errors.push(error.message));
  await page.goto(fixture.href);await page.waitForFunction(()=>window.__ready===true);await page.waitForTimeout(350);
  const label=viewport.width+'x'+viewport.height;
  const geometry=await page.evaluate(()=>{
   const bounds=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};
   return {sheet:bounds('.wuhan-route-sheet'),track:bounds('.wuhan-route-track'),panel:bounds('#fixture-map'),buttons:[...document.querySelectorAll('[data-wuhan-route-stop]')].map(element=>({rect:element.getBoundingClientRect().toJSON(),text:element.textContent})),pageWidth:document.documentElement.scrollWidth,windowWidth:innerWidth};
  });
  check(geometry.sheet.bottom<=viewport.height-20,label+' route sheet fits inside a single map page',geometry);
  check(geometry.pageWidth===geometry.windowWidth,label+' no page-level horizontal overflow');
  check(geometry.buttons.length===7&&geometry.buttons.every(item=>item.rect.width>=48&&item.rect.height>=48),label+' seven real 48px-or-larger stop targets');
  await page.screenshot({path:fileURLToPath(new URL('sheet-'+label+'.png',out))});report.screenshots.push('sheet-'+label+'.png');
  for(const id of ['noodles','wuhan-lifen','wuhan-breakfast','wuhan-bridge','wuhan-market','wuhan-ferry','prop-ferry']){
   await page.locator('[data-wuhan-route-stop="'+id+'"]').click();
   check(await page.locator('[data-wuhan-route-start]').getAttribute('data-wuhan-route-start')===id,label+' selecting '+id+' only changes the route card');
  }
  check((await page.evaluate(()=>fixture.calls)).every(item=>item[0]==='stop'),label+' browsing the sheet never initiates navigation');
  check(await page.locator('.wuhan-route-do kbd').textContent()==='F',label+' actual dock displays F rather than district E');
  await page.locator('[data-wuhan-route-stop="wuhan-lifen"]').click();await page.locator('#fixture-sheet [data-wuhan-route-start="wuhan-lifen"]').click();
  check(await page.locator('#wuhan-route-hud').isVisible(),label+' deliberately starting the route shows the narrow HUD');
  const hudBounds=await page.evaluate(()=>{
   const rect=selector=>document.querySelector(selector).getBoundingClientRect().toJSON();return {hud:rect('#wuhan-route-hud'),route:rect('#route-guide'),quest:rect('.quest'),caption:rect('.location-note'),buttons:[...document.querySelectorAll('#wuhan-route-hud button')].map(element=>element.getBoundingClientRect().toJSON())};
  });
  check(hudBounds.hud.y>=hudBounds.route.bottom+5,label+' route card clears the existing direction guide',hudBounds);
  check(hudBounds.hud.bottom+5<=hudBounds.caption.y,label+' route card clears the location caption',hudBounds);
  check(hudBounds.hud.right<viewport.width*.3,label+' central character sightline remains empty',hudBounds);
  check(hudBounds.buttons.every(rect=>rect.width>=48&&rect.height>=48),label+' all three compact HUD controls remain at least 48px');
  await page.screenshot({path:fileURLToPath(new URL('hud-'+label+'.png',out))});report.screenshots.push('hud-'+label+'.png');
  await page.evaluate(()=>fixture.setProgress({wuhanVisits:['wuhan-lifen']}));
  check((await page.locator('#wuhan-route-hud').textContent()).includes('01 · 蔡记过早'),label+' earned selected stop exposes next suggestion, without auto-navigation');
  check((await page.evaluate(()=>fixture.calls.filter(item=>item[0]==='route'))).length===1,label+' only the player start button has triggered navigation');
  await page.evaluate(()=>fixture.setModal(true));check(!await page.locator('#wuhan-route-hud').isVisible(),label+' 3D dialogue/modal hides the itinerary HUD');
  await page.evaluate(()=>fixture.setModal(false));await page.locator('#wuhan-route-hud [data-wuhan-route-collapse]').click();
  check(!await page.locator('#wuhan-route-hud').isVisible(),label+' collapse actually leaves the HUD hidden');
  await page.evaluate(()=>{fixture.setActive(true);fixture.setProgress({flags:['prepared']});});
  check(await page.locator('#wuhan-route-hud [data-wuhan-route-start]').isDisabled(),label+' preparation phase disables optional route start');
  await page.evaluate(()=>{fixture.setProgress({flags:['checked','ending','postlude']});});
  check(!await page.locator('#wuhan-route-hud [data-wuhan-route-start]').isDisabled(),label+' confirmed postlude reopens optional wandering');
  await page.locator('#wuhan-route-hud [data-wuhan-route-main]').click();
  check(!await page.locator('#wuhan-route-hud').isVisible()&&(await page.evaluate(()=>fixture.calls.at(-1)[0]))==='main',label+' return-to-main action delegates and folds the route');
  for(const id of ['noodles','wuhan-lifen','wuhan-breakfast','wuhan-bridge','wuhan-market','wuhan-ferry','prop-ferry']){
   await page.evaluate(()=>{fixture.setProgress({lore:[],wuhanVisits:[],props:{ferryRides:0},flags:[]});fixture.showMap();});
   await page.locator('[data-wuhan-route-stop="'+id+'"]').click();await page.locator('#fixture-sheet [data-wuhan-route-start="'+id+'"]').click();
   const bounds=await page.evaluate(()=>({hud:document.querySelector('#wuhan-route-hud').getBoundingClientRect().toJSON(),caption:document.querySelector('.location-note').getBoundingClientRect().toJSON()}));
   check(bounds.hud.bottom+5<=bounds.caption.y,label+' '+id+' HUD copy stays clear of the location caption',bounds);
  }
  await page.evaluate(()=>{fixture.setProgress({lore:['noodles'],wuhanVisits:['wuhan-lifen','wuhan-breakfast','wuhan-market'],props:{ferryRides:0},flags:[]});fixture.showMap();});
  await page.locator('[data-wuhan-route-stop="wuhan-ferry"]').click();
  check(await page.locator('.wuhan-route-track .is-done').count()===4,label+' completed and pending stamps are visually distinct');
  await page.screenshot({path:fileURLToPath(new URL('sheet-progress-'+label+'.png',out))});report.screenshots.push('sheet-progress-'+label+'.png');
  await page.evaluate(()=>fixture.dispose());await page.close();
 }
 check(report.errors.length===0,'no browser script errors',report.errors);report.status='passed';
}catch(error){report.status='failed';report.error=error.stack;throw error;}finally{await browser.close();await writeFile(new URL('report.json',out),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,passed:report.checks.filter(check=>check.passed).length,total:report.checks.length,out:fileURLToPath(out)},null,2));}
