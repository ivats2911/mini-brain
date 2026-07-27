/**
 * Build a LinkedIn carousel from the app screenshots: branded 4:5 portrait
 * slides (a cover, one per feature, and a CTA) rendered with the installed
 * Chrome via puppeteer-core. Outputs individual JPGs (upload as a native
 * image carousel) and a combined PDF (upload as a LinkedIn document post —
 * either renders as a swipeable carousel).
 *
 *   node scripts/carousel.mjs
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SHOTS = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));
const OUT = fileURLToPath(new URL('../docs/carousel/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const W = 1080;
const H = 1350;

const dataUri = (file) => `data:image/jpeg;base64,${readFileSync(SHOTS + file).toString('base64')}`;

// Cover + feature + CTA slides. `img` null → text-only slide.
const slides = [
  {
    kind: 'cover',
    eyebrow: 'OPEN-SOURCE · LOCAL-FIRST',
    title: 'Mini Brain',
    sub: 'A second brain you can <b>talk to</b>. Type or speak a thought — it sorts it, connects it, and talks back.',
    foot: 'Swipe →',
  },
  { kind: 'feat', n: '01', tag: 'CAPTURE', img: 'brain.jpg', title: 'Your thoughts, floating', cap: 'Dump a thought by voice or text. It flies into a glowing bubble, sized by how much lives inside.' },
  { kind: 'feat', n: '02', tag: 'CONNECT', img: 'map.jpg', title: 'Every thought, a synapse', cap: 'An interactive graph links thoughts by category, shared words, #tags and [[wikilinks]].' },
  { kind: 'feat', n: '03', tag: 'FIND', img: 'feed.jpg', title: 'Search, filter, tidy', cap: 'A clean feed with live category filters, instant search, and a badge for how each thought arrived.' },
  { kind: 'feat', n: '04', tag: 'TUNE', img: 'rules.jpg', title: 'Tune the brain', cap: 'A typed, unit-tested keyword engine sorts everything offline. Adjust the rules — and the voice — live.' },
  { kind: 'feat', n: '05', tag: 'PERSONAL', img: 'onboarding.jpg', title: 'It knows your name', cap: 'It greets you by name, welcomes you once a day, and nudges each thought with an actual next step.' },
  {
    kind: 'cta',
    eyebrow: 'REACT · TYPESCRIPT · TAILWIND · DEXIE · 77 TESTS',
    title: 'Make it yours',
    sub: 'Fully open-source. Clone it, talk to it, improve it — a few <b>good first issues</b> are waiting inside.',
    foot: 'github.com/ivats2911/mini-brain',
  },
];

const slideHtml = (s) => {
  if (s.kind === 'cover' || s.kind === 'cta') {
    return `<section class="slide center">
      <div class="eyebrow">${s.eyebrow}</div>
      <div class="mark">🧠</div>
      <h1 class="big">${s.title}</h1>
      <p class="sub">${s.sub}</p>
      <div class="foot ${s.kind === 'cta' ? 'link' : ''}">${s.foot}</div>
    </section>`;
  }
  return `<section class="slide feat">
    <div class="head">
      <span class="num">${s.n}</span><span class="tag">${s.tag}</span>
    </div>
    <h2 class="title">${s.title}</h2>
    <p class="cap">${s.cap}</p>
    <div class="frame"><img src="${dataUri(s.img)}" alt=""></div>
    <div class="brand">🧠 Mini Brain</div>
  </section>`;
};

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: ${W}px ${H}px; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: #0a0a0f; }
  body { font-family: "Segoe UI", system-ui, -apple-system, sans-serif; -webkit-font-smoothing: antialiased; }
  .slide {
    width: ${W}px; height: ${H}px; position: relative; overflow: hidden;
    background:
      radial-gradient(circle at 22% 18%, rgba(56,189,248,0.12), transparent 45%),
      radial-gradient(circle at 82% 88%, rgba(168,85,247,0.12), transparent 46%),
      radial-gradient(ellipse 120% 80% at 50% -10%, #12121c, #0a0a0f 62%);
    color: #ececf1; padding: 84px 72px; break-after: page;
  }
  .slide:last-child { break-after: auto; }

  .center { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
  .eyebrow { font-size: 22px; letter-spacing: 3px; color: #7dd3fc; font-weight: 600; margin-bottom: 40px; }
  .mark { font-size: 120px; line-height: 1; margin-bottom: 28px; filter: drop-shadow(0 8px 30px rgba(168,85,247,0.35)); }
  .big { font-size: 96px; font-weight: 800; letter-spacing: -2px;
    background: linear-gradient(120deg,#67e8f9,#a78bfa 60%,#f0abfc); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .sub { font-size: 38px; line-height: 1.4; color: #c5c8d4; max-width: 820px; margin-top: 34px; }
  .sub b { color: #fff; font-weight: 700; }
  .foot { margin-top: 56px; font-size: 30px; color: #8b8fa3; font-weight: 600; letter-spacing: 1px; }
  .foot.link { color: #67e8f9; font-size: 34px; padding: 16px 32px; border: 1px solid rgba(103,232,249,0.3); border-radius: 999px; background: rgba(103,232,249,0.06); }

  .feat { display: flex; flex-direction: column; }
  .head { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
  .num { font-size: 26px; font-weight: 800; color: #a78bfa; }
  .tag { font-size: 22px; letter-spacing: 3px; color: #8b8fa3; font-weight: 600; padding: 6px 14px; border: 1px solid rgba(255,255,255,0.1); border-radius: 999px; }
  .title { font-size: 62px; font-weight: 800; letter-spacing: -1px; line-height: 1.05; }
  .cap { font-size: 32px; line-height: 1.4; color: #b8bcc9; margin-top: 22px; max-width: 900px; }
  .frame { margin-top: 44px; border-radius: 24px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1);
    box-shadow: 0 30px 80px -30px rgba(0,0,0,0.9), 0 0 60px -30px rgba(103,232,249,0.25); }
  .frame img { display: block; width: 100%; }
  .brand { position: absolute; left: 72px; bottom: 60px; font-size: 26px; color: #6b7080; font-weight: 600; }
</style></head><body>
  ${slides.map(slideHtml).join('\n')}
</body></html>`;

const main = async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--force-color-profile=srgb'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'networkidle0' });

  const els = await page.$$('.slide');
  for (let i = 0; i < els.length; i++) {
    const name = `${String(i + 1).padStart(2, '0')}.jpg`;
    await els[i].screenshot({ path: `${OUT}${name}`, type: 'jpeg', quality: 90 });
    console.log(`  ✓ ${name}`);
  }

  await page.pdf({
    path: `${OUT}mini-brain-carousel.pdf`,
    width: `${W}px`,
    height: `${H}px`,
    printBackground: true,
    preferCSSPageSize: true,
  });
  console.log('  ✓ mini-brain-carousel.pdf');

  await browser.close();
  console.log('done →', OUT);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
