/**
 * Host half of the peak-price billing plugin.
 *
 * It owns two things: the `sessionBilling` session projection (per-session cost at
 * official peak rates) and, when a web server is present, the loopback routes
 * that serve the cross-machine bill the `bill.mjs` script writes.
 *
 * @module dsh-billing
 */
import { registerFleetRoutes, resolveFleetConfig } from './fleet-route.js';
import { createProjection } from './projection.js';
import { resolveConfig } from './pricing.js';

/** Cordis plugin name. */
export const name = 'billing';

/** The projection registry is this plugin's whole purpose. */
export const inject = ['sessionProjections'];

/**
 * Register the `sessionBilling` unit, plus the fleet routes when a web server is
 * mounted. Both are effects on this plugin's fiber, so unloading removes them.
 *
 * @param ctx - registrant context carrying the projection registry.
 * @param config - optional `tiers` / `rules` / `currency` / `fleet` overrides.
 */
export function apply(ctx, config) {
  const priced = resolveConfig(config);
  ctx.sessionProjections.register(createProjection(priced));

  const fleet = resolveFleetConfig(config?.fleet);
  if (!fleet.enabled) return;
  ctx.inject(['webServer'], (scoped) => {
    try {
      registerFleetRoutes(scoped, { config: priced, fleet });
    } catch (error) {
      // A route clash must not take the session projection down with it.
      scoped.logger?.warn?.(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
