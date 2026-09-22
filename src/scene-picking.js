import * as THREE from 'three';

// Pick in the same curved space that is drawn, then test the logical scene.
// Segment intersections retain thin walls; clicking through a building is not
// a shortcut to a resident standing behind it.
export function pickSceneTarget(ray, targets, blockers, curvature, maxDistance=100) {
 const inverse=(p,out)=>curvature?.inverse?curvature.inverse(p,out):out.copy(p);
 const previous=inverse(ray.origin,new THREE.Vector3()),next=new THREE.Vector3(),rendered=new THREE.Vector3();
 const segment=new THREE.Ray(),direction=new THREE.Vector3(),hit=new THREE.Vector3();
 for(let travelled=.25;travelled<=maxDistance;travelled+=.25){
  inverse(ray.at(travelled,rendered),next);
  const length=direction.copy(next).sub(previous).length();
  if(length<1e-8){previous.copy(next);continue;}
  segment.set(previous,direction.divideScalar(length));
  let target=null,distance=Infinity;
  for(const candidate of targets){
   if(candidate.visible===false)continue;
   const point=candidate.box.containsPoint(previous)?previous:segment.intersectBox(candidate.box,hit);
   if(!point)continue;const d=point.distanceTo(previous);
   if(d<=length+.0001&&d<distance){distance=d;target=candidate;}
  }
  for(const box of blockers){
   const point=box.containsPoint(previous)?previous:segment.intersectBox(box,hit);
   if(point&&point.distanceTo(previous)<=Math.min(length,distance)+.00001)return null;
  }
  if(target)return {id:target.id,kind:target.kind,distance:travelled-.25+distance};
  previous.copy(next);
 }
 return null;
}

export function isSceneTap(start,end){
 return Boolean(start&&end&&!start.dragged&&start.button===0&&Math.hypot(end.clientX-start.x,end.clientY-start.y)<=6);
}
