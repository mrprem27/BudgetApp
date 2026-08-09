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
  SHORTCUTS_APP_URL, VOICE_FIELD_RULES, VOICE_ROUTING_SUMMARY,
  type VoiceCommand, type FlowActor,
} from '../../src/lib/voiceShortcut';
import { kindAccent, kindGradient } from '../../src/lib/kindTheme';
import { ADD_KIND_LABEL } from '../../src/constants/enums';

/** Who is speaking in a flow beat. `app` is the only one that isn't a person. */
const ACTOR_ICON: Record<FlowActor, 'user' | 'mic' | 'smartphone'> = {
  you: 'user', siri: 'mic', app: 'smartphone',
};
const ACTOR_LABEL: Record<FlowActor, string> = {
  you: 'You', siri: 'Siri', app: 'BudgetSplit',
};

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
  // The flow is the thing worth reading before installing, so it opens on the first command
  // rather than starting collapsed like the steps do.
  const [openFlow, setOpenFlow] = useState<string | null>(VOICE_COMMANDS[0]?.name ?? null);

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
            One command for spending, money in and paying someone back. Siri asks, you answer,
            and BudgetSplit opens with everything filled in — including which of the three it
            worked out you meant. Nothing to set up beyond tapping Add Shortcut.
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

        {/* One command, one install button. The kind is inferred rather than said, which is
            only safe because the form opens and shows what was inferred. */}
        <SectionHeader title="Set it up" />
        {VOICE_COMMANDS.map(c => {
          const accent = kindAccent(c.kind);
          return (
            <View key={c.name} style={styles.cmdBlock}>
              <Card padded>
                <View style={styles.cmdHead}>
                  <IconCircle icon={c.icon} size={32} iconSize={14} color={accent} />
                  <View style={styles.stepText}>
                    <Text style={styles.stepTitle}>{`“Hey Siri, ${c.name}”`}</Text>
                    <Text style={[styles.cmdSummary, { color: accent }]}>{c.summary}</Text>
                  </View>
                  <Chip label={ADD_KIND_LABEL[c.kind]} accent={accent} selected />
                </View>
                <Text style={styles.stepBody}>{c.detail}</Text>
                <PrimaryButton
                  label={c.installUrl ? `Add “${c.name}”` : 'Open Shortcuts'}
                  onPress={() => install(c)}
                  style={styles.cmdCta}
                  gradient={kindGradient(c.kind)}
                />
                {/* The folder is the one thing a shared shortcut cannot carry: its destination
                    is a bookmark to a folder on the device that made it. Saying so here, at the
                    install button, is the difference between "one more tap" and "it silently
                    saved nothing and I never found out". */}
                <Text style={styles.note}>
                  {c.installUrl != null
                    ? <>Tap <Text style={styles.strong}>Add Shortcut</Text> on the sheet Apple shows. That's the whole setup — there is nothing to configure afterwards.</>
                    : <>No ready-made link for this one yet — build it from the {c.steps.length} steps below.</>}
                </Text>
              </Card>

              {/* The flow, as turns — who speaks when, and whether the phone leaves your
                  pocket. Collapsed, because with a working install link the button above is
                  the whole setup and this is reassurance, not instruction. */}
              <SectionCard
                title="What happens when you say it"
                subtitle={c.opensApp ? 'Opens the app' : 'Never opens the app'}
                icon="message-square"
                iconColor={accent}
                expanded={openFlow === c.name}
                onToggle={() => setOpenFlow(openFlow === c.name ? null : c.name)}
              >
                <View style={styles.flow}>
                  {c.flow.map((b, i) => (
                    <View key={i} style={styles.beat}>
                      <View style={styles.beatRail}>
                        <IconCircle
                          icon={ACTOR_ICON[b.actor]}
                          size={26}
                          iconSize={12}
                          color={b.actor === 'app' ? accent : colors.textSecondary}
                        />
                        {i < c.flow.length - 1 && <View style={styles.beatLine} />}
                      </View>
                      <View style={styles.beatText}>
                        <Text style={styles.beatWho}>{ACTOR_LABEL[b.actor]}</Text>
                        <Text style={styles.stepBody}>{b.text}</Text>
                      </View>
                    </View>
                  ))}
                </View>
                <View style={[styles.why, { borderLeftColor: accent }]}>
                  <Text style={styles.stepBody}>{c.why}</Text>
                </View>
              </SectionCard>

              {/* The hand-build only appears when there is no link to tap. The shortcuts are
                  generated and signed from these same constants now (`npm run build:shortcuts`),
                  so a missing link means one has not been shared yet — not that anyone is
                  expected to assemble actions by hand as a matter of course. */}
              {c.installUrl == null && (
                <SectionCard
                  title="Build it by hand instead"
                  subtitle={`${c.steps.length} steps`}
                  icon="tool"
                  iconColor={accent}
                  expanded={openSteps === c.name}
                  onToggle={() => setOpenSteps(openSteps === c.name ? null : c.name)}
                >
                  {c.steps.map((st, i) => (
                    <View key={st.title} style={[styles.step, i > 0 && styles.stepBorder]}>
                      <Text style={[styles.stepNum, { color: accent }]}>{i + 1}</Text>
                      <View style={styles.stepText}>
                        <Text style={styles.stepTitle}>{st.title}</Text>
                        <Text style={styles.stepBody}>{st.body}</Text>
                      </View>
                    </View>
                  ))}
                </SectionCard>
              )}
            </View>
          );
        })}

        <Text style={styles.note}>{VOICE_SHORTCUT_PRIVACY}</Text>

        {/* "Where did my sentence go" is the first question a voice feature has to answer, and
            these rules were sitting exported-but-unrendered. */}
        <SectionHeader title="What happens to your words" />
        <Card>
          {VOICE_FIELD_RULES.map((r, i) => (
            <View key={r.title} style={[styles.step, i > 0 && styles.stepBorder]}>
              <View style={styles.stepText}>
                <Text style={styles.stepTitle}>{r.title}</Text>
                <Text style={styles.stepBody}>{r.body}</Text>
              </View>
            </View>
          ))}
        </Card>
        <Text style={styles.note}>{VOICE_ROUTING_SUMMARY}</Text>

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
  cmdBlock: { gap: space.sm, marginBottom: space.lg },
  cmdHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.sm },
  cmdCta: { marginTop: space.md },

  flow: { padding: space.md, paddingBottom: 0 },
  beat: { flexDirection: 'row', gap: space.md },
  // The rail holds the disc and the connector, so the line runs between discs rather than
  // beside the text — the text blocks are uneven heights and the line would wander.
  beatRail: { alignItems: 'center', width: layout.iconCircle },
  beatLine: { flex: 1, width: 1, backgroundColor: colors.border, marginVertical: space.xs },
  beatText: { flex: 1, gap: 2, paddingBottom: space.md },
  beatWho: { ...type.labelSemi, color: colors.textSecondary },
  why: {
    borderLeftWidth: 2,
    paddingLeft: space.smd,
    marginHorizontal: space.md,
    marginBottom: space.md,
  },
});
