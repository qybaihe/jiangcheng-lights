import {vehicleGuideKind} from '../vehicle-guide-progress.js';

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const actionKeys = new Set(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','f','e','g','v','m','j']);

const spokeWheel = (x, y, radius) => `<g class="vehicle-guide-wheel"><circle cx="${x}" cy="${y}" r="${radius}"/><circle class="vehicle-guide-rim" cx="${x}" cy="${y}" r="${radius-5}"/>${Array.from({length:12},(_,index) => {const angle=index*Math.PI/6;return `<path class="vehicle-guide-spoke" d="M${x} ${y}l${(Math.cos(angle)*(radius-6)).toFixed(2)} ${(Math.sin(angle)*(radius-6)).toFixed(2)}"/>`;}).join('')}<circle class="vehicle-guide-hub" cx="${x}" cy="${y}" r="3"/></g>`;
const carWheel = (x,y) => `<g class="vehicle-guide-car-wheel"><circle cx="${x}" cy="${y}" r="24"/><circle class="vehicle-guide-car-rim" cx="${x}" cy="${y}" r="15"/>${Array.from({length:6},(_,index) => {const angle=index*Math.PI/3;return `<path d="M${x} ${y}l${(Math.cos(angle)*12).toFixed(2)} ${(Math.sin(angle)*12).toFixed(2)}"/>`;}).join('')}<circle class="vehicle-guide-car-cap" cx="${x}" cy="${y}" r="5"/></g>`;

function bicycleSketch() {
  return `<svg class="vehicle-guide-sketch" viewBox="0 0 320 220" fill="none" aria-hidden="true">
    <ellipse class="vehicle-guide-shadow" cx="158" cy="177" rx="126" ry="9"/>
    <g stroke-linecap="round" stroke-linejoin="round">
      ${spokeWheel(72,136,38)}${spokeWheel(249,136,38)}
      <path class="vehicle-guide-metal" d="M30 133a43 43 0 0 1 84 0m93 0a43 43 0 0 1 84 0M52 93 72 136m-15-43h46M73 136l39-24m135 24-22-57"/>
      <path class="vehicle-guide-frame" d="m72 136 56-61 37 65-93-4 45-43h108l-60 47m61-63 23 59m-91-17-30-63"/>
      <path class="vehicle-guide-metal" d="m225 81-5-24q-1-5 5-6h16m-105 91 16 14h12m-2-21 11-14h11m-32 27-40 15"/>
      <path class="vehicle-guide-saddle" d="M112 71q-3-8 9-8h28q3 0 4 4l-22 5z"/>
      <path class="vehicle-guide-grip" d="M235 50h12m-81 105h14m-33-35h15"/>
      <circle class="vehicle-guide-chain" cx="165" cy="140" r="13"/><path class="vehicle-guide-chain" d="m71 128 96-1m-96 17 94 9"/>
      <path class="vehicle-guide-basket" d="m33 53 7 31h55l9-31zM40 64h60m-57 10h54M48 54l4 29m12-29v29m14-29-3 29m16-29-5 29"/>
      <path class="vehicle-guide-metal" d="M39 88h63m-64 0-2 14m66-14 9 20m-5-59h11"/>
      <path class="vehicle-guide-reflector" d="M29 96h5m216-12 7 1"/>
      <path class="vehicle-guide-wind" d="M194 27h52q12 0 12-8t-10-7M208 37h66m-48 7h51q11 0 11-9"/>
    </g>
  </svg>`;
}

function carSketch(van) {
  return `<svg class="vehicle-guide-sketch${van?' is-van':''}" viewBox="0 0 320 220" fill="none" aria-hidden="true">
    <ellipse class="vehicle-guide-shadow" cx="160" cy="177" rx="130" ry="10"/>
    <g stroke-linecap="round" stroke-linejoin="round">
      <path class="vehicle-guide-car-body" d="${van?'M31 139V67q0-8 9-8h172l33 48 40 10q7 2 7 10v22H30z':'M28 147v-27q0-7 12-9l40-8 37-39h81l49 42 35 8q9 3 9 13v21z'}"/>
      <path class="vehicle-guide-car-shine" d="M32 139h257m-258-8h24m193 0h39"/>
      <path class="vehicle-guide-window" d="${van?'M150 68h55l24 35h-79zM66 68h64v34H66z':'m97 102 26-29h35v29zm72-29h24l34 29h-58z'}"/>
      <path class="vehicle-guide-car-detail" d="${van?'M141 65v79m-91-36h84m-83 12h85m77-12v39M153 114h13':'M163 70v76m-75-37-3 34m152-34 5 34m-60-27h13m-61 0h13'}"/>
      <path class="vehicle-guide-car-lamp" d="M272 118h14v11h-14z"/><path class="vehicle-guide-car-tail" d="M30 116h8v12h-8z"/>
      <path class="vehicle-guide-metal" d="M25 148h30m197 0h41m-78-45 5-7h13"/>
      ${carWheel(81,149)}${carWheel(242,149)}
      <path class="vehicle-guide-wind" d="M201 35h44q10 0 10-7t-8-6M222 45h58m-27 9h29"/>
    </g>
  </svg>`;
}

export function firstVehicleGuideCopy(candidate) {
  const kind = vehicleGuideKind(candidate);
  if (!kind) return null;
  const car = kind === 'car', unlocked = candidate.unlocked === true;
  return {
    kind,
    kicker: car ? '街巷新发现 · 汽车' : '街巷新发现 · 自行车',
    title: car ? '这一程，可以开车去。' : unlocked ? '这辆车，随时可以再骑。' : '借一阵顺路的风。',
    description: car ? '眼前这辆车可以驾驶。沿主路去巷子的另一头，遇见熟人，就停下来聊聊。' : unlocked ? '自行车已经借好了。骑去远一点的街口，想停下看看时，再按一次 F。' : '这是外公留在巷口的自行车。走近按 F，就能借来骑，不用花钱，也不需要钥匙。',
    action: car ? '上车驾驶' : unlocked ? '骑上自行车' : '借车并骑上',
    sound: car ? '鸣笛' : '按铃',
    footer: '停在哪里，下次就去哪里找。',
    name: candidate.name || (car ? '街坊的车' : '外公的自行车'),
  };
}

export function firstVehicleGuideMarkup(candidate) {
  const copy = firstVehicleGuideCopy(candidate);
  if (!copy) return '';
  return `<section class="first-vehicle-guide" data-first-vehicle-guide="${copy.kind}" role="dialog" aria-modal="true" aria-labelledby="first-vehicle-guide-title" aria-describedby="first-vehicle-guide-desc">
    <div class="vehicle-guide-art" aria-hidden="true"><span class="vehicle-guide-art-label">晴川里 · 顺路的风</span><div class="vehicle-guide-halo"></div>${copy.kind==='car'?carSketch(candidate.id==='prop-car-van'):bicycleSketch()}<div class="vehicle-guide-object-name">${escapeHTML(copy.name)}</div><div class="vehicle-guide-art-line"></div><p>去远一点的地方，<br>也记得为街坊停一停。</p></div>
    <div class="vehicle-guide-content"><button type="button" class="vehicle-guide-close" id="first-vehicle-guide-close" aria-label="记住提示，回到巷子"><span aria-hidden="true">×</span></button><span class="vehicle-guide-kicker">${copy.kicker}</span><h2 id="first-vehicle-guide-title">${copy.title}</h2><p id="first-vehicle-guide-desc">${copy.description}</p>
      <div class="vehicle-guide-first-action"><kbd>F</kbd><div><small>收起提示后，走近按下</small><strong>${copy.action}</strong></div><svg viewBox="0 0 30 18" fill="none" aria-hidden="true"><path d="M2 9h25m-7-7 7 7-7 7" stroke="currentColor" stroke-width="1.3"/></svg></div>
      <dl class="vehicle-guide-controls"><div><dt><kbd>W</kbd><kbd>S</kbd></dt><dd>前进 / 后退</dd></div><div><dt><kbd>A</kbd><kbd>D</kbd></dt><dd>左右转向</dd></div><div><dt><kbd class="vehicle-guide-space">空格</kbd></dt><dd>${copy.sound}</dd></div><div><dt><kbd>F</kbd></dt><dd>停车下车</dd></div></dl>
      <p class="vehicle-guide-note">${copy.footer}</p><button type="button" class="vehicle-guide-confirm" id="first-vehicle-guide-confirm"><span>记住了，回到巷子</span><span aria-hidden="true">↗</span></button><p class="vehicle-guide-once">每类载具只提醒一次 · 不会自动上车</p>
    </div>
  </section>`;
}

/** No world, timers, storage or auto-boarding side effects. The host opens its
 * normal modal first and clears gameplay keys when it closes. Confirmation
 * consumes its key event before delegating, preventing the same Space/Enter
 * from reaching a newly focused world canvas or generating a second click.
 */
export function mountFirstVehicleGuide(root, {candidate, onAcknowledge, autoFocus = true} = {}) {
  root.innerHTML = firstVehicleGuideMarkup(candidate);
  const kind = vehicleGuideKind(candidate);
  let disposed = false, acknowledged = false;
  const confirm = root.querySelector('#first-vehicle-guide-confirm');
  const close = root.querySelector('#first-vehicle-guide-close');
  function acknowledge(reason = 'confirm') {
    if (disposed || acknowledged || !kind) return false;
    acknowledged = true;
    onAcknowledge?.(kind, {reason, id:candidate.id});
    return true;
  }
  function keydown(event) {
    if (disposed || !kind || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key?.toLowerCase();
    if (key === 'tab') {
      event.preventDefault();event.stopPropagation();
      const active = root.ownerDocument?.activeElement;
      (active === confirm ? close : confirm)?.focus({preventScroll:true});
      return;
    }
    if (key === 'enter' || key === ' ' || key === 'escape') {
      event.preventDefault();event.stopPropagation();
      if (!event.repeat) acknowledge(key === 'escape' ? 'escape' : 'keyboard');
      return;
    }
    if (actionKeys.has(key)) {event.preventDefault();event.stopPropagation();}
  }
  if (confirm) confirm.onclick = event => {event?.stopPropagation?.();acknowledge('confirm');};
  if (close) close.onclick = event => {event?.stopPropagation?.();acknowledge('close');};
  root.addEventListener('keydown', keydown, true);
  if (autoFocus && !disposed) confirm?.focus({preventScroll:true});
  return {
    acknowledge,
    diagnostics(){return {kind, id:candidate?.id ?? null, acknowledged, disposed};},
    dispose(){if(disposed)return;disposed=true;root.removeEventListener('keydown',keydown,true);if(confirm)confirm.onclick=null;if(close)close.onclick=null;root.innerHTML='';},
  };
}
