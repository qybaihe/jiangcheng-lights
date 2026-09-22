import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { cpus } from 'node:os';
import { freshState, SAVE_KEY } from '../src/story.js';

// Dedicated, isolated browser contexts. Read-only world diagnostics verify the
// real render; all movement, conversations and vehicle controls use game UI.
const BASE = process.env.GAME_URL || 'http://127.0.0.1:4173';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(BASE).hostname), 'local preview only');
const baseline = process.env.RESIDENT_QA_MODE === 'baseline';
const exploratory = process.env.RESIDENT_QA_MODE === 'exploratory';
const directory = process.env.RESIDENT_QA_DIR || `../output/qa/resident-avatars-v3/${baseline ? 'baseline' : exploratory ? 'exploratory' : 'integration'}/`;
const out = new URL(directory.endsWith('/') ? directory : `${directory}/`, import.meta.url);
await mkdir(out, { recursive: true });
const IDS = ['granny', 'chef', 'dock', 'community', 'walker0', 'walker1', 'walker2', 'walker3', 'walker4'];
const report = {
  startedAt: new Date().toISOString(), base: BASE, mode: baseline ? 'baseline' : exploratory ? 'exploratory' : 'integration', status: 'running',
  scope: 'Isolated Chromium contexts: actual routes, nine 3D conversations, desktop full-body composition, weather visibility, protagonist and car regression; no user storage is accessed.',
  limitations: ['Starting saves establish story/weather states; this is not a full story playthrough or a first-play duration test.', 'Performance samples are local browser measurements, not a cross-device FPS promise.', 'Screen-space head/feet envelopes supplement screenshots; visual material quality requires contact-sheet review.'],
  environment: { cpu: cpus()[0]?.model, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  checks: [], cases: [], samples: [], screenshots: [], errors: [], failedRequests: [],
};
let browser, activePage, activeCase = 'setup';
function check(condition, name, details = {}, collect = false) {
  report.checks.push({ case: activeCase, name, passed: Boolean(condition), ...details });
  if (!collect) assert.ok(condition, name); console.log(condition ? 'PASS' : 'COLLECTED CAMERA FAILURE', name);
}
const state = page => page.evaluate(() => __JIANGCHENG__.getState());
const world = page => page.evaluate(() => __JIANGCHENG__.getWorld());
const residents = page => page.evaluate(() => __JIANGCHENG__.getResidents().residents);
const runtime = page => page.evaluate(() => __JIANGCHENG__.getProps().runtime);
function fixture(phase = 'beforeRain', avatarId = 'female') {
  const value = freshState(); value.started = true; value.flags = ['storyV3', 'received', 'radio'];
  Object.assign(value.settings, { sound: false, reduced: false, quality: 'high', cameraMode: 'street', avatarId });
  if (phase !== 'beforeRain') {
    value.flags.push('granny', 'chefRequested', 'chef', 'dock', 'prepared');
    value.supplies = ['box', 'water', 'battery']; value.storyChoices = { commitment: 'help' };
  }
  if (phase === 'rain' || phase === 'afterRain') value.flags.push('riskWater', 'riskCable', 'checked');
  if (phase === 'afterRain') { value.flags.push('ending', 'postlude'); value.storyChoices.stay = 'breakfast'; value.runEnded = false; }
  return value;
}
async function ready(page, verifyModels = !baseline) {
  await page.waitForFunction(() => window.__JIANGCHENG__ && document.querySelector('#boot').hidden && __JIANGCHENG__.getProps().anchors.length === 5, null, { timeout: 90000 });
  if (verifyModels) await page.waitForFunction(() => {
    const all = __JIANGCHENG__.getResidents().residents;
    return all.length === 9 && all.every(n => n.avatar?.state === 'ready');
  }, null, { timeout: 90000 });
}
async function open(name, initial = fixture()) {
  activeCase = name; report.cases.push({ name, fixture: { flags: initial.flags, avatarId: initial.settings.avatarId }, status: 'running' });
  const context = await browser.newContext({ viewport: report.environment.viewport, deviceScaleFactor: 1 });
  await context.addInitScript(({ key, initial }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(initial)); }, { key: SAVE_KEY, initial });
  const page = await context.newPage(); activePage = page;
  page.on('pageerror', error => report.errors.push({ case: name, message: error.message }));
  page.on('response', response => { if (response.status() >= 400) report.failedRequests.push({ case: name, url: response.url(), status: response.status() }); });
  await page.goto(BASE); await ready(page);
  const assets = await page.locator('script[src],link[rel="stylesheet"]').evaluateAll(nodes => nodes.map(node => node.src || node.href));
  report.cases.at(-1).assets = assets;
  if (report.assets) assert.deepEqual(assets, report.assets, 'all cases use the same frozen preview asset'); else report.assets = assets;
  if (process.env.EXPECTED_BUILD_ASSET) assert.ok(assets.some(url => new URL(url).pathname === process.env.EXPECTED_BUILD_ASSET), 'expected frozen build');
  await page.locator('#start').click();
  await page.waitForFunction(() => __JIANGCHENG__.getWorld().active && __JIANGCHENG__.getModal() === null);
  await page.waitForTimeout(2000);
  return { context, page };
}
function finishCase() { report.cases.find(entry => entry.name === activeCase).status = 'passed'; }
async function closeCase(run) {
  if (report.cases.find(entry => entry.name === activeCase)?.status !== 'passed' && !run.page.isClosed()) await shot(run.page, `failure-${activeCase}`).catch(() => {});
  await run.context.close();
}
async function shot(page, name) {
  const filename = `${name}.png`;
  await page.screenshot({ path: fileURLToPath(new URL(filename, out)) });
  await writeFile(new URL(`${name}.json`, out), JSON.stringify(await page.evaluate(() => ({ world: __JIANGCHENG__.getWorld(), residents: __JIANGCHENG__.getResidents(), modal: __JIANGCHENG__.getModal() })), null, 2));
  report.screenshots.push({ case: activeCase, filename });
}
async function go(page, id) {
  await page.locator('#map').click(); await page.locator('#map-destination').selectOption(id);
  assert.equal(await page.locator('#map-go').isDisabled(), false, `${id} reachable`); await page.locator('#map-go').click();
  await page.waitForFunction(id => __JIANGCHENG__.getWorld().remainingRoute === 0 && (__JIANGCHENG__.getNearest() === id || __JIANGCHENG__.getProps().nearby?.id === id), id, { timeout: 90000 });
}
async function visit(page, id) {
  await page.locator('#prop-guide').click(); await page.locator(`[data-resident-visit="${id}"]`).click();
  await page.waitForFunction(id => __JIANGCHENG__.getModal() === 'resident' && document.querySelector('.resident-chat')?.dataset.residentId === id, id, { timeout: 90000 });
  await page.waitForTimeout(1300);
}
async function measure(page, name, duration = 4000) {
  await page.waitForTimeout(900);
  const sample = await page.evaluate(duration => new Promise(resolve => {
    const intervals = [], before = __JIANGCHENG__.getWorld(); let start, last;
    function frame(now) {
      if (start === undefined) { start = last = now; requestAnimationFrame(frame); return; }
      intervals.push(now - last); last = now;
      if (now - start < duration) { requestAnimationFrame(frame); return; }
      const sorted = intervals.slice().sort((a, b) => a - b), after = __JIANGCHENG__.getWorld();
      resolve({ fps: intervals.length / (now - start) * 1000, medianMs: sorted[Math.floor(sorted.length * .5)], p95Ms: sorted[Math.floor(sorted.length * .95)], p99Ms: sorted[Math.floor(sorted.length * .99)], frames: intervals.length, elapsedMs: now - start, renderedFrames: after.shadow.renderedFrames - before.shadow.renderedFrames, shadowUpdates: after.shadow.updates - before.shadow.updates, shadowRequests: after.shadow.requests - before.shadow.requests, drawCalls: after.drawCalls, triangles: after.triangles, from: before.position, to: after.position, frameTimesMs: intervals });
    } requestAnimationFrame(frame);
  }), duration);
  report.samples.push({ case: activeCase, name, ...sample });
  check(sample.renderedFrames > 15, `${name}: live 3D frames render`, { renderedFrames: sample.renderedFrames });
  check(sample.shadowUpdates === 0 && sample.shadowRequests === 0, `${name}: moving residents do not refresh cached static shadows`, { shadowUpdates: sample.shadowUpdates, shadowRequests: sample.shadowRequests });
  return sample;
}
async function cameraFrame(page, id, width, height, name = 'greeting') {
  await page.setViewportSize({ width, height }); await page.waitForTimeout(1300);
  const layout = await page.evaluate(() => {
    const r = document.querySelector('.resident-chat').getBoundingClientRect(), w = __JIANGCHENG__.getWorld();
    return { panel: { x: r.x, y: r.y, right: r.right, bottom: r.bottom }, actors: w.conversation?.actors, suspended: w.suspended, horizontalOverflow: document.documentElement.scrollWidth > innerWidth, worldCanvas: !document.querySelector('#world').hidden };
  });
  check(layout.worldCanvas && !layout.suspended && layout.actors?.length === 2, `${id} ${name} ${width}×${height}: real two-actor 3D conversation`, layout, exploratory);
  check(!layout.horizontalOverflow && layout.panel.x >= 0 && layout.panel.right <= width + 1 && layout.panel.bottom <= height + 1, `${id} ${name} ${width}×${height}: complete chat panel fits`, { panel: layout.panel }, exploratory);
  check(layout.actors.every(a => a.visible && ['head', 'feet'].every(part => { const p = a[part]; return p.visible && p.x >= 8 && p.x < width - 8 && p.y >= 72 && p.y < layout.panel.y - 4; })), `${id} ${name} ${width}×${height}: both head and feet remain above subtitles`, { actors: layout.actors, panel: layout.panel }, exploratory);
  await shot(page, `${id}-${name}-${width}x${height}`);
}
async function performanceRoute(page) {
  await measure(page, 'day-start-idle');
  await go(page, 'dock'); await page.waitForTimeout(700);
  await page.keyboard.press('g'); await page.waitForSelector('.resident-chat'); await page.waitForTimeout(1000);
  await measure(page, 'zhoubo-conversation'); await shot(page, 'performance-zhoubo');
  await page.keyboard.press('Escape'); await page.waitForTimeout(1100);
  await page.locator('#first-person').click(); await page.waitForTimeout(600); await page.keyboard.down('w');
  try { await measure(page, 'dock-first-person-walking'); } finally { await page.keyboard.up('w'); }
}

try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' }); report.environment.browser = browser.version();
  if (!exploratory) {
  const perf = await open('performance-route');
  try {
    report.environment.browserDetails = await perf.page.evaluate(() => {
      const gl = document.querySelector('#world').getContext('webgl2'), debug = gl?.getExtension('WEBGL_debug_renderer_info');
      return { userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency, gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER) };
    });
    await performanceRoute(perf.page); finishCase();
  } finally { await closeCase(perf); }
  }
  if (!baseline) {
    const all = await open('nine-residents');
    try {
      const page = all.page, initial = await state(page), roster = await residents(page);
      assert.deepEqual(roster.map(n => n.id).sort(), IDS.slice().sort());
      check(roster.every(n => n.avatar?.state === 'ready' && n.avatar.source && n.avatar.url), 'all nine residents report loaded external model provenance', { roster });
      check(new Set(roster.map(n => n.avatar.variant)).size === 9, 'nine named residents have nine distinct assembled variants', { variants: roster.map(n => ({ id: n.id, variant: n.avatar.variant })) });
      check(new Set(roster.map(n => n.avatar.base)).size >= 4, 'resident variety uses at least four actual external base models, not only recolours');
      const heights = roster.map(n => n.avatar.metrics?.height);
      check(heights.every(h => Number.isFinite(h) && h >= 1.45 && h <= 1.90) && Math.max(...heights) - Math.min(...heights) >= .2, 'resident rigs retain adult proportions with varied real body heights', { heights });
      const beforeWalk = new Map(roster.filter(n => n.id.startsWith('walker')).map(n => [n.id, n]));
      const displacement = {};
      for (let i = 0; i < 10; i++) { await page.waitForTimeout(750); for (const n of await residents(page)) if (beforeWalk.has(n.id)) { const a = beforeWalk.get(n.id); displacement[n.id] = Math.max(displacement[n.id] || 0, Math.hypot(n.x - a.x, n.z - a.z)); } }
      check(Object.values(displacement).length === 5 && Object.values(displacement).every(n => n > .1), 'all five everyday walkers visibly move on their existing routes', { displacement });
      for (const id of IDS) {
        await page.setViewportSize(report.environment.viewport); await visit(page, id);
        const a = (await residents(page)).find(n => n.id === id); await page.waitForTimeout(900); const b = (await residents(page)).find(n => n.id === id);
        check(Math.hypot(a.x - b.x, a.z - b.z) < .02, `${id}: resident stops while exchanging greetings`);
        check(b.avatar.updates > a.avatar.updates && b.avatar.lod === 'conversation', `${id}: external skeleton and conversational animation keep updating`);
        await cameraFrame(page, id, 1366, 768); await cameraFrame(page, id, 1920, 1080);
        await page.locator('[data-resident-action="advance"]').click();
        check(await page.locator('[data-resident-topic]').count() === 3, `${id}: three original story topics remain available`);
        await cameraFrame(page, id, 1366, 768, 'topics');
        const topic = await page.locator('[data-resident-topic]').first().getAttribute('data-resident-topic'); await page.locator('[data-resident-topic]').first().click();
        for (let i = 0; i < 4; i++) await page.locator('[data-resident-action="advance"]').click();
        check((await state(page)).residents.heard[id]?.includes(topic), `${id}: actual story completion records exactly its chosen topic`);
        await page.keyboard.press('Escape'); await page.waitForTimeout(1000);
        if (id.startsWith('walker')) {
          const origin = (await residents(page)).find(n => n.id === id);
          await page.waitForFunction(({ id, origin }) => { const n = __JIANGCHENG__.getResidents().residents.find(n => n.id === id); return Math.hypot(n.x - origin.x, n.z - origin.z) > .08; }, { id, origin }, { timeout: 12000 });
          check(true, `${id}: ordinary strolling resumes after the chat closes`);
        }
      }
      const after = await state(page); for (const key of ['flags', 'supplies', 'lore', 'storyChoices']) assert.deepEqual(after[key], initial[key]);
      check(true, 'nine 3D conversations preserve all main-story flags, supplies, lore and ending decisions');
      await page.setViewportSize(report.environment.viewport); await go(page, 'dock'); await page.waitForTimeout(1300);
      const dockPick = (await residents(page)).find(n => n.id === 'dock'); check(dockPick.screen?.visible, 'Zhou Bo external mesh has a visible body pick target');
      await page.mouse.click(dockPick.screen.x, dockPick.screen.y); await page.waitForFunction(() => __JIANGCHENG__.getModal() === 'resident' && document.querySelector('.resident-chat')?.dataset.residentId === 'dock', null, { timeout: 15000 });
      check(true, 'clicking the external resident body still opens actual 3D small talk'); await page.keyboard.press('Escape');
      await page.keyboard.press('e'); await page.waitForSelector('.dialogue-box'); await page.waitForTimeout(1200);
      check((await world(page)).conversation?.actors.some(a => a.id === 'dock'), 'E still opens Zhou Bo’s original main-story 3D dialogue'); await shot(page, 'main-story-dock'); await page.keyboard.press('Escape');
      await page.reload(); await ready(page); await page.locator('#start').click(); const restored = await state(page);
      check(IDS.every(id => restored.residents.heard[id]?.length === 1), 'all nine completed stories survive reload with no duplicate awards'); finishCase();
    } finally { await closeCase(all); }
    if (!exploratory) {
    for (const avatar of ['female', 'male']) {
      const run = await open(`car-smoke-${avatar}`, fixture('beforeRain', avatar));
      try {
        const page = run.page; check((await world(page)).avatar?.state === 'ready', `${avatar}: existing protagonist is ready`);
        for (const id of ['prop-car-sedan', 'prop-car-van']) {
          await go(page, id); await page.keyboard.press('f'); await page.waitForFunction(id => __JIANGCHENG__.getProps().runtime.mode === 'car' && __JIANGCHENG__.getProps().runtime.carId === id, id);
          const start = (await runtime(page)).cars.find(c => c.id === id); await page.keyboard.down('w'); await page.waitForTimeout(650); await page.keyboard.up('w'); await page.waitForTimeout(150); const end = (await runtime(page)).cars.find(c => c.id === id);
          check(Math.hypot(end.x - start.x, end.z - start.z) > .4, `${avatar} ${id}: existing seated protagonist can actually drive`, { start, end }); await shot(page, `${avatar}-${id}`);
          await page.keyboard.press('f'); check((await runtime(page)).mode === 'walk', `${avatar} ${id}: F returns to walking`);
        }
        finishCase();
      } finally { await closeCase(run); }
    }
    for (const phase of ['prepared', 'rain', 'afterRain']) {
      const run = await open(`weather-${phase}`, fixture(phase));
      try {
        const page = run.page, roster = await residents(page), expected = phase === 'rain' ? ['community'] : IDS;
        assert.deepEqual(roster.filter(n => n.visible).map(n => n.id).sort(), expected.slice().sort());
        check(true, `${phase}: new residents obey the existing shelter/return visibility policy`, { visible: roster.filter(n => n.visible).map(n => n.id) });
        await visit(page, 'community'); await cameraFrame(page, 'community', 1366, 768, phase); await page.keyboard.press('Escape'); finishCase();
      } finally { await closeCase(run); }
    }
  }
  }
  check(report.errors.length === 0, 'no uncaught browser errors', { errors: report.errors });
  check(report.failedRequests.length === 0, 'no missing HTTP assets', { failedRequests: report.failedRequests });
  report.status = baseline ? 'measured' : exploratory ? (report.checks.some(item => !item.passed) ? 'exploratory-findings' : 'exploratory-passed') : 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = error.stack; const current = report.cases.find(entry => entry.name === activeCase); if (current) current.status = 'failed';
  if (activePage && !activePage.isClosed()) await shot(activePage, `failure-${activeCase}`).catch(() => {});
  console.error(error); process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString(); await writeFile(new URL('report.json', out), JSON.stringify(report, null, 2)); await browser?.close();
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, samples: report.samples.map(({ frameTimesMs, ...sample }) => sample), report: fileURLToPath(new URL('report.json', out)) }, null, 2));
}
