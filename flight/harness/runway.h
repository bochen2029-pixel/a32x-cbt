// A runway and its ILS: where the threshold is, and what the localizer and the glideslope read at a
// position. GPLv3.
//
// The geometry is ICAO's (Annex 10, Volume I): the localizer at the far end, its sector set so that full
// scale falls 107 m either side of the centreline at the threshold; the glideslope from a point past the
// threshold such that the path crosses it at the threshold crossing height, full scale at 0.24 of the
// path angle above and below. The A320's PFD shows both full scale at two dots. A beam is reported where
// it lies from the aircraft: + right of it, + above it, so that flying toward the diamond centres it.

#pragma once

#include <string>

struct Runway {
  std::string name;
  double endLatDeg = 0, endLonDeg = 0;  // geodetic, WGS84: where the pavement begins
  double elevationFt = 0;
  double headingDeg = 0;                // true
  double lengthM = 0, widthM = 0;
  double displacedM = 0;                // the landing threshold, this far along from the end
  double glideDeg = 3.0, tchFt = 50;    // the glideslope's angle and threshold crossing height
};

// KDFW (Dallas Fort Worth) runway 17C: the simulator's main airport and its default start, by the
// operator's decision of 2026-11-01. From OurAirports (public domain), retrieved 2026-11-01: le end
// 32.91569901 N 97.02600098 W, 562 ft at both ends, 180.3 deg true, 13,400 x 150 ft, no displaced
// threshold; the field is 607 ft. 17C is level, which the flat terrain here needs, and DFW flies south
// flow most of the year.
Runway kdfw17c();

// LSZH (Zurich) runway 14, the alternative, from OurAirports (public domain), retrieved 2026-11-01: le
// end 47.483101 N 8.53473 E, 1,402 ft, 137 deg true, 10,827 x 197 ft, threshold displaced 492 ft.
Runway lszh14();

// Either of the above by its name ("KDFW17C", "LSZH14"); false if there is no such runway. The 3 deg path
// and the 50 ft crossing height on both are this project's (ROADMAP.md, P7 step 2), not their published ILS.
bool runwayNamed(const std::string& name, Runway& r);

// A point on the centreline, metres past the landing threshold.
void onCentreline(const Runway& r, double pastThresholdM, double& latDeg, double& lonDeg);

struct IlsReading {
  double locDots = 0, gsDots = 0;   // where each beam lies from the aircraft: + right, + up
  bool locValid = false, gsValid = false;
  double alongM = 0;                // before the threshold, toward the approach: +; past it: -
  double rightM = 0;                // right of the extended centreline, looking along the landing direction
  double heightM = 0;               // above the threshold, the earth's curve taken out
  double aboveGlideM = 0;           // above the glide path's straight line, here
};

// The threshold's position and the ILS read at a geodetic position and height above the field.
void threshold(const Runway& r, double& latDeg, double& lonDeg);
IlsReading readIls(const Runway& r, double latDeg, double lonDeg, double heightAboveFieldFt);

// The point on the approach where the localizer reads locDots and the glideslope gsDots, distanceNm before
// the threshold: its position and its height above the field.
void onApproach(const Runway& r, double distanceNm, double locDots, double gsDots, double& latDeg, double& lonDeg,
                double& heightAboveFieldFt);

// The dot sizes, in degrees, for a runway.
double locDotDeg(const Runway& r);
double gsDotDeg(const Runway& r);
