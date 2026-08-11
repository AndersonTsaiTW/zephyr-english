# Working on Zephyr

## What this is

Zephyr shows you one short English article a day. The text scrolls upward on its own at a set speed, so you cannot stop and re-read a sentence. You just keep up. When the text runs out you answer two or three questions to show you understood it, and then you see how fast you read and how many days in a row you have done this.

The whole thing takes two or three minutes. That is the point. It is meant to be a small daily habit, not a study session.

Two people use it. Both are adults learning English for CELPIP, the English test used for Canadian immigration. One speaks Spanish, one speaks Chinese.

The idea behind it: most learners read slowly because their eyes keep jumping backwards to check a word they already passed. If the text physically moves away, you cannot jump back, and you are forced to read forwards the way a native speaker does. That only works if the article is easy enough that you do not need to look back. Hence the difficulty rules below.

`PLAN.md` lists the work in packages. Take the next unfinished one.

## Four rules you must not break

### 1. Never write the article text yourself

This is the most important rule in the project.

The `body` of an article has to be real text, written by a real person, copied from a source we are allowed to use. Those sources are listed in `docs/content-sources.md`.

You are allowed to shorten a source by deleting whole sentences or individual words. You are not allowed to add a sentence, reword a sentence, or rewrite something to make it simpler. If a passage is too hard, delete it and use a different one.

This is checked by a script, not left to trust. `scripts/check-article.mjs` compares every sentence you publish against the untouched original saved in `content-raw/`. Delete things and it passes. Change so much as a word order and it fails and names the sentence.

You can freely write everything else: the quiz questions, the word definitions, the buttons and labels, the code, and the documentation.

### 2. Write the interface in English

One reader speaks Spanish, the other Chinese, so English is the only language they share, and it is also the thing they are here to practise. Word definitions are short explanations in simple English, not translations.

### 3. No frameworks, no build step

Plain HTML, CSS and JavaScript. Articles are plain JSON files. The `site/` folder is uploaded exactly as it sits, and nothing is compiled or generated on the way. Cloudflare copies the folder and serves it.

### 4. Every article says where it came from

Each article file carries a `source` block naming the author, the publication, the licence and the link. The app refuses to display an article that is missing it, so this is not something you can forget.

## Where things live

```text
site/                     everything that gets published, and nothing else
  index.html app.css app.js
  _headers                tells Cloudflare how long browsers may cache files
  content/articles/       one file per day, named 2026-08-12.json
  content/articles/sample.json   shown when there is no article for today
  content/index.json      the list of dates that have an article
content-raw/              the original untrimmed text of each article
scripts/                  small Node programs, no libraries installed
docs/design.md            colours, type sizes and what each screen looks like
docs/content-sources.md   where articles come from and how to credit them
notes-zh/                 the owner's own notes in Chinese, not published
```

`content-raw/` is worth explaining. When you shorten a source into an article, the full original stays here. It is not published to the web. The checking script compares the published article against it. Without that copy, rule 1 could not be enforced.

## Check your work before you say you are done

```text
node scripts/smoke.mjs           opens the real site in a real browser
node scripts/check-contrast.mjs  checks every colour combination is readable
```

The first one matters more than it sounds. Twice now, a change passed every check we had, and the page still came up blank when a person opened it. Checking that the JavaScript parses, that the file downloads, and that the server returns "OK" all pass happily on a page showing nothing at all. Only opening it in a browser catches that.

So `smoke.mjs` opens the site in Chrome, clicks through a whole reading session, and checks that words actually appear on screen. If you add a screen, add checks for it.

## How to write code here

Keep the site as three files: `index.html`, `app.css`, `app.js`. One JavaScript file is fine at this size. Split it only when it genuinely gets in the way.

Read `docs/design.md` before you touch any screen. Colours come from named variables at the top of `app.css`. Never write an actual colour like `#FFFFFF` inside a rule for a button or a card, because that colour will be wrong in one of the two themes. Use the variable, and run the contrast checker afterwards.

Articles must be 220 to 320 words, score grade 6 or lower on the Flesch-Kincaid reading scale (roughly what a twelve year old reads comfortably), and use common words for most of their length, with the exact limits per level in `scripts/check-article.mjs`.

One note about that word list. It comes from a research project and is shared under a licence that says: use it freely, credit us, and if you change it, share your changed version on the same terms. The credit is the comment block at the top of the file. Practically, this means leave the file alone. Nothing else in this repository is affected by that licence.

Scripts are plain Node with no packages installed.

When testing locally, run `npx serve site` and open the address it prints. Opening `index.html` by double-clicking will not work, because browsers refuse to let a page loaded from your hard drive fetch other files.

Do not add tracking, user accounts, or a server unless a work package specifically asks for one.

There are no accounts and there should not be. Reading speed, streak and history live in localStorage on the reader's own device. Two things guard that. The app asks for persistent storage on load, which stops a browser discarding the data when space runs low or, on Safari, after a week untouched. And the backup button in the top bar exports everything as a block of text the reader can paste into another phone, so moving device does not need a sign-in.

What still loses the record: clearing site data by hand, and reading in a private window. Say so plainly if anyone asks rather than implying the data is safer than it is.

## Two bugs worth knowing about

Both of them looked identical from the outside. You opened the page and the article area was empty. Nothing in the code looked wrong either time, and both took hours to find.

The first was the reading panel growing taller than the window. Inside a flexible layout, an element will not shrink below the height of the text it contains unless you tell it `min-height: 0`. A long article pushed the panel past the bottom of the screen, and once the panel was exactly as tall as its own text, there was nothing left to scroll through, so the article reached its end on the first frame. Everything from `body` down to `.reader` now sets `min-height: 0`, and a new scrolling area will need it too.

The second was a countdown that would not leave. HTML's `hidden` attribute is supposed to hide an element, but a stylesheet saying that element is visible beats it. Our three-two-one overlay had such a style, so it sat on top of the article permanently, painted in the same colour as the panel behind it. That is why nothing looked broken. One line near the top of the stylesheet, `[hidden] { display: none !important; }`, gives the attribute its authority back. Hide things with the attribute and let that line do the work.

## Writing for people

Anything a person reads, meaning documentation, text on screen, and commit messages, should sound like a person wrote it. Avoid the habits that make writing feel machine-made: long dashes, lists of exactly three things that pad rather than inform, a bolded phrase followed by a colon used as a bullet, emoji used as decoration, and closing paragraphs that cheerfully restate what you just said.

Explain a term the first time you use it, or do not use it. A reader who has to look something up to follow your sentence has been failed by the sentence.

Vary your sentence length. The `humanizer` skill has the full list of things to avoid.

## Git and deploying

Commit messages start with the work package and say what changed in plain words, for example `WP3: quiz flow`. In the body, explain why the change was needed, not just what moved.

Pushing to `main` publishes the site to <https://zephyr-8w8.pages.dev> automatically, usually within a couple of minutes. Do not run `wrangler pages deploy` by hand, because then the deployment history no longer tells you which commit is actually live.

One warning from experience: right after a push, the old version is still being served, and every file still returns "OK". A successful download does not mean your change is live. Check that something you actually changed appears on the page.

## Running more than one session at once

The project splits into three parts that only touch each other through committed files, so three people or sessions can work at once:

```text
the reader itself       WP2, WP3, WP4, WP6      must be done in order
choosing articles       WP8                     independent
delivery and reminders  WP7, WP5                independent
```

The reader packages all edit the same parts of `app.js`, so they cannot be split up, and only one session may edit `site/app.js` at a time. Otherwise, give each line of work its own branch.
