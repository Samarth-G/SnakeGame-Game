// Small math / random helpers shared by every module.
(function () {
  const U = {};

  // Deterministic PRNG (mulberry32) so the city is identical on every load.
  U.rng = function (seed) {
    let a = seed >>> 0;
    const next = function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.range = (lo, hi) => lo + (hi - lo) * next();
    next.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * next());
    next.pick = (arr) => arr[Math.floor(next() * arr.length)];
    next.chance = (p) => next() < p;
    return next;
  };

  U.hash2 = function (x, z) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  U.clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.smoothstep = (a, b, v) => {
    const t = U.clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  // Frame-rate independent exponential smoothing.
  U.damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));
  U.dampAngle = (a, b, lambda, dt) => a + U.wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));
  U.wrapAngle = (a) => {
    a = (a + Math.PI) % (Math.PI * 2);
    if (a < 0) a += Math.PI * 2;
    return a - Math.PI;
  };
  U.DEG = Math.PI / 180;

  SR.util = U;
})();
