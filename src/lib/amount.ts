// Amounts arrive as decimal strings. Here they become bigint "units" (value × 10^decimals of the asset),
// so comparisons, fee, receive amount and sums are exact integer math. Nothing goes through floats:
// ETH has 18 decimals, more than a JS number can hold.

/** The API's amount format: digits, optional dot and more digits, no leading zeros. */
const API_DECIMAL = /^(0|[1-9]\d*)(?:\.(\d+))?$/;

export type AmountError = "empty" | "format" | "too_many_decimals";
export type ParseResult = { ok: true; units: bigint } | { ok: false; error: AmountError };

const pow10 = (n: number) => 10n ** BigInt(n);

/** Strictly parses a non-negative API-format decimal with at most `decimals` places. */
export function parseAmount(value: string, decimals: number): ParseResult {
  if (value === "") return { ok: false, error: "empty" };
  const match = API_DECIMAL.exec(value);
  if (!match) return { ok: false, error: "format" };
  const fraction = match[2] ?? "";
  if (fraction.length > decimals) return { ok: false, error: "too_many_decimals" };
  return { ok: true, units: BigInt(match[1]) * pow10(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0") };
}

/** Parses an amount received from the API (may be signed). Throws on anything malformed. */
export function toUnits(value: string, decimals: number): bigint {
  const negative = value.startsWith("-");
  const parsed = parseAmount(negative ? value.slice(1) : value, decimals);
  if (!parsed.ok) throw new Error(`Malformed amount from API: "${value}" (${parsed.error})`);
  return negative ? -parsed.units : parsed.units;
}

/** Units back to the canonical API string: "0.5", "12", never trailing zeros. */
export function formatUnits(units: bigint, decimals: number): string {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const base = pow10(decimals);
  const fraction = (abs % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${abs / base}${fraction ? `.${fraction}` : ""}`;
}

/**
 * For display only: thousands separators and at most `maxFractionDigits` places, cut toward zero
 * (never shows more than there is). An ellipsis marks digits that were cut.
 */
export function formatAmountDisplay(units: bigint, decimals: number, maxFractionDigits = 8): string {
  const [int, fraction = ""] = formatUnits(units, decimals).split(".");
  const shown = fraction.slice(0, maxFractionDigits).replace(/0+$/, "");
  const cut = fraction.length > maxFractionDigits ? "…" : "";
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${shown || cut ? `.${shown || "0"}` : ""}${cut}`;
}

/** What the user typed → candidate API string: drops spaces, accepts "," as the decimal separator. */
export function normalizeInput(raw: string): string {
  return raw.replace(/\s/g, "").replace(",", ".");
}

export type ClaimAmountError = AmountError | "below_min" | "above_available" | "fee_exceeds_amount";
export type ClaimAmountCheck =
  | { ok: true; amount: bigint; receive: bigint }
  | { ok: false; error: ClaimAmountError };

/** The API's claim rules: valid format, at most `decimals` places, minAmount <= amount <= available. Plus receive > 0. */
export function checkClaimAmount(p: {
  input: string;
  decimals: number;
  minAmount: bigint;
  available: bigint;
  fee: bigint;
}): ClaimAmountCheck {
  const parsed = parseAmount(normalizeInput(p.input), p.decimals);
  if (!parsed.ok) return parsed;
  const amount = parsed.units;
  if (amount < p.minAmount) return { ok: false, error: "below_min" };
  if (amount > p.available) return { ok: false, error: "above_available" };
  // The fee is taken from the claimed amount.
  const receive = amount - p.fee;
  if (receive <= 0n) return { ok: false, error: "fee_exceeds_amount" };
  return { ok: true, amount, receive };
}

/** An exact decimal: units / 10^scale. */
export type Exact = { units: bigint; scale: number };

function parseExact(value: string): Exact {
  const scale = value.split(".")[1]?.length ?? 0;
  return { units: toUnits(value, scale), scale };
}

/** Exact USD value of `units` of an asset with `decimals`, at `usdPrice` per unit. */
export function usdValue(units: bigint, decimals: number, usdPrice: string): Exact {
  const price = parseExact(usdPrice);
  return { units: units * price.units, scale: decimals + price.scale };
}

export function sumExact(values: Exact[]): Exact {
  const scale = Math.max(0, ...values.map((v) => v.scale));
  return { units: values.reduce((sum, v) => sum + v.units * pow10(scale - v.scale), 0n), scale };
}

/** Rounds to whole cents, half away from zero. Rounding happens once, after summing. */
export function toCents(value: Exact): bigint {
  if (value.scale <= 2) return value.units * pow10(2 - value.scale);
  const divisor = pow10(value.scale - 2);
  const abs = value.units < 0n ? -value.units : value.units;
  const cents = (abs + divisor / 2n) / divisor;
  return value.units < 0n ? -cents : cents;
}

export function formatUsd(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const dollars = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}$${dollars}.${(abs % 100n).toString().padStart(2, "0")}`;
}

/** Total USD in cents of the given per-asset amounts, rounded once at the end. */
export function totalUsdCents(items: { units: bigint; decimals: number; usdPrice: string }[]): bigint {
  return toCents(sumExact(items.map((i) => usdValue(i.units, i.decimals, i.usdPrice))));
}
