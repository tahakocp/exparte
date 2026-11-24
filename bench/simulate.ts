// Synthetic population, not real data. Every rate below is an assumption, printed with the results.
// Compares two verification plans: Medicaid-side data only, and the same plus SNAP/TANF case records.
import { decide } from "../src/engine.js";
import { EXAMPLE_POLICY, type StatePolicy } from "../src/policy.js";
import type { Evidence, RenewalCase } from "../src/types.js";

const N = Number(process.argv[2] ?? 100000);
let seed = 20261124;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

export const ASSUME = {
  works80: 0.55,          // works 80+ hours in a month
  payrollCovers: 0.7,     // share of those workers visible in payroll / SWICA data
  snapWorkRule: 0.22,     // in a SNAP household and subject to SNAP work rules
  tanfCompliant: 0.03,
  frail: 0.12,            // medically frail
  frailInClaims: 0.6,     // of those, visible in 12 months of claims
  caretaker: 0.15,        // parent of a child 13 or under, known to the eligibility system
  student: 0.06,
  incomeFresh: 0.85,      // income data within the state's 90-day window
};

function person(i: number): RenewalCase {
  const ev: Evidence[] = [];
  let n = 0;
  const add = (kind: Evidence["kind"], value: Evidence["value"], source: string, observed: string, month?: string) =>
    ev.push({ id: `p${i}e${++n}`, kind, value, source, observed, ...(month ? { month } : {}) });
  add("eligibility_group", "adult_viii", "eligibility_system", "2027-01-01");
  add("birth_date", `19${60 + Math.floor(rnd() * 40)}-06-15`, "ssa", "2027-01-01");
  add("household_size", 1 + Math.floor(rnd() * 3), "eligibility_system", "2027-06-01");
  add("monthly_magi_income", Math.floor(rnd() * 1700), "swica", rnd() < ASSUME.incomeFresh ? "2027-06-10" : "2027-02-01");
  if (rnd() < ASSUME.works80 && rnd() < ASSUME.payrollCovers) add("work_hours", 80 + Math.floor(rnd() * 80), "payroll", "2027-06-05", "2027-05");
  if (rnd() < ASSUME.snapWorkRule) add("snap_work_rule_member", true, "snap_case", "2027-06-20");
  if (rnd() < ASSUME.tanfCompliant) add("tanf_work_compliant", true, "tanf_case", "2027-06-20");
  if (rnd() < ASSUME.frail && rnd() < ASSUME.frailInClaims) add("medically_frail", true, "claims", "2027-04-01");
  if (rnd() < ASSUME.caretaker) add("caretaker_of_child_13_or_disabled", true, "eligibility_system", "2027-03-01");
  if (rnd() < ASSUME.student) add("education_half_time", true, "school_records", "2027-03-01", "2027-03");
  return { id: `p${i}`, state: "XX", asOf: "2027-07-01", lastRenewal: "2027-01-01", applicant: { id: `p${i}`, evidence: ev } };
}

function run(label: string, policy: StatePolicy, cases: RenewalCase[]) {
  const t0 = performance.now();
  let exParte = 0, asks = 0, cross = 0;
  for (const c of cases) {
    const d = decide(c, policy);
    if (d.outcome === "renew_ex_parte") exParte++;
    asks += d.requests.length;
    if (d.trace.some((s) => s.rule === "cross-program")) cross++;
  }
  const ms = performance.now() - t0;
  return { label, exParte: exParte / cases.length, asksPerPerson: asks / cases.length, crossProgram: cross / cases.length, perSec: cases.length / (ms / 1000), ms };
}

const cases = Array.from({ length: N }, (_, i) => person(i));
const medicaidOnly = { ...EXAMPLE_POLICY, reliableSources: EXAMPLE_POLICY.reliableSources.filter((s) => s !== "snap_case" && s !== "tanf_case") };
const rows = [run("Medicaid-side data only", medicaidOnly, cases), run("plus SNAP/TANF case data", EXAMPLE_POLICY, cases)];
console.log(`synthetic population: ${N} expansion adults, renewal 2027-07-01, state requires 1 month`);
console.log("assumptions:", JSON.stringify(ASSUME));
for (const r of rows) console.log(`${r.label.padEnd(26)} ex parte ${(r.exParte * 100).toFixed(1)}%  items asked per person ${r.asksPerPerson.toFixed(3)}  cross-program reuse ${(r.crossProgram * 100).toFixed(1)}%  ${Math.round(r.perSec).toLocaleString("en-US")} decisions/s`);
