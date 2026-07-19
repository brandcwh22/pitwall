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
  // Enable once ./jira.js is complete:
  // [JiraProvider.id]: JiraProvider,
};

/** All providers, including incomplete ones, for docs/onboarding UI. */
export const ALL_PROVIDERS = {
  [ShortcutProvider.id]: ShortcutProvider,
  [JiraProvider.id]: JiraProvider,
};

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
