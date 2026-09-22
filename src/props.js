import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { surface } from './architecture.js';

// All dimensions are in metres. Every prop has its origin at the centre of its
// bottom, faces +Z, and is attached to world.static unless a parent is supplied.
// Shared materials let World.optimize() batch the many small physical details.
const materials = new Map();
const UP = new THREE.Vector3(0, 1, 0);

function material(key, color, options = {}) {
  if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: .84, ...options }));
  return materials.get(key);
}

function textured(name, color, repeat = [1, 1]) {
  const key = `${name}:${color}:${repeat}`;
  if (!materials.has(key)) materials.set(key, surface(name, repeat, color));
  return materials.get(key);
}

function group(world, options, name, dimensions) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(options.x ?? 0, options.y ?? 0, options.z ?? 0);
  g.rotation.y = options.rotation ?? 0;
  g.scale.setScalar(options.scale ?? 1);
  g.userData.dimensions = dimensions;
  (options.parent ?? world.static).add(g);
  return g;
}

function mesh(world, parent, geometry, mat, position = [0, 0, 0], rotation) {
  const m = world.mesh(geometry, mat, ...position, parent);
  if (rotation) m.rotation.set(...rotation);
  return m;
}

function box(world, parent, size, mat, position, radius = 0) {
  const geo = radius ? new RoundedBoxGeometry(...size, 2, radius) : new THREE.BoxGeometry(...size);
  return mesh(world, parent, geo, mat, position);
}

function rod(world, parent, from, to, radius, mat, segments = 8) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const m = mesh(world, parent, new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), segments), mat, a.clone().add(b).multiplyScalar(.5).toArray());
  m.quaternion.setFromUnitVectors(UP, b.sub(a).normalize());
  return m;
}

function curve(world, parent, points, radius, mat, segments = 16, sides = 6) {
  const path = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  return mesh(world, parent, new THREE.TubeGeometry(path, segments, radius, sides, false), mat);
}

function ring(world, parent, radius, tube, mat, position, rotation = [Math.PI / 2, 0, 0], segments = 24) {
  return mesh(world, parent, new THREE.TorusGeometry(radius, tube, 5, segments), mat, position, rotation);
}

function dialMaterial() {
  if (materials.has('radio-dial')) return materials.get('radio-dial');
  const c = document.createElement('canvas'); c.width = 768; c.height = 192;
  const ctx = c.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 0, 192);
  bg.addColorStop(0, '#473f2c'); bg.addColorStop(.45, '#a8965d'); bg.addColorStop(1, '#63583a');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 768, 192);
  ctx.strokeStyle = '#d4c397'; ctx.lineWidth = 2;
  for (let i = 0; i <= 54; i++) {
    const x = 27 + i * 13.2;
    ctx.beginPath(); ctx.moveTo(x, 58); ctx.lineTo(x, i % 5 ? 78 : 99); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, 132); ctx.lineTo(x, i % 5 ? 144 : 159); ctx.stroke();
  }
  ctx.font = '22px Georgia, serif'; ctx.fillStyle = '#e0d2ad'; ctx.textAlign = 'center';
  ['530', '600', '800', '1000', '1200', '1600'].forEach((t, i) => ctx.fillText(t, 60 + i * 128, 41));
  ctx.font = '16px Georgia, serif'; ctx.textAlign = 'left'; ctx.fillText('AM', 18, 119); ctx.fillText('kHz', 710, 119);
  ctx.fillStyle = '#d5ae77'; ctx.fillRect(370, 17, 4, 153);
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  const m = new THREE.MeshStandardMaterial({ map, roughness: .32, emissive: '#c09b4d', emissiveIntensity: .12 });
  materials.set('radio-dial', m); return m;
}

/**
 * Old wooden AM radio: cabinet 1.12 × .73 × .38; antenna reaches 1.31 m.
 * detailedRadio(world, {x, y, z, rotation, scale, parent, antenna: true})
 * Place y at the tabletop height. Speaker threads, dial, feet and knobs are 3D.
 */
export function detailedRadio(world, options = {}) {
  const g = group(world, options, 'old-wooden-radio', [1.13, 1.31, .49]);
  const walnut = textured('wood', '#b59572', [1.8, 1]);
  const darkWood = textured('wood', '#745b49', [1, 1]);
  const brass = material('aged-brass', '#c9ad72', { metalness: .55, roughness: .5 });
  const bakelite = material('bakelite', '#302e23', { roughness: .52 });
  const thread = material('radio-thread', '#d3c29c', { roughness: .98 });
  const fabric = textured('fabric', '#c5ad7f', [2, 2]);
  const shadow = material('prop-shadow', '#272921');
  for (const x of [-.4, .4]) for (const z of [-.13, .13]) {
    box(world, g, [.12, .065, .11], bakelite, [x, .0325, z], .015);
  }
  box(world, g, [1.12, .65, .38], walnut, [0, .385, 0], .055);
  box(world, g, [1.035, .556, .022], brass, [0, .385, .189], .025);
  box(world, g, [1.007, .53, .03], darkWood, [0, .385, .204], .02);
  // Raised cabinet mouldings cast a thin shadow above the grille.
  box(world, g, [1.04, .021, .04], walnut, [0, .67, .188], .009);
  box(world, g, [1.04, .024, .04], walnut, [0, .10, .188], .009);
  box(world, g, [.615, .458, .011], shadow, [-.173, .394, .224], .026);
  box(world, g, [.583, .427, .007], fabric, [-.173, .394, .232], .019);
  // Fine cotton weave is geometry, backed by the generated fabric surface.
  for (let i = 0; i < 35; i++) {
    const x = -.45 + i * .0163;
    rod(world, g, [x, .191, .237], [x, .597, .237], .0016, thread, 4);
  }
  for (let i = 0; i < 27; i++) {
    const y = .188 + i * .0158;
    rod(world, g, [-.45, y, .239], [.101, y, .239], .0019, thread, 4);
  }
  box(world, g, [.021, .45, .025], brass, [.154, .394, .23], .006);
  box(world, g, [.30, .112, .012], bakelite, [.333, .548, .227], .009);
  mesh(world, g, new THREE.PlaneGeometry(.273, .083), dialMaterial(), [.333, .548, .235]);
  for (const x of [.248, .423]) {
    mesh(world, g, new THREE.CylinderGeometry(.059, .059, .008, 24), brass, [x, .31, .238], [Math.PI / 2, 0, 0]);
    mesh(world, g, new THREE.CylinderGeometry(.046, .05, .041, 24), bakelite, [x, .31, .261], [Math.PI / 2, 0, 0]);
    ring(world, g, .039, .002, brass, [x, .31, .283], [0, 0, 0]);
    box(world, g, [.005, .026, .003], thread, [x, .328, .286], .001);
    // Moulded ridges around each tuning knob, visible in raking light.
    for (let k = 0; k < 20; k++) {
      const a = k / 20 * Math.PI * 2;
      rod(world, g, [x + Math.cos(a) * .049, .31 + Math.sin(a) * .049, .243], [x + Math.cos(a) * .046, .31 + Math.sin(a) * .046, .277], .0012, darkWood, 4);
    }
  }
  box(world, g, [.185, .026, .004], brass, [.333, .429, .228], .005);
  for (const x of [-.485, .485]) for (const y of [.148, .625]) {
    mesh(world, g, new THREE.CylinderGeometry(.009, .009, .004, 8), brass, [x, y, .224], [Math.PI / 2, 0, 0]);
    box(world, g, [.011, .0015, .001], darkWood, [x, y, .227]);
  }
  // Ventilation and a recessed rear service panel keep the rear useful in 3D.
  box(world, g, [.87, .43, .009], darkWood, [0, .376, -.193], .015);
  for (let i = 0; i < 12; i++) box(world, g, [.014, .19, .005], shadow, [-.33 + i * .06, .41, -.2], .003);
  // Bent carrying handle with riveted mounts.
  for (const x of [-.26, .26]) box(world, g, [.084, .024, .10], brass, [x, .712, -.025], .006);
  curve(world, g, [[-.26, .718, -.025], [-.22, .79, -.025], [0, .811, -.025], [.22, .79, -.025], [.26, .718, -.025]], .018, bakelite, 18, 7);
  if (options.antenna !== false) {
    const chrome = textured('iron', '#aaa895');
    mesh(world, g, new THREE.SphereGeometry(.025, 8, 6), brass, [.42, .708, -.08]);
    rod(world, g, [.42, .718, -.08], [.49, 1.02, -.11], .011, chrome);
    rod(world, g, [.49, 1.02, -.11], [.552, 1.293, -.137], .006, chrome);
    mesh(world, g, new THREE.SphereGeometry(.012, 8, 6), brass, [.552, 1.298, -.137]);
  }
  return g;
}

function bambooPole(world, parent, a, b, radius, mat) {
  rod(world, parent, a, b, radius, mat, 9);
  const start = new THREE.Vector3(...a), delta = new THREE.Vector3(...b).sub(start);
  const length = delta.length(), direction = delta.clone().normalize();
  const nodeMat = material('bamboo-node', '#a89364');
  const count = Math.max(1, Math.round(length / .24));
  for (let j = 1; j <= count; j++) {
    const position = start.clone().addScaledVector(delta, j / (count + 1));
    const node = ring(world, parent, radius * 1.03, .003, nodeMat, position.toArray(), [0, 0, 0], 10);
    node.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
  }
}

/**
 * Bamboo chair (default) .78 × 1.23 × .84 m, seat height .51 m.
 * bambooSeat(world, {...transform, type: 'chair' | 'stool'})
 * Stool is .68 × .55 × .62 m. Backrest and armrests face +Z.
 */
export function bambooSeat(world, options = {}) {
  const stool = options.type === 'stool';
  const g = group(world, options, stool ? 'woven-bamboo-stool' : 'woven-bamboo-chair', stool ? [.68, .55, .62] : [.78, 1.23, .84]);
  const bamboo = textured('wood', '#d9be87', [.4, 2]);
  const cane = material('cane-strand', '#c8ab75', { roughness: .96 });
  const darkCane = material('cane-strand-shadow', '#998659', { roughness: .98 });
  const width = stool ? .28 : .31, depth = stool ? .24 : .28, seatY = stool ? .51 : .50;
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    bambooPole(world, g, [x * (width + .032), .024, z * (depth + .035)], [x * width, seatY, z * depth], .027, bamboo);
  }
  for (const x of [-1, 1]) {
    bambooPole(world, g, [x * width, .20, -depth], [x * width, .20, depth], .019, bamboo);
    bambooPole(world, g, [x * width, seatY, -depth - .035], [x * width, seatY, depth + .035], .034, bamboo);
  }
  for (const z of [-1, 1]) {
    bambooPole(world, g, [-width, .24, z * depth], [width, .24, z * depth], .019, bamboo);
    bambooPole(world, g, [-width, seatY, z * depth], [width, seatY, z * depth], .034, bamboo);
  }
  // Individually woven flat strips sag slightly in the centre of the seat.
  const seatWidth = width * 2 - .035, seatDepth = depth * 2 - .035;
  for (let i = 0; i < 22; i++) {
    const x = -seatWidth / 2 + seatWidth * i / 21;
    curve(world, g, [[x, seatY + .019, -seatDepth / 2], [x, seatY + .011, 0], [x, seatY + .019, seatDepth / 2]], .006, i % 3 ? cane : darkCane, 5, 4);
  }
  for (let i = 0; i < 20; i++) {
    const z = -seatDepth / 2 + seatDepth * i / 19;
    curve(world, g, [[-seatWidth / 2, seatY + .018, z], [0, seatY + .008, z], [seatWidth / 2, seatY + .018, z]], .005, cane, 5, 4);
  }
  if (!stool) {
    for (const side of [-1, 1]) {
      // Leaned, bent bamboo frame; the silhouette is a chair, not stacked boxes.
      curve(world, g, [[side * width, .34, -depth], [side * width, .82, -depth - .032], [side * (width - .012), 1.14, -depth - .13], [side * .24, 1.205, -depth - .145]], .027, bamboo, 16, 8);
      curve(world, g, [[side * width, .55, depth * .70], [side * (width + .033), .737, depth * .79], [side * (width + .034), .764, -.05], [side * width, .775, -depth - .02]], .021, bamboo, 14, 8);
      bambooPole(world, g, [side * width, seatY, depth * .68], [side * (width + .033), .735, depth * .78], .019, bamboo);
    }
    curve(world, g, [[-.27, 1.184, -depth - .14], [-.14, 1.223, -depth - .151], [.14, 1.223, -depth - .151], [.27, 1.184, -depth - .14]], .027, bamboo, 12, 8);
    bambooPole(world, g, [-width, .73, -depth - .012], [width, .73, -depth - .012], .021, bamboo);
    for (let i = 0; i < 20; i++) {
      const x = -.273 + i * .0287;
      curve(world, g, [[x, .741, -depth - .012], [x, .93, -depth - .063], [x, 1.174, -depth - .129]], .0048, i % 4 ? cane : darkCane, 6, 4);
    }
    for (let i = 0; i < 18; i++) {
      const y = .753 + i * .0245, z = -depth - .016 - (y - .753) * .275;
      curve(world, g, [[-.285, y, z], [0, y, z + .021], [.285, y, z]], .0043, cane, 6, 4);
    }
  }
  // Lashings around the structural corners have their own light-catching ridge.
  for (const x of [-width, width]) for (const z of [-depth, depth]) for (let j = 0; j < 5; j++) {
    ring(world, g, .03, .0026, cane, [x, seatY - .014 - j * .008, z], undefined, 10);
  }
  return g;
}

function leafGeometry(leaves) {
  const positions = [], colors = [], uv = [];
  const baseColor = new THREE.Color();
  for (const { root, tip, width, shade } of leaves) {
    const direction = tip.clone().sub(root), axis = direction.clone().cross(UP).normalize();
    if (!axis.lengthSq()) axis.set(1, 0, 0);
    const mid = root.clone().addScaledVector(direction, .43);
    const ridge = mid.clone().add(new THREE.Vector3(0, width * .28, 0));
    const left = mid.clone().addScaledVector(axis, width), right = mid.clone().addScaledVector(axis, -width);
    const points = [root, left, ridge, right, tip];
    // A folded, tapered leaf with an actual centre ridge and curved-looking tip.
    const indices = [0, 1, 2, 0, 2, 3, 1, 4, 2, 2, 4, 3];
    const uvs = [[.5, 0], [0, .43], [.5, .43], [1, .43], [.5, 1]];
    // Store vertex colours in linear space, just as material colour strings are
    // converted. Without this conversion direct sunlight bleaches the leaves.
    baseColor.setHSL(.255 + shade * .040, .38 + shade * .12, .34 + shade * .17, THREE.SRGBColorSpace);
    for (const i of indices) {
      positions.push(...points[i].toArray()); uv.push(...uvs[i]);
      const lit = i === 2 ? 1.16 : i === 1 ? .82 : 1;
      colors.push(baseColor.r * lit, baseColor.g * lit, baseColor.b * lit);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals(); return geo;
}

/**
 * Handmade terracotta planter with pinnate fern leaves. Approximately
 * 1.65 × 1.12 × 1.65 m; pot is .63 m across and .52 m tall.
 * fernPlanter(world, {...transform, seed: 1, fronds: 17})
 * Leaflets are one vertex-coloured mesh, with no alpha cards or sphere foliage.
 */
export function fernPlanter(world, options = {}) {
  const g = group(world, options, 'terracotta-fern', [1.65, 1.12, 1.65]);
  const clay = material('weathered-clay', '#c78f6c', { roughness: .99 });
  const lip = material('clay-rim', '#e1af84', { roughness: .97 });
  const soil = material('potting-soil', '#343a25', { roughness: 1 });
  const stalk = material('fern-stalk', '#84a45e', { roughness: .97 });
  const potProfile = [[0, .015], [.28, .015], [.3, .031], [.295, .065], [.225, .065], [.235, .11], [.275, .42], [.305, .466], [.312, .487], [.306, .512], [.281, .512], [.28, .478], [.257, .433]].map(p => new THREE.Vector2(...p));
  const pot = new THREE.LatheGeometry(potProfile, 28);
  const vertices = pot.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i), z = vertices.getZ(i), a = Math.atan2(z, x);
    const variation = 1 + Math.sin(a * 7) * .009 + Math.sin(a * 13 + 1.3) * .005;
    vertices.setXYZ(i, x * variation, vertices.getY(i), z * variation);
  }
  pot.computeVertexNormals(); mesh(world, g, pot, clay);
  ring(world, g, .301, .01, lip, [0, .478, 0]);
  ring(world, g, .274, .006, lip, [0, .415, 0]);
  mesh(world, g, new THREE.CylinderGeometry(.275, .275, .025, 24), soil, [0, .465, 0]);
  for (let i = 0; i < 8; i++) {
    const a = i * 2.4, r = .075 + (i % 3) * .051;
    const pebble = mesh(world, g, new THREE.IcosahedronGeometry(.026, 0), i % 3 ? soil : lip, [Math.cos(a) * r, .481, Math.sin(a) * r]);
    pebble.scale.set(1, .4, .7);
  }
  let seed = Math.max(1, Math.floor(options.seed ?? 31));
  const rand = () => { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; };
  const leaves = [], fronds = options.fronds ?? 17;
  for (let j = 0; j < fronds; j++) {
    const theta = j * 2.39996 + rand() * .23;
    const radial = new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta));
    const lateral = new THREE.Vector3(-Math.sin(theta), 0, Math.cos(theta));
    const length = .58 + rand() * .20, height = .29 + rand() * .24;
    const start = radial.clone().multiplyScalar(.03 + rand() * .065); start.y = .48;
    const path = [];
    const at = t => start.clone().addScaledVector(radial, length * t).add(new THREE.Vector3(0, .12 * t + Math.sin(t * Math.PI * .92) * height, 0));
    for (let k = 0; k <= 12; k++) path.push(at(k / 12).toArray());
    curve(world, g, path, .0033, stalk, 14, 4);
    for (let k = 1; k <= 13; k++) {
      const t = .10 + k * .063, root = at(t);
      const leafletLength = (.10 + .125 * Math.sin(t * Math.PI)) * Math.pow(1 - t * .71, .8);
      for (const side of [-1, 1]) {
        const tip = root.clone().addScaledVector(lateral, side * leafletLength).addScaledVector(radial, leafletLength * .44);
        tip.y += (.5 - t) * leafletLength * .4 - .019;
        leaves.push({ root, tip, width: leafletLength * .255, shade: rand() });
      }
    }
    leaves.push({ root: at(.92), tip: at(1.065), width: .024, shade: rand() });
  }
  // Several young unfurling fronds make the middle lush instead of a flat rosette.
  for (let j = 0; j < 4; j++) {
    const a = j * 2.3, end = [.19 * Math.cos(a), 1.09 - j * .038, .19 * Math.sin(a)];
    curve(world, g, [[0, .48, 0], [.07 * Math.cos(a), .78, .07 * Math.sin(a)], end, [end[0] * 1.06, end[1] + .008, end[2] * 1.06]], .0035, stalk, 10, 4);
    for (let k = 0; k < 7; k++) for (const side of [-1, 1]) {
      const root = new THREE.Vector3(end[0] * k / 7, .60 + k * .067, end[2] * k / 7);
      const length = .085 - k * .007;
      leaves.push({ root, tip: root.clone().add(new THREE.Vector3(Math.cos(a + side) * length, .04, Math.sin(a + side) * length)), width: .013, shade: .6 + rand() * .3 });
    }
  }
  mesh(world, g, leafGeometry(leaves), material('fern-leaf', '#ffffff', { vertexColors: true, side: THREE.DoubleSide, roughness: .88 }));
  return g;
}

/**
 * Desk lamp: .53 × .72 × .63 m. Hurricane lantern: .41 × .84 × .34 m.
 * heirloomLamp(world, {...transform, type:'desk'|'lantern', light:false})
 * The optional light is local, low-intensity and disabled by default; emissive
 * glass remains visible without it. Do not animate after World.optimize().
 */
export function heirloomLamp(world, options = {}) {
  const lantern = options.type === 'lantern';
  const g = group(world, options, lantern ? 'old-hurricane-lantern' : 'enamel-desk-lamp', lantern ? [.41, .84, .34] : [.53, .72, .63]);
  const enamel = textured('painted-wood', '#8eaba3', [1, 1]);
  const iron = textured('iron', '#80948d');
  const brass = material('aged-brass', '#c9ad72', { metalness: .55, roughness: .5 });
  const ivory = material('lamp-shade-interior', '#f2e5c4', { roughness: .54 });
  const glow = material('lamp-glow', '#f8d594', { emissive: '#ffc47a', emissiveIntensity: 1.7, roughness: .3 });
  const cord = material('cloth-cable', '#393c31', { roughness: 1 });
  if (lantern) {
    const profile = [[0, .025], [.14, .025], [.166, .043], [.166, .075], [.144, .104], [.129, .125], [.096, .145], [.096, .18], [0, .18]].map(p => new THREE.Vector2(...p));
    mesh(world, g, new THREE.LatheGeometry(profile, 24), iron);
    const glassProfile = [[.094, .16], [.125, .19], [.15, .265], [.145, .37], [.117, .465], [.087, .50]].map(p => new THREE.Vector2(...p));
    mesh(world, g, new THREE.LatheGeometry(glassProfile, 24), material('lantern-glass', '#d7cb9f', { transparent: true, opacity: .23, roughness: .23, side: THREE.DoubleSide, depthWrite: false }));
    mesh(world, g, new THREE.CylinderGeometry(.063, .068, .035, 16), brass, [0, .18, 0]);
    const flame = mesh(world, g, new THREE.SphereGeometry(.045, 9, 7), glow, [0, .259, 0]); flame.scale.set(.6, 1.8, .6);
    for (const side of [-1, 1]) {
      curve(world, g, [[side * .135, .095, 0], [side * .18, .19, 0], [side * .18, .43, 0], [side * .12, .535, 0]], .014, iron, 14, 6);
    }
    ring(world, g, .153, .006, iron, [0, .29, 0]);
    for (const z of [-.11, .11]) curve(world, g, [[-.112, .21, z * .8], [0, .198, z * 1.25], [.112, .21, z * .8]], .003, brass, 10, 4);
    const capProfile = [[.07, .495], [.145, .503], [.154, .521], [.12, .54], [.085, .59], [.077, .612], [.04, .625], [0, .625]].map(p => new THREE.Vector2(...p));
    mesh(world, g, new THREE.LatheGeometry(capProfile, 24), iron);
    for (let i = 0; i < 10; i++) {
      const a = i * Math.PI / 5;
      box(world, g, [.012, .014, .003], cord, [Math.sin(a) * .083, .596, Math.cos(a) * .083]).rotation.y = a;
    }
    curve(world, g, [[-.123, .535, 0], [-.174, .69, 0], [-.10, .831, 0], [.10, .831, 0], [.174, .69, 0], [.123, .535, 0]], .007, iron, 22, 6);
    mesh(world, g, new THREE.CylinderGeometry(.021, .021, .033, 12), brass, [.148, .117, 0], [0, 0, Math.PI / 2]);
  } else {
    const profile = [[0, .012], [.155, .012], [.183, .028], [.187, .047], [.176, .061], [.145, .077], [0, .085]].map(p => new THREE.Vector2(...p));
    mesh(world, g, new THREE.LatheGeometry(profile, 28), enamel);
    ring(world, g, .177, .004, brass, [0, .054, 0]);
    mesh(world, g, new THREE.CylinderGeometry(.039, .054, .057, 16), brass, [0, .10, 0]);
    curve(world, g, [[0, .123, 0], [0, .31, -.045], [0, .552, -.051], [0, .63, .07], [0, .601, .16]], .011, brass, 20, 8);
    const shade = new THREE.Group(); shade.position.set(0, .57, .155); shade.rotation.x = -.17; g.add(shade);
    const shadeProfile = [[.021, .115], [.047, .111], [.06, .082], [.108, .052], [.186, .013], [.22, -.01], [.225, -.022]].reverse().map(p => new THREE.Vector2(...p));
    const outside = new THREE.LatheGeometry(shadeProfile, 28); mesh(world, shade, outside, enamel);
    const inside = new THREE.LatheGeometry(shadeProfile.map(p => new THREE.Vector2(p.x * .977, p.y - .004)), 28);
    mesh(world, shade, inside, material('shade-inner', '#ddd0a0', { side: THREE.BackSide, roughness: .5 }));
    ring(world, shade, .222, .006, brass, [0, -.018, 0]);
    mesh(world, shade, new THREE.CylinderGeometry(.024, .024, .045, 12), ivory, [0, .055, 0]);
    const bulb = mesh(world, shade, new THREE.SphereGeometry(.033, 12, 8), glow, [0, .007, 0]); bulb.scale.y = 1.25;
    mesh(world, g, new THREE.CylinderGeometry(.02, .02, .021, 12), brass, [.09, .084, .045]);
    rod(world, g, [.09, .093, .045], [.09, .12, .034], .005, cord, 6);
    curve(world, g, [[0, .03, -.135], [.14, .012, -.24], [.285, .009, -.11], [.26, .009, .045]], .005, cord, 18, 5);
    box(world, g, [.038, .018, .058], cord, [.26, .012, .066], .006);
  }
  if (options.light) {
    const light = new THREE.PointLight('#ffd08a', lantern ? .7 : 1.1, 2.7, 2);
    light.position.set(0, lantern ? .28 : .50, lantern ? 0 : .17);
    // World.optimize() discards the static hierarchy after merging meshes.
    // Keep optional actual lights in the live scene, at their final transform.
    if (world.scene) {
      g.updateWorldMatrix(true, false);
      light.position.applyMatrix4(g.matrixWorld);
      light.distance *= options.scale ?? 1;
      world.scene.add(light);
    } else g.add(light);
  }
  return g;
}
