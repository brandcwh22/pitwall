/**
 * Snapshot builder.
 *
 * Runs every metric query through a connection's provider and assembles the
 * normalized payload the frontend renders. Provider-agnostic: give it any
 * Provider instance and it produces the same shape.
 */

import { createProvider } from './providers/index.js';
import { defaultTiles, compileTile, WINDOWS } from './metrics.js';
import { getTiles } from './settings.js';

/**
 * @typedef {Object} Snapshot
 * @property {{ id:string, provider:string, label:string }} connection
 * @property {{ name:string, handle:string }} viewer
 * @property {string} window
 * @property {string} generatedAt
 * @property {{ key:string, label:string, color:string, value:number,
 *             stories:{id:string,title:string,state:string,url:string,updatedAt:string|null}[] }[]} metrics
 */

/**
 * Build a snapshot for one connection.
 * @param {import('./config.js').Connection} connection
 * @param {string} windowKey  today|week|month|all
 * @returns {Promise<Snapshot>}
 */
export async function buildSnapshot(connection, windowKey = 'week') {
  const provider = createProvider(connection.provider, {
    token: connection.token,
    options: connection.options,
  });

  const viewer = await provider.getViewer();
  const win = WINDOWS[windowKey] ?? '7d';
  // Prefer the connection's saved tiles; fall back to the starter set.
  const tiles = (await getTiles(connection.id)) || defaultTiles();

  const metrics = await Promise.all(
    tiles.map(async (tile) => {
      const issues = await provider.searchIssues(compileTile(tile, win));
      return {
        key: tile.key,
        label: tile.label,
        color: tile.color,
        value: issues.length,
        stories: issues.slice(0, 25).map((i) => ({
          id: i.id,
          title: i.title,
          state: i.state,
          url: i.url,
          updatedAt: i.updatedAt,
        })),
      };
    })
  );

  return {
    connection: { id: connection.id, provider: connection.provider, label: connection.label },
    viewer: { name: viewer.name, handle: viewer.handle },
    window: windowKey,
    generatedAt: new Date().toISOString(),
    metrics,
  };
}
