// Post-processing: the scene renders into an HDR multisampled target, then one full-screen
// pass adds radial motion blur and speed lines above ~30 m/s, a vignette, the suit-swap
// shimmer, fades, and finally tone mapping + sRGB output.
(function () {
  const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
  const FS = `
    uniform sampler2D tScene;
    uniform float uBlur, uLines, uTime, uAspect, uFlash, uFade, uVignette;
    uniform vec3 uFlashColor;
    varying vec2 vUv;
    float hash(float n){ return fract(sin(n) * 43758.5453); }
    void main(){
      vec2 c = vec2(0.5);
      vec2 d = vUv - c;
      float r = length(d * vec2(uAspect, 1.0));
      // Radial motion blur: stronger toward the edges, none in the centre.
      vec3 col = texture2D(tScene, vUv).rgb;
      float amt = uBlur * smoothstep(0.12, 0.75, r) * 0.028;
      if (amt > 0.0005) {
        float j = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        vec3 acc = col;
        for (int i = 1; i < 8; i++) {
          acc += texture2D(tScene, vUv - d * amt * (float(i) + j)).rgb;
        }
        col = acc / 8.0;
      }
      // Speed lines: thin radial streaks that flicker along the edge of the view.
      if (uLines > 0.001) {
        float a = atan(d.y * uAspect, d.x);
        float n = 180.0;
        float id = floor((a + 3.14159) / 6.28318 * n);
        float f = fract((a + 3.14159) / 6.28318 * n);
        float seed = hash(id * 1.37 + floor(uTime * 18.0 + hash(id) * 5.0));
        float on = step(0.82, seed);
        float thin = smoothstep(0.5, 0.0, abs(f - 0.5) * (2.2 + seed * 3.0));
        float radial = smoothstep(0.32 + seed * 0.12, 0.85, r);
        col = mix(col, vec3(1.0), on * thin * radial * uLines * 0.22);
      }
      col = mix(col, uFlashColor, uFlash);
      col *= 1.0 - uVignette * smoothstep(0.45, 1.05, r);
      col *= 1.0 - uFade;
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;

  class Post {
    constructor(renderer) {
      this.renderer = renderer;
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      const samples = renderer.capabilities.isWebGL2 ? Math.min(4, renderer.capabilities.maxSamples || 4) : 0;
      this.rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples });
      this.mat = new THREE.ShaderMaterial({
        vertexShader: VS, fragmentShader: FS, depthTest: false, depthWrite: false,
        uniforms: {
          tScene: { value: this.rt.texture }, uBlur: { value: 0 }, uLines: { value: 0 }, uTime: { value: 0 },
          uAspect: { value: size.x / size.y }, uFlash: { value: 0 }, uFlashColor: { value: new THREE.Color(1, 1, 1) },
          uFade: { value: 0 }, uVignette: { value: 0.35 },
        },
      });
      this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
      this.quad.frustumCulled = false;
      this.scene = new THREE.Scene();
      this.scene.add(this.quad);
      this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      this.enabled = true;
    }

    setSize() {
      const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      this.rt.setSize(size.x, size.y);
      this.mat.uniforms.uAspect.value = size.x / size.y;
    }

    render(scene, camera, fx) {
      const u = this.mat.uniforms;
      u.uBlur.value = fx.blur; u.uLines.value = fx.lines; u.uTime.value = fx.time;
      u.uFlash.value = fx.flash || 0; u.uFade.value = fx.fade || 0;
      if (fx.flashColor) u.uFlashColor.value.copy(fx.flashColor);
      this.renderer.setRenderTarget(this.rt);
      this.renderer.render(scene, camera);
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.cam);
    }
  }

  SR.Post = Post;
})();
