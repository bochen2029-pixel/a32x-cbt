// dock-view.js — docking at the hub, on the page. A stub: its command says it is not built yet. GPLv3.

export const dock = {
  name: 'dock',
  command(c, ctx) {
    if (c !== 'dock') return false;
    ctx.say('Docking is not built yet');
    return true;
  },
};
