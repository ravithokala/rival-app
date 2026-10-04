// @ts-check

import { el } from '../dom.js';
import { data } from '../store/store.js';
import { Rival } from '../shared/rival.js';
import { Dates } from '../shared/dates.js';
import { Model } from '../shared/model.js';
import { rivalName } from './placeholders.js';

/**
 * The Rival on screen (ADR-019): this week's scores, and its line for the moment. The line is chosen by
 * situation (most important first) from the RivalLines tab; which lines were shown when is remembered on
 * this phone (localStorage), so a line does not come back within 14 days and stays the same all day.
 */

const HISTORY_KEY = 'tr.lines';

/** @returns {Record<string, string>} line_id → the day it was last shown */
function history() {
  try {
    const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '{}');
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  } catch (e) {
    return {};
  }
}

/** @param {string} lineId @param {string} day */
function remember(lineId, day) {
  try {
    const all = history();
    all[lineId] = day;
    localStorage.setItem(HISTORY_KEY, JSON.stringify(all));
  } catch (e) { /* not remembered: a line may repeat sooner */ }
}

/** Both scores this week so far. @param {string} weekStart @param {string} day */
export const weekScore = (weekStart, day) => Rival.score(data, weekStart, day);

/**
 * The situations that apply now, most important first; and what fills the line's placeholders.
 * @param {import('../shared/schedule.js').Plan} plan @param {{ me: number, rival: number, setback: boolean }} s @param {string} day
 */
function situations(plan, s, day) {
  const week = /** @type {{ start: string, end: string, number: number }} */ (plan.week);
  const dow = Dates.weekdayIndex(day);
  const tomorrow = Model.DAYS[Dates.weekdayIndex(Dates.addDays(day, 1))];
  const open = plan.thisWeek.filter((w) => w.done < w.target && !w.todayLog);
  const urgent = open.find((w) => w.urgent);
  const eve = new Date().getHours() >= 18 ? open.find((w) => w.item.mode === 'weekly' && !w.waived && w.item.days.includes(tomorrow)) : undefined;
  const stretch = dow >= 4 ? open.find((w) => w.item.mode === 'stretch') : undefined;
  // A milestone reached in the last two days: the Rival admits defeat (3b).
  const fresh = data.milestones.filter((m) => m.achieved_on && Dates.daysBetween(m.achieved_on, day) <= 1)
    .sort((a, b) => ((a.achieved_on ?? '') < (b.achieved_on ?? '') ? 1 : -1))[0];
  const list = [
    plan.welcomeBack ? 'welcome-back' : '',
    fresh ? 'milestone' : '',
    plan.onBreak ? 'break' : '',
    s.setback && dow <= 1 ? 'setback' : '',
    dow === 6 ? 'showdown' : '',
    urgent ? 'week-ending' : '',
    eve ? 'eve' : '',
    stretch ? 'stretch' : '',
    s.me < s.rival ? 'behind' : '',
    s.me > s.rival ? 'ahead' : '',
    'morning',
  ].filter(Boolean);
  const activity = (urgent ?? eve ?? stretch)?.item.label ?? '';
  return { list, vars: { name: rivalName(), me: s.me, rival: s.rival, gap: Math.abs(s.me - s.rival), activity, title: fresh?.title ?? '',
    days_left: Dates.daysBetween(day, week.end) + 1, day: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][dow] } };
}

/**
 * The Rival's line for these situations (or a fallback), remembered as shown today.
 * @param {string[]} list @param {Record<string, string|number>} vars @param {string} day @param {string} [fallback]
 */
export function lineFor(list, vars, day, fallback = "Let's see what you've got.") {
  const line = Rival.choose(list, data.lines, history(), day);
  if (!line) return fallback;
  remember(line.line_id, day);
  return Rival.fill(line.template, vars);
}

/**
 * Today's top card: the Rival's name and line, and both scores with a bar each (provisional until the week
 * closes on Sunday night).
 * @param {import('../shared/schedule.js').Plan} plan @param {string} day
 */
export function scoreCard(plan, day) {
  const week = /** @type {{ start: string, end: string, number: number }} */ (plan.week);
  const s = weekScore(week.start, day);
  const { list, vars } = situations(plan, s, day);
  const top = Math.max(s.me, s.rival, 1);
  const bar = (/** @type {string} */ who, /** @type {number} */ value, /** @type {string} */ cls) => el('div', { class: 'score-row' },
    el('span', { class: 'score-who' }, who),
    el('span', { class: 'score-bar' }, el('span', { class: `score-fill ${cls}`, style: { width: `${Math.round((100 * value) / top)}%` } })),
    el('span', { class: 'score-value' }, String(value)));
  return el('section', { class: 'card rival-card score-card', 'aria-label': `This week: you ${s.me}, ${rivalName()} ${s.rival}` },
    el('div', { class: 'rival-top' },
      el('span', { class: 'rival-avatar', 'aria-hidden': 'true' }),
      el('div', {}, el('div', { class: 'rival-name' }, rivalName(), s.setback ? el('span', { class: 'tag' }, 'setback week') : ''),
        el('p', { class: 'rival-line' }, lineFor(list, vars, day)))),
    el('div', { class: 'scores' }, bar('You', s.me, 'mine'), bar(rivalName(), s.rival, 'theirs')),
    el('p', { class: 'muted small' }, `Week ${week.number} so far · final when the week closes on Sunday night`));
}
