import type { Decision, InfoRequest, Month, RenewalCase, StepResult, TraceStep, EvidenceKind } from "./types.js";
import { RULES, type Rule } from "./rules.js";
import { type StatePolicy, fplFor } from "./policy.js";
import { Ledger } from "./evidence.js";
import { addDays, addMonthM, addMonths, ageOn, monthOf, monthsBetween } from "./dates.js";

class Trace {
  steps: TraceStep[] = [];
  add(rule: Rule, result: StepResult, detail: string, evidence: string[] = []) {
    this.steps.push({ rule: rule.id, cite: rule.cite, quote: rule.quote, result, detail, evidence });
  }
}

const MANDATORY_GROUPS = new Set(["mandatory_i", "mandatory_ii", "mandatory_iii", "mandatory_iv", "mandatory_v", "mandatory_vi", "mandatory_vii", "parent_caretaker", "ssi", "pregnant_mandatory"]);

const EXCLUSIONS: { kind: EvidenceKind; rule: Rule; selfAttestOk?: boolean }[] = [
  { kind: "former_foster_youth", rule: RULES.exFoster },
  { kind: "indian_status", rule: RULES.exIndian },
  { kind: "caretaker_of_child_13_or_disabled", rule: RULES.exCaretaker },
  { kind: "veteran_total_disability", rule: RULES.exVeteran },
  { kind: "medically_frail", rule: RULES.exFrail, selfAttestOk: true },
  { kind: "tanf_work_compliant", rule: RULES.exTanf },
  { kind: "snap_work_rule_member", rule: RULES.exSnap },
  { kind: "sud_treatment", rule: RULES.exSud },
  { kind: "incarcerated", rule: RULES.exInmate },
  { kind: "pregnant", rule: RULES.exPregnant },
];

type MonthStatus = { month: Month; status: "met" | "deemed" | "not_met" | "unknown"; how: string; ids: string[]; missing: EvidenceKind[] };

/** Decide one renewal. Pure function of the case and the state policy. */
export function decide(c: RenewalCase, policy: StatePolicy): Decision {
  const t = new Trace();
  const L = new Ledger(c.applicant, c.asOf, policy);
  const requests: InfoRequest[] = [];

  // Who is this, in eligibility terms.
  const group = L.get("eligibility_group");
  const groupName = group ? String(group.value) : undefined;
  const isAdultVIII = groupName === "adult_viii";
  const birth = L.get("birth_date");
  const age = birth ? ageOn(String(birth.value), c.asOf) : undefined;
  const indian = L.bool("indian_status");

  // Renewal frequency.
  let period: 6 | 12 = 12;
  if (isAdultVIII && c.asOf >= policy.sixMonthStart) {
    if (indian.v === true) {
      t.add(RULES.sixMonthExempt, "met", "Indian / Urban Indian / California Indian: 6-month rule does not apply", indian.ids);
      t.add(RULES.twelveMonth, "met", "12-month renewal");
    } else {
      period = 6;
      t.add(RULES.sixMonth, "met", `expansion adult, renewal on ${c.asOf} is on or after ${policy.sixMonthStart}`, group ? [group.id] : []);
    }
  } else {
    t.add(RULES.twelveMonth, "met", isAdultVIII ? `renewal before ${policy.sixMonthStart}` : `group ${groupName ?? "unknown"} is not the expansion adult group`, group ? [group.id] : []);
  }

  // Income: 133% FPL + 5 point disregard, for the expansion group.
  let incomeOk: boolean | undefined = true;
  if (isAdultVIII) {
    const size = L.num("household_size");
    const income = L.num("monthly_magi_income", undefined);
    if (size.v === undefined || income.v === undefined) {
      incomeOk = undefined;
      t.add(RULES.incomeLimit, "unknown", "no current reliable income or household size on file", [...size.ids, ...income.ids]);
      if (income.v === undefined) requests.push({ kind: "monthly_magi_income", why: "current monthly income", cite: RULES.noDocsIfElectronic.cite });
      if (size.v === undefined) requests.push({ kind: "household_size", why: "household size", cite: RULES.noDocsIfElectronic.cite });
    } else {
      const limit = (fplFor(policy, size.v) * 1.38) / 12;
      incomeOk = income.v <= limit;
      t.add(RULES.incomeLimit, incomeOk ? "met" : "not_met",
        `$${income.v.toFixed(0)}/month vs ${size.v}-person limit $${limit.toFixed(2)} (133% + 5 points of ${policy.fpl.year} FPL $${fplFor(policy, size.v)})`,
        [...size.ids, ...income.ids]);
      t.add(RULES.disregard5, "met", "5 percentage point disregard applied (expansion group is the highest MAGI standard for this adult)");
    }
  }

  // Community engagement.
  let ceStatus: Decision["ceStatus"] = "not_applicable";
  let monthsChecked: Month[] = [];
  let ceMet = true;
  let ceConclusivelyNotMet = false;
  if (!isAdultVIII) {
    t.add(RULES.applicable, "skipped", `group ${groupName ?? "unknown"}: not an applicable individual`);
  } else if (c.asOf < policy.ceStart) {
    ceStatus = "not_in_effect";
    t.add(RULES.ceStart, "skipped", `renewal on ${c.asOf} is before ${policy.ceStart}`);
  } else {
    // Specified excluded individuals (435.554).
    let excluded = false;
    for (const ex of EXCLUSIONS) {
      // Incarceration is a monthly fact: only the current or previous month makes someone excluded now.
      const b = ex.kind === "incarcerated"
        ? [L.bool(ex.kind, monthOf(c.asOf)), L.bool(ex.kind, addMonthM(monthOf(c.asOf), -1))].find((x) => x.v) ?? { v: undefined, ids: [] }
        : L.bool(ex.kind, undefined, ex.selfAttestOk);
      if (b.v === true) {
        excluded = true;
        t.add(ex.rule, "met", ex.selfAttestOk && L.get(ex.kind, undefined, true)?.source === "self_attested" ? "self-attested; allowed for this exclusion" : "on file from a listed source", b.ids);
        if (ex.selfAttestOk) t.add(RULES.frailException, "met", "medically frail may be verified differently from the other exclusions");
        break;
      }
    }
    if (excluded) {
      ceStatus = "excluded";
    } else {
      t.add(RULES.applicable, "met", `age ${age ?? "?"}, expansion group, no exclusion on file`);
      t.add(RULES.ceFirstRenewal, "met", `renewal ${c.asOf} is on or after ${policy.ceStart}`);
      const from = monthOf(c.lastRenewal) < monthOf(policy.ceStart) ? monthOf(policy.ceStart) : addMonthM(monthOf(c.lastRenewal), 0);
      monthsChecked = monthsBetween(from, monthOf(c.asOf));
      if (monthsChecked.length === 0) {
        // Renewal in the implementation month itself: nothing after the start to check.
        monthsChecked = [addMonthM(monthOf(c.asOf), -1)];
      }
      const need = Math.min(policy.ceMonthsRequired, monthsChecked.length);
      // Newest month first; stop as soon as enough months are shown (435.556(b): never ask for more).
      const statuses: MonthStatus[] = [];
      let shown = 0;
      for (const m of monthsChecked.slice().reverse()) {
        const s = monthStatus(m, L, policy, age, groupName);
        statuses.push(s);
        t.add(ruleFor(s.how), s.status === "met" || s.status === "deemed" ? "met" : s.status === "not_met" ? "not_met" : "unknown", `${s.month}: ${describe(s)}`, s.ids);
        if (s.status === "met" || s.status === "deemed") shown++;
        if (shown >= need) break;
      }
      const good = statuses.filter((s) => s.status === "met" || s.status === "deemed").length;
      const unknown = statuses.filter((s) => s.status === "unknown");
      t.add(RULES.ceMonths, good >= need ? "met" : unknown.length + good >= need ? "unknown" : "not_met",
        `${good} month(s) shown out of ${monthsChecked.length} in the period (${statuses.length} checked); state requires ${need}`);
      if (good >= need) {
        ceStatus = statuses.some((s) => s.status === "met") ? "met" : "deemed";
      } else {
        ceMet = false;
        ceStatus = "unverified";
        if (unknown.length + good < need) {
          ceConclusivelyNotMet = true;
        } else {
          // Ask only for as many months as are still short, newest first.
          t.add(RULES.askWhenMissing, "met", "no reliable information for enough months; ask the person");
          for (const s of unknown.slice(0, need - good)) {
            requests.push({ kind: s.missing[0] ?? "work_hours", month: s.month, why: `hours, school, or income for ${s.month}, or any exclusion that applies`, cite: RULES.askWhenMissing.cite });
          }
        }
      }
    }
  }

  let outcome: Decision["outcome"];
  let respondBy: string | undefined;
  if (incomeOk === false) {
    outcome = "income_over_limit_check_other_bases";
    t.add(RULES.otherBases, "met", "over the expansion limit: check other groups before any denial");
  } else if (ceConclusivelyNotMet) {
    outcome = "ce_noncompliance_notice";
    respondBy = addDays(c.asOf, 30);
    t.add(RULES.noncompliance30, "met", `30 days from receipt of notice; counted here from ${c.asOf}`);
    t.add(RULES.keepCoverage, "met", "coverage continues during the 30 days");
  } else if (requests.length > 0) {
    outcome = "send_prefilled_form";
    respondBy = addDays(c.asOf, 30);
    t.add(RULES.prefilled, "met", `${requests.length} item(s) missing; renewal form pre-filled with everything else`);
    t.add(RULES.onlyNeeded, "met", `asks for: ${requests.map((q) => q.kind + (q.month ? " " + q.month : "")).join(", ")}`);
    t.add(RULES.reconsider90, "met", "if closed for no response, a late form within 90 days is reconsidered without a new application");
  } else {
    outcome = "renew_ex_parte";
    t.add(RULES.exParte, "met", "all criteria verified from information the agency already has");
    if (ceStatus !== "not_applicable" && ceStatus !== "not_in_effect") t.add(RULES.reliableInfo, "met", "community engagement checked from data on file first");
  }

  const reused = [...L.used];
  const cross = c.applicant.evidence.filter((e) => L.used.has(e.id) && (e.source === "snap_case" || e.source === "tanf_case"));
  if (cross.length) t.add(RULES.crossProgram, "met", `${cross.length} fact(s) reused from SNAP/TANF case records`, cross.map((e) => e.id));

  void ceMet;
  return {
    caseId: c.id,
    outcome,
    renewalPeriodMonths: period,
    nextRenewal: addMonths(c.asOf, period),
    respondBy,
    ceStatus,
    monthsChecked,
    requests,
    trace: t.steps,
    reused,
  };
}

function monthStatus(m: Month, L: Ledger, p: StatePolicy, age: number | undefined, group: string | undefined): MonthStatus {
  const ids: string[] = [];
  // Mandatory deeming (435.553).
  if (age !== undefined && age < 19) return { month: m, status: "deemed", how: "deem-under-19", ids, missing: [] };
  const med = L.bool("medicare");
  if (med.v) return { month: m, status: "deemed", how: "deem-medicare", ids: med.ids, missing: [] };
  if (group && MANDATORY_GROUPS.has(group)) return { month: m, status: "deemed", how: "deem-mandatory-group", ids, missing: [] };
  for (let k = 0; k <= 3; k++) {
    const inc = L.bool("incarcerated", addMonthM(m, -k));
    if (inc.v) return { month: m, status: "deemed", how: "deem-inmate", ids: inc.ids, missing: [] };
  }
  if (p.hardshipOption) {
    for (const kind of ["inpatient_stay", "disaster_county", "high_unemployment_county"] as const) {
      const h = L.bool(kind, m);
      if (h.v) return { month: m, status: "deemed", how: "hardship:" + kind, ids: h.ids, missing: [] };
    }
  }
  // Compliance (435.552(a)).
  const work = L.num("work_hours", m), svc = L.num("community_service_hours", m), prog = L.num("work_program_hours", m);
  const edu = L.bool("education_half_time", m), eduH = L.num("education_hours", m);
  const earn = L.num("monthly_earnings", m);
  const floor = p.minimumWage * 80;
  if ((work.v ?? 0) >= 80) return { month: m, status: "met", how: "ce-work", ids: work.ids, missing: [] };
  if ((svc.v ?? 0) >= 80) return { month: m, status: "met", how: "ce-service", ids: svc.ids, missing: [] };
  if ((prog.v ?? 0) >= 80) return { month: m, status: "met", how: "ce-program", ids: prog.ids, missing: [] };
  if (edu.v) return { month: m, status: "met", how: "ce-education", ids: edu.ids, missing: [] };
  const combo = (work.v ?? 0) + (svc.v ?? 0) + (prog.v ?? 0) + (eduH.v ?? 0);
  if (combo >= 80) return { month: m, status: "met", how: "ce-combo", ids: [...work.ids, ...svc.ids, ...prog.ids, ...eduH.ids], missing: [] };
  if ((earn.v ?? 0) >= floor) return { month: m, status: "met", how: "ce-income", ids: earn.ids, missing: [] };
  const seasonal = L.bool("seasonal_worker");
  if (seasonal.v) {
    const six = [1, 2, 3, 4, 5, 6].map((k) => L.num("monthly_earnings", addMonthM(m, -k)));
    if (six.every((x) => x.v !== undefined)) {
      const avg = six.reduce((s, x) => s + (x.v as number), 0) / 6;
      if (avg >= floor) return { month: m, status: "met", how: "ce-seasonal", ids: [...seasonal.ids, ...six.flatMap((x) => x.ids)], missing: [] };
    }
  }
  const any = [work, svc, prog, eduH, earn].some((x) => x.v !== undefined) || edu.v !== undefined;
  const all = [work, svc, prog, earn].every((x) => x.v !== undefined) && edu.v !== undefined;
  // A month with some data but not all activity types could still be met by the missing ones.
  if (all) return { month: m, status: "not_met", how: "ce-combo", ids: [...work.ids, ...svc.ids, ...prog.ids, ...earn.ids, ...edu.ids], missing: [] };
  const missing: EvidenceKind[] = [];
  if (work.v === undefined) missing.push("work_hours");
  if (earn.v === undefined) missing.push("monthly_earnings");
  if (svc.v === undefined) missing.push("community_service_hours");
  if (prog.v === undefined) missing.push("work_program_hours");
  if (edu.v === undefined) missing.push("education_half_time");
  return { month: m, status: "unknown", how: any ? "ce-combo" : "ce-months", ids: [...work.ids, ...earn.ids], missing };
}

function ruleFor(how: string): Rule {
  if (how.startsWith("hardship")) return RULES.hardship;
  const map: Record<string, Rule> = {
    "deem-under-19": RULES.deemUnder19, "deem-medicare": RULES.deemMedicare, "deem-mandatory-group": RULES.deemMandatoryGroup,
    "deem-inmate": RULES.deemInmate, "ce-work": RULES.ceWork, "ce-service": RULES.ceService, "ce-program": RULES.ceProgram,
    "ce-education": RULES.ceEducation, "ce-combo": RULES.ceCombo, "ce-income": RULES.ceIncome, "ce-seasonal": RULES.ceSeasonal,
    "ce-months": RULES.ceMonths,
  };
  return map[how] ?? RULES.ceMonths;
}

function describe(s: MonthStatus): string {
  if (s.status === "deemed") return `deemed (${s.how})`;
  if (s.status === "met") return `met (${s.how})`;
  if (s.status === "not_met") return "every activity type on file, none reaches 80 hours or the income floor";
  return `no reliable data for: ${s.missing.join(", ")}`;
}
