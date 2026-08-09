import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Linking, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, type, space, layout } from '../../src/components/tokens';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { Card } from '../../src/components/ui/Card';
import { SectionHeader } from '../../src/components/ui/SectionHeader';
import { PrimaryButton } from '../../src/components/ui/PrimaryButton';
import { IconCircle } from '../../src/components/ui/IconCircle';
import { Chip } from '../../src/components/ui/Chip';
import { Banner } from '../../src/components/ui/Banner';
import { pendingCaptureCount, ensureVoiceInbox } from '../../src/lib/voiceDrain';
import { SectionCard } from '../../src/components/ui/SectionCard';
import { SecondaryButton } from '../../src/components/ui/SecondaryButton';
import {
  VOICE_PHRASE_EXAMPLES, VOICE_SHORTCUT_PRIVACY, VOICE_COMMANDS, VOICE_ONE_WAY_NAME,
  VOICE_FIELD_RULES, VOICE_FIRST_RUN_NOTE, SHORTCUTS_APP_URL, type VoiceCommand,
} from '../../src/lib/voiceShortcut';

/**
 * Setting up "Hey Siri, log expense" — the capture path that never opens the app.
 *
 * All the explanatory content comes from `lib/voiceShortcut.ts`, shared with the Help screen
 * so the two can't drift. This screen is the wiring: create the folder the Shortcut needs,
 * show how many captures are waiting, and hand off to Shortcuts.
 */
export default function VoiceSetupScreen() {
  const router = useRouter();
  const [waiting, setWaiting] = useState(0);
  // Which command's manual steps are open. Collapsed by default: the steps are the fallback,
  // not the thing to read first.
  const [openSteps, setOpenSteps] = useState<string | null>(null);

  // Creating the folder is the one thing the app must do before setup can succeed: the
  // Shortcuts folder picker can only choose a folder that already exists.
  useEffect(() => {
    ensureVoiceInbox();
    setWaiting(pendingCaptureCount());
  }, []);

  // One tap per command. Falls back to opening Shortcuts on a new shortcut, so even the
  // manual path starts with a tap rather than "go and find another app".
  async function install(cmd: VoiceCommand) {
    try {
      await Linking.openURL(cmd.installUrl ?? SHORTCUTS_APP_URL);
    } catch {
      Alert.alert(
        'Couldn\'t open Shortcuts',
        'Open the Shortcuts app yourself, then follow "Build it by hand" below.',
      );
    }
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Voice entry" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Card padded style={styles.hero}>
          <IconCircle icon="mic" size={56} iconSize={22} color={colors.accent} bg={colors.accentMuted} />
          <Text style={styles.heroTitle}>{`“Hey Siri, ${VOICE_ONE_WAY_NAME}”`}</Text>
          <Text style={styles.heroBody}>
            Say what you spent without unlocking or opening anything. Siri repeats it back so
            you know it heard you, and BudgetSplit files it the next time you open the app.
          </Text>
        </Card>

        {waiting > 0 && (
          <Banner
            icon="inbox"
            text={`${waiting} capture${waiting === 1 ? '' : 's'} waiting — filed when you next open the app`}
            tone={colors.accent}
            inset={false}
          />
        )}

        <SectionHeader title="Try saying" />
        <View style={styles.examples}>
          {VOICE_PHRASE_EXAMPLES.map(e => (
            <Chip key={e} label={e} icon="message-circle" maxWidth={280} />
          ))}
        </View>

        {/* Two phrases rather than one clever one: the mode is chosen by what you SAY, so it
            is never inferred wrongly from your wording. Each command owns its own install
            button and its own fallback steps — a single button for two shortcuts left it
            ambiguous which one you were getting. */}
        <SectionHeader title="Set up the two commands" />
        {VOICE_COMMANDS.map(c => (
          <View key={c.name} style={styles.cmdBlock}>
            <Card padded>
              <View style={styles.cmdHead}>
                <IconCircle icon={c.icon} size={32} iconSize={14} color={colors.accent} />
                <View style={styles.stepText}>
                  <Text style={styles.stepTitle}>{`“Hey Siri, ${c.name}”`}</Text>
                  <Text style={styles.cmdSummary}>{c.summary}</Text>
                </View>
              </View>
              <Text style={styles.stepBody}>{c.detail}</Text>
              <PrimaryButton
                label={c.installUrl ? `Add “${c.name}”` : 'Open Shortcuts'}
                onPress={() => install(c)}
                style={styles.cmdCta}
              />
              {c.installUrl != null && (
                <Text style={styles.note}>
                  Tap <Text style={styles.strong}>Add Shortcut</Text> on the sheet Apple shows.
                  That's the whole setup.
                </Text>
              )}
            </Card>

            {/* The manual build stays available but collapsed: it is the fallback if the
                link ever stops resolving, not the thing to read first. */}
            <SectionCard
              title="Build it by hand instead"
              subtitle={`${c.steps.length} steps`}
              expanded={openSteps === c.name}
              onToggle={() => setOpenSteps(openSteps === c.name ? null : c.name)}
            >
              {c.steps.map((st, i) => (
                <View key={st.title} style={[styles.step, i > 0 && styles.stepBorder]}>
                  <Text style={styles.stepNum}>{i + 1}</Text>
                  <View style={styles.stepText}>
                    <Text style={styles.stepTitle}>{st.title}</Text>
                    <Text style={styles.stepBody}>{st.body}</Text>
                  </View>
                </View>
              ))}
            </SectionCard>
          </View>
        ))}

        <Text style={styles.note}>{VOICE_FIRST_RUN_NOTE}</Text>
        <Text style={styles.note}>{VOICE_SHORTCUT_PRIVACY}</Text>

        <SectionHeader title="Inside the app" />
        <Text style={styles.body}>
          You can also dictate on the Add screen — tap the field and use the microphone on
          your keyboard. Same result, same on-device dictation; it just needs the app open.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, paddingBottom: space.xxl },
  hero: { alignItems: 'center', gap: space.sm },
  heroTitle: { ...type.heading, color: colors.textPrimary, textAlign: 'center' },
  heroBody: { ...type.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  examples: { gap: space.sm, alignItems: 'flex-start' },
  body: { ...type.body, color: colors.textSecondary, lineHeight: 20, marginBottom: space.sm },
  note: { ...type.caption, color: colors.textMuted, lineHeight: 16, marginTop: space.sm },
  strong: { ...type.captionSemi, color: colors.textSecondary },
  step: { flexDirection: 'row', gap: space.md, padding: space.md },
  stepBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  stepNum: { ...type.labelSemi, color: colors.accent, width: 16 },
  stepText: { flex: 1, gap: 2 },
  stepTitle: { ...type.bodySemi, color: colors.textPrimary },
  stepBody: { ...type.caption, color: colors.textMuted, lineHeight: 16 },
  cmdSummary: { ...type.captionSemi, color: colors.accent },
  cmdBlock: { gap: space.sm, marginBottom: space.md },
  cmdHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.sm },
  cmdCta: { marginTop: space.md },
  stepsHeading: { ...type.labelSemi, color: colors.textSecondary, marginTop: space.md, marginBottom: space.sm },
});
