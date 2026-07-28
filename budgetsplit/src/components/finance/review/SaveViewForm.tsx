import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { colors, space } from '../../tokens';
import { PrimaryButton } from '../../ui/PrimaryButton';
import type { Person } from '../../../db/queries/persons';
import { FChip, reviewFormStyles as styles } from './FChip';

/**
 * "Save this focus as a view" form. A view bundles the current filter with an
 * optional target group and a payer — an imported statement is often someone
 * else's, so a whole view of rows can share one payer (must be a group member).
 */
export function SaveViewForm({ groups, membersByGroup, onCancel, onSave }: {
  groups: { id: string; name: string }[];
  membersByGroup: Record<string, Person[]>;
  onCancel: () => void;
  onSave: (name: string, groupId: string | null, paidBy: string | null) => void;
}) {
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState<string | null>(null);
  const [paidBy, setPaidBy] = useState<string | null>(null);
  const members = groupId ? (membersByGroup[groupId] ?? []) : [];
  return (
    <View style={{ gap: space.md }}>
      <View>
        <Text style={styles.fLabel}>NAME</Text>
        <TextInput style={styles.fInput} value={name} onChangeText={setName} placeholder="e.g. Rohan’s UPI" placeholderTextColor={colors.textMuted} autoCorrect={false} />
      </View>
      {groups.length > 0 && (
        <View>
          <Text style={styles.fLabel}>ASSIGN TO GROUP (optional)</Text>
          <View style={styles.fChipRow}>
            <FChip label="None" on={groupId === null} onPress={() => { setGroupId(null); setPaidBy(null); }} />
            {groups.map(g => (
              <FChip key={g.id} label={g.name} on={groupId === g.id} onPress={() => { setGroupId(g.id); setPaidBy(null); }} />
            ))}
          </View>
        </View>
      )}
      {groupId && members.length > 0 && (
        <View>
          <Text style={styles.fLabel}>PAID BY (a member of the group)</Text>
          <View style={styles.fChipRow}>
            {members.map(m => (
              <FChip key={m.id} label={m.name} on={paidBy === m.id} onPress={() => setPaidBy(paidBy === m.id ? null : m.id)} />
            ))}
          </View>
        </View>
      )}
      <View style={styles.fActions}>
        <TouchableOpacity onPress={onCancel} style={styles.fClearBtn} accessibilityRole="button"><Text style={styles.fClearText}>Cancel</Text></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <PrimaryButton label="Save view" onPress={() => onSave(name, groupId, paidBy)} disabled={!name.trim()} />
        </View>
      </View>
    </View>
  );
}
