/**
 * Per-connection settings store.
 *
 * Holds each connection's chosen tiles (which statuses to track, scope, etc.),
 * persisted locally to settings.json. Like tokens and config.json, this file is
 * git-ignored — it's the user's private setup and never leaves their machine.
 *
 * Shape of settings.json:
 *   {
 *     "<connectionId>": {
 *       "scopeDefault": "me",
 *       "tiles": [ <Tile>, ... ]   // see metrics.js
 *     }
 *   }
 *
 * When a connection has no saved tiles, callers fall back to defaultTiles().
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from './config.js';

const FILE = join(DATA_DIR, 'settings.json');

/** @returns {Promise<Record<string, { scopeDefault?: string, tiles?: import('./metrics.js').Tile[] }>>} */
export async function loadSettings() {
  if (!existsSync(FILE)) return {};
  try {
    return JSON.parse(await readFile(FILE, 'utf8'));
  } catch {
    return {}; // a malformed file falls back to defaults rather than crashing
  }
}

/** @returns {Promise<{ scopeDefault?: string, tiles?: object[] }|null>} */
export async function getConnectionSettings(id) {
  const all = await loadSettings();
  return all[id] || null;
}

/**
 * Saved tiles for a connection, or null to signal "use defaults".
 * @returns {Promise<import('./metrics.js').Tile[]|null>}
 */
export async function getTiles(id) {
  const s = await getConnectionSettings(id);
  return s && Array.isArray(s.tiles) && s.tiles.length ? s.tiles : null;
}

/**
 * Persist a connection's tiles (and optional default scope).
 * @param {string} id
 * @param {{ tiles: object[], scopeDefault?: string }} payload
 */
export async function saveTiles(id, { tiles, scopeDefault }) {
  if (!Array.isArray(tiles)) throw new Error('tiles must be an array');
  const clean = tiles.map(normalizeTile);
  const all = await loadSettings();
  all[id] = {
    ...(all[id] || {}),
    tiles: clean,
    ...(scopeDefault ? { scopeDefault } : {}),
  };
  await writeFile(FILE, JSON.stringify(all, null, 2) + '\n');
  return all[id];
}

/** Coerce an incoming tile to the known fields, dropping anything unexpected. */
function normalizeTile(t) {
  if (!t || !t.key || !t.label) throw new Error('each tile needs a key and label');
  return {
    key: String(t.key),
    label: String(t.label),
    color: t.color || 'silver',
    scope: t.scope === 'team' ? 'team' : 'me',
    role: t.role === 'requester' ? 'requester' : 'owner',
    states: Array.isArray(t.states) ? t.states.map(String) : [],
    type: t.type ? String(t.type) : undefined,
    text: t.text ? String(t.text) : undefined,
    bound: ['updated', 'created', 'none'].includes(t.bound) ? t.bound : 'none',
  };
}
