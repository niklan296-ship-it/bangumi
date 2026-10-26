'use strict';
/* «Порядок просмотра»: вся франшиза по порядку — сезоны, фильмы и OVA, которые идут в основной линии,
   отдельно — ответвления и спешлы. Открытый тайтл подсвечен, видно, что уже просмотрено. */

const Franchise = (() => {
  const Q_FR = `query($ids:[Int]){Page(perPage:50){media(id_in:$ids){id idMal type format status episodes duration seasonYear season
    startDate{year month day} title{romaji english native} synonyms coverImage{large color} averageScore popularity
    relations{edges{relationType node{id type format}}}}}}`;
  const FOLLOW = { PREQUEL: 1, SEQUEL: 1, PARENT: 1, SIDE_STORY: 1, SPIN_OFF: 1, SUMMARY: 1, ALTERNATIVE: 1, COMPILATION: 1, CONTAINS: 1 };
  // пересказы, альтернативные версии и сборники — только в «Всё подряд», дальше от них не идём
  const EXTRA = { SUMMARY: 1, ALTERNATIVE: 1, COMPILATION: 1, CONTAINS: 1 };
  const MAIN_FMT = { TV: 1, TV_SHORT: 1, ONA: 1 };
  const byMember = {};   // id тайтла → результат
  const pending = {};
  const open = {};       // развернута ли полная линия / ответвления

  async function load(startId) {
    if (byMember[startId]) return byMember[startId];
    if (pending[startId]) return pending[startId];
    pending[startId] = (async () => {
      const nodes = {}, edges = [];
      const sideOnly = new Set(), extraOnly = new Set(), kind = {};
      let frontier = [startId], level = 0;
      while (frontier.length && level < 14 && Object.keys(nodes).length < 60) {
        const ids = frontier.filter(id => !nodes[id]).slice(0, 50);
        frontier = [];
        if (!ids.length) break;
        const d = await gql(Q_FR, { ids });
        (d.Page.media || []).forEach(m => {
          if (m.type !== 'ANIME') return;
          nodes[m.id] = m;
          ((m.relations && m.relations.edges) || []).forEach(e => {
            const n = e.node;
            if (!n || n.type !== 'ANIME' || n.format === 'MUSIC' || !FOLLOW[e.relationType]) return;
            edges.push({ from: m.id, to: n.id, t: e.relationType });
            if (EXTRA[e.relationType]) {
              if (extraOnly.has(m.id)) return;
              if (!nodes[n.id] && !kind[n.id]) { extraOnly.add(n.id); kind[n.id] = e.relationType; frontier.push(n.id); }
              return;
            }
            if (extraOnly.has(m.id)) return;
            extraOnly.delete(n.id);
            // от ответвлений дальше в ответвления не идём, чтобы не утянуть пол-AniList
            const side = e.relationType === 'SIDE_STORY' || e.relationType === 'SPIN_OFF';
            if (side && sideOnly.has(m.id)) return;
            if (side) sideOnly.add(n.id);
            if (!nodes[n.id]) frontier.push(n.id);
          });
        });
        frontier = [...new Set(frontier)];
        level++;
      }
      const all = Object.values(nodes);
      rememberMedia(all);
      // основная линия: замыкание PREQUEL/SEQUEL от сериала
      const start = nodes[startId];
      let seed = startId;
      if (start && !MAIN_FMT[start.format]) {
        const parent = edges.find(e => e.from === startId && (e.t === 'PARENT' || e.t === 'PREQUEL' || e.t === 'SEQUEL') && nodes[e.to] && MAIN_FMT[nodes[e.to].format]);
        if (parent) seed = parent.to;
      }
      const main = new Set([seed]);
      let grow = true;
      while (grow) {
        grow = false;
        edges.forEach(e => {
          if ((e.t === 'PREQUEL' || e.t === 'SEQUEL') && nodes[e.to] && nodes[e.from]) {
            if (main.has(e.from) && !main.has(e.to)) { main.add(e.to); grow = true; }
            if (main.has(e.to) && !main.has(e.from)) { main.add(e.from); grow = true; }
          }
        });
      }
      const when = m => { const s = m.startDate || {}; return s.year ? s.year * 10000 + (s.month || 12) * 100 + (s.day || 28) : (m.seasonYear ? m.seasonYear * 10000 + 1228 : 99999999); };
      const sort = arr => arr.sort((a, b) => when(a) - when(b) || a.id - b.id);
      const res = {
        main: sort(all.filter(m => main.has(m.id))),
        side: sort(all.filter(m => !main.has(m.id) && !extraOnly.has(m.id) && m.format !== 'MUSIC')),
        extra: sort(all.filter(m => !main.has(m.id) && extraOnly.has(m.id) && m.format !== 'MUSIC')),
        kind
      };
      all.forEach(m => { byMember[m.id] = res; });
      byMember[startId] = res;
      delete pending[startId];
      enrichRu(all).then(ok => { if (ok) refresh(); });
      return res;
    })().catch(e => { delete pending[startId]; throw e; });
    return pending[startId];
  }

  const FMT_SHORT = { TV: 'TV', TV_SHORT: 'TV', MOVIE: L('Фильм', 'Movie'), SPECIAL: L('Спешл', 'Special'), OVA: 'OVA', ONA: 'ONA' };
  function status(m) {
    const it = byAni()[m.id];
    if (!it) return { cls: '', html: '' };
    if (it.status === 'completed') return { cls: 'done', html: `<span class="fr-st done" title="${T('Просмотрено')}">${ICON.check}</span>` };
    if (it.status === 'watching' || it.status === 'paused') return { cls: 'now', html: `<span class="fr-st now">EP ${it.progress || 0}/${it.total || '?'}</span>` };
    if (it.status === 'planned') return { cls: 'plan', html: `<span class="fr-st plan">${T('В планах')}</span>` };
    return { cls: 'drop', html: `<span class="fr-st drop">${esc(ST[it.status].label)}</span>` };
  }
  function row(m, n, curId, tag) {
    const t = mediaTitle(m);
    const st = status(m);
    const cur = m.id === curId;
    const meta = [FMT_SHORT[m.format] || m.format || '', m.episodes ? m.episodes + T(' эп.') : '', m.seasonYear || (m.startDate && m.startDate.year) || (m.status === 'NOT_YET_RELEASED' ? T('Анонс') : '')].filter(Boolean).join(' · ');
    return `<li class="fr-step ${st.cls}${cur ? ' cur' : ''}" style="--c:${esc((m.coverImage && m.coverImage.color) || hueColor(t))}">
      <span class="fr-n">${n}</span>
      <button type="button" class="fr-body" ${cur ? 'disabled' : `data-action="open" data-ani="${m.id}"`}>
        <span class="fr-cov">${m.coverImage && m.coverImage.large ? `<img src="${esc(m.coverImage.large)}" alt="" loading="lazy">` : ''}</span>
        <span class="fr-t">${tag ? `<span class="fr-tag ${tag[0]}">${esc(tag[1])}</span>` : ''}<b>${esc(t)}</b><small>${esc(meta)}</small>${cur ? `<em class="fr-here">${T('Ты здесь')}</em>` : ''}</span>
        ${st.html}
      </button></li>`;
  }
  function listHTML(arr, curId, key, from, tagOf) {
    const LIM = 7;
    const ci = arr.findIndex(m => m.id === curId);
    let show = arr.map((m, i) => ({ m, i }));
    let cut = false;
    if (arr.length > LIM + 1 && !open[key]) {
      const a = Math.max(0, Math.min(arr.length - LIM, (ci < 0 ? 0 : ci) - 2));
      show = show.slice(a, a + LIM);
      cut = true;
    }
    const first = show.length && show[0].i > 0;
    const last = show.length && show[show.length - 1].i < arr.length - 1;
    return `${cut && first ? `<button type="button" class="fr-more" data-fr="${key}">⋯ ${T('ещё')} ${show[0].i}</button>` : ''}
      <ol class="fr-line" start="${(show[0] ? show[0].i : 0) + from}">${show.map(x => row(x.m, x.i + from, curId, tagOf && tagOf(x.m))).join('')}</ol>
      ${cut && last ? `<button type="button" class="fr-more" data-fr="${key}">⋯ ${T('ещё')} ${arr.length - 1 - show[show.length - 1].i}</button>` : ''}
      ${!cut && open[key] && arr.length > LIM + 1 ? `<button type="button" class="fr-more" data-fr="${key}">${T('Свернуть')}</button>` : ''}`;
  }
  function html(curId) {
    const r = byMember[curId];
    if (!r) return `<section class="section fr"><div class="section-head"><h2>${T('Порядок просмотра')}</h2></div><div class="fr-load"><span class="spinner sm"></span>${T('Собираю все сезоны…')}</div></section>`;
    const total = r.main.length + r.side.length + r.extra.length;
    if (total < 2) return '';
    const map = byAni();
    const key = 'fr' + (r.main[0] || r.side[0] || r.extra[0]).id;
    const view = open[key + 'view'] || 'main';
    const done = r.main.filter(m => map[m.id] && map[m.id].status === 'completed').length;
    const tabs = `<div class="seg fr-tabs" role="tablist">
        <button type="button" role="tab" data-frv="${key}" data-v="main" aria-pressed="${view === 'main'}">${T('Сюжет')}</button>
        <button type="button" role="tab" data-frv="${key}" data-v="all" aria-pressed="${view === 'all'}">${T('Всё подряд')} · ${total}</button></div>`;
    return `<section class="section fr" data-frkey="${key}"><div class="section-head fr-head"><h2>${T('Порядок просмотра')}</h2>${tabs}</div>
      <div class="fr-pages" data-view="${view}">${view === 'all' ? allHTML(r, curId, key) : mainHTML(r, curId, key, done, map)}</div></section>`;
  }
  function mainHTML(r, curId, key, done, map) {
    if (!r.main.length) return allHTML(r, curId, key);
    const curSide = r.side.some(m => m.id === curId);
    const sideOpen = open[key + 's'] || curSide;
    const next = r.main.find(m => !map[m.id] || map[m.id].status !== 'completed');
    return `<div class="fr-page in-${open[key + 'dir'] || 'none'}"><div class="fr-sub"><span>${done} / ${r.main.length} ${T('просмотрено')}</span></div>
      ${done && next && next.id !== curId ? `<button type="button" class="fr-next" data-action="open" data-ani="${next.id}"><span>${T('Смотреть дальше:')}</span><b>${esc(mediaTitle(next))}</b>${ICON.next}</button>` : ''}
      ${listHTML(r.main, curId, key, 1)}
      ${r.side.length ? `<button type="button" class="fr-side-t" data-fr="${key}s" aria-expanded="${!!sideOpen}">${T('Фильмы, OVA и спешлы вне основной линии')} · ${r.side.length}${ICON.next}</button>
        ${sideOpen ? `<div class="fr-side">${listHTML(r.side, curId, key + 'x', 1)}</div>` : ''}` : ''}
      <p class="hint fr-note">${T('Порядок — по дате выхода. Ответвления можно смотреть в любой момент после своего сезона.')}</p></div>`;
  }
  /* Абсолютно всё по дате выхода: сюжет, ответвления, пересказы, альтернативные версии */
  function allHTML(r, curId, key) {
    const mainSet = new Set(r.main.map(m => m.id)), extraSet = new Set(r.extra.map(m => m.id));
    const when = m => { const s = m.startDate || {}; return s.year ? s.year * 10000 + (s.month || 12) * 100 + (s.day || 28) : (m.seasonYear ? m.seasonYear * 10000 + 1228 : 99999999); };
    const all = r.main.concat(r.side, r.extra).sort((a, b) => when(a) - when(b) || a.id - b.id);
    const KIND = { SUMMARY: T('Пересказ'), ALTERNATIVE: T('Другая версия'), COMPILATION: T('Сборник'), CONTAINS: T('Сборник') };
    const tagOf = m => mainSet.has(m.id) ? ['main', T('Сюжет')]
      : extraSet.has(m.id) ? ['extra', KIND[r.kind[m.id]] || T('Доп.')]
      : ['side', T('Доп.') + ' · ' + (FMT_SHORT[m.format] || m.format || '')];
    const map = byAni();
    const seen = all.filter(m => map[m.id] && map[m.id].status === 'completed').length;
    return `<div class="fr-page in-${open[key + 'dir'] || 'none'}"><div class="fr-sub"><span>${seen} / ${all.length} ${T('просмотрено')}</span>
        <span class="fr-legend"><i class="fr-tag main">${T('Сюжет')}</i><i class="fr-tag side">${T('Доп.')}</i>${r.extra.length ? `<i class="fr-tag extra">${T('Пересказ / версия')}</i>` : ''}</span></div>
      ${listHTML(all, curId, key + 'all', 1, tagOf)}
      <p class="hint fr-note">${T('Всё, что связано с этой историей, по дате выхода: сезоны, фильмы, OVA, спешлы, пересказы и альтернативные версии. «Доп.» можно пропустить без потери сюжета.')}</p></div>`;
  }
  let lastCur = null;
  function render(el, curId) {
    if (!el || !curId) { if (el) el.innerHTML = ''; return; }
    lastCur = curId;
    el.innerHTML = html(curId);
    if (!byMember[curId]) load(curId).then(() => { if (lastCur === curId) refresh(); }).catch(() => { if (lastCur === curId && el.isConnected) el.innerHTML = ''; });
  }
  function refresh() {
    const el = $('#dSeq');
    const v = ui.detailStack.length ? dvm() : null;
    if (el && v && v.aniId) el.innerHTML = html(v.aniId);
  }
  function setView(key, v) {
    if ((open[key + 'view'] || 'main') === v) return;
    open[key + 'dir'] = v === 'all' ? 'right' : 'left';
    open[key + 'view'] = v;
    buzz(8);
    refresh();
  }
  document.addEventListener('click', e => {
    const tb = e.target.closest('[data-frv]');
    if (tb) { setView(tb.dataset.frv, tb.dataset.v); return; }
    const b = e.target.closest('[data-fr]');
    if (!b) return;
    open[b.dataset.fr] = !open[b.dataset.fr];
    buzz(6);
    refresh();
  });
  // свайп влево/вправо по блоку переключает «Сюжет» ↔ «Всё подряд»
  let sw = null;
  document.addEventListener('touchstart', e => {
    const sec = e.target.closest('.fr[data-frkey]');
    if (!sec || e.touches.length !== 1) { sw = null; return; }
    sw = { key: sec.dataset.frkey, x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  document.addEventListener('touchend', e => {
    if (!sw) return;
    const t = e.changedTouches[0], dx = t.clientX - sw.x, dy = t.clientY - sw.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) setView(sw.key, dx < 0 ? 'all' : 'main');
    sw = null;
  }, { passive: true });
  return { load, render, refresh, _cache: byMember };
})();
