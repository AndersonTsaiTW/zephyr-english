# Zephyr

Live at **<https://zephyr-8w8.pages.dev>**

One short English article a day. The text scrolls upward by itself at a set speed, so you cannot stop and re-read a sentence. You keep up, or you miss it. When the article ends you answer two or three questions to show you followed it, and then you see your reading speed and how many days in a row you have done this. Two or three minutes, then it is over until tomorrow.

It was built for two adults studying for CELPIP, the English test used for Canadian immigration. The articles are real writing by real people, mostly from Canadian sources, about ordinary things like renting a home or getting a flu shot.

## Why scrolling text

Most people learning a language read slowly because their eyes keep flicking back to a word they already passed. Reading the same clause three times is a hard habit to notice, let alone stop.

If the text moves away on its own, going back stops being an option. You are pushed to read forwards, which is how a fluent reader already reads. That only works when the article is easy enough that you do not need to look back, so the articles are kept deliberately simple and checked by a script.

Speed is only allowed to rise when comprehension holds. Get most of the questions right and tomorrow starts five percent faster. Get them wrong and it slows down. That rule is what separates this from the speed-reading claims that do not survive contact with evidence.

## The rule about article text

No article is written by a language model. Every one is real text lifted from a source we are allowed to reuse, and those sources are listed in [docs/content-sources.md](docs/content-sources.md).

A model may shorten a source by deleting sentences, and may write the quiz questions, the word definitions and the code. It may not write, reword or simplify a sentence that ends up in an article.

This is enforced by a script rather than by good intentions. The untouched original of each article is kept in `content-raw/`, and `scripts/check-article.mjs` verifies that every published sentence appears in it word for word. Deleting passes. Rewriting fails and names the sentence.

## Running it locally

Plain HTML, CSS and JavaScript. Nothing to install, nothing to build.

```text
npx serve site
```

Open the address it prints. Double-clicking `index.html` will not work, because browsers do not let a page opened from your hard drive load other files.

## What is in each folder

`site/` is the website. It is uploaded exactly as it is, with nothing compiled.

`site/content/articles/` holds one file per day, named by date, plus `sample.json` which is shown when there is nothing scheduled for today.

`content-raw/` holds the full original text behind each article, before it was shortened. It is never published. It exists so the checking script has something to compare against.

`scripts/` holds small Node programs: one to set up a new article, one to check an article is easy enough and honestly sourced, one to check the colours are readable, and one to open the site in a browser and click through it.

`docs/design.md` covers colours, text sizes and what each screen should look like. `docs/content-sources.md` covers where articles come from and how to credit them.

`PLAN.md` is the work list. `AGENTS.md` is the guide for anyone working on the code.

## Adding an article

```text
node scripts/new-article.mjs source.txt --date 2026-08-12 \
  --title "..." --author "..." --license "..." --url "..."
node scripts/check-article.mjs site/content/articles/2026-08-12.json
```

The first command sets up the article file and saves a copy of the original. The second tells you whether it is short enough, easy enough, and faithful to its source. Then write the questions and the word definitions by hand, and commit.

## Working on the code

Take the next unfinished package in [PLAN.md](PLAN.md). Each one is self-contained, so a session can pick one up knowing nothing else:

> Read AGENTS.md and PLAN.md, then implement WP3 only. Update the PLAN.md status table when done.

Before calling anything finished, run `node scripts/smoke.mjs`. It opens the site in a real browser and reads an article through to the end. Twice now a change has passed every other check while the page came up blank for a human.
