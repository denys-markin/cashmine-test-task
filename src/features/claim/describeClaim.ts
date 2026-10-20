import { formatAmountDisplay, toUnits } from "@/lib/amount";

import type { TrackedClaim } from "./types";

export type Tone = "info" | "warning" | "danger" | "success";

export function claimAmountText(t: TrackedClaim, value = t.body.amount): string {
  return `${formatAmountDisplay(toUnits(value, t.decimals), t.decimals)} ${t.body.asset}`;
}

/** One place for what the user is told about a claim, on Home and on the status screen. */
export function describeClaim(t: TrackedClaim): { tone: Tone; title: string; detail: string } {
  const amount = claimAmountText(t);
  const why = t.error ? ` (${t.error})` : "";
  switch (t.phase) {
    case "sending":
      return { tone: "info", title: `Submitting your claim of ${amount}…`, detail: "" };
    case "confirming":
      return {
        tone: "info",
        title: `Confirming your claim of ${amount}…`,
        detail: `The server didn't answer clearly${why}. We're asking again with the same request, so it can't be created twice.`,
      };
    case "unknown":
      return {
        tone: "warning",
        title: `We couldn't confirm your claim of ${amount}`,
        detail: `It may have gone through${why}. Don't submit it again: tap "Check again". Claiming ${t.body.asset} is paused until we know.`,
      };
    case "rejected":
      return { tone: "danger", title: `Claim of ${amount} was not created`, detail: t.error ?? "" };
    case "error":
      return { tone: "danger", title: `Claim of ${amount}: something went wrong`, detail: t.error ?? "" };
    case "created": {
      const claim = t.claim!;
      if (claim.status === "completed") {
        return {
          tone: "success",
          title: `Claim completed`,
          detail: `${claimAmountText(t, claim.receiveAmount)} sent to ${t.destinationLabel}.`,
        };
      }
      if (claim.status === "failed") {
        return {
          tone: "danger",
          title: `Claim of ${amount} failed`,
          detail: `${claim.failureReason ?? "No reason given"}. The amount is back in your available balance.`,
        };
      }
      return {
        tone: "info",
        title: `Claim of ${amount} is processing`,
        detail: "It usually settles within about 20 seconds. Your balances already include it.",
      };
    }
  }
}
