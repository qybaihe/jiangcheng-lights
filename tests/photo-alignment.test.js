import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {bendPoint} from '../src/curved-world.js';
import {PHOTO_CHALLENGES, PHOTO_FRAME_ASPECT, normalizePhotoProgress, recordPhotoResult, createPhotoReferenceCamera, projectPhotoAnchors, getPhotoReferenceAnchors, samplePhotoWorld, evaluatePhotoAlignment, createPhotoAlignmentSession} from '../src/photo-alignment.js';
import {photoInvitationMarkup, photoDirectoryMarkup} from '../src/ui/photo-alignment.js';

function fixture(id = 'shop', patch = {}) {
  const c = PHOTO_CHALLENGES[id], r = c.reference;
  const position = new THREE.Vector3(r.x, r.y, r.z);
  const world = {player: {position}, camera: createPhotoReferenceCamera(id), cameraMode: 'first', propInteractions: {mode: 'walk'}, blocked: false, suspended: false,
    curvedWorld: {center: position, radius: 145, enabled: true, point: (p, out) => bendPoint(p, position, 145, out)}, ...patch};
  const aim = (yaw = r.yaw, pitch = r.pitch) => {world.camera.position.set(position.x, position.y + r.eyeHeight, position.z); world.camera.rotation.set(pitch, -yaw, 0, 'YXZ'); world.camera.updateMatrixWorld(true);};
  return {id, c, world, aim, sample: () => samplePhotoWorld(world, id)};
}

test('two frozen Wuhan photos each identify three real scene features, not generated CG geometry', () => {
  assert.deepEqual(Object.keys(PHOTO_CHALLENGES), ['shop', 'river']);
  for (const c of Object.values(PHOTO_CHALLENGES)) {
    assert.ok(Object.isFrozen(c)); assert.ok(Object.isFrozen(c.reference)); assert.ok(Object.isFrozen(c.anchors[0].point));
    assert.equal(c.anchors.length, 3); assert.equal(c.clues.length, 3); assert.equal(c.discovery.length, 3);
    assert.ok(c.image.startsWith('/media/playful-life-v1/photo-')); assert.equal(c.reference.fov, 68);
    assert.ok(c.positionTolerance >= 1.5); assert.ok(c.anchorTolerance > .1);
    assert.ok(c.reference.z > -24.3 && c.reference.z < 31);
  }
  assert.match(PHOTO_CHALLENGES.river.anchors.map(a => a.title).join(''), /江汉关.*长江大桥/);
});

test('a real first-person camera at both reference poses recognizes all three curved-world anchors', () => {
  for (const id of Object.keys(PHOTO_CHALLENGES)) {
    const f = fixture(id), e = evaluatePhotoAlignment(id, f.sample());
    assert.equal(e.ready, true, JSON.stringify(e)); assert.equal(e.recognizedCount, 3); assert.equal(e.match, 100);
    assert.ok(e.anchors.every(a => a.error < 1e-12));
  }
});

test('the rendered reference frame has each landmark inside the photograph', () => {
  for (const id of Object.keys(PHOTO_CHALLENGES)) for (const a of getPhotoReferenceAnchors(id)) {
    assert.ok(Math.abs(a.x) < 1 && Math.abs(a.y) < 1 && a.z > -1 && a.z < 1, `${id} ${a.id}`); assert.equal(a.visible, true);
  }
});

test('the shot stays consistent at 16:10 and ultrawide sizes instead of stretching the reference', () => {
  for (const aspect of [16 / 10, PHOTO_FRAME_ASPECT, 21 / 9, 32 / 9]) for (const id of ['shop', 'river']) {
    const f = fixture(id); f.world.camera.aspect = aspect; f.world.camera.updateProjectionMatrix();
    assert.equal(evaluatePhotoAlignment(id, f.sample()).ready, true, `${id} ${aspect}`);
  }
});

test('wrong position is not solved by aiming in the reference direction from another street', () => {
  const f = fixture(); f.world.player.position.x += 15; f.aim();
  const e = evaluatePhotoAlignment(f.id, f.sample()); assert.equal(e.ready, false); assert.equal(e.inPosition, false); assert.equal(e.recognizedCount, 0);
});

test('looking away and looking at the ground both require correcting the actual camera', () => {
  for (const [yaw, pitch] of [[Math.PI, .2], [-.1, -.8]]) {
    const f = fixture(); f.aim(yaw, pitch); const e = evaluatePhotoAlignment(f.id, f.sample());
    assert.equal(e.ready, false); assert.equal(e.facing, false); assert.ok(e.recognizedCount < 3);
  }
});

test('yaw wraps around 2π without breaking a matching camera orientation', () => {
  const f = fixture(); f.aim(f.c.reference.yaw + Math.PI * 8, f.c.reference.pitch); assert.equal(evaluatePhotoAlignment(f.id, f.sample()).ready, true);
});

test('small real walking and aim deviations are accepted, rather than pixel-perfect matching', () => {
  for (const id of ['shop', 'river']) {
    const f = fixture(id); f.world.player.position.x += .25; f.world.player.position.z += .3; f.aim(f.c.reference.yaw + .02, f.c.reference.pitch - .015);
    assert.equal(evaluatePhotoAlignment(id, f.sample()).ready, true, id);
  }
});

test('scene position, camera angles AND three projections are jointly required', () => {
  const f = fixture();
  const cases = [s => s.position.x += 20, s => s.position.y += 3, s => s.yaw += .8, s => s.pitch += .8, s => s.anchors.pop(), s => s.anchors[0].x += .5];
  for (const mutate of cases) {const sample = f.sample(); mutate(sample); assert.equal(evaluatePhotoAlignment(f.id, sample).ready, false, String(mutate));}
});

test('behind-camera, hidden, duplicate and non-finite projections never count as the missing clue', () => {
  const f = fixture();
  for (const change of [a => a.z = 1.5, a => a.visible = false, a => a.x = NaN, a => a.id = 'window']) {
    const sample = f.sample(); change(sample.anchors[0]); const e = evaluatePhotoAlignment(f.id, sample);
    assert.equal(e.ready, false); assert.ok(e.recognizedCount < 3);
  }
});

test('vehicles, overview, blocked dialogue and paused world do not take successful pictures', () => {
  for (const patch of [{cameraMode: 'street'}, {cameraMode: 'overview'}, {blocked: true}, {suspended: true}, {conversation: {}}, {propInteractions: {mode: 'bicycle'}}, {propInteractions: {mode: 'boat'}}]) {
    const f = fixture('shop', patch); const e = evaluatePhotoAlignment('shop', f.sample()); assert.equal(e.ready, false); assert.equal(e.recognizedCount, 0);
  }
});

test('invalid samples are deterministic failures, not default-position successes', () => {
  for (const sample of [undefined, null, {}, [], 'shop', {position: {x: 0, y: 0, z: 0}}, {position: {x: NaN, y: .13, z: 23}, yaw: 0, pitch: .2}]) {
    const e = evaluatePhotoAlignment('shop', sample); assert.equal(e.ready, false); assert.equal(e.valid, false); assert.equal(e.match, 0);
  }
  assert.deepEqual(samplePhotoWorld({}, 'shop'), {}); assert.deepEqual(projectPhotoAnchors('shop', null), []);
});

test('invalid photo ids cannot read inherited object properties', () => {
  for (const id of ['__proto__', 'constructor', 'missing', null]) {
    assert.throws(() => createPhotoAlignmentSession(id), RangeError); assert.throws(() => evaluatePhotoAlignment(id), RangeError); assert.throws(() => createPhotoReferenceCamera(id), RangeError);
    assert.deepEqual(getPhotoReferenceAnchors(id), []);
  }
});

test('a reference-aligned update never auto-completes: a deliberate fresh shutter is required', () => {
  const f = fixture(), session = createPhotoAlignmentSession('shop');
  for (let i = 0; i < 600; i++) session.update(f.sample());
  assert.equal(session.snapshot().evaluation.ready, true); assert.equal(session.snapshot().status, 'aligning'); assert.equal(session.snapshot().result, null);
  const result = session.shutter(f.sample()); assert.equal(result.status, 'finished'); assert.equal(result.result.verified, true); assert.ok(Object.isFrozen(result.result));
});

test('a stale green HUD cannot authorize a shutter after the player moves away', () => {
  const f = fixture(), session = createPhotoAlignmentSession('shop'); session.update(f.sample());
  f.world.player.position.x += 20; f.aim(); const s = session.shutter(f.sample());
  assert.equal(s.status, 'aligning'); assert.equal(s.result, null); assert.equal(s.attempts, 1); assert.ok(s.feedback);
});

test('hints advance in three steps without changing evaluation, completing or penalizing a result', () => {
  const f = fixture(), session = createPhotoAlignmentSession('shop'); session.update(f.sample());
  for (let i = 1; i <= 6; i++) {const s = session.hint(); assert.equal(s.hintLevel, Math.min(i, 3)); assert.equal(s.status, 'aligning'); assert.equal(s.attempts, 0);}
  assert.equal(session.shutter(f.sample()).status, 'finished');
});

test('cancel is terminal and cannot leak a completion into saved progress', () => {
  const f = fixture(), session = createPhotoAlignmentSession('shop'); session.update(f.sample()); session.cancel('menu-opened');
  const before = session.snapshot(); assert.equal(before.status, 'cancelled'); assert.equal(before.cancelReason, 'menu-opened');
  assert.deepEqual(session.update(f.sample()), before); assert.deepEqual(session.shutter(f.sample()), before); assert.deepEqual(session.hint(), before);
  assert.deepEqual(recordPhotoResult(null, session.snapshot().result), {version: 1, completed: []});
});

test('a finished snapshot and result remain finished across later updates and cancellation', () => {
  const f = fixture(), session = createPhotoAlignmentSession('shop'); session.shutter(f.sample()); const before = session.snapshot();
  assert.deepEqual(session.update({}), before); assert.deepEqual(session.cancel(), before); assert.deepEqual(session.shutter({}), before);
});

test('snapshots and reference projections cannot mutate session evaluation through aliases', () => {
  const f = fixture(), session = createPhotoAlignmentSession('shop'); session.update(f.sample()); const s = session.snapshot();
  s.evaluation.anchors[0].recognized = false; s.evaluation.anchors[0].target.x = 999; s.evaluation.anchors[0].current.x = 999;
  assert.equal(session.snapshot().evaluation.anchors[0].recognized, true); assert.notEqual(session.snapshot().evaluation.anchors[0].target.x, 999);
  const reference = getPhotoReferenceAnchors('shop'); reference[0].x = 900; assert.notEqual(getPhotoReferenceAnchors('shop')[0].x, 900);
});

test('only genuine issued results are recorded, not serialized or constructed completion objects', () => {
  const f = fixture(), session = createPhotoAlignmentSession('shop'), result = session.shutter(f.sample()).result;
  assert.deepEqual(recordPhotoResult(null, structuredClone(result)), {version: 1, completed: []});
  assert.deepEqual(recordPhotoResult(null, {photoId: 'shop', verified: true, status: 'finished'}), {version: 1, completed: []});
  const p = recordPhotoResult(null, result); assert.deepEqual(p, {version: 1, completed: ['shop']}); assert.deepEqual(recordPhotoResult(p, result), p);
});

test('progress is a canonical unique id list, never a camera, elapsed time, hints or main-story flags', () => {
  const source = {version: 9, completed: ['river', 'river', 'pretend', 'shop', '__proto__'], camera: {x: 9}, flags: ['prepared'], hintLevel: 99}, before = structuredClone(source);
  assert.deepEqual(normalizePhotoProgress(source), {version: 1, completed: ['shop', 'river']}); assert.deepEqual(source, before);
  for (const value of [undefined, null, ['shop'], true, {completed: 'shop'}, {finished: true}, {completed: [1, {}, null]}]) assert.deepEqual(normalizePhotoProgress(value), {version: 1, completed: []});
  const p = normalizePhotoProgress(source); p.completed.length = 0; assert.deepEqual(source, before);
});

test('both genuine photo results survive JSON roundtrip without affecting the existing story', () => {
  let p = normalizePhotoProgress();
  for (const id of ['river', 'shop']) {const f = fixture(id); p = recordPhotoResult(p, createPhotoAlignmentSession(id).shutter(f.sample()).result);}
  const save = {flags: ['received', 'radio'], photos: p, storyChoices: {commitment: 'help'}}, restored = JSON.parse(JSON.stringify(save));
  assert.deepEqual(normalizePhotoProgress(restored.photos), {version: 1, completed: ['shop', 'river']}); assert.deepEqual(restored.flags, ['received', 'radio']);
});

test('the world bridge reads the real rendered curvature rather than projecting logical anchors flat', () => {
  const f = fixture('river'), curved = f.sample(); f.world.curvedWorld.point = (p, out) => out.copy(p); const flat = f.sample();
  assert.ok(Math.abs(curved.anchors[1].y - flat.anchors[1].y) > .15);
  assert.equal(evaluatePhotoAlignment('river', curved).ready, true); assert.equal(evaluatePhotoAlignment('river', flat).ready, false);
});

test('projecting a sample does not move the player, update story state or mutate the camera matrix', () => {
  const f = fixture(), p = f.world.player.position.toArray(), matrix = f.world.camera.matrixWorld.toArray(), camera = f.world.camera.position.toArray();
  samplePhotoWorld(f.world, f.id); assert.deepEqual(f.world.player.position.toArray(), p); assert.deepEqual(f.world.camera.position.toArray(), camera); assert.deepEqual(f.world.camera.matrixWorld.toArray(), matrix);
});

test('invitation copy explains actual controls and optional hints rather than a countdown', () => {
  const html = photoInvitationMarkup(PHOTO_CHALLENGES.shop); assert.match(html, /WASD/); assert.match(html, /Enter/); assert.match(html, /拖动画面/); assert.match(html, /不计时/); assert.match(html, /data-photo-start="shop"/);
  assert.doesNotMatch(html, /role="dialog"|aria-modal/); assert.equal(photoInvitationMarkup(null), '');
});

test('gallery views display only earned photo states and escape supplied narrative text', () => {
  const html = photoDirectoryMarkup({completed: ['shop']}); assert.match(html, /已找回/); assert.match(html, /data-photo-route="river"/); assert.match(html, /loading="lazy"/);
  assert.equal((html.match(/✓ 已找回/g) || []).length, 1);
  const forged = {...PHOTO_CHALLENGES.shop, title: '<img onerror="boom">', note: '&'}; assert.match(photoInvitationMarkup(forged), /&lt;img onerror=&quot;boom&quot;&gt;/);
});

test('controller owns Escape and camera restoration without assigning a player position or writing storage', () => {
  const src = readFileSync(new URL('../src/ui/photo-alignment.js', import.meta.url), 'utf8');
  assert.match(src, /world\.setCameraMode\?\.\('first'\)/); assert.match(src, /world\.setCameraMode\?\.\(mode\)/);
  assert.match(src, /event\.key === 'Escape'/); assert.match(src, /removeEventListener\('keydown', keydown, true\)/);
  assert.doesNotMatch(src, /localStorage|sessionStorage|setPosition\(|player\.position\.(?:set|copy)|world\.blocked\s*=/);
  assert.match(src, /session\.shutter\(samplePhotoWorld/);
});

test('HUD keeps the world interactive, includes reduced-motion behavior, and does not hide by color alone', () => {
  const css = readFileSync(new URL('../src/ui/photo-alignment.css', import.meta.url), 'utf8'), src = readFileSync(new URL('../src/ui/photo-alignment.js', import.meta.url), 'utf8');
  assert.match(css, /pointer-events:none/); assert.match(css, /pointer-events:auto/); assert.match(css, /prefers-reduced-motion/);
  assert.match(src, /aria-expanded/); assert.match(src, /已认出/); assert.match(src, /aria-live="polite"/); assert.doesNotMatch(src, /requestAnimationFrame|setInterval/);
});
