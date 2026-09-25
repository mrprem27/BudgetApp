import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, layout } from '../../tokens';
import { Card } from '../../ui/Card';
import { Divider } from '../../ui/Divider';
import { IconCircle } from '../../ui/IconCircle';
import { formatRupeesShort } from '../../../lib/money';
import { fullDate } from '../../../lib/dateFormat';

type Row = { icon: keyof typeof Feather.glyphMap; tint: string; title: string; where: string };

/**
 * The summary that replaced the fake committing checklist and the forward-only
 * payoff beat: it reads back what the answers ACTUALLY created — each row names
 * the real artifact and where in the app it now lives. Answers that were
 * skipped produce no row; an empty setup gets the honest single line instead
 * of a celebration.
 */
export function SummaryStage({
  incomeNum, firstPayDate, budgetNum, notifPerm, splits,
}: {
  incomeNum: number;
  /** Epoch ms — the exact date the salary rule's first occurrence lands. */
  firstPayDate: number;
  budgetNum: number;
  notifPerm: boolean;
  /**
   * Whether this persona splits with anyone at all (`intent !== 'personal'`).
   * Onboarding no longer asks who you split with — that question moved to
   * Friends (`SPEC-2026-09-FEEDBACK.md` §2 O6) — so there is nothing here to read back as a
   * row; someone who said they track only their own spending doesn't need a
   * pointer to a feature they just opted out of, either.
   */
  splits: boolean;
}) {
  const rows: Row[] = [];
  if (incomeNum > 0) {
    rows.push({
      icon: 'trending-up', tint: colors.income,
      title: `Salary ${formatRupeesShort(incomeNum * 100)} — next on ${fullDate(firstPayDate)}`,
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
  if (notifPerm) {
    rows.push({
      icon: 'bell', tint: colors.healthAmber,
      title: 'Reminders for upcoming charges on',
      where: 'Settings · Notifications',
    });
  }
  rows.push({
    icon: 'shield', tint: colors.income,
    title: 'Backup reminder on',
    where: 'Settings · Backup — a file you keep',
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
      {/* The one pointer to Friends, in place of the row that used to read back
          who was added there — see `splits` above for why it's a line, not a
          checkmark, and why it's gone entirely for 'personal'. */}
      {splits && (
        <Text style={styles.healthNote}>
          Add friends in Settings to split expenses.
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
