/**
 * Shortcut provider adapter.
 *
 * Implements the Provider interface (see ./base.js) against the Shortcut REST
 * API v3. This is the reference adapter — reading it shows exactly what a new
 * platform adapter (Jira, Linear, GitHub Issues) needs to provide.
 *
 * Auth: Shortcut uses a header token ("Shortcut-Token"), not Bearer.
 * Docs: https://developer.shortcut.com/api/rest/v3
 */

import { Provider, windowStart, categoryFromName } from './base.js';

const API = 'https://api.app.shortcut.com/api/v3';

export class ShortcutProvider extends Provider {
  static id = 'shortcut';
  static label = 'Shortcut';
  static docsUrl = 'https://app.shortcut.com/settings/account/api-tokens';
  /** Fields the onboarding form should collect. `option:true` → stored in options. */
  static fields = [
    { name: 'token', label: 'API token', type: 'password', required: true,
      help: 'Shortcut → Settings → API Tokens' },
    { name: 'slug', label: 'Workspace slug', type: 'text', required: false, option: true,
      help: 'Optional — the "acme" in app.shortcut.com/acme, used to build links' },
  ];

  constructor(config = {}) {
    super(config);
    // Optional workspace slug, used only to build web URLs when the API
    // doesn't hand one back. The API itself is workspace-scoped by the token.
    this.slug = this.options.slug || '';
    this._stateName = null; // lazy cache: workflow_state_id -> name
    this._handle = null; // lazy cache: viewer mention name (no '@')
  }

  async _api(path, { method = 'GET', body } = {}) {
    const res = await fetch(API + path, {
      method,
      headers: {
        'Shortcut-Token': this.token,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Shortcut ${method} ${path} → ${res.status} ${text.slice(0, 200)}`);
    }
    return res.status === 204 ? null : res.json();
  }

  async getViewer() {
    const me = await this._api('/member');
    this._handle = me.mention_name;
    return {
      id: String(me.id),
      name: me.name || me.mention_name,
      handle: '@' + me.mention_name,
    };
  }

  /** Resolve the viewer's mention handle (needed for owner:/requester: queries). */
  async _viewerHandle() {
    if (!this._handle) await this.getViewer();
    return this._handle;
  }

  async _stateMap() {
    if (this._stateName) return this._stateName;
    const workflows = await this._api('/workflows');
    const map = new Map();
    for (const wf of workflows) {
      for (const st of wf.states || []) {
        map.set(st.id, { name: st.name, category: categorize(st) });
      }
    }
    this._stateName = map;
    return map;
  }

  async listStates() {
    const map = await this._stateMap();
    return [...map.entries()].map(([id, v]) => ({
      id: String(id),
      name: v.name,
      category: v.category,
    }));
  }

  /**
   * Translate a normalized MetricQuery into Shortcut's search DSL and run it.
   * Because Shortcut's `state:` search is fuzzy, when the query pins exact
   * state names we post-filter the results against the resolved state name.
   */
  async searchIssues(query) {
    const needsMe = query.owner === 'me' || query.requester === 'me';
    const handle = needsMe ? await this._viewerHandle() : 'me';
    const dsl = toShortcutDSL(query, handle);
    const stories = await this._searchAll(dsl);
    const map = await this._stateMap();

    let issues = stories.map((s) => this._toIssue(s, map));

    if (query.states && query.states.length) {
      const want = new Set(query.states.map((s) => s.toLowerCase()));
      issues = issues.filter((i) => want.has(String(i.state).toLowerCase()));
    }
    return issues;
  }

  async _searchAll(dsl, cap = 14) {
    const out = [];
    let next = `/search/stories?page_size=25&query=${encodeURIComponent(dsl)}`;
    for (let i = 0; i < cap && next; i++) {
      const page = await this._api(next);
      out.push(...(page.data || []));
      next = page.next ? page.next.replace(/^\/api\/v3/, '') : null;
    }
    return out;
  }

  async getIssue(id) {
    const s = await this._api('/stories/' + id);
    const map = await this._stateMap();
    return this._toIssue(s, map);
  }

  issueUrl(id) {
    const slug = this.slug || 'organization';
    return `https://app.shortcut.com/${slug}/story/${id}`;
  }

  _toIssue(s, stateMap) {
    const st = stateMap.get(s.workflow_state_id);
    return {
      id: String(s.id),
      title: s.name,
      type: s.story_type || 'feature',
      state: st ? st.name : String(s.workflow_state_id),
      owner: (s.owner_ids && s.owner_ids[0]) || null,
      requester: s.requested_by_id || null,
      createdAt: s.created_at || null,
      updatedAt: s.updated_at || null,
      startedAt: s.started_at || null,
      completedAt: s.completed_at || null,
      url: s.app_url || this.issueUrl(s.id),
    };
  }
}

/** Bucket a Shortcut state into a normalized category. Prefer Shortcut's own
 *  state type (done/started/unstarted); fall back to name-based inference. */
function categorize(state) {
  const byName = categoryFromName(state.name);
  if (byName === 'qa') return 'qa'; // name signal for QA beats the coarse type
  if (state.type === 'done') return 'done';
  if (state.type === 'started') return 'started';
  return byName;
}

/**
 * Convert a normalized MetricQuery into a Shortcut search-DSL string.
 * Exported for unit testing.
 * @param {import('./base.js').MetricQuery} q
 * @param {string} [me] mention handle without '@'; defaults to the `me` keyword
 */
export function toShortcutDSL(q, me = 'me') {
  const who = me && me !== 'me' ? me.replace(/^@/, '') : 'me';
  const parts = [];
  if (q.owner) parts.push(`owner:${q.owner === 'me' ? who : q.owner}`);
  if (q.requester) parts.push(`requester:${q.requester === 'me' ? who : q.requester}`);
  if (q.type) parts.push(`type:${q.type}`);
  // Shortcut state search is fuzzy; we still send the first hint, then the
  // adapter post-filters on exact names.
  if (q.states && q.states.length) parts.push(`state:"${q.states[0]}"`);
  if (q.text) parts.push(`"${q.text}"`);
  const now = new Date();
  const upd = windowStart(q.updatedWithin, now);
  if (upd) parts.push(`updated:${upd}..*`);
  const crt = windowStart(q.createdWithin, now);
  if (crt) parts.push(`created:${crt}..*`);
  return parts.join(' ');
}
