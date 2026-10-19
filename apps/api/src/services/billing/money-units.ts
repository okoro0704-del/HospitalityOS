/**
 * Money helpers — integer minor units only for financial persistence.
 * Never use floating point for ledger math.
 */
export function assertMinorUnit(amount: number, label = "amount"): number {
  if (!Number.isInteger(amount)) {
    throw Object.assign(new Error(`${label} must be an integer minor unit`), {
      code: "validation_error",
      statusCode: 400,
    });
  }
  if (amount < 0) {
    throw Object.assign(new Error(`${label} must be non-negative`), {
      code: "validation_error",
      statusCode: 400,
    });
  }
  return amount;
}

/** Convert major-unit display/input to minor units (e.g. 1500.50 → 150050). */
export function majorToMinor(major: number): number {
  if (!Number.isFinite(major) || major < 0) return 0;
  return Math.round(major * 100);
}

/** Convert minor units to major for display only. */
export function minorToMajor(minor: number): number {
  return assertMinorUnit(minor) / 100;
}

/**
 * Accept either already-minor integers or legacy major floats at API boundaries.
 * Prefer explicit `unitAmountMinor` in new callers.
 */
export function coerceToMinor(value: number, opts?: { treatAsMajor?: boolean }): number {
  if (opts?.treatAsMajor) return majorToMinor(value);
  if (Number.isInteger(value)) return assertMinorUnit(value);
  // Legacy float major units (e.g. 1500.5)
  return majorToMinor(value);
}

export function sumMinor(amounts: number[]): number {
  return amounts.reduce((s, a) => s + assertMinorUnit(a), 0);
}
