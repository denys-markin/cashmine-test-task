/// <reference types="jest" />
import type { Claim } from "@/api/types";
import type { AssetBalance } from "@/features/balances/model";
import { toUnits } from "@/lib/amount";

import { applyClaims, blocksAsset, isActive } from "./overlay";
import type { TrackedClaim } from "./types";

const eth = (v: string) => toUnits(v, 18);
const balance: AssetBalance = {
  asset: "ETH",
  decimals: 18,
  usdPrice: "2461.08",
  available: eth("10"),
  pending: eth("0.02"),
  claiming: eth("0"),
};

const CREATED = "2026-10-20T12:00:00.000Z";
const SETTLED = "2026-10-20T12:00:20.000Z";

function tracked(claim: Partial<Claim> | null, phase: TrackedClaim["phase"] = "created"): TrackedClaim {
  return {
    key: "k1",
    body: { asset: "ETH", amount: "1", destinationId: "dest_wallet" },
    decimals: 18,
    destinationLabel: "Wallet",
    submittedAt: CREATED,
    phase,
    error: null,
    replays: 0,
    claim: claim && {
      id: "clm_1",
      asset: "ETH",
      amount: "1",
      fee: "0.0012",
      receiveAmount: "0.9988",
      destinationId: "dest_wallet",
      status: "pending",
      failureReason: null,
      createdAt: CREATED,
      updatedAt: CREATED,
      ...claim,
    },
  };
}

const after = (asOf: string, claim: TrackedClaim) => applyClaims([balance], asOf, [claim])[0];

describe("applyClaims (balance right after a claim)", () => {
  it("moves a pending claim from available to claiming while the snapshot predates it", () => {
    const b = after("2026-10-20T11:59:59.000Z", tracked({}));
    expect(b.available).toBe(eth("9"));
    expect(b.claiming).toBe(eth("1"));
  });

  it("keeps the adjustment when asOf equals createdAt (ambiguous)", () => {
    expect(after(CREATED, tracked({})).available).toBe(eth("9"));
  });

  it("trusts the snapshot once it is strictly newer than the claim", () => {
    expect(after("2026-10-20T12:00:00.001Z", tracked({}))).toEqual(balance);
  });

  it("a completed claim leaves claiming once the snapshot predates completion", () => {
    const done = tracked({ status: "completed", updatedAt: SETTLED });
    expect(after("2026-10-20T11:59:59.000Z", done)).toMatchObject({ available: eth("9"), claiming: 0n });
    // Snapshot between creation and completion: it shows the claim in `claiming`, we take it out.
    expect(after("2026-10-20T12:00:10.000Z", { ...done, claim: { ...done.claim!, amount: "1" } })).toMatchObject({
      claiming: 0n,
    });
  });

  it("adds nothing for failed or unconfirmed claims", () => {
    expect(after("2026-10-20T11:59:59.000Z", tracked({ status: "failed", updatedAt: SETTLED }))).toEqual(balance);
    expect(after("2026-10-20T11:59:59.000Z", tracked(null, "unknown"))).toEqual(balance);
  });

  it("ignores other assets", () => {
    const btc = tracked({ asset: "BTC" });
    expect(after("2026-10-20T11:59:59.000Z", btc)).toEqual(balance);
  });
});

describe("blocking and visibility", () => {
  it("an unconfirmed claim blocks its asset; a rejected one does not", () => {
    expect(blocksAsset(tracked(null, "unknown"), "ETH")).toBe(true);
    expect(blocksAsset(tracked(null, "confirming"), "ETH")).toBe(true);
    expect(blocksAsset(tracked(null, "rejected"), "ETH")).toBe(false);
    expect(blocksAsset(tracked({}), "ETH")).toBe(false);
  });

  it("a settled claim stays visible until a strictly newer snapshot", () => {
    const done = tracked({ status: "completed", updatedAt: SETTLED });
    expect(isActive(done, SETTLED)).toBe(true);
    expect(isActive(done, "2026-10-20T12:00:20.001Z")).toBe(false);
  });
});
