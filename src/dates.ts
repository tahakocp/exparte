import type { Day, Month } from "./types.js";

export function parseDay(d: Day): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) throw new Error(`bad date ${d}, want YYYY-MM-DD`);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

export function fmtDay(t: Date): Day {
  return t.toISOString().slice(0, 10);
}

export function addDays(d: Day, n: number): Day {
  const t = parseDay(d);
  t.setUTCDate(t.getUTCDate() + n);
  return fmtDay(t);
}

/** Calendar month add, clamped to the last day (Jan 31 + 1 month = Feb 28). */
export function addMonths(d: Day, n: number): Day {
  const t = parseDay(d);
  const day = t.getUTCDate();
  const first = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, last));
  return fmtDay(first);
}

export function monthOf(d: Day): Month {
  return d.slice(0, 7);
}

export function addMonthM(m: Month, n: number): Month {
  return monthOf(addMonths(m + "-01", n));
}

/** Months from `from` (inclusive) to `to` (exclusive). */
export function monthsBetween(from: Month, to: Month): Month[] {
  const out: Month[] = [];
  for (let m = from; m < to; m = addMonthM(m, 1)) out.push(m);
  return out;
}

export function daysBetween(a: Day, b: Day): number {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86400000);
}

/** Age in whole years on day `on`. */
export function ageOn(birth: Day, on: Day): number {
  const b = parseDay(birth), o = parseDay(on);
  let a = o.getUTCFullYear() - b.getUTCFullYear();
  if (o.getUTCMonth() < b.getUTCMonth() || (o.getUTCMonth() === b.getUTCMonth() && o.getUTCDate() < b.getUTCDate())) a--;
  return a;
}
