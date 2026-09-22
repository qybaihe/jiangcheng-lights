import * as THREE from 'three';
import {isNearArchitecture,buildNearArchitecture,buildStreetArchitecture} from './near-architecture.js';
const loader=new THREE.TextureLoader();
const maps=new Map(),surfaceMaterials=new Map();
function tex(name,repeat=[1,1],data=false){const key=name+repeat+data;if(maps.has(key))return maps.get(key);const t=loader.load('/textures/'+name+'.webp',loaded=>{if(name==='plaster-color')cleanPlaster(loaded);});t.colorSpace=data?THREE.NoColorSpace:THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(...repeat);t.anisotropy=8;maps.set(key,t);return t;}
// Preserve the generated paint detail while lifting muddy texture shadows in
// linear colour space. Lighting still supplies depth; this is not exposure gain.
function illustrated(material,lift=.025,saturation=1.08){
 material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
 float inkLuma=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
 diffuseColor.rgb=mix(vec3(inkLuma),diffuseColor.rgb,${saturation.toFixed(3)});
 diffuseColor.rgb=mix(diffuseColor.rgb,vec3(1.0),${lift.toFixed(3)});`);};
 material.customProgramCacheKey=()=>`illustrated-${lift}-${saturation}`;return material;
}
// Shared immutable materials let World.optimize batch different buildings.
// Callers that change side, normalScale or other local properties must clone.
export function surface(name,repeat=[1,1],color='#ffffff',roughness=.87){
 const key=JSON.stringify([name,repeat,color,roughness]);
 if(!surfaceMaterials.has(key))surfaceMaterials.set(key,illustrated(new THREE.MeshStandardMaterial({map:tex(name+'-color',repeat),normalMap:tex(name+'-normal',repeat,true),normalScale:new THREE.Vector2(.13,.13),roughnessMap:tex(name+'-roughness',repeat,true),color,roughness,metalness:0})));
 const material=surfaceMaterials.get(key);material.userData.surface=name;return material;
}
const leafCache={};
function leavesTexture(){if(leafCache.map)return leafCache.map;const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');let seed=78;const random=()=>{seed=seed*16807%2147483647;return(seed-1)/2147483646;};for(let i=0;i<24;i++){const x=35+random()*185,y=30+random()*180,len=12+random()*20,a=random()*6.28;ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.beginPath();ctx.moveTo(0,-len);ctx.bezierCurveTo(len*.8,-len*.45,len*.7,len*.4,0,len);ctx.bezierCurveTo(-len*.7,len*.3,-len*.8,-len*.4,0,-len);const grad=ctx.createLinearGradient(-len,0,len,0);grad.addColorStop(0,['#568851','#5f9659','#78a95b','#a3a55b'][i%4]);grad.addColorStop(1,['#aad48a','#b8d997','#d1d990','#ddd495'][i%4]);ctx.fillStyle=grad;ctx.fill();ctx.strokeStyle='#507e4166';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(0,-len);ctx.lineTo(0,len);ctx.stroke();ctx.restore();}const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;leafCache.map=t;return t;}
export function detailedTree(world,x,z,s=1){world.colliders.push({x:x-.27*s,X:x+.27*s,z:z-.27*s,Z:z+.27*s,height:3.8*s,kind:'tree-trunk'});const bark=surface('brick',[1,3],'#a2977d');world.cyl(.11*s,.26*s,3.7*s,bark,x,1.85*s,z,world.static,9);for(let i=0;i<7;i++){const a=i*2.4;world.beam([x,1.7*s,z],[x+Math.cos(a)*1.15*s,4*s+(i%3)*.3,z+Math.sin(a)*1.15*s],.065*s,'#9c896b');}const mat=leafCache.material||(leafCache.material=new THREE.MeshStandardMaterial({map:leavesTexture(),alphaTest:.45,side:THREE.DoubleSide,roughness:.95,color:'#e2efd0'}));world.townWind??=(leafCache.wind??={value:0});
 if(!leafCache.windReady){mat.onBeforeCompile=shader=>{shader.uniforms.townWindTime=leafCache.wind;shader.vertexShader='uniform float townWindTime;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
 #ifdef USE_INSTANCING
 float leafPhase=instanceMatrix[3].x*.73+instanceMatrix[3].z*.61;
 transformed.x+=sin(townWindTime*1.3+leafPhase)*.035;
 transformed.z+=cos(townWindTime*.8+leafPhase)*.018;
 #endif`);};mat.customProgramCacheKey=()=> 'town-leaf-wind';leafCache.windReady=true;}
 const inst=new THREE.InstancedMesh(new THREE.PlaneGeometry(1.45*s,1.45*s),mat,110);const dummy=new THREE.Object3D();let seed=Math.round((x+100)*319+(z+100)*181);const rand=()=>{seed=seed*16807%2147483647;return(seed-1)/2147483646;};for(let i=0;i<110;i++){const a=rand()*Math.PI*2,r=Math.sqrt(rand())*2.25*s,y=3.1*s+rand()*2.9*s*(1-r/(3*s));dummy.position.set(x+Math.cos(a)*r,y,z+Math.sin(a)*r);dummy.rotation.set(rand()*Math.PI,rand()*Math.PI,rand()*Math.PI);dummy.scale.setScalar(.65+rand()*.7);dummy.updateMatrix();inst.setMatrixAt(i,dummy.matrix);}inst.castShadow=true;inst.receiveShadow=true;
 // The camera must avoid the actual leaf envelope, including near foreground foliage.
 inst.computeBoundingBox();const crown=inst.boundingBox;
 world.cameraOccluders?.push({x:crown.min.x,X:crown.max.x,z:crown.min.z,Z:crown.max.z,y:crown.min.y,height:crown.max.y,kind:'tree-crown',solid:false},{x:x-.3*s,X:x+.3*s,z:z-.3*s,Z:z+.3*s,y:0,height:3.8*s});
 world.scene.add(inst);world.cyl(.8*s,.85*s,.14,'#827c64',x,.07,z);}
// The plaster material remains available for street props. Building walls and
// windows now use original solid geometry and no photographed facade textures.
function cleanPlaster(texture){
 const img=texture.image,w=img.width,h=img.height,canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
 const pixels=ctx.getImageData(0,0,w,h),data=pixels.data,target=[225,220,203];
 for(let i=0;i<Math.floor(w*h*.65);i++){
  const p=i*4,luma=(data[p]*.2126+data[p+1]*.7152+data[p+2]*.0722)/255,shade=.91+luma*.14;
  for(let c=0;c<3;c++)data[p+c]=Math.round(data[p+c]*.12+target[c]*shade*.88);
 }
 ctx.putImageData(pixels,0,0);texture.image=canvas;texture.needsUpdate=true;
}

export function reconstructedBuilding(world,config){
 return isNearArchitecture(config)?buildNearArchitecture(world,config):buildStreetArchitecture(world,config);
}
