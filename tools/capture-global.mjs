import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
const dir='output/qa/global';await fs.mkdir(dir,{recursive:true});
const b=await chromium.launch({headless:true,channel:'chrome'}),p=await b.newPage({viewport:{width:1440,height:900}});
p.on('pageerror',e=>console.log('ERROR',e.message));
await p.goto('http://localhost:5173');await p.locator('#boot').waitFor({state:'hidden',timeout:60000});await p.locator('#start').click();await p.waitForTimeout(4000);await p.screenshot({path:dir+'/01-street.png'});
await p.locator('#map').click();await p.waitForTimeout(500);await p.screenshot({path:dir+'/02-map.png'});await p.locator('#map-destination').selectOption('shop');await p.locator('#map-go').click();await p.waitForFunction(()=>window.__JIANGCHENG__.getWorld().remainingRoute===0,{timeout:30000});await p.waitForTimeout(1200);await p.locator('#first-person').click();await p.waitForTimeout(500);await p.screenshot({path:dir+'/03-first-person.png'});console.log(JSON.stringify(await p.evaluate(()=>window.__JIANGCHENG__.getWorld())));
await p.setViewportSize({width:390,height:844});await p.screenshot({path:dir+'/04-mobile-first.png'});await p.locator('#map').click();await p.waitForTimeout(500);await p.screenshot({path:dir+'/05-mobile-map.png'});await b.close();
