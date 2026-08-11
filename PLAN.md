# Zephyr implementation plan

Status marks: done, partial, todo.

| WP | Title | Status |
| --- | --- | --- |
| WP0 | Repo scaffold | done |
| WP1 | Auto-scroll reader engine | done |
| WP2 | Content schema and daily loader | partial |
| WP3 | Quiz and results flow | todo |
| WP4 | Streak, calibration and adaptive speed | todo |
| WP5 | PWA, installable and offline | todo |
| WP6 | Share card and WhatsApp loop | done |
| WP7 | Daily notifications | todo |
| WP8 | Curation toolkit | todo |
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

## WP2, content schema and daily loader (partial)

The schema lives in `site/content/articles/sample.json`: `id`, `title`, `source` with author, origin, license and url, `body` as an array of paragraph strings, `previewWords` as word and gloss pairs, and `quiz` as question, options and answer index.

Working already: the loader fetches `content/articles/<local-date>.json` and falls back to `sample.json` with a visible notice, and the today card shows the title, word count, estimated seconds and preview words.

Three things remain.

- [ ] `site/content/index.json`, a sorted array of the dates that have articles. The service worker in WP5 needs it to decide what to precache.
- [ ] A "no article today" screen for when neither today's file nor the sample exists. Keep it calm and short, and do not style it as an error.
- [ ] A guard that refuses to render an article whose JSON has no `source` block, with a warning in the console. This turns rule 4 in CLAUDE.md into something the code enforces.

Acceptance: a dated file for today loads; without it the sample loads and says so; without either the empty screen appears; an article missing `source` never renders.

## WP3, quiz and results flow

Once the scroll finishes, quiz the reader and then show results.

The visual specification for both screens is in `docs/design.md` under Screens. Build to it rather than improvising.

- [ ] Quiz screen, showing two or three single-choice questions from `article.quiz` one at a time, with tap targets big enough for a phone. Feedback lands on tap, with the accent color for a correct answer and the right option revealed for a wrong one, then it advances after about 600 ms.
- [ ] Results screen replacing the current bare done screen. It shows the measured speed as words divided by active reading time, the comprehension score as `n/N`, the source attribution, and a closing line.
- [ ] Wire the flow together: today card, countdown, reader, quiz, results. "Read again" moves to the results page as a secondary action, and re-reading does not re-quiz.

Acceptance: the whole flow works on a 390 px wide viewport; refreshing during the quiz restarts the day cleanly; the answers are absent from the DOM until the user taps.

## WP4, streak, calibration and adaptive speed

Everything sits in localStorage and there are no accounts. Three keys, all prefixed `zephyr.`: `profile` holding the current wpm, `history` as an array of date, wpm, score, total and words, and `streak` holding a count and the last completed date.

- [ ] First run plays at 110 wpm with free speed adjustment, and whatever speed the reader settles on becomes their baseline.
- [ ] Adaptive rule applied when the quiz is submitted. A score of 80 percent or better adds 5 percent to tomorrow, below 60 percent takes off 5 percent, and anything between holds steady. Clamp to the range 80 to 300 and round to the nearest 5. The results page announces tomorrow's speed.
- [ ] Streak counts consecutive local dates with a completed quiz. A missed day resets it to zero on the next completion. It appears on the today card and the results page.
- [ ] Reopening after finishing on the same day shows that day's results rather than the article, which protects the one-a-day scarcity.

Acceptance: edit the dates in localStorage to simulate three days and confirm the streak and the speed progression follow the rules above.

## WP5, PWA, installable and offline

- [ ] `manifest.webmanifest` with the name Zephyr, `standalone` display, theme and background colors taken from the tokens in `app.css`, and 192 and 512 pixel icons. Draw a simple wind mark as SVG, render it to PNG, and put both in `site/icons/`.
- [ ] `sw.js` precaches the app shell, then on activation reads `content/index.json` and caches today's and tomorrow's articles. Cache-first for the shell and network-first for `index.json`.
- [ ] The `apple-mobile-web-app-*` meta tags, and installability passing Lighthouse.

Acceptance: it installs from Android Chrome and from iOS Safari via Add to Home Screen, and reloading in airplane mode still opens today's article.

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

## WP7, daily notifications

Three options, listed in the order worth considering them. Option A needs WP5 first.

Option B, CallMeBot, is the one to do first because it takes five minutes. Each friend sends the activation message from their own WhatsApp to CallMeBot's number and receives a personal API key in reply. A scheduled job, either a GitHub Actions cron in this repo or a Cloudflare Worker cron, then sends a GET to `https://api.callmebot.com/whatsapp.php?phone=<E164>&apikey=<key>&text=<msg>` at the chosen hour. Phone numbers and keys belong in repo or Worker secrets and never in code. The service is unofficial and run by one person, which is fine for two friends and unsuitable as the foundation of a public product.

Option A, Web Push, is the real product feature and requires WP5. A small Cloudflare Worker with KV stores the push subscriptions along with each subscriber's UTC offset captured at subscribe time. An hourly cron fires and pushes to whoever's local time matches their chosen hour. VAPID keys go in Worker secrets. On iOS, web push reaches installed PWAs only, from version 16.4.

Option C, the Meta WhatsApp Business Cloud API, is worth setting up only if this becomes a public product. It needs a Meta developer app, a WhatsApp Business Account, a registered number, and an approved utility template before it can send business-initiated messages. The per-message cost is negligible at this scale and the setup is the real expense.

Acceptance for option B: both phones receive the daily message at the configured hour for three consecutive days.

## WP8, curation toolkit

Node scripts that speed up human curation and turn the content rules into something a machine checks.

- [ ] `scripts/check-article.mjs <file.json|file.txt>` prints the word count, the Flesch-Kincaid grade, the top-2000 coverage percentage, and the list of off-list words. It exits 1 when the word count falls outside 220 to 320, the grade exceeds 6, or coverage drops below 95 percent.
- [ ] An openly licensed top-2000 English frequency list, NGSL or equivalent, vendored into `scripts/data/top2000.txt` as one lemma per line with a source note at the top. Verify the licence before committing it.
- [ ] `scripts/new-article.mjs <source.txt> --date --title --author --license --url` scaffolds a dated article JSON with the body split into paragraphs and empty slots for preview words and quiz, then appends the date to `content/index.json`.
- [ ] A provenance check inside `check-article.mjs`. The untrimmed source text lives in `content-raw/<id>.txt`, which stays in the repo but outside `site/` so it never ships. The check verifies that every sentence of `body` appears verbatim in the raw source, which makes deletion-only editing something the machine enforces rather than something a person has to trust.
- [ ] The weekly batch routine documented at the top of `docs/content-sources.md`.

The provenance check matters more than its position in this list suggests. While a person is watching, deletion-only editing holds up on good faith. Once a scheduled job does the trimming unattended, that script is the only thing standing between a trimmed excerpt and a quietly paraphrased one. Any move toward automation should pull this package forward.

Acceptance: the checker produces a report for `sample.json`, which is allowed to fail the thresholds since it exists to demonstrate the schema; and the output of `new-article.mjs` validates and loads in the app.

## WP9, deploy and polish (partial)

Live at <https://zephyr-8w8.pages.dev>, hosted on Cloudflare Pages under the project `zephyr`, with the code on GitHub at `AndersonTsaiTW/zephyr-english`.

Cloudflare rather than GitHub Pages for two reasons that show up later. WP7's Web Push option needs a Worker with KV, and on Cloudflare that can sit behind the same domain as a route rather than a second origin with CORS between them. And `site/_headers` is honored here, which is what keeps a service worker and a day-old article from being served stale; GitHub Pages has no equivalent.

The project is connected to the GitHub repository, so **pushing to `main` deploys**. Build command is empty, build output is `site`, and root directory is the repo root. Nothing runs at build time; Cloudflare copies `site/` and applies `site/_headers`.

Do not also run `wrangler pages deploy` by hand now that Git is connected. Mixing the two makes the deployment list ambiguous about which commit is live.

Still to do:

- [ ] An accessibility pass covering visible focus states, the reduced-motion paragraph-step mode, and contrast in both themes.
- [ ] Lighthouse PWA and accessibility scores of 90 or better.
- [ ] Optionally, Cloudflare Web Analytics, which is cookieless, for page views and nothing personal.
