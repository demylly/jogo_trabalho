/* ============================================================
   input.js — teclado + controles de toque
   ============================================================ */
(function (ND) {
  'use strict';

  var MAP = {
    up: ['KeyW', 'ArrowUp'],
    down: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    drift: ['Space'],
    boost: ['ShiftLeft', 'ShiftRight'],
    pause: ['Escape', 'KeyP'],
    restart: ['KeyR'],
    camera: ['KeyC'],
    mute: ['KeyM'],
    confirm: ['Enter', 'NumpadEnter']
  };

  ND.Input = function () {
    var self = this;
    this.down = {};
    this.pressed = {};
    this.codeToAction = {};

    Object.keys(MAP).forEach(function (action) {
      MAP[action].forEach(function (code) {
        self.codeToAction[code] = action;
      });
    });

    window.addEventListener('keydown', function (e) {
      var action = self.codeToAction[e.code];
      if (!action) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      if (!self.down[action]) self.pressed[action] = true;
      self.down[action] = true;
    }, { passive: false });

    window.addEventListener('keyup', function (e) {
      var action = self.codeToAction[e.code];
      if (!action) return;
      self.down[action] = false;
    });

    window.addEventListener('blur', function () { self.clear(); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) self.clear();
    });

    // controles de toque
    var coarse = false;
    try { coarse = window.matchMedia('(pointer: coarse)').matches; } catch (e) { coarse = false; }
    if (coarse || (navigator.maxTouchPoints > 1 && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent))) {
      document.body.classList.add('touch');
    }

    var buttons = document.querySelectorAll('#touch-controls [data-action]');
    Array.prototype.forEach.call(buttons, function (btn) {
      var action = btn.getAttribute('data-action');
      var release = function (e) {
        e.preventDefault();
        self.down[action] = false;
      };
      btn.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        btn.setPointerCapture && btn.setPointerCapture(e.pointerId);
        if (!self.down[action]) self.pressed[action] = true;
        self.down[action] = true;
      });
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('pointerleave', function (e) {
        if (e.buttons === 0) self.down[action] = false;
      });
      btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    });
  };

  ND.Input.prototype.get = function (action) {
    return !!this.down[action];
  };

  ND.Input.prototype.wasPressed = function (action) {
    return !!this.pressed[action];
  };

  ND.Input.prototype.endFrame = function () {
    this.pressed = {};
  };

  ND.Input.prototype.clear = function () {
    this.down = {};
    this.pressed = {};
  };

  // lê os controles de direção como eixos
  // Na câmera traseira, +steer gira o carro para a esquerda da tela.
  ND.Input.prototype.steer = function () {
    return (this.get('left') ? 1 : 0) - (this.get('right') ? 1 : 0);
  };
  ND.Input.prototype.throttle = function () {
    return (this.get('up') ? 1 : 0) - (this.get('down') ? 1 : 0);
  };

})(window.ND);
