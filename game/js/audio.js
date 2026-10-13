// 夜盘气氛：低音琴弦 + 五行短音。不依赖外部音频文件。

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let muted = false;

  function unlock() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.4;
      master.connect(ctx.destination);
      const len = ctx.sampleRate * 1;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      startDrone();
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  function startDrone() {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 380;
    const dg = ctx.createGain();
    dg.gain.value = 0.22;
    dg.connect(filter);
    filter.connect(master);
    [73.42, 110, 146.83, 220].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = i < 2 ? 'sine' : 'triangle';
      o.frequency.value = f;
      g.gain.value = i < 2 ? 0.07 : 0.028;
      o.connect(g);
      g.connect(dg);
      o.start();
    });
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = 0.045;
    lg.gain.value = 140;
    lfo.connect(lg);
    lg.connect(filter.frequency);
    lfo.start();
  }

  function tone(freq, dur, gain, type = 'sine', delay = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function noise(dur, gain) {
    if (!ctx || muted || !noiseBuf) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 180;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + dur);
  }

  const WX_TONE = { 金: 880, 木: 349, 水: 523, 火: 698, 土: 196 };

  return {
    unlock,
    get muted() { return muted; },
    setMuted(v) {
      muted = !!v;
      if (master) master.gain.value = muted ? 0 : 0.4;
    },
    ui() { tone(587, 0.07, 0.04); },
    wx(name) { tone(WX_TONE[name] || 440, 0.09, 0.045, 'triangle'); },
    ke(perfect) {
      tone(523, 0.16, 0.07);
      tone(659, 0.2, 0.05, 'sine', 0.05);
      if (perfect) tone(784, 0.26, 0.045, 'sine', 0.1);
    },
    sheng() {
      tone(392, 0.18, 0.05);
      tone(494, 0.22, 0.04, 'sine', 0.06);
    },
    empty() { tone(311, 0.22, 0.04, 'triangle'); },
    hurt() { noise(0.14, 0.1); tone(92, 0.22, 0.07); },
    clear() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.32, 0.055, 'sine', i * 0.07)); },
    fail() { tone(196, 0.38, 0.06, 'triangle'); tone(146, 0.5, 0.05, 'sine', 0.12); },
    enter() { tone(440, 0.12, 0.04, 'sine'); tone(659, 0.16, 0.03, 'sine', 0.06); },
  };
}
