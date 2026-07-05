# BRIS — Deployment & Infrastructure Runbook

How the **procurement/infrastructure** items integrate with the software hooks already built. Each section says *what to provision* and *the exact code/env seam it plugs into*. Nothing here requires new application code unless noted.

---

## 1. Services & ports
| Service | Tech | Port | Notes |
|---|---|---|---|
| Backend API | NestJS 11 | 4200 | `npm run start:dev` (dev) / `npm run build && node dist/main` (prod) |
| Frontend | Next.js 16 | 4201 | `npm run dev -- -p 4201` / `npm run build && npm start` |
| Database | PostgreSQL 16 | 5432 | `bizdata_db` |

## 1b. Clean deploy — quickstart (verified end-to-end)
From a fresh checkout against an empty database:
```
# 1. Backend
cd backend
npm ci
cp .env.example .env         # then fill DATABASE_URL, JWT_SECRET, PII_ENC_KEY, PII_INDEX_KEY (see §2/§3)
npx prisma migrate deploy    # applies prisma/migrations → creates all tables
npx prisma generate          # generate the client (also runs on npm ci via postinstall if configured)
npm run db:seed              # tenant + super admin (+ demo staff/providers/taxpayers) — idempotent
npm run build                # emits dist/ (prebuild clears any stale tsbuildinfo)
node dist/main               # boots on $PORT (prod mode requires PII_ENC_KEY/PII_INDEX_KEY)

# 2. Frontend
cd ../frontend
npm ci
npm run build && npm start   # or: npm run dev -- -p 4201
```
> **Migrations, not `db push`.** Schema changes are versioned in `prisma/migrations/`. In dev, `npx prisma migrate dev --name <change>` creates a new migration; deploy applies them with `migrate deploy`. Do **not** use `prisma db push` in production — it does not record migration history.

## 2. Environment variables (full)
```
DATABASE_URL=postgresql://user:pass@host:5432/bizdata_db?schema=public
JWT_SECRET=<32+ random chars>
NODE_ENV=production
FRONTEND_URL=https://bris.fct-irs.gov.ng
PORT=4200

# PII field-level encryption (base64, 32 bytes each) — see §3
PII_ENC_KEY=...
PII_INDEX_KEY=...

# TLS 1.3 / mTLS — see §4
TLS_CERT_PATH=/etc/bris/tls/server.crt
TLS_KEY_PATH=/etc/bris/tls/server.key
TLS_CA_PATH=/etc/bris/tls/ca.crt
TLS_REQUEST_CLIENT_CERT=true

# Background scheduler (§41 deadlines, agent refresh, retention purge)
SCHEDULER_ENABLED=true
# Enforce CBN BVN modulo-11 once the official algorithm is confirmed
BVN_CHECKDIGIT_ENFORCED=false
```

## 3. Key custody — HSM / KMS (NTAA §139, NDPA, §5.3)
**Built:** AES-256-GCM field encryption + blind index; keys load via a single seam.
**Provision:** an HSM (FIPS 140-2 Level 3) or cloud KMS; 90-day rotation under dual control.
**Integration point:** `backend/src/common/services/crypto.service.ts → loadKey()`. Replace the env read with:
- **PKCS#11 HSM:** fetch/unwrap the data key via the HSM session (e.g. `graphene-pk11`); never let raw key bytes persist to disk.
- **Cloud KMS:** envelope encryption — store a wrapped DEK, call KMS `Decrypt` at boot to load it into memory.
- **Rotation:** version the payload prefix (already `v1.`); on rotation add `v2.` and keep old keys for decrypt-only. Dual control = two-officer approval on the KMS key policy.
> No app changes elsewhere — `encrypt`/`decrypt`/`blindIndex` are unchanged.

## 4. Transport — TLS 1.3 + mTLS + SFTP (§5.3, §6.1)
**Built:** `main.ts` enables HTTPS (`minVersion TLSv1.3`) when `TLS_CERT_PATH`/`TLS_KEY_PATH` are set; `TLS_REQUEST_CLIENT_CERT=true` + `TLS_CA_PATH` turns on **mutual TLS** (client-cert verification) for bank REST ingestion.
**Provision:**
- Server cert from the FCT-IRS CA; bank client certs signed by the same CA (mTLS).
- **REST channel:** point banks at `https://…/api/submissions/ingest-json` over mTLS.
- **SFTP channel:** stand up an SFTP server over a VPN tunnel; a watcher drops files into `POST /api/submissions/upload`. (SFTP daemon = ops; the ingestion endpoint already validates + checksums.)
- **Certificate pinning** (officer mobile app): pin the server cert/public key in the mobile client when built.

## 5. Encryption at rest — whole-table TDE (§5.3)
**Built:** field-level AES-256-GCM on BVN/NIN/TIN/account.
**Provision (defence in depth):** enable storage-level encryption — PostgreSQL TDE (EDB/cloud-managed `pgcrypto`/managed-instance encryption) or full-disk/volume encryption (LUKS / cloud EBS-KMS). No app change.

## 6. Authentication — MFA & hardware tokens (§5.3)
**Built:** Password + **TOTP** (RFC-6238, opt-in per user) — `/auth/staff/mfa/{setup,enable,enable,disable}`, login takes optional `totp`. JWT 8h, role-scoped. JIT elevation (30-min, supervisor-approved) for PII.
**Provision / extend:**
- Issue **YubiKey 5 NFC / FIDO2** devices to staff (3rd factor).
- Add **WebAuthn** ceremony (`@simplewebauthn/server` + `/browser`) — registration/authentication endpoints + a `WebAuthnCredential` table; this is the only remaining *code* task for full 3FA and needs a browser/authenticator to test.
- Enforce MFA org-wide by defaulting `mfaEnabled=true` on enrolment.

## 7. Data sovereignty / hosting (§5.2)
Host backend, DB, and HSM **within the Federal Capital Territory** (or in-country government cloud); restrict egress; keep all processing in-country. Deployment/policy task — no app change.

## 8. Operational schedules (already automated)
- **Daily 02:00** §41(6) deadline sweep · **Daily 03:00** agent refresh · **Weekly** scan (`modules/scheduler`).
- **Monthly** NDPA retention purge (`modules/ndpa`, `tenant.retentionYears`, default 6).
- All gated by `SCHEDULER_ENABLED`; all audit-logged.

## 9. Go-live checklist
1. Provision HSM/KMS → wire `loadKey()`; generate + escrow `PII_ENC_KEY`/`PII_INDEX_KEY` under dual control.
2. Obtain TLS certs (server + bank client CA); set `TLS_*`; verify `https://…/api/docs` and an mTLS bank handshake.
3. Enable Postgres TDE / disk encryption.
4. `npx prisma migrate deploy` → `npm run db:seed` (tenant + admin); **rotate the seeded admin password immediately** (`Admin@1234` is a bootstrap default). For a bank-only production tenant, prune the demo staff/providers the seed adds.
5. Issue YubiKeys; enrol staff MFA; flip `mfaEnabled` default on.
6. Confirm the placeholder legal constants with counsel (tax bands, 30/90-day windows, 10% penalty, CGT, BVN check-digit) and set `BVN_CHECKDIGIT_ENFORCED` when ready.
7. Execute bank MoUs (`/governance`); issue §29 data-request letters; onboard the top-6 banks.
8. Turn on `SCHEDULER_ENABLED`; verify audit chain via `/audit` → *Verify chain integrity*.

See `BRIS-BUILD-STATUS.md` and `COMPLIANCE-MAPPING.md` for the feature/clause status these steps complete.
