/** Small paper / leaf / glint feedback, owned by the existing world frame loop.
 * No RAF, timers, WebGL resources, audio, input handlers, or gameplay writes.
 */
export const HUD_EFFECT_LIMITS=Object.freeze({live:16,burst:7,pollSeconds:.16,ambientSeconds:8,cooldownMs:700});
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
const progressOf=state=>(state?.adventure?.found?.length||0)+(state?.wuhanVisits?.length||0)+(state?.lore?.length||0)+(state?.props?.notes?.length||0);

/** Bounded geometry makes the effect local even at 1280 × 720 and viewport edges. */
export function hudEffectOrigin(rect,{width=1440,height=900}={}) {
 if(!rect||![rect.left,rect.top,rect.width,rect.height,width,height].every(Number.isFinite)||rect.width<=0||rect.height<=0)return null;
 if(rect.left>=width||rect.top>=height||rect.left+rect.width<=0||rect.top+rect.height<=0)return null;
 return {x:clamp(rect.left+rect.width*.78,22,Math.max(22,width-22)),y:clamp(rect.top+Math.min(12,rect.height*.25),28,Math.max(28,height-22))};
}

/** Pure particle specifications; animation is delegated to the browser compositor. */
export function hudParticleSpecs(kind='interact',{count,random=Math.random}={}) {
 const defaults={interact:3,arrival:5,collect:7,bell:5,leaf:3};
 const size=clamp(Math.floor(Number.isFinite(count)?count:(defaults[kind]??3)),0,HUD_EFFECT_LIMITS.burst);
 const sample=()=>clamp(Number(random())||0,0,1);
 return Array.from({length:size},(_,i)=>{
  const shape=kind==='leaf'?'leaf':kind==='collect'?(i%3?'paper':'glint'):kind==='bell'?(i%2?'glint':'leaf'):'glint';
  const spread=kind==='leaf'?30:kind==='collect'?35:24;
  return {shape,size:shape==='glint'?4+sample()*3:4+sample()*4,dx:(sample()-.5)*spread*2,dy:-(15+sample()*31),drift:(sample()-.5)*14,rotation:(sample()-.5)*90,spin:(sample()-.5)*110,duration:900+sample()*550,delay:i*38,opacity:shape==='glint'?.78:.62};
 });
}

/**
 * Mount once after the HUD is created:
 *   const fx=createWorldHudEffects(app,{getState:()=>state,getWorld:()=>world,isModal:()=>modal});
 *   fx.update(dt); // existing onFrame, dt in seconds; call every frame for pause gating
 * Optional: fx.emit('collect', '#adventure-trail'); fx.clear(); fx.dispose();
 * Read-only QA: fx.diagnostics(). No UI IDs or event behaviours are replaced.
 */
export function createWorldHudEffects(root,{getState=()=>({}),getWorld=()=>null,isModal=()=>false,automatic=true,ambient=true,random=Math.random,now}={}) {
 const doc=root.ownerDocument,win=doc.defaultView;
 const clock=now??(()=>win?.performance?.now?.()??Date.now());
 const media=win?.matchMedia?.('(prefers-reduced-motion: reduce)');
 const layer=doc.createElement('div');layer.className='world-hud-fx';layer.setAttribute('aria-hidden','true');layer.hidden=true;root.append(layer);
 const nodes=new Map(),live=new Set(),cooldowns=new Map();
 let disposed=false,paused=true,poll=HUD_EFFECT_LIMITS.pollSeconds,ambientClock=0,previous=null,lastProgress=progressOf(getState()),emitted=0,peak=0;
 const find=selector=>{const existing=nodes.get(selector);if(existing&&existing.isConnected!==false)return existing;const found=doc.querySelector(selector);if(found)nodes.set(selector,found);return found;};
 const visible=node=>Boolean(node&&!node.hidden&&!node.closest?.('[hidden]'));
 const gate=()=>{const state=getState(),world=getWorld();return {state,world,quiet:Boolean(doc.hidden||media?.matches||state?.settings?.reduced),blocked:Boolean(!world?.active||world.blocked||world.suspended||isModal()||root.hidden)};};
 function clear(){for(const item of [...live]){item.animation.cancel();item.node.remove();live.delete(item);} }
 function suspend(){clear();layer.hidden=true;paused=true;previous=null;poll=HUD_EFFECT_LIMITS.pollSeconds;ambientClock=0;}
 function visibilityChanged(){const status=gate();if(status.quiet||status.blocked){suspend();if(status.quiet)lastProgress=progressOf(status.state);}}
 function emit(kind='interact',anchor='#interact',options={}) {
  const status=gate();if(disposed||status.quiet||status.blocked)return 0;
  const element=typeof anchor==='string'?find(anchor):anchor;
  if(!visible(element))return 0;
  const origin=hudEffectOrigin(element.getBoundingClientRect(),{width:win.innerWidth,height:win.innerHeight});if(!origin)return 0;
  const key=`${kind}:${element.id||element.className}`,time=clock();
  if(time-(cooldowns.get(key)??-Infinity)<HUD_EFFECT_LIMITS.cooldownMs)return 0;
  const available=HUD_EFFECT_LIMITS.live-live.size;if(available<=0)return 0;
  const specs=hudParticleSpecs(kind,{...options,random}).slice(0,available);if(!specs.length)return 0;
  cooldowns.set(key,time);layer.hidden=false;
  let added=0;
  for(const p of specs){
   const node=doc.createElement('i');node.className=`world-hud-particle world-hud-particle--${p.shape}`;
   node.style.cssText=`left:${origin.x}px;top:${origin.y}px;width:${p.size}px;height:${p.shape==='paper'?p.size*.62:p.size}px;`;
   // A browser lacking Web Animations gets no inert particles or fallback timers.
   if(typeof node.animate!=='function')continue;
   layer.append(node);
   const transform=(x,y,angle,scale=1)=>`translate3d(${x}px,${y}px,0) rotate(${angle}deg) scale(${scale})`;
   const animation=node.animate([
    {transform:transform(0,2,p.rotation,.45),opacity:0,offset:0},
    {transform:transform(p.dx*.25,p.dy*.33,p.rotation+p.spin*.3),opacity:p.opacity,offset:.2},
    {transform:transform(p.dx,p.dy,p.rotation+p.spin),opacity:p.opacity*.55,offset:.68},
    {transform:transform(p.dx+p.drift,p.dy-7,p.rotation+p.spin*1.3,.7),opacity:0,offset:1},
   ],{duration:p.duration,delay:p.delay,easing:'cubic-bezier(.18,.56,.36,1)',fill:'both'});
   const item={node,animation};live.add(item);added++;emitted++;
   const release=()=>{live.delete(item);node.remove();};animation.onfinish=release;animation.oncancel=release;
  }
  peak=Math.max(peak,live.size);return added;
 }
 function snapshot(){
  const route=find('#route-guide'),prop=find('#prop-interact'),interact=find('#interact'),resident=find('.resident-greet'),speed=find('#bicycle-status');
  return {arrived:visible(route)&&route.classList.contains('arrived'),prop:visible(prop),interact:visible(interact),resident:visible(resident),bell:doc.body.classList.contains('rang-bell')||doc.body.classList.contains('vehicle-horn'),riding:visible(speed)&&Number(speed.dataset.speed)>2};
 }
 function update(dt=0){
  if(disposed)return;
  const status=gate();
  if(status.quiet||status.blocked){if(!paused||live.size)suspend();if(status.quiet||!status.world?.active)lastProgress=progressOf(status.state);return;}
  if(paused){paused=false;layer.hidden=false;poll=HUD_EFFECT_LIMITS.pollSeconds;}
  const elapsed=clamp(Number.isFinite(dt)?dt:0,0,.25);poll+=elapsed;ambientClock+=elapsed;
  if(!automatic||poll<HUD_EFFECT_LIMITS.pollSeconds)return;poll=0;
  const current=snapshot(),progress=progressOf(status.state);
  if(progress>lastProgress)emit('collect',find('#adventure-trail')??find('#minimap'));lastProgress=progress;
  if(previous){
   if(current.arrived&&!previous.arrived)emit('arrival','#route-guide');
   if(current.prop&&!previous.prop)emit('interact','#prop-interact');
   if(current.interact&&!previous.interact)emit('interact','#interact');
   if(current.resident&&!previous.resident)emit('interact','.resident-greet');
   if(current.bell&&!previous.bell)emit('bell',find('#bicycle-status .bicycle-speed')??find('#bicycle-status'));
  }
  if(ambient&&current.riding&&ambientClock>=HUD_EFFECT_LIMITS.ambientSeconds){emit('leaf',find('#bicycle-status .bicycle-speed')??find('#bicycle-status'));ambientClock=0;}
  previous=current;
 }
 doc.addEventListener('visibilitychange',visibilityChanged);
 if(media?.addEventListener)media.addEventListener('change',visibilityChanged);else media?.addListener?.(visibilityChanged);
 return {update,emit,clear,diagnostics:()=>({live:live.size,peak,emitted,paused,disposed,limit:HUD_EFFECT_LIMITS.live,automatic,ambient}),dispose(){if(disposed)return;disposed=true;suspend();doc.removeEventListener('visibilitychange',visibilityChanged);if(media?.removeEventListener)media.removeEventListener('change',visibilityChanged);else media?.removeListener?.(visibilityChanged);layer.remove();nodes.clear();cooldowns.clear();}};
}
