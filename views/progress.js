// @ts-check

import { el } from '../dom.js';
import { data, spendReward, tickMilestone, updateChallenge, today } from '../store/store.js';
import { Dates } from '../shared/dates.js';
import { Challenges } from '../shared/challenges.js';
import { toast } from './sheet.js';
import { lineFor } from './rival.js';
import { rivalName } from './screens.js';

/**
 * Progress (Milestone 3b): the points balance and the rewards shop (spend, with Undo), streaks (weeks in a
 * row a weekly target was met; break weeks neither add nor break them), and milestones by month: automatic
 * ones are ticked by the app, the rest by hand. A milestone reached brings a badge and the Rival admitting
 * defeat. This week's comfort challenge (5a): Done for its points, Undo, or one swap a week.
 */

/** This week's comfort challenge, or null before week 1 or with no challenges. @param {string} day */
export function weekChallenge(day) {
  const start = data.settings.start_date;
  if (!start || day < start) return null;
  const state = Challenges.forWeek(data.challenges, data.challenge_weeks, Dates.weekStart(day));
  return state.challenge ? state : null;
}

/** The comfort challenge card. @param {string} day */
function challengeCard(day) {
  const state = weekChallenge(day);
  if (!state || !state.challenge) return '';
  const c = state.challenge;
  const act = (/** @type {'done'|'undo'|'swap'} */ action, /** @type {string} */ said) => async (/** @type {Event} */ ev) => {
    const button = /** @type {HTMLButtonElement} */ (ev.currentTarget);
    button.disabled = true;
    const r = await updateChallenge(action, c.challenge_id);
    button.disabled = false;
    toast(r.ok ? said : r.message);
  };
  return el('section', { class: `card challenge${state.done ? ' done' : ''}` },
    el('div', { class: 'habit-head' }, el('h2', {}, "This week's challenge"), state.done ? el('span', { class: 'pill full' }, 'Done') : el('span', { class: 'muted small' }, `+${state.points}`)),
    el('p', { class: 'challenge-text' }, c.text),
    c.category ? el('p', { class: 'muted small' }, c.category.charAt(0).toUpperCase() + c.category.slice(1)) : '',
    el('div', { class: 'actions start' }, state.done
      ? el('button', { class: 'button', type: 'button', onclick: act('undo', 'Challenge undone.') }, 'Undo')
      : [el('button', { class: 'button primary', type: 'button', onclick: act('done', `Out of the comfort zone: +${state.points}.`) }, 'Done'),
        state.canSwap ? el('button', { class: 'button', type: 'button', onclick: act('swap', 'Swapped. This one stays for the week.') }, 'Swap') : '']),
    el('p', { class: 'muted small' }, state.done ? `Done ${Dates.shortDay(/** @type {string} */ (state.row?.done_on))}.` : state.canSwap ? 'Any day this week. One swap if it does not suit.' : 'Any day this week. Swapped already: this one stays.'));
}

/** @param {HTMLElement} main */
export function progressScreen(main) {
  const day = today();
  const balance = data.balance;
  const shop = data.rewards.filter((r) => !r.paused && (r.cost ?? 0) > 0).sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0));
  const spends = data.points.filter((p) => !p.deleted && p.type === 'spend').sort((a, b) => ((a.updated_at ?? '') < (b.updated_at ?? '') ? 1 : -1)).slice(0, 5);

  const buy = (/** @type {Reward} */ r) => async (/** @type {Event} */ ev) => {
    const button = /** @type {HTMLButtonElement} */ (ev.currentTarget);
    button.disabled = true;
    const result = await spendReward({ reward_id: r.reward_id });
    button.disabled = false;
    if (!result.ok) { toast(result.message); return; }
    const id = result.pointId;
    toast(`${r.name}: enjoy it. ${data.balance} points left.`, [], id ? () => { spendReward({ undo: id }).then((u) => toast(u.ok ? 'Spend undone.' : u.message)); } : undefined);
  };

  const reached = data.milestones.filter((m) => !m.paused && m.achieved_on).sort((a, b) => ((a.achieved_on ?? '') < (b.achieved_on ?? '') ? 1 : -1));
  const latest = reached[0];
  const months = [...new Set(data.milestones.filter((m) => !m.paused).map((m) => m.month ?? 0))].sort((a, b) => a - b);

  main.replaceChildren(
    el('h1', { class: 'screen-title' }, 'Progress'),
    el('section', { class: 'card balance-card' },
      el('div', { class: 'balance' }, el('span', { class: 'balance-number' }, String(balance)), el('span', { class: 'muted' }, ' points to spend')),
      el('p', { class: 'muted small' }, 'Earned by logging; spent on rewards. Never below zero.')),
    challengeCard(day),
    el('section', { class: 'card' },
      el('h2', {}, 'Rewards shop'),
      el('ul', { class: 'plain-rows' }, shop.map((r) => el('li', { class: 'shop-row' },
        el('div', {}, el('div', { class: 'check-name' }, r.name), el('div', { class: 'muted small' }, `${r.cost} points`)),
        el('button', { class: `button${balance >= (r.cost ?? 0) ? ' primary' : ''}`, type: 'button', disabled: balance < (r.cost ?? 0), onclick: buy(r) },
          balance >= (r.cost ?? 0) ? 'Spend' : `${(r.cost ?? 0) - balance} to go`)))),
      spends.length ? [el('h3', { class: 'check-group' }, 'Recently'), el('ul', { class: 'plain-list' }, spends.map((p) => el('li', {}, `${Dates.shortDay(p.date)}: ${(p.reason ?? '').replace(/^Reward: /, '')} (−${p.amount})`)))] : '',
      el('p', { class: 'muted small' }, 'Edit the rewards and their costs in the Sheet (Rewards tab).')),
    el('section', { class: 'card' },
      el('h2', {}, 'Streaks'),
      data.streaks.length ? el('ul', { class: 'plain-rows' }, data.streaks.map((s) => el('li', { class: 'streak-row' },
        el('span', {}, s.label), el('span', { class: `streak${s.weeks ? ' on' : ''}` }, s.weeks ? `${s.weeks} week${s.weeks === 1 ? '' : 's'} in a row` : 'not yet'))))
        : el('p', { class: 'muted' }, 'Streaks start with your first week.'),
      el('p', { class: 'muted small' }, 'Weeks in a row the weekly target was met. A break week neither adds to a streak nor breaks it.')),
    latest ? el('section', { class: 'card rival-card' },
      el('span', { class: 'rival-avatar', 'aria-hidden': 'true' }),
      el('div', {}, el('div', { class: 'rival-name' }, rivalName()),
        el('p', { class: 'rival-line' }, lineFor(['milestone'], { name: rivalName(), title: latest.title }, /** @type {string} */ (latest.achieved_on), `${latest.title}. Well done. Don't get used to it.`)))) : '',
    el('section', { class: 'card' },
      el('h2', {}, 'Milestones'),
      months.map((month) => [
        el('h3', { class: 'check-group' }, month ? `Month ${month}` : 'Any time'),
        el('ul', { class: 'plain-rows' }, data.milestones.filter((m) => !m.paused && (m.month ?? 0) === month).map((m) => {
          const done = Boolean(m.achieved_on);
          const manual = m.condition === 'manual';
          return el('li', { class: `milestone-row${done ? ' done' : ''}` },
            el('span', { class: 'badge-mark', 'aria-hidden': 'true' }, done ? '★' : '☆'),
            el('div', { class: 'milestone-text' }, el('div', { class: 'check-name' }, m.title),
              el('div', { class: 'muted small' }, [done ? `Reached ${Dates.shortDay(/** @type {string} */ (m.achieved_on))}` : manual ? 'Tick it when it happens' : 'The app ticks this one',
                (m.bonus ?? 0) > 0 ? `+${m.bonus} points` : ''].filter(Boolean).join(' · '))),
            manual ? el('button', { class: 'button', type: 'button', onclick: async () => {
              const r = await tickMilestone(m.milestone_id, done);
              toast(r.ok ? (done ? 'Unticked.' : `${m.title}: reached!`) : r.message);
            } }, done ? 'Undo' : 'Done') : '');
        })),
      ]),
      el('p', { class: 'muted small' }, `Business milestones arrive with the business track. ${day < (data.settings.start_date ?? '') ? 'Your first week has not started yet.' : ''}`)));
}
