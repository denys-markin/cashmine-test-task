import { router } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, space } from "@/ui/theme";

import { describeClaim, type Tone } from "./describeClaim";
import type { TrackedClaim } from "./types";

export const toneColors: Record<Tone, { fg: string; bg: string }> = {
  info: { fg: colors.text, bg: colors.card },
  warning: { fg: colors.warning, bg: colors.warningBg },
  danger: { fg: colors.danger, bg: colors.dangerBg },
  success: { fg: colors.success, bg: colors.successBg },
};

const isBusy = (t: TrackedClaim) =>
  t.phase === "sending" || t.phase === "confirming" || t.claim?.status === "pending";

export function ClaimBanner({ item }: { item: TrackedClaim }) {
  const { tone, title } = describeClaim(item);
  const { fg, bg } = toneColors[tone];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: "/claim-status", params: { key: item.key } })}
      style={({ pressed }) => [styles.box, { backgroundColor: bg }, pressed && styles.pressed]}
    >
      {isBusy(item) && <ActivityIndicator color={colors.primary} />}
      <View style={styles.texts}>
        <Text style={[styles.title, { color: fg }]}>{title}</Text>
        <Text style={styles.more}>Details ›</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  texts: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: "600" },
  more: { color: colors.muted, fontSize: 13 },
  pressed: { opacity: 0.8 },
});
