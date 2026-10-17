import fs from 'fs';
import path from 'path';
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { getArticle } from './article.mjs';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'today');
const KEY = process.env.GEMINI_API_KEY;
const DRY = process.env.DRY_RUN === '1';
const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-flash-latest';
const IMG_RAW = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-lite-image';
const IMG_MODEL = /^(off|none|no)$/i.test(IMG_RAW) ? '' : IMG_RAW; // set the variable to "off" for free posts with no AI photos
const NUM = +(process.env.NUM_POSTS || 4);
const CIRCLE_ON = !/^(off|none|no)$/i.test(process.env.CIRCLE_PHOTOS || ''); // set the variable CIRCLE_PHOTOS to "off" to skip the round inset photo (it costs one extra image per post)
const RING = process.env.CIRCLE_RING || '#FFFFFF'; // ring color around the round photo
const LOGO_H = +(process.env.LOGO_HEIGHT || 132); // height of the logo above the headline, in pixels (the post is 1440 tall)
const CIRCLE_DEPTH = +(process.env.CIRCLE_DEPTH_CHANCE || .5); // chance a post with a circle gets the depth effect (main subject in front of the circle)
const pickStyle = () => !CIRCLE_ON ? null : { side: Math.random() < .5 ? 'left' : 'right', depth: Math.random() < CIRCLE_DEPTH };
const log = (...a) => console.log(...a);

/* ---------- fonts ---------- */
let PRIMARY = 'Impact';
const fontDir = path.join(ROOT, 'fonts');
const mine = fs.existsSync(fontDir) ? fs.readdirSync(fontDir).find(f => /\.(ttf|otf)$/i.test(f)) : null;
const antonFile = ['node_modules/@fontsource/anton/files/anton-latin-400-normal.woff', 'node_modules/@fontsource/anton/files/anton-latin-400-normal.woff2']
  .map(f => path.join(ROOT, f)).find(f => fs.existsSync(f));
if (antonFile) { try { GlobalFonts.registerFromPath(antonFile, 'AntonBackup'); PRIMARY = 'AntonBackup'; } catch (e) { log('Anton load failed', e.message); } }
if (mine) { try { GlobalFonts.registerFromPath(path.join(fontDir, mine), 'HeadingFont'); PRIMARY = 'HeadingFont'; log('Using your font:', mine); } catch (e) { log('Your font failed to load:', e.message); } }
const ANTON = antonFile ? 'AntonBackup' : 'Impact'; // digits always use Anton, like the Post Builder

/* ---------- headline stacker (same logic as the Post Builder) ---------- */
const fix = s => s.toUpperCase().replace(/(^|[\s(\[])'/g, '$1‘').replace(/'/g, '’').replace(/(^|[\s(\[])"/g, '$1“').replace(/"/g, '”');
function split(words, n) {
  const m = words.length; n = Math.min(n, m); if (n <= 1) return [words.join(' ')];
  const L = (i, j) => words.slice(i, j).join(' ').length, t = L(0, m) / n;
  const best = Array.from({ length: n + 1 }, () => Array(m + 1).fill(Infinity)), prev = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  best[0][0] = 0;
  for (let k = 1; k <= n; k++) for (let j = k; j <= m; j++) for (let i = k - 1; i < j; i++) { const c = best[k - 1][i] + (L(i, j) - t) ** 2; if (c < best[k][j]) { best[k][j] = c; prev[k][j] = i; } }
  const out = []; let j = m; for (let k = n; k > 0; k--) { const i = prev[k][j]; out.unshift(words.slice(i, j).join(' ')); j = i; } return out;
}
function headlineCanvas(text) {
  const W = 1080, M = 40, G = 12, MX = 260, tw = W - 2 * M, NW = 1.08, NB = 0.02, pad = 8;
  const words = fix(text.trim()).split(/\s+/);
  const ls = split(words, words.length > 9 ? 4 : 3);
  const meas = createCanvas(10, 10).getContext('2d');
  const capOf = f => { meas.font = `100px "${f}"`; return meas.measureText('H').actualBoundingBoxAscent / 100 || .72; };
  const capR = capOf(PRIMARY), k = capR / capOf(ANTON);
  const runs = t => t.split(/([0-9$%#&@+]+)/).filter(Boolean).map(q => ({ t: q, d: /^[0-9$%#&@+]+$/.test(q) }));
  const wd = (r, size) => { if (r.d) { meas.font = `${size * k}px "${ANTON}"`; return meas.measureText(r.t).width * NW; } meas.font = `${size}px "${PRIMARY}"`; return meas.measureText(r.t).width; };
  const rows = ls.map(t => { const rs = runs(t); let size = 100 * tw / rs.reduce((a, r) => a + wd(r, 100), 0), h = capR * size; if (h > MX) { size = MX / capR; h = MX; } const w = rs.reduce((a, r) => a + wd(r, size), 0); return { rs, size, h, x: M + (tw - w) / 2 }; });
  const H = Math.max(40, Math.ceil(rows.reduce((a, r) => a + r.h, 0) + G * Math.max(0, rows.length - 1) + pad * 2));
  const c = createCanvas(W, H), x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.textBaseline = 'alphabetic';
  let y = pad;
  rows.forEach(r => { let px = r.x; r.rs.forEach(q => { const w = wd(q, r.size);
    if (q.d) { x.save(); x.translate(px, y + r.h); x.scale(NW, 1); x.font = `${r.size * k}px "${ANTON}"`; x.fillText(q.t, 0, 0); x.lineWidth = r.size * NB; x.lineJoin = 'round'; x.strokeStyle = '#fff'; x.strokeText(q.t, 0, 0); x.restore(); }
    else { x.font = `${r.size}px "${PRIMARY}"`; x.fillText(q.t, px, y + r.h); }
    px += w; }); y += r.h + G; });
  return c;
}

/* ---------- news ---------- */
const FEEDS = {
  news: [['Miami-Dade when:1d', 6], ['Miami-Dade police when:1d', 4], ['Miami Beach when:1d', 4], ['Hialeah when:1d', 3]],
  sports: [['Miami Dolphins when:1d', 4], ['Miami Heat when:1d', 4], ['Miami Hurricanes football when:1d', 4], ['Inter Miami when:1d', 3]],
};
const SPORTS_RE = /miami heat|dolphins|miami hurricanes|\bcanes\b|panthers|marlins|inter miami|\bnfl\b|\bnba\b|\bncaa\b|\bmls\b|football|basketball|quarterback|touchdown|playoff|coach |super bowl/i;
const JUNK_SRC = /realtor\.com|zillow|redfin|trulia|apartments\.com|loopnet|tripadvisor|expedia|booking\.com|cond[eé] nast traveler|travel \+ leisure/i;
const SPAM_RE = /\bTV!?\]|kick.?off time|live ?stream|watch .{0,40} live online|\bfree stream\b/i;
const ADDRESS_RE = /^\d{2,6}\s+[\w .']+\b(st|street|ave|avenue|rd|road|blvd|dr|drive|ln|lane|ct|court|way|apt|unit)\b/i;
const decode = s => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim();
async function feed([q, n]) {
  const url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(q) + '&hl=en-US&gl=US&ceid=US:en';
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }); if (!r.ok) throw new Error('HTTP ' + r.status);
      const xml = await r.text();
      const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, n).map(m => {
        const g = t => { const x = m[1].match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return x ? decode(x[1]) : ''; };
        const raw = g('title'), mm = raw.match(/^(.*)\s+-\s+([^-]+)$/);
        return { title: mm ? mm[1] : raw, source: g('source') || (mm ? mm[2].trim() : ''), url: g('link'), t: Date.parse(g('pubDate')) || 0 };
      });
      if (items.length) return items;
    } catch (e) { log('feed retry', q, e.message); await new Promise(r => setTimeout(r, 1500)); }
  }
  return [];
}
const norm = t => t.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(w => w.length > 3);
const similar = (a, b) => { const A = new Set(norm(a)), B = norm(b); if (!A.size || !B.length) return false; return B.filter(w => A.has(w)).length / Math.min(A.size, B.length) > .6; };
async function candidates(kind, seen) {
  const res = await Promise.all(FEEDS[kind].map(feed));
  let all = [].concat(...res).filter(h => h.title).sort((a, b) => b.t - a.t);
  if (kind === 'news') all = all.filter(h => !SPORTS_RE.test(h.title));
  all = all.filter(h => !JUNK_SRC.test(h.source) && !ADDRESS_RE.test(h.title) && !SPAM_RE.test(h.title)); // real estate listings and travel pages are not news
  const out = [];
  for (const h of all) if (![...seen, ...out.map(o => o.title)].some(t => similar(t, h.title))) out.push(h);
  return out;
}

/* ---------- Gemini ---------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-flash-lite-latest';
async function gemOnce(model, body) {
  let last;
  for (let a = 0; a < 5; a++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY }, body: JSON.stringify(body) });
    if (r.ok) return r.json();
    last = `Gemini ${model} HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`;
    if (![429, 500, 502, 503, 504].includes(r.status)) break; // real error, retrying will not help
    log('busy, retrying in', 5 * (a + 1) * 2, 'seconds');
    await sleep(5000 * (a + 1) * 2);
  }
  throw new Error(last);
}
async function gem(model, body) {
  try { return await gemOnce(model, body); }
  catch (e) {
    if (model === FALLBACK_MODEL) throw e;
    log('Switching to', FALLBACK_MODEL, 'because:', e.message.slice(0, 120));
    return gemOnce(FALLBACK_MODEL, body);
  }
}
const clean = t => String(t || '').replace(/\*\*/g, '').replace(/\s*[—–]\s*/g, ', ').trim();
async function write(kind, dataText) {
  const factual = kind === 'facts' || kind === 'history';
  const prompt = `Create three different all caps instagram headline options for my Miami area based news account and use this data to write one article that does not link to any news source affiliation (give it a Miami area-centric point of view). No em dashes. No emojis. The article does not need to be all caps.
Only use facts that appear in the data below. Do not invent details, quotes, names, dates, or numbers. If the data is thin, keep the article short rather than guessing.
Do use the specific details that ARE in the data: names of businesses, people, agencies, streets and neighborhoods, times, dates, ages, and numbers, with the who, what, where and when up front. Write in your own words and never copy sentences from the article text. Never mention that you were given article text or a source.
Headlines: exactly 3 options, each 12 words or fewer, each with a clearly different angle (1: the straight facts, 2: short and punchy, 3: a local-pride or curiosity hook), all using only facts from the data. Article: about 80 to 120 words, short paragraphs.
Also write "imagePrompt": a prompt for a ${kind === 'history' ? 'vintage, archival-style editorial image' : 'realistic editorial photo'} in a 3:4 vertical portrait about this story. Main subject in the upper two-thirds, bottom third simple and darker. ${kind === 'history' ? 'No real identifiable people. ' : ''}No text, letters, logos, or watermarks.
Also write "circlePrompt": a prompt for a realistic square 1:1 photo that shows a second, closely related view of the story (a close-up detail, the place, or the object involved), different from the main photo, with the subject centered. No people's faces, no text, letters, logos, or watermarks.

DATA:
${dataText}`;
  const j = await gem(TEXT_MODEL, { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: { type: 'OBJECT', properties: { headlines: { type: 'ARRAY', items: { type: 'STRING' } }, article: { type: 'STRING' }, imagePrompt: { type: 'STRING' }, circlePrompt: { type: 'STRING' } }, required: ['headlines', 'article', 'imagePrompt'] } } });
  const o = JSON.parse(j.candidates[0].content.parts[0].text);
  const hs = [...new Set((o.headlines || []).map(h => clean(h).replace(/^["“]|["”]$/g, '')).filter(Boolean))].slice(0, 3);
  if (!hs.length) throw new Error('Gemini returned no headlines');
  return { headlines: hs, headline: hs[0], article: clean(o.article), imagePrompt: clean(o.imagePrompt), circlePrompt: clean(o.circlePrompt) };
}
async function pickBest(list, n) {
  if (DRY || list.length <= n) return list.slice(0, n);
  try {
    const prompt = `You run a Miami-Dade Instagram news account. From these headlines, choose the ${n} most interesting and different stories for local readers (skip near-duplicates, prefer things that affect everyday life, surprise, or community pride). Reply with JSON {"picks":[numbers]}.\n` + list.map((h, i) => `${i + 1}. ${h.title} (${h.source})`).join('\n');
    const j = await gem(TEXT_MODEL, { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: { type: 'OBJECT', properties: { picks: { type: 'ARRAY', items: { type: 'INTEGER' } } }, required: ['picks'] } } });
    const picks = [...new Set(JSON.parse(j.candidates[0].content.parts[0].text).picks)].filter(i => i >= 1 && i <= list.length).slice(0, n).map(i => list[i - 1]);
    return picks.length ? picks : list.slice(0, n);
  } catch (e) { log('pickBest fallback', e.message); return list.slice(0, n); }
}
function findImage(o, depth = 0) { // walk any JSON reply and return the first base64 image
  if (!o || depth > 12) return null;
  if (typeof o === 'object') {
    const d = o.data || (o.inlineData && o.inlineData.data) || (o.inline_data && o.inline_data.data);
    if (typeof d === 'string' && d.length > 2000) return d;
    for (const k of Object.keys(o)) { const r = findImage(o[k], depth + 1); if (r) return r; }
  }
  return null;
}
async function photoOnce(prompt, ratio = '3:4') {
  if (!IMG_MODEL || DRY) return null;
  const post = async (url, body) => {
    for (let a = 0; a < 4; a++) {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY }, body: JSON.stringify(body) });
      if (r.ok) return r.json();
      const t = (await r.text()).slice(0, 200);
      if (![429, 500, 502, 503, 504].includes(r.status)) throw new Error(`HTTP ${r.status} ${t}`);
      log('image: Google busy or rate limited, waiting');
      await sleep(10000 * (a + 1));
    }
    throw new Error('Google stayed busy');
  };
  const tries = [
    ['interactions', () => post('https://generativelanguage.googleapis.com/v1beta/interactions', { model: IMG_MODEL, input: prompt, response_format: { type: 'image', aspect_ratio: ratio } })],
    ['generateContent', () => post(`https://generativelanguage.googleapis.com/v1beta/models/${IMG_MODEL}:generateContent`, { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: ratio } } })],
  ];
  for (const [name, run] of tries) {
    try {
      const j = await run(), b64 = findImage(j);
      if (b64) return Buffer.from(b64, 'base64');
      log('Image route', name, 'returned no picture. Google said:', JSON.stringify(j).slice(0, 400));
    } catch (e) { log('Image route', name, 'failed:', e.message); }
  }
  return null;
}

/* ---------- sports: real reference photo from Wikimedia Commons -> new-angle recreation ---------- */
const UA = { 'User-Agent': 'MiamiDaderBot/1.0 (https://github.com/miamidader/post-builder)' };
const stripHtml = t => String(t || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
async function refSubject(headline) { // who or what the story is about, as a search phrase
  try {
    const j = await gem(TEXT_MODEL, { contents: [{ parts: [{ text: `Sports headline: "${headline}". Reply as JSON: "player" = the one main athlete named (full name) or empty string, "team" = the main team (for example "Miami Heat", "Miami Dolphins", "Miami Hurricanes football", "Inter Miami"), "sport" = the sport.` }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: { type: 'OBJECT', properties: { player: { type: 'STRING' }, team: { type: 'STRING' }, sport: { type: 'STRING' } }, required: ['team'] } } });
    return JSON.parse(j.candidates[0].content.parts[0].text);
  } catch (e) { log('Sports subject lookup failed:', e.message.slice(0, 120)); return null; }
}
async function commonsRef(subj) { // best freely licensed photo; tries the player first, then the team
  const queries = [subj.player && `${subj.player} ${subj.team || ''}`, subj.player, subj.team && `${subj.team} ${subj.sport || ''} game`, subj.team].filter(Boolean);
  for (const q of queries) {
    try {
      const u = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=12&gsrsearch=' + encodeURIComponent('filetype:bitmap ' + q) + '&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1280';
      const r = await fetch(u, { headers: UA }); if (!r.ok) { log('Commons search HTTP', r.status); continue; }
      const pages = Object.values((await r.json()).query?.pages || {}).sort((a, b) => a.index - b.index);
      for (const pg of pages) {
        const ii = pg.imageinfo?.[0]; if (!ii || !ii.thumburl) continue;
        const m = ii.extmetadata || {}, lic = stripHtml(m.LicenseShortName?.value), ok = /^(CC BY|CC BY-SA|CC0|Public domain|PD)/i.test(lic) && !/NC|ND/i.test(lic);
        const title = pg.title.toLowerCase();
        if (!ok || ii.width < 900 || /logo|crest|badge|map|\.svg|signature|jersey display/.test(title)) continue;
        if (q === subj.player || (subj.player && q.startsWith(subj.player))) { const nm = subj.player.toLowerCase().split(' ').pop(); if (!(title + ' ' + stripHtml(m.ImageDescription?.value).toLowerCase()).includes(nm)) continue; }
        const img = await fetch(ii.thumburl, { headers: UA }); if (!img.ok) continue;
        const artist = stripHtml(m.Artist?.value) || 'unknown photographer';
        log('Commons reference:', pg.title, '|', lic, '|', artist);
        return { buf: Buffer.from(await img.arrayBuffer()), mime: img.headers.get('content-type') || 'image/jpeg', credit: `Image: AI recreation based on a photo by ${artist} (${lic}), via Wikimedia Commons: ${ii.descriptionurl}` };
      }
    } catch (e) { log('Commons lookup failed:', e.message.slice(0, 120)); }
  }
  log('No freely licensed reference photo found.'); return null;
}
async function photoFromRef(headline, subj, ref) {
  if (!IMG_MODEL || DRY) return null;
  const prompt = `Create a new realistic editorial sports photograph, 3:4 vertical, for this story: "${headline}". Use the attached reference photo to match the real team's uniform colors and design and the subject's real appearance${subj.player ? ' (' + subj.player + ')' : ''}. Do not copy the reference: show a different moment from a different camera angle, with natural sports-photography lighting and depth of field. Main subject in the upper two-thirds, bottom third simple and darker. No text, captions, or watermarks.`;
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${IMG_MODEL}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: ref.mime.split(';')[0], data: ref.buf.toString('base64') } }] }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '3:4' } } }) });
    if (!r.ok) { log('Reference recreation HTTP', r.status, (await r.text()).slice(0, 200)); return null; }
    const j = await r.json(), b64 = findImage(j);
    if (!b64) log('Reference recreation returned no picture. Google said:', JSON.stringify(j).slice(0, 300));
    return b64 ? Buffer.from(b64, 'base64') : null;
  } catch (e) { log('Reference recreation failed:', e.message.slice(0, 120)); return null; }
}
async function saferPrompt(headline, label) {
  try {
    const j = await gem(TEXT_MODEL, { contents: [{ parts: [{ text: `Write one image prompt for a realistic 3:4 vertical editorial photo that fits this Miami-Dade story: "${headline}". Rules: no real people or names, no faces, no police arrests, injuries, crashes, blood, or dead animals, no brands, no text. Show a calm, recognizable Miami-Dade setting or object related to the topic, with the main subject in the upper two-thirds and a simple darker bottom third. Reply as JSON {"prompt": "..."}.` }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: { type: 'OBJECT', properties: { prompt: { type: 'STRING' } }, required: ['prompt'] } } });
    return JSON.parse(j.candidates[0].content.parts[0].text).prompt;
  } catch (e) { return null; }
}
async function photo(prompt, headline, label) {
  if (!IMG_MODEL || DRY) return null;
  let buf = await photoOnce(prompt);
  if (buf) return buf;
  log('Retrying with a safer prompt.');
  const safe = await saferPrompt(headline, label);
  if (safe) { buf = await photoOnce(safe); if (buf) return buf; }
  log('Retrying with a generic Miami photo.');
  buf = await photoOnce('A realistic editorial photo in a 3:4 vertical portrait of the Miami skyline across Biscayne Bay in soft evening light. Main subject in the upper two-thirds, bottom third simple and darker. No text, letters, logos, or watermarks.');
  if (!buf) log('No photo for this post, using the plain background.');
  return buf;
}

async function circlePhoto(prompt) {
  if (!CIRCLE_ON || !prompt) return null;
  if (DRY) { // placeholder so the layout can be tested without spending anything
    const c = createCanvas(512, 512), x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 512, 512);
    g.addColorStop(0, '#FFC54D'); g.addColorStop(1, '#FF6B8B'); x.fillStyle = g; x.fillRect(0, 0, 512, 512); return c.toBuffer('image/png');
  }
  if (!IMG_MODEL) return null;
  const buf = await photoOnce(prompt, '1:1');
  if (!buf) log('No circle photo for this post.');
  return buf;
}

async function subjectCutout(photoBuf) { // the main subject with a transparent background, for the depth effect. Fails safe: no cutout means a flat circle.
  if (DRY) { // stand-in silhouette so the layout can be tested for free
    const c = createCanvas(1080, 1440), x = c.getContext('2d'); x.fillStyle = '#10151a';
    x.beginPath(); x.arc(540, 400, 140, 0, Math.PI * 2); x.fill(); x.beginPath(); x.ellipse(540, 860, 310, 420, 0, 0, Math.PI * 2); x.fill(); return c.toBuffer('image/png');
  }
  if (!photoBuf) return null;
  try {
    const { removeBackground } = await import('@imgly/background-removal-node');
    const out = await removeBackground(new Blob([photoBuf], { type: photoBuf[0] === 0x89 ? 'image/png' : 'image/jpeg' }), { model: 'small', output: { format: 'image/png' } });
    return Buffer.from(await out.arrayBuffer());
  } catch (e) { log('Depth effect skipped, using a flat circle:', String(e && e.message).slice(0, 140)); return null; }
}

/* ---------- compose ---------- */
async function compose(headlines, photoBuf, circleBuf, style) {
  const W = 1080, H = 1440, c = createCanvas(W, H), x = c.getContext('2d');
  let rect = [0, 0, W, H]; // where the main photo sits, so a cutout of it lines up exactly
  if (photoBuf) {
    const im = await loadImage(photoBuf), s = Math.max(W / im.width, H / im.height), w = im.width * s, h = im.height * s;
    x.drawImage(im, (W - w) / 2, (H - h) / 2, w, h); rect = [(W - w) / 2, (H - h) / 2, w, h];
  } else {
    const g = x.createLinearGradient(0, 0, W * .4, H); g.addColorStop(0, '#6B7C8A'); g.addColorStop(.5, '#232A31'); g.addColorStop(1, '#0B0D0F'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  }
  if (circleBuf && style) { // round inset photo, like Real Vegas Locals and Socals posts. Side and depth are random per post.
    const im = await loadImage(circleBuf), D = 480, R = D / 2, ring = 18, ri = R - ring, cy = 64 + R;
    let cut = null;
    if (style.depth) cut = await subjectCutout(photoBuf);
    let cx = style.side === 'left' ? 56 + R : W - 56 - R, cutLayer = null; // flat circles sit in the corner
    if (cut) { // depth effect: try a few spots on both sides and keep the one where the subject overlaps the circle cleanly
      const cutImg = await loadImage(cut), t = createCanvas(W, H), tx = t.getContext('2d'); tx.drawImage(cutImg, ...rect);
      const full = tx.getImageData(0, 0, W, H), px = full.data, A = new Uint8Array(W * H);
      for (let i = 0; i < A.length; i++) A[i] = px[i * 4 + 3];
      const test = ccx => {
        const x0 = Math.round(ccx - R), y0 = Math.round(cy - R); let tot = 0, cov = 0, fuzz = 0, edges = 0;
        for (let qy = 0; qy < D; qy++) for (let qx = 0; qx < D; qx++) {
          if ((qx - R) ** 2 + (qy - R) ** 2 > ri * ri) continue;
          const X = x0 + qx, Y = y0 + qy; if (X < 0 || Y < 0 || X >= W - 1 || Y >= H - 1) continue;
          const a = A[Y * W + X]; tot++; if (a > 127) cov++; if (a > 30 && a < 225) fuzz++;
          if ((a > 127) !== (A[Y * W + X + 1] > 127) || (a > 127) !== (A[(Y + 1) * W + X] > 127)) edges++;
        }
        const f = cov / tot, fz = fuzz / tot;
        return { f, fz, edges, ok: f >= .06 && f <= .55 && fz < .08 && edges < 3 * D, score: Math.abs(f - .22) + fz };
      };
      let best = null;
      for (const side of [style.side, style.side === 'left' ? 'right' : 'left']) for (const sh of [60, 120, 180, 240]) {
        const ccx = side === 'left' ? 56 + R + sh : W - 56 - R - sh, r = test(ccx);
        if (r.ok && (!best || r.score < best.score)) best = { ...r, ccx };
      }
      if (best) { cx = best.ccx; log('depth check: overlap', Math.round(best.f * 100) + '%, fuzzy', (best.fz * 100).toFixed(1) + '% -> DEPTH EFFECT used'); }
      else log('depth check: no clean spot found -> plain circle');
      if (best) { // snap half-transparent pixels to solid or clear so nothing looks see-through
        for (let i = 0; i < A.length; i++) { const v = A[i]; px[i * 4 + 3] = v <= 96 ? 0 : v >= 176 ? 255 : Math.round((v - 96) * 255 / 80); }
        tx.putImageData(full, 0, 0); cutLayer = t;
      }
    }
    const ccx = cx;
    x.save(); x.shadowColor = 'rgba(0,0,0,.5)'; x.shadowBlur = 38; x.shadowOffsetX = 0; x.shadowOffsetY = 12; x.beginPath(); x.arc(ccx, cy, R, 0, Math.PI * 2); x.fillStyle = RING; x.fill(); x.restore();
    x.save(); x.beginPath(); x.arc(ccx, cy, ri, 0, Math.PI * 2); x.clip();
    const s = Math.max(2 * ri / im.width, 2 * ri / im.height), w = im.width * s, h = im.height * s; x.drawImage(im, ccx - w / 2, cy - h / 2, w, h); x.restore();
    if (cutLayer) x.drawImage(cutLayer, 0, 0); // main subject drawn back on top of the circle
  }
  const adir = path.join(ROOT, 'assets');
  const lf = fs.existsSync(adir) ? fs.readdirSync(adir).find(f => /\.(png|webp)$/i.test(f)) : null;
  let lg = null, lw = 0, lh = 0;
  if (lf) { lg = await loadImage(fs.readFileSync(path.join(adir, lf))); lh = LOGO_H; lw = Math.min(300, lh * lg.width / lg.height); lh = lw * lg.height / lg.width; } // sized by height so any logo shape fits
  if (lg) { if (!globalThis.__logoLogged) { log('Logo found:', lf); globalThis.__logoLogged = true; } }
  else if (!globalThis.__logoLogged) { log('NO LOGO FOUND. Put logo.png in a folder named assets at the top of the repo. Looked in', adir); globalThis.__logoLogged = true; }
  const outs = [];
  for (const headline of headlines) { // same photo and circle every time, only the headline (and its fade) changes
    const c2 = createCanvas(W, H), x = c2.getContext('2d'); x.drawImage(c, 0, 0);
    const hl = headlineCanvas(headline), hy = H - hl.height - 32; // text bottom edge sits 40px from the bottom, same as the 40px side margins
    const fy = Math.max(0, hy - ((lg ? lh + 6 : 0) + 130)); // the fade covers the headline block plus a long, soft ramp above it (logo included), so it grows and shrinks with the headline and is on every post
    const pH = (hy - fy) / (H - fy); // where the headline starts inside the fade
    const g2 = x.createLinearGradient(0, fy, 0, H); // gradual S-curve from photo to black, then solid black from the top of the headline down, like the posts you make by hand
    g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(pH * .25, 'rgba(0,0,0,.1)'); g2.addColorStop(pH * .5, 'rgba(0,0,0,.34)'); g2.addColorStop(pH * .75, 'rgba(0,0,0,.7)'); g2.addColorStop(pH, 'rgba(0,0,0,.97)'); g2.addColorStop(1, 'rgba(0,0,0,1)');
    x.fillStyle = g2; x.fillRect(0, fy, W, H - fy);
    x.drawImage(hl, 0, hy);
    if (lg) x.drawImage(lg, (W - lw) / 2, hy - lh - 6, lw, lh); // logo sits centered just above the headline, like your regular posts
    outs.push({ post: c2.toBuffer('image/jpeg', 92), headline: hl.toBuffer('image/png') });
  }
  return outs;
}

/* ---------- page ---------- */
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const REPO = process.env.GITHUB_REPOSITORY || 'miamidader/post-builder';
function page(posts, cands, dateLabel) {
  const cards = posts.map((p, i) => `
<section class="slide" id="p${i}">
<div class="card">
 <div class="cardtop"><div class="lab">${esc(p.label)}</div>${p.hasCircle ? `<button type="button" class="ctog" role="switch" aria-checked="true" aria-label="Round photo" data-ctog="${i}">Circle<i></i></button>` : ''}</div>
 <div class="pwrap">${p.headlines.map((h, k) => `<img class="pimg${k ? '' : ' on'}" data-k="${k}" data-c="1" src="p${i + 1}_${k + 1}.jpg" alt="Post ${i + 1}, headline ${k + 1}"${i || k ? ' loading="lazy"' : ''}>`).join('')}${p.hasCircle ? p.headlines.map((h, k) => `<img class="pimg" data-k="${k}" data-c="0" src="p${i + 1}_${k + 1}_nc.jpg" alt="Post ${i + 1}, headline ${k + 1}, no circle" loading="lazy">`).join('') : ''}</div>
 ${p.headlines.length > 1 ? `<div class="seg" role="group" aria-label="Headline options" data-i="${i}">${p.headlines.map((h, k) => `<button type="button"${k ? '' : ' class="on"'} data-v="${k}" aria-pressed="${k ? 'false' : 'true'}">Headline ${k + 1}</button>`).join('')}</div>` : ''}
 <h2 data-h="${i}">${esc(p.headlines[0])}</h2>
 <p class="art">${esc(p.article).replace(/\n+/g, '<br><br>')}</p>
 <div class="row">
  <button class="btn" data-copy="article" data-i="${i}">Copy article</button>
  <a class="btn ghost" data-save="${i}" href="p${i + 1}_1.jpg" download="miamidader-${i + 1}.jpg">Save image</a>
 </div>
 <div class="row">
  <button class="btn ghost" data-img="h${i + 1}_1.png" data-hbtn="${i}">Copy headline PNG</button>
  <button class="btn ghost" data-copy="prompt" data-i="${i}">Copy photo prompt</button>
 </div>
 <a class="btn dark" href="https://www.instagram.com/" target="_blank" rel="noopener">Open Instagram</a>
 <p class="src">${p.url ? `Source: <a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.source || 'link')}</a>. Check the facts before you post.${p.details === false ? ' Only the headline or a short summary was available, so this has few details. Open the source and add them before posting.' : ''}` : 'From your fact library.'}</p>
 <p class="tip" data-s="${i}"></p>
</div>
</section>`).join('\n');
  const dots = posts.map((_, i) => `<button class="dot" aria-label="Post ${i + 1}" data-go="${i}"></button>`).join('');
  const data = JSON.stringify(posts.map(p => ({ article: p.article, prompt: p.imagePrompt, h: p.headlines }))).replace(/</g, '\\u003c');
  const stories = cands.map(c => {
    const made = posts.some(p => p.cid === c.id);
    return `
<div class="story${made ? ' made' : ''}" data-id="${c.id}">
 <label class="srow"><input type="checkbox" class="pick" value="${c.id}"${made ? ' disabled' : ''}><span class="box"></span><span class="sbody"><span class="chip">${esc(c.label)}</span>${made ? '<span class="chip done">Made</span>' : ''}${c.url && c.thin ? '<span class="chip warn">Few details</span>' : ''}<span class="stitle">${esc(c.title)}</span>${c.desc ? `<span class="sdesc">${esc(c.desc)}</span>` : ''}<span class="smeta">${c.url ? `${esc(c.source || '')} &middot; <span data-ago="${c.t || 0}"></span> &middot; <a href="${esc(c.link || c.url)}" target="_blank" rel="noopener">Read</a>` : 'From your fact library'}</span></span></label>
 <button type="button" class="ctog" role="switch" aria-checked="true" aria-label="Circle photo" data-cid="${c.id}">Circle<i></i></button>
</div>`;
  }).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Today's Posts</title><link rel="apple-touch-icon" href="../assets/icons/apple-touch-icon.png"><link rel="icon" type="image/png" sizes="32x32" href="../assets/icons/favicon-32.png"><meta name="theme-color" content="#EA742E">
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{--bg:#F3F5F2;--fg:#101316;--card:#fff;--mut:#5E6870;--bd:#DADFD9;--ac:#2FB457;--edge:#101316;--orange:#FF8A1F}
@media (prefers-color-scheme:dark){:root{--bg:#0B0D0F;--fg:#F2F4F1;--card:#161A1E;--mut:#97A1A9;--bd:#2B3238;--edge:#F2F4F1}}
*{box-sizing:border-box}html,body{margin:0}[hidden]{display:none!important}body{background:var(--bg);color:var(--fg);font:400 15px/1.45 Poppins,system-ui,sans-serif;padding:16px 0 28px;overflow-x:hidden}
.top,.wrap{padding:0 16px;max-width:560px;margin:0 auto}
.logo{font:400 15px Anton,Impact,sans-serif;letter-spacing:.04em}.logo em{font-style:normal;color:var(--orange)}
h1{font:700 26px/1.15 Poppins,sans-serif;margin:2px 0 4px}.sub{color:var(--mut);margin:0 0 12px;font-size:13px}
.tabs{display:flex;gap:4px;padding:3px;border:1.5px solid var(--edge);border-radius:99px;margin-bottom:12px}
.tabs button{flex:1;min-height:40px;border:0;border-radius:99px;background:transparent;color:var(--fg);font:600 14px Poppins,system-ui,sans-serif;cursor:pointer}.tabs button.on{background:var(--edge);color:var(--card)}
.nav{display:flex;align-items:center;justify-content:space-between;max-width:560px;margin:0 auto 10px;padding:0 16px}
.dots{display:flex;gap:8px}.dot{width:10px;height:10px;border-radius:50%;border:0;padding:0;background:var(--bd);cursor:pointer;transition:all .2s}.dot.on{background:var(--ac);width:26px;border-radius:6px}
.arrow{width:44px;height:44px;border-radius:50%;border:1.5px solid var(--edge);background:var(--card);color:var(--fg);font:700 18px Poppins;cursor:pointer;display:grid;place-items:center}.arrow:disabled{opacity:.3}
.count{font:600 13px Poppins;color:var(--mut)}
.track{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none;align-items:flex-start}.track::-webkit-scrollbar{display:none}
.slide{flex:0 0 100%;scroll-snap-align:center;scroll-snap-stop:always;padding:0 16px 8px;display:flex;justify-content:center;min-width:0}
.card{width:100%;min-width:0;max-width:520px;background:var(--card);border:1.5px solid var(--edge);border-radius:22px;padding:16px;box-shadow:0 4px 0 var(--ac)}
.cardtop{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;min-height:30px}
.lab{display:inline-block;font:600 12px Poppins;background:var(--edge);color:var(--card);border-radius:99px;padding:4px 12px}
.ctog{display:flex;align-items:center;gap:8px;border:1.5px solid var(--edge);background:transparent;color:var(--fg);border-radius:99px;padding:3px 4px 3px 12px;font:600 12px Poppins,system-ui,sans-serif;cursor:pointer}
.ctog i{width:34px;height:20px;border-radius:99px;background:var(--bd);position:relative;transition:background .15s}.ctog i:after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .15s}
.ctog[aria-checked=true] i{background:var(--ac)}.ctog[aria-checked=true] i:after{transform:translateX(14px)}
.pwrap{position:relative;width:100%;aspect-ratio:3/4;border-radius:16px;overflow:hidden;background:#222}
.pimg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;opacity:0;transition:opacity .12s ease}.pimg.on{opacity:1}
.seg{display:flex;gap:4px;margin-top:10px;padding:3px;border:1.5px solid var(--edge);border-radius:99px}
.seg button{flex:1;min-height:40px;border:0;border-radius:99px;background:transparent;color:var(--fg);font:600 13px Poppins,system-ui,sans-serif;cursor:pointer}
.seg button.on{background:var(--edge);color:var(--card)}
h2{font:700 17px/1.25 Poppins;margin:14px 0 8px}.art{margin:0 0 6px;overflow-wrap:anywhere}
.row{display:flex;gap:8px;margin-top:10px}.row .btn{flex:1;margin-top:0}
.btn{display:block;width:100%;text-align:center;text-decoration:none;font:600 14px Poppins;border:0;border-radius:16px;padding:12px 10px;margin-top:10px;cursor:pointer;color:#fff;background:var(--ac)}
.btn.ghost{background:transparent;color:var(--fg);border:1.5px solid var(--edge)}.btn.dark{background:var(--edge);color:var(--card);box-shadow:0 4px 0 var(--ac)}
.src,.tip{font-size:12px;color:var(--mut);margin:8px 0 0}.src a{color:var(--mut)}
.story{background:var(--card);border:1.5px solid var(--edge);border-radius:18px;padding:12px;margin-bottom:10px}.story.made{opacity:.5}
.srow{display:flex;gap:12px;cursor:pointer;min-width:0;position:relative}
.srow input{position:absolute;opacity:0;pointer-events:none}
.box{flex:0 0 auto;width:26px;height:26px;border-radius:9px;border:2px solid var(--edge);display:grid;place-items:center;margin-top:1px}
.srow input:checked+.box{background:var(--ac);border-color:var(--ac)}
.srow input:checked+.box:after{content:"";width:6px;height:12px;border:solid #fff;border-width:0 3px 3px 0;transform:rotate(45deg) translate(-1px,-1px)}
.srow input:focus-visible+.box{outline:3px solid var(--orange);outline-offset:2px}
.srow input:disabled+.box{opacity:.4}
.sbody{min-width:0;display:block}
.chip{display:inline-block;font:600 11px Poppins;background:var(--edge);color:var(--card);border-radius:99px;padding:2px 10px;margin-right:6px}.chip.done{background:var(--ac);color:#fff}.chip.warn{background:var(--orange);color:#101316}
.stitle{display:block;font:600 15px/1.3 Poppins;margin:6px 0 4px;overflow-wrap:anywhere}
.sdesc{display:block;font-size:13px;color:var(--mut);margin-bottom:4px}
.smeta{display:block;font-size:12px;color:var(--mut)}.smeta a{color:var(--mut)}
.story .ctog{display:none;width:max-content;margin:10px 0 0 auto}.story.sel .ctog{display:flex}
.gbar{position:sticky;bottom:0;background:linear-gradient(to top,var(--bg) 72%,transparent);padding:16px 0 calc(10px + env(safe-area-inset-bottom,0px))}
.gmsg{font-size:13px;color:var(--mut);margin:0 0 8px;min-height:18px;text-align:center}
#gen{margin-top:0}#gen:disabled{opacity:.4;cursor:default}
.setup{border:1.5px solid var(--edge);border-radius:16px;padding:12px 14px;margin:4px 0 12px;background:var(--card);font-size:13px}
.setup summary{font-weight:600;cursor:pointer}.setup ol{padding-left:18px;margin:8px 0}.setup li{margin:4px 0}
.setup input{width:100%;padding:10px;border:1.5px solid var(--edge);border-radius:12px;background:var(--bg);color:var(--fg);font:14px Poppins,system-ui,sans-serif;margin:8px 0}
.setup .row .btn{margin-top:0}
.empty{text-align:center;color:var(--mut);padding:40px 16px}
@media (prefers-reduced-motion:reduce){.track{scroll-behavior:auto}.pimg{transition:none}}
</style></head><body>
<div class="top"><div class="logo">MIAMI DADE<em>R</em></div><h1>Today's posts</h1><p class="sub">${esc(dateLabel)}. Pick the stories you want, then tap Generate.</p></div>
<div class="wrap"><div class="tabs" role="tablist"><button type="button" role="tab" id="tabS" class="on">Stories (${cands.length})</button><button type="button" role="tab" id="tabP">Posts (${posts.length})</button></div></div>
<div id="vs"><div class="wrap">
${stories}
<details class="setup" id="setup"><summary>One-time setup: connect GitHub</summary>
<p id="tokst"></p>
<p>This lets the Generate button start the build. The token stays on this phone only.</p>
<ol><li>On github.com go to Settings, Developer settings, Personal access tokens, Fine-grained tokens, Generate new token.</li><li>Repository access: Only select repositories, then pick post-builder.</li><li>Under Repository permissions, set Actions to Read and write.</li><li>Create the token, copy it, and paste it here.</li></ol>
<input type="password" id="tok" placeholder="Paste token" autocomplete="off" autocapitalize="off" spellcheck="false">
<div class="row"><button type="button" class="btn ghost" id="savetok">Save token</button><button type="button" class="btn ghost" id="forget" hidden>Forget token</button></div>
</details>
<div class="gbar"><p class="gmsg" id="gmsg">Pick 1 to 4 stories.</p><button type="button" class="btn" id="gen" disabled>Generate</button></div>
</div></div>
<div id="vp" hidden>
${posts.length ? `<div class="nav"><button class="arrow" id="prev" aria-label="Previous">&larr;</button><div style="text-align:center"><div class="dots">${dots}</div><div class="count" id="cnt"></div></div><button class="arrow" id="next" aria-label="Next">&rarr;</button></div>
<div class="track" id="track">
${cards}
</div>` : '<p class="empty">Nothing generated yet. Pick stories on the Stories tab.</p>'}
</div>
<script>
const D=${data},P=D.length,T=document.getElementById('track'),dots=[...document.querySelectorAll('.dot')],N=dots.length,REPO='${REPO}';
let cur=0;const say=(i,t)=>{const e=document.querySelector('[data-s="'+i+'"]');if(e)e.textContent=t};
function mark(i){cur=i;dots.forEach((d,k)=>d.classList.toggle('on',k===i));document.getElementById('cnt').textContent=(i+1)+' of '+N;document.getElementById('prev').disabled=i===0;document.getElementById('next').disabled=i===N-1}
function go(i){i=Math.max(0,Math.min(N-1,i));T.scrollTo({left:i*T.clientWidth,behavior:'smooth'});mark(i)}
if(N){T.addEventListener('scroll',()=>{const i=Math.round(T.scrollLeft/T.clientWidth);if(i!==cur)mark(i)},{passive:true});
dots.forEach(d=>d.onclick=()=>go(+d.dataset.go));
document.getElementById('prev').onclick=()=>go(cur-1);document.getElementById('next').onclick=()=>go(cur+1);mark(0)}
const vs=document.getElementById('vs'),vp=document.getElementById('vp'),tS=document.getElementById('tabS'),tP=document.getElementById('tabP');
function show(w){const p=w==='p';vs.hidden=p;vp.hidden=!p;tS.classList.toggle('on',!p);tP.classList.toggle('on',p);tS.setAttribute('aria-selected',!p);tP.setAttribute('aria-selected',p);if(p&&N){T.scrollTo({left:cur*T.clientWidth});mark(cur)}try{history.replaceState(null,'',p?'#posts':'#stories')}catch(e){}}
tS.onclick=()=>show('s');tP.onclick=()=>show('p');
show(location.hash==='#posts'||(P&&location.hash!=='#stories')?'p':'s');
document.querySelectorAll('.seg').forEach(g=>g.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const i=+g.dataset.i,v=+b.dataset.v,sl=document.getElementById('p'+i);
 g.querySelectorAll('button').forEach(x=>{const on=x===b;x.classList.toggle('on',on);x.setAttribute('aria-pressed',on)});
 sl.dataset.v=v;sl.querySelector('[data-h]').textContent=D[i].h[v];
 sl.querySelector('[data-hbtn]').dataset.img='h'+(i+1)+'_'+(v+1)+'.png';refresh(sl);say(i,'')}));
function refresh(sl){const i=+sl.id.slice(1),v=+(sl.dataset.v||0),c=sl.dataset.c||'1';
 sl.querySelectorAll('.pimg').forEach(im=>im.classList.toggle('on',+im.dataset.k===v&&im.dataset.c===c));
 sl.querySelector('[data-save]').href='p'+(i+1)+'_'+(v+1)+(c==='0'?'_nc':'')+'.jpg'}
document.querySelectorAll('[data-ctog]').forEach(b=>b.onclick=()=>{const sl=b.closest('.slide'),on=b.getAttribute('aria-checked')!=='true';b.setAttribute('aria-checked',on);sl.dataset.c=on?'1':'0';refresh(sl)});
(window.requestIdleCallback||setTimeout)(()=>document.querySelectorAll('.pimg').forEach(im=>{im.loading='eager'}));
document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=async()=>{const i=+b.dataset.i,t=D[i][b.dataset.copy];try{await navigator.clipboard.writeText(t);say(i,'Copied.')}catch(e){say(i,'Copy was blocked.')}});
document.querySelectorAll('[data-img]').forEach(b=>b.onclick=async()=>{const i=b.closest('.slide').id.slice(1);try{const blob=await (await fetch(b.dataset.img)).blob();await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);say(i,'Headline copied. Paste it in Bazaart.')}catch(e){say(i,'Copy was blocked. Use Save image instead.')}});
/* stories */
function ago(t){if(!t)return'';const m=Math.max(1,Math.round((Date.now()-t)/60000));if(m<60)return m+' min ago';const h=Math.round(m/60);return h<24?h+' hr ago':Math.round(h/24)+' d ago'}
document.querySelectorAll('[data-ago]').forEach(e=>e.textContent=ago(+e.dataset.ago));
const picks=[...document.querySelectorAll('.pick')],gen=document.getElementById('gen'),gm=document.getElementById('gmsg'),MAX=4;let busy=false;
function sel(){const on=picks.filter(c=>c.checked);picks.forEach(c=>{const s=c.closest('.story');if(!c.checked&&!s.classList.contains('made'))c.disabled=on.length>=MAX;s.classList.toggle('sel',c.checked)});
 gen.disabled=!on.length||busy;gen.textContent=on.length?'Generate '+on.length+' post'+(on.length>1?'s':''):'Generate';
 if(!busy)gm.textContent=on.length>=MAX?'That is the max of 4.':(on.length?'Each post uses AI credits.':'Pick 1 to 4 stories.')}
picks.forEach(c=>c.onchange=sel);
document.querySelectorAll('[data-cid]').forEach(b=>b.onclick=()=>b.setAttribute('aria-checked',b.getAttribute('aria-checked')!=='true'));
const tokEl=document.getElementById('tok'),setup=document.getElementById('setup');
const getTok=()=>{try{return localStorage.getItem('pbtok')||''}catch(e){return ''}};
function tokUI(){const t=getTok();document.getElementById('tokst').textContent=t?'Connected on this device.':'Not connected yet.';document.getElementById('forget').hidden=!t}
document.getElementById('savetok').onclick=()=>{const v=tokEl.value.trim();if(!v)return;try{localStorage.setItem('pbtok',v)}catch(e){gm.textContent='Could not save the token in this browser.';return}tokEl.value='';tokUI();setup.open=false;gm.textContent='Token saved. Pick stories and tap Generate.'};
document.getElementById('forget').onclick=()=>{try{localStorage.removeItem('pbtok')}catch(e){}tokUI()};
tokUI();
const API='https://api.github.com/repos/'+REPO+'/actions/workflows/generate.yml/';
const GH=t=>({Authorization:'Bearer '+t,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function run(){
 const t=getTok();if(!t){setup.open=true;gm.textContent='Connect GitHub first (one time).';setup.scrollIntoView({block:'center'});return}
 const ids=picks.filter(c=>c.checked).map(c=>+c.value),cir=ids.filter(i=>document.querySelector('[data-cid="'+i+'"]').getAttribute('aria-checked')==='true');
 busy=true;gen.disabled=true;gm.textContent='Sending to GitHub...';const t0=Date.now();
 try{
  const r=await fetch(API+'dispatches',{method:'POST',headers:Object.assign({'Content-Type':'application/json'},GH(t)),body:JSON.stringify({ref:'main',inputs:{picks:ids.join(','),circles:cir.join(',')}})});
  if(r.status!==204){busy=false;sel();gm.textContent=r.status===401?'GitHub says the token is wrong or expired. Make a new one.':(r.status===403||r.status===404)?'The token cannot start the build. It needs Actions: Read and write on this repo.':'GitHub said no ('+r.status+').';return}
 }catch(e){busy=false;sel();gm.textContent='Could not reach GitHub. Check your connection.';return}
 for(let k=0;k<90;k++){
  await wait(8000);
  let st='';
  try{const j=await (await fetch(API+'runs?event=workflow_dispatch&per_page=5',{headers:GH(t)})).json();const x=(j.workflow_runs||[]).find(y=>Date.parse(y.created_at)>t0-120000);if(x)st=x.status==='completed'?x.conclusion:x.status}catch(e){}
  if(st==='success'){gm.textContent='Done. Loading your posts...';for(let q=0;q<30;q++){try{const pj=await (await fetch('posts.json?v='+Date.now(),{cache:'no-store'})).json();if(pj.posts.length>P)break}catch(e){}await wait(6000)}location.replace(location.pathname+'?v='+Date.now()+'#posts');return}
  if(st==='failure'||st==='cancelled'||st==='timed_out'){busy=false;sel();gm.textContent='The build failed. Most likely Gemini is out of credits (ai.studio/projects).';return}
  gm.textContent='Generating... usually 2 to 3 minutes.';
 }
 busy=false;sel();gm.textContent='Taking longer than expected. Check the Posts tab in a few minutes.';
}
gen.onclick=run;sel();
</script></body></html>`;
}

/* ---------- main ---------- */
const MODE = ['generate', 'test-write'].includes(process.argv[2]) ? process.argv[2] : 'pick'; // pick = free morning list of stories; generate = write and illustrate only the stories you chose
const seenFile = path.join(ROOT, 'data/seen.json');
const state = JSON.parse(fs.readFileSync(seenFile, 'utf8'));
const lib = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/library.json'), 'utf8'));
const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/New_York' });

const storyData = c => c.text
  ? `${c.title} (${c.source})\n${c.thin ? 'ONLY A SHORT SUMMARY IS AVAILABLE. Do not guess any other details:' : 'ARTICLE TEXT FROM THE PUBLISHER (use its facts, write in your own words):'}\n${c.text}`
  : `${c.title} (${c.source})\n(Only the headline is available. Do not guess any details.)`;

async function enrich(items) { // read each story's real article so the writer has names and details, not just a headline
  const queue = items.filter(x => x.url); let k = 0;
  const worker = async () => {
    while (k < queue.length) {
      const x = queue[k++];
      try {
        const a = await getArticle(x.url); x.link = a.url; x.text = a.text; x.thin = a.thin;
        const d = a.desc && !similar(a.desc, x.title) ? a.desc : '';
        x.desc = d.length > 220 ? d.slice(0, 220).replace(/\s+\S*$/, '') + '…' : d;
        log('article', x.id, a.host, a.text.length, 'chars' + (a.thin ? ' (thin)' : ''));
      } catch (e) { x.thin = true; log('article failed', x.id, String(e.message).slice(0, 90)); }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}

if (MODE === 'pick') {
  let newsC, sportsC;
  if (DRY) {
    newsC = [{ title: 'County approves new housing plan for 4,000 families', source: 'Local 10', url: 'https://example.com/1', t: Date.now() - 3600e3, alts: ['4,000 Miami-Dade families get a housing win', 'County just approved 4,000 new homes'] }, { title: 'Hialeah crash closes lanes on the Palmetto', source: 'WSVN', url: 'https://example.com/2', t: Date.now() - 7200e3, alts: ['Palmetto lanes shut down after Hialeah crash', 'Avoid the Palmetto: crash blocks lanes'] }, { title: 'Karol G brings Tropitour to Miami for two nights', source: 'NBC 6', url: 'https://example.com/3', t: Date.now() - 10800e3, alts: ['Karol G is bringing Tropitour to Miami', 'Two nights of Karol G are coming to Miami'] }, { title: 'Miami Beach approves a very long and detailed plan for new beachfront lighting rules', source: 'Miami Herald', url: 'https://example.com/4', t: Date.now() - 14400e3 }, { title: 'Coral Gables bans leaf blowers on weekends', source: 'CBS Miami', url: 'https://example.com/5', t: Date.now() - 18000e3 }, { title: 'Doral mall adds a new food hall', source: 'Local 10', url: 'https://example.com/6', t: Date.now() - 21600e3 }];
    sportsC = [{ title: 'Dolphins now 0-3 as Hurricanes crack the top 5', source: 'ESPN', url: 'https://example.com/7', t: Date.now() - 5400e3, alts: ['Dolphins fall to 0-3 while the Canes climb', 'Miami football: Canes up, Dolphins down'] }, { title: 'Heat close the preseason with a win', source: 'NBC 6', url: 'https://example.com/8', t: Date.now() - 9000e3 }];
  } else {
    [newsC, sportsC] = await Promise.all([candidates('news', state.titles), candidates('sports', state.titles)]);
  }
  log('candidates', newsC.length, 'news,', sportsC.length, 'sports');
  const items = [];
  newsC.slice(0, 7).forEach(h => items.push({ kind: 'news', label: 'News', title: h.title, source: h.source, url: h.url, t: h.t, alts: h.alts }));
  sportsC.slice(0, 2).forEach(h => items.push({ kind: 'sports', label: 'Sports', title: h.title, source: h.source, url: h.url, t: h.t, alts: h.alts }));
  for (const k of ['facts', 'history']) { // one fact and one history item from your library, a different pair each day
    const left = lib.filter(x => x.k === k && !state.used.includes(x.t));
    if (left.length) { const x = left[Math.floor(Math.random() * left.length)]; items.push({ kind: k, label: k === 'facts' ? 'Fun fact' : 'History', title: x.t, desc: x.d }); }
  }
  items.forEach((x, i) => { x.id = i + 1; });
  if (!items.length) { console.error('No stories found.'); process.exit(1); }
  if (DRY) items.forEach((x, i) => { if (x.url) { x.text = i % 3 === 2 ? '' : 'Sample article text with names and details.'; x.thin = !x.text; x.desc = x.thin ? '' : 'Sample snippet from the article so you can judge the story before generating it.'; } });
  else await enrich(items);
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'candidates.json'), JSON.stringify({ date: dateLabel, items }, null, 1));
  fs.writeFileSync(path.join(OUT, 'posts.json'), JSON.stringify({ date: dateLabel, posts: [] }));
  fs.writeFileSync(path.join(OUT, 'index.html'), page([], items, dateLabel));
  log('done:', items.length, 'stories to pick from');
} else if (MODE === 'generate') {
  if (!DRY && !KEY) { console.error('GEMINI_API_KEY is missing. Add it in the repo settings under Secrets.'); process.exit(1); }
  const cands = JSON.parse(fs.readFileSync(path.join(OUT, 'candidates.json'), 'utf8')).items;
  const posts = JSON.parse(fs.readFileSync(path.join(OUT, 'posts.json'), 'utf8')).posts;
  const ids = [...new Set((process.env.PICKS || '').split(',').map(s => +s.trim()).filter(Boolean))];
  const circleIds = new Set((process.env.CIRCLES || '').split(',').map(s => +s.trim()).filter(Boolean));
  for (const id of ids) { // the story list may predate article reading, so fetch any missing article text now
    const c = cands.find(x => x.id === id);
    if (c && c.url && !c.text && !DRY) { try { const a = await getArticle(c.url); c.link = a.url; c.text = a.text; c.thin = a.thin; log('article', id, a.host, a.text.length, 'chars'); } catch (e) { c.thin = true; log('article failed', id, String(e.message).slice(0, 90)); } }
  }
  const jobs = ids.map(id => cands.find(c => c.id === id)).filter(c => c && !posts.some(p => p.cid === c.id)).slice(0, 4).map(c => (c.kind === 'facts' || c.kind === 'history')
    ? { cid: c.id, kind: c.kind, label: c.label, lib: { t: c.title, d: c.desc }, data: `${c.title}\n${c.desc}` }
    : { cid: c.id, kind: c.kind, label: c.label, details: !!c.text && !c.thin, h: { title: c.title, source: c.source, url: c.link || c.url, alts: c.alts }, data: storyData(c) });
  if (!jobs.length) { console.error('Nothing new to make. Picks were:', process.env.PICKS); process.exit(1); }
  let made = 0;
  for (const j of jobs) {
    try {
      const w = DRY ? (() => { const t = j.h ? j.h.title : j.lib.t; return { headlines: [t, ...(j.h && j.h.alts ? j.h.alts : ['Did you know? ' + t, 'Miami fact: ' + t])], article: 'Sample article text for the layout test.', imagePrompt: 'Sample image prompt.' }; })() : await write(j.kind, j.data);
      w.headline = w.headlines[0];
      let buf = null;
      if (j.kind === 'sports' && !DRY) { // real reference photo (freely licensed) -> new-angle recreation, with a caption credit
        const subj = await refSubject(w.headline), ref = subj && await commonsRef(subj);
        if (ref) { buf = await photoFromRef(w.headline, subj, ref); if (buf) { w.article += '\n\n' + ref.credit; log('Sports photo: recreated from a Commons reference'); } }
        if (!buf) log('Sports photo: no reference recreation, using the standard photo');
      }
      if (!buf) buf = await photo(w.imagePrompt, w.headline, j.label); await sleep(3000);
      const style = circleIds.has(j.cid) ? pickStyle() : null; // circle only for the stories you ticked it on
      const cbuf = style ? await circlePhoto(DRY ? 'dry' : w.circlePrompt) : null; if (cbuf && !DRY) await sleep(3000);
      log('circle:', style ? style.side + (style.depth ? ', depth' : ', flat') : 'none');
      const n = posts.length + 1, outs = await compose(w.headlines, buf, cbuf, style), hasCircle = !!(cbuf && style);
      outs.forEach((o, k) => { fs.writeFileSync(path.join(OUT, `p${n}_${k + 1}.jpg`), o.post); fs.writeFileSync(path.join(OUT, `h${n}_${k + 1}.png`), o.headline); });
      if (hasCircle) (await compose(w.headlines, buf, null, null)).forEach((o, k) => fs.writeFileSync(path.join(OUT, `p${n}_${k + 1}_nc.jpg`), o.post)); // same post without the round photo, for the toggle
      posts.push({ ...w, cid: j.cid, label: j.label, url: j.h && j.h.url, source: j.h && j.h.source, hasCircle, details: j.details });
      if (j.h) state.titles.push(j.h.title); if (j.lib) state.used.push(j.lib.t);
      made++;
      log('made', n, w.headlines.length + ' headlines:', w.headlines.join(' | '));
    } catch (e) { log('Skipped one post:', e.message); }
  }
  if (!made) { console.error('No posts were made.'); process.exit(1); }
  fs.writeFileSync(path.join(OUT, 'posts.json'), JSON.stringify({ date: dateLabel, posts }));
  fs.writeFileSync(path.join(OUT, 'index.html'), page(posts, cands, dateLabel));
  state.titles = state.titles.slice(-300); fs.writeFileSync(seenFile, JSON.stringify(state, null, 1));
  log('done:', made, 'new posts,', posts.length, 'total');
}
else { // test-write: one text-only call to check what the writer produces from the real article. Nothing is published.
  const c = JSON.parse(fs.readFileSync(path.join(OUT, 'candidates.json'), 'utf8')).items.find(x => x.id === +process.env.PICKS);
  const a = await getArticle(c.url); c.text = a.text; c.thin = a.thin;
  const data = storyData(c), w = await write(c.kind, data);
  const rep = `STORY: ${c.title}\nARTICLE CHARS: ${a.text.length}\n\nHEADLINES:\n${w.headlines.join('\n')}\n\nARTICLE:\n${w.article}\n`;
  fs.writeFileSync(path.join(ROOT, 'data/probe.log'), rep); console.log(rep);
}
