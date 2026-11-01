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
  vappKn_ = kScriptedVappKn;  // until the FAC transmits a VLS
}

void ApproachJudge::observe(const World& w, const Transmitted& tx) {
  if (!seen_) begin(w);
  // the approach speed: read until the window is entered, kept from there
  vlsKn_ = facVls(tx);
  if (!vappKept_) {
    vappFromFac_ = Airframe::facSpeedsAreItsOwn() && !std::isnan(vlsKn_);
    vappKn_ = vappFromFac_ ? vlsKn_ + 5 : kScriptedVappKn;
  }

  const bool onGround = w.onGround();
  const double t = now_ = w.time();
  const IlsReading ils = w.ils();

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
    vappKept_ = true;
    ++windowTicks_;
    const double loc = std::abs(ils.locDots), gs = std::abs(ils.gsDots), sink = -w.verticalSpeedFpm();
    const double bank = std::abs(w.rollDeg()), fast = w.casKn() - vappKn_, slow = vappKn_ - w.casKn();
    loc_.add(loc, ft);
    gs_.add(gs, ft);
    sink_.add(sink, ft);
    bank_.add(bank, ft);
    loadDev_.add(std::abs(w.loadFactor() - 1), ft);
    fast_.add(fast, ft);
    slow_.add(slow, ft);
    const bool configured = w.crew.flapLever == 4 && w.flapDeg() > 39.5 && w.airframeState().gearPosition >= 0.999;
    if (!configured && std::isnan(unconfiguredAtFt_)) unconfiguredAtFt_ = ft;
    inBands_ = loc <= 1 && gs <= 1 && sink < 1000 && configured && fast <= 10 && slow <= 5 && bank <= 7;
  }
  if (touchdowns_ > 0) windowOver_ = true;

  // the rollout, from the step after the touchdown until the aircraft stops
  if (touchdowns_ > 0 && !touchedThisStep_ && w.groundSpeedKn() > 1) rolloutOffM_.add(std::abs(ils.rightM), -ils.alongM);
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
  band("speed within Vapp -5/+10 kt", windowJudged, fast_.value <= 10 && slow_.value <= 5,
       fmt("Vapp %.0f kt", vappKn_) + (vappFromFac_ ? fmt(" (VLS %.0f + 5)", vappKn_ - 5) : std::string(" (the scripted crew's)")) +
           fmt("; %+.1f to ", -slow_.value) + fmt("%+.1f kt", fast_.value));
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

std::string ApproachJudge::debrief() const {
  if (!active_) return "no approach to judge: the gate's judge watches an approach start\n";
  std::string text = "an ILS approach to " + runwayName_ + ", judged from 1,000 ft above the threshold to the stop\n";
  int broken = 0;
  for (const Band& b : verdict()) {
    text += std::string("  ") + (!b.judged ? "...." : b.pass ? "pass" : "FAIL") + "  " + b.name + " - " + b.detail + "\n";
    if (b.judged && !b.pass) ++broken;
  }
  if (!finished()) {
    text += broken ? fmt("NOT STABLE: %.0f band", broken) + (broken == 1 ? "" : "s") + " broken so far\n" : std::string("flying\n");
  } else {
    text += stable() ? std::string("STABLE\n") : fmt("NOT STABLE: %.0f band", broken) + (broken == 1 ? "" : "s") + " broken\n";
  }
  return text;
}
