// Plain data types. Dates are ISO strings: "2027-03-01" for days, "2027-03" for months.

export type Month = string;
export type Day = string;

export type EvidenceKind =
  | "birth_date"
  | "household_size"
  | "monthly_magi_income"     // value: dollars, per month in `months`
  | "medicare"                // value: boolean
  | "pregnant"                // value: boolean (pregnant or postpartum)
  | "eligibility_group"       // value: "adult_viii" | "parent_caretaker" | ... (see groups.ts)
  | "indian_status"           // value: boolean
  | "former_foster_youth"     // value: boolean
  | "caretaker_of_child_13_or_disabled" // value: boolean
  | "veteran_total_disability"          // value: boolean
  | "medically_frail"         // value: boolean
  | "tanf_work_compliant"     // value: boolean
  | "snap_work_rule_member"   // value: boolean, SNAP household member not exempt from SNAP work rules
  | "sud_treatment"           // value: boolean
  | "incarcerated"            // value: boolean, per month
  | "work_hours"              // value: hours, per month
  | "community_service_hours" // value: hours, per month
  | "work_program_hours"      // value: hours, per month
  | "education_half_time"     // value: boolean, per month
  | "education_hours"         // value: hours, per month (only used in combinations)
  | "monthly_earnings"        // value: dollars, per month (gross, for 435.552(a)(6))
  | "seasonal_worker"         // value: boolean
  | "inpatient_stay"          // value: boolean, per month (hardship, state option)
  | "disaster_county"         // value: boolean, per month (hardship, state option)
  | "high_unemployment_county"; // value: boolean, per month (hardship, state option)

/** One fact the agency already holds, with where it came from and when it was observed. */
export interface Evidence {
  id: string;
  kind: EvidenceKind;
  value: number | boolean | string;
  /** Data source, e.g. "swica", "snap_case", "ssa", "claims", "self_attested", "payroll". */
  source: string;
  /** Day the source produced or confirmed the fact. */
  observed: Day;
  /** Month the fact describes, for monthly facts. */
  month?: Month;
}

export interface Person {
  id: string;
  name?: string;
  evidence: Evidence[];
}

export interface RenewalCase {
  id: string;
  state: string;
  /** Day the renewal is processed. */
  asOf: Day;
  /** Effective day of the most recent determination or renewal. */
  lastRenewal: Day;
  applicant: Person;
  /** Source of the case, for fixtures: a statute clause or public example. */
  basis?: string;
}

export type Outcome =
  | "renew_ex_parte"
  | "send_prefilled_form"
  | "ce_noncompliance_notice"
  | "income_over_limit_check_other_bases"
  | "not_due";

export type StepResult = "met" | "not_met" | "unknown" | "skipped";

export interface TraceStep {
  rule: string;
  cite: string;
  quote: string;
  result: StepResult;
  detail: string;
  evidence: string[];
}

export interface InfoRequest {
  kind: EvidenceKind;
  month?: Month;
  why: string;
  cite: string;
}

export interface Decision {
  caseId: string;
  outcome: Outcome;
  /** Months until the next renewal: 6 under SSA 1902(e)(14)(L), otherwise 12. */
  renewalPeriodMonths: 6 | 12;
  nextRenewal: Day;
  /** Last day to respond when a form or notice is sent. */
  respondBy?: Day;
  ceStatus: "excluded" | "deemed" | "met" | "unverified" | "not_applicable" | "not_in_effect";
  monthsChecked: Month[];
  requests: InfoRequest[];
  trace: TraceStep[];
  /** Evidence ids that were used, i.e. not asked again. */
  reused: string[];
}
