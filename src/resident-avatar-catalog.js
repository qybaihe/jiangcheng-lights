// Each entry describes a resident, not a second gameplay entity. IDs are the
// original story/save IDs and remain stable when an asset is replaced.
const resident=(entry)=>Object.freeze({source:'VRoid official sample · locally adapted',priority:entry.id.startsWith('walker')?1:0,...entry});
export const RESIDENT_AVATARS=Object.freeze([
  resident({id:'granny',handPose:'reading',name:'林婆婆',variant:'silver-knit',source:'VRoid 千駄ヶ谷渋 · elderly face adaptation',base:'Sendagaya_Shibu',description:'银灰短发 · 紫灰针织背心与长裙',url:'/models/residents/granny.vrm',height:1.52,age:'elder',gender:'female',posture:.055}),
  resident({id:'chef',handPose:'reading',name:'蔡姨',variant:'tea-apron',source:'VRoid AvatarSample_A',base:'AvatarSample_A',description:'栗棕短发 · 暖色开衫与围裙',url:'/models/residents/chef.vrm',height:1.62,age:'middle',gender:'female',posture:.018}),
  resident({id:'dock',handPose:'reading',name:'周伯',variant:'dock-worker',source:'VRoid 桜田史也 · elderly face adaptation',base:'Sakurada_Fumiriya',description:'灰白短发 · 藏蓝背心与衬衫',url:'/models/residents/dock.vrm',height:1.73,age:'elder',gender:'male',posture:.045}),
  resident({id:'community',handPose:'reading',name:'小许',variant:'community-volunteer',source:'VRoid AvatarSample_A',base:'AvatarSample_A',description:'栗色短发 · 杏橘外衣与玉绿长裤',url:'/models/residents/community.vrm',height:1.67,age:'young',gender:'female',posture:0}),
  resident({id:'walker0',name:'陈姐',variant:'daily-market',source:'VRoid 千駄ヶ谷篠',base:'Sendagaya_Shino',description:'深棕长发 · 玫瑰色背心与长裙',url:'/models/residents/walker0.vrm',height:1.65,age:'middle',gender:'female',posture:.012}),
  resident({id:'walker1',name:'贺师傅',variant:'workday-jacket',source:'VRoid 桜田史也',base:'Sakurada_Fumiriya',description:'灰鬓短发 · 栗棕工作背心',url:'/models/residents/walker1.vrm',height:1.72,age:'middle',gender:'male',posture:.015}),
  resident({id:'walker2',name:'罗娟',variant:'bookshop',source:'VRoid AvatarSample_A',base:'AvatarSample_A',description:'深色短发 · 赭黄色针织开衫',url:'/models/residents/walker2.vrm',height:1.66,age:'young',gender:'female',posture:0}),
  resident({id:'walker3',handPose:'reading',name:'程岚',variant:'commuter',source:'VRoid 千駄ヶ谷渋',base:'Sendagaya_Shibu',description:'黑色齐耳短发 · 玉绿背心与长裙',url:'/models/residents/walker3.vrm',height:1.64,age:'young',gender:'female',posture:0}),
  resident({id:'walker4',handPose:'reading',name:'宋远',variant:'camera-walk',source:'VRoid AvatarSample_C',base:'AvatarSample_C',description:'棕色短发 · 牛仔蓝夹克',url:'/models/residents/walker4.vrm',height:1.80,age:'young',gender:'male',posture:0}),
]);

// No URL is read from saved game state. Unknown IDs retain their existing model.
export function getResidentAvatarOption(id,catalog=RESIDENT_AVATARS) {
  return catalog.find(entry=>entry.id===id)??null;
}
