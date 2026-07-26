# Tax Administration System → FINDATA — Data Interface Requirements

**Document A of two. What FINDATA needs the Tax Administration System to expose,
and why.**

| | |
|---|---|
| Document type | Interface requirements (counterparty-facing) |
| Counterparty | **Tax Administration System** — taxpayer registration, returns, assessment, tax collection |
| Direction | **Pull** — FINDATA calls the Tax System on a schedule |
| Status | Draft for review by the Tax System team |
| Version | 2.0 |
| Audience | Part A: revenue authority management. Part B–E: engineering. |

> **Two-document set.** The authority's revenue data lives in **two separate
> systems**, so these requirements are split into two counterparty documents.
> This is **Document A — the Tax Administration System** (registry, returns,
> assessments, tax payments, PAYE). Its companion is **Document B — the MDA
> Revenue Application** (non-tax revenue: permits, project fees, licences,
> market enumeration, fee ledger), addressed to a different team.
>
> The two are joined by the taxpayer's **TIN**, which the MDA application
> already stores against its own users (`tax_id`, sourced from this system). The
> integrity of that link is a shared obligation — see §C.18, which is the one
> section that exists in both documents.

> **v2.0 changelog.** v1.0 covered the classic tax-administration datasets. v1.1
> added nine more after review of the wider data model. v2.0 splits the document
> in two on confirmation that tax and non-tax revenue are administered by
> separate systems, and adds §C.18 (TIN resolution and cross-system identity).

---

## How to read this document

**Part A** is written for non-engineers: what each dataset is, which FINDATA
capability depends on it, and what breaks if we don't get it. No JSON.

**Parts B–E** are the engineering contract: transport conventions, endpoint
specifications, security, and an acceptance checklist.

Wherever this document says *"the Tax System"*, read it as the authority's tax
administration platform — taxpayer registration, returns, assessment and tax
collection. *"The MDA Revenue App"* means the separate system that administers
non-tax revenue, addressed in Document B. *"FINDATA"* is the §29 data-matching
and underdeclaration-detection platform described in [README.md](../README.md).

---

# PART A — The business case, dataset by dataset

## A.0 Why this interface exists at all

FINDATA sees one side of the picture: **money observed moving**. Banks,
fintechs, telcos, payment processors and FX bureaus submit transaction data
under NTAA 2025 §29; FINDATA matches each record to a taxpayer and totals what
that taxpayer actually received in a year.

FINDATA does **not** natively know the other side: **what the taxpayer told the
authority they earned, what they were assessed, and what they paid.** That side
lives in the Tax System.

Underdeclaration detection is a subtraction:

```
observed inflow   (FINDATA knows this)
− declared income (ONLY the Tax System knows this)
= the gap
```

Without the Tax System's data, FINDATA can produce interesting numbers but
cannot produce a **defensible assessment**. Every dataset below exists to close
one specific hole.

## A.1 The eighteen datasets

### Tier 1 — The system does not function without these

**1. Taxpayer registry.**
The authoritative list of every registered taxpayer: TIN, RC number, NIN,
names, entity type, legal form, address, LGA, sector, and registration status.

*Why:* FINDATA identifies taxpayers by matching bank-supplied BVN → NIN → name.
Today it only knows taxpayers that appeared in a provider submission — it has no
authoritative roll to match against. With the registry, match rates rise sharply
and, critically, FINDATA can tell the difference between *"this earner is not in
the tax net"* and *"this earner is registered but under-declaring"* — two
completely different enforcement actions.
*Without it:* the Tax Net module is guesswork, and match quality stays low.

**2. Filed returns / declared income.**
What each taxpayer declared as assessable income, per year.

*Why:* it is the literal baseline of the subtraction above.
*Without it:* no case can be raised. The scan engine has nothing to compare to.

**3. Tax payments and receipts.**
What was actually paid, by tax type (PIT, PAYE, WHT, CGT, stamp duty and other
state levies) and period.

*Why:* it separates *declared but unpaid* from *never declared*, and it prevents
the most damaging failure mode in this kind of system — issuing a demand notice
to a taxpayer who has already paid.
*Without it:* the per-taxpayer tax report shows declared vs observed but not
paid, and enforcement risks false demands.

### Tier 2 — Required for enforcement to be complete

**4. Assessments, demand notices and arrears.**
Assessments the Tax System has already raised, plus outstanding balances.

*Why:* FINDATA must not raise a second assessment on a gap the authority has
already assessed. Existing arrears also sharpen risk scoring — a taxpayer who is
both under-declaring *and* in arrears is a different priority.
*Without it:* duplicate assessments and legal exposure on objection.

**5. PAYE employer registrations and nominal rolls.**
Which corporates are registered as employers, and their employee schedules.

*Why:* FINDATA's "PAYE gap" worklist finds corporates observed earning but not
PAYE-registered. Nominal rolls additionally let FINDATA sanity-check whether
declared PAYE is plausible against observed payroll outflows.
*Without it:* the PAYE gap list is unreliable — we cannot distinguish
"not registered" from "we simply don't know".

**6. Filing and compliance status.**
Per taxpayer-year: did they file, when, late or on time, dormant or active.

*Why:* non-filing is itself an offence and its own enforcement track. A taxpayer
who is registered but has not filed for three years, while receiving large
inflows, is the highest-value lead in the system.
*Without it:* FINDATA can only detect under-declaration, not non-declaration.

### Tier 3 — Required for accuracy, operations and the feedback loop

**7. Reference data.**
Tax types, rate tables and bands, revenue heads, LGA/ward codes, sector
taxonomy, and the statutory tax calendar.

*Why:* FINDATA computes estimated tax due on the gap using graduated bands. If
its rate tables drift from the authority's, every figure it produces is wrong in
a way nobody notices until an objection.
*Without it:* rates must be maintained by hand in two places.

**8. Case referral and write-back.**
An endpoint on the Tax System that accepts a confirmed FINDATA case, raises it
as a real assessment or demand in the system of record, and reports back what
happened to it.

*Why:* FINDATA is a detection engine, not a billing system. A confirmed case has
to become a real, payable liability in the Tax System or the whole exercise
produces no revenue. The return path (paid / objected / withdrawn / recovered)
is what tells FINDATA whether its detections were correct.
*Without it:* cases die in FINDATA. No revenue is collected and the AI models
never learn from outcomes.

**9. Collections and aggregate figures.**
Period totals by tax type, revenue head and LGA.

*Why:* reconciliation — proving FINDATA's view agrees with the authority's books
— and executive dashboards that management will actually trust.
*Without it:* no independent check that the sync is complete and correct.

**10. Change events (webhooks).**
Near-real-time notifications when a taxpayer registers, a payment posts, an
assessment is raised, or an objection is filed.

*Why:* scheduled pulls leave FINDATA up to a day stale. Events keep the
enforcement worklist current without polling hard.
*Without it:* the system still works, just a sync cycle behind.

### Tier 2+ — Integrity, completeness and legal defensibility

These were not in the first draft. Each closes a specific failure mode that
cannot be detected or corrected from FINDATA's side alone.

**11. Related parties — directors, partners, beneficial owners, associates.**
Who controls or is connected to each corporate taxpayer.

*Why:* the most common evasion pattern in practice is routing company income
through a director's personal account. FINDATA sees the personal inflow and the
company's declaration as two unrelated facts unless it knows they are linked.
*Without it:* related-party structuring is invisible, and single-taxpayer
analysis systematically under-detects.

**12. Enforcement-suppression states — payment plans, waivers, amnesty, write-offs.**
Instalment arrangements, approved reliefs, amnesty enrolments, and written-off
liabilities.

*Why:* serving a demand notice on a taxpayer who is current on an approved
payment plan, or enrolled in an amnesty the authority itself announced, is a
serious operational and reputational failure. FINDATA must be able to suppress
those cases automatically.
*Without it:* the system will eventually embarrass the authority in a way that
is entirely preventable.

### Tier 3+ — Integrity, completeness and legal defensibility

**13. WHT credit notes.** Withholding tax deducted at source on the taxpayer's
behalf, with the deducting party. *Why:* a WHT credit is third-party evidence of
income the taxpayer received — an independent corroboration of observed inflow,
and often the cleanest proof in an objection. It also explains why observed
inflow may be net of tax already paid.

**14. Notice service records and authorised representatives.** How and when
prior notices were served, and each taxpayer's registered tax agent or
representative. *Why:* the §41 objection clock runs from **service**, not from
issue. If FINDATA cannot evidence service, an assessment is challengeable on
procedure alone regardless of how good the underlying detection was.

**15. Taxpayer-declared bank accounts.** Accounts the taxpayer has disclosed to
the authority. *Why:* a declared account gives a direct, high-confidence link
between a taxpayer and a provider-submitted record — the strongest match key
available short of BVN. Just as informative in the negative: material inflow
through an **undeclared** account is itself a finding.

**16. Identity lifecycle — merges, TIN re-issue, death, winding-up.** Events
where a taxpayer identity changes or ends. *Why:* when the Tax System merges
two duplicate records, FINDATA is left holding a dangling identity and may split
one person's income across two profiles — understating both. Enforcement against
a deceased individual or a wound-up company is worse.

**17. Official FX reference rates.** Rates by currency and date. *Why:* FINDATA
ingests FX bureau data, which arrives in foreign currency. The naira figure that
ends up on a demand notice must use the authority's official rate for the
transaction date, not a rate FINDATA chose.

### Tier 2 — Shared with Document B

**18. TIN resolution and cross-system identity.**
A service that resolves a NIN (or RC number) to a TIN, and confirms that a given
TIN is live and belongs to the taxpayer claimed.

*Why:* the authority's revenue data is split across two systems. Everything the
MDA Revenue App contributes — permit values, project fees, market enumeration —
is only useful to FINDATA once it can be attached to a **taxpayer**, and the TIN
is the only key the two systems share. The MDA application already stores a
`tax_id` obtained from this system, so the mechanism exists; what is needed is a
documented, supported interface rather than an internal call, plus honesty about
coverage.
*Without it:* Document B's datasets stay disconnected — FINDATA sees a ₦120m
permit and a ₦4m declaration and cannot prove they concern the same person.

## A.2 Priority and sequencing

| Phase | Datasets | Outcome unlocked |
|---|---|---|
| **1** | 1, 2 | Detection works end-to-end; cases can be raised |
| **2** | 3, 4, 6, **12** | Enforcement is safe — no false, duplicate or improper demands |
| **3** | 5, 7, **18** | PAYE gap, correct statutory computation, cross-system identity |
| **4** | 8, 9, 10 | Revenue actually collected; reconciliation; live data |
| **5** | 11, 13–17 | Related-party detection, match quality, legal defensibility |

Phase 1 is the minimum viable interface. Everything after it increases accuracy,
safety and yield.

**Note on 12 and 18.** Dataset 12 (arrangements) is placed early not because it
adds detection power but because it *removes* a failure mode: without it,
FINDATA will eventually serve a demand on a taxpayer who is current on an
approved payment plan. Dataset 18 (TIN resolution) is early because Document B's
entire contribution — permits, project values, enumeration — is unusable until
its records can be tied to a taxpayer in this system.

## A.3 What FINDATA gives back

This is not a one-way ask. In return, the Tax System and the authority get:

- A ranked worklist of taxpayers whose observed income exceeds declared income,
  with the estimated recoverable tax on each gap.
- Newly discovered taxable persons and businesses that are not in the register.
- The PAYE gap list — corporates earning without employer registration.
- Statutorily-framed demand notices with a defensible assessment basis (§35
  best-of-judgement, §41 objection windows).
- Case outcomes fed back so collection can be recognised against the right
  taxpayer.

---

# PART B — Transport conventions

Everything in Part C follows these rules. They are stated once here rather than
repeated per endpoint.

## B.1 Model: FINDATA pulls

FINDATA calls the Tax System. The Tax System does not need to know FINDATA's
network location, schedule, or internal state. This was chosen over push because:

- FINDATA controls freshness and can **backfill** or **re-sync** after a bad
  match run without asking anyone to re-send.
- Failure is FINDATA's problem to retry, not a lost message on the Tax System
  side.
- The Tax System's obligation is simply "expose the data and keep it correct".

**The exception is events (§C.10)**, which are push by nature.

> **Note on the existing push endpoints.** FINDATA already accepts
> `POST /integration/declared-income`, `POST /integration/paye` and
> `POST /integration/tax-payments` (see [INTEGRATION-PAYE.md](INTEGRATION-PAYE.md)
> and [INTEGRATION-TAX-PAYMENTS.md](INTEGRATION-TAX-PAYMENTS.md)). Those remain
> valid and supported as a **transitional path** — if the Tax System can push
> today and expose pull endpoints later, that is an acceptable sequence. The
> field semantics are identical in both directions, deliberately.

## B.2 Base URL and versioning

```
https://{tax-system-host}/api/partner/v1
```

The major version is in the path. Breaking changes require a new major version
and 60 days' notice; additive fields are not breaking and may ship at any time.
FINDATA ignores unknown fields.

## B.3 Authentication

**Preferred — OAuth 2.0 client credentials:**

```http
POST /api/partner/v1/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id=...&client_secret=...&scope=taxpayers.read returns.read payments.read
```

```json
{ "access_token": "eyJ...", "token_type": "Bearer", "expires_in": 3600, "scope": "taxpayers.read returns.read payments.read" }
```

All subsequent calls send `Authorization: Bearer <token>`.

**Acceptable fallback — static API key:** `x-api-key: <key>` on every request,
rotatable without downtime (two keys valid during rotation).

**Required either way:**
- TLS 1.2+ only.
- IP allowlisting of FINDATA's egress addresses (supplied separately).
- Scopes granted per dataset (`taxpayers.read`, `returns.read`, `payments.read`,
  `assessments.read`, `paye.read`, `reference.read`, `cases.write`).

## B.4 Pagination

Cursor-based. Offset pagination is not acceptable for datasets that change
during a sync.

```
GET /taxpayers?limit=500&cursor=eyJpZCI6MTIzNDV9
```

```jsonc
{
  "data": [ /* … */ ],
  "meta": {
    "count": 500,
    "nextCursor": "eyJpZCI6MTI4NDV9",   // null on the last page
    "hasMore": true
  }
}
```

- Default `limit` 100, maximum 1000.
- The cursor must be stable — a record inserted mid-sync must not cause another
  record to be skipped.
- FINDATA treats `nextCursor: null` as end-of-stream.

## B.5 Delta sync

Every collection endpoint must support:

| Parameter | Meaning |
|---|---|
| `updatedSince` | ISO-8601 UTC timestamp. Return only records whose `updatedAt` is **strictly greater**. |
| `updatedUntil` | Optional upper bound, for reproducible windowed backfills. |

Every record must carry an `updatedAt` that changes on **any** field change,
including soft deletes. Records are sorted by `(updatedAt, id)` ascending so a
cursor can resume safely.

**Deletions and de-registrations** must be represented as a record with
`"deleted": true` or a status transition — never by silent absence. FINDATA
cannot detect a row that simply stopped being returned.

FINDATA's planned cadence:

| Dataset | Cadence |
|---|---|
| Taxpayer registry | Nightly delta; full re-sync weekly |
| Returns / declared income | Nightly delta; full re-sync after each filing deadline |
| Payments | Hourly delta |
| Assessments / arrears | Nightly delta |
| PAYE employers + rolls | Nightly delta |
| Filing status | Nightly delta |
| Reference data | Daily, and on `reference.updated` event |
| Collections summary | Daily |
| Related parties (§C.11) | Weekly delta |
| Arrangements (§C.12) | Nightly delta, **plus a point-in-time check immediately before any notice is issued** |
| WHT credits (§C.13) | Nightly delta |
| Service records (§C.14) | On demand, per case |
| Declared bank accounts (§C.15) | Weekly delta |
| Lifecycle events (§C.16) | Nightly — and via webhook where available |
| FX rates (§C.17) | Daily |

## B.6 Idempotency (write endpoints only)

`POST` endpoints in §C.8 accept `Idempotency-Key: <uuid>`. Replaying the same
key within 24 hours must return the original response, not create a duplicate.

## B.7 Errors

Standard HTTP status codes, with a machine-readable body:

```jsonc
{
  "error": {
    "code": "TAXPAYER_NOT_FOUND",
    "message": "No taxpayer with TIN 01234567-0001.",
    "details": { "tin": "01234567-0001" },
    "requestId": "req_01HX…"     // echoed in logs for support
  }
}
```

| Status | When | FINDATA's behaviour |
|---|---|---|
| 400 | Malformed request | Log, alert, do not retry |
| 401 / 403 | Bad or unscoped credential | Alert operations immediately |
| 404 | Unknown single resource | Record as unmatched, continue |
| 409 | Idempotency or state conflict | Treat as success if key matches |
| 422 | Valid shape, invalid values | Log per-record, continue the batch |
| 429 | Rate limited | Honour `Retry-After`, exponential backoff |
| 5xx | Server error | Retry ×5 with backoff, then alert |

A partial page must never be returned with a 200. Either the page is complete or
it is an error.

## B.8 Rate limits

FINDATA will stay under whatever is agreed; please publish the ceiling in
response headers:

```
X-RateLimit-Limit: 600
X-RateLimit-Remaining: 588
X-RateLimit-Reset: 1753286400
Retry-After: 30          # on 429 only
```

Requested minimum: **300 requests/minute** during the nightly window, so a
1,000,000-taxpayer registry syncs in a reasonable time at 1000 records/page.

## B.9 Data types

| Type | Format |
|---|---|
| Timestamps | ISO-8601 UTC with offset — `2026-07-23T04:30:00Z` |
| Dates | `YYYY-MM-DD` |
| Money | **String** decimal, minor units included — `"4200000.00"`. Never a float. |
| Currency | ISO-4217, default `NGN` |
| Periods | `2026`, `2026-Q2`, `2026-03` |
| Enums | UPPER_SNAKE_CASE; unknown values must not break the consumer |
| Booleans | Real JSON booleans, not `"true"` |

## B.10 Health and reconciliation

```
GET /health                → { "status": "ok", "time": "2026-07-23T04:30:00Z" }
GET /sync/manifest         → per-dataset record counts and max(updatedAt)
```

`/sync/manifest` is what lets FINDATA prove a sync was complete:

```jsonc
{
  "datasets": {
    "taxpayers":   { "total": 842119, "maxUpdatedAt": "2026-07-23T03:58:11Z" },
    "returns":     { "total": 1204884, "maxUpdatedAt": "2026-07-23T02:10:44Z" },
    "payments":    { "total": 3390210, "maxUpdatedAt": "2026-07-23T04:29:02Z" }
  }
}
```

---

# PART C — Endpoint specifications

Eighteen datasets, in the priority order of §A.2. Non-tax revenue and market
enumeration are **not** in this document — they belong to Document B.

---

## C.1 Taxpayer registry — `GET /taxpayers`

> **Tier 1.** Feeds FINDATA's `identity`, `taxpayers`, `tax-net` modules.

### Request

```
GET /taxpayers?updatedSince=2026-07-22T00:00:00Z&limit=1000&cursor=…
```

| Query param | Required | Notes |
|---|---|---|
| `updatedSince` | no | Delta sync. Omit for a full pull. |
| `updatedUntil` | no | Upper bound for windowed backfill. |
| `limit`, `cursor` | no | See §B.4 |
| `type` | no | `INDIVIDUAL` \| `CORPORATE` — optional filter |
| `status` | no | Filter by registration status |
| `lga` | no | LGA code filter |

### Response record

```jsonc
{
  "id": "TP-000184221",                    // Tax System primary key — stable forever
  "tin": "01234567-0001",
  "rcNumber": "RC123456",
  "nin": "12345678901",
  "bvn": null,                             // if held; see §D.2 before sending
  "type": "INDIVIDUAL",                    // INDIVIDUAL | CORPORATE
  "legalForm": "SOLE_PROPRIETOR",          // see enum below — drives the LLC gate
  "status": "ACTIVE",                      // ACTIVE | DORMANT | DEREGISTERED | SUSPENDED
  "firstName": "Amina",
  "middleName": "O",
  "lastName": "Yusuf",
  "businessName": null,
  "dateOfBirth": "1988-04-02",
  "dateOfIncorporation": null,
  "registrationDate": "2019-06-11",
  "email": "amina.yusuf@example.com",
  "phone": "+2348030000000",
  "address": "12 Ahmadu Bello Way",
  "lgaCode": "KN-MUN",
  "lgaName": "Kano Municipal",
  "wardCode": "KN-MUN-04",
  "stateOfResidence": "Kano",
  "sector": "RETAIL_TRADE",                // authority's sector taxonomy (see C.7)
  "businessType": "Supermarket",
  "taxOffice": "KN-CENTRAL",
  "isEmployer": true,
  // ── identity lifecycle (see §C.16) ──
  "previousTins": ["N-0099123"],           // TINs this record superseded
  "mergedIntoId": null,                    // set when this record was merged away
  "ceasedAt": null,                        // date of death / winding-up / cessation
  "ceasedReason": null,                    // DECEASED | WOUND_UP | CEASED_TRADING | RELOCATED
  "taxAgentId": "AGT-0091",                // registered representative, if any (§C.14)
  "deleted": false,
  "updatedAt": "2026-07-22T09:14:03Z"
}
```

### Field requirements

| Field | Priority | Why FINDATA needs it |
|---|---|---|
| `id` | **must** | Stable foreign key for every other dataset |
| `tin` | **must** | Primary match key; stored in FINDATA as a blind index (§D.2) |
| `rcNumber` | must (corporates) | Preferred exact match key for companies |
| `nin` | **must** (individuals) | Second-strongest match key after BVN — the single biggest lever on match rate |
| `bvn` | nice-to-have | Strongest possible key; only if lawfully held (§D.2) |
| `type` | **must** | Selects the §29 reporting threshold (₦50m individual / ₦250m corporate) |
| `legalForm` | **must** | Limited companies fall outside the State's income-assessment mandate — FINDATA must not raise an income assessment on them, and pursues them on the PAYE / WHT / CGT remittance-verification track instead. Currently inferred from the business-name suffix, which is fragile. |
| `status` | **must** | Dormant/deregistered taxpayers must not be enforced against |
| names, `businessName` | **must** | Fuzzy-match fallback and notice printing |
| `dateOfBirth` | should | Disambiguates common-name collisions in probabilistic matching |
| `registrationDate` | should | Distinguishes "newly registered" from "long-standing non-filer" |
| `lgaCode`, `wardCode`, `taxOffice` | should | Case routing and officer assignment; ward is the join to Document B's enumeration data |
| `sector` | should | Sector-specific detection thresholds |
| `isEmployer` | should | Cross-check against the PAYE dataset (§C.5) |
| `previousTins`, `mergedIntoId` | should | Prevents one taxpayer's income being split across two profiles after a dedup (§C.16) |
| `ceasedAt`, `ceasedReason` | should | Blocks enforcement against the deceased or wound-up |
| `taxAgentId` | nice-to-have | Correct addressee for statutory service (§C.14) |
| `updatedAt` | **must** | Delta sync is impossible without it |

**`legalForm` enum:** `SOLE_PROPRIETOR`, `PARTNERSHIP`, `LIMITED_LIABILITY`,
`PLC`, `INCORPORATED_TRUSTEE`, `COOPERATIVE`, `GOVERNMENT`, `OTHER`.

### Also required — single lookup

```
GET /taxpayers/{tin}
GET /taxpayers/by-rc/{rcNumber}
GET /taxpayers/by-nin/{nin}
```

Same record shape, single object. Used for on-demand resolution when an officer
opens a case and FINDATA needs the freshest possible identity, and for
match-arbitration during ingest. Must respond within 500 ms (p95).

---

## C.2 Filed returns / declared income — `GET /returns`

> **Tier 1.** Feeds `declared-income`, `scan`, `cases`. This is the comparison
> baseline — the single most important dataset in this document.

### Request

```
GET /returns?year=2026&updatedSince=…&limit=1000&cursor=…
```

| Query param | Notes |
|---|---|
| `year` | Optional filter; omit for all years |
| `taxpayerId` / `tin` / `rcNumber` | Optional single-taxpayer filter |
| `taxType` | Optional — `PIT`, `PAYE`, … |
| `updatedSince`, `limit`, `cursor` | §B.4–B.5 |

### Response record

```jsonc
{
  "id": "RET-2026-0099231",
  "taxpayerId": "TP-000184221",
  "tin": "01234567-0001",
  "rcNumber": null,
  "year": 2026,
  "period": "2026",                        // annual, or 2026-Q2 / 2026-03
  "taxType": "PIT",
  "assessmentType": "SELF_ASSESSMENT",     // SELF_ASSESSMENT | DIRECT_ASSESSMENT | PAYE | BEST_OF_JUDGEMENT | AMENDED
  "grossIncome": "18400000.00",
  "assessableIncome": "16200000.00",       // ← the figure FINDATA compares against
  "chargeableIncome": "14100000.00",
  "reliefsAndDeductions": "2200000.00",
  "taxAssessed": "2115000.00",
  "currency": "NGN",
  "status": "FILED",                       // DRAFT | FILED | AMENDED | ACCEPTED | REJECTED | VOID
  "filedAt": "2027-03-28T10:02:00Z",
  "dueAt": "2027-03-31",
  "isLate": false,
  "supersededById": null,                  // set when an amended return replaces this one
  "deleted": false,
  "updatedAt": "2027-03-28T10:02:00Z"
}
```

### Notes

- **`assessableIncome` is mandatory.** It maps directly onto FINDATA's
  `DeclaredIncome.assessableIncome`, unique per `(taxpayer, year)`.
- **Amendments must be explicit.** If a taxpayer amends, return both the
  original (with `status: AMENDED` and `supersededById`) and the replacement.
  FINDATA always uses the live one, but must be able to show an officer what
  changed and when — an amendment filed *after* a demand notice is itself a
  signal.
- **Nil returns must appear** with `assessableIncome: "0.00"`, not as an absent
  record. "Filed nil" and "never filed" are different offences.
- Where a taxpayer's only income is PAYE, still emit a return-equivalent record
  with `assessmentType: PAYE` so FINDATA has a baseline for employees.

---

## C.3 Tax payments and receipts — `GET /payments`

> **Tier 1.** Feeds `tax-report`, `taxpayer360`, `cases`. Prevents demands
> against taxpayers who have already paid.

### Request

```
GET /payments?updatedSince=…&taxType=PAYE&year=2026&limit=1000&cursor=…
```

### Response record

```jsonc
{
  "id": "PAY-2026-3390210",
  "taxpayerId": "TP-000184221",
  "tin": "01234567-0001",
  "rcNumber": null,
  "taxType": "PAYE",                       // PIT | PAYE | WHT | CGT | STAMP_DUTY | LEVY | OTHER
  "revenueHead": "12010001",               // authority chart-of-accounts code
  "year": 2026,
  "period": "2026-Q2",
  "amountPaid": "4200000.00",
  "currency": "NGN",
  "reference": "RCPT-88231",               // receipt number
  "paymentChannel": "REMITA",              // REMITA | INTERSWITCH | BANK_TELLER | POS | …
  "assessmentId": "ASM-2026-0044120",      // null for unallocated / advance payments
  "status": "CONFIRMED",                   // PENDING | CONFIRMED | REVERSED | REFUNDED
  "paidAt": "2026-07-10T00:00:00Z",
  "confirmedAt": "2026-07-10T14:22:00Z",
  "deleted": false,
  "updatedAt": "2026-07-10T14:22:00Z"
}
```

### Notes

- **Reversals matter.** A reversed or refunded payment must be emitted with
  `status: REVERSED`/`REFUNDED`, never deleted. FINDATA reduces the "paid"
  figure accordingly; a silently-vanished payment leaves a false credit that
  suppresses a legitimate case.
- `assessmentId` is what lets FINDATA answer "was this gap already assessed and
  settled?" — without it, payments can only be matched by period, which is
  ambiguous.
- Maps to FINDATA's `TaxPayment`, unique per `(taxpayer, taxType, year, period)`.

---

## C.4 Assessments, demand notices and arrears — `GET /assessments`

> **Tier 2.** Feeds `cases`, `statutory`, risk scoring. Prevents duplicate
> assessments — the highest legal risk in the whole integration.

### Request

```
GET /assessments?updatedSince=…&status=OUTSTANDING&limit=1000&cursor=…
```

### Response record

```jsonc
{
  "id": "ASM-2026-0044120",
  "taxpayerId": "TP-000184221",
  "tin": "01234567-0001",
  "reference": "DN/KN/2026/004412",
  "taxType": "PIT",
  "year": 2026,
  "period": "2026",
  "basis": "BEST_OF_JUDGEMENT",            // SELF_ASSESSMENT | ADMINISTRATIVE | BEST_OF_JUDGEMENT | AUDIT | FINDATA
  "principalAmount": "2115000.00",
  "penaltyAmount": "211500.00",
  "interestAmount": "63450.00",
  "totalAssessed": "2389950.00",
  "totalPaid": "1000000.00",
  "outstandingBalance": "1389950.00",      // ← arrears
  "currency": "NGN",
  "status": "PART_PAID",                   // RAISED | SERVED | OBJECTED | CONFIRMED | PART_PAID | SETTLED | WRITTEN_OFF | VOID
  "raisedAt": "2027-04-15T00:00:00Z",
  "servedAt": "2027-04-18T00:00:00Z",
  "dueAt": "2027-05-18",
  "objection": {                           // null when none filed
    "filedAt": "2027-05-02T00:00:00Z",
    "status": "UNDER_REVIEW",              // UNDER_REVIEW | ALLOWED | PARTLY_ALLOWED | DISALLOWED | WITHDRAWN
    "decidedAt": null,
    "revisedAmount": null
  },
  "sourceSystem": "TAX_SYSTEM",           // or FINDATA, for ones we referred (see C.8)
  "sourceCaseId": null,                    // FINDATA case id when sourceSystem = FINDATA
  "deleted": false,
  "updatedAt": "2027-05-02T00:00:00Z"
}
```

### Notes

- `sourceSystem` / `sourceCaseId` close the loop with §C.8 — FINDATA reconciles
  the assessments it referred against what the Tax System actually raised.
- FINDATA will **suppress** a detected case where an assessment already exists
  for the same `(taxpayer, taxType, year)` with a non-VOID status, and surface it
  to the officer as "already assessed" instead of raising a new demand.
- Arrears feed risk scoring: outstanding balance is a direct input to
  `Taxpayer.riskScore`.

---

## C.5 PAYE employers and nominal rolls

> **Tier 2.** Feeds `paye`, `tax-net` PAYE-gap worklist.

### C.5.1 `GET /paye/employers`

```jsonc
{
  "id": "EMP-004412",
  "taxpayerId": "TP-000900112",
  "rcNumber": "RC123456",
  "tin": "01234567-0001",
  "payeRegNumber": "PAYE-KN-0099",
  "registered": true,
  "status": "ACTIVE",                      // ACTIVE | SUSPENDED | DEREGISTERED
  "registeredAt": "2021-02-08",
  "employeeCount": 148,
  "lastScheduleFiledFor": "2026-06",
  "lastScheduleFiledAt": "2026-07-09T00:00:00Z",
  "annualPayeRemitted": "88400000.00",
  "deleted": false,
  "updatedAt": "2026-07-09T00:00:00Z"
}
```

**Critical:** this list must include employers with `registered: false` where the
authority knows about them — and the endpoint must be understood as *complete*,
so that a corporate absent from it can safely be treated as **not registered**.
That completeness guarantee is what makes the PAYE gap list actionable rather
than advisory. If completeness cannot be guaranteed, say so and FINDATA will
label those taxpayers `UNKNOWN` rather than `NOT_REGISTERED`.

Maps to `Taxpayer.payeStatus` / `payeRegNumber` / `payeVerifiedAt`, with
`payeSource = TAX_APP_SYNC`.

### C.5.2 `GET /paye/employers/{id}/schedules`

Monthly nominal roll summaries — needed to test whether declared payroll is
plausible against observed payroll outflows.

```jsonc
{
  "employerId": "EMP-004412",
  "period": "2026-06",
  "employeeCount": 148,
  "grossEmoluments": "142000000.00",
  "payeDeducted": "21300000.00",
  "payeRemitted": "21300000.00",
  "filedAt": "2026-07-09T00:00:00Z",
  "isLate": false,
  "updatedAt": "2026-07-09T00:00:00Z"
}
```

Individual employee rows are **not** requested — aggregate is sufficient for
detection, and requesting less personal data is deliberate (§D.2). If the
authority later wants employee-level residency matching, that is a separate
scope with its own DPIA.

---

## C.6 Filing and compliance status — `GET /compliance/filing-status`

> **Tier 2.** Feeds `tax-net`. Turns "under-declaration only" into
> "under-declaration **and** non-declaration" detection.

```jsonc
{
  "taxpayerId": "TP-000184221",
  "tin": "01234567-0001",
  "year": 2026,
  "taxType": "PIT",
  "expectedToFile": true,                  // is a return due at all for this year?
  "filed": false,
  "filedAt": null,
  "dueAt": "2027-03-31",
  "daysLate": 114,
  "complianceState": "NON_FILER",          // COMPLIANT | LATE_FILER | NON_FILER | NIL_FILER | NOT_REQUIRED | DORMANT
  "consecutiveYearsNotFiled": 3,
  "taxClearanceIssued": false,
  "taxClearanceExpiryDate": null,
  "updatedAt": "2027-07-23T00:00:00Z"
}
```

`expectedToFile` matters as much as `filed` — FINDATA must not raise a
non-filing lead against someone who had no obligation.

---

## C.7 Reference data — `GET /reference/*`

> **Tier 3.** Feeds `statutory`, `scan` configuration, sector thresholds.

Small, cacheable, slow-changing. All return `{ data: [...], meta: { version, updatedAt } }`.

| Endpoint | Contents |
|---|---|
| `GET /reference/tax-types` | Code, name, **whether state or federal**, applicable entity types. FINDATA ingests **state heads only** — the flag is how it filters the rest out rather than silently ingesting them. |
| `GET /reference/rates` | **Rate tables and graduated bands, with effective dates** |
| `GET /reference/revenue-heads` | Chart-of-accounts codes used in `payments.revenueHead` |
| `GET /reference/lgas` | LGA **and ward** codes and names |
| `GET /reference/sectors` | The authority's sector taxonomy used in `taxpayers.sector` |
| `GET /reference/tax-calendar` | Filing and payment due dates per tax type and year |
| `GET /reference/tax-offices` | Office codes, names, coverage |
| `GET /reference/fx-rates` | Official rates by currency and date (§C.17) |

### `GET /reference/rates` — the important one

```jsonc
{
  "data": [
    {
      "taxType": "PIT",
      "effectiveFrom": "2026-01-01",
      "effectiveTo": null,
      "structure": "GRADUATED",
      "bands": [
        { "lowerBound": "0.00",        "upperBound": "800000.00",   "rate": "0.0000" },
        { "lowerBound": "800000.01",   "upperBound": "3000000.00",  "rate": "0.1500" },
        { "lowerBound": "3000000.01",  "upperBound": "12000000.00", "rate": "0.1800" }
      ],
      "consolidatedRelief": { "percentOfGross": "0.2000", "minimum": "200000.00" }
    },
    { "taxType": "CGT", "structure": "FLAT", "rate": "0.1000", "effectiveFrom": "2026-01-01" }
  ],
  "meta": { "version": 7, "updatedAt": "2026-01-01T00:00:00Z" }
}
```

FINDATA currently maintains its own copy of these in `StatutoryConfig`. Serving
them from the Tax System makes it a single source of truth and removes a whole
class of silent divergence — a gap taxed at a stale rate produces a demand the
authority cannot defend on objection.

---

## C.8 Case referral and outcome write-back

> **Tier 3, but this is where revenue is actually collected.** Feeds `cases`,
> `statutory`, and the `model-feedback` learning loop.

Three endpoints, and these are **write** operations — the only ones in this
document.

### C.8.1 `POST /assessments/referrals` — raise a FINDATA case as a real assessment

```jsonc
// Request — Idempotency-Key header required
{
  "sourceSystem": "FINDATA",
  "sourceCaseId": "e6f1…-case-uuid",
  "demandNoticeRef": "DN-2026-AB12CD",
  "taxpayerId": "TP-000184221",
  "tin": "01234567-0001",
  "taxType": "PIT",
  "year": 2026,
  "basis": "BEST_OF_JUDGEMENT",
  "observedIncome": "41200000.00",
  "declaredIncome": "16200000.00",
  "discrepancyAmount": "25000000.00",
  "assessedTax": "4500000.00",
  "penaltyAmount": "450000.00",
  "totalDemand": "4950000.00",
  "assessmentBasisUrl": "https://findata.example.gov.ng/cases/e6f1…/basis.pdf",
  "objectionDueAt": "2026-08-22",
  "issuedAt": "2026-07-23T00:00:00Z"
}
```

```jsonc
// Response 201
{ "assessmentId": "ASM-2026-0044120", "reference": "DN/KN/2026/004412", "status": "RAISED" }
```

### C.8.2 `GET /assessments/referrals/{sourceCaseId}` — what happened to it

```jsonc
{
  "sourceCaseId": "e6f1…-case-uuid",
  "assessmentId": "ASM-2026-0044120",
  "status": "PART_PAID",
  "totalAssessed": "4950000.00",
  "totalPaid": "2000000.00",
  "outstandingBalance": "2950000.00",
  "outcome": "PARTLY_RECOVERED",           // PENDING | RECOVERED | PARTLY_RECOVERED | OBJECTION_ALLOWED | WITHDRAWN | WRITTEN_OFF
  "objection": { "status": "DISALLOWED", "decidedAt": "2026-09-01T00:00:00Z" },
  "updatedAt": "2026-10-02T00:00:00Z"
}
```

This is the feedback that closes the loop. `OBJECTION_ALLOWED` means FINDATA
flagged a false positive — that signal trains the detection model and retunes
sector thresholds. Without the return path, the system never improves.

### C.8.3 `POST /paye/registrations` — register an employer discovered by FINDATA

Already anticipated in [INTEGRATION-PAYE.md](INTEGRATION-PAYE.md): until this
exists, FINDATA issues a *provisional* number (`PAYE-PROV-…`) that is not real.

```jsonc
// Request
{ "taxpayerId": "TP-000900112", "rcNumber": "RC777888", "businessName": "Kano Foods Ltd",
  "address": "…", "estimatedEmployeeCount": 24, "sourceSystem": "FINDATA", "sourceCaseId": "…" }

// Response 201
{ "payeRegNumber": "PAYE-KN-0412", "employerId": "EMP-004599", "registeredAt": "2026-07-23" }
```

---

## C.9 Collections summary — `GET /collections/summary`

> **Tier 3.** Feeds `analytics`, `metrics`, and sync reconciliation.

```
GET /collections/summary?from=2026-01-01&to=2026-06-30&groupBy=taxType,lga
```

```jsonc
{
  "period": { "from": "2026-01-01", "to": "2026-06-30" },
  "currency": "NGN",
  "totals": { "assessed": "18400000000.00", "collected": "12100000000.00", "outstanding": "6300000000.00" },
  "groups": [
    { "taxType": "PAYE", "lgaCode": "KN-MUN", "assessed": "4200000000.00", "collected": "3980000000.00", "taxpayerCount": 1841 }
  ],
  "generatedAt": "2026-07-23T04:30:00Z"
}
```

Aggregate only — no personal data. This is what a Board-level dashboard shows,
and what proves the detail sync agrees with the authority's books.

---

## C.10 Change events (webhooks) — the one push component

> **Tier 3.** Optional but strongly recommended. Keeps the worklist live between
> pulls.

The Tax System POSTs to a FINDATA endpoint supplied at onboarding:

```http
POST https://findata.example.gov.ng/api/integration/events
x-api-key: <FINDATA-issued key>
X-Signature: sha256=<HMAC-SHA256 of the raw body, shared secret>
X-Event-Id: evt_01HX…
```

```jsonc
{
  "eventId": "evt_01HX…",
  "type": "payment.confirmed",
  "occurredAt": "2026-07-23T04:29:02Z",
  "data": { "id": "PAY-2026-3390210", "taxpayerId": "TP-000184221" }
}
```

| Event type | Meaning |
|---|---|
| `taxpayer.registered` / `taxpayer.updated` / `taxpayer.deregistered` | Registry change |
| `return.filed` / `return.amended` | New or amended declaration |
| `payment.confirmed` / `payment.reversed` | Money in, or reversed |
| `assessment.raised` / `assessment.settled` | Liability lifecycle |
| `objection.filed` / `objection.decided` | Statutory objection lifecycle |
| `paye.registration.changed` | Employer status change |
| `reference.updated` | Rate tables or codes changed — re-pull §C.7 |

**Semantics:** events are **hints, not payloads of record.** Each carries only
identifiers; FINDATA re-fetches the authoritative record via the endpoints
above. That makes at-least-once delivery, duplicates and out-of-order arrival
all harmless. Retry ×5 with exponential backoff on non-2xx; FINDATA
de-duplicates on `eventId`.

---

## C.11 Related parties — `GET /taxpayers/{id}/related-parties`

> **Tier 3+.** Feeds `agents` (matching, pattern), case corroboration.

```jsonc
{
  "taxpayerId": "TP-000900112",
  "relatedParties": [
    {
      "relatedTaxpayerId": "TP-000184221",
      "relationship": "DIRECTOR",          // DIRECTOR | SHAREHOLDER | PARTNER | BENEFICIAL_OWNER | TRUSTEE | SIGNATORY | PARENT_COMPANY | SUBSIDIARY
      "name": "Amina O Yusuf",
      "nin": "12345678901",
      "shareholdingPercent": "40.00",
      "isSignatory": true,
      "appointedAt": "2019-06-11",
      "resignedAt": null,
      "source": "CAC",                     // CAC | SELF_DECLARED | AUDIT
      "updatedAt": "2026-01-04T00:00:00Z"
    }
  ]
}
```

Also acceptable as a flat collection endpoint (`GET /related-parties?updatedSince=…`)
if that is easier to serve at scale — FINDATA prefers the flat form for bulk sync
and the nested form for on-demand case work.

**Use:** when a director's personal inflow is large and the company's declaration
is small, FINDATA raises a related-party signal on both, and the officer sees one
linked picture instead of two unconnected cases. This is the single most common
structuring pattern the system is expected to catch.

---

## C.12 Enforcement-suppression states — `GET /taxpayers/{id}/arrangements`

> **Tier 2.** Feeds `cases`. Prevents demands that should never leave the
> building.

```jsonc
{
  "taxpayerId": "TP-000184221",
  "arrangements": [
    {
      "id": "ARR-2026-0331",
      "type": "PAYMENT_PLAN",              // PAYMENT_PLAN | WAIVER | AMNESTY | RELIEF | WRITE_OFF | LEGAL_HOLD | UNDER_AUDIT
      "taxType": "PIT",
      "yearsCovered": [2024, 2025, 2026],
      "status": "ACTIVE",                  // ACTIVE | COMPLETED | DEFAULTED | CANCELLED | EXPIRED
      "totalAmount": "4950000.00",
      "amountPaidToDate": "1650000.00",
      "instalmentsTotal": 12,
      "instalmentsPaid": 4,
      "inGoodStanding": true,
      "startsAt": "2026-04-01",
      "endsAt": "2027-03-31",
      "reference": "PP/KN/2026/0331",
      "updatedAt": "2026-07-02T00:00:00Z"
    }
  ]
}
```

### FINDATA's suppression rules

| Arrangement state | FINDATA behaviour |
|---|---|
| `PAYMENT_PLAN` active and `inGoodStanding: true` | Case detected but **suppressed** from the notice queue; shown to the officer as "on plan" |
| `PAYMENT_PLAN` `DEFAULTED` | Case **released** and escalated — a broken plan is an aggravating factor |
| `AMNESTY` / `WAIVER` active for the year | Case suppressed for the covered years only |
| `LEGAL_HOLD` / `UNDER_AUDIT` | Suppressed entirely; the authority is already acting |
| `WRITE_OFF` | Excluded from recovery estimates so forecasts stay honest |

Also acceptable as a flat `GET /arrangements?updatedSince=…` collection for bulk
sync; FINDATA needs both the nightly sweep and the point-in-time check made
immediately before a notice is issued.

---

## C.13 WHT credit notes — `GET /wht-credits`

> **Tier 3+.** Feeds `tax-report`, case corroboration, objection defence.

```jsonc
{
  "id": "WHT-2026-0099812",
  "taxpayerId": "TP-000184221",            // the party whose income was withheld FROM
  "tin": "01234567-0001",
  "creditNoteNumber": "WHTC/KN/2026/09981",
  "year": 2026,
  "period": "2026-Q2",
  "transactionType": "PROFESSIONAL_FEES",  // CONTRACT | RENT | DIVIDEND | INTEREST | ROYALTY | PROFESSIONAL_FEES | COMMISSION
  "grossAmount": "20000000.00",            // ← independently evidenced income
  "rate": "0.0500",
  "amountWithheld": "1000000.00",
  "deductorName": "Kano State Ministry of Works",
  "deductorTin": "09876543-0001",
  "utilised": false,
  "issuedAt": "2026-07-08T00:00:00Z",
  "deleted": false,
  "updatedAt": "2026-07-08T00:00:00Z"
}
```

`grossAmount` is income a **third party** has certified the taxpayer received.
When it exceeds declared income, that is not an inference — it is documentary
proof, and it is the strongest evidence a case can carry into an objection
hearing. It also lets FINDATA reconcile why observed bank inflow may be net of
tax already remitted.

---

## C.14 Service records and representatives

> **Tier 3+.** Feeds `statutory`, `cases`. Protects the §41 clock.

### `GET /notices/{assessmentId}/service`

```jsonc
{
  "assessmentId": "ASM-2026-0044120",
  "serviceEvents": [
    {
      "method": "EMAIL",                   // EMAIL | SMS | POST | COURIER | HAND | PUBLICATION | PORTAL
      "servedTo": "amina.yusuf@example.com",
      "servedAt": "2027-04-18T09:12:00Z",
      "deliveryStatus": "DELIVERED",       // SENT | DELIVERED | FAILED | ACKNOWLEDGED | RETURNED
      "acknowledgedAt": "2027-04-19T07:40:00Z",
      "evidenceUrl": "https://…/proof.pdf",
      "servedByOfficerId": "OFF-0044"
    }
  ]
}
```

### `GET /tax-agents/{id}`

```jsonc
{ "id": "AGT-0091", "name": "Bello & Co Chartered Accountants", "licenceNumber": "ICAN/2019/0441",
  "email": "filings@belloco.example", "phone": "+2348050000000", "status": "ACTIVE",
  "clientCount": 214, "updatedAt": "2026-01-02T00:00:00Z" }
```

The objection window in §41 runs from **service**, not from issue. Without a
service record FINDATA cannot compute `objectionDueAt` defensibly, and an
otherwise sound assessment can be set aside on procedure alone. Where a taxpayer
has a registered agent, statutory correspondence generally must go to the agent —
serving the taxpayer directly can invalidate it.

---

## C.15 Taxpayer-declared bank accounts — `GET /taxpayers/{id}/bank-accounts`

> **Tier 3+.** Feeds `identity` matching. The strongest match key after BVN.

```jsonc
{
  "taxpayerId": "TP-000184221",
  "accounts": [
    {
      "bankCode": "057",
      "bankName": "Zenith Bank",
      "accountNumber": "1234567890",
      "accountName": "AMINA O YUSUF",
      "accountType": "CURRENT",            // CURRENT | SAVINGS | DOMICILIARY | CORPORATE
      "currency": "NGN",
      "isPrimary": true,
      "declaredAt": "2019-06-11",
      "status": "ACTIVE",
      "updatedAt": "2019-06-11T00:00:00Z"
    }
  ]
}
```

FINDATA stores a keyed HMAC blind index of `accountNumber` (it already does this
for provider data — `DataRecord.accountIndex`) and matches on the index, never on
plaintext. This gives an exact, deterministic link between a bank submission and
a taxpayer without either system exposing account numbers.

The negative case is equally useful: material inflow through an account the
taxpayer never declared is itself a finding worth an officer's attention.

---

## C.16 Identity lifecycle events — `GET /taxpayers/lifecycle-events`

> **Tier 3+.** Feeds `identity`, `taxpayers`. Keeps a long-running sync honest.

```jsonc
{
  "id": "LCE-2026-0221",
  "type": "MERGED",                        // MERGED | SPLIT | TIN_REISSUED | DECEASED | WOUND_UP | REACTIVATED | DEREGISTERED
  "primaryTaxpayerId": "TP-000184221",     // the surviving record
  "affectedTaxpayerId": "TP-000771902",    // the record merged away / retired
  "previousTin": "N-0099123",
  "newTin": "01234567-0001",
  "effectiveAt": "2026-06-30T00:00:00Z",
  "reason": "Duplicate registration identified during TIN harmonisation",
  "updatedAt": "2026-06-30T10:00:00Z"
}
```

Without this, a merge on the Tax System side leaves FINDATA holding an orphaned
identity: two profiles, each with half the income, each individually below the
detection threshold. Both cases quietly disappear. This is a silent-failure mode
that no amount of care on FINDATA's side can detect on its own — it is only
visible from the Tax System.

---

## C.17 FX reference rates — `GET /reference/fx-rates`

> **Tier 3+.** Feeds ingestion normalisation for FX bureau submissions.

```
GET /reference/fx-rates?currency=USD&from=2026-01-01&to=2026-06-30
```

```jsonc
{
  "data": [
    { "currency": "USD", "date": "2026-06-28", "rate": "1580.4200", "rateType": "OFFICIAL", "source": "CBN" }
  ],
  "meta": { "updatedAt": "2026-06-28T18:00:00Z" }
}
```

FINDATA ingests FX bureau data, which arrives in foreign currency. The naira
figure printed on a demand notice must use the authority's official rate for the
transaction date. If the authority has no rate table of its own, say so and
FINDATA will source CBN rates directly and record the source on each case — but
the authority's own table is preferable, because it is the one that will be
quoted back in an objection.

---

## C.18 TIN resolution and cross-system identity

> **Tier 2. This section appears in both documents.** It is the only shared
> obligation between the Tax System and the MDA Revenue App, and neither side
> can satisfy it alone.

### The problem

The authority administers revenue through two systems. A single person may be:

| | In the Tax System | In the MDA Revenue App |
|---|---|---|
| Known as | Taxpayer `TP-000184221`, TIN `01234567-0001` | User `4471`, `tax_id` `01234567-0001` |
| Recorded activity | Filed ₦16.2m assessable income for 2026 | Paid ₦3.6m in permit fees on a ₦120m development |

Those two facts are only a case when FINDATA knows they are the same person. The
TIN is the only key both systems share.

### What already exists

The MDA Revenue App stores `tax_id` (the TIN) and `tax_id_source` against its
users, populated by calling this system — `existing` where a NIN lookup found a
TIN, `created` where one was registered on the spot. **The mechanism works.**
What this section asks for is that it become a documented, supported, rate-
appropriate interface, and that its coverage be measured and disclosed.

### C.18.1 `GET /identity/resolve`

```
GET /identity/resolve?nin=12345678901
GET /identity/resolve?rcNumber=RC123456
```

```jsonc
{
  "matched": true,
  "taxpayerId": "TP-000184221",
  "tin": "01234567-0001",
  "status": "ACTIVE",
  "type": "INDIVIDUAL",
  "nameMatchHint": "A** Y*****",           // masked, for operator confirmation only
  "resolvedAt": "2026-07-23T04:30:00Z"
}
```

A clean `{ "matched": false }` for an unknown identifier is as important as a
match — it is how FINDATA distinguishes *"not in the tax net"* from *"lookup
failed"*, and those drive opposite enforcement actions.

### C.18.2 `POST /identity/resolve/bulk`

Batch form for reconciliation runs, up to 1000 identifiers per call. Same record
shape per result, plus the input identifier echoed back.

### C.18.3 `GET /identity/verify/{tin}`

Confirms a TIN is live and returns its current status — used before FINDATA
attaches an MDA record to a taxpayer, so a stale or merged TIN in the MDA
application does not silently mis-attribute someone else's spending.

### Requirements on both sides

| Requirement | Owner |
|---|---|
| Expose NIN→TIN resolution as a supported API, with a documented rate limit | Tax System |
| Return an explicit no-match rather than an error for unknown identifiers | Tax System |
| Publish `tax_id` **coverage** — the share of MDA users with a resolved TIN | MDA Revenue App |
| Preserve `tax_id_source` (`existing` / `created`) in the data sent to FINDATA | MDA Revenue App |
| Re-resolve TINs affected by a merge or re-issue (§C.16) | Both |
| Never expose plaintext NIN in bulk responses beyond what the lookup requires | Tax System |

### The coverage question

FINDATA's ability to use Document B's data is capped by `tax_id` coverage in the
MDA application. If 20% of MDA users carry a resolved TIN, then 80% of the
permit and enumeration signal cannot be attached to a taxpayer, and this
integration delivers a fraction of its value.

That number is not currently known to either team. **Measuring it is the single
most useful thing that can be done before build starts** — it determines whether
Document B is a major workstream or a marginal one, and whether a
back-resolution campaign needs to be scheduled ahead of it.

---

# PART D — Security, privacy and operations

## D.1 Security requirements

| Control | Requirement |
|---|---|
| Transport | TLS 1.2+, valid CA-issued certificate, HSTS |
| Authentication | OAuth 2.0 client credentials (preferred) or rotatable API key |
| Authorisation | Per-dataset scopes; FINDATA is granted read-only except §C.8 |
| Network | IP allowlist both directions |
| Webhook integrity | HMAC-SHA256 signature over the raw body, shared secret, rotatable |
| Audit | Both sides log every call with `requestId`; retained ≥ 12 months |
| Credential rotation | Supported without downtime — two credentials valid during overlap |
| Environments | Separate **sandbox** with realistic synthetic data, and **production** |

## D.2 Privacy — NDPA and data minimisation

This is a lawful data-sharing arrangement between a revenue authority and its
own analytics platform, but it must still be minimal and documented.

- **FINDATA does not store plaintext TIN, NIN or BVN.** They are encrypted at
  rest (AES-256-GCM) with a keyed HMAC blind index for equality lookup. The
  Tax System may therefore send them, but FINDATA will never return them in
  plaintext to any downstream consumer.
- **BVN is optional and requested last.** Send it only if the authority lawfully
  holds it and its onward sharing is covered by the existing lawful basis. NIN
  alone is sufficient for a substantial match-rate improvement.
- **Employee-level PAYE data is deliberately not requested** (§C.5.2) —
  aggregates satisfy the detection need.
- **Purpose limitation:** data received under this interface is used solely for
  tax administration — detection, assessment, and enforcement — and for no other
  purpose.
- **Retention:** aligned to the authority's statutory retention schedule; FINDATA
  will honour deletion instructions for a taxpayer on request.
- A joint DPIA and a data-sharing agreement should be executed before production
  data flows. Sandbox may use synthetic data without one.

## D.3 Service expectations

| Item | Target |
|---|---|
| Availability | 99.5% monthly, excluding notified maintenance |
| Latency (single lookup) | p95 < 500 ms |
| Latency (collection page, 1000 records) | p95 < 3 s |
| Nightly sync window | Agreed window, ≥ 4 hours |
| Maintenance notice | 48 hours for planned windows |
| Breaking API change notice | 60 days, with sandbox available throughout |
| Support | Named technical contact each side; incident channel |
| Initial backfill depth | **6 years** of returns, payments and assessments (aligned to the statutory assessment/limitation window), plus the full current registry |
| Initial backfill window | Agreed one-off period with a raised rate limit, or a signed bulk export as a fallback |

## D.4 Operational contacts

| Role | Tax System | FINDATA |
|---|---|---|
| Technical owner | _TBC_ | _TBC_ |
| Data protection officer | _TBC_ | _TBC_ |
| Incident escalation | _TBC_ | _TBC_ |

---

# PART E — Acceptance checklist

For each endpoint, the Tax System team confirms:

- [ ] Reachable in **sandbox** with representative synthetic data
- [ ] OAuth token endpoint issues scoped tokens; scopes enforced
- [ ] Cursor pagination stable under concurrent writes
- [ ] `updatedSince` returns exactly the changed set — verified by a controlled
      edit test
- [ ] `updatedAt` changes on every field change, including status transitions
- [ ] Deletions and de-registrations surface as `deleted: true` or a status,
      never as silent absence
- [ ] Money serialised as decimal **strings**; no float rounding
- [ ] Error bodies match §B.7; 429 carries `Retry-After`
- [ ] `/sync/manifest` counts reconcile against a full pull (±0)
- [ ] Rate-limit headers present
- [ ] Idempotency honoured on §C.8 writes (replay returns the original response)
- [ ] Webhook HMAC verified end-to-end against a test secret
- [ ] Production credentials issued; IP allowlists applied both directions
- [ ] DPIA and data-sharing agreement executed
- [ ] Arrangements (§C.12) available as **structured** records, and queryable
      point-in-time immediately before a notice is issued
- [ ] Lifecycle events (§C.16) emitted for merges performed during the pilot
- [ ] TIN resolution (§C.18) returns a match for a known NIN, and a clean
      no-match for an unknown one
- [ ] A TIN issued to the MDA Revenue App resolves to the same taxpayer here

## E.1 Minimum viable interface

If only three things can be delivered first, deliver these — they are the
difference between a demo and a working detection system:

1. `GET /taxpayers` with delta sync, `tin` + `nin` + `legalForm` + `status`
2. `GET /returns` with `assessableIncome` per taxpayer-year
3. `GET /payments` with `taxType`, `period`, `amountPaid`, `status`

## E.2 Open questions for the Tax System team

**Identity and matching**
1. Does the Tax System hold **NIN** for individual taxpayers, and at what
   coverage? This single answer determines FINDATA's achievable match rate.
2. Does it hold **BVN**, and is onward sharing covered by existing consent?
3. Does it hold **taxpayer-declared bank accounts** (§C.15)?
4. How are duplicate taxpayer records reconciled today, and is there any record
   of past merges (§C.16)?

**Cross-system identity (§C.18)**
5. The MDA Revenue App stores a `tax_id` against its users, sourced from this
   system. What is its current **coverage** — what share of MDA users carry a
   resolved TIN?
6. `tax_id_source` distinguishes `existing` (found by NIN lookup) from `created`
   (registered on the spot). Are `created` TINs full registrations, or
   provisional records needing completion here?
7. Is the NIN→TIN resolution service rate-limited or throttled in a way that
   would constrain a bulk reconciliation run?

**Completeness**
8. Is the PAYE employer list **complete** enough to treat absence as
   "not registered" (§C.5.1)?
9. Are amended returns retained as distinct records, or overwritten in place?
10. Are payment **reversals** retained, or deleted?
11. Are **directors and beneficial owners** (§C.11) held, and are they sourced
    from CAC or self-declared?
12. Do **payment plans, waivers and amnesty** (§C.12) exist as structured
    records, or only as free-text notes on a case? If unstructured, FINDATA
    cannot suppress against them safely, and that needs saying now rather than
    after the first misdirected notice.
13. Are **WHT credit notes** (§C.13) issued and retained electronically?
14. Are **notice service events** (§C.14) recorded with timestamps and delivery
    status, or only the issue date?

**Operations**
15. Which system is the intended source of truth for **rate tables** — the
    Tax System (§C.7) or FINDATA's `StatutoryConfig`?
16. What is the sustainable **rate limit** and nightly sync window?
17. Does a sandbox environment exist today, or does one need to be provisioned?
18. Is a **6-year backfill** (§D.3) feasible over the API, or is a one-off signed
    bulk export preferable for the initial load?

---

## Appendix — dataset-to-module map

| Dataset | FINDATA module | Storage |
|---|---|---|
| Taxpayer registry | `identity`, `taxpayers`, `tax-net` | `Taxpayer` |
| Returns / declared income | `declared-income`, `scan` | `DeclaredIncome` |
| Payments | `tax-report`, `taxpayer360` | `TaxPayment` |
| Assessments / arrears | `cases`, `statutory` | `UnderdeclarationCase` (suppression + reconciliation) |
| PAYE employers | `paye`, `tax-net` | `Taxpayer.payeStatus`, `payeRegNumber` |
| Filing status | `tax-net` | Risk signals |
| Reference data | `statutory`, `scan` | `StatutoryConfig`, `SectorThreshold` |
| Case write-back | `cases`, `model-feedback` | `UnderdeclarationCase.status`, `recoveredAmount` |
| Collections summary | `analytics`, `metrics` | Reporting only |
| Events | all of the above | Triggers a targeted re-pull |
| Related parties | `agents` (matching, pattern) | `RiskSignal`, linked case view |
| Arrangements | `cases` | Case suppression / release |
| WHT credits | `tax-report`, `cases` | Corroborating evidence |
| Service records | `statutory` | `objectionDueAt`, `authorityResponseDueAt` |
| Declared bank accounts | `identity` | `DataRecord.accountIndex` match |
| Lifecycle events | `identity`, `taxpayers` | Taxpayer re-keying |
| FX rates | ingestion | Currency normalisation |

## Appendix — related documents

- **Document B** — [INTEGRATION-MDA-REVENUE-APP.md](INTEGRATION-MDA-REVENUE-APP.md),
  the MDA Revenue Application interface. §C.4 there is the counterpart to §C.18
  here.
- [INTEGRATION-OVERVIEW.md](INTEGRATION-OVERVIEW.md) — how the two documents fit
  together
- [INTEGRATION-PAYE.md](INTEGRATION-PAYE.md) — existing push contract, PAYE status
- [INTEGRATION-TAX-PAYMENTS.md](INTEGRATION-TAX-PAYMENTS.md) — existing push contract, payments
- [COMPLIANCE-MAPPING.md](COMPLIANCE-MAPPING.md) — statutory basis
- [LEGAL-BRIEF-PROVIDER-PENALTIES.md](LEGAL-BRIEF-PROVIDER-PENALTIES.md) — §101 penalties
