# BizData

**Multi-source data intelligence platform for revenue authorities.**

BizData ingests transaction data from banks, fintechs, telcos, payment processors, FX bureaus, and other regulated data providers, then matches it against declared taxpayer income to detect underdeclaration. Built for Nigerian state and federal tax authorities operating under **NTAA 2025 §29**.

It started as the Bank Reports Intelligence System (BRIS) inside SIRIS — now a standalone product.

---

## Architecture

- **Backend:** NestJS 11 · Prisma 7 · PostgreSQL 16 · JWT (staff + provider strategies) · Helmet · Throttler
- **Frontend:** Next.js 16 · React 19 · Tailwind 4 · Zustand
- **Two portals:** Staff back-office + Provider self-service

```
bizdata/
├── backend/           NestJS API on port 4200
├── frontend/          Next.js app on port 4201 (both portals)
├── docker-compose.yml Postgres + backend + frontend
└── .env.example
```

---

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 16+ (or use docker-compose)
- npm

### Local dev (without Docker)

```bash
# 1. Create database
createdb bizdata_db
# or: psql -U postgres -c "CREATE DATABASE bizdata_db"

# 2. Backend
cd backend
cp .env.example .env       # edit DATABASE_URL + JWT_SECRET
npm install
npx prisma db push
npx tsx prisma/seed.ts     # seeds tenant, admin, 5 providers, 10 taxpayers
npm run start:dev          # API on http://localhost:4200, docs at /api/docs

# 3. Frontend (new terminal)
cd frontend
cp .env.example .env.local
npm install
npm run dev                # http://localhost:4201
```

### Default credentials (from seed)

| Portal | URL | Email | Password |
|--------|-----|-------|----------|
| Staff | http://localhost:4201/login | `admin@bizdata.local` | `Admin@1234` |
| Provider (Zenith) | http://localhost:4201/provider/login | `admin@zenithbank.local` | `Provider@1234` |
| Provider (GTB / Opay / MTN / Paystack) | same URL | `admin@{gtbank,opay,mtn,paystack}.local` | `Provider@1234` |

### Docker

```bash
docker compose up -d
# Wait for "BizData API running on 4200" then visit http://localhost:4201
```

---

## Core Workflow

1. **Onboard a provider** — staff registers a bank/fintech/telco, creates a provider user account.
2. **Provider submits data** — logs into `/provider/login`, uploads quarterly CSV.
3. **Backend ingests** — validates against provider's schema template, creates `DataRecord` rows, matches each to a `Taxpayer` via BVN → NIN → name fuzzy.
4. **Staff runs scan** — POST `/api/scan` with a year and discrepancy threshold (default 20%).
5. **Scan engine** — aggregates inflows by taxpayer+year, compares to `DeclaredIncome`, flags records where `inflow > declared × (1 + threshold)`.
6. **Officer reviews** — `/flagged` page lets analysts mark records as `CLEARED` (false positive) or `CONFIRMED` (real underdeclaration). Confirmed flags drop taxpayer risk score.
7. **Audit** — every action is logged with SHA-256 hash chaining for tamper evidence.

---

## Provider Types Supported

`BANK`, `FINTECH`, `PAYMENT_PROCESSOR`, `TELCO`, `FX_BUREAU`, `POS_AGGREGATOR`, `ECOMMERCE`, `OTHER`

Each type has a default CSV schema (in `backend/src/modules/submissions/submission-parser.ts`). Edit per-type schemas at `/schemas` in the staff UI.

---

## Legal Basis

Designed for compliance with:
- **NTAA 2025 §29** — Information to be delivered by bankers and others (quarterly returns from banks/fintechs)
- **NTAA 2025 §4** — TIN/NIN/CAC as automatic Tax Identification Number
- **NTAA 2025 §35** — Administrative (Best of Judgement) assessment power
- **NTAA 2025 §41** — Taxpayer 30-day objection window
- **NTAA 2025 §139** — Official secrecy and confidentiality
- **NDPA 2023** — Data protection (purpose limitation, data minimisation, audit logs)

⚠️ All statutory citations should be verified by qualified legal counsel before operational deployment.

---

## Project Structure

### Backend modules
| Module | Purpose |
|--------|---------|
| `auth` | Staff + provider login, MFA-ready JWTs |
| `tenant` | Single-row tenant config |
| `users` | Staff user CRUD |
| `providers` | Data provider registry |
| `provider-users` | Provider user accounts |
| `taxpayers` | Minimal taxpayer registry + CSV import |
| `declared-income` | Income data for scan comparison |
| `submissions` | File upload + CSV parsing + validation |
| `data-records` | Ingested records + review workflow |
| `scan` | Underdeclaration scan engine |
| `audit` | Tamper-evident audit log |
| `schemas` | Per-provider CSV schema templates |
| `provider-portal` | Provider-user-facing endpoints |

### Database models
`Tenant`, `User`, `DataProvider`, `DataProviderUser`, `Taxpayer`, `DeclaredIncome`, `DataSubmission`, `DataRecord`, `UnderdeclarationScan`, `AuditLog`, `ProviderSchema`

---

## Roadmap

- [x] v1: Bank reports, manual provider onboarding, CSV ingestion, scan, review, audit
- [ ] v2: AI analytics agents (pattern detection, TIN-BVN matching, sector classification)
- [ ] v2: Field-level encryption + HSM integration
- [ ] v2: Hardware token (YubiKey) MFA
- [ ] v3: Multi-tenant SaaS
- [ ] v3: Cross-jurisdiction data exchange (per JRBA 2025 §15)

---

## License

Proprietary. Contact for commercial licensing.
