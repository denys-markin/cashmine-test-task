import { router } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { describeError } from "@/api/describeError";
import { assetTotal, usdTotals, type AssetBalance } from "@/features/balances/model";
import { useBalances } from "@/features/balances/useBalances";
import { ClaimBanner } from "@/features/claim/ClaimBanner";
import { useClaims } from "@/features/claim/ClaimsProvider";
import { blocksAsset, isActive } from "@/features/claim/overlay";
import { formatAmountDisplay, formatUsd, totalUsdCents } from "@/lib/amount";
import { formatAge, useNow } from "@/lib/useNow";
import { Button } from "@/ui/Button";
import { ErrorBanner } from "@/ui/ErrorBanner";
import { colors, space } from "@/ui/theme";

// Snapshots are recomputed every ~15 s; older than this and we say so.
const STALE_AFTER_MS = 60_000;
// While one of the user's claims is in flight, check for a fresh snapshot this often.
const LIVE_REFRESH_MS = 5_000;

export default function Home() {
  const { data, error, loading, refresh } = useBalances();
  const { claims } = useClaims();
  const now = useNow();
  const active = data ? claims.filter((c) => isActive(c, data.asOf)) : [];
  // Poll only while something is moving; "unknown" and "error" claims wait for the user.
  const live = active.some((c) => c.claim !== null || c.phase === "sending" || c.phase === "confirming");

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => void refresh(), LIVE_REFRESH_MS);
    return () => clearInterval(id);
  }, [live, refresh]);

  // A failed claim returns its amount to available: drop its overlay (overlay.ts) and refetch right away.
  const failedKeys = claims
    .filter((c) => c.claim?.status === "failed")
    .map((c) => c.key)
    .join();
  useEffect(() => {
    if (failedKeys) void refresh();
  }, [failedKeys, refresh]);

  if (!data) {
    return (
      <View style={styles.center}>
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : (
          <View style={styles.fill}>
            <ErrorBanner message={`Couldn't load balances. ${describeError(error)}`} onRetry={refresh} />
          </View>
        )}
      </View>
    );
  }

  const totals = usdTotals(data.items);
  const ageMs = now - Date.parse(data.asOf);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.label}>Total payback</Text>
        <Text style={styles.total}>{formatUsd(totals.total)}</Text>
        <Text style={styles.muted}>Claimable now {formatUsd(totals.available)}</Text>
        <View style={styles.freshRow}>
          <Text style={[styles.muted, ageMs > STALE_AFTER_MS && styles.stale]}>
            Updated {formatAge(ageMs)}
            {ageMs > STALE_AFTER_MS ? " · may be out of date" : ""}
          </Text>
          <Button title="Refresh" variant="secondary" onPress={refresh} loading={loading} />
        </View>
      </View>

      {error != null && <ErrorBanner message={`Couldn't refresh. ${describeError(error)}`} onRetry={refresh} retrying={loading} />}

      {active.map((c) => (
        <ClaimBanner key={c.key} item={c} />
      ))}

      {data.items.map((item) => (
        <AssetRow key={item.asset} item={item} blocked={claims.some((c) => blocksAsset(c, item.asset))} />
      ))}

      <Text style={styles.footnote}>
        Totals include pending payback, which is not confirmed yet and can still be reversed by the exchange.
      </Text>
    </ScrollView>
  );
}

function AssetRow({ item, blocked }: { item: AssetBalance; blocked: boolean }) {
  const amount = (units: bigint) => `${formatAmountDisplay(units, item.decimals)} ${item.asset}`;
  const usd = totalUsdCents([{ units: assetTotal(item), decimals: item.decimals, usdPrice: item.usdPrice }]);
  return (
    <View style={styles.card}>
      <View style={styles.rowHeader}>
        <Text style={styles.asset}>{item.asset}</Text>
        <Text style={styles.assetUsd}>{formatUsd(usd)}</Text>
      </View>
      <Line label="Available" value={amount(item.available)} strong />
      <Line label="Pending · may be reversed" value={amount(item.pending)} />
      <Line label="Claiming" value={amount(item.claiming)} />
      <Pressable
        accessibilityRole="button"
        disabled={item.available === 0n || blocked}
        onPress={() => router.push({ pathname: "/claim", params: { asset: item.asset } })}
        style={({ pressed }) => [styles.claim, (item.available === 0n || blocked) && styles.disabled, pressed && styles.pressed]}
      >
        <Text style={styles.claimText}>{blocked ? "Waiting for previous claim" : `Claim ${item.asset}`}</Text>
      </Pressable>
    </View>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.line}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={[styles.value, strong && styles.strong]} selectable>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.lg },
  fill: { alignSelf: "stretch" },
  content: { padding: space.lg, gap: space.md },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: space.lg, gap: space.sm },
  label: { color: colors.muted, fontSize: 14 },
  total: { color: colors.text, fontSize: 34, fontWeight: "700" },
  muted: { color: colors.muted, fontSize: 14 },
  stale: { color: colors.warning },
  freshRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  rowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  asset: { color: colors.text, fontSize: 18, fontWeight: "700" },
  assetUsd: { color: colors.text, fontSize: 16 },
  line: { flexDirection: "row", justifyContent: "space-between", gap: space.sm },
  value: { color: colors.text, fontSize: 14, flexShrink: 1, textAlign: "right" },
  strong: { fontWeight: "700", fontSize: 15 },
  claim: {
    marginTop: space.xs,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  claimText: { color: colors.primaryText, fontSize: 16, fontWeight: "600" },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.8 },
  footnote: { color: colors.muted, fontSize: 12, textAlign: "center", paddingHorizontal: space.md },
});
