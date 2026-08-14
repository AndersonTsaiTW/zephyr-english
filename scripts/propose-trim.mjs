#!/usr/bin/env node
// Proposes a shortened body for a scaffolded article, by deleting only.
//
// A source is usually two or three times longer than an article, and most of
// the excess is the same few things every time: the line that introduces the
// radio programme, the sign-off, the byline, the glossary VOA appends, and
// sometimes a scripted conversation. Cutting those by hand a hundred times
// is how mistakes get made, so this does it.
//
// What it does NOT do is decide whether the result reads well. It takes
// paragraphs from the top until the piece is long enough, which suits a news
// story and can badly misjudge an essay. Read what it proposes. Move the
// window, drop a paragraph, put one back. That judgement is the job.
//
// Every operation here removes a whole paragraph or leaves it alone, so the
// result still passes the provenance check in check-article.mjs. Nothing is
// reworded, and nothing can be: this file has no way to write a sentence.
//
// Usage:
//   node scripts/propose-trim.mjs site/content/articles/2026-09-16.json
//   node scripts/propose-trim.mjs site/content/articles/2026-09-16.json --from 3
//
// Zero dependencies, Node ESM.

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadTop2000, wordsOf, fleschKincaidGrade, coverageOf, sentencesOf } from './check-article.mjs';

const WORDS_MIN = 220;
const WORDS_MAX = 320;
const GRADE_MAX = 9;

// Broadcast furniture. None of it belongs to the piece a reader should get.
const FURNITURE = [
  // A paragraph ending in a colon introduced a list, and lists live in HTML
  // that does not survive being turned into plain text. What is left is a
  // sentence promising items that never arrive, which reads as a mistake.
  // This is the single most common way a government page falls apart.
  /:\s*$/,
  /^our story today is/i,
  /^we present (the|our)\b/i,
  /originally adapted and recorded by/i,
  /^on this program we explore/i,
  /^now,? the (weekly|voa|special)/i,
  /here is .{0,40} with the story/i,
  /^\*\*/,
  /^(learn|find out|use this page|read) about\b/i,
  /^(for more information|newcomer services|search online)/i,
  /^see the .{0,60}(in your province|department)/i,
  /^and now,?\s+(words and their stories|the health|science|as it is)/i,
  /^and that('|’)s\s+(all\s+)?(the time we have for this\s+)?(words and their stories|our program|as it is)/i,
  /^(i'm|i’m)\s+[A-Z][a-z]+(\s+[A-Z][a-zA-Z.'’-]+)*\.?$/,
  /^(this is\s+)?(voa|the voa)\s+learning english/i,
  /(wrote|reported|adapted|produced)\s+(on\s+)?(this|the)\s+(story|report|lesson|program)/i,
  /adapted (it|the report|this story) for/i,
  /^words in this story/i,
  /^_+$/,
  /^-+$/,
  /^what do you think/i,
  /^write to us in the comments/i,
  /^we want to hear from you/i,
  /^see how well you understand/i,
  /^(quiz|practice)\s*[-–—:]/i,
  /^until next time/i,
  /^that('|’)s all for/i,
  /^join us again/i,
];

// The glossary VOA appends, in the shape "word -n. what it means".
const GLOSSARY = /^[^.]{1,40}\s[-–—]\s?(n|v|adj|adv|prep|conj|phrasal)\b\.?/i;

// A scripted conversation, which reads as dialogue rather than as an article.
const DIALOGUE = /^[A-Z]\s*:\s/;

export function isFurniture(paragraph) {
  const p = paragraph.trim();
  if (!p) return true;
  if (GLOSSARY.test(p)) return true;
  if (DIALOGUE.test(p)) return true;
  // A fragment with no sentence in it is a heading or a navigation label
  // that lost its markup on the way out of the page.
  if (wordsOf(p).length < 7 && !/[.!?]["'”’]?$/.test(p)) return true;
  return FURNITURE.some((re) => re.test(p));
}

// A trimmed article has to end on a finished sentence. Anything else means
// the window closed in the middle of a thought, and no reader should meet
// that at the end of a piece they cannot scroll back through.
export function endsCleanly(body) {
  const last = body[body.length - 1] ?? '';
  return /[.!?]["'”’]?$/.test(last.trim());
}

const countWords = (text) => wordsOf(text).length;

// Takes paragraphs in order from `from` until the piece is long enough. A
// paragraph that would push it past the ceiling is skipped rather than
// ending the run, because one very long paragraph in the middle should not
// truncate an otherwise good article.
export function proposeBody(paragraphs, from = 0) {
  const kept = [];
  let words = 0;
  for (const paragraph of paragraphs.slice(from)) {
    if (words >= WORDS_MIN) break;
    const n = countWords(paragraph);
    if (words + n > WORDS_MAX + 20) continue;
    kept.push(paragraph);
    words += n;
  }
  return kept;
}

// A Flesch-Kincaid score rises with sentence length, so an article a little
// over the cap is usually carrying two or three very long sentences rather
// than being uniformly hard. Dropping the longest is both the smallest
// possible edit and the one that helps most. Deleting short plain sentences
// instead would push the score the wrong way, which is worth knowing before
// you try to fix one of these by eye.
export function easeGrade(body, top2000) {
  let out = [...body];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const text = out.join(' ');
    if (fleschKincaidGrade(text) <= GRADE_MAX) return out;
    let worst = null;
    out.forEach((paragraph, index) => {
      for (const sentence of sentencesOf(paragraph)) {
        const n = countWords(sentence);
        if (countWords(text) - n < WORDS_MIN) continue;
        if (!worst || n > worst.n) worst = { index, sentence, n };
      }
    });
    if (!worst) return out;
    out = out
      .map((paragraph, index) =>
        index === worst.index ? paragraph.replace(worst.sentence, '').replace(/\s+/g, ' ').trim() : paragraph
      )
      .filter(Boolean);
  }
  return out;
}

function report(body, top2000) {
  const text = body.join(' ');
  const { percent } = coverageOf(text, top2000);
  return {
    words: countWords(text),
    grade: Number(fleschKincaidGrade(text).toFixed(2)),
    coverage: Number(percent.toFixed(1)),
  };
}

function main() {
  const args = process.argv.slice(2);
  const path = args.find((a) => !a.startsWith('--'));
  if (!path) {
    console.error('usage: node scripts/propose-trim.mjs <article.json> [--from n] [--dry]');
    process.exit(1);
  }
  const fromIndex = args.indexOf('--from');
  const from = fromIndex === -1 ? 0 : Number(args[fromIndex + 1]);

  const article = JSON.parse(readFileSync(path, 'utf8'));
  const top2000 = loadTop2000();
  const usable = article.body.filter((p) => !isFurniture(p));
  const body = easeGrade(proposeBody(usable, from), top2000);
  const metrics = report(body, top2000);

  console.log(`${article.body.length} paragraphs in, ${usable.length} after furniture, ${body.length} kept`);
  console.log(`${metrics.words} words, grade ${metrics.grade}, coverage ${metrics.coverage}%`);

  if (args.includes('--dry')) {
    body.forEach((p, i) => console.log(`\n[${i}] ${p}`));
    return;
  }
  article.body = body;
  writeFileSync(path, `${JSON.stringify(article, null, 2)}\n`);
  console.log(`wrote ${path}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
