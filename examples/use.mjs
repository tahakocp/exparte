// node examples/use.mjs  (after npm run build)
import { readFileSync } from "node:fs";
import { decide, explain, EXAMPLE_POLICY } from "../dist/src/index.js";

const c = JSON.parse(readFileSync(new URL("./snap-member.json", import.meta.url), "utf8"));
const d = decide(c, { ...EXAMPLE_POLICY, ceMonthsRequired: 1 });
console.log(explain(d, false));
console.log(JSON.stringify({ outcome: d.outcome, nextRenewal: d.nextRenewal, requests: d.requests }, null, 2));
