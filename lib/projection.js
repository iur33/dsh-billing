/**
 * The `peakBilling` session projection: a pure fold of provider-reported
 * usage into peak-priced CNY cost.
 *
 * The fold only reads `assistant/message` usage — one settled provider call
 * per event — and the model that produced it (`data.message.source`), so a
 * session that switches models mid-flight is priced per call, not per
 * session. Everything is stored as raw token buckets; prices are applied in
 * the view, which keeps checkpoints small and makes a price change a pure
 * display change.
 *
 * @module dsh-peak-billing/projection
 */
import { cacheSavingsOf, costOf, resolveTier } from './pricing.js';

/** Projection key read by the client through `useProjection("peakBilling")`. */
export const PROJECTION_KEY = 'peakBilling';

/** Bump when the state fields or fold semantics change. */
export const STATE_VERSION = 1;

/** Non-negative finite number or zero. */
function count(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * The billed buckets of one provider usage record.
 * `inputTokens` is the cache-miss prompt side; cache writes are billed there too.
 */
function bucketsOf(usage) {
  return {
    inputTokens: count(usage.inputTokens),
    cacheReadTokens: count(usage.cacheReadTokens),
    cacheWriteTokens: count(usage.cacheWriteTokens),
    outputTokens: count(usage.outputTokens),
  };
}

/**
 * Normalize one provider usage record into billable buckets.
 *
 * @param usage - the `data.usage` object of an `assistant/message` event.
 * @returns the four buckets, or null when the record is unusable.
 */
export function readUsage(usage) {
  if (usage === null || typeof usage !== 'object') return null;
  return bucketsOf(usage);
}

/** True when a usage record carries no billable token at all. */
function emptyBuckets(buckets) {
  return buckets.inputTokens === 0
    && buckets.cacheReadTokens === 0
    && buckets.cacheWriteTokens === 0
    && buckets.outputTokens === 0;
}

/** Zeroed per-model accumulator. */
function zeroModel(provider, model) {
  return {
    provider,
    model,
    calls: 0,
    inputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
  };
}

/** Add one usage record to a `key -> buckets` table, returning a new table. */
function addTo(table, provider, model, buckets) {
  const key = `${provider}\u0000${model}`;
  const previous = table[key] ?? zeroModel(provider, model);
  return {
    ...table,
    [key]: {
      ...previous,
      calls: previous.calls + 1,
      inputTokens: previous.inputTokens + buckets.inputTokens,
      cacheReadTokens: previous.cacheReadTokens + buckets.cacheReadTokens,
      cacheWriteTokens: previous.cacheWriteTokens + buckets.cacheWriteTokens,
      outputTokens: previous.outputTokens + buckets.outputTokens,
    },
  };
}

/** Sum one `key -> buckets` table into flat token totals. */
function totalsOf(table) {
  const totals = {
    inputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    calls: 0,
  };
  for (const entry of Object.values(table)) {
    totals.inputTokens += entry.inputTokens;
    totals.cacheReadTokens += entry.cacheReadTokens;
    totals.cacheWriteTokens += entry.cacheWriteTokens;
    totals.outputTokens += entry.outputTokens;
    totals.calls += entry.calls;
  }
  return totals;
}

/** Price one `key -> buckets` table with the effective config. */
function priceTable(table, config) {
  let cost = 0;
  let savings = 0;
  for (const key of Object.keys(table).sort()) {
    const entry = table[key];
    const resolved = resolveTier(entry.model, config);
    cost += costOf(entry, resolved.prices);
    savings += cacheSavingsOf(entry, resolved.prices);
  }
  return { cost, savings };
}

/**
 * Build the wire view. Amounts are CNY at peak rates; `offPeakCost` is the
 * hypothetical half-price figure and is never what the session is billed.
 */
function viewOf(state, config) {
  const models = [];
  let cost = 0;
  let savings = 0;
  let unpricedCalls = 0;
  for (const key of Object.keys(state.models).sort()) {
    const entry = state.models[key];
    const resolved = resolveTier(entry.model, config);
    const entryCost = costOf(entry, resolved.prices);
    const entrySavings = cacheSavingsOf(entry, resolved.prices);
    cost += entryCost;
    savings += entrySavings;
    if (resolved.tier === null) unpricedCalls += entry.calls;
    models.push({
      provider: entry.provider,
      model: entry.model,
      tier: resolved.tier,
      label: resolved.prices?.label ?? entry.model,
      assumed: resolved.assumed,
      calls: entry.calls,
      cost: entryCost,
      savings: entrySavings,
      tokens: {
        input: entry.inputTokens,
        cacheRead: entry.cacheReadTokens,
        cacheWrite: entry.cacheWriteTokens,
        output: entry.outputTokens,
        total: entry.inputTokens + entry.cacheReadTokens + entry.cacheWriteTokens + entry.outputTokens,
      },
    });
  }
  models.sort((left, right) => right.cost - left.cost || left.model.localeCompare(right.model));
  const totals = totalsOf(state.models);
  const lastTurn = state.lastTurn === null
    ? null
    : (() => {
        const priced = priceTable(state.lastTurn.models, config);
        return { turn: state.lastTurn.turn, calls: state.lastTurn.calls, cost: priced.cost };
      })();
  return {
    currency: config.currency,
    symbol: config.symbol,
    tariff: 'peak',
    calls: totals.calls,
    totalCost: cost,
    offPeakCost: cost * config.offPeakRatio,
    cacheSavings: savings,
    unpricedCalls,
    tokens: {
      input: totals.inputTokens,
      cacheRead: totals.cacheReadTokens,
      cacheWrite: totals.cacheWriteTokens,
      output: totals.outputTokens,
      total: totals.inputTokens + totals.cacheReadTokens + totals.cacheWriteTokens + totals.outputTokens,
    },
    models,
    lastTurn,
  };
}

const number = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Validate a persisted state row before it seeds a cold fold. */
function parseState(value) {
  if (value === null || typeof value !== 'object') throw new Error('peakBilling: state is not an object');
  if (!number(value.calls) || value.models === null || typeof value.models !== 'object') {
    throw new Error('peakBilling: state is missing calls/models');
  }
  for (const entry of Object.values(value.models)) {
    if (entry === null || typeof entry !== 'object') throw new Error('peakBilling: bad model row');
    if (typeof entry.provider !== 'string' || typeof entry.model !== 'string') {
      throw new Error('peakBilling: bad model identity');
    }
    for (const field of ['calls', 'inputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'outputTokens']) {
      if (!number(entry[field])) throw new Error(`peakBilling: bad ${field}`);
    }
  }
  if (value.lastTurn !== null) {
    if (typeof value.lastTurn !== 'object' || !number(value.lastTurn.turn) || typeof value.lastTurn.models !== 'object') {
      throw new Error('peakBilling: bad lastTurn');
    }
  }
  return value;
}

/** Validate the view the client receives; the fold owns the shape. */
function parseView(value) {
  if (value === null || typeof value !== 'object') throw new Error('peakBilling: view is not an object');
  if (!Array.isArray(value.models) || !number(value.totalCost) || !number(value.calls)) {
    throw new Error('peakBilling: malformed view');
  }
  return value;
}

/**
 * Create the projection definition for one resolved config.
 *
 * @param config - an effective config from `resolveConfig`.
 * @returns a `ProjectionDefinition` for `ctx.sessionProjections.register`.
 */
export function createProjection(config) {
  return {
    key: PROJECTION_KEY,
    stateVersion: STATE_VERSION,
    stateSchema: { parse: parseState },
    init: () => ({ calls: 0, models: {}, lastTurn: null }),
    apply: (state, event) => {
      if (event.type === 'turn/start') {
        const turn = count(event.data?.turn);
        if (state.lastTurn !== null && state.lastTurn.turn === turn) return state;
        return { ...state, lastTurn: { turn, calls: 0, models: {} } };
      }
      if (event.type !== 'assistant/message') return state;
      const usage = event.data?.usage;
      if (usage === null || typeof usage !== 'object') return state;
      const buckets = bucketsOf(usage);
      if (emptyBuckets(buckets)) return state;
      const source = event.data?.message?.source;
      const provider = typeof source?.provider === 'string' && source.provider.length > 0 ? source.provider : 'unknown';
      const model = typeof source?.model === 'string' && source.model.length > 0 ? source.model : 'unknown';
      const turn = count(event.data?.turn);
      const models = addTo(state.models, provider, model, buckets);
      const inTurn = state.lastTurn !== null && state.lastTurn.turn === turn;
      const lastTurn = inTurn
        ? {
            ...state.lastTurn,
            calls: state.lastTurn.calls + 1,
            models: addTo(state.lastTurn.models, provider, model, buckets),
          }
        : { turn, calls: 1, models: addTo({}, provider, model, buckets) };
      return { calls: state.calls + 1, models, lastTurn };
    },
    wire: {
      viewSchema: { parse: parseView },
      view: (state) => viewOf(state, config),
    },
  };
}
