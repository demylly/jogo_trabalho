/* ============================================================
   car.js — modelo do carro e física arcade de drift
   ============================================================ */
(function (ND) {
  'use strict';

  var U = ND.utils;

  function box(parent, w, h, d, x, y, z, mat) {
    var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  function plane(parent, w, d, y, mat) {
    var geo = new THREE.PlaneGeometry(w, d);
    geo.rotateX(-Math.PI / 2);
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = y;
    parent.add(mesh);
    return mesh;
  }

  ND.buildCar = function (paintHex, accentHex, opts) {
    opts = opts || {};
    var ghost = !!opts.ghost;
    var root = new THREE.Group();
    var body = new THREE.Group();
    root.add(body);

    var paintMat, darkMat, accentMat, glassMat, lightMat, tailMat;

    if (ghost) {
      var gm = new THREE.MeshBasicMaterial({
        color: 0x8af4ff,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      paintMat = gm; darkMat = gm; accentMat = gm;
      glassMat = gm; lightMat = gm; tailMat = gm;
    } else {
      paintMat = new THREE.MeshStandardMaterial({
        color: paintHex,
        metalness: 0.55,
        roughness: 0.3,
        emissive: new THREE.Color(paintHex).multiplyScalar(0.12)
      });
      darkMat = new THREE.MeshStandardMaterial({ color: 0x08080f, metalness: 0.45, roughness: 0.7 });
      accentMat = new THREE.MeshBasicMaterial({ color: accentHex });
      glassMat = new THREE.MeshStandardMaterial({
        color: 0x0a1220, metalness: 0.95, roughness: 0.12,
        transparent: true, opacity: 0.9
      });
      lightMat = new THREE.MeshBasicMaterial({ color: 0xd4f9ff });
      tailMat = new THREE.MeshBasicMaterial({ color: 0xff2255 });
    }

    // chassi
    box(body, 1.82, 0.42, 4.0, 0, 0.58, 0, paintMat);
    box(body, 1.94, 0.15, 4.18, 0, 0.31, 0, darkMat);
    box(body, 1.7, 0.25, 1.15, 0, 0.67, 1.55, paintMat);
    box(body, 1.76, 0.26, 0.9, 0, 0.7, -1.6, paintMat);

    // laterais
    box(body, 0.14, 0.26, 2.5, -0.86, 0.48, 0.1, darkMat);
    box(body, 0.14, 0.26, 2.5, 0.86, 0.48, 0.1, darkMat);
    box(body, 0.05, 0.05, 2.3, -0.94, 0.64, 0.1, accentMat);
    box(body, 0.05, 0.05, 2.3, 0.94, 0.64, 0.1, accentMat);

    // cabine de vidro
    box(body, 1.3, 0.4, 1.6, 0, 1.0, -0.18, glassMat);
    box(body, 1.08, 0.06, 1.05, 0, 1.22, -0.24, paintMat);

    // aerofólio
    box(body, 1.84, 0.07, 0.42, 0, 1.12, -1.98, paintMat);
    box(body, 0.08, 0.28, 0.08, -0.66, 0.98, -1.96, darkMat);
    box(body, 0.08, 0.28, 0.08, 0.66, 0.98, -1.96, darkMat);

    // difusor / para-choque
    box(body, 1.74, 0.2, 0.4, 0, 0.34, -2.0, darkMat);

    // faróis e lanternas
    if (!ghost) {
      box(body, 0.38, 0.1, 0.06, -0.56, 0.68, 2.02, lightMat);
      box(body, 0.38, 0.1, 0.06, 0.56, 0.68, 2.02, lightMat);
      box(body, 0.5, 0.11, 0.06, -0.55, 0.7, -2.08, tailMat);
      box(body, 0.5, 0.11, 0.06, 0.55, 0.7, -2.08, tailMat);
    }

    // rodas
    var tireGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.31, 16);
    tireGeo.rotateZ(Math.PI / 2);
    var rimGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.33, 8);
    rimGeo.rotateZ(Math.PI / 2);

    var wheels = [];
    var positions = [
      [-1.01, 0.37, 1.32, true],
      [1.01, 0.37, 1.32, true],
      [-1.01, 0.37, -1.32, false],
      [1.01, 0.37, -1.32, false]
    ];

    for (var i = 0; i < positions.length; i++) {
      var p = positions[i];
      var pivot = new THREE.Group();
      pivot.position.set(p[0], p[1], p[2]);
      body.add(pivot);
      var wheel = new THREE.Group();
      pivot.add(wheel);
      var tire = new THREE.Mesh(tireGeo, darkMat);
      wheel.add(tire);
      var rim = new THREE.Mesh(rimGeo, accentMat);
      wheel.add(rim);
      wheels.push({ pivot: pivot, wheel: wheel, steer: p[3] });
    }

    // sombra e brilho sob o carro
    var shadow = plane(root, 3.1, 5.2, 0.028, new THREE.MeshBasicMaterial({
      map: ND.tex.shadow(), transparent: true, opacity: 0.75, depthWrite: false
    }));
    shadow.renderOrder = 1;

    var underMat = new THREE.MeshBasicMaterial({
      map: ND.tex.glow(),
      color: ghost ? 0x8af4ff : accentHex,
      transparent: true,
      opacity: ghost ? 0.25 : 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    var under = plane(root, 3.4, 5.8, 0.05, underMat);
    under.renderOrder = 2;

    var flames = [];
    if (!ghost) {
      for (var f = -1; f <= 1; f += 2) {
        var fm = new THREE.SpriteMaterial({
          map: ND.tex.glow(),
          color: 0x66f0ff,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          opacity: 0.95
        });
        var fs = new THREE.Sprite(fm);
        fs.position.set(f * 0.42, 0.4, -2.15);
        fs.scale.set(0.9, 0.9, 1);
        fs.visible = false;
        body.add(fs);
        flames.push(fs);
      }
    }

    // brilho dos faróis
    var headSprites = [];
    if (!ghost) {
      for (var h = -1; h <= 1; h += 2) {
        var hm = new THREE.SpriteMaterial({
          map: ND.tex.glow(),
          color: 0x9df6ff,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          opacity: 0.75
        });
        var hs = new THREE.Sprite(hm);
        hs.position.set(h * 0.56, 0.68, 2.12);
        hs.scale.set(1.9, 1.9, 1);
        body.add(hs);
        headSprites.push(hs);
      }
    }

    root.userData = {
      body: body,
      wheels: wheels,
      tailMat: tailMat,
      accentMat: accentMat,
      underglow: under,
      flames: flames,
      headSprites: headSprites,
      isGhost: ghost
    };

    return root;
  };

  /* ============================================================
     JOGADOR
     ============================================================ */
  ND.PlayerCar = function (scene) {
    this.mesh = ND.buildCar(0x18e0ff, 0xff2bd6);
    scene.add(this.mesh);

    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector3(0, 0, 0);

    this.yaw = 0;
    this.steer = 0;
    this.vF = 0;
    this.vR = 0;
    this.speed = 0;
    this.turbo = 40;
    this.boosting = false;
    this.hint = -1;
    this.wheelSpin = 0;
    this.roll = 0;
    this.pitch = 0;
    this.prevVF = 0;
    this.time = 0;

    this.telemetry = {
      drifting: false, driftAmount: 0, speedKmh: 0,
      boost: false, wallHit: 0, braking: false, throttle: 0
    };

    this.mesh.position.copy(this.pos);
  };

  ND.PlayerCar.prototype.forward = function () {
    return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
  };

  ND.PlayerCar.prototype.placeAt = function (track, s, lateralOffset) {
    var p = track.pointAtS(s);
    this.pos.set(p.x + p.nx * (lateralOffset || 0), 0, p.z + p.nz * (lateralOffset || 0));
    this.yaw = p.yaw;
    this.vel.set(0, 0, 0);
    this.vF = 0;
    this.vR = 0;
    this.speed = 0;
    this.steer = 0;
    this.hint = -1;
    this.wheelSpin = 0;
    this.roll = 0;
    this.pitch = 0;
    this.prevVF = 0;
    this.time = 0;
    this.boosting = false;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    this.syncVisual(0, this.telemetry);
  };

  ND.PlayerCar.prototype.update = function (dt, input, track, hooks) {
    var tele = {
      drifting: false, driftAmount: 0, speedKmh: 0,
      boost: false, wallHit: 0, braking: false, throttle: 0
    };
    if (dt <= 0) return tele;

    var steps = Math.max(1, Math.min(10, Math.ceil(dt / 0.009)));
    var h = dt / steps;
    for (var s = 0; s < steps; s++) this.step(h, input, track, hooks, tele);

    this.time += dt;
    this.syncVisual(dt, tele);
    this.boosting = tele.boost;
    tele.speedKmh = this.speed * 3.6;
    this.telemetry = tele;
    return tele;
  };

  ND.PlayerCar.prototype.step = function (dt, input, track, hooks, tele) {
    var throttle = U.clamp(input.throttle || 0, -1, 1);
    var steerIn = U.clamp(input.steer || 0, -1, 1);
    var wantDrift = !!input.drift;
    var wantBoost = !!input.boost;

    this.steer = U.damp(this.steer, steerIn, 11, dt);

    var speed = Math.hypot(this.vel.x, this.vel.z);
    var f = this.forward();
    var vF = this.vel.x * f.x + this.vel.z * f.z;

    var speedFactor = U.clamp(speed / 10, 0, 1) * (1 - 0.45 * U.clamp(speed / 80, 0, 1));
    var turnRate = 1.55 * speedFactor * (wantDrift && speed > 8 ? 1.3 : 1);
    this.yaw += this.steer * turnRate * dt * (vF >= 0 ? 1 : -1);

    f = this.forward();
    var rx = Math.cos(this.yaw);
    var rz = -Math.sin(this.yaw);

    vF = this.vel.x * f.x + this.vel.z * f.z;
    var vR = this.vel.x * rx + this.vel.z * rz;

    var boostActive = wantBoost && this.turbo > 0.5 && speed > 4 && throttle >= 0;
    if (boostActive) this.turbo = Math.max(0, this.turbo - 26 * dt);

    var target = boostActive ? 76 : 66;
    var accel = 0;
    if (throttle > 0) {
      if (vF < -0.5) accel += 26;
      else accel += 18.5 * (1 - U.clamp(vF / target, 0, 1));
    } else if (throttle < 0) {
      if (vF > 0.5) accel -= 32;
      else accel -= 10 * (1 - U.clamp(-vF / 15, 0, 1));
    } else {
      accel -= 2.0 * U.sign(vF);
    }
    accel -= 0.018 * vF;
    if (wantDrift) accel -= 3.0 * U.sign(vF);
    if (boostActive) accel += 2.0;

    vF += accel * dt;
    if (vF < -16) vF = -16;
    if (vF > 76) vF = 76;

    var grip = (wantDrift && speed > 7) ? 2.9 : 14 - U.clamp(speed / 75, 0, 1) * 3.5;
    vR *= Math.exp(-grip * dt);

    this.vel.x = f.x * vF + rx * vR;
    this.vel.z = f.z * vF + rz * vR;

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    // colisão com as muretas
    var near = track.nearest(this.pos.x, this.pos.z, this.hint);
    this.hint = near.i;
    var limit = track.halfWidth - 1.05;

    if (Math.abs(near.lateral) > limit) {
      var side = near.lateral < 0 ? -1 : 1;
      this.pos.x = near.cx + near.nx * limit * side;
      this.pos.z = near.cz + near.nz * limit * side;

      var vOut = this.vel.x * near.nx * side + this.vel.z * near.nz * side;
      if (vOut > 0) {
        this.vel.x -= near.nx * side * vOut * 1.3;
        this.vel.z -= near.nz * side * vOut * 1.3;
        tele.wallHit = Math.max(tele.wallHit, vOut);
        if (hooks && hooks.onWall) {
          hooks.onWall(vOut, this.pos.x, 0.7, this.pos.z, near.nx * side, near.nz * side);
        }
      }
      this.vel.multiplyScalar(0.93);
    }

    f = this.forward();
    rx = Math.cos(this.yaw);
    rz = -Math.sin(this.yaw);
    this.vF = this.vel.x * f.x + this.vel.z * f.z;
    this.vR = this.vel.x * rx + this.vel.z * rz;
    this.speed = Math.hypot(this.vel.x, this.vel.z);

    tele.driftAmount = Math.max(tele.driftAmount, Math.abs(this.vR));
    if (Math.abs(this.vR) > 4 && this.speed > 9) tele.drifting = true;
    tele.boost = tele.boost || boostActive;
    tele.braking = tele.braking || (throttle < 0 && this.vF > 0.5);
    tele.throttle = throttle;
  };

  ND.PlayerCar.prototype.syncVisual = function (dt, tele) {
    var m = this.mesh;
    m.position.copy(this.pos);
    m.rotation.y = this.yaw;

    var targetRoll = U.clamp(-this.vR * 0.012, -0.12, 0.12);
    if (dt > 0) this.roll = U.damp(this.roll, targetRoll, 8, dt);
    else this.roll = targetRoll;

    var accel = dt > 0 ? (this.vF - this.prevVF) / dt : 0;
    var targetPitch = U.clamp(-accel * 0.003, -0.05, 0.05);
    if (dt > 0) this.pitch = U.damp(this.pitch, targetPitch, 7, dt);
    else this.pitch = 0;
    this.prevVF = this.vF;

    var body = m.userData.body;
    body.rotation.z = this.roll;
    body.rotation.x = this.pitch;
    body.position.y = Math.sin(this.time * 28) * 0.004 * U.clamp(this.speed / 40, 0, 1);

    this.wheelSpin += (this.vF * dt) / 0.37;
    var ws = this.wheelSpin % (Math.PI * 2);
    var wheels = m.userData.wheels;
    for (var i = 0; i < wheels.length; i++) {
      wheels[i].wheel.rotation.x = ws;
      if (wheels[i].steer) wheels[i].pivot.rotation.y = this.steer * 0.45;
    }

    var flames = m.userData.flames;
    for (var f = 0; f < flames.length; f++) {
      flames[f].visible = this.boosting;
      if (this.boosting) {
        var sc = 0.75 + Math.random() * 0.5;
        flames[f].scale.set(sc, sc, 1);
      }
    }

    var tail = m.userData.tailMat;
    if (tail && !m.userData.isGhost) {
      tail.color.setHex(tele && tele.braking ? 0xff5c7d : 0xff2255);
    }

    var under = m.userData.underglow;
    if (under) {
      under.material.opacity = (m.userData.isGhost ? 0.18 : 0.44) + Math.sin(this.time * 6) * 0.06;
    }
  };

})(window.ND);
