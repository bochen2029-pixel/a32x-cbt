// walk-view.js — a walk inside the ring, on the page. A stub: its command says it is not built yet. GPLv3.

export const walk = {
  name: 'walk',
  command(c, ctx) {
    if (c !== 'walk') return false;
    ctx.say('The walk is not built yet');
    return true;
  },
};
