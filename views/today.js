// @ts-check

import { el } from '../dom.js';
import { data, saveLog, saveBreak, today } from '../store/store.js';
import { Schedule } from '../shared/schedule.js';
import { Points } from '../shared/points.js';
import { Dates } from '../shared/dates.js';
import { Model } from '../shared/model.js';
import { openSheet, toast } from './sheet.js';
import { rivalName } from './screens.js';
import { scoreCard } from './rival.js';
import { businessToday, reviewBanner } from './business.js';

/**
 * Today (docs/PROJECT_BRIEF.md, Screens): up to 3 habit cards with Done / Minimum / Skip in one tap, the
 * "This week" row for weekly and stretch items, the earlier days of this week still to log (ADR-004),
 * this week's points, when locked tracks open, and breaks (ADR-018): on a break, Today says so and offers
 * "I'm back"; the day after, minimum versions lead; otherwise "Rest today" is one tap away. Drawn from the phone's copy with the server's own
 * rules (shared/schedule.js), so it opens at once and offline; logging needs a connection.
 */

const VARIANT_WORDS = { full: 'Done', minimum: 'Minimum', skipped: 'Skipped' };

/**
 * Points the full or minimum version would earn now (for the button labels).
 * @param {ScheduleItem} item @param {'full'|'minimum'} variant @param {string} [date]  the day it counts for (today)
 */
function worth(item, variant, date = today()) {
  const weekStart = Dates.weekStart(date);
  const doneEarlier = data.logs.filter((l) => l.schedule_id === item.schedule_id && l.date >= weekStart && l.date !== date && Schedule.isDone(l)).length;
  return Points.forLog(variant, item, data.rules, doneEarlier, 0, date).amount;
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

/**
 * One habit card: what it is, then the three buttons, or what was logged with Undo and Change. After a
 * break the Minimum button leads (ADR-018).
 * @param {import('../shared/schedule.js').Card} card @param {boolean} [easy]
 */
function habitCard(card, easy = false) {
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
      el('button', { class: easy && item.min_minutes !== null ? '' : 'primary', type: 'button', onclick: go('full') }, 'Done', el('span', { class: 'worth' }, `+${worth(item, 'full')}`)),
      item.min_minutes !== null
        ? el('button', { class: easy ? 'primary' : '', type: 'button', onclick: go('minimum') }, 'Minimum', el('span', { class: 'worth' }, `${item.min_minutes} min · +${worth(item, 'minimum')}`))
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

  const weekRow = plan.thisWeek.length ? el('section', { class: 'card week-row' },
    el('h2', {}, 'This week'),
    el('div', { class: 'chips' }, plan.thisWeek.map((w) => {
      const done = w.done >= w.target;
      // The name read out starts with what is shown (so voice control finds it), then says the rest.
      const chip = el('button', { type: 'button', class: `chip${done ? ' done' : ''}${w.urgent ? ' urgent' : ''}`,
        onclick: () => send(chip, { schedule_id: w.item.schedule_id, date: day, variant: 'full' }, w.item.label),
        disabled: Boolean(w.todayLog) },
      `${w.item.label} ${w.done}/${w.target}`, w.item.mode === 'stretch' ? ' ✦' : '', w.urgent ? ' · due' : '', w.waived && !done ? ' · break week' : '',
      el('span', { class: 'visually-hidden' }, ` this week${w.item.mode === 'stretch' ? ', a stretch' : ''}. Tap to log one today.`));
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

  const brk = plan.onBreak;
  const kept = brk ? data.tracks.filter((t) => brk.keep_tracks.includes(t.track_id)).map((t) => t.name) : [];
  const breakCard = brk ? el('section', { class: 'card break-card' },
    el('h2', {}, brk.from === brk.to ? 'Resting today' : `On a break until ${Dates.shortDay(brk.to)}`),
    el('p', {}, kept.length ? `Keeping: ${kept.join(', ')}. Everything else waits. Enjoy it.` : 'Nothing is expected. Enjoy it.'),
    brk.note ? el('p', { class: 'muted small' }, brk.note) : '',
    el('div', { class: 'actions start' }, el('button', { class: 'button', type: 'button', onclick: async () => {
      const r = await saveBreak({ action: brk.from < day ? 'end' : 'remove', break_id: brk.break_id });
      toast(r.ok ? 'Welcome back.' : r.message);
    } }, "I'm back"))) : '';
  const welcome = plan.welcomeBack ? el('section', { class: 'card welcome' },
    el('h2', {}, 'Welcome back'), el('p', { class: 'muted small' }, 'Minimum versions are plenty today: easy does it.')) : '';

  main.replaceChildren(
    el('div', { class: 'today-head' }, el('h1', { class: 'screen-title' }, 'Today'),
      el('span', { class: 'muted small' }, `${Dates.shortDay(day)} · Week ${week.number}`)),
    scoreCard(plan, day),
    ...plan.checkIns.map(checkInCard),
    breakCard,
    welcome,
    ...(plan.cards.length ? plan.cards.map((c) => habitCard(c, plan.welcomeBack))
      : brk ? [] : [el('section', { class: 'card' }, el('p', { class: 'muted' }, 'Nothing scheduled today.'))]),
    reviewBanner(day),
    businessToday(day),
    ...extraCards(plan),
    weekRow,
    catchUp,
    plan.locked.length ? el('p', { class: 'muted small locked' },
      plan.locked.map((l) => `${l.track.name} unlocks in ${l.inWeeks} week${l.inWeeks === 1 ? '' : 's'}`).join(' · '), ' (or early, in Settings)') : '',
    el('div', { class: 'today-foot' },
      // Unplanned days off: a one-day break, one tap, with Undo (ADR-018). Longer breaks: Settings → Breaks.
      brk ? '' : el('button', { class: 'link', type: 'button', onclick: async (/** @type {Event} */ ev) => {
        const button = /** @type {HTMLButtonElement} */ (ev.currentTarget);
        button.disabled = true;
        const r = await saveBreak({ action: 'add', from: day, to: day });
        button.disabled = false;
        if (!r.ok) { toast(r.message); return; }
        const rest = data.breaks.find((b) => !b.deleted && b.from === day && b.to === day);
        toast('Rest day: nothing is expected today.', [], rest ? () => { saveBreak({ action: 'remove', break_id: rest.break_id }).then((u) => { if (!u.ok) toast(u.message); }); } : undefined);
      } }, 'Rest today'),
      plan.breakDaysThisMonth ? el('span', { class: 'muted small' }, `Break days this month: ${plan.breakDaysThisMonth}`) : ''));
}

/**
 * A check-in (ADR-024, ADR-026): a habit with its own Yes / No card, outside the 3 activity cards; it counts for the Rival,
 * the perfect week and "Did you do these?". The early night asks about last night, all day; the TV-free evening asks from
 * 18:00. Then what was logged, with Undo.
 * @param {import('../shared/schedule.js').Card} card
 */
function checkInCard(card) {
  const { item, log } = card;
  const tv = item.track_id === 'evening';
  if (tv && !log && new Date().getHours() < 18) return '';
  const time = data.rules.early_night_time || '22:00';
  const weekend = !tv && Points.WEEKEND_NIGHT_MORNINGS.includes(Model.DAYS[Dates.weekdayIndex(card.date)]);
  const box = el('section', { class: `card habit check-in ${item.schedule_id}${log ? ' logged' : ''}` });
  if (log) {
    const done = log.variant === 'full';
    box.append(
      el('div', { class: 'habit-head' }, el('h2', {}, tv ? 'This evening' : 'Last night'),
        el('span', { class: `pill ${log.variant}` }, tv ? (done ? 'TV-free' : 'TV on') : (done ? `In bed by ${time}` : 'Later'))),
      el('p', { class: 'muted small' }, done ? `+${pointsOf(log)} points. ${tv ? 'Enjoy the quiet.' : 'Well rested.'}` : `No points. ${tv ? 'Tomorrow' : 'Tonight'} is another go.`),
      el('div', { class: 'actions start' },
        el('button', { type: 'button', onclick: () => send(box, { schedule_id: item.schedule_id, date: card.date, undo: true }) }, 'Undo')));
    return box;
  }
  // The TV-free evening's swap bonus: a habit done today.
  const habitsDone = data.logs.filter((l) => l.date === card.date && l.schedule_id !== item.schedule_id && Schedule.isDone(l)
    && data.schedule.some((i) => i.schedule_id === l.schedule_id && Schedule.isHabit(i))).length;
  const points = Points.forLog('full', item, data.rules, 0, habitsDone, card.date).amount;
  const go = (/** @type {'full'|'skipped'} */ variant) => () => send(box, { schedule_id: item.schedule_id, date: card.date, variant }, item.label);
  box.append(
    el('div', { class: 'habit-head' }, el('h2', {}, tv ? `${item.label}?` : `${item.label} last night?`),
      el('span', { class: 'muted small' }, tv ? 'no TV tonight' : `in bed by ${time}`)),
    el('div', { class: 'actions three' },
      el('button', { class: 'primary', type: 'button', onclick: go('full') }, 'Yes',
        el('span', { class: 'worth' }, `+${points}${weekend ? ' · weekend night' : ''}${tv && !habitsDone ? ` · +${Points.num(data.rules.tv_swap_bonus)} with a habit` : ''}`)),
      el('button', { type: 'button', onclick: go('skipped') }, 'No')));
  return box;
}

/** The Rival's card: avatar, name, one line. @param {string} name @param {string} line */
function rivalCard(name, line) {
  return el('section', { class: 'card rival-card' },
    el('span', { class: 'rival-avatar', 'aria-hidden': 'true' }),
    el('div', {}, el('div', { class: 'rival-name' }, name), el('p', { class: 'rival-line' }, line)));
}

/**
 * The bonus toggles due today, outside the 3 habit cards; nothing is missed without them. The TV-free evening (3b): from
 * 18:00 (or once logged), 10 points, +5 if a habit was done today. An early night (ADR-024): on Saturday, Sunday and
 * every morning, "Early night last night?", all day, 10 points (15 after a Friday, Saturday or Sunday night), counted for that morning.
 * @param {import('../shared/schedule.js').Plan} plan
 */
function extraCards(plan) {
  return plan.extras.map((extra) => {
    const tv = extra.item.track_id === 'evening';
    if (tv && !extra.log && new Date().getHours() < 18) return '';
    const on = Boolean(extra.log && extra.log.variant === 'full');
    const earned = extra.log ? pointsOf(extra.log) : 0;
    const worth = Points.num(data.rules[`points_${extra.item.track_id}`]);
    const title = tv ? extra.item.label : `${extra.item.label} last night?`;
    const text = tv
      ? (on ? `+${earned} points. Enjoy the quiet.` : `+${worth}, and +${Points.num(data.rules.tv_swap_bonus)} more if you did a habit today.`)
      : (on ? `+${earned} points. Well rested.` : `In bed by ${data.rules.early_night_time || '22:00'} · +${Points.forLog('full', extra.item, data.rules, 0, 0, extra.date).amount}`
        + `${Points.WEEKEND_NIGHT_MORNINGS.includes(Model.DAYS[Dates.weekdayIndex(extra.date)]) ? ' (weekend night)' : ''}`);
    const box = el('section', { class: `card extra ${extra.item.schedule_id}` });
    box.append(
      el('div', { class: 'extra-text' }, el('h2', {}, title), el('p', { class: 'muted small' }, text)),
      el('button', { class: `switch${on ? ' on' : ''}`, type: 'button', role: 'switch', 'aria-checked': String(on), 'aria-label': title,
        onclick: () => send(box, on ? { schedule_id: extra.item.schedule_id, date: extra.date, undo: true } : { schedule_id: extra.item.schedule_id, date: extra.date, variant: 'full' }, on ? undefined : extra.item.label) },
      el('span', { class: 'knob' })));
    return box;
  });
}
