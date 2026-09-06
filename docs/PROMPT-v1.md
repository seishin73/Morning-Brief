# Morning Brief — build prompt

Build me a production-quality web app called **Morning Brief**.

## The core idea

Every morning, a reader picks the things they care about and gets back a short, scannable front page: the five stories that actually matter today for each topic, each with a summary, a relevant photo, the source, and a link out to the full article. It should feel like a personal newspaper someone hand-set for them overnight — not a raw feed dump.

## 1. Topic selection

- The user picks **up to 10 topics**. Enforce the cap in the UI with a clear counter (e.g. "6 / 10").
- Offer a **preset menu** of topic chips, grouped into sections, that includes at minimum: World, US/National, Politics, Business & Markets, Tech, AI, Science, Space, Health, Climate, Sports, Film & TV, Music, Books, Food, Travel, Design, Gaming, Local news, **Weird**, and **Quirky**.
- Also allow **custom free-text topics** ("Formula 1", "my city", "semiconductors", a company name). Custom topics count against the 10.
- Topics are drag-reorderable; order determines section order on the brief.
- Persist selections (localStorage is fine for v1; design the data layer so a real account could be swapped in later).
- **Weird** and **Quirky** are not the same thing and should not return the same articles. Treat them as distinct editorial lanes with their own query strategy and source mix:
  - *Weird* = genuinely strange but real news — unexplained phenomena, bizarre crime, nature doing something inexplicable, "authorities are baffled."
  - *Quirky* = charming, funny, human-interest, delightful — the story you'd read aloud to someone. Local heroes, absurd records, animals with jobs.
  Build these from offbeat-news sections and feeds rather than a generic keyword search, and hard-filter out tragedy, gore, and cruelty — these two lanes should never be grim.

## 2. The brief itself

For each selected topic, surface **the 5 most important articles from today** (fall back to the last 48 hours if today is thin, and label that clearly, e.g. "from yesterday").

Each article card shows:

- **Headline** (linked, opens in a new tab, `rel="noopener noreferrer"`)
- **2–3 sentence summary** in neutral, informative prose — what happened and why it matters. Not a teaser, not clickbait, no "read on to find out."
- **A photo** relevant to the story
- **Source name + publication time** ("Reuters · 2h ago")
- **Why it's here** — a one-line, low-key rationale chip (e.g. "Covered by 7 outlets", "Breaking", "Most-read in Science"). This is what makes the app feel curated instead of algorithmic.
- Actions: save for later, dismiss / "less like this", copy link, share

Above the topic sections, render a **Top of the Brief**: the 3–5 single most important stories across *all* of the user's topics, in a larger editorial treatment.

Also include a short **"In one minute"** block at the very top — a 4–6 bullet TL;DR of the whole brief, written as plain declarative sentences.

## 3. Define "most important" explicitly

Don't just take whatever the API returns first. Score and rank candidates, and write the scoring function so it's readable and tunable in one place. Weight roughly:

- **Cross-source corroboration** — how many distinct outlets are covering the same event (cluster near-duplicate stories first; this is the strongest signal)
- **Recency** — decay over hours, with a hard preference for the current news day
- **Source quality** — a maintained tier list of outlets, adjustable
- **Topic fit** — relevance of the story to the specific topic, not just keyword presence
- **Prominence** — front-page / section-lead placement where that's detectable

Deduplicate aggressively: five versions of the same wire story is a failure state. Cluster by title/entity similarity, pick the best representative, and show "+4 more outlets" as an expandable list on the card.

## 4. Architecture and data

- Decide the news source and **tell me what you chose and why** before wiring it up. Reasonable options: NewsAPI.org, GNews, The Guardian Open Platform, NYT API, Bing News Search, Currents, or direct RSS/Atom aggregation from a curated source list. RSS costs nothing and has no quota — consider it as the primary with an API as enrichment.
- Fetching, ranking, and summarizing must happen **server-side**. Never put an API key in client code.
- **Summaries**: generate them with the Claude API (`claude-sonnet-5` is the right cost/quality point; batch multiple articles per call). Fall back to the feed's own description if generation fails — never show an empty card. Summarize from headline + description/excerpt + metadata; do not scrape and reproduce full article text.
- **Images**: prefer the image the feed/API provides, then the article's `og:image`, then a topic-appropriate stock image, then a generated gradient-and-monogram placeholder. Every card gets *something*; no broken image icons ever. Lazy-load, set explicit dimensions to avoid layout shift, proxy or set `referrerpolicy` as needed for hotlink-blocking sources.
- **Cache hard.** Build the brief once per topic per day and serve it to everyone who picked that topic; cache summaries and image lookups keyed by article URL. This is the difference between an app that costs cents and one that costs hundreds of dollars. Show me the expected per-user API and token cost when you're done.
- Handle rate limits, timeouts, and partial failures gracefully: a topic that fails to load shows an inline retry, it does not take down the page.

## 5. Refresh and delivery

- A "Refresh brief" control with a visible "as of 6:42 AM" timestamp.
- **Timezone-aware**: "today" means the user's local news day, not the server's.
- Let the user set a **delivery time** (default 7:00 AM local) that the brief is built for.
- Include a clean **print / read-only view** and a shareable permalink to a given day's brief.
- If it's cheap to add: an archive so the user can page back through previous mornings.

## 6. Design

Editorial and calm, not a dashboard. Think a well-set newspaper front page rendered for screens: strong typographic hierarchy, generous whitespace, a real serif for headlines paired with a clean sans for body, restrained accent color, images that support the text instead of dominating it.

- Fully responsive; phone is the primary reading context, so design that first.
- Light and dark themes, both deliberately designed.
- Skeleton loaders on fetch, and designed empty / error / zero-results states.
- Accessible: semantic landmarks, real heading order, keyboard navigable, visible focus rings, alt text on every image, AA contrast in both themes, respects `prefers-reduced-motion`.
- Fast: no layout shift, no blocking fonts, images sized and lazy.

## 7. Constraints

- **Link out, never republish.** Summaries in your own words, headline plus short excerpt only, always attributed, always linked to the original. Respect each source's terms and robots.
- No paywalled-content extraction; label paywalled links as such if detectable.
- Keys in `.env`, with a committed `.env.example`.

## 8. Deliverables

1. The working app, runnable locally with a documented command.
2. `README.md`: what it does, setup, where to get each API key, how to run, how to deploy, how to change the source list and the ranking weights.
3. The ranking logic isolated in one well-commented module.
4. A seeded/mock mode so the UI can be demoed without live API keys.
5. Basic tests for the ranking and dedup logic.

## 9. How I want you to work

- **Give me status updates as you go.** Before each phase, tell me in one line what you're starting; after it, what you finished and anything that surprised you. I want to be able to follow along without reading every diff.
- Lay out your plan and the stack you intend to use **before you start writing code**, and wait for my go-ahead on that one thing.
- If something is genuinely ambiguous, ask me — but batch it into at most 3 questions and pick a sensible default rather than blocking on anything minor. State the defaults you chose.
- **Actually run it.** Load the app, select a mix of topics including Weird and Quirky, and verify with real data that: the cards render, images resolve, summaries read well, the 10-topic cap holds, dedup works, and dark mode and mobile both look right. Show me what you saw. Don't report it as done until you've watched it work.
- Flag anything you had to stub, skip, or fake.

## 10. Done means

I can enter my topics, hit go, and get back a page I'd genuinely want to read with coffee — correct, current, well-written, good-looking, and fast — and I can hand it to someone else with the README and they can run it in five minutes.
