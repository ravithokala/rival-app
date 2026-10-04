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
  const SCHEDULE_FIELDS = Object.freeze(['schedule_id', 'track_id', 'label', 'mode', 'days', 'times_per_week', 'min_minutes',
    'full_minutes', 'sort', 'paused', 'version', 'updated_at']);
  const LOG_FIELDS = Object.freeze(['log_id', 'date', 'schedule_id', 'track_id', 'variant', 'minutes', 'note', 'deleted', 'version',
    'updated_at']);
  const POINT_FIELDS = Object.freeze(['point_id', 'date', 'type', 'amount', 'reason', 'log_id', 'deleted', 'version', 'updated_at']);

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
  const MAX_NOTE = 500;
  const MAX_MINUTES = 600;

  return { TRACK_FIELDS, SCHEDULE_FIELDS, LOG_FIELDS, POINT_FIELDS, MODES, VARIANTS, VOICES, DAYS, POINT_TYPES, SETTING_KEYS,
    ID, MAX_NOTE, MAX_MINUTES };
})();

export { Model };
