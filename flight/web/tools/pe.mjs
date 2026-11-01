// What a Windows program needs, read out of its PE image: its machine, its subsystem, its hardening flags
// and the DLLs it imports, delay-loaded ones included. Enough to show that the release's launcher runs on
// a bare Windows: the static CRT and system DLLs only. Node built-ins only. GPLv3.

const MACHINES = { 0x14c: 'x86', 0x8664: 'x64', 0xaa64: 'arm64' };
const SUBSYSTEMS = { 2: 'windows', 3: 'console' };
const DLL_FLAGS = { 0x20: 'high-entropy-va', 0x40: 'dynamic-base', 0x100: 'nx-compat', 0x4000: 'guard-cf' };

/** The DLLs a release's launcher may import: what every Windows 10 and 11 has. */
export const SYSTEM_DLLS = ['kernel32.dll', 'user32.dll', 'shell32.dll', 'advapi32.dll', 'ole32.dll'];

/** Read a PE image. Throws on anything that is not one. */
export function readPe(buf) {
  const fail = (why) => {
    throw new Error(`not a PE image: ${why}`);
  };
  if (buf.length < 0x40 || buf.readUInt16LE(0) !== 0x5a4d) fail('no MZ header');
  const pe = buf.readUInt32LE(0x3c);
  if (pe + 24 > buf.length || buf.readUInt32LE(pe) !== 0x00004550) fail('no PE signature');
  const machine = buf.readUInt16LE(pe + 4);
  const sectionCount = buf.readUInt16LE(pe + 6);
  const optionalSize = buf.readUInt16LE(pe + 20);
  const opt = pe + 24;
  const magic = buf.readUInt16LE(opt);
  if (magic !== 0x10b && magic !== 0x20b) fail(`optional header magic 0x${magic.toString(16)}`);
  const plus = magic === 0x20b;
  const subsystem = buf.readUInt16LE(opt + 68);
  const dllCharacteristics = buf.readUInt16LE(opt + 70);
  const directoryCount = buf.readUInt32LE(opt + (plus ? 108 : 92));
  const directories = opt + (plus ? 112 : 96);
  const directory = (i) => (i < directoryCount ? buf.readUInt32LE(directories + 8 * i) : 0);

  const sections = [];
  for (let i = 0, s = opt + optionalSize; i < sectionCount; i++, s += 40) {
    sections.push({
      name: buf.toString('latin1', s, s + 8).replace(/\0+$/, ''),
      va: buf.readUInt32LE(s + 12),
      size: Math.max(buf.readUInt32LE(s + 8), buf.readUInt32LE(s + 16)),
      raw: buf.readUInt32LE(s + 20),
    });
  }
  const at = (rva) => {
    const s = sections.find((x) => rva >= x.va && rva < x.va + x.size);
    if (!s) fail(`RVA 0x${rva.toString(16)} lies in no section`);
    return rva - s.va + s.raw;
  };
  const name = (rva) => {
    const from = at(rva);
    return buf.toString('latin1', from, buf.indexOf(0, from));
  };

  const imports = [];
  if (directory(1)) {
    for (let d = at(directory(1)); buf.readUInt32LE(d + 12) || buf.readUInt32LE(d + 16); d += 20) {
      imports.push(name(buf.readUInt32LE(d + 12)));
    }
  }
  const delayed = [];
  if (directory(13)) {
    for (let d = at(directory(13)); buf.readUInt32LE(d + 4); d += 32) delayed.push(name(buf.readUInt32LE(d + 4)));
  }

  return {
    machine: MACHINES[machine] ?? `0x${machine.toString(16)}`,
    subsystem: SUBSYSTEMS[subsystem] ?? String(subsystem),
    flags: Object.entries(DLL_FLAGS).filter(([bit]) => dllCharacteristics & Number(bit)).map(([, f]) => f),
    imports,
    delayed,
    sections: sections.map((s) => s.name),
  };
}

/**
 * Why this image would not run on a bare 64-bit Windows, or would run less hardened than a build of
 * ours should: a list, empty when there is nothing to say.
 */
export function bareWindowsProblems(image) {
  const problems = [];
  if (image.machine !== 'x64') problems.push(`built for ${image.machine}, not x64`);
  if (image.subsystem !== 'windows') problems.push(`a ${image.subsystem} program, not a windows one`);
  for (const dll of [...image.imports, ...image.delayed]) {
    if (!SYSTEM_DLLS.includes(dll.toLowerCase())) problems.push(`imports ${dll}, which Windows does not ship`);
  }
  for (const flag of ['dynamic-base', 'nx-compat', 'high-entropy-va', 'guard-cf']) {
    if (!image.flags.includes(flag)) problems.push(`not linked with ${flag}`);
  }
  return problems;
}
