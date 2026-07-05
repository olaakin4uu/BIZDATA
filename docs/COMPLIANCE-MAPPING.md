# BRIS — Compliance Control Mapping

Maps each statutory/regulatory clause to the BRIS control(s) that satisfy it, with the implementing component. **Status:** ✅ satisfied in software · 🟡 partial / needs configuration · 🏗️ requires infrastructure · 📄 organisational/legal.

> ⚠️ This mapping is an engineering self-assessment, not legal advice. Tax bands, statutory windows (30/90-day), penalty/CGT rates, and the BVN check-digit algorithm are implemented as **named, configurable constants with placeholder defaults** and must be confirmed against the gazetted texts by FCT-IRS' legal/tax advisers before enforcement.

---

## NTAA 2025 (Nigeria Tax Administration Act)

| Clause | Requirement | Control | Component | Status |
|---|---|---|---|---|
| **§4** | TIN framework (NIN/CAC as TIN); match inflows to taxpayers | Entity resolution NIN→TIN→BVN→normalised-name with match-confidence | `submissions.service.ts → resolveTaxpayer` | ✅ |
| **§29** | Financial institutions file quarterly returns above thresholds; authority uses data | CSV+JSON ingestion, ₦25m/₦100m threshold scoping, provider-obligation tracking; **onboarding + submission restricted to §29 financial institutions** (BANK, FINTECH, PAYMENT_PROCESSOR, FX_BUREAU, POS_AGGREGATOR, INSURANCE) — out-of-scope types (TELCO, ECOMMERCE, OTHER) rejected, existing data retained + labelled | `submissions/*`, `providers.service.ts`, `common/section29.ts` | ✅ |
| **§35** | Best-of-Judgement assessment when return absent/understated | Auto-computed assessment (tax + 10% penalty) on notice issuance; human-in-loop | `cases.service.ts → transition` | ✅ * |
| **§41** | 30-day taxpayer objection window | `objectionDueAt` set on notice; lifecycle `OBJECTION` state | `cases.service.ts` | ✅ * |
| **§41(6)** | Authority must respond within 90 days, else objection deemed upheld | `authorityResponseDueAt` + scheduled `processDeadlines()` auto-dismissal | `cases.service.ts`, `scheduler.service.ts` | ✅ * |
| **§139** | Official secrecy & confidentiality; officer accountability | See "§139 control set" below | multiple | ✅ |
| Late-payment penalty (10%) | Auto-computed on confirmed underdeclaration | `LATE_PAYMENT_PENALTY_RATE` | `cases.service.ts` | ✅ * |
| 6-year records retention | Storage-limitation purge after retention window | `ndpa.service.ts`, `tenant.retentionYears` | ✅ * |

`*` = legal figures are placeholder defaults pending confirmation.

### NTAA §139 control set (official secrecy / confidentiality)
| Sub-control | Component | Status |
|---|---|---|
| Encryption of sensitive data at rest (AES-256-GCM) | `crypto.service.ts` | ✅ |
| Need-to-know: role-based PII masking | `pii-access.service.ts` | ✅ |
| Time-boxed, supervisor-approved access to BVN/account (JIT) | `modules/access/*` | ✅ |
| Multi-factor authentication (password + TOTP) | `auth.service.ts` + `totp.ts` | ✅ |
| Every elevated view / export logged | audit `PII_ACCESS` / `EVIDENCE_EXPORT` | ✅ |
| Tamper-evident officer-accountability trail | SHA-256 hash chain + `GET /audit/verify` | ✅ |
| UI anti-exfiltration (no copy/paste, identity watermark) | `SensitiveValue.tsx` | ✅ |
| Confidential classification on evidence output | evidence bundle header | ✅ |
| Key custody in FIPS 140-2 L3 HSM | — | 🏗️ |

## Nigeria Tax Act 2025 (NTA)
| Clause | Requirement | Control | Status |
|---|---|---|---|
| **§37** | ₦800,000 PIT exemption threshold | First PIT band at 0% to ₦800k | ✅ * |
| **§50** | 10% Capital Gains Tax on disposals | CGT hook in assessment; needs disposal figures from Document-Intelligence | 🟡 |
| PIT/CIT graduated bands | Marginal additional-tax computation | `detection-engine.ts` | ✅ * |

## NDPA 2023 (Nigeria Data Protection Act)
| Clause | Requirement | Control | Component | Status |
|---|---|---|---|---|
| **§25** | Lawful processing | Processing basis recorded = NTAA §29 | `ndpa.service.ts → dpoReport` | ✅ |
| **§26** | Purpose limitation + data minimisation | Only §29-mandated fields ingested; documented purpose | ingestion + DPO report | ✅ |
| **§27** | Accuracy | Match-confidence scoring + officer review before action | entity resolution + case review | ✅ |
| **§28** | Storage limitation | Retention horizon + automated monthly purge (audited) | `ndpa.service.ts` | ✅ * |
| DPO oversight & reporting | DPO role + access-event oversight report | `/dpo` UI, `dpoReport()` | ✅ |
| PII protection | Field-level encryption + masking | `crypto.service.ts`, `pii-access.service.ts` | ✅ |

## CBN (Central Bank of Nigeria)
| Item | Requirement | Control | Status |
|---|---|---|---|
| BVN Regulations 2021 (2024) — authorised disclosure/custody | BVN encrypted at rest; access JIT-gated + logged; masked by default | ✅ |
| NUBAN specification | NUBAN check-digit validation at ingest | ✅ |
| BVN check-digit (modulo-11) | Implemented, env-gated (`BVN_CHECKDIGIT_ENFORCED`) pending official algorithm | 🟡 |
| Operational guidelines (transmission) | mTLS/SFTP channels | 🏗️ |

## Joint Revenue Board Act 2025
| Clause | Requirement | Control | Status |
|---|---|---|---|
| **§15** | Cross-state data exchange for migratory taxpayers | Outbound referrals to home-state IRS (minimised TIN+amounts), inbound channel, TIN-blind-index linking, audited | `modules/cross-state/*`, `/cross-state` UI | ✅ |

## Nigeria Revenue Service Act 2025
| Clause | Requirement | Status |
|---|---|---|
| **§22** | NRS ↔ State IRS data-sharing framework | ⏳ (relates to JRB §15) |

---

### Posture summary
- **Strongly covered in software:** NTAA §4, §29, §35, §41/§41(6), §139; NDPA §§25-28; CBN NUBAN; NTA PIT/CIT/§37.
- **Partial / config-dependent:** CGT §50, BVN modulo-11, 500 MB batching. TOTP MFA (2 factors) **done**; FIDO2 hardware is the remaining 3rd factor. TLS 1.3 hook **done** (needs certs); HSM **key-provider seam done** (needs the device).
- **Infrastructure/procurement:** HSM (FIPS L3) device, whole-table TDE, SFTP + cert provisioning, FIDO2 tokens, in-FCT hosting/data-sovereignty.
- **Built (software):** JRB §15 cross-state referrals (NRSA §22 partner-exchange uses the same channel).
- **Action for FCT-IRS:** confirm the placeholder tax bands, statutory windows, penalty/CGT rates, and the official BVN check-digit algorithm; provision the HSM/transport/hosting infrastructure.
