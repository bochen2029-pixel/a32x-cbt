import { Dictionary } from "./dictionary.ts";
import { declareAll, tick, type World } from "./systems/index.ts";
import { Scorer, formatDebrief } from "./training/procedure.ts";
import { bluePumpDrill } from "./training/bluepump.ts";
import { arm, fire } from "./faults/index.ts";
import { messages } from '../src/ecam/messages.ts';
import { loadPages } from '../src/ecam/pages.ts';
import { renderDisplay } from "./ecam/render.ts";

const pageSpecs = loadPages();
const w: World = { externalPowerAvailable:true, groundAirAvailable:false, pressureAltitudeFt:35000, tanks:{leftHasFuel:true,rightHasFuel:true,centerHasFuel:false}, ratDeployed:false };
const d=new Dictionary(); declareAll(d); const s=new Scorer(bluePumpDrill,d);
d.set("sw.extPwr",true); d.set("sw.busTie",true); d.set("sw.hydBlueEpump",true);
const run=(sec:number)=>{const n=Math.round(sec/0.05); for(let i=0;i<n&&!s.done;i++){tick(d,w,0.05); s.tick(0.05);} };
run(3);
console.log("--- healthy"); console.log(renderDisplay(messages, pageSpecs, d,"hyd"));
const set=arm([{id:"hyd-blue-pump"}]); fire(d,set,"hyd-blue-pump");
run(2);
console.log("\n--- BLUE pump failed"); console.log(renderDisplay(messages, pageSpecs, d,"hyd"));
d.set("sw.hydYellowEpump",true); run(5);
console.log("\n--- recovered on YELLOW"); console.log(renderDisplay(messages, pageSpecs, d,"hyd"));
console.log("\n" + formatDebrief(s.debrief()));






