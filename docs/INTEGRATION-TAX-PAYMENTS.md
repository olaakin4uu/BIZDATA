# Tax Payments Sync — Integration Spec (Tax App → BIZDATA)

Push each taxpayer's tax PAYMENTS by type into BIZDATA so the per-customer AI
tax report can show **paid vs declared vs observed** for PAYE, WHT, CGT, CIT,
VAT. Mirrors `POST /integration/paye` and `/integration/declared-income`.

## Endpoint
```
POST https://findata.kirs.gov.ng/api/integration/tax-payments
POST .../integration/tax-payments?dryRun=true     # validate only
```
Header: `x-api-key: <partner key>` (generate under Integration → Keys).

## Body — JSON array
Each record identifies the taxpayer by **RC number OR TIN** and gives one
payment.
```json
[
  { "rcNumber": "RC123456", "taxType": "PAYE", "year": 2026, "period": "2026-Q2", "amountPaid": 4200000, "reference": "RCPT-88231", "paidAt": "2026-07-10" },
  { "tin": "01234567-0001", "taxType": "WHT", "year": 2026, "amountPaid": 1500000 },
  { "rcNumber": "RC777888", "taxType": "CGT", "year": 2026, "amountPaid": 900000 }
]
```

| Field | Required | Notes |
|---|---|---|
| `rcNumber` / `tin` | one of them | Match key. Aliases: `cacRcNumber`, `taxpayerTin`. TIN matched via blind index. |
| `taxType` | yes | One of `PAYE` `WHT` `CGT` `CIT` `VAT` `OTHER`. |
| `year` | yes | Reporting year (integer). |
| `amountPaid` | yes | Number. Alias: `amount`. |
| `period` | no | Finer period e.g. `2026-Q2` / `2026-03`. |
| `reference` | no | Receipt/payment ref. Alias: `receipt`. |
| `paidAt` | no | ISO date the payment was made. |

## Response
```json
{ "total": 500, "matched": 488, "upserted": 488, "unmatched": 12, "dryRun": false, "errors": ["row 20: no taxpayer matches RC RC999000."] }
```

## Behaviour
- **Idempotent** — one row per (taxpayer, taxType, year, period); re-sync overwrites. Safe to run nightly.
- **Match, don't create** — only updates existing BIZDATA taxpayers; unmatched rows reported, never inserted.
- **Dry run** with `?dryRun=true` first.
- Audit-logged (`SYNC_TAX_PAYMENTS`).

## Where it shows
The values populate the **Tax cards** ("paid" column) and totals in the
per-customer AI Tax Report (case page → **AI Tax Report**, or
`GET /taxpayers/:id/tax-report`). Staff can also record a payment manually via
`POST /taxpayers/:id/tax-payment`.
