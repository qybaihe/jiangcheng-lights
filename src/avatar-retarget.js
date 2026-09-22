import * as THREE from 'three';

const DOWN = new THREE.Vector3(0,-1,0);
const REQUIRED = ['hips','spine','head',...['left','right'].flatMap(side=>['UpperArm','LowerArm','Hand','UpperLeg','LowerLeg','Foot'].map(part=>side+part))];
const RIG_METRICS=['hipHeight','upperLeg','lowerLeg','ankleHeight','soleFront','soleBack','soleHalfWidth','bodyRestY'];
const PLAYER_FIELDS=['characterMesh','characterMeshes','height','eyeHeight','avatarRig','avatarRenderRoot','driverMesh','townLife','ownedMaterials'];
const clamp = THREE.MathUtils.clamp;

function worldQuaternion(node) { return node.getWorldQuaternion(new THREE.Quaternion()); }
function worldPosition(node) { return node.getWorldPosition(new THREE.Vector3()); }
function setWorldQuaternion(node, quaternion) {
  node.parent.updateWorldMatrix(true,false);
  node.quaternion.copy(worldQuaternion(node.parent).invert().multiply(quaternion));
  node.updateWorldMatrix(false,true);
}

// Work from measured bone directions. Neither raw VRM axes nor T-pose Euler
// signs are assumed to match the game's downward-pointing control limbs.
function aim(node, child, direction) {
  node.updateWorldMatrix(true,true);
  const from=worldPosition(child).sub(worldPosition(node)).normalize();
  const delta=new THREE.Quaternion().setFromUnitVectors(from,direction.clone().normalize());
  setWorldQuaternion(node,delta.multiply(worldQuaternion(node)));
}

function visibleVertices(root, visit) {
  // SkinnedMesh updates its inverse bind transform in updateMatrixWorld,
  // not updateWorldMatrix. Omitting it double-applies a newly set scale.
  root.updateWorldMatrix(true,false);root.updateMatrixWorld(true);
  root.traverse(mesh=>{
    if(!mesh.isMesh||!mesh.geometry?.attributes.position)return;
    mesh.skeleton?.update();
    const point=new THREE.Vector3();
    // glTF primitives often share one POSITION accessor. Unreferenced
    // positions are not rendered and can belong to a different skin subset.
    const {index,attributes,drawRange}=mesh.geometry;
    const count=index?.count??attributes.position.count;
    const start=Math.max(0,drawRange.start),end=Math.min(count,start+drawRange.count);
    const visited=new Set();
    for(let slot=start;slot<end;slot++) {
      const i=index?index.getX(slot):slot;
      if(visited.has(i))continue;visited.add(i);
      mesh.getVertexPosition(i,point).applyMatrix4(mesh.matrixWorld);
      if(!Number.isFinite(point.x+point.y+point.z))throw new Error('Avatar contains non-finite skinned vertices');
      visit(point,mesh,i);
    }
  });
}

function boundsOf(root) {
  const box=new THREE.Box3();
  visibleVertices(root,point=>box.expandByPoint(point));
  if(box.isEmpty())throw new Error('Avatar has no renderable geometry');
  return box;
}

function shellQuaternion(node,shell,out=new THREE.Quaternion()) {
  return out.copy(worldQuaternion(shell).invert()).multiply(worldQuaternion(node));
}

/**
 * Install an already-loaded VRM. Keep the gameplay Group and the original
 * control skeleton; replace only its rendering. Call update AFTER town-life.
 * The loader owns textures/materials and final disposal of the VRM asset.
 */
export function installAvatarRig(player,vrm,{targetHeight=1.78}={}) {
  const rig=player?.userData?.rig, humanoid=vrm?.humanoid;
  if(!rig||!vrm?.scene||!humanoid?.getNormalizedBoneNode)throw new Error('Avatar installation requires a player rig and a normalized VRM humanoid');
  if(!Number.isFinite(targetHeight)||targetHeight<1.2||targetHeight>2.2)throw new Error('Avatar height must be between 1.2 and 2.2 metres');
  if(player.userData.avatarRig)throw new Error('An avatar is already installed on this player');
  const nodes={};
  for(const name of REQUIRED) {
    nodes[name]=humanoid.getNormalizedBoneNode(name);
    if(!nodes[name])throw new Error(`Avatar is missing required humanoid bone: ${name}`);
  }
  for(const side of ['left','right'])for(const part of ['Eye','Toes','Shoulder'])nodes[side+part]=humanoid.getNormalizedBoneNode(side+part);

  const original={
    parent:vrm.scene.parent,characterMesh:player.userData.characterMesh,characterMeshes:player.userData.characterMeshes,
    height:player.userData.height,eyeHeight:player.userData.eyeHeight,rigValues:{...rig},
    bones:[],meshes:[],normalizedPose:humanoid.getNormalizedPose?.(),autoUpdate:humanoid.autoUpdateHumanBones,
    expressions:{blink:vrm.expressionManager?.getValue('blink')??0,aa:vrm.expressionManager?.getValue('aa')??0},
  };
  player.traverse(node=>{
    if(node.isBone)original.bones.push({node,position:node.position.clone(),quaternion:node.quaternion.clone(),scale:node.scale.clone()});
    if(node.isMesh)original.meshes.push({node,visible:node.visible});
  });
  const capturePlayer=()=>({
    rigValues:{...rig},
    bones:original.bones.map(({node})=>({node,position:node.position.clone(),quaternion:node.quaternion.clone(),scale:node.scale.clone()})),
    meshes:original.meshes.map(({node})=>({node,visible:node.visible})),
    fields:PLAYER_FIELDS.map(key=>({key,present:Object.hasOwn(player.userData,key),value:player.userData[key]})),
  });
  const restorePlayer=state=>{
    for(const entry of state.bones){entry.node.position.copy(entry.position);entry.node.quaternion.copy(entry.quaternion);entry.node.scale.copy(entry.scale);}
    for(const entry of state.meshes)entry.node.visible=entry.visible;
    Object.assign(rig,state.rigValues);
    for(const {key,present,value} of state.fields){if(present)player.userData[key]=value;else delete player.userData[key];}
    player.updateMatrixWorld(true);
  };
  const baseline=capturePlayer();
  const restoreAsset=()=>{
    vrm.scene.removeFromParent();original.parent?.add(vrm.scene);
    if(original.normalizedPose)humanoid.setNormalizedPose(original.normalizedPose);
    for(const [name,value] of Object.entries(original.expressions))vrm.expressionManager?.setValue(name,value);
    vrm.update(0);vrm.springBoneManager?.reset();humanoid.autoUpdateHumanBones=original.autoUpdate;
  };
  const visualRoot=new THREE.Group();visualRoot.name='阿遥 · VRM visual';
  try {
  visualRoot.add(vrm.scene);
  humanoid.resetNormalizedPose?.();humanoid.autoUpdateHumanBones=true;vrm.update(0);vrm.springBoneManager?.reset();
  visualRoot.updateWorldMatrix(true,true);

  // The loader may already rotate VRM0. Measure the actual toe direction so
  // this step does not rotate an already corrected avatar a second time.
  const forward=new THREE.Vector3();
  for(const side of ['left','right'])if(nodes[side+'Toes'])forward.add(worldPosition(nodes[side+'Toes']).sub(worldPosition(nodes[side+'Foot'])));
  if(Math.hypot(forward.x,forward.z)>.01)visualRoot.rotation.y=-Math.atan2(forward.x,forward.z);
  visualRoot.updateWorldMatrix(true,true);

  for(const side of ['left','right']) {
    const upper=nodes[side+'UpperLeg'],lower=nodes[side+'LowerLeg'],foot=nodes[side+'Foot'];
    const footRest=worldQuaternion(foot);
    aim(upper,lower,DOWN);aim(lower,foot,DOWN);setWorldQuaternion(foot,footRest);
    const arm=nodes[side+'UpperArm'],elbow=nodes[side+'LowerArm'],hand=nodes[side+'Hand'];
    const sign=Math.sign(worldPosition(arm).x)||1;
    aim(arm,elbow,new THREE.Vector3(sign*.13,-1,.018));
    aim(elbow,hand,new THREE.Vector3(sign*.025,-1,.045));
  }
  vrm.update(0);vrm.springBoneManager?.reset();visualRoot.updateWorldMatrix(true,true);

  // VRoid's alpha-cut trousers include invisible construction faces below
  // the shoes. Prefer the authored footwear primitive for floor contact;
  // the full geometric bounding box would make this avatar hover.
  const footwear=new Set();
  visualRoot.traverse(mesh=>{
    if(mesh.isMesh&&(Array.isArray(mesh.material)?mesh.material:[mesh.material]).some(material=>/shoe|boot|footwear|sneaker/i.test(material?.name??'')))footwear.add(mesh);
  });
  let rawFloor=Infinity;
  visibleVertices(visualRoot,(p,mesh)=>{if(!footwear.size||footwear.has(mesh))rawFloor=Math.min(rawFloor,p.y);});
  const rawBox=boundsOf(visualRoot),rawHeight=rawBox.max.y-rawFloor;
  if(rawHeight<.2||rawHeight>20)throw new Error(`Avatar has implausible source height: ${rawHeight}`);
  const scale=targetHeight/rawHeight;
  const ankleCenter=worldPosition(nodes.leftFoot).add(worldPosition(nodes.rightFoot)).multiplyScalar(.5);
  visualRoot.scale.setScalar(scale);
  visualRoot.position.set(-ankleCenter.x*scale,-rawFloor*scale,-ankleCenter.z*scale);
  vrm.update(0);vrm.springBoneManager?.reset();visualRoot.updateWorldMatrix(true,true);

  const points=Object.fromEntries(Object.entries(nodes).filter(([,node])=>node).map(([name,node])=>[name,worldPosition(node)]));
  const sideNames=['left','right'].sort((a,b)=>points[a+'UpperLeg'].x-points[b+'UpperLeg'].x);
  const average=part=>sideNames.reduce((sum,side)=>sum+points[side+part].y,0)/2;
  const upperLeg=sideNames.reduce((sum,side)=>sum+points[side+'UpperLeg'].distanceTo(points[side+'LowerLeg']),0)/2;
  const lowerLeg=sideNames.reduce((sum,side)=>sum+points[side+'LowerLeg'].distanceTo(points[side+'Foot']),0)/2;
  const box=boundsOf(visualRoot),ankleHeight=average('Foot');
  let soleFront=-Infinity,soleBack=Infinity,soleHalfWidth=0;
  visibleVertices(visualRoot,(p,mesh)=>{
    if(footwear.size&&!footwear.has(mesh))return;
    if(p.y>average('Foot')+.008)return;
    const side=sideNames.reduce((best,name)=>Math.abs(p.x-points[name+'Foot'].x)<Math.abs(p.x-points[best+'Foot'].x)?name:best,sideNames[0]);
    const center=points[side+'Foot'];
    soleFront=Math.max(soleFront,p.z-center.z);soleBack=Math.min(soleBack,p.z-center.z);
    soleHalfWidth=Math.max(soleHalfWidth,Math.abs(p.x-center.x));
  });
  if(!Number.isFinite(soleFront+soleBack+soleHalfWidth)||soleFront<=0||soleBack>=0||soleHalfWidth>.25)throw new Error(`Avatar shoes cannot be calibrated to the ground solver: ${JSON.stringify({soleFront,soleBack,soleHalfWidth,feet:sideNames.map(side=>points[side+'Foot']),box})}`);
  const eyePoints=['leftEye','rightEye'].filter(name=>points[name]).map(name=>points[name]);
  const eyeHeight=eyePoints.length?eyePoints.reduce((sum,p)=>sum+p.y,0)/eyePoints.length:points.head.y+.09;
  const metrics={height:box.max.y,eyeHeight,hipHeight:upperLeg+lowerLeg+ankleHeight,upperLeg,lowerLeg,ankleHeight,soleFront,soleBack,soleHalfWidth,bodyRestY:points.spine.y,sideMap:sideNames.slice()};

  // Rebuild the controller's rest dimensions, not the imported skin. This is
  // the same controller/IK contract as the procedural avatar, in real metres.
  for(const entry of original.bones){entry.node.quaternion.identity();entry.node.scale.set(1,1,1);}
  rig.root.position.set(0,0,0);
  player.userData.body.position.set(0,metrics.bodyRestY,0);
  player.userData.head.position.copy(points.head).sub(new THREE.Vector3(0,metrics.bodyRestY,0));
  for(let i=0;i<2;i++) {
    const side=sideNames[i],hip=points[side+'UpperLeg'];
    player.userData.legs[i].position.set(hip.x,metrics.hipHeight,0);
    rig.knees[i].position.set(0,-upperLeg,0);rig.ankles[i].position.set(0,-lowerLeg,0);
    player.userData.arms[i].position.copy(points[side+'UpperArm']).sub(new THREE.Vector3(0,metrics.bodyRestY,0));
    rig.elbows[i].position.copy(points[side+'LowerArm']).sub(points[side+'UpperArm']);
    rig.hands[i].position.copy(points[side+'Hand']).sub(points[side+'LowerArm']);
  }
  for(const key of RIG_METRICS)rig[key]=metrics[key];
  if(rig.backpack)rig.backpackRest=rig.backpack.position.clone();
  delete player.userData.townLife;
  player.updateWorldMatrix(true,true);
  const pairs=[['spine',player.userData.body],['head',player.userData.head]];
  for(let i=0;i<2;i++) {
    const side=sideNames[i];
    pairs.push([side+'UpperArm',player.userData.arms[i]],[side+'LowerArm',rig.elbows[i]],[side+'Hand',rig.hands[i]],
      [side+'UpperLeg',player.userData.legs[i]],[side+'LowerLeg',rig.knees[i]],[side+'Foot',rig.ankles[i]]);
  }
  // Store neutral orientations in the player's coordinate space. Applying
  // world rotation deltas this way includes the T-pose -> arms-down offset.
  const mappings=pairs.map(([name,driver])=>({name,node:nodes[name],driver,
    inverseDriverRest:shellQuaternion(driver,player).invert(),neutral:worldQuaternion(nodes[name])}));
  const hipRest=points.hips.clone();
  const fingers=[];
  for(const side of ['left','right'])for(const finger of ['Index','Middle','Ring','Little','Thumb']) {
    for(const [part,angle] of [['Proximal',.13],['Intermediate',.18],['Distal',.10]]) {
      const node=humanoid.getNormalizedBoneNode(side+finger+part);if(!node)continue;
      const axis=new THREE.Vector3(0,0,side==='left'?-1:1);
      fingers.push({node,rest:node.quaternion.clone(),axis,angle:finger==='Thumb'?angle*.5:angle,finger,part});
    }
  }
  const meshes=[];visualRoot.traverse(mesh=>{if(mesh.isMesh){meshes.push(mesh);mesh.castShadow=false;mesh.receiveShadow=true;mesh.frustumCulled=false;}});
  for(const entry of original.meshes)entry.node.visible=false;
  player.add(visualRoot);
  player.userData.driverMesh=original.characterMesh;
  player.userData.characterMeshes=meshes;
  player.userData.characterMesh=meshes.find(mesh=>mesh.isSkinnedMesh)??meshes[0];
  player.userData.height=metrics.height;player.userData.eyeHeight=metrics.eyeHeight;
  player.userData.avatarRenderRoot=visualRoot;
  const tempQ=new THREE.Quaternion(),targetQ=new THREE.Quaternion(),parentQ=new THREE.Quaternion(),shellQ=new THREE.Quaternion(),hipPoint=new THREE.Vector3();
  let disposed=false,attached=true,detachedState=null;
  const controller={
    meshes,metrics,visualRoot,vrm,
    update(dt=0,time=0,{reduced=false,talking=false,handPose='relaxed'}={}) {
      if(disposed||!attached)return;
      player.updateWorldMatrix(true,true);player.getWorldQuaternion(shellQ);
      hipPoint.copy(hipRest);hipPoint.y+=rig.root.position.y;hipPoint.applyMatrix4(player.matrixWorld);
      nodes.hips.parent.updateWorldMatrix(true,false);nodes.hips.position.copy(nodes.hips.parent.worldToLocal(hipPoint));
      nodes.hips.updateWorldMatrix(false,true);
      for(const mapping of mappings) {
        shellQuaternion(mapping.driver,player,tempQ);
        targetQ.copy(tempQ).multiply(mapping.inverseDriverRest).multiply(mapping.neutral).premultiply(shellQ);
        mapping.node.parent.updateWorldMatrix(true,false);mapping.node.parent.getWorldQuaternion(parentQ).invert();
        mapping.node.quaternion.copy(parentQ.multiply(targetQ));mapping.node.updateWorldMatrix(false,true);
      }
      for(const finger of fingers){
        const curl=(handPose==='bicycle'||handPose==='car'||handPose==='boat')?{Proximal:.72,Intermediate:.85,Distal:.48}:handPose==='reading'?{Proximal:.35,Intermediate:.43,Distal:.24}:null;
        const angle=curl?(finger.finger==='Thumb'?.24:curl[finger.part]):finger.angle;
        finger.node.quaternion.copy(finger.rest).multiply(tempQ.setFromAxisAngle(finger.axis,angle));
      }
      const blink=reduced?0:clamp((1-(rig.eyes[0]?.scale.y??1))/.94,0,1);
      vrm.expressionManager?.setValue('blink',blink);
      vrm.expressionManager?.setValue('aa',talking&&!reduced?.055+.035*(.5+.5*Math.sin(time*11)):0);
      vrm.update(reduced?0:clamp(Number(dt)||0,0,.05));
      if(reduced||dt<=0)vrm.springBoneManager?.reset();
      visualRoot.updateMatrixWorld(true);
    },
    // A replacement is assembled synchronously after its download. Detach
    // preserves this avatar's exact live pose for an immediate rollback.
    detach() {
      if(disposed||!attached)return;
      detachedState=capturePlayer();visualRoot.removeFromParent();restorePlayer(baseline);attached=false;
    },
    restore() {
      if(disposed||attached||!detachedState)return;
      if(player.userData.avatarRig)throw new Error('Cannot restore an avatar over another installed rig');
      restorePlayer(detachedState);player.add(visualRoot);attached=true;detachedState=null;player.updateMatrixWorld(true);
    },
    dispose() {
      if(disposed)return;
      if(attached)controller.detach();
      disposed=true;detachedState=null;visualRoot.removeFromParent();restoreAsset();
    },
  };
  player.userData.avatarRig=controller;controller.update(0,0);
  return controller;
  }catch(error){
    visualRoot.removeFromParent();restorePlayer(baseline);
    try{restoreAsset();}catch{/* Keep the original installation failure. */}
    throw error;
  }
}
