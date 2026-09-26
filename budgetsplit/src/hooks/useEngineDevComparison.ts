/**
 * Old Safe-to-Spend beside the new engine's projection, per persona and on the
 * signed-in device's own ledger — `app/dev/engine.tsx` (`EN2`,
 * `SPEC-ENGINE.md`). Own file, not the screen, per AGENTS.md's screen-thinness
 * rule: building five throwaway persona ledgers is orchestration, not view code.
 */
import { useCallback, useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import type * as SQLite from 'expo-sqlite';
import { getSafeToSpend } from '../db/queries/spendPower';
import type { SafeToSpend } from '../lib/safeToSpend';
import { getFinanceSnapshot } from '../db/queries/engineSnapshot';
import { safeToSpendV2, type SafeToSpendV2 } from '../lib/engine/assess';
import { buildPersona, PERSONA_KINDS, PERSONA_NOW, type PersonaKind } from '../db/enginePersonas';
import { openScratchDb } from '../db/engineDevDb';

export type EngineComparisonRow = {
  key: string;
  label: string;
  old: SafeToSpend;
  v2: SafeToSpendV2;
  /** Same headline figure. Expected whenever no bill falls inside the horizon
   *  (this task's accept criterion) — `false` is not a bug on its own, but
   *  every difference should be explainable from `v2.projection`'s events. */
  matches: boolean;
};

const PERSONA_LABEL: Record<PersonaKind, string> = {
  salariedRenter: 'Salaried renter (school fee)',
  freelancer: 'Freelancer (irregular income)',
  student: 'Student (allowance)',
  thinData: 'Thin data (2 months)',
  diwaliSpike: 'Diwali spike (14 months)',
};

async function compareOn(db: SQLite.SQLiteDatabase, nowMs: number, key: string, label: string): Promise<EngineComparisonRow> {
  const [snapshot, old] = await Promise.all([getFinanceSnapshot(db, nowMs), getSafeToSpend(db, nowMs)]);
  const v2 = safeToSpendV2(snapshot);
  return { key, label, old, v2, matches: old.amount === v2.amount };
}

export function useEngineDevComparison() {
  const realDb = useSQLiteContext();
  const [rows, setRows] = useState<EngineComparisonRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    setError(null);
    try {
      const mine = await compareOn(realDb, Date.now(), 'mine', 'My ledger');
      const personaRows = await Promise.all(PERSONA_KINDS.map(async kind => {
        const db = await openScratchDb();
        await buildPersona(db, kind);
        return compareOn(db, PERSONA_NOW, kind, PERSONA_LABEL[kind]);
      }));
      setRows([mine, ...personaRows]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [realDb]);

  useEffect(() => { load(); }, [load]);

  return { rows, error, reload: load };
}
