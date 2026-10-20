import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";

import type { BalancesResponse } from "@/api/types";
import { useSession } from "@/features/token/TokenProvider";
import { toUnits, totalUsdCents } from "@/lib/amount";

export type AssetBalance = {
  asset: string;
  decimals: number;
  usdPrice: string;
  available: bigint;
  pending: bigint;
  claiming: bigint;
};

export type Balances = { asOf: string; items: AssetBalance[] };

/** Converts the API snapshot to exact units. Throws on malformed amounts rather than showing wrong numbers. */
export function toBalances(response: BalancesResponse): Balances {
  return {
    asOf: response.asOf,
    items: response.items.map((item) => ({
      asset: item.asset,
      decimals: item.decimals,
      usdPrice: item.usdPrice,
      available: toUnits(item.available, item.decimals),
      pending: toUnits(item.pending, item.decimals),
      claiming: toUnits(item.claiming, item.decimals),
    })),
  };
}

export const assetTotal = (b: AssetBalance) => b.available + b.pending + b.claiming;

export function usdTotals(items: AssetBalance[]) {
  return {
    total: totalUsdCents(items.map((b) => ({ ...b, units: assetTotal(b) }))),
    available: totalUsdCents(items.map((b) => ({ ...b, units: b.available }))),
  };
}

type State = { data: Balances | null; error: unknown; loading: boolean };

/** Loads balances when the screen gains focus; keeps the last good snapshot visible if a refresh fails. */
export function useBalances() {
  const { api } = useSession();
  const [state, setState] = useState<State>({ data: null, error: null, loading: true });
  const latest = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++latest.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = toBalances(await api.getBalances());
      if (id === latest.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (id === latest.current) setState((s) => ({ ...s, error, loading: false }));
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  return { ...state, refresh };
}
