import * as THREE from 'three';
import {WUHAN_BUILDINGS,WUHAN_ROADS,WUHAN_DISTRICT_STOPS,WUHAN_DRIVE_LOOP,WUHAN_PARKING,PLAYABLE_BOUNDS,CORE_BOUNDS} from './wuhan-district-layout.js';

/** A walkable eastward extension, not backdrop geometry. Every solid prop uses
 * the same boxes as foot routing, bicycle/car sweeps and camera avoidance.
 * All architecture joins the world's immutable batches/shadow cache.
 */
export function addWuhanDistrict(world){
 if(world.wuhanDistrict)return world.wuhanDistrict;
 const before={colliders:world.colliders.length,occluders:world.cameraOccluders.length};
 const root=new THREE.Group();root.name='武汉拾光 · 燕归里—桥影下—江风渡口';world.static.add(root);
 const box=(w,h,d,c,x,y,z,solid=false)=>{
  const m=world.box(w,h,d,c,x,y,z,root);if(solid)world.colliders.push({x:x-w/2,X:x+w/2,z:z-d/2,Z:z+d/2,y:y-h/2,height:y+h/2,kind:'wuhan-street-prop'});return m;
 };
 const beam=(a,b,r,c)=>world.beam(a,b,r,c,root);
 const label=(text,w,h,x,y,z,bg='#416c61',fg='#f5e2ba')=>{const m=world.label(text,w,h,bg,fg,root);m.position.set(x,y,z);return m;};
 const floor=.13;
 // Opaque one-metre tessellation bends with the existing camera-relative world.
 // Its surveyed road edges are used by the map, not inferred from textures.
 const bands=new THREE.DataTexture(new Uint8Array([118,177,230,255]),4,1,THREE.RedFormat);bands.minFilter=bands.magFilter=THREE.NearestFilter;bands.generateMipmaps=false;bands.needsUpdate=true;
 const groundMat=new THREE.MeshToonMaterial({vertexColors:true,gradientMap:bands});groundMat.name='武汉东街 · 细青石与暖米色门前地';groundMat.userData.illustration='preserve';
 let groundTriangles=0;
 const roadColors={road:new THREE.Color('#6a8880'),lane:new THREE.Color('#79918a'),plaza:new THREE.Color('#b9bea5'),apron:new THREE.Color('#9daa98')};
 for(let z0=-25.5;z0<33.5;z0+=8)for(let x0=39.5;x0<106.5;x0+=8){
  const x1=Math.min(106.5,x0+8),z1=Math.min(33.5,z0+8),nx=Math.ceil(x1-x0),nz=Math.ceil(z1-z0),positions=[],rgb=[],indices=[];
  for(let iz=0;iz<nz;iz++)for(let ix=0;ix<nx;ix++){
   const xa=x0+(x1-x0)*ix/nx,xb=x0+(x1-x0)*(ix+1)/nx,za=z0+(z1-z0)*iz/nz,zb=z0+(z1-z0)*(iz+1)/nz,cx=(xa+xb)/2,cz=(za+zb)/2;
   const road=WUHAN_ROADS.find(r=>cx>=r.minX&&cx<=r.maxX&&cz>=r.minZ&&cz<=r.maxZ),color=roadColors[road?.kind||'apron'],n=positions.length/3;
   for(const [x,z]of[[xa,za],[xa,zb],[xb,zb],[xb,za]]){
    const shade=1+.026*Math.sin(x*.39+z*.27)+.014*Math.sin(z*.68-x*.21);positions.push(x,floor+.006,z);rgb.push(color.r*shade,color.g*shade,color.b*shade);
   }
   indices.push(n,n+1,n+2,n,n+2,n+3);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(rgb,3));g.setIndex(indices);g.computeVertexNormals();
  const m=new THREE.Mesh(g,groundMat);m.receiveShadow=true;m.castShadow=false;root.add(m);groundTriangles+=indices.length/3;
 }
 // Thin joints remain quiet and subordinate to the painterly road. The loops
 // deliberately have no metre-high kerbs or stairs a vehicle would clip into.
 for(const z of[-16,19,27])for(let x=40;x<104;x+=2.2){const m=box(1.83,.014,.075,'#a3b09c',x,.145,z);m.castShadow=false;}
 for(const x of[95,103])for(let z=-18;z<23;z+=2.2){const m=box(.075,.014,1.83,'#a3b09c',x,.145,z);m.castShadow=false;}
 for(const b of WUHAN_BUILDINGS)world.building({...b});
 // Lifen threshold: paired door leaves, cloth hooks and a mail slot, all on
 // the facade side, leaving the 8m south road and memory-reading apron clear.
 box(2.1,2.75,.12,'#477469',46,1.65,13.62);box(.04,2.56,.025,'#254f4a',46,1.68,13.694);
 for(const x of[45.7,46.3]){box(.045,.22,.08,'#d7b779',x,1.48,13.72);}
 label('燕归里 · 十二号',1.32,.29,46,3.30,13.71);
 for(let i=0;i<4;i++)box(.06,.085,.12,'#a78959',47.4+i*.31,1.3,13.73);
 box(.85,.57,.15,'#647f69',49,1.39,13.74);label('街坊来信',.66,.17,49,1.48,13.826);
 // A real communal drying line speaks to lifen courtyards without blocking
 // traffic or adding expensive simulated cloth/dynamic shadow invalidation.
 beam([41,4.65,16],[50,4.52,16],.012,'#74836a');
 for(let i=0;i<4;i++){const cloth=box(.82,.90,.025,['#e7d9ac','#9fba9c','#d2a589','#b7c6b0'][i],42+i*1.85,4.0,16);cloth.rotation.z=(i%2?1:-1)*.045;}
 // Morning-food frontage: brass pan, square doupi portions, mianwo rings,
 // rice-wine jar and bamboo trays instead of another generic shop sign.
 world.canopy(62,16.55,8,1.0,'#657b62',3.15);
 box(5,.9,.84,'#a98759',62,.58,16.75,true);box(5.14,.075,.96,'#dbc697',62,1.068,16.75);
 for(const x of[60.3,61.0]){
  const pan=world.cyl(.30,.27,.055,'#826f49',x,1.14,16.75,root,24);pan.castShadow=false;
  for(let i=0;i<4;i++)box(.14,.035,.15,'#ddb960',x-.09+(i%2)*.18,1.186,16.65+Math.floor(i/2)*.19);
 }
 for(let i=0;i<3;i++){const ring=new THREE.Mesh(new THREE.TorusGeometry(.13,.047,7,16),world.mat('#d3a662'));ring.rotation.x=Math.PI/2;ring.position.set(62.0+i*.32,1.145,16.72);root.add(ring);}
 world.cyl(.28,.23,.45,'#c7c4a4',63.5,1.31,16.76,root,20);world.cyl(.20,.20,.045,'#8da18b',63.5,1.56,16.76,root,20);
 label('豆皮 · 面窝 · 米酒',3.0,.32,62,2.47,17.05,'#e8d6ae','#665b41');
 // The bridge is an artistic echo of Wuhan's steel truss, not a fake claim
 // that this short urban crossing is the real Yangtze River Bridge.
 const bridge={x:76,minZ:-30,maxZ:36,width:10,clearance:6.35,deck:6.65,ridge:10.9};
 box(10,.30,66,'#638478',76,bridge.deck,-3);
 world.cameraOccluders.push({x:71,X:81,z:-30,Z:36,y:bridge.clearance,height:6.8,kind:'wuhan-bridge-deck'});
 for(const x of[71.4,80.6]){
  beam([x,7.05,-30],[x,7.05,36],.085,'#3e655c');beam([x,10.8,-30],[x,10.8,36],.085,'#3e655c');
  for(let z=-30;z<36;z+=6){
   beam([x,7.05,z],[x,10.8,z+3],.083,'#557e6b');beam([x,10.8,z+3],[x,7.05,z+6],.083,'#557e6b');
   beam([x,7.05,z],[x,10.8,z],.052,'#7d9e83');
   for(const y of[7.1,10.72])box(.19,.21,.30,'#365b52',x,y,z);
  }
 }
 for(const z of[-9,9,30]){
  // Piers sit well away from the three transverse street centre-lines.
  for(const x of[71.3,80.7]){box(1.10,6.10,1.6,'#b2bda7',x,3.18,z,true);box(1.52,.32,1.92,'#8d9f8e',x,.29,z,true);}
  box(10.5,.32,1.83,'#81998c',76,6.16,z);
  world.cameraOccluders.push({x:70.75,X:81.25,z:z-.915,Z:z+.915,y:6,height:6.32,kind:'wuhan-bridge-crossbeam'});
 }
 label('桥影下 · 慢行',3.4,.54,76,4.8,30.83);
 // Rails and a continuous embankment close the river edge. There is no route
 // into water; the playable ferry experience remains at the original pier.
 box(67,.5,1.4,'#c0c5a8',73,.05,-25.7);
 for(let x=40.5;x<107;x+=2.8){
  box(.14,1.07,.14,'#728e7e',x,.73,-24.72,true);
  beam([x,1.21,-24.72],[Math.min(106.5,x+2.8),1.21,-24.72],.038,'#6e8d7d');
  beam([x,.71,-24.72],[Math.min(106.5,x+2.8),.71,-24.72],.025,'#93aa8e');
 }
 world.colliders.push({x:39.5,X:106.5,z:-24.85,Z:-24.60,y:.13,height:1.25,kind:'wuhan-river-rail'});
 // Small ticket-window details let the memory be found from the public apron.
 box(1.55,1.25,.08,'#527c72',89,1.95,-5.44);box(1.58,.09,.3,'#d7c199',89,1.29,-5.32);
 label('旧船票 · 回家路',2.6,.43,89,3.26,-5.43);
 for(let i=0;i<7;i++)box(.035,1.0,.055,'#d2d4b6',88.4+i*.20,1.97,-5.38);
 // South-facing information board and a folded map beside the reading stop.
 const ticket=label('江风渡口 · 旧时的往返',3.1,.54,96,2.31,-16.82);ticket.rotation.y=0;
 for(const x of[94.55,97.45])box(.075,2.23,.075,'#668775',x,1.24,-16.85,true);
 const slip=label('一张船票，两岸人家',1.90,.39,96,1.63,-16.83,'#efe0bc','#58684f');slip.rotation.y=0;
 // Two market stalls: bamboo baskets, vegetables and a patched canvas roof.
 for(const [x,z,c]of[[87,3,'#bdaa78'],[87,12,'#91aa83']]){
  box(4.4,.82,1.30,'#9b815a',x,.54,z,true);box(4.54,.08,1.43,'#d2bd8b',x,.99,z);
  for(const dx of[-2.12,2.12])box(.06,2.65,.06,'#6e8268',x+dx,1.46,z+.51,true);
  const roof=box(4.9,.065,2.0,c,x,2.92,z);roof.rotation.x=.06;
  world.cameraOccluders.push({x:x-2.45,X:x+2.45,z:z-1,Z:z+1,y:2.80,height:3.04,kind:'wuhan-market-awning'});
  for(let i=0;i<4;i++){
   world.cyl(.35,.27,.18,'#bba576',x-1.56+i*1.03,1.13,z,root,12);
   for(let j=0;j<3;j++)world.mesh(new THREE.SphereGeometry(.13,8,6),world.mat(z===3?'#8aaf6e':'#dba778'),x-1.69+i*1.03+j*.14,1.26,z+(j%2)*.12,root,false);
  }
 }
 label('顺路捎一程',2.9,.43,87,2.38,13.05,'#ead9ad','#616847');
 // Memory photo frame lives at the bridge square, outside every chassis path.
 for(const x of[74.8,77.2])box(.065,1.8,.065,'#6b8971',x,1.04,15.65,true);
 box(2.5,1.18,.13,'#bca473',76,1.80,15.65);label('桥上走火车，桥下有人等',2.27,.36,76,2.10,15.72,'#e9dab8','#58705e');
 const paper=label('一张没拍全的合影',1.92,.54,76,1.57,15.725,'#d3ccb0','#77856a');paper.rotation.z=-.018;
 // Each marked parking bay has room for a vehicle footprint and clear side
 // exits. Parking is optional, not a teleport/quest requirement.
 for(const p of WUHAN_PARKING){
  for(const side of[-1,1]){const line=box(.055,.012,p.depth,'#ded7ac',p.x+side*p.width/2,.149,p.z);line.castShadow=false;}
  const line=box(p.width,.012,.055,'#ded7ac',p.x,.149,p.z+p.depth/2);line.castShadow=false;
 }
 // A rail fence and planter verge make the spatial limit visible instead of
 // leaving a sudden invisible barrier at the edge of a giant grass slab.
 for(let z=-22;z<31;z+=3.0){box(.10,1.1,.10,'#7f997e',105.5,.68,z,true);beam([105.5,1.15,z],[105.5,1.15,Math.min(31,z+3)],.031,'#839d80');}
 for(let x=39;x<105;x+=3.4){box(.09,.88,.09,'#829c7c',x,.57,31.5,true);beam([x,.95,31.5],[Math.min(105,x+3.4),.95,31.5],.027,'#8ca180');}
 for(const [x,z,s]of[[41,-15,1.04],[54,-13,.88],[68,16,.92],[82,-15,.95],[93,14,.93],[103,16,.86]])world.tree(x,z,s);
 for(const [x,z]of[[40,28],[68,-15],[83,19],[103,-15]])world.lamp(x,z);
 for(const [x,z]of[[51,17],[57,17],[92,16],[103,-3]])world.pot(x,z,.72);
 // Physical direction boards orient the driver before the fork, without any
 // floating labels or real-time spotlights.
 label('← 晴川老巷    江风渡口 →',5.1,.58,53,3.8,30.5);
 label('← 里分街    轮渡旧址 →',4.9,.58,95,3.8,26.1);
 for(const x of[50.8,55.2])box(.075,3.70,.075,'#6b846d',x,1.97,30.5,true);
 for(const x of[92.9,97.1])box(.075,3.70,.075,'#6b846d',x,1.97,26.1,true);
 // The marks are actual nearby objects (subtle brass plaques), not a screen
 // overlay. Collection/read state is intentionally owned by the main UI.
 for(const s of WUHAN_DISTRICT_STOPS){
  const plate=box(.38,.025,.30,'#d5b86f',s.x,.165,s.z);plate.castShadow=false;
 }
 world.wuhanDistrict={version:1,title:'武汉拾光 · 东街环线',fictional:true,bounds:{...PLAYABLE_BOUNDS},coreBounds:{...CORE_BOUNDS},
  newAreaSquareMetres:(PLAYABLE_BOUNDS.maxX-CORE_BOUNDS.maxX)*(PLAYABLE_BOUNDS.maxZ-PLAYABLE_BOUNDS.minZ),
  oldAreaSquareMetres:(CORE_BOUNDS.maxX-CORE_BOUNDS.minX)*(CORE_BOUNDS.maxZ-CORE_BOUNDS.minZ),
  preservedCoreCoordinates:true,buildingCount:WUHAN_BUILDINGS.length,addedColliders:world.colliders.length-before.colliders,addedCameraOccluders:world.cameraOccluders.length-before.occluders,
  bridgeClearance:6,groundTriangles,groundHeight:floor,roads:WUHAN_ROADS,stops:WUHAN_DISTRICT_STOPS,driveLoop:WUHAN_DRIVE_LOOP,parking:WUHAN_PARKING,
  addedRealtimeLights:0,dynamicShadowInvalidation:false};
 return world.wuhanDistrict;
}
