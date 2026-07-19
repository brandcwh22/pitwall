/**
 * Provider registry.
 *
 * Register each ready-to-use adapter here, keyed by its `static id`. The config
 * layer looks up a connection's `provider` field against this map.
 *
 * To add a platform: implement the Provider interface (see ./base.js), then add
 * one line below. Jira is intentionally omitted until its adapter is finished.
 */

import { ShortcutProvider } from './shortcut.js';
import { JiraProvider } from './jira.js';

/** @type {Record<string, typeof import('./base.js').Provider>} */
export const PROVIDERS = {
  [ShortcutProvider.id]: ShortcutProvider,
  [JiraProvider.id]: JiraProvider,
};

/** All providers registered, for docs/onboarding UI. */
export const ALL_PROVIDERS = PROVIDERS;

/**
 * Instantiate a provider by id.
 * @param {string} id
 * @param {{ token: string, options?: object }} config
 */
export function createProvider(id, config) {
  const Cls = PROVIDERS[id];
  if (!Cls) {
    const known = Object.keys(PROVIDERS).join(', ') || '(none)';
    throw new Error(`Unknown or disabled provider "${id}". Enabled: ${known}`);
  }
  return new Cls(config);
}

/** Metadata for enabled providers, for the onboarding UI to render forms. */
export function listProviderMeta() {
  return Object.values(PROVIDERS).map((Cls) => ({
    id: Cls.id,
    label: Cls.label,
    docsUrl: Cls.docsUrl,
    fields: Cls.fields || [{ name: 'token', label: 'API token', type: 'password', required: true }],
  }));
}

/** Split a flat onboarding form payload into { token, options } for a provider. */
export function splitCredentials(id, values) {
  const Cls = ALL_PROVIDERS[id];
  const fields = (Cls && Cls.fields) || [{ name: 'token' }];
  const options = {};
  let token;
  for (const f of fields) {
    const v = values[f.name];
    if (v == null || v === '') continue;
    if (f.name === 'token') token = v;
    else if (f.option) options[f.name] = v;
  }
  return { token, options };
}
