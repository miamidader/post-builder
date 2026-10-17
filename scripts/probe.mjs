// Temporary test: tries different ways of asking for the stories that were blocked or thin.
import fs from 'fs';
import { resolveGoogleNews, extract } from './article.mjs';
const items = JSON.parse(fs.readFileSync('today/candidates.json', 'utf8')).items.filter(x => [1, 3, 8, 9].includes(x.id));
const UAS = {
  browser: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', Accept: '*/*' },
  iphone: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' },
  curl: { 'User-Agent': 'curl/8.5.0', Accept: '*/*' },
  none: {},
};
const out = [];
for (const x of items) {
  let url; try { url = await resolveGoogleNews(x.url); } catch (e) { out.push(`#${x.id} unwrap failed ${e.message}`); continue; }
  out.push(`#${x.id} ${x.title}\n  ${url}`);
  for (const [name, h] of Object.entries(UAS)) {
    try {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 12000);
      const r = await fetch(url, { headers: h, redirect: 'follow', signal: ctl.signal }); clearTimeout(t);
      const html = await r.text(); const e = extract(html);
      out.push(`  [${name}] HTTP ${r.status} final=${r.url.slice(0, 90)} html=${html.length} p=${(html.match(/<p\b/gi) || []).length} desc=${e.desc.length} text=${e.text.length} :: ${e.text.slice(0, 160).replace(/\n/g, ' | ')}`);
    } catch (e) { out.push(`  [${name}] ERR ${e.message}`); }
  }
}
fs.writeFileSync('data/probe.log', out.join('\n') + '\n'); console.log(out.join('\n'));
