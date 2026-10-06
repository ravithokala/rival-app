// @ts-check
// GENERATED from apps-script/domain/points.js by scripts/sync-shared.js. Do not edit here:
// edit that file and run `npm run sync:shared`.
import { Dates } from './dates.js';
import { Model } from './model.js';

/**
 * Points for a log (ADR-009): the full version earns the track's points, a minimum version the minimum,
 * a stretch item (the ride) a bonus on top, a skip nothing. A weekly or stretch item earns nothing beyond
 * its weekly target plus the extras cap (ADR-008). An extra (the TV-free evening, an early night) earns its track's
 * points; the TV-free evening also earns the swap bonus when a habit was done that day, and an early night after a Friday,
 * Saturday or Sunday night (asked on Saturday, Sunday and Monday mornings) the weekend night bonus (ADR-024). A full business
 * block on a Saturday or Sunday earns the weekend bonus (ADR-027). Values come from the Rules tab.
 *
 * Shared with the phone app: scripts/sync-shared.js copies this file to pwa/shared/.
 */
const Points = (() => {
  /** A whole number from a Rules value, or 0. @param {string|null|undefined} value */
  const num = (value) => (/^\d+$/.test(String(value ?? '').trim()) ? Number(String(value).trim()) : 0);

  /** The mornings after Friday, Saturday and Sunday nights: an early night then earns the weekend night bonus (ADR-024). */
  const WEEKEND_NIGHT_MORNINGS = Object.freeze(['Sat', 'Sun', 'Mon']);
  /** The weekend night bonus: the Rules value, or 5 while the Rules tab does not have it yet. @param {Record<string, string|null>} rules */
  const weekendNightBonus = (rules) => (rules.sleep_weekend_bonus === undefined ? 5 : num(rules.sleep_weekend_bonus));

  /** A full business block on a Saturday or Sunday earns this on top (ADR-027): the Rules value, or 10 until the tab has it. @param {Record<string, string|null>} rules */
  const businessWeekendBonus = (rules) => (rules.business_weekend_bonus === undefined ? 10 : num(rules.business_weekend_bonus));

  /** Saturday or Sunday. @param {string} date */
  const isWeekend = (date) => Dates.isValid(date) && Dates.weekdayIndex(date) >= 5;

  /**
   * @param {'full'|'minimum'|'skipped'} variant
   * @param {ScheduleItem} item
   * @param {Record<string, string|null>} rules
   * @param {number} doneEarlierThisWeek  this item's other done logs this week (not this one)
   * @param {number} [habitsDoneToday]  for an extra: the habits done that day (the swap bonus)
   * @param {string} [date]  the day it counts for: an early night on a weekend morning earns the weekend night bonus
   * @returns {{ amount: number, reason: string }}
   */
  function forLog(variant, item, rules, doneEarlierThisWeek, habitsDoneToday = 0, date = '') {
    if (variant === 'skipped') return { amount: 0, reason: `${item.label} skipped` };
    // An early night (a habit, or still a bonus toggle in an older Sheet) after a Friday, Saturday or Sunday night.
    if (item.track_id === 'sleep' && Dates.isValid(date) && WEEKEND_NIGHT_MORNINGS.includes(Model.DAYS[Dates.weekdayIndex(date)])) {
      const bonus = weekendNightBonus(rules);
      return { amount: num(rules[`points_${item.track_id}`]) + bonus, reason: bonus ? `${item.label} (weekend night bonus)` : item.label };
    }
    // The TV-free evening (a check-in habit since ADR-026, or a bonus toggle in an older Sheet), and any other bonus toggle.
    if (item.extra || item.track_id === 'evening') {
      const swap = item.track_id === 'evening' && habitsDoneToday > 0 ? num(rules.tv_swap_bonus) : 0;
      return { amount: num(rules[`points_${item.track_id}`]) + swap, reason: swap ? `${item.label} (+ swap bonus)` : item.label };
    }
    if (item.mode !== 'fixed' && doneEarlierThisWeek >= (item.times_per_week ?? 1) + num(rules.extras_cap)) {
      return { amount: 0, reason: `${item.label}: over this week's limit` };
    }
    if (variant === 'minimum') return { amount: num(rules.points_minimum), reason: `${item.label} (minimum)` };
    // A full business block on a weekend earns more (ADR-027), daily or weekly (ADR-028).
    if (item.track_id === 'business' && item.mode !== 'stretch' && isWeekend(date)) {
      const extra = businessWeekendBonus(rules);
      return { amount: num(rules.points_business) + extra, reason: extra ? `${item.label} (weekend bonus)` : item.label };
    }
    const bonus = item.mode === 'stretch' ? num(rules.stretch_bonus) : 0;
    return { amount: num(rules[`points_${item.track_id}`]) + bonus, reason: bonus ? `${item.label} (stretch bonus)` : item.label };
  }

  /** Points earned between two dates, inclusive. @param {PointEntry[]} points @param {string} from @param {string} to */
  const earned = (points, from, to) => points.filter((p) => !p.deleted && p.type === 'earn' && p.date >= from && p.date <= to)
    .reduce((sum, p) => sum + (p.amount ?? 0), 0);

  /** The balance: every point earned minus every point spent (spend rows hold the cost). @param {PointEntry[]} points */
  const balance = (points) => points.filter((p) => !p.deleted).reduce((sum, p) => sum + (p.type === 'earn' ? p.amount ?? 0 : p.type === 'spend' ? -(p.amount ?? 0) : 0), 0);

  return { num, WEEKEND_NIGHT_MORNINGS, isWeekend, forLog, earned, balance };
})();

export { Points };
