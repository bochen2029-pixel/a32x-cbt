// A32NX's ARINC 429 word (fbw_a320/src/Arinc429.h), implemented here and compiled in place of their
// Arinc429.cpp. GPLv3.
//
// One departure, on purpose: a word starts as zero, its SSM FailureWarning and its data 0.0 — what a word
// in static storage already starts as. Upstream's constructors are empty, so a word built anywhere else,
// such as the bus the FCDC builds on the stack each tick (Fcdc.cpp:502), starts as whatever the memory
// held; setBit then converts that float to a uint32, undefined for garbage such as -1.46, and the result
// differs with the stack's contents (flybywiresim/aircraft#11007). Everything else does what the header
// declares and their implementation does, bit for bit: a discrete word keeps its bits in a float, and a
// sim variable packs the SSM above 32 bits of data.

#include "Arinc429.h"

#include <cstring>

template <typename T>
Arinc429Word<T>::Arinc429Word() : rawSsm(0), rawData(0) {}

template <typename T>
void Arinc429Word<T>::setFromSimVar(double simVar) {
  const auto packed = static_cast<uint64_t>(simVar);
  const auto data = static_cast<uint32_t>(packed & 0xffffffffu);
  rawSsm = static_cast<uint32_t>(packed >> 32);
  std::memcpy(&rawData, &data, sizeof rawData);
}

template <typename T>
void Arinc429Word<T>::setFromData(T data, Arinc429SignStatus ssm) {
  rawSsm = ssm;
  rawData = data;
}

template <typename T>
double Arinc429Word<T>::toSimVar() {
  uint32_t data = 0;
  std::memcpy(&data, &rawData, sizeof data);
  return static_cast<double>(static_cast<uint64_t>(data) | static_cast<uint64_t>(rawSsm) << 32);
}

template <typename T>
Arinc429SignStatus Arinc429Word<T>::ssm() const {
  return static_cast<Arinc429SignStatus>(rawSsm);
}

template <typename T>
void Arinc429Word<T>::setSsm(Arinc429SignStatus ssm) {
  rawSsm = static_cast<uint32_t>(ssm);
}

template <typename T>
void Arinc429Word<T>::setData(T data) {
  rawData = data;
}

template <typename T>
bool Arinc429Word<T>::isFw() const {
  return rawSsm == FailureWarning;
}

template <typename T>
bool Arinc429Word<T>::isNo() const {
  return rawSsm == NormalOperation;
}

template <typename T>
T Arinc429Word<T>::value() const {
  return rawData;
}

template <typename T>
T Arinc429Word<T>::valueOr(T defaultVal) const {
  return rawSsm == NormalOperation || rawSsm == FunctionalTest ? rawData : defaultVal;
}

// The two kinds of word A32NX builds, as their file instantiates them.
template class Arinc429Word<uint32_t>;
template class Arinc429Word<float>;

Arinc429DiscreteWord::Arinc429DiscreteWord() = default;

bool Arinc429DiscreteWord::bitFromValue(int bit) const {
  return (static_cast<uint32_t>(rawData) >> (bit - 1)) & 1u;
}

bool Arinc429DiscreteWord::bitFromValueOr(int bit, bool defaultVal) const {
  return rawSsm == NormalOperation || rawSsm == FunctionalTest ? bitFromValue(bit) : defaultVal;
}

void Arinc429DiscreteWord::setBit(int bit, bool value) {
  const uint32_t mask = 1u << (bit - 1);
  rawData = static_cast<float>((static_cast<uint32_t>(rawData) & ~mask) | (value ? mask : 0u));
}

Arinc429NumericWord::Arinc429NumericWord() = default;
