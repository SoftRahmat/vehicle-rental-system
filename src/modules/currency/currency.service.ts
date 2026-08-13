import config from "../../config";

export const supportedCurrencies = ["USD", "MYR", "EUR", "GBP", "SGD", "AUD"] as const;
export type SupportedCurrency = (typeof supportedCurrencies)[number];

const isPositiveRate = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const ratesFromUsd = (): Record<SupportedCurrency, number> => {
  const fallback: Record<SupportedCurrency, number> = {
    USD: 1,
    MYR: 4.45,
    EUR: 0.92,
    GBP: 0.78,
    SGD: 1.35,
    AUD: 1.52,
  };

  if (!config.currencyRatesJson) return fallback;

  try {
    const configured = JSON.parse(config.currencyRatesJson) as Record<string, unknown>;
    return supportedCurrencies.reduce(
      (rates, currency) => ({
        ...rates,
        [currency]: isPositiveRate(configured[currency])
          ? configured[currency]
          : fallback[currency],
      }),
      {} as Record<SupportedCurrency, number>,
    );
  } catch {
    console.warn("CURRENCY_RATES_JSON is invalid; using Roadly fallback display rates");
    return fallback;
  }
};

interface ProviderRate {
  date: string;
  base: string;
  quote: string;
  rate: number;
}

interface RateSnapshot {
  rates: Record<SupportedCurrency, number>;
  source: "frankfurter" | "configured_fallback";
  updatedAt: string;
  expiresAt: number;
}

let cachedSnapshot: RateSnapshot | null = null;
let currentRequest: Promise<RateSnapshot> | null = null;

const fallbackSnapshot = (): RateSnapshot => ({
  rates: ratesFromUsd(),
  source: "configured_fallback",
  updatedAt: config.currencyRatesUpdatedAt,
  expiresAt: Date.now() + config.currencyRatesFallbackRetryMinutes * 60_000,
});

const liveSnapshot = async (): Promise<RateSnapshot> => {
  if (!config.liveCurrencyRatesEnabled) return fallbackSnapshot();

  const quotes = supportedCurrencies.filter((currency) => currency !== "USD").join(",");
  const url = new URL(config.currencyRatesProviderUrl);
  url.searchParams.set("base", "USD");
  url.searchParams.set("quotes", quotes);

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(config.currencyRatesTimeoutMs),
    });
    if (!response.ok) throw new Error(`FX provider returned ${response.status}`);

    const providerRates = (await response.json()) as ProviderRate[];
    if (!Array.isArray(providerRates)) throw new Error("FX provider response is invalid");

    const fallback = ratesFromUsd();
    const rates = providerRates.reduce(
      (result, item) => {
        const quote = item.quote?.toUpperCase() as SupportedCurrency;
        if (supportedCurrencies.includes(quote) && isPositiveRate(item.rate)) {
          result[quote] = item.rate;
        }
        return result;
      },
      { ...fallback, USD: 1 },
    );
    const providerDate = providerRates
      .map(({ date }) => date)
      .filter(Boolean)
      .sort()
      .at(-1);

    return {
      rates,
      source: "frankfurter",
      updatedAt: providerDate
        ? new Date(`${providerDate}T00:00:00.000Z`).toISOString()
        : new Date().toISOString(),
      expiresAt: Date.now() + config.currencyRatesCacheMinutes * 60_000,
    };
  } catch (error) {
    console.warn(
      `Live currency rates unavailable; using configured fallback: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    return fallbackSnapshot();
  }
};

const currentSnapshot = async (): Promise<RateSnapshot> => {
  if (cachedSnapshot && cachedSnapshot.expiresAt > Date.now()) return cachedSnapshot;
  if (currentRequest) return currentRequest;

  currentRequest = liveSnapshot().then((snapshot) => {
    cachedSnapshot = snapshot;
    currentRequest = null;
    return snapshot;
  });
  return currentRequest;
};

const isSupportedCurrency = (value: string): value is SupportedCurrency =>
  supportedCurrencies.includes(value.toUpperCase() as SupportedCurrency);

const transactionSnapshot = async (
  amount: number,
  transactionCurrency: string,
  requestedDisplayCurrency?: string,
) => {
  const source = transactionCurrency.toUpperCase();
  if (!isSupportedCurrency(source)) {
    throw Object.assign(new Error("Unsupported transaction currency"), {
      status: 400,
    });
  }
  const requested = requestedDisplayCurrency?.toUpperCase() ??
    config.defaultDisplayCurrency.toUpperCase();
  if (!isSupportedCurrency(requested)) {
    throw Object.assign(new Error("Unsupported display currency"), {
      status: 400,
    });
  }

  const snapshot = await currentSnapshot();
  const exchangeRate = snapshot.rates[requested] / snapshot.rates[source];
  return {
    transactionCurrency: source,
    displayCurrency: requested,
    exchangeRate,
    displayAmount: Math.round((amount * exchangeRate + Number.EPSILON) * 100) / 100,
    exchangeRateSource: snapshot.source,
    exchangeRateCapturedAt: new Date(),
  };
};

export const currencyService = {
  async publicConfig() {
    const snapshot = await currentSnapshot();
    return {
      baseCurrency: "USD" as const,
      rentalCurrency: "USD" as const,
      rideCurrency: config.ridesCurrency.toUpperCase(),
      defaultDisplayCurrency: config.defaultDisplayCurrency,
      supportedCurrencies: [...supportedCurrencies],
      rates: snapshot.rates,
      rateMode:
        snapshot.source === "frankfurter"
          ? ("live_reference_rates" as const)
          : ("configured_fallback" as const),
      rateProvider: snapshot.source,
      rateUpdatedAt: snapshot.updatedAt,
      settlementNotice:
        "Display currency conversion is indicative. Checkout and settlement remain in each product's transaction currency.",
    };
  },
  resetCacheForTests() {
    cachedSnapshot = null;
    currentRequest = null;
  },
  transactionSnapshot,
};
