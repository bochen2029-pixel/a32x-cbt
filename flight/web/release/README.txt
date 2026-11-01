A32X CBT flight simulator @VERSION@, for 64-bit Windows

Unofficial. Not affiliated with Airbus, FlyByWire Simulations or Aerowinx. Not for type training.

An A320 fly-by-wire simulator that runs in a web browser. The FlyByWire A32NX flight-control computers
(two ELACs, three SECs, two FACs and two FCDCs, unmodified) run at 50 Hz and fly a JSBSim airframe of
ours, fitted to 57 cited A320 numbers, from runway 17C at Dallas/Fort Worth (KDFW). A systems trainer
comes with it.

RUN IT
  Unzip the whole folder anywhere and double-click A32X.exe. It opens the simulator in Microsoft Edge,
  in a window of its own (Edge comes with Windows 10 and 11), or in your default browser if there is no
  Edge. Nothing is installed, no administrator is needed, and nothing is fetched from the internet.
  You can also open web\index.html in Edge or Chrome yourself. Other browsers have not been tried.

  A32X.exe is not code-signed, so Windows may say it protected your PC from an unrecognised app. Choose
  "More info", then "Run anyway", or open web\index.html instead.

FLY IT
  A joystick or gamepad, through the browser: a standard gamepad flies straight away, and any other
  device is mapped from your own hands (M) and calibrated (C), both remembered per device. Press one
  of its buttons first: until then the browser keeps it from the page.
  The keyboard is the fallback (H lists the keys): the arrows for the stick, Z X rudder, PgUp PgDn the
  thrust levers (CL, MCT and TOGA detents), R F flaps, G gear, B brakes, P parking brake, S speedbrake,
  A ground spoilers, T Y U the rudder trim and its reset.
  Options go after the page's address in the browser: web\index.html?crew=script lets the scripted
  crew fly, ?airframe=737 flies JSBSim's 737 in place of our A320, ?time=night or ?time=day sets the
  light.

  What it is not, yet: there are no cockpit displays, no autopilot and no FMS. The view is drawn as a
  1980s full-flight simulator drew it, more plainly where there is no graphics card. The airframe is
  fitted to public numbers, not to Airbus's data.

THE SYSTEMS TRAINER
  trainer\index.html: systems, ECAM, flows and graded drills, as its own zip ships it. Double-click it,
  or run "A32X.exe --trainer". trainer\README.txt says how to use it.

WHAT IS IN THIS FOLDER
  A32X.exe      the launcher: it opens web\index.html
  web\          the simulator: index.html, flight.js (the page, with three.js) and core.js (the flight
                computers and the airframe, as WebAssembly)
  trainer\      the systems trainer, MIT
  notices\      the licence or notice of everything else this build contains, one file each
  LICENSE.txt   the GNU General Public License, version 3
  README.txt    this file

LICENCE AND SOURCE
  This program is free software under the GNU General Public License, version 3 (LICENSE.txt), and it
  comes with NO WARRANTY. It contains FlyByWire A32NX (GPLv3), JSBSim (LGPL-2.1), Emscripten's runtime
  with musl, libc++ and dlmalloc, and three.js (MIT): notices\ holds each one's licence. The trainer is
  MIT (trainer\LICENSE).

  Its Corresponding Source is @SOURCE@.zip, offered from the same place as this zip:
  our source and build scripts at the commit this was built from, and the exact A32NX and JSBSim
  sources compiled into web\core.js. Its README.txt says how to build every file here from it.

  Built from commit @COMMIT@ (@COMMIT_DATE@),
  with A32NX @A32NX_SHORT@, JSBSim @JSBSIM_TAG@ (@JSBSIM_SHORT@), Emscripten @EMSCRIPTEN@ and three.js @THREE_VERSION@.

ATTRIBUTION
  The runways come from OurAirports and KDFW's buildings from the FAA's airport diagram, both public
  domain (notices\airport-data.txt). Nothing here is fit for navigation.
  "Airbus", "A320" and "A32NX" belong to their owners. This is an unofficial training aid, not
  affiliated with Airbus, FlyByWire Simulations or Aerowinx, and not suitable for type training.
