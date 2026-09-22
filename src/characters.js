import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const palette = new Map();
// Broad painted light bands give the original residents a clear anime silhouette.
const tones = new THREE.DataTexture(new Uint8Array([112, 162, 208, 244, 255]), 5, 1, THREE.RedFormat);
tones.minFilter = tones.magFilter = THREE.NearestFilter; tones.needsUpdate = true;
const characterMaterial = new THREE.MeshToonMaterial({ color: '#ffffff', vertexColors: true, gradientMap: tones });
const UP = new THREE.Vector3(0, 1, 0);
function material(color, roughness = .87) {
  const key = `${color}:${roughness}`;
  if (!palette.has(key)) palette.set(key, new THREE.MeshStandardMaterial({ color, roughness }));
  return palette.get(key);
}
function shade(color, amount) { return `#${new THREE.Color(color).multiplyScalar(amount).getHexString()}`; }
function add(parent, geometry, mat, at = [0, 0, 0], rotation) {
  const m = new THREE.Mesh(geometry, mat); m.position.set(...at);
  if (rotation) m.rotation.set(...rotation);
  m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function ellipsoid(parent, size, mat, at, segments = 16) {
  const m = add(parent, new THREE.SphereGeometry(1, segments, 10), mat, at); m.scale.set(...size); return m;
}
function rounded(parent, size, mat, at, radius = .016) {
  return add(parent, new RoundedBoxGeometry(...size, 2, radius), mat, at);
}
function rod(parent, from, to, radius, mat, endRadius = radius) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const m = add(parent, new THREE.CylinderGeometry(endRadius, radius, a.distanceTo(b), 9), mat, a.clone().add(b).multiplyScalar(.5).toArray());
  m.quaternion.setFromUnitVectors(UP, b.sub(a).normalize()); return m;
}
function stroke(parent, points, radius, mat, segments = 8) {
  return add(parent, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), segments, radius, 5, false), mat);
}
function patch(parent, points, mat) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, .5, 1], 2));
  g.computeVertexNormals(); return add(parent, g, mat);
}
function joint(name, parent, at = [0, 0, 0]) {
  const bone = new THREE.Bone(); bone.name = name; bone.position.set(...at); parent.add(bone); return bone;
}
function softJoint(mesh, lowerBone, upperY, lowerY) {
  mesh.userData.softJoint = { lowerBone, upperY, lowerY }; return mesh;
}

function hairLock(parent, points, width, mat) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  const geo = new THREE.TubeGeometry(curve, 10, 1, 8, false), positions = geo.attributes.position;
  for (let row = 0; row <= 10; row++) {
    const t = row / 10, center = curve.getPointAt(t), radius = width * (.96 - .93 * t ** 1.7);
    for (let col = 0; col <= 8; col++) {
      const index = row * 9 + col;
      positions.setXYZ(index, center.x + (positions.getX(index) - center.x) * radius,
        center.y + (positions.getY(index) - center.y) * radius,
        center.z + (positions.getZ(index) - center.z) * radius * .55);
    }
  }
  geo.computeVertexNormals(); return add(parent, geo, mat);
}

// A smooth elliptical loft with a shaped waist/shoulder or knee/ankle profile.
function garment(profile, segments = 20, smooth = false) {
  if(smooth) {
    const source=profile,expanded=[];
    const cubic=(a,b,c,d,t)=>.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);
    for(let i=0;i<source.length-1;i++)for(let n=0;n<4;n++) {
      const t=n/4,point=[];
      for(let j=0;j<5;j++)point.push(j===0?source[i][0]+(source[i+1][0]-source[i][0])*t:
        cubic(source[Math.max(0,i-1)][j]||0,source[i][j]||0,source[i+1][j]||0,source[Math.min(source.length-1,i+2)][j]||0,t));
      expanded.push(point);
    }
    expanded.push(source.at(-1));profile=expanded;
  }
  const p = [], uv = [], indices = [], descending = profile.at(-1)[0] < profile[0][0];
  for (let y = 0; y < profile.length; y++) {
    const [height, width, depth, offset = 0, centerX = 0] = profile[y];
    for (let j = 0; j <= segments; j++) {
      const a = j / segments * Math.PI * 2;
      p.push(Math.sin(a) * width + centerX, height, Math.cos(a) * depth + offset);
      uv.push(j / segments, y / (profile.length - 1));
      if (y && j) {
        const n = y * (segments + 1) + j;
        if (descending) indices.push(n, n - segments - 2, n - 1, n, n - segments - 1, n - segments - 2);
        else indices.push(n, n - 1, n - segments - 2, n, n - segments - 2, n - segments - 1);
      }
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(indices); g.computeVertexNormals();
  // Both vertices at the wrap seam describe the same cloth surface.
  const normals = g.attributes.normal, normal = new THREE.Vector3();
  for (let row = 0; row < profile.length; row++) {
    const first = row * (segments + 1), last = first + segments;
    normal.set(normals.getX(first) + normals.getX(last), normals.getY(first) + normals.getY(last), normals.getZ(first) + normals.getZ(last)).normalize();
    normals.setXYZ(first, normal.x, normal.y, normal.z); normals.setXYZ(last, normal.x, normal.y, normal.z);
  }
  return g;
}

function clothPanel(parent, rows, mat) {
  const positions = [], uvs = [], indices = [], segments = 8;
  rows.forEach(([y, left, right, depth], row) => {
    for (let col = 0; col <= segments; col++) {
      const t = col / segments, x = left + (right - left) * t;
      positions.push(x, y + (row === rows.length - 1 ? Math.sin(t * Math.PI * 2) * .005 : 0), depth - .028 * (x / .21) ** 2);
      uvs.push(t, row / (rows.length - 1));
      if (row && col) { const n = row * (segments + 1) + col; indices.push(n, n - segments - 2, n - 1, n, n - segments - 1, n - segments - 2); }
    }
  });
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geo.setIndex(indices); geo.computeVertexNormals(); add(parent, geo, mat);
}

function scalp(parent, hair, streak, female, elderly) {
  let secondary = null;
  const p = [], uv = [], indices = [], columns = 32, rows = 12;
  // Front +Z stays open for the face; the same continuous cap wraps below the
  // ears at the back. Stopping at pi/2 exposed a skin-coloured rear hemisphere.
  const boundary = phi => (female && !elderly ? 1.20 : 1.27) + (1 - Math.cos(phi)) * .62 + Math.abs(Math.sin(phi)) * .16 + Math.sin(phi * 3) * .035 + (female ? Math.sin(phi) * .07 : 0);
  const surface = (phi, theta, lift = 0) => [
    Math.sin(phi) * Math.sin(theta) * (.184 + lift),
    1.562 + Math.cos(theta) * (.216 + lift),
    Math.cos(phi) * Math.sin(theta) * (.163 + lift) - .013,
  ];
  for (let row = 0; row <= rows; row++) for (let col = 0; col <= columns; col++) {
    const phi = col / columns * Math.PI * 2;
    // Forehead, temples and nape have different hairlines, with a side part.
    const hairline = boundary(phi);
    const theta = row / rows * hairline;
    p.push(...surface(phi, theta));
    uv.push(col / columns, row / rows);
    if (row && col) { const n = row * (columns + 1) + col; indices.push(n, n - columns - 2, n - 1, n, n - columns - 1, n - columns - 2); }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(indices); geo.computeVertexNormals();
  const normals = geo.attributes.normal, seamNormal = new THREE.Vector3();
  for (let row = 0; row <= rows; row++) {
    const first = row * (columns + 1), last = first + columns;
    seamNormal.set(normals.getX(first) + normals.getX(last), normals.getY(first) + normals.getY(last), normals.getZ(first) + normals.getZ(last)).normalize();
    normals.setXYZ(first, seamNormal.x, seamNormal.y, seamNormal.z);
    normals.setXYZ(last, seamNormal.x, seamNormal.y, seamNormal.z);
  }
  for (let col = 0; col <= columns; col++) normals.setXYZ(col, 0, 1, 0);
  add(parent, geo, hair);
  for (let i = 0; i < 7; i++) {
    const endPhi = -.9 + i * .34, points = [];
    for (let j = 0; j <= 8; j++) {
      const t = j / 8, phi = endPhi - (female ? .45 : .12) * (1 - t), theta = .10 + t * (boundary(endPhi) * .965 - .10);
      points.push(surface(phi, theta, .002));
    }
    stroke(parent, points, elderly ? .0021 : .0018, i % 3 === 0 ? streak : hair, 10);
  }
  for (const side of [-1, 1]) {
    hairLock(parent, [[side * .134, 1.691, .041], [side * .181, 1.601, .041], [side * .166, 1.454, .016]], .039, hair);
    // A few broad locks keep the back silhouette deliberate at gameplay scale.
    hairLock(parent, [[side * .107, 1.679, -.119], [side * .124, 1.550, -.152], [side * .092, 1.405, -.113]], .042, hair);
    stroke(parent, [[side * .143, 1.693, -.074], [side * .176, 1.605, -.063], [side * .159, 1.489, -.054]], .0024, streak, 9);
  }
  if (female) {
    if (elderly) {
      ellipsoid(parent, [.096, .080, .077], hair, [0, 1.529, -.177]);
      for (let i = 0; i < 4; i++) stroke(parent, [[-.065, 1.525 + i * .014, -.211], [0, 1.555 + i * .014, -.24], [.065, 1.529 + i * .014, -.211]], .003, streak, 8);
    } else {
      const tail=joint('ponytail root',parent,[0,1.584,-.181]);
      const tip=joint('ponytail tip',tail,[.014,-.145,-.06]);
      const lock=hairLock(tail,[[0,.012,.018],[.005,-.06,-.062],[.029,-.17,-.074],[.014,-.263,-.023]],.065,hair);
      softJoint(lock,tip,-.09,-.22);
      for(const x of[-.022,.018])softJoint(stroke(tail,[[x,.007,-.014],[x+.005,-.10,-.091],[x+.012,-.235,-.036]],.0026,streak,12),tip,-.09,-.22);
      ellipsoid(parent, [.055, .013, .042], material('#cf9562'), [0, 1.575, -.198]);
      secondary={root:tail,tip};
    }
  }
  return secondary;
}

// Keep the full joint hierarchy, but submit one skinned draw per resident.
// Sleeves and trousers blend continuously across their joints. Colours are
// baked once, never rebuilt during animation.
function proportionsFor(player, youthful) {
  if (!player && !youthful) return null;
  return player
    ? { hip:1.02, upper:.48, lower:.455, ankle:.085, head:.90, neck:1.465, hem:.962, shoulderWidth:.94, legWidth:.90, hipHalfWidth:.099 }
    : { hip:.94, upper:.44, lower:.425, ankle:.075, head:.96, neck:1.405, hem:.814, shoulderWidth:.98, legWidth:.96, hipHalfWidth:.102 };
}

// Retarget the authored anatomy before skin binding. Bones and surface vertices
// share the same piecewise map; limb lengths never come from bone scaleY.
function proportionTransform(bone, y, shape) {
  let part = bone;
  while (part && !['head','spine','pelvis','canvas backpack','left shoulder','right shoulder','left hip','right hip','left ankle','right ankle'].includes(part.name)) part = part.parent;
  const kind = part?.name ?? 'pelvis';
  const torsoY = (shape.neck - shape.hem) / (1.36 - .797);
  const torsoOffset = shape.hem - .797 * torsoY;
  if (kind === 'head') return [shape.head,shape.head,shape.head,0,shape.neck-1.36*shape.head,0];
  if (kind.includes('ankle')) return [shape.shoulderWidth,1,1,(kind.startsWith('left')?-1:1)*(shape.hipHalfWidth-.104*shape.shoulderWidth),shape.ankle-.075,0];
  if (kind.includes('hip')) {
    const upper = y >= .465;
    const sy = upper ? shape.upper/.405 : shape.lower/.39;
    const oy = upper ? shape.hip-.87*sy : shape.ankle-.075*sy;
    const side = kind.startsWith('left') ? -1 : 1;
    return [shape.legWidth,sy,.96,side*(shape.hipHalfWidth-.104*shape.legWidth),oy,0];
  }
  if (kind.includes('shoulder')) return [shape.shoulderWidth,1,shape.shoulderWidth,0,1.265*torsoY+torsoOffset-1.265,0];
  if (kind === 'canvas backpack') {
    const scale = shape.shoulderWidth;
    return [scale,scale,scale,0,1.21*torsoY+torsoOffset-1.21*scale,-.17*(1-scale)];
  }
  if (kind === 'spine') return [shape.shoulderWidth,torsoY,shape.shoulderWidth,0,torsoOffset,0];
  return [1,1,1,0,0,0];
}

function bindCharacter(group, shape = null) {
  group.updateWorldMatrix(true, true);
  const bones = [], meshes = [], geometries = [], inverse = group.matrixWorld.clone().invert();
  group.traverse(obj => { if (obj.isBone) bones.push(obj); if (obj.isMesh) meshes.push(obj); });
  const indices = new Map(bones.map((bone, index) => [bone, index]));
  const targets = shape ? new Map(bones.map(bone => {
    const p = bone.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse);
    const [sx,sy,sz,ox,oy,oz] = proportionTransform(bone,p.y,shape);
    return [bone,p.set(p.x*sx+ox,p.y*sy+oy,p.z*sz+oz)];
  })) : null;
  for (const obj of meshes) {
    if (!obj.isMesh) return;
    const transform = inverse.clone().multiply(obj.matrixWorld);
    const transformed = obj.geometry.clone();
    const soft=obj.userData.softJoint;
    if(soft) {
      const local=transformed.attributes.position,blend=new Float32Array(local.count);
      for(let i=0;i<local.count;i++){
        const t=THREE.MathUtils.clamp((soft.upperY-local.getY(i))/(soft.upperY-soft.lowerY),0,1);
        blend[i]=t*t*(3-2*t);
      }
      transformed.setAttribute('jointBlend',new THREE.Float32BufferAttribute(blend,1));
    }
    transformed.applyMatrix4(transform);
    const geometry = transformed.index ? transformed.toNonIndexed() : transformed;
    if (geometry !== transformed) transformed.dispose();
    const count = geometry.attributes.position.count, existing = geometry.attributes.color;
    const colors = new Float32Array(count * 3), color = obj.material.color;
    const skinIndices = new Uint16Array(count * 4), weights = new Float32Array(count * 4);
    let owner = obj.parent; while (owner && !indices.has(owner)) owner = owner.parent;
    const boneIndex = indices.get(owner) ?? 0;
    if (shape) {
      const position = geometry.attributes.position, normal = geometry.attributes.normal, n = new THREE.Vector3();
      for (let i=0;i<count;i++) {
        const [sx,sy,sz,ox,oy,oz] = proportionTransform(owner,position.getY(i),shape);
        position.setXYZ(i,position.getX(i)*sx+ox,position.getY(i)*sy+oy,position.getZ(i)*sz+oz);
        n.set(normal.getX(i)/sx,normal.getY(i)/sy,normal.getZ(i)/sz).normalize();
        normal.setXYZ(i,n.x,n.y,n.z);
      }
    }
    for (let i = 0; i < count; i++) {
      colors[i * 3] = color.r * (existing ? existing.getX(i) : 1);
      colors[i * 3 + 1] = color.g * (existing ? existing.getY(i) : 1);
      colors[i * 3 + 2] = color.b * (existing ? existing.getZ(i) : 1);
      const blend=geometry.attributes.jointBlend?.getX(i)||0;
      skinIndices[i * 4] = boneIndex; weights[i * 4] = 1-blend;
      if(soft){skinIndices[i*4+1]=indices.get(soft.lowerBone);weights[i*4+1]=blend;}
    }
    geometry.deleteAttribute('jointBlend');
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    geometries.push(geometry);
  }
  for (const mesh of meshes) { mesh.geometry.dispose(); mesh.removeFromParent(); }
  if (targets) {
    for (const bone of bones) {
      group.updateWorldMatrix(true,true);
      const target = targets.get(bone).clone().applyMatrix4(group.matrixWorld);
      bone.position.copy(bone.parent.worldToLocal(target));
    }
    group.updateWorldMatrix(true,true);
  }
  const merged = mergeGeometries(geometries, false);
  if (merged) {
    const mesh = new THREE.SkinnedMesh(merged, characterMaterial); mesh.name = `${group.name} · articulated character`;
    mesh.castShadow = true; mesh.receiveShadow = true;
    // A conservative static bound covers hand gestures and every gait pose.
    // It avoids rebuilding the CPU-skinned bounding box each animation frame.
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, .88, 0), 1.42);
    mesh.boundingBox = new THREE.Box3(new THREE.Vector3(-.85, -.18, -.85), new THREE.Vector3(.85, 1.96, .85));
    group.add(mesh); mesh.bind(new THREE.Skeleton(bones)); group.userData.characterMesh = mesh;
  }
  geometries.forEach(g => g.dispose());
}

/**
 * Illustrated residents in metres. The traveller is 1.85 m; older residents
 * retain their original build. Bottom origin, front +Z.
 * Does not attach to the world; call scene.add() as with the original character.
 * userData.legs/arms/head/body provide the articulated groups for town-life.js.
 */
export function createCharacter(world, shirt, trousers, player = false, id = '') {
  const g = new THREE.Group(); g.name = player ? '阿遥' : ({ granny: '林婆婆', chef: '蔡姨', dock: '周伯', community: '小许' }[id] ?? '街坊');
  const rigRoot = joint('pelvis', g), body = joint('spine', rigRoot), headGroup = joint('head', body);
  const rig = { root:rigRoot, elbows:[], hands:[], knees:[], ankles:[], eyes:[], held:[null,null], hipHeight:.87, upperLeg:.405, lowerLeg:.39, ankleHeight:.075, soleFront:.197, soleBack:-.101, bodyRestY:.86 };
  g.userData.rig = rig; g.userData.legs = []; g.userData.arms = []; g.userData.head = headGroup; g.userData.body = body;
  const granny = id === 'granny', dock = id === 'dock', chef = id === 'chef', community = id === 'community';
  const female = player || granny || chef || community;
  const outfit = player ? ['#f3ead7','#294a45'] : ({granny:['#c49caf','#677ba0'],chef:['#e3a171','#398c88'],dock:['#77a8c4','#426b8c'],community:['#f4e2b7','#5a9e97']}[id]);
  if(outfit) [shirt,trousers]=outfit;
  else shirt=`#${new THREE.Color(shirt).lerp(new THREE.Color('#e9f0dc'),.17).getHexString()}`;
  const skinColor = granny ? '#e2b895' : dock ? '#ddb18c' : '#edc1a1';
  const skin = material(skinColor), skinShade = material(shade(skinColor, .88));
  const cloth = material(shirt), seam = material(shade(shirt, player ? .87 : .76)), trim = material('#e8d9b9');
  const pants = material(trousers), pantSeam = material(shade(trousers, .78));
  const hair = material(granny ? '#969e9f' : dock ? '#526477' : '#30363c');
  const streak = material(granny ? '#cad2cc' : dock ? '#91a1aa' : '#4b565b');
  const shoes = material(player ? '#cd8253' : '#526377'), soles = material(player ? '#f4e4c4' : '#415466');
  const eye = material('#263537'), iris = material(player ? '#5c8270' : '#736350'), lip = material('#a96f61');

  // Soft tailoring around the waist and shoulders, with a visible shirt collar.
  const broad = chef ? 1.12 : dock ? 1.06 : 1;
  const torso = garment(player ? [[.797,.207,.142],[.829,.221,.15],[.99,.209,.147],[1.14,.232,.156],[1.25,.246,.142],[1.305,.185,.107],[1.338,.073,.075]] : [[.765,.18*broad,.13],[.82,.201*broad,.139],[.98,.191*broad,.14],[1.13,.217*broad,.148],[1.25,.232*broad,.133],[1.30,.179,.102],[1.332,.071,.073]],24,true);
  add(body, torso, cloth);
  ellipsoid(body, [.077, .077, .071], skin, [0, 1.358, .002]);
  if (player) add(body, garment([[.797,.207,.142],[.814,.222,.151],[.838,.221,.151]],24), seam);
  // Small collar facets are folded cloth, with warm lining visible at the neck.
  patch(body, [[-.074, 1.325, .071], [-.125, 1.285, .11], [-.04, 1.214, .144]], trim);
  patch(body, [[.074, 1.325, .071], [.04, 1.214, .144], [.125, 1.285, .11]], trim);
  stroke(body, [[0, .842, player ? .152 : .124], [0, 1.10, player ? .156 : .143], [0, 1.258, player ? .139 : .124]], .004, seam, 6);
  for (let i = 0; i < 4; i++) ellipsoid(body, [.0075, .0075, .0035], player ? material('#a39173') : trim, [.014, .899 + i * .087, player ? .153 : .14]);
  for (const side of [-1, 1]) {
    stroke(body, [[side * .14, .815, .075], [side * .162, .948, .07], [side * .201, 1.137, .052]], .0032, seam, 8);
    stroke(body, [[side * .045, .823, .12], [side * .084, .847, .13], [side * .128, .845, .113]], .003, seam, 6);
    const arm = joint(side < 0 ? 'left shoulder' : 'right shoulder', body, [side * .237 * broad, 1.265, 0]);
    const elbow = joint(side < 0 ? 'left elbow' : 'right elbow', arm, [side * .045, -.245, 0]);
    const hand = joint(side < 0 ? 'left wrist' : 'right wrist', elbow, [side * .013, -.221, .017]);
    g.userData.arms.push(arm); rig.elbows.push(elbow); rig.hands.push(hand);
    const sleeve=garment([[.027,.002,.003,0,-side*.045],[-.025,player?.098:.087,player?.087:.077,0,side*.005],[-.085,player?.102:.09,player?.089:.081,0,side*.019],[-.17,player?.09:.078,player?.082:.073,0,side*.035],[-.245,player?.079:.066,player?.075:.067,0,side*.045],[-.31,player?.083:.071,player?.075:.067,.004,side*.05],[-.40,player?.065:.059,player?.063:.057,.012,side*.056],[-.465,.049,.049,.017,side*.058]],22,true);
    if(chef){
      add(arm,garment([[.025,.002,.003,0,-side*.045],[-.025,.087,.077,0,side*.005],[-.085,.092,.08,0,side*.018],[-.22,.072,.069,0,side*.044],[-.265,.067,.065,0,side*.047]],22,true),cloth);
      add(elbow,garment([[.035,.057,.057],[0,.061,.061],[-.09,.055,.057,.008,side*.007],[-.217,.043,.042,.017,side*.013]],20,true),skin);
      sleeve.dispose();
    }else softJoint(add(arm,sleeve,cloth),elbow,-.175,-.31);
    rod(elbow, [side*.012,-.184,.014], [side*.013,-.217,.017], player ? .054 : .051, chef ? trim : seam);
    stroke(arm, [[side*.013,-.04,.069],[side*.023,-.13,.066],[side*.039,-.215,.055]], .003, seam, 7);
    // One shaped palm joins the cuff. Grouped fingertips and a tucked thumb
    // retain a soft silhouette without separate stick fingers.
    add(hand,garment([[.008,.030,.024,.016],[-.014,.042,.032,.018],[-.045,.043,.032,.020],[-.071,.035,.026,.022],[-.087,.022,.019,.021],[-.091,.002,.002,.020]],16,true),skin);
    ellipsoid(hand, [.020,.035,.023], skin, [-side*.032,-.025,.034]).rotation.z = side * .34;
    for (let i=0;i<2;i++) stroke(hand, [[-.012+i*.019,-.077,.036],[-.012+i*.019,-.059,.046]], .0012, skinShade, 3);
  }

  // A single shaped face: rounded cheeks, a short jaw and a soft chin. The
  // forehead sits under the hair shell instead of forming a second rear face.
  add(headGroup,garment([[1.374,.004,.004,.026],[1.400,.066,.052,.027],[1.435,.113,.089,.016],[1.482,.151,.119,.005],[1.546,.173,.145,-.002],[1.616,.173,.148,-.007],[1.690,.145,.125,-.012],[1.743,.085,.078,-.013],[1.761,.003,.003,-.013]],28,true),skin);
  for (const side of [-1, 1]) {
    ellipsoid(headGroup, [.027, .041, .021], skin, [side * .172, 1.541, -.006], 12);
    ellipsoid(headGroup, [.012, .022, .010], skinShade, [side * .179, 1.540, .011], 10);
    const eyelid = joint(side < 0 ? 'left eye' : 'right eye', headGroup, [side*.065,1.579,.135]); rig.eyes.push(eyelid);
    const eyeHeight = granny || dock ? .013 : .023;
    const eyeWidth = granny || dock ? .030 : .033;
    ellipsoid(eyelid, [eyeWidth,eyeHeight,.008], material('#fff4dd'), [0,0,0], 16);
    ellipsoid(eyelid, [.014,eyeHeight*.95,.0045], iris, [side*.001,0,.0075], 12);
    ellipsoid(eyelid, [.007,eyeHeight*.77,.0028], eye, [side*.001,0,.0115], 12);
    ellipsoid(eyelid, [.0045,.0055,.0018], material('#fffaf0'), [-.003,eyeHeight*.36,.0145], 8);
    // Ink sits in front of the sclera, so a blink compresses into an eyelid
    // line instead of exposing white dotted highlights through the lashes.
    stroke(eyelid, [[-eyeWidth,.002,.010],[-.021,eyeHeight*.8,.015],[0,eyeHeight,.016],[.024,eyeHeight*.60,.014],[eyeWidth,.003,.010]], .0044, hair, 8);
    stroke(eyelid, [[-eyeWidth*.94,-eyeHeight*.18,.010],[-eyeWidth*.72,-eyeHeight*.66,.013],[0,-eyeHeight*.89,.014],[eyeWidth*.72,-eyeHeight*.65,.013],[eyeWidth*.94,-eyeHeight*.14,.010]], .0028, hair, 8);
    stroke(headGroup, [[side*.037,1.618,.135],[side*.066,1.626,.128],[side*.099,1.613,.115]], .0041, hair, 7);
    if (granny || dock) stroke(headGroup, [[side * .088, 1.56, .128], [side * .105, 1.554, .116], [side * .121, 1.555, .103]], .0018, skinShade, 5);
  }
  ellipsoid(headGroup, [.012, .027, .012], skin, [0, 1.548, .140], 12);
  ellipsoid(headGroup, [.016, .014, .015], skin, [0, 1.528, .151], 12);
  stroke(headGroup, [[-.011,1.517,.154],[0,1.514,.160],[.008,1.517,.156]], .0017, skinShade, 5);
  stroke(headGroup, [[-.024, 1.486, .123], [0, 1.480, .131], [.024, 1.486, .123]], .0027, lip, 8);
  ellipsoid(headGroup,[.022,.004,.003],skin,[0,1.472,.128],12);
  rig.hair=scalp(headGroup, hair, streak, female, granny);
  if (female && !granny) {
    hairLock(headGroup, [[-.12,1.711,.073],[-.094,1.676,.132],[-.040,1.624,.153]], .046, hair);
    hairLock(headGroup, [[-.066,1.744,.066],[.007,1.697,.141],[.073,1.635,.144]], .049, hair);
    hairLock(headGroup, [[.068,1.719,.074],[.145,1.650,.090],[.161,1.510,.045]], .043, hair);
    if(player) {
      const pin=material('#cf9562');
      rod(headGroup,[.117,1.676,.126],[.158,1.637,.094],.007,pin);
      rod(headGroup,[.126,1.687,.113],[.168,1.650,.080],.0045,trim);
    }
  }

  for (const side of [-1, 1]) {
    const leg=joint(side<0?'left hip':'right hip',rigRoot,[side*.104,rig.hipHeight,0]);
    const knee=joint(side<0?'left knee':'right knee',leg,[0,-rig.upperLeg,0]);
    const ankle=joint(side<0?'left ankle':'right ankle',knee,[0,-rig.lowerLeg,0]);
    g.userData.legs.push(leg); rig.knees.push(knee); rig.ankles.push(ankle);
    const trousersMesh=add(leg,garment(player ? [[-.715,.080,.077],[-.68,.088,.084],[-.55,.099,.092],[-.405,.106,.098],[-.31,.111,.103],[-.14,.118,.112],[.012,.113,.109]] : [[-.75,.063,.062],[-.67,.069,.069],[-.55,.078,.076],[-.405,.078,.079],[-.31,.088,.088],[-.14,.103,.103],[.012,.1,.102]],24,true),pants);
    softJoint(trousersMesh,knee,-.315,-.50);
    stroke(leg,[[side*.073,-.04,.035],[side*.071,-.20,.036],[side*.061,-.365,.03]],.0026,pantSeam,8);
    stroke(knee,[[side*.061,-.035,.035],[side*.068,-.15,.029],[side*.05,-.32,.025]],.0026,pantSeam,8);
    if(player) add(knee,garment([[-.309,.080,.077],[-.284,.087,.084]],24),pantSeam);
    else rod(knee,[0,-.326,0],[0,-.349,0],.065,pantSeam);
    rod(ankle,[0,-.014,0],[0,player?.078:.057,0],player?.052:.043,player?trim:pants);
    if(player) {
      // Separate thin outsole/midsole, an asymmetric instep and a real tongue.
      // The new ankle is 85 mm high, so the authored sole ends at local -85 mm.
      rounded(ankle,[.186,.020,.292],material('#526558'),[0,-.075,.046],.009);
      rounded(ankle,[.182,.023,.288],soles,[0,-.054,.046],.010);
      add(ankle,garment([[-.045,.087,.137,.046],[-.025,.089,.140,.044],[.009,.078,.114,.024],[.043,.065,.076,.004],[.067,.049,.045,-.018],[.075,.043,.036,-.023]],24,true),shoes);
      rounded(ankle,[.086,.018,.086],material('#a46949'),[0,.033,.049],.008).rotation.x=.3;
      for(let j=0;j<3;j++)rod(ankle,[-.031,.052-j*.008,.018+j*.025],[.031,.049-j*.008,.024+j*.025],.0028,trim);
      stroke(ankle,[[side*.081,-.019,.112],[side*.084,.006,.055],[side*.071,.020,-.026]],.0045,trim,8);
      rounded(ankle,[.030,.037,.014],material('#36534b'),[0,.041,-.064],.005);
    } else {
      rounded(ankle,[.184,.048,.298],soles,[0,-.051,.048],.021);
      ellipsoid(ankle,[.088,.057,.142],shoes,[0,-.006,.048],20);
      rounded(ankle,[.105,.032,.070],seam,[0,.027,.048],.012);
    }
  }

  if (player) {
    const bagStart=body.children.length;
    const canvas = material('#c8895b'), bagSeam = material('#a46849'), leather=material('#38534b');
    rounded(body, [.310,.370,.164], canvas, [0,1.084,-.222], .052);
    rounded(body, [.258,.117,.055], bagSeam, [0,.978,-.307], .026);
    rounded(body, [.297,.115,.052], canvas, [0,1.232,-.291], .035);
    stroke(body,[[-.131,1.193,-.296],[-.146,1.095,-.302],[-.132,.922,-.293],[.132,.922,-.293],[.146,1.095,-.302],[.131,1.193,-.296]],.0035,bagSeam,16);
    stroke(body,[[-.055,1.258,-.221],[-.050,1.315,-.223],[.050,1.315,-.223],[.055,1.258,-.221]],.011,leather,10);
    stroke(body,[[-.106,1.003,-.339],[0,1.016,-.342],[.106,1.003,-.339]],.0032,trim,10);
    rounded(body,[.036,.129,.018],leather,[0,1.178,-.321],.006);
    rounded(body,[.052,.041,.020],trim,[0,1.155,-.334],.006);
    rounded(body,[.027,.023,.023],leather,[0,1.155,-.345],.003);
    // One sewn patch reads as an intentional travel bag, without tiny labels.
    ellipsoid(body,[.029,.033,.006],trim,[.071,.975,-.340],16);
    stroke(body,[[.052,.974,-.347],[.071,.988,-.348],[.090,.974,-.347]],.003,leather,4);
    rod(body,[-.183,.983,-.220],[-.183,1.141,-.220],.032,material('#d7ddd0'));
    rod(body,[-.183,1.141,-.220],[-.183,1.170,-.220],.027,leather);
    rounded(body,[.053,.102,.060],canvas,[-.168,1.010,-.218],.014);
    const bagParts=body.children.slice(bagStart),bag=joint('canvas backpack',body,[0,1.21,-.17]);
    for(const part of bagParts)bag.attach(part);
    rig.backpack=bag;
    for (const side of [-1, 1]) {
      stroke(body, [[side * .109, 1.219, -.20], [side * .15, 1.31, -.034], [side * .164, 1.191, .133], [side * .141, .933, .131]], .014, leather, 12);
      rounded(body, [.028, .042, .012], trim, [side * .149, 1.045, .145], .005);
    }
    rounded(body,[.104,.11,.012],seam,[-.107,1.114,.142],.009);
    rounded(body,[.11,.028,.02],cloth,[-.107,1.165,.153],.005);
    const scarf=material('#52786b');
    stroke(body,[[-.073,1.332,.05],[0,1.292,.106],[.073,1.332,.05]],.018,scarf,9);
    patch(body,[[.027,1.296,.12],[.075,1.222,.149],[.094,1.275,.132]],scarf);
  }
  if (chef) {
    const apron = material('#398f8e'), edge = material('#89c6b7');
    clothPanel(body, [[1.232, -.115, .115, .163], [1.16, -.139, .139, .166], [1.035, -.167, .167, .165], [.908, -.185, .185, .156], [.747, -.201, .201, .153]], apron);
    stroke(body, [[-.199, .752, .128], [0, .747, .156], [.199, .752, .128]], .003, edge, 9);
    for (const side of [-1, 1]) stroke(body, [[side * .123, 1.241, .10], [side * .065, 1.32, .079], [side * .066, 1.18, .164]], .012, apron, 8);
    rounded(body, [.22, .12, .014], edge, [0, .969, .173], .012);
    stroke(body, [[-.096, .995, .183], [0, .994, .185], [.096, .995, .183]], .0025, apron, 5);
    // A folded kitchen towel tucked into the apron, not a rigid white cube.
    rounded(body, [.084, .23, .020], trim, [.141, .901, .176], .012).rotation.z = -.09;
    for (let i = 0; i < 3; i++) rod(body, [.114 + i * .022, .82, .19], [.108 + i * .022, .964, .19], .002, material('#b0aa90'));
  }
  if (dock) {
    const cap = material('#4b7899');
    ellipsoid(headGroup, [.173, .066, .16], cap, [0, 1.737, -.007], 20);
    ellipsoid(headGroup, [.155, .016, .119], cap, [0, 1.712, .112], 20);
    stroke(headGroup, [[-.143, 1.724, .042], [0, 1.719, .151], [.143, 1.724, .042]], .006, trim, 12);
    rounded(body, [.116, .112, .012], seam, [-.109, 1.133, .136], .005);
    rounded(body, [.122, .032, .016], cloth, [-.109, 1.188, .144], .006);
    ellipsoid(body, [.005, .005, .004], trim, [-.11, 1.188, .155], 8);
    for (let j = 0; j < 3; j++) rod(body, [-.032, 1.23 + j * .022, .125], [.032, 1.23 + j * .022, .125], .0035, material('#566764'));
  }
  if (community) {
    const vest = material('#e79b73'), reflective = material('#fff0c9');
    for (const side of [-1, 1]) {
      clothPanel(body, side < 0 ? [[1.295, -.153, -.059, .124], [1.205, -.196, -.040, .155], [1.07, -.176, -.035, .154], [.865, -.182, -.031, .145]] : [[1.295, .059, .153, .124], [1.205, .040, .196, .155], [1.07, .035, .176, .154], [.865, .031, .182, .145]], vest);
      rod(body, [side * .064, 1.18, .156], [side * .168, 1.18, .146], .009, reflective);
    }
    stroke(body, [[-.057, 1.318, .077], [-.046, 1.185, .161], [0, 1.11, .173], [.046, 1.185, .161], [.057, 1.318, .077]], .005, material('#7c5848'), 10);
    rounded(body, [.074, .092, .012], trim, [0, 1.077, .172], .006);
    rounded(body, [.031, .031, .003], vest, [0, 1.092, .181], .004);
    const held = rig.hands[0]; rig.held[0] = 'clipboard';
    rounded(held,[.193,.27,.024],material('#8f7959'),[-.026,.055,.064],.009);
    rounded(held,[.168,.232,.005],material('#eee8cf'),[-.026,.058,.08],.005);
    rounded(held,[.057,.032,.014],material('#777e70'),[-.026,.181,.085],.004);
    for(let j=0;j<5;j++)rod(held,[-.084,.005+j*.026,.085],[.032,.005+j*.026,.085],.0016,material('#9d9e86'));
  }
  if (granny) {
    const frames = material('#847d63');
    for (const side of [-1, 1]) {
      add(headGroup, new THREE.TorusGeometry(.038, .0026, 5, 20), frames, [side * .058, 1.56, .143]);
      rod(headGroup, [side * .093, 1.567, .137], [side * .148, 1.569, .021], .0025, frames);
      rounded(body, [.107, .104, .009], seam, [side * .112, .934, .131], .008);
    }
    stroke(headGroup, [[-.021, 1.565, .143], [0, 1.577, .154], [.021, 1.565, .143]], .0026, frames, 8);
    body.rotation.x = .025;
  }
  // Props are weighted to the wrist, so an elbow can bend without leaving the
  // fan, clipboard or enamel cup floating at its old shoulder-relative position.
  const right = rig.hands[1];
  if(granny){
    rig.held[1] = 'fan';
    const fanMat=material('#f1d69b'), ribs=material('#ac9164');
    rod(right,[0,-.045,.039],[0,.066,.043],.008,ribs);
    const fan=new THREE.Shape(); fan.moveTo(0,0); fan.absarc(0,0,.17,.12,Math.PI-.12,false);fan.lineTo(0,0);
    const fanGeo=new THREE.ExtrudeGeometry(fan,{depth:.005,bevelEnabled:false,curveSegments:10});
    add(right,fanGeo,fanMat,[0,.049,.044]);
    for(let i=0;i<7;i++){const a=.15+i*(Math.PI-.3)/6;rod(right,[0,.049,.05],[Math.cos(a)*.166,.049+Math.sin(a)*.166,.05],.002,ribs);}
  }
  if(chef){
    rig.held[1] = 'towel';
    const cloth=material('#fff0d1'), stitch=material('#dc8568');
    rounded(right,[.12,.18,.022],cloth,[.012,-.112,.048],.009);
    for(let i=0;i<3;i++)rod(right,[-.032+i*.033,-.183,.062],[-.035+i*.033,-.042,.062],.002,stitch);
  }
  if(dock){
    rig.held[1] = 'cup';
    const cup=material('#e0edf0'), rim=material('#507f9b');
    add(right,new THREE.CylinderGeometry(.045,.043,.133,14),cup,[-.008,-.018,.092]);
    add(right,new THREE.CylinderGeometry(.047,.047,.014,14),rim,[-.008,.055,.092]);
    add(right,new THREE.CircleGeometry(.038,14),material('#6f6551'),[-.008,.063,.092],[-Math.PI/2,0,0]);
    add(right,new THREE.TorusGeometry(.035,.007,6,14),rim,[.047,-.016,.092]);
  }
  // Retain the original art coordinates while moving their pivots to the neck
  // and waist. Children include real eye and shoulder bones, not baked meshes.
  for(const child of headGroup.children)child.position.y-=1.36;
  headGroup.position.y=1.36;
  for(const child of body.children)child.position.y-=rig.bodyRestY;
  body.position.y=rig.bodyRestY;
  headGroup.scale.x=player?1.065:1.025;
  const proportions = proportionsFor(player,!granny&&!dock&&!chef);
  bindCharacter(g,proportions);
  if(proportions) {
    rig.hipHeight=proportions.hip;rig.upperLeg=proportions.upper;rig.lowerLeg=proportions.lower;rig.ankleHeight=proportions.ankle;
    rig.bodyRestY=body.position.y;
  }
  if(player){rig.soleFront=.192;rig.soleBack=-.100;}
  rig.soleHalfWidth=(player?.093:.092)*(proportions?.shoulderWidth??1);
  if(rig.backpack)rig.backpackRest=rig.backpack.position.clone();
  if(granny)g.scale.setScalar(.915);
  g.userData.restBodyTilt=body.rotation.x;
  g.userData.characterId = player ? 'player' : id;
  const characterMesh=g.userData.characterMesh;
  characterMesh.geometry.computeBoundingBox();
  g.userData.height = characterMesh.geometry.boundingBox.max.y*g.scale.y;
  g.updateWorldMatrix(true,true);
  g.userData.eyeHeight = rig.eyes[0].getWorldPosition(new THREE.Vector3()).y;
  g.userData.hands = rig.hands;
  return g;
}
