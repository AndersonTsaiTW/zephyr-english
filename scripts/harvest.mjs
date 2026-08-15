#!/usr/bin/env node
// Finds articles for the days that do not have one yet, and scaffolds them.
//
// This is the part of curation a machine can be trusted with. It reads the
// source list in scripts/data/sources.json, downloads pages it has not seen
// before, measures them, throws out the ones that cannot work, and writes a
// scaffolded article for each day still empty.
//
// What it deliberately does not do:
//
//   It does not write the quiz or the word explanations. Those are the two
//   things a reader is graded on, and docs/content-sources.md says a person
//   reads every question before it ships.
//
//   It does not touch site/content/index.json. A date in the index is a
//   promise that opening the app that morning gives you something to read
//   and something to answer, and a scaffold is only half of that. Articles
//   join the index when someone has finished them.
//
// So a run of this leaves the site exactly as it was and leaves work on the
// floor for a person to pick up. That is the intended shape.
//
// Usage:
//   node scripts/harvest.mjs                 scaffold up to 12 days
//   node scripts/harvest.mjs --scaffold 30   scaffold up to 30
//   node scripts/harvest.mjs --budget 250    stop after 250 downloads
//   node scripts/harvest.mjs --dry           measure but write nothing
//
// Zero dependencies, Node ESM.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchHtml, extractParagraphs } from './fetch-source.mjs';
import { isFurniture, proposeBody, easeGrade, endsCleanly } from './propose-trim.mjs';
import { loadTop2000, wordsOf, fleschKincaidGrade, coverageOf } from './check-article.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEEN_PATH = join(root, 'scripts/data/seen-sources.json');

// Room to spare on every threshold, because a run nobody is watching should
// only keep what is comfortably inside the rules rather than what scrapes in.
const WORDS_MIN = 225;
const WORDS_MAX = 315;
const GRADE_MAX = 8.8;
const COVERAGE_MIN = 85;

// A story split across pages only works if the parts run on consecutive
// days starting at part one, and this cannot promise that. Someone placing
// a serial by hand can; see the Poe week at the end of October.
const SERIAL_PART = /,?\s*part\s+(one|two|three|four|five|\d+)\s*$/i;

// A story adapted from a news agency is not public domain, whatever the
// page around it says. Two thirds of VOA Learning English is agency copy,
// so this is the check that matters most here.
const AGENCY = /Associated Press|Reuters|Agence France|\bAFP\b/i;

// Nobody should meet these unannounced in a two minute habit opened before
// work, with no way to scroll back. The reasoning is in PLAN.md, where a BC
// Reads chapter was set aside for the same reason.
const UNSUITABLE_TITLE = /^archived\b|cancer|tumou?r|suicide|self-harm|overdose|abuse|dying|palliative|dementia|autopsy|amputation/i;
const UNSUITABLE_BODY = /\b(abus\w+|violence|mutilation|assault|traffick\w+|rape|murder|suicide|self-harm)\b/i;
const FIRST_PERSON_QA = /^(my |i |how can i|what if i)/i;

const normalise = (title) =>
  title.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

const decode = (t) =>
  t
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');

// --- Listing candidates ------------------------------------------------

function linksIn(html, pattern, base) {
  const out = new Set();
  const re = /href="([^"#]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    let url = m[1];
    if (url.startsWith('/')) url = new URL(url, base).href;
    if (!url.startsWith('http')) continue;
    if (pattern && !pattern.test(url)) continue;
    out.add(url);
  }
  return [...out];
}

async function listVoaSection(source) {
  const origin = 'https://learningenglish.voanews.com';
  const found = new Map();
  for (let page = 0; page < (source.pages ?? 10); page += 1) {
    const url = page === 0 ? `${origin}/z/${source.section}` : `${origin}/z/${source.section}?p=${page}`;
    let html;
    try {
      html = await fetchHtml(url);
    } catch {
      break;
    }
    const re = /<a[^>]*href="(\/a\/([^"/]+)\/(\d+)\.html)"[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    let added = 0;
    while ((m = re.exec(html))) {
      const [, path, , id, inner] = m;
      const title = decode(inner.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
      const prev = found.get(id);
      if (!prev || (!prev.title && title)) {
        found.set(id, { url: origin + path, title });
        added += 1;
      }
    }
    if (added === 0) break;
  }
  return [...found.values()];
}

async function listSitemap(source) {
  const xml = await fetchHtml(source.sitemap);
  const include = source.include ? new RegExp(source.include) : null;
  const exclude = source.exclude ? new RegExp(source.exclude) : null;
  const out = [];
  for (const m of xml.matchAll(/<loc>([^<]*)<\/loc>/g)) {
    const url = m[1];
    if (!url.startsWith('http') || url.endsWith('.pdf')) continue;
    if (include && !include.test(url)) continue;
    if (exclude && exclude.test(url)) continue;
    out.push({ url, title: '' });
    if (source.limit && out.length >= source.limit) break;
  }
  return out;
}

async function listIndexPage(source) {
  const html = await fetchHtml(source.page);
  const include = source.include ? new RegExp(source.include) : null;
  const urls = linksIn(html, include, source.page);
  return urls.slice(0, source.limit ?? 400).map((url) => ({ url, title: '' }));
}

async function listCandidates(source) {
  if (source.kind === 'voa-section') return listVoaSection(source);
  if (source.kind === 'sitemap') return listSitemap(source);
  if (source.kind === 'index-page') return listIndexPage(source);
  throw new Error(`unknown source kind "${source.kind}"`);
}

// --- Judging one page ---------------------------------------------------

function titleOf(html) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const raw = h1 ? h1[1] : (html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '');
  return decode(raw.replace(/<[^>]+>/g, ''))
    .replace(/\s*[-–|]\s*(Canada\.ca|MedlinePlus.*|VOA.*)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function judge(html, top2000, source) {
  const paragraphs = extractParagraphs(html).filter((p) => p.split(/\s+/).length > 4);
  if (paragraphs.length === 0) return { verdict: 'empty' };

  const title = titleOf(html);
  if (!title) return { verdict: 'no title' };
  if (UNSUITABLE_TITLE.test(title) || FIRST_PERSON_QA.test(title)) return { verdict: 'unsuitable title', title };
  if (SERIAL_PART.test(title)) return { verdict: 'part of a serial', title };
  if (source.titleExclude && new RegExp(source.titleExclude, 'i').test(title)) {
    return { verdict: 'excluded by source rule', title };
  }

  const whole = paragraphs.join(' ');
  if (source.kind === 'voa-section' && AGENCY.test(whole)) return { verdict: 'agency', title };
  if (UNSUITABLE_BODY.test(whole)) return { verdict: 'unsuitable body', title };

  const body = easeGrade(proposeBody(paragraphs.filter((p) => !isFurniture(p))), top2000);
  if (body.length === 0) return { verdict: 'nothing left after furniture', title };
  if (!endsCleanly(body)) return { verdict: 'ends mid-sentence', title };

  const text = body.join(' ');
  const words = wordsOf(text).length;
  const grade = Number(fleschKincaidGrade(text).toFixed(2));
  const coverage = Number(coverageOf(text, top2000).percent.toFixed(1));

  if (words < WORDS_MIN || words > WORDS_MAX) return { verdict: `${words} words`, title };
  if (grade > GRADE_MAX) return { verdict: `grade ${grade}`, title };
  if (coverage < COVERAGE_MIN) return { verdict: `coverage ${coverage}`, title };

  return { verdict: 'accept', title, paragraphs, body, words, grade, coverage };
}

// --- Dates --------------------------------------------------------------

function nextEmptyDates(count) {
  const dir = join(root, 'site/content/articles');
  const taken = new Set(
    readdirSync(dir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .map((f) => f.replace('.json', ''))
  );
  const last = [...taken].sort().pop();
  const out = [];
  const d = new Date(`${last ?? new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  while (out.length < count) {
    d.setUTCDate(d.getUTCDate() + 1);
    const date = d.toISOString().slice(0, 10);
    if (!taken.has(date)) out.push(date);
  }
  return out;
}

// --- Main ---------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const valueOf = (flag, fallback) => {
    const i = args.indexOf(flag);
    return i === -1 ? fallback : Number(args[i + 1]);
  };
  const wanted = valueOf('--scaffold', 12);
  const budget = valueOf('--budget', 300);
  const dry = args.includes('--dry');

  const { sources } = JSON.parse(readFileSync(join(root, 'scripts/data/sources.json'), 'utf8'));
  const seen = existsSync(SEEN_PATH) ? JSON.parse(readFileSync(SEEN_PATH, 'utf8')) : {};
  const top2000 = loadTop2000();

  // Anything already published or scaffolded is out of the running, by URL
  // and by title, because VOA reprints the same piece in more than one
  // section with the punctuation changed.
  const articlesDir = join(root, 'site/content/articles');
  const usedUrls = new Set();
  const usedTitles = new Set();
  for (const file of readdirSync(articlesDir)) {
    if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(file)) continue;
    const a = JSON.parse(readFileSync(join(articlesDir, file), 'utf8'));
    if (a.source?.url) usedUrls.add(a.source.url);
    if (a.title) usedTitles.add(normalise(a.title));
  }

  const dates = nextEmptyDates(wanted);
  const accepted = [];
  let downloads = 0;
  const tally = {};

  // List every source before downloading anything, then take from them in
  // turn. Draining one source first would fill a fortnight with government
  // pages about tax, and a reader gets one of these a day for months.
  const queues = [];
  for (const source of sources) {
    try {
      const candidates = (await listCandidates(source)).filter(
        (c) => !seen[c.url] && !usedUrls.has(c.url)
      );
      console.error(`${source.name}: ${candidates.length} unseen`);
      if (candidates.length) queues.push({ source, candidates, at: 0 });
    } catch (err) {
      console.error(`${source.name}: could not list, ${err.message}`);
    }
  }

  while (accepted.length < wanted && downloads < budget && queues.some((q) => q.at < q.candidates.length)) {
    for (const queue of queues) {
      if (accepted.length >= wanted || downloads >= budget) break;
      if (queue.at >= queue.candidates.length) continue;
      const candidate = queue.candidates[queue.at];
      queue.at += 1;

      let html;
      downloads += 1;
      try {
        html = await fetchHtml(candidate.url);
      } catch (err) {
        seen[candidate.url] = `unreachable: ${err.message.slice(0, 40)}`;
        continue;
      }

      const result = judge(html, top2000, queue.source);
      const title = result.title || candidate.title;
      if (result.verdict !== 'accept') {
        seen[candidate.url] = result.verdict;
        const key = result.verdict.replace(/\d+(\.\d+)?/g, 'n');
        tally[key] = (tally[key] ?? 0) + 1;
        continue;
      }
      if (usedTitles.has(normalise(title))) {
        seen[candidate.url] = 'duplicate title';
        continue;
      }

      usedTitles.add(normalise(title));
      seen[candidate.url] = 'accepted';
      accepted.push({ ...result, title, source: queue.source, url: candidate.url });
    }
  }

  console.error(`downloaded ${downloads}, accepted ${accepted.length}`);
  const rejected = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  if (rejected.length) console.error(`rejected: ${rejected.map(([k, v]) => `${k} ${v}`).join(', ')}`);

  if (dry) {
    for (const a of accepted) console.log(`${a.words}w g${a.grade} ${a.coverage}%  ${a.title}`);
    return;
  }

  accepted.forEach((article, index) => {
    const date = dates[index];
    if (!date) return;
    writeFileSync(join(root, 'content-raw', `${date}.txt`), `${article.paragraphs.join('\n\n')}\n`, 'utf8');
    writeFileSync(
      join(articlesDir, `${date}.json`),
      `${JSON.stringify(
        {
          id: date,
          title: article.title,
          topic: '',
          source: {
            author: article.source.author,
            origin: article.source.origin,
            license: article.source.license,
            url: article.url,
          },
          body: article.body,
          previewWords: [],
          quiz: [],
        },
        null,
        2
      )}\n`,
      'utf8'
    );
    console.log(`${date}  ${article.words}w  g${article.grade}  ${article.coverage}%  ${article.title}`);
  });

  writeFileSync(SEEN_PATH, `${JSON.stringify(seen, null, 0)}\n`, 'utf8');
  console.error(`${Object.keys(seen).length} urls now on the seen list`);
}

await main();
