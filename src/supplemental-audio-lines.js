// Stable audio adapters over the existing authored text. Do not duplicate or
// rewrite dialogue here: an exact text match gates each shipped voice clip.
import {RESIDENTS,RESIDENT_PHASES} from './resident-stories.js';
import {WUHAN_DISTRICT_STOPS} from './wuhan-district-layout.js';
import {ADVENTURE_STOPS} from './adventure.js';
import {LORE} from './story.js';

const phaseId={beforeRain:'before-rain',warning:'warning',afterRain:'after-rain'};
const freeze=Object.freeze;
const line=(id,who,text,scene,profileId)=>text?freeze({id,who,text,scene,profileId,time:'present'}):null;
const at=(lines,index)=>Number.isInteger(index)&&index>=0?lines?.[index]:null;
const residentById=new Map(RESIDENTS.map(r=>[r.id,r]));
const stopLine=(kind,stops,id,index)=>{
 const stop=stops.find(s=>s.id===id),source=at(stop?.lines,index);if(!source)return null;
 const role=source.who==='阿遥'?'hero':source.who==='外公的灯语'?'grandpa':source.who==='借灯条'?'dock':'narrator';
 return line(`town-${kind}-${id}-${String(index+1).padStart(2,'0')}`,source.who,source.text,`${kind}:${id}`,role);
};
export function residentGreetingAudioLine(id,phase){
 const r=residentById.get(id);return r&&Object.hasOwn(phaseId,phase)?line(`town-resident-${id}-greeting-${phaseId[phase]}`,r.name,r.greetings[phase],`resident:${id}:greeting`,id):null;
}
export function residentTopicAudioLine(id,topicId,index){
 const r=residentById.get(id),topic=r?.topics.find(t=>t.id===topicId),text=at(topic?.lines,index);
 return text?line(`town-resident-${id}-${topicId}-${String(index+1).padStart(2,'0')}`,r.name,text,`resident:${id}:${topicId}`,id):null;
}
export const districtAudioLine=(id,index)=>stopLine('district',WUHAN_DISTRICT_STOPS,id,index);
export const adventureAudioLine=(id,index)=>stopLine('adventure',ADVENTURE_STOPS,id,index);
export function loreAudioLine(id){const lore=Object.hasOwn(LORE,id)?LORE[id]:null;return lore?line(`town-lore-${id}-body`,'旁白',lore.text,`lore:${id}`,'narrator'):null;}
export const SUPPLEMENTAL_AUDIO_LINES=freeze([
 ...RESIDENTS.flatMap(r=>[...RESIDENT_PHASES.map(phase=>residentGreetingAudioLine(r.id,phase)),...r.topics.flatMap(t=>t.lines.map((_,i)=>residentTopicAudioLine(r.id,t.id,i)))]),
 ...WUHAN_DISTRICT_STOPS.flatMap(s=>s.lines.map((_,i)=>districtAudioLine(s.id,i))),
 ...ADVENTURE_STOPS.flatMap(s=>s.lines.map((_,i)=>adventureAudioLine(s.id,i))),
 ...Object.keys(LORE).map(loreAudioLine),
]);
