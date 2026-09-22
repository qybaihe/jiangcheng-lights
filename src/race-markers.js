import * as THREE from 'three';
import {RACE_COURSES} from './neighborhood-races.js';

/** A single reusable paper-gold gate. It neither owns race state nor adds
 * colliders/lights/shadows; geometry is allocated once, not per frame. */
export function createRaceMarkers(world) {
 const root = new THREE.Group(); root.name = '街坊小赛 · 下一道门'; root.visible = false;
 const gold = new THREE.MeshBasicMaterial({color: '#efd59b', transparent: true, opacity: .87, depthWrite: false});
 const jade = new THREE.MeshBasicMaterial({color: '#73b9a7', transparent: true, opacity: .85, depthWrite: false});
 const paper = new THREE.MeshBasicMaterial({color: '#fff1ce', transparent: true, opacity: .78, depthWrite: false, side: THREE.DoubleSide});
 const mesh = (geometry, material, parent = root) => {
  const m = new THREE.Mesh(geometry, material); m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false; parent.add(m); return m;
 };
 const ring = mesh(new THREE.RingGeometry(.94, 1, 64), gold); ring.rotation.x = -Math.PI / 2; ring.position.y = .05;
 const arrowShape = new THREE.Shape(); arrowShape.moveTo(0, .8); arrowShape.lineTo(-.5, -.05); arrowShape.lineTo(-.15, .04); arrowShape.lineTo(-.15, -.7); arrowShape.lineTo(.15, -.7); arrowShape.lineTo(.15, .04); arrowShape.lineTo(.5, -.05); arrowShape.closePath();
 const arrow = mesh(new THREE.ShapeGeometry(arrowShape), paper); arrow.rotation.x = -Math.PI / 2; arrow.rotation.z = Math.PI; arrow.position.y = .08;
 const posts = [], floats = [];
 for (const side of [-1, 1]) {
  const p = new THREE.Group(); root.add(p); posts.push(p); p.userData.side = side;
  const pole = mesh(new THREE.CylinderGeometry(.034, .049, 1.45, 8), gold, p); pole.position.y = .77;
  const pennant = mesh(new THREE.PlaneGeometry(.58, .24), paper, p); pennant.position.set(side * .27, 1.39, 0); pennant.rotation.y = side * -.11;
  const band = mesh(new THREE.CylinderGeometry(.075, .075, .18, 12), jade, p); band.position.y = .56;
  const float = mesh(new THREE.CylinderGeometry(.36, .43, .23, 14), jade, p); float.position.y = .08; floats.push(float);
 }
 const progressDots = new THREE.Group(); root.add(progressDots);
 for (let i = 0; i < 3; i++) {const dot = mesh(new THREE.CircleGeometry(.085, 12), paper, progressDots); dot.rotation.x = -Math.PI / 2; dot.position.set(0, .066, -1.8 - i * .56);}
 world.scene.add(root); world.curvedWorld?.attach(root);
 let disposed = false, activeKey = null;
 const clear = () => {root.visible = false; activeKey = null;};
 return {
  update(snapshot) {
   if (disposed) return;
   const c = RACE_COURSES[snapshot?.courseId], cp = snapshot?.nextCheckpoint;
   if (!c || !cp || !['countdown', 'running'].includes(snapshot.status)) {clear(); return;}
   const key = `${c.id}:${snapshot.nextCheckpointIndex}`;
   if (key !== activeKey) {
    activeKey = key;
    const previous = snapshot.nextCheckpointIndex > 0 ? c.checkpoints[snapshot.nextCheckpointIndex - 1] : c.start;
    const ground = c.mode === 'boat' ? (world.water?.position.y ?? -.35) : world.heightAt(cp.x, cp.z);
    root.position.set(cp.x, Number.isFinite(ground) ? ground + .04 : .18, cp.z);
    root.rotation.y = Math.atan2(cp.x - previous.x, cp.z - previous.z);
    ring.scale.set(cp.radius, cp.radius, 1);
    for (const p of posts) p.position.x = p.userData.side * cp.radius;
    for (const float of floats) float.visible = c.mode === 'boat';
    root.userData.courseId = c.id; root.userData.checkpointIndex = snapshot.nextCheckpointIndex;
   }
   root.visible = true;
   const pulse = snapshot.paused ? .66 : .77 + Math.sin(snapshot.elapsed * 2.4) * .10;
   gold.opacity = pulse; jade.opacity = pulse + .02;
   root.userData.paused = snapshot.paused === true;
  },
  clear,
  dispose() {
   if (disposed) return; disposed = true; clear(); root.removeFromParent();
   const geometries = new Set(), materials = new Set();
   root.traverse(obj => {if (obj.geometry) geometries.add(obj.geometry); if (obj.material) for (const mat of Array.isArray(obj.material) ? obj.material : [obj.material]) materials.add(mat);});
   for (const geometry of geometries) geometry.dispose();
   for (const material of materials) material.dispose();
  },
 };
}
