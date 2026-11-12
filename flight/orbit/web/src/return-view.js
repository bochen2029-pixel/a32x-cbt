// return-view.js — the flight home, on the page. A stub: its command says it is not built yet. GPLv3.

export const ret = {
  name: 'ret',
  command(c, ctx) {
    if (c !== 'return') return false;
    ctx.say('The flight home is not built yet');
    return true;
  },
};
