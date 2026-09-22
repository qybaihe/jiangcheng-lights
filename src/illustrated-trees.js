import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';

const cache = new WeakMap();
const leafColors = ['#63875f', '#80a36d', '#9cba80'].map(c => new THREE.Color(c));
const barkColors = ['#8d907a', '#aaa68a', '#c4bc9a'].map(c => new THREE.Color(c));
let sharedTrunk;

function materials(world) {
  if (cache.has(world)) return cache.get(world);
  const bands = new THREE.DataTexture(new Uint8Array([150, 209, 255]), 3, 1, THREE.RedFormat);
  bands.minFilter = bands.magFilter = THREE.NearestFilter;
  bands.generateMipmaps = false; bands.needsUpdate = true;
  const bark = new THREE.MeshToonMaterial({ color: '#ffffff', vertexColors: true, gradientMap: bands });
  const leaves = new THREE.MeshToonMaterial({ color: '#ffffff', vertexColors: true, gradientMap: bands, side: THREE.DoubleSide, emissive:'#566f43', emissiveIntensity:.18 });
  const edging = new THREE.MeshToonMaterial({ color: '#838f7d', gradientMap: bands });
  bark.name = '梧桐 · 纵向斑驳树皮'; leaves.name = '梧桐 · 成组叶冠'; edging.name = '梧桐 · 齐平树池';
  world.townWind ??= { value: 0 };
  leaves.onBeforeCompile = shader => {
    shader.uniforms.townWindTime = world.townWind;
    shader.vertexShader = 'uniform float townWindTime;\nattribute vec2 treeWind;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float treeSway = sin(townWindTime * 0.83 + treeWind.y);
      transformed.x += treeSway * treeWind.x;
      transformed.z += cos(townWindTime * 0.67 + treeWind.y * 0.81) * treeWind.x * 0.45;
      transformed.y += sin(townWindTime * 1.13 + treeWind.y) * treeWind.x * 0.12;
    `);
  };
  leaves.customProgramCacheKey = () => 'jiangcheng-grouped-plane-tree-v1';
  const set = { bark, leaves, edging };
  cache.set(world, set); return set;
}

function vertexColor(geometry, color) {
  const values = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < values.length; i += 3) { values[i] = color.r; values[i + 1] = color.g; values[i + 2] = color.b; }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(values, 3));
  return geometry;
}

// Swept branches are joined in a distance field once, so forks are genuinely
// one continuous surface, including from below. The frozen result is shared.
function continuousTrunk(limbs) {
  if(sharedTrunk)return sharedTrunk;
  const n=88,mc=new MarchingCubes(n,new THREE.MeshBasicMaterial(),true,false,22000);
  mc.isolation=0;mc.field.fill(-1);
  const extent=[4.8,5.6,4.4],origin=[-2.4,-.3,-2.2],delta=extent.map(v=>v/n);
  const blend=(a,b)=>{const h=Math.max(.075-Math.abs(a-b),0)/.075;return Math.max(a,b)+h*h*.075*.25;};
  for(const [points,radii]of limbs){
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),samples=curve.getPoints(20),field=new Map();
    const radiusAt=t=>{const f=t*(radii.length-1),i=Math.min(radii.length-2,Math.floor(f));return THREE.MathUtils.lerp(radii[i],radii[i+1],f-i);};
    for(let segment=0;segment<samples.length-1;segment++){
      const a=samples[segment],b=samples[segment+1],v=b.clone().sub(a),len=v.lengthSq();
      const ra=radiusAt(segment/20),rb=radiusAt((segment+1)/20),r=Math.max(ra,rb)+.10;
      const lo=[a.x,a.y,a.z].map((c,i)=>Math.max(1,Math.floor((Math.min(c,[b.x,b.y,b.z][i])-r-origin[i])/delta[i])));
      const hi=[a.x,a.y,a.z].map((c,i)=>Math.min(n-2,Math.ceil((Math.max(c,[b.x,b.y,b.z][i])+r-origin[i])/delta[i])));
      for(let iz=lo[2];iz<=hi[2];iz++)for(let iy=lo[1];iy<=hi[1];iy++)for(let ix=lo[0];ix<=hi[0];ix++){
        const px=origin[0]+ix*delta[0]-a.x,py=origin[1]+iy*delta[1]-a.y,pz=origin[2]+iz*delta[2]-a.z;
        const t=THREE.MathUtils.clamp((px*v.x+py*v.y+pz*v.z)/len,0,1);
        const d=THREE.MathUtils.lerp(ra,rb,t)-Math.hypot(px-v.x*t,py-v.y*t,pz-v.z*t),index=ix+iy*n+iz*n*n;
        field.set(index,Math.max(field.get(index)??-1,d));
      }
    }
    for(const [index,value]of field)mc.field[index]=blend(mc.field[index],value);
  }
  mc.update();const g=new THREE.BufferGeometry();
  for(const name of ['position','normal','uv']){const a=mc.geometry.attributes[name];g.setAttribute(name,new THREE.Float32BufferAttribute(a.array.slice(0,mc.count*a.itemSize),a.itemSize));}
  g.scale(extent[0]/2,extent[1]/2,extent[2]/2);g.translate(0,2.5,0);
  const p=g.attributes.position,colors=new Float32Array(p.count*3);
  for(let i=0;i<p.count;i++){
    const a=Math.atan2(p.getZ(i),p.getX(i)),y=p.getY(i);
    const island=Math.sin(a*3+Math.sin(y*1.3)*.6)+Math.sin(a*5-y*.7)*.25;
    const c=barkColors[island<-.3?0:island>.6?2:1];colors[i*3]=c.r;colors[i*3+1]=c.g;colors[i*3+2]=c.b;
  }
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  g.computeBoundingBox();g.computeBoundingSphere();mc.geometry.dispose();mc.material.dispose();sharedTrunk=g;return g;
}

// Irregular, overlapping foliage masses carry the volume. Low-frequency lobes
// make a broad scalloped silhouette rather than hundreds of alpha-cut edges.
function foliageMass(center, size, color, phase, sway) {
  const g = new THREE.SphereGeometry(1, 20, 12), positions = g.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const angle = Math.atan2(z, x), equator = Math.sqrt(Math.max(0, 1 - y * y));
    const broadLobe = 1 + Math.sin(angle * 5 + phase) * .14 * equator + Math.cos(angle * 3 - y * 2 + phase) * .095;
    positions.setXYZ(i, center[0] + x * size[0] * broadLobe,
      center[1] + y * size[1] * (1 + Math.sin(angle * 3 + phase) * .12 * equator),
      center[2] + z * size[2] * broadLobe);
  }
  g.computeVertexNormals(); vertexColor(g, color);
  const wind = new Float32Array(positions.count * 2);
  for (let i = 0; i < positions.count; i++) { wind[i * 2] = sway; wind[i * 2 + 1] = phase; }
  g.setAttribute('treeWind', new THREE.Float32BufferAttribute(wind, 2));
  return g;
}

// A small number of broad, five-lobed plane-tree leaves punctuate the rim.
// These are folded opaque geometry, not repeated transparent leaf textures.
function palmLeaf(center, size, rotation, color, phase) {
  const outline = [[0,-.50],[-.15,-.22],[-.43,-.18],[-.32,.02],[-.59,.16],[-.27,.21],[-.35,.49],[-.12,.32],[0,.72],[.12,.32],[.35,.49],[.27,.21],[.59,.16],[.32,.02],[.43,-.18],[.15,-.22]];
  const p = [0, 0, .045], uv = [.5,.4], indices = [];
  for (const [x, y] of outline) { p.push(x, y, -.025 * Math.abs(x) + Math.max(y, 0) * .035); uv.push(x + .5, y * .7 + .4); }
  for (let i = 0; i < outline.length; i++) indices.push(0, i + 1, (i + 1) % outline.length + 1);
  const g = new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
  g.scale(size,size,size);g.rotateX(rotation[0]);g.rotateY(rotation[1]);g.rotateZ(rotation[2]);g.translate(...center);vertexColor(g,color);
  const wind = new Float32Array(g.attributes.position.count * 2);
  for(let i=0;i<wind.length;i+=2){wind[i]=.027;wind[i+1]=phase;}
  g.setAttribute('treeWind',new THREE.Float32BufferAttribute(wind,2));return g;
}

function merge(parts) {
  const geometry = mergeGeometries(parts, false);
  parts.forEach(g => g.dispose()); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return geometry;
}

/** Original illustrated plane tree. The trunk keeps the previous walk radius;
 * foliage only participates in camera avoidance. Wind changes the colour pass
 * by centimetres, while the stable rest canopy is safe for cached sun shadows.
 */
export function buildIllustratedTree(world, x, z, s = 1) {
  const mat = materials(world), root = new THREE.Group(); root.name = '江城梧桐';
  root.position.set(x, 0, z); root.scale.setScalar(s);
  const seed = Math.abs(Math.round(x * 37 + z * 61)) % 101;
  const yaw = (seed % 17) * .37; root.rotation.y = yaw;
  const limbs = [
    [[[0,.10,0],[.035,1.0,-.025],[-.045,2.1,.035],[.03,3.05,.08],[.23,4.12,-.04],[.38,4.8,.05]],[.255,.222,.181,.125,.07,.025]],
    [[[-.035,2.20,.025],[-.29,2.90,.12],[-.84,3.42,.25],[-1.48,3.97,.37],[-1.85,4.18,.44]],[.15,.132,.094,.054,.015]],
    [[[.015,2.30,.045],[.42,3.04,.10],[1.10,3.67,-.02],[1.79,4.10,-.29]],[.15,.119,.079,.022]],
    [[[.01,2.55,.085],[-.02,3.22,.61],[-.25,3.97,1.31],[-.18,4.42,1.75]],[.125,.10,.058,.015]],
    [[[.08,3.25,.035],[.10,3.72,-.68],[-.30,4.13,-1.32],[-.54,4.47,-1.67]],[.09,.065,.040,.012]],
    [[[-.63,3.23,.22],[-.89,3.94,-.37],[-1.14,4.40,-.78]],[.073,.045,.012]],
    [[[.85,3.47,.015],[1.14,4.13,.51],[1.29,4.51,.80]],[.07,.043,.013]],
  ];
  const trunk = new THREE.Mesh(continuousTrunk(limbs), mat.bark); trunk.name = '梧桐 · 自然分叉'; trunk.castShadow = trunk.receiveShadow = true; root.add(trunk);

  const masses = [], configurations = [
    [-1.68,4.08,.27,.93,.70,.90,0], [1.67,4.15,-.22,.99,.76,.85,1],
    [-.14,4.26,1.58,1.03,.77,.91,0], [-.42,4.36,-1.54,1.00,.72,.85,1],
    [-1.19,4.57,-.93,1.01,.77,.97,1], [1.17,4.65,.94,1.11,.78,1.03,1],
    [.96,4.88,-1.01,.98,.76,1.02,1], [-1.05,4.94,.89,.95,.72,1.02,1],
    [-.53,5.28,-.11,1.17,.83,1.08,2], [.76,5.30,.06,1.04,.78,1.09,2],
    [-.19,5.09,1.02,.90,.64,.95,2],
  ];
  configurations.forEach(([cx,cy,cz,sx,sy,sz,tone],i)=>masses.push(foliageMass([cx,cy,cz],[sx,sy,sz],leafColors[tone],seed*.37+i*1.43,.015+.006*(cy-3.7))));
  for(let i=0;i<18;i++) {
    const group=Math.floor(i/3),[cx,cy,cz,sx,sy,sz]=configurations[group];
    const a=Math.atan2(cz,cx)+(i%3-1)*.39;
    const y=-.18-(i%3)*.13,equator=Math.sqrt(1-y*y),phase=seed*.37+group*1.43;
    const lobe=1+Math.sin(a*5+phase)*.14*equator+Math.cos(a*3-y*2+phase)*.095;
    const at=[cx+Math.cos(a)*(sx*equator*lobe+.055),cy+y*sy,cz+Math.sin(a)*(sz*equator*lobe+.055)];
    masses.push(palmLeaf(at,.31+(i%3)*.05,[-.27+(i%3)*.23,-a+Math.PI/2,.23*Math.sin(i)],leafColors[i%3],seed*.37+i*.73));
  }
  const crown = new THREE.Mesh(merge(masses), mat.leaves);crown.name='梧桐 · 十一个相连叶团';crown.castShadow=true;crown.receiveShadow=false;
  // Bounds include the small wind displacement without CPU geometry updates.
  crown.geometry.boundingBox.expandByScalar(.045);crown.geometry.boundingSphere.radius+=.045;root.add(crown);
  const surround = new THREE.Mesh(new THREE.RingGeometry(.28,.80,32),mat.edging);surround.rotation.x=-Math.PI/2;surround.position.y=.132/s;surround.receiveShadow=true;root.add(surround);
  world.static.add(root);root.updateWorldMatrix(true,true);
  const bounds = new THREE.Box3().setFromObject(crown,true).expandByScalar(.045*s);
  world.colliders.push({x:x-.27*s,X:x+.27*s,z:z-.27*s,Z:z+.27*s,height:3.8*s,kind:'tree-trunk'});
  world.cameraOccluders?.push(
    {x:bounds.min.x,X:bounds.max.x,z:bounds.min.z,Z:bounds.max.z,y:bounds.min.y,height:bounds.max.y,kind:'tree-crown',solid:false},
    {x:x-.3*s,X:x+.3*s,z:z-.3*s,Z:z+.3*s,y:0,height:3.8*s,kind:'tree-trunk'},
  );
  root.userData.illustratedTree = {leafMasses:configurations.length,edgeLeaves:18,triangles:((trunk.geometry.index?.count||trunk.geometry.attributes.position.count)+crown.geometry.index.count+surround.geometry.index.count)/3,windMaximum:.045*s};
  return root;
}
