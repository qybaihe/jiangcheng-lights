import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

const UP=new THREE.Vector3(0,1,0);
const geometryCache=new Map();
const RAMP=Object.freeze({minX:-22.8,maxX:-20.1,minZ:5,maxZ:10.64,nearHeight:.60,farHeight:.13});
const bounds=(minX,maxX,minZ,maxZ)=>({minX,maxX,minZ,maxZ});
const point=([x,z])=>({x,z});
export const STREET_COMPOSITION_ROUTES=Object.freeze({
  toolLane:[[-9.5,17],[-9.6,18.25],[-18.6,18.25],[-19.8,17.6],[-21.45,14.7],[-21.45,10.64],[-21.45,5],[-21.45,4],[-18.5,3.3],[-17,2.5]].map(point),
  breakfastLane:[[-17,2.5],[-11.5,3.3],[-8,3.3],[5,3.3],[7.55,4.5],[7.55,9.9],[8.2,12]].map(point),
});

/** Survey data for the hand-drawn map. Passable areas must not become houses. */
export const STREET_COMPOSITION_MAP=Object.freeze([
  {id:'tool-lean-to',kind:'shed',mapLabel:'工具棚',label:'借用工具棚',bounds:bounds(-20,-18,8.2,14.4),passable:false,height:3.10},
  {id:'tool-north-return',kind:'wall',label:'院墙',bounds:bounds(-20,-19.72,5.7,8.2),passable:false,height:2.15},
  {id:'tool-west-wall',kind:'wall',label:'工具巷院墙',bounds:bounds(-23.2,-22.9,6.2,14.2),passable:false,height:2.15},
  {id:'tool-lane',kind:'lane',mapLabel:'西巷',label:'工具巷',bounds:bounds(-22.9,-20,5.7,14.7),passable:true,centerline:[[-21.45,14.7],[-21.45,5.7]].map(point)},
  {id:'courtyard-ramp',kind:'ramp',mapLabel:'缓坡',label:'小院缓坡',bounds:bounds(RAMP.minX,RAMP.maxX,RAMP.minZ,RAMP.maxZ),passable:true,axis:'z',heightStart:RAMP.nearHeight,heightEnd:RAMP.farHeight,slope:'1:12'},
  {id:'courtyard-west-guard',kind:'rail',label:'坡边扶手',bounds:bounds(-22.98,-22.88,5.05,6.32),passable:false,height:1.65},
  {id:'courtyard-east-guard',kind:'rail',label:'坡边扶手',bounds:bounds(-20.02,-19.92,5.05,5.88),passable:false,height:1.65},
  {id:'courtyard-pocket',kind:'pocket',label:'院门前',bounds:bounds(-23,-15,2.5,5),passable:true},
  {id:'breakfast-garden-wall',kind:'wall',label:'过早小巷院墙',bounds:bounds(5.85,6.1,5.5,9.75),passable:false,height:2.05},
  {id:'breakfast-lane',kind:'lane',mapLabel:'侧巷',label:'过早小巷',bounds:bounds(6.1,8.64,5.5,9.75),passable:true,centerline:[[7.55,5.5],[7.55,9.75]].map(point)},
  {id:'breakfast-pocket',kind:'pocket',label:'面铺门前',bounds:bounds(5.8,10.1,10.3,14.8),passable:true},
]);

/** Use before the old heightAt branches. No result outside the actual ramp. */
export function streetHeightAt(x,z){
  if(!Number.isFinite(x)||!Number.isFinite(z)||x<RAMP.minX||x>RAMP.maxX||z<RAMP.minZ||z>RAMP.maxZ)return null;
  const t=(z-RAMP.minZ)/(RAMP.maxZ-RAMP.minZ);
  return RAMP.nearHeight+(RAMP.farHeight-RAMP.nearHeight)*t;
}

function cachedBox(width,height,depth,rounded){
  const key=`box:${width}:${height}:${depth}:${rounded}`;
  if(!geometryCache.has(key)){
    const r=Math.min(.027,width*.13,height*.13,depth*.13);
    geometryCache.set(key,rounded?new RoundedBoxGeometry(width,height,depth,1,r):new THREE.BoxGeometry(width,height,depth));
  }
  return geometryCache.get(key);
}

function rectangle(width,height,x=0,y=0){
  const path=new THREE.Path();path.moveTo(x-width/2,y);path.lineTo(x+width/2,y);path.lineTo(x+width/2,y+height);path.lineTo(x-width/2,y+height);path.closePath();return path;
}

function wallOpening(width,height,holes,depth=.16){
  const shape=new THREE.Shape(rectangle(width,height).getPoints());
  for(const o of holes)shape.holes.push(rectangle(o.w,o.h,o.x,o.y));
  const geometry=new THREE.ExtrudeGeometry(shape,{depth,steps:1,bevelEnabled:true,bevelSize:.015,bevelThickness:.012,bevelSegments:1,curveSegments:1});
  geometry.translate(0,0,-depth);return geometry;
}

function closedTile(width,length){
  const key=`tile:${width}:${length}`;if(geometryCache.has(key))return geometryCache.get(key);
  const n=5,positions=[],uv=[],indices=[];
  for(let end=0;end<2;end++)for(let shell=0;shell<2;shell++)for(let i=0;i<=n;i++){
    const a=i/n*Math.PI;positions.push(Math.cos(a)*width/2,Math.sin(a)*width*.25-shell*.025,(end-.5)*length);uv.push(i/n,end);
  }
  const at=(end,shell,i)=>end*2*(n+1)+shell*(n+1)+i;
  const quad=(a,b,c,d)=>indices.push(a,b,c,a,c,d);
  for(let i=0;i<n;i++){
    quad(at(0,0,i),at(0,0,i+1),at(1,0,i+1),at(1,0,i));
    quad(at(0,1,i+1),at(0,1,i),at(1,1,i),at(1,1,i+1));
    quad(at(0,0,i),at(0,1,i),at(0,1,i+1),at(0,0,i+1));
    quad(at(1,0,i+1),at(1,1,i+1),at(1,1,i),at(1,0,i));
  }
  quad(at(0,0,0),at(1,0,0),at(1,1,0),at(0,1,0));
  quad(at(0,1,n),at(1,1,n),at(1,0,n),at(0,0,n));
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();geometryCache.set(key,geometry);return geometry;
}

function slopedSlab(width,depth,low,high,thickness,axis='x'){
  const geometry=new THREE.BoxGeometry(width,thickness,depth),p=geometry.attributes.position;
  for(let i=0;i<p.count;i++){
    const t=axis==='x'?p.getX(i)/width+.5:p.getZ(i)/depth+.5;
    p.setY(i,low+(high-low)*t+(p.getY(i)>0?0:-thickness));
  }
  geometry.computeVertexNormals();return geometry;
}

/** Two short physical lanes, separated by the original open public street.
 * All additions use original geometry/local lettering. No external media,
 * additional lights, animated NPCs or task/POI changes are introduced here.
 */
export function addStreetComposition(world){
  if(world.streetComposition)return world.streetComposition;
  const root=new THREE.Group();root.name='street-composition';world.static.add(root);
  const startColliders=world.colliders.length,startOccluders=world.cameraOccluders?.length??0;
  const materials={};
  for(const [id,color]of Object.entries({wall:'#e4e3cf',warmWall:'#d6ab93',stone:'#c8bea2',brick:'#b98367',wood:'#51766d',woodLight:'#a9b29a',dark:'#3e5854',floor:'#c1c5b4',paver:'#b3bbac',roof:'#607f7b',roofLight:'#73918a',cream:'#eee8cf',brass:'#b19b61',clay:'#c99b72',paper:'#d7c9a8'}))materials[id]=world.mat(color,{roughness:.89});
  const features=[],structures=[];
  const mesh=(geometry,material,x=0,y=0,z=0,parent=root)=>world.mesh(geometry,material,x,y,z,parent);
  const box=(w,h,d,material,x,y,z,parent=root,rounded=true)=>mesh(cachedBox(w,h,d,rounded&&w>=.09&&h>=.08&&d>=.06),material,x,y,z,parent);
  const rod=(a,b,r,material=materials.dark,parent=root)=>{
    const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),delta=to.clone().sub(from);
    const m=mesh(new THREE.CylinderGeometry(r,r,delta.length(),7),material,...from.add(to).multiplyScalar(.5).toArray(),parent);m.quaternion.setFromUnitVectors(UP,delta.normalize());return m;
  };
  const register=(id,b,y,height,{cameraOnly=false,solid=true}={})=>{
    const obstacle={x:b.minX,X:b.maxX,z:b.minZ,Z:b.maxZ,y,height,kind:`street-${id}`,solid};
    if(cameraOnly)world.cameraOccluders?.push(obstacle);else world.colliders.push(obstacle);
    structures.push({id,bounds:{...b},y,height,cameraOnly,solid});return obstacle;
  };
  const group=(name,x=0,y=0,z=0,rotation=0)=>{const g=new THREE.Group();g.name=name;g.position.set(x,y,z);g.rotation.y=rotation;root.add(g);return g;};
  const lettering=(text,w,h,x,y,z,parent=root,{bg='#51766d',fg='#eee8cf'}={})=>{
    const sign=world.label(text,w,h,bg,fg,parent);sign.position.set(x,y,z);return sign;
  };
  const feature=(id,g)=>{g.updateMatrixWorld(true);const aabb=new THREE.Box3().setFromObject(g);features.push({id,bounds:{minX:aabb.min.x,maxX:aabb.max.x,minY:aabb.min.y,maxY:aabb.max.y,minZ:aabb.min.z,maxZ:aabb.max.z}});};

  // Lower, asymmetrical annex gives the western approach a second roofline.
  const shed=group('借用工具棚'),sx=-19,sz=11.3,sw=2,sd=6.2,wallTop=2.8;
  box(sw,.12,sd,materials.stone,sx,.07,sz,shed);
  box(sw,wallTop-.13,.16,materials.warmWall,sx,(wallTop+.13)/2,8.28,shed);
  box(sw,wallTop-.13,.16,materials.warmWall,sx,(wallTop+.13)/2,14.32,shed);
  // The building itself seals the attached east face; a backing closes the
  // original lower side windows inside the inaccessible storage volume.
  box(.10,2.65,sd-.1,materials.dark,-18.04,1.455,sz,shed);
  const face=new THREE.Group();face.position.set(-20,0,sz);face.rotation.y=-Math.PI/2;shed.add(face);
  const door={x:.78,y:.13,w:1.28,h:2.05},window={x:-1.63,y:1.13,w:1.08,h:.76};
  mesh(wallOpening(sd,wallTop,[door,window]),materials.warmWall,0,0,0,face);
  const trim=(o,border=.07)=>{
    for(const side of[-1,1])box(border,o.h+border*2,.115,materials.stone,o.x+side*(o.w+border)/2,o.y+o.h/2,.018,face);
    for(const yy of[o.y-border/2,o.y+o.h+border/2])box(o.w+border*2,border,.13,materials.stone,o.x,yy,.018,face);
  };
  trim(door,.08);trim(window,.065);
  box(door.w-.08,door.h-.05,.065,materials.wood,door.x,door.y+door.h/2,-.095,face);
  for(let i=0;i<6;i++)box(.155,door.h-.12,.022,materials.woodLight,door.x-.45+i*.18,door.y+door.h/2,-.053,face,false);
  for(const yy of[.48,1.68])box(door.w-.18,.075,.038,materials.wood,door.x,yy,-.015,face,false);
  rod([door.x-.41,.99,.029],[door.x-.41,1.21,.029],.024,materials.brass,face);
  box(window.w-.03,window.h-.02,.045,materials.dark,window.x,window.y+window.h/2,-.28,face);
  box(window.w+.16,.10,.31,materials.stone,window.x,window.y-.025,-.065,face);
  for(const side of[-1,1])box(.05,window.h,.21,materials.wood,window.x+side*(window.w/2-.025),window.y+window.h/2,-.12,face,false);
  // Three solid hand tools, readable through a genuine little lending hatch.
  for(const [i,xx]of[-.31,0,.31].entries()){
    box(.043,.35,.045,materials.woodLight,window.x+xx,1.48,-.19,face,false);
    if(i===1)box(.17,.065,.075,materials.brass,window.x+xx,1.66,-.18,face);
    else {box(.095,.11,.048,materials.stone,window.x+xx,1.69,-.185,face);box(.037,.07,.054,materials.dark,window.x+xx,1.727,-.155,face,false);}
  }
  box(1.90,.34,.13,materials.wood,-1.35,2.34,.017,face);
  lettering('工具借用 · 用完送回',1.72,.23,-1.35,2.34,.09,face);
  for(const end of[8.2,14.4])box(.24,2.79,.23,materials.stone,-19.93,1.395,end===8.2?8.315:14.285,shed);
  for(const end of[-1,1]){
    const shape=new THREE.Shape();shape.moveTo(-1,2.8);shape.lineTo(1,2.8);shape.lineTo(1,3.1);shape.closePath();
    const g=new THREE.ExtrudeGeometry(shape,{depth:.16,bevelEnabled:false});mesh(g,materials.warmWall,-19,0,end<0?8.2:14.24,shed);
  }
  const roofWidth=2.24,roofDepth=6.48,low=2.81,high=3.14,roofCenterX=-19.0;
  mesh(slopedSlab(roofWidth,roofDepth,low,high,.12),materials.dark,roofCenterX,0,sz,shed);
  const columns=24,rows=4,step=roofDepth/columns,length=Math.hypot(roofWidth,high-low)/rows;
  const tile=closedTile(step*1.02,length+.055),normal=new THREE.Vector3(-(high-low)/roofWidth,1,0).normalize(),axis=new THREE.Vector3(-roofWidth,low-high,0).normalize(),orientation=new THREE.Matrix4().makeBasis(new THREE.Vector3(0,0,1),normal,axis);
  for(let col=0;col<columns;col++)for(let row=0;row<rows;row++){
    const f=(row+.5)/rows,m=mesh(tile,(col+row)%5?materials.roof:materials.roofLight,roofCenterX+roofWidth/2-roofWidth*f,high+(low-high)*f+.032,sz-roofDepth/2+(col+.5)*step,shed);m.quaternion.setFromRotationMatrix(orientation);
  }
  box(.13,.15,roofDepth+.04,materials.wood,roofCenterX-roofWidth/2,low-.01,sz,shed);
  for(let zz=8.4;zz<14.4;zz+=.72)box(.27,.11,.065,materials.woodLight,-20.02,2.72,zz,shed,false);
  register('tool-lean-to',bounds(-20.035,-17.95,8.16,14.44),0,3.17);
  register('tool-roof',bounds(-20.18,-17.84,8.02,14.58),2.66,3.26,{cameraOnly:true});
  feature('tool-lean-to',shed);

  function courtyardWall(id,b,height,material=materials.wall){
    const g=group(id),cx=(b.minX+b.maxX)/2,cz=(b.minZ+b.maxZ)/2,w=b.maxX-b.minX,d=b.maxZ-b.minZ;
    box(w,height-.13,d,material,cx,(height+.13)/2,cz,g);
    box(w,.45,d,materials.brick,cx,.355,cz,g);
    box(w,.105,d,materials.stone,cx,.635,cz,g);
    box(w,.11,d+.08,materials.stone,cx,height+.01,cz,g);
    for(const zz of[b.minZ+.14,b.maxZ-.14]){
      box(w,Math.max(.1,height-.11),.25,materials.stone,cx,(height+.11)/2,zz,g);
      box(w,.07,.29,materials.woodLight,cx,height+.10,zz,g);
    }
    // A restrained line of actual brick ends along the base, not noisy paint.
    for(let zz=b.minZ+.39;zz<b.maxZ-.3;zz+=.61)for(const side of[-1,1])box(.012,.10,.27,materials.clay,cx+side*(w/2+.001),.36,zz,g,false);
    const actual=bounds(b.minX-.008,b.maxX+.008,b.minZ-.04,b.maxZ+.04);
    register(id,actual,0,height+.15);feature(id,g);return g;
  }
  courtyardWall('tool-west-wall',bounds(-23.2,-22.9,6.2,14.2),2.15);
  courtyardWall('tool-north-return',bounds(-20,-19.72,5.7,8.2),2.15,materials.warmWall);
  const eastWall=courtyardWall('breakfast-garden-wall',bounds(5.85,6.1,5.5,9.75),2.05);
  // Two wall-side garden boxes sit entirely within the wall's registered
  // footprint: a hint of life without narrowing the walkable lane.
  for(const zz of[6.3,8.9]){
    box(.18,.19,.47,materials.woodLight,5.975,1.10,zz,eastWall);
    box(.16,.022,.41,materials.dark,5.975,1.21,zz,eastWall,false);
    for(let i=0;i<4;i++){
      const stem=mesh(new THREE.ConeGeometry(.054,.16,5),materials.wood,5.965+(i%2)*.024,1.30,zz-.15+i*.10,eastWall);stem.rotation.z=(i%2?1:-1)*.12;
    }
  }

  // The ramp is a closed wedge. Its top uses exactly streetHeightAt's
  // endpoints; landing and the existing .60m courtyard meet without a step.
  const ramp=group('小院缓坡'),rw=RAMP.maxX-RAMP.minX,rd=RAMP.maxZ-RAMP.minZ;
  mesh(slopedSlab(rw,rd,RAMP.nearHeight,RAMP.farHeight,.11,'z'),materials.floor,(RAMP.minX+RAMP.maxX)/2,0,(RAMP.minZ+RAMP.maxZ)/2,ramp);
  // Closed side skirting fills the space below the raised end of the wedge.
  for(const x of[RAMP.minX+.03,RAMP.maxX-.03]){
    const skirt=new THREE.BoxGeometry(.06,1,rd),p=skirt.attributes.position;
    for(let i=0;i<p.count;i++){
      const t=p.getZ(i)/rd+.5,top=RAMP.nearHeight+(RAMP.farHeight-RAMP.nearHeight)*t-.11;
      p.setY(i,p.getY(i)>0?top:.015);
    }
    skirt.computeVertexNormals();mesh(skirt,materials.stone,x,0,(RAMP.minZ+RAMP.maxZ)/2,ramp);
  }
  // Very fine transverse stone joints follow the real slope, not stair risers.
  for(let zz=5.55;zz<10.5;zz+=.83){const y=streetHeightAt(-21.45,zz);const line=box(rw-.04,.004,.024,materials.paver,-21.45,y+.001,zz,ramp,false);line.rotation.x=Math.atan(1/12);}
  feature('courtyard-ramp',ramp);

  // Short guards protect the final elevated side edges where the walls end.
  const guards=group('坡边扶手');
  for(const [id,x,z0,z1]of[['courtyard-west-guard',-22.93,5.05,6.32],['courtyard-east-guard',-19.97,5.05,5.88]]){
    for(const zz of[z0,z1]){const y=streetHeightAt(-21.45,zz);rod([x,.09,zz],[x,y+.88,zz],.031,materials.wood,guards);}
    const y0=streetHeightAt(-21.45,z0),y1=streetHeightAt(-21.45,z1);
    for(const rise of[.45,.88])rod([x,y0+rise,z0],[x,y1+rise,z1],.03,materials.wood,guards);
    register(id,bounds(x-.05,x+.05,z0-.04,z1+.04),0,Math.max(y0,y1)+.93);
  }
  feature('courtyard-guards',guards);

  const gate=group('十二号院门');
  for(const x of[-23.05,-19.86]){
    box(.27,3.98,.27,materials.wood,x,2.12,6.05,gate);
    box(.27,.34,.30,materials.stone,x,.30,6.05,gate);
    register('courtyard-gate-post',bounds(x-.135,x+.135,5.9,6.2),0,4.15);
  }
  box(3.55,.19,.29,materials.wood,-21.455,4.30,6.05,gate);
  box(3.68,.10,.39,materials.stone,-21.455,4.43,6.05,gate);
  register('courtyard-gate-beam',bounds(-23.31,-19.60,5.83,6.27),4.205,4.50,{cameraOnly:true});
  const sign=group('十二号门牌',-19.86,2.33,6.218);
  box(.24,.46,.043,materials.cream,0,0,0,sign);
  lettering('12',.21,.30,0,0,.025,sign,{bg:'#eee8cf',fg:'#51766d'});
  for(const yy of[1.09,1.22,1.36])box(.135,.014,.015,materials.cream,-19.86,yy,6.197,gate,false);
  feature('courtyard-gate',gate);

  function paving(id,vertices,y=.13,material=materials.floor){
    const cx=vertices.reduce((s,p)=>s+p[0],0)/vertices.length,cz=vertices.reduce((s,p)=>s+p[1],0)/vertices.length;
    const shape=new THREE.Shape();vertices.forEach(([x,z],i)=>i?shape.lineTo(x-cx,z-cz):shape.moveTo(x-cx,z-cz));shape.closePath();
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:.055,bevelEnabled:false,curveSegments:1}),m=mesh(geometry,material,cx,y,cz);m.rotation.x=Math.PI/2;m.name=id;return m;
  }
  // Broad, quiet stone ribbons distinguish these routes from the old square
  // tile grid. Paving is traversable and creates no invisible collision wall.
  paving('tool-lane-paving',[[-22.8,10.64],[-20.1,10.64],[-20.1,14.8],[-19.1,17.2],[-18.3,18.0],[-19.3,18.45],[-20.55,17.3],[-22.8,14.9]]);
  paving('courtyard-landing',[[-22.8,5],[-20.1,5],[-17.2,3.7],[-16.4,2.7],[-18.4,2.7],[-20.6,3.65],[-22.8,3.65]],.603);
  paving('breakfast-lane-paving',[[6.38,5.2],[8.58,5.2],[8.58,9.6],[9.18,10.6],[9.73,12.65],[8.15,13.6],[6.35,11.8]],.13);
  // A few large warm inset stones mark the turns, with almost no line noise.
  for(const [x,z,yy]of[[-21.45,13.8,.13],[-21.45,12.4,.13],[-21.45,11.1,.13],[-21.45,4.6,.6],[-19.7,3.85,.6],[7.5,5.95,.13],[7.5,7.35,.13],[7.6,8.75,.13],[8.10,10.85,.13]])box(.62,.004,.42,materials.paver,x,yy+.004,z,root,false);

  root.updateMatrixWorld(true);let meshes=0,triangles=0;const batches=new Set();
  root.traverse(o=>{if(!o.isMesh)return;meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;const p=new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);batches.add(`${o.material.uuid}:${o.castShadow}:${o.receiveShadow}:${Math.floor(p.x/16)},${Math.floor(p.z/16)}`);});
  const aabb=new THREE.Box3().setFromObject(root);
  const summary={name:'工具巷与过早小巷',meshCount:meshes,triangleCount:triangles,materialSpatialBatches:batches.size,addedColliders:world.colliders.length-startColliders,addedCameraOccluders:(world.cameraOccluders?.length??0)-startOccluders,bounds:{minX:aabb.min.x,maxX:aabb.max.x,minY:aabb.min.y,maxY:aabb.max.y,minZ:aabb.min.z,maxZ:aabb.max.z},features,structures,map:STREET_COMPOSITION_MAP,routes:STREET_COMPOSITION_ROUTES,ramp:{...RAMP},geometryAssetsFromReference:0};
  world.streetComposition=summary;return summary;
}
