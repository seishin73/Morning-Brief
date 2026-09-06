# Morning Brief

A personal morning newspaper. Pick up to ten topics; get back the five stories that
actually mattered in each, with a summary, a photograph, the source, and a link to the
original. It reads about seventy newsrooms directly and works out what matters by seeing
which stories the world's outlets independently agree on.

## Run it

```
node server.js
```

Then open <http://localhost:4173>. Node 20 or newer. **No npm install, no dependencies, no
API keys** — Node's built-in `fetch` and about two hundred lines of feed parsing do the job.

An `ANTHROPIC_API_KEY` in the environment is optional. With it, summaries are rewritten by
Claude; without it, each outlet's own feed description is cleaned up instead. Cards are
never empty either way.

```
node scripts/check.js    # diagnostic: which feeds answered, what ranked, and why
node scripts/test.js     # 43 tests over clustering, ranking, assembly and parsing
```

## Deploying

Vercel runs this as-is. Its `@vercel/backends` builder detects a Node project and
uses `server.js` as the entrypoint — the long-running server, not a serverless
function — so the in-memory feed pool survives between requests and there is no
function time limit to design around.

```
vercel deploy          # preview
vercel deploy --prod    # production
```

Two things matter for a hosted run, both already handled:

- **The filesystem is read-only.** The pool cache goes to the system temp
  directory when `VERCEL` is set, and beside the project otherwise.
- **`server.js` must not be in `.vercelignore`.** It is the entrypoint. Excluding
  it deploys a build whose entrypoint is missing, which fails at runtime with a
  bare 500 and no logs to explain it.

Do not add an `api/` directory expecting serverless functions: the backends
builder claims the whole project, and those routes will 404.

## How it decides what matters

The whole model is in [`src/rank.js`](src/rank.js). Change the five numbers in `WEIGHTS`
and the brief reorders; nothing else needs touching.

| Signal | Weight | What it measures |
|---|---|---|
| `corroboration` | 0.42 | How many independent outlets carry the story. The strongest available signal of importance. |
| `recency` | 0.20 | Exponential decay on hours since publication. |
| `sourceTier` | 0.13 | Standing of the outlet, from the `TIER` table in `src/sources.js`. |
| `topicFit` | 0.15 | How squarely it sits in the topic, not just keyword presence. |
| `prominence` | 0.10 | How high it sat on its own feed — borrowed editorial judgement. |

The tally marks beside each headline are the corroboration count drawn out, one stroke per
outlet. Because corroboration dominates, the tally is close to being the ranking made visible.

## The hard part: clustering

Getting this wrong makes the whole thing worthless, and the obvious approach fails.

Outlets do not write the same headline. *"Putin Meets Witkoff and Kushner in Moscow to
Discuss Ukraine War"* and *"US envoys set for Ukraine talks after meeting Putin in Moscow"*
share three words out of twelve — plain token overlap scores them 0.25 and leaves them
apart. The first working version of this ranked almost every story as single-source and
consequently led with a Verge blog post and a Mental Floss quiz.

What the two headlines do share is the **rare** words: the names and places. So similarity
leans on tokens that are uncommon across the whole pool, with plain overlap as a sanity
check so that every story mentioning Putin does not collapse into one. Two headlines must
share at least two rare tokens before they are even compared, and genuinely uncommon shared
terms get extra credit — on a college-football Saturday "Michigan" stops being rare, which
was sinking obvious duplicates, but "Hail Mary" still identifies the event.

Three further things matter:

- **Clustering runs once over the whole pool**, before any topic is considered. Corroboration
  is a property of the news, not of the section you happen to be reading: a story on one
  outlet's world desk and another's politics desk still has two outlets behind it.
- **Only pairs sharing rare tokens are compared**, via an inverted index, so 900 stories
  cluster in about 16ms instead of half a million comparisons.
- **The surviving card is the best version of the story**, not the first seen — preferring a
  strong outlet that supplied a real photograph and a real summary, then absorbing every
  other outlet into its "Also in" line.

## Assembly

Three passes, so no section can quietly poach a story from the section it belongs to:

1. Topics you typed yourself pick first — an explicit request beats a broad preset.
2. Each preset claims the stories whose primary topic it is.
3. Anything still short of five backfills from cross-listed stories.

A per-outlet cap of two stops one prolific feed becoming the entire section (ESPN will
otherwise take all five Sport slots), relaxed only if the cap would leave the section short.

A second, looser same-event guard runs when filling a section. Clustering is deliberately
strict, so a match report and a reaction column on the same game survive it as separate
stories and then take two of five Sport slots between them. Same event, second slot: skipped.

Top of the Brief takes **one story per section**, best sections first. Taking the three
highest-scoring stories overall simply reprinted World's top three, because World has the
deepest corroboration and wins outright every time.

Recipes and restaurant reviews carry a flat score penalty. They belong in a cooking section —
they are just not the most important thing that happened in food today, and prominence alone
carries too little weight to hold a Guardian review back against a trade outlet's real news.

## Getting the topic right

Feeds are broader than their names — the Guardian's US-news feed carries tennis, the NYT
business feed carries food-safety recalls. The article URL almost always names the real
section, so `SECTION_HINTS` in `src/pipeline.js` re-files stories onto the section their own
URL claims, overriding the feed they arrived in.

A `NOISE` filter drops things that are published by newsrooms but are not news stories:
quizzes, listicles, live-stream and fixture listings, betting cards, affiliate posts,
horoscopes, newsletters, comment prompts and SEO content-farm phrasing. The Offbeat lane
additionally passes a hard filter for grimness — it merges what used to be "weird" and
"quirky", and it is never allowed to be bleak.

Two content rules override the URL where the URL lies. Crime and court reporting arrives
through general-news feeds wired to Politics, so a filicide mistrial was anchoring the
politics section; it goes to the general desk instead. And a story filed under Economy whose
**headline** contains no economic vocabulary is not an economy story — the NYT files a Route
66 travel feature under `/business/`, and its summary mentioning that tourists keep
"inflation in the rearview" is a passing mention, not a subject.

Feed descriptions get real cleaning, not a tag strip. Several outlets pack a standfirst, the
opening paragraph and a list of related-article cross-links into one blob; flattening that
naively glued teaser questions into the middle of sentences. Cross-link lists and captions are
dropped, block boundaries become sentence breaks, WordPress "The post … appeared first on …"
plumbing is stripped, and a fragment ending on a dangling conjunction is closed with an
ellipsis rather than a full stop that pretends the sentence finished.

## Photographs

Four steps, so no card ever renders without a visual:

1. The image the outlet put in its own feed (`media:content`, `media:thumbnail`, `enclosure`,
   or the first `<img>` in the description).
2. The article's own `og:image`, fetched directly.
3. A freely-licensed photograph of the subject from Wikimedia Commons, found by pulling the
   proper nouns out of the headline.
4. A designed plate naming the outlet.

Nothing is rehosted, no article text is reproduced, and every headline links out to the
original.

## Caching

Feeds are read at most once every twenty minutes and shared across every topic combination,
so ticking a box re-assembles from memory instead of re-fetching seventy feeds. The pool is
written to `.cache/pool.json` so a restart doesn't start cold. Per-article work — `og:image`
scraping and any LLM summarising — happens only for the ~50 stories that survive ranking,
never for the ~900 that don't.

## Layout

```
server.js            HTTP server and the /api/brief route
src/sources.js       feed registry, outlet names, tier table, grimness filter
src/rank.js          THE RANKING MODEL — weights, similarity, clustering, assembly
src/pipeline.js      fetching, RSS/Atom parsing, section hints, noise filter, images
public/              index.html, styles.css, app.js
scripts/check.js     live diagnostic
scripts/test.js      test suite
offline/index.html   the earlier single-file build — no server, corpus frozen at 5 Sep 2026
```

`offline/index.html` is kept because it still works by double-clicking, with no Node and no
terminal. Its ranking and dedup are the same ideas at an earlier stage, running in the
browser over fifty stories baked into the file. The live build supersedes it.

## Known limits

- Feeds go down. The brief is built from whatever answered, and the dateline says how many
  didn't rather than hiding it.
- Corroboration is only measurable across outlets that publish RSS. A scoop that one outlet
  has and nobody else has yet will rank low — that is the trade the model makes deliberately.
- Verticals with few overlapping outlets (Science, Health) show lower counts than World or
  Politics. That is real, not a bug, but it does mean the tally is more informative in some
  sections than others.
