/**
 * Loopback JSON routes for the cross-machine bill.
 *
 * The browser cannot read `fleet.json`, and the fleet is not per-session state,
 * so it does not belong in a projection. Two exact routes under the plugin's
 * own prefix keep it out of the host's `/api` fence and out of every other
 * plugin's namespace:
 *
 *   GET  /dsh-billing/fleet   → { ok, sync, fleet? }
 *   POST /dsh-billing/sync    → run bill.mjs, then return the fresh fleet
 *
 * Both are loopback-only: the numbers are not secrets, but a spend ledger has
 * no business being reachable from another host.
 *
 * @module dsh-billing/fleet-route
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BILL_SCRIPT = join(here, '..', 'scripts', 'bill.mjs');
const DEFAULT_FILE = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'billing', 'fleet.json');

/** Resolve the plugin's `fleet` config block. */
export function resolveFleetConfig(input) {
  const raw = input !== null && typeof input === 'object' ? input : {};
  const sshHost = typeof raw.sshHost === 'string' && raw.sshHost.length > 0 ? raw.sshHost : null;
  return {
    enabled: raw.enabled !== false,
    file: typeof raw.file === 'string' && raw.file.length > 0 ? raw.file : DEFAULT_FILE,
    sshHost,
    label: typeof raw.label === 'string' && raw.label.length > 0 ? raw.label : sshHost,
    sync: raw.sync !== false,
    push: raw.push === true,
  };
}

/** True for a connection the browser could only have made on this machine. */
function isLoopback(request) {
  const address = request.socket?.remoteAddress ?? '';
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

/** JSON reply with no caching and no sniffing. */
function send(response, status, payload) {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(payload));
}

/** Read and validate the fleet file, or null when it is absent or malformed. */
function readFleet(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    if (parsed === null || typeof parsed !== 'object' || !Array.isArray(parsed.machines) || typeof parsed.days !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Run `bill.mjs` once and return its fleet document.
 * A second click while one sync is in flight joins the same promise.
 */
function createSyncer(fleet) {
  let inFlight = null;
  return () => {
    if (inFlight !== null) return inFlight;
    if (fleet.sshHost === null || !fleet.sync) return Promise.reject(new Error('fleet sync is not configured'));
    const args = [BILL_SCRIPT, '--write', '--json', '--host', fleet.sshHost, '--keep-days', '400'];
    if (fleet.label !== null) args.push('--label', fleet.label);
    if (fleet.push) args.push('--push', fleet.sshHost);
    if (options.config.tariff === 'time') args.push('--tariff', 'time');
    if (options.config.holidays?.length > 0) args.push('--holidays', options.config.holidays.join(','));
    inFlight = new Promise((resolve, reject) => {
      const child = spawn(process.execPath, args, {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 90_000,
      });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('error', reject);
      child.on('close', (code) => {
        try {
          const start = stdout.indexOf('{');
          if (code !== 0 || start < 0) {
            reject(new Error(stderr.trim().split('\n').filter(Boolean).slice(-1)[0] ?? `bill exited ${code}`));
            return;
          }
          resolve(JSON.parse(stdout.slice(start)));
        } catch (error) {
          reject(error);
        }
      });
    }).finally(() => { inFlight = null; });
    return inFlight;
  };
}

/**
 * Register the fleet routes on the host's web server.
 *
 * @param ctx - a context carrying `webServer` (from `ctx.inject(['webServer'])`).
 * @param options - `{ config: { currency, symbol }, fleet }`.
 */
export function registerFleetRoutes(ctx, options) {
  const { fleet } = options;
  const sync = createSyncer(fleet);
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-billing/fleet',
    handler: (request, response) => {
      if (!isLoopback(request)) {
        send(response, 403, { ok: false, reason: 'loopback-only' });
        return;
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { allow: 'GET' });
        response.end();
        return;
      }
      const stored = readFleet(fleet.file);
      send(response, 200, {
        ok: stored !== null,
        sync: fleet.sshHost !== null && fleet.sync,
        ...(stored === null ? {} : { fleet: stored }),
      });
    },
  }), 'billing: fleet route');
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-billing/sync',
    handler: async (request, response) => {
      if (!isLoopback(request)) {
        send(response, 403, { ok: false, reason: 'loopback-only' });
        return;
      }
      if (request.method !== 'POST') {
        response.writeHead(405, { allow: 'POST' });
        response.end();
        return;
      }
      const origin = request.headers.origin;
      const host = request.headers.host;
      if (typeof origin === 'string' && host !== undefined && !origin.endsWith(`//${host}`)) {
        send(response, 403, { ok: false, reason: 'cross-origin' });
        return;
      }
      try {
        const document = await sync();
        send(response, 200, { ok: true, fleet: document });
      } catch (error) {
        ctx.logger?.warn?.(error instanceof Error ? error : new Error(String(error)));
        send(response, 200, { ok: false, reason: error instanceof Error ? error.message : String(error) });
      }
    },
  }), 'billing: sync route');
}
