// The tour on the page: a TOUR button (and the 0 key) that flies the whole loop by tour-plan.js's stages,
// with a caption for each, setting the time warp and the view as it goes. It gives commands the way the
// buttons do, through the page's own dispatcher; any command from anyone else ends it, so whoever is
// watching can take over at any moment. GPLv3.

import { snapshot, tourStep } from './tour-plan.js';
import { PLACE } from './walk-core.js';

const CSS = `
#tour-caption { position: fixed; left: 50%; transform: translateX(-50%); top: calc(env(safe-area-inset-top, 0px) + 76px);
  max-width: min(640px, calc(100vw - 32px)); padding: 10px 14px; border-radius: 6px; background: rgba(8, 12, 18, 0.72);
  color: #e8eef6; font: 14px/1.4 system-ui, sans-serif; pointer-events: none; opacity: 0; transition: opacity 0.4s; z-index: 5; }
#tour-caption.shown { opacity: 1; }
#tour-caption b { display: block; font: 600 11px/1.6 system-ui, sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: #9fc4ff; }
#buttons button[data-cmd="tour"][aria-pressed="true"] { border-color: #9fc4ff; color: #9fc4ff; }
`;

// commands that only change what is shown: they leave the tour running
const LOOKING = new Set(['help', 'map', 'moon', 'sound', 'view']);

export const tour = {
  name: 'tour',
  on: false,
  stage: null,
  memory: null,
  issuing: false,
  wall: 0,
  userView: false,

  init(ctx) {
    this.ctx = ctx;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.box = document.createElement('div');
    this.box.id = 'tour-caption';
    this.box.setAttribute('aria-live', 'polite');
    document.body.appendChild(this.box);
    const grid = document.getElementById('buttons');
    if (grid) {
      const b = document.createElement('button');
      b.type = 'button';
      b.id = 'btn-tour';
      b.dataset.cmd = 'tour';
      b.textContent = 'TOUR';
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', (e) => { ctx.input.commands.push('tour'); e.stopPropagation(); });
      grid.insertBefore(b, grid.firstChild);
      this.button = b;
    }
    window.addEventListener('keydown', (e) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || (e.target && e.target.tagName === 'INPUT')) return;
      if (e.key === '0') ctx.input.commands.push('tour');
    });
  },

  start(ctx) {
    Object.assign(this, { on: true, stage: 'runway', memory: {}, wall: 0, userView: false });
    if (ctx.walk && ctx.walk.v.on) ctx.walk.stop('The tour starts on the runway');
    this.button?.setAttribute('aria-pressed', 'true');
    ctx.say('The tour: the whole loop, flown by the crew. Any key or button takes over');
  },

  stop(ctx, why) {
    this.on = false;
    this.button?.setAttribute('aria-pressed', 'false');
    this.box.classList.remove('shown');
    if (why) ctx.say(why);
  },

  // Every command passes here first (FEATURES puts the tour first): TOUR toggles it; anyone else's command,
  // other than one that only changes what is shown, ends it and then goes on to do what it does.
  command(c, ctx) {
    if (c === 'tour') {
      if (this.on) this.stop(ctx, 'The tour is over: your controls as they stand');
      else this.start(ctx);
      return true;
    }
    if (this.on && !this.issuing) {
      if (c === 'view') this.userView = true;
      if (!LOOKING.has(c)) this.stop(ctx, null);
    }
    return false;
  },

  give(ctx, c) {
    this.issuing = true;
    try { ctx.command(c); } finally { this.issuing = false; }
  },

  update(ctx) {
    if (!this.on) return;
    this.wall += Math.min(0.25, ctx.dt || 0);
    const walking = !!(ctx.walk && ctx.walk.v.on);
    const out = tourStep(this.stage, this.memory, snapshot(ctx.core, walking, this.wall));
    // back aboard before the flight's commands: while walking, the walk holds them
    if (out.walk === 'stop' && walking) ctx.walk.stop('Back aboard');
    for (const c of out.commands) this.give(ctx, c);
    if (out.walk === 'hatch') this.give(ctx, 'walk');
    else if (out.walk === 'floor' && ctx.walk) ctx.walk.start(PLACE.floor);
    if (out.warp) ctx.state.warp = out.warp;
    if (out.view && !this.userView) {
      const i = ctx.VIEWS.indexOf(out.view);
      if (i >= 0) ctx.state.view = i;
    }
    if (out.caption) {
      this.box.innerHTML = '';
      const b = document.createElement('b');
      b.textContent = out.caption.title;
      this.box.append(b, document.createTextNode(out.caption.text));
      this.box.classList.add('shown');
    }
    this.stage = out.stage;
    this.memory = out.memory;
    if (out.ended) this.stop(ctx, out.caption && out.stage !== 'done' ? out.caption.text : 'The tour is over');
  },
};
