/* ============================================================
   main.js — renderer, loop e atalhos globais
   ============================================================ */
(function () {
  'use strict';

  var boot = document.getElementById('boot-status');
  var canvas = document.getElementById('game');

  if (!window.THREE) {
    if (boot) boot.textContent = 'ERRO: Three.js não carregou (lib/three.min.js)';
    return;
  }

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
  } catch (e) {
    if (boot) boot.textContent = 'ERRO: WebGL indisponível neste navegador.';
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
  else if ('outputEncoding' in renderer) renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 4200);
  camera.position.set(30, 12, 30);

  ND.buildWorld(scene);

  var audio = new ND.Audio();
  var input = new ND.Input();
  audio.muted = !!ND.utils.loadSave().muted;

  var game = new ND.Game(scene, camera, renderer, audio, input);
  window.ND.game = game;

  var bootHidden = false;
  var last = performance.now();

  function frame(now) {
    var dt = (now - last) / 1000;
    last = now;
    if (!isFinite(dt) || dt < 0) dt = 0;
    if (dt > 0.1) dt = 0.1;

    if (input.wasPressed('pause')) game.onPauseKey();
    if (input.wasPressed('mute')) game.toggleMute();
    if (input.wasPressed('camera')) game.cycleCamera();
    if (input.wasPressed('restart')) game.onRestart();
    if (input.wasPressed('confirm')) game.onConfirm();

    if (game.state === 'menu') {
      if (input.wasPressed('left')) game.cycleTrack(-1);
      if (input.wasPressed('right')) game.cycleTrack(1);
    }

    game.update(dt);
    input.endFrame();

    renderer.render(scene, camera);

    if (!bootHidden) {
      bootHidden = true;
      if (boot) boot.style.display = 'none';
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

  function resize() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(w, h, false);
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () {
    setTimeout(resize, 120);
  });

  // primeiro gesto libera o áudio
  var unlocked = false;
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    audio.init();
  }
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });

  // pausa automática ao perder o foco
  window.addEventListener('blur', function () {
    game.togglePause(true);
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) game.togglePause(true);
  });

  // evita menu de contexto atrapalhar no meio da corrida
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

})();
