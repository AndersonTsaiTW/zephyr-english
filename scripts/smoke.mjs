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
const page = await browser.newPage({ viewport: { width: 390, height: 780 } });

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
check('done screen appears at the end', (await activeScreen()) === 'screen-done');
check('stats are filled in', /\d+ words · \d+s · \d+ wpm/.test(await page.locator('#doneStats').textContent()));
check('attribution is shown', (await page.locator('#attribution').textContent()).length > 5);

const native = await page.locator('#shareBtn').isVisible();
const fallback = await page.locator('#shareFallback').isVisible();
check('exactly one share path is offered', native !== fallback, `native=${native} fallback=${fallback}`);
check('share text is well formed', /^ZEPHYR · .+\n\d+ wpm\nhttp/.test(await page.evaluate('buildShareText()')));

await page.locator('#themeBtn').click();
const pinned = await page.evaluate('document.documentElement.dataset.theme');
check('theme toggle pins a theme', pinned === 'light' || pinned === 'dark', pinned);
check('theme choice persists', (await page.evaluate("localStorage.getItem('zephyr.theme')")) === pinned);
await page.reload({ waitUntil: 'networkidle' });
check('pinned theme survives reload', (await page.evaluate('document.documentElement.dataset.theme')) === pinned);

check('no unexpected page errors', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
