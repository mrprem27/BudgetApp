import fs from 'fs';
import path from 'path';

/**
 * U4: the UPI hand-off's own text picker (`ActionSheetIOS`) is gone — `UpiAppGrid` replaced
 * it — and every screen that hands a payment to a UPI app goes through the one shared
 * `UpiPayButton` rather than a hand-rolled destination row. `ScanPaySheet` and `TransferBody`
 * (settle-up) are the two real payer-side surfaces today; `RequestQrSheet` is the other
 * direction (a QR *we* display) and has no picker at all, so it is deliberately not a third.
 *
 * Kept as an explicit file list rather than a repo-wide grep for `ActionSheetIOS` — that
 * global is legitimately used elsewhere (`useAttachmentPicker.ts`, `useTxnDetail.ts`,
 * `app/add/itemized.tsx`), none of it UPI-related, and a blanket ban would be a false claim
 * about code this file has no business judging.
 */

const PAY_FILES = [
  '../hooks/useUpiHandoff.ts',
  '../components/finance/ScanPaySheet.tsx',
  '../components/finance/add/TransferBody.tsx',
  '../components/finance/pay/UpiPayButton.tsx',
  '../components/finance/pay/UpiAppGrid.tsx',
  '../components/finance/pay/UpiAppIcon.tsx',
];

const PAY_BUTTON_CALL_SITES = [
  '../components/finance/ScanPaySheet.tsx',
  '../components/finance/add/TransferBody.tsx',
];

describe('the UPI pay code', () => {
  it('never imports ActionSheetIOS — UpiAppGrid replaced it', () => {
    // Matches the real API surface (an import or the call itself), not a doc comment that
    // mentions the name while explaining the removal.
    const REAL_USE = /import\s*\{[^}]*\bActionSheetIOS\b|ActionSheetIOS\.\w/;
    for (const rel of PAY_FILES) {
      const src = fs.readFileSync(path.join(__dirname, rel), 'utf8');
      expect({ file: rel, usesActionSheet: REAL_USE.test(src) }).toEqual({ file: rel, usesActionSheet: false });
    }
  });

  it('renders <UpiPayButton from exactly the real payer-side surfaces', () => {
    const hits = PAY_BUTTON_CALL_SITES.map(rel => {
      const src = fs.readFileSync(path.join(__dirname, rel), 'utf8');
      return { file: rel, count: (src.match(/<UpiPayButton\b/g) || []).length };
    });
    expect(hits).toEqual(PAY_BUTTON_CALL_SITES.map(file => ({ file, count: 1 })));
  });
});
