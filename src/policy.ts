import type { EvidenceKind } from "./types.js";

/** State choices the law leaves open, plus federal numbers that change yearly. */
export interface StatePolicy {
  state: string;
  /** Months of community engagement required per renewal period (435.556(a)(2): 1 or more). */
  ceMonthsRequired: number;
  /** First day community engagement is a condition of eligibility (435.559). */
  ceStart: string;
  /** First day 6-month renewals apply (SSA 1902(e)(14)(L)(i)). */
  sixMonthStart: string;
  /** State elected the short-term hardship exception (435.555). */
  hardshipOption: boolean;
  /** FLSA sec. 6 minimum wage, dollars per hour. */
  minimumWage: number;
  /** HHS poverty guideline: first person and each additional person, dollars per year. */
  fpl: { first: number; additional: number; year: number };
  /** Sources the state's verification plan lists as reliable (435.557(b)(1)(iii)). */
  reliableSources: string[];
  /** How old a fact may be and still count, in days. A state policy choice, except claims (12 months, 435.557(a)). */
  maxAgeDays: Partial<Record<EvidenceKind, number>> & { default: number };
}

export const FPL_2026_CONTIGUOUS = { first: 15960, additional: 5680, year: 2026 };

/** A made-up but plausible expansion state. Not any real state's plan. */
export const EXAMPLE_POLICY: StatePolicy = {
  state: "XX",
  ceMonthsRequired: 1,
  ceStart: "2027-01-01",
  sixMonthStart: "2027-01-01",
  hardshipOption: true,
  minimumWage: 7.25,
  fpl: FPL_2026_CONTIGUOUS,
  reliableSources: ["swica", "payroll", "ssa", "irs", "claims", "encounters", "snap_case", "tanf_case", "va", "ihs", "corrections", "state_ui", "school_records", "eligibility_system", "fema"],
  maxAgeDays: {
    default: 365,
    monthly_magi_income: 90,
    work_hours: 180,
    monthly_earnings: 180,
    snap_work_rule_member: 60,
    tanf_work_compliant: 60,
    incarcerated: 90,
    medically_frail: 365,
  },
};

export function fplFor(policy: StatePolicy, size: number): number {
  return policy.fpl.first + policy.fpl.additional * Math.max(0, size - 1);
}
