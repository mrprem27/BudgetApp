import React, { useState } from 'react';
import { View, Alert } from 'react-native';
import { SheetModal } from '../../ui/SheetModal';
import { Card } from '../../ui/Card';
import { ListRow } from '../../ui/ListRow';
import { Divider } from '../../ui/Divider';
import { CategoryPicker } from '../CategoryPicker';
import { PayMethodSheet } from '../add/PayMethodSheet';
import { BulkActionsSheet } from './BulkActionsSheet';
import { TXN_KIND, TXN_KIND_LABEL, type TxnKind, type PayMethod } from '../../../constants/enums';
import type { Category } from '../../../db/queries/categories';

type Props = {
  visible: boolean;
  onClose: () => void;
  count: number;
  hasGroups: boolean;
  /** The kinds present in the selection — one entry means they all agree. */
  kinds: TxnKind[];
  expenseCats: Category[];
  incomeCats: Category[];
  transferCats: Category[];
  onGroup: () => void;
  onFocus: () => void;
  onDelete: () => void;
  /** Applies one edit to every selected row and returns how many were changed. */
  onApply: (p: { category?: string; payMethod?: PayMethod | ''; kind?: TxnKind }) => number;
};

/**
 * The bulk action list and the three pickers it opens, as one unit.
 *
 * Extracted because `review.tsx` has a hard line ceiling (`sourceCounts.test.ts`) that is only
 * ever lowered — adding bulk editing inline pushed it 160 lines over, and raising the ceiling
 * is how that file got to 1354 lines the first time.
 *
 * Owning the picker visibility here rather than in the screen is the other half of it: the
 * screen only needs to know "the bulk sheet is open", not which of four overlays is currently
 * showing. Each picker closes before its Alert fires, since two stacked RN `<Modal>`s break
 * keyboard handling.
 */
export function ReviewBulkSheets({
  visible, onClose, count, hasGroups, kinds, expenseCats, incomeCats, transferCats,
  onGroup, onFocus, onDelete, onApply,
}: Props) {
  // Categories belong to a kind, so a selection spanning kinds has no one correct list. It
  // gets the expense catalog rather than a union, which would let you file an expense under
  // "Salary".
  const kind = kinds.length === 1 ? kinds[0] : 'expense';
  const categories = kind === 'income' ? incomeCats : kind === 'settlement' ? transferCats : expenseCats;

  const [catOpen, setCatOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [kindOpen, setKindOpen] = useState(false);
  const plural = (n: number) => `${n} transaction${n === 1 ? '' : 's'}`;

  return (
    <>
      <BulkActionsSheet
        visible={visible}
        onClose={onClose}
        count={count}
        hasGroups={hasGroups}
        onGroup={onGroup}
        onCategory={() => setCatOpen(true)}
        onPayMethod={() => setPayOpen(true)}
        onKind={() => setKindOpen(true)}
        onFocus={onFocus}
        onDelete={onDelete}
      />

      {/* The same picker a single row opens, so bulk and single editing cannot drift. */}
      {catOpen && (
        <CategoryPicker
          categories={categories}
          value={null}
          forceOpen
          hideTrigger
          onClose={() => setCatOpen(false)}
          onChange={(c) => {
            const n = onApply({ category: c.name });
            setCatOpen(false);
            Alert.alert('Category set', `${c.name} applied to ${plural(n)}.`);
          }}
        />
      )}

      <PayMethodSheet
        visible={payOpen}
        onClose={() => setPayOpen(false)}
        value=""
        onChange={(m) => {
          const n = onApply({ payMethod: m });
          setPayOpen(false);
          Alert.alert('Payment method set', `Applied to ${plural(n)}.`);
        }}
      />

      <SheetModal visible={kindOpen} onClose={() => setKindOpen(false)} title="Change kind" scroll={false}>
        <Card clip>
          {TXN_KIND.map((k, i) => (
            <View key={k}>
              {i > 0 && <Divider indent="text" />}
              <ListRow
                title={TXN_KIND_LABEL[k]}
                chevron={false}
                onPress={() => {
                  // A category belongs to one kind, so carrying it across would leave rows
                  // filed under a category their new kind does not have.
                  const n = onApply({ kind: k, category: '' });
                  setKindOpen(false);
                  Alert.alert(
                    'Kind changed',
                    `${plural(n)} set to ${TXN_KIND_LABEL[k]}. Their categories were cleared — a category belongs to one kind.`,
                  );
                }}
              />
            </View>
          ))}
        </Card>
      </SheetModal>
    </>
  );
}
