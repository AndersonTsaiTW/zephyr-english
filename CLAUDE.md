# Zephyr: rules for AI coding sessions

Zephyr is a daily English reading trainer. One article per day scrolls by itself at a controlled speed, and a short quiz follows. The readers are adult learners preparing for CELPIP, the Canadian English test. `PLAN.md` says what to build next and is the source of truth for scope.

## Rules that do not bend

1. No LLM-authored article text. An article `body` must be an excerpt of a human-written, properly licensed source, listed in `docs/content-sources.md`. You may trim a source text by deleting sentences or words. You may not add, rewrite, or paraphrase a body sentence. You are free to write quiz questions, glosses, UI copy, code and documentation.
2. The interface is in English. One reader speaks Spanish and the other Chinese, so English is both the shared language and the subject of the product. Glosses are short English definitions rather than translations.
3. No frameworks and no build step. Vanilla HTML, CSS and JavaScript, with static JSON for content. The `site/` folder has to stay deployable exactly as it is.
4. Every article JSON carries a `source` block with author, origin, licence and url. An article without one does not ship.

## Conventions

Site code lives in `site/` as `index.html`, `app.css` and `app.js`. Keep `app.js` in one file until splitting it genuinely helps.

Read `docs/design.md` before adding or changing any screen. It carries the color tokens, the type scale, the component specs and the layouts for screens that do not exist yet. Style through the tokens and never write a literal color in a component rule, because a literal only works in one theme. After touching a token, run `node scripts/check-contrast.mjs`, which fails if any pair drops below WCAG AA.

Articles live in `site/content/articles/YYYY-MM-DD.json`. The schema is whatever `sample.json` shows. The app works out today from the device's local date and falls back to `sample.json` during development.

An article should run 220 to 320 words, sit at Flesch-Kincaid grade 6 or below, and keep at least 95 percent of its tokens inside a top-2000 frequency list. The checker script that enforces this arrives in WP8.

Scripts are Node with ES modules and no dependencies, unless a work package says otherwise. They live in `scripts/`.

Commit subjects are short and imperative and name the package, as in `WP3: quiz flow`.

## Prose written for people

Documentation, UI copy and commit messages get read by humans, so avoid the usual AI writing tells: em dashes, three-part lists that pad rather than inform, bolded phrase followed by a colon as a bullet format, emoji as section markers, and cheerful closing paragraphs that restate what came before. Plain sentences of varying length. The `humanizer` skill has the full list.

## Workflow

Do one package from `PLAN.md` per session unless told otherwise. Read its acceptance criteria before starting and update the status table when you finish.

Test by serving `site/` over HTTP with `npx serve site`, because `fetch()` will not read `file://` URLs.

Run `node scripts/smoke.mjs` before calling a package done. It drives the real site in a real browser and reads an article end to end. Syntax checks, grep and HTTP status codes all pass happily on a page that renders blank, which is exactly how the two worst bugs so far reached production. Extend it when you add a screen.

Do not add analytics, accounts or backend services unless the package explicitly calls for them.
