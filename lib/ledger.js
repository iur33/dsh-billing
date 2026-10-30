/**
 * Ledger: fold every session log under a DSH home into per-day, peak-priced
 * totals. This is what makes cross-machine accounting possible — the same
 * records can come from this machine's files or from another machine's
 * `scripts/remote-usage.mjs` over SSH, and are priced by one config.
 *
 * Only `assistant/message` usage is counted, deduplicated by message id so a
 * forked session that inherited a prefix cannot bill the same call twice.
 *
 * @module dsh-peak-billing/ledger
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';
import { readUsage } from './projection.js';
import { cacheSavingsOf, costOf, resolveTier } from './pricing.js';

const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

/** Local `YYYY-MM-DD` key for one epoch millisecond. */
export function dayKey(time) {
  const date = new Date(time);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Every session log file under a `sessions` root, newest path order. */
export function sessionFiles(root) {
  const found = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/^session\.v\d+\.jsonl(?:\.zst|\.zstd)?$/u.test(entry.name)) found.push(path);
    }
  };
  walk(root);
  return found.sort();
}

/**
 * Decode one session log. DSH appends one zstd frame per flush, so a log is a
 * concatenation of frames and must be split on the frame magic rather than
 * handed to a single decompress call.
 */
export function readSessionText(file) {
  const buffer = readFileSync(file);
  if (buffer.length === 0) return '';
  if (!buffer.includes(ZSTD_MAGIC)) return buffer.toString('utf8');
  const starts = [];
  let cursor = 0;
  while (true) {
    const at = buffer.indexOf(ZSTD_MAGIC, cursor);
    if (at < 0) break;
    starts.push(at);
    cursor = at + 4;
  }
  let text = '';
  for (let index = 0; index < starts.length; index += 1) {
    const end = index + 1 < starts.length ? starts[index + 1] : buffer.length;
    try {
      text += zstdDecompressSync(buffer.subarray(starts[index], end)).toString('utf8');
    } catch {
      // A torn trailing frame is expected while a session is being written.
    }
  }
  return text;
}

/** Compact usage record — the wire shape shared with the remote probe. */
function recordOf(event) {
  const usage = readUsage(event?.data?.usage);
  if (usage === null) return null;
  if (usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens + usage.outputTokens === 0) return null;
  const source = event.data?.message?.source ?? {};
  return {
    t: typeof event.time === 'number' ? event.time : Date.now(),
    p: typeof source.provider === 'string' ? source.provider : 'unknown',
    m: typeof source.model === 'string' ? source.model : 'unknown',
    i: typeof event.data?.message?.id === 'string' ? event.data.message.id : null,
    u: usage,
  };
}

/**
 * Read every session log under a DSH home into usage records.
 *
 * @param home - the DSH home (the directory holding `sessions`).
 * @returns `{ records, files, sessions }`; unreadable files are skipped.
 */
export function collectUsage(home) {
  const root = join(home, 'sessions');
  const files = sessionFiles(root);
  const records = [];
  const seen = new Set();
  let sessions = 0;
  for (const file of files) {
    let text;
    try {
      text = readSessionText(file);
    } catch {
      continue;
    }
    let counted = false;
    for (const line of text.split('\n')) {
      if (line.length === 0) continue;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      if (event?.type === 'session') counted = true;
      if (event?.type !== 'assistant/message') continue;
      const record = recordOf(event);
      if (record === null) continue;
      if (record.i !== null) {
        if (seen.has(record.i)) continue;
        seen.add(record.i);
      }
      records.push(record);
    }
    if (counted) sessions += 1;
  }
  return { records, files: files.length, sessions };
}

/** Sum token buckets. */
function addTokens(into, buckets) {
  into.input += buckets.inputTokens;
  into.cacheRead += buckets.cacheReadTokens;
  into.cacheWrite += buckets.cacheWriteTokens;
  into.output += buckets.outputTokens;
}

/**
 * Price usage records into day, model and whole-run totals.
 *
 * @param records - records from {@link collectUsage} or a remote probe.
 * @param config - an effective config from `resolveConfig`.
 * @returns `{ calls, cost, offPeakCost, cacheSavings, tokens, days, models, range }`.
 */
export function aggregateUsage(records, config) {
  const days = {};
  const models = new Map();
  const tokens = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
  let cost = 0;
  let cacheSavings = 0;
  let calls = 0;
  let first = null;
  let last = null;
  const seen = new Set();
  for (const record of records) {
    if (record?.i) {
      if (seen.has(record.i)) continue;
      seen.add(record.i);
    }
    const buckets = readUsage(record?.u);
    if (buckets === null) continue;
    const tier = resolveTier(record.m, config);
    const recordCost = costOf(buckets, tier.prices);
    const recordSavings = cacheSavingsOf(buckets, tier.prices);
    const day = dayKey(record.t);
    const entry = days[day] ?? (days[day] = { cost: 0, calls: 0, tokens: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 } });
    entry.cost += recordCost;
    entry.calls += 1;
    addTokens(entry.tokens, buckets);
    addTokens(tokens, buckets);
    cost += recordCost;
    cacheSavings += recordSavings;
    calls += 1;
    if (first === null || record.t < first) first = record.t;
    if (last === null || record.t > last) last = record.t;
    const key = `${record.p}\u0000${record.m}`;
    const model = models.get(key) ?? {
      provider: record.p,
      model: record.m,
      tier: tier.tier,
      label: tier.prices?.label ?? record.m,
      assumed: tier.assumed,
      calls: 0,
      cost: 0,
      savings: 0,
      tokens: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 },
    };
    model.calls += 1;
    model.cost += recordCost;
    model.savings += recordSavings;
    addTokens(model.tokens, buckets);
    models.set(key, model);
  }
  const total = tokens.input + tokens.cacheRead + tokens.cacheWrite + tokens.output;
  return {
    calls,
    cost,
    offPeakCost: cost * config.offPeakRatio,
    cacheSavings,
    tokens: { ...tokens, total },
    days,
    models: [...models.values()].sort((left, right) => right.cost - left.cost || left.model.localeCompare(right.model)),
    range: { first, last },
  };
}

/** Drop day rows older than `keepDays`, so the fleet file stays small. */
export function trimDays(days, keepDays, now = Date.now()) {
  if (!Number.isFinite(keepDays) || keepDays <= 0) return days;
  const floor = dayKey(now - keepDays * 86_400_000);
  const kept = {};
  for (const [day, value] of Object.entries(days)) if (day >= floor) kept[day] = value;
  return kept;
}
