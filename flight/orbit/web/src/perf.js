// The frame meter: ` (the backquote key) or ?perf shows the frame rate, the frame time's mean, 95th
// percentile and worst over the last two seconds, the tier, the picture's size, and what the renderer drew
// in a frame. It is how a person measures this page on their own machine and graphics card: everything
// here was tested in software rendering, which says nothing of real speed. It keeps its own frame clock,
// so it counts every frame, the walk's too. GPLv3.

import { frameStats, perfLines } from './perf-math.js';

const CSS = `
#perf { position: fixed; left: calc(env(safe-area-inset-left, 0px) + 12px); top: calc(env(safe-area-inset-top, 0px) + 70px);
  padding: 6px 9px; border-radius: 5px; background: rgba(8, 12, 18, 0.78); color: #cfe3ff;
  font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre-wrap; pointer-events: none; z-index: 6;
  max-width: calc(100vw - 24px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)); box-sizing: border-box; }
`;

export const perf = {
  name: 'perf',
  shown: false,
  intervals: [],
  last: null,
  drawnAt: 0,

  init(ctx) {
    this.ctx = ctx;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.box = document.createElement('div');
    this.box.id = 'perf';
    this.box.hidden = true;
    document.body.appendChild(this.box);
    window.addEventListener('keydown', (e) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || (e.target && e.target.tagName === 'INPUT')) return;
      if (e.key === '`') this.show(!this.shown);
    });
    const loop = (now) => {
      if (this.last !== null) {
        this.intervals.push(now - this.last);
        while (this.intervals.length > 240) this.intervals.shift();
      }
      this.last = now;
      if (window.orbitSketch && !window.orbitSketch.perf) window.orbitSketch.perf = () => this.stats();   // for tests: main.js sets orbitSketch after the features' init
      if (this.shown && now - this.drawnAt > 250) { this.drawnAt = now; this.draw(); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    if (new URLSearchParams(location.search).has('perf')) this.show(true);
  },

  show(on) {
    this.shown = on;
    this.box.hidden = !on;
    if (on) this.draw();
  },

  // the last two seconds of frames, and what the last frame drew
  stats() {
    const now = this.last ?? 0;
    let t = 0, k = this.intervals.length;
    while (k > 0 && t < 2000) t += this.intervals[--k];
    const st = frameStats(this.intervals.slice(k));
    const r = this.ctx.renderer, q = (window.orbitSketch && window.orbitSketch.quality) || {};
    const v2 = { x: 0, y: 0, set(x, y) { this.x = x; this.y = y; return this; }, floor() { this.x = Math.floor(this.x); this.y = Math.floor(this.y); return this; } };   // as a Vector2 is used there
    const size = r.getDrawingBufferSize ? r.getDrawingBufferSize(v2) : v2;
    return {
      ...st, at: now,
      tier: q.tier || '?', chosen: q.choice || 'auto',
      calls: r.info.render.calls, triangles: r.info.render.triangles,
      width: size.x, height: size.y, ratio: r.getPixelRatio ? r.getPixelRatio() : 1,
      slices: (this.ctx.state && this.ctx.state.slices) || 1,
    };
  },

  draw() {
    const s = this.stats();
    this.box.textContent = perfLines(s, s).join('\n');
    // on a touch screen the readouts stand at the top, where the meter would cover them: it goes under them
    const r = document.getElementById('readouts')?.getBoundingClientRect();
    this.box.style.top = r && r.height > 0 && r.top < window.innerHeight / 3 && r.left < 100 ? `${Math.round(r.bottom + 8)}px` : '';
  },
};
