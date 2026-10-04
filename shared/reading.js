// @ts-check
// GENERATED from apps-script/domain/reading.js by scripts/sync-shared.js. Do not edit here:
// edit that file and run `npm run sync:shared`.
import { Dates } from './dates.js';

/**
 * Reading (Milestone 5a; docs/PROJECT_BRIEF.md, Reading; ADR-023): books, chapter check-ins and the question bank.
 * A check-in answers 2 questions from the bank and a one-line summary; questions are not repeated within a
 * book until the bank has been used up (then it starts again, avoiding the last check-in's). The pair is the
 * same all day for a book, and "Other questions" moves to the next pair. Pure.
 *
 * Shared with the phone app: scripts/sync-shared.js copies this file to pwa/shared/.
 */
const Reading = (() => {
  /** Questions per check-in. */
  const PER_CHECK_IN = 2;

  /** The live check-ins of a book, in chapter order. @param {Chapter[]} chapters @param {string} bookId */
  const checkIns = (chapters, bookId) => chapters.filter((c) => !c.deleted && c.book_id === bookId)
    .sort((a, b) => (a.chapter ?? 0) - (b.chapter ?? 0) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  /** Books being read now, the most recently checked-in first. @param {Book[]} books @param {Chapter[]} chapters */
  function current(books, chapters) {
    const last = (/** @type {Book} */ b) => checkIns(chapters, b.book_id).reduce((m, c) => (c.date > m ? c.date : m), b.started ?? '');
    return books.filter((b) => !b.deleted && b.status === 'reading').sort((a, b) => (last(a) < last(b) ? 1 : last(a) > last(b) ? -1 : 0));
  }

  /** Finished books, the latest first. @param {Book[]} books */
  const finished = (books) => books.filter((b) => !b.deleted && b.status === 'finished')
    .sort((a, b) => ((a.finished ?? '') < (b.finished ?? '') ? 1 : -1));

  /** The chapter a new check-in is for: one after the highest so far. @param {Chapter[]} chapters @param {string} bookId */
  const nextChapter = (chapters, bookId) => checkIns(chapters, bookId).reduce((m, c) => Math.max(m, c.chapter ?? 0), 0) + 1;

  /**
   * The questions for a book's next check-in: 2 not yet asked in this book (or, once the bank is used up, not
   * asked in its last check-in), the same all day; `turn` moves on to the next pair.
   * @param {Question[]} questions @param {Chapter[]} chapters @param {string} bookId @param {string} today @param {number} [turn]
   * @returns {Question[]}
   */
  function questionsFor(questions, chapters, bookId, today, turn = 0) {
    const live = questions.filter((q) => !q.paused && String(q.text ?? '').trim());
    if (live.length <= PER_CHECK_IN) return live;
    const done = checkIns(chapters, bookId);
    const asked = new Set(done.flatMap((c) => c.question_ids));
    const lastAsked = new Set(done.length ? done[done.length - 1].question_ids : []);
    let pool = live.filter((q) => !asked.has(q.question_id));
    if (pool.length < PER_CHECK_IN) pool = live.filter((q) => !lastAsked.has(q.question_id));
    if (pool.length < PER_CHECK_IN) pool = live;
    // Spread across the bank: steady within a day, different across days and books.
    const seed = Dates.daysBetween('2026-01-01', today) + [...bookId].reduce((s, ch) => s + ch.charCodeAt(0), 0) + turn * PER_CHECK_IN;
    const at = ((seed % pool.length) + pool.length) % pool.length;
    const step = Math.max(1, Math.floor(pool.length / PER_CHECK_IN));
    return [pool[at], pool[(at + step) % pool.length]];
  }

  return { PER_CHECK_IN, checkIns, current, finished, nextChapter, questionsFor };
})();

export { Reading };
