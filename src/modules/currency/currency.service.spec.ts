import { beforeEach, describe, expect, it, vi } from "vitest";
import { currencyService, supportedCurrencies } from "./currency.service";

describe("currencyService", () => {
  beforeEach(() => {
    currencyService.resetCacheForTests();
    vi.unstubAllGlobals();
  });

  it("publishes validated live rates from the USD base", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            { date: "2026-08-12", base: "USD", quote: "MYR", rate: 4.5 },
            { date: "2026-08-12", base: "USD", quote: "EUR", rate: 0.9 },
            { date: "2026-08-12", base: "USD", quote: "GBP", rate: 0.8 },
            { date: "2026-08-12", base: "USD", quote: "SGD", rate: 1.3 },
            { date: "2026-08-12", base: "USD", quote: "AUD", rate: 1.5 },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const result = await currencyService.publicConfig();

    expect(result.baseCurrency).toBe("USD");
    expect(result.rentalCurrency).toBe("USD");
    expect(result.rates.USD).toBe(1);
    for (const currency of supportedCurrencies) {
      expect(result.supportedCurrencies).toContain(currency);
      expect(result.rates[currency]).toBeGreaterThan(0);
    }
    expect(result.rateMode).toBe("live_reference_rates");
    expect(result.rateProvider).toBe("frankfurter");

    const transaction = await currencyService.transactionSnapshot(308, "USD", "EUR");
    expect(transaction.displayCurrency).toBe("EUR");
    expect(transaction.displayAmount).toBe(277.2);
    expect(transaction.transactionCurrency).toBe("USD");
  });

  it("uses configured rates when the live provider fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("provider offline")));

    const result = await currencyService.publicConfig();

    expect(result.settlementNotice).toContain("settlement remain");
    expect(result.rideCurrency).toBe("MYR");
    expect(result.rateMode).toBe("configured_fallback");
    expect(result.rates.USD).toBe(1);
  });
});
