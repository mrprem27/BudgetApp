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
  VOICE_SHORTCUT_URL, VOICE_SHORTCUT_STEPS, VOICE_FILES_LOCATION, VOICE_PHRASE_EXAMPLES,
  VOICE_ROUTING_SUMMARY, VOICE_SHORTCUT_PRIVACY,
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

  async function install() {
    if (!VOICE_SHORTCUT_URL) return;
    try {
      await Linking.openURL(VOICE_SHORTCUT_URL);
    } catch {
      Alert.alert('Couldn\'t open Shortcuts', 'Open the Shortcuts app and follow the steps below instead.');
    }
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Voice entry" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Card padded style={styles.hero}>
          <IconCircle icon="mic" size={56} iconSize={22} color={colors.accent} bg={colors.accentMuted} />
          <Text style={styles.heroTitle}>“Hey Siri, log expense”</Text>
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

        <SectionHeader title="When it opens the app instead" />
        <Text style={styles.body}>{VOICE_ROUTING_SUMMARY}</Text>
        <Text style={styles.note}>
          A split needs to know who shares it and how, and nothing can guess that — so those
          go to Review or straight to the Add screen rather than being filed as yours alone.
        </Text>

        <SectionHeader title="One-time setup" />
        {VOICE_SHORTCUT_URL ? (
          <>
            <PrimaryButton label="Set up the shortcut" onPress={install} />
            <Text style={styles.note}>
              Tap <Text style={styles.strong}>Add Shortcut</Text>, then choose the{' '}
              <Text style={styles.strong}>{VOICE_FILES_LOCATION}</Text> folder once when asked
              where to save. That's it — after this you only ever talk to Siri.
            </Text>
            <Text style={styles.note}>{VOICE_SHORTCUT_PRIVACY}</Text>
          </>
        ) : (
          <>
            <Text style={styles.body}>
              Build it once in the Shortcuts app — four actions, about two minutes. After
              that you never touch it again.
            </Text>
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
});
