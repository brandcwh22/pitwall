/**
 * Tile definitions — provider-agnostic and user-configurable.
 *
 * A "tile" is a saved, declarative description of one metric. Users build their
 * own tiles by picking statuses from their connected platform (see the settings
 * flow), so nothing here is tied to a specific workflow's status names. The
 * defaults below are a sensible QA starter set; a connection with saved settings
 * overrides them entirely.
 *
 * Each tile compiles to a normalized MetricQuery (see providers/base.js), which
 * every provider knows how to run.
 *
 * @typedef {Object} Tile
 * @property {string} key
 * @property {string} label
 * @property {string} color                     Sector colour key (see app.css)
 * @property {'me'|'team'} [scope]              'me' filters to the viewer; 'team' counts everyone
 * @property {'owner'|'requester'} [role]        Which relationship 'scope' applies to
 * @property {string[]} [states]                 Status names to include (grouped)
 * @property {string} [type]                     Issue type, e.g. 'bug'
 * @property {string} [text]                     Full-text term
 * @property {'updated'|'created'|'none'} [bound] How the selected time window applies
 */

/**
 * Default starter tiles. Overridden per-connection once a user saves settings.
 * @returns {Tile[]}
 */
export function defaultTiles() {
  return [
    { key: 'ready_for_qa', label: 'Ready for QA', color: 'purple', role: 'owner', scope: 'me', states: ['Ready for QA'], bound: 'none' },
    { key: 'in_testing', label: 'In Testing', color: 'silver', role: 'owner', scope: 'me', states: ['In Testing'], bound: 'none' },
    { key: 'bugs_reported', label: 'Bugs Reported', color: 'red', role: 'requester', scope: 'me', type: 'bug', bound: 'updated' },
    { key: 'in_dev', label: 'In Dev', color: 'green', role: 'owner', scope: 'me', states: ['In Development'], bound: 'none' },
    { key: 'new_defect', label: 'New Defect', color: 'yellow', role: 'requester', scope: 'me', type: 'bug', bound: 'created' },
    { key: 'test_cases', label: 'Test Cases Created', color: 'cyan', role: 'requester', scope: 'me', text: 'Test Case', bound: 'updated' },
    { key: 'tested', label: 'Tested', color: 'teal', role: 'owner', scope: 'me', states: ['Tested', 'Deployed'], bound: 'none' },
  ];
}

/**
 * Compile a Tile into a normalized MetricQuery for the given time window.
 * @param {Tile} tile
 * @param {string|null} win Relative window ('7d','30d') or null for "all time".
 * @returns {import('./providers/base.js').MetricQuery}
 */
export function compileTile(tile, win) {
  const q = {};
  const role = tile.role || 'owner';
  // 'me' pins the viewer on the chosen relationship; 'team' leaves it open.
  if ((tile.scope || 'me') === 'me') q[role] = 'me';
  if (tile.states && tile.states.length) q.states = tile.states;
  if (tile.type) q.type = tile.type;
  if (tile.text) q.text = tile.text;
  if (tile.bound === 'updated') q.updatedWithin = win;
  else if (tile.bound === 'created') q.createdWithin = win;
  return q;
}

/** Map a window key to a relative window string used by tile filters. */
export const WINDOWS = { today: '1d', week: '7d', month: '30d', all: null };

/** The palette keys tiles may use, in a sensible order (for the settings UI). */
export const COLORS = ['purple', 'silver', 'red', 'green', 'yellow', 'cyan', 'teal'];
