/** Navigation copy is based on the next walkable segment, never a line through a building. */
export function angleDifference(target, heading) {
  return Math.atan2(Math.sin(target-heading),Math.cos(target-heading));
}
export function navigationCue(route, heading=0) {
  if(!route?.reachable)return {instruction:'暂时找不到可走的路线',detail:route?.reason||'回到公共通道后重新引路',angle:0,arrived:false};
  if(route.distance<1.5||route.path.length<2)return {instruction:'已经到达',detail:'靠近后按 E，开始眼前的故事',angle:0,arrived:true};
  const origin=route.path[0];
  const next=route.path.find((p,i)=>i>0&&Math.hypot(p.x-origin.x,p.z-origin.z)>.65)||route.path.at(-1);
  const angle=angleDifference(Math.atan2(next.x-origin.x,-(next.z-origin.z)),heading);
  const degrees=angle*180/Math.PI;
  const instruction=Math.abs(degrees)>140?'转身，沿路线返回':degrees>38?'向右转，进入通道':degrees< -38?'向左转，进入通道':'沿着光点向前走';
  let turn=null,walked=0;
  for(let i=1;i<route.path.length-1;i++){
    const a=route.path[i-1],b=route.path[i],c=route.path[i+1];
    walked+=Math.hypot(b.x-a.x,b.z-a.z);
    const h1=Math.atan2(b.x-a.x,-(b.z-a.z)),h2=Math.atan2(c.x-b.x,-(c.z-b.z));
    const change=angleDifference(h2,h1);
    if(Math.abs(change)>.6&&walked>1.4){turn={distance:walked,side:change>0?'右':'左'};break;}
  }
  return {instruction,detail:turn&&turn.distance<12?`约 ${Math.max(2,Math.round(turn.distance))} 米后${turn.side}转`:'沿公共通道行走，靠近后互动',angle,arrived:false};
}
