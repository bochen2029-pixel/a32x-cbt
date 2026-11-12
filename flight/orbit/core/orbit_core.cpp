// orbit_core.cpp — see orbit_core.h. A sketch: every number marked as chosen is a design choice made to
// get a craft to orbit on a page, not a measurement of anything. docs/provenance.md, 1h, says where the
// rest come from. What the core's parts share is in internal.h; the flight home is return.cpp, docking
// dock.cpp, the flight deck deck.cpp, the walk walk.cpp.

#include "internal.h"

#include <cmath>
#include <cstdint>
#include <cstring>

namespace oc {

State g;
Site site;
Ring ring;
V3 sunEci;
Controls hands;

namespace {
double out[OC_COUNT];
}

// ---- vectors and quaternions ------------------------------------------------------------------

// The quaternion of the frame whose axes, in the world, are x, y, z (orthonormal, right-handed).
Q fromAxes(V3 x, V3 y, V3 z) {
    const double tr = x.x + y.y + z.z;
    Q q;
    if (tr > 0) {
        const double s = std::sqrt(tr + 1.0) * 2;
        q = {0.25 * s, (y.z - z.y) / s, (z.x - x.z) / s, (x.y - y.x) / s};
    } else if (x.x > y.y && x.x > z.z) {
        const double s = std::sqrt(1.0 + x.x - y.y - z.z) * 2;
        q = {(y.z - z.y) / s, 0.25 * s, (y.x + x.y) / s, (z.x + x.z) / s};
    } else if (y.y > z.z) {
        const double s = std::sqrt(1.0 + y.y - x.x - z.z) * 2;
        q = {(z.x - x.z) / s, (y.x + x.y) / s, 0.25 * s, (z.y + y.z) / s};
    } else {
        const double s = std::sqrt(1.0 + z.z - x.x - y.y) * 2;
        q = {(x.y - y.x) / s, (z.x + x.z) / s, (z.y + y.z) / s, 0.25 * s};
    }
    return qunit(q);
}

V3 rotateAbout(V3 v, V3 axis, double angle) {   // Rodrigues
    const double c = std::cos(angle), s = std::sin(angle);
    return v * c + cross(axis, v) * s + axis * (dot(axis, v) * (1 - c));
}

// ---- the 1976 standard atmosphere ---------------------------------------------------------------
// Seven layers to 84.852 km of geopotential height, as the standard prints them; above 86 km, three
// exponentials through the standard's densities at 86, 120, 200 and 500 km (an estimate).

Air atmosphere(double alt) {
    static const double hb[] = {0, 11000, 20000, 32000, 47000, 51000, 71000, 84852};
    static const double lapse[] = {-0.0065, 0, 0.001, 0.0028, 0, -0.0028, -0.002};
    const double R = 287.05287, gamma = 1.4, r0 = 6356766.0;
    if (alt < -500) alt = -500;
    if (alt <= 86000) {
        const double h = r0 * alt / (r0 + alt);
        double tb = 288.15, pb = 101325.0;
        for (int i = 0; i < 7; ++i) {
            const double top = hb[i + 1];
            const double dh = (h < top ? h : top) - hb[i];
            const double t = tb + lapse[i] * dh;
            const double p = lapse[i] == 0 ? pb * std::exp(-G0 * dh / (R * tb))
                                           : pb * std::pow(tb / t, G0 / (R * lapse[i]));
            if (h <= top || i == 6) return {p / (R * t), p, t, std::sqrt(gamma * R * t)};
            tb = t;
            pb = p;
        }
    }
    const double t = 186.87, a = std::sqrt(gamma * R * t);
    double rho;
    if (alt < 120000) rho = 6.958e-6 * std::exp(-(alt - 86000) / 5910.0);
    else if (alt < 200000) rho = 2.2e-8 * std::exp(-(alt - 120000) / 17870.0);
    else rho = 2.5e-10 * std::exp(-(alt - 200000) / 48300.0);
    return {rho, rho * R * t, t, a};
}

// ---- the craft ---------------------------------------------------------------------------------

double cd0(double mach) {
    static const double m[] = {0, 0.8, 1.05, 2, 5, 10}, c[] = {0.020, 0.020, 0.050, 0.035, 0.025, 0.020};
    if (mach >= 10) return c[5];
    for (int i = 0; i < 5; ++i)
        if (mach < m[i + 1]) return c[i] + (c[i + 1] - c[i]) * (mach - m[i]) / (m[i + 1] - m[i]);
    return c[5];
}

// Lift and drag coefficients: a slender delta's below Mach 1.5, Newtonian impact above Mach 5.
void liftDrag(double alpha, double mach, double* cl, double* cd) {
    const double sa = std::sin(alpha), ca = std::cos(alpha);
    const double cls = KP_LIFT * sa * ca * ca + KV_LIFT * std::fabs(sa) * sa * ca;
    const double cds = KP_LIFT * sa * sa * std::fabs(ca) + KV_LIFT * std::fabs(sa * sa * sa);
    const double cn = 2 * sa * std::fabs(sa);
    const double w = clampd((mach - 1.5) / 3.5, 0, 1);
    *cl = (1 - w) * cls + w * cn * ca;
    *cd = cd0(mach) + (1 - w) * cds + w * std::fabs(cn * sa);
}

// The air's moment on the craft, body axes: its static stability and its damping.
V3 airMoment(double qbar, double tas, double alpha, double beta, V3 w) {
    const double k = 1.0 / (2 * tas);
    return {qbar * S_REF * SPAN * (CL_BETA * beta + CL_P * w.x * SPAN * k),
            qbar * S_REF * CHORD * (CM_ALPHA * std::sin(alpha) + CM_Q * w.y * CHORD * k),
            qbar * S_REF * SPAN * (CN_BETA * beta + CN_R * w.z * SPAN * k)};
}

// ---- air data and local angles ------------------------------------------------------------------

Local localOf(const State& s) {
    Local L;
    const double rm = norm(s.r);
    L.up = s.r * (1.0 / rm);
    L.east = unit(cross(V3{0, 0, 1}, L.up));
    L.north = cross(L.up, L.east);
    L.alt = rm - RE;
    const V3 xb = rot(s.q, {1, 0, 0}), yb = rot(s.q, {0, 1, 0}), zb = rot(s.q, {0, 0, 1});
    L.heading = std::atan2(dot(xb, L.east), dot(xb, L.north));
    L.pitch = std::asin(clampd(dot(xb, L.up), -1, 1));
    L.roll = std::atan2(-dot(yb, L.up), -dot(zb, L.up));
    const V3 vAir = s.v - cross(V3{0, 0, WE}, s.r);
    L.vAirBody = irot(s.q, vAir);
    L.tas = norm(vAir);
    L.air = atmosphere(L.alt);
    L.mach = L.tas / L.air.sound;
    L.qbar = 0.5 * L.air.rho * L.tas * L.tas;
    L.alpha = L.tas > 1 ? std::atan2(L.vAirBody.z, L.vAirBody.x) : 0;
    L.beta = L.tas > 1 ? std::asin(clampd(L.vAirBody.y / L.tas, -1, 1)) : 0;
    L.vs = dot(s.v, L.up);
    return L;
}

Orbit orbitOf(const State& s) {
    Orbit o;
    const double r = norm(s.r), v2 = dot(s.v, s.v);
    const double energy = v2 / 2 - MU / r;
    const V3 h = cross(s.r, s.v);
    const double h2 = dot(h, h);
    o.inc = std::acos(clampd(h.z / std::sqrt(h2 > 0 ? h2 : 1), -1, 1));
    if (energy >= 0) {   // no top: apo reads 1e12 m and tApo 0; the bottom is the hyperbola's (the parabola's at e = 1)
        o.a = 0;
        o.e = std::sqrt(1 + 2 * energy * h2 / (MU * MU));
        o.apo = 1e12;
        o.peri = h2 / (MU * (1 + o.e)) - RE;
        o.tApo = 0;
        return o;
    }
    o.a = -MU / (2 * energy);
    o.e = std::sqrt(std::fmax(0.0, 1 + 2 * energy * h2 / (MU * MU)));
    o.apo = o.a * (1 + o.e) - RE;
    o.peri = o.a * (1 - o.e) - RE;
    // time to the top, through the eccentric anomaly
    const double nMean = std::sqrt(MU / (o.a * o.a * o.a));
    if (o.e < 1e-6) { o.tApo = 0; return o; }
    const double cosE = clampd((1 - r / o.a) / o.e, -1, 1);
    double E = std::acos(cosE);
    if (dot(s.r, s.v) < 0) E = 2 * PI - E;
    const double M = E - o.e * std::sin(E);
    double dM = PI - M;
    if (dM < 0) dM += 2 * PI;
    o.tApo = dM / nMean;
    return o;
}

V3 ringPos(double t) { return rotateAbout(ring.e1, ring.normal, ring.rate * (t - ring.tArr)) * ring.radius; }
V3 ringVel(double t) {
    const V3 radial = rotateAbout(ring.e1, ring.normal, ring.rate * (t - ring.tArr));
    return cross(ring.normal, radial) * (ring.rate * ring.radius);
}

V3 ringRef(double t) { return rotateAbout(ring.ref0, ring.axis, RING_SPIN * t); }

V3 siteDir(V3 x, double t) {   // the Earth has turned WE t since the start
    const double th = WE * t, c = std::cos(th), sn = std::sin(th);
    const V3 ef{c * x.x + sn * x.y, -sn * x.x + c * x.y, x.z};
    return {dot(ef, site.e), dot(ef, site.n), dot(ef, site.u)};
}

V3 sitePos(V3 x, double t) {
    const double th = WE * t, c = std::cos(th), sn = std::sin(th);
    const V3 d = V3{c * x.x + sn * x.y, -sn * x.x + c * x.y, x.z} - site.p0;
    return {dot(d, site.e), dot(d, site.n), dot(d, site.u)};
}

// ---- forces -------------------------------------------------------------------------------------

struct Deriv { V3 rd, vd; Q qd; V3 wd; double propd; };

// The drive's thrust in the body: along the nose with the swivel aft, toward the craft's top (-z) with it
// down, and through the centre of mass at every angle between.
V3 thrustAxis(double nozzle) { return {std::cos(nozzle), 0, -std::sin(nozzle)}; }

GearLoad gearLoad(const State& s, V3 r, V3 v, Q q, V3 w) {
    GearLoad out{{0, 0, 0}, {0, 0, 0}, 0};
    if (!s.gear) return out;
    const V3 xb = rot(q, {1, 0, 0});
    for (int i = 0; i < 3; ++i) {
        const V3 arm = rot(q, GEAR[i]);
        const V3 p = r + arm;
        const double pm = norm(p);
        const double depth = RE - pm;
        if (depth <= 0) continue;
        // The ground is level where a plumb line says: square to gravity and the Earth's turn together,
        // as the real, oblate Earth's surface is. Square to the sphere instead, a parked craft would
        // slide toward the equator.
        const V3 spin = cross(V3{0, 0, WE}, p);
        const V3 up = unit(p * (MU / (pm * pm * pm)) + cross(V3{0, 0, WE}, spin));
        const V3 vp = v + rot(q, cross(w, GEAR[i])) - spin;   // against the ground
        const double sink = -dot(vp, up);
        double nrm = GEAR_K[i] * depth + GEAR_C[i] * sink;
        if (nrm <= 0) continue;
        out.contact = 1;
        V3 fwd = unit(xb - up * dot(xb, up));
        if (i == 0) fwd = rotateAbout(fwd, up, -s.steer);   // the nose wheel turns with the pedals
        const V3 left = cross(up, fwd);
        const double vf = dot(vp, fwd), vl = dot(vp, left);
        const double roll = (0.02 + 0.5 * s.brake * (i == 0 ? 0 : 1)) * nrm * std::tanh(vf / 0.5);
        const double side = clampd(4.0e5 * vl, -0.8 * nrm, 0.8 * nrm);
        const V3 f = up * nrm - fwd * roll - left * side;
        out.force = out.force + f;
        out.moment = out.moment + cross(GEAR[i], irot(q, f));
    }
    return out;
}

// t: the time of the stage, for what moves with the ring (the deck).
Deriv deriv(const State& s, double t, V3 r, V3 v, Q q, V3 w, double prop) {
    Deriv d;
    const double rm = norm(r), mass = M_DRY + prop;
    V3 acc = r * (-MU / (rm * rm * rm));
    V3 mom = s.torque;

    // the air
    const V3 vAir = v - cross(V3{0, 0, WE}, r);
    const V3 vb = irot(q, vAir);
    const double tas = norm(vb);
    V3 fBody{0, 0, 0};
    if (tas > 0.5) {
        const Air air = atmosphere(rm - RE);
        const double qbar = 0.5 * air.rho * tas * tas;
        if (qbar > 1e-6) {
            const double alpha = std::atan2(vb.z, vb.x), beta = std::asin(clampd(vb.y / tas, -1, 1));
            double cl, cd;
            liftDrag(alpha, tas / air.sound, &cl, &cd);
            const V3 vhat = vb * (1.0 / tas);
            const V3 lhat = unit(cross(V3{0, 1, 0}, vhat));   // lift: across the wind, in the plane of symmetry
            fBody = (vhat * (-cd) + lhat * cl + V3{0, CY_BETA * beta, 0}) * (qbar * S_REF);
            mom = mom + airMoment(qbar, tas, alpha, beta, w);
        }
    }
    // the drive and the small thrusters
    const double thrust = prop > 0 ? s.thr * T_MAX : 0;
    fBody = fBody + (s.nozzle != 0 ? thrustAxis(s.nozzle) * thrust : V3{thrust, 0, 0}) + s.rcs * mass;
    acc = acc + rot(q, fBody) * (1.0 / mass);

    const GearLoad gl = gearLoad(s, r, v, q, w);
    acc = acc + gl.force * (1.0 / mass);
    mom = mom + gl.moment;
    const GearLoad dl = deckGearLoad(s, t, r, v, q, w);   // the gear on the ring's deck (deck.cpp)
    acc = acc + dl.force * (1.0 / mass);
    mom = mom + dl.moment;

    d.rd = v;
    d.vd = acc;
    d.qd = qmul(q, Q{0, w.x * 0.5, w.y * 0.5, w.z * 0.5});
    d.wd = {(mom.x - (IZZ - IYY) * w.y * w.z) / IXX, (mom.y - (IXX - IZZ) * w.z * w.x) / IYY,
            (mom.z - (IYY - IXX) * w.x * w.y) / IZZ};
    d.propd = -thrust / (ISP * G0);
    return d;
}

void integrate(State& s) {
    const double h = OC_DT;
    auto qadd = [](Q a, Q b, double k) { return Q{a.w + b.w * k, a.x + b.x * k, a.y + b.y * k, a.z + b.z * k}; };
    const double t = timeOf(s);
    const Deriv k1 = deriv(s, t, s.r, s.v, s.q, s.w, s.prop);
    const Deriv k2 = deriv(s, t + h / 2, s.r + k1.rd * (h / 2), s.v + k1.vd * (h / 2), qadd(s.q, k1.qd, h / 2), s.w + k1.wd * (h / 2), s.prop + k1.propd * h / 2);
    const Deriv k3 = deriv(s, t + h / 2, s.r + k2.rd * (h / 2), s.v + k2.vd * (h / 2), qadd(s.q, k2.qd, h / 2), s.w + k2.wd * (h / 2), s.prop + k2.propd * h / 2);
    const Deriv k4 = deriv(s, t + h, s.r + k3.rd * h, s.v + k3.vd * h, qadd(s.q, k3.qd, h), s.w + k3.wd * h, s.prop + k3.propd * h);
    const double c = h / 6;
    s.r = s.r + (k1.rd + k2.rd * 2 + k3.rd * 2 + k4.rd) * c;
    s.v = s.v + (k1.vd + k2.vd * 2 + k3.vd * 2 + k4.vd) * c;
    s.q = qunit(Q{s.q.w + (k1.qd.w + 2 * k2.qd.w + 2 * k3.qd.w + k4.qd.w) * c, s.q.x + (k1.qd.x + 2 * k2.qd.x + 2 * k3.qd.x + k4.qd.x) * c,
                  s.q.y + (k1.qd.y + 2 * k2.qd.y + 2 * k3.qd.y + k4.qd.y) * c, s.q.z + (k1.qd.z + 2 * k2.qd.z + 2 * k3.qd.z + k4.qd.z) * c});
    s.w = s.w + (k1.wd + k2.wd * 2 + k3.wd * 2 + k4.wd) * c;
    s.prop = std::fmax(0.0, s.prop + (k1.propd + 2 * k2.propd + 2 * k3.propd + k4.propd) * c);
}

// ---- the stability plane: rates in, torque out --------------------------------------------------

// The attitude whose nose points along dir and whose belly faces the Earth, rolled by roll.
Q attitudeToward(V3 dir, V3 up, double roll, Q fallback) {
    const V3 x = unit(dir);
    V3 y = cross(up * -1.0, x);
    if (norm(y) < 0.05) y = rot(fallback, {0, 1, 0}) - x * dot(rot(fallback, {0, 1, 0}), x);
    y = unit(y);
    V3 z = cross(x, y);
    y = rotateAbout(y, x, roll);
    z = rotateAbout(z, x, roll);
    return fromAxes(x, y, z);
}

// The body rates that turn the craft toward a target attitude.
V3 ratesToward(const State& s, Q target, double gain, double limit) {
    Q e = qmul(qconj(s.q), target);
    if (e.w < 0) e = {-e.w, -e.x, -e.y, -e.z};
    V3 w = V3{e.x, e.y, e.z} * (2 * gain);
    const double m = norm(w);
    return m > limit ? w * (limit / m) : w;
}

// The torque that chases a rate command, inside what the surfaces, thrusters and gimbal can give.
void rateLoop(State& s, const Local& L, V3 wc) {
    const double kq = L.qbar * S_REF;
    const double tvc = s.onGround ? 0 : TVC_ANG * s.thr;
    const double rcsOn = s.onGround ? 0 : 1;
    const double jet = s.onGround ? 0 : s.thr * std::sin(s.nozzle);   // jet-borne: the roll posts and the lift jet
    const double lim[3] = {kq * SPAN * CL_CTRL + IXX * (RCS_ANG[0] * rcsOn + ROLL_POST_ANG * jet),
                           kq * CHORD * CM_CTRL + IYY * (RCS_ANG[1] * rcsOn + tvc + LIFT_JET_ANG * jet),
                           kq * SPAN * CN_CTRL + IZZ * (RCS_ANG[2] * rcsOn + tvc)};
    // Dynamic inversion: the torque that gives the wanted angular acceleration, less what the air and
    // the spin already give. The law knows the craft exactly; a real one would not.
    const double gain = 4.0;
    const V3 air = L.tas > 0.5 && L.qbar > 1e-6 ? airMoment(L.qbar, L.tas, L.alpha, L.beta, s.w) : V3{0, 0, 0};
    const V3 gyro = cross(s.w, V3{IXX * s.w.x, IYY * s.w.y, IZZ * s.w.z});
    const V3 need = V3{IXX * gain * (wc.x - s.w.x), IYY * gain * (wc.y - s.w.y), IZZ * gain * (wc.z - s.w.z)} + gyro - air;
    s.torque = {clampd(need.x, -lim[0], lim[0]), clampd(need.y, -lim[1], lim[1]), clampd(need.z, -lim[2], lim[2])};
}

// The law in the air: hold a pitch and a bank, and turn in balance.
V3 airLaw(State& s, const Local& L, double yawRate) {
    const double thetaDot = 1.5 * (s.thetaT - L.pitch), phiDot = 2.0 * wrap(s.phiT - L.roll);
    const double vh = std::fmax(40.0, L.tas * std::cos(L.pitch));
    double psiDot = s.onGround ? 0 : clampd(G0 * std::tan(clampd(L.roll, -1.2, 1.2)) / vh, -0.3, 0.3);
    psiDot += yawRate;
    const double sp = std::sin(L.roll), cp = std::cos(L.roll), st = std::sin(L.pitch), ct = std::cos(L.pitch);
    return {phiDot - psiDot * st, thetaDot * cp + psiDot * ct * sp, -thetaDot * sp + psiDot * ct * cp + (s.onGround ? 0 : 1.0 * L.beta)};
}

// ---- the scripted crew --------------------------------------------------------------------------

double pitchSchedule(double alt) {   // degrees of nose above the horizon, by height (chosen)
    static const double h[] = {2000, 5000, 10000, 20000, 30000, 40000};
    static const double p[] = {28, 45, 58, 60, 55, 48};
    const int n = sizeof h / sizeof h[0];
    if (alt <= h[0]) return p[0];
    for (int i = 0; i < n - 1; ++i)
        if (alt < h[i + 1]) return p[i] + (p[i + 1] - p[i]) * (alt - h[i]) / (h[i + 1] - h[i]);
    return p[n - 1];
}

// Along the track: the horizontal unit vector of the inertial velocity, the plane the craft is in.
V3 alongTrack(const State& s, const Local& L) { return unit(s.v - L.up * L.vs); }

// Point the nose, belly to the Earth.
V3 point(const State& s, const Local& L, V3 dir, double gain, double limit) {
    return ratesToward(s, attitudeToward(dir, L.up, 0, s.q), gain, limit);
}

// The horizontal speed still to gain: the angular momentum of a round orbit at the ring's height, less
// the craft's, over the mean radius between.
double horizontalToGo(const State& s, const Local& L) {
    const double rT = RE + H_TARGET, rm = norm(s.r);
    const double vh = dot(s.v, alongTrack(s, L));
    return (rT * std::sqrt(MU / rT) - rm * vh) / (0.5 * (rm + rT));
}

// Powered explicit guidance, cut down (after the Shuttle's PEG): over the rest of the burn the sine of
// the thrust's elevation is linear in time, f = f0 + f1 t, chosen so that the climb to the ring's height
// is done and the climb rate gone when the horizontal speed is a round orbit's. Thrust and mass follow
// the rocket equation; the pull of gravity, less what the speed already holds up, falls linearly to
// nothing at the end. The burn's length is iterated until the horizontal speed it gives is the speed
// still to gain.
void pegSolve(State& s, const Local& L) {
    const double rT = RE + H_TARGET, rm = norm(s.r);
    const double vh = dot(s.v, alongTrack(s, L)), vs = L.vs;
    const double ve = ISP * G0, mdot = T_MAX / ve, tau = (M_DRY + s.prop) / mdot;
    const double g0 = MU / (rm * rm) - vh * vh / rm;
    const double need = horizontalToGo(s, L);
    const double tMax = 0.999 * s.prop / mdot;
    double T = std::fmin(tMax, tau * (1 - std::exp(-need / ve)));
    double f0 = 0, f1 = 0;
    for (int k = 0; k < 6 && T > 1; ++k) {
        const double L0 = ve * std::log(tau / (tau - T)), L1 = tau * L0 - ve * T;
        const double S0 = T * L0 - L1, J = tau * L1 - ve * T * T / 2, S1 = T * L1 - J;
        const double B1 = g0 * T / 2 - vs, B2 = rT - rm - vs * T + g0 * T * T / 3;
        const double det = L0 * S1 - L1 * S0;
        if (std::fabs(det) < 1e-9) break;
        f0 = (B1 * S1 - L1 * B2) / det;
        f1 = (L0 * B2 - S0 * B1) / det;
        double dvh = 0;   // the horizontal speed this steering gives, by Simpson's rule
        const int n = 8;
        for (int i = 0; i <= n; ++i) {
            const double t = T * i / n, f = clampd(f0 + f1 * t, -0.9, 0.9);
            dvh += (i == 0 || i == n ? 1 : (i % 2 ? 4 : 2)) * ve / (tau - t) * std::sqrt(1 - f * f);
        }
        dvh *= T / (3 * n);
        const double fEnd = clampd(f0 + f1 * T, -0.9, 0.9);
        T = std::fmin(tMax, std::fmax(1.0, T + (need - dvh) / (ve / (tau - T) * std::sqrt(1 - fEnd * fEnd))));
    }
    s.pegF0 = f0;
    s.pegF1 = f1;
    s.pegT = T;
    s.pegAt = timeOf(s);
    s.pegValid = 1;
}

void crew(State& s, const Local& L, double* throttle) {
    const double t = timeOf(s);
    s.brake = 0;
    s.steer = 0;
    V3 wc{0, 0, 0};
    switch (s.phase) {
    case OC_PH_HOLD:
        *throttle = 0;
        s.brake = 1;
        s.thetaT = L.pitch;
        s.phiT = 0;
        if (t >= T_GO) s.phase = OC_PH_ROLL;
        wc = airLaw(s, L, 0);
        break;
    case OC_PH_ROLL: {
        *throttle = 0.6;
        const double err = wrap(site.hdg - L.heading);
        s.steer = clampd(2.0 * err - 0.5 * s.w.z, -0.3, 0.3);
        s.thetaT = L.pitch;
        s.phiT = 0;
        wc = airLaw(s, L, clampd(1.0 * err, -0.1, 0.1));
        if (L.tas >= 95) s.phase = OC_PH_ROTATE;
        break;
    }
    case OC_PH_ROTATE:
        *throttle = 0.7;
        s.thetaT = std::fmin(s.thetaT + 3 * D2R * OC_DT, 13 * D2R);
        s.phiT = 0;
        wc = airLaw(s, L, 0);
        if (!s.onGround && L.alt > 40) { s.gear = 0; s.phase = OC_PH_CLIMB; }
        break;
    case OC_PH_CLIMB: {   // an aeroplane's climb; the turn to the launch azimuth starts at 300 m
        *throttle = 0.9;
        s.thetaT += clampd(28 * D2R - s.thetaT, -2 * D2R * OC_DT, 2 * D2R * OC_DT);
        s.phiT = L.alt > 300 ? clampd(1.2 * wrap(AZIMUTH - L.heading), -30 * D2R, 30 * D2R) : 0;
        wc = airLaw(s, L, 0);
        if (L.alt > 2000) s.phase = OC_PH_ASCENT;
        break;
    }
    case OC_PH_ASCENT: {   // full power on a pitch schedule through the air, eased through the highest pressure
        *throttle = clampd(1 - (L.qbar - 30000) / 20000, 0.7, 1.0);
        const double want = pitchSchedule(L.alt) * D2R;
        s.thetaT += clampd(want - s.thetaT, -1.5 * D2R * OC_DT, 1.5 * D2R * OC_DT);
        s.phiT = clampd(1.2 * wrap(AZIMUTH - L.heading), -25 * D2R, 25 * D2R);
        wc = airLaw(s, L, 0);
        if (L.alt > 30000 && L.qbar < 1000) { s.phase = OC_PH_INSERT; s.pegValid = 0; }
        break;
    }
    case OC_PH_INSERT: {   // above the air: guided to a round orbit at the ring's height
        const double need = horizontalToGo(s, L);
        if (need <= 0 || s.prop <= 0) { *throttle = 0; s.phase = OC_PH_ORBIT; s.holdValid = 0; break; }
        if (!s.pegValid || s.pegT - (t - s.pegAt) > 8) pegSolve(s, L);   // the last seconds fly the last solution
        const double f = clampd(s.pegF0 + s.pegF1 * (t - s.pegAt), -0.9, 0.9);
        const double aMax = T_MAX / (M_DRY + s.prop);
        *throttle = clampd(need / (2.0 * aMax), 0.05, 1.0);   // the last metres a second gently
        wc = point(s, L, alongTrack(s, L) * std::sqrt(1 - f * f) + L.up * f, 1.5, 0.3);
        break;
    }
    default: {   // in orbit: face the ring and wait for the pilot
        *throttle = 0;
        const V3 dir = ring.valid ? unit(ringPos(t) - s.r) : unit(s.v);
        wc = point(s, L, dir, 1.0, 0.15);
        break;
    }
    }
    rateLoop(s, L, wc);
}

// ---- the crew's approach ------------------------------------------------------------------------
// The small thrusters only, the nose on the ring: close on the hold point at a speed that the thrusters
// can still take off before it, then hold there. Hill's equations are left to the feedback: the pull
// that differs between the craft and the ring is a few hundredths of a metre a second squared at
// these ranges, and the thrusters give fifty.

V3 holdPoint(double t) { return ringPos(t) - ring.axis * (OC_HUB_PORT_M + OC_STANDOFF_M); }

void approach(State& s, const Local& L, double* throttle) {
    const double t = timeOf(s);
    *throttle = 0;
    s.brake = 0;
    s.steer = 0;
    const V3 dr = s.r - dockSafeAim(s, holdPoint(t)), dv = s.v - ringVel(t);   // round the ring, not through it (dock.cpp)
    const double d = norm(dr);
    const double speed = std::fmin(40.0, std::fmin(std::sqrt(2 * 0.25 * d), 0.1 * d));
    const V3 want = d > 1e-3 ? dr * (-speed / d) : V3{0, 0, 0};
    const V3 acc = (want - dv) * 0.5;
    const V3 body = irot(s.q, acc);
    s.rcs = {clampd(body.x, -RCS_ACC, RCS_ACC), clampd(body.y, -RCS_ACC, RCS_ACC), clampd(body.z, -RCS_ACC, RCS_ACC)};
    rateLoop(s, L, point(s, L, ringPos(t) - s.r, 1.0, 0.15));
}

// ---- the pilot ----------------------------------------------------------------------------------

void pilot(State& s, const Local& L, double* throttle) {
    *throttle = clampd(hands.throttle, 0, 1);
    s.gear = hands.gearDown ? 1 : 0;
    s.brake = clampd(hands.brake, 0, 1);
    s.steer = clampd(hands.yaw, -1, 1) * 30 * D2R / (1 + L.tas / 15);
    if (s.sas == OC_SAS_DECK && deckPilot(s, L, throttle)) return;   // jet-borne, on the deck's terms (deck.cpp)
    const bool air = s.onGround || L.qbar > (s.atmoLaw ? 200 : 400);
    V3 wc;
    if (air) {
        if (!s.atmoLaw) { s.thetaT = L.pitch; s.phiT = L.roll; }
        s.atmoLaw = 1;
        s.holdValid = 0;
        s.thetaT = clampd(s.thetaT + hands.pitch * 12 * D2R * OC_DT, -80 * D2R, 80 * D2R);
        s.phiT = s.onGround ? 0 : clampd(s.phiT + hands.roll * 45 * D2R * OC_DT, -75 * D2R, 75 * D2R);
        wc = airLaw(s, L, hands.yaw * 6 * D2R);
    } else {
        s.atmoLaw = 0;
        const bool moving = std::fabs(hands.pitch) > 0.02 || std::fabs(hands.roll) > 0.02 || std::fabs(hands.yaw) > 0.02;
        if (moving) {
            wc = {hands.roll * 0.5, hands.pitch * 0.25, hands.yaw * 0.25};
            s.holdValid = 0;
        } else {
            if (!s.holdValid) { s.hold = s.q; s.holdValid = 1; }
            Q target = s.hold;
            const double t = timeOf(s);
            if (s.sas == OC_SAS_PROGRADE) target = attitudeToward(s.v, L.up, 0, s.q);
            else if (s.sas == OC_SAS_RETROGRADE) target = attitudeToward(s.v * -1.0, L.up, 0, s.q);
            else if (s.sas == OC_SAS_TARGET && ring.valid) target = attitudeToward(ringPos(t) - s.r, L.up, 0, s.q);
            wc = ratesToward(s, target, 1.0, 0.25);
            if (s.sas == OC_SAS_PORT && ring.valid) wc = dockHoldRates(s);   // lined up on the port, turning with it (dock.cpp)
        }
    }
    s.rcs = V3{clampd(hands.tx, -1, 1), clampd(hands.ty, -1, 1), clampd(hands.tz, -1, 1)} * RCS_ACC;
    rateLoop(s, L, wc);
}

// ---- one step -----------------------------------------------------------------------------------

void stepOnce(State& s) {
    if (dockRide(s)) { ++s.n; return; }   // docked, or wrecked on the ring: the ring carries the craft (dock.cpp)
    if (s.crashed) { ++s.n; return; }
    const Local L = localOf(s);
    s.rcs = {0, 0, 0};
    s.nozzleCmd = 0;   // a law that does not swivel the drive flies with it aft
    double throttle = 0;
    if (s.autoMode == OC_AUTO_CREW) crew(s, L, &throttle);
    else if (s.autoMode == OC_AUTO_APPROACH) approach(s, L, &throttle);
    else if (s.autoMode == OC_AUTO_RETURN) returnCrew(s, L, &throttle);   // return.cpp
    else if (s.autoMode == OC_AUTO_DOCK) dockCrew(s, L, &throttle);       // dock.cpp
    else if (s.autoMode == OC_AUTO_DECK) deckCrew(s, L, &throttle);       // deck.cpp
    else pilot(s, L, &throttle);
    s.thr += (throttle - s.thr) * (OC_DT / 0.4);
    if ((throttle == 0 && s.thr < 1e-3) || s.prop <= 0) s.thr = 0;   // shut down, not idling forever
    s.nozzle += clampd(clampd(s.nozzleCmd, 0, NOZZLE_MAX) - s.nozzle, -NOZZLE_RATE * OC_DT, NOZZLE_RATE * OC_DT);   // the swivel at its rate
    const double vsBefore = L.vs;
    integrate(s);
    ++s.n;
    const GearLoad gl = gearLoad(s, s.r, s.v, s.q, s.w);
    const double alt = norm(s.r) - RE;
    if (gl.contact && !s.onGround && vsBefore < -8) s.crashed = 1;
    if (alt < 0.4 || (!s.gear && alt < 2.0)) s.crashed = 1;
    s.onGround = gl.contact;
    returnAfterStep(s);
    dockAfterStep(s);
    deckAfterStep(s);
}

// Where the ring waits. The core flies a copy of itself to orbit under the scripted crew and puts
// the ring ahead of where the crew arrives, in the same orbit, facing the arrival. A real launch
// window is the inverse problem, the ring given and the moment found; this sketch does not solve it.
void placeRing() {
    State f = g;
    f.autoMode = OC_AUTO_CREW;
    ring.valid = 0;
    const long long limit = (long long)(3000.0 / OC_DT);
    while (f.phase != OC_PH_ORBIT && !f.crashed && f.n < limit) stepOnce(f);
    ring.radius = RE + H_TARGET;
    ring.rate = std::sqrt(MU / (ring.radius * ring.radius * ring.radius));
    if (f.phase == OC_PH_ORBIT && !f.crashed) {
        ring.normal = unit(cross(f.r, f.v));
        ring.tArr = timeOf(f);
        ring.e1 = rotateAbout(unit(f.r - ring.normal * dot(f.r, ring.normal)), ring.normal, RING_AHEAD / ring.radius);
    } else {   // the crew did not make it: a ring over the start point, eastbound
        ring.normal = unit(cross(g.r, cross(V3{0, 0, WE}, g.r)));
        ring.tArr = 600;
        ring.e1 = unit(g.r);
    }
    ring.axis = cross(ring.normal, ring.e1);   // along the track where the craft arrives
    ring.ref0 = ring.normal;
    ring.valid = 1;
}

void writeOut() {
    const State& s = g;
    const Local L = localOf(s);
    const Orbit o = orbitOf(s);
    const double t = timeOf(s), th = WE * t, c = std::cos(th), sn = std::sin(th);
    auto toSite = [&](V3 x) {   // an ECI direction, seen in the turning site frame
        const V3 ef{c * x.x + sn * x.y, -sn * x.x + c * x.y, x.z};
        return V3{dot(ef, site.e), dot(ef, site.n), dot(ef, site.u)};
    };
    auto posSite = [&](V3 x) {
        const V3 ef{c * x.x + sn * x.y, -sn * x.x + c * x.y, x.z};
        const V3 d = ef - site.p0;
        return V3{dot(d, site.e), dot(d, site.n), dot(d, site.u)};
    };
    std::memset(out, 0, sizeof out);
    out[OC_T] = t;
    out[OC_PHASE] = s.phase;
    out[OC_AUTO] = s.autoMode;
    out[OC_SAS] = s.sas;
    out[OC_CRASHED] = s.crashed;
    out[OC_WINDOW] = T_GO - t;
    const V3 p = posSite(s.r);
    out[OC_SITE_E] = p.x; out[OC_SITE_N] = p.y; out[OC_SITE_U] = p.z;
    const Q qs = fromAxes(toSite(rot(s.q, {1, 0, 0})), toSite(rot(s.q, {0, 1, 0})), toSite(rot(s.q, {0, 0, 1})));
    out[OC_QW] = qs.w; out[OC_QX] = qs.x; out[OC_QY] = qs.y; out[OC_QZ] = qs.z;
    const V3 ef{c * s.r.x + sn * s.r.y, -sn * s.r.x + c * s.r.y, s.r.z};
    out[OC_LAT_DEG] = std::asin(clampd(ef.z / norm(ef), -1, 1)) * R2D;
    out[OC_LON_DEG] = std::atan2(ef.y, ef.x) * R2D;
    out[OC_ALT] = L.alt;
    out[OC_HDG_DEG] = std::fmod(L.heading * R2D + 360, 360);
    out[OC_PITCH_DEG] = L.pitch * R2D;
    out[OC_ROLL_DEG] = L.roll * R2D;
    out[OC_TAS] = L.tas; out[OC_MACH] = L.mach; out[OC_QBAR] = L.qbar; out[OC_VS] = L.vs;
    out[OC_ALPHA_DEG] = L.alpha * R2D; out[OC_BETA_DEG] = L.beta * R2D;
    const Deriv d = deriv(s, t, s.r, s.v, s.q, s.w, s.prop);
    const double rm = norm(s.r);
    out[OC_G] = norm(d.vd - s.r * (-MU / (rm * rm * rm))) / G0;
    out[OC_VORB] = norm(s.v);
    out[OC_APO] = o.apo; out[OC_PERI] = o.peri; out[OC_INC_DEG] = o.inc * R2D; out[OC_T_APO] = o.tApo;
    out[OC_THROTTLE] = s.thr; out[OC_PROP] = s.prop; out[OC_MASS] = M_DRY + s.prop;
    out[OC_GEAR] = s.gear; out[OC_ON_GROUND] = s.onGround;
    const V3 rr = ringPos(t), rv = ringVel(t);
    const V3 rp = posSite(rr);
    out[OC_RING_E] = rp.x; out[OC_RING_N] = rp.y; out[OC_RING_U] = rp.z;
    const V3 ax = toSite(ring.axis), ref = toSite(ringRef(t));
    out[OC_RING_AX_E] = ax.x; out[OC_RING_AX_N] = ax.y; out[OC_RING_AX_U] = ax.z;
    out[OC_RING_REF_E] = ref.x; out[OC_RING_REF_N] = ref.y; out[OC_RING_REF_U] = ref.z;
    const V3 dr = rr - s.r, dv = rv - s.v;
    const double range = norm(dr);
    out[OC_RING_RANGE] = range;
    out[OC_RING_RATE] = range > 1 ? dot(dr, dv) / range : 0;
    const V3 sun = toSite(sunEci);
    out[OC_SUN_E] = sun.x; out[OC_SUN_N] = sun.y; out[OC_SUN_U] = sun.z;
    // relative to the ring, in the frame that turns with its orbit: what a pilot closing on it sees
    const V3 vrel = toSite(s.v - rv - cross(ring.normal * ring.rate, s.r - rr));
    out[OC_VREL_E] = vrel.x; out[OC_VREL_N] = vrel.y; out[OC_VREL_U] = vrel.z;
    out[OC_PORT_RANGE] = norm(holdPoint(t) - s.r);
    returnWriteOut(s);
    dockWriteOut(s);
    deckWriteOut(s);
}

}   // namespace oc

using namespace oc;

extern "C" {

void oc_reset(double lat_deg, double lon_deg, double heading_deg) {
    if (!std::isfinite(lat_deg) || !std::isfinite(lon_deg) || !std::isfinite(heading_deg)) return;   // refused: no such place
    const double la = lat_deg * D2R, lo = lon_deg * D2R;
    site.lat = la; site.lon = lo; site.hdg = heading_deg * D2R;
    site.u = {std::cos(la) * std::cos(lo), std::cos(la) * std::sin(lo), std::sin(la)};
    site.e = {-std::sin(lo), std::cos(lo), 0};
    site.n = cross(site.u, site.e);
    site.p0 = site.u * RE;
    std::memset(&g, 0, sizeof g);
    std::memset(&hands, 0, sizeof hands);
    returnReset(g);
    dockReset(g);
    deckReset(g);
    hands.gearDown = 1;
    hands.brake = 1;
    const V3 fwd = site.e * std::sin(site.hdg) + site.n * std::cos(site.hdg);
    const V3 down = site.u * -1.0;
    g.q = fromAxes(fwd, cross(down, fwd), down);
    g.r = site.u * (RE + 2.9);   // the wheels just touching
    g.v = cross(V3{0, 0, WE}, g.r);
    g.w = {0, 0, 0};
    g.prop = M_PROP0;
    g.gear = 1;
    g.onGround = 1;
    g.phase = OC_PH_HOLD;
    g.autoMode = OC_AUTO_CREW;
    g.sas = OC_SAS_HOLD;
    skyReset(site);   // sky.cpp: the Sun (and the Moon) at the flight's date and time
    placeRing();
    writeOut();
}

void oc_controls(double pitch, double roll, double yaw, double throttle, double tx, double ty, double tz, int gear_down, double brake) {
    if (std::isnan(pitch) || std::isnan(roll) || std::isnan(yaw) || std::isnan(throttle) || std::isnan(tx) || std::isnan(ty) || std::isnan(tz) ||
        std::isnan(brake))
        return;   // refused, not clamped: a value that is not a number has no nearest legal one
    hands = {clampd(pitch, -1, 1), clampd(roll, -1, 1), clampd(yaw, -1, 1), clampd(throttle, 0, 1), tx, ty, tz, gear_down, brake};
}

void oc_auto(int mode) {
    if (mode == g.autoMode) return;
    const bool known = mode == OC_AUTO_CREW || mode == OC_AUTO_APPROACH || mode == OC_AUTO_RETURN || mode == OC_AUTO_DOCK || mode == OC_AUTO_DECK;
    g.autoMode = known ? mode : OC_AUTO_OFF;
    g.atmoLaw = 0;
    g.holdValid = 0;
    if (g.autoMode == OC_AUTO_RETURN) returnEngage(g);
    if (g.autoMode == OC_AUTO_DOCK) dockEngage(g);
    if (g.autoMode == OC_AUTO_DECK) deckEngage(g);
    if (g.autoMode != OC_AUTO_CREW) { writeOut(); return; }
    // The crew picks up where the craft is, not where it last left off.
    const Local L = localOf(g);
    const Orbit o = orbitOf(g);
    if (o.peri > 150000) g.phase = OC_PH_ORBIT;
    else if (g.onGround) g.phase = L.tas >= 95 ? OC_PH_ROTATE : timeOf(g) < T_GO ? OC_PH_HOLD : OC_PH_ROLL;
    else if (L.alt < 2000) g.phase = OC_PH_CLIMB;
    else if (L.alt < 30000 || L.qbar > 1000) g.phase = OC_PH_ASCENT;
    else g.phase = OC_PH_INSERT;
    if (!g.onGround && L.alt > 40) g.gear = 0;
    g.thetaT = L.pitch;
    g.phiT = L.roll;
    g.pegValid = 0;
    writeOut();
}

void oc_sas(int mode) {
    g.sas = mode >= OC_SAS_HOLD && mode <= OC_SAS_DECK ? mode : OC_SAS_HOLD;
    g.deck.armed = 0;   // the deck hold takes its settings afresh from the craft as it finds it
    g.holdValid = 0;
    writeOut();
}

void oc_step(int n) {
    for (int i = 0; i < n; ++i) stepOnce(g);
    writeOut();
}

const double* oc_out(void) { return out; }
int oc_out_len(void) { return OC_COUNT; }

unsigned oc_hash(void) {   // FNV-1a over the doubles that are the state, then the features' own
    const double v[] = {(double)g.n, g.r.x, g.r.y, g.r.z, g.v.x, g.v.y, g.v.z, g.q.w, g.q.x, g.q.y, g.q.z,
                        g.w.x, g.w.y, g.w.z, g.prop, g.thr, (double)g.phase, (double)g.crashed,
                        (double)g.gear, (double)g.onGround, (double)g.autoMode, (double)g.sas, (double)g.atmoLaw, g.thetaT, g.phiT,
                        g.pegF0, g.pegF1, g.pegT, g.pegAt, (double)g.pegValid, g.hold.w, g.hold.x, g.hold.y, g.hold.z, (double)g.holdValid,
                        g.torque.x, g.torque.y, g.torque.z, g.rcs.x, g.rcs.y, g.rcs.z, g.steer, g.brake,
                        hands.pitch, hands.roll, hands.yaw, hands.throttle, hands.tx, hands.ty, hands.tz, (double)hands.gearDown, hands.brake};
    unsigned h = 2166136261u;
    hashDoubles(h, v, sizeof v / sizeof v[0]);
    returnHash(g, h);
    dockHash(g, h);
    deckHash(g, h);
    return h;
}

void oc_eci(double* r3, double* v3) {
    r3[0] = g.r.x; r3[1] = g.r.y; r3[2] = g.r.z;
    v3[0] = g.v.x; v3[1] = g.v.y; v3[2] = g.v.z;
}

void oc_atmosphere(double alt_m, double* rho, double* p, double* temp, double* sound) {
    const Air a = atmosphere(alt_m);
    *rho = a.rho; *p = a.p; *temp = a.temp; *sound = a.sound;
}

}   // extern "C"
