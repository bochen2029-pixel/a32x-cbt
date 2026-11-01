// The A32NX flight control computers wired as the aircraft wires them, with no simulator: the world
// adapter that replaces FlyByWireInterface.cpp's updateElac / updateSec / updateFac / updateFcdc /
// updateServoSolenoidStatus. GPLv3.
//
// Two upstream behaviours are reproduced on purpose:
//
// - Staleness. Each computer reads the others' outputs as they stand when its turn comes, in the
//   driver's order ELAC 1, 2 -> SEC 1, 2, 3 -> FAC 1, 2 -> FCDC 1, 2. So ELAC 1 sees ELAC 2 one tick
//   late and ELAC 2 sees ELAC 1 the same tick, and every ELAC sees SEC, FAC and FCDC one tick late —
//   as on the aircraft, and as the arbitration expects (contract/12-bus-population.md).
// - Zero-initialised computers. Elac, Sec, Fac and Fcdc leave most of their monitoring state
//   uninitialised and depend on MSFS constructing them in static storage, which C++ zero-fills. The
//   set therefore exists exactly once, as a function-local static.
//
// Where this adapter departs from the driver, the departure is named where it happens.

#pragma once

#include "elac/Elac.h"
#include "fac/Fac.h"
#include "fcdc/Fcdc.h"
#include "sec/Sec.h"
#include "world.h"

// What each computer last transmitted: the staging the driver keeps between computers.
struct Transmitted {
  base_elac_discrete_outputs elacDiscrete[2] = {};
  base_elac_analog_outputs elacAnalog[2] = {};
  base_elac_out_bus elacBus[2] = {};
  base_sec_discrete_outputs secDiscrete[3] = {};
  base_sec_analog_outputs secAnalog[3] = {};
  base_sec_out_bus secBus[3] = {};
  base_fac_discrete_outputs facDiscrete[2] = {};
  base_fac_analog_outputs facAnalog[2] = {};
  base_fac_bus facBus[2] = {};
  FcdcDiscreteOutputs fcdcDiscrete[2] = {};
  base_fcdc_bus fcdcBus[2] = {};
};

class Efcs {
 public:
  static Efcs& instance();

  // One tick of every computer, in the driver's order, against the world as it stands.
  void tick(const World& world, double dt);

  // What the servos are told: FlyByWireInterface::updateServoSolenoidStatus.
  Orders orders() const;

  const Transmitted& transmitted() const { return tx_; }

  Efcs(const Efcs&) = delete;
  Efcs& operator=(const Efcs&) = delete;

 private:
  Efcs();

  void updateElac(const World& w, int i, double dt);
  void updateSec(const World& w, int i, double dt);
  void updateFac(const World& w, int i, double dt);
  void updateFcdc(const World& w, int i, double dt);

  Elac elacs_[2];
  Sec secs_[3];
  Fac facs_[2];
  Fcdc fcdcs_[2];
  Transmitted tx_;
  double time_ = 0;
};
