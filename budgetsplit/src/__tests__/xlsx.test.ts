import { zipSync, strToU8 } from 'fflate';
import { readXlsx } from '../lib/xlsx';

/** Build a real .xlsx in memory so the reader is tested against actual ZIP+XML. */
function makeXlsx(sheets: { name: string; xml: string }[], sharedStrings?: string[]): Uint8Array {
  const files: Record<string, Uint8Array> = {
    'xl/workbook.xml': strToU8(
      `<workbook><sheets>${sheets
        .map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join('')}</sheets></workbook>`,
    ),
  };
  sheets.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(s.xml); });
  if (sharedStrings) {
    files['xl/sharedStrings.xml'] = strToU8(
      `<sst>${sharedStrings.map(s => `<si><t>${s}</t></si>`).join('')}</sst>`,
    );
  }
  return zipSync(files);
}

const sheetXml = (rows: string[]) => `<worksheet><sheetData>${rows.join('')}</sheetData></worksheet>`;

describe('readXlsx', () => {
  it('reads inline and shared strings, and numeric cells', () => {
    const xlsx = makeXlsx(
      [{
        name: 'Data',
        xml: sheetXml([
          '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>',
          '<row r="2"><c r="A2" t="inlineStr"><is><t>inline</t></is></c><c r="B2"><v>42.5</v></c></row>',
        ]),
      }],
      ['Header A', 'Header B'],
    );
    const sheets = readXlsx(xlsx);
    expect(sheets).toHaveLength(1);
    expect(sheets[0].name).toBe('Data');
    expect(sheets[0].rows).toEqual([
      ['Header A', 'Header B'],
      ['inline', '42.5'],
    ]);
  });

  it('keeps column alignment when cells are missing', () => {
    // B and C are absent — D must still land at index 3.
    const xlsx = makeXlsx([{
      name: 'Sparse',
      xml: sheetXml(['<row r="1"><c r="A1" t="inlineStr"><is><t>a</t></is></c><c r="D1" t="inlineStr"><is><t>d</t></is></c></row>']),
    }]);
    expect(readXlsx(xlsx)[0].rows[0]).toEqual(['a', '', '', 'd']);
  });

  it('handles multi-letter columns and self-closing cells', () => {
    const xlsx = makeXlsx([{
      name: 'Wide',
      xml: sheetXml(['<row r="1"><c r="A1"/><c r="AA1" t="inlineStr"><is><t>27th</t></is></c></row>']),
    }]);
    const row = readXlsx(xlsx)[0].rows[0];
    expect(row).toHaveLength(27);
    expect(row[26]).toBe('27th');
  });

  it('joins rich-text runs and unescapes entities', () => {
    // Excel splits a styled string across <r><t> runs, so a shared string is not
    // always a single <t>. The second string exercises entity unescaping.
    const xlsx = zipSync({
      'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="S" sheetId="1"/></sheets></workbook>'),
      'xl/worksheets/sheet1.xml': strToU8(sheetXml(['<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>'])),
      'xl/sharedStrings.xml': strToU8(
        '<sst><si><r><t>Chai </t></r><r><t>&amp; Snacks</t></r></si>'
        + '<si><t>Tom &amp; &quot;Jerry&quot; &lt;x&gt;</t></si></sst>',
      ),
    });
    expect(readXlsx(xlsx)[0].rows[0]).toEqual(['Chai & Snacks', 'Tom & "Jerry" <x>']);
  });

  it('returns sheets in workbook tab order', () => {
    const xlsx = makeXlsx([
      { name: 'Summary', xml: sheetXml(['<row r="1"><c r="A1" t="inlineStr"><is><t>one</t></is></c></row>']) },
      { name: 'History', xml: sheetXml(['<row r="1"><c r="A1" t="inlineStr"><is><t>two</t></is></c></row>']) },
    ]);
    expect(readXlsx(xlsx).map(s => s.name)).toEqual(['Summary', 'History']);
  });

  it('throws on a zip with no worksheets', () => {
    const notXlsx = zipSync({ 'hello.txt': strToU8('hi') });
    expect(() => readXlsx(notXlsx)).toThrow(/worksheet/i);
  });

  it('throws on bytes that are not a zip at all', () => {
    expect(() => readXlsx(strToU8('this is a plain text file'))).toThrow();
  });
});
