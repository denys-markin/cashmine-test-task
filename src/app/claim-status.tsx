import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";

import { toneColors } from "@/features/claim/ClaimBanner";
import { useClaims } from "@/features/claim/ClaimsProvider";
import { claimAmountText, describeClaim } from "@/features/claim/describeClaim";
import { Button } from "@/ui/Button";
import { colors, space } from "@/ui/theme";

// Go back to the Home that is already in the stack instead of stacking a second one. dismissTo pops to the
// existing route; only when there is none (a direct load of this screen) does it replace this screen.
const goHome = () => router.dismissTo("/");

export default function ClaimStatusScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const { claims, recheck, dismiss } = useClaims();
  const item = claims.find((c) => c.key === key);

  if (!item) {
    return (
      <View style={styles.content}>
        <Text style={styles.detail}>This claim is no longer tracked on this device. Check Activity for its status.</Text>
        <Button title="Back to balances" onPress={goHome} />
      </View>
    );
  }

  const { tone, title, detail } = describeClaim(item);
  const { fg, bg } = toneColors[tone];
  const claim = item.claim;
  const busy = item.phase === "sending" || item.phase === "confirming" || claim?.status === "pending";

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={[styles.status, { backgroundColor: bg }]} accessibilityLiveRegion="polite">
        {busy && <ActivityIndicator color={colors.primary} />}
        <Text style={[styles.title, { color: fg }]}>{title}</Text>
        {detail !== "" && <Text style={styles.detail}>{detail}</Text>}
      </View>

      <View style={styles.card}>
        <Row label="Amount" value={claimAmountText(item, claim?.amount)} />
        <Row label="Fee" value={claim ? claimAmountText(item, claim.fee) : "—"} />
        <Row label="You receive" value={claim ? claimAmountText(item, claim.receiveAmount) : "—"} strong />
        <Row label="To" value={item.destinationLabel} />
        {claim && <Row label="Claim ID" value={claim.id} />}
      </View>

      {item.phase === "unknown" && <Button title="Check again" onPress={() => recheck(item.key)} />}
      {item.phase === "rejected" && (
        <Button
          title="Edit amount"
          onPress={() => {
            dismiss(item.key);
            // Reuses a claim form already below this screen (it re-initialises from the new params).
            router.dismissTo({ pathname: "/claim", params: { asset: item.body.asset, amount: item.body.amount } });
          }}
        />
      )}
      {item.phase === "error" && (
        <Button
          title="Dismiss"
          variant="secondary"
          onPress={() => {
            dismiss(item.key);
            goHome();
          }}
        />
      )}
      <Button title="Back to balances" variant="secondary" onPress={goHome} />
    </ScrollView>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, strong && styles.strong]} selectable>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  status: { borderRadius: 16, padding: space.lg, gap: space.sm, alignItems: "flex-start" },
  title: { fontSize: 18, fontWeight: "700" },
  detail: { color: colors.text, fontSize: 15, lineHeight: 21 },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: space.lg, gap: space.sm },
  row: { flexDirection: "row", justifyContent: "space-between", gap: space.md },
  label: { color: colors.muted, fontSize: 14 },
  value: { color: colors.text, fontSize: 14, flexShrink: 1, textAlign: "right" },
  strong: { fontWeight: "700" },
});
