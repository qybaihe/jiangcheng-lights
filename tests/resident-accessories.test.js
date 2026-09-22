import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {VRMLoaderPlugin,VRMUtils} from '@pixiv/three-vrm';
import {createCharacter} from '../src/characters.js';
import {installAvatarRig} from '../src/avatar-retarget.js';
import {addResidentAccessories,measureResidentFrame} from '../src/resident-accessories.js';
import {getResidentAvatarOption} from '../src/resident-avatar-catalog.js';

async function fixture(id,heading=.7){
  const loader=new GLTFLoader();
  loader.register(()=>({name:'OfflineTextureStub',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
  loader.register(parser=>new VRMLoaderPlugin(parser));
  const entry=getResidentAvatarOption(id);
  const bytes=fs.readFileSync(new URL(`../public${entry.url}`,import.meta.url));
  const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const vrm=gltf.userData.vrm;VRMUtils.rotateVRM0(vrm);
  const actor=createCharacter(null,'#fff','#222',false,id);actor.scale.setScalar(1);actor.position.set(-17,.6,1.5);actor.rotation.y=heading;
  const rig=installAvatarRig(actor,vrm,{targetHeight:entry.height});
  return {actor,npc:{id,group:actor},entry,vrm,rig};
}

test('resident accessory fit is measured in actor-local metres independent of street position and yaw',async()=>{
  const f=await fixture('granny'),a=measureResidentFrame(f.actor,f.vrm);
  f.actor.position.set(25,.13,-19);f.actor.rotation.y=-1.3;f.actor.updateMatrixWorld(true);
  const b=measureResidentFrame(f.actor,f.vrm);
  for(const key of['height','eyeY','eyeX','faceZ','torsoZ','shoulderY','shoulderHalf'])assert.ok(Math.abs(a[key]-b[key])<1e-5,key);
  assert.ok(a.eyeY>1.3&&a.eyeY<1.64);assert.ok(a.faceZ>0&&a.faceZ<.3);
  f.rig.dispose();
});

for(const id of['granny','chef','dock','community','walker0','walker1','walker2','walker3','walker4']){
  test(`${id} retains distinct visible everyday accessories without animated shadow passes`,async()=>{
    const f=await fixture(id),props=addResidentAccessories(f);
    assert.ok(props.meshes.length>=1&&props.meshes.length<=4);assert.ok(props.metrics.details.length>=1);
    assert.ok(Math.abs(props.metrics.fit.height-f.entry.height)<1e-6,'attachment fit uses this resident’s shipped height and mesh');
    assert.ok(props.metrics.triangles>0&&props.metrics.triangles<12000);
    const ancestors=[];
    for(const mesh of props.meshes){
      assert.equal(mesh.castShadow,false);assert.equal(mesh.material.transparent,false);assert.equal(mesh.material.vertexColors,true);
      assert.ok(mesh.parent.parent.isBone);ancestors.push(mesh.parent);
      const position=mesh.geometry.attributes.position;for(const value of position.array)assert.ok(Number.isFinite(value));
    }
    const first=props.meshes[0],at=first.getWorldPosition(new THREE.Vector3());f.actor.position.x+=2;f.actor.updateMatrixWorld(true);
    assert.ok(Math.abs(first.getWorldPosition(new THREE.Vector3()).x-at.x-2)<1e-6,'attachments travel with their resident');
    props.dispose();props.dispose();assert.ok(ancestors.every(root=>root.parent===null));
    assert.equal(f.rig.visualRoot.parent,f.actor,'disposing props preserves the imported person');f.rig.dispose();
  });
}
