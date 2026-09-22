import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

const geoCache=new Map();
const UP=new THREE.Vector3(0,1,0);

function roundedRect(width,height,radius=.06,x=0,y=0,clockwise=false){
  const p=new THREE.Path(),l=x-width/2,r=x+width/2,b=y,t=y+height;
  const q=Math.min(radius,width/3,height/3);
  p.moveTo(l+q,b);p.lineTo(r-q,b);p.quadraticCurveTo(r,b,r,b+q);
  p.lineTo(r,t-q);p.quadraticCurveTo(r,t,r-q,t);p.lineTo(l+q,t);
  p.quadraticCurveTo(l,t,l,t-q);p.lineTo(l,b+q);p.quadraticCurveTo(l,b,l+q,b);p.closePath();
  if(clockwise)p.curves=p.curves.reverse().map(curve=>{
    if(curve.isLineCurve){const a=curve.v1.clone();curve.v1.copy(curve.v2);curve.v2.copy(a);}
    else if(curve.isQuadraticBezierCurve){const a=curve.v0.clone();curve.v0.copy(curve.v2);curve.v2.copy(a);}
    return curve;
  });
  return p;
}

function archedPath(width,height,x=0,y=0){
  const p=new THREE.Path(),r=width/2,spring=y+height-r;
  p.moveTo(x-r,y);p.lineTo(x+r,y);p.lineTo(x+r,spring);
  p.absarc(x,spring,r,0,Math.PI,false);p.lineTo(x-r,y);p.closePath();return p;
}

function solidPanel(width,height,openings,depth=.26,{detail=3,bevel=true}={}){
  const shape=new THREE.Shape();shape.moveTo(-width/2,0);shape.lineTo(width/2,0);
  shape.lineTo(width/2,height);shape.lineTo(-width/2,height);shape.closePath();
  for(const o of openings)shape.holes.push(o.arch?archedPath(o.w,o.h,o.x,o.y):roundedRect(o.w,o.h,o.r??.06,o.x,o.y));
  const g=new THREE.ExtrudeGeometry(shape,{depth,steps:1,bevelEnabled:bevel,bevelThickness:.018,bevelSize:.018,bevelSegments:1,curveSegments:detail});
  g.translate(0,0,-depth);return g;
}

function ringGeometry(width,height,border,depth,{radius=.10,arch=false,detail=3,bevel=true}={}){
  const outside=arch?archedPath(width+border*2,height+border*2,0,-border):roundedRect(width+border*2,height+border*2,radius,0,-border);
  const segments=arch?Math.max(8,detail):detail,shape=new THREE.Shape(outside.getPoints(segments));
  shape.holes.push(arch?archedPath(width,height):roundedRect(width,height,Math.max(.015,radius-border)));
  return new THREE.ExtrudeGeometry(shape,{depth,steps:1,bevelEnabled:bevel,bevelThickness:.018,bevelSize:.018,bevelSegments:1,curveSegments:segments});
}

// A closed clay tile, curved across its width, rather than a textured plane.
function roofTile(width,length,n=6){
  const key=`tile:${width.toFixed(3)}:${length.toFixed(3)}:${n}`;if(geoCache.has(key))return geoCache.get(key);
  const positions=[],uvs=[],indices=[];
  for(let end=0;end<2;end++)for(let shell=0;shell<2;shell++)for(let i=0;i<=n;i++){
    const a=i/n*Math.PI;positions.push(Math.cos(a)*width/2,Math.sin(a)*width*.27-shell*.022,(end-.5)*length);uvs.push(i/n,end);
  }
  const index=(end,shell,i)=>end*2*(n+1)+shell*(n+1)+i;
  const quad=(a,b,c,d)=>indices.push(a,b,c,a,c,d);
  for(let i=0;i<n;i++){
    quad(index(0,0,i),index(0,0,i+1),index(1,0,i+1),index(1,0,i));
    quad(index(0,1,i+1),index(0,1,i),index(1,1,i),index(1,1,i+1));
    quad(index(0,0,i),index(0,1,i),index(0,1,i+1),index(0,0,i+1));
    quad(index(1,0,i+1),index(1,1,i+1),index(1,1,i),index(1,0,i));
  }
  quad(index(0,0,0),index(1,0,0),index(1,1,0),index(0,1,0));
  quad(index(0,1,n),index(1,1,n),index(1,0,n),index(0,0,n));
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();geoCache.set(key,g);return g;
}

export function isNearArchitecture(config){
  return config.sign?.includes('修理')||config.sign?.includes('热干面')||(config.x===-18&&config.z===-6.1);
}

/** A lighter sibling for the rest of the lane and the distant street edge.
 * All four elevations have cut masonry openings, solid inset panes and deep
 * frames. The six reachable buildings retain their original blocked volume.
 * Distant buildings omit tiny hardware and use larger roof tiles.
 */
export function buildStreetArchitecture(world,config){
  const {x,z,w=9,d=7,h=7,sign,roof=true,collide=true}=config;
  const distant=!collide,civic=sign?.includes('街坊'),tea=sign?.includes('茶馆');
  const variant=civic?2:tea?1:Math.abs(Math.round(x+z))%3;
  const schemes=[['#d6ab93','#51766d','#c8bea2','#b98367'],['#d0dcd0','#527a77','#bbc4b3','#ac7d68'],['#f3e4c1','#6a9381','#cebc99','#c99b72']];
  const [wallColor,woodColor,stoneColor,brickColor]=schemes[variant];
  const materials={};
  for(const [name,color]of Object.entries({wall:wallColor,wood:woodColor,stone:stoneColor,brick:brickColor,recess:'#64746a',floor:'#c1c5b4',roof:'#607f7b',roofLight:'#73918a',roofDark:'#4d6a66',glass:'#88aaa7',glassLight:'#bbd0bf',cream:'#eee8cf',woodLight:'#a9b29a'}))materials[name]=world.mat(color,{roughness:.89});
  const root=new THREE.Group();root.name=`街区建筑 · ${sign||'里份民居'}`;root.position.set(x,0,z);world.static.add(root);
  const mesh=(group,geometry,material,xx=0,yy=0,zz=0)=>world.mesh(geometry,material,xx,yy,zz,group);
  const box=(group,width,height,depth,material,xx=0,yy=0,zz=0,beveled=false)=>{
    const radius=Math.min(.025,width*.14,height*.14,depth*.14),key=`street-box:${width}:${height}:${depth}:${beveled&&!distant}`;
    let geometry=geoCache.get(key);if(!geometry){geometry=beveled&&!distant?new RoundedBoxGeometry(width,height,depth,1,radius):new THREE.BoxGeometry(width,height,depth);geoCache.set(key,geometry);}
    return mesh(group,geometry,material,xx,yy,zz);
  };
  const wallGroup=(xx,zz,rotation=0)=>{const g=new THREE.Group();g.position.set(xx,0,zz);g.rotation.y=rotation;root.add(g);return g;};
  const stories=h>=8.8?3:2,storey=(h-.30)/stories,doorHeight=Math.min(2.72,storey-.32);
  const door={x:0,y:.13,w:civic?2.6:tea?2.1:1.7,h:doorHeight,arch:civic||variant===1};
  const row=(span,floor,count=Math.max(1,Math.floor((span-1.4)/2.5)))=>Array.from({length:count},(_,i)=>({x:(i-(count-1)/2)*span/(count+.55),y:floor*storey+.72,w:Math.min(1.43,span/(count+.55)*.58),h:Math.min(1.6,storey-1.13)}));
  const frame=(face,o)=>{
    mesh(face,ringGeometry(o.w,o.h,.09,.105,{radius:.065,detail:distant?1:2,bevel:!distant}),materials.stone,o.x,o.y,-.035);
    box(face,o.w-.09,o.h-.08,.045,materials.recess,o.x,o.y+o.h/2,-.205);
    for(const side of[-1,1])box(face,(o.w-.21)/2,o.h-.19,.036,side<0?materials.glass:materials.glassLight,o.x+side*(o.w-.11)/4,o.y+o.h/2,-.168);
    for(const side of[-1,1])box(face,.055,o.h-.1,.10,materials.wood,o.x+side*(o.w/2-.055),o.y+o.h/2,-.10);
    box(face,.05,o.h-.1,.10,materials.wood,o.x,o.y+o.h/2,-.10);
    for(const yy of[.05,.48,o.h-.05])box(face,o.w-.10,.048,.10,materials.wood,o.x,o.y+yy,-.10);
    box(face,o.w+.31,.135,.32,materials.stone,o.x,o.y-.035,-.01,true);
    if(!distant)box(face,o.w+.20,.09,.19,materials.woodLight,o.x,o.y+o.h+.085,-.025,true);
  };
  const elevations=[{span:w,group:wallGroup(0,d/2),front:true},{span:d,group:wallGroup(w/2,0,Math.PI/2)},{span:d,group:wallGroup(-w/2,0,-Math.PI/2)},{span:w,group:wallGroup(0,-d/2,Math.PI)}];
  for(const {span,group,front}of elevations){
    const windows=[];
    for(let floor=0;floor<stories;floor++){
      if(front&&floor===0){for(const side of[-1,1])windows.push({x:side*w*.32,y:1.02,w:Math.min(1.45,w*.19),h:Math.min(1.52,storey-1.12)});}
      else windows.push(...row(span,floor));
    }
    mesh(group,solidPanel(span,h,front?[door,...windows]:windows,.23,{detail:distant?1:2,bevel:!distant}),materials.wall);
    windows.forEach(o=>frame(group,o));
    if(front){
      mesh(group,ringGeometry(door.w,door.h,.14,.14,{arch:door.arch,radius:.10,detail:distant?1:2,bevel:!distant}),materials.stone,0,.13,-.005);
      const depth=.45;
      box(group,door.w-.08,door.h-.06,.065,materials.wood,0,.13+door.h/2,-depth,true);
      for(const side of[-1,1])box(group,.09,door.h,.42,materials.recess,side*(door.w/2-.04),.13+door.h/2,-.24);
      for(const side of[-1,1])for(const yy of[.68,1.75])box(group,door.w*.38,.49,.036,materials.woodLight,side*door.w*.235,yy,-depth+.05,true);
      box(group,.045,door.h-.12,.075,materials.woodLight,0,.13+door.h/2,-depth+.05);
      for(const side of[-1,1])box(group,.04,.17,.06,materials.cream,side*.085,1.27,-depth+.10,true);
      const wing=(span-door.w)/2;
      for(const side of[-1,1])box(group,wing,.37,.12,materials.stone,side*(door.w/2+wing/2),.25,-.005);
    }else box(group,span,.37,.12,materials.stone,0,.25,-.005);
    for(let floor=1;floor<stories;floor++){
      box(group,span+.10,.14,.17,materials.stone,0,floor*storey+.07,.005,true);
      if(!distant)box(group,span+.04,.065,.13,materials.woodLight,0,floor*storey-.10,.005);
    }
    box(group,span+.08,.14,.18,materials.stone,0,h-.16,.015,true);
  }
  box(root,w,.1,d,materials.floor,0,.07,0);
  for(const xx of[-1,1])for(const zz of[-1,1]){
    box(root,.25,h-.23,.25,materials.stone,xx*(w/2-.095),(h-.23)/2+.07,zz*(d/2-.095),true);
    if(!distant)for(let j=0;j<5;j++)box(root,.35+(j%2)*.12,.145,.06,materials.brick,xx*(w/2-.22),.30+j*.19,zz*(d/2+.026));
  }
  if(sign){
    const front=elevations[0].group,signW=Math.min(w*.75,sign.length*.39+1),signH=.45;
    box(front,signW+.18,signH+.17,.16,materials.wood,0,storey+.18,.02,true);
    const text=world.label(sign,signW,signH,'#527268','#f5e9c9',front);text.position.set(0,storey+.18,.105);
  }
  if(civic){
    // Broad stepped parapet echoes the local li-fen gateways without copying
    // the main courtyard crown or an image from the reference game.
    const front=elevations[0].group;
    for(const [ww,hh,yy]of[[4.2,.42,h-.85],[2.6,.35,h-.52],[1.15,.29,h-.25]]){
      box(front,ww,hh,.29,materials.brick,0,yy,.005,true);box(front,ww+.17,.09,.42,materials.stone,0,yy+hh/2,.04,true);
    }
  }
  if(roof){
    const over=.30,half=d/2+over,pitch=civic?1.42:tea?1.35:1.02,slope=Math.hypot(half,pitch);
    for(const side of[-1,1]){
      const under=box(root,w+over*2,.13,slope+.06,materials.roofDark,0,h+pitch/2,side*half/2);under.rotation.x=side*Math.atan2(pitch,half);
      const count=Math.ceil((w+over*2)/(distant?.55:.39)),step=(w+over*2)/count,rows=Math.ceil(slope/(distant?1.25:.95)),length=slope/rows;
      const tile=roofTile(step*1.03,length+.07,distant?3:5),axis=new THREE.Vector3(0,-pitch,side*half).normalize(),normal=new THREE.Vector3(0,half,side*pitch).normalize(),rotation=new THREE.Matrix4().makeBasis(new THREE.Vector3(side,0,0),normal,axis);
      for(let col=0;col<count;col++)for(let r=0;r<rows;r++){
        const f=(r+.5)/rows,m=mesh(root,tile,(col+r)%6===0?materials.roofLight:materials.roof,-w/2-over+(col+.5)*step,h+pitch*(1-f)+.07,side*half*f);m.quaternion.setFromRotationMatrix(rotation);
      }
      box(root,w+.67,.17,.17,materials.wood,0,h-.03,side*(half-.02),true);
      if(!distant)for(let xx=-w/2+.16;xx<w/2;xx+=.76)box(root,.07,.14,.33,materials.woodLight,xx,h-.11,side*(d/2+.07));
      if(collide)world.cameraOccluders?.push({x:x-w/2-.34,X:x+w/2+.34,z:z+Math.min(side*(d/2-.05),side*(half+.1)),Z:z+Math.max(side*(d/2-.05),side*(half+.1)),y:h-.23,height:h+.17,kind:'architecture-street-eave'});
    }
    const ridge=mesh(root,new THREE.CylinderGeometry(.11,.11,w+.72,8),materials.roofDark,0,h+pitch+.1,0);ridge.rotation.z=Math.PI/2;
    for(const side of[-1,1]){
      const g=wallGroup(side*(w/2-.08),0,side*Math.PI/2),shape=new THREE.Shape();shape.moveTo(-d/2,h);shape.lineTo(d/2,h);shape.lineTo(0,h+pitch);shape.closePath();mesh(g,new THREE.ExtrudeGeometry(shape,{depth:.16,bevelEnabled:false}),materials.wall);
      for(const end of[-1,1]){const a=new THREE.Vector3(side*(w/2+.28),h+pitch+.02,0),b=new THREE.Vector3(side*(w/2+.28),h,end*half),delta=b.clone().sub(a),beam=mesh(root,new THREE.CylinderGeometry(.055,.055,delta.length(),6),materials.stone,...a.add(b).multiplyScalar(.5).toArray());beam.quaternion.setFromUnitVectors(UP,delta.normalize());}
    }
  }
  if(collide)world.colliders.push({x:x-w/2-.15,X:x+w/2+.15,z:z-d/2-.15,Z:z+d/2+.15,height:h+1.5,kind:'architecture-street-body'});
  root.updateMatrixWorld(true);let meshes=0,triangles=0;root.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
  const summary={kind:distant?'distant':'street',name:sign||'里份民居',center:{x,z},footprint:{w,d,h},originalAssetsUsed:0,meshCount:meshes,triangleCount:triangles,colliderCount:collide?1:0,porch:{enterable:false},bounds:new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).toArray()};
  world.nearArchitecture??=[];world.nearArchitecture.push(summary);root.userData.nearArchitecture=summary;return root;
}

/** Original, geometry-led street architecture for the three playable landmarks.
 * No image/facade/normal-map assets are loaded. Open shop porches carve only
 * previously blocked floor area; their outer collision envelope never grows.
 */
export function buildNearArchitecture(world,config){
  const {x,z,w=10,d=7,h=7,sign,roof=true,collide=true}=config;
  const kind=sign?.includes('修理')?'repair':sign?.includes('热干面')?'breakfast':'courtyard';
  const courtyard=kind==='courtyard',base=courtyard?.6:.13,front=d/2;
  const root=new THREE.Group();root.name=`近景建筑 · ${kind}`;root.position.set(x,0,z);world.static.add(root);
  const palettes={repair:{wall:'#d6ab93',stone:'#c8bea2',wood:'#51766d',brick:'#b98367'},breakfast:{wall:'#f3e4c1',stone:'#cebc99',wood:'#6a9381',brick:'#c99b72'},courtyard:{wall:'#d0dcd0',stone:'#bbc4b3',wood:'#527a77',brick:'#ac7d68'}};
  const p=palettes[kind],materials={};
  for(const[name,color]of Object.entries({...p,dark:'#3e5854',recess:'#64746a',floor:'#c1c5b4',roof:'#607f7b',roofLight:'#73918a',roofDark:'#4d6a66',woodLight:'#a9b29a',brass:'#b19b61',glass:'#88aaa7',glassLight:'#bbd0bf',cream:'#eee8cf',inside:'#ddd0b3'}))materials[name]=world.mat(color,{roughness:.89});
  const windowLight=world.mat('#a8ba9c',{roughness:1,emissive:'#ebc780',emissiveIntensity:.10});
  if(world.windowMats&&!world.windowMats.includes(windowLight))world.windowMats.push(windowLight);
  const mesh=(g,geometry,material,xx=0,yy=0,zz=0)=>world.mesh(geometry,material,xx,yy,zz,g);
  const box=(g,width,height,depth,material,xx=0,yy=0,zz=0,r=.025)=>{
    const radius=Math.min(r,width*.18,height*.18,depth*.18),beveled=width>=.1&&height>=.1&&depth>=.05,key=`box:${width}:${height}:${depth}:${radius}:${beveled}`;
    let geo=geoCache.get(key);if(!geo){geo=beveled?new RoundedBoxGeometry(width,height,depth,1,radius):new THREE.BoxGeometry(width,height,depth);geoCache.set(key,geo);}
    return mesh(g,geo,material,xx,yy,zz);
  };
  const rod=(g,a,b,r,material=materials.dark)=>{
    const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start);
    const m=mesh(g,new THREE.CylinderGeometry(r,r,delta.length(),7),material,...start.add(end).multiplyScalar(.5).toArray());m.quaternion.setFromUnitVectors(UP,delta.normalize());return m;
  };
  const register=(xx,X,zz,Z,y,height,label,cameraOnly=false)=>{
    const bounds={x:x+xx,X:x+X,z:z+zz,Z:z+Z,y,height,kind:`architecture-${label}`};
    (cameraOnly?world.cameraOccluders:world.colliders)?.push(bounds);
  };
  const wallGroup=(xx,zz,rotation=0)=>{const group=new THREE.Group();group.position.set(xx,0,zz);group.rotation.y=rotation;root.add(group);return group;};
  const entry={x:courtyard?0:-2.62,y:base,w:courtyard?2.7:2.45,h:courtyard?2.72:2.9,arch:courtyard};
  const upperBottom=courtyard?4.35:4.62,upperHeight=courtyard?2.10:1.63;
  const upper=[-3.05,0,3.05].map(xx=>({x:xx,y:upperBottom,w:1.52,h:upperHeight,r:.07}));
  const lower=courtyard?[-3.12,3.12].map(xx=>({x:xx,y:1.22,w:1.68,h:1.74,r:.07})):[{x:1.15,y:1.02,w:3.68,h:1.73,r:.065}];
  const face=wallGroup(0,front);
  mesh(face,solidPanel(w,h,[entry,...upper,...lower]),materials.wall);
  box(root,w,.11,d,materials.floor,0,base-.065,0,.01);

  // Two layers at the storey divide, and a stone footing, form broad readable
  // silhouette changes. Individual brick accents are confined to the corners.
  for(const [yy,hh,dd]of[[courtyard?3.62:3.54,.18,.16],[courtyard?3.82:3.74,.09,.22],[h-.20,.14,.22]]){
    box(root,w+.10,hh,dd,materials.stone,0,yy,front+.035);
    for(const side of[-1,1])box(root,dd,hh,d+.04,materials.stone,side*(w/2-.025),yy,0);
  }
  for(const side of[-1,1]){
    box(root,.31,h-.35,.31,materials.stone,side*(w/2-.14),(h-.35)/2+.08,front-.06);
    for(let row=0;row<8;row++)box(root,.42+(row%2)*.10,.145,.06,row%3?materials.brick:materials.stone,side*(w/2-.26),base+.16+row*.19,front+.043,.009);
  }
  // The lower solid base stops at the actual entrance.
  const leftWidth=entry.x-entry.w/2+w/2,rightWidth=w/2-entry.x-entry.w/2;
  box(face,leftWidth,.42,.11,materials.stone,-w/2+leftWidth/2,base+.17,.023);
  box(face,rightWidth,.42,.11,materials.stone,w/2-rightWidth/2,base+.17,.023);

  function frame(group,o,{shutters=false,display=false}={}){
    mesh(group,ringGeometry(o.w,o.h,.10,.11),materials.stone,o.x,o.y,-.04);
    mesh(group,ringGeometry(o.w-.16,o.h-.16,.052,.09,{radius:.04}),materials.wood,o.x,o.y+.08,-.16);
    box(group,o.w+.37,.17,.46,materials.stone,o.x,o.y-.045,-.015);
    box(group,o.w+.26,.115,.24,materials.woodLight,o.x,o.y+o.h+.095,-.04);
    if(display){
      box(group,o.w-.13,o.h-.1,.065,materials.inside,o.x,o.y+o.h/2,-.86);
      for(const side of[-1,1])box(group,.075,o.h-.1,.72,materials.recess,o.x+side*(o.w/2-.09),o.y+o.h/2,-.49);
      box(group,o.w-.10,.08,.72,materials.wood,o.x,o.y+.02,-.49);
      box(group,o.w-.12,.07,.48,materials.wood,o.x,o.y+.64,-.61);
      box(group,.065,o.h-.1,.1,materials.wood,o.x,o.y+o.h/2,-.12);
      for(const side of[-1,1]){
        const xx=o.x+side*o.w*.27;
        if(kind==='repair'){
          box(group,.57,.42,.29,materials.woodLight,xx,o.y+.89,-.59);
          box(group,.38,.28,.035,materials.dark,xx-.035,o.y+.90,-.423);
          for(let i=0;i<6;i++)box(group,.018,.245,.012,materials.cream,xx-.18+i*.048,o.y+.90,-.402,.001);
          const dial=mesh(group,new THREE.CylinderGeometry(.046,.046,.03,12),materials.brass,xx+.21,o.y+.86,-.416);dial.rotation.x=Math.PI/2;
        }else{
          for(let i=0;i<3;i++){
            const bowl=mesh(group,new THREE.CylinderGeometry(.19,.105,.105,14,1,true),materials.cream,xx+(i-1)*.40,o.y+.14,-.41);bowl.castShadow=true;
            mesh(group,new THREE.CylinderGeometry(.172,.172,.018,14),materials.brass,xx+(i-1)*.40,o.y+.195,-.41);
          }
          mesh(group,new THREE.CylinderGeometry(.23,.23,.38,16),materials.woodLight,xx,o.y+.87,-.63);
          mesh(group,new THREE.CylinderGeometry(.25,.25,.045,16),materials.cream,xx,o.y+1.08,-.63);
        }
      }
    }else{
      box(group,o.w-.22,o.h-.22,.035,windowLight,o.x,o.y+o.h/2,-.255,.005);
      for(const side of[-1,1])box(group,(o.w-.29)/2,o.h*.38,.019,side<0?materials.glass:materials.glassLight,o.x+side*o.w*.235,o.y+o.h*.66,-.226,.002);
      box(group,.061,o.h-.15,.105,materials.wood,o.x,o.y+o.h/2,-.155);
      for(const yy of[.34,.67])box(group,o.w-.16,.052,.102,materials.wood,o.x,o.y+o.h*yy,-.155);
      for(const side of[-1,1])box(group,.025,.17,.025,materials.brass,o.x+side*.065,o.y+o.h*.44,-.09,.003);
    }
    if(shutters)for(const side of[-1,1]){
      const shutter=new THREE.Group();shutter.position.set(o.x+side*(o.w/2+.15),o.y,.115);shutter.rotation.y=-side*.25;group.add(shutter);
      const sw=.47;box(shutter,sw,o.h+.10,.07,materials.wood,side*sw/2,o.h/2,-.005);
      for(let j=0;j<8;j++)box(shutter,sw-.11,.075,.055,materials.woodLight,side*sw/2,.15+j*(o.h-.2)/8,.045,.009).rotation.x=-.27;
      for(const yy of[.22,o.h-.22])box(shutter,.11,.033,.035,materials.dark,side*.09,yy,.065,.003);
    }
  }
  upper.forEach(o=>frame(face,o,{shutters:!courtyard}));
  if(!courtyard)register(-w/2+.42,w/2-.42,front+.025,front+.31,upperBottom-.08,upperBottom+upperHeight+.11,'upper-shutters',true);
  lower.forEach(o=>frame(face,o,{display:!courtyard}));

  // The two side walls contain cut-out openings and deep reveals, not window
  // images applied to an intact box. A few asymmetrical fixtures make the two
  // approaches readable as different places.
  for(const side of[-1,1]){
    const sideFace=wallGroup(side*w/2,0,side*Math.PI/2),sideWindows=[];
    for(const zz of[-d*.26,d*.23])for(const upperFloor of[false,true])sideWindows.push({x:-side*zz,y:upperFloor?upperBottom:base+1.02,w:1.23,h:upperFloor?upperHeight:1.5,r:.08});
    mesh(sideFace,solidPanel(d,h,sideWindows),materials.wall);
    sideWindows.forEach(o=>frame(sideFace,o));
    box(sideFace,d-.2,.46,.12,materials.stone,0,base+.16,-.006);
    const pipeX=-side*(d/2-.25);
    rod(sideFace,[pipeX,base+.1,.10],[pipeX,h-.15,.10],.038,materials.dark);
    for(const yy of[.65,2.2,4.1,h-.5])box(sideFace,.11,.04,.065,materials.woodLight,pipeX,yy,.092,.004);
    if(side===1&&kind==='repair'){
      // A plain mechanical wall clock is an original repair-shop landmark.
      const yy=3.30,xx=-.05;
      const surround=mesh(sideFace,new THREE.CylinderGeometry(.49,.49,.11,24),materials.wood,xx,yy,.10);surround.rotation.x=Math.PI/2;
      const dial=mesh(sideFace,new THREE.CylinderGeometry(.423,.423,.014,24),materials.cream,xx,yy,.165);dial.rotation.x=Math.PI/2;
      for(let i=0;i<12;i++){const a=i*Math.PI/6;rod(sideFace,[xx+Math.sin(a)*.35,yy+Math.cos(a)*.35,.184],[xx+Math.sin(a)*.39,yy+Math.cos(a)*.39,.184],.012);}
      rod(sideFace,[xx,yy,.195],[xx-.17,yy+.17,.195],.014);rod(sideFace,[xx,yy,.20],[xx+.08,yy+.27,.20],.010);
    }
    if(side===-1&&kind==='breakfast'){
      box(sideFace,.50,.63,.16,materials.woodLight,.18,1.67,.09);
      box(sideFace,.35,.28,.025,materials.dark,.18,1.74,.184);
      rod(sideFace,[.18,1.96,.075],[.18,3.38,.075],.018,materials.dark);
    }
  }

  // The rear is visible when walking around either end of the lane. It uses
  // the same real openings and joinery as the two public side elevations.
  const rear=wallGroup(0,-d/2,Math.PI),rearWindows=[];
  for(const xx of[-w*.30,0,w*.30])for(const upstairs of[false,true])rearWindows.push({x:xx,y:upstairs?upperBottom:base+1.05,w:1.34,h:upstairs?upperHeight:1.52});
  mesh(rear,solidPanel(w,h,rearWindows),materials.wall);rearWindows.forEach(o=>frame(rear,o));
  box(rear,w,.42,.11,materials.stone,0,base+.17,-.005);
  box(rear,w+.10,.18,.16,materials.stone,0,courtyard?3.62:3.54,.035);

  // Enterable shop porches: their floor is flush with the existing ground.
  // Interior furniture is behind the rear wall boundary, leaving a clear bay.
  const porchDepth=courtyard?1.62:2.20,back=front-porchDepth;
  mesh(face,ringGeometry(entry.w,entry.h,.18,.15,{radius:.14,arch:entry.arch}),materials.stone,entry.x,entry.y,.003);
  if(!courtyard)mesh(face,ringGeometry(entry.w-.18,entry.h-.16,.065,.13,{radius:.055}),materials.wood,entry.x,entry.y+.06,-.15);
  for(const side of[-1,1])box(root,.10,entry.h,porchDepth,materials.inside,entry.x+side*(entry.w/2+.025),base+entry.h/2,front-porchDepth/2);
  box(root,entry.w,.11,porchDepth,materials.floor,entry.x,base-.065,front-porchDepth/2);
  box(root,entry.w,.14,porchDepth,materials.wood,entry.x,base+entry.h-.025,front-porchDepth/2);
  box(root,entry.w,.07,.30,materials.stone,entry.x,base-.042,front-.07,.015);
  box(root,entry.w,entry.h,.12,materials.recess,entry.x,base+entry.h/2,back-.055);
  if(!courtyard){
    for(const side of[-1,1]){
      const leaf=new THREE.Group();leaf.position.set(entry.x+side*(entry.w/2-.035),base+.05,front-.18);leaf.rotation.y=-side*Math.PI/2;root.add(leaf);
      const width=.86,cx=-side*width/2;
      box(leaf,width,2.62,.075,materials.wood,cx,1.31,0);
      for(const yy of[.48,1.24,2.08])box(leaf,width-.18,yy===2.08?.71:.54,.022,materials.woodLight,cx,yy,.05,.01);
      box(leaf,.036,.22,.04,materials.brass,cx-side*.20,1.22,.072,.007);
      for(const yy of[.28,2.28])box(leaf,.04,.14,.045,materials.dark,-side*.07,yy,.066,.005);
    }
    // Rear shelf gives parallax through the opening, outside the walking bay.
    box(root,entry.w-.3,.105,.24,materials.wood,entry.x,1.22,back+.11);
    for(const side of[-1,1]){
      box(root,.32,.45,.17,materials.woodLight,entry.x+side*.50,1.50,back+.075);
      box(root,.19,.28,.015,materials.cream,entry.x+side*.50,1.50,back+.17,.006);
    }
  }else{
    // A nested courtyard portal retains depth and a patch of blue above the
    // rear shutters. The existing .6m courtyard dais remains unchanged.
    mesh(root,ringGeometry(1.6,2.02,.12,.10,{arch:true}),materials.brick,entry.x,base+.08,back+.09);
    box(root,1.30,1.7,.045,materials.wood,entry.x,base+.9,back+.13);
    for(let i=0;i<7;i++)box(root,.12,1.45,.035,materials.woodLight,entry.x-.54+i*.18,base+.84,back+.16,.005);
  }
  // Main lettering is locally drawn on a shallow original wooden sign; none
  // of the old elevation imagery or reference-work assets are used.
  if(!courtyard){
    box(face,w*.78,.64,.15,materials.wood,0,4.10,.01);
    box(face,w*.78+.13,.095,.23,materials.stone,0,4.49,.015);
    const signMesh=world.label(kind==='repair'?'陆记 · 修理铺':'蔡记 · 热干面',w*.70,.43,'#527268','#f5e9c9',face);signMesh.position.set(0,4.1,.093);
  }else{
    // A stepped, capped li-fen entrance crown is legible from the main route.
    const shape=new THREE.Shape();shape.moveTo(-2.35,6.80);shape.lineTo(2.35,6.80);shape.lineTo(2.35,7.27);shape.lineTo(1.45,7.27);shape.lineTo(1.45,7.69);shape.lineTo(.69,7.69);shape.lineTo(.69,7.99);shape.lineTo(-.69,7.99);shape.lineTo(-.69,7.69);shape.lineTo(-1.45,7.69);shape.lineTo(-1.45,7.27);shape.lineTo(-2.35,7.27);shape.closePath();
    mesh(face,new THREE.ExtrudeGeometry(shape,{depth:.22,bevelEnabled:true,bevelThickness:.035,bevelSize:.035,bevelSegments:1}),materials.brick,0,0,.01);
    for(const [width,yy]of[[4.88,7.30],[3.1,7.73],[1.58,8.04]])box(face,width,.105,.39,materials.stone,0,yy,.125);
    const plaque=world.label('晴川里',2.40,.47,'#d9d6bb','#3f665f',face);plaque.position.set(0,7.04,.372);
    box(face,2.57,.63,.08,materials.stone,0,7.04,.315);
    register(-2.50,2.50,front+.01,front+.40,6.65,8.13,'courtyard-crown',true);
  }

  if(roof){
    const half=d/2+.31,pitch=courtyard?1.35:1.12,slope=Math.hypot(half,pitch),over=.31;
    for(const side of[-1,1]){
      const under=box(root,w+over*2,.11,slope+.05,materials.roofDark,0,h+pitch/2,side*half/2,.018);under.rotation.x=side*Math.atan2(pitch,half);
      const count=Math.ceil((w+over*2)/.31),step=(w+over*2)/count,rows=Math.ceil(slope/.62),length=slope/rows;
      const geo=roofTile(step*1.035,length+.065),axis=new THREE.Vector3(0,-pitch,side*half).normalize(),normal=new THREE.Vector3(0,half,side*pitch).normalize();
      const rotation=new THREE.Matrix4().makeBasis(new THREE.Vector3(side,0,0),normal,axis);
      for(let col=0;col<count;col++)for(let row=0;row<rows;row++){
        const f=(row+.5)/rows,m=mesh(root,geo,(col+row)%5===0?materials.roofLight:materials.roof,-w/2-over+(col+.5)*step,h+pitch*(1-f)+.065,side*half*f);m.quaternion.setFromRotationMatrix(rotation);
      }
      box(root,w+.72,.16,.19,materials.wood,0,h-.015,side*(half-.03));
      for(let xx=-w/2+.18;xx<w/2;xx+=.59)box(root,.075,.14,.37,materials.woodLight,xx,h-.095,side*(d/2+.09),.015);
      register(-w/2-.34,w/2+.34,Math.min(side*(d/2-.05),side*(half+.10)),Math.max(side*(d/2-.05),side*(half+.10)),h-.22,h+.16,'eave',true);
    }
    rod(root,[-w/2-.36,h+pitch+.10,0],[w/2+.36,h+pitch+.10,0],.115,materials.roofDark);
    for(const side of[-1,1]){
      const shape=new THREE.Shape();shape.moveTo(-d/2,h);shape.lineTo(d/2,h);shape.lineTo(0,h+pitch);shape.closePath();
      const wall=new THREE.ExtrudeGeometry(shape,{depth:.18,bevelEnabled:false}),end=wallGroup(side*(w/2-.09),0,side*Math.PI/2);mesh(end,wall,materials.wall);
      for(const zz of[-1,1])rod(root,[side*(w/2+.29),h+pitch+.03,0],[side*(w/2+.29),h+.02,zz*half],.075,materials.stone);
    }
  }

  // Walls and room backstop occupy only a subset of the former solid building
  // envelope. The old public route, POIs and their clearance remain available.
  const before=world.colliders.length;
  if(collide){
    if(courtyard)register(-w/2-.15,w/2+.15,-d/2-.15,d/2+.15,0,h+1.5,'courtyard-body');
    else{
      const left=entry.x-entry.w/2,right=entry.x+entry.w/2;
      register(-w/2-.15,w/2+.15,-d/2-.15,back+.22,0,h+1.5,'porch-backstop');
      register(-w/2-.15,left+.06,back+.22,front+.15,0,h+1.5,'porch-left-wing');
      register(right-.06,w/2+.15,back+.22,front+.15,0,h+1.5,'porch-right-wing');
      register(left,right,back+.15,front+.12,base+entry.h-.05,h+1.5,'porch-lintel',true);
    }
  }
  root.updateMatrixWorld(true);let meshes=0,triangles=0;root.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
  const summary={kind,name:sign,center:{x,z},footprint:{w,d,h},originalAssetsUsed:0,meshCount:meshes,triangleCount:triangles,colliderCount:world.colliders.length-before,porch:{enterable:!courtyard,x:x+entry.x,z:z+front-.8,width:entry.w,depth:porchDepth,floorHeight:base},bounds:new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).toArray()};
  world.nearArchitecture??=[];world.nearArchitecture.push(summary);root.userData.nearArchitecture=summary;return root;
}
