// orbit_run — fly the scripted crew headless and print the flight. Used to tune the crew's ascent
// and to read off what the README reports. Not part of the page.
#include "../core/orbit_core.h"
#include <cstdio>
#include <cstdlib>

int main(int argc, char** argv) {
    const double every = argc > 1 ? std::atof(argv[1]) : 10.0;
    const double limit = argc > 2 ? std::atof(argv[2]) : 1500.0;
    oc_reset(32.91569901, -97.02600098, 180.3);   // KDFW 17C, its end, true heading (docs/provenance.md 1f)
    const double* o = oc_out();
    std::printf("%7s %2s %8s %7s %5s %8s %7s %6s %6s %6s %8s %9s %7s %4s %6s %8s\n", "t", "ph", "alt_km", "tas", "mach", "qbar", "vs",
                "pitch", "alpha", "hdg", "apo_km", "peri_km", "prop", "g", "inc", "ring_km");
    const int per = (int)(every / OC_DT + 0.5);
    int lastPhase = -1;
    double maxQ = 0, maxG = 0;
    while (o[OC_T] < limit) {
        oc_step(1);
        if (o[OC_QBAR] > maxQ) maxQ = o[OC_QBAR];
        if (o[OC_G] > maxG && o[OC_T] > 1) maxG = o[OC_G];
        const long n = (long)(o[OC_T] / OC_DT + 0.5);
        if (n % per == 0 || (int)o[OC_PHASE] != lastPhase || o[OC_CRASHED] > 0) {
            std::printf("%7.1f %2d %8.3f %7.1f %5.2f %8.0f %7.1f %6.1f %6.1f %6.1f %8.1f %9.1f %7.0f %4.2f %6.2f %8.1f\n", o[OC_T], (int)o[OC_PHASE],
                        o[OC_ALT] / 1000, o[OC_TAS], o[OC_MACH], o[OC_QBAR], o[OC_VS], o[OC_PITCH_DEG], o[OC_ALPHA_DEG], o[OC_HDG_DEG],
                        o[OC_APO] / 1000, o[OC_PERI] / 1000, o[OC_PROP], o[OC_G], o[OC_INC_DEG], o[OC_RING_RANGE] / 1000);
            lastPhase = (int)o[OC_PHASE];
        }
        if (o[OC_CRASHED] > 0) { std::printf("CRASHED\n"); return 1; }
        if (o[OC_PHASE] == 6 && every > 0 && o[OC_T] > limit - 1) break;
    }
    std::printf("max q %.0f Pa, max g %.2f, hash %08x\n", maxQ, maxG, oc_hash());
    return 0;
}
