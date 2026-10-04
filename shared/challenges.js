// @ts-check
// GENERATED from apps-script/domain/challenges.js by scripts/sync-shared.js. Do not edit here:
// edit that file and run `npm run sync:shared`.
import { Dates } from './dates.js';

/**
 * Weekly comfort challenges (Milestone 5a; ADR-023): one a week from the Challenges tab, picked by the app; one
 * swap a week; Done any day that week earns its points (30 unless the row says otherwise). The pick is worked
 * out the same way on the phone and the server, so nothing is written until a swap or Done: then a
 * ChallengeWeeks row fixes that week's challenge. A challenge done or swapped to in the last 8 weeks is
 * picked again only when nothing else is left. Pure.
 *
 * Shared with the phone app: scripts/sync-shared.js copies this file to pwa/shared/.
 */
const Challenges = (() => {
  /** Weeks before a challenge comes round again. */
  const RECENT_WEEKS = 8;
  const DEFAULT_POINTS = 30;

  /** @param {Challenge[]} challenges */
  const live = (challenges) => challenges.filter((c) => !c.paused && String(c.text ?? '').trim());

  /** The week's ChallengeWeeks row, if a swap or Done fixed it. @param {ChallengeWeek[]} weeks @param {string} weekStart */
  const rowFor = (weeks, weekStart) => weeks.find((w) => w.week_start === weekStart) ?? null;

  /**
   * The challenges that may be picked for a week: live ones not used recently (or all live ones if none are left).
   * @param {Challenge[]} challenges @param {ChallengeWeek[]} weeks @param {string} weekStart @param {string[]} [also]  more ids to leave out
   */
  function candidates(challenges, weeks, weekStart, also = []) {
    const recent = new Set(weeks.filter((w) => w.week_start < weekStart && Dates.daysBetween(w.week_start, weekStart) <= 7 * RECENT_WEEKS)
      .map((w) => w.challenge_id));
    const all = live(challenges).filter((c) => !also.includes(c.challenge_id));
    const fresh = all.filter((c) => !recent.has(c.challenge_id));
    return fresh.length ? fresh : all;
  }

  /** A steady choice for a week. @template T @param {T[]} pool @param {string} weekStart @returns {T|null} */
  const choose = (pool, weekStart) => (pool.length ? pool[Math.floor(Dates.daysBetween('2026-01-05', weekStart) / 7) % pool.length] : null);

  /**
   * This week's challenge and where it stands.
   * @param {Challenge[]} challenges @param {ChallengeWeek[]} weeks @param {string} weekStart
   * @returns {{ challenge: Challenge|null, row: ChallengeWeek|null, done: boolean, canSwap: boolean, points: number }}
   */
  function forWeek(challenges, weeks, weekStart) {
    const row = rowFor(weeks, weekStart);
    const fixed = row ? challenges.find((c) => c.challenge_id === row.challenge_id) ?? null : null;
    const challenge = fixed ?? choose(candidates(challenges, weeks, weekStart), weekStart);
    const done = Boolean(row && row.done_on);
    return { challenge, row, done, canSwap: !done && !(row && row.swapped) && candidates(challenges, weeks, weekStart, challenge ? [challenge.challenge_id] : []).length > 0,
      points: challenge ? points(challenge) : 0 };
  }

  /** The swap: another challenge for the week. @param {Challenge[]} challenges @param {ChallengeWeek[]} weeks @param {string} weekStart @param {string} currentId */
  const swapFor = (challenges, weeks, weekStart, currentId) => choose(candidates(challenges, weeks, weekStart, [currentId]), weekStart);

  /** What a challenge is worth. @param {Challenge} c */
  const points = (c) => (c.points && c.points > 0 ? c.points : DEFAULT_POINTS);

  return { RECENT_WEEKS, DEFAULT_POINTS, forWeek, swapFor, points };
})();

export { Challenges };
