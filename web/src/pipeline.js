// How a frame reaches the screen. At low the scenes are drawn straight to the canvas, each material
// tone-mapping itself. Above low they are drawn into a half-float target with multisampling, so the
// Sun, the lights and the plume keep their true brightness; what is brighter than white is blurred
// into a glow (three.js's UnrealBloomPass), and the whole is tone-mapped once on its way to the canvas.
// The idea of an HDR picture with AgX's roll-off and the plume blooming above it is from the owner's
// booster-lander-simulator (docs/provenance.md, 1h, Graphics); the code is this file's. GPLv3.

import * as THREE from 'three';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// What blooms: light above the threshold, and no more of it than CLAMP, so the Sun's disc (thousands
// of times white) glows without washing out the frame. NaN and infinity, which a blur would spread
// into squares, are dropped.
const BRIGHT = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float luminosityThreshold;
  uniform float smoothWidth;
  varying vec2 vUv;
  const float CLAMP = 12.0;
  void main() {
    vec3 c = texture2D(tDiffuse, vUv).rgb;
    float sum = c.r + c.g + c.b;
    if (isnan(sum) || isinf(sum)) c = vec3(0.0);
    c = clamp(c, vec3(0.0), vec3(CLAMP));
    float v = dot(c, vec3(0.2126, 0.7152, 0.0722));
    gl_FragColor = vec4(c * smoothstep(luminosityThreshold, luminosityThreshold + smoothWidth, v), 1.0);
  }
`;

export const BLOOM = { threshold: 4.0, knee: 4.0, radius: 0.22 };

// AgX, as three.js has it, with a look: a little more contrast and colour than its base, which is made
// to keep a hue through any overexposure and leaves a lit Earth and a blue sky grey. Applied in AgX's
// own encoding, between its curve and its outset, where Blender's "Punchy" look is applied.
export const LOOK = { power: 1.18, saturation: 1.22 };
let looked = false;
export function agxLook(chunks = THREE.ShaderChunk) {
  if (looked) return;
  const at = 'color = agxDefaultContrastApprox( color );';
  if (!chunks.tonemapping_pars_fragment.includes(at)) throw new Error('three.js\'s AgX has changed: the look has nowhere to go');
  chunks.tonemapping_pars_fragment = chunks.tonemapping_pars_fragment.replace(at, `${at}
    color = pow( max( color, vec3( 0.0 ) ), vec3( ${LOOK.power.toFixed(3)} ) );
    float agxLuma = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
    color = agxLuma + ${LOOK.saturation.toFixed(3)} * ( color - agxLuma );`);
  looked = true;
}

export class Pipeline {
  constructor(renderer) {
    agxLook();
    this.renderer = renderer;
    renderer.info.autoReset = false;   // counted over the whole frame, every pass (render() resets it)
    this.target = null;
    this.bloom = null;
    this.output = new OutputPass();
    this.output.renderToScreen = true;
    // the picture is opaque whatever alpha the passes left in the target (an additive plume leaves 1, the
    // Earth's ground 0): a canvas that is composited by its alpha would let the page show through
    const read = 'gl_FragColor = texture2D( tDiffuse, vUv );';
    if (!this.output.material.fragmentShader.includes(read)) throw new Error('three.js\'s output pass has changed: its alpha cannot be made opaque');
    this.output.material.fragmentShader = this.output.material.fragmentShader.replace(read, 'gl_FragColor = vec4( texture2D( tDiffuse, vUv ).rgb, 1.0 );');
    this.width = 1;
    this.height = 1;
    this.divide = 1;
    this.note = '';
    const gl = renderer.getContext();
    this.canFloat = Boolean(gl.getExtension('EXT_color_buffer_half_float') || gl.getExtension('EXT_color_buffer_float'));
    this.maxSamples = gl.getParameter(gl.MAX_SAMPLES) || 0;
  }

  get hdr() { return this.target !== null; }

  // quality: a tier's settings (quality.js). Where a half-float target cannot be drawn into, the frame
  // goes straight to the canvas whatever the tier says, and note says so.
  setQuality(quality) {
    this.dispose();
    this.note = '';
    if (!quality.hdr) return;
    if (!this.canFloat) {
      this.note = 'no half-float target here: drawn without the glow';
      return;
    }
    this.target = new THREE.WebGLRenderTarget(this.width, this.height, {
      type: THREE.HalfFloatType,
      samples: Math.min(quality.msaa, this.maxSamples),
      depthBuffer: true,
      stencilBuffer: true,
      resolveDepthBuffer: false,
      resolveStencilBuffer: false,
    });
    this.target.texture.name = 'orbit.scene';
    if (quality.bloom > 0) {
      this.divide = quality.bloomDivide;
      this.bloom = new UnrealBloomPass(new THREE.Vector2(this.width / this.divide, this.height / this.divide), quality.bloom, BLOOM.radius, BLOOM.threshold);
      this.bloom.materialHighPassFilter.fragmentShader = BRIGHT;
      this.bloom.materialHighPassFilter.needsUpdate = true;
      this.bloom.highPassUniforms.smoothWidth.value = BLOOM.knee;
    }
  }

  // The drawing buffer's size, in its own pixels.
  setSize(width, height) {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    if (this.target) this.target.setSize(this.width, this.height);
    if (this.bloom) this.bloom.setSize(this.width / this.divide, this.height / this.divide);
  }

  // draw(): renders the scenes into whatever target is bound; it clears depth between its passes itself.
  render(draw) {
    const r = this.renderer;
    r.info.reset();
    r.setClearColor(0x000000, 1);
    if (!this.target) {
      r.setRenderTarget(null);
      r.clear();
      draw();
      return;
    }
    r.setRenderTarget(this.target);
    r.clear();
    draw();
    if (this.bloom) this.bloom.render(r, null, this.target, 0, false);
    this.output.render(r, null, this.target);
    r.setRenderTarget(null);
  }

  // Bytes of the targets this holds, for the page's report.
  bytes() {
    if (!this.target) return 0;
    const px = this.width * this.height;
    const samples = Math.max(1, this.target.samples);
    let b = px * 8 + (samples > 1 ? px * samples * (8 + 4) : px * 4);   // resolved colour; multisampled colour and depth-stencil
    if (this.bloom) {
      let w = this.width / this.divide / 2, h = this.height / this.divide / 2;
      b += w * h * 8;
      for (let i = 0; i < 5; i++, w /= 2, h /= 2) b += 2 * w * h * 8;
    }
    return Math.round(b);
  }

  dispose() {
    if (this.target) this.target.dispose();
    if (this.bloom) this.bloom.dispose();
    this.target = null;
    this.bloom = null;
    this.divide = 1;
  }
}
