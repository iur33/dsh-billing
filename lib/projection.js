/**
 * The `peakBilling` session projection: a pure fold of provider-reported
 * usage into CNY cost, split by the tariff each call fell under.
 *
 * The fold only reads `assistant/message` usage — one settled provider call
 * per event — plus the model that produced it (`data.message.source`), so a
 * session that switches models mid-flight is priced per call. Token buckets
 * are stored split into `peak` and `offPeak`; prices are applied in the view,
 * which keeps checkpoints small and makes a price or tariff change a pure
 * display change.
 *
 * @module dsh-peak-billing/projection
 */
import { billingPeriod, cacheSavingsOf, costOf, offPeakPrices, resolveTier } from './pricing.js';

/** Projection key read by the client through `useProjection("peakBilling")`. */
export const PROJECTION_KEY = 'peakBilling';

/** Bump when the state fields or fold semantics change. */
export const STATE_VERSION = 2;

/** Non-negative finite number or zero. */
function count(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/** The billed buckets of one provider usage record. */
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

/** An all-zero bucket group. */
function zeroBuckets() {
  return { inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 };
}

/** True when a usage record carries no billable token at all. */
function emptyBuckets(buckets) {
  return buckets.inputTokens === 0
    && buckets.cacheReadTokens === 0
    && buckets.cacheWriteTokens === 0
    && buckets.outputTokens === 0;
}

/** Sum two bucket groups. */
function addBuckets(left, right) {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
    cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens,
    outputTokens: left.outputTokens + right.outputTokens,
  };
}

/** Zeroed per-model accumulator. */
function zeroModel(provider, model) {
  return {
    provider,
    model,
    calls: 0,
    peakCalls: 0,
    offPeakCalls: 0,
    peak: zeroBuckets(),
    offPeak: zeroBuckets(),
  };
}

/** Add one usage record to a `key -> model` table, returning a new table. */
function addTo(table, provider, model, buckets, period) {
  const key = `${provider}\u0000${model}`;
  const previous = table[key] ?? zeroModel(provider, model);
  return {
    ...table,
    [key]: {
      ...previous,
      calls: previous.calls + 1,
      peakCalls: previous.peakCalls + (period === 'peak' ? 1 : 0),
      offPeakCalls: previous.offPeakCalls + (period === 'offPeak' ? 1 : 0),
      peak: period === 'peak' ? addBuckets(previous.peak, buckets) : previous.peak,
      offPeak: period === 'offPeak' ? addBuckets(previous.offPeak, buckets) : previous.offPeak,
    },
  };
}

/** Sum one `key -> model` table into flat totals. */
function totalsOf(table) {
  const totals = { inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, calls: 0, peakTokens: 0, offPeakTokens: 0 };
  for (const entry of Object.values(table)) {
    const both = addBuckets(entry.peak, entry.offPeak);
    totals.inputTokens += both.inputTokens;
    totals.cacheReadTokens += both.cacheReadTokens;
    totals.cacheWriteTokens += both.cacheWriteTokens;
    totals.outputTokens += both.outputTokens;
    totals.peakTokens += entry.peak.inputTokens + entry.peak.cacheReadTokens + entry.peak.cacheWriteTokens + entry.peak.outputTokens;
    totals.offPeakTokens += entry.offPeak.inputTokens + entry.offPeak.cacheReadTokens + entry.offPeak.cacheWriteTokens + entry.offPeak.outputTokens;
    totals.calls += entry.calls;
  }
  return totals;
}

/** Price one model entry at both tariffs. */
function priceEntry(entry, tier, config) {
  if (tier.prices === null) return { peak: 0, offPeak: 0, savings: 0 };
  const offPeak = offPeakPrices(tier.prices, config.offPeakRatio);
  return {
    peak: costOf(entry.peak, tier.prices),
    offPeak: costOf(entry.offPeak, offPeak),
    savings: cacheSavingsOf(entry.peak, tier.prices) + cacheSavingsOf(entry.offPeak, offPeak),
  };
}

/**
 * Build the wire view. Amounts are CNY; `offPeakCost` is the hypothetical
 * all-off-peak figure and is null in `tariff: time` mode, where the split is
 * already real (`peakSpend` / `offPeakSpend`).
 */
function viewOf(state, config) {
  const models = [];
  let total = 0;
  let peakSpend = 0;
  let offPeakSpend = 0;
  let savings = 0;
  let unpricedCalls = 0;
  for (const key of Object.keys(state.models).sort()) {
    const entry = state.models[key];
    const tier = resolveTier(entry.model, config);
    const priced = priceEntry(entry, tier, config);
    const both = addBuckets(entry.peak, entry.offPeak);
    total += priced.peak + priced.offPeak;
    peakSpend += priced.peak;
    offPeakSpend += priced.offPeak;
    savings += priced.savings;
    if (tier.tier === null) unpricedCalls += entry.calls;
    models.push({
      provider: entry.provider,
      model: entry.model,
      tier: tier.tier,
      label: tier.prices?.label ?? entry.model,
      assumed: tier.assumed,
      calls: entry.calls,
      peakCalls: entry.peakCalls,
      offPeakCalls: entry.offPeakCalls,
      cost: priced.peak + priced.offPeak,
      savings: priced.savings,
      tokens: {
        input: both.inputTokens,
        cacheRead: both.cacheReadTokens,
        cacheWrite: both.cacheWriteTokens,
        output: both.outputTokens,
        total: both.inputTokens + both.cacheReadTokens + both.cacheWriteTokens + both.outputTokens,
        peak: entry.peak.inputTokens + entry.peak.cacheReadTokens + entry.peak.cacheWriteTokens + entry.peak.outputTokens,
        offPeak: entry.offPeak.inputTokens + entry.offPeak.cacheReadTokens + entry.offPeak.cacheWriteTokens + entry.offPeak.outputTokens,
      },
    });
  }
  models.sort((left, right) => right.cost - left.cost || left.model.localeCompare(right.model));
  const totals = totalsOf(state.models);
  const lastTurn = state.lastTurn === null
    ? null
    : (() => {
        let cost = 0;
        for (const key of Object.keys(state.lastTurn.models).sort()) {
          const entry = state.lastTurn.models[key];
          const tier = resolveTier(entry.model, config);
          const priced = priceEntry(entry, tier, config);
          cost += priced.peak + priced.offPeak;
        }
        return { turn: state.lastTurn.turn, calls: state.lastTurn.calls, cost };
      })();
  return {
    currency: config.currency,
    symbol: config.symbol,
    tariff: config.tariff,
    calls: totals.calls,
    totalCost: total,
    peakSpend,
    offPeakSpend,
    offPeakCost: config.tariff === 'peak' ? total * config.offPeakRatio : null,
    cacheSavings: savings,
    unpricedCalls,
    tokens: {
      input: totals.inputTokens,
      cacheRead: totals.cacheReadTokens,
      cacheWrite: totals.cacheWriteTokens,
      output: totals.outputTokens,
      total: totals.inputTokens + totals.cacheReadTokens + totals.cacheWriteTokens + totals.outputTokens,
      peak: totals.peakTokens,
      offPeak: totals.offPeakTokens,
    },
    models,
    lastTurn,
  };
}

const number = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Validate one model row (both bucket groups). */
function parseModel(entry) {
  if (entry === null || typeof entry !== 'object') throw new Error('peakBilling: bad model row');
  if (typeof entry.provider !== 'string' || typeof entry.model !== 'string') {
    throw new Error('peakBilling: bad model identity');
  }
  for (const field of ['calls', 'peakCalls', 'offPeakCalls']) {
    if (!number(entry[field])) throw new Error(`peakBilling: bad ${field}`);
  }
  for (const group of ['peak', 'offPeak']) {
    const buckets = entry[group];
    if (buckets === null || typeof buckets !== 'object') throw new Error(`peakBilling: bad ${group} buckets`);
    for (const field of ['inputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'outputTokens']) {
      if (!number(buckets[field])) throw new Error(`peakBilling: bad ${group}.${field}`);
    }
  }
}

/** Validate a persisted state row before it seeds a cold fold. */
function parseState(value) {
  if (value === null || typeof value !== 'object') throw new Error('peakBilling: state is not an object');
  if (!number(value.calls) || value.models === null || typeof value.models !== 'object') {
    throw new Error('peakBilling: state is missing calls/models');
  }
  for (const entry of Object.values(value.models)) parseModel(entry);
  if (value.lastTurn !== null) {
    if (typeof value.lastTurn !== 'object' || !number(value.lastTurn.turn) || typeof value.lastTurn.models !== 'object') {
      throw new Error('peakBilling: bad lastTurn');
    }
    for (const entry of Object.values(value.lastTurn.models)) parseModel(entry);
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
      const period = billingPeriod(event.time, config);
      const turn = count(event.data?.turn);
      const models = addTo(state.models, provider, model, buckets, period);
      const inTurn = state.lastTurn !== null && state.lastTurn.turn === turn;
      const lastTurn = inTurn
        ? {
            ...state.lastTurn,
            calls: state.lastTurn.calls + 1,
            models: addTo(state.lastTurn.models, provider, model, buckets, period),
          }
        : { turn, calls: 1, models: addTo({}, provider, model, buckets, period) };
      return { calls: state.calls + 1, models, lastTurn };
    },
    wire: {
      viewSchema: { parse: parseView },
      view: (state) => viewOf(state, config),
    },
  };
}
