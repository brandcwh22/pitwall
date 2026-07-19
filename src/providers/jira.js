/**
 * Jira Cloud provider adapter.
 *
 * Implements the Provider interface (see ./base.js) against the Jira Cloud REST
 * API v3. Auth is Basic (`email:api_token`, base64) against a per-site base URL
 * like https://your-domain.atlassian.net.
 *
 * Search uses the current `POST /rest/api/3/search/jql` endpoint (the legacy
 * `/search` was removed from Jira Cloud in 2025). That endpoint returns only
 * id/key unless you request `fields`, and paginates with `nextPageToken`.
 *
 * NOTE: the query translation and mapping are unit-tested, but this adapter has
 * not been exercised against a live Jira instance — verify credentials with the
 * onboarding "Test connection" step, which calls getViewer().
 *
 * Docs: https://developer.atlassian.com/cloud/jira/platform/rest/v3/
 */

import { Provider, categoryFromName } from './base.js';

// Fields we need mapped onto the normalized Issue.
const FIELDS = ['summary', 'status', 'issuetype', 'assignee', 'reporter', 'created', 'updated', 'resolutiondate'];

export class JiraProvider extends Provider {
  static id = 'jira';
  static label = 'Jira';
  static docsUrl = 'https://id.atlassian.com/manage-profile/security/api-tokens';
  static fields = [
    { name: 'baseUrl', label: 'Site URL', type: 'text', required: true, option: true,
      help: 'https://your-domain.atlassian.net' },
    { name: 'email', label: 'Account email', type: 'text', required: true, option: true,
      help: 'The email for your Atlassian account' },
    { name: 'token', label: 'API token', type: 'password', required: true,
      help: 'id.atlassian.com → Security → API tokens' },
  ];

  constructor(config = {}) {
    super(config);
    this.baseUrl = (this.options.baseUrl || '').replace(/\/$/, '');
    this.email = this.options.email || '';
    if (!this.baseUrl) throw new Error('Jira adapter requires options.baseUrl');
    if (!this.email) throw new Error('Jira adapter requires options.email');
  }

  _auth() {
    return 'Basic ' + Buffer.from(`${this.email}:${this.token}`).toString('base64');
  }

  async _api(path, { method = 'GET', body } = {}) {
    const res = await fetch(`${this.baseUrl}/rest/api/3${path}`, {
      method,
      headers: {
        Authorization: this._auth(),
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Jira ${method} ${path} → ${res.status} ${text.slice(0, 200)}`);
    }
    return res.status === 204 ? null : res.json();
  }

  async getViewer() {
    const me = await this._api('/myself');
    return {
      id: me.accountId,
      name: me.displayName,
      handle: '@' + (me.emailAddress || me.displayName),
    };
  }

  async listStates() {
    const statuses = await this._api('/status');
    const seen = new Map();
    for (const s of statuses || []) {
      if (!seen.has(s.name)) seen.set(s.name, { id: String(s.id), name: s.name, category: jiraCategory(s) });
    }
    return [...seen.values()];
  }

  async searchIssues(query) {
    const jql = toJQL(query);
    const issues = await this._searchAll(jql);
    return issues.map((i) => this._toIssue(i));
  }

  async _searchAll(jql, cap = 10) {
    const out = [];
    let nextPageToken;
    for (let i = 0; i < cap; i++) {
      const page = await this._api('/search/jql', {
        method: 'POST',
        body: { jql, fields: FIELDS, maxResults: 100, ...(nextPageToken ? { nextPageToken } : {}) },
      });
      out.push(...(page.issues || []));
      if (page.isLast || !page.nextPageToken) break;
      nextPageToken = page.nextPageToken;
    }
    return out;
  }

  async getIssue(id) {
    const i = await this._api(`/issue/${id}?fields=${FIELDS.join(',')}`);
    return this._toIssue(i);
  }

  issueUrl(id) {
    return `${this.baseUrl}/browse/${id}`;
  }

  _toIssue(i) {
    const f = i.fields || {};
    return {
      id: i.key,
      title: f.summary,
      type: (f.issuetype && f.issuetype.name && f.issuetype.name.toLowerCase()) || 'issue',
      state: (f.status && f.status.name) || null,
      owner: (f.assignee && f.assignee.accountId) || null,
      requester: (f.reporter && f.reporter.accountId) || null,
      createdAt: f.created || null,
      updatedAt: f.updated || null,
      startedAt: null, // Jira has no native "started"; derive from changelog if needed
      completedAt: f.resolutiondate || null,
      url: this.issueUrl(i.key),
    };
  }
}

/** Normalize a Jira status into a category (name-based QA wins over the coarse key). */
export function jiraCategory(status) {
  const byName = categoryFromName(status.name);
  if (byName === 'qa') return 'qa';
  const key = status.statusCategory && status.statusCategory.key;
  if (key === 'done') return 'done';
  if (key === 'indeterminate') return 'started';
  if (key === 'new') return 'unstarted';
  return byName;
}

/**
 * Normalized MetricQuery → JQL. Exported for unit testing.
 * @param {import('./base.js').MetricQuery} q
 */
export function toJQL(q) {
  const parts = [];
  if (q.owner === 'me') parts.push('assignee = currentUser()');
  else if (q.owner) parts.push(`assignee = "${q.owner}"`);
  if (q.requester === 'me') parts.push('reporter = currentUser()');
  else if (q.requester) parts.push(`reporter = "${q.requester}"`);
  if (q.type) parts.push(`issuetype = "${q.type}"`);
  if (q.states && q.states.length) {
    parts.push(`status in (${q.states.map((s) => `"${s}"`).join(', ')})`);
  }
  if (q.text) parts.push(`text ~ "${q.text}"`);
  if (q.updatedWithin) parts.push(`updated >= -${q.updatedWithin}`);
  if (q.createdWithin) parts.push(`created >= -${q.createdWithin}`);
  return (parts.join(' AND ') || 'order by updated DESC') + (parts.length ? ' order by updated DESC' : '');
}
