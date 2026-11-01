import { Dictionary } from "./dictionary.ts";
import { declareAll, tick, type World } from "./systems/index.ts";
import { Scorer, formatDebrief } from "./training/procedure.ts";
import { packsFail } from "./training/packsfail.ts";
import { arm, fire } from "./faults/index.ts";
import { declarePanel, overhead } from "./panel/overhead.ts";
import { actuate, controlAt } from "./panel/controls.ts";
import { messages } from '../src/ecam/messages.ts';
import { loadPages } from '../src/ecam/pages.ts';
import { renderDisplay } from "./ecam/render.ts";

const pageSpecs = loadPages();
const w: World = { externalPowerAvailable:true, groundAirAvailable:false, pressureAltitudeFt:35000, tanks:{leftHasFuel:true,rightHasFuel:true,centerHasFuel:false}, ratDeployed:false };
const d=new Dictionary(); declareAll(d); declarePanel(d);
for (const n of [1,2] as const) { d.set(`eng${n}.n2`,60); d.set(`sw.eng${n}Master`,true); }
d.set("sw.extPwr",true); d.set("sw.busTie",true);
d.set("sw.fuelPumpL1",true); d.set("sw.fuelPumpR1",true); d.set("sw.fuelEng1LpValve",true); d.set("sw.fuelEng2LpValve",true);
d.set("sw.eng1Bleed",true); d.set("sw.eng2Bleed",true); d.set("sw.pack1",true); d.set("sw.pack2",true);
for(let i=0;i<18000;i++) tick(d,w,0.05);
const s=new Scorer(packsFail,d);
console.log("--- cruise, pressurised"); console.log(renderDisplay(messages, pageSpecs, d,"press"));
const set=arm([{id:"pack-1"},{id:"pack-2"}]); fire(d,set,"pack-1"); fire(d,set,"pack-2");
for(let i=0;i<300;i++){ tick(d,w,0.05); s.tick(0.05); }
console.log("\n--- both packs failed, doing nothing"); console.log(renderDisplay(messages, pageSpecs, d,"press").split("\n").slice(0,8).join("\n"));
actuate(d, controlAt(overhead,"press-mode"));
actuate(d, controlAt(overhead,"press-outflow")); d.set("sw.pressValve",0);
for(let i=0;i<1800 && !s.done;i++){ tick(d,w,0.05); s.tick(0.05); }
console.log("\n--- manual, valve shut"); console.log(renderDisplay(messages, pageSpecs, d,"press").split("\n").slice(0,6).join("\n"));
console.log("\n"+formatDebrief(s.debrief()));







