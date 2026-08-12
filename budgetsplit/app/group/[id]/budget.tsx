import React, { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { getGroupById } from '../../../src/db/queries/groups';
import { isGlobalBudgetGroup } from '../../../src/lib/budget';
import { BudgetEditor } from '../../../src/components/finance/budget/BudgetEditor';

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

  // Nothing is rendered until we know, so the group editor never flashes before
  // forwarding.
  if (!id || isPersonal !== false) return null;

  return (
    <BudgetEditor
      scope="group"
      groupId={id}
      focusCategory={category ? decodeURIComponent(category) : undefined}
    />
  );
}
