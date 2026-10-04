// @ts-check

import { data } from '../store/store.js';

/**
 * The five tabs in the bottom bar (docs/PROJECT_BRIEF.md, Screens), in order. Settings is behind the gear.
 *
 * @typedef {{ id: string, label: string }} Screen
 */

/** @type {ReadonlyArray<Screen>} */
export const SCREENS = Object.freeze([
  { id: 'today', label: 'Today' },
  { id: 'business', label: 'Business' },
  { id: 'reading', label: 'Reading' },
  { id: 'progress', label: 'Progress' },
  { id: 'showdown', label: 'Showdown' },
]);

/** The Rival's name: the one set in the Sheet's Settings tab, or the default. */
export const rivalName = () => data.settings.rival_name || 'The Rival';
