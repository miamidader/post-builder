// Gets the real article text for a story, so the writer has names, places and details instead of just a headline.
// Google News links are redirects, so we first work out the publisher's real address, then read that page.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function get(url, o = {}, ms = 15000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  const headers = o.raw ? o.headers : { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', Accept: 'text/html,application/xhtml+xml,*/*;q=0.8', ...(o.headers || {}) };
  try { return await fetch(url, { redirect: 'follow', signal: ctl.signal, method: o.method, body: o.body, headers }); }
  finally { clearTimeout(t); }
}

export async function resolveGoogleNews(link) {
  const m = String(link).match(/\/articles\/([^?/#]+)/);
  if (!m) return link;
  const id = m[1];
  try { // older links carry the real address inside the id
    const raw = Buffer.from(id.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('latin1');
    const u = raw.match(/https?:\/\/[\x21-\x7e]+/);
    if (u && !/news\.google\.com/.test(u[0])) return u[0];
  } catch { /* fall through */ }
  let sg, ts;
  for (const base of ['https://news.google.com/rss/articles/', 'https://news.google.com/articles/']) {
    const html = await (await get(base + id)).text();
    sg = html.match(/data-n-a-sg="([^"]+)"/); ts = html.match(/data-n-a-ts="([^"]+)"/);
    if (sg && ts) break;
  }
  if (!sg || !ts) throw new Error('Google News gave no signature');
  const inner = JSON.stringify(['garturlreq', [['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1], 'X', 'X', 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0], id, +ts[1], sg[1]]);
  const body = 'f.req=' + encodeURIComponent(JSON.stringify([[['Fbv4je', inner, null, 'generic']]]));
  const r = await get('https://news.google.com/_/DotsSplashUi/data/batchexecute', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body });
  const txt = await r.text();
  for (const seg of txt.split('\n')) {
    if (!seg.startsWith('[[')) continue;
    let arr; try { arr = JSON.parse(seg); } catch { continue; }
    const row = arr.find(x => Array.isArray(x) && x[1] === 'Fbv4je' && typeof x[2] === 'string');
    if (row) { const u = JSON.parse(row[2])[1]; if (/^https?:/.test(u)) return u; }
  }
  throw new Error('Could not unwrap the Google News link');
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…' };
const dec = s => String(s).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
const strip = s => dec(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const BOILER = /subscribe|sign up|sign in|log in|cookie|advertisement|all rights reserved|copyright|newsletter|click here|follow us|download our app|privacy policy|terms of use|read more|related:|watch live|©/i;

function metaContent(html, name) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const key = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i);
    if (key && key[1].toLowerCase() === name) { const c = tag.match(/\bcontent\s*=\s*"([^"]*)"|\bcontent\s*=\s*'([^']*)'/i); if (c) return dec(c[1] ?? c[2]).trim(); }
  }
  return '';
}

export function extract(html) {
  const title = metaContent(html, 'og:title') || strip((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  const desc = metaContent(html, 'og:description') || metaContent(html, 'description') || metaContent(html, 'twitter:description');
  let ld = '';
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const walk = o => { if (!o || typeof o !== 'object') return; if (typeof o.articleBody === 'string' && o.articleBody.length > ld.length) ld = o.articleBody; for (const v of Object.values(o)) walk(v); }; walk(JSON.parse(m[1])); } catch { /* ignore bad json */ }
  }
  const body = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>|<!--[\s\S]*?-->|<(?:nav|header|footer|aside|form)\b[\s\S]*?<\/(?:nav|header|footer|aside|form)>/gi, ' ');
  const scope = (body.match(/<article\b[\s\S]*?<\/article>/i) || [body])[0];
  const seen = new Set(), paras = [];
  for (const m of scope.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const t = strip(m[1]);
    if (t.length < 60 || BOILER.test(t) || seen.has(t)) continue;
    seen.add(t); paras.push(t);
  }
  let text = paras.join('\n');
  const ldText = strip(ld);
  if (ldText.length > text.length) text = ldText;
  return { title, desc: strip(desc), text: text.slice(0, 3500) };
}

// Different sites accept different kinds of visitors, so try a few and keep whichever gave the most text.
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const STYLES = [{ 'User-Agent': IPHONE }, { 'User-Agent': 'curl/8.5.0', Accept: '*/*' }, { 'User-Agent': UA, Accept: '*/*' }];
export async function getArticle(link) {
  const url = await resolveGoogleNews(link);
  let best = null, lastErr;
  for (const headers of STYLES) {
    try {
      const r = await get(url, { raw: true, headers }, 9000);
      if (!r.ok) throw new Error('HTTP ' + r.status + ' from ' + new URL(url).hostname);
      if (!/html|xml/i.test(r.headers.get('content-type') || '')) throw new Error('Not a web page');
      const a = extract((await r.text()).slice(0, 2_000_000));
      const text = (a.desc && a.text.includes(a.desc.slice(0, 60)) ? a.text : [a.desc, a.text].filter(Boolean).join('\n\n')).slice(0, 3500);
      const res = { url: r.url || url, host: new URL(r.url || url).hostname.replace(/^www\./, ''), title: a.title, desc: a.desc, text, thin: text.length < 250 };
      if (!best || text.length > best.text.length) best = res;
      if (text.length >= 600) break;
    } catch (e) { lastErr = e; }
  }
  if (!best) throw lastErr;
  return best;
}
