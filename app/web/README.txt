A32X CBT - an A320 systems trainer

Unofficial. Not affiliated with Airbus, FlyByWire Simulations or Aerowinx. Not for type training.

RUN IT
  Double-click index.html. It opens in your web browser and runs from this folder: no install,
  no server, no internet connection. Tested in Google Chrome and Microsoft Edge on Windows 11.
  Keep the files together - index.html needs app.js beside it.

USE IT
  Pick a drill along the top and work the overhead panel by clicking its switches. The ECAM beside
  it is generated from the aircraft's state. The step list grades you in procedure order: each
  step must be done in its turn and inside its time window, or it is marked MISS. "restart" starts
  the drill again, "freeze" stops time, and the instructor menu injects a fault.

WHAT IT IS NOT
  Nothing flies: there are no aerodynamics and no flight laws. The systems are plausible
  abstractions, not Airbus data. Do not use it to learn or check procedures for a real aircraft.

FILES
  index.html   the page - open this one
  app.js       the trainer, with its content built in
  data/        that content (panel, ECAM messages, ECAM pages) as readable JSON; the page does
               not read these files, they are here to be looked at
  LICENSE      MIT; it covers everything in this folder
  README.txt   this file

ATTRIBUTION
  The trainer's architecture - a state dictionary with declared ranges, a fixed-step scheduler, a
  causal dispatch order, controls described as data, procedures graded in order with a reason for
  every step - comes from a design study of Aerowinx Precision Simulator (PSX), a commercial
  747-400 systems simulator by Hardy Heinlin. Only design was taken, re-expressed in this
  project's own words and code. No PSX code is included. Aerowinx is not affiliated with this
  project and does not endorse it.

  "Airbus" and "A320" belong to their owners. This build contains no FlyByWire A32NX code.
