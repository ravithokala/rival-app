// @ts-check

import { el } from '../dom.js';
import { data, updateTask, verifyDate, today } from '../store/store.js';
import { Business } from '../shared/business.js';
import { Dates } from '../shared/dates.js';
import { openSheet, toast } from './sheet.js';

/**
 * The business track on the phone (Milestone 4): today's 1–3 tasks under the habits on Today, and the Business
 * tab (steps, every task, key dates, facts, the STATUS block). The coach's voice: brief, practical, no guilt, no
 * Rival. "Help me in Claude" copies a ready-made prompt for a normal Claude chat; v1 calls no AI itself.
 */

const SKIP_KEY = 'tr.skipped';

/** Tasks skipped today on this phone (they come back tomorrow). @param {string} day @returns {string[]} */
function skippedOn(day) {
  try {
    const saved = JSON.parse(localStorage.getItem(SKIP_KEY) ?? '{}');
    return saved && saved.day === day && Array.isArray(saved.ids) ? saved.ids : [];
  } catch (e) {
    return [];
  }
}

/** @param {string} day @param {string} id */
function skip(day, id) {
  try { localStorage.setItem(SKIP_KEY, JSON.stringify({ day, ids: [...skippedOn(day), id] })); } catch (e) { /* not remembered */ }
}

/** Copies text, or shows it to copy by hand if the phone will not let the app. @param {string} text @param {string} done */
export async function copy(text, done) {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
  } catch (e) {
    const area = /** @type {HTMLTextAreaElement} */ (el('textarea', { rows: '12', readonly: true, class: 'copy-area' }, text));
    openSheet('Copy this', el('div', { class: 'form' }, el('p', { class: 'muted small' }, 'Select all and copy:'), area));
    area.select();
  }
}

/** A key date: 'Tue 1 Jun', with the year when it is not this year ('Tue 1 Jun 2027'). @param {string} iso @param {string} day */
export const dateLabel = (iso, day) => `${Dates.shortDay(iso)}${iso.slice(0, 4) === day.slice(0, 4) ? '' : ` ${iso.slice(0, 4)}`}`;

const STATUS_WORDS = { todo: 'To do', in_progress: 'In progress', blocked: 'Blocked', done: 'Done', retired: 'Retired' };

/** The STATUS block for now. */
const statusText = () => Business.statusBlock(data.tasks, data.steps, data.facts, today());

/** Copies the "Help me in Claude" prompt for a task. @param {BizTask} task */
const helpInClaude = (task) => copy(Business.helpPrompt(task, data.steps.find((s) => s.step_id === task.step_id), statusText()),
  'Prompt copied: paste it into a Claude chat.');

/**
 * Asks for a note (In progress) or a reason (Blocked), then saves.
 * @param {BizTask} task @param {'progress'|'blocked'} action
 */
function noteSheet(task, action) {
  const note = /** @type {HTMLTextAreaElement} */ (el('textarea', { rows: '3', maxlength: '500', 'aria-label': action === 'blocked' ? 'What is it waiting for?' : 'Where you got to' }, task.note ?? ''));
  const sheet = openSheet(`${task.task_id} · ${action === 'blocked' ? 'Blocked' : 'In progress'}`, el('div', { class: 'form' },
    el('label', { class: 'field' }, action === 'blocked' ? 'What is it waiting for?' : 'Where you got to (optional)', note),
    el('div', { class: 'actions' }, el('button', { class: 'primary', type: 'button', onclick: async (/** @type {Event} */ ev) => {
      const button = /** @type {HTMLButtonElement} */ (ev.currentTarget);
      button.disabled = true;
      const r = await updateTask(task.task_id, action, note.value);
      button.disabled = false;
      if (!r.ok) { sheet.messages.replaceChildren(el('div', { class: 'msg error' }, r.message)); return; }
      sheet.close();
      toast(action === 'blocked' ? 'Noted as blocked. It is out of the way until you unblock it.' : 'Noted. It stays first in line.');
    } }, 'Save'))));
}

/**
 * One task: id and title, estimate, first action, what done looks like (or what today means), and its buttons.
 * @param {BizTask} task @param {{ overBudget?: boolean, budget?: number, day?: string, planned?: 'today'|'carried'|null, from?: string|null, restart?: boolean }} [today] on Today
 */
function taskBox(task, today = {}) {
  const box = el('div', { class: `task status-${task.status}` });
  const act = async (/** @type {'done'|'reopen'} */ action) => {
    box.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    const r = await updateTask(task.task_id, action);
    box.querySelectorAll('button').forEach((b) => { b.disabled = false; });
    toast(r.ok ? (action === 'done' ? `${task.task_id} done. Good.` : `${task.task_id} reopened.`) : r.message);
  };
  const open = task.status !== 'done' && task.status !== 'retired';
  box.append(
    el('div', { class: 'task-head' }, el('span', { class: 'task-id' }, task.task_id), el('span', { class: 'task-title' }, task.title),
      el('span', { class: 'muted small' }, task.estimate_min ? `${task.estimate_min} min` : '')),
    today.planned ? el('p', { class: 'plan-tag' }, today.planned === 'today' ? 'Planned for today' : `Carried from ${Dates.shortDay(/** @type {string} */ (today.from)).slice(0, 3)}`) : '',
    today.restart ? el('p', { class: 'task-line' }, el('strong', {}, 'Restart: '), `just 15 minutes on ${task.task_id} today. That counts.`) : '',
    task.first_action && open ? el('p', { class: 'task-line' }, el('strong', {}, 'First action: '), task.first_action) : '',
    today.overBudget && !today.restart
      ? el('p', { class: 'task-line' }, el('strong', {}, 'Done today: '), `${today.budget} minutes on ${task.task_id} and a note of where you stopped.`)
      : task.done_looks_like && open ? el('p', { class: 'task-line' }, el('strong', {}, 'Done looks like: '), task.done_looks_like) : '',
    task.note ? el('p', { class: 'muted small' }, `Note: ${task.note}`) : '',
    el('div', { class: 'task-buttons' },
      open ? [
        el('button', { class: 'primary', type: 'button', onclick: () => act('done') }, 'Done'),
        el('button', { type: 'button', onclick: () => noteSheet(task, 'progress') }, 'In progress'),
        el('button', { type: 'button', onclick: () => noteSheet(task, 'blocked') }, 'Blocked'),
        today.day ? el('button', { type: 'button', onclick: () => {
          skip(/** @type {string} */ (today.day), task.task_id);
          toast(`Skipped ${task.task_id} for today. It is first in line tomorrow.`);
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        } }, 'Skip') : '',
      ] : el('button', { type: 'button', onclick: () => act('reopen') }, 'Reopen'),
      el('button', { class: 'link', type: 'button', onclick: () => helpInClaude(task) }, 'Help me in Claude')));
  return box;
}

/**
 * Today's business tasks (under the habit cards): 1–3 that are ready and fit the business block's minutes.
 * Nothing when there is no block today (a break, a rest day) or no business seed yet.
 * @param {string} day
 */
export function businessToday(day) {
  if (!data.tasks.length) return '';
  const budget = Business.budgetOn(data, day);
  if (!budget) return '';
  // After two or more business days missed in a row: one small restart task instead of the list (4b).
  if (Business.missedInARow(data, data.tasks, day) >= 2) {
    const restart = Business.restartTask(data.tasks, data.steps, data.plans, day, skippedOn(day));
    return el('section', { class: 'card business-today' },
      el('div', { class: 'habit-head' }, el('h2', {}, 'Business today'), el('span', { class: 'muted small' }, '15 min')),
      el('p', { class: 'muted small' }, 'A couple of days off the business. One small step gets it moving again.'),
      restart ? taskBox(restart, { day, restart: true, budget: 15 }) : el('p', { class: 'muted' }, 'Nothing ready right now. Check Business for blocked tasks.'));
  }
  const picks = Business.todayPlanned(data.tasks, data.steps, data.plans, budget, day, skippedOn(day));
  return el('section', { class: 'card business-today' },
    el('div', { class: 'habit-head' }, el('h2', {}, 'Business today'), el('span', { class: 'muted small' }, `${budget} min`)),
    picks.length ? picks.map((p) => taskBox(p.task, { overBudget: p.overBudget, budget, day, planned: p.planned, from: p.from }))
      : el('p', { class: 'muted' }, 'Nothing ready right now. Check Business for blocked tasks.'));
}

/** "Weekly review ready" on Today, until this week's plan is accepted (4b). @param {string} day */
export function reviewBanner(day) {
  if (!Business.reviewDue(data.tasks, data.plans, day)) return '';
  return el('section', { class: 'card review-banner' },
    el('div', {}, el('h2', {}, 'Weekly review ready'), el('p', { class: 'muted small' }, 'Last week, progress, dates at risk, and a plan for this week.')),
    el('a', { class: 'button primary', href: '#/review' }, 'Review'));
}

/** The Business tab. @param {HTMLElement} main */
export function businessScreen(main) {
  const day = today();
  if (!data.tasks.length) {
    main.replaceChildren(el('h1', { class: 'screen-title' }, 'Business'),
      el('section', { class: 'card' }, el('p', {}, 'No business plan loaded yet.'),
        el('p', { class: 'muted small' }, 'Fill in local/seed.private.json (see seed/seed.example.json), run "node scripts/load-business-seed.js", then loadBusinessSeed in the Apps Script editor.')));
    return;
  }
  const progress = Business.stepProgress(data.tasks, data.steps);
  const tasks = Business.ordered(data.tasks.filter((t) => t.status !== 'retired'), data.steps);
  const risk = Business.atRisk(data.dates, day);
  const status = statusText();

  main.replaceChildren(
    el('div', { class: 'today-head' }, el('h1', { class: 'screen-title' }, 'Business'), el('a', { class: 'button', href: '#/review' }, 'Weekly review')),
    el('section', { class: 'card' },
      el('h2', {}, 'Steps'),
      el('ul', { class: 'plain-rows' }, progress.map((p) => el('li', { class: 'step-row' },
        el('div', { class: 'step-text' }, el('span', { class: 'check-name' }, `Step ${p.step.step_id}`), el('span', { class: 'muted small' }, ` ${p.step.title}`)),
        el('span', { class: 'step-bar', role: 'img', 'aria-label': `${p.done} of ${p.total} done` },
          el('span', { class: 'step-fill', style: { width: `${p.total ? Math.round((100 * p.done) / p.total) : 0}%` } })),
        // A step of weekly repeats only never finishes: it is ongoing.
        el('span', { class: 'step-count' }, p.total ? `${p.done}/${p.total}` : 'ongoing'))))),
    el('section', { class: 'card' },
      el('div', { class: 'habit-head' }, el('h2', {}, 'STATUS'), el('button', { class: 'button', type: 'button', onclick: () => copy(status, 'STATUS copied.') }, 'Copy')),
      el('pre', { class: 'status-block' }, status)),
    ...data.steps.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((step) => {
      const mine = tasks.filter((t) => t.step_id === step.step_id);
      if (!mine.length) return '';
      return el('section', { class: 'card' },
        el('h2', {}, `Step ${step.step_id}: ${step.title}`),
        mine.map((t) => el('details', { class: 'task-row' },
          el('summary', {}, el('span', { class: 'task-id' }, t.task_id), el('span', { class: 'task-title' }, t.title),
            el('span', { class: `chip-status ${t.status}` }, t.repeat === 'weekly' && t.closed_week === Dates.weekStart(day) ? 'Done this week' : STATUS_WORDS[t.status])),
          taskBox(t))));
    }),
    data.dates.length ? el('section', { class: 'card' },
      el('h2', {}, 'Key dates'),
      el('ul', { class: 'plain-rows' }, risk.sort((a, b) => ((a.date.date ?? '9') < (b.date.date ?? '9') ? -1 : 1)).map((r) => el('li', { class: 'date-row' },
        el('div', {}, el('div', { class: 'check-name' }, r.date.item),
          el('div', { class: 'muted small' }, [r.date.date ? dateLabel(r.date.date, day) : 'no date', r.date.confirmed === 'yes' ? 'confirmed' : 'expected',
            r.date.last_verified ? `checked ${Dates.shortDay(r.date.last_verified)}` : 'never checked'].join(' · ')),
          r.soon || r.stale ? el('div', { class: 'flag' }, [r.soon ? 'within 60 days' : '', r.stale ? 'verify in Claude chat' : ''].filter(Boolean).join(' · ')) : ''),
        el('button', { class: 'button', type: 'button', onclick: async () => { const v = await verifyDate(r.date.item_id); toast(v.ok ? 'Marked as checked today.' : v.message); } }, 'Mark verified'))))) : '',
    data.facts.length ? el('section', { class: 'card' },
      el('h2', {}, 'Facts'),
      el('dl', { class: 'facts' }, data.facts.map((f) => [el('dt', {}, f.key), el('dd', {}, f.value || '—')])),
      el('p', { class: 'muted small' }, 'Edit facts in the Sheet (Facts tab).')) : '');
}
