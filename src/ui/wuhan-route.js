import {deriveWuhanRoute, getWuhanRouteStop, WUHAN_ROUTE_NAME} from '../wuhan-route.js';

const serial = stop => String(stop.number).padStart(2,'0');
const selectedStop = (route,id) => route.stops.find(stop => stop.id === id) ?? route.next ?? route.stops.at(-1);
const riverMark = '<svg viewBox="0 0 56 35" fill="none" aria-hidden="true"><path d="M4 13h48M9 13l8-8 10 8 11-8 9 8M9 13v8m38-8v8M4 25q6-4 12 0t12 0 12 0 12 0M4 31q6-4 12 0t12 0 12 0 12 0" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';

/** Insert beside the existing real map. The small line is an itinerary, not a map.
 * Bind after insertion with bindWuhanRoute; onStop selects an existing map POI.
 * CSS is imported once by the host, so this module remains directly testable.
 */
export function wuhanRouteMarkup(state,{active=false,selectedId=null}={}) {
  const route = deriveWuhanRoute(state), selected = selectedStop(route,selectedId);
  const buttonText = route.pauseKind === 'ended' ? '本次行程已结束' : route.paused ? '雨后再接着走' : selected.done ? '再去这里看看' : active ? '继续引路' : '开始这段顺路';
  return `<section class="wuhan-route-sheet" data-wuhan-route-sheet data-complete="${route.complete}" aria-label="${WUHAN_ROUTE_NAME}">
    <header class="wuhan-route-sheet-head"><div><small>江城慢行 · 一条自选的路</small><h3>${WUHAN_ROUTE_NAME}</h3><p>拐进去问一声，再替街坊捎一程。外公的路，总会多走几步。</p></div><div class="wuhan-route-postmark" aria-label="${route.progressLabel}">${riverMark}<span><b>${route.completedCount}</b> / ${route.total}</span><small>顺路留记</small></div></header>
    <div class="wuhan-route-track"><svg class="wuhan-route-thread" viewBox="0 0 1000 44" preserveAspectRatio="none" aria-hidden="true"><path d="M71 12 214 28 357 12 500 28 643 12 786 28 929 12"/></svg><ol>${route.stops.map(stop => `<li class="${stop.done?'is-done ':''}${selected.id===stop.id?'is-selected':''}"><button type="button" data-wuhan-route-stop="${stop.id}" aria-pressed="${selected.id===stop.id}"${route.nextId===stop.id?' aria-current="step"':''} aria-label="第 ${stop.number} 站，${stop.place}，${stop.done?stop.completionLabel:'还没记下'}"><span class="wuhan-route-seal" aria-hidden="true"><b>${serial(stop)}</b><i>${stop.done?'已记':'顺路'}</i></span><strong>${stop.place}</strong><small>${stop.short}</small></button></li>`).join('')}</ol></div>
    <div class="wuhan-route-sheet-detail"><div class="wuhan-route-story"><small>第 ${serial(selected)} 站 · ${selected.done?selected.completionLabel:'停下来，才听见的事'}</small><h4>${selected.title}</h4><p>${selected.lead}</p><span>${selected.connection}</span></div><div class="wuhan-route-do"><kbd>${selected.key}</kbd><p>${selected.action}</p><button type="button" data-wuhan-route-start="${selected.id}"${route.paused?' disabled':''}>${buttonText}<span aria-hidden="true">↗</span></button></div></div>
    <footer class="wuhan-route-sheet-foot"><p>${route.paused?route.pauseDetail:'不必按顺序。查看过早记忆，五处东街读到末页；最后一站坐完整班往返船。'}</p>${active?'<button type="button" data-wuhan-route-collapse>收起路线</button><button type="button" data-wuhan-route-main>回主线</button>':'<small>不影响主线与结局</small>'}</footer>
  </section>`;
}

/** Event delegation survives the host repainting the map's embedded sheet.
 * Callbacks are user actions only: none are fired by mounting or reading a save.
 */
export function bindWuhanRoute(root,{onRoute,onStop,onCollapse,onMain}={}) {
  const listener = event => {
    const button = event.target?.closest?.('button');
    if (!button || !root.contains(button) || button.disabled) return;
    const data = button.dataset;
    if (data.wuhanRouteStart !== undefined) {
      const stop = getWuhanRouteStop(data.wuhanRouteStart);
      if (stop) onRoute?.(stop.targetId,stop);
    } else if (data.wuhanRouteStop !== undefined) {
      const stop = getWuhanRouteStop(data.wuhanRouteStop);
      if (stop) onStop?.(stop.targetId,stop);
    } else if (data.wuhanRouteCollapse !== undefined) onCollapse?.();
    else if (data.wuhanRouteMain !== undefined) onMain?.();
  };
  root.addEventListener('click',listener);
  return {dispose(){root.removeEventListener('click',listener);}};
}

function hudMarkup(route,id) {
  const selected = route.stops.find(stop => stop.id===id && !stop.done) ?? route.next;
  const title = route.complete ? '这一路，都记下了' : `${serial(selected)} · ${selected.place}`;
  const detail = route.paused ? route.pauseDetail : route.complete ? '再看巷里的窗，已经认得里面的人。' : selected.brief;
  return `<header><strong>${WUHAN_ROUTE_NAME}</strong><span>${route.progressLabel}</span></header><div class="wuhan-route-hud-copy" aria-live="polite" aria-atomic="true"><small>${route.complete?'顺路，也是一段重逢':route.paused?'晚间预警 · 漫游暂歇':'下一站 · 随时可以绕路'}</small><h3>${title}</h3><p>${detail}</p></div><div class="wuhan-route-ticks" aria-hidden="true">${route.stops.map(stop=>`<i${stop.done?' class="done"':''}></i>`).join('')}</div><footer><button type="button" data-wuhan-route-start="${selected?.id??''}"${route.paused||route.complete?' disabled':''}>${route.complete?'七站已记下':route.paused?'雨后再逛':'继续引路'}<span aria-hidden="true">↗</span></button><button type="button" data-wuhan-route-collapse aria-label="收起外公的顺路地图">收起</button><button type="button" data-wuhan-route-main>回主线</button></footer>`;
}

/** The host owns activation, navigation, pause state and persistence.
 * No polling timer, storage, camera manipulation or auto-follow is introduced.
 * getTargetId is optional: honour an explicitly selected unread stop even when
 * it is out of order; once earned, the first remaining stop becomes the hint.
 */
export function mountWuhanRouteHUD({parent,getState,isActive=()=>false,isModal=()=>false,getWorld=()=>null,getTargetId=()=>null,onRoute,onCollapse,onMain}) {
  const element = parent.ownerDocument.createElement('aside');
  element.className = 'wuhan-route-hud';
  element.id = 'wuhan-route-hud';
  element.hidden = true;
  element.setAttribute('aria-label',WUHAN_ROUTE_NAME);
  parent.append(element);
  const events = bindWuhanRoute(element,{onRoute,onCollapse,onMain});
  let signature = '', disposed = false, lastSnapshot = null;
  return {
    element,
    update(){
      if (disposed) return;
      const state = getState(), world = getWorld();
      const visible = isActive() === true && !isModal() && world?.active === true && !world.blocked && !state?.runEnded;
      element.hidden = !visible;
      if (!visible) return;
      const route = deriveWuhanRoute(state), targetId = getTargetId();
      const nextSignature = `${route.stops.map(stop=>Number(stop.done)).join('')}/${route.paused}/${targetId??''}/${route.pauseDetail}`;
      if (nextSignature !== signature) {
        element.innerHTML = hudMarkup(route,targetId);
        element.dataset.complete = String(route.complete);
        element.dataset.paused = String(route.paused);
        signature = nextSignature;
      }
      lastSnapshot = {visible:true,completedCount:route.completedCount,total:route.total,nextId:route.nextId,complete:route.complete,paused:route.paused};
    },
    diagnostics(){return {...lastSnapshot,visible:!disposed&&!element.hidden};},
    dispose(){if(disposed)return;disposed=true;events.dispose();element.remove();},
  };
}
