// @ts-check
// GENERATED from apps-script/domain/business.js by scripts/sync-shared.js. Do not edit here:
// edit that file and run `npm run sync:shared`.
import { Dates } from './dates.js';
import { Schedule } from './schedule.js';

/**
 * The business track's rules (Milestone 4; docs/PROJECT_BRIEF.md, Business track): which tasks are open and
 * ready, today's 1–3 within the business block's minutes, progress per step, dates at risk, the STATUS block,
 * the prompt for a normal Claude chat, and the weekly coach (4b): last week, the proposed plan, Today following
 * the accepted plan, and the restart rule after missed days. Rule-based, no AI. Pure: the phone draws from its copy, the server
 * applies the same rules.
 *
 * Shared with the phone app: scripts/sync-shared.js copies this file to pwa/shared/.
 */
const Business = (() => {
  /** Task and step ids in natural order: 0A.2 before 0A.10, 1 before 2. @param {string} a @param {string} b */
  const byId = (a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });

  /** @param {Step[]} steps */
  const stepOrder = (steps) => new Map(steps.map((s) => [s.step_id, s.order ?? 0]));

  /** Tasks in order: by their step's order, then natural id. @param {BizTask[]} tasks @param {Step[]} steps */
  function ordered(tasks, steps) {
    const order = stepOrder(steps);
    return [...tasks].sort((a, b) => ((order.get(a.step_id) ?? 0) - (order.get(b.step_id) ?? 0)) || byId(a.task_id, b.task_id));
  }

  /**
   * Whether a task is finished for now: done, retired, or (a weekly repeat) done this week.
   * @param {BizTask} t @param {string} weekStart
   */
  const finished = (t, weekStart) => t.status === 'done' || t.status === 'retired' || (t.repeat === 'weekly' && t.closed_week === weekStart);

  /** Whether everything a task depends on is finished (a retired task counts). @param {BizTask} task @param {BizTask[]} tasks */
  function depsDone(task, tasks) {
    return task.depends_on.every((dep) => {
      if (dep.startsWith('step:')) {
        const step = dep.slice(5);
        return tasks.filter((t) => t.step_id === step && t.repeat !== 'weekly').every((t) => t.status === 'done' || t.status === 'retired');
      }
      const t = tasks.find((x) => x.task_id === dep);
      return !t || t.status === 'done' || t.status === 'retired';
    });
  }

  /** Open and ready to work on: not finished, not blocked, dependencies done. @param {BizTask[]} tasks @param {string} weekStart */
  const available = (tasks, weekStart) => tasks.filter((t) => !finished(t, weekStart) && t.status !== 'blocked' && depsDone(t, tasks));

  /**
   * Today's tasks: in progress first, then in order; the first always, then the next ones that still fit the
   * budget (skipping any too big for what is left), three at most. A first task bigger than the budget says what "done today" means instead.
   * @param {BizTask[]} tasks @param {Step[]} steps @param {number} budget minutes @param {string} weekStart @param {string[]} [skipped] ids
   * @returns {Array<{ task: BizTask, overBudget: boolean }>}
   */
  function today(tasks, steps, budget, weekStart, skipped = []) {
    if (budget <= 0) return [];
    const ready = ordered(available(tasks, weekStart), steps).filter((t) => !skipped.includes(t.task_id));
    const list = [...ready.filter((t) => t.status === 'in_progress'), ...ready.filter((t) => t.status !== 'in_progress')];
    /** @type {Array<{ task: BizTask, overBudget: boolean }>} */
    const out = [];
    let used = 0;
    for (const task of list) {
      const est = task.estimate_min ?? 0;
      if (out.length === 0) { out.push({ task, overBudget: est > budget }); used = est; continue; }
      if (out.length >= 3) break;
      // Too big for what is left today: try the next, smaller one.
      if (used + est > budget) continue;
      out.push({ task, overBudget: false });
      used += est;
    }
    return out;
  }

  /** The business block's minutes today (0 when there is none: a break, or no block that day). @param {PlanData} data @param {string} date */
  const budgetOn = (data, date) => Schedule.activeItems(data, date).filter((i) => i.track_id === 'business' && Schedule.dueOn(i, date))
    .reduce((m, i) => Math.max(m, i.full_minutes ?? 0), 0);

  /** Progress per step: done of all (weekly repeats and retired tasks aside). @param {BizTask[]} tasks @param {Step[]} steps */
  function stepProgress(tasks, steps) {
    return [...steps].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((step) => {
      const mine = tasks.filter((t) => t.step_id === step.step_id && t.status !== 'retired' && t.repeat !== 'weekly');
      return { step, done: mine.filter((t) => t.status === 'done').length, total: mine.length };
    });
  }

  /** Whether a step is complete (it has tasks, all done). @param {BizTask[]} tasks @param {string} stepId */
  function stepComplete(tasks, stepId) {
    const mine = tasks.filter((t) => t.step_id === stepId && t.status !== 'retired' && t.repeat !== 'weekly');
    return mine.length > 0 && mine.every((t) => t.status === 'done');
  }

  /**
   * Key dates to look at: within 60 days, or not verified for over 30 (the brief: "verify in Claude chat").
   * @param {BizDate[]} dates @param {string} day
   */
  const atRisk = (dates, day) => dates.map((d) => ({
    date: d,
    soon: Dates.isValid(d.date) && Dates.daysBetween(day, /** @type {string} */ (d.date)) <= 60,
    stale: !Dates.isValid(d.last_verified) || Dates.daysBetween(/** @type {string} */ (d.last_verified), day) > 30,
  }));

  /**
   * The STATUS block, exactly in the brief's format. Done: the last seven days; Next: the next ready tasks.
   * @param {BizTask[]} tasks @param {Step[]} steps @param {Setting[]} facts @param {string} day
   */
  function statusBlock(tasks, steps, facts, day) {
    const weekStart = Dates.weekStart(day);
    const sorted = ordered(tasks, steps);
    const recent = sorted.filter((t) => t.done_on && Dates.daysBetween(t.done_on, day) <= 6 && Dates.daysBetween(t.done_on, day) >= 0);
    const note = (/** @type {BizTask} */ t) => (t.note ? `${t.task_id} (${t.note})` : t.task_id);
    const next = available(sorted, weekStart).filter((t) => t.status !== 'in_progress').slice(0, 5);
    const list = (/** @type {string[]} */ xs) => (xs.length ? xs.join(', ') : 'none');
    return [
      `STATUS (${day}):`,
      `Done: ${list(recent.map((t) => t.task_id))}`,
      `In progress: ${list(sorted.filter((t) => t.status === 'in_progress').map(note))}`,
      `Blocked: ${list(sorted.filter((t) => t.status === 'blocked').map(note))}`,
      `Next: ${list(next.map((t) => t.task_id))}`,
      `Key facts: ${facts.map((f) => `${f.key}=${f.value ?? ''}`).join(', ')}`,
    ].join('\n');
  }

  /**
   * A ready-made prompt for a normal Claude chat ("Help me in Claude"): v1 cannot draft or look things up itself.
   * @param {BizTask} task @param {Step|undefined} step @param {string} statusText
   */
  function helpPrompt(task, step, statusText) {
    return [
      `I run a one-person limited company and I'm working through my business plan. Please help me with this task.`,
      ``,
      `Task ${task.task_id}: ${task.title}`,
      step ? `Step ${step.step_id}: ${step.title}` : '',
      task.first_action ? `First action: ${task.first_action}` : '',
      task.done_looks_like ? `Done looks like: ${task.done_looks_like}` : '',
      `Status: ${task.status.replace('_', ' ')}${task.note ? ` (${task.note})` : ''}`,
      task.estimate_min ? `Time I have: about ${task.estimate_min} minutes` : '',
      ``,
      `Where things stand:`,
      statusText,
      ``,
      `Be brief and practical: what should I do first, and what does "done" look like today?`,
    ].filter((line, i, all) => line !== '' || (all[i - 1] !== '' && i > 0)).join('\n');
  }

  /** The live rows of a week's accepted plan, by date. @param {PlanRow[]} plans @param {string} weekStart */
  const planOf = (plans, weekStart) => (plans ?? []).filter((p) => !p.deleted && p.week_start === weekStart).sort((a, b) => (a.date < b.date ? -1 : 1));

  /** Whether this week's review is still to do: the seed is loaded and no plan was accepted. @param {BizTask[]} tasks @param {PlanRow[]} plans @param {string} day */
  const reviewDue = (tasks, plans, day) => tasks.some((t) => t.status !== 'retired') && planOf(plans, Dates.weekStart(day)).length === 0;

  /** Whether a task was finished within a week (done that week, or a weekly repeat closed that week). @param {BizTask} t @param {string} weekStart */
  const doneIn = (t, weekStart) => (t.repeat === 'weekly' ? t.closed_week === weekStart
    : t.status === 'done' && Boolean(t.done_on) && /** @type {string} */ (t.done_on) >= weekStart && /** @type {string} */ (t.done_on) <= Dates.addDays(weekStart, 6));

  /**
   * Last week, for the Monday review (4b): done, slipped (planned but not finished) and blocked now.
   * @param {BizTask[]} tasks @param {Step[]} steps @param {PlanRow[]} plans @param {string} day
   */
  function lastWeek(tasks, steps, plans, day) {
    const last = Dates.addDays(Dates.weekStart(day), -7);
    const sorted = ordered(tasks.filter((t) => t.status !== 'retired'), steps);
    const planned = new Set(planOf(plans, last).map((p) => p.task_id));
    return {
      weekStart: last,
      done: sorted.filter((t) => doneIn(t, last)),
      slipped: sorted.filter((t) => planned.has(t.task_id) && !doneIn(t, last) && t.status !== 'done'),
      blocked: sorted.filter((t) => t.status === 'blocked'),
    };
  }

  /**
   * This week's proposed plan: one task per weekday from today (Mon–Fri), five at most. Outreach first once any is
   * ready, then last week's slipped tasks, then those in progress, then the plan's order (4b).
   * @param {BizTask[]} tasks @param {Step[]} steps @param {PlanRow[]} plans @param {string} day
   * @returns {Array<{ date: string, task: BizTask }>}
   */
  function propose(tasks, steps, plans, day) {
    const weekStart = Dates.weekStart(day);
    const ready = ordered(available(tasks, weekStart), steps);
    const slipped = new Set(lastWeek(tasks, steps, plans, day).slipped.map((t) => t.task_id));
    const firstOutreach = ready.find((t) => t.kind === 'outreach');
    const queue = [
      ...(firstOutreach ? [firstOutreach] : []),
      ...ready.filter((t) => slipped.has(t.task_id)),
      ...ready.filter((t) => t.status === 'in_progress'),
      ...ready,
    ];
    const seen = new Set();
    const picks = queue.filter((t) => !seen.has(t.task_id) && seen.add(t.task_id));
    const days = [];
    for (let d = day > weekStart ? day : weekStart; d <= Dates.addDays(weekStart, 4); d = Dates.addDays(d, 1)) days.push(d);
    return days.slice(0, 5).map((date, i) => ({ date, task: picks[i] })).filter((x) => Boolean(x.task));
  }

  /**
   * Today's tasks with the accepted plan (4b): the task planned for today first, then planned tasks left from earlier
   * days this week ("carried"), then whatever else is ready and still fits the minutes. Without a plan: today().
   * @param {BizTask[]} tasks @param {Step[]} steps @param {PlanRow[]} plans @param {number} budget @param {string} day @param {string[]} [skipped]
   * @returns {Array<{ task: BizTask, overBudget: boolean, planned: 'today'|'carried'|null, from: string|null }>}
   */
  function todayPlanned(tasks, steps, plans, budget, day, skipped = []) {
    if (budget <= 0) return [];
    const weekStart = Dates.weekStart(day);
    const byId = new Map(tasks.map((t) => [t.task_id, t]));
    const rows = planOf(plans, weekStart).filter((p) => p.date <= day);
    /** @type {Array<{ task: BizTask, overBudget: boolean, planned: 'today'|'carried'|null, from: string|null }>} */
    const out = [];
    for (const p of [...rows.filter((r) => r.date === day), ...rows.filter((r) => r.date < day)]) {
      const t = byId.get(p.task_id);
      if (!t || finished(t, weekStart) || skipped.includes(t.task_id) || out.some((o) => o.task.task_id === t.task_id) || out.length >= 3) continue;
      out.push({ task: t, overBudget: out.length === 0 && (t.estimate_min ?? 0) > budget, planned: p.date === day ? 'today' : 'carried', from: p.date === day ? null : p.date });
    }
    let used = out.reduce((m, o) => m + (o.task.estimate_min ?? 0), 0);
    for (const extra of today(tasks, steps, budget, weekStart, [...skipped, ...out.map((o) => o.task.task_id)])) {
      if (out.length >= 3) break;
      const est = extra.task.estimate_min ?? 0;
      if (out.length === 0) { out.push({ ...extra, planned: null, from: null }); used = est; continue; }
      if (used + est > budget) continue;
      out.push({ task: extra.task, overBudget: false, planned: null, from: null });
      used += est;
    }
    return out;
  }

  /**
   * Business days missed in a row before today (4b, the restart rule): a day with a business block due (not on a
   * break) where the block was not logged as done or minimum and no task was finished. Break days are skipped.
   * @param {PlanData} data @param {BizTask[]} tasks @param {string} day
   */
  function missedInARow(data, tasks, day) {
    const start = Dates.isValid(data.settings.start_date) ? /** @type {string} */ (data.settings.start_date) : null;
    if (!start) return 0;
    let n = 0;
    for (let d = Dates.addDays(day, -1); d >= start && Dates.daysBetween(d, day) <= 14; d = Dates.addDays(d, -1)) {
      const due = Schedule.activeItems(data, d).filter((i) => i.track_id === 'business' && Schedule.dueOn(i, d));
      if (!due.length) continue;
      const worked = data.logs.some((l) => l.date === d && due.some((i) => i.schedule_id === l.schedule_id) && Schedule.isDone(l))
        || tasks.some((t) => t.done_on === d);
      if (worked) break;
      n += 1;
    }
    return n;
  }

  /** The one restart task after missed days: the smallest ready one of 15 minutes or less, else the one in progress, else the smallest. @param {BizTask[]} tasks @param {Step[]} steps @param {string} weekStart */
  function restartTask(tasks, steps, weekStart) {
    const ready = ordered(available(tasks, weekStart), steps);
    const bySize = [...ready].sort((a, b) => (a.estimate_min ?? 0) - (b.estimate_min ?? 0));
    return bySize.find((t) => (t.estimate_min ?? 0) <= 15) ?? ready.find((t) => t.status === 'in_progress') ?? bySize[0] ?? null;
  }

  return { byId, ordered, finished, depsDone, available, today, budgetOn, stepProgress, stepComplete, atRisk, statusBlock, helpPrompt,
    planOf, reviewDue, doneIn, lastWeek, propose, todayPlanned, missedInARow, restartTask };
})();

export { Business };
