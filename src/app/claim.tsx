import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { describeError } from "@/api/describeError";
import type { ClaimOptions } from "@/api/types";
import { useBalances } from "@/features/balances/useBalances";
import { useClaims } from "@/features/claim/ClaimsProvider";
import { blocksAsset } from "@/features/claim/overlay";
import { useSession } from "@/features/token/TokenProvider";
import {
  checkClaimAmount,
  formatAmountDisplay,
  formatUnits,
  toUnits,
  type ClaimAmountError,
} from "@/lib/amount";
import { Button } from "@/ui/Button";
import { ErrorBanner } from "@/ui/ErrorBanner";
import { colors, space } from "@/ui/theme";

function useClaimOptions(asset: string | null) {
  const { api } = useSession();
  const [state, setState] = useState<{ asset: string | null; data: ClaimOptions | null; error: unknown }>({
    asset: null,
    data: null,
    error: null,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!asset) return;
    let cancelled = false;
    api.getClaimOptions(asset).then(
      (data) => !cancelled && setState({ asset, data, error: null }),
      (error) => !cancelled && setState({ asset, data: null, error }),
    );
    return () => {
      cancelled = true;
    };
  }, [api, asset, attempt]);

  const current = state.asset === asset ? state : { data: null, error: null };
  return {
    data: current.data,
    error: current.error,
    retry: () => {
      setState({ asset: null, data: null, error: null });
      setAttempt((n) => n + 1);
    },
  };
}

/** Options amounts in the asset's units; null if the server sent something we can't trust. */
function parseOptions(options: ClaimOptions, decimals: number) {
  try {
    return { minAmount: toUnits(options.minAmount, decimals), fee: toUnits(options.fee, decimals) };
  } catch {
    return null;
  }
}

export default function ClaimScreen() {
  const { asset, amount } = useLocalSearchParams<{ asset?: string; amount?: string }>();
  // New params (e.g. "Edit amount" popping back to this screen) start a fresh form.
  return <ClaimForm key={`${asset ?? ""}:${amount ?? ""}`} initialAsset={asset} initialAmount={amount} />;
}

function ClaimForm({ initialAsset, initialAmount }: { initialAsset?: string; initialAmount?: string }) {
  const { data, error: balancesError, loading: balancesLoading, refresh } = useBalances();
  const { claims, submit } = useClaims();
  const [asset, setAsset] = useState<string | null>(initialAsset ?? null);
  const [input, setInput] = useState(initialAmount ?? "");
  const [destinationId, setDestinationId] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // State updates land on the next render; two taps in one frame must still create only one claim.
  const submitted = useRef(false);
  const options = useClaimOptions(asset);

  if (!data) {
    return (
      <View style={styles.content}>
        {balancesLoading ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : (
          <ErrorBanner message={`Couldn't load balances. ${describeError(balancesError)}`} onRetry={refresh} />
        )}
      </View>
    );
  }

  function pickAsset(next: string) {
    setAsset(next);
    setInput("");
    setDestinationId(null);
    setReviewing(false);
  }

  const balance = data.items.find((b) => b.asset === asset) ?? null;
  const blocking = asset ? claims.find((c) => blocksAsset(c, asset)) : undefined;
  const limits = balance && options.data ? parseOptions(options.data, balance.decimals) : null;
  const destinations = options.data?.destinations ?? [];
  // With one destination there is nothing to choose; with several the user must pick explicitly.
  const destination =
    destinations.find((d) => d.id === destinationId) ?? (destinations.length === 1 ? destinations[0] : undefined);
  const check =
    balance && limits ? checkClaimAmount({ input, decimals: balance.decimals, available: balance.available, ...limits }) : null;
  const units = (value: bigint) => (balance ? `${formatAmountDisplay(value, balance.decimals, balance.decimals)} ${balance.asset}` : "");
  const tooLittle = balance && limits ? balance.available < limits.minAmount : false;

  function confirm() {
    if (submitted.current || !balance || !check?.ok || !destination || blocking) return;
    submitted.current = true;
    setSubmitting(true);
    const key = submit(
      { asset: balance.asset, amount: formatUnits(check.amount, balance.decimals), destinationId: destination.id },
      { decimals: balance.decimals, destinationLabel: destination.label },
    );
    router.replace({ pathname: "/claim-status", params: { key } });
  }

  if (reviewing && balance && check?.ok && destination && limits) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Review your claim</Text>
        <View style={styles.card}>
          <Row label="Amount" value={units(check.amount)} />
          <Row label="Fee" value={units(limits.fee)} />
          <Row label="You receive" value={units(check.receive)} strong />
          <Row label="To" value={destination.label} />
        </View>
        <Text style={styles.muted}>The fee is taken from the amount. Claims usually settle within about 20 seconds.</Text>
        <Button title="Confirm claim" onPress={confirm} loading={submitting} disabled={!!blocking} />
        <Button title="Edit" variant="secondary" onPress={() => setReviewing(false)} disabled={submitting} />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>Asset</Text>
      <View style={styles.chips}>
        {data.items.map((b) => (
          <Chip key={b.asset} label={b.asset} selected={b.asset === asset} onPress={() => pickAsset(b.asset)} />
        ))}
      </View>

      {!balance && <Text style={styles.muted}>Choose the asset you want to claim.</Text>}

      {blocking && (
        <ErrorBanner
          message={`A claim of ${blocking.body.amount} ${blocking.body.asset} is still being confirmed. Wait for it before claiming ${blocking.body.asset} again.`}
          onRetry={() => router.push({ pathname: "/claim-status", params: { key: blocking.key } })}
          actionLabel="View claim"
        />
      )}

      {balance && !options.data && !options.error && <ActivityIndicator color={colors.primary} />}
      {balance && options.error != null && (
        <ErrorBanner message={`Couldn't load claim options. ${describeError(options.error)}`} onRetry={options.retry} />
      )}
      {balance && options.data && !limits && <ErrorBanner message="The server sent claim options we can't read." />}

      {balance && limits && (
        <>
          <View style={styles.card}>
            <Row label="Available" value={units(balance.available)} strong />
            <Row label="Minimum claim" value={units(limits.minAmount)} />
            <Row label="Fee" value={units(limits.fee)} />
          </View>

          {tooLittle ? (
            <Text style={styles.warning}>
              You need at least {formatUnits(limits.minAmount, balance.decimals)} {balance.asset} available to claim.
            </Text>
          ) : (
            <>
              <Text style={styles.label}>Amount</Text>
              <View style={styles.amountRow}>
                <TextInput
                  value={input}
                  onChangeText={setInput}
                  placeholder="0.00"
                  inputMode="decimal"
                  keyboardType="decimal-pad"
                  autoCorrect={false}
                  style={[styles.input, input !== "" && check && !check.ok && styles.inputError]}
                  accessibilityLabel={`Amount in ${balance.asset}`}
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setInput(formatUnits(balance.available, balance.decimals))}
                  style={({ pressed }) => [styles.max, pressed && styles.pressed]}
                >
                  <Text style={styles.maxText}>Max</Text>
                </Pressable>
              </View>
              {input !== "" && check && !check.ok && (
                <Text style={styles.error}>
                  {amountMessage(check.error, {
                    asset: balance.asset,
                    decimals: balance.decimals,
                    min: formatUnits(limits.minAmount, balance.decimals),
                    available: formatUnits(balance.available, balance.decimals),
                    fee: formatUnits(limits.fee, balance.decimals),
                  })}
                </Text>
              )}

              {destinations.length > 1 && (
                <>
                  <Text style={styles.label}>Send to</Text>
                  {destinations.map((d) => (
                    <Chip key={d.id} label={d.label} selected={destination?.id === d.id} onPress={() => setDestinationId(d.id)} wide />
                  ))}
                </>
              )}
              {destinations.length === 1 && <Text style={styles.muted}>Sends to {destinations[0].label}</Text>}
              {destinations.length === 0 && <Text style={styles.error}>No destination is set up for {balance.asset}.</Text>}

              {check?.ok && (
                <View style={styles.card}>
                  <Row label="Fee" value={units(limits.fee)} />
                  <Row label="You receive" value={units(check.receive)} strong />
                </View>
              )}

              <Button
                title={destination || !check?.ok ? "Review claim" : "Choose where to send it"}
                onPress={() => setReviewing(true)}
                disabled={!check?.ok || !destination || !!blocking}
              />
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

function amountMessage(
  error: ClaimAmountError,
  v: { asset: string; decimals: number; min: string; available: string; fee: string },
): string {
  switch (error) {
    case "empty":
      return "Enter an amount.";
    case "format":
      return "Use digits with an optional dot, like 0.5 or 12.";
    case "too_many_decimals":
      return `${v.asset} allows at most ${v.decimals} decimal places.`;
    case "below_min":
      return `The minimum claim is ${v.min} ${v.asset}.`;
    case "above_available":
      return `You can claim at most ${v.available} ${v.asset}.`;
    case "fee_exceeds_amount":
      return `The amount must be more than the ${v.fee} ${v.asset} fee.`;
  }
}

function Chip({ label, selected, onPress, wide }: { label: string; selected: boolean; onPress: () => void; wide?: boolean }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, wide && styles.chipWide, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={[styles.value, strong && styles.strong]} selectable>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  heading: { fontSize: 20, fontWeight: "700", color: colors.text },
  label: { fontSize: 14, fontWeight: "600", color: colors.text },
  muted: { color: colors.muted, fontSize: 14 },
  warning: { color: colors.warning, backgroundColor: colors.warningBg, padding: space.md, borderRadius: 12 },
  error: { color: colors.danger, fontSize: 14 },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: space.lg, gap: space.sm },
  row: { flexDirection: "row", justifyContent: "space-between", gap: space.md },
  value: { color: colors.text, fontSize: 14, flexShrink: 1, textAlign: "right" },
  strong: { fontWeight: "700" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: {
    minHeight: 40,
    paddingHorizontal: space.lg,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    justifyContent: "center",
  },
  chipWide: { borderRadius: 12, minHeight: 48 },
  chipSelected: { borderColor: colors.primary, backgroundColor: colors.successBg },
  chipText: { color: colors.text, fontSize: 15 },
  chipTextSelected: { color: colors.primary, fontWeight: "600" },
  amountRow: { flexDirection: "row", gap: space.sm },
  input: {
    flex: 1,
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: space.md,
    fontSize: 20,
    backgroundColor: colors.card,
    color: colors.text,
  },
  inputError: { borderColor: colors.danger },
  max: {
    minWidth: 64,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  maxText: { color: colors.primary, fontWeight: "700", fontSize: 16 },
  pressed: { opacity: 0.7 },
});
