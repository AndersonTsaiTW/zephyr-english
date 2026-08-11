#!/usr/bin/env node
// Scaffolds a dated article JSON from a plain-text source, so a curator
// starts from the right shape instead of copying sample.json by hand.
//
// Usage:
//   node scripts/new-article.mjs source.txt --date 2026-08-11 \
//     --title "Renting your first apartment" --author "Government of Canada" \
//     --license "Open Government Licence - Canada" \
//     --url "https://www.canada.ca/..." [--origin "Newcomer guides"]
//
// What it does:
//   1. Splits the source into paragraphs on blank lines.
//   2. Writes site/content/articles/<date>.json with an empty quiz and
//      empty previewWords, for a person to fill in.
//   3. Copies the source, byte for byte, to content-raw/<id>.txt, which
//      is what scripts/check-article.mjs compares body sentences against.
//   4. Adds <date> to site/content/index.json, creating that file as a
//      sorted array if it does not exist yet.
//
// Refuses to overwrite an existing article or an existing content-raw
// copy, since either would silently discard a curator's earlier work.
// Zero dependencies, Node ESM.

import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv) {
  if (argv.length === 0) {
    fail(
      'usage: node scripts/new-article.mjs <source.txt> --date YYYY-MM-DD --title T --author A --license L --url U [--origin O] [--level easy|core|hard]'
    );
  }
  const sourcePath = argv[0];
  const flags = {};
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const name = arg.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      fail(`missing value for --${name}`);
    }
    flags[name] = value;
    i++;
  }
  return { sourcePath, flags };
}

function requireFlag(flags, name) {
  const value = flags[name];
  if (!value) {
    fail(`missing required --${name}`);
  }
  return value;
}

function splitParagraphs(text) {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function loadIndex(indexPath) {
  if (!existsSync(indexPath)) return [];
  const raw = readFileSync(indexPath, 'utf8');
  let dates;
  try {
    dates = JSON.parse(raw);
  } catch (err) {
    fail(`could not parse ${indexPath} as JSON: ${err.message}`);
  }
  if (!Array.isArray(dates)) {
    fail(`${indexPath} exists but is not a JSON array`);
  }
  return dates;
}

function main() {
  const { sourcePath, flags } = parseArgs(process.argv.slice(2));

  const date = requireFlag(flags, 'date');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    fail(`--date must look like YYYY-MM-DD, got "${date}"`);
  }
  const title = requireFlag(flags, 'title');
  const author = requireFlag(flags, 'author');
  const license = requireFlag(flags, 'license');
  const url = requireFlag(flags, 'url');
  const origin = flags.origin || '';

  // Reading level. "core" keeps the plain <date>.json name so the earlier
  // articles need no renaming; the other two take a suffix.
  const level = flags.level || 'core';
  if (!['easy', 'core', 'hard'].includes(level)) {
    fail(`--level must be easy, core or hard, got "${level}"`);
  }

  const absoluteSourcePath = resolve(process.cwd(), sourcePath);
  if (!existsSync(absoluteSourcePath)) {
    fail(`source file not found: ${sourcePath}`);
  }

  const id = level === 'core' ? date : `${date}-${level}`;
  const articlePath = join(root, 'site/content/articles', `${id}.json`);
  if (existsSync(articlePath)) {
    fail(`refusing to overwrite existing article: ${articlePath}`);
  }

  const contentRawDir = join(root, 'content-raw');
  const contentRawPath = join(contentRawDir, `${id}.txt`);
  if (existsSync(contentRawPath)) {
    fail(`refusing to overwrite existing raw source: ${contentRawPath}`);
  }

  const sourceText = readFileSync(absoluteSourcePath, 'utf8');
  const paragraphs = splitParagraphs(sourceText);
  if (paragraphs.length === 0) {
    fail(`${sourcePath} has no paragraphs once blank lines are collapsed`);
  }

  const article = {
    id,
    title,
    level,
    source: { author, origin, license, url },
    body: paragraphs,
    previewWords: [],
    quiz: [],
  };

  mkdirSync(dirname(articlePath), { recursive: true });
  writeFileSync(articlePath, JSON.stringify(article, null, 2) + '\n', 'utf8');

  mkdirSync(contentRawDir, { recursive: true });
  copyFileSync(absoluteSourcePath, contentRawPath);

  const indexPath = join(root, 'site/content/index.json');
  const dates = loadIndex(indexPath);
  const existed = existsSync(indexPath);
  if (!dates.includes(date)) {
    dates.push(date);
    dates.sort();
  }
  writeFileSync(indexPath, JSON.stringify(dates, null, 2) + '\n', 'utf8');

  console.log(`wrote ${articlePath}`);
  console.log(`copied raw source to ${contentRawPath}`);
  console.log(`${existed ? 'updated' : 'created'} ${indexPath} (${dates.length} date(s))`);
  if (!origin) {
    console.log('reminder: --origin was not given, source.origin is empty, fill it in before publishing');
  }
  console.log('previewWords and quiz are empty, fill those in and run scripts/check-article.mjs before publishing');
}

main();
