# Notes

## Decisions

**1. Amounts are `bigint` counts of the asset's smallest unit.** Amount strings are parsed strictly
into `value × 10^decimals`, so comparisons, fee and totals are exact integer math. *Why:* ETH has 18
decimals, and `Number("12.345678901234591676")` is `12.345678901234592`, so Max would claim a different
amount than `available`. *Alternatives:* a decimal library (an extra dependency; decimal.js rounds at 20
significant digits) or plain `number` (wrong here).

**2. After a claim, the app moves the amount from available to claiming locally.** The balance snapshot
can be up to 15 s old, so the local change applies only while `asOf ≤ createdAt` (equal timestamps are
ambiguous). After that the server's numbers win. A failed claim gets no local change and triggers a
refetch. *Alternatives:*
- Raw snapshot plus a banner: the balance looks unchanged, so users claim again.
- Naive optimistic update: a stale refetch undoes it, so the balance drops and then jumps back up.

**3. If a claim's result is unknown, the app resends it with the same Idempotency-Key.** The key is saved
before the first send. After a 504, a timeout or a 5xx, the app resends up to 3 times (1/2/4 s), then
shows "It may have gone through" with *Check again*. That asset stays blocked until the result is known.
- A 400 on a resend means no claim was created.
- A 409 means a bug in the app, so it is not retried.

*Rejected:* a new key (risks a duplicate claim) and matching rows in the activity history by amount (a
guess). *Seen live:* a real 504; the resend returned the original claim, and there was exactly one claim.

**Assumptions:**
- The USD total is available + pending + claiming; pending is labelled "may be reversed".
- The token is kept in `localStorage` (readable by an injected script); claim data is tied to it and
  wiped when it changes.

## Working with AI (search `ai-logs/` for the quoted phrase)

1. **A prompt that missed.** The first plan took ~2 h for a ~1 h 35 slot, so I re-scoped it. I merged
   steps, moved tests next to `amount.ts`, added checkpoints and tied claim state to the token. I worked
   out the re-scoping in a second Claude chat (`ai-logs/claude-chat-*.md`). ("We're over budget")
2. **Wrong or risky output.** Two taps in one frame could submit with two different keys, which is two
   real claims. The AI caught this in its own review and fixed it ("Double-tap race"). It also chained
   `tsc ; … ; git commit`, so a commit that failed the type check landed (`9406882`). It reported this
   itself in its next step and added a fix commit (`5529826`).
3. **Pushing back.** I accepted its proposals for decisions 2 and 3 but changed four things: a strict
   timestamp comparison, no local change for failed claims, no retry on 409, and a cap of 3 resends.
   Before replying, I went through its options in a second Claude chat (`ai-logs/claude-chat-*.md`).
   ("C and A, with tweaks")

## Not done / known issues

- Checked the live link on a phone: everything works. Light theme only.
- `ClaimsProvider` has no automated tests. Next: test it against a mocked API covering 504→200, 400, 409
  and three failures in a row.
- Tabs don't share claim state, so two tabs could create two separate claims (never the same one twice).
- An unknown claim waits for *Check again*; nothing rechecks it automatically.
- If the browser blocks storage, the claim is still sent without its key being saved. After a reload,
  an unknown claim would be forgotten and its asset unblocked. Next: refuse to submit when the save fails.
- A malformed `usdPrice` would crash the screen, because it is parsed during rendering. Next: parse it
  when balances load, so it shows the error state with Retry instead.
