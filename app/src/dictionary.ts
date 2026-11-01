/**
 * The state dictionary.
 *
 * Pattern recovered from PSX `Glob` / `Q` / `Qs` (notes 04): every addressable quantity is a
 * declared slot with a kind and a range; a write validates, stores and marks the slot dirty;
 * a reader can read-and-clear the dirty flag. The dictionary is the debrief bus, the panel
 * binding and the scenario file, all at once.
 *
 * No statics, no globals: one Dictionary per scenario instance, so a CBT can reset in
 * milliseconds and run two aircraft in one tab.
 */

export type Kind = 'bool' | 'int' | 'real' | 'string';

export interface VarSpec {
  readonly name: string;
  readonly kind: Kind;
  /** inclusive, for int/real */
  readonly min?: number;
  readonly max?: number;
  readonly unit?: string;
  /** shown in the debrief */
  readonly note?: string;
}

type Value = boolean | number | string;

interface Slot {
  spec: VarSpec;
  value: Value;
  dirty: boolean;
}

export class RangeError extends Error {}

export class Dictionary {
  private readonly slots = new Map<string, Slot>();

  declare(spec: VarSpec): void {
    if (this.slots.has(spec.name)) throw new Error(`duplicate variable ${spec.name}`);
    if (spec.kind === 'int' || spec.kind === 'real') {
      if (spec.min === undefined || spec.max === undefined) {
        throw new Error(`${spec.name}: numeric variables need min and max`);
      }
      if (spec.min > spec.max) throw new Error(`${spec.name}: min > max`);
    }
    this.slots.set(spec.name, { spec, value: defaultValue(spec), dirty: false });
  }

  /** All declared names, sorted, for the panel binder and the debrief. */
  names(): string[] {
    return [...this.slots.keys()].sort();
  }

  spec(name: string): VarSpec {
    return this.slot(name).spec;
  }

  get(name: string): Value {
    return this.slot(name).value;
  }

  num(name: string): number {
    const v = this.slot(name).value;
    if (typeof v !== 'number') throw new TypeError(`${name} is not numeric`);
    return v;
  }

  bool(name: string): boolean {
    const v = this.slot(name).value;
    if (typeof v !== 'boolean') throw new TypeError(`${name} is not boolean`);
    return v;
  }

  /**
   * Validate, store, mark dirty. Returns true when the value actually changed.
   * Out-of-range is refused, not clamped, and the write is a no-op — the PSX rule:
   * a caller that sends nonsense learns by watching the value not move.
   */
  set(name: string, next: Value): boolean {
    const slot = this.slot(name);
    const v = coerce(slot.spec, next);
    if (slot.value === v) return false;
    slot.value = v;
    slot.dirty = true;
    return true;
  }

  /** Read-and-clear. The edge detector every consumer uses. */
  take(name: string): boolean {
    const slot = this.slot(name);
    if (!slot.dirty) return false;
    slot.dirty = false;
    return true;
  }

  /** Values that changed since the last sweep, for the wire and the recorder. */
  drain(): Array<[string, Value]> {
    const out: Array<[string, Value]> = [];
    for (const [name, slot] of this.slots) {
      if (slot.dirty) {
        out.push([name, slot.value]);
        slot.dirty = false;
      }
    }
    return out;
  }

  /** Reset to declared defaults, keeping the declarations. A scenario reset costs this. */
  reset(): void {
    for (const slot of this.slots.values()) {
      slot.value = defaultValue(slot.spec);
      slot.dirty = false;
    }
  }

  private slot(name: string): Slot {
    const s = this.slots.get(name);
    if (!s) throw new Error(`unknown variable ${name}`);
    return s;
  }
}

function defaultValue(spec: VarSpec): Value {
  switch (spec.kind) {
    case 'bool':
      return false;
    case 'int':
    case 'real':
      return 0;
    case 'string':
      return '';
  }
}

function coerce(spec: VarSpec, next: Value): Value {
  switch (spec.kind) {
    case 'bool':
      if (typeof next !== 'boolean') throw new RangeError(`${spec.name}: expected boolean`);
      return next;
    case 'string':
      if (typeof next !== 'string') throw new RangeError(`${spec.name}: expected string`);
      return next;
    case 'int': {
      if (typeof next !== 'number' || !Number.isFinite(next) || !Number.isInteger(next)) {
        throw new RangeError(`${spec.name}: expected integer, got ${next}`);
      }
      if (next < spec.min! || next > spec.max!) {
        throw new RangeError(`${spec.name}: ${next} outside [${spec.min}, ${spec.max}]`);
      }
      return next;
    }
    case 'real': {
      if (typeof next !== 'number' || !Number.isFinite(next)) {
        throw new RangeError(`${spec.name}: expected finite number, got ${next}`);
      }
      if (next < spec.min! || next > spec.max!) {
        throw new RangeError(`${spec.name}: ${next} outside [${spec.min}, ${spec.max}]`);
      }
      return next;
    }
  }
}
