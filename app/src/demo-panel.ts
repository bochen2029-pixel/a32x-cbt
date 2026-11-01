import { Dictionary } from "./dictionary.ts";
import { declareAll } from "./systems/index.ts";
import { declarePanel, overhead } from "./panel/overhead.ts";
import { render } from "./panel/render.ts";
import { actuate, controlAt } from "./panel/controls.ts";
const d = new Dictionary(); declareAll(d); declarePanel(d);
console.log(render(overhead, d));
console.log("\n--- EXT PWR guard lifted, then pressed; BAT 1 on; elements on:");
actuate(d, controlAt(overhead,"ext-pwr"));
actuate(d, controlAt(overhead,"bat1"));
actuate(d, controlAt(overhead,"bus-tie"));
console.log(render(overhead, d).split("\n").slice(0,5).join("\n"));

