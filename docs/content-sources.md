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

## Difficulty gate

The WP8 script enforces three thresholds: 220 to 320 words, Flesch-Kincaid grade 6 or below, and at least 95 percent of tokens inside the top-2000 frequency list.

## The weekly batch

Collect candidates from the sources above, a week or two at a time. A person does this step.

Trim each to 220 to 320 words. A model may assist by deleting sentences, never by adding or rewriting them, and the provenance check verifies the result against the original.

Run `scripts/check-article.mjs` and cut or swap sentences containing off-list words until it passes.

Write the quiz and the glosses. A model may draft them, and a person approves every question.

Save as `site/content/articles/YYYY-MM-DD.json`, add the date to `content/index.json`, and keep at least fourteen days of buffer ahead.

Keep the untrimmed original in `content-raw/<id>.txt`, which stays in the repo so the provenance check has something to compare against.
