/* Tiny synthesized sound effects + a soft generative music loop (no audio files needed). */
(function (global) {
  'use strict';
  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16];
  const Sfx = {
    ac: null, master: null, musicGain: null, sfxOn: true, musicOn: true, musicTimer: null, root: 0, beat: 0, nextT: 0,
    load() {
      try {
        const s = JSON.parse(localStorage.getItem('heartstring.audio') || '{}');
        if (s.sfx === false) this.sfxOn = false;
        if (s.music === false) this.musicOn = false;
      } catch (e) { /* ignore */ }
    },
    save() { try { localStorage.setItem('heartstring.audio', JSON.stringify({ sfx: this.sfxOn, music: this.musicOn })); } catch (e) { /* ignore */ } },
    ensure() {
      if (!this.ac) {
        const AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) return false;
        this.ac = new AC();
        this.master = this.ac.createGain(); this.master.gain.value = 0.45; this.master.connect(this.ac.destination);
        this.musicGain = this.ac.createGain(); this.musicGain.gain.value = this.musicOn ? 0.1 : 0; this.musicGain.connect(this.master);
      }
      if (this.ac.state === 'suspended') this.ac.resume();
      return true;
    },
    tone(freq, dur, type, vol, slide, delay, dest) {
      const ac = this.ac, t = ac.currentTime + (delay || 0);
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest || this.master);
      o.start(t); o.stop(t + dur + 0.05);
    },
    noise(dur, vol, freq, delay) {
      const ac = this.ac, t = ac.currentTime + (delay || 0);
      const len = Math.floor(ac.sampleRate * dur);
      const buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ac.createBufferSource(); src.buffer = buf;
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 800; f.Q.value = 0.8;
      const g = ac.createGain(); g.gain.value = vol || 0.2;
      src.connect(f); f.connect(g); g.connect(this.master); src.start(t);
    },
    play(name) {
      if (!this.sfxOn || !this.ensure()) return;
      switch (name) {
        case 'jump': this.tone(330, 0.14, 'square', 0.06, 1.9); break;
        case 'land': this.noise(0.08, 0.12, 300); break;
        case 'bounce': this.tone(200, 0.35, 'sine', 0.25, 4); this.tone(400, 0.25, 'triangle', 0.08, 2.5, 0.03); break;
        case 'heart': [880, 1108, 1318, 1760].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.12, 0, i * 0.06)); break;
        case 'die': this.tone(520, 0.5, 'sawtooth', 0.08, 0.25); this.noise(0.3, 0.1, 500); break;
        case 'plate': this.tone(660, 0.07, 'square', 0.05); this.tone(990, 0.07, 'square', 0.04, 0, 0.05); break;
        case 'door': this.noise(0.35, 0.08, 220); break;
        case 'anchor': this.tone(140, 0.12, 'triangle', 0.18, 0.6); this.noise(0.06, 0.1, 1800); break;
        case 'grab': this.tone(240, 0.08, 'triangle', 0.14, 0.7); break;
        case 'cp': [523, 659, 784].forEach((f, i) => this.tone(f, 0.3, 'sine', 0.13, 0, i * 0.08)); break;
        case 'crumble': this.noise(0.35, 0.16, 400); break;
        case 'pop': this.tone(700, 0.08, 'sine', 0.12, 1.6); break;
        case 'latch': [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.1, 0, i * 0.07)); break;
        case 'reel': this.tone(900 + Math.random() * 200, 0.03, 'square', 0.015); break;
        case 'win': [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.14, 0, i * 0.11)); break;
        case 'kiss':
          this.tone(1500, 0.09, 'sine', 0.14, 0.45);
          [659, 784, 988, 1318].forEach((f, i) => this.tone(f, 0.45, 'triangle', 0.1, 0, 0.14 + i * 0.09));
          break;
        case 'click': this.tone(880, 0.05, 'sine', 0.08); break;
        case 'msg': this.tone(880, 0.12, 'sine', 0.12, 1.5); this.tone(1320, 0.18, 'triangle', 0.07, 1.2, 0.07); break;
        case 'love': [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.4, 'sine', 0.09, 0, i * 0.09)); break;
        case 'sip': this.noise(0.18, 0.06, 1400); this.tone(500, 0.12, 'sine', 0.05, 1.4, 0.12); break;
        case 'dance': [523, 659, 784, 659, 880, 784].forEach((f, i) => this.tone(f, 0.16, 'square', 0.035, 0, i * 0.13)); break;
        case 'type': this.tone(1200 + Math.random() * 300, 0.03, 'sine', 0.025); break;
        case 'boom': this.noise(0.4, 0.12, 260); this.tone(160, 0.3, 'sine', 0.12, 0.5); break;
        case 'whoosh': this.noise(0.5, 0.06, 1200); break;
        case 'chomp': this.noise(0.06, 0.13, 700); this.noise(0.05, 0.1, 900, 0.11); this.tone(300, 0.06, 'sine', 0.05, 0.7, 0.02); break;
        case 'shine':
          [1047, 1319, 1568, 2093, 2637, 3136].forEach((f, i) => this.tone(f, 0.5, 'sine', 0.05, 1.01, i * 0.06));
          this.tone(523, 1.2, 'triangle', 0.05, 2, 0); break;
        case 'sparkle': [1568, 2093, 2637].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.04, 0, i * 0.05)); break;
      }
    },
    setMusic(on) { this.musicOn = on; this.save(); if (this.musicGain) this.musicGain.gain.value = on ? 0.1 : 0; },
    setSfx(on) { this.sfxOn = on; this.save(); },
    startMusic(root) {
      this.root = root || 0;
      if (!this.ensure()) return;
      if (this.musicTimer) return;
      this.nextT = this.ac.currentTime + 0.1; this.beat = 0;
      this.musicTimer = setInterval(() => this.schedule(), 120);
    },
    schedule() {
      if (!this.ac) return;
      const spb = 0.36;
      while (this.nextT < this.ac.currentTime + 0.4) {
        const b = this.beat, base = 220 * Math.pow(2, this.root / 12);
        const chordRoots = [0, 5, 3, 4];
        const bar = Math.floor(b / 8) % 4;
        const cr = chordRoots[bar];
        if (b % 8 === 0) {
          this.tone(base / 2 * Math.pow(2, SCALE[cr] / 12), spb * 7.5, 'sine', 0.5, 0, this.nextT - this.ac.currentTime, this.musicGain);
        }
        const r = (Math.sin(b * 12.9898 + this.root) * 43758.5453) % 1;
        if (b % 2 === 0 || Math.abs(r) > 0.55) {
          const deg = (cr + [0, 2, 4, 2, 5, 4, 2, 7][b % 8]) % SCALE.length;
          const f = base * Math.pow(2, SCALE[deg] / 12);
          this.tone(f, spb * 1.6, 'triangle', 0.28, 0, this.nextT - this.ac.currentTime, this.musicGain);
        }
        this.nextT += spb; this.beat++;
      }
    },
  };
  Sfx.load();
  global.Sfx = Sfx;
})(typeof window !== 'undefined' ? window : globalThis);
