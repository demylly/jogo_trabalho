/* ============================================================
   utils.js — matemática, save, texturas procedurais e dados
   ============================================================ */
window.ND = window.ND || {};
(function (ND) {
  'use strict';

  var U = ND.utils = {};

  U.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
  U.damp = function (a, b, lambda, dt) { return a + (b - a) * (1 - Math.exp(-lambda * dt)); };
  U.mod = function (n, m) { return ((n % m) + m) % m; };
  U.sign = function (v) { return v < 0 ? -1 : (v > 0 ? 1 : 0); };
  U.rand = function (a, b) { return a + Math.random() * (b - a); };
  U.pick = function (arr) { return arr[(Math.random() * arr.length) | 0]; };
  U.wrapAngle = function (a) {
    a = (a + Math.PI) % (Math.PI * 2);
    if (a < 0) a += Math.PI * 2;
    return a - Math.PI;
  };
  U.angleLerp = function (a, b, t) { return a + U.wrapAngle(b - a) * t; };

  U.mulberry32 = function (seed) {
    var t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      var r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  };

  U.formatTime = function (t) {
    if (!isFinite(t) || t < 0) return '--:--.---';
    var m = Math.floor(t / 60);
    var s = Math.floor(t % 60);
    var ms = Math.floor((t * 1000) % 1000);
    return (m < 10 ? '0' : '') + m + ':' +
      (s < 10 ? '0' : '') + s + '.' +
      ('00' + ms).slice(-3);
  };

  U.formatClock = function (t) {
    if (!isFinite(t) || t < 0) return '--:--';
    var m = Math.floor(t / 60);
    var s = Math.floor(t % 60);
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  };

  U.round = function (v, d) { var p = Math.pow(10, d); return Math.round(v * p) / p; };

  /* ---------------- localStorage ---------------- */
  var KEY = 'neondrift.save.v2';

  U.defaultSave = function () {
    return { v: 2, track: 0, muted: false, best: {} };
  };

  U.loadSave = function () {
    var s = U.defaultSave();
    try {
      var raw = window.localStorage.getItem(KEY);
      if (raw) {
        var data = JSON.parse(raw);
        if (data && typeof data === 'object') {
          if (typeof data.track === 'number') s.track = U.clamp(data.track | 0, 0, 2);
          if (typeof data.muted === 'boolean') s.muted = data.muted;
          if (data.best && typeof data.best === 'object') s.best = data.best;
        }
      }
    } catch (e) { /* modo privado / file:// sem storage */ }
    return s;
  };

  U.persist = function (save) {
    try { window.localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* ignora */ }
  };

  /* ---------------- texturas geradas ---------------- */
  ND.tex = {};

  function canvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  ND.tex.glow = function () {
    if (ND.tex._glow) return ND.tex._glow;
    var c = canvas(128, 128), x = c.getContext('2d');
    var g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,.75)');
    g.addColorStop(0.6, 'rgba(255,255,255,.18)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    var t = new THREE.CanvasTexture(c);
    t.minFilter = THREE.LinearFilter;
    ND.tex._glow = t;
    return t;
  };

  ND.tex.shadow = function () {
    if (ND.tex._shadow) return ND.tex._shadow;
    var c = canvas(128, 128), x = c.getContext('2d');
    var g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(0,0,0,.85)');
    g.addColorStop(0.55, 'rgba(0,0,0,.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    var t = new THREE.CanvasTexture(c);
    t.minFilter = THREE.LinearFilter;
    ND.tex._shadow = t;
    return t;
  };

  ND.tex.asphalt = function () {
    if (ND.tex._asphalt) return ND.tex._asphalt;
    var W = 256, H = 1024;
    var c = canvas(W, H), x = c.getContext('2d');

    x.fillStyle = '#0a0a14';
    x.fillRect(0, 0, W, H);

    // ruído sutil
    var rng = U.mulberry32(4242);
    for (var i = 0; i < 3200; i++) {
      var a = rng() * 0.055;
      x.fillStyle = 'rgba(180,200,255,' + a.toFixed(3) + ')';
      x.fillRect(rng() * W, rng() * H, 1 + rng() * 2, 1 + rng() * 2);
    }

    // faixas laterais
    x.fillStyle = 'rgba(157,246,255,.85)';
    x.fillRect(4, 0, 4, H);
    x.fillRect(W - 8, 0, 4, H);

    // linha central tracejada
    x.fillStyle = 'rgba(230,240,255,.65)';
    for (var y = 0; y < H; y += 256) {
      x.fillRect(W / 2 - 2, y + 40, 4, 150);
    }

    // brilho roxo nas bordas internas
    var lg = x.createLinearGradient(0, 0, 36, 0);
    lg.addColorStop(0, 'rgba(255,43,214,.15)');
    lg.addColorStop(1, 'rgba(255,43,214,0)');
    x.fillStyle = lg; x.fillRect(0, 0, 36, H);
    var rg = x.createLinearGradient(W, 0, W - 36, 0);
    rg.addColorStop(0, 'rgba(34,230,255,.15)');
    rg.addColorStop(1, 'rgba(34,230,255,0)');
    x.fillStyle = rg; x.fillRect(W - 36, 0, 36, H);

    var t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    setSRGB(t);
    ND.tex._asphalt = t;
    return t;
  };

  ND.tex.checker = function () {
    if (ND.tex._checker) return ND.tex._checker;
    var c = canvas(512, 128), x = c.getContext('2d');
    var cols = 8, rows = 2, cw = 512 / cols, ch = 128 / rows;
    for (var r = 0; r < rows; r++) {
      for (var i = 0; i < cols; i++) {
        x.fillStyle = ((i + r) % 2 === 0) ? '#eaf6ff' : '#0a0a12';
        x.fillRect(i * cw, r * ch, cw, ch);
      }
    }
    x.strokeStyle = 'rgba(34,230,255,.8)';
    x.lineWidth = 6;
    x.strokeRect(0, 0, 512, 128);
    var t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    setSRGB(t);
    ND.tex._checker = t;
    return t;
  };

  ND.tex.sky = function () {
    if (ND.tex._sky) return ND.tex._sky;
    var c = canvas(4, 512), x = c.getContext('2d');
    var g = x.createLinearGradient(0, 512, 0, 0);
    g.addColorStop(0.00, '#030109');
    g.addColorStop(0.36, '#120527');
    g.addColorStop(0.47, '#2a0a45');
    g.addColorStop(0.50, '#471153');
    g.addColorStop(0.54, '#2a0a45');
    g.addColorStop(0.64, '#15072d');
    g.addColorStop(1.00, '#030109');
    x.fillStyle = g;
    x.fillRect(0, 0, 4, 512);
    var t = new THREE.CanvasTexture(c);
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    setSRGB(t);
    ND.tex._sky = t;
    return t;
  };

  ND.tex.sun = function () {
    if (ND.tex._sun) return ND.tex._sun;
    var S = 512;
    var c = canvas(S, S), x = c.getContext('2d');
    var cx = S / 2, cy = S / 2, R = S * 0.30;

    // halo
    var halo = x.createRadialGradient(cx, cy, R * 0.8, cx, cy, R * 1.62);
    halo.addColorStop(0, 'rgba(255,43,214,.45)');
    halo.addColorStop(0.55, 'rgba(255,43,214,.12)');
    halo.addColorStop(1, 'rgba(255,43,214,0)');
    x.fillStyle = halo;
    x.fillRect(0, 0, S, S);

    x.save();
    x.beginPath();
    x.arc(cx, cy, R, 0, Math.PI * 2);
    x.clip();
    var g = x.createLinearGradient(0, cy - R, 0, cy + R);
    g.addColorStop(0, '#fff6b0');
    g.addColorStop(0.32, '#ffd319');
    g.addColorStop(0.62, '#ff8a3d');
    g.addColorStop(0.85, '#ff2975');
    g.addColorStop(1, '#c81bff');
    x.fillStyle = g;
    x.fillRect(cx - R, cy - R, R * 2, R * 2);

    // listras clássicas na metade de baixo
    x.globalCompositeOperation = 'destination-out';
    for (var i = 0; i < 9; i++) {
      var yy = cy + R * (0.12 + i * 0.10);
      var hh = 3 + i * 1.7;
      x.fillRect(cx - R, yy, R * 2, hh);
    }
    x.restore();

    var t = new THREE.CanvasTexture(c);
    t.minFilter = THREE.LinearFilter;
    setSRGB(t);
    ND.tex._sun = t;
    return t;
  };

  function setSRGB(t) {
    if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
    else if ('encoding' in t) t.encoding = THREE.sRGBEncoding;
  }
  ND.setSRGB = setSRGB;

  U.setSRGB = setSRGB;

  /* ---------------- circuitos ---------------- */
  ND.CIRCUITS = [
    { name: 'ORLA NORTE', seed: 1337, base: 305, h2: 46, h3: 30, h5: 13, stretch: 1.05, width: 19 },
    { name: 'ZONA ROSA', seed: 90210, base: 265, h2: 54, h3: 36, h5: 17, stretch: 0.94, width: 18 },
    { name: 'ABISMO', seed: 424242, base: 345, h2: 62, h3: 42, h5: 21, stretch: 1.00, width: 20 }
  ];

  ND.CIRCUIT_LABEL = function (i) {
    var d = ND.CIRCUITS[i] || ND.CIRCUITS[0];
    return ('0' + (i + 1)).slice(-2) + ' — ' + d.name;
  };

})(window.ND);
