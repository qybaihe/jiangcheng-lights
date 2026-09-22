import * as THREE from 'three';
import {POIS} from './story.js';

const UP=new THREE.Vector3(0,1,0);
const SIGN_ROWS=[['陆记','旧物，慢慢修'],['12号','林家小院'],['过早','热干面 · 豆皮']];

// One small, locally painted lettering atlas is shared by the three wooden
// signs. Their depth, rims, hangers, reverse faces and shadows remain geometry.
function letteringMaterial(){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=1152;
  const ctx=canvas.getContext('2d');
  SIGN_ROWS.forEach(([title,caption],row)=>{
    const y=row*384;ctx.fillStyle='#f1e6c8';ctx.fillRect(0,y,512,384);
    ctx.strokeStyle='#697b5e';ctx.lineWidth=3;ctx.strokeRect(19,y+19,474,346);
    ctx.fillStyle='#345849';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font=`600 ${row===1?123:146}px "Songti SC","STSong","SimSun",serif`;
    ctx.fillText(title,256,y+163,438);
    ctx.fillStyle='#786c4d';ctx.font='32px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText(caption,256,y+292,434);
    ctx.fillStyle='#b97950';ctx.fillRect(237,y+328,38,3);
  });
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;
  return new THREE.MeshStandardMaterial({map,roughness:.93});
}

// Closed, slightly folded fabric. A solid edge is visible in an oblique view;
// no billboards, alpha sorting or additional animation pass are needed.
function clothGeometry(width,height,phase=0){
  const cols=8,rows=6,positions=[],uvs=[],indices=[],sideSize=(cols+1)*(rows+1);
  for(let side=0;side<2;side++)for(let row=0;row<=rows;row++)for(let col=0;col<=cols;col++){
    const u=col/cols,v=row/rows,x=(u-.5)*width;
    const hem=.018*Math.sin(u*Math.PI*2+phase)*v*v;
    const fold=(.024*Math.sin(u*Math.PI*4+phase)+.031*Math.sin(v*Math.PI))*(.25+.75*v);
    positions.push(x,height*(.5-v)+hem,fold+(side===0?.007:-.007));uvs.push(u,1-v);
  }
  for(let side=0;side<2;side++)for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
    const a=side*sideSize+row*(cols+1)+col,b=a+1,c=a+cols+1,d=c+1;
    if(side===0)indices.push(a,c,b,b,c,d);else indices.push(a,b,c,b,d,c);
  }
  const boundary=[];
  for(let col=0;col<=cols;col++)boundary.push(col);
  for(let row=1;row<=rows;row++)boundary.push(row*(cols+1)+cols);
  for(let col=cols-1;col>=0;col--)boundary.push(rows*(cols+1)+col);
  for(let row=rows-1;row>0;row--)boundary.push(row*(cols+1));
  for(let i=0;i<boundary.length;i++){
    const a=boundary[i],b=boundary[(i+1)%boundary.length];indices.push(a,b,a+sideSize,b,b+sideSize,a+sideSize);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

function leafGeometry(){
  const outline=[[0,0,0],[.085,.12,.004],[.105,.25,.009],[0,.43,.043],[-.095,.25,.011],[-.072,.1,.002]];
  const front=[...outline,[0,.21,.049]],vertices=[],uvs=[],indices=[];
  for(let side=0;side<2;side++)for(const [x,y,z] of front){vertices.push(x,y,z-side*.012);uvs.push(x/.24+.5,y/.43);}
  for(let i=0;i<6;i++){
    const j=(i+1)%6;indices.push(6,i,j,13,j+7,i+7,i,i+7,j,j,i+7,j+7);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

/**
 * Three original street-life compositions on the existing shop → courtyard →
 * breakfast route. Call after makeWorld()/streetDetails(), before optimize().
 * Uses existing blocked building margins for all low props; never adds a
 * collider, camera occluder, light, moving actor, texture fetch or media file.
 * Returns a serializable placement and batching summary for scene QA.
 */
export function addRouteArtDirection(world){
  if(world.routeArtDirection)return world.routeArtDirection;
  const root=new THREE.Group();root.name='route-art-direction';world.static.add(root);
  const materials={
    frame:world.mat('#4c625b'),wood:world.mat('#b79b71'),clay:world.mat('#b8734e'),soil:world.mat('#625b43'),
    leaf:world.mat('#779465'),leafLight:world.mat('#a4b37b'),cream:world.mat('#d9c5a7'),teal:world.mat('#879a96'),ochre:world.mat('#d8b574'),
    lettering:letteringMaterial(),
  };
  const sharedLeaf=leafGeometry(),groups=[],skipped=[];
  const collisionCount=world.colliders.length,occluderCount=world.cameraOccluders?.length??0;
  const mesh=(group,geometry,material,position,rotation)=>{
    const result=world.mesh(geometry,material,...position,group);
    if(rotation)result.rotation.set(...rotation);return result;
  };
  const box=(group,size,material,position)=>mesh(group,new THREE.BoxGeometry(...size),material,position);
  const rod=(group,a,b,r,material=materials.frame)=>{
    const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),delta=to.clone().sub(from);
    const result=mesh(group,new THREE.CylinderGeometry(r,r,delta.length(),6),material,from.add(to).multiplyScalar(.5).toArray());
    result.quaternion.setFromUnitVectors(UP,delta.normalize());return result;
  };
  const cluster=(id,description)=>{
    const group=new THREE.Group();group.name=`route-${id}`;root.add(group);
    const poi=POIS.find(p=>p.id===id);groups.push({id,description,poi:{x:poi.x,z:poi.z},placements:[],group});return groups.at(-1);
  };
  const note=(cluster,name,position,extra={})=>cluster.placements.push({name,position,...extra});

  function sign(cluster,row,position,{width=.98,rotation=0,doubleSided=false}={}){
    const g=new THREE.Group();g.position.set(...position);g.rotation.y=rotation;cluster.group.add(g);
    const height=width*.75,depth=.075;
    box(g,[width+.07,height+.07,depth],materials.wood,[0,0,0]);
    for(const x of[-1,1])box(g,[.022,height+.06,.022],materials.frame,[x*(width+.025)/2,0,depth/2+.004]);
    for(const y of[-1,1])box(g,[width+.07,.022,.022],materials.frame,[0,y*(height+.025)/2,depth/2+.004]);
    const geometry=new THREE.PlaneGeometry(width,height),uv=geometry.attributes.uv;
    for(let i=0;i<uv.count;i++)uv.setY(i,(2-row+uv.getY(i))/3);
    mesh(g,geometry,materials.lettering,[0,0,depth/2+.012]).castShadow=false;
    if(doubleSided)mesh(g,geometry,materials.lettering,[0,0,-depth/2-.012],[0,Math.PI,0]).castShadow=false;
    note(cluster,`${SIGN_ROWS[row][0]} · 立体木牌`,position,{width,height,facing:rotation,doubleSided});
  }

  function plant(cluster,position,scale=1,{grounded=true}={}){
    const [x,y,z]=position,radius=.275*scale;
    // Every low leaf and pot stays in the already blocked facade margin. If a
    // future building layout changes, skip the accent instead of obstructing a
    // public route without a matching collider.
    if(grounded&&Array.from({length:12},(_,i)=>i*Math.PI/6).some(a=>world.canWalk(x+Math.cos(a)*radius,z+Math.sin(a)*radius))){
      skipped.push({name:'墙脚盆栽',position,reason:'existing-building-margin-is-walkable'});return;
    }
    const g=new THREE.Group();g.position.set(x,y,z);g.scale.setScalar(scale);cluster.group.add(g);
    mesh(g,new THREE.CylinderGeometry(.18,.135,.255,12),materials.clay,[0,.1275,0]);
    mesh(g,new THREE.CylinderGeometry(.199,.195,.052,12),materials.clay,[0,.244,0]);
    mesh(g,new THREE.CylinderGeometry(.17,.17,.015,12),materials.soil,[0,.275,0]);
    mesh(g,new THREE.CylinderGeometry(.175,.19,.038,12),materials.clay,[0,.019,0]);
    for(let i=0;i<8;i++){
      const angle=i*2.39996,end=[Math.cos(angle)*.082,.43+(i%3)*.037,Math.sin(angle)*.082];
      rod(g,[0,.275,0],end,.008,materials.leaf);
      const leaf=mesh(g,sharedLeaf,i%3?materials.leaf:materials.leafLight,end);
      leaf.rotation.set(.43+(i%3)*.11,angle,-.22);leaf.scale.set(.67,.72+(i%3)*.08,.8);
    }
    note(cluster,grounded?'墙脚陶盆与立体叶片':'窗台小陶盆',position,{radius,grounded,scale});
  }

  function hangingCloth(cluster,position,{width=.64,height=.67,color='cream',phase=0,rotation=Math.PI/2}={}){
    const g=new THREE.Group();g.position.set(...position);g.rotation.y=rotation;cluster.group.add(g);
    mesh(g,clothGeometry(width,height,phase),materials[color],[0,0,0]);
    // The sewn hem and two wooden pegs are restrained physical details.
    rod(g,[-width*.48,-height*.48,.024],[width*.48,-height*.48,.024],.008,materials.cream);
    for(const side of[-1,1])box(g,[.026,.065,.03],materials.wood,[side*width*.36,height/2+.012,.01]);
    note(cluster,color==='ochre'?'暖黄布旗':'晾晒棉巾',position,{width,height,lowestY:position[1]-height/2-.02});
  }

  const shop=cluster('shop','从主巷转向修理铺：高位陆记侧牌、窗台一盆绿，墙脚陶盆收住门边。');
  sign(shop,0,[-7.63,3.08,14.02],{width:1.02,rotation:Math.PI/2,doubleSided:true});
  rod(shop.group,[-7.99,3.61,14.02],[-7.55,3.61,14.02],.022);
  rod(shop.group,[-7.63,3.61,13.66],[-7.63,3.61,14.38],.018);
  for(const z of[13.68,14.36])rod(shop.group,[-7.63,3.61,z],[-7.63,3.49,z],.012);
  plant(shop,[-17.42,.13,15.12],1);
  // The modeled display sill supports the pot at y=1.06; it remains
  // behind the workshop POI and below eye height.
  plant(shop,[-10.20,1.06,14.99],.66,{grounded:false});

  const granny=cluster('granny','台阶仍通畅：12号门牌提示入口，东墙短晾杆成为转角上方的前景。');
  sign(granny,1,[-13.62,2.52,-1.43],{width:.60});
  const rackX=-12.69,rackY=4.71;
  for(const z of[-4.05,-2.08])rod(granny.group,[-12.99,rackY,z],[rackX,rackY,z],.02);
  rod(granny.group,[rackX,rackY,-4.05],[rackX,rackY,-2.08],.016,materials.wood);
  hangingCloth(granny,[rackX,4.34,-3.60],{width:.67,height:.69});
  hangingCloth(granny,[rackX,4.39,-2.65],{width:.59,height:.59,color:'teal',phase:1.1});
  plant(granny,[-22.24,.6,-1.40],.94);

  const chef=cluster('chef','面铺门边保留工作空间：过早木牌与暖布旗形成清楚的街角识别。');
  sign(chef,2,[9.60,2.42,9.23],{width:.62});
  for(const z of[7.38,8.61])rod(chef.group,[8.985,3.68,z],[8.66,3.68,z],.019);
  rod(chef.group,[8.66,3.68,7.38],[8.66,3.68,8.61],.015,materials.wood);
  hangingCloth(chef,[8.66,3.37,7.69],{width:.46,height:.58,color:'ochre',phase:.8});
  hangingCloth(chef,[8.66,3.40,8.26],{width:.43,height:.52,color:'cream',phase:1.8});
  plant(chef,[9.33,.13,9.34],.83);

  root.updateMatrixWorld(true);
  let meshes=0,triangles=0;const batches=new Set();
  root.traverse(object=>{if(!object.isMesh)return;meshes++;triangles+=(object.geometry.index?.count??object.geometry.attributes.position.count)/3;batches.add(`${object.material.uuid}:${object.castShadow}:${object.receiveShadow}`);});
  const summary={
    name:'三处武汉街坊生活构图',clusters:groups.map(({group,...entry})=>({...entry,bounds:new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3()).toArray()})),
    meshCount:meshes,triangleCount:triangles,materialBatchCount:batches.size,textureCount:1,
    addedColliders:world.colliders.length-collisionCount,addedCameraOccluders:(world.cameraOccluders?.length??0)-occluderCount,skipped,
  };
  world.routeArtDirection=summary;return summary;
}
