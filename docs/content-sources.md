# Content sources and licensing

One rule governs everything here. Article bodies are excerpts of texts written by people, and an LLM never writes body prose. A model may trim an excerpt, deleting only, and may draft quizzes and glosses for a human to approve. Every published article carries a `source` block in its JSON.

## Primary sources, Canadian first

### BC Reads, BCcampus Open Education, CC BY 4.0

Graded readers written for adult ESL and literacy learners in British Columbia, levelled 1 to 6. Adult topics and Canadian context rather than children's stories.

Search the collection at <https://collection.bccampus.ca/> for "Adult Literacy Fundamental English". One such series is <https://opentextbc.ca/abealf1/>, by Shantel Ivits.

CC BY 4.0 allows excerpting and adaptation with attribution. Credit it as: `Adapted from "<title>" by <author>, BCcampus Open Education, CC BY 4.0.`

### Government of Canada, canada.ca

Plain-language pages covering newcomer guides, health, weather safety, taxes and renting. This is precisely CELPIP's topic register.

Newcomer guides: <https://www.canada.ca/en/immigration-refugees-citizenship/services/new-immigrants.html>

The site terms permit non-commercial reproduction with attribution: <https://www.canada.ca/en/transparency/terms.html>

Pages and datasets marked with the Open Government Licence allow commercial use as well, so prefer those: <https://open.canada.ca/en/open-government-licence-canada>

Credit it as: `Source: <page title>, Government of Canada, <url>.`

### VOA Learning English, public domain

News graded for learners and updated daily. Level 1 stays within a core vocabulary of roughly 1,500 words. It is American rather than Canadian, but it is the only daily-updated graded news that is free to reuse.

<https://learningenglish.voanews.com/>

Take only text credited to VOA. AP and Reuters items syndicated on the site are not public domain, and photographs frequently belong to someone else too, so take text and nothing more.

### Project Gutenberg Canada, public domain

Canadian classics for weekend reads: L.M. Montgomery's *Anne of Green Gables* from 1908, Stephen Leacock's humorous sketches, Ernest Thompson Seton's animal stories.

<https://gutenberg.ca/> and <https://www.gutenberg.org/>

Early-1900s prose reads harder than the target, so excerpt selectively and cut archaic passages. Works published before 1930 are safely public domain in both Canada and the United States.

### Simple English Wikipedia, CC BY-SA 4.0

Entries on Canadian topics such as cities, animals and holidays, useful as knowledge pieces.

ShareAlike means an adapted article must itself be released under CC BY-SA with attribution. Use it sparingly if that constraint is unwelcome.

## Never use

CELPIP official practice materials belong to Paragon. Imitating the format of a correspondence passage is fine, since formats are not copyrightable, but their texts are off limits.

News sites such as CBC, CTV and Global, along with publisher graded readers and textbooks, are all copyrighted.

Anything whose licence cannot be named.

## How hard an article is allowed to be

Three limits, all checked by `scripts/check-article.mjs`.

Between 220 and 320 words. Below that there is not enough to build a rhythm; above it the session stops being two minutes.

Flesch-Kincaid grade 9 or lower. Flesch-Kincaid is a readability score based on sentence length and syllable count. The cap takes in BC Reads volumes 3 through 5, which is the range these articles come from.

At least 84 of every 100 words come from `scripts/data/top2000.txt`, the two thousand most common English words.

That number started at 95 and came down after measuring, which is recorded here so nobody quietly raises them again. Eleven BC Reads texts, written by curriculum designers for exactly these readers, were run through the checker untouched. They scored between 89.8 and 96.1 percent, clustering near 94, and several are written at Flesch-Kincaid grade 2. A threshold that fails grade-2 text written for adult literacy students is measuring the size of the word list, not the difficulty of the writing.

A word you have already met is not charged again. Beyond two appearances an unfamiliar word stops counting against the total, because in an article about salmon the word "salmon" appears eleven times and is the subject rather than an obstacle. You learn it once. Counting all eleven says more about the topic than about how hard the text is.

Names do not count towards this figure. A reader meeting "Viola Desmond" is not being asked to know a rare word, and counting names as difficult vocabulary made the number useless for any article about a real person or place. The checker lists them separately so you can still see them.

## Preparing a batch

Do a week or two at a time.

Pick your candidates from the sources above and save each one as a plain `.txt` file containing the full text, exactly as published. Do not tidy it up. This file is what the checking script later compares against, so if you clean it first, the check no longer proves anything.

Scaffold the article with `scripts/new-article.mjs`:

```text
node scripts/new-article.mjs candidate.txt --date 2026-08-11 \
  --title "Renting your first apartment" \
  --author "Government of Canada" \
  --license "Open Government Licence - Canada" \
  --url "https://www.canada.ca/..." \
  --origin "Newcomer guides"
```

This writes `site/content/articles/2026-08-11.json` with the source text split into paragraphs and empty `previewWords` and `quiz` arrays, copies the untrimmed text to `content-raw/2026-08-11.txt`, and adds the date to `site/content/index.json`, creating that file if it does not exist yet. It refuses to overwrite either file, so re-running it on the same date is safe.

One article a day, no difficulty levels. Fifteen chapters across three BC Reads volumes run as fifteen consecutive days, with difficulty varying from day to day. Splitting them into three parallel levels was tried and reverted: a reader gets one article a day either way, so three levels burned the source material three times faster for no gain.

Now cut the `body` paragraphs down to 220 to 320 words. Delete sentences and words. Do not reword anything, do not join two sentences, do not simplify a hard phrase. If a passage will not come down to size by cutting, drop it and use a different part of the source.

Then run the checker:

```text
node scripts/check-article.mjs site/content/articles/2026-08-11.json
```

It tells you the word count, the reading grade, the percentage of common words, and lists every word that fell outside the common two thousand. Keep cutting until it passes.

It also compares every sentence you kept against `content-raw/2026-08-11.txt` and fails if one does not appear there word for word. That is the part that makes "only delete" a rule the computer checks instead of a promise someone has to keep. Deleting passes. Changing a single word does not, and the failure names the sentence.

The word list behind the common-word check comes from the New General Service List, a published frequency ranking, trimmed to its first two thousand entries. It is shared under a licence requiring credit and requiring any modified version to be shared on the same terms, so leave the file alone. The full source and licence wording are in the comment at the top of it.

One quirk to expect: that list has no entries for spelled-out numbers, so `two` and `three` will always be reported as uncommon words. Ignore those.

Last, write the quiz questions and the word definitions straight into the article file. A model may draft them, but read every question yourself before it ships.

Keep at least two weeks of articles scheduled ahead.
