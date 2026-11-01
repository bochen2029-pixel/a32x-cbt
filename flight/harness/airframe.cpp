// The airframe. See airframe.h. GPLv3.

#include "airframe.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <exception>
#include <initializer_list>
#include <limits>
#include <string>

#include "FGFDMExec.h"
#include "initialization/FGInitialCondition.h"
#include "initialization/FGTrim.h"
#include "input_output/FGLog.h"
#include "input_output/FGXMLFileRead.h"
#include "models/FGFCS.h"
#include "models/FGInput.h"
#include "models/FGMassBalance.h"
#include "models/FGOutput.h"
#include "models/FGPropagate.h"
#include "models/FGPropulsion.h"
#include "simgear/misc/sg_path.hxx"
#include "simgear/props/props.hxx"

namespace {

// The aircraft definitions that can fly, and what differs between them here.
struct Model {
  const char* key;      // as select() and FLIGHT_AIRFRAME name it
  const char* name;     // as reports name it
  const char* file;     // JSBSim's name for the definition
  bool ours;            // flight/jsbsim/aircraft, or the JSBSim clone's aircraft/
  bool stabiliser;      // a stabiliser of its own; otherwise the THS acts through the elevator
  double dropHeightFt;  // CG above the runway at the start, wheels just clear of it
  bool ownSpeeds;       // the FAC computes an A320's speeds (VLS, VS1g): this aircraft's own only on an A320
};

const Model kModels[] = {
    {"737", "737", "737", false, false, 5.0, false},
    {"a320", "A320 (ours, fitted)", "A320-fit", true, true, 9.5, true},
};
constexpr const char* kDefaultModel = "a320";  // since 2026-11-01, under the swap rule (ROADMAP.md, P7)

const Model* findModel(const std::string& key) {
  for (const Model& m : kModels) {
    if (key == m.key) return &m;
  }
  return nullptr;
}

std::string& selectedKey() {
  static std::string key = [] {
    const char* env = std::getenv("FLIGHT_AIRFRAME");
    return std::string(env && *env ? env : kDefaultModel);
  }();
  return key;
}

const Model& selectedModel();

std::vector<std::pair<std::string, double>>& coefficients() {
  static std::vector<std::pair<std::string, double>> c;
  return c;
}

constexpr double kFrame = 0.005;  // JSBSim at 200 Hz: four frames to a 20 ms tick
constexpr double kPi = 3.14159265358979323846;
constexpr double kRad = kPi / 180.0;
constexpr double kFpsPerKt = 1.687810;
constexpr double kHpaPerPsf = 0.4788026;

// JSBSim's 737 has one pitch control, an elevator with the trim folded into it; the A320 trims with
// a moving stabiliser. One degree of stabiliser turns the tail's lift as far as this many degrees of
// elevator: an elevator of about 30 % of the tail's chord has an effectiveness tau of about 0.55
// (Etkin and Reid, Dynamics of Flight), and 1 / 0.55 is 1.8.
constexpr double kThsAsElevator = 1.8;

// The A320's surfaces at full stroke: ground spoilers 50 deg, speedbrakes about 40, flaps 40 at FULL.
// JSBSim's 737 reads spoilers, speedbrakes and flaps as fractions of full stroke; our A320 reads each
// wing's spoilers as the share of all five panels at 50 deg.
constexpr double kGroundSpoilerFullDeg = 50;
constexpr double kSpeedbrakeFullDeg = 40;
constexpr double kFlapFullDeg = 40;
constexpr double kWingSpoilersFullDeg = 5 * 50;

// Thrust lever angle to thrust at the A320's detents, idle, CL, MCT and TOGA, as the fraction of the way
// from idle to take-off thrust at the flight condition. The FADEC's own schedule is not public. JSBSim's
// 737 flies this file's, of this project's choosing and shaped like the A320's, climb thrust a little
// under take-off thrust. Our A320 flies its own, which its aircraft file declares under propulsion/fit/
// and the fitter sets with its engines. Reverse is not modelled: below idle is idle.
using Schedule = std::array<double, 4>;
const double kTla[4] = {0, 25, 35, 45};
constexpr Schedule k737Schedule = {0, 0.88, 0.95, 1.0};

// Ground idle and reverse thrust, where the aircraft file declares them: propulsion/a320/ground-idle, the
// share of ground idle in its idle thrust, written here; propulsion/fit/reverse-efficiency, the share of
// an engine's thrust its reverser turns forward; propulsion/fit/reverse-max, MAX REV's setting as the
// fraction of the way from idle to take-off thrust. An aircraft without them has one idle, and below idle
// is idle. The reverse range of the levers is the A320's (A32NX's detents): reverse idle at -6 degrees,
// MAX REV at -20; between idle and -6 the reversers deploy and give reverse idle. The times are ours.
constexpr double kRevIdleTla = -6, kMaxRevTla = -20;
constexpr double kReverserTransitS = 2;  // stowed to deployed, or back
constexpr double kGroundIdleSpoolS = 5;  // approach idle to ground idle, or back, as the engines spool
constexpr double kRunningN2 = 50;        // an engine slower than this is not running: no reverse

// Where a start puts the airframe: AirframeStart (airframe.h). An airborne start trims with alpha held
// under this, comfortably past any approach's and short of every configuration's stall.
constexpr double kStartTrimAlphaLimitDeg = 16;
constexpr double kSettleS = 10.0;  // on the brakes, before the world's clock starts

[[noreturn]] void die(const std::string& what) {
  std::fprintf(stderr, "airframe: %s\n", what.c_str());
  std::exit(2);
}

const Model& selectedModel() {
  const Model* m = findModel(selectedKey());
  if (!m) die("no airframe called '" + selectedKey() + "': FLIGHT_AIRFRAME is 737 or a320");
  return *m;
}

double clamp(double x, double lo, double hi) {
  return std::max(lo, std::min(hi, x));
}

double wrap360(double deg) {
  deg = std::fmod(deg, 360.0);
  return deg <= 0 ? deg + 360.0 : deg;
}

// JSBSim's turbine spools N2 linearly with the throttle and makes thrust above idle with the square
// of N2: the throttle that gives a thrust fraction is its square root.
double throttleFor(const Schedule& s, double tla) {
  double fraction = 0;
  if (tla >= kTla[3]) {
    fraction = s[3];
  } else if (tla > kTla[0]) {
    int k = 0;
    while (tla > kTla[k + 1]) ++k;
    fraction = s[k] + (s[k + 1] - s[k]) * (tla - kTla[k]) / (kTla[k + 1] - kTla[k]);
  }
  return std::sqrt(fraction);
}

// And back: the thrust lever angle for a throttle.
double tlaFor(const Schedule& s, double throttle) {
  const double fraction = throttle * throttle;
  if (fraction >= s[3]) return kTla[3];
  int k = 0;
  while (fraction > s[k + 1]) ++k;
  return kTla[k] + (kTla[k + 1] - kTla[k]) * (fraction - s[k]) / (s[k + 1] - s[k]);
}

// For measuring: how far JSBSim's trim may move the elevator, through the pitch trim command.
constexpr double kTrimAuthorityRad = 0.6;  // about 34 deg either way
constexpr double kMeasureAltitudeFt = 1000, kMeasureCasKn = 150;

// JSBSim speaks through a logger. Routine chatter is dropped; warnings and errors reach stderr,
// because a model that loaded with complaints must not look like one that loaded clean.
class StderrLogger : public JSBSim::FGLogger {
 public:
  void SetLevel(JSBSim::LogLevel level) override {
    log_level = level;
    text_.clear();
  }
  void Message(const std::string& message) override { text_ += message; }
  void Flush() override {
    if (log_level >= JSBSim::LogLevel::WARN && !text_.empty()) {
      std::fprintf(stderr, "JSBSim: %s%s", text_.c_str(), text_.back() == '\n' ? "" : "\n");
    }
    text_.clear();
  }

 private:
  std::string text_;
};

// Constructed before the FDM so that its constructor already speaks quietly.
struct Quiet {
  Quiet() {
    JSBSim::FGJSBBase::debug_lvl = 0;
    JSBSim::SetLogger(std::make_shared<StderrLogger>());
  }
};

}  // namespace

struct Airframe::Impl {
  Quiet quiet;
  const Model& model = selectedModel();
  JSBSim::FGFDMExec fdm;
  AirframeState state;
  double radioZeroFt = 0;
  TrimPoint startTrim;
  Schedule schedule = k737Schedule;

  SGPropertyNode* node(const std::string& path) {
    SGPropertyNode* n = fdm.GetPropertyManager()->GetNode(path);
    if (!n) die("the " + std::string(model.name) + " has no property " + path);
    return n;
  }

  // written each tick
  SGPropertyNode *elevator = nullptr, *ths = nullptr, *aileron[2] = {}, *rudder = nullptr, *slatDeg = nullptr,
                 *flapDeg = nullptr, *flapNorm = nullptr, *speedbrake = nullptr, *groundSpoiler = nullptr,
                 *wingSpoilers[2] = {}, *throttle[2] = {}, *brake[2] = {}, *steer = nullptr, *gear = nullptr;
  // for measuring
  SGPropertyNode *trimAuthority = nullptr, *thsTrimAuthority = nullptr, *pitchTrim = nullptr, *elevatorPos = nullptr,
                 *stabiliserPos = nullptr, *clSquared = nullptr, *wingArea = nullptr, *alphaMax = nullptr,
                 *alphaMin = nullptr, *lift = nullptr, *drag = nullptr, *pitchMoment = nullptr, *qbar = nullptr,
                 *thrust[2] = {};
  // read each tick
  SGPropertyNode *pressureAltitude = nullptr, *cas = nullptr, *tas = nullptr, *mach = nullptr, *hDot = nullptr,
                 *alpha = nullptr, *beta = nullptr, *pressure = nullptr, *theta = nullptr, *phi = nullptr,
                 *psi = nullptr, *p = nullptr, *q = nullptr, *r = nullptr, *phiDot = nullptr, *thetaDot = nullptr,
                 *psiDot = nullptr, *nx = nullptr, *ny = nullptr, *nz = nullptr, *vNorth = nullptr, *vEast = nullptr,
                 *groundSpeed = nullptr, *gamma = nullptr, *latitude = nullptr, *longitude = nullptr, *agl = nullptr,
                 *wow[3] = {}, *wheelSpeed[2] = {}, *gearPos = nullptr, *n1[2] = {}, *weight = nullptr,
                 *cgX = nullptr, *aeroRpX = nullptr, *mac = nullptr, *cgY = nullptr, *cgZ = nullptr,
                 *eye[3] = {}, *n2[2] = {};
  // ground idle and the reversers, where the aircraft file declares them (above); null where it does not
  SGPropertyNode *groundIdleSelect = nullptr, *reverseEfficiency = nullptr, *reverseMax = nullptr,
                 *reverserAngle[2] = {};
  double groundIdle = 0;               // 0 approach idle .. 1 ground idle
  double deployed[2] = {0, 0};         // each reverser, 0 stowed .. 1 deployed

  void bind() {
    elevator = node("a32nx/elevator-rad");
    ths = node("a32nx/ths-rad");
    aileron[0] = node("a32nx/left-aileron-rad");
    aileron[1] = node("a32nx/right-aileron-rad");
    rudder = node("a32nx/rudder-rad");
    slatDeg = node("a32nx/slat-deg");
    flapDeg = node("a32nx/flap-deg");
    flapNorm = node("a32nx/flap-norm");
    speedbrake = node("a32nx/speedbrake-norm");
    groundSpoiler = node("a32nx/ground-spoiler-norm");
    wingSpoilers[0] = node("a32nx/left-spoiler-norm");
    wingSpoilers[1] = node("a32nx/right-spoiler-norm");
    throttle[0] = node("fcs/throttle-cmd-norm[0]");
    throttle[1] = node("fcs/throttle-cmd-norm[1]");
    brake[0] = node("fcs/left-brake-cmd-norm");
    brake[1] = node("fcs/right-brake-cmd-norm");
    steer = node("fcs/steer-pos-deg[0]");
    gear = node("gear/gear-cmd-norm");

    trimAuthority = node("a32nx/trim-authority-rad");
    thsTrimAuthority = node("a32nx/ths-trim-authority-rad");
    pitchTrim = node("fcs/pitch-trim-cmd-norm");
    elevatorPos = node("fcs/elevator-pos-rad");
    stabiliserPos = node("fcs/stabilizer-pos-rad");
    clSquared = node("aero/cl-squared");
    wingArea = node("metrics/Sw-sqft");
    alphaMax = node("aero/alpha-max-rad");
    alphaMin = node("aero/alpha-min-rad");
    lift = node("forces/fwz-aero-lbs");  // wind axes, lift and drag both reported positive
    drag = node("forces/fwx-aero-lbs");
    pitchMoment = node("moments/m-aero-lbsft");  // body axes, about the centre of gravity, + nose up
    qbar = node("aero/qbar-psf");
    thrust[0] = node("propulsion/engine[0]/thrust-lbs");
    thrust[1] = node("propulsion/engine[1]/thrust-lbs");

    pressureAltitude = node("atmosphere/pressure-altitude");
    cas = node("velocities/vc-kts");
    tas = node("velocities/vtrue-kts");
    mach = node("velocities/mach");
    hDot = node("velocities/h-dot-fps");
    alpha = node("aero/alpha-deg");
    beta = node("aero/beta-deg");
    pressure = node("atmosphere/P-psf");
    theta = node("attitude/theta-deg");
    phi = node("attitude/phi-deg");
    psi = node("attitude/psi-deg");
    p = node("velocities/p-rad_sec");
    q = node("velocities/q-rad_sec");
    r = node("velocities/r-rad_sec");
    phiDot = node("velocities/phidot-rad_sec");
    thetaDot = node("velocities/thetadot-rad_sec");
    psiDot = node("velocities/psidot-rad_sec");
    nx = node("accelerations/Nx");
    ny = node("accelerations/Ny");
    nz = node("accelerations/Nz");
    vNorth = node("velocities/v-north-fps");
    vEast = node("velocities/v-east-fps");
    groundSpeed = node("velocities/vg-fps");
    gamma = node("flight-path/gamma-deg");
    latitude = node("position/lat-geod-deg");
    longitude = node("position/long-gc-deg");
    agl = node("position/h-agl-ft");
    wow[0] = node("gear/unit[0]/WOW");  // the 737's contacts: nose, left main, right main
    wow[1] = node("gear/unit[1]/WOW");
    wow[2] = node("gear/unit[2]/WOW");
    wheelSpeed[0] = node("gear/unit[1]/wheel-speed-fps");
    wheelSpeed[1] = node("gear/unit[2]/wheel-speed-fps");
    gearPos = node("gear/gear-pos-norm");
    n1[0] = node("propulsion/engine[0]/n1");
    n1[1] = node("propulsion/engine[1]/n1");
    weight = node("inertia/weight-lbs");
    cgX = node("inertia/cg-x-in");
    aeroRpX = node("metrics/aero-rp-x-in");
    mac = node("metrics/cbarw-ft");
    cgY = node("inertia/cg-y-in");
    cgZ = node("inertia/cg-z-in");
    eye[0] = node("metrics/eyepoint-x-in");
    eye[1] = node("metrics/eyepoint-y-in");
    eye[2] = node("metrics/eyepoint-z-in");
    n2[0] = node("propulsion/engine[0]/n2");
    n2[1] = node("propulsion/engine[1]/n2");

    auto declared = [this](const char* path) { return fdm.GetPropertyManager()->GetNode(path); };
    groundIdleSelect = declared("propulsion/a320/ground-idle");
    reverseEfficiency = declared("propulsion/fit/reverse-efficiency");
    reverseMax = declared("propulsion/fit/reverse-max");
    if (reverseEfficiency && reverseMax) {  // a direct thruster's: its thrust times the angle's cosine
      reverserAngle[0] = node("propulsion/engine[0]/reverser-angle-rad");
      reverserAngle[1] = node("propulsion/engine[1]/reverser-angle-rad");
    }
  }

  // Ground idle and the reversers, before a tick: approach idle in flight, ground idle with both main
  // gears on the ground, coming in as the engines spool down; a reverser deploys only on the ground with
  // its engine running and its lever below idle, and gives reverse idle until it is fully out. Then the
  // throttle for each lever: forward on the schedule, or reverse from idle at -6 to MAX REV at -20.
  void engines(const AirframeControls& c, double dt) {
    const bool onGround = state.leftWow && state.rightWow;
    if (groundIdleSelect) {
      groundIdle += clamp((onGround ? 1.0 : 0.0) - groundIdle, -dt / kGroundIdleSpoolS, dt / kGroundIdleSpoolS);
      groundIdleSelect->setDoubleValue(groundIdle);
    }
    for (int e = 0; e < 2; ++e) {
      double setting = throttleFor(schedule, c.tla[e]);  // below idle: idle
      if (reverserAngle[e]) {
        const bool wanted = c.tla[e] < 0 && onGround && n2[e]->getDoubleValue() > kRunningN2;
        deployed[e] += clamp((wanted ? 1.0 : 0.0) - deployed[e], -dt / kReverserTransitS, dt / kReverserTransitS);
        const double efficiency = reverseEfficiency->getDoubleValue();
        reverserAngle[e]->setDoubleValue(std::acos(clamp(1 - deployed[e] * (1 + efficiency), -1, 1)));
        if (c.tla[e] < 0 && deployed[e] >= 1) {
          const double share = clamp((kRevIdleTla - c.tla[e]) / (kRevIdleTla - kMaxRevTla), 0, 1);
          setting = std::sqrt(share * reverseMax->getDoubleValue());
        }
      }
      throttle[e]->setDoubleValue(setting);
    }
  }

  void read() {
    AirframeState& s = state;
    s.pressureAltitudeFt = pressureAltitude->getDoubleValue();
    s.casKn = cas->getDoubleValue();
    s.tasKn = tas->getDoubleValue();
    s.mach = mach->getDoubleValue();
    s.verticalSpeedFpm = hDot->getDoubleValue() * 60;
    s.alphaDeg = alpha->getDoubleValue();
    s.betaDeg = beta->getDoubleValue();
    s.staticPressureHpa = pressure->getDoubleValue() * kHpaPerPsf;

    s.pitchDeg = theta->getDoubleValue();
    s.rollDeg = phi->getDoubleValue();
    s.headingDeg = wrap360(psi->getDoubleValue());
    s.pDegS = p->getDoubleValue() / kRad;
    s.qDegS = q->getDoubleValue() / kRad;
    s.rDegS = r->getDoubleValue() / kRad;
    s.rollRateDegS = phiDot->getDoubleValue() / kRad;
    s.pitchRateDegS = thetaDot->getDoubleValue() / kRad;
    s.headingRateDegS = psiDot->getDoubleValue() / kRad;
    s.nx = nx->getDoubleValue();
    s.ny = ny->getDoubleValue();
    s.nz = nz->getDoubleValue();
    s.groundSpeedKn = groundSpeed->getDoubleValue() / kFpsPerKt;
    s.trackDeg = s.groundSpeedKn > 0.5 ? wrap360(std::atan2(vEast->getDoubleValue(), vNorth->getDoubleValue()) / kRad)
                                       : s.headingDeg;
    s.flightPathDeg = gamma->getDoubleValue();
    s.latitudeDeg = latitude->getDoubleValue();
    s.longitudeDeg = longitude->getDoubleValue();
    s.radioHeightFt = agl->getDoubleValue() - radioZeroFt;

    // A gear compressed only while it is down: JSBSim updates a gear's WOW only when the gear is down
    // (FGLGear.cpp, gearPos > 0.99) and a retracted gear keeps the last it had. A start in the air with
    // the gear up never had one, and kept the gear compressed — which held the ELAC on the ground.
    const bool down = gearPos->getDoubleValue() > 0.99;
    s.noseWow = down && wow[0]->getBoolValue();
    s.leftWow = down && wow[1]->getBoolValue();
    s.rightWow = down && wow[2]->getBoolValue();
    s.wheelSpeedKn = std::max(0.0, (wheelSpeed[0]->getDoubleValue() + wheelSpeed[1]->getDoubleValue()) / 2 / kFpsPerKt);
    s.gearPosition = gearPos->getDoubleValue();
    s.n1[0] = n1[0]->getDoubleValue();
    s.n1[1] = n1[1]->getDoubleValue();
    s.weightLbs = weight->getDoubleValue();
    // %MAC, taking the aerodynamic reference point as the quarter chord, where Aeromatic puts it
    s.cgPercentMac = 25 + (cgX->getDoubleValue() - aeroRpX->getDoubleValue()) / (mac->getDoubleValue() * 12) * 100;
    // JSBSim's structural frame runs x aft, y right, z up, in inches
    constexpr double kMPerIn = 0.0254;
    s.eyeFwdM = (cgX->getDoubleValue() - eye[0]->getDoubleValue()) * kMPerIn;
    s.eyeRightM = (eye[1]->getDoubleValue() - cgY->getDoubleValue()) * kMPerIn;
    s.eyeUpM = (eye[2]->getDoubleValue() - cgZ->getDoubleValue()) * kMPerIn;
    s.cgHeightM = radioZeroFt * 0.3048;
    s.groundIdle = groundIdle;
    s.reverser[0] = deployed[0];
    s.reverser[1] = deployed[1];
  }

  void run(double seconds) {
    const long frames = std::lround(seconds / kFrame);
    for (long k = 0; k < frames; ++k) {
      if (!fdm.Run()) die("JSBSim stopped running at " + std::to_string(fdm.GetSimTime()) + " s");
    }
  }

  // Surfaces neutral, slats, flaps and gear where asked, for a measurement. The gear is put there, not
  // just commanded: it is a kinematic of the aircraft's own, and RunIC moves it by a frame's travel each
  // call.
  void configure(const Configuration& c) {
    for (SGPropertyNode* n : {elevator, ths, aileron[0], aileron[1], rudder, speedbrake, groundSpoiler, wingSpoilers[0],
                              wingSpoilers[1]}) {
      n->setDoubleValue(0);
    }
    slatDeg->setDoubleValue(c.slatDeg);
    flapDeg->setDoubleValue(c.flapDeg);
    flapNorm->setDoubleValue(c.flapDeg / kFlapFullDeg);
    gear->setDoubleValue(c.gearDown ? 1 : 0);
    gearPos->setDoubleValue(c.gearDown ? 1 : 0);
    trimAuthority->setDoubleValue(0);
    thsTrimAuthority->setDoubleValue(0);
    pitchTrim->setDoubleValue(0);
  }

  // The initial condition a measurement starts from: wings level, no sideslip, in flight, so the engines
  // idle at approach idle whatever the airframe was built from (a runway start leaves ground idle).
  void place(double altitudeFt, double casKn, double machNumber, double gammaDeg, double alphaDeg) {
    if (groundIdleSelect) groundIdleSelect->setDoubleValue(groundIdle = 0);
    auto ic = fdm.GetIC();
    ic->SetAltitudeASLFtIC(altitudeFt);
    if (machNumber > 0) {
      ic->SetMachIC(machNumber);
    } else {
      ic->SetVcalibratedKtsIC(casKn);
    }
    ic->SetFlightPathAngleDegIC(gammaDeg);
    ic->SetAlphaDegIC(alphaDeg);
    ic->SetBetaDegIC(0);
    ic->SetPhiDegIC(0);
  }

  // JSBSim's longitudinal trim on a configured airframe, left in place for whatever is measured next;
  // untrim() takes it out. JSBSim's trim searches alpha from -5 to 20 deg unless the aircraft names its
  // own limits, and the 737 does not. Past the lift peak the search can lose the solution it
  // straddles; keep it on the attached-flow side, where a trim means something.
  bool trimHere(double altitudeFt, double casKn, double machNumber, double gammaDeg, double alphaPeakDeg) {
    (model.stabiliser ? thsTrimAuthority : trimAuthority)->setDoubleValue(kTrimAuthorityRad);
    place(altitudeFt, casKn, machNumber, gammaDeg, 4);
    if (!fdm.RunIC()) die("JSBSim could not initialise for a trim");
    alphaMax->setDoubleValue(alphaPeakDeg * kRad);  // after RunIC, which resets them; before DoTrim reads them
    alphaMin->setDoubleValue(-5 * kRad);
    bool ok = true;
    try {
      fdm.DoTrim(JSBSim::tLongitudinal);
    } catch (const std::exception&) {
      ok = false;  // JSBSim's trim found no solution: reported, not fatal
    }
    read();
    return ok;
  }

  void untrim() {
    trimAuthority->setDoubleValue(0);
    thsTrimAuthority->setDoubleValue(0);
    pitchTrim->setDoubleValue(0);
    alphaMax->setDoubleValue(0);
    alphaMin->setDoubleValue(0);
  }
};

void Airframe::select(const std::string& key) {
  if (!findModel(key)) die("no airframe called '" + key + "': it is 737 or a320");
  selectedKey() = key;
}

const std::string& Airframe::selected() {
  return selectedKey();
}

bool Airframe::facSpeedsAreItsOwn() {
  return selectedModel().ownSpeeds;
}

const char* Airframe::model() {
  return selectedModel().name;
}

void Airframe::setCoefficients(const std::vector<std::pair<std::string, double>>& c) {
  coefficients() = c;
}

Airframe::Airframe(const AirframeStart& start) : impl_(std::make_unique<Impl>()) {
  Impl& m = *impl_;
  JSBSim::FGFDMExec& fdm = m.fdm;
  const Model& model = m.model;

  // The 737's file asks for a telnet port and a UDP input. Nothing here listens on a socket.
  fdm.GetInput()->Disable();
  fdm.GetOutput()->Disable();

  try {
    // Engines from the clone unless the aircraft has its own, which JSBSim looks for first: the 737's
    // CFM56 is the clone's, our A320's CFM56-5A1 its own (aircraft/A320-fit/Engines). Both thrusters are
    // the clone's.
    const SGPath root(JSBSIM_ROOT);
    fdm.SetRootDir(root);
    const SGPath aircraft = model.ours ? SGPath(FLIGHT_JSBSIM_DIR) / "aircraft" : root / "aircraft";
    if (!fdm.LoadModel(aircraft, root / "engine", root / "systems", model.file)) {
      die(std::string("JSBSim could not load the ") + model.name + " from " + aircraft.utf8Str());
    }

    // Ours goes in after the aircraft's own flight controls, so its channel runs last.
    JSBSim::FGXMLFileRead reader;
    const std::string surfaces = std::string(FLIGHT_JSBSIM_DIR) + "/a32nx-surfaces.xml";
    JSBSim::Element* document = reader.LoadXMLDocument(SGPath(surfaces));
    if (!document || !fdm.GetFCS()->Load(document)) die("JSBSim could not load " + surfaces);
  } catch (const std::exception& e) {
    die(std::string("JSBSim refused the model: ") + e.what());
  } catch (...) {
    die("JSBSim refused the model");
  }
  m.bind();

  // The fitter's coefficients, over the file's: only names the aircraft declares.
  for (const auto& [name, value] : coefficients()) {
    SGPropertyNode* n = fdm.GetPropertyManager()->GetNode(name);
    if (!n) die("the " + std::string(model.name) + " declares no coefficient " + name);
    n->setDoubleValue(value);
  }
  // Our A320's thrust lever schedule is its own, from its file or the fitter's coefficients.
  if (model.ours) {
    m.schedule = {0, m.node("propulsion/fit/climb-fraction")->getDoubleValue(),
                  m.node("propulsion/fit/mct-fraction")->getDoubleValue(), 1};
    if (!(m.schedule[0] < m.schedule[1] && m.schedule[1] < m.schedule[2] && m.schedule[2] <= m.schedule[3])) {
      die("the " + std::string(model.name) + "'s thrust lever schedule does not rise from idle to TOGA");
    }
  }

  fdm.Setdt(kFrame);
  auto ic = fdm.GetIC();
  if (start.geodetic) {
    ic->SetGeodLatitudeDegIC(start.latDeg);
  } else {
    ic->SetLatitudeDegIC(start.latDeg);
  }
  ic->SetLongitudeDegIC(start.lonDeg);
  ic->SetTerrainElevationFtIC(start.fieldElevationFt);
  ic->SetAltitudeAGLFtIC(model.dropHeightFt);
  ic->SetPsiDegIC(start.headingDeg);
  ic->SetVtrueKtsIC(0);
  m.gear->setDoubleValue(1);
  if (!fdm.RunIC()) die("JSBSim could not initialise the " + std::string(model.name));
  fdm.GetPropulsion()->InitRunning(-1);

  // Down onto the gear, on the brakes, engines at idle; then the radio altimeter reads zero.
  m.brake[0]->setDoubleValue(1);
  m.brake[1]->setDoubleValue(1);
  if (m.groundIdleSelect) m.groundIdleSelect->setDoubleValue(m.groundIdle = 1);  // parked: ground idle
  m.run(kSettleS);
  m.radioZeroFt = m.agl->getDoubleValue();
  m.read();

  if (!start.airborne) return;
  if (m.groundIdleSelect) m.groundIdleSelect->setDoubleValue(m.groundIdle = 0);  // in the air: approach idle
  // Into the air above the same field, trimmed by JSBSim's own routine in still air. The wind goes in
  // after the trim, not through the initial condition: JSBSim's initial condition takes the airspeed as
  // the ground velocity plus the wind and its dynamics as the ground velocity less the wind (FGAuxiliary,
  // vAeroUVW), so a wind set there starts the aircraft with an airspeed off by twice the wind. Here it
  // goes into the atmosphere and onto the ground velocity together, so the airspeed stays the trimmed
  // one and the aircraft starts drifting with the air, as it would. Turbulence, when asked for, from a
  // fixed seed, so that a run repeats.
  m.brake[0]->setDoubleValue(0);
  m.brake[1]->setDoubleValue(0);
  m.startTrim = trimmed(start.fieldElevationFt + start.heightFt, start.casKn, 0, start.gammaDeg, start.config,
                        kStartTrimAlphaLimitDeg);
  const double from = start.windFromDeg * kRad, wind = start.windKn * kFpsPerKt;
  if (wind > 0) {
    const JSBSim::FGColumnVector3 air(-wind * std::cos(from), -wind * std::sin(from), 0);  // the air's velocity, NED
    auto propagate = fdm.GetPropagate();
    const JSBSim::FGColumnVector3 uvw = propagate->GetUVW() + propagate->GetTl2b() * air;
    for (int axis = 1; axis <= 3; ++axis) propagate->SetUVW(axis, uvw(axis));
    m.node("atmosphere/wind-north-fps")->setDoubleValue(air(1));
    m.node("atmosphere/wind-east-fps")->setDoubleValue(air(2));
    m.node("atmosphere/wind-down-fps")->setDoubleValue(air(3));
  }
  if (start.turbulence > 0) {
    m.node("atmosphere/randomseed")->setIntValue(1983);
    m.node("atmosphere/turb-type")->setIntValue(4);  // Tustin, MIL-F-8785C
    m.node("atmosphere/turbulence/milspec/windspeed_at_20ft_AGL-fps")->setDoubleValue(std::max(1.0, wind));
    m.node("atmosphere/turbulence/milspec/severity")->setDoubleValue(start.turbulence);
  }
  m.read();
}

Airframe::~Airframe() = default;

const TrimPoint& Airframe::startTrim() const {
  return impl_->startTrim;
}

void Airframe::step(double dt, const AirframeControls& c) {
  Impl& m = *impl_;

  if (m.model.stabiliser) {
    m.elevator->setDoubleValue(c.elevator * kRad);
    m.ths->setDoubleValue(c.ths * kRad);
  } else {
    m.elevator->setDoubleValue((c.elevator + kThsAsElevator * c.ths) * kRad);
  }
  // Both aircraft roll on the left aileron's angle and move the right one opposite: give them the
  // differential, the part that rolls. The A320's ailerons also droop together with flap; that
  // symmetric part is lift neither file takes.
  const double roll = (c.aileron[0] - c.aileron[1]) / 2 * kRad;
  m.aileron[0]->setDoubleValue(roll);
  m.aileron[1]->setDoubleValue(-roll);
  m.rudder->setDoubleValue(c.rudder * kRad);
  m.slatDeg->setDoubleValue(c.slat);
  m.flapDeg->setDoubleValue(c.flap);
  m.flapNorm->setDoubleValue(c.flap / kFlapFullDeg);

  // Spoilers extend negative. For the 737: what both wings extend together brakes and dumps lift, and
  // what one wing extends alone is roll, which its tables do not take; spoiler 1 is a ground spoiler
  // only, 2 to 4 are the speedbrakes. For our A320: each wing's five panels as they stand.
  auto together = [&c](int k) { return std::max(0.0, -std::max(c.spoiler[0][k], c.spoiler[1][k])); };
  m.groundSpoiler->setDoubleValue(clamp(together(0) / kGroundSpoilerFullDeg, 0, 1));
  m.speedbrake->setDoubleValue(clamp((together(1) + together(2) + together(3)) / 3 / kSpeedbrakeFullDeg, 0, 1));
  for (int side = 0; side < 2; ++side) {
    double extended = 0;
    for (int k = 0; k < 5; ++k) extended += std::max(0.0, -c.spoiler[side][k]);
    m.wingSpoilers[side]->setDoubleValue(clamp(extended / kWingSpoilersFullDeg, 0, 1));
  }

  m.engines(c, dt);
  for (int e = 0; e < 2; ++e) m.brake[e]->setDoubleValue(clamp(c.brake[e], 0, 1));
  m.steer->setDoubleValue(c.noseWheel);
  m.gear->setDoubleValue(c.gearDown ? 1 : 0);

  m.run(dt);
  m.read();
}

const AirframeState& Airframe::state() const {
  return impl_->state;
}

double Airframe::wingAreaFt2() const {
  return impl_->wingArea->getDoubleValue();
}

double Airframe::property(const std::string& name) const {
  SGPropertyNode* n = impl_->fdm.GetPropertyManager()->GetNode(name);
  return n ? n->getDoubleValue() : std::numeric_limits<double>::quiet_NaN();
}

LiftPeak Airframe::liftPeak(const Configuration& c) {
  Impl& m = *impl_;
  m.configure(c);
  LiftPeak peak;
  for (int k = 0; k <= 100; ++k) {
    const double alpha = 0.25 * k;
    m.place(kMeasureAltitudeFt, kMeasureCasKn, 0, 0, alpha);
    // JSBSim forms aero/cl-squared at the start of a frame from the lift of the frame before:
    // initialise twice at the same state, and the second frame reads its own lift.
    if (!m.fdm.RunIC() || !m.fdm.RunIC()) die("JSBSim could not initialise for a lift sweep");
    const double cl = std::sqrt(m.clSquared->getDoubleValue());
    if (cl > peak.clMax) peak = {cl, alpha};
  }
  return peak;
}

void Airframe::setWeightLbs(double lbs) {
  Impl& m = *impl_;
  const auto mass = m.fdm.GetMassBalance();
  mass->SetEmptyWeight(mass->GetEmptyWeight() + lbs - m.weight->getDoubleValue());
  if (!m.fdm.RunIC()) die("JSBSim could not initialise after a change of weight");
  m.read();
}

AeroPoint Airframe::aero(double altitudeFt, double mach, double alphaDeg, const Configuration& c) {
  Impl& m = *impl_;
  m.configure(c);
  m.place(altitudeFt, 0, mach, 0, alphaDeg);
  // Twice, as for the lift sweep: a coefficient read from aero/cl-squared is a frame late.
  if (!m.fdm.RunIC() || !m.fdm.RunIC()) die("JSBSim could not initialise for an aerodynamic point");
  const double qs = m.qbar->getDoubleValue() * m.wingArea->getDoubleValue();
  return {m.lift->getDoubleValue() / qs, m.drag->getDoubleValue() / qs};
}

double Airframe::liftAt(const Configuration& c, double alphaDeg) {
  Impl& m = *impl_;
  m.configure(c);
  m.place(kMeasureAltitudeFt, kMeasureCasKn, 0, 0, alphaDeg);
  if (!m.fdm.RunIC() || !m.fdm.RunIC()) die("JSBSim could not initialise for a lift point");
  return std::sqrt(m.clSquared->getDoubleValue());
}

double Airframe::pitchMomentAt(const Configuration& c, double alphaDeg, double elevatorDeg, double thsDeg) {
  Impl& m = *impl_;
  m.configure(c);
  // at idle, whatever an earlier measurement left on the levers: thrust across the flight path would
  // turn it, and give the alpha a rate
  m.throttle[0]->setDoubleValue(0);
  m.throttle[1]->setDoubleValue(0);
  // in JSBSim's frame, as step() puts them: the 737 takes the stabiliser through its elevator
  if (m.model.stabiliser) {
    m.elevator->setDoubleValue(elevatorDeg * kRad);
    m.ths->setDoubleValue(thsDeg * kRad);
  } else {
    m.elevator->setDoubleValue((elevatorDeg + kThsAsElevator * thsDeg) * kRad);
  }
  // In steady level flight at 1 g: at the speed where the lift, the elevator's share included, and the
  // idle thrust's share across the flight path carry the weight. Off it the initial condition
  // accelerates, JSBSim's alpha rate is not zero, and the moment would carry the airframe's alpha-rate
  // damping. The speed found from the lift at 150 kt, then again from the lift at the speed found, which
  // Mach moves a little. Twice each, as for the lift sweep: an aircraft's functions may read
  // aero/cl-squared, which is a frame late. At 1,000 ft and these speeds the dynamic pressure goes as the
  // square of the CAS near enough.
  double cas = kMeasureCasKn;
  for (int pass = 0; pass < 3; ++pass) {
    m.place(kMeasureAltitudeFt, cas, 0, 0, alphaDeg);
    if (!m.fdm.RunIC() || !m.fdm.RunIC()) die("JSBSim could not initialise for a pitching moment");
    if (pass == 2) break;
    const double thrust = m.thrust[0]->getDoubleValue() + m.thrust[1]->getDoubleValue();
    const double carried = m.weight->getDoubleValue() - thrust * std::sin(alphaDeg * kRad);
    const double cl = m.lift->getDoubleValue() / (m.qbar->getDoubleValue() * m.wingArea->getDoubleValue());
    const double qbar1g = carried / (m.wingArea->getDoubleValue() * std::max(cl, 0.05));
    cas = clamp(cas * std::sqrt(qbar1g / m.qbar->getDoubleValue()), 60, 350);
  }
  const double moment = m.pitchMoment->getDoubleValue();
  const double qsc = m.qbar->getDoubleValue() * m.wingArea->getDoubleValue() * m.mac->getDoubleValue();
  m.configure(c);  // the surfaces back at neutral for whatever is measured next
  return moment / qsc;
}

TrimPoint Airframe::trim(double altitudeFt, double casKn, double mach, double gammaDeg, const Configuration& c) {
  const LiftPeak peak = liftPeak(c);
  return trimmed(altitudeFt, casKn, mach, gammaDeg, c, peak.alphaDeg);
}

TrimPoint Airframe::trimmed(double altitudeFt, double casKn, double mach, double gammaDeg, const Configuration& c,
                            double alphaLimitDeg) {
  Impl& m = *impl_;
  m.configure(c);
  TrimPoint t;
  t.ok = m.trimHere(altitudeFt, casKn, mach, gammaDeg, alphaLimitDeg);
  t.alphaDeg = m.state.alphaDeg;
  t.pitchDeg = m.state.pitchDeg;
  if (m.model.stabiliser) {
    t.thsDeg = m.stabiliserPos->getDoubleValue() / kRad;
    t.pitchControlDeg = m.elevatorPos->getDoubleValue() / kRad + kThsAsElevator * t.thsDeg;
  } else {
    t.pitchControlDeg = m.elevatorPos->getDoubleValue() / kRad;
    t.thsDeg = t.pitchControlDeg / kThsAsElevator;
  }
  t.tla = tlaFor(m.schedule, m.throttle[0]->getDoubleValue());
  // JSBSim's trim runs the engines in their trim phase, where thrust is already the steady thrust of
  // the throttle it found
  t.thrustLbs = m.thrust[0]->getDoubleValue() + m.thrust[1]->getDoubleValue();
  t.liftLbs = m.lift->getDoubleValue();
  t.dragLbs = m.drag->getDoubleValue();
  m.untrim();
  return t;
}

PitchResponse Airframe::pitchPulse(double altitudeFt, double casKn, double pulseDeg, double pulseS, double recordS,
                                  const Configuration& c) {
  Impl& m = *impl_;
  const LiftPeak peak = liftPeak(c);
  m.configure(c);
  PitchResponse r;
  r.ok = m.trimHere(altitudeFt, casKn, 0, 0, peak.alphaDeg);
  if (r.ok) {
    const double trimmedAlpha = m.state.alphaDeg;
    r.trimAlphaDeg = trimmedAlpha;
    r.mach = m.state.mach;
    r.qbarPsf = m.qbar->getDoubleValue();
    constexpr double kSample = 0.02;
    auto sample = [&](double t, double elevatorDeg) {
      r.fromStart.push_back(t);
      r.alphaFromStartDeg.push_back(m.state.alphaDeg - trimmedAlpha);
      r.qDegS.push_back(m.state.qDegS);
      r.elevatorDeg.push_back(elevatorDeg);
    };
    sample(0, pulseDeg);
    m.elevator->setDoubleValue(pulseDeg * kRad);  // on top of the pitch control the trim holds
    const int pulseSamples = static_cast<int>(std::lround(pulseS / kSample));
    for (int k = 1; k <= pulseSamples; ++k) {
      m.run(kSample);
      m.read();
      sample(k * kSample, k < pulseSamples ? pulseDeg : 0);
    }
    m.elevator->setDoubleValue(0);
    for (int k = 1; k * kSample <= recordS + 1e-9; ++k) {
      m.run(kSample);
      m.read();
      r.t.push_back(k * kSample);
      r.alphaDeg.push_back(m.state.alphaDeg - trimmedAlpha);
      sample(pulseS + k * kSample, 0);
    }
  }
  m.untrim();
  return r;
}

double Airframe::engineThrustLbs(double altitudeFt, double casKn, double mach, double tla) {
  Impl& m = *impl_;
  m.configure(Configuration{});
  m.place(altitudeFt, casKn, mach, 0, 2);
  m.throttle[0]->setDoubleValue(throttleFor(m.schedule, tla));
  m.throttle[1]->setDoubleValue(throttleFor(m.schedule, tla));
  if (!m.fdm.RunIC()) die("JSBSim could not initialise for a thrust");
  m.fdm.GetPropulsion()->GetSteadyState();
  m.read();
  return m.thrust[0]->getDoubleValue();
}
