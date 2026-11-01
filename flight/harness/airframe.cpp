// The airframe. See airframe.h. GPLv3.

#include "airframe.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <exception>
#include <initializer_list>
#include <string>

#include "FGFDMExec.h"
#include "initialization/FGInitialCondition.h"
#include "initialization/FGTrim.h"
#include "input_output/FGLog.h"
#include "input_output/FGXMLFileRead.h"
#include "models/FGFCS.h"
#include "models/FGInput.h"
#include "models/FGOutput.h"
#include "models/FGPropulsion.h"
#include "simgear/misc/sg_path.hxx"
#include "simgear/props/props.hxx"

namespace {

constexpr const char* kModel = "737";
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
// JSBSim's 737 reads spoilers, speedbrakes and flaps as fractions of full stroke.
constexpr double kGroundSpoilerFullDeg = 50;
constexpr double kSpeedbrakeFullDeg = 40;
constexpr double kFlapFullDeg = 40;

// Thrust lever angle to thrust as a fraction of take-off thrust: idle, CL, MCT, TOGA. A schedule of
// this project's choosing, shaped like the A320's — climb thrust a little under take-off thrust —
// since the FADEC's own is not public. Reverse is not modelled: below idle is idle.
const double kTla[4] = {0, 25, 35, 45};
const double kThrust[4] = {0, 0.88, 0.95, 1.0};

// The runway: sea level, ISA, no wind, at the position the stub world's IRs reported.
constexpr double kLatitude = 47.0, kLongitude = 8.0;
constexpr double kDropHeightFt = 5.0;  // CG above the runway at the start, wheels just clear of it
constexpr double kSettleS = 10.0;      // on the brakes, before the world's clock starts

[[noreturn]] void die(const std::string& what) {
  std::fprintf(stderr, "airframe: %s\n", what.c_str());
  std::exit(2);
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
double throttleFor(double tla) {
  double fraction = 0;
  if (tla >= kTla[3]) {
    fraction = kThrust[3];
  } else if (tla > kTla[0]) {
    int k = 0;
    while (tla > kTla[k + 1]) ++k;
    fraction = kThrust[k] + (kThrust[k + 1] - kThrust[k]) * (tla - kTla[k]) / (kTla[k + 1] - kTla[k]);
  }
  return std::sqrt(fraction);
}

// And back: the thrust lever angle for a throttle.
double tlaFor(double throttle) {
  const double fraction = throttle * throttle;
  if (fraction >= kThrust[3]) return kTla[3];
  int k = 0;
  while (fraction > kThrust[k + 1]) ++k;
  return kTla[k] + (kTla[k + 1] - kTla[k]) * (fraction - kThrust[k]) / (kThrust[k + 1] - kThrust[k]);
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
  JSBSim::FGFDMExec fdm;
  AirframeState state;
  double radioZeroFt = 0;

  SGPropertyNode* node(const std::string& path) {
    SGPropertyNode* n = fdm.GetPropertyManager()->GetNode(path);
    if (!n) die("the " + std::string(kModel) + " has no property " + path);
    return n;
  }

  // written each tick
  SGPropertyNode *elevator = nullptr, *aileron[2] = {}, *rudder = nullptr, *flapDeg = nullptr, *flapNorm = nullptr,
                 *speedbrake = nullptr, *groundSpoiler = nullptr, *throttle[2] = {}, *brake[2] = {}, *steer = nullptr,
                 *gear = nullptr;
  // for measuring
  SGPropertyNode *trimAuthority = nullptr, *pitchTrim = nullptr, *elevatorPos = nullptr, *clSquared = nullptr,
                 *wingArea = nullptr, *alphaMax = nullptr, *alphaMin = nullptr;
  // read each tick
  SGPropertyNode *pressureAltitude = nullptr, *cas = nullptr, *tas = nullptr, *mach = nullptr, *hDot = nullptr,
                 *alpha = nullptr, *beta = nullptr, *pressure = nullptr, *theta = nullptr, *phi = nullptr,
                 *psi = nullptr, *p = nullptr, *q = nullptr, *r = nullptr, *phiDot = nullptr, *thetaDot = nullptr,
                 *psiDot = nullptr, *nx = nullptr, *ny = nullptr, *nz = nullptr, *vNorth = nullptr, *vEast = nullptr,
                 *groundSpeed = nullptr, *gamma = nullptr, *latitude = nullptr, *longitude = nullptr, *agl = nullptr,
                 *wow[3] = {}, *wheelSpeed[2] = {}, *gearPos = nullptr, *n1[2] = {}, *weight = nullptr,
                 *cgX = nullptr, *aeroRpX = nullptr, *mac = nullptr;

  void bind() {
    elevator = node("a32nx/elevator-rad");
    aileron[0] = node("a32nx/left-aileron-rad");
    aileron[1] = node("a32nx/right-aileron-rad");
    rudder = node("a32nx/rudder-rad");
    flapDeg = node("a32nx/flap-deg");
    flapNorm = node("a32nx/flap-norm");
    speedbrake = node("a32nx/speedbrake-norm");
    groundSpoiler = node("a32nx/ground-spoiler-norm");
    throttle[0] = node("fcs/throttle-cmd-norm[0]");
    throttle[1] = node("fcs/throttle-cmd-norm[1]");
    brake[0] = node("fcs/left-brake-cmd-norm");
    brake[1] = node("fcs/right-brake-cmd-norm");
    steer = node("fcs/steer-pos-deg[0]");
    gear = node("gear/gear-cmd-norm");

    trimAuthority = node("a32nx/trim-authority-rad");
    pitchTrim = node("fcs/pitch-trim-cmd-norm");
    elevatorPos = node("fcs/elevator-pos-rad");
    clSquared = node("aero/cl-squared");
    wingArea = node("metrics/Sw-sqft");
    alphaMax = node("aero/alpha-max-rad");
    alphaMin = node("aero/alpha-min-rad");

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

    s.noseWow = wow[0]->getBoolValue();
    s.leftWow = wow[1]->getBoolValue();
    s.rightWow = wow[2]->getBoolValue();
    s.wheelSpeedKn = std::max(0.0, (wheelSpeed[0]->getDoubleValue() + wheelSpeed[1]->getDoubleValue()) / 2 / kFpsPerKt);
    s.gearPosition = gearPos->getDoubleValue();
    s.n1[0] = n1[0]->getDoubleValue();
    s.n1[1] = n1[1]->getDoubleValue();
    s.weightLbs = weight->getDoubleValue();
    // %MAC, taking the aerodynamic reference point as the quarter chord, where Aeromatic puts it
    s.cgPercentMac = 25 + (cgX->getDoubleValue() - aeroRpX->getDoubleValue()) / (mac->getDoubleValue() * 12) * 100;
  }

  void run(double seconds) {
    const long frames = std::lround(seconds / kFrame);
    for (long k = 0; k < frames; ++k) {
      if (!fdm.Run()) die("JSBSim stopped running at " + std::to_string(fdm.GetSimTime()) + " s");
    }
  }

  // Surfaces neutral, flaps and gear where asked, for a measurement.
  void configure(double flap, bool gearDown) {
    for (SGPropertyNode* n : {elevator, aileron[0], aileron[1], rudder, speedbrake, groundSpoiler}) n->setDoubleValue(0);
    flapDeg->setDoubleValue(flap);
    flapNorm->setDoubleValue(flap / kFlapFullDeg);
    gear->setDoubleValue(gearDown ? 1 : 0);
    trimAuthority->setDoubleValue(0);
    pitchTrim->setDoubleValue(0);
  }

  // The initial condition a measurement starts from: wings level, no sideslip.
  void place(double altitudeFt, double casKn, double machNumber, double gammaDeg, double alphaDeg) {
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
};

const char* Airframe::model() {
  return kModel;
}

Airframe::Airframe() : impl_(std::make_unique<Impl>()) {
  Impl& m = *impl_;
  JSBSim::FGFDMExec& fdm = m.fdm;

  // The 737's file asks for a telnet port and a UDP input. Nothing here listens on a socket.
  fdm.GetInput()->Disable();
  fdm.GetOutput()->Disable();

  try {
    fdm.SetRootDir(SGPath(JSBSIM_ROOT));
    fdm.SetAircraftPath(SGPath("aircraft"));
    fdm.SetEnginePath(SGPath("engine"));
    fdm.SetSystemsPath(SGPath("systems"));
    if (!fdm.LoadModel(kModel)) die(std::string("JSBSim could not load the ") + kModel + " from " + JSBSIM_ROOT);

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

  fdm.Setdt(kFrame);
  auto ic = fdm.GetIC();
  ic->SetLatitudeDegIC(kLatitude);
  ic->SetLongitudeDegIC(kLongitude);
  ic->SetTerrainElevationFtIC(0);
  ic->SetAltitudeAGLFtIC(kDropHeightFt);
  ic->SetPsiDegIC(0);
  ic->SetVtrueKtsIC(0);
  m.gear->setDoubleValue(1);
  if (!fdm.RunIC()) die("JSBSim could not initialise the " + std::string(kModel));
  fdm.GetPropulsion()->InitRunning(-1);

  // Down onto the gear, on the brakes, engines at idle; then the radio altimeter reads zero.
  m.brake[0]->setDoubleValue(1);
  m.brake[1]->setDoubleValue(1);
  m.run(kSettleS);
  m.radioZeroFt = m.agl->getDoubleValue();
  m.read();
}

Airframe::~Airframe() = default;

void Airframe::step(double dt, const AirframeControls& c) {
  Impl& m = *impl_;

  m.elevator->setDoubleValue((c.elevator + kThsAsElevator * c.ths) * kRad);
  // The 737 rolls on the left aileron's angle and moves the right one opposite: give it the
  // differential, the part that rolls. The A320's ailerons also droop together with flap; that
  // symmetric part is lift the 737's tables do not take.
  const double roll = (c.aileron[0] - c.aileron[1]) / 2 * kRad;
  m.aileron[0]->setDoubleValue(roll);
  m.aileron[1]->setDoubleValue(-roll);
  m.rudder->setDoubleValue(c.rudder * kRad);
  m.flapDeg->setDoubleValue(c.flap);
  m.flapNorm->setDoubleValue(c.flap / kFlapFullDeg);

  // Spoilers extend negative. What both wings extend together brakes and dumps lift; what one wing
  // extends alone is roll, which the 737's tables do not take either. Spoiler 1 is a ground spoiler
  // only; 2 to 4 are the speedbrakes.
  auto together = [&c](int k) { return std::max(0.0, -std::max(c.spoiler[0][k], c.spoiler[1][k])); };
  m.groundSpoiler->setDoubleValue(clamp(together(0) / kGroundSpoilerFullDeg, 0, 1));
  m.speedbrake->setDoubleValue(clamp((together(1) + together(2) + together(3)) / 3 / kSpeedbrakeFullDeg, 0, 1));

  for (int e = 0; e < 2; ++e) {
    m.throttle[e]->setDoubleValue(throttleFor(c.tla[e]));
    m.brake[e]->setDoubleValue(clamp(c.brake[e], 0, 1));
  }
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

LiftPeak Airframe::liftPeak(double flapDeg, bool gearDown) {
  Impl& m = *impl_;
  m.configure(flapDeg, gearDown);
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

TrimPoint Airframe::trim(double altitudeFt, double casKn, double mach, double gammaDeg, double flapDeg, bool gearDown) {
  Impl& m = *impl_;
  // JSBSim's trim searches alpha from -5 to 20 deg unless the aircraft names its own limits, and the
  // 737 does not. Past the lift peak the search can lose the solution it straddles; keep it on the
  // attached-flow side, where a trim means something.
  const LiftPeak peak = liftPeak(flapDeg, gearDown);
  m.configure(flapDeg, gearDown);
  m.trimAuthority->setDoubleValue(kTrimAuthorityRad);
  m.place(altitudeFt, casKn, mach, gammaDeg, 4);
  if (!m.fdm.RunIC()) die("JSBSim could not initialise for a trim");
  m.alphaMax->setDoubleValue(peak.alphaDeg * kRad);  // after RunIC, which resets them; before DoTrim reads them
  m.alphaMin->setDoubleValue(-5 * kRad);
  TrimPoint t;
  try {
    m.fdm.DoTrim(JSBSim::tLongitudinal);
    t.ok = true;
  } catch (const std::exception&) {
    t.ok = false;  // JSBSim's trim found no solution: reported, not fatal
  }
  m.read();
  t.alphaDeg = m.state.alphaDeg;
  t.pitchDeg = m.state.pitchDeg;
  t.pitchControlDeg = m.elevatorPos->getDoubleValue() / kRad;
  t.thsDeg = t.pitchControlDeg / kThsAsElevator;
  t.tla = tlaFor(m.throttle[0]->getDoubleValue());
  m.trimAuthority->setDoubleValue(0);
  m.pitchTrim->setDoubleValue(0);
  m.alphaMax->setDoubleValue(0);
  m.alphaMin->setDoubleValue(0);
  return t;
}
