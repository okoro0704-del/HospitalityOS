import {
  CURRENCY_EXPONENTS,
  type Money,
  type SupportedCurrency,
  SUPPORTED_CURRENCIES,
} from "@hospitalityos/shared";

export function currencyExponent(currency: string): number {
  if ((SUPPORTED_CURRENCIES as readonly string[]).includes(currency)) {
    return CURRENCY_EXPONENTS[currency as SupportedCurrency];
  }
  return 2;
}

export function money(amountMinor: number, currency: string): Money {
  if (!Number.isInteger(amountMinor)) {
    throw Object.assign(new Error("Money amount must be an integer (minor units)"), {
      code: "invalid_money",
      statusCode: 400,
    });
  }
  return { amount: amountMinor, currency };
}

export function majorToMinor(major: number, currency: string): number {
  const exp = currencyExponent(currency);
  const factor = 10 ** exp;
  return Math.round(major * factor);
}

export function minorToMajor(minor: number, currency: string): number {
  const exp = currencyExponent(currency);
  return minor / 10 ** exp;
}

export function assertSameCurrency(a: string, b: string) {
  if (a !== b) {
    throw Object.assign(new Error(`Currency mismatch: ${a} vs ${b}`), {
      code: "currency_mismatch",
      statusCode: 400,
    });
  }
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a.currency, b.currency);
  return money(a.amount + b.amount, a.currency);
}

export function subMoney(a: Money, b: Money): Money {
  assertSameCurrency(a.currency, b.currency);
  return money(a.amount - b.amount, a.currency);
}

/** Apply tax in basis points to a net (exclusive) amount. */
export function taxOnExclusive(netMinor: number, rateBps: number): number {
  return Math.round((netMinor * rateBps) / 10_000);
}

/** Extract tax from tax-inclusive amount. */
export function taxFromInclusive(grossMinor: number, rateBps: number): number {
  return Math.round((grossMinor * rateBps) / (10_000 + rateBps));
}
