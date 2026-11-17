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

  /* ---------- your own photo: the post is put together right here on the phone, so no paid image AI is needed ---------- */
  const LAY = D.layout || { bot: 18, fade: 170, logo: 132 }, GEM = 'https://gemini.google.com/app';
  const ownBox = (pre, p) => `<details class="own"${p.plain ? ' open' : ''}><summary>Use your own photo (free Gemini app)</summary>
 <div class="row"><button type="button" class="btn ghost" data-act="${pre}gem" data-w="main">Photo prompt + Gemini</button><button type="button" class="btn ghost" data-act="${pre}gem" data-w="circle">Circle prompt + Gemini</button></div>
 <div class="row"><button type="button" class="btn dark" data-act="${pre}add" data-w="main">Add your photo</button><button type="button" class="btn ghost" data-act="${pre}add" data-w="circle">Add circle photo</button></div>
 <input type="file" accept="image/*" hidden data-file="main"><input type="file" accept="image/*" hidden data-file="circle"></details>`;
  const loadImg = src => new Promise((res, rej) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => rej(new Error('an image failed to load')); im.src = src; });
  async function fromFile(f) { try { return await createImageBitmap(f, { imageOrientation: 'from-image' }); } catch (e) { return loadImg(URL.createObjectURL(f)); } }
  async function composePost(o, hlUrl, circleOn) { // the same look as the server-made posts: photo, optional circle, fade, logo, stacked headline
    const W = 1080, H = 1440, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    if (o.photo) { const s = Math.max(W / o.photo.width, H / o.photo.height), w = o.photo.width * s, h = o.photo.height * s; x.drawImage(o.photo, (W - w) / 2, (H - h) / 2, w, h); }
    else { const g = x.createLinearGradient(0, 0, W * .4, H); g.addColorStop(0, '#6B7C8A'); g.addColorStop(.5, '#232A31'); g.addColorStop(1, '#0B0D0F'); x.fillStyle = g; x.fillRect(0, 0, W, H); }
    if (circleOn && o.circle) {
      const R = 240, ri = R - 18, cy = 64 + R, cx = o.side === 'left' ? 56 + R : W - 56 - R;
      x.save(); x.shadowColor = 'rgba(0,0,0,.5)'; x.shadowBlur = 38; x.shadowOffsetY = 12; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.fillStyle = '#FFFFFF'; x.fill(); x.restore();
      x.save(); x.beginPath(); x.arc(cx, cy, ri, 0, Math.PI * 2); x.clip(); const im = o.circle, s = Math.max(2 * ri / im.width, 2 * ri / im.height), w = im.width * s, h = im.height * s; x.drawImage(im, cx - w / 2, cy - h / 2, w, h); x.restore();
    }
    const [hl, lg] = await Promise.all([loadImg(hlUrl), loadImg('../assets/logo.png')]);
    const lw = Math.min(300, LAY.logo * lg.width / lg.height), lh = lw * lg.height / lg.width;
    const hy = H - hl.height - LAY.bot, fy = Math.max(0, hy - (LAY.fade || lh + 6 + 130)), pH = (hy - fy) / (H - fy);
    const g2 = x.createLinearGradient(0, fy, 0, H);
    g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(pH * .25, 'rgba(0,0,0,.1)'); g2.addColorStop(pH * .5, 'rgba(0,0,0,.34)'); g2.addColorStop(pH * .75, 'rgba(0,0,0,.7)'); g2.addColorStop(pH, 'rgba(0,0,0,.97)'); g2.addColorStop(1, 'rgba(0,0,0,1)');
    x.fillStyle = g2; x.fillRect(0, fy, W, H - fy); x.drawImage(hl, 0, hy); x.drawImage(lg, (W - lw) / 2, hy - lh - 6, lw, lh);
    return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('could not make the image')), 'image/jpeg', .92));
  }
  const own = {};
  async function renderOwn(key, wrap, hlUrl, circleOn, tip) {
    const o = own[key]; if (!o) return false;
    try {
      const blob = await composePost(o, hlUrl, circleOn); if (o.url) URL.revokeObjectURL(o.url); o.blob = blob; o.url = URL.createObjectURL(blob);
      wrap.hidden = false; let im = wrap.querySelector('.ownimg'); if (!im) { im = document.createElement('img'); im.className = 'pimg ownimg'; im.alt = 'Your post'; wrap.appendChild(im); }
      im.src = o.url; wrap.querySelectorAll('.pimg').forEach(e => e.classList.toggle('on', e === im)); return true;
    } catch (e) { tip('Could not use that photo: ' + (e.message || 'try another one') + '.'); return false; }
  }
  function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }
  async function shareImage(blobP, caption, name) { // opens the phone's share sheet with the image; the caption is copied first so it can be pasted in Instagram
    try { navigator.clipboard.writeText(caption).catch(() => {}); } catch (x) { /* ignore */ }
    const blob = await blobP, f = new File([blob], name, { type: 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f] }); return 'shared'; }
    download(blob, name); return 'saved';
  }
  function openGemini(prompt) { try { navigator.clipboard.writeText('Generate an image. ' + prompt).catch(() => {}); } catch (x) { /* ignore */ } window.open(GEM, '_blank'); } // copy first, open right away (phones block a new tab opened after a wait)

  /* ---------- posts tab ---------- */
  function card(p, i) {
    const hs = p.headlines;
    const imgs = hs.map((h, k) => `<img class="pimg${k ? '' : ' on'}" data-k="${k}" data-c="1" src="${file(p, 'p', k, 0, 'jpg')}" alt="Post ${i + 1}, headline ${k + 1}"${i || k ? ' loading="lazy"' : ''}>`).join('')
      + (p.hasCircle ? hs.map((h, k) => `<img class="pimg" data-k="${k}" data-c="0" src="${file(p, 'p', k, 1, 'jpg')}" alt="Post ${i + 1}, headline ${k + 1}, no circle" loading="lazy">`).join('') : '');
    return `<section class="slide" id="p${i}" data-i="${i}"><div class="card">
 <div class="cardtop"><div class="lab">${esc(p.label)}</div><button type="button" class="ctog" role="switch" aria-checked="true" aria-label="Round photo" data-act="circle"${p.hasCircle ? '' : ' hidden'}>Circle<i></i></button></div>
 <div class="pwrap">${imgs}</div>
 ${ownBox('', p)}
 ${hs.length > 1 ? `<div class="seg" role="group" aria-label="Headline options">${hs.map((h, k) => `<button type="button"${k ? '' : ' class="on"'} data-act="head" data-v="${k}" aria-pressed="${k ? 'false' : 'true'}">Headline ${k + 1}</button>`).join('')}</div>` : ''}
 <h2 data-h>${esc(hs[0])}</h2>
 <p class="art">${esc(p.article).replace(/\n+/g, '<br><br>')}</p>
 <div class="row"><button type="button" class="btn" data-act="copyart">Copy article</button><button type="button" class="btn ghost" data-act="save">Save image</button></div>
 <div class="row"><button type="button" class="btn ghost" data-act="copyh">Copy headline PNG</button><button type="button" class="btn ghost" data-act="copyprompt">Copy photo prompt</button></div>
 <button type="button" class="btn dark" data-act="share">Share to Instagram</button>
 <a class="btn ghost" href="https://www.instagram.com/" target="_blank" rel="noopener">Open Instagram</a>
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
  const ownRender = sl => { const i = +sl.dataset.i; return renderOwn('p' + i, sl.querySelector('.pwrap'), file(posts[i], 'h', +(sl.dataset.v || 0), 0, 'png'), sl.dataset.c !== '0', t => say(i, t)); };
  function refresh(sl) {
    if (own['p' + sl.dataset.i]) { ownRender(sl); return; }
    const v = +(sl.dataset.v || 0), c = sl.dataset.c || '1';
    sl.querySelectorAll('.pimg').forEach(im => im.classList.toggle('on', +im.dataset.k === v && im.dataset.c === c));
  }
  async function blobOf(url) { const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); }
  $('postsroot').addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const sl = b.closest('.slide'), i = +sl.dataset.i, p = posts[i], v = +(sl.dataset.v || 0), act = b.dataset.act;
    if (act === 'gem') { openGemini((b.dataset.w === 'circle' && p.circlePrompt) || p.imagePrompt); say(i, 'Prompt copied. Paste it into Gemini, save the photo, then tap Add.'); return; }
    if (act === 'share') {
      const o = own['p' + i];
      try { const r = await shareImage(o && o.blob ? o.blob : blobOf(file(p, 'p', v, sl.dataset.c === '0', 'jpg')), p.article, 'miamidader-' + p.n + '.jpg'); say(i, r === 'shared' ? 'Caption copied. Paste it in Instagram.' : 'Image saved and caption copied.'); }
      catch (x) { if (x.name !== 'AbortError') say(i, 'Could not open sharing. Use Save image instead.'); }
      return;
    }
    if (act === 'add') { sl.querySelector('[data-file="' + b.dataset.w + '"]').click(); return; }
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
      const o = own['p' + i]; if (o && o.blob) { download(o.blob, 'miamidader-' + p.n + '.jpg'); say(i, 'Saved.'); return; }
      const url = file(p, 'p', v, sl.dataset.c === '0', 'jpg');
      try {
        const a = document.createElement('a'); a.href = URL.createObjectURL(await blobOf(url)); a.download = 'miamidader-' + p.n + '.jpg';
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); say(i, 'Saved.');
      } catch (x) { window.open(url, '_blank'); }
    }
  });

  $('postsroot').addEventListener('change', async e => {
    const inp = e.target.closest('[data-file]'); if (!inp || !inp.files[0]) return;
    const sl = inp.closest('.slide'), i = +sl.dataset.i;
    try {
      const img = await fromFile(inp.files[0]), o = own['p' + i] = own['p' + i] || { side: Math.random() < .5 ? 'left' : 'right' };
      if (inp.dataset.file === 'circle') { o.circle = img; const t = sl.querySelector('.ctog'); t.hidden = false; t.setAttribute('aria-checked', 'true'); sl.dataset.c = '1'; } else o.photo = img;
      say(i, '');
    } catch (x) { say(i, 'Could not read that photo.'); }
    inp.value = ''; ownRender(sl);
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
 <div class="pwrap" data-mwrap hidden></div>
 <div class="hprev"><img data-hp src="${D.base}m_${m.id}_1.png" alt="Stacked headline"></div>
 <p class="art">${esc(m.article).replace(/\n+/g, '<br><br>')}</p>
 <div class="row"><button type="button" class="btn" data-act="mcopyart">Copy article</button><button type="button" class="btn ghost" data-act="mcopyh">Copy headline</button></div>
 <div class="row"><button type="button" class="btn ghost" data-act="mpng">Copy headline PNG</button></div>
 ${ownBox('m', { plain: true })}
 <button type="button" class="btn dark" data-act="mshare" hidden>Share to Instagram</button>
 <button type="button" class="btn ghost" data-act="msave" hidden>Save image</button>
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
      c.querySelector('[data-hp]').src = D.base + 'm_' + m.id + '_' + (+b.dataset.v + 1) + '.png'; tip('');
      if (own['m' + i]) mOwn(c);
    } else if (act === 'mgem') { openGemini((b.dataset.w === 'circle' && m.circlePrompt) || m.imagePrompt); tip('Prompt copied. Paste it into Gemini, save the photo, then tap Add.');
    } else if (act === 'madd') { c.querySelector('[data-file="' + b.dataset.w + '"]').click();
    } else if (act === 'mshare') { const o = own['m' + i]; if (o && o.blob) { try { const r = await shareImage(o.blob, m.article, 'miamidader-manual-' + m.id + '.jpg'); tip(r === 'shared' ? 'Caption copied. Paste it in Instagram.' : 'Image saved and caption copied.'); } catch (x) { if (x.name !== 'AbortError') tip('Could not open sharing. Use Save image instead.'); } }
    } else if (act === 'msave') { const o = own['m' + i]; if (o && o.blob) { download(o.blob, 'miamidader-manual-' + m.id + '.jpg'); tip('Saved.'); }
    } else if (act === 'mcopyart' || act === 'mcopyh') {
      try { await navigator.clipboard.writeText(act === 'mcopyart' ? m.article : m.headlines[v]); tip('Copied.'); } catch (x) { tip('Copy was blocked.'); }
    } else if (act === 'mpng') {
      try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobOf(D.base + 'm_' + m.id + '_' + (v + 1) + '.png') })]); tip('Headline copied. Paste it in Bazaart.'); } catch (x) { tip('Copy was blocked.'); }
    }
  });
  const mOwn = async c => { const i = +c.dataset.m, m = manual[i], ok = await renderOwn('m' + i, c.querySelector('[data-mwrap]'), D.base + 'm_' + m.id + '_' + (+(c.dataset.v || 0) + 1) + '.png', true, t => { c.querySelector('[data-ms]').textContent = t; }); if (ok) { c.querySelector('.hprev').hidden = true; c.querySelector('[data-act="msave"]').hidden = false; c.querySelector('[data-act="mshare"]').hidden = false; } };
  $('mlist').addEventListener('change', async e => {
    const inp = e.target.closest('[data-file]'); if (!inp || !inp.files[0]) return;
    const c = inp.closest('.mitem'), i = +c.dataset.m;
    try { const img = await fromFile(inp.files[0]), o = own['m' + i] = own['m' + i] || { side: Math.random() < .5 ? 'left' : 'right' }; if (inp.dataset.file === 'circle') o.circle = img; else o.photo = img; }
    catch (x) { c.querySelector('[data-ms]').textContent = 'Could not read that photo.'; }
    inp.value = ''; mOwn(c);
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

  /* ---------- pull down to reload (home screen apps on iPhone do not have this built in) ---------- */
  {
    const st = document.createElement('style'); st.textContent = '#ptr{position:fixed;top:calc(8px + env(safe-area-inset-top,0px));left:50%;transform:translate(-50%,-70px);background:var(--edge);color:var(--card);font:600 12px Poppins,system-ui,sans-serif;padding:6px 14px;border-radius:99px;z-index:20;pointer-events:none;opacity:0;white-space:nowrap}';
    document.head.appendChild(st);
    const ind = document.createElement('div'); ind.id = 'ptr'; ind.textContent = 'Pull to refresh'; document.body.appendChild(ind);
    let x0 = null, y0 = null, dy = 0;
    const reset = () => { x0 = y0 = null; dy = 0; ind.style.transition = 'all .2s'; ind.style.opacity = 0; ind.style.transform = 'translate(-50%,-70px)'; };
    addEventListener('touchstart', e => { ind.style.transition = 'none'; if (window.scrollY <= 0 && e.touches.length === 1 && !e.target.closest('textarea,input')) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; } else { x0 = y0 = null; } dy = 0; }, { passive: true });
    addEventListener('touchmove', e => {
      if (y0 === null) return;
      dy = e.touches[0].clientY - y0; const dx = Math.abs(e.touches[0].clientX - x0);
      if (dy <= 0 || dx > dy) { reset(); return; } // sideways swipes (the posts) and upward scrolls are left alone
      const p = Math.min(dy / 110, 1); ind.style.opacity = p; ind.style.transform = 'translate(-50%,' + (-70 + 70 * p) + 'px)'; ind.textContent = p >= 1 ? 'Release to refresh' : 'Pull to refresh';
    }, { passive: true });
    addEventListener('touchend', () => { if (y0 !== null && dy > 110) { ind.textContent = 'Refreshing...'; location.replace(location.pathname + '?v=' + Date.now() + (location.hash || '')); } else reset(); }, { passive: true });
  }

  /* ---------- start ---------- */
  renderPosts(); sel();
  show(location.hash === '#manual' ? 'm' : location.hash === '#posts' || (posts.length && location.hash !== '#stories') ? 'p' : 's');
  $('reload').onclick = () => { location.href = location.pathname + '?v=' + Date.now() + '#stories'; };
  /* GitHub's scheduler is often hours late, so opening the app on an old list asks GitHub for today's list right away */
  const todayLabel = () => new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/New_York' });
  const DAILY = 'https://api.github.com/repos/' + D.repo + '/actions/workflows/daily.yml/';
  const bannerSay = (t, btn) => { $('banner').hidden = false; $('banner').querySelector('span').textContent = t; const b = $('reload'); b.hidden = !btn; if (btn) b.textContent = btn; };
  let refreshing = false;
  async function autoRefresh() {
    if (refreshing) return; refreshing = true;
    const t = getTok();
    if (!t) { bannerSay("Today's stories are not here yet. Connect GitHub below and the app will fetch them by itself.", ''); setup.open = true; return; }
    bannerSay("Getting today's stories. This takes about 2 minutes.", '');
    try {
      const runs = await (await fetch(DAILY + 'runs?per_page=5', { headers: GH(t) })).json();
      const active = (runs.workflow_runs || []).some(x => x.status !== 'completed' && Date.parse(x.created_at) > Date.now() - 15 * 60000);
      if (!active) {
        const r = await fetch(DAILY + 'dispatches', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, GH(t)), body: JSON.stringify({ ref: 'main', inputs: { only_if_stale: 'true' } }) });
        if (r.status !== 204) { bannerSay('Could not start the refresh (' + r.status + '). The token may be wrong or expired.', ''); return; }
      }
    } catch (e) { bannerSay('Could not reach GitHub. Check your connection.', ''); return; }
    for (let k = 0; k < 80; k++) {
      await wait(5000);
      try {
        const pj = await fetchPosts();
        if (pj.date === todayLabel()) { // the list is on GitHub; reload once this page's own copy has caught up
          const h = await (await fetch(location.pathname + '?v=' + Date.now(), { cache: 'no-store' })).text();
          if (h.includes(pj.pick)) { location.replace(location.pathname + '?v=' + Date.now() + '#stories'); return; }
        }
      } catch (e) { /* try again */ }
    }
    bannerSay('Taking longer than expected.', 'Reload');
  }
  (async () => { // the copy of this page can be a few minutes behind GitHub, so check for newer posts or a new story list
    try {
      const pj = await fetchPosts();
      if (pj.date && pj.date !== todayLabel()) { autoRefresh(); return; }
      if (pj.pick && pj.pick !== D.pick) { bannerSay('There is a newer story list.', 'Reload'); return; }
      if (pj.posts.length > posts.length) { posts = pj.posts; renderPosts(); markMade(); }
    } catch (e) { /* offline or not found: keep what is on the page */ }
  })();
})();
