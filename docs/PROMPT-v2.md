# Morning Brief — build prompt (v2, after blind review)

**The job:** a web app that each morning turns a reader's chosen topics into a page they'd actually want to read with coffee.

**The hard part:** deciding which five stories per topic are *the most important ones*. Everything else here is ordinary web work. If the ranking is bad, nothing else you build matters. Budget your effort accordingly.

---

## A. Decided. Don't re-litigate these.

- All fetching, ranking, and summarizing happen server-side. API keys never reach the client.
- Reader state lives in localStorage for v1. No auth, no user database.
- Summaries are LLM-generated in your own words. Articles are always linked out, never republished. Headline plus short excerpt only, always attributed.
- A mock-data mode ships alongside the live one, so the UI can be demoed with no keys.
- Keys in `.env`, with a committed `.env.example`.

## B. Must be true. I will check each of these by looking.

**Ranking and content**

1. No two cards within a topic are the same story. I will go looking for duplicated wire copy.
2. Every one of the five slots is defensible, and the card says why it made the cut in six words or less ("Covered by 7 outlets", "Breaking", "Section lead").
3. Ranking is driven primarily by how many independent outlets are covering an event — not by which one published most recently. The weights live in one file, one comment line each, and I can retune them without touching anything else.
4. "Today" means the reader's local news day. If a topic has to reach back further to fill five slots, the card says so.
5. Summaries run 2–3 sentences, say what happened and why it matters, and contain zero teaser language. No "here's what we know." No "read on."

**Cards**

6. Every card has headline, summary, image, source, timestamp, and outbound link. No card ever renders with a missing or broken image — whatever chain of fallbacks that takes.
7. The 10-topic cap is enforced in the UI with a live count. Custom free-text topics count against it.

**Weird and Quirky**

8. Selected together, Weird and Quirky return disjoint sets with visibly different characters. Weird is strange-but-real: unexplained, baffling, nature misbehaving. Quirky is charming and human: the story you'd read aloud to someone. Neither ever returns something grim — that's a bug, not a matter of taste. Build them from offbeat sections and feeds, not a keyword search.

**Operational**

9. One topic failing degrades to an inline retry on that section. It never blanks the page.
10. Cost per reader per day is bounded and known. Tell me the number and how caching gets you there.

**Craft**

11. Legible on a phone held in one hand, and in dark mode. Keyboard-navigable, alt text present, AA contrast in both themes.
12. No layout shift while the brief loads.
13. It reads as an edited page, not a UI. Typographic hierarchy does the work; images support the text; one accent color at most.

## C. Anti-goals. These are how this app fails.

- A reverse-chronological feed with a topic filter bolted on. That's an RSS reader. That's not this.
- The same AP story five times under five different mastheads.
- Summaries that are secretly the article's first two sentences.
- Ten sections of five cards with no front door — no sense of what today's single biggest story was.
- Dashboard aesthetics: sparklines, cards inside cards, badge soup, a stats row nobody asked for.
- Anything that works with your API key and dies on mine.

## D. Yours to decide. Pick, state the choice in one line, keep moving.

News source (RSS aggregation, a commercial news API, or both), summarization model and batching, clustering method for dedup, image sourcing and fallbacks, caching layer, framework, deploy target.

I care about the outcomes in section B, not the mechanisms. Ask me only if you hit a fork where the two options produce materially different products.

## E. Build order. End-to-end before deep.

1. **Thin slice.** Three hardcoded topics, real articles, real cards on screen. No ranking, no LLM yet. **Stop and show me.**
2. **Ranking and dedup.** This is the project. Spend your time here.
3. Summaries and images.
4. Full topic picker: presets, custom topics, the 10 cap, reordering, persistence. Presets should cover World, US/National, Politics, Business & Markets, Tech, AI, Science, Space, Health, Climate, Sports, Film & TV, Music, Books, Food, Travel, Design, Gaming, Local, Weird, Quirky.
5. Weird and Quirky lanes, with their own sourcing.
6. The front door: cross-topic top stories, and a 4–6 bullet "In one minute" TL;DR at the very top. **Stop and show me.**
7. Design pass, dark mode, mobile, accessibility, empty and error states, skeleton loaders.
8. README, `.env.example`, mock mode, tests on ranking and dedup.

## F. Extras, only once 1–8 are genuinely done.

Delivery-time setting, print view, permalink to a given day, archive of past mornings, save-for-later, "less like this", share.

## G. How to work.

- One line before each numbered stage saying what you're starting; one line after saying what landed and anything that surprised you. If something breaks mid-stage, tell me then — don't save it for the recap.
- Don't ask me anything before you start. Choose your defaults, name them in one line each, and begin. The two stop-and-show points in E are the only gates.
- **Verify by using it.** Load the app, pick eight topics including Weird and Quirky, and read the actual output. Check items 1, 2, 5, 6, and 8 by eye against real data. Then look at it at phone width and in dark mode. Tell me what you saw. "It compiles" is not verification.
- At the end, unprompted, list everything you stubbed, faked, or skipped. I'd rather have a short honest list than find it myself.
