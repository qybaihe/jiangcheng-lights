import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { freshState, SAVE_KEY, START } from '../src/story.js';
import { GALLERY_KEY } from '../src/endings.js';

// Independent browser storage on the QA preview or explicitly selected local
// final preview. The initial saves establish weather phases, not a playthrough.
// After startup, movement, reading, boarding and restart use actual game UI.
const BASE = process.env.GAME_URL || 'http://127.0.0.1:4187';
const endpoint = new URL(BASE);
assert.equal(endpoint.hostname, '127.0.0.1', 'weather QA uses only its isolated local preview');
assert.ok(['4187', '4173'].includes(endpoint.port), 'weather QA uses only the local QA or final-preview ports');
// Relative directories are resolved from this test file, like the default.
const outputDir = process.env.PROP_WEATHER_QA_DIR || '../output/qa/props-v1/weather/';
const out = new URL(outputDir.endsWith('/') ? outputDir : `${outputDir}/`, import.meta.url);
await mkdir(out, { recursive: true });
const report = {
  started: new Date().toISOString(), base: BASE, status: 'running',
  scope: 'Weather-phase fixtures + real map, F, paper paging, mouse wheel, ferry and settings/restart UI in isolated browser contexts.',
  limitations: [
    'Fixture flags establish prepared/postlude starting states; this does not verify or claim a full story playthrough.',
    'Desktop Chrome at 1366×768 and 1920×1080; no mobile/touch coverage.',
    'Projection assertions use the real world player root/head envelope; screenshots additionally document the seated pose.',
    'The retained gallery item is an explicitly seeded test fixture, not a gameplay-earned achievement.',
  ],
  cases: [], checks: [], screenshots: [], errors: [], failedRequests: [],
};
let activePage, activeCase = 'setup', browser;
const check = (condition, name, details = {}) => {
  report.checks.push({ case: activeCase, name, passed: Boolean(condition), ...details });
  assert.ok(condition, name); console.log('PASS', name);
};
const snapshot = page => page.evaluate(() => ({
  world: window.__JIANGCHENG__.getWorld(), props: window.__JIANGCHENG__.getProps(),
  state: window.__JIANGCHENG__.getState(), modal: window.__JIANGCHENG__.getModal(),
}));
async function shot(page, name) {
  const filename = `${name}.png`;
  await page.screenshot({ path: fileURLToPath(new URL(filename, out)) });
  const details = await snapshot(page);
  await writeFile(new URL(`${name}.json`, out), JSON.stringify(details, null, 2));
  report.screenshots.push({ case: activeCase, filename });
}
function fixture(phase, position = START) {
  const value = freshState();
  Object.assign(value, { started: true, position: { ...position }, runEnded: false,
    flags: ['storyV3', 'received', 'radio', 'granny', 'chefRequested', 'chef', 'dock', 'prepared'],
    supplies: ['box', 'water', 'battery'], storyChoices: { commitment: 'help' } });
  if (phase === 'afterRain') {
    value.flags.push('riskWater', 'riskCable', 'checked', 'ending', 'postlude');
    value.storyChoices.stay = 'breakfast';
  }
  value.settings.quality = 'low'; value.settings.sound = false;
  return value;
}
async function ready(page) {
  await page.waitForFunction(() => window.__JIANGCHENG__ && document.querySelector('#boot').hidden &&
    window.__JIANGCHENG__.getProps().anchors.length === 5, null, { timeout: 90000 });
  const assets = await page.locator('script[src],link[rel="stylesheet"]').evaluateAll(nodes => nodes.map(node => node.src || node.href));
  report.cases.find(item => item.name === activeCase).assets = assets;
  if (report.assets) assert.deepEqual(assets, report.assets, 'all matrix entries use the same frozen preview asset');
  else report.assets = assets;
}
async function openContext(name, initial, viewport, gallery) {
  activeCase = name;
  report.cases.push({ name, viewport, fixture: { flags: initial.flags, position: initial.position, gallerySeeded: Boolean(gallery) }, status: 'running' });
  const context = await browser.newContext({ viewport });
  await context.addInitScript(({ key, initial, galleryKey, gallery }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(initial));
    if (gallery && !localStorage.getItem(galleryKey)) localStorage.setItem(galleryKey, JSON.stringify(gallery));
  }, { key: SAVE_KEY, initial, galleryKey: GALLERY_KEY, gallery });
  const page = await context.newPage(); activePage = page;
  page.on('pageerror', error => report.errors.push({ case: name, message: error.message }));
  page.on('response', response => { if (response.status() >= 400) report.failedRequests.push({ case: name, url: response.url(), status: response.status() }); });
  await page.goto(BASE); await ready(page); await page.locator('#start').click();
  await page.waitForFunction(() => window.__JIANGCHENG__.getWorld().active && window.__JIANGCHENG__.getModal() === null);
  return { context, page };
}
async function go(page, id) {
  await page.locator('#map').click(); await page.locator('#map-destination').selectOption(id);
  check(!await page.locator('#map-go').isDisabled(), `${id} has a real reachable map route`);
  await page.locator('#map-go').click();
  await page.waitForFunction(id => window.__JIANGCHENG__.getWorld().remainingRoute === 0 &&
    window.__JIANGCHENG__.getProps().nearby?.id === id, id, { timeout: 90000 });
  await page.waitForTimeout(400);
}
async function actionable(page, selector) {
  const result = await page.locator(selector).evaluate(node => {
    const rect = node.getBoundingClientRect(), x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
    const top = document.elementFromPoint(x, y);
    return { inside: rect.x >= 0 && rect.y >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
      reachable: node === top || node.contains(top), disabled: Boolean(node.disabled),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
  });
  check(result.inside && result.reachable && !result.disabled, `${selector} is visible and pointer-accessible`, result);
}
async function readerViewport(page, width, height) {
  await page.setViewportSize({ width, height }); await page.waitForTimeout(1200);
  const label = `${width}x${height}`;
  const layout = await page.evaluate(() => {
    const card = document.querySelector('.newspaper-reader').getBoundingClientRect();
    const pages = document.querySelector('.newspaper-pages');
    const world = window.__JIANGCHENG__.getWorld();
    return { viewport: { width: innerWidth, height: innerHeight }, card: { x: card.x, y: card.y, right: card.right, bottom: card.bottom },
      playerFrame: world.playerFrame, playerVisible: world.playerVisible, opacity: world.playerOpacity,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      scroll: { clientHeight: pages.clientHeight, scrollHeight: pages.scrollHeight, top: pages.scrollTop } };
  });
  report.cases.find(item => item.name === activeCase).layouts ??= [];
  report.cases.find(item => item.name === activeCase).layouts.push(layout);
  check(!layout.horizontalOverflow, `${label}: no horizontal page overflow`);
  check(layout.card.x >= 0 && layout.card.y >= 0 && layout.card.right <= width && layout.card.bottom <= height,
    `${label}: the complete reader stays within the viewport`, { layout });
  check(layout.playerVisible && layout.opacity > .2 && ['head', 'feet'].every(part => {
    const point = layout.playerFrame[part];
    return point.visible && point.x >= 0 && point.x < layout.card.x - 12 && point.y >= 0 && point.y < height;
  }), `${label}: the real player projection stays visible left of the paper card`, { frame: layout.playerFrame, card: layout.card });
  await actionable(page, '#newspaper-stand'); await actionable(page, '#newspaper-next');
  const pages = page.locator('.newspaper-pages');
  if (layout.scroll.scrollHeight > layout.scroll.clientHeight + 2) {
    const box = await pages.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + Math.min(130, box.height / 2));
    await page.mouse.wheel(0, 650); await page.waitForTimeout(250);
    const top = await pages.evaluate(node => node.scrollTop);
    check(top > layout.scroll.top, `${label}: mouse wheel scrolls the actual newspaper page`, { scrollTop: top });
    await page.mouse.wheel(0, -2000); await page.waitForTimeout(250);
  } else check(true, `${label}: the full first page fits without requiring scroll`, { scroll: layout.scroll });
  await shot(page, `after-rain-reader-${label}-front`);
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => window.__JIANGCHENG__.getState().props.readEditions.includes('afterRain'));
  await actionable(page, '#newspaper-prev');
  const note = page.locator('#newspaper-note');
  await note.scrollIntoViewIfNeeded();
  if (!await note.isDisabled()) await actionable(page, '#newspaper-note');
  await shot(page, `after-rain-reader-${label}-back`);
  await page.keyboard.press('ArrowLeft');
}

try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const prepared = await openContext('prepared-boarding', fixture('prepared', { x: 27, z: -23.1 }), { width: 1366, height: 768 });
  try {
    const before = await snapshot(prepared.page);
    check(before.props.nearby?.id === 'prop-ferry', 'prepared fixture starts at the land-side ferry anchor');
    await prepared.page.keyboard.press('f'); await prepared.page.locator('.prop-boarding-panel').waitFor();
    const title = await prepared.page.locator('.prop-boarding-panel h2').innerText();
    check(/暂停|停航/.test(title), 'preparation phase shows the closed-ferry announcement before rain particles start', { title });
    check(await prepared.page.locator('#ferry-board').count() === 0, 'preparation closure offers no boarding button');
    check((await snapshot(prepared.page)).props.runtime.mode === 'walk', 'closed-ferry F never mounts or leaves land');
    await shot(prepared.page, 'prepared-closed-ferry-1366x768');
    await prepared.page.locator('#ferry-stay').click();
    const after = await snapshot(prepared.page);
    assert.deepEqual(after.state.flags, before.state.flags); assert.deepEqual(after.state.props, before.state.props);
    report.cases.find(item => item.name === activeCase).status = 'passed';
  } finally { await prepared.context.close(); }

  const fixtureTime = '2026-09-12T00:00:00.000Z';
  const gallery = { version: 3, unlocked: { 'ending-neutral': fixtureTime }, endings: { neutral: { id: 'neutral', unlockedAt: fixtureTime, fixture: true } }, forks: {} };
  const afterRain = await openContext('after-rain-reader-ferry-restart', fixture('afterRain'), { width: 1366, height: 768 }, gallery);
  try {
    const page = afterRain.page, initial = (await snapshot(page)).state;
    await go(page, 'prop-newspaper'); await page.keyboard.press('f');
    await page.waitForFunction(() => window.__JIANGCHENG__.getProps().runtime.mode === 'reading');
    check(/雨后号/.test(await page.locator('.newspaper-top').innerText()), 'legal postlude state opens the rain-after edition');
    check((await snapshot(page)).state.props.readEditions.length === 0, 'opening the rain-after front page does not yet record it');
    await readerViewport(page, 1366, 768); await readerViewport(page, 1920, 1080);
    await page.keyboard.press('ArrowRight'); await page.locator('#newspaper-note').click();
    const read = (await snapshot(page)).state.props;
    assert.deepEqual(read.readEditions, ['afterRain']); assert.deepEqual(read.notes, ['many-hands']);
    check(true, 'real after-rain paging and note click record afterRain / many-hands only');
    await page.locator('#newspaper-stand').click();
    await page.waitForFunction(() => window.__JIANGCHENG__.getProps().runtime.mode === 'walk' && window.__JIANGCHENG__.getModal() === null);

    await go(page, 'prop-bicycle'); await page.keyboard.press('f');
    await page.waitForFunction(() => window.__JIANGCHENG__.getProps().runtime.mode === 'bicycle');
    await page.keyboard.down('w'); await page.waitForTimeout(550); await page.keyboard.up('w'); await page.waitForTimeout(450);
    await page.keyboard.press('f'); await page.waitForFunction(() => window.__JIANGCHENG__.getProps().runtime.mode === 'walk');
    check((await snapshot(page)).state.props.bicycleUnlocked, 'a real borrow supplies nonempty bicycle progress for restart testing');

    await go(page, 'prop-ferry'); await page.keyboard.press('f'); await page.locator('.prop-boarding-panel').waitFor();
    const reopened = await page.locator('.prop-boarding-panel h2').innerText();
    check(/确认恢复|复航/.test(reopened), 'postlude ferry announcement explicitly confirms reopening', { title: reopened });
    await actionable(page, '#ferry-board'); await shot(page, 'after-rain-reopened-ferry-1920x1080');
    await page.locator('#ferry-board').click();
    await page.waitForFunction(() => window.__JIANGCHENG__.getProps().runtime.mode === 'ferry' && window.__JIANGCHENG__.getProps().runtime.ferryProgress > .03, null, { timeout: 30000 });
    await shot(page, 'after-rain-ferry-on-water'); await page.locator('#ferry-return').click();
    await page.waitForFunction(() => window.__JIANGCHENG__.getProps().runtime.mode === 'walk' && window.__JIANGCHENG__.getModal() === null, null, { timeout: 30000 });
    check((await snapshot(page)).state.props.ferryRides === 0, 'rain-after early return docks without awarding a completed trip');
    const beforeRestart = await snapshot(page);
    for (const key of ['flags', 'supplies', 'lore', 'adventure', 'storyChoices']) assert.deepEqual(beforeRestart.state[key], initial[key], key);
    check(true, 'weather-fixture activities do not alter main-story work or ending choices');
    const galleryBefore = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), GALLERY_KEY);
    await page.locator('#settings').click(); await page.locator('#restart').click(); await page.locator('#restart-yes').click();
    await page.locator('#welcome').waitFor({ state: 'visible' });
    const restarted = await snapshot(page), props = restarted.state.props;
    check(!restarted.state.started && restarted.props.runtime.mode === 'walk', 'restart returns to the welcome screen with ordinary walking mode');
    check(!props.bicycleUnlocked && props.readEditions.length === 0 && props.notes.length === 0 && props.ferryRides === 0,
      'restart clears earned bicycle, newspaper, note and voyage progress', { props });
    assert.deepEqual(restarted.state.storyChoices, {}); check(true, 'restart creates an empty storyChoices object');
    check(Math.hypot(restarted.props.runtime.bikePosition.x + 21, restarted.props.runtime.bikePosition.z - 20) < .02,
      'restart resets the parked bicycle to its initial place', { bike: restarted.props.runtime.bikePosition });
    const galleryAfter = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), GALLERY_KEY);
    check(galleryAfter.unlocked['ending-neutral'] === fixtureTime && Object.keys(galleryBefore.unlocked).every(key => galleryAfter.unlocked[key] === galleryBefore.unlocked[key]),
      'restart preserves the seeded gallery item and existing collection timestamps');
    await shot(page, 'restart-clean-props-gallery-retained');
    report.cases.find(item => item.name === activeCase).status = 'passed';
  } finally { await afterRain.context.close(); }
  check(report.errors.length === 0, 'no unhandled browser errors in the matrix', { errors: report.errors });
  check(report.failedRequests.length === 0, 'no failed HTTP assets in the matrix', { failures: report.failedRequests });
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = error.stack;
  const current = report.cases.find(item => item.name === activeCase); if (current) current.status = 'failed';
  if (activePage && !activePage.isClosed()) await shot(activePage, `failure-${activeCase}`).catch(() => {});
  console.error(error); process.exitCode = 1;
} finally {
  report.finished = new Date().toISOString(); await writeFile(new URL('report.json', out), JSON.stringify(report, null, 2));
  await browser?.close(); console.log(JSON.stringify({ status: report.status, checks: report.checks.length, report: fileURLToPath(new URL('report.json', out)) }));
}
