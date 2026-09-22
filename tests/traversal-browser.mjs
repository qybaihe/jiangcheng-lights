import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createWriteStream } from 'node:fs';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STREET_COMPOSITION_ROUTES } from '../src/street-composition.js';

// Run only after the preview build is frozen:
// QA_STAGE=candidate EXPECTED_BUILD_ASSET=/assets/index-<hash>.js node tests/traversal-browser.mjs
// No fixtures are injected. Every game mutation below is a mouse/keyboard UI action.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.GAME_URL || 'http://localhost:4173/';
const stage = process.env.QA_STAGE || 'candidate';
const newLanes = stage === 'final' || process.env.QA_NEW_LANES === '1';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dir = process.env.QA_OUTPUT_DIR ? path.resolve(root, process.env.QA_OUTPUT_DIR)
  : path.join(root, 'output', 'qa', 'traversal', stamp);
const viewport = {
  width: Number(process.env.QA_WIDTH || 1440),
  height: Number(process.env.QA_HEIGHT || 900),
};
assert(Number.isInteger(viewport.width) && viewport.width >= 1024 && viewport.width <= 3840 &&
  Number.isInteger(viewport.height) && viewport.height >= 600 && viewport.height <= 2160,
  'QA_WIDTH/QA_HEIGHT must be supported integer desktop viewport dimensions');
const lookCenter = { x: viewport.width / 2, y: viewport.height / 2 };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const angle = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
await mkdir(dir, { recursive: true });
const trace = createWriteStream(path.join(dir, 'samples.ndjson'));
const report = {
  started: new Date().toISOString(), stage, newLanes, base, viewport, output: dir, status: 'running',
  expectedBuildAsset: process.env.EXPECTED_BUILD_ASSET || null,
  checks: [], steps: [], screenshots: [], errors: [], requests: [],
  uncovered: [
    'Active-world memory suspension: the accessible intro film is opened from the inactive welcome screen.',
    'Mobile/touch, full story and puzzles, coyote/ledge timing, real canopy collisions.',
  ],
  limitations: [
    'One desktop viewport and one Chrome context; no mobile or touch coverage.',
    'No full story, puzzle completion, ledge/coyote timing or canopy collision coverage.',
    'Suspended-film recovery is exercised from the inactive welcome screen; active memory suspension is not covered.',
    'This is a correctness recording, not a frame-rate benchmark.',
  ],
};
let browser, context, page, video, sampler, sampling = false, currentStep = 'initialisation';
let lastCanvasClick = 0, canvasClicks = 0, expectedURL, loadedScriptHash;
const samples = [], held = new Set(), responseJobs = [];
const recordError = (kind, error, extra = {}) => report.errors.push({
  at: new Date().toISOString(), step: currentStep, kind,
  message: error?.stack || error?.message || String(error), ...extra,
});
function check(condition, name, details) {
  report.checks.push({ name, passed: Boolean(condition), step: currentStep, details });
  assert(condition, name);
  console.log('PASS', name);
}
async function read() {
  return page.evaluate(() => {
    const api = window.__JIANGCHENG__;
    return {
      at: performance.now(), world: api?.getWorld() ?? null,
      modal: api?.getModal() ?? null,
      ui: {
        welcomeVisible: Boolean(document.querySelector('#welcome') && !document.querySelector('#welcome').hidden),
        focusedTag: document.activeElement?.tagName, focusedId: document.activeElement?.id,
        inWorldDialogue: Boolean(document.querySelector('.story.in-world')),
      },
    };
  });
}
async function sample(label = currentStep) {
  const entry = { receivedAt: Date.now(), step: label, ...await read() };
  samples.push(entry);
  trace.write(JSON.stringify(entry) + '\n');
  return entry;
}
async function checkpoint(label) {
  const state = await sample(label);
  const name = `${String(report.screenshots.length + 1).padStart(2, '0')}-${label.replace(/[^a-z0-9-]/gi, '-')}.png`;
  await page.screenshot({ path: path.join(dir, name) });
  report.screenshots.push({ name, label, at: state.at });
  await writeFile(path.join(dir, name.replace('.png', '.json')), JSON.stringify(state, null, 2));
  return state;
}
async function until(predicate, name, timeout = 10000) {
  const deadline = Date.now() + timeout;
  let last;
  do {
    last = await sample();
    if (predicate(last)) return last;
    await sleep(35);
  } while (Date.now() < deadline);
  throw new Error(`${name} timed out: ${JSON.stringify(last?.world?.playerMotion || last)}`);
}
async function step(name, action) {
  currentStep = name;
  const item = { name, started: new Date().toISOString(), sampleStart: samples.length };
  report.steps.push(item);
  await checkpoint(`${name}-before`);
  try {
    await action();
    item.passed = true;
  } catch (error) {
    item.passed = false; item.failure = error.stack;
    throw error;
  } finally {
    item.finished = new Date().toISOString(); item.sampleEnd = samples.length;
    await checkpoint(`${name}-${item.passed ? 'after' : 'failure'}`).catch(error => recordError('checkpoint', error));
    await writeFile(path.join(dir, 'report.json'), JSON.stringify(report, null, 2));
  }
}
async function down(key) { await page.keyboard.down(key); held.add(key); }
async function up(key) { await page.keyboard.up(key); held.delete(key); }
async function releaseAll() {
  for (const key of [...held]) await up(key).catch(error => recordError('release-key', error));
}
async function focusWorld() {
  // Do not use DOM focus() or a double click: double click is game navigation.
  await sleep(Math.max(0, 650 - (Date.now() - lastCanvasClick)));
  const point = await page.evaluate(index => {
    const points = [[.58, .48], [.67, .55], [.52, .53], [.75, .45]];
    for (let i = 0; i < points.length; i++) {
      const [fx, fy] = points[(i + index) % points.length];
      const x = innerWidth * fx, y = innerHeight * fy;
      if (document.elementFromPoint(x, y)?.id === 'world') return { x, y };
    }
    return null;
  }, canvasClicks++);
  assert(point, 'A visible canvas point must be available for a real focus click');
  await page.mouse.click(point.x, point.y, { clickCount: 1, delay: 35 });
  lastCanvasClick = Date.now();
  assert.equal((await read()).ui.focusedId, 'world', 'The mouse click focuses the canvas');
}
async function settle() {
  return until(s => s.world?.playerMotion?.grounded && s.world.moveSpeed < .03, 'grounded and stopped');
}
async function clickNow(selector) {
  const box = await page.locator(selector).boundingBox();
  assert(box, `${selector} is visible`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { clickCount: 1, delay: 10 });
}
async function alignNorth() {
  for (let i = 0; i < 6; i++) {
    const before = (await read()).world;
    const delta = angle(before.heading, 0);
    if (Math.abs(delta) < .035) return;
    await focusWorld();
    const dx = Math.max(-320, Math.min(320, delta / .0024));
    await page.mouse.move(lookCenter.x, lookCenter.y); await page.mouse.down();
    await page.mouse.move(lookCenter.x + dx, lookCenter.y, { steps: 12 }); await page.mouse.up();
    await sleep(200);
  }
  check(Math.abs(angle((await read()).world.heading, 0)) < .08, 'Real mouse dragging turns toward the clear central street');
}
async function move(key, run, meters) {
  await focusWorld();
  const before = (await settle()).world;
  const offsets = { w: 0, d: Math.PI / 2, s: Math.PI, a: -Math.PI / 2 };
  const heading = before.heading + offsets[key];
  const points = Array.from({ length: 12 }, (_, i) => ({
    x: before.position.x + Math.sin(heading) * meters * (i + 1) / 12,
    z: before.position.z - Math.cos(heading) * meters * (i + 1) / 12,
  }));
  const safe = await page.evaluate(points => points.every(p => window.__JIANGCHENG__.canWalk(p.x, p.z)), points);
  assert(safe, `${key} movement must stay on a verified walkable street`);
  try {
    if (run) await down('Shift');
    await down(key);
    const moving = await until(s => distance(s.world.position, before.position) >= meters && s.world.moveSpeed >= (run ? 4.5 : 2.8), `${run ? 'run' : 'walk'} ${key}`);
    check(true, `${run ? 'Shift running' : 'Walking'} responds to ${key.toUpperCase()}`, {
      speed: moving.world.moveSpeed, traveled: distance(moving.world.position, before.position),
    });
  } finally { await releaseAll(); }
  await settle();
}
async function beginJump() {
  await focusWorld();
  const before = (await settle()).world;
  await page.keyboard.press('Space', { delay: 25 });
  const airborne = await until(s => s.world.playerMotion.jumpCount === before.playerMotion.jumpCount + 1 &&
    !s.world.playerMotion.grounded && s.world.playerMotion.heightAboveGround > .05, 'jump takeoff');
  return { before, airborne };
}
async function land(jump) {
  const landed = await until(s => s.world.playerMotion.grounded &&
    s.world.playerMotion.landingCount >= jump.before.playerMotion.landingCount + 1, 'jump landing');
  check(landed.world.playerMotion.jumpCount === jump.before.playerMotion.jumpCount + 1,
    'One physical press produces exactly one jump');
  return landed;
}
function checkJumpFrames(startIndex, jumpNumber) {
  const flight = samples.slice(startIndex).filter(s => s.world?.playerMotion?.jumpCount === jumpNumber &&
    !s.world.playerMotion.grounded && s.world.playerMotion.heightAboveGround > .1 &&
    s.world.cameraMode === 'street' && !s.modal && !s.ui.welcomeVisible);
  check(flight.length >= 2, 'Jump trajectory has multiple airborne frame samples', { count: flight.length });
  const escaped = flight.filter(s => ['head', 'feet'].some(part => {
    const p = s.world.playerFrame?.[part];
    return !p?.visible || !Number.isFinite(p.x) || !Number.isFinite(p.y) ||
      p.x < 0 || p.x > viewport.width || p.y < 0 || p.y > viewport.height;
  }));
  check(escaped.length === 0, 'Head and feet remain on screen during the sampled jump trajectory', {
    count: flight.length, escaped: escaped.map(s => ({ at: s.at, frame: s.world.playerFrame })),
  });
}

async function wallTurnProbe() {
  const probe = report.wallTurn = {
    purpose: 'Independent real-input wall-turn check, excluded from the 60–90 second tour.',
    target: { x: -9.5, z: 17 }, inputSensitivity: .0024,
    floatingPointMargin: .0001, idleAngularSpeedLimit: 1.8,
    startedAt: new Date().toISOString(), inputs: [], idleFrames: [], heldPauses: [],
    projectionScope: 'Head/feet markers are evidence only; wall contraction may intentionally crop or fade the player.',
  };
  const frame = async () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const w = window.__JIANGCHENG__.getWorld();
      resolve({ at: performance.now(), world: {
        position: w.position, heading: w.heading, camera: w.camera, cameraTarget: w.cameraTarget,
        cameraDistance: w.cameraDistance, playerFrame: w.playerFrame, renderFrame: w.renderFrame,
        cameraMode: w.cameraMode, moveSpeed: w.moveSpeed, simulationTime: w.simulationTime,
      } });
    }))));
  const save = () => writeFile(path.join(dir, 'wall-turn.json'), JSON.stringify(probe, null, 2));
  const options = [
    { keys: ['w'], offset: 0 }, { keys: ['w', 'd'], offset: Math.PI / 4 },
    { keys: ['d'], offset: Math.PI / 2 }, { keys: ['s', 'd'], offset: Math.PI * 3 / 4 },
    { keys: ['s'], offset: Math.PI }, { keys: ['s', 'a'], offset: -Math.PI * 3 / 4 },
    { keys: ['a'], offset: -Math.PI / 2 }, { keys: ['w', 'a'], offset: -Math.PI / 4 },
  ];
  try {
    // Reach the existing shop approach through the visible map, then walk the
    // final metres to the same wall corner as the original failing recording.
    await page.locator('#map').click(); await page.locator('#map-destination').selectOption('shop');
    await page.locator('#map-go').click();
    await until(s => s.world.remainingRoute === 0 && s.world.moveSpeed < .03 &&
      distance(s.world.position, probe.target) < 3.1, 'wall-turn real map arrival', 45000);
    await focusWorld();
    const origin = (await settle()).world.position;
    probe.walk = { from: origin, target: probe.target, keyChanges: [] };
    const length = distance(origin, probe.target);
    const unit = { x: (probe.target.x - origin.x) / length, z: (probe.target.z - origin.z) / length };
    let activeKeys = [], best = length, lastProgress = Date.now();
    const deadline = Date.now() + 12000;
    try {
      while (true) {
        const current = await read(), position = current.world.position;
        const left = distance(position, probe.target);
        if (left <= .16) break;
        assert(current.world.remainingRoute === 0, 'Wall-turn approach uses real keys after the map route ends');
        if (left < best - .015) { best = left; lastProgress = Date.now(); }
        assert(Date.now() - lastProgress < 1500 && Date.now() < deadline, 'Wall-turn approach remains unobstructed');
        const progress = (position.x - origin.x) * unit.x + (position.z - origin.z) * unit.z;
        const ahead = Math.min(length, Math.max(0, progress) + .5);
        const aim = { x: origin.x + unit.x * ahead, z: origin.z + unit.z * ahead };
        const desired = Math.atan2(aim.x - position.x, position.z - aim.z);
        const selected = options.reduce((a, b) => Math.abs(angle(current.world.heading + a.offset, desired)) <=
          Math.abs(angle(current.world.heading + b.offset, desired)) ? a : b);
        if (selected.keys.join() !== activeKeys.join()) {
          for (const key of activeKeys) if (!selected.keys.includes(key)) await up(key);
          for (const key of selected.keys) if (!activeKeys.includes(key)) await down(key);
          activeKeys = selected.keys;
          probe.walk.keyChanges.push({ at: current.at, position, keys: [...activeKeys] });
        }
        await sleep(30);
      }
    } finally { for (const key of activeKeys) await up(key); }
    const corner = await settle();
    probe.corner = corner;
    assert(distance(corner.world.position, probe.target) < .3, 'The wall-turn starts within 30cm of the actual corner');
    await checkpoint('wall-turn-corner');
    // Observe the same trusted pointer event before and after the application's
    // handler. This avoids attributing a tool scheduling pause to a 12px drag.
    // The observer only reads diagnostics; it never dispatches events or calls
    // an application method that changes game state.
    await page.evaluate(() => {
      const rows = [], pending = new WeakMap();
      let previousX = null;
      const snapshot = () => {
        const w = window.__JIANGCHENG__.getWorld();
        return { at: performance.now(), heading: w.heading, camera: w.camera,
          cameraDistance: w.cameraDistance, playerOpacity: w.playerOpacity,
          playerVisible: w.playerVisible, renderFrame: w.renderFrame };
      };
      const down = event => { if (event.target?.id === 'world' && event.button === 0) previousX = event.clientX; };
      const before = event => {
        if (event.target?.id !== 'world' || !(event.buttons & 1) || previousX === null) return;
        pending.set(event, { trusted: event.isTrusted, dx: event.clientX - previousX,
          clientX: event.clientX, buttons: event.buttons, before: snapshot() });
        previousX = event.clientX;
      };
      const after = event => {
        const item = pending.get(event);
        if (item) { item.after = snapshot(); rows.push(item); pending.delete(event); }
      };
      const up = () => { previousX = null; };
      window.addEventListener('pointerdown', down, true);
      window.addEventListener('pointermove', before, true);
      window.addEventListener('pointermove', after, false);
      window.addEventListener('pointerup', up, true);
      window.__JIANGCHENG_WALL_OBSERVER__ = { rows, cleanup: () => {
        window.removeEventListener('pointerdown', down, true);
        window.removeEventListener('pointermove', before, true);
        window.removeEventListener('pointermove', after, false);
        window.removeEventListener('pointerup', up, true);
        delete window.__JIANGCHENG_WALL_OBSERVER__;
      } };
    });
    for (const direction of [-1, 1]) {
      for (let sweep = 0; sweep < 3; sweep++) {
        const start = { x: lookCenter.x - direction * 240, y: lookCenter.y };
        assert(await page.evaluate(p => document.elementFromPoint(p.x, p.y)?.id === 'world', start),
          'Wall-turn drags start on exposed canvas');
        await page.mouse.move(start.x, start.y); await page.mouse.down();
        let releaseFrame;
        try {
          for (let i = 1; i <= 40; i++) {
            if (i === 21) {
              const heldBefore = await frame();
              await sleep(420);
              const heldAfter = await frame();
              const actualDelta = angle(heldBefore.world.heading, heldAfter.world.heading);
              const pause = { direction, sweep, requestedPauseMs: 420,
                actualPauseMs: heldAfter.at - heldBefore.at, actualDelta,
                before: heldBefore, after: heldAfter,
                passed: Math.abs(actualDelta) <= probe.floatingPointMargin };
              probe.heldPauses.push(pause);
              assert(pause.passed, 'A held pointer pause longer than 350ms must not rotate the camera');
            }
            const before = await frame();
            const cursor = await page.evaluate(() => window.__JIANGCHENG_WALL_OBSERVER__.rows.length);
            const dx = direction * 12;
            await page.mouse.move(start.x + dx * i, start.y);
            const after = await frame();
            const observed = await page.evaluate(cursor => window.__JIANGCHENG_WALL_OBSERVER__.rows.slice(cursor), cursor);
            assert(observed.length === 1 && observed[0].trusted && observed[0].dx === dx,
              'Each wall-turn increment is exactly one trusted native pointermove with the requested dx');
            const event = observed[0];
            const actualDelta = angle(event.before.heading, event.after.heading);
            const maximum = Math.abs(dx) * probe.inputSensitivity + probe.floatingPointMargin;
            const input = {
              direction, sweep, index: i, dx, requestedDelta: dx * probe.inputSensitivity,
              actualDelta, maximumAbsoluteDelta: maximum, eventDurationMs: event.after.at - event.before.at,
              schedulerIntervalMs: after.at - before.at, event,
              before, after, passed: Math.abs(actualDelta) <= maximum,
            };
            probe.inputs.push(input);
            assert(input.passed, `Wall-turn input ${probe.inputs.length}: ${actualDelta} rad exceeds requested ${maximum} rad`);
          }
        } finally { releaseFrame = await frame(); await page.mouse.up(); }
        let previous = releaseFrame;
        for (let i = 0; i < 40; i++) {
          const next = await frame(), dt = next.world.simulationTime - previous.world.simulationTime;
          assert(Number.isFinite(dt) && dt > 0, 'The idle angular limit uses the same simulation clock as the camera');
          const actualDelta = angle(previous.world.heading, next.world.heading);
          const maximum = probe.idleAngularSpeedLimit * dt + probe.floatingPointMargin;
          const idle = { direction, sweep, dtMs: dt * 1000, wallclockDeltaMs: next.at - previous.at,
            timebase: 'getWorld.simulationTime', actualDelta, maximumAbsoluteDelta: maximum,
            before: previous, after: next, passed: Math.abs(actualDelta) <= maximum };
          probe.idleFrames.push(idle);
          assert(idle.passed, `Wall-turn idle frame ${probe.idleFrames.length} exceeds 1.8 rad/s`);
          previous = next;
        }
        await save();
      }
    }
    check(probe.inputs.length === 240 && probe.inputs.every(x => x.passed),
      'Wall-turn real mouse increments never exceed the requested wrapped angle', {
        inputs: probe.inputs.length, maximumActualRadians: Math.max(...probe.inputs.map(x => Math.abs(x.actualDelta))),
      });
    check(probe.heldPauses.length === 6 && probe.heldPauses.every(x => x.passed),
      'Held mouse pauses above 350ms preserve heading before the next exact drag', { pauses: probe.heldPauses.length });
    check(probe.idleFrames.length === 240 && probe.idleFrames.every(x => x.passed),
      'Wall-turn frames without mouse input stay within 1.8 rad/s', { frames: probe.idleFrames.length });
    probe.completed = true;
  } catch (error) {
    probe.failure = error.stack || String(error);
    throw error;
  } finally {
    await page.mouse.up().catch(() => {}); await releaseAll();
    await page.evaluate(() => window.__JIANGCHENG_WALL_OBSERVER__?.cleanup()).catch(() => {});
    probe.finishedAt = new Date().toISOString();
    await save();
  }
}

async function finalRouteTour() {
  const started = await sample('tour-start');
  const tour = report.tour = {
    targetSeconds: [60, 90], startedAt: new Date(started.receivedAt).toISOString(),
    startWallclockMs: started.receivedAt, startPagePerformanceMs: started.at,
    videoTiming: 'Use the recorded wallclock and page performance marks; no footage is sped up or repeated.',
    functionalChecksBeforeTour: report.functionalResult,
    stations: [], events: [], extraRoutes: [], lanes: [],
    laneMode: newLanes ? 'real-keyboard-mouse-waypoints' : 'existing-map-navigation',
  };
  const elapsed = () => (Date.now() - tour.startWallclockMs) / 1000;
  const timecode = seconds => {
    const ms = Math.round(seconds * 1000);
    return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
  };
  const mark = async (kind, details = {}) => {
    const s = await sample(`tour-${kind}`);
    const event = {
      kind, wallclock: new Date(s.receivedAt).toISOString(), wallclockMs: s.receivedAt,
      pagePerformanceMs: s.at, tourSeconds: (s.receivedAt - tour.startWallclockMs) / 1000,
      pageTimecode: timecode(s.at / 1000),
      approximateVideoSeconds: (s.receivedAt - report.videoPageCreatedWallclockMs) / 1000,
      position: s.world.position, cameraMode: s.world.cameraMode, ...details,
    };
    event.tourTimecode = timecode(event.tourSeconds);
    tour.events.push(event);
    await writeFile(path.join(dir, 'tour.json'), JSON.stringify(tour, null, 2));
    return event;
  };
  const places = {
    shop: { name: '陆记修理铺', x: -9.5, z: 17 },
    granny: { name: '林婆婆的小院', x: -17, z: .7 },
    chef: { name: '蔡姨的过早铺', x: 10, z: 12 },
    dock: { name: '轮渡边的周伯', x: 22, z: -20 },
    community: { name: '晴川里社区', x: 12, z: -3 },
  };
  async function look(dx) {
    await focusWorld();
    await page.mouse.move(lookCenter.x, lookCenter.y); await page.mouse.down();
    try {
      for (let i = 1; i <= 10; i++) {
        await page.mouse.move(lookCenter.x + dx * i / 10, lookCenter.y);
        await sleep(24);
      }
    } finally { await page.mouse.up(); }
  }
  async function walkLane(id) {
    const route = STREET_COMPOSITION_ROUTES[id];
    assert(route?.length, `${id} has exported, explicit street waypoints`);
    const lane = {
      id, source: 'src/street-composition.js#STREET_COMPOSITION_ROUTES',
      expectedWaypoints: route.map(p => ({ ...p })),
      routeSHA256: createHash('sha256').update(JSON.stringify(route)).digest('hex'),
      releaseRadius: .34, arrivalTolerance: .40,
      inputMode: 'mouse drag and real WASD keyboard feedback', waypoints: [], inputs: [], completed: false,
    };
    tour.lanes.push(lane);
    const sweepClear = async (from, to) => {
      const result = await page.evaluate(({ from, to }) => {
        const count = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / .1));
        for (let i = 0; i <= count; i++) {
          const p = { x: from.x + (to.x - from.x) * i / count, z: from.z + (to.z - from.z) * i / count };
          if (!window.__JIANGCHENG__.canWalk(p.x, p.z)) return { clear: false, blocked: p, sample: i, count };
        }
        return { clear: true, count };
      }, { from, to });
      assert(result.clear, `${id} approach must be walkable: ${JSON.stringify(result)}`);
      return result;
    };
    const turn = async (delta, maxPixels = 300) => {
      const before = await read();
      const visible = await page.evaluate(p => document.elementFromPoint(p.x, p.y)?.id === 'world', lookCenter);
      assert(visible, 'Lane steering must drag an exposed canvas point');
      const dx = Math.max(-maxPixels, Math.min(maxPixels, delta / .0024));
      const input = {
        type: 'mouse-drag', start: { ...lookCenter }, end: { x: lookCenter.x + dx, y: lookCenter.y }, dx,
        requestedHeadingDelta: delta, startedWallclockMs: Date.now(),
        startedPagePerformanceMs: before.at, headingBefore: before.world.heading,
      };
      lane.inputs.push(input);
      await page.mouse.move(lookCenter.x, lookCenter.y); await page.mouse.down();
      try {
        await page.mouse.move(lookCenter.x + dx, lookCenter.y, { steps: Math.max(2, Math.ceil(Math.abs(dx) / 60)) });
      } finally { await page.mouse.up(); }
      await sleep(35);
      const after = await read();
      Object.assign(input, {
        endedWallclockMs: Date.now(), endedPagePerformanceMs: after.at,
        headingAfter: after.world.heading, positionAfter: after.world.position,
      });
    };
    try {
      if ((await read()).ui.focusedId !== 'world') await focusWorld();
      await settle();
      lane.departure = await mark('lane-start', { lane: id, expectedWaypoints: lane.expectedWaypoints });
      for (const [index, target] of route.entries()) {
        const waypoint = { index, target: { ...target }, approaches: [] };
        lane.waypoints.push(waypoint);
        waypoint.departure = await mark('waypoint-departure', { lane: id, waypoint: index, target });
        for (let attempt = 0; attempt < 3; attempt++) {
          let state = await read();
          if (distance(state.world.position, target) <= lane.releaseRadius) break;
          assert(state.modal === null && state.world.active && !state.world.blocked,
            'Waypoint steering requires the active, unobstructed 3D world');
          assert.equal(state.world.remainingRoute, 0, 'Waypoint walking cannot use an automatic route');
          const approach = { attempt, from: state.world.position, target: { ...target } };
          waypoint.approaches.push(approach);
          approach.sweep = await sweepClear(state.world.position, target);
          // Third-person wall avoidance can offset the actual camera by 15–90°.
          // Use camera-relative keyboard directions instead of requiring a W-only
          // camera bearing that may be inaccessible beside a wall.
          const options = [
            { keys: ['w'], offset: 0 }, { keys: ['w', 'd'], offset: Math.PI / 4 },
            { keys: ['d'], offset: Math.PI / 2 }, { keys: ['s', 'd'], offset: Math.PI * 3 / 4 },
            { keys: ['s'], offset: Math.PI }, { keys: ['s', 'a'], offset: -Math.PI * 3 / 4 },
            { keys: ['a'], offset: -Math.PI / 2 }, { keys: ['w', 'a'], offset: -Math.PI / 4 },
          ];
          for (let correction = 0; correction < 2; correction++) {
            state = await read();
            const desired = Math.atan2(target.x - state.world.position.x, state.world.position.z - target.z);
            const option = options.reduce((a, b) => Math.abs(angle(state.world.heading + a.offset, desired)) <=
              Math.abs(angle(state.world.heading + b.offset, desired)) ? a : b);
            const delta = angle(state.world.heading + option.offset, desired);
            if (Math.abs(delta) <= .04) break;
            await turn(delta, 160);
          }
          state = await read();
          const segment = {
            x: target.x - state.world.position.x, z: target.z - state.world.position.z,
          };
          const segmentStart = { ...state.world.position };
          const segmentLength = Math.hypot(segment.x, segment.z);
          segment.x /= segmentLength; segment.z /= segmentLength;
          const input = {
            type: 'keyboard-feedback', startedWallclockMs: Date.now(),
            startedPagePerformanceMs: state.at, positionBefore: state.world.position,
            lane: id, waypoint: index, attempt, keyChanges: [],
          };
          lane.inputs.push(input);
          let best = distance(state.world.position, target), lastProgress = Date.now();
          const deadline = Date.now() + Math.max(6000, best * 900 + 4000);
          let activeKeys = [];
          try {
            while (true) {
              state = await sample(`tour-${id}-waypoint-${index}`);
              const deviation = distance(state.world.position, target);
              if (deviation <= lane.releaseRadius) break;
              if (deviation < best - .015) { best = deviation; lastProgress = Date.now(); }
              assert(Date.now() - lastProgress < 1500, `${id} waypoint ${index} made no progress for 1.5 seconds`);
              assert(Date.now() < deadline, `${id} waypoint ${index} exceeded its bounded walking time`);
              assert.equal(state.world.remainingRoute, 0, 'Actual keyboard traversal has no automatic navigation');
              const progress = (state.world.position.x - segmentStart.x) * segment.x +
                (state.world.position.z - segmentStart.z) * segment.z;
              const ahead = Math.min(segmentLength, Math.max(0, progress) + .65);
              const aim = { x: segmentStart.x + segment.x * ahead, z: segmentStart.z + segment.z * ahead };
              const desired = Math.atan2(aim.x - state.world.position.x, state.world.position.z - aim.z);
              const selected = options.reduce((a, b) => Math.abs(angle(state.world.heading + a.offset, desired)) <=
                Math.abs(angle(state.world.heading + b.offset, desired)) ? a : b);
              if (selected.keys.join() !== activeKeys.join()) {
                for (const key of activeKeys) if (!selected.keys.includes(key)) await up(key);
                for (const key of selected.keys) if (!activeKeys.includes(key)) await down(key);
                activeKeys = selected.keys;
                input.keyChanges.push({ keys: [...activeKeys], wallclockMs: Date.now(),
                  pagePerformanceMs: state.at, position: state.world.position, heading: state.world.heading });
              }
              await sleep(30);
            }
          } finally {
            for (const key of activeKeys) await up(key);
            const released = await read();
            Object.assign(input, {
              endedWallclockMs: Date.now(), endedPagePerformanceMs: released.at,
              positionAfter: released.world.position,
            });
          }
          const stopped = await settle();
          approach.stoppedPosition = stopped.world.position;
          approach.deviation = distance(stopped.world.position, target);
          if (approach.deviation <= lane.arrivalTolerance) break;
        }
        const arrived = await read();
        waypoint.actualPosition = arrived.world.position;
        waypoint.deviation = distance(arrived.world.position, target);
        assert(waypoint.deviation <= lane.arrivalTolerance, `${id} waypoint ${index} must arrive within ${lane.arrivalTolerance} m; actual ${waypoint.deviation}`);
        assert.equal(arrived.world.remainingRoute, 0, 'Waypoint arrival uses only real keyboard and mouse input');
        waypoint.arrival = await mark('waypoint-arrival', {
          lane: id, waypoint: index, target, deviation: waypoint.deviation, actualPosition: waypoint.actualPosition,
        });
      }
      lane.completed = true;
      lane.arrival = await mark('lane-complete', { lane: id, waypointCount: lane.waypoints.length });
      await checkpoint(`tour-${id}-completed`);
    } catch (error) {
      lane.failure = { message: error.stack || String(error), state: await read().catch(() => null) };
      throw error;
    } finally {
      await releaseAll();
      await writeFile(path.join(dir, 'tour.json'), JSON.stringify(tour, null, 2));
    }
  }
  async function visit(id, { greeting = false, extra = false, viaLane = null } = {}) {
    assert(elapsed() < 105, 'The optional tour must remain bounded');
    currentStep = `final-tour-${id}${extra ? '-extra' : ''}`;
    const place = places[id], station = { id, name: place.name, extra };
    station.departure = await mark('departure', { destination: id });
    if (viaLane) {
      station.routeLabel = viaLane; station.running = false;
      await walkLane(viaLane);
      assert(distance((await read()).world.position, place) < 3.1, `${viaLane} reaches the greeting area`);
    } else {
      await page.locator('#map').click(); await page.locator('#map-destination').selectOption(id);
      station.routeLabel = await page.locator('#map-distance').innerText();
      await page.locator('#map-go').click();
      station.running = elapsed() > 43;
      try {
        if (station.running) await down('Shift');
        await until(s => s.world.remainingRoute === 0 && s.world.moveSpeed < .03 &&
          Math.hypot(s.world.position.x - place.x, s.world.position.z - place.z) < 3.1,
        `tour arrival at ${id}`, 45000);
      } finally { await releaseAll(); }
    }
    station.arrival = await mark('arrival', { destination: id, name: place.name, running: station.running });
    tour.stations.push(station); if (extra) tour.extraRoutes.push(id);
    await look(id === 'granny' || id === 'dock' ? -65 : 65);
    await checkpoint(`tour-${id}${extra ? '-extra' : ''}-close-view`);
    if (greeting) {
      await page.keyboard.press('e');
      const opened = await until(s => s.modal === 'story', `${id} tour greeting`);
      assert(opened.ui.inWorldDialogue && opened.world.conversation, 'Tour greetings stay in the live 3D world');
      const text = await page.locator('#dialogue-text').innerText();
      station.dialogue = await mark('3d-greeting', { destination: id, text });
      await checkpoint(`tour-${id}-3d-greeting`);
      // This brief pause lets the viewer read an actual greeting, rather than
      // extending the tour with an idle scene. Escape earns no quest progress.
      await sleep(950);
      const stable = await read();
      const subtitleBounds = await page.locator('.dialogue-box').boundingBox();
      station.dialogueStable = await mark('3d-greeting-stable', {
        destination: id, playerFrame: stable.world.playerFrame,
        conversation: stable.world.conversation, subtitleBounds,
        projectionScope: 'Read-only diagnostic head and feet markers; mesh bounds remain covered by story QA.',
      });
      await checkpoint(`tour-${id}-3d-greeting-stable`);
      await page.keyboard.press('Escape');
      await until(s => s.modal === null, 'tour greeting closes');
      station.dialogueClosed = await mark('greeting-closed', { destination: id });
    }
    station.finished = await mark('station-finished', { destination: id });
    await writeFile(path.join(dir, 'tour.json'), JSON.stringify(tour, null, 2));
  }
  async function openLaneJump() {
    currentStep = 'final-tour-open-lane-run-jump';
    await focusWorld(); await settle();
    // This real route ends on the flat public riverfront. Select and verify a
    // 7m corridor with lateral clearance through the read-only canWalk API.
    let world = (await read()).world;
    const corridorIsSafe = async heading => page.evaluate(({ p, heading }) => {
      for (let i = 1; i <= 56; i++) for (const side of [-.25, 0, .25]) {
        const d = i / 8;
        if (!window.__JIANGCHENG__.canWalk(p.x + Math.sin(heading) * d + Math.cos(heading) * side,
          p.z - Math.cos(heading) * d + Math.sin(heading) * side)) return false;
      }
      return true;
    }, { p: world.position, heading });
    const candidates = [-Math.PI / 2, 0, Math.PI / 2, Math.PI, world.heading];
    let chosen;
    for (const heading of candidates) if (await corridorIsSafe(heading)) { chosen = heading; break; }
    assert(chosen !== undefined, 'A real walkable public corridor is required for the tour run-jump');
    for (let i = 0; i < 7; i++) {
      const delta = angle((await read()).world.heading, chosen);
      if (Math.abs(delta) < .04) break;
      await look(Math.max(-300, Math.min(300, delta / .0024)));
    }
    world = (await read()).world;
    assert(await corridorIsSafe(world.heading), 'The actual camera-relative run direction has a verified clear corridor');
    const before = world.playerMotion, origin = world.position;
    await mark('run-jump-lane-verified', { heading: world.heading, length: 7, lateralClearance: .25 });
    try {
      await down('Shift'); await down('w');
      await until(s => s.world.moveSpeed > 4.5, 'tour run-up');
      await page.keyboard.press('Space', { delay: 25 });
      await until(s => !s.world.playerMotion.grounded && s.world.playerMotion.heightAboveGround > .05, 'tour jump takeoff');
      await mark('run-jump-airborne');
      await checkpoint('tour-run-jump-airborne');
      await until(s => s.world.playerMotion.grounded && s.world.playerMotion.landingCount > before.landingCount, 'tour jump landing');
    } finally { await releaseAll(); }
    const landed = (await settle()).world;
    assert(landed.playerMotion.jumpCount === before.jumpCount + 1, 'The tour run-jump lands after one press');
    assert(distance(origin, landed.position) > 1, 'The tour jump includes real running movement');
    tour.runJump = await mark('run-jump-landed', { travelled: distance(origin, landed.position), jumpCount: landed.playerMotion.jumpCount });
    await checkpoint('tour-run-jump-landed');
  }
  try {
    await mark('start', { route: ['shop', 'granny', 'chef', 'dock'] });
    await visit('shop');
    await visit('granny', { greeting: true, viaLane: newLanes ? 'toolLane' : null });
    await visit('chef', { viaLane: newLanes ? 'breakfastLane' : null });
    await visit('dock', { greeting: true });
    await openLaneJump();
    // If the mandatory route was quick, walk to another real destination.
    // Never repeat footage or pad the requested duration with a static wait.
    for (let i = 0; elapsed() < 60 && i < 3; i++) {
      await visit(i % 2 === 0 ? 'community' : 'dock', { extra: true });
    }
    const state = await page.evaluate(() => window.__JIANGCHENG__.getState());
    check(state.flags.length === 0, 'The final route tour leaves the story uncompleted');
    check(['shop', 'granny', 'chef', 'dock'].every(id => tour.stations.some(s => s.id === id)),
      'The final route visits repair shop, granny, breakfast stall and ferry dock in order');
    if (newLanes) check(['toolLane', 'breakfastLane'].every(id => tour.lanes.some(l => l.id === id && l.completed)),
      'Both new lanes were walked through real keyboard and mouse input');
    tour.completed = true;
  } finally {
    await releaseAll();
    const ended = await mark('end');
    tour.finishedAt = ended.wallclock; tour.endWallclockMs = ended.wallclockMs;
    tour.endPagePerformanceMs = ended.pagePerformanceMs;
    tour.actualSeconds = (tour.endWallclockMs - tour.startWallclockMs) / 1000;
    tour.pagePerformanceSeconds = (tour.endPagePerformanceMs - tour.startPagePerformanceMs) / 1000;
    tour.withinTarget = tour.actualSeconds >= 60 && tour.actualSeconds <= 90;
    if (!tour.withinTarget) tour.timingNote = 'Actual duration falls outside the 60–90s target; retain the real timing and report it without retiming the footage.';
    await writeFile(path.join(dir, 'tour.json'), JSON.stringify(tour, null, 2));
  }
}

try {
  const asset = process.env.EXPECTED_BUILD_ASSET;
  assert(asset, 'EXPECTED_BUILD_ASSET is required; do not run against an unpinned preview build');
  assert(/(?:^|\/)assets\/[^/?]+\.js$/.test(asset) || /^index-[^/?]+\.js$/.test(asset),
    'EXPECTED_BUILD_ASSET must identify one built JavaScript asset URL or basename');
  expectedURL = new URL(asset.startsWith('index-') ? `/assets/${asset}` : asset, base).href;
  report.expectedBuildURL = expectedURL;
  browser = await chromium.launch({ headless: process.env.HEADLESS !== '0', channel: 'chrome', handleSIGINT: false, handleSIGTERM: false });
  report.browser = { version: browser.version(), channel: 'chrome', headless: process.env.HEADLESS !== '0' };
  browser.on('disconnected', () => { if (report.status === 'running') recordError('browser-disconnected', 'Browser closed during the run'); });
  context = await browser.newContext({ viewport, deviceScaleFactor: 1, recordVideo: { dir: path.join(dir, 'video'), size: viewport } });
  report.videoPageCreatedWallclockMs = Date.now();
  page = await context.newPage(); video = page.video();
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => recordError('pageerror', error));
  page.on('crash', () => recordError('crash', 'Page crashed'));
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') recordError(`console-${message.type()}`, message.text(), { location: message.location() });
  });
  page.on('requestfailed', request => recordError('requestfailed', request.failure()?.errorText, { url: request.url() }));
  page.on('response', response => {
    if (response.status() >= 400) recordError('http', `HTTP ${response.status()}`, { url: response.url() });
    if (response.request().resourceType() === 'script') report.requests.push({ url: response.url(), status: response.status() });
    if (response.url() === expectedURL) responseJobs.push(response.body().then(body => {
      loadedScriptHash = createHash('sha256').update(body).digest('hex');
    }).catch(error => recordError('build-body', error)));
  });
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
  report.pageURL = page.url();
  report.browser.environment = await page.evaluate(() => ({
    userAgent: navigator.userAgent, platform: navigator.platform,
    language: navigator.language, devicePixelRatio, viewport: [innerWidth, innerHeight],
  }));
  const scripts = await page.locator('script[src]').evaluateAll(elements => elements.map(el => el.src));
  report.actualScriptURLs = scripts;
  check(scripts.includes(expectedURL), 'The loaded script URL exactly matches the pinned build', { expectedURL, scripts });
  await page.waitForFunction(() => Boolean(window.__JIANGCHENG__), undefined, { timeout: 60000 });
  await page.locator('#boot').waitFor({ state: 'hidden', timeout: 60000 });
  report.browser.environment.graphics = await page.evaluate(() => {
    try {
      const gl = document.querySelector('#world')?.getContext('webgl2');
      const info = gl?.getExtension('WEBGL_debug_renderer_info');
      return info ? {
        renderer: gl.getParameter(info.UNMASKED_RENDERER_WEBGL),
        vendor: gl.getParameter(info.UNMASKED_VENDOR_WEBGL),
      } : { renderer: 'unavailable', vendor: 'unavailable' };
    } catch {
      return { renderer: 'unavailable', vendor: 'unavailable' };
    }
  });
  report.initialState = await page.evaluate(() => window.__JIANGCHENG__.getState());
  check(report.initialState.flags.length === 0, 'A fresh browser context begins without injected story progress');
  sampling = true;
  sampler = (async () => {
    while (sampling) {
      try { await sample(); } catch (error) { if (sampling) recordError('sampler', error); break; }
      await sleep(50);
    }
  })();

  await step('01-enter-and-mouse-look', async () => {
    await page.locator('#start').click(); await focusWorld(); await settle();
    check((await read()).world.cameraMode === 'street', 'The real start button enters third-person exploration');
    const before = (await read()).world.heading;
    await alignNorth();
    check(Math.abs(angle(before, (await read()).world.heading)) > .15, 'Mouse dragging changes the viewing direction');
  });
  for (const [key, meters] of [['w', 1.3], ['d', .8], ['s', 1.3], ['a', .8]]) {
    await step(`02-walk-${key}`, () => move(key, false, meters));
  }
  await step('03-shift-run', () => move('w', true, 2));
  await step('04-standing-jump', async () => {
    const index = samples.length, jump = await beginJump();
    await checkpoint('standing-jump-airborne'); await land(jump);
    const after = (await read()).world;
    check(distance(jump.before.position, after.position) < .03, 'A standing jump does not drift sideways');
    checkJumpFrames(index, jump.before.playerMotion.jumpCount + 1);
  });
  await step('05-held-space-repeat', async () => {
    await focusWorld(); const before = (await settle()).world;
    try {
      await down('Space');
      await until(s => s.world.playerMotion.jumpCount > before.playerMotion.jumpCount, 'held Space takeoff');
      // A second keyboard.down while held generates a real repeat=true keydown.
      for (let i = 0; i < 15; i++) { await sleep(90); await down('Space'); }
      await until(s => s.world.playerMotion.grounded, 'landing while Space remains held');
      for (let i = 0; i < 5; i++) { await down('Space'); await sleep(90); }
      const after = (await read()).world;
      check(after.playerMotion.grounded && after.playerMotion.jumpCount === before.playerMotion.jumpCount + 1,
        'Holding Space and sending repeated keydown events does not auto-jump after landing');
    } finally { await up('Space'); }
  });
  await step('06-running-jump', async () => {
    await focusWorld(); const before = (await settle()).world, index = samples.length;
    try {
      await down('Shift'); await down('w');
      await until(s => s.world.moveSpeed > 4.8, 'run-up speed');
      await page.keyboard.press('Space', { delay: 25 });
      const airborne = await until(s => !s.world.playerMotion.grounded && s.world.playerMotion.heightAboveGround > .05, 'running jump takeoff');
      await checkpoint('running-jump-airborne');
      await land({ before, airborne });
      check(distance(before.position, (await read()).world.position) > 1, 'A running jump carries horizontal movement');
      checkJumpFrames(index, before.playerMotion.jumpCount + 1);
    } finally { await releaseAll(); }
    await settle();
  });
  for (const control of ['settings', 'map']) await step(`07-airborne-${control}`, async () => {
    const jump = await beginJump();
    await clickNow(`#${control}`);
    const opened = await until(s => s.modal === 'panel', `${control} opens`);
    check(!opened.world.playerMotion.grounded, `${control} really opens while the player is airborne`);
    check(opened.world.blocked === true && opened.world.suspended === false,
      `${control} blocks input while vertical motion remains active`);
    await checkpoint(`${control}-open-airborne`); await land(jump);
    await page.locator('.panel-head h2').click();
    const before = (await read()).world.playerMotion.jumpCount;
    await page.keyboard.press('Space'); await sleep(350);
    const after = await read();
    check(after.modal === 'panel' && after.world.playerMotion.jumpCount === before && after.world.playerMotion.grounded,
      `${control} blocks a new jump while an existing jump may land`);
    await page.locator('.close').click(); await focusWorld();
  });
  await step('08-home-film-freeze-and-resume', async () => {
    const jump = await beginJump(); await clickNow('#brand');
    const frozen = await until(s => s.ui.welcomeVisible, 'welcome screen opens');
    check(!frozen.world.playerMotion.grounded, 'Returning home freezes a jump that was still airborne');
    check(frozen.world.active === false, 'The welcome screen marks the world inactive');
    await sleep(800); const paused = await read();
    check(Math.abs(paused.world.position.y - frozen.world.position.y) < 1e-8 &&
      paused.world.playerMotion.verticalVelocity === frozen.world.playerMotion.verticalVelocity,
    'The inactive welcome screen freezes height and vertical velocity');
    await page.locator('#intro-film').click();
    const film = await until(s => s.modal === 'film', 'welcome film opens');
    check(film.world.suspended, 'The real film modal suspends the world');
    // Captions intentionally have pointer-events:none. Focus the visible
    // video itself; a real Space may toggle playback but cannot jump.
    await clickNow('#cinematic'); await page.keyboard.press('Space'); await sleep(400);
    check((await read()).world.playerMotion.jumpCount === jump.before.playerMotion.jumpCount + 1,
      'A jump request during the suspended film cannot create another jump');
    await page.locator('#film-close').click(); await page.locator('#start').click();
    await land(jump); await sleep(500);
    check((await read()).world.playerMotion.jumpCount === jump.before.playerMotion.jumpCount + 1,
      'Resume completes the original jump without a ghost jump');
  });
  await step('09-airborne-v-to-first-person', async () => {
    const jump = await beginJump();
    // V cycles street -> overview -> first; both are genuine keyboard inputs.
    for (let i = 0; i < 2 && (await read()).world.cameraMode !== 'first'; i++) await page.keyboard.press('v');
    const switched = await read();
    check(switched.world.cameraMode === 'first' && !switched.world.playerMotion.grounded &&
      switched.world.playerMotion.heightAboveGround > .03 &&
      switched.world.playerMotion.jumpCount === jump.before.playerMotion.jumpCount + 1,
    'V reaches first-person in midair without resetting the physical jump');
    check(Math.abs(switched.world.camera[1] - switched.world.position.y - switched.world.eyeHeight) < .01 &&
      Math.abs(switched.world.cameraRotation.z) < 1e-8,
      'First-person airborne eyes track the body without camera roll', {
        eyeOffset: switched.world.camera[1] - switched.world.position.y,
        rotation: switched.world.cameraRotation,
      });
    await checkpoint('first-person-airborne'); await land(jump);
    await page.locator('#first-person').click(); await focusWorld();
  });
  await step('10-ui-route-to-chef', async () => {
    await page.locator('#map').click(); await page.locator('#map-destination').selectOption('chef');
    await page.locator('#map-go').click();
    await until(s => s.world.remainingRoute === 0 && s.world.moveSpeed < .03 &&
      Math.hypot(s.world.position.x - 10, s.world.position.z - 12) < 3.1, 'UI route reaches Cai auntie', 65000);
    check(true, 'The map and its walk button reach the resident through actual navigation');
  });
  await step('11-airborne-e-and-final-space', async () => {
    const jump = await beginJump(); await page.keyboard.press('e');
    const queued = await read();
    check(queued.modal === null && !queued.world.playerMotion.grounded, 'E in midair waits instead of opening a floating dialogue');
    const opened = await until(s => s.modal === 'story', 'queued interaction opens after landing');
    check(opened.world.playerMotion.grounded && opened.ui.inWorldDialogue && Boolean(opened.world.conversation),
      'The queued interaction opens a live 3D dialogue after landing');
    await checkpoint('landed-live-3d-greeting');
    const progress = (await page.locator('#story-progress').innerText()).match(/(\d+)\s*\/\s*(\d+)/);
    check(progress && Number(progress[1]) === 1 && Number(progress[2]) === 1,
      'The bounded pre-quest greeting has one final line');
    const count = (await read()).world.playerMotion.jumpCount;
    // Leave the auto-focused exit button so Space exercises the dialogue
    // keydown handler and its defaultPrevented handoff to world input.
    await page.locator('#dialogue-text').click();
    await page.keyboard.press('Space'); await until(s => s.modal === null, 'final Space closes greeting');
    await sleep(450); const after = await read();
    check(after.world.playerMotion.grounded && after.world.playerMotion.jumpCount === count &&
      after.world.playerMotion.bufferedTime === 0,
    'Space on the final dialogue line closes it without leaking into a new jump');
  });
  currentStep = 'final-verification';
  report.finalState = await page.evaluate(() => window.__JIANGCHENG__.getState());
  check(report.finalState.flags.length === 0, 'The traversal run did not complete story quests');
  const finalScripts = await page.locator('script[src]').evaluateAll(elements => elements.map(el => el.src));
  check(finalScripts.includes(expectedURL), 'The same pinned build remains loaded at the end');
  await Promise.all(responseJobs);
  check(Boolean(loadedScriptHash), 'The actual loaded build response has a recorded SHA-256');
  report.loadedScriptSHA256 = loadedScriptHash;
  const runtimeErrors = report.errors.filter(e => ['pageerror', 'crash', 'console-error', 'browser-disconnected', 'sampler'].includes(e.kind));
  check(runtimeErrors.length === 0, 'No initial or later JavaScript, WebGL, crash or sampling errors', runtimeErrors);
  report.functionalResult = {
    completedAt: new Date().toISOString(), total: report.checks.length,
    passed: report.checks.filter(c => c.passed).length,
  };
  if (process.env.QA_WALL_TURN === '1') await step('12-wall-turn-probe', wallTurnProbe);
  if (stage === 'final' || process.env.QA_TOUR === '1' || newLanes) {
    await step('12-final-route-tour', finalRouteTour);
    report.finalState = await page.evaluate(() => window.__JIANGCHENG__.getState());
  }
  await checkpoint('final'); report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = error.stack; recordError('test-failure', error);
  console.error(error); process.exitCode = 1;
  if (page && !page.isClosed()) await checkpoint('fatal-failure').catch(error => recordError('failure-capture', error));
} finally {
  sampling = false;
  await releaseAll().catch(error => recordError('release-all', error));
  await sampler;
  await Promise.allSettled(responseJobs);
  // Closing the one context flushes the entire recording, including failures.
  if (context) await context.close().catch(error => recordError('context-close', error));
  if (video) {
    try {
      const source = await video.path(), destination = path.join(dir, 'traversal.webm');
      await rename(source, destination); report.video = destination;
    } catch (error) { recordError('video-finalise', error); report.status = 'failed'; process.exitCode = 1; }
  }
  if (browser) await browser.close().catch(error => recordError('browser-close', error));
  const lateRuntimeErrors = report.errors.filter(e => ['pageerror', 'crash', 'console-error', 'sampler'].includes(e.kind));
  if (lateRuntimeErrors.length && report.status === 'passed') {
    report.status = 'failed'; report.failure = 'Runtime errors were recorded before cleanup completed'; process.exitCode = 1;
  }
  report.finished = new Date().toISOString(); report.sampleCount = samples.length;
  report.loadedScriptSHA256 ||= loadedScriptHash;
  await new Promise(resolve => trace.end(resolve));
  await writeFile(path.join(dir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`Traversal ${stage} report: ${path.join(dir, 'report.json')}`);
  if (report.video) console.log(`Full-session video: ${report.video}`);
}
