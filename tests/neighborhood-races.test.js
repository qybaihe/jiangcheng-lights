import test from 'node:test';
import assert from 'node:assert/strict';
import {RACE_COURSES, createRaceSession, normalizeRaceProgress, recordRaceResult, raceAvailability} from '../src/neighborhood-races.js';

function runner(id, speed = 4) {
 const course = RACE_COURSES[id], session = createRaceSession(id); let position = {...course.start};
 const update = (dt = .1, extras = {}) => session.update(dt, {...position, mode: course.mode, ...extras});
 const countdown = () => {for (let i = 0; i < 30; i++) update(); assert.equal(session.snapshot().status, 'running');};
 const moveTo = point => {
  const start = {...position}, length = Math.hypot(point.x - start.x, point.z - start.z), steps = Math.max(1, Math.ceil(length / (speed * .1)));
  for (let i = 1; i <= steps; i++) {position = {x: start.x + (point.x - start.x) * i / steps, z: start.z + (point.z - start.z) * i / steps}; update();}
  return session.snapshot();
 };
 return {session, update, countdown, moveTo, course, get position() {return position;}};
}
function finish(id, speed = 4, wait = 0) {
 const r = runner(id, speed); r.countdown(); for (let i = 0; i < wait * 10; i++) r.update();
 for (const cp of r.course.checkpoints) r.moveTo(cp);
 assert.equal(r.session.snapshot().status, 'finished', JSON.stringify(r.session.snapshot()));
 return r.session.snapshot().result;
}

test('both courses have readable Wuhan stories and independent whole-loop checkpoints', () => {
 assert.deepEqual(Object.keys(RACE_COURSES), ['boat', 'car']);
 for (const c of Object.values(RACE_COURSES)) {
  assert.equal(c.id, c.mode); assert.ok(c.parSeconds >= 40 && c.parSeconds <= 75);
  assert.ok(c.checkpoints.length >= 7); assert.ok(c.intro.length >= 2); assert.ok(c.finishText); assert.ok(c.caption);
  assert.ok(Math.hypot(c.start.x - c.checkpoints.at(-1).x, c.start.z - c.checkpoints.at(-1).z) < c.start.radius);
  assert.ok(Object.isFrozen(c)); assert.ok(Object.isFrozen(c.checkpoints[0]));
 }
 assert.match(RACE_COURSES.boat.intro.map(l => l.text).join(''), /轮渡|汽笛/);
 assert.match(RACE_COURSES.car.intro.map(l => l.text).join(''), /豆皮|燕归路/);
});

test('three-second countdown does not award a gate or include countdown in elapsed time', () => {
 const r = runner('boat');
 for (let i = 0; i < 29; i++) r.update();
 assert.equal(r.session.snapshot().status, 'countdown'); assert.equal(r.session.snapshot().elapsed, 0);
 r.update(); const s = r.session.snapshot(); assert.equal(s.status, 'running'); assert.equal(s.checkpointsPassed, 0); assert.ok(s.elapsed < 1e-8);
});

test('starting away from the actual vehicle starting area never starts a run', () => {
 const s = createRaceSession('boat'); assert.equal(s.update(.1, {x: 96, z: -50, mode: 'boat'}).cancelReason, 'outside-start');
 assert.equal(s.snapshot().result, null);
 const legacy = createRaceSession('boat'); assert.equal(legacy.update(.1, {x: 40.5, z: -37.5, mode: 'boat'}).status, 'countdown');
});

test('leaving the start line during countdown cancels rather than granting a flying start', () => {
 const r = runner('car', 6); r.update(); r.moveTo({x: 61, z: 23});
 assert.equal(r.session.snapshot().cancelReason, 'early-start'); assert.equal(r.session.snapshot().result, null);
});

test('checkpoint order is strict: visiting the second before the first earns nothing', () => {
 const r = runner('boat'); r.countdown();
 r.moveTo({x: 42, z: -53}); r.moveTo({x: 81, z: -53}); r.moveTo(r.course.checkpoints[1]);
 assert.equal(r.session.snapshot().checkpointsPassed, 0);
 r.moveTo(r.course.checkpoints[0]); assert.equal(r.session.snapshot().checkpointsPassed, 1);
 r.moveTo(r.course.checkpoints[1]); assert.equal(r.session.snapshot().checkpointsPassed, 2);
});

test('a position jump through a gate cancels instead of awarding progress', () => {
 const r = runner('car'); r.countdown();
 const s = r.session.update(.016, {...r.course.checkpoints[0], mode: 'car'});
 assert.equal(s.status, 'cancelled'); assert.equal(s.cancelReason, 'position-jump'); assert.equal(s.checkpointsPassed, 0);
});

test('pause freezes countdown, elapsed and gates, and pause cannot hide a teleport', () => {
 const r = runner('boat'); r.update(); const before = r.session.snapshot();
 for (let i = 0; i < 20; i++) r.update(.1, {paused: true});
 const paused = r.session.snapshot(); assert.equal(paused.countdown, before.countdown); assert.equal(paused.elapsed, 0); assert.equal(paused.paused, true);
 r.update(); assert.equal(r.session.snapshot().paused, false);
 for (let i = 0; i < 28; i++) r.update();
 const time = r.session.snapshot().elapsed;
 r.session.update(40, {...r.course.checkpoints[0], mode: 'boat', paused: true});
 assert.equal(r.session.snapshot().elapsed, time); assert.equal(r.session.snapshot().checkpointsPassed, 0);
 assert.equal(r.session.update(.1, {...r.course.checkpoints[0], mode: 'boat'}).cancelReason, 'position-jump');
});

test('leaving the vehicle cancels even if a modal is pausing the clock', () => {
 const r = runner('boat'); r.countdown(); assert.equal(r.update(.1, {mode: 'walk', paused: true}).cancelReason, 'vehicle-left');
 const before = r.session.snapshot(); r.moveTo(r.course.checkpoints[0]); assert.deepEqual(r.session.snapshot(), before);
});

test('invalid samples, negative time and suspended frames do not fabricate a result', () => {
 for (const dt of [-.1, NaN, Infinity, 1.01]) {
  const s = createRaceSession('car'); assert.equal(s.update(dt, {...RACE_COURSES.car.start, mode: 'car'}).cancelReason, 'time-gap');
 }
 const s = createRaceSession('boat'); assert.equal(s.update(.1, {x: NaN, z: -40, mode: 'boat'}).cancelReason, 'position-invalid');
 assert.throws(() => createRaceSession('__proto__'), RangeError); assert.throws(() => createRaceSession('missing'), RangeError);
});

test('zero-duration samples do not advance or consume the countdown', () => {
 const r = runner('car'); assert.deepEqual(r.update(0), r.session.snapshot()); assert.equal(r.session.snapshot().countdown, 3);
});

test('time limit ends a stationary run and can never grant a medal', () => {
 const r = runner('boat'); r.countdown(); for (let i = 0; i < 116; i++) r.update(1);
 assert.equal(r.session.snapshot().cancelReason, 'time-limit'); assert.equal(r.session.snapshot().result, null);
});

test('both complete traversals issue immutable results with all eight gates', () => {
 for (const id of ['boat', 'car']) {
  const result = finish(id); assert.equal(result.courseId, id); assert.equal(result.checkpoints, 8); assert.equal(result.verified, true);
  assert.ok(result.elapsed > 15); assert.ok(Object.isFrozen(result));
 }
});

test('a finished run stays finished after cancel or subsequent movement', () => {
 const r = runner('boat'); r.countdown(); for (const cp of r.course.checkpoints) r.moveTo(cp);
 const original = r.session.snapshot(); assert.deepEqual(r.session.cancel(), original);
 assert.deepEqual(r.session.update(.1, {x: 0, z: 0, mode: 'walk'}), original);
});

test('only locally issued, once-recorded results count, not UI flags or serialized clones', () => {
 const result = finish('boat'), empty = normalizeRaceProgress();
 assert.deepEqual(recordRaceResult(empty, {courseId: 'boat', status: 'finished', verified: true, checkpoints: 8, elapsed: 42}), empty);
 assert.deepEqual(recordRaceResult(empty, structuredClone(result)), empty);
 const progress = recordRaceResult(empty, result); assert.equal(progress.courses.boat.completions, 1);
 assert.equal(progress.courses.car.completions, 0); assert.deepEqual(recordRaceResult(progress, result), progress);
});

test('personal best is retained and replays still preserve last completed time', () => {
 const first = finish('car', 5.5), second = finish('car', 4, 20);
 let p = recordRaceResult(null, first); p = recordRaceResult(p, second);
 assert.equal(p.courses.car.completions, 2); assert.equal(p.courses.car.bestSeconds, first.elapsed); assert.equal(p.courses.car.lastSeconds, second.elapsed);
 assert.equal(p.courses.car.bestMedal, first.medal);
});

test('normalization repairs malformed saves and never carries transient or story data', () => {
 const raw = {flags: ['prepared'], state: 'finished', mode: 'boat', courses: {
  boat: {completions: 20000, bestSeconds: 45, lastSeconds: 68, bestMedal: 'pretend'},
  car: {completions: '1', bestSeconds: 50}, extra: {completions: 9},
 }};
 const before = structuredClone(raw), p = normalizeRaceProgress(raw);
 assert.equal(p.courses.boat.completions, 9999); assert.equal(p.courses.boat.bestMedal, 'gold'); assert.equal(p.courses.car.completions, 0);
 assert.deepEqual(Object.keys(p), ['version', 'courses']); assert.deepEqual(Object.keys(p.courses), ['boat', 'car']);
 p.courses.boat.lastSeconds = 2; assert.deepEqual(raw, before);
 for (const bestSeconds of [0, 1, Infinity, NaN, -1, '40', 900]) assert.equal(normalizeRaceProgress({courses: {boat: {completions: 2, bestSeconds}}}).courses.boat.completions, 0);
});

test('all medals are derived from elapsed time, not a client-provided medal string', () => {
 for (const [seconds, medal] of [[45, 'gold'], [65, 'silver'], [99, 'bronze']]) {
  assert.equal(normalizeRaceProgress({courses: {boat: {completions: 2, bestSeconds: seconds, bestMedal: 'gold'}}}).courses.boat.bestMedal, medal);
 }
});

test('weather and completed-run gates match community story phases and reopen after postlude', () => {
 for (const id of ['boat', 'car']) {
  assert.equal(raceAvailability({flags: []}, id).available, true);
  assert.equal(raceAvailability({flags: ['prepared']}, id).available, false);
  assert.equal(raceAvailability({flags: ['checked']}, id).available, false);
  assert.equal(raceAvailability({flags: ['prepared', 'checked', 'postlude']}, id).available, true);
  assert.equal(raceAvailability({flags: ['postlude'], runEnded: true}, id).available, false);
 }
 assert.equal(raceAvailability(null, '__proto__').available, false);
});
