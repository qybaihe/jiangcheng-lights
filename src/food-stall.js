import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { surface } from './architecture.js';

const cache = new Map();
function mat(color, options = {}) {
  const key = color + JSON.stringify(options);
  if (!cache.has(key)) cache.set(key, new THREE.MeshStandardMaterial({ color, roughness: .85, ...options }));
  return cache.get(key);
}
function texture(name, color, repeat = [1, 1], metallic = false) {
  const key = name + color + repeat;
  if (!cache.has(key)) {
    const m = surface(name, repeat, color); if (metallic) { m.metalness = .45; m.roughness = .53; }
    cache.set(key, m);
  }
  return cache.get(key);
}
function mesh(world, g, geometry, material, position = [0, 0, 0], rotation) {
  const m = world.mesh(geometry, material, ...position, g); if (rotation) m.rotation.set(...rotation); return m;
}
function box(world, g, dimensions, material, position, radius = 0) {
  return mesh(world, g, radius ? new RoundedBoxGeometry(...dimensions, 1, radius) : new THREE.BoxGeometry(...dimensions), material, position);
}
function rod(world, g, a, b, r, material, segments = 6) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const m = mesh(world, g, new THREE.CylinderGeometry(r, r, start.distanceTo(end), segments), material, start.clone().add(end).multiplyScalar(.5).toArray());
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize()); return m;
}
function line(world, g, points, r, material, segments = 14, radialSegments = 5) {
  return mesh(world, g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), segments, r, radialSegments, false), material);
}
function lathe(world, g, profile, material, at = [0, 0, 0], segments = 28) {
  return mesh(world, g, new THREE.LatheGeometry(profile.map(p => new THREE.Vector2(...p)), segments), material, at);
}
function ring(world, g, r, thickness, material, at, rotation = [Math.PI / 2, 0, 0], segments = 28) {
  return mesh(world, g, new THREE.TorusGeometry(r, thickness, 6, segments), material, at, rotation);
}
function seedRandom(seed) { return () => { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; }; }

function noodles(world, parent, x, bottom, z, seed = 7) {
  const g = new THREE.Group(); g.position.set(x, bottom, z); parent.add(g);
  const porcelain = mat('#fff2d8', { roughness: .35 }), blue = mat('#4788a3', { roughness: .45 });
  // Complete curved inner and outer walls: the rim remains hollow at all angles.
  lathe(world, g, [[0, .013], [.112, .013], [.125, .025], [.132, .040], [.186, .084], [.24, .16], [.274, .20], [.28, .213], [.271, .224], [.257, .215], [.243, .183], [.182, .111], [.115, .074], [0, .066]], porcelain);
  ring(world, g, .273, .0038, blue, [0, .214, 0]);
  ring(world, g, .129, .0032, blue, [0, .047, 0]);
  const sauce = mat('#b78b44', { roughness: .64 });
  mesh(world, g, new THREE.CylinderGeometry(.229, .175, .049, 24), sauce, [0, .149, 0]);
  const pasta = [mat('#dfbd72', { roughness: .58 }), mat('#d3ab5b', { roughness: .58 }), mat('#efcf8c', { roughness: .56 })];
  const random = seedRandom(seed);
  // Twenty individual tangled noodle strands sit above the sesame dressing.
  for (let i = 0; i < 20; i++) {
    const phase = random() * Math.PI * 2, radius = .065 + random() * .126, points = [];
    const turns = .8 + random() * .95;
    for (let j = 0; j <= 15; j++) {
      const t = j / 15, angle = phase + t * Math.PI * 2 * turns;
      const r = radius * (.76 + Math.sin(t * Math.PI) * .23);
      points.push([Math.cos(angle) * r + Math.sin(phase) * .022, .177 + i * .001 + Math.sin(t * Math.PI * 3 + phase) * .009, Math.sin(angle) * r + Math.cos(phase) * .022]);
    }
    line(world, g, points, .007, pasta[i % 3], 22, 5);
  }
  const springOnion = mat('#5c9a51'), onionLight = mat('#9fcb76'), sesame = mat('#d9c596');
  for (let i = 0; i < 20; i++) {
    const a = random() * Math.PI * 2, r = Math.sqrt(random()) * .18;
    const green = box(world, g, [.012 + random() * .008, .009, .013], i % 3 ? springOnion : onionLight, [Math.cos(a) * r, .21 + random() * .008, Math.sin(a) * r]);
    green.rotation.y = random() * 6.28; green.rotation.z = (random() - .5) * .3;
  }
  for (let i = 0; i < 35; i++) {
    const a = random() * Math.PI * 2, r = Math.sqrt(random()) * .19;
    const grain = mesh(world, g, new THREE.SphereGeometry(1, 5, 3), sesame, [Math.cos(a) * r, .207 + random() * .012, Math.sin(a) * r]);
    grain.scale.set(.0035, .0024, .0065); grain.rotation.y = random() * 6.28;
  }
  return g;
}

function counter(world, g) {
  // Each geometry board samples roughly one source plank, rather than squeezing
  // the entire multi-plank texture into every narrow strip of timber.
  const timber = texture('wood', '#ddd5b4', [1.5, .065]), frame = texture('wood', '#c3b794', [.7, .12]);
  const panels = texture('painted-wood', '#cfddc5', [1, 1]), brass = mat('#92825a', { metalness: .48, roughness: .6 });
  const recess = mat('#333d30'), x = 13, z = 12.2;
  // A real timber carcass has air below it, inset doors and overhanging boards.
  for (const dx of [-2.37, 2.37]) for (const dz of [-.56, .56]) {
    box(world, g, [.125, .99, .125], frame, [x + dx, .535, z + dz], .008);
    box(world, g, [.148, .08, .148], mat('#4b5040'), [x + dx, .08, z + dz], .007);
  }
  for (let i = 0; i < 6; i++) box(world, g, [5.10, .095, .23], timber, [x, 1.0525, z - .585 + i * .234], .007);
  for (const side of [-1, 1]) {
    box(world, g, [4.79, .13, .077], frame, [x, .933, z + side * .582], .006);
    box(world, g, [4.79, .085, .077], frame, [x, .181, z + side * .582], .004);
  }
  box(world, g, [4.64, .715, .03], recess, [x, .551, z + .58]);
  for (const dx of [-2.37, 2.37]) {
    for (let j = 0; j < 4; j++) box(world, g, [.07, .696, .258], panels, [x + dx, .551, z - .401 + j * .269], .004);
    box(world, g, [.10, .075, 1.1], frame, [x + dx, .217, z], .003);
  }
  // Four individual framed doors, each with an inset, weathered wood panel.
  for (let i = 0; i < 4; i++) {
    const xx = x - 1.758 + i * 1.172;
    box(world, g, [1.10, .68, .040], panels, [xx, .551, z + .61], .006);
    for (const side of [-1, 1]) {
      box(world, g, [.073, .704, .039], frame, [xx + side * .519, .551, z + .64], .003);
      box(world, g, [1.08, .074, .044], frame, [xx, .551 + side * .315, z + .644], .003);
    }
    for (let j = 0; j < 4; j++) box(world, g, [.235, .529, .017], panels, [xx - .366 + j * .244, .551, z + .636], .002);
    const handleX = xx + (i % 2 ? -.379 : .379);
    for (const yy of [.47, .585]) mesh(world, g, new THREE.CylinderGeometry(.017, .017, .01, 10), brass, [handleX, yy, z + .674], [Math.PI / 2, 0, 0]);
    line(world, g, [[handleX, .47, z + .677], [handleX, .487, z + .708], [handleX, .565, z + .708], [handleX, .585, z + .677]], .008, brass, 10);
    for (const yy of [.302, .785]) {
      const hingeX = xx + (i % 2 ? .506 : -.506);
      box(world, g, [.075, .043, .012], brass, [hingeX, yy, z + .671], .003);
      rod(world, g, [hingeX, yy - .028, z + .679], [hingeX, yy + .028, z + .679], .008, brass);
    }
  }
  // Nails are modelled at board ends, where the player can inspect them.
  for (const xx of [x - 2.32, x + 2.32]) for (let i = 0; i < 6; i++) {
    mesh(world, g, new THREE.CylinderGeometry(.008, .008, .002, 8), brass, [xx, 1.102, z - .585 + i * .234]);
  }
  const pottery = mat('#71684c', { roughness: .65 });
  lathe(world, g, [[0, 0], [.084, 0], [.088, .04], [.091, .218], [.083, .23], [.073, .22], [.07, .033], [0, .03]], pottery, [10.68, 1.102, 11.96], 18);
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4, r = .019 + i % 3 * .01;
    rod(world, g, [10.68 + Math.sin(a) * r, 1.15, 11.96 + Math.cos(a) * r], [10.68 + Math.sin(a) * r * 1.8, 1.49 + i % 3 * .02, 11.96 + Math.cos(a) * r * 1.7], .006, timber);
  }
  // A ceramic dressing crock, lid and spoon sit at the end of the serving top.
  lathe(world, g, [[0, 0], [.107, 0], [.13, .058], [.137, .17], [.11, .205], [.086, .217]], pottery, [15.28, 1.102, 12.01], 22);
  ring(world, g, .09, .008, mat('#b2a47a'), [15.28, 1.317, 12.01]);
  mesh(world, g, new THREE.CylinderGeometry(.10, .118, .021, 22), pottery, [15.28, 1.33, 12.01]);
  mesh(world, g, new THREE.SphereGeometry(.025, 10, 6), mat('#b2a47a'), [15.28, 1.355, 12.01]);
  return timber;
}

function stove(world, parent) {
  const g = new THREE.Group(); g.position.set(17.2, 0, 12); parent.add(g);
  const weathered = texture('iron', '#a3a795', [1, 1], true), dark = texture('iron', '#8a9280');
  const steel = mat('#a8ada1', { metalness: .2, roughness: .57 });
  steel.normalMap = weathered.normalMap; steel.normalScale.set(.20, .20);
  steel.roughnessMap = weathered.roughnessMap;
  const iron = mat('#444d41', { metalness: .36, roughness: .78 });
  lathe(world, g, [[0, .065], [.59, .065], [.645, .099], [.653, .14], [.63, .19], [.63, .86], [.654, .90], [.66, 1.037], [0, 1.037]], dark, [0, 0, 0], 32);
  for (const y of [.18, .865]) ring(world, g, .634, .016, iron, [0, y, 0], undefined, 32);
  for (let i = 0; i < 18; i++) {
    const a = i * Math.PI * 2 / 18;
    rod(world, g, [Math.sin(a) * .633, .2, Math.cos(a) * .633], [Math.sin(a) * .633, .848, Math.cos(a) * .633], .006, steel);
    mesh(world, g, new THREE.SphereGeometry(.009, 6, 4), steel, [Math.sin(a) * .646, .185, Math.cos(a) * .646]);
  }
  for (const xx of [-.4, .4]) for (const zz of [-.38, .38]) box(world, g, [.12, .1, .12], iron, [xx, .05, zz], .008);
  // Closed fire door with hinges, latch and ventilation louvers.
  box(world, g, [.39, .335, .041], iron, [0, .41, .637], .026);
  box(world, g, [.312, .26, .016], dark, [0, .415, .666], .014);
  for (let i = 0; i < 4; i++) box(world, g, [.165, .01, .006], mat('#262f26'), [-.025, .357 + i * .039, .677], .002);
  for (const yy of [.31, .50]) rod(world, g, [-.185, yy - .031, .67], [-.185, yy + .031, .67], .012, steel);
  rod(world, g, [.127, .372, .685], [.127, .454, .685], .01, steel);
  // A separate boiler nestles into the stove's thick rolled metal top.
  lathe(world, g, [[.50, 1.018], [.72, 1.018], [.754, 1.036], [.754, 1.08], [.709, 1.093], [.585, 1.093], [.542, 1.04]], steel, [0, 0, 0], 32);
  lathe(world, g, [[.466, 1.059], [.504, 1.09], [.564, 1.21], [.595, 1.343], [.592, 1.364], [.57, 1.371], [.557, 1.35], [.527, 1.234], [.475, 1.12]], steel, [0, 0, 0], 32);
  ring(world, g, .578, .016, steel, [0, 1.364, 0], undefined, 32);
  mesh(world, g, new THREE.CylinderGeometry(.54, .5, .016, 28), mat('#a39d77', { roughness: .3, metalness: .12 }), [0, 1.307, 0]);
  for (const side of [-1, 1]) {
    line(world, g, [[side * .561, 1.282, -.17], [side * .772, 1.294, -.155], [side * .783, 1.292, .155], [side * .561, 1.282, .17]], .023, iron, 16, 7);
    for (const z of [-.17, .17]) box(world, g, [.033, .064, .053], steel, [side * .568, 1.281, z], .006);
  }
  // Offset half-cover exposes the pot interior and gives the steam a clear origin.
  const lid = new THREE.Group(); lid.position.set(.20, 1.395, -.025); lid.rotation.z = -.13; g.add(lid);
  lathe(world, lid, [[0, .09], [.14, .081], [.38, .045], [.585, 0], [.598, -.012], [.586, -.021], [0, .069]].reverse(), steel, [0, 0, 0], 32);
  ring(world, lid, .591, .008, steel, [0, -.01, 0], undefined, 32);
  line(world, lid, [[-.08, .083, 0], [-.059, .157, 0], [.059, .157, 0], [.08, .083, 0]], .013, iron, 14, 6);
}

function diningTable(world, parent) {
  const g = new THREE.Group(); g.position.set(14, 0, 16); parent.add(g);
  const timber = texture('wood', '#c5c1aa', [1.1, .065]), frame = texture('wood', '#c3b794', [.6, .12]);
  const iron = mat('#59604d', { roughness: .67, metalness: .25 });
  for (let i = 0; i < 5; i++) box(world, g, [2.43, .112, .313], timber, [0, 1.019, -.642 + i * .321], .006);
  for (const x of [-1, 1]) for (const z of [-.53, .53]) {
    const leg = box(world, g, [.115, .953, .115], frame, [x, .492, z], .007); leg.rotation.z = -x * .025;
    box(world, g, [.133, .06, .133], iron, [x + x * .01, .05, z], .005);
  }
  for (const z of [-.57, .57]) box(world, g, [2.10, .165, .077], frame, [0, .885, z], .005);
  for (const x of [-1.01, 1.01]) {
    box(world, g, [.077, .165, 1.13], frame, [x, .885, 0], .005);
    box(world, g, [.058, .074, 1.105], frame, [x, .30, 0], .004);
    for (let j = 0; j < 5; j++) mesh(world, g, new THREE.CylinderGeometry(.007, .007, .002, 6), iron, [x, 1.077, -.642 + j * .321]);
  }
  box(world, g, [2.10, .07, .065], frame, [0, .3, 0], .004);
  // Enamel tea mug with its rolled blue lip and loop handle.
  const cup = mat('#f7f5e5', { roughness: .32 }), blue = mat('#4788a3', { roughness: .45 });
  lathe(world, g, [[0, 0], [.069, 0], [.078, .019], [.081, .153], [.088, .16], [.085, .171], [.075, .167], [.069, .032], [0, .028]], cup, [.78, 1.077, -.16], 22);
  ring(world, g, .083, .004, blue, [.78, 1.242, -.16]);
  ring(world, g, .046, .009, blue, [.88, 1.166, -.16], [0, 0, 0], 18);
  mesh(world, g, new THREE.CylinderGeometry(.07, .07, .004, 20), mat('#86794c', { roughness: .28 }), [.78, 1.218, -.16]);
  // A small chopstick rest and a pair ready for the next neighbour.
  box(world, g, [.074, .031, .042], cup, [-.43, 1.09, .37], .009);
  for (const dz of [-.014, .014]) rod(world, g, [-.69, 1.121, .22 + dz], [-.27, 1.123, .50 + dz], .006, frame);
  return g;
}

/**
 * Builds only the static serving counter, its five noodle bowls, boiler and
 * dining table. Existing steam, stools, characters and signs are left to World.
 * All pieces are attached to world.static and share cached PBR materials so
 * World.optimize() can merge them. Returns the containing Group.
 */
export function buildFoodStall(world) {
  const g = new THREE.Group(); g.name = '蔡记过早铺 · 立体餐食与木作'; world.static.add(g);
  counter(world, g);
  for (let i = 0; i < 5; i++) noodles(world, g, 11.3 + i * .8, 1.102, 12.3, 19 + i * 67);
  stove(world, g); diningTable(world, g);
  return g;
}
