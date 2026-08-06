/* Printable HTML (→ PDF) for the per-customer AI tax report. Self-contained. */
const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const ngn = (v: any) => '₦' + Math.round(Number(v ?? 0)).toLocaleString();
const pct = (v: any) => Math.round(Number(v ?? 0) * 100) + '%';

export function renderTaxReportHtml(r: any, meta: { orgShort?: string; officerName?: string } = {}): string {
  const orgShort = meta.orgShort || 'KIRS';
  const officerName = meta.officerName || 'Unknown officer';
  const t = r.taxpayer;
  const incomeRows = r.income.map((y: any) =>
    `<tr><td>${y.year}</td><td class="num">${ngn(y.observedIncome)}</td><td class="num">${ngn(y.declaredIncome)}</td><td class="num warn">${ngn(y.undeclaredIncome)}</td><td class="num">${pct(y.discrepancyPct)}</td></tr>`).join('')
    || '<tr><td colspan="5" class="muted">No income on file.</td></tr>';

  const taxCardRows = r.taxCards.map((c: any) =>
    `<tr><td>${esc(c.taxType)}</td><td class="num">${c.onFile ? ngn(c.paid) : '<span class="muted">not on file</span>'}</td><td class="num">${c.assessed != null ? ngn(c.assessed) : '<span class="muted">—</span>'}</td></tr>`).join('');

  const provBlocks = r.providerBreakdown.map((p: any) => {
    const txRows = p.transactions.map((x: any) =>
      `<tr><td>${esc(x.period)}</td><td>${esc(x.accountName ?? '')}</td><td>${esc(x.accountNumber ?? '')}</td><td>${esc(x.matchMethod ?? '')}${x.matchConfidence != null ? ` (${pct(x.matchConfidence)})` : ''}</td><td class="num">${ngn(x.inflow)}</td><td class="num">${ngn(x.outflow)}</td></tr>`).join('');
    return `<div class="prov">
      <div class="provhdr"><b>${esc(p.providerName)}</b> <span class="chip">${esc(p.providerType)}</span>
        <span class="right">${ngn(p.totalInflow)} in · ${p.recordCount} record(s) · matched by ${esc(p.matchMethods.join(', ') || '—')}</span></div>
      <table><thead><tr><th>Period</th><th>Account name</th><th>Account #</th><th>Match</th><th class="num">Inflow</th><th class="num">Outflow</th></tr></thead>
      <tbody>${txRows}</tbody></table>
    </div>`;
  }).join('') || '<p class="muted">No provider records.</p>';

  const signalRows = r.signals.map((s: any) =>
    `<tr><td>${esc(s.agentKey)}</td><td>${esc(s.severity)}</td><td class="num">${pct(s.score)}</td><td>${esc(s.summary)}</td></tr>`).join('')
    || '<tr><td colspan="4" class="muted">No agent signals.</td></tr>';

  const caseRows = r.cases.map((c: any) =>
    `<tr><td>${c.year}</td><td>${esc(c.status)}</td><td>${esc(c.riskLevel)}</td><td class="num">${ngn(c.observedIncome)}</td><td class="num">${ngn(c.declaredIncome)}</td><td class="num warn">${ngn(c.estimatedTaxDue)}</td></tr>`).join('')
    || '<tr><td colspan="6" class="muted">No cases.</td></tr>';

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Tax Report — ${esc(t.name)}</title>
<style>
  *{box-sizing:border-box}
  html,body{margin:0;padding:0}
  body{font:13px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;position:relative}
  .page{max-width:900px;margin:24px auto;padding:0 20px}
  /* diagonal confidential watermark — org label + the officer who generated
     the document, so attribution survives a cropped screenshot */
  .paper-wm{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0}
  .paper-wm span{position:absolute;left:-8%;width:120%;text-align:center;transform:rotate(-24deg);font-weight:800;letter-spacing:.12em;color:rgba(185,28,28,.06);text-transform:uppercase;white-space:nowrap}
  .paper-wm .wm-org{top:34%;font-size:64px}
  .paper-wm .wm-officer{top:56%;font-size:34px;letter-spacing:.06em}
  .content{position:relative;z-index:1}
  h1{font-size:20px;margin:0 0 2px} h2{font-size:14px;margin:22px 0 8px;border-bottom:2px solid #0ea5e9;padding-bottom:4px;color:#0369a1}
  .muted{color:#94a3b8} .warn{color:#b91c1c;font-weight:600} .right{margin-left:auto} .num{text-align:right;font-variant-numeric:tabular-nums}
  table{width:100%;border-collapse:collapse;margin:6px 0} th,td{border-bottom:1px solid #e2e8f0;padding:5px 8px;text-align:left}
  th{background:#f8fafc;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#64748b}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:2px 24px} .grid div{padding:2px 0}
  .chip{background:#e0f2fe;color:#0369a1;border-radius:6px;padding:1px 7px;font-size:11px;font-weight:600}
  .prov{border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;margin:8px 0} .provhdr{display:flex;align-items:center;gap:8px;margin-bottom:4px}
  .kpis{display:flex;gap:16px;margin:8px 0} .kpi{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 14px}
  .kpi b{display:block;font-size:18px} .narr li{margin:3px 0} .foot{margin-top:24px;color:#94a3b8;font-size:11px;border-top:1px solid #e2e8f0;padding-top:8px}
  .class-band{background:#b91c1c;color:#fff;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;text-align:center;padding:5px;margin:0 0 12px;border-radius:3px}
</style></head><body>
 <div class="paper-wm"><span class="wm-org">Confidential — ${esc(orgShort)}</span><span class="wm-officer">${esc(officerName)}</span></div>
 <div class="page"><div class="content">
  <div class="class-band">Confidential — for official use only · NTAA 2025 §139</div>
  <h1>Taxpayer Tax Report</h1>
  <p class="muted">Kano State Internal Revenue Service · generated ${esc(new Date(r.generatedAt).toLocaleString())} · by ${esc(officerName)}</p>

  <h2>Taxpayer</h2>
  <div class="grid">
    <div><b>${esc(t.name)}</b> <span class="chip">${esc(t.type)}</span></div><div>Sector: ${esc(t.sector ?? '—')}</div>
    <div>TIN: ${esc(t.tin ?? '—')}</div><div>RC: ${esc(t.rcNumber ?? '—')}</div>
    <div>BVN: ${esc(t.bvn ?? '—')}</div><div>NIN: ${esc(t.nin ?? '—')}</div>
    <div>PAYE: ${esc(t.payeStatus ?? 'UNKNOWN')}${t.payeRegNumber ? ` (${esc(t.payeRegNumber)})` : ''}</div><div>${esc(t.phone ?? '')} ${esc(t.email ?? '')}</div>
  </div>

  <h2>Assessment summary</h2>
  <div class="kpis">
    <div class="kpi"><span class="muted">Total undeclared</span><b class="warn">${ngn(r.totals.totalUndeclared)}</b></div>
    <div class="kpi"><span class="muted">Est. recoverable tax</span><b>${ngn(r.totals.estimatedRecoverable)}</b></div>
    <div class="kpi"><span class="muted">Tax paid on file</span><b>${ngn(r.totals.totalTaxPaid)}</b></div>
    <div class="kpi"><span class="muted">Providers cross-matched</span><b>${r.crossIdentity.providerCount}</b></div>
  </div>
  <ul class="narr">${r.narrative.map((n: string) => `<li>${esc(n)}</li>`).join('')}</ul>

  <h2>Income (observed vs declared)</h2>
  <table><thead><tr><th>Year</th><th class="num">Observed (provider)</th><th class="num">Declared</th><th class="num">Undeclared</th><th class="num">Discrepancy</th></tr></thead><tbody>${incomeRows}</tbody></table>

  <h2>Tax cards — paid vs assessed</h2>
  <table><thead><tr><th>Tax</th><th class="num">Paid (Tax app)</th><th class="num">Assessed (FinData)</th></tr></thead><tbody>${taxCardRows}</tbody></table>

  <h2>Cross-provider identity & transactions</h2>
  <p class="muted">Cross-matched across ${r.crossIdentity.providerCount} provider(s), ${r.crossIdentity.distinctAccounts} account(s), ${r.crossIdentity.distinctBvns} BVN(s) — matched by ${esc(r.crossIdentity.matchMethods.join(', ') || '—')}. Largest single provider ${ngn(r.crossIdentity.biggestSingleProviderInflow)} · consolidated ${ngn(r.crossIdentity.combinedInflow)}.</p>
  ${r.crossIdentity.isSpreader ? `<p class="warn">⚠ Spreader pattern: no single provider over the reporting threshold, but the consolidated total crosses it — inflow appears split across banks.</p>` : ''}
  ${provBlocks}
  ${(r.crossIdentity.identityLinks && r.crossIdentity.identityLinks.length) ? `
  <h3 style="font-size:13px;margin-top:12px;color:#b45309">Same identifier found at other providers (possible same person, resolved separately)</h3>
  <table><thead><tr><th>Other provider</th><th>Matched via</th><th>Resolved-as taxpayer</th><th class="num">Inflow</th><th class="num">Records</th></tr></thead><tbody>
  ${r.crossIdentity.identityLinks.map((l: any) => `<tr><td>${esc(l.providerName)}</td><td>${esc((l.via||[]).join(', '))}</td><td>${esc(l.otherTaxpayerName ?? '—')}</td><td class="num">${ngn(l.inflow)}</td><td class="num">${l.records}</td></tr>`).join('')}
  </tbody></table>` : ''}

  <h2>AI analytics signals</h2>
  <table><thead><tr><th>Agent</th><th>Severity</th><th class="num">Score</th><th>Finding</th></tr></thead><tbody>${signalRows}</tbody></table>

  <h2>Cases</h2>
  <table><thead><tr><th>Year</th><th>Status</th><th>Risk</th><th class="num">Observed</th><th class="num">Declared</th><th class="num">Est. tax due</th></tr></thead><tbody>${caseRows}</tbody></table>

  <div class="foot">CONFIDENTIAL — Generated by ${esc(officerName)} · ${esc(new Date().toISOString())}. Unauthorised disclosure is an offence under the NTAA 2025 confidentiality provisions.<br>Observed figures are provider-reported; assessed figures are estimates. Paid figures are sourced from the Tax app where available. PII is masked unless the viewer is authorised.</div>
 </div></div>
</body></html>`;
}
