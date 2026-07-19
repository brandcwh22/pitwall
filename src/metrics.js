/**
 * Metric definitions — provider-agnostic.
 *
 * Each metric is a normalized MetricQuery (see providers/base.js) plus a label
 * and an F1 "sector" colour. The snapshot builder runs each query through the
 * active provider, so the same tiles work on Shortcut, Jira, or anything else.
 *
 * These defaults mirror a personal QA workflow ("just me"). They are meant to
 * be edited or, later, made configurable per connection. State names below are
 * the common Shortcut/QA names; override `states` to match your platform.
 */

/**
 * @param {string} win Relative window applied to time-bounded tiles ('7d','30d').
 * @returns {{ key:string, label:string, color:string, filter:import('./providers/base.js').MetricQuery }[]}
 */
export function defaultMetrics(win = '7d') {
  return [
    {
      key: 'ready_for_qa',
      label: 'Ready for QA',
      color: 'purple',
      filter: { owner: 'me', states: ['Ready for QA'] },
    },
    {
      key: 'in_testing',
      label: 'In Testing',
      color: 'silver',
      filter: { owner: 'me', states: ['In Testing'] },
    },
    {
      key: 'bugs_reported',
      label: 'Bugs Reported',
      color: 'red',
      filter: { requester: 'me', type: 'bug', updatedWithin: win },
    },
    {
      key: 'in_dev',
      label: 'In Dev',
      color: 'green',
      filter: { owner: 'me', states: ['In Development'] },
    },
    {
      key: 'new_defect',
      label: 'New Defect',
      color: 'yellow',
      filter: { requester: 'me', type: 'bug', createdWithin: win },
    },
    {
      key: 'test_cases',
      label: 'Test Cases Created',
      color: 'cyan',
      filter: { requester: 'me', text: 'Test Case', updatedWithin: win },
    },
    {
      key: 'tested',
      label: 'Tested',
      color: 'teal',
      filter: { owner: 'me', states: ['Tested', 'Deployed'] },
    },
  ];
}

/** Map a window key to a relative window string used by metric filters. */
export const WINDOWS = { today: '1d', week: '7d', month: '30d', all: null };
