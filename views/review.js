// @ts-check

import { el } from '../dom.js';
import { data, acceptPlan, today } from '../store/store.js';
import { Business } from '../shared/business.js';
import { Dates } from '../shared/dates.js';
import { toast } from './sheet.js';
import { copy, dateLabel } from './business.js';

/**
 * The weekly review (4b; docs/PROJECT_BRIEF.md, Weekly review): last week (done, slipped, blocked), progress per
 * step, dates at risk, and a proposed plan for this week (one task a weekday) that can be changed before it is
 * accepted; each change says its trade-off in one line. Accepting saves the plan and shows the STATUS block to copy.
 * The coach's voice.
 */

/** The plan being edited, kept across redraws until accepted (or the week changes). @type {{ week: string, rows: Array<{ date: string, task_id: string }> } | null} */
let draft = null;

const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** @param {HTMLElement} main */
export function reviewScreen(main) {
  const day = today();
  const weekStart = Dates.weekStart(day);
  if (!data.tasks.some((t) => t.status !== 'retired')) {
    main.replaceChildren(el('h1', { class: 'screen-title' }, 'Weekly review'), el('section', { class: 'card' }, el('p', { class: 'muted' }, 'No business plan loaded yet.')));
    return;
  }
  const accepted = Business.planOf(data.plans, weekStart);
  if (!draft || draft.week !== weekStart) {
    draft = { week: weekStart, rows: accepted.length ? accepted.map((p) => ({ date: p.date, task_id: p.task_id }))
      : Business.propose(data.tasks, data.steps, data.plans, day).map((x) => ({ date: x.date, task_id: x.task.task_id })) };
  }
  const plan = draft;
  const byId = new Map(data.tasks.map((t) => [t.task_id, t]));
  const last = Business.lastWeek(data.tasks, data.steps, data.plans, day);
  const risk = Business.atRisk(data.dates, day).filter((r) => r.soon || r.stale);
  const progress = Business.stepProgress(data.tasks, data.steps).filter((p) => p.total > 0);
  const redraw = () => reviewScreen(main);

  /** The next ready task not already in the plan. */
  const nextReady = () => Business.ordered(Business.available(data.tasks, weekStart), data.steps).find((t) => !plan.rows.some((r) => r.task_id === t.task_id));
  /** The weekdays from today to Friday. */
  const days = () => { const out = []; for (let d = day > weekStart ? day : weekStart; d <= Dates.addDays(weekStart, 4); d = Dates.addDays(d, 1)) out.push(d); return out; };

  const remove = (/** @type {number} */ i) => {
    const [gone] = plan.rows.splice(i, 1);
    toast(`Removing ${gone.task_id}: it waits for next week.`);
    redraw();
  };
  const add = () => {
    const t = nextReady();
    if (!t) { toast('Nothing else is ready to add.'); return; }
    const free = days().find((d) => !plan.rows.some((r) => r.date === d));
    if (free) {
      plan.rows.push({ date: free, task_id: t.task_id });
      plan.rows.sort((a, b) => (a.date < b.date ? -1 : 1));
      toast(`Adding ${t.task_id}: ${plan.rows.length} tasks this week.`);
    } else {
      const pushed = plan.rows[plan.rows.length - 1];
      plan.rows[plan.rows.length - 1] = { date: pushed.date, task_id: t.task_id };
      toast(`Adding ${t.task_id} pushes ${pushed.task_id} to next week.`);
    }
    redraw();
  };

  const list = (/** @type {BizTask[]} */ tasks, /** @type {string} */ none) => (tasks.length
    ? el('ul', { class: 'plain-list' }, tasks.map((t) => el('li', {}, `${t.task_id} ${t.title}${t.note ? ` (${t.note})` : ''}`)))
    : el('p', { class: 'muted small' }, none));

  main.replaceChildren(
    el('h1', { class: 'screen-title' }, 'Weekly review'),
    el('section', { class: 'card' },
      el('h2', {}, `Last week (${Dates.shortDay(last.weekStart)})`),
      el('h3', { class: 'check-group' }, 'Done'), list(last.done, 'Nothing finished last week. That is fine: this week starts now.'),
      el('h3', { class: 'check-group' }, 'Slipped'), list(last.slipped, 'Nothing slipped.'),
      el('h3', { class: 'check-group' }, 'Blocked'), list(last.blocked, 'Nothing blocked.')),
    el('section', { class: 'card' },
      el('h2', {}, 'Progress'),
      el('ul', { class: 'plain-list' }, progress.map((p) => el('li', {}, `Step ${p.step.step_id}: ${p.done}/${p.total} done`)))),
    risk.length ? el('section', { class: 'card' },
      el('h2', {}, 'Dates at risk'),
      el('ul', { class: 'plain-list' }, risk.map((r) => el('li', {}, `${r.date.item}: ${r.date.date ? dateLabel(r.date.date, day) : 'no date'}`,
        r.stale ? el('span', { class: 'flag' }, ' · verify in Claude chat') : ''))),
      el('p', { class: 'muted small' }, 'Mark them verified on the Business tab once checked.')) : '',
    el('section', { class: 'card', id: 'proposal' },
      el('h2', {}, accepted.length ? 'This week (accepted)' : 'Proposed for this week'),
      plan.rows.length ? el('ul', { class: 'plain-rows' }, plan.rows.map((r, i) => {
        const t = byId.get(r.task_id);
        return el('li', { class: 'plan-row' },
          el('span', { class: 'plan-day' }, DAY[Dates.weekdayIndex(r.date)]),
          el('div', { class: 'plan-text' }, el('div', { class: 'check-name' }, `${r.task_id} ${t?.title ?? ''}`),
            el('div', { class: 'muted small' }, [t?.kind === 'outreach' ? 'outreach' : '', t?.estimate_min ? `${t.estimate_min} min` : '', t?.first_action ?? ''].filter(Boolean).join(' · '))),
          el('button', { class: 'button', type: 'button', 'aria-label': `Remove ${r.task_id}`, onclick: () => remove(i) }, 'Remove'));
      })) : el('p', { class: 'muted' }, 'Nothing is ready to plan. Check the Business tab for blocked tasks.'),
      el('div', { class: 'actions start' },
        el('button', { class: 'button', type: 'button', onclick: add }, 'Add the next ready task'),
        el('button', { class: 'button primary', type: 'button', onclick: async (/** @type {Event} */ ev) => {
          const button = /** @type {HTMLButtonElement} */ (ev.currentTarget);
          button.disabled = true;
          const r = await acceptPlan(weekStart, plan.rows);
          button.disabled = false;
          toast(r.ok ? 'Plan saved. Today follows it.' : r.message);
          if (r.ok) redraw();
        } }, accepted.length ? 'Save changes' : 'Accept the plan'))),
    accepted.length ? el('section', { class: 'card' },
      el('div', { class: 'habit-head' }, el('h2', {}, 'STATUS'),
        el('button', { class: 'button', type: 'button', onclick: () => copy(Business.statusBlock(data.tasks, data.steps, data.facts, day), 'STATUS copied.') }, 'Copy')),
      el('pre', { class: 'status-block' }, Business.statusBlock(data.tasks, data.steps, data.facts, day))) : '');
}
