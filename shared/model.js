// @ts-check
// GENERATED from apps-script/domain/model.js by scripts/sync-shared.js. Do not edit here:
// edit that file and run `npm run sync:shared`.
import { Schedule } from './schedule.js';

/**
 * The Sheet's columns and the values they allow (docs/PROJECT_BRIEF.md, Google Sheet data model).
 * Columns are only ever added at the END of a tab (Bootstrap adds them to a live Sheet).
 *
 * Shared with the phone app: scripts/sync-shared.js copies this file to pwa/shared/.
 */
const Model = (() => {
  const TRACK_FIELDS = Object.freeze(['track_id', 'name', 'voice', 'unlock_week', 'paused', 'version', 'updated_at']);
  // extra (added at the end, 3b): a bonus toggle such as the TV-free evening, outside the plan: not a habit card, not in the
  // catch-up, the perfect week or the Rival's score.
  const SCHEDULE_FIELDS = Object.freeze(['schedule_id', 'track_id', 'label', 'mode', 'days', 'times_per_week', 'min_minutes',
    'full_minutes', 'sort', 'paused', 'version', 'updated_at', 'extra']);
  const LOG_FIELDS = Object.freeze(['log_id', 'date', 'schedule_id', 'track_id', 'variant', 'minutes', 'note', 'deleted', 'version',
    'updated_at']);
  const POINT_FIELDS = Object.freeze(['point_id', 'date', 'type', 'amount', 'reason', 'log_id', 'deleted', 'version', 'updated_at']);
  /** A break (ADR-018): from–to inclusive; keep_tracks stay on (a partial break); none kept: everything pauses. */
  const BREAK_FIELDS = Object.freeze(['break_id', 'from', 'to', 'keep_tracks', 'note', 'deleted', 'version', 'updated_at']);
  /** A closed week (ADR-019). */
  const WEEK_FIELDS = Object.freeze(['week_start', 'my_points', 'rival_points', 'rival_pct', 'perfect', 'setback', 'closed_at', 'deleted', 'version', 'updated_at']);
  const LINE_FIELDS = Object.freeze(['line_id', 'trigger', 'template', 'paused', 'version', 'updated_at']);
  /** The rewards shop and milestones (Milestone 3b). */
  const REWARD_FIELDS = Object.freeze(['reward_id', 'name', 'cost', 'paused', 'version', 'updated_at']);
  const MILESTONE_FIELDS = Object.freeze(['milestone_id', 'title', 'track', 'month', 'condition', 'bonus', 'achieved_on', 'paused', 'version', 'updated_at']);
  /** The business track (Milestone 4; ADR-011): its content comes from the private seed, never the repo. */
  const STEP_FIELDS = Object.freeze(['step_id', 'order', 'title', 'version', 'updated_at']);
  const TASK_FIELDS = Object.freeze(['task_id', 'step_id', 'title', 'estimate_min', 'depends_on', 'first_action', 'done_looks_like', 'kind',
    'repeat', 'status', 'note', 'done_on', 'closed_week', 'version', 'updated_at']);
  const DATE_FIELDS = Object.freeze(['item_id', 'item', 'date', 'confirmed', 'source', 'last_verified', 'version', 'updated_at']);
  /** An accepted weekly plan (4b): one row per task and day; plan_id is '<date>|<task_id>'. */
  const PLAN_FIELDS = Object.freeze(['plan_id', 'week_start', 'date', 'task_id', 'deleted', 'version', 'updated_at']);
  /** Reading (5a; ADR-023): books, chapter check-ins (two questions and a one-line summary) and the question bank. */
  const BOOK_FIELDS = Object.freeze(['book_id', 'title', 'author', 'status', 'started', 'finished', 'themes', 'favourite', 'disagreed', 'rating',
    'deleted', 'version', 'updated_at']);
  const CHAPTER_FIELDS = Object.freeze(['chapter_id', 'book_id', 'chapter', 'date', 'question_ids', 'question_1', 'answer_1', 'question_2', 'answer_2',
    'summary', 'log_id', 'deleted', 'version', 'updated_at']);
  const QUESTION_FIELDS = Object.freeze(['question_id', 'text', 'paused', 'version', 'updated_at']);
  /** Weekly comfort challenges (5a): the bank, and the weeks a swap or Done fixed. */
  const CHALLENGE_FIELDS = Object.freeze(['challenge_id', 'category', 'text', 'points', 'paused', 'version', 'updated_at']);
  const CHALLENGE_WEEK_FIELDS = Object.freeze(['week_start', 'challenge_id', 'swapped', 'done_on', 'version', 'updated_at']);
  const BOOK_STATUSES = Object.freeze(['reading', 'finished', 'stopped']);
  /**
   * A workout plan for a habit (ADR-029; Workouts tab, filled in by RT): one row per step of a session (A, B …): section
   * 'warm-up', 'pair 1' … 'pair 9', 'cool-down' or 'log' (the log line to fill in); 'progress' rows (no session) give the
   * guidance for a range of sessions done, in `dose` ("1–2").
   */
  const WORKOUT_FIELDS = Object.freeze(['row_id', 'schedule_id', 'session', 'section', 'order', 'exercise', 'dose', 'form', 'easier', 'harder',
    'paused', 'version', 'updated_at']);
  const TASK_STATUSES = Object.freeze(['todo', 'in_progress', 'blocked', 'done', 'retired']);
  const TASK_KINDS = Object.freeze(['task', 'outreach']);
  /** A task or step id: 0A, 1, 0A.1, 3.4 … */
  const BIZ_ID = /^[0-9A-Za-z]{1,6}(\.[0-9A-Za-z]{1,6}){0,3}$/;

  /** fixed: tied to weekdays; weekly: N times a week, any day; stretch: if possible, no penalty (ADR-008). */
  const MODES = Object.freeze(['fixed', 'weekly', 'stretch']);
  const VARIANTS = Object.freeze(['full', 'minimum', 'skipped']);
  const VOICES = Object.freeze(['rival', 'coach']);
  /** Weekdays as stored in Schedule.days, Monday first (weeks run Monday to Sunday, ADR-004). */
  const DAYS = Object.freeze(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  const POINT_TYPES = Object.freeze(['earn', 'spend', 'rival']);

  /** Settings the phone may change (Settings tab, one row per key: ADR-015). */
  const SETTING_KEYS = Object.freeze(['rival_name', 'start_date', 'unlocked_tracks']);

  const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
  /** The longest break, in days. */
  const MAX_BREAK_DAYS = 90;
  const MAX_NOTE = 500;
  const MAX_MINUTES = 600;
  /** Reading: a title or author, an answer or reflection, a one-line summary. */
  const MAX_TITLE = 200;
  const MAX_ANSWER = 1000;
  const MAX_SUMMARY = 200;

  return { TRACK_FIELDS, SCHEDULE_FIELDS, LOG_FIELDS, POINT_FIELDS, BREAK_FIELDS, WEEK_FIELDS, LINE_FIELDS, REWARD_FIELDS, MILESTONE_FIELDS,
    STEP_FIELDS, TASK_FIELDS, DATE_FIELDS, PLAN_FIELDS, BOOK_FIELDS, CHAPTER_FIELDS, QUESTION_FIELDS, CHALLENGE_FIELDS, CHALLENGE_WEEK_FIELDS, WORKOUT_FIELDS,
    TASK_STATUSES, TASK_KINDS, BOOK_STATUSES, BIZ_ID, MODES, VARIANTS, VOICES, DAYS, POINT_TYPES, SETTING_KEYS,
    ID, MAX_NOTE, MAX_MINUTES, MAX_BREAK_DAYS, MAX_TITLE, MAX_ANSWER, MAX_SUMMARY };
})();

export { Model };
