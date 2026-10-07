import { Workbook } from 'exceljs';
import { xlsxToCsvText } from './spreadsheet-to-csv';
import { detectSpreadsheetKind, parseCsvText } from './submission-parser';

async function workbook(build: (wb: Workbook) => void): Promise<Buffer> {
  const wb = new Workbook();
  build(wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('xlsxToCsvText', () => {
  it('reads the first sheet with data as CSV the parser accepts', async () => {
    const buf = await workbook((wb) => {
      const ws = wb.addWorksheet('Returns');
      ws.addRow(['accountNumber', 'bvn', 'customerName', 'transactionDate', 'amount', 'total']);
      const r = ws.addRow([123456789, 22233344455, 'Bello, Abubakar', new Date(Date.UTC(2026, 6, 14)), 1500000.5, null]);
      r.getCell(1).numFmt = '0000000000';
      r.getCell(6).value = { formula: 'E2*2', result: 3000001 } as never;
      ws.addRow([987654321, 12345678901, { richText: [{ text: 'Zainab ' }, { text: '"ZZ" Ltd' }] }, new Date(Date.UTC(2026, 8, 30)), 2000, null]);
      ws.addRow([]);
      wb.addWorksheet('Notes').addRow(['ignore me']);
    });
    expect(detectSpreadsheetKind(buf)).toBe('xlsx');

    const out = await xlsxToCsvText(buf);
    expect(out.sheetName).toBe('Returns');
    expect(out.otherSheetsWithData).toEqual(['Notes']);

    const { headers, rows } = parseCsvText(out.csv);
    expect(headers).toEqual(['accountNumber', 'bvn', 'customerName', 'transactionDate', 'amount', 'total']);
    expect(rows).toHaveLength(2);
    // Leading zeros kept from a zero-padded format; long numbers in full; ISO dates.
    expect(rows[0]).toMatchObject({ accountNumber: '0123456789', bvn: '22233344455', customerName: 'Bello, Abubakar', transactionDate: '2026-07-14', amount: '1500000.5', total: '3000001' });
    expect(rows[1]).toMatchObject({ accountNumber: '987654321', bvn: '12345678901', customerName: 'Zainab "ZZ" Ltd', transactionDate: '2026-09-30', total: '' });
  });

  it('skips a leading empty sheet', async () => {
    const buf = await workbook((wb) => {
      wb.addWorksheet('Blank');
      wb.addWorksheet('Data').addRow(['a', 'b']);
    });
    expect((await xlsxToCsvText(buf)).sheetName).toBe('Data');
  });

  it('refuses a workbook with no data', async () => {
    const buf = await workbook((wb) => { wb.addWorksheet('Empty'); });
    await expect(xlsxToCsvText(buf)).rejects.toThrow('no data');
  });
});
