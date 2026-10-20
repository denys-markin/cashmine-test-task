import { API_BASE_URL, REQUEST_TIMEOUT_MS } from "./config";
import type {
  ActivityPage,
  ApiErrorBody,
  BalancesResponse,
  Claim,
  ClaimOptions,
  CreateClaimBody,
} from "./types";

/** A failed API call. `status` is 0 when no usable HTTP response arrived (network error, client timeout). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly field?: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * We can't tell whether the server acted on the request: no response, a 504, or another 5xx.
 * For POST /v1/claims this means "the claim may or may not exist".
 */
export function isOutcomeUnknown(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 0 || e.status >= 500);
}

/** Worth trying again later: rate limit, temporary server error or no response. */
export function isTransient(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 0 || e.status === 429 || e.status >= 500);
}

const GET_RETRIES = 2;
const MAX_RETRY_WAIT_MS = 10_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterHeaderMs(value: string | null): number | undefined {
  const seconds = value === null ? NaN : Number(value);
  return Number.isFinite(seconds) ? seconds * 1000 : undefined;
}

/** How long to wait before retry number `attempt` (0-based). */
export function retryDelayMs(error: ApiError, attempt: number): number {
  const wait = error.status === 429 ? (error.retryAfterMs ?? 1000) : 500 * 2 ** attempt;
  return Math.min(wait, MAX_RETRY_WAIT_MS);
}

type ApiOptions = { token: string; onUnauthorized: () => void };

export function createApi({ token, onUnauthorized }: ApiOptions) {
  async function request<T>(
    method: "GET" | "POST",
    path: string,
    init: { body?: unknown; headers?: Record<string, string> } = {},
  ): Promise<{ data: T; response: Response }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      let response: Response;
      let body: unknown = null;
      try {
        response = await fetch(API_BASE_URL + path, {
          method,
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
            ...(init.body !== undefined ? { "Content-Type": "application/json" } : null),
            ...init.headers,
          },
          body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
          signal: controller.signal,
        });
        body = await response.json().catch(() => null);
      } catch {
        throw controller.signal.aborted
          ? new ApiError(0, "CLIENT_TIMEOUT", "The server is taking too long to answer.")
          : new ApiError(0, "NETWORK", "Network error. Check your connection.");
      }

      if (response.ok) {
        // A success we can't read is as good as no answer: the request may have been applied.
        if (body === null) throw new ApiError(0, "BAD_RESPONSE", "Unexpected response from the server.");
        return { data: body as T, response };
      }

      const error = (body as Partial<ApiErrorBody> | null)?.error;
      if (response.status === 401) onUnauthorized();
      throw new ApiError(
        response.status,
        error?.code ?? `HTTP_${response.status}`,
        error?.message ?? `Request failed (HTTP ${response.status}).`,
        error?.field,
        error?.retryAfterMs ?? retryAfterHeaderMs(response.headers.get("Retry-After")),
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /** GETs are safe to repeat, so transient failures are retried a couple of times. */
  async function get<T>(path: string): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return (await request<T>("GET", path)).data;
      } catch (e) {
        if (attempt >= GET_RETRIES || !isTransient(e)) throw e;
        await sleep(retryDelayMs(e as ApiError, attempt));
      }
    }
  }

  return {
    getBalances: () => get<BalancesResponse>("/v1/balances"),

    getActivity: (cursor?: string | null, limit = 20) =>
      get<ActivityPage>(
        `/v1/activity?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      ),

    getClaimOptions: (asset: string) =>
      get<ClaimOptions>(`/v1/claim-options?asset=${encodeURIComponent(asset)}`),

    getClaim: (id: string) => get<Claim>(`/v1/claims/${encodeURIComponent(id)}`),

    /** Never retried here: what to do when the outcome is unknown is the caller's decision. */
    async createClaim(body: CreateClaimBody, idempotencyKey: string) {
      const { data, response } = await request<Claim>("POST", "/v1/claims", {
        body,
        headers: { "Idempotency-Key": idempotencyKey },
      });
      return { claim: data, replayed: response.headers.get("Idempotent-Replayed") === "true" };
    },
  };
}

export type Api = ReturnType<typeof createApi>;
