#!/usr/bin/env python3
"""Generate the single combined integration specification from the two
counterparty documents.

    python scripts/combine_specs.py

Reads:  docs/INTEGRATION-TAX-SYSTEM.md      (Document A)
        docs/INTEGRATION-MDA-REVENUE-APP.md (Document B)
Writes: docs/INTEGRATION-REVENUE-DATA-REQUIREMENTS.md

The two counterparty documents remain the source of truth. This script splices
their endpoint specifications into one document, de-duplicates the transport
conventions and the cross-system identity section (which are deliberately
repeated across the pair), and renumbers every section reference to match.

Re-run it after editing either source document. Do not hand-edit the output.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC_A = ROOT / 'docs/INTEGRATION-TAX-SYSTEM.md'
SRC_B = ROOT / 'docs/INTEGRATION-MDA-REVENUE-APP.md'
OUT = ROOT / 'docs/INTEGRATION-REVENUE-DATA-REQUIREMENTS.md'


def slice_between(text, start, end):
    a = text.index(start)
    b = text.index(end, a)
    return text[a:b].rstrip() + '\n'


# ── reference remapping ──────────────────────────────────────────────────────
B_SEC = {1: 'D.1', 2: 'D.2', 3: 'D.3', 4: 'E.4', 5: 'D.4',
         6: 'D.5', 7: 'D.6', 8: 'D.7', 9: 'D.8'}
B_CONV = {4: 4, 5: 5, 6: 7, 7: 8, 8: 9, 9: 10}


# Phrases that make sense in a two-document set but not in the combined one.
PHRASES = [
    ('Shared with Document B', 'Shared with the MDA Revenue Application'),
    ('Shared with Document A', 'Shared with the Tax System'),
    ("Document B's datasets stay disconnected",
     "the MDA Revenue Application's datasets (Part D) stay disconnected"),
    ("ward is the join to Document B's enumeration data",
     'ward is the join to the enumeration data in §D.3'),
    ('the MDA Revenue App contributes', 'the MDA Revenue Application contributes (Part D)'),
    ("Document B's entire contribution", 'the entire contribution of Part D'),
]


def rewrite_phrases(t):
    for a, b in PHRASES:
        t = t.replace(a, b)
    return t


def remap_A(t):
    """Document A: C.1-C.17 keep their numbers; C.18 becomes Part E."""
    t = rewrite_phrases(t)
    def c(m):
        base, sub = int(m.group(1)), m.group(2) or ''
        if base == 18:
            return f'§E.3{sub}' if sub else '§E'
        return f'§C.{base}{sub}'
    t = re.sub(r'§C\.(\d+)((?:\.\d+)*)', c, t)
    t = re.sub(r'§D\.(\d)', lambda m: f'§F.{m.group(1)}', t)
    return t.replace('§A.2', '§A.3').replace('§E.1 Minimum', '§G.3 Minimum')


def remap_B(t):
    """Document B: its Part C becomes Part D; its C.4 becomes Part E.4.

    Order matters — the D->F remap must run BEFORE C->D, or it clobbers the
    Part D references this function has just created.
    """
    t = rewrite_phrases(t)
    t = re.sub(r'§D\.(\d)', lambda m: f'§F.{m.group(1)}', t)

    def c(m):
        base, sub = int(m.group(1)), m.group(2) or ''
        if base == 4 and not sub:
            return '§E'
        return f'§{B_SEC.get(base, f"D.{base}")}{sub}'
    t = re.sub(r'§C\.(\d+)((?:\.\d+)*)', c, t)
    t = re.sub(r'§B\.(\d+)', lambda m: f'§B.{B_CONV.get(int(m.group(1)), int(m.group(1)))}', t)
    t = t.replace('Document A §E', '§E').replace('Document A §C.18', '§E')
    return t.replace('§A.2', '§A.3')


# ══ authored framing ═════════════════════════════════════════════════════════
HEAD = """# BIZDATA — Revenue Data Interface Requirements

**What BIZDATA needs from the authority's revenue systems, and why.**

| | |
|---|---|
| Document type | Interface requirements (combined) |
| Counterparties | **Tax Administration System** (Part C) and **MDA Revenue Application** (Part D) |
| Direction | **Pull** — BIZDATA calls each system on a schedule |
| Status | Draft for review |
| Version | 1.0 (combines Document A v2.0 and Document B v1.0) |
| Audience | Part A: authority management. Parts B–G: engineering. |

> **This document is generated.** It combines the two counterparty documents —
> [INTEGRATION-TAX-SYSTEM.md](INTEGRATION-TAX-SYSTEM.md) (A) and
> [INTEGRATION-MDA-REVENUE-APP.md](INTEGRATION-MDA-REVENUE-APP.md) (B) — into a
> single specification, stating the shared transport conventions and the
> cross-system identity requirement **once** instead of twice. Edit the source
> documents and re-run `python scripts/combine_specs.py`; do not hand-edit this
> file.
>
> Use this combined version for internal review, for the authority, and for a
> single supplier responsible for both systems. Use the separate documents when
> writing to one vendor team who should not receive the other's requirements.

---

## How to read this document

**Part A** is written for non-engineers: what each dataset is, which BIZDATA
capability depends on it, and what breaks without it. No JSON.

**Parts B–G** are the engineering contract: shared transport conventions,
endpoint specifications for each system, the cross-system identity requirement,
security and privacy, and acceptance criteria.

| Term | Means |
|---|---|
| **The Tax System** | The authority's tax administration platform — taxpayer registration, returns, assessment, tax collection. Part C. |
| **The MDA Revenue Application** | The separate system administering non-tax revenue — permits, project fees, licences, inspections, markets. Part D. |
| **BIZDATA** | The §29 data-matching and underdeclaration-detection platform described in [README.md](../README.md). |

---

# PART A — The business case, dataset by dataset

## A.0 Why this interface exists at all

BIZDATA sees one side of the picture: **money observed moving**. Banks,
fintechs, telcos, payment processors and FX bureaus submit transaction data
under NTAA 2025 §29; BIZDATA matches each record to a taxpayer and totals what
that taxpayer actually received in a year.

Underdeclaration detection is a subtraction:

```
observed inflow   (BIZDATA knows this)
− declared income (ONLY the Tax System knows this)
= the gap
```

BIZDATA does not natively know what a taxpayer declared, was assessed, or paid.
That lives in the **Tax System** (Part C). Without it, BIZDATA can produce
interesting numbers but not a **defensible assessment**.

The observed side has two further blind spots, and the **MDA Revenue
Application** (Part D) holds the cure for both:

- **The informal economy.** §29 thresholds are ₦50m/month for individuals and
  ₦250m for corporates. A market trader turning over ₦2.8m a month never crosses
  them, never files a return, and has little banking footprint. Market
  enumeration data is the only route in.
- **Self-reporting.** Declared income is what a taxpayer *says* they earned.
  Permit, project and fee records are what they actually *spent* — assessed and
  verified by the authority itself, and correspondingly hard to dispute.

Neither MDA dataset needs a bank, a §29 obligation or a new consent basis. The
authority already owns both.

### The two systems at a glance

| | Part C — Tax System | Part D — MDA Revenue Application |
|---|---|---|
| Administers | PIT, PAYE, WHT, CGT, stamp duty, state levies | Permits, project fees, licences, signage, inspections, markets |
| Supplies | Registry, returns, assessments, arrears, tax payments, PAYE | Invoices, projects and declared values, enumeration, certificates, ledger |
| Gives BIZDATA | **The declared side** of the comparison | **Observed spending** and **the informal sector** |
| Joined by | ← the taxpayer's **TIN** — see Part E → | |

"""

PART_A_SEQ = """## A.3 Priority and sequencing

| Phase | Tax System (Part C) | MDA Revenue Application (Part D) |
|---|---|---|
| **0** | — | **Measure `tax_id` coverage** (§E.4.2) |
| **1** | Registry, returns (§C.1–§C.2) | — |
| **2** | Payments, assessments, filing status, arrangements (§C.3, §C.4, §C.6, §C.12) | Users / TIN linkage (§E.4) |
| **3** | PAYE, reference data, TIN resolution (§C.5, §C.7, §E.3) | Invoices, projects (§D.1–§D.2) |
| **4** | Case write-back, collections, events (§C.8–§C.10) | Enumeration (§D.3) — subject to the DPIA question in §F.2 |
| **5** | Related parties, WHT, service records, bank accounts, lifecycle (§C.11, §C.13–§C.17) | Certificates, arrears, reference, ledger, events (§D.4–§D.8) |

**Phase 1 in the Tax System is the hard dependency.** Without declared income
there is nothing to compare against, and no case can be raised from any source.

**Phase 0 is not a formality.** BIZDATA's ability to use *anything* in Part D is
capped by the share of MDA users carrying a resolved `tax_id`. That number is not
currently known to either team. Measuring it is a single query, and it decides
whether Part D is a major workstream or a marginal one — see §E.4.2.

**On the two datasets with the best value-per-effort ratio** — non-tax revenue
(§D.1–§D.2) and enumeration (§D.3) — they sit in phases 3–4 only because they
depend on identity linkage being in place. The data already exists, is already
verified by the authority's own officers, and needs no third-party provider.

"""

PART_B_HEAD = """---

# PART B — Transport conventions

These apply to **both** systems. Where a requirement differs between them it is
called out inline.

"""

PART_C_HEAD = """---

# PART C — Tax System endpoint specifications

Eighteen datasets. §C.18 — TIN resolution — is shared with the MDA Revenue
Application and is specified once, in **Part E**.

"""

PART_D_HEAD = """---

# PART D — MDA Revenue Application endpoint specifications

Nine datasets. Payer identity and TIN linkage is shared with the Tax System and
is specified once, in **Part E**.

"""

PART_E = """---

# PART E — Cross-system identity

> **This is the one requirement neither system can satisfy alone, and the
> highest-risk item in this document.** In the separate counterparty documents
> it appears twice — as Document A §C.18 and Document B §C.4. Here it is stated
> once.

## E.1 The problem

The authority administers revenue through two systems. A single person may be:

| | In the Tax System | In the MDA Revenue Application |
|---|---|---|
| Known as | Taxpayer `TP-000184221`, TIN `01234567-0001` | User `USR-004471`, `tax_id` `01234567-0001` |
| Recorded activity | Filed ₦16.2m assessable income for 2026 | Paid ₦3.6m in fees on a ₦120m development |

Those two facts only become a case when BIZDATA knows they are the same person.
The TIN is the only key both systems share.

## E.2 What already exists

The MDA Revenue Application stores `tax_id` and `tax_id_source` against its
users, populated by calling the Tax System — `existing` where a NIN lookup found
a TIN, `created` where one was registered on the spot. `identity_number` holds
the encrypted NIN/RC/BN.

**The mechanism already works.** What this part asks for is that it become a
documented, supported interface rather than an internal call, and that its
coverage be measured and disclosed.

## E.3 Tax System obligations

### E.3.1 `GET /identity/resolve`

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
match — it is how BIZDATA distinguishes *"not in the tax net"* from *"lookup
failed"*, and those drive opposite enforcement actions.

### E.3.2 `POST /identity/resolve/bulk`

Batch form for reconciliation runs, up to 1000 identifiers per call. Same record
shape per result, plus the input identifier echoed back.

### E.3.3 `GET /identity/verify/{tin}`

Confirms a TIN is live and returns its current status — used before BIZDATA
attaches an MDA record to a taxpayer, so a stale or merged TIN does not silently
mis-attribute someone else's spending.

## E.4 MDA Revenue Application obligations

### E.4.1 `GET /users` — the identity spine

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

**On `identityNumber`:** it is encrypted at rest in the MDA application. BIZDATA
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

### E.4.2 `GET /identity/coverage` — the number that decides everything

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

**This endpoint is Phase 0** and can be built before anything else in this
document. At the illustrative 22% above, roughly four out of five permit and
enumeration records could not be attached to a taxpayer — which would make a
back-resolution campaign a prerequisite rather than an afterthought.

### E.4.3 Back-resolution

Where `identityNumber` is present but `taxId` is null, the MDA application can
already resolve it against §E.3.1. Running that as a **batch back-fill** —
rather than only opportunistically at project-creation time, as happens today —
would lift coverage across the whole user base in one exercise.

BIZDATA does not need to perform this itself and would prefer not to: the lookup
is the MDA application's existing integration, and doing it there keeps one
authoritative `tax_id` per user rather than a second opinion held elsewhere.

## E.5 Requirements summary

| Requirement | Owner |
|---|---|
| Expose NIN→TIN resolution as a supported API, with a documented rate limit | Tax System |
| Return an explicit no-match rather than an error for unknown identifiers | Tax System |
| Never expose plaintext NIN in bulk responses beyond what the lookup requires | Tax System |
| Expose `tax_id`, `tax_id_source`, and NIN as plaintext-or-blind-index | MDA Revenue App |
| Publish `tax_id` **coverage** (§E.4.2) | MDA Revenue App |
| Run a back-resolution batch for users with NIN but no TIN (§E.4.3) | MDA Revenue App |
| Re-resolve TINs affected by a merge or re-issue (§C.16) | Both |

"""

PART_F_HEAD = """---

# PART F — Security, privacy and operations

Applies to both systems unless stated otherwise.

"""

PRIVACY = """## F.2 Privacy — NDPA and data minimisation

This is a lawful data-sharing arrangement between a revenue authority and its own
analytics platform, but it must still be minimal and documented.

### Applying to both systems

- **BIZDATA stores no plaintext TIN, NIN or BVN.** All are encrypted at rest
  (AES-256-GCM) with a keyed HMAC blind index for equality lookup. Both systems
  may therefore send them; BIZDATA will never return them in plaintext to any
  downstream consumer. See §E.4.1 for the MDA-side handling.
- **BVN is optional and requested last.** Send it only if lawfully held and its
  onward sharing is covered by the existing lawful basis. NIN alone is sufficient
  for a substantial match-rate improvement.
- **Employee-level PAYE data is deliberately not requested** (§C.5.2) —
  aggregates satisfy the detection need.
- **Purpose limitation:** data received under this interface is used solely for
  tax and revenue administration — detection, assessment and enforcement — and
  for no other purpose.
- **Retention** is aligned to the authority's statutory retention schedule.
  BIZDATA will honour deletion instructions for a taxpayer on request.
- A joint DPIA and data-sharing agreement should be executed before production
  data flows. Sandbox may use synthetic data without one.

### Specific to the MDA Revenue Application

**Enumeration data (§D.3) carries a heavier privacy load than anything else in
this document** and should be treated accordingly. It names individual informal
traders, with NIN, phone number and GPS coordinates. Most are not yet taxpayers,
and none supplied the data to a tax authority — they supplied it to a market
administrator.

Required handling:

- Covered **explicitly** in the DPIA, as a distinct processing activity with its
  own lawful basis — not folded into "revenue data" generally.
- Used only to establish tax liability and register taxable persons.
- Held in BIZDATA under the same JIT-elevation controls applied to BVN: GPS
  coordinates and phone numbers are visible to field-enforcement roles only, not
  to general analyst accounts.
- **If the lawful basis for enumeration does not extend to tax administration,
  this dataset should be withheld and §D.3 struck from the agreement.** That is a
  legal determination, not an engineering one, and it should be made before any
  build work starts rather than after.

**Invoice, project and certificate data (§D.1, §D.2, §D.4)** is repurposed from
permit administration to tax administration. It remains within "revenue
administration" as a purpose, but the DPIA should record the change of use.

"""

SERVICE = """## F.3 Service expectations

| Item | Target |
|---|---|
| Availability | 99.5% monthly, excluding notified maintenance |
| Latency (single lookup) | p95 < 500 ms |
| Latency (collection page, 1000 records) | p95 < 3 s |
| Nightly sync window | Agreed window, ≥ 4 hours |
| Maintenance notice | 48 hours for planned windows |
| Breaking API change notice | 60 days, with sandbox available throughout |
| Initial backfill — Tax System | **6 years** of returns, payments and assessments (the statutory assessment/limitation window), plus the full current registry |
| Initial backfill — MDA Revenue App | **6 years** of invoices, payments and projects; **all** enumeration records regardless of age |
| Initial backfill window | Agreed one-off period with a raised rate limit, or a signed bulk export as a fallback |
| Support | Named technical contact each side; incident channel |

Enumeration is exempted from the 6-year limit deliberately: an enumeration from
2021 still evidences that a business existed and was trading then, which is
directly relevant to how many years of non-registration are in scope.

## F.4 Operational contacts

| Role | Tax System | MDA Revenue App | BIZDATA |
|---|---|---|---|
| Technical owner | _TBC_ | _TBC_ | _TBC_ |
| Data protection officer | _TBC_ | _TBC_ | _TBC_ |
| Incident escalation | _TBC_ | _TBC_ | _TBC_ |

"""

PART_G_HEAD = """---

# PART G — Acceptance and open questions

"""

APPENDIX = """---

## Appendix — dataset-to-module map

| Dataset | Source | BIZDATA module | Storage / effect |
|---|---|---|---|
| Taxpayer registry | Tax System | `identity`, `taxpayers`, `tax-net` | `Taxpayer` |
| Returns / declared income | Tax System | `declared-income`, `scan` | `DeclaredIncome` |
| Tax payments | Tax System | `tax-report`, `taxpayer360` | `TaxPayment` |
| Assessments / arrears | Tax System | `cases`, `statutory` | Case suppression + reconciliation |
| PAYE employers | Tax System | `paye`, `tax-net` | `Taxpayer.payeStatus`, `payeRegNumber` |
| Filing status | Tax System | `tax-net` | Risk signals |
| Reference data | Tax System | `statutory`, `scan` | `StatutoryConfig`, `SectorThreshold` |
| Case write-back | Tax System | `cases`, `model-feedback` | `UnderdeclarationCase.status`, `recoveredAmount` |
| Related parties | Tax System | `agents` (matching, pattern) | `RiskSignal`, linked case view |
| Arrangements | Tax System | `cases` | Case suppression / release |
| WHT credits | Tax System | `tax-report`, `cases` | Corroborating evidence |
| Service records | Tax System | `statutory` | `objectionDueAt`, `authorityResponseDueAt` |
| Declared bank accounts | Tax System | `identity` | `DataRecord.accountIndex` match |
| Lifecycle events | Tax System | `identity`, `taxpayers` | Taxpayer re-keying |
| FX rates | Tax System | ingestion | Currency normalisation |
| Invoices, payments | MDA Revenue App | `taxpayer360`, `agents` | `RiskSignal` (expenditure signal) |
| Projects, permits | MDA Revenue App | `taxpayer360`, `agents` | `RiskSignal`; case confidence |
| Enumeration | MDA Revenue App | `tax-net`, `taxpayers` | New taxpayer leads; income proxy |
| Certificates, inspections | MDA Revenue App | `cases`, `tax-net` | Corroboration; non-permitted-trading leads |
| Fee arrears | MDA Revenue App | `cases` | Prioritisation; suppression |
| Collections summaries | Both | `analytics`, `metrics` | Reporting and reconciliation |
| TIN linkage | Both | `identity` | Attaches Part D data to a `Taxpayer` |
| Events | Both | all of the above | Triggers a targeted re-pull |

## Appendix — related documents

- [INTEGRATION-TAX-SYSTEM.md](INTEGRATION-TAX-SYSTEM.md) — Document A, the Tax
  System interface as a standalone counterparty document
- [INTEGRATION-MDA-REVENUE-APP.md](INTEGRATION-MDA-REVENUE-APP.md) — Document B,
  the MDA Revenue Application interface as a standalone counterparty document
- [INTEGRATION-OVERVIEW.md](INTEGRATION-OVERVIEW.md) — the short joint overview
- [INTEGRATION-PAYE.md](INTEGRATION-PAYE.md) — existing push contract, PAYE status
- [INTEGRATION-TAX-PAYMENTS.md](INTEGRATION-TAX-PAYMENTS.md) — existing push contract, payments
- [COMPLIANCE-MAPPING.md](COMPLIANCE-MAPPING.md) — statutory basis
- [LEGAL-BRIEF-PROVIDER-PENALTIES.md](LEGAL-BRIEF-PROVIDER-PENALTIES.md) — §101 penalties
"""


def build():
    A = SRC_A.read_text(encoding='utf-8')
    B = SRC_B.read_text(encoding='utf-8')

    # endpoint bodies
    partC = remap_A(slice_between(A, '## C.1 Taxpayer registry', '## C.18 TIN resolution'))
    partD = remap_B(
        slice_between(B, '## C.1 Invoices', '## C.4 Payer identity')
        + '\n---\n\n'
        + slice_between(B, '## C.5 Certificates', '# PART D — Security'))
    partD = re.sub(r'^## C\.(\d+) (.*)$',
                   lambda m: f'## {B_SEC[int(m.group(1))]} {m.group(2)}', partD, flags=re.M)

    # business case halves
    bizA = remap_A(slice_between(A, '## A.1 The eighteen datasets', '## A.2 Priority')) \
        .replace('## A.1 The eighteen datasets',
                 '## A.1 What the Tax System must provide — 18 datasets')
    bizB = remap_B(slice_between(B, '## A.1 The nine datasets', '## A.2 Priority')) \
        .replace('## A.1 The nine datasets',
                 '## A.2 What the MDA Revenue Application must provide — 9 datasets')

    # shared conventions: Document A's, which is the fuller of the pair
    conv = remap_A(slice_between(A, '## B.1 Model: BIZDATA pulls', '# PART C — Endpoint'))
    conv = conv.replace(
        '```\nhttps://{tax-system-host}/api/partner/v1\n```',
        'Each system exposes its own base URL:\n\n```\n'
        'https://{tax-system-host}/api/partner/v1        # Part C\n'
        'https://{mda-revenue-app-host}/api/partner/v1   # Part D\n```')
    # extend the cadence table with the MDA datasets
    conv = conv.replace(
        '| FX rates (§C.17) | Daily |',
        '| FX rates (§C.17) | Daily |\n'
        '| Invoices, projects (§D.1–§D.2) | Nightly delta |\n'
        '| Enumeration (§D.3) | Weekly delta — enumeration campaigns are episodic |\n'
        '| Certificates, inspections (§D.4) | Weekly delta |\n'
        '| Fee arrears (§D.5) | Nightly delta |\n'
        '| MDA reference data (§D.6) | Daily |\n'
        '| MDA collections (§D.7) | Daily |')

    # give-backs
    giveA = slice_between(A, '## A.3 What BIZDATA gives back', '---\n\n# PART B') \
        .replace('## A.3 What BIZDATA gives back',
                 '## A.4 What the authority gets back\n\n### From the Tax System integration')
    giveB = slice_between(B, '## A.3 What this application gets back', '---\n\n# PART B') \
        .replace('## A.3 What this application gets back',
                 '### From the MDA Revenue Application integration')

    # acceptance + questions
    def chk(text, title):
        t = slice_between(text, '# PART E — Acceptance checklist', '## E.1 Minimum viable')
        return t.replace('# PART E — Acceptance checklist', title)
    chkA = remap_A(chk(A, '## G.1 Acceptance checklist — Tax System'))
    chkB = remap_B(chk(B, '## G.2 Acceptance checklist — MDA Revenue Application'))

    mvpA = remap_A(slice_between(A, '## E.1 Minimum viable interface', '## E.2 Open questions')) \
        .replace('## E.1 Minimum viable interface',
                 '## G.3 Minimum viable interface\n\n### Tax System')
    mvpB = remap_B(slice_between(B, '## E.1 Minimum viable interface', '## E.2 Open questions')) \
        .replace('## E.1 Minimum viable interface', '### MDA Revenue Application')

    qA = remap_A(slice_between(A, '## E.2 Open questions', '---\n\n## Appendix')) \
        .replace('## E.2 Open questions for the Tax System team',
                 '## G.4 Open questions — Tax System team')
    qB = remap_B(slice_between(B, '## E.2 Open questions', '---\n\n## Appendix')) \
        .replace('## E.2 Open questions for the MDA Revenue Application team',
                 '## G.5 Open questions — MDA Revenue Application team')

    secA = remap_A(slice_between(A, '## D.1 Security requirements', '## D.2 Privacy')) \
        .replace('## D.1 Security requirements', '## F.1 Security requirements')

    doc = ''.join([
        HEAD, bizA, '\n', bizB, '\n', PART_A_SEQ, giveA, '\n', giveB, '\n',
        PART_B_HEAD, conv, '\n',
        PART_C_HEAD, partC, '\n',
        PART_D_HEAD, partD, '\n',
        PART_E,
        PART_F_HEAD, secA, '\n', PRIVACY, SERVICE,
        PART_G_HEAD, chkA, '\n', chkB, '\n', mvpA, '\n', mvpB, '\n', qA, '\n', qB, '\n',
        APPENDIX,
    ])
    doc = re.sub(r'\n{4,}', '\n\n\n', doc)
    OUT.write_text(doc, encoding='utf-8')
    print(f'wrote {OUT.relative_to(ROOT)}  ({len(doc.splitlines())} lines)')

    stray = sorted(set(re.findall(r'§[A-G]\.\d+(?:\.\d+)*', doc)))
    heads = re.findall(r'^#{1,2} (.+)$', doc, flags=re.M)
    print(f'  {len(heads)} headings, {len(stray)} distinct cross-references')
    return doc


if __name__ == '__main__':
    build()
