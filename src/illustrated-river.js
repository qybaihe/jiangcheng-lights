import * as THREE from 'three';

export function makeIllustratedRiver(world){
  const time={value:0};
  const material=new THREE.MeshBasicMaterial({color:'#4f9890',side:THREE.DoubleSide,fog:true});
  material.onBeforeCompile=shader=>{
    shader.uniforms.riverTime=time;
    shader.vertexShader='varying vec2 riverCoord;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nriverCoord=uv*vec2(340.0,220.0);');
    shader.fragmentShader='varying vec2 riverCoord;\nuniform float riverTime;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      // Short, staggered brush marks rather than 26-metre stripes. The old
      // stripe frequency turned into bright vanishing-point rays when viewed
      // at the rower's eye level. Derivative antialiasing also calms the far bank.
      vec2 waterCoord=riverCoord+vec2(riverTime*.07,riverTime*.19);
      vec2 tile=waterCoord*vec2(.56,1.12);
      float row=floor(tile.y);
      float seed=fract(sin(row*127.1)*43758.5453);
      float along=fract(tile.x+seed),across=fract(tile.y);
      float middle=.47+.065*sin(tile.x*1.8+seed*6.28);
      float antialias=max(.015,fwidth(tile.y)*.7);
      float stroke=1.0-smoothstep(.016,.034+antialias,abs(across-middle));
      float dash=smoothstep(.09,.24,along)*(1.0-smoothstep(.62,.82,along));
      float distanceFade=1.0-smoothstep(.28,1.6,fwidth(tile.y));
      float crest=stroke*dash*distanceFade*(.65+.35*seed);
      vec3 reflected=diffuseColor.rgb*1.25+vec3(.017,.027,.022);
      diffuseColor.rgb=mix(diffuseColor.rgb,reflected,crest*.66);
      diffuseColor.rgb*=.975+.025*sin(waterCoord.y*.22+sin(waterCoord.x*.075));
    `);
  };
  material.customProgramCacheKey=()=> 'illustrated-river-v2-rowing';
  world.water=new THREE.Mesh(new THREE.PlaneGeometry(340,220,170,110),material);
  world.water.position.set(0,-.35,-136);world.water.rotation.x=-Math.PI/2;
  world.water.castShadow=false;world.scene.add(world.water);world.waterUniforms={time};
}
