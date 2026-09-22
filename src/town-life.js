import { updateAtmosphere } from './atmosphere.js';
import {sampleFootSupport} from './character-grounding.js';

const TAU = Math.PI * 2;
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smooth = (from, to, dt, speed = 7) => from + (to - from) * (1 - Math.exp(-dt * speed));
const ease = value => value * value * (3 - 2 * value);

function lifeFor(world, actor, id) {
  if (actor.userData.townLife) return actor.userData.townLife;
  const seed = [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const state = {
    id, phase: (seed % 31) * .43, gait: 0, blend: 0, run: 0, speed: 0,
    heading: actor.rotation.y, turn: 0, rootY: 0,
    wasAir:false, jumpLead:0, acceleration:0, landingCompression:0,
    secondary:{bagX:{x:0,v:0},bagY:{x:0,v:0},bagZ:{x:0,v:0},bagLift:{x:0,v:0},hairX:{x:0,v:0},hairY:{x:0,v:0},tipX:{x:0,v:0}},
    homeX: actor.position.x, homeZ: actor.position.z,
    direction: seed % 2 ? 1 : -1, pause: .4 + seed % 4,
    arms: actor.userData.arms || [], legs: actor.userData.legs || [],
    head: actor.userData.head, body: actor.userData.body, rig: actor.userData.rig,
    feet: Array.from({length:2},()=>({z:0,y:actor.userData.rig?.ankleHeight??.075,pitch:0,planted:true})),
  };
  actor.userData.townLife = state;
  if (id.startsWith('walker')) actor.position.y = world.heightAt(actor.position.x, actor.position.z);
  return state;
}

function applyPose(actor, life, pose, dt, time = 0) {
  const [leftX = 0, rightX = 0, leftZ = -.045, rightZ = .045, headX = 0, headY = 0,
    leftElbow = .15, rightElbow = .15] = pose;
  for (let i = 0; i < life.arms.length; i++) {
    const arm = life.arms[i];
    arm.rotation.x = smooth(arm.rotation.x, i ? rightX : leftX, dt, 10);
    arm.rotation.z = smooth(arm.rotation.z, i ? rightZ : leftZ, dt, 10);
    const elbow = life.rig?.elbows[i], hand = life.rig?.hands[i], held = life.rig?.held[i];
    if (elbow) elbow.rotation.x = smooth(elbow.rotation.x, -clamp(i ? rightElbow : leftElbow, .06, 1.48), dt, 12);
    if (hand) {
      // Counter-rotation keeps held objects level as the actual elbow supplies the lift.
      const counter = -(arm.rotation.x + (elbow?.rotation.x || 0) + (life.body?.rotation.x || 0));
      const wristX = held === 'cup' ? counter : held === 'clipboard' ? counter - .13 :
        held === 'fan' ? counter + Math.sin(time * 3.7) * .065 : held === 'towel' ? counter * .7 : .045;
      hand.rotation.x = smooth(hand.rotation.x, wristX, dt, 12);
      hand.rotation.z = smooth(hand.rotation.z, held ? -arm.rotation.z * .65 : (i ? -.025 : .025), dt, 10);
    }
  }
  if (life.head) {
    life.head.rotation.x = smooth(life.head.rotation.x, headX, dt, 6);
    life.head.rotation.y = smooth(life.head.rotation.y, headY, dt, 5);
  }
}

// A planted foot travels backwards by the distance the actor moved forwards.
// Two-bone IK bends the knee and counter-rotates the ankle to meet the ground.
function locomotion(world, actor, life, distance, dt, walking, speed = 0, motion = null) {
  const rig = life.rig;
  const airborne=motion?.grounded===false;
  const heading=actor.rotation.y,turn=wrap(heading-life.heading)/Math.max(dt,.001);life.heading=heading;
  life.turn=smooth(life.turn,clamp(turn,-4,4),dt,8);
  life.acceleration=smooth(life.acceleration,clamp(Number(motion?.acceleration)||0,-9,9),dt,12);
  const landing=motion?.phase==='landing'?clamp(Number(motion.landingTime)/.24,0,1):1;
  life.landingCompression=landing<1?Math.sin(Math.PI*landing)*clamp(.035+(Number(motion.impactSpeed)||0)*.015,.035,.145):0;
  life.speed = smooth(life.speed, walking ? speed : 0, dt, 9);
  life.run = smooth(life.run, walking ? ease(clamp((life.speed - 2.25) / 2.25, 0, 1)) : 0, dt, 7);
  life.blend = smooth(life.blend, walking ? 1 : 0, dt, walking ? 10 : 13);
  if (life.blend < .0005) life.blend = 0;
  const actorScale = actor.scale.y || 1, player = actor === world.player;
  // Longer legs take a slightly slower, wider stride at the same travel speed.
  // Stance displacement still derives from distance, so steady forward motion
  // does not drag the planted foot along the pavement.
  const legRhythm=rig?Math.sqrt((rig.upperLeg+rig.lowerLeg)/.795):1;
  const cadence = (2.15 + ease(clamp((life.speed - 1) / 4.6, 0, 1)) * 1.6)/legRhythm;
  const stride = player ? Math.max(1.06*legRhythm, life.speed * 2 / cadence / actorScale) : (1.06 + life.run * 1.04)*legRhythm;
  const duty = player ? Math.min(.58, (.30 + life.run * .11) * legRhythm * 2 / stride) : .58 - life.run * .26;
  if (distance > 0&&!airborne) life.gait = (life.gait + distance / (stride * actorScale)) % 1;
  const swing = Math.cos(life.gait * TAU) * (.34 + life.run * .29) * life.blend;
  if (!rig) {
    life.legs.forEach((leg, i) => { leg.rotation.x = smooth(leg.rotation.x, (i ? -swing : swing) * .7, dt, 12); });
    return swing;
  }
  if(airborne) {
    if(!life.wasAir)life.jumpLead=life.gait<.5?0:1;
    life.wasAir=true;
    const tuck=ease(clamp(((Number(motion.takeoffTime)||0)-.02)/.09,0,1));
    const prepare=motion.phase==='falling'?ease(clamp((Math.abs(motion.verticalVelocity)-.7)/5.3,0,1)):0;
    life.airPrepare=prepare;
    rig.root.position.y=smooth(rig.root.position.y,.018,dt,14);life.rootY=rig.root.position.y;
    for(let i=0;i<2;i++) {
      const lead=i===life.jumpLead;
      const hip=(lead?-.78:.18)*tuck*(1-prepare)+(lead?-.14:.05)*prepare;
      const knee=(lead?1.28:1.68)*tuck*(1-prepare)+(lead?.40:.52)*prepare+.10*(1-tuck);
      life.legs[i].rotation.x=smooth(life.legs[i].rotation.x,hip,dt,22);
      rig.knees[i].rotation.x=smooth(rig.knees[i].rotation.x,knee,dt,22);
      rig.ankles[i].rotation.x=-(life.legs[i].rotation.x+rig.knees[i].rotation.x)-.08*(1-prepare);
      rig.ankles[i].rotation.z=smooth(rig.ankles[i].rotation.z,0,dt,20);
      life.feet[i].planted=false;
    }
    if(life.body) {
      life.body.position.set(0,rig.bodyRestY,0);
      life.body.rotation.x=smooth(life.body.rotation.x,.10+.055*(1-prepare),dt,10);
      life.body.rotation.y=smooth(life.body.rotation.y,life.jumpLead===0?.055:-.055,dt,9);
      life.body.rotation.z=smooth(life.body.rotation.z,-life.turn*.018,dt,9);
    }
    return swing;
  }
  const justLanded=life.wasAir;
  if(justLanded)life.gait=life.jumpLead===0?0:.5;
  life.wasAir=false;life.airPrepare=0;
  const maxLength = rig.upperLeg + rig.lowerLeg - .006;
  const sin = Math.sin(heading), cos = Math.cos(heading);
  let rootY = -life.landingCompression;
  for (let i = 0; i < 2; i++) {
    const phase = (life.gait + i * .5) % 1, foot = life.feet[i];
    const reach = stride * duty * .5;
    let z, lift = 0, pitch = 0;
    const wasPlanted=foot.planted;
    foot.planted = phase <= duty || life.blend === 0;
    if(!wasPlanted&&foot.planted&&walking&&actor===world.player&&!world.reduced&&!justLanded&&motion?.phase!=='landing')world.callbacks?.onFootstep?.(speed);
    if (phase <= duty) {
      const t = phase / duty;
      z = reach - stride * phase;
      pitch = t < .12 ? -.09 * (1 - t / .12) : t > .80 ? .16 * (t - .80) / .20 : 0;
    } else {
      const t = (phase - duty) / (1 - duty);
      z = -reach + 2 * reach * ease(t);
      lift = Math.sin(Math.PI * t) * (.06 + life.run * .23);
      pitch = -.11 * Math.sin(Math.PI * t);
    }
    foot.z = z * life.blend; foot.gaitPitch = pitch * life.blend;
    const localX = life.legs[i].position.x;
    const footX = actor.position.x + (localX * cos + foot.z * sin) * actorScale;
    const footZ = actor.position.z + (-localX * sin + foot.z * cos) * actorScale;
    const terrain=sampleFootSupport((x,z)=>world.heightAt(x,z),footX,footZ,heading,actorScale,rig,foot.gaitPitch);
    foot.pitch=terrain.pitch;foot.roll=terrain.roll;
    const ground = clamp((terrain.height - actor.position.y) / actorScale, -.18, .18);
    foot.y = terrain.support + ground + lift * life.blend;
    const availableDrop = Math.sqrt(Math.max(.1, maxLength * maxLength - foot.z * foot.z));
    rootY = Math.min(rootY, foot.y + availableDrop - rig.hipHeight);
  }
  // Lower enough to keep a planted foot in reach; rise smoothly without bounce.
  life.rootY = Math.min(smooth(life.rootY, rootY, dt, 18), rootY + .001);
  rig.root.position.y = life.rootY;
  for (let i = 0; i < 2; i++) {
    const foot = life.feet[i], down = rig.hipHeight + life.rootY - foot.y;
    const length = clamp(Math.hypot(down, foot.z), .16, rig.upperLeg + rig.lowerLeg - .0001);
    const thigh = Math.acos(clamp((rig.upperLeg ** 2 + length ** 2 - rig.lowerLeg ** 2) / (2 * rig.upperLeg * length), -1, 1));
    const bend = Math.PI - Math.acos(clamp((rig.upperLeg ** 2 + rig.lowerLeg ** 2 - length ** 2) / (2 * rig.upperLeg * rig.lowerLeg), -1, 1));
    const hip = -Math.atan2(foot.z, down) - thigh;
    life.legs[i].rotation.x = hip; rig.knees[i].rotation.x = bend;
    rig.ankles[i].rotation.x = -(hip + bend) + foot.pitch;
    rig.ankles[i].rotation.z = foot.roll;
  }
  if (life.body) {
    life.body.position.set(clamp(life.turn*life.speed*.004,-.025,.025),rig.bodyRestY,0);
    const lean=(actor.userData.restBodyTilt||0)+life.run*life.blend*.13+life.acceleration*.009+life.landingCompression*.9;
    life.body.rotation.x=smooth(life.body.rotation.x,lean,dt,11);
    life.body.rotation.y=smooth(life.body.rotation.y,Math.sin(life.gait*TAU)*(.024+.05*life.run)*life.blend-life.turn*.016*life.blend,dt,10);
    life.body.rotation.z=smooth(life.body.rotation.z,clamp(-life.turn*life.speed*.017,-.15,.15)*life.blend,dt,10);
  }
  return swing;
}

function spring(state,target,dt,stiffness=135,damping=19) {
  const steps=Math.max(1,Math.ceil(dt/.008)),h=dt/steps;
  for(let i=0;i<steps;i++){state.v+=(stiffness*(target-state.x)-damping*state.v)*h;state.x+=state.v*h;}
  return state.x;
}

function secondaryMotion(life,dt,time,motion,reduced) {
  const rig=life.rig;if(!rig)return;
  const s=life.secondary,energy=reduced?0:life.blend,cycle=life.gait*TAU;
  const acceleration=reduced?0:life.acceleration,impact=reduced?0:life.landingCompression;
  if(rig.backpack) {
    rig.backpack.rotation.x=spring(s.bagX,-acceleration*.009+Math.sin(cycle*2)*.028*energy+impact*.34,dt);
    rig.backpack.rotation.y=spring(s.bagY,-life.turn*.028*energy,dt,100,16);
    rig.backpack.rotation.z=spring(s.bagZ,Math.sin(cycle)*.027*energy+life.turn*.016*energy,dt,110,17);
    const lift=spring(s.bagLift,Math.sin(cycle*2)*.007*energy-impact*.075,dt,170,19);
    rig.backpack.position.y=rig.backpackRest.y+clamp(lift,-.015,.015);
  }
  if(rig.hair) {
    const air=reduced?0:clamp(Number(motion?.verticalVelocity)||0,-7,7);
    const pitch=clamp(.07*energy+acceleration*.025+air*.019+Math.sin(cycle)*.025*energy,-.07,.36);
    rig.hair.root.rotation.x=spring(s.hairX,pitch,dt,105,13);
    rig.hair.root.rotation.y=spring(s.hairY,clamp(-life.turn*.07,-.24,.24)*energy,dt,90,12);
    rig.hair.tip.rotation.x=spring(s.tipX,rig.hair.root.rotation.x*.7+impact*.6,dt,76,10);
  }
}

function blink(life, time, reduced) {
  if (!life.rig) return;
  const phase = (time + life.phase) % 4.9;
  const closure = !reduced && phase > 4.69 ? Math.sin((phase - 4.69) / .21 * Math.PI) ** 2 : 0;
  for (const eye of life.rig.eyes) eye.scale.y = 1 - closure * .94;
}

function updateWalker(world, actor, life, dt, time) {
  let distance = 0;
  if (life.pause > 0) life.pause -= dt;
  else {
    const targetZ = life.homeZ + life.direction * 2.6;
    if (Math.abs(targetZ - actor.position.z) < .07) { life.direction *= -1; life.pause = 2.4 + life.phase % 3; }
    else {
      const wanted = life.direction > 0 ? 0 : Math.PI;
      actor.rotation.y += wrap(wanted - actor.rotation.y) * (1 - Math.exp(-dt * 3.2));
      if (Math.abs(wrap(wanted - actor.rotation.y)) < .22) {
        const step = Math.min(.68 * dt, Math.abs(targetZ - actor.position.z));
        const x = actor.position.x, z = actor.position.z + step * life.direction;
        const playerNear = Math.hypot(world.player.position.x - x, world.player.position.z - z) < .9 || Boolean(world.propInteractions?.blocksNpc(x,z));
        const neighbourNear = world.npcs.some(npc => npc.group !== actor && npc.group.visible && Math.hypot(npc.group.position.x - x, npc.group.position.z - z) < .66);
        if (world.canWalk(x, z) && !playerNear && !neighbourNear) {
          actor.position.z = z; actor.position.y = world.heightAt(x, z); distance = step;
        } else life.pause = .7;
      }
    }
  }
  const swing = locomotion(world, actor, life, distance, dt, distance > 0, distance / Math.max(dt, .001));
  applyPose(actor, life, [swing, -swing, -.045, .045, 0, distance ? 0 : Math.sin(life.phase) * .14, .15, .15], dt, time);
  life.phase += dt * .14;
}

function residentPose(id, time, speaking, flags, inConversation = false) {
  const cycle = time % 16, nod = speaking ? Math.sin(time * 2.5) * .017 : 0;
  if (id === 'granny') {
    const fanning = !inConversation && !flags?.has('granny') && cycle > 2 && cycle < 11;
    return [0, -.08, -.055, .08, nod - .015, inConversation ? 0 : Math.sin(time * .36) * .08,
      .16, fanning ? 1.08 + Math.sin(time * 3.7) * .10 : .78];
  }
  if (id === 'chef') {
    const tidying = !inConversation && cycle < (flags?.has('chef') ? 2.5 : 6);
    return [tidying ? -.09 : 0, tidying ? -.13 : .02, -.09, .10,
      tidying ? .08 : nod, inConversation ? 0 : Math.sin(time * .4) * .09,
      tidying ? .53 : .16, tidying ? .76 + Math.sin(time * 2.7) * .07 : .32];
  }
  if (id === 'dock') {
    return [0, -.06, -.045, .085, nod, inConversation ? 0 : Math.sin(time * .28) * .21,
      .15, .99 + Math.sin(time * .48) * .025];
  }
  if (id === 'community') {
    const checking = !inConversation && cycle > 3 && cycle < (flags?.has('prepared') ? 7 : 11);
    return [-.08, checking ? -.1 : 0, -.085, .065, checking ? .13 : nod,
      checking ? -.09 : inConversation ? 0 : Math.sin(time * .3) * .09,
      checking ? 1.13 : .9, checking ? .78 : .16];
  }
  return [0, 0, -.045, .045, nod, 0, .15, .15];
}

/** One SkinnedMesh per resident; animation only updates retained joint transforms. */
export function updateTownLife(world, dt, time) {
  updateAtmosphere(world, dt);
  if (world.townWind) world.townWind.value = world.reduced ? 0 : time;
  if (!world.player || !world.active || world.suspended) return;
  const player = world.player, playerLife = lifeFor(world, player, 'player');
  const walking = world.walking && !world.blocked;
  const playerStep = walking ? (Number.isFinite(world.movementDistance) ? world.movementDistance : (world.moveSpeed || 0) * dt) : 0;
  const speed = Number.isFinite(world.moveSpeed) ? world.moveSpeed : playerStep / Math.max(dt, .001);
  const motion=world.playerMotion||null;
  const swing = locomotion(world, player, playerLife, world.reduced ? 0 : playerStep, dt, walking && !world.reduced, speed,motion);
  const talking = world.conversation && world.speakingId === 'player';
  const elbow = .16 + playerLife.run * .77 * playerLife.blend;
  const lift=playerLife.run*playerLife.blend*Math.sin(playerLife.gait*TAU)*.12;
  let playerPose=[swing,-swing,-.055,.055,talking?Math.sin(time*2.7)*.018:-(playerLife.body?.rotation.x||0)*.27,0,elbow+lift,elbow-lift];
  if(motion?.grounded===false) {
    const prepare=playerLife.airPrepare,lead=playerLife.jumpLead===0;
    playerPose=[(lead?-.24:-.67)*(1-prepare)-.16*prepare,(lead?-.67:-.24)*(1-prepare)-.16*prepare,
      -.12,.12,-.03+.13*prepare,0,.95-.4*prepare,1.03-.4*prepare];
  }
  applyPose(player,playerLife,playerPose,dt,time);
  secondaryMotion(playerLife,dt,time,motion,world.reduced);
  blink(playerLife, time, world.reduced); player.rotation.z = 0;
  for (const npc of world.npcs) {
    const actor = npc.group, life = lifeFor(world, actor, npc.id);
    if (!actor.visible) continue;
    if (npc.id.startsWith('walker') && !npc.activityAnchor && !world.reduced && world.conversation?.npc!==actor && world.greetingTarget!==npc.id) updateWalker(world, actor, life, dt, time);
    else {
      const inConversation = world.conversation?.npc === actor;
      const speaking = inConversation && world.speakingId === npc.id;
      const now = world.reduced ? 0 : time + life.phase;
      locomotion(world, actor, life, 0, dt, false, 0);
      applyPose(actor, life, residentPose(npc.id, now, speaking, world.storyFlags, inConversation || world.reduced), dt, now);
      actor.rotation.z = 0;
      if (life.body) life.body.position.y = (life.rig?.bodyRestY || 0) + (world.reduced ? 0 : Math.sin(now * 1.35) * .0015);
    }
    secondaryMotion(life,dt,time,null,world.reduced);
    blink(life, time, world.reduced);
  }
}
