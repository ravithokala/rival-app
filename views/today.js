// @ts-check

import { el } from '../dom.js';
import { data, saveLog, today } from '../store/store.js';
import { Schedule } from '../shared/schedule.js';
import { Points } from '../shared/points.js';
import { Dates } from '../shared/dates.js';
import { openSheet, toast } from './sheet.js';
import { rivalName } from './placeholders.js';

/**
 * Today (docs/PROJECT_BRIEF.md, Screens): up to 3 habit cards with Done / Minimum / Skip in one tap, the
 * "This week" row for weekly and stretch items, the earlier days of this week still to log (ADR-004),
 * this week's points, and when locked tracks open. Drawn from the phone's copy with the server's own
 * rules (shared/schedule.js), so it opens at once and offline; logging needs a connection.
 */

const VARIANT_WORDS = { full: 'Done', minimum: 'Minimum', skipped: 'Skipped' };

/** Points the full or minimum version would earn now (for the button labels). @param {ScheduleItem} item @param {'full'|'minimum'} variant */
function worth(item, variant) {
  const weekStart = Dates.weekStart(today());
  const doneEarlier = data.logs.filter((l) => l.schedule_id === item.schedule_id && l.date >= weekStart && l.date !== today() && Schedule.isDone(l)).length;
  return Points.forLog(variant, item, data.rules, doneEarlier).amount;
}

/** The points row of a log, if it earned any. @param {LogEntry} log */
const pointsOf = (log) => data.points.find((p) => !p.deleted && p.log_id === log.log_id)?.amount ?? 0;

/**
 * Sends a log, an undo or a change; says what happened. Buttons stay disabled while it is on its way.
 * @param {HTMLElement} host  the card or row (its buttons are disabled meanwhile)
 * @param {Parameters<typeof saveLog>[0]} change
 * @param {string} [label]
 */
async function send(host, change, label) {
  host.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  host.setAttribute('aria-busy', 'true');
  const r = await saveLog(change);
  host.removeAttribute('aria-busy');
  host.querySelectorAll('button').forEach((b) => { b.disabled = false; });
  if (!r.ok) { toast(r.message); return; }
  if (change.undo || !label) return;
  const log = data.logs.find((l) => !l.deleted && l.schedule_id === change.schedule_id && l.date === change.date);
  const earned = log ? pointsOf(log) : 0;
  toast(`${label}: ${VARIANT_WORDS[/** @type {'full'} */ (change.variant)].toLowerCase()}${earned ? ` · +${earned}` : ''}`, [],
    () => { send(host, { schedule_id: change.schedule_id, date: change.date, undo: true }); }, 'Undo');
}

/** Change the minutes or note of a log (or what was logged). @param {ScheduleItem} item @param {LogEntry} log */
function changeSheet(item, log) {
  const minutes = /** @type {HTMLInputElement} */ (el('input', { type: 'number', inputmode: 'numeric', min: '0', max: '600', value: log.minutes ?? '' }));
  const note = /** @type {HTMLTextAreaElement} */ (el('textarea', { rows: '3', maxlength: '500' }, log.note ?? ''));
  let variant = log.variant;
  const choices = el('div', { class: 'segmented', role: 'group', 'aria-label': 'What you did' });
  const drawChoices = () => choices.replaceChildren(...(/** @type {Array<'full'|'minimum'|'skipped'>} */ (['full', 'minimum', 'skipped']))
    .filter((v) => v !== 'minimum' || item.min_minutes !== null)
    .map((v) => el('button', { type: 'button', 'aria-pressed': String(v === variant), onclick: () => {
      variant = v;
      minutes.value = String(v === 'full' ? item.full_minutes ?? '' : v === 'minimum' ? item.min_minutes ?? '' : '');
      drawChoices();
    } }, VARIANT_WORDS[v])));
  drawChoices();
  const body = el('div', { class: 'form' },
    choices,
    el('label', { class: 'field' }, 'Minutes', minutes),
    el('label', { class: 'field' }, 'Note (optional)', note),
    el('div', { class: 'actions' },
      el('button', { class: 'primary', type: 'button', onclick: async (/** @type {Event} */ ev) => {
        const button = /** @type {HTMLButtonElement} */ (ev.currentTarget);
        button.disabled = true;
        const value = minutes.value.trim() === '' ? null : Number(minutes.value);
        const r = await saveLog({ schedule_id: item.schedule_id, date: log.date, variant, minutes: Number.isInteger(value) ? value : null, note: note.value });
        button.disabled = false;
        if (!r.ok) { sheet.messages.replaceChildren(el('div', { class: 'msg error' }, r.message)); return; }
        sheet.close();
        toast('Saved.');
      } }, 'Save')));
  const sheet = openSheet(`${item.label} · ${Dates.shortDay(log.date)}`, body);
}

/** One habit card: what it is, then the three buttons, or what was logged with Undo and Change. @param {import('../shared/schedule.js').Card} card */
function habitCard(card) {
  const { item, log } = card;
  const box = el('section', { class: `card habit${log ? ' logged' : ''}` });
  const minutes = (/** @type {number|null} */ m) => (m === null || m === undefined ? '' : `${m} min`);
  const tag = item.mode === 'stretch' ? el('span', { class: 'tag' }, 'stretch') : item.mode === 'weekly' ? el('span', { class: 'tag' }, 'this week') : '';
  if (log) {
    box.append(
      el('div', { class: 'habit-head' }, el('h2', {}, item.label, tag), el('span', { class: `pill ${log.variant}` }, VARIANT_WORDS[log.variant])),
      el('p', { class: 'muted small' }, [minutes(log.minutes), pointsOf(log) ? `+${pointsOf(log)} points` : 'no points', log.note ? `“${log.note}”` : ''].filter(Boolean).join(' · ')),
      el('div', { class: 'actions start' },
        el('button', { type: 'button', onclick: () => send(box, { schedule_id: item.schedule_id, date: card.date, undo: true }) }, 'Undo'),
        el('button', { type: 'button', onclick: () => changeSheet(item, log) }, 'Change')));
    return box;
  }
  const go = (/** @type {'full'|'minimum'|'skipped'} */ variant) => () => send(box, { schedule_id: item.schedule_id, date: card.date, variant }, item.label);
  box.append(
    el('div', { class: 'habit-head' }, el('h2', {}, item.label, tag), el('span', { class: 'muted small' }, minutes(item.full_minutes))),
    el('div', { class: 'actions three' },
      el('button', { class: 'primary', type: 'button', onclick: go('full') }, 'Done', el('span', { class: 'worth' }, `+${worth(item, 'full')}`)),
      item.min_minutes !== null
        ? el('button', { type: 'button', onclick: go('minimum') }, 'Minimum', el('span', { class: 'worth' }, `${item.min_minutes} min · +${worth(item, 'minimum')}`))
        : '',
      el('button', { type: 'button', onclick: go('skipped') }, 'Skip')));
  return box;
}

/** @param {HTMLElement} main */
export function todayScreen(main) {
  const day = today();
  const plan = Schedule.plan(data, day);
  const name = rivalName();
  if (!plan.started) {
    main.replaceChildren(
      el('h1', { class: 'screen-title' }, 'Today'),
      rivalCard(name, plan.startsOn ? `Week 1 starts ${Dates.shortDay(plan.startsOn)}. Rest while you can.` : 'Set the start date in Settings, then we begin.'));
    return;
  }
  const week = /** @type {{ start: string, end: string, number: number }} */ (plan.week);
  const earned = Points.earned(data.points, week.start, week.end);

  const weekRow = plan.thisWeek.length ? el('section', { class: 'card week-row' },
    el('h2', {}, 'This week'),
    el('div', { class: 'chips' }, plan.thisWeek.map((w) => {
      const done = w.done >= w.target;
      const chip = el('button', { type: 'button', class: `chip${done ? ' done' : ''}${w.urgent ? ' urgent' : ''}`,
        'aria-label': `${w.item.label}: ${w.done} of ${w.target} this week${w.item.mode === 'stretch' ? ', stretch' : ''}. Tap to log one today.`,
        onclick: () => send(chip, { schedule_id: w.item.schedule_id, date: day, variant: 'full' }, w.item.label),
        disabled: Boolean(w.todayLog) },
      `${w.item.label} ${w.done}/${w.target}`, w.item.mode === 'stretch' ? ' ✦' : '', w.urgent ? ' · due' : '');
      return chip;
    })),
    el('p', { class: 'muted small' }, 'Tap one to log it for today. ✦ stretch: a bonus if you do it, nothing lost if not.')) : '';

  const catchUp = plan.catchUp.length ? el('section', { class: 'card catch-up' },
    el('h2', {}, 'Did you do these?'),
    el('ul', { class: 'rows' }, plan.catchUp.map((c) => {
      const row = el('li', { class: 'catch-row' });
      const go = (/** @type {'full'|'minimum'|'skipped'} */ variant) => () => send(row, { schedule_id: c.item.schedule_id, date: c.date, variant }, `${c.item.label} (${Dates.shortDay(c.date)})`);
      row.append(
        el('div', { class: 'catch-what' }, el('span', { class: 'catch-day' }, Dates.shortDay(c.date)), c.item.label),
        el('div', { class: 'catch-buttons' },
          el('button', { type: 'button', onclick: go('full') }, 'Done'),
          c.item.min_minutes !== null ? el('button', { type: 'button', onclick: go('minimum') }, 'Min') : '',
          el('button', { type: 'button', onclick: go('skipped') }, 'Skip')));
      return row;
    })),
    el('p', { class: 'muted small' }, 'You can log any day of this week until it closes on Sunday night.')) : '';

  main.replaceChildren(
    el('div', { class: 'today-head' }, el('h1', { class: 'screen-title' }, 'Today'),
      el('span', { class: 'muted small' }, `${Dates.shortDay(day)} · Week ${week.number}`)),
    rivalCard(name, `You: ${earned} point${earned === 1 ? '' : 's'} this week. My score arrives in Milestone 3.`),
    ...(plan.cards.length ? plan.cards.map(habitCard) : [el('section', { class: 'card' }, el('p', { class: 'muted' }, 'Nothing scheduled today.'))]),
    weekRow,
    catchUp,
    plan.locked.length ? el('p', { class: 'muted small locked' },
      plan.locked.map((l) => `${l.track.name} unlocks in ${l.inWeeks} week${l.inWeeks === 1 ? '' : 's'}`).join(' · '), ' (or early, in Settings)') : '');
}

/** The Rival's card: avatar, name, one line. @param {string} name @param {string} line */
function rivalCard(name, line) {
  return el('section', { class: 'card rival-card' },
    el('span', { class: 'rival-avatar', 'aria-hidden': 'true' }),
    el('div', {}, el('div', { class: 'rival-name' }, name), el('p', { class: 'rival-line' }, line)));
}
