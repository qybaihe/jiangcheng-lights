import {WUHAN_DISTRICT_STOPS} from './wuhan-district-layout.js';

const ids=new Set(WUHAN_DISTRICT_STOPS.map(stop=>stop.id));
export const normalizeWuhanVisits=value=>Array.isArray(value)?[...new Set(value.filter(id=>ids.has(id)))]:[];
export function recordWuhanVisit(value,id){
  const visits=normalizeWuhanVisits(value);
  if(ids.has(id)&&!visits.includes(id))visits.push(id);
  return visits;
}
