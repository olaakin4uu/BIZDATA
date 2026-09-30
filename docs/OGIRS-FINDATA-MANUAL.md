# FinData for the Ogun State Internal Revenue Service

**The complete platform manual — every screen, both portals, and the security model.**

Prepared for the Ogun State Internal Revenue Service (OGIRS). This document is both the
operations manual for the people who will use FinData and the reference behind the
presentation of the platform to OGIRS management.

> **About the figures in this manual.** Every screen shown here was captured from a working
> installation running on a **demonstration dataset**. The institutions, taxpayers,
> identifiers and amounts are invented; no real taxpayer's data appears anywhere in this
> document. The screens, calculations and behaviour are the live product — only the
> underlying records are synthetic, so that a manual can be shared without disclosing
> anyone's financial affairs. Figures illustrate what the platform reports; they are not
> claims about Ogun State's revenue base.

---

## Part I — What FinData does for OGIRS

### The problem it addresses

A revenue authority can only assess what it can see. Ogun State's taxable base includes
individuals and businesses whose real economic activity passes through banks, fintechs,
payment processors and other financial institutions — while the income they declare to
OGIRS is a separate, self-reported figure. Where the two diverge, the state loses revenue
it is legally owed, and there is no practical way to find that gap by hand across millions
of accounts.

FinData closes that gap mechanically. It takes in the reports financial institutions are
**already obliged by law to file**, matches them to the taxpayer register, compares money
observed against income declared, and turns every material difference into a case an
analyst can work and the authority can defend.

### The legal basis

FinData does not create a new reporting obligation. It operationalises ones that already
exist:

| Instrument | What it provides |
|---|---|
| **NTAA 2025 §29** | Financial institutions must report qualifying customer activity to the relevant tax authority. This is the duty FinData collects against. |
| **NTAA 2025 §101** | Penalties for a reporting institution that files late or fails to file — ₦100,000 for the first month and ₦50,000 for each further month. |
| **NTAA 2025 §41** | The objection window and the authority's response deadline, which the platform tracks and enforces. |
| **NTAA 2025 §139** | Record-keeping and accountability, answered by the tamper-evident audit chain. |
| **JRB Act 2025 §15** | Referral of a taxpayer to their home state revenue service, sharing only the minimum necessary. |
| **NDPA 2023** | Data protection: lawful basis, access records, and retention limits (§28). |

### What OGIRS gets

1. **A register of who must report.** Every financial institution operating in the state,
   what it owes under §29, when it is due, and whether it has filed.
2. **Automatic detection.** Scans compare observed inflow against declared income and flag
   every gap above the statutory threshold — no manual trawling.
3. **A defensible case file.** Each case carries the evidence, the confidence score, the
   analyst decisions and a complete audit trail, so an assessment can survive objection.
4. **Enforcement that follows the law.** Demand notices, §41 objection handling,
   cross-state referrals, and §101 penalties against non-filing institutions.
5. **Provable privacy compliance.** Sensitive identifiers are encrypted at rest and masked
   on screen; seeing one in full requires a fresh identity check and is logged.

> **A note on early figures.** Two headline numbers read low at the start and this is
> correct, not a fault. *Recovered* counts only cases closed and paid. *Provider
> compliance* is measured against the full §29 obligation, so while institutions are still
> being onboarded it is expected to be low. They are honest measures, and they rise as the
> programme rolls out.

### The two applications

- **The OGIRS back office** — for analysts, supervisors, administrators, audit officers and
  the Data Protection Officer.
- **The provider portal** — for the external financial institutions that must file returns.

---

## Part II — Getting started

### Signing in

OGIRS staff sign in at `/login`. Financial institutions sign in at `/provider/login`. Both
screens carry a **Forgot password?** link, so either can reset without calling the other.

Both sign-in screens carry the OGIRS name and logo, taken live from Settings.

### How the work flows

Each part of the system is a stage in one direction of travel:

1. Financial institutions file their returns (**Submissions**); the individual lines land in
   **Data Records**.
2. Taxpayers are registered and the income they declared is recorded (**Declared Income**).
3. **Scans** compare money observed against income declared; anything above the threshold
   becomes a **Flagged Review** item.
4. **AI agents** add further signals — patterns, identity matches, behaviour, predictions,
   and document reading.
5. Confirmed mismatches become **Cases**, routed to analysts through **Portfolios**.
6. **Enforcement** produces demand notices, cross-state referrals and tax reports.
7. Everything sensitive is written to the **Audit Log** — a tamper-evident chain where each
   entry is cryptographically linked to the one before it.

### The navigation

The staff sidebar groups the work into six sections, and this manual follows that order:

**Overview · Data · Detection · Enforcement · Governance · Admin**

**Ask IRIS** sits directly under Dashboard, outside the six sections. Your **Account &
security** page is reached from the user menu at the top right, not the sidebar.

---

## Part III — The OGIRS back office

### Overview

#### Dashboard — `/dashboard`

![The Dashboard: revenue at risk, recovered revenue, open cases and the detection-to-recovery pipeline.](manual-images/dashboard.png)

The money-first home screen. It leads with the figures that matter most — estimated
recoverable tax, how much has been recovered, open cases, and cases at critical risk —
followed by an operations and compliance strip, the path from detection through to
recovery, a breakdown of risk levels, the top cases by recoverable tax, and tiles into the
six AI agents. Everything is for a tax year you choose.

**Why it matters:** one screen tells OGIRS management where the money and the risk are, and
where to act next.

#### Ask IRIS — `/iris`

![Ask IRIS — plain-English questions over the whole platform.](manual-images/iris.png)

A conversational assistant over the whole platform. Ask in plain English — *"show me the top
10 cases for 2025"*, *"explain the highest-confidence case"*, *"generate an Excel report of
open cases"*, *"run the 2025 scan"* — and IRIS answers, builds the report, or proposes the
action. Anything that changes data or runs a job is presented as a **card you must confirm
before it executes**; nothing happens silently. Reports can be downloaded, and past
conversations are kept.

**Why it matters:** it puts the platform within reach of staff who will never learn every
screen, without giving up the confirmation step that keeps actions deliberate.

### Data

#### Data Providers — `/providers`

![The provider register, with §29 obligation, filing status and accrued §101 penalty.](manual-images/providers.png)

The register of financial institutions that must report to OGIRS, showing each one's §29
obligation, status, submission count and **accrued §101 penalty**. Register a new one at
`/providers/new`; open one at `/providers/:id` for its reporting timeline, portal users and
recent submissions. The register can be sorted, and your sort choice is remembered.

**Why it matters:** the roster of who must report and how they are doing, with the financial
consequence of not reporting visible on the same row.

#### Registering a provider — `/providers/new`

Captures the institution, its type and its §29 reporting obligation. Only institution types
within §29 scope can be onboarded (see *§29 scope enforcement*).

#### Provider detail — `/providers/:id`

The institution's reporting timeline, its portal users, and its recent submissions. This is
where portal logins are created and reset — see *Provider onboarding* in Part VI.

#### Taxpayer 360 — `/taxpayer-360`

![Taxpayer 360 — every signal for one person or company on a single screen.](manual-images/taxpayer-360.png)

Search by name, tax number, national identity number, bank verification number or company
registration number and get one combined view: declared income, observed inflow, open cases
and risk, for a single person or company.

**Why it matters:** the one-stop investigative profile that pulls every signal together.

#### Tax Net — `/tax-net`

![Tax Net — Captured, Unverified and Invisible populations.](manual-images/tax-net.png)

Who is inside the tax net and who is not, sorted into groups — **Captured** (has the
anchoring identifier), **Unverified** (registered but missing it), **Invisible** (seen
earning but not registered at all). It also carries PAYE registration status and can
register companies for PAYE.

**Why it matters:** it shows OGIRS the taxpayers it is *missing*, not just the ones it
already has.

#### Declared Income — `/declared-income`

![Declared income — the expected side of the comparison.](manual-images/declared-income.png)

The yearly income figures taxpayers declare, which the scans compare against. Import in bulk
at `/declared-income/import` — the data is checked before it is saved.

**Why it matters:** the "expected" side of the under-declaration comparison.

#### Submissions — `/submissions`

![Submissions — the intake record of every return filed.](manual-images/submissions.png)

Every return filed by an institution or uploaded by staff, with its status and validation
results. Open `/submissions/:id` to see exactly what failed and why.

**Why it matters:** the intake record — proof of what was received and whether it was clean.

#### Data Records — `/data-records`

![Data Records — the forensic backbone behind every case.](manual-images/data-records.png)

Every row taken in, across all institution types: account, identifiers, money in and out,
and the period covered. Open `/data-records/:id` to inspect or flag a single row.

**Why it matters:** the forensic backbone — the raw evidence behind every case.

#### Account Linkage — `/linkage`

![Account Linkage — one customer, many accounts, across institutions.](manual-images/linkage.png)

Finds customers holding **multiple accounts**, within one institution and across several.
Two independent views:

- **By identifier** — accounts grouped on the same BVN or NIN. Because those values are
  encrypted with a random IV and cannot be searched directly, grouping runs on a keyed
  blind index, which gives exact matching without ever decrypting the identifier.
- **By name** — accounts whose account names match after normalisation and token sorting, so
  *"ADEBAYO, OLUWASEUN T"* and *"Oluwaseun Tunde Adebayo"* land together. Each group is
  classified by whether the identifiers agree, disagree, or are missing.

**Why it matters:** a taxpayer spreading activity across several accounts and several banks
looks small everywhere and large nowhere. This is the screen that reassembles them.

#### Data Quality — `/data-quality`

![Data Quality — identifier coverage of everything providers send.](manual-images/data-quality.png)

Statistical coverage of everything filed: what proportion of records carry a NIN, a BVN, a
TIN, a usable account number and a valid customer type — by institution and overall — plus
match quality and register holdings.

**Why it matters:** matching accuracy is capped by identifier coverage. This screen shows
OGIRS exactly which institutions are filing thin data, with the evidence to make them fix
it. It is deliberately **not** filtered by the §29 threshold, because a data-quality
question is about everything received, not only the reportable part.

### Detection

#### Analytics — `/analytics`

![Analytics — comparison by provider and by sector.](manual-images/analytics.png)

Compares performance by institution and by sector.

**Why it matters:** spot outliers and sector-wide patterns before running formal checks.

#### Scans — `/scan`

![Scans — the under-declaration detection engine.](manual-images/scan.png)

The core detection engine. A scan totals the money observed for a taxpayer in a year and
compares it against the income they declared, flagging any gap above the threshold. Start a
new scan or review past ones; open `/scan/:id` for a run's year, threshold and results. The
default threshold comes from the versioned statutory settings.

#### Flagged Review — `/flagged`

![Flagged Review — the human checkpoint before enforcement.](manual-images/flagged.png)

Records a scan has flagged, waiting for an analyst to confirm or clear.

**Why it matters:** the human checkpoint between automatic detection and enforcement.

#### Agent Signals — `/agent-signals`

![Agent Signals — the combined feed from the six AI agents.](manual-images/agent-signals.png)

A single filterable feed of findings from the six AI agents across all taxpayers.

### Enforcement

#### Cases — `/cases`

![Cases — the prioritised enforcement worklist.](manual-images/cases.png)

The prioritised worklist of under-declaration cases. Open `/cases/:id` for why it was
flagged and with what confidence, the observed inflow, the evidence, any uploaded documents,
and its status and owner. A case can produce an AI-drafted tax report.

**Why it matters:** where detection becomes action.

#### Compliance — `/compliance`

![Compliance — §29 filing duties turned into an actionable list.](manual-images/compliance.png)

The §29 filing duties — who must file, who is late or missing, and where data quality is
failing — turned into an actionable list. §101 penalty exposure is calculated here, on the
same basis as the penalty column on the providers register, so the two always agree.

#### Cross-State — `/cross-state`

![Cross-State — referrals under JRB Act 2025 §15.](manual-images/cross-state.png)

Referrals under JRB Act 2025 §15. Refer a taxpayer who does not reside in Ogun State to
their home state revenue service, sharing only the minimum — the tax number and the amounts,
nothing more. Handles both outbound and inbound referrals.

**Why it matters:** lets states cooperate on mobile taxpayers without over-sharing personal
data.

#### Portfolios — `/portfolios`

![Portfolios — case ownership and analyst workload.](manual-images/portfolios.png)

Who owns which institutions, institution types or sectors, so new cases route automatically
to the right analyst — the most specific match wins — with every analyst's workload visible.

**Why it matters:** fair, automatic distribution of work, in the open.

### Governance

#### Model & Fairness — `/metrics`

![Model & Fairness — detection accuracy under a fairness check.](manual-images/metrics.png)

Oversight of the detection model: how accurate its flags are, how they are distributed, and
the feedback loop where analyst overturns tune it — all under a fairness check.

**Why it matters:** keeps detection accurate and provably fair.

#### Governance — `/governance`

![Governance — the oversight pack and encryption-key controls.](manual-images/governance.png)

The board-level view: the steering-committee report pack, the status of institution
agreements and onboarding, and the controls for the encryption keys protecting personal
data, including key status and re-encryption.

#### Audit Logs — `/audit`

![Audit Logs — the tamper-evident chain, with verification.](manual-images/audit.png)

A tamper-evident record of every sensitive action, each entry cryptographically linked to
the one before it, so any edit, insertion or deletion breaks the chain and is detected. A
**verify** action re-checks the whole chain and points to exactly where any break is.

**Why it matters:** accountability OGIRS can prove — evidence that the system and the people
running it can be held to account (NTAA §139).

#### Access Requests — `/access`

![Access Requests — time-limited, supervisor-approved sight of masked identifiers.](manual-images/access.png)

Bank verification numbers and account numbers are masked by default. Staff request
time-limited access, approved by a supervisor, to see them in full.

**Why it matters:** least access by default; every full disclosure is deliberate, approved
and logged.

#### Data Protection — `/dpo`

![Data Protection — the DPO console under NDPA 2023.](manual-images/dpo.png)

The Data Protection Officer's console under NDPA 2023: lawful basis for holding data, records
of who accessed what, and retention limits (§28) including retention reporting and purging.

#### Schemas — `/schemas`

![Schemas — the column template expected from each institution type.](manual-images/schemas.png)

The column template expected from each institution type, viewable and editable by
administrators.

**Why it matters:** institutions know exactly what to send, and the parser knows exactly what
to expect.

### Admin

#### Alerts — `/notifications`

![Alerts — audience-gated operational notifications.](manual-images/notifications.png)

Operational alerts: high-value flags, missing submissions and approaching §41 deadlines.
Alerts are **gated by audience** — service-wide alerts appear here in the OGIRS back office,
while alerts addressed to one institution appear only in that institution's own portal.

#### Users — `/users`

![Users — OGIRS staff accounts and roles.](manual-images/users.png)

OGIRS staff accounts. Create at `/users/new`, open one at `/users/:id`, reset a password from
the user's row.

#### Settings — `/settings`

![Settings — branding, integration keys and the versioned statutory parameters.](manual-images/settings.png)

The OGIRS profile and logo, integration API keys, and the statutory parameters — rates,
thresholds, deadlines, the scan threshold, the §101 penalty amounts and the date compulsory
fields begin to be enforced — all kept in versions. Branding set here takes effect live
across the whole platform, including both sign-in screens.

---

## Part IV — Account & security

Your own password and sign-in security live on **Account & security** (`/account`), opened
from the user menu at the top right.

### Changing your own password

Enter your current password and a new one of at least 8 characters.

> Changing your password signs you out of every other device. This is deliberate.

### Forgot your password

1. Click **Forgot password?** on the sign-in screen.
2. Enter your email and click **Send reset link**.
3. The screen shows the same confirmation whether or not that address has an account, so it
   cannot be used to discover who holds one.
4. Open the link, choose a new password, sign in. The link works once and expires after one
   hour.

Reset requests are rate-limited.

### Two-factor authentication

Add a second step using an authenticator app (Google Authenticator, Authy, 1Password,
Microsoft Authenticator): register the key shown, confirm with the 6-digit code, and **save
the one-time recovery codes** — each signs you in once if the device is lost. Recovery codes
can be regenerated, and 2FA turned off, by confirming a current code.

### Administrator password reset

From **Users** → the user → **Reset password**. Afterwards the user's existing sessions end
immediately, and they must set their own password at next sign-in — so the administrator
never learns it.

> Point staff at **Forgot password?** first. An administrator reset is for when they cannot
> do it themselves.

---

## Part V — The provider portal

Financial institutions reporting to OGIRS use a separate portal at `/provider/*`, with
Dashboard · Submissions · Notifications · Profile along the top, plus their own account menu.

#### Provider sign-in — `/provider/login`

Carries the OGIRS name and logo, and the same self-service **Forgot password?**
(`/provider/forgot-password`, `/provider/reset-password`).

#### Provider Dashboard — `/provider/dashboard`

The institution's home page: its figures for the year, recent filings, the next return due,
and its on-time filing rate.

**Why it matters:** in one glance — *am I keeping up, and what is due next?*

#### Submissions — `/provider/submissions`

The list of returns this institution has filed, each showing accepted and rejected counts.

#### New submission — `/provider/submissions/new`

Where the return is filed. The page states up front that **CSV is the only accepted format**,
before a file is chosen, and offers the annotated template for download.

- Submissions are **CSV only**. Spreadsheet workbooks (`.xlsx`, `.xls`, `.ods`) are refused
  both in the browser and at the server, which identifies the format actually uploaded and
  says how to convert it — rather than failing with a parser error.
- The size limit is 100 MB.
- Errors name the **real line number in the uploaded file**, not a row number from the
  template, and are written in plain language: which column, what was wrong with it, and
  what to do about it. A missing or misread header row is diagnosed specifically — a
  workbook saved with a `.csv` name, a header on a later line, the wrong separator, a
  near-miss column name, or a genuinely absent column each produce a different message.

#### Submission detail — `/provider/submissions/:id`

What was accepted, what was rejected, and exactly why.

#### Notifications — `/provider/notifications`

Alerts addressed to this institution only — its own missing filings, penalties and
deadlines. Service-wide OGIRS alerts do not appear here.

#### Profile — `/provider/profile`

Account and organisation details, including a password change.

### The return template

Every return is a CSV with these columns. **All are compulsory except TIN**, and there is no
grace period.

| # | Column | Notes |
|---|---|---|
| 1 | **NIN** | National Identity Number — 11 digits |
| 2 | **Account Number** | NUBAN for banks; wallet, merchant or policy identifier otherwise |
| 3 | **Account Name** | The name on the account |
| 4 | **BVN** | Bank Verification Number — 11 digits |
| 5 | **Customer Type** | One of the six values below |
| 6 | **Total Inflow** | Total credits for the period (₦) |
| 7 | **Total Outflow** | Total debits for the period (₦) |
| 8 | **TIN** | Tax Identification Number — **optional** |

**Customer Type** must be one of six values: `INDIVIDUAL`, plus the five corporate classes
the Corporate Affairs Commission recognises under CAMA 2020 — `BUSINESS_NAME` (sole
proprietorship or partnership), `PRIVATE_LIMITED` (Ltd), `PUBLIC_LIMITED` (Plc),
`LIMITED_BY_GUARANTEE` (Ltd/Gte) and `INCORPORATED_TRUSTEES`.

> **Why TIN alone is optional.** TIN is the strongest matching key available — stronger even
> than BVN — and many institutions already hold it, so it is worth collecting. But row
> validation is all-or-nothing: making TIN compulsory would reject an institution's entire
> file over accounts for which it genuinely holds no TIN. It is therefore collected wherever
> it exists and never allowed to block a filing.

> **Account numbers and Excel.** A NUBAN whose leading zero has been stripped by a
> spreadsheet, or rendered in scientific notation, is caught at ingest — the unrecoverable
> case is rejected and the recoverable one warned about, rather than being stored wrong
> with no signal to anyone.

### Staff access to an institution's records

Before OGIRS staff can view an institution's actual filed records — which expose taxpayers'
BVN, NIN and full account numbers — the officer must re-confirm their identity: their own
password, plus a 6-digit authenticator code if 2FA is enabled. The system then grants a
**10-minute** permission, tied to that one officer and that one institution, for viewing
records only.

---

## Part VI — How the platform works

### §29 scope enforcement

Only financial institutions fall under the §29 reporting duty. Attempting to onboard an
out-of-scope institution type — a telecoms company, an online store, anything filed under
"other" — is refused, and no new submissions are accepted from one. Data already held for
out-of-scope institutions is left untouched; nothing is deleted.

### Reporting thresholds

- **Statutory reportability thresholds** — ₦50m for an individual, ₦250m for a company.
  These are the sizes at which a taxpayer falls under the law's reporting rules, and every
  screen showing results filters through them, so low-value activity does not clutter
  enforcement work.
- **Scan threshold** — how large the gap between observed inflow and declared income must be
  before a taxpayer is flagged. Its starting value comes from the current statutory
  settings.

The platform cites **gazette No. 117 of 26 June 2025** for the ₦50m / ₦250m figures, and
both are settings-configurable, so a revised instrument is applied by editing the statutory
configuration rather than by changing code.

> **Two points to settle before these figures are quoted to OGIRS.**
>
> *The threshold pair.* An earlier internal manual described a separate pair of §29
> *submission* thresholds — ₦25m individual, ₦100m company — as the level at which an
> institution must report an account, distinct from the reportability thresholds above. The
> platform implements only the ₦50m / ₦250m pair. Confirm against the gazetted text which
> reading is correct.
>
> *The measurement period.* §29 as recited in the codebase places the obligation on
> cumulative transactions **in a month**. The detection engine evaluates the threshold
> **per quarter**, a deliberate operator decision so that an institution reporting monthly
> is not held to a stricter bar than one reporting quarterly for the same inflow. A
> quarterly grain is the more generous reading and will report *fewer* parties than a
> monthly one. Confirm this is the intended interpretation, because it changes who is
> reportable.

### Statutory configuration, versioned

Rates, thresholds, deadlines and penalty amounts are held as configuration, not code, and
every change creates a new version. An assessment can therefore always be re-derived against
the parameters that were in force on the day it was made.

### Provider penalties (§101)

A late or missing return accrues ₦100,000 for the first month and ₦50,000 for each further
month. The amounts, the settlement window and the date enforcement begins are all
configurable in Settings. The figure shown on the providers register and the figure on the
Compliance screen are computed on the same basis, so they never disagree.

### Provider onboarding — no password is ever issued

When an institution's portal login is created, or reset, **no password is generated**.
Instead the platform issues a single-use **set-password link**, valid for 7 days, which the
institution follows to choose its own. Only the hash of the token is stored, so the link
cannot be recovered afterwards.

- Where email is configured, the message is sent automatically.
- Where it is not, the screen shows the link and a ready-to-send message, both copyable —
  this is the delivery mechanism until SMTP is configured.
- Until the link is used, the account **cannot be signed into at all** — there is no password
  to guess.

**Why it matters:** no OGIRS staff member ever knows an institution's password, so a
credential cannot leak from the authority's side.

### Protection of personal data

Sensitive identifiers — BVN, NIN, TIN, account numbers — are encrypted at rest with
**AES-256-GCM** using a random initialisation vector, which means the same value encrypts
differently every time and the ciphertext cannot be searched or correlated.

Because that also makes exact matching impossible, each searchable identifier additionally
carries a **keyed blind index** (HMAC-SHA256): a one-way fingerprint that supports exact
grouping and equality without ever revealing or decrypting the value. This is what makes
Account Linkage possible.

Keys are versioned, so the encryption key can be rotated and the data re-encrypted under a
new key from the Governance screen without downtime.

### The audit hash chain

Each audit entry carries a hash of the entry before it. Altering, inserting or deleting any
entry breaks the chain from that point on, and the verify action locates the break exactly.

### The six AI agents

| Agent | What it contributes |
|---|---|
| **Pattern detection** | Structuring, threshold-hugging and other patterns in transaction behaviour |
| **Matching** | Resolving records to the right taxpayer across identifiers and name variants |
| **Behavioural analytics** | Changes in a taxpayer's behaviour over time |
| **Predictive compliance** | Which taxpayers are likely to under-declare next |
| **Document intelligence** | Reading uploaded evidence and extracting the figures |
| **Sector classification** | Placing a taxpayer in the right sector for peer comparison |

Agent findings are **signals, not verdicts** — they surface leads for an analyst.

### Identity resolution

A TIN, BVN or NIN can be verified — one at a time or in bulk — through a connected identity
service such as NIMC or NIBSS, tying records back to a real person or company.

### Background scheduler

Automated jobs run on a schedule: scans, §41 deadline progression and notifications. A
run-now option triggers any of them by hand.

### Branding

The OGIRS name, logo and theme colour are set in Settings and take effect live across the
whole platform, including both sign-in screens.

---

## Part VII — Partner integration API

For partner platforms — for example a taxpayer-facing portal — that exchange data with
FinData automatically. Two credentials must both be present:

1. **Partner API key** (`x-api-key`) — identifies the partner. Created and revoked under
   Settings → Integration API keys. The full key is shown **once**, at creation.
2. **Case access token** (`x-case-token`) — limits a partner to one specific case.

**Taxpayer case portal endpoints**

- `GET /integration/taxpayer/notice` — collect the demand notice
- `POST /integration/taxpayer/objection` — file an objection under NTAA §41
- `POST /integration/taxpayer/document` — submit supporting evidence, which is passed to
  Document Intelligence
- `GET /integration/taxpayer/outcome` — check how the case was decided

**Bulk data push**

`POST /integration/declared-income`, `/integration/paye` and `/integration/tax-payments`
accept records in bulk. Add `?dryRun=true` to validate without saving.

---

## Part VIII — Notes and current limitations

Stated plainly, because a manual that hides them is not useful.

- **Provider compliance reads low by design.** It is measured against the full §29
  obligation, so it is expected to look low while institutions are still being onboarded.
- **Recovered stays at or near zero until cases close.** Recovery counts only cases paid and
  closed.
- **Under-declaration figures are discrepancies, not proven liabilities.** A flag measures
  the gap between observed inflow and declared income. An analyst must still confirm it.
- **Self-service reset emails need SMTP configured.** Without it the forgot-password flow
  still works, but the link is written to the server log instead of being emailed. Configure
  `SMTP_*` and set SPF, DKIM and DMARC on the sending domain.
- **`/account` is not in the sidebar** — it is reached from the user menu at the top right.
- **Flagged Review and Compliance** are screens; behind them sit the data-records scan and
  data-provider services respectively. There is no backend module of either name.
- **The §29 submission threshold figures are unconfirmed** — see the note in Part VI.

---

## Glossary

**BVN (Bank Verification Number)** — the identifier tying a person to their bank accounts
across Nigerian banks. Masked by default in FinData.

**Blind index** — a keyed one-way fingerprint of an encrypted value, allowing exact matching
and grouping without decrypting or revealing it.

**CAC classes** — the categories of registered organisation under CAMA 2020: business name,
private limited, public limited, limited by guarantee, and incorporated trustees.

**Case** — a confirmed under-declaration being worked towards assessment and recovery.

**Data provider** — a financial institution obliged to report under NTAA §29.

**Declared income** — the income figure a taxpayer reported to OGIRS for a year.

**Inflow / outflow** — total credits and debits observed on an account for a reporting
period.

**NIN (National Identity Number)** — the 11-digit identifier issued by NIMC.

**NUBAN** — the 10-digit Nigerian Uniform Bank Account Number.

**Observed inflow** — money a financial institution reported as received by a taxpayer, as
opposed to income the taxpayer declared.

**PII gating** — masking sensitive identifiers by default and requiring a fresh identity
check, granted for a limited time and logged, before showing them in full.

**Scan** — a run that compares observed inflow against declared income for a year and flags
gaps above the threshold.

**Signal** — a finding from an AI agent. A lead for an analyst, not a decision.

**Tax net** — the population of parties the authority can properly account for: Captured,
Unverified, or Invisible.

**TIN (Tax Identification Number)** — identifies a taxpayer to the revenue authority.
Generally treated as public-facing and shown in full.

**Under-declaration** — money observed exceeding income declared. The core problem FinData
exists to detect.
