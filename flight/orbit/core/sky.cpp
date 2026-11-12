// sky.cpp — the Sun and, to come, the Moon, for the flight's date and time. For now the Sun of 12
// November at one in the afternoon, local solar time, at the start: its declination -17.9 deg, the hour
// angle 15 deg west of the site (chosen), held fixed among the stars for the flight. Where the crew
// reaches the ring, a third of the way to the east, it is mid-afternoon, and the Sun is behind the craft
// as it closes on the ring. GPLv3.

#include "internal.h"

namespace oc {

void skyReset(const Site& site) {
    const double dec = -17.9 * D2R, sub = site.lon - 15.0 * D2R;
    sunEci = {std::cos(dec) * std::cos(sub), std::cos(dec) * std::sin(sub), std::sin(dec)};
}

}   // namespace oc
