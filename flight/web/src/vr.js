// VR for a headset (WebXR), the operator's ask: a button at the page's bottom right that puts the view in a headset in
// true stereo, each eye drawn from its own place (three.js's WebXR; the eyes' separation is the headset's own), the
// head's pose about wherever the page's camera stands: the flight deck's left seat when VR starts, the number keys
// still changing the camera. For a Quest 2 or 3 in its own browser, or in Chrome or Edge on a PC with Quest Link,
// whose joystick and keyboard then fly as ever. Nothing of it runs until VR is entered, and the page is as it was once
// it is left. Untested on a headset: none was here when it was written. GPLv3.

// Why VR cannot be entered here, or '' when it can: WebXR is given only to pages served securely (https, as the live
// simulator is), and a browser says whether a headset is there (isSessionSupported).
export async function vrRefusal(nav = globalThis.navigator) {
  if (!nav?.xr?.isSessionSupported) {
    return 'VR needs WebXR, which a browser gives only to a page served securely: open flightsim.bochen.xyz in a ' +
      'Quest\'s own browser, or in Chrome or Edge on a PC with Quest Link running';
  }
  try {
    if (await nav.xr.isSessionSupported('immersive-vr')) return '';
    return 'no VR headset here: open the page in a Quest\'s own browser, or start Quest Link with Chrome or Edge';
  } catch (e) {
    return `VR is not to be had here: ${e.message}`;
  }
}

// The session a headset is asked for: immersive VR, seated, so that where the headset starts is where the page's
// camera stands (the 'local' reference space every immersive session has).
export const VR_SESSION = { mode: 'immersive-vr', options: {}, space: 'local' };
