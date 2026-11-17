/* ============================================================
   track.js — circuito procedural, ambiente synthwave e minimapa
   ============================================================ */
(function (ND) {
  'use strict';

  var U = ND.utils;

  var COLORS = {
    cyan: 0x22e6ff,
    pink: 0xff2bd6,
    purple: 0x8b5cf6,
    amber: 0xffb020
  };
  ND.COLORS = COLORS;

  /* ============================================================
     TRACK
     ============================================================ */
  ND.Track = function (scene, index) {
    this.scene = scene;
    this.index = index;
    this.data = ND.CIRCUITS[index];
    this.halfWidth = this.data.width / 2;
    this.group = new THREE.Group();
    this.group.name = 'track';
    scene.add(this.group);

    this.buildCurve();
    this.buildRoad();
    this.buildRails();
    this.buildStart();
    this.buildGates();
    this.buildPylons();
    this.buildMinimap();
  };

  ND.Track.prototype.buildCurve = function () {
    var d = this.data;
    var rng = U.mulberry32(d.seed);
    var p1 = rng() * Math.PI * 2;
    var p2 = rng() * Math.PI * 2;
    var p3 = rng() * Math.PI * 2;
    var rot = rng() * Math.PI * 2;

    var n = 22;
    var ctrl = [];
    for (var i = 0; i < n; i++) {
      var a = rot + (i / n) * Math.PI * 2;
      var r = d.base +
        Math.sin(a * 2 + p1) * d.h2 +
        Math.sin(a * 3 + p2) * d.h3 +
        Math.sin(a * 5 + p3) * d.h5;
      ctrl.push(new THREE.Vector3(Math.cos(a) * r * d.stretch, 0, Math.sin(a) * r));
    }

    this.curve = new THREE.CatmullRomCurve3(ctrl, true, 'centripetal', 0.5);

    var SEG = 1800;
    var pts = this.curve.getSpacedPoints(SEG);
    pts.pop();
    var N = pts.length;

    this.N = N;
    this.pts = pts;
    this.tx = new Float32Array(N);
    this.tz = new Float32Array(N);
    this.nx = new Float32Array(N);
    this.nz = new Float32Array(N);
    this.ds = new Float32Array(N);
    this.dist = new Float32Array(N);
    this.curv = new Float32Array(N);

    var total = 0;
    for (var j = 0; j < N; j++) {
      var p0 = pts[(j - 1 + N) % N];
      var p1v = pts[(j + 1) % N];
      var dx = p1v.x - p0.x;
      var dz = p1v.z - p0.z;
      var len = Math.hypot(dx, dz) || 1;
      this.tx[j] = dx / len;
      this.tz[j] = dz / len;
      this.nx[j] = this.tz[j];
      this.nz[j] = -this.tx[j];
    }

    for (var k = 0; k < N; k++) {
      this.dist[k] = total;
      var q0 = pts[k];
      var q1 = pts[(k + 1) % N];
      this.ds[k] = Math.hypot(q1.x - q0.x, q1.z - q0.z);
      total += this.ds[k];
    }
    this.length = total;

    for (var c = 0; c < N; c++) {
      var i0 = (c - 1 + N) % N;
      var i1 = (c + 1) % N;
      var cross = this.tz[i0] * this.tx[i1] - this.tx[i0] * this.tz[i1];
      var dot = this.tx[i0] * this.tx[i1] + this.tz[i0] * this.tz[i1];
      var ang = Math.atan2(cross, dot);
      var dsAvg = this.ds[i0] + this.ds[c];
      this.curv[c] = ang / Math.max(dsAvg, 0.0001);
    }
  };

  ND.Track.prototype.pointAtS = function (s) {
    var L = this.length;
    s = U.mod(s, L);
    var f = (s / L) * this.N;
    var i = Math.floor(f) % this.N;
    var t = f - Math.floor(f);
    var j = (i + 1) % this.N;

    var tx = U.lerp(this.tx[i], this.tx[j], t);
    var tz = U.lerp(this.tz[i], this.tz[j], t);
    var tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;

    return {
      x: U.lerp(this.pts[i].x, this.pts[j].x, t),
      z: U.lerp(this.pts[i].z, this.pts[j].z, t),
      tx: tx, tz: tz,
      nx: tz, nz: -tx,
      yaw: Math.atan2(tx, tz),
      curv: U.lerp(this.curv[i], this.curv[j], t),
      i: i
    };
  };

  ND.Track.prototype.curvatureAtS = function (s) {
    s = U.mod(s, this.length);
    var f = (s / this.length) * this.N;
    var i = Math.floor(f) % this.N;
    var t = f - Math.floor(f);
    var j = (i + 1) % this.N;
    return U.lerp(this.curv[i], this.curv[j], t);
  };

  ND.Track.prototype.nearest = function (x, z, hint) {
    var N = this.N;
    var best = 0;
    var bestD = Infinity;
    var i, dx, dz, d;

    if (hint != null && hint >= 0) {
      for (var k = -52; k <= 52; k++) {
        i = (hint + k + N) % N;
        dx = x - this.pts[i].x;
        dz = z - this.pts[i].z;
        d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = i; }
      }
    } else {
      for (i = 0; i < N; i++) {
        dx = x - this.pts[i].x;
        dz = z - this.pts[i].z;
        d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = i; }
      }
    }

    var i0 = best;
    var i1 = (best + 1) % N;
    var p0 = this.pts[i0];
    var p1 = this.pts[i1];
    var sx = p1.x - p0.x;
    var sz = p1.z - p0.z;
    var len2 = sx * sx + sz * sz || 1;
    var t = U.clamp(((x - p0.x) * sx + (z - p0.z) * sz) / len2, 0, 1);

    var cx = p0.x + sx * t;
    var cz = p0.z + sz * t;

    var tx = U.lerp(this.tx[i0], this.tx[i1], t);
    var tz = U.lerp(this.tz[i0], this.tz[i1], t);
    var tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;

    var nx = tz;
    var nz = -tx;
    var lateral = (x - cx) * nx + (z - cz) * nz;
    var s = this.dist[i0] + this.ds[i0] * t;
    var u = s / this.length;

    return {
      i: i0, t: t,
      cx: cx, cz: cz,
      tx: tx, tz: tz, nx: nx, nz: nz,
      lateral: lateral,
      s: s,
      u: u >= 1 ? 0 : u,
      curv: U.lerp(this.curv[i0], this.curv[i1], t)
    };
  };

  /* ---------------- malhas ---------------- */

  ND.Track.prototype.buildRoad = function () {
    var N = this.N, hw = this.halfWidth;
    var pos = [], uv = [], idx = [];

    for (var i = 0; i < N; i++) {
      var p = this.pts[i];
      var nx = this.nx[i] * hw;
      var nz = this.nz[i] * hw;
      var v = this.dist[i] / 13;
      pos.push(p.x - nx, 0.02, p.z - nz, p.x + nx, 0.02, p.z + nz);
      uv.push(0, v, 1, v);
    }
    for (var j = 0; j < N; j++) {
      var a = j * 2, b = a + 1;
      var c = ((j + 1) % N) * 2, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();

    var map = ND.tex.asphalt();
    var mat = new THREE.MeshStandardMaterial({
      map: map,
      roughness: 0.8,
      metalness: 0.22,
      emissive: 0x1b1738,
      emissiveIntensity: 0.6
    });
    mat.emissiveMap = map;
    var mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = false;
    this.group.add(mesh);

    // brilho neon derramado no asfalto, junto às bordas
    this.buildEdgeGlow(-1, COLORS.pink);
    this.buildEdgeGlow(1, COLORS.cyan);
  };

  ND.Track.prototype.buildEdgeGlow = function (side, colorHex) {
    var N = this.N, hw = this.halfWidth - 0.2;
    var c = new THREE.Color(colorHex);
    var columns = [0, 0.45, 1.5, 2.9];
    var strengths = [0.8, 0.34, 0.09, 0];
    var pos = [], col = [], idx = [];

    for (var i = 0; i < N; i++) {
      var p = this.pts[i];
      for (var k = 0; k < columns.length; k++) {
        var off = (hw - columns[k]) * side;
        pos.push(p.x + this.nx[i] * off, 0.045, p.z + this.nz[i] * off);
        var s = strengths[k];
        col.push(c.r * s, c.g * s, c.b * s);
      }
    }
    var stride = columns.length;
    for (var j = 0; j < N; j++) {
      var base = j * stride;
      var next = ((j + 1) % N) * stride;
      for (var q = 0; q < stride - 1; q++) {
        // a ordem inverte conforme o lado para manter o winding
        if (side < 0) idx.push(base + q, base + q + 1, next + q, base + q + 1, next + q + 1, next + q);
        else idx.push(base + q, next + q, base + q + 1, base + q + 1, next + q, next + q + 1);
      }
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    var mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true
    });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 1;
    this.group.add(mesh);
  };

  ND.Track.prototype.stripGeometry = function (offsetA, offsetB, yA, yB) {
    var N = this.N;
    var pos = [], idx = [];
    for (var i = 0; i < N; i++) {
      var p = this.pts[i];
      pos.push(
        p.x + this.nx[i] * offsetA, yA, p.z + this.nz[i] * offsetA,
        p.x + this.nx[i] * offsetB, yB, p.z + this.nz[i] * offsetB
      );
    }
    for (var j = 0; j < N; j++) {
      var a = j * 2, b = a + 1;
      var c = ((j + 1) % N) * 2, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  };

  ND.Track.prototype.buildRails = function () {
    var hw = this.halfWidth;
    var self = this;

    function rail(side, colorHex) {
      var color = new THREE.Color(colorHex);

      // mureta central
      var geo = self.stripGeometry((hw) * side, (hw) * side, 0.03, 0.95);
      var mat = new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide });
      self.group.add(new THREE.Mesh(geo, mat));

      // topo mais claro
      var cap = self.stripGeometry((hw + 0.22) * side, (hw - 0.22) * side, 0.96, 0.96);
      var capMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(colorHex).lerp(new THREE.Color(0xffffff), 0.45),
        side: THREE.DoubleSide
      });
      self.group.add(new THREE.Mesh(cap, capMat));

      // cortina de luz
      var N = self.N;
      var pos = [], col = [], idx = [];
      for (var i = 0; i < N; i++) {
        var p = self.pts[i];
        var ox = self.nx[i] * hw * side;
        var oz = self.nz[i] * hw * side;
        pos.push(p.x + ox, 0.97, p.z + oz);
        pos.push(p.x + ox, 2.9, p.z + oz);
        col.push(color.r * 0.65, color.g * 0.65, color.b * 0.65);
        col.push(0, 0, 0);
      }
      for (var j = 0; j < N; j++) {
        var a = j * 2, b = a + 1;
        var c = ((j + 1) % N) * 2, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
      var glowGeo = new THREE.BufferGeometry();
      glowGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      glowGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      glowGeo.setIndex(idx);
      var glowMat = new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: true
      });
      var glow = new THREE.Mesh(glowGeo, glowMat);
      glow.renderOrder = 2;
      self.group.add(glow);
    }

    rail(-1, COLORS.pink);
    rail(1, COLORS.cyan);

    // saia escura embaixo (pista flutuante)
    var skirtL = this.stripGeometry(-hw, -hw, 0, -3.2);
    var skirtR = this.stripGeometry(hw, hw, 0, -3.2);
    var skirtMat = new THREE.MeshBasicMaterial({ color: 0x150a2c, side: THREE.DoubleSide });
    this.group.add(new THREE.Mesh(skirtL, skirtMat));
    this.group.add(new THREE.Mesh(skirtR, skirtMat));

    // linha neon na base da saia
    var baseL = this.stripGeometry(-hw - 0.16, -hw + 0.16, -3.15, -3.15);
    var baseR = this.stripGeometry(hw + 0.16, hw - 0.16, -3.15, -3.15);
    var baseMatL = new THREE.MeshBasicMaterial({ color: 0x7a1bd0, side: THREE.DoubleSide });
    var baseMatR = new THREE.MeshBasicMaterial({ color: 0x1b9bb5, side: THREE.DoubleSide });
    this.group.add(new THREE.Mesh(baseL, baseMatL));
    this.group.add(new THREE.Mesh(baseR, baseMatR));
  };

  ND.Track.prototype.buildStart = function () {
    var p = this.pointAtS(0);
    var geo = new THREE.PlaneGeometry(this.data.width, 3.8);
    geo.rotateX(-Math.PI / 2);
    var tex = ND.tex.checker();
    tex.repeat.set(2, 1);
    var mat = new THREE.MeshBasicMaterial({ map: tex });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(p.x, 0.05, p.z);
    mesh.rotation.y = p.yaw;
    this.group.add(mesh);
  };

  ND.Track.prototype.buildGates = function () {
    var hw = this.halfWidth;
    var gateW = hw + 2.1;
    var glowTex = ND.tex.glow();

    for (var s = 0; s < this.length; s += 235) {
      var p = this.pointAtS(s);
      var isPink = Math.round(s / 235) % 2 === 0;
      var color = isPink ? COLORS.pink : COLORS.cyan;
      var mat = new THREE.MeshBasicMaterial({ color: color });

      var group = new THREE.Group();
      group.position.set(p.x, 0, p.z);
      group.rotation.y = p.yaw;

      var pillarGeo = new THREE.BoxGeometry(0.42, 7, 0.42);
      var pillL = new THREE.Mesh(pillarGeo, mat);
      pillL.position.set(-gateW, 3.5, 0);
      group.add(pillL);
      var pillR = new THREE.Mesh(pillarGeo, mat);
      pillR.position.set(gateW, 3.5, 0);
      group.add(pillR);

      var barGeo = new THREE.BoxGeometry(gateW * 2 + 0.5, 0.38, 0.38);
      var bar = new THREE.Mesh(barGeo, mat);
      bar.position.set(0, 7, 0);
      group.add(bar);

      var spriteMat = new THREE.SpriteMaterial({
        map: glowTex, color: color, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8
      });
      var gl = new THREE.Sprite(spriteMat);
      gl.position.set(0, 7, 0);
      gl.scale.set(5.5, 5.5, 1);
      group.add(gl);

      this.group.add(group);
    }
  };

  ND.Track.prototype.buildPylons = function () {
    var hw = this.halfWidth;
    var spacing = 42;
    var count = Math.floor(this.length / spacing) * 2;
    var geo = new THREE.BoxGeometry(0.16, 1.15, 0.16);
    var mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    var inst = new THREE.InstancedMesh(geo, mat, count);
    var m = new THREE.Matrix4();
    var q = new THREE.Quaternion();
    var scale = new THREE.Vector3(1, 1, 1);
    var col = new THREE.Color();
    var idx = 0;

    for (var s = 0; s < this.length && idx < count; s += spacing) {
      var p = this.pointAtS(s);
      for (var side = -1; side <= 1; side += 2) {
        if (idx >= count) break;
        var x = p.x + p.nx * (hw + 1.05) * side;
        var z = p.z + p.nz * (hw + 1.05) * side;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw);
        m.compose(new THREE.Vector3(x, 0.58, z), q, scale);
        inst.setMatrixAt(idx, m);
        col.setHex(side < 0 ? COLORS.pink : COLORS.cyan);
        inst.setColorAt(idx, col);
        idx++;
      }
    }
    inst.count = idx;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    this.group.add(inst);
  };

  ND.Track.prototype.buildMinimap = function () {
    var step = Math.max(1, Math.floor(this.N / 140));
    var mini = [];
    var minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (var i = 0; i < this.N; i += step) {
      var p = this.pts[i];
      mini.push([p.x, p.z]);
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    this.mini = mini;
    this.bounds = { minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
    this.startPoint = this.pts[0];
  };

  ND.Track.prototype.dispose = function () {
    this.group.traverse(function (obj) {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        var mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (var i = 0; i < mats.length; i++) {
          if (mats[i] && mats[i].dispose) mats[i].dispose();
        }
      }
    });
    this.scene.remove(this.group);
  };

  /* ============================================================
     AMBIENTE
     ============================================================ */
  ND.buildWorld = function (scene) {
    scene.background = new THREE.Color(0x05030c);
    scene.fog = new THREE.FogExp2(0x0a0618, 0.0019);

    // céu em gradiente
    var skyGeo = new THREE.SphereGeometry(2700, 32, 20);
    var skyMat = new THREE.MeshBasicMaterial({
      map: ND.tex.sky(),
      side: THREE.BackSide,
      depthWrite: false,
      fog: false
    });
    var sky = new THREE.Mesh(skyGeo, skyMat);
    sky.renderOrder = -10;
    scene.add(sky);

    // sol
    var sunMat = new THREE.SpriteMaterial({
      map: ND.tex.sun(),
      transparent: true,
      depthWrite: false,
      fog: false,
      opacity: 0.95,
      blending: THREE.AdditiveBlending
    });
    var sun = new THREE.Sprite(sunMat);
    sun.position.set(-420, 210, -1500);
    sun.scale.set(680, 680, 1);
    scene.add(sun);

    // estrelas
    var starPos = [];
    var rng = U.mulberry32(777);
    for (var i = 0; i < 900; i++) {
      var theta = rng() * Math.PI * 2;
      var phi = Math.acos(0.08 + rng() * 0.92);
      var r = 2350;
      var y = Math.cos(phi) * r;
      if (y < 20) y = 20 + rng() * 300;
      starPos.push(Math.sin(phi) * Math.cos(theta) * r, y, Math.sin(phi) * Math.sin(theta) * r);
    }
    var starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    var starMat = new THREE.PointsMaterial({
      color: 0xbfe9ff,
      size: 2.0,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      fog: false
    });
    var stars = new THREE.Points(starGeo, starMat);
    stars.renderOrder = -5;
    scene.add(stars);

    // montanhas em silhueta
    var mCount = 34;
    var coneGeo = new THREE.ConeGeometry(1, 1, 4);
    var mountainMat = new THREE.MeshBasicMaterial({ color: 0x180a2e, fog: true });
    var mountains = new THREE.InstancedMesh(coneGeo, mountainMat, mCount);
    var wireMat = new THREE.MeshBasicMaterial({
      color: 0x7a2bd8, wireframe: true, transparent: true, opacity: 0.22, fog: true
    });
    var wires = new THREE.InstancedMesh(coneGeo, wireMat, mCount);

    var m4 = new THREE.Matrix4();
    var quat = new THREE.Quaternion();
    var pos = new THREE.Vector3();
    var scl = new THREE.Vector3();
    var rng2 = U.mulberry32(12321);
    for (var k = 0; k < mCount; k++) {
      var ang = (k / mCount) * Math.PI * 2 + rng2() * 0.09;
      var dist = 720 + rng2() * 460;
      var h = 45 + rng2() * 135;
      var w = 55 + rng2() * 110;
      pos.set(Math.cos(ang) * dist, h / 2 - 8, Math.sin(ang) * dist);
      quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng2() * Math.PI);
      scl.set(w, h, w * (0.7 + rng2() * 0.6));
      m4.compose(pos, quat, scl);
      mountains.setMatrixAt(k, m4);
      wires.setMatrixAt(k, m4);
    }
    scene.add(mountains);
    scene.add(wires);

    // grade infinita
    var grid = new THREE.GridHelper(6000, 300, 0x6a28c8, 0x241040);
    grid.position.y = -3.05;
    grid.material.transparent = true;
    grid.material.opacity = 0.55;
    grid.material.depthWrite = false;
    scene.add(grid);

    // luzes
    scene.add(new THREE.HemisphereLight(0x8899ff, 0x2a0a3f, 0.9));
    scene.add(new THREE.AmbientLight(0x3a2a5a, 0.7));

    var dir = new THREE.DirectionalLight(0xffa6dd, 1.35);
    dir.position.set(-160, 240, -200);
    scene.add(dir);

    var fill = new THREE.DirectionalLight(0x3a7bff, 0.45);
    fill.position.set(180, 90, 160);
    scene.add(fill);
  };

})(window.ND);
