// Independent asset review. No world/main imports, build or game-save access.
import {chromium} from '@playwright/test';
import {createServer} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=fileURLToPath(new URL('../output/qa/illustrated-trees/',import.meta.url));
await mkdir(output,{recursive:true});
const server=await createServer({root,configFile:false,server:{host:'127.0.0.1',port:4197,strictPort:true,hmr:false},logLevel:'error'});
const html=String.raw`<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#e9eadb;color:#34584b;font:14px sans-serif}canvas{display:block;width:1800px;height:1000px}.labels{position:absolute;inset:0;display:grid;grid-template-columns:repeat(3,600px);pointer-events:none}.labels>div{padding:25px 28px;border-right:1px solid #34584b18}.labels b{display:block;font:24px serif;letter-spacing:2px}.labels span{display:block;font-size:12px;letter-spacing:1px;margin-top:10px;color:#697b63}</style></head><body><canvas id="view"></canvas><div class="labels"><div><b>江城梧桐 · 轮廓</b><span>不规则分叉 / 十一个成组叶团</span></div><div><b>树下 · 近景</b><span>连续树干 / 纵向斑驳 / 通行空间</span></div><div><b>叶冠 · 体积</b><span>三色层次 / 少量掌状叶 / 无透明碎边</span></div></div><script type="module">
import * as THREE from '/node_modules/three/build/three.module.js';
import {buildIllustratedTree} from '/src/illustrated-trees.js';
import {createCharacter} from '/src/characters.js';
const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('#view'),antialias:true});renderer.setSize(1800,1000,false);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.10;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
const panels=[],report=[];
for(let i=0;i<3;i++){
 const scene=new THREE.Scene();scene.background=new THREE.Color('#c9e2e4');scene.add(new THREE.HemisphereLight('#fff8df','#789588',2.0));
 const sun=new THREE.DirectionalLight('#fff0d0',2.8);sun.position.set(-4,8,5);sun.castShadow=true;sun.shadow.mapSize.set(1536,1536);Object.assign(sun.shadow.camera,{left:-5,right:5,top:7,bottom:-5,near:.1,far:25});sun.shadow.normalBias=.018;scene.add(sun);
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:'#d9dcc5',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=.12;ground.receiveShadow=true;scene.add(ground);
 const staticGroup=new THREE.Group();scene.add(staticGroup);const world={scene,static:staticGroup,colliders:[],cameraOccluders:[],townWind:{value:1.6}};const tree=buildIllustratedTree(world,0,0,1);
 const person=createCharacter(null,'#eee','#789',true,'player');person.position.set(-1.45,.13,.5);person.rotation.y=.6;scene.add(person);
 const camera=new THREE.PerspectiveCamera(i===0?38:i===1?46:43,600/1000,.1,60);camera.position.set(...(i===0?[8.8,5.1,12.8]:i===1?[3.3,2.0,5.5]:[4.5,5.4,6.1]));camera.lookAt(...(i===0?[0,3,0]:i===1?[0,3.05,0]:[0,4.75,0]));
 let triangles=0;tree.traverse(o=>{if(o.isMesh)triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});
 const crown=world.cameraOccluders.find(c=>c.kind==='tree-crown');report.push({...tree.userData.illustratedTree,triangles,collider:world.colliders[0],crown,materials:tree.children.map(o=>({type:o.material.type,alphaTest:o.material.alphaTest,transparent:o.material.transparent})),finite:tree.children.every(o=>Array.from(o.geometry.attributes.position.array).every(Number.isFinite))});panels.push({scene,camera,world});
}
function draw(time){renderer.setScissorTest(true);panels.forEach(({scene,camera,world},i)=>{world.townWind.value=time;renderer.setViewport(i*600,0,600,1000);renderer.setScissor(i*600,0,600,1000);renderer.shadowMap.needsUpdate=true;renderer.render(scene,camera);});}
draw(1.6);window.__treeQA={ready:true,report,draw};
</script></body></html>`;
let browser;
try{
 await server.listen();browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1800,height:1000},deviceScaleFactor:1});const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/__tree-qa',route=>route.fulfill({contentType:'text/html',body:html}));await page.goto('http://127.0.0.1:4197/__tree-qa');await page.waitForFunction(()=>window.__treeQA?.ready,{timeout:60000});
 await page.screenshot({path:output+'tree-contact-sheet.png'});const report=await page.evaluate(()=>window.__treeQA.report);await writeFile(output+'report.json',JSON.stringify({errors,trees:report},null,2));
 if(errors.length||report.some(t=>!t.finite||t.crown.solid!==false))throw Error('Tree asset QA failed');console.log(JSON.stringify({passed:true,output,errors,triangles:report[0].triangles},null,2));
}finally{await browser?.close();await server.close();}
