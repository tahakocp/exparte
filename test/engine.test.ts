import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decide, EXAMPLE_POLICY, explain } from "../src/index.js";

const cases = JSON.parse(readFileSync(new URL("../../fixtures/cases.json", import.meta.url), "utf8"));

for (const c of cases) {
  test(`${c.id}: ${c.basis}`, () => {
    const d = decide(c, EXAMPLE_POLICY);
    const why = "\n" + explain(d, false);
    assert.equal(d.outcome, c.expect.outcome, why);
    if (c.expect.ceStatus) assert.equal(d.ceStatus, c.expect.ceStatus, why);
    if (c.expect.period) assert.equal(d.renewalPeriodMonths, c.expect.period, why);
    if (c.expect.requests !== undefined) assert.equal(d.requests.length, c.expect.requests, why);
    for (const s of d.trace) assert.ok(s.cite && s.quote.length > 10, `step ${s.rule} has no citation`);
  });
}

test("every outcome other than not_due is reachable from the fixtures", () => {
  const seen = new Set(cases.map((c: any) => decide(c, EXAMPLE_POLICY).outcome));
  for (const o of ["renew_ex_parte", "send_prefilled_form", "ce_noncompliance_notice", "income_over_limit_check_other_bases"]) assert.ok(seen.has(o), o);
});

test("state asks for 3 months: requests never exceed the shortfall", () => {
  const c = cases.find((x: any) => x.id === "income-below-floor");
  const d = decide(c, { ...EXAMPLE_POLICY, ceMonthsRequired: 3 });
  assert.equal(d.requests.filter((q) => q.month).length, 3);
});
