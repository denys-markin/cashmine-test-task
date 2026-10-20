// Decision 2: right after a claim is created, balances show it at once (available -> claiming),
// even though the snapshot lags up to ~15 s. Each adjustment lasts only until a snapshot strictly
// newer than the event arrives, so nothing drops and then jumps back.

import type { AssetBalance } from "@/features/balances/model";
import { toUnits } from "@/lib/amount";

import type { TrackedClaim } from "./types";

/** The snapshot was taken strictly after `time`; equal timestamps are ambiguous, so they don't count. */
const newerThan = (asOf: string, time: string) => Date.parse(asOf) > Date.parse(time);

const atLeastZero = (n: bigint) => (n < 0n ? 0n : n);

export function applyClaims(items: AssetBalance[], asOf: string, claims: TrackedClaim[]): AssetBalance[] {
  return items.map((b) => {
    let { available, claiming } = b;
    for (const { claim } of claims) {
      // Unconfirmed claims: we don't know what happened, so nothing is assumed.
      // Failed claims: the amount is back in available; we show the server's numbers and refetch.
      if (!claim || claim.asset !== b.asset || claim.status === "failed") continue;
      const amount = toUnits(claim.amount, b.decimals);
      if (!newerThan(asOf, claim.createdAt)) {
        available -= amount;
        claiming += amount;
      }
      if (claim.status === "completed" && !newerThan(asOf, claim.updatedAt)) claiming -= amount;
    }
    return { ...b, available: atLeastZero(available), claiming: atLeastZero(claiming) };
  });
}

/** Worth showing on Home: in flight, or settled but not yet visible in the snapshot. */
export function isActive(t: TrackedClaim, asOf: string): boolean {
  if (!t.claim) return t.phase !== "rejected";
  return t.claim.status === "pending" || !newerThan(asOf, t.claim.updatedAt);
}

/** An unconfirmed claim for this asset may already have taken the money, so another claim must wait. */
export function blocksAsset(t: TrackedClaim, asset: string): boolean {
  return t.body.asset === asset && !t.claim && ["sending", "confirming", "unknown"].includes(t.phase);
}
