import { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { ApiError, isTransient } from "@/api/client";
import { describeError } from "@/api/describeError";
import type { CreateClaimBody } from "@/api/types";
import { useSession } from "@/features/token/TokenProvider";
import { newIdempotencyKey } from "@/lib/idempotencyKey";
import { readJson, writeJson } from "@/lib/storage";

import type { TrackedClaim } from "./types";

const POLL_MS = 2000;
/** Automatic replays after the first attempt, ~1 s, 2 s, 4 s apart. Then the user checks manually. */
const AUTO_REPLAYS = 3;
const KEEP_FINISHED = 20;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function replayDelayMs(error: unknown, replay: number): number {
  if (error instanceof ApiError && error.status === 429 && error.retryAfterMs) return error.retryAfterMs;
  return 1000 * 2 ** replay;
}

const isFinished = (c: TrackedClaim) =>
  c.phase === "rejected" || c.phase === "error" || (c.claim !== null && c.claim.status !== "pending");

type ClaimsContextValue = {
  claims: TrackedClaim[];
  /** Persists the claim with a fresh Idempotency-Key, then sends it. Returns the key. */
  submit: (body: CreateClaimBody, meta: { decimals: number; destinationLabel: string }) => string;
  /** Manual "Check again": replays the same key once. */
  recheck: (key: string) => void;
  dismiss: (key: string) => void;
};

const ClaimsContext = createContext<ClaimsContextValue | null>(null);

export function useClaims(): ClaimsContextValue {
  const value = use(ClaimsContext);
  if (!value) throw new Error("useClaims must be used inside <ClaimsProvider>");
  return value;
}

/**
 * Owns every claim the user confirmed: sends it, replays the same key when the outcome is unknown,
 * and polls it until it settles. State lives in storage scoped to the current token, so a reload
 * resumes where it stopped and another token never sees it.
 */
export function ClaimsProvider({ children }: { children: ReactNode }) {
  const { api, storagePrefix } = useSession();
  const storageKey = `${storagePrefix}claims`;
  const [claims, setClaims] = useState<TrackedClaim[]>(() => readJson<TrackedClaim[]>(storageKey) ?? []);
  const current = useRef(claims);
  const alive = useRef(true);
  const running = useRef(new Set<string>());

  const commit = useCallback(
    (next: TrackedClaim[]) => {
      if (!alive.current) return;
      current.current = next;
      writeJson(storageKey, next); // synchronous: the key is stored before any request uses it
      setClaims(next);
    },
    [storageKey],
  );

  const patch = useCallback(
    (key: string, change: Partial<TrackedClaim>) =>
      commit(current.current.map((c) => (c.key === key ? { ...c, ...change } : c))),
    [commit],
  );

  const find = (key: string) => current.current.find((c) => c.key === key);

  const drive = useCallback(
    async (key: string) => {
      if (running.current.has(key)) return;
      running.current.add(key);
      try {
        // 1. Make sure the claim exists. The same key + body never creates a second claim.
        while (alive.current) {
          const item = current.current.find((c) => c.key === key);
          if (!item || item.claim || (item.phase !== "sending" && item.phase !== "confirming")) break;
          try {
            const { claim } = await api.createClaim(item.body, item.key);
            patch(key, { phase: "created", claim, error: null });
          } catch (e) {
            if (e instanceof ApiError && e.status === 400) {
              // Validation runs before a claim is created, and replaying a created claim would return it.
              patch(key, { phase: "rejected", error: describeError(e) });
            } else if (e instanceof ApiError && e.status === 409) {
              patch(key, {
                phase: "error",
                error: "This request clashed with an earlier one (409). It was not retried. Please contact support.",
              });
            } else if (!isTransient(e) || item.replays >= AUTO_REPLAYS) {
              patch(key, { phase: "unknown", error: describeError(e) });
            } else {
              patch(key, { phase: "confirming", error: describeError(e), replays: item.replays + 1 });
              await sleep(replayDelayMs(e, item.replays));
            }
          }
        }

        // 2. Follow the claim until it settles (~20 s).
        let failures = 0;
        while (alive.current) {
          const item = current.current.find((c) => c.key === key);
          if (item?.claim?.status !== "pending") break;
          await sleep(POLL_MS * 2 ** Math.min(failures, 3));
          if (!alive.current) break;
          try {
            patch(key, { claim: await api.getClaim(item.claim.id), error: null });
            failures = 0;
          } catch (e) {
            if (!isTransient(e)) {
              patch(key, { error: describeError(e) });
              break;
            }
            failures++;
          }
        }
      } finally {
        running.current.delete(key);
      }
    },
    [api, patch],
  );

  useEffect(() => {
    alive.current = true;
    // Resume after a reload: unsent/unconfirmed claims are replayed, pending ones polled.
    for (const c of current.current) {
      if (c.claim ? c.claim.status === "pending" : c.phase === "sending" || c.phase === "confirming") {
        void drive(c.key);
      }
    }
    return () => {
      alive.current = false;
    };
  }, [drive]);

  function submit(body: CreateClaimBody, meta: { decimals: number; destinationLabel: string }) {
    const item: TrackedClaim = {
      key: newIdempotencyKey(),
      body,
      ...meta,
      submittedAt: new Date().toISOString(),
      phase: "sending",
      claim: null,
      error: null,
      replays: 0,
    };
    const finished = current.current.filter(isFinished).slice(-KEEP_FINISHED);
    commit([...current.current.filter((c) => !isFinished(c)), ...finished, item]);
    void drive(item.key);
    return item.key;
  }

  function recheck(key: string) {
    if (find(key)?.phase !== "unknown") return;
    patch(key, { phase: "confirming", error: null, replays: AUTO_REPLAYS });
    void drive(key);
  }

  function dismiss(key: string) {
    commit(current.current.filter((c) => c.key !== key));
  }

  return <ClaimsContext value={{ claims, submit, recheck, dismiss }}>{children}</ClaimsContext>;
}
