// Textures painted by code into typed arrays: an albedo, a height (made into a normal map), and a mask
// texture whose channels are glow (lit windows), roughness and metalness, in the order three.js reads
// roughness (green) and metalness (blue) from one map. No canvas and no image; everything tiles, so a
// rectangle that runs off one edge comes back on the other. No three.js here, so the tests can read
// it; ring.js and craft.js make the textures. GPLv3.

export function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 >>> 0) / 4294967296);
}

export const clamp01 = (v) => Math.min(1, Math.max(0, v));

export class Paint {
  // w, h: texels. What is not painted is albedo `base`, height 0, glow 0, roughness `rough`, metal `metal`.
  constructor(w, h, { base = [0.5, 0.5, 0.5], rough = 0.6, metal = 0 } = {}) {
    this.w = w;
    this.h = h;
    const n = w * h;
    this.albedo = new Float32Array(n * 3);
    this.height = new Float32Array(n);
    this.glow = new Float32Array(n);
    this.rough = new Float32Array(n).fill(rough);
    this.metal = new Float32Array(n).fill(metal);
    for (let i = 0; i < n; i++) this.albedo.set(base, i * 3);
  }

  // A rectangle in texels, [x0, x1) by [y0, y1), wrapped round both edges. Each of `paint`'s keys is
  // optional: albedo [r, g, b] (or a function of x, y giving one), height (set) or raise (added), glow,
  // rough, metal, and tint (a factor on the albedo already there).
  rect(x0, y0, x1, y1, paint) {
    const { w, h } = this;
    x0 = Math.round(x0); x1 = Math.round(x1); y0 = Math.round(y0); y1 = Math.round(y1);
    if (x1 <= x0 || y1 <= y0) return;
    const { albedo, height, raise, glow, rough, metal, tint } = paint;
    const fn = typeof albedo === 'function';
    for (let y = y0; y < y1; y++) {
      const yy = ((y % h) + h) % h;
      for (let x = x0; x < x1; x++) {
        const i = yy * w + (((x % w) + w) % w);
        if (albedo) this.albedo.set(fn ? albedo(x, y) : albedo, i * 3);
        if (tint !== undefined) { this.albedo[i * 3] *= tint; this.albedo[i * 3 + 1] *= tint; this.albedo[i * 3 + 2] *= tint; }
        if (height !== undefined) this.height[i] = height;
        if (raise !== undefined) this.height[i] += raise;
        if (glow !== undefined) this.glow[i] = glow;
        if (rough !== undefined) this.rough[i] = rough;
        if (metal !== undefined) this.metal[i] = metal;
      }
    }
  }

  // A rectangle's outline, `t` texels thick, recessed (a panel's seam).
  seam(x0, y0, x1, y1, t, depth, shade = 0.75) {
    this.rect(x0, y0, x1, y0 + t, { raise: -depth, tint: shade });
    this.rect(x0, y1 - t, x1, y1, { raise: -depth, tint: shade });
    this.rect(x0, y0 + t, x0 + t, y1 - t, { raise: -depth, tint: shade });
    this.rect(x1 - t, y0 + t, x1, y1 - t, { raise: -depth, tint: shade });
  }

  // A disc of radius r texels (a rivet, a tree, a hatch).
  disc(cx, cy, r, paint) {
    const { w, h } = this;
    const { albedo, raise, glow, rough, metal, tint } = paint;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const d2 = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2;
        if (d2 > r * r) continue;
        const i = (((y % h) + h) % h) * w + (((x % w) + w) % w);
        if (albedo) this.albedo.set(albedo, i * 3);
        if (tint !== undefined) { this.albedo[i * 3] *= tint; this.albedo[i * 3 + 1] *= tint; this.albedo[i * 3 + 2] *= tint; }
        if (raise !== undefined) this.height[i] += raise * Math.sqrt(1 - d2 / (r * r));
        if (glow !== undefined) this.glow[i] = glow;
        if (rough !== undefined) this.rough[i] = rough;
        if (metal !== undefined) this.metal[i] = metal;
      }
    }
  }

  // Fine grain over everything: albedo by +-amount, roughness by +-roughAmount.
  grain(random, amount, roughAmount = 0) {
    const n = this.w * this.h;
    for (let i = 0; i < n; i++) {
      const k = 1 + (random() - 0.5) * 2 * amount;
      this.albedo[i * 3] *= k; this.albedo[i * 3 + 1] *= k; this.albedo[i * 3 + 2] *= k;
      if (roughAmount) this.rough[i] = clamp01(this.rough[i] + (random() - 0.5) * 2 * roughAmount);
    }
  }

  // The albedo as sRGB bytes, RGBA (alpha: the glow, for a surface that keeps its glow there).
  albedoBytes(glowInAlpha = false) {
    const n = this.w * this.h, out = new Uint8Array(n * 4);
    const enc = (v) => {
      const c = clamp01(v);
      return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
    };
    for (let i = 0; i < n; i++) {
      out[i * 4] = enc(this.albedo[i * 3]);
      out[i * 4 + 1] = enc(this.albedo[i * 3 + 1]);
      out[i * 4 + 2] = enc(this.albedo[i * 3 + 2]);
      out[i * 4 + 3] = glowInAlpha ? Math.round(255 * clamp01(this.glow[i])) : 255;
    }
    return out;
  }

  // Glow, roughness, metalness as RGBA bytes (linear).
  maskBytes() {
    const n = this.w * this.h, out = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) {
      out[i * 4] = Math.round(255 * clamp01(this.glow[i]));
      out[i * 4 + 1] = Math.round(255 * clamp01(this.rough[i]));
      out[i * 4 + 2] = Math.round(255 * clamp01(this.metal[i]));
      out[i * 4 + 3] = 255;
    }
    return out;
  }

  // The height as a tangent-space normal map, RGBA bytes: x along the texture's width, y along its
  // height, z out of the surface. `strength`: the slope of a height step of 1 across one texel.
  normalBytes(strength = 1) {
    const { w, h } = this, H = this.height, out = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      const up = ((y + 1) % h) * w, dn = ((y - 1 + h) % h) * w, row = y * w;
      for (let x = 0; x < w; x++) {
        const r = (x + 1) % w, l = (x - 1 + w) % w;
        const dx = (H[row + r] - H[row + l]) * 0.5 * strength, dy = (H[up + x] - H[dn + x]) * 0.5 * strength;
        const k = 1 / Math.sqrt(dx * dx + dy * dy + 1);
        const i = (row + x) * 4;
        out[i] = Math.round(127.5 + 127.5 * -dx * k);
        out[i + 1] = Math.round(127.5 + 127.5 * -dy * k);
        out[i + 2] = Math.round(127.5 + 127.5 * k);
        out[i + 3] = 255;
      }
    }
    return out;
  }

  // The mean albedo, linear, for the tests and for the colour a surface fades to far away.
  mean() {
    const n = this.w * this.h, m = [0, 0, 0];
    for (let i = 0; i < n; i++) { m[0] += this.albedo[i * 3]; m[1] += this.albedo[i * 3 + 1]; m[2] += this.albedo[i * 3 + 2]; }
    return m.map((v) => v / n);
  }
}
