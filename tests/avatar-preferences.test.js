import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,loadState,SAVE_KEY} from '../src/story.js';
import {getAvatarOption} from '../src/avatar-catalog.js';

test('legacy saves keep progress and receive the original female character',()=>{
  const old={version:1,started:true,flags:['received','radio'],lore:['clock'],supplies:['box'],position:{x:12,z:8},seconds:193,settings:{sound:true,cameraMode:'first'}};
  const loaded=loadState({getItem:()=>JSON.stringify(old)});
  assert.equal(loaded.settings.avatarId,'female');
  assert.equal(loaded.settings.cameraMode,'first');
  for(const key of ['flags','lore','supplies','position','seconds','started'])assert.deepEqual(loaded[key],old[key]);
});

test('both character choices survive saving without changing story progress',()=>{
  for(const avatarId of ['female','male']){
    const state={...freshState(),flags:['received'],position:{x:-9.5,z:17},settings:{...freshState().settings,avatarId}};
    const loaded=loadState({getItem:key=>{assert.equal(key,SAVE_KEY);return JSON.stringify(state);}});
    assert.equal(loaded.settings.avatarId,avatarId);
    assert.deepEqual(loaded.flags,state.flags);assert.deepEqual(loaded.position,state.position);
  }
});

test('unknown and malformed character preferences resolve to a packaged model',()=>{
  for(const avatarId of [undefined,null,'invalid','https://example.invalid/hero.vrm','__proto__',{},42]){
    assert.equal(getAvatarOption(avatarId).id,'female');
    const loaded=loadState({getItem:()=>JSON.stringify({...freshState(),settings:{avatarId}})});
    assert.equal(loaded.settings.avatarId,'female');
  }
});
