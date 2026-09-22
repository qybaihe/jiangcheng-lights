// Player-sized vertical motion. Navigation remains on the street, so a jump
// cannot turn a closed doorway, electrical cord or river barrier into a route.
export const TRAVERSAL = Object.freeze({
  jumpSpeed: 6.6, gravity: 22, buffer: .12, coyote: .10,
  landingDuration: .24, radius: .30, headClearance: .015,
});

export function initialisePlayerMotion(world) {
  if (world.playerMotion) return world.playerMotion;
  const p = world.player.position, floor = world.heightAt(p.x, p.z);
  const grounded = p.y <= floor + .035;
  return world.playerMotion = {
    grounded, phase: grounded ? 'grounded' : 'falling', verticalVelocity: 0,
    heightAboveGround: Math.max(0, p.y - floor), landingTime: TRAVERSAL.landingDuration,
    takeoffTime: 0, impactSpeed: 0, acceleration: 0, coyoteTime: grounded ? TRAVERSAL.coyote : 0,
    bufferedTime: 0, jumpCount: 0, landingCount: 0, ceilingHits: 0,
  };
}

export function resetPlayerMotion(world) {
  const p = world.player.position;
  p.y = world.heightAt(p.x, p.z);
  world.playerMotion = null;
  const motion = initialisePlayerMotion(world);
  world.moveSpeed = 0;
  world.lastMoveDirection?.set(0, 0);
  world.cameraTrackedY = p.y;
  return motion;
}

export function requestJump(world) {
  if (!world.active || world.blocked || world.suspended || !world.player || (world.propInteractions && world.propInteractions.mode !== 'walk')) return false;
  initialisePlayerMotion(world).bufferedTime = TRAVERSAL.buffer;
  world.path = [];
  world.cameraReturn = null;
  return true;
}

const overheadBounds = world => [...(world.colliders || []), ...(world.cameraOccluders || [])].filter(c => c.solid !== false);
const overlaps = (c, x, z) => x > c.x - TRAVERSAL.radius && x < c.X + TRAVERSAL.radius &&
  z > c.z - TRAVERSAL.radius && z < c.Z + TRAVERSAL.radius;
const bodyHeight = world => world.player?.userData?.height || 1.78;
const overlapDepth = (c, x, z) => overlaps(c, x, z) ? Math.min(
  x - c.x + TRAVERSAL.radius, c.X + TRAVERSAL.radius - x,
  z - c.z + TRAVERSAL.radius, c.Z + TRAVERSAL.radius - z,
) : 0;

// Route planning must use the same standing head clearance as manual motion.
// Foliage can hide a camera without being a solid roof over the pavement.
export function hasStandingClearance(world, x, z) {
  const floor = world.heightAt(x, z), head = floor + bodyHeight(world);
  return !(world.cameraOccluders || []).some(c => c.solid !== false && (c.y ?? 0) > .1 &&
    overlaps(c, x, z) && head > c.y - TRAVERSAL.headClearance && floor < (c.height ?? 11));
}

// A canopy is an obstacle at head height even though its floor is walkable.
// Sample horizontal sweeps as well as vertical movement to avoid side-entry.
export function canTraverseOverhead(world, from, to) {
  const foot = world.player.position.y, head = foot + bodyHeight(world);
  const bounds = overheadBounds(world).filter(c => (c.y ?? 0) > .1 &&
    head > c.y - TRAVERSAL.headClearance && foot < (c.height ?? 11));
  if (!bounds.length) return true;
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / .12));
  for (let i = 1; i <= steps; i++) {
    const f = i / steps, x = from.x + (to.x - from.x) * f, z = from.z + (to.z - from.z) * f;
    if (bounds.some(c => overlapDepth(c, x, z) > overlapDepth(c, from.x, from.z) + .00001)) return false;
  }
  return true;
}

export function updatePlayerVertical(world, dt) {
  const motion = initialisePlayerMotion(world);
  if (!world.active || world.blocked) motion.bufferedTime = 0;
  if (!world.active || world.suspended || !Number.isFinite(dt) || dt <= 0) return motion;
  const p = world.player.position, floor = world.heightAt(p.x, p.z);
  const total = Math.min(dt, .10), steps = Math.max(1, Math.ceil(total / (1 / 120))), step = total / steps;
  let ceiling = Infinity;
  for (const c of overheadBounds(world)) {
    if ((c.y ?? 0) <= floor + .1 || !overlaps(c, p.x, p.z)) continue;
    ceiling = Math.min(ceiling, Math.max(floor, c.y - bodyHeight(world) - TRAVERSAL.headClearance));
  }
  if (world.blocked) motion.bufferedTime = 0;
  for (let i = 0; i < steps; i++) {
    motion.landingTime = Math.min(TRAVERSAL.landingDuration, motion.landingTime + step);
    // Stay attached to ordinary stairs/ramps; a genuine ledge starts a fall.
    if (motion.grounded && p.y - floor > .23) {
      motion.grounded = false; motion.phase = 'falling'; motion.takeoffTime = 0;
    }
    if (motion.grounded) {
      p.y = floor; motion.verticalVelocity = 0; motion.coyoteTime = TRAVERSAL.coyote;
      motion.phase = motion.landingTime < TRAVERSAL.landingDuration ? 'landing' : 'grounded';
    } else motion.coyoteTime = Math.max(0, motion.coyoteTime - step);

    if (motion.bufferedTime > 0 && !world.blocked && (motion.grounded || motion.coyoteTime > 0)) {
      motion.grounded = false; motion.phase = 'rising'; motion.verticalVelocity = TRAVERSAL.jumpSpeed;
      motion.takeoffTime = 0; motion.coyoteTime = 0; motion.bufferedTime = 0;
      motion.jumpCount++; world.callbacks?.onJump?.();
    }
    motion.bufferedTime = Math.max(0, motion.bufferedTime - step);
    if (!motion.grounded) {
      motion.takeoffTime += step;
      const previousVelocity = motion.verticalVelocity;
      p.y += previousVelocity * step - .5 * TRAVERSAL.gravity * step * step;
      motion.verticalVelocity -= TRAVERSAL.gravity * step;
      if (p.y >= ceiling && previousVelocity > 0) {
        p.y = ceiling; motion.verticalVelocity = 0; motion.ceilingHits++;
      }
      motion.phase = motion.verticalVelocity > 0 ? 'rising' : 'falling';
      if (p.y <= floor && motion.verticalVelocity <= 0) {
        p.y = floor; motion.impactSpeed = Math.abs(motion.verticalVelocity);
        motion.verticalVelocity = 0; motion.grounded = true; motion.phase = 'landing';
        motion.landingTime = 0; motion.landingCount++; world.callbacks?.onLand?.(motion.impactSpeed);
      }
    }
  }
  motion.heightAboveGround = Math.max(0, p.y - floor);
  return motion;
}
