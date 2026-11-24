import type { Day, Evidence, EvidenceKind, Month, Person } from "./types.js";
import type { StatePolicy } from "./policy.js";
import { daysBetween } from "./dates.js";

/** Why a fact was or was not usable. */
export type Usability = "ok" | "stale" | "unlisted_source" | "self_attested";

export function usable(e: Evidence, asOf: Day, p: StatePolicy, allowSelfAttest = false): Usability {
  if (e.source === "self_attested") return allowSelfAttest ? "ok" : "self_attested";
  if (!p.reliableSources.includes(e.source)) return "unlisted_source";
  const max = e.source === "claims" || e.source === "encounters" ? 365 : (p.maxAgeDays[e.kind] ?? p.maxAgeDays.default);
  if (daysBetween(e.observed, asOf) > max) return "stale";
  return "ok";
}

/**
 * Index over one person's evidence: picks the newest usable fact of a kind (and month).
 * Records every fact it hands out, so the caller can report what was reused.
 */
export class Ledger {
  readonly used = new Set<string>();
  readonly rejected = new Map<string, Usability>();
  constructor(readonly person: Person, readonly asOf: Day, readonly policy: StatePolicy) {}

  get(kind: EvidenceKind, month?: Month, allowSelfAttest = false): Evidence | undefined {
    let best: Evidence | undefined;
    for (const e of this.person.evidence) {
      if (e.kind !== kind) continue;
      if (month !== undefined && e.month !== month) continue;
      const u = usable(e, this.asOf, this.policy, allowSelfAttest);
      if (u !== "ok") { this.rejected.set(e.id, u); continue; }
      if (!best || e.observed > best.observed) best = e;
    }
    if (best) this.used.add(best.id);
    return best;
  }

  bool(kind: EvidenceKind, month?: Month, allowSelfAttest = false): { v: boolean | undefined; ids: string[] } {
    const e = this.get(kind, month, allowSelfAttest);
    return { v: e === undefined ? undefined : Boolean(e.value), ids: e ? [e.id] : [] };
  }

  num(kind: EvidenceKind, month?: Month): { v: number | undefined; ids: string[] } {
    const e = this.get(kind, month);
    return { v: e === undefined ? undefined : Number(e.value), ids: e ? [e.id] : [] };
  }
}

/** Which program a data source belongs to, for the reuse report. */
export function programOf(source: string): string {
  if (source === "snap_case") return "SNAP";
  if (source === "tanf_case") return "TANF";
  if (source === "va") return "VA";
  if (source === "ihs") return "IHS";
  if (source === "self_attested") return "person";
  return "Medicaid / state data";
}
