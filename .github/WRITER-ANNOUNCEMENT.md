# Heads-up: `main` is going PR-only

**TL;DR — stop pushing directly to `main`. From now on: branch → pull request → merge.**

We've had multiple writers (people and/or AI agent sessions) committing to `main`
at the same time. It has already reset in-progress work more than once. To stop
that, `main` is being locked so it only accepts changes through pull requests.

## What you need to do

1. **Don't `git push origin main` anymore.** It will be rejected once protection
   is enabled (and even before then, please stop).
2. Work on a branch and open a PR instead:
   ```bash
   git checkout main && git pull --ff-only origin main
   git checkout -b type/short-description        # feat/ fix/ chore/ docs/ test/
   # …commit your work…
   git push -u origin type/short-description
   gh pr create --fill                            # or open the PR in the GitHub UI
   ```
3. Before pushing, **`git fetch` and rebase onto the latest `main`** if it moved.
4. Full rules: [CONTRIBUTING.md](../CONTRIBUTING.md).

## If you're an automated agent / AI session

- **Only one agent should be writing to this repo at a time.** If another session
  is active, don't run a second one that also pushes.
- Always branch from your first commit — never leave uncommitted work sitting on
  `main`, where a concurrent checkout can wipe it.
- Re-check `origin/main`'s position immediately before every push and rebase if it
  advanced.

## Why

Branch protection (see [.github/BRANCH-PROTECTION.md](BRANCH-PROTECTION.md)) makes
the merge safe and reviewable, and stops two writers from silently overwriting
each other. It's not bureaucracy — it's the fix for a problem we actually hit.

Questions or a genuinely urgent hotfix that can't wait for a PR? Ping the repo
owner before touching `main` directly.
