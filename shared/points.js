// @ts-check
// GENERATED from apps-script/domain/points.js by scripts/sync-shared.js. Do not edit here:
// edit that file and run `npm run sync:shared`.

/**
 * Points for a log (ADR-009): the full version earns the track's points, a minimum version the minimum,
 * a stretch item (the ride) a bonus on top, a skip nothing. A weekly or stretch item earns nothing beyond
 * its weekly target plus the extras cap (ADR-008). Values come from the Rules tab.
 *
 * Shared with the phone app: scripts/sync-shared.js copies this file to pwa/shared/.
 */
const Points = (() => {
  /** A whole number from a Rules value, or 0. @param {string|null|undefined} value */
  const num = (value) => (/^\d+$/.test(String(value ?? '').trim()) ? Number(String(value).trim()) : 0);

  /**
   * @param {'full'|'minimum'|'skipped'} variant
   * @param {ScheduleItem} item
   * @param {Record<string, string|null>} rules
   * @param {number} doneEarlierThisWeek  this item's other done logs this week (not this one)
   * @returns {{ amount: number, reason: string }}
   */
  function forLog(variant, item, rules, doneEarlierThisWeek) {
    if (variant === 'skipped') return { amount: 0, reason: `${item.label} skipped` };
    if (item.mode !== 'fixed' && doneEarlierThisWeek >= (item.times_per_week ?? 1) + num(rules.extras_cap)) {
      return { amount: 0, reason: `${item.label}: over this week's limit` };
    }
    if (variant === 'minimum') return { amount: num(rules.points_minimum), reason: `${item.label} (minimum)` };
    const bonus = item.mode === 'stretch' ? num(rules.stretch_bonus) : 0;
    return { amount: num(rules[`points_${item.track_id}`]) + bonus, reason: bonus ? `${item.label} (stretch bonus)` : item.label };
  }

  /** Points earned between two dates, inclusive. @param {PointEntry[]} points @param {string} from @param {string} to */
  const earned = (points, from, to) => points.filter((p) => !p.deleted && p.type === 'earn' && p.date >= from && p.date <= to)
    .reduce((sum, p) => sum + (p.amount ?? 0), 0);

  return { num, forLog, earned };
})();

export { Points };
