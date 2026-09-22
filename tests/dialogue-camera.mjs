import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { POIS, SAVE_KEY } from '../src/story.js';

// Run only after the camera/visibility changes have been built and served:
// GAME_URL=http://127.0.0.1:4173 node tests/dialogue-camera.mjs
// CASE_FILTER='desktop-community-east|.*chef.*' selects case IDs by regex.
// This is a synthetic camera regression suite, NOT another earned playthrough.
// completed-save.json is read-only; every case gets a new, isolated context.
// There is only one browser and one live page at any time. Low-quality rendering
// keeps this interaction test from competing with a separate visual QA session.
const BASE = process.env.GAME_URL || 'http://127.0.0.1:4173';
const OUTPUT = fileURLToPath(new URL('../output/qa/', import.meta.url));
const SOURCE_SAVE = path.join(OUTPUT, 'completed-save.json');
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, isMobile: false },
  { name: 'mobile', width: 390, height: 844, isMobile: true },
];
const RESIDENTS = ['granny', 'chef', 'dock', 'community'];
const DIRECTIONS = [
  { name: 'east', dx: 2, dz: 0, rotateBefore: false },
  { name: 'west', dx: -2, dz: 0, rotateBefore: true },
];
const POSITION_EPSILON = 1e-6;
const RESTORE_TOLERANCE = .20;
const POLL_MS = 120;
const SETTLE_TIMEOUT = 12000;
const CASE_FILTER = process.env.CASE_FILTER || '';
const CHECK_RESIZE = process.env.CHECK_RESIZE === '1';
const VISUAL_ONLY = process.env.VISUAL_ONLY === '1';
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-');
let stopRequested = false, activeContext = null;

const distance3 = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const distance2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clone = value => structuredClone(value);
const report = {
  suite: 'dialogue-camera',
  runId: RUN_ID,
  runLabel: process.env.RUN_LABEL || 'camera regression',
  caseFilter: CASE_FILTER || null,
  resizeDuringDialogue: CHECK_RESIZE,
  mode: VISUAL_ONLY ? 'visual-only: opening camera, actor projections and screenshots; keyboard, drag, reopen and restoration checks skipped' : 'full interaction regression',
  started: new Date().toISOString(),
  gameUrl: BASE,
  fixtureNotice: 'TEST FIXTURES: branched from a real completed save, with synthetic nearby positions and phase flags. These cases do not represent an earned playthrough.',
  sourceSave: 'output/qa/completed-save.json (read-only)',
  rendering: { quality: 'low', reduced: false, sound: false, contextsInParallel: 1 },
  coverageLimits: 'Actor diagnostics test screen projection and visible state. Screenshots are supplied for actual mesh occlusion review; a projection alone does not prove line of sight.',
  cases: [],
};

async function writeReport() {
  const body = JSON.stringify(report, null, 2);
  const latest = path.join(OUTPUT, 'dialogue-camera-report.json');
  await writeFile(latest + '.tmp', body); await rename(latest + '.tmp', latest);
  await writeFile(path.join(OUTPUT, `dialogue-camera-report-${RUN_ID}.json`), body);
}

function requestStop(signal) {
  if (stopRequested) return;
  stopRequested = true;
  report.interrupted = { signal, at: new Date().toISOString() };
  console.log(`Stopping ${signal}: preserve completed cases and close the current isolated context.`);
  if (activeContext) void activeContext.close().catch(() => {});
}

function testFixture(template, residentId, direction, rainy, name) {
  const poi = POIS.find(p => p.id === residentId);
  assert.ok(poi, `Unknown resident ${residentId}`);
  const fixture = clone(template);
  fixture.started = true;
  fixture.position = { x: poi.x + direction.dx, z: poi.z + direction.dz };
  fixture.flags = template.flags.filter(flag => flag !== 'ending' && (rainy || flag !== 'checked'));
  // Every normal case enters an existing one-line follow-up. Community's
  // "all neighbours helped" branch would otherwise open a longer task scene.
  if (!rainy && residentId === 'community') fixture.flags = fixture.flags.filter(flag => flag !== 'granny');
  if (rainy && !fixture.flags.includes('checked')) fixture.flags.push('checked');
  fixture.supplies = ['box', 'water', 'battery'];
  fixture.seconds = 0;
  fixture.settings = { ...fixture.settings, sound: false, reduced: false, quality: 'low' };
  fixture.testFixture = {
    synthetic: true,
    suite: 'dialogue-camera',
    case: name,
    purpose: rainy ? 'Hidden-resident interaction regression' : 'Short live-conversation camera regression',
    source: 'completed-save.json',
  };
  return fixture;
}

async function diagnostics(page) {
  return page.evaluate(() => window.__JIANGCHENG__.getWorld());
}

function validateDiagnostics(world) {
  assert.ok(Array.isArray(world.camera) && world.camera.length === 3, 'getWorld.camera must be a 3-vector');
  assert.ok(Array.isArray(world.cameraTarget) && world.cameraTarget.length === 3, 'getWorld.cameraTarget must be a 3-vector');
  assert.equal(typeof world.cameraRestoring, 'boolean', 'getWorld must expose cameraRestoring before running this suite');
  assert.ok([...world.camera, ...world.cameraTarget].every(Number.isFinite), 'Camera and target must be finite');
}

async function settle(page, { conversation, restoreComplete = false } = {}) {
  let previous = null, stable = 0, last = null;
  const deadline = Date.now() + SETTLE_TIMEOUT;
  while (Date.now() < deadline) {
    last = await diagnostics(page);
    validateDiagnostics(last);
    const expectedState = (conversation === undefined || Boolean(last.conversation) === conversation)
      && (!restoreComplete || last.cameraRestoring === false);
    if (expectedState && previous && distance3(last.camera, previous.camera) < .012
      && distance3(last.cameraTarget, previous.cameraTarget) < .012) stable++;
    else stable = 0;
    if (stable >= 3) return last;
    previous = last;
    await page.waitForTimeout(POLL_MS);
  }
  throw new Error(`Camera did not settle: ${JSON.stringify({ conversation, restoreComplete, last })}`);
}

async function capture(page, entry, suffix) {
  const name = `dialogue-camera-${RUN_ID}-${entry.id}-${suffix}.png`;
  await page.screenshot({ path: path.join(OUTPUT, name) });
  entry.screenshots.push(name);
}

async function assertFrame(page, residentId, label, expectedActorIds = ['player', residentId], { minHeadSeparation = 0 } = {}) {
  const world = await diagnostics(page), view = page.viewportSize();
  const panel = await page.locator('.dialogue-box').boundingBox();
  assert.ok(panel, `${label}: dialogue box is visible`);
  assert.equal(world.suspended, false, `${label}: live conversation must keep rendering`);
  assert.equal(world.conversation?.placeId, residentId, `${label}: correct resident is framed`);
  assert.deepEqual(world.conversation.actors.map(actor => actor.id).sort(), [...expectedActorIds].sort(), `${label}: expected visible actors are present`);
  for (const actor of world.conversation.actors) {
    assert.equal(actor.visible, true, `${label}: ${actor.id} must not be hidden`);
    for (const part of ['head', 'feet']) {
      const projected = actor[part];
      assert.ok(projected?.visible, `${label}: ${actor.id} ${part} is in the camera frustum`);
      assert.ok(Number.isFinite(projected.x) && Number.isFinite(projected.y), `${label}: finite ${actor.id} ${part} projection`);
      assert.ok(projected.x >= 6 && projected.x <= view.width - 6, `${label}: ${actor.id} ${part} x=${projected.x} is inside viewport`);
      assert.ok(projected.y >= 4 && projected.y <= view.height - 4, `${label}: ${actor.id} ${part} y=${projected.y} is inside viewport`);
    }
    assert.ok(actor.head.y < actor.feet.y, `${label}: ${actor.id} has an upright projected silhouette`);
    assert.ok(actor.feet.y <= panel.y - 8, `${label}: ${actor.id} feet y=${actor.feet.y} must clear dialogue top y=${panel.y}`);
  }
  const headSeparationPx = world.conversation.actors.length === 2
    ? Math.abs(world.conversation.actors[0].head.x - world.conversation.actors[1].head.x) : null;
  if (minHeadSeparation > 0) {
    assert.ok(headSeparationPx >= minHeadSeparation,
      `${label}: automatic mobile framing must separate the two heads by at least ${minHeadSeparation}px; got ${headSeparationPx}px`);
  }
  return { camera: world.camera, target: world.cameraTarget, actors: world.conversation.actors, headSeparationPx, panel };
}

async function dragCanvas(page, { beforeConversation = false } = {}) {
  const viewport = page.viewportSize();
  const panel = beforeConversation ? null : await page.locator('.dialogue-box').boundingBox();
  // Stay away from headings, action buttons, the dialogue panel and touch pad.
  const x = viewport.width * .48;
  const y = beforeConversation ? viewport.height * .43 : Math.min(viewport.height * .43, panel.y - 90);
  assert.ok(y > 150, 'There is enough exposed canvas to drag the conversation view');
  const dx = beforeConversation ? Math.min(310, viewport.width * .32) : Math.min(110, viewport.width * .17);
  await page.mouse.move(x, y);
  await page.mouse.down();
  try { await page.mouse.move(x + dx, y, { steps: 12 }); }
  finally { await page.mouse.up(); }
}

async function boot(page, fixture, residentId, direction, entry) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__JIANGCHENG__), undefined, { timeout: 60000 });
  await page.locator('#boot').waitFor({ state: 'hidden', timeout: 60000 });
  const requestedPosition = clone(fixture.position);
  const requestedWalkable = await page.evaluate(p => window.__JIANGCHENG__.canWalk(p.x, p.z), requestedPosition);
  entry.fixtureCollision = { requestedPosition, requestedWalkable };
  if (!requestedWalkable && direction.name === 'east') {
    const poi = POIS.find(p => p.id === residentId);
    const southeast = { x: poi.x + 2, z: poi.z + 2 };
    assert.equal(await page.evaluate(p => window.__JIANGCHENG__.canWalk(p.x, p.z), southeast), true, 'Explicit southeast fixture must be genuinely walkable');
    fixture.position = southeast;
    fixture.testFixture.positionAdjustment = {
      from: requestedPosition, to: southeast,
      reason: 'Requested east spot intersects actual furniture collision; explicitly use the authorised southeast standing position.',
    };
    entry.fixtureCollision.usedPosition = southeast;
    entry.direction = 'southeast (requested east position is blocked)';
    // Replace only this isolated test save and let normal app loading position
    // the player. Never override canWalk or call a private teleport function.
    // The departing app saves on pagehide. Transport the replacement separately
    // so the next init script applies it AFTER that save, before app startup.
    await page.evaluate(data => sessionStorage.setItem('dialogue-camera-next-fixture', JSON.stringify(data)), fixture);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__JIANGCHENG__), undefined, { timeout: 60000 });
    await page.locator('#boot').waitFor({ state: 'hidden', timeout: 60000 });
  } else assert.equal(requestedWalkable, true, 'Requested fixture position is genuinely walkable');
  await page.locator('#start').click();
  await page.waitForFunction(id => window.__JIANGCHENG__.getNearest() === id, residentId, { timeout: 12000 });
  const state = await page.evaluate(() => window.__JIANGCHENG__.getState());
  assert.equal(state.testFixture?.synthetic, true, 'The isolated page loaded an explicitly marked test save');
  assert.ok(distance2((await diagnostics(page)).position, fixture.position) <= POSITION_EPSILON, 'Fixture position was not replaced by the spawn fallback');
  assert.equal(await page.evaluate(position => window.__JIANGCHENG__.canWalk(position.x, position.z), fixture.position), true, 'Fixture position is navigable');
}

async function openConversation(page, residentId) {
  await page.locator('#interact').waitFor({ state: 'visible', timeout: 12000 });
  await page.locator('#interact').click();
  await page.locator('.story.in-world').waitFor({ state: 'visible', timeout: 12000 });
  assert.equal(await page.evaluate(() => window.__JIANGCHENG__.getModal()), 'story');
  assert.equal(await page.locator('#story-progress').innerText(), '01 / 01', 'Fixture uses a short follow-up rather than a long task conversation');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'story-next', 'Initial keyboard focus must not land on Temporarily leave');
  const world = await settle(page, { conversation: true });
  assert.equal(world.conversation.placeId, residentId);
  return world;
}

async function escapeAndRestore(page, baseline, label) {
  await page.keyboard.press('Escape');
  await page.locator('#overlay').waitFor({ state: 'hidden', timeout: 12000 });
  assert.equal(await page.evaluate(() => window.__JIANGCHENG__.getModal()), null, `${label}: Esc closes the dialogue`);
  const restored = await settle(page, { conversation: false, restoreComplete: true });
  assert.equal(restored.conversation, null, `${label}: conversation state is released`);
  assert.ok(distance3(restored.camera, baseline.camera) < RESTORE_TOLERANCE, `${label}: camera returns to exploration position`);
  assert.ok(distance3(restored.cameraTarget, baseline.cameraTarget) < RESTORE_TOLERANCE, `${label}: camera target returns to exploration target`);
  assert.ok(distance2(restored.position, baseline.position) <= POSITION_EPSILON, `${label}: player remains at the interaction spot`);
  assert.ok(await page.locator('#map').isVisible(), `${label}: exploration UI returns`);
  return restored;
}

async function normalChecks(page, entry, residentId, direction) {
  // A projection can be inside the viewport while the nearer character still
  // hides the other. Require an observable horizontal gap in automatic mobile
  // framing; manual drags remain free to choose a more frontal angle.
  const automaticFrameOptions = { minHeadSeparation: page.viewportSize().width <= 600 ? 48 : 0 };
  await settle(page, { conversation: false, restoreComplete: true });
  if (direction.rotateBefore) {
    await dragCanvas(page, { beforeConversation: true });
    await settle(page, { conversation: false, restoreComplete: true });
  }
  const baseline = await diagnostics(page);
  entry.baseline = { camera: baseline.camera, target: baseline.cameraTarget, position: baseline.position };
  const first = await openConversation(page, residentId);
  entry.frames.open = await assertFrame(page, residentId, 'Initial frame', undefined, automaticFrameOptions);
  await capture(page, entry, 'open');
  entry.checks.push('Correct short conversation and both actors fit above the dialogue panel');
  if (VISUAL_ONLY) {
    entry.checks.push('VISUAL-ONLY RUN: opening frame captured; actual mesh visibility requires manual screenshot review');
    return;
  }

  await page.keyboard.down('w');
  try { await page.waitForTimeout(350); }
  finally { await page.keyboard.up('w'); }
  const during = await diagnostics(page);
  assert.ok(distance2(during.position, first.position) <= POSITION_EPSILON, 'W must not move the player while talking');
  assert.ok(during.renderFrame > first.renderFrame, 'The 3D world must remain live during the conversation');
  entry.checks.push('W is blocked while the world continues rendering');

  await dragCanvas(page);
  const dragged = await settle(page, { conversation: true });
  assert.equal(dragged.conversation.manual, true, 'Mouse drag enables manual conversation framing');
  assert.ok(distance3(dragged.camera, first.camera) > .05, 'Mouse drag actually changes the camera');
  assert.ok(distance2(dragged.position, first.position) <= POSITION_EPSILON, 'Dragging does not move the player');
  entry.frames.dragged = await assertFrame(page, residentId, 'Dragged frame');
  await capture(page, entry, 'dragged');
  entry.checks.push('Mouse drag rotates the camera while preserving actor framing');

  const restored = await escapeAndRestore(page, baseline, 'First exit');
  entry.restored = { camera: restored.camera, target: restored.cameraTarget, cameraRestoring: restored.cameraRestoring };
  entry.checks.push('Esc completes restoration to the original exploration camera');

  const reopened = await openConversation(page, residentId);
  entry.frames.reopened = await assertFrame(page, residentId, 'Reopened frame', undefined, automaticFrameOptions);
  assert.equal(reopened.conversation.manual, false, 'Reopening resets the manual-camera flag');
  assert.ok(distance3(reopened.camera, first.camera) < .20, 'Reopening chooses a stable conversation camera');
  assert.ok(distance3(reopened.cameraTarget, first.cameraTarget) < .10, 'Reopening keeps a stable focus target');
  if (CHECK_RESIZE && page.viewportSize().width > 600) {
    const originalViewport = page.viewportSize();
    await page.setViewportSize({ width: 390, height: 844 });
    await settle(page, { conversation: true });
    entry.frames.resizedMobile = await assertFrame(page, residentId, 'Resized mobile frame', undefined, { minHeadSeparation: 48 });
    await capture(page, entry, 'resized-mobile');
    await page.setViewportSize(originalViewport);
    await settle(page, { conversation: true });
    entry.frames.resizedDesktop = await assertFrame(page, residentId, 'Restored desktop viewport');
    entry.checks.push('Desktop dialogue reframes both actors with at least 48px head separation after resizing to mobile');
  }
  await escapeAndRestore(page, baseline, 'Second exit');
  entry.checks.push('Reopening is stable and the second exit also finishes restoring');
}

async function rainChecks(page, entry, residentId) {
  const baseline = await settle(page, { conversation: false, restoreComplete: true });
  await page.waitForFunction(() => window.__JIANGCHENG__.getWorld().residentsOutside === 0, undefined, { timeout: 12000 });
  const state = await page.evaluate(() => window.__JIANGCHENG__.getState());
  assert.ok(state.flags.includes('checked') && !state.flags.includes('ending'), 'Fixture is in the rain/indoor phase');
  assert.equal(await page.evaluate(() => window.__JIANGCHENG__.getNearest()), residentId);
  await page.locator('#interact').waitFor({ state: 'visible', timeout: 12000 });
  await page.locator('#interact').click();
  await page.locator('.story.in-world').waitFor({ state: 'visible', timeout: 12000 });
  assert.equal(await page.locator('#speaker').innerText(), '阿遥', 'Rain visit is the player’s on-site monologue');
  assert.match(await page.locator('#dialogue-text').innerText(), /街坊们已经按社区安排进了安全的室内/, 'The monologue explains where the residents went');
  const after = await settle(page, { conversation: true });
  assert.equal(after.residentsOutside, 0, 'Rain interaction must not resurrect outdoor residents');
  assert.deepEqual(after.conversation.actors.map(actor => actor.id), ['player'], 'The monologue must not reference an invisible NPC');
  entry.responseModal = await page.evaluate(() => window.__JIANGCHENG__.getModal());
  entry.frames.rain = await assertFrame(page, residentId, 'Rain monologue', ['player']);
  await capture(page, entry, 'rain-visit');
  await escapeAndRestore(page, baseline, 'Rain monologue exit');
  entry.checks.push('Checked-but-not-ending phase keeps residents indoors; only the visible player explains their whereabouts');
}

async function runCase(browser, template, viewport, residentId, direction, rainy = false) {
  const id = `${viewport.name}-${residentId}-${rainy ? 'rain' : direction.name}`;
  const fixture = testFixture(template, residentId, direction, rainy, id);
  const entry = { id, viewport, residentId, direction: direction.name, rainy, fixture, checks: [], frames: {}, screenshots: [], pageErrors: [], consoleErrors: [] };
  report.cases.push(entry);
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1, isMobile: viewport.isMobile, hasTouch: viewport.isMobile,
    locale: 'zh-CN', colorScheme: 'light',
  });
  activeContext = context;
  let page;
  try {
    await context.addInitScript(({ key, data, origin }) => {
      if (location.origin !== origin) return;
      const pending = sessionStorage.getItem('dialogue-camera-next-fixture');
      if (pending) {
        localStorage.setItem(key, pending);
        sessionStorage.removeItem('dialogue-camera-next-fixture');
      } else if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data));
    }, { key: SAVE_KEY, data: fixture, origin: new URL(BASE).origin });
    page = await context.newPage(); page.setDefaultTimeout(12000);
    page.on('pageerror', error => entry.pageErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') entry.consoleErrors.push(message.text()); });
    await boot(page, fixture, residentId, direction, entry);
    if (rainy) await rainChecks(page, entry, residentId);
    else await normalChecks(page, entry, residentId, direction);
    assert.deepEqual(entry.pageErrors, [], 'No uncaught browser errors');
    assert.deepEqual((await page.evaluate(() => window.__JIANGCHENG__.getState())).flags, fixture.flags, 'Camera checks do not earn or alter story progress');
    entry.status = 'passed'; console.log('PASS', id);
  } catch (error) {
    entry.status = stopRequested ? 'interrupted' : 'failed'; entry.failure = error.stack || String(error);
    console.error('FAIL', id, error.message);
    if (page) {
      try { entry.failureWorld = await diagnostics(page); } catch { /* Boot failures have no diagnostics. */ }
      try { await capture(page, entry, 'failure'); } catch { /* Preserve the original assertion failure. */ }
    }
  } finally {
    await context.close().catch(() => {});
    if (activeContext === context) activeContext = null;
    // An interrupted run still leaves all completed cases readable.
    await writeReport();
  }
}

async function main() {
  await mkdir(OUTPUT, { recursive: true });
  let browser;
  const stopInt = () => requestStop('SIGINT'), stopTerm = () => requestStop('SIGTERM');
  process.on('SIGINT', stopInt); process.on('SIGTERM', stopTerm);
  try {
    // Preserve the unversioned report produced by an earlier suite revision.
    try {
      const old = JSON.parse(await readFile(path.join(OUTPUT, 'dialogue-camera-report.json'), 'utf8'));
      const oldId = old.runId || String(old.started).replace(/[:.]/g, '-');
      await writeFile(path.join(OUTPUT, `dialogue-camera-report-${oldId}.json`), JSON.stringify(old, null, 2));
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const template = JSON.parse(await readFile(SOURCE_SAVE, 'utf8'));
    assert.ok(template.flags?.includes('ending'), 'Source must be the real completed-save snapshot');
    report.sourceFingerprint = {};
    for (const source of ['world.js', 'main.js', 'dialogue-presentation.js', 'architecture.js']) {
      report.sourceFingerprint[source] = createHash('sha256').update(await readFile(new URL(`../src/${source}`, import.meta.url))).digest('hex');
    }
    const match = CASE_FILTER ? new RegExp(CASE_FILTER) : null;
    const selected = [];
    for (const viewport of VIEWPORTS) {
      for (const residentId of RESIDENTS) {
        for (const direction of DIRECTIONS) {
          const id = `${viewport.name}-${residentId}-${direction.name}`;
          if (!match || match.test(id)) selected.push({ viewport, residentId, direction, rainy: false, id });
        }
      }
      for (const residentId of RESIDENTS) {
        const id = `${viewport.name}-${residentId}-rain`;
        if (!match || match.test(id)) selected.push({ viewport, residentId, direction: DIRECTIONS[0], rainy: true, id });
      }
    }
    report.selectedCases = selected.map(c => c.id);
    assert.ok(selected.length, `CASE_FILTER matched no cases: ${CASE_FILTER}`);
    browser = await chromium.launch({ headless: true, channel: 'chrome', handleSIGINT: false, handleSIGTERM: false });
    for (const { viewport, residentId, direction, rainy } of selected) {
      if (stopRequested) break;
      await runCase(browser, template, viewport, residentId, direction, rainy);
    }
  } catch (error) {
    if (!stopRequested) report.failure = error.stack || String(error);
    console.error(error);
  } finally {
    if (browser) await browser.close().catch(() => {});
    process.off('SIGINT', stopInt); process.off('SIGTERM', stopTerm);
    report.completed = new Date().toISOString();
    report.summary = {
      passed: report.cases.filter(entry => entry.status === 'passed').length,
      failed: report.cases.filter(entry => entry.status === 'failed').length,
      interrupted: report.cases.filter(entry => entry.status === 'interrupted').length,
      planned: report.selectedCases?.length || 0,
    };
    await writeReport();
    console.log(JSON.stringify(report.summary));
    if (stopRequested) process.exitCode = 130;
    else if (report.failure || report.summary.failed || report.summary.passed !== report.summary.planned) process.exitCode = 1;
  }
}

await main();
