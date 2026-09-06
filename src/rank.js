// ============================================================================
// THE RANKING MODEL
//
// Everything that decides which five stories you see lives in this file. Change
// the five numbers in WEIGHTS and the brief reorders. Nothing else needs touching.
// ============================================================================

import { TIER, DEFAULT_TIER } from './sources.js';

export const WEIGHTS = {
  corroboration: 0.42, // how many independent outlets carry it — the strongest signal of importance
  recency:       0.20, // exponential decay on hours since publication; today outranks yesterday
  sourceTier:    0.13, // standing of the outlet running the version we link to
  topicFit:      0.15, // how squarely it sits in the topic asked for, not just keyword presence
  prominence:    0.10  // how high up its own feed it appeared — borrowed editorial judgement
};

export const RECENCY_HALFLIFE_HOURS = 20; // a story is worth half as much once this old
export const MAX_AGE_HOURS          = 48; // anything older is not this morning's news
export const MERGE_THRESHOLD        = 0.42; // similarity above which two items are one story
export const MAX_PER_OUTLET         = 2;  // no section is allowed to become one outlet's feed
export const SOFT_PENALTY           = 0.09; // recipes and reviews: kept, but never the lead

export const tierOf = o => (TIER[o] !== undefined ? TIER[o] : DEFAULT_TIER);

const STOP = new Set(('a an the and or but of in on at to for with from by as is are was were '+
  'be been that this these those it its his her their our your after before over under into '+
  'out up down new says said say more most than then them they he she we you not no has have '+
  'had will would could about across against among around back off through during how why '+
  'what when who which can may might just also amid first last next news report reports year '+
  'years day days time times week weeks make makes made take takes get gets one two three').split(' '));

export const tokens = s => String(s || '')
  .toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
  .filter(w => w.length > 2 && !STOP.has(w));

function overlap(a, b) {           // shared / smaller set — forgiving of length differences
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n / Math.min(a.size, b.size);
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n / (a.size + b.size - n);
}

export const hoursSince = iso => Math.max(0, (Date.now() - new Date(iso).getTime()) / 36e5);
export const outletCount = s => new Set([s.outlet, ...(s.also || [])]).size;

// ---------------------------------------------------------------------------
// Clustering.
//
// The naive version — token overlap between headlines — does not work, because
// outlets do not write the same headline. "Putin Meets Witkoff and Kushner in
// Moscow" and "US envoys set for Ukraine talks after meeting Putin in Moscow"
// share only three words out of twelve. What they do share is the RARE words:
// the names and places. So similarity leans on tokens that are uncommon across
// the whole pool, with plain overlap as a sanity check to stop every story
// mentioning Putin collapsing into one.
// ---------------------------------------------------------------------------
export function documentFrequency(items) {
  const df = new Map();
  items.forEach(s => new Set(tokens(s.headline)).forEach(t => df.set(t, (df.get(t) || 0) + 1)));
  return df;
}

const VERY_RARE_DF = 6; // a token in six headlines or fewer is close to an identifier

function rareSet(headline, df, poolSize) {
  // A token in more than ~2% of headlines carries little identity. The floor of 3
  // matters: on a small pool (a narrow custom topic, say) a proportional cutoff
  // collapses to nothing, every token stops counting as rare, and clustering
  // quietly stops working exactly when there is least data to spare.
  const cutoff = Math.max(3, poolSize * 0.02);
  return new Set(tokens(headline).filter(t => (df.get(t) || 0) <= cutoff));
}

export function similarity(rA, rB, allA, allB, df) {
  let shared = 0, sharedVeryRare = 0;
  for (const x of rA) if (rB.has(x)) {
    shared++;
    if ((df.get(x) || 0) <= VERY_RARE_DF) sharedVeryRare++;
  }
  if (shared < 2) return 0;              // one shared name is a coincidence, not a shared story
  // On a big college-football Saturday "Michigan" stops being rare, which was
  // sinking obvious duplicates below the threshold. Two headlines sharing a
  // genuinely uncommon phrase ("Hail Mary") are about the same event whatever
  // else differs, so very rare shared tokens get their own credit.
  return Math.min(1, 0.70 * overlap(rA, rB)
                   + 0.30 * jaccard(allA, allB)
                   + 0.15 * Math.min(1, sharedVeryRare / 2));
}

// Clustering runs ONCE over the whole pool, not per topic. Corroboration is a
// property of the news, not of the section you happen to be reading — and a
// story carried by the world desk at one outlet and the politics desk at another
// still has two outlets behind it.
//
// Comparing every pair is O(n²) and wasteful, so we only compare pairs that share
// at least two rare tokens — which is the merge precondition anyway. An inverted
// index over rare tokens gets us those pairs directly.
export function cluster(items, df, poolSize) {
  if (items.length < 2) return items;

  const rare = items.map(s => rareSet(s.headline, df, poolSize));
  const all  = items.map(s => new Set(tokens(s.headline)));

  const index = new Map();
  rare.forEach((set, i) => set.forEach(t => {
    if (!index.has(t)) index.set(t, []);
    index.get(t).push(i);
  }));

  const pairCount = new Map();
  for (const list of index.values()) {
    if (list.length > 40) continue;                  // a token this common is not identifying
    for (let a = 0; a < list.length; a++)
      for (let b = a + 1; b < list.length; b++) {
        const k = list[a] * items.length + list[b];
        pairCount.set(k, (pairCount.get(k) || 0) + 1);
      }
  }

  const parent = items.map((_, i) => i);
  const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));

  for (const [k, shared] of pairCount) {
    if (shared < 2) continue;
    const i = Math.floor(k / items.length), j = k % items.length;
    if (similarity(rare[i], rare[j], all[i], all[j], df) >= MERGE_THRESHOLD) parent[find(i)] = find(j);
  }

  const groups = new Map();
  items.forEach((s, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(s);
  });

  return [...groups.values()].map(g => {
    if (g.length === 1) return g[0];
    // The surviving card should be the best version of the story, not the first seen:
    // prefer a strong outlet that actually supplied a picture and a real summary.
    g.sort((a, b) =>
      (tierOf(b.outlet) + (b.image ? .3 : 0) + Math.min(.2, (b.summary || '').length / 1200)) -
      (tierOf(a.outlet) + (a.image ? .3 : 0) + Math.min(.2, (a.summary || '').length / 1200)));
    const head = { ...g[0] };
    const others = new Set(head.also || []);
    g.slice(1).forEach(x => {
      others.add(x.outlet);
      (x.also || []).forEach(o => others.add(o));
      if (!head.image && x.image) { head.image = x.image; head.imageCredit = x.imageCredit; head.imageKind = x.imageKind; }
      // Deliberately NOT borrowing another member's summary. Taking "the longest
      // summary in the cluster" once put a Guardian piece about home-insurance
      // subsidence claims underneath a headline about diesel prices: if a merge is
      // even slightly wrong, borrowed prose states things the linked article does
      // not. A card's words must come from the article the card links to.
      if (new Date(x.published) < new Date(head.published)) head.firstReported = x.published;
    });
    head.also = [...others].filter(o => o && o !== head.outlet);
    head.merged = g.length - 1;
    return head;
  });
}

// ---------------------------------------------------------------------------
// Topic fit. A feed-derived story declares its topic; a typed topic has to earn
// its match on whole words plus ordinary inflections. Stem-truncation looks
// clever and quietly matches "saturn" against "Saturday", so we don't do it.
// ---------------------------------------------------------------------------
export function topicFit(story, topic) {
  if (!topic.custom) {
    if (!story.topics || !story.topics.includes(topic.id)) return 0;
    return story.topics[0] === topic.id ? 1 : 0.7;
  }
  const hay = `${story.headline} ${story.summary || ''} ${story.outlet}`.toLowerCase();
  const terms = topic.id.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return 0;
  let hits = 0;
  for (const t of terms) {
    const safe = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${safe}(?:s|es|ed|ing|d)?\\b`).test(hay)) hits++;
  }
  return hits / terms.length;
}

export function score(story, topic) {
  const n    = outletCount(story);
  const corr = Math.min(1, Math.log2(n + 1) / Math.log2(9)); // 8 outlets ≈ saturated
  const rec  = Math.pow(0.5, hoursSince(story.published) / RECENCY_HALFLIFE_HOURS);
  return WEIGHTS.corroboration * corr
       + WEIGHTS.recency       * rec
       + WEIGHTS.sourceTier    * tierOf(story.outlet)
       + WEIGHTS.topicFit      * topicFit(story, topic)
       + WEIGHTS.prominence    * (story.prominence ?? 0.5)
       // Recipes and reviews belong in a cooking section but must not lead it.
       // Prominence alone carries too little weight to hold back a Guardian
       // review against a smaller trade outlet's actual news.
       - (story.soft ? SOFT_PENALTY : 0);
}

// A short, honest reason this story made the cut. It has to be true.
export function why(story) {
  const n = outletCount(story);
  if (n >= 2) return `Covered by ${n} outlets`;
  const age = hoursSince(story.published);
  if (age < 2) return 'Just in';
  if (age < 7) return 'Filed this morning';
  // This measures position in the OUTLET's own feed, not rank in our section.
  // "Leading its section" read as an exclusive claim and appeared on four of five
  // cards at once; the threshold is tight so it stays a real distinction.
  if ((story.prominence ?? 0) >= 0.97) return `Front page at ${story.outlet}`;
  return `Only in ${story.outlet}`;
}

// ---------------------------------------------------------------------------
// Assembly. Three passes so no section can quietly poach a story out from under
// the section it actually belongs to, plus a per-outlet cap so one prolific feed
// cannot become the entire section. A story appears once in the brief.
// ---------------------------------------------------------------------------
// Collapse the pool into unique stories, each carrying every outlet that ran it.
// Do this once, before any topic is considered.
export function clusterPool(pool) {
  const df = documentFrequency(pool);
  return cluster(pool, df, pool.length);
}

// A softer test than merging, used only when filling a section. A match report
// and a reaction column on the same match share the names but not the wording,
// so they survive clustering and then take two of five Sport slots between them.
// Same event, second slot: skip it.
const SAME_EVENT_THRESHOLD = 0.3;
function sameEvent(a, b, df, poolSize) {
  const rA = rareSet(a.headline, df, poolSize), rB = rareSet(b.headline, df, poolSize);
  return similarity(rA, rB, new Set(tokens(a.headline)), new Set(tokens(b.headline)), df)
         >= SAME_EVENT_THRESHOLD;
}

export function assemble(clustered, topics, perTopic = 5) {
  const df = documentFrequency(clustered);
  const used = new Set();
  const picks = topics.map(() => []);

  const candidates = topic => clustered
    .filter(s => !used.has(s.key))
    .map(s => ({ ...s, _fit: topicFit(s, topic) }))
    .filter(s => s._fit > (topic.custom ? 0.34 : 0))
    .map(s => ({ ...s, _score: score(s, topic) }));

  const take = (i, topic, list) => {
    const room = perTopic - picks[i].length;
    if (room <= 0) return;
    const ranked = list.sort((a, b) => b._score - a._score);

    const counts = new Map();
    picks[i].forEach(s => counts.set(s.outlet, (counts.get(s.outlet) || 0) + 1));

    const chosen = [];
    const already = () => picks[i].concat(chosen);
    for (const s of ranked) {
      if (chosen.length >= room) break;
      const c = counts.get(s.outlet) || 0;
      if (c >= MAX_PER_OUTLET) continue;          // keep a section from becoming one masthead
      if (already().some(p => sameEvent(p, s, df, clustered.length))) continue;
      counts.set(s.outlet, c + 1);
      chosen.push(s);
    }
    // If the guards starved the section, relax them rather than ship a short brief.
    if (chosen.length < room) {
      for (const s of ranked) {
        if (chosen.length >= room) break;
        if (!chosen.includes(s)) chosen.push(s);
      }
    }
    chosen.forEach(s => used.add(s.key));
    picks[i] = picks[i].concat(chosen);
  };

  // 1. A topic you typed yourself is more specific than any preset, so it picks first.
  topics.forEach((t, i) => { if (t.custom) take(i, t, candidates(t)); });
  // 2. Each preset claims the stories whose primary topic it is.
  topics.forEach((t, i) => {
    if (!t.custom) take(i, t, candidates(t).filter(s => s.topics && s.topics[0] === t.id));
  });
  // 3. Anything still short fills from cross-listed stories.
  topics.forEach((t, i) => take(i, t, candidates(t)));

  const sections = topics.map((t, i) => ({
    topic: t,
    stories: picks[i].sort((a, b) => b._score - a._score).map(s => ({ ...s, why: why(s) }))
  }));

  // Top of the brief must be a digest ACROSS topics. Taking the globally
  // highest-scoring three just reprinted World's top three verbatim, because
  // World has the deepest corroboration and always wins outright. One per
  // section, best sections first.
  const top = sections
    .filter(s => s.stories.length)
    .map(s => ({ ...s.stories[0], topicLabel: s.topic.label }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 3);

  return { sections, top };
}
