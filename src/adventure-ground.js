import * as THREE from 'three';
import { ADVENTURE_LAYOUT } from './adventure-layout.js';
import { STREET_COMPOSITION_MAP } from './street-composition.js';

const PALETTE=Object.freeze({street:'#5b7a75',alley:'#69837a',apron:'#96a69a',stone:'#b4bfb0',grass:'#558365',wear:'#748d81',wood:'#6f8d7d',outer:'#56755f',crack:'#506a62',repair:'#82978a',repairDark:'#6f887d',repairRim:'#5c776e',iron:'#657d72',ironEdge:'#82978a',ironSlot:'#3f5b52'});
const colors=Object.fromEntries(Object.entries(PALETTE).map(([k,v])=>[k,new THREE.Color(v)]));
const CROSS=[7,23,-9];
const EPS=.006;

function surfaceKind(x,z){
  const crossing=CROSS.some(c=>Math.abs(z-c)<1.8);
  const river=z>=-23.8&&z<=-17.4;
  if(Math.abs(x)<4.26||crossing||river)return 'street';
  if(Math.abs(x)<4.54&&!CROSS.some(c=>Math.abs(z-c)<2.15))return 'stone';
  if((x>23.7&&x<26.55)||(x<-23.6&&x>-25.8))return 'alley';
  if(x>-22.9&&x<-20&&z>5&&z<15.3)return 'alley';
  if(x>6.1&&x<8.7&&z>5&&z<10.5)return 'alley';
  if(Math.abs(x)>37.4||z>31.4)return 'grass';
  return 'apron';
}

// Cell boundaries follow the actual route edges. The one-metre subdivisions
// provide enough vertices for the camera-relative curvature applied later.
function axis(lo,hi,step,breaks=[]){
  const values=[lo,hi,...breaks.filter(v=>v>lo&&v<hi)];
  const n=Math.ceil((hi-lo)/step);for(let i=1;i<n;i++)values.push(lo+(hi-lo)*i/n);
  return [...new Set(values.map(v=>Number(v.toFixed(7))))].sort((a,b)=>a-b);
}

/**
 * Real, opaque, shadow-receiving ground. No road centre lines, image planes,
 * colliders, terrain changes, texture fetches or real-time lights are added.
 * Call after scenery construction and before World.optimize().
 */
export function addAdventureGround(world){
  if(world.adventureGround)return world.adventureGround;
  const root=new THREE.Group();root.name='青石步行路与草绿街沿';
  const removed=[];
  // The old giant paving boxes contain only corner vertices. Remove their
  // visible surfaces instead of overlaying two differently curved planes.
  // Their footprint never participated in navigation or collision.
  world.static.updateMatrixWorld(true);
  world.static.traverse(mesh=>{
    const p=mesh.geometry?.parameters;
    if(!mesh.isMesh||mesh.material?.userData?.surface!=='paving'||!p||p.height>=.25||p.width<9||p.depth<4)return;
    const at=new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld);
    if(at.y>.15)return;
    removed.push(mesh);
  });
  const retired=removed.map(m=>({size:[m.geometry.parameters.width,m.geometry.parameters.height,m.geometry.parameters.depth],position:m.position.toArray()}));
  removed.forEach(m=>m.removeFromParent());
  world.static.add(root);
  const gradient=new THREE.DataTexture(new Uint8Array([88,147,209,250]),4,1,THREE.RedFormat);
  gradient.minFilter=gradient.magFilter=THREE.NearestFilter;gradient.generateMipmaps=false;gradient.needsUpdate=true;
  const material=new THREE.MeshToonMaterial({color:'#ffffff',vertexColors:true,gradientMap:gradient});
  material.name='Hand-painted teal walking stone';material.userData.illustration='preserve';
  let meshCount=0,triangleCount=0,vertices=0;
  const patches=[],details=[];

  function detailMesh(name,geometry,kind,position=[0,0,0]){
    const rgb=[],ink=colors[kind];for(let i=0;i<geometry.attributes.position.count;i++)rgb.push(ink.r,ink.g,ink.b);
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(rgb,3));
    const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.position.set(...position);mesh.castShadow=false;mesh.receiveShadow=true;root.add(mesh);
    meshCount++;triangleCount+=(geometry.index?.count??geometry.attributes.position.count)/3;vertices+=geometry.attributes.position.count;return mesh;
  }
  function stoneShape(x,z,outline,kind,lift){
    const positions=[0,world.heightAt(x,z)+lift,0],uvs=[.5,.5],indices=[];
    for(const [dx,dz]of outline){positions.push(dx,world.heightAt(x+dx,z+dz)+lift,dz);uvs.push(dx+.5,dz+.5);}
    for(let i=0;i<outline.length;i++)indices.push(0,1+(i+1)%outline.length,1+i);
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();
    detailMesh('零星修补青石',g,kind,[x,0,z]);
  }
  function crack(points,width=.019){
    // A narrow irregular ribbon; each segment remains under a metre, so the
    // crack follows the same curved ground instead of floating above it.
    const positions=[],uvs=[],indices=[];
    for(let i=1;i<points.length;i++){
      const [ax,az]=points[i-1],[bx,bz]=points[i],d=Math.hypot(bx-ax,bz-az),nx=-(bz-az)/d*width,nz=(bx-ax)/d*width;
      const n=positions.length/3;
      for(const [x,z]of[[ax-nx,az-nz],[ax+nx,az+nz],[bx+nx,bz+nz],[bx-nx,bz-nz]]){positions.push(x,world.heightAt(x,z)+EPS+.004,z);uvs.push(x*.1,z*.1);}
      indices.push(n,n+1,n+2,n,n+2,n+3);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();detailMesh('旧青石细裂纹',g,'crack');
  }

  function grid(name,b,{step=1,height=()=>.13+EPS,kind=surfaceKind,xBreaks=[],zBreaks=[],variation=.045}={}){
    // Small spatial chunks stay compatible with the world's static batching.
    for(let z0=b.minZ;z0<b.maxZ-1e-7;z0+=8)for(let x0=b.minX;x0<b.maxX-1e-7;x0+=8){
      const x1=Math.min(b.maxX,x0+8),z1=Math.min(b.maxZ,z0+8),cx=(x0+x1)/2,cz=(z0+z1)/2;
      const xs=axis(x0,x1,step,xBreaks),zs=axis(z0,z1,step,zBreaks),positions=[],normals=[],uvs=[],rgb=[],indices=[];
      for(let row=0;row<zs.length-1;row++)for(let col=0;col<xs.length-1;col++){
        const xa=xs[col],xb=xs[col+1],za=zs[row],zb=zs[row+1];
        const ink=colors[typeof kind==='function'?kind((xa+xb)/2,(za+zb)/2):kind];
        const start=positions.length/3;
        for(const [x,z]of[[xa,za],[xa,zb],[xb,zb],[xb,za]]){
          const y=height(x,z);
          // Broad low-contrast hand-painted patches; no repeating white grout.
          const shade=1+variation*(Math.sin(x*.37+z*.23)*.55+Math.sin(z*.61-x*.15)*.30);
          positions.push(x-cx,y,z-cz);normals.push(0,1,0);uvs.push(x*.1,z*.1);
          rgb.push(ink.r*shade,ink.g*shade,ink.b*shade);
        }
        indices.push(start,start+1,start+2,start,start+2,start+3);
      }
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
      geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(rgb,3));geometry.setIndex(indices);
      geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
      const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.position.set(cx,0,cz);mesh.castShadow=false;mesh.receiveShadow=true;root.add(mesh);
      meshCount++;triangleCount+=indices.length/3;vertices+=positions.length/3;
    }
    patches.push({name,bounds:{...b},maxCellWidth:step});
  }

  const xBreaks=[-37.4,-25.8,-23.6,-22.9,-20,-4.54,-4.26,4.26,4.54,6.1,8.7,23.7,26.55,37.4];
  const zBreaks=[-23.8,-17.4,5,10.5,15.3,31.4,...CROSS.flatMap(z=>[z-2.15,z-1.8,z+1.8,z+2.15])];
  grid('主巷青石与街坊门前铺地',{minX:-39.5,maxX:39.5,minZ:-25.5,maxZ:33.5},{xBreaks,zBreaks});
  // Beyond the playable streets, muted greenery replaces the old beige slab.
  // These distant strips need fewer vertices but never cross the river.
  for(const b of[
    {minX:-109,maxX:-39.5,minZ:-25.5,maxZ:33.5},
    {minX:39.5,maxX:109,minZ:-25.5,maxZ:33.5},
    {minX:-109,maxX:109,minZ:33.5,maxZ:123.5},
  ])grid('街区外缘草地',b,{step:2,height:()=>-.006,kind:'outer',variation:.035});

  // Overlay each surveyed raised surface separately. A giant interpolated
  // height grid would invent slanted edges across the courtyard and terrace.
  grid('小院青灰石地',{minX:-23.48,maxX:-10.52,minZ:-1.98,maxZ:4.98},{height:()=>.6+EPS,kind:'apron',step:.9});
  const courtyardRamp=STREET_COMPOSITION_MAP.find(r=>r.id==='courtyard-ramp').bounds;
  grid('工具巷随坡青石',courtyardRamp,{height:(x,z)=>world.heightAt(x,z)+EPS,kind:'alley',step:.8});
  const {ramp,platform}=ADVENTURE_LAYOUT;
  grid('听风台随坡旧木铺面',ramp,{height:(x,z)=>world.heightAt(x,z)+EPS,kind:'wood',step:.8});
  grid('听风台灰绿木台面',platform,{height:()=>platform.height+EPS,kind:'wood',step:.8});

  // Quiet grass along wall-side verges, away from the three cross-street mouths.
  const verges=[
    {minX:4.90,maxX:5.48,minZ:15.8,maxZ:20.5},
    {minX:-5.50,maxX:-4.92,minZ:-17,maxZ:-11.5},
    {minX:5.0,maxX:5.53,minZ:-5.2,maxZ:-3},
    {minX:-36.8,maxX:-35.55,minZ:-1.5,maxZ:4.5},
    {minX:35.7,maxX:37.1,minZ:-10.8,maxZ:-3.6},
  ];
  for(const b of verges)grid('墙根草绿留边',b,{height:()=>.13+EPS+.001,kind:'grass',step:.7});
  // Sparse shallow chips sit inside the stone edge, never across the walkway
  // like traffic paint. Their y offset stays below feet and contact shadows.
  for(const side of[-1,1])for(let i=0;i<12;i++){
    const z=-20.6+i*4.03+(side>0?.8:0);if(CROSS.some(c=>Math.abs(z-c)<2.4))continue;
    const x=side*(4.10+(i%3)*.032),width=.035+(i%3)*.018;
    grid('青石路沿磨损',{minX:x-width,maxX:x+width,minZ:z,maxZ:z+.24+(i%4)*.13},{height:()=>.13+EPS+.002,kind:'wear',step:.65,variation:.02});
  }

  // Small repairs are placed as remembered street wear, never a tiled grid.
  // Their stone borders and broken corners remain geometry at walking range.
  const repairs=[[-1.65,24.4],[1.7,27.4],[2.7,18.1],[-2.8,13.2],[.3,9.1],[-2.2,1.6],[2.1,-5.4],[-1.1,-13.1],[-8.4,23.2],[-16.8,22.4],[11.6,7.25],[20.8,-9.3],[-21.4,12.6],[7.5,8.2],[25.0,-7.2],[14.7,-20.8],[28.4,-20.9]];
  repairs.forEach(([x,z],i)=>{
    const sx=.55+(i%3)*.11,sz=.37+(i%4)*.04;
    const outline=[[-sx*.5,-sz*.45],[-sx*.10,-sz*.57],[sx*.45,-sz*.36],[sx*.52,sz*.23],[sx*.22,sz*.49],[-sx*.48,sz*.40]];
    stoneShape(x,z,outline.map(([a,b])=>[a*1.035,b*1.05]),'repairRim',EPS+.002);
    stoneShape(x,z,outline,i%3?'repairDark':'repair',EPS+.003);
    if(i%4===0)crack([[x-sx*.19,z-sz*.44],[x-sx*.04,z-sz*.07],[x+sx*.11,z+sz*.15]],.010);
    details.push({type:'repair-stone',x,z,width:sx,depth:sz});
  });

  for(const [i,[x,z]]of[[-2.7,26.5],[2.45,23.8],[-1.7,17.2],[2.9,11.4],[-2.8,4.6],[1.7,-2.6],[-2.4,-16.8],[-13.8,23.5],[13.1,7.65],[24.6,-12.0],[18.8,-20.4]].entries()){
    const mirror=i%2?1:-1;
    const p=[[x,z],[x+.27*mirror,z+.21],[x+.40*mirror,z+.55],[x+.72*mirror,z+.78],[x+.67*mirror,z+1.02]];
    crack(p,.013+(i%3)*.003);
    crack([p[2],[x+.15*mirror,z+.72],[x+.06*mirror,z+.88]],.010);
    details.push({type:'hairline-crack',x,z,length:1.05});
  }

  // Flush rainwater covers have a recessed bed, a real metal frame and short
  // transverse slats. Their top stays beneath the existing contact shadows.
  for(const [x,z]of[[-3.66,25.1],[3.7,14.2],[-3.7,3.3],[3.7,-12.9],[-21.43,14.15],[7.48,10.85],[24.9,-5.4],[-11.8,22.9],[12.5,-20.8]]){
    const y=world.heightAt(x,z);
    detailMesh('旧式雨水口石框',new THREE.BoxGeometry(.70,.008,1.06),'ironEdge',[x,y+.007,z]);
    detailMesh('雨水口内凹铁底',new THREE.BoxGeometry(.59,.002,.92),'ironSlot',[x,y+.011,z]);
    for(let i=0;i<8;i++)detailMesh('雨水口横向铁栅',new THREE.BoxGeometry(.58,.004,.041),'iron',[x,y+.013,z-.397+i*.113]);
    for(const dx of[-.314,.314])detailMesh('雨水口细铁边',new THREE.BoxGeometry(.033,.004,.93),'iron',[x+dx,y+.012,z]);
    details.push({type:'flush-rainwater-cover',x,z,width:.70,depth:1.06,top:y+.015});
  }

  const summary={name:'青绿天空下的武汉青石步行街',palette:PALETTE,meshCount,triangleCount,vertices,materialCount:1,
    addedColliders:0,addedCameraOccluders:0,addedLights:0,dynamicObjects:0,retiredPavingSlabs:retired,patches,details,
    raisedSurfacesFollowNavigation:true,maxPlayableCellWidth:1,surfaceOffset:EPS};
  world.adventureGround=summary;return summary;
}
