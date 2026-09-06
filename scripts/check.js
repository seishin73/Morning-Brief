// Diagnostic: which feeds answer, what they give us, and how the ranking behaves.
// Run with:  node scripts/check.js

import { gather, resolveImages } from '../src/pipeline.js';
import { assemble, clusterPool, outletCount } from '../src/rank.js';
import { TOPICS } from '../src/sources.js';

const t0 = Date.now();
const { pool, failures, feedsTried } = await gather(Object.keys(TOPICS));
console.log(`\nFEEDS  ${feedsTried - failures.length}/${feedsTried} ok in ${((Date.now()-t0)/1000).toFixed(1)}s`);
if (failures.length) {
  console.log('\nFAILED');
  failures.forEach(f => console.log('  ', f.feed.replace(/^https?:\/\//, '').slice(0, 58), '→', f.error));
}

console.log(`\nPOOL   ${pool.length} stories`);
for (const id of Object.keys(TOPICS)) {
  const n = pool.filter(s => s.topics.includes(id)).length;
  const withImg = pool.filter(s => s.topics.includes(id) && s.image).length;
  console.log(`  ${TOPICS[id].padEnd(18)} ${String(n).padStart(4)} stories  ${String(withImg).padStart(4)} with feed image`);
}

const tc = Date.now();
const clustered = clusterPool(pool);
const merged = clustered.filter(s => s.merged);
console.log(`\nCLUSTER  ${pool.length} → ${clustered.length} stories in ${Date.now()-tc}ms  (${merged.length} multi-outlet)`);
[...merged].sort((a,b) => outletCount(b) - outletCount(a)).slice(0, 8).forEach(s =>
  console.log(`   [${String(outletCount(s)).padStart(2)}] ${s.headline.slice(0,62)}\n        ${[s.outlet, ...s.also].slice(0,8).join(', ')}`));

const topics = Object.keys(TOPICS).map(id => ({ id, label: TOPICS[id], custom: false }));
const { sections, top } = assemble(clustered, topics);
const shown = sections.flatMap(s => s.stories);
await resolveImages(shown);

console.log('\nASSEMBLED');
sections.forEach(s => {
  console.log(`\n  ${s.topic.label.toUpperCase()}  (${s.stories.length})`);
  s.stories.forEach(x => {
    console.log(`    [${String(outletCount(x)).padStart(2)}] ${x.headline.slice(0, 74)}`);
    console.log(`         ${x.outlet} · ${x.why} · img:${x.image ? (x.imageKind || 'feed') : 'NONE'}`);
  });
});

const noImg = shown.filter(s => !s.image).length;
const noSum = shown.filter(s => !s.summary || s.summary.length < 40).length;
const urls  = new Set(shown.map(s => s.url));
console.log('\nQUALITY');
console.log(`  stories shown      ${shown.length}`);
console.log(`  unique urls        ${urls.size}`);
console.log(`  missing image      ${noImg}`);
console.log(`  thin summary       ${noSum}`);
console.log(`  top of brief       ${top.map(t => t.headline.slice(0, 40)).join(' | ')}`);
console.log(`  total time         ${((Date.now()-t0)/1000).toFixed(1)}s\n`);
