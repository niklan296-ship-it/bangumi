'use strict';
/* Импорт списка из AniList, Shikimori или файла экспорта MyAnimeList (Shikimori отдаёт тот же формат).
   Сначала показываем, что изменится, и только потом добавляем. Свой прогресс не теряется:
   если тайтл уже есть, берём больший прогресс. */

const Import = (() => {
  const S = { src: 'anilist', nick: '', loading: false, error: '', res: null, token: 0, done: false };
  const AL_ST = { CURRENT: 'watching', REPEATING: 'watching', PLANNING: 'planned', COMPLETED: 'completed', DROPPED: 'dropped', PAUSED: 'paused' };
  const SH_ST = { watching: 'watching', rewatching: 'watching', planned: 'planned', completed: 'completed', on_hold: 'paused', dropped: 'dropped' };
  const MAL_ST = { 'watching': 'watching', 'completed': 'completed', 'on-hold': 'paused', 'on hold': 'paused', 'dropped': 'dropped', 'plan to watch': 'planned',
    '1': 'watching', '2': 'completed', '3': 'paused', '4': 'dropped', '6': 'planned' };
  const Q_AL_LIST = `query($u:String){MediaListCollection(userName:$u,type:ANIME){lists{entries{status progress score(format:POINT_10) media{${MEDIA_FIELDS}}}}}}`;
  const SRC = { anilist: 'AniList', shikimori: 'Shikimori', file: L('Файл', 'File') };

  function open() {
    Object.assign(S, { loading: false, error: '', res: null, done: false });
    openSheet(`<div class="grab"></div><h2>${T('Импорт списка')}</h2>
      <p class="hint">${T('Перенеси список из другого сервиса. Тайтлы, которые уже есть, не потеряются: прогресс возьмётся больший.')}</p>
      <div class="seg imp-seg" role="group" id="impSeg"></div>
      <div id="impForm"></div>
      <div id="impBody" aria-live="polite"></div>
      <input type="file" id="impFile" accept=".xml,.gz,text/xml,application/xml,application/gzip" hidden>`);
    render();
  }

  function render() {
    const seg = $('#impSeg');
    if (!seg) return;
    seg.innerHTML = Object.entries(SRC).map(([k, v]) => `<button type="button" data-imp="src" data-v="${k}" aria-pressed="${S.src === k}">${v}</button>`).join('');
    const f = $('#impForm');
    if (S.src === 'file') {
      f.innerHTML = `<p class="hint imp-how">${T('MyAnimeList: myanimelist.net/panel.php?go=export → Export My Anime List.')}<br>${T('Shikimori: в настройках профиля — «Экспорт списка», формат XML. Или просто введи никнейм во вкладке Shikimori.')}</p>
        <button type="button" class="btn block" data-imp="pick" ${S.loading ? 'disabled' : ''}>${ICON.plus}${T('Выбрать файл .xml или .xml.gz')}</button>`;
    } else {
      const ph = S.src === 'anilist' ? T('Имя на AniList') : T('Никнейм на Shikimori');
      const cur = $('#impNick') ? $('#impNick').value : S.nick;
      f.innerHTML = `<label class="label" for="impNick">${ph}</label>
        <div class="imp-row"><input class="input" id="impNick" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${ph}" value="${esc(cur)}">
        <button type="button" class="btn grad" data-imp="go" ${S.loading ? 'disabled' : ''}>${T('Найти')}</button></div>
        <p class="hint">${T('Список должен быть открыт для всех.')}</p>`;
    }
    renderBody();
  }

  function counts(res) {
    const map = byAni();
    let fresh = 0, upd = 0, same = 0;
    res.rows.forEach(r => {
      const ex = map[r.m.id];
      if (!ex) fresh++;
      else if (r.progress > (ex.progress || 0) || (!ex.score && r.score)) upd++;
      else same++;
    });
    return { fresh, upd, same };
  }

  function renderBody() {
    const b = $('#impBody');
    if (!b) return;
    if (S.loading) { b.innerHTML = `<div class="loading"><span class="spinner"></span>${esc(S.loading === true ? T('Загружаю список…') : S.loading)}</div>`; return; }
    if (S.error) { b.innerHTML = `<p class="hint imp-err">${esc(S.error)}</p>`; return; }
    if (!S.res) { b.innerHTML = ''; return; }
    if (S.done) { b.innerHTML = `<div class="imp-done rise"><span class="imp-ok">${ICON.check}</span><b>${T('Готово!')}</b><p>${esc(S.done)}</p></div>`; return; }
    const c = counts(S.res);
    const by = {};
    S.res.rows.forEach(r => { by[r.status] = (by[r.status] || 0) + 1; });
    b.innerHTML = `<div class="imp-sum rise">
      <div class="imp-big"><b>${S.res.rows.length}</b><span>${pl(S.res.rows.length, T('тайтл'), T('тайтла'), T('тайтлов'))} ${S.res.who ? T('у') + ' ' + esc(S.res.who) : T('в файле')}</span></div>
      <div class="imp-st">${STATUSES.filter(s => by[s.id]).map(s => `<span style="--st:var(--st-${s.id})"><i></i>${esc(s.label)} ${by[s.id]}</span>`).join('')}</div>
      <dl class="kv"><dt>${T('Новых')}</dt><dd>${c.fresh}</dd><dt>${T('Обновится')}</dt><dd>${c.upd}</dd><dt>${T('Уже есть')}</dt><dd>${c.same}</dd>
      ${S.res.missing ? `<dt>${T('Нет в базе AniList')}</dt><dd>${S.res.missing}</dd>` : ''}</dl>
      <button type="button" class="btn grad block" data-imp="apply" ${c.fresh + c.upd ? '' : 'disabled'}>${ICON.plus}${c.fresh + c.upd ? T('Добавить в мой список') : T('Нечего добавлять')}</button></div>`;
  }

  /* ---------- Источники ---------- */
  async function fromAniList(nick) {
    const d = await gql(Q_AL_LIST, { u: nick });
    const rows = [];
    ((d.MediaListCollection && d.MediaListCollection.lists) || []).forEach(l => (l.entries || []).forEach(e => {
      if (e.media && AL_ST[e.status]) rows.push({ m: e.media, status: AL_ST[e.status], progress: e.progress || 0, score: Math.round(e.score || 0) || null });
    }));
    const seen = new Set();
    return { rows: rows.filter(r => !seen.has(r.m.id) && seen.add(r.m.id)), missing: 0, who: nick };
  }

  async function shikiQ(query) {
    let lastErr = null;
    for (const host of SHIKI) {
      try {
        const r = await fetch(host + '/api/graphql', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ query }) });
        const j = await r.json().catch(() => null);
        if (j && j.data) return j.data;
        lastErr = new Error((j && j.errors && j.errors[0] && j.errors[0].message) || 'HTTP ' + r.status);
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new TypeError('network');
  }
  async function fromShikimori(nick, my) {
    const u = await shikiQ(`{ users(search: ${JSON.stringify(nick)}, limit: 10) { id nickname } }`);
    const list = (u && u.users) || [];
    const user = list.find(x => String(x.nickname).toLowerCase() === nick.toLowerCase()) || list[0];
    if (!user) { const e = new Error('nouser'); e.nouser = true; throw e; }
    const ents = [];
    for (let page = 1; page <= 60; page++) {
      if (my !== S.token) return null;
      S.loading = T('Загружаю список…') + ' ' + ents.length; renderBody();
      const d = await shikiQ(`{ userRates(userId: ${JSON.stringify(String(user.id))}, targetType: Anime, limit: 50, page: ${page}) { status score episodes anime { malId russian } } }`);
      const rates = (d && d.userRates) || [];
      rates.forEach(r => { if (r.anime && r.anime.malId && SH_ST[r.status]) ents.push({ malId: +r.anime.malId, status: SH_ST[r.status], progress: r.episodes || 0, score: r.score || null, ru: r.anime.russian }); });
      if (rates.length < 50) break;
    }
    const res = await resolveMal(ents, my);
    if (res) res.who = user.nickname;
    return res;
  }

  async function readFileText(file) {
    const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
    if (head[0] === 0x1f && head[1] === 0x8b) {
      if (typeof DecompressionStream === 'undefined') throw new Error('gzip');
      return await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).text();
    }
    return await file.text();
  }
  async function fromFile(file, my) {
    const text = await readFileText(file);
    const xml = new DOMParser().parseFromString(text, 'text/xml');
    const get = (el, tag) => { const x = el.getElementsByTagName(tag)[0]; return x ? x.textContent.trim() : ''; };
    const ents = [];
    Array.from(xml.getElementsByTagName('anime')).forEach(a => {
      const malId = +get(a, 'series_animedb_id');
      const st = MAL_ST[get(a, 'my_status').toLowerCase()];
      if (malId && st) ents.push({ malId, status: st, progress: +get(a, 'my_watched_episodes') || 0, score: +get(a, 'my_score') || null });
    });
    if (!ents.length) { const e = new Error('empty'); e.badfile = true; throw e; }
    return resolveMal(ents, my);
  }

  /* Номера MyAnimeList → тайтлы AniList */
  async function resolveMal(ents, my) {
    const byMal = {};
    const ids = [...new Set(ents.map(e => e.malId))];
    for (let i = 0; i < ids.length; i += 50) {
      if (my !== S.token) return null;
      S.loading = T('Сверяю с базой…') + ' ' + Math.min(ids.length, i + 50) + '/' + ids.length; renderBody();
      const d = await gql(Q_BY_MAL, { ids: ids.slice(i, i + 50) });
      (d.Page.media || []).forEach(m => { if (m.idMal) byMal[m.idMal] = m; });
    }
    const rows = [], seen = new Set();
    let missing = 0;
    ents.forEach(e => {
      const m = byMal[e.malId];
      if (!m) { missing++; return; }
      if (seen.has(m.id)) return;
      seen.add(m.id);
      if (e.ru && !(state.ru[m.idMal] && state.ru[m.idMal].n)) state.ru[m.idMal] = Object.assign({}, state.ru[m.idMal], { n: e.ru });
      rows.push({ m, status: e.status, progress: e.progress, score: e.score });
    });
    return { rows, missing };
  }

  /* ---------- Действия ---------- */
  async function run(fn) {
    const my = ++S.token;
    Object.assign(S, { loading: true, error: '', res: null, done: false });
    render();
    try {
      const res = await fn(my);
      if (my !== S.token || !res) return;
      S.res = res;
      if (!res.rows.length) S.error = T('Список пустой — нечего переносить.');
    } catch (e) {
      if (my !== S.token) return;
      S.error = e.nouser ? T('Не нашёл такого пользователя на Shikimori.')
        : e.badfile ? T('В файле нет аниме. Нужен файл экспорта MyAnimeList или Shikimori (.xml).')
        : e.message === 'gzip' ? T('Не получилось распаковать .gz — распакуй файл и выбери .xml.')
        : e instanceof TypeError ? T('Нет связи. Проверь интернет и попробуй ещё раз.')
        : S.src === 'anilist' ? T('Не нашёл такого пользователя на AniList или его список скрыт.')
        : T('Не получилось загрузить список. Проверь имя и что список открыт.');
    }
    S.loading = false;
    render();
  }

  function apply() {
    if (!S.res) return;
    const map = byAni();
    let added = 0, updated = 0;
    const medias = [];
    S.res.rows.forEach(r => {
      const ex = map[r.m.id];
      medias.push(r.m);
      if (!ex) {
        const it = itemFromMedia(r.m, r.status);
        state.items[it.id] = it;
        const p = r.status === 'completed' && r.m.episodes ? Math.max(r.progress, r.m.episodes) : r.progress;
        if (p) setProgress(it, p, { log: false });
        it.status = r.status;
        if (r.score) it.score = r.score;
        added++;
      } else {
        let ch = false;
        if (r.progress > (ex.progress || 0)) { setProgress(ex, r.progress, { log: false }); ex.status = r.status; ch = true; }
        if (!ex.score && r.score) { ex.score = r.score; ch = true; }
        if (ch) { ex.updatedAt = Date.now(); updated++; }
      }
    });
    rememberMedia(medias);
    ui.heroIds = null;
    save(); flush();
    S.done = T('Добавлено:') + ' ' + added + (updated ? ' · ' + T('обновлено:') + ' ' + updated : '');
    renderBody();
    celebrate();
    refreshAfterChange();
    loadWeek(ui.weekOffset, true);
    enrichRu(medias).then(() => renderCurrent());
    loadSequels(true);
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-imp]');
    if (!b) return;
    const a = b.dataset.imp;
    if (a === 'src') { const v = b.dataset.v; if (v !== S.src) { S.nick = ($('#impNick') && $('#impNick').value) || S.nick; S.src = v; S.token++; Object.assign(S, { loading: false, error: '', res: null, done: false }); buzz(8); render(); } }
    else if (a === 'go') {
      const nick = ($('#impNick').value || '').trim().replace(/^@/, '').replace(/^https?:\/\/[^/]+\/(?:user\/)?/i, '').replace(/\/.*$/, '');
      if (!nick) { $('#impNick').focus(); return; }
      S.nick = nick;
      buzz(10);
      run(my => S.src === 'anilist' ? fromAniList(nick) : fromShikimori(nick, my));
    }
    else if (a === 'pick') $('#impFile').click();
    else if (a === 'apply') { buzz(16); apply(); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'impNick') { e.preventDefault(); const g = document.querySelector('[data-imp="go"]'); if (g) g.click(); } });
  document.addEventListener('change', e => {
    if (e.target.id !== 'impFile' || !e.target.files || !e.target.files[0]) return;
    const f = e.target.files[0];
    e.target.value = '';
    run(my => fromFile(f, my));
  });

  return { open, _state: S };
})();
