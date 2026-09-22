import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {vehicleSpeedReading,vehicleSpeedDialMarkup} from '../src/ui/prop-interactions.js';
import {HUD_EFFECT_LIMITS,hudEffectOrigin,hudParticleSpecs,createWorldHudEffects} from '../src/ui/world-hud-effects.js';

class Element {
 constructor(doc){this.ownerDocument=doc;this.children=[];this.style={};this.dataset={};this.attributes={};this.hidden=false;this.isConnected=true;this.listeners=new Map();this.rect={left:24,top:600,width:100,height:86};this.className='';this.classList={contains:name=>this.className.split(' ').includes(name),add:name=>{this.className+=' '+name;},remove:name=>{this.className=this.className.split(' ').filter(x=>x!==name).join(' ');}};}
 append(node){this.children.push(node);node.parent=this;}
 remove(){this.isConnected=false;if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
 setAttribute(key,value){this.attributes[key]=value;}
 closest(){return this.hidden||this.parent?.hidden?this:null;}
 getBoundingClientRect(){return this.rect;}
 animate(keyframes,options){const animation={keyframes,options,cancel(){this.cancelled=true;this.oncancel?.();},finish(){this.onfinish?.();}};this.animation=animation;return animation;}
}
function harness(){
 const listeners=new Map(),mediaListeners=new Map(),nodes=new Map();let time=1000,modal=false;
 const media={matches:false,addEventListener:(k,cb)=>mediaListeners.set(k,cb),removeEventListener:k=>mediaListeners.delete(k)};
 const doc={hidden:false,defaultView:{innerWidth:1440,innerHeight:900,matchMedia:()=>media},createElement(){return new Element(doc);},querySelector:selector=>nodes.get(selector)||null,addEventListener:(k,cb)=>listeners.set(k,cb),removeEventListener:k=>listeners.delete(k)};
 doc.body=new Element(doc);const root=new Element(doc),state={settings:{reduced:false},adventure:{found:[]},lore:[],wuhanVisits:[]},world={active:true,blocked:false};
 for(const selector of ['#interact','#prop-interact','#route-guide','.resident-greet','#bicycle-status','#adventure-trail','#minimap','#bicycle-status .bicycle-speed']){const node=new Element(doc);node.id=selector;nodes.set(selector,node);root.append(node);}
 nodes.get('#bicycle-status').dataset.speed='0';
 const effects=createWorldHudEffects(root,{getState:()=>state,getWorld:()=>world,isModal:()=>modal,now:()=>time,random:()=>.5});
 return {effects,doc,root,state,world,nodes,media,listeners,mediaListeners,modal(value){modal=value;},advance(dt=.2){time+=dt*1000;effects.update(dt);},visibility(){listeners.get('visibilitychange')?.();},systemReduced(value){media.matches=value;mediaListeners.get('change')?.();}};
}

test('brass dial keeps real speed, finite positive values and a bounded 240-degree sweep',()=>{
 assert.deepEqual(vehicleSpeedReading(0),{kmh:0,angle:-120,max:40});
 assert.deepEqual(vehicleSpeedReading(7.8),{kmh:28,angle:48,max:40});
 assert.deepEqual(vehicleSpeedReading(-2.7),{kmh:10,angle:-60,max:40});
 for(const bad of [NaN,Infinity,undefined,'5'])assert.equal(vehicleSpeedReading(bad).kmh,0);
 assert.equal(vehicleSpeedReading(100).angle,120);
 const markup=vehicleSpeedDialMarkup();assert.match(markup,/role="meter"/);assert.match(markup,/aria-valuetext="0 公里每小时"/);assert.match(markup,/<b>0<\/b>/);assert.match(markup,/class="vehicle-speed-needle"/);
 assert.equal((markup.match(/class="major"/g)||[]).length,5);assert.equal((markup.match(/class="minor"/g)||[]).length,16);
});

test('particle geometry stays small and on-screen at both required landscape sizes',()=>{
 for(const viewport of [{width:1440,height:900},{width:1280,height:720}]){
  const origin=hudEffectOrigin({left:viewport.width-160,top:viewport.height-65,width:160,height:60},viewport);
  assert.ok(origin.x>=22&&origin.x<=viewport.width-22);assert.ok(origin.y>=28&&origin.y<=viewport.height-22);
  const corner=hudEffectOrigin({left:-8,top:0,width:20,height:48},viewport);assert.deepEqual(corner,{x:22,y:28});
 }
 assert.equal(hudEffectOrigin({left:2000,top:0,width:10,height:10}),null);assert.equal(hudEffectOrigin({left:0,top:0,width:0,height:10}),null);
 for(const kind of ['collect','leaf','bell','arrival','interact'])for(const random of [()=>0,()=>.5,()=>1]){
  const specs=hudParticleSpecs(kind,{count:100,random});assert.equal(specs.length,HUD_EFFECT_LIMITS.burst);
  for(const p of specs){assert.ok(p.size<=8&&Math.abs(p.dx)<=35&&Math.abs(p.dy)<=46);assert.ok(p.duration<=1450&&p.opacity<.8);}
 }
});

test('DOM effects cap live nodes, rate-limit duplicates and release completed animation nodes',()=>{
 const h=harness();h.advance();const first=h.effects.emit('collect','#interact');assert.equal(first,7);
 assert.equal(h.effects.emit('collect','#interact'),0,'same event is debounced');
 assert.equal(h.effects.emit('collect','#minimap'),7);assert.equal(h.effects.emit('bell','#route-guide'),2);assert.equal(h.effects.emit('leaf','#prop-interact'),0);
 assert.equal(h.effects.diagnostics().live,16);assert.equal(h.effects.diagnostics().peak,16);
 const layer=h.root.children.at(-1);assert.equal(layer.attributes['aria-hidden'],'true');
 for(const node of [...layer.children])node.animation.finish();assert.equal(h.effects.diagnostics().live,0);assert.equal(layer.children.length,0);
 h.effects.dispose();assert.equal(h.listeners.size,0);assert.equal(h.mediaListeners.size,0);assert.equal(layer.isConnected,false);assert.equal(h.effects.emit('leaf','#minimap'),0);
});

test('hidden tab, modal, user reduced motion and OS reduced motion stop and clear every accent',()=>{
 for(const pause of [h=>{h.doc.hidden=true;h.visibility();},h=>{h.modal(true);h.advance(.001);},h=>{h.state.settings.reduced=true;h.advance(.001);},h=>h.systemReduced(true),h=>{h.world.active=false;h.advance(.001);},h=>{h.world.blocked=true;h.advance(.001);}]){
  const h=harness();h.advance();h.effects.emit('leaf','#minimap');assert.equal(h.effects.diagnostics().live,3);pause(h);assert.equal(h.effects.diagnostics().live,0);assert.equal(h.effects.emit('leaf','#interact'),0);h.effects.dispose();
 }
});

test('HUD feedback observes transitions without mutating world or saved progression',()=>{
 const h=harness();h.nodes.get('#route-guide').hidden=true;h.nodes.get('#prop-interact').hidden=true;h.advance();
 const before=structuredClone({state:h.state,world:h.world});h.nodes.get('#route-guide').hidden=false;h.nodes.get('#route-guide').classList.add('arrived');h.advance();assert.equal(h.effects.diagnostics().live,5);
 assert.deepEqual({state:h.state,world:h.world},before);h.effects.clear();h.modal(true);h.advance();h.state.adventure.found.push('earned-in-dialogue');h.modal(false);h.advance();assert.equal(h.effects.diagnostics().live,7,'a just-earned memory gets one small paper accent after its modal closes');h.effects.dispose();
});

test('no Web Animations support produces no static particle residue',()=>{
 const h=harness(),create=h.doc.createElement;h.doc.createElement=()=>{const node=create();node.animate=undefined;return node;};h.advance();assert.equal(h.effects.emit('collect','#minimap'),0);assert.equal(h.effects.diagnostics().live,0);h.effects.dispose();
});

test('landscape theme keeps a narrow 1440/1280 side rail and real 48px actions',()=>{
 const css=readFileSync(new URL('../src/ui/world-hud-theme.css',import.meta.url),'utf8');
 assert.match(css,/--hud-rail:260px;--hud-map:156px/);assert.match(css,/--hud-rail:244px;--hud-map:148px/);
 assert.match(css,/@media\(max-height:760px\) and \(min-width:901px\)/);
 assert.match(css,/#quest-route\{min-height:48px/);assert.match(css,/#route-stop\{[^}]*min-width:48px;min-height:48px/);
 assert.match(css,/\.camera-toolbar[^}]*min-height:48px/);assert.match(css,/prefers-reduced-motion:reduce/);
 const source=readFileSync(new URL('../src/ui/world-hud-effects.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/requestAnimationFrame\s*\(|setInterval\s*\(|setTimeout\s*\(/,'the main loop owns lifecycle; no independent scheduling');
});
