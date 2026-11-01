// A fixed-step clock under a display-rate loop. GPLv3.
//
// The flight core steps at exactly 50 Hz, 20 ms a step, whatever the display does. Each frame the wall
// time decides how many steps are due; a step is never stretched. When the page stalls, the debt is
// paid back up to maxCatchUp steps in one frame and the rest is dropped, and counted: a rate law fed a
// 400 ms step would fly a different aeroplane.

export class Clock {
  constructor(stepMs = 20, maxCatchUp = 5) {
    if (!(stepMs > 0) || !(maxCatchUp >= 1)) throw new RangeError('stepMs > 0 and maxCatchUp >= 1');
    this.stepMs = stepMs;
    this.maxCatchUp = maxCatchUp;
    this.owed = 0;      // wall time not yet turned into steps, ms
    this.steps = 0;     // steps handed out
    this.dropped = 0;   // steps given up for good
  }

  // Wall time since the last frame, in ms; returns the steps due now.
  advance(realMs) {
    if (!Number.isFinite(realMs) || realMs < 0) throw new RangeError('realMs must be finite and >= 0');
    this.owed += realMs;
    let due = Math.floor(this.owed / this.stepMs);
    if (due > this.maxCatchUp) {
      this.dropped += due - this.maxCatchUp;
      this.owed -= (due - this.maxCatchUp) * this.stepMs;
      due = this.maxCatchUp;
    }
    this.owed -= due * this.stepMs;
    this.steps += due;
    return due;
  }
}
