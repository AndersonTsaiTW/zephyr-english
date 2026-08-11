# Zephyr implementation plan

Status marks: done, partial, todo.

| WP | Title | Status |
| --- | --- | --- |
| WP0 | Repo scaffold | done |
| WP1 | Auto-scroll reader engine | done |
| WP2 | Content schema and daily loader | done |
| WP3 | Quiz and results flow | done |
| WP4 | Streak, calibration and adaptive speed | done |
| WP5 | PWA, installable and offline | done |
| WP6 | Share card and WhatsApp loop | done |
| WP7 | Daily notifications | done |
| WP8 | Curation toolkit | done |
| WP9 | Deploy and polish | partial |

To hand a package to a session:

> Read CLAUDE.md and PLAN.md, then implement WP\<n\> only. Update the PLAN.md status table when done.

## Dependencies and parallel work

The product is three subsystems that only meet through git commits, and the packages parallelize along those seams. Three lanes can run at once.

```text
Lane 1  reader      WP2 -> WP3 -> WP4 -> WP6      strictly serial
Lane 2  curation    WP8                           safe to start now
Lane 3  delivery    WP7-B -> WP5 -> WP7-A         safe to start now
                          everything -> WP9
```

Lane 1 cannot be split. All four packages rewrite the same parts of `site/app.js` and `index.html`. WP3 and WP4 both replace `finish()`, and WP4's rule fires when a quiz is submitted, so it has nothing to hook into until WP3 exists. WP6 attaches a share button to the results screen that WP3 builds.

Lane 2 touches only `scripts/` and `content-raw/` and overlaps with nothing.

Lane 3 is nearly as clean. WP7 option B adds one GitHub Actions workflow file. WP5 adds `manifest.webmanifest`, `sw.js` and `site/icons/`, and its only shared edit is a few meta tags in the `<head>`. Its service worker reads the `content/index.json` that WP2 produces, so running it after WP2 avoids a stub.

WP9 comes last because it touches everything.

If two sessions run at once, the rule that matters is that only one of them may edit `site/app.js`. Beyond that, give each lane its own branch, or its own `git worktree` if they run simultaneously.

## WP0, repo scaffold (done)

The initial commit set up the repo layout, the README, CLAUDE.md, this plan, the content sources document, and a working reader with one public domain sample article.

## WP1, auto-scroll reader engine (done)

`site/app.js` drives the scroll with `requestAnimationFrame` and `translateY`. Native scrolling is not used because it cannot hold a steady rate. The speed model is `px/s = wpm / 60 × trackHeight / wordCount`.

Working already: play and pause by tapping the text or the button, speed controls in steps of 10 wpm persisted to localStorage, a progress bar, the focus band with fade masks, a 3-2-1 countdown, automatic pause when the tab is hidden, and a done screen showing the measured speed.

Two gaps roll into WP9. Keyboard shortcuts work (space and the arrow keys) but nothing on screen says so. And `prefers-reduced-motion` should offer a paragraph-step mode rather than just disabling the animation.

## WP2, content schema and daily loader (done)

The schema lives in `site/content/articles/sample.json`: `id`, `title`, `source` with author, origin, license and url, `body` as an array of paragraph strings, `previewWords` as word and gloss pairs, and `quiz` as question, options and answer index.

The loader fetches `content/articles/<local-date>.json`, falls back to `sample.json` with a visible notice, and shows the empty screen when neither exists. `site/content/index.json` lists the dates that have articles and is what the service worker reads to decide what to precache. `new-article.mjs` appends to it.

An article missing a `source` block, or missing a body, is refused outright with a console warning and a plain explanation on screen. That turns rule 4 from a promise into behaviour.

## WP3, quiz and results flow (done)

The scroll ends, the quiz runs, then the results screen. Both are built to the specification in `docs/design.md`.

One question fills the screen at a time with a `1 / 3` counter above it. Tapping an option locks the rest, marks the correct one in the accent colour, dims a wrong pick, and moves on after 700 ms. The correct index stays inside a JavaScript closure and never reaches the markup, so the answer key is not one devtools panel away. The smoke test asserts that.

Results lead with the measured speed as the hero number, then the score, the streak, tomorrow's pace, the source credit, and the share controls. "Read again" is a quiet text button underneath, and a second read does not re-quiz.

## WP4, streak, calibration and adaptive speed (done)

Everything sits in localStorage under the `zephyr.` prefix: `profile` holds the current wpm, `history` is the array of finished days, `streak` holds a count and the last completed date. No accounts, no server.

The first read starts at 110 wpm and the pace the reader settles on becomes their baseline. After each quiz, 80 percent or better adds 5 percent to tomorrow, below 60 percent takes 5 percent off, and the middle holds steady, clamped to 80 to 300 and rounded to the nearest 5.

The streak counts consecutive local dates. `liveStreak()` reports zero once the last completed day is older than yesterday, so a lapsed streak stops being displayed without needing a background job to expire it.

Reopening after finishing shows that day's result rather than the article, which is what keeps one article a day meaning one article a day.

## WP5, PWA, installable and offline (done)

`manifest.webmanifest` declares a standalone app with 192 and 512 pixel icons plus a maskable variant. The wind mark is `site/icons/zephyr.svg`, also used as the favicon, rasterised to PNG for the launcher.

`sw.js` precaches the shell on install. On activate it drops old caches, then reads `content/index.json` and caches today's and tomorrow's articles, so crossing midnight without signal still works. Content is network first with a cache fallback because it changes daily; the shell is cache first because it only changes when `CACHE` is bumped at deploy time.

Registration is skipped outside a secure context, so local development over plain http behaves normally.

Remaining to confirm on real hardware: Add to Home Screen on iOS Safari, and an airplane-mode reload.

## WP6, share card and WhatsApp loop (done)

A social loop for two friends that needs no infrastructure at all. Nobody subscribes to anything: one reader taps share, the other gets a real WhatsApp message from a friend, and that message is the reminder.

`buildShareText()` assembles the card from `state.lastResult`. It was built ahead of WP3 and WP4, so it includes only the fields that exist and grows as they land:

```text
now          ZEPHYR · 2026-08-11 / 156 wpm / <url>
after WP3    ZEPHYR · 2026-08-11 / 156 wpm · 3/3 correct / <url>
after WP4    ZEPHYR · Day 12 / 156 wpm · 2/3 correct · streak 12 / <url>
```

WP3 populates `score` and `total` on `state.lastResult`, and WP4 populates `day` and `streak`. Neither needs to touch the share code.

The site address comes from `location`, so it is correct wherever the app is deployed without anything to configure.

Where `navigator.share` exists the screen shows a single Share button and the platform sheet handles the rest. Where it does not, it shows a WhatsApp button opening `https://wa.me/?text=<urlencoded>` and a Copy button. Copy uses the clipboard API and falls back to a selection copy outside a secure context, and the button reports what happened before reverting.

Remaining for WP3: move these controls onto the real results screen, keeping Share primary and "Read again" secondary.

## WP7, daily notifications (done)

`.github/workflows/daily-nudge.yml` sends each reader a short WhatsApp message through CallMeBot on a daily cron, with manual dispatch for testing.

It is deliberately inert until configured. With no `NUDGE_*` secrets set it reports that nothing is configured and exits 0, so it never fails a run or sends failure mail before anyone has set it up. The setup steps for each reader are in the file's header comment.

CallMeBot has no notion of a subscriber. Each reader activates it from their own phone, receives a key, and passes that key to whoever holds the repo secrets. A key only authorises messaging the phone that activated it, so passing it along grants nothing else. It suits two friends and does not generalise, which is why Web Push stays the eventual answer: it needs no key exchange, a reader subscribes with one tap, and it arrives free with the PWA that WP5 already built.

## WP8, curation toolkit (done)

Two scripts turn the content rules into something a machine checks.

`scripts/new-article.mjs <source.txt> --date --title --author --license --url` splits a source into paragraphs, scaffolds `site/content/articles/<date>.json` with empty preview and quiz slots, copies the untrimmed text to `content-raw/<date>.txt`, and adds the date to `content/index.json`. It refuses to overwrite an existing article.

`scripts/check-article.mjs <file>` reports word count, Flesch-Kincaid grade, top-2000 coverage and the off-list words, and exits 1 when any threshold is missed. Coverage matching strips regular suffixes and maps common irregular forms, because the word list holds lemmas only and `was` or `went` would otherwise swamp the report.

The provenance check is the part that matters. When `content-raw/<id>.txt` exists, every sentence of `body` must appear in it verbatim after whitespace is normalised, and any sentence that does not is named and fails the run. Deleting from a source passes. Rewriting a single sentence does not, and this was tested both ways. While a person is watching, deletion-only editing holds on good faith; once trimming is delegated, this script is the only thing between a trimmed excerpt and a quietly paraphrased one.

The word list is the New General Service List 1.2, the first 2000 lemmas by frequency rank, under CC BY-SA 4.0 with the attribution in the file header. Note for anyone re-fetching it: the `.org` domain that older references cite no longer belongs to the project and now redirects to unrelated content. The live source is `newgeneralservicelist.com`.

One known quirk: NGSL carries no entries for spelled-out numbers, so `two` and `three` always appear as off-list words. That is the source list's shape, not a fault in the checker.

## WP9, deploy and polish (partial)

Live at <https://zephyr-8w8.pages.dev>, hosted on Cloudflare Pages under the project `zephyr`, with the code on GitHub at `AndersonTsaiTW/zephyr-english`.

Cloudflare rather than GitHub Pages for two reasons that show up later. WP7's Web Push option needs a Worker with KV, and on Cloudflare that can sit behind the same domain as a route rather than a second origin with CORS between them. And `site/_headers` is honored here, which is what keeps a service worker and a day-old article from being served stale; GitHub Pages has no equivalent.

The project is connected to the GitHub repository, so **pushing to `main` deploys**. Build command is empty, build output is `site`, and root directory is the repo root. Nothing runs at build time; Cloudflare copies `site/` and applies `site/_headers`.

Do not also run `wrangler pages deploy` by hand now that Git is connected. Mixing the two makes the deployment list ambiguous about which commit is live.

Done since: every color pair clears WCAG AA in both themes, checked by `scripts/check-contrast.mjs` rather than by eye. Focus is visible on every control. Reduced motion switches the reader to advancing a paragraph at a time, holding each for the time it would have taken to scroll past, which keeps the pacing without anything sliding; simply disabling the animation would have removed the product. The keyboard hint is shown only where a keyboard exists.

Still to do:

- [ ] Lighthouse PWA and accessibility scores of 90 or better, run against the deployed site.
- [ ] Confirm Add to Home Screen and an airplane-mode reload on real Android and iOS hardware.
- [ ] Optionally, Cloudflare Web Analytics, which is cookieless, for page views and nothing personal.

## What is left overall

The software is finished. What the product still lacks is articles. `site/content/index.json` is empty, so every visit falls back to the Aesop sample, and the first real batch means sitting down with the sources in `docs/content-sources.md` and running the two scripts. That is the work that turns this from a working toy into something worth opening daily.
