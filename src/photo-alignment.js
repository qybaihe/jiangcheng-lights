import * as THREE from 'three';
import {bendPoint, STREET_RADIUS} from './curved-world.js';

const freeze = Object.freeze;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const point = (x, y, z) => freeze({x, y, z});
const anchor = (id, title, x, y, z) => freeze({id, title, point: point(x, y, z)});
const challenge = value => freeze({...value, reference: freeze(value.reference), clues: freeze(value.clues), anchors: freeze(value.anchors), discovery: freeze(value.discovery.map(freeze))});
export const PHOTO_FRAME_ASPECT = 16 / 9;

/** The reference stills are captured from these actual first-person poses. They
 * are not generated CGs with geometry that the player cannot find in the world.
 * All coordinates are in the unbent simulation; projection below applies the
 * same spherical street mapping as the renderer before testing the camera. */
export const PHOTO_CHALLENGES = freeze({
  shop: challenge({
    id: 'shop', title: '门口留着的位置', subtitle: '旧照对景 · 陆记修理铺', number: '01',
    image: '/media/playful-life-v1/photo-shop.webp', imageAlt: '从巷口望向陆记修理铺，二楼木窗、招牌与门前修理桌在同一张旧照片里。',
    routeTarget: 'shop', location: '修理铺南侧的巷口', reference: {x: -12, y: .13, z: 23, yaw: -.10, pitch: .20, eyeHeight: 1.65, fov: 68},
    positionTolerance: 1.8, yawTolerance: .19, pitchTolerance: .15, anchorTolerance: .19,
    anchors: [anchor('sign', '陆记的木招牌', -13, 4.1, 15), anchor('window', '二楼左边的木窗', -16.05, 5.5, 14.9), anchor('desk', '门前那张修理桌', -12, .97, 17)],
    note: '照片背面只写了三个字：“留个位。”可桌边明明没有人。',
    clues: ['先认招牌：别站进屋檐下，退到修理铺南边的宽巷，朝铺子看。', '再看二楼：左边木窗在招牌的左上方。稍稍抬头，让两处位置和照片接近。', '最后看桌子：桌沿在照片下方。小步前后挪一挪，三处都亮起，再按快门。'],
    discovery: [{who: '阿遥', text: '原来照片里留的，是桌子旁边这个空位。'}, {who: '林婆婆', text: '你小时候就坐那儿写作业。谁来修东西，都绕开你那一摞本子。'}, {who: '阿遥', text: '我一直以为，是外公的铺子小。原来是大家，给我让了一点。'}],
    caption: '门口留着的位置｜修理桌旁的那一点空，不是忘了摆满，是有人等我回来。',
  }),
  river: challenge({
    id: 'river', title: '没拍全的江城', subtitle: '旧照对景 · 钟声与桥影', number: '02',
    image: '/media/playful-life-v1/photo-river.webp', imageAlt: '晴川里北端朝江面望去，江汉关钟面在左，长江大桥的桥头堡在右，近处是江边栏杆。',
    routeTarget: 'dock', location: '主巷北端向左几步，江边路口前', reference: {x: -6, y: .13, z: -18, yaw: -.35, pitch: .23, eyeHeight: 1.65, fov: 68},
    positionTolerance: 2.3, yawTolerance: .17, pitchTolerance: .14, anchorTolerance: .19,
    anchors: [anchor('clock', '左边的江汉关钟面', -30, 16.22, -36.8), anchor('bridge', '长江大桥的桥头堡', -4.0908809289, 14.23, -60.1038015046), anchor('rail', '江边栏杆的横线', -3.4, 1.75, -26)],
    note: '一张很宽的江景，背面却写着：“小孩站不住，又跑出去了。”',
    clues: ['沿主巷往江边走，在路口向左几步。别贴着栏杆站，江汉关应该完整地留在左边。', '把长江大桥的小桥头堡也留在右边。不是只对准钟面，试着让钟楼和桥影一起进画面。', '近处的栏杆在照片下方。把它和钟面、桥头堡一起比一比；三处都认出，就可以按快门。'],
    discovery: [{who: '阿遥', text: '这么好看的江，他怎么不再拍一张？'}, {who: '周伯', text: '你一跑，他就把相机放下了。怕你摔。'}, {who: '阿遥', text: '所以没拍进去的那个，也是这张照片的一部分。'}],
    caption: '没拍全的江城｜外公拍了一半的风景，另一半，他放下相机牵住了。',
  }),
});

const get = id => typeof id === 'string' && Object.hasOwn(PHOTO_CHALLENGES, id) ? PHOTO_CHALLENGES[id] : null;
const validPoint = p => Boolean(p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
const angle = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const validProjection = p => Boolean(p && [p.x, p.y, p.z].every(Number.isFinite));
const issuedResults = new WeakSet(), recordedResults = new WeakSet();

export function normalizePhotoProgress(value) {
  const completed = value && !Array.isArray(value) && Array.isArray(value.completed) ? value.completed : [];
  return {version: 1, completed: Object.keys(PHOTO_CHALLENGES).filter(id => completed.includes(id))};
}

/** Only an actual successful shutter in this session awards an entry. Hints,
 * simply walking into the region, and reconstructed UI flags award nothing. */
export function recordPhotoResult(value, result) {
  const next = normalizePhotoProgress(value);
  if (!result || !issuedResults.has(result) || recordedResults.has(result) || !get(result.photoId)) return next;
  if (!next.completed.includes(result.photoId)) next.completed.push(result.photoId);
  recordedResults.add(result);
  return normalizePhotoProgress(next);
}

export function createPhotoReferenceCamera(id, aspect = PHOTO_FRAME_ASPECT) {
  const c = get(id); if (!c) throw new RangeError(`Unknown photo: ${String(id)}`);
  const p = c.reference, camera = new THREE.PerspectiveCamera(p.fov, Number.isFinite(aspect) && aspect > 0 ? aspect : PHOTO_FRAME_ASPECT, .06, 380);
  camera.position.set(p.x, p.y + p.eyeHeight, p.z); camera.rotation.set(p.pitch, -p.yaw, 0, 'YXZ'); camera.updateMatrixWorld(true);
  return camera;
}

/** NDC x is normalized to the reference image aspect, not stretched to the
 * user's monitor. Both 16:10 and ultrawide displays therefore match the same
 * physical shot. The caller's camera and matrices are never mutated. */
export function projectPhotoAnchors(id, camera, {center, radius = STREET_RADIUS, enabled = true, pointTransform} = {}) {
  const c = get(id); if (!c || !camera?.isCamera || !center || !Number.isFinite(center.x) || !Number.isFinite(center.z)) return [];
  return c.anchors.map(item => {
    const p = new THREE.Vector3(item.point.x, item.point.y, item.point.z);
    const rendered = pointTransform ? pointTransform(p, new THREE.Vector3()) : bendPoint(p, center, enabled ? radius : Infinity);
    const ndc = rendered.clone().project(camera);
    return {id: item.id, x: ndc.x * camera.aspect / PHOTO_FRAME_ASPECT, y: ndc.y, z: ndc.z,
      visible: ndc.z >= -1 && ndc.z <= 1 && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1};
  });
}

const references = Object.fromEntries(Object.values(PHOTO_CHALLENGES).map(c => [c.id, freeze(projectPhotoAnchors(c.id, createPhotoReferenceCamera(c.id), {center: c.reference}).map(freeze))]));
export function getPhotoReferenceAnchors(id) { return get(id) ? references[id].map(item => ({...item})) : []; }

/** Bridge from the live scene to a detached, pure assessment. Call after the
 * world's camera/curvature update each frame. No sample is trusted solely for
 * being near the reference: all three rendered anchors and camera angles count. */
export function samplePhotoWorld(world, id) {
  const c = get(id), p = world?.player?.position, camera = world?.camera;
  if (!c || !validPoint(p) || !camera?.isCamera) return {};
  const direction = camera.getWorldDirection(new THREE.Vector3());
  return {position: {x: p.x, y: p.y, z: p.z}, yaw: Math.atan2(direction.x, -direction.z), pitch: Math.asin(clamp(direction.y, -1, 1)),
    mode: world.cameraMode, vehicle: world.propInteractions?.mode ?? 'walk', paused: Boolean(world.suspended || world.blocked || world.conversation),
    anchors: projectPhotoAnchors(id, camera, {center: world.curvedWorld?.center ?? p, radius: world.curvedWorld?.radius ?? STREET_RADIUS,
      enabled: world.curvedWorld?.enabled !== false, pointTransform: world.curvedWorld?.point ? (point, out) => world.curvedWorld.point(point, out) : undefined})};
}

export function evaluatePhotoAlignment(id, sample = {}) {
  const c = get(id); if (!c) throw new RangeError(`Unknown photo: ${String(id)}`);
  sample = sample && typeof sample === 'object' && !Array.isArray(sample) ? sample : {};
  const valid = validPoint(sample.position) && Number.isFinite(sample.yaw) && Number.isFinite(sample.pitch);
  const distance = valid ? Math.hypot(sample.position.x - c.reference.x, sample.position.z - c.reference.z) : Infinity;
  const heightError = valid ? Math.abs(sample.position.y - c.reference.y) : Infinity;
  const yawError = valid ? angle(sample.yaw, c.reference.yaw) : Infinity, pitchError = valid ? Math.abs(sample.pitch - c.reference.pitch) : Infinity;
  const inPosition = distance <= c.positionTolerance && heightError <= .65;
  const facing = yawError <= c.yawTolerance && pitchError <= c.pitchTolerance;
  const active = sample.mode === 'first' && sample.vehicle === 'walk' && sample.paused !== true;
  const observed = Array.isArray(sample.anchors) ? sample.anchors : [];
  const anchors = c.anchors.map((item, index) => {
    const current = observed.find(p => p?.id === item.id), expected = references[id][index];
    const visible = validProjection(current) && current.visible === true && current.z >= -1 && current.z <= 1;
    const error = visible ? Math.hypot(current.x - expected.x, current.y - expected.y) : Infinity;
    return {id: item.id, title: item.title, recognized: active && distance <= c.positionTolerance * 3 && visible && error <= c.anchorTolerance,
      error, visible, target: {x: expected.x, y: expected.y}, current: validProjection(current) ? {x: current.x, y: current.y} : null};
  });
  const recognizedCount = anchors.filter(a => a.recognized).length, ready = active && inPosition && facing && recognizedCount === c.anchors.length;
  const positionScore = clamp(1 - distance / (c.positionTolerance * 4), 0, 1);
  const aimScore = clamp(1 - (yawError + pitchError) / .9, 0, 1);
  const match = Math.round(clamp((recognizedCount / c.anchors.length * .55 + positionScore * .25 + aimScore * .20), 0, 1) * 100);
  let message = '沿着照片里的线索，慢慢找找。';
  if (!active) message = sample.vehicle && sample.vehicle !== 'walk' ? '先停好车，站到街巷里再核对。' : '回到第一人称的街巷视角，再继续对景。';
  else if (!inPosition) message = distance > 12 ? `先去${c.location}，不要只在原地转镜头。` : '地方已经很近了。小步前后左右挪一挪，找回照片的站位。';
  else if (!facing || recognizedCount < 3) message = `已认出 ${recognizedCount} / 3 处。拖动画面，让窗、招牌或桥影回到照片的位置。`;
  else message = '三处线索都对上了。按下快门，收好这一刻。';
  return {photoId: id, valid, ready, inPosition, facing, distance, heightError, yawError, pitchError, recognizedCount, anchors, match, message};
}

export function createPhotoAlignmentSession(id) {
  const c = get(id); if (!c) throw new RangeError(`Unknown photo: ${String(id)}`);
  let status = 'aligning', hintLevel = 0, attempts = 0, evaluation = evaluatePhotoAlignment(id), result = null, feedback = '', cancelReason = null;
  const snapshot = () => ({photoId: id, status, hintLevel, attempts, evaluation: {...evaluation, anchors: evaluation.anchors.map(a => ({...a, target: {...a.target}, current: a.current ? {...a.current} : null}))}, result, feedback, cancelReason});
  return {
    snapshot,
    update(sample) { if (status === 'aligning') evaluation = evaluatePhotoAlignment(id, sample); return snapshot(); },
    hint() { if (status === 'aligning') hintLevel = Math.min(c.clues.length, hintLevel + 1); return snapshot(); },
    shutter(sample) {
      if (status !== 'aligning') return snapshot();
      // Always resample: a once-green HUD is not permission to walk away and win.
      evaluation = evaluatePhotoAlignment(id, sample); attempts++;
      if (!evaluation.ready) {feedback = evaluation.message; return snapshot();}
      status = 'finished'; feedback = '认出的是风景，找回的是那时的人。';
      result = freeze({photoId: id, status: 'finished', verified: true, anchorCount: c.anchors.length}); issuedResults.add(result);
      return snapshot();
    },
    cancel(reason = 'player-cancelled') { if (status === 'aligning') {status = 'cancelled'; cancelReason = String(reason);} return snapshot(); },
  };
}
