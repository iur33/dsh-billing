/*
 * Remote usage probe. Piped over SSH and run by the other machine's own Node:
 *
 *   ssh <host> "node -" < scripts/remote-usage.mjs
 *
 * It reads that machine's DSH session logs and prints one compact JSON line per
 * billed model call. It holds no prices and no product logic — the local side
 * prices every record with the same config — so it never needs updating when a
 * price changes, and nothing has to be installed on the remote host.
 *
 * Self-contained on purpose: only Node builtins, no imports from this package.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const root = path.join(home, 'sessions');

function walk(directory, found) {
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else if (/^session\.v\d+\.jsonl(?:\.zst|\.zstd)?$/.test(entry.name)) found.push(full);
  }
}

function text(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.length === 0) return '';
  if (!buffer.includes(MAGIC)) return buffer.toString('utf8');
  const starts = [];
  let cursor = 0;
  for (;;) {
    const at = buffer.indexOf(MAGIC, cursor);
    if (at < 0) break;
    starts.push(at);
    cursor = at + 4;
  }
  let out = '';
  for (let index = 0; index < starts.length; index += 1) {
    const end = index + 1 < starts.length ? starts[index + 1] : buffer.length;
    try {
      out += zlib.zstdDecompressSync(buffer.subarray(starts[index], end)).toString('utf8');
    } catch {
      // torn trailing frame while a session is live
    }
  }
  return out;
}

const files = [];
walk(root, files);

const number = (value) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0);
const written = [];
for (const file of files) {
  let body;
  try {
    body = text(file);
  } catch {
    continue;
  }
  for (const line of body.split('\n')) {
    if (!line) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event?.type !== 'assistant/message') continue;
    const usage = event.data?.usage;
    if (usage === null || typeof usage !== 'object') continue;
    const buckets = {
      inputTokens: number(usage.inputTokens),
      cacheReadTokens: number(usage.cacheReadTokens),
      cacheWriteTokens: number(usage.cacheWriteTokens),
      outputTokens: number(usage.outputTokens),
    };
    if (buckets.inputTokens + buckets.cacheReadTokens + buckets.cacheWriteTokens + buckets.outputTokens === 0) continue;
    const source = event.data?.message?.source ?? {};
    written.push({
      t: typeof event.time === 'number' ? event.time : Date.now(),
      p: typeof source.provider === 'string' ? source.provider : 'unknown',
      m: typeof source.model === 'string' ? source.model : 'unknown',
      i: typeof event.data?.message?.id === 'string' ? event.data.message.id : null,
      u: buckets,
    });
  }
}

for (const record of written) process.stdout.write(JSON.stringify(record) + '\n');
