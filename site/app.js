import { decide, EXAMPLE_POLICY } from "./lib/index.js";

const $ = (id) => document.getElementById(id);
const cases = await (await fetch("cases.json")).json();
for (const c of cases) $("pick").add(new Option(c.id, c.id));

const label = {
  renew_ex_parte: "Renew without asking the person",
  send_prefilled_form: "Send a pre-filled renewal form",
  ce_noncompliance_notice: "Notice of noncompliance (30 days, coverage continues)",
  income_over_limit_check_other_bases: "Over the income limit: check other groups first",
};

function load() {
  const c = cases.find((x) => x.id === $("pick").value);
  $("basis").textContent = c.basis;
  const { basis, expect, ...rest } = c;
  $("json").value = JSON.stringify(rest, null, 2);
  run();
}

function run() {
  let c;
  try { c = JSON.parse($("json").value); $("err").textContent = ""; }
  catch (e) { $("err").textContent = e.message; return; }
  const policy = {
    ...EXAMPLE_POLICY,
    ceMonthsRequired: Math.max(1, +$("months").value || 1),
    hardshipOption: $("hard").checked,
    reliableSources: EXAMPLE_POLICY.reliableSources.filter((s) => $("snap").checked || (s !== "snap_case" && s !== "tanf_case")),
  };
  const t0 = performance.now();
  const d = decide(c, policy);
  const ms = performance.now() - t0;
  const s = $("summary");
  s.className = d.outcome;
  s.innerHTML = "";
  const h = document.createElement("h2");
  h.textContent = label[d.outcome] ?? d.outcome;
  s.append(h);
  const p = document.createElement("p");
  p.textContent = `Next renewal ${d.nextRenewal} (${d.renewalPeriodMonths} months). Community engagement: ${d.ceStatus}.` +
    (d.respondBy ? ` Respond by ${d.respondBy}.` : "") + ` ${d.reused.length} facts reused. ${ms.toFixed(2)} ms.`;
  s.append(p);
  if (d.requests.length) {
    const ul = document.createElement("ul");
    for (const q of d.requests) { const li = document.createElement("li"); li.textContent = `Ask: ${q.why}`; ul.append(li); }
    s.append(ul);
  }
  const ol = $("trace");
  ol.innerHTML = "";
  for (const st of d.trace) {
    const li = document.createElement("li");
    li.className = st.result;
    const top = document.createElement("div");
    top.innerHTML = `<b></b> <span></span>`;
    top.querySelector("b").textContent = st.cite;
    top.querySelector("span").textContent = st.detail;
    const q = document.createElement("q");
    q.textContent = st.quote;
    li.append(top, q);
    ol.append(li);
  }
}

$("pick").onchange = load;
for (const id of ["months", "snap", "hard"]) $(id).oninput = run;
$("json").oninput = run;
$("pick").value = new URLSearchParams(location.search).get("case") ?? "snap-member";
load();
