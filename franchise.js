'use strict';
/* «Порядок просмотра»: вся франшиза по порядку — сезоны, фильмы и OVA, которые идут в основной линии,
   отдельно — ответвления и спешлы. Открытый тайтл подсвечен, видно, что уже просмотрено. */

const Franchise = (() => {
  const Q_FR = `query($ids:[Int]){Page(perPage:50){media(id_in:$ids){id idMal type format status episodes duration seasonYear season
    startDate{year month day} title{romaji english native} synonyms coverImage{large color} averageScore popularity
    relations{edges{relationType node{id type format}}}}}}`;
  const FOLLOW = { PREQUEL: 1, SEQUEL: 1, PARENT: 1, SIDE_STORY: 1, SPIN_OFF: 1 };
  const MAIN_FMT = { TV: 1, TV_SHORT: 1, ONA: 1 };
  const byMember = {};   // id тайтла → результат
  const pending = {};
  const open = {};       // развернута ли полная линия / ответвления

  async function load(startId) {
    if (byMember[startId]) return byMember[startId];
    if (pending[startId]) return pending[startId];
    pending[startId] = (async () => {
      const nodes = {}, edges = [];
      const sideOnly = new Set();
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
        side: sort(all.filter(m => !main.has(m.id) && m.format !== 'MUSIC'))
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
  function row(m, n, curId) {
    const t = mediaTitle(m);
    const st = status(m);
    const cur = m.id === curId;
    const meta = [FMT_SHORT[m.format] || m.format || '', m.episodes ? m.episodes + T(' эп.') : '', m.seasonYear || (m.startDate && m.startDate.year) || (m.status === 'NOT_YET_RELEASED' ? T('Анонс') : '')].filter(Boolean).join(' · ');
    return `<li class="fr-step ${st.cls}${cur ? ' cur' : ''}" style="--c:${esc((m.coverImage && m.coverImage.color) || hueColor(t))}">
      <span class="fr-n">${n}</span>
      <button type="button" class="fr-body" ${cur ? 'disabled' : `data-action="open" data-ani="${m.id}"`}>
        <span class="fr-cov">${m.coverImage && m.coverImage.large ? `<img src="${esc(m.coverImage.large)}" alt="" loading="lazy">` : ''}</span>
        <span class="fr-t"><b>${esc(t)}</b><small>${esc(meta)}</small>${cur ? `<em class="fr-here">${T('Ты здесь')}</em>` : ''}</span>
        ${st.html}
      </button></li>`;
  }
  function listHTML(arr, curId, key, from) {
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
      <ol class="fr-line" start="${(show[0] ? show[0].i : 0) + from}">${show.map(x => row(x.m, x.i + from, curId)).join('')}</ol>
      ${cut && last ? `<button type="button" class="fr-more" data-fr="${key}">⋯ ${T('ещё')} ${arr.length - 1 - show[show.length - 1].i}</button>` : ''}
      ${!cut && open[key] && arr.length > LIM + 1 ? `<button type="button" class="fr-more" data-fr="${key}">${T('Свернуть')}</button>` : ''}`;
  }
  function html(curId) {
    const r = byMember[curId];
    if (!r) return `<section class="section fr"><div class="section-head"><h2>${T('Порядок просмотра')}</h2></div><div class="fr-load"><span class="spinner sm"></span>${T('Собираю все сезоны…')}</div></section>`;
    if (r.main.length + r.side.length < 2) return '';
    const map = byAni();
    const done = r.main.filter(m => map[m.id] && map[m.id].status === 'completed').length;
    const curSide = r.side.some(m => m.id === curId);
    const key = 'fr' + (r.main[0] || r.side[0]).id;
    const sideOpen = open[key + 's'] || curSide;
    const next = r.main.find(m => !map[m.id] || map[m.id].status !== 'completed');
    return `<section class="section fr"><div class="section-head"><h2>${T('Порядок просмотра')}</h2><span class="label">${done} / ${r.main.length} ${T('просмотрено')}</span></div>
      ${done && next && next.id !== curId ? `<button type="button" class="fr-next" data-action="open" data-ani="${next.id}"><span>${T('Смотреть дальше:')}</span><b>${esc(mediaTitle(next))}</b>${ICON.next}</button>` : ''}
      ${listHTML(r.main, curId, key, 1)}
      ${r.side.length ? `<button type="button" class="fr-side-t" data-fr="${key}s" aria-expanded="${!!sideOpen}">${T('Фильмы, OVA и спешлы вне основной линии')} · ${r.side.length}${ICON.next}</button>
        ${sideOpen ? `<div class="fr-side">${listHTML(r.side, curId, key + 'x', 1)}</div>` : ''}` : ''}
      <p class="hint fr-note">${T('Порядок — по дате выхода. Ответвления можно смотреть в любой момент после своего сезона.')}</p></section>`;
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
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-fr]');
    if (!b) return;
    open[b.dataset.fr] = !open[b.dataset.fr];
    buzz(6);
    refresh();
  });
  return { load, render, refresh, _cache: byMember };
})();
