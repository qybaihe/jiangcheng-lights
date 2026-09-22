import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { cameraBoomDistance, updateThirdPerson, updatePlayerOcclusion } from '../src/exploration.js';
import { World } from '../src/world.js';
import { createCharacter } from '../src/characters.js';
import { bendPoint, unbendPoint } from '../src/curved-world.js';

function fixture() {
  const world = Object.create(World.prototype);
  Object.assign(world, {
    keys: {}, path: [], colliders: [], cameraOccluders: [], hazards: [], npcs: [],
    active: true, blocked: false, suspended: false, reduced: true, rainy: false,
    ended: false, firstFrameRendered: true, elapsed: 0, cameraMode: 'street',
    firstYaw: 0, firstPitch: 0, eyeHeight: 1.65, lookSensitivity: .0024,
    callbacks: {}, loreMarkers: [], windowMats: [], collectedLore: new Set(),
    rain: { visible: false }, focusRing: new THREE.Object3D(),
    clock: { getDelta: () => 1 / 60 },
  });
  world.player = new THREE.Group();
  world.player.position.set(0, .13, 20);
  world.player.userData.legs = [];
  world.camera = new THREE.PerspectiveCamera(54, 16 / 9, .08, 380);
  world.camera.position.set(5, 3, 23);
  world.controls = {
    target: new THREE.Vector3(0, 1.2, 20), minDistance: 9, maxDistance: 110,
    enableDamping: true, enabled: false, update() {},
  };
  world.releasePointerLock = () => {};
  world.updateContactShadows = () => {};
  world.updateStoryProps = () => {};
  return world;
}

// Drive the real World.animate movement integration; only scheduling and GPU
// presentation are suppressed. No copy of its route/motion logic lives here.
function frames(world, count, afterFrame) {
  const previousDocument = globalThis.document;
  const previousRAF = globalThis.requestAnimationFrame;
  globalThis.document = { hidden: true };
  globalThis.requestAnimationFrame = () => 0;
  try {
    for (let i = 0; i < count; i++) { world.animate(); afterFrame?.(i + 1); }
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousRAF === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = previousRAF;
  }
}

test('camera boom stops before a thin wall, including room for the camera sphere', () => {
  const origin = new THREE.Vector3(0, 1.2, 0), wanted = new THREE.Vector3(0, 1.2, 8);
  const wall = { x: -1, X: 1, z: 3, Z: 3.03, y: 0, height: 2.5 };
  const distance = cameraBoomDistance(origin, wanted, [wall], .23);
  assert(distance > 2.5 && distance <= wall.z - .23);
  const camera = origin.clone().lerp(wanted, distance / origin.distanceTo(wanted));
  assert(camera.z + .23 < wall.z, 'the camera volume must stay on the player side');
});

test('unrelated obstacles behind, beyond and above the boom do not collapse it', () => {
  const origin = new THREE.Vector3(0, 1.2, 0), wanted = new THREE.Vector3(0, 1.2, 4);
  const bounds = [
    { x: -1, X: 1, z: -3, Z: -2, y: 0, height: 3 },
    { x: -1, X: 1, z: 5, Z: 6, y: 0, height: 3 },
    { x: -1, X: 1, z: 1, Z: 3, y: 2.5, height: 3 },
  ];
  assert.equal(cameraBoomDistance(origin, wanted, bounds), 4);
  assert.equal(cameraBoomDistance(origin, origin, bounds), 0);
});

test('standing in a trunk’s camera margin must not allow the boom through the trunk', () => {
  // Tree trunks are camera occluders, so a walkable player position can lie in
  // this margin while remaining outside the actual wood geometry.
  const trunk = { x: -.3, X: .3, z: -.3, Z: .3, y: 0, height: 3.8 };
  const origin = new THREE.Vector3(.42, 1.2, 0), wanted = new THREE.Vector3(-3, 1.2, 0);
  const distance = cameraBoomDistance(origin, wanted, [trunk], .23);
  assert(distance < origin.x - trunk.X, 'an origin inside the expanded AABB is not permission to cross its solid core');
});

test('first-person and third-person switches retain the player’s viewing heading', () => {
  const world = fixture();
  world.setCameraMode('street');
  world.setLookDelta(170, 30);
  const streetHeading = world.getHeading();
  world.setCameraMode('first');
  assert(Math.abs(world.getHeading() - streetHeading) < 1e-9);
  world.setLookDelta(-85, -20);
  const firstHeading = world.getHeading();
  const position = world.player.position.clone();
  world.setCameraMode('street');
  assert(Math.abs(world.getHeading() - firstHeading) < 1e-9);
  assert(world.player.position.equals(position));
  assert.equal(world.controls.enabled, false);
});

test('a third-person conversation restores its heading, lens and boom settings', () => {
  const world = fixture(); world.reduced = false;
  const npc = new THREE.Group(); npc.position.set(2, .13, 20);
  world.npcs = [{ id: 'chef', group: npc }];
  world.setCameraMode('street'); world.setLookDelta(150, 55); world.thirdDistance = 6;
  world.setCameraMode('street');
  const before = {
    yaw: world.thirdYaw, pitch: world.thirdPitch, distance: world.thirdDistance,
    fov: world.camera.fov, near: world.camera.near, position: world.camera.position.clone(),
  };
  world.beginConversation('chef');
  for (let i = 0; i < 50; i++) world.updateConversation(1 / 60);
  world.endConversation();
  for (let i = 0; i < 150; i++) world.updateConversation(1 / 60);
  world.clearCamera(1 / 60);
  assert.equal(world.cameraMode, 'street'); assert.equal(world.cameraReturn, null);
  assert.equal(world.thirdYaw, before.yaw); assert.equal(world.thirdPitch, before.pitch);
  assert.equal(world.thirdDistance, before.distance);
  assert.equal(world.camera.fov, before.fov); assert.equal(world.camera.near, before.near);
  assert(world.camera.position.distanceTo(before.position) < 1e-8);
});

test('manual look takes ownership immediately during the post-dialogue camera return', () => {
  const world = fixture(); world.reduced = false;
  const npc = new THREE.Group(); npc.position.set(2, .13, 20);
  world.npcs = [{ id: 'chef', group: npc }];
  world.setCameraMode('street'); world.beginConversation('chef');
  for (let i = 0; i < 50; i++) world.updateConversation(1 / 60);
  world.endConversation();
  assert(world.cameraReturn, 'this case must exercise the return transition');
  assert.equal(world.setLookDelta(100, 0), true);
  const manualPosition = world.camera.position.clone();
  world.updateConversation(1 / 60);
  assert(world.camera.position.distanceTo(manualPosition) < 1e-9, 'a stale return target must not pull the camera away from the user’s drag');
});

test('manual wall-side orbits follow each mouse increment through reversals and full turns', () => {
  const world = crampedBreakfastCamera();
  for (let i = 0; i < 120; i++) updateThirdPerson(world, 1 / 60);
  assert(Math.abs(world.cameraAvoidanceOffset) > .1, 'start from an actual assisted camera heading');
  const bounds = [...world.colliders, ...world.cameraOccluders];
  const angularDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
  const fixedPosition = world.player.position.clone();
  for (const dx of [...Array(260).fill(12), ...Array(520).fill(-12), ...Array(260).fill(12)]) {
    const before = world.getHeading();
    world.setLookDelta(dx, 0);
    assert(Math.abs(angularDelta(before, world.getHeading()) - dx * world.lookSensitivity) < 1e-8,
      'the visible heading follows the input, even when the old preferred heading was elsewhere');
    world.elapsed += 1 / 60; updateThirdPerson(world, 1 / 60);
    assert(Math.abs(angularDelta(before, world.getHeading()) - dx * world.lookSensitivity) < 1e-8,
      'the next animation frame must not reapply a side angle while dragging');
    const origin = new THREE.Vector3(world.player.position.x, world.cameraTrackedY + 1.13, world.player.position.z);
    assert(cameraBoomDistance(origin, world.camera.position, bounds) >= origin.distanceTo(world.camera.position) - .001,
      'manual observation retains the swept wall clearance');
  }
  assert(world.player.position.equals(fixedPosition), 'turning the view cannot reposition the body');
});

test('releasing a close-wall orbit resumes side assistance gradually instead of snapping', () => {
  const world = crampedBreakfastCamera();
  world.setLookDelta(25, 0);
  let previous = world.getHeading();
  for (let i = 0; i < 240; i++) {
    world.elapsed += 1 / 60; updateThirdPerson(world, 1 / 60);
    const heading = world.getHeading(), delta = Math.atan2(Math.sin(heading - previous), Math.cos(heading - previous));
    assert(Math.abs(delta) <= 1.8 / 60 + 1e-8, 'post-drag camera assistance obeys its angular speed limit');
    previous = heading;
  }
});

test('holding the mouse still at a wall cannot let side assistance retake the view', () => {
  const world = crampedBreakfastCamera();
  world.lookDrag = { id: 1 }; world.setLookDelta(12, 0);
  const heading = world.getHeading();
  for (let i = 0; i < 180; i++) {
    world.elapsed += 1 / 60; updateThirdPerson(world, 1 / 60);
    assert(Math.abs(world.getHeading() - heading) < 1e-8, 'a stationary held drag retains ownership past the release grace period');
  }
  world.setLookDelta(-12, 0);
  assert(Math.abs(world.getHeading() - heading + .0288) < 1e-8);
});

test('close-wall camera fades only the player, restores smoothly, and keeps dialogue opaque', () => {
  const world = fixture(), shared = new THREE.MeshToonMaterial();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), shared);
  world.player.userData.characterMesh = mesh;
  world.playerCameraDistance = .82; updatePlayerOcclusion(world, 1 / 60);
  assert.equal(world.player.visible, false); assert.equal(world.playerOpacity, 0);
  assert.notEqual(mesh.material, shared); assert.equal(shared.opacity, 1); assert.equal(shared.transparent, false);
  world.playerCameraDistance = 2; updatePlayerOcclusion(world, 1 / 60);
  assert(world.playerOpacity > 0 && world.playerOpacity < .5);
  assert.equal(mesh.material.depthWrite, false);
  world.playerCameraDistance = 4.6; updatePlayerOcclusion(world, 1 / 60);
  assert(world.playerOpacity < 1, 'returning from the wall cannot flash the full avatar in one frame');
  for (let i = 0; i < 90; i++) updatePlayerOcclusion(world, 1 / 60);
  assert(world.playerOpacity > .999); assert.equal(mesh.material.depthWrite, true);
  world.cameraMode = 'first'; updatePlayerOcclusion(world, 1 / 60); assert.equal(world.player.visible, false);
  world.conversation = {}; updatePlayerOcclusion(world, 1 / 60);
  assert.equal(world.player.visible, true); assert.equal(mesh.material.opacity, 1);
});

test('automatic navigation stops exactly at its final waypoint without a release coast', () => {
  const world = fixture(); world.keys.shift = true;
  assert.equal(world.navigate(0, 18.371), true);
  frames(world, 150);
  assert.equal(world.path.length, 0);
  assert(Math.hypot(world.player.position.x, world.player.position.z - 18.371) < 1e-9);
  const arrived = world.player.position.clone();
  frames(world, 120);
  assert(world.player.position.equals(arrived));
  assert.equal(world.moveSpeed, 0);
});

test('accepting an already-arrived route cancels earlier movement momentum', () => {
  const world = fixture();
  world.moveSpeed = 5.6; world.lastMoveDirection = new THREE.Vector2(1, 0);
  world.path = [new THREE.Vector3(5, 0, 20)];
  const arrived = world.player.position.clone();
  assert.equal(world.navigateRoute({ reachable: true, path: [{ x: arrived.x, z: arrived.z }] }), true);
  frames(world, 60);
  assert(world.player.position.distanceTo(arrived) < 1e-9, 'the newly accepted destination is the current position');
});

test('releasing movement decelerates to rest without leaving residual drift', () => {
  const world = fixture(); world.setCameraMode('first');
  world.keys.w = true; world.keys.shift = true;
  frames(world, 45);
  world.keys = {};
  frames(world, 30);
  const stopped = world.player.position.clone();
  assert.equal(world.moveSpeed, 0); assert.equal(world.walking, false);
  frames(world, 120);
  assert(world.player.position.equals(stopped));
});

function chefCameraFixture() {
  const world = fixture();
  world.reduced = false;
  // Real geometry around the breakfast shop, including its canopy and street
  // lamp. This player position is walkable but its camera must turn a corner.
  world.colliders = [
    { x: 8.85, X: 19.15, z: 1.95, Z: 9.25, height: 8.3 },
    { x: 10.45, X: 15.55, z: 11.45, Z: 12.95, height: 1.12 },
    { x: 12.78, X: 15.22, z: 15.2, Z: 16.8, height: 1.08 },
    { x: 16.55, X: 17.85, z: 11.4, Z: 12.6, height: 1.6 },
    { x: 4.9, X: 5.1, z: 17.9, Z: 18.1, height: 3.55 },
  ];
  world.cameraOccluders = [
    { x: 9.5, X: 18.5, z: 9.15, Z: 11.75, y: 2.65, height: 3.15 },
    { x: 11.7, X: 16.3, z: 11.74, Z: 11.82, y: 2.68, height: 3.06 },
    { x: 4.87, X: 5.13, z: 17.87, Z: 18.13, y: 0, height: 4.25 },
    { x: 4.5, X: 5.5, z: 17.5, Z: 18.5, y: 3.55, height: 4.67 },
  ];
  world.player.position.set(9.74118095489748, .13, 12.965925826289068);
  world.camera.position.set(61, 63, 79);
  // null omits DOM listeners while preserving OrbitControls' real clamping,
  // spherical camera calculation and damping in each World.animate frame.
  world.controls = new OrbitControls(world.camera, null);
  Object.assign(world.controls, {
    minDistance: 9, maxDistance: 110, enableDamping: true, dampingFactor: .065,
    minPolarAngle: .35, maxPolarAngle: 1.25,
  });
  world.controls.target.set(0, 0, -7);
  const npc = new THREE.Group(); npc.position.set(10, .13, 12);
  world.npcs = [{ id: 'chef', group: npc }];
  world.thirdYaw = 13 * Math.PI / 12; world.thirdPitch = .16;
  world.waterUniforms = { time: { value: 0 } };
  world.ferry = new THREE.Group(); world.steam = { children: [] };
  updateThirdPerson(world, 0, true);
  return world;
}

test('automatic chef dialogue entry and return never put the camera inside the breakfast shop', () => {
  const world = chefCameraFixture();
  // Use the actual visible wall, smaller than the movement safety collider.
  const wall = new THREE.Box3(new THREE.Vector3(9, 0, 2.1), new THREE.Vector3(19, 6.8, 9.1));
  assert.equal(world.canWalk(world.player.position.x, world.player.position.z), true);
  assert.equal(wall.containsPoint(world.camera.position), false);
  const before = world.camera.position.clone();
  world.beginConversation('chef'); world.blocked = true;
  assert.equal(world.conversationSightline(world.conversation.position, world.conversation.eyes), true);
  frames(world, 120, frame => assert.equal(wall.containsPoint(world.camera.position), false,
    `entry frame ${frame}: ${world.camera.position.toArray().join(',')}`));
  world.endConversation(); world.blocked = false;
  frames(world, 180, frame => assert.equal(wall.containsPoint(world.camera.position), false,
    `return frame ${frame}: ${world.camera.position.toArray().join(',')}`));
  assert.equal(world.cameraReturn, null);
  assert(world.camera.position.distanceTo(before) < .04, 'the protected return must still restore the exploration camera');
});

function crampedBreakfastCamera() {
  const world = chefCameraFixture();
  world.player.position.set(9.250367, .13, 10.36352);
  world.thirdYaw = 2.5805; world.resolvedYaw = world.thirdYaw;
  world.thirdPitch = .16; world.actualCameraDistance = 1.017;
  world.camera.position.set(8.716, 1.447, 9.513);
  return world;
}

test('the camera steps sideways at the breakfast corner and keeps the player’s head and feet in frame', () => {
  const world = crampedBreakfastCamera(), preferred = world.thirdYaw, pitch = world.thirdPitch;
  const originalPosition = world.player.position.clone();
  const wall = new THREE.Box3(new THREE.Vector3(9, 0, 2.1), new THREE.Vector3(19, 6.8, 9.1));
  const bounds = [...world.colliders, ...world.cameraOccluders];
  for (let frame = 0; frame < 120; frame++) {
    const previousCamera = world.camera.position.clone();
    updateThirdPerson(world, 1 / 60);
    assert.equal(wall.containsPoint(world.camera.position), false, `wall at frame ${frame}`);
    const travelled = previousCamera.distanceTo(world.camera.position);
    assert(cameraBoomDistance(previousCamera, world.camera.position, bounds, .15) >= travelled - .001,
      `the camera movement itself crosses a solid corner at frame ${frame}`);
  }
  assert(world.actualCameraDistance >= 2.8);
  assert.equal(world.thirdYaw, preferred); assert.equal(world.thirdPitch, pitch);
  assert(world.player.position.equals(originalPosition), 'camera assistance must not reposition the player');
  const head = world.player.position.clone().add(new THREE.Vector3(0, 1.95, 0)).project(world.camera);
  const feet = world.player.position.clone().project(world.camera);
  for (const [part, point] of [['head', head], ['feet', feet]]) {
    assert(Math.abs(point.x) < .9 && Math.abs(point.y) < .9 && point.z < 1,
      `${part} must fit with a screen margin: ${point.toArray()}`);
  }
  assert(world.camera.position.y < world.player.position.y + 2, 'side assistance must not rise to rooftop height');
});

test('side assistance remains stable near the corner and returns smoothly to the preferred heading after leaving it', () => {
  const world = crampedBreakfastCamera(), preferred = world.thirdYaw;
  for (let i = 0; i < 120; i++) updateThirdPerson(world, 1 / 60);
  const chosenSide = Math.sign(world.cameraAvoidanceOffset);
  for (let i = 0; i < 120; i++) {
    world.player.position.x = 9.250367 + Math.sin(i) * .012;
    updateThirdPerson(world, 1 / 60);
    assert.equal(Math.sign(world.cameraAvoidanceOffset), chosenSide, 'small position changes must not flip sides');
    assert(world.actualCameraDistance >= 2.8);
  }
  world.player.position.set(3, .13, 10.36352);
  const beforeReturn = Math.abs(world.resolvedYaw - preferred);
  for (let i = 0; i < 40; i++) {
    const previousYaw = world.resolvedYaw;
    updateThirdPerson(world, 1 / 60);
    assert(Math.abs(world.resolvedYaw - previousYaw) < .031, 'clearance recovery should not snap the view');
  }
  const returning = Math.abs(world.resolvedYaw - preferred);
  assert(returning > .001 && returning < beforeReturn);
  for (let i = 0; i < 200; i++) updateThirdPerson(world, 1 / 60);
  assert(Math.abs(world.resolvedYaw - preferred) < .001);
  assert.equal(world.thirdYaw, preferred);
});

test('the closest user zoom still releases a retained side angle in an open street', () => {
  const world = fixture();
  world.player.position.set(3, .13, 10.36352);
  world.thirdYaw = 2.5805; world.thirdPitch = .16; world.thirdDistance = 2.5;
  world.cameraAvoidanceOffset = -Math.PI / 12;
  world.resolvedYaw = world.thirdYaw - Math.PI / 12;
  for (let frame = 0; frame < 360; frame++) updateThirdPerson(world, 1 / 60);
  assert(Math.abs(world.resolvedYaw - world.thirdYaw) < .001,
    'a tiny floating-point error at the zoom limit must not keep the camera locked sideways');
  assert.equal(world.cameraAvoidanceOffset, 0);
});

function fittedDialogueFixture(placeId, width, height, panelTop) {
  const world = placeId === 'chef' ? chefCameraFixture() : fixture();
  world.canvas = { clientWidth: width, clientHeight: height };
  world.camera.aspect = width / height; world.camera.updateProjectionMatrix();
  const position = placeId === 'chef' ? world.player.position.clone()
    : new THREE.Vector3(-7.8175, .13, 17.6408);
  world.player = createCharacter(world, '#f5e7c7', '#477c88', true);
  world.player.position.copy(position);
  if (placeId === 'chef') {
    const chef = createCharacter(world, '#e3a171', '#398c88', false, 'chef');
    chef.position.set(10, .13, 12); world.npcs = [{ id: 'chef', group: chef }];
  } else {
    world.colliders = [
      { x: -18.15, X: -7.85, z: 7.75, Z: 15.05, height: 8.1 },
      { x: -13.7, X: -10.3, z: 16.4, Z: 17.6, height: .95 },
    ];
    world.cameraOccluders = [{ x: -17.5, X: -8.5, z: 15.2, Z: 17.3, y: 3, height: 3.5 }];
    world.controls = new OrbitControls(world.camera, null);
    Object.assign(world.controls, { minDistance: 9, maxDistance: 110, minPolarAngle: .35, maxPolarAngle: 1.25 });
    world.firstYaw = 0; world.setCameraMode('first');
  }
  world.beginConversation(placeId);
  const previousDocument = globalThis.document;
  globalThis.document = {
    querySelector: selector => selector === '.dialogue-box'
      ? { getBoundingClientRect: () => ({ top: panelTop, bottom: height - 26 }) } : null,
  };
  try { world.fitConversationCamera(); } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
  // Settle through the actual orbit camera, including its polar-angle limits.
  world.camera.position.copy(world.conversation.position);
  world.controls.target.copy(world.conversation.target);
  world.controls.update(); world.camera.updateMatrixWorld(true);
  return world;
}

function actorScreenBounds(actor, camera, width, height) {
  actor.updateMatrixWorld(true);
  const mesh = actor.userData.characterMesh;
  assert(mesh?.isSkinnedMesh, 'the framing oracle must use the actual character model');
  mesh.skeleton.update();
  const point = new THREE.Vector3();
  const result = { top: Infinity, bottom: -Infinity, left: Infinity, right: -Infinity, behindCamera: false };
  // Project rendered skin vertices, not the approximate height markers used by
  // the fitting implementation: toe depth and the hair silhouette both count.
  for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
    mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld).project(camera);
    const x = (point.x + 1) * width / 2, y = (1 - point.y) * height / 2;
    result.top = Math.min(result.top, y); result.bottom = Math.max(result.bottom, y);
    result.left = Math.min(result.left, x); result.right = Math.max(result.right, x);
    result.behindCamera ||= point.z < -1 || point.z > 1;
  }
  return result;
}

for (const { width, height, panelTop, label } of [
  { width: 1366, height: 768, panelTop: 475.453125, label: '768px resident greeting regression' },
  { width: 1366, height: 768, panelTop: 408.625, label: '768px resident topic-card regression' },
  { width: 1440, height: 900, panelTop: 680, label: '900px laptop' },
  { width: 1920, height: 1080, panelTop: 860, label: '1080px desktop' },
  { width: 1440, height: 900, panelTop: 600, label: '900px with a taller subtitle panel' },
]) {
  test(`full character geometry remains above subtitles and below the heading at ${label}`, () => {
    // Acceptance is >=20 px of visible skin geometry above the subtitle card.
    // Runtime reserves toe/heel depth probes and a 30 px target margin for the actual
    // hair/toe/skin boundary. No character vertex may overlap the subtitle.
    const visibleClearance = 20;
    for (const placeId of ['shop', 'chef']) {
      const world = fittedDialogueFixture(placeId, width, height, panelTop);
      const actors = [world.player, ...(world.conversation.npc ? [world.conversation.npc] : [])];
      try {
        for (const actor of actors) {
          const box = actorScreenBounds(actor, world.camera, width, height);
          const context = `${placeId}/${actor.name}/${label}: ${JSON.stringify(box)}`;
          assert(box.top >= 160, `head overlaps the heading: ${context}`);
          assert(box.bottom <= panelTop - visibleClearance, `shoes overlap the subtitle clearance: ${context}`);
          assert(box.left >= 24 && box.right <= width - 24, `body is cropped horizontally: ${context}`);
          assert.equal(box.behindCamera, false, context);
        }
      } finally {
        for (const actor of actors) {
          actor.userData.characterMesh.geometry.dispose();
          actor.userData.characterMesh.skeleton.dispose();
        }
      }
    }
  });
}


function resizeDialogueFixture(world,width,height,panelTop,{hiddenOldPanel=false}={}){
  world.canvas={clientWidth:width,clientHeight:height};world.camera.aspect=width/height;world.camera.updateProjectionMatrix();
  const previousDocument=globalThis.document;
  globalThis.document={querySelector:selector=>selector==='.resident-chat'?{getBoundingClientRect:()=>({top:panelTop,bottom:height-24})}:hiddenOldPanel?{getBoundingClientRect:()=>({top:0,bottom:0})}:null};
  try{world.refitConversationCamera();}finally{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
  world.camera.position.copy(world.conversation.position);world.controls.target.copy(world.conversation.target);world.controls.update();world.camera.updateMatrixWorld(true);
}

test('768px curved resident conversation refits on resize without reopening, losing speech, or drifting the lens',()=>{
  // Actual positions captured from the 1366×768 granny framing failure.
  const world=fixture();world.reduced=false;
  world.player=createCharacter(world,'#f5e7c7','#477c88',true);
  world.player.position.set(-15.805793168276695,.6,2.0467999268879495);world.player.userData.height=1.78;
  const granny=createCharacter(world,'#8c7483','#555766',false,'granny');granny.position.set(-17,.6,.7);granny.scale.setScalar(1);granny.userData.height=1.52;
  world.npcs=[{id:'granny',group:granny}];world.camera.position.set(-20.498380260358797,3.0744251790465658,5.468883639664435);
  world.controls=new OrbitControls(world.camera,null);world.controls.target.set(-16.402896584138347,1.14993457506111,1.373399963443974);
  Object.assign(world.controls,{minDistance:9,maxDistance:110,minPolarAngle:.35,maxPolarAngle:1.25});
  world.curvedWorld={enabled:true,center:world.player.position,radius:145,point:(p,out)=>bendPoint(p,world.player.position,145,out),inverse:(p,out)=>unbendPoint(p,world.player.position,145,out)};
  world.beginConversation('granny');world.speakingId='granny';
  const conversation=world.conversation,restore=conversation.restore,npcYaw=conversation.npcYaw;
  let firstTarget,firstFov;
  for(let round=0;round<4;round++)for(const[width,height,panelTop]of[[1440,900,607],[1366,768,475.453125],[1920,1080,789],[1366,768,408.625],[1366,768,475.453125]]){
    resizeDialogueFixture(world,width,height,panelTop,{hiddenOldPanel:true});
    assert.ok(world.conversation===conversation,'resize must retain the same live conversation');
    assert.ok(world.conversation.restore===restore,'the original return camera is immutable through resize');
    assert.equal(world.speakingId,'granny');assert.equal(world.conversation.npcYaw,npcYaw);
    for(const actor of[world.player,granny]){
      const feet=world.project(actor.position.x,actor.position.z,actor.position.y),head=world.project(actor.position.x,actor.position.z,actor.position.y+actor.userData.height);
      assert.ok(feet.y<=panelTop-28,`feet need breathing room above card: ${feet.y} vs ${panelTop}`);
      assert.ok(head.y>=Math.min(168,height*.21)-1,`heads stay below HUD: ${head.y}`);
      assert.ok(feet.visible&&head.visible);assert.ok(feet.x>=24&&feet.x<=width-24);
    }
    if(width===1366&&panelTop===475.453125){if(!firstTarget){firstTarget=conversation.target.clone();firstFov=world.camera.fov;}else{assert.ok(conversation.target.distanceTo(firstTarget)<1e-10,'repeated resizing must not accumulate vertical panning');assert.ok(Math.abs(world.camera.fov-firstFov)<1e-10,'the fit starts from the original lens, not its last enlarged FOV');}}
  }
});

test('resizing a first-person conversation preserves the original view and position for closing',()=>{
  const world=fixture();world.player=createCharacter(world,'#f5e7c7','#477c88',true);world.player.position.set(0,.13,20);
  const npc=createCharacter(world,'#8c7483','#555766',false,'granny');npc.position.set(2,.13,20);world.npcs=[{id:'granny',group:npc}];
  world.firstYaw=.73;world.firstPitch=-.14;world.setCameraMode('first');
  const before={position:world.player.position.clone(),yaw:world.firstYaw,pitch:world.firstPitch,fov:world.camera.fov,near:world.camera.near};
  world.beginConversation('granny');world.speakingId='granny';const restore=world.conversation.restore;
  for(const[width,height,panelTop]of[[1366,768,475.453125],[1920,1080,789],[1366,768,408.625],[1366,768,475.453125]]){
    world.conversation.manual=true;resizeDialogueFixture(world,width,height,panelTop);
    assert.equal(world.conversation.manual,false);assert.ok(world.conversation.restore===restore);assert.equal(world.speakingId,'granny');
  }
  world.endConversation();assert.equal(world.cameraMode,'first');assert.equal(world.firstYaw,before.yaw);assert.equal(world.firstPitch,before.pitch);
  assert.ok(world.player.position.equals(before.position));assert.equal(world.camera.fov,before.fov);assert.equal(world.camera.near,before.near);
  assert.equal(world.player.visible,false);assert.equal(world.controls.enabled,false);assert.equal(world.cameraReturn,null);
});
