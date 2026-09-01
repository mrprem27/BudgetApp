import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SheetModal } from '../ui/SheetModal';
import { OptionRow } from '../ui/OptionRow';
import { space } from '../tokens';
import { trustMeans, reviewMeans, trustStateLabel } from '../../lib/trustCopy';

/** `null` = no opinion here, so this group follows the person-level setting. */
export type TrustChoice = 'trusted' | 'review' | null;

/**
 * Pick what happens to someone's entries — globally, or in one group.
 *
 * ## Why a sheet and not a tap-cycle
 *
 * The per-group control was a bare row that cycled trusted → waits → cleared on
 * successive taps, with no legend anywhere. Two of its three states were therefore
 * undiscoverable, and the third — clearing the exception — is the one AGENTS §13
 * requires to stay reachable, because "trusted everywhere except the trip" must not
 * become a one-way door. A control that hides the state you are required to be able
 * to reach is not a control.
 *
 * All three are listed, each with the sentence that says what it does, from
 * `lib/trustCopy` so this screen cannot drift from the approvals queue again.
 *
 * `OptionRow` already is this shape — label, description, single-select radio — and
 * lived in `ui/` used only by Onboarding.
 */
export function TrustSheet({
  visible, onClose, name, scope, value, inherited, onChoose,
}: {
  visible: boolean;
  onClose: () => void;
  name: string;
  /** A group name for an exception, or null for the person-level setting. */
  scope: string | null;
  value: TrustChoice;
  /** The person-level answer, spelled out on the "follow it" option. */
  inherited: 'trusted' | 'review';
  onChoose: (next: TrustChoice) => void;
}) {
  const pick = (next: TrustChoice) => { onChoose(next); onClose(); };

  return (
    <SheetModal
      visible={visible}
      onClose={onClose}
      title={scope ? `${name} in ${scope}` : `${name}'s entries`}
    >
      <View style={styles.list}>
        <OptionRow
          label={trustStateLabel('trusted')}
          description={trustMeans(name)}
          selected={value === 'trusted'}
          onPress={() => pick('trusted')}
        />
        <OptionRow
          label={trustStateLabel('review')}
          description={reviewMeans(name)}
          selected={value === 'review'}
          onPress={() => pick('review')}
        />
        {/*
          * Only for an exception. At person level there is no "no opinion" — one of
          * the two answers above is always in force, and offering a third would be
          * offering to unset something that cannot be unset.
          */}
        {scope !== null && (
          <OptionRow
            label="Follow the main setting"
            description={`Whatever you choose for ${name} everywhere — currently “${trustStateLabel(inherited)}”.`}
            selected={value === null}
            onPress={() => pick(null)}
          />
        )}
      </View>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.sm, paddingBottom: space.sm },
});
