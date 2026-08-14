#!/usr/bin/env node
// Lists candidate articles from VOA Learning English.
//
// VOA is the only source in docs/content-sources.md with an archive deep
// enough to keep a daily habit fed for a year, so this walks its section
// pages and prints what it finds. It decides nothing. Screening is
// check-article.mjs, and choosing is a person's job.
//
// One thing it does report, because getting it wrong would be a licensing
// mistake rather than a taste one: whether a story is VOA's own. Items
// syndicated from the Associated Press or Reuters sit on the same pages and
// look identical, and those are not public domain. The byline is the only
// way to tell, so this fetches it and says so.
//
// Usage:
//   node scripts/list-voa.mjs --section 955 --pages 4
//   node scripts/list-voa.mjs --find "daylight saving time"
//   node scripts/list-voa.mjs --section 955 --pages 4 --bylines
//
// Sections worth reading, at the time of writing:
//   955  Health & Lifestyle       1579  Science & Technology
//   3521 As It Is                 986   Arts & Culture
//   987  Words and Their Stories  1581  American Stories
//
// Zero dependencies, Node ESM.

import { fetchHtml } from './fetch-source.mjs';

const ORIGIN = 'https://learningenglish.voanews.com';

// A story whose text belongs to a news agency cannot be used, whatever the
// rest of the page says. These are the credits that rule one out.
const AGENCIES = /Associated Press|Reuters|Agence France|AFP\b/i;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function decode(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

// Section pages list each story more than once, in a headline block and
// again in a teaser, so the slug is what identifies it rather than the
// order it was found in.
function articlesIn(html) {
  const found = new Map();
  const re = /<a[^>]*href="(\/a\/([^"/]+)\/(\d+)\.html)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html))) {
    const [, path, slug, id, inner] = m;
    const title = decode(inner.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    const existing = found.get(id);
    if (!existing || (!existing.title && title)) {
      found.set(id, { url: ORIGIN + path, slug, id, title });
    }
  }
  return [...found.values()];
}

async function listSection(section, pages) {
  const out = new Map();
  for (let page = 0; page < pages; page += 1) {
    const url = page === 0 ? `${ORIGIN}/z/${section}` : `${ORIGIN}/z/${section}?p=${page}`;
    let html;
    try {
      html = await fetchHtml(url);
    } catch (err) {
      console.error(`page ${page}: ${err.message}`);
      break;
    }
    const items = articlesIn(html);
    if (items.length === 0) break;
    for (const item of items) out.set(item.id, item);
  }
  return [...out.values()];
}

async function search(query) {
  const html = await fetchHtml(`${ORIGIN}/s?k=${encodeURIComponent(query)}&tab=all`);
  return articlesIn(html);
}

// The credit sits in the last few paragraphs of the story itself.
async function bylineOf(url) {
  try {
    const html = await fetchHtml(url);
    const tail = html.slice(-40000);
    const hit = tail.match(/<p[^>]*>((?:(?!<\/p>)[\s\S]){0,400}(?:reported|adapted|wrote)(?:(?!<\/p>)[\s\S]){0,400})<\/p>/i);
    return hit ? decode(hit[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim() : '';
  } catch {
    return '';
  }
}

async function main() {
  const args = process.argv.slice(2);
  const valueOf = (flag) => {
    const i = args.indexOf(flag);
    return i === -1 ? null : args[i + 1];
  };

  const section = valueOf('--section');
  const query = valueOf('--find');
  const pages = Number(valueOf('--pages') ?? 3);
  const wantBylines = args.includes('--bylines');

  if (!section && !query) {
    fail('usage: node scripts/list-voa.mjs --section <id> [--pages n] [--bylines]\n       node scripts/list-voa.mjs --find "<words>"');
  }

  const items = query ? await search(query) : await listSection(section, pages);

  for (const item of items) {
    if (!wantBylines) {
      console.log(`${item.url}\t${item.title}`);
      continue;
    }
    const byline = await bylineOf(item.url);
    const agency = AGENCIES.test(byline) ? 'AGENCY' : 'voa';
    console.log(`${agency}\t${item.url}\t${item.title}\t${byline}`);
  }
  console.error(`${items.length} articles`);
}

await main();
