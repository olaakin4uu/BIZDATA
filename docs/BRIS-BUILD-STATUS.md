# BRIS — Build Status vs. Proposal

**Document:** Implementation status of the Bank Reports Intelligence System (BRIS) against `02-BRIS-Proposal-FCT-IRS.docx`.
**Repo:** `bizdata` (backend: NestJS 11 / Prisma 7 / PostgreSQL 16 · frontend: Next.js 16 / React 19).
**Legend:** ✅ Implemented & verified · 🟡 Partial / software-hooks only · 🏗️ Infrastructure / procurement (not codeable in this repo) · 📄 Documentation.

> Honesty note: "verified" means exercised end-to-end against seeded data this session (API responses / UI HTTP 200 / chain checks). Tax bands, statutory windows, and penalty rates are **placeholder defaults pending confirmation by FCT-IRS legal/tax counsel**. The proposal's §5.4 "already implemented" table referred to the SIRIS platform; this `bizdata` repo independently implements the equivalents below.

---

## §5.1 End-to-end pipeline
`Bank Submission → Encrypted Ingestion → AI Matching → AI Analytics → Officer Review → Best-of-Judgement Assessment → Demand Notice → Recovery`

| Stage | Status | Where |
|---|---|---|
| Bank submission (CSV + JSON REST) | ✅ | `submissions/*`, `POST /submissions/upload`, `POST /submissions/ingest-json` |
| Encrypted ingestion (validation + AES-256-GCM at rest) | ✅ | `ingestion-validators.ts`, `crypto.service.ts` |
| AI matching (entity resolution, TIN/NIN/BVN/name) | ✅ | `submissions.service.ts → resolveTaxpayer` |
| AI analytics (6 agents) | ✅ | `modules/agents/*` |
| Officer review (case lifecycle) | ✅ | `modules/cases/*`, `/cases` UI |
| Best-of-Judgement assessment (§35) | ✅ | `cases.service.ts → transition(NOTICE_ISSUED)` |
| Demand notice + evidence bundle | ✅ | `GET /cases/:id/evidence` |
| Recovery / §41 objection / deemed-upheld | ✅ | `cases.service.ts`, `processDeadlines()` |

## §5.2 Six AI analytics agents — ✅ all built & verified
Per-taxpayer `analyze(profile, ctx)` contract (`agents/agent.types.ts`), orchestrated by `agents.service.ts`, persisted as `RiskSignal`, surfaced on dashboard + case detail.

| Agent | Status | Note |
|---|---|---|
| 1 Pattern Detection | ✅ | structuring near §29 thresholds + round-number deposits |
| 2 TIN-BVN Matching | ✅ | identity-confidence signal + Nigerian phonetic + fuzzy-DOB matchers |
| 3 Sector Classification | ✅ | keyword/seasonality inference + peer/cohort benchmark |
| 4 Behavioural Analytics | ✅ | fingerprint; fires with multi-period data |
| 5 Predictive Compliance | ✅ | settle-vs-default → expected-net-recovery priority |
| 6 Document Intelligence | ✅ | OCR/LLM extraction + reconcile; now assesses CGT (NTA §50) from extracted asset disposals and raises a signal |

Agent signals are **fused into case risk** (`detection-engine.ts → aggregateAgentScore/compositeConfidence`).

## §5.3 Data security & token-based access
| Control | Status | Where |
|---|---|---|
| AES-256-GCM field-level (BVN/NIN/TIN/account) | ✅ | `crypto.service.ts` (+ HMAC blind index) |
| Whole-`BankReport`-table encryption (TDE) | 🏗️ | DB-level; ops |
| HSM key custody (FIPS 140-2 L3) + 90-day rotation | 🟡 | versioned KeyProvider seam (`key-provider.ts`) with key-tagged ciphertext (v2.\<keyId\>), rotation status + daily 90-day check + lazy re-encrypt (`/governance/key-*`); env-backed today, HSM/PKCS#11 is a drop-in provider + procurement |
| TLS 1.3 (+ mTLS) | 🟡 | env-gated `httpsOptions` hook in `main.ts` (`TLS_*` envs, `minVersion TLSv1.3`, optional client-cert); certs/SFTP are ops |
| Role-based PII masking | ✅ | `pii-access.service.ts` |
| JIT elevation (30-min, supervisor-approved) | ✅ | `modules/access/*`, `/access` UI |
| Password + TOTP (2 of 3 factors) | ✅ | `auth.service.ts` + `common/services/totp.ts` (opt-in per user); verified |
| Hardware FIDO2 (3rd factor) | 🏗️ | needs physical YubiKeys/WebAuthn ceremony |
| Copy/paste block + identity watermark | ✅ | `components/SensitiveValue.tsx` |
| Access roles (ANALYST/AUDIT_OFFICER/SUPERVISOR/ADMIN/DPO) | ✅ | `UserRole` enum + field scoping |
| Tamper-evident SHA-256 hash-chained audit | ✅ | `audit.service.ts`; verify at `GET /audit/verify` + UI |
| View/elevated-access + export logging | ✅ | `PII_ACCESS`, `EVIDENCE_EXPORT` audit actions |
| 6-year retention + quarterly DPO reporting | ✅ | `modules/ndpa/*`, `/dpo` UI |

## §6 Technical data-exchange — ✅
| Item | Status | Where |
|---|---|---|
| §6.2 CSV column spec (17-col, aliases + extras) | ✅ | `submission-parser.ts`, `processRows` |
| §6.3 JSON REST schema | ✅ | `ingestJson()` |
| §6.4 completeness / BVN format + mod-11 / NUBAN check-digit / arithmetic | ✅ | `ingestion-validators.ts` |
| §6.4 duplicate detection + SHA-256 checksum | ✅ | `processRows`, `upload`/`ingestJson` |
| §6.4 500 MB split/batching protocol | ✅ | multipart split upload (`/submissions/multipart/*`): ordered parts, whole-file SHA-256 verify on reassembly, memory-flat batched ingestion |
| §6.5 acknowledgment (receipt hash + 4-hr report + 5-day resubmit) | ✅ | `issueReceipt()`, `GET /submissions/:id/report` |
| §6.6 SLA timers + §29 thresholds + quarterly calendar | ✅ | `provider-compliance.service.ts`, `/compliance` UI |

## §2 Legal mechanics
| Provision | Status | Where |
|---|---|---|
| §4 TIN framework (NIN/CAC as TIN) — matching | ✅ | entity resolution |
| §29 third-party returns + thresholds (₦25m/₦100m) | ✅ | ingestion + compliance scoping |
| §35 Best-of-Judgement assessment (auto-trigger) | ✅ | case lifecycle |
| §41 objection (30-day) + §41(6) 90-day deemed-upheld | ✅ | `processDeadlines()` |
| 10% late-payment penalty | ✅ | assessment computation |
| CGT 10% (NTA §50) on disposals | ✅ | Document Intelligence extracts asset-disposal proceeds → assesses CGT at the configured rate (best-of-judgement) and stores it on the case document |
| PIT/CIT bands (NTA §37 ₦800k threshold) | ✅* | `detection-engine.ts` — *bands are placeholder defaults to confirm |
| 6-year retention | ✅ | NDPA module |

## §10 / §12 Governance & oversight
| Item | Status | Where |
|---|---|---|
| Model precision/recall + fairness audit | ✅ | `metrics.service.ts`, `/metrics` UI |
| Human-in-loop on every assessment | ✅ | case lifecycle requires officer transitions |
| Steering / Minister / annual reporting pack | ✅ | `governance.service.ts`, `/governance` UI |
| Bank MoU / onboarding tracking | ✅ | `BankMou`, `/governance` UI |
| Notifications/alerts | ✅ | `notifications.service.ts`, `/notifications` UI |

## Cross-jurisdiction (built)
| Item | Status |
|---|---|
| JRB Act §15 cross-state data sharing (Phase 4) | ✅ `modules/cross-state/*`, `/cross-state` UI — outbound referrals (minimised: TIN+amounts), inbound channel, TIN-blind-index linking, audited |

## Infrastructure items — ranked by relevance to BizData
These are often lumped together as "procurement." They are not equally relevant to *this* system's security posture. Ranked from load-bearing to policy-only:

| Item | Relevance to BizData | What is actually missing | Where it plugs in |
|---|---|---|---|
| **HSM / KMS key custody** | **High — load-bearing.** BizData's entire PII-protection story (encrypted BVN/NIN/TIN/account at rest) rests on AES keys that today sit in base64 env vars — anyone with server/env access can decrypt every taxpayer identity. Getting keys off-disk is the one genuinely material hardening. | The external key store (HSM device or cloud KMS). The **code seam is done** — versioned `KeyProvider` + envelope support; a KMS provider is a config swap, not a rewrite. | `common/services/key-provider.ts`, `crypto.service.ts` |
| **mTLS / SFTP ingestion channel** | **Medium — the §29 pipeline.** Banks push quarterly returns (BVNs, balances) *into* BizData; the transport must authenticate the bank and protect data in transit. But this is **ops/config, not missing capability** — the code already supports it. | TLS certs from the FCT-IRS CA (server + bank client certs) and an SFTP daemon. | `main.ts` `TLS_*` hooks; `POST /submissions/ingest-json` (mTLS), `POST /submissions/upload` (SFTP watcher) |
| **TDE / disk encryption** | **Low–medium — defence-in-depth.** Sensitive PII is *already* encrypted at the application layer; TDE additionally protects backups/WAL/dropped tablespaces on the storage medium. A satisfier, not an exposure. | Storage-level encryption (managed-instance TDE, or LUKS/EBS-KMS full-disk). No app change. | Database / volume layer |
| **FIDO2 / hardware tokens** | **Low — optional extra factor.** This is about *staff* login, not the data pipeline. BizData already has password + TOTP 2FA (enrolment + recovery codes built). Hardware keys are an incremental 3rd factor for PII-viewing officers. | YubiKeys + a WebAuthn ceremony (the only remaining *code* task; needs a browser/authenticator to test). | `auth` module (new `WebAuthnCredential` table + endpoints) |
| **In-FCT hosting / data sovereignty** | **None (code) — pure policy.** BizData runs identically in Abuja or anywhere; this is a hosting-contract/egress decision, not an application concern. | A hosting decision. | — |

**Bottom line:** the single item that materially changes BizData's security posture is **HSM/KMS key custody**. The rest are defence-in-depth (TDE), ops/config the code already supports (mTLS/SFTP), an optional extra factor (FIDO2), or non-code policy (hosting).

---

### Summary
The **functional platform** described in the proposal — ingestion, validation, encryption, matching, the six AI agents, risk fusion, case lifecycle, §35/§41 enforcement, scheduling, provider SLA, evidence bundles, tamper-evident audit, NDPA retention/DPO, and the supporting UI — is **built and verified end-to-end** in this repo. The remaining gaps are **(a) external infrastructure** — ranked above, of which only HSM/KMS key custody is materially load-bearing — and **(b) legal confirmation** of the placeholder tax bands / statutory windows / penalty+CGT rates / BVN check-digit algorithm. All buildable software features in the proposal — including JRB §15 cross-state sharing — are now implemented. See `COMPLIANCE-MAPPING.md` for the clause-by-clause control mapping.
