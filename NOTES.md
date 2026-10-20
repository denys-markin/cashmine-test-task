# Notes

## Decisions

**1. Amounts: exact integers (`bigint`) in the asset's smallest unit.** Every API string is parsed strictly
(the API's own format, at most `decimals` places) into `value × 10^decimals`. Comparisons, fee, receive
amount and sums are integer math; the canonical string is rebuilt for the request (`src/lib/amount.ts`).
*Why:* ETH has 18 decimals. `Number("12.345678901234591676")` is `12.345678901234592`, so "Max" would send
a different value than `available`. *Alternatives:* a decimal library (an extra dependency; decimal.js
defaults to 20 significant digits and can round silently); JS `number` (wrong for this API).
USD is display-only. Each value is computed exactly, summed, and rounded **once** to cents (half away
from zero). Balance amounts are cut toward zero for display with a "…" (they never overstate). The review
screen shows exact values, and Activity shows the API strings verbatim.

**2. Balance right after a claim: overlay, reconciled by `asOf`.** After a confirmed 201, the app moves the
amount from available to claiming (or out, once completed), but only for snapshots **strictly older**
than the event. Equal timestamps are ambiguous, so the overlay stays one snapshot longer. Once a snapshot
with `asOf > createdAt` (or `> updatedAt`) arrives, server numbers are used as they are. A failed claim
gets no overlay and triggers an immediate refetch. While a claim is in flight, Home shows a banner and
re-fetches every 5 s (`src/features/claim/overlay.ts`, tested).
*Alternatives:*
- Server snapshot plus a banner: honest, but `available` looks unchanged for up to 15 s, which leads to "I claimed again".
- Naive optimistic update: a refetch returns a pre-claim snapshot, so the balance drops and then jumps back up.

The `asOf` rule fixes both complaints.

**3. Unknown result (504, timeout, network error, 5xx): replay the same Idempotency-Key.** The key and
body are written to storage (scoped to the token) **before** the first request. On an unknown outcome
the app replays the same key automatically 3 times (1 s / 2 s / 4 s; a 429's `retryAfterMs` wins), showing
"Confirming your claim…". After that, the user gets "It may have gone through. Don't submit it again"
and a **Check again** button. That asset can't be claimed until it's resolved, and a reload resumes the
check. On a replay:
- 400 means the claim was never created: the asset unblocks and the user can edit the amount.
- 409 is our bug: it is shown and never retried.

*Seen live:* my test claim got a 504 after 3.4 s, and the first replay returned **200** (the original
claim). Activity shows exactly one claim. *Rejected:* treating it as failed and retrying with a new key
(duplicate claim); matching Activity rows by amount and time (a guess).

**Others.**
- **Token.** Kept in `localStorage` and checked with `GET /v1/balances` before saving. Any 401 returns to the token screen. Changing the token wipes the token-scoped claim data, and balances live in memory only. Trade-off: anything that can run script on the page can read the token.
- **USD total (assumption).** available + pending + claiming. "Claimable now" is available only. Pending is labelled "may be reversed".
- **Destination.** The API requires one and ETH has two. It's preselected only when there is exactly one.
- **Input.** A comma is read as the decimal point and spaces are dropped. Everything else must match the API format, with clear messages.
- **GETs.** Retried on 429/5xx/network (twice); there is a 15 s client timeout. POST is never retried by the client itself.
- **Activity.** Deduplicated by `id`, because the cursor is offset-based.
- **Web output.** `single` (SPA): no server routes, no SSR mismatch on the stored token.
- **No data-fetching library.** The claim engine is a small state machine I can explain line by line.

## Working with AI

All in `ai-logs/` (search the quoted phrases).
1. **Prompt that didn't get what I wanted.** The first plan's estimates added up to ~2 h for a ~1 h 35 slot. I rewrote the instructions: merge the token gate and API client, write tests with `amount.ts` rather than at the end, add checkpoints at 13:20 and 13:40, always deploy `--prod`, and scope claim state to the token ("We're over budget").
2. **AI output that was wrong or risky.**
   - Reviewing its own claim screen, the agent found that two taps in one frame would call `submit()` twice with **two different idempotency keys**, i.e. two real claims. It's fixed with a synchronous ref guard ("Double-tap race").
   - Separately, it chained `tsc ; … ; git commit`, so a commit with a failing typecheck landed (`9406882`, fixed in `5529826`). A `| tail` had also hidden a failed lint. I caught both from the command output.
3. **Disagreed / rejected.** I accepted options C and A for decisions 2 and 3, but changed them: strict `asOf > createdAt` instead of `≥`, no overlay at all for failed claims, no retry on 409, 400-on-replay counts as "not created", and a cap of 3 replays ("C and A, with tweaks"). Earlier I also overrode the AI-written CLAUDE.md, which routed the token through a server API route that the brief forbids.

## Not done / known issues
- **Testing.** Tested at 390 px in a desktop browser only, not yet on a real phone. Light theme only.
- **Claim engine tests.** The engine (`ClaimsProvider`) has no automated tests; only the pure logic is unit-tested. Next: drive it with a mocked API covering 504→200, 400, 409, and 3 failures → unknown.
- **Several tabs.** Claim state isn't synced between tabs (no `storage` listener). Two tabs could create two separate claims, though never a duplicate of the same one.
- **Unknown claims.** They stay blocked until the user taps Check again; there's no automatic recheck later.
- **Pull-to-refresh.** None on web (React Native Web has no pull gesture); there's a Refresh button instead.
- **Activity.** No filters, and claim rows don't link to their status screen.
- **Polling.** Fixed intervals, with only 429 backoff.
