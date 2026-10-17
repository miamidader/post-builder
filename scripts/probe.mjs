// Temporary test: tries to read the real article for each of today's stories and reports what it got.
import fs from 'fs';
import { getArticle } from './article.mjs';
const items = JSON.parse(fs.readFileSync('today/candidates.json', 'utf8')).items.filter(x => x.url);
const out = [];
for (const x of items) {
  const t0 = Date.now();
  try {
    const a = await getArticle(x.url);
    out.push(`#${x.id} OK ${a.thin ? '(thin)' : ''} ${a.host} ${a.text.length} chars ${Date.now() - t0}ms\n  headline: ${x.title}\n  url: ${a.url}\n  desc: ${a.desc.slice(0, 200)}\n  text: ${a.text.slice(0, 400).replace(/\n/g, ' | ')}`);
  } catch (e) { out.push(`#${x.id} FAIL ${e.message} ${Date.now() - t0}ms\n  headline: ${x.title}`); }
}
fs.writeFileSync('data/probe.log', out.join('\n\n') + '\n');
console.log(out.join('\n\n'));
