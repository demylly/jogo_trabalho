/* ============================================================
   audio.js — WebAudio: motor, drift, efeitos e trilha synthwave
   ============================================================ */
(function (ND) {
  'use strict';

  var CHORDS = [
    [220.00, 261.63, 329.63], // A menor
    [174.61, 220.00, 261.63], // Fá
    [261.63, 329.63, 392.00], // Dó
    [196.00, 246.94, 293.66]  // Sol
  ];
  var ROOTS = [55.00, 43.65, 65.41, 49.00];
  var BASS_STEPS = [0, 3, 6, 8, 11, 14];

  function makeGain(ctx, value, dest) {
    var g = ctx.createGain();
    g.gain.value = value;
    if (dest) g.connect(dest);
    return g;
  }

  ND.Audio = function () {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.musicPlaying = false;
    this.pendingMusic = false;
    this.musicTimer = null;
    this.intensity = 0.6;

    this.tempo = 96;
    this.stepDur = 60 / this.tempo / 4;
    this.musicStep = 0;
    this.nextNoteTime = 0;
  };

  ND.Audio.prototype.init = function () {
    if (this.ready) {
      if (this.ctx.state === 'suspended') { try { this.ctx.resume(); } catch (e) {} }
      return true;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;

    var ctx;
    try { ctx = new AC(); } catch (e) { return false; }
    this.ctx = ctx;

    // master → compressor → saída
    this.master = makeGain(ctx, this.muted ? 0.0001 : 0.9);
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 22;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;
    this.master.connect(comp);
    comp.connect(ctx.destination);

    this.sfxBus = makeGain(ctx, 0.6, this.master);
    this.musicBus = makeGain(ctx, 0.0001, this.master);
    this.engineBus = makeGain(ctx, 0.55, this.master);

    // ruído branco reaproveitado
    var len = Math.floor(ctx.sampleRate * 1.5);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;

    this.buildEngine();
    this.buildDrift();
    this.buildDelay();

    this.ready = true;
    if (this.pendingMusic) { this.pendingMusic = false; this.startMusic(); }
    return true;
  };

  ND.Audio.prototype.buildEngine = function () {
    var ctx = this.ctx;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 480;
    this.engineFilter.Q.value = 3.2;

    this.engineGain = makeGain(ctx, 0.0001, this.engineBus);

    this.engineOsc1 = ctx.createOscillator();
    this.engineOsc1.type = 'sawtooth';
    this.engineOsc1.frequency.value = 46;

    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 69;

    var g1 = makeGain(ctx, 0.55, this.engineFilter);
    var g2 = makeGain(ctx, 0.22, this.engineFilter);

    this.engineOsc1.connect(g1);
    this.engineOsc2.connect(g2);
    this.engineFilter.connect(this.engineGain);
    this.engineOsc1.start();
    this.engineOsc2.start();
  };

  ND.Audio.prototype.buildDrift = function () {
    var ctx = this.ctx;
    this.driftGain = makeGain(ctx, 0.0001, this.sfxBus);

    this.driftFilter = ctx.createBiquadFilter();
    this.driftFilter.type = 'bandpass';
    this.driftFilter.frequency.value = 1500;
    this.driftFilter.Q.value = 0.9;

    var src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    src.connect(this.driftFilter);
    this.driftFilter.connect(this.driftGain);
    src.start();
  };

  ND.Audio.prototype.buildDelay = function () {
    var ctx = this.ctx;
    this.delay = ctx.createDelay(1.0);
    this.delay.delayTime.value = 0.29;
    var fb = makeGain(ctx, 0.3);
    var wet = makeGain(ctx, 0.32, this.musicBus);
    this.delay.connect(fb);
    fb.connect(this.delay);
    this.delay.connect(wet);
  };

  /* ---------------- tempo real ---------------- */

  ND.Audio.prototype.updateEngine = function (kmh, throttle, boost, active) {
    if (!this.ready) return;
    var t = this.ctx.currentTime;
    var k = Math.min(kmh / 240, 1);
    var vol = active
      ? 0.018 + k * 0.05 + Math.max(throttle, 0) * 0.018 + (boost ? 0.02 : 0)
      : 0.0001;
    this.engineGain.gain.setTargetAtTime(Math.max(vol, 0.0001), t, 0.07);

    var f = 40 + kmh * 0.9 + (boost ? 30 : 0);
    this.engineOsc1.frequency.setTargetAtTime(f, t, 0.06);
    this.engineOsc2.frequency.setTargetAtTime(f * 1.503, t, 0.06);
    this.engineFilter.frequency.setTargetAtTime(260 + kmh * 8 + (boost ? 900 : 0), t, 0.09);
  };

  ND.Audio.prototype.setDrift = function (amount) {
    if (!this.ready) return;
    var v = Math.max(0, Math.min(amount, 1));
    this.driftGain.gain.setTargetAtTime(v * 0.085, this.ctx.currentTime, 0.06);
  };

  ND.Audio.prototype.setIntensity = function (v) {
    this.intensity = Math.max(0.2, Math.min(1, v));
  };

  /* ---------------- efeitos ---------------- */

  ND.Audio.prototype.tone = function (freq, dur, type, vol, when, slideTo) {
    if (!this.ready) return;
    var ctx = this.ctx;
    var t = (when == null) ? ctx.currentTime : when;
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(vol || 0.07, 0.0002), t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.04);
  };

  ND.Audio.prototype.noiseBurst = function (dur, vol, type, freq, q, when) {
    if (!this.ready) return;
    var ctx = this.ctx;
    var t = (when == null) ? ctx.currentTime : when;
    var src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    var f = ctx.createBiquadFilter();
    f.type = type || 'bandpass';
    f.frequency.value = freq || 1800;
    f.Q.value = q || 0.8;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxBus);
    src.start(t, Math.random() * 0.8);
    src.stop(t + dur + 0.05);
  };

  ND.Audio.prototype.ui = function () {
    this.tone(760, 0.07, 'square', 0.035, null, 980);
  };

  ND.Audio.prototype.countdown = function (n) {
    this.tone(n > 0 ? 440 : 880, n > 0 ? 0.12 : 0.5, 'square', 0.07);
    if (n <= 0) this.noiseBurst(0.5, 0.05, 'highpass', 900, 0.7);
  };

  ND.Audio.prototype.lap = function () {
    var t = this.ctx ? this.ctx.currentTime : 0;
    this.tone(660, 0.11, 'triangle', 0.08, t);
    this.tone(990, 0.22, 'triangle', 0.07, t + 0.1);
  };

  ND.Audio.prototype.finish = function () {
    if (!this.ready) return;
    var t = this.ctx.currentTime;
    var notes = [523.25, 659.25, 783.99, 1046.5];
    for (var i = 0; i < notes.length; i++) {
      this.tone(notes[i], 0.32, 'triangle', 0.09, t + i * 0.13);
    }
    this.noiseBurst(0.8, 0.05, 'highpass', 2400, 0.6, t);
  };

  ND.Audio.prototype.hit = function (strength) {
    var s = Math.min(1, Math.max(0.35, strength || 1));
    this.tone(120, 0.18, 'sine', 0.11 * s, null, 42);
    this.noiseBurst(0.16, 0.1 * s, 'lowpass', 700, 0.7);
  };

  ND.Audio.prototype.wall = function () {
    this.tone(90, 0.14, 'sine', 0.07, null, 38);
    this.noiseBurst(0.1, 0.05, 'bandpass', 1200, 1.2);
  };

  ND.Audio.prototype.boost = function () {
    this.noiseBurst(0.45, 0.08, 'bandpass', 900, 0.6);
    this.tone(220, 0.35, 'sawtooth', 0.035, null, 660);
  };

  ND.Audio.prototype.record = function () {
    if (!this.ready) return;
    var t = this.ctx.currentTime;
    var notes = [880, 1108.7, 1318.5, 1760];
    for (var i = 0; i < notes.length; i++) {
      this.tone(notes[i], 0.18, 'triangle', 0.06, t + i * 0.08);
    }
  };

  /* ---------------- trilha ---------------- */

  ND.Audio.prototype.startMusic = function () {
    if (!this.ready) { this.pendingMusic = true; return; }
    if (this.musicPlaying) return;
    this.musicPlaying = true;
    var now = this.ctx.currentTime;
    this.musicBus.gain.cancelScheduledValues(now);
    this.musicBus.gain.setValueAtTime(Math.max(this.musicBus.gain.value, 0.0001), now);
    this.musicBus.gain.linearRampToValueAtTime(0.62, now + 0.6);
    this.musicStep = 0;
    this.nextNoteTime = now + 0.1;
    var self = this;
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = setInterval(function () { self.scheduler(); }, 25);
    this.scheduler();
  };

  ND.Audio.prototype.stopMusic = function () {
    this.pendingMusic = false;
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
    if (this.ready) {
      var now = this.ctx.currentTime;
      this.musicBus.gain.cancelScheduledValues(now);
      this.musicBus.gain.setTargetAtTime(0.0001, now, 0.22);
    }
    this.musicPlaying = false;
  };

  ND.Audio.prototype.duckMusic = function (on) {
    if (!this.ready || !this.musicPlaying) return;
    var now = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(on ? 0.14 : 0.62, now, 0.18);
  };

  ND.Audio.prototype.scheduler = function () {
    if (!this.ready || !this.musicPlaying) return;
    var now = this.ctx.currentTime;
    if (this.nextNoteTime < now - 0.25) this.nextNoteTime = now + 0.05;
    while (this.nextNoteTime < now + 0.14) {
      this.playStep(this.musicStep, this.nextNoteTime);
      this.nextNoteTime += this.stepDur;
      this.musicStep = (this.musicStep + 1) % 64;
    }
  };

  ND.Audio.prototype.playStep = function (step, when) {
    var bar = (step >> 4) & 3;
    var s = step & 15;
    var chord = CHORDS[bar];
    var root = ROOTS[bar];

    if (s % 4 === 0) this.kick(when);
    if (s === 4 || s === 12) this.snare(when);
    if (s % 2 === 0) this.hat(when, s % 4 === 2 ? 0.03 : 0.016);
    if (BASS_STEPS.indexOf(s) >= 0) this.bass(when, s === 14 ? root * 2 : root, this.stepDur * 1.6);
    if (s === 0) this.pad(when, chord, this.stepDur * 16);
    if (s % 2 === 0) {
      var note = chord[(s / 2) % 3] * 2;
      if (s === 14) note = chord[0] * 4;
      this.arp(when, note, this.stepDur * 1.2);
    }
  };

  ND.Audio.prototype.kick = function (when) {
    var ctx = this.ctx;
    var o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(155, when);
    o.frequency.exponentialRampToValueAtTime(44, when + 0.12);
    var g = makeGain(ctx, 0.0001, this.musicBus);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.5, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.3);
    o.connect(g);
    o.start(when);
    o.stop(when + 0.34);
  };

  ND.Audio.prototype.snare = function (when) {
    var ctx = this.ctx;
    var src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    var f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1900;
    f.Q.value = 0.9;
    var g = makeGain(ctx, 0.0001, this.musicBus);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.16, when + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.17);
    src.connect(f); f.connect(g);
    src.start(when, Math.random() * 0.8);
    src.stop(when + 0.2);
  };

  ND.Audio.prototype.hat = function (when, vol) {
    var ctx = this.ctx;
    var src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    var f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7200;
    var g = makeGain(ctx, 0.0001, this.musicBus);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    src.connect(f); f.connect(g);
    src.start(when, Math.random() * 0.8);
    src.stop(when + 0.07);
  };

  ND.Audio.prototype.bass = function (when, freq, dur) {
    var ctx = this.ctx;
    var o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    var f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(420, when);
    f.frequency.exponentialRampToValueAtTime(150, when + dur);
    f.Q.value = 4;
    var g = makeGain(ctx, 0.0001, this.musicBus);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.13, when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(f); f.connect(g);
    o.start(when);
    o.stop(when + dur + 0.03);
  };

  ND.Audio.prototype.pad = function (when, notes, dur) {
    var ctx = this.ctx;
    for (var n = 0; n < notes.length; n++) {
      for (var d = -1; d <= 1; d += 2) {
        var o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = notes[n];
        o.detune.value = d * 7;
        var f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 780;
        f.Q.value = 0.6;
        var g = makeGain(ctx, 0.0001, this.musicBus);
        g.gain.setValueAtTime(0.0001, when);
        g.gain.linearRampToValueAtTime(0.013, when + 0.65);
        g.gain.setValueAtTime(0.013, when + dur - 0.7);
        g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
        o.connect(f); f.connect(g);
        o.start(when);
        o.stop(when + dur + 0.05);
      }
    }
  };

  ND.Audio.prototype.arp = function (when, freq, dur) {
    var ctx = this.ctx;
    var o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    var f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2400;
    var g = makeGain(ctx, 0.0001, this.musicBus);
    var vol = 0.022 * (0.55 + this.intensity * 0.65);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(f); f.connect(g);
    g.connect(this.delay);
    o.start(when);
    o.stop(when + dur + 0.03);
  };

  /* ---------------- mudo ---------------- */

  ND.Audio.prototype.setMuted = function (m) {
    this.muted = !!m;
    if (this.ready) {
      var now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(this.muted ? 0.0001 : 0.9, now, 0.06);
    }
    return this.muted;
  };

  ND.Audio.prototype.toggleMute = function () {
    return this.setMuted(!this.muted);
  };

})(window.ND);
