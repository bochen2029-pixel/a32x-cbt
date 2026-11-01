/**
 * Drill setups: the state a trainee is handed before a procedure starts.
 *
 * These were duplicated between the page and the tests, which is a reliability problem — a drill
 * that starts from a different aircraft in the browser than in the test is not tested. One
 * definition, used by both.
 */

import type { Session } from '../session/session.ts';

export type SetupId = 'cold' | 'apu' | 'engines';

/** Run the model forward until `done` or `limit` seconds have passed. */
function until(s: Session, limitSec: number, done: () => boolean): void {
  const n = Math.round(limitSec / s.clock.dt);
  for (let i = 0; i < n && !done(); i++) s.step(s.clock.dt);
}

function run(s: Session, seconds: number): void {
  const n = Math.round(seconds / s.clock.dt);
  for (let i = 0; i < n; i++) s.step(s.clock.dt);
}

export function applySetup(s: Session, id: SetupId): void {
  const d = s.d;

  switch (id) {
    case 'cold':
      return;

    case 'apu':
      d.set('sw.bat1', true);
      d.set('sw.bat2', true);
      run(s, 1);
      d.set('sw.apuMaster', true);
      d.set('sw.apuStart', true);
      until(s, 40, () => d.bool('sys.apuRunning'));
      return;

    case 'engines':
      applySetup(s, 'apu');
      d.set('sw.extPwr', true);
      d.set('sw.busTie', true);
      d.set('sw.apuBleed', true);
      d.set('sw.xbleed', true); // the APU feeds the left duct; the crossbleed carries it right
      d.set('sw.fuelPumpL1', true);
      d.set('sw.fuelPumpR1', true);
      d.set('sw.fuelEng1LpValve', true);
      d.set('sw.fuelEng2LpValve', true);
      run(s, 1);

      for (const n of [1, 2] as const) {
        d.set(`sw.eng${n}Start`, 1);
        until(s, 40, () => d.num(`eng${n}.n2`) >= 17);
        d.set(`sw.eng${n}Master`, true);
        until(s, 40, () => d.bool(`sys.eng${n}Running`));
      }
      return;
  }
}
