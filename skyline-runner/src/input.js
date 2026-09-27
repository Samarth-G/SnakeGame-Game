// Keyboard/mouse + gamepad input, merged into one per-frame snapshot with edge flags.
//   Gamepad:  LS move, RS camera, A jump, R2 swing, L2+R2 point-launch, B dive/drop, Y suit, L3 sprint
//   Keyboard: WASD, mouse, Space, LMB, RMB+LMB, Ctrl (or C), Tab, Shift sprint
(function () {
  const BTN = ['jump', 'swing', 'aim', 'dive', 'suit', 'sprint'];

  class Input {
    constructor(el) {
      this.el = el;
      this.keys = new Set();
      this.mouse = { l: false, r: false, dx: 0, dy: 0 };
      this.prev = {};
      this.state = { move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, mouseLook: { x: 0, y: 0 }, pressed: {}, released: {}, held: {} };
      this.virtual = null; // scripted input (autopilot / tests)
      this.onKey = null;

      addEventListener('keydown', (e) => {
        if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F3', 'F4'].includes(e.code) || e.ctrlKey) e.preventDefault();
        if (!e.repeat && this.onKey) this.onKey(e.code);
        this.keys.add(e.code);
      });
      addEventListener('keyup', (e) => this.keys.delete(e.code));
      addEventListener('blur', () => { this.keys.clear(); this.mouse.l = this.mouse.r = false; });
      el.addEventListener('mousedown', (e) => { if (e.button === 0) this.mouse.l = true; if (e.button === 2) this.mouse.r = true; });
      addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.l = false; if (e.button === 2) this.mouse.r = false; });
      el.addEventListener('contextmenu', (e) => e.preventDefault());
      addEventListener('mousemove', (e) => {
        if (document.pointerLockElement) { this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; }
      });
    }

    pad() {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const p of pads) if (p && p.connected && p.mapping === 'standard') return p;
      for (const p of pads) if (p && p.connected) return p;
      return null;
    }

    poll() {
      const k = this.keys, s = this.state, T = SR.TUNING;
      let mx = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
      let my = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
      let lx = 0, ly = 0;
      const held = {
        jump: k.has('Space'),
        swing: this.mouse.l,
        aim: this.mouse.r,
        dive: k.has('ControlLeft') || k.has('ControlRight') || k.has('KeyC'),
        suit: k.has('Tab'),
        sprint: k.has('ShiftLeft') || k.has('ShiftRight'),
      };
      const pad = this.pad();
      if (pad) {
        const dz = (v) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
        const b = (i) => !!(pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.35));
        if (Math.abs(dz(pad.axes[0])) > 0 || Math.abs(dz(pad.axes[1])) > 0) { mx = dz(pad.axes[0]); my = -dz(pad.axes[1]); }
        lx = dz(pad.axes[2] || 0); ly = dz(pad.axes[3] || 0);
        held.jump = held.jump || b(0);
        held.dive = held.dive || b(1);
        held.suit = held.suit || b(3);
        held.aim = held.aim || b(6);
        held.swing = held.swing || b(7);
        held.sprint = held.sprint || b(10);
      }
      if (this.virtual) {
        const v = this.virtual;
        mx = v.mx || 0; my = v.my || 0; lx = 0; ly = 0;
        for (const n of BTN) held[n] = !!v[n];
      }
      const len = Math.hypot(mx, my);
      if (len > 1) { mx /= len; my /= len; }
      s.move.x = mx; s.move.y = my;
      s.look.x = lx * T.padLookSpeed; s.look.y = ly * T.padLookSpeed;
      s.mouseLook.x = this.mouse.dx * T.mouseSensitivity; s.mouseLook.y = this.mouse.dy * T.mouseSensitivity;
      this.mouse.dx = this.mouse.dy = 0;
      for (const n of BTN) {
        s.pressed[n] = held[n] && !this.prev[n];
        s.released[n] = !held[n] && !!this.prev[n];
        s.held[n] = held[n];
        this.prev[n] = held[n];
      }
      return s;
    }
  }

  SR.Input = Input;
})();
