// Writes fixtures/cases.json. Each case is built from one clause of the rules, named in `basis`.
import { writeFileSync } from "node:fs";
let n = 0;
const ev = (kind, value, source, observed, month) => ({ id: `e${++n}`, kind, value, source, observed, ...(month ? { month } : {}) });
const base = (extra = []) => [
  ev("eligibility_group", "adult_viii", "eligibility_system", "2026-12-15"),
  ev("birth_date", "1990-04-02", "ssa", "2026-12-15"),
  ev("household_size", 1, "eligibility_system", "2027-06-01"),
  ev("monthly_magi_income", 1500, "swica", "2027-06-10"),
  ...extra,
];
const C = (id, basis, expect, evidence, asOf = "2027-07-01", lastRenewal = "2027-01-01") =>
  ({ id, state: "XX", asOf, lastRenewal, basis, expect, applicant: { id: "p-" + id, evidence } });
const months = ["2027-01", "2027-02", "2027-03", "2027-04", "2027-05", "2027-06"];

const cases = [
  C("work-90h", "435.552(a)(1): 90 payroll hours in one month", { outcome: "renew_ex_parte", ceStatus: "met", period: 6 },
    base([ev("work_hours", 90, "payroll", "2027-06-05", "2027-05")])),
  C("income-floor", "435.552(a)(6): $600 earnings >= $7.25 x 80 = $580", { outcome: "renew_ex_parte", ceStatus: "met" },
    base([ev("monthly_earnings", 600, "swica", "2027-06-10", "2027-05")])),
  C("income-below-floor", "435.552(a)(6) not met at $579, no other data: ask for one month", { outcome: "send_prefilled_form", requests: 1 },
    base([ev("monthly_earnings", 579, "swica", "2027-06-10", "2027-05")])),
  C("combo-50-30", "435.552(a)(5): 50 work hours + 30 community service hours", { outcome: "renew_ex_parte", ceStatus: "met" },
    base([ev("work_hours", 50, "payroll", "2027-06-05", "2027-04"), ev("community_service_hours", 30, "eligibility_system", "2027-05-02", "2027-04")])),
  C("student", "435.552(a)(4): half-time enrollment from school records", { outcome: "renew_ex_parte", ceStatus: "met" },
    base([ev("education_half_time", true, "school_records", "2027-03-01", "2027-02")])),
  C("seasonal", "435.552(a)(7): seasonal worker, 6-month average $700, current month $0", { outcome: "renew_ex_parte", ceStatus: "met" },
    base([ev("seasonal_worker", true, "state_ui", "2027-06-01"),
      ...["2027-01", "2027-02", "2027-03", "2027-04", "2027-05"].map((m, i) => ev("monthly_earnings", [1400, 1400, 600, 400, 0][i], "swica", "2027-06-10", m)),
      ev("monthly_earnings", 400, "swica", "2027-06-10", "2026-12"),
      ev("monthly_earnings", 0, "swica", "2027-06-10", "2027-06"), ev("work_hours", 0, "payroll", "2027-06-10", "2027-06"),
      ev("community_service_hours", 0, "eligibility_system", "2027-06-10", "2027-06"), ev("work_program_hours", 0, "state_ui", "2027-06-10", "2027-06"),
      ev("education_half_time", false, "school_records", "2027-06-10", "2027-06")], ),
    "2027-07-01", "2027-06-01"),
  C("snap-member", "435.554(c)(7): SNAP household member subject to SNAP work rules, from the SNAP case", { outcome: "renew_ex_parte", ceStatus: "excluded" },
    base([ev("snap_work_rule_member", true, "snap_case", "2027-06-20")])),
  C("snap-stale", "same SNAP fact, 200 days old (state window 60 days): not reused, ask", { outcome: "send_prefilled_form", ceStatus: "unverified" },
    base([ev("snap_work_rule_member", true, "snap_case", "2026-12-13")])),
  C("frail-self", "435.557(b)(2): medically frail may be self-attested", { outcome: "renew_ex_parte", ceStatus: "excluded" },
    base([ev("medically_frail", true, "self_attested", "2027-06-15")])),
  C("work-self", "self-attested work hours are not reliable information: ask for documentation", { outcome: "send_prefilled_form" },
    base([ev("work_hours", 120, "self_attested", "2027-06-15", "2027-05")])),
  C("indian", "SSA 1902(e)(14)(L)(ii) + 435.554(c)(2): 12-month period, excluded", { outcome: "renew_ex_parte", ceStatus: "excluded", period: 12 },
    base([ev("indian_status", true, "ihs", "2027-02-01")])),
  C("released", "435.553(b): released from jail in April; May deemed", { outcome: "renew_ex_parte", ceStatus: "deemed" },
    base([ev("incarcerated", true, "corrections", "2027-05-01", "2027-04")])),
  C("over-income", "435.119(b)(5) + 435.603(d)(4): $2,000/month, 1 person, limit $1,835.40", { outcome: "income_over_limit_check_other_bases" },
    base([ev("work_hours", 160, "payroll", "2027-06-05", "2027-05")]).map((e) => e.kind === "monthly_magi_income" ? { ...e, value: 2000 } : e)),
  C("income-stale", "income 120 days old (state window 90): ask for income only", { outcome: "send_prefilled_form", requests: 1 },
    base([ev("work_hours", 90, "payroll", "2027-06-05", "2027-05")]).map((e) => e.kind === "monthly_magi_income" ? { ...e, observed: "2027-03-03" } : e)),
  C("all-zero", "435.558: every activity type on file at 0 for all months: noncompliance notice, 30 days", { outcome: "ce_noncompliance_notice", ceStatus: "unverified" },
    base(months.flatMap((m) => [ev("work_hours", 0, "payroll", "2027-06-10", m), ev("monthly_earnings", 0, "swica", "2027-06-10", m),
      ev("community_service_hours", 0, "eligibility_system", "2027-06-10", m), ev("work_program_hours", 0, "state_ui", "2027-06-10", m),
      ev("education_half_time", false, "school_records", "2027-06-10", m)]))),
  C("before-2027", "renewal in Nov 2026: 12 months, no community engagement yet", { outcome: "renew_ex_parte", ceStatus: "not_in_effect", period: 12 },
    base().map((e) => ({ ...e, observed: "2026-10-01" })), "2026-11-02", "2025-11-01"),
  C("parent-group", "parent/caretaker group, not expansion adult: 12 months, CE n/a", { outcome: "renew_ex_parte", ceStatus: "not_applicable", period: 12 },
    base().map((e) => e.kind === "eligibility_group" ? { ...e, value: "parent_caretaker" } : e)),
  C("disaster", "435.555 hardship option: county under a disaster declaration in June", { outcome: "renew_ex_parte", ceStatus: "deemed" },
    base([ev("disaster_county", true, "fema", "2027-06-03", "2027-06")])),
];
writeFileSync(new URL("./cases.json", import.meta.url), JSON.stringify(cases, null, 2) + "\n");
console.log(cases.length, "cases");
