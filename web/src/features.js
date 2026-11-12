// The page's parts beyond the flight itself, each a module of its own with the same few hooks, so each
// grows without touching the others' files. GPLv3.
//
// A feature is an object with any of:
//   init(ctx)            once, when the scene is built
//   command(name, ctx)   a page command, from a key or a button; true if it took it
//   update(ctx)          each frame, after the core has stepped and the camera is placed, before drawing
//   hud(ctx)             more readout lines: an array of strings
//   status(ctx)          { line, hint } to stand for the status line, or null
//   owns(ctx)            true while it draws the whole frame itself (the walk)
//   frame(ctx, dt)       then, each frame: step and draw it
// A feature imports three.js itself (so the page's bundle keeps only what is used).
// ctx is main.js's: the core and its readouts (ctx.s), the renderer, the camera, the two scenes (near,
// far), the craft, the ring, the airport, the Earth, the input, say(text), the page's state, and each
// frame the camera's place (ctx.cam, site frame, doubles), rel(sitePoint) -> three.js offset from it,
// the body axes (ctx.axes), the craft's place (ctx.P), now and dt.

import { dock } from './dock-view.js';
import { map } from './map.js';
import { ret } from './return-view.js';
import { sky } from './sky.js';
import { sound } from './sound.js';
import { walk } from './walk-view.js';

export const FEATURES = [sky, dock, ret, walk, map, sound];
