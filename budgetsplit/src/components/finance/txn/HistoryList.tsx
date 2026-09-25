import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space } from '../../tokens';
import { Card } from '../../ui/Card';
import { IconCircle } from '../../ui/IconCircle';
import { dateTime } from '../../../lib/dateFormat';
import type { AuditAction } from '../../../constants/enums';

export type HistoryItem = { id: string; action: AuditAction; text: string; at: number };

const ACTION_META: Record<AuditAction, { icon: keyof typeof Feather.glyphMap; color: string }> = {
  created:  { icon: 'plus-circle', color: colors.income },
  updated:  { icon: 'edit-2', color: colors.accent },
  deleted:  { icon: 'trash-2', color: colors.expense },
  archived: { icon: 'archive', color: colors.textMuted },
  settled:  { icon: 'check-circle', color: colors.settle },
  paused:   { icon: 'pause-circle', color: colors.healthAmber },
  resumed:  { icon: 'play-circle', color: colors.income },
  ended:    { icon: 'x-circle', color: colors.textMuted },
};

/**
 * A transaction's History timeline (SPEC-SERVER.md §6.4, layout picked in S15:
 * the existing timeline, extended). Newest first. The screen hands it the
 * server's versions, described (`lib/txnHistory`), when it has them — "Aarav
 * changed ₹400 → ₹450" — and this phone's own log otherwise.
 */
export function HistoryList({ items }: { items: HistoryItem[] }) {
  return (
    <Card style={styles.card}>
      {items.length === 0 ? (
        <Text style={styles.empty}>No changes recorded.</Text>
      ) : items.map((h, i) => {
        const meta = ACTION_META[h.action] ?? ACTION_META.updated;
        const last = i === items.length - 1;
        const d = new Date(h.at);
        return (
          <View key={h.id} style={styles.row}>
            <View style={styles.rail}>
              <IconCircle icon={meta.icon} size={22} color={meta.color} />
              {!last && <View style={styles.railLine} />}
            </View>
            <View style={[styles.content, !last && { paddingBottom: space.md }]}>
              <Text style={styles.text}>{h.text}</Text>
              <Text style={styles.time}>{isFinite(d.getTime()) ? dateTime(d) : '—'}</Text>
            </View>
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.md },
  row: { flexDirection: 'row', gap: space.sm },
  rail: { width: 24, alignItems: 'center', paddingTop: space.sm },
  railLine: { flex: 1, width: 1.5, backgroundColor: colors.border, marginTop: 2 },
  content: { flex: 1, paddingTop: space.sm },
  text: { ...type.label, color: colors.textSecondary },
  time: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  empty: { ...type.body, color: colors.textMuted, textAlign: 'center', paddingVertical: space.md },
});
