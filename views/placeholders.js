// @ts-check

import { el } from '../dom.js';
import { data } from '../store/store.js';

/**
 * The five tabs before their milestones fill them (docs/PROJECT_BRIEF.md, Build order). Each says
 * what it will hold and when, so the shell can be installed and tried on the phone now.
 *
 * @typedef {{ id: string, label: string, title: string, milestone: number, holds: string[] }} Screen
 */

/** @type {ReadonlyArray<Screen>} */
export const SCREENS = Object.freeze([
  { id: 'today', label: 'Today', title: 'Today', milestone: 2,
    holds: ["Your score against the Rival this week", "Today's 2–3 habits: Done, Minimum or Skip, in one tap", 'Runs, swims and rides due this week', 'Earlier days of this week still to log', "Today's business tasks"] },
  { id: 'business', label: 'Business', title: 'Business', milestone: 4,
    holds: ['Progress per step', 'Every task with its status and first action', 'Key dates and facts', 'The STATUS block, ready to copy'] },
  { id: 'reading', label: 'Reading', title: 'Reading', milestone: 5,
    holds: ['Your current book', 'Chapter check-ins: two questions and a one-line summary', 'Finished books with their chapter maps'] },
  { id: 'progress', label: 'Progress', title: 'Progress', milestone: 3,
    holds: ['Milestones and badges', 'Points balance and the rewards shop', 'Streaks, including weekend rides', 'This week\'s comfort challenge'] },
  { id: 'showdown', label: 'Showdown', title: 'Sunday showdown', milestone: 3,
    holds: ['The week at a glance', 'Your score against the Rival', "The Rival's verdict", "Next week's plan"] },
]);

/** The Rival's name: the one set in the Sheet's Settings tab, or the default. */
export const rivalName = () => data.settings.rival_name || 'The Rival';

/**
 * @param {HTMLElement} main
 * @param {Screen} screen
 */
export function placeholder(main, screen) {
  main.replaceChildren(
    el('h1', { class: 'screen-title' }, screen.title),
    screen.id === 'today' ? el('section', { class: 'card rival-card' },
      el('span', { class: 'rival-avatar', 'aria-hidden': 'true' }),
      el('div', {}, el('div', { class: 'rival-name' }, rivalName()), el('p', { class: 'rival-line' }, 'Warming up. Come back when there is something to beat.'))) : '',
    el('section', { class: 'card coming' },
      el('h2', {}, `Coming in Milestone ${screen.milestone}`),
      el('ul', { class: 'plain-list' }, screen.holds.map((h) => el('li', {}, h)))));
}
