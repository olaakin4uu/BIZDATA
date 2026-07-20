# Contributing to BIZDATA / FinData

This repo is worked on by more than one person or automated agent at a time.
To stop concurrent writers from silently clobbering each other's work on `main`,
**nobody commits directly to `main`.** Every change goes through a branch and a
pull request. This document is the whole rule set — it is deliberately short.

## The one rule

> **Never push to `main`. Branch → PR → merge.**

`main` is a protected branch (see [.github/BRANCH-PROTECTION.md](.github/BRANCH-PROTECTION.md)).
Direct pushes are rejected by GitHub. Merges happen only through a reviewed PR.

## The workflow

```bash
# 1. Start from the latest main
git checkout main
git pull --ff-only origin main

# 2. Branch (one branch = one logical change)
git checkout -b feat/short-description      # or fix/… , chore/… , docs/… , test/…

# 3. Do the work; commit in small, focused commits

# 4. Push the BRANCH (never main) and open a PR
git push -u origin feat/short-description
gh pr create --fill                          # or open the PR in the GitHub UI

# 5. After the PR is approved + checks pass, merge it in the GitHub UI
#    (squash or rebase — see below). Then delete the branch.

# 6. Clean up locally
git checkout main && git pull --ff-only origin main
git branch -d feat/short-description
```

## Branch naming

`type/short-description`, lower-kebab-case. Types: `feat` `fix` `chore` `docs`
`test` `refactor`. Examples: `feat/staff-penalty-ui`, `fix/section29-thresholds`.

## Commits

- Small and focused — one concern per commit. Small commits limit the blast
  radius if anything ever does go wrong.
- Imperative subject, ≤ ~72 chars: `fix(penalty): stop re-issue overwriting the served notice ref`.
- Co-author trailer for AI-assisted commits (already standard here):
  `Co-Authored-By: <model> <noreply@anthropic.com>`.

## Before you open a PR

Run the same checks CI runs, locally:

```bash
# backend
cd backend && npx tsc --noEmit -p tsconfig.json && npx jest --no-coverage
# frontend
cd frontend && npx tsc --noEmit -p tsconfig.json
# prisma schema (if you touched it)
cd backend && npx prisma validate
```

A PR that doesn't typecheck or has failing tests will be blocked by the required
status check (once CI is enabled) — save the round-trip and run them first.

## Migrations

- Prisma schema changes need a migration. Generate it, commit the migration
  folder **with** the schema change in the same PR, and never edit an
  already-merged migration.
- Comment-only schema edits do **not** need a migration (`prisma migrate diff`
  will show an empty diff — confirm before assuming).

## If two people need the same area

Coordinate first. Two agents/people editing the same files concurrently is the
exact situation this workflow exists to prevent — and branch protection stops
the *merge* collision, not the *edit* collision. Prefer to finish and merge one
change before starting a dependent one on the same files.

## For automated agents / AI sessions specifically

- **One writer to `main` at a time.** Do not run two agent sessions that both
  push, against this repo, simultaneously.
- Always `git fetch` and re-check `origin/main`'s position immediately before a
  push; if it moved, rebase your branch onto it before opening/updating the PR.
- Work on a branch from the first commit — never accumulate uncommitted work on
  `main`, where a concurrent checkout can wipe it.
