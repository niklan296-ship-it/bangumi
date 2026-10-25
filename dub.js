'use strict';
/* Озвучка и официальные площадки тайтла.
   AniList: ссылки на стриминги (Crunchyroll, Netflix, Hulu…), английские голоса персонажей, лицензиары.
   Shikimori: команды русской озвучки (fandubbers) и субтитров, ссылки на Кинопоиск, Okko, Wink, Иви… */

const Dub = (() => {
  const enc = encodeURIComponent;
  const cache = {};   // malId → { dub: [], sub: [], links: [{ kind, url }], ok }
  const pending = {};
  // Кто выпускает английский дубляж / лицензирует в США
  const EN_LIC = /crunchyroll|funimation|aniplex of america|sentai|viz media|netflix|hidive|discotek|nis america|bandai entertainment|4kids|bang zoom|adv films|section23|ponycan usa|right stuf|nozomi|eleven arts|gkids|toei animation inc|manga entertainment|madman|muse communication|medialink|ani-one|tms entertainment usa/i;
  const KIND = {
    kinopoisk_hd: [L('Кинопоиск', 'Kinopoisk'), '#FF6600', 'RU'], kinopoisk: [L('Кинопоиск', 'Kinopoisk'), '#FF6600', 'RU'], ivi: [L('Иви', 'Ivi'), '#EA003D', 'RU'], okko: ['Okko', '#5B37E3', 'RU'],
    wink: ['Wink', '#FF5C00', 'RU'], kion: ['KION', '#DE1A1A', 'RU'], start: ['START', '#FFB800', 'RU'], amediateka: [L('Амедиатека', 'Amediateka'), '#1E1E1E', 'RU'], premier: ['PREMIER', '#1D1D1F', 'RU'],
    crunchyroll: ['Crunchyroll', '#F47521', ''], netflix: ['Netflix', '#E50914', ''], hulu: ['Hulu', '#1CE783', ''], amazon: ['Prime Video', '#1A98FF', ''],
    hidive: ['HIDIVE', '#00AEEF', ''], youtube: ['YouTube', '#FF0033', ''], disney_plus: ['Disney+', '#113CCF', '']
  };
  const LANG_SHORT = { English: 'EN', Russian: 'RU', Japanese: 'JP', Spanish: 'ES', Portuguese: 'PT', French: 'FR', German: 'DE', Italian: 'IT', Korean: 'KO', Chinese: 'ZH', Arabic: 'AR', Indonesian: 'ID', Thai: 'TH' };

  async function shikiRaw(query) {
    for (const host of SHIKI) {
      try {
        const r = await fetch(host + '/api/graphql', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ query }) });
        const j = await r.json().catch(() => null);
        if (j && j.data && j.data.animes) return j.data.animes;
        if (j && j.errors) throw new Error('schema');
      } catch (e) { if (e.message === 'schema') throw e; }
    }
    throw new Error('net');
  }
  async function shikiRest(path) {
    for (const host of SHIKI) {
      try { const r = await fetch(host + path, { headers: { Accept: 'application/json' } }); if (r.ok) return await r.json(); } catch (e) { /* следующий адрес */ }
    }
    return null;
  }
  function loadRu(mal) {
    if (!mal || cache[mal]) return Promise.resolve(cache[mal] || null);
    if (pending[mal]) return pending[mal];
    pending[mal] = (async () => {
      let a = null;
      try { a = (await shikiRaw(`{animes(ids:"${mal}",limit:1){malId fandubbers fansubbers externalLinks{kind url}}}`))[0]; }
      catch (e) {
        try { a = (await shikiRaw(`{animes(ids:"${mal}",limit:1){malId fandubbers fansubbers}}`))[0]; }
        catch (e2) { const r = await shikiRest('/api/animes/' + mal); if (r) a = { fandubbers: r.fandubbers, fansubbers: r.fansubbers }; }
        if (a && !a.externalLinks) { const ex = await shikiRest('/api/animes/' + mal + '/external_links'); if (Array.isArray(ex)) a.externalLinks = ex.map(x => ({ kind: x.kind, url: x.url })); }
      }
      cache[mal] = a ? { dub: (a.fandubbers || []).filter(Boolean), sub: (a.fansubbers || []).filter(Boolean), links: (a.externalLinks || []).filter(x => x && x.url), ok: true }
        : { dub: [], sub: [], links: [], ok: false };
      delete pending[mal];
      return cache[mal];
    })();
    return pending[mal];
  }

  const mediaOf = x => x ? (x.externalLinks || x.chars ? x : ui.media[x.anilistId || (x.titles ? 0 : x.id)] || null) : null;
  /* Все известные стриминги тайтла: [{ site, url, lang, color }] */
  function streams(x) {
    const out = [], seen = new Set();
    const m = mediaOf(x);
    ((m && m.externalLinks) || []).forEach(l => {
      if (l.type !== 'STREAMING' || l.isDisabled || !l.url) return;
      const k = (l.site + '|' + (l.language || '')).toLowerCase();
      if (seen.has(k)) return; seen.add(k);
      out.push({ site: l.site, url: l.url, lang: LANG_SHORT[l.language] || (l.language ? l.language.slice(0, 2).toUpperCase() : ''), color: l.color || '#888', note: l.notes || '' });
    });
    const mal = (x && x.idMal) || (m && m.idMal);
    const ru = mal && cache[mal];
    ((ru && ru.links) || []).forEach(l => {
      const k = KIND[l.kind];
      if (!k) return;
      const key = (k[0] + '|' + k[2]).toLowerCase();
      if (seen.has(key) || out.some(o => o.site.toLowerCase() === k[0].toLowerCase())) return;
      seen.add(key);
      out.push({ site: k[0], url: l.url, lang: k[2], color: k[1] });
    });
    return out;
  }

  function enInfo(m) {
    if (!m || !m.chars) return null;
    const voices = [];
    (m.chars.edges || []).forEach(e => {
      const va = (e.voiceActors || [])[0];
      if (va && va.name && va.name.full) voices.push({ va: va.name.full, ch: e.node && e.node.name && e.node.name.full });
    });
    const lic = [...new Set(((m.allStudios && m.allStudios.edges) || []).filter(e => e.node && !e.node.isAnimationStudio && EN_LIC.test(e.node.name)).map(e => e.node.name))];
    return { has: voices.length > 0, voices: voices.slice(0, 4), lic };
  }

  const chip = (label, url, color, small) => `<a class="dub-chip" href="${esc(url)}" target="_blank" rel="noopener" style="--c:${esc(color || '#888')}"><span class="ws-dot"></span>${esc(label)}${small ? `<small>${esc(small)}</small>` : ''}</a>`;

  function blockHTML(v) {
    if (!v || (!v.aniId && !v.idMal)) return '';
    const m = v.m;
    const loadedAni = m && (m.chars || m.externalLinks);
    const ru = v.idMal ? cache[v.idMal] : null;
    const en = enInfo(m);
    const st = streams(v.it || m || {});
    const enStreams = st.filter(s => s.lang !== 'RU');
    const ruStreams = st.filter(s => s.lang === 'RU');
    const ruTitle = ruN(v.idMal) || (v.it && v.it.titles && v.it.titles.russian) || v.t;
    const spin = '<span class="spinner sm"></span>';

    const enTxt = !loadedAni ? spin
      : en && en.has ? `<b class="dub-yes">${T('Есть')}</b>`
      : `<b class="dub-no">${T('Не найдена')}</b>`;
    const enMeta = en && en.has ? [
      en.lic.length ? `<div class="dub-meta"><span>${T('Студия / лицензия')}</span>${esc(en.lic.join(', '))}</div>` : '',
      en.voices.length ? `<div class="dub-meta"><span>${T('Голоса')}</span>${en.voices.map(x => esc(x.va) + (x.ch ? ` <i>(${esc(x.ch)})</i>` : '')).join(', ')}</div>` : ''
    ].join('') : loadedAni ? `<div class="dub-meta">${T('На AniList нет английских голосов — скорее всего, только субтитры.')}</div>` : '';

    const ruTxt = !v.idMal ? `<b class="dub-no">—</b>` : !ru ? spin
      : ru.dub.length ? `<b class="dub-yes">${ru.dub.length} ${pl(ru.dub.length, T('команда'), T('команды'), T('команд'))}</b>`
      : ru.ok ? `<b class="dub-no">${T('Не найдена')}</b>` : `<b class="dub-no">${T('Нет данных')}</b>`;
    const ruDub = ru && ru.dub.length ? `<div class="dub-chips">${ru.dub.slice(0, 12).map(d => chip(d, 'https://www.google.com/search?q=' + enc(ruTitle + ' озвучка ' + d), '#FF7A45')).join('')}</div>` : '';
    const ruSub = ru && ru.sub.length ? `<div class="dub-meta"><span>${T('Субтитры')}</span>${esc(ru.sub.slice(0, 6).join(', '))}</div>` : '';

    return `<section class="section dub"><div class="section-head"><h2>${T('Озвучка и где смотреть')}</h2></div>
      <div class="dub-card">
        <div class="dub-row"><span class="dub-lang en">EN</span><div class="dub-body"><div class="dub-h"><span>${T('Английская озвучка')}</span>${enTxt}</div>${enMeta}
          ${enStreams.length ? `<div class="dub-chips">${enStreams.map(s => chip(s.site, s.url, s.color, /dub/i.test(s.note) ? 'DUB' : s.lang)).join('')}</div>` : ''}</div></div>
        <div class="dub-row"><span class="dub-lang ru">RU</span><div class="dub-body"><div class="dub-h"><span>${T('Русская озвучка')}</span>${ruTxt}</div>
          ${ruDub}${ruSub}
          ${ruStreams.length ? `<div class="dub-meta"><span>${T('Официально')}</span></div><div class="dub-chips">${ruStreams.map(s => chip(s.site, s.url, s.color)).join('')}</div>` : ''}</div></div>
        <p class="hint dub-note">${T('Каталоги зависят от страны. Нажми на команду озвучки — найду, где её смотреть. Данные: AniList и Shikimori.')}</p>
      </div></section>`;
  }

  return { loadRu, streams, blockHTML, enInfo, _cache: cache };
})();
