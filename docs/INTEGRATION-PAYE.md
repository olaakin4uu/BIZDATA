# PAYE Sync — Integration Spec (Tax App → BIZDATA)

How the KIRS Tax app pushes PAYE-registration status into BIZDATA so it can flag
corporates that are **observed earning but not PAYE-registered** (the Tax Net
"PAYE gap"). Mirrors the existing `POST /integration/declared-income` contract.

---

## Endpoint

```
POST https://findata.kirs.gov.ng/api/integration/paye
POST https://findata.kirs.gov.ng/api/integration/paye?dryRun=true   # validate only, writes nothing
```

## Auth

API-key, sent as a header. Generate a key in BIZDATA under **Integration → Keys**
(`/integration/keys`), then send it on every request:

```
x-api-key: <the partner API key>
Content-Type: application/json
```

## Request body

A JSON **array** of records (or `{ "records": [ ... ] }`). Each record identifies
a taxpayer by **RC number OR TIN** (at least one is required) and gives its PAYE
status.

```jsonc
[
  {
    "rcNumber": "RC123456",        // CAC RC number (corporate). Preferred match key.
    "tin": "01234567-0001",        // OR the TIN. One of rcNumber/tin is required.
    "payeRegNumber": "PAYE-KN-0099", // employer/PAYE registration number (optional)
    "registered": true             // true | false. Optional — see rules below.
  },
  {
    "rcNumber": "RC777888",
    "registered": false            // explicitly NOT registered for PAYE
  }
]
```

### Field reference

| Field | Required | Notes |
|---|---|---|
| `rcNumber` | one of rc/tin | CAC RC number. Aliases accepted: `cacRcNumber`, `taxpayerCacRcNumber`. Matched exactly. |
| `tin` | one of rc/tin | Taxpayer TIN. Alias: `taxpayerTin`. Matched via blind-index (no plaintext stored). |
| `payeRegNumber` | no | The employer's PAYE reg number. Aliases: `payeNumber`, `employerRegNumber`. |
| `registered` | no | `true`/`false` (also accepts `"true"`, `1`, `"REGISTERED"`). **If omitted**, defaults to `true` when a `payeRegNumber` is present, else `false`. |

### Status mapping
- `registered: true` (or a `payeRegNumber` present) → taxpayer `payeStatus = REGISTERED`
- `registered: false` → `payeStatus = NOT_REGISTERED`
- `payeSource` is set to `TAX_APP_SYNC`, `payeVerifiedAt` = now.

## Response

```jsonc
{
  "total": 1200,        // records received
  "matched": 1187,      // matched to a taxpayer in BIZDATA
  "updated": 1187,      // written (0 when dryRun=true)
  "unmatched": 13,      // no taxpayer found for that RC/TIN
  "dryRun": false,
  "errors": [           // up to 50 sample errors for the unmatched rows
    "row 44: no taxpayer matches RC RC999000."
  ]
}
```

## Behaviour / guarantees

- **Idempotent** — re-sending the same records just re-sets the same status.
  Safe to run on a schedule (e.g. nightly full sync).
- **Match, don't create** — a record only updates an *existing* BIZDATA taxpayer.
  Rows that match nothing are reported in `unmatched`/`errors`, never inserted.
  (Taxpayers arrive from provider/bank submissions, not this endpoint.)
- **Dry run first** — call with `?dryRun=true` to see `matched`/`unmatched`
  counts and validate your RC/TIN keys before writing.
- Every non-dry-run call is written to the tamper-evident audit log
  (`action: SYNC_PAYE`).

## Recommended flow for the Tax app

1. Generate an API key in BIZDATA (`/integration/keys`) — store it as a secret.
2. Nightly (or on registration change): POST the **full list** of corporate
   employers with their current PAYE status (registered + not-registered).
3. In BIZDATA, staff open **Tax Net → "⚠ PAYE gap"** to see corporates that are
   earning but still not `REGISTERED` after the sync — the enforcement worklist.

## Example (curl)

```bash
curl -X POST "https://findata.kirs.gov.ng/api/integration/paye" \
  -H "x-api-key: $BIZDATA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[
        { "rcNumber": "RC123456", "payeRegNumber": "PAYE-KN-0099", "registered": true },
        { "tin": "01234567-0001", "registered": false }
      ]'
```
