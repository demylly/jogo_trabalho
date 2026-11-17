/* ============================================================
   game.js — estados, corrida, câmera, HUD e telas
   ============================================================ */
(function (ND) {
  'use strict';

  var U = ND.utils;
  var TOTAL_LAPS = 3;

  // grid: primeiro da fila na frente; o jogador larga por último
  var GRID = [
    { s: 27, lat: -3.2 },
    { s: 20, lat: 3.2 },
    { s: 13, lat: -3.2 },
    { s: 6, lat: 3.2 }
  ];
  var PLAYER_SLOT = 3;

  function $(id) { return document.getElementById(id); }

  ND.Game = function (scene, camera, renderer, audio, input) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.audio = audio;
    this.input = input;

    this.save = U.loadSave();
    this.audio.muted = !!this.save.muted;

    this.state = 'boot';
    this.mode = 'race';
    this.trackIndex = U.clamp(this.save.track | 0, 0, ND.CIRCUITS.length - 1);

    this.params = new URLSearchParams(window.location.search);
    this.testMode = this.params.get('test') || '';
    var tp = parseInt(this.params.get('track'), 10);
    if (isFinite(tp)) this.trackIndex = U.clamp(tp, 0, ND.CIRCUITS.length - 1);

    this.effects = new ND.Effects(scene);
    this.ghost = new ND.Ghost(scene);
    this.car = new ND.PlayerCar(scene);
    this.rivals = [];
    this.track = null;
    this.recorder = new ND.Recorder();

    this.menuT = 0;
    this.raceTime = 0;
    this.countdownT = 3;
    this.lastCount = -1;
    this.finishDelay = 0;
    this.endShown = false;
    this.crossings = 0;
    this.lapStart = 0;
    this.lapTimes = [];
    this.bestLap = Infinity;
    this.prevU = 0;
    this.carS = 0;
    this.raceS = 0;
    this.score = 0;
    this.driftBank = 0;
    this.driftTime = 0;
    this.driftMult = 1;
    this.driftIdle = 0;
    this.driftWasOn = false;
    this.wrongWay = false;
    this.shake = 0;
    this.lastWallFx = -1;
    this.finishTime = 0;
    this.finishPos = 1;
    this.recordFlags = { lap: false, total: false };
    this.finishedShown = false;
    this.autopilot = false;

    this.camMode = 0;
    this.cameraSnap = true;
    this.lookInit = false;
    this.lookTarget = new THREE.Vector3();
    this.menuLook = new THREE.Vector3();

    this.cacheUI();
    this.buildTrack(this.trackIndex);
    this.bindUI();
    this.syncMuteUI();
    this.setState('menu');
    this.updateMenuUI();

    var self = this;
    if (this.testMode === 'auto' || this.testMode === 'race') {
      setTimeout(function () {
        self.startRace('race');
        self.autopilot = self.testMode === 'auto';
        self.simTest();
      }, 80);
    } else if (this.testMode === 'tt') {
      setTimeout(function () {
        self.startRace('tt');
        self.simTest();
      }, 80);
    } else if (this.testMode === 'end') {
      setTimeout(function () {
        self.startRace('tt');
        self.autopilot = false;
        self.raceTime = 84.532;
        self.finishTime = 84.532;
        self.bestLap = 26.914;
        self.score = 18420;
        self.finishPos = 1;
        self.crossings = TOTAL_LAPS;
        self.recordFlags = { lap: true, total: true };
        self.finishDelay = 3;
        self.showEnd();
      }, 120);
    }
  };

  /* ---------------- UI ---------------- */

  ND.Game.prototype.cacheUI = function () {
    this.ui = {
      lap: $('lap-val'),
      pos: $('pos-val'),
      time: $('race-time'),
      bestLap: $('best-lap'),
      speed: $('speed-val'),
      gear: $('gear'),
      turboFill: $('turbo-fill'),
      turboPanel: $('turbo-panel'),
      score: $('drift-score'),
      driftLive: $('drift-live'),
      driftMult: $('drift-mult'),
      countdown: $('countdown'),
      toast: $('toast'),
      wrongWay: $('wrong-way'),
      minimap: $('minimap'),
      circName: $('circ-name'),
      menuBest: $('menu-best'),
      menuGhostNote: $('menu-ghost-note'),
      endBadge: $('end-badge'),
      endTitle: $('end-title'),
      endSub: $('end-sub'),
      endTotal: $('end-total'),
      endBest: $('end-best'),
      endScore: $('end-score'),
      recordBadge: $('record-badge'),
      standings: $('end-standings'),
      btnSound: $('btn-sound'),
      btnSoundPause: $('btn-sound-pause')
    };
    this.miniCtx = this.ui.minimap ? this.ui.minimap.getContext('2d') : null;
  };

  ND.Game.prototype.bindUI = function () {
    var self = this;
    function click(id, fn) {
      var el = $(id);
      if (!el) return;
      el.addEventListener('click', function (ev) {
        ev.preventDefault();
        self.audio.init();
        self.audio.ui();
        if (el.blur) el.blur();
        fn();
      });
    }

    click('btn-race', function () { self.startRace('race'); });
    click('btn-tt', function () { self.startRace('tt'); });
    click('circ-prev', function () { self.cycleTrack(-1); });
    click('circ-next', function () { self.cycleTrack(1); });
    click('btn-sound', function () { self.toggleMute(); });
    click('btn-sound-pause', function () { self.toggleMute(); });
    click('btn-resume', function () { self.resume(); });
    click('btn-restart-pause', function () { self.startRace(self.mode); });
    click('btn-menu-pause', function () { self.goMenu(); });
    click('btn-again', function () { self.startRace(self.mode); });
    click('btn-menu-end', function () { self.goMenu(); });
  };

  ND.Game.prototype.setState = function (state, screen) {
    this.state = state;
    var s = screen;
    if (!s) {
      s = state === 'menu' ? 'menu'
        : state === 'paused' ? 'paused'
          : state === 'finished' ? 'finished'
            : 'race';
    }
    document.body.dataset.screen = s;

    if (state === 'menu') {
      this.audio.stopMusic();
      this.audio.setDrift(0);
      this.audio.updateEngine(0, 0, false, false);
      document.body.classList.remove('boosting');
    } else if (state === 'paused') {
      this.audio.duckMusic(true);
      this.audio.setDrift(0);
      this.audio.updateEngine(0, 0, false, false);
      document.body.classList.remove('boosting');
    } else if (state === 'race' || state === 'countdown') {
      this.audio.duckMusic(false);
    }
  };

  /* ---------------- pista ---------------- */

  ND.Game.prototype.buildTrack = function (index) {
    if (this.track) this.track.dispose();
    this.trackIndex = U.clamp(index | 0, 0, ND.CIRCUITS.length - 1);
    this.track = new ND.Track(this.scene, this.trackIndex);
    this.save.track = this.trackIndex;
    if (!this.testMode) U.persist(this.save);

    this.clearRivals();
    this.ghost.setData(null);
    this.ghost.hide();
    this.placeShowroom();
    this.updateMenuUI();
    this.cameraSnap = true;
  };

  ND.Game.prototype.placeShowroom = function () {
    if (!this.track) return;
    this.car.placeAt(this.track, 112, 2.2);
    this.car.turbo = 40;
    this.carHint = -1;
    this.carS = 112;
    this.prevU = this.track.nearest(this.car.pos.x, this.car.pos.z, -1).u;
    this.car.mesh.visible = true;
  };

  ND.Game.prototype.placePlayerOnGrid = function () {
    if (!this.track) return;
    var slot = GRID[PLAYER_SLOT];
    this.car.placeAt(this.track, slot.s, slot.lat);
    this.car.turbo = 40;
    this.carHint = -1;
    this.carS = slot.s;
    this.prevU = this.track.nearest(this.car.pos.x, this.car.pos.z, -1).u;
    this.car.mesh.visible = true;
  };

  ND.Game.prototype.clearRivals = function () {
    for (var i = 0; i < this.rivals.length; i++) this.rivals[i].dispose();
    this.rivals = [];
  };

  ND.Game.prototype.bestFor = function (index) {
    return this.save.best[index] || {};
  };

  ND.Game.prototype.updateMenuUI = function () {
    this.ui.circName.textContent = ND.CIRCUIT_LABEL(this.trackIndex);
    var best = this.bestFor(this.trackIndex);
    this.ui.menuBest.textContent = best.lap ? U.formatTime(best.lap) : '--:--.---';
    if (best.ghost && best.total) {
      this.ui.menuGhostNote.textContent = 'RECORDE ' + U.formatTime(best.total) + ' • FANTASMA ATIVO';
    } else {
      this.ui.menuGhostNote.textContent = 'SEM FANTASMA — TENTE O CONTRARRELÓGIO';
    }
  };

  ND.Game.prototype.cycleTrack = function (dir) {
    if (this.state !== 'menu') return;
    this.buildTrack((this.trackIndex + dir + ND.CIRCUITS.length) % ND.CIRCUITS.length);
  };

  /* ---------------- corrida ---------------- */

  ND.Game.prototype.startRace = function (mode) {
    this.audio.init();
    this.audio.startMusic();
    this.mode = mode === 'tt' ? 'tt' : 'race';
    document.body.dataset.mode = this.mode;
    this.clearRivals();
    this.ghost.setData(null);
    this.ghost.hide();
    this.effects.clear();

    this.raceTime = 0;
    this.countdownT = 3;
    this.lastCount = -1;
    this.finishDelay = 0;
    this.endShown = false;
    this.crossings = 0;
    this.lapStart = 0;
    this.lapTimes = [];
    this.bestLap = Infinity;
    this.score = 0;
    this.driftBank = 0;
    this.driftTime = 0;
    this.driftMult = 1;
    this.driftIdle = 0;
    this.wrongWay = false;
    this.shake = 0;
    this.lastWallFx = -1;
    this.finishTime = 0;
    this.recordFlags = { lap: false, total: false };
    this.finishedShown = false;
    this.autopilot = this.testMode === 'auto';

    this.placePlayerOnGrid();
    this.carHint = this.track.nearest(this.car.pos.x, this.car.pos.z, -1).i;
    this.recorder.reset();
    this.recorder.capture(this.car);

    if (this.mode === 'race') {
      for (var i = 0; i < ND.RIVALS.length; i++) {
        var slot = GRID[i];
        var rival = new ND.Rival(this.scene, this.track, slot, ND.RIVALS[i]);
        this.rivals.push(rival);
      }
    } else {
      var best = this.bestFor(this.trackIndex);
      if (best.ghost) {
        this.ghost.setData(best.ghost);
        this.ghost.hide();
      }
    }

    this.cameraSnap = true;
    this.lookInit = false;
    this.ui.driftLive.classList.remove('on');
    this.ui.wrongWay.classList.remove('on');
    this.ui.countdown.classList.remove('on');
    this.ui.toast.classList.remove('show');
    this.ui.turboPanel.classList.remove('full');
    document.body.classList.remove('boosting');

    this.setState('countdown');
    if (this.testMode === 'auto' || this.testMode === 'tt' || this.testMode === 'end') {
      this.countdownT = 0.25;
    }
    this.showCountdown('3');
    this.audio.countdown(3);
    this.lastCount = 3;
  };

  ND.Game.prototype.updateCountdown = function (dt) {
    this.countdownT -= dt;

    var n = Math.ceil(this.countdownT);
    if (n !== this.lastCount && n > 0) {
      this.lastCount = n;
      this.showCountdown(String(n));
      this.audio.countdown(n);
    }

    if (this.countdownT <= 0) {
      this.audio.countdown(0);
      this.showCountdown('GO!');
      this.raceTime = 0;
      this.lapStart = 0;
      this.setState('race');
      return;
    }

    this.car.update(dt, { throttle: 0, steer: 0, drift: false, boost: false }, this.track, {});
    this.updateRaceCamera(dt);
    this.audio.updateEngine(0, 0, false, false);
  };

  ND.Game.prototype.collectInput = function () {
    if (this.autopilot) return this.autopilotInput();
    return {
      throttle: this.input.throttle(),
      steer: this.input.steer(),
      drift: this.input.get('drift'),
      boost: this.input.get('boost')
    };
  };

  ND.Game.prototype.autopilotInput = function () {
    var car = this.car;
    var track = this.track;
    var near = track.nearest(car.pos.x, car.pos.z, car.hint);
    car.hint = near.i;

    var look = 14 + car.speed * 0.55;
    var p = track.pointAtS(near.s + look);
    var desired = Math.atan2(p.x - car.pos.x, p.z - car.pos.z);
    var diff = U.wrapAngle(desired - car.yaw);
    var steer = U.clamp(diff * 2.4, -1, 1);

    var k = Math.abs(track.curvatureAtS(near.s + 18 + car.speed * 0.7));
    var R = 1 / Math.max(k, 0.0001);
    var throttle = R < 65 ? 0.4 : 1;
    if (car.speed > 52) throttle = R < 150 ? 0.25 : 0.85;

    return {
      throttle: throttle,
      steer: steer,
      drift: Math.abs(diff) > 0.3 && car.speed > 24,
      boost: Math.abs(diff) < 0.07 && car.turbo > 25 && car.speed > 28
    };
  };

  ND.Game.prototype.updateRace = function (dt) {
    var self = this;
    this.raceTime += dt;

    var input = this.collectInput();
    var tele = this.car.update(dt, input, this.track, {
      onWall: function (strength, x, y, z, nx, nz) {
        if (strength > 2 && self.raceTime - self.lastWallFx > 0.22) {
          self.lastWallFx = self.raceTime;
          self.effects.impact(x, y, z, nx, nz, strength);
          self.audio.wall();
          self.shake = Math.max(self.shake, Math.min(0.5, strength * 0.04));
        }
      }
    });

    this.handleProgress();
    if (this.state !== 'race') return;

    this.handleDrift(dt, tele);
    this.updateRivals(dt);
    this.resolveCollisions(dt);
    this.recorder.update(dt, this.car);

    if (this.mode === 'tt' && this.ghost.data) this.ghost.update(this.raceTime);

    var f = this.car.forward();
    if (tele.boost) {
      var back = this.car.pos.x - f.x * 2.1;
      var backZ = this.car.pos.z - f.z * 2.1;
      this.effects.boostFlame(back, 0.55, backZ, -f.x, -f.z);
    }

    this.updateRaceCamera(dt);

    this.audio.updateEngine(tele.speedKmh, input.throttle, tele.boost, true);
    this.audio.setDrift(tele.drifting ? U.clamp(tele.driftAmount / 16, 0, 1) : 0);
    this.audio.setIntensity(0.35 + U.clamp(tele.speedKmh / 240, 0, 1) * 0.65);
    document.body.classList.toggle('boosting', !!(tele.boost && this.car.turbo > 0));

    this.shake = Math.max(0, this.shake - dt * 1.8);
  };

  ND.Game.prototype.updateRivals = function (dt) {
    var prog = this.playerProgress();
    for (var i = 0; i < this.rivals.length; i++) {
      this.rivals[i].update(dt, this.raceTime, prog);
    }
  };

  ND.Game.prototype.resolveCollisions = function (dt) {
    var car = this.car;
    for (var i = 0; i < this.rivals.length; i++) {
      var r = this.rivals[i];
      var dx = car.pos.x - r.mesh.position.x;
      var dz = car.pos.z - r.mesh.position.z;
      var d2 = dx * dx + dz * dz;
      var minD = 2.35;
      if (d2 > minD * minD || d2 < 0.0001) continue;

      var d = Math.sqrt(d2);
      var nx = dx / d;
      var nz = dz / d;
      var push = (minD - d);
      car.pos.x += nx * push * 0.72;
      car.pos.z += nz * push * 0.72;

      var vn = car.vel.x * nx + car.vel.z * nz;
      if (vn < 0) {
        car.vel.x -= nx * vn * 1.3;
        car.vel.z -= nz * vn * 1.3;
      }
      car.vel.multiplyScalar(0.965);
      r.speed = Math.max(12, r.speed * 0.985);

      if (this.raceTime - (r.lastHit || -9) > 0.5) {
        r.lastHit = this.raceTime;
        this.effects.impact(
          (car.pos.x + r.mesh.position.x) / 2, 0.7,
          (car.pos.z + r.mesh.position.z) / 2,
          nx, nz, 6, [0.6, 0.9, 1]
        );
        this.audio.hit(0.6);
        this.shake = Math.max(this.shake, 0.22);
      }
    }
  };

  ND.Game.prototype.handleProgress = function () {
    var near = this.track.nearest(this.car.pos.x, this.car.pos.z, this.car.hint);
    this.car.hint = near.i;
    this.carS = near.s;

    var f = this.car.forward();
    var along = f.x * near.tx + f.z * near.tz;
    this.wrongWay = along < -0.25 && this.car.speed > 4;

    var u = near.u;
    if (this.prevU > 0.82 && u < 0.18 && this.car.vF > 3 && along > 0.2) {
      this.crossings++;
      var lapTime = this.raceTime - this.lapStart;
      this.lapTimes.push(lapTime);
      if (lapTime < this.bestLap) this.bestLap = lapTime;
      this.lapStart = this.raceTime;
      this.audio.lap();

      if (this.crossings >= TOTAL_LAPS) {
        this.prevU = u;
        this.finishRace();
        return;
      }

      this.showToast('VOLTA ' + (this.crossings + 1) + '/' + TOTAL_LAPS + '  •  ' + U.formatTime(lapTime));
    }

    this.prevU = u;
  };

  ND.Game.prototype.playerProgress = function () {
    return this.carS + this.crossings * this.track.length;
  };

  ND.Game.prototype.handleDrift = function (dt, tele) {
    var car = this.car;
    var drifting = tele.drifting && tele.speedKmh > 32;

    if (drifting) {
      this.driftTime += dt;
      this.driftIdle = 0;
      this.driftMult = 1 + Math.min(3.5, this.driftTime * 0.7);

      var gain = tele.driftAmount * 5.0 * this.driftMult * dt;
      this.score += gain;
      this.driftBank += gain;

      car.turbo = Math.min(100, car.turbo + tele.driftAmount * 1.15 * dt);

      this.ui.driftLive.classList.add('on');
      this.ui.driftMult.textContent = 'x' + this.driftMult.toFixed(1);

      var f = car.forward();
      var rx = Math.cos(car.yaw);
      var rz = -Math.sin(car.yaw);
      var bx = car.pos.x - f.x * 1.32;
      var bz = car.pos.z - f.z * 1.32;
      this.effects.driftSmoke(bx, bz, rx, rz, car.vel.x, car.vel.z, tele.driftAmount / 14);
    } else {
      this.driftIdle += dt;
      if (this.driftIdle > 0.45) {
        this.ui.driftLive.classList.remove('on');
        if (this.driftBank > 10) this.showToast('DRIFT +' + Math.round(this.driftBank));
        this.driftBank = 0;
        this.driftTime = 0;
        this.driftMult = 1;
      }
    }

    this.ui.turboPanel.classList.toggle('full', car.turbo > 92);
  };

  /* ---------------- fim ---------------- */

  ND.Game.prototype.finishRace = function () {
    this.finishTime = this.raceTime;
    var pos = 1;
    for (var i = 0; i < this.rivals.length; i++) {
      if (this.rivals[i].finishTime !== null) pos++;
    }
    this.finishPos = pos;

    this.audio.finish();
    this.audio.setDrift(0);
    this.audio.updateEngine(0, 0, false, false);
    this.audio.duckMusic(true);
    this.ghost.hide();
    this.effects.burst(this.car.pos.x, this.car.pos.z);
    this.shake = 0.45;
    this.ui.driftLive.classList.remove('on');
    this.ui.wrongWay.classList.remove('on');
    document.body.classList.remove('boosting');

    this.saveResults();
    this.finishDelay = 0;
    this.endShown = false;
    this.setState('finished', 'race');
  };

  ND.Game.prototype.saveResults = function () {
    var flags = { lap: false, total: false };
    if (!this.testMode) {
      var best = this.save.best[this.trackIndex] || {};
      if (this.bestLap < (best.lap || Infinity)) {
        best.lap = this.bestLap;
        flags.lap = true;
      }
      if (this.mode === 'tt' && (!best.total || this.finishTime < best.total)) {
        best.total = this.finishTime;
        flags.total = true;
        var rec = this.recorder.serialize();
        if (rec) best.ghost = rec;
      }
      this.save.best[this.trackIndex] = best;
      U.persist(this.save);
      if (flags.lap || flags.total) this.audio.record();
      this.updateMenuUI();
    }
    this.recordFlags = flags;
  };

  ND.Game.prototype.updateFinished = function (dt) {
    this.finishDelay += dt;
    this.car.mesh.visible = true;

    var t = this.menuT;
    var car = this.car;
    var radius = 9.5 + Math.sin(t * 0.5) * 1.5;
    this.camera.position.set(
      car.pos.x + Math.sin(t * 0.45) * radius,
      4.4 + Math.sin(t * 0.7) * 0.6,
      car.pos.z + Math.cos(t * 0.45) * radius
    );
    this.menuLook.set(car.pos.x, 1.1, car.pos.z);
    this.camera.lookAt(this.menuLook);
    this.camera.fov = 56;
    this.camera.updateProjectionMatrix();

    if (!this.endShown && this.finishDelay > 1.15) this.showEnd();
  };

  ND.Game.prototype.showEnd = function () {
    if (this.endShown) return;
    this.endShown = true;
    this.audio.stopMusic();

    var isTT = this.mode === 'tt';
    var best = this.bestFor(this.trackIndex);

    this.ui.endBadge.textContent = isTT ? 'CONTRARRELÓGIO' : 'CORRIDA CONCLUÍDA';
    this.ui.endTitle.textContent = isTT
      ? 'TEMPO FINAL'
      : (this.finishPos === 1 ? '1º LUGAR!' : this.finishPos + 'º LUGAR');
    this.ui.endSub.textContent = ND.CIRCUIT_LABEL(this.trackIndex) +
      (isTT ? ' • FANTASMA' : ' • 3 VOLTAS');

    this.ui.endTotal.textContent = U.formatTime(this.finishTime);
    this.ui.endBest.textContent = U.formatTime(this.bestLap);
    this.ui.endScore.textContent = String(Math.round(this.score));

    var hasRecord = this.recordFlags && (this.recordFlags.total || this.recordFlags.lap);
    this.ui.recordBadge.classList.toggle('hidden', !hasRecord);
    if (hasRecord) {
      this.ui.recordBadge.textContent = this.recordFlags.total ? 'NOVO RECORDE!' : 'NOVA MELHOR VOLTA!';
    }

    this.ui.standings.innerHTML = '';
    if (!isTT) {
      var rows = [{
        name: 'VOCÊ',
        time: this.finishTime,
        prog: this.playerProgress(),
        you: true
      }];
      for (var i = 0; i < this.rivals.length; i++) {
        var r = this.rivals[i];
        rows.push({ name: r.name, time: r.finishTime, prog: r.progress(), you: false });
      }
      rows.sort(function (a, b) {
        var af = a.time !== null && a.time !== undefined;
        var bf = b.time !== null && b.time !== undefined;
        if (af && bf) return a.time - b.time;
        if (af) return -1;
        if (bf) return 1;
        return b.prog - a.prog;
      });

      for (var k = 0; k < rows.length; k++) {
        var row = document.createElement('div');
        row.className = 'standing-row' + (rows[k].you ? ' you' : '');
        var pos = document.createElement('span');
        pos.className = 'pos';
        pos.textContent = (k + 1) + 'º';
        var name = document.createElement('span');
        name.className = 'name';
        name.textContent = rows[k].name;
        var tm = document.createElement('span');
        tm.className = 't';
        tm.textContent = rows[k].time != null ? U.formatTime(rows[k].time) : '—';
        row.appendChild(pos);
        row.appendChild(name);
        row.appendChild(tm);
        this.ui.standings.appendChild(row);
      }
    } else if (best.total) {
      var note = document.createElement('div');
      note.className = 'standing-row you';
      note.innerHTML = '<span class="name">MELHOR TEMPO NESTE CIRCUITO</span>' +
        '<span class="t">' + U.formatTime(best.total) + '</span>';
      this.ui.standings.appendChild(note);
    }

    document.body.dataset.screen = 'finished';
    this.car.mesh.visible = true;
  };

  /* ---------------- menus e teclas ---------------- */

  ND.Game.prototype.goMenu = function () {
    this.clearRivals();
    this.ghost.setData(null);
    this.ghost.hide();
    this.effects.clear();
    this.placeShowroom();
    this.score = 0;
    this.raceTime = 0;
    this.finishTime = 0;
    this.bestLap = Infinity;
    this.crossings = 0;
    this.wrongWay = false;
    this.ui.driftLive.classList.remove('on');
    this.ui.wrongWay.classList.remove('on');
    this.ui.countdown.classList.remove('on');
    this.ui.toast.classList.remove('show');
    this.ui.turboPanel.classList.remove('full');
    document.body.classList.remove('boosting');
    this.audio.setDrift(0);
    this.audio.updateEngine(0, 0, false, false);
    this.cameraSnap = true;
    this.menuT = 0;
    this.setState('menu');
    this.updateMenuUI();
  };

  ND.Game.prototype.togglePause = function (force) {
    if (this.state === 'race' || this.state === 'countdown') {
      if (force === false) return;
      this.pausedFrom = this.state;
      this.setState('paused');
      this.ui.driftLive.classList.remove('on');
    } else if (this.state === 'paused') {
      if (force === true) return;
      this.resume();
    }
  };

  ND.Game.prototype.resume = function () {
    if (this.state !== 'paused') return;
    this.setState(this.pausedFrom || 'race');
    this.audio.duckMusic(false);
  };

  ND.Game.prototype.onPauseKey = function () {
    if (this.state === 'finished') {
      if (this.endShown) this.goMenu();
      else this.showEnd();
      return;
    }
    if (this.state === 'paused') { this.resume(); return; }
    if (this.state === 'race' || this.state === 'countdown') this.togglePause(true);
  };

  ND.Game.prototype.onConfirm = function () {
    if (this.state === 'menu') { this.startRace('race'); return; }
    if (this.state === 'paused') { this.resume(); return; }
    if (this.state === 'finished') { this.startRace(this.mode); return; }
  };

  ND.Game.prototype.onRestart = function () {
    if (this.state === 'race' || this.state === 'countdown' ||
      this.state === 'paused' || this.state === 'finished') {
      this.startRace(this.mode);
    }
  };

  ND.Game.prototype.cycleCamera = function () {
    if (this.state !== 'race' && this.state !== 'countdown') return;
    this.camMode = (this.camMode + 1) % 3;
    var names = ['CÂMERA: PERTO', 'CÂMERA: LONGE', 'CÂMERA: CAPÔ'];
    this.showToast(names[this.camMode]);
    this.cameraSnap = true;
    this.lookInit = false;
  };

  ND.Game.prototype.toggleMute = function () {
    this.audio.init();
    var m = this.audio.toggleMute();
    this.save.muted = m;
    if (!this.testMode) U.persist(this.save);
    this.syncMuteUI();
    if (!m) this.audio.ui();
  };

  ND.Game.prototype.syncMuteUI = function () {
    var label = this.audio.muted ? 'SOM: DESLIGADO' : 'SOM: LIGADO';
    if (this.ui.btnSound) {
      this.ui.btnSound.textContent = label;
      this.ui.btnSound.classList.toggle('on', this.audio.muted);
    }
    if (this.ui.btnSoundPause) {
      this.ui.btnSoundPause.textContent = label;
      this.ui.btnSoundPause.classList.toggle('on', this.audio.muted);
    }
  };

  /* ---------------- câmera ---------------- */

  ND.Game.prototype.updateMenu = function (dt) {
    this.menuT += dt;
    // No menu o carro fica atrás dos painéis da interface; escondê-lo
    // evita que o brilho dos faróis vaze pelos painéis translúcidos.
    this.car.mesh.visible = false;

    var car = this.car;
    var t = this.menuT;
    var radius = 17.5 + Math.sin(t * 0.22) * 2.2;
    this.camera.position.set(
      car.pos.x + Math.sin(t * 0.16) * radius,
      8.4 + Math.sin(t * 0.35) * 0.8,
      car.pos.z + Math.cos(t * 0.16) * radius
    );
    this.menuLook.set(car.pos.x, 1.6, car.pos.z);
    this.camera.lookAt(this.menuLook);
    this.camera.fov = 58;
    this.camera.updateProjectionMatrix();
  };

  ND.Game.prototype.updateRaceCamera = function (dt) {
    var car = this.car;
    var speedK = U.clamp(car.speed / 66, 0, 1);
    var f = car.forward();
    var rx = Math.cos(car.yaw);
    var rz = -Math.sin(car.yaw);

    if (this.camMode === 2) {
      car.mesh.visible = false;
      this.camera.position.set(car.pos.x + f.x * 0.5, 1.55, car.pos.z + f.z * 0.5);
      this.lookTarget.set(car.pos.x + f.x * 45, 1.1, car.pos.z + f.z * 45);
      this.camera.lookAt(this.lookTarget);
      this.camera.fov = 74 + speedK * 8 + (car.boosting ? 3 : 0);
      this.camera.updateProjectionMatrix();
    } else {
      car.mesh.visible = true;
      var far = this.camMode === 1;
      var dist = far ? 16.2 : 10.8;
      var height = far ? 7.0 : 4.9;
      var targetX = car.pos.x - f.x * (dist + speedK * 1.6) - rx * car.vR * 0.05;
      var targetZ = car.pos.z - f.z * (dist + speedK * 1.6) - rz * car.vR * 0.05;
      var targetY = height + speedK * 0.4;

      if (this.cameraSnap) {
        this.camera.position.set(targetX, targetY, targetZ);
        this.cameraSnap = false;
      } else {
        var k = 1 - Math.exp(-12 * dt);
        this.camera.position.x += (targetX - this.camera.position.x) * k;
        this.camera.position.y += (targetY - this.camera.position.y) * k;
        this.camera.position.z += (targetZ - this.camera.position.z) * k;
      }

      var lookAhead = 5 + speedK * 8;
      var lx = car.pos.x + f.x * lookAhead;
      var lz = car.pos.z + f.z * lookAhead;
      var ly = 1.55;

      if (!this.lookInit) {
        this.lookTarget.set(lx, ly, lz);
        this.lookInit = true;
      } else {
        var lk = 1 - Math.exp(-10 * dt);
        this.lookTarget.x += (lx - this.lookTarget.x) * lk;
        this.lookTarget.y += (ly - this.lookTarget.y) * lk;
        this.lookTarget.z += (lz - this.lookTarget.z) * lk;
      }
      this.camera.lookAt(this.lookTarget);

      var fovTarget = 60 + speedK * 16 + (car.boosting ? 5 : 0);
      this.camera.fov += (fovTarget - this.camera.fov) * (1 - Math.exp(-4 * dt));
      this.camera.updateProjectionMatrix();
    }

    if (this.shake > 0.001) {
      this.camera.position.x += U.rand(-1, 1) * this.shake;
      this.camera.position.y += U.rand(-1, 1) * this.shake * 0.6;
      this.camera.position.z += U.rand(-1, 1) * this.shake;
    }
  };

  /* ---------------- HUD ---------------- */

  ND.Game.prototype.updateHUD = function () {
    if (!this.ui || this.state === 'menu' || this.state === 'boot') return;

    var shownLap = this.crossings >= TOTAL_LAPS
      ? TOTAL_LAPS
      : Math.min(this.crossings + 1, TOTAL_LAPS);
    this.ui.lap.textContent = shownLap + '/' + TOTAL_LAPS;

    var myProg = this.playerProgress();
    var ahead = 0;
    for (var i = 0; i < this.rivals.length; i++) {
      if (this.rivals[i].progress() > myProg) ahead++;
    }
    this.ui.pos.textContent = (ahead + 1) + 'º';

    this.ui.time.textContent = U.formatTime(this.raceTime);

    var savedLap = this.bestFor(this.trackIndex).lap;
    var bestShown = isFinite(this.bestLap) ? this.bestLap : savedLap;
    this.ui.bestLap.textContent = bestShown ? U.formatTime(bestShown) : '--:--.---';

    var kmh = Math.round(this.car.speed * 3.6);
    this.ui.speed.textContent = kmh;

    var gear = 'N';
    if (this.car.vF < -0.5) gear = 'R';
    else if (this.car.vF > 0.5) gear = String(Math.min(6, 1 + Math.floor(kmh / 42)));
    this.ui.gear.textContent = gear;

    this.ui.turboFill.style.width = U.clamp(this.car.turbo, 0, 100).toFixed(1) + '%';
    this.ui.score.textContent = String(Math.round(this.score));

    this.ui.wrongWay.classList.toggle('on', this.wrongWay && this.state === 'race');

    this.drawMinimap();
  };

  ND.Game.prototype.drawMinimap = function () {
    var ctx = this.miniCtx;
    if (!ctx || !this.track) return;
    var W = this.ui.minimap.width;
    var H = this.ui.minimap.height;
    ctx.clearRect(0, 0, W, H);

    var b = this.track.bounds;
    var pad = 22;
    var scale = Math.min(
      (W - pad * 2) / Math.max(b.maxX - b.minX, 1),
      (H - pad * 2) / Math.max(b.maxZ - b.minZ, 1)
    );
    var cx = (b.minX + b.maxX) / 2;
    var cz = (b.minZ + b.maxZ) / 2;

    function px(x) { return W / 2 + (x - cx) * scale; }
    function pz(z) { return H / 2 + (z - cz) * scale; }

    var mini = this.track.mini;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (var i = 0; i < mini.length; i++) {
      if (i === 0) ctx.moveTo(px(mini[i][0]), pz(mini[i][1]));
      else ctx.lineTo(px(mini[i][0]), pz(mini[i][1]));
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(34,230,255,.85)';
    ctx.lineWidth = 5;
    ctx.shadowColor = 'rgba(34,230,255,.85)';
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(6,3,16,.9)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // linha de largada
    var sp = this.track.startPoint;
    ctx.beginPath();
    ctx.arc(px(sp.x), pz(sp.z), 3.2, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // rivais
    for (var r = 0; r < this.rivals.length; r++) {
      var rv = this.rivals[r];
      ctx.beginPath();
      ctx.arc(px(rv.mesh.position.x), pz(rv.mesh.position.z), 4, 0, Math.PI * 2);
      ctx.fillStyle = hexCss(rv.data.paint);
      ctx.fill();
    }

    // fantasma
    if (this.ghost.data && this.ghost.mesh.visible) {
      ctx.beginPath();
      ctx.arc(px(this.ghost.mesh.position.x), pz(this.ghost.mesh.position.z), 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(157,246,255,.55)';
      ctx.fill();
    }

    // jogador
    var carX = px(this.car.pos.x);
    var carZ = pz(this.car.pos.z);
    ctx.beginPath();
    ctx.arc(carX, carZ, 5.6, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ff2bd6';
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.shadowBlur = 0;

    var f = this.car.forward();
    ctx.beginPath();
    ctx.moveTo(carX, carZ);
    ctx.lineTo(carX + f.x * 11, carZ + f.z * 11);
    ctx.strokeStyle = '#ff2bd6';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
  };

  function hexCss(hex) {
    var s = (hex >>> 0).toString(16);
    while (s.length < 6) s = '0' + s;
    return '#' + s;
  }

  /* ---------------- helpers de UI ---------------- */

  ND.Game.prototype.simTest = function () {
    var sim = parseFloat(this.params.get('sim') || '0');
    if (!isFinite(sim) || sim <= 0) return;
    sim = Math.min(sim, 60);
    var steps = Math.round(sim * 60);
    for (var i = 0; i < steps; i++) this.update(1 / 60);
    this.ui.countdown.classList.remove('on');
    this.ui.toast.classList.remove('show');
    this.ui.driftLive.classList.remove('on');
  };

  ND.Game.prototype.showCountdown = function (text) {
    var el = this.ui.countdown;
    el.textContent = text;
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
  };

  ND.Game.prototype.showToast = function (text) {
    var el = this.ui.toast;
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    var self = this;
    this.toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2300);
  };

  /* ---------------- loop ---------------- */

  ND.Game.prototype.update = function (dtRaw) {
    var dt = Math.min(dtRaw, 0.05);
    this.menuT += dt;

    switch (this.state) {
      case 'menu':
        this.updateMenu(dt);
        break;
      case 'countdown':
        this.updateCountdown(dt);
        break;
      case 'race':
        this.updateRace(dt);
        break;
      case 'paused':
        break;
      case 'finished':
        this.updateFinished(dt);
        break;
      default:
        break;
    }

    this.effects.update(dt);
    this.updateHUD();

    if (this.state !== 'race' && this.state !== 'countdown') {
      this.audio.setDrift(0);
    }
  };

})(window.ND);
