import {PROP_IDS} from './prop-progress.js';
import {CAR_IDS} from './car-progress.js';

/** Tutorial acknowledgements only: no inventory, vehicle position or story flags. */
export const VEHICLE_GUIDE_KINDS = Object.freeze(['bicycle', 'car']);
const kindsById = Object.freeze({
  [PROP_IDS.bicycle]: 'bicycle',
  [CAR_IDS.sedan]: 'car',
  [CAR_IDS.van]: 'car',
});

export function normalizeVehicleGuideProgress(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {version: 1, seen: VEHICLE_GUIDE_KINDS.filter(kind => Array.isArray(source.seen) && source.seen.includes(kind))};
}

export function acknowledgeVehicleGuide(value, kind) {
  const progress = normalizeVehicleGuideProgress(value);
  if (VEHICLE_GUIDE_KINDS.includes(kind) && !progress.seen.includes(kind)) progress.seen.push(kind);
  return normalizeVehicleGuideProgress(progress);
}

export function vehicleGuideKind(prop) {
  return prop && Object.hasOwn(kindsById, prop.id) ? kindsById[prop.id] : null;
}

/** Called with the existing world's *nearby* prop, not all map anchors.
 * The host owns screen lifecycle, persistence, input clearing and proximity.
 * A missing legacy acknowledgement is deliberately not inferred from parking:
 * the player sees one accurate reminder, including an already-borrowed bike.
 */
export function firstVehicleGuideCandidate({
  state, nearby, mode = 'walk', active = false, blocked = false, modal = null,
  arrival = false, grounded = true, pending = false, hidden = false,
} = {}) {
  if (active !== true || blocked || modal || arrival || pending || hidden || grounded === false || mode !== 'walk' || state?.runEnded) return null;
  const kind = vehicleGuideKind(nearby);
  if (!kind || normalizeVehicleGuideProgress(state?.vehicleGuides).seen.includes(kind)) return null;
  return {
    kind,
    id: nearby.id,
    name: typeof nearby.name === 'string' && nearby.name.trim() ? nearby.name.trim() : kind === 'car' ? '街坊的车' : '外公的自行车',
    unlocked: kind === 'bicycle' && state?.props?.bicycleUnlocked === true,
  };
}

/** After any interruption, wait for the player to leave this prop's range.
 * This gate is deliberately transient; acknowledgements live in the save.
 * It prevents a dismissed/preempted card from reopening every render frame.
 */
export function createVehicleGuideGate() {
  let shownId = null;
  return {
    consider(context) {
      if (context?.nearby?.id !== shownId) shownId = null;
      const candidate = firstVehicleGuideCandidate(context);
      return candidate && candidate.id !== shownId ? candidate : null;
    },
    presented(candidate) { if (vehicleGuideKind(candidate)) shownId = candidate.id; },
    reset() { shownId = null; },
    diagnostics() { return {shownId}; },
  };
}
