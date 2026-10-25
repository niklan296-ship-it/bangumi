'use strict';
/* «Смотреть»: выбор, где смотреть тайтл. Свои сайты и приложения добавляются ссылкой поиска —
   достаточно найти на сайте любое слово (например naruto) и вставить ссылку: слово само заменится на название. */

const Watch = (() => {
  const enc = encodeURIComponent;
  const viaGoogle = host => q => 'https://www.google.com/search?q=' + enc('site:' + host + ' ' + q);
  // ru — каким названием искать: русским (true) или английским/ромадзи
  const BUILTIN = [
    { id: 'crunchyroll', name: 'Crunchyroll', ab: 'CR', c: '#F47521', ru: false, url: q => 'https://www.crunchyroll.com/search?q=' + enc(q) },
    { id: 'animego', name: 'AnimeGO', ab: 'GO', c: '#7B4DFF', ru: true, url: viaGoogle('animego.me') },
    { id: 'animeon', name: 'AnimeOn', ab: 'ON', c: '#E8364F', ru: true, url: viaGoogle('animeon.club') },
    { id: 'jutsu', name: 'Jut.su', ab: 'JS', c: '#4E9A3E', ru: true, url: viaGoogle('jut.su') },
    { id: 'youtube', name: 'YouTube', ab: '▶', c: '#FF0033', ru: false, url: q => 'https://www.youtube.com/results?search_query=' + enc(q + ' anime') },
    { id: 'netflix', name: 'Netflix', ab: 'N', c: '#E50914', ru: false, url: q => 'https://www.netflix.com/search?q=' + enc(q) },
    { id: 'shikimori', name: 'Shikimori', ab: 'SH', c: '#3A3F4B', ru: true, url: (q, mal) => mal ? 'https://shikimori.one/animes/' + mal : 'https://shikimori.one/animes?search=' + enc(q) },
    { id: 'google', name: 'Google', ab: 'G', c: '#4285F4', ru: LANG !== 'en', url: q => 'https://www.google.com/search?q=' + enc(q + (LANG === 'en' ? ' watch online' : ' смотреть онлайн')) }
  ];
  const PALETTE = ['#FF7A45', '#3DDC97', '#5AC8FA', '#B18CFF', '#FF6FAE', '#FFC23D', '#7C9DFF', '#E056FD'];
  let W = null; // { x, mode: 'pick' | 'edit' | 'add' }

  const cfg = () => {
    const st = state.settings;
    st.watchSites = st.watchSites || [];
    st.watchHidden = st.watchHidden || {};
    // перенос из прошлой версии: один «свой» сайт
    if (st.watchTpl && !st.watchSites.some(s => s.tpl === st.watchTpl)) {
      st.watchSites.push({ id: 'c' + Date.now().toString(36), name: L('Мой сайт', 'My site'), tpl: st.watchTpl, ru: LANG !== 'en' });
      delete st.watchTpl;
    }
    return st;
  };
  function sites(all) {
    const st = cfg();
    const custom = st.watchSites.map((s, k) => ({ id: s.id, name: s.name, ab: abbr(s.name), c: s.c || PALETTE[k % PALETTE.length], ru: s.ru, custom: true, tpl: s.tpl,
      url: q => buildTpl(s.tpl, q) }));
    let list = custom.concat(BUILTIN);
    if (!all) list = list.filter(s => !st.watchHidden[s.id]);
    // последний выбранный — первым
    const last = st.watchLast;
    return list.sort((a, b) => (b.id === last) - (a.id === last));
  }
  const abbr = name => { const w = String(name).trim().split(/[\s.\-_]+/).filter(Boolean); return ((w[0] || '?')[0] + (w[1] ? w[1][0] : (w[0] || '').slice(1, 2))).toUpperCase(); };
  function buildTpl(tpl, q) {
    tpl = String(tpl || '').trim();
    if (!tpl) return '';
    return tpl.includes('{q}') ? tpl.split('{q}').join(enc(q)) : tpl + enc(q);
  }
  function queryFor(x, ru) {
    const t = x.titles || x.title || {};
    const mal = x.idMal || null;
    const rus = (x.titles && x.titles.russian) || ruN(mal);
    return ru ? (rus || t.romaji || t.english || x.customTitle || '') : (t.english || t.romaji || x.customTitle || rus || '');
  }
  function urlFor(site, x) {
    const q = queryFor(x, site.ru);
    if (!q && !x.idMal) return '';
    return site.url(q, x.idMal || null);
  }
  /* Безопасные ссылки: http(s) и схемы приложений, но не javascript:/data: */
  function okUrl(u) {
    u = String(u || '').trim();
    if (!/^[a-z][a-z0-9+.\-]*:/i.test(u)) return false;
    return !/^(javascript|data|vbscript|file|blob):/i.test(u);
  }

  /* ---------- Кнопка ---------- */
  function btnHTML(x, cls) {
    if (!x) return '';
    const st = cfg();
    const last = sites().find(s => s.id === st.watchLast);
    const ref = x.id && state.items[x.id] ? `data-watch-item="${esc(x.id)}"` : `data-watch-ani="${esc(x.anilistId || x.id)}"`;
    return `<button class="btn ${cls || ''} watch-btn" type="button" data-action="watch-open" ${ref}>${ICON.play}<span>${T('Смотреть')}</span>${last ? `<small>${esc(last.name)}</small>` : ''}</button>`;
  }
  function targetFrom(el) {
    if (el.dataset.watchItem) return state.items[el.dataset.watchItem] || null;
    const a = +el.dataset.watchAni;
    return byAni()[a] || ui.media[a] || null;
  }

  /* ---------- Лист выбора ---------- */
  function showSheet(html) {
    const top = ui.overlays[ui.overlays.length - 1];
    const sh = document.querySelector('#sheetWrap .sheet');
    if (top === 'sheet' && sh) { sh.className = 'sheet ws-sheet no-anim'; sh.innerHTML = html; return; }
    openSheet(html);
    const s2 = document.querySelector('#sheetWrap .sheet');
    if (s2) s2.classList.add('ws-sheet');
  }
  function open(x) {
    if (!x) return;
    W = { x, mode: 'pick' };
    buzz(8);
    showSheet(html());
  }
  function manage() {
    W = { x: null, mode: 'edit' };
    showSheet(html());
  }
  function rerender() { const sh = document.querySelector('#sheetWrap .sheet'); if (sh && W) { sh.classList.add('no-anim'); sh.innerHTML = html(); } }

  function tile(s, edit) {
    const style = `style="--c:${esc(s.c)}"`;
    const hidden = cfg().watchHidden[s.id];
    const inner = `<span class="ws-ico">${esc(s.ab)}</span><b>${esc(s.name)}</b><small>${s.custom ? T('свой') : s.ru ? T('по-русски') : T('по-английски')}</small>`;
    if (edit) {
      return `<div class="ws-tile${hidden ? ' off' : ''}" ${style}>${inner}
        ${s.custom ? `<button type="button" class="ws-x" data-ws="del" data-id="${esc(s.id)}" aria-label="${T('Удалить')}">${ICON.trash}</button>`
          : `<button type="button" class="ws-x" data-ws="toggle" data-id="${esc(s.id)}" aria-label="${hidden ? T('Показать') : T('Скрыть')}">${hidden ? ICON.plus : ICON.x}</button>`}</div>`;
    }
    const url = urlFor(s, W.x);
    if (!url || !okUrl(url)) return '';
    return `<a class="ws-tile" ${style} href="${esc(url)}" target="_blank" rel="noopener" data-ws-go="${esc(s.id)}">${inner}</a>`;
  }
  function html() {
    if (W.mode === 'add') return addHTML();
    const edit = W.mode === 'edit';
    const t = W.x ? (W.x.titles || W.x.customTitle ? title(W.x) : mediaTitle(W.x)) : '';
    const list = sites(edit);
    return `<div class="grab"></div>
      <h2>${edit ? T('Где смотрю') : T('Где смотреть?')}</h2>
      <p class="hint">${edit ? T('Скрой ненужные сайты и добавь свои — сайт или приложение.') : esc(t)}</p>
      <div class="ws-grid">${list.map(s => tile(s, edit)).join('')}
        <button type="button" class="ws-tile ws-add" data-ws="add"><span class="ws-ico">${ICON.plus}</span><b>${T('Добавить')}</b><small>${T('сайт или приложение')}</small></button></div>
      <div class="btn-row ws-foot">${edit ? (W.x ? `<button class="btn" type="button" data-ws="done">${T('Готово')}</button>` : '')
        : `<button class="btn small line" type="button" data-ws="edit">${T('Изменить список')}</button>`}</div>`;
  }
  function addHTML() {
    const d = W.draft || { name: '', tpl: '', ru: LANG !== 'en' };
    return `<div class="grab"></div><h2>${T('Добавить сайт')}</h2>
      <ol class="ws-how">
        <li>${T('Открой сайт или приложение и найди там любое аниме, например')} <b>naruto</b>.</li>
        <li>${T('Скопируй ссылку на страницу с результатами и вставь сюда.')}</li>
      </ol>
      <label class="label" for="wsName">${T('Название')}</label>
      <input class="input" id="wsName" type="text" maxlength="24" placeholder="${T('Например, AnimeVost')}" value="${esc(d.name)}">
      <label class="label" for="wsTpl">${T('Ссылка поиска')}</label>
      <input class="input" id="wsTpl" type="url" inputmode="url" autocapitalize="off" spellcheck="false" placeholder="https://site.com/search?q=naruto" value="${esc(d.tpl)}">
      <p class="hint" id="wsCheck"></p>
      <div class="setting ws-lang"><div class="txt"><span>${T('Искать по названию')}</span></div>
        <div class="seg" role="group"><button type="button" data-ws="ru" data-v="1" aria-pressed="${!!d.ru}">${T('Русскому')}</button><button type="button" data-ws="ru" data-v="0" aria-pressed="${!d.ru}">${T('Английскому')}</button></div></div>
      <div class="btn-row ws-foot"><button class="btn" type="button" data-ws="cancel">${T('Отмена')}</button><button class="btn grad" type="button" data-ws="save">${T('Сохранить')}</button></div>`;
  }
  /* «naruto» в ссылке → {q} */
  function normTpl(raw) {
    let u = String(raw || '').trim();
    if (!u) return '';
    if (!/^[a-z][a-z0-9+.\-]*:/i.test(u)) u = 'https://' + u;
    if (u.includes('{q}')) return u;
    const m = u.match(/naruto/i);
    if (m) return u.slice(0, m.index) + '{q}' + u.slice(m.index + m[0].length);
    return u;
  }
  function checkDraft() {
    const el = $('#wsCheck');
    if (!el) return;
    const tpl = normTpl($('#wsTpl').value);
    if (!tpl) { el.textContent = ''; el.className = 'hint'; return; }
    if (!okUrl(tpl)) { el.textContent = T('Такую ссылку открыть нельзя.'); el.className = 'hint ws-bad'; return; }
    el.className = 'hint ws-ok';
    el.textContent = tpl.includes('{q}') ? T('Отлично — название подставится сюда:') + ' ' + tpl.replace('{q}', '…') : T('Название допишется в конец ссылки.');
  }
  function saveSite() {
    const name = ($('#wsName').value || '').trim();
    const tpl = normTpl($('#wsTpl').value);
    if (!name) { $('#wsName').focus(); toast(T('Впиши название')); return; }
    if (!tpl || !okUrl(tpl)) { $('#wsTpl').focus(); toast(T('Вставь ссылку поиска')); return; }
    const st = cfg();
    const id = 'c' + Date.now().toString(36);
    st.watchSites.push({ id, name, tpl, ru: !!(W.draft && W.draft.ru), c: PALETTE[st.watchSites.length % PALETTE.length] });
    st.watchLast = id;
    save(); buzz(16);
    toast(T('Добавлено:') + ' ' + name);
    W.mode = W.x ? 'pick' : 'edit'; W.draft = null;
    rerender();
    if (ui.tab === 'profile') renderProfile();
  }
  function summary() {
    const list = sites();
    return list.length ? esc(list.slice(0, 3).map(s => s.name).join(', ') + (list.length > 3 ? ' +' + (list.length - 3) : '')) : T('Ничего не выбрано');
  }

  document.addEventListener('click', e => {
    const go = e.target.closest('[data-ws-go]');
    if (go) {
      cfg().watchLast = go.dataset.wsGo;
      save();
      buzz(10);
      // ссылка откроется сама; лист закрываем, чтобы по возвращении было чисто
      setTimeout(() => { if (ui.overlays[ui.overlays.length - 1] === 'sheet') back(); }, 350);
      return;
    }
    const b = e.target.closest('[data-ws]');
    if (!b || !W) return;
    const a = b.dataset.ws, st = cfg();
    if (a === 'edit') { W.mode = 'edit'; rerender(); }
    else if (a === 'done') { W.mode = 'pick'; rerender(); }
    else if (a === 'add') { W.prev = W.mode; W.mode = 'add'; W.draft = { name: '', tpl: '', ru: LANG !== 'en' }; rerender(); setTimeout(() => { const i = $('#wsName'); if (i) i.focus(); }, 80); }
    else if (a === 'cancel') { W.mode = W.prev || 'pick'; W.draft = null; rerender(); }
    else if (a === 'ru') { W.draft = Object.assign(W.draft || {}, { name: $('#wsName').value, tpl: $('#wsTpl').value, ru: b.dataset.v === '1' }); rerender(); checkDraft(); }
    else if (a === 'save') saveSite();
    else if (a === 'toggle') { const id = b.dataset.id; if (st.watchHidden[id]) delete st.watchHidden[id]; else st.watchHidden[id] = 1; save(); buzz(8); rerender(); if (ui.tab === 'profile') renderProfile(); }
    else if (a === 'del') { st.watchSites = st.watchSites.filter(s => s.id !== b.dataset.id); save(); buzz(10); rerender(); if (ui.tab === 'profile') renderProfile(); }
  });
  document.addEventListener('input', e => { if (e.target.id === 'wsTpl') checkDraft(); });

  return { open, manage, btnHTML, targetFrom, summary, urlFor, sites, normTpl, okUrl };
})();
function watchBtnHTML(x, cls) { return Watch.btnHTML(x, cls); }
