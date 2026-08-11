# Zephyr — rules for AI coding sessions

Zephyr is a daily English reading trainer: one article per day, auto-scrolled at a controlled WPM, followed by a short quiz. Audience: two adult English learners preparing for CELPIP (Canadian English test). `PLAN.md` is the source of truth for what to build next.

## Hard rules (never break these)

1. **No LLM-authored article text.** Article `body` content must be an excerpt of a human-written, properly licensed source (see `docs/content-sources.md`). You may TRIM a source text (delete sentences or words), but never add, rewrite, or paraphrase body sentences. You MAY write: quiz questions, glosses, UI copy, code, docs.
2. **UI language is English.** All user-facing copy is simple English (one user speaks Spanish, the other Chinese — English is the shared language and the product's subject). Glosses are simple English definitions, not translations.
3. **No frameworks, no build step.** Vanilla HTML/CSS/JS, static JSON content. The `site/` folder must stay deployable as-is to any static host.
4. **Every article JSON carries its `source` block** (author, origin, license, url). No source block → the article doesn't ship.

## Conventions

- Site code: `site/` (`index.html`, `app.css`, `app.js`). Keep `app.js` a single file until that genuinely hurts.
- Articles: `site/content/articles/YYYY-MM-DD.json` — see `sample.json` for the schema. The app resolves "today" from the device's local date and falls back to `sample.json` in dev.
- Article targets: 220–320 words · Flesch-Kincaid grade ≤ 6 · ≥95% of tokens within a top-2000 frequency list (checker script comes in WP8).
- Scripts: Node, ESM, zero dependencies unless a WP explicitly allows one. They live in `scripts/`.
- Commit style: short imperative subject referencing the WP, e.g. `WP3: quiz flow`.

## Workflow

- Do one work package from `PLAN.md` per session unless asked otherwise. Read its acceptance criteria first; update the status table when done.
- Test by serving `site/` locally (`npx serve site`) — `fetch()` needs HTTP, not `file://`.
- Don't add analytics, accounts, or backends unless the WP explicitly says so.
