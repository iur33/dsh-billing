/**
 * Smokes the browser bundle without a browser: module body, locale and slot
 * registration, the day/week/month/all math, then a real render of the pill
 * and its dialog. React is a small stub with a render loop, a fake DOM node for
 * refs, synchronous fetch thenables and state updates — enough to catch
 * structural mistakes, not a paint test.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8');

let current = null;
const React = {
  createElement(type, props, ...children) {
    const element = { type, props: props ?? {}, children: children.flat(Infinity) };
    const ref = props?.ref;
    if (ref !== undefined && ref !== null && typeof ref === 'object') {
      ref.current = {
        getBoundingClientRect: () => ({ left: 120, top: 700, right: 200, bottom: 720, width: 80, height: 20 }),
        contains: () => false,
      };
    }
    return element;
  },
  useState(init) {
    const cell = current;
    const index = cell.cursor++;
    if (!(index in cell.states)) cell.states[index] = typeof init === 'function' ? init() : init;
    return [cell.states[index], (value) => {
      cell.states[index] = typeof value === 'function' ? value(cell.states[index]) : value;
      cell.dirty = true;
    }];
  },
  useRef() {
    const cell = current;
    const index = cell.cursor++;
    if (!(index in cell.refs)) cell.refs[index] = { current: null };
    return cell.refs[index];
  },
  useEffect(fn) { current.effects.push(fn); },
  useCallback(fn) { return fn; },
  memo: (fn) => fn,
};
const ReactDOM = { createPortal: (node) => node };

/** Synchronous thenable so a fetch effect settles inside the same render. */
function thenable(value) {
  return {
    then(onFulfilled) {
      const result = onFulfilled(value);
      return result !== null && typeof result === 'object' && typeof result.then === 'function' ? result : thenable(result);
    },
    catch() { return this; },
    finally(onFinally) { onFinally(); return this; },
  };
}

const FLEET = {
  schema: 1,
  generatedAt: Date.parse('2026-10-30T21:48:00+08:00'),
  currency: 'CNY',
  symbol: '¥',
  machines: [
    { id: 'mac', label: 'studio.local' },
    { id: 'win', label: 'Windows-PC' },
  ],
  total: { cost: 35.78, calls: 1200 },
  days: {
    '2026-09-15': { cost: 7, calls: 40, machines: { mac: { cost: 7, calls: 40 } } },
    '2026-10-01': { cost: 5, calls: 60, machines: { mac: { cost: 5, calls: 60 } } },
    '2026-10-26': { cost: 0.31, calls: 12, machines: { mac: { cost: 0.31, calls: 12 } } },
    '2026-10-27': { cost: 0.02, calls: 2, machines: { mac: { cost: 0.02, calls: 2 } } },
    '2026-10-29': { cost: 1.66, calls: 80, machines: { mac: { cost: 1.66, calls: 80 } } },
    '2026-10-30': {
      cost: 21.79,
      calls: 1085,
      machines: { mac: { cost: 13.1, calls: 674 }, win: { cost: 8.69, calls: 411 } },
    },
  },
};

const styles = [];
const sandbox = {
  window: {},
  document: {
    querySelector: () => null,
    createElement: () => ({ dataset: {} }),
    head: { appendChild: (tag) => styles.push(tag) },
    addEventListener: () => {},
    removeEventListener: () => {},
    body: {},
  },
  fetch: (url) => thenable({ json: () => thenable(String(url).endsWith('/fleet') ? { ok: true, sync: true, fleet: FLEET } : { ok: true, fleet: FLEET }) }),
};
sandbox.window = sandbox;
sandbox.innerWidth = 1280;
sandbox.innerHeight = 800;
sandbox.addEventListener = () => {};
sandbox.removeEventListener = () => {};
sandbox.globalThis = sandbox;
sandbox.__ModuleLoader__ = { load: (definition) => { sandbox.definition = definition; } };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'client.js' });

/** Mount a component function once; `update()` re-renders against the same state. */
function mount(component, props) {
  const store = { states: [], refs: [] };
  const update = () => {
    let tree = null;
    for (let pass = 0; pass < 8; pass += 1) {
      const cell = { ...store, cursor: 0, effects: [], dirty: false };
      current = cell;
      tree = component(props);
      for (const effect of cell.effects) effect();
      store.states = cell.states;
      store.refs = cell.refs;
      if (!cell.dirty) break;
    }
    current = null;
    return tree;
  };
  return { tree: update(), update };
}

/** Evaluate function components the way React would (the stub has no hooks in them). */
function resolve(tree) {
  let node = tree;
  for (let guard = 0; guard < 20; guard += 1) {
    if (node === null || typeof node !== 'object' || Array.isArray(node)) return node;
    if (typeof node.type !== 'function') return node;
    node = node.type(node.props);
  }
  return node;
}

function text(tree) {
  const node = resolve(tree);
  if (node === null || node === undefined || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join(' ');
  return text(node.children);
}

function findAll(tree, predicate, out = []) {
  const node = resolve(tree);
  if (node === null || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, predicate, out);
    return out;
  }
  if (predicate(node)) out.push(node);
  for (const child of node.children ?? []) findAll(child, predicate, out);
  return out;
}

function find(tree, predicate) {
  return findAll(tree, predicate)[0] ?? null;
}

const definition = sandbox.definition;
assert.equal(definition.id, 'dsh-peak-billing');

const exports = definition.factory((specifier) => {
  if (specifier === 'react') return React;
  if (specifier === 'react-dom') return ReactDOM;
  throw new Error(`unexpected require: ${specifier}`);
});

assert.equal(Array.from(exports.inject).join(','), 'slots,locale');

let registered = null;
let dictionaries = null;
exports.apply({
  effect: (fn) => fn(),
  locale: { register: (ns, dicts) => { dictionaries = { ns, dicts }; return () => {}; } },
  slots: {
    inject: (name, cb) => cb(),
    register: (options, component) => { registered = { options, component }; return () => {}; },
  },
});
assert.equal(dictionaries.ns, 'dsh-peak-billing');
assert.equal(styles.length, 1);
assert.equal(registered.options.name, 'conversation.composer.dock');
assert.equal(registered.options.locale, 'dsh-peak-billing');
assert.equal(Object.keys(dictionaries.dicts.zh).length, Object.keys(dictionaries.dicts.en).length);

const t = (key, params) => {
  const template = dictionaries.dicts.zh[key] ?? key;
  return params === undefined ? template : template.replace(/\{(\w+)\}/g, (_, name) => String(params[name]));
};

// --- day / week / month / all arithmetic -------------------------------------
const now = new Date(2026, 9, 30, 12, 0, 0).getTime();
const day = exports.__sumPeriod(FLEET, 'today', now);
const week = exports.__sumPeriod(FLEET, 'week', now);
const month = exports.__sumPeriod(FLEET, 'month', now);
const all = exports.__sumPeriod(FLEET, 'all', now);
assert.equal(day.cost.toFixed(2), '21.79');
assert.equal(week.cost.toFixed(2), '23.78', 'Monday 10-26 starts the week');
assert.equal(month.cost.toFixed(2), '28.78', 'month starts at 10-01');
assert.equal(all.cost.toFixed(2), '35.78', 'all time includes September');
assert.equal(day.machines.length, 2);
assert.equal(day.machines[0].label, 'studio.local', 'machines sorted by cost');
assert.equal(day.calls, 1085);

// --- render ------------------------------------------------------------------
assert.equal(mount(registered.component, { useProjection: () => undefined, t }).tree, null);

const view = {
  currency: 'CNY', symbol: '¥', tariff: 'peak', calls: 202, totalCost: 4.5467,
  offPeakCost: 2.27335, cacheSavings: 49.4, unpricedCalls: 0,
  tokens: { input: 1090855, cacheRead: 25309440, cacheWrite: 0, output: 169080, total: 26569375 },
  models: [
    { provider: 'example', model: 'DeepSeek-V4.1-Flash-1017', tier: 'flash', label: 'DeepSeek-V4.1-Flash', assumed: false, calls: 202, cost: 4.5467, savings: 49.4, tokens: { input: 1090855, cacheRead: 25309440, cacheWrite: 0, output: 169080, total: 26569375 } },
  ],
  lastTurn: { turn: 3, calls: 12, cost: 0.41 },
};
const props = { useProjection: () => view, t };
const mounted = mount(registered.component, props);
const pill = find(mounted.tree, (node) => node.type === 'button');
assert.ok(pill !== null, 'pill is a button');
assert.ok(text(mounted.tree).includes('¥4.55'), 'pill shows the formatted total');

pill.props.onClick();
const open = mounted.update();
const panel = find(open, (node) => node.props?.['data-peak-billing-panel'] === true);
assert.ok(panel !== null, 'click opens the dialog');
const panelText = text(panel);
assert.ok(panelText.includes('¥4.55'), 'dialog repeats the total');
assert.ok(panelText.includes('25.31M'), 'cache-read tokens are compacted');
assert.ok(panelText.includes('¥49.40'), 'cache savings are priced');
assert.ok(panelText.includes('¥2.27'), 'off-peak comparison is shown');
assert.ok(panelText.includes('DeepSeek-V4.1-Flash'), 'per-model row is shown');
assert.ok(panelText.includes('¥0.41'), 'this-turn cost is shown');

// The fleet block fetched on open, and starts on "today".
assert.ok(panelText.includes('全部机器'), 'fleet block is rendered');
assert.ok(panelText.includes('¥21.79'), 'fleet starts on today');
assert.ok(panelText.includes('1085 次调用'), 'fleet call count is shown');
assert.ok(panelText.includes('Windows-PC'), 'second machine is listed');

// Switching to week/month/all re-sums the same document.
const tab = (label) => find(open, (node) => node.type === 'button' && node.children[0] === label);
const weekTab = tab('本周');
assert.ok(weekTab !== null, 'week tab exists');
assert.equal(weekTab.props['aria-pressed'], 'false');
weekTab.props.onClick();
const weekly = mounted.update();
assert.ok(text(weekly).includes('¥23.78'), 'week total replaces today');
const monthTab = find(weekly, (node) => node.type === 'button' && node.children[0] === '本月');
monthTab.props.onClick();
assert.ok(text(mounted.update()).includes('¥28.78'), 'month total');
const allTab = find(mounted.update(), (node) => node.type === 'button' && node.children[0] === '总计');
allTab.props.onClick();
assert.ok(text(mounted.update()).includes('¥35.78'), 'all-time total');

const unpricedMount = mount(registered.component, {
  useProjection: () => ({ ...view, models: [{ ...view.models[0], tier: null, assumed: true, cost: 0 }] }),
  t,
});
find(unpricedMount.tree, (node) => node.type === 'button').props.onClick();
const unpricedPanel = find(unpricedMount.update(), (node) => node.props?.['data-peak-billing-panel'] === true);
assert.ok(text(unpricedPanel).includes('未匹配价格'), 'unpriced models say so');

console.log('ok — client bundle, locale, slot, periods, pill and dialog render passed');
