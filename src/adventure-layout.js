// Shared survey for actual geometry, navigation heights and the illustrated map.
// This module is independent of Three.js and has no browser or mutable world state.
const bounds=(minX,maxX,minZ,maxZ)=>Object.freeze({minX,maxX,minZ,maxZ});
const point=([x,z])=>Object.freeze({x,z});
const route=points=>Object.freeze(points.map(point));
export const ADVENTURE_LAYOUT=Object.freeze({
  gates:Object.freeze([
    Object.freeze({id:'south-lifen-gate',label:'晴川里门楼',z:19.8,pierX:3.65,pierWidth:1.05,pierDepth:1.60,beamBottom:4.35,deckTop:5.30,eave:6.57,ridge:7.30}),
    Object.freeze({id:'north-timber-gallery',label:'望江木廊',z:-1.4,pierX:3.65,pierWidth:1.05,pierDepth:1.65,beamBottom:4.35,deckTop:4.72,eave:6.15,ridge:6.80}),
  ]),
  ramp:Object.freeze({...bounds(32,35.2,-14.7,-.3),bottomHeight:.13,topHeight:1.93}),
  platform:Object.freeze({...bounds(29.5,36.5,-18,-14.7),height:1.93}),
  destinations:Object.freeze({
    tool:Object.freeze({x:-21.45,z:12.2}),windChime:Object.freeze({x:-11.4,z:-13}),
    lookout:Object.freeze({x:33,z:-16.2}),rampEntry:Object.freeze({x:33.6,z:1.2}),
  }),
  lamp:Object.freeze({x:34.95,z:-17.05}),
  kite:Object.freeze({x:33.20,y:13.2,z:-17.40}),
});

/** null means that existing street/courtyard terrain owns this coordinate. */
export function adventureHeightAt(x,z){
  if(!Number.isFinite(x)||!Number.isFinite(z))return null;
  const {ramp:r,platform:p}=ADVENTURE_LAYOUT;
  if(x>=p.minX&&x<=p.maxX&&z>=p.minZ&&z<=p.maxZ)return p.height;
  if(x>=r.minX&&x<=r.maxX&&z>=r.minZ&&z<=r.maxZ){
    const progress=(r.maxZ-z)/(r.maxZ-r.minZ);
    return r.bottomHeight+(r.topHeight-r.bottomHeight)*progress;
  }
  return null;
}

export const ADVENTURE_ROUTES=Object.freeze({
  mainStreet:route([[0,27],[0,19.8],[0,7],[0,-1.4],[0,-9],[0,-21.5]]),
  windPlatform:route([[25,-3],[30.8,-3],[31.1,1.2],[33.6,1.2],[33.6,-.3],[33.6,-7.5],[33.6,-14.7],[33,-16.2]]),
  platformToFerry:route([[33,-16.2],[33.6,-14.7],[33.6,-.3],[33.6,1.2],[31.1,1.2],[30.8,-3],[29,-15]]),
});

const rail=(id,label,b)=>Object.freeze({id,kind:'rail',label,bounds:b,passable:false});
export const ADVENTURE_MAP=Object.freeze([
  ...ADVENTURE_LAYOUT.gates.map(g=>Object.freeze({id:g.id,kind:'overpass',label:g.label,mapLabel:g.label,bounds:bounds(-4.8,4.8,g.z-1.12,g.z+1.12),passable:true,clearance:4.22,openingWidth:6.25,centerline:route([[0,g.z+1.12],[0,g.z-1.12]])})),
  ...ADVENTURE_LAYOUT.gates.flatMap(g=>[-1,1].map(side=>Object.freeze({id:`${g.id}-pier-${side}`,kind:'pillar',label:'门柱',bounds:bounds(side*g.pierX-g.pierWidth/2,side*g.pierX+g.pierWidth/2,g.z-g.pierDepth/2,g.z+g.pierDepth/2),passable:false,height:4.76}))),
  Object.freeze({id:'wind-ramp',kind:'ramp',label:'听风台缓坡',mapLabel:'上听风台',bounds:bounds(32,35.2,-14.7,-.3),passable:true,axis:'z',heightStart:1.93,heightEnd:.13,slope:'1:8'}),
  Object.freeze({id:'wind-platform',kind:'platform',label:'听风台',mapLabel:'听风台',bounds:bounds(29.5,36.5,-18,-14.7),passable:true,height:1.93}),
  rail('wind-ramp-west','坡道西侧护栏',bounds(31.94,32.06,-14.72,-.30)),
  rail('wind-ramp-east','坡道东侧护栏',bounds(35.14,35.26,-14.72,-.30)),
  rail('wind-platform-west','台边护栏',bounds(29.44,29.56,-18,-14.7)),
  rail('wind-platform-east','台边护栏',bounds(36.44,36.56,-18,-14.7)),
  rail('wind-platform-north','望江栏杆',bounds(29.5,36.5,-18.06,-17.94)),
  rail('wind-platform-southwest','坡口西栏',bounds(29.5,32,-14.76,-14.64)),
  rail('wind-platform-southeast','坡口东栏',bounds(35.2,36.5,-14.76,-14.64)),
]);
