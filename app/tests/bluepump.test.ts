import { test } from "node:test";
import assert from "node:assert/strict";
import { Dictionary } from "../src/dictionary.ts";
import { declareAll, tick, type World } from "../src/systems/index.ts";
import { Scorer, formatDebrief } from "../src/training/procedure.ts";
import { bluePumpDrill } from "../src/training/bluepump.ts";
import { arm, fire } from "../src/faults/index.ts";
const world: World = { externalPowerAvailable:true, groundAirAvailable:false, pressureAltitudeFt:0, tanks:{leftHasFuel:true,rightHasFuel:true,centerHasFuel:false}, ratDeployed:false };
function rig(){ const d=new Dictionary(); declareAll(d); return d; }
function run(d:Dictionary,s:Scorer,sec:number){ const n=Math.round(sec/0.05); for(let i=0;i<n&&!s.done;i++){ tick(d,world,0.05); s.tick(0.05);} }
test("responding to the fault in time passes", () => {
  const d=rig(); d.set("sw.extPwr",true); d.set("sw.busTie",true); d.set("sw.hydBlueEpump",true);
  const s=new Scorer(bluePumpDrill,d);
  run(d,s,2);
  const set=arm([{id:"hyd-blue-pump"}]);
  fire(d,set,"hyd-blue-pump");
  run(d,s,1);
  d.set("sw.hydYellowEpump",true);
  run(d,s,5);
  const r=s.debrief();
  assert.equal(r.passed,true, formatDebrief(r));
});
test("doing nothing is a miss on both response steps", () => {
  const d=rig(); d.set("sw.extPwr",true); d.set("sw.busTie",true); d.set("sw.hydBlueEpump",true);
  const s=new Scorer(bluePumpDrill,d);
  run(d,s,2);
  const set=arm([{id:"hyd-blue-pump"}]);
  fire(d,set,"hyd-blue-pump");
  run(d,s,60);
  const r=s.debrief();
  assert.equal(r.passed,false);
  assert.equal(r.steps.find(x=>x.id==="yellow-pump")?.status,"missed");
});
test("the window does not run before the fault exists", () => {
  const d=rig();
  const s=new Scorer(bluePumpDrill,d);
  run(d,s,40); // forty seconds of ordinary flight, no fault
  assert.equal(s.debrief().steps[1].status,"pending", "still waiting for the fault");
});
