// @ts-check

/**
 * Where the app finds its server and which Google sign-in client it is. Both are public by
 * nature: the server refuses every request without a listed user's Google sign-in. Set at setup (README).
 */
export const CONFIG = Object.freeze({
  /** The Apps Script API deployment's URL, ending /exec. */
  apiUrl: 'https://script.google.com/macros/s/AKfycby_ptQWDYy-Ad2LlxrZzr9tdESPlr2jjLAuOx38xjNpcpLUbavpgjJ7Aw_dKH-y9Yy9/exec',
  /** The OAuth client ID from Google Cloud: the one family-calendar and household-admin use (same origin). */
  clientId: '558653473092-ltcjl3vevvo8is49of49hovo7tcsshho.apps.googleusercontent.com',
  /** Prefix of this app's localStorage keys: the apps share one origin (github.io). */
  storage: 'tr',
  /**
   * What kind each action is (app-kit's api.js). `reads` only read: they wait 45 seconds and are tried once more, and
   * the saved copy stays on screen. `slow` take long by nature. Everything else is a save: an id,
   * 12 seconds, then one automatic retry with the same id.
   */
  waits: Object.freeze({ reads: Object.freeze(['sync.pull', 'system.check', 'export.all']), slow: Object.freeze([]) }),
});
