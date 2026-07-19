#!/usr/bin/env node
/**
 * Pit Wall server.
 *
 * Zero-dependency HTTP server (Node built-ins only). Serves the static frontend
 * from ../public and a small JSON API. Provider-agnostic: it asks the config
 * layer for connections and the snapshot builder for data, never touching a
 * vendor API directly.
 *
 *   GET /api/health              → { ok, sample, connections }
 *   GET /api/connections         → [{ id, provider, label }]
 *   GET /api/snapshot?c=&window= → Snapshot (live, or bundled sample)
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { loadConfig, ROOT } from './config.js';
import { buildSnapshot } from './snapshot.js';

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

    if (path === '/api/connections') {
      const cfg = await loadConfig();
      return sendJson(res, 200, cfg.connections.map((c) => ({ id: c.id, provider: c.provider, label: c.label })));
    }

    if (path === '/api/snapshot') {
      const cfg = await loadConfig();
      const windowKey = url.searchParams.get('window') || cfg.defaultWindow;

      if (cfg.sample) {
        return sendJson(res, 200, await sampleSnapshot(windowKey));
      }

      const id = url.searchParams.get('c') || url.searchParams.get('connection');
      const conn = id ? cfg.connections.find((c) => c.id === id) : cfg.connections[0];
      if (!conn) return sendJson(res, 404, { ok: false, error: `No connection "${id}"` });

      const snapshot = await buildSnapshot(conn, windowKey);
      return sendJson(res, 200, snapshot);
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
