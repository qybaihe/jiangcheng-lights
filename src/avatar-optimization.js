import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const materialsOf=mesh=>Array.isArray(mesh.material)?mesh.material:[mesh.material];
const meshesOf=root=>{const meshes=[];root.traverse(node=>{if(node.isMesh)meshes.push(node);});return meshes;};

function measure(meshes) {
  let estimatedDrawCalls=0,triangles=0,declaredVertices=0;
  for(const mesh of meshes){
    const geometry=mesh.geometry,count=geometry.index?.count??geometry.attributes.position?.count??0;
    triangles+=count/3;declaredVertices+=geometry.attributes.position?.count??0;
    if(!mesh.visible)continue;
    const draws=Array.isArray(mesh.material)?geometry.groups.map(group=>mesh.material[group.materialIndex]):[mesh.material];
    for(const material of draws)if(material?.visible)estimatedDrawCalls+=material.transparent&&material.side===THREE.DoubleSide&&!material.forceSinglePass?2:1;
  }
  return {meshes:meshes.length,skinnedMeshes:meshes.filter(mesh=>mesh.isSkinnedMesh).length,estimatedDrawCalls,triangles,declaredVertices};
}

// Copy only referenced vertices. Each VRoid hair primitive can otherwise
// retain the entire hairstyle's shared POSITION/skin attribute buffers.
function compact(geometry) {
  const count=geometry.index?.count??geometry.attributes.position.count;
  const remap=new Map(),source=[],indices=[];
  for(let i=0;i<count;i++){
    const old=geometry.index?geometry.index.getX(i):i;
    if(!remap.has(old)){remap.set(old,source.length);source.push(old);}
    indices.push(remap.get(old));
  }
  const result=new THREE.BufferGeometry();
  for(const [name,attribute] of Object.entries(geometry.attributes)){
    const array=new attribute.array.constructor(source.length*attribute.itemSize);
    for(let i=0;i<source.length;i++)for(let j=0;j<attribute.itemSize;j++)array[i*attribute.itemSize+j]=attribute.array[source[i]*attribute.itemSize+j];
    const copy=new THREE.BufferAttribute(array,attribute.itemSize,attribute.normalized);
    copy.name=attribute.name;copy.setUsage(attribute.usage);copy.gpuType=attribute.gpuType;
    result.setAttribute(name,copy);
  }
  result.setIndex(indices);return result;
}

function drawLayout(mesh) {
  const geometry=mesh.geometry,count=geometry.index?.count??geometry.attributes.position?.count??0;
  if(count===0||count%3!==0||geometry.drawRange.start!==0||geometry.drawRange.count<count)return null;
  if(!Array.isArray(mesh.material))return [];
  // MToon can render the complete geometry once per material (surface and
  // outline). Partial/mixed groups require a different batching strategy.
  if(!geometry.groups.length||geometry.groups.some(group=>group.start!==0||group.count!==count||!mesh.material[group.materialIndex]))return null;
  return geometry.groups.map(group=>group.materialIndex);
}

/**
 * Batch compatible, opaque, morph-free VRM primitives before installation or
 * rendering. Bone objects, skeletons, materials and expression targets stay
 * intact. In particular, no bind matrices or skin indices are reinterpreted.
 */
export function optimizeAvatarMeshes(vrm) {
  if(!vrm?.scene?.isObject3D)throw new Error('Avatar optimization requires a loaded VRM scene');
  const scene=vrm.scene;scene.updateMatrixWorld(true);
  const meshes=meshesOf(scene),before=measure(meshes),protectedNodes=new Set();
  for(const mesh of meshes)for(const bone of mesh.skeleton?.bones??[])protectedNodes.add(bone);
  for(const expression of vrm.expressionManager?.expressions??[])for(const bind of expression.binds??[])for(const primitive of bind.primitives??[])protectedNodes.add(primitive);
  for(const bone of Object.values(vrm.humanoid?.humanBones??{}))protectedNodes.add(bone.node);
  for(const joint of vrm.springBoneManager?.joints??[])for(const node of [joint.bone,joint.child,joint.center])if(node)protectedNodes.add(node);
  for(const constraint of vrm.nodeConstraintManager?.constraints??[])for(const node of [constraint.source,constraint.destination])if(node)protectedNodes.add(node);
  const annotations=vrm.firstPerson?.meshAnnotations??[];
  const memberships=new Map();
  annotations.forEach((annotation,index)=>{for(const mesh of annotation.meshes??[]){if(!memberships.has(mesh))memberships.set(mesh,[]);memberships.get(mesh).push(index);}});
  const ids=new WeakMap();let serial=0;
  const id=object=>{if(!object)return null;if(!ids.has(object))ids.set(object,++serial);return ids.get(object);};
  const groups=new Map();
  for(const mesh of meshes){
    if(!mesh.isSkinnedMesh||!mesh.skeleton||mesh.children.length||protectedNodes.has(mesh))continue;
    const geometry=mesh.geometry,materials=materialsOf(mesh),layout=drawLayout(mesh);
    if(layout===null||Object.values(geometry.morphAttributes).some(attributes=>attributes.length))continue;
    // Blended surfaces rely on object ordering; alpha-tested hair does not.
    if(materials.some(material=>!material||material.transparent))continue;
    if(mesh.onBeforeRender!==THREE.Object3D.prototype.onBeforeRender||mesh.onAfterRender!==THREE.Object3D.prototype.onAfterRender)continue;
    const attributes=Object.entries(geometry.attributes).sort(([a],[b])=>a.localeCompare(b));
    if(!geometry.attributes.position||!geometry.attributes.skinIndex||!geometry.attributes.skinWeight||attributes.some(([,a])=>a.isInterleavedBufferAttribute||a.isInstancedBufferAttribute||a.isFloat16BufferAttribute||a.count!==geometry.attributes.position.count))continue;
    const key=JSON.stringify({parent:id(mesh.parent),skeleton:id(mesh.skeleton),materials:materials.map(id),array:Array.isArray(mesh.material),layout,
      transform:mesh.matrix.toArray(),bind:mesh.bindMatrix.toArray(),inverseBind:mesh.bindMatrixInverse.toArray(),bindMode:mesh.bindMode,
      visible:mesh.visible,layers:mesh.layers.mask,renderOrder:mesh.renderOrder,castShadow:mesh.castShadow,receiveShadow:mesh.receiveShadow,
      frustumCulled:mesh.frustumCulled,matrixAutoUpdate:mesh.matrixAutoUpdate,matrixWorldAutoUpdate:mesh.matrixWorldAutoUpdate,
      customDepth:id(mesh.customDepthMaterial),customDistance:id(mesh.customDistanceMaterial),annotations:memberships.get(mesh)??[],
      attributes:attributes.map(([name,a])=>[name,a.array.constructor.name,a.itemSize,a.normalized,a.gpuType,a.usage])});
    if(!groups.has(key))groups.set(key,{meshes:[],layout});groups.get(key).meshes.push(mesh);
  }
  const merged=[],replacements=new Map();
  for(const group of groups.values()){
    if(group.meshes.length<2)continue;
    const pieces=group.meshes.map(mesh=>compact(mesh.geometry));
    const geometry=mergeGeometries(pieces,false);
    for(const piece of pieces)piece.dispose();
    if(!geometry)continue;
    for(const [name,attribute] of Object.entries(geometry.attributes)){
      attribute.name=group.meshes[0].geometry.attributes[name].name;
      attribute.setUsage(group.meshes[0].geometry.attributes[name].usage);
    }
    for(const materialIndex of group.layout)geometry.addGroup(0,geometry.index.count,materialIndex);
    const first=group.meshes[0];
    const names=group.meshes.map(mesh=>mesh.name);
    first.geometry=geometry;first.boundingBox=null;first.boundingSphere=null;
    first.userData.avatarBatch={sourceMeshes:names};
    for(const mesh of group.meshes){replacements.set(mesh,first);if(mesh!==first)mesh.removeFromParent();}
    merged.push({materials:materialsOf(first).map(material=>material.name),sourceMeshes:names,vertices:geometry.attributes.position.count,triangles:geometry.index.count/3});
  }
  // Keep VRM's optional first-person setup referring to the surviving meshes.
  for(const annotation of annotations)annotation.meshes=[...new Set(annotation.meshes.map(mesh=>replacements.get(mesh)??mesh))];
  const after=measure(meshesOf(scene));
  return {before,after,mergedGroups:merged.length,removedMeshes:before.meshes-after.meshes,savedDrawCalls:before.estimatedDrawCalls-after.estimatedDrawCalls,groups:merged};
}
