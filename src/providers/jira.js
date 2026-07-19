/**
 * Jira provider adapter — SKELETON.
 *
 * This is a worked outline showing where each piece of Jira's API maps onto the
 * normalized Provider interface. Fill in the TODOs to enable Jira. It is kept
 * deliberately un-registered-by-default in ./index.js until complete.
 *
 * Auth: Jira Cloud uses Basic auth with `email:api_token` base64-encoded, and a
 * per-site base URL like https://your-domain.atlassian.net.
 * Docs: https://developer.atlassian.com/cloud/jira/platform/rest/v3/
 *
 * The normalized query → JQL mapping is the main work:
 *   owner:me       → assignee = currentUser()
 *   requester:me   → reporter = currentUser()
 *   type:bug       → issuetype = Bug
 *   states:[...]   → status in ("Ready for QA", ...)
 *   updatedWithin  → updated >= -7d
 *   createdWithin  → created >= -7d
 */

import { Provider } from './base.js';

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
    // options: { baseUrl, email }
    this.baseUrl = (this.options.baseUrl || '').replace(/\/$/, '');
    this.email = this.options.email || '';
    if (!this.baseUrl) throw new Error('Jira adapter requires options.baseUrl');
  }

  _auth() {
    // token here is the Jira API token; Jira wants email:token base64.
    return 'Basic ' + Buffer.from(`${this.email}:${this.token}`).toString('base64');
  }

  async _api(path) {
    const res = await fetch(`${this.baseUrl}/rest/api/3${path}`, {
      headers: { Authorization: this._auth(), Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Jira ${path} → ${res.status}`);
    return res.json();
  }

  async getViewer() {
    // TODO: GET /myself → { accountId, displayName }
    const me = await this._api('/myself');
    return { id: me.accountId, name: me.displayName, handle: '@' + (me.emailAddress || me.displayName) };
  }

  async listStates() {
    // TODO: GET /status and map statusCategory.key (new|indeterminate|done)
    // → normalized category (unstarted|started|done); tag QA states by name.
    throw new Error('JiraProvider.listStates() not implemented yet');
  }

  async searchIssues(query) {
    // TODO: build JQL from the normalized MetricQuery (see toJQL below),
    // GET /search?jql=..., map each issue via _toIssue().
    const jql = toJQL(query);
    const res = await this._api(`/search?jql=${encodeURIComponent(jql)}&maxResults=50`);
    return (res.issues || []).map((i) => this._toIssue(i));
  }

  async getIssue(id) {
    const i = await this._api('/issue/' + id);
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
      type: (f.issuetype && f.issuetype.name.toLowerCase()) || 'issue',
      state: f.status && f.status.name,
      owner: (f.assignee && f.assignee.accountId) || null,
      requester: (f.reporter && f.reporter.accountId) || null,
      createdAt: f.created || null,
      updatedAt: f.updated || null,
      startedAt: null, // TODO: derive from changelog if needed
      completedAt: f.resolutiondate || null,
      url: this.issueUrl(i.key),
    };
  }
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
  return parts.join(' AND ') || 'order by updated DESC';
}
