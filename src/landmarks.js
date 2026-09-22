import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { surface } from './architecture.js';

// The landmarks are a compressed stage set, not a literal city map. Their
// established coordinates and river-side footprints remain unchanged.
const palettes = new WeakMap();
function limestone(color) {
 const material = surface('plaster', [1, 1], color);
 // Use the intact plaster area; the atlas's exposed brick is appropriate for
 // alley walls, but would falsely weather every carved stone moulding.
 for (const key of ['map', 'normalMap', 'roughnessMap']) {
  material[key] = material[key].clone();
  material[key].repeat.set(1, .60);
  material[key].offset.y = .38;
  material[key].needsUpdate = true;
 }
 return material;
}
function patinatedMetal(color) {
 const material = surface('iron', [1, 1], color, .78);
 material.map = null;
 material.metalness = .18;
 return material;
}
function palette(world) {
 if (palettes.has(world)) return palettes.get(world);
 const p = {
  stone: limestone('#eee8d6'),
  trim: limestone('#fff3d9'),
  foundation: limestone('#c4d3ca'),
  copper: patinatedMetal('#78aeb1'),
  steel: patinatedMetal('#6c9ca9'),
  darkSteel: world.mat('#4e778a'),
  glass: world.mat('#638d9d', { roughness: .47 }),
  shadow: world.mat('#556b78'),
  ochre: limestone('#ebc986'),
  lacquer: surface('wood', [1, 1], '#c48b65'),
  goldRoof: surface('roof', [2, 2], '#e8c275'),
  roofEdge: world.mat('#bca471'),
 };
 palettes.set(world, p);
 return p;
}
function groupAt(world, name, position, parent = world.static) {
 const group = new THREE.Group();
 group.name = name;
 group.position.set(...position);
 parent.add(group);
 return group;
}
function box(world, parent, material, size, position) {
 return world.box(...size, material, ...position, parent);
}
function archShape(width, height) {
 const radius = width / 2, spring = height - radius;
 const shape = new THREE.Shape();
 shape.moveTo(-radius, 0);
 shape.lineTo(radius, 0);
 shape.lineTo(radius, spring);
 shape.absarc(0, spring, radius, 0, Math.PI, false);
 shape.lineTo(-radius, 0);
 return shape;
}
function archedWindow(world, parent, p, width, height, x, y, z, rotation = 0) {
 const g = groupAt(world, 'recessed-arched-window', [x, y, z], parent);
 g.rotation.y = rotation;
 world.mesh(new THREE.ShapeGeometry(archShape(width, height), 12), p.shadow, 0, 0, 0, g);
 const inset = .115;
 world.mesh(new THREE.ShapeGeometry(archShape(width - inset * 2, height - inset), 12), p.glass, 0, .055, .012, g);
 const frame = archShape(width + .24, height + .12);
 const hole = archShape(width, height);
 frame.holes.push(new THREE.Path(hole.getPoints(20)));
 world.mesh(new THREE.ExtrudeGeometry(frame, { depth: .105, bevelEnabled: false, curveSegments: 12 }), p.trim, 0, 0, .025, g);
 box(world, g, p.trim, [width + .38, .16, .34], [0, -.06, .08]);
 box(world, g, p.trim, [.075, height - width * .18, .09], [0, height * .45, .14]);
 box(world, g, p.trim, [width, .075, .09], [0, height - width * .53, .14]);
 return g;
}
function column(world, parent, p, x, bottom, z, height, radius = .20) {
 box(world, parent, p.trim, [radius * 3, .2, radius * 3], [x, bottom + .1, z]);
 world.cyl(radius, radius * 1.18, height - .5, p.trim, x, bottom + height / 2, z, parent, 10);
 world.cyl(radius * 1.5, radius * 1.12, .18, p.trim, x, bottom + height - .3, z, parent, 10);
 box(world, parent, p.trim, [radius * 3.4, .2, radius * 3.4], [x, bottom + height - .1, z]);
}
function faceGroup(world, parent, name, distance, side) {
 const angle = side * Math.PI / 2;
 const g = groupAt(world, name, [Math.sin(angle) * distance, 0, Math.cos(angle) * distance], parent);
 g.rotation.y = angle;
 return g;
}
function clockMaterial() {
 const canvas = document.createElement('canvas');
 canvas.width = canvas.height = 512;
 const ctx = canvas.getContext('2d');
 ctx.fillStyle = '#eee1be';
 ctx.fillRect(0, 0, 512, 512);
 const grad = ctx.createRadialGradient(215, 210, 35, 256, 256, 250);
 grad.addColorStop(0, '#fff3cf'); grad.addColorStop(1, '#c4b693');
 ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(256, 256, 250, 0, Math.PI * 2); ctx.fill();
 ctx.strokeStyle = '#374f47'; ctx.lineWidth = 7;
 ctx.beginPath(); ctx.arc(256, 256, 235, 0, Math.PI * 2); ctx.stroke();
 ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(256, 256, 164, 0, Math.PI * 2); ctx.stroke();
 for (let i = 0; i < 60; i++) {
  const angle = i * Math.PI / 30;
  ctx.lineWidth = i % 5 ? 2 : 5;
  ctx.beginPath();
  ctx.moveTo(256 + Math.sin(angle) * (i % 5 ? 225 : 216), 256 - Math.cos(angle) * (i % 5 ? 225 : 216));
  ctx.lineTo(256 + Math.sin(angle) * 232, 256 - Math.cos(angle) * 232); ctx.stroke();
 }
 const numerals = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
 ctx.font = 'bold 35px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#324e45';
 numerals.forEach((n, i) => { const a = i * Math.PI / 6; ctx.fillText(n, 256 + Math.sin(a) * 191, 258 - Math.cos(a) * 191); });
 ctx.lineCap = 'round'; ctx.lineWidth = 10;
 ctx.beginPath(); ctx.moveTo(256, 272); ctx.lineTo(256, 119); ctx.stroke();
 ctx.lineWidth = 14; ctx.beginPath(); ctx.moveTo(245, 250); ctx.lineTo(343, 307); ctx.stroke();
 ctx.beginPath(); ctx.arc(256, 256, 12, 0, Math.PI * 2); ctx.fill();
 const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
 return new THREE.MeshStandardMaterial({ map, roughness: .82 });
}
// Square section copper roof with a soft, stepped dome profile; this keeps the
// Jianghan clock tower's pavilion silhouette rather than a hemispherical cap.
function copperRoof(world, parent, material, halfWidth, y, height) {
 const rings = [[1, 0], [.92, .06], [.82, .24], [.58, .65], [.26, .91], [.055, 1]];
 const positions = [], uvs = [], indices = [];
 for (let side = 0; side < 4; side++) {
  const angle = side * Math.PI / 2, start = positions.length / 3;
  for (const [r, h] of rings) for (let i = 0; i <= 8; i++) {
   const x = (i / 4 - 1) * r * halfWidth, z = r * halfWidth;
   positions.push(x * Math.cos(angle) + z * Math.sin(angle), y + h * height, z * Math.cos(angle) - x * Math.sin(angle));
   uvs.push(i / 8, h);
  }
  for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < 8; i++) {
   const a = start + j * 9 + i, b = a + 9;
   indices.push(a, a + 1, b, a + 1, b + 1, b);
  }
 }
 const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geo.setIndex(indices); geo.computeVertexNormals();
 return world.mesh(geo, material, 0, 0, 0, parent);
}

export function buildClockTower(world) {
 const p = palette(world), g = groupAt(world, '江汉关', [-30, 0, -40]);
 for (const [w, h, d, y] of [[18.7, .28, 10, .14], [18.1, .3, 9.45, .43], [17.5, .55, 9, .85]]) box(world, g, p.foundation, [w, h, d], [0, y, 0]);
 box(world, g, p.stone, [16.7, 8.1, 8.25], [0, 5.15, 0]);
 for (const y of [1.5, 2.15, 2.8, 3.4]) box(world, g, p.foundation, [16.86, .075, 8.39], [0, y, 0]);
 for (const [w, h, d, y] of [[17.05, .26, 8.6, 3.5], [17.2, .3, 8.7, 8.78], [17.7, .26, 9.05, 9.05], [17.3, .38, 8.7, 9.36]]) box(world, g, p.trim, [w, h, d], [0, y, 0]);
 // Ground-floor rustication and tall colonnaded upper floor on both long faces.
 for (const side of [0, 2]) {
  const f = faceGroup(world, g, 'customs-long-elevation', 4.18, side);
  for (let x = -6.75; x <= 6.76; x += 2.25) {
   archedWindow(world, f, p, 1.03, 1.75, x, 1.43, .035);
   archedWindow(world, f, p, 1.05, 3.15, x, 4.08, .025);
  }
  for (let x = -7.8; x <= 7.81; x += 2.225) column(world, f, p, x, 3.68, .20, 4.95, .21);
  for (let x = -8; x <= 8; x += .62) box(world, f, p.trim, [.13, .6, .22], [x, 9.86, .06]);
  box(world, f, p.trim, [16.6, .17, .4], [0, 10.21, .06]);
 }
 for (const side of [1, 3]) {
  const f = faceGroup(world, g, 'customs-short-elevation', 8.38, side);
  for (const x of [-2.7, 0, 2.7]) {
   archedWindow(world, f, p, 1.2, 1.75, x, 1.43, .04);
   archedWindow(world, f, p, 1.15, 3.15, x, 4.08, .04);
  }
  for (const x of [-3.8, -1.35, 1.35, 3.8]) column(world, f, p, x, 3.68, .18, 4.95, .21);
 }
 // Tower rises from a wide plinth and uses four identical clock elevations.
 box(world, g, p.stone, [6.15, 8.72, 6.15], [0, 13.96, 0]);
 box(world, g, p.trim, [6.65, .38, 6.65], [0, 10.0, 0]);
 box(world, g, p.trim, [6.38, .24, 6.38], [0, 14.13, 0]);
 for (const x of [-2.89, 2.89]) for (const z of [-2.89, 2.89]) box(world, g, p.trim, [.38, 8.12, .38], [x, 14.16, z]);
 const dial = clockMaterial();
 for (let side = 0; side < 4; side++) {
  const f = faceGroup(world, g, 'clock-elevation', 3.092, side);
  archedWindow(world, f, p, 1.20, 2.46, 0, 10.65, .025);
  box(world, f, p.foundation, [3.8, 3.8, .09], [0, 16.22, .04]);
  for (const x of [-2.05, 2.05]) box(world, f, p.trim, [.19, 3.92, .20], [x, 16.22, .13]);
  for (const y of [14.31, 18.14]) box(world, f, p.trim, [4.28, .18, .2], [0, y, .13]);
  world.mesh(new THREE.CircleGeometry(1.65, 64), dial, 0, 16.22, .155, f);
  world.mesh(new THREE.TorusGeometry(1.70, .10, 8, 56), p.trim, 0, 16.22, .16, f);
 }
 for (const [w, h, y] of [[6.6, .28, 18.47], [7.0, .23, 18.72], [6.28, .25, 18.96]]) box(world, g, p.trim, [w, h, w], [0, y, 0]);
 box(world, g, p.shadow, [4.35, 1.77, 4.35], [0, 19.98, 0]);
 for (const x of [-2.25, 2.25]) for (const z of [-2.25, 2.25]) column(world, g, p, x, 19.10, z, 1.88, .20);
 for (let side = 0; side < 4; side++) {
  const f = faceGroup(world, g, 'belfry-louvres', 2.195, side);
  for (let y = 19.36; y < 20.8; y += .22) box(world, f, p.copper, [3.75, .075, .13], [0, y, .01]);
 }
 box(world, g, p.trim, [5.15, .26, 5.15], [0, 21.08, 0]);
 copperRoof(world, g, p.copper, 2.85, 21.24, 2.05);
 world.cyl(.10, .25, .52, p.copper, 0, 23.52, 0, g, 12);
 world.cyl(.04, .08, 1.0, p.copper, 0, 24.19, 0, g, 8);
 world.mesh(new THREE.SphereGeometry(.13, 10, 6), p.trim, 0, 23.96, 0, g);
 world.label('江 汉 关', 2.6, .43, '#cdbf9f', '#4e6051', g).position.set(0, 9.72, 3.32);
 return g;
}

export function buildBridge(world) {
 const p = palette(world), g = groupAt(world, '武汉长江大桥', [39, 0, -58]);
 g.rotation.y = -.13;
 // The highway runs on top of the truss, with the railway deck below it.
 box(world, g, p.foundation, [113, .26, 5.6], [0, 10.2, 0]);
 box(world, g, p.darkSteel, [112, .33, 4.9], [0, 5.7, 0]);
 for (const z of [-2.38, 2.38]) {
  box(world, g, p.steel, [112, .23, .22], [0, 6.0, z]);
  box(world, g, p.steel, [112, .25, .24], [0, 9.96, z]);
  box(world, g, p.steel, [113, .11, .13], [0, 10.94, z * 1.10]);
  for (let x = -55; x <= 55; x += 2.5) box(world, g, p.steel, [.07, .73, .09], [x, 10.60, z * 1.10]);
  for (let i = 0; i < 16; i++) {
   const x = -56 + i * 7;
   world.beam([x, 6.04, z], [x + 7, 9.98, z], .105, p.steel, g);
   world.beam([x, 9.98, z], [x + 7, 6.04, z], .085, p.darkSteel, g);
   box(world, g, p.steel, [.16, 4, .18], [x, 8, z]);
   box(world, g, p.steel, [.32, .43, .07], [x, 6.17, z + Math.sign(z) * .09]);
   box(world, g, p.steel, [.32, .43, .07], [x, 9.80, z + Math.sign(z) * .09]);
  }
 }
 for (let x = -56; x <= 56; x += 7) box(world, g, p.steel, [.20, .22, 4.8], [x, 5.96, 0]);
 for (const z of [-1.6, -.75, .75, 1.6]) box(world, g, p.darkSteel, [112, .10, .10], [0, 5.98, z]);
 for (let x = -52.5; x <= 52.5; x += 17.5) {
  box(world, g, p.foundation, [2.7, .55, 6.25], [x, -.7, 0]);
  box(world, g, p.stone, [1.85, 5.5, 4.30], [x, 2.28, 0]);
  box(world, g, p.trim, [2.6, .48, 5.15], [x, 5.20, 0]);
  for (const z of [-2.15, 2.15]) world.cyl(.87, 1.18, 5.5, p.stone, x, 2.28, z, g, 10);
 }
 for (const x of [-43, 43]) for (const z of [-3.5, 3.5]) {
  const t = groupAt(world, 'bridgehead-pavilion', [x, 0, z], g);
  box(world, t, p.foundation, [4.15, 1.05, 3.7], [0, .53, 0]);
  box(world, t, p.stone, [3.45, 11.80, 3.15], [0, 6.75, 0]);
  for (const y of [3.2, 7.6, 11.7]) box(world, t, p.trim, [3.72, .23, 3.42], [0, y, 0]);
  for (const xx of [-1.44, 1.44]) for (const zz of [-1.31, 1.31]) box(world, t, p.trim, [.19, 10.9, .2], [xx, 6.85, zz]);
  for (const side of [0, 2]) {
   const f = faceGroup(world, t, 'bridgehead-windows', 1.59, side);
   for (const xx of [-.82, .82]) for (const y of [4.2, 8.6]) archedWindow(world, f, p, .55, 1.53, xx, y, .012);
  }
  box(world, t, p.trim, [4.3, .3, 3.98], [0, 12.83, 0]);
  box(world, t, p.stone, [2.85, 1.15, 2.64], [0, 13.54, 0]);
  for (const side of [0, 2]) {
   const f = faceGroup(world, t, 'pavilion-upper-window', 1.335, side);
   for (const xx of [-.88, 0, .88]) box(world, f, p.shadow, [.4, .61, .04], [xx, 13.58, 0]);
  }
  box(world, t, p.trim, [3.65, .26, 3.42], [0, 14.23, 0]);
  copperRoof(world, t, p.copper, 1.95, 14.37, .75);
 }
 return g;
}

// A hipped roof has a sagging middle and rising corners. Four curved patches
// create actual geometry and shadows, instead of a pyramid/cone approximation.
function flyingRoof(world, parent, p, width, y, rise) {
 const positions = [], uvs = [], indices = [], segments = 12, rings = 7;
 const point = (side, s, t) => {
  const angle = side * Math.PI / 2, r = width * (.10 + .40 * t);
  const x = s * r, z = r;
  const yy = y + rise * Math.pow(1 - t, 1.8) + rise * .40 * Math.pow(t, 4) * Math.pow(Math.abs(s), 5);
  return [x * Math.cos(angle) + z * Math.sin(angle), yy, z * Math.cos(angle) - x * Math.sin(angle)];
 };
 for (let side = 0; side < 4; side++) {
  const start = positions.length / 3;
  for (let j = 0; j <= rings; j++) for (let i = 0; i <= segments; i++) {
   positions.push(...point(side, i / segments * 2 - 1, j / rings)); uvs.push(i / segments, j / rings);
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < segments; i++) {
   const a = start + j * (segments + 1) + i, b = a + segments + 1;
   indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const edge = [];
  for (let i = 0; i <= segments; i++) edge.push(new THREE.Vector3(...point(side, i / segments * 2 - 1, 1)));
  world.mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge), 16, .08, 5, false), p.roofEdge, 0, 0, 0, parent);
  const ridge = [];
  for (let j = 0; j <= rings; j++) ridge.push(new THREE.Vector3(...point(side, 1, j / rings)));
  world.mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ridge), 10, .065, 5, false), p.roofEdge, 0, 0, 0, parent);
 }
 const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geo.setIndex(indices); geo.computeVertexNormals();
 return world.mesh(geo, p.goldRoof, 0, 0, 0, parent);
}
function buildFarBank(world, parent, p) {
 // The previous clock tower and skyline sat directly on the Water plane.
 // This compressed, continuous bank connects them to land while keeping the
 // ferry corridor (x -17.5..27.5, z -45..-41) entirely clear. It is scenic only:
 // no playable-area, navigation or collision coordinates are changed.
 const coast = [[-150,-33],[-49,-33],[-42,-32],[-20,-32],[-18,-48],[-9,-51],
  [3,-54],[5,-70],[32,-80],[69,-83],[78,-70],[78,-47],[112,-42],[150,-49]];
 const boundary = [...coast,[155,-149],[-150,-149]];
 const shape = new THREE.Shape();shape.moveTo(boundary[0][0],-boundary[0][1]);
 boundary.slice(1).forEach(([x,z])=>shape.lineTo(x,-z));shape.closePath();
 const land = world.mat('#aac3a2',{roughness:1});
 const terrain = world.mesh(new THREE.ExtrudeGeometry(shape,{depth:1.32,bevelEnabled:false,curveSegments:1}),land,0,-1.16,0,parent);
 terrain.rotation.x=-Math.PI/2;
 const pavement=world.mat('#d0d6bd',{roughness:.94}),curb=world.mat('#a1b4aa',{roughness:.96});
 for(let i=0;i<coast.length-1;i++){
  const [ax,az]=coast[i],[bx,bz]=coast[i+1],dx=bx-ax,dz=bz-az,length=Math.hypot(dx,dz);
  const midX=(ax+bx)/2,midZ=(az+bz)/2,nx=dz/length,nz=-dx/length,angle=-Math.atan2(dz,dx);
  const retaining=box(world,parent,p.foundation,[length,.88,.66],[midX,-.22,midZ]);retaining.rotation.y=angle;
  const cap=box(world,parent,curb,[length+.10,.14,.82],[midX,.28,midZ]);cap.rotation.y=angle;
  const path=box(world,parent,pavement,[length+.10,.12,2.6],[midX+nx*1.46,.22,midZ+nz*1.46]);path.rotation.y=angle;
  // A low balustrade reads as a pedestrian riverfront, not another building.
  for(let d=1.4;d<length-1;d+=7.5){
   const f=d/length,x=ax+dx*f+nx*.42,z=az+dz*f+nz*.42;
   box(world,parent,p.trim,[.13,.68,.13],[x,.62,z]);
  }
  if(length>4){const rail=box(world,parent,p.trim,[length-.5,.07,.09],[midX+nx*.42,.93,midZ+nz*.42]);rail.rotation.y=angle;}
 }
 // Broad aprons meet the already modelled foundations. The clock tower is
 // rooted in a promenade continuous with the western bank, never on an island.
 box(world,parent,pavement,[22,.16,15],[-31,.18,-40]);
 box(world,parent,pavement,[17,.14,12],[-5,.19,-63]);
 box(world,parent,pavement,[19,.14,14],[86,.19,-55]);
 // A shallow green ridge supports the pagoda's existing elevated plinth.
 const hill=world.mesh(new THREE.SphereGeometry(1,16,8),land,83,.05,-104,parent);
 hill.scale.set(23,3.45,17);
 box(world,parent,p.foundation,[13,.6,11],[83,3.25,-103]);
 // The far-city blocks now stand behind a continuous esplanade and green strip.
 box(world,parent,pavement,[240,.11,3.5],[0,.24,-94]);
 const foliage=world.mat('#83ac92',{roughness:1});
 for(const x of[-104,-81,-58,-34,12,39,58,106]){
  world.cyl(.075,.11,1.55,p.copper,x,.93,-97,parent,6);
  const tree=world.mesh(new THREE.IcosahedronGeometry(1,1),foliage,x,2,-97,parent);
  tree.scale.set(1.4,1.65,1.15);
 }
 return terrain;
}

export function buildDistantCity(world) {
 const p = palette(world), skyline = groupAt(world, '武昌远岸', [0, 0, 0]);
 buildFarBank(world,skyline,p);
 for (let i = 0; i < 25; i++) {
  const x = -115 + i * 9, h = 3 + (Math.sin(i * 7) * .5 + .5) * 13;
  const mat = world.mat(['#96aea0', '#9eb2a4', '#8fa99c'][i % 3]);
  box(world, skyline, mat, [5 + i % 3 * 2, h, 6], [x, h / 2, -102 - i % 4 * 5]);
  if (h > 10) box(world, skyline, mat, [3.5, h * .19, 4], [x, h * 1.085, -102 - i % 4 * 5]);
 }
 const g = groupAt(world, '黄鹤楼', [83, 4, -103], skyline);
 // The five storeys grow lighter towards the sky; column gaps and rails are
 // intentionally dark enough to remain readable from the opposite river bank.
 box(world, g, p.foundation, [12.3, .8, 10.3], [0, -.1, 0]);
 box(world, g, p.stone, [10.4, 2.35, 9.4], [0, 1.2, 0]);
 for (let level = 0; level < 5; level++) {
  const floorY = 2.48 + level * 2.42, width = 10.8 - level * 1.17, body = width * .65;
  box(world, g, p.lacquer, [body, 1.52, body], [0, floorY + .67, 0]);
  box(world, g, p.ochre, [body + .74, .17, body + .74], [0, floorY + .06, 0]);
  for (let side = 0; side < 4; side++) {
   const f = faceGroup(world, g, 'pagoda-colonnade', body / 2 + .08, side);
   for (const n of [-1, -.5, 0, .5, 1]) {
    const x = n * body * .44;
    world.cyl(.06, .075, 1.4, p.lacquer, x, floorY + .76, .12, f, 6);
    if (n < 1) box(world, f, p.shadow, [body * .17, .94, .03], [x + body * .105, floorY + .82, .026]);
   }
   box(world, f, p.ochre, [body + .52, .07, .08], [0, floorY + .47, .25]);
   for (let n = -4; n <= 4; n++) box(world, f, p.ochre, [.05, .39, .07], [n * body / 8, floorY + .27, .25]);
  }
  flyingRoof(world, g, p, width, floorY + 1.52, 1.03);
 }
 world.cyl(.06, .15, 1.25, p.roofEdge, 0, 15.27, 0, g, 8);
 world.mesh(new THREE.SphereGeometry(.16, 10, 6), p.roofEdge, 0, 15.94, 0, g);
 return skyline;
}

// The ferry moves as one root. Its fixed fittings are merged locally so the
// ship retains a small draw-call budget while sailing independently of the city.
export function buildFerry(world) {
 const p = palette(world), g = groupAt(world, '武汉轮渡', [7, -.05, -43], world.scene);
 world.ferry = g;
 const hull = patinatedMetal('#477d76');
 const waterline = world.mat('#324f4c', { roughness: .64 });
 const cream = world.mat('#e8e2cb', { roughness: .78 });
 const rail = world.mat('#d2d8c8', { roughness: .56, metalness: .15 });
 const glazing = world.mat('#325f63', { roughness: .23, metalness: .2 });
 const windowEdge = world.mat('#31534e', { roughness: .6 });
 const teak = surface('wood', [3, 1], '#ccc4a1');
 const rubber = world.mat('#303e37');
 const orange = world.mat('#c58b56');
 const outlinePoints = [
  [-4.32,-1.12],[-4.02,-1.61],[-3.0,-1.78],[1.8,-1.78],
  [3.0,-1.43],[4.03,-.72],[4.48,0],[4.03,.72],
  [3.0,1.43],[1.8,1.78],[-3.0,1.78],[-4.02,1.61],[-4.32,1.12],
 ];
 const outline = new THREE.CatmullRomCurve3(outlinePoints.map(([x,z]) => new THREE.Vector3(x,0,z)), true, 'centripetal');
 const ring = outline.getPoints(64).slice(0,-1);
 const strip = (bottomY, topY, bottomScale, topScale, material) => {
  const positions=[],uvs=[],indices=[];
  for(const [y,scale] of [[bottomY,bottomScale],[topY,topScale]]) for(let i=0;i<=ring.length;i++) {
   const v=ring[i%ring.length];positions.push(v.x*(.92+.08*scale),y,v.z*scale);uvs.push(i/ring.length*4,y);
  }
  for(let i=0;i<ring.length;i++) {const a=i,b=i+ring.length+1;indices.push(a,b,a+1,a+1,b,b+1);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.computeVertexNormals();
  return world.mesh(geo,material,0,0,0,g);
 };
 strip(-.38,.10,.64,.88,waterline);
 strip(.10,.64,.88,1,hull);
 strip(.64,.77,1,1,cream);
 const deckPositions=[0,.77,0],deckUV=[.5,.5],deckIndices=[];
 ring.forEach(v=>{deckPositions.push(v.x,.77,v.z);deckUV.push(v.x/9+.5,v.z/3.7+.5);});
 for(let i=0;i<ring.length;i++)deckIndices.push(0,(i+1)%ring.length+1,i+1);
 const deckGeo=new THREE.BufferGeometry();deckGeo.setAttribute('position',new THREE.Float32BufferAttribute(deckPositions,3));deckGeo.setAttribute('uv',new THREE.Float32BufferAttribute(deckUV,2));deckGeo.setIndex(deckIndices);deckGeo.computeVertexNormals();world.mesh(deckGeo,teak,0,0,0,g);
 const contour = (y, scale = 1) => new THREE.CatmullRomCurve3(ring.map(v=>new THREE.Vector3(v.x, y, v.z*scale)),true);
 world.mesh(new THREE.TubeGeometry(contour(.58,1.025),80,.074,6,true),rubber,0,0,0,g);
 world.mesh(new THREE.TubeGeometry(contour(.80,1.012),80,.039,5,true),rail,0,0,0,g);
 // Passenger cabin with rounded corners, recessed glazing and separate frames.
 const roundedBox=(size,position,material,radius=.08)=>world.mesh(new RoundedBoxGeometry(...size,2,radius),material,...position,g);
 roundedBox([6.24,1.64,2.59],[-.41,1.64,0],cream,.12);
 roundedBox([6.55,.18,2.9],[-.37,2.50,0],hull,.075);
 roundedBox([6.32,.08,2.68],[-.37,2.625,0],cream,.025);
 const sideWindow=(x,y,z,width,height,side,parent=g)=>{
  const f=groupAt(world,'ferry-window',[x,y,z],parent);f.rotation.y=side>0?0:Math.PI;
  box(world,f,windowEdge,[width+.10,height+.10,.06],[0,0,0]);
  box(world,f,glazing,[width,height,.026],[0,0,.041]);
  for(const xx of [-width/2,width/2])box(world,f,rail,[.038,height+.06,.045],[xx,0,.065]);
  for(const yy of [-height/2,height/2])box(world,f,rail,[width,.038,.045],[0,yy,.065]);
  box(world,f,rail,[.027,height,.035],[0,0,.068]);
  box(world,f,cream,[width+.18,.08,.13],[0,-height/2-.10,.03]);
 };
 for(const side of[-1,1]) {
  for(const x of[-2.88,-1.94,-1.0,-.06,.88,1.82])sideWindow(x,1.75,side*1.307,.70,1.01,side);
  box(world,g,hull,[5.98,.055,.05],[-.4,1.085,side*1.33]);
 }
 const forwardCabin = groupAt(world, 'forward-cabin-windows', [2.722, 1.74, 0], g);
 forwardCabin.rotation.y = Math.PI / 2;
 for(const x of [-.64,.64])sideWindow(x,0,0,.92,.99,1,forwardCabin);
 // A framed aft access door, with a small glazed upper panel and handle.
 const aft=groupAt(world,'passenger-door',[-3.548,1.46,0],g);aft.rotation.y=-Math.PI/2;
 box(world,aft,windowEdge,[.90,1.28,.04],[0,0,0]);box(world,aft,cream,[.78,1.19,.028],[0,0,.032]);box(world,aft,glazing,[.59,.52,.025],[0,.23,.06]);box(world,aft,p.copper,[.13,.025,.06],[.23,-.20,.09]);
 // Bow and stern walkways retain open rails outside the enclosed cabin.
 for(const idx of[0,3,6,9,13,17,21,25,29,33,37,41,45,49,53,57,61]) {
  const v=ring[idx];
  if(Math.abs(v.x)<2.8)continue;
  world.cyl(.024,.028,.53,rail,v.x*.982,1.06,v.z*.98,g,6);
 }
 for(const [from,to]of[[0,22],[23,42],[43,64]]) {
  const path=ring.slice(from,Math.min(to+1,64)).map(v=>new THREE.Vector3(v.x*.982,1.325,v.z*.98));
  if(path.length>2)world.mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path),path.length*2,.023,5,false),rail,0,0,0,g);
 }
 // Upper pilot house breaks the silhouette and gives the ferry a clear bow.
 roundedBox([1.92,1.10,2.0],[1.40,3.22,0],cream,.10);
 roundedBox([2.17,.14,2.22],[1.40,3.82,0],hull,.065);
 for(const side of[-1,1])sideWindow(1.40,3.32,side*1.01,1.31,.65,side);
 const windscreen=groupAt(world,'pilot-windscreen',[2.371,3.34,0],g);windscreen.rotation.y=Math.PI/2;
 for(const x of[-.48,.48])sideWindow(x,0,0,.75,.66,1,windscreen);
 // Low upper-deck handrails, ventilation cowls, antenna and navigation lamps.
 for(const side of[-1,1]) {
  box(world,g,rail,[3.35,.04,.04],[-1.78,3.07,side*1.31]);
  for(const x of[-3.37,-2.55,-1.73,-.91,-.12])world.cyl(.021,.022,.43,rail,x,2.855,side*1.31,g,6);
 }
 for(const x of[-2.35,-1.25]) {
  world.cyl(.19,.23,.44,cream,x,2.88,0,g,12);
  world.mesh(new THREE.SphereGeometry(.25,12,6,0,Math.PI*2,0,Math.PI/2),hull,x,3.12,0,g);
  world.cyl(.21,.21,.07,windowEdge,x,3.11,0,g,12);
 }
 world.cyl(.028,.047,1.35,p.copper,-.15,3.54,0,g,8);
 world.beam([-.15,4.0,-.43],[-.15,4.0,.43],.018,rail,g);
 world.mesh(new THREE.SphereGeometry(.075,10,6),cream,-.15,4.27,0,g);
 box(world,g,orange,[.55,.33,.018],[.145,4.05,0]);
 for(const side of[-1,1])world.mesh(new THREE.SphereGeometry(.07,10,6),world.mat(side>0?'#a3674c':'#779b75',{emissive:side>0?'#7a2511':'#315629',emissiveIntensity:.2}),2.1,3.85,side*.98,g);
 const lifeRing=(x,y,z,side)=>{
  const r=groupAt(world,'life-ring',[x,y,z],g);r.rotation.y=side>0?0:Math.PI;
  world.mesh(new THREE.TorusGeometry(.258,.070,8,28),orange,0,0,0,r);
  for(let i=0;i<4;i++){const band=world.mesh(new THREE.TorusGeometry(.258,.074,7,6,Math.PI/6),cream,0,0,.003,r);band.rotation.z=i*Math.PI/2;}
  world.mesh(new THREE.TorusGeometry(.363,.014,5,28),rail,0,0,0,r);
 };
 for(const side of[-1,1])for(const x of[-2.8,1.95])lifeRing(x,1.04,side*1.52,side);
 for(const side of[-1,1])for(const x of[-3.8,3.2]) {
  const f=world.mesh(new THREE.TorusGeometry(.17,.079,7,18),rubber,x,.42,side*(x>0?1.39:1.66),g);f.rotation.z=.12;
  world.beam([x,.68,side*(x>0?1.37:1.64)],[x,.92,side*(x>0?1.35:1.62)],.014,rail,g);
 }
 for(const x of[-3.75,3.36])for(const z of[-.58,.58]) {
  world.cyl(.045,.065,.18,p.copper,x,.88,z,g,7);box(world,g,p.copper,[.23,.035,.045],[x,.98,z]);
 }
 for(const side of[-1,1]) {
  const label=world.label('武 汉 轮 渡',2.35,.26,'#e8e1c7','#41655d',g);label.position.set(-.4,.952,side*1.52);label.rotation.y=side>0?0:Math.PI;
 }
 const batches=new Map();g.updateMatrixWorld(true);const inverse=new THREE.Matrix4().copy(g.matrixWorld).invert();
 g.traverse(o=>{if(!o.isMesh)return;const transform=new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld);const geo=o.geometry.clone().applyMatrix4(transform);const entry=batches.get(o.material.uuid)||{material:o.material,geometries:[]};entry.geometries.push(geo.index?geo.toNonIndexed():geo);batches.set(o.material.uuid,entry);});
 const combined=[];
 for(const {material,geometries} of batches.values()) {
  const geometry=mergeGeometries(geometries,false);
  if(!geometry)throw new Error('Ferry geometry batch could not be merged');
  const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;combined.push(mesh);geometries.forEach(geo=>geo.dispose());
 }
 // Include protruding fenders in the original nine-by-3.7 metre envelope.
 const bounds = new THREE.Box3();
 for(const mesh of combined){mesh.geometry.computeBoundingBox();bounds.union(mesh.geometry.boundingBox);}
 const size = bounds.getSize(new THREE.Vector3());
 for(const mesh of combined)mesh.geometry.scale(9/size.x,1,3.7/size.z);
 g.traverse(o=>{if(o.isMesh)o.geometry.dispose();});g.clear();combined.forEach(mesh=>g.add(mesh));
 return g;
}
