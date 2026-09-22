import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const UP=new THREE.Vector3(0,1,0);
const DETAILS=Object.freeze({
  granny:['细铜框眼镜','竹柄蒲扇'],chef:['靛青围裙','棉布擦手巾'],dock:['旧海蓝布帽','蓝边搪瓷缸'],
  community:['社区工作牌','木背夹板'],walker0:['针线布包','线轴与小布花'],walker1:['旧式眼镜','装订书报的挎包'],
  walker2:['通勤手袋','黄铜扣'],walker3:['布面书册','书签'],walker4:['随身速写本','铅笔'],
});

function referenced(geometry){
  const count=geometry.index?.count??geometry.attributes.position.count;
  const start=Math.max(0,geometry.drawRange.start),end=Math.min(count,start+geometry.drawRange.count);
  if(geometry.index)return new Set(geometry.index.array.slice(start,end));
  return Array.from({length:end-start},(_,i)=>i+start);
}

/** Rendered vertex positions, not the full shared glTF accessor, define fit. */
export function measureResidentFrame(actor,vrm){
  actor.updateWorldMatrix(true,true);actor.updateMatrixWorld(true);
  const inverse=actor.matrixWorld.clone().invert(),point=new THREE.Vector3();
  const bonePosition=name=>{
    const bone=vrm.humanoid.getNormalizedBoneNode(name)||vrm.humanoid.getRawBoneNode(name);
    return bone?bone.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse):null;
  };
  const height=actor.userData.height||1.7,head=bonePosition('head')||new THREE.Vector3(0,height*.89,0);
  const eyes=['leftEye','rightEye'].map(bonePosition).filter(Boolean);
  const eyeY=eyes.length?eyes.reduce((sum,p)=>sum+p.y,0)/eyes.length:actor.userData.eyeHeight||height*.93;
  const eyeX=eyes.length===2?Math.abs(eyes[0].x-eyes[1].x)/2:.035;
  const hips=bonePosition('hips')||new THREE.Vector3(0,height*.53,0);
  const shoulders=['leftUpperArm','rightUpperArm'].map(bonePosition).filter(Boolean);
  const shoulderY=shoulders.length?shoulders.reduce((sum,p)=>sum+p.y,0)/shoulders.length:height*.77;
  const face=[],torso=[],cloth=[];
  vrm.scene.traverse(mesh=>{
    if(!mesh.isMesh||!mesh.geometry?.attributes.position)return;
    const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    const name=materials.map(m=>m?.name||'').join(' ');
    const facial=/face/i.test(name)&&!/hair/i.test(name);
    mesh.skeleton?.update();
    for(const index of referenced(mesh.geometry)){
      mesh.getVertexPosition(index,point).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
      if(facial&&Math.abs(point.y-eyeY)<.025&&Math.abs(point.x)<.15)face.push(point.clone());
      if(point.y>hips.y+.03&&point.y<shoulderY-.025&&Math.abs(point.x)<.26)torso.push(point.clone());
      if(point.y>hips.y-.08&&point.y<shoulderY+.075&&Math.abs(point.x)<.29&&point.z>-.02)cloth.push(point.clone());
    }
  });
  const maxZ=(points,fallback)=>points.length?Math.max(...points.map(p=>p.z)):fallback;
  // A strap follows the local cloth surface, not the deepest point anywhere
  // on the chest. Using one global Z plane made it hang in front of the neck.
  const frontAt=(x,y)=>{
    let local=-Infinity,nearest=null,distance=Infinity;
    for(const point of cloth){
      const dx=point.x-x,dy=point.y-y,d=dx*dx+dy*dy;
      if(d<distance){distance=d;nearest=point;}
      if(Math.abs(dx)<.018&&Math.abs(dy)<.025)local=Math.max(local,point.z);
    }
    return Number.isFinite(local)?local:nearest?.z??.09;
  };
  return {height,head,eyeY,eyeX:THREE.MathUtils.clamp(eyeX,.026,.05),faceZ:maxZ(face,.09),hips,shoulderY,
    torsoZ:THREE.MathUtils.clamp(maxZ(torso,.12),.07,.23),frontAt,shoulderHalf:shoulders.length===2?Math.abs(shoulders[0].x-shoulders[1].x)/2:.18};
}

function builder(){
  const source=new THREE.Group();
  function part(geometry,color,at=[0,0,0],rotation){
    const mesh=new THREE.Mesh(geometry);mesh.userData.color=color;mesh.position.set(...at);if(rotation)mesh.rotation.set(...rotation);source.add(mesh);return mesh;
  }
  const box=(size,color,at,r=.005)=>part(new RoundedBoxGeometry(...size,1,r),color,at);
  const line=(points,r,color)=>part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),Math.max(6,points.length*3),r,5,false),color);
  const rod=(a,b,r,color)=>{const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b);const mesh=part(new THREE.CylinderGeometry(r,r,from.distanceTo(to),8),color,from.clone().add(to).multiplyScalar(.5).toArray());mesh.quaternion.setFromUnitVectors(UP,to.sub(from).normalize());return mesh;};
  function finish(){
    source.updateMatrixWorld(true);const geometries=[];
    source.traverse(mesh=>{
      if(!mesh.isMesh)return;
      let geometry=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();geometry.applyMatrix4(mesh.matrixWorld);
      const color=new THREE.Color(mesh.userData.color),colors=new Float32Array(geometry.attributes.position.count*3);
      for(let i=0;i<colors.length;i+=3){colors[i]=color.r;colors[i+1]=color.g;colors[i+2]=color.b;}
      geometry.deleteAttribute('uv');geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometries.push(geometry);mesh.geometry.dispose();mesh.material.dispose();
    });
    const merged=mergeGeometries(geometries,false);geometries.forEach(g=>g.dispose());
    const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.82});material.userData.illustration='preserve';
    const mesh=new THREE.Mesh(merged,material);mesh.castShadow=false;mesh.receiveShadow=true;mesh.frustumCulled=false;return mesh;
  }
  return {part,box,line,rod,finish};
}

// Store an actor-aligned coordinate frame underneath the raw animation bone.
// This works for rotated VRM0 assets and scaled/translated resident shells.
function anchor(actor,bone,point,name){
  actor.updateWorldMatrix(true,true);bone.updateWorldMatrix(true,false);
  const root=new THREE.Group();root.name=name;
  const matrix=new THREE.Matrix4().makeTranslation(point.x,point.y,point.z).premultiply(actor.matrixWorld).premultiply(bone.matrixWorld.clone().invert());
  matrix.decompose(root.position,root.quaternion,root.scale);bone.add(root);return root;
}

export function addResidentAccessories({actor,npc,vrm,entry}){
  if(!actor?.isObject3D||!vrm?.humanoid?.getRawBoneNode)throw new TypeError('Resident accessories require a loaded humanoid actor');
  const id=npc?.id||entry?.id,frame=measureResidentFrame(actor,vrm),roots=[],meshes=[];
  const raw=name=>vrm.humanoid.getRawBoneNode(name);
  const localBone=name=>actor.worldToLocal(raw(name).getWorldPosition(new THREE.Vector3()));
  const attach=(boneName,point,name,make)=>{
    const bone=raw(boneName);if(!bone)return;
    const b=builder();make(b);const mesh=b.finish();mesh.name=name;
    const root=anchor(actor,bone,point,name);root.add(mesh);roots.push(root);meshes.push(mesh);return root;
  };
  const trim='#caa568',ink='#344d4a',cream='#eee2c9',paper='#f2e9d3';
  if(id==='granny'||id==='walker1'){
    attach('head',new THREE.Vector3(0,frame.eyeY,frame.faceZ+.005),'resident spectacles',b=>{
      const rx=frame.eyeX*.91,ry=id==='granny'?.026:.020;
      for(const side of[-1,1]){
        const points=Array.from({length:25},(_,i)=>[side*frame.eyeX+Math.cos(i*Math.PI/12)*rx,Math.sin(i*Math.PI/12)*ry,Math.cos(i*Math.PI/12)*side*-.009]);
        b.line(points,.0018,id==='granny'?'#866b4f':'#425459');
        b.line([[side*(frame.eyeX+rx),.003,-.008],[side*.099,.004,-.04],[side*.105,-.007,-.115]],.0017,ink);
      }
      b.line([[-frame.eyeX+rx,.003,0],[0,.01,.005],[frame.eyeX-rx,.003,0]],.0017,trim);
    });
  }
  if(id==='dock'){
    attach('head',new THREE.Vector3(0,frame.height-.08,-.01),'retired dockworker cloth cap',b=>{
      const top=b.part(new THREE.SphereGeometry(1,24,12,0,Math.PI*2,0,Math.PI*.56),'#466372',[0,.002,0]);top.scale.set(.150,.105,.160);
      const brim=b.part(new THREE.SphereGeometry(1,24,8),'#344e5b',[0,-.014,.087]);brim.scale.set(.148,.009,.112);
      b.line([[-.12,-.014,.08],[0,-.014,.146],[.12,-.014,.08]],.002,trim);
    });
  }
  if(id==='chef'){
    const top=frame.shoulderY-.09,bottom=frame.hips.y-.20,front=frame.torsoZ+.014;
    attach('spine',new THREE.Vector3(0,top,front),'Cai kitchen apron',b=>{
      const length=top-bottom,rows=14,cols=12,positions=[],indices=[];
      const width=t=>t<.45?THREE.MathUtils.lerp(.095,.147,t/.45):THREE.MathUtils.lerp(.147,.178,(t-.45)/.55);
      const fold=(u,t)=>.009*Math.sin(u*Math.PI*3)*t*t-.026*u*u;
      for(let row=0;row<=rows;row++)for(let col=0;col<=cols;col++){
        const t=row/rows,u=col/cols*2-1;positions.push(u*width(t),-t*length+.009*u*u*t,fold(u,t));
        if(row<rows&&col<cols){const a=row*(cols+1)+col,c=a+cols+1;indices.push(a,c,a+1,a+1,c,c+1);}
      }
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();b.part(g,'#658d7b');
      for(const side of[-1,1]){
        b.line([[side*.09,.006,-.007],[side*.10,.091,-.034],[side*.09,.108,-.113]],.006,'#aebea8');
        b.line(Array.from({length:8},(_,i)=>{const t=i/7;return [side*(width(t)-.007),-t*length+.009*t,fold(side*.95,t)+.002];}),.0014,cream);
      }
      b.box([.142,.09,.005],'#7b9b88',[0,-length*.60,.013],.006);
      b.line([[-.066,-length*.51,.017],[0,-length*.508,.017],[.066,-length*.51,.017]],.0015,cream);
      b.line(Array.from({length:13},(_,i)=>{const u=i/6-1;return [u*.169,-length+.011+.009*u*u,fold(u,1)+.002];}),.0015,cream);
    });
  }
  const held={granny:'fan',chef:'towel',dock:'cup',community:'clipboard',walker3:'book',walker4:'sketchbook'}[id];
  if(held){
    const side=held==='clipboard'?'rightHand':'leftHand';
    const bone=raw(side);
    const heldRoot=bone?attach(side,localBone(side),`resident held ${held}`,b=>{
      if(held==='fan'){
        b.rod([0,-.03,0],[0,-.17,.016],.008,'#b5965c');
        const leaf=b.part(new THREE.SphereGeometry(1,24,12),'#c5b380',[0,-.255,.017]);leaf.scale.set(.102,.116,.006);
        for(let i=-3;i<=3;i++)b.line([[0,-.165,.024],[i*.018,-.233,.025],[i*.021,-.311+Math.abs(i)*.007,.024]],.0012,'#a48c51');
      }else if(held==='cup'){
        b.part(new THREE.CylinderGeometry(.043,.040,.097,20),cream,[-.06,-.08,.07]);
        const ring=b.part(new THREE.TorusGeometry(.042,.0035,6,24),'#356074',[-.06,-.031,.07]);ring.rotation.x=Math.PI/2;
        b.part(new THREE.CircleGeometry(.038,20),'#514137',[-.06,-.032,.07],[-Math.PI/2,0,0]);
        b.line([[-.023,-.05,.07],[.012,-.058,.07],[.012,-.092,.07],[-.023,-.105,.07]],.005,cream);
      }else if(held==='towel'){
        b.box([.115,.215,.015],cream,[0,-.096,.03],.009);
        for(const y of[-.17,-.157])b.line([[-.055,y,.039],[0,y-.007,.042],[.055,y,.039]],.002,'#52766d');
      }else{
        const sketch=held==='sketchbook',clip=held==='clipboard',size=clip?[.175,.235,.012]:[.153,.20,.021];
        b.box(size,sketch?'#9e744e':clip?'#987954':'#5d7470',[0,-.058,.035]);
        b.box([size[0]-.013,size[1]-.018,.005],paper,[.001,-.06,.045],.001);
        if(clip)b.box([.05,.022,.01],trim,[0,.053,.054],.003);
        else b.box([.014,size[1],.024],sketch?'#405952':'#b6a271',[-size[0]/2+.007,-.058,.034],.002);
        if(sketch){for(let i=0;i<4;i++)b.line([[-.052,-.022-i*.014,.049],[.005,-.008-i*.02,.05],[.042,-.042-i*.009,.049]],.00065,'#8d8973');b.rod([.073,-.13,.052],[.073,.041,.052],.0026,'#b49148');}
        else if(!clip)b.box([.008,.068,.002],'#c59168',[.033,-.18,.037],.001);
      }
    }):null;
    // Present some of the face in the side-on two-person dialogue camera,
    // while retaining the hand anchor and the object's natural downward pose.
    if(heldRoot&&['fan','book','sketchbook'].includes(held))heldRoot.rotateY(.55);
  }
  if(['walker0','walker1','walker2'].includes(id)){
    const colors={walker0:'#987d73',walker1:'#596759',walker2:'#8f654e'};
    attach('hips',new THREE.Vector3(frame.shoulderHalf+.065,frame.hips.y-.02,.015),'resident everyday bag',b=>{
      b.box([.17,.215,.081],colors[id],[0,-.075,0],.024);
      b.box([.15,.075,.023],id==='walker2'?'#ad8060':'#839181',[0,-.02,.05],.014);
      b.box([.025,.036,.01],trim,[0,-.04,.066],.004);
      b.line([[-.07,-.175,.045],[-.075,-.04,.045],[.075,-.04,.045],[.07,-.175,.045]],.0016,cream);
      if(id==='walker0'){
        b.rod([-.04,.025,0],[-.04,.075,0],.014,'#af956f');
        for(let i=0;i<4;i++)b.part(new THREE.TorusGeometry(.015,.002,4,12),'#d7c2a3',[-.04,.035+i*.008,0],[Math.PI/2,0,0]);
      }
    });
    attach('spine',new THREE.Vector3(0,frame.shoulderY,0),'resident bag strap',b=>{
      const points=[[-frame.shoulderHalf*.78,.014,-.055]];
      for(let i=0;i<=14;i++){
        const t=i/14,x=THREE.MathUtils.lerp(-frame.shoulderHalf*.78,frame.shoulderHalf+.04,t);
        const y=THREE.MathUtils.lerp(frame.shoulderY+.012,frame.hips.y+.012,t);
        const z=i===14?.064:frame.frontAt(x,y)+.009;
        points.push([x,y-frame.shoulderY,z]);
      }
      b.line(points,.0065,id==='walker2'?'#6d5543':'#637361');
    });
  }
  if(id==='community'){
    attach('spine',new THREE.Vector3(0,frame.shoulderY-.1,frame.torsoZ+.024),'community staff lanyard',b=>{
      b.line([[-.052,.092,-.036],[-.038,-.015,0],[.002,-.055,.006],[.048,.084,-.038]],.004,'#618676');
      b.box([.051,.065,.005],cream,[.002,-.075,.009],.004);
      b.box([.039,.012,.001],'#52766e',[.002,-.057,.013],.001);
      b.box([.013,.017,.001],'#c3ab83',[-.009,-.078,.013],.001);
    });
  }
  let disposed=false;
  const metrics={details:DETAILS[id]??[],drawCalls:meshes.length,triangles:meshes.reduce((n,m)=>n+m.geometry.attributes.position.count/3,0),fit:{eyeY:frame.eyeY,faceZ:frame.faceZ,torsoZ:frame.torsoZ,height:frame.height}};
  return {meshes,metrics,dispose(){if(disposed)return;disposed=true;for(const root of roots)root.removeFromParent();for(const mesh of meshes){mesh.geometry.dispose();mesh.material.dispose();}}};
}
