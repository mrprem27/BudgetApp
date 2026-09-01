import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { getGroupById } from '../../../src/db/queries/groups';
import { isGlobalBudgetGroup } from '../../../src/lib/budget';
import { BudgetEditor } from '../../../src/components/finance/budget/BudgetEditor';
import { ScreenHeader } from '../../../src/components/ui/ScreenHeader';
import { SkeletonCard } from '../../../src/components/ui/Skeleton';
import { colors, space, layout } from '../../../src/theme';

/**
 * One group's budget — the admin's default and your own override of it.
 *
 * The personal group forwards to `/budget`: its lines are My Budget, so a
 * "Group default / Mine" control over them would be offering a choice between one
 * person and the same person. Mirrors `group/[id].tsx`, which already replaces
 * itself with `/personal`.
 */
export default function GroupBudgetScreen() {
  const { id, category } = useLocalSearchParams<{ id: string; category?: string }>();
  const router = useRouter();
  const db = useSQLiteContext();
  const [isPersonal, setIsPersonal] = React.useState<boolean | null>(null);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    (async () => {
      const g = await getGroupById(db, id);
      if (!alive) return;
      const personal = !!g && isGlobalBudgetGroup(g);
      setIsPersonal(personal);
      if (personal) router.replace(category ? `/budget?category=${encodeURIComponent(category)}` : '/budget');
    })();
    return () => { alive = false; };
  }, [db, id, category, router]);

  /*
   * The group editor must never flash before forwarding — but a bare `null` is a
   * blank screen with a header-less void under it, and this route is reached from a
   * tap that just pushed a screen. A skeleton says "this is loading" for the frame
   * or two the group lookup takes, and shows the same header you are about to get,
   * so nothing jumps when it resolves.
   */
  if (!id || isPersonal !== false) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Budget" onBack={() => router.back()} />
        <View style={styles.skeleton}>
          <SkeletonCard height={92} />
          <SkeletonCard height={64} />
          <SkeletonCard height={64} />
        </View>
      </View>
    );
  }

  return (
    <BudgetEditor
      scope="group"
      groupId={id}
      focusCategory={category ? decodeURIComponent(category) : undefined}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  skeleton: { padding: layout.screenPaddingH, gap: space.md },
});
