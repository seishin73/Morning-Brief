// Fetching, parsing, image resolution and summarising. Everything that turns a
// list of feed URLs into scoreable stories.

import { FEEDS, TOPICS, searchFeed, OUTLET_BY_HOST, GRIM } from './sources.js';
import { MAX_AGE_HOURS, hoursSince } from './rank.js';

const UA = 'MorningBrief/1.0 (personal news reader; +http://localhost)';

// A feed is broader than its name. The Guardian's US-news feed carries tennis;
// the NYT business feed carries food-safety recalls. The article URL almost
// always names the real section, so trust the URL over the feed we found it in.
const SECTION_HINTS = [
  [/\/(sports?|football|soccer|nfl|nba|mlb|nhl|tennis|golf|cricket|rugby|olympics|boxing|f1|formulaone)(\/|-)/i, 'sport'],
  [/\/(politics|us-politics|elections?|congress|white-?house)(\/|-)/i, 'politics'],
  [/\/(business|economy|markets?|money(watch)?|finance|economics|investing)(\/|-)/i, 'economy'],
  [/\/(technology|tech|gadgets|artificial-intelligence|computing)(\/|-)/i, 'tech'],
  [/\/(science|space|astronomy|physics|biology|environment|climate)(\/|-)/i, 'science'],
  [/\/(health|wellness|medicine|medical|disease)(\/|-)/i, 'health'],
  [/\/(food|dining|recipes?|drinks?|restaurants?|cooking|wine)(\/|-)/i, 'food'],
  [/\/(film|movies?|tv|television|entertainment|arts?|culture|music|celebrity)(\/|-)/i, 'film'],
  [/\/(odd|offbeat|weird|strange|quirky)(\/|-)/i, 'offbeat'],
  [/\/(travel|tourism|destinations)(\/|-)/i, 'world'],
  [/\/(media|press|television)(\/|-)/i, 'film'],
  [/\/(world|international|global|africa|asia|europe|middleeast|middle-east|americas|uk-news)(\/|-)/i, 'world']
];

// Crime and court reporting arrives through general news and US-news feeds, which
// are wired to Politics — so a filicide mistrial ends up anchoring the politics
// section. It is news, but it is not politics; send it to the general desk.
const CRIME = /\b(murder|manslaughter|homicide|trial|mistrial|verdict|jury|convicted|acquitted|sentenced|indicted|arraigned|charged with|pleads? guilty|stabbing|shooting)\b/i;

const RECIPE = /\b(recipes?|how to make|one-pot|sheet-pan|weeknight|tasted and rated|taste test|best supermarket|my favou?rite way|cook(ing|s)? (with|this)|\d+-minute|restaurant review|[-–—]\s*review\b)\b/i;

// Feeds that are cookery columns rather than newsrooms. Nothing wrong with them —
// a cooking section should carry recipes — but they should not outrank an actual
// food-industry story for the lead slot, and headline matching alone missed
// "For the Crispiest Breaded Chicken, I Skip the 3-Step Method".
const RECIPE_FEED = /thekitchn|bonappetit|seriouseats|DiningandWine|\/food\/rss/i;

// The NYT files a Route 66 travel feature and a Fox News personnel story under
// /business/, so the URL rule sends both to Economy. If a story in Economy has no
// economic vocabulary anywhere in it, it isn't an economy story.
// Tested against the HEADLINE only. A Route 66 travel feature whose summary
// happens to say tourists keep "war, inflation and politics in the rearview" is
// not an economics story; a passing mention is not a subject.
const ECON_TERMS = /\b(econom\w*|market\w*|stocks?|shares?|inflation|jobs?|hiring|payrolls?|unemploy\w*|earnings|revenue|profits?|merger|acquisition|layoffs?|tariffs?|trade|bank\w*|fed|interest rates?|gdp|prices?|pricing|ipo|bonds?|currency|budget|taxe?s?|investors?|sales|wages?|recession|debt|loans?|mortgages?|credit|pensions?|retirement|savings|401|funding|valuation|shareholders?|billion|million|\$\d)/i;

// Things that are published by news outlets but are not news stories. A brief
// that opens with a geography quiz is not a brief.
const NOISE = [
  /^(watch|video|listen|podcast|quiz|photos?|gallery|live|recap|poll|opinion|editorial|analysis|comment|letters|review|obituary|weather)\s*[:—-]/i,
  /\b(follow live|live updates?|live blog|as it happened|liveblog|minute-by-minute)\b/i,
  /^\d+\s+(best|worst|things|ways|facts|reasons|of the|places|tips)/i,
  /\b(quiz|crossword|wordle|sudoku|horoscope|puzzle answers?)\b/i,
  /\b(what to (watch|stream|read|cook)|best deals?|deal of the day|shopping guide|gift guide)\b/i,
  // Affiliate and commerce posts wearing a news headline.
  /(\$\d[\d,.]*\s*(gets you|off|for life)|lifetime (licen[cs]e|subscription|access)|\d+%\s*off|save \$\d|on sale (now|for)|coupon|promo code)/i,
  // Content-farm phrasing: pure SEO recipe and "one weird trick" constructions.
  /^(forget|stop|never|this is|here'?s|the (one|only|secret|unexpected|hands-down|surprising))\b.{0,60}\b(you|your|we|us)\b/i,
  /\b(newsletter|morning briefing|evening briefing|daily digest|week in (photos|pictures))\b/i,
  // Comment prompts and discussion threads dressed as headlines.
  /\b(we welcome|what do you think|your takes?|have your say|tell us|join the (debate|conversation)|reader'?s? (poll|picks)|weigh in)\b/i,
  // Fixtures, streaming listings and betting cards are schedules, not stories.
  /\b(live ?stream|where to watch|how to watch|watch online|tv channel|start time|odds|against the spread|betting|predictions?|expert picks|team news|line-?ups?)\b/i,
  /^(the )?best .{0,40}\b(of|for)\b\s*(20\d\d)?$/i
];
const NOISE_URL = /\/(commentisfree|opinion|editorial|crosswords?|puzzles?|games|horoscopes?|newsletters?|live)\//i;

const isNoise = s => NOISE.some(r => r.test(s.headline)) || NOISE_URL.test(s.url);

// Re-file a story onto the section its own URL says it belongs to.
function retopic(story) {
  for (const [re, id] of SECTION_HINTS) {
    if (re.test(story.url)) {
      if (story.topics[0] !== id) story.topics = [id, ...story.topics.filter(t => t !== id)];
      break;
    }
  }
  if (story.topics[0] === 'politics' && CRIME.test(story.headline)) {
    story.topics = ['world', ...story.topics.filter(t => t !== 'world')];
  }
  // Recipes and taste tests belong in a cooking section — they are just not the
  // most important thing that happened in food today. Keep them, don't lead with them.
  if (story.topics[0] === 'food' &&
      (RECIPE.test(story.headline) || RECIPE_FEED.test(story.feedUrl || ''))) {
    story.prominence *= 0.2;
    story.soft = true;   // keep it in the section, but it must not lead
  }
  if (story.topics[0] === 'economy' && !ECON_TERMS.test(story.headline)) {
    story.topics = ['world', ...story.topics.filter(t => t !== 'world')];
  }
  return story;
}

// ---------------------------------------------------------------- small utils

async function fetchText(url, ms = 12000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      redirect: 'follow',
      headers: { 'user-agent': UA, accept: 'application/rss+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.5' }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', eacute: 'é'
};

export function decode(s = '') {
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z]+);/gi, (m, n) => (ENTITIES[n.toLowerCase()] !== undefined ? ENTITIES[n.toLowerCase()] : m));
}

const stripTags = s => decode(String(s || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

// Feed descriptions are HTML, and several outlets pack a standfirst, the opening
// paragraph and a list of "related article" cross-links into one blob. Flattening
// that naively glues a teaser question into the middle of a sentence:
//   "…after 6 September deadline What are the new EU border checks? Travellers…"
// So: drop cross-link lists and captions outright, turn block boundaries into real
// sentence breaks, and only then strip what's left.
const BRK = '\u0001'; // marks a block boundary, inserted before tags are stripped

function cleanDescription(html) {
  let s = String(html || '');
  // Cross-link lists, pull quotes and image captions are not part of the story.
  s = s.replace(/<(ul|ol|figure|figcaption|aside|table|blockquote)\b[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/<li\b[\s\S]*?<\/li>/gi, ' ');
  // Mark where one block ended and the next began, then flatten what's left.
  s = s.replace(/<\/(p|div|h[1-6])\s*>/gi, BRK).replace(/<br\s*\/?>/gi, BRK);
  s = stripTags(s);
  // WordPress feeds append "The post <title> appeared first on <site>." to the
  // description. It is plumbing, not reporting.
  s = s.replace(/\s*The post\b[\s\S]*?appeared first on[\s\S]*$/i, '')
       .replace(/\s*The post\s+[\s\S]{0,200}$/i, m => (/\bappeared\b/i.test(m) ? '' : m));
  return s
    .split(BRK)
    .map(part => part.trim())
    .filter(Boolean)
    // Give each block a real ending \u2014 but a block that stops on a dangling
    // conjunction was truncated upstream, and closing it with a full stop makes
    // "...allows ranchers and." read as a finished sentence. Mark it as cut.
    .map(part => /[.!?:;"'\u2019\u201d\u2026]$/.test(part) ? part
               : /\b(and|or|but|with|for|to|of|in|on|at|by|from|as|that|the|a|an|its|their)$/i.test(part)
                 ? part + '\u2026' : part + '.')
    .join(' ')
    .replace(/^[\s\u2022\u00b7\-\u2013\u2014]+/, '') // leading bullet left by a stripped list
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/\.{2,}/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decode(m[1]).trim() : '';
}
function attr(block, name, a) {
  const m = block.match(new RegExp(`<${name}[^>]*\\s${a}=["']([^"']+)["']`, 'i'));
  return m ? decode(m[1]) : '';
}

export function outletFor(url, fallback = '') {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    for (const [h, name] of Object.entries(OUTLET_BY_HOST)) if (host.endsWith(h)) return name;
    return fallback || host.split('.').slice(0, -1).join('.').replace(/^\w/, c => c.toUpperCase());
  } catch { return fallback || 'Unknown'; }
}

// ------------------------------------------------------------- feed parsing

// Feeds hand out thumbnail-sized images — the Guardian ships 140px wide, which we
// then stretch across a 700px lead slot at 5x and it looks like mud. Most news CDNs
// take the size in the URL, so ask for something worth rendering.
function upscale(url) {
  if (!url) return url;
  // Signed CDN URLs (the Guardian's carry an `s=` hash over the exact query) reject
  // any edit — asking for a bigger width returns a 403 and the card falls back to a
  // "photo unavailable" plate, which is worse than a soft image. Leave them alone.
  if (/[?&]s=[0-9a-f]{16,}/i.test(url)) return url;

  let u = url;
  // BBC sizes in the path, not the query, so there is nothing to invalidate.
  if (/ichef\.bbci\.co\.uk/.test(u)) {
    u = u.replace(/\/(ic\/)?([a-z_]+)\/(\d+)(x\d+)?\//i, (m, ic, kind, w, h) =>
      `/${ic || ''}${kind}/1024${h ? 'x576' : ''}/`);
  }
  return u
    .replace(/([?&](?:w|width|max-?width)=)\d+/gi, (m, p) => p + '1200')
    .replace(/([?&]resize=)\d+((?:%2C|,))\d+/gi, '$11200$2800');
}

function imageFrom(block) {
  // Feeds routinely offer the same photo at several sizes — the Guardian ships a
  // 140px thumbnail first and a 1000px master later in the same item. Taking the
  // first match got us a 140px source stretched across a 700px slot. Collect them
  // all and take the widest; the declared width attribute decides.
  const sized = [];
  const re = /<(media:content|media:thumbnail|enclosure)\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(block))) {
    const a = m[2];
    const url = (a.match(/\surl=["']([^"']+)["']/i) || [])[1];
    if (!url) continue;
    const w = parseInt((a.match(/\swidth=["']?(\d+)/i) || [])[1] || '0', 10);
    sized.push({ url: decode(url), w });
  }
  const usable = sized.filter(x => !/\.(mp3|mp4|m4a|mpga|wav|mov)/i.test(x.url));
  if (usable.length) {
    usable.sort((a, b) => b.w - a.w);
    const best = usable.find(x => /\.(jpe?g|png|webp|avif)/i.test(x.url)) || usable[0];
    return upscale(best.url);
  }
  const href = attr(block, 'image', 'href');
  if (href) return upscale(href);
  const body = tag(block, 'content:encoded') || tag(block, 'description') || tag(block, 'summary');
  const img = body.match(/<img[^>]+src=["']([^"']+)["']/i);
  return img ? upscale(decode(img[1])) : '';
}

export function parseFeed(xml, feedUrl, topicId) {
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || [];
  const feedOutlet = outletFor(feedUrl);
  const out = [];

  blocks.forEach((b, i) => {
    let headline = stripTags(tag(b, 'title'));
    let link = tag(b, 'link') || attr(b, 'link', 'href') || tag(b, 'guid');
    const published = tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') ||
                      tag(b, 'dc:date') || new Date().toISOString();

    // Google News encodes the publisher two ways; prefer the explicit <source>.
    // Several feeds reuse <source> for photo credits ("© Ammar Awad, Reuters"),
    // which would otherwise be counted as an outlet and inflate corroboration.
    const srcRaw = stripTags(tag(b, 'source'));
    const srcName = (srcRaw && !/[©@]|screen ?(capture|grab)|\bvia\b|getty|handout/i.test(srcRaw) &&
                     !srcRaw.includes(',') && srcRaw.split(/\s+/).length <= 5) ? srcRaw : '';
    let outlet = feedOutlet;
    if (/news\.google\.com/.test(feedUrl)) {
      outlet = srcName || outletFor(attr(b, 'source', 'url'), '') || 'Google News';
      const dash = headline.lastIndexOf(' - ');
      if (dash > 20) headline = headline.slice(0, dash).trim();
    } else if (srcName && srcName.length < 40) {
      outlet = srcName;
    }

    if (!headline || !link || !/^https?:/i.test(link)) return;
    const when = new Date(published);
    if (isNaN(when)) return;
    if (hoursSince(when.toISOString()) > MAX_AGE_HOURS) return;

    const summary = cleanDescription(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content:encoded'))
      .replace(/\s*(Continue reading\.*|Read more.*)$/i, '');

    out.push({
      headline,
      url: link.split('?utm')[0],
      outlet,
      topics: [topicId],
      feedUrl,
      // A handful of feeds stamp items slightly in the future; clamp so the page
      // never says a story published two hours from now arrived "1m ago".
      published: new Date(Math.min(when.getTime(), Date.now())).toISOString(),
      summary,
      image: imageFrom(b),
      imageCredit: '',
      prominence: Math.max(0.25, 1 - i / 22), // position in its own feed = borrowed editorial judgement
      also: []
    });
  });
  return out;
}

// -------------------------------------------------------------- image lookup

const ogCache = new Map();
const wikiCache = new Map();

async function ogImage(url) {
  if (ogCache.has(url)) return ogCache.get(url);
  let found = '';
  try {
    const html = await fetchText(url, 8000);
    const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
              html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
              html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
    if (m) found = decode(m[1]);
  } catch { /* publishers block bots constantly; a miss is normal, not an error */ }
  ogCache.set(url, found);
  return found;
}

// Proper nouns from the headline, longest first — the most likely article subject.
function entities(headline) {
  const words = headline.replace(/[^\w\s'’-]/g, ' ').split(/\s+/);
  const runs = [];
  let run = [];
  words.forEach((w, i) => {
    if (/^[A-Z][a-z’'-]{2,}$/.test(w) && !(i === 0 && words.length > 3)) run.push(w);
    else { if (run.length) runs.push(run.join(' ')); run = []; }
  });
  if (run.length) runs.push(run.join(' '));
  return runs.sort((a, b) => b.length - a.length).slice(0, 3);
}

// Wikipedia is CORS-friendly, never blocks us, and its images are freely licensed.
async function wikiImage(titles) {
  const key = titles.join('|');
  if (wikiCache.has(key)) return wikiCache.get(key);
  let result = null;
  try {
    const api = 'https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1' +
      '&prop=pageimages&piprop=thumbnail&pithumbsize=1000&titles=' +
      encodeURIComponent(titles.join('|'));
    const json = JSON.parse(await fetchText(api, 8000));
    const pages = Object.values(json?.query?.pages || {});
    for (const t of titles) {
      const hit = pages.find(p => p.title?.toLowerCase() === t.toLowerCase() && p.thumbnail?.source);
      if (hit) { result = { src: hit.thumbnail.source, credit: `${hit.title} · Wikimedia Commons` }; break; }
    }
    if (!result) {
      const any = pages.find(p => p.thumbnail?.source);
      if (any) result = { src: any.thumbnail.source, credit: `${any.title} · Wikimedia Commons` };
    }
  } catch { /* ignore */ }
  wikiCache.set(key, result);
  return result;
}

// Resolve a picture for every story that still lacks one. Feed image, then the
// article's own og:image, then a freely-licensed photo of the subject. Anything
// still empty renders as a designed plate rather than a broken box.
export async function resolveImages(stories, { deep = true, deadline = Infinity } = {}) {
  const missing = stories.filter(s => !s.image);
  const limit = 6;
  for (let i = 0; i < missing.length; i += limit) {
    // Serverless functions are billed against a hard ceiling, and chasing photos
    // for the last few cards is the least important work here. Stop when out of
    // budget: those cards fall back to a designed plate rather than a timeout.
    if (Date.now() > deadline) break;
    await Promise.all(missing.slice(i, i + limit).map(async s => {
      if (deep) {
        const og = await ogImage(s.url);
        if (og) { s.image = og; s.imageCredit = s.outlet; return; }
      }
      const ents = entities(s.headline);
      if (ents.length) {
        const w = await wikiImage(ents);
        if (w) { s.image = w.src; s.imageCredit = w.credit; s.imageKind = 'subject'; }
      }
    }));
  }
  return stories;
}

// ----------------------------------------------------------------- summaries

function trimSentences(text, max = 3) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const parts = clean.split(/(?<=[.!?])\s+(?=[A-Z"“'])/).slice(0, max);
  let out = parts.join(' ').trim();
  if (out.length > 420) out = out.slice(0, 417).replace(/\s+\S*$/, '') + '…';
  // Never end on a dangling connective with a full stop pretending to be a period.
  out = out.replace(/\s+\b(and|or|but|with|for|to|of|in|on|at|by|from|as|that|the|a|an)\s*\.$/i, '…');
  return out;
}

const TEASER = /(here'?s what we know|read on|find out|you won'?t believe|click here|continue reading|what to know)/i;

// If an Anthropic key is present we rewrite summaries properly; otherwise the
// feed's own description is cleaned up. Either way a card is never empty.
export async function summarise(stories) {
  const key = process.env.ANTHROPIC_API_KEY;
  stories.forEach(s => { s.summary = trimSentences(s.summary.replace(TEASER, '').trim()); });

  if (!key) return stories;

  const need = stories.filter(s => s.summary.length < 240);
  for (let i = 0; i < need.length; i += 12) {
    const batch = need.slice(i, i + 12);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-5',
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: 'For each numbered item write a 2-3 sentence news summary: what happened and ' +
              'why it matters. Neutral, informative, no teaser language, no "here\'s what we know". ' +
              'Use only the information given. Reply as a JSON array of strings, same order, nothing else.\n\n' +
              batch.map((s, n) => `${n + 1}. ${s.headline}\n${s.summary}`).join('\n\n')
          }]
        })
      });
      const json = await res.json();
      const text = json?.content?.[0]?.text || '';
      const arr = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1));
      arr.forEach((t, n) => { if (batch[n] && typeof t === 'string' && t.length > 40) batch[n].summary = t; });
    } catch { /* keep the feed description */ }
  }
  return stories;
}

// ------------------------------------------------------------------ the pool

export async function gather(topicIds, customQueries = [], onProgress = () => {}, opts = {}) {
  const { feedTimeout = 12000, concurrency = 8 } = opts;
  const jobs = [];
  topicIds.forEach(id => (FEEDS[id] || []).forEach(url => jobs.push({ url, topicId: id })));
  // Never trust a client-side length cap.
  customQueries.map(q => String(q).slice(0, 40))
    .forEach(q => jobs.push({ url: searchFeed(q), topicId: '__custom__', custom: q }));

  const results = [];
  const failures = [];
  const limit = concurrency;
  let done = 0;

  for (let i = 0; i < jobs.length; i += limit) {
    await Promise.all(jobs.slice(i, i + limit).map(async job => {
      try {
        const xml = await fetchText(job.url, feedTimeout);
        results.push(...parseFeed(xml, job.url, job.topicId));
      } catch (e) {
        failures.push({ feed: job.url, error: String(e.message || e).slice(0, 80) });
      } finally {
        onProgress(++done, jobs.length);
      }
    }));
  }

  // One story can legitimately appear in several topic feeds; merge those first.
  const byUrl = new Map();
  for (const raw of results) {
    if (isNoise(raw)) continue;
    const s = raw.topics[0] === '__custom__' ? raw : retopic(raw);
    const k = s.url.replace(/#.*$/, '');
    const prev = byUrl.get(k);
    if (!prev) { byUrl.set(k, { ...s, key: k }); continue; }
    prev.topics = [...new Set([...prev.topics, ...s.topics])];
    if (!prev.image && s.image) prev.image = s.image;
    if ((s.summary || '').length > (prev.summary || '').length) prev.summary = s.summary;
    prev.prominence = Math.max(prev.prominence, s.prominence);
  }

  let pool = [...byUrl.values()].filter(s => s.topics[0] !== '__custom__' || true);

  // The offbeat lane is never grim. Enforced, not encouraged.
  pool = pool.filter(s => !(s.topics.includes('offbeat') &&
                            GRIM.test(s.headline + ' ' + s.summary)));

  return { pool, failures, feedsTried: jobs.length };
}

export { TOPICS };
