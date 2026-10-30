/**
 * Offline checks for the ledger: multi-frame zstd logs, fork deduplication,
 * local-day bucketing and peak pricing. Run with `node test/ledger.mjs`.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdCompressSync } from 'node:zlib';
import { aggregateUsage, collectUsage, dayKey, readSessionText } from '../lib/ledger.js';
import { resolveConfig } from '../lib/pricing.js';

const config = resolveConfig();
const home = mkdtempSync(join(tmpdir(), 'peak-billing-ledger-'));

/** One durable event line. */
function line(type, seq, time, data) {
  return JSON.stringify({ type, seq, time, data }) + '\n';
}

/** An assistant message with provider usage and a message id. */
function message(seq, time, id, inputTokens, cacheReadTokens, outputTokens, model = 'DeepSeek-V4.1-Flash-1017') {
  return line('assistant/message', seq, time, {
    turn: 1,
    step: 1,
    message: { id, role: 'assistant', content: [], source: { kind: 'model', provider: 'example', model } },
    usage: { inputTokens, cacheReadTokens, cacheWriteTokens: 0, outputTokens, totalTokens: inputTokens + cacheReadTokens + outputTokens },
  });
}

/** Write a log as two zstd frames, the way DSH appends flushes. */
function writeFrames(file, first, second) {
  const a = zstdCompressSync(Buffer.from(first, 'utf8'));
  const b = zstdCompressSync(Buffer.from(second, 'utf8'));
  writeFileSync(file, Buffer.concat([a, b]));
}

const early = Date.parse('2026-10-29T23:30:00+08:00');
const late = Date.parse('2026-10-30T09:00:00+08:00');

mkdirSync(join(home, 'sessions', 'ws', 's1'), { recursive: true });
mkdirSync(join(home, 'sessions', 'ws', 's2'), { recursive: true });
mkdirSync(join(home, 'sessions', 'ws', 's3'), { recursive: true });

// s1: header + two calls, split across two frames.
writeFrames(
  join(home, 'sessions', 'ws', 's1', 'session.v4.jsonl.zstd'),
  line('session', 0, early, { id: 's1' }) + message(1, early, 'm1', 1_000_000, 0, 0),
  message(2, late, 'm2', 0, 1_000_000, 0),
);

// s2: a forked log that repeats m2 (inherited) and adds a pro call.
writeFrames(
  join(home, 'sessions', 'ws', 's2', 'session.v4.jsonl.zstd'),
  line('session', 0, late, { id: 's2' }) + message(1, late, 'm2', 0, 1_000_000, 0),
  message(2, late, 'm3', 100_000, 0, 10_000, 'DeepSeek-V4-Pro-0813'),
);

// s3: plain jsonl, no compression, one call with a cache write.
writeFileSync(
  join(home, 'sessions', 'ws', 's3', 'session.v4.jsonl'),
  line('session', 0, late, { id: 's3' }) + message(1, late, 'm4', 0, 0, 1_000_000),
);

const collected = collectUsage(home);
assert.equal(collected.files, 3);
assert.equal(collected.sessions, 3);
assert.equal(collected.records.length, 4, 'fork-inherited m2 is deduplicated');

const usage = aggregateUsage(collected.records, config);
assert.equal(usage.calls, 4);
// m1: 1M miss = ¥2; m2: 1M hit = ¥0.04; m3: 0.1M miss + 10k out = ¥0.9 + ¥0.27; m4: 1M out = ¥8.
assert.equal(usage.cost.toFixed(4), (2 + 0.04 + 1.17 + 8).toFixed(4));
assert.equal(usage.cacheSavings.toFixed(4), (1.96).toFixed(4), '1M cache-hit tokens saved ¥1.96');
assert.deepEqual(Object.keys(usage.days).sort(), [dayKey(early), dayKey(late)]);
assert.equal(usage.days[dayKey(late)].calls, 3);
assert.equal(usage.tokens.total, 3_110_000);
assert.equal(usage.models[0].tier, 'flash', 'flash costs more here, so it sorts first');
assert.equal(usage.models.find((model) => model.tier === 'pro').cost.toFixed(2), '1.17');
assert.equal(usage.models.length, 2);

// The same records collected twice would double count — that is the caller's job.
const doubled = aggregateUsage([...collected.records, ...collected.records], config);
assert.equal(doubled.calls, 4, 'aggregate also deduplicates by message id');

// A missing home is empty, not a crash.
const empty = collectUsage(join(home, 'nope'));
assert.equal(empty.records.length, 0);

// Frame splitting is observable directly.
const raw = readSessionText(join(home, 'sessions', 'ws', 's1', 'session.v4.jsonl.zstd'));
assert.equal(raw.trim().split('\n').length, 3);

rmSync(home, { recursive: true, force: true });
console.log('ok — ledger logs, frames, dedupe, days and pricing passed');
