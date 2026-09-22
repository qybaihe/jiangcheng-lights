export const AVATARS = Object.freeze([
  Object.freeze({id:'female',label:'女主角',name:'阿遥',description:'栗棕短发 · 米白针织衫',url:'/models/ayao.vrm',portrait:'/models/ayao-female.webp',source:'VRoid AvatarSample_A',height:1.78}),
  Object.freeze({id:'male',label:'男主角',name:'阿遥',description:'深栗短发 · 鼠尾草外套',url:'/models/ayao-male.vrm',portrait:'/models/ayao-male.webp',source:'VRoid AvatarSample_C',height:1.82}),
]);

// Old saves retain the previously available protagonist; arbitrary save values
// cannot become URLs or labels in the loader or character picker.
export function getAvatarOption(id) {
  return AVATARS.find(option=>option.id===id)??AVATARS[0];
}
