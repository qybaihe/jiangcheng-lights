import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const UP=new THREE.Vector3(0,1,0);
const clamp=THREE.MathUtils.clamp;
const accessoryInstances=new WeakMap();
const alphaPixels=new WeakMap();

function textureAlpha(texture,uv){
  if(!texture?.image||!uv)return 1;
  let pixels=alphaPixels.get(texture);
  if(!pixels){
    const image=texture.image,width=image.width||image.videoWidth,height=image.height||image.videoHeight;
    if(!width||!height)return 1;
    try{
      if(image.data?.length===width*height*4)pixels={width,height,data:image.data};
      else if(typeof document!=='undefined'){
        const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
        const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);pixels={width,height,data:ctx.getImageData(0,0,width,height).data};
      }
    }catch{return 1;}
    if(!pixels)return 1;alphaPixels.set(texture,pixels);
  }
  const t=uv.clone();if(texture.matrixAutoUpdate)texture.updateMatrix();texture.transformUv(t);
  const x=clamp(Math.floor(t.x*pixels.width),0,pixels.width-1),y=clamp(Math.floor(t.y*pixels.height),0,pixels.height-1);
  return pixels.data[(y*pixels.width+x)*4+3]/255;
}

function usedVertexIndices(geometry){
  const attr=geometry.attributes.position,index=geometry.index,draw=geometry.drawRange;
  const start=Math.max(0,draw.start||0),end=Math.min(index?.count??attr.count,start+(draw.count??Infinity));
  return index?[...new Set(Array.from(index.array.slice(start,end)))]:Array.from({length:end-start},(_,i)=>start+i);
}

function canvasWeave(){
  const size=32,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const v=239+((x%4===0)?7:0)+((y%4===1)?4:0)-((x+y)%7===0?3:0),i=(y*size+x)*4;
    data[i]=data[i+1]=data[i+2]=v;data[i+3]=255;
  }
  const map=new THREE.DataTexture(data,size,size);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(5,5);map.magFilter=THREE.LinearFilter;map.minFilter=THREE.LinearMipmapLinearFilter;map.generateMipmaps=true;map.needsUpdate=true;return map;
}

/**
 * Original small canvas satchel, a ferry-ticket pocket and flower embroidery.
 * Call once after the VRM is loaded; call update AFTER vrm.update() each frame.
 * The returned root is already parented to the raw hips bone. All bag parts and
 * the CPU-deformed ribbon live under it, so disposal/visibility can use root.
 * Body proportions and strap depth are measured from this avatar, not a model
 * name. Normalized bones supply the reference; actual motion follows raw bones.
 */
export function addAvatarAccessories(vrm,{height=1.78}={}){
  if(!vrm?.scene||!vrm.humanoid?.getRawBoneNode)throw new TypeError('addAvatarAccessories requires a loaded VRM humanoid.');
  if(accessoryInstances.has(vrm))return accessoryInstances.get(vrm);
  const raw=name=>vrm.humanoid.getRawBoneNode(name);
  const reference=name=>vrm.humanoid.getNormalizedBoneNode?.(name)||raw(name);
  const hips=raw('hips'),chest=raw('chest')||raw('spine')||hips,upper=raw('upperChest')||chest,spine=raw('spine')||hips;
  if(!hips)throw new Error('Avatar accessories need the raw hips bone.');
  // updateMatrixWorld also refreshes SkinnedMesh.bindMatrixInverse after the
  // installer applies its visual-root scale; updateWorldMatrix alone does not.
  vrm.scene.updateWorldMatrix(true,false);vrm.scene.updateMatrixWorld(true);
  const position=(bone,fallback)=>bone?bone.getWorldPosition(new THREE.Vector3()):fallback.clone();
  const hipWorld=position(hips,new THREE.Vector3());
  const neckWorld=position(reference('neck'),hipWorld.clone().add(new THREE.Vector3(0,.43,0)));
  const leftWorld=position(reference('leftUpperArm'),neckWorld.clone().add(new THREE.Vector3(.16,-.055,0)));
  const rightWorld=position(reference('rightUpperArm'),neckWorld.clone().add(new THREE.Vector3(-.16,-.055,0)));
  const left=leftWorld.clone().sub(rightWorld).normalize(),up=neckWorld.clone().sub(hipWorld).normalize();
  const forward=left.clone().cross(up).normalize();up.copy(forward).cross(left).normalize();
  const frameQ=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(left,up,forward));
  const bounds=new THREE.Box3(),boundPoint=new THREE.Vector3();let shoeFloor=Infinity;
  vrm.scene.traverse(mesh=>{
    if(!mesh.isMesh||!mesh.geometry?.attributes.position)return;
    if(mesh.isSkinnedMesh)mesh.skeleton?.update();
    const footwear=(Array.isArray(mesh.material)?mesh.material:[mesh.material]).some(m=>/shoe|boot|footwear|sneaker/i.test(m.name));
    for(const i of usedVertexIndices(mesh.geometry)){mesh.getVertexPosition(i,boundPoint);bounds.expandByPoint(boundPoint.applyMatrix4(mesh.matrixWorld));if(footwear)shoeFloor=Math.min(shoeFloor,boundPoint.y);}
  });
  const avatarHeight=bounds.max.y-(Number.isFinite(shoeFloor)?shoeFloor:bounds.min.y);
  const targetHeight=Number.isFinite(height)&&height>.5?height:1.78;
  const physicalUnit=Number.isFinite(avatarHeight)&&avatarHeight>.5?avatarHeight/targetHeight:1;
  const root=new THREE.Group();root.name='阿遥 · 斜挎帆布小包与轮渡旧票';hips.add(root);
  root.quaternion.copy(hips.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(frameQ);
  root.updateWorldMatrix(true,true);
  const rootScale=root.getWorldScale(new THREE.Vector3());
  const unit=physicalUnit/Math.max(.00001,(Math.abs(rootScale.x)+Math.abs(rootScale.y)+Math.abs(rootScale.z))/3);
  const local=p=>root.worldToLocal(p.clone());
  const neck=local(neckWorld),leftArm=local(leftWorld),rightArm=local(rightWorld);
  const torso=Math.max(.30*unit,neck.y),shoulderSpan=leftArm.distanceTo(rightArm);
  const shoulderX=clamp(leftArm.x*.83,.095*unit,.18*unit),shoulderY=Math.min(neck.y,leftArm.y+.032*unit);

  const ramp=new THREE.DataTexture(new Uint8Array([115,168,218,255]),4,1,THREE.RedFormat);ramp.minFilter=ramp.magFilter=THREE.NearestFilter;ramp.generateMipmaps=false;ramp.needsUpdate=true;
  const weave=canvasWeave(),materials={};
  for(const [name,color]of Object.entries({canvas:'#bba584',canvasLight:'#d0bea0',leather:'#775a3e',edge:'#65533d',thread:'#e0d4b9',copper:'#b8975b',flower:'#b85a4c',river:'#496b5c',paper:'#ded8bb'})){
    materials[name]=new THREE.MeshToonMaterial({color,gradientMap:ramp,...(name==='canvas'||name==='canvasLight'?{map:weave}:{})});
    materials[name].name=`阿遥配件 · ${name}`;materials[name].userData.illustration='preserve';
  }
  const bag=new THREE.Group();bag.name='侧髋帆布小包';root.add(bag);bag.scale.setScalar(unit);
  const hipWidth=Math.max(shoulderSpan*.35,.125*unit);
  bag.position.set(-hipWidth-.042*unit,-.135*unit,-.018*unit);bag.rotation.set(.035,-Math.PI/2-.12,-.065);
  const restBagRotation=bag.rotation.clone();
  const add=(geometry,mat,at=[0,0,0],rotation)=>{const mesh=new THREE.Mesh(geometry,materials[mat]);mesh.position.set(...at);if(rotation)mesh.rotation.set(...rotation);mesh.castShadow=false;mesh.receiveShadow=true;bag.add(mesh);return mesh;};
  const box=(size,mat,at,r=.012)=>add(new RoundedBoxGeometry(...size,3,Math.min(r,...size.map(x=>x*.44))),mat,at);
  const rod=(a,b,r,mat)=>{const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),m=add(new THREE.CylinderGeometry(r,r,va.distanceTo(vb),5),mat,va.clone().add(vb).multiplyScalar(.5).toArray());m.quaternion.setFromUnitVectors(UP,vb.sub(va).normalize());return m;};
  const tube=(points,r,mat,segments=18)=>add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),segments,r,5,false),mat);
  const stitch=(a,b,step=.011)=>{
    const p=new THREE.Vector3(...a),d=new THREE.Vector3(...b).sub(p),n=Math.max(1,Math.floor(d.length()/step));
    for(let i=0;i<n;i++){const from=p.clone().addScaledVector(d,(i+.12)/n),to=p.clone().addScaledVector(d,(i+.55)/n);rod(from.toArray(),to.toArray(),.00072,'thread');}
  };
  // Soft sides and a lightly swollen cloth face; no hard toy-box silhouette.
  const body=new RoundedBoxGeometry(.24,.26,.086,4,.028),bp=body.attributes.position;
  for(let i=0;i<bp.count;i++){const x=bp.getX(i),y=bp.getY(i),z=bp.getZ(i);bp.setZ(i,z+Math.sign(z)*.0035*Math.cos(x/.13*Math.PI/2)*Math.cos(y/.14*Math.PI/2));}
  body.computeVertexNormals();add(body,'canvas');
  box([.214,.024,.078],'leather',[0,-.117,.002],.009);
  box([.211,.085,.021],'canvasLight',[0,.079,.047],.018);
  box([.205,.058,.007],'canvas',[0,-.054,.050],.010);
  // Folded ferry ticket peeking from the pocket: paper, blue-green bands and
  // a clipped corner, no tiny generated lettering or tourist-logo billboard.
  box([.037,.052,.0025],'paper',[-.062,-.017,.049],.003);
  for(const y of[-.019,-.031])rod([-.078,y,.051],[-.047,y+.003,.051],.0009,'river');
  box([.036,.093,.010],'leather',[.018,.046,.063],.006);
  const buckle=add(new THREE.TorusGeometry(.0118,.0021,5,16),'copper',[.018,.046,.070]);buckle.scale.set(.78,1.12,.75);
  rod([.009,.047,.071],[.027,.047,.071],.0012,'copper');
  box([.029,.009,.002],'edge',[.018,.014,.070],.001);
  // Turned edge piping and sparse real stitch dashes sit on the curved face.
  tube([[-.098,.107,.044],[-.112,.065,.046],[-.112,-.081,.046],[-.095,-.110,.047],[.096,-.110,.047],[.112,-.079,.046],[.112,.076,.044]],.00125,'edge',30);
  stitch([-.096,-.097,.049],[.096,-.097,.049]);
  stitch([-.102,-.080,.049],[-.102,.052,.049]);stitch([.102,-.080,.049],[.102,.052,.049]);
  stitch([-.091,.046,.060],[.091,.046,.060]);
  stitch([-.087,-.074,.055],[.087,-.074,.055]);
  // A restrained five-petal embroidered flower and two river ripples.
  for(let i=0;i<5;i++){
    const a=i*Math.PI*2/5,petal=add(new THREE.SphereGeometry(1,8,6),'flower',[.060+Math.sin(a)*.012,-.014+Math.cos(a)*.012,.0565]);
    petal.scale.set(.0078,.012,.0014);petal.rotation.z=-a;
  }
  const centre=add(new THREE.SphereGeometry(.006,8,5),'copper',[.060,-.014,.058]);centre.scale.z=.28;
  for(const yy of[-.052,-.061])tube([[-.048,yy,.057],[-.038,yy+.002,.057],[-.028,yy-.002,.057],[-.018,yy,.057]],.00085,'river',8);
  // Two small brass loops receive the continuous shoulder strap.
  for(const x of[-.108,.108]){
    box([.023,.042,.023],'leather',[x,.107,0],.008);
    const ring=add(new THREE.TorusGeometry(.011,.0017,5,12),'copper',[x,.129,0]);ring.rotation.y=Math.PI/2;
  }
  // A tiny repair-shop key gives the satchel an everyday Jiangcheng history.
  add(new THREE.TorusGeometry(.0056,.0012,5,10),'copper',[-.111,.082,.035]);
  rod([-.111,.075,.035],[-.111,.045,.037],.0016,'copper');rod([-.111,.047,.037],[-.101,.047,.037],.0014,'copper');rod([-.106,.047,.037],[-.106,.052,.037],.0011,'copper');

  // Fit the strap against actual body/cloth vertices once, excluding long hair.
  // Subsequent animation binds those offsets to the raw skeleton.
  root.updateWorldMatrix(true,true);const bodySamples=[],bodyMeshes=[],topMeshes=[],temp=new THREE.Vector3();
  vrm.scene.traverse(mesh=>{
    if(!mesh.isMesh||mesh===root||mesh.isDescendantOf?.(root))return;
    let parent=mesh.parent;while(parent){if(parent===root)return;parent=parent.parent;}
    const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    const label=mesh.name+' '+mats.map(m=>m.name).join(' ');if(/hair|face|eye|eyeline|brow/i.test(label))return;
    if(/bottom|shoe|boot|footwear/i.test(label))return;
    const attr=mesh.geometry?.attributes.position;if(!attr)return;
    if(mesh.isSkinnedMesh)mesh.skeleton?.update();
    bodyMeshes.push(mesh);if(/tops?|shirt|cardigan|jacket/i.test(label))topMeshes.push(mesh);
    // glTF primitives can share the complete avatar POSITION accessor. Only
    // indices drawn by this clothing primitive describe its cloth surface.
    const used=usedVertexIndices(mesh.geometry);
    const step=Math.max(1,Math.floor(used.length/6500));
    for(let n=0;n<used.length;n+=step){mesh.getVertexPosition(used[n],temp);temp.applyMatrix4(mesh.matrixWorld);root.worldToLocal(temp);if(temp.y>-.045*unit&&temp.y<shoulderY+.055*unit&&Math.abs(temp.x)<shoulderSpan*.54)bodySamples.push(temp.clone());}
  });
  const rayMeshes=topMeshes.length?topMeshes:bodyMeshes,raycaster=new THREE.Raycaster(),rayOrigin=new THREE.Vector3(),rayDirection=new THREE.Vector3();let surfaceRayHits=0;
  function raySurface(x,y,front){
    rayOrigin.set(x,y,(front?.6:-.6)*unit);root.localToWorld(rayOrigin);
    rayDirection.set(0,0,front?-1:1).transformDirection(root.matrixWorld);raycaster.set(rayOrigin,rayDirection);raycaster.near=0;raycaster.far=1.4*physicalUnit;
    const hits=raycaster.intersectObjects(rayMeshes,false);
    for(const hit of hits){
      const mat=Array.isArray(hit.object.material)?hit.object.material[hit.face.materialIndex]:hit.object.material;
      if(mat.alphaTest>0&&textureAlpha(mat.map,hit.uv)*(mat.opacity??1)<mat.alphaTest)continue;
      surfaceRayHits++;return root.worldToLocal(hit.point.clone()).z;
    }
    return null;
  }
  const clothZ=(x,y,front)=>{
    // Project onto triangle interiors, including sparse cardigan panels; near
    // vertices alone cannot describe the middle of a large cloth triangle.
    let surface=raySurface(x,y,front);
    for(const offset of[-.014,.014]){const edge=raySurface(x+offset*unit,y,front);if(edge!==null)surface=surface===null?edge:front?Math.max(surface,edge):Math.min(surface,edge);}
    if(surface!==null)return surface+(front?.009:-.009)*unit;
    let found=0,z=front?.067*unit:-.058*unit;
    for(const p of bodySamples)if(Math.abs(p.x-x)<.037*unit&&Math.abs(p.y-y)<.034*unit){z=found?(front?Math.max(z,p.z):Math.min(z,p.z)):p.z;found++;}
    return z+(front?.007:-.007)*unit;
  };
  const anchors=[];
  const addAnchor=(bone,p,normal)=>{
    const world=root.localToWorld(new THREE.Vector3(...p)),worldNormal=new THREE.Vector3(...normal).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()));
    anchors.push({bone,local:bone.worldToLocal(world),normal:worldNormal.applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()).invert())});
  };
  bag.updateWorldMatrix(true,true);
  const bagAnchor=(x,front)=>{const p=root.worldToLocal(bag.localToWorld(new THREE.Vector3(x,.135,0)));addAnchor(bag,p.toArray(),[0,0,front?1:-1]);};
  const frontPoint=(bone,x,y)=>addAnchor(bone,[x,y,clothZ(x,y,true)],[0,0,1]);
  const backPoint=(bone,x,y)=>addAnchor(bone,[x,y,clothZ(x,y,false)],[0,0,-1]);
  bagAnchor(.108,true);
  frontPoint(hips,-hipWidth*.82,.030*unit);
  frontPoint(spine,-hipWidth*.40,torso*.31);
  frontPoint(chest,shoulderX*.12,torso*.56);
  frontPoint(upper,shoulderX*.72,shoulderY-.063*unit);
  frontPoint(upper,shoulderX,shoulderY-.017*unit);
  addAnchor(upper,[shoulderX,shoulderY+.015*unit,(clothZ(shoulderX,shoulderY,true)+clothZ(shoulderX,shoulderY,false))*.5],[0,1,0]);
  backPoint(upper,shoulderX,shoulderY-.017*unit);
  backPoint(upper,shoulderX*.72,shoulderY-.066*unit);
  backPoint(chest,shoulderX*.08,torso*.55);
  backPoint(spine,-hipWidth*.44,torso*.29);
  backPoint(hips,-hipWidth*.84,.025*unit);
  bagAnchor(-.108,false);

  const segments=64,curve=new THREE.CatmullRomCurve3(anchors.map(()=>new THREE.Vector3()),false,'centripetal');
  const normalCurve=new THREE.CatmullRomCurve3(anchors.map(()=>new THREE.Vector3()),false,'centripetal');
  const geometry=new THREE.BufferGeometry(),strapPositions=new Float32Array((segments+1)*4*3),strapUVs=[],strapIndex=[];
  for(let row=0;row<=segments;row++){for(let k=0;k<4;k++)strapUVs.push(k%2,row/segments*8);if(row<segments)for(let side=0;side<4;side++){const a=row*4+side,b=row*4+(side+1)%4,c=a+4,d=b+4;strapIndex.push(a,c,b,b,c,d);}}
  strapIndex.push(0,2,1,0,3,2,segments*4,segments*4+1,segments*4+2,segments*4,segments*4+2,segments*4+3);
  geometry.setAttribute('position',new THREE.BufferAttribute(strapPositions,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(strapUVs,2));geometry.setIndex(strapIndex);
  const strap=new THREE.Mesh(geometry,materials.leather);strap.name='贴身胸背斜挎肩带';strap.castShadow=false;strap.receiveShadow=true;strap.frustumCulled=false;root.add(strap);
  const seamGeometry=new THREE.BufferGeometry(),seamPositions=new Float32Array((segments+1)*4*3),seamIndex=[];
  for(let row=0;row<segments;row++)if(row%3!==2)for(const side of[0,2]){const a=row*4+side;seamIndex.push(a,a+4,a+1,a+1,a+4,a+5);}
  seamGeometry.setAttribute('position',new THREE.BufferAttribute(seamPositions,3).setUsage(THREE.DynamicDrawUsage));seamGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(strapUVs,2));seamGeometry.setIndex(seamIndex);
  const seam=new THREE.Mesh(seamGeometry,materials.thread);seam.name='肩带双行细缝线';seam.castShadow=false;seam.receiveShadow=true;seam.frustumCulled=false;root.add(seam);

  // Merge the small immutable bag details by material, keeping the strap as two
  // tiny dynamic meshes. No accessory asks the cached sun shadow to redraw.
  const buckets=new Map();for(const m of [...bag.children])if(m.isMesh){m.updateMatrix();const g=m.geometry.clone().applyMatrix4(m.matrix),list=buckets.get(m.material)||[];list.push(g.index?g.toNonIndexed():g);buckets.set(m.material,list);bag.remove(m);m.geometry.dispose();}
  for(const [mat,geoms]of buckets){const g=mergeGeometries(geoms,false);geoms.forEach(v=>v.dispose());const mesh=new THREE.Mesh(g,mat);mesh.name=mat.name;mesh.castShadow=false;mesh.receiveShadow=true;bag.add(mesh);}
  const meshes=[];root.traverse(o=>{if(o.isMesh)meshes.push(o);});
  const rootInverse=new THREE.Matrix4(),rootQInverse=new THREE.Quaternion(),q=new THREE.Quaternion(),p=new THREE.Vector3(),vertex=new THREE.Vector3(),tangent=new THREE.Vector3(),normal=new THREE.Vector3(),width=new THREE.Vector3();
  let clock=0,sway=0;const clearanceProfile=new Float32Array(segments+1);let fitProfile=true;
  function update(dt=0,time,{moving=false,reduced=false}={}){
    const delta=Number.isFinite(dt)?clamp(dt,0,.1):0;clock=Number.isFinite(time)?time:clock+delta;
    const target=moving&&!reduced?1:0;sway=reduced?0:THREE.MathUtils.lerp(sway,target,1-Math.exp(-delta*12));
    bag.rotation.set(restBagRotation.x+Math.sin(clock*7.5)*.025*sway,restBagRotation.y+Math.sin(clock*3.75)*.018*sway,restBagRotation.z+Math.sin(clock*7.5+.6)*.033*sway);
    root.updateWorldMatrix(true,true);rootInverse.copy(root.matrixWorld).invert();root.getWorldQuaternion(rootQInverse).invert();
    for(let i=0;i<anchors.length;i++){
      const a=anchors[i];a.bone.updateWorldMatrix(true,false);curve.points[i].copy(a.local).applyMatrix4(a.bone.matrixWorld).applyMatrix4(rootInverse);
      normalCurve.points[i].copy(a.normal).applyQuaternion(a.bone.getWorldQuaternion(q)).applyQuaternion(rootQInverse).normalize();
    }
    for(let row=0;row<=segments;row++){
      const t=row/segments;curve.getPoint(t,p);curve.getTangent(t,tangent).normalize();normalCurve.getPoint(t,normal).normalize();width.crossVectors(normal,tangent);
      if(width.lengthSq()<1e-8)width.set(1,0,0).cross(tangent);if(width.lengthSq()<1e-8)width.set(0,0,1);width.normalize();normal.crossVectors(tangent,width).normalize();
      if(fitProfile&&row>2&&row<segments-2&&Math.abs(normal.z)>.58){
        const front=normal.z>0,surface=clothZ(p.x,p.y,front),separation=(surface-p.z)/normal.z;
        clearanceProfile[row]=clamp(separation,0,.08*unit);
      }
      p.addScaledVector(normal,clearanceProfile[row]);
      const half=.0155*unit,thickness=.0015*unit;
      for(let k=0;k<4;k++){
        const side=k===0||k===3?-1:1,depth=k<2?1:-1,at=(row*4+k)*3;
        vertex.copy(p).addScaledVector(width,half*side).addScaledVector(normal,thickness*depth).toArray(strapPositions,at);
        const seamSide=k<2?-1:1,seamEdge=k%2?1:-1;
        vertex.copy(p).addScaledVector(width,seamSide*.0115*unit+seamEdge*.00048*unit).addScaledVector(normal,.0019*unit).toArray(seamPositions,at);
      }
    }
    fitProfile=false;geometry.attributes.position.needsUpdate=true;seamGeometry.attributes.position.needsUpdate=true;geometry.computeVertexNormals();seamGeometry.computeVertexNormals();
  }
  root.userData.avatarAccessory={bagDimensions:[.24,.26,.086],unit,bodySamples:bodySamples.length,attachment:'raw hips; ribbon anchors on raw hips/spine/chest/upperChest',details:['帆布细纹','弧面翻盖','双行缝线','铜扣','五瓣小红花','旧轮渡票与江水纹','修理铺小钥匙']};
  const api={root,update,meshes};accessoryInstances.set(vrm,api);update(0,0,{reduced:true});Object.assign(root.userData.avatarAccessory,{surfaceRayHits,clothPrimitiveCount:rayMeshes.length,fit:'indexed skinned Tops triangles with alpha-test filtering'});return api;
}
