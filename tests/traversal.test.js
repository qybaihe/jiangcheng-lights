import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World } from '../src/world.js';
import { CORE_BOUNDS, PLAYABLE_BOUNDS } from '../src/wuhan-district-layout.js';
import {
  initialisePlayerMotion, requestJump, resetPlayerMotion,
  updatePlayerVertical, canTraverseOverhead,
} from '../src/traversal.js';

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
  world.player.userData.height = 1.77;
  world.camera = new THREE.PerspectiveCamera(54, 16 / 9, .08, 380);
  world.camera.position.set(5, 3, 23);
  world.controls = {
    target: new THREE.Vector3(0, 1.2, 20), minDistance: 9, maxDistance: 110,
    enableDamping: true, enabled: false, update() {},
  };
  world.releasePointerLock = () => {};
  world.updateContactShadows = () => {};
  world.updateStoryProps = () => {};
  initialisePlayerMotion(world);
  return world;
}

function tick(world, seconds, hz = 120, afterTick) {
  for (let elapsed = 0; elapsed < seconds - 1e-9;) {
    const dt = Math.min(1 / hz, seconds - elapsed);
    updatePlayerVertical(world, dt);
    elapsed += dt;
    afterTick?.(elapsed);
  }
}

// Exercise production XZ, vertical and camera ordering. Suppress only the
// scheduler and GPU presentation, as in the exploration integration tests.
function frames(world, count, afterFrame) {
  const beforeDocument = globalThis.document, beforeRAF = globalThis.requestAnimationFrame;
  globalThis.document = { hidden: true };
  globalThis.requestAnimationFrame = () => 0;
  try {
    for (let i = 0; i < count; i++) { world.animate(); afterFrame?.(i + 1); }
  } finally {
    if (beforeDocument === undefined) delete globalThis.document;
    else globalThis.document = beforeDocument;
    if (beforeRAF === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = beforeRAF;
  }
}

test('a single jump responds next frame, rises about one metre and settles exactly once', () => {
  const world = fixture(), floor = world.player.position.y;
  let jumps = 0, lands = 0, impact = 0, apex = floor, landingAt;
  world.callbacks.onJump = () => jumps++;
  world.callbacks.onLand = speed => { lands++; impact = speed; };
  assert.equal(requestJump(world), true);
  updatePlayerVertical(world, 1 / 60);
  assert(world.player.position.y - floor > .08, 'the first rendered step must visibly leave the floor');
  assert.equal(world.playerMotion.grounded, false);
  tick(world, 1, 120, elapsed => {
    apex = Math.max(apex, world.player.position.y);
    if (world.playerMotion.grounded && landingAt === undefined) landingAt = elapsed + 1 / 60;
  });
  assert(apex - floor >= .90 && apex - floor <= 1.10, `apex ${apex - floor}`);
  assert(landingAt >= .55 && landingAt <= .67, `airtime ${landingAt}`);
  assert(impact > 6 && impact < 7);
  assert.equal(world.player.position.y, floor);
  assert.equal(world.playerMotion.verticalVelocity, 0);
  assert.equal(world.playerMotion.heightAboveGround, 0);
  assert.equal(world.playerMotion.phase, 'grounded');
  assert.deepEqual([jumps, lands, world.playerMotion.jumpCount, world.playerMotion.landingCount], [1, 1, 1, 1]);
});

test('30, 60 and 120 Hz produce matching jump peaks and landing times', () => {
  const results = [30, 60, 120].map(hz => {
    const world = fixture(); let peak = 0, landingAt;
    requestJump(world);
    tick(world, 1, hz, elapsed => {
      peak = Math.max(peak, world.playerMotion.heightAboveGround);
      if (world.playerMotion.grounded && landingAt === undefined) landingAt = elapsed;
    });
    return { peak, landingAt };
  });
  assert(Math.max(...results.map(r => r.peak)) - Math.min(...results.map(r => r.peak)) < .015);
  assert(Math.max(...results.map(r => r.landingAt)) - Math.min(...results.map(r => r.landingAt)) < .035);
});

test('one request does not repeat when Space remains held in the input state', () => {
  const world = fixture(); world.keys[' '] = true;
  requestJump(world); frames(world, 150);
  assert.equal(world.playerMotion.jumpCount, 1);
  assert.equal(world.playerMotion.landingCount, 1);
  assert.equal(world.playerMotion.grounded, true);
});

test('a press just before landing is buffered once, while an early midair press expires', () => {
  const buffered = fixture(); requestJump(buffered); tick(buffered, .52);
  assert.equal(buffered.playerMotion.grounded, false);
  requestJump(buffered); tick(buffered, .18);
  assert.equal(buffered.playerMotion.jumpCount, 2);
  assert.equal(buffered.playerMotion.landingCount, 1);
  assert(buffered.playerMotion.heightAboveGround > .25);
  tick(buffered, 1);
  assert.equal(buffered.playerMotion.jumpCount, 2);
  assert.equal(buffered.playerMotion.landingCount, 2);

  const expired = fixture(); requestJump(expired); tick(expired, .20);
  requestJump(expired); tick(expired, 1);
  assert.equal(expired.playerMotion.jumpCount, 1);
  assert.equal(expired.playerMotion.landingCount, 1);
});

test('leaving a ledge grants a short coyote window without permitting a late midair jump', () => {
  function ledge() {
    const world = fixture();
    world.heightAt = x => x < .5 ? 2.13 : .13;
    resetPlayerMotion(world); world.player.position.x = 1;
    return world;
  }
  const early = ledge(); tick(early, .05);
  assert.equal(early.playerMotion.grounded, false);
  const remainingWindow = early.playerMotion.coyoteTime;
  early.suspended = true; updatePlayerVertical(early, 10);
  assert.equal(early.playerMotion.coyoteTime, remainingWindow, 'pause must not consume a live coyote window');
  early.suspended = false;
  requestJump(early); updatePlayerVertical(early, 1 / 120);
  assert.equal(early.playerMotion.jumpCount, 1);
  assert(early.playerMotion.verticalVelocity > 6);

  const late = ledge(); tick(late, .13);
  requestJump(late); tick(late, .03);
  assert.equal(late.playerMotion.jumpCount, 0);
  assert(late.playerMotion.verticalVelocity < 0);
});

test('a thin overhead sheet stops an upward sweep even with a 100 ms frame', () => {
  const world = fixture();
  const roof = { x: -2, X: 2, z: 18, Z: 22, y: 2.55, height: 2.555 };
  world.cameraOccluders = [roof]; requestJump(world);
  for (let i = 0; i < 15; i++) {
    updatePlayerVertical(world, .1);
    assert(world.player.position.y + world.player.userData.height <= roof.y + 1e-9,
      'head must remain below the underside, independent of sheet thickness');
    assert(world.player.position.y >= .13);
  }
  assert.equal(world.playerMotion.ceilingHits, 1);
  assert.equal(world.playerMotion.landingCount, 1);
  assert.equal(world.playerMotion.grounded, true);
});

test('ceiling clearance equal to standing height never allows a jump through the slab', () => {
  const world = fixture();
  const standingHead = world.player.position.y + world.player.userData.height;
  world.cameraOccluders = [{ x: -2, X: 2, z: 18, Z: 22, y: standingHead, height: standingHead + .02 }];
  requestJump(world); tick(world, .7, 60, () => {
    assert(world.player.position.y >= .13, 'ceiling correction cannot push feet under the floor');
    assert(world.player.position.y + world.player.userData.height <= standingHead + 1e-9);
  });
  assert.equal(world.playerMotion.grounded, true);
});

test('overhead bounds away from the player and below their feet do not block sideways motion', () => {
  const world = fixture();
  world.cameraOccluders = [{ x: 0, X: 1, z: 19, Z: 21, y: 2.5, height: 2.7 }];
  assert.equal(canTraverseOverhead(world, { x: -1, z: 20 }, { x: 2, z: 20 }), true,
    'walking under the canopy has sufficient headroom');
  world.player.position.y = 2.8;
  assert.equal(canTraverseOverhead(world, { x: -1, z: 20 }, { x: 2, z: 20 }), true,
    'height is an absolute top surface, not a thickness added to y');
  world.player.position.y = 1;
  assert.equal(canTraverseOverhead(world, { x: -1, z: 23 }, { x: 2, z: 23 }), true);
});

test('an airborne body cannot enter or tunnel horizontally through a thin canopy edge', () => {
  const world = fixture(); world.player.position.y = 1;
  world.cameraOccluders = [{ x: 0, X: .02, z: 19, Z: 21, y: 2.5, height: 2.7 }];
  assert.equal(canTraverseOverhead(world, { x: -1, z: 20 }, { x: 1, z: 20 }), false);
  assert.equal(world.canPlayerStep({ x: -1, z: 20 }, { x: 1, z: 20 }), false);
});

test('a body already grazing the canopy margin may escape but cannot move deeper', () => {
  const world = fixture(); world.player.position.y = 1;
  world.cameraOccluders = [{ x: 0, X: 1, z: 19, Z: 21, y: 2.5, height: 2.7 }];
  const from = { x: -.25, z: 20 };
  assert.equal(canTraverseOverhead(world, from, { x: .1, z: 20 }), false);
  assert.equal(canTraverseOverhead(world, from, { x: -.5, z: 20 }), true);
});

test('airborne movement retains wall, hazard, river, district and stair approach constraints', () => {
  const world = fixture(); requestJump(world); tick(world, .2);
  assert.equal(world.playerMotion.grounded, false);
  world.colliders = [{ x: 1, X: 1.02, z: 18, Z: 22, height: .4 }];
  assert.equal(world.canPlayerStep({ x: 0, z: 20 }, { x: 2, z: 20 }), false, 'low walls retain the route restriction');
  world.colliders = []; world.hazards = [{ x: 1, z: 20, r: .6 }];
  assert.equal(world.canPlayerStep({ x: 0, z: 20 }, { x: 2, z: 20 }), false);
  world.hazards = [];
  assert.equal(world.canPlayerStep({ x: 0, z: -24 }, { x: 0, z: -25 }), false);
  assert.equal(world.canPlayerStep(
    { x: PLAYABLE_BOUNDS.maxX - .3, z: 20 },
    { x: PLAYABLE_BOUNDS.maxX + .2, z: 20 },
  ), false, 'an airborne player still cannot cross the expanded eastern boundary');
  assert.equal(world.canPlayerStep({ x: -17, z: 7 }, { x: -17, z: 3 }), false,
    'jumping cannot replace the courtyard stair approach');
});

test('the former east boundary is a continuous seam for grounded and airborne movement', () => {
  assert(PLAYABLE_BOUNDS.maxX > CORE_BOUNDS.maxX);
  for (const z of [-20, 23]) {
    const world = fixture();
    const from = { x: CORE_BOUNDS.maxX - .3, z }, to = { x: CORE_BOUNDS.maxX + .2, z };
    world.player.position.set(from.x, world.heightAt(from.x, from.z), from.z);
    resetPlayerMotion(world);
    assert.equal(world.canPlayerStep(from, to), true, `grounded eastward join at z=${z}`);
    assert.equal(world.canPlayerStep(to, from), true, `grounded return to old district at z=${z}`);
    assert.equal(requestJump(world), true); tick(world, .2);
    assert.equal(world.playerMotion.grounded, false);
    assert.equal(world.canPlayerStep(from, to), true, `airborne eastward join at z=${z}`);
    assert.equal(world.canPlayerStep(to, from), true, `airborne return to old district at z=${z}`);
  }
});

test('a standing navigation route must agree with the body clearance used during actual movement', () => {
  const world = fixture();
  // There is enough open street to go around this low lintel. A route may
  // not promise a straight walk which canPlayerStep will reject forever.
  world.cameraOccluders = [{ x: 1, X: 2, z: 19, Z: 21, y: 1.88, height: 2.08 }];
  const route = world.getNavigation({ x: 4, z: 20 }, { approach: false });
  assert.equal(route.reachable, true, 'the unobstructed side of the lintel remains a valid way round');
  assert(route.path.length > 2, 'a standing-height obstruction requires a detour');
  for (let i = 1; i < route.path.length; i++) {
    assert.equal(world.canPlayerStep(route.path[i - 1], route.path[i]), true,
      `accepted route segment ${i} must be traversable by the same standing player`);
  }
  world.cameraOccluders[0].y = 2.5; world.cameraOccluders[0].height = 2.7;
  const tall = world.getNavigation({ x: 4, z: 20 }, { approach: false });
  assert.equal(tall.reachable, true);
  assert.equal(tall.path.length, 2, 'a canopy with comfortable headroom still permits a direct ground route');
  assert.equal(world.canPlayerStep(tall.path[0], tall.path[1]), true);
  world.cameraOccluders[0].y = 1.88; world.cameraOccluders[0].solid = false;
  const foliage = world.getNavigation({ x: 4, z: 20 }, { approach: false });
  assert.equal(foliage.reachable, true);
  assert.equal(foliage.path.length, 2, 'camera-only foliage is not a solid low roof');
  assert.equal(world.canPlayerStep(foliage.path[0], foliage.path[1]), true);
  world.player.position.x = 1.5;
  requestJump(world); tick(world, .3);
  assert(world.playerMotion.heightAboveGround > .95, 'camera-only foliage cannot cancel the jump underneath it');
});

test('an ordinary blocking panel prevents new jumps and lets the current jump land', () => {
  const world = fixture(); requestJump(world); tick(world, .15);
  world.blocked = true;
  assert.equal(requestJump(world), false);
  frames(world, 90);
  assert.equal(world.playerMotion.jumpCount, 1);
  assert.equal(world.playerMotion.grounded, true);
  assert.equal(world.player.position.y, .13);
});

test('a blocking suspended panel cancels a buffered jump before physics returns early', () => {
  const world = fixture(); requestJump(world);
  world.blocked = true; world.suspended = true;
  updatePlayerVertical(world, 10);
  assert.equal(world.playerMotion.bufferedTime, 0);
  world.blocked = false; world.suspended = false;
  updatePlayerVertical(world, 1 / 60);
  assert.equal(world.playerMotion.jumpCount, 0, 'closing a modal must not replay the earlier Space press');
});

test('suspension and the home screen freeze a current flight and resume without accumulated time', () => {
  for (const mode of ['suspended', 'inactive']) {
    const world = fixture(); requestJump(world); tick(world, .15);
    const position = world.player.position.clone(), before = { ...world.playerMotion };
    if (mode === 'suspended') world.suspended = true; else world.active = false;
    assert.equal(requestJump(world), false);
    for (let i = 0; i < 100; i++) updatePlayerVertical(world, .1);
    assert(world.player.position.equals(position));
    assert.deepEqual(world.playerMotion, before, `${mode}: motion clock must be frozen`);
    world.suspended = false; world.active = true;
    updatePlayerVertical(world, 1 / 60);
    assert(world.player.position.y > position.y, 'resume advances a single step of the existing ascent');
    tick(world, 1);
    assert.equal(world.playerMotion.jumpCount, 1);
    assert.equal(world.playerMotion.grounded, true);
  }
});

test('inactive state clears an unconsumed request while a pure pause preserves its timer', () => {
  const inactive = fixture(); requestJump(inactive); inactive.active = false;
  updatePlayerVertical(inactive, 1); inactive.active = true; tick(inactive, .1);
  assert.equal(inactive.playerMotion.jumpCount, 0);
  const paused = fixture(); requestJump(paused); paused.suspended = true;
  const buffer = paused.playerMotion.bufferedTime;
  updatePlayerVertical(paused, 5);
  assert.equal(paused.playerMotion.bufferedTime, buffer);
  paused.suspended = false; updatePlayerVertical(paused, 1 / 60);
  assert.equal(paused.playerMotion.jumpCount, 1);
});

test('reset and setPosition clear airborne velocity and buffered input at the new floor', () => {
  for (const usePublicPosition of [false, true]) {
    const world = fixture(); requestJump(world); tick(world, .2); requestJump(world);
    world.moveSpeed = 5; world.lastMoveDirection = new THREE.Vector2(1, 0);
    if (usePublicPosition) world.setPosition({ x: -17, z: 3 });
    else { world.player.position.set(-17, 4, 3); resetPlayerMotion(world); }
    assert.equal(world.player.position.y, .6);
    assert.equal(world.playerMotion.verticalVelocity, 0);
    assert.equal(world.playerMotion.bufferedTime, 0);
    assert.equal(world.playerMotion.grounded, true);
    assert.equal(world.moveSpeed, 0);
    assert.equal(world.lastMoveDirection.length(), 0);
    tick(world, .5);
    assert.equal(world.playerMotion.jumpCount, 0);
    assert.equal(world.player.position.y, .6);
  }
});

test('invalid time deltas cannot corrupt or advance physical state', () => {
  const world = fixture(); requestJump(world); tick(world, .2);
  const position = world.player.position.clone(), before = { ...world.playerMotion };
  for (const dt of [0, -1, NaN, Infinity, -Infinity]) updatePlayerVertical(world, dt);
  assert(world.player.position.equals(position));
  assert.deepEqual(world.playerMotion, before);
});

test('running and switching camera modes in flight preserve y and velocity until landing', () => {
  const world = fixture(); world.setCameraMode('first');
  world.keys.w = true; world.keys.shift = true;
  frames(world, 20);
  const launch = world.player.position.clone();
  requestJump(world); frames(world, 9);
  assert(world.player.position.z < launch.z - .6);
  assert(world.playerMotion.heightAboveGround > .6, 'horizontal movement cannot snap the feet back to heightAt');
  const before = world.player.position.clone(), velocity = world.playerMotion.verticalVelocity;
  for (const mode of ['street', 'first']) {
    world.setCameraMode(mode);
    assert(world.player.position.equals(before));
    assert.equal(world.playerMotion.verticalVelocity, velocity);
    assert.equal(world.playerMotion.grounded, false);
  }
  assert(Math.abs(world.camera.position.y - world.player.position.y - world.eyeHeight) < 1e-9);
  frames(world, 60, () => assert(Math.abs(world.camera.position.y - world.player.position.y - world.eyeHeight) < 1e-9,
    'first-person camera must follow vertical integration in the same frame'));
  assert.equal(world.playerMotion.grounded, true);
  assert.equal(world.playerMotion.jumpCount, 1);
  assert.equal(world.player.position.y, .13);
});

test('a forced conversation during ascent cannot restore an airborne first-person snapshot', () => {
  const world = fixture(), npc = new THREE.Group(); npc.position.set(2, .13, 20);
  world.npcs = [{ id: 'chef', group: npc }]; world.setCameraMode('first');
  requestJump(world); tick(world, .15);
  assert(world.playerMotion.heightAboveGround > .5);
  world.beginConversation('chef');
  assert.equal(world.conversation.restore.playerPosition.y, .13);
  world.endConversation();
  assert.equal(world.player.position.y, .13);
  assert.equal(world.playerMotion.grounded, true);
  assert.equal(world.playerMotion.verticalVelocity, 0);
  assert(Math.abs(world.camera.position.y - .13 - world.eyeHeight) < 1e-9);
});
