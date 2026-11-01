// The P7 gate's judge (ROADMAP.md, P7: how a hand-flown ILS is judged). An approach watched from 1,000 ft
// above the threshold to the stop: each band's worst and where it happened, then the touchdown and the
// rollout against the runway. The flight core keeps one and shows it every step, so the harness's
// --expect ils, the browser's debrief and a recording's replay all meet the same judge. GPLv3.

#pragma once

#include <cmath>
#include <string>
#include <vector>

class World;
struct Transmitted;

// The worst of a measure, and where it happened.
struct Worst {
  double value = NAN, at = NAN;
  void add(double v, double where) {
    if (std::isnan(value) || v > value) {
      value = v;
      at = where;
    }
  }
};

// One band of the verdict: what it asks, whether it can be judged yet, whether it held, what was seen.
struct Band {
  std::string name;
  bool judged = false;
  bool pass = false;
  std::string detail;
};

class ApproachJudge {
 public:
  // The world as it starts: whether there is an approach to judge, and on which runway.
  void begin(const World& w);
  // After each step: the world as it now stands, and what the computers transmitted for it.
  void observe(const World& w, const Transmitted& tx);

  // The bands in the roadmap's order: the stabilised window's, then the touchdown's and the rollout's.
  // A band is judged once nothing can change it; one that never could (no touchdown) fails.
  std::vector<Band> verdict() const;
  // The debrief: what was flown, a line a band, then the verdict.
  std::string debrief() const;

  bool active() const { return active_; }        // an approach start: there is an approach to judge
  bool inWindow() const { return inWindow_; }    // this step inside the window, 1,000 ft to 50 ft
  bool inBands() const { return inBands_; }      // and every window band held at it
  bool finished() const { return stopped_ || crashed_; }
  bool stable() const;                            // finished, and every band held

  // The approach speed the pilot is held to: on an airframe whose FAC computes its own speeds (the
  // A320), Airbus's Vapp, VLS + 5 kt, the FAC's VLS read until the window is entered and kept from
  // there; otherwise the scripted crew's 140 kt. The VLS the FAC transmits, or NaN.
  double vappKn() const { return vappKn_; }
  double vlsKn() const { return vlsKn_; }

  // What the turbulence case reads: the load factor's worst departure from one in the window, the
  // first touchdown, and the runway's half width.
  double windowSeconds() const { return windowTicks_ * kDt; }
  const Worst& loadDeviation() const { return loadDev_; }
  struct Touchdown {
    double at = NAN, sinkFpm = NAN, pitch = NAN, bank = NAN, cas = NAN, peakG = NAN;
    double pastM = NAN, offM = NAN;  // from the threshold, and from the centreline (+ right)
  };
  const Touchdown& touchdown() const { return touchdown_; }
  int touchdowns() const { return touchdowns_; }
  double runwayHalfWidthM() const { return halfWidthM_; }

 private:
  static constexpr double kDt = 0.02;
  bool active_ = false, inWindow_ = false, inBands_ = false;
  bool wasOnGround_ = true, seen_ = false;
  double lastAirborneVs_ = 0, now_ = 0;
  // the stabilised window
  long long windowTicks_ = 0;
  bool windowOver_ = false;
  Worst loc_, gs_, sink_, bank_, fast_, slow_, loadDev_;
  double unconfiguredAtFt_ = NAN;
  double vappKn_ = NAN, vlsKn_ = NAN;
  bool vappKept_ = false, vappFromFac_ = false;
  // the touchdown, the rollout, the stop
  Touchdown touchdown_;
  int touchdowns_ = 0, bounces_ = 0;
  bool touchedThisStep_ = false;
  Worst rolloutOffM_;  // where: metres past the threshold
  bool stopped_ = false, crashed_ = false;
  double halfWidthM_ = NAN;
  std::string runwayName_;
};
