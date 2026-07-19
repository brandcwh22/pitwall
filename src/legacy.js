/**
 * Legacy data bridge.
 *
 * The v1 "Pit Wall" frontend (public/app.js) renders from `window.SC_DATA`, a
 * two-level `SC_DATA[workspace][window]` structure with a richer per-window shape
 * than v2's normalized snapshot. This module maps v2 provider data into that
 * shape so the original F1 UI runs unchanged on the new provider-agnostic engine.
 *
 * Sections v2 doesn't compute yet (pace/lap analytics, form trend) are filled
 * with safe empty defaults so the v1 render code never dereferences null.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildSnapshot } from './snapshot.js';
import { ROOT } from './config.js';

const WINS = ['today', 'week', 'month', 'all'];
const WINDOW_LABELS = { today: 'Today', week: 'This Week', month: 'This Month', all: 'All Time' };

const EMPTY_PACE = {
  fastestLapHours: 0, fastestStory: null, avgLapHours: 0, lapCount: 0,
  tyreAgeDays: 0, tyreStory: null, sectors: [],
};

/** Convert one normalized snapshot into a v1 per-window dataset. */
export function toLegacyWindow(snap, win) {
  return {
    meta: {
      workspace: snap.connection.label,
      driver: snap.viewer.name,
      mention: snap.viewer.handle,
      scope: 'Just me',
      generatedAt: snap.generatedAt,
      baseUrl: '', // stories carry a full `url`; the frontend prefers it
      states: [],
      windowLabel: WINDOW_LABELS[win] || win,
    },
    metrics: (snap.metrics || []).map((m, i) => ({
      key: m.key,
      pos: i + 1,
      label: m.label,
      sub: '',
      value: m.value,
      sector: m.color,
      query: '',
      note: '',
      stories: (m.stories || []).map((s) => ({
        id: s.id, name: s.title, state: s.state, updated: s.updatedAt, url: s.url,
      })),
    })),
    pace: { ...EMPTY_PACE },
    sectors: [],
    form: [],
  };
}

/** Replicate one dataset across all four windows (used for sample mode). */
function spread(oneByWin) {
  const out = {};
  for (const w of WINS) {
    const base = oneByWin[w] || oneByWin.week;
    out[w] = { ...base, meta: { ...base.meta, windowLabel: WINDOW_LABELS[w] } };
  }
  return out;
}

/** Build `SC_DATA` for every connection (or the bundled sample). */
export async function buildLegacyData(cfg) {
  if (cfg.sample) {
    const raw = JSON.parse(await readFile(join(ROOT, 'data', 'sample.json'), 'utf8'));
    const one = toLegacyWindow(raw, 'week');
    return { sample: spread({ week: one }) };
  }

  const out = {};
  for (const conn of cfg.connections) {
    const byWin = {};
    for (const w of WINS) {
      const snap = await buildSnapshot(conn, w);
      byWin[w] = toLegacyWindow(snap, w);
    }
    out[conn.id] = byWin;
  }
  return out;
}
