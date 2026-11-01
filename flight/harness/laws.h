// The laws and the computers' health, read the way the aircraft reads them: from the FCDC's EFCS
// status word and each computer's own health discrete. Shared by the runner and the flight core. GPLv3.

#pragma once

#include <string>

#include "Arinc429Utils.h"
#include "efcs.h"

enum class PitchLawState { Normal, Alternate1, Alternate2, Direct, None };
enum class LateralLawState { Normal, Direct, None };

inline const char* name(PitchLawState l) {
  switch (l) {
    case PitchLawState::Normal: return "normal";
    case PitchLawState::Alternate1: return "alternate-1";
    case PitchLawState::Alternate2: return "alternate-2";
    case PitchLawState::Direct: return "direct";
    case PitchLawState::None: return "none";
  }
  return "?";
}

inline const char* name(LateralLawState l) {
  switch (l) {
    case LateralLawState::Normal: return "normal";
    case LateralLawState::Direct: return "direct";
    case LateralLawState::None: return "none";
  }
  return "?";
}

// fcdc/Fcdc.cpp getBusOutputs: label 040 bits 11-17
inline PitchLawState pitchLaw(const base_arinc_429& w) {
  if (!Arinc429Utils::isNo(w)) return PitchLawState::None;
  if (Arinc429Utils::bitFromValue(w, 11)) return PitchLawState::Normal;
  if (Arinc429Utils::bitFromValue(w, 12)) return PitchLawState::Alternate1;
  if (Arinc429Utils::bitFromValue(w, 13)) return PitchLawState::Alternate2;
  if (Arinc429Utils::bitFromValue(w, 15)) return PitchLawState::Direct;
  return PitchLawState::None;
}

inline LateralLawState lateralLaw(const base_arinc_429& w) {
  if (!Arinc429Utils::isNo(w)) return LateralLawState::None;
  if (Arinc429Utils::bitFromValue(w, 16)) return LateralLawState::Normal;
  if (Arinc429Utils::bitFromValue(w, 17)) return LateralLawState::Direct;
  return LateralLawState::None;
}

inline bool allHealthy(const Transmitted& t) {
  bool ok = true;
  for (int i = 0; i < 2; ++i) ok = ok && t.elacDiscrete[i].digital_output_validated;
  for (int i = 0; i < 3; ++i) ok = ok && !t.secDiscrete[i].sec_failed;
  for (int i = 0; i < 2; ++i) ok = ok && t.facDiscrete[i].fac_healthy;
  for (int i = 0; i < 2; ++i) ok = ok && t.fcdcDiscrete[i].fcdcValid;
  return ok;
}
