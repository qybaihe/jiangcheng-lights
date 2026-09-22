import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ADVENTURE_LAYOUT, ADVENTURE_MAP, ADVENTURE_ROUTES, adventureHeightAt } from './adventure-layout.js';
export { ADVENTURE_LAYOUT, ADVENTURE_MAP, ADVENTURE_ROUTES, adventureHeightAt } from './adventure-layout.js';

const UP=new THREE.Vector3(0,1,0),geometryCache=new Map();
function boxGeometry(w,h,d,rounded=false){
  const key=`${w}:${h}:${d}:${rounded}`;
  if(!geometryCache.has(key))geometryCache.set(key,rounded?new RoundedBoxGeometry(w,h,d,1,Math.min(.026,w*.1,h*.1,d*.1)):new THREE.BoxGeometry(w,h,d));
  return geometryCache.get(key);
}
function ribbonGeometry(length,width,phase=0){
  const p=[],uv=[],index=[],n=15;
  for(let i=0;i<=n;i++)for(const side of[-1,1]){
    const t=i/n;p.push(Math.sin(t*7+phase)*.12*t+side*width*.5,-length*t,Math.sin(t*9+phase)*.09*t);uv.push((side+1)/2,1-t);
  }
  for(let i=0;i<n;i++){const a=i*2;index.push(a,a+1,a+2,a+1,a+3,a+2);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(index);g.computeVertexNormals();return g;
}
function swallowGeometry(scale=1){
  const shape=new THREE.Shape();
  const outline=[[0,.49],[.29,.10],[1.66,.80],[1.31,.04],[.47,-.43],[.18,-.57],[.34,-1.30],[0,-1.01],[-.34,-1.30],[-.18,-.57],[-.47,-.43],[-1.31,.04],[-1.66,.80],[-.29,.10]];
  outline.forEach(([x,y],i)=>i?shape.lineTo(x*scale,y*scale):shape.moveTo(x*scale,y*scale));shape.closePath();
  return new THREE.ExtrudeGeometry(shape,{depth:.035*scale,steps:1,bevelEnabled:true,bevelThickness:.009*scale,bevelSize:.014*scale,bevelSegments:1});
}
function rampGeometry(){
  const r=ADVENTURE_LAYOUT.ramp,g=new THREE.BoxGeometry(r.maxX-r.minX,.22,r.maxZ-r.minZ),p=g.attributes.position;
  for(let i=0;i<p.count;i++){
    const z=(r.minZ+r.maxZ)/2+p.getZ(i),y=adventureHeightAt((r.minX+r.maxX)/2,z);
    p.setY(i,y+(p.getY(i)>0?0:-.22));
  }
  g.computeVertexNormals();return g;
}
function vaultFace(width,zThickness,bottom,top){
  const s=new THREE.Shape();s.moveTo(-width/2,top);s.lineTo(width/2,top);
  for(let i=0;i<=18;i++){const x=width/2-width*i/18;s.lineTo(x,bottom+.57*(1-(x/(width/2))**2));}
  s.closePath();const g=new THREE.ExtrudeGeometry(s,{depth:zThickness,bevelEnabled:false});g.translate(0,0,-zThickness/2);return g;
}

/** Install before World.optimize(). Immutable architecture enters world.static;
 * wind objects live in scene, cast no moving shadow, and require no new light. */
export function addAdventureScenery(world){
  if(world.adventureScenery)return world.adventureScenery.summary;
  const root=new THREE.Group();root.name='adventure-static';world.static.add(root);
  const moving=new THREE.Group();moving.name='adventure-wind';world.scene.add(moving);
  const colors={stone:'#c9c3a7',wall:'#e2d9bc',brick:'#bc8065',wood:'#58756b',woodLight:'#aebca0',dark:'#3d5c58',roof:'#6d8d82',roofLight:'#8aa18a',floor:'#c5c6ac',copper:'#b88358',copperDark:'#6a7564',cream:'#f3e5bd',coral:'#cd916c',teal:'#7da7a2',blue:'#5d91ac',paper:'#eee3c6'};
  const mat=Object.fromEntries(Object.entries(colors).map(([k,c])=>[k,world.mat(c,{roughness:.88})]));
  const glow=world.mat('#f7dfa0',{roughness:.72,emissive:'#eabe61',emissiveIntensity:.38});
  const fabric=world.mat('#c48968',{roughness:.96,side:THREE.DoubleSide});
  const blueFabric=world.mat('#5d91ac',{roughness:.96,side:THREE.DoubleSide});
  const structures=[],features=[],dynamic=[],startColliders=world.colliders.length,startOccluders=world.cameraOccluders?.length??0;
  const mesh=(g,m,x=0,y=0,z=0,parent=root)=>world.mesh(g,m,x,y,z,parent);
  const box=(w,h,d,m,x,y,z,parent=root,round=false)=>mesh(boxGeometry(w,h,d,round),m,x,y,z,parent);
  const cylinder=(rt,rb,h,m,x,y,z,parent=root,n=8)=>mesh(new THREE.CylinderGeometry(rt,rb,h,n),m,x,y,z,parent);
  const rod=(a,b,r,m=mat.wood,parent=root)=>{
    const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),delta=to.clone().sub(from),length=delta.length();
    const obj=cylinder(r,r,length,m,...from.add(to).multiplyScalar(.5).toArray(),parent,7);obj.quaternion.setFromUnitVectors(UP,delta.normalize());return obj;
  };
  const label=(text,w,h,x,y,z,parent=root,{bg='#58756b',fg='#f3e5bd'}={})=>{const obj=world.label(text,w,h,bg,fg,parent);obj.position.set(x,y,z);return obj;};
  const register=(id,bottom,top,b,{cameraOnly=false,solid=true}={})=>{
    const c={x:b.minX,X:b.maxX,z:b.minZ,Z:b.maxZ,y:bottom,height:top,kind:`adventure-${id}`,solid};
    (cameraOnly?(world.cameraOccluders??=[]):world.colliders).push(c);structures.push({id,...c,cameraOnly});return c;
  };
  const bounds=(minX,maxX,minZ,maxZ)=>({minX,maxX,minZ,maxZ});
  const mark=(id,group)=>{group.updateWorldMatrix(true,true);const b=new THREE.Box3().setFromObject(group);features.push({id,bounds:{minX:b.min.x,maxX:b.max.x,minY:b.min.y,maxY:b.max.y,minZ:b.min.z,maxZ:b.max.z}});};
  const roof=(group,width,depth,eave,ridge)=>{
    const half=depth/2,slope=Math.hypot(half,ridge-eave),a=Math.atan2(ridge-eave,half);
    for(const side of[-1,1]){
      const panel=box(width,.12,slope,mat.roof,0,(eave+ridge)/2,side*half/2,group);panel.rotation.x=side*a;
      // Rounded separate tile ribs and overlapping courses survive close views.
      for(let x=-width/2+.11;x<width/2;x+=.24){
        rod([x,ridge+.055,0],[x,eave+.055,side*half],.052,Math.round(x*10)%3?mat.roof:mat.roofLight,group);
      }
      for(let row=1;row<=3;row++)box(width,.038,.055,mat.roofLight,0,ridge+(eave-ridge)*row/3+.075,side*half*row/3,group);
      box(width+.18,.10,.15,mat.dark,0,eave-.025,side*half,group);
    }
    rod([-width/2-.12,ridge+.11,0],[width/2+.12,ridge+.11,0],.095,mat.roofLight,group);
    for(const side of[-1,1]){
      box(.13,.24,.26,mat.roofLight,side*(width/2+.09),ridge+.17,0,group,true);
      const g=new THREE.BufferGeometry(),p=[-depth/2,eave,0,depth/2,eave,0,0,ridge,0];
      g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,.5,1],2));g.computeVertexNormals();
      const end=mesh(g,mat.wall,side*(width/2-.10),0,0,group);end.rotation.y=side*Math.PI/2;
    }
  };

  for(const [i,g]of ADVENTURE_LAYOUT.gates.entries()){
    const group=new THREE.Group();group.name=g.label;group.position.z=g.z;root.add(group);
    for(const side of[-1,1]){
      const x=side*g.pierX;
      box(g.pierWidth,4.58,g.pierDepth,mat.wall,x,2.42,0,group,true);
      box(g.pierWidth+.12,.38,g.pierDepth+.08,mat.stone,x,.32,0,group,true);
      box(g.pierWidth+.20,.17,g.pierDepth+.16,mat.stone,x,4.58,0,group,true);
      for(const zz of[-1,1]){
        // Brick quoins, inset stone panels and a small capping cornice give the
        // piers depth on all approach directions rather than a painted arch.
        for(let row=0;row<8;row++)box(.23,.11,.07,mat.brick,x+side*(g.pierWidth/2-.13),.72+row*.43,zz*(g.pierDepth/2+.016),group);
        box(.57,1.37,.055,mat.dark,x,2.25,zz*(g.pierDepth/2+.022),group);
        box(.47,1.22,.062,mat.stone,x,2.25,zz*(g.pierDepth/2+.047),group,true);
      }
      register(`${g.id}-pier-${side}`,0,4.76,bounds(x-g.pierWidth/2,x+g.pierWidth/2,g.z-g.pierDepth/2,g.z+g.pierDepth/2));
    }
    const halfOpening=g.pierX-g.pierWidth/2;
    if(i===0){
      for(const side of[-1,1])mesh(vaultFace(halfOpening*2,.22,g.beamBottom,5.26),mat.wall,0,0,side*.94,group);
      for(let k=-4;k<=4;k++)box(.12,.20,.24,mat.stone,k*.61,4.92+.16*(1-Math.abs(k)/4),.96,group);
    } else {
      box(7.55,.31,2.0,mat.dark,0,g.beamBottom+.155,0,group);
      for(const side of[-1,1])for(const zz of[-1,1])rod([side*2.45,4.64,zz*.76],[side*3.15,4.47,zz*.76],.055,mat.wood,group);
    }
    box(8.5,.24,2.04,mat.wood,0,g.deckTop-.12,0,group);
    for(let x=-4.1;x<=4.1;x+=.30)box(.055,.05,2.03,mat.woodLight,x,g.deckTop+.025,0,group);
    for(const side of[-1,1]){
      box(8.28,.10,.10,mat.woodLight,0,g.deckTop+1.01,side*.95,group);
      box(8.28,.12,.10,mat.wood,0,g.deckTop+.24,side*.95,group);
      for(let x=-4.04;x<=4.05;x+=.40){
        box(.055,.86,.065,mat.wood,x,g.deckTop+.62,side*.95,group);
        if(i===0)box(.25,.32,.038,mat.woodLight,x,g.deckTop+.49,side*.958,group);
      }
      for(const x of[-4.12,-2.08,0,2.08,4.12])box(.14,g.eave-g.deckTop,.15,mat.dark,x,(g.eave+g.deckTop)/2,side*.85,group);
    }
    roof(group,9.18,2.62,g.eave,g.ridge);
    const sign=label(i===0?'晴 川 里':'巷 深 见 江',i===0?2.85:2.75,.47,0,g.deckTop+.66,1.035,group);sign.castShadow=false;
    const reverse=label(i===0?'街 坊 相 望':'灯 火 可 亲',2.8,.47,0,g.deckTop+.66,-1.035,group);reverse.rotation.y=Math.PI;
    register(`${g.id}-overhead`,g.beamBottom,g.ridge+.35,bounds(-4.72,4.72,g.z-1.4,g.z+1.4),{cameraOnly:true});
    mark(g.id,group);
  }

  const r=ADVENTURE_LAYOUT.ramp,p=ADVENTURE_LAYOUT.platform;
  const platform=new THREE.Group();platform.name='听风台 · 可走缓坡与架高平台';root.add(platform);
  const rampSurface=mesh(rampGeometry(),mat.floor,(r.minX+r.maxX)/2,0,(r.minZ+r.maxZ)/2,platform);rampSurface.name='adventure-ramp-surface';
  const platformSurface=box(p.maxX-p.minX,.26,p.maxZ-p.minZ,mat.floor,(p.minX+p.maxX)/2,p.height-.13,(p.minZ+p.maxZ)/2,platform);platformSurface.name='adventure-platform-surface';
  // The underside has foundations and braces; the playable surface is the exact
  // pure height function. Never register the deck as a ground-footprint collider.
  for(const x of[29.8,32.1,34.25,36.2])for(const z of[-17.7,-15.02]){
    box(.28,1.64,.28,mat.stone,x,.95,z,platform,true);
    box(.56,.20,.56,mat.stone,x,.23,z,platform,true);
  }
  for(const x of[30,36])rod([x,.42,-17.7],[x,1.64,-15.05],.078,mat.wood,platform);
  for(let z=r.maxZ-.26;z>r.minZ;z-=.63){
    const y=adventureHeightAt(33,z);box(r.maxX-r.minX-.08,.022,.065,mat.woodLight,33.6,y+.009,z,platform);
  }
  for(let x=29.65;x<36.5;x+=.30)box(.018,.014,3.12,mat.woodLight,x,p.height+.007,-16.35,platform);
  const rampRail=(x)=>{
    for(let i=0;i<=8;i++){const z=i===8?r.minZ:r.maxZ+(r.minZ-r.maxZ)*i/8,y=adventureHeightAt(33,z);box(.12,1.04,.12,mat.wood,x,y+.52,z,platform,true);}
    for(const h of[.44,1.02])rod([x,.13+h,r.maxZ],[x,1.93+h,r.minZ],h>.8?.068:.044,mat.wood,platform);
    // Narrow upstands and a white end cap make the rise legible from below.
    rod([x,.17,r.maxZ],[x,1.97,r.minZ],.075,mat.stone,platform);
  };
  rampRail(r.minX);rampRail(r.maxX);
  const levelRail=(a,b)=>{
    const distance=Math.hypot(a[0]-b[0],a[1]-b[1]),n=Math.ceil(distance/1.10);
    for(let i=0;i<=n;i++){const t=i/n;box(.12,1.03,.12,mat.wood,a[0]+(b[0]-a[0])*t,p.height+.515,a[1]+(b[1]-a[1])*t,platform,true);}
    for(const h of[.43,1.01])rod([a[0],p.height+h,a[1]],[b[0],p.height+h,b[1]],h>.8?.065:.043,mat.wood,platform);
  };
  levelRail([29.5,-18],[36.5,-18]);levelRail([29.5,-18],[29.5,-14.7]);levelRail([36.5,-18],[36.5,-14.7]);
  levelRail([29.5,-14.7],[32,-14.7]);levelRail([35.2,-14.7],[36.5,-14.7]);
  for(const item of ADVENTURE_MAP.filter(x=>x.kind==='rail')){
    if(item.id.startsWith('wind-ramp')){
      for(let i=0;i<8;i++){
        const z0=r.maxZ+(r.minZ-r.maxZ)*i/8,z1=i===7?r.minZ:r.maxZ+(r.minZ-r.maxZ)*(i+1)/8;
        register(`${item.id}-${i}`,adventureHeightAt(33,z0),adventureHeightAt(33,z1)+1.06,
          bounds(item.bounds.minX,item.bounds.maxX,z1,z0));
      }
    }else register(item.id,.13,2.99,item.bounds);
  }
  // Sealed apron walls protect the deck's height discontinuity at every edge
  // except the wide, continuous ramp mouth.
  for(const x of[29.5,36.5])box(.16,1.72,3.32,mat.stone,x,1.02,-16.35,platform);
  box(7.08,1.72,.16,mat.stone,33,1.02,-18,platform);
  for(const [x,w]of[[30.75,2.5],[35.85,1.3]])box(w,1.72,.16,mat.stone,x,1.02,-14.7,platform);
  mark('wind-platform',platform);

  // Three original, physical clues match the exploration chain's stand points.
  const clues=new THREE.Group();clues.name='街坊留给小路的线索';root.add(clues);
  const swallowSign=mesh(swallowGeometry(.315),mat.copper,-20.19,1.83,12.2,clues);swallowSign.rotation.y=-Math.PI/2;swallowSign.name='工具棚燕子路标';
  rod([-20.02,1.78,12.2],[-20.205,1.78,12.2],.025,mat.wood,clues);
  const clueTails=new THREE.Group();clueTails.name='工具棚燕子 · 两条蓝布尾巴';clueTails.position.set(-20.23,1.48,12.2);clueTails.rotation.y=-Math.PI/2;moving.add(clueTails);
  for(const side of[-1,1]){
    const tail=mesh(ribbonGeometry(.53,.09,side*.7),blueFabric,side*.085,0,0,clueTails);
    dynamic.push({kind:'ribbon',group:tail,phase:side*.7,baseRotation:0});
  }
  box(.055,.075,.15,mat.copper,-20.08,1.42,12.2,clues,true);
  box(.035,.32,.24,mat.paper,-20.067,1.25,12.2,clues);
  const tag=label('顺着江风走',.94,.19,-20.10,2.20,12.2,clues);tag.rotation.y=-Math.PI/2;
  // The sign is against an existing shed wall, within its existing collider.
  box(.32,.22,.32,mat.stone,-12.5,.24,-13,clues,true);
  box(.10,2.55,.10,mat.wood,-12.5,1.405,-13,clues,true);
  rod([-12.5,2.58,-13],[-12.06,2.58,-13],.035,mat.wood,clues);
  label('江风不催人，街坊等你回',1.22,.32,-12.5,1.69,-12.918,clues);
  register('wind-note-post',0,2.72,bounds(-12.66,-12.34,-13.16,-12.84));
  const chime=new THREE.Group();chime.name='街坊风铃 · 蓝布长签';chime.position.set(-12.14,2.54,-13);moving.add(chime);
  cylinder(.14,.20,.16,mat.copper,0,-.16,0,chime,12);rod([0,0,0],[0,-.46,0],.008,mat.dark,chime);
  mesh(ribbonGeometry(.46,.14,1.7),blueFabric,0,-.38,.02,chime);dynamic.push({kind:'chime',group:chime,phase:.9});

  const lamp=new THREE.Group();lamp.name='听风台 · 红铜望江灯';lamp.position.set(ADVENTURE_LAYOUT.lamp.x,p.height,ADVENTURE_LAYOUT.lamp.z);root.add(lamp);
  cylinder(.34,.42,.21,mat.stone,0,.105,0,lamp,12);cylinder(.17,.23,.24,mat.copperDark,0,.32,0,lamp,12);
  cylinder(.10,.14,1.32,mat.copperDark,0,1.07,0,lamp,10);
  cylinder(.34,.29,.12,mat.copper,0,1.76,0,lamp,8);cylinder(.27,.27,.63,glow,0,2.12,0,lamp,8);
  for(let i=0;i<8;i++){const a=i*Math.PI/4;rod([Math.sin(a)*.29,1.79,Math.cos(a)*.29],[Math.sin(a)*.29,2.47,Math.cos(a)*.29],.019,mat.copper,lamp);}
  cylinder(.14,.43,.28,mat.copper,0,2.60,0,lamp,8);cylinder(.035,.075,.30,mat.copperDark,0,2.86,0,lamp,8);
  const lampNote=label('灯在，等你回巷',1.09,.24,-.03,.71,.21,lamp);lampNote.rotation.x=-.08;
  register('lookout-lamp',p.height,p.height+3.08,bounds(34.56,35.34,-17.44,-16.66));
  const vane=new THREE.Group();vane.name='轮渡信号风标';vane.position.set(34.95,p.height+3.04,-17.05);moving.add(vane);
  rod([-.62,0,0],[.62,0,0],.027,mat.copperDark,vane);
  box(.38,.18,.055,mat.copper,-.48,0,0,vane);const arrow=mesh(new THREE.ConeGeometry(.13,.30,3),mat.copper,.66,0,0,vane);arrow.rotation.z=-Math.PI/2;
  dynamic.push({kind:'vane',group:vane,phase:0});mark('lookout-lamp',lamp);
  label('听 风 台',1.46,.36,33.6,.73,.09,root,{bg:'#58756b',fg:'#f3e5bd'});
  // This low arrival plaque sits on a side post, never across the ramp.
  const entrySign=root.children.at(-1);entrySign.position.x=35.15;entrySign.position.y=1.21;entrySign.position.z=.03;
  register('entry-sign-post',0,1.41,bounds(35.01,35.29,-.11,.17));box(.10,1.21,.10,mat.wood,35.15,.735,.03,root);

  const kite=new THREE.Group();kite.name='一只燕子 · 听风台的远处召唤';kite.position.set(33.2,13.2,-17.4);kite.rotation.y=-1.25;moving.add(kite);
  mesh(swallowGeometry(),mat.cream,0,0,0,kite);
  const wingMark=new THREE.Shape();wingMark.moveTo(.30,.08);wingMark.lineTo(1.51,.65);wingMark.lineTo(1.05,.04);wingMark.lineTo(.47,-.34);wingMark.closePath();
  for(const side of[-1,1]){const m=mesh(new THREE.ShapeGeometry(wingMark),mat.teal,0,0,.044,kite);m.scale.x=side;}
  rod([-.03,.31,.057],[0,-.99,.057],.018,mat.copper,kite);
  for(const side of[-1,1]){
    const ribbon=mesh(ribbonGeometry(1.64,.083,side),fabric,side*.25,-1.20,.014,kite);dynamic.push({kind:'ribbon',group:ribbon,phase:side*1.2,baseRotation:0});
  }
  dynamic.push({kind:'kite',group:kite,phase:0,origin:kite.position.clone()});
  const cordGeometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(34.95,4.85,-17.05),kite.position]);
  const cord=new THREE.Line(cordGeometry,new THREE.LineBasicMaterial({color:'#788c7a',transparent:true,opacity:.65}));cord.frustumCulled=false;moving.add(cord);
  for(const [i,loc]of[[-6,13,-16],[12,15,-34],[28,14,-30]].entries()){
    const bird=new THREE.Group();bird.name=`江风里的飞鸟${i+1}`;bird.position.set(...loc);moving.add(bird);
    const wings=[];
    for(const side of[-1,1]){
      const shape=new THREE.Shape();shape.moveTo(0,0);shape.lineTo(side*.82,.17);shape.lineTo(side*.52,-.025);shape.lineTo(side*.14,-.08);shape.closePath();
      const wing=mesh(new THREE.ShapeGeometry(shape),mat.dark,0,0,0,bird);wings.push(wing);
    }
    dynamic.push({kind:'bird',group:bird,wings,phase:i*1.9,origin:bird.position.clone()});
  }
  // Small hanging cloths belong to the upper gallery, high above the player.
  const paleFabric=mat.teal.clone();paleFabric.side=THREE.DoubleSide;
  for(const [i,x]of[-2.35,1.65].entries()){
    const cloth=mesh(ribbonGeometry(.63,.38,i),i?paleFabric:fabric,x,5.47,20.91,moving);
    cloth.material.side=THREE.DoubleSide;dynamic.push({kind:'cloth',group:cloth,phase:i+2,baseRotation:0});
  }
  moving.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;}});
  root.updateMatrixWorld(true);let meshes=0,triangles=0;
  root.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
  const summary={name:'里分门楼、风铃小路与听风台',staticMeshes:meshes,staticTriangles:triangles,dynamicObjects:dynamic.length,newRealtimeLights:0,addedColliders:world.colliders.length-startColliders,addedCameraOccluders:(world.cameraOccluders?.length??0)-startOccluders,structures,features,layout:ADVENTURE_LAYOUT,map:ADVENTURE_MAP,routes:ADVENTURE_ROUTES};
  world.adventureScenery={root,moving,dynamic,cord,kite,time:0,summary};
  updateAdventureScenery(world,0,0);return summary;
}

/** Wind never invalidates the cached sun shadows. reduced uses a fixed rest pose. */
export function updateAdventureScenery(world,dt=0,t=0){
  const state=world.adventureScenery;if(!state)return;
  if(!world.reduced&&!world.suspended&&Number.isFinite(dt))state.time+=Math.max(0,Math.min(dt,.1));
  const time=world.reduced?0:state.time;
  for(const item of state.dynamic){
    const wave=Math.sin(time*.78+item.phase),g=item.group;
    if(item.kind==='kite'){
      g.position.copy(item.origin);g.position.x+=world.reduced?0:Math.sin(time*.29)*.18;g.position.y+=world.reduced?0:Math.sin(time*.41)*.13;
      g.rotation.set(world.reduced?0:wave*.035,-1.25,world.reduced?0:Math.sin(time*.53)*.045);
    }else if(item.kind==='vane')g.rotation.y=world.reduced?-.27:-.27+Math.sin(time*.24)*.30;
    else if(item.kind==='bird'){
      g.position.copy(item.origin);g.position.x+=world.reduced?0:Math.sin(time*.12+item.phase)*4;g.position.z+=world.reduced?0:Math.sin(time*.10+item.phase)*2;
      g.rotation.y=-.32;item.wings.forEach((wing,i)=>wing.rotation.x=(i?1:-1)*(world.reduced?.10:.10+Math.sin(time*2.1+item.phase)*.32));
    }else g.rotation.z=world.reduced?0:wave*(item.kind==='chime'?.075:.11);
  }
  const p=state.cord.geometry.attributes.position;p.setXYZ(1,state.kite.position.x,state.kite.position.y-.90,state.kite.position.z);p.needsUpdate=true;
}
