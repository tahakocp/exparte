#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { decide } from "./engine.js";
import { explain } from "./explain.js";
import { EXAMPLE_POLICY, type StatePolicy } from "./policy.js";
import type { RenewalCase } from "./types.js";

const usage = `usage: exparte <case.json>... [--policy policy.json] [--json] [--no-quotes]

Decides each renewal case and prints the outcome with the rule trace.
--policy   state choices (months required, data sources, age limits); defaults to a made-up example state
--json     print the decision objects instead of text
`;

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
  process.stdout.write(usage);
  process.exit(args.length === 0 ? 2 : 0);
}
let policy: StatePolicy = EXAMPLE_POLICY;
const files: string[] = [];
let json = false, quotes = true;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--policy") policy = { ...EXAMPLE_POLICY, ...JSON.parse(readFileSync(args[++i], "utf8")) };
  else if (a === "--json") json = true;
  else if (a === "--no-quotes") quotes = false;
  else files.push(a);
}
const decisions = [];
for (const f of files) {
  const data = JSON.parse(readFileSync(f, "utf8"));
  const cases: RenewalCase[] = Array.isArray(data) ? data : [data];
  for (const c of cases) {
    const d = decide(c, policy);
    decisions.push(d);
    if (!json) process.stdout.write(explain(d, quotes) + "\n\n");
  }
}
if (json) process.stdout.write(JSON.stringify(decisions, null, 2) + "\n");
