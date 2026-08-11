# Design guide

Read this before building or changing a screen. If you need a value that is not here, use the nearest one on the scales below rather than inventing a new number. That is what keeps screens built months apart looking like the same product.

The article is the only thing on screen that should feel designed. Everything else stays quiet and gets out of the way.

## Colours

All colours are defined once, as named variables at the top of `site/app.css`. Always use the variable. Never write an actual colour code inside a rule for a button or a card, because the site has a light theme and a dark theme, and a fixed colour will be wrong in one of them.

| Variable | Light | Dark | What it is for |
| --- | --- | --- | --- |
| `--ground` | `#F5F9FA` | `#0D1519` | The page background |
| `--surface` | `#FFFFFF` | `#142027` | Cards, the reading panel, buttons |
| `--ink` | `#17262E` | `#DAE5EA` | Ordinary text |
| `--muted` | `#5C7079` | `#8CA3AD` | Small print, labels, secondary numbers |
| `--accent` | `#1D7387` | `#56B4C8` | The one colour: logo, main button, progress bar |
| `--accent-soft` | `#E1EFF2` | `#17323A` | A faint wash of the accent, for the reading band |
| `--line` | `#D9E3E7` | `#223440` | Borders and dividers |
| `--on-accent` | `#FFFFFF` | `#0D1519` | Text sitting on top of an accent-coloured button |

The greys are very slightly blue, so they sit with the accent instead of fighting it. Keep that if you add a shade.

There is one accent colour and it means "Zephyr" or "this is active". Do not introduce a second one. Quiz feedback is the only place a colour carries meaning, and even there, a correct answer uses the soft accent rather than a new green.

`--on-accent` flips between themes for a reason worth knowing. Text needs to be about four and a half times brighter or darker than what is behind it to be comfortably readable. White text on the light theme's accent passes. On the dark theme the accent is a much paler blue, and white on it fails badly, so it switches to near-black instead.

Run `node scripts/check-contrast.mjs` after touching any colour. It measures every combination in both themes and fails if one is too close. The tightest pair right now has almost no room to spare, so judging a new shade by eye will not work.

### How the two themes are wired

There are three situations to handle, not two. Someone can explicitly choose light, explicitly choose dark, or leave it alone and follow their phone or computer.

So: the plain `:root` block holds the complete light palette. A `prefers-color-scheme: dark` block overrides those variables for people whose device is set to dark, but skips anyone who explicitly chose light. A third block overrides them again for anyone who explicitly chose dark, so that beats a device set to light.

A small script in the page `<head>` applies a saved choice before anything is drawn. That is what stops the page flashing white for an instant before turning dark. Leave it in the `<head>` and leave it inline. Moving it into `app.js` brings the flash back.

## Text

Three typefaces, each with one job. Georgia is for reading and for headings; it is what makes the app feel like a book rather than a dashboard. The system font handles buttons and labels. A monospaced font handles small labels and anything with numbers that should line up.

| Name | Size | Font | Used for |
| --- | --- | --- | --- |
| Hero | 2.6rem | Georgia | The speed number on the results screen |
| Display | 1.8rem | Georgia | Screen titles |
| Title | 1.35rem | Georgia | Article title, quiz question |
| Reading | 1.2rem | Georgia | The article itself, line spacing 1.8 |
| Body | 1rem | System font | Buttons and ordinary interface text |
| Caption | 0.85rem | System font | Hints and secondary lines |
| Label | 0.75rem | Monospace | Small uppercase labels, dates, counters |

The reading size and its line spacing are the two values most worth protecting. At 1.2rem with 1.8 line spacing, a phone fits roughly forty characters per line, which is where the scrolling feels comfortable rather than frantic. Changing either changes how the whole product feels, so treat them as settled.

Numbers a reader compares between days, meaning speed, score and streak, use `font-variant-numeric: tabular-nums` so the digits do not shuffle sideways as they change.

A few sizes in the stylesheet are slightly off this scale. Pull them onto it when convenient rather than adding more steps.

## Two layout rules

Both of these were learned by shipping the bug. Each time, the article area came up empty and the code looked fine.

Every element from `body` down to `.reader` sets `min-height: 0`. In a flexible layout an element will not shrink below the height of its own text, so a long article pushed the reading panel past the bottom of the screen. With the panel exactly as tall as its text there was nothing to scroll through, and the article ended on its first frame. Any new scrolling area needs the same line.

Near the top of the stylesheet sits `[hidden] { display: none !important; }`. The `hidden` attribute should hide an element, but a stylesheet declaring that element visible beats it. The countdown overlay had exactly that, so it stayed on top of the article in the same colour as the panel behind it. With the rule in place the attribute works again. Hide with the attribute and let the rule do it.

## Spacing and shape

Spacing uses multiples of 4 pixels: 0.25, 0.5, 0.75, 1, 1.5, 2 and 3rem. Lay groups out with `gap` rather than putting margins on each item, because margins between neighbours collapse into each other in ways that are hard to predict.

Content sits in a column 560 pixels wide, centred, with 1.25rem of padding at the sides. That holds together on a phone and stops lines getting uncomfortably long on a laptop.

Rounded corners carry meaning. Fully rounded means you can press it. Cards and panels use 18 pixels, smaller cards and quiz options 12, small notices 10.

Borders are always one pixel in `--line`. There are no drop shadows in this product, and adding one is a step backwards.

## The pieces

### Main button

Fully rounded, accent background, `--on-accent` text, 0.8rem by 2rem of padding. At most one per screen.

### Icon button

Fully rounded, 2.5rem square, surface background with a one pixel border that turns accent on hover. The play button in the reader is the same thing at 3.2rem, filled with the accent.

### Card row

Surface background, one pixel border, 12 pixel corners. The preview words use this, and the quiz options are the same thing made taller.

### Focus

Every control shows a two pixel accent outline when reached by keyboard. Never remove it. Someone navigating without a mouse has no other way to tell where they are.

Anything you tap must be at least 44 pixels on its shorter side.

## The screens

### Today

Centred on the screen. The streak sits above the title if there is one, then the article title, then a line giving the word count and roughly how long it will take, then the preview words as card rows, then the button, then a single line of explanation.

### Reader

The panel fills the available height. Text scrolls upward underneath a faint band about a third of the way down, which gives your eyes somewhere fixed to rest. The text fades out towards the top and bottom edges so lines arrive and leave gently instead of being cut off.

Below sit the slower, play and faster buttons, and the current speed. Under that, a thin progress bar.

### Quiz

One question per screen, centred, with a small counter like `1 / 3` above it. The question wraps at about 24rem so it breaks into readable lines. Options stack down the screen as tall card rows with text aligned left.

Tapping an option locks the rest. The correct one takes an accent border and a soft accent fill. If the tap was wrong, that option fades to grey and the correct one lights up beside it. After about seven tenths of a second the next question replaces it.

The correct answer must stay in JavaScript. Putting it in the HTML, even as a class name or a data attribute, means anyone can open developer tools and read the answers.

### Results

The reading speed is the hero: a large number with a small `wpm` label beside it. Then the score, then the streak, then tomorrow's starting speed, then the credit for the source. The share button is the main action, with "Read again" as quiet text underneath.

### Nothing today

A title, one line under it, nothing else. It is a calm message, not an error, so no warning colours and no icon.

## Movement

There is one animation in this product and it is the scroll. Everything else changes state immediately or fades over at most a sixth of a second.

The countdown holds each numeral for a little under a second, large and in the accent colour.

Some people get motion sickness from text that slides, and their device tells us so. For them the reader moves a paragraph at a time instead, holding each paragraph for as long as it would have taken to scroll past, so the pacing is unchanged and nothing slides. The paragraph sits near the top of the panel rather than at the reading band, so a long one fits on screen in one piece. Simply switching the animation off is not an option, because the movement is the product.

## Things that would look wrong here

Gradients, apart from the existing fades and the reading band. A second accent colour. Emoji used as decoration in headings or buttons. Shadows under cards. Layouts that stretch edge to edge on a laptop. Any font other than the three above. Screens that slide or fade into each other.
