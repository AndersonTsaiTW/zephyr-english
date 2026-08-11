# Zephyr

**Read with the wind.** One short English article a day, auto-scrolled at a controlled speed — you can't scroll back, you just keep up. Finish, answer two or three quick questions, see your WPM and your streak. Two to three minutes a day.

Built for adult English learners preparing for CELPIP: real human-written texts (Canadian sources first), timed reading pressure, everyday topics.

## The one rule about content

**Article bodies are never written by an LLM.** Every body text is an excerpt of a licensed, human-written source — public domain, CC BY, or Government of Canada terms (see [docs/content-sources.md](docs/content-sources.md)). LLMs may help trim excerpts (deletions only), write quiz questions and glosses, and write code — never prose that ends up as an article body.

## Run it

The site is plain HTML/CSS/JS — no build step, no dependencies.

```
npx serve site
# or: python -m http.server 8000 -d site
```

Open the printed localhost URL. (Opening `index.html` via `file://` won't work — article JSON is fetched over HTTP.)

## Repo layout

- `site/` — the deployable static site (this folder goes to Cloudflare Pages / GitHub Pages as-is)
- `site/content/articles/` — one JSON per day (`YYYY-MM-DD.json`) plus `sample.json` for dev
- `scripts/` — curation tools (readability checker, article scaffolder) — built in WP8
- `docs/content-sources.md` — where articles come from, licences, attribution rules
- `PLAN.md` — implementation plan broken into work packages (WP0–WP9)
- `CLAUDE.md` — rules and conventions for AI coding sessions

## Working on it

Pick the next unchecked work package in [PLAN.md](PLAN.md) and do exactly that. Each WP is self-contained with acceptance criteria, designed so any coding model can pick one up cold:

> Read CLAUDE.md and PLAN.md, then implement WP3 only. Update the PLAN.md status table when done.
