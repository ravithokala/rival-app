// @ts-check
// GENERATED from apps-script/domain/schedule.js by scripts/sync-shared.js. Do not edit here:
// edit that file and run `npm run sync:shared`.
import { Dates } from './dates.js';
import { Model } from './model.js';
import { Points } from './points.js';

/**
 * What is due, when (ADR-004, ADR-008, ADR-018): weeks, phases, breaks, Today's cards, the "This week" row
 * and the earlier days still to log. Pure: works on the Sheet's rows, so the phone draws Today from its saved copy and the
 * server checks a log against the same rules.
 *
 * Shared with the phone app: scripts/sync-shared.js copies this file to pwa/shared/.
 *
 * @typedef {{ item: ScheduleItem, date: string, log: LogEntry|null }} Card
 * @typedef {{ item: ScheduleItem, done: number, target: number, urgent: boolean, waived: boolean, todayLog: LogEntry|null }} WeekItem
 * @typedef {{ track: Track, inWeeks: number }} Locked
 * @typedef {{ started: boolean, startsOn: string|null, week: { start: string, end: string, number: number }|null,
 *   cards: Card[], thisWeek: WeekItem[], catchUp: Card[], locked: Locked[], onBreak: Break|null, welcomeBack: boolean,
 *   breakDaysThisMonth: number }} Plan
 */
const Schedule = (() => {
  /** Today never shows more than 3 habit cards (docs/PROJECT_BRIEF.md). */
  const MAX_CARDS = 3;

  /** A log that counts as doing the item (a skip does not). @param {LogEntry} log */
  const isDone = (log) => !log.deleted && (log.variant === 'full' || log.variant === 'minimum');

  /** Week 1 is the week holding the start date. @param {string} startDate @param {string} date */
  const weekNumber = (startDate, date) => Math.floor(Dates.daysBetween(Dates.weekStart(startDate), Dates.weekStart(date)) / 7) + 1;

  /** Track ids unlocked early in Settings ("I have a guitar", unlock early). @param {Record<string, string|null>} settings */
  const unlockedEarly = (settings) => String(settings.unlocked_tracks ?? '').split(',').map((t) => t.trim()).filter(Boolean);

  /** The start date, or null if it is not set to a real date. @param {Record<string, string|null>} settings */
  const startDate = (settings) => (Dates.isValid(settings.start_date) ? /** @type {string} */ (settings.start_date) : null);

  /**
   * Whether a track is open on a date: not paused, and its unlock week reached or unlocked early.
   * @param {Track} track @param {Record<string, string|null>} settings @param {string} date
   */
  function trackOpen(track, settings, date) {
    const start = startDate(settings);
    if (track.paused || !start) return false;
    return unlockedEarly(settings).includes(track.track_id) || weekNumber(start, date) >= (track.unlock_week ?? 1);
  }

  /** The break on a date, if any (ADR-018). @param {Break[]|undefined} breaks @param {string} date */
  const breakOn = (breaks, date) => (breaks ?? []).find((b) => !b.deleted && b.from <= date && date <= b.to) ?? null;

  /** Whether a break pauses a track (a partial break keeps some). @param {Break|null} brk @param {string} trackId */
  const pauses = (brk, trackId) => Boolean(brk) && !(/** @type {Break} */ (brk).keep_tracks.includes(trackId));

  /** How many days between two dates (inclusive) a break covers. @param {Break[]|undefined} breaks @param {string} from @param {string} to */
  function breakDays(breaks, from, to) {
    let n = 0;
    for (let d = from; d <= to; d = Dates.addDays(d, 1)) if (breakOn(breaks, d)) n += 1;
    return n;
  }

  /**
   * The items in use on a date, in Schedule order; a break pauses the tracks it does not keep, unless
   * `ignoreBreaks` (anything done on a break can still be logged).
   * @param {PlanData} data @param {string} date @param {boolean} [ignoreBreaks]
   */
  function activeItems(data, date, ignoreBreaks = false) {
    const tracks = new Map(data.tracks.map((t) => [t.track_id, t]));
    const brk = ignoreBreaks ? null : breakOn(data.breaks, date);
    return data.schedule
      .filter((i) => !i.paused && Model.MODES.includes(i.mode) && !pauses(brk, i.track_id))
      .filter((i) => { const t = tracks.get(i.track_id); return Boolean(t) && trackOpen(/** @type {Track} */ (t), data.settings, date); })
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  }

  /** Whether a fixed item is due on a date. @param {ScheduleItem} item @param {string} date */
  const dueOn = (item, date) => item.mode === 'fixed' && item.days.includes(Model.DAYS[Dates.weekdayIndex(date)]);

  /** The live log of an item on a date. @param {LogEntry[]} logs @param {string} scheduleId @param {string} date */
  const logFor = (logs, scheduleId, date) => logs.find((l) => !l.deleted && l.schedule_id === scheduleId && l.date === date) ?? null;

  /**
   * Everything Today shows for `today` (the date after the day cutoff).
   * @param {PlanData} data @param {string} today
   * @returns {Plan}
   */
  function plan(data, today) {
    const start = startDate(data.settings);
    const yesterday = Dates.addDays(today, -1);
    const onBreak = breakOn(data.breaks, today);
    const breakDaysThisMonth = breakDays(data.breaks, `${today.slice(0, 8)}01`, today);
    if (!start || today < start) {
      return { started: false, startsOn: start, week: null, cards: [], thisWeek: [], catchUp: [], locked: [], onBreak, welcomeBack: false, breakDaysThisMonth };
    }
    const week = { start: Dates.weekStart(today), end: Dates.addDays(Dates.weekStart(today), 6), number: weekNumber(start, today) };
    const items = activeItems(data, today);
    const inWeek = data.logs.filter((l) => !l.deleted && l.date >= week.start && l.date <= today);
    const daysLeft = Dates.daysBetween(today, week.end) + 1;

    // A weekly item is not expected in a week its track spends mostly on a break (ADR-018).
    const waiveAt = Points.num(data.rules.break_waive_days) || 4;
    const pausedDays = (/** @type {string} */ trackId) => {
      let n = 0;
      for (let d = week.start; d <= week.end; d = Dates.addDays(d, 1)) if (pauses(breakOn(data.breaks, d), trackId)) n += 1;
      return n;
    };
    /** @type {WeekItem[]} */
    const thisWeek = items.filter((i) => i.mode !== 'fixed').map((item) => {
      const done = inWeek.filter((l) => l.schedule_id === item.schedule_id && isDone(l)).length;
      const target = item.times_per_week ?? 1;
      const waived = pausedDays(item.track_id) >= waiveAt;
      return { item, done, target, waived, urgent: !waived && item.mode === 'weekly' && done < target && daysLeft <= target - done,
        todayLog: logFor(data.logs, item.schedule_id, today) };
    });

    // Fixed items for today first, then weekly or stretch items already logged today (so they can be undone),
    // then weekly items running out of week, then those whose preferred day is today.
    const prefersToday = (/** @type {ScheduleItem} */ i) => i.days.includes(Model.DAYS[Dates.weekdayIndex(today)]);
    // A waived item (a week mostly on a break) is never urgent, but is still offered on its preferred day.
    const open = thisWeek.filter((w) => !w.todayLog && w.done < w.target);
    const ordered = [
      ...items.filter((i) => dueOn(i, today)),
      ...thisWeek.filter((w) => w.todayLog).map((w) => w.item),
      ...open.filter((w) => w.urgent).map((w) => w.item),
      ...open.filter((w) => prefersToday(w.item)).map((w) => w.item),
    ];
    const seen = new Set();
    const cards = ordered.filter((i) => !seen.has(i.schedule_id) && seen.add(i.schedule_id)).slice(0, MAX_CARDS)
      .map((item) => ({ item, date: today, log: logFor(data.logs, item.schedule_id, today) }));

    // Earlier days of this week (not before the start date) with a fixed item still to log (ADR-004).
    /** @type {Card[]} */
    const catchUp = [];
    for (let d = week.start > start ? week.start : start; d < today; d = Dates.addDays(d, 1)) {
      for (const item of activeItems(data, d)) if (dueOn(item, d) && !logFor(data.logs, item.schedule_id, d)) catchUp.push({ item, date: d, log: null });
    }

    const locked = data.tracks.filter((t) => !t.paused && !trackOpen(t, data.settings, today))
      .map((track) => ({ track, inWeeks: Math.max(1, (track.unlock_week ?? 1) - week.number) }));

    // The first day after a break: minimum versions are enough to restart (docs/PROJECT_BRIEF.md: no guilt).
    const welcomeBack = !onBreak && Boolean(breakOn(data.breaks, yesterday));
    return { started: true, startsOn: start, week, cards, thisWeek, catchUp, locked, onBreak, welcomeBack, breakDaysThisMonth };
  }

  /**
   * Whether a log may be saved for this item and date: the item is in use that day, the day is in the
   * current week (from the start date) and not after today (ADR-004). Answers why not, or null.
   * @param {PlanData} data @param {ScheduleItem} item @param {string} date @param {string} today
   */
  function whyNotLoggable(data, item, date, today) {
    const start = startDate(data.settings);
    if (!start) return 'the start date is not set (Settings)';
    if (date > today) return 'that day has not come yet';
    if (date < start) return 'that day is before the start date';
    if (date < Dates.weekStart(today)) return 'that week has closed';
    if (!activeItems(data, date, true).some((i) => i.schedule_id === item.schedule_id)) return 'that item is not in use that day';
    return null;
  }

  return { MAX_CARDS, isDone, weekNumber, unlockedEarly, trackOpen, breakOn, breakDays, activeItems, dueOn, logFor, plan, whyNotLoggable };
})();

export { Schedule };
