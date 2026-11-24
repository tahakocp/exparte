import type { Decision } from "./types.js";

const MARK = { met: "+", not_met: "x", unknown: "?", skipped: "-" } as const;

/** Plain text report: outcome first, then each step with its citation and the words it rests on. */
export function explain(d: Decision, withQuotes = true): string {
  const out: string[] = [];
  out.push(`case ${d.caseId}: ${d.outcome}`);
  out.push(`  next renewal ${d.nextRenewal} (${d.renewalPeriodMonths}-month period), community engagement: ${d.ceStatus}`);
  if (d.respondBy) out.push(`  respond by ${d.respondBy}`);
  if (d.requests.length) {
    out.push("  ask the person for:");
    for (const q of d.requests) out.push(`    - ${q.why} [${q.cite}]`);
  }
  out.push(`  facts reused: ${d.reused.length}`);
  out.push("");
  for (const s of d.trace) {
    out.push(`${MARK[s.result]} ${s.cite}: ${s.detail}${s.evidence.length ? "  {" + s.evidence.join(", ") + "}" : ""}`);
    if (withQuotes) out.push(`    "${s.quote}"`);
  }
  return out.join("\n");
}
