// The keys as a person presses them: a focused button keeps its own Enter, Shift held (for +, or from habit) does
// not stop the time keys, Ctrl is the browser's and not the throttle's, and the help has a list for a touch
// screen. MIT.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HELP, HELP_TOUCH, Input, helpHtml } from '../src/input.js';
import { readFileSync } from 'node:fs';

// Input listens on the window and the canvas; neither is needed to press its keys here.
const quiet = { addEventListener() {} };
globalThis.window ??= quiet;

function press(input, key, more = {}) {
  let prevented = false;
  const e = { key, code: more.code, target: more.target || { tagName: 'CANVAS' }, repeat: false, shiftKey: !!more.shift, ctrlKey: !!more.ctrl, metaKey: false, altKey: false,
    preventDefault() { prevented = true; } };
  input.key(e, true);
  input.key({ ...e, preventDefault() {} }, false);
  const c = input.commands;
  input.commands = [];
  return { commands: c, prevented };
}

test('Enter and Space on a button with the keyboard\'s focus are the button\'s; elsewhere they are the page\'s', () => {
  const input = new Input(quiet);
  assert.deepEqual(press(input, 'Enter').commands, ['walk']);
  assert.deepEqual(press(input, ' ').commands, ['crew']);
  // Tab to VIEW and press Enter: the button's click, not the walk as well (a mouse's click leaves no focus, hud.js)
  assert.deepEqual(press(input, 'Enter', { target: { tagName: 'BUTTON' } }).commands, []);
  assert.deepEqual(press(input, ' ', { target: { tagName: 'BUTTON' } }).commands, []);
  assert.deepEqual(press(input, 'g', { target: { tagName: 'BUTTON' } }).commands, ['gear']);
});

test('with Shift held (for +, or from habit), the time and hold keys still work', () => {
  const input = new Input(quiet);
  assert.deepEqual(press(input, '>', { code: 'Period', shift: true }).commands, ['faster']);
  assert.deepEqual(press(input, '<', { code: 'Comma', shift: true }).commands, ['slower']);
  assert.deepEqual(press(input, '%', { code: 'Digit5', shift: true }).commands, ['sas4']);
  assert.deepEqual(press(input, '*', { code: 'Digit8', shift: true }).commands, ['fd']);
  assert.deepEqual(press(input, 'N', { code: 'KeyN', shift: true }).commands, []);   // shift-N is the map's own
  assert.deepEqual(press(input, ';', { code: 'Comma' }).commands, []);               // a layout's own key, unshifted, is left alone
});

test('Ctrl is the browser\'s: the page takes no shortcut from it, and flies nothing with it', () => {
  const input = new Input(quiet);
  assert.equal(press(input, 's', { ctrl: true }).prevented, false);   // Ctrl-S is the browser's again: Ctrl flies nothing
  assert.equal(press(input, 'd', { ctrl: true }).prevented, false);
  assert.equal(press(input, 's').prevented, false);
  assert.ok(input.held.size === 0, 'every key let go is let go');
  assert.doesNotMatch(HELP.map(([k, v]) => `${k} ${v}`).join(' '), /Ctrl/, 'the help offers no Ctrl key');
});

test('the help has a list for a touch screen, by its buttons, with no keyboard\'s keys in it', () => {
  const keys = HELP_TOUCH.map(([k]) => k).join(' ');
  for (const b of ['TOUR', 'CREW', 'TO ORBIT', 'MORE', 'DOCK', 'WALK', 'RETURN', 'HOLD', 'BRAKES', 'MAP', 'RESTART']) assert.match(keys, new RegExp(b));
  assert.doesNotMatch(keys, /Shift|Ctrl|Space|Backspace/);
  assert.ok(HELP.length > 20);
  assert.equal(helpHtml([['<b>', 'a & b']]), '<div><b>&lt;b&gt;</b><span>a &amp; b</span></div>');
});

test('the throttle on = and − (and +), held; Shift and Ctrl move it no more, so no flying hand rests on Ctrl', () => {
  const input = new Input(quiet);
  const hold = (key, seconds) => {
    input.key({ key, code: '', target: { tagName: 'CANVAS' }, repeat: false, shiftKey: key === '+', ctrlKey: false, metaKey: false, altKey: false, preventDefault() {} }, true);
    for (let i = 0; i < seconds * 10; i++) input.poll(0.1);
    input.key({ key, code: '', target: { tagName: 'CANVAS' }, repeat: false, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, preventDefault() {} }, false);
    input.commands = [];
  };
  input.hands.throttle = 0.5;
  hold('=', 0.5);
  assert.ok(Math.abs(input.hands.throttle - 0.8) < 1e-9, `= for half a second: ${input.hands.throttle}`);
  hold('-', 1);
  assert.ok(Math.abs(input.hands.throttle - 0.2) < 1e-9, `− for a second: ${input.hands.throttle}`);
  hold('+', 0.5);   // = with Shift held
  assert.ok(Math.abs(input.hands.throttle - 0.5) < 1e-9, `+ for half a second: ${input.hands.throttle}`);
  hold('Control', 1);
  assert.ok(Math.abs(input.hands.throttle - 0.5) < 1e-9, `Ctrl held a second moves nothing: ${input.hands.throttle}`);
  hold('Shift', 1);
  assert.ok(Math.abs(input.hands.throttle - 0.5) < 1e-9, `nor Shift: ${input.hands.throttle}`);
});

// tour.js imports three.js by way of the views, so its hand keys are read from its source, as written.
test('a hand on the throttle\'s keys ends the tour, as a hand on the stick\'s does; Shift and Ctrl alone do not', () => {
  const src = readFileSync(new URL('../src/tour.js', import.meta.url), 'utf8');
  const list = /HAND_KEYS = new Set\((\[[^\]]*\])\)/.exec(src);
  assert.ok(list, 'tour.js declares its hand keys');
  const hands = new Set(JSON.parse(list[1].replace(/'/g, '"')));
  for (const k of ['w', 's', 'a', 'd', 'q', 'e', 'ArrowUp', '=', '+', '-']) assert.ok(hands.has(k), `${k} takes over`);
  for (const k of ['Shift', 'Control']) assert.ok(!hands.has(k), `${k} alone does not`);
});
