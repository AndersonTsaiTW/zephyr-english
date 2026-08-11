# Zephyr

One short English article a day, scrolling by itself at a set speed. You cannot scroll back, so you keep up. At the end you answer two or three questions, see your reading speed and your streak, and the day is done. It takes two or three minutes.

It is built for adult learners preparing for CELPIP. The texts are written by people, drawn mostly from Canadian sources, on everyday topics.

## The rule about content

Article bodies are never written by an LLM. Every body text is an excerpt from a licensed, human-written source, and the sources are listed in [docs/content-sources.md](docs/content-sources.md). A model may trim an excerpt by deleting sentences, draft quiz questions and word glosses, and write code. It may not write prose that ends up as an article body.

## Running it

The site is plain HTML, CSS and JavaScript. There is nothing to install and nothing to build.

```
npx serve site
```

Open the address it prints. Loading `index.html` straight from the filesystem will not work, because the article files are fetched over HTTP.

## What is where

`site/` is the deployable static site. Point any static host at that folder and it works.

`site/content/articles/` holds one JSON file per day, named `YYYY-MM-DD.json`, plus `sample.json` for development.

`content-raw/` keeps the untrimmed source text behind each article. It stays in the repo so the provenance check in WP8 can verify that every published sentence appears verbatim in its source. It is outside `site/`, so it never ships to the browser.

`scripts/` will hold the curation tools, meaning the readability checker and the article scaffolder. They arrive in WP8.

`docs/content-sources.md` records where articles come from, what licence each source carries, and how to attribute it.

`PLAN.md` breaks the work into packages, WP0 through WP9.

`CLAUDE.md` holds the rules and conventions for AI coding sessions.

## Working on it

Take the next unchecked package in [PLAN.md](PLAN.md) and do that one. Each package is self-contained and carries its own acceptance criteria, so a session can pick one up without any other context:

> Read CLAUDE.md and PLAN.md, then implement WP3 only. Update the PLAN.md status table when done.
