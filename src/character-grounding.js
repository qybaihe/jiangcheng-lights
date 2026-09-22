const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));

// Terrain is sampled in the actor's forward/right axes. A slope tilts the
// whole sole, while heel/toe roll remains relative to that support plane.
export function sampleFootSupport(heightAt,x,z,heading,scale,rig,gaitPitch=0){
  const sin=Math.sin(heading),cos=Math.cos(heading),half=rig.soleHalfWidth??.092;
  const front=rig.soleFront??.197,back=rig.soleBack??-.101;
  const sample=(right,forward)=>heightAt(x+(right*cos+forward*sin)*scale,z+(-right*sin+forward*cos)*scale);
  const center=sample(0,0),ahead=sample(0,front),behind=sample(0,back),left=sample(-half,0),right=sample(half,0);
  let sx=(right-left)/(2*half*scale),sz=(ahead-behind)/((front-back)*scale);
  const frontCenter=behind+(ahead-behind)*(-back)/(front-back);
  const continuous=Math.abs(frontCenter-center)<.012&&Math.abs((left+right)/2-center)<.012&&Math.hypot(sx,sz)<.5;
  // A step edge is not a very steep ramp. Keep the sole level on its highest
  // sampled support instead of twisting the ankle across the discontinuity.
  const height=continuous?center:Math.max(center,ahead,behind,left,right);
  if(!continuous){sx=0;sz=0;}
  const pitch=gaitPitch-Math.atan(sz),roll=Math.atan(sx/Math.sqrt(1+sz*sz));
  const cp=Math.cos(pitch),sp=Math.sin(pitch),cr=Math.cos(roll),sr=Math.sin(roll);
  let support=-Infinity;
  for(const px of[-half,half])for(const pz of[back,front]){
    const py=-rig.ankleHeight,rx=px*cr-py*sr,ry=px*sr+py*cr;
    const vy=ry*cp-pz*sp,vz=ry*sp+pz*cp;
    support=Math.max(support,sx*rx+sz*vz-vy);
  }
  return {pitch,roll,support:clamp(support,0,.35),height,continuous};
}
