// Isolated visual QA: no game save, no game navigation, no production build.
// Run: node tests/character-motion-qa.mjs
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=process.env.QA_DIR?fileURLToPath(new URL(process.env.QA_DIR.replace(/\/$/,'')+'/', 'file://'+root)):fileURLToPath(new URL('../output/qa/character-motion-v2/',import.meta.url));
await mkdir(output,{recursive:true});
const server=await createServer({root,configFile:false,server:{host:'127.0.0.1',port:4196,strictPort:true,hmr:false},logLevel:'error'});
const html=String.raw`<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;background:#ecebdc;color:#315348;font:14px sans-serif}canvas{display:block;width:1800px;height:1050px}.labels{position:absolute;inset:0;display:grid;grid-template-columns:repeat(3,600px);grid-template-rows:repeat(2,525px);pointer-events:none}.labels>div{padding:25px 30px;border:1px solid #31534819}.labels b{font-family:serif;font-size:23px;display:block;letter-spacing:2px}.labels span{font-size:11px;display:block;margin-top:7px;color:#6e8068;letter-spacing:1px}
</style></head><body><canvas id="view"></canvas><div class="labels"><div><b>阿遥 · 站姿</b><span>连续衣袖 / 自然重心</span></div><div><b>随身的旧物</b><span>背包 / 束发 / 弹性挂点</span></div><div><b>跑步 · 飞行相</b><span>双脚离地 / 膝肘错相</span></div><div><b>起跳 · 收腿</b><span>离地 0.17 秒 / 前后腿分离</span></div><div><b>下降 · 预着地</b><span>离地 0.52 秒 / 腿部展开</span></div><div><b>落地 · 缓冲</b><span>着地 0.10 秒 / 重心下沉</span></div></div><script type="module">
import * as THREE from '/node_modules/three/build/three.module.js';
import {createCharacter} from '/src/characters.js';
import {updateTownLife} from '/src/town-life.js';
const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('#view'),antialias:true});
renderer.setSize(1800,1050,false);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const results=[],panels=[];
const residents=new URLSearchParams(location.search).get('mode')==='residents';
if(residents){const labels=[['林婆婆 · 竹扇','细框眼镜 / 灰白发髻'],['蔡姨 · 过早','短袖 / 围裙 / 厨房巾'],['周伯 · 老码头','船工帽 / 搪瓷杯'],['小许 · 社区','工作背心 / 记录夹'],['握持 · 竹扇','肘部抬起 / 扇柄随腕'],['握持 · 搪瓷杯','手握杯柄 / 杯口保持水平']];document.querySelectorAll('.labels>div').forEach((el,i)=>el.innerHTML='<b>'+labels[i][0]+'</b><span>'+labels[i][1]+'</span>');}
function panel(index){
 const scene=new THREE.Scene();scene.background=new THREE.Color(index%2?'#e6e8d8':'#eef0df');
 scene.add(new THREE.HemisphereLight('#fff8df','#7e9a8b',2.2));const sun=new THREE.DirectionalLight('#fff1d1',2.7);sun.position.set(-3,5,4);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-2,right:2,top:3,bottom:-2,near:.1,far:15});sun.shadow.normalBias=.025;scene.add(sun);
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:'#d5ddc7',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.003;ground.receiveShadow=true;scene.add(ground);
 const id=residents?['granny','chef','dock','community','granny','dock'][index]:'player';
 const actor=createCharacter(null,'#f5e7c7','#477c88',!residents,id);scene.add(actor);
 const world={player:residents?new THREE.Group():actor,npcs:residents?[{id,group:actor}]:[],active:true,suspended:false,blocked:false,reduced:false,walking:false,moveSpeed:0,movementDistance:0,heightAt:()=>0,canWalk:()=>true,playerMotion:{grounded:true,phase:'grounded',acceleration:0}};
 const speed=!residents&&index===2?5.6:0;world.moveSpeed=speed;world.walking=speed>0;world.movementDistance=speed/60;
 for(let i=0;i<150;i++)updateTownLife(world,1/60,i/60);
 if(!residents&&index===2){actor.userData.townLife.gait=.405;updateTownLife(world,.00001,3);}
 if(!residents&&(index===3||index===4)){
   const end=index===3?.17:.52;
   for(let t=0;t<=end;t+=1/120){const height=Math.max(0,6.6*t-11*t*t);world.playerMotion={grounded:false,phase:t<.3?'rising':'falling',takeoffTime:t,verticalVelocity:6.6-22*t,heightAboveGround:height,acceleration:0};actor.position.y=height;updateTownLife(world,1/120,3+t);}
 }
 if(!residents&&index===5){for(let t=0;t<=.10;t+=1/120){world.playerMotion={grounded:true,phase:'landing',landingTime:t,impactSpeed:6.6,acceleration:0};updateTownLife(world,1/120,3+t);}}
 actor.rotation.y=residents?-.18:index===1?Math.PI+.32:index===2?-.55:.16;actor.updateMatrixWorld(true);actor.userData.characterMesh.skeleton.update();
 const camera=new THREE.PerspectiveCamera(31,600/525,.1,30);camera.position.set(index===1?-2.5:-3.0,index===3||index===4?2.2:1.55,index===3||index===4?5.7:4.05);camera.lookAt(0,index===3||index===4?1.38:.93,0);
 if(residents){camera.position.set(index>=4?-1.2:-2.4,index>=4?1.65:1.6,index>=4?2.05:4.35);camera.lookAt(0,index>=4?1.08:.88,.02);}
 const life=actor.userData.townLife,mesh=actor.userData.characterMesh;
 results.push({index,id,triangles:mesh.geometry.attributes.position.count/3,bones:mesh.skeleton.bones.length,finite:mesh.skeleton.boneMatrices.every(Number.isFinite),phase:world.playerMotion.phase,planted:life.feet.map(f=>f.planted),knees:actor.userData.rig.knees.map(b=>b.rotation.x),backpack:actor.userData.rig.backpack?.rotation.toArray().slice(0,3)||null});
 panels.push({scene,camera});
}
for(let i=0;i<6;i++)panel(i);
renderer.setScissorTest(true);panels.forEach(({scene,camera},i)=>{const x=(i%3)*600,y=(1-Math.floor(i/3))*525;renderer.setViewport(x,y,600,525);renderer.setScissor(x,y,600,525);renderer.render(scene,camera);});
window.__characterQA={results,ready:true};
</script></body></html>`;

let browser;
try {
  await server.listen();browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1800,height:1050},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/__character-motion-qa*',route=>route.fulfill({contentType:'text/html',body:html}));
  await page.goto('http://127.0.0.1:4196/__character-motion-qa');
  await page.waitForFunction(()=>window.__characterQA?.ready,{timeout:60000});
  await page.screenshot({path:output+'motion-contact-sheet.png'});
  const report=await page.evaluate(()=>window.__characterQA.results);
  await writeFile(output+'report.json',JSON.stringify({errors,poses:report},null,2));
  if(errors.length||report.some(p=>!p.finite))throw Error('Character QA produced invalid transforms or browser errors');
  await page.goto('http://127.0.0.1:4196/__character-motion-qa?mode=residents');
  await page.waitForFunction(()=>window.__characterQA?.ready,{timeout:60000});
  await page.screenshot({path:output+'residents-contact-sheet.png'});
  const residents=await page.evaluate(()=>window.__characterQA.results);
  await writeFile(output+'residents-report.json',JSON.stringify({errors,poses:residents},null,2));
  if(errors.length||residents.some(p=>!p.finite))throw Error('Resident QA produced invalid transforms or browser errors');
  console.log(JSON.stringify({passed:true,output,poses:report.length,residents:residents.length,errors},null,2));
} finally { await browser?.close();await server.close(); }
