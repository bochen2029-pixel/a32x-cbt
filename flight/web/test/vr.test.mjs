// VR's button says plainly why it cannot be had where it cannot: a page not served securely has no WebXR, a browser
// without a headset says so, and an error is passed on; where a headset is, nothing stands in the way. The session is
// immersive VR, seated. GPLv3.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VR_SESSION, vrRefusal } from '../src/vr.js';

const browser = (supported) => ({ xr: { isSessionSupported: async (mode) => (mode === 'immersive-vr' ? supported : false) } });

test("VR's button says why it cannot be had, and nothing where it can", async () => {
  assert.match(await vrRefusal({}), /served securely/, 'no WebXR: a page not served securely');
  assert.match(await vrRefusal(undefined), /served securely/);
  assert.match(await vrRefusal(browser(false)), /no VR headset here/, 'WebXR, but no headset');
  assert.equal(await vrRefusal(browser(true)), '', 'a headset: VR can be entered');
  const failing = { xr: { isSessionSupported: async () => { throw new Error('the runtime is not running'); } } };
  assert.match(await vrRefusal(failing), /not to be had here: the runtime is not running/);
});

test('the session asked for is immersive VR, seated where the page\'s camera stands', () => {
  assert.equal(VR_SESSION.mode, 'immersive-vr');
  assert.equal(VR_SESSION.space, 'local', 'every immersive session has it');
  assert.deepEqual(VR_SESSION.options, {}, 'nothing a headset might lack');
});
