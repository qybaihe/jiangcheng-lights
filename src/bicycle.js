import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const UP = new THREE.Vector3(0, 1, 0);

/** A hand-built Wuhan commuter bicycle. Wheel axes face X; front faces +Z.
 * Uses only shared world materials and static geometry, ready for World.optimize.
 * The group origin is at ground level, halfway between its two wheel axles.
 */
export function buildStreetBicycle(world, { x = -21, z = 20, rotation = 0, dynamic = false, scale = 1 } = {}) {
  const bike = new THREE.Group(); bike.name = '晴川里 · 老式通勤自行车';
  bike.position.set(x, world.heightAt?.(x, z) ?? .13, z); bike.rotation.y = rotation;
  (dynamic ? world.scene : world.static).add(bike);
  const wheels=[],pedals=[];
  const pivotFor=(objects,position)=>{const pivot=new THREE.Group();pivot.position.set(...position);bike.add(pivot);bike.updateWorldMatrix(true,true);for(const object of objects)pivot.attach(object);return pivot;};
  const paint = world.mat('#668d7d', { roughness:.73 });
  const edge = world.mat('#45695e', { roughness:.79 });
  const steel = world.mat('#a8b6aa', { roughness:.51, metalness:.38 });
  const dark = world.mat('#354640', { roughness:.88 });
  const rubber = world.mat('#3d4743', { roughness:.97 });
  const leather = world.mat('#755c45', { roughness:.85 });
  const bamboo = world.mat('#b79d65', { roughness:.9 });
  const bambooLight = world.mat('#d3bd82', { roughness:.87 });
  const fenderPaint = world.mat('#82a091', { roughness:.67, side:THREE.DoubleSide });

  const mesh = (geometry, material, position = [0,0,0], orientation) => {
    const object = new THREE.Mesh(geometry, material); object.position.set(...position);
    if (orientation) object.rotation.set(...orientation);
    object.castShadow = !dynamic; object.receiveShadow = true; bike.add(object); return object;
  };
  const box = (size, material, position) => mesh(new THREE.BoxGeometry(...size), material, position);
  const rod = (from, to, radius, material, segments = 6) => {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), delta = b.clone().sub(a);
    const object = mesh(new THREE.CylinderGeometry(radius,radius,delta.length(),segments,1,true), material, a.add(b).multiplyScalar(.5).toArray());
    object.quaternion.setFromUnitVectors(UP, delta.normalize()); return object;
  };
  const curve = (points, radius, material, segments = 14, sides = 5, closed = false) => {
    const path = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), closed);
    return mesh(new THREE.TubeGeometry(path, segments, radius, sides, closed), material);
  };
  const axle = (y, zz, halfWidth, radius, material) => rod([-halfWidth,y,zz],[halfWidth,y,zz],radius,material,8);
  const ring = (radius, tube, material, position, tubularSegments = 32, radialSegments = 5) =>
    mesh(new THREE.TorusGeometry(radius,tube,radialSegments,tubularSegments),material,position,[0,Math.PI/2,0]);

  function fender(zz) {
    const positions=[],uvs=[],indices=[],segments=20;
    for(let i=0;i<=segments;i++) {
      const t=i/segments,angle=-.20+t*(Math.PI+.40);
      for(let j=0;j<3;j++) {
        const radius=j===1?.592:.576;
        positions.push((j-1)*.062,.55+Math.sin(angle)*radius,zz+Math.cos(angle)*radius);
        uvs.push(j/2,t);
        if(i<segments&&j<2){const n=i*3+j;indices.push(n,n+3,n+1,n+1,n+3,n+4);}
      }
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();
    mesh(geometry,fenderPaint);
    for(const side of[-1,1])rod([side*.068,.55,zz],[side*.063,.83,zz-.48],.007,steel,4);
  }

  // Narrow tyres, separate polished rims, hubs, valves and crossed spokes.
  for(const zz of[-1,1]) {
    const first=bike.children.length;
    ring(.501,.049,rubber,[0,.55,zz],36,6);
    ring(.452,.016,steel,[0,.55,zz],32,4);
    axle(.55,zz,.103,.022,steel);
    for(let i=0;i<24;i++) {
      const a=i*Math.PI/12,hubAngle=a+(i%2?-.42:.42);
      rod([(i%2?1:-1)*.038,.55+Math.sin(hubAngle)*.027,zz+Math.cos(hubAngle)*.027],
        [0,.55+Math.sin(a)*.453,zz+Math.cos(a)*.453],.0034,steel,4);
    }
    rod([0,.55-.425,zz],[0,.55-.457,zz],.008,dark,5);
    const wheel=pivotFor(bike.children.slice(first),[0,.55,zz]);wheel.name=zz>0?'front wheel':'rear wheel';wheels.push(wheel);
    fender(zz);
  }

  const crankPoint=[0,.43,-.08], seat=[0,1.22,-.37], headTop=[0,1.28,.58], headLow=[0,1.03,.66];
  rod(seat,headTop,.032,paint,8); rod(headLow,crankPoint,.036,paint,8);
  rod(crankPoint,seat,.034,paint,8); rod(headLow,headTop,.043,edge,8);
  for(const side of[-1,1]) {
    rod([side*.093,.55,-1],[side*.055,1.22,-.37],.019,paint,6);
    rod([side*.09,.55,-1],[side*.095,.43,-.08],.024,paint,6);
    curve([[side*.068,1.065,.65],[side*.081,.90,.71],[side*.087,.66,.90],[side*.087,.55,1]],.023,paint,10,5);
    // A small axle nut and a front brake shoe flank each wheel.
    box([.018,.043,.043],steel,[side*.113,.55,1]);
    box([.018,.051,.065],rubber,[side*.065,1.002,.94]);
  }
  axle(1.067,.705,.083,.018,steel);
  rod([-.065,1.068,.705],[.065,1.068,.705],.012,dark,5);
  rod([0,1.22,-.37],[0,1.416,-.417],.022,steel,7);
  // Curved, tapered saddle with a nose facing the handlebars.
  const saddleShape=new THREE.Shape();
  saddleShape.moveTo(-.145,-.15);saddleShape.quadraticCurveTo(-.19,-.01,-.092,.09);
  saddleShape.quadraticCurveTo(-.048,.16,-.04,.22);saddleShape.lineTo(.04,.22);
  saddleShape.quadraticCurveTo(.048,.16,.092,.09);saddleShape.quadraticCurveTo(.19,-.01,.145,-.15);saddleShape.closePath();
  const saddle=mesh(new THREE.ExtrudeGeometry(saddleShape,{depth:.045,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.009,bevelThickness:.008,curveSegments:5}),leather,[0,1.438,-.405],[-Math.PI/2,0,0]);
  // Shape Y maps to -Z under this rotation, so reverse to point its narrow nose forward.
  saddle.rotation.z=Math.PI;
  rod([-.10,1.38,-.49],[.10,1.38,-.49],.018,dark,6);
  for(const side of[-1,1])rod([side*.082,1.389,-.51],[side*.082,1.427,-.51],.022,steel,5);

  // Upright city bars, swept grips, brake levers, cables, bell and front lamp.
  rod(headTop,dynamic?[0,1.69,.34]:[0,1.49,.52],.023,steel,7);
  const barFirst=bike.children.length;
  curve([[-.34,1.49,.39],[-.26,1.50,.55],[0,1.505,.56],[.26,1.50,.55],[.34,1.49,.39]],.018,steel,18,6);
  for(const side of[-1,1]) {
    rod([side*.287,1.497,.475],[side*.348,1.486,.365],.026,leather,7);
    rod([side*.278,1.467,.509],[side*.318,1.447,.39],.009,steel,5);
  }
  if(dynamic){const bars=pivotFor(bike.children.slice(barFirst),[0,0,0]);bars.position.set(0,.20,-.18);}
  curve([[.23,dynamic?1.69:1.49,dynamic?.34:.52],[.29,1.31,.78],[.18,1.12,.87],[.025,1.066,.755]],.0045,dark,13,4);
  curve([[-.23,dynamic?1.69:1.49,dynamic?.34:.52],[-.14,1.34,.47],[-.05,1.29,-.19],[-.03,1.17,-.39]],.0045,dark,13,4);
  mesh(new THREE.SphereGeometry(.036,10,6),steel,[-.18,dynamic?1.732:1.532,dynamic?.37:.55]).scale.y=.52;
  mesh(new THREE.CylinderGeometry(.057,.061,.081,12),edge,[0,1.178,.805],[Math.PI/2,0,0]);
  mesh(new THREE.CircleGeometry(.049,12),world.mat('#e9ddaa',{roughness:.3}),[0,1.178,.848]);
  rod([0,1.123,.786],[0,1.07,.715],.011,steel,5);
  // Small cream head-tube badge is a material detail, not a brand logo.
  box([.037,.072,.008],world.mat('#dac28a',{roughness:.7}),[0,1.182,.622]);

  // The chain runs outside the frame on the right; opposed cranks reach pedals.
  axle(.43,-.08,.145,.032,dark);
  const gearFirst=bike.children.length;
  ring(.153,.016,steel,[.11,.43,-.08],24,4);
  for(let i=0;i<5;i++) {
    const a=i*Math.PI*2/5;rod([.11,.43,-.08],[.11,.43+Math.sin(a)*.14,-.08+Math.cos(a)*.14],.014,paint,5);
  }
  const crank=pivotFor(bike.children.slice(gearFirst),[0,.43,-.08]);crank.name='turning crank';
  ring(.064,.013,dark,[.107,.55,-1],16,4);
  curve([[.13,.584,-.055],[.13,.616,-1],[.13,.558,-1.068],[.13,.485,-1],[.13,.278,-.08],[.13,.344,.061]],.0065,dark,30,3,true);
  for(const side of[-1,1]) {
    const first=bike.children.length;
    const yy=.43+side*.13,zz=-.08-side*.095;
    rod([side*.145,.43,-.08],[side*.145,yy,zz],.018,steel,6);
    rod([side*.145,yy,zz],[side*.24,yy,zz],.012,steel,5);
    const pedalFirst=bike.children.length;
    box([.145,.043,.105],rubber,[side*.235,yy,zz]);
    for(const offset of[-.027,.027])box([.133,.006,.006],steel,[side*.235,yy+.024,zz+offset]);
    const pedal=pivotFor(bike.children.slice(pedalFirst),[side*.235,yy,zz]);pedals.push(pedal);
    bike.updateWorldMatrix(true,true);for(const object of bike.children.slice(first).filter(o=>o!==crank))crank.attach(object);
  }
  const standFirst=bike.children.length;
  rod([.08,.47,-.13],[.32,.025,-.47],.014,steel,6);
  box([.055,.018,.092],rubber,[.32,.009,-.47]);
  const kickstand=pivotFor(bike.children.slice(standFirst),[0,0,0]);

  // Rear rack with open rails; an everyday bamboo shopping basket sits above it.
  for(const side of[-1,1]) {
    rod([side*.105,.55,-1],[side*.166,1.225,-1.21],.012,steel,5);
    rod([side*.11,.55,-1],[side*.166,1.225,-.71],.012,steel,5);
    rod([side*.166,1.225,-1.25],[side*.166,1.225,-.68],.014,edge,5);
  }
  for(const zz of[-1.25,-1.05,-.86,-.68])rod([-.166,1.225,zz],[.166,1.225,zz],.011,edge,5);
  box([.13,.052,.022],world.mat('#aa654b',{roughness:.62}),[0,1.177,-1.269]);
  const basketZ=-.967,bottom=1.255,height=.30;
  box([.30,.018,.34],bamboo,[0,bottom,basketZ]);
  for(let layer=0;layer<=4;layer++) {
    const t=layer/4,halfX=.15+.063*t,halfZ=.17+.059*t,yy=bottom+t*height;
    const radius=layer===4?.014:.009,mat=layer===4?bambooLight:bamboo;
    rod([-halfX,yy,basketZ-halfZ],[halfX,yy,basketZ-halfZ],radius,mat,4);
    rod([-halfX,yy,basketZ+halfZ],[halfX,yy,basketZ+halfZ],radius,mat,4);
    rod([-halfX,yy,basketZ-halfZ],[-halfX,yy,basketZ+halfZ],radius,mat,4);
    rod([halfX,yy,basketZ-halfZ],[halfX,yy,basketZ+halfZ],radius,mat,4);
  }
  for(const side of[-1,1])for(let i=0;i<5;i++) {
    const t=-1+i*.5;
    rod([side*.15,bottom,basketZ+t*.17],[side*.213,bottom+height,basketZ+t*.229],.007,bambooLight,4);
    rod([t*.15,bottom,basketZ+side*.17],[t*.213,bottom+height,basketZ+side*.229],.007,bambooLight,4);
  }
  let triangles=0;bike.traverse(object=>{if(object.isMesh)triangles+=(object.geometry.index?.count??object.geometry.attributes.position.count)/3;});
  bike.userData.triangles=triangles;bike.userData.wheelbase=2;bike.userData.wheelDiameter=1.1;
  bike.userData.localBounds={min:[-.38,0,-1.60],max:[.38,1.60,1.60]};
  bike.userData.rig={wheels,crank,pedals,kickstand,wheelRadius:.55,seat:{x:0,y:1.438,z:-.405},grips:[[-.34,dynamic?1.69:1.49,dynamic?.21:.39],[.34,dynamic?1.69:1.49,dynamic?.21:.39]],crankCenter:{x:0,y:.43,z:-.08},pedalRadius:Math.hypot(.13,.095)};
  if(dynamic){
    const groups=[];bike.traverse(o=>{if(o.isGroup)groups.push(o);});
    for(const group of groups){const batches=new Map();for(const object of [...group.children])if(object.isMesh){object.updateMatrix();const list=batches.get(object.material)??[];const geometry=object.geometry.index?object.geometry.toNonIndexed():object.geometry.clone();geometry.applyMatrix4(object.matrix);list.push({object,geometry});batches.set(object.material,list);}
      for(const[material,list]of batches){const geometry=mergeGeometries(list.map(v=>v.geometry),false);if(geometry){const mesh=new THREE.Mesh(geometry,material);mesh.receiveShadow=true;group.add(mesh);for(const{object}of list)group.remove(object);}for(const{geometry:g}of list)g.dispose();}
    }
  }
  bike.scale.setScalar(scale);
  return bike;
}

export function updateBicycleRig(bike,{distance=0,pedalPhase=0,riding=false}={}){
  const rig=bike.userData.rig;if(!rig)return;
  for(const wheel of rig.wheels)wheel.rotation.x+=distance/(rig.wheelRadius*bike.scale.x);
  rig.crank.rotation.x=pedalPhase;
  for(const pedal of rig.pedals)pedal.rotation.x=-pedalPhase;
  rig.kickstand.visible=!riding;
}
