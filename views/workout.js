// @ts-check

import { el } from '../dom.js';
import { data } from '../store/store.js';
import { Workouts } from '../shared/workouts.js';
import { Schedule } from '../shared/schedule.js';
import { Dates } from '../shared/dates.js';
import { openSheet } from './sheet.js';

/**
 * A habit's workout plan on the phone (ADR-029): which session is in hand (this week's if done, else the next), the
 * guidance for this stage, last time's numbers for this session, and the session itself in a sheet. The plan is the
 * Workouts tab in the Sheet; the stage counts sessions done, so a skipped week carries on where it left off.
 */

/** The plan in hand for an item, or null if it has none. @param {ScheduleItem} item @param {string} day */
export function planFor(item, day) {
  const weekStart = Dates.weekStart(day);
  const doneThisWeek = data.logs.filter((l) => l.schedule_id === item.schedule_id && l.date >= weekStart && l.date <= Dates.addDays(weekStart, 6) && Schedule.isDone(l)).length;
  const progress = data.workout_progress[item.schedule_id];
  return Workouts.current(data.workouts, item.schedule_id, progress?.done_before ?? 0, doneThisWeek);
}

/** Last time's note for a session, if any. @param {ScheduleItem} item @param {string} session */
const lastTime = (item, session) => data.workout_progress[item.schedule_id]?.last?.[session] ?? null;

/** What the log note starts as: the session's log line to fill in. @param {ScheduleItem} item @param {string} day */
export const logTemplate = (item, day) => planFor(item, day)?.log ?? '';

/** "Session A · 3rd session": one line for the card. @param {import('../shared/workouts.js').WorkoutPlan} plan */
export const sessionLine = (plan) => `Session ${plan.session} · session ${plan.number} of the plan`;

/** A section's heading. @param {string} name */
const heading = (name) => (name === 'warm-up' ? 'Warm-up' : name === 'cool-down' ? 'Cool-down' : `Pair ${name.replace(/^pair /, '')}`);

/** Opens the session in a sheet. @param {ScheduleItem} item @param {string} day */
export function openSession(item, day) {
  const plan = planFor(item, day);
  if (!plan) return;
  const last = lastTime(item, plan.session);
  const body = el('div', { class: 'form workout' },
    plan.progress ? el('p', { class: 'workout-stage' }, plan.progress) : '',
    last?.note ? el('div', { class: 'workout-last' }, el('div', { class: 'muted small' }, `Last time (${Dates.shortDay(last.date)})`), el('p', {}, last.note)) : '',
    plan.sections.map((section) => el('section', { class: 'workout-section' },
      el('h3', { class: 'check-group' }, heading(section.name)),
      el('ul', { class: 'plain-rows' }, section.rows.map((r) => el('li', { class: 'workout-row' },
        el('div', { class: 'check-name' }, r.exercise ?? ''),
        r.dose ? el('div', { class: 'workout-dose' }, r.dose) : '',
        r.form ? el('div', { class: 'muted small' }, r.form) : '',
        r.easier || r.harder ? el('details', { class: 'workout-options' }, el('summary', {}, 'Easier / harder'),
          r.easier ? el('p', { class: 'small' }, el('strong', {}, 'Easier: '), r.easier) : '',
          r.harder ? el('p', { class: 'small' }, el('strong', {}, 'Harder: '), r.harder) : '') : ''))))),
    plan.log ? el('div', { class: 'workout-last' }, el('div', { class: 'muted small' }, 'Log line (Done, then Change → Note)'), el('p', { class: 'small' }, plan.log)) : '',
    el('p', { class: 'muted small' }, 'Edit the plan in the Sheet (Workouts tab).'));
  openSheet(`${item.label}: ${sessionLine(plan)}`, body);
}
