/**
 * Configuration loader + writer.
 *
 * A "connection" binds a provider to credentials. Connections are declared in
 * `config.json` (git-ignored). Tokens are stored **separately** in `.secrets.json`
 * (git-ignored, 0600) keyed by connection id — never in config.json and never in
 * the repo. Advanced users can instead point a connection at an env var via
 * `tokenEnv` (useful for CI); an env var, when set, wins over the secrets store.
 *
 * The onboarding flow writes both files for you (see server.js /api/connections).
 * If nothing is configured, the app runs in SAMPLE mode.
 */

import { readFile, writeFile, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = join(ROOT, 'config.json');
const SECRETS = join(ROOT, '.secrets.json');

/**
 * @typedef {Object} Connection
 * @property {string} id
 * @property {string} provider    Provider id, e.g. 'shortcut'
 * @property {string} label
 * @property {string} [tokenEnv]  Optional env var holding the token (advanced)
 * @property {string} [token]     Resolved at load time (never persisted here)
 * @property {object} [options]   Provider-specific (e.g. Jira baseUrl/email)
 */

async function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (err) {
    throw new Error(`${path} is not valid JSON: ${err.message}`);
  }
}

/** Token store: { "<connectionId>": "<token>" } */
async function readSecrets() {
  return (await readJson(SECRETS, {})) || {};
}

async function writeSecrets(secrets) {
  await writeFile(SECRETS, JSON.stringify(secrets, null, 2) + '\n', { mode: 0o600 });
  await chmod(SECRETS, 0o600).catch(() => {}); // enforce perms on existing files too
}

async function readConfigRaw() {
  const raw = (await readJson(CONFIG, null)) || { connections: [], defaultWindow: 'week' };
  if (!Array.isArray(raw.connections)) raw.connections = [];
  return raw;
}

async function writeConfigRaw(raw) {
  await writeFile(CONFIG, JSON.stringify(raw, null, 2) + '\n');
}

/**
 * @returns {Promise<{ connections: Connection[], defaultWindow: string, sample: boolean }>}
 */
export async function loadConfig() {
  const raw = await readConfigRaw();
  const secrets = await readSecrets();

  const connections = raw.connections.map((c) => ({
    ...c,
    // env var (if present) wins; otherwise the local secrets store.
    token: (c.tokenEnv && process.env[c.tokenEnv]) || secrets[c.id],
  }));

  const withTokens = connections.filter((c) => c.token);
  const sample = withTokens.length === 0;

  return {
    connections: sample ? connections : withTokens,
    defaultWindow: raw.defaultWindow || 'week',
    sample,
  };
}

/** Turn a label into a safe, unique connection id. */
function makeId(label, existing) {
  const base = String(label || 'connection').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'connection';
  let id = base;
  let n = 2;
  const taken = new Set(existing.map((c) => c.id));
  while (taken.has(id)) id = `${base}-${n++}`;
  return id;
}

/**
 * Create or update a connection and store its token locally.
 * @param {{ id?:string, provider:string, label:string, token:string, options?:object }} conn
 * @returns {Promise<Connection>} the saved connection (without the token)
 */
export async function addConnection(conn) {
  if (!conn.provider) throw new Error('provider is required');
  if (!conn.token) throw new Error('token is required');
  const raw = await readConfigRaw();

  const id = conn.id || makeId(conn.label || conn.provider, raw.connections);
  const entry = {
    id,
    provider: conn.provider,
    label: conn.label || conn.provider,
    ...(conn.options && Object.keys(conn.options).length ? { options: conn.options } : {}),
  };

  const idx = raw.connections.findIndex((c) => c.id === id);
  if (idx >= 0) raw.connections[idx] = { ...raw.connections[idx], ...entry };
  else raw.connections.push(entry);
  await writeConfigRaw(raw);

  const secrets = await readSecrets();
  secrets[id] = conn.token;
  await writeSecrets(secrets);

  return entry;
}

/** Remove a connection and its stored token. */
export async function removeConnection(id) {
  const raw = await readConfigRaw();
  raw.connections = raw.connections.filter((c) => c.id !== id);
  await writeConfigRaw(raw);
  const secrets = await readSecrets();
  if (id in secrets) {
    delete secrets[id];
    await writeSecrets(secrets);
  }
}

export { ROOT };
