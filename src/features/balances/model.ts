import type { BalancesResponse } from "@/api/types";
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

/** Total = available + pending + claiming (all payback not yet paid out); "available" = claimable now. */
export function usdTotals(items: AssetBalance[]) {
  return {
    total: totalUsdCents(items.map((b) => ({ ...b, units: assetTotal(b) }))),
    available: totalUsdCents(items.map((b) => ({ ...b, units: b.available }))),
  };
}
