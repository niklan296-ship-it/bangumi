'use strict';
/* Гибкий поиск: «Kon» находит K-ON!, «kaguya sama» — Kaguya-sama, опечатки и русские названия тоже.
   Спрашиваем сразу несколько мест (AniList с вариантами написания, Shikimori, MyAnimeList через Jikan),
   склеиваем и сортируем по похожести на запрос. */

const SmartSearch = (() => {
  const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, '');
  const words = s => String(s || '').toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-я0-9]+/).filter(Boolean);

  /* Варианты написания для AniList: дефисы, пробелы, «K-on» из «Kon» */
  function variants(q) {
    const s = q.trim(), out = new Set();
    if (/[-_:.!?]/.test(s)) out.add(s.replace(/[-_:.!?]+/g, ' ').replace(/\s+/g, ' ').trim());
    if (/\s/.test(s)) out.add(s.replace(/\s+/g, '-'));
    if (/^[a-z]{3,6}$/i.test(s)) { out.add(s[0] + '-' + s.slice(1)); out.add(s.slice(0, 2) + '-' + s.slice(2)); }
    if (/^[a-z]+\s+[a-z]+$/i.test(s) && s.length <= 12) out.add(s.replace(/\s+/, ''));
    out.delete(s);
    return [...out].slice(0, 3);
  }

  function lev(a, b) {
    if (a === b) return 0;
    if (!a.length || !b.length) return Math.max(a.length, b.length);
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  function titlesOf(m) {
    const t = m.title || {};
    return [t.romaji, t.english, t.native, ruN(m.idMal)].concat(m.synonyms || []).filter(Boolean);
  }
  /* Насколько название похоже на запрос: 0…100 */
  function sim(q, m) {
    const nq = norm(q), wq = words(q);
    if (!nq) return 0;
    let best = 0;
    titlesOf(m).forEach(t => {
      const nt = norm(t);
      if (!nt) return;
      let s = 0;
      if (nt === nq) s = 100;
      else if (nt.startsWith(nq)) s = 72 - Math.min(20, (nt.length - nq.length) / 2);
      else if (nt.includes(nq)) s = 55 - Math.min(20, (nt.length - nq.length) / 3);
      else {
        const wt = words(t);
        const hit = wq.filter(w => wt.some(x => x === w || (w.length > 3 && (x.startsWith(w) || lev(x, w) <= 1)))).length;
        s = wq.length ? 45 * hit / wq.length : 0;
        // опечатки: сравниваем с началом названия той же длины
        const head = nt.slice(0, nq.length + 1);
        const d = lev(nq, head.length > nq.length ? head.slice(0, nq.length) : head);
        if (nq.length >= 4 && d <= Math.max(1, Math.floor(nq.length / 4))) s = Math.max(s, 50 - d * 8);
      }
      best = Math.max(best, s);
    });
    return best;
  }

  async function jikan(q) {
    try {
      const ctl = new AbortController();
      const tm = setTimeout(() => ctl.abort(), 6000);
      const r = await fetch('https://api.jikan.moe/v4/anime?sfw=true&limit=15&q=' + encodeURIComponent(q), { signal: ctl.signal });
      clearTimeout(tm);
      if (!r.ok) return [];
      const j = await r.json();
      const ids = [...new Set((j.data || []).map(a => a.mal_id).filter(Boolean))];
      if (!ids.length) return [];
      const d = await gql(Q_BY_MAL, { ids });
      return d.Page.media || [];
    } catch (e) { return []; }
  }
  const anilist = q => gql(Q_SEARCH, { q }).then(d => d.Page.media || []).catch(e => { anilist.err = e; return []; });

  async function search(q) {
    q = q.trim();
    const cyr = /[а-яё]/i.test(q);
    anilist.err = null;
    const jobs = [
      cyr ? Promise.resolve([]) : anilist(q),
      searchRu(q).catch(() => []),
      cyr ? Promise.resolve([]) : jikan(q)
    ].concat(cyr ? [] : variants(q).map(anilist));
    const lists = await Promise.all(jobs);
    const seen = new Map();
    lists.forEach((list, li) => (list || []).forEach((m, r) => {
      if (!m || !m.id || (m.isAdult)) return;
      const prev = seen.get(m.id);
      const rankBonus = li === 0 || li === 1 ? 10 * (1 - r / 30) : li >= 3 ? 6 * (1 - r / 30) : 4 * (1 - r / 15);
      if (prev) { prev.bonus = Math.max(prev.bonus, rankBonus); prev.hits++; }
      else seen.set(m.id, { m, bonus: rankBonus, hits: 1 });
    }));
    let res = [...seen.values()];
    if (!res.length && cyr) {
      // кириллица, а Shikimori молчит — пробуем AniList и транслит
      const a = await anilist(q);
      res = a.map((m, r) => ({ m, bonus: 10 * (1 - r / 30), hits: 1 }));
    }
    if (!res.length && anilist.err) throw anilist.err;
    res.forEach(x => {
      x.score = sim(q, x.m) + x.bonus + Math.min(10, Math.log10((x.m.popularity || 0) + 1) * 2) + (x.hits - 1) * 4;
    });
    res.sort((a, b) => b.score - a.score);
    return res.slice(0, 40).map(x => x.m);
  }

  return { search, sim, variants, norm };
})();
