import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HOUSE_LOADING_STAGES, HOUSE_LOADING_TIMING, houseLoadingMarkup, mountHouseLoading } from '../src/ui/house-loading.js';

class Events {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  emit(type) { for (const fn of this.listeners.get(type) || []) fn(); }
  listenerCount() { return [...this.listeners.values()].reduce((count, fns) => count + fns.size, 0); }
}
class Node extends Events {
  constructor() {
    super(); this.hidden = false; this.inert = false; this.disabled = false;
    this.dataset = {}; this.style = {}; this.attributes = new Map(); this.textContent = '';
    this.classes = new Set(); this.classList = { add: value => this.classes.add(value) };
  }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  removeAttribute(key) { this.attributes.delete(key); }
  focus() { this.focused = true; }
  click() { if (!this.disabled && !this.hidden) this.emit('click'); }
}
function harness(options = {}) {
  const doc = new Events(), query = new Events(), root = new Node();
  let clock = 0, nextTimer = 0, reloads = 0;
  const timers = new Map();
  doc.hidden = false; query.matches = Boolean(options.systemReduced);
  doc.defaultView = { performance: { now: () => clock }, matchMedia: () => query,
    setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { at: clock + delay, fn }); return id; },
    clearTimeout: id => timers.delete(id), location: { reload: () => reloads++ } };
  root.ownerDocument = doc;
  root.nodes = new Map();
  Object.defineProperty(root, 'innerHTML', { set(value) {
    root.html = value; root.nodes.clear();
    for (const match of value.matchAll(/<(?:p|div|span|button)\b([^>]*\bdata-loading-[^>]*)>/g)) {
      const key = match[1].match(/\b(data-loading-[a-z]+)/)[1];
      const node = new Node(); node.hidden = /\bhidden\b/.test(match[1]); root.nodes.set(`[${key}]`, node);
    }
  }, get() { return root.html; } });
  root.querySelector = selector => root.nodes.get(selector);
  const controller = mountHouseLoading(root, options);
  return { root, doc, query, controller, timers, reloads: () => reloads,
    node: name => root.querySelector(`[data-loading-${name}]`),
    advance(ms) {
      clock += ms;
      for (const [id, entry] of [...timers]) if (entry.at <= clock) { timers.delete(id); entry.fn(); }
    },
  };
}

test('the existing house artwork and transparent logo remain the primary assets', () => {
  const html = houseLoadingMarkup();
  assert.match(html, /src="\/media\/game-icon-v2-512\.png"/);
  assert.match(html, /src="\/media\/game-logo-v1-transparent\.webp"/);
  assert.match(html, /fetchpriority="high"/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /role="progressbar"/);
  assert.equal(Object.isFrozen(HOUSE_LOADING_STAGES), true);
  for (const stage of Object.values(HOUSE_LOADING_STAGES)) assert.equal(Object.isFrozen(stage), true);
});

test('progress starts at zero and never advances just because time passes', () => {
  const h = harness();
  assert.deepEqual(h.controller.getSnapshot(), { state: 'loading', stage: 'scene', completed: 0, total: 3, reduced: false, hidden: false });
  h.advance(15000);
  assert.equal(h.controller.getSnapshot().completed, 0);
  assert.equal(h.timers.size, 0, 'no fake-progress timers');
  assert.equal(h.node('count').textContent, '0 / 3 项准备');
  assert.equal(h.root.getAttribute('aria-busy'), 'true');
  h.controller.dispose();
});

test('stage changes do not claim completed work; host reports only actual counts', () => {
  const h = harness();
  h.controller.setStage('hero');
  assert.equal(h.controller.getSnapshot().completed, 0);
  assert.equal(h.node('stage').textContent, HOUSE_LOADING_STAGES.hero.label);
  h.controller.update({ completed: 1, total: 3 });
  assert.equal(h.node('progress').getAttribute('aria-valuenow'), '1');
  assert.equal(h.node('fill').style.transform, 'scaleX(0.3333333333333333)');
  assert.match(h.node('progress').getAttribute('aria-valuetext'), /已完成 1 \/ 3 项准备/);
  h.controller.update({ completed: 0 });
  assert.equal(h.controller.getSnapshot().completed, 1, 'late completions cannot move progress backwards');
  h.controller.update({ completed: 100, total: 4 });
  assert.equal(h.controller.getSnapshot().completed, 4);
  h.controller.update({ completed: Number.NaN, total: -1 });
  assert.equal(h.controller.getSnapshot().total, 4);
  h.controller.dispose();
});

test('host copy is assigned as text, including failure details', () => {
  const h = harness();
  h.controller.setStage('neighbors', { label: '<b>正在准备</b>', detail: '<img src=x>' });
  assert.equal(h.node('stage').textContent, '<b>正在准备</b>');
  assert.equal(h.node('detail').textContent, '<img src=x>');
  h.controller.fail(new Error('technical detail'), { title: '<script>title</script>', message: '请重试', detail: '<b>connection</b>' });
  assert.equal(h.node('stage').textContent, '<script>title</script>');
  assert.equal(h.node('detail').textContent, '请重试 <b>connection</b>');
  h.controller.dispose();
});

test('fast loading hides immediately without a minimum-duration gate', () => {
  let hidden = 0;
  const h = harness({ onHidden: () => hidden++ });
  h.advance(20);
  const returned = h.controller.complete();
  assert.equal(returned.state, 'complete');
  assert.equal(typeof returned.then, 'undefined', 'completion is not an awaited animation');
  assert.equal(h.root.hidden, true);
  assert.equal(h.root.style.pointerEvents, 'none');
  assert.equal(h.root.inert, true);
  assert.equal(h.timers.size, 0);
  h.controller.complete(); h.controller.setReduced(true);
  assert.equal(hidden, 1, 'hidden callback is exactly once');
  assert.match(h.root.innerHTML, /house-loading__house/, 'the #boot element and content remain available for diagnostics');
});

test('normal completion releases input immediately, then hides within 180 ms', () => {
  const h = harness();
  h.advance(3000);
  h.controller.complete();
  assert.equal(h.root.hidden, false);
  assert.equal(h.root.style.pointerEvents, 'none');
  assert.equal(h.root.inert, true);
  assert.equal(h.root.getAttribute('aria-busy'), 'false');
  assert.equal(h.root.getAttribute('aria-hidden'), 'true');
  assert.equal(h.controller.getSnapshot().completed, 3);
  assert.equal(h.timers.size, 1);
  h.advance(HOUSE_LOADING_TIMING.exitMs);
  assert.equal(h.root.hidden, true);
  assert.equal(h.doc.listenerCount(), 0);
  assert.equal(h.query.listenerCount(), 0);
});

test('both saved and operating-system reduced-motion preferences skip exit animation', () => {
  for (const options of [{ reduced: true }, { systemReduced: true }]) {
    const h = harness(options); h.advance(1000);
    assert.equal(h.root.dataset.reduced, 'true');
    h.controller.setReduced(false);
    if (options.systemReduced) assert.equal(h.controller.getSnapshot().reduced, true);
    else h.controller.setReduced(true);
    h.controller.complete();
    assert.equal(h.root.hidden, true); assert.equal(h.timers.size, 0);
  }
});

test('visibility pauses decorative motion and background completion does not wait for a throttled timer', () => {
  const h = harness();
  h.doc.hidden = true; h.doc.emit('visibilitychange');
  assert.equal(h.root.dataset.paused, 'true');
  h.doc.hidden = false; h.doc.emit('visibilitychange');
  assert.equal(h.root.dataset.paused, 'false');
  h.advance(1000); h.controller.complete();
  h.doc.hidden = true; h.doc.emit('visibilitychange');
  assert.equal(h.root.hidden, true); assert.equal(h.timers.size, 0);
});

test('changing system reduced-motion preference while loading is respected', () => {
  const h = harness();
  h.query.matches = true; h.query.emit('change');
  assert.equal(h.root.dataset.reduced, 'true');
  h.query.matches = false; h.query.emit('change');
  assert.equal(h.root.dataset.reduced, 'false');
  h.controller.dispose();
});

test('failure pauses motion, keeps an accessible retry action and default reload works', async () => {
  const h = harness();
  h.controller.fail(new Error('renderer initialization failed'));
  assert.equal(h.controller.getSnapshot().state, 'failed');
  assert.equal(h.node('progress').hidden, true);
  assert.equal(h.node('retry').hidden, false);
  assert.equal(h.node('retry').focused, true);
  assert.equal(h.root.dataset.paused, 'true');
  assert.equal(h.root.getAttribute('aria-busy'), 'false');
  h.node('retry').click();
  await Promise.resolve();
  assert.equal(h.reloads(), 1);
  assert.equal(h.controller.getSnapshot().state, 'loading');
  assert.equal(h.controller.getSnapshot().completed, 0);
  h.controller.dispose();
});

test('custom retry receives the controller, ignores repeated clicks, and rejected retries return to failure', async () => {
  let calls = 0, rejectRetry;
  const pending = new Promise((_, reject) => { rejectRetry = reject; });
  const h = harness({ onRetry(api) { calls++; assert.equal(api, h.controller); return pending; } });
  h.controller.fail('连接暂时中断');
  h.node('retry').click(); h.node('retry').click();
  assert.equal(calls, 1);
  rejectRetry(new Error('still offline'));
  await Promise.resolve(); await Promise.resolve();
  assert.equal(h.controller.getSnapshot().state, 'failed');
  assert.equal(h.node('retry').disabled, false);
  assert.equal(h.node('retry').hidden, false);
  h.controller.dispose();
});

test('dispose clears callbacks and timers, and remounting owns only one set of listeners', () => {
  const h = harness(); h.advance(900);
  h.controller.complete();
  h.controller.dispose();
  assert.equal(h.timers.size, 0);
  assert.equal(h.doc.listenerCount(), 0);
  assert.equal(h.query.listenerCount(), 0);
  assert.equal(h.node('retry').listenerCount(), 0);
  assert.equal(h.root.hidden, true);
  h.controller.update({ completed: 1 });
  assert.equal(h.controller.getSnapshot().state, 'disposed');
  const second = mountHouseLoading(h.root);
  const third = mountHouseLoading(h.root);
  assert.equal(second.getSnapshot().state, 'disposed');
  assert.equal(h.doc.listenerCount(), 1); assert.equal(h.query.listenerCount(), 1);
  third.dispose();
});

test('CSS limits keyframes to transform/opacity and provides explicit user/system motion guards', () => {
  const css = readFileSync(new URL('../src/ui/house-loading.css', import.meta.url), 'utf8');
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /data-reduced="true"/);
  assert.match(css, /animation-play-state:paused!important/);
  assert.doesNotMatch(css, /box-shadow|text-shadow/);
  const keyframes = [...css.matchAll(/@keyframes[^\n]+/g)].map(match => match[0]);
  assert.equal(keyframes.length, 4);
  for (const animation of keyframes) {
    const properties = [...animation.matchAll(/([a-z-]+):/g)].map(match => match[1]);
    assert.ok(properties.every(property => ['transform', 'opacity'].includes(property)), animation);
  }
});
