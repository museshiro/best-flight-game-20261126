// Cendrawasih Ridge Run — sound, all of it synthesised.
// One job: engine hum, wind, ring chimes, warnings and the crash, from WebAudio
// oscillators and filtered noise. No audio file is ever loaded.

export function createAudio() {
  return {
    ctx: null, master: null, engineOsc: null, engineOsc2: null,
    engineGain: null, engineFilter: null, windGain: null, windSource: null,
    enabled: false, alarmUntil: 0,
  };
}

/** Start the audio graph. Call from a user gesture; browsers block it before one. */
export function startAudio(a) {
  if (a.ctx) {
    if (a.ctx.state === 'suspended') a.ctx.resume();
    return;
  }
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const master = ctx.createGain();
    master.gain.value = 0.4;
    master.connect(ctx.destination);
    // Engine: two detuned saws through a low-pass, pitched by the throttle.
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.connect(master);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(filter);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 58;
    osc.connect(gain);
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = 116;
    const gain2 = ctx.createGain();
    gain2.gain.value = 0.25;
    gain2.connect(gain);
    osc2.connect(gain2);
    osc.start();
    osc2.start();
    // Wind: looped white noise through a band-pass, louder the faster you fly.
    const noiseLen = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < noiseLen; i += 1) data[i] = Math.random() * 2 - 1;
    const wind = ctx.createBufferSource();
    wind.buffer = buffer;
    wind.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 900;
    band.Q.value = 0.6;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    wind.connect(band);
    band.connect(windGain);
    windGain.connect(master);
    wind.start();
    a.ctx = ctx;
    a.master = master;
    a.engineOsc = osc;
    a.engineOsc2 = osc2;
    a.engineGain = gain;
    a.engineFilter = filter;
    a.windGain = windGain;
    a.enabled = true;
  } catch {
    a.enabled = false;
  }
}

/** Every frame: engine pitch follows throttle, wind follows speed. */
export function updateAudio(a, throttle, speed, airborne) {
  if (!a.enabled || !a.ctx) return;
  const t = a.ctx.currentTime;
  const rpm = 52 + throttle * 68;
  a.engineOsc.frequency.setTargetAtTime(rpm, t, 0.08);
  a.engineOsc2.frequency.setTargetAtTime(rpm * 2, t, 0.08);
  a.engineFilter.frequency.setTargetAtTime(320 + throttle * 900, t, 0.1);
  a.engineGain.gain.setTargetAtTime(airborne ? 0.05 + throttle * 0.075 : throttle * 0.05, t, 0.1);
  a.windGain.gain.setTargetAtTime(Math.min(0.14, Math.max(0, (speed - 18) / 60) * 0.14), t, 0.15);
}

/** A short two-note chime when a ring is passed. */
export function playChime(a) {
  if (!a.enabled || !a.ctx) return;
  const t = a.ctx.currentTime;
  [660, 990].forEach((freq, i) => {
    const osc = a.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const g = a.ctx.createGain();
    g.gain.setValueAtTime(0, t + i * 0.09);
    g.gain.linearRampToValueAtTime(0.22, t + i * 0.09 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.5);
    osc.connect(g);
    g.connect(a.master);
    osc.start(t + i * 0.09);
    osc.stop(t + i * 0.09 + 0.55);
  });
}

/** A rising alarm beep for low altitude or low fuel. */
export function playAlarm(a) {
  if (!a.enabled || !a.ctx) return;
  const now = performance.now();
  if (now < a.alarmUntil) return;
  a.alarmUntil = now + 700;
  const t = a.ctx.currentTime;
  const osc = a.ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.value = 880;
  const g = a.ctx.createGain();
  g.gain.setValueAtTime(0.12, t);
  g.gain.setValueAtTime(0.12, t + 0.12);
  g.gain.setValueAtTime(0, t + 0.16);
  osc.connect(g);
  g.connect(a.master);
  osc.start(t);
  osc.stop(t + 0.2);
}

/** A dull thud and noise burst for a crash. */
export function playCrash(a) {
  if (!a.enabled || !a.ctx) return;
  const t = a.ctx.currentTime;
  const len = a.ctx.sampleRate * 0.5;
  const buffer = a.ctx.createBuffer(1, len, a.ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.ctx.createBufferSource();
  src.buffer = buffer;
  const g = a.ctx.createGain();
  g.gain.value = 0.5;
  src.connect(g);
  g.connect(a.master);
  src.start(t);
  const osc = a.ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, t);
  osc.frequency.exponentialRampToValueAtTime(38, t + 0.4);
  const g2 = a.ctx.createGain();
  g2.gain.setValueAtTime(0.5, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
  osc.connect(g2);
  g2.connect(a.master);
  osc.start(t);
  osc.stop(t + 0.5);
}
