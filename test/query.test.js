import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toShortcutDSL } from '../src/providers/shortcut.js';
import { toJQL, jiraCategory, JiraProvider } from '../src/providers/jira.js';
import { windowStart } from '../src/providers/base.js';
import { compileTile } from '../src/metrics.js';

test('toShortcutDSL maps owner/type/state', () => {
  const dsl = toShortcutDSL({ owner: 'me', type: 'bug', states: ['Ready for QA'] }, 'brandon');
  assert.match(dsl, /owner:brandon/);
  assert.match(dsl, /type:bug/);
  assert.match(dsl, /state:"Ready for QA"/);
});

test('toShortcutDSL adds a date lower-bound for updatedWithin', () => {
  const dsl = toShortcutDSL({ requester: 'me', updatedWithin: '7d' }, 'brandon');
  assert.match(dsl, /requester:brandon/);
  assert.match(dsl, /updated:\d{4}-\d{2}-\d{2}\.\.\*/);
});

test('toJQL maps the same normalized query to JQL', () => {
  const jql = toJQL({ owner: 'me', type: 'Bug', states: ['Ready for QA', 'In Testing'] });
  assert.match(jql, /assignee = currentUser\(\)/);
  assert.match(jql, /issuetype = "Bug"/);
  assert.match(jql, /status in \("Ready for QA", "In Testing"\)/);
});

test('windowStart returns null with no window and an ISO date otherwise', () => {
  assert.equal(windowStart(null, new Date()), null);
  assert.match(windowStart('7d', new Date('2026-01-08T00:00:00Z')), /^2026-01-01$/);
});

test('compileTile: me-scoped status tile pins the viewer on its role', () => {
  const q = compileTile({ role: 'owner', scope: 'me', states: ['QA', 'Ready for QA'] }, '7d');
  assert.equal(q.owner, 'me');
  assert.deepEqual(q.states, ['QA', 'Ready for QA']);
  assert.equal(q.updatedWithin, undefined); // bound defaults to none
});

test('compileTile: team scope drops the person filter', () => {
  const q = compileTile({ role: 'owner', scope: 'team', states: ['QA'] }, '7d');
  assert.equal(q.owner, undefined);
  assert.equal(q.requester, undefined);
});

test('jiraCategory: QA name wins, else statusCategory.key maps', () => {
  assert.equal(jiraCategory({ name: 'Ready for QA', statusCategory: { key: 'indeterminate' } }), 'qa');
  assert.equal(jiraCategory({ name: 'In Progress', statusCategory: { key: 'indeterminate' } }), 'started');
  assert.equal(jiraCategory({ name: 'Done', statusCategory: { key: 'done' } }), 'done');
  assert.equal(jiraCategory({ name: 'Backlog', statusCategory: { key: 'new' } }), 'unstarted');
});

test('JiraProvider._toIssue maps a Jira payload to the normalized shape', () => {
  const p = new JiraProvider({ token: 'x', options: { baseUrl: 'https://acme.atlassian.net', email: 'a@b.co' } });
  const issue = p._toIssue({
    key: 'QA-42',
    fields: {
      summary: 'Login throttling', status: { name: 'Ready for QA' },
      issuetype: { name: 'Bug' }, assignee: { accountId: 'u1' }, reporter: { accountId: 'u2' },
      created: '2026-01-01T00:00:00.000Z', updated: '2026-01-02T00:00:00.000Z', resolutiondate: null,
    },
  });
  assert.equal(issue.id, 'QA-42');
  assert.equal(issue.title, 'Login throttling');
  assert.equal(issue.type, 'bug');
  assert.equal(issue.state, 'Ready for QA');
  assert.equal(issue.url, 'https://acme.atlassian.net/browse/QA-42');
});

test('compileTile: bound maps the window to the right axis', () => {
  const created = compileTile({ role: 'requester', scope: 'me', type: 'bug', bound: 'created' }, '30d');
  assert.equal(created.createdWithin, '30d');
  assert.equal(created.updatedWithin, undefined);
});
