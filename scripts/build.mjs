import fs from 'fs';
import path from 'path';
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'today');
const KEY = process.env.GEMINI_API_KEY;
const DRY = process.env.DRY_RUN === '1';
const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-flash-latest';
const IMG_RAW = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-lite-image';
const IMG_MODEL = /^(off|none|no)$/i.test(IMG_RAW) ? '' : IMG_RAW; // set the variable to "off" for free posts with no AI photos
const NUM = +(process.env.NUM_POSTS || 4);
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
  const prompt = `Create an all caps instagram headline for my Miami area based news account and use this data to write an article that does not link to any news source affiliation (give it a Miami area-centric point of view). No em dashes. No emojis. The article does not need to be all caps.
Only use facts that appear in the data below. Do not invent details, quotes, names, dates, or numbers. If the data is thin, keep the article short rather than guessing.
Headline: 12 words or fewer. Article: about 80 to 120 words, short paragraphs.
Also write "imagePrompt": a prompt for a ${kind === 'history' ? 'vintage, archival-style editorial image' : 'realistic editorial photo'} in a 3:4 vertical portrait about this story. Main subject in the upper two-thirds, bottom third simple and darker. ${kind === 'history' ? 'No real identifiable people. ' : ''}No text, letters, logos, or watermarks.

DATA:
${dataText}`;
  const j = await gem(TEXT_MODEL, { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: { type: 'OBJECT', properties: { headline: { type: 'STRING' }, article: { type: 'STRING' }, imagePrompt: { type: 'STRING' } }, required: ['headline', 'article', 'imagePrompt'] } } });
  const o = JSON.parse(j.candidates[0].content.parts[0].text);
  return { headline: clean(o.headline).replace(/^["“]|["”]$/g, ''), article: clean(o.article), imagePrompt: clean(o.imagePrompt) };
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
async function photoOnce(prompt) {
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
    ['interactions', () => post('https://generativelanguage.googleapis.com/v1beta/interactions', { model: IMG_MODEL, input: prompt, response_format: { type: 'image', aspect_ratio: '3:4' } })],
    ['generateContent', () => post(`https://generativelanguage.googleapis.com/v1beta/models/${IMG_MODEL}:generateContent`, { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '3:4' } } })],
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

/* ---------- compose ---------- */
async function compose(headline, photoBuf) {
  const W = 1080, H = 1440, c = createCanvas(W, H), x = c.getContext('2d');
  if (photoBuf) {
    const im = await loadImage(photoBuf), s = Math.max(W / im.width, H / im.height), w = im.width * s, h = im.height * s;
    x.drawImage(im, (W - w) / 2, (H - h) / 2, w, h);
  } else {
    const g = x.createLinearGradient(0, 0, W * .4, H); g.addColorStop(0, '#6B7C8A'); g.addColorStop(.5, '#232A31'); g.addColorStop(1, '#0B0D0F'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  }
  const g2 = x.createLinearGradient(0, H * .4, 0, H); g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,.82)'); x.fillStyle = g2; x.fillRect(0, H * .4, W, H * .6);
  const hl = headlineCanvas(headline), hy = H - hl.height - 70;
  x.drawImage(hl, 0, hy);
  const adir = path.join(ROOT, 'assets');
  const lf = fs.existsSync(adir) ? fs.readdirSync(adir).find(f => /\.(png|webp)$/i.test(f)) : null;
  if (lf) { // logo sits centered just above the headline, like your regular posts
    const lg = await loadImage(fs.readFileSync(path.join(adir, lf))), lw = 300, lh = lw * lg.height / lg.width;
    x.drawImage(lg, (W - lw) / 2, hy - lh - 6, lw, lh);
    if (!globalThis.__logoLogged) { log('Logo found:', lf); globalThis.__logoLogged = true; }
  } else if (!globalThis.__logoLogged) { log('NO LOGO FOUND. Put logo.png in a folder named assets at the top of the repo. Looked in', adir); globalThis.__logoLogged = true; }
  return { post: c.toBuffer('image/png'), headline: hl.toBuffer('image/png') };
}

/* ---------- page ---------- */
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function page(posts, dateLabel) {
  const cards = posts.map((p, i) => `
<section class="slide" id="p${i}">
<div class="card">
 <div class="lab">${esc(p.label)}</div>
 <img class="pimg" src="p${i + 1}.png" alt="Post ${i + 1}"${i ? ' loading="lazy"' : ''}>
 <h2>${esc(p.headline)}</h2>
 <p class="art">${esc(p.article).replace(/\n+/g, '<br><br>')}</p>
 <div class="row">
  <button class="btn" data-copy="article" data-i="${i}">Copy article</button>
  <a class="btn ghost" href="p${i + 1}.png" download="miamidader-${i + 1}.png">Save image</a>
 </div>
 <div class="row">
  <button class="btn ghost" data-img="h${i + 1}.png">Copy headline PNG</button>
  <button class="btn ghost" data-copy="prompt" data-i="${i}">Copy photo prompt</button>
 </div>
 <a class="btn dark" href="https://www.instagram.com/" target="_blank" rel="noopener">Open Instagram</a>
 <p class="src">${p.url ? `Source: <a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.source || 'link')}</a>. Check the facts before you post.` : 'From your fact library.'}</p>
 <p class="tip" data-s="${i}"></p>
</div>
</section>`).join('\n');
  const dots = posts.map((_, i) => `<button class="dot" aria-label="Post ${i + 1}" data-go="${i}"></button>`).join('');
  const data = JSON.stringify(posts.map(p => ({ article: p.article, prompt: p.imagePrompt })));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Today's Posts</title>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{--bg:#F3F5F2;--fg:#101316;--card:#fff;--mut:#5E6870;--bd:#DADFD9;--ac:#2FB457;--edge:#101316;--orange:#FF8A1F}
@media (prefers-color-scheme:dark){:root{--bg:#0B0D0F;--fg:#F2F4F1;--card:#161A1E;--mut:#97A1A9;--bd:#2B3238;--edge:#F2F4F1}}
*{box-sizing:border-box}html,body{margin:0}body{background:var(--bg);color:var(--fg);font:400 15px/1.45 Poppins,system-ui,sans-serif;padding:16px 0 28px;overflow-x:hidden}
.top{padding:0 16px;max-width:560px;margin:0 auto}
.logo{font:400 15px Anton,Impact,sans-serif;letter-spacing:.04em}.logo em{font-style:normal;color:var(--orange)}
h1{font:700 26px/1.15 Poppins,sans-serif;margin:2px 0 4px}.sub{color:var(--mut);margin:0 0 12px;font-size:13px}
.nav{display:flex;align-items:center;justify-content:space-between;max-width:560px;margin:0 auto 10px;padding:0 16px}
.dots{display:flex;gap:8px}.dot{width:10px;height:10px;border-radius:50%;border:0;padding:0;background:var(--bd);cursor:pointer;transition:all .2s}.dot.on{background:var(--ac);width:26px;border-radius:6px}
.arrow{width:44px;height:44px;border-radius:50%;border:1.5px solid var(--edge);background:var(--card);color:var(--fg);font:700 18px Poppins;cursor:pointer;display:grid;place-items:center}.arrow:disabled{opacity:.3}
.count{font:600 13px Poppins;color:var(--mut)}
.track{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none;align-items:flex-start}.track::-webkit-scrollbar{display:none}
.slide{flex:0 0 100%;scroll-snap-align:center;scroll-snap-stop:always;padding:0 16px 8px;display:flex;justify-content:center}
.card{width:100%;max-width:520px;background:var(--card);border:1.5px solid var(--edge);border-radius:22px;padding:16px;box-shadow:0 4px 0 var(--ac)}
.lab{display:inline-block;font:600 12px Poppins;background:var(--edge);color:var(--card);border-radius:99px;padding:4px 12px;margin-bottom:10px}
.pimg{width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:16px;display:block;background:#222}
h2{font:700 17px/1.25 Poppins;margin:14px 0 8px}.art{margin:0 0 6px}
.row{display:flex;gap:8px;margin-top:10px}.row .btn{flex:1;margin-top:0}
.btn{display:block;width:100%;text-align:center;text-decoration:none;font:600 14px Poppins;border:0;border-radius:16px;padding:12px 10px;margin-top:10px;cursor:pointer;color:#fff;background:var(--ac)}
.btn.ghost{background:transparent;color:var(--fg);border:1.5px solid var(--edge)}.btn.dark{background:var(--edge);color:var(--card);box-shadow:0 4px 0 var(--ac)}
.src,.tip{font-size:12px;color:var(--mut);margin:8px 0 0}.src a{color:var(--mut)}
@media (prefers-reduced-motion:reduce){.track{scroll-behavior:auto}}
</style></head><body>
<div class="top"><div class="logo">MIAMI DADE<em>R</em></div><h1>Today's posts</h1><p class="sub">${esc(dateLabel)}. Swipe to see each one.</p></div>
<div class="nav"><button class="arrow" id="prev" aria-label="Previous">&larr;</button><div style="text-align:center"><div class="dots">${dots}</div><div class="count" id="cnt"></div></div><button class="arrow" id="next" aria-label="Next">&rarr;</button></div>
<div class="track" id="track">
${cards}
</div>
<script>
const D=${data},T=document.getElementById('track'),dots=[...document.querySelectorAll('.dot')],N=dots.length;
let cur=0;const say=(i,t)=>document.querySelector('[data-s="'+i+'"]').textContent=t;
function mark(i){cur=i;dots.forEach((d,k)=>d.classList.toggle('on',k===i));document.getElementById('cnt').textContent=(i+1)+' of '+N;document.getElementById('prev').disabled=i===0;document.getElementById('next').disabled=i===N-1}
function go(i){i=Math.max(0,Math.min(N-1,i));T.scrollTo({left:i*T.clientWidth,behavior:'smooth'});mark(i)}
T.addEventListener('scroll',()=>{const i=Math.round(T.scrollLeft/T.clientWidth);if(i!==cur)mark(i)},{passive:true});
dots.forEach(d=>d.onclick=()=>go(+d.dataset.go));
document.getElementById('prev').onclick=()=>go(cur-1);document.getElementById('next').onclick=()=>go(cur+1);
mark(0);
document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=async()=>{const i=+b.dataset.i,t=D[i][b.dataset.copy];try{await navigator.clipboard.writeText(t);say(i,'Copied.')}catch(e){say(i,'Copy was blocked.')}});
document.querySelectorAll('[data-img]').forEach(b=>b.onclick=async()=>{const i=b.closest('.slide').id.slice(1);try{const blob=await (await fetch(b.dataset.img)).blob();await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);say(i,'Headline copied. Paste it in Bazaart.')}catch(e){say(i,'Copy was blocked. Use Save image instead.')}});
</script></body></html>`;
}

/* ---------- main ---------- */
const seenFile = path.join(ROOT, 'data/seen.json');
const state = JSON.parse(fs.readFileSync(seenFile, 'utf8'));
const lib = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/library.json'), 'utf8'));

let newsC, sportsC;
if (DRY) {
  newsC = [{ title: 'County approves new housing plan for 4,000 families', source: 'Local 10', url: 'https://example.com/1' }, { title: 'Hialeah crash closes lanes on the Palmetto', source: 'WSVN', url: 'https://example.com/2' }, { title: 'Karol G brings Tropitour to Miami for two nights', source: 'NBC 6', url: 'https://example.com/3' }];
  sportsC = [{ title: 'Dolphins now 0-3 as Hurricanes crack the top 5', source: 'ESPN', url: 'https://example.com/4' }];
} else {
  if (!KEY) { console.error('GEMINI_API_KEY is missing. Add it in the repo settings under Secrets.'); process.exit(1); }
  [newsC, sportsC] = await Promise.all([candidates('news', state.titles), candidates('sports', state.titles)]);
}
log('candidates', newsC.length, 'news,', sportsC.length, 'sports');

const wantSports = Math.min(1, sportsC.length), wantLib = NUM >= 4 ? 1 : 0;
const wantNews = Math.min(newsC.length, NUM - wantSports - wantLib);
const newsPick = await pickBest(newsC, wantNews);
const sportsPick = sportsC.slice(0, wantSports);
const libKind = new Date().getDate() % 2 ? 'facts' : 'history';
const libLeft = lib.filter(x => x.k === libKind && !state.used.includes(x.t));
const libPick = wantLib && libLeft.length ? [libLeft[Math.floor(Math.random() * libLeft.length)]] : [];

const jobs = [
  ...newsPick.map(h => ({ kind: 'news', label: 'News', h, data: `${h.title} (${h.source})\n${h.url}` })),
  ...sportsPick.map(h => ({ kind: 'sports', label: 'Sports', h, data: `${h.title} (${h.source})\n${h.url}` })),
  ...libPick.map(x => ({ kind: libKind, label: libKind === 'facts' ? 'Fun fact' : 'History', lib: x, data: `${x.t}\n${x.d}` })),
];

fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const posts = [];
for (const j of jobs) {
  try {
    const w = DRY ? { headline: j.h ? j.h.title : j.lib.t, article: 'Sample article text for the layout test.', imagePrompt: 'Sample image prompt.' } : await write(j.kind, j.data);
    const buf = await photo(w.imagePrompt, w.headline, j.label); await sleep(3000);
    const n = posts.length + 1, { post, headline } = await compose(w.headline, buf);
    fs.writeFileSync(path.join(OUT, `p${n}.png`), post); fs.writeFileSync(path.join(OUT, `h${n}.png`), headline);
    posts.push({ ...w, label: j.label, url: j.h && j.h.url, source: j.h && j.h.source });
    if (j.h) state.titles.push(j.h.title); if (j.lib) state.used.push(j.lib.t);
    log('made', n, w.headline);
  } catch (e) { log('Skipped one post:', e.message); }
}
if (!posts.length) { console.error('No posts were made.'); process.exit(1); }
const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/New_York' });
fs.writeFileSync(path.join(OUT, 'index.html'), page(posts, dateLabel));
state.titles = state.titles.slice(-300); fs.writeFileSync(seenFile, JSON.stringify(state, null, 1));
log('done:', posts.length, 'posts');
