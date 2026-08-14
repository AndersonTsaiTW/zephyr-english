#!/usr/bin/env node
// Drives the real site in a real browser: reads an article end to end, then
// checks the theme toggle and the share card.
//
//   npm i -g playwright && node scripts/smoke.mjs
//
// Syntax checks and grep cannot see a layout that collapses or an overlay that
// never lifts, which is what this exists to catch.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(root, 'site');
const PORT = 8231;
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
    return import(pathToFileURL(join(globalRoot, 'playwright', 'index.mjs')).href);
  }
}

const { chromium } = await loadPlaywright();

const server = createServer(async (req, res) => {
  const requested = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const path = requested === '/' ? '/index.html' : requested;
  try {
    const body = await readFile(join(SITE, path));
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] ?? 'text/plain' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('404');
  }
});
await new Promise((resolve) => server.listen(PORT, resolve));

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome' });

// Service workers are blocked throughout. With one running it answers from
// its own cache, which bypasses the request mocking these checks rely on and
// silently tests yesterday's files instead of today's. The worker is checked
// separately, by confirming it is served and parses.
const newPage = async (options = {}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 780 },
    serviceWorkers: 'block',
    ...options,
  });
  return context.newPage();
};

const page = await newPage();

// A missing article for today is the designed fallback, and there is no
// favicon yet. Neither counts as a defect.
const benign = /favicon\.ico|content\/articles\/\d{4}-\d{2}-\d{2}\.json/;
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('response', (r) => {
  if (r.status() >= 400 && !benign.test(r.url())) errors.push(`${r.status()} ${r.url()}`);
});

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
const activeScreen = () => page.locator('.screen.active').getAttribute('id');

check('today card is the active screen', (await activeScreen()) === 'screen-today');
check('article title rendered', (await page.locator('#cardTitle').textContent()).length > 3);
check('preview words rendered', (await page.locator('.preview-word').count()) > 0);
check('start button visible', await page.locator('#startBtn').isVisible());

await page.locator('#startBtn').click();
check('reader is the active screen', (await activeScreen()) === 'screen-reader');
check('countdown shows while counting', await page.locator('#countdown').isVisible());

await page.waitForTimeout(3400);
check('countdown lifts once it finishes', !(await page.locator('#countdown').isVisible()));

// The reader must be shorter than its text or there is nothing to scroll.
const room = await page.evaluate(
  () => document.querySelector('#track').scrollHeight - document.querySelector('#reader').clientHeight
);
check('there is something to scroll through', room > 100, `${room}px of travel`);
check('first paragraph is visible', await page.locator('#track p').first().isVisible());

// The run-out has to be a whole screen tall, or the last line stops partway
// down the panel and the read ends with text still on display.
const runOut = await page.evaluate(() => {
  const track = document.querySelector('#track');
  const reader = document.querySelector('#reader');
  return {
    pad: parseFloat(getComputedStyle(track).paddingBottom),
    panel: reader.clientHeight,
  };
});
check(
  'the text scrolls clear of the top before it ends',
  runOut.pad >= runOut.panel - 1,
  `run-out ${Math.round(runOut.pad)}px for a ${runOut.panel}px panel`
);

// Words per minute must describe the text, not the text plus its padding.
// Timed from the first line reaching the reading band to the last line
// leaving it, which is the stretch where words actually arrive. The whole
// animation runs a little longer, because the last line still has to rise off
// the top, and no new words arrive during that tail.
const pace = await page.evaluate(() => {
  const track = document.querySelector('#track');
  const style = getComputedStyle(track);
  const pads = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  const content = track.scrollHeight - pads;
  return {
    reading: content / pxPerSec(),
    total: maxY() / pxPerSec(),
    expected: (state.words / state.wpm) * 60,
  };
});
check(
  'words cross at the stated speed',
  Math.abs(pace.reading - pace.expected) / pace.expected < 0.02,
  `${pace.reading.toFixed(1)}s against ${pace.expected.toFixed(1)}s`
);
check(
  'the tail after the last word is short',
  pace.total > pace.reading && (pace.total - pace.reading) / pace.expected < 0.3,
  `${(pace.total - pace.reading).toFixed(1)}s of run-out`
);

const before = await page.evaluate('state.y');
await page.waitForTimeout(900);
const after = await page.evaluate('state.y');
check('scroll advances over time', after > before, `${Math.round(before)} to ${Math.round(after)}px`);
check('progress bar tracks the scroll', parseFloat(await page.locator('#bar').evaluate((el) => el.style.width)) > 0);

await page.locator('#reader').click();
const paused = await page.evaluate('state.y');
await page.waitForTimeout(600);
check('tapping pauses', (await page.evaluate('state.y')) === paused);
await page.locator('#reader').click();

await page.evaluate('state.y = 1e9');
await page.waitForTimeout(400);

// The quiz only appears when the article carries questions.
const questions = await page.evaluate('(state.article.quiz || []).length');
if (questions > 0) {
  check('quiz follows the read', (await activeScreen()) === 'screen-quiz');
  check('counter shows the position', /^\d+ \/ \d+$/.test(await page.locator('#quizCounter').textContent()));

  // The answer key must not be reachable from the markup.
  const leak = await page.evaluate(() => {
    const html = document.querySelector('#quizOptions').innerHTML;
    return /answer|correct|data-/i.test(html);
  });
  check('answer key is absent from the DOM', !leak);

  for (let i = 0; i < questions; i += 1) {
    await page.locator('#quizOptions .option').first().click();
    await page.waitForTimeout(900);
  }
}

check('results screen appears', (await activeScreen()) === 'screen-results');
check('speed is shown', Number(await page.locator('#heroWpm').textContent()) > 0);
check('attribution is shown', (await page.locator('#attribution').textContent()).length > 5);
check(
  'score is reported',
  questions === 0 || /\d+ of \d+ correct/.test(await page.locator('#resultScore').textContent()),
  await page.locator('#resultScore').textContent()
);

// WP4: the day is recorded, and reopening shows the result rather than the article.
const stored = await page.evaluate("JSON.parse(localStorage.getItem('zephyr.history') || '[]')");
check('the day is written to history', stored.length === 1, JSON.stringify(stored[0] ?? null));
check('tomorrow speed is set', stored[0]?.nextWpm >= 80 && stored[0]?.nextWpm <= 300, `${stored[0]?.nextWpm} wpm`);
check('streak started at 1', stored[0]?.streak === 1);

await page.reload({ waitUntil: 'networkidle' });
check('same day reopen shows the result', (await activeScreen()) === 'screen-results');

const native = await page.locator('#shareBtn').isVisible();
const fallback = await page.locator('#shareFallback').isVisible();
check('exactly one share path is offered', native !== fallback, `native=${native} fallback=${fallback}`);
const shareText = await page.evaluate('buildShareText()');
check(
  'share text is well formed',
  /^ZEPHYR · .+\n\d+ wpm(?: · \d+\/\d+ correct)?(?: · streak \d+)?\nhttps?:\/\//.test(shareText),
  JSON.stringify(shareText)
);

await page.locator('#themeBtn').click();
const pinned = await page.evaluate('document.documentElement.dataset.theme');
check('theme toggle pins a theme', pinned === 'light' || pinned === 'dark', pinned);
check('theme choice persists', (await page.evaluate("localStorage.getItem('zephyr.theme')")) === pinned);
await page.reload({ waitUntil: 'networkidle' });
check('pinned theme survives reload', (await page.evaluate('document.documentElement.dataset.theme')) === pinned);

// An article with no source block must not render, whatever else is right.
const guarded = await newPage();
await guarded.route('**/content/articles/*.json', (route) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ id: 'x', title: 'Unsourced', body: ['Text with no provenance.'] }),
  })
);
await guarded.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
check('an article without a source is refused', (await guarded.locator('.screen.active').getAttribute('id')) === 'screen-empty');
await guarded.close();

// PWA pieces are served and well formed.
const manifest = await page.evaluate(async () => {
  const res = await fetch('manifest.webmanifest');
  return res.ok ? res.json() : null;
});
check('manifest is valid and standalone', manifest?.display === 'standalone' && manifest.icons.length >= 2);
const swOk = await page.evaluate(async () => (await fetch('sw.js')).ok);
check('service worker is served', swOk);

// The reader must scroll at its real default speed for someone whose system
// asks for reduced motion. A previous version silently switched those readers
// to a paragraph-at-a-time mode that sat still for ten seconds at a stretch,
// which is indistinguishable from the app being broken.
const reduced = await newPage({ reducedMotion: 'reduce' });
await reduced.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
await reduced.evaluate("localStorage.clear()");
await reduced.reload({ waitUntil: 'networkidle' });
await reduced.locator('#startBtn').click();
await reduced.waitForTimeout(3400);
const rStart = await reduced.evaluate('state.y');
await reduced.waitForTimeout(4000);
const rEnd = await reduced.evaluate('state.y');
check(
  'reduced motion still scrolls at the default speed',
  rEnd - rStart > 30,
  `moved ${Math.round(rEnd - rStart)}px in 4s`
);

// The stepped alternative exists, but only when the reader asks for it.
check('stepped mode is off unless chosen', (await reduced.evaluate('state.stepMode')) === false);
await reduced.locator('#stepBtn').click();
check('stepped mode can be turned on', await reduced.evaluate('state.stepMode'));
const sStart = await reduced.evaluate('state.y');
await reduced.waitForTimeout(5000);
check(
  'stepped mode advances rather than freezing',
  (await reduced.evaluate('state.y')) > sStart,
  `moved ${Math.round((await reduced.evaluate('state.y')) - sStart)}px in 5s`
);
await reduced.close();


// Backup and restore. The point is that a streak survives a new phone
// without anyone having to create an account.
const backup = await newPage();
await backup.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
await backup.evaluate(() => {
  localStorage.setItem('zephyr.streak', JSON.stringify({ count: 9, lastDate: '2099-01-01' }));
  localStorage.setItem('zephyr.history', JSON.stringify([{ date: '2099-01-01', wpm: 150, streak: 9, day: 9 }]));
  localStorage.setItem('zephyr.profile', JSON.stringify({ currentWpm: 165 }));
});
const code = await backup.evaluate('exportProgress()');
check('a backup is produced', typeof code === 'string' && code.length > 20);

const restored = await backup.evaluate((text) => {
  localStorage.clear();
  const result = importProgress(text);
  return {
    ok: result.ok,
    streak: JSON.parse(localStorage.getItem('zephyr.streak') || 'null'),
    wpm: JSON.parse(localStorage.getItem('zephyr.profile') || 'null'),
  };
}, code);
check('wiped progress can be restored', restored.ok && restored.streak?.count === 9 && restored.wpm?.currentWpm === 165,
  `streak ${restored.streak?.count}, ${restored.wpm?.currentWpm} wpm`);

const junk = await backup.evaluate("importProgress('not a backup')");
check('nonsense input is refused', junk.ok === false, junk.message);
await backup.close();

// The share card is drawn in the browser, so it has to actually produce an
// image and lay out without one block landing on another.
const card = await page.evaluate(() => {
  const canvas = drawShareCard();
  return { w: canvas.width, h: canvas.height, data: canvas.toDataURL('image/png').length };
});
check('the share card renders', card.w === 1080 && card.h === 1240 && card.data > 5000, `${card.w}x${card.h}, ${card.data} chars`);

check(
  'milestones are exact, not ranges',
  await page.evaluate(() => streakHeadline(12) === 'DAYS IN A ROW' && streakHeadline(7) === 'A WEEK STRAIGHT'),
  await page.evaluate(() => [1, 7, 12, 14].map((n) => `${n}=${streakHeadline(n)}`).join(' '))
);

// A long title and a long topic together are the case that used to collide
// with the address at the foot of the card.
const fits = await page.evaluate(() => {
  state.article = {
    ...state.article,
    title: 'Spread the Word: First Nations Languages in BC',
    topic: 'Thirty-two languages, and the young people bringing them back.',
  };
  const canvas = drawShareCard();
  const ctx = canvas.getContext('2d');
  // Read the clear band between the end of the topic and the top of the
  // address. Ink here means one has run into the other. The card is drawn at
  // twice its layout size, so these are doubled coordinates.
  const strip = ctx.getImageData(0, 1096, canvas.width, 24).data;
  let lit = 0;
  for (let i = 0; i < strip.length; i += 4) {
    if (strip[i] > 40 || strip[i + 1] > 40 || strip[i + 2] > 40) lit++;
  }
  return lit;
});
check('nothing overlaps the address on the card', fits === 0, `${fits} lit pixels in the gap`);

await page.reload({ waitUntil: 'networkidle' });
await page.locator('#cardBtn').click();
await page.locator('#cardImage').evaluate(
  (img) => img.complete || new Promise((res) => { img.onload = res; })
);
const shown = await page.locator('#cardImage').boundingBox();
check('the card can be shown on the page', shown !== null && shown.height > 100, `${Math.round(shown?.width ?? 0)}x${Math.round(shown?.height ?? 0)}`);

// On a short screen the results screen grows taller than the space it has.
// Centred flex content overflows in both directions and the top half cannot
// be scrolled to, which hid the card completely on a real phone.
const short = await newPage({ viewport: { width: 390, height: 480 } });
await short.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
await short.evaluate(() => {
  state.lastResult = { date: '2026-01-01', wpm: 142, words: 275, score: 3, total: 3, streak: 4, day: 4 };
  show('results');
  renderResults(state.lastResult);
});
await short.locator('#cardBtn').click();
await short.locator('#cardImage').evaluate(
  (img) => (img.complete && img.naturalWidth ? true : new Promise((res) => { img.onload = res; }))
);
const reach = await short.evaluate(() => {
  const screen = document.getElementById('screen-results');
  screen.scrollTop = screen.scrollHeight;
  const box = document.getElementById('cardImage').getBoundingClientRect();
  return { top: Math.round(box.top), bottom: Math.round(box.bottom), vh: innerHeight };
});
check(
  'the card is reachable on a short screen',
  reach.top >= -1 && reach.bottom <= reach.vh + 1,
  `${reach.top}..${reach.bottom} of ${reach.vh}`
);
await short.close();

check('no unexpected page errors', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
