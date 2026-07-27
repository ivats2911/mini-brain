/**
 * Generate README screenshots by driving the running dev server with the
 * installed Chrome via puppeteer-core. Seeds realistic sample data into
 * IndexedDB, then captures each view. Run with the dev server up:
 *
 *   npm run dev            # in one terminal
 *   node scripts/screenshots.mjs
 */
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const APP_URL = 'http://localhost:5173';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const hourly = (i) => Date.now() - i * 3.2 * 3600_000;
const SAMPLE = [
  ['benchmark the RAG latency on the new embedding model', 'ai-engineering', 'typed'],
  ['spike a LoRA fine-tune this weekend, time-box it to 30 min', 'ai-engineering', 'voice'],
  ['MCP server idea: wrap the vidIQ tools so the agent can score titles', 'ai-engineering', 'typed'],
  ['trionda unboxing short — strong hook in the first second', 'youtube', 'voice'],
  ['bambu filament swap timelapse, loop it under the intro', 'youtube', 'typed'],
  ['thumbnail A/B test for the football series', 'youtube', 'remote'],
  ['new qikink t-shirt niche: retro F1 liveries', 'pod', 'typed'],
  ['ideogram mockups for the trionda design before listing', 'pod', 'voice'],
  ['follow up with the recruiter about the referral', 'job-search', 'remote'],
  ['polish the portfolio case study on the mini brain', 'job-search', 'typed'],
  ['gym before the F1 race on sunday', 'personal', 'voice'],
  ['finish the book i started last month', 'personal', 'typed'],
  ['buy a new tripod for the overhead shots', 'inbox', 'remote'],
  ['idea: a voice-only journaling mode for late nights', 'inbox', 'typed'],
];

const seedScript = (rows) => `
  (async () => {
    localStorage.setItem('mini-brain:name', 'Sahil');
    localStorage.setItem('mini-brain:last-welcome', new Date().toISOString().slice(0,10));
    const open = indexedDB.open('mini-brain');
    const db = await new Promise((res, rej) => { open.onsuccess = () => res(open.result); open.onerror = () => rej(open.error); });
    const tx = db.transaction('thoughts', 'readwrite');
    const store = tx.objectStore('thoughts');
    store.clear();
    for (const r of ${JSON.stringify(rows)}) store.add(r);
    await new Promise(res => { tx.oncomplete = res; });
    db.close();
    return true;
  })()
`;

const rows = SAMPLE.map(([text, categoryId, source], i) => ({
  id: `demo-${i}`,
  text,
  categoryId,
  categorySource: 'auto',
  createdAt: hourly(SAMPLE.length - i),
  source,
}));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickByText(page, text) {
  await page.evaluate((t) => {
    const btn = [...document.querySelectorAll('header button')].find((b) => b.textContent.includes(t));
    btn?.click();
  }, text);
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--force-color-profile=srgb', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1240, height: 820, deviceScaleFactor: 1.5 });

  // Boot once so Dexie creates the DB + seeds rules, then seed thoughts + reload.
  await page.goto(APP_URL, { waitUntil: 'networkidle2' });
  await sleep(800);
  await page.evaluate(seedScript(rows));
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(1800);

  const shot = async (name, delay = 0) => {
    if (delay) await sleep(delay);
    // JPEG keeps the film-grain overlay from bloating file size (PNG stores it
    // near-losslessly, ~3 MB/frame); q86 stays crisp for README use.
    await page.screenshot({ path: `${OUT}${name}.jpg`, type: 'jpeg', quality: 86 });
    console.log(`  ✓ ${name}.jpg`);
  };

  // Brain (default view) — let bubbles drift + whispers appear
  await shot('brain', 1200);

  // Map — let the centering pull gather the constellation, then fit it.
  await clickByText(page, 'Map');
  await sleep(2800);
  await page.evaluate(() => {
    const g = window.__mbGraph;
    if (g) g.zoomToFit(0, 110);
  });
  await shot('map', 350);

  // Feed
  await clickByText(page, 'Feed');
  await shot('feed', 900);

  // Rules
  await clickByText(page, 'Rules');
  await shot('rules', 700);

  // Onboarding — fresh user, keep the sample brain behind it
  await page.evaluate(() => localStorage.removeItem('mini-brain:name'));
  await page.reload({ waitUntil: 'networkidle2' });
  await shot('onboarding', 1400);

  await browser.close();
  console.log('done →', OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
