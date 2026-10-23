'use strict';
/* Бангуми — «Поделиться».
   Android передаёт сюда ссылку и текст из любого приложения (Crunchyroll, браузер с AnimeOn…).
   Мы вытаскиваем название, номер серии и сезон, находим тайтл в списке или в базе
   и предлагаем отметить серию одним касанием. Удачные совпадения запоминаем. */
const Share = (function () {
  const SITES = [
    [/crunchyroll/i, 'Crunchyroll'], [/animeon/i, 'AnimeOn'], [/anilibria|aniliberty/i, 'AniLibria'],
    [/animego/i, 'AnimeGO'], [/jut\.su/i, 'Jut.su'], [/yummy-?anime/i, 'YummyAnime'], [/animevost/i, 'AnimeVost'],
    [/youtube|youtu\.be/i, 'YouTube'], [/netflix/i, 'Netflix'], [/shikimori/i, 'Shikimori'], [/anilist\.co/i, 'AniList'],
    [/myanimelist/i, 'MyAnimeList'], [/hianime|aniwatch/i, 'HiAnime'], [/kinopoisk/i, 'Кинопоиск'], [/ivi\.ru/i, 'Иви'],
    [/wink\.ru/i, 'Wink'], [/okko/i, 'Okko'], [/rutube/i, 'Rutube'], [/vk\.com|vkvideo/i, 'VK Видео'], [/anixart/i, 'Anixart']
  ];
  const L = 'a-zа-яё';
  const B0 = `(?<![${L}0-9])`, B1 = `(?![${L}])`;
  const SITE_WORDS = new RegExp(`${B0}(?:crunchyroll|animeon(?:\\.club)?|anilibria|aniliberty|animego|jut\\.?su|yummy ?anime|animevost|youtube|netflix|shikimori|anilist|myanimelist|hianime|aniwatch|anixart|кинопоиск|rutube)${B1}`, 'gi');
  const JUNK = new RegExp(`${B0}(?:check(?:\\s+it)?\\s+out|i'?m\\s+watching|i\\s+am\\s+watching|look\\s+at|watch(?:ing)?|streaming|stream|смотрите|посмотрите|посмотри|зацени|заценить|глянь|гляньте|рекомендую|смотреть|смотри|смотрю|онлайн|online|бесплатно|free|в хорошем качестве|full ?hd|hd|1080p?|720p?|subbed|dubbed|sub|dub|english|eng|rus|русская|русский|озвучк[${L}]*|субтитр[${L}]*|аниме|anime|сериал|все серии|series|tv)${B1}`, 'gi');
  const RU_SITES = /AnimeOn|AnimeGO|Jut\.su|YummyAnime|AnimeVost|AniLibria|Anixart|Кинопоиск|Иви|Wink|Okko|Rutube|VK Видео|Shikimori/;
  // Сначала пары «сезон + серия», потом по отдельности
  const PAIRS = [
    new RegExp(`${B0}s(\\d{1,2})\\s*e(\\d{1,4})${B1}`, 'i'),
    new RegExp(`(?:сезон|season)\\s*(\\d{1,2})[^0-9]{0,8}?(?:серия|серию|эпизод|episode|ep\\.?)\\s*[#№:]?\\s*(\\d{1,4})`, 'i'),
    new RegExp(`${B0}(\\d{1,2})\\s*(?:-?(?:й|ый|st|nd|rd|th))?\\s*(?:сезон|season)[^0-9]{0,8}?(\\d{1,4})\\s*(?:-?(?:я|ю))?\\s*(?:серия|серию|эпизод|episode)${B1}`, 'i'),
    new RegExp(`${B0}(\\d{1,2})\\s*(?:-?(?:й|ый|st|nd|rd|th))?\\s*(?:сезон|season)[^0-9]{0,8}?(?:серия|серию|эпизод|episode|ep\\.?)\\s*[#№:]?\\s*(\\d{1,4})`, 'i')
  ];
  const EPS = [
    new RegExp(`${B0}(\\d{1,4})\\s*(?:-?(?:я|ю|й))?\\s*(?:серия|серию|эпизод|episode)${B1}`, 'i'),
    new RegExp(`${B0}(?:episode|ep\\.?|эпизод|серия|серии|серию|e)\\s*[#№:]?\\s*(\\d{1,4})(?![0-9])`, 'i'),
    /\s[-–]\s*(\d{1,4})(?=\s|$|v\d|\[|\()/
  ];
  const SEASONS = [
    new RegExp(`${B0}(\\d{1,2})\\s*(?:-?(?:й|ый|st|nd|rd|th))?\\s*(?:сезон|season)${B1}`, 'i'),
    new RegExp(`(?:сезон|season)\\s*(\\d{1,2})(?![0-9])`, 'i'),
    new RegExp(`${B0}s(\\d{1,2})(?![0-9${L}])`, 'i')
  ];
  const EP_URL = /(?<![a-z])(?:episode|ep|seriya|serija|series|seria|e)[-_/=]?(\d{1,4})(?=\D|$)/i;

  function parse(input) {
    const title = input.title || '', text = input.text || '', url = input.url || '';
    const all = [title, text, url].join(' ');
    const link = url || (all.match(/https?:\/\/\S+/) || [''])[0];
    const siteHit = SITES.find(s => s[0].test(link || all));
    const site = siteHit ? siteHit[1] : '';
    const aniId = +((link.match(/anilist\.co\/anime\/(\d+)/i) || [])[1] || 0) || null;
    const malId = +((link.match(/(?:myanimelist\.net\/anime|shikimori\.\w+\/animes)\/[a-z]*(\d+)/i) || [])[1] || 0) || null;

    let words = (title + ' \n ' + text).replace(/https?:\/\/\S+/g, ' ');
    let ep = null, season = null;
    for (const re of PAIRS) { const m = words.match(re); if (m) { season = +m[1]; ep = +m[2]; words = words.replace(m[0], ' '); break; } }
    if (ep == null) for (const re of EPS) { const m = words.match(re); if (m) { ep = +m[1]; words = words.replace(m[0], ' '); break; } }
    if (season == null) for (const re of SEASONS) { const m = words.match(re); if (m) { season = +m[1]; words = words.replace(m[0], ' '); break; } }
    const path = link.replace(/^https?:\/\/[^/]+/, '');
    if (ep == null && path) { const m = path.match(EP_URL); if (m) ep = +m[1]; }
    if (season == null && path) { const m = path.match(/season[-_]?(\d{1,2})/i); if (m) season = +m[1]; }

    // Название: убираем сайт и мусор, берём самый содержательный кусок
    let t = words.replace(SITE_WORDS, ' ').replace(JUNK, ' ').replace(/[«»"“”„()[\]]/g, ' ').replace(/[!?]+/g, ' ');
    let parts = t.split(/\s[|–—•·:]\s|\s-\s|\n|\|/).map(x => x.replace(/^[\s\-–—:|,.]+|[\s\-–—:|,.]+$/g, '').replace(/\s+/g, ' ')).filter(x => new RegExp(`[${L}]{2,}`, 'i').test(x));
    let name = parts.sort((a, b) => b.replace(/[^a-zа-яё]/gi, '').length - a.replace(/[^a-zа-яё]/gi, '').length)[0] || '';
    name = name.replace(new RegExp(`\\s+(?:on|at|via|now|на|в|здесь)$`, 'i'), '').replace(new RegExp(`^(?:now|сейчас)\\s+`, 'i'), '');
    // Название из адреса (crunchyroll.com/series/…/black-clover) — чистое, без «Check out» и прочего
    let slug = '';
    if (path) {
      const segs = path.split(/[/?#&=]/).map(x => { try { return decodeURIComponent(x); } catch (e) { return x; } })
        .map(x => x.replace(/^\d+[-_]/, '').replace(/[-_]\d{3,}$/, '').replace(EP_URL, ' ').replace(/season[-_]?\d+/i, ' ').replace(/[-_+.]+/g, ' ').replace(/\b(watch|anime|series|episode|ep|seriya|html?|php)\b/gi, ' ').replace(/\s+/g, ' ').trim())
        .filter(x => /[a-zа-яё]{3,}/i.test(x) && !/^[A-Z0-9]{6,}$/.test(x.replace(/\s/g, '')));
      slug = segs.sort((a, b) => b.length - a.length)[0] || '';
    }
    if (slug && name) {
      const st = norm(slug).split(' ').filter(Boolean), nt = new Set(norm(name).split(' '));
      if (st.length && st.every(w => nt.has(w))) {
        const m = name.match(new RegExp(st.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^a-zа-яё0-9]+'), 'i'));
        name = m ? m[0] : slug;
      }
    }
    if (!name) name = slug;
    name = name.trim().slice(0, 80);
    return { name, ep, season, site, link, aniId, malId, slug };
  }
  /* Транслит из адресов русских сайтов обратно в кириллицу: magicheskaya bitva → магическая битва */
  function untranslit(s) {
    const pairs = [['shch', 'щ'], ['sch', 'щ'], ['yo', 'ё'], ['zh', 'ж'], ['kh', 'х'], ['ts', 'ц'], ['ch', 'ч'], ['sh', 'ш'], ['yu', 'ю'], ['ya', 'я'], ['ye', 'е'], ['iy', 'ий'], ['yy', 'ый'],
      ['a', 'а'], ['b', 'б'], ['v', 'в'], ['g', 'г'], ['d', 'д'], ['e', 'е'], ['z', 'з'], ['i', 'и'], ['y', 'ы'], ['j', 'й'], ['k', 'к'], ['l', 'л'], ['m', 'м'], ['n', 'н'], ['o', 'о'],
      ['p', 'п'], ['r', 'р'], ['s', 'с'], ['t', 'т'], ['u', 'у'], ['f', 'ф'], ['h', 'х'], ['c', 'к'], ['w', 'в'], ['x', 'кс'], ['q', 'к']];
    let out = '', low = s.toLowerCase(), k = 0;
    while (k < low.length) {
      const hit = pairs.find(([a]) => low.startsWith(a, k));
      if (hit) { out += hit[1]; k += hit[0].length; } else { out += low[k]; k++; }
    }
    return out.replace(/ы(?=[ауоыэяюёие])/g, 'й');
  }
  const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();
  const tokens = s => norm(s).split(' ').filter(w => w.length > 1 || /\d/.test(w));
  function similarity(a, b) {
    const A = new Set(tokens(a)), B = new Set(tokens(b));
    if (!A.size || !B.size) return 0;
    let hit = 0; A.forEach(w => { if (B.has(w)) hit++; });
    const na = norm(a), nb = norm(b);
    const contains = na && nb && (na.includes(nb) || nb.includes(na)) ? 0.35 : 0;
    return Math.min(1, hit / Math.min(A.size, B.size) * 0.75 + contains);
  }
  function itemNames(it) {
    const t = it.titles || {};
    return [it.customTitle, it.title, t.russian, t.romaji, t.english, t.native].concat(it.synonyms || []).filter(Boolean);
  }
  function scoreItem(it, p) {
    let best = 0;
    itemNames(it).forEach(n => { best = Math.max(best, similarity(p.name, n)); });
    if (p.season && p.season > 1) {
      const all = norm(itemNames(it).join(' '));
      if (new RegExp(`(?<![0-9])(${p.season}|season ${p.season}|${p.season}(st|nd|rd|th) season|${p.season} сезон)(?![0-9])`).test(all)) best += 0.15;
      else best -= 0.1;
    }
    if (activeStatus(it.status)) best += 0.05;
    return best;
  }

  let S = null;
  function remembered(p) {
    const key = norm(p.name);
    const id = key && state.shareMap && state.shareMap[key];
    return id && state.items[id] ? state.items[id] : null;
  }
  function localCandidates(p) {
    const items = Object.values(state.items);
    if (p.aniId) { const it = items.find(i => i.anilistId === p.aniId); if (it) return [{ kind: 'item', it, score: 2 }]; }
    if (p.malId) { const it = items.find(i => i.idMal === p.malId); if (it) return [{ kind: 'item', it, score: 2 }]; }
    const mem = remembered(p);
    const list = items.map(it => ({ kind: 'item', it, score: it === mem ? 1.5 : scoreItem(it, p) })).filter(c => c.score >= 0.45);
    return list.sort((a, b) => b.score - a.score).slice(0, 4);
  }
  async function onlineCandidates(p) {
    let res = [];
    try {
      if (p.aniId) { const d = await gql(Q_BY_IDS, { ids: [p.aniId] }); res = d.Page.media || []; }
      else if (p.malId) { const d = await gql(Q_BY_MAL, { ids: [p.malId] }); res = d.Page.media || []; }
      else if (p.name.length >= 2) {
        const q = p.name, cyr = /[а-яё]/i.test(q);
        const ruQ = cyr ? q : (RU_SITES.test(p.site) ? untranslit(q) : null);
        // Латинское название ищем сразу в двух местах, кириллицу — в Shikimori, а если пусто — в AniList
        const [a, b] = await Promise.all([
          ruQ ? searchRu(ruQ).catch(() => []) : Promise.resolve([]),
          cyr ? Promise.resolve(null) : gql(Q_SEARCH, { q }).then(d => d.Page.media || [])
        ]);
        res = a.slice();
        const seen = new Set(res.map(m => m.id));
        (b || []).forEach(m => { if (!seen.has(m.id)) { seen.add(m.id); res.push(m); } });
        if (!res.length && cyr) { const d = await gql(Q_SEARCH, { q }); res = d.Page.media || []; }
        // Ничего не нашлось — пробуем короче: без лишних слов в начале или в конце, потом название из адреса
        if (!res.length) {
          const w = q.split(/\s+/), tries = [];
          for (let k = 1; k <= Math.min(3, w.length - 1); k++) tries.push(w.slice(k).join(' '));
          for (let k = 1; k <= Math.min(2, w.length - 1); k++) tries.push(w.slice(0, w.length - k).join(' '));
          if (p.slug && norm(p.slug) !== norm(q)) tries.push(p.slug);
          for (const t of tries) {
            if (t.replace(/[^a-zа-яё]/gi, '').length < 3) continue;
            try {
              res = /[а-яё]/i.test(t) ? await searchRu(t) : ((await gql(Q_SEARCH, { q: t })).Page.media || []);
            } catch (e) { res = []; }
            if (res.length) { S && (S.p.name = t); break; }
          }
        }
      }
    } catch (e) { return null; }
    rememberMedia(res);
    enrichRu(res).then(ok => { if (ok && S) renderSheet(); });
    const map = byAni();
    return res.filter(m => !map[m.id]).map(m => {
      const ru = ruN(m.idMal), alt = RU_SITES.test(p.site) && !/[а-яё]/i.test(p.name) ? untranslit(p.name) : '';
      let sc = Math.max(similarity(p.name, mediaTitle(m)), similarity(p.name, m.title.romaji), similarity(p.name, m.title.english || ''), ru ? similarity(p.name, ru) : 0, alt && ru ? similarity(alt, ru) : 0);
      if (p.season > 1 && new RegExp(`(?<![0-9])${p.season}(?![0-9])|season ${p.season}`, 'i').test([m.title.romaji, m.title.english, ru].join(' '))) sc += 0.3;
      if (m.status === 'RELEASING') sc += 0.05;
      return { kind: 'media', m, score: sc };
    }).sort((a, b) => b.score - a.score).filter((c, k) => k < 2 || c.score >= 0.25).slice(0, 6);
  }

  async function open(input, opts) {
    opts = opts || {};
    const p = parse(input || {});
    S = { p, raw: input || {}, local: localCandidates(p), online: null, loading: true, sel: 0, manual: !!opts.manual };
    openSheet('<div id="shareBody" class="share-sheet"></div>');
    const sh = document.querySelector('#sheetWrap .sheet'); if (sh) sh.classList.add('share-wrap');
    renderSheet();
    if (opts.manual && !p.name) { setTimeout(() => { const i = document.getElementById('shUrl'); if (i) i.focus(); }, 350); }
    await search();
  }
  let token = 0;
  async function search() {
    if (!S) return;
    const my = ++token;
    S.loading = true; renderSheet();
    const strongLocal = S.local[0] && S.local[0].score >= 0.9;
    const online = strongLocal ? [] : await onlineCandidates(S.p);
    if (my !== token || !S) return;
    S.online = online; S.loading = false;
    if (!S.local.length && online && online.length) S.sel = 0;
    renderSheet();
  }
  function cands() { return S ? S.local.concat(S.online || []) : []; }
  function target(c) {
    if (!c) return null;
    if (c.kind === 'item') return S.p.ep || (c.it.progress || 0) + 1;
    return S.p.ep || 0;
  }

  function rowHTML(c, i) {
    const on = i === S.sel;
    if (c.kind === 'item') {
      const it = c.it, col = it.color || hueColor(title(it));
      return `<button type="button" class="sh-row${on ? ' on' : ''}" data-shsel="${i}" style="--c:${esc(col)}" aria-pressed="${on}">
        ${thumbHTML(it.cover, title(it), col, null)}
        <span class="info"><span class="t">${esc(title(it))}</span><span class="s"><span class="sh-in">В списке</span>${esc(ST[it.status].label)} · EP ${it.progress}/${it.total || '?'}</span></span>
        <span class="sh-radio" aria-hidden="true"></span></button>`;
    }
    const m = c.m, t = mediaTitle(m), col = (m.coverImage && m.coverImage.color) || hueColor(t);
    const sub = [FORMAT[m.format] || '', m.episodes ? m.episodes + ' эп.' : '', m.seasonYear || ''].filter(Boolean).join(' · ');
    return `<button type="button" class="sh-row${on ? ' on' : ''}" data-shsel="${i}" style="--c:${esc(col)}" aria-pressed="${on}">
      ${thumbHTML(mediaCover(m), t, col, null)}
      <span class="info"><span class="t">${esc(t)}</span><span class="s">${esc(sub || 'Из базы')}</span></span>
      <span class="sh-radio" aria-hidden="true"></span></button>`;
  }
  function renderSheet() {
    const el = document.getElementById('shareBody');
    if (!el || !S) return;
    const p = S.p, list = cands(), c = list[S.sel];
    const ep = target(c);
    let action = '', note = '';
    if (c && c.kind === 'item') {
      const it = c.it;
      if (ep <= (it.progress || 0)) { action = `${ICON.check}Уже отмечено до EP ${it.progress}`; note = `EP ${ep} уже засчитана. Если серия другая, поправь номер выше.`; }
      else action = `${ICON.play}Отметить EP ${ep}`;
      if (it.total && ep > it.total) note = `В этом тайтле ${it.total} серий. Возможно, это другой сезон — выбери ниже или поправь номер.`;
    } else if (c) action = ep ? `${ICON.plus}В «Смотрю» и отметить EP ${ep}` : `${ICON.plus}Добавить в «Смотрю»`;
    const linkShort = p.link ? p.link.replace(/^https?:\/\/(www\.)?/, '').slice(0, 46) + (p.link.length > 56 ? '…' : '') : '';
    el.innerHTML = `<div class="grab"></div>
      <div class="sh-head"><span class="sh-badge" aria-hidden="true">${ICON.ext}</span>
        <div class="txt"><h2>${S.manual ? 'Ссылка на серию' : 'Поделились с Бангуми'}</h2>
        <small>${p.site ? `<b>${esc(p.site)}</b>` : ''}${p.site && linkShort ? ' · ' : ''}${esc(linkShort || (S.manual ? 'Вставь ссылку или название с номером серии' : 'Без ссылки'))}</small></div></div>
      ${S.manual ? `<label class="label" for="shUrl">Ссылка или текст</label><input class="input" id="shUrl" type="text" inputmode="url" placeholder="https://… или «Магическая битва 5 серия»" value="${esc(S.raw.text || S.raw.url || '')}">` : ''}
      <div class="sh-fields">
        <label class="sh-name"><span class="label">Название</span><input class="input" id="shName" type="text" value="${esc(p.name)}" placeholder="Название тайтла"></label>
        <label class="sh-ep"><span class="label">Серия</span><span class="stepper"><button type="button" data-shep="-1" aria-label="Меньше">−</button><input id="shEp" type="number" inputmode="numeric" min="1" value="${ep || ''}" placeholder="—" aria-label="Номер серии"><button type="button" data-shep="1" aria-label="Больше">+</button></span></label>
      </div>
      ${p.season ? `<p class="hint">Нашёл в тексте: сезон ${p.season}. Учитываю при подборе.</p>` : ''}
      <div class="sh-list">
        <div class="label">${list.length ? 'Это он?' : ''}</div>
        ${list.map(rowHTML).join('')}
        ${S.loading ? '<div class="loading"><span class="spinner"></span>Ищу в базе…</div>' : ''}
        ${!S.loading && !list.length ? `<div class="empty soft"><p>${S.online === null ? 'Нет связи с базой. Проверь интернет или поправь название.' : 'Не нашёл такой тайтл. Поправь название — например, по-английски или ромадзи.'}</p></div>` : ''}
      </div>
      ${note ? `<p class="hint sh-note">${esc(note)}</p>` : ''}
      <div class="sh-actions">
        <button class="btn grad block" type="button" data-shgo="1" ${!c || (c.kind === 'item' && ep <= (c.it.progress || 0)) ? 'disabled' : ''}>${action || 'Выбери тайтл'}</button>
        ${c ? `<button class="btn line block" type="button" data-shopen="1">${ICON.info}Открыть страницу</button>` : ''}
      </div>`;
  }

  function apply() {
    const c = cands()[S.sel];
    if (!c) return;
    const p = S.p, ep = target(c);
    let it;
    if (c.kind === 'item') it = c.it;
    else { it = addToList(c.m, 'watching'); ui.heroIds = null; }
    const before = it.progress || 0;
    if (ep > before) setProgress(it, ep, { max: 3, log: c.kind === 'item' || ep === 1 ? undefined : false });
    if (it.status !== 'watching' && it.status !== 'completed') it.status = 'watching';
    it.updatedAt = Date.now();
    const key = norm(p.name);
    if (key) { state.shareMap = state.shareMap || {}; state.shareMap[key] = it.id; }
    save();
    buzz([14, 30, 14]);
    const btn = document.querySelector('[data-shgo]');
    if (btn && window.sparkle) sparkle(btn, 14);
    S = null;
    setTimeout(() => {
      back();
      refreshAfterChange();
      if (!ep) toast(`«${title(it)}» — в «Смотрю»`, { action: 'Открыть', fn: () => openDetail({ itemId: it.id }, null) });
      else if (!maybeComplete(it)) toast(`EP ${ep} — ${title(it)}`, { action: 'Отменить', fn: () => { setProgress(it, before); save(); refreshAfterChange(); } });
    }, 220);
  }

  let nameT = null, urlT = null;
  document.addEventListener('click', e => {
    if (!S) return;
    const sel = e.target.closest('[data-shsel]');
    if (sel) { S.sel = +sel.dataset.shsel; buzz(6); renderSheet(); return; }
    const st = e.target.closest('[data-shep]');
    if (st) { const cur = target(cands()[S.sel]) || 0; S.p.ep = Math.max(1, cur + +st.dataset.shep); buzz(6); renderSheet(); return; }
    if (e.target.closest('[data-shgo]')) { apply(); return; }
    if (e.target.closest('[data-shopen]')) {
      const c = cands()[S.sel]; if (!c) return;
      const ref = c.kind === 'item' ? { itemId: c.it.id } : { aniId: c.m.id };
      S = null; back(); setTimeout(() => openDetail(ref, null), 260);
    }
  });
  document.addEventListener('input', e => {
    if (!S) return;
    if (e.target.id === 'shName') {
      S.p.name = e.target.value;
      clearTimeout(nameT);
      nameT = setTimeout(() => { if (!S) return; S.local = localCandidates(S.p); S.sel = 0; search(); }, 450);
    } else if (e.target.id === 'shEp') {
      const v = parseInt(e.target.value, 10);
      S.p.ep = v > 0 ? v : null;
    } else if (e.target.id === 'shUrl') {
      clearTimeout(urlT);
      const val = e.target.value;
      urlT = setTimeout(() => {
        if (!S) return;
        const isUrl = /^https?:\/\//i.test(val.trim());
        S.raw = isUrl ? { url: val.trim() } : { text: val };
        S.p = parse(S.raw);
        S.local = localCandidates(S.p); S.sel = 0;
        search();
        setTimeout(() => { const i = document.getElementById('shUrl'); if (i && document.activeElement !== i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 0);
      }, 500);
    }
  });
  document.addEventListener('change', e => { if (S && e.target.id === 'shEp') renderSheet(); });

  /* Запуск из меню «Поделиться» Android */
  function fromLaunch(search) {
    const q = new URLSearchParams(search != null ? search : location.search);
    if (!q.has('share_url') && !q.has('share_text') && !q.has('share_title')) return false;
    const input = { title: q.get('share_title') || '', text: q.get('share_text') || '', url: q.get('share_url') || '' };
    setTimeout(() => open(input), 350);
    return true;
  }
  return { open, parse, untranslit, fromLaunch, isOpen: () => !!S, close: () => { S = null; } };
})();
