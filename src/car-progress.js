import {isInsidePlayableBounds} from './wuhan-district-layout.js';
// Cars are optional street props. Their saves contain no quest or ending state.
export const CAR_IDS=Object.freeze({sedan:'prop-car-sedan',van:'prop-car-van'});
export const CAR_DEFAULTS=Object.freeze({
 [CAR_IDS.sedan]:Object.freeze({x:-14.8,z:23.8,yaw:Math.PI/2}),
 [CAR_IDS.van]:Object.freeze({x:6.8,z:-18.4,yaw:-Math.PI/2}),
});

export function normalizeCarProgress(value){
 const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
 const input=source.vehicles&&typeof source.vehicles==='object'&&!Array.isArray(source.vehicles)?source.vehicles:{};
 const vehicles={};
 for(const [id,fallback]of Object.entries(CAR_DEFAULTS)){
  const p=input[id],valid=p&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&Number.isFinite(p.yaw)
   &&isInsidePlayableBounds(p.x,p.z,.35);
  vehicles[id]=valid?{x:p.x,z:p.z,yaw:Math.atan2(Math.sin(p.yaw),Math.cos(p.yaw))}:{...fallback};
 }
 return {version:1,vehicles};
}
