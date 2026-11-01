// A runway and its ILS. See runway.h. GPLv3.

#include "runway.h"

#include <cmath>

namespace {

constexpr double kPi = 3.14159265358979323846;
constexpr double kRad = kPi / 180;
constexpr double kFt = 0.3048;
constexpr double kNm = 1852;
constexpr double kA = 6378137.0, kE2 = 6.69437999014e-3;  // WGS84
constexpr double kEarthR = 6371000.0;                       // for the curve under a long approach
constexpr double kLocAntennaPastEndM = 300;                 // ICAO's typical siting past the stop end
constexpr double kLocFullScaleAtThresholdM = 107;           // Annex 10: displacement sensitivity

// Metres north and east per radian of latitude and longitude at a latitude: the ellipsoid's radii.
void radii(double latDeg, double& north, double& east) {
  const double s = std::sin(latDeg * kRad), w = std::sqrt(1 - kE2 * s * s);
  north = kA * (1 - kE2) / (w * w * w);
  east = kA / w * std::cos(latDeg * kRad);
}

double locAntennaFromThresholdM(const Runway& r) {
  return r.lengthM - r.displacedM + kLocAntennaPastEndM;
}

double gsOriginPastThresholdM(const Runway& r) {
  return r.tchFt * kFt / std::tan(r.glideDeg * kRad);
}

}  // namespace

Runway lszh14() {
  Runway r;
  r.name = "LSZH 14";
  r.endLatDeg = 47.483101;
  r.endLonDeg = 8.53473;
  r.elevationFt = 1402;
  r.headingDeg = 137;
  r.lengthM = 10827 * kFt;
  r.widthM = 197 * kFt;
  r.displacedM = 492 * kFt;
  return r;
}

double locDotDeg(const Runway& r) {
  return std::atan(kLocFullScaleAtThresholdM / locAntennaFromThresholdM(r)) / kRad / 2;
}

double gsDotDeg(const Runway& r) {
  return 0.24 * r.glideDeg / 2;
}

void threshold(const Runway& r, double& latDeg, double& lonDeg) {
  double mn, me;
  radii(r.endLatDeg, mn, me);
  const double h = r.headingDeg * kRad;
  latDeg = r.endLatDeg + r.displacedM * std::cos(h) / mn / kRad;
  lonDeg = r.endLonDeg + r.displacedM * std::sin(h) / me / kRad;
}

IlsReading readIls(const Runway& r, double latDeg, double lonDeg, double heightAboveFieldFt) {
  double tLat, tLon, mn, me;
  threshold(r, tLat, tLon);
  radii(tLat, mn, me);
  const double north = (latDeg - tLat) * kRad * mn, east = (lonDeg - tLon) * kRad * me;
  const double h = r.headingDeg * kRad;
  IlsReading out;
  out.alongM = -(north * std::cos(h) + east * std::sin(h));  // the landing direction is along the heading
  out.rightM = -north * std::sin(h) + east * std::cos(h);
  const double ground = std::hypot(north, east);
  out.heightM = heightAboveFieldFt * kFt + ground * ground / (2 * kEarthR);

  const double fromLoc = out.alongM + locAntennaFromThresholdM(r);
  const double locDeg = std::atan2(out.rightM, fromLoc) / kRad;  // + when the aircraft is right of course
  out.locDots = -locDeg / locDotDeg(r);
  out.locValid = fromLoc > 0 && std::abs(locDeg) < 35 && fromLoc < 25 * kNm;

  const double fromGs = out.alongM + gsOriginPastThresholdM(r);
  out.aboveGlideM = out.heightM - std::tan(r.glideDeg * kRad) * fromGs;
  const double elevation = std::atan2(out.heightM, fromGs) / kRad;
  out.gsDots = (r.glideDeg - elevation) / gsDotDeg(r);
  // ICAO asks the glideslope to reach at least 10 nm; 12 here, so that a start 10 nm before the threshold
  // (291 m more from the glideslope's own origin) is inside it.
  out.gsValid = fromGs > 0 && std::abs(locDeg) < 8 && fromGs < 12 * kNm && elevation > 0.45 * r.glideDeg &&
                elevation < 1.75 * r.glideDeg;
  return out;
}

void onApproach(const Runway& r, double distanceNm, double locDots, double gsDots, double& latDeg, double& lonDeg,
                double& heightAboveFieldFt) {
  double tLat, tLon, mn, me;
  threshold(r, tLat, tLon);
  radii(tLat, mn, me);
  const double along = distanceNm * kNm;
  const double right = -std::tan(locDots * locDotDeg(r) * kRad) * (along + locAntennaFromThresholdM(r));
  const double h = r.headingDeg * kRad;
  const double north = -along * std::cos(h) - right * std::sin(h);
  const double east = -along * std::sin(h) + right * std::cos(h);
  latDeg = tLat + north / mn / kRad;
  lonDeg = tLon + east / me / kRad;
  const double elevation = r.glideDeg - gsDots * gsDotDeg(r);
  const double height = std::tan(elevation * kRad) * (along + gsOriginPastThresholdM(r));
  const double ground = std::hypot(north, east);
  heightAboveFieldFt = (height - ground * ground / (2 * kEarthR)) / kFt;
}
