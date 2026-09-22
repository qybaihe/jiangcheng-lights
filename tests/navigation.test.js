import test from 'node:test';
import assert from 'node:assert/strict';
import {navigationCue} from '../src/navigation.js';
import {mapPoint,pathMarkup} from '../src/street-map.js';
test('route cue points to the safe first segment when the destination is behind a wall',()=>{
 const route={reachable:true,distance:16,path:[{x:0,z:0},{x:0,z:1},{x:0,z:4},{x:4,z:4},{x:4,z:-4}]};
 const cue=navigationCue(route,0);
 assert.match(cue.instruction,/转身/);assert.match(cue.detail,/左转/);
 assert.equal(Math.abs(cue.angle),Math.PI);
});
test('right and left turn guidance is relative to the camera heading',()=>{
 const route={reachable:true,distance:8,path:[{x:0,z:0},{x:1,z:0},{x:7,z:0}]};
 assert.match(navigationCue(route,0).instruction,/右/);
 assert.match(navigationCue(route,Math.PI).instruction,/左/);
 assert.match(navigationCue(route,Math.PI/2).instruction,/向前/);
});
test('arrival and unreachable destinations are explicit',()=>{
 assert.equal(navigationCue({reachable:true,distance:0,path:[{x:2,z:2}]}).arrived,true);
 assert.match(navigationCue({reachable:false,reason:'通道关闭'}).detail,/通道关闭/);
});
test('illustration route preserves corners and uses the same world-to-map transform',()=>{
 const path=[{x:-13,z:17},{x:0,z:17},{x:0,z:-20}];
 assert.deepEqual(mapPoint(path[0]),{x:270,y:480});
 assert.equal(pathMarkup({reachable:true,path}),'M270.0 480.0 L400.0 480.0 L400.0 110.0');
});
