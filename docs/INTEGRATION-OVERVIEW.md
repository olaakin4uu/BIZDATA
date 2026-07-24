# BIZDATA Revenue Integration — Overview

**How the two counterparty documents fit together.**

| | |
|---|---|
| Document type | Internal / joint overview |
| Version | 1.0 |
| Companions | Document A — [INTEGRATION-TAX-SYSTEM.md](INTEGRATION-TAX-SYSTEM.md) · Document B — [INTEGRATION-MDA-REVENUE-APP.md](INTEGRATION-MDA-REVENUE-APP.md) |

---

## Why there are two documents

The authority administers revenue through **two separate systems**:

| | Document A — Tax Administration System | Document B — MDA Revenue Application |
|---|---|---|
| Administers | State taxes: PIT, PAYE, WHT, CGT, stamp duty and state levies | Non-tax revenue: permits, project fees, licences, signage, inspections, markets |
| Holds | Taxpayer registry, filed returns, assessments, arrears, tax payments, PAYE registrations | Invoices, payments, projects and declared values, market enumeration, certificates, fee ledger |
| Gives BIZDATA | **The declared side** of the comparison | **Observed spending** and **the informal sector** |
| Addressed to | Tax System engineering team | MDA Revenue Application engineering team |

Each document is **self-contained** — its own transport conventions, security
requirements, checklist and open questions — so it can be sent to its team
without the other.

## What BIZDATA is doing with all of it

```
        BANKS / FINTECHS / TELCOS            TAX SYSTEM (Doc A)         MDA APP (Doc B)
        §29 transaction submissions          declared income            permits, projects,
                    │                        assessments, payments      enumeration
                    │                                │                        │
                    └────────────────┬───────────────┴────────────────────────┘
                                     ▼
                                  BIZDATA
                    match → compare → flag → assess → refer back
                                     │
                                     ▼
                    demand notices, Tax Net leads, PAYE gap,
                    recovered revenue written back to Doc A
```

Detection is a subtraction: **observed inflow − declared income = the gap.**
Document A supplies the declared side. Document B supplies two things BIZDATA
cannot get anywhere else — verified *spending*, and visibility into the informal
sector that sits entirely below §29 reporting thresholds.

## The join between them

The two systems are joined by the **TIN**.

The MDA application already stores `tax_id` against its users, resolved from the
Tax System by NIN lookup (`tax_id_source = existing`) or registered on the spot
(`created`). The mechanism is built and working.

**The open risk is coverage, not mechanism.** BIZDATA's ability to use anything
in Document B is capped by the share of MDA users carrying a resolved `tax_id`.
That number is not currently known to either team.

> **Phase 0, before any build work:** measure `tax_id` coverage in the MDA
> application (Document B §C.4.2). If it is high, Document B's datasets are among
> the most valuable inputs BIZDATA will ever receive. If it is low, a batch
> back-resolution campaign is a **prerequisite**, not a follow-on — and everyone
> should know that before committing engineering effort.

This shared obligation appears in both documents: **Document A §C.18** (expose
NIN→TIN resolution) and **Document B §C.4** (expose and improve `tax_id`
coverage).

## Sequencing across both

| Phase | Document A | Document B |
|---|---|---|
| **0** | — | Measure `tax_id` coverage (§C.4.2) |
| **1** | Registry, returns (§C.1–C.2) | — |
| **2** | Payments, assessments, filing status, arrangements | Users / TIN linkage (§C.4) |
| **3** | PAYE, reference data, TIN resolution (§C.18) | Invoices, projects (§C.1–C.2) |
| **4** | Case write-back, collections, events | Enumeration (§C.3) — subject to DPIA |
| **5** | Related parties, WHT, service records, bank accounts, lifecycle | Certificates, arrears, reference, ledger, events |

Document A phase 1 is the hard dependency: without declared income there is
nothing to compare against, and no case can be raised from any source.

## Decisions needed from the authority

1. **Enumeration lawful basis** (Doc B §D.2) — does the basis on which market
   enumeration was collected extend to tax administration? A legal
   determination, and it gates Document B's highest-value dataset entirely.
2. **Rate-table source of truth** (Doc A §C.7) — the Tax System, or BIZDATA's
   `StatutoryConfig`?
3. **LGA / ward code alignment** (Doc B §C.7) — do the two systems use the same
   code set, or is a crosswalk needed?
4. **NIN handling** (Doc B §C.4.1) — decrypt in the API layer, or exchange a
   shared blind-index key?
5. **Back-resolution campaign** (Doc B §C.4.3) — who runs it, and when?

## Existing integrations these supersede or extend

BIZDATA already accepts three **push** endpoints from the tax side —
`POST /integration/declared-income`, [`/integration/paye`](INTEGRATION-PAYE.md)
and [`/integration/tax-payments`](INTEGRATION-TAX-PAYMENTS.md). Those remain
valid and supported as a transitional path; the field semantics are deliberately
identical to the pull contracts in Document A, so a team can push today and
expose pull endpoints later without rework.

There is no existing integration with the MDA Revenue Application. Document B is
entirely new work.
