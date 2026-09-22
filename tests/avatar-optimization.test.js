import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {VRMLoaderPlugin,VRMUtils} from '@pixiv/three-vrm';
import {optimizeAvatarMeshes} from '../src/avatar-optimization.js';
import {installAvatarRig} from '../src/avatar-retarget.js';
import {createCharacter} from '../src/characters.js';
import {updateTownLife} from '../src/town-life.js';

async function loadAvatar() {
  const loader=new GLTFLoader();
  loader.register(()=>({name:'OfflineTextureStub',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
  loader.register(parser=>new VRMLoaderPlugin(parser));
  const bytes=fs.readFileSync(new URL('../public/models/ayao.vrm',import.meta.url));
  const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const vrm=gltf.userData.vrm;VRMUtils.rotateVRM0(vrm);vrm.scene.updateMatrixWorld(true);return vrm;
}

function meshesOf(root) {const result=[];root.traverse(node=>{if(node.isMesh)result.push(node);});return result;}
function snapshot(mesh) {
  const proxy=new THREE.SkinnedMesh(mesh.geometry,mesh.material);
  proxy.skeleton=mesh.skeleton;proxy.bindMatrix.copy(mesh.bindMatrix);proxy.bindMatrixInverse.copy(mesh.bindMatrixInverse);
  proxy.matrixWorld.copy(mesh.matrixWorld);return proxy;
}

test('shipped avatar batches hair without changing any indexed vertex attribute or triangle',async()=>{
  const vrm=await loadAvatar(),source=new Map(meshesOf(vrm.scene).map(mesh=>[mesh.name,snapshot(mesh)]));
  const meta=vrm.meta,stats=optimizeAvatarMeshes(vrm),after=new Map(meshesOf(vrm.scene).map(mesh=>[mesh.name,mesh]));
  assert.equal(stats.before.meshes,90);assert.equal(stats.after.meshes,21);
  assert.equal(stats.mergedGroups,4);assert.equal(stats.removedMeshes,69);assert.equal(stats.savedDrawCalls,69);
  assert.equal(stats.before.triangles,24854);assert.equal(stats.after.triangles,24854);
  assert.ok(stats.after.declaredVertices<stats.before.declaredVertices/5,'do not duplicate the entire shared hair buffer for every primitive');
  assert.equal(vrm.meta,meta);
  for(const group of stats.groups){
    const destination=after.get(group.sourceMeshes[0]);let cursor=0;
    for(const name of group.sourceMeshes){
      const original=source.get(name),a=original.geometry,b=destination.geometry;
      assert.equal(destination.skeleton,original.skeleton);assert.equal(destination.material,original.material);
      assert.deepEqual(destination.bindMatrix.toArray(),original.bindMatrix.toArray());
      for(let i=0;i<a.index.count;i++,cursor++){
        const old=a.index.getX(i),next=b.index.getX(cursor);
        for(const key of Object.keys(a.attributes)){
          const from=a.attributes[key],to=b.attributes[key];
          for(let component=0;component<from.itemSize;component++)assert.equal(to.getComponent(next,component),from.getComponent(old,component),`${name}: ${key}`);
        }
      }
    }
    assert.equal(cursor,destination.geometry.index.count);
  }
  const again=optimizeAvatarMeshes(vrm);
  assert.equal(again.removedMeshes,0);assert.equal(again.savedDrawCalls,0);assert.equal(again.after.meshes,21);
});

test('animated merged skin matches every source triangle while expressions and springs retain their nodes',async()=>{
  const vrm=await loadAvatar(),originalMeshes=meshesOf(vrm.scene);
  const source=new Map(originalMeshes.map(mesh=>[mesh.name,snapshot(mesh)]));
  const morphs=originalMeshes.filter(mesh=>Object.values(mesh.geometry.morphAttributes).some(list=>list.length)).map(mesh=>({mesh,geometry:mesh.geometry,weights:mesh.morphTargetInfluences}));
  const springs=[...vrm.springBoneManager.joints],expressions=vrm.expressionManager.expressions.map(expression=>({expression,binds:expression.binds.slice()}));
  const stats=optimizeAvatarMeshes(vrm),destinations=new Map(meshesOf(vrm.scene).map(mesh=>[mesh.name,mesh]));
  const actor=createCharacter(null,'#fff','#000',true,'player');actor.position.set(12,.85,-8);actor.rotation.y=1.2;
  const bridge=installAvatarRig(actor,vrm);
  const world={player:actor,npcs:[],active:true,suspended:false,blocked:false,reduced:false,walking:true,moveSpeed:5.6,movementDistance:5.6/60,
    heightAt:()=>.85,canWalk:()=>true,storyFlags:new Set(),playerMotion:{grounded:true,phase:'grounded',acceleration:0},callbacks:{}};
  const p=new THREE.Vector3(),q=new THREE.Vector3();let maxError=0;
  for(let frame=0;frame<30;frame++){
    updateTownLife(world,1/60,frame/60);bridge.update(1/60,frame/60);actor.updateMatrixWorld(true);
    if(frame%10!==0)continue;
    for(const group of stats.groups){
      const destination=destinations.get(group.sourceMeshes[0]);let cursor=0;
      destination.skeleton.update();
      for(const name of group.sourceMeshes){
        const original=source.get(name);original.matrixWorld.copy(destination.matrixWorld);original.bindMatrixInverse.copy(destination.bindMatrixInverse);
        for(let i=0;i<original.geometry.index.count;i++,cursor++){
          original.getVertexPosition(original.geometry.index.getX(i),p).applyMatrix4(original.matrixWorld);
          destination.getVertexPosition(destination.geometry.index.getX(cursor),q).applyMatrix4(destination.matrixWorld);
          assert.ok(Number.isFinite(q.x+q.y+q.z));maxError=Math.max(maxError,p.distanceTo(q));
        }
      }
    }
  }
  assert.ok(maxError<1e-6,`merged skinned vertex error ${maxError} m`);
  assert.equal(vrm.springBoneManager.joints.size,springs.length);
  for(const joint of springs){assert.ok(vrm.springBoneManager.joints.has(joint));assert.ok(joint.bone.parent);}
  for(const {mesh,geometry,weights} of morphs){assert.ok(mesh.parent);assert.equal(mesh.geometry,geometry);assert.equal(mesh.morphTargetInfluences,weights);}
  for(const {expression,binds} of expressions)for(const [index,bind] of binds.entries())assert.equal(expression.binds[index],bind);
  vrm.expressionManager.setValue('blink',1);vrm.update(0);
  assert.ok(morphs.some(({mesh})=>mesh.morphTargetInfluences.some(value=>value>0)),'blink must still reach the original face primitives');
  const live=new Set(meshesOf(vrm.scene));
  for(const annotation of vrm.firstPerson.meshAnnotations)for(const mesh of annotation.meshes)assert.ok(live.has(mesh),'first-person annotations must not point at removed primitives');
});

function synthetic() {
  const scene=new THREE.Group(),bone=new THREE.Bone();scene.add(bone);
  const skeleton=new THREE.Skeleton([bone],[new THREE.Matrix4()]),material=new THREE.MeshBasicMaterial();
  function add({parent=scene,skin=skeleton,mat=material}={}){
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));
    geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Array(12).fill(0),4));
    geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0],4));
    geometry.setIndex([0,1,2]);const mesh=new THREE.SkinnedMesh(geometry,mat);parent.add(mesh);mesh.bind(skin,new THREE.Matrix4());return mesh;
  }
  return {vrm:{scene},scene,bone,skeleton,material,add};
}

for(const [name,change] of [
  ['different material object',(f,m)=>{m.material=f.material.clone();}],
  ['different skeleton object',(f,m)=>{m.skeleton=new THREE.Skeleton([f.bone],[new THREE.Matrix4()]);}],
  ['different transform',(f,m)=>{m.position.x=.1;}],
  ['different bind matrix',(f,m)=>{m.bindMatrix.makeTranslation(.1,0,0);}],
  ['different parent',(f,m)=>{const parent=new THREE.Group();f.scene.add(parent);parent.add(m);}],
  ['morph attributes',(f,m)=>{m.geometry.morphAttributes.position=[m.geometry.attributes.position.clone()];}],
  ['animated children',(f,m)=>{m.add(new THREE.Bone());}],
  ['custom render callback',(f,m)=>{m.onBeforeRender=()=>{};}],
  ['partial draw range',(f,m)=>{m.geometry.setDrawRange(0,0);}],
  ['expression binding',(f,m)=>{f.vrm.expressionManager={expressions:[{binds:[{primitives:[m]}]}]};}],
  ['spring node',(f,m)=>{f.vrm.springBoneManager={joints:new Set([{bone:m}])};}],
  ['transparent materials',(f)=>{f.material.transparent=true;}],
])test(`incompatible meshes are preserved: ${name}`,()=>{
  const f=synthetic();f.add();const second=f.add();change(f,second);
  const result=optimizeAvatarMeshes(f.vrm);assert.equal(result.removedMeshes,0);assert.equal(meshesOf(f.scene).length,2);
});

test('matching full-geometry material passes remain two passes after batching',()=>{
  const f=synthetic(),materials=[f.material,new THREE.MeshBasicMaterial()];
  for(let i=0;i<3;i++){const mesh=f.add({mat:materials});mesh.geometry.addGroup(0,3,0);mesh.geometry.addGroup(0,3,1);}
  const result=optimizeAvatarMeshes(f.vrm),[mesh]=meshesOf(f.scene);
  assert.equal(result.removedMeshes,2);assert.equal(result.before.estimatedDrawCalls,6);assert.equal(result.after.estimatedDrawCalls,2);
  assert.deepEqual(mesh.geometry.groups,[{start:0,count:9,materialIndex:0},{start:0,count:9,materialIndex:1}]);
});
