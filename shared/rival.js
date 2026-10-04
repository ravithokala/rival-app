// @ts-check
// GENERATED from apps-script/domain/rival.js by scripts/sync-shared.js. Do not edit here:
// edit that file and run `npm run sync:shared`.
import { Dates } from './dates.js';
import { Schedule } from './schedule.js';
import { Points } from './points.js';

/**
 * The Rival (ADR-010, ADR-019): a steady opponent. Each day it earns its baseline share (85% at first) of
 * what a perfect day is worth: the full points of that day's fixed items, plus a share of the week's weekly
 * targets spread over the days their track is not on a break. Break days count only the tracks kept; waived
 * weekly items and stretch items never count; skips do not feed it. The rubber band: two closed weeks in a
 * row under 80% of its score give it a setback week (70%); three wins in a row raise its baseline by 5,
 * up to 95%, for good. Pure: the phone draws the score from its copy, the server closes weeks with it.
 *
 * Shared with the phone app: scripts/sync-shared.js copies this file to pwa/shared/.
 */
const Rival = (() => {
  /** A Rules value as a number, or the default. @param {Record<string, string|null>} rules @param {string} key @param {number} fallback */
  const rule = (rules, key, fallback) => (Points.num(rules[key]) || fallback);

  /** The Weeks tab's closed weeks, oldest first. @param {WeekResult[]} weeks */
  const closed = (weeks) => (weeks ?? []).filter((w) => !w.deleted).sort((a, b) => (a.week_start < b.week_start ? -1 : 1));

  /**
   * The Rival's baseline for a week, from the closed weeks before it: { pct, setback }.
   * @param {WeekResult[]} weeks @param {string} weekStart @param {Record<string, string|null>} rules
   */
  function baseline(weeks, weekStart, rules) {
    const base = rule(rules, 'rival_baseline', 85);
    const step = rule(rules, 'rival_step', 5);
    const max = rule(rules, 'rival_max', 95);
    const behindRatio = rule(rules, 'behind_ratio', 80) / 100;
    let level = base;
    let wins = 0;
    let behind = 0;
    let setback = false;
    for (const w of closed(weeks).filter((x) => x.week_start < weekStart)) {
      if ((w.my_points ?? 0) > (w.rival_points ?? 0)) {
        wins += 1;
        if (wins === 3) { level = Math.min(max, level + step); wins = 0; }
      } else {
        wins = 0;
      }
      if ((w.my_points ?? 0) < behindRatio * (w.rival_points ?? 0)) behind += 1; else behind = 0;
      // Two weeks well behind give the Rival one setback week; then the count starts again.
      setback = behind >= 2;
      if (setback) behind = 0;
    }
    return { pct: setback ? rule(rules, 'rival_setback', 70) : level, setback };
  }

  /**
   * What a perfect day is worth (full points), for the Rival's daily share.
   * @param {PlanData} data @param {string} date
   */
  function perfectDay(data, date) {
    const weekStart = Dates.weekStart(date);
    const items = Schedule.activeItems(data, date);
    const full = (/** @type {ScheduleItem} */ i) => Points.forLog('full', i, data.rules, 0).amount;
    let sum = items.filter((i) => Schedule.dueOn(i, date)).reduce((s, i) => s + full(i), 0);
    for (const item of items.filter((i) => i.mode === 'weekly')) {
      /** @type {string[]} */
      const days = [];
      for (let d = weekStart; d <= Dates.addDays(weekStart, 6); d = Dates.addDays(d, 1)) {
        if (Schedule.activeItems(data, d).some((i) => i.schedule_id === item.schedule_id)) days.push(d);
      }
      // A week mostly on a break does not expect it (ADR-018), so neither does the Rival.
      const waived = 7 - days.length >= rule(data.rules, 'break_waive_days', 4);
      if (!waived && days.length) sum += (full(item) * (item.times_per_week ?? 1)) / days.length;
    }
    return sum;
  }

  /** The days of a week the plan covers: from the start date, up to `upTo`. @param {PlanData} data @param {string} weekStart @param {string} upTo */
  function days(data, weekStart, upTo) {
    const start = Dates.isValid(data.settings.start_date) ? /** @type {string} */ (data.settings.start_date) : null;
    /** @type {string[]} */
    const out = [];
    if (!start) return out;
    for (let d = weekStart; d <= Dates.addDays(weekStart, 6) && d <= upTo; d = Dates.addDays(d, 1)) if (d >= start) out.push(d);
    return out;
  }

  /**
   * Both scores for a week, up to and including `upTo` (the whole week once it has closed).
   * @param {PlanData & { points: PointEntry[], weeks: WeekResult[] }} data @param {string} weekStart @param {string} upTo
   * @returns {{ me: number, rival: number, pct: number, setback: boolean, perfect: number }}
   */
  function score(data, weekStart, upTo) {
    const { pct, setback } = baseline(data.weeks, weekStart, data.rules);
    const perfect = days(data, weekStart, Dates.addDays(weekStart, 6)).reduce((s, d) => s + perfectDay(data, d), 0);
    const sofar = days(data, weekStart, upTo).reduce((s, d) => s + perfectDay(data, d), 0);
    return { me: Points.earned(data.points, weekStart, Dates.addDays(weekStart, 6)), rival: Math.round((pct / 100) * sofar), pct, setback, perfect: Math.round(perfect) };
  }

  /**
   * Whether the week was perfect: every fixed item done (Minimum counts) on every day it was due and not on a
   * break, and every expected weekly target met. Stretch items are never required (ADR-008).
   * @param {PlanData} data @param {string} weekStart
   */
  function perfectWeek(data, weekStart) {
    const all = days(data, weekStart, Dates.addDays(weekStart, 6));
    if (!all.length) return false;
    const done = (/** @type {string} */ id, /** @type {string} */ d) => data.logs.some((l) => l.schedule_id === id && l.date === d && Schedule.isDone(l));
    for (const d of all) for (const i of Schedule.activeItems(data, d)) if (Schedule.dueOn(i, d) && !done(i.schedule_id, d)) return false;
    const week = Schedule.plan(data, Dates.addDays(weekStart, 6));
    return week.thisWeek.filter((w) => w.item.mode === 'weekly' && !w.waived).every((w) => w.done >= w.target);
  }

  /** Fills a line's {placeholders}; unknown ones stay as they are. @param {string} template @param {Record<string, string|number>} vars */
  const fill = (template, vars) => template.replace(/\{(\w+)\}/g, (all, key) => (key in vars ? String(vars[key]) : all));

  /**
   * One line for the first situation that has lines, not shown in the last 14 days if possible; the same
   * line all day for a situation (`shownToday`).
   * @param {string[]} situations  most important first
   * @param {RivalLine[]} lines
   * @param {Record<string, string>} history  line_id → the date it was last shown
   * @param {string} today
   * @returns {RivalLine|null}
   */
  function choose(situations, lines, history, today) {
    const live = lines.filter((l) => !l.paused && l.template);
    for (const trigger of situations) {
      const pool = live.filter((l) => l.trigger === trigger);
      if (!pool.length) continue;
      const already = pool.find((l) => history[l.line_id] === today);
      if (already) return already;
      const fresh = pool.filter((l) => !history[l.line_id] || Dates.daysBetween(history[l.line_id], today) >= 14);
      const from = fresh.length ? fresh : [...pool].sort((a, b) => ((history[a.line_id] ?? '') < (history[b.line_id] ?? '') ? -1 : 1)).slice(0, 1);
      // Steady within a day, varied across days.
      return from[Dates.daysBetween('2026-01-01', today) % from.length];
    }
    return null;
  }

  return { baseline, perfectDay, score, perfectWeek, fill, choose };
})();

export { Rival };
