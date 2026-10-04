// @ts-check
// GENERATED from apps-script/domain/dates.js by scripts/sync-shared.js. Do not edit here:
// edit that file and run `npm run sync:shared`.

/**
 * Date-only arithmetic on ISO 'YYYY-MM-DD' text. Dates are stored as that text and shown as
 * DD/MM/YYYY; "today" is the date in Europe/London. Arithmetic works on UTC midnights, so clock
 * changes never move a date.
 *
 * Shared with the phone app: scripts/sync-shared.js copies this file to pwa/shared/.
 */
const Dates = (() => {
  const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const ZONE = 'Europe/London';

  /** @param {unknown} iso @returns {iso is string} */
  function isValid(iso) {
    if (typeof iso !== 'string') return false;
    const m = ISO.exec(iso);
    if (!m) return false;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const date = new Date(Date.UTC(y, mo - 1, d));
    return y >= 1900 && y <= 2200 && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
  }

  /** @param {string} iso */
  function toUtc(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  }

  /** @param {number} ms */
  const fromUtc = (ms) => new Date(ms).toISOString().slice(0, 10);

  /** @param {string} iso @param {number} days */
  const addDays = (iso, days) => fromUtc(toUtc(iso) + days * DAY_MS);

  /** Whole days from `from` to `to` (negative if `to` is earlier). @param {string} from @param {string} to */
  const daysBetween = (from, to) => Math.round((toUtc(to) - toUtc(from)) / DAY_MS);

  /** @param {number} year @param {number} month0  0 = January */
  const daysInMonth = (year, month0) => new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();

  /**
   * Adds calendar months, keeping the day but clamping to the month's end:
   * 31 Jan + 1 month = 28 Feb (29 in a leap year).
   * @param {string} iso @param {number} months
   */
  function addMonths(iso, months) {
    const [y, m, d] = iso.split('-').map(Number);
    const total = (m - 1) + months;
    const year = y + Math.floor(total / 12);
    const month0 = ((total % 12) + 12) % 12;
    return fromUtc(Date.UTC(year, month0, Math.min(d, daysInMonth(year, month0))));
  }

  /** 29 Feb + 1 year = 28 Feb. @param {string} iso @param {number} years */
  const addYears = (iso, years) => addMonths(iso, years * 12);

  /**
   * The date in the UK at a moment.
   * @param {Date} [now]
   */
  function londonDate(now = new Date()) {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  }

  /** '2026-10-09' → '09/10/2026'. @param {string|null|undefined} iso */
  function formatUk(iso) {
    if (!isValid(iso)) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  /** '09/10/2026' → '2026-10-09', or null if it is not a real date. @param {string} text */
  function parseUk(text) {
    const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(text);
    if (!m) return null;
    const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return isValid(iso) ? iso : null;
  }

  /**
   * The next date on or after `today` that falls on a yearly 'MM-DD' (29 Feb falls back to 28 Feb).
   * @param {string} monthDay  'MM-DD'
   * @param {string} today
   */
  function nextYearly(monthDay, today) {
    const [m, d] = monthDay.split('-').map(Number);
    const year = Number(today.slice(0, 4));
    /** @param {number} y */
    const on = (y) => fromUtc(Date.UTC(y, m - 1, Math.min(d, daysInMonth(y, m - 1))));
    const thisYear = on(year);
    return thisYear >= today ? thisYear : on(year + 1);
  }

  /** 0 for Monday … 6 for Sunday (weeks run Monday to Sunday, ADR-004). @param {string} iso */
  const weekdayIndex = (iso) => (new Date(toUtc(iso)).getUTCDay() + 6) % 7;

  /** The Monday of the week holding `iso`. @param {string} iso */
  const weekStart = (iso) => addDays(iso, -weekdayIndex(iso));

  /**
   * The day an entry made now belongs to: the date in the UK `cutoffHours` hours ago, so a session
   * logged at 01:30 counts for the evening before (ADR-004).
   * @param {Date} now @param {number} cutoffHours
   */
  const dayAt = (now, cutoffHours) => londonDate(new Date(now.getTime() - cutoffHours * 60 * 60 * 1000));

  /** 'Mon 5 Oct'. @param {string} iso */
  function shortDay(iso) {
    const d = new Date(toUtc(iso));
    const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${names[weekdayIndex(iso)]} ${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
  }

  return { ZONE, isValid, addDays, daysBetween, daysInMonth, addMonths, addYears, londonDate, formatUk, parseUk, nextYearly,
    weekdayIndex, weekStart, dayAt, shortDay };
})();

export { Dates };
