/* ============================================================
   effects.js — partículas (fumaça de drift, faíscas, turbo)
   ============================================================ */
(function (ND) {
  'use strict';

  function Pool(scene, count, size, texture, drag, gravity) {
    this.count = count;
    this.drag = drag;
    this.gravity = gravity;

    this.pos = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    this.base = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.max = new Float32Array(count);
    this.cursor = 0;

    for (var i = 0; i < count; i++) {
      this.pos[i * 3 + 1] = -999;
    }

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));

    this.mat = new THREE.PointsMaterial({
      size: size,
      map: texture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      sizeAttenuation: true,
      opacity: 0.95
    });

    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  Pool.prototype.spawn = function (x, y, z, vx, vy, vz, r, g, b, life) {
    var i = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;
    var i3 = i * 3;
    this.pos[i3] = x;
    this.pos[i3 + 1] = y;
    this.pos[i3 + 2] = z;
    this.vel[i3] = vx;
    this.vel[i3 + 1] = vy;
    this.vel[i3 + 2] = vz;
    this.base[i3] = r;
    this.base[i3 + 1] = g;
    this.base[i3 + 2] = b;
    this.col[i3] = r;
    this.col[i3 + 1] = g;
    this.col[i3 + 2] = b;
    this.life[i] = life;
    this.max[i] = life;
  };

  Pool.prototype.update = function (dt) {
    var posA = this.geo.attributes.position.array;
    var colA = this.geo.attributes.color.array;
    var damp = Math.exp(-this.drag * dt);
    var changed = false;

    for (var i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      changed = true;
      var i3 = i * 3;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        posA[i3 + 1] = -999;
        colA[i3] = 0; colA[i3 + 1] = 0; colA[i3 + 2] = 0;
        continue;
      }
      this.vel[i3] *= damp;
      this.vel[i3 + 1] = this.vel[i3 + 1] * damp + this.gravity * dt;
      this.vel[i3 + 2] *= damp;
      posA[i3] += this.vel[i3] * dt;
      posA[i3 + 1] += this.vel[i3 + 1] * dt;
      posA[i3 + 2] += this.vel[i3 + 2] * dt;

      var k = this.life[i] / this.max[i];
      k = k * k;
      colA[i3] = this.base[i3] * k;
      colA[i3 + 1] = this.base[i3 + 1] * k;
      colA[i3 + 2] = this.base[i3 + 2] * k;
    }

    if (changed) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.color.needsUpdate = true;
    }
  };

  Pool.prototype.clear = function () {
    for (var i = 0; i < this.count; i++) {
      this.life[i] = 0;
      this.pos[i * 3 + 1] = -999;
      this.col[i * 3] = 0;
      this.col[i * 3 + 1] = 0;
      this.col[i * 3 + 2] = 0;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  };

  ND.Effects = function (scene) {
    var glow = ND.tex.glow();
    this.smoke = new Pool(scene, 170, 2.4, glow, 1.15, 0.8);
    this.sparks = new Pool(scene, 150, 0.6, glow, 0.35, -20);
    this.lastSmoke = 0;
  };

  ND.Effects.prototype.driftSmoke = function (x, z, rightX, rightZ, vx, vz, strength) {
    var s = Math.min(1.4, strength);
    for (var i = 0; i < 2; i++) {
      var side = i === 0 ? -1 : 1;
      var px = x + rightX * side * 0.82 + ND.utils.rand(-0.18, 0.18);
      var pz = z + rightZ * side * 0.82 + ND.utils.rand(-0.18, 0.18);
      var magenta = Math.random() < 0.45;
      this.smoke.spawn(
        px, 0.25 + Math.random() * 0.3, pz,
        vx * 0.14 + ND.utils.rand(-1.4, 1.4),
        ND.utils.rand(0.4, 1.5),
        vz * 0.14 + ND.utils.rand(-1.4, 1.4),
        magenta ? 0.5 : 0.38, magenta ? 0.18 : 0.34, magenta ? 0.52 : 0.46,
        ND.utils.rand(0.45, 0.9) * s
      );
    }
  };

  ND.Effects.prototype.impact = function (x, y, z, nx, nz, strength, color) {
    var n = Math.min(26, 8 + Math.floor(strength * 3));
    var c = color || [1, 0.55, 0.16];
    for (var i = 0; i < n; i++) {
      this.sparks.spawn(
        x + ND.utils.rand(-0.4, 0.4), y + ND.utils.rand(0.1, 0.9), z + ND.utils.rand(-0.4, 0.4),
        nx * ND.utils.rand(2, 9) + ND.utils.rand(-5, 5),
        ND.utils.rand(2, 7),
        nz * ND.utils.rand(2, 9) + ND.utils.rand(-5, 5),
        c[0], c[1], c[2],
        ND.utils.rand(0.25, 0.6)
      );
    }
  };

  ND.Effects.prototype.boostFlame = function (x, y, z, dirX, dirZ) {
    for (var i = 0; i < 2; i++) {
      this.sparks.spawn(
        x + ND.utils.rand(-0.12, 0.12), y + ND.utils.rand(-0.1, 0.1), z + ND.utils.rand(-0.12, 0.12),
        dirX * ND.utils.rand(6, 14) + ND.utils.rand(-1, 1),
        ND.utils.rand(-0.5, 0.6),
        dirZ * ND.utils.rand(6, 14) + ND.utils.rand(-1, 1),
        0.2, 0.85, 1.0,
        ND.utils.rand(0.18, 0.4)
      );
    }
  };

  ND.Effects.prototype.burst = function (x, z, colors) {
    var palette = colors || [[0.2, 0.9, 1], [1, 0.2, 0.85], [1, 0.75, 0.15], [1, 1, 1]];
    for (var i = 0; i < 60; i++) {
      var c = palette[i % palette.length];
      var a = Math.random() * Math.PI * 2;
      var sp = ND.utils.rand(3, 14);
      this.sparks.spawn(
        x, ND.utils.rand(0.5, 1.6), z,
        Math.cos(a) * sp, ND.utils.rand(3, 11), Math.sin(a) * sp,
        c[0], c[1], c[2],
        ND.utils.rand(0.6, 1.4)
      );
    }
  };

  ND.Effects.prototype.update = function (dt) {
    this.smoke.update(dt);
    this.sparks.update(dt);
  };

  ND.Effects.prototype.clear = function () {
    this.smoke.clear();
    this.sparks.clear();
  };

})(window.ND);
