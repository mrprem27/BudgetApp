import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, layout } from '../../tokens';
import { Card } from '../../ui/Card';
import { Divider } from '../../ui/Divider';
import { IconCircle } from '../../ui/IconCircle';
import { formatRupeesShort } from '../../../lib/money';

type Row = { icon: keyof typeof Feather.glyphMap; tint: string; title: string; where: string };

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * The summary that replaced the fake committing checklist and the forward-only
 * payoff beat: it reads back what the answers ACTUALLY created — each row names
 * the real artifact and where in the app it now lives. Answers that were
 * skipped produce no row; an empty setup gets the honest single line instead
 * of a celebration.
 */
export function SummaryStage({
  incomeNum, payday, budgetNum, people, groupName, notifPerm,
}: {
  incomeNum: number;
  payday: number;
  budgetNum: number;
  people: string[];
  groupName: string;
  notifPerm: boolean;
}) {
  const rows: Row[] = [];
  if (incomeNum > 0) {
    rows.push({
      icon: 'trending-up', tint: colors.income,
      title: `Salary ${formatRupeesShort(incomeNum * 100)} on the ${ordinal(payday)}`,
      where: 'Recurring · Plan',
    });
  }
  if (budgetNum > 0) {
    rows.push({
      icon: 'target', tint: colors.accent,
      title: `Budget ${formatRupeesShort(budgetNum * 100)}/month`,
      where: 'Home · pace bar',
    });
  }
  if (people.length > 0) {
    rows.push({
      icon: 'users', tint: colors.settle,
      title: `“${groupName}” with ${people.slice(0, 3).join(', ')}${people.length > 3 ? '…' : ''}`,
      where: 'Groups',
    });
  }
  if (notifPerm) {
    rows.push({
      icon: 'bell', tint: colors.healthAmber,
      title: 'Bill & renewal reminders on',
      where: 'Settings · Notifications',
    });
  }
  rows.push({
    icon: 'shield', tint: colors.income,
    title: 'Backup reminder on',
    where: 'Settings · Backup — everything stays on this phone',
  });

  return (
    <View>
      {rows.length > 1 ? (
        <Card clip>
          {rows.map((r, i) => (
            <View key={r.title}>
              {i > 0 && <Divider indent="text" />}
              <View style={styles.row}>
                <IconCircle icon={r.icon} size={layout.iconCircle} color={r.tint} />
                <View style={styles.mid}>
                  <Text style={styles.title} numberOfLines={2}>{r.title}</Text>
                  <Text style={styles.where}>{r.where}</Text>
                </View>
                <Feather name="check" size={16} color={colors.income} />
              </View>
            </View>
          ))}
        </Card>
      ) : (
        <Text style={styles.emptyNote}>
          Nothing set up yet — that&apos;s fine. Everything here can be added from the app whenever you want.
        </Text>
      )}
      <Text style={styles.healthNote}>
        Your money-health score unlocks as you log — the locked ring on Home shows exactly what it needs.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, paddingVertical: space.smd, minHeight: layout.rowMinHeight },
  mid: { flex: 1 },
  title: { ...type.body, color: colors.textPrimary },
  where: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  emptyNote: { ...type.body, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: space.md },
  healthNote: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginTop: space.md, paddingHorizontal: space.md, lineHeight: 16 },
});
