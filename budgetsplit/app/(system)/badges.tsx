import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, type, space, layout } from '../../src/theme';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { SectionHeader } from '../../src/components/ui/SectionHeader';
import { Card } from '../../src/components/ui/Card';
import { Divider } from '../../src/components/ui/Divider';
import { SectionCard } from '../../src/components/ui/SectionCard';
import { IconCircle } from '../../src/components/ui/IconCircle';
import { InfoLabel } from '../../src/components/ui/InfoLabel';
import { AnimatedBar } from '../../src/components/ui/anim/AnimatedBar';
import { AppRefreshControl } from '../../src/components/ui/AppRefreshControl';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { BadgeBoard, badgeTint } from '../../src/components/finance/badges/BadgeBoard';
import { useScreenData } from '../../src/hooks/useScreenData';
import { useContentInset } from '../../src/hooks/useContentInset';
import { loadBadges } from '../../src/lib/badgesData';
import { backOr } from '../../src/lib/nav';
import type { Badge, BadgeGroup } from '../../src/lib/badges';

const SECTIONS: { group: BadgeGroup; title: string }[] = [
  { group: 'month', title: 'This month' },
  { group: 'milestone', title: 'Milestones' },
  { group: 'now', title: 'Right now' },
];

/**
 * Every badge, what it means, and how far you are (`U-65`). The board at the top is the one on
 * your profile; below it, one row each — the ⓘ beside a name says what earns it, the line under
 * says where you stand, and the bar shows the way to the next level or this month's target.
 */
export default function BadgesScreen() {
  const router = useRouter();
  // Fully earned badges wait in a closed box at the end; what is still in play leads (2026-09-30).
  const [showEarned, setShowEarned] = useState(false);
  const bottomPad = useContentInset();
  const { data, error, refreshing, onRefresh, reload } = useScreenData((db) => loadBadges(db), []);
  const badges = data ?? [];

  return (
    <View style={styles.container}>
      <ScreenHeader title="Badges" onBack={() => backOr(router, '/settings')} />
      {error ? <ErrorState onRetry={reload} /> : (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad }]}
          refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <BadgeBoard badges={badges} />
          {SECTIONS.map(({ group, title }) => {
            const list = badges.filter(b => b.group === group && !done(b));
            if (list.length === 0) return null;
            return (
              <View key={group}>
                <SectionHeader title={title} />
                <Card clip>
                  {list.map((b, i) => (
                    <View key={b.id}>
                      {i > 0 && <Divider indent="text" />}
                      <BadgeRow badge={b} />
                    </View>
                  ))}
                </Card>
              </View>
            );
          })}
          {badges.some(done) && (
            <SectionCard
              title="Earned"
              subtitle={`${badges.filter(done).length} at their top level`}
              icon="award"
              expanded={showEarned}
              onToggle={() => setShowEarned(v => !v)}
              style={styles.earned}
            >
              {badges.filter(done).map(b => (
                <View key={b.id}>
                  <Divider indent="text" />
                  <BadgeRow badge={b} />
                </View>
              ))}
            </SectionCard>
          )}
        </ScrollView>
      )}
    </View>
  );
}

/** Earned all the way: a one-off earned, or a milestone at its last level. */
const done = (b: Badge) => b.level >= b.maxLevel;

function BadgeRow({ badge: b }: { badge: Badge }) {
  const tint = badgeTint(b);
  return (
    <View style={styles.row}>
      <IconCircle icon={b.icon} size={layout.iconCircle} color={tint} bg={b.level > 0 ? undefined : colors.bgMuted} />
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <View style={styles.titleWrap}>
            <InfoLabel label={b.title} labelStyle={styles.title} info={b.explain} accessibilityLabel={`About ${b.title}`} />
          </View>
          {b.maxLevel > 1 && (
            <Text style={[styles.level, { color: tint }]}>{b.level > 0 ? `Level ${b.level} of ${b.maxLevel}` : 'Not yet'}</Text>
          )}
          {b.maxLevel === 1 && (
            <Text style={[styles.level, { color: tint }]}>{b.level > 0 ? 'Earned' : 'Not yet'}</Text>
          )}
        </View>
        <Text style={styles.status}>{b.status}</Text>
        <View style={styles.bar}>
          <AnimatedBar progress={b.progress} color={b.level > 0 ? tint : colors.accent} height={4} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.smd, paddingHorizontal: space.md, paddingVertical: space.smd },
  body: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  titleWrap: { flex: 1, minWidth: 0 },
  title: { ...type.bodySemi, color: colors.textPrimary },
  level: { ...type.caption },
  status: { ...type.caption, color: colors.textSecondary, marginTop: 2 },
  bar: { marginTop: space.sm },
  earned: { marginTop: space.lg },
});
