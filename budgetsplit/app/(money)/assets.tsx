import { View, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, space, layout } from '../../src/theme';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { AssetsSection } from '../../src/components/finance/plan/AssetsSection';
import { useContentInset } from '../../src/hooks/useContentInset';
import { useAssets } from '../../src/hooks/useAssets';
import { AppRefreshControl } from '../../src/components/ui/AppRefreshControl';
import { backOr } from '../../src/lib/nav';

/** The asset register on its own screen — the same section Money's Assets tab shows (`AssetsSection`). */
export default function AssetsScreen() {
  const router = useRouter();
  const bottomPad = useContentInset();
  const assets = useAssets();
  return (
    <View style={styles.container}>
      <ScreenHeader title="Assets" onBack={() => backOr(router, '/(tabs)/savings')} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad }]}
        refreshControl={<AppRefreshControl refreshing={assets.refreshing} onRefresh={assets.onRefresh} />}
      >
        <AssetsSection assets={assets} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, gap: space.md },
});
