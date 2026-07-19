/**
 * Configuration loader.
 *
 * A "connection" binds a provider to a set of credentials. Connections are
 * declared in `config.json` (git-ignored; copy from config.example.json), but
 * **tokens never live in that file** — each connection names an env var that
 * holds its token. This keeps secrets out of the repo entirely.
 *
 * If no config.json exists (or no tokens are set), the app runs in SAMPLE mode
 * and serves data/sample.json so you can see the dashboard immediately.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @typedef {Object} Connection
 * @property {string} id
 * @property {string} provider    Provider id, e.g. 'shortcut'
 * @property {string} label
 * @property {string} tokenEnv    Name of the env var holding the token
 * @property {string} [token]     Resolved at load time (never persisted)
 * @property {object} [options]   Provider-specific (e.g. Jira baseUrl/email)
 */

/**
 * @returns {Promise<{ connections: Connection[], defaultWindow: string, sample: boolean }>}
 */
export async function loadConfig() {
  const path = join(ROOT, 'config.json');
  let raw = { connections: [], defaultWindow: 'week' };

  if (existsSync(path)) {
    try {
      raw = JSON.parse(await readFile(path, 'utf8'));
    } catch (err) {
      throw new Error(`config.json is not valid JSON: ${err.message}`);
    }
  }

  // Resolve tokens from env vars named by each connection.
  const connections = (raw.connections || []).map((c) => ({
    ...c,
    token: c.tokenEnv ? process.env[c.tokenEnv] : undefined,
  }));

  const withTokens = connections.filter((c) => c.token);
  const sample = withTokens.length === 0;

  return {
    connections: sample ? connections : withTokens,
    defaultWindow: raw.defaultWindow || 'week',
    sample,
  };
}

export { ROOT };
