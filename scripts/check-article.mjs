#!/usr/bin/env node
// Checks an article is short enough, easy enough, and faithful to its source.
//
// Length is 220 to 320 words. Reading grade must be 9 or lower and at least
// 84 percent of words must come from the common two thousand.
//
// It also compares each published sentence against the untouched original in
// content-raw/. That comparison is how the project enforces its rule that a
// source may be shortened but never reworded, without relying on whoever did
// the shortening to have been honest about it.
//
// Usage:
//   node scripts/check-article.mjs site/content/articles/2026-08-11.json
//   node scripts/check-article.mjs content-raw/2026-08-11.txt
//
// Zero dependencies, Node ESM.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, basename, extname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const WORD_COUNT_MIN = 220;
const WORD_COUNT_MAX = 320;
// Measured rather than guessed. Eleven BC Reads texts, written by curriculum
// designers for exactly these readers, scored between 89.8 and 96.1 percent
// coverage untouched, several of them at Flesch-Kincaid grade 2. A threshold
// that fails grade-2 adult literacy material is measuring the size of the word
// list rather than the difficulty of the writing. The grade cap is set to take
// in Readers 3 through 5, which is the range the articles are drawn from.
const FK_GRADE_MAX = 9;
const COVERAGE_MIN = 84;

function fail(message) {
  console.error(message);
  process.exit(1);
}

// --- Top-2000 list -----------------------------------------------------

function loadTop2000() {
  const path = join(root, 'scripts/data/top2000.txt');
  const text = readFileSync(path, 'utf8');
  const set = new Set();
  for (const line of text.split('\n')) {
    const word = line.trim();
    if (!word || word.startsWith('#')) continue;
    set.add(word.toLowerCase());
  }
  return set;
}

// The NGSL list gives one lemma per entry ("be", "he", "go"), not its
// inflections, so without help "is", "his" and "went" would all read as
// off-list even though they are among the most common words in English.
// Those three verbs and the pronoun set carry most of that load, so they
// are worth hardcoding rather than leaving to the suffix stripper below,
// which cannot reach irregular forms at all.
const IRREGULAR_FORMS = {
  is: 'be', am: 'be', are: 'be', was: 'be', were: 'be', been: 'be', being: 'be',
  has: 'have', had: 'have', having: 'have',
  does: 'do', did: 'do', doing: 'do', done: 'do',
  goes: 'go', went: 'go', gone: 'go', going: 'go',
  says: 'say', said: 'say', saying: 'say',
  him: 'he', his: 'he', himself: 'he',
  her: 'she', hers: 'she', herself: 'she',
  them: 'they', their: 'they', theirs: 'they', themselves: 'they',
  us: 'we', our: 'we', ours: 'we', ourselves: 'we',
  me: 'i', my: 'i', mine: 'i', myself: 'i',
  your: 'you', yours: 'you', yourself: 'you', yourselves: 'you',
  its: 'it', itself: 'it',
  an: 'a',
  // Common irregular verbs. The suffix stripper below only knows regular
  // endings, so without these every past tense in an ordinary story is
  // reported as an unknown word.
  told: 'tell', came: 'come', sat: 'sit', took: 'take', taken: 'take',
  broke: 'break', broken: 'break', brought: 'bring', felt: 'feel',
  found: 'find', got: 'get', gotten: 'get', kept: 'keep', made: 'make',
  saw: 'see', seen: 'see', knew: 'know', known: 'know', thought: 'think',
  gave: 'give', given: 'give', left: 'leave', met: 'meet', paid: 'pay',
  put: 'put', ran: 'run', sold: 'sell', sent: 'send', spoke: 'speak',
  spoken: 'speak', stood: 'stand', won: 'win', wrote: 'write',
  written: 'write', heard: 'hear', held: 'hold', lost: 'lose',
  built: 'build', bought: 'buy', caught: 'catch', chose: 'choose',
  fell: 'fall', fought: 'fight', grew: 'grow', led: 'lead', meant: 'mean',
  read: 'read', rose: 'rise', set: 'set', shown: 'show', taught: 'teach',
  understood: 'understand', became: 'become', began: 'begin', begun: 'begin',
  // Irregular plurals.
  men: 'man', women: 'woman', children: 'child', people: 'people',
  feet: 'foot', teeth: 'tooth', lives: 'life',
};

// The list holds lemmas (run, city, happy), not surface forms (running,
// cities, happier). This generates the inflected forms a token might be
// and checks each against the lemma set, so a token counts as covered if
// any candidate matches. It is a heuristic suffix stripper, not a real
// morphological analyzer, so it will still miss irregular forms outside
// IRREGULAR_FORMS above, such as "children" for "child". Those show up
// as off-list words and a curator can judge them by eye.
function candidatesFor(token) {
  const w = token.toLowerCase();
  const out = new Set([w]);

  if (IRREGULAR_FORMS[w]) out.add(IRREGULAR_FORMS[w]);

  const noSuffix = w.replace(/'(s|d|ll|re|ve|m)$/, '').replace(/n't$/, '');
  if (noSuffix !== w) out.add(noSuffix);
  // "didn't" reduces to "did", which is only a known word through the
  // irregular map, so the map has to be consulted again after stripping.
  if (IRREGULAR_FORMS[noSuffix]) out.add(IRREGULAR_FORMS[noSuffix]);
  const base = noSuffix;

  if (base.length > 4 && base.endsWith('ies')) out.add(base.slice(0, -3) + 'y');
  if (base.length > 4 && base.endsWith('ied')) out.add(base.slice(0, -3) + 'y');
  if (base.length > 4 && base.endsWith('ves')) {
    out.add(base.slice(0, -3) + 'f');
    out.add(base.slice(0, -3) + 'fe');
  }
  if (base.length > 3 && /(?:[sxz]es|[cs]hes)$/.test(base)) out.add(base.slice(0, -2));
  if (base.length > 3 && base.endsWith('es')) out.add(base.slice(0, -2));
  if (base.length > 3 && base.endsWith('s') && !base.endsWith('ss')) out.add(base.slice(0, -1));

  if (base.length > 3 && base.endsWith('ed')) {
    const stem = base.slice(0, -2);
    out.add(stem);
    out.add(stem + 'e');
    if (/(.)\1$/.test(stem)) out.add(stem.slice(0, -1));
  }
  if (base.length > 4 && base.endsWith('ing')) {
    const stem = base.slice(0, -3);
    out.add(stem);
    out.add(stem + 'e');
    if (/(.)\1$/.test(stem)) out.add(stem.slice(0, -1));
  }

  if (base.length > 4 && base.endsWith('ily')) out.add(base.slice(0, -3) + 'y');
  else if (base.length > 3 && base.endsWith('ly')) out.add(base.slice(0, -2));

  if (base.length > 4 && base.endsWith('ier')) out.add(base.slice(0, -3) + 'y');
  else if (base.length > 5 && base.endsWith('iest')) out.add(base.slice(0, -4) + 'y');
  else {
    if (base.length > 3 && base.endsWith('er')) out.add(base.slice(0, -2));
    if (base.length > 4 && base.endsWith('est')) out.add(base.slice(0, -3));
  }

  return [...out];
}

function isOnList(token, list) {
  return candidatesFor(token).some((candidate) => list.has(candidate));
}

// --- Text metrics --------------------------------------------------------

const WORD_RE = /[A-Za-z]+(?:'[A-Za-z]+)*/g;

// Published prose uses the curly apostrophe. Left alone it is not a letter,
// so "didn't" tokenizes as "didn" and "t" and both land on the off-list
// report as mystery words.
function straightenQuotes(text) {
  return text.replace(/[‘’ʼ]/g, "'");
}

function wordsOf(text) {
  return straightenQuotes(text).match(WORD_RE) || [];
}

// Names are not vocabulary. A reader meeting "Viola Desmond" or "Nova Scotia"
// is not being asked to know a rare word, so counting them as difficult makes
// the coverage figure meaningless for anything about a real person or place.
// A capitalised token that never starts a sentence is taken to be a name.
function properNounsIn(text, top2000) {
  const straight = straightenQuotes(text);

  // Position matters: a capital at the start of a sentence says nothing,
  // while a capital in the middle of one usually marks a name.
  const midSentence = new Map();
  const lowercased = new Set();
  const total = new Map();

  for (const sentence of sentencesOf(straight)) {
    const tokens = sentence.match(WORD_RE) || [];
    tokens.forEach((token, index) => {
      const key = token.toLowerCase();
      total.set(key, (total.get(key) || 0) + 1);
      if (/^[a-z]/.test(token)) lowercased.add(key);
      else if (index > 0 && /^[A-Z][a-z]/.test(token)) {
        midSentence.set(key, (midSentence.get(key) || 0) + 1);
      }
    });
  }

  const names = new Set();
  for (const [key, count] of total) {
    if (lowercased.has(key)) continue;
    // A word already in the common list is ordinary vocabulary, whatever
    // its capitalisation. This keeps quoted sentences starting with "We"
    // from being mistaken for names.
    if (isOnList(key, top2000)) continue;
    if (midSentence.has(key) || count > 1) names.add(key);
  }
  return names;
}

function sentencesOf(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const matches = trimmed.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) || [];
  return matches.map((s) => s.trim()).filter(Boolean);
}

// Vowel-group syllable count with the usual silent-e adjustment: a
// trailing "e" that is not part of a consonant + "le" ending (table,
// little) is dropped before counting vowel groups, and every word
// counts as at least one syllable.
function countSyllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length === 0) return 0;
  if (w.length <= 3) return 1;

  let stem = w;
  const keepsLe = w.endsWith('le') && w.length > 2 && !'aeiouy'.includes(w[w.length - 3]);
  if (w.endsWith('e') && !keepsLe) stem = w.slice(0, -1);

  const groups = stem.match(/[aeiouy]+/g);
  return Math.max(groups ? groups.length : 1, 1);
}

function fleschKincaidGrade(text) {
  const words = wordsOf(text);
  const sentences = sentencesOf(text);
  const wordCount = words.length || 1;
  const sentenceCount = sentences.length || 1;
  const syllableCount = words.reduce((sum, w) => sum + countSyllables(w), 0);
  return 0.39 * (wordCount / sentenceCount) + 11.8 * (syllableCount / wordCount) - 15.59;
}

function coverageOf(text, top2000) {
  const words = wordsOf(text);
  if (words.length === 0) return { percent: 100, offList: [], names: [] };

  const names = properNounsIn(text, top2000);
  const counts = new Map();
  const nameCounts = new Map();
  let onListCount = 0;
  let counted = 0;

  // An unfamiliar word costs the reader once. After that they know it, and in
  // an article about salmon the word "salmon" is the subject rather than an
  // obstacle. Counting all eleven appearances as eleven separate difficulties
  // says more about the topic than about how hard the text is to read, so each
  // unfamiliar word counts at most twice. Grouping by stem keeps "whale" and
  // "whales" from being charged separately.
  const REPEAT_ALLOWANCE = 2;
  const stemCounts = new Map();
  const stemOf = (w) => candidatesFor(w).sort((a, b) => a.length - b.length)[0];

  for (const word of words) {
    const key = word.toLowerCase();
    // "Viola's" is the same name as "Viola".
    const possessiveStem = key.replace(/'s$/, '');
    if (names.has(key) || names.has(possessiveStem)) {
      nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
      continue;
    }
    counted++;
    if (isOnList(word, top2000)) {
      onListCount++;
      continue;
    }
    counts.set(key, (counts.get(key) || 0) + 1);
    const stem = stemOf(key);
    const seen = (stemCounts.get(stem) || 0) + 1;
    stemCounts.set(stem, seen);
    // Beyond the allowance the word stops being charged as unfamiliar.
    if (seen > REPEAT_ALLOWANCE) onListCount++;
  }

  const byFrequency = (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]);
  return {
    percent: counted === 0 ? 100 : (onListCount / counted) * 100,
    offList: [...counts.entries()].sort(byFrequency),
    names: [...nameCounts.entries()].sort(byFrequency),
  };
}

// --- Provenance ------------------------------------------------------

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim();
}

// A model may delete sentences from the raw source but never add or
// rewrite one. This checks the mechanical half of that rule: every
// sentence surviving into body must appear, word for word once
// whitespace is normalized, somewhere in the raw source.
function checkProvenance(body, rawText) {
  const normalizedRaw = normalizeWhitespace(rawText);
  const mismatches = [];
  body.forEach((paragraph, paragraphIndex) => {
    for (const sentence of sentencesOf(paragraph)) {
      const normalized = normalizeWhitespace(sentence);
      if (normalized && !normalizedRaw.includes(normalized)) {
        mismatches.push({ paragraphIndex, sentence });
      }
    }
  });
  return mismatches;
}

// --- Reporting -------------------------------------------------------

function printOffList(offList) {
  if (offList.length === 0) {
    console.log('off-list words: none');
    return;
  }
  const shown = offList.slice(0, 50);
  const rest = offList.length - shown.length;
  const line = shown.map(([word, count]) => (count > 1 ? `${word} (${count})` : word)).join(', ');
  console.log(`off-list words (${offList.length} unique): ${line}${rest > 0 ? `, plus ${rest} more` : ''}`);
}

function report(label, text, top2000) {
  const words = wordsOf(text);
  const wordCount = words.length;
  const grade = fleschKincaidGrade(text);
  const { percent, offList, names } = coverageOf(text, top2000);

  console.log(`\n${label}`);
  console.log(`word count: ${wordCount} (target ${WORD_COUNT_MIN}-${WORD_COUNT_MAX})`);
  console.log(`Flesch-Kincaid grade: ${grade.toFixed(2)} (target <= ${FK_GRADE_MAX})`);
  console.log(`top-2000 coverage: ${percent.toFixed(1)}% (target >= ${COVERAGE_MIN}%)`);
  printOffList(offList);
  if (names.length > 0) {
    const shown = names.map(([w, c]) => (c > 1 ? `${w} (${c})` : w)).join(', ');
    console.log(`names, not counted: ${shown}`);
  }

  const failures = [];
  if (wordCount < WORD_COUNT_MIN || wordCount > WORD_COUNT_MAX) {
    failures.push(`word count ${wordCount} is outside ${WORD_COUNT_MIN}-${WORD_COUNT_MAX}`);
  }
  if (grade > FK_GRADE_MAX) {
    failures.push(`Flesch-Kincaid grade ${grade.toFixed(2)} exceeds ${FK_GRADE_MAX}`);
  }
  if (percent < COVERAGE_MIN) {
    failures.push(`top-2000 coverage ${percent.toFixed(1)}% is below ${COVERAGE_MIN}%`);
  }
  return failures;
}

// --- Main --------------------------------------------------------------

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    fail('usage: node scripts/check-article.mjs <article.json|source.txt>');
  }

  const absolutePath = resolve(process.cwd(), inputPath);
  if (!existsSync(absolutePath)) {
    fail(`file not found: ${inputPath}`);
  }

  const ext = extname(absolutePath).toLowerCase();
  const top2000 = loadTop2000();
  let failures = [];

  if (ext === '.json') {
    const raw = readFileSync(absolutePath, 'utf8');
    let article;
    try {
      article = JSON.parse(raw);
    } catch (err) {
      fail(`could not parse ${inputPath} as JSON: ${err.message}`);
    }
    if (!Array.isArray(article.body) || article.body.length === 0) {
      fail(`${inputPath} has no "body" array of paragraph strings`);
    }
    const id = article.id || basename(absolutePath, ext);
    const text = article.body.join(' ');
    failures = report(inputPath, text, top2000);

    const rawSourcePath = join(root, 'content-raw', `${id}.txt`);
    if (existsSync(rawSourcePath)) {
      const rawSource = readFileSync(rawSourcePath, 'utf8');
      const mismatches = checkProvenance(article.body, rawSource);
      if (mismatches.length === 0) {
        console.log(`provenance: every sentence matches content-raw/${id}.txt`);
      } else {
        console.log(`provenance: ${mismatches.length} sentence(s) not found in content-raw/${id}.txt`);
        for (const { paragraphIndex, sentence } of mismatches) {
          console.log(`  paragraph ${paragraphIndex}: "${sentence}"`);
        }
        failures.push('body contains text not present in the raw source');
      }
    } else {
      console.log(`provenance: unverified, content-raw/${id}.txt does not exist`);
    }
  } else if (ext === '.txt') {
    const text = readFileSync(absolutePath, 'utf8');
    failures = report(inputPath, text, top2000);
    console.log('provenance: not applicable, this is a raw source file');
  } else {
    fail(`unsupported file type "${ext}", expected .json or .txt`);
  }

  console.log(failures.length ? `\nFAIL: ${failures.join('; ')}` : '\nPASS');
  process.exit(failures.length ? 1 : 0);
}

main();
