/// <reference types="jest" />
// TypeScript 6 no longer auto-includes global @types packages, so the Jest globals are referenced here.
import {
  checkClaimAmount,
  formatAmountDisplay,
  formatUnits,
  formatUsd,
  normalizeInput,
  parseAmount,
  toCents,
  toUnits,
  totalUsdCents,
} from "./amount";

// Live values from GET /v1/balances and /v1/claim-options?asset=ETH on 2026-10-20.
const ETH_AVAILABLE = "12.345678901234591676";

describe("parseAmount", () => {
  it.each([
    ["0.5", 6, 500_000n],
    ["12", 6, 12_000_000n],
    ["0", 6, 0n],
    ["0.123456", 6, 123_456n],
    ["0.00012", 8, 12_000n],
  ])("parses %s with %i decimals", (value, decimals, units) => {
    expect(parseAmount(value, decimals)).toEqual({ ok: true, units });
  });

  it.each([".5", "1.", "05", "00", "1e-3", "-1", "1,5", " 1", "1.2.3", "abc", "+1"])(
    "rejects %p as bad format",
    (value) => {
      expect(parseAmount(value, 6)).toEqual({ ok: false, error: "format" });
    },
  );

  it("rejects empty input", () => {
    expect(parseAmount("", 6)).toEqual({ ok: false, error: "empty" });
  });

  it("rejects more places than the asset allows", () => {
    expect(parseAmount("0.1234567", 6)).toEqual({ ok: false, error: "too_many_decimals" });
    expect(parseAmount("0.123456789", 8)).toEqual({ ok: false, error: "too_many_decimals" });
  });

  it("keeps all 18 ETH decimals exactly, where a JS number cannot", () => {
    const parsed = parseAmount(ETH_AVAILABLE, 18);
    expect(parsed).toEqual({ ok: true, units: 12_345_678_901_234_591_676n });
    expect(String(Number(ETH_AVAILABLE))).not.toBe(ETH_AVAILABLE);
    expect(formatUnits(toUnits(ETH_AVAILABLE, 18), 18)).toBe(ETH_AVAILABLE);
  });
});

describe("toUnits / formatUnits", () => {
  it("handles signed API amounts", () => {
    expect(toUnits("-0.5", 18)).toBe(-500_000_000_000_000_000n);
    expect(formatUnits(-500_000_000_000_000_000n, 18)).toBe("-0.5");
  });

  it("throws on malformed API data instead of guessing", () => {
    expect(() => toUnits("1e-3", 6)).toThrow();
    expect(() => toUnits("0.1234567", 6)).toThrow();
  });

  it("writes canonical strings without trailing zeros", () => {
    expect(formatUnits(500_000n, 6)).toBe("0.5");
    expect(formatUnits(12_000_000n, 6)).toBe("12");
    expect(formatUnits(0n, 6)).toBe("0");
    expect(formatUnits(1n, 18)).toBe("0.000000000000000001");
  });
});

describe("formatAmountDisplay", () => {
  it("cuts toward zero and marks the cut", () => {
    expect(formatAmountDisplay(toUnits(ETH_AVAILABLE, 18), 18)).toBe("12.3456789…");
    expect(formatAmountDisplay(1n, 18)).toBe("0.0…");
  });

  it("groups thousands and keeps short values as they are", () => {
    expect(formatAmountDisplay(toUnits("820.413207", 6), 6)).toBe("820.413207");
    expect(formatAmountDisplay(toUnits("1234567.5", 6), 6)).toBe("1,234,567.5");
    expect(formatAmountDisplay(toUnits("-0.0275", 18), 18)).toBe("-0.0275");
  });
});

describe("normalizeInput", () => {
  it("accepts a comma separator and stray spaces", () => {
    expect(normalizeInput(" 0,5 ")).toBe("0.5");
    expect(normalizeInput("1 000")).toBe("1000");
  });
});

describe("checkClaimAmount (ETH: min 0.01, fee 0.0012)", () => {
  const eth = {
    decimals: 18,
    minAmount: toUnits("0.01", 18),
    fee: toUnits("0.0012", 18),
    available: toUnits(ETH_AVAILABLE, 18),
  };
  const check = (input: string, overrides: Partial<typeof eth> = {}) =>
    checkClaimAmount({ ...eth, ...overrides, input });

  it("accepts exactly the minimum and computes receive = amount - fee", () => {
    expect(check("0.01")).toEqual({ ok: true, amount: toUnits("0.01", 18), receive: toUnits("0.0088", 18) });
  });

  it("accepts exactly the available amount (Max)", () => {
    const result = check(ETH_AVAILABLE);
    expect(result.ok && formatUnits(result.receive, 18)).toBe("12.344478901234591676");
  });

  it("rejects one unit above available", () => {
    expect(check("12.345678901234591677")).toEqual({ ok: false, error: "above_available" });
  });

  it("rejects below the minimum, including zero", () => {
    expect(check("0.0099")).toEqual({ ok: false, error: "below_min" });
    expect(check("0")).toEqual({ ok: false, error: "below_min" });
  });

  it("rejects amounts the fee would eat entirely", () => {
    expect(check("0.0012", { minAmount: toUnits("0.001", 18) })).toEqual({
      ok: false,
      error: "fee_exceeds_amount",
    });
  });

  it("passes format errors through, after normalizing a comma", () => {
    expect(check(".5")).toEqual({ ok: false, error: "format" });
    expect(check("")).toEqual({ ok: false, error: "empty" });
    expect(check("0,5").ok).toBe(true);
    expect(check("0.0000000000000000001")).toEqual({ ok: false, error: "too_many_decimals" });
  });
});

describe("USD totals", () => {
  // Expected values computed independently with Python's decimal module.
  const live = [
    { decimals: 6, usdPrice: "1.0002", available: "820.413207", pending: "50.12", claiming: "0" },
    { decimals: 8, usdPrice: "67312.45", available: "0.01234567", pending: "0.00012", claiming: "0" },
    { decimals: 18, usdPrice: "2461.08", available: ETH_AVAILABLE, pending: "0.02", claiming: "0" },
  ];

  it("sums all buckets across assets exactly and rounds once", () => {
    const cents = totalUsdCents(
      live.map((b) => ({
        decimals: b.decimals,
        usdPrice: b.usdPrice,
        units: toUnits(b.available, b.decimals) + toUnits(b.pending, b.decimals) + toUnits(b.claiming, b.decimals),
      })),
    );
    expect(cents).toBe(3_214_273n);
    expect(formatUsd(cents)).toBe("$32,142.73");
  });

  it("sums only what is claimable now", () => {
    const cents = totalUsdCents(
      live.map((b) => ({ decimals: b.decimals, usdPrice: b.usdPrice, units: toUnits(b.available, b.decimals) })),
    );
    expect(formatUsd(cents)).toBe("$32,035.30");
  });

  it("rounds half away from zero", () => {
    expect(toCents({ units: 12_345n, scale: 3 })).toBe(1235n);
    expect(toCents({ units: 12_344n, scale: 3 })).toBe(1234n);
    expect(toCents({ units: -12_345n, scale: 3 })).toBe(-1235n);
    expect(toCents({ units: 5n, scale: 1 })).toBe(50n);
  });

  it("formats cents", () => {
    expect(formatUsd(5n)).toBe("$0.05");
    expect(formatUsd(0n)).toBe("$0.00");
    expect(formatUsd(-100n)).toBe("-$1.00");
  });
});
