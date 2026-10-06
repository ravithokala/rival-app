// @ts-check
// GENERATED from apps-script/domain/workouts.js by scripts/sync-shared.js. Do not edit here:
// edit that file and run `npm run sync:shared`.
import { Schedule } from './schedule.js';

/**
 * Workout plans (ADR-029): a habit (Dumbbells) can have sessions in the Workouts tab (A, B …), alternating by sessions done,
 * not by calendar: a skipped week carries on with the next session. Each session is a warm-up, pairs of exercises, a
 * cool-down and a log line to fill in; 'progress' rows say what to do at each stage ("1–2": the first two sessions). Pure.
 *
 * Shared with the phone app: scripts/sync-shared.js copies this file to pwa/shared/.
 *
 * @typedef {{ name: string, rows: WorkoutRow[] }} WorkoutSection
 * @typedef {{ session: string, number: number, sections: WorkoutSection[], progress: string|null, log: string|null }} WorkoutPlan
 */
const Workouts = (() => {
  /** A section's place in a session: warm-up, the pairs in number order, cool-down. @param {string} section */
  function rank(section) {
    const s = String(section ?? '').trim().toLowerCase();
    if (s === 'warm-up') return 0;
    if (s === 'cool-down') return 100;
    const pair = /^pair (\d)$/.exec(s);
    return pair ? Number(pair[1]) : -1;
  }

  /** The live rows of a habit's plan. @param {WorkoutRow[]} rows @param {string} scheduleId */
  const rowsFor = (rows, scheduleId) => rows.filter((r) => !r.paused && r.schedule_id === scheduleId);

  /** The plan's sessions, in order (A, B …). @param {WorkoutRow[]} rows @param {string} scheduleId @returns {string[]} */
  const sessions = (rows, scheduleId) => [...new Set(rowsFor(rows, scheduleId).filter((r) => r.session && rank(r.section) >= 0)
    .map((r) => String(r.session).trim()))].sort();

  /** The session the n-th one done is (1-based): A, B, A, B … @param {string[]} list @param {number} n */
  const sessionAt = (list, n) => list[(Math.max(1, n) - 1) % list.length];

  /** The first two numbers in a range such as "1–2" or "Weeks 3-4". @param {string|null} text @returns {[number, number]|null} */
  function range(text) {
    const n = String(text ?? '').match(/\d+/g);
    if (!n) return null;
    return [Number(n[0]), Number(n[1] ?? n[0])];
  }

  /**
   * The plan for the session in hand: this week's if one is done, else the next.
   * @param {WorkoutRow[]} rows @param {string} scheduleId
   * @param {number} doneBefore  sessions done before this week (from the server)
   * @param {number} doneThisWeek  sessions done this week (this phone's logs)
   * @returns {WorkoutPlan|null}
   */
  function current(rows, scheduleId, doneBefore, doneThisWeek) {
    const list = sessions(rows, scheduleId);
    if (!list.length) return null;
    const number = doneBefore + Math.max(1, doneThisWeek);
    const session = sessionAt(list, number);
    const mine = rowsFor(rows, scheduleId).filter((r) => String(r.session ?? '').trim() === session);
    const byOrder = (/** @type {WorkoutRow} */ a, /** @type {WorkoutRow} */ b) => (a.order ?? 0) - (b.order ?? 0);
    const names = [...new Set(mine.filter((r) => rank(r.section) >= 0).map((r) => String(r.section).trim().toLowerCase()))].sort((a, b) => rank(a) - rank(b));
    const progress = rowsFor(rows, scheduleId).filter((r) => r.section === 'progress').find((r) => {
      const span = range(r.dose);
      return span !== null && span[0] <= number && number <= span[1];
    });
    return {
      session,
      number,
      sections: names.map((name) => ({ name, rows: mine.filter((r) => String(r.section).trim().toLowerCase() === name).sort(byOrder) })),
      progress: progress?.exercise ?? null,
      log: mine.find((r) => r.section === 'log')?.exercise ?? null,
    };
  }

  /**
   * Where a plan stands, from every done log: sessions done before a week, and the note of the last one of each session
   * (that week aside: "last time").
   * @param {WorkoutRow[]} rows @param {LogEntry[]} logs @param {string} scheduleId @param {string} weekStart
   * @returns {WorkoutProgress}
   */
  function progress(rows, logs, scheduleId, weekStart) {
    const list = sessions(rows, scheduleId);
    const done = logs.filter((l) => l.schedule_id === scheduleId && Schedule.isDone(l) && l.date < weekStart)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    /** @type {Record<string, { date: string, note: string|null }>} */
    const last = {};
    if (list.length) done.forEach((l, i) => { last[sessionAt(list, i + 1)] = { date: l.date, note: l.note }; });
    return { done_before: done.length, last };
  }

  return { rank, sessions, current, progress };
})();

export { Workouts };
