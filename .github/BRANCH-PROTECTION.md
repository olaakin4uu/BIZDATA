# Branch protection — setup for `main`

This locks `main` so no one (human or agent) can push to it directly. All changes
must land through a pull request. This is a **one-time repo-admin action**; do it
once and the rule is enforced by GitHub thereafter.

Repo: `olaakin4uu/BIZDATA` · protected branch: `main`

---

## Option A — GitHub UI (click-by-click)

1. Go to **Settings → Branches** (`https://github.com/olaakin4uu/BIZDATA/settings/branches`).
2. Under **Branch protection rules**, click **Add branch ruleset** (or "Add rule").
3. **Branch name pattern:** `main`
4. Enable these:
   - ✅ **Require a pull request before merging**
     - Required approvals: **1** (set to **0** if you're a solo maintainer and
       just want to block direct pushes — you still get the PR gate).
     - ✅ Dismiss stale approvals when new commits are pushed.
   - ✅ **Require status checks to pass before merging** *(enable once CI exists —
     see `.github/workflows/ci.yml` below). Select the `build-and-test` check.*
     - ✅ Require branches to be up to date before merging.
   - ✅ **Require linear history** *(keeps `main` a clean line; pair with
     squash/rebase merges).*
   - ✅ **Do not allow bypassing the above settings** *(so even admins/agents go
     through PRs — this is the setting that actually stops the collisions).*
   - ✅ **Block force pushes** (usually on by default under rulesets).
5. **Save**.

Then, **Settings → General → Pull Requests:** allow **Squash** and/or **Rebase**
merging; **disable "Allow merge commits"** if you enabled "Require linear history".

---

## Option B — `gh` CLI (one command)

Requires the GitHub CLI authenticated as a repo admin (`gh auth login`). Run from
anywhere:

```bash
gh api -X PUT repos/olaakin4uu/BIZDATA/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  -f 'required_pull_request_reviews[required_approving_review_count]=1' \
  -F 'required_pull_request_reviews[dismiss_stale_reviews]=true' \
  -F 'enforce_admins=true' \
  -F 'required_linear_history=true' \
  -F 'allow_force_pushes=false' \
  -F 'allow_deletions=false' \
  -F 'required_status_checks=null' \
  -F 'restrictions=null'
```

- `enforce_admins=true` is the key line — it applies the rule to admins too, so a
  privileged agent/human can't bypass the PR gate.
- Solo maintainer? change the approvals to `0`:
  `-f 'required_pull_request_reviews[required_approving_review_count]=0'`.
- Once CI exists, wire the check in by replacing `required_status_checks=null`:

  ```bash
  -F 'required_status_checks[strict]=true' \
  -F 'required_status_checks[contexts][]=build-and-test'
  ```

Verify it took:

```bash
gh api repos/olaakin4uu/BIZDATA/branches/main/protection | jq '{pr: .required_pull_request_reviews, admins: .enforce_admins, linear: .required_linear_history}'
```

---

## Optional but recommended — CI status check

A minimal CI so the "require status checks" gate has something to require. Save as
`.github/workflows/ci.yml`. (Not committed here by default — enable when you're
ready to give it repo secrets / a runner.)

```yaml
name: CI
on:
  pull_request:
    branches: [main]
jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - name: Backend typecheck + tests
        working-directory: backend
        run: |
          npm ci
          npx prisma generate
          npx tsc --noEmit -p tsconfig.json
          npx jest --no-coverage
      - name: Frontend typecheck
        working-directory: frontend
        run: |
          npm ci
          npx tsc --noEmit -p tsconfig.json
```

Once this workflow has run at least once on a PR, its check name
(`build-and-test`) becomes selectable in the branch-protection "required status
checks" list.

---

## Why each setting

| Setting | Stops |
|---|---|
| Require PR before merging | Direct `git push origin main` — the root cause of the collisions. |
| Do not allow bypassing / `enforce_admins` | A privileged writer (admin or agent) skipping the PR gate. |
| Require status checks | Merging a branch that doesn't typecheck / fails tests. |
| Require linear history | Messy merge commits; keeps `main` a clean, bisectable line. |
| Block force pushes | Rewriting shared `main` history out from under other writers. |
