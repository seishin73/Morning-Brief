// Morning Brief — front end. Talks to /api/brief; all ranking happens server-side.

const KEY = 'morningbrief.topics.v2';
const DEFAULTS = ['world', 'politics', 'economy', 'tech', 'science', 'offbeat'];

let TOPICS = load();
let CATALOG = [];          // [{id,label,available}] from the server
let LAST = null;           // last successful payload
let loading = false;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    // An empty array is a choice the reader made, not an absent value. Treating
    // [] as "nothing saved" silently resurrected the defaults after a reload.
    if (raw !== null) {
      const v = JSON.parse(raw);
      if (Array.isArray(v)) return v;
    }
  } catch { /* storage can be blocked; defaults are fine */ }
  return DEFAULTS.map(id => ({ id, custom: false }));
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(TOPICS)); } catch { /* not fatal */ }
}

const $ = s => document.querySelector(s);
const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h !== undefined) n.innerHTML = h; return n; };
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const labelOf = t => t.custom
  ? t.id.replace(/\b\w/g, c => c.toUpperCase())
  : (CATALOG.find(c => c.id === t.id)?.label || t.id);

function relTime(iso) {
  const h = Math.max(0, (Date.now() - new Date(iso)) / 36e5);
  if (h < 1) return Math.max(1, Math.round(h * 60)) + 'm ago';
  if (h < 24) return Math.round(h) + 'h ago';
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : d + ' days ago';
}
const clock = iso => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// ------------------------------------------------------------------ pieces

const tally = n => '<span class="tally" aria-hidden="true">' + '<i></i>'.repeat(Math.min(n, 12)) + '</span>';

// A credit is only worth showing — or reading out — when it says something the
// outlet line doesn't already say. "TechCrunch" as alt text tells a screen reader
// nothing about the picture; a Wikimedia subject caption does.
const realCredit = s => (s.imageCredit && s.imageCredit !== s.outlet) ? s.imageCredit : '';

let imgIndex = 0; // anything in the first screenful must not be lazy-loaded

// Most news CDNs take the width in the query string. Where they do, offer the
// browser a ladder of sizes: a 1800px photo in a 174px thumbnail slot was
// shipping roughly 4.5x more pixel data than it could ever display.
const WIDTH_PARAM = /([?&](?:w|width)=)\d+/i;
// Some CDNs sign the query string — the Guardian's `s=` hash is computed over the
// exact width requested. Rewriting the width to build a size ladder invalidates
// it, the CDN refuses every candidate, and the picture vanishes. A slightly
// over-fetched photo beats no photo, so signed URLs are served as they came.
const SIGNED = /[?&]s=[0-9a-f]{16,}/i;

function srcsetFor(url) {
  if (SIGNED.test(url) || !WIDTH_PARAM.test(url)) return '';
  return [320, 640, 1000, 1400].map(w => `${url.replace(WIDTH_PARAM, '$1' + w)} ${w}w`).join(', ');
}

function shot(s, sizes = '', extra = '') {
  const cls = 'shot ' + (s.imageKind === 'mark' ? 'mark ' : '') + extra;
  if (!s.image) {
    return `<div class="${cls}"><div class="plate"><span>${esc(s.outlet)}<br>No photograph</span></div></div>`;
  }
  // Where we have no real description, the image only illustrates the headline
  // sitting right beside it, so it is decorative and takes an empty alt.
  const alt = realCredit(s);
  const eager = imgIndex++ < 3;
  const set = srcsetFor(s.image);
  return `<div class="${cls}"><img src="${esc(s.image)}"${set ? ` srcset="${esc(set)}" sizes="${esc(sizes || '100vw')}"` : ''}
    alt="${esc(alt)}"${alt ? '' : ' role="presentation"'}
    loading="${eager ? 'eager' : 'lazy'}"${eager ? ' fetchpriority="high"' : ''} decoding="async" referrerpolicy="no-referrer"
    onerror="this.closest('.shot').innerHTML='&lt;div class=&quot;plate&quot;&gt;&lt;span&gt;${esc(s.outlet).replace(/'/g, '')}&lt;br&gt;Photo unavailable&lt;/span&gt;&lt;/div&gt;'"></div>`;
}

function outlets(s) {
  if (!s.also || !s.also.length) return '';
  return `<div class="alsoin"><b>Also in</b> ${s.also.slice(0, 8).map(esc).join(' &middot; ')}</div>`;
}

function meta(s) {
  const n = 1 + (s.also?.length || 0);
  const thin = n < 2 ? ' thin' : '';
  return `<div class="story-meta">${tally(n)}<span class="why${thin}">${esc(s.why)}</span></div>`;
}

function credit(s) {
  const photo = realCredit(s);
  return `<div class="credit"><span class="outlet">${esc(s.outlet)}</span>` +
         `<span class="sep">/</span><span>${relTime(s.published)}</span>` +
         (photo ? `<span class="sep">/</span><span>Photo: ${esc(photo)}</span>` : '') +
         `</div>`;
}

function storyNode(s, variant) {
  const head = `<h3><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.headline)}</a></h3>`;
  const body = s.summary ? `<p>${esc(s.summary)}</p>` : '';
  if (variant === 'lead') {
    const a = el('article', 'story lead');
    a.innerHTML = shot(s, '(min-width: 50rem) 600px, 100vw') +
      `<div class="lead-text">${meta(s)}${head}${body}${credit(s)}${outlets(s)}</div>`;
    return a;
  }
  const a = el('article', 'story row');
  a.innerHTML = shot(s, '(min-width: 34rem) 120px, 80px') +
    `<div>${meta(s)}${head}${body}${credit(s)}${outlets(s)}</div>`;
  return a;
}

function topCard(s, hero = false) {
  const a = el('article', 'tcard' + (hero ? ' hero' : ''));
  const text = hero
    ? (s.summary || '')
    : ((s.summary || '').split(/(?<=[.!?])\s+/)[0] || '');
  a.innerHTML = shot(s, hero ? '(min-width: 50rem) 680px, 100vw' : '(min-width: 50rem) 400px, 100vw') + meta(s) +
    `<h3><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.headline)}</a></h3>` +
    (text ? `<p>${esc(text)}</p>` : '') +
    `<div class="credit"><span class="outlet">${esc(s.outlet)}</span><span class="sep">/</span><span>${esc(s.topicLabel)}</span>` +
    `<span class="sep">/</span><span>${relTime(s.published)}</span></div>`;
  return a;
}

// ------------------------------------------------------------------ render

function skeleton() {
  const s = el('div', 'skeleton pulse');
  s.innerHTML = `<div class="section-rule"><h2>Fetching</h2><span class="meta">reading the wires…</span></div>` +
    Array.from({ length: 4 }, (_, i) => `
      <div class="sk-row">
        <div><div class="sk-box"></div></div>
        ${i === 0 ? '' : '<div>'}
          <div class="sk-line w45"></div><div class="sk-line w90"></div>
          <div class="sk-line w70"></div><div class="sk-line w45"></div>
        ${i === 0 ? '' : '</div>'}
      </div>`).join('');
  return s;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function renderDateline(d) {
  $('#dlDate').textContent = new Date(d?.builtAt || Date.now())
    .toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  if (!d) { $('#dlBuilt').textContent = 'building…'; $('#dlCount').textContent = ''; return; }
  // With no topics selected the payload still carries the last brief's sections,
  // so the header went on claiming "6 topics · 30 stories" over an empty page.
  if (!TOPICS.length) {
    $('#dlBuilt').textContent = 'As of ' + clock(d.fetchedAt);
    $('#dlCount').textContent = `no topics · ${d.poolSize} stories read`;
    $('#dlWarn').hidden = true;
    return;
  }
  const n = d.sections.reduce((a, s) => a + s.stories.length, 0);
  $('#dlBuilt').textContent = 'As of ' + clock(d.fetchedAt);
  $('#dlCount').textContent =
    `${plural(d.sections.length, 'topic', 'topics')} · ${plural(n, 'story', 'stories')} · ${d.poolSize} read`;
  const bad = $('#dlWarn');
  if (d.feedsFailed > 0) {
    bad.hidden = false;
    bad.textContent = `${d.feedsFailed} of ${d.feedsTried} feeds down`;
  } else bad.hidden = true;
}

function render(d) {
  const main = $('#brief');
  main.innerHTML = '';
  imgIndex = 0;
  renderDateline(d);
  renderPicker();   // must run before any early return, or stale chips survive

  if (!TOPICS.length) {
    main.appendChild(el('div', 'nothing',
      '<p>No topics selected.</p><p>Open <strong>Your topics</strong> above and pick a few.</p>'));
    return;
  }

  const withStories = d.sections.filter(s => s.stories.length);

  if (withStories.length) {
    const om = el('section', 'oneminute');
    om.innerHTML = '<p class="om-head">In one minute</p><ul>' +
      withStories.slice(0, 6).map(s => `<li>${esc(s.stories[0].headline.replace(/\.$/, ''))}.</li>`).join('') +
      '</ul>';
    main.appendChild(om);
  }

  if (d.top?.length >= 2) {
    const ts = el('section', 'topsec');
    ts.innerHTML = '<div class="section-rule"><h2>Top of the brief</h2><span class="meta">Across all your topics</span></div>';
    const g = el('div', 'topgrid');
    d.top.forEach((s, i) => g.appendChild(topCard(s, i === 0)));
    ts.appendChild(g);
    main.appendChild(ts);
  }

  d.sections.forEach(({ topic, stories }) => {
    const sec = el('section', 'topic');
    sec.innerHTML = `<div class="section-rule"><h2>${esc(topic.label)}</h2>` +
      `<span class="meta">${stories.length ? stories.length + (stories.length === 1 ? ' story' : ' stories') : 'nothing today'}</span></div>`;
    if (!stories.length) {
      sec.appendChild(el('div', 'empty',
        `Nothing in this morning's ${d.poolSize} stories matches <code>${esc(topic.label)}</code>. ` +
        `Try a broader term, or one of the preset topics.`));
    } else {
      sec.appendChild(storyNode(stories[0], 'lead'));
      if (stories.length > 1) {
        const rest = el('div', 'rest');
        stories.slice(1).forEach(s => rest.appendChild(storyNode(s, 'row')));
        sec.appendChild(rest);
      }
    }
    main.appendChild(sec);
  });

  if (d.failures?.length) {
    const f = el('div', 'failbox');
    f.innerHTML = `<h3>${d.feedsFailed} feeds did not answer</h3>` +
      d.failures.slice(0, 5).map(x => `${esc(x.feed.replace(/^https?:\/\//, '').slice(0, 52))} — ${esc(x.error)}`).join('<br>') +
      (d.feedsFailed > 5 ? `<br>…and ${d.feedsFailed - 5} more` : '') +
      `<br><br>The brief was built from the feeds that did answer.`;
    main.appendChild(f);
  }

  renderPicker();
}

// ------------------------------------------------------------------ fetching

let queued = null;      // a change made while a fetch was in flight
let inflight = null;    // AbortController for the current request
let debounce = null;

// Ticking five boxes fired five full round trips and made the page flicker.
// Update the picker at once, then fetch once the reader has stopped changing things.
function topicsChanged() {
  save();
  renderPicker();
  clearTimeout(debounce);
  debounce = setTimeout(() => refresh(), 250);
}

async function refresh({ force = false } = {}) {
  // Dropping a request because one is already running left the picker showing
  // topics the page below did not reflect. Queue it and run it after, instead.
  if (loading) {
    queued = { force: force || (queued?.force ?? false) };
    if (inflight) inflight.abort();
    return;
  }
  loading = true;
  $('#refreshBtn').disabled = true;
  $('#refreshBtn').textContent = force ? 'Fetching' : 'Loading';
  renderPicker();       // the picker must reflect the new selection immediately

  if (!LAST) { $('#brief').innerHTML = ''; $('#brief').appendChild(skeleton()); renderDateline(null); }

  const presets = TOPICS.filter(t => !t.custom).map(t => t.id);
  const customs = TOPICS.filter(t => t.custom).map(t => t.id);
  const params = new URLSearchParams();
  if (presets.length) params.set('topics', presets.join(','));
  if (customs.length) params.set('custom', customs.join(','));
  params.set('order', TOPICS.map(t => t.id).join(','));
  if (force) params.set('refresh', '1');

  try {
    inflight = new AbortController();
    const res = await fetch('/api/brief?' + params, { signal: inflight.signal });
    if (!res.ok) throw new Error('Server returned ' + res.status);
    const data = await res.json();
    LAST = data;
    if (data.topics) CATALOG = data.topics;
    render(data);
  } catch (err) {
    if (err.name === 'AbortError') return;   // superseded by a newer selection
    $('#brief').innerHTML = '';
    const n = el('div', 'nothing');
    n.innerHTML = `<p>Couldn't reach the news.</p>` +
      `<p>${esc(err.message)}. Check the server is running, then try again.</p>`;
    const b = el('button', 'iconbtn', 'Retry');
    b.style.marginTop = '1rem';
    b.addEventListener('click', () => refresh({ force: true }));
    n.appendChild(b);
    $('#brief').appendChild(n);
    renderPicker();
  } finally {
    loading = false;
    inflight = null;
    $('#refreshBtn').disabled = false;
    $('#refreshBtn').textContent = 'Refresh';
    if (queued) { const q = queued; queued = null; refresh(q); }
  }
}

// ------------------------------------------------------------------ picker

let focusAfterRender = null;   // index of a topic tag that should keep keyboard focus

function renderPicker() {
  const count = $('#pickerCount');
  count.textContent = TOPICS.length + ' / 10';
  count.classList.toggle('full', TOPICS.length >= 10);

  const row = $('#selectedRow');
  // The picker is rebuilt more than once per change (immediately, then again when
  // the debounced fetch returns). Restoring focus only on the first rebuild left
  // keyboard users back at <body> a fraction of a second later, so carry the
  // focused position across every rebuild.
  if (focusAfterRender === null && row.contains(document.activeElement)) {
    const held = document.activeElement.closest('.seltag');
    if (held) focusAfterRender = [...row.children].indexOf(held);
  }
  row.innerHTML = '';
  TOPICS.forEach((t, i) => {
    const tag = el('span', 'seltag');
    tag.draggable = true;
    tag.dataset.i = i;
    const name = esc(labelOf(t));
    // Drag was the only way to reorder, which excludes keyboard and touch users
    // entirely. The tag is focusable, arrow keys move it, and the buttons are real.
    tag.tabIndex = 0;
    tag.setAttribute('role', 'listitem');
    tag.setAttribute('aria-label', `${name}, position ${i + 1} of ${TOPICS.length}. Use arrow keys to reorder.`);
    tag.innerHTML = `<span class="ord" aria-hidden="true">${i + 1}</span>${name}` +
      `<button type="button" class="grip" aria-label="Move ${name} earlier">&#9664;</button>` +
      `<button type="button" class="grip" aria-label="Move ${name} later">&#9654;</button>` +
      `<button type="button" class="kill" aria-label="Remove ${name}">&times;</button>`;

    // Everything below works off the topic OBJECT, never the render-time index.
    // Handlers used to close over `i`, and because the picker only rebuilt after
    // the network call returned, two quick clicks removed the wrong topic — the
    // second click's stale index landed out of bounds and did nothing at all.
    const at = () => TOPICS.indexOf(t);
    const drop = () => { const k = at(); if (k > -1) { TOPICS.splice(k, 1); topicsChanged(); } };
    const move = delta => {
      const from = at();
      const to = from + delta;
      if (from < 0 || to < 0 || to >= TOPICS.length) return;
      TOPICS.splice(to, 0, ...TOPICS.splice(from, 1));
      // The picker is rebuilt asynchronously, so focusing here is undone a moment
      // later and the keyboard user is dumped back to <body> — which defeats the
      // point of building keyboard reordering. Hand the intent to the renderer.
      focusAfterRender = to;
      topicsChanged();
    };
    const [earlier, later] = tag.querySelectorAll('.grip');
    earlier.addEventListener('click', e => { e.stopPropagation(); move(-1); });
    later.addEventListener('click', e => { e.stopPropagation(); move(1); });
    tag.querySelector('.kill').addEventListener('click', e => { e.stopPropagation(); drop(); });
    tag.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); move(1); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); drop(); }
    });
    tag.addEventListener('dragstart', e => {
      tag.classList.add('dragging');
      e.dataTransfer.setData('text/plain', String(i));
      e.dataTransfer.effectAllowed = 'move';
    });
    tag.addEventListener('dragend', () => { tag.classList.remove('dragging'); row.querySelectorAll('.over').forEach(n => n.classList.remove('over')); });
    tag.addEventListener('dragover', e => { e.preventDefault(); tag.classList.add('over'); e.dataTransfer.dropEffect = 'move'; });
    tag.addEventListener('dragleave', () => tag.classList.remove('over'));
    tag.addEventListener('drop', e => {
      e.preventDefault();
      tag.classList.remove('over');
      const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
      const to = at();
      if (isNaN(from) || to < 0 || from === to) return;
      TOPICS.splice(to, 0, ...TOPICS.splice(from, 1));
      topicsChanged();
    });
    row.appendChild(tag);
  });

  const chips = $('#presetChips');
  chips.innerHTML = '';
  CATALOG.forEach(({ id, label, available }) => {
    const on = TOPICS.some(t => !t.custom && t.id === id);
    const b = el('button', 'chip', `${esc(label)}<span class="n">${available}</span>`);
    b.type = 'button';
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.disabled = !on && TOPICS.length >= 10;
    b.addEventListener('click', () => {
      if (on) TOPICS = TOPICS.filter(t => t.custom || t.id !== id);
      else if (TOPICS.length < 10) TOPICS.push({ id, custom: false });
      topicsChanged();
    });
    chips.appendChild(b);
  });

  $('#customBtn').disabled = TOPICS.length >= 10;
  $('#customInput').disabled = TOPICS.length >= 10;

  if (focusAfterRender !== null) {
    row.children[focusAfterRender]?.focus();
    focusAfterRender = null;
  }
}

$('#customForm').addEventListener('submit', e => {
  e.preventDefault();
  const input = $('#customInput');
  // maxlength is a UI courtesy, not a guarantee — a pasted 200-character topic
  // blew the page out to a 2100px scrollWidth on a 320px screen.
  const v = input.value.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 40);
  if (!v || TOPICS.length >= 10) return;
  if (TOPICS.some(t => (t.custom ? t.id : labelOf(t).toLowerCase()) === v)) { input.value = ''; return; }
  TOPICS.push({ id: v, custom: true });
  input.value = '';
  topicsChanged();
  refresh();
});

const picker = $('#picker');
$('#pickerBar').addEventListener('click', () => {
  const open = picker.classList.toggle('open');
  $('#pickerBody').hidden = !open;
  $('#pickerBar').setAttribute('aria-expanded', open ? 'true' : 'false');
});

$('#themeBtn').addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme');
  const sysDark = matchMedia('(prefers-color-scheme: dark)').matches;
  const next = cur ? (cur === 'dark' ? 'light' : 'dark') : (sysDark ? 'light' : 'dark');
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('morningbrief.theme', next); } catch {}
});
$('#printBtn').addEventListener('click', () => window.print());
$('#refreshBtn').addEventListener('click', () => refresh({ force: true }));

try {
  const t = localStorage.getItem('morningbrief.theme');
  if (t) document.documentElement.setAttribute('data-theme', t);
} catch {}

// The topic catalogue comes back with the first brief; render the picker from it.
(async () => {
  await refresh();
  if (LAST?.topics) { CATALOG = LAST.topics; renderPicker(); }
})();
