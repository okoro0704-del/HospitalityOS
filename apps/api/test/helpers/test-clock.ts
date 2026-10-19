/**
 * Controlled test dates.
 *
 * Several suites book against fixed calendar dates. Once a date passes, the booking
 * policy (minimum notice / maximum advance) correctly rejects it and the test starts
 * failing for a reason unrelated to the code under test — sprint4 did on 2026-10-01.
 *
 * `futureDates(anchor)` keeps a suite's fixed dates exactly as written — weekday,
 * time of day and the gaps between them — and moves the whole set forward by whole
 * weeks until the anchor (the suite's earliest date) is at least `leadDays` ahead of
 * the real clock. Business rules are untouched: the dates simply stay in the future.
 */
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

export function futureDates(anchorIso: string, opts: { leadDays?: number; now?: number } = {}) {
  const anchor = Date.parse(anchorIso);
  if (Number.isNaN(anchor)) throw new Error(`futureDates: invalid anchor ${anchorIso}`);
  const earliestAllowed = (opts.now ?? Date.now()) + (opts.leadDays ?? 7) * DAY_MS;
  const weeks = Math.max(0, Math.ceil((earliestAllowed - anchor) / WEEK_MS));
  const shiftMs = weeks * WEEK_MS;

  /** Shift one fixed date. Date-only inputs (YYYY-MM-DD) come back date-only. */
  return function at(iso: string): string {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) throw new Error(`futureDates: invalid date ${iso}`);
    if (t < anchor) throw new Error(`futureDates: ${iso} is earlier than the anchor ${anchorIso}`);
    const shifted = new Date(t + shiftMs).toISOString();
    return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? shifted.slice(0, 10) : shifted;
  };
}
