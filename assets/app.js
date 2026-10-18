/* Page logic for today/index.html. Finished posts are read straight from GitHub, so they appear without waiting for the site to rebuild. */
(() => {
  const D = JSON.parse(document.getElementById('data').textContent);
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const wait = ms => new Promise(r => setTimeout(r, ms));
  let posts = D.posts || [], cur = 0, busy = false;
  const vs = $('vs'), vp = $('vp'), tS = $('tabS'), tP = $('tabP'), gen = $('gen'), gm = $('gmsg'), MAX = 4;
  const file = (p, pre, k, nc, ext) => D.base + pre + p.n + '_' + (k + 1) + (p.stamp ? '_' + p.stamp : '') + (nc ? '_nc' : '') + '.' + ext;
  const say = (i, t) => { const e = document.querySelector('[data-s="' + i + '"]'); if (e) e.textContent = t; };

  /* ---------- posts tab ---------- */
  function card(p, i) {
    const hs = p.headlines;
    const imgs = hs.map((h, k) => `<img class="pimg${k ? '' : ' on'}" data-k="${k}" data-c="1" src="${file(p, 'p', k, 0, 'jpg')}" alt="Post ${i + 1}, headline ${k + 1}"${i || k ? ' loading="lazy"' : ''}>`).join('')
      + (p.hasCircle ? hs.map((h, k) => `<img class="pimg" data-k="${k}" data-c="0" src="${file(p, 'p', k, 1, 'jpg')}" alt="Post ${i + 1}, headline ${k + 1}, no circle" loading="lazy">`).join('') : '');
    return `<section class="slide" id="p${i}" data-i="${i}"><div class="card">
 <div class="cardtop"><div class="lab">${esc(p.label)}</div>${p.hasCircle ? '<button type="button" class="ctog" role="switch" aria-checked="true" aria-label="Round photo" data-act="circle">Circle<i></i></button>' : ''}</div>
 <div class="pwrap">${imgs}</div>
 ${hs.length > 1 ? `<div class="seg" role="group" aria-label="Headline options">${hs.map((h, k) => `<button type="button"${k ? '' : ' class="on"'} data-act="head" data-v="${k}" aria-pressed="${k ? 'false' : 'true'}">Headline ${k + 1}</button>`).join('')}</div>` : ''}
 <h2 data-h>${esc(hs[0])}</h2>
 <p class="art">${esc(p.article).replace(/\n+/g, '<br><br>')}</p>
 <div class="row"><button type="button" class="btn" data-act="copyart">Copy article</button><button type="button" class="btn ghost" data-act="save">Save image</button></div>
 <div class="row"><button type="button" class="btn ghost" data-act="copyh">Copy headline PNG</button><button type="button" class="btn ghost" data-act="copyprompt">Copy photo prompt</button></div>
 <a class="btn dark" href="https://www.instagram.com/" target="_blank" rel="noopener">Open Instagram</a>
 <p class="src">${p.url ? `Source: <a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.source || 'link')}</a>. Check the facts before you post.${p.details === false ? ' Only the headline or a short summary was available, so this has few details. Open the source and add them before posting.' : ''}` : 'From your fact library.'}</p>
 <p class="tip" data-s="${i}"></p>
</div></section>`;
  }
  const track = () => $('track');
  function mark(i) {
    cur = i; document.querySelectorAll('.dot').forEach((d, k) => d.classList.toggle('on', k === i));
    $('cnt').textContent = (i + 1) + ' of ' + posts.length; $('prev').disabled = i === 0; $('next').disabled = i === posts.length - 1;
  }
  function go(i) { i = Math.max(0, Math.min(posts.length - 1, i)); const T = track(); T.scrollTo({ left: i * T.clientWidth, behavior: 'smooth' }); mark(i); }
  function renderPosts() {
    $('pc').textContent = posts.length;
    const root = $('postsroot');
    if (!posts.length) { root.innerHTML = '<p class="empty">Nothing generated yet. Pick stories on the Stories tab.</p>'; return; }
    root.innerHTML = `<div class="nav"><button type="button" class="arrow" id="prev" aria-label="Previous">&larr;</button><div style="text-align:center"><div class="dots">${posts.map((_, i) => `<button type="button" class="dot" aria-label="Post ${i + 1}" data-go="${i}"></button>`).join('')}</div><div class="count" id="cnt"></div></div><button type="button" class="arrow" id="next" aria-label="Next">&rarr;</button></div>
<div class="track" id="track">${posts.map(card).join('\n')}</div>`;
    const T = track();
    T.addEventListener('scroll', () => { const i = Math.round(T.scrollLeft / T.clientWidth); if (i !== cur) mark(i); }, { passive: true });
    root.querySelectorAll('.dot').forEach(d => d.onclick = () => go(+d.dataset.go));
    $('prev').onclick = () => go(cur - 1); $('next').onclick = () => go(cur + 1);
    root.querySelectorAll('.pimg').forEach(im => im.addEventListener('error', () => { if (!im.dataset.r) { im.dataset.r = 1; setTimeout(() => { im.src = im.src + (im.src.includes('?') ? '&' : '?') + 'r=' + Date.now(); }, 2500); } }));
    mark(Math.min(cur, posts.length - 1));
    (window.requestIdleCallback || setTimeout)(() => root.querySelectorAll('.pimg').forEach(im => { im.loading = 'eager'; }));
  }
  function refresh(sl) {
    const v = +(sl.dataset.v || 0), c = sl.dataset.c || '1';
    sl.querySelectorAll('.pimg').forEach(im => im.classList.toggle('on', +im.dataset.k === v && im.dataset.c === c));
  }
  async function blobOf(url) { const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); }
  $('postsroot').addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const sl = b.closest('.slide'), i = +sl.dataset.i, p = posts[i], v = +(sl.dataset.v || 0), act = b.dataset.act;
    if (act === 'head') {
      sl.dataset.v = b.dataset.v;
      b.parentNode.querySelectorAll('button').forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
      sl.querySelector('[data-h]').textContent = p.headlines[+b.dataset.v]; refresh(sl); say(i, '');
    } else if (act === 'circle') {
      const on = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', on); sl.dataset.c = on ? '1' : '0'; refresh(sl);
    } else if (act === 'copyart' || act === 'copyprompt') {
      try { await navigator.clipboard.writeText(act === 'copyart' ? p.article : p.imagePrompt); say(i, 'Copied.'); } catch (x) { say(i, 'Copy was blocked.'); }
    } else if (act === 'copyh') {
      try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobOf(file(p, 'h', v, 0, 'png')) })]); say(i, 'Headline copied. Paste it in Bazaart.'); } catch (x) { say(i, 'Copy was blocked. Use Save image instead.'); }
    } else if (act === 'save') {
      const url = file(p, 'p', v, sl.dataset.c === '0', 'jpg');
      try {
        const a = document.createElement('a'); a.href = URL.createObjectURL(await blobOf(url)); a.download = 'miamidader-' + p.n + '.jpg';
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); say(i, 'Saved.');
      } catch (x) { window.open(url, '_blank'); }
    }
  });

  /* ---------- tabs ---------- */
  const vm = $('vm'), tM = $('tabM');
  function show(w) {
    const p = w === 'p', m = w === 'm'; vs.hidden = p || m; vp.hidden = !p; vm.hidden = !m;
    tS.classList.toggle('on', w === 's'); tP.classList.toggle('on', p); tM.classList.toggle('on', m);
    tS.setAttribute('aria-selected', w === 's'); tP.setAttribute('aria-selected', p); tM.setAttribute('aria-selected', m);
    if (p && posts.length) { const T = track(); T.scrollTo({ left: cur * T.clientWidth }); mark(cur); }
    try { history.replaceState(null, '', p ? '#posts' : m ? '#manual' : '#stories'); } catch (e) { /* ignore */ }
  }
  tS.onclick = () => show('s'); tP.onclick = () => show('p'); tM.onclick = () => show('m');

  /* ---------- stories tab ---------- */
  function ago(t) { if (!t) return ''; const m = Math.max(1, Math.round((Date.now() - t) / 60000)); if (m < 60) return m + ' min ago'; const h = Math.round(m / 60); return h < 24 ? h + ' hr ago' : Math.round(h / 24) + ' d ago'; }
  document.querySelectorAll('[data-ago]').forEach(e => { e.textContent = ago(+e.dataset.ago); });
  const picks = [...document.querySelectorAll('.pick')];
  function sel() {
    const on = picks.filter(c => c.checked);
    picks.forEach(c => { const s = c.closest('.story'); if (!c.checked && !s.classList.contains('made')) c.disabled = on.length >= MAX; s.classList.toggle('sel', c.checked); });
    gen.disabled = !on.length || busy; gen.textContent = on.length ? 'Generate ' + on.length + ' post' + (on.length > 1 ? 's' : '') : 'Generate';
    if (!busy) gm.textContent = on.length >= MAX ? 'That is the max of 4.' : (on.length ? 'Each post uses AI credits.' : 'Pick 1 to 4 stories.');
  }
  function markMade() {
    document.querySelectorAll('.story').forEach(s => {
      if (!posts.some(p => p.cid === +s.dataset.id)) return;
      s.classList.add('made'); s.classList.remove('sel'); const c = s.querySelector('.pick'); c.checked = false; c.disabled = true;
      if (!s.querySelector('.chip.done')) { const ch = document.createElement('span'); ch.className = 'chip done'; ch.textContent = 'Made'; s.querySelector('.chip').after(ch); }
    });
    sel();
  }
  picks.forEach(c => { c.onchange = sel; });
  document.querySelectorAll('[data-cid]').forEach(b => { b.onclick = () => b.setAttribute('aria-checked', b.getAttribute('aria-checked') !== 'true'); });

  /* ---------- GitHub token and Generate ---------- */
  const tokEl = $('tok'), setup = $('setup');
  const getTok = () => { try { return localStorage.getItem('pbtok') || ''; } catch (e) { return ''; } };
  function tokUI() { const t = getTok(); $('tokst').textContent = t ? 'Connected on this device.' : 'Not connected yet.'; $('forget').hidden = !t; $('copylink').hidden = !t; }
  { // a reconnect link looks like .../today/#k=TOKEN: save it, then clear it from the address bar
    const m = location.hash.match(/[#&]k=([^&]+)/);
    if (m) { try { localStorage.setItem('pbtok', decodeURIComponent(m[1])); } catch (e) { /* ignore */ } try { history.replaceState(null, '', location.pathname + '#stories'); } catch (e) { /* ignore */ } }
  }
  $('copylink').onclick = async () => { try { await navigator.clipboard.writeText(location.origin + location.pathname + '#k=' + encodeURIComponent(getTok())); gm.textContent = 'Reconnect link copied. Keep it private.'; } catch (e) { gm.textContent = 'Copy was blocked.'; } };
  $('savetok').onclick = () => {
    const v = tokEl.value.trim(); if (!v) return;
    try { localStorage.setItem('pbtok', v); } catch (e) { gm.textContent = 'Could not save the token in this browser.'; return; }
    tokEl.value = ''; tokUI(); setup.open = false; gm.textContent = 'Token saved. Pick stories and tap Generate.';
  };
  $('forget').onclick = () => { try { localStorage.removeItem('pbtok'); } catch (e) { /* ignore */ } tokUI(); };
  tokUI();
  const API = 'https://api.github.com/repos/' + D.repo + '/actions/workflows/generate.yml/';
  const GH = t => ({ Authorization: 'Bearer ' + t, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });
  async function fetchPosts() { const r = await fetch(D.base + 'posts.json?v=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }
  function fail(msg) { busy = false; sel(); gm.textContent = msg; }

  async function run() {
    const t = getTok();
    if (!t) { setup.open = true; gm.textContent = 'Connect GitHub first (one time).'; setup.scrollIntoView({ block: 'center' }); return; }
    const ids = picks.filter(c => c.checked).map(c => +c.value);
    const cir = ids.filter(i => document.querySelector('[data-cid="' + i + '"]').getAttribute('aria-checked') === 'true');
    const before = posts.length;
    busy = true; gen.disabled = true; gm.textContent = 'Sending to GitHub...'; const t0 = Date.now();
    try {
      const r = await fetch(API + 'dispatches', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, GH(t)), body: JSON.stringify({ ref: 'main', inputs: { picks: ids.join(','), circles: cir.join(',') } }) });
      if (r.status !== 204) return fail(r.status === 401 ? 'GitHub says the token is wrong or expired. Make a new one.' : (r.status === 403 || r.status === 404) ? 'The token cannot start the build. It needs Actions: Read and write on this repo.' : 'GitHub said no (' + r.status + ').');
    } catch (e) { return fail('Could not reach GitHub. Check your connection.'); }
    for (let k = 0; k < 150; k++) {
      await wait(4000);
      try { // finished posts are read directly from GitHub, no waiting for the site to rebuild
        const pj = await fetchPosts();
        if (pj.pick === D.pick && pj.posts.length > before) {
          posts = pj.posts; renderPosts(); markMade(); busy = false; sel(); gm.textContent = 'Done in ' + Math.round((Date.now() - t0) / 1000) + 's.'; show('p'); go(before); return;
        }
      } catch (e) { /* try again */ }
      if (k % 2 === 1) {
        try {
          const j = await (await fetch(API + 'runs?event=workflow_dispatch&per_page=5', { headers: GH(t) })).json();
          const x = (j.workflow_runs || []).find(y => Date.parse(y.created_at) > t0 - 120000);
          if (x && x.status === 'completed' && x.conclusion !== 'success') return fail('The build failed. Most likely Gemini is out of credits (ai.studio/projects).');
        } catch (e) { /* ignore */ }
      }
      gm.textContent = 'Generating... ' + Math.round((Date.now() - t0) / 1000) + 's (usually about a minute)';
    }
    fail('Taking longer than expected. Check the Posts tab in a few minutes.');
  }
  gen.onclick = run;

  /* ---------- manual tab ---------- */
  let manual = [];
  const mmsg = $('mmsg'), mgen = $('mgen');
  function mcard(m, i) {
    return `<div class="card mitem" data-m="${i}">
 <div class="cardtop"><div class="lab">Manual</div></div>
 <p class="topic">${esc(m.topic)}</p>
 <div class="seg" role="group" aria-label="Headline options">${m.headlines.map((h, k) => `<button type="button"${k ? '' : ' class="on"'} data-act="mhead" data-v="${k}" aria-pressed="${k ? 'false' : 'true'}">Headline ${k + 1}</button>`).join('')}</div>
 <h2 data-h>${esc(m.headlines[0])}</h2>
 <p class="art">${esc(m.article).replace(/\n+/g, '<br><br>')}</p>
 <div class="row"><button type="button" class="btn" data-act="mcopyart">Copy article</button><button type="button" class="btn ghost" data-act="mcopyh">Copy headline</button></div>
 <div class="row"><button type="button" class="btn ghost" data-act="mpng">Copy headline PNG</button></div>
 <button type="button" class="btn dark" data-act="mgemini">Copy photo prompt and open Gemini</button>
 ${m.src ? `<p class="src">Source: <a href="${esc(m.src)}" target="_blank" rel="noopener">link</a>. Check the facts before you post.</p>` : '<p class="src">Written only from what you typed. Check the facts before you post.</p>'}
 <p class="tip" data-ms="${i}"></p>
</div>`;
  }
  function renderManual() { $('mlist').innerHTML = manual.map(mcard).join(''); }
  $('mlist').addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const c = b.closest('.mitem'), i = +c.dataset.m, m = manual[i], v = +(c.dataset.v || 0), act = b.dataset.act, tip = t => { c.querySelector('[data-ms]').textContent = t; };
    if (act === 'mhead') {
      c.dataset.v = b.dataset.v; b.parentNode.querySelectorAll('button').forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
      c.querySelector('[data-h]').textContent = m.headlines[+b.dataset.v]; tip('');
    } else if (act === 'mgemini') { // copy first, open right away (phones block a new tab opened after a wait)
      try { navigator.clipboard.writeText('Generate an image. ' + m.imagePrompt).catch(() => {}); } catch (x) { /* ignore */ }
      window.open('https://gemini.google.com/app', '_blank'); tip('Prompt copied. Paste it into Gemini.');
    } else if (act === 'mcopyart' || act === 'mcopyh') {
      try { await navigator.clipboard.writeText(act === 'mcopyart' ? m.article : m.headlines[v]); tip('Copied.'); } catch (x) { tip('Copy was blocked.'); }
    } else if (act === 'mpng') {
      try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobOf(D.base + 'm_' + m.id + '_' + (v + 1) + '.png') })]); tip('Headline copied. Paste it in Bazaart.'); } catch (x) { tip('Copy was blocked.'); }
    }
  });
  async function fetchManual() { const r = await fetch(D.base + 'manual.json?v=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); return (await r.json()).items || []; }
  const MAPI = 'https://api.github.com/repos/' + D.repo + '/actions/workflows/manual.yml/';
  function mfail(msg) { mgen.disabled = false; mmsg.textContent = msg; }
  mgen.onclick = async () => {
    const topic = $('mtext').value.trim(), t = getTok();
    if (!topic) { mmsg.textContent = 'Type a topic or paste a link first.'; return; }
    if (!t) { show('s'); setup.open = true; gm.textContent = 'Connect GitHub first (one time).'; setup.scrollIntoView({ block: 'center' }); return; }
    const id = Date.now().toString(36); mgen.disabled = true; mmsg.textContent = 'Sending to GitHub...'; const t0 = Date.now();
    try {
      const r = await fetch(MAPI + 'dispatches', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, GH(t)), body: JSON.stringify({ ref: 'main', inputs: { topic, mid: id } }) });
      if (r.status !== 204) return mfail(r.status === 401 ? 'GitHub says the token is wrong or expired. Make a new one.' : (r.status === 403 || r.status === 404) ? 'The token cannot start the build. It needs Actions: Read and write on this repo.' : 'GitHub said no (' + r.status + ').');
    } catch (e) { return mfail('Could not reach GitHub. Check your connection.'); }
    for (let k = 0; k < 90; k++) {
      await wait(4000);
      try { const items = await fetchManual(); if (items.some(x => x.id === id)) { manual = items; renderManual(); $('mtext').value = ''; mgen.disabled = false; mmsg.textContent = 'Done in ' + Math.round((Date.now() - t0) / 1000) + 's.'; return; } } catch (e) { /* try again */ }
      if (k % 2 === 1) {
        try {
          const j = await (await fetch(MAPI + 'runs?event=workflow_dispatch&per_page=5', { headers: GH(t) })).json();
          const x = (j.workflow_runs || []).find(y => Date.parse(y.created_at) > t0 - 120000);
          if (x && x.status === 'completed' && x.conclusion !== 'success') return mfail('The build failed. Most likely Gemini is out of credits (ai.studio/projects).');
        } catch (e) { /* ignore */ }
      }
      mmsg.textContent = 'Writing... ' + Math.round((Date.now() - t0) / 1000) + 's (usually under a minute)';
    }
    mfail('Taking longer than expected. Try again in a minute.');
  };
  fetchManual().then(items => { manual = items; renderManual(); }).catch(() => {});

  /* ---------- start ---------- */
  renderPosts(); sel();
  show(location.hash === '#manual' ? 'm' : location.hash === '#posts' || (posts.length && location.hash !== '#stories') ? 'p' : 's');
  $('reload').onclick = () => { location.href = location.pathname + '?v=' + Date.now() + '#stories'; };
  (async () => { // the copy of this page can be a few minutes behind GitHub, so check for newer posts or a new story list
    try {
      const pj = await fetchPosts();
      if (pj.pick && pj.pick !== D.pick) { $('banner').hidden = false; return; }
      if (pj.posts.length > posts.length) { posts = pj.posts; renderPosts(); markMade(); }
    } catch (e) { /* offline or not found: keep what is on the page */ }
  })();
})();
