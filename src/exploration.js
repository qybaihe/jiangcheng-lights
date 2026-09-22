import * as THREE from 'three';

export const EXPLORATION = Object.freeze({ distance: 4.6, pitch: .16, fov: 54, walk: 3.4, run: 5.6 });
export const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const SIDE_ANGLES = [15, 30, 45, 60, 90].map(degrees => degrees * Math.PI / 180);
const CLEARANCE_EPSILON = 1e-5;

// An expanded AABB is a cheap swept camera sphere. Never impose a minimum
// boom length that would put the camera through the very wall it just found.
export function cameraBoomDistance(origin, desired, obstacles, radius = .23) {
  const delta = desired.clone().sub(origin), length = delta.length();
  if (length < .0001) return 0;
  const ray = new THREE.Ray(origin, delta.divideScalar(length)), hit = new THREE.Vector3(), box = new THREE.Box3();
  let allowed = length;
  for (const c of obstacles) {
    box.min.set(c.x - radius, (c.y ?? 0) - radius, c.z - radius);
    box.max.set(c.X + radius, (c.height ?? 11) + radius, c.Z + radius);
    if (box.containsPoint(origin)) {
      // A shoulder may enter the safety margin without entering the wall.
      // In that case retain the solid obstacle, but allow looking away from it.
      box.min.addScalar(radius); box.max.addScalar(-radius);
      if (box.containsPoint(origin)) { allowed = 0; continue; }
    }
    if (ray.intersectBox(box, hit)) allowed = Math.min(allowed, Math.max(0, origin.distanceTo(hit) - .04));
  }
  return allowed;
}

export function initialiseExploration(world) {
  world.thirdYaw ??= Math.atan2(-10.5, 4);
  world.thirdPitch ??= EXPLORATION.pitch;
  world.thirdDistance ??= EXPLORATION.distance;
  world.moveSpeed ??= 0;
  world.lastMoveDirection ??= new THREE.Vector2();
}

export function updateThirdPerson(world, dt = 0, immediate = false, { manualLook = false } = {}) {
  initialiseExploration(world);
  const { player, camera, controls } = world;
  // Let the jump read against the street; the lens follows a portion of its
  // height, without a camera roll or a walking head-bob.
  const floor = world.heightAt?.(player.position.x, player.position.z) ?? player.position.y;
  const followY = floor + (player.position.y - floor) * .58;
  world.cameraTrackedY = immediate || !Number.isFinite(world.cameraTrackedY) ? followY
    : THREE.MathUtils.lerp(world.cameraTrackedY, followY, 1 - Math.exp(-dt * 14));
  const focusHeight=player.userData?.height?player.userData.height*(1.13/1.77):1.13;
  const origin = new THREE.Vector3(player.position.x, world.cameraTrackedY + focusHeight, player.position.z);
  const bounds = [...world.colliders, ...(world.cameraOccluders || [])];
  const poseAt = (yaw, distance = world.thirdDistance) => origin.clone().add(new THREE.Vector3(
    -Math.sin(yaw) * Math.cos(world.thirdPitch), Math.sin(world.thirdPitch),
    Math.cos(yaw) * Math.cos(world.thirdPitch)
  ).multiplyScalar(distance));
  const lengthAt = yaw => cameraBoomDistance(origin, poseAt(yaw), bounds);
  const readable = Math.min(2.8, world.thirdDistance);
  const preferredLength = lengthAt(world.thirdYaw);
  const manualOrbit = manualLook || Boolean(world.lookDrag) || (world.elapsed ?? 0) - (world.manualLookTime ?? -100) < .22;
  let offset = manualOrbit ? 0 : world.cameraAvoidanceOffset ?? 0;

  // Preserve the user's yaw. Hold a chosen side while grazing a corner instead
  // of switching between the preferred angle and +/-15 degrees every frame.
  if (!manualOrbit && offset && preferredLength + CLEARANCE_EPSILON >= Math.min(world.thirdDistance, readable + .35)) {
    world.cameraClearTime = (world.cameraClearTime ?? 0) + dt;
    if (world.cameraClearTime >= .35) offset = 0;
  } else world.cameraClearTime = 0;

  // A deliberate mouse orbit owns its heading. Near walls, shorten the boom
  // instead of snapping to a different side angle underneath the user's hand.
  if (!manualOrbit && (preferredLength < readable - CLEARANCE_EPSILON || offset)) {
    const retained = offset && lengthAt(world.thirdYaw + offset) + CLEARANCE_EPSILON >= readable;
    if (!retained) {
      const side = world.cameraAvoidanceSide || Math.sign(offset) || -1;
      offset = 0;
      // Choose the smallest usable angle. A retained side wins equal-angle
      // ties; distance differences never flip the camera between two sides.
      for (const angle of SIDE_ANGLES) {
        for (const sign of [side, -side]) {
          if (lengthAt(world.thirdYaw + sign * angle) + CLEARANCE_EPSILON >= readable) { offset = sign * angle; break; }
        }
        if (offset) break;
      }
    }
  }
  if (offset) world.cameraAvoidanceSide = Math.sign(offset);
  const previousYaw = world.resolvedYaw ?? world.thirdYaw + offset;
  const delta = angleDelta(previousYaw, world.thirdYaw + offset);
  const blend = 1 - Math.exp(-dt * (offset ? 7 : 3));
  let resolved = immediate ? world.thirdYaw + offset
    : previousYaw + THREE.MathUtils.clamp(delta * blend, -dt * 1.8, dt * 1.8);

  // On the way back, check the angular arc as well as its endpoint. A clear
  // preferred view is not enough if the intervening angles still clip a wall.
  if (!manualOrbit && !offset && (world.cameraAvoidanceOffset || world.cameraAvoidanceReturning) && !immediate) {
    const turn = angleDelta(previousYaw, resolved), steps = Math.max(1, Math.ceil(Math.abs(turn) / (Math.PI / 60)));
    for (let i = 1; i <= steps; i++) {
      if (lengthAt(previousYaw + turn * i / steps) < readable - CLEARANCE_EPSILON) {
        resolved = previousYaw; offset = angleDelta(world.thirdYaw, previousYaw); world.cameraClearTime = 0; break;
      }
    }
  }
  world.cameraAvoidanceOffset = offset;
  world.cameraAvoidanceReturning = !offset && Math.abs(angleDelta(resolved, world.thirdYaw)) > .001;
  world.resolvedYaw = resolved;
  const allowed = lengthAt(resolved);
  const previous = world.actualCameraDistance ?? allowed;
  world.actualCameraDistance = immediate || allowed < previous ? allowed : THREE.MathUtils.lerp(previous, allowed, 1 - Math.exp(-dt * 5));
  const desired = poseAt(resolved, world.actualCameraDistance);
  desired.y = Math.max(player.position.y + .32, desired.y);
  const forward = new THREE.Vector3(Math.sin(resolved), 0, -Math.cos(resolved));
  const target = origin.clone().addScaledVector(forward, .24);
  camera.position.copy(desired);
  controls.target.copy(target);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  // Fade only the player when a wall forces the lens into their shoulders.
  world.playerCameraDistance = camera.position.distanceTo(origin);
}

export function movementStep(world, dx, dz, dt, remaining = Infinity) {
  initialiseExploration(world);
  const requested = Math.hypot(dx, dz) > .001;
  const targetSpeed = requested ? (world.keys.shift ? EXPLORATION.run : EXPLORATION.walk) : 0;
  const previousSpeed = world.moveSpeed, airborne = world.playerMotion && !world.playerMotion.grounded;
  if (Number.isFinite(remaining)) {
    // Autowalk follows the validated polyline exactly, including tight turns.
    world.moveSpeed = THREE.MathUtils.clamp(targetSpeed, previousSpeed - 32 * dt, previousSpeed + 22 * dt);
    if (requested) world.lastMoveDirection.set(dx, dz).normalize();
  } else {
    const velocity = world.lastMoveDirection.clone().multiplyScalar(previousSpeed);
    const desired = requested ? new THREE.Vector2(dx, dz).normalize().multiplyScalar(targetSpeed)
      : airborne ? velocity.clone().multiplyScalar(Math.exp(-dt * .18)) : new THREE.Vector2();
    const change = desired.sub(velocity), rate = airborne ? 8 : requested ? 26 : 32;
    if (change.length() > rate * dt) change.setLength(rate * dt);
    velocity.add(change); world.moveSpeed = velocity.length();
    if (world.moveSpeed > .00001) world.lastMoveDirection.copy(velocity).divideScalar(world.moveSpeed);
    else world.moveSpeed = 0;
  }
  if (world.playerMotion) world.playerMotion.acceleration = (world.moveSpeed - previousSpeed) / Math.max(dt, .001);
  const direction = world.lastMoveDirection;
  const distance = Math.min(world.moveSpeed * dt, remaining);
  return { dx: direction.x, dz: direction.y, distance };
}

export function updatePlayerOcclusion(world, dt = 0) {
  const conversation = Boolean(world.conversation), street = world.cameraMode === 'street';
  const target = conversation ? 1 : world.cameraMode === 'first' ? 0
    : street ? THREE.MathUtils.smoothstep(world.playerCameraDistance ?? 4.6, 1.45, 2.6) : 1;
  // Shortening a collision-safe camera can bring it into the avatar. Reveal
  // the street through that one character, then gently restore their opacity.
  const before = world.playerOpacity ?? 1;
  world.playerOpacity = conversation || !street || target < before ? target
    : THREE.MathUtils.lerp(before, target, 1 - Math.exp(-Math.max(0, dt) * 12));
  const meshes=world.player.userData.characterMeshes??[world.player.userData.characterMesh];
  const bindings=world.playerFadeBindings??=new Map();
  const states=world.playerFadeStates??=new Map(),active=new Set();
  for(const mesh of meshes){
    if(!mesh?.material)continue;
    let entries=bindings.get(mesh);
    if(!entries){
      const originals=Array.isArray(mesh.material)?mesh.material:[mesh.material];
      entries=originals.map(source=>{
        if(states.has(source))return states.get(source);
        // VRM expression bindings reference their materials, which are already
        // private to this avatar. Procedural residents share theirs: clone those.
        const material=world.player.userData.ownedMaterials?source:source.clone();
        world.curvedWorld?.patchMaterial(material);
        const entry={material,opacity:source.opacity,alphaTest:source.alphaTest,transparent:source.transparent,depthWrite:source.depthWrite};
        states.set(source,entry);return entry;
      });
      mesh.material=Array.isArray(mesh.material)?entries.map(e=>e.material):entries[0].material;
      bindings.set(mesh,entries);
      world.playerFadeMaterial??=entries[0].material;
    }
    for(const entry of entries)active.add(entry);
  }
  // Capture every baseline before writing: imported primitives share materials.
  // Scaling the cutout threshold preserves the authored silhouette during fade.
  for(const entry of active){
    const {material}=entry,transparent=entry.transparent||world.playerOpacity<.999;
    if(material.transparent!==transparent){material.transparent=transparent;material.needsUpdate=true;}
    material.opacity=entry.opacity*world.playerOpacity;
    material.alphaTest=entry.alphaTest>0?Math.max(1e-6,entry.alphaTest*world.playerOpacity):0;
    material.depthWrite=entry.depthWrite&&world.playerOpacity>.98;
  }
  world.player.visible = world.playerOpacity > .01;
}
