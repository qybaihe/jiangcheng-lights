import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as races from '../src/neighborhood-races.js';
import {freshState, loadState, SAVE_KEY} from '../src/story.js';
import {collectGallery, loadGallery, resolveEnding, recordEnding, resumeEndingFork, galleryItems} from '../src/endings.js';

/** Controller tests execute the actual production function with its real race,
 * story and gallery modules. Only DOM, render views and the clock are fakes.
 * These position samples are unit fixtures, never capture footage or saves. */
const productionSource = fs.readFileSync(new URL('../src/neighborhood-activities.js', import.meta.url), 'utf8')
 .replace(/^import[^\n]*\n/gm, '').replace('export function createNeighborhoodActivities', 'function createNeighborhoodActivities');
const factoryNames = ['RACE_COURSES', 'createRaceSession', 'normalizeRaceProgress', 'recordRaceResult', 'raceAvailability', 'createRaceMarkers', 'mountRaceHUD', 'raceInvitationMarkup', 'raceResultMarkup', 'document', 'window', 'performance'];
const compile = new Function(...factoryNames, `${productionSource}\nreturn createNeighborhoodActivities;`);
class FakeElement {
 constructor() {this.children = []; this.hidden = false; this.dataset = {}; this.handlers = {}; this.queries = new Map(); this.classList = {add() {}, remove() {}};}
 focus() {this.focused = true;}
 append(node) {this.children.push(node); node.parent = this;}
 remove() {if (this.parent) this.parent.children = this.parent.children.filter(n => n !== this);}
 addEventListener(name, fn) {this.handlers[name] = fn;}
 removeEventListener(name, fn) {if (this.handlers[name] === fn) delete this.handlers[name];}
 querySelector(selector) {if (!this.queries.has(selector)) this.queries.set(selector, new FakeElement()); return this.queries.get(selector);}
 querySelectorAll(selector) {return [this.querySelector(selector)];}
 dispatch(name) {this.handlers[name]?.();}
}
function storage() {const values = new Map(); return {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)};}
function harness(id = 'boat') {
 const state = freshState(), store = storage(), document = new FakeElement(), window = new FakeElement(), overlay = new FakeElement();
 document.body = new FakeElement(); document.hidden = false; document.createElement = () => new FakeElement(); document.getElementById = () => overlay;
 const parent = new FakeElement(); let now = 0, modal = null, api, saved = 0, collected = 0, released = 0, markerUpdates = 0, lastHUD = null;
 let mode = id, position = {...races.RACE_COURSES[id].start}; const messages = [], sounds = [], panels = [], routes = [];
 const world = {active: true, blocked: false, path: [], player: {position},
  getPropState: () => ({mode, boatPosition: {...position}, carId: 'car-fixture', cars: [{id: 'car-fixture', ...position}]}),
  endPropInteraction() {mode = 'walk'; return {ok: true};},
  startPropInteraction() {mode = 'boat'; position = {...races.RACE_COURSES.boat.start}; return {ok: true};},
 };
 const create = compile(races.RACE_COURSES, races.createRaceSession, races.normalizeRaceProgress, races.recordRaceResult, races.raceAvailability,
  () => ({update() {markerUpdates++;}, clear() {}, dispose() {}}),
  () => ({update(s) {lastHUD = s;}, dispose() {}}), () => '', () => '', document, window, {now: () => now});
 const closeModal = () => {modal = null; world.blocked = false; api?.afterModal();};
 const panel = (title, subtitle, content, cls) => {api?.beforeModal('panel', cls); modal = 'panel'; world.blocked = true; panels.push({title, cls}); return true;};
 api = create({world, parent, getState: () => state, isModal: () => modal, panel, closeModal,
  save: () => {saved++; store.setItem(SAVE_KEY, JSON.stringify(state));},
  collect: () => {collected++; collectGallery(state, store);}, toast: text => messages.push(text),
  releaseInputs: () => {released++;}, onRoute: target => routes.push(target), onStopGuidance() {}, onSound: sound => sounds.push(sound),
 });
 const step = (dt = .1) => {now += dt * 1000; api.update(); return api.snapshot();};
 const countdown = () => {for (let i = 0; i < 30; i++) step(); assert.equal(api.snapshot()?.status, 'running');};
 const moveTo = (target, speed = 4) => {
  const start = {...position}, length = Math.hypot(target.x - start.x, target.z - start.z), steps = Math.max(1, Math.ceil(length / (speed * .1)));
  for (let i = 1; i <= steps; i++) {position = {x: start.x + (target.x - start.x) * i / steps, z: start.z + (target.z - start.z) * i / steps}; step();}
 };
 return {api, world, state, store, document, window, messages, sounds, panels, routes, step, countdown, moveTo, closeModal,
  openMap() {api.beforeModal('panel', 'scrim map-panel'); modal = 'panel'; world.blocked = true;},
  openStory() {api.beforeModal('story', 'story-overlay'); modal = 'story'; world.blocked = true;},
  changeMode(value) {mode = value;}, setPosition(value) {position = {...value};},
  get saved() {return saved;}, get collected() {return collected;}, get released() {return released;}, get lastHUD() {return lastHUD;}, get markerUpdates() {return markerUpdates;},
 };
}
function run(h, id) {h.api.begin(id); h.countdown(); for (const cp of races.RACE_COURSES[id].checkpoints) h.moveTo(cp);}

test('controller requires a real matching vehicle near the course start before counting down', () => {
 const h = harness(); h.changeMode('walk'); h.api.begin('boat'); assert.equal(h.api.active(), false); assert.equal(h.saved, 0);
 h.changeMode('boat'); h.setPosition({x: 80, z: -45}); h.api.begin('boat'); assert.equal(h.api.active(), false);
 h.setPosition(races.RACE_COURSES.boat.start); h.api.begin('boat'); assert.equal(h.api.snapshot().status, 'countdown'); assert.equal(h.world.blocked, true);
 h.api.dispose();
});

test('three-second controller countdown blocks vehicle input, then unblocks driving', () => {
 const h = harness('car'); h.api.begin('car'); const released = h.released;
 for (let i = 0; i < 29; i++) h.step(); assert.equal(h.world.blocked, true); assert.equal(h.api.locked(), true);
 h.step(); assert.equal(h.world.blocked, false); assert.equal(h.api.locked(), false); assert.ok(h.released >= released);
 assert.equal(h.state.races.courses.car.completions, 0); h.api.dispose();
});

test('opening and closing the map freezes clock and keeps the activity deliberately paused', () => {
 const h = harness(); h.api.begin('boat'); h.countdown(); h.step(.2); const elapsed = h.api.snapshot().elapsed;
 h.openMap(); for (let i = 0; i < 100; i++) h.step();
 assert.equal(h.api.snapshot().elapsed, elapsed); assert.equal(h.api.snapshot().paused, true); assert.equal(h.world.blocked, true);
 h.closeModal(); assert.equal(h.world.blocked, true); assert.equal(h.api.snapshot().paused, true);
 h.api.setPaused(false); h.step(.1); assert.ok(h.api.snapshot().elapsed > elapsed); assert.equal(h.world.blocked, false);
 assert.equal(h.saved, 0); assert.equal(h.collected, 0); h.api.dispose();
});

test('blur and page hiding pause both vehicle movement and clock until explicit resume', () => {
 const h = harness('car'); h.api.begin('car'); h.countdown(); h.window.dispatch('blur'); const before = h.api.snapshot().elapsed;
 h.step(15); assert.equal(h.api.snapshot().elapsed, before); assert.equal(h.world.blocked, true);
 h.api.setPaused(false); h.step(); h.document.hidden = true; h.document.dispatch('visibilitychange'); const hiddenAt = h.api.snapshot().elapsed;
 h.step(30); assert.equal(h.api.snapshot().elapsed, hiddenAt); h.document.hidden = false; h.document.dispatch('visibilitychange');
 assert.equal(h.api.snapshot().paused, true); assert.equal(h.world.blocked, true); h.api.dispose();
});

test('story dialog, explicit exit, leaving a vehicle and returning home never award race progress', () => {
 for (const exit of [h => h.openStory(), h => h.api.cancel(), h => {h.changeMode('walk'); h.step();}, h => {h.world.active = false; h.step();}]) {
  const h = harness(); h.api.begin('boat'); h.countdown(); h.moveTo(races.RACE_COURSES.boat.checkpoints[0]); assert.equal(h.api.snapshot().checkpointsPassed, 1);
  exit(h); assert.equal(h.api.active(), false); assert.equal(h.api.snapshot(), null); assert.equal(h.saved, 0); assert.equal(h.collected, 0);
  assert.deepEqual(h.state.races, races.normalizeRaceProgress()); assert.deepEqual(loadGallery(h.store).unlocked, {}); h.api.dispose();
 }
});

test('weather closure returns the rowboat to land and saves no completion', () => {
 const h = harness(); h.api.begin('boat'); h.countdown(); h.state.flags.push('prepared'); h.step();
 assert.equal(h.world.getPropState().mode, 'walk'); assert.equal(h.api.active(), false); assert.equal(h.state.races.courses.boat.completions, 0);
 assert.equal(h.collected, 0); assert.equal(h.saved, 1); assert.deepEqual(loadGallery(h.store).unlocked, {}); h.api.dispose();
});

test('complete boat and car runs each unlock exactly their new artwork, not ending CGs or main-story flags', () => {
 const h = harness(), storyBefore = {flags: [...h.state.flags], supplies: [...h.state.supplies], lore: [...h.state.lore], storyChoices: {...h.state.storyChoices}};
 run(h, 'boat'); assert.equal(h.api.snapshot(), null); assert.equal(h.state.races.courses.boat.completions, 1);
 assert.deepEqual(Object.keys(loadGallery(h.store).unlocked), ['race-boat']); assert.deepEqual(loadGallery(h.store).endings, {});
 h.closeModal(); h.changeMode('car'); h.setPosition(races.RACE_COURSES.car.start); run(h, 'car');
 assert.deepEqual(Object.keys(loadGallery(h.store).unlocked).sort(), ['race-boat', 'race-car']); assert.deepEqual(loadGallery(h.store).endings, {});
 assert.equal(h.state.races.courses.car.completions, 1); assert.equal(h.saved, 2); assert.equal(h.collected, 2);
 assert.deepEqual({flags: h.state.flags, supplies: h.state.supplies, lore: h.state.lore, storyChoices: h.state.storyChoices}, storyBefore);
 const items = galleryItems(h.state, h.store); assert.equal(items.filter(i => i.type === 'ending' && i.unlocked).length, 0);
 h.api.dispose();
});

test('earned optional records survive the original story save and old saves get detached defaults', () => {
 const h = harness(); run(h, 'boat'); const restored = loadState(h.store);
 assert.deepEqual(restored.races, h.state.races); assert.equal(restored.races.mode, undefined); assert.equal(restored.races.session, undefined);
 const legacy = freshState(); delete legacy.races; const restoredLegacy = loadState({getItem: () => JSON.stringify(legacy)});
 assert.deepEqual(restoredLegacy.races, races.normalizeRaceProgress()); const newer = freshState(); newer.races.courses.boat.completions = 8;
 assert.equal(restoredLegacy.races.courses.boat.completions, 0); h.api.dispose();
});

test('all four ending decisions remain identical when optional race progress is present', () => {
 const h = harness(); run(h, 'boat');
 for (const [flags, choice] of [[['checked', 'towel'], {stay: 'breakfast'}], [['checked'], {stay: 'breakfast'}], [[], {stay: 'leave'}], [[], {commitment: 'help', stay: 'leave'}]]) {
  const base = {...freshState(), flags, storyChoices: choice}; assert.equal(resolveEnding({...base, races: h.state.races}).id, resolveEnding(base).id);
 }
 h.api.dispose();
});

test('ending-fork restore keeps only optional records earned before the fork while gallery remains collected', () => {
 const h = harness(); run(h, 'boat'); const fork = structuredClone(h.state); h.closeModal();
 h.changeMode('car'); h.setPosition(races.RACE_COURSES.car.start); run(h, 'car');
 h.state.endingFork = fork; h.state.storyChoices.stay = 'leave'; recordEnding(resolveEnding(h.state), h.state, h.store);
 const restored = loadState({getItem: () => JSON.stringify(resumeEndingFork(h.store, 'neutral'))});
 assert.equal(restored.races.courses.boat.completions, 1); assert.equal(restored.races.courses.car.completions, 0);
 assert.ok(loadGallery(h.store).unlocked['race-car']); assert.ok(loadGallery(h.store).unlocked['race-boat']); h.api.dispose();
});

test('controller dispose cancels cleanly and removes listeners without side effects', () => {
 const h = harness(); h.api.begin('boat'); h.countdown(); h.api.dispose();
 assert.equal(h.api.active(), false); assert.deepEqual(h.window.handlers, {}); assert.deepEqual(h.document.handlers, {});
 assert.equal(h.saved, 0); assert.equal(h.collected, 0);
});

test('a foreground frame interruption cancels instead of shortening time, with readable Chinese feedback', () => {
 const h = harness(); h.api.begin('boat'); h.countdown(); h.step(3);
 assert.equal(h.api.active(), false); assert.equal(h.saved, 0); assert.equal(h.collected, 0);
 assert.match(h.messages.at(-1), /画面中断|起点/); assert.doesNotMatch(h.messages.at(-1), /time-gap|position-jump/); h.api.dispose();
});

test('a discontinuous real-position sample cannot unlock artwork through the controller', () => {
 const h = harness('car'); h.api.begin('car'); h.countdown(); h.setPosition(races.RACE_COURSES.car.checkpoints[0]); h.step(.016);
 assert.equal(h.api.active(), false); assert.equal(h.state.races.courses.car.completions, 0); assert.equal(h.collected, 0);
 assert.match(h.messages.at(-1), /位置|起点/); assert.deepEqual(loadGallery(h.store).unlocked, {}); h.api.dispose();
});
