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
import {
  VOICE_SHORTCUT_URL, VOICE_SHORTCUT_STEPS, VOICE_TWO_WAY_STEPS, VOICE_FILES_LOCATION,
  VOICE_PHRASE_EXAMPLES, VOICE_SHORTCUT_PRIVACY, VOICE_COMMANDS, VOICE_ONE_WAY_NAME,
  VOICE_FIELD_RULES, SHORTCUTS_APP_URL,
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

  // Creating the folder is the one thing the app must do before setup can succeed: the
  // Shortcuts folder picker can only choose a folder that already exists.
  useEffect(() => {
    ensureVoiceInbox();
    setWaiting(pendingCaptureCount());
  }, []);

  // With an install link this is one tap and done; without one it still opens Shortcuts, so
  // the manual path starts with a tap rather than "go and find another app".
  async function install() {
    try {
      await Linking.openURL(VOICE_SHORTCUT_URL ?? SHORTCUTS_APP_URL);
    } catch {
      Alert.alert('Couldn\'t open Shortcuts', 'Open the Shortcuts app manually and follow the steps below.');
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
            is never inferred wrongly from your wording. */}
        <SectionHeader title="Two commands" />
        <Card clip>
          {VOICE_COMMANDS.map((c, i) => (
            <View key={c.name} style={[styles.step, i > 0 && styles.stepBorder]}>
              <IconCircle icon={i === 0 ? 'zap' : 'external-link'} size={32} iconSize={14} color={colors.accent} />
              <View style={styles.stepText}>
                <Text style={styles.stepTitle}>{`“Hey Siri, ${c.name}”`}</Text>
                <Text style={styles.cmdSummary}>{c.summary}</Text>
                <Text style={styles.stepBody}>{c.detail}</Text>
              </View>
            </View>
          ))}
        </Card>

        <SectionHeader title="Where your words end up" />
        <Card clip>
          {VOICE_FIELD_RULES.map((r, i) => (
            <View key={r.title} style={[styles.step, i > 0 && styles.stepBorder]}>
              <Text style={styles.stepNum}>{i + 1}</Text>
              <View style={styles.stepText}>
                <Text style={styles.stepTitle}>{r.title}</Text>
                <Text style={styles.stepBody}>{r.body}</Text>
              </View>
            </View>
          ))}
        </Card>

        <SectionHeader title="One-time setup" />
        <PrimaryButton
          label={VOICE_SHORTCUT_URL ? 'Set up the shortcut' : 'Open Shortcuts'}
          onPress={install}
        />
        {VOICE_SHORTCUT_URL ? (
          <>
            <Text style={styles.note}>
              Tap <Text style={styles.strong}>Add Shortcut</Text>, then choose the{' '}
              <Text style={styles.strong}>{VOICE_FILES_LOCATION}</Text> folder once when asked
              where to save. That's it — after this you only ever talk to Siri.
            </Text>
            <Text style={styles.note}>{VOICE_SHORTCUT_PRIVACY}</Text>
          </>
        ) : (
          <>
            <Text style={styles.note}>
              Build them once — four actions for the one-way command, three for the two-way.
              After that you never touch them again.
            </Text>

            <Text style={styles.stepsHeading}>{`One-way — “${VOICE_COMMANDS[0].name}”`}</Text>
            <Card clip>
              {VOICE_SHORTCUT_STEPS.map((s, i) => (
                <View key={s.title} style={[styles.step, i > 0 && styles.stepBorder]}>
                  <Text style={styles.stepNum}>{i + 1}</Text>
                  <View style={styles.stepText}>
                    <Text style={styles.stepTitle}>{s.title}</Text>
                    <Text style={styles.stepBody}>{s.body}</Text>
                  </View>
                </View>
              ))}
            </Card>
            <Text style={styles.note}>
              The folder must exist before Shortcuts can pick it — opening this screen has
              already created it, so it will be there.
            </Text>

            <Text style={styles.stepsHeading}>{`Two-way — “${VOICE_COMMANDS[1].name}”`}</Text>
            <Card clip>
              {VOICE_TWO_WAY_STEPS.map((s, i) => (
                <View key={s.title} style={[styles.step, i > 0 && styles.stepBorder]}>
                  <Text style={styles.stepNum}>{i + 1}</Text>
                  <View style={styles.stepText}>
                    <Text style={styles.stepTitle}>{s.title}</Text>
                    <Text style={styles.stepBody}>{s.body}</Text>
                  </View>
                </View>
              ))}
            </Card>
            <Text style={styles.note}>
              No folder needed for this one — it hands the phrase straight to the app.
            </Text>
          </>
        )}

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
  stepsHeading: { ...type.labelSemi, color: colors.textSecondary, marginTop: space.md, marginBottom: space.sm },
});
