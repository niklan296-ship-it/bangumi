'use strict';
/* Гибкий поиск: «Kon» находит K-ON!, «kaguya sama» — Kaguya-sama, опечатки и русские названия тоже.
   Спрашиваем сразу несколько мест (AniList с вариантами написания, Shikimori, MyAnimeList через Jikan),
   склеиваем и сортируем по похожести на запрос. */

const SmartSearch = (() => {
  const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, '');
  const words = s => String(s || '').toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-я0-9]+/).filter(Boolean);

  /* Народные названия и сокращения → как искать. Ключи без пробелов и знаков, ё = е. */
  const ALIASES = {
    // русские
    'магичка': 'Jujutsu Kaisen', 'магбитва': 'Jujutsu Kaisen', 'мб': 'Jujutsu Kaisen', 'магическая': 'Jujutsu Kaisen', 'джуджуцу': 'Jujutsu Kaisen', 'дзюдзюцу': 'Jujutsu Kaisen',
    'атака': 'Shingeki no Kyojin', 'ат': 'Shingeki no Kyojin', 'титаны': 'Shingeki no Kyojin', 'атакатитанов': 'Shingeki no Kyojin',
    'клинок': 'Kimetsu no Yaiba', 'клинокрассекающийдемонов': 'Kimetsu no Yaiba', 'истребительдемонов': 'Kimetsu no Yaiba',
    'геройка': 'Boku no Hero Academia', 'гера': 'Boku no Hero Academia', 'мга': 'Boku no Hero Academia', 'моягеройскаяакадемия': 'Boku no Hero Academia',
    'ванпис': 'One Piece', 'ванпись': 'One Piece', 'большойкуш': 'One Piece', 'ванпанч': 'One Punch Man', 'ванпанчмен': 'One Punch Man', 'опм': 'One Punch Man',
    'наруто': 'Naruto', 'шиппуден': 'Naruto Shippuden', 'боруто': 'Boruto', 'блич': 'Bleach', 'хантер': 'Hunter x Hunter', 'хантерххантер': 'Hunter x Hunter', 'хх': 'Hunter x Hunter',
    'гуль': 'Tokyo Ghoul', 'токийскийгуль': 'Tokyo Ghoul', 'тг': 'Tokyo Ghoul', 'тетрадь': 'Death Note', 'тетрадьсмерти': 'Death Note', 'дезнот': 'Death Note',
    'стальной': 'Fullmetal Alchemist', 'стальнойалхимик': 'Fullmetal Alchemist', 'ева': 'Evangelion', 'евангелион': 'Evangelion',
    'резеро': 'Re:Zero', 'коносуба': 'Konosuba', 'соа': 'Sword Art Online', 'мастерамеча': 'Sword Art Online', 'мастерамечаонлайн': 'Sword Art Online',
    'бензопила': 'Chainsaw Man', 'человекбензопила': 'Chainsaw Man', 'чм': 'Chainsaw Man', 'чейнсо': 'Chainsaw Man', 'фрирен': 'Sousou no Frieren',
    'докторстоун': 'Dr. Stone', 'стоун': 'Dr. Stone', 'синяятюрьма': 'Blue Lock', 'блюлок': 'Blue Lock', 'спай': 'Spy x Family', 'семьяшпиона': 'Spy x Family', 'шпионы': 'Spy x Family',
    'кагуя': 'Kaguya-sama', 'госпожакагуя': 'Kaguya-sama', 'мстители': 'Tokyo Revengers', 'токийскиемстители': 'Tokyo Revengers', 'тм': 'Tokyo Revengers',
    'фармацевт': 'Kusuriya no Hitorigoto', 'монологфармацевта': 'Kusuriya no Hitorigoto', 'поднятиеуровня': 'Solo Leveling', 'сололевелинг': 'Solo Leveling', 'соло': 'Solo Leveling',
    'данмачи': 'DanMachi', 'оверлорд': 'Overlord', 'слизь': 'Tensei shitara Slime', 'слайм': 'Tensei shitara Slime', 'безработный': 'Mushoku Tensei', 'реинкарнациябезработного': 'Mushoku Tensei',
    'штейнс': 'Steins;Gate', 'враташтейна': 'Steins;Gate', 'штайнс': 'Steins;Gate', 'кодгиас': 'Code Geass', 'гиас': 'Code Geass', 'кайдзю': 'Kaiju No. 8', 'кайдзю8': 'Kaiju No. 8',
    'дандадан': 'Dandadan', 'сакамото': 'Sakamoto Days', 'оси': 'Oshi no Ko', 'звездноедитя': 'Oshi no Ko', 'ошиноко': 'Oshi no Ko', 'вайолет': 'Violet Evergarden', 'вайолетэвергарден': 'Violet Evergarden',
    'берсерк': 'Berserk', 'джоджо': "JoJo's Bizarre Adventure", 'жожо': "JoJo's Bizarre Adventure", 'гинтама': 'Gintama', 'хайкью': 'Haikyuu', 'волейбол': 'Haikyuu',
    'мобпсихо': 'Mob Psycho 100', 'моб': 'Mob Psycho 100', 'винландсага': 'Vinland Saga', 'винланд': 'Vinland Saga', 'обещанныйневерленд': 'Yakusoku no Neverland', 'неверленд': 'Yakusoku no Neverland',
    'паразит': 'Kiseijuu', 'паразитучение': 'Kiseijuu', 'ковбойбибоп': 'Cowboy Bebop', 'бибоп': 'Cowboy Bebop', 'кэйон': 'K-ON!', 'кейон': 'K-ON!', 'бокуно': 'Boku no',
    'адскийрай': 'Jigokuraku', 'фаерфорс': 'Enen no Shouboutai', 'пламеннаябригада': 'Enen no Shouboutai', 'черныйклевер': 'Black Clover', 'клевер': 'Black Clover',
    'семьсмертныхгрехов': 'Nanatsu no Taizai', 'грехи': 'Nanatsu no Taizai', 'токийскийгульре': 'Tokyo Ghoul:re', 'эхоюности': 'Ao Haru Ride',
    // английские сокращения
    'jjk': 'Jujutsu Kaisen', 'aot': 'Shingeki no Kyojin', 'snk': 'Shingeki no Kyojin', 'kny': 'Kimetsu no Yaiba', 'ds': 'Kimetsu no Yaiba', 'mha': 'Boku no Hero Academia',
    'bnha': 'Boku no Hero Academia', 'opm': 'One Punch Man', 'hxh': 'Hunter x Hunter', 'fma': 'Fullmetal Alchemist', 'fmab': 'Fullmetal Alchemist: Brotherhood',
    'sao': 'Sword Art Online', 'csm': 'Chainsaw Man', 'tg': 'Tokyo Ghoul', 'dn': 'Death Note', 'eva': 'Evangelion', 'nge': 'Neon Genesis Evangelion', 'jojo': "JoJo's Bizarre Adventure",
    'rezero': 'Re:Zero', 'konosuba': 'Konosuba', 'tpn': 'Yakusoku no Neverland', 'slime': 'Tensei shitara Slime', 'mt': 'Mushoku Tensei', 'sl': 'Solo Leveling',
    'oshinoko': 'Oshi no Ko', 'mp100': 'Mob Psycho 100', 'sxf': 'Spy x Family', 'aria': 'Aria', 'kon': 'K-ON!', 'keion': 'K-ON!', 'frieren': 'Sousou no Frieren',
    'apothecary': 'Kusuriya no Hitorigoto', 'demonslayer': 'Kimetsu no Yaiba', 'attackontitan': 'Shingeki no Kyojin', 'myheroacademia': 'Boku no Hero Academia'
  };
  /* Неправильная раскладка: «Yfhenj» → «Наруто» и наоборот */
  const EN = 'qwertyuiop[]asdfghjkl;\'zxcvbnm,.`', RU = 'йцукенгшщзхъфывапролджэячсмитьбюё';
  function swapLayout(s) {
    const low = s.toLowerCase();
    const toRu = /[a-z]/.test(low) && !/[а-яё]/.test(low);
    return [...low].map(ch => { const i = (toRu ? EN : RU).indexOf(ch); return i >= 0 ? (toRu ? RU : EN)[i] : ch; }).join('');
  }
  /* Кириллица → латиница для AniList */
  const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
  const translit = s => [...s.toLowerCase()].map(c => TR[c] != null ? TR[c] : c).join('');
  /* Основа слова для русского поиска: «Магичка» → «Магич», «битвы» → «битв» */
  function stems(q) {
    const w = q.trim().split(/\s+/);
    const out = new Set();
    const cut = x => x.length >= 6 ? x.slice(0, x.length - 2) : x.length >= 5 ? x.slice(0, x.length - 1) : x;
    out.add(w.map(cut).join(' '));
    if (w.length === 1 && w[0].length >= 6) out.add(w[0].slice(0, 4));
    out.delete(q.trim());
    return [...out].filter(x => x.replace(/\s/g, '').length >= 3);
  }
  function alias(q) {
    const n = norm(q);
    if (ALIASES[n]) return ALIASES[n];
    // «магичка 2 сезон», «jjk 2» — алиас в начале
    const w = String(q).toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-я0-9]+/).filter(Boolean);
    if (w.length > 1 && ALIASES[w[0]]) return (ALIASES[w[0]] + ' ' + w.slice(1).filter(x => /\d/.test(x)).join(' ')).trim();
    return null;
  }

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
        // общее начало: «магичка» ~ «магическая битва»
        let lcp = 0; while (lcp < nq.length && lcp < nt.length && nq[lcp] === nt[lcp]) lcp++;
        if (lcp >= 4 || (nq.length >= 3 && lcp === nq.length)) s = Math.max(s, 30 + 30 * lcp / nq.length);
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
    const al = alias(q) || alias(swapLayout(q));
    if (al) {
      const bare = al.replace(/\s+\d+$/, '');
      const lists = await Promise.all([base(al).catch(() => []), bare !== al ? base(bare).catch(() => []) : Promise.resolve([]), base(q).catch(() => [])]);
      const all = new Map();
      lists.flat().forEach(m => { if (m && m.id && !all.has(m.id)) all.set(m.id, m); });
      return [...all.values()].map(m => ({ m, s: sim(al, m) + Math.min(10, Math.log10((m.popularity || 0) + 1) * 2) }))
        .sort((a, b) => b.s - a.s).slice(0, 40).map(x => x.m);
    }
    let res = await base(q).catch(e => { if (e && !e.soft) throw e; return []; });
    const top = res[0] ? sim(q, res[0]) : 0;
    if (res.length >= 3 && top >= 45) return res;
    // мало или не похоже: другое написание, основы слов, раскладка, транслит
    const cyr = /[а-яё]/i.test(q);
    const extra = cyr ? [] : variants(q).map(anilist);
    stems(q).forEach(x => extra.push(cyr ? searchRu(x).catch(() => []) : anilist(x)));
    const sw = swapLayout(q);
    if (sw !== q.toLowerCase()) extra.push(/[а-яё]/.test(sw) ? searchRu(sw).catch(() => []) : anilist(sw));
    if (cyr) extra.push(anilist(translit(q)), jikan(translit(q)));
    else extra.push(searchRu(Share.untranslit(q)).catch(() => []));
    const more = (await Promise.all(extra)).flat().filter(Boolean);
    const all = new Map();
    res.concat(more).forEach(m => { if (m && m.id && !all.has(m.id)) all.set(m.id, m); });
    const qs = [q, sw, cyr ? translit(q) : Share.untranslit(q)];
    return [...all.values()].map(m => ({ m, s: Math.max(...qs.map(x => sim(x, m))) + Math.min(10, Math.log10((m.popularity || 0) + 1) * 2) }))
      .sort((a, b) => b.s - a.s).filter(x => x.s >= 20 || res.includes(x.m)).slice(0, 40).map(x => x.m);
  }

  async function base(q) {
    q = q.trim();
    const cyr = /[а-яё]/i.test(q);
    anilist.err = null;
    const jobs = [
      cyr ? Promise.resolve([]) : anilist(q),
      searchRu(q).catch(() => []),
      cyr ? Promise.resolve([]) : jikan(q)
    ];
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

  return { search, sim, variants, norm, alias, stems, swapLayout, translit };
})();
