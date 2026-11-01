// A minimal overlay on the view until P8 draws a PFD: speed, altitude, attitude, the flight path,
// localizer and glideslope scales, flaps and gear. The horizon and the pitch ladder are conformal: drawn
// with the camera's own projection, they lie on the horizon the view draws. GPLv3.

const DEG = Math.PI / 180;
const GREEN = '#40ff70', AMBER = '#ffb000', WHITE = '#e8f0e8', DIM = 'rgba(232,240,232,0.35)';
const FLAPS = ['0', '1', '2', '3', 'FULL'];

export class Overlay {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
  }

  resize(width, height, ratio) {
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ratio = ratio;
  }

  // s: state by name; fovDeg: the camera's vertical field of view; c: the controls; ils: {loc, gs} in
  // dots, or null with no ILS.
  draw(s, fovDeg, c, ils) {
    const g = this.g, W = this.canvas.width, H = this.canvas.height, r = this.ratio;
    const f = (H / 2) / Math.tan((fovDeg / 2) * DEG);  // pixels per unit tangent
    const cx = W / 2, cy = H / 2;
    g.clearRect(0, 0, W, H);
    g.lineWidth = 2 * r;
    g.font = `${Math.round(15 * r)}px ui-monospace, Consolas, monospace`;
    g.textBaseline = 'middle';

    // horizon and pitch ladder, rotated with the bank
    g.save();
    g.translate(cx, cy);
    g.rotate(-s.roll_deg * DEG);
    g.strokeStyle = GREEN;
    g.fillStyle = GREEN;
    for (let L = -20; L <= 20; L += 5) {
      const y = -f * Math.tan((L - s.pitch_deg) * DEG);
      if (Math.abs(y) > H * 0.42) continue;
      const half = L === 0 ? W * 0.45 : 60 * r;
      g.setLineDash(L < 0 ? [8 * r, 6 * r] : []);
      g.beginPath();
      g.moveTo(-half, y);
      g.lineTo(L === 0 ? half : -22 * r, y);
      if (L !== 0) {
        g.moveTo(22 * r, y);
        g.lineTo(half, y);
        g.fillText(String(Math.abs(L)), half + 6 * r, y);
      }
      g.stroke();
    }
    g.setLineDash([]);
    // the flight path: where the aircraft is going, relative to where it points
    const drift = ((s.track_deg - s.heading_deg + 540) % 360) - 180;
    if (s.gs_kn > 30) {
      const x = f * Math.tan(drift * DEG), y = -f * Math.tan((s.gamma_deg - s.pitch_deg) * DEG);
      g.beginPath();
      g.arc(x, y, 7 * r, 0, 2 * Math.PI);
      g.moveTo(x - 18 * r, y);
      g.lineTo(x - 7 * r, y);
      g.moveTo(x + 7 * r, y);
      g.lineTo(x + 18 * r, y);
      g.moveTo(x, y - 7 * r);
      g.lineTo(x, y - 14 * r);
      g.stroke();
    }
    g.restore();

    // the aircraft's own reference, fixed
    g.strokeStyle = AMBER;
    g.lineWidth = 3 * r;
    g.beginPath();
    g.moveTo(cx - 70 * r, cy);
    g.lineTo(cx - 25 * r, cy);
    g.lineTo(cx - 25 * r, cy + 10 * r);
    g.moveTo(cx + 70 * r, cy);
    g.lineTo(cx + 25 * r, cy);
    g.lineTo(cx + 25 * r, cy + 10 * r);
    g.stroke();
    g.lineWidth = 2 * r;

    // speed, altitude, heading, radio height
    const box = (x, y, text, align, colour = WHITE) => {
      g.textAlign = align;
      g.fillStyle = 'rgba(0,0,0,0.45)';
      const w = g.measureText(text).width + 12 * r;
      g.fillRect(align === 'right' ? x - w : align === 'center' ? x - w / 2 : x, y - 12 * r, w, 24 * r);
      g.fillStyle = colour;
      g.fillText(text, align === 'right' ? x - 6 * r : align === 'center' ? x : x + 6 * r, y);
    };
    box(cx - W * 0.3, cy, `${s.cas_kn.toFixed(0)} KT`, 'right');
    // the speed the gate holds the pilot to, once the core has one: VLS + 5, frozen at 1,000 ft
    if (Number.isFinite(s.vapp_kn)) box(cx - W * 0.3, cy + 28 * r, `${s.vapp_kn.toFixed(0)} VAPP`, 'right', '#ff40ff');
    box(cx + W * 0.3, cy, `${s.alt_ft.toFixed(0)} FT`, 'left');
    box(cx + W * 0.3, cy + 28 * r, `${s.vs_fpm >= 0 ? '+' : ''}${(s.vs_fpm / 100).toFixed(0)} V/S`, 'left');
    if (s.ra_ft < 2500) box(cx, cy + H * 0.22, `${s.ra_ft.toFixed(0)}`, 'center', s.ra_ft < 400 ? AMBER : GREEN);
    box(cx, H - 28 * r, `HDG ${String(Math.round(s.heading_deg) % 360).padStart(3, '0')}`, 'center');

    // localizer below, glideslope right: two dots each way, and each beam's diamond where the beam lies
    // from the aircraft (core.h: + right, + up), so flying toward the diamond centres it
    const dot = 22 * r;
    const clampDots = (v) => Math.max(-2.5, Math.min(2.5, v));
    const diamond = (x, y) => {
      g.beginPath();
      g.moveTo(x, y - 7 * r);
      g.lineTo(x + 7 * r, y);
      g.lineTo(x, y + 7 * r);
      g.lineTo(x - 7 * r, y);
      g.fill();
    };
    const scales = [
      { valid: ils && ils.loc != null, at: (k) => [cx + k * dot, H * 0.82], mark: () => diamond(cx + clampDots(ils.loc) * dot, H * 0.82),
        label: () => g.fillText('LOC —', cx, H * 0.82 + 18 * r) },
      { valid: ils && ils.gs != null, at: (k) => [cx + W * 0.22, cy - k * dot], mark: () => diamond(cx + W * 0.22, cy - clampDots(ils.gs) * dot),
        label: () => g.fillText('G/S —', cx + W * 0.22, cy + 2.8 * dot) },
    ];
    g.textAlign = 'center';
    for (const scale of scales) {
      g.strokeStyle = scale.valid ? WHITE : DIM;
      g.fillStyle = scale.valid ? WHITE : DIM;
      for (let k = -2; k <= 2; ++k) {
        if (!k) continue;
        const [x, y] = scale.at(k);
        g.beginPath();
        g.arc(x, y, 3 * r, 0, 2 * Math.PI);
        g.stroke();
      }
      if (scale.valid) {
        g.fillStyle = '#ff40ff';
        scale.mark();
      } else {
        scale.label();
      }
    }

    // flaps and gear, bottom right
    g.textAlign = 'right';
    g.fillStyle = WHITE;
    g.fillText(`FLAPS ${FLAPS[c.flapLever]}  ${s.flap_deg.toFixed(0)}°`, W - 14 * r, H - 52 * r);
    const locked = s.gear_pos >= 0.999, up = s.gear_pos <= 0.001;
    g.fillStyle = locked ? GREEN : up ? DIM : AMBER;
    g.fillText(locked ? 'LDG GEAR DN' : up ? 'GEAR UP' : 'GEAR IN TRANSIT', W - 14 * r, H - 28 * r);
  }
}
