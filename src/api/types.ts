// Response shapes of https://task-api.cashmine.io (checked against live responses on 2026-10-20).

/** Decimal string in the asset's own unit, e.g. "0.0005". Never a JSON number. At most `decimals` places. */
export type DecimalString = string;
export type IsoDateString = string;

export interface BalanceItem {
  asset: string;
  decimals: number;
  /** Can be claimed now. Checked live by POST /v1/claims, not against this snapshot. */
  available: DecimalString;
  /** Accrued but not confirmed yet; can still be reversed. */
  pending: DecimalString;
  /** In claims that have not settled yet. */
  claiming: DecimalString;
  /** USD per one unit. */
  usdPrice: DecimalString;
}

export interface BalancesResponse {
  /** Time of the snapshot; recomputed every ~15 s. */
  asOf: IsoDateString;
  items: BalanceItem[];
}

export type ClaimStatus = "pending" | "completed" | "failed";

interface ActivityBase {
  id: string;
  asset: string;
  /** Signed: negative for reversals and claims. */
  amount: DecimalString;
  createdAt: IsoDateString;
}

export type ActivityItem =
  | (ActivityBase & { type: "accrual"; status: "pending" | "confirmed"; exchange: string; relatedId: null })
  | (ActivityBase & { type: "reversal"; status: "confirmed"; exchange: string; relatedId: string })
  | (ActivityBase & { type: "claim"; status: ClaimStatus; exchange: null; relatedId: string | null });

export interface ActivityPage {
  items: ActivityItem[];
  /** Opaque; null on the last page. */
  nextCursor: string | null;
}

export interface ClaimDestination {
  id: string;
  label: string;
}

export interface ClaimOptions {
  asset: string;
  minAmount: DecimalString;
  /** Flat fee taken from the claimed amount: the user receives amount - fee. */
  fee: DecimalString;
  destinations: ClaimDestination[];
}

export interface CreateClaimBody {
  asset: string;
  amount: DecimalString;
  destinationId: string;
}

export interface Claim {
  id: string;
  asset: string;
  amount: DecimalString;
  fee: DecimalString;
  receiveAmount: DecimalString;
  destinationId: string;
  status: ClaimStatus;
  failureReason: string | null;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

export type ApiErrorCode =
  | "VALIDATION"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "IDEMPOTENCY_MISMATCH"
  | "RATE_LIMITED"
  | "SERVER"
  | "TIMEOUT";

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string; field?: string; retryAfterMs?: number };
}
