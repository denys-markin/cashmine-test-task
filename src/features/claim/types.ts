import type { Claim, CreateClaimBody } from "@/api/types";

export type ClaimPhase =
  /** First POST in flight. */
  | "sending"
  /** Outcome unknown (504, timeout, network, 5xx, 429); replaying the same key automatically. */
  | "confirming"
  /** Automatic replays used up; the user can "Check again" (same key). */
  | "unknown"
  /** The server answered 400: no claim was created. */
  | "rejected"
  /** Unexpected answer we must not retry (409 = our bug). */
  | "error"
  /** We have the claim; see `claim.status`. */
  | "created";

/** A claim the user confirmed, persisted (per token) before the first request goes out. */
export type TrackedClaim = {
  key: string;
  body: CreateClaimBody;
  decimals: number;
  destinationLabel: string;
  submittedAt: string;
  phase: ClaimPhase;
  claim: Claim | null;
  error: string | null;
  /** Automatic replays done so far. */
  replays: number;
};
