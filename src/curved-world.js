import * as THREE from 'three';

export const STREET_RADIUS = 145;
export const RIVER_VIEW_RADIUS = 520;

// The simulation remains in surveyed street coordinates. Rendering maps those
// coordinates onto a sphere tangent to the street at the player's feet.
export function bendPoint(point, center, radius = STREET_RADIUS, out = new THREE.Vector3()) {
  if (!Number.isFinite(radius)) return out.copy(point);
  const x = point.x - center.x, z = point.z - center.z, r = Math.hypot(x, z);
  const a = r / radius, scale = r < 1e-9 ? 1 + point.y / radius : (radius + point.y) * Math.sin(a) / r;
  return out.set(center.x + x * scale, (radius + point.y) * Math.cos(a) - radius, center.z + z * scale);
}

export function unbendPoint(point, center, radius = STREET_RADIUS, out = new THREE.Vector3()) {
  if (!Number.isFinite(radius)) return out.copy(point);
  const x = point.x - center.x, z = point.z - center.z, h = point.y + radius;
  const r = Math.hypot(x, z), length = Math.hypot(r, h);
  const scale = r < 1e-9 ? radius / Math.max(1e-9, h) : radius * Math.atan2(r, h) / r;
  return out.set(center.x + x * scale, length - radius, center.z + z * scale);
}

// Pick the nearest actual street height, including stairs and the lookout ramp.
// Inverse mapping a single intersection with y=.13 would miss the bent road.
export function intersectCurvedGround(ray, center, radius, heightAt, maxDistance = 160) {
  const rendered = new THREE.Vector3(), logical = new THREE.Vector3();
  const sample = distance => {
    unbendPoint(ray.at(distance, rendered), center, radius, logical);
    return logical.y - heightAt(logical.x, logical.z);
  };
  let previous = sample(0);
  for (let distance = .3; distance <= maxDistance; distance += .3) {
    const next = sample(distance);
    if (previous >= 0 && next <= 0) {
      let lo = distance - .3, hi = distance;
      for (let i = 0; i < 16; i++) { const mid = (lo + hi) / 2; if (sample(mid) > 0) lo = mid; else hi = mid; }
      sample((lo + hi) / 2);
      return logical.clone();
    }
    previous = next;
  }
  return null;
}

// Test each inverse-mapped segment, not just sample points: even a 6cm post
// must occlude a label when it lies between two samples.
export function curvedSightline(camera, target, center, radius, boxes, endClearance = .25) {
  const end=bendPoint(target,center,radius),length=camera.distanceTo(end);
  if(length<=endClearance)return true;
  const stop=1-endClearance/length,steps=Math.max(1,Math.ceil(length*stop/.35));
  const rendered=new THREE.Vector3(),previous=unbendPoint(camera,center,radius),next=new THREE.Vector3();
  const ray=new THREE.Ray(),direction=new THREE.Vector3(),hit=new THREE.Vector3();
  for(let i=1;i<=steps;i++){
    unbendPoint(rendered.lerpVectors(camera,end,stop*i/steps),center,radius,next);
    const distance=direction.copy(next).sub(previous).length();
    ray.set(previous,direction.divideScalar(Math.max(1e-10,distance)));
    if(boxes.some(box=>box.containsPoint(previous)||(ray.intersectBox(box,hit)&&hit.distanceTo(previous)<=distance+.0001)))return false;
    previous.copy(next);
  }
  return true;
}

// Tessellate long faces before bending. Interpolating only the four corners of
// the former 79m paving slab would make people sink through its chord.
export function subdivideLongFaces(geometry, maxEdge = 2) {
  if (!geometry.attributes.position || geometry.morphAttributes.position?.length) return geometry;
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const attrs = Object.entries(source.attributes), pos = source.attributes.position;
  const limit = maxEdge * maxEdge;
  let needs = false;
  for (let i = 0; i < pos.count && !needs; i += 3) for (let e = 0; e < 3; e++) {
    const a = i + e, b = i + (e + 1) % 3;
    if ((pos.getX(a)-pos.getX(b))**2+(pos.getY(a)-pos.getY(b))**2+(pos.getZ(a)-pos.getZ(b))**2 > limit) { needs = true; break; }
  }
  if (!needs) { if (source !== geometry) source.dispose(); return geometry; }
  const arrays = Object.fromEntries(attrs.map(([key]) => [key, []]));
  const read = index => Object.fromEntries(attrs.map(([key, attr]) => [key, Array.from({length:attr.itemSize}, (_, c) => attr.getComponent(index,c))]));
  const midpoint = (a,b) => Object.fromEntries(attrs.map(([key]) => [key, a[key].map((v,i)=>(v+b[key][i])/2)]));
  const distance = (a,b) => a.position.reduce((sum,v,i)=>sum+(v-b.position[i])**2,0);
  const emit = (a,b,c,depth=0) => {
    const lengths=[distance(a,b),distance(b,c),distance(c,a)], longest=Math.max(...lengths);
    if(longest>limit&&depth<22){
      const edge=lengths.indexOf(longest);
      if(edge===0){const m=midpoint(a,b);emit(a,m,c,depth+1);emit(m,b,c,depth+1);}
      else if(edge===1){const m=midpoint(b,c);emit(a,b,m,depth+1);emit(a,m,c,depth+1);}
      else{const m=midpoint(c,a);emit(a,b,m,depth+1);emit(m,b,c,depth+1);}
    }else for(const v of[a,b,c])for(const[key]of attrs)arrays[key].push(...v[key]);
  };
  for(let i=0;i<pos.count;i+=3)emit(read(i),read(i+1),read(i+2));
  const result=new THREE.BufferGeometry();
  for(const[key,attr]of attrs)result.setAttribute(key,new THREE.Float32BufferAttribute(arrays[key],attr.itemSize));
  result.computeBoundingSphere();result.computeBoundingBox();
  if(source!==geometry)source.dispose();
  return result;
}

const bendGLSL = `
uniform vec2 streetBendCenter;
uniform float streetBendRadius;
uniform float streetBendEnabled;
vec3 streetBend(vec3 p) {
  vec2 q=p.xz-streetBendCenter;
  float r=length(q),a=r/streetBendRadius;
  float scale=r<0.00001?1.0+p.y/streetBendRadius:(streetBendRadius+p.y)*sin(a)/r;
  vec3 curved=vec3(streetBendCenter.x+q.x*scale,(streetBendRadius+p.y)*cos(a)-streetBendRadius,streetBendCenter.y+q.y*scale);
  return mix(p,curved,streetBendEnabled);
}
`;

export function createCurvedWorld(world, radius = STREET_RADIUS) {
  const uniforms={streetBendCenter:{value:new THREE.Vector2()},streetBendRadius:{value:radius},streetBendEnabled:{value:1}};
  const patched=new WeakSet(),bounds=[];let materialCount=0,subdivided=0,lastX=NaN,lastZ=NaN,lastEnabled=null,lastRadius=null;
  const controller={
    center:{x:world.player.position.x,z:world.player.position.z},radius,enabled:true,
    update(){
      this.center.x=world.player.position.x;this.center.z=world.player.position.z;this.enabled=world.cameraMode!=='overview';
      // Keep the pocket-world charm on foot, but open up the horizon when the
      // camera sits at water level. Physics/navigation always stay unbent.
      this.radius=world.propInteractions?.mode==='boat'?Math.max(radius,RIVER_VIEW_RADIUS):radius;
      uniforms.streetBendRadius.value=this.radius;
      uniforms.streetBendCenter.value.set(this.center.x,this.center.z);uniforms.streetBendEnabled.value=this.enabled?1:0;
      if(lastX===this.center.x&&lastZ===this.center.z&&lastEnabled===this.enabled&&lastRadius===this.radius)return;
      for(const entry of bounds){
        const {mesh,flat,inverse,curved,union}=entry;
        this.point(flat.center,curved.center);
        // The sphere mapping's largest differential stretch is (R+y)/R.
        // Include the flat sphere too: the shadow pass still uses that space.
        curved.radius=flat.radius*(1+Math.max(0,flat.center.y+flat.radius)/this.radius);
        union.copy(flat).union(curved);mesh.boundingSphere.copy(union).applyMatrix4(inverse);
      }
      lastX=this.center.x;lastZ=this.center.z;lastEnabled=this.enabled;lastRadius=this.radius;
    },
    point(p,out){return bendPoint(p,this.center,this.enabled?this.radius:Infinity,out);},
    inverse(p,out){return unbendPoint(p,this.center,this.enabled?this.radius:Infinity,out);},
    pick(ray){return intersectCurvedGround(ray,this.center,this.enabled?this.radius:Infinity,(x,z)=>world.heightAt(x,z));},
    patchMaterial(material){
      if(!material||patched.has(material))return;
      const previous=material.onBeforeCompile,previousKey=material.customProgramCacheKey();
      material.onBeforeCompile=function(shader,renderer){
        previous.call(this,shader,renderer);Object.assign(shader.uniforms,uniforms);
        shader.vertexShader=bendGLSL+shader.vertexShader;
        if(material.isSpriteMaterial){
          shader.vertexShader=shader.vertexShader.replace('vec4 mvPosition = modelViewMatrix[ 3 ];','vec4 mvPosition = viewMatrix * vec4(streetBend(modelMatrix[3].xyz),1.0);');
        }else{
          // Keep worldpos_vertex unbent: the cached sun shadow is a painted
          // lighting field in logical coordinates and moves with the surface.
          shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`
            vec4 streetPosition=vec4(transformed,1.0);
            #ifdef USE_BATCHING
              streetPosition=batchingMatrix*streetPosition;
            #endif
            #ifdef USE_INSTANCING
              streetPosition=instanceMatrix*streetPosition;
            #endif
            streetPosition=modelMatrix*streetPosition;
            vec4 mvPosition=viewMatrix*vec4(streetBend(streetPosition.xyz),1.0);
            gl_Position=projectionMatrix*mvPosition;
          `);
          // MToon's optional outline projects a second, extruded surface after
          // project_vertex. Apply the same world bend to that contour as well.
          shader.vertexShader=shader.vertexShader.replace(
            'gl_Position = projectionMatrix * modelViewMatrix * vec4( outlineOffset + transformed, 1.0 );',
            'gl_Position = projectionMatrix * viewMatrix * vec4(streetBend((modelMatrix * vec4(outlineOffset + transformed, 1.0)).xyz), 1.0);',
          );
        }
      };
      material.customProgramCacheKey=()=>`${previousKey}:curved-street-v1`;
      material.needsUpdate=true;patched.add(material);materialCount++;
    },
    attach(object){
      object.traverse(mesh=>{
        if(!mesh.material||mesh.userData.curvature===false)return;
        for(const mat of(Array.isArray(mesh.material)?mesh.material:[mesh.material]))this.patchMaterial(mat);
        // The original bounds describe the logical street, not its curved view.
        mesh.frustumCulled=false;
        if(mesh.isMesh&&!mesh.isSkinnedMesh&&!mesh.isInstancedMesh&&!Array.isArray(mesh.material)){
          const scale=mesh.getWorldScale(new THREE.Vector3());
          const geo=subdivideLongFaces(mesh.geometry,2/Math.max(scale.x,scale.y,scale.z));
          if(geo!==mesh.geometry){mesh.geometry=geo;subdivided++;}
        }
      });
    },
    stats(){return {radius:this.radius,enabled:this.enabled,materials:materialCount,subdividedMeshes:subdivided,center:{...this.center}};},
  };
  world.scene.updateMatrixWorld(true);controller.attach(world.scene);
  world.static.traverse(mesh=>{
    if(!mesh.isMesh||mesh.isSkinnedMesh||mesh.isInstancedMesh)return;
    mesh.geometry.computeBoundingSphere();
    const flat=mesh.geometry.boundingSphere.clone().applyMatrix4(mesh.matrixWorld);
    mesh.boundingSphere=mesh.geometry.boundingSphere.clone();mesh.frustumCulled=true;
    bounds.push({mesh,flat,inverse:mesh.matrixWorld.clone().invert(),curved:new THREE.Sphere(),union:new THREE.Sphere()});
  });
  controller.update();return controller;
}
