import {PHOTO_CHALLENGES, PHOTO_FRAME_ASPECT, createPhotoAlignmentSession, getPhotoReferenceAnchors, samplePhotoWorld} from '../photo-alignment.js';

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));

export function photoInvitationMarkup(challenge, completed = false) {
  if (!challenge) return '';
  return `<section class="photo-invitation" aria-labelledby="photo-invitation-title"><span class="photo-kicker">晴川里 · 旧照对景 / ${escapeHTML(challenge.number)}</span><h2 id="photo-invitation-title">${escapeHTML(challenge.title)}</h2><p class="photo-invitation-note">${escapeHTML(challenge.note)}</p><p>不急着翻到下一页。拿着旧照，走进巷子，找回当年按下快门的位置。</p><ol><li>看照片，认出三处熟悉的景物</li><li>用 WASD 小步走动，拖动画面调整目光</li><li>三处对上后，按 Enter 或点击快门</li></ol><p class="photo-invitation-foot">${completed ? '这一页已收入手账，也可以再看看。' : '随时可退出 · 不计时 · 提示不扣分'}</p><button class="photo-primary" type="button" data-photo-start="${escapeHTML(challenge.id)}">拿着旧照去看看 <span aria-hidden="true">↗</span></button></section>`;
}

export function photoDirectoryMarkup(progress = {}) {
  return `<section class="photo-directory"><span class="photo-kicker">走进照片里的位置</span><h3>旧照，也记得回家的路。</h3><div class="photo-directory-cards">${Object.values(PHOTO_CHALLENGES).map(c => {
    const done = Array.isArray(progress.completed) && progress.completed.includes(c.id);
    return `<article><div class="photo-directory-print"><img src="${escapeHTML(c.image)}" loading="lazy" alt="${escapeHTML(c.imageAlt)}"><span>${escapeHTML(c.number)} / 晴川里旧事</span></div><small>${escapeHTML(c.location)}</small><h4>${escapeHTML(c.title)}</h4><p>${escapeHTML(done ? c.caption.split('｜')[1] : c.note)}</p><button type="button" data-photo-route="${escapeHTML(c.id)}">${done ? '再看这一页' : '拿着旧照去寻找'} <span aria-hidden="true">↗</span></button><em>${done ? '✓ 已找回 · 收进旧照手账' : '三处线索 · 亲手对景'}</em></article>`;
  }).join('')}</div></section>`;
}

/** A side-mounted print, not a modal. World movement and dragging remain live.
 * The host owns sampling; rendering this HUD never grants progress. */
export function mountPhotoAlignmentHUD(root, {onShutter, onHint, onCancel, onReturnFocus} = {}) {
  const host = document.createElement('section'); host.className = 'photo-alignment-hud'; host.hidden = true;
  host.setAttribute('aria-label', '旧照对景');
  host.innerHTML = `<aside class="photo-alignment-card"><header><div><span class="photo-kicker">旧照对景 · 把目光交给街巷</span><h2 data-photo-title></h2></div><button type="button" class="photo-exit" data-photo-exit aria-label="收好旧照，退出对景">×</button></header><button type="button" class="photo-print" data-photo-enlarge aria-expanded="false" aria-label="放大旧照片，再点一次收起"><span class="photo-image-window"><img data-photo-image alt=""><span class="photo-reference-pins" aria-hidden="true"></span><span class="photo-image-missing" hidden>旧照片正在展开<br><small>稍候便能看见熟悉的街巷</small></span></span><span class="photo-print-caption"><span data-photo-subtitle></span><span data-photo-enlarge-label>放大 ↗</span></span></button><p class="photo-back-note" data-photo-note></p><div class="photo-clues-heading"><span>认一认，照片里的三处</span><b data-photo-count>0 / 3</b></div><ol class="photo-anchor-list" data-photo-anchors></ol><div class="photo-readiness"><span class="photo-readiness-dot" aria-hidden="true"></span><p data-photo-status role="status" aria-live="polite"></p></div><div class="photo-hint-card" hidden><span>照片背面的铅笔字 <b data-photo-hint-count></b></span><p data-photo-hint></p></div><div class="photo-card-actions"><button type="button" class="photo-secondary" data-photo-hint-button>看看线索 <span>H</span></button><button type="button" class="photo-primary" data-photo-shutter><span class="photo-shutter-icon" aria-hidden="true"></span><span>按下快门</span><kbd>↵</kbd></button></div><p class="photo-input-help"><span><kbd>WASD</kbd> 移步</span><span>拖动画面 · 转头</span><span><kbd>Esc</kbd> 收起</span></p></aside><div class="photo-viewfinder" aria-hidden="true"><i></i><i></i><i></i><i></i><span>看的是此刻，找的是从前</span></div><p class="photo-screenreader-status" aria-live="polite" aria-atomic="true"></p>`;
  root.append(host);
  const q = s => host.querySelector(s), print = q('[data-photo-enlarge]'), image = q('[data-photo-image]'), pins = q('.photo-reference-pins'), anchors = q('[data-photo-anchors]');
  let currentId = null, expanded = false, signature = '', disposed = false;
  const set = (element, text) => {if (element.textContent !== text) element.textContent = text;};
  const setExpanded = next => {expanded = next; host.dataset.expanded = String(next); print.setAttribute('aria-expanded', String(next)); set(q('[data-photo-enlarge-label]'), next ? '收起 ↙' : '放大 ↗');};
  const focusWorld = () => onReturnFocus?.();
  print.onclick = () => {setExpanded(!expanded); focusWorld();};
  q('[data-photo-exit]').onclick = () => onCancel?.();
  q('[data-photo-shutter]').onclick = () => {onShutter?.(); focusWorld();};
  q('[data-photo-hint-button]').onclick = () => {onHint?.(); focusWorld();};
  image.onerror = () => {q('.photo-image-missing').hidden = false; image.hidden = true;};
  image.onload = () => {q('.photo-image-missing').hidden = true; image.hidden = false;};
  return {
    element: host,
    update(snapshot, challenge) {
      if (disposed) return;
      const active = snapshot?.status === 'aligning' && challenge;
      host.hidden = !active;
      if (!active) {currentId = null; signature = ''; setExpanded(false); return;}
      if (currentId !== challenge.id) {
        currentId = challenge.id; setExpanded(false); set(q('[data-photo-title]'), challenge.title); set(q('[data-photo-subtitle]'), `${challenge.number} / 晴川里旧事`);
        set(q('[data-photo-note]'), challenge.note); image.hidden = false; q('.photo-image-missing').hidden = true; image.src = challenge.image; image.alt = challenge.imageAlt;
        const reference = getPhotoReferenceAnchors(challenge.id);
        pins.innerHTML = reference.map((p, index) => `<span data-photo-pin="${escapeHTML(p.id)}" style="left:${50 + p.x * 50}%;top:${50 - p.y * 50}%">${index + 1}</span>`).join('');
        anchors.innerHTML = challenge.anchors.map((a, index) => `<li data-photo-anchor="${escapeHTML(a.id)}"><span class="photo-anchor-number">${index + 1}</span><span>${escapeHTML(a.title)}</span><b>还在寻找</b></li>`).join('');
      }
      const e = snapshot.evaluation; host.dataset.ready = String(e.ready); host.dataset.hint = String(snapshot.hintLevel);
      for (const a of e.anchors) {
        const row = anchors.querySelector(`[data-photo-anchor="${a.id}"]`); row.dataset.recognized = String(a.recognized);
        set(row.querySelector('b'), a.recognized ? '已认出' : a.visible ? '再对一对' : '还在寻找');
        pins.querySelector(`[data-photo-pin="${a.id}"]`).dataset.recognized = String(a.recognized);
      }
      set(q('[data-photo-count]'), `${e.recognizedCount} / 3`);
      const status = e.ready ? '对上了。按下快门，收好这一刻。' : snapshot.feedback && snapshot.attempts ? e.message : e.message;
      set(q('[data-photo-status]'), status);
      q('.photo-hint-card').hidden = !snapshot.hintLevel;
      set(q('[data-photo-hint]'), challenge.clues[Math.max(0, snapshot.hintLevel - 1)] || ''); set(q('[data-photo-hint-count]'), `${snapshot.hintLevel} / ${challenge.clues.length}`);
      const newSignature = `${challenge.id}|${e.recognizedCount}|${e.ready}|${snapshot.hintLevel}|${snapshot.attempts}`;
      if (signature !== newSignature) {signature = newSignature; set(q('.photo-screenreader-status'), `${e.recognizedCount} 处线索已认出，共 3 处。${e.message}${snapshot.hintLevel ? challenge.clues[snapshot.hintLevel - 1] : ''}`);}
    },
    collapse() {if (!expanded) return false; setExpanded(false); return true;},
    dispose() {if (disposed) return; disposed = true; image.onerror = null; image.onload = null; for (const button of host.querySelectorAll('button')) button.onclick = null; host.remove();},
  };
}

/** Owns the temporary camera mode and keyboard scope, but never the player's
 * position, physics loop, storage, or main-story state. `update()` belongs after
 * the world's camera pass. `onComplete` runs after restoration, so a 3D story
 * conversation can start immediately without fighting this viewfinder. */
export function createPhotoAlignmentController(world, root, {onComplete, onCancel, onChange} = {}) {
  let session = null, previousMode = null, disposed = false;
  const ownerDocument = root.ownerDocument || document, eventTarget = ownerDocument.defaultView || window;
  const focusWorld = () => world.canvas?.focus?.({preventScroll: true});
  const clearInput = () => {for (const key of Object.keys(world.keys ?? {})) world.keys[key] = false; world.lookDrag = null; world.path = [];};
  const publish = () => {const s = session?.snapshot() ?? null; hud.update(s, s ? PHOTO_CHALLENGES[s.photoId] : null); onChange?.(s); return s;};
  const restore = () => {world.releasePointerLock?.(); clearInput(); const mode = previousMode; previousMode = null; if (mode) world.setCameraMode?.(mode); focusWorld();};
  const cancel = (reason = 'player-cancelled') => {
    if (!session) return false; const s = session.cancel(reason); session = null; restore(); publish(); onCancel?.(s); return true;
  };
  const shutter = () => {
    if (!session) return null;
    const s = session.shutter(samplePhotoWorld(world, session.snapshot().photoId)); hud.update(s, PHOTO_CHALLENGES[s.photoId]);
    if (s.status === 'finished') {session = null; restore(); publish(); onComplete?.(s.result, s);} else onChange?.(s);
    return s;
  };
  const hint = () => {if (!session) return null; session.hint(); return publish();};
  const hud = mountPhotoAlignmentHUD(root, {onShutter: shutter, onHint: hint, onCancel: () => cancel(), onReturnFocus: focusWorld});
  const keydown = event => {
    if (!session || event.isComposing) return;
    if (event.key === 'Escape') {event.preventDefault(); event.stopImmediatePropagation(); cancel(); return;}
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName) || event.target?.isContentEditable) return;
    if (event.key.toLowerCase() === 'h') {event.preventDefault(); event.stopImmediatePropagation(); hint();}
    else if (event.key === 'Enter' && event.target?.tagName !== 'BUTTON') {event.preventDefault(); event.stopImmediatePropagation(); shutter();}
  };
  eventTarget.addEventListener('keydown', keydown, true);
  return {
    element: hud.element,
    get active() {return Boolean(session);},
    begin(id) {
      if (disposed || session || !Object.hasOwn(PHOTO_CHALLENGES, id) || world.conversation || world.suspended || (world.propInteractions?.mode ?? 'walk') !== 'walk') return false;
      session = createPhotoAlignmentSession(id); previousMode = world.cameraMode; clearInput(); world.cancelArrivalView?.('photo-alignment'); world.setCameraMode?.('first');
      // No heading or position snap: recognizing the photo is the player's act.
      world.curvedWorld?.update?.(); session.update(samplePhotoWorld(world, id)); publish(); focusWorld(); return true;
    },
    update() {
      if (!session) return null;
      if ((world.propInteractions?.mode ?? 'walk') !== 'walk') {cancel('vehicle-entered'); return null;}
      if (world.cameraMode !== 'first') {cancel('camera-mode-changed'); return null;}
      session.update(samplePhotoWorld(world, session.snapshot().photoId)); return publish();
    },
    snapshot() {return session?.snapshot() ?? null;},
    shutter, hint, cancel,
    dispose() {if (disposed) return; cancel('disposed'); disposed = true; eventTarget.removeEventListener('keydown', keydown, true); hud.dispose();},
  };
}
