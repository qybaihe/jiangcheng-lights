import {beginArrivalView,cancelArrivalView,getArrivalView,isArrivalViewActive,updateArrivalView} from './arrival-view.js';
import {createWorldParticles} from './world-particles.js';
import {pickSceneTarget,isSceneTap} from './scene-picking.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { POIS, START } from './story.js';
import {surface,reconstructedBuilding} from './architecture.js';
import {buildIllustratedTree} from './illustrated-trees.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {FXAAShader} from 'three/addons/shaders/FXAAShader.js';
import {makeIllustratedRiver} from './illustrated-river.js';
import {createCurvedWorld,curvedSightline} from './curved-world.js';
import {detailedRadio,bambooSeat,fernPlanter,heirloomLamp} from './props.js';
import {makeAtmosphere,streetDetails} from './atmosphere.js';
import {buildClockTower,buildBridge,buildDistantCity,buildFerry} from './landmarks.js';
import {createCharacter} from './characters.js';
import {loadHeroAvatar} from './avatar.js';
import {loadResidentAvatars,updateResidentAvatars,disposeResidentAvatars,getResidentAvatarStatus} from './resident-avatars.js';
import {addResidentAccessories} from './resident-accessories.js';
import {buildFoodStall} from './food-stall.js';
import {updateTownLife} from './town-life.js';
import {buildStreetBicycle} from './bicycle.js';
import {WorldInteractions} from './world-interactions.js';
import {addRouteArtDirection} from './route-art-direction.js';
import {addStreetComposition, streetHeightAt} from './street-composition.js';
import {addAdventureScenery,updateAdventureScenery,adventureHeightAt} from './adventure-scenery.js';
import {ADVENTURE_STOPS} from './adventure.js';
import {addAdventureGround} from './adventure-ground.js';
import {addWuhanDistrict} from './wuhan-district.js';
import {WUHAN_DISTRICT_STOPS,isInsidePlayableBounds} from './wuhan-district-layout.js';
import {configureIllustratedMaterials, IllustrationOutlinePass} from './illustrated-rendering.js';
import {EXPLORATION, angleDelta, initialiseExploration, updateThirdPerson, movementStep, cameraBoomDistance, updatePlayerOcclusion} from './exploration.js';

import {initialisePlayerMotion, requestJump, resetPlayerMotion, updatePlayerVertical, canTraverseOverhead, hasStandingClearance} from './traversal.js';

const TAU=Math.PI*2;
const WALK_SAMPLE=.18;

// Routes and keyboard movement share the same footprint and step-height checks.
// Sampling the whole segment prevents a thin obstacle from falling between nodes.
export function walkableSegment(world,from,to){
 if(![from.x,from.z,to.x,to.z].every(Number.isFinite))return false;
 const steps=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.z-from.z)/WALK_SAMPLE));
 let height=world.heightAt(from.x,from.z);
 for(let i=0;i<=steps;i++){
  const f=i/steps,x=from.x+(to.x-from.x)*f,z=from.z+(to.z-from.z)*f,y=world.heightAt(x,z);
  if(!world.canWalk(x,z)||Math.abs(y-height)>.23)return false;
  height=y;
 }
 return true;
}

// A small binary heap keeps a map refresh from sorting the full open set repeatedly.
export function findWalkPath(world,from,to){
 if(!world.canWalk(from.x,from.z)||!world.canWalk(to.x,to.z))return null;
 if(walkableSegment(world,from,to))return [{x:from.x,z:from.z},{x:to.x,z:to.z}];
 const key=(x,z)=>`${x},${z}`,nearby=point=>{
  const result=[];
  for(let x=Math.floor(point.x)-1;x<=Math.ceil(point.x)+1;x++)for(let z=Math.floor(point.z)-1;z<=Math.ceil(point.z)+1;z++){
   const d=Math.hypot(x-point.x,z-point.z);
   if(d<=1.55&&walkableSegment(world,point,{x,z}))result.push({x,z,k:key(x,z),d});
  }
  return result.sort((a,b)=>a.d-b.d);
 };
 const entries=nearby(from),exits=new Map(nearby(to).map(n=>[n.k,n]));
 if(!entries.length||!exits.size)return null;
 const heap=[],cost=new Map(),prev=new Map(),nodes=new Map();
 const push=n=>{heap.push(n);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p].f<=n.f)break;heap[i]=heap[p];i=p;}heap[i]=n;};
 const pop=()=>{const root=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1].f<heap[c].f)c++;if(heap[c].f>=last.f)break;heap[i]=heap[c];i=c;}heap[i]=last;}return root;};
 for(const n of entries){cost.set(n.k,n.d);prev.set(n.k,null);nodes.set(n.k,n);push({...n,g:n.d,f:n.d+Math.hypot(n.x-to.x,n.z-to.z)});}
 let end=null,iterations=0;
 while(heap.length&&iterations++<10000){
  const current=pop();if(current.g!==cost.get(current.k))continue;
  if(exits.has(current.k)){end=current.k;break;}
  for(const[dx,dz]of[[0,1],[0,-1],[1,0],[-1,0]]){
   const next={x:current.x+dx,z:current.z+dz};next.k=key(next.x,next.z);
   const g=current.g+1;if(g>=(cost.get(next.k)??Infinity)||!walkableSegment(world,current,next))continue;
   cost.set(next.k,g);prev.set(next.k,current.k);nodes.set(next.k,next);push({...next,g,f:g+Math.hypot(to.x-next.x,to.z-next.z)});
  }
 }
 if(end===null)return null;
 const raw=[{x:to.x,z:to.z}];
 for(let k=end;k!==null;k=prev.get(k)){const n=nodes.get(k);raw.unshift({x:n.x,z:n.z});}
 raw.unshift({x:from.x,z:from.z});
 const path=[raw[0]];let at=0;
 while(at<raw.length-1){let next=raw.length-1;while(next>at+1&&!walkableSegment(world,raw[at],raw[next]))next--;if(Math.hypot(raw[next].x-path.at(-1).x,raw[next].z-path.at(-1).z)>.001)path.push(raw[next]);at=next;}
 return path;
}

export class World {
 constructor(canvas,{onMove,onNear,onDoubleClick,onFrame,onJump,onLand,onFootstep,onSceneClick,avatarId='female'}={}){
  this.callbacks={onMove,onNear,onDoubleClick,onFrame,onJump,onLand,onFootstep,onSceneClick};this.canvas=canvas;this.keys={};this.walking=false;this.active=false;this.blocked=false;this.suspended=false;this.firstFrameRendered=false;this.reduced=false;this.rainy=false;this.ended=false;this.elapsed=0;this.path=[];this.colliders=[];this.cameraOccluders=[];this.hazards=[{x:28,z:.9,r:1.65}];this.npcs=[];this.windowMats=[];this.markers=[];this.static=new THREE.Group();
  this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#c7bba0');this.scene.fog=new THREE.Fog('#c7bba0',80,205);
  this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.autoUpdate=false;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.0;this.renderer.info.autoReset=false;
  this.camera=new THREE.PerspectiveCamera(40,1,.3,380);this.camera.position.set(61,63,79);this.controls=new OrbitControls(this.camera,canvas);this.controls.target.set(0,0,-7);this.controls.enableDamping=true;this.controls.dampingFactor=.065;this.controls.enablePan=false;this.controls.minDistance=24;this.controls.maxDistance=130;this.controls.minPolarAngle=.35;this.controls.maxPolarAngle=1.25;this.controls.rotateSpeed=.55;this.controls.zoomSpeed=.75;this.preferredCameraHeight=6.8;this.cameraMode='street';this.firstYaw=0;this.firstPitch=-.02;this.eyeHeight=1.65;this.lookSensitivity=.0024;this.orbitInteracting=false;this.controls.addEventListener('start',()=>{this.cancelArrivalView('orbit-input');this.orbitInteracting=true;if(this.conversation)this.conversation.manual=true;});this.controls.addEventListener('end',()=>{this.orbitInteracting=false;if(!this.conversation)this.preferredCameraHeight=this.camera.position.y-this.controls.target.y;});this.controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.ROTATE};
  this.scene.add(new THREE.HemisphereLight('#dbede3','#b1b7a6',1.15));this.sun=new THREE.DirectionalLight('#fff8ec',1.3);this.sun.position.set(-35,38,15);this.sun.castShadow=true;Object.assign(this.sun.shadow.camera,{left:-70,right:110,top:90,bottom:-90,near:1,far:210});this.sun.shadow.mapSize.set(4096,4096);this.sun.shadow.normalBias=.06;this.sun.shadow.bias=-.0001;this.scene.add(this.sun);this.scene.add(this.static);makeAtmosphere(this);
  this.materials=new Map();this.clock=new THREE.Clock();this.groundTex=this.texture('stone');this.brickTex=this.texture('brick');this.plasterTex=this.texture('plaster');this.makeWorld();streetDetails(this);addStreetComposition(this);addRouteArtDirection(this);addAdventureScenery(this);addAdventureGround(this);addWuhanDistrict(this);this.makeWater();this.makeLoreMarkers();this.player=this.character('#c1bd9b','#344b4c',true);this.eyeHeight=this.player.userData.eyeHeight??1.65;this.player.position.set(START.x,0,START.z);this.player.rotation.y=Math.atan2(-10.5,-4);this.scene.add(this.player);this.propInteractions=new WorldInteractions(this);this.makeRain();this.optimize();this.illustrationStats=configureIllustratedMaterials(this);
  const renderTarget=new THREE.WebGLRenderTarget(window.innerWidth,window.innerHeight,{type:THREE.HalfFloatType,depthBuffer:true,stencilBuffer:false,samples:0});
  renderTarget.depthTexture=new THREE.DepthTexture(window.innerWidth,window.innerHeight,THREE.UnsignedIntType);renderTarget.depthTexture.format=THREE.DepthFormat;renderTarget.depthTexture.minFilter=renderTarget.depthTexture.magFilter=THREE.NearestFilter;
  this.composer=new EffectComposer(this.renderer,renderTarget);this.composer.addPass(new RenderPass(this.scene,this.camera));
  this.outline=new IllustrationOutlinePass(this.camera,{thickness:1,strength:.78,colorStrength:.12,ink:'#253d38'});this.composer.addPass(this.outline);
  this.composer.addPass(new OutputPass());this.edgeAA=new ShaderPass(FXAAShader);this.composer.addPass(this.edgeAA);this.streetView=true;this.setupShadowCache();this.curvedWorld=createCurvedWorld(this);this.worldParticles=createWorldParticles(this);this.setupFirstPersonInput();
  this.resize=()=>{const w=canvas.clientWidth,h=canvas.clientHeight;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.propInteractions?.updateFraming();this.composer?.setSize(w,h);const ratio=this.renderer.getPixelRatio();this.edgeAA?.uniforms.resolution.value.set(1/(w*ratio),1/(h*ratio));this.refitConversationCamera();if(isArrivalViewActive(this))updateArrivalView(this,0);};window.addEventListener('resize',this.resize);this.resize();
  this.keyDown=e=>{
   if(e.key==='Escape'){this.cancelArrivalView('escape');this.releasePointerLock();this.keys={};return;}
   if(e.defaultPrevented||/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))return;
   if(/^(w|a|s|d|arrowup|arrowdown|arrowleft|arrowright| |e|f|g|v)$/i.test(e.key))this.cancelArrivalView('keyboard-input');
   if(e.key===' '){
    if(!e.repeat&&!e.target.closest?.('button,a,[role=button]'))requestJump(this);
    if(this.active&&!this.blocked)e.preventDefault();return;
   }
   if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))e.preventDefault();
   if(this.active&&!this.blocked&&/^(w|a|s|d|arrowup|arrowdown|arrowleft|arrowright)$/i.test(e.key))this.canvas.focus?.({preventScroll:true});
   this.keys[e.key.toLowerCase()]=true;
  };this.keyUp=e=>{this.keys[e.key.toLowerCase()]=false;};window.addEventListener('keydown',this.keyDown);window.addEventListener('keyup',this.keyUp);window.addEventListener('blur',()=>{this.keys={};this.lookDrag=null;this.releasePointerLock();});
  canvas.addEventListener('dblclick',e=>{if(!this.active||this.blocked||document.pointerLockElement===canvas||performance.now()-(this.lastScenePickAt??-1000)<450)return;const rect=canvas.getBoundingClientRect();const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),this.camera);const point=this.curvedWorld.pick(ray.ray);if(point)this.navigate(point.x,point.z);});
  this.setupSceneClicks();this.heroReady=loadHeroAvatar(this,avatarId);
  this.residentAvatarsReady=loadResidentAvatars(this,{startAfter:this.heroReady,progressive:true,concurrency:1,onInstalled:context=>{
   const accessories=addResidentAccessories(context);
   this.firstFrameRendered=false;
   if(this.conversation?.npc===context.actor)this.refitConversationCamera();
   return accessories;
  }});
  this.animate=this.animate.bind(this);this.raf=requestAnimationFrame(this.animate);
 }
 beginArrivalView(options){return beginArrivalView(this,options);}
 cancelArrivalView(reason){return cancelArrivalView(this,reason);}
 getArrivalView(){return getArrivalView(this);}
 setAvatar(id){this.heroReady=loadHeroAvatar(this,id);return this.heroReady;}
 getResidentAvatars(){return getResidentAvatarStatus(this);}
 getWuhanDistrict(){return this.wuhanDistrict??null;}
 disposeResidents(){disposeResidentAvatars(this);}
 mat(color,opts={}){const key=color+JSON.stringify(opts);if(!this.materials.has(key)){const stone=['#bcbaa1','#d0c6a5','#e2d6b5','#ede0bc','#d7caab','#e6d4ac','#eadab6','#afa787','#c6bd9d','#e0cfaa','#b8ad8d'].includes(color);this.materials.set(key,stone?surface('plaster',[1,1],color):new THREE.MeshStandardMaterial({color,roughness:.92,...opts}));}return this.materials.get(key);}
 mesh(geo,mat,x=0,y=0,z=0,parent=this.static,shadow=true){const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=shadow;m.receiveShadow=true;parent.add(m);return m;}
 box(w,h,d,color,x,y,z,parent=this.static,opts){return this.mesh(new THREE.BoxGeometry(w,h,d),typeof color==='string'?this.mat(color,opts):color,x,y,z,parent);}
 cyl(rt,rb,h,color,x,y,z,parent=this.static,n=12){return this.mesh(new THREE.CylinderGeometry(rt,rb,h,n),typeof color==='string'?this.mat(color):color,x,y,z,parent);}
 beam(a,b,r,color,parent=this.static){const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),m=this.cyl(r,r,va.distanceTo(vb),color,...va.clone().add(vb).multiplyScalar(.5).toArray(),parent,6);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),vb.sub(va).normalize());return m;}
 texture(kind){const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');let seed=27;const rnd=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};g.fillStyle=kind==='brick'?'#bb8f74':kind==='stone'?'#c7c8b8':'#e2d5b8';g.fillRect(0,0,256,256);for(let i=0;i<5000;i++){g.fillStyle=`rgba(${rnd()>.5?'255,255,255':'35,35,30'},${rnd()*.07})`;g.fillRect(rnd()*256,rnd()*256,2+rnd()*5,2+rnd()*4);}if(kind!=='plaster'){const hh=kind==='brick'?16:32;for(let y=0;y<256;y+=hh)for(let x=-40;x<256;x+=kind==='brick'?48:64){const xx=x+(y/hh%2)*24;g.strokeStyle=kind==='brick'?'#715c4933':'#78878144';g.lineWidth=1;g.strokeRect(xx,y,kind==='brick'?48:64,hh);g.fillStyle=`rgba(255,239,211,${rnd()*.1})`;g.fillRect(xx+1,y+1,kind==='brick'?46:62,hh-2);}}const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(kind==='stone'?24:2,kind==='stone'?22:2);t.anisotropy=4;return t;}
 label(text,w,h,bg='#294f4a',fg='#f1d9aa',parent=this.static){const c=document.createElement('canvas');c.width=1024;c.height=Math.round(1024*h/w);const ctx=c.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,c.width,c.height);ctx.strokeStyle=fg;ctx.lineWidth=5;ctx.strokeRect(12,12,c.width-24,c.height-24);ctx.fillStyle=fg;ctx.font=`600 ${Math.round(c.height*.52)}px "Songti SC", "SimSun", serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,512,c.height*.53,960);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const m=this.mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:t,roughness:1,side:THREE.DoubleSide}),0,0,0,parent,false);return m;}
 building(config){return reconstructedBuilding(this,config);}
 canopy(x,z,w=7,d=2.8,color='#a77c53',height=3.5){
  this.cameraOccluders.push({x:x-w/2,X:x+w/2,z:z-d/2,Z:z+d/2,y:height-.5,height});
  const plain=color==='#537666',fabric=surface('fabric',[2,1],plain?'#b4bbaf':'#e0dbc2');
  if(!plain)for(const side of[-1,1])this.cyl(.032,.045,height-.3,'#414536',x+side*w/2,(height-.3)/2,z+d/2);
  // A lightly sagging cloth profile, stitched edge and scalloped valance.
  for(let i=0;i<12;i++){
   const f=plain?fabric:surface('fabric',[1,1],i%2?'#d3cdb3':'#839587');
   const left=x-w/2+i*w/12,right=left+w/12;
   const positions=[],uvs=[],indices=[];
   for(let row=0;row<=5;row++){
    const t=row/5,yy=height-.22*t-.065*Math.sin(t*Math.PI);
    positions.push(left,yy,z-d/2+t*d,right,yy,z-d/2+t*d);uvs.push(0,t,1,t);
    if(row<5){const n=row*2;indices.push(n,n+2,n+1,n+1,n+2,n+3);}
   }
   const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();
   const cloth=f.clone();cloth.side=THREE.DoubleSide;this.mesh(g,cloth);
   const edge=new THREE.Shape();edge.moveTo(left,height-.22);edge.lineTo(right,height-.22);edge.lineTo(right,height-.38);edge.quadraticCurveTo((left+right)/2,height-.50,left,height-.38);edge.closePath();
   this.mesh(new THREE.ShapeGeometry(edge,5),cloth,0,0,z+d/2+.005);
   this.beam([left,height-.01,z-d/2],[left,height-.23,z+d/2],.009,'#bbb69e');
  }
  for(const side of[-1,1]){const xx=x+side*w*.48;
   this.beam([xx,height-.14,z-d/2],[xx,height-.26,z+d/2],.026,'#3a4437');
   this.beam([xx,height-.86,z-d/2],[xx,height-.26,z+d/2],.026,'#3a4437');
   const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(xx,height-.14,z-d/2),new THREE.Vector3(xx,height-.8,z-d*.2),new THREE.Vector3(xx,height-.5,z+d*.18),new THREE.Vector3(xx,height-.28,z+d*.3)]);
   this.mesh(new THREE.TubeGeometry(curve,16,.018,5,false),this.mat('#4b4e3b'));
  }
 }

 tree(x,z,s=1){buildIllustratedTree(this,x,z,s);}
 pot(x,z,s=1){fernPlanter(this,{x,z,y:this.heightAt(x,z),scale:s*.9,seed:Math.abs(x*31+z)});}
 stool(x,z){bambooSeat(this,{x,z,y:.13,type:'stool',scale:1.1});}
 lamp(x,z){this.cyl(.07,.11,4.2,'#415652',x,2.1,z);this.box(.63,.12,.63,'#3d514b',x,4.25,z);this.box(.38,.6,.38,this.mat('#f7d497',{emissive:'#ffc06f',emissiveIntensity:.45}),x,3.9,z);this.mesh(new THREE.ConeGeometry(.5,.36,4),this.mat('#445c56'),x,4.47,z);
  this.cameraOccluders.push({x:x-.13,X:x+.13,z:z-.13,Z:z+.13,y:0,height:4.25,kind:'lamp-pole'},{x:x-.5,X:x+.5,z:z-.5,Z:z+.5,y:3.55,height:4.67,kind:'lamp-head'});
  this.colliders.push({x:x-.1,X:x+.1,z:z-.1,Z:z+.1,height:3.55,kind:'lamp-pole'});
 }
 makeWorld(){
  // The outer paving lies below the playable street, not on the same y=.07
  // plane. Two differently shaded coplanar slabs produced large diagonal bands.
  this.box(220,1,150,'#90b7a4',0,-.6,49).castShadow=false;
  this.box(218,.18,149,surface('paving',[45,32],'#a29e84',.66),0,-.10,49).castShadow=false;
  this.box(79,.18,59,surface('paving',[17,14],'#faf7e9',.74),0,-.02,4).castShadow=false;
  // Central spine and riverfront stay broad enough to read clearly from the camera.
  this.box(9,.035,56,surface('paving',[2,14],'#f7f9ed',.50),0,.09,4).castShadow=false;this.box(76,.055,6,surface('paving',[18,2],'#b4ad91',.66),0,.1,-20).castShadow=false;
  for(let x of [-4.6,4.6]){this.box(.18,.16,55,'#e0d5b9',x,.13,4);for(let z=-22;z<30;z+=2)this.box(.23,.18,.06,'#7f9084',x,.16,z);}
  // Cross streets meet the spine at its edges instead of overlapping its top.
  for(let z of [7,23,-9])for(const side of[-1,1])this.box(31.5,.035,4,surface('paving',[7,1],'#eae9d8',.7),side*20.25,.09,z).castShadow=false;
  this.box(81,1.8,2.5,surface('paving',[16,1],'#acaa8e'),0,-.2,-26.5);this.box(82,.3,2.8,'#d0cbb0',0,.8,-26.5);
  for(let x=-39;x<=39;x+=3.4){if(x>24&&x<31)continue;this.box(.22,1.05,.22,'#bec2af',x,1.44,-26);this.box(3.4,.11,.12,'#727f71',x+1.7,1.75,-26);this.box(3.4,.09,.12,'#727f71',x+1.7,1.3,-26);}
  this.building({x:-13,z:11.4,w:10,d:7,h:6.6,color:'#a96d51',sign:'陆记 · 修理铺'});this.canopy(-13,16.25,9,2.1,'#537666');
  this.building({x:-29,z:9,w:8,d:6,h:9,color:'#bcb18c',sign:'晴川杂货'});
  this.building({x:14,z:5.6,w:10,d:7,h:6.8,color:'#b89a77',sign:'蔡记热干面',signColor:'#754b35'});this.canopy(14,10.45,9,2.6,'#677f67',3.15);
  this.building({x:17,z:-10.5,w:12,d:9,h:8.2,color:'#a96d51',sign:'晴川里 · 街坊之家'});
  this.building({x:-18,z:-6.1,w:10,d:9,h:8.5,color:'#c4b38e',sign:'晴川里  ·  12 号'});
  this.building({x:-31,z:-7,w:7,d:7,h:6.2,color:'#a96d51'});
  this.building({x:31,z:8,w:8,d:9,h:10,color:'#c7b998',sign:'汉口 · 老茶馆'});
  this.building({x:-28,z:25,w:11,d:6,h:6,color:'#a96d51'});
  this.building({x:31,z:29,w:9,d:5,h:6.8,color:'#b8a182'});
  // Courtyard dais and five usable stairs.
  this.box(13,.6,7,'#a9aa95',-17,.3,1.5);for(let i=0;i<5;i++)this.box(.85,.12*(i+1),4,'#c9c7ad',-7.8-i*.8,.06*(i+1),3);
  for(let x=-23;x<=-12;x+=2){this.box(.12,.8,.12,'#4b625a',x,1,-1);if(x<-13)this.box(2,.08,.1,'#4b625a',x+1,1.35,-1);}
  // Courtyard balcony with handrails and drying cloths.
  this.box(9,.22,1.6,'#cbbda0',-18,3.45,-.8);for(let x=-22;x<=-14;x+=.6)this.box(.045,1,.05,'#4c625b',x,4,-.05);this.box(8.6,.07,.07,'#4c625b',-18,4.5,-.05);
  this.beam([-23,5,1],[-10,4.5,1.2],.025,'#4d5750');for(let i=0;i<6;i++){const cloth=this.box(.8,1.25,.035,['#bcc5b0','#d9c5a7','#879a96'][i%3],-21+i*1.7,4,1.1);cloth.rotation.z=.04*(i%2?1:-1);}
  // Tables, noodles, stove, shop props.
  buildFoodStall(this);
  // Large furniture occupies the same space for walking, navigation and camera checks.
  this.colliders.push(
   {x:10.45,X:15.55,z:11.45,Z:12.95,height:1.12,kind:'furniture'},
   {x:12.78,X:15.22,z:15.20,Z:16.80,height:1.08,kind:'furniture'},
   {x:16.55,X:17.85,z:11.4,Z:12.6,height:1.6,kind:'furniture'},
   {x:-13.7,X:-10.3,z:16.4,Z:17.6,height:.95,kind:'furniture'},
  );
  const steamCanvas=document.createElement('canvas');steamCanvas.width=steamCanvas.height=64;const steamCtx=steamCanvas.getContext('2d'),steamGrad=steamCtx.createRadialGradient(32,32,0,32,32,31);steamGrad.addColorStop(0,'#fff8eab0');steamGrad.addColorStop(.35,'#fff8ea55');steamGrad.addColorStop(1,'#fff8ea00');steamCtx.fillStyle=steamGrad;steamCtx.fillRect(0,0,64,64);const steamMap=new THREE.CanvasTexture(steamCanvas);steamMap.colorSpace=THREE.SRGBColorSpace;
  this.steam=new THREE.Group();this.steam.position.set(17.2,1.5,12);this.scene.add(this.steam);for(let i=0;i<6;i++){const m=new THREE.Sprite(new THREE.SpriteMaterial({map:steamMap,color:'#fffaed',transparent:true,opacity:.2,depthWrite:false}));m.position.set(Math.sin(i)*.2,i*.45,0);m.scale.setScalar(.8);this.steam.add(m);}
  for(let x of [9,18])for(let z of [15.5,17.5])this.stool(x,z);
  const breakfast=this.label('过早 · 热干面 / 豆皮 / 面窝',4.6,.38,'#e1d1ac','#705b41');breakfast.position.set(14,2.87,11.78);
  this.cameraOccluders.push({x:11.7,X:16.3,z:11.74,Z:11.82,y:2.68,height:3.06});
  this.box(3.4,.12,1.2,surface('wood',[2,1],'#baad8b'),-12,.85,17);for(const dx of[-1.5,1.5])for(const dz of[-.48,.48])this.box(.12,.78,.12,surface('wood',[1,1],'#988b6c'),-12+dx,.39,17+dz);this.box(3.1,.08,1.05,surface('wood',[2,1],'#a29577'),-12,.26,17);detailedRadio(this,{x:-12.6,y:.92,z:17,scale:.8});heirloomLamp(this,{x:-10.9,y:.92,z:17,type:'desk'});bambooSeat(this,{x:-15.4,y:.13,z:17.1,rotation:.18,type:'chair'});bambooSeat(this,{x:-20.4,y:.6,z:1.1,rotation:.35,type:'chair'});
  const shopLight=new THREE.PointLight('#ffcc72',10,6,2);shopLight.position.set(-13,2.2,15.2);this.scene.add(shopLight);this.pot(-9,15);this.pot(-19,16);this.pot(-23,1);this.pot(-12,1);this.pot(9,-3);this.pot(22,-4);
  // Supplies are actual scene props near their POIs.
  this.supplyGroups={};for(const id of['box','water','battery']){const group=new THREE.Group();group.name=`collectable-${id}`;this.supplyGroups[id]=group;this.scene.add(group);}
  this.box(1.4,.9,1,'#bcab87',-28,.45,14.4,this.supplyGroups.box);this.box(1.45,.12,1.05,'#e0d3b3',-28,.95,14.4,this.supplyGroups.box);
  for(let i=0;i<6;i++){this.cyl(.15,.17,.58,'#8aada5',24.4+(i%3)*.36,.32,23.6+Math.floor(i/3)*.36,this.supplyGroups.water);this.cyl(.13,.13,.08,'#e4dac0',24.4+(i%3)*.36,.65,23.6+Math.floor(i/3)*.36,this.supplyGroups.water);}
  this.canopy(-29,-14,6,2,'#65796d');this.box(1,.8,.65,'#86775c',-27,.4,-13.3,this.supplyGroups.battery);this.label('备用',.8,.38,'#d1b77e','#4b5b4b',this.supplyGroups.battery).position.set(-27,.72,-12.95);
  this.deliveredFood=new THREE.Group();this.deliveredFood.name='neighbourhood-meals';this.deliveredFood.visible=false;this.scene.add(this.deliveredFood);
  this.box(1.35,.78,.92,'#bdc8a9',0,.39,0,this.deliveredFood);this.box(1.42,.10,.98,'#f0dfb4',0,.83,0,this.deliveredFood);
  for(const x of[-.68,.68])this.box(.07,.22,.32,'#577269',x,.54,0,this.deliveredFood);
  this.label('街坊热食',1.10,.26,'#f2e6c8','#526751',this.deliveredFood).position.set(0,.57,.467);
  this.box(1.3,2.2,.6,'#687d70',27,1.1,0);this.label('电气设备',1.1,.6,'#d3b575','#44534d').position.set(27,1.6,.32);
  this.mesh(new THREE.CircleGeometry(1.4,32),this.mat('#647f76',{roughness:.15,transparent:true,opacity:.6}),28,.14,.9).rotation.x=-Math.PI/2;
  for(let i=0;i<2;i++){this.box(.25,1.2,.2,'#ce9563',3+i*2,.6,-24);this.box(2.5,.12,.12,'#dac29a',4,1.15,-24);}
  // Trees define the public square and soften roof silhouettes.
  [[-35,-19,1.25],[-9,-16,1.25],[10,-18,1.2],[38,-14.7,1.10],[-34,0,1.2],[-9,29,.9],[9,29,.9],[23,18,1.25],[-22,19,.9],[7,3,.9],[-33,18,.85]].forEach(a=>this.tree(...a));
  [[-4,-17],[7,-14],[-5,9],[5,18],[24,-20],[-25,19],[23,25.7]].forEach(a=>this.lamp(...a));
  this.label('晴 川 里',5.2,1.25,'#315951').position.set(-.8,4.9,28);this.cyl(.12,.12,5,'#82795f',-3.7,2.5,28);this.cyl(.12,.12,5,'#82795f',2.1,2.5,28);
  this.streetBicycle=buildStreetBicycle(this,{dynamic:true,scale:.74});this.bicycleCollider={x:-21.27,X:-20.73,z:18.92,Z:21.08,height:1.3,kind:'bicycle'};this.colliders.push(this.bicycleCollider);
  for(let i=0;i<6;i++){for(const side of[-1])this.building({x:side*(44+(i%2)*3),z:-16+i*10,w:9+(i%2)*2,d:8,h:7+(i%3)*1.1,color:i%2?'#b8a182':'#a96d51',collide:false});}this.makeClockTower();this.makeBridge();this.makeDistantCity();this.makeFerry();
  const chars=[['granny',-17,.7,'#9d7d80','#5b6361'],['chef',10,12,'#b98459','#426a68'],['dock',22,-20,'#697f89','#42575a'],['community',12,-3,'#d8cab0','#56766e']];
  for(const [id,x,z,c,p]of chars){const person=this.character(c,p,false,id);person.position.set(x,this.heightAt(x,z),z);person.rotation.y=id==='chef'?-.4:.3;this.scene.add(person);this.npcs.push({id,group:person});}
  for(let i=0;i<5;i++){const c=this.character(['#8f9f93','#bc9b7d','#7d919c'][i%3],'#576761');c.scale.setScalar(.85);c.position.set(-2+(i%2)*4,0,-15+i*8);c.rotation.y=i%2*Math.PI;this.scene.add(c);this.npcs.push({id:'walker'+i,group:c,baseZ:c.position.z});}
  const ringMat=new THREE.MeshBasicMaterial({color:'#edc884',transparent:true,opacity:.8,depthWrite:false,depthTest:false,side:THREE.DoubleSide});this.focusRing=this.mesh(new THREE.RingGeometry(.75,.87,40),ringMat,0,.17,0,this.scene,false);this.focusRing.rotation.x=-Math.PI/2;this.focusRing.renderOrder=20;
 }
 makeClockTower(){buildClockTower(this);}
 makeBridge(){buildBridge(this);}
 makeDistantCity(){buildDistantCity(this);}
 makeWater(){makeIllustratedRiver(this);}

 makeFerry(){
  buildFerry(this);this.ferry.position.z=-60;
  const quay=this.box(5,.4,8,'#a39d80',27,.5,-29);for(let x of [25,29]){this.cyl(.15,.15,2.2,'#6a7865',x,.5,-32);}this.canopy(27,-25.5,5,2,'#6b8a7a');
 }
 character(shirt,trousers,player=false,id=''){return createCharacter(this,shirt,trousers,player,id);}
 makeLoreMarkers(){
  this.loreMarkers=[];this.collectedLore=new Set();
  const glow=document.createElement('canvas');glow.width=glow.height=64;const ctx=glow.getContext('2d');
  const grad=ctx.createRadialGradient(32,32,1,32,32,32);grad.addColorStop(0,'#fff7d7ff');grad.addColorStop(.15,'#ffdd8abb');grad.addColorStop(.45,'#ffcb643b');grad.addColorStop(1,'#ffcf7000');ctx.fillStyle=grad;ctx.fillRect(0,0,64,64);
  const map=new THREE.CanvasTexture(glow);map.colorSpace=THREE.SRGBColorSpace;
  const mat=new THREE.MeshBasicMaterial({color:'#ffe2a4'}),haloMat=new THREE.SpriteMaterial({map,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
  for(const p of POIS.filter(p=>p.lore)){
   const g=new THREE.Group();g.position.set(p.x,this.heightAt(p.x,p.z)+1.35,p.z);
   const star=new THREE.Mesh(new THREE.OctahedronGeometry(.115),mat);g.add(star);
   const halo=new THREE.Sprite(haloMat);halo.scale.setScalar(.8);g.add(halo);this.scene.add(g);this.loreMarkers.push({id:p.id,group:g,star,y:g.position.y});
  }
 }
 makeRain(){const positions=new Float32Array(900*3);for(let i=0;i<900;i++){positions[i*3]=(Math.random()-.5)*100;positions[i*3+1]=Math.random()*40;positions[i*3+2]=(Math.random()-.5)*75;}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));this.rain=new THREE.Points(geo,new THREE.PointsMaterial({color:'#d5e2d6',size:.09,transparent:true,opacity:.5,depthWrite:false}));this.rain.visible=false;this.scene.add(this.rain);}
 optimize(){// Preserve shadow intent when batching immutable meshes.
  this.static.updateMatrixWorld(true);const batches=new Map();
  this.static.traverse(o=>{if(!o.isMesh||Array.isArray(o.material))return;const center=new THREE.Vector3().setFromMatrixPosition(o.matrixWorld),cell=`${Math.floor(center.x/16)},${Math.floor(center.z/16)}`;const key=`${o.material.uuid}:${o.castShadow}:${o.receiveShadow}:${cell}`;const batch=batches.get(key)||{material:o.material,castShadow:o.castShadow,receiveShadow:o.receiveShadow,geoms:[]};const geometry=o.geometry.clone().applyMatrix4(o.matrixWorld);batch.geoms.push(geometry.index?geometry.toNonIndexed():geometry);batches.set(key,batch);});
  const old=this.static;this.scene.remove(old);this.static=new THREE.Group();
  for(const{material,castShadow,receiveShadow,geoms}of batches.values()){const merged=mergeGeometries(geoms,false);if(merged){const mesh=new THREE.Mesh(merged,material);mesh.castShadow=castShadow;mesh.receiveShadow=receiveShadow;this.static.add(mesh);}geoms.forEach(g=>g.dispose());}
  this.scene.add(this.static);
 }
 heightAt(x,z){const adventureHeight=adventureHeightAt(x,z);if(adventureHeight!==null)return adventureHeight;const streetHeight=streetHeightAt(x,z);if(streetHeight!==null)return streetHeight;if(x>=-23.5&&x<=-10.5&&z>=-2&&z<=5)return .6;if(x>-10.5&&x<-7.4&&z>1&&z<5)return .6*(1-(x+10.5)/3.1);return .13;}
 canWalk(x,z){if(!Number.isFinite(x)||!Number.isFinite(z)||!isInsidePlayableBounds(x,z)||this.hazards.some(h=>Math.hypot(x-h.x,z-h.z)<h.r))return false;return !this.colliders.some(c=>x>c.x-.35&&x<c.X+.35&&z>c.z-.35&&z<c.Z+.35)&&hasStandingClearance(this,x,z);}
 getNavigation(target,{approach=true}={}){
  const point=typeof target==='string'?[...POIS,...ADVENTURE_STOPS,...WUHAN_DISTRICT_STOPS,...this.getPropAnchors()].find(p=>p.id===target):target;
  const from={x:this.player.position.x,z:this.player.position.z};
  const people=this.npcs.filter(n=>n.group.visible).map(n=>({x:n.group.position.x,z:n.group.position.z,r:Math.min(.6,Math.hypot(n.group.position.x-from.x,n.group.position.z-from.z))}));
  const navigationWorld={heightAt:(x,z)=>this.heightAt(x,z),canWalk:(x,z)=>this.canWalk(x,z)&&!people.some(p=>Math.hypot(x-p.x,z-p.z)<p.r-.00001)};
  const fail=reason=>({reachable:false,path:[],distance:0,target:point?{x:point.x,z:point.z}:null,targetId:point?.id??null,reason});
  if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.z))return fail('unknown-target');
  const approachRadius=point.adventure||point.district ? .28 : 1.8,arrivalRadius=point.adventure||point.district ? .40 : 2.4;
  const candidates=[];
  if(approach){
   if(Math.hypot(from.x-point.x,from.z-point.z)<arrivalRadius&&walkableSegment(this,from,point))return {reachable:true,path:[from],distance:0,target:{x:point.x,z:point.z},targetId:point.id??null,reason:null};
   const angle=Math.atan2(from.z-point.z,from.x-point.x);
   for(const turn of[0,.125,-.125,.25,-.25,.375,-.375,.5]){const a=angle+turn*TAU;candidates.push({x:point.x+Math.cos(a)*approachRadius,z:point.z+Math.sin(a)*approachRadius});}
  }
  candidates.push({x:point.x,z:point.z});
  for(const end of candidates){
   if(approach&&!walkableSegment(this,end,point))continue;
   const path=findWalkPath(navigationWorld,from,end);if(!path)continue;
   const distance=path.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-path[i].x,p.z-path[i].z),0);
   return {reachable:true,path,distance,target:{x:point.x,z:point.z},targetId:point.id??null,reason:null};
  }
  return fail('no-walkable-route');
 }
 navigateRoute(route){
  this.cancelArrivalView('navigation');
  if(!route?.reachable||!Array.isArray(route.path))return false;
  const from={x:this.player.position.x,z:this.player.position.z},path=route.path.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.z));
  if(path.length!==route.path.length)return false;
  let previous=from;for(const p of path){if(!walkableSegment(this,previous,p))return false;previous=p;}
  this.path=path.filter(p=>Math.hypot(p.x-from.x,p.z-from.z)>.04).map(p=>new THREE.Vector3(p.x,0,p.z));this.routeStuckTime=0;if(!this.path.length)this.moveSpeed=0;return true;
 }
 navigate(x,z){return this.navigateRoute(this.getNavigation({x,z},{approach:false}));}
 approach(point){return this.navigateRoute(this.getNavigation(point));}
 setGuidance(route){
  const path=Array.isArray(route)?route:route?.reachable?route.path:[];
  if(!this.guidance){const material=new THREE.MeshBasicMaterial({color:'#f6d994',transparent:true,opacity:.62,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});this.guidance=new THREE.InstancedMesh(new THREE.CircleGeometry(.115,12),material,12);this.guidance.rotation.x=0;this.guidance.frustumCulled=false;this.guidance.renderOrder=2;this.guidance.count=0;this.guidance.castShadow=false;this.scene.add(this.guidance);this.curvedWorld?.attach(this.guidance);}
  let covered=0,nextDot=.9,count=0;const transform=new THREE.Object3D();transform.rotation.x=-Math.PI/2;
  for(let i=1;path&&i<path.length&&covered<15&&count<12;i++){
   const a=path[i-1],b=path[i];if(!walkableSegment(this,a,b))break;const length=Math.hypot(b.x-a.x,b.z-a.z);
   while(nextDot<=covered+length&&nextDot<=15&&count<12){const f=(nextDot-covered)/length,x=a.x+(b.x-a.x)*f,z=a.z+(b.z-a.z)*f;transform.position.set(x,this.heightAt(x,z)+.025,z);transform.updateMatrix();this.guidance.setMatrixAt(count++,transform.matrix);nextDot+=1.7;}
   covered+=length;
  }
  this.guidance.count=count;this.guidance.instanceMatrix.needsUpdate=true;
 }
 setPosition(p){this.cancelArrivalView('position-change');if(this.canWalk(p.x,p.z)){this.player.position.set(p.x,this.heightAt(p.x,p.z),p.z);}else this.player.position.set(START.x,.13,START.z);this.path=[];resetPlayerMotion(this);if(this.cameraMode==='first'&&!this.conversation)this.syncFirstPersonCamera();else if(this.cameraMode==='street')updateThirdPerson(this,0,true);this.curvedWorld?.update();}
 getCarProgress(){return this.propInteractions?.getCarProgress?.();}
 restoreCarProgress(progress){this.propInteractions?.restoreCarProgress?.(progress);}
 getResidentAnchors(){return this.npcs.map(n=>({id:n.id,kind:'resident',x:n.group.position.x,z:n.group.position.z,visible:n.group.visible,height:(n.group.userData.height??1.65)*(n.group.scale.y||1)}));}
 nearbyResident(){const p=this.player.position;return this.getResidentAnchors().filter(n=>n.visible&&Math.hypot(n.x-p.x,n.z-p.z)<3.0&&Math.abs(this.heightAt(n.x,n.z)-p.y)<.6&&walkableSegment(this,p,n)).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0]??null;}
 scenePick(clientX,clientY){
  const rect=this.canvas.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1),this.camera);
  const targets=this.npcs.filter(n=>n.group.visible).map(n=>{const p=n.group.position,h=(n.group.userData.height??1.65)*(n.group.scale.y||1);return {id:n.id,kind:'resident',box:new THREE.Box3(new THREE.Vector3(p.x-.32,p.y,p.z-.32),new THREE.Vector3(p.x+.32,p.y+h,p.z+.32))};});
  const add=(object,id)=>{if(!object)return;object.updateWorldMatrix(true,true);targets.push({id,kind:'prop',box:new THREE.Box3().setFromObject(object)});};
  add(this.streetBicycle,'prop-bicycle');add(this.propInteractions?.ferry,'prop-ferry');add(this.propInteractions?.boat,'prop-rowboat');
  for(const object of this.propInteractions?.carObjects?.()||[])add(object,object.userData.propId||object.userData.carId);
  targets.push({id:'prop-newspaper',kind:'prop',box:new THREE.Box3(new THREE.Vector3(-16.73,.13,16.7),new THREE.Vector3(-14.95,1.45,17.65))});
  const blockers=[...this.colliders,...this.cameraOccluders].filter(c=>c.kind!=='bicycle'&&!String(c.kind||'').includes('car')&&c.kind!=='newspaper-table'&&c.solid!==false).map(c=>new THREE.Box3(new THREE.Vector3(c.x,c.y??0,c.z),new THREE.Vector3(c.X,c.height??11,c.Z)));
  return pickSceneTarget(ray.ray,targets,blockers,this.curvedWorld);
 }
 setupSceneClicks(){
  let down=null;
  this.canvas.addEventListener('pointerdown',e=>{down=this.active&&!this.blocked&&document.pointerLockElement!==this.canvas?{x:e.clientX,y:e.clientY,button:e.button}:null;});
  this.canvas.addEventListener('pointermove',e=>{if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)>6)down.dragged=true;});
  this.canvas.addEventListener('pointerup',e=>{const tap=isSceneTap(down,e);down=null;if(!tap||!this.active||this.blocked||document.pointerLockElement===this.canvas)return;const hit=this.scenePick(e.clientX,e.clientY);if(hit){this.lastScenePickAt=performance.now();this.callbacks.onSceneClick?.(hit);}});
  this.canvas.addEventListener('pointercancel',()=>{down=null;});
 }
 getPropState(){return this.propInteractions?.state()??{mode:'walk',currentId:null,props:[]};}
 getPropAnchors(){return this.propInteractions?.anchors()??[];}
 getNearbyProp(){return this.propInteractions?.nearby()??null;}
 startPropInteraction(id){this.cancelArrivalView('prop-interaction');return this.propInteractions?.start(id)??{ok:false,reason:'街坊物件还在准备。'};}
 endPropInteraction(options){return this.propInteractions?.end(options)??{ok:true};}
 getSafeSavePosition(){return this.propInteractions?.safeSavePosition()??{x:this.player.position.x,z:this.player.position.z};}
 restorePropProgress(progress){this.propInteractions?.restore(progress);}
 start(){this.active=true;this.setCameraMode(this.cameraMode||'street');}
 getOverviewTarget(){if(['boat','ferry'].includes(this.propInteractions?.mode))return new THREE.Vector3(this.player.position.x,1.1,this.player.position.z);return new THREE.Vector3(Math.max(0,Math.min(85,this.player.position.x)),2.1,-4);}
 setView(street){return this.setCameraMode(street?'street':'overview');}
 setCameraMode(mode){
  if(!['first','street','overview'].includes(mode))return this.cameraMode;
  this.cancelArrivalView('camera-mode');
  const previous=this.cameraMode;
  if(this.conversation)this.endConversation();this.cameraReturn=null;this.releasePointerLock();this.lookDrag=null;this.orbitInteracting=false;
  initialiseExploration(this);
  if(mode==='street'&&previous==='first'){this.thirdYaw=this.firstYaw;this.resolvedYaw=this.firstYaw;this.cameraAvoidanceOffset=0;this.cameraAvoidanceReturning=false;}
  if(mode==='first'&&previous==='street'&&this.thirdCameraReady)this.firstYaw=this.getHeading();
  this.cameraMode=mode;this.streetView=mode!=='overview';this.controls.minDistance=9;this.controls.maxDistance=110;
  this.camera.near=mode==='first'?.06:mode==='street'?.08:.3;this.camera.fov=mode==='first'?68:mode==='street'?EXPLORATION.fov:40;this.camera.updateProjectionMatrix();
  const damping=this.controls.enableDamping;this.controls.enableDamping=false;this.controls.update();this.controls.enableDamping=damping;
  this.controls.enabled=mode==='overview';this.player.visible=mode!=='first';
  if(mode==='first')this.syncFirstPersonCamera();
  else if(mode==='street'){updateThirdPerson(this,0,true);this.thirdCameraReady=true;}
  else{this.controls.target.copy(this.getOverviewTarget());this.camera.position.copy(this.controls.target).add(new THREE.Vector3(39,46,58));this.preferredCameraHeight=46;this.controls.update();}
  this.curvedWorld?.update();return mode;
 }
 cycleView(){const modes=['first','street','overview'];return this.setCameraMode(modes[(modes.indexOf(this.cameraMode)+1)%modes.length]);}
 getHeading(){if(this.cameraMode==='first'&&!this.conversation)return this.firstYaw;const direction=new THREE.Vector3();this.camera.getWorldDirection(direction);return THREE.MathUtils.euclideanModulo(Math.atan2(direction.x,-direction.z),TAU);}
 setLookDelta(dx,dy){
  if(!['first','street'].includes(this.cameraMode)||(this.blocked&&!this.readingClue)||this.conversation||!this.active||!Number.isFinite(dx)||!Number.isFinite(dy))return false;
  this.cancelArrivalView('look-input');
  if(this.cameraMode==='street'){
   this.cameraReturn=null;initialiseExploration(this);
   // Start at the view the player actually sees, including any earlier side
   // assistance. A stale preferred yaw can otherwise jump across a wall corner.
   this.thirdYaw=THREE.MathUtils.euclideanModulo(this.getHeading()+dx*this.lookSensitivity,TAU);this.thirdPitch=THREE.MathUtils.clamp(this.thirdPitch+dy*this.lookSensitivity,-.12,.83);
   this.lastManualLook=this.elapsed;this.manualLookTime=this.elapsed;this.cameraAvoidanceOffset=0;this.cameraAvoidanceReturning=false;this.cameraClearTime=0;
   updateThirdPerson(this,0,true,{manualLook:true});
  }else{this.firstYaw=THREE.MathUtils.euclideanModulo(this.firstYaw+dx*this.lookSensitivity,TAU);this.firstPitch=THREE.MathUtils.clamp(this.firstPitch-dy*this.lookSensitivity,-1.2,1.22);this.syncFirstPersonCamera();}return true;
 }
 syncFirstPersonCamera(){
  const p=this.player.position,seated=['bicycle','boat','car','reading','ferry'].includes(this.propInteractions?.mode);this.camera.position.set(p.x,p.y+this.eyeHeight+(seated?(this.player.userData.rig?.root.position.y??0):0),p.z);this.camera.rotation.set(this.firstPitch,-this.firstYaw,0,'YXZ');
  const direction=new THREE.Vector3();this.camera.getWorldDirection(direction);this.controls.target.copy(this.camera.position).add(direction);this.camera.updateMatrixWorld(true);
 }
 setupFirstPersonInput(){
  this.canvas.addEventListener('pointerdown',e=>{this.cancelArrivalView('pointer-input');if(!['first','street'].includes(this.cameraMode)||!this.active||(this.blocked&&!this.readingClue)||this.conversation||document.pointerLockElement===this.canvas||e.button>2)return;this.canvas.focus?.({preventScroll:true});this.lookDrag={id:e.pointerId,x:e.clientX,y:e.clientY};this.canvas.setPointerCapture?.(e.pointerId);e.preventDefault();});
  this.canvas.addEventListener('contextmenu',e=>e.preventDefault());
  this.canvas.addEventListener('wheel',e=>{this.cancelArrivalView('zoom-input');if(this.cameraMode!=='street'||!this.active||(this.blocked&&!this.readingClue))return;e.preventDefault();this.cameraReturn=null;initialiseExploration(this);this.thirdDistance=THREE.MathUtils.clamp(this.thirdDistance+e.deltaY*.003,2.5,7);this.lastManualLook=this.elapsed;},{passive:false});
  this.canvas.addEventListener('pointermove',e=>{if(document.pointerLockElement===this.canvas){this.setLookDelta(e.movementX,e.movementY);return;}if(this.lookDrag?.id!==e.pointerId)return;const dx=e.clientX-this.lookDrag.x,dy=e.clientY-this.lookDrag.y;this.lookDrag.x=e.clientX;this.lookDrag.y=e.clientY;this.setLookDelta(dx,dy);});
  const stop=e=>{if(this.lookDrag?.id===e.pointerId){this.lookDrag=null;this.manualLookTime=this.elapsed;}};this.canvas.addEventListener('pointerup',stop);this.canvas.addEventListener('pointercancel',stop);this.canvas.addEventListener('lostpointercapture',stop);
  document.addEventListener('pointerlockchange',()=>{this.pointerLocked=document.pointerLockElement===this.canvas;if(!this.pointerLocked){this.lookDrag=null;this.keys={};}});
 }
 async requestPointerLock(){
  if(this.cameraMode!=='first'||!this.active||this.blocked||!this.canvas.requestPointerLock)return false;
  try{await this.canvas.requestPointerLock();return document.pointerLockElement===this.canvas;}catch{return false;}
 }
 releasePointerLock(){if(document.pointerLockElement===this.canvas)document.exitPointerLock?.();this.pointerLocked=false;this.lookDrag=null;}
 canPlayerStep(from,to){
  if(!walkableSegment(this,from,to)||!canTraverseOverhead(this,from,to))return false;
  const steps=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.z-from.z)/.15));
  return this.npcs.every(({group})=>{
   if(!group.visible)return true;const startDistance=Math.hypot(from.x-group.position.x,from.z-group.position.z);
   for(let i=1;i<=steps;i++){const f=i/steps,distance=Math.hypot(from.x+(to.x-from.x)*f-group.position.x,from.z+(to.z-from.z)*f-group.position.z);if(distance<.52&&distance<startDistance-.0001)return false;}
   return true;
  });
 }
 updateStoryProps(){
  for(const[id,group]of Object.entries(this.supplyGroups))group.visible=!this.collectedSupplies?.has(id);
  this.deliveredFood.visible=Boolean(this.storyFlags?.has('chef'));
  const delivered=this.storyFlags?.has('checked');this.deliveredFood.position.set(delivered?15.8:19.6,.13,delivered?-4.6:13.6);
 }
 setupShadowCache(){
  this.shadowStats={updates:0,requests:0,renderedFrames:0,lastReason:null};this.shadowDirty=false;
  const immutable=new Set();this.static.traverse(mesh=>{if(mesh.isMesh&&mesh.castShadow)immutable.add(mesh);});
  this.shadowTextures=new Map();
  // Animated people, the ferry and moving foliage must never be baked into a
  // static map. Their small grounding shadows follow them as ordinary geometry.
  this.scene.traverse(mesh=>{if(!mesh.isMesh)return;mesh.castShadow=immutable.has(mesh)||Boolean(mesh.isInstancedMesh&&mesh.material?.alphaTest>0);if(!mesh.castShadow)return;
   for(const material of(Array.isArray(mesh.material)?mesh.material:[mesh.material]))for(const texture of[material.alphaMap,(material.alphaTest>0||material.transparent)?material.map:null])if(texture)this.shadowTextures.set(texture,texture.version);
   const before=mesh.onBeforeShadow;mesh.onBeforeShadow=(...args)=>{before?.apply(mesh,args);if(args[3]===this.sun.shadow.camera&&this.lastShadowRenderFrame!==this.shadowStats.renderedFrames){this.lastShadowRenderFrame=this.shadowStats.renderedFrames;this.shadowStats.updates++;}};
  });
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d'),gradient=ctx.createRadialGradient(32,32,1,32,32,31);
  gradient.addColorStop(0,'rgba(16,37,37,.48)');gradient.addColorStop(.4,'rgba(16,37,37,.27)');gradient.addColorStop(1,'rgba(16,37,37,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
  const texture=new THREE.CanvasTexture(canvas),material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
  this.contactShadows=[{id:'player',group:this.player},...this.npcs].map(actor=>{
   const shadow=new THREE.Mesh(new THREE.PlaneGeometry(.95,1.18),material.clone());shadow.rotation.x=-Math.PI/2;shadow.castShadow=false;shadow.renderOrder=1;this.scene.add(shadow);return {actor,shadow};
  });
  this.renderer.shadowMap.autoUpdate=false;this.requestShadowUpdate('initial-static-scene');
 }
 requestShadowUpdate(reason='static-scene-changed'){this.shadowDirty=true;if(this.shadowStats){this.shadowStats.requests++;this.shadowStats.lastReason=reason;}}
 pollShadowTextures(){let changed=false;for(const[texture,version]of this.shadowTextures){if(texture.version!==version){this.shadowTextures.set(texture,texture.version);changed=true;}}if(changed)this.requestShadowUpdate('alpha-textures-ready');}
 getShadowStats(){return {...this.shadowStats,dirty:this.shadowDirty,mode:'static-cache',mapSize:this.sun.shadow.mapSize.x,dynamicContactShadows:this.contactShadows?.length??0,trackedAlphaTextures:this.shadowTextures?.size??0};}
 updateContactShadows(){
  for(const {actor,shadow} of this.contactShadows){const p=actor.group.position;shadow.visible=actor.group.visible&&!(actor.group===this.player&&['ferry','boat'].includes(this.propInteractions?.mode));shadow.position.set(p.x,this.heightAt(p.x,p.z)+.016,p.z);shadow.rotation.z=-actor.group.rotation.y;const rise=Math.max(0,p.y-this.heightAt(p.x,p.z));shadow.scale.setScalar(1+rise*.16);shadow.material.opacity=(actor.group===this.player?(this.playerOpacity??1):1)/(1+rise*.85);}
 }
 beginConversation(placeId,{replay=false}={}){
  this.cancelArrivalView('conversation');
  replay=Boolean(replay);
  const id=placeId||this.conversation?.placeId||this.near?.id||'shop';
  if(this.conversation?.placeId===id&&this.conversation.replay===replay)return;
  if(this.conversation)this.endConversation();
  if(!initialisePlayerMotion(this).grounded)resetPlayerMotion(this);
  // A journal/CG replay is heard here, not a new visit to the story's address.
  // Keep its narrative placeId, but never frame or turn a distant resident.
  const npc=replay?null:this.npcs.find(n=>n.id===id&&n.group.visible)?.group;
  const point=POIS.find(p=>p.id===id),player=this.player.position;
  const focus=replay?player.clone():npc?npc.position.clone():id==='shop'?new THREE.Vector3(-12,1.05,17):new THREE.Vector3(point?.x??player.x,player.y,point?.z??player.z);
  const target=player.clone().add(focus).multiplyScalar(.5);target.y=npc?(player.y+focus.y)/2+.55:player.y+.30;
  const restore=this.cameraReturn||{position:this.camera.position.clone(),target:this.controls.target.clone(),minDistance:this.controls.minDistance,maxDistance:this.controls.maxDistance,mode:this.cameraMode,firstYaw:this.firstYaw,firstPitch:this.firstPitch,playerPosition:player.clone(),playerYaw:this.player.rotation.y,near:this.camera.near,fov:this.camera.fov,thirdYaw:this.thirdYaw,thirdPitch:this.thirdPitch,thirdDistance:this.thirdDistance};
  this.cameraReturn=null;this.walking=false;this.moveSpeed=0;this.path=[];this.releasePointerLock();this.player.visible=true;this.controls.enabled=true;this.camera.near=.3;this.camera.fov=40;this.camera.updateProjectionMatrix();
  const eyes=[player.clone().add(new THREE.Vector3(0,this.player.userData.eyeHeight??1.5,0)),player.clone().add(new THREE.Vector3(0,.2,0))];
  if(!replay)eyes.push(focus.clone().add(new THREE.Vector3(0,npc?(npc.userData.eyeHeight??1.45):.3,0)),focus.clone().add(new THREE.Vector3(0,.2,0)));
  const current=this.camera.position.clone().sub(this.controls.target);current.y=0;current.normalize().multiplyScalar(5.8);
  const options=[[current.x,current.z],[4.5,6.6],[-4.5,6.6],[-5.5,5.5],[7.6,1.3],[-7.6,1.3],[0,7.8],[5.5,-5.5],[-5.5,-5.5],[0,-7.8]];
  let position=null,bestScore=-Infinity,bestSeparation=0;const frameScale=Math.max(1,.82/this.camera.aspect);
  const actorAxis=focus.clone().sub(player);actorAxis.y=0;actorAxis.normalize();
  const previousDirection=current.clone().normalize();
  // Keep both silhouettes readable, including on a narrow portrait screen.
  for(const height of[1.9,3.2,5.8]){
   for(const [dx,dz]of options){
    const radius=(npc?5.8:6.6)/Math.hypot(dx,dz),candidate=target.clone().add(new THREE.Vector3(dx*radius,height,dz*radius).multiplyScalar(frameScale));
    if(!this.conversationSightline(candidate,eyes))continue;
    if(!npc){position=candidate;break;}
    const direction=new THREE.Vector3(dx,0,dz).normalize();
    const separation=Math.abs(actorAxis.dot(new THREE.Vector3(direction.z,0,-direction.x)));
    const score=separation*2+direction.dot(previousDirection)*.25-height*.025;
    if(score>bestScore){bestScore=score;bestSeparation=separation;position=candidate;}
   }
   if(position&&(!npc||bestSeparation>=.6))break;
  }
  // A narrow lane may have no clear 6.6m boom. Try closer solo views before
  // falling back to the current safe camera; no cross-town midpoint is used.
  if(replay&&!position){
   for(const radius of[4.6,3.4]){
    for(const[dx,dz]of options){
     const candidate=target.clone().add(new THREE.Vector3(dx/Math.hypot(dx,dz)*radius,1.9,dz/Math.hypot(dx,dz)*radius));
     if(this.conversationSightline(candidate,eyes)){position=candidate;break;}
    }
    if(position)break;
   }
   if(!position&&this.conversationSightline(this.camera.position,eyes))position=this.camera.position.clone();
  }
  position??=target.clone().add(new THREE.Vector3(7,13,8));
  this.conversation={placeId:id,replay,framingMode:replay?'solo-memory':npc?'two-person':'local-scene',npc,npcYaw:npc?.rotation.y,restore,target,position,eyes,framingTarget:target.clone(),lastSafe:position.clone(),manual:false};
  this.controls.minDistance=3.6;this.controls.maxDistance=35;
  if(focus.distanceTo(player)>.2)this.player.rotation.y=Math.atan2(focus.x-player.x,focus.z-player.z);
  this.player.userData.legs.forEach(leg=>leg.rotation.x=0);
  if(npc)npc.rotation.y=Math.atan2(player.x-npc.position.x,player.z-npc.position.z);
 }
 refitConversationCamera(){
  // Resizing is a re-composition of the same conversation, not a close/open.
  // Retain its original first-person return pose, speaker and NPC heading.
  if(!this.conversation)return;
  this.conversation.manual=false;this.fitConversationCamera();
 }
 fitConversationCamera(){
  const c=this.conversation;if(!c||c.manual)return;
  const height=this.canvas?.clientHeight||900,canvasTop=this.canvas?.getBoundingClientRect?.().top??0;
  const top=Math.min(168,height*.21),panels=typeof document==='undefined'?[]:['.dialogue-box','.resident-chat'].map(selector=>document.querySelector?.(selector)?.getBoundingClientRect()).filter(rect=>rect&&rect.top-canvasTop>top+100);
  // Ignore a hidden old dialogue node and fit to the actual visible card.
  // 36 px leaves room for toe depth, breathing and the camera's easing tail.
  const bottom=panels.length?Math.min(...panels.map(rect=>rect.top-canvasTop))-36:height-241;
  c.framingTarget??=c.target.clone();c.target.copy(c.framingTarget);
  const probe=new THREE.PerspectiveCamera(40,this.camera.aspect,this.camera.near,this.camera.far);
  probe.position.copy(c.position);
  const actors=[this.player,...(c.npc?[c.npc]:[])],points=actors.flatMap(actor=>{
   const rig=actor.userData.rig,scale=actor.scale.y||1,footWidth=(rig?.soleHalfWidth??.092)+.11;
   const feet=[];
   // Include the toes and heels, whose perspective depth can extend below an
   // origin-only probe when taller and shorter actors share the same frame.
   for(const x of[-footWidth,footWidth])for(const z of[rig?.soleBack??-.101,rig?.soleFront??.197])feet.push(new THREE.Vector3(x,-.008,z).applyAxisAngle(new THREE.Vector3(0,1,0),actor.rotation.y).multiplyScalar(scale).add(actor.position));
   return [...feet,actor.position.clone().add(new THREE.Vector3(0,(actor.userData.height||1.78)+.035,0))];
  });
  // Compose into the actual space above the subtitle card. A fixed world-space
  // target cannot reserve the same safe area on 1080p and a shorter laptop.
  for(let i=0;i<10;i++){
   probe.lookAt(c.target);probe.updateMatrixWorld(true);
   const ys=points.map(p=>(1-(this.curvedWorld?.point(p)??p.clone()).project(probe).y)*height/2),center=(Math.min(...ys)+Math.max(...ys))/2;
   const required=(Math.max(...ys)-Math.min(...ys)+4)/(bottom-top);
   if(required>1){
    // Different heights and perspective depths may not fit by panning alone.
    // Widen the dialogue lens slightly, keeping its collision-safe position.
    probe.fov=Math.min(64,THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(probe.fov/2))*required)));
    probe.updateProjectionMatrix();
   }
   const desired=(top+bottom)/2,shift=(center-desired)/(height*.5)*Math.tan(THREE.MathUtils.degToRad(probe.fov/2))*probe.position.distanceTo(c.target);
   c.target.y-=THREE.MathUtils.clamp(shift,-.5,.5);
  }
  this.camera.fov=probe.fov;this.camera.updateProjectionMatrix();
 }
 occlusionBoxes(padding=0){
  this.fixedOcclusionBoxes??=new Map();this.dynamicOcclusionBoxes??=new Map();
  const dynamic=c=>c.kind==='bicycle'||String(c.kind||'').includes('car');
  if(!this.fixedOcclusionBoxes.has(padding))this.fixedOcclusionBoxes.set(padding,[...this.colliders.filter(c=>!dynamic(c)),...this.cameraOccluders].map(c=>new THREE.Box3(new THREE.Vector3(c.x-padding,c.y??0,c.z-padding),new THREE.Vector3(c.X+padding,c.height??11,c.Z+padding))));
  const result=[...this.fixedOcclusionBoxes.get(padding)];
  for(const c of this.colliders.filter(dynamic)){
   let cache=this.dynamicOcclusionBoxes.get(c);if(!cache){cache=new Map();this.dynamicOcclusionBoxes.set(c,cache);}
   let box=cache.get(padding);if(!box){box=new THREE.Box3();cache.set(padding,box);}
   box.min.set(c.x-padding,c.y??0,c.z-padding);box.max.set(c.X+padding,c.height??11,c.Z+padding);result.push(box);
  }
  return result;
 }
 conversationSightline(position,eyes){
  this.conversationBounds=this.occlusionBoxes(.08);
  const logicalCamera=this.curvedWorld?.inverse(position)??position;
  if(this.conversationBounds.some(box=>box.distanceToPoint(logicalCamera)<.45))return false;
  if(this.curvedWorld?.enabled)return eyes.every(eye=>curvedSightline(position,eye,this.curvedWorld.center,this.curvedWorld.radius,this.conversationBounds,.30));
  const ray=new THREE.Ray(),hit=new THREE.Vector3();
  return eyes.every(origin=>{const delta=position.clone().sub(origin),distance=delta.length();ray.set(origin,delta.normalize());return !this.conversationBounds.some(box=>ray.intersectBox(box,hit)&&hit.distanceTo(origin)<distance-.3);});
 }
 protectConversationCamera(){
  const c=this.conversation;if(!c||this.suspended)return;
  if(this.conversationSightline(this.camera.position,c.eyes))c.lastSafe.copy(this.camera.position);
  else{this.camera.position.copy(c.manual?c.lastSafe:c.position);if(!c.manual)this.controls.target.copy(c.target);this.camera.lookAt(this.controls.target);}
 }
 setConversationSpeaker(who){
  const id=who==='阿遥'?'player':({林婆婆:'granny',蔡姨:'chef',周伯:'dock',小许:'community',陈姐:'walker0'}[who]||null);
  this.speakingId=this.conversation?.replay&&id!=='player'?null:id;
 }
 endConversation(){
  if(!this.conversation)return;
  const{npc,npcYaw,restore}=this.conversation;if(npc)npc.rotation.y=npcYaw;
  this.controls.minDistance=restore.minDistance;this.controls.maxDistance=restore.maxDistance;
  this.conversation=null;this.speakingId=null;this.player.rotation.z=0;
  if(restore.mode==='first'){
   this.cameraMode='first';this.firstYaw=restore.firstYaw;this.firstPitch=restore.firstPitch;this.player.position.copy(restore.playerPosition);this.player.rotation.y=restore.playerYaw;
   this.camera.near=restore.near;this.camera.fov=restore.fov;this.camera.updateProjectionMatrix();this.cameraReturn=null;this.player.visible=false;this.controls.enabled=false;this.syncFirstPersonCamera();
  }else{this.camera.near=restore.near;this.camera.fov=restore.fov;this.camera.updateProjectionMatrix();this.thirdYaw=restore.thirdYaw;this.thirdPitch=restore.thirdPitch;this.thirdDistance=restore.thirdDistance;this.cameraReturn=restore;}
 }
 updateConversation(dt){
  const blend=this.reduced?1:1-Math.exp(-dt*4.5);
  if(this.conversation){if(!this.suspended&&!this.conversation.manual){this.camera.position.lerp(this.conversation.position,blend);this.controls.target.lerp(this.conversation.target,blend);}return;}
  if(this.cameraReturn){
   if(this.walking||this.orbitInteracting||!initialisePlayerMotion(this).grounded){this.cameraReturn=null;return;}
   const next=this.camera.position.clone().lerp(this.cameraReturn.position,blend),blocked=cameraBoomDistance(this.camera.position,next,[...this.colliders,...this.cameraOccluders],.12)<this.camera.position.distanceTo(next)-.001;
   this.camera.position.lerp(this.cameraReturn.position,blocked?1:blend);this.controls.target.lerp(this.cameraReturn.target,blocked?1:blend);
   if(this.camera.position.distanceTo(this.cameraReturn.position)<.035&&this.controls.target.distanceTo(this.cameraReturn.target)<.035){this.camera.position.copy(this.cameraReturn.position);this.controls.target.copy(this.cameraReturn.target);this.cameraReturn=null;}
  }
 }
 setQuality(low){const wasEnabled=this.renderer.shadowMap.enabled;this.lowQuality=Boolean(low);this.renderer.setPixelRatio(low?1:Math.min(devicePixelRatio,1.6));this.renderer.shadowMap.enabled=!low;this.outline.enabled=!low;if(this.edgeAA)this.edgeAA.enabled=!low;if(!low&&!wasEnabled)this.requestShadowUpdate('high-quality-restored');this.resize();}
 clearCamera(dt){
  if(this.active&&this.cameraMode==='street'&&!this.conversation&&!this.cameraReturn&&!isArrivalViewActive(this))updateThirdPerson(this,dt);
 }
 labelSightline(x,y,z){
  this.labelBounds=this.occlusionBoxes();
  if(this.curvedWorld?.enabled)return curvedSightline(this.camera.position,new THREE.Vector3(x,y,z),this.curvedWorld.center,this.curvedWorld.radius,this.labelBounds);
  const target=new THREE.Vector3(x,y,z),delta=target.sub(this.camera.position),distance=delta.length(),ray=new THREE.Ray(this.camera.position,delta.normalize()),hit=new THREE.Vector3();
  return !this.labelBounds.some(box=>ray.intersectBox(box,hit)&&hit.distanceTo(this.camera.position)<distance-.25);
 }
 project(x,z,y=2.8){const v=new THREE.Vector3(x,y,z);this.curvedWorld?.point(v,v);v.project(this.camera);return {x:(v.x*.5+.5)*this.canvas.clientWidth,y:(-.5*v.y+.5)*this.canvas.clientHeight,visible:v.z<1&&v.x>-1&&v.x<1&&v.y>-1&&v.y<1};}
 animate(){
  this.raf=requestAnimationFrame(this.animate);const dt=Math.min(this.clock.getDelta(),.05);this.elapsed+=dt;const t=this.elapsed;
  this.walking=false;this.movementDistance=0;initialisePlayerMotion(this);updateArrivalView(this,dt);
  if(this.active&&!this.blocked&&!this.suspended&&(!this.propInteractions||this.propInteractions.mode==='walk')){
   let dx=0,dz=0,routeRemaining=Infinity;
   const up=this.keys.w||this.keys.arrowup,down=this.keys.s||this.keys.arrowdown,left=this.keys.a||this.keys.arrowleft,right=this.keys.d||this.keys.arrowright;
   if(up||down||left||right){
    this.path=[];const heading=this.getHeading();
    const forward=new THREE.Vector3(Math.sin(heading),0,-Math.cos(heading)),side=new THREE.Vector3(Math.cos(heading),0,Math.sin(heading));
    const move=forward.multiplyScalar((up?1:0)-(down?1:0)).addScaledVector(side,(right?1:0)-(left?1:0));if(move.lengthSq())move.normalize();dx=move.x;dz=move.z;
   }else if(this.path.length){
    const to=this.path[0].clone().sub(this.player.position);to.y=0;routeRemaining=to.length();
    if(routeRemaining<.015){this.player.position.x=this.path[0].x;this.player.position.z=this.path[0].z;this.path.shift();routeRemaining=0;if(!this.path.length)this.moveSpeed=0;}
    else{to.normalize();dx=to.x;dz=to.z;}
   }
   if(this.path.length&&this.cameraMode==='street'&&(dx||dz)&&this.elapsed-(this.lastManualLook??-100)>2.2){
    const destination=this.path.at(-1),greeting=this.path.length===1&&routeRemaining<4&&this.npcs.some(n=>n.group.visible&&Math.hypot(destination.x-n.group.position.x,destination.z-n.group.position.z)<2.5);
    this.thirdYaw+=angleDelta(this.thirdYaw,Math.atan2(dx,-dz)+(greeting?.48:0))*(1-Math.exp(-dt*1.5));
   }
   const step=movementStep(this,dx,dz,dt,routeRemaining),speed=step.distance,p=this.player.position,beforeX=p.x,beforeZ=p.z;
   dx=step.dx;dz=step.dz;
   if(speed>.000001&&(dx||dz)){
    const destination={x:p.x+dx*speed,z:p.z+dz*speed};
    if(this.canPlayerStep(p,destination)){p.x=destination.x;p.z=destination.z;}
    else{if(this.canPlayerStep(p,{x:p.x+dx*speed,z:p.z}))p.x+=dx*speed;if(this.canPlayerStep(p,{x:p.x,z:p.z+dz*speed}))p.z+=dz*speed;}
    this.movementDistance=Math.hypot(p.x-beforeX,p.z-beforeZ);this.walking=this.movementDistance>.00001;
    if(this.walking){this.player.rotation.y+=angleDelta(this.player.rotation.y,Math.atan2(dx,dz))*(1-Math.exp(-dt*14));this.callbacks.onMove?.(p);}
    const routeProgress=this.path.length?routeRemaining-Math.hypot(this.path[0].x-p.x,this.path[0].z-p.z):Infinity;
    if(this.path.length&&routeProgress<speed*.1){this.routeStuckTime=(this.routeStuckTime||0)+dt;if(this.routeStuckTime>.45){const end=this.path.at(-1);this.routeStuckTime=0;this.navigate(end.x,end.z);}}else this.routeStuckTime=0;
   }
   if(this.cameraMode==='first'&&!this.conversation)this.syncFirstPersonCamera();
   else if(this.cameraMode==='overview'&&!this.cameraReturn){const target=this.getOverviewTarget();const delta=target.sub(this.controls.target).multiplyScalar(1-Math.exp(-dt*2));this.controls.target.add(delta);this.camera.position.add(delta);}
  }
  if(!this.active||this.blocked)this.moveSpeed=0;
  if(!this.propInteractions||this.propInteractions.mode==='walk')updatePlayerVertical(this,dt);
  this.propInteractions?.update(dt,t);
  if(this.active&&!this.suspended&&this.cameraMode==='overview'&&['boat','ferry'].includes(this.propInteractions?.mode)&&!this.cameraReturn){const delta=this.getOverviewTarget().sub(this.controls.target).multiplyScalar(1-Math.exp(-dt*2));this.controls.target.add(delta);this.camera.position.add(delta);}
  this.clearCamera(dt);this.updateConversation(dt);
  const orbitMode=this.cameraMode==='overview'||Boolean(this.conversation);this.controls.enabled=orbitMode&&(!this.blocked||this.readingClue||Boolean(this.conversation&&!this.suspended));
  if(orbitMode)this.controls.update();else if(this.cameraMode==='first'&&!this.conversation)this.syncFirstPersonCamera();else if(this.cameraReturn)this.camera.lookAt(this.controls.target);
  this.protectConversationCamera();updatePlayerOcclusion(this,dt);this.curvedWorld?.update();
  if(!this.reduced){
   this.waterUniforms.time.value=t*.18;this.ferry.position.x=5+Math.sin(t*.025)*18;this.ferry.position.y=Math.sin(t)*.045;
   this.steam.children.forEach((p,i)=>{p.position.y=(t*.55+i*.5)%3;p.position.x=Math.sin(t+i)*.25;p.material.opacity=.17*(1-p.position.y/3);p.scale.setScalar(.5+p.position.y*.35);});
  }
  for(const resident of this.npcs)resident.group.visible=!this.rainy||this.ended||resident.id==='community'||this.conversation?.npc===resident.group;
  updateTownLife(this,dt,t);if(!this.suspended){this.propInteractions?.pose(dt,t);this.heroAvatar?.update(dt,t);updateResidentAvatars(this,dt,t);}this.propInteractions?.updateSafetyWear();updateAdventureScenery(this,dt,t);this.updateContactShadows();this.updateStoryProps();
  for(const m of this.loreMarkers){m.group.visible=this.active&&!this.blocked&&!this.collectedLore.has(m.id);m.group.position.y=m.y+(this.reduced?0:Math.sin(t*1.7+m.y)*.10);m.star.rotation.y=this.reduced?0:t*.5;}
  this.rain.visible=this.rainy&&!this.ended&&!this.reduced;
  if(this.rain.visible){this.rain.position.set(this.player.position.x,0,this.player.position.z);const p=this.rain.geometry.attributes.position;for(let i=0;i<p.count;i++){p.array[i*3+1]-=dt*17;if(p.array[i*3+1]<0)p.array[i*3+1]=35;}p.needsUpdate=true;}
  this.windowMats.forEach(m=>m.emissiveIntensity=THREE.MathUtils.lerp(m.emissiveIntensity,this.ended?1.6:this.rainy?.8:.22,.015));
  const p=this.player.position;let nearest=null,dist=Infinity;
  const adventurePoints=this.rainy&&!this.ended?[]:ADVENTURE_STOPS.filter((point,i)=>this.adventureFound?.has(point.id)||i===(this.adventureFound?.size??0));
  for(const point of [...POIS,...adventurePoints,...(this.rainy&&!this.ended?[]:WUHAN_DISTRICT_STOPS)]){const d=Math.hypot(point.x-p.x,point.z-p.z);if(d<(point.radius??3.1)&&d<dist&&(!point.adventure||Math.abs(p.y-this.heightAt(point.x,point.z))<.5)){nearest=point;dist=d;}}
  this.near=dist<3.1?nearest:null;this.focusRing.visible=this.active&&!this.blocked&&this.cameraMode==='overview';this.focusRing.position.set(p.x,this.heightAt(p.x,p.z)+.04,p.z);
  if(this.guidance)this.guidance.visible=this.active&&!this.blocked;
  this.worldParticles?.update(dt);this.callbacks.onNear?.(this.near);this.callbacks.onFrame?.(dt);
  if(!document.hidden&&((this.active&&!this.suspended)||!this.firstFrameRendered)){
   this.renderer.info.reset();this.shadowStats.renderedFrames++;
   this.pollShadowTextures();
   const refresh=this.renderer.shadowMap.enabled&&this.shadowDirty;this.renderer.shadowMap.needsUpdate=refresh;
   this.composer.render();if(refresh)this.shadowDirty=false;this.firstFrameRendered=true;
  }
 }
}
