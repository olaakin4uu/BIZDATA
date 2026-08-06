import sharp from 'sharp';

const esc = (s: string) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/**
 * Builds a tileable PNG watermark for Excel's native worksheet background
 * (Page Layout > Background), set via exceljs's `addBackgroundImage`. Excel
 * repeats that image automatically across the whole sheet — in every
 * direction, on every screen of scrolling, not just print — so one small
 * tile is enough; there's no need to size it to the data or place copies
 * ourselves the way a floating picture would require.
 *
 * Two diagonal lines per tile (org + officer), semi-transparent, bold —
 * mirrors the PDF/HTML watermark style used on the evidence bundle and tax
 * report so a screenshot of any of the three carries the same attribution.
 */
export async function buildExcelWatermarkPng(orgShort: string, officerName: string): Promise<Buffer> {
  const w = 820;
  const h = 460;
  const angle = -24;
  const line1 = `CONFIDENTIAL — ${esc(orgShort)}`.toUpperCase();
  const line2 = esc(officerName).toUpperCase();

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <g transform="rotate(${angle} ${w / 2} ${h / 2})" font-family="Arial, Helvetica, sans-serif" font-weight="700" fill="rgba(185,28,28,0.16)" text-anchor="middle" letter-spacing="2">
      <text x="${w / 2}" y="${h / 2 - 18}" font-size="30">${line1}</text>
      <text x="${w / 2}" y="${h / 2 + 26}" font-size="20">${line2}</text>
    </g>
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
