import test from 'node:test';
import assert from 'node:assert/strict';
import {playBicycleBell} from '../src/foley.js';

function fakeAudio(){
 const nodes=[],bus={name:'effects'};
 const make=(type)=>{const node={type,connections:[],disconnected:false,connect(target){this.connections.push(target);},disconnect(){this.disconnected=true;}};nodes.push(node);return node;};
 const context={state:'running',currentTime:10,destination:{name:'master'},createOscillator(){return Object.assign(make('oscillator'),{frequency:{value:0},start(time){this.started=time;},stop(time){this.stopped=time;}});},createGain(){const events=[];return Object.assign(make('gain'),{events,gain:{setValueAtTime:(...x)=>events.push(['set',...x]),linearRampToValueAtTime:(...x)=>events.push(['linear',...x]),exponentialRampToValueAtTime:(...x)=>events.push(['exponential',...x])}});}};
 return {context,nodes,bus};
}
test('bicycle bell has two brief strikes on the effects bus and releases all nodes',()=>{
 const {context,nodes,bus}=fakeAudio();playBicycleBell(context,bus);
 const oscillators=nodes.filter(x=>x.type==='sine'),gains=nodes.filter(x=>x.gain);
 assert.equal(oscillators.length,6);assert.equal(gains.length,6);
 assert.deepEqual([...new Set(oscillators.map(x=>x.started))],[10,10.095]);
 assert.ok(gains.every(g=>g.connections[0]===bus));assert.ok(oscillators.every(o=>o.stopped-o.started<.66));
 oscillators.forEach(o=>o.onended());assert.ok(nodes.every(n=>n.disconnected));
});
test('missing or suspended audio stays silent without creating nodes',()=>{
 playBicycleBell(null);const {context,nodes,bus}=fakeAudio();context.state='suspended';playBicycleBell(context,bus);assert.equal(nodes.length,0);
});
