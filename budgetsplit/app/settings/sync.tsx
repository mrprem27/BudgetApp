import React from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, type, space, layout } from '../../src/theme';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { Card } from '../../src/components/ui/Card';
import { ListRow } from '../../src/components/ui/ListRow';
import { Divider } from '../../src/components/ui/Divider';
import { Banner } from '../../src/components/ui/Banner';
import { serverConfigured } from '../../src/lib/serverApi';
import { useServerSession } from '../../src/hooks/useServerSession';
import { useSyncInvites } from '../../src/hooks/useSyncInvites';
import { SyncStatus } from '../../src/components/system/SyncStatus';

/**
 * What syncing actually means for you — said plainly, in one place.
 *
 * This screen exists because the honest answers are surprising, and each is
 * something a user would otherwise find out by being wrong about it: everything
 * goes to the account, the server can read it, nobody else's entry moves your
 * numbers without your say-so, and it isn't a live connection.
 *
 * There is no switch. Signing in is what joins a phone to its account
 * (first sign-in, `SPEC-SERVER.md` §4) and signing out is what leaves it; a
 * second control that could say "off" while the account still held everything
 * would be one more thing that looks like a promise and isn't.
 */
export default function SyncScreen() {
  const router = useRouter();
  const { session } = useServerSession();
  const configured = serverConfigured();

  const { invites, joining, accept } = useSyncInvites();

  return (
    <View style={styles.container}>
      <ScreenHeader title="Sync" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Where this phone's data stands (SPEC-SERVER.md §6.1). Draws nothing
            when signed out; the Banner below says what to do then. */}
        <SyncStatus />
        {!configured ? (
          <Banner icon="cloud-off" text="This build has no server configured, so there is nothing to sync to." />
        ) : !session ? (
          <Banner
            icon="user"
            text="Sign in first — sync is your account, on every phone you sign in on."
            actionLabel="Account"
            onAction={() => router.push('/settings/account')}
          />
        ) : null}

        {/*
          Invitations sit at the top because they are the one thing here that
          someone else is waiting on. Accepting is what makes a group start
          arriving — an invitation never answered looks identical to sync not
          working.
        */}
        {invites.length > 0 && (
          <>
            <Text style={styles.heading}>Waiting for you</Text>
            <Card>
              {invites.map((g, i) => (
                <View key={g.memberId}>
                  {i > 0 && <Divider indent="none" />}
                  <ListRow
                    icon="user-plus"
                    title={g.invitedBy ? `${g.invitedBy} invited you to ${g.groupName}` : `You're invited to ${g.groupName}`}
                    subtitle="Accepting starts sharing this group's entries between you."
                    variant="stacked"
                    chevron={false}
                    value={joining === g.memberId
                      ? <ActivityIndicator color={colors.accent} />
                      : <Text style={styles.accept}>Accept</Text>}
                    onPress={joining ? undefined : () => accept(g)}
                  />
                </View>
              ))}
            </Card>
          </>
        )}

        {/*
          `B-102`/`DQ-102`: trimmed from a "What this does" card of four
          multi-sentence Facts plus a footnote to the two lines that state a
          real constraint a decision depends on (§14: cut restated context,
          keep what the user needs to decide with). The sign-out warning that
          used to live in the footnote already fires contextually, at sign-out
          itself (`DQ-97`) — restating it here was the redundant half.
        */}
        <Text style={styles.footnote}>
          Your account's copy is stored readable, not sealed — that's what lets it check who may
          change what in a shared group. An entry someone else adds moves none of your numbers
          until you accept it, unless you've marked them trusted.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: layout.screenPaddingH, paddingBottom: space.xl },
  heading: { ...type.sectionLabel, color: colors.textSecondary, marginTop: space.lg, marginBottom: space.sm },
  accept: { ...type.button, color: colors.accent },
  footnote: { ...type.caption, color: colors.textMuted, lineHeight: 18, marginTop: space.lg },
});
