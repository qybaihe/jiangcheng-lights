import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {bendPoint,unbendPoint,intersectCurvedGround,subdivideLongFaces,curvedSightline,STREET_RADIUS} from '../src/curved-world.js';
import {adventureHeightAt} from '../src/adventure-layout.js';

test('curved coordinates preserve tangent, height and inverse in every street quadrant',()=>{
  for(const center of[{x:1,z:21},{x:33,z:-16.2},{x:-20,z:0}]){
    const foot=new THREE.Vector3(center.x,.13,center.z);
    assert.ok(bendPoint(foot,center).distanceTo(foot)<1e-10);
    for(const dx of[-80,-20,-.001,0,20,80])for(const dz of[-80,-20,0,20,80])for(const y of[-.35,.13,1.93,15]){
      const p=new THREE.Vector3(center.x+dx,y,center.z+dz);
      assert.ok(unbendPoint(bendPoint(p,center),center).distanceTo(p)<1e-8);
    }
    const far=bendPoint(new THREE.Vector3(center.x,0,center.z+40),center);
    assert.ok(far.y<-5&&far.y>-6,'distant street visibly rolls below local horizon');
  }
});

test('rendered ray picking agrees with the visible road and sloping lookout',()=>{
  const center={x:33.6,z:1.2},heightAt=(x,z)=>adventureHeightAt(x,z)??.13;
  for(const[x,z]of[[33.6,-.3],[33.6,-7.5],[33,-16.2],[20,-20],[33.6,1.2]]){
    const p=new THREE.Vector3(x,heightAt(x,z),z),rendered=bendPoint(p,center);
    const origin=rendered.clone().add(new THREE.Vector3(0,8,0));
    const result=intersectCurvedGround(new THREE.Ray(origin,new THREE.Vector3(0,-1,0)),center,STREET_RADIUS,heightAt);
    assert.ok(result&&result.distanceTo(p)<.00005,`pick mismatch at ${x},${z}`);
  }
  assert.equal(intersectCurvedGround(new THREE.Ray(new THREE.Vector3(33,2,1),new THREE.Vector3(0,1,0)),center,STREET_RADIUS,heightAt),null);
});

test('overview mapping and picking remain flat',()=>{
  const center={x:12,z:-3},p=new THREE.Vector3(-6,.13,14);
  assert.deepEqual(bendPoint(p,center,Infinity),p);
  const ray=new THREE.Ray(new THREE.Vector3(-6,8,14),new THREE.Vector3(0,-1,0));
  assert.ok(intersectCurvedGround(ray,center,Infinity,()=>.13).distanceTo(p)<.00001);
});

test('curved sightlines cannot skip narrow walls or a low overhead beam',()=>{
  const center={x:0,z:0},box=(a,b)=>new THREE.Box3(new THREE.Vector3(...a),new THREE.Vector3(...b));
  assert.equal(curvedSightline(new THREE.Vector3(0,1,0),new THREE.Vector3(10,1,0),center,145,[box([4.9,.4,-1],[4.96,2,1])]),false);
  assert.equal(curvedSightline(new THREE.Vector3(0,2,8),new THREE.Vector3(0,2,0),center,145,[box([-1,2.03,3.9],[1,2.09,4.1])]),false);
  assert.equal(curvedSightline(new THREE.Vector3(0,2,8),new THREE.Vector3(0,2,0),center,145,[box([-1,3,3.9],[1,4,4.1])]),true);
});

test('large paving triangles are subdivided while retaining UVs and winding',()=>{
  const original=new THREE.PlaneGeometry(79,59).rotateX(-Math.PI/2),geometry=subdivideLongFaces(original,2),p=geometry.attributes.position;
  assert.ok(p.count>original.attributes.position.count);
  assert.equal(geometry.attributes.uv.count,p.count);
  let area=0;const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  for(let i=0;i<p.count;i+=3){
    a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1);c.fromBufferAttribute(p,i+2);
    assert.ok(Math.max(a.distanceTo(b),b.distanceTo(c),c.distanceTo(a))<=2.00001);
    area+=b.sub(a).cross(c.sub(a)).y/2;
  }
  assert.ok(Math.abs(area-79*59)<.0001);
  assert.equal(subdivideLongFaces(new THREE.BoxGeometry(1,1,1)).attributes.position.count,24);
});
