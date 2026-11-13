// Opens saved traces in the DevTools Performance panel and screenshots them.
// Usage: node screenshot.mjs --label 00-baseline [--only scroll,sort] [--tab bottom-up]
// Run while `npm run preview` serves the same build, so DevTools can fetch its source maps.
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import puppeteer from 'puppeteer-core';
import { CONDITIONS } from './conditions.mjs';

const { values: args } = parseArgs({
  options: {
    label: { type: 'string' },
    only: { type: 'string', default: 'load,search,favorite,details,sort,scroll' },
    tab: { type: 'string', default: '' },
    insight: { type: 'string', default: '' },
  },
});

const PORT = 9223;
const LOAD_BUTTON = { x: 108, y: 39 };
const SHORTCUTS_CLOSE = { x: 1572 };
const OVERVIEW = { left: 150, right: 1563, y: 72 };
const TABS = { 'bottom-up': 'Bottom-up', 'call-tree': 'Call tree' };

// DevTools renders into nested shadow roots, which CSS and text selectors do not cross.
function findVisibleText(text) {
  const stack = [document.documentElement];
  while (stack.length) {
    const el = stack.pop();
    if (el.shadowRoot) stack.push(...el.shadowRoot.children);
    stack.push(...el.children);
    const own = [...el.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent)
      .join('')
      .trim();
    if (own !== text) continue;
    const { x, y, width, height } = el.getBoundingClientRect();
    if (width > 0 && height > 0) return { x, y, width, height };
  }
  return null;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const traceDir = path.resolve(import.meta.dirname, '../report/traces', args.label);
const shotDir = path.resolve(import.meta.dirname, '../report/screenshots');
await mkdir(shotDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CONDITIONS.chrome,
  headless: true,
  args: ['--remote-allow-origins=*', `--remote-debugging-port=${PORT}`],
});

for (const scenario of args.only.split(',')) {
  const trace = path.join(traceDir, `${scenario}.json`);
  const { size } = await stat(trace);
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1.5 });
  await page.goto(`http://127.0.0.1:${PORT}/devtools/devtools_app.html?panel=timeline`);
  await sleep(4000);
  const [chooser] = await Promise.all([
    page.waitForFileChooser({ timeout: 10_000 }),
    page.mouse.click(LOAD_BUTTON.x, LOAD_BUTTON.y),
  ]);
  await chooser.accept([trace]);
  await sleep(8000 + (size / 1e6) * 150);
  const rectOf = (text) => page.evaluate(findVisibleText, text);
  const clickText = async (text) => {
    const rect = await rectOf(text);
    if (!rect) return false;
    await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await sleep(3000);
    return true;
  };
  const dialog = await rectOf('Keyboard shortcuts for flame chart');
  if (dialog) await page.mouse.click(SHORTCUTS_CLOSE.x, dialog.y + dialog.height / 2);
  // DevTools zooms to the busy part of a trace; select the whole overview so that
  // before/after traces of equal length are shown at the same scale.
  await page.mouse.move(OVERVIEW.right, OVERVIEW.y);
  await page.mouse.down();
  await page.mouse.move(OVERVIEW.left, OVERVIEW.y, { steps: 20 });
  await page.mouse.up();
  await sleep(2000);
  if (args.insight) await clickText(args.insight);
  if (args.tab) await clickText(TABS[args.tab]);
  const suffix = (args.tab ? `-${args.tab}` : '') + (args.insight ? `-${args.insight.replaceAll(' ', '-').toLowerCase()}` : '');
  await page.screenshot({ path: path.join(shotDir, `${args.label}-${scenario}${suffix}.png`) });
  await page.close();
  console.log('saved', `${args.label}-${scenario}${suffix}.png`);
}
await browser.close();
