import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toShortcutDSL } from '../src/providers/shortcut.js';
import { toJQL } from '../src/providers/jira.js';
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

test('compileTile: bound maps the window to the right axis', () => {
  const created = compileTile({ role: 'requester', scope: 'me', type: 'bug', bound: 'created' }, '30d');
  assert.equal(created.createdWithin, '30d');
  assert.equal(created.updatedWithin, undefined);
});
