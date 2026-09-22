import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

// A buoy-marked fictional practice bay, separate from the passenger ferry's
// x=19..35 route. Coordinates are shared by controls, race gates and saves.
export const ROWBOAT_WATER_BOUNDS=Object.freeze({minX:39,maxX:101,minZ:-56,maxZ:-35});
export const ROWBOAT_DOCK=Object.freeze({x:42,z:-38.3,yaw:Math.PI/2});
export const ROWBOAT_ANCHOR=Object.freeze({id:'prop-rowboat',name:'江湾小木船',label:'借船划江',x:35,z:-21.8,kind:'prop',propType:'boat',icon:'ferry'});
export const NEIGHBORHOOD_RACE_ANCHOR=Object.freeze({id:'race-car',name:'江城顺路赛',label:'驾驶计时赛',x:54,z:23,kind:'prop',propType:'race',icon:'car'});
export const ROWBOAT_SETTINGS=Object.freeze({halfLength:2.14,halfWidth:.94,maxSpeed:4.8,reverseSpeed:1.65,turnRate:.82,seatY:.54,playerY:-.18,playerZ:-.28});
const clamp=THREE.MathUtils.clamp,UP=new THREE.Vector3(0,1,0);
const point=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const finite=n=>Number.isFinite(n);

export function rowboatExtents(yaw=0){
 const s=Math.abs(Math.sin(yaw)),c=Math.abs(Math.cos(yaw)),{halfLength:l,halfWidth:w}=ROWBOAT_SETTINGS;
 return {x:s*l+c*w,z:c*l+s*w};
}
export function rowboatPoseWithinBounds(p,bounds=ROWBOAT_WATER_BOUNDS){
 if(!p||![p.x,p.z,p.yaw].every(finite))return false;
 const e=rowboatExtents(p.yaw);
 return p.x-e.x>=bounds.minX-1e-8&&p.x+e.x<=bounds.maxX+1e-8&&p.z-e.z>=bounds.minZ-1e-8&&p.z+e.z<=bounds.maxZ+1e-8;
}
export function constrainRowboatPose(p,bounds=ROWBOAT_WATER_BOUNDS){
 const yaw=finite(p?.yaw)?p.yaw:ROWBOAT_DOCK.yaw,e=rowboatExtents(yaw);
 return {x:clamp(finite(p?.x)?p.x:ROWBOAT_DOCK.x,bounds.minX+e.x,bounds.maxX-e.x),z:clamp(finite(p?.z)?p.z:ROWBOAT_DOCK.z,bounds.minZ+e.z,bounds.maxZ-e.z),yaw};
}

/** Metres/seconds. No DOM, clocks, quest flags or unlock state enter physics.
 * Forward/backward strokes and differential oars remain steerable at rest.
 * The whole hull stays inside the bay, including its turning footprint.
 */
export function stepRowboat(state,input={},dt=0,bounds=ROWBOAT_WATER_BOUNDS){
 const current=constrainRowboatPose(state,bounds),step=clamp(finite(dt)?dt:0,0,.1);
 let speed=clamp(finite(state?.speed)?state.speed:0,-ROWBOAT_SETTINGS.reverseSpeed,ROWBOAT_SETTINGS.maxSpeed);
 let strokePhase=finite(state?.strokePhase)?state.strokePhase:0;
 if(!step||input.blocked)return {...current,speed:input.blocked?0:speed,strokePhase,distance:0,signedDistance:0,boundaryHit:false,rowing:false,steering:0};
 const forward=Boolean(input.forward),backward=Boolean(input.backward),steering=(input.left?1:0)-(input.right?1:0);
 const throttle=(forward?1:0)-(backward?1:0),target=throttle>0?ROWBOAT_SETTINGS.maxSpeed:throttle<0?-ROWBOAT_SETTINGS.reverseSpeed:0;
 const braking=target*speed<0,rate=braking?4.2:target?1.5:2.5;
 speed=THREE.MathUtils.lerp(speed,target,1-Math.exp(-step*rate));if(Math.abs(speed)<.005&&!target)speed=0;
 const turn=steering*ROWBOAT_SETTINGS.turnRate*(.74+.26*Math.min(1,Math.abs(speed)/ROWBOAT_SETTINGS.maxSpeed))*step;
 const yaw=Math.atan2(Math.sin(current.yaw+turn),Math.cos(current.yaw+turn)),travel=speed*step;
 const desired={x:current.x+Math.sin(current.yaw+turn*.5)*travel,z:current.z+Math.cos(current.yaw+turn*.5)*travel,yaw};
 const next=constrainRowboatPose(desired,bounds),boundaryHit=Math.hypot(desired.x-next.x,desired.z-next.z)>1e-7;
 const distance=Math.hypot(next.x-current.x,next.z-current.z),signedDistance=distance*Math.sign(speed);
 const rowing=Boolean(throttle||steering);if(rowing)strokePhase+=step*(2.6+Math.abs(speed)*.28);
 return {...next,speed:boundaryHit?0:speed,strokePhase,distance,signedDistance,boundaryHit,rowing,steering};
}

function mergeStaticParts(group){
 const byMaterial=new Map();group.updateMatrixWorld(true);
 for(const child of [...group.children]){
  if(!child.isMesh||child.isInstancedMesh||child.userData.keepSeparate)continue;
  const list=byMaterial.get(child.material)??[];list.push(child);byMaterial.set(child.material,list);
 }
 for(const [material,parts]of byMaterial){
  if(parts.length<2)continue;
  const geometries=parts.map(mesh=>mesh.geometry.clone().applyMatrix4(mesh.matrix)),geometry=mergeGeometries(geometries);
  geometries.forEach(g=>g.dispose());if(!geometry)continue;
  for(const mesh of parts){mesh.removeFromParent();mesh.geometry.dispose();}
  const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=false;mesh.receiveShadow=true;group.add(mesh);
 }
}

function shellGeometry(){
 const positions=[],uvs=[],indices=[],lengthSteps=28,crossSteps=14;
 for(let j=0;j<=lengthSteps;j++){
  const t=j/lengthSteps,z=-2.02+t*4.09,ends=Math.pow(Math.sin(Math.PI*t),.52),width=.87*ends+.025;
  for(let i=0;i<=crossSteps;i++){
   const u=i/crossSteps,angle=(u-.5)*Math.PI,x=Math.sin(angle)*width,y=-.45+.73*(1-Math.cos(angle))+.12*Math.pow(Math.abs(t-.5)*2,4);
   positions.push(x,y,z);uvs.push(u,t*3);
   if(j<lengthSteps&&i<crossSteps){const k=j*(crossSteps+1)+i;indices.push(k,k+1,k+crossSteps+1,k+1,k+crossSteps+2,k+crossSteps+1);}
  }
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

/** Detailed, batchable painted-wood boat. Moving oars and 24 instanced ripple
 * arcs are inexpensive; no additional lights or realtime shadow refreshes.
 */
export function buildRowboat(world){
 const boat=new THREE.Group();boat.name='江湾小木船 · 双桨练习船';boat.userData.propId=ROWBOAT_ANCHOR.id;boat.position.set(ROWBOAT_DOCK.x,0,ROWBOAT_DOCK.z);boat.rotation.y=ROWBOAT_DOCK.yaw;world.scene.add(boat);
 const mat=(color,extra={})=>{const m=new THREE.MeshStandardMaterial({color,roughness:.82,...extra});m.userData.illustration='preserve';return m;};
 const paint=mat('#5d8c7b',{side:THREE.DoubleSide}),wood=mat('#bb9865'),light=mat('#dfc591'),grain=mat('#9b7a51'),cream=mat('#efe3bf'),brass=mat('#b79859',{roughness:.57,metalness:.28}),rope=mat('#bfb18e'),dark=mat('#476b61'),orange=mat('#d9935d');
 const mesh=(geometry,material,position=[0,0,0],parent=boat)=>{const m=new THREE.Mesh(geometry,material);m.position.set(...position);m.receiveShadow=true;m.castShadow=false;parent.add(m);return m;};
 const box=(w,h,d,material,x,y,z,parent)=>mesh(new THREE.BoxGeometry(w,h,d),material,[x,y,z],parent);
 const rod=(a,b,r,material,parent=boat)=>{const aa=point(...a),bb=point(...b),m=mesh(new THREE.CylinderGeometry(r,r,aa.distanceTo(bb),8),material,aa.clone().add(bb).multiplyScalar(.5).toArray(),parent);m.quaternion.setFromUnitVectors(UP,bb.sub(aa).normalize());return m;};
 const curve=(points,r,material,parent=boat)=>mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>point(...p))),32,r,6,false),material,[0,0,0],parent);
 mesh(shellGeometry(),paint);
 for(const side of[-1,1]){
  const rail=[],seam=[];
  for(let i=0;i<=20;i++){const t=i/20,z=-2.02+t*4.09,width=.87*Math.pow(Math.sin(Math.PI*t),.52)+.025;rail.push([side*width,.29+.12*Math.pow(Math.abs(t-.5)*2,4),z]);seam.push([side*width*.925,.045,z]);}
  curve(rail,.048,light);curve(seam,.016,cream);
 }
 // Individual floorboards, quiet seams, internal ribs and rounded benches.
 for(let i=-3;i<=3;i++){const len=3.08-Math.abs(i)*.19;box(.158,.065,len,i%2?wood:light,i*.168,-.13,0);box(.01,.004,len-.04,grain,i*.168+.066,-.095,0);}
 for(const z of[-1.40,-.8,.2,1.05,1.55]){
  const width=.85*Math.pow(Math.sin(Math.PI*(z+2.02)/4.09),.52);
  curve([[-width,.25,z],[-width*.76,-.045,z],[0,-.17,z],[width*.76,-.045,z],[width,.25,z]],.025,wood);
 }
 for(const z of[-.35,1.14]){box(1.42,.085,.39,wood,0,.285,z);box(1.45,.02,.40,light,0,.337,z);for(const x of[-.48,.48])box(.05,.37,.21,dark,x,.055,z);}
 // Footboard, stern repair patch and a tiny bow cleat: lived-in, not wrecked.
 box(.95,.075,.16,grain,0,.0,.72);box(.32,.018,.26,wood,.19,.327,1.14);
 for(const x of[-.12,.12])rod([x,.30,1.79],[x,.43,1.79],.025,brass);rod([-.21,.42,1.79],[.21,.42,1.79],.032,brass);
 for(let i=0;i<4;i++){const coil=mesh(new THREE.TorusGeometry(.17+i*.026,.013,5,28),rope,[0,.0,1.39]);coil.rotation.x=Math.PI/2;}
 for(const side of[-1,1]){
  const fender=mesh(new THREE.CapsuleGeometry(.11,.19,4,8),cream,[side*.88,-.01,-1.04]);fender.rotation.z=side*.15;rod([side*.78,.30,-1.04],[side*.90,.09,-1.04],.013,rope);
 }
 const lifering=mesh(new THREE.TorusGeometry(.24,.067,8,30),orange,[0,.03,-1.34]);lifering.rotation.x=Math.PI/2;
 for(let i=0;i<4;i++){const a=i*Math.PI/2;const band=box(.075,.016,.12,cream,Math.sin(a)*.237,.105,-1.34+Math.cos(a)*.237);band.rotation.y=a;}
 // The two independent handles are the IK targets for either hero model.
 const oars=[];
 for(const side of[-1,1]){
  const collar=mesh(new THREE.TorusGeometry(.067,.015,6,16),brass,[side*.81,.39,.03]);collar.rotation.y=Math.PI/2;
  const pivot=new THREE.Group();pivot.name=side<0?'左桨 · 活动桨架':'右桨 · 活动桨架';pivot.position.set(side*.81,.39,.03);boat.add(pivot);
  rod([-side*.50,0,0],[side*1.30,0,0],.025,wood,pivot);rod([-side*.51,0,0],[-side*.33,0,0],.035,grain,pivot);
  const blade=box(.68,.04,.24,wood,side*1.41,0,0,pivot);blade.rotation.z=side*.03;
  box(.09,.045,.245,paint,side*1.60,0,0,pivot);box(.59,.046,.018,light,side*1.38,.018,0,pivot);
  const handle=new THREE.Object3D();handle.position.set(-side*.48,0,0);pivot.add(handle);mergeStaticParts(pivot);oars.push({side,pivot,handle});
 }
 mergeStaticParts(boat);
 const rippleMaterial=new THREE.MeshBasicMaterial({color:'#d8eee0',transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide});
 const wakes=new THREE.InstancedMesh(new THREE.RingGeometry(.52,.55,20,1,.14,Math.PI*.73),rippleMaterial,24);wakes.name='划船轻水纹 · 24 个合批弧线';wakes.castShadow=false;wakes.frustumCulled=false;wakes.renderOrder=2;boat.add(wakes);
 const dummy=new THREE.Object3D();boat.userData.rig={oars,wakes,dummy,strokePhase:0};updateRowboatRig(boat,{time:0});return boat;
}

export function updateRowboatRig(boat,{time=0,strokePhase=0,speed=0,rowing=false,steering=0,reduced=false}={}){
 const rig=boat?.userData?.rig;if(!rig)return;
 const motion=Math.min(1,Math.abs(speed)/ROWBOAT_SETTINGS.maxSpeed);
 boat.position.y=reduced?0:Math.sin(time*1.5)*.015;boat.rotation.z=reduced?0:Math.sin(time*1.1)*.006;
 for(const {side,pivot}of rig.oars){
  const phase=strokePhase+side*steering*.20,amplitude=rowing?1:.18;
  pivot.rotation.y=side*Math.sin(phase)*.35*amplitude;
  pivot.rotation.z=side*(-.13-.17*Math.cos(phase)*amplitude);
 }
 rig.wakes.visible=!reduced&&(motion>.025||rowing);rig.wakes.material.opacity=.12+motion*.19;
 const d=rig.dummy;
 for(let i=0;i<24;i++){
  const side=i%2?1:-1,k=Math.floor(i/2),progress=((time*(.20+motion*.28)+k/12)%1),z=-1.55-progress*(3.4+motion*2.3);
  d.position.set(side*(.46+progress*(.72+motion*.33)),-.325-boat.position.y,z);d.rotation.set(-Math.PI/2,0,side>0?.13:Math.PI+.25);d.scale.set(.45+progress*.95,.22+progress*.62,1);d.updateMatrix();rig.wakes.setMatrixAt(i,d.matrix);
 }
 rig.wakes.instanceMatrix.needsUpdate=true;rig.strokePhase=strokePhase;
}

/** The safety vest is owned by the world, not the imported VRM. Avatar swaps
 * therefore cannot accidentally capture it as skin, hide it, or dispose its
 * geometry. It follows the same calibrated torso driver that drives the VRM.
 */
export function createBoatLifeJacket(world){
 const root=new THREE.Group();root.name='江湾救生衣 · 随躯干穿戴';root.visible=false;world.scene.add(root);
 return {root,avatarKey:null,bodyKey:null,meshes:[],fit:null};
}

function fitBoatLifeJacket(vest,world){
 const p=world.player,body=p.userData.body,rig=p.userData.rig;
 const shoulderSpan=Math.abs(p.userData.arms?.[1]?.position.x-p.userData.arms?.[0]?.position.x)||.35;
 const width=clamp(shoulderSpan*.95,.31,.42),shoulderY=Math.max(...(p.userData.arms??[]).map(a=>a.position.y),.28);
 const top=clamp(shoulderY+.015,.28,.38),bottom=-.075;
 let front=.10,back=-.095,samples=0;
 // Measure the indexed, currently posed torso once, excluding its side bag,
 // sleeves, hair and legs. Broad conservative bounds leave clothing clearance.
 const visual=world.heroAvatar?.vrm?.scene;
 if(visual){
  p.updateWorldMatrix(true,true);visual.updateWorldMatrix(true,false);visual.updateMatrixWorld(true);
  const inverse=body.matrixWorld.clone().invert(),vertex=new THREE.Vector3();
  visual.traverse(mesh=>{
   if(!mesh.isMesh||!mesh.geometry?.attributes.position)return;
   const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material],label=mesh.name+' '+mats.map(m=>m?.name??'').join(' ');
   if(/hair|face|eyeline|brow|shoe|boot|阿遥配件|肩带|缝线/i.test(label))return;
   mesh.skeleton?.update();const g=mesh.geometry,draw=g.drawRange,start=Math.max(0,draw.start||0),end=Math.min(g.index?.count??g.attributes.position.count,start+(draw.count??Infinity)),stride=Math.max(1,Math.floor((end-start)/12000));
   for(let n=start;n<end;n+=stride){
    const index=g.index?g.index.getX(n):n;mesh.getVertexPosition(index,vertex).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
    if(vertex.y<-.025||vertex.y>top-.035||Math.abs(vertex.x)>width*.36||Math.abs(vertex.z)>.25)continue;
    front=Math.max(front,vertex.z);back=Math.min(back,vertex.z);samples++;
   }
  });
 }
 front=clamp(front,.085,.175)+.016;back=clamp(back,-.165,-.075)-.016;
 for(const mesh of vest.meshes){mesh.geometry.dispose();mesh.removeFromParent();}
 const oldMaterials=new Set(vest.meshes.map(m=>m.material));for(const material of oldMaterials)material.dispose();vest.meshes=[];
 const mat=color=>{const material=new THREE.MeshStandardMaterial({color,roughness:.91});material.userData.illustration='preserve';return material;};
 const orange=mat('#e99450'),edge=mat('#c67b3f'),strap=mat('#394b42'),reflector=mat('#efe7bf'),buckle=mat('#758170');
 const add=(geometry,material,x=0,y=0,z=0)=>{const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=false;m.receiveShadow=true;m.frustumCulled=false;vest.root.add(m);return m;};
 const box=(w,h,d,material,x,y,z,r=.008)=>add(new RoundedBoxGeometry(w,h,d,2,Math.min(r,w*.3,h*.3,d*.3)),material,x,y,z);
 const height=top-bottom,center=(top+bottom)/2,half=width/2;
 for(const side of[-1,1]){
  const shape=new THREE.Shape();shape.moveTo(side*.023,bottom);shape.lineTo(side*(half-.024),bottom);shape.quadraticCurveTo(side*(half+.006),bottom+.04,side*half,top-.10);shape.lineTo(side*(half-.047),top);shape.lineTo(side*.067,top);shape.lineTo(side*.023,top-.135);shape.closePath();
  add(new THREE.ExtrudeGeometry(shape,{depth:.045,bevelEnabled:true,bevelSize:.012,bevelThickness:.008,bevelSegments:2,steps:1,curveSegments:5}),orange,0,0,front);
  // Shoulder bridge, reflective tab, stitched edge and a small drainage seam.
  box(.069,.055,front-back+.065,orange,side*(half-.076),top-.002,(front+back)/2+.008,.014);
  box(.039,.084,.007,reflector,side*(half-.072),top-.067,front+.055,.004);
  box(.014,height-.14,.008,edge,side*(half-.026),center-.035,front+.052,.003);
  box(.094,.008,.008,edge,side*(half*.57),bottom+.028,front+.054,.002);
 }
 box(width-.026,height-.018,.048,orange,0,center,back-.022,.022);
 box(width-.066,.04,.007,reflector,0,top-.070,back-.050,.006);
 for(const y of[bottom+.078,top-.145]){
  box(width+.004,.029,.014,strap,0,y,front+.059,.003);
  box(width-.010,.029,.013,strap,0,y,back-.051,.003);
  for(const side of[-1,1])box(.024,.029,front-back+.099,strap,side*(half-.006),y,(front+back)/2+.005,.003);
  box(.052,.043,.022,buckle,0,y,front+.074,.006);box(.030,.022,.006,strap,0,y,front+.087,.002);
 }
 mergeStaticParts(vest.root);vest.root.traverse(o=>{if(o.isMesh){o.name='救生衣 · 橙色浮力片/反光条/扣带';o.castShadow=false;o.frustumCulled=false;vest.meshes.push(o);}});
 world.curvedWorld?.attach(vest.root);vest.avatarKey=p.userData.avatarRig??null;vest.bodyKey=body;
 vest.fit={width,top,bottom,front,back,torsoSamples:samples,avatarId:world.avatarStatus?.id??'procedural',attachment:'calibrated torso driver',meshCount:vest.meshes.length};vest.root.userData.safetyVest={...vest.fit};
}

export function updateBoatLifeJacket(vest,world,{active=false}={}){
 if(!vest)return;
 const body=world.player?.userData?.body;
 if(!active||!body){vest.root.visible=false;return;}
 if(vest.bodyKey!==body||vest.avatarKey!==(world.player.userData.avatarRig??null))fitBoatLifeJacket(vest,world);
 body.updateWorldMatrix(true,false);body.getWorldPosition(vest.root.position);body.getWorldQuaternion(vest.root.quaternion);body.getWorldScale(vest.root.scale);
 vest.root.visible=world.cameraMode!=='first'&&world.player.visible!==false;
}

/** Scenic access is explicit: a supervised landing and a marked practice bay,
 * not an invisible boarding point or a route through the passenger ferry.
 */
export function buildRowboatLanding(world){
 const root=new THREE.Group();root.name='江湾练习水域 · 木栈桥与浮标';world.static.add(root);
 const box=(w,h,d,c,x,y,z)=>world.box(w,h,d,c,x,y,z,root);
 const beam=(a,b,r,c)=>world.beam(a,b,r,c,root);
 const label=(text,w,h,x,y,z,bg='#4d7465',fg='#f6e5bd')=>{const m=world.label(text,w,h,bg,fg,root);m.position.set(x,y,z);return m;};
 // The branch uses the existing quay's open railing gap; the original ferry
 // boarding surface at x=27 remains clear. Street navigation ends on land.
 box(11.3,.14,1.28,'#baa477',34,.69,-30.75);box(1.4,.15,4.2,'#b59c6e',39,.56,-32.15);box(5.4,.16,1.30,'#c6ad7e',40.6,.48,-34.15);
 for(let x=28.7;x<39.6;x+=.37)box(.026,.01,1.26,'#947b54',x,.767,-30.75);
 for(let z=-33.7;z<=-30.6;z+=.38)box(1.37,.014,.025,'#91794f',39,.644,z);
 for(let x=38.1;x<43.4;x+=.38)box(.026,.012,1.27,'#927c51',x,.569,-34.15);
 for(const x of[29.5,33,37.2]){beam([x,.6,-31.35],[x,1.49,-31.35],.035,'#687f65');}
 beam([28.4,1.49,-31.35],[38.2,1.49,-31.35],.025,'#ded1a9');
 for(const [x,z]of[[38.5,-33.95],[43,-33.95]]){box(.18,1.72,.18,'#748773',x,.05,z);box(.27,.055,.27,'#c6c5a0',x,.925,z);}
 label('江湾小木船',2.25,.42,35,2.15,-23.32);label('晴天练桨 · 风雨靠岸',2.40,.32,35,1.65,-23.30,'#efdfb8','#5b715c');
 for(const x of[33.90,36.10])box(.07,2.15,.07,'#6f846a',x,1.18,-23.40);
 world.colliders.push({x:33.81,X:34.02,z:-23.51,Z:-23.29,height:2.3,kind:'rowboat-sign'},{x:36.00,X:36.21,z:-23.51,Z:-23.29,height:2.3,kind:'rowboat-sign'});
 const buoy=(x,z,index)=>{
  const material=world.mat(index%2?'#f0dfb5':'#d2a569');const b=new THREE.Mesh(new THREE.SphereGeometry(.17,10,7),material);b.scale.y=.70;b.position.set(x,-.29,z);b.castShadow=false;root.add(b);
 };
 let index=0;for(let x=39;x<=101;x+=7.75)buoy(x,-56.5,index++);for(const x of[38.5,101.5])for(let z=-52;z<=-36;z+=4)buoy(x,z,index++);
 // The invitation board stands outside the wide road and its car footprint.
 box(2.12,1.19,.12,'#bca370',56,1.71,28.6);for(const x of[55.14,56.86])box(.075,2.21,.075,'#6c846d',x,1.22,28.6);
 label('江城顺路赛',1.85,.37,56,1.96,28.52,'#eee0b8','#54715f').rotation.y=Math.PI;
 label('路先让人 · 到站有信',1.87,.30,56,1.48,28.52,'#eee0b8','#6d7f66').rotation.y=Math.PI;
 world.colliders.push({x:54.86,X:57.14,z:28.45,Z:28.75,height:2.40,kind:'neighborhood-race-board'});
 root.traverse(o=>{if(o.isMesh)o.castShadow=false;});return root;
}
