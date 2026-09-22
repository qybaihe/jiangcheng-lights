/**
 * A presentation-only boot screen. Counts are completed application tasks,
 * never estimated network bytes. Nothing here waits for an animation before
 * allowing the application to start.
 */
export const HOUSE_LOADING_STAGES = Object.freeze({
  scene: Object.freeze({ label: '铺开晴川里的街巷', detail: '江岸、老屋和巷口，正在回到熟悉的位置。' }),
  hero: Object.freeze({ label: '等一位归来的人', detail: '正在准备你的身影，行李里装着一段旧时光。' }),
  neighbors: Object.freeze({ label: '街坊正点亮窗灯', detail: '修理铺和热干面摊前，总有人记得你。' }),
  ready: Object.freeze({ label: '灯已点亮，欢迎回家', detail: '晴川里准备好了，故事由你慢慢走。' }),
});

export const HOUSE_LOADING_TIMING = Object.freeze({ revealMs: 120, exitMs: 180 });
const mounts = new WeakMap();

// Keep the supplied 512 px house illustration intact. The surrounding SVG is
// only a quiet river line, not a replacement for the existing brand artwork.
export function houseLoadingMarkup() {
  return `<div class="house-loading__water" aria-hidden="true">
    <span class="house-loading__grain"></span>
    <svg class="house-loading__shore" viewBox="0 0 1440 90" preserveAspectRatio="none"><path d="M0 53C230 91 425 75 710 39C988 4 1220 27 1440 64V90H0Z"/></svg>
  </div>
  <div class="house-loading__art-zone">
    <p class="house-loading__place">武汉<span>·</span>晴川里</p>
    <div class="house-loading__illustration" aria-hidden="true">
      <span class="house-loading__halo"></span>
      <img class="house-loading__house" src="/media/game-icon-v2-512.png" width="512" height="512" alt="" decoding="async" fetchpriority="high" draggable="false"/>
      <span class="house-loading__window house-loading__window--one"></span><span class="house-loading__window house-loading__window--two"></span>
      <span class="house-loading__window house-loading__window--three"></span><span class="house-loading__window house-loading__window--four"></span>
      <svg class="house-loading__ripples" viewBox="0 0 650 80" fill="none"><path d="M74 28c43-8 99-10 148-3m210 2c48-6 104-5 146 3M124 48c41-5 73-5 105-2m178 3c34-4 72-4 102 0M251 63c58 7 112 6 150-1"/></svg>
      <svg class="house-loading__leaf house-loading__leaf--one" viewBox="0 0 30 18" fill="none"><path d="M2 14C6 3 17 1 28 3C24 14 12 19 2 14Z" fill="currentColor"/><path d="m4 13 21-8" stroke="#1d4640"/></svg>
      <svg class="house-loading__leaf house-loading__leaf--two" viewBox="0 0 30 18" fill="none"><path d="M2 14C6 3 17 1 28 3C24 14 12 19 2 14Z" fill="currentColor"/><path d="m4 13 21-8" stroke="#1d4640"/></svg>
    </div>
  </div>
  <section class="house-loading__paper" aria-label="载入进度">
    <img class="house-loading__logo" src="/media/game-logo-v1-transparent.webp" width="1522" height="443" alt="江城有灯" decoding="async" draggable="false"/>
    <p class="house-loading__tagline">灯火会记得每一个人。</p>
    <div class="house-loading__status" role="status" aria-live="polite" aria-atomic="true">
      <p class="house-loading__stage" data-loading-stage></p>
      <p class="house-loading__detail" data-loading-detail></p>
    </div>
    <div class="house-loading__progress" data-loading-progress role="progressbar" aria-label="街巷准备进度" aria-valuemin="0" aria-valuemax="3" aria-valuenow="0">
      <span class="house-loading__track"><span class="house-loading__fill" data-loading-fill></span></span>
      <span class="house-loading__count" data-loading-count aria-hidden="true"></span>
    </div>
    <button class="house-loading__retry" data-loading-retry type="button" hidden>重新载入<span aria-hidden="true">↗</span></button>
    <p class="house-loading__footnote">一条老巷，一盏为你留着的灯。</p>
  </section>`;
}

/**
 * mountHouseLoading(document.querySelector('#boot'), { reduced, onRetry })
 *
 * setStage('hero') changes copy only; update({ completed: 1, total: 3 })
 * reports actual settled work. The default three tasks are world creation,
 * hero readiness and resident readiness. complete() releases pointer input
 * synchronously and hides (does not remove) the root after at most 180 ms.
 */
export function mountHouseLoading(root, options = {}) {
  if (!root?.querySelector) throw new TypeError('mountHouseLoading requires a root element');
  mounts.get(root)?.dispose();
  const doc = root.ownerDocument || globalThis.document;
  const view = doc?.defaultView || globalThis;
  const now = () => view.performance?.now?.() ?? Date.now();
  const schedule = (fn, delay) => view.setTimeout(fn, delay);
  const cancel = handle => view.clearTimeout(handle);
  const motionQuery = view.matchMedia?.('(prefers-reduced-motion: reduce)');
  let userReduced = Boolean(options.reduced), disposed = false, timer = null;
  let mountedAt = now(), state = 'loading', stage = 'scene', completed = 0, total = 3;
  let retryHandler = options.onRetry || (() => view.location?.reload());
  let retrying = false, listenersAttached = true;
  const cleanups = [];
  root.innerHTML = houseLoadingMarkup();
  root.classList.add('house-loading');
  root.hidden = false;
  root.inert = false;
  root.style.pointerEvents = '';
  root.setAttribute('aria-label', '江城有灯，正在准备');
  root.setAttribute('aria-busy', 'true');
  root.removeAttribute('aria-hidden');
  const stageNode = root.querySelector('[data-loading-stage]');
  const detailNode = root.querySelector('[data-loading-detail]');
  const progressNode = root.querySelector('[data-loading-progress]');
  const fillNode = root.querySelector('[data-loading-fill]');
  const countNode = root.querySelector('[data-loading-count]');
  const retryNode = root.querySelector('[data-loading-retry]');

  const snapshot = () => ({ state, stage, completed, total, reduced: userReduced || Boolean(motionQuery?.matches), hidden: root.hidden });
  function clearTimer() { if (timer !== null) { cancel(timer); timer = null; } }
  function detachListeners() {
    if (!listenersAttached) return;
    cleanups.splice(0).forEach(fn => fn());
    listenersAttached = false;
  }
  function hide() {
    clearTimer();
    if (root.hidden) return;
    root.hidden = true;
    root.dataset.paused = 'true';
    detachListeners();
    options.onHidden?.();
  }
  function syncMotion() {
    if (disposed) return;
    root.dataset.reduced = String(userReduced || Boolean(motionQuery?.matches));
    root.dataset.paused = String(Boolean(doc?.hidden) || root.hidden || state !== 'loading');
    if (state === 'complete' && (doc?.hidden || snapshot().reduced)) hide();
  }
  function listen(target, type, fn) {
    target?.addEventListener?.(type, fn);
    cleanups.push(() => target?.removeEventListener?.(type, fn));
  }
  listen(doc, 'visibilitychange', syncMotion);
  if (motionQuery?.addEventListener) listen(motionQuery, 'change', syncMotion);
  else if (motionQuery?.addListener) {
    motionQuery.addListener(syncMotion);
    cleanups.push(() => motionQuery.removeListener(syncMotion));
  }
  function renderProgress() {
    // These are task counts, so a fraction or an invented percentage is never
    // displayed. The bar moves only when the host explicitly reports work.
    progressNode.setAttribute('aria-valuemax', String(total));
    progressNode.setAttribute('aria-valuenow', String(completed));
    progressNode.setAttribute('aria-valuetext', `已完成 ${completed} / ${total} 项准备 · ${stageNode.textContent}`);
    countNode.textContent = `${completed} / ${total} 项准备`;
    fillNode.style.transform = `scaleX(${total ? completed / total : 0})`;
  }
  function applyStage(id, copy = {}) {
    const fallback = HOUSE_LOADING_STAGES[id];
    if (!fallback) throw new RangeError(`Unknown house loading stage: ${id}`);
    stage = id;
    root.dataset.stage = id;
    stageNode.textContent = String(copy.label ?? fallback.label);
    detailNode.textContent = String(copy.detail ?? fallback.detail);
    renderProgress();
  }
  function resetForRetry() {
    clearTimer();
    state = 'loading'; completed = 0; mountedAt = now();
    root.dataset.state = state;
    root.inert = false; root.hidden = false;
    root.style.pointerEvents = '';
    root.removeAttribute('aria-hidden');
    root.setAttribute('aria-busy', 'true');
    progressNode.hidden = false; retryNode.hidden = true;
    applyStage('scene', { detail: '再沿着江风，回到晴川里。' });
    syncMotion();
  }
  async function retry() {
    if (disposed || state !== 'failed' || retrying) return;
    retrying = true;
    retryNode.disabled = true;
    resetForRetry();
    try { await retryHandler(api); }
    catch (error) { if (!disposed && state !== 'complete') api.fail(error); }
    finally { retrying = false; if (!disposed) retryNode.disabled = false; }
  }
  retryNode.addEventListener('click', retry);

  const api = {
    getSnapshot: snapshot,
    setStage(id, copy = {}) {
      if (!disposed && state === 'loading') applyStage(id, copy);
      return snapshot();
    },
    update(progress = {}) {
      if (disposed || state !== 'loading') return snapshot();
      if (Number.isFinite(progress.total) && progress.total > 0) total = Math.max(1, Math.trunc(progress.total));
      if (Number.isFinite(progress.completed)) completed = Math.max(completed, Math.trunc(progress.completed));
      completed = Math.max(0, Math.min(total, completed));
      if (progress.stage) applyStage(progress.stage, progress);
      else if (progress.label !== undefined || progress.detail !== undefined) applyStage(stage, {
        label: progress.label ?? stageNode.textContent, detail: progress.detail ?? detailNode.textContent,
      });
      renderProgress();
      return snapshot();
    },
    setReduced(value) { userReduced = Boolean(value); syncMotion(); return snapshot(); },
    complete(copy = {}) {
      if (disposed || state === 'complete') return snapshot();
      state = 'complete'; completed = total;
      applyStage('ready', typeof copy === 'string' ? { label: copy } : copy);
      root.dataset.state = state;
      root.setAttribute('aria-busy', 'false');
      root.setAttribute('aria-hidden', 'true');
      // Game readiness is independent of the decorative fade. Inert also
      // releases keyboard users; the application owns its eventual focus.
      root.inert = true;
      root.style.pointerEvents = 'none';
      retryNode.hidden = true;
      syncMotion();
      if (!root.hidden) {
        if (copy.immediate || now() - mountedAt < HOUSE_LOADING_TIMING.revealMs) hide();
        else timer = schedule(hide, HOUSE_LOADING_TIMING.exitMs);
      }
      return snapshot();
    },
    fail(error, copy = {}) {
      if (disposed || state === 'complete') return snapshot();
      clearTimer(); state = 'failed';
      root.dataset.state = state;
      root.hidden = false; root.inert = false;
      root.style.pointerEvents = '';
      root.removeAttribute('aria-hidden');
      root.setAttribute('aria-busy', 'false');
      stageNode.textContent = String(copy.title ?? '巷口的灯，稍等一下');
      detailNode.textContent = String(copy.message ?? (typeof error === 'string' ? error : '街巷还没准备好。检查网络，或换用支持 WebGL 的浏览器后，再试一次。'));
      if (copy.detail) detailNode.textContent += ` ${String(copy.detail)}`;
      if (typeof copy.onRetry === 'function') retryHandler = copy.onRetry;
      retryNode.textContent = String(copy.retryLabel ?? '重新载入 ↗');
      retryNode.hidden = false; retryNode.disabled = false;
      progressNode.hidden = true;
      syncMotion();
      if (!doc?.hidden) retryNode.focus({ preventScroll: true });
      return snapshot();
    },
    dispose() {
      if (disposed) return;
      disposed = true; state = 'disposed';
      clearTimer(); detachListeners();
      retryNode.removeEventListener('click', retry);
      root.hidden = true; root.inert = true;
      root.dataset.state = state; root.dataset.paused = 'true';
      root.style.pointerEvents = 'none';
      root.setAttribute('aria-hidden', 'true');
      root.setAttribute('aria-busy', 'false');
      if (mounts.get(root) === api) mounts.delete(root);
    },
  };
  root.dataset.state = state;
  applyStage(stage);
  syncMotion();
  mounts.set(root, api);
  return api;
}
