# MDA Revenue Application → BIZDATA — Data Interface Requirements

**Document B of two. What BIZDATA needs the MDA Revenue Application to expose,
and why.**

| | |
|---|---|
| Document type | Interface requirements (counterparty-facing) |
| Counterparty | **MDA Revenue Application** — non-tax revenue: permits, project fees, licences, inspections, market administration |
| Direction | **Pull** — BIZDATA calls the MDA application on a schedule |
| Status | Draft for review by the MDA Revenue Application team |
| Version | 1.0 |
| Audience | Part A: revenue authority management. Part B–E: engineering. |

> **Two-document set.** The authority's revenue data lives in **two separate
> systems**, so these requirements are split into two counterparty documents.
> This is **Document B — the MDA Revenue Application**. Its companion is
> **Document A — the Tax Administration System** (taxpayer registry, returns,
> assessments, tax payments, PAYE), addressed to a different team.
>
> The two are joined by the taxpayer's **TIN**, which this application already
> stores against its users as `tax_id`. The integrity and *coverage* of that
> link is a shared obligation — see §C.4, which corresponds to §C.18 of
> Document A.

---

## How to read this document

**Part A** is written for non-engineers: what each dataset is, which BIZDATA
capability depends on it, and what breaks if we don't get it. No JSON.

**Parts B–E** are the engineering contract: transport conventions, endpoint
specifications, security, and an acceptance checklist.

*"The MDA Revenue Application"* means the system that administers non-tax
revenue — development permits, project fees, licences, signage, inspections,
market units and enumeration. *"The Tax System"* means the separate tax
administration platform covered by Document A. *"BIZDATA"* is the §29
data-matching and underdeclaration-detection platform described in
[README.md](../README.md).

---

# PART A — The business case, dataset by dataset

## A.0 Why a tax-detection platform wants non-tax revenue data

BIZDATA detects under-declaration by comparing **money observed moving** against
**income declared to the authority**. Its primary evidence is transaction data
that banks, fintechs and telcos submit under NTAA 2025 §29.

That evidence has two structural blind spots, and this application happens to
hold the cure for both.

**Blind spot 1 — the informal economy.** §29 reporting thresholds are ₦50m per
month for individuals and ₦250m for corporates. A market trader turning over
₦2.8m a month never crosses them, never files a return, and frequently has no
meaningful banking footprint. To BIZDATA that person is invisible. Your
**market enumeration** data is the only route in — it records them by name, NIN,
business, estimated revenue and GPS location, gathered by the authority's own
field officers.

**Blind spot 2 — declared income is self-reported.** BIZDATA compares observed
inflow against what the taxpayer *says* they earned. Your **permit, project and
fee** data is different in kind: it is what a person actually *spent*, assessed
and verified by the authority itself. Someone paying ₦3.6m in fees on a ₦120m
development while declaring ₦4m of income has made the case against themselves —
and because the authority assessed that project, the figure is very hard to
dispute on objection.

Neither dataset requires a bank, a §29 obligation, or a new consent basis. The
authority already owns both, and already paid to collect them.

## A.1 The nine datasets

### Tier 1 — The core contribution

**1. Invoices — bills raised for non-tax revenue.**
Permits, licences, premises registration, signage, inspection and certificate
fees, paid or unpaid, with the identity of the payer.

*Why:* spending is an income signal, and this is spending the authority observed
and verified itself. It is also the cheapest possible cross-check before a
demand notice is served.
*Without it:* BIZDATA ignores a class of high-confidence leads the authority
already possesses.

**2. Projects and permits — the underlying activity and its declared value.**
What was permitted, where, and what it was declared to be worth.

*Why:* `declaredValue` is a direct wealth and expenditure signal against a
taxpayer-year. A project value that dwarfs declared income raises a risk signal
and materially increases case confidence.
*Without it:* an invoice tells BIZDATA a fee was paid but not the scale of the
activity behind it — ₦3.6m of fees could be one tower or forty signposts.

**3. Market and informal-sector enumeration.**
Enumerated market units and their occupants: name, NIN, phone, business name and
category, registration status, employee count, estimated monthly revenue, fee
band, arrears and GPS location.

*Why:* the only route into the informal sector, as set out above. `occupantNin`
makes those traders matchable; `estimatedMonthlyRevenue` gives an income proxy
where no return exists; `employeesCount` produces PAYE-gap leads.
*Without it:* BIZDATA's Tax Net only ever sees people already inside the banking
system — the population *least* likely to be outside the tax net.

### Tier 2 — Making the contribution usable

**4. Payer identity and TIN linkage.**
The `tax_id` this application already holds against its users, its source, and
the underlying NIN/RC identifier.

*Why:* datasets 1–3 are worthless to BIZDATA until each record can be attached
to a **taxpayer**. The TIN is the only key shared with the Tax System. This
application already resolves and stores it — what is needed is that it be
exposed, and that its coverage be measured honestly.
*Without it:* permits, project values and enumeration records float free, and
this entire integration delivers a fraction of its value. **This is the single
highest-risk item in this document.**

**5. Certificates, permits held and inspection outcomes.**
Business permits, fire and health certificates, inspection results and site
assessments.

*Why:* two uses. A business trading **without** a required permit is an
enforcement lead in its own right. And an inspection record independently
corroborates that a business is operating at the scale claimed — useful when a
taxpayer objects that an enumerated estimate was too high.
*Without it:* BIZDATA cannot corroborate scale, and non-permitted trading goes
unflagged.

**6. Fee arrears and payment arrangements.**
Outstanding fee balances, instalment plans and waivers on the non-tax side.

*Why:* arrears sharpen prioritisation — a trader months behind on fees *and*
under-declaring is a different priority from one who is merely behind. Approved
arrangements must also suppress enforcement, exactly as on the tax side.
*Without it:* mis-prioritisation, and demands served on people already on an
approved plan.

### Tier 3 — Accuracy, operations and reconciliation

**7. Reference data.**
Fee matrices and categories, department/MDA codes, revenue heads, LGA and ward
codes, market and unit registers, project types.

*Why:* lets BIZDATA infer project scale from a fee paid, route cases to the right
office, and align ward codes with the Tax System's.
*Without it:* codes must be mapped by hand in two places and drift silently.

**8. Collections and ledger summary.**
Period totals by revenue head, department and LGA.

*Why:* reconciliation — proving BIZDATA's view agrees with your books — and
executive dashboards management will trust.
*Without it:* no independent check that the sync is complete.

**9. Change events (webhooks).**
Notifications when an invoice is paid, a project is approved, or an enumeration
is completed.

*Why:* keeps the worklist current between scheduled pulls.
*Without it:* the system works, just a sync cycle behind.

## A.2 Priority and sequencing

| Phase | Datasets | Outcome unlocked |
|---|---|---|
| **0** | **4 (coverage measurement only)** | Tells everyone whether this integration is a major workstream or a marginal one |
| **1** | 4, 1, 2 | Permit and project spending attaches to real taxpayers |
| **2** | 3 | Informal-sector coverage — the Tax Net becomes a coverage instrument |
| **3** | 5, 6, 7 | Corroboration, prioritisation, correct routing |
| **4** | 8, 9 | Reconciliation and live data |

**Phase 0 is not a formality.** Before any endpoint is built, one number needs
measuring: *what share of users in this application carry a resolved `tax_id`?*
If it is high, datasets 1–3 are among the most valuable inputs BIZDATA will ever
receive. If it is low, a back-resolution campaign has to be scheduled first, and
everyone should know that before committing engineering effort. See §C.4.

## A.3 What this application gets back

- Taxpayers identified as trading without a required permit or business
  registration, from BIZDATA's cross-match — a direct non-tax revenue lead.
- Enumerated occupants matched to registered taxpayers, so fee assessment can be
  aligned with declared scale.
- Reconciliation between enumerated estimated revenue and observed banking
  inflow, which improves fee-band accuracy.
- A feedback signal on enumeration quality: where estimates diverge wildly from
  observed inflow, that is a training input for enumerators.

---

# PART B — Transport conventions

## B.1 Model: BIZDATA pulls

BIZDATA calls this application on a schedule. It controls freshness, can backfill
and re-sync after a bad run, and owns its own retry logic. This application's
obligation is to expose the data and keep it correct. **Events (§C.9) are the one
exception** — those are push by nature.

## B.2 Base URL and versioning

```
https://{mda-revenue-app-host}/api/partner/v1
```

Major version in the path. Breaking changes need a new major version and 60
days' notice; additive fields are not breaking. BIZDATA ignores unknown fields.

## B.3 Authentication

**Preferred — OAuth 2.0 client credentials:**

```http
POST /api/partner/v1/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id=...&client_secret=...&scope=invoices.read projects.read enumerations.read
```

Subsequent calls send `Authorization: Bearer <token>`. **Acceptable fallback:**
a rotatable static `x-api-key` header. This application already uses Laravel
Sanctum for its mobile enumeration API; a dedicated machine client with its own
scopes and its own rate limit is preferred over reusing that path.

Required either way: TLS 1.2+, IP allowlisting of BIZDATA's egress addresses,
per-dataset scopes (`invoices.read`, `projects.read`, `enumerations.read`,
`identity.read`, `reference.read`).

## B.4 Pagination

Cursor-based; offset pagination is not acceptable for datasets that change
during a sync.

```
GET /invoices?limit=500&cursor=eyJpZCI6MTIzNDV9
```

```jsonc
{ "data": [ /* … */ ], "meta": { "count": 500, "nextCursor": "eyJpZCI6MTI4NDV9", "hasMore": true } }
```

Default `limit` 100, maximum 1000. The cursor must be stable — a record inserted
mid-sync must not cause another to be skipped.

## B.5 Delta sync

Every collection endpoint supports `updatedSince` (ISO-8601 UTC, strictly
greater) and optionally `updatedUntil`. Every record carries an `updatedAt` that
changes on **any** field change, including soft deletes. Sort by
`(updatedAt, id)` ascending.

**Deletions and cancellations must be represented** as `"deleted": true` or a
status transition — never by silent absence.

| Dataset | Cadence |
|---|---|
| Invoices | Nightly delta |
| Projects / permits | Nightly delta |
| Enumerations | Weekly delta — enumeration campaigns are episodic |
| Identity / TIN linkage | Nightly delta |
| Certificates, inspections | Weekly delta |
| Fee arrears, arrangements | Nightly delta |
| Reference data | Daily, and on `reference.updated` |
| Collections summary | Daily |

## B.6 Errors

```jsonc
{ "error": { "code": "INVOICE_NOT_FOUND", "message": "…", "details": {}, "requestId": "req_01HX…" } }
```

| Status | When | BIZDATA's behaviour |
|---|---|---|
| 400 | Malformed request | Log, alert, no retry |
| 401 / 403 | Bad or unscoped credential | Alert operations |
| 404 | Unknown single resource | Record as unmatched, continue |
| 422 | Valid shape, invalid values | Log per-record, continue batch |
| 429 | Rate limited | Honour `Retry-After`, exponential backoff |
| 5xx | Server error | Retry ×5 with backoff, then alert |

A partial page must never return 200.

## B.7 Rate limits

Publish the ceiling in response headers (`X-RateLimit-Limit`,
`X-RateLimit-Remaining`, `X-RateLimit-Reset`, and `Retry-After` on 429).
Requested minimum **300 requests/minute** during the nightly window.

## B.8 Data types

| Type | Format |
|---|---|
| Timestamps | ISO-8601 UTC — `2026-07-23T04:30:00Z` |
| Dates | `YYYY-MM-DD` |
| Money | **String** decimal — `"3600000.00"`. Never a float. |
| Currency | ISO-4217, default `NGN` |
| Coordinates | Decimal degrees, WGS-84 |
| Enums | UPPER_SNAKE_CASE; unknown values must not break the consumer |

## B.9 Health and reconciliation

```
GET /health            → { "status": "ok", "time": "…" }
GET /sync/manifest     → per-dataset record counts and max(updatedAt)
```

`/sync/manifest` is how BIZDATA proves a sync was complete.

---

# PART C — Endpoint specifications

---

## C.1 Invoices — `GET /invoices`

> **Tier 1.** Feeds `taxpayer360`, `agents` (behavioural, predictive), case
> corroboration.

```
GET /invoices?updatedSince=2026-07-22T00:00:00Z&status=PAID&limit=1000&cursor=…
```

```jsonc
{
  "id": "INV-2026-0044821",
  "code": "KN/DEV/2026/04482",
  // ── payer identity (see §C.4) ──
  "userId": "USR-004471",
  "taxId": "01234567-0001",                // users.tax_id — the join to the Tax System
  "taxIdSource": "existing",               // existing | created | null
  "payerName": "Amina O Yusuf",
  "payerNin": "12345678901",               // users.identity_number, decrypted or blind-indexed
  "payerRcNumber": null,
  "payerPhone": "+2348030000000",
  // ── the bill ──
  "departmentCode": "KN-PHYSICAL-PLANNING",
  "revenueHead": "12030014",
  "feeCategory": "BUILDING_PERMIT",
  "billableType": "PROJECT",               // PROJECT | PREMISES | MARKET_UNIT | LICENCE | INSPECTION | OTHER
  "billableId": "PRJ-2026-0912",
  "amount": "3600000.00",
  "amountPaid": "3600000.00",
  "status": "PAID",                        // DRAFT | ISSUED | PART_PAID | PAID | CANCELLED | WRITTEN_OFF
  "billingPeriodType": "ONE_OFF",          // ONE_OFF | MONTHLY | QUARTERLY | ANNUAL
  "periodLabel": "2026",
  "periodStart": "2026-01-01",
  "periodEnd": "2026-12-31",
  "issuedAt": "2026-03-04T00:00:00Z",
  "dueDate": "2026-04-03",
  "deleted": false,
  "updatedAt": "2026-03-19T11:40:00Z"
}
```

**`payerNin` and `taxId` are the critical fields.** Many payments are made by
people not yet linked to any taxpayer record — those are exactly the leads
BIZDATA is looking for. **Please send the identifiers even where `taxId` is
null**; an unmatched payer with a NIN is a Tax Net lead, an unmatched payer
without one is nothing.

### `GET /payments`

Receipts against invoices. BIZDATA needs the confirmed-payment event, not just
the bill, because an issued-and-unpaid invoice is a weaker signal than a settled
one.

```jsonc
{
  "id": "PMT-2026-0099812",
  "code": "RCPT/2026/09981",
  "invoiceId": "INV-2026-0044821",
  "amount": "3600000.00",
  "paymentMethod": "REMITA",
  "reference": "RMT-88231",
  "receiptNumber": "RCPT-88231",
  "status": "CONFIRMED",                   // PENDING | CONFIRMED | REJECTED | REVERSED
  "journalEntryId": "JE-2026-114422",
  "paidAt": "2026-03-19T10:02:00Z",
  "deleted": false,
  "updatedAt": "2026-03-19T11:40:00Z"
}
```

Reversals and rejections must be emitted with a status, never deleted — a
silently-vanished payment leaves BIZDATA holding a false spending signal.

---

## C.2 Projects and permits — `GET /projects`

> **Tier 1.** Feeds `taxpayer360`, `agents`, `RiskSignal`.

```jsonc
{
  "id": "PRJ-2026-0912",
  "code": "KN/PP/2026/0912",
  "userId": "USR-004471",
  "taxId": "01234567-0001",
  "applicantName": "Amina O Yusuf",
  "applicantNin": "12345678901",
  "applicantRcNumber": null,
  "projectType": "RESIDENTIAL_DEVELOPMENT",
  "projectCategory": "NEW_BUILD",
  "declaredValue": "120000000.00",         // ← the wealth / expenditure signal
  "description": "4-storey residential block, Nassarawa GRA",
  "lgaCode": "KN-NAS",
  "wardCode": "KN-NAS-02",
  "address": "Plot 44, Nassarawa GRA",
  "gpsLatitude": 11.99841,
  "gpsLongitude": 8.52210,
  "status": "APPROVED",                    // SUBMITTED | UNDER_REVIEW | APPROVED | REJECTED | COMPLETED | ABANDONED
  "currentStage": "FINAL_APPROVAL",
  "totalFeesAssessed": "3600000.00",
  "totalFeesPaid": "3600000.00",
  "certificateIssued": true,
  "submittedAt": "2026-02-11T00:00:00Z",
  "approvedAt": "2026-03-19T00:00:00Z",
  "deleted": false,
  "updatedAt": "2026-03-19T11:40:00Z"
}
```

### How BIZDATA uses `declaredValue`

It becomes an expenditure signal on the taxpayer-year. Where it materially
exceeds declared assessable income, BIZDATA raises a `RiskSignal` and increases
case confidence. Because the authority itself assessed and approved the project,
the figure is unusually defensible on objection.

**Where `declaredValue` is absent or nominal**, BIZDATA will fall back to
inferring scale from `totalFeesAssessed` against the published fee matrix
(§C.7) — which is why that reference data matters. Please say if `declaredValue`
is unreliable in practice, rather than letting BIZDATA discover it from the
distribution.

---

## C.3 Market and informal-sector enumeration

> **Tier 1.** Feeds `tax-net`, taxpayer lead creation, and `declared-income`
> proxying. The only route BIZDATA has into the informal economy.

### `GET /markets` and `GET /markets/{id}/units`

Register of markets, their units, occupancy state and fee bands. Small, slow-
moving, needed to interpret enumeration records.

### `GET /enumerations`

```jsonc
{
  "id": "ENU-2026-118422",
  "enumerationCode": "KN/MKT/SBK/2026/1184",
  "marketId": "MKT-SBK",
  "marketName": "Sabon Gari Market",
  "unitId": "UNT-SBK-B-114",
  "unitNumber": "B-114",
  "lgaCode": "KN-MUN",
  "wardCode": "KN-MUN-04",
  "enumerationDate": "2026-05-14",
  "enumerationType": "FULL",
  "status": "COMPLETED",
  "occupancyType": "OWNER_OCCUPIED",       // OWNER_OCCUPIED | TENANT | VACANT | SUBLET
  // ── occupant ──
  "occupantName": "Musa Ibrahim",
  "occupantNin": "23456789012",            // ← the match key that makes this dataset usable
  "occupantPhone": "+2348060000000",
  "occupantEmail": null,
  "occupantAddress": "…",
  "taxIdentificationNumber": null,         // where the enumerator captured a TIN
  "ownerName": "Sabon Gari Traders Coop",
  // ── business ──
  "businessName": "Musa Electronics",
  "businessCategory": "ELECTRONICS_RETAIL",
  "businessDescription": "Retail of consumer electronics and accessories",
  "businessRegistrationStatus": "UNREGISTERED",  // REGISTERED | UNREGISTERED | UNKNOWN
  "businessRegistrationNumber": null,
  "businessStartDate": "2018-03-01",
  "employeesCount": 4,
  "estimatedMonthlyRevenue": "2800000.00", // ← income proxy where no return exists
  // ── fees / compliance ──
  "currentMonthlyFee": "12000.00",
  "proposedMonthlyFee": "18000.00",
  "paymentCapacity": "MEDIUM",
  "monthsBehindPayment": 7,
  "complianceScore": 42,
  "taxCompliance": "NON_COMPLIANT",
  "hasBusinessPermit": false,
  "hasFireCertificate": false,
  "hasHealthCertificate": true,
  // ── location ──
  "gpsLatitude": 12.00123,
  "gpsLongitude": 8.51234,
  "gpsAccuracy": 6.5,
  "deleted": false,
  "updatedAt": "2026-05-14T16:02:00Z"
}
```

### Why each field earns its place

| Field | Use in BIZDATA |
|---|---|
| `occupantNin` | Matches the trader to a taxpayer — or proves there isn't one |
| `taxIdentificationNumber` | Direct join where the enumerator captured it |
| `businessName`, `businessCategory` | Sector classification; fuzzy-match fallback |
| `businessRegistrationStatus` | Direct Tax Net input: enumerated, trading, **unregistered** |
| `estimatedMonthlyRevenue` | Declared-income proxy where no return exists |
| `employeesCount` | PAYE-gap lead: 4+ employees and no employer registration |
| `monthsBehindPayment`, `complianceScore` | Risk scoring and prioritisation |
| `hasBusinessPermit` and friends | Non-permitted trading is its own enforcement lead |
| `gpsLatitude` / `gpsLongitude` | Field enforcement can actually find the unit |
| `businessStartDate` | How many years of exposure the non-registration represents |

### Caveats BIZDATA will apply

Stated here so expectations are shared: `estimatedMonthlyRevenue` is an
enumerator's field estimate, not an audited figure. BIZDATA will use it to
**rank and prioritise**, and will label any case built on it `INDICATIVE` rather
than treating it as a declared-income comparison. **It is not a lawful basis for
a best-of-judgement assessment on its own.** Its value is identifying the right
doors to knock on, at a scale field officers could never cover unaided.

---

## C.4 Payer identity and TIN linkage — shared obligation

> **Tier 2. This section corresponds to §C.18 of Document A** and neither system
> can satisfy it alone. **It is the highest-risk item in this document.**

### The problem

The authority administers revenue through two systems. A single person may be:

| | In the Tax System | In this application |
|---|---|---|
| Known as | Taxpayer `TP-000184221`, TIN `01234567-0001` | User `USR-004471`, `tax_id` `01234567-0001` |
| Recorded activity | Filed ₦16.2m assessable income for 2026 | Paid ₦3.6m in fees on a ₦120m development |

Those two facts only become a case when BIZDATA knows they are the same person.

### What already exists

This application stores `tax_id` and `tax_id_source` against its users,
populated by calling the Tax System — `existing` where a NIN lookup found a TIN,
`created` where one was registered on the spot. `identity_number` holds the
encrypted NIN/RC/BN. **The mechanism works.** Three things are needed:

### C.4.1 `GET /users` — the identity spine

```jsonc
{
  "id": "USR-004471",
  "name": "Amina O Yusuf",
  "email": "amina.yusuf@example.com",
  "phone": "+2348030000000",
  "identityType": "NIN",                   // NIN | RC | BN
  "identityNumber": "12345678901",         // see decryption note below
  "taxId": "01234567-0001",
  "taxIdSource": "existing",               // existing | created | null
  "taxIdResolvedAt": "2026-01-27T00:00:00Z",
  "entityName": null,
  "orgType": "INDIVIDUAL",
  "address": "12 Ahmadu Bello Way",
  "lgaCode": "KN-MUN",
  "deleted": false,
  "updatedAt": "2026-01-27T09:14:03Z"
}
```

**On `identityNumber`:** it is encrypted at rest in this application. BIZDATA
also never stores plaintext NIN — it holds a keyed HMAC blind index. Two
acceptable options, in order of preference:

1. **Decrypt in the API layer** and return plaintext over the authenticated TLS
   channel. BIZDATA immediately converts to a blind index and discards the
   plaintext.
2. **Agree a shared HMAC key** and return `identityIndex` — the blind index —
   instead. No plaintext ever crosses the wire. Requires a one-off key exchange
   and is the stronger option if the DPO prefers it.

What does **not** work is returning the ciphertext: BIZDATA cannot match on it,
and the dataset becomes unusable.

### C.4.2 `GET /identity/coverage` — the number that decides everything

```jsonc
{
  "generatedAt": "2026-07-23T04:30:00Z",
  "totalUsers": 184220,
  "withTaxId": 41180,
  "withTaxIdPercent": "22.35",
  "bySource": { "existing": 28400, "created": 12780 },
  "withIdentityNumber": 151002,
  "withIdentityNumberPercent": "81.97",
  "byOrgType": [
    { "orgType": "INDIVIDUAL", "total": 160440, "withTaxId": 30110 },
    { "orgType": "CORPORATE",  "total": 23780,  "withTaxId": 11070 }
  ]
}
```

**This endpoint is Phase 0** and can be built before anything else here. BIZDATA's
ability to use datasets 1–3 is capped by `tax_id` coverage. At the illustrative
22% above, roughly four out of five permit and enumeration records could not be
attached to a taxpayer — which would make a back-resolution campaign a
prerequisite rather than an afterthought.

The number is not currently known to either team. **Measuring it is the single
most useful thing that can be done before build starts.**

### C.4.3 Back-resolution

Where `identityNumber` is present but `taxId` is null, this application can
already resolve it against the Tax System's NIN→TIN service (Document A §C.18.1).
Running that as a **batch back-fill** — rather than only opportunistically at
project-creation time, as happens today — would lift coverage across the whole
user base in one exercise.

BIZDATA does not need to perform this itself and would prefer not to: the
lookup is this application's existing integration, and doing it here keeps one
authoritative `tax_id` per user rather than a second opinion held elsewhere.

### Requirements summary

| Requirement | Owner |
|---|---|
| Expose `tax_id`, `tax_id_source`, and NIN as plaintext-or-blind-index | This application |
| Publish `tax_id` **coverage** (§C.4.2) | This application |
| Run a back-resolution batch for users with NIN but no TIN | This application |
| Expose NIN→TIN resolution as a supported, rate-appropriate API | Tax System |
| Return an explicit no-match rather than an error for unknown NINs | Tax System |
| Re-resolve TINs affected by a merge or re-issue | Both |

---

## C.5 Certificates, permits held and inspections

> **Tier 2.** Feeds enforcement leads and case corroboration.

### `GET /certificates`

```jsonc
{
  "id": "CERT-2026-0421",
  "certificateNumber": "KN/BP/2026/0421",
  "userId": "USR-004471",
  "taxId": "01234567-0001",
  "type": "BUSINESS_PERMIT",               // BUSINESS_PERMIT | FIRE | HEALTH | BUILDING_APPROVAL | OCCUPANCY | SIGNAGE
  "subjectType": "PREMISES",
  "subjectId": "PRM-0091",
  "status": "ACTIVE",                      // ACTIVE | EXPIRED | REVOKED | SUSPENDED
  "issuedAt": "2026-04-02",
  "expiresAt": "2027-04-01",
  "deleted": false,
  "updatedAt": "2026-04-02T00:00:00Z"
}
```

### `GET /inspections`

```jsonc
{
  "id": "INS-2026-1180",
  "subjectType": "PROJECT",                // PROJECT | PREMISES | MARKET_UNIT
  "subjectId": "PRJ-2026-0912",
  "userId": "USR-004471",
  "inspectionType": "SITE_ASSESSMENT",
  "outcome": "COMPLIANT",                  // COMPLIANT | NON_COMPLIANT | PARTIAL | ABANDONED
  "findings": "Structure at 3rd floor level; 14 workers on site",
  "observedScale": { "floors": 3, "workersOnSite": 14 },
  "inspectedAt": "2026-06-11T00:00:00Z",
  "inspectorId": "OFF-0212",
  "deleted": false,
  "updatedAt": "2026-06-11T14:00:00Z"
}
```

Two uses: a business trading **without** a required certificate is a non-tax
enforcement lead, and an inspection independently corroborates operating scale —
which is exactly the evidence needed when a taxpayer objects that an enumerated
estimate was inflated.

---

## C.6 Fee arrears and arrangements — `GET /arrangements`

> **Tier 2.** Feeds prioritisation and case suppression.

```jsonc
{
  "id": "ARR-2026-0331",
  "userId": "USR-004471",
  "taxId": "01234567-0001",
  "subjectType": "MARKET_UNIT",
  "subjectId": "UNT-SBK-B-114",
  "type": "PAYMENT_PLAN",                  // PAYMENT_PLAN | WAIVER | AMNESTY | WRITE_OFF | LEGAL_HOLD
  "status": "ACTIVE",                      // ACTIVE | COMPLETED | DEFAULTED | CANCELLED | EXPIRED
  "totalAmount": "84000.00",
  "amountPaidToDate": "28000.00",
  "outstandingBalance": "56000.00",
  "monthsBehind": 7,
  "inGoodStanding": true,
  "startsAt": "2026-04-01",
  "endsAt": "2026-12-31",
  "updatedAt": "2026-07-02T00:00:00Z"
}
```

BIZDATA suppresses enforcement against a subject on an active arrangement in
good standing, releases and escalates on `DEFAULTED`, and excludes `WRITE_OFF`
from recovery estimates so forecasts stay honest.

---

## C.7 Reference data — `GET /reference/*`

> **Tier 3.** Small, cacheable, slow-changing. All return
> `{ data: [...], meta: { version, updatedAt } }`.

| Endpoint | Contents | Why BIZDATA needs it |
|---|---|---|
| `GET /reference/fee-matrices` | Fee schedules by category, user type and band | Infers project scale from a fee paid where `declaredValue` is missing |
| `GET /reference/fee-categories` | Category codes and names | Classifies the nature of spending |
| `GET /reference/departments` | MDA / department codes | Case routing; owner of each revenue head |
| `GET /reference/revenue-heads` | Chart-of-accounts codes | Reconciliation against §C.8 |
| `GET /reference/lgas` | LGA **and ward** codes | Routing; **must align with the Tax System's codes** |
| `GET /reference/project-types` | Project type and category taxonomy | Sector inference |
| `GET /reference/markets` | Market and unit register | Interprets enumeration records |

**On LGA and ward codes:** if this application and the Tax System use different
code sets, say so explicitly. BIZDATA will need a crosswalk, and discovering the
mismatch during reconciliation is far more expensive than being told now.

---

## C.8 Collections and ledger summary — `GET /collections/summary`

> **Tier 3.** Feeds `analytics`, `metrics`, sync reconciliation.

```
GET /collections/summary?from=2026-01-01&to=2026-06-30&groupBy=revenueHead,lga
```

```jsonc
{
  "period": { "from": "2026-01-01", "to": "2026-06-30" },
  "currency": "NGN",
  "totals": { "invoiced": "4200000000.00", "collected": "3110000000.00", "outstanding": "1090000000.00" },
  "groups": [
    { "revenueHead": "12030014", "departmentCode": "KN-PHYSICAL-PLANNING", "lgaCode": "KN-MUN",
      "invoiced": "820000000.00", "collected": "690000000.00", "payerCount": 412 }
  ],
  "generatedAt": "2026-07-23T04:30:00Z"
}
```

Aggregate only, no personal data. This is what proves the detail sync agrees
with your ledger.

---

## C.9 Change events (webhooks)

> **Tier 3.** Optional but recommended. The one push component.

```http
POST https://findata.example.gov.ng/api/integration/events
x-api-key: <BIZDATA-issued key>
X-Signature: sha256=<HMAC-SHA256 of the raw body>
X-Event-Id: evt_01HX…
```

```jsonc
{ "eventId": "evt_01HX…", "type": "invoice.paid", "occurredAt": "2026-03-19T11:40:00Z",
  "data": { "id": "INV-2026-0044821", "userId": "USR-004471" } }
```

| Event type | Meaning |
|---|---|
| `invoice.issued` / `invoice.paid` / `invoice.cancelled` | Billing lifecycle |
| `payment.confirmed` / `payment.reversed` | Money in, or reversed |
| `project.approved` / `project.completed` | New expenditure signal |
| `enumeration.completed` | New informal-sector record |
| `certificate.issued` / `certificate.expired` | Permit status change |
| `user.taxid.resolved` | A user gained a `tax_id` — re-link their history |
| `reference.updated` | Fee matrices or codes changed — re-pull §C.7 |

**Events are hints, not payloads of record.** Each carries only identifiers;
BIZDATA re-fetches the authoritative record. That makes at-least-once delivery,
duplicates and out-of-order arrival harmless. Retry ×5 with backoff on non-2xx;
BIZDATA de-duplicates on `eventId`.

`user.taxid.resolved` matters more than it looks: when a user finally gains a
TIN, their *entire* invoice and project history becomes attributable at once.

---

# PART D — Security, privacy and operations

## D.1 Security requirements

| Control | Requirement |
|---|---|
| Transport | TLS 1.2+, valid CA-issued certificate |
| Authentication | OAuth 2.0 client credentials preferred; rotatable API key acceptable |
| Authorisation | Per-dataset scopes; BIZDATA is read-only throughout this document |
| Network | IP allowlist both directions |
| Webhook integrity | HMAC-SHA256 over the raw body, rotatable shared secret |
| Audit | Both sides log every call with `requestId`; retained ≥ 12 months |
| Environments | Separate **sandbox** with synthetic data, and **production** |

## D.2 Privacy — NDPA and data minimisation

**Enumeration data (§C.3) carries a heavier privacy load than anything else in
either document**, and should be treated accordingly. It names individual
informal traders, with NIN, phone number and GPS coordinates. Most are not yet
taxpayers, and none supplied the data to a tax authority — they supplied it to a
market administrator.

Required handling:

- Covered **explicitly** in the DPIA, as a distinct processing activity with its
  own lawful basis — not folded into "revenue data" generally.
- Used only to establish tax liability and register taxable persons.
- Held in BIZDATA under the same JIT-elevation controls applied to BVN: GPS
  coordinates and phone numbers are visible to field-enforcement roles only, not
  to general analyst accounts.
- **If the lawful basis for enumeration does not extend to tax administration,
  this dataset should be withheld and §C.3 struck from the agreement.** That is
  a legal determination, not an engineering one, and it should be made before
  any build work starts rather than after.

Also:

- **Invoice, project and certificate data (§C.1, §C.2, §C.5)** is repurposed from
  permit administration to tax administration. It remains within "revenue
  administration" as a purpose, but the DPIA should record the change of use.
- **BIZDATA stores no plaintext NIN, TIN or BVN** — all are encrypted at rest
  (AES-256-GCM) with a keyed HMAC blind index for equality matching. See §C.4.1.
- **Purpose limitation:** data received under this interface is used solely for
  tax and revenue administration.
- A joint DPIA and data-sharing agreement should be executed before production
  data flows. Sandbox may use synthetic data without one.

## D.3 Service expectations

| Item | Target |
|---|---|
| Availability | 99.5% monthly, excluding notified maintenance |
| Latency (single lookup) | p95 < 500 ms |
| Latency (collection page, 1000 records) | p95 < 3 s |
| Nightly sync window | Agreed window, ≥ 4 hours |
| Maintenance notice | 48 hours for planned windows |
| Breaking API change notice | 60 days, sandbox available throughout |
| Initial backfill depth | **6 years** of invoices, payments and projects; **all** enumeration records regardless of age |
| Support | Named technical contact each side; incident channel |

Enumeration is exempted from the 6-year limit deliberately: an enumeration from
2021 still evidences that a business existed and was trading then, which is
directly relevant to how many years of non-registration are in scope.

## D.4 Operational contacts

| Role | MDA Revenue Application | BIZDATA |
|---|---|---|
| Technical owner | _TBC_ | _TBC_ |
| Data protection officer | _TBC_ | _TBC_ |
| Incident escalation | _TBC_ | _TBC_ |

---

# PART E — Acceptance checklist

- [ ] Reachable in **sandbox** with representative synthetic data
- [ ] OAuth token endpoint issues scoped tokens; scopes enforced
- [ ] Cursor pagination stable under concurrent writes
- [ ] `updatedSince` returns exactly the changed set — verified by a controlled
      edit test
- [ ] `updatedAt` changes on every field change, including status transitions
- [ ] Cancellations and reversals surface as status changes, never silent absence
- [ ] Money serialised as decimal **strings**; no float rounding
- [ ] `identityNumber` returned as plaintext or agreed blind index — **not
      ciphertext** (§C.4.1)
- [ ] `GET /identity/coverage` live, and its result circulated to both teams
- [ ] Invoices and projects carry `payerNin` / `taxId` **even where `taxId` is
      null**
- [ ] Enumeration records carry `occupantNin` at usable coverage
- [ ] LGA and ward codes confirmed to match the Tax System's, or a crosswalk
      supplied
- [ ] Error bodies match §B.6; 429 carries `Retry-After`
- [ ] `/sync/manifest` counts reconcile against a full pull (±0)
- [ ] Webhook HMAC verified end-to-end against a test secret
- [ ] Production credentials issued; IP allowlists applied both directions
- [ ] DPIA and data-sharing agreement executed, **covering §C.3 enumeration data
      explicitly**

## E.1 Minimum viable interface

If only three things can be delivered first:

1. `GET /identity/coverage` (§C.4.2) — because it determines whether the rest is
   worth building in this order
2. `GET /users` with `taxId`, `taxIdSource` and a matchable `identityNumber`
3. `GET /invoices` and `GET /projects` with `declaredValue` and payer identifiers

Enumeration (§C.3) is higher-value than 3 but gated on the DPIA question in
§D.2 — start that legal review in parallel, not after.

## E.2 Open questions for the MDA Revenue Application team

**Identity — the critical path**
1. What is the current `tax_id` coverage across users (§C.4.2)? Best estimate
   now, measured number later.
2. Can `identity_number` be decrypted in the API layer, or is a shared blind-
   index key preferred (§C.4.1)?
3. Is `tax_id` resolved only at project-creation time, or on registration too?
4. Is a batch back-resolution run feasible against the Tax System's NIN→TIN
   service (§C.4.3)?

**Enumeration**
5. Is market enumeration **live in production**, and what is its coverage — how
   many markets, units and completed enumerations?
6. Does the enumeration lawful basis extend to tax administration (§D.2)? This
   gates the whole dataset.
7. How reliable is `estimated_monthly_revenue` in practice — is it a considered
   estimate or frequently left at a default?
8. Is `occupant_nin` captured consistently, or often blank?

**Non-tax revenue**
9. Is `declaredValue` on projects reliable, or nominal in many cases?
10. Are invoices ever raised against payers with **no** user record, and if so
    what identifiers exist on them?
11. Are payment reversals retained, or deleted?

**Alignment and operations**
12. Do LGA and ward codes match the Tax System's, or is a crosswalk needed?
13. What is the sustainable rate limit and nightly sync window?
14. Does a sandbox environment exist today?
15. Is the existing Sanctum API a suitable base for a machine client, or should a
    separate partner API be stood up?

---

## Appendix — dataset-to-module map

| Dataset | BIZDATA module | Storage / effect |
|---|---|---|
| Invoices, payments | `taxpayer360`, `agents` | `RiskSignal` (expenditure signal) |
| Projects, permits | `taxpayer360`, `agents` | `RiskSignal`; case confidence |
| Enumeration | `tax-net`, `taxpayers` | New taxpayer leads; `RiskSignal`; income proxy |
| Payer identity / TIN | `identity`, `taxpayers` | Attaches all of the above to a `Taxpayer` |
| Certificates, inspections | `cases`, `tax-net` | Corroboration; non-permitted-trading leads |
| Arrears, arrangements | `cases` | Prioritisation; case suppression |
| Reference data | `scan`, `statutory` | Scale inference; routing |
| Collections summary | `analytics`, `metrics` | Reporting and reconciliation |
| Events | all of the above | Triggers a targeted re-pull |

## Appendix — related documents

- **Document A** — [INTEGRATION-TAX-SYSTEM.md](INTEGRATION-TAX-SYSTEM.md), the
  Tax Administration System interface. §C.18 there is the counterpart to §C.4
  here.
- [INTEGRATION-OVERVIEW.md](INTEGRATION-OVERVIEW.md) — how the two documents fit
  together
- [COMPLIANCE-MAPPING.md](COMPLIANCE-MAPPING.md) — statutory basis
