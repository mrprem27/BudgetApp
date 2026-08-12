import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { BudgetEditor } from '../src/components/finance/budget/BudgetEditor';

/**
 * **My Budget** — the global one.
 *
 * A route with no group id, deliberately. Addressing a global concept by the
 * personal group's id is what forced every caller to resolve an id it had no
 * business knowing, and two of them fell back to `groups[0]` — so "Set a monthly
 * budget" could open a *shared* group's editor and Save would write everyone's
 * default. There is no id here to get wrong.
 */
export default function MyBudgetScreen() {
  const { category } = useLocalSearchParams<{ category?: string }>();
  return (
    <BudgetEditor
      scope="global"
      focusCategory={category ? decodeURIComponent(category) : undefined}
    />
  );
}
