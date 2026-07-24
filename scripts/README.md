# scripts

## `md2docx.py` — render the integration specs to Word

The counterparty-facing integration specifications live in [docs/](../docs/) as
Markdown, which is the **source of truth**. The `.docx` files that get emailed to
the Tax System and MDA Revenue Application teams are build outputs, regenerated
from that Markdown — they are gitignored (`*.docx`) and should never be edited
directly.

```bash
pip install python-docx        # one-off

python scripts/md2docx.py                  # rebuild all three
python scripts/md2docx.py overview         # rebuild one, by key
python scripts/md2docx.py tax-system mda-revenue-app
```

| Key | Source | Output |
|---|---|---|
| `master` | six documents, see below | `BIZDATA-Revenue-Integration-Dossier.docx` |
| `combined` | `docs/INTEGRATION-REVENUE-DATA-REQUIREMENTS.md` | `BIZDATA-Revenue-Data-Requirements.docx` |
| `tax-system` | `docs/INTEGRATION-TAX-SYSTEM.md` | `BIZDATA-A-Tax-System-Data-Requirements.docx` |
| `mda-revenue-app` | `docs/INTEGRATION-MDA-REVENUE-APP.md` | `BIZDATA-B-MDA-Revenue-App-Data-Requirements.docx` |
| `overview` | `docs/INTEGRATION-OVERVIEW.md` | `BIZDATA-Revenue-Integration-Overview.docx` |

Cover text, version string and footer for each document come from the `MANIFEST`
dict at the top of the script — **bump the version there when you revise a
spec**, since the Markdown's own version table and the cover are not linked.

### The `master` dossier

A manifest entry may carry `srcs` (a list of `(path, label)` pairs) instead of a
single `src`. `load_markdown()` concatenates them, replacing each document's own
`# Title` with the manifest label so it renders as a titled divider. `master`
uses this to put every integration document in one file:

| | Document |
|---|---|
| Overview | `INTEGRATION-OVERVIEW.md` |
| Requirements | `INTEGRATION-REVENUE-DATA-REQUIREMENTS.md` |
| Annex A | `INTEGRATION-PAYE.md` |
| Annex B | `INTEGRATION-TAX-PAYMENTS.md` |
| Annex C | `COMPLIANCE-MAPPING.md` |
| Annex D | `LEGAL-BRIEF-PROVIDER-PENALTIES.md` |

**Deliberately excluded**, and why:

- `INTEGRATION-TAX-SYSTEM.md` and `INTEGRATION-MDA-REVENUE-APP.md` — already
  contained in the combined requirements spec; including them would duplicate
  roughly 2,500 lines.
- `DEPLOYMENT-RUNBOOK.md` and `BRIS-BUILD-STATUS.md` — internal operations and
  build status, not interface material, and not something to hand a counterparty.

### Why not pandoc

Neither pandoc nor LibreOffice is installed on the build machines, so the script
depends only on `python-docx`. It handles the Markdown subset these documents
actually use: headings, paragraphs, tables (including `\|` escapes), fenced code
blocks, blockquotes, bullet / numbered / checkbox lists, horizontal rules, and
inline bold, italic, code and links. It is **not** a general-purpose converter —
nested tables, images, footnotes and reference-style links are not supported and
will pass through as literal text.

### Adding a document

Add an entry to `MANIFEST` with `src`, `out`, `subtitle`, `tagline` and `meta`.
No other change is needed.

---

## `combine_specs.py` — build the combined specification

The two counterparty documents are the **source of truth**. The combined
specification is generated from them, so the three cannot drift apart:

```bash
python scripts/combine_specs.py     # regenerate the combined Markdown
python scripts/md2docx.py           # then re-render every .docx
```

| | |
|---|---|
| Reads | `docs/INTEGRATION-TAX-SYSTEM.md`, `docs/INTEGRATION-MDA-REVENUE-APP.md` |
| Writes | `docs/INTEGRATION-REVENUE-DATA-REQUIREMENTS.md` — **generated, do not hand-edit** |

It splices the endpoint specifications into one document, states the transport
conventions and the cross-system identity requirement **once** rather than
twice, and renumbers every section reference to match:

| Source | Becomes |
|---|---|
| Document A `C.1`–`C.17` | Part C, unchanged |
| Document A `C.18` (TIN resolution) | Part E, merged with Document B `C.4` |
| Document B `C.1`–`C.3`, `C.5`–`C.9` | Part D, renumbered `D.1`–`D.8` |
| Document B `C.4` (payer identity) | Part E, merged with Document A `C.18` |
| Either document's Part D (security) | Part F |
| Either document's Part E (acceptance) | Part G, split per counterparty |

The build validates itself — it reports the heading and cross-reference counts,
and a companion check confirms no reference points at a section that does not
exist. **When editing the sources, keep the `## C.n Title` heading format**; the
splice locates sections by those headings and by the `# PART x` boundaries.

### Which version to send

| Audience | Send |
|---|---|
| Internal review, the authority, or one supplier owning both systems | the combined document |
| One vendor team who should not receive the other's requirements | Document A or B |

---

## `md2html.py` — render a shareable web document

```bash
python scripts/md2html.py                # the combined spec
python scripts/md2html.py tax-system     # any md2docx MANIFEST key
```

Writes a **single self-contained `.html`** to `build/` (gitignored) — all CSS and
JS inlined, no external requests, so it works offline, as an email attachment, or
published to a shareable URL.

It reuses `md2docx.py`'s `MANIFEST`, so a document added there is renderable here
with no further change.

Features worth knowing about:

- **Navigation rail** with scroll-spy, collapsing to a Contents button under
  1020px.
- **Section numbers set in the margin** (`§C.1`, `§D.3`) on wide viewports —
  these are the citable references other documents point at, so they are given
  the prominence a statutory instrument would give them.
- **Print stylesheet** — the rail and toolbar drop out, type reflows to 10.5pt,
  and headings, tables and code blocks avoid breaking across pages. "Print /
  Save as PDF" is the practical route to a PDF, since no PDF toolchain is
  installed here.
- **Light and dark themes**, following the OS preference and any explicit
  viewer toggle.
- The leading metadata table becomes the document's front matter rather than a
  data grid.

---

## `md2pdf.py` — render to PDF

```bash
python scripts/md2pdf.py            # every document
python scripts/md2pdf.py master     # one, by key
```

Rebuilds the HTML, then drives **headless Chrome or Edge** to print it through
the print stylesheet. There is no pandoc, WeasyPrint or LibreOffice here, but
every Windows machine has Edge — so this needs no new dependency. The output is
real vector text with embedded fonts and ToUnicode maps, so it stays searchable
and selectable; it is not a screenshot of the web layout.

| Document | Pages |
|---|---|
| `master` | ~100 |
| `combined` | ~75 |
| `tax-system` | ~51 |
| `mda-revenue-app` | ~34 |
| `overview` | ~4 |

**Known limitation — no page numbers.** Chrome's print engine does not support
CSS page counters, and its own header/footer would stamp the local `file://`
path on every page, so that is suppressed. These documents are cited by section
(`§C.1`, `§D.3`) rather than by page, which is why those numbers are set in the
margin. If you need numbered pages, open the `.docx` and save as PDF from Word —
that footer already carries them.

## Full rebuild

```bash
python scripts/combine_specs.py     # regenerate the combined Markdown
python scripts/md2docx.py           # five .docx
python scripts/md2pdf.py            # five .html + five .pdf into build/
```
