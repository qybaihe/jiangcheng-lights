import {PHOTO_CHALLENGES} from './photo-alignment.js';
import {MEAL_STOPS,mealSummary,deriveMealTask} from './meal-relay.js';
const has=(s,id)=>(s.flags??[]).includes(id);
export const photoPoint=id=>{const c=Object.hasOwn(PHOTO_CHALLENGES,id)?PHOTO_CHALLENGES[id]:null;return c?{id:`photo-${id}`,x:c.reference.x,z:c.reference.z,name:c.title,label:'旧照 · '+c.title,icon:'book',playful:'photo',photoId:id,description:c.location}:null;};
export const mealPoint=id=>{const s=Object.values(MEAL_STOPS).find(s=>s.target===id);return s?{...s,id:s.target,label:s.receiver+' · 热食接力',icon:'bowl',playful:'meal'}:null;};
export function activeMealRound(state){
 const eligible=r=>r==='evening'?!has(state,'checked'):has(state,'postlude');
 const round=state.mealRound;
 if(['evening','morning'].includes(round)&&eligible(round)&&mealSummary(state.meals,round).started&&!mealSummary(state.meals,round).completed)return round;
 return ['morning','evening'].find(r=>eligible(r)&&mealSummary(state.meals,r).started&&!mealSummary(state.meals,r).completed)??null;
}
export function playfulObjective(state,base){
 if(state.runEnded||(has(state,'checked')&&!has(state,'postlude')))return base;
 const round=activeMealRound(state);
 if(round)return deriveMealTask(state.meals,round);
 if(state.mealStoryReady&&!has(state,'chef'))return deriveMealTask(state.meals,'evening');
 const c=Object.hasOwn(PHOTO_CHALLENGES,state.photoTarget)?PHOTO_CHALLENGES[state.photoTarget]:null;
 if(c)return {title:'旧照对景 · '+c.title,desc:'拿着旧照片找一找。WASD 移步、拖动转头，三处景物对上后按下快门。',target:'photo-'+c.id};
 return base;
}

