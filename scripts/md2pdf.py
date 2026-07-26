#!/usr/bin/env python3
"""Render a spec to PDF, via the shareable HTML and its print stylesheet.

    python scripts/md2pdf.py              # every document in the manifest
    python scripts/md2pdf.py master       # one, by key

There is no pandoc, WeasyPrint or LibreOffice on the build machines, but Chrome
and Edge both ship a print-to-PDF engine that honours `@media print` — so the
PDF is properly typeset from `md2html.py`'s print rules (nav dropped, 10.5pt
type, no page breaks through headings, tables or code) rather than being a
screenshot of the web layout.

Output is real vector text with embedded fonts and ToUnicode maps, so it stays
searchable and selectable.

Known limitation: Chrome's print engine does not support CSS page counters, and
its own header/footer would stamp the local `file://` path on every page, so it
is suppressed and the PDF carries **no page numbers**. The documents are cited
by section (§C.1, §D.3) rather than by page. If you need numbered pages, open
the .docx and save as PDF from Word — that footer already carries them.
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
from md2docx import MANIFEST  # noqa: E402
import md2html  # noqa: E402

BROWSERS = [
    Path(r'C:\Program Files\Google\Chrome\Application\chrome.exe'),
    Path(r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe'),
    Path(r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'),
    Path(r'C:\Program Files\Microsoft\Edge\Application\msedge.exe'),
    Path('/usr/bin/google-chrome'),
    Path('/usr/bin/chromium'),
    Path('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
]


def find_browser():
    for p in BROWSERS:
        if p.exists():
            return p
    sys.exit('No Chrome or Edge found — install one, or open the .docx and '
             '"Save as PDF" from Word instead.')


def build(key):
    html_path = md2html.build(key)                     # rebuild HTML first
    pdf_path = html_path.with_suffix('.pdf')
    browser = find_browser()
    subprocess.run(
        [str(browser), '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
         '--virtual-time-budget=10000',
         f'--print-to-pdf={pdf_path}', html_path.as_uri()],
        check=True, capture_output=True)
    pages = pdf_path.read_bytes().count(b'/Type /Page') or \
        pdf_path.read_bytes().count(b'/Type/Page')
    print(f'{key:>16}  ->  {pdf_path.relative_to(ROOT)}  '
          f'({pdf_path.stat().st_size // 1024} KB, ~{pages} pages)')
    return pdf_path


if __name__ == '__main__':
    keys = sys.argv[1:] or list(MANIFEST)
    for k in keys:
        if k not in MANIFEST:
            sys.exit(f'unknown document "{k}" — choose from: {", ".join(MANIFEST)}')
        build(k)
