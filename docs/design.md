# Design system

Everything a session needs to build a screen that looks like it belongs. Read this before adding UI. If a value you need is missing here, pick the nearest one on the scales below rather than inventing a new number.

The product is a reading tool, so the article is the only thing on screen that should feel designed. Interface chrome stays quiet and gets out of the way.

## Color

Tokens live at the top of `site/app.css`. Always style through a token and never write a literal color in a component rule, because a literal only works in one theme.

| Token | Light | Dark | Used for |
| --- | --- | --- | --- |
| `--ground` | `#F5F9FA` | `#0D1519` | Page background |
| `--surface` | `#FFFFFF` | `#142027` | Cards, the reader panel, buttons at rest |
| `--ink` | `#17262E` | `#DAE5EA` | Body and heading text |
| `--muted` | `#5C7079` | `#8CA3AD` | Captions, labels, secondary numbers |
| `--accent` | `#1D7387` | `#56B4C8` | The one hue: brand mark, primary button, progress, focus band |
| `--accent-soft` | `#E1EFF2` | `#17323A` | Accent at low intensity: focus band, notices, correct answers |
| `--line` | `#D9E3E7` | `#223440` | Borders and dividers |
| `--on-accent` | `#FFFFFF` | `#0D1519` | Text and icons sitting on an `--accent` fill |

`--on-accent` flips because the dark theme's accent is a lighter cyan. White on it measures 2.4:1, which fails the 4.5:1 minimum, while the near-black reaches 7.7:1. Any element filled with `--accent` takes its foreground from this token rather than a literal white.

The neutrals carry a slight cyan bias so they sit with the accent rather than fighting it. Keep it that way if you add a shade.

`node scripts/check-contrast.mjs` measures every text-on-background pair in both themes and exits non-zero if any drops below 4.5:1. Run it after touching a token. The tightest pair today is the accent as text on `--accent-soft` at 4.63:1, so there is very little headroom and eyeballing a new shade will not do.

There is one accent and it means "Zephyr" or "active". Do not add a second brand hue. Quiz feedback is the one place semantic color is allowed, and even there the correct state uses `--accent-soft` rather than a new green.

### Theme structure

Three states, and all three have to work. `:root` defines the full light palette. The `prefers-color-scheme: dark` block redefines the tokens under `:root:not([data-theme="light"])`, so a reader who pinned light beats a dark operating system. `:root[data-theme="dark"]` redefines them again so a pinned dark beats a light system.

An inline script in `<head>` applies the stored preference before first paint, which is what stops the page flashing the wrong theme on load. Leave it in `<head>` and inline. Moving it into `app.js` reintroduces the flash.

## Type

Three faces, each with one job. Georgia is the reading and display face and carries the product's book-like feel. `system-ui` handles interface text. A monospace face handles labels and anything with digits that line up.

| Step | Size | Face | Used for |
| --- | --- | --- | --- |
| Hero | 2.6rem | Georgia 500 | The speed number on the results screen |
| Display | 1.8rem | Georgia 500 | Screen titles |
| Title | 1.35rem | Georgia 500 | Article title in the reader, quiz question |
| Reading | 1.2rem | Georgia 400 | Article body, line height 1.8 |
| Body | 1rem | system-ui | Interface text, line height 1.6 |
| Caption | 0.85rem | system-ui | Hints, secondary lines |
| Label | 0.75rem | monospace | Uppercase labels, dates, counters, letter-spacing 0.18em |

Reading size and line height are the two values most worth protecting. At 1.2rem with line height 1.8 a phone gets roughly 40 characters per line, which is where the scroll stays comfortable. Changing either changes how the scroll feels, so treat them as fixed.

Numbers that a reader compares across days, meaning speed, score and streak, get `font-variant-numeric: tabular-nums` so they do not jitter.

The current CSS has a few sizes off this scale, specifically 0.92rem and 0.78rem. Reconcile them to Caption and Label in WP9 rather than adding more steps now.

## Spacing and shape

Space runs on a 4px base: 0.25, 0.5, 0.75, 1, 1.5, 2 and 3rem. Lay groups out with flex or grid and `gap`, not per-element margins.

Content sits in a 560px column, centered, with 1.25rem of side padding. That column holds on a phone and stops the layout stretching on a laptop.

Corner radii carry meaning. Pills at 999px are controls you press. Cards and panels use 18px, option buttons and small cards 12px, and inline notices 10px.

Borders are always 1px in `--line`. There is one shadow in the product, on nothing at present, and adding more is a regression.

## Components

**Primary button.** Pill shape, `--accent` background, white text, 0.8rem by 2rem padding, 1.05rem text. One per screen at most.

**Icon button.** Pill, 2.5rem square, `--surface` background, 1px `--line` border. Border turns `--accent` on hover. The reader's play button is the enlarged variant at 3.2rem with an accent fill.

**Card row.** `--surface` background, 1px `--line` border, 12px radius, 0.5rem by 0.9rem padding. The preview word rows use this and the quiz options extend it.

**Focus.** Every interactive element shows `2px solid var(--accent)` at 2px offset on `:focus-visible`. Do not remove it.

Any tappable target is at least 44px in its smaller dimension.

## Screens

### Today card

Vertically centered, text centered. The article title at Display, then a Caption line reading word count, estimated seconds and current speed, then the preview words as card rows, then the primary button, then a one-line hint. Once WP4 lands, the streak sits above the title as a Label.

### Reader

The panel fills the available height with `--surface`, an 18px radius and a 1px border. Text scrolls under a focus band at 37 percent from the top, 26 percent tall, painted in `--accent-soft` at half opacity. Fade masks 28 percent tall at each end blend the text into the panel.

Controls sit below in one centered row: slower, play, faster, then the current speed as a Label with the number one step larger in `--ink`.

The progress bar is a 3px `--line` track with an `--accent` fill.

### Quiz (WP3)

One question per screen, vertically centered like the today card.

A Label counter at the top reads the position, for example `1 / 3`. The question follows at Title size, centered, capped at about 24rem so it wraps in a readable shape. Options stack full width below with 0.6rem between them, each a card row at 12px radius with at least 3.25rem of height and left-aligned Body text.

On tap the correct option takes an `--accent` border with an `--accent-soft` fill. When the tapped one is wrong it drops to `--muted` text and keeps its plain border, and the correct one lights up alongside it. After roughly 600ms the next question replaces the current one. Once an option has been tapped the rest stop responding.

The correct index stays in JavaScript. Writing it into a `data-` attribute or a class before the tap puts the answer key in the DOM, which the acceptance criteria rule out.

### Results (WP3, filled out by WP4)

The measured speed is the hero: the number at Hero size in Georgia with a `wpm` Label beside it, both centered. Comprehension follows as Body text reading `2 / 3 correct`. The streak comes next as a Label. Tomorrow's speed sits under that in Caption `--muted`, phrased as a plain statement rather than a promise.

Attribution is last before the actions, at Label size in `--muted`, naming the source, author and licence.

Actions are the share button as primary, with "Read again" below it as a plain text button in `--muted`.

### Empty state

Display-size line, one Caption line under it, nothing else. It is a calm message and not an error, so no warning color and no icon.

## Motion

The product has one animation, which is the scroll. Everything else changes state instantly or fades over 150ms at most.

The 3-2-1 countdown holds each numeral for 800ms at 4rem in `--accent` over `--surface`.

Under `prefers-reduced-motion: reduce`, the reader switches to advancing one paragraph at a time on the same overall schedule instead of scrolling continuously. Turning the animation off entirely would break the product, so the paragraph-step mode is required rather than optional.

## Things that would look wrong here

Gradients on anything except the existing fade masks and focus band. A second accent hue. Emoji as interface decoration, including in section headings and buttons. Drop shadows on cards. Full-width edge-to-edge layouts on a laptop. Any font that is not one of the three named above. Animated page transitions between screens.
