// A minimal ZIP writer and reader. Node built-ins only — packaging must not pull in a dependency to
// make one archive.
//
// Stored or deflated entries, no ZIP64, no encryption, no comment. The writer is deterministic: the
// same entries and the same date give the same bytes. Dates are written in UTC so the archive does
// not depend on the packaging machine's time zone.

import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib';

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;

/** Made by UNIX, spec 2.0 — so unzip on Linux and macOS restores the mode bits below. */
const MADE_BY = (3 << 8) | 20;
const NEEDED = 20;
const FILE_MODE = 0o100644;
const DIR_MODE = 0o040755;
const DOS_DIRECTORY = 0x10;
const MAX_U16 = 0xffff;
const MAX_U32 = 0xffffffff;

/** The zip epoch. Archives default to it so that nothing about the build machine leaks in. */
export const ZIP_EPOCH = new Date(Date.UTC(1980, 0, 1));

/** MS-DOS date and time fields for a moment, in UTC, at two-second resolution. */
export function dosDateTime(when) {
  const year = when.getUTCFullYear();
  if (!Number.isFinite(year) || year < 1980 || year > 2107) {
    throw new RangeError(`zip dates run from 1980 to 2107, got ${String(when)}`);
  }
  return {
    time: (when.getUTCHours() << 11) | (when.getUTCMinutes() << 5) | Math.floor(when.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((when.getUTCMonth() + 1) << 5) | when.getUTCDate(),
  };
}

function checkName(name) {
  const parts = name.split('/');
  if (!name || name.startsWith('/') || name.includes('\\') || parts.includes('..') || parts.includes('.')) {
    throw new Error(`refusing zip entry name "${name}": names are relative, forward-slashed, no . or ..`);
  }
}

/**
 * Build an archive from `{ name, data }` entries. A name ending in '/' is a directory and carries no
 * data. Entries are written in the order given; sort them first for a stable archive.
 */
export function zip(entries, when = ZIP_EPOCH) {
  const { time, date } = dosDateTime(when);
  if (entries.length > MAX_U16) throw new RangeError('more entries than a zip without ZIP64 can hold');

  const locals = [];
  const centrals = [];
  const seen = new Set();
  let offset = 0;

  for (const entry of entries) {
    checkName(entry.name);
    if (seen.has(entry.name)) throw new Error(`duplicate zip entry ${entry.name}`);
    seen.add(entry.name);

    const directory = entry.name.endsWith('/');
    if (directory && entry.data?.length) throw new Error(`directory entry ${entry.name} carries data`);
    const raw = directory ? Buffer.alloc(0) : Buffer.from(entry.data);
    const deflated = raw.length ? deflateRawSync(raw, { level: 9 }) : raw;
    const method = deflated.length < raw.length ? 8 : 0;
    const body = method === 8 ? deflated : raw;
    const name = Buffer.from(entry.name, 'utf8');
    const flags = /^[\x20-\x7e]*$/.test(entry.name) ? 0 : 0x0800; // bit 11: the name is UTF-8
    const crc = crc32(raw);
    if (raw.length > MAX_U32 || offset > MAX_U32) throw new RangeError('archive too large without ZIP64');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL, 0);
    local.writeUInt16LE(NEEDED, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL, 0);
    central.writeUInt16LE(MADE_BY, 4);
    central.writeUInt16LE(NEEDED, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra field length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk number
    central.writeUInt16LE(0, 36); // internal attributes
    central.writeUInt32LE((((directory ? DIR_MODE : FILE_MODE) << 16) | (directory ? DOS_DIRECTORY : 0)) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + body.length;
  }

  const directory = Buffer.concat(centrals);
  if (offset > MAX_U32 || directory.length > MAX_U32) throw new RangeError('archive too large without ZIP64');
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END, 0);
  end.writeUInt16LE(0, 4); // this disk
  end.writeUInt16LE(0, 6); // disk holding the central directory
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // comment length
  return Buffer.concat([...locals, directory, end]);
}

/**
 * Read an archive back: every entry's name, bytes, method and mode, with each CRC checked and each
 * local header cross-checked against the central directory. Throws on anything it does not expect.
 */
export function unzip(buf) {
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - MAX_U16); i--) {
    if (buf.readUInt32LE(i) === END) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('not a zip: no end-of-central-directory record');

  const count = buf.readUInt16LE(end + 10);
  const size = buf.readUInt32LE(end + 12);
  const start = buf.readUInt32LE(end + 16);
  if (start + size !== end) throw new Error('central directory does not end where the end record says');

  const entries = [];
  let p = start;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== CENTRAL) throw new Error(`entry ${i}: bad central header signature`);
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const packed = buf.readUInt32LE(p + 20);
    const length = buf.readUInt32LE(p + 24);
    const nameLength = buf.readUInt16LE(p + 28);
    const extraLength = buf.readUInt16LE(p + 30);
    const commentLength = buf.readUInt16LE(p + 32);
    const attributes = buf.readUInt32LE(p + 38);
    const at = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLength);

    if (flags & 0x0001) throw new Error(`${name}: encrypted entries are not supported`);
    if (buf.readUInt32LE(at) !== LOCAL) throw new Error(`${name}: bad local header signature`);
    const localName = buf.toString('utf8', at + 30, at + 30 + buf.readUInt16LE(at + 26));
    if (localName !== name) throw new Error(`${name}: local header names ${localName}`);
    if (buf.readUInt32LE(at + 14) !== crc) throw new Error(`${name}: local and central CRC differ`);
    const dataAt = at + 30 + buf.readUInt16LE(at + 26) + buf.readUInt16LE(at + 28);
    const body = buf.subarray(dataAt, dataAt + packed);

    let data;
    if (method === 0) data = Buffer.from(body);
    else if (method === 8) data = inflateRawSync(body);
    else throw new Error(`${name}: compression method ${method} is not supported`);
    if (data.length !== length) throw new Error(`${name}: ${data.length} bytes, central directory says ${length}`);
    if (crc32(data) !== crc) throw new Error(`${name}: CRC mismatch`);

    entries.push({ name, data, method, mode: attributes >>> 16 });
    p += 46 + nameLength + extraLength + commentLength;
  }
  if (p !== end) throw new Error('central directory has bytes past its last entry');
  return entries;
}
