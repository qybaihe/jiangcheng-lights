import {RACE_COURSES} from '../neighborhood-races.js';

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const medals = {gold: '金色纪念章', silver: '银色纪念章', bronze: '完成纪念章'};
const statsFor = (progress, id) => progress?.courses?.[id] || {};

/** Stable clock text: never emit a negative time or hide whole minutes. */
export function raceTimeLabel(seconds, tenths = true) {
  const deciseconds = Math.floor(Math.max(0, finite(seconds)) * 10 + .00001);
  const minutes = Math.floor(deciseconds / 600);
  const whole = Math.floor(deciseconds % 600 / 10);
  return `${String(minutes).padStart(2, '0')}:${String(whole).padStart(2, '0')}${tenths ? `.${deciseconds % 10}` : ''}`;
}

function raceSketch(boat = false) {
  return `<svg class="race-sketch" viewBox="0 0 300 160" fill="none" aria-hidden="true"><g stroke-linecap="round" stroke-linejoin="round"><path class="race-sketch-river" d="M9 132q14-7 27 0t27 0 27 0 27 0 27 0 27 0 27 0 27 0 27 0 27 0M31 144q11-5 23 0t23 0m111 0q11-5 23 0t23 0 23 0"/><path class="race-sketch-city" d="M14 84h24V62h17v22h12V51h22v33h15M63 50h29M69 45h17M75 29v15m-3-20h6m-2-7v7M189 83l15-16 15 16h22l15-16 15 16h14M205 83V69m51 14V69M223 50h41m-20-3v34m-9-29-5 27m24-27 7 29"/>${boat ? '<path class="race-sketch-hull" d="m72 105 149 1-17 19H94z"/><path class="race-sketch-detail" d="m86 109 124 1m-106-4V93h61v13m-37-16v16m57-5 15 10M142 92v14"/><path class="race-sketch-paddle" d="m128 73 54 55m-8-2 12-6 9 15-6 5zM89 117l-7 8m118-5 6 7"/><path class="race-sketch-sail" d="M224 105V38l27 10-27 12"/>' : '<path class="race-sketch-hull" d="M60 115V99l31-7 28-28h60l28 30 28 7v16H60z"/><path class="race-sketch-detail" d="m104 91 20-20h19v22zm49-20h23l20 22h-43zM146 66v48m13-13h12m-84-2v16m123-16 2 15M61 109h17m142 0h15"/><circle class="race-sketch-wheel" cx="97" cy="117" r="13"/><circle class="race-sketch-wheel" cx="200" cy="117" r="13"/><circle class="race-sketch-hub" cx="97" cy="117" r="6"/><circle class="race-sketch-hub" cx="200" cy="117" r="6"/><path class="race-sketch-sail" d="M249 112V35l27 10-27 12"/>'}<path class="race-sketch-wind" d="M112 34h31q8 0 8-6t-8-6m-41 19h59m-42 7h14"/></g></svg>`;
}

function controlMarkup(course) {
  const controls = course.controls;
  if (typeof controls === 'string') return `<p class="race-control-line">${escapeHTML(controls)}</p>`;
  const list = Array.isArray(controls) ? controls : [
    {keys: ['W', 'S'], label: course.mode === 'boat' ? '划动 / 减速' : '前进 / 后退'},
    {keys: ['A', 'D'], label: '左右转向'},
  ];
  return `<dl class="race-controls">${list.map(item => {
    if (typeof item === 'string') return `<div><dd>${escapeHTML(item)}</dd></div>`;
    const keys = Array.isArray(item.keys) ? item.keys : [item.key || item.keys || ''];
    return `<div><dt>${keys.map(key => `<kbd>${escapeHTML(key)}</kbd>`).join('')}</dt><dd>${escapeHTML(item.label || item.action || '')}</dd></div>`;
  }).join('')}</dl>`;
}

export function raceInvitationMarkup(course, availability = {available: true}, progress = {}) {
  if (!course) return '';
  const boat = course.mode === 'boat', stats = statsFor(progress, course.id);
  const available = availability.available === true;
  const intro = Array.isArray(course.intro) ? course.intro : [];
  return `<section class="neighborhood-race-card race-invitation" data-race-kind="${boat ? 'boat' : 'car'}" role="group" aria-labelledby="race-invite-title" aria-describedby="race-invite-description">
    <div class="race-ticket-art" aria-hidden="true"><span class="race-ticket-topline">晴川里 · 顺路小约定</span>${raceSketch(boat)}<span class="race-ticket-location">${boat ? '一江清风 / 近岸一圈' : '沿江小路 / 有来有回'}</span><span class="race-ticket-stamp">${boat ? '江风作伴' : '街坊同路'}</span></div>
    <div class="race-ticket-content"><button type="button" data-race-cancel class="race-close" aria-label="暂不参加，回到街巷">×</button><span class="race-kicker">${boat ? '水上计时 · 江风赛道' : '驾驶计时 · 沿江赛道'}</span><h2 id="race-invite-title">${escapeHTML(course.title)}</h2>
      <div id="race-invite-description" class="race-invite-story">${intro.length ? intro.map(line => `<p>${line.who ? `<span>${escapeHTML(line.who)}说</span>` : ''}${escapeHTML(typeof line === 'string' ? line : line.text)}</p>`).join('') : `<p>${escapeHTML(course.caption || '得空，沿着江风走一圈。回来还有街坊在等。')}</p>`}</div>
      <div class="race-ticket-facts"><div><small>按顺序通过</small><strong>${course.checkpoints?.length || 0}<em> 道标记门</em></strong></div><div><small>${stats.completions ? '你的最好成绩' : '金章参考时间'}</small><strong>${raceTimeLabel(stats.completions ? stats.bestSeconds : course.parSeconds, false)}</strong></div></div>
      <p class="race-route-hint">${escapeHTML(course.routeHint || '跟随前方亮起的标记，按顺序通过，然后回到起点。')}</p>${controlMarkup(course)}
      <div class="race-availability${available ? '' : ' is-unavailable'}" role="status"><span aria-hidden="true">${available ? '◇' : '—'}</span><p><strong>${escapeHTML(available ? '随时可以再试，慢慢来也有纪念。' : availability.title || '这一会儿，先歇一歇。')}</strong><small>${escapeHTML(available ? '可暂停、可退出。不领取主线物资，也不改变故事结局。' : availability.detail || '等街坊确认路线合适，再约一圈。')}</small></p></div>
      <div class="race-ticket-actions"><button type="button" data-race-cancel class="race-button-secondary">${boat ? '先自由划一会儿' : '先慢慢开'}</button><button type="button" data-race-start="${escapeHTML(course.id)}" class="race-button-primary"${available ? '' : ' disabled'}><span>准备好了，开始计时</span><span aria-hidden="true">↗</span></button></div><p class="race-ticket-footnote">${boat ? '晴天近岸休闲水域 · 不横渡长江航道' : '沿公共主路行驶 · 看见街坊就慢一点'}</p>
    </div>
  </section>`;
}

export function raceResultMarkup(course, result, progress = {}) {
  if (!course || !result) return '';
  const stats = statsFor(progress, course.id), finished = result.status === 'finished' && result.verified === true;
  const medal = medals[result.medal] ? result.medal : 'bronze';
  const newBest = finished && (!stats.completions || Math.abs(finite(stats.bestSeconds) - finite(result.elapsed)) < .051 || finite(result.elapsed) < finite(stats.bestSeconds));
  return `<section class="neighborhood-race-card race-result" role="group" aria-labelledby="race-result-title"><button type="button" data-race-close class="race-close" aria-label="收好纪念，回到街巷">×</button><span class="race-kicker">晴川里 · 顺路小约定</span><div class="race-result-medal" data-medal="${medal}" aria-hidden="true"><svg viewBox="0 0 84 92" fill="none"><path class="race-medal-ribbon" d="m24 53-6 35 18-8 8 8 4-31m7-4 13 35-18-8-7 8-8-31"/><circle cx="42" cy="36" r="29"/><circle cx="42" cy="36" r="23"/><path d="m26 41 16-19 16 19M31 35v16h22V35m-15 16V39h8v12M21 55q10-4 21 0t21 0"/></svg></div><h2 id="race-result-title">${finished ? '又一段路，有了回忆。' : '先歇一会儿，也很好。'}</h2><p class="race-result-course">${escapeHTML(course.title)} · ${finished ? medals[medal] : '本次未记成绩'}</p><div class="race-result-time"><small>${finished ? '这一圈，用了' : '停在了这一刻'}</small><strong>${raceTimeLabel(result.elapsed)}</strong>${finished && newBest ? '<span class="race-personal-best">个人最好</span>' : ''}</div><p class="race-result-copy">${escapeHTML(finished ? course.finishText || '江风还在。把这一程收进手账，再回去看看街坊。' : '路线会在原地等你。下一次，再走完这一圈。')}</p><div class="race-result-ledger"><span>标记门 <b>${Math.min(finite(result.checkpoints), finite(result.checkpointCount))} / ${finite(result.checkpointCount)}</b></span><span>最好成绩 <b>${stats.completions ? raceTimeLabel(stats.bestSeconds) : finished ? raceTimeLabel(result.elapsed) : '—'}</b></span></div>${finished ? '<p class="race-result-keepsake">成绩已收进顺路手账 · 不影响主线与结局</p>' : ''}<div class="race-ticket-actions"><button type="button" data-race-retry="${escapeHTML(course.id)}" class="race-button-secondary">再走一圈</button><button type="button" data-race-close class="race-button-primary"><span>收好，继续探索</span><span aria-hidden="true">↗</span></button></div></section>`;
}

export function raceDirectoryMarkup(progress = {}) {
  return `<section class="race-directory" aria-labelledby="race-directory-title"><div class="race-directory-heading"><span class="race-kicker">有来有回的小冒险</span><h3 id="race-directory-title">和江风，约一圈。</h3><p>不是每一程都要赶路。两条小赛道，走出自己的节奏。</p></div><div class="race-directory-grid">${Object.values(RACE_COURSES).map(course => {
    const stats = statsFor(progress, course.id), boat = course.mode === 'boat';
    return `<article class="race-directory-card">${raceSketch(boat)}<small>${boat ? '近岸水上 · 划船计时' : '沿江主路 · 驾驶计时'}</small><h4>${escapeHTML(course.title)}</h4><p>${escapeHTML(course.caption || course.routeHint)}</p><span class="race-directory-record">${stats.completions ? `已完成 ${finite(stats.completions)} 圈 · 最好 ${raceTimeLabel(stats.bestSeconds)}` : '还没出发 · 完成一圈留下纪念'}</span><button type="button" data-race-route="${escapeHTML(course.id)}">去起点看看 <span aria-hidden="true">↗</span></button></article>`;
  }).join('')}</div><p class="race-directory-note">可选小约定 · 天气与街坊安排合适时开放 · 不占用主线物资</p></section>`;
}

/** The host owns physics, timing and pause state. No animation loop, keyboard
 * listeners or storage writes are installed here; HUD cannot advance a race. */
export function mountRaceHUD(root, {onCancel, onPause} = {}) {
  const host = document.createElement('aside');
  host.className = 'neighborhood-race-hud';
  host.hidden = true;
  host.setAttribute('aria-label', '顺路计时赛');
  host.innerHTML = `<div class="race-hud-strip"><span class="race-hud-mark" aria-hidden="true">◇</span><div class="race-hud-name"><small>顺路小约定</small><strong data-race-hud-title></strong></div><div class="race-hud-clock"><small>这一圈</small><b data-race-time>00:00.0</b></div><div class="race-hud-gates"><small>标记门</small><b data-race-gates>0 / 0</b></div><div class="race-hud-next"><small>下一处</small><strong data-race-next>准备出发</strong></div><div class="race-hud-buttons"><button type="button" data-race-pause aria-label="暂停计时与行驶" aria-pressed="false"><span data-race-pause-icon aria-hidden="true">Ⅱ</span><span data-race-pause-label>暂停</span></button><button type="button" data-race-exit aria-label="退出本次计时，不记录成绩">退出</button></div><div class="race-hud-progress" aria-hidden="true"><i></i></div></div><div class="race-hud-countdown" hidden aria-hidden="true"><small>看好第一道标记门</small><strong data-race-countdown>3</strong><span>松开按键，听江风倒数</span></div><div class="race-hud-paused" hidden><span class="race-pause-dot" aria-hidden="true"></span><strong>歇一会儿，江风也等你。</strong><small>计时与行驶已暂停 · 点击上方「继续」出发</small></div><p class="race-hud-announcement" role="status" aria-live="polite" aria-atomic="true"></p>`;
  root.append(host);
  const query = selector => host.querySelector(selector);
  const title = query('[data-race-hud-title]'), timer = query('[data-race-time]'), gates = query('[data-race-gates]'), next = query('[data-race-next]');
  const pause = query('[data-race-pause]'), exit = query('[data-race-exit]'), pauseLabel = query('[data-race-pause-label]'), pauseIcon = query('[data-race-pause-icon]');
  const countdown = query('.race-hud-countdown'), count = query('[data-race-countdown]'), paused = query('.race-hud-paused'), bar = query('.race-hud-progress i'), announcement = query('.race-hud-announcement');
  let previous = '', currentPaused = false, disposed = false;
  const set = (element, text) => { if (element.textContent !== text) element.textContent = text; };
  pause.onclick = () => onPause?.(!currentPaused);
  exit.onclick = () => onCancel?.();
  return {
    element: host,
    update(snapshot, course) {
      if (disposed) return;
      const active = snapshot && course && ['countdown', 'running'].includes(snapshot.status);
      host.hidden = !active;
      if (!active) { previous = ''; return; }
      currentPaused = snapshot.paused === true;
      host.dataset.raceKind = course.mode === 'boat' ? 'boat' : 'car';
      host.dataset.paused = String(currentPaused);
      set(title, course.title || '顺路小约定');
      set(timer, raceTimeLabel(snapshot.elapsed));
      const total = Math.max(0, finite(snapshot.checkpointCount)), passed = Math.max(0, Math.min(total, finite(snapshot.checkpointsPassed)));
      set(gates, `${passed} / ${total}`);
      set(next, snapshot.nextCheckpoint?.label || (snapshot.status === 'countdown' ? '准备出发' : '回到起点'));
      countdown.hidden = snapshot.status !== 'countdown' || currentPaused;
      const number = Math.max(1, Math.ceil(finite(snapshot.countdown, 3)));
      set(count, String(number));
      paused.hidden = !currentPaused;
      set(pauseLabel, currentPaused ? '继续' : '暂停');
      set(pauseIcon, currentPaused ? '▷' : 'Ⅱ');
      pause.setAttribute('aria-pressed', String(currentPaused));
      pause.setAttribute('aria-label', currentPaused ? '继续计时与行驶' : '暂停计时与行驶');
      const progress = total ? `${passed / total * 100}%` : '0%';
      if (bar.style.width !== progress) bar.style.width = progress;
      const signature = `${snapshot.courseId}|${snapshot.status}|${currentPaused}|${passed}|${snapshot.status === 'countdown' ? number : ''}`;
      if (signature !== previous) {
        announcement.textContent = currentPaused ? '计时与行驶已暂停。点击继续，再出发。' : snapshot.status === 'countdown' ? `${course.title}，${number} 秒后出发。` : `已通过 ${passed} 道标记门，共 ${total} 道。下一处，${snapshot.nextCheckpoint?.label || '终点'}。`;
        previous = signature;
      }
    },
    dispose() { disposed = true; pause.onclick = null; exit.onclick = null; host.remove(); },
  };
}
