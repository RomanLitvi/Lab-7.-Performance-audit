// Usage: node measure.mjs --label baseline [--runs 3] [--trace] [--only load,search,...]
// Expects `npm run preview` on http://localhost:4173.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import puppeteer from 'puppeteer-core';
import { CONDITIONS } from './conditions.mjs';

const { values: args } = parseArgs({
  options: {
    label: { type: 'string', default: 'run' },
    runs: { type: 'string', default: '3' },
    trace: { type: 'boolean', default: false },
    only: { type: 'string', default: '' },
    url: { type: 'string', default: 'http://localhost:4173/' },
  },
});

const QUERY = 'математика';
// Every trace of a scenario lasts the same time, so before/after screenshots share one scale.
// The values match the length of the baseline traces.
const TRACE_MS = { load: 30_000, search: 16_700, favorite: 6_400, details: 8_100, sort: 5_500, scroll: 22_700 };
const TRACE_CATEGORIES = [
  '-*',
  'devtools.timeline',
  'v8.execute',
  'disabled-by-default-devtools.timeline',
  'disabled-by-default-devtools.timeline.frame',
  'disabled-by-default-devtools.timeline.stack',
  'disabled-by-default-devtools.v8-source-rundown',
  'disabled-by-default-devtools.v8-source-rundown-sources',
  'disabled-by-default-v8.cpu_profiler',
  'toplevel',
  'loading',
  'latencyInfo',
  'blink.user_timing',
];
const SCENARIOS = ['load', 'search', 'favorite', 'details', 'sort', 'scroll'];
const selected = args.only ? args.only.split(',') : SCENARIOS;
const outDir = path.resolve(import.meta.dirname, '../report/data', args.label);
const traceDir = path.resolve(import.meta.dirname, '../report/traces', args.label);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function observeInPage() {
  const perf = { events: [], loafs: [], lcp: 0, shifts: [] };
  window.__perf = perf;
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.interactionId) {
        perf.events.push({ id: e.interactionId, name: e.name, start: e.startTime, duration: e.duration });
      }
    }
  }).observe({ type: 'event', durationThreshold: 16, buffered: true });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      perf.loafs.push({
        start: e.startTime,
        duration: e.duration,
        blocking: e.blockingDuration,
        forcedLayout: e.scripts.reduce((sum, s) => sum + s.forcedStyleAndLayoutDuration, 0),
      });
    }
  }).observe({ type: 'long-animation-frame', buffered: true });
  new PerformanceObserver((list) => {
    const last = list.getEntries().at(-1);
    perf.lcp = last.startTime;
    perf.lcpElement = last.element?.tagName + (last.url ? ` ${last.url.split('/').pop()}` : '');
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (!e.hadRecentInput) perf.shifts.push({ start: e.startTime, value: e.value });
    }
  }).observe({ type: 'layout-shift', buffered: true });
}

function cls(shifts) {
  let max = 0;
  let session = 0;
  let first = 0;
  let prev = 0;
  for (const s of shifts) {
    if (session && (s.start - prev > 1000 || s.start - first > 5000)) session = 0;
    if (!session) first = s.start;
    session += s.value;
    prev = s.start;
    max = Math.max(max, session);
  }
  return max;
}

function windowStats(perf, from, to) {
  const inWindow = (x) => x.start >= from && x.start <= to;
  const interactions = new Map();
  for (const e of perf.events.filter(inWindow)) {
    interactions.set(e.id, Math.max(interactions.get(e.id) ?? 0, e.duration));
  }
  const durations = [...interactions.values()];
  const loafs = perf.loafs.filter(inWindow);
  return {
    inp: durations.length ? Math.max(...durations) : 0,
    typicalInteraction: durations.length ? median(durations) : 0,
    interactions: durations.length,
    loafBlocking: loafs.reduce((s, l) => s + l.blocking, 0),
    loafCount: loafs.filter((l) => l.duration > 50).length,
    longestFrame: loafs.reduce((m, l) => Math.max(m, l.duration), 0),
    forcedLayout: loafs.reduce((s, l) => s + l.forcedLayout, 0),
  };
}

const now = (page) => page.evaluate(() => performance.now());

const actions = {
  async search(page) {
    await page.click('input[type="search"]');
    for (const text of QUERY) {
      await page.keyboard.down('KeyA', { text });
      await page.keyboard.up('KeyA');
      await sleep(150);
    }
    await sleep(1500);
  },
  async favorite(page) {
    for (const i of [0, 1, 2]) {
      const buttons = await page.$$('.tutor-card__fav');
      await buttons[i].click();
      await sleep(700);
    }
  },
  async details(page) {
    const buttons = await page.$$('.tutor-card__footer .button');
    await buttons[3].click();
    await sleep(1000);
    await page.keyboard.press('Escape');
    await sleep(1000);
  },
  async sort(page) {
    await page.focus('.search-bar__sort select');
    await page.keyboard.press('ArrowDown');
    await sleep(1200);
    await page.keyboard.press('ArrowUp');
    await sleep(1200);
  },
  async scroll(page) {
    await page.mouse.move(900, 600);
    for (let i = 0; i < 30; i++) {
      await page.mouse.wheel({ deltaY: 400 });
      await sleep(100);
    }
    await sleep(1000);
  },
};

const reset = {
  async search(page) {
    for (let i = 0; i < QUERY.length; i++) await page.keyboard.press('Backspace');
    await sleep(1500);
  },
  async scroll(page) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(500);
  },
};

async function runOnce(browser, { trace }) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport(CONDITIONS.viewport);
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: CONDITIONS.network.rttMs,
    downloadThroughput: (CONDITIONS.network.downMbps * 1e6) / 8,
    uploadThroughput: (CONDITIONS.network.upMbps * 1e6) / 8,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CONDITIONS.cpuSlowdown });
  let bytes = 0;
  let requests = 0;
  cdp.on('Network.loadingFinished', (e) => {
    bytes += e.encodedDataLength;
    requests += 1;
  });
  await page.evaluateOnNewDocument(observeInPage);

  const result = {};
  const traceTo = (name) => trace && path.join(traceDir, `${name}.json`);
  let traceStarted = 0;
  const startTrace = async (name, options = {}) => {
    if (!traceTo(name)) return;
    await page.tracing.start({ path: traceTo(name), categories: TRACE_CATEGORIES, ...options });
    traceStarted = Date.now();
  };
  const stopTrace = async (name) => {
    if (!traceTo(name)) return;
    await sleep(Math.max(0, TRACE_MS[name] - (Date.now() - traceStarted)));
    await page.tracing.stop();
  };

  const traceLoad = selected.includes('load');
  if (traceLoad) await startTrace('load', { screenshots: true });
  await page.goto(args.url, { waitUntil: 'load', timeout: 300_000 });
  await page.waitForSelector('.tutor-card', { timeout: 300_000 });
  await page.waitForNetworkIdle({ idleTime: 1000, timeout: 300_000 });
  const loadEnd = await now(page);
  await sleep(2000);
  if (traceLoad) await stopTrace('load');
  const perf = await page.evaluate(() => window.__perf);
  result.load = {
    lcp: perf.lcp,
    lcpElement: perf.lcpElement,
    cls: cls(perf.shifts),
    transferKB: bytes / 1024,
    requests,
    loadEvent: loadEnd,
    ...windowStats(perf, 0, loadEnd + 2000),
    domNodes: await page.evaluate(() => document.getElementsByTagName('*').length),
  };

  for (const name of selected.filter((s) => s !== 'load')) {
    await startTrace(name);
    const from = await now(page);
    await actions[name](page);
    const to = await now(page);
    await stopTrace(name);
    result[name] = windowStats(await page.evaluate(() => window.__perf), from, to);
    await reset[name]?.(page);
  }
  await context.close();
  return result;
}

const browser = await puppeteer.launch({
  executablePath: CONDITIONS.chrome,
  headless: true,
  args: ['--no-first-run', '--no-default-browser-check'],
});
const version = await browser.version();
await mkdir(outDir, { recursive: true });
if (args.trace) await mkdir(traceDir, { recursive: true });

const runs = [];
for (let i = 0; i < Number(args.runs); i++) {
  runs.push(await runOnce(browser, { trace: false }));
  process.stderr.write(`run ${i + 1} done\n`);
}
if (args.trace) {
  await runOnce(browser, { trace: true });
  process.stderr.write('trace run done\n');
}
await browser.close();

if (!runs.length) process.exit(0);
const summary = {};
for (const scenario of Object.keys(runs[0])) {
  summary[scenario] = {};
  for (const [metric, value] of Object.entries(runs[0][scenario])) {
    summary[scenario][metric] =
      typeof value === 'number' ? median(runs.map((r) => r[scenario][metric])) : value;
  }
}
const meta = { label: args.label, date: new Date().toISOString(), conditions: CONDITIONS, version };
await writeFile(path.join(outDir, 'runs.json'), JSON.stringify({ meta, runs, summary }, null, 2));

const fmt = (v) => (typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(v < 1 ? 3 : 0)) : v);
for (const [scenario, metrics] of Object.entries(summary)) {
  console.log(
    scenario.padEnd(9),
    Object.entries(metrics)
      .map(([k, v]) => `${k}=${fmt(v)}`)
      .join('  ')
  );
}
