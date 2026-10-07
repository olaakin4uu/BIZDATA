import { BadRequestException } from '@nestjs/common';
import { Workbook, type Cell, type CellValue } from 'exceljs';

/**
 * Excel (.xlsx) returns, read as CSV text so both uploaders run their usual checks
 * on them. Only .xlsx: exceljs cannot read the old binary .xls or OpenDocument .ods,
 * so those still get the Save-As-CSV advice.
 *
 * Cells come out the way the parser expects a CSV to look:
 * - dates as YYYY-MM-DD (the date parser accepts that, and it can't be misread
 *   as DD/MM vs MM/DD);
 * - numbers in full, never Excel's "1.23E+10" display;
 * - a number formatted with leading zeros (an account number kept as 0123456789
 *   by a 0000000000 format) keeps them, as shown in Excel;
 * - formulas as their last calculated result, rich text / hyperlinks as text.
 */

/** A workbook loads whole into memory; past this, ask for CSV instead. */
export const MAX_XLSX_BYTES = 15 * 1024 * 1024;

const pad = (n: number) => String(n).padStart(2, '0');
const isoDate = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

function plainNumber(n: number): string {
  if (Number.isInteger(n) && Math.abs(n) < 1e21) return BigInt(n).toString();
  return String(n);
}

function cellText(cell: Cell): string {
  const v: CellValue = cell.value;
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return isoDate(v);
  if (typeof v === 'number') {
    // Zero-padded number format (e.g. "0000000000"): keep the leading zeros Excel shows.
    // (exceljs does not apply number formats, so pad here.)
    const fmt = cell.numFmt?.trim() ?? '';
    if (/^0{2,}$/.test(fmt) && Number.isInteger(v) && v >= 0) return plainNumber(v).padStart(fmt.length, '0');
    return plainNumber(v);
  }
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    if ('richText' in v && Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('');
    if ('formula' in v || 'sharedFormula' in v) {
      const r = (v as { result?: unknown }).result;
      if (r instanceof Date) return isoDate(r);
      if (typeof r === 'number') return plainNumber(r);
      if (r === null || r === undefined || (typeof r === 'object' && 'error' in (r as object))) return '';
      return String(r);
    }
    if ('text' in v) return String((v as { text: unknown }).text ?? '');
    if ('error' in v) return '';
  }
  return String(v);
}

const csvField = (s: string) => {
  const clean = s.replace(/\u0000/g, '');
  return /[",\r\n]/.test(clean) ? `"${clean.replace(/"/g, '""')}"` : clean;
};

/** First worksheet that has data, as CSV text (header row first, as in the workbook). */
export async function xlsxToCsvText(buffer: Buffer): Promise<{ csv: string; sheetName: string; otherSheetsWithData: string[] }> {
  if (buffer.length > MAX_XLSX_BYTES) {
    throw new BadRequestException(
      `This Excel file is ${(buffer.length / 1024 / 1024).toFixed(1)} MB; Excel uploads can be up to ${MAX_XLSX_BYTES / 1024 / 1024} MB. ` +
        'For a larger return, open it in Excel, choose File → Save As → CSV (Comma delimited), and upload the .csv file.',
    );
  }
  const wb = new Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new BadRequestException(
      'This Excel file could not be opened - it may be damaged or password-protected. ' +
        'Open it in Excel, choose File → Save As → CSV (Comma delimited), and upload the .csv file.',
    );
  }
  const withData = wb.worksheets.filter((ws) => ws.actualRowCount > 0);
  const sheet = withData[0];
  if (!sheet) throw new BadRequestException('This Excel file has no data in any sheet.');

  const width = sheet.actualColumnCount || sheet.columnCount;
  const lines: string[] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    for (let c = 1; c <= width; c++) cells.push(csvField(cellText(row.getCell(c)).trim()));
    // Skip rows that are blank once read (formatting-only rows).
    if (cells.some((x) => x !== '')) lines.push(cells.join(','));
  });
  return { csv: lines.join('\n'), sheetName: sheet.name, otherSheetsWithData: withData.slice(1).map((s) => s.name) };
}
