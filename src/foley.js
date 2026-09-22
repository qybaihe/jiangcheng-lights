// Quiet, original shoe/cloth sounds. A shared deterministic noise buffer keeps
// locomotion independent of downloads and respects the game's sound switch.
const buffers = new WeakMap();
// Short, modest two-tone horn; like the bicycle bell, it uses the effects bus.
export function playCarHorn(context,output=context?.destination){
 if(!context||context.state!=='running')return;
 const now=context.currentTime;
 for(const frequency of[349,440]){
  const oscillator=context.createOscillator(),gain=context.createGain();oscillator.type='triangle';oscillator.frequency.value=frequency;
  gain.gain.setValueAtTime(.00001,now);gain.gain.linearRampToValueAtTime(.023,now+.025);gain.gain.setValueAtTime(.023,now+.15);gain.gain.exponentialRampToValueAtTime(.00001,now+.26);
  oscillator.connect(gain);gain.connect(output);oscillator.start(now);oscillator.stop(now+.28);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
 }
}
// Two soft metallic strikes, routed through the existing effects bus.
export function playBicycleBell(context,output=context?.destination){
 if(!context||context.state!=='running')return;
 const now=context.currentTime;
 for(const offset of[0,.095])for(const [frequency,level]of[[1760,.022],[2848,.009],[3987,.003]]){
  const oscillator=context.createOscillator(),gain=context.createGain();oscillator.type='sine';oscillator.frequency.value=frequency;
  gain.gain.setValueAtTime(.00001,now+offset);gain.gain.linearRampToValueAtTime(level,now+offset+.003);gain.gain.exponentialRampToValueAtTime(.00001,now+offset+.62);
  oscillator.connect(gain);gain.connect(output);oscillator.start(now+offset);oscillator.stop(now+offset+.65);
  oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
 }
}
function noiseBuffer(context) {
  if (buffers.has(context)) return buffers.get(context);
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * .18), context.sampleRate);
  const data = buffer.getChannelData(0); let seed = 39473;
  for (let i = 0; i < data.length; i++) {
    seed = seed * 16807 % 2147483647;
    data[i] = (seed / 2147483647 * 2 - 1) * .8;
  }
  buffers.set(context, buffer); return buffer;
}

export function playMovementSound(context, kind, strength = 1, output = context?.destination) {
  if (!context || context.state !== 'running') return;
  const now = context.currentTime, cloth = kind === 'jump', landing = kind === 'land';
  const gain = Math.min(1.4, Math.max(.35, strength)) * (cloth ? .016 : landing ? .042 : .023);
  const duration = cloth ? .12 : landing ? .13 : .075;
  const noise = context.createBufferSource(), filter = context.createBiquadFilter(), envelope = context.createGain();
  noise.buffer = noiseBuffer(context); noise.playbackRate.value = cloth ? .88 : landing ? .78 : 1.15;
  filter.type = 'lowpass'; filter.frequency.value = cloth ? 1800 : landing ? 760 : 1050; filter.Q.value = .4;
  envelope.gain.setValueAtTime(0, now); envelope.gain.linearRampToValueAtTime(gain, now + .004);
  envelope.gain.exponentialRampToValueAtTime(.00001, now + duration);
  noise.connect(filter); filter.connect(envelope); envelope.connect(output);
  noise.start(now); noise.stop(now + duration);
  noise.onended = () => { noise.disconnect(); filter.disconnect(); envelope.disconnect(); };
  if (!cloth) {
    const shoe = context.createOscillator(), contact = context.createGain();
    shoe.type = 'sine'; shoe.frequency.setValueAtTime(landing ? 104 : 146, now);
    shoe.frequency.exponentialRampToValueAtTime(landing ? 55 : 78, now + .06);
    contact.gain.setValueAtTime(gain * .45, now); contact.gain.exponentialRampToValueAtTime(.00001, now + .065);
    shoe.connect(contact); contact.connect(output); shoe.start(now); shoe.stop(now + .07);
    shoe.onended = () => { shoe.disconnect(); contact.disconnect(); };
  }
}
