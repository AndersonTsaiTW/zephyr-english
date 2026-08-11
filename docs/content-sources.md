# Content sources & licensing

The one rule: **article bodies are excerpts of human-written texts.** LLMs never write body prose. They may trim (deletions only) and may draft quizzes and glosses for human approval. Every published article carries a `source` block in its JSON.

## Primary sources (Canadian first)

### BC Reads — BCcampus Open Education (CC BY 4.0)
Graded readers written for **adult** ESL/literacy learners in British Columbia. Adult topics, Canadian context, levelled 1–6.
- Collection search: https://collection.bccampus.ca/ (search "Adult Literacy Fundamental English")
- Example series: https://opentextbc.ca/abealf1/ (BC Reads readers by Shantel Ivits, Levels 1–6)
- Licence: CC BY 4.0 → free to excerpt and adapt with attribution.
- Attribution: `Adapted from "<title>" by <author>, BCcampus Open Education, CC BY 4.0.`

### Government of Canada — canada.ca (Crown copyright / OGL)
Plain-language pages: newcomer guides (IRCC), health, weather safety, taxes, renting. Exactly CELPIP's topic register.
- Newcomer guides: https://www.canada.ca/en/immigration-refugees-citizenship/services/new-immigrants.html
- Terms — non-commercial reproduction permitted with attribution: https://www.canada.ca/en/transparency/terms.html
- Open Government Licence (commercial use OK, prefer pages/datasets marked with it): https://open.canada.ca/en/open-government-licence-canada
- Attribution: `Source: <page title>, Government of Canada, <url>.`

### VOA Learning English (public domain)
Learner-graded news, updated daily; Level 1 uses a core vocabulary of ~1,500 words. US source, but the only daily-updated graded news that is free to reuse.
- https://learningenglish.voanews.com/
- ⚠️ Only text credited to VOA. AP/Reuters items syndicated on the site are **not** public domain. Photos are often not VOA's either — we only take text.

### Project Gutenberg Canada / Project Gutenberg (public domain)
Canadian classics for weekend reads: L.M. Montgomery (*Anne of Green Gables*, 1908), Stephen Leacock's humorous sketches, Ernest Thompson Seton's animal stories.
- https://gutenberg.ca/ · https://www.gutenberg.org/
- Early-1900s style reads harder — excerpt carefully, trim archaic passages.
- Prefer works published before 1930 → safely public domain in both Canada and the US.

### Simple English Wikipedia (CC BY-SA 4.0)
Canadian-topic entries (cities, animals, holidays) as knowledge pieces.
- ⚠️ ShareAlike: an adapted article must itself be released under CC BY-SA with attribution. Use sparingly if that bothers us.

## Never use

- **CELPIP official practice materials** (Paragon's copyright). Imitating the *format* of a correspondence passage is fine — formats aren't copyrightable — but never copy their texts.
- News sites (CBC, CTV, Global…), publisher graded readers, textbooks — all copyrighted.
- Anything we can't name a licence for.

## Difficulty gate (enforced by the WP8 script)

- 220–320 words
- Flesch-Kincaid grade ≤ 6
- ≥ 95% of tokens within the top-2000 frequency list

## Weekly batch routine (details in PLAN.md WP8)

1. Collect candidates from the sources above (one or two weeks' worth).
2. Trim to 220–320 words — LLM may assist, **deletions only**, human decides.
3. Run `scripts/check-article.mjs`; swap or cut off-list sentences until it passes.
4. Quiz + glosses — LLM may draft, human approves every question.
5. Schedule: save as `site/content/articles/YYYY-MM-DD.json`, add the date to `content/index.json`, keep ≥14 days of buffer.
