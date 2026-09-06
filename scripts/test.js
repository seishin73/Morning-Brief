// Tests for the parts that decide what you read: clustering, ranking, assembly,
// topic matching and the noise filter. Run with:  node scripts/test.js
// No framework — this is a small enough surface to check by hand.

import { clusterPool, assemble, topicFit, score, why, outletCount, documentFrequency, similarity, tokens }
  from '../src/rank.js';
import { parseFeed, decode, outletFor } from '../src/pipeline.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '\n        ' + detail : ''}`); }
};
const group = n => console.log(`\n${n}`);

const story = (o = {}) => ({
  key: o.url || Math.random().toString(36),
  headline: 'x', url: 'https://example.com/a', outlet: 'Reuters',
  topics: ['world'], published: new Date().toISOString(),
  summary: '', image: '', prominence: 0.5, also: [], ...o
});

// ---------------------------------------------------------------- clustering
group('clustering');
{
  // Real headlines from three outlets covering one event, written differently.
  const pool = [
    story({ url: 'a', outlet: 'The New York Times', headline: 'Putin Meets Witkoff and Kushner in Moscow to Discuss Ukraine War' }),
    story({ url: 'b', outlet: 'BBC News',           headline: 'US envoys set for Ukraine talks after meeting Putin in Moscow' }),
    story({ url: 'c', outlet: 'NPR',                headline: 'U.S. envoys in Moscow in new push for peace between Russia and Ukraine' }),
    story({ url: 'd', outlet: 'ESPN',               headline: 'Bryce Underwood delivers stunning TD on Hail Mary in Michigan comeback win' }),
    story({ url: 'e', outlet: 'CBS Sports',         headline: 'Michigan stuns Western Michigan on Hail Mary as clock review looms large' }),
    story({ url: 'f', outlet: 'The Guardian',       headline: 'Ministers plan to slash paperwork rules for small UK businesses' })
  ];
  const out = clusterPool(pool);
  const moscow = out.find(s => /Moscow|envoys/i.test(s.headline));
  const hail   = out.find(s => /Hail Mary/i.test(s.headline));
  const uk     = out.find(s => /paperwork/i.test(s.headline));

  ok('three Moscow reports collapse to one story', outletCount(moscow) === 3,
     `got ${outletCount(moscow)} outlets: ${[moscow.outlet, ...moscow.also].join(', ')}`);
  ok('two Hail Mary reports collapse to one story', outletCount(hail) === 2,
     `got ${outletCount(hail)} outlets`);
  ok('unrelated story is left alone', outletCount(uk) === 1);
  ok('pool shrinks to three distinct stories', out.length === 3, `got ${out.length}`);
}
{
  // Two different stories that merely share a common name must NOT merge.
  const pool = [
    story({ url: 'a', headline: 'Trump orders review of gray wolf protections' }),
    story({ url: 'b', headline: 'Trump travels to Texas for midterm convention' })
  ];
  ok('one shared common name does not merge two stories', clusterPool(pool).length === 2);
}
{
  const pool = [
    story({ url: 'a', outlet: 'Reuters', headline: 'Fire destroys historic Lisbon market building' }),
    story({ url: 'b', outlet: 'AP News', headline: 'Historic Lisbon market building destroyed by fire' })
  ];
  const out = clusterPool(pool);
  ok('reordered wording still merges', out.length === 1, `got ${out.length}`);
  ok('merged card keeps both outlets', out[0] && outletCount(out[0]) === 2);
}
{
  const big = Array.from({ length: 600 }, (_, i) =>
    story({ url: 'u' + i, headline: `Council approves budget item number ${i} for district ${i}` }));
  const t = Date.now();
  clusterPool(big);
  ok('600 stories cluster in under a second', Date.now() - t < 1000, `took ${Date.now() - t}ms`);
}

// -------------------------------------------------------------- cluster pick
group('cluster representative');
{
  const pool = [
    story({ url: 'a', outlet: 'Boing Boing', headline: 'Rare white orca filmed off Alaska coast', image: '' }),
    story({ url: 'b', outlet: 'BBC News',    headline: 'White orca filmed off the coast of Alaska', image: 'https://img/x.jpg',
            summary: 'A rare white orca has been filmed off Alaska by researchers who say the animal is likely leucistic.' })
  ];
  const out = clusterPool(pool);
  ok('the stronger outlet with a picture represents the cluster', out[0].outlet === 'BBC News', `got ${out[0].outlet}`);
  ok('representative keeps the image', !!out[0].image);
  ok('representative keeps the longer summary', out[0].summary.length > 40);
}

// ------------------------------------------------------------------ topicFit
group('topic matching');
{
  const s = story({ headline: 'Saturn decagon spotted by Hubble', summary: 'A ten-sided wave.', topics: ['science', 'offbeat'] });
  ok('primary topic scores higher than a cross-listing',
     topicFit(s, { id: 'science', custom: false }) > topicFit(s, { id: 'offbeat', custom: false }));
  ok('unrelated preset scores zero', topicFit(s, { id: 'sport', custom: false }) === 0);
  ok('custom term matches on a whole word', topicFit(s, { id: 'saturn', custom: true }) === 1);
  ok('"saturn" does not match "Saturday"',
     topicFit(story({ headline: 'Meeting held on Saturday in Moscow' }), { id: 'saturn', custom: true }) === 0);
  ok('short custom term is not a substring match',
     topicFit(story({ headline: 'Aircraft said to have landed safely' }), { id: 'ai', custom: true }) === 0);
  ok('plural custom term still matches singular',
     topicFit(story({ headline: 'Gray wolf protections under review' }), { id: 'wolf', custom: true }) === 1);
  ok('multi-word custom topic scores partial matches',
     topicFit(story({ headline: 'Electric vehicle sales climb' }), { id: 'electric aircraft', custom: true }) === 0.5);
}

// -------------------------------------------------------------------- scoring
group('scoring');
{
  const now = new Date().toISOString();
  const many = story({ url: 'm', also: ['BBC News','NPR','CNN','CBS News','The Guardian'], published: now });
  const few  = story({ url: 'f', also: [], published: now });
  const t = { id: 'world', custom: false };
  ok('corroboration outranks a lone report', score(many, t) > score(few, t));

  const old = story({ url: 'o', published: new Date(Date.now() - 40 * 36e5).toISOString() });
  ok('a fresh report outranks a two-day-old one', score(few, t) > score(old, t));

  const weak = story({ url: 'w', outlet: 'Some Blog' });
  ok('outlet standing breaks a tie', score(few, t) > score(weak, t));
}

// ----------------------------------------------------------------------- why
group('why labels');
{
  ok('multi-outlet label states the true count',
     why(story({ also: ['BBC News', 'NPR'] })) === 'Covered by 3 outlets');
  ok('single-source label names the outlet',
     why(story({ outlet: 'UPI', published: new Date(Date.now() - 30 * 36e5).toISOString(), prominence: 0.1 })) === 'Only in UPI');
  ok('tally count equals the claimed outlet count',
     outletCount(story({ outlet: 'A', also: ['B', 'C'] })) === 3);
  ok('a duplicated outlet is not counted twice',
     outletCount(story({ outlet: 'A', also: ['B', 'A'] })) === 2);
}

// ------------------------------------------------------------------ assembly
group('assembly');
{
  const mk = (id, n) => Array.from({ length: n }, (_, i) =>
    story({ url: `${id}${i}`, topics: [id], headline: `${id} story ${i} about subject ${i}` }));
  const pool = [...mk('world', 8), ...mk('politics', 8), ...mk('sport', 8)];
  const topics = ['world', 'politics', 'sport'].map(id => ({ id, label: id, custom: false }));
  const { sections, top } = assemble(clusterPool(pool), topics);

  ok('every section fills to five', sections.every(s => s.stories.length === 5));
  const urls = sections.flatMap(s => s.stories.map(x => x.url));
  ok('no story appears in two sections', new Set(urls).size === urls.length);
  ok('top of the brief returns three', top.length === 3);
}
{
  // A story whose primary topic is politics must not be poached by world.
  const pool = [
    ...Array.from({ length: 5 }, (_, i) => story({ url: 'w' + i, topics: ['world'], headline: `World item ${i} concerning region ${i}` })),
    story({ url: 'p1', topics: ['politics', 'world'], outlet: 'NPR',
            also: ['BBC News','CNN','CBS News','The Guardian','NPR'],
            headline: 'Senate passes sweeping budget package after long night' }),
    ...Array.from({ length: 4 }, (_, i) => story({ url: 'p' + i, topics: ['politics'], headline: `Politics item ${i} regarding policy ${i}` }))
  ];
  const topics = [{ id: 'world', label: 'World', custom: false }, { id: 'politics', label: 'Politics', custom: false }];
  const { sections } = assemble(clusterPool(pool), topics);
  const politics = sections.find(s => s.topic.id === 'politics');
  ok('a high-scoring politics story stays in Politics',
     politics.stories.some(s => s.url === 'p1'),
     'it was poached by World, leaving Politics short');
  ok('both sections still fill to five', sections.every(s => s.stories.length === 5),
     sections.map(s => `${s.topic.id}:${s.stories.length}`).join(' '));
}
{
  // One prolific outlet must not take every slot.
  const pool = Array.from({ length: 9 }, (_, i) =>
    story({ url: 'e' + i, outlet: 'ESPN', topics: ['sport'], headline: `Game report ${i} from stadium ${i}` }))
    .concat(Array.from({ length: 4 }, (_, i) =>
      story({ url: 'g' + i, outlet: 'The Guardian', topics: ['sport'], headline: `Match analysis ${i} at ground ${i}` })));
  const { sections } = assemble(clusterPool(pool), [{ id: 'sport', label: 'Sport', custom: false }]);
  const espn = sections[0].stories.filter(s => s.outlet === 'ESPN').length;
  ok('no outlet takes more than two slots in a section', espn <= 2, `ESPN took ${espn} of 5`);
  ok('section still fills to five', sections[0].stories.length === 5);
}
{
  const { sections } = assemble([], [{ id: 'world', label: 'World', custom: false }]);
  ok('an empty pool yields an empty section rather than throwing', sections[0].stories.length === 0);
}

// ------------------------------------------------------------------- parsing
group('feed parsing');
{
  const xml = `<rss><channel>
    <item>
      <title><![CDATA[Council votes to rebuild the &amp; pier]]></title>
      <link>https://www.bbc.co.uk/news/world-123</link>
      <pubDate>${new Date().toUTCString()}</pubDate>
      <description>&lt;p&gt;The vote passed 8-3.&lt;/p&gt;</description>
      <media:content url="https://img.bbc.co.uk/a.jpg"/>
    </item>
    <item>
      <title>Ancient news</title>
      <link>https://www.bbc.co.uk/news/old</link>
      <pubDate>${new Date(Date.now() - 90 * 36e5).toUTCString()}</pubDate>
    </item>
  </channel></rss>`;
  const items = parseFeed(xml, 'https://feeds.bbci.co.uk/news/world/rss.xml', 'world');
  ok('parses one fresh item and drops the stale one', items.length === 1, `got ${items.length}`);
  ok('CDATA and entities are decoded', items[0].headline === 'Council votes to rebuild the & pier', items[0]?.headline);
  ok('HTML is stripped from the summary', items[0].summary === 'The vote passed 8-3.', items[0]?.summary);
  ok('media:content becomes the image', items[0].image.endsWith('a.jpg'));
  ok('outlet resolves from the feed host', items[0].outlet === 'BBC News', items[0]?.outlet);
  ok('first item gets the highest prominence', items[0].prominence > 0.9);
}
{
  ok('numeric entities decode', decode('caf&#233;') === 'café');
  ok('outletFor maps a known host', outletFor('https://www.theguardian.com/x') === 'The Guardian');
  ok('outletFor falls back gracefully', outletFor('https://example.org/x').length > 0);
}
{
  // Photo credits must never be mistaken for an outlet — that would inflate corroboration.
  const xml = `<rss><channel><item>
    <title>Strike reported near the port</title>
    <link>https://www.france24.com/en/x</link>
    <pubDate>${new Date().toUTCString()}</pubDate>
    <source>© Ammar Awad, Reuters</source>
  </item></channel></rss>`;
  const items = parseFeed(xml, 'https://www.france24.com/en/rss', 'world');
  ok('a photo credit is not treated as an outlet', items[0].outlet === 'France 24', items[0]?.outlet);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
