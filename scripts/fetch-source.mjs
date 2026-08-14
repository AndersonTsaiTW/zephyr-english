#!/usr/bin/env node
// Downloads a source page and saves its prose as plain text.
//
// This exists so that the text in content-raw/ is the publisher's own,
// character for character. Nothing here summarises, rewrites or "cleans up"
// a sentence. It walks the HTML, takes the paragraphs, turns the entities
// back into characters, and writes what it found.
//
// That matters more than it might look. content-raw/ is what
// check-article.mjs compares a published article against, so it is the only
// evidence that an article was shortened rather than reworded. If the raw
// copy ever went through something that could paraphrase, the check would
// still pass and would no longer mean anything.
//
// Usage:
//   node scripts/fetch-source.mjs <url> --out content-raw/2026-09-16.txt
//   node scripts/fetch-source.mjs <url>            (prints to stdout)
//
// Zero dependencies, Node ESM.

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const UA = 'Mozilla/5.0 (compatible; Zephyr curation; +https://zephyr-english.com/)';

function fail(message) {
  console.error(message);
  process.exit(1);
}

// --- HTML walking ------------------------------------------------------

// Finds the element that opens at `start` and returns the span of its
// contents. Regular expressions cannot match nested tags, and every one of
// these containers has divs inside it, so the depth is counted by hand.
function innerSpan(html, start, tag = 'div') {
  const open = new RegExp(`<${tag}\\b`, 'gi');
  const close = new RegExp(`</${tag}\\s*>`, 'gi');
  const contentStart = html.indexOf('>', start) + 1;
  let depth = 1;
  let cursor = contentStart;

  while (depth > 0) {
    open.lastIndex = cursor;
    close.lastIndex = cursor;
    const nextOpen = open.exec(html);
    const nextClose = close.exec(html);
    if (!nextClose) return { start: contentStart, end: html.length };
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth += 1;
      cursor = nextOpen.index + 1;
    } else {
      depth -= 1;
      cursor = nextClose.index + 1;
      if (depth === 0) return { start: contentStart, end: nextClose.index };
    }
  }
  return { start: contentStart, end: html.length };
}

// The prose lives in one container and the page furniture lives outside it.
// VOA puts the article in div.wsw. Government pages use <main>. Anything
// else falls back to <article>, then to the whole document.
function articleHtml(html) {
  const wsw = html.search(/<div[^>]*class="[^"]*\bwsw\b[^"]*"/i);
  if (wsw !== -1) {
    const { start, end } = innerSpan(html, wsw, 'div');
    return html.slice(start, end);
  }
  const main = html.search(/<main\b/i);
  if (main !== -1) {
    const { start, end } = innerSpan(html, main, 'main');
    return html.slice(start, end);
  }
  const article = html.search(/<article\b/i);
  if (article !== -1) {
    const { start, end } = innerSpan(html, article, 'article');
    return html.slice(start, end);
  }
  return html;
}

// Players, image captions and share widgets sit inside the prose container
// and carry their own paragraphs, so they are removed before the paragraphs
// are collected rather than filtered out afterwards by guesswork.
const FURNITURE = [
  /class="[^"]*wsw__embed[^"]*"/i,
  /class="[^"]*media-block[^"]*"/i,
  /class="[^"]*c-mmp\b[^"]*"/i,
  /class="[^"]*content-sharing[^"]*"/i,
  /class="[^"]*comment[^"]*"/i,
  /class="[^"]*pane-content[^"]*"/i,
];

function stripFurniture(html) {
  let out = html;
  for (const marker of FURNITURE) {
    for (;;) {
      const hit = out.search(new RegExp(`<div[^>]*${marker.source}`, 'i'));
      if (hit === -1) break;
      const { end } = innerSpan(out, hit, 'div');
      const closeEnd = out.indexOf('>', out.indexOf('</div', end)) + 1;
      out = out.slice(0, hit) + out.slice(closeEnd > 0 ? closeEnd : end);
    }
  }
  return out
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<figure[\s\S]*?<\/figure>/gi, '')
    .replace(/<figcaption[\s\S]*?<\/figcaption>/gi, '');
}

// --- Text ---------------------------------------------------------------

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  mdash: '—', ndash: '–', hellip: '…', shy: '',
};

function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (whole, name) => {
      const key = name.toLowerCase();
      return key in NAMED ? NAMED[key] : whole;
    });
}

function textOf(fragment) {
  return decodeEntities(
    fragment
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

// Headings are kept because a source often carries its meaning in them, and
// deciding what to drop is the curator's job rather than this script's.
function paragraphsOf(html) {
  const blocks = html.match(/<(p|h2|h3)\b[^>]*>[\s\S]*?<\/\1\s*>/gi) || [];
  const out = [];
  for (const block of blocks) {
    const text = textOf(block);
    if (!text) continue;
    if (out[out.length - 1] === text) continue;
    out.push(text);
  }
  return out;
}

// --- Used by the other curation scripts ---------------------------------

export async function fetchHtml(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.text();
}

export function extractParagraphs(html) {
  return paragraphsOf(stripFurniture(articleHtml(html)));
}

export async function fetchSourceText(url) {
  return extractParagraphs(await fetchHtml(url));
}

// --- Main ---------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const url = args.find((a) => !a.startsWith('--'));
  if (!url) fail('usage: node scripts/fetch-source.mjs <url> [--out content-raw/<date>.txt]');

  const outIndex = args.indexOf('--out');
  const out = outIndex === -1 ? null : args[outIndex + 1];
  if (out && existsSync(out) && !args.includes('--force')) {
    fail(`${out} already exists. Pass --force to replace it.`);
  }

  let paragraphs;
  try {
    paragraphs = await fetchSourceText(url);
  } catch (err) {
    fail(`could not fetch ${url}: ${err.message}`);
  }
  if (paragraphs.length === 0) fail(`no paragraphs found in ${url}`);

  const text = `${paragraphs.join('\n\n')}\n`;
  const words = (text.match(/[A-Za-z]+/g) || []).length;

  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, text, 'utf8');
    console.log(`${out}: ${paragraphs.length} paragraphs, ${words} words`);
  } else {
    process.stdout.write(text);
  }
}

// Only run when invoked directly. The harvesting scripts import the
// extraction from here so that everything reaches content-raw/ the same way.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
