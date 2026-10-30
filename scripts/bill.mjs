#!/usr/bin/env node
/**
 * Build the cross-machine peak-price bill.
 *
 *   node scripts/bill.mjs                     # this machine only, printed
 *   node scripts/bill.mjs --host my-server    # + another machine over SSH
 *   node scripts/bill.mjs --host my-server --write  # ...and cache it for the plugin
 *
 * The remote side runs `scripts/remote-usage.mjs` through its own `node` over
 * SSH and only ships usage records; every price is applied here, from the same
 * table the plugin uses. Nothing needs to be installed on the other machine
 * beyond Node and an SSH account.
 *
 * @module dsh-peak-billing/scripts/bill
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aggregateUsage, collectUsage, dayKey, trimDays } from '../lib/ledger.js';
import { resolveConfig } from '../lib/pricing.js';

const here = dirname(fileURLToPath(import.meta.url));

/** Parse `--flag value` / `--flag` arguments. */
function parseArgs(argv) {
  const args = { host: null, label: null, write: false, json: false, local: true, keepDays: 400, home: null, prices: null, push: null, pushPath: null, tariff: null, holidays: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--host') args.host = argv[++index] ?? null;
    else if (arg === '--label') args.label = argv[++index] ?? null;
    else if (arg === '--home') args.home = argv[++index] ?? null;
    else if (arg === '--prices') args.prices = argv[++index] ?? null;
    else if (arg === '--keep-days') args.keepDays = Number(argv[++index]);
    else if (arg === '--push') args.push = argv[++index] ?? null;
    else if (arg === '--tariff') args.tariff = argv[++index] ?? null;
    else if (arg === '--holidays') args.holidays = argv[++index] ?? null;
    else if (arg === '--push-path') args.pushPath = argv[++index] ?? null;
    else if (arg === '--write') args.write = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--no-local') args.local = false;
    else if (arg === '--help' || arg === '-h') {
      process.stdout.write('usage: bill.mjs [--host <ssh-host>] [--label <name>] [--home <dsh-home>] [--prices <config.json>] [--keep-days <n>] [--write] [--json] [--no-local] [--push <ssh-host>] [--push-path <remote-file>] [--tariff peak|time] [--holidays YYYY-MM-DD,...]\n');
      process.exit(0);
    } else {
      process.stderr.write(`bill: unknown argument ${arg}\n`);
      process.exit(2);
    }
  }
  return args;
}

/** Load a JSON config override for prices, if one was named. */
function loadConfig(path) {
  if (path === null) return resolveConfig();
  return resolveConfig(JSON.parse(readFileSync(path, 'utf8')));
}

/**
 * Run the remote probe over SSH and parse its JSONL.
 *
 * @returns `{ records, error }`; `error` is a short human message on failure.
 */
function remoteUsage(host) {
  return new Promise((resolve) => {
    const script = readFileSync(join(here, 'remote-usage.mjs'), 'utf8');
    const child = spawn('ssh', [
      '-o', 'BatchMode=yes',
      '-o', 'ConnectTimeout=10',
      '-o', 'ServerAliveInterval=15',
      host,
      'node -',
    ], { stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => resolve({ records: [], error: error.message }));
    child.on('close', (code) => {
      if (code !== 0) {
        const reason = stderr.trim().split('\n').filter(Boolean).slice(-1)[0] ?? `ssh exited ${code}`;
        resolve({ records: [], error: reason });
        return;
      }
      const records = [];
      for (const line of stdout.split('\n')) {
        if (line.length === 0 || line[0] !== '{') continue;
        try {
          records.push(JSON.parse(line));
        } catch {
          // ignore a partial trailing line
        }
      }
      resolve({ records, error: null });
    });
    child.stdin.end(script);
  });
}

/** One machine's fleet row, priced and trimmed. */
function machineRow(id, label, kind, host, aggregate, keepDays, now) {
  const days = trimDays(aggregate.days, keepDays, now);
  const today = days[dayKey(now)] ?? { cost: 0, calls: 0 };
  return {
    id,
    label,
    kind,
    ...(host === null ? {} : { host }),
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    calls: aggregate.calls,
    cost: aggregate.cost,
    todayCost: today.cost,
    todayCalls: today.calls,
    tokens: aggregate.tokens,
    days,
    error: null,
  };
}

/** Fold machine rows into the fleet document. */
function fleetDoc(machines, config, now) {
  const days = {};
  for (const machine of machines) {
    for (const [day, value] of Object.entries(machine.days)) {
      const entry = days[day] ?? (days[day] = { cost: 0, calls: 0, machines: {} });
      entry.cost += value.cost;
      entry.calls += value.calls;
      const row = entry.machines[machine.id] ?? (entry.machines[machine.id] = { cost: 0, calls: 0 });
      row.cost += value.cost;
      row.calls += value.calls;
    }
  }
  const today = days[dayKey(now)] ?? { cost: 0, calls: 0, machines: {} };
  return {
    schema: 1,
    generatedAt: now,
    aggregatedBy: hostname(),
    currency: config.currency,
    symbol: config.symbol,
    machines,
    total: {
      calls: machines.reduce((sum, machine) => sum + machine.calls, 0),
      cost: machines.reduce((sum, machine) => sum + machine.cost, 0),
      todayCost: today.cost,
      todayCalls: today.calls,
      tokens: machines.reduce((sum, machine) => {
        for (const key of ['input', 'cacheRead', 'cacheWrite', 'output', 'total']) sum[key] = (sum[key] ?? 0) + (machine.tokens?.[key] ?? 0);
        return sum;
      }, {}),
    },
    days,
  };
}

/** Resolve the remote account's home directory, POSIX or Windows. */
function remoteHome(host) {
  return new Promise((resolve) => {
    const child = spawn('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', host, 'echo %USERPROFILE%'], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 20_000 });
    let out = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.on('error', () => resolve(null));
    child.on('close', (code) => {
      const home = out.trim().split('\n').filter(Boolean).pop() ?? '';
      if (code === 0 && home.length > 0 && home !== '%USERPROFILE%' && !home.includes('%')) resolve(home);
      else resolve(null);
    });
  });
}

/** Copy the fleet document to another machine, read-only there. */
function pushFile(host, target, file) {
  return new Promise((resolve, reject) => {
    const child = spawn('scp', ['-O', '-q', file, `${host}:${target}`], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 30_000 });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(stderr.trim().split('\n').filter(Boolean).pop() ?? `scp exited ${code}`))));
  });
}

/** Human table for the terminal. */
function table(fleet) {
  const symbol = fleet.symbol;
  const money = (value) => `${symbol}${value.toFixed(value < 1 ? 4 : 2)}`;
  const lines = [`峰时价账单 · ${new Date(fleet.generatedAt).toLocaleString()}`, ''];
  const width = Math.max(...fleet.machines.map((machine) => machine.label.length), 2);
  for (const machine of fleet.machines) {
    const pad = machine.label.padEnd(width);
    const failed = machine.error === null ? '' : `  ! ${machine.error}`;
    lines.push(`${pad}  今日 ${money(machine.todayCost)}   总计 ${money(machine.cost)}   ${machine.calls} 次${failed}`);
  }
  lines.push(''.padEnd(width, '-'));
  lines.push(`${'合计'.padEnd(width)}  今日 ${money(fleet.total.todayCost)}   总计 ${money(fleet.total.cost)}   ${fleet.total.calls} 次`);
  return lines.join('\n');
}

const args = parseArgs(process.argv.slice(2));
const config = loadConfig(args.prices);
if (args.tariff !== null) config.tariff = args.tariff === 'time' ? 'time' : 'peak';
if (args.holidays !== null) config.holidays = args.holidays.split(',').map((day) => day.trim()).filter(Boolean);
const now = Date.now();
const home = args.home ?? process.env.DSH_HOME ?? join(homedir(), '.dsh');

const machines = [];
if (args.local) {
  const collected = collectUsage(home);
  const aggregate = aggregateUsage(collected.records, config);
  machines.push(machineRow(hostname(), `${hostname()}`, 'local', null, aggregate, args.keepDays, now));
}

if (args.host !== null) {
  const remote = await remoteUsage(args.host);
  const aggregate = aggregateUsage(remote.records, config);
  const row = machineRow(args.host, args.label ?? args.host, 'ssh', args.host, aggregate, args.keepDays, now);
  row.error = remote.error;
  machines.push(row);
}

if (machines.length === 0) {
  process.stderr.write('bill: nothing to report\n');
  process.exit(1);
}

const fleet = fleetDoc(machines, config, now);

let written = null;
if (args.write) {
  written = join(home, 'peak-billing', 'fleet.json');
  mkdirSync(dirname(written), { recursive: true });
  writeFileSync(written, JSON.stringify(fleet, null, 2));
  if (!args.json) process.stderr.write(`wrote ${written}\n`);
}

if (args.push !== null && written !== null) {
  try {
    let target = args.pushPath;
    if (target === null) {
      const remote = await remoteHome(args.push);
      if (remote === null) throw new Error('could not resolve the remote home; pass --push-path');
      target = `${remote.replace(/\\/g, '/')}/.dsh/peak-billing/fleet.json`;
    }
    await pushFile(args.push, target, written);
    if (!args.json) process.stderr.write(`pushed to ${args.push}:${target}\n`);
  } catch (error) {
    // A failed push must not invalidate the local bill.
    process.stderr.write(`push to ${args.push} failed: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

if (args.json) process.stdout.write(JSON.stringify(fleet, null, 2) + '\n');
else process.stdout.write(table(fleet) + '\n');
