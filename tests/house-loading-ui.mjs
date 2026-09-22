import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// A private, ephemeral-port fixture: no Vite build, production server, saved
// game, WebGL scene or running browser session is touched by this suite.
const project = fileURLToPath(new URL('../', import.meta.url));
const output = `${project}output/qa/house-loading/`;
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/style.css"><link rel="stylesheet" href="/src/ui/house-loading.css"><title>小屋开场组件专项</title></head><body><button id="fixture-start" style="position:fixed;right:24px;bottom:24px;padding:18px;background:#fff9e9">走进晴川里</button><div id="boot"></div><script type="module">
import {mountHouseLoading} from '/src/ui/house-loading.js';
window.fixture={starts:0,retries:0};
fixture.mount=(options={})=>{fixture.controller=mountHouseLoading(document.querySelector('#boot'),{onRetry:()=>{fixture.retries++;fixture.controller.update({completed:1,total:3});},...options});return fixture.controller;};
fixture.mount();document.querySelector('#fixture-start').onclick=()=>fixture.starts++;
</script></body></html>`;
const mime = { js: 'text/javascript', css: 'text/css', png: 'image/png', webp: 'image/webp' };
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://fixture.local').pathname;
  if (path === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); return; }
  if (path === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  const allow = ['/src/style.css', '/src/ui/house-loading.css', '/src/ui/house-loading.js', '/media/game-icon-v2-512.png', '/media/game-logo-v1-transparent.webp'];
  if (!allow.includes(path)) { res.writeHead(404); res.end(); return; }
  try {
    const data = await readFile(project + (path.startsWith('/media/') ? 'public' : '') + path);
    res.setHeader('Content-Type', mime[path.split('.').pop()]); res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
await mkdir(output, { recursive: true });
const base = `http://127.0.0.1:${server.address().port}`;
const report = { suite: 'house-loading-ui', date: new Date().toISOString(), scope: 'isolated component; random local port; no build or world', checks: [], errors: [] };
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }, { name: 'landscape', width: 844, height: 390 }]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(base);
    await page.waitForFunction(() => Boolean(window.fixture?.controller));
    await page.evaluate(() => { fixture.controller.update({ completed: 1, total: 3 }); fixture.controller.setStage('hero'); });
    await page.waitForTimeout(850);
    const metrics = await page.evaluate(() => {
      const root = document.querySelector('#boot'), image = root.querySelector('.house-loading__house'), logo = root.querySelector('.house-loading__logo');
      const nodes = [...root.querySelectorAll('.house-loading__logo,.house-loading__stage,.house-loading__detail,.house-loading__progress')].map(e => { const r = e.getBoundingClientRect(); return { class: e.className, left: r.left, right: r.right, top: r.top, bottom: r.bottom }; });
      return { display: getComputedStyle(root).display, width: root.clientWidth, scrollWidth: root.scrollWidth, imageReady: image.complete && image.naturalWidth === 512, logoReady: logo.complete && logo.naturalWidth > 1000, imageWidth: image.clientWidth, nodes, progress: root.querySelector('[role=progressbar]').getAttribute('aria-valuetext'), animationProperties: root.getAnimations({ subtree: true }).flatMap(a => a.effect.getKeyframes().flatMap(frame => Object.keys(frame).filter(key => !['offset','computedOffset','easing','composite'].includes(key)))) };
    });
    assert.equal(metrics.display, 'grid'); assert.ok(metrics.width >= metrics.scrollWidth, `${viewport.name}: horizontal overflow ${JSON.stringify(metrics)}`);
    assert.ok(metrics.imageReady && metrics.logoReady, 'brand images decoded');
    assert.ok(metrics.imageWidth >= 200);
    for (const node of metrics.nodes) assert.ok(node.left >= 0 && node.right <= viewport.width && node.top >= 0 && node.bottom <= viewport.height, `${viewport.name}: clipped ${JSON.stringify(node)}`);
    assert.match(metrics.progress, /已完成 1 \/ 3 项准备/);
    assert.ok(metrics.animationProperties.every(property => ['opacity', 'transform'].includes(property)));
    await page.screenshot({ path: `${output}${viewport.name}-loading.png`, animations: 'disabled' });
    report.checks.push({ viewport: viewport.name, name: 'brand artwork, real task count, layout and compositor-only animation', metrics });

    await page.evaluate(() => fixture.controller.fail('连接暂时中断，请检查网络后再试一次。'));
    const retry = page.locator('[data-loading-retry]');
    await retry.scrollIntoViewIfNeeded();
    const button = await retry.evaluate(e => { const r = e.getBoundingClientRect(); return { width: r.width, height: r.height, focused: document.activeElement === e, inViewport: r.top >= 0 && r.bottom <= innerHeight }; });
    assert.ok(button.width >= 44 && button.height >= 44 && button.inViewport && button.focused);
    assert.equal(await page.locator('[data-loading-progress]').isVisible(), false);
    await page.screenshot({ path: `${output}${viewport.name}-failure.png`, animations: 'disabled' });
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => fixture.retries), 1);
    assert.equal(await page.evaluate(() => fixture.controller.getSnapshot().state), 'loading');
    report.checks.push({ viewport: viewport.name, name: 'failure retry is reachable, focused and keyboard operational', button });

    const immediate = await page.evaluate(() => {
      fixture.controller.complete();
      const root = document.querySelector('#boot'), button = document.querySelector('#fixture-start'), rect = button.getBoundingClientRect();
      return { pointerEvents: getComputedStyle(root).pointerEvents, inert: root.inert, hit: document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === button };
    });
    assert.equal(immediate.pointerEvents, 'none'); assert.ok(immediate.inert && immediate.hit);
    await page.waitForFunction(() => document.querySelector('#boot').hidden);
    await page.locator('#fixture-start').click();
    assert.equal(await page.evaluate(() => fixture.starts), 1);
    assert.equal(await page.locator('#boot').count(), 1, '#boot is hidden rather than removed');
    report.checks.push({ viewport: viewport.name, name: 'completion immediately releases start and retains hidden #boot', immediate });
    await context.close();
  }

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage(); await page.goto(base);
  await page.waitForFunction(() => Boolean(window.fixture?.controller));
  assert.equal(await page.locator('#boot').getAttribute('data-reduced'), 'true');
  assert.equal(await page.evaluate(() => document.querySelector('#boot').getAnimations({ subtree: true }).length), 0);
  await page.screenshot({ path: `${output}mobile-reduced.png`, animations: 'disabled' });
  await page.evaluate(() => fixture.controller.complete());
  assert.equal(await page.locator('#boot').evaluate(e => e.hidden), true);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => fixture.mount({ reduced: true }));
  assert.equal(await page.evaluate(() => document.querySelector('#boot').getAnimations({ subtree: true }).length), 0);
  report.checks.push({ name: 'system and user reduced-motion preferences both disable all component animation' });
  await context.close();
  assert.deepEqual(report.errors, []);
  console.log(`PASS ${report.checks.length} browser checks; screenshots: ${output}`);
} finally {
  await writeFile(`${output}report.json`, `${JSON.stringify(report, null, 2)}\n`);
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
