import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";

import { describeError } from "@/api/describeError";
import type { ActivityItem } from "@/api/types";
import { useActivity } from "@/features/activity/useActivity";
import { Button } from "@/ui/Button";
import { ErrorBanner } from "@/ui/ErrorBanner";
import { colors, space } from "@/ui/theme";

const STATUS: Record<string, { label: string; fg: string; bg: string }> = {
  pending: { label: "Pending", fg: colors.warning, bg: colors.warningBg },
  confirmed: { label: "Confirmed", fg: colors.success, bg: colors.successBg },
  completed: { label: "Completed", fg: colors.success, bg: colors.successBg },
  failed: { label: "Failed", fg: colors.danger, bg: colors.dangerBg },
};

function title(item: ActivityItem): string {
  if (item.type === "accrual") return `Payback from ${item.exchange}`;
  if (item.type === "reversal") return `Reversed by ${item.exchange}`;
  return "Claim";
}

export default function ActivityScreen() {
  const { items, done, loading, error, refresh, loadMore } = useActivity();

  if (items.length === 0) {
    return (
      <View style={styles.center}>
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : error != null ? (
          <View style={styles.fill}>
            <ErrorBanner message={`Couldn't load activity. ${describeError(error)}`} onRetry={refresh} />
          </View>
        ) : (
          <Text style={styles.muted}>No activity yet.</Text>
        )}
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <Row item={item} />}
      contentContainerStyle={styles.content}
      onEndReached={() => {
        if (!done && !loading && error == null) void loadMore();
      }}
      onEndReachedThreshold={0.5}
      ListFooterComponent={
        error != null ? (
          <ErrorBanner message={`Couldn't load more. ${describeError(error)}`} onRetry={loadMore} />
        ) : done ? (
          <Text style={[styles.muted, styles.end]}>No more activity.</Text>
        ) : (
          <Button title="Load more" variant="secondary" onPress={loadMore} loading={loading} />
        )
      }
    />
  );
}

function Row({ item }: { item: ActivityItem }) {
  const negative = item.amount.startsWith("-");
  const status = item.type === "reversal" ? { label: "Reversed", fg: colors.danger, bg: colors.dangerBg } : STATUS[item.status];
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <Text style={styles.title}>{title(item)}</Text>
        <Text style={styles.muted}>
          {new Date(item.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
        </Text>
      </View>
      <View style={styles.right}>
        {/* Shown exactly as the API sent it: no parsing, no rounding. */}
        <Text style={[styles.amount, { color: negative ? colors.text : colors.success }]} selectable>
          {negative ? "−" : "+"}
          {item.amount.replace(/^-/, "")} {item.asset}
        </Text>
        {status && (
          <Text style={[styles.badge, { color: status.fg, backgroundColor: status.bg }]}>{status.label}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.lg },
  fill: { alignSelf: "stretch" },
  content: { padding: space.lg, gap: space.sm },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: space.md,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: space.md,
  },
  left: { flex: 1, gap: 2 },
  right: { alignItems: "flex-end", gap: 4, flexShrink: 1 },
  title: { color: colors.text, fontSize: 15, fontWeight: "600" },
  muted: { color: colors.muted, fontSize: 13 },
  amount: { fontSize: 15, fontWeight: "600", textAlign: "right" },
  badge: { fontSize: 12, fontWeight: "600", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: "hidden" },
  end: { textAlign: "center", paddingVertical: space.md },
});
