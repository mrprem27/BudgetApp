import React, { useState } from 'react';
import { format } from 'date-fns';
import { SheetModal } from '../../ui/SheetModal';
import { DateRangeSheet } from '../../ui/DateRangeSheet';
import { parseFilterDate, type ReviewFilters } from '../../../lib/reviewFilter';
import { FilterForm } from './FilterForm';
import { CategoryFilterSheet } from './CategoryFilterSheet';

/**
 * The Review filter sheet plus the two pickers it opens.
 *
 * The pickers are siblings of the filter sheet, not children, and the filter sheet's own
 * `visible` folds in "no picker is open" — the swap-don't-stack pattern of
 * `ScanPaySheet`/`QuickAddSheets`. A `SheetModal` claims the global stage the instant it
 * opens (`lib/sheetStage.ts`), which evicts whichever sheet holds it; rendered inside the
 * filter form, the date picker took the stage and the filter sheet was left without a way
 * back. Folded like this, closing a picker flips the filter sheet visible again.
 */
export function ReviewFilterSheet({ visible, onClose, filters, categories, onChange, onClear }: {
  visible: boolean;
  onClose: () => void;
  filters: ReviewFilters;
  /** Categories present in the list being filtered. */
  categories: string[];
  onChange: (f: ReviewFilters) => void;
  onClear: () => void;
}) {
  const [catOpen, setCatOpen] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  const day = (ms: number) => format(new Date(ms), 'yyyy-MM-dd');

  return (
    <>
      <SheetModal visible={visible && !catOpen && !rangeOpen} onClose={onClose} title="Filter" scroll={false}>
        <FilterForm
          filters={filters}
          onChange={onChange}
          onClear={onClear}
          onDone={onClose}
          onOpenCategories={() => setCatOpen(true)}
          onOpenRange={() => setRangeOpen(true)}
          canPickCategory={categories.length > 0}
        />
      </SheetModal>

      <CategoryFilterSheet
        visible={visible && catOpen}
        categories={categories}
        selected={filters.categories}
        onClose={() => setCatOpen(false)}
        onApply={(cats) => onChange({ ...filters, categories: cats })}
      />

      <DateRangeSheet
        visible={visible && rangeOpen}
        from={parseFilterDate(filters.dateFrom, false)}
        to={parseFilterDate(filters.dateTo, true)}
        onClose={() => setRangeOpen(false)}
        onApply={(from, to) => onChange({ ...filters, dateFrom: day(from), dateTo: day(to) })}
        onClear={() => onChange({ ...filters, dateFrom: '', dateTo: '' })}
      />
    </>
  );
}
