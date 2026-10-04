// @ts-check

import { el } from '../dom.js';
import { data, today } from '../store/store.js';
import { Schedule } from '../shared/schedule.js';
import { Dates } from '../shared/dates.js';
import { Model } from '../shared/model.js';
import { weekScore, lineFor } from './rival.js';
import { rivalName } from './screens.js';
import { weekChallenge } from './progress.js';

/**
 * The Sunday showdown (viewable any day, ADR-019): this week's grid (each item, each day), both scores
 * (provisional until the week closes), last week's final result with the Rival's verdict, the break days,
 * and next week's plan.
 */

/** @param {string} weekStart */
const weekDays = (weekStart) => Array.from({ length: 7 }, (_, i) => Dates.addDays(weekStart, i));

/**
 * What one cell of the grid says: a symbol and the words for it.
 * @param {ScheduleItem} item @param {string} d @param {string} day today
 */
function cell(item, d, day) {
  const log = Schedule.logFor(data.logs, item.schedule_id, d);
  if (log) return log.variant === 'full' ? ['✓', 'done'] : log.variant === 'minimum' ? ['m', 'minimum'] : ['×', 'skipped'];
  const brk = Schedule.breakOn(data.breaks, d);
  if (brk && !brk.keep_tracks.includes(item.track_id)) return ['B', 'break'];
  if (!Schedule.dueOn(item, d) || !Schedule.activeItems(data, d).some((i) => i.schedule_id === item.schedule_id)) return ['', ''];
  return d < day ? ['–', 'missed'] : ['·', 'to do'];
}

/** This week's comfort challenge, in one line (5a). @param {string} day */
function challengeLine(day) {
  const state = weekChallenge(day);
  if (!state || !state.challenge) return '';
  return el('p', { class: 'small' }, el('a', { href: '#/progress' }, 'Comfort challenge'),
    state.done ? `: done, +${state.points}` : `: not done yet · ${state.challenge.text}`);
}

/** @param {HTMLElement} main */
export function showdownScreen(main) {
  const day = today();
  const plan = Schedule.plan(data, day);
  if (!plan.started || !plan.week) {
    main.replaceChildren(el('h1', { class: 'screen-title' }, 'Showdown'),
      el('section', { class: 'card' }, el('p', { class: 'muted' }, plan.startsOn ? `The first week starts ${Dates.shortDay(plan.startsOn)}.` : 'Set the start date in Settings.')));
    return;
  }
  const week = plan.week;
  const days = weekDays(week.start);
  const s = weekScore(week.start, day);
  const name = rivalName();

  // Every item in use some day this week (breaks aside), in Schedule order.
  const seen = new Set();
  const items = days.flatMap((d) => Schedule.activeItems(data, d, true)).filter((i) => !seen.has(i.schedule_id) && seen.add(i.schedule_id))
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  const grid = el('table', { class: 'grid' },
    el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, el('span', { class: 'visually-hidden' }, 'Item')), days.map((d) => el('th', { scope: 'col', class: d === day ? 'now' : '' }, Model.DAYS[Dates.weekdayIndex(d)].slice(0, 2))))),
    el('tbody', {}, items.map((item) => el('tr', {},
      el('th', { scope: 'row' }, item.label, item.mode !== 'fixed' ? el('span', { class: 'grid-target' }, ` ${plan.thisWeek.find((w) => w.item.schedule_id === item.schedule_id)?.done ?? 0}/${item.times_per_week ?? 1}`) : ''),
      days.map((d) => { const [mark, words] = cell(item, d, day); return el('td', { class: `mark ${words.replace(' ', '-')}`, 'aria-label': words ? `${Dates.shortDay(d)}: ${words}` : '' }, mark); })))));

  const last = [...data.weeks].filter((w) => !w.deleted && w.week_start < week.start).sort((a, b) => (a.week_start < b.week_start ? 1 : -1))[0];
  const lastResult = last ? el('section', { class: 'card' },
    el('h2', {}, `Last week (${Dates.shortDay(last.week_start)})`),
    el('p', { class: 'final' }, `You ${last.my_points ?? 0} · ${name} ${last.rival_points ?? 0}`,
      el('span', { class: `pill ${(last.my_points ?? 0) > (last.rival_points ?? 0) ? 'full' : 'skipped'}` },
        (last.my_points ?? 0) > (last.rival_points ?? 0) ? 'You won' : (last.my_points ?? 0) === (last.rival_points ?? 0) ? 'A draw' : `${name} won`)),
    last.perfect ? el('p', { class: 'muted small' }, 'Perfect week: +50 points.') : '',
    el('p', { class: 'rival-line' }, lineFor([(last.my_points ?? 0) > (last.rival_points ?? 0) ? 'verdict-win' : 'verdict-loss'],
      { name, me: last.my_points ?? 0, rival: last.rival_points ?? 0, gap: Math.abs((last.my_points ?? 0) - (last.rival_points ?? 0)) }, Dates.addDays(last.week_start, 7)))) : '';

  // Next week: weekly targets, unlocks and planned breaks.
  const next = Dates.addDays(week.start, 7);
  const nextItems = Schedule.activeItems(data, next, true);
  const unlocks = data.tracks.filter((t) => !t.paused && !Schedule.trackOpen(t, data.settings, day) && Schedule.trackOpen(t, data.settings, next));
  const breaks = data.breaks.filter((b) => !b.deleted && b.from <= Dates.addDays(next, 6) && b.to >= next);
  const breakDays = Schedule.breakDays(data.breaks, week.start, week.end);

  main.replaceChildren(
    el('h1', { class: 'screen-title' }, Dates.weekdayIndex(day) === 6 ? 'Sunday showdown' : 'Showdown'),
    el('section', { class: 'card' },
      el('h2', {}, `Week ${week.number} · ${Dates.shortDay(week.start)} – ${Dates.shortDay(week.end)}`),
      el('p', { class: 'final' }, `You ${s.me} · ${name} ${s.rival}`, el('span', { class: 'muted small' }, ' so far')),
      el('p', { class: 'muted small' }, `${name} at ${s.pct}%${s.setback ? ' (setback week)' : ''} of a perfect week (${s.perfect} points). Final when the week closes on Sunday night.`),
      breakDays ? el('p', { class: 'muted small' }, `Break days this week: ${breakDays}`) : '',
      challengeLine(day)),
    el('section', { class: 'card grid-card' }, el('h2', {}, 'This week'), grid,
      el('p', { class: 'muted small legend' }, '✓ done · m minimum · × skipped · – missed · B break · · to do')),
    lastResult,
    el('section', { class: 'card' },
      el('h2', {}, 'Next week'),
      el('ul', { class: 'plain-list' },
        nextItems.filter((i) => i.mode !== 'fixed').map((i) => el('li', {}, `${i.label}: ${i.times_per_week ?? 1}× ${i.mode === 'stretch' ? '(stretch)' : ''}`)),
        unlocks.map((t) => el('li', {}, `${t.name} unlocks`)),
        breaks.map((b) => el('li', {}, `Break ${Dates.shortDay(b.from)} – ${Dates.shortDay(b.to)}`)))));
}
