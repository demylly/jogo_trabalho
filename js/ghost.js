/* ============================================================
   ghost.js — gravação e replay do fantasma (contrarrelógio)
   ============================================================ */
(function (ND) {
  'use strict';

  var U = ND.utils;

  ND.Recorder = function () {
    this.reset();
  };

  ND.Recorder.prototype.reset = function () {
    this.frames = [];
    this.acc = 0;
    this.dt = 0.04;
  };

  ND.Recorder.prototype.capture = function (car) {
    this.frames.push([
      U.round(car.pos.x, 2),
      U.round(car.pos.z, 2),
      U.round(car.yaw, 3)
    ]);
  };

  ND.Recorder.prototype.update = function (dt, car) {
    this.acc += dt;
    var guard = 0;
    while (this.acc >= this.dt && guard < 8) {
      this.acc -= this.dt;
      this.capture(car);
      guard++;
    }
  };

  ND.Recorder.prototype.serialize = function () {
    if (this.frames.length < 2) return null;
    return { dt: this.dt, f: this.frames };
  };

  /* ============================================================ */

  ND.Ghost = function (scene) {
    this.scene = scene;
    this.mesh = ND.buildCar(0x8af4ff, 0xffffff, { ghost: true });
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.data = null;
    this.spin = 0;
    this.lastX = 0;
    this.lastZ = 0;
  };

  ND.Ghost.prototype.setData = function (rec) {
    if (rec && rec.f && rec.f.length > 1 && rec.dt > 0) {
      this.data = rec;
      this.mesh.visible = true;
      this.spin = 0;
      this.lastX = rec.f[0][0];
      this.lastZ = rec.f[0][1];
      return true;
    }
    this.data = null;
    this.mesh.visible = false;
    return false;
  };

  ND.Ghost.prototype.hide = function () {
    this.mesh.visible = false;
  };

  ND.Ghost.prototype.update = function (t) {
    if (!this.data) return;
    var f = this.data.f;
    var idx = t / this.data.dt;
    if (idx >= f.length - 1) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;

    var i = Math.floor(idx);
    var a = f[i];
    var b = f[i + 1] || a;
    var k = idx - i;

    var x = U.lerp(a[0], b[0], k);
    var z = U.lerp(a[1], b[1], k);
    var yaw = U.angleLerp(a[2], b[2], k);

    var dx = x - this.lastX;
    var dz = z - this.lastZ;
    this.lastX = x;
    this.lastZ = z;

    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = yaw;

    this.spin += Math.hypot(dx, dz) / 0.37;
    var ud = this.mesh.userData;
    for (var w = 0; w < ud.wheels.length; w++) {
      ud.wheels[w].wheel.rotation.x = this.spin % (Math.PI * 2);
    }
  };

  ND.Ghost.prototype.dispose = function () {
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
