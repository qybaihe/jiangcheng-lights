import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const out = new URL('../output/cinema/qa/', import.meta.url);
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const results = [];
try {
  for (const [device, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('favicon.ico')) errors.push(`HTTP ${response.status()}`); });
    await page.goto('http://127.0.0.1:4180/', { waitUntil: 'networkidle' });
    assert.equal(await page.locator('.time-shot').count(), 10);
    assert.equal(await page.locator('.frame-set').count(), 3);
    assert.equal(await page.locator('#metric-duration').innerText(), '78秒');
    await page.getByRole('button', { name: '第 4 镜，一碗面的位置，8 秒', exact: true }).click();
    assert.equal(await page.locator('#shot-stage h3').innerText(), '一碗面的位置');
    const slider = page.getByRole('slider', { name: '一碗面的位置，首尾帧对照分界', exact: true });
    await slider.focus();
    await slider.press('ArrowRight');
    assert.equal(await slider.inputValue(), '51');
    assert.match(await slider.getAttribute('aria-valuetext'), /51%/);
    await page.getByRole('button', { name: '尾帧放大 ↗', exact: true }).nth(2).click();
    assert.equal(await page.locator('#lightbox').evaluate(el => el.open), true);
    assert.match(await page.locator('#lightbox-title').innerText(), /留一盏灯.*尾帧/);
    await page.keyboard.press('ArrowLeft');
    assert.match(await page.locator('#lightbox-title').innerText(), /留一盏灯.*首帧/);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#lightbox').evaluate(el => el.open), false);
    for (const frame of await page.locator('.frame-set').all()) {
      await frame.scrollIntoViewIfNeeded();
      await frame.locator('img').first().waitFor({ state: 'visible' });
    }
    await page.waitForFunction(() => [...document.querySelectorAll('.frame-set img')].every(image => image.complete && image.naturalWidth === 2048));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.locator('.frame-set').nth(2).scrollIntoViewIfNeeded();
    await page.screenshot({ path: fileURLToPath(new URL(`board-${device}-frames.png`, out)) });
    await page.getByRole('link', { name: '江城有灯，回到顶部', exact: true }).click();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: fileURLToPath(new URL(`board-${device}-top.png`, out)) });
    assert.deepEqual(errors, []);
    results.push({ device, viewport, checks: ['10-shot timeline', '3 frame pairs', '78-second plan', 'shot selection', 'keyboard comparison slider', 'lightbox navigation and escape', 'all 6 full-size frames loaded', 'no page overflow', 'no runtime or asset errors'], passed: true });
    await page.close();
  }
  await fs.writeFile(new URL('browser-report.json', out), JSON.stringify({ testedAt: new Date().toISOString(), results }, null, 2));
  console.log('Storyboard desktop/mobile checks passed; 18 assertions groups, no runtime or asset errors.');
} finally { await browser.close(); }
