// Morning Brief — local server.
// Node 26+, zero npm dependencies. Start with:  node server.js

import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gather, resolveImages, summarise } from './src/pipeline.js';
import { assemble, clusterPool } from './src/rank.js';
import { TOPICS } from './src/sources.js';

const DIR  = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4173;
const POOL_TTL_MS = 20 * 60 * 1000;      // refetch feeds at most every 20 minutes
// Hosted platforms mount the deployment read-only, so the cache goes to the
// system temp directory there. Locally it stays beside the project where it is
// easy to inspect and delete.
const CACHE_FILE  = process.env.VERCEL
  ? path.join(os.tmpdir(), 'morning-brief-pool.json')
  : path.join(DIR, '.cache', 'pool.json');

const MIME = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
               '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml',
               '.ico':'image/x-icon', '.json':'application/json; charset=utf-8' };

// ---------------------------------------------------------------- pool cache
// Feeds are shared across readers and change slowly. Fetching them once per
// window and assembling on demand is the difference between a snappy topic
// change and a thirty-second wait every time you tick a box.
let pool = { stories: [], at: 0, failures: [], feedsTried: 0 };

async function loadCache() {
  try {
    const raw = JSON.parse(await fs.readFile(CACHE_FILE, 'utf8'));
    if (Date.now() - raw.at < POOL_TTL_MS * 3) { pool = raw; log(`cache: ${raw.stories.length} stories restored`); }
  } catch { /* first run */ }
}
async function saveCache() {
  try {
    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(pool));
  } catch { /* non-fatal */ }
}

const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);

let inflight = null;
async function ensurePool(force = false) {
  if (!force && pool.stories.length && Date.now() - pool.at < POOL_TTL_MS) return pool;
  if (inflight) return inflight;

  inflight = (async () => {
    const t0 = Date.now();
    log('fetching feeds…');
    const { pool: stories, failures, feedsTried } =
      await gather(Object.keys(TOPICS), [], (n, total) => {
        if (n === total) log(`feeds: ${n}/${total} done`);
      });
    pool = { stories, at: Date.now(), failures, feedsTried };
    log(`pool: ${stories.length} stories from ${feedsTried - failures.length}/${feedsTried} feeds in ${((Date.now()-t0)/1000).toFixed(1)}s`);
    if (failures.length) log(`failed feeds: ${failures.length}`);
    saveCache();
    inflight = null;
    return pool;
  })();
  return inflight;
}

// Custom topics are fetched on demand — one Google News search each — and merged
// into whatever the preset feeds already gave us.
async function withCustom(base, queries) {
  if (!queries.length) return base;
  const { pool: extra } = await gather([], queries);
  const seen = new Set(base.map(s => s.key));
  return base.concat(extra.filter(s => !seen.has(s.key)));
}

// --------------------------------------------------------------------- routes

async function apiBrief(url) {
  const ids = (url.searchParams.get('topics') || 'world,politics,economy,tech,science,offbeat')
    .split(',').map(s => s.trim()).filter(s => TOPICS[s]);
  const customs = (url.searchParams.get('custom') || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean).slice(0, 10);
  const order = (url.searchParams.get('order') || '').split(',').filter(Boolean);

  const base = await ensurePool(url.searchParams.get('refresh') === '1');
  const stories = await withCustom(base.stories, customs);

  let topics = [
    ...ids.map(id => ({ id, label: TOPICS[id], custom: false })),
    ...customs.map(q => ({ id: q, label: q.replace(/\b\w/g, c => c.toUpperCase()), custom: true }))
  ];
  if (order.length) {
    topics.sort((a, b) => {
      const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }
  topics = topics.slice(0, 10);

  // Collapse duplicates across the WHOLE pool before any topic is considered —
  // corroboration is a property of the news, not of the section you are reading.
  const clustered = clusterPool(stories);
  const { sections, top } = assemble(clustered, topics);

  // Only now do the expensive per-article work, and only for what survived.
  const shown = sections.flatMap(s => s.stories);
  await resolveImages(shown);
  await summarise(shown);
  top.forEach(t => {
    const m = shown.find(s => s.key === t.key);
    if (m) { t.image = m.image; t.imageCredit = m.imageCredit; t.imageKind = m.imageKind; t.summary = m.summary; }
  });

  return {
    builtAt: new Date().toISOString(),
    fetchedAt: new Date(base.at).toISOString(),
    poolSize: stories.length,
    feedsTried: base.feedsTried,
    feedsFailed: base.failures.length,
    failures: base.failures.slice(0, 12),
    topics: Object.entries(TOPICS).map(([id, label]) => ({
      id, label, available: stories.filter(s => s.topics.includes(id)).length
    })),
    sections, top
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const send = (code, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(body);
  };

  try {
    if (url.pathname === '/api/brief') {
      const t0 = Date.now();
      const data = await apiBrief(url);
      const shown = data.sections.reduce((n, s) => n + s.stories.length, 0);
      const multi = data.sections.reduce((n, s) => n + s.stories.filter(x => x.also?.length).length, 0);
      log(`brief: ${data.sections.length} sections, ${shown} stories (${multi} multi-outlet) in ${((Date.now()-t0)/1000).toFixed(1)}s`);
      return send(200, JSON.stringify(data));
    }
    if (url.pathname === '/api/health') {
      return send(200, JSON.stringify({
        ok: true, pooled: pool.stories.length,
        ageMinutes: pool.at ? Math.round((Date.now() - pool.at) / 60000) : null,
        feedsFailed: pool.failures.length
      }));
    }

    const rel = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = path.join(DIR, 'public', path.normalize(rel).replace(/^([/\\])+/, ''));
    if (!file.startsWith(path.join(DIR, 'public'))) return send(403, 'Forbidden', 'text/plain');
    const body = await fs.readFile(file);
    return send(200, body, MIME[path.extname(file)] || 'application/octet-stream');
  } catch (err) {
    if (err.code === 'ENOENT') return send(404, 'Not found', 'text/plain');
    log('error:', err.message);
    return send(500, JSON.stringify({ error: err.message }));
  }
});

await loadCache();
server.listen(PORT, () => {
  log(process.env.VERCEL ? `Morning Brief listening on :${PORT}` : `Morning Brief on http://localhost:${PORT}`);
  // Warm the pool at boot so the first reader doesn't wait on seventy feeds.
  ensurePool().catch(e => log('initial fetch failed:', e.message));
});
