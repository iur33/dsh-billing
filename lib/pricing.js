/**
 * Peak-only pricing for the DeepSeek models a DSH profile can route to.
 *
 * Every rate in this file is the official **peak** list price published at
 * https://api-docs.deepseek.com/zh-cn/quick_start/pricing (CNY per 1M tokens).
 * Off-peak rates are exactly half of these, so `offPeakRatio` defaults to 0.5;
 * this plugin never applies it to what it reports as billed cost — it only
 * shows the hypothetical off-peak figure for comparison.
 *
 * @module dsh-billing/pricing
 */

/** Official peak prices, CNY per 1M tokens, checked 2026-10-30. */
export const DEFAULT_CONFIG = {
  /** ISO-ish currency label shown in the UI. */
  currency: 'CNY',
  /** Currency symbol prefixed to every amount. */
  symbol: '¥',
  /** Official off-peak multiplier (half price). */
  offPeakRatio: 0.5,
  /**
   * `time` prices each call by when it happened: peak windows in Beijing time,
   * off-peak (ratio × peak) everywhere else. `peak` prices everything at peak
   * rates for a worst-case bill with no clock logic.
   */
  tariff: 'time',
  /** Chinese public holidays as `YYYY-MM-DD`; only used by `tariff: time`. */
  holidays: [],
  /**
   * Tier used when no rule matches a model id. `null` leaves the call
   * unpriced, which the UI shows explicitly instead of inventing a number.
   */
  defaultTier: 'flash',
  /** Tier table: peak CNY per 1M tokens, split into the three billed buckets. */
  tiers: {
    flash: {
      label: 'DeepSeek-V4.1-Flash',
      cacheHit: 0.04,
      cacheMiss: 2,
      output: 8,
    },
    pro: {
      label: 'DeepSeek-V4-Pro',
      cacheHit: 0.3,
      cacheMiss: 9,
      output: 27,
    },
  },
  /** Ordered, case-insensitive model-id rules; the first match wins. */
  rules: [
    { contains: 'flash', tier: 'flash' },
    { contains: 'pro', tier: 'pro' },
  ],
};

/** Official peak windows in Beijing time: [startHour, endHour) pairs. */
export const PEAK_WINDOWS = [[9, 12], [14, 18]];

/** One formatter, reused across the fold. */
const BEIJING = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  weekday: 'short',
});

/**
 * Beijing-time calendar facts for one instant.
 *
 * @param time - epoch milliseconds.
 * @returns `{ date, weekday, minutes }`.
 */
export function beijingParts(time) {
  const parts = {};
  for (const part of BEIJING.formatToParts(new Date(time))) parts[part.type] = part.value;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/**
 * Which tariff one call falls under. `peak` mode answers `peak` for everything.
 *
 * @param time - the call's epoch milliseconds.
 * @param config - an effective config from {@link resolveConfig}.
 * @returns `peak` or `offPeak`.
 */
export function billingPeriod(time, config) {
  if (config.tariff !== 'time') return 'peak';
  if (!Number.isFinite(time)) return 'peak';
  const { date, weekday, minutes } = beijingParts(time);
  if (config.holidays.includes(date)) return 'offPeak';
  if (weekday === 'Sat' || weekday === 'Sun') return 'offPeak';
  for (const [start, end] of PEAK_WINDOWS) {
    if (minutes >= start * 60 && minutes < end * 60) return 'peak';
  }
  return 'offPeak';
}

/** The off-peak rates derived from one tier's peak rates. */
export function offPeakPrices(prices, ratio) {
  return {
    label: prices.label,
    cacheHit: prices.cacheHit * ratio,
    cacheMiss: prices.cacheMiss * ratio,
    output: prices.output * ratio,
  };
}

/** Read a finite non-negative number, or undefined. */
function rate(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/**
 * Deep-merge a user config over the defaults, normalizing every rate.
 * Unknown tier names in `rules` are dropped rather than silently zero-priced.
 *
 * @param input - raw plugin config from the profile patch, if any.
 * @returns the effective config; never mutates the input.
 */
export function resolveConfig(input) {
  const raw = input !== null && typeof input === 'object' ? input : {};
  const tiers = {};
  const sourceTiers = {
    ...DEFAULT_CONFIG.tiers,
    ...(raw.tiers !== null && typeof raw.tiers === 'object' ? raw.tiers : {}),
  };
  for (const [id, tier] of Object.entries(sourceTiers)) {
    if (tier === null || typeof tier !== 'object') continue;
    tiers[id] = {
      label: typeof tier.label === 'string' && tier.label.length > 0 ? tier.label : id,
      cacheHit: rate(tier.cacheHit) ?? DEFAULT_CONFIG.tiers.flash.cacheHit,
      cacheMiss: rate(tier.cacheMiss) ?? DEFAULT_CONFIG.tiers.flash.cacheMiss,
      output: rate(tier.output) ?? DEFAULT_CONFIG.tiers.flash.output,
    };
  }
  const rules = [];
  const sourceRules = Array.isArray(raw.rules) ? raw.rules : DEFAULT_CONFIG.rules;
  for (const rule of sourceRules) {
    if (rule === null || typeof rule !== 'object') continue;
    if (typeof rule.tier !== 'string' || tiers[rule.tier] === undefined) continue;
    if (typeof rule.contains === 'string' && rule.contains.length > 0) {
      rules.push({ contains: rule.contains.toLowerCase(), tier: rule.tier });
      continue;
    }
    if (typeof rule.regex === 'string' && rule.regex.length > 0) {
      try {
        rules.push({ regex: new RegExp(rule.regex, 'i'), tier: rule.tier });
      } catch {
        // A malformed user regex must not take the whole plugin down.
      }
    }
  }
  const defaultTier = typeof raw.defaultTier === 'string' && tiers[raw.defaultTier] !== undefined
    ? raw.defaultTier
    : raw.defaultTier === null
      ? null
      : DEFAULT_CONFIG.defaultTier;
  const holidays = Array.isArray(raw.holidays)
    ? raw.holidays.filter((day) => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(day))
    : [];
  return {
    tariff: raw.tariff === 'peak' ? 'peak' : 'time',
    holidays,
    currency: typeof raw.currency === 'string' && raw.currency.length > 0 ? raw.currency : DEFAULT_CONFIG.currency,
    symbol: typeof raw.symbol === 'string' && raw.symbol.length > 0 ? raw.symbol : DEFAULT_CONFIG.symbol,
    offPeakRatio: rate(raw.offPeakRatio) ?? DEFAULT_CONFIG.offPeakRatio,
    defaultTier,
    tiers,
    rules,
  };
}

/**
 * Resolve the billing tier of one model id.
 *
 * @param model - the model id reported by the adapter, e.g. `DeepSeek-V4-Pro-0813`.
 * @param config - an effective config from {@link resolveConfig}.
 * @returns the matched tier and whether it came from the fallback, or `null` tier when unpriced.
 */
export function resolveTier(model, config) {
  const id = typeof model === 'string' ? model : '';
  for (const rule of config.rules) {
    if (rule.contains !== undefined ? id.toLowerCase().includes(rule.contains) : rule.regex.test(id)) {
      return { tier: rule.tier, prices: config.tiers[rule.tier], assumed: false };
    }
  }
  if (config.defaultTier === null) return { tier: null, prices: null, assumed: true };
  return { tier: config.defaultTier, prices: config.tiers[config.defaultTier], assumed: true };
}

/**
 * Price one billed attempt.
 *
 * `cacheWriteTokens` are prompt tokens the provider had to write into its
 * cache; DeepSeek bills them at the cache-miss input rate, so they join
 * `inputTokens` here.
 *
 * @param buckets - provider-reported token counts.
 * @param prices - the tier's peak rates, CNY per 1M tokens.
 * @returns cost in CNY.
 */
export function costOf(buckets, prices) {
  if (prices === null) return 0;
  const input = (buckets.inputTokens + buckets.cacheWriteTokens) * prices.cacheMiss;
  const cacheRead = buckets.cacheReadTokens * prices.cacheHit;
  const output = buckets.outputTokens * prices.output;
  return (input + cacheRead + output) / 1_000_000;
}

/**
 * Money the prompt cache saved against cache-miss pricing.
 *
 * @param buckets - provider-reported token counts.
 * @param prices - the tier's peak rates, CNY per 1M tokens.
 * @returns saved CNY, never negative.
 */
export function cacheSavingsOf(buckets, prices) {
  if (prices === null) return 0;
  const delta = prices.cacheMiss - prices.cacheHit;
  return (buckets.cacheReadTokens * Math.max(0, delta)) / 1_000_000;
}
