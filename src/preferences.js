/**
 * App-level preferences store.
 *
 * Board-wide customization the user controls from the Preferences page: their
 * display name and car number, the livery accent + light/dark mode, auto-sync
 * cadence, and an optional "time to finish" target (a chequered-flag countdown).
 *
 * Persisted locally to preferences.json in DATA_DIR — like config.json and
 * settings.json it's git-ignored and never leaves the machine. Unlike settings
 * (which is per-connection), preferences are global to the board.
 *
 * Shape of preferences.json (all optional; missing keys fall back to DEFAULTS):
 *   {
 *     "name": "Alex Driver",     // header display name ('' → use the viewer name)
 *     "number": "22",            // car number shown beside the name
 *     "accent": "pitwall",       // livery accent (brand default or an F1 team id)
 *     "autoSyncMinutes": 0,      // 0 = off; else 1 | 5 | 15 | 30
 *     "shiftEnabled": false,     // show the "time to finish" shift countdown
 *     "shiftDays": [1,2,3,4,5],  // work days, 0=Sun … 6=Sat
 *     "shiftStart": "09:00",     // shift start time (HH:MM, local)
 *     "shiftEnd": "17:00"        // shift end time (HH:MM, local)
 *   }
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from './config.js';

const FILE = join(DATA_DIR, 'preferences.json');

/** Livery accents — 'pitwall' is the single-colour brand default; the rest are F1
 *  team colour combos. Actual colours live in the frontend (prefs-apply.js). */
export const ACCENTS = ['pitwall', 'ferrari', 'redbull', 'mercedes', 'mclaren', 'aston', 'alpine', 'williams', 'sauber'];
const SYNC_STEPS = [0, 1, 5, 15, 30];

export const DEFAULTS = Object.freeze({
  name: '',
  number: '22',
  accent: 'pitwall',
  autoSyncMinutes: 0,
  shiftEnabled: false,
  shiftDays: [1, 2, 3, 4, 5],
  shiftStart: '09:00',
  shiftEnd: '17:00',
});

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** @returns {Promise<typeof DEFAULTS>} */
export async function loadPreferences() {
  if (!existsSync(FILE)) return { ...DEFAULTS };
  try {
    return { ...DEFAULTS, ...JSON.parse(await readFile(FILE, 'utf8')) };
  } catch {
    return { ...DEFAULTS }; // a malformed file falls back to defaults rather than crashing
  }
}

/**
 * Merge a patch onto the stored preferences, validating each field, and persist.
 * Unknown/invalid values are ignored so a bad payload can't corrupt the file.
 * @param {Partial<typeof DEFAULTS>} patch
 */
export async function savePreferences(patch) {
  const cur = await loadPreferences();
  const next = { ...cur };
  if (patch == null || typeof patch !== 'object') return next;

  if (patch.name != null) next.name = String(patch.name).trim().slice(0, 40);
  if (patch.number != null) next.number = String(patch.number).replace(/[^0-9A-Za-z]/g, '').slice(0, 3);
  if (ACCENTS.includes(patch.accent)) next.accent = patch.accent;
  if (patch.autoSyncMinutes != null) {
    const n = Number(patch.autoSyncMinutes);
    if (SYNC_STEPS.includes(n)) next.autoSyncMinutes = n;
  }
  if (patch.shiftEnabled != null) next.shiftEnabled = !!patch.shiftEnabled;
  if (Array.isArray(patch.shiftDays)) {
    const days = patch.shiftDays.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    next.shiftDays = [...new Set(days)].sort((a, b) => a - b);
  }
  if (typeof patch.shiftStart === 'string' && HHMM.test(patch.shiftStart)) next.shiftStart = patch.shiftStart;
  if (typeof patch.shiftEnd === 'string' && HHMM.test(patch.shiftEnd)) next.shiftEnd = patch.shiftEnd;

  await writeFile(FILE, JSON.stringify(next, null, 2) + '\n');
  return next;
}
