#include "judge.h"

#include <algorithm>
#include <cstdio>

#include "airframe.h"
#include "efcs.h"
#include "world.h"

namespace {

std::string fmt(const char* f, double a, double b = 0, double c = 0) {
  char text[256];
  std::snprintf(text, sizeof text, f, a, b, c);
  return text;
}

std::string worst(const Worst& w, const char* unit) {
  return std::isnan(w.value) ? std::string("never measured")
                             : fmt("worst %.2f ", w.value) + unit + fmt(" at %.0f ft", w.at);
}

constexpr double kMPerFt = 0.3048;
constexpr double kWindowTopFt = 1000, kWindowBottomFt = 50;  // the stabilised window, above the threshold
constexpr double kScriptedVappKn = 140;                      // the scripted crew's (World::approachSpeedKn)
// When the FAC's VLS has settled (ApproachJudge::vappKn): held within kVlsHeldKn for kVlsSettleS, or for
// kVlsFloorSettleS on A32NX's floor (FacComputer_P.Vmcl_Value, 116 kt), where it sits while the FAC ramps
// its VS1g factor up from nothing at 0.1 a second (RateLimiterGenericVariableTs): 12.8 s at most, to the
// clean configuration's 1.28. Measured from every approach start: no VLS for 10.0 s, the floor to 18.9 s,
// the ramp to 20.9 s, settled at 23.9 s.
constexpr double kVlsHeldKn = 0.2, kVlsSettleS = 3, kVlsFloorKn = 116, kVlsFloorSettleS = 13;

// the FAC's VLS: FAC 1's, or FAC 2's when FAC 1 is not transmitting it; NaN when neither is
double facVls(const Transmitted& tx) {
  for (const base_fac_bus& b : tx.facBus) {
    if (b.v_ls_kn.SSM == static_cast<uint32_t>(Arinc429SignStatus::NormalOperation)) return b.v_ls_kn.Data;
  }
  return NAN;
}

}  // namespace

void ApproachJudge::begin(const World& w) {
  seen_ = true;
  active_ = w.ilsApproach();
  halfWidthM_ = w.runway().widthM / 2;
  runwayName_ = w.runway().name;
  if (!Airframe::facSpeedsAreItsOwn()) {  // the FAC's speeds are an A320's: the scripted crew's, throughout
    vappKn_ = kScriptedVappKn;
    vappFinal_ = true;
  }
}

// The FAC's VLS, until Vapp is final: whether it has settled, and Vapp from it once it has.
void ApproachJudge::readVls(double t) {
  if (std::isnan(vlsKn_)) {
    vlsHeldSince_ = NAN;
    return;
  }
  lastVlsKn_ = vlsKn_;
  if (std::isnan(vlsHeldSince_) || std::max(vlsHeldHigh_, vlsKn_) - std::min(vlsHeldLow_, vlsKn_) > kVlsHeldKn) {
    vlsHeldSince_ = t;  // a new span
    vlsHeldLow_ = vlsHeldHigh_ = vlsKn_;
  } else {
    vlsHeldLow_ = std::min(vlsHeldLow_, vlsKn_);
    vlsHeldHigh_ = std::max(vlsHeldHigh_, vlsKn_);
  }
  const double held = t - vlsHeldSince_;
  if (held >= kVlsSettleS && (vlsKn_ > kVlsFloorKn + kVlsHeldKn || held >= kVlsFloorSettleS)) vlsSettled_ = true;
  if (vlsSettled_) {  // settled once, it is followed until Vapp is final
    vappKn_ = vlsKn_ + 5;
    vappFromFac_ = true;
  }
}

void ApproachJudge::finalVapp() {
  vappFinal_ = true;  // the settled VLS + 5 as it stands; if it never settled, none
}

void ApproachJudge::observe(const World& w, const Transmitted& tx) {
  if (!seen_) begin(w);
  const bool onGround = w.onGround();
  const double t = now_ = w.time();
  const IlsReading ils = w.ils();

  vlsKn_ = facVls(tx);
  if (!vappFinal_) readVls(t);

  // a touchdown: the gear compressed where a step before it was not; its sink rate the last airborne
  // step's, its attitude and speed at contact, its load factor the peak over the next two seconds
  touchedThisStep_ = false;
  if (!wasOnGround_ && onGround) {
    ++touchdowns_;
    touchedThisStep_ = true;
    if (touchdowns_ == 1) {
      touchdown_.at = t;
      touchdown_.sinkFpm = lastAirborneVs_;
      touchdown_.pitch = w.pitchDeg();
      touchdown_.bank = w.rollDeg();
      touchdown_.cas = w.casKn();
      touchdown_.peakG = w.loadFactor();
      touchdown_.pastM = -ils.alongM;
      touchdown_.offM = ils.rightM;
    } else if (t - touchdown_.at < 30) {
      ++bounces_;
    }
  } else if (touchdowns_ == 1 && t - touchdown_.at <= 2) {
    touchdown_.peakG = std::max(touchdown_.peakG, w.loadFactor());
  }
  wasOnGround_ = onGround;
  if (!onGround) lastAirborneVs_ = w.verticalSpeedFpm();
  if (w.crashedAt() >= 0) crashed_ = true;

  inWindow_ = inBands_ = false;
  if (!active_) return;

  // the stabilised window: from 1,000 ft above the threshold to 50 ft, before the first touchdown
  const double ft = ils.heightM / kMPerFt;
  if (touchdowns_ == 0 && !onGround && ft <= kWindowTopFt && ft >= kWindowBottomFt) {
    inWindow_ = true;
    if (!vappFinal_ && vlsSettled_) finalVapp();  // in the window, a settled Vapp is kept from here
    ++windowTicks_;
    const double loc = std::abs(ils.locDots), gs = std::abs(ils.gsDots), sink = -w.verticalSpeedFpm();
    const double bank = std::abs(w.rollDeg()), cas = w.casKn();
    loc_.add(loc, ft);
    gs_.add(gs, ft);
    sink_.add(sink, ft);
    bank_.add(bank, ft);
    loadDev_.add(std::abs(w.loadFactor() - 1), ft);
    // the speed is held to Vapp from the moment it is known: here, in the in-band slot and in the verdict
    // alike, so that the trail, the log and the verdict agree
    if (vappFinal_) {
      casHigh_.add(cas, ft);
      casLow_.add(-cas, ft);
    }
    const bool configured = w.crew.flapLever == 4 && w.flapDeg() > 39.5 && w.airframeState().gearPosition >= 0.999;
    if (!configured && std::isnan(unconfiguredAtFt_)) unconfiguredAtFt_ = ft;
    const bool speed = !vappFinal_ || (cas - vappKn_ <= 10 && vappKn_ - cas <= 5);
    inBands_ = loc <= 1 && gs <= 1 && sink < 1000 && configured && speed && bank <= 7;
  }
  if (touchdowns_ > 0) windowOver_ = true;
  if (!vappFinal_ && (windowOver_ || finished())) finalVapp();  // the window over: Vapp as it stands

  // the rollout, from the step after the touchdown until the aircraft stops; what it does after that, taxiing
  // on or rolling back on its reversers, is no longer the approach's
  if (touchdowns_ > 0 && !touchedThisStep_ && !stopped_ && w.groundSpeedKn() > 1) {
    rolloutOffM_.add(std::abs(ils.rightM), -ils.alongM);
  }
  if (touchdowns_ > 0 && onGround && w.groundSpeedKn() < 1) stopped_ = true;
}

std::vector<Band> ApproachJudge::verdict() const {
  const bool windowJudged = windowOver_ || finished();
  const bool landed = touchdowns_ > 0;
  const bool touchdownJudged = landed || finished();
  std::vector<Band> v;
  auto band = [&v](const char* name, bool judged, bool pass, const std::string& detail) {
    v.push_back({name, judged, judged && pass, detail});
  };
  band("the stabilised window was flown, 1,000 ft to 50 ft", windowJudged, windowTicks_ * kDt > 60,
       fmt("%.0f s of it", windowTicks_ * kDt));
  band("localizer within 1 dot", windowJudged, loc_.value <= 1, worst(loc_, "dots"));
  band("glideslope within 1 dot", windowJudged, gs_.value <= 1, worst(gs_, "dots"));
  band("sink rate under 1,000 fpm", windowJudged, sink_.value < 1000, worst(sink_, "fpm"));
  band("gear down and CONF FULL from 1,000 ft", windowJudged, std::isnan(unconfiguredAtFt_) && windowTicks_ > 0,
       std::isnan(unconfiguredAtFt_) ? std::string(windowTicks_ > 0 ? "throughout" : "never measured")
                                     : fmt("not at %.0f ft", unconfiguredAtFt_));
  // the speed band: the fastest and slowest in the window from the moment Vapp was known, against it
  const double fast = casHigh_.value - vappKn_, slow = vappKn_ + casLow_.value;
  std::string speed;
  if (!vappFinal_) {
    speed = std::isnan(vlsKn_) ? std::string("Vapp to come: the FAC transmits no VLS yet")
                               : fmt("Vapp to come: the FAC's VLS, %.0f kt, has not settled", vlsKn_);
  } else if (std::isnan(casHigh_.value)) {  // no step of the window was flown with a Vapp to hold
    if (windowTicks_ == 0) {
      speed = "never measured";
    } else if (vlsSettled_) {
      speed = fmt("no Vapp in the window: the FAC's VLS settled only after it, at %.0f kt", lastVlsKn_);
    } else {
      speed = std::isnan(lastVlsKn_) ? std::string("no Vapp in the window: the FAC transmitted no VLS")
                                     : fmt("no Vapp in the window: the FAC's VLS, %.0f kt at the last, had not settled", lastVlsKn_);
    }
  } else {
    speed = fmt("Vapp %.0f kt", vappKn_) + (vappFromFac_ ? fmt(" (VLS %.0f + 5)", vappKn_ - 5) : std::string(" (the scripted crew's)")) +
            fmt("; %+.1f to ", -slow) + fmt("%+.1f kt", fast);
  }
  band("speed within Vapp -5/+10 kt", windowJudged, fast <= 10 && slow <= 5, speed);
  band("bank within 7 deg", windowJudged, bank_.value <= 7, worst(bank_, "deg"));
  const Touchdown& l = touchdown_;
  band("a landing", touchdownJudged, landed, fmt("%.0f touchdowns", touchdowns_));
  const std::string none = "no touchdown";
  band("sink rate at touchdown under 360 fpm", touchdownJudged, l.sinkFpm > -360, landed ? fmt("%.0f fpm", l.sinkFpm) : none);
  band("load factor at touchdown under 2.6 g", touchdownJudged, l.peakG < 2.6, landed ? fmt("peak %.2f g", l.peakG) : none);
  band("pitch at touchdown 0 to 10 deg", touchdownJudged, l.pitch > 0 && l.pitch < 10, landed ? fmt("%.1f deg", l.pitch) : none);
  band("touchdown 300 to 900 m past the threshold", touchdownJudged, l.pastM >= 300 && l.pastM <= 900,
       landed ? fmt("%.0f m", l.pastM) : none);
  band("on the centreline at touchdown, within 5 m", touchdownJudged, std::abs(l.offM) <= 5,
       landed ? fmt("%+.1f m (+ right)", l.offM) : none);
  band("and through the rollout", finished(), rolloutOffM_.value <= 5,
       std::isnan(rolloutOffM_.value) ? (landed ? std::string("no rollout") : none)
                                      : fmt("worst %.1f m, ", rolloutOffM_.value) + fmt("%.0f m past the threshold", rolloutOffM_.at));
  band("and it stayed down", finished() || (landed && now_ - l.at >= 30), landed && bounces_ == 0,
       landed ? fmt("%.0f bounces", bounces_) : none);
  return v;
}

bool ApproachJudge::stable() const {
  if (!active_ || !finished()) return false;
  for (const Band& b : verdict()) {
    if (!b.pass) return false;
  }
  return true;
}

std::string ApproachJudge::summary() const {
  if (!active_) return "no approach";
  int broken = 0;
  for (const Band& b : verdict()) broken += b.judged && !b.pass;
  const std::string bands = fmt("NOT STABLE: %.0f band", broken) + (broken == 1 ? "" : "s") + " broken";
  if (!finished()) return broken ? bands + " so far" : std::string("flying");
  return stable() ? std::string("STABLE") : bands;
}

std::string ApproachJudge::debrief() const {
  if (!active_) return "no approach to judge: the gate's judge watches an approach start\n";
  std::string text = "an ILS approach to " + runwayName_ + ", judged from 1,000 ft above the threshold to the stop\n";
  for (const Band& b : verdict()) {
    text += std::string("  ") + (!b.judged ? "...." : b.pass ? "pass" : "FAIL") + "  " + b.name + " - " + b.detail + "\n";
  }
  return text + summary() + "\n";
}
