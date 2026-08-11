# Zephyr — Implementation Plan

Status: ✅ done · 🔶 partial · ⬜ todo

| WP | Title | Status |
|-----|--------------------------------------|----|
| WP0 | Repo scaffold | ✅ |
| WP1 | Auto-scroll reader engine | ✅ |
| WP2 | Content schema & daily loader | 🔶 |
| WP3 | Quiz & results flow | ⬜ |
| WP4 | Streak, calibration & adaptive speed | ⬜ |
| WP5 | PWA: installable & offline | ⬜ |
| WP6 | Share card & WhatsApp loop | ⬜ |
| WP7 | Daily notifications | ⬜ |
| WP8 | Curation toolkit | ⬜ |
| WP9 | Deploy & polish | ⬜ |

**To delegate a package:** "Read CLAUDE.md and PLAN.md, then implement WP\<n\> only. Update the PLAN.md status table when done." Packages are ordered by dependency; do them roughly in order (WP6/WP7/WP8 are independent of each other).

---

## WP0 — Repo scaffold ✅

Done in the initial commit: repo layout, README, CLAUDE.md, this plan, content-sources doc, working reader skeleton with a public-domain sample article.

## WP1 — Auto-scroll reader engine ✅

Done in `site/app.js`:
- `requestAnimationFrame` + `translateY` scrolling (constant speed; native scroll is not used because it can't hold a steady rate).
- Speed model: `px/s = wpm / 60 × trackHeight / wordCount`.
- Play/pause (tap the text or the button), ±10 wpm controls (persisted to localStorage), progress bar, focus band with fade masks, 3-2-1 countdown, auto-pause when the tab is hidden, done screen with measured actual WPM.

Known gaps (fold into WP9 polish): keyboard shortcuts exist (space, arrows) but need visible affordance; `prefers-reduced-motion` should offer a paragraph-step mode instead of smooth scroll.

## WP2 — Content schema & daily loader 🔶

Schema (see `site/content/articles/sample.json`): `id`, `title`, `source{author,origin,license,url}`, `body[]` (paragraph strings), `previewWords[{word,gloss}]`, `quiz[{q,options[],answer}]`.

Done: loader fetches `content/articles/<local-date>.json`, falls back to `sample.json` with a visible "sample" notice; today card shows title, word count, estimated seconds, preview words.

Remaining:
- [ ] `site/content/index.json` — array of available article dates. Needed by WP5's service worker for precaching. Keep it a plain sorted array of `"YYYY-MM-DD"` strings.
- [ ] "No article today" empty state (calm, one sentence, no error styling) when neither today's file nor sample exists.
- [ ] Guard: if the article JSON has no `source` block, refuse to render and show a dev warning (enforces CLAUDE.md rule 4).

Acceptance: with a dated file for today present, it loads; without it, sample loads with notice; with neither, the empty state shows; an article missing `source` never renders.

## WP3 — Quiz & results flow ⬜

After the scroll finishes, quiz the reader, then show results.

- [ ] Quiz screen: 2–3 single-choice questions from `article.quiz`, one at a time, large tap targets. Instant feedback on tap (correct = accent highlight, wrong = show the right one), auto-advance after ~600 ms.
- [ ] Results screen replaces the current bare done screen: actual WPM (words ÷ active reading time), comprehension `n/N`, source attribution line, "See you tomorrow" close state.
- [ ] Wire the flow: today card → countdown → reader → quiz → results. "Read again" moves to results-page secondary action (re-read does not re-quiz).

Acceptance: full flow works on a 390 px-wide viewport; refreshing mid-quiz restarts the day cleanly; quiz answers are never revealed in the DOM before the user taps.

## WP4 — Streak, calibration & adaptive speed ⬜

localStorage only (no accounts). Keys, all namespaced `zephyr.`:
- `zephyr.profile` → `{ currentWpm }`
- `zephyr.history` → array of `{ date, wpm, score, total, words }`
- `zephyr.streak` → `{ count, lastDate }`

- [ ] First run: article plays at 110 wpm with free speed adjustment; the wpm the user ends at becomes `currentWpm`.
- [ ] Adaptive rule, applied when the quiz is submitted: score ≥ 80% → tomorrow +5%; < 60% → −5%; otherwise hold. Clamp to 80–300. Round to nearest 5. Show "Tomorrow: NNN wpm" on results.
- [ ] Streak: consecutive local dates with a completed quiz; a missed day resets to 0 on next completion. Show on today card and results.
- [ ] Same-day reopen after completion → show that day's results, not the article (protect the one-a-day scarcity).

Acceptance: simulate three days by editing localStorage dates; streak and wpm progression behave per the rules above.

## WP5 — PWA: installable & offline ⬜

- [ ] `manifest.webmanifest`: name "Zephyr", short_name "Zephyr", standalone, theme/background colors from `app.css` tokens, 192/512 icons (simple wind-mark SVG rendered to PNG; place in `site/icons/`).
- [ ] `sw.js`: precache app shell; on activation fetch `content/index.json` and cache today's + tomorrow's articles. Cache-first for shell, network-first for `index.json`.
- [ ] iOS meta tags (`apple-mobile-web-app-*`), installability passes Lighthouse.

Acceptance: install on Android Chrome and iOS Safari (Add to Home Screen); airplane-mode reload still opens today's article.

## WP6 — Share card & WhatsApp loop ⬜

Zero-infrastructure social loop for two friends.

- [ ] Share text generator on results: `ZEPHYR · Day <n>` / `🌬️ <wpm> wpm · <score>/<total> · streak <k>` / site URL.
- [ ] Share button: Web Share API when available; fallback buttons "WhatsApp" (`https://wa.me/?text=<urlencoded>`) and "Copy".

Acceptance: on a phone, one tap from results opens WhatsApp with the prefilled card.

## WP7 — Daily notifications ⬜

Three options, in recommended order. Ship A only when WP5 exists.

- **B. CallMeBot (do first — 5-minute personal hack).** Each friend sends the one-time activation message to CallMeBot's WhatsApp number to get a personal API key. A scheduled job (GitHub Actions cron on this repo, or a Cloudflare Worker cron) sends a GET to `https://api.callmebot.com/whatsapp.php?phone=<E164>&apikey=<key>&text=<msg>` at the chosen local hour. Phone numbers and keys live in repo/worker secrets, never in code. Unofficial service: fine for two friends, not a foundation for a public product.
- **A. Web Push (the real product feature).** Requires WP5. Tiny Cloudflare Worker + KV: stores push subscriptions (with each subscriber's UTC offset captured at subscribe time), cron trigger fires hourly and pushes to subscribers whose local time matches their chosen hour. VAPID keys in Worker secrets. Note: iOS delivers web push only to installed PWAs (16.4+).
- **C. Meta WhatsApp Business Cloud API (only if this becomes a public product).** Official: Meta developer app + WhatsApp Business Account + a registered number + an approved utility template for business-initiated daily messages. Per-message cost is trivial at small scale; setup is the real cost.

Acceptance (B): both phones get the daily message at the configured hour for 3 consecutive days.

## WP8 — Curation toolkit ⬜

Node scripts that make the human curation workflow fast and enforce the content rules mechanically.

- [ ] `scripts/check-article.mjs <file.json|file.txt>`: prints word count, Flesch-Kincaid grade, top-2000 coverage %, and the list of off-list words. Fails (exit 1) if word count outside 220–320, FK > 6, or coverage < 95%.
- [ ] Word list: source an openly licensed top-2000 English frequency list (NGSL or equivalent — **verify its licence before vendoring**) into `scripts/data/top2000.txt`, one lemma per line, with a source note at the top.
- [ ] `scripts/new-article.mjs <source.txt> --date YYYY-MM-DD --title ... --author ... --license ... --url ...`: scaffolds a dated article JSON with the body split into paragraphs and empty `previewWords`/`quiz` slots, and appends the date to `content/index.json`.
- [ ] Provenance check inside `check-article.mjs`: keep the untrimmed source text in `content-raw/<id>.txt` (repo root, not deployed). Verify every sentence of `body` appears verbatim in the raw source — deletions-only editing, enforced by machine. This is the technical enforcement of the "no LLM prose" rule.
- [ ] Document the weekly batch routine at the top of `docs/content-sources.md`: collect → trim (LLM may assist, deletions only) → run checker → write quiz/glosses (LLM may draft, human approves) → schedule.

Acceptance: running the checker on `sample.json` produces a report (the sample is allowed to fail thresholds — it's a schema demo); `new-article.mjs` output passes JSON schema and loads in the app.

## WP9 — Deploy & polish ⬜

- [ ] Deploy `site/` to Cloudflare Pages (no build command, output dir = `site/`) or GitHub Pages via Actions. Custom domain later.
- [ ] Accessibility pass: visible focus states, reduced-motion paragraph-step mode, contrast check in both themes.
- [ ] Lighthouse: PWA and accessibility ≥ 90.
- [ ] Optional: Cloudflare Web Analytics (cookieless) — page views only, no personal data.
