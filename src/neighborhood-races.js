/** Small, optional neighbourhood time trials. No story flag, supplies or ending
 * state is read or written here. A finished result comes from a real ordered
 * traversal in this session, never from an invitation or a restored UI state. */
const freeze = Object.freeze;
const line = (who, text) => freeze({who, text});
const checkpoint = (x, z, label, radius = 3.0) => freeze({x, z, label, radius});
const course = value => freeze({...value, start: freeze(value.start), checkpoints: freeze(value.checkpoints), intro: freeze(value.intro), controls: freeze(value.controls.map(freeze))});

export const RACE_COURSES = freeze({
 boat: course({
  id: 'boat', title: '近岸桨影', mode: 'boat', subtitle: '把江风划成一张明信片',
  start: {x: 42, z: -38.3, radius: 5}, anchor: freeze({x: 35, z: -21.8}),
  checkpoints: [
   checkpoint(61, -39, '沿着青绿浮标向东'),
   checkpoint(81, -39, '桥影映在水上'),
   checkpoint(97, -41, '东侧慢慢转弯'),
   checkpoint(95, -51, '沿近岸线折返'),
   checkpoint(77, -52, '江风送你回程'),
   checkpoint(57, -52, '看见来时的码头'),
   checkpoint(43, -49, '向岸边收桨'),
   checkpoint(43, -39.5, '回到出发的桨影'),
  ],
  parSeconds: 52, silverSeconds: 72, timeLimitSeconds: 115, maxSpeed: 5.4,
  intro: [
   line('周伯', '以前过江赶轮渡，听见汽笛，脚步就快了。今天不赶那一班。'),
   line('阿遥', '那我们比什么？'),
   line('周伯', '比谁把这一小圈划得顺。认青绿浮标，回来我给你留个船票戳。'),
  ],
  finishText: '桨停下来，桥影又合在了一起。周伯给纪念票盖了个章：“不急，江一直在这里。”',
  caption: '近岸桨影｜不是赶船的一天，江风也能带我回家。',
  routeHint: '在老巷码头借桨舟，沿青绿浮标绕近岸一圈，回到起点。',
  controls: [{keys: ['W', 'S'], label: '划动 / 减速、倒划'}, {keys: ['A', 'D'], label: '转向'}, {keys: ['F'], label: '收桨返岸'}],
 }),
 car: course({
  id: 'car', title: '江城顺路赛', mode: 'car', subtitle: '过早的热气，绕一圈还在',
  start: {x: 54, z: 23, radius: 5.3}, anchor: freeze({x: 54, z: 23}),
  checkpoints: [
   checkpoint(76, 23, '从燕归路向桥影驶去', 3.4),
   checkpoint(99, 23, '轮渡回车路 · 向江边转', 3.4),
   checkpoint(99, 1, '沿回车路前行', 3.4),
   checkpoint(99, -21, '滨江路 · 向西转', 3.4),
   checkpoint(73.5, -21, '桥影下 · 转向南侧', 3.1),
   checkpoint(73.5, 1, '桥下慢行，留意转弯', 2.1),
   checkpoint(73.5, 22.5, '燕归路 · 向家门口转', 2.1),
   checkpoint(54, 23, '回到街坊的热气里', 3.4),
  ],
  parSeconds: 58, silverSeconds: 78, timeLimitSeconds: 120, maxSpeed: 8.6,
  intro: [
   line('蔡姨', '早先送豆皮，总有人问，顺路能不能捎一份。'),
   line('阿遥', '这一圈，能经过多少户人家？'),
   line('蔡姨', '走燕归路，绕到渡口，再从桥下回来。我们记个时间，不催你，拐弯慢一点。'),
  ],
  finishText: '车停稳了，蔡姨把纸袋递过来：“不是奖励。怕你光顾着开车，还没过早。”',
  caption: '江城顺路赛｜绕过桥影和渡口，街坊还给我留着一口热的。',
  routeHint: '驾车到燕归路的起点，沿宽路经过桥影与渡口，再从桥下回到街坊。',
  controls: [{keys: ['W', 'S'], label: '前进 / 减速、倒车'}, {keys: ['A', 'D'], label: '转向'}, {keys: ['F'], label: '停车下车，退出计时'}],
 }),
});

const ids = Object.keys(RACE_COURSES);
const getCourse = id => typeof id === 'string' && Object.hasOwn(RACE_COURSES, id) ? RACE_COURSES[id] : null;
const validPoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.z);
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const medalFor = (c, seconds) => seconds <= c.parSeconds ? 'gold' : seconds <= c.silverSeconds ? 'silver' : 'bronze';
const minimumSeconds = c => c.checkpoints.reduce((sum, cp, index) => {
 const prev = index ? c.checkpoints[index - 1] : c.start;
 return sum + Math.max(0, distance(prev, cp) - prev.radius - cp.radius) / c.maxSpeed;
}, 0);
const validSeconds = (seconds, c) => Number.isFinite(seconds) && seconds >= minimumSeconds(c) && seconds <= c.timeLimitSeconds;
const blankRecord = () => ({completions: 0, bestSeconds: null, lastSeconds: null, bestMedal: null});

/** Only canonical, detached optional progress survives a save. Timing/camera/
 * checkpoint state does not: reloading always returns to free exploration. */
export function normalizeRaceProgress(value) {
 const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
 const source = input.courses && typeof input.courses === 'object' && !Array.isArray(input.courses) ? input.courses : {};
 const courses = {};
 for (const id of ids) {
  const c = RACE_COURSES[id], old = source[id];
  if (!old || !Number.isSafeInteger(old.completions) || old.completions < 1 || !validSeconds(old.bestSeconds, c)) {
   courses[id] = blankRecord(); continue;
  }
  const lastSeconds = validSeconds(old.lastSeconds, c) ? old.lastSeconds : old.bestSeconds;
  const bestSeconds = Math.min(old.bestSeconds, lastSeconds);
  courses[id] = {completions: Math.min(9999, old.completions), bestSeconds, lastSeconds, bestMedal: medalFor(c, bestSeconds)};
 }
 return {version: 1, courses};
}

// Object identity is intentionally not serializable. A caller cannot award a
// completion by constructing {verified:true}; actual saved progress is separate.
const issuedResults = new WeakSet();
const recordedResults = new WeakSet();
export function recordRaceResult(value, result) {
 const next = normalizeRaceProgress(value);
 if (!result || !issuedResults.has(result) || recordedResults.has(result)) return next;
 const c = getCourse(result.courseId);
 if (!c || result.status !== 'finished' || result.checkpoints !== c.checkpoints.length || !validSeconds(result.elapsed, c)) return next;
 const previous = next.courses[c.id], bestSeconds = previous.bestSeconds === null ? result.elapsed : Math.min(previous.bestSeconds, result.elapsed);
 next.courses[c.id] = {completions: Math.min(9999, previous.completions + 1), bestSeconds, lastSeconds: result.elapsed, bestMedal: medalFor(c, bestSeconds)};
 recordedResults.add(result);
 return next;
}

export function raceAvailability(state, courseId) {
 const c = getCourse(courseId);
 if (!c) return {available: false, title: '这项活动还没有开放', detail: '先去码头划桨，或到燕归路看看街坊的邀请。'};
 const flags = Array.isArray(state?.flags) ? state.flags : [];
 if (state?.runEnded) return {available: false, title: '这一趟行程已经结束', detail: '先完成告别，或从画廊保存的分岔点重新出发。'};
 if ((flags.includes('prepared') || flags.includes('checked')) && !flags.includes('postlude')) return {
  available: false, title: '晚间预警 · 街坊活动暂停',
  detail: c.mode === 'boat' ? '码头已经收桨。先把街坊的安排核好，确认复航后再来。' : '把路让给社区的安排。先照应街坊，雨后的活动再慢慢玩。',
 };
 return {available: true, title: flags.includes('postlude') ? '雨后重开 · 街坊邀请' : '晴日邀请 · 街坊小赛',
  detail: `${c.routeHint} 这是一项独立小赛，完成后留下成绩与纪念，不代替送物、互助或结局选择。`};
}

function segmentTouchesCircle(a, b, circle) {
 const dx = b.x - a.x, dz = b.z - a.z, lengthSquared = dx * dx + dz * dz;
 const t = lengthSquared ? Math.max(0, Math.min(1, ((circle.x - a.x) * dx + (circle.z - a.z) * dz) / lengthSquared)) : 0;
 return Math.hypot(a.x + dx * t - circle.x, a.z + dz * t - circle.z) <= circle.radius;
}

/** Caller supplies logical world position in metres, dt in seconds and current
 * vehicle mode. Pause also pauses time; moving a vehicle while paused is not a
 * way to pass checkpoints. Every update admits at most one ordered gate. */
export function createRaceSession(courseId) {
 const c = getCourse(courseId);
 if (!c) throw new RangeError(`Unknown race course: ${String(courseId)}`);
 let status = 'countdown', countdown = 3, elapsed = 0, nextIndex = 0, previous = null, result = null, cancelReason = null, paused = false;
 const snapshot = () => ({courseId: c.id, mode: c.mode, status, paused, countdown, elapsed,
  nextCheckpointIndex: nextIndex, checkpointsPassed: nextIndex, checkpointCount: c.checkpoints.length,
  nextCheckpoint: status === 'countdown' || status === 'running' ? {...c.checkpoints[nextIndex]} : null,
  result, cancelReason});
 const cancel = (reason = 'player-cancelled') => {
  if (status !== 'finished' && status !== 'cancelled') {status = 'cancelled'; cancelReason = String(reason); paused = false;}
  return snapshot();
 };
 return {
  snapshot,
  cancel,
  update(dt, sample = {}) {
   if (status === 'finished' || status === 'cancelled') return snapshot();
   if (sample.mode !== c.mode) return cancel('vehicle-left');
   if (!validPoint(sample)) return cancel('position-invalid');
   paused = sample.paused === true;
   if (paused) return snapshot();
   // Browser sleep/lost capture is not a lower time: resume by starting afresh.
   if (!Number.isFinite(dt) || dt < 0 || dt > 1) return cancel('time-gap');
   if (dt === 0) return snapshot();
   const position = {x: sample.x, z: sample.z};
   if (!previous) {
    if (distance(position, c.start) > c.start.radius) return cancel('outside-start');
    previous = position;
   }
   if (distance(previous, position) > c.maxSpeed * dt + .55) return cancel('position-jump');
   if (status === 'countdown') {
    if (distance(position, c.start) > c.start.radius) return cancel('early-start');
    const used = Math.min(countdown, dt); countdown = Math.max(0, countdown - used); dt -= used;
    previous = position;
    if (countdown > 1e-9) return snapshot();
    countdown = 0; status = 'running';
   }
   elapsed += dt;
   if (elapsed > c.timeLimitSeconds) return cancel('time-limit');
   const gate = c.checkpoints[nextIndex];
   if (dt > 0 && segmentTouchesCircle(previous, position, gate)) nextIndex++;
   previous = position;
   if (nextIndex === c.checkpoints.length) {
    if (!validSeconds(elapsed, c)) return cancel('invalid-traversal');
    status = 'finished'; paused = false;
    result = freeze({courseId: c.id, status: 'finished', elapsed, medal: medalFor(c, elapsed),
     checkpoints: nextIndex, checkpointCount: c.checkpoints.length, verified: true});
    issuedResults.add(result);
   }
   return snapshot();
  },
 };
}
