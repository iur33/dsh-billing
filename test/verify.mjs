/**
 * Offline checks for the peak-billing fold. Run with:
 *   node test/verify.mjs
 *
 * No harness, no network: the projection is a pure fold, so this is the whole
 * host-side contract except the registry wiring itself.
 */
import assert from 'node:assert/strict';
import { createProjection } from '../lib/projection.js';
import { costOf, resolveConfig, resolveTier } from '../lib/pricing.js';

const config = resolveConfig();
const projection = createProjection(config);

/** Build the durable event envelope the projection registry hands to `apply`. */
function message(seq, turn, model, usage, provider = 'example') {
  return {
    type: 'assistant/message',
    seq,
    time: 1_700_000_000_000 + seq,
    data: {
      turn,
      step: 1,
      message: { role: 'assistant', content: [], source: { kind: 'model', provider, model } },
      usage,
    },
  };
}

const turnStart = (turn) => ({ type: 'turn/start', seq: 1, time: 1, data: { turn } });

// --- official peak rates -----------------------------------------------------
assert.equal(resolveTier('DeepSeek-V4.1-Flash-1017', config).tier, 'flash');
assert.equal(resolveTier('DeepSeek-V4-Pro-0813', config).tier, 'pro');
assert.equal(resolveTier('deepseek-flash', config).tier, 'flash');
assert.equal(resolveTier('some-other-model', config).assumed, true);

assert.equal(
  costOf({ inputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 }, config.tiers.flash),
  2,
);
assert.equal(
  costOf({ inputTokens: 0, cacheReadTokens: 1_000_000, cacheWriteTokens: 0, outputTokens: 0 }, config.tiers.flash),
  0.04,
);
assert.equal(
  costOf({ inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1_000_000 }, config.tiers.pro),
  27,
);

// --- fold --------------------------------------------------------------------
let state = projection.init({}, 0);
assert.equal(projection.wire.view(state).calls, 0);

state = projection.apply(state, turnStart(1));
state = projection.apply(state, message(2, 1, 'DeepSeek-V4.1-Flash-1017', {
  inputTokens: 1_000_000,
  cacheReadTokens: 2_000_000,
  cacheWriteTokens: 0,
  outputTokens: 500_000,
}));
state = projection.apply(state, message(3, 1, 'DeepSeek-V4-Pro-0813', {
  inputTokens: 100_000,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: 10_000,
}));

let view = projection.wire.view(state);
assert.equal(view.calls, 2);
assert.equal(view.totalCost.toFixed(6), (6.08 + 1.17).toFixed(6), 'peak cost for the two calls');
assert.equal(view.offPeakCost.toFixed(6), (3.625).toFixed(6), 'off-peak comparison is half');
assert.equal(view.cacheSavings.toFixed(6), (3.92).toFixed(6), 'cache savings at peak rates');
assert.equal(view.tokens.total, 3_610_000);
assert.equal(view.models[0].tier, 'flash', 'models sorted by cost, flash first');
assert.equal(view.lastTurn.turn, 1);

// --- a new turn resets "this turn" but not the session -----------------------
state = projection.apply(state, turnStart(2));
state = projection.apply(state, message(4, 2, 'DeepSeek-V4.1-Flash-1017', {
  inputTokens: 1_000,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: 500,
}));
view = projection.wire.view(state);
assert.equal(view.calls, 3);
assert.equal(view.lastTurn.turn, 2);
assert.equal(view.lastTurn.calls, 1);
assert.equal(view.lastTurn.cost.toFixed(6), (0.006).toFixed(6));
assert.equal(view.totalCost.toFixed(6), (7.25 + 0.006).toFixed(6));

// --- unusable records are ignored, and apply keeps the same reference --------
const before = state;
state = projection.apply(state, message(5, 2, 'DeepSeek-V4.1-Flash-1017', {
  inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0,
}));
assert.equal(state, before, 'empty usage is a no-op');
state = projection.apply(state, message(6, 2, 'DeepSeek-V4.1-Flash-1017', undefined));
assert.equal(state, before, 'missing usage is a no-op');
state = projection.apply(state, { type: 'tool/call', seq: 7, time: 2, data: { callId: 'x' } });
assert.equal(state, before, 'unrelated events are a no-op');

// --- checkpoint round-trip ---------------------------------------------------
const checkpoint = JSON.parse(JSON.stringify(state));
assert.equal(projection.stateSchema.parse(checkpoint).calls, 3);
projection.wire.viewSchema.parse(projection.wire.view(checkpoint));
assert.throws(() => projection.stateSchema.parse({ calls: 0, models: null }));

// --- a profile can override the table and fall back explicitly ---------------
const custom = resolveConfig({
  tiers: { pro: { cacheHit: 0.5, cacheMiss: 10, output: 30 } },
  defaultTier: null,
});
assert.equal(resolveTier('DeepSeek-V4-Pro-0813', custom).tier, 'pro');
assert.equal(custom.tiers.flash.cacheMiss, 2, 'untouched tiers keep the official peak price');
assert.equal(resolveTier('mystery', custom).tier, null, 'null fallback stays unpriced');

console.log('ok — peak-billing fold, pricing, checkpoint and override checks passed');
