# Working on Zephyr

Zephyr is a daily English reading trainer. One article a day scrolls by itself at a controlled speed, a short quiz follows, and the reader sees their speed and their streak. The audience is two adults preparing for CELPIP, the Canadian English test.

`PLAN.md` is the source of truth for scope. Take the next unchecked work package and do that one.

## Rules that do not bend

**1. No LLM-authored article text.** An article `body` must be an excerpt of a human-written, properly licensed source listed in `docs/content-sources.md`. You may trim a source by deleting sentences or words. You may not add, rewrite, or paraphrase a body sentence. `scripts/check-article.mjs` enforces this by comparing every published sentence against the untrimmed original in `content-raw/`, so the rule is machine-checked rather than a matter of good faith. You are free to write quiz questions, glosses, UI copy, code and documentation.

**2. The interface is in English.** One reader speaks Spanish and the other Chinese, so English is both the shared language and the subject of the product. Glosses are short English definitions, never translations.

**3. No frameworks and no build step.** Vanilla HTML, CSS and JavaScript with static JSON for content. `site/` has to stay deployable exactly as it is. Cloudflare Pages copies that folder and runs nothing.

**4. Every article carries a `source` block** with author, origin, licence and url. The app refuses to render an article without one.

## Layout

```text
site/                     the deployable static site, nothing else ships
  index.html app.css app.js
  _headers                cache rules, honored by Cloudflare Pages
  content/articles/       one JSON per day, YYYY-MM-DD.json, plus sample.json
  content/index.json      sorted array of the dates that have articles
content-raw/              untrimmed source text, kept for the provenance check
scripts/                  Node ESM, zero dependencies
docs/design.md            tokens, type scale, component and screen specs
docs/content-sources.md   where articles come from and how to credit them
notes-zh/                 the author's Chinese notes, gitignored
```

## Before you call a package done

```text
node scripts/smoke.mjs           drives the real site in a real browser
node scripts/check-contrast.mjs  every color pair against WCAG AA
```

The smoke test matters more than it looks. Two bugs shipped past `node --check`, element-reference checks, contrast checks and HTTP status codes, because all of those pass happily on a page that renders blank. Extend the smoke test when you add a screen.

## Conventions

Site code stays as `index.html`, `app.css` and `app.js`. Keep `app.js` in one file until splitting it genuinely helps.

Read `docs/design.md` before touching any screen. Style through the color tokens and never write a literal color in a component rule, because a literal only works in one theme. Run the contrast checker after changing a token.

Articles run 220 to 320 words, sit at Flesch-Kincaid grade 6 or below, and keep at least 95 percent of their tokens inside `scripts/data/top2000.txt`.

That word list is the New General Service List under CC BY-SA 4.0, and it is the one file here carrying a ShareAlike obligation. Keep its header comment intact, since that header is the attribution. Editing the list means republishing it under the same licence, so leave it alone unless there is a reason. It is an aggregated work rather than part of the site, and nothing else in the repo inherits the licence.

Scripts are Node with ES modules and no dependencies unless a work package says otherwise.

Serve over HTTP when testing, with `npx serve site`, because `fetch()` will not read `file://` URLs.

Do not add analytics, accounts or backend services unless the package explicitly calls for them.

## Two layout traps that already cost a day

Every flex item from `body` down to `.reader` sets `min-height: 0`. Flex items default to `min-height: auto` and refuse to shrink below their content, so a long article pushes the reader taller than the viewport. Then `scrollHeight` equals `clientHeight`, there is no travel, and the read ends on its first frame.

`[hidden] { display: none !important; }` sits near the top of the stylesheet. A `display` value in a stylesheet outranks the browser's own rule for the `hidden` attribute, so an element given `display: flex` by its class stays on screen whatever the attribute says. The countdown overlay hid the whole article this way. Toggle visibility through the attribute and let that rule do the work.

## Prose written for people

Documentation, UI copy and commit messages get read by humans, so avoid the usual AI writing tells: em dashes and en dashes, three-part lists that pad rather than inform, a bolded phrase followed by a colon as a bullet format, emoji as section markers, and cheerful closing paragraphs that restate what came before. Plain sentences of varying length. The `humanizer` skill has the full list.

## Git

Commit subjects are short, imperative, and name the package: `WP3: quiz flow`. Explain in the body why a change was needed, not just what changed.

Pushing to `main` deploys to <https://zephyr-8w8.pages.dev> through the Cloudflare Pages Git integration. Do not run `wrangler pages deploy` by hand; mixing the two makes the deployment list ambiguous about which commit is live.

## Running several sessions at once

The product is three subsystems that meet only through git commits, and the packages parallelize along those seams.

```text
Lane 1  reader      WP2 -> WP3 -> WP4 -> WP6      strictly serial
Lane 2  curation    WP8                           independent
Lane 3  delivery    WP7 -> WP5                    independent
```

Lane 1 cannot be split because all four packages rewrite the same parts of `app.js`. Only one session may edit `site/app.js` at a time. Beyond that, give each lane its own branch.
