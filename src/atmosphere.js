import * as THREE from 'three';

// One baked sky supplies both the horizon and soft reflections. It stays local
// and avoids another real-time environment capture on top of the river pass.
function paintSky(mode = 'day') {
  const canvas = document.createElement('canvas'); canvas.width=2048;canvas.height=1024;
  const ctx=canvas.getContext('2d');
  const colors=mode==='rain'?['#527f7c','#719e92','#9ec2b4','#b4cebb','#526d64']:mode==='after'?['#52a599','#79c5ab','#adddc0','#d8e2c5','#577962']:['#439e96','#59b8ab','#82d6c0','#b2dfc5','#507469'];
  const sky=ctx.createLinearGradient(0,0,0,1024);[0,.29,.49,.56,1].forEach((stop,i)=>sky.addColorStop(stop,colors[i]));ctx.fillStyle=sky;ctx.fillRect(0,0,2048,1024);
  // Long, hand-shaped mint cloud banks read as painted sky instead of a bright
  // photographic overcast. The skyline keeps its contrast against the walls.
  let seed=312;const random=()=>((seed=seed*16807%2147483647)-1)/2147483646;
  for(let i=0;i<18;i++){
    const x=random()*2048,y=260+random()*250,w=100+random()*215;
    ctx.fillStyle=mode==='rain'?'rgba(190,216,202,.34)':mode==='after'?'rgba(211,238,211,.67)':'rgba(190,242,219,.66)';
    const h=7+random()*15,notch=.16+random()*.09;
    // Longitude wraps around the viewer. Paint edge-crossing clouds on both
    // sides of the panorama so the sky never acquires a vertical seam.
    for(const shift of[-2048,0,2048]){
      const xx=x+shift;
      ctx.beginPath();ctx.moveTo(xx-w,y+h*.25);
      ctx.lineTo(xx-w*.60,y-h*.12);ctx.lineTo(xx-w*.46,y-h*.60);
      ctx.lineTo(xx-w*.12,y-h*.72);ctx.lineTo(xx+w*.08,y-h);
      ctx.lineTo(xx+w*.47,y-h*.60);ctx.lineTo(xx+w*.64,y-h*.18);
      ctx.lineTo(xx+w,y);ctx.lineTo(xx+w*.54,y+h*.44);
      ctx.lineTo(xx+w*notch,y+h*.19);ctx.lineTo(xx-w*.23,y+h*.70);
      ctx.lineTo(xx-w*.72,y+h*.61);ctx.closePath();ctx.fill();
    }
  }
  const glow=ctx.createRadialGradient(780,405,5,780,405,150);glow.addColorStop(0,mode==='rain'?'#e0eddd09':'#e6f6da22');glow.addColorStop(.35,'#e6f6da0b');glow.addColorStop(1,'#e6f6da00');ctx.fillStyle=glow;ctx.fillRect(0,0,2048,1024);
  const map=new THREE.CanvasTexture(canvas);map.mapping=THREE.EquirectangularReflectionMapping;map.colorSpace=THREE.SRGBColorSpace;return map;
}

export function makeAtmosphere(world) {
  const skies={day:paintSky(),rain:paintSky('rain'),after:paintSky('after')};
  world.scene.background=skies.day;
  // One local environment bake; weather changes do not recapture the scene.
  const pmrem=new THREE.PMREMGenerator(world.renderer),baked=pmrem.fromEquirectangular(skies.day);
  world.scene.environment=baked.texture;world.scene.environmentIntensity=.34;
  world.scene.fog.color.set('#93cdbc');world.scene.fog.near=105;world.scene.fog.far=245;
  world.skyEnvironment=baked;world.townAtmosphere={skies,state:'day',fog:new THREE.Color('#93cdbc')};pmrem.dispose();
}

export function updateAtmosphere(world,dt){
  const a=world.townAtmosphere;if(!a)return;
  const state=world.ended?'after':world.rainy?'rain':'day';
  if(a.state!==state){a.state=state;world.scene.background=a.skies[state];}
  a.fog.set(state==='rain'?'#9fbbb1':state==='after'?'#bdd3b6':'#93cdbc');
  world.scene.fog.color.lerp(a.fog,1-Math.exp(-dt*1.5));
  const fill=state==='rain'?.27:state==='after'?.36:.34;
  world.scene.environmentIntensity=THREE.MathUtils.lerp(world.scene.environmentIntensity,fill,1-Math.exp(-dt*1.5));
}

export function streetDetails(world) {
  // Fallen plane-tree leaves and small plants break up the clean model edges.
  const leaves = new THREE.Group(); world.static.add(leaves);
  const leafMats = ['#bc8d57', '#7eac75', '#74a578', '#538c71'].map(color => world.mat(color));
  const shape = new THREE.Shape();
  shape.moveTo(0, .14);
  shape.lineTo(.035, .055); shape.lineTo(.11, .085);
  shape.lineTo(.075, .015); shape.lineTo(.13, -.025);
  shape.lineTo(.035, -.038); shape.lineTo(0, -.12);
  shape.lineTo(-.035, -.04); shape.lineTo(-.12, -.015);
  shape.lineTo(-.073, .024); shape.lineTo(-.095, .077);
  shape.lineTo(-.035, .054); shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  let seed = 348;
  const random = () => ((seed = seed * 16807 % 2147483647) - 1) / 2147483646;
  for (const [cx, cz] of [[-19, 17], [-34, 1], [22, 18], [-7, -15], [9, 28]]) {
    for (let i = 0; i < 29; i++) {
      const x = cx + (random() - .5) * 6, z = cz + (random() - .5) * 5;
      if (!world.canWalk(x, z)) continue;
      const leaf = world.mesh(geo, leafMats[i % 4], x, world.heightAt(x, z) + .016, z, leaves, false);
      leaf.rotation.set(-Math.PI / 2, 0, random() * Math.PI * 2);
      leaf.scale.setScalar(.6 + random() * .8);
    }
  }
  // Narrow iron drainage channels, set flush into the public lane.
  const iron = world.mat('#45645d', {roughness: .9, metalness: .08});
  for (const x of [-4.32, 4.32]) {
    for (let z = -21; z < 29; z += 4) {
      world.box(.19, .019, 1.15, iron, x, .147, z);
      for (let i = 0; i < 7; i++) world.box(.16, .022, .032, '#242f2b', x, .16, z - .45 + i * .15);
    }
  }
}
