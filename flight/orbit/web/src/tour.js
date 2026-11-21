// The tour on the page: a TOUR button (and the 0 key) that flies the whole loop by tour-plan.js's stages,
// with a caption for each, setting the time warp and the view as it goes. It gives commands the way the
// buttons do, through the page's own dispatcher; any command from anyone else ends it, so whoever is
// watching can take over at any moment. GPLv3.

import { ret } from './return-view.js';
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
const LOOKING = new Set(['help', 'map', 'moon', 'sound', 'view', 'fd', 'quality']);
// The keys that fly the craft or walk the walker, held rather than pressed (input.js, walk-view.js): they are no
// command, but a hand on them takes over as a command does. Looking about (a drag, the wheel) does not, nor do
// Shift and Ctrl alone, which also change other keys (shift-N, the map's next view).
export const HAND_KEYS = new Set(['w', 'a', 's', 'd', 'q', 'e', 'i', 'k', 'j', 'l', 'u', 'm', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

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
    this.touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
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
      b.className = 'quick';   // on a phone, among the few buttons shown without MORE
      const first = grid.querySelector('.group') || grid;   // first in the flight's group
      first.insertBefore(b, first.firstChild);
      this.button = b;
    }
    window.addEventListener('keydown', (e) => {
      if (e.repeat || (e.target && e.target.tagName === 'INPUT')) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (this.on && HAND_KEYS.has(k)) this.takeOver(ctx, null);
      else if (e.key === '0' && !(e.ctrlKey || e.metaKey || e.altKey)) ctx.input.commands.push('tour');
    });
    // the screen's stick, under a thumb, is a hand on the controls too
    const stick = document.getElementById('stick');
    if (stick) stick.addEventListener('pointerdown', () => { if (this.on) this.takeOver(ctx, null); });
  },

  // Someone else's command, or a hand on the keys: the tour ends, time runs at one to one again (the tour may
  // have left it at a hundred, and a pilot taking over wants it real; TIME + and − step from where it was), and
  // the command goes on to do what it does. A hand on the keys gives no command, so the tour says what now.
  takeOver(ctx, c) {
    const walking = !!(ctx.walk && ctx.walk.v.on);
    const crew = Math.round(ctx.core.s.auto) !== ctx.AUTO.off;
    this.stop(ctx, walking ? 'The tour is over: the walk is yours'
      : crew ? `The tour is over: the crew flies on; ${this.touch ? 'CREW' : 'Space'} takes the controls` : 'The tour is over: your controls');
    if (c !== 'faster' && c !== 'slower') { ctx.state.warp = 1; ctx.state.debt = 0; }
  },

  // The tour keeps its own frame clock: the page's update hooks are not every frame's (the walk skips them
  // where the sky cannot be seen, in the hub's lobby), and the tour must not stop for that.
  start(ctx) {
    Object.assign(this, { on: true, stage: 'runway', memory: {}, wall: 0, userView: false, last: null, intro: true });
    const loop = (now) => {
      if (!this.on) return;
      const dt = this.last === null ? 0 : Math.min(0.25, (now - this.last) / 1000);
      this.last = now;
      this.tick(ctx, dt);
      if (this.on) this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    if (ctx.walk && ctx.walk.v.on) ctx.walk.stop('The tour starts on the runway');
    this.button?.setAttribute('aria-pressed', 'true');
    document.getElementById('help')?.classList.remove('shown');   // the view is the tour's; H shows the help again
    // what the tour is, said once its first commands (the start on the runway) have said theirs (tick)
  },

  stop(ctx, why) {
    this.on = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.button?.setAttribute('aria-pressed', 'false');
    this.box.classList.remove('shown');
    delete this.box.dataset.title;
    if (why) ctx.say(why);
  },

  // Every command passes here first (FEATURES puts the tour first): TOUR toggles it; anyone else's command,
  // other than one that only changes what is shown, ends it and then goes on to do what it does.
  command(c, ctx) {
    if (c === 'tour') {
      if (this.on) this.takeOver(ctx, c);
      else this.start(ctx);
      return true;
    }
    if (this.on && !this.issuing) {
      if (c === 'view') this.userView = true;
      if (!LOOKING.has(c)) this.takeOver(ctx, c);   // then the command does what it does, and says so
    }
    return false;
  },

  give(ctx, c) {
    this.issuing = true;
    try { ctx.command(c); } finally { this.issuing = false; }
  },

  tick(ctx, dt) {
    if (!this.on) return;
    this.wall += dt;
    const walking = !!(ctx.walk && ctx.walk.v.on);
    const out = tourStep(this.stage, this.memory, snapshot(ctx.core, walking, this.wall, { skipping: ret.skipping, touch: this.touch }));
    // back aboard before the flight's commands: while walking, the walk holds them
    if (out.walk === 'stop' && walking) ctx.walk.stop('Back aboard');
    for (const c of out.commands) this.give(ctx, c);
    if (this.intro) {
      this.intro = false;
      ctx.say(`The tour: the whole loop, flown by the crew. Any key or button takes over${this.touch ? '' : '; 0 ends it'}`);
    }
    if (out.walk === 'hatch') this.give(ctx, 'walk');
    else if (out.walk === 'floor' && ctx.walk) ctx.walk.start(PLACE.floor);
    if (out.warp) ctx.state.warp = out.warp;
    if (out.view && !this.userView) {
      const i = ctx.VIEWS.indexOf(out.view);
      if (i >= 0) ctx.state.view = i;
    }
    if (out.caption) {
      // a soft tone as each part's caption first shows; no words spoken
      if (out.caption.title !== this.box.dataset.title && ctx.sound && ctx.sound.cue) ctx.sound.cue('chime');
      this.box.dataset.title = out.caption.title;
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
