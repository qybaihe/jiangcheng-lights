import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NEWSPAPER_EDITIONS } from '../src/newspaper-data.js';

const editions = Object.values(NEWSPAPER_EDITIONS);
const count = value => [...value].length;

test('two stable, clearly fictional editions carry exactly three briefs and one advert', () => {
  assert.deepEqual(Object.keys(NEWSPAPER_EDITIONS), ['beforeRain', 'afterRain']);
  assert.deepEqual(editions.map(value => value.id), ['qingchuan-before-rain', 'qingchuan-after-rain']);
  assert.match(NEWSPAPER_EDITIONS.beforeRain.issueLabel, /雨前/);
  assert.match(NEWSPAPER_EDITIONS.afterRain.issueLabel, /雨后/);
  for (const value of editions) {
    assert.equal(value.title, '晴川里街坊小报');
    assert.match(value.fictionNotice, /游戏内虚构/);
    assert.match(value.fictionNotice, /非真实新闻/);
    assert.equal(value.news.length, 3);
    assert.ok(value.advert && !Array.isArray(value.advert));
    assert.equal(typeof value.evidenceHint, 'string');
    assert.ok(value.evidenceHint.length > 0 && count(value.evidenceHint) <= 70);
  }
});

test('headlines and reading paragraphs stay short, and every article has a unique stable id', () => {
  const entries = editions.flatMap(value => [value, ...value.news, value.advert]);
  assert.equal(new Set(entries.map(value => value.id)).size, entries.length);
  for (const value of entries) {
    assert.match(value.id, /^[a-z][a-z0-9-]+$/);
    assert.ok(count(value.headline) > 0 && count(value.headline) <= 28, value.id);
    assert.ok(count(value.deck) > 0 && count(value.deck) <= 48, value.id);
    assert.ok(Array.isArray(value.body) && value.body.length >= 1 && value.body.length <= 2, value.id);
    for (const paragraph of value.body) {
      assert.equal(typeof paragraph, 'string');
      assert.ok(count(paragraph) > 0 && count(paragraph) <= 100, value.id);
    }
  }
  for (const value of editions) {
    const reading = [value.headline, value.deck, ...value.body, value.evidenceHint,
      ...[...value.news, value.advert].flatMap(item => [item.headline, item.deck, ...item.body])].join('');
    assert.ok(count(reading) < 900, value.id);
  }
});

test('paper content remains JSON-safe immutable data without task flags, actions or unlock rewards', () => {
  const prohibited = new Set(['flag', 'flags', 'action', 'actions', 'reward', 'rewards', 'unlock', 'unlocks', 'requires', 'supplies', 'storyChoices']);
  function inspect(value) {
    if (typeof value === 'string') return;
    assert.ok(value && typeof value === 'object');
    assert.ok(Object.isFrozen(value));
    for (const [key, child] of Object.entries(value)) {
      assert.equal(prohibited.has(key), false, key);
      inspect(child);
    }
  }
  inspect(NEWSPAPER_EDITIONS);
  assert.deepEqual(JSON.parse(JSON.stringify(NEWSPAPER_EDITIONS)), NEWSPAPER_EDITIONS);
  const source = readFileSync(new URL('../src/newspaper-data.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bimport\b|localStorage|addFlag|dispatch\s*\(|act\s*\(/);
});

test('briefs do not impersonate dated news or claim rain automatically restarts ferries', () => {
  const all = JSON.stringify(NEWSPAPER_EDITIONS);
  assert.doesNotMatch(all, /\d{4}年|\d{1,2}月\d{1,2}日|\d{1,2}:\d{2}|新华社|央视|武汉晚报|长江日报/);
  assert.match(NEWSPAPER_EDITIONS.beforeRain.news[2].body.join(''), /不刊固定班次/);
  assert.match(NEWSPAPER_EDITIONS.afterRain.news[2].body.join(''), /现场确认|停航/);
  assert.match(NEWSPAPER_EDITIONS.afterRain.news[0].body.join(''), /低处和配电箱附近仍保持绕行/);
});

test('optional hints preserve the living grandfather and leave the ending reveal to the main story', () => {
  const all = JSON.stringify(NEWSPAPER_EDITIONS);
  assert.doesNotMatch(all, /外公.{0,12}(去世|遗愿|遗书|忌日|在天上)|真结局|完美结局|必须读|收集本报/);
  const early = JSON.stringify(NEWSPAPER_EDITIONS.beforeRain);
  assert.doesNotMatch(early, /重新开门|重新开张|那天你也在|原来是街坊|都是来帮忙|三个人帮外公|铺子重新/);
  assert.match(all, /过早|豆皮|热干面/);
  assert.match(all, /轮渡/);
  assert.match(all, /旧修理铺/);
});
