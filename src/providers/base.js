/**
 * Provider abstraction for Pit Wall.
 *
 * A Provider adapts one ticketing platform (Shortcut, Jira, Linear, …) to a
 * single normalized interface. The rest of the app — metrics, snapshot builder,
 * server, frontend — never touches a vendor API directly. To support a new
 * platform you implement this interface and register it in `./index.js`.
 *
 * Everything a provider returns is expressed in the normalized shapes below, so
 * the dashboard renders identically regardless of the underlying platform.
 */

/**
 * @typedef {Object} Viewer   The authenticated user ("me").
 * @property {string} id
 * @property {string} name
 * @property {string} handle  e.g. "@brandonchen"
 *
 * @typedef {Object} State    A workflow state on the platform.
 * @property {string} id
 * @property {string} name
 * @property {'unstarted'|'started'|'qa'|'done'} category  Normalized bucket.
 *
 * @typedef {Object} Issue    A normalized ticket/story/issue.
 * @property {string} id
 * @property {string} title
 * @property {string} type            'bug' | 'feature' | 'chore' | string
 * @property {string} state           Provider state name.
 * @property {string|null} owner
 * @property {string|null} requester
 * @property {string|null} createdAt  ISO 8601
 * @property {string|null} updatedAt  ISO 8601
 * @property {string|null} startedAt  ISO 8601
 * @property {string|null} completedAt ISO 8601
 * @property {string} url             Deep link to the issue.
 *
 * @typedef {Object} MetricQuery   A provider-neutral filter. Each adapter
 *                                 translates this into its own query language.
 * @property {'me'|string} [owner]
 * @property {'me'|string} [requester]
 * @property {string} [type]              e.g. 'bug'
 * @property {string[]} [states]          Match any of these state names.
 * @property {string} [text]              Full-text term.
 * @property {string|null} [updatedWithin] Relative window, e.g. '7d', '30d'.
 * @property {string|null} [createdWithin] Relative window, e.g. '7d'.
 */

export class Provider {
  /** Stable machine id, e.g. 'shortcut'. Override in subclass. */
  static id = 'base';
  /** Human label shown in the UI. */
  static label = 'Base';
  /** Where a user gets an API token, shown during onboarding. */
  static docsUrl = '';

  /**
   * @param {{ token: string, options?: Record<string, any> }} config
   */
  constructor(config = {}) {
    if (new.target === Provider) {
      throw new Error('Provider is abstract — subclass it (see shortcut.js).');
    }
    this.token = config.token;
    this.options = config.options || {};
  }

  /** @returns {Promise<Viewer>} */
  async getViewer() {
    throw new Error(`${this.constructor.name}.getViewer() not implemented`);
  }

  /** @returns {Promise<State[]>} */
  async listStates() {
    throw new Error(`${this.constructor.name}.listStates() not implemented`);
  }

  /**
   * @param {MetricQuery} query
   * @returns {Promise<Issue[]>}
   */
  async searchIssues(query) {
    throw new Error(`${this.constructor.name}.searchIssues() not implemented`);
  }

  /**
   * @param {string} id
   * @returns {Promise<Issue>}
   */
  async getIssue(id) {
    throw new Error(`${this.constructor.name}.getIssue() not implemented`);
  }

  /** @param {string} id @returns {string} */
  issueUrl(id) {
    throw new Error(`${this.constructor.name}.issueUrl() not implemented`);
  }
}

/**
 * Best-effort category for a status, inferred from its name. Used for smart
 * defaults in onboarding (the user can always override). Order matters:
 * "done" terms are checked before "qa" so "Tested"/"Deployed" resolve to done
 * even though they contain the substring "test".
 * @param {string} name
 * @returns {'unstarted'|'started'|'qa'|'done'}
 */
export function categoryFromName(name) {
  const n = String(name || '').toLowerCase();
  if (/deploy|done|complete|shipped|closed|tested|resolved/.test(n)) return 'done';
  if (/qa|verif|test/.test(n)) return 'qa';
  if (/dev|progress|start|doing|review|building/.test(n)) return 'started';
  return 'unstarted';
}

/**
 * Turn a relative window like '7d' / '30d' into an ISO date `from` boundary.
 * Shared helper so every adapter interprets windows identically.
 * @param {string|null|undefined} within
 * @param {Date} now
 * @returns {string|null} ISO date (YYYY-MM-DD) or null when no window.
 */
export function windowStart(within, now) {
  if (!within) return null;
  const m = /^(\d+)([dwm])$/.exec(String(within).trim());
  if (!m) return null;
  const n = Number(m[1]);
  const days = m[2] === 'd' ? n : m[2] === 'w' ? n * 7 : n * 30;
  const d = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}
