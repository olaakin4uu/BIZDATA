#!/bin/sh
# Backend startup for BizData.
#
# Runs the versioned Prisma migrations, then a first-run-safe seed, then boots
# the server. This is the single entrypoint for EVERY deploy path (Docker CMD,
# docker-compose, PM2 wrapper) so a fresh instance can never come up with an
# empty database again — the root cause of the 2026-07-18 "no users table"
# login outage on the KIRS instance.
#
#   1. `prisma migrate deploy` applies prisma/migrations/ in order and RECORDS
#      them in _prisma_migrations. We deliberately do NOT use `prisma db push`
#      here — push does not version history and left prod drifted (see
#      docs/DEPLOYMENT-RUNBOOK.md). If a migration fails we abort (set -e) so a
#      half-migrated schema never starts serving.
#   2. The seed is idempotent (every row is existence-guarded), so running it on
#      each boot only creates what is missing — it never overwrites an existing
#      admin or its (rotated) password.
#
# Skip the seed on a given instance by setting SEED_ON_START=false.
set -e

echo "[entrypoint] Applying database migrations (prisma migrate deploy)…"
npx prisma migrate deploy

if [ "${SEED_ON_START:-true}" = "true" ]; then
  echo "[entrypoint] Seeding baseline data (idempotent)…"
  # tsx runs the TS seed directly; never fail the boot if the seed hiccups on
  # optional sample data — the schema + core admin are already in place.
  npx tsx prisma/seed.ts || echo "[entrypoint] seed reported an error (continuing) — check logs"
else
  echo "[entrypoint] SEED_ON_START=false — skipping seed."
fi

echo "[entrypoint] Starting server…"
exec node dist/main.js
