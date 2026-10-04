// @ts-check

import { el } from '../dom.js';
import { data, saveBook, saveChapter, today } from '../store/store.js';
import { Reading } from '../shared/reading.js';
import { Dates } from '../shared/dates.js';
import { openSheet, toast } from './sheet.js';
import { lineFor } from './rival.js';
import { rivalName } from './screens.js';

/**
 * Reading (Milestone 5a; docs/PROJECT_BRIEF.md, Reading; ADR-023): the books on the go, each with "Finished a chapter"
 * (two questions from the bank, the answers and a one-line summary; it also counts as today's Reading) and its
 * chapter map; finishing a book takes a short reflection and a 1–5 rating. Finished books keep their map and
 * reflection; a book put down can be picked up again.
 */

/** The folded sections open now ('map:<book_id>', 'book:<book_id>'), kept across redraws (a refresh redraws the screen). */
const opened = new Set();

/** A folded section that stays open across redraws. @param {string} key @param {string} cls @param {...unknown} children */
const folded = (key, cls, ...children) => el('details', { class: cls, open: opened.has(key),
  ontoggle: (/** @type {Event} */ ev) => { if (/** @type {HTMLDetailsElement} */ (ev.currentTarget).open) opened.add(key); else opened.delete(key); } }, ...children);

/** "★★★★☆". @param {number|null} rating */
const stars = (rating) => (rating ? '★'.repeat(rating) + '☆'.repeat(5 - rating) : '');

/** @param {Book} book */
const byLine = (book) => [book.author, book.started ? `started ${Dates.shortDay(book.started)}` : ''].filter(Boolean).join(' · ');

/** @param {HTMLElement} main */
export function readingScreen(main) {
  const day = today();
  const reading = Reading.current(data.books, data.chapters);
  const done = Reading.finished(data.books);
  const stopped = data.books.filter((b) => !b.deleted && b.status === 'stopped');

  main.replaceChildren(
    el('h1', { class: 'screen-title' }, 'Reading'),
    ...(reading.length ? reading.map((b) => bookCard(b, day))
      : [el('section', { class: 'card' },
        el('h2', {}, 'No book on the go'),
        el('p', { class: 'muted small' }, 'Add the book you are reading. After each chapter, two questions and a one-line summary build its chapter map.'),
        el('div', { class: 'actions start' }, el('button', { class: 'button primary', type: 'button', onclick: () => bookSheet(null) }, 'Add a book')))]),
    reading.length ? el('div', { class: 'actions start' }, el('button', { class: 'button', type: 'button', onclick: () => bookSheet(null) }, 'Add another book')) : '',
    done.length ? el('section', { class: 'card' },
      el('h2', {}, 'Finished'),
      el('ul', { class: 'plain-rows' }, done.map((b) => el('li', {}, finishedBook(b))))) : '',
    stopped.length ? el('section', { class: 'card' },
      el('h2', {}, 'Put down'),
      el('ul', { class: 'plain-rows' }, stopped.map((b) => el('li', { class: 'book-row' },
        el('div', { class: 'book-text' }, el('div', { class: 'check-name' }, b.title), el('div', { class: 'muted small' }, byLine(b))),
        el('button', { class: 'button', type: 'button', onclick: () => status(b, 'resume', `${b.title}: back on the go.`) }, 'Pick up again'))))) : '',
    el('p', { class: 'muted small' }, 'Edit or pause the questions in the Sheet (Questions tab).'));
}

/** @param {Book} book @param {'stop'|'resume'} action @param {string} message */
async function status(book, action, message) {
  const r = await saveBook({ action, book_id: book.book_id });
  toast(r.ok ? message : r.message);
}

/** A book being read: its next chapter, the check-in, its map and what to do when it is finished. @param {Book} book @param {string} day */
function bookCard(book, day) {
  const chapters = Reading.checkIns(data.chapters, book.book_id);
  const todays = chapters.filter((c) => c.date === day).length;
  return el('section', { class: 'card book' },
    el('div', { class: 'habit-head' }, el('h2', {}, book.title),
      el('span', { class: 'muted small' }, `${chapters.length} chapter${chapters.length === 1 ? '' : 's'}`)),
    el('p', { class: 'muted small' }, byLine(book), todays ? ` · ${todays} today` : ''),
    el('div', { class: 'actions start' },
      el('button', { class: 'button primary', type: 'button', onclick: () => checkInSheet(book, day) }, 'Finished a chapter'),
      el('button', { class: 'button', type: 'button', onclick: () => finishSheet(book) }, 'Finished the book')),
    chapters.length ? chapterMap(book, chapters, 'Chapter map') : '',
    el('div', { class: 'book-foot' },
      el('button', { class: 'link', type: 'button', onclick: () => bookSheet(book) }, 'Edit title'),
      el('button', { class: 'link', type: 'button', onclick: () => status(book, 'stop', `${book.title}: put down. Pick it up again any time.`) }, 'Put it down')));
}

/** A finished book: rating, reflection and chapter map, folded. @param {Book} book */
function finishedBook(book) {
  const chapters = Reading.checkIns(data.chapters, book.book_id);
  const field = (/** @type {string} */ label, /** @type {string|null} */ value) => (value ? [el('dt', {}, label), el('dd', {}, value)] : []);
  return folded(`book:${book.book_id}`, 'book-done',
    el('summary', {},
      el('span', { class: 'book-text' }, el('span', { class: 'check-name' }, book.title),
        el('span', { class: 'muted small' }, [book.author, book.finished ? `finished ${Dates.shortDay(book.finished)}` : ''].filter(Boolean).join(' · '))),
      book.rating ? el('span', { class: 'stars', 'aria-label': `Rated ${book.rating} of 5` }, stars(book.rating)) : ''),
    el('dl', { class: 'facts reflection' },
      field('Themes', book.themes), field('Favourite moment', book.favourite), field('Disagreed with', book.disagreed)),
    chapters.length ? chapterMap(book, chapters, `Chapter map (${chapters.length})`) : el('p', { class: 'muted small' }, 'No chapter check-ins.'),
    el('div', { class: 'book-foot' },
      el('button', { class: 'link', type: 'button', onclick: () => finishSheet(book) }, 'Edit reflection'),
      el('button', { class: 'link', type: 'button', onclick: () => status(book, 'resume', `${book.title}: back on the go.`) }, 'Reading it again')));
}

/** A book's check-ins, chapter by chapter, folded. @param {Book} book @param {Chapter[]} chapters @param {string} label */
function chapterMap(book, chapters, label) {
  return folded(`map:${book.book_id}`, 'chapter-map',
    el('summary', {}, label),
    el('ol', { class: 'map' }, chapters.map((c) => el('li', { class: 'map-row' },
      el('div', { class: 'map-head' }, el('span', { class: 'map-no' }, `Ch ${c.chapter}`), el('span', { class: 'map-summary' }, c.summary ?? ''),
        el('button', { class: 'link', type: 'button', 'aria-label': `Change chapter ${c.chapter}`, onclick: () => editSheet(c) }, 'Change')),
      el('dl', { class: 'qa' },
        c.answer_1 ? [el('dt', {}, c.question_1 ?? ''), el('dd', {}, c.answer_1)] : '',
        c.answer_2 ? [el('dt', {}, c.question_2 ?? ''), el('dd', {}, c.answer_2)] : '')))));
}

/** A labelled text box. @param {string} label @param {string|null} value @param {number} max @param {number} [rows] */
function textBox(label, value, max, rows = 3) {
  const box = /** @type {HTMLTextAreaElement} */ (el('textarea', { rows: String(rows), maxlength: String(max) }, value ?? ''));
  return { box, field: el('label', { class: 'field' }, label, box) };
}

/** Saves from a sheet's button; keeps the sheet open with the reason if refused. */
const saving = (/** @type {() => { close: () => void, messages: HTMLElement }} */ sheetOf, /** @type {() => Promise<{ ok: boolean, message?: string, logged?: boolean }>} */ save,
  /** @type {(r: { logged?: boolean }) => void} */ after) => async (/** @type {Event} */ ev) => {
  const button = /** @type {HTMLButtonElement} */ (ev.currentTarget);
  button.disabled = true;
  const r = await save();
  button.disabled = false;
  if (!r.ok) { sheetOf().messages.replaceChildren(el('div', { class: 'msg error' }, r.message ?? 'Not saved.')); return; }
  sheetOf().close();
  after(r);
};

/** "Finished a chapter": two questions, the answers and a one-line summary. @param {Book} book @param {string} day */
function checkInSheet(book, day) {
  let turn = 0;
  let questions = Reading.questionsFor(data.questions, data.chapters, book.book_id, day, turn);
  const chapter = /** @type {HTMLInputElement} */ (el('input', { type: 'number', inputmode: 'numeric', min: '1', max: '999', value: String(Reading.nextChapter(data.chapters, book.book_id)) }));
  const q1 = el('span', { class: 'question' });
  const q2 = el('span', { class: 'question' });
  const a1 = /** @type {HTMLTextAreaElement} */ (el('textarea', { rows: '3', maxlength: '1000' }));
  const a2 = /** @type {HTMLTextAreaElement} */ (el('textarea', { rows: '3', maxlength: '1000' }));
  const label = () => { q1.textContent = questions[0]?.text ?? ''; q2.textContent = questions[1]?.text ?? ''; };
  label();
  const summary = /** @type {HTMLInputElement} */ (el('input', { type: 'text', maxlength: '200', placeholder: 'What happened, in one line' }));
  const body = el('div', { class: 'form' },
    el('label', { class: 'field' }, 'Chapter', chapter),
    el('label', { class: 'field' }, q1, a1), el('label', { class: 'field' }, q2, a2),
    el('button', { class: 'link', type: 'button', onclick: () => { turn += 1; questions = Reading.questionsFor(data.questions, data.chapters, book.book_id, day, turn); label(); } }, 'Other questions'),
    el('label', { class: 'field' }, 'One-line summary', summary),
    el('div', { class: 'actions' }, el('button', { class: 'primary', type: 'button', onclick: saving(() => sheet, async () => {
      if (questions.length < 2) return { ok: false, message: 'The question bank needs at least two questions (Questions tab).' };
      return saveChapter({ action: 'add', book_id: book.book_id, chapter: Number(chapter.value), question_ids: questions.map((q) => q.question_id),
        answers: [a1.value, a2.value], summary: summary.value });
    }, (r) => toast(`${lineFor(['chapter'], { name: rivalName() }, day, 'Chapter done.')}${r.logged ? ' · Reading done' : ''}`)) }, 'Save check-in')));
  const sheet = openSheet(book.title, body);
}

/** Changes a check-in: the chapter number, the answers or the summary. @param {Chapter} c */
function editSheet(c) {
  const chapter = /** @type {HTMLInputElement} */ (el('input', { type: 'number', inputmode: 'numeric', min: '1', max: '999', value: String(c.chapter ?? '') }));
  const a1 = textBox(c.question_1 ?? 'Answer 1', c.answer_1, 1000);
  const a2 = textBox(c.question_2 ?? 'Answer 2', c.answer_2, 1000);
  const summary = /** @type {HTMLInputElement} */ (el('input', { type: 'text', maxlength: '200', value: c.summary ?? '' }));
  const body = el('div', { class: 'form' },
    el('label', { class: 'field' }, 'Chapter', chapter), a1.field, a2.field, el('label', { class: 'field' }, 'One-line summary', summary),
    el('div', { class: 'actions' }, el('button', { class: 'primary', type: 'button', onclick: saving(() => sheet,
      () => saveChapter({ action: 'edit', chapter_id: c.chapter_id, chapter: Number(chapter.value), answers: [a1.box.value, a2.box.value], summary: summary.value }),
      () => toast('Saved.')) }, 'Save')));
  const sheet = openSheet(`Chapter ${c.chapter} · ${Dates.shortDay(c.date)}`, body);
}

/** Adds a book, or changes its title and author. @param {Book|null} book */
function bookSheet(book) {
  const title = /** @type {HTMLInputElement} */ (el('input', { type: 'text', maxlength: '200', value: book?.title ?? '' }));
  const author = /** @type {HTMLInputElement} */ (el('input', { type: 'text', maxlength: '200', value: book?.author ?? '' }));
  const body = el('div', { class: 'form' },
    el('label', { class: 'field' }, 'Title', title), el('label', { class: 'field' }, 'Author (optional)', author),
    el('div', { class: 'actions' }, el('button', { class: 'primary', type: 'button', onclick: saving(() => sheet,
      () => (book ? saveBook({ action: 'edit', book_id: book.book_id, title: title.value, author: author.value }) : saveBook({ action: 'add', title: title.value, author: author.value })),
      () => toast(book ? 'Saved.' : `${title.value.trim()}: enjoy it.`)) }, book ? 'Save' : 'Add')));
  const sheet = openSheet(book ? 'Edit book' : 'Add a book', body);
}

/** Finishing a book (or changing the reflection later): themes, favourite moment, what you disagreed with, 1–5. @param {Book} book */
function finishSheet(book) {
  const themes = textBox('Themes', book.themes, 1000, 2);
  const favourite = textBox('Favourite moment', book.favourite, 1000, 2);
  const disagreed = textBox('What you disagreed with', book.disagreed, 1000, 2);
  let rating = book.rating ?? 0;
  const choices = el('div', { class: 'segmented', role: 'group', 'aria-label': 'Rating, 1 to 5' });
  const draw = () => choices.replaceChildren(...[1, 2, 3, 4, 5].map((n) => el('button', { type: 'button', 'aria-pressed': String(n === rating),
    'aria-label': `${n} of 5`, onclick: () => { rating = n; draw(); } }, String(n))));
  draw();
  const count = Reading.checkIns(data.chapters, book.book_id).length;
  const body = el('div', { class: 'form' },
    themes.field, favourite.field, disagreed.field,
    el('div', { class: 'field' }, 'Rating', choices),
    el('div', { class: 'actions' }, el('button', { class: 'primary', type: 'button', onclick: saving(() => sheet, async () => {
      if (!rating) return { ok: false, message: 'Pick a rating from 1 to 5.' };
      return saveBook({ action: 'finish', book_id: book.book_id, themes: themes.box.value, favourite: favourite.box.value, disagreed: disagreed.box.value, rating });
    }, () => toast(book.status === 'finished' ? 'Reflection saved.' : `Finished: ${count} chapter${count === 1 ? '' : 's'} in its map.`)) }, 'Save')));
  const sheet = openSheet(book.status === 'finished' ? `${book.title}: reflection` : `Finished ${book.title}`, body);
}
