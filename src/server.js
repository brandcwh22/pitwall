#!/usr/bin/env node
/**
 * Pit Wall server.
 *
 * Zero-dependency HTTP server (Node built-ins only). Serves the static frontend
 * from ../public and a small JSON API. Provider-agnostic: it asks the config
 * layer for connections and the snapshot builder for data, never touching a
 * vendor API directly.
 *
 *   GET  /api/health               → { ok, sample, connections }
 *   GET  /api/snapshot?c=&window=  → Snapshot (live, or bundled sample)
 *   GET  /api/states?c=            → statuses on the connected platform
 *   GET/POST /api/settings?c=      → per-connection tile config
 *   Onboarding:
 *   GET  /api/providers            → connectable providers + their form fields
 *   GET  /api/connections          → { sample, connections }
 *   POST /api/connections/test     → verify credentials (no save)
 *   POST /api/connections          → save a connection (+ local token)
 *   DELETE /api/connections?c=      → remove a connection
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { loadConfig, addConnection, removeConnection, ROOT } from './config.js';
import { buildSnapshot } from './snapshot.js';
import { createProvider, listProviderMeta, splitCredentials } from './providers/index.js';
import { getConnectionSettings, saveTiles } from './settings.js';
import { defaultTiles } from './metrics.js';
import { categoryFromName } from './providers/base.js';
import { buildLegacyData } from './legacy.js';

// Cache of the v1-shaped SC_DATA; rebuilt on /api/refresh or connection changes.
let legacyCache = null;
const invalidateLegacy = () => { legacyCache = null; };

// Load .env if present (Node built-in, no dependency). Shell env still wins.
try {
  if (typeof process.loadEnvFile === 'function' && existsSync(join(ROOT, '.env'))) {
    process.loadEnvFile(join(ROOT, '.env'));
  }
} catch { /* .env is optional */ }

const PORT = Number(process.env.PORT) || 4200;
const PUBLIC = join(ROOT, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(payload);
}

async function serveStatic(res, urlPath) {
  const rel = normalize(urlPath === '/' ? '/index.html' : urlPath).replace(/^(\.\.[/\\])+/, '');
  const file = join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC) || !existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }
  const body = await readFile(file);
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(body);
}

async function sampleSnapshot(windowKey) {
  const raw = JSON.parse(await readFile(join(ROOT, 'data', 'sample.json'), 'utf8'));
  return { ...raw, window: windowKey || raw.window };
}

/** Distinct statuses seen in the sample snapshot, for sample-mode onboarding. */
async function sampleStates() {
  const snap = await sampleSnapshot();
  const seen = new Map();
  for (const m of snap.metrics || []) {
    for (const s of m.stories || []) {
      if (s.state && !seen.has(s.state)) seen.set(s.state, categoryFromName(s.state));
    }
  }
  return [...seen.entries()].map(([name, category]) => ({ id: name, name, category }));
}

/** Read and JSON-parse a request body (bounded). */
function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > limit) reject(new Error('body too large'));
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

/** Resolve the connection referenced by ?c= (or the first configured one). */
function pickConnection(cfg, url) {
  const id = url.searchParams.get('c') || url.searchParams.get('connection');
  return id ? cfg.connections.find((c) => c.id === id) : cfg.connections[0];
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;

    if (path === '/api/health') {
      const cfg = await loadConfig();
      return sendJson(res, 200, {
        ok: true,
        sample: cfg.sample,
        connections: cfg.connections.map((c) => ({ id: c.id, provider: c.provider, label: c.label })),
      });
    }

    // Legacy v1 frontend data: window.SC_DATA (built from v2 providers, cached).
    if (path === '/data.js') {
      const cfg = await loadConfig();
      if (!legacyCache) legacyCache = await buildLegacyData(cfg);
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      return res.end('window.SC_DATA = ' + JSON.stringify(legacyCache) + ';\n');
    }

    // v1 Sync button: rebuild the snapshot and hand back the whole SC_DATA.
    if (path === '/api/refresh') {
      const cfg = await loadConfig();
      legacyCache = await buildLegacyData(cfg);
      return sendJson(res, 200, { ok: true, snapshot: legacyCache });
    }

    // v1 activity bell — not wired to a source yet; return empty so it's quiet.
    if (path === '/api/activity') {
      return sendJson(res, 200, { ok: true, items: [], events: [] });
    }

    if (path === '/api/snapshot') {
      const cfg = await loadConfig();
      const windowKey = url.searchParams.get('window') || cfg.defaultWindow;

      if (cfg.sample) {
        return sendJson(res, 200, await sampleSnapshot(windowKey));
      }

      const conn = pickConnection(cfg, url);
      if (!conn) return sendJson(res, 404, { ok: false, error: 'No matching connection' });

      const snapshot = await buildSnapshot(conn, windowKey);
      return sendJson(res, 200, snapshot);
    }

    // Onboarding: which providers can a new user connect, and how.
    if (path === '/api/providers') {
      return sendJson(res, 200, listProviderMeta());
    }

    // Onboarding: connections list / create / delete.
    if (path === '/api/connections' && req.method === 'GET') {
      const cfg = await loadConfig();
      return sendJson(res, 200, {
        sample: cfg.sample,
        connections: cfg.connections.map((c) => ({ id: c.id, provider: c.provider, label: c.label })),
      });
    }

    if (path === '/api/connections' && req.method === 'DELETE') {
      const id = url.searchParams.get('c');
      if (!id) return sendJson(res, 400, { ok: false, error: 'connection id (?c=) required' });
      await removeConnection(id);
      invalidateLegacy();
      return sendJson(res, 200, { ok: true });
    }

    // Onboarding: verify credentials WITHOUT saving them.
    if (path === '/api/connections/test' && req.method === 'POST') {
      const body = await readBody(req);
      const { token, options } = splitCredentials(body.provider, body.values || {});
      if (!token) return sendJson(res, 400, { ok: false, error: 'Enter your API token to test' });
      try {
        const provider = createProvider(body.provider, { token, options });
        const viewer = await provider.getViewer();
        return sendJson(res, 200, { ok: true, viewer: { name: viewer.name, handle: viewer.handle } });
      } catch (err) {
        return sendJson(res, 200, { ok: false, error: String(err && err.message || err) });
      }
    }

    // Onboarding: save a verified connection (config.json + local token store).
    if (path === '/api/connections' && (req.method === 'POST' || req.method === 'PUT')) {
      const body = await readBody(req);
      const { token, options } = splitCredentials(body.provider, body.values || {});
      if (!token) return sendJson(res, 400, { ok: false, error: 'token is required' });
      try {
        const saved = await addConnection({
          provider: body.provider,
          label: body.label || body.provider,
          token,
          options,
        });
        invalidateLegacy();
        return sendJson(res, 200, { ok: true, connection: saved });
      } catch (err) {
        return sendJson(res, 400, { ok: false, error: String(err && err.message || err) });
      }
    }

    // Statuses available on the connected platform — powers status selection.
    if (path === '/api/states') {
      const cfg = await loadConfig();
      if (cfg.sample) return sendJson(res, 200, await sampleStates());

      const conn = pickConnection(cfg, url);
      if (!conn) return sendJson(res, 404, { ok: false, error: 'No matching connection' });
      const provider = createProvider(conn.provider, { token: conn.token, options: conn.options });
      const states = await provider.listStates();
      return sendJson(res, 200, states);
    }

    // Per-connection tile settings (which statuses to track, scope, …).
    if (path === '/api/settings') {
      const cfg = await loadConfig();
      const conn = pickConnection(cfg, url);
      const id = conn ? conn.id : 'sample';

      if (req.method === 'GET') {
        const saved = cfg.sample ? null : await getConnectionSettings(id);
        return sendJson(res, 200, {
          connection: id,
          scopeDefault: (saved && saved.scopeDefault) || 'me',
          tiles: (saved && saved.tiles) || defaultTiles(),
          usingDefaults: !(saved && saved.tiles),
        });
      }

      if (req.method === 'POST' || req.method === 'PUT') {
        if (cfg.sample || !conn) {
          return sendJson(res, 400, { ok: false, error: 'Connect a platform before saving settings' });
        }
        const body = await readBody(req);
        const saved = await saveTiles(id, { tiles: body.tiles, scopeDefault: body.scopeDefault });
        invalidateLegacy();
        return sendJson(res, 200, { ok: true, connection: id, ...saved });
      }

      return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
    }

    if (path.startsWith('/api/')) {
      return sendJson(res, 404, { ok: false, error: 'Unknown endpoint' });
    }

    return await serveStatic(res, path);
  } catch (err) {
    console.error('[pitwall]', err);
    sendJson(res, 500, { ok: false, error: String(err && err.message || err) });
  }
});

server.listen(PORT, () => {
  loadConfig().then((cfg) => {
    const mode = cfg.sample ? 'SAMPLE data (no token configured)' : `${cfg.connections.length} connection(s)`;
    console.log(`🏁 Pit Wall running at http://localhost:${PORT}  —  ${mode}`);
  });
});
