import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const out = new URL('../output/cinema/qa/', import.meta.url);
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const reports = [];
try {
  for (const [device, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('favicon.ico')) errors.push(`HTTP ${response.status()} ${new URL(response.url()).pathname}`); });
    await page.goto('http://127.0.0.1:4180/', { waitUntil: 'networkidle' });
    assert.equal(await page.locator('video').count(), 4);
    assert.match(await page.locator('#video-scope').innerText(), /旧版 78 秒、10 镜方案待重编/);
    const metadata = [];
    for (const player of await page.locator('video').all()) {
      await player.scrollIntoViewIfNeeded();
      assert.equal(await player.getAttribute('autoplay'), null);
      assert.equal(await player.getAttribute('playsinline'), '');
      await player.evaluate(async video => { video.muted = true; await video.play(); });
      await page.waitForFunction(() => [...document.querySelectorAll('video')].some(video => !video.paused && video.currentTime > .6));
      await player.evaluate(video => { video.pause(); video.currentTime = Math.max(0, video.duration - .5); });
      await player.evaluate(video => new Promise((resolve, reject) => {
        if (!video.seeking && video.readyState >= 2) return resolve();
        const timeout = setTimeout(() => reject(new Error('Video seek timed out')), 12000);
        video.addEventListener('seeked', () => { clearTimeout(timeout); resolve(); }, { once: true });
      }));
      const actual = await player.evaluate(video => ({ source: video.currentSrc.split('/').pop(), duration: video.duration, width: video.videoWidth, height: video.videoHeight, error: video.error?.code || null, decodedFrames: video.getVideoPlaybackQuality().totalVideoFrames }));
      assert.equal(actual.error, null); assert.equal(actual.width, 1280); assert.equal(actual.height, 720); assert(actual.decodedFrames > 0);
      metadata.push(actual);
    }
    assert(Math.abs(metadata[0].duration - 13) < .15);
    assert(metadata.slice(1).every((video,index) => Math.abs(video.duration - [5,4.5,3.5][index]) < .15));
    const first = page.locator('video').nth(0), second = page.locator('video').nth(1);
    await first.evaluate(async v => { v.currentTime = 0; await v.play(); });
    await second.evaluate(async v => { v.currentTime = 0; await v.play(); });
    assert.equal(await first.evaluate(v => v.paused), true);
    await second.evaluate(v => v.pause());
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.locator('#videos-title').scrollIntoViewIfNeeded();
    await page.screenshot({ path: fileURLToPath(new URL(`videos-${device}.png`, out)) });
    assert.deepEqual(errors, []);
    reports.push({ device, passed: true, videos: metadata, checks: ['4 real videos', 'play and decode', 'seek near end', 'no autoplay', 'inline playback', 'single-player audio focus', 'no horizontal overflow', 'previous full-film draft marked for revision', 'no asset/runtime errors'] });
    await page.close();
  }
  await fs.writeFile(new URL('video-browser-report.json', out), JSON.stringify({ testedAt: new Date().toISOString(), reports }, null, 2));
  console.log('Desktop and mobile: all 4 real videos play, decode, seek and identify the 78-second draft as superseded.');
} finally { await browser.close(); }
