(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // src/dictionary.ts
  var RangeError2 = class extends Error {
  };
  var Dictionary = class {
    constructor() {
      __publicField(this, "slots", /* @__PURE__ */ new Map());
    }
    declare(spec) {
      if (this.slots.has(spec.name)) throw new Error(`duplicate variable ${spec.name}`);
      if (spec.kind === "int" || spec.kind === "real") {
        if (spec.min === void 0 || spec.max === void 0) {
          throw new Error(`${spec.name}: numeric variables need min and max`);
        }
        if (spec.min > spec.max) throw new Error(`${spec.name}: min > max`);
      }
      this.slots.set(spec.name, { spec, value: defaultValue(spec), dirty: false });
    }
    /** All declared names, sorted, for the panel binder and the debrief. */
    names() {
      return [...this.slots.keys()].sort();
    }
    spec(name) {
      return this.slot(name).spec;
    }
    get(name) {
      return this.slot(name).value;
    }
    num(name) {
      const v = this.slot(name).value;
      if (typeof v !== "number") throw new TypeError(`${name} is not numeric`);
      return v;
    }
    bool(name) {
      const v = this.slot(name).value;
      if (typeof v !== "boolean") throw new TypeError(`${name} is not boolean`);
      return v;
    }
    /**
     * Validate, store, mark dirty. Returns true when the value actually changed.
     * Out-of-range is refused, not clamped, and the write is a no-op — the PSX rule:
     * a caller that sends nonsense learns by watching the value not move.
     */
    set(name, next) {
      const slot = this.slot(name);
      const v = coerce(slot.spec, next);
      if (slot.value === v) return false;
      slot.value = v;
      slot.dirty = true;
      return true;
    }
    /** Read-and-clear. The edge detector every consumer uses. */
    take(name) {
      const slot = this.slot(name);
      if (!slot.dirty) return false;
      slot.dirty = false;
      return true;
    }
    /** Values that changed since the last sweep, for the wire and the recorder. */
    drain() {
      const out = [];
      for (const [name, slot] of this.slots) {
        if (slot.dirty) {
          out.push([name, slot.value]);
          slot.dirty = false;
        }
      }
      return out;
    }
    /** Reset to declared defaults, keeping the declarations. A scenario reset costs this. */
    reset() {
      for (const slot of this.slots.values()) {
        slot.value = defaultValue(slot.spec);
        slot.dirty = false;
      }
    }
    slot(name) {
      const s = this.slots.get(name);
      if (!s) throw new Error(`unknown variable ${name}`);
      return s;
    }
  };
  function defaultValue(spec) {
    switch (spec.kind) {
      case "bool":
        return false;
      case "int":
      case "real":
        return 0;
      case "string":
        return "";
    }
  }
  function coerce(spec, next) {
    switch (spec.kind) {
      case "bool":
        if (typeof next !== "boolean") throw new RangeError2(`${spec.name}: expected boolean`);
        return next;
      case "string":
        if (typeof next !== "string") throw new RangeError2(`${spec.name}: expected string`);
        return next;
      case "int": {
        if (typeof next !== "number" || !Number.isFinite(next) || !Number.isInteger(next)) {
          throw new RangeError2(`${spec.name}: expected integer, got ${next}`);
        }
        if (next < spec.min || next > spec.max) {
          throw new RangeError2(`${spec.name}: ${next} outside [${spec.min}, ${spec.max}]`);
        }
        return next;
      }
      case "real": {
        if (typeof next !== "number" || !Number.isFinite(next)) {
          throw new RangeError2(`${spec.name}: expected finite number, got ${next}`);
        }
        if (next < spec.min || next > spec.max) {
          throw new RangeError2(`${spec.name}: ${next} outside [${spec.min}, ${spec.max}]`);
        }
        return next;
      }
    }
  }

  // src/clock.ts
  var Clock = class {
    constructor(hz = 20, maxCatchUp = 5) {
      __publicField(this, "stepMs");
      __publicField(this, "dt");
      /** most steps a single advance() may run; keeps a stalled tab from spiralling */
      __publicField(this, "maxCatchUp");
      __publicField(this, "accumulated", 0);
      __publicField(this, "steps", 0);
      if (hz <= 0) throw new RangeError("hz must be positive");
      this.stepMs = 1e3 / hz;
      this.dt = 1 / hz;
      this.maxCatchUp = maxCatchUp;
    }
    /** How many fixed steps are due for this much wall time. Never returns > maxCatchUp. */
    advance(realMs) {
      if (!Number.isFinite(realMs) || realMs < 0) throw new RangeError("realMs must be finite and >= 0");
      this.accumulated += realMs;
      let due2 = Math.floor(this.accumulated / this.stepMs);
      if (due2 > this.maxCatchUp) {
        this.accumulated -= (due2 - this.maxCatchUp) * this.stepMs;
        due2 = this.maxCatchUp;
      }
      this.accumulated -= due2 * this.stepMs;
      this.steps += due2;
      return due2;
    }
    /** Simulated seconds since construction. */
    get elapsed() {
      return this.steps * this.dt;
    }
    get stepCount() {
      return this.steps;
    }
    /** Run `tick(dt)` the number of times `realMs` has earned. Returns steps run. */
    run(realMs, tick2) {
      const due2 = this.advance(realMs);
      for (let i = 0; i < due2; i++) tick2(this.dt, this.steps - due2 + i);
      return due2;
    }
  };

  // src/systems/apu.ts
  var START_SECONDS = 20;
  var SHUTDOWN_SECONDS = 8;
  var AVAILABLE_AT = 95;
  function declareApu(d) {
    const b = (name, note) => d.declare({ name, kind: "bool", note });
    const r = (name, unit, note, max = 110) => d.declare({ name, kind: "real", min: 0, max, unit, note });
    b("sw.apuMaster", "APU MASTER SW");
    b("sw.apuStart", "APU START pushbutton (momentary)");
    b("sys.apuStarting", "APU start sequence in progress");
    b("sys.apuRunning", "APU running and available");
    b("sys.apuShuttingDown", "APU shut down sequence running");
    b("sys.apuGenAvail", "APU generator available");
    b("sys.apuBleedAvail", "APU bleed available");
    r("apu.n1", "%", "APU speed");
    r("apu.egt", "degC", "APU exhaust gas temperature", 900);
  }
  function updateApu(d, i, dt) {
    const master = d.bool("sw.apuMaster");
    const startPressed = d.bool("sw.apuStart");
    const n1 = d.num("apu.n1");
    if (master && (startPressed || d.bool("sys.apuStarting") || d.bool("sys.apuRunning")) && i.dcPowered) {
      const target = AVAILABLE_AT + 5;
      const next = Math.min(target, n1 + target / START_SECONDS * dt);
      d.set("apu.n1", next);
      d.set("sys.apuStarting", next < AVAILABLE_AT);
      d.set("sys.apuRunning", next >= AVAILABLE_AT);
      d.set("sys.apuShuttingDown", false);
      d.set("apu.egt", next < AVAILABLE_AT ? 400 + next * 2 : 520);
      d.set("sw.apuStart", false);
    } else if (n1 > 0) {
      const next = Math.max(0, n1 - AVAILABLE_AT / SHUTDOWN_SECONDS * dt);
      d.set("apu.n1", next);
      d.set("sys.apuStarting", false);
      d.set("sys.apuRunning", false);
      d.set("sys.apuShuttingDown", next > 0);
      d.set("apu.egt", Math.max(0, d.num("apu.egt") - 40 * dt));
    } else {
      d.set("sys.apuStarting", false);
      d.set("sys.apuRunning", false);
      d.set("sys.apuShuttingDown", false);
      d.set("apu.egt", 0);
    }
    const running = d.bool("sys.apuRunning");
    d.set("sys.apuGenAvail", running);
    d.set("sys.apuBleedAvail", running);
  }

  // src/systems/elec.ts
  function declareElec(d) {
    const b = (name, note) => d.declare({ name, kind: "bool", note });
    b("sw.extPwr", "EXT PWR pushbutton");
    b("sw.gen1", "ELEC GEN 1 pushbutton");
    b("sw.gen2", "ELEC GEN 2 pushbutton");
    b("sw.apuGen", "ELEC APU GEN pushbutton");
    b("sw.busTie", "BUS TIE pushbutton");
    b("sw.bat1", "BAT 1 pushbutton");
    b("sw.bat2", "BAT 2 pushbutton");
    b("ctr.extPwr", "external power contactor closed");
    b("ctr.gen1", "generator 1 line contactor closed");
    b("ctr.gen2", "generator 2 line contactor closed");
    b("ctr.apuGen", "APU generator line contactor closed");
    b("bus.ac1", "AC BUS 1 powered");
    b("bus.ac2", "AC BUS 2 powered");
    b("bus.acEss", "AC ESS BUS powered");
    b("bus.dc1", "DC BUS 1 powered");
    b("bus.dc2", "DC BUS 2 powered");
    b("bus.dcBat", "DC BAT BUS powered");
    b("bus.dcEss", "DC ESS BUS powered");
    b("bus.hotBat", "HOT BAT BUS powered");
  }
  function updateElec(d, i) {
    const extPwr = d.bool("sw.extPwr") && i.externalPowerAvailable;
    const gen1 = d.bool("sw.gen1") && i.eng1Running;
    const gen2 = d.bool("sw.gen2") && i.eng2Running;
    const apuGen = d.bool("sw.apuGen") && i.apuRunning;
    d.set("ctr.extPwr", extPwr);
    d.set("ctr.gen1", gen1);
    d.set("ctr.gen2", gen2);
    d.set("ctr.apuGen", apuGen);
    const busTie = d.bool("sw.busTie");
    const ac1 = extPwr || gen1 || busTie && (gen2 || apuGen);
    const ac2 = extPwr || gen2 || apuGen || busTie && gen1;
    d.set("bus.ac1", ac1);
    d.set("bus.ac2", ac2);
    d.set("bus.acEss", ac1 || ac2);
    const tr1 = ac1;
    const tr2 = ac2;
    const bat1 = d.bool("sw.bat1");
    const bat2 = d.bool("sw.bat2");
    const dc1 = tr1;
    const dc2 = tr2;
    const dcBat = dc1 || dc2 || bat1 || bat2;
    d.set("bus.dc1", dc1);
    d.set("bus.dc2", dc2);
    d.set("bus.dcBat", dcBat);
    d.set("bus.dcEss", dcBat || dc2);
    d.set("bus.hotBat", true);
  }

  // src/systems/fuel.ts
  function declareFuel(d) {
    const b = (name, note) => d.declare({ name, kind: "bool", note });
    b("sw.fuelPumpL1", "LEFT tank pump 1");
    b("sw.fuelPumpL2", "LEFT tank pump 2");
    b("sw.fuelPumpR1", "RIGHT tank pump 1");
    b("sw.fuelPumpR2", "RIGHT tank pump 2");
    b("sw.fuelPumpC1", "CENTER tank pump 1");
    b("sw.fuelPumpC2", "CENTER tank pump 2");
    b("sw.fuelXfeed", "crossfeed valve open");
    b("sw.fuelEng1LpValve", "ENG 1 LP valve open");
    b("sw.fuelEng2LpValve", "ENG 2 LP valve open");
    b("sys.fuelLp1", "ENG 1 LP valve open (actual)");
    b("sys.fuelLp2", "ENG 2 LP valve open (actual)");
    b("sys.fuelToEng1", "fuel is reaching engine 1");
    b("sys.fuelToEng2", "fuel is reaching engine 2");
    b("sys.fuelXfeedOpen", "crossfeed valve open (actual)");
  }
  function updateFuel(d, s) {
    const xfeed = d.bool("sw.fuelXfeed");
    d.set("sys.fuelXfeedOpen", xfeed);
    d.set("sys.fuelLp1", d.bool("sw.fuelEng1LpValve"));
    d.set("sys.fuelLp2", d.bool("sw.fuelEng2LpValve"));
    const leftPressure = s.leftHasFuel && (d.bool("sw.fuelPumpL1") || d.bool("sw.fuelPumpL2"));
    const rightPressure = s.rightHasFuel && (d.bool("sw.fuelPumpR1") || d.bool("sw.fuelPumpR2"));
    const centerPressure = s.centerHasFuel && (d.bool("sw.fuelPumpC1") || d.bool("sw.fuelPumpC2"));
    const eng1 = d.bool("sys.fuelLp1") && (leftPressure || xfeed && rightPressure || centerPressure);
    const eng2 = d.bool("sys.fuelLp2") && (rightPressure || xfeed && leftPressure || centerPressure);
    d.set("sys.fuelToEng1", eng1);
    d.set("sys.fuelToEng2", eng2);
  }

  // src/systems/pneumatic.ts
  function declareBleed(d) {
    const b = (name, note) => d.declare({ name, kind: "bool", note });
    b("sw.eng1Bleed", "ENG BLEED 1 pushbutton");
    b("sw.eng2Bleed", "ENG BLEED 2 pushbutton");
    b("sw.apuBleed", "APU BLEED pushbutton");
    b("sw.xbleed", "crossbleed valve open");
    b("sw.pack1", "PACK 1 pushbutton");
    b("sw.pack2", "PACK 2 pushbutton");
    b("sys.bleedSrc1", "bleed 1 supplying the duct");
    b("sys.bleedSrc2", "bleed 2 supplying the duct");
    b("sys.bleedApu", "APU supplying the duct");
    b("sys.bleedDuctL", "left duct pressurised");
    b("sys.bleedDuctR", "right duct pressurised");
    b("sys.pack1Running", "PACK 1 running");
    b("sys.pack2Running", "PACK 2 running");
  }
  function updateBleed(d, i) {
    const src1 = d.bool("sw.eng1Bleed") && i.eng1Running && !d.bool("fault.bleed1");
    const src2 = d.bool("sw.eng2Bleed") && i.eng2Running;
    const apu = d.bool("sw.apuBleed") && i.apuRunning;
    d.set("sys.bleedSrc1", src1);
    d.set("sys.bleedSrc2", src2);
    d.set("sys.bleedApu", apu);
    const xbleed = d.bool("sw.xbleed");
    const leftFeed = src1 || apu || i.groundAirAvailable;
    const rightFeed = src2;
    const ductL = leftFeed || xbleed && rightFeed;
    const ductR = rightFeed || xbleed && leftFeed;
    d.set("sys.bleedDuctL", ductL);
    d.set("sys.bleedDuctR", ductR);
    d.set("sys.pack1Running", d.bool("sw.pack1") && ductL && !d.bool("fault.pack1"));
    d.set("sys.pack2Running", d.bool("sw.pack2") && ductR && !d.bool("fault.pack2"));
  }

  // src/systems/engine.ts
  var LIGHT_UP_N2 = 16;
  var SELF_SUSTAINING_N2 = 58;
  var STARTER_RATE = 1.2;
  var ACCEL_RATE = 3.5;
  var HOT_START_RATE = 1.8;
  var SHUTDOWN_RATE = 4;
  var IDLE_N2 = 58;
  function declareEngine(d, n) {
    const p = `eng${n}`;
    const b = (name, note) => d.declare({ name, kind: "bool", note });
    const r = (name, unit, note, max = 110) => d.declare({ name, kind: "real", min: 0, max, unit, note });
    b(`sw.${p}Master`, `ENG ${n} MASTER LEVER`);
    d.declare({ name: `sw.${p}Start`, kind: "int", min: 0, max: 1, note: `ENG ${n} MODE selector` });
    b(`sys.${p}StartValve`, `ENG ${n} start valve open`);
    b(`sys.${p}Burning`, `ENG ${n} fuel is burning`);
    b(`sys.${p}Running`, `ENG ${n} self-sustaining`);
    b(`sys.${p}HotStart`, `ENG ${n} hot start \u2014 fuel introduced before the engine was turning`);
    b(`sys.${p}HotStartLatched`, `ENG ${n} hot start latched until the engine is stopped`);
    r(`${p}.n2`, "%", `ENG ${n} N2`);
    r(`${p}.n1`, "%", `ENG ${n} N1`);
    r(`${p}.egt`, "degC", `ENG ${n} EGT`, 900);
  }
  function updateEngine(d, n, i, dt) {
    const p = `eng${n}`;
    const master = d.bool(`sw.${p}Master`);
    const startSel = d.num(`sw.${p}Start`) !== 0;
    const n2 = d.num(`${p}.n2`);
    const startValve = startSel && i.bleedAvailable && n2 < SELF_SUSTAINING_N2;
    const fuelOn = startValve && master && i.fuelAvailable;
    const hot = fuelOn && n2 < LIGHT_UP_N2;
    d.set(`sys.${p}StartValve`, startValve);
    d.set(`sys.${p}Burning`, fuelOn);
    d.set(`sys.${p}HotStart`, hot);
    if (hot) d.set(`sys.${p}HotStartLatched`, true);
    let next = n2;
    if (startValve) {
      next += (fuelOn ? hot ? HOT_START_RATE : ACCEL_RATE : STARTER_RATE) * dt;
    } else if (master && i.fuelAvailable && n2 >= SELF_SUSTAINING_N2) {
      if (next < IDLE_N2) next += ACCEL_RATE * dt;
      d.set(`sys.${p}Burning`, true);
    } else if (next > 0) {
      next = Math.max(0, next - SHUTDOWN_RATE * dt);
    }
    next = Math.min(105, next);
    d.set(`${p}.n2`, next);
    d.set(`sys.${p}Running`, next >= SELF_SUSTAINING_N2);
    if (next === 0 && !startValve) d.set(`sys.${p}HotStartLatched`, false);
    if (next >= SELF_SUSTAINING_N2 && startSel) d.set(`sw.${p}Start`, 0);
    const n1 = d.num(`${p}.n1`);
    d.set(`${p}.n1`, n1 + (next * 0.25 - n1) * Math.min(1, dt * 1.5));
    const target = d.bool(`sys.${p}Burning`) ? hot ? 800 : 300 + next * 3 : 15;
    const egt = d.num(`${p}.egt`);
    const moved = egt + (target - egt) * Math.min(1, dt * 0.8);
    d.set(`${p}.egt`, Math.min(900, Math.abs(target - moved) < 0.5 ? target : moved));
  }

  // src/systems/hydraulic.ts
  function declareHyd(d) {
    const b = (name, note) => d.declare({ name, kind: "bool", note });
    const r = (name, unit, note) => d.declare({ name, kind: "real", min: 0, max: 4e3, unit, note });
    b("sw.hydGreenEng1", "GREEN engine pump pushbutton");
    b("sw.hydBlueEpump", "BLUE electric pump pushbutton");
    b("sw.hydYellowEng2", "YELLOW engine pump pushbutton");
    b("sw.hydYellowEpump", "YELLOW electric pump pushbutton");
    b("sw.ptu", "PTU pushbutton");
    b("sys.hydGreenPump", "GREEN pump pressurised");
    b("sys.hydBluePump", "BLUE pump pressurised");
    b("sys.hydYellowPump", "YELLOW pump pressurised");
    b("sys.ptuRunning", "PTU transferring");
    r("hyd.green", "psi", "GREEN system pressure");
    r("hyd.blue", "psi", "BLUE system pressure");
    r("hyd.yellow", "psi", "YELLOW system pressure");
  }
  var NOMINAL = 3e3;
  var RAT_PRESSURE = 2e3;
  function updateHyd(d, i) {
    const green = d.bool("sw.hydGreenEng1") && i.eng1Running && !d.bool("fault.hydGreenPump");
    const blueElec = d.bool("sw.hydBlueEpump") && i.elecPowered && !d.bool("fault.hydBluePump");
    const blueRam = i.ratDeployed;
    const yellowEng = d.bool("sw.hydYellowEng2") && i.eng2Running && !d.bool("fault.hydYellowPump");
    const yellowElec = d.bool("sw.hydYellowEpump") && i.elecPowered && !d.bool("fault.hydYellowPump");
    d.set("sys.hydGreenPump", green);
    d.set("sys.hydBluePump", blueElec || blueRam);
    d.set("sys.hydYellowPump", yellowEng || yellowElec);
    const ptuWanted = d.bool("sw.ptu");
    const greenOk = green;
    const yellowOk = yellowEng || yellowElec;
    const ptu = ptuWanted && greenOk !== yellowOk;
    d.set("sys.ptuRunning", ptu);
    const greenPsi = green ? NOMINAL : ptu && yellowOk ? NOMINAL * 0.8 : 0;
    const yellowPsi = yellowOk ? NOMINAL : ptu && greenOk ? NOMINAL * 0.8 : 0;
    const bluePsi = blueRam ? RAT_PRESSURE : blueElec ? NOMINAL : 0;
    d.set("hyd.green", greenPsi);
    d.set("hyd.yellow", yellowPsi);
    d.set("hyd.blue", bluePsi);
  }

  // src/systems/press.ts
  var CABIN_TARGET_FT = 8e3;
  var CLIMB_FPM = 500;
  var DESCENT_FPM = 300;
  var MAX_DIFF_PSI = 8.6;
  var PSI_PER_FT = 277e-6;
  function declarePress(d) {
    const b = (name, note) => d.declare({ name, kind: "bool", note });
    const r = (name, unit, note, min, max) => d.declare({ name, kind: "real", min, max, unit, note });
    d.declare({ name: "sw.pressMode", kind: "int", min: 0, max: 1, note: "PRESS mode 0=auto 1=manual" });
    d.declare({ name: "sw.pressValve", kind: "int", min: 0, max: 100, note: "manual outflow valve, % open" });
    b("sys.pressAuto", "pressurisation in automatic");
    r("press.cabinAlt", "ft", "cabin altitude", 0, 45e3);
    r("press.cabinVs", "fpm", "cabin rate of climb", -6e3, 6e3);
    r("press.diffPsi", "psi", "cabin differential pressure", 0, 10);
    r("press.outflow", "%", "outflow valve open", 0, 100);
  }
  function updatePress(d, i, dt) {
    const manual = d.num("sw.pressMode") === 1;
    d.set("sys.pressAuto", !manual);
    const cabin = d.num("press.cabinAlt");
    const alt = Math.max(0, i.altFt);
    const target = Math.min(CABIN_TARGET_FT, alt);
    let vs;
    if (manual) {
      const outlet = d.num("sw.pressValve") / 100;
      vs = Math.max(-6e3, Math.min(6e3, (alt - cabin) * outlet * 0.5));
    } else if (i.packsOn) {
      const gap = target - cabin;
      vs = Math.max(-DESCENT_FPM, Math.min(CLIMB_FPM, gap * 0.5));
    } else {
      const gap = alt - cabin;
      vs = Math.max(0, Math.min(CLIMB_FPM, gap * 0.5));
    }
    const snapped = Math.abs(target - cabin) < 20 && !manual && i.packsOn;
    const next = snapped ? target : Math.max(0, Math.min(45e3, cabin + vs * dt / 60));
    if (snapped) vs = 0;
    d.set("press.cabinAlt", next);
    d.set("press.cabinVs", vs);
    const diff = Math.max(0, Math.min(MAX_DIFF_PSI, (alt - next) * PSI_PER_FT));
    d.set("press.diffPsi", diff);
    d.set("press.outflow", manual ? d.num("sw.pressValve") : Math.max(0, 100 - diff * 11));
  }

  // src/faults/index.ts
  var FAULTS = [
    { id: "hyd-green-pump", flag: "fault.hydGreenPump", note: "GREEN engine pump fails" },
    { id: "hyd-blue-pump", flag: "fault.hydBluePump", note: "BLUE electric pump fails" },
    { id: "hyd-yellow-pump", flag: "fault.hydYellowPump", note: "YELLOW pump fails" },
    { id: "pack-1", flag: "fault.pack1", note: "PACK 1 fails" },
    { id: "pack-2", flag: "fault.pack2", note: "PACK 2 fails" },
    { id: "bleed-1", flag: "fault.bleed1", note: "engine 1 bleed duct burst" }
  ];
  function declareFaults(d) {
    for (const f of FAULTS) d.declare({ name: f.flag, kind: "bool", note: f.note });
  }
  function fault(id) {
    const f = FAULTS.find((x) => x.id === id);
    if (!f) throw new Error(`unknown fault ${id}`);
    return f;
  }
  function faultIds() {
    return FAULTS.map((f) => f.id);
  }
  function arm(faults) {
    return {
      armed: faults.map((f) => ({ id: f.id, trigger: f.trigger ?? { kind: "manual" }, fired: false }))
    };
  }
  function step(d, set, c) {
    const fired = [];
    for (const a of set.armed) {
      if (a.fired) continue;
      if (due(a.trigger, c)) {
        d.set(fault(a.id).flag, true);
        a.fired = true;
        fired.push(a.id);
      }
    }
    return fired;
  }
  function due(t, c) {
    switch (t.kind) {
      case "manual":
        return false;
      // a manual fault is fired by the instructor calling fire()
      case "atTime":
        return c.sec >= t.sec;
      case "atAltitude":
        return c.altitudeFt >= t.ft;
    }
  }
  function repair(d, id) {
    d.set(fault(id).flag, false);
  }

  // src/systems/index.ts
  function declareAll(d) {
    declareApu(d);
    declareElec(d);
    declareFuel(d);
    declareBleed(d);
    declareEngine(d, 1);
    declareEngine(d, 2);
    declareHyd(d);
    declarePress(d);
    declareFaults(d);
  }
  function tick(d, w, dt) {
    const apuRunning = d.bool("sys.apuRunning");
    const eng1 = d.bool("sys.eng1Running");
    const eng2 = d.bool("sys.eng2Running");
    updateApu(
      d,
      { dcPowered: d.bool("bus.dcBat") || d.bool("bus.dcEss"), groundAirAvailable: w.groundAirAvailable },
      dt
    );
    updateElec(d, {
      eng1Running: eng1,
      eng2Running: eng2,
      apuRunning,
      externalPowerAvailable: w.externalPowerAvailable
    });
    updateFuel(d, w.tanks);
    updateBleed(d, {
      eng1Running: eng1,
      eng2Running: eng2,
      apuRunning,
      groundAirAvailable: w.groundAirAvailable
    });
    updateEngine(d, 1, { bleedAvailable: d.bool("sys.bleedDuctL"), fuelAvailable: d.bool("sys.fuelToEng1") }, dt);
    updateEngine(d, 2, { bleedAvailable: d.bool("sys.bleedDuctR"), fuelAvailable: d.bool("sys.fuelToEng2") }, dt);
    updatePress(d, { altFt: w.pressureAltitudeFt ?? 0, packsOn: d.bool("sys.pack1Running") || d.bool("sys.pack2Running") }, dt);
    updateHyd(d, {
      eng1Running: eng1,
      eng2Running: eng2,
      ratDeployed: w.ratDeployed,
      elecPowered: d.bool("bus.acEss")
    });
  }

  // src/panel/schema.ts
  var FORMS = ["push", "guarded", "selector", "lamp"];
  function parsePanel(raw) {
    const o = raw;
    if (!o || typeof o !== "object") throw new Error("panel: expected an object");
    if (typeof o.id !== "string" || typeof o.title !== "string") throw new Error("panel: id and title required");
    if (!Number.isInteger(o.cols) || !Number.isInteger(o.rows)) throw new Error("panel: cols and rows must be integers");
    if (!Array.isArray(o.controls)) throw new Error("panel: controls must be an array");
    const cols = o.cols;
    const rows = o.rows;
    const seen = /* @__PURE__ */ new Set();
    const controls = o.controls.map((c, i) => {
      const k = c;
      const where = `controls[${i}]${k.id ? ` (${k.id})` : ""}`;
      if (typeof k.id !== "string" || !k.id) throw new Error(`${where}: id required`);
      if (seen.has(k.id)) throw new Error(`${where}: duplicate id`);
      seen.add(k.id);
      if (typeof k.label !== "string" || !k.label) throw new Error(`${where}: label required`);
      if (typeof k.var !== "string" || !k.var) throw new Error(`${where}: var required`);
      if (typeof k.form !== "string" || !FORMS.includes(k.form)) {
        throw new Error(`${where}: form must be one of ${FORMS.join(", ")}`);
      }
      for (const f of ["x", "y", "w", "h"]) {
        if (!Number.isInteger(k[f])) throw new Error(`${where}: ${f} must be an integer`);
      }
      if (k.x < 0 || k.y < 0) throw new Error(`${where}: negative position`);
      if (k.x + k.w > cols) throw new Error(`${where}: runs past ${cols} columns`);
      if (k.y + k.h > rows) throw new Error(`${where}: runs past ${rows} rows`);
      if (k.form === "guarded" && typeof k.guard !== "string") throw new Error(`${where}: guarded needs a guard variable`);
      if (k.form === "selector") {
        if (!Number.isInteger(k.positions) || k.positions < 2) throw new Error(`${where}: selector needs positions >= 2`);
        if (k.table) {
          if (!Array.isArray(k.table) || k.table.length !== k.positions) {
            throw new Error(`${where}: table must match positions`);
          }
          if (new Set(k.table).size !== k.table.length) throw new Error(`${where}: table has duplicate detents`);
        }
      }
      return {
        id: k.id,
        label: k.label,
        x: k.x,
        y: k.y,
        w: k.w,
        h: k.h,
        form: k.form,
        var: k.var,
        positions: k.positions,
        table: k.table,
        guard: k.guard,
        note: k.note
      };
    });
    return { id: o.id, title: o.title, cols, rows, controls };
  }
  function declarePanel(d, p) {
    for (const c of p.controls) {
      if (!c.guard) continue;
      try {
        d.spec(c.guard);
      } catch {
        d.declare({ name: c.guard, kind: "bool", note: `${c.label} guard lifted` });
      }
    }
  }

  // src/training/procedure.ts
  function read(m, d) {
    const value = d.num(m.var);
    return { value, aim: m.aim, band: m.band, ok: Math.abs(value - m.aim) <= m.band };
  }
  var Scorer = class {
    constructor(proc, d) {
      __publicField(this, "proc");
      __publicField(this, "d");
      __publicField(this, "results");
      __publicField(this, "cursor", 0);
      __publicField(this, "elapsedSec", 0);
      __publicField(this, "finished", false);
      /** when the current step's window opened; -1 while it has not */
      __publicField(this, "windowStart", -1);
      this.proc = proc;
      this.d = d;
      this.results = proc.steps.map((s) => ({ id: s.id, label: s.label, why: s.why, status: "pending" }));
    }
    /** Advance the procedure by one model tick of `dt` seconds. */
    tick(dt) {
      if (this.finished) return;
      this.elapsedSec += dt;
      const step2 = this.proc.steps[this.cursor];
      if (!step2) {
        this.finished = true;
        return;
      }
      if (step2.startsWhen) {
        if (this.windowStart < 0) {
          if (step2.startsWhen(this.d)) this.windowStart = this.elapsedSec;
          return;
        }
      }
      if (step2.done(this.d)) {
        this.results[this.cursor] = {
          ...this.results[this.cursor],
          status: "done",
          atSec: this.elapsedSec,
          ...step2.measure ? { reading: read(step2.measure, this.d) } : {}
        };
        this.cursor++;
        this.windowStart = -1;
        if (this.cursor >= this.proc.steps.length) this.finished = true;
        return;
      }
      const open = this.windowStart >= 0 ? this.windowStart : 0;
      if (step2.withinSec !== void 0 && this.elapsedSec - open > step2.withinSec) {
        this.results[this.cursor] = { ...this.results[this.cursor], status: "missed", atSec: this.elapsedSec };
        this.cursor++;
        this.windowStart = -1;
        if (this.cursor >= this.proc.steps.length) this.finished = true;
      }
    }
    get done() {
      return this.finished;
    }
    get currentStep() {
      return this.proc.steps[this.cursor];
    }
    debrief() {
      const completed = this.results.filter((r) => r.status === "done").length;
      return {
        procedureId: this.proc.id,
        title: this.proc.title,
        passed: this.finished && completed === this.proc.steps.length,
        completed,
        total: this.proc.steps.length,
        seconds: Math.round(this.elapsedSec),
        steps: [...this.results]
      };
    }
  };

  // src/scenario/situation.ts
  var HEADER = "[A32X CBT - Situation]";
  var VERSION = 1;
  var END_MARK = "^-^-^-^ End of description ^-^-^-^";
  function save(d, description, elapsedSteps = 0) {
    const lines = [
      HEADER,
      `[Version ${VERSION}]`,
      `[ElapsedSteps ${elapsedSteps}]`,
      `Description=${description.replace(/\r?\n/g, " ")}`,
      END_MARK,
      ""
    ];
    for (const name of d.names()) {
      lines.push(`${name}=${render(d, name)}`);
    }
    return `${lines.join("\n")}
`;
  }
  function render(d, name) {
    const v = d.get(name);
    return typeof v === "boolean" ? String(v) : String(v);
  }
  var ParseError = class extends Error {
  };
  function parse(text) {
    const lines = text.split(/\r?\n/);
    if (lines[0]?.trim() !== HEADER) throw new ParseError(`not a situation file: ${lines[0] ?? "(empty)"}`);
    let description = "";
    let elapsedSteps = 0;
    const values = /* @__PURE__ */ new Map();
    let i = 1;
    for (; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith("Description=")) {
        description = line.slice("Description=".length);
        continue;
      }
      if (line.startsWith("[ElapsedSteps ")) {
        const n = Number(line.slice("[ElapsedSteps ".length, -1));
        if (Number.isInteger(n) && n >= 0) elapsedSteps = n;
        continue;
      }
      if (line.trim() === END_MARK) {
        i++;
        break;
      }
    }
    for (; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) throw new ParseError(`malformed line ${i + 1}: ${line}`);
      values.set(line.slice(0, eq), line.slice(eq + 1));
    }
    return { description, elapsedSteps, values };
  }
  function apply(d, s, onStep) {
    const staged = [];
    for (const [name, raw] of s.values) {
      const spec = d.spec(name);
      staged.push([name, coerce2(spec, name, raw)]);
    }
    const snapshot = staged.map(([name]) => [name, d.get(name)]);
    try {
      for (const [name, value] of staged) {
        d.set(name, value);
        onStep?.(name);
      }
    } catch (err) {
      for (const [name, value] of snapshot) d.set(name, value);
      throw err;
    }
  }
  function coerce2(spec, name, raw) {
    switch (spec.kind) {
      case "bool":
        if (raw !== "true" && raw !== "false") throw new ParseError(`${name}: expected true/false, got "${raw}"`);
        return raw === "true";
      case "int": {
        const n = Number(raw);
        if (!Number.isInteger(n)) throw new ParseError(`${name}: expected integer, got "${raw}"`);
        if (n < spec.min || n > spec.max) throw new ParseError(`${name}: ${n} outside [${spec.min}, ${spec.max}]`);
        return n;
      }
      case "real": {
        const n = Number(raw);
        if (!Number.isFinite(n)) throw new ParseError(`${name}: expected number, got "${raw}"`);
        if (n < spec.min || n > spec.max) throw new ParseError(`${name}: ${n} outside [${spec.min}, ${spec.max}]`);
        return n;
      }
      case "string":
        return raw;
    }
  }

  // src/session/session.ts
  var DEFAULT_WORLD = {
    externalPowerAvailable: true,
    groundAirAvailable: false,
    pressureAltitudeFt: 0,
    tanks: { leftHasFuel: true, rightHasFuel: true, centerHasFuel: false },
    ratDeployed: false
  };
  var Session = class _Session {
    constructor(o, clock = new Clock(20)) {
      __publicField(this, "d");
      __publicField(this, "clock");
      __publicField(this, "procedure");
      __publicField(this, "world");
      __publicField(this, "scorer");
      __publicField(this, "faults");
      __publicField(this, "altitudeFt", 0);
      __publicField(this, "steps", 0);
      __publicField(this, "fired", []);
      __publicField(this, "paused", false);
      __publicField(this, "repositions", 0);
      this.d = new Dictionary();
      declareAll(this.d);
      if (o.panel) declarePanel(this.d, o.panel);
      this.clock = clock;
      this.procedure = o.procedure;
      this.world = { ...DEFAULT_WORLD, ...o.world };
      this.altitudeFt = this.world.pressureAltitudeFt ?? 0;
      this.scorer = new Scorer(o.procedure, this.d);
      this.faults = o.faults?.length ? arm(o.faults) : void 0;
    }
    /** Rebuild a session from a parked situation. */
    static fromSituation(o, text, clock = new Clock(20)) {
      const parked = parse(text);
      const s = new _Session(o, clock);
      apply(s.d, parked);
      s.steps = parked.elapsedSteps;
      return s;
    }
    /** Freeze the model. Time does not pass, but the instructor can still inspect and act. */
    pause() {
      this.paused = true;
    }
    resume() {
      this.paused = false;
    }
    get isPaused() {
      return this.paused;
    }
    /** Advance by wall time. Returns how many fixed steps ran — none while frozen. */
    advance(realMs) {
      if (this.paused) return 0;
      return this.clock.run(realMs, (dt) => this.step(dt));
    }
    /**
     * Advance a whole number of simulated seconds, in frame-sized slices. The clock refuses to run
     * more than a few steps per call — that is what stops a stalled tab spiralling — so anything that
     * wants seconds rather than frames has to ask for them this way.
     */
    runFor(seconds, frameMs = 50) {
      const frames = Math.ceil(seconds * 1e3 / frameMs);
      let ran = 0;
      for (let i = 0; i < frames && !this.done; i++) ran += this.advance(frameMs);
      return ran;
    }
    /**
     * Fire a fault by hand, as an instructor would. Works whether or not the drill armed it: the
     * instructor is not bound by the scenario.
     */
    injectFault(id) {
      this.d.set(fault(id).flag, true);
      this.fired.push(id);
    }
    /** Repair a fault by hand, and stop counting it as fired. */
    clearFault(id) {
      repair(this.d, id);
      this.fired = this.fired.filter((f) => f !== id);
    }
    /**
     * Move the aircraft to a parked situation mid-run. The score cannot survive that — the trainee
     * would be credited for steps performed against a different aircraft — so the attempt restarts
     * and the reposition is counted.
     */
    reposition(text) {
      const parked = parse(text);
      apply(this.d, parked);
      this.steps = parked.elapsedSteps;
      this.scorer = new Scorer(this.procedure, this.d);
      this.repositions++;
    }
    get repositionCount() {
      return this.repositions;
    }
    /** One fixed step. Public so a test can drive it without a clock. */
    step(dt) {
      this.steps++;
      tick(this.d, this.world, dt);
      if (this.faults) {
        const fired = step(this.d, this.faults, { sec: this.simSeconds, altitudeFt: this.altitudeFt });
        this.fired.push(...fired);
      }
      this.scorer.tick(dt);
    }
    /** Simulated seconds, derived from the step count so a resumed run never accumulates drift. */
    get simSeconds() {
      return this.steps * this.clock.dt;
    }
    /** Park this session as a situation file, elapsed time included. */
    toSituation(description) {
      return save(this.d, description, this.steps);
    }
    get done() {
      return this.scorer.done;
    }
    get faultsFired() {
      return this.fired;
    }
    debrief() {
      return this.scorer.debrief();
    }
    /** The scenario the trainee is handed, for the header line. */
    describe() {
      return `${this.procedure.title} \xB7 ${this.clock.elapsed.toFixed(0)} s \xB7 ${this.d.names().length} variables`;
    }
  };

  // src/panel/controls.ts
  function hitTest(p, x, y) {
    let found;
    for (const c of p.controls) {
      if (x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) found = c;
    }
    return found;
  }
  function actuate(d, c) {
    switch (c.form) {
      case "lamp":
        return;
      case "push":
        toggleBool(d, c.var);
        return;
      case "guarded": {
        if (!c.guard) throw new Error(`${c.id}: guarded control needs a guard variable`);
        if (!d.bool(c.guard)) {
          d.set(c.guard, true);
          return;
        }
        toggleBool(d, c.var);
        d.set(c.guard, false);
        return;
      }
      case "selector": {
        const detents = c.table ?? Array.from({ length: c.positions ?? 2 }, (_, i) => i);
        const at = detents.indexOf(d.num(c.var));
        const next = detents[(at + 1) % detents.length];
        d.set(c.var, next);
        return;
      }
    }
  }
  function toggleBool(d, name) {
    d.set(name, !d.bool(name));
  }
  function describe(d, c) {
    switch (c.form) {
      case "lamp":
        return d.bool(c.var) ? "lit" : "dark";
      case "selector":
        return `${d.num(c.var)}`;
      default:
        return d.bool(c.var) ? "on" : "off";
    }
  }

  // src/app/draw.ts
  function scene(p, d) {
    return {
      cols: p.cols,
      rows: p.rows,
      boxes: p.controls.map((c) => ({
        x: c.x,
        y: c.y,
        w: c.w,
        h: c.h,
        label: c.label,
        state: describe(d, c),
        guarded: c.guard ? d.bool(c.guard) : false,
        lit: c.form === "push" || c.form === "guarded" ? d.get(c.var) === true : false,
        form: c.form
      }))
    };
  }
  var COLOURS = {
    warning: "#ff3b30",
    caution: "#ffb020",
    advisory: "#38b6ff",
    normal: "#e8eef5",
    label: "#6aa9ff",
    title: "#d17bff"
  };

  // src/ecam/line.ts
  var label = (text) => ({ level: "label", text });
  var title = (text) => ({ level: "title", text });
  var normal = (text) => ({ level: "normal", text });
  var caution = (text) => ({ level: "caution", text });
  var warning = (text) => ({ level: "warning", text });

  // src/ecam/warnings.ts
  var RANK = {
    warning: 0,
    caution: 1,
    advisory: 2,
    normal: 3,
    label: 4,
    title: 5
  };
  function evaluate(c, d) {
    if ("var" in c) {
      const v = d.get(c.var);
      return typeof v === "boolean" ? v : v !== 0;
    }
    if ("not" in c) return !evaluate(c.not, d);
    if ("all" in c) return c.all.every((x) => evaluate(x, d));
    if ("any" in c) return c.any.some((x) => evaluate(x, d));
    if ("eq" in c) return d.get(c.eq.var) === c.eq.value;
    if ("lt" in c) return d.num(c.lt.var) < c.lt.value;
    if ("gt" in c) return d.num(c.gt.var) > c.gt.value;
    throw new Error(`unreadable condition ${JSON.stringify(c)}`);
  }
  function parseMessages(raw) {
    if (!Array.isArray(raw)) throw new Error("messages: expected an array");
    return raw.map((m, i) => {
      const o = m;
      if (typeof o.id !== "string" || typeof o.text !== "string") throw new Error(`messages[${i}]: id and text`);
      if (o.level !== "warning" && o.level !== "caution" && o.level !== "advisory") {
        throw new Error(`messages[${i}]: level must be warning, caution or advisory`);
      }
      if (!o.when) throw new Error(`messages[${i}]: missing condition`);
      if (typeof o.chapter !== "string") throw new Error(`messages[${i}]: missing chapter`);
      return { id: o.id, level: o.level, text: o.text, when: o.when, chapter: o.chapter };
    });
  }
  function ecamPowered(d) {
    return d.bool("bus.dcEss") || d.bool("bus.acEss") || d.bool("bus.dcBat");
  }
  function activeOf(set, d) {
    return set.map((m, i) => ({ m, i })).filter(({ m }) => evaluate(m.when, d)).sort((a, b) => RANK[a.m.level] - RANK[b.m.level] || a.i - b.i).map((x) => x.m);
  }
  function linesOf(set, d) {
    if (!ecamPowered(d)) return [];
    return activeOf(set, d).map((m) => m.level === "warning" ? warning(m.text) : caution(m.text));
  }

  // src/ecam/pageSchema.ts
  var LEVELS = ["warning", "caution", "advisory", "normal", "label", "title"];
  var TOKEN = /\{\{([a-zA-Z0-9._-]+)(?::(\d+))?\}\}/g;
  function parsePages(raw) {
    if (!Array.isArray(raw)) throw new Error("pages: expected an array");
    const seen = /* @__PURE__ */ new Set();
    return raw.map((p, i) => {
      const o = p;
      if (typeof o.id !== "string" || !o.id) throw new Error(`pages[${i}]: id required`);
      if (seen.has(o.id)) throw new Error(`pages[${i}]: duplicate id ${o.id}`);
      seen.add(o.id);
      if (typeof o.name !== "string" || !o.name) throw new Error(`pages[${i}]: name required`);
      if (!Array.isArray(o.lines) || o.lines.length === 0) throw new Error(`pages[${i}]: lines required`);
      const lines = o.lines.map((l, j) => {
        const k = l;
        const where = `pages[${i}].lines[${j}]`;
        if (typeof k.title === "string") return { title: k.title };
        if (typeof k.label === "string") return { label: k.label };
        if (typeof k.text !== "string") throw new Error(`${where}: needs title, label or text`);
        if (k.level !== void 0 && !LEVELS.includes(k.level)) throw new Error(`${where}: unknown level`);
        if (k.when !== void 0 && typeof k.when !== "object") throw new Error(`${where}: when must be a condition`);
        if (k.only !== void 0 && typeof k.only !== "object") throw new Error(`${where}: only must be a condition`);
        return {
          text: k.text,
          when: k.when,
          level: k.level,
          only: k.only
        };
      });
      return { id: o.id, name: o.name, lines };
    });
  }
  function resolve(text, d) {
    return text.replace(TOKEN, (_all, name, dec) => {
      const v = d.get(name);
      if (typeof v === "number") return v.toFixed(dec === void 0 ? 0 : Number(dec));
      return String(v);
    });
  }
  function renderPage(p, d) {
    const visible = p.lines.filter((l) => !("text" in l) || l.only === void 0 || evaluate(l.only, d));
    return visible.map((l) => {
      if ("title" in l) return title(l.title);
      if ("label" in l) return label(resolve(l.label, d));
      const text = resolve(l.text, d);
      const hot = l.when ? evaluate(l.when, d) : false;
      return hot ? { level: l.level ?? "caution", text } : normal(text);
    });
  }

  // src/training/powerup.ts
  var powerUp = {
    id: "power-up",
    title: "Cold & dark to fully powered",
    steps: [
      {
        id: "ext-pwr",
        label: "EXT PWR on",
        done: (d) => d.bool("sw.extPwr"),
        withinSec: 60,
        why: "without ground power the aircraft has only batteries; nothing downstream can run"
      },
      {
        id: "ac1",
        label: "AC BUS 1 powered",
        done: (d) => d.bool("bus.ac1"),
        withinSec: 75,
        why: "AC BUS 1 feeds the essential network and the first transformer"
      },
      {
        id: "dc-ess",
        label: "DC ESS BUS powered",
        done: (d) => d.bool("bus.dcEss"),
        withinSec: 90,
        why: "the essential DC bus is what keeps the computers and the standby instruments alive"
      },
      {
        id: "pumps",
        label: "Fuel pumps on",
        done: (d) => d.bool("sw.fuelPumpL1") && d.bool("sw.fuelPumpR1"),
        withinSec: 120,
        why: "both sides must be pressurised before a start, or the LP valve opens onto nothing"
      },
      {
        id: "lp-valves",
        label: "Both LP valves open",
        done: (d) => d.bool("sys.fuelLp1") && d.bool("sys.fuelLp2"),
        withinSec: 140,
        why: "fuel reaching both engines is the last thing checked before the start sequence"
      },
      {
        id: "blue-pump",
        label: "BLUE electric pump running",
        done: (d) => d.bool("sys.hydBluePump"),
        withinSec: 170,
        why: "the BLUE system has no engine pump; without the electric pump it is dead until the RAT"
      },
      {
        id: "bleed-1",
        label: "Bleed 1 supplying the duct",
        done: (d) => d.bool("sys.bleedSrc1") || d.bool("sys.bleedApu"),
        withinSec: 200,
        why: "something has to pressurise the duct before a pack or a start valve does any work"
      }
    ]
  };

  // src/training/startengine.ts
  var startEngine1 = {
    id: "start-engine-1",
    title: "Start ENG 1 on APU bleed",
    steps: [
      {
        id: "apu",
        label: "APU available",
        done: (d) => d.bool("sys.apuRunning"),
        withinSec: 90,
        why: "with no ground air the APU is the only bleed source on a cold aircraft"
      },
      {
        id: "bleed",
        label: "APU bleed on",
        done: (d) => d.bool("sw.apuBleed"),
        withinSec: 100,
        why: "no bleed means the starter has nothing to turn the engine with"
      },
      {
        id: "fuel",
        label: "Fuel pumps and LP valve open",
        done: (d) => d.bool("sys.fuelToEng1"),
        withinSec: 120,
        why: "fuel has to reach the engine before the master lever means anything"
      },
      {
        id: "crank",
        label: "Start selector to START",
        done: (d) => d.num("sw.eng1Start") === 1,
        withinSec: 135,
        why: "the selector opens the start valve; nothing turns without it"
      },
      {
        id: "armed-clean",
        label: "Master lever on, no hot start",
        done: (d) => d.bool("sw.eng1Master") && !d.bool("sys.eng1HotStartLatched"),
        withinSec: 200,
        why: "arming below 16 % N2 runs the engine hot; the fault latches until the engine stops"
      },
      {
        id: "running",
        label: "ENG 1 self-sustaining",
        done: (d) => d.bool("sys.eng1Running"),
        withinSec: 260,
        why: "the engine must reach idle on its own before the selector is released"
      },
      {
        id: "released",
        label: "Selector released",
        done: (d) => d.num("sw.eng1Start") === 0,
        withinSec: 300,
        why: "a selector left in START keeps the valve open and the starter engaged"
      }
    ]
  };

  // src/training/bluepump.ts
  var bluePumpDrill = {
    id: "blue-pump-drill",
    title: "BLUE pump failure \u2014 recover on YELLOW",
    steps: [
      {
        id: "fault-seen",
        label: "BLUE pump failure occurs",
        done: (d) => d.bool("fault.hydBluePump"),
        withinSec: 600,
        why: "the instructor injects this; nothing is expected of the trainee until it happens"
      },
      {
        id: "yellow-pump",
        label: "YELLOW electric pump selected on",
        done: (d) => d.bool("sw.hydYellowEpump"),
        startsWhen: (d) => d.bool("fault.hydBluePump"),
        withinSec: 30,
        why: "with BLUE gone the YELLOW electric pump is the only source for that system on the ground"
      },
      {
        id: "pressure-back",
        label: "YELLOW pressure recovered",
        done: (d) => d.num("hyd.yellow") > 2e3,
        startsWhen: (d) => d.bool("fault.hydBluePump"),
        withinSec: 45,
        why: "selecting the pump is not the same as having pressure; the debrief should see the difference"
      }
    ]
  };

  // src/training/packsfail.ts
  var packsFail = {
    id: "packs-fail",
    title: "Both packs fail in cruise \u2014 hold the cabin",
    steps: [
      {
        id: "fault",
        label: "Both packs fail",
        done: (d) => d.bool("fault.pack1") && d.bool("fault.pack2"),
        withinSec: 600,
        why: "the instructor injects this; nothing is expected until it happens"
      },
      {
        id: "manual",
        label: "PRESS mode to MANUAL",
        done: (d) => d.num("sw.pressMode") === 1,
        startsWhen: (d) => d.bool("fault.pack1") && d.bool("fault.pack2"),
        withinSec: 45,
        why: "in automatic the valve does what the controller wants; with no air it cannot hold anything"
      },
      {
        id: "valve-shut",
        label: "Outflow valve closed",
        done: (d) => d.num("sw.pressMode") === 1 && d.num("sw.pressValve") === 0,
        startsWhen: (d) => d.bool("fault.pack1") && d.bool("fault.pack2"),
        withinSec: 60,
        why: "closing the valve is what stops the cabin climbing once nothing is feeding it"
      },
      {
        id: "held",
        label: "Cabin rate held near zero",
        done: (d) => Math.abs(d.num("press.cabinVs")) < 50,
        startsWhen: (d) => d.bool("fault.pack1") && d.bool("fault.pack2"),
        withinSec: 90,
        why: "the point of the drill is the rate, not the switch position"
      }
    ]
  };

  // src/training/beforestart.ts
  var beforeStart = {
    id: "before-start",
    title: "Before start",
    steps: [
      {
        id: "batteries",
        label: "Batteries on",
        done: (d) => d.bool("sw.bat1") && d.bool("sw.bat2"),
        withinSec: 60,
        why: "the ECB and the ECAM need DC before anything else can be selected"
      },
      {
        id: "ext-pwr",
        label: "Ground power on",
        done: (d) => d.bool("bus.acEss"),
        withinSec: 90,
        why: "AC ESS powers the fuel pumps and the pack valves; batteries alone will not"
      },
      {
        id: "apu-bleed",
        label: "APU bleed on",
        done: (d) => d.bool("sw.apuBleed") && d.bool("sys.apuBleedAvail"),
        withinSec: 150,
        why: "the APU is the bleed source that starts an engine on a cold aircraft"
      },
      {
        id: "packs-off",
        label: "Packs off for start",
        done: (d) => !d.bool("sw.pack1") && !d.bool("sw.pack2"),
        withinSec: 170,
        why: "packs take air the starter needs; the checklist pulls them off before a start"
      },
      {
        id: "fuel-pumps",
        label: "Fuel pumps on",
        done: (d) => d.bool("sw.fuelPumpL1") && d.bool("sw.fuelPumpR1"),
        withinSec: 200,
        why: "both sides pressurised, or the LP valve opens onto nothing"
      },
      {
        id: "lp-valves",
        label: "LP valves open",
        done: (d) => d.bool("sys.fuelLp1") && d.bool("sys.fuelLp2"),
        withinSec: 220,
        why: "the LP valve is the last thing between the tank and the engine"
      },
      {
        id: "hyd",
        label: "Hydraulics available",
        done: (d) => d.bool("sys.hydBluePump"),
        withinSec: 260,
        why: "the BLUE electric pump proves the electric network and gives flight controls pressure",
        measure: { var: "hyd.blue", aim: 3e3, band: 300, unit: "psi" }
      }
    ]
  };

  // src/training/afterstart.ts
  var afterStart = {
    id: "after-start",
    title: "After start",
    steps: [
      {
        id: "eng1",
        label: "ENG 1 running",
        done: (d) => d.bool("sys.eng1Running"),
        withinSec: 300,
        why: "the flow cannot start until the engine is self-sustaining",
        measure: { var: "eng1.n2", aim: 58, band: 4, unit: "%" }
      },
      {
        id: "eng2",
        label: "ENG 2 running",
        done: (d) => d.bool("sys.eng2Running"),
        withinSec: 360,
        why: "both engines before the generators and the bleeds are reconfigured",
        measure: { var: "eng2.n2", aim: 58, band: 4, unit: "%" }
      },
      {
        id: "gens",
        label: "Both generators on line",
        done: (d) => d.bool("ctr.gen1") && d.bool("ctr.gen2"),
        startsWhen: (d) => d.bool("sys.eng1Running") && d.bool("sys.eng2Running"),
        withinSec: 45,
        why: "the aircraft leaves ground power behind only when its own generators carry the network"
      },
      {
        id: "bleeds",
        label: "Engine bleeds on",
        done: (d) => d.bool("sw.eng1Bleed") && d.bool("sw.eng2Bleed"),
        startsWhen: (d) => d.bool("ctr.gen1") && d.bool("ctr.gen2"),
        withinSec: 45,
        why: "the ducts have to be fed by the engines before the APU is taken off them"
      },
      {
        id: "apu-bleed-off",
        label: "APU bleed off",
        done: (d) => !d.bool("sw.apuBleed"),
        startsWhen: (d) => d.bool("sw.eng1Bleed") && d.bool("sw.eng2Bleed"),
        withinSec: 40,
        why: "an APU bleed left open fights the engine bleeds and hides a duct fault"
      },
      {
        id: "packs",
        label: "Packs on",
        done: (d) => d.bool("sw.pack1") && d.bool("sw.pack2"),
        startsWhen: (d) => !d.bool("sw.apuBleed"),
        withinSec: 60,
        why: "air conditioning comes back once the ducts belong to the engines"
      },
      {
        id: "apu-off",
        label: "APU master off",
        done: (d) => !d.bool("sw.apuMaster"),
        startsWhen: (d) => d.bool("sw.pack1") && d.bool("sw.pack2"),
        withinSec: 40,
        why: "the APU is shut down and left available, not left running for the flight"
      }
    ]
  };

  // src/training/setup.ts
  function until(s, limitSec, done) {
    const n = Math.round(limitSec / s.clock.dt);
    for (let i = 0; i < n && !done(); i++) s.step(s.clock.dt);
  }
  function run(s, seconds) {
    const n = Math.round(seconds / s.clock.dt);
    for (let i = 0; i < n; i++) s.step(s.clock.dt);
  }
  function applySetup(s, id) {
    const d = s.d;
    switch (id) {
      case "cold":
        return;
      case "apu":
        d.set("sw.bat1", true);
        d.set("sw.bat2", true);
        run(s, 1);
        d.set("sw.apuMaster", true);
        d.set("sw.apuStart", true);
        until(s, 40, () => d.bool("sys.apuRunning"));
        return;
      case "engines":
        applySetup(s, "apu");
        d.set("sw.extPwr", true);
        d.set("sw.busTie", true);
        d.set("sw.apuBleed", true);
        d.set("sw.xbleed", true);
        d.set("sw.fuelPumpL1", true);
        d.set("sw.fuelPumpR1", true);
        d.set("sw.fuelEng1LpValve", true);
        d.set("sw.fuelEng2LpValve", true);
        run(s, 1);
        for (const n of [1, 2]) {
          d.set(`sw.eng${n}Start`, 1);
          until(s, 40, () => d.num(`eng${n}.n2`) >= 17);
          d.set(`sw.eng${n}Master`, true);
          until(s, 40, () => d.bool(`sys.eng${n}Running`));
        }
        return;
    }
  }

  // web/data/panel.json
  var panel_default = {
    id: "overhead",
    title: "OVERHEAD",
    cols: 66,
    rows: 30,
    controls: [
      {
        id: "bat1",
        label: "BAT 1",
        x: 2,
        y: 1,
        w: 14,
        h: 2,
        form: "push",
        var: "sw.bat1"
      },
      {
        id: "bat2",
        label: "BAT 2",
        x: 18,
        y: 1,
        w: 14,
        h: 2,
        form: "push",
        var: "sw.bat2"
      },
      {
        id: "ext-pwr",
        label: "EXT PWR",
        x: 34,
        y: 1,
        w: 14,
        h: 2,
        form: "guarded",
        var: "sw.extPwr",
        guard: "guard.extPwr",
        note: "ground power: guard, then press"
      },
      {
        id: "gen1",
        label: "GEN 1",
        x: 2,
        y: 4,
        w: 14,
        h: 2,
        form: "push",
        var: "sw.gen1"
      },
      {
        id: "gen2",
        label: "GEN 2",
        x: 18,
        y: 4,
        w: 14,
        h: 2,
        form: "push",
        var: "sw.gen2"
      },
      {
        id: "apu-gen",
        label: "APU GEN",
        x: 34,
        y: 4,
        w: 14,
        h: 2,
        form: "push",
        var: "sw.apuGen"
      },
      {
        id: "bus-tie",
        label: "BUS TIE",
        x: 50,
        y: 4,
        w: 14,
        h: 2,
        form: "push",
        var: "sw.busTie"
      },
      {
        id: "apu-master",
        label: "APU MASTER",
        x: 2,
        y: 7,
        w: 14,
        h: 2,
        form: "guarded",
        var: "sw.apuMaster",
        guard: "guard.apuMaster",
        note: "APU master: guard, then press"
      },
      {
        id: "apu-start",
        label: "APU START",
        x: 18,
        y: 7,
        w: 14,
        h: 2,
        form: "push",
        var: "sw.apuStart"
      },
      {
        id: "apu-bleed",
        label: "APU BLEED",
        x: 34,
        y: 7,
        w: 14,
        h: 2,
        form: "push",
        var: "sw.apuBleed"
      },
      {
        id: "eng1-master",
        label: "ENG1 MASTER",
        x: 50,
        y: 1,
        w: 14,
        h: 2,
        form: "guarded",
        var: "sw.eng1Master",
        guard: "guard.eng1"
      },
      {
        id: "eng1-start",
        label: "ENG1 START",
        x: 50,
        y: 7,
        w: 14,
        h: 2,
        form: "selector",
        var: "sw.eng1Start",
        positions: 2
      },
      {
        id: "eng2-master",
        label: "ENG2 MASTER",
        x: 50,
        y: 10,
        w: 14,
        h: 2,
        form: "guarded",
        var: "sw.eng2Master",
        guard: "guard.eng2"
      },
      {
        id: "eng2-start",
        label: "ENG2 START",
        x: 50,
        y: 13,
        w: 14,
        h: 2,
        form: "selector",
        var: "sw.eng2Start",
        positions: 2
      },
      {
        id: "eng1-bleed",
        label: "ENG1 BLEED",
        x: 2,
        y: 10,
        w: 14,
        h: 2,
        form: "push",
        var: "sw.eng1Bleed"
      },
      {
        id: "eng2-bleed",
        label: "ENG2 BLEED",
        x: 18,
        y: 10,
        w: 14,
        h: 2,
        form: "push",
        var: "sw.eng2Bleed"
      },
      {
        id: "xbleed",
        label: "XBLEED",
        x: 34,
        y: 10,
        w: 14,
        h: 2,
        form: "push",
        var: "sw.xbleed"
      },
      {
        id: "pack1",
        label: "PACK 1",
        x: 2,
        y: 13,
        w: 14,
        h: 2,
        form: "push",
        var: "sw.pack1"
      },
      {
        id: "pack2",
        label: "PACK 2",
        x: 18,
        y: 13,
        w: 14,
        h: 2,
        form: "push",
        var: "sw.pack2"
      },
      {
        id: "fuel-l1",
        label: "PUMP L1",
        x: 2,
        y: 16,
        w: 14,
        h: 2,
        form: "push",
        var: "sw.fuelPumpL1"
      },
      {
        id: "fuel-l2",
        label: "PUMP L2",
        x: 18,
        y: 16,
        w: 14,
        h: 2,
        form: "push",
        var: "sw.fuelPumpL2"
      },
      {
        id: "fuel-r1",
        label: "PUMP R1",
        x: 34,
        y: 16,
        w: 14,
        h: 2,
        form: "push",
        var: "sw.fuelPumpR1"
      },
      {
        id: "fuel-r2",
        label: "PUMP R2",
        x: 50,
        y: 16,
        w: 14,
        h: 2,
        form: "push",
        var: "sw.fuelPumpR2"
      },
      {
        id: "xfeed",
        label: "XFEED",
        x: 2,
        y: 19,
        w: 14,
        h: 2,
        form: "guarded",
        var: "sw.fuelXfeed",
        guard: "guard.xfeed"
      },
      {
        id: "lp1",
        label: "LP VALVE 1",
        x: 18,
        y: 19,
        w: 14,
        h: 2,
        form: "push",
        var: "sw.fuelEng1LpValve"
      },
      {
        id: "lp2",
        label: "LP VALVE 2",
        x: 34,
        y: 19,
        w: 14,
        h: 2,
        form: "push",
        var: "sw.fuelEng2LpValve"
      },
      {
        id: "press-mode",
        label: "PRESS MODE",
        x: 2,
        y: 25,
        w: 14,
        h: 2,
        form: "selector",
        var: "sw.pressMode",
        positions: 2
      },
      {
        id: "press-outflow",
        label: "OUTFLOW",
        x: 34,
        y: 25,
        w: 14,
        h: 2,
        form: "selector",
        var: "sw.pressValve",
        positions: 5,
        table: [
          0,
          25,
          50,
          75,
          100
        ]
      },
      {
        id: "hyd-green",
        label: "GREEN PUMP",
        x: 2,
        y: 22,
        w: 14,
        h: 2,
        form: "push",
        var: "sw.hydGreenEng1"
      },
      {
        id: "hyd-blue",
        label: "BLUE PUMP",
        x: 18,
        y: 22,
        w: 14,
        h: 2,
        form: "push",
        var: "sw.hydBlueEpump"
      },
      {
        id: "hyd-yellow",
        label: "YELLOW PUMP",
        x: 34,
        y: 22,
        w: 14,
        h: 2,
        form: "push",
        var: "sw.hydYellowEpump"
      },
      {
        id: "ptu",
        label: "PTU",
        x: 50,
        y: 22,
        w: 14,
        h: 2,
        form: "push",
        var: "sw.ptu"
      }
    ]
  };

  // web/data/pages.json
  var pages_default = [
    {
      id: "elec",
      name: "ELEC",
      lines: [
        {
          title: "ELEC"
        },
        {
          label: "AC BUS 1"
        },
        {
          text: "        VOLT 115  FREQ 400",
          when: {
            var: "bus.ac1"
          },
          level: "normal",
          only: {
            var: "bus.ac1"
          }
        },
        {
          text: "        VOLT 0  FREQ 0",
          when: {
            not: {
              var: "bus.ac1"
            }
          },
          level: "caution",
          only: {
            not: {
              var: "bus.ac1"
            }
          }
        },
        {
          label: "AC BUS 2"
        },
        {
          text: "        VOLT 115  FREQ 400",
          when: {
            var: "bus.ac2"
          },
          level: "normal",
          only: {
            var: "bus.ac2"
          }
        },
        {
          text: "        VOLT 0  FREQ 0",
          when: {
            not: {
              var: "bus.ac2"
            }
          },
          level: "caution",
          only: {
            not: {
              var: "bus.ac2"
            }
          }
        },
        {
          label: "AC ESS"
        },
        {
          text: "        NOT POWERED",
          when: {
            not: {
              var: "bus.acEss"
            }
          },
          level: "caution"
        },
        {
          label: "DC BAT"
        },
        {
          text: "        NOT POWERED",
          when: {
            not: {
              var: "bus.dcBat"
            }
          },
          level: "caution"
        },
        {
          label: "GEN 1"
        },
        {
          text: "        OFF LINE",
          when: {
            not: {
              var: "ctr.gen1"
            }
          },
          level: "advisory"
        },
        {
          label: "GEN 2"
        },
        {
          text: "        OFF LINE",
          when: {
            not: {
              var: "ctr.gen2"
            }
          },
          level: "advisory"
        },
        {
          label: "EXT PWR"
        },
        {
          text: "        AVAIL",
          when: {
            not: {
              var: "ctr.extPwr"
            }
          },
          level: "advisory"
        }
      ]
    },
    {
      id: "hyd",
      name: "HYD",
      lines: [
        {
          title: "HYD"
        },
        {
          label: "GREEN"
        },
        {
          text: "        {{hyd.green}} PSI",
          when: {
            lt: {
              var: "hyd.green",
              value: 1450
            }
          },
          level: "caution"
        },
        {
          label: "BLUE"
        },
        {
          text: "        {{hyd.blue}} PSI",
          when: {
            lt: {
              var: "hyd.blue",
              value: 1450
            }
          },
          level: "caution"
        },
        {
          label: "YELLOW"
        },
        {
          text: "        {{hyd.yellow}} PSI",
          when: {
            lt: {
              var: "hyd.yellow",
              value: 1450
            }
          },
          level: "caution"
        },
        {
          label: "PTU"
        },
        {
          text: "        RUNNING",
          when: {
            var: "sys.ptuRunning"
          },
          level: "normal",
          only: {
            var: "sys.ptuRunning"
          }
        },
        {
          text: "        OFF",
          when: {
            not: {
              var: "sys.ptuRunning"
            }
          },
          level: "advisory",
          only: {
            not: {
              var: "sys.ptuRunning"
            }
          }
        }
      ]
    },
    {
      id: "fuel",
      name: "FUEL",
      lines: [
        {
          title: "FUEL"
        },
        {
          label: "LEFT"
        },
        {
          text: "        FEED OK",
          when: {
            var: "sys.fuelToEng1"
          },
          level: "normal",
          only: {
            var: "sys.fuelToEng1"
          }
        },
        {
          text: "        LO PR",
          when: {
            not: {
              var: "sys.fuelToEng1"
            }
          },
          level: "caution",
          only: {
            not: {
              var: "sys.fuelToEng1"
            }
          }
        },
        {
          label: "RIGHT"
        },
        {
          text: "        FEED OK",
          when: {
            var: "sys.fuelToEng2"
          },
          level: "normal",
          only: {
            var: "sys.fuelToEng2"
          }
        },
        {
          text: "        LO PR",
          when: {
            not: {
              var: "sys.fuelToEng2"
            }
          },
          level: "caution",
          only: {
            not: {
              var: "sys.fuelToEng2"
            }
          }
        },
        {
          label: "CROSSFEED"
        },
        {
          text: "        OPEN",
          when: {
            var: "sys.fuelXfeedOpen"
          },
          level: "normal",
          only: {
            var: "sys.fuelXfeedOpen"
          }
        },
        {
          text: "        SHUT",
          when: {
            not: {
              var: "sys.fuelXfeedOpen"
            }
          },
          level: "advisory",
          only: {
            not: {
              var: "sys.fuelXfeedOpen"
            }
          }
        }
      ]
    },
    {
      id: "bleed",
      name: "BLEED",
      lines: [
        {
          title: "BLEED"
        },
        {
          label: "L DUCT"
        },
        {
          text: "        PRESS",
          when: {
            var: "sys.bleedDuctL"
          },
          level: "normal",
          only: {
            var: "sys.bleedDuctL"
          }
        },
        {
          text: "        LO PR",
          when: {
            not: {
              var: "sys.bleedDuctL"
            }
          },
          level: "caution",
          only: {
            not: {
              var: "sys.bleedDuctL"
            }
          }
        },
        {
          label: "R DUCT"
        },
        {
          text: "        PRESS",
          when: {
            var: "sys.bleedDuctR"
          },
          level: "normal",
          only: {
            var: "sys.bleedDuctR"
          }
        },
        {
          text: "        LO PR",
          when: {
            not: {
              var: "sys.bleedDuctR"
            }
          },
          level: "caution",
          only: {
            not: {
              var: "sys.bleedDuctR"
            }
          }
        },
        {
          label: "PACK 1"
        },
        {
          text: "        ON",
          when: {
            var: "sys.pack1Running"
          },
          level: "normal",
          only: {
            var: "sys.pack1Running"
          }
        },
        {
          text: "        OFF",
          when: {
            not: {
              var: "sys.pack1Running"
            }
          },
          level: "caution",
          only: {
            not: {
              var: "sys.pack1Running"
            }
          }
        },
        {
          label: "PACK 2"
        },
        {
          text: "        ON",
          when: {
            var: "sys.pack2Running"
          },
          level: "normal",
          only: {
            var: "sys.pack2Running"
          }
        },
        {
          text: "        OFF",
          when: {
            not: {
              var: "sys.pack2Running"
            }
          },
          level: "caution",
          only: {
            not: {
              var: "sys.pack2Running"
            }
          }
        }
      ]
    },
    {
      id: "press",
      name: "PRESS",
      lines: [
        {
          title: "PRESS"
        },
        {
          label: "CABIN ALT"
        },
        {
          text: "        {{press.cabinAlt}} FT",
          when: {
            gt: {
              var: "press.cabinAlt",
              value: 9550
            }
          },
          level: "warning"
        },
        {
          label: "CABIN V/S"
        },
        {
          text: "        {{press.cabinVs}} FPM"
        },
        {
          label: "DIFF PR"
        },
        {
          text: "        {{press.diffPsi:1}} PSI",
          when: {
            gt: {
              var: "press.diffPsi",
              value: 8.5
            }
          },
          level: "warning"
        },
        {
          label: "OUTFLOW"
        },
        {
          text: "        {{press.outflow}} %"
        },
        {
          label: "MODE"
        },
        {
          text: "        MANUAL",
          when: {
            not: {
              var: "sys.pressAuto"
            }
          },
          level: "advisory",
          only: {
            not: {
              var: "sys.pressAuto"
            }
          }
        },
        {
          text: "        AUTO",
          when: {
            var: "sys.pressAuto"
          },
          level: "normal",
          only: {
            var: "sys.pressAuto"
          }
        }
      ]
    }
  ];

  // web/data/messages.json
  var messages_default = [
    {
      id: "elec-emer-config",
      level: "warning",
      text: "ELEC EMER CONFIG",
      when: {
        all: [
          {
            not: {
              var: "bus.ac1"
            }
          },
          {
            not: {
              var: "bus.ac2"
            }
          },
          {
            var: "bus.dcEss"
          }
        ]
      },
      chapter: "24-20"
    },
    {
      id: "excess-cabin-alt",
      level: "warning",
      text: "EXCESS CABIN ALT",
      when: {
        gt: {
          var: "press.cabinAlt",
          value: 14e3
        }
      },
      chapter: "21-30"
    },
    {
      id: "eng1-fail",
      level: "warning",
      text: "ENG 1 FAIL",
      when: {
        all: [
          {
            var: "sw.eng1Master"
          },
          {
            eq: {
              var: "sw.eng1Start",
              value: 0
            }
          },
          {
            not: {
              var: "sys.eng1Burning"
            }
          },
          {
            lt: {
              var: "eng1.n2",
              value: 45
            }
          }
        ]
      },
      chapter: "70-00"
    },
    {
      id: "eng2-fail",
      level: "warning",
      text: "ENG 2 FAIL",
      when: {
        all: [
          {
            var: "sw.eng2Master"
          },
          {
            eq: {
              var: "sw.eng2Start",
              value: 0
            }
          },
          {
            not: {
              var: "sys.eng2Burning"
            }
          },
          {
            lt: {
              var: "eng2.n2",
              value: 45
            }
          }
        ]
      },
      chapter: "70-00"
    },
    {
      id: "cabin-alt",
      level: "caution",
      text: "CABIN ALT",
      when: {
        gt: {
          var: "press.cabinAlt",
          value: 9550
        }
      },
      chapter: "21-30"
    },
    {
      id: "hyd-g-lo-pr",
      level: "caution",
      text: "HYD G LO PR",
      when: {
        lt: {
          var: "hyd.green",
          value: 1450
        }
      },
      chapter: "29-10"
    },
    {
      id: "hyd-b-lo-pr",
      level: "caution",
      text: "HYD B LO PR",
      when: {
        lt: {
          var: "hyd.blue",
          value: 1450
        }
      },
      chapter: "29-10"
    },
    {
      id: "hyd-y-lo-pr",
      level: "caution",
      text: "HYD Y LO PR",
      when: {
        lt: {
          var: "hyd.yellow",
          value: 1450
        }
      },
      chapter: "29-10"
    },
    {
      id: "fuel-l-lo-pr",
      level: "caution",
      text: "FUEL L LO PR",
      when: {
        all: [
          {
            var: "sw.fuelEng1LpValve"
          },
          {
            not: {
              var: "sys.fuelToEng1"
            }
          }
        ]
      },
      chapter: "28-20"
    },
    {
      id: "fuel-r-lo-pr",
      level: "caution",
      text: "FUEL R LO PR",
      when: {
        all: [
          {
            var: "sw.fuelEng2LpValve"
          },
          {
            not: {
              var: "sys.fuelToEng2"
            }
          }
        ]
      },
      chapter: "28-20"
    },
    {
      id: "bleed-l-lo-pr",
      level: "caution",
      text: "BLEED L LO PR",
      when: {
        all: [
          {
            var: "sw.pack1"
          },
          {
            not: {
              var: "sys.bleedDuctL"
            }
          }
        ]
      },
      chapter: "36-10"
    },
    {
      id: "apu-fault",
      level: "warning",
      text: "APU FAULT",
      chapter: "49-00",
      when: {
        gt: {
          var: "apu.egt",
          value: 800
        }
      }
    },
    {
      id: "eng1-hot-start",
      level: "warning",
      text: "ENG 1 HOT START",
      chapter: "70-00",
      when: {
        var: "sys.eng1HotStartLatched"
      }
    },
    {
      id: "ac1-fault",
      level: "caution",
      text: "AC BUS 1 FAULT",
      chapter: "24-20",
      when: {
        all: [
          {
            var: "bus.dcBat"
          },
          {
            not: {
              var: "bus.ac1"
            }
          }
        ]
      }
    },
    {
      id: "ac2-fault",
      level: "caution",
      text: "AC BUS 2 FAULT",
      chapter: "24-20",
      when: {
        all: [
          {
            var: "bus.dcBat"
          },
          {
            not: {
              var: "bus.ac2"
            }
          }
        ]
      }
    },
    {
      id: "pack1-fault",
      level: "caution",
      text: "PACK 1 FAULT",
      chapter: "21-20",
      when: {
        all: [
          {
            var: "sw.pack1"
          },
          {
            not: {
              var: "sys.pack1Running"
            }
          }
        ]
      }
    },
    {
      id: "pack2-fault",
      level: "caution",
      text: "PACK 2 FAULT",
      chapter: "21-20",
      when: {
        all: [
          {
            var: "sw.pack2"
          },
          {
            not: {
              var: "sys.pack2Running"
            }
          }
        ]
      }
    },
    {
      id: "bleed1-fault",
      level: "caution",
      text: "BLEED 1 FAULT",
      chapter: "36-10",
      when: {
        all: [
          {
            var: "sw.eng1Bleed"
          },
          {
            var: "sys.eng1Running"
          },
          {
            not: {
              var: "sys.bleedSrc1"
            }
          }
        ]
      }
    },
    {
      id: "eng1-start-valve",
      level: "advisory",
      text: "ENG 1 START VALVE OPEN",
      chapter: "70-00",
      when: {
        var: "sys.eng1StartValve"
      }
    },
    {
      id: "fuel-xfeed-open",
      level: "advisory",
      text: "FUEL XFEED OPEN",
      chapter: "28-20",
      when: {
        var: "sys.fuelXfeedOpen"
      }
    },
    {
      id: "fuel-l-pumps-off",
      level: "advisory",
      text: "FUEL L PUMPS OFF",
      chapter: "28-20",
      when: {
        all: [
          {
            not: {
              var: "sw.fuelPumpL1"
            }
          },
          {
            not: {
              var: "sw.fuelPumpL2"
            }
          }
        ]
      }
    },
    {
      id: "cab-manual",
      level: "advisory",
      text: "CAB PR MANUAL",
      chapter: "21-30",
      when: {
        not: {
          var: "sys.pressAuto"
        }
      }
    },
    {
      id: "apu-bleed-on",
      level: "advisory",
      text: "APU BLEED ON",
      chapter: "49-00",
      when: {
        all: [
          {
            var: "sw.apuBleed"
          },
          {
            var: "sys.apuBleedAvail"
          }
        ]
      }
    }
  ];

  // src/app/main.ts
  var CELL = 13;
  var PAD = 6;
  var DRILLS = [
    { id: "power-up", label: "Power up", procedure: powerUp, setup: "cold" },
    { id: "before-start", label: "Before start", procedure: beforeStart, setup: "cold" },
    { id: "start-eng1", label: "Start ENG 1", procedure: startEngine1, setup: "apu" },
    { id: "after-start", label: "After start", procedure: afterStart, setup: "engines" },
    { id: "blue-pump", label: "BLUE pump failure", procedure: bluePumpDrill, setup: "apu" },
    { id: "packs-fail", label: "Packs fail in cruise", procedure: packsFail, setup: "engines" }
  ];
  var canvas = document.getElementById("panel");
  var ctx = canvas.getContext("2d");
  var ecamEl = document.getElementById("ecam");
  var pagesBar = document.getElementById("pages");
  var statusEl = document.getElementById("status");
  var drillsBar = document.getElementById("drills");
  var stepsEl = document.getElementById("steps");
  var restart = document.getElementById("restart");
  var freeze = document.getElementById("freeze");
  var faultPick = document.getElementById("fault");
  var pageId = "elec";
  var messages = [];
  var pages = [];
  var loadError = "";
  function attempt(what, run2, fallback) {
    try {
      return run2();
    } catch (err) {
      loadError = `${what} failed to load: ${String(err)}`;
      return fallback;
    }
  }
  var overhead = attempt(
    "panel",
    () => parsePanel(panel_default),
    { id: "empty", title: "PANEL", cols: 10, rows: 2, controls: [] }
  );
  var session = new Session({ procedure: powerUp, panel: overhead });
  pages = attempt("pages", () => parsePages(pages_default), []);
  messages = attempt("messages", () => parseMessages(messages_default), []);
  canvas.width = overhead.cols * CELL + PAD * 2;
  canvas.height = overhead.rows * CELL + PAD * 2;
  canvas.style.width = `${canvas.width}px`;
  canvas.style.height = `${canvas.height}px`;
  function start(drill) {
    const faults = drill.id === "packs-fail" ? [
      { id: "pack-1", trigger: { kind: "atTime", sec: 4 } },
      { id: "pack-2", trigger: { kind: "atTime", sec: 4 } }
    ] : drill.id === "blue-pump" ? [{ id: "hyd-blue-pump", trigger: { kind: "atTime", sec: 4 } }] : void 0;
    session = new Session({
      procedure: drill.procedure,
      panel: overhead,
      ...faults ? { faults } : {},
      ...drill.id === "packs-fail" ? { world: { pressureAltitudeFt: 35e3 } } : {}
    });
    applySetup(session, drill.setup);
    paintAll();
  }
  for (const p of pages) {
    const b = document.createElement("button");
    b.textContent = p.name;
    b.dataset.page = p.id;
    b.addEventListener("click", () => {
      pageId = p.id;
      paintEcam();
    });
    pagesBar.appendChild(b);
  }
  for (const drill of DRILLS) {
    const b = document.createElement("button");
    b.textContent = drill.label;
    b.dataset.drill = drill.id;
    b.addEventListener("click", () => {
      for (const other of Array.from(drillsBar.children)) other.classList.remove("on");
      b.classList.add("on");
      start(drill);
    });
    drillsBar.appendChild(b);
  }
  drillsBar.firstElementChild.classList.add("on");
  for (const id of faultIds()) {
    const o = document.createElement("option");
    o.value = id;
    o.textContent = `inject: ${id}`;
    faultPick.appendChild(o);
  }
  var first = document.createElement("option");
  first.value = "";
  first.textContent = "instructor: inject fault";
  first.selected = true;
  faultPick.insertBefore(first, faultPick.firstChild);
  faultPick.addEventListener("change", () => {
    if (!faultPick.value) return;
    session.injectFault(faultPick.value);
    faultPick.value = "";
    paintAll();
  });
  freeze.addEventListener("click", () => {
    if (session.isPaused) session.resume();
    else session.pause();
    freeze.classList.toggle("frozen", session.isPaused);
    freeze.textContent = session.isPaused ? "frozen" : "freeze";
    paintAll();
  });
  restart.addEventListener("click", () => {
    const on = drillsBar.querySelector(".on");
    const drill = DRILLS.find((x) => x.id === on?.dataset.drill) ?? DRILLS[0];
    start(drill);
  });
  function paintPanel(s) {
    ctx.fillStyle = "#11161c";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = "11px ui-monospace, Consolas, monospace";
    ctx.textBaseline = "top";
    for (const b of s.boxes) {
      const x = PAD + b.x * CELL;
      const y = PAD + b.y * CELL;
      const w = b.w * CELL - 3;
      const h = b.h * CELL - 3;
      ctx.fillStyle = b.lit ? "#1d3b2a" : "#1a2029";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = b.guarded ? "#ffb020" : b.lit ? "#4ade80" : "#39424f";
      ctx.lineWidth = b.guarded ? 2 : 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w, h);
      ctx.fillStyle = "#9fb0c3";
      ctx.fillText(b.label, x + 4, y + 3);
      ctx.fillStyle = b.lit ? "#7ef0b0" : "#7d8b9c";
      ctx.fillText(b.state, x + 4, y + h - 13);
    }
  }
  function paintEcam() {
    const spec = pages.find((p) => p.id === pageId);
    const lines = [
      ...linesOf(messages, session.d),
      { level: "normal", text: "" },
      ...spec ? renderPage(spec, session.d) : [{ level: "normal", text: "(no pages loaded)" }]
    ];
    ecamEl.textContent = "";
    for (const l of lines) {
      const span = document.createElement("span");
      span.textContent = l.text || " ";
      span.style.color = COLOURS[l.level] ?? "#e8eef5";
      ecamEl.appendChild(span);
      ecamEl.appendChild(document.createTextNode("\n"));
    }
    for (const b of Array.from(pagesBar.children)) {
      b.classList.toggle("on", b.dataset.page === pageId);
    }
  }
  function paintSteps() {
    const r = session.debrief();
    const rows = r.steps.map((st, i) => {
      const mark = st.status === "done" ? " ok " : st.status === "missed" ? "MISS" : " -- ";
      const colour = st.status === "done" ? "#4ade80" : st.status === "missed" ? "#ff3b30" : "#55677d";
      const when = st.status === "done" ? ` ${st.atSec?.toFixed(1) ?? ""}s` : "";
      return `<div style="color:${colour}">${mark} ${String(i + 1).padStart(2)}. ${st.label}${when}</div>`;
    });
    const verdict = session.done ? `<div class="verdict ${r.passed ? "pass" : "fail"}">${r.passed ? "PASS" : "FAIL"} ${r.completed}/${r.total} in ${r.seconds}s</div>` : `<div class="verdict">${r.completed}/${r.total}</div>`;
    stepsEl.innerHTML = `<div class="title">${r.title}</div>${verdict}${rows.join("")}`;
  }
  function paintAll() {
    paintPanel(scene(overhead, session.d));
    paintEcam();
    paintSteps();
    statusEl.textContent = loadError || [session.describe(), session.done ? "complete" : session.scorer.currentStep?.label ?? "", session.isPaused ? "FROZEN" : "", session.repositionCount ? `moved ${session.repositionCount}` : ""].filter(Boolean).join(" \xB7 ");
  }
  canvas.addEventListener("click", (ev) => {
    const r = canvas.getBoundingClientRect();
    const gx = (ev.clientX - r.left - PAD) / CELL;
    const gy = (ev.clientY - r.top - PAD) / CELL;
    const c = hitTest(overhead, gx, gy);
    if (!c) return;
    actuate(session.d, c);
    paintAll();
  });
  var last = performance.now();
  function frame(now) {
    const due2 = session.advance(now - last);
    last = now;
    if (due2 > 0) paintAll();
    requestAnimationFrame(frame);
  }
  paintAll();
  requestAnimationFrame(frame);
})();
