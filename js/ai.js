/* ============================================================
   ai.js — rivais controlados pela pista
   ============================================================ */
(function (ND) {
  'use strict';

  var U = ND.utils;

  ND.RIVALS = [
    { name: 'VEGA', paint: 0xff7a18, accent: 0xffd36e, skill: 1.00 },
    { name: 'KIRA', paint: 0xb14bff, accent: 0xe0a6ff, skill: 0.97 },
    { name: 'NOVA', paint: 0x9dff2b, accent: 0xd8ff9a, skill: 0.94 }
  ];

  ND.Rival = function (scene, track, slot, data) {
    this.scene = scene;
    this.track = track;
    this.data = data;
    this.name = data.name;
    this.mesh = ND.buildCar(data.paint, data.accent);
    scene.add(this.mesh);

    this.s = slot.s;
    this.lateral = slot.lateral || 0;
    this.prevLateral = this.lateral;
    this.lateralSpeed = 0;
    this.speed = 0;
    this.crossings = 0;
    this.finishTime = null;
    this.phase = (slot.s * 1.7 + data.skill * 9) % (Math.PI * 2);
    this.maxSpeed = 54 + data.skill * 6;
    this.accel = 10.5;
    this.spin = 0;
    this.roll = 0;
    this.wheelAngle = 0;

    this.sync(0);
  };

  ND.Rival.prototype.progress = function () {
    return this.s + this.crossings * this.track.length;
  };

  ND.Rival.prototype.update = function (dt, raceTime, playerProgress) {
    var track = this.track;

    if (this.finishTime !== null) {
      // cruzeiro depois de terminar
      this.speed = Math.max(0, this.speed - 7 * dt);
    } else {
      var look = this.s + 14 + this.speed * 0.55;
      var k = Math.abs(track.curvatureAtS(look));
      var radius = 1 / Math.max(k, 0.0005);
      var target = Math.min(this.maxSpeed, Math.sqrt(13.5 * radius));
      target = Math.max(16, target);

      // leve borracha: segura quem está muito na frente, anima quem está atrás
      var gap = playerProgress - this.progress();
      if (gap > 40) target *= 1.06;
      else if (gap < -40) target *= 0.95;

      if (this.speed < target) {
        this.speed = Math.min(target, this.speed + this.accel * dt);
      } else {
        this.speed = Math.max(target, this.speed - 22 * dt);
      }
    }

    this.s += this.speed * dt;
    if (this.s >= track.length) {
      this.s -= track.length;
      this.crossings++;
      if (this.crossings >= 3 && this.finishTime === null) {
        this.finishTime = raceTime;
      }
    }

    // linha de corrida: entra no lado de dentro da curva
    var kAhead = track.curvatureAtS(this.s + 16);
    var targetLat = U.clamp(kAhead * 240, -1, 1) * track.halfWidth * 0.32;
    targetLat += Math.sin(raceTime * 0.42 + this.phase) * 1.1;
    targetLat = U.clamp(targetLat, -track.halfWidth + 2.4, track.halfWidth - 2.4);

    this.prevLateral = this.lateral;
    this.lateral = U.damp(this.lateral, targetLat, 1.7, dt);
    this.lateralSpeed = (this.lateral - this.prevLateral) / Math.max(dt, 0.0001);

    this.sync(dt, kAhead);
  };

  ND.Rival.prototype.sync = function (dt, kAhead) {
    var p = this.track.pointAtS(this.s);
    var x = p.x + p.nx * this.lateral;
    var z = p.z + p.nz * this.lateral;

    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = p.yaw;

    var ud = this.mesh.userData;
    var targetRoll = U.clamp(-this.lateralSpeed * 0.028, -0.09, 0.09);
    if (dt > 0) this.roll = U.damp(this.roll, targetRoll, 6, dt);
    ud.body.rotation.z = this.roll;

    this.spin += (this.speed * dt) / 0.37;
    var ws = this.spin % (Math.PI * 2);
    for (var i = 0; i < ud.wheels.length; i++) {
      ud.wheels[i].wheel.rotation.x = ws;
      if (ud.wheels[i].steer) {
        ud.wheels[i].pivot.rotation.y = U.clamp((kAhead || 0) * 900, -0.4, 0.4);
      }
    }

    ud.underglow.material.opacity = 0.38 + Math.sin(this.s * 0.2) * 0.05;
  };

  ND.Rival.prototype.dispose = function () {
    this.scene.remove(this.mesh);
    this.mesh.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        var mats = Array.isArray(o.material) ? o.material : [o.material];
        for (var i = 0; i < mats.length; i++) {
          if (mats[i] && mats[i].dispose) mats[i].dispose();
        }
      }
    });
  };

})(window.ND);
