import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { BalancesResponse } from "@/api/types";
import { useSession } from "@/features/token/TokenProvider";

// Temporary: proves the token gate and API client work. Replaced by the Balances screen in the next step.
export default function Index() {
  const { api } = useSession();
  const [data, setData] = useState<BalancesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getBalances().then(setData, (e: Error) => setError(e.message));
  }, [api]);

  return (
    <View style={styles.container}>
      {error && <Text>{error}</Text>}
      {!data && !error && <Text>Loading…</Text>}
      {data?.items.map((item) => (
        <Text key={item.asset}>
          {item.asset}: {item.available}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 8 },
});
