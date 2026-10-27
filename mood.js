'use strict';
/* «Подобрать по настроению»: опиши словами, что хочешь почувствовать, — Бангуми разберёт текст
   (уютно, поплакать, адреналин, мозголомка, коротко на вечер, без драмы…), спросит AniList
   по жанрам и тегам и выберет несколько тайтлов, объясняя почему. Всё считается на телефоне. */

const Mood = (() => {
  // Ключевые слова (начала слов, рус/англ) → жанры, теги AniList и подпись «почему»
  const VIBES = [
    { k: ['уют', 'спокой', 'расслаб', 'тепл', 'ламп', 'милое', 'милый', 'милая', 'душевн', 'отдохн', 'медитат', 'cozy', 'comfy', 'chill', 'relax', 'wholesome', 'calm', 'healing'],
      g: ['Slice of Life'], t: ['Iyashikei', 'Cute Girls Doing Cute Things', 'Food', 'Camping', 'Episodic'], ru: 'уютное', en: 'cozy' },
    { k: ['плак', 'поплак', 'слез', 'слёз', 'драм', 'drama', 'груст', 'тосклив', 'печал', 'трогат', 'эмоцион', 'cry', 'sad', 'tear', 'emotional', 'touching'],
      g: ['Drama'], t: ['Tragedy', 'Coming of Age', 'Found Family', 'Terminal Illness'], ru: 'трогательное', en: 'emotional', nr: 'драмы и слёз', ne: 'drama' },
    { k: ['адренал', 'экшн', 'экшен', 'драк', 'битв', 'сражен', 'хайп', 'мощн', 'эпичн', 'зрелищ', 'action', 'fight', 'hype', 'epic', 'battle'],
      g: ['Action'], t: ['Super Power', 'Martial Arts', 'Shounen', 'Swordplay'], ru: 'экшен', en: 'action', nr: 'экшена', ne: 'action' },
    { k: ['смеш', 'смеят', 'посмея', 'угар', 'ржак', 'ржат', 'комед', 'весел', 'юмор', 'прикол', 'funny', 'laugh', 'comedy', 'lol'],
      g: ['Comedy'], t: ['Parody', 'Slapstick', 'Satire', 'Surreal Comedy'], ru: 'смешное', en: 'funny', nr: 'комедии', ne: 'comedy' },
    { k: ['мозг', 'подума', 'задума', 'психол', 'загад', 'головолом', 'неожидан', 'поворот', 'умн', 'философ', 'mind', 'twist', 'psycholog', 'smart', 'think', 'philosoph'],
      g: ['Psychological', 'Mystery'], t: ['Philosophy', 'Unreliable Narrator', 'Time Manipulation'], ru: 'заставит думать', en: 'mind-bending', nr: 'загрузов', ne: 'heavy plots' },
    { k: ['детектив', 'расслед', 'преступ', 'убийств', 'detective', 'crime', 'murder', 'investigat'],
      g: ['Mystery'], t: ['Detective', 'Crime'], ru: 'детектив', en: 'detective' },
    { k: ['напряж', 'триллер', 'саспенс', 'нервн', 'thrill', 'suspense', 'tense'],
      g: ['Thriller'], t: ['Survival', 'Death Game'], ru: 'напряжённое', en: 'tense', nr: 'напряга', ne: 'tension' },
    { k: ['страш', 'ужас', 'жут', 'крип', 'хоррор', 'мрач', 'темн', 'тёмн', 'жесток', 'horror', 'scary', 'creepy', 'dark', 'grim', 'gore'],
      g: ['Horror', 'Thriller'], t: ['Gore', 'Tragedy', 'Survival'], ru: 'мрачное', en: 'dark', nr: 'мрачного', ne: 'dark stuff' },
    { k: ['романт', 'любов', 'отношен', 'влюб', 'свидан', 'romance', 'love', 'romantic', 'dating'],
      g: ['Romance'], t: ['Love Triangle', 'Coming of Age', 'School'], ru: 'романтика', en: 'romance', nr: 'романтики', ne: 'romance' },
    { k: ['бабоч', 'краснет', 'милот', 'няш', 'сладк', 'fluff', 'cute', 'sweet', 'kawaii'],
      g: ['Romance', 'Comedy'], t: ['Cute Girls Doing Cute Things', 'Iyashikei'], ru: 'милое', en: 'cute' },
    { k: ['приключ', 'путешеств', 'исследов', 'странств', 'adventure', 'journey', 'travel', 'explor'],
      g: ['Adventure', 'Fantasy'], t: ['Travel', 'Found Family'], ru: 'приключения', en: 'adventure' },
    { k: ['фэнтез', 'магия', 'магич', 'волшеб', 'дракон', 'fantasy', 'magic', 'dragon', 'wizard'],
      g: ['Fantasy'], t: ['Magic', 'Dragons', 'Swordplay'], ru: 'фэнтези', en: 'fantasy' },
    { k: ['исекай', 'попаданц', 'другой мир', 'переро', 'реинкарн', 'isekai', 'reincarnat', 'another world'],
      g: ['Fantasy'], t: ['Isekai', 'Reincarnation'], ru: 'исекай', en: 'isekai', nr: 'исекая', ne: 'isekai' },
    { k: ['космос', 'будущ', 'фантаст', 'робот', 'киберп', 'технолог', 'sci', 'space', 'future', 'robot', 'cyberpunk', 'mecha'],
      g: ['Sci-Fi', 'Mecha'], t: ['Space', 'Cyberpunk', 'Robots', 'Dystopian'], ru: 'фантастика', en: 'sci-fi' },
    { k: ['спорт', 'соревн', 'команд', 'победит', 'тренир', 'sport', 'competition', 'team', 'tournament'],
      g: ['Sports'], t: ['Team Sports', 'Coming of Age'], ru: 'спорт', en: 'sports' },
    { k: ['мотив', 'вдохнов', 'мечт', 'стремл', 'вырос', 'взросл', 'inspir', 'motivat', 'dream', 'grow'],
      g: ['Drama', 'Sports'], t: ['Coming of Age', 'Primarily Adult Cast', 'Workplace'], ru: 'вдохновит', en: 'inspiring' },
    { k: ['музык', 'песн', 'айдол', 'рок-', 'music', 'band', 'idol', 'song'],
      g: ['Music'], t: ['Band', 'Idol'], ru: 'музыка', en: 'music' },
    { k: ['еда', 'еду', 'готов', 'кулинар', 'вкусн', 'food', 'cook', 'gourmet'],
      g: ['Slice of Life'], t: ['Food'], ru: 'про еду', en: 'food' },
    { k: ['школ', 'учеб', 'студен', 'клуб', 'school', 'student', 'club'],
      g: ['Slice of Life', 'Comedy'], t: ['School', 'School Club'], ru: 'школа', en: 'school' },
    { k: ['месть', 'мщен', 'отомст', 'revenge', 'vengeance'],
      g: ['Action', 'Drama'], t: ['Revenge', 'Anti-Hero'], ru: 'месть', en: 'revenge' },
    { k: ['выжив', 'игра на смерть', 'смертел', 'survival', 'death game'],
      g: ['Thriller'], t: ['Survival', 'Death Game'], ru: 'выживание', en: 'survival' },
    { k: ['истори', 'самура', 'средневек', 'войн', 'армия', 'historical', 'samurai', 'war', 'military'],
      g: ['Action', 'Drama'], t: ['Historical', 'Samurai', 'Military', 'War'], ru: 'история и война', en: 'historical' },
    { k: ['вампир', 'демон', 'призрак', 'ёкай', 'екай', 'нечист', 'vampire', 'demon', 'ghost', 'youkai', 'supernatural'],
      g: ['Supernatural'], t: ['Vampire', 'Demons', 'Ghost', 'Youkai'], ru: 'сверхъестественное', en: 'supernatural' },
    { k: ['взросл', 'серьезн', 'серьёзн', 'глубок', 'сейнен', 'mature', 'serious', 'deep', 'seinen'],
      g: ['Drama', 'Psychological'], t: ['Seinen', 'Primarily Adult Cast', 'Philosophy'], ru: 'взрослое', en: 'mature' },
    { k: ['семья', 'семьи', 'семейн', 'дружб', 'друз', 'family', 'friendship', 'friends'],
      g: ['Slice of Life', 'Drama'], t: ['Found Family', 'Ensemble Cast'], ru: 'дружба и семья', en: 'found family' },
    { k: ['красив', 'визуал', 'рисовк', 'анимаци', 'картинк', 'beautiful', 'visual', 'animation', 'gorgeous'],
      g: [], t: [], ru: 'красивое', en: 'beautiful', minScore: 78 }
  ];
  const NEG = /(^|\s)(не|без|no|not|without|никак(ой|их)?)\s+$/i;
  const TAG_RU = {
    'Iyashikei': 'исцеляющее', 'Cute Girls Doing Cute Things': 'милые девочки', 'Food': 'еда', 'Camping': 'кемпинг', 'Episodic': 'по эпизодам',
    'Tragedy': 'трагедия', 'Coming of Age': 'взросление', 'Found Family': 'найденная семья', 'Terminal Illness': 'болезнь', 'Super Power': 'суперсилы',
    'Martial Arts': 'боевые искусства', 'Shounen': 'сёнен', 'Swordplay': 'мечи', 'Parody': 'пародия', 'Slapstick': 'слэпстик', 'Satire': 'сатира',
    'Surreal Comedy': 'абсурд', 'Philosophy': 'философия', 'Unreliable Narrator': 'ненадёжный рассказчик', 'Time Manipulation': 'время',
    'Detective': 'детектив', 'Crime': 'преступления', 'Survival': 'выживание', 'Death Game': 'игра на смерть', 'Gore': 'жестокость',
    'Love Triangle': 'любовный треугольник', 'School': 'школа', 'Travel': 'путешествие', 'Magic': 'магия', 'Dragons': 'драконы',
    'Isekai': 'исекай', 'Reincarnation': 'перерождение', 'Space': 'космос', 'Cyberpunk': 'киберпанк', 'Robots': 'роботы', 'Dystopian': 'антиутопия',
    'Team Sports': 'командный спорт', 'Primarily Adult Cast': 'взрослые герои', 'Workplace': 'работа', 'Band': 'группа', 'Idol': 'айдолы',
    'School Club': 'школьный клуб', 'Revenge': 'месть', 'Anti-Hero': 'антигерой', 'Historical': 'история', 'Samurai': 'самураи', 'Military': 'армия',
    'War': 'война', 'Vampire': 'вампиры', 'Demons': 'демоны', 'Ghost': 'призраки', 'Youkai': 'ёкаи', 'Seinen': 'сэйнэн', 'Ensemble Cast': 'много героев'
  };
  const PRESETS = [
    ['☕', L('Уютно и спокойно', 'Cozy and calm'), L('хочу что-то уютное и спокойное, расслабиться', 'something cozy and calm to relax')],
    ['😭', L('Хочу поплакать', 'I want to cry'), L('хочу поплакать, трогательное и грустное', 'I want to cry, sad and touching')],
    ['🔥', L('Адреналин', 'Adrenaline'), L('экшен, драки, эпично и хайпово', 'action, fights, epic hype')],
    ['😂', L('Поржать', 'Laugh'), L('что-то смешное, поржать', 'something funny to laugh at')],
    ['🧠', L('Мозголомка', 'Mind-bending'), L('психологическое, с неожиданными поворотами, заставит думать', 'psychological with twists that make you think')],
    ['💘', L('Романтика', 'Romance'), L('романтика, милое, бабочки в животе', 'romance, cute, butterflies')],
    ['🌑', L('Мрачно', 'Dark'), L('мрачное, жестокое, взрослое', 'dark, brutal, mature')],
    ['🗺️', L('Приключение', 'Adventure'), L('эпичное приключение в фэнтези мире', 'epic fantasy adventure')],
    ['🌙', L('Короткое на вечер', 'Short for tonight'), L('короткое на один вечер', 'short, for one evening')],
    ['✨', L('Вдохновиться', 'Get inspired'), L('вдохновляющее, про мечту и цель', 'inspiring, about dreams and goals')]
  ];

  /* ---------- Разбор текста ---------- */
  function parse(text, opts) {
    const low = ' ' + String(text || '').toLowerCase().replace(/ё/g, 'е') + ' ';
    const words = low.split(/[^a-zа-я0-9]+/).filter(Boolean);
    const want = { g: {}, t: {}, neg: { g: {}, t: {} }, labels: [], negLabels: [], minScore: 0 };
    VIBES.forEach(v => {
      let hit = false, negHit = false;
      v.k.forEach(k => {
        const kk = k.replace(/ё/g, 'е');
        let idx = -1;
        if (kk.includes(' ')) idx = low.indexOf(' ' + kk);
        else { const w = words.findIndex(x => x.startsWith(kk)); if (w >= 0) idx = low.search(new RegExp('(^|[^a-zа-я])' + kk)); }
        if (idx < 0) return;
        if (NEG.test(low.slice(Math.max(0, idx - 12), idx + 1))) negHit = true; else hit = true;
      });
      if (hit) {
        v.g.forEach(g => { want.g[g] = (want.g[g] || 0) + 1; });
        v.t.forEach((t, i) => { want.t[t] = (want.t[t] || 0) + (i === 0 ? 1.4 : 1); });
        if (v.minScore) want.minScore = Math.max(want.minScore, v.minScore);
        want.labels.push(L(v.ru, v.en));
      } else if (negHit) {
        v.g.forEach(g => { want.neg.g[g] = 1; });
        v.t.forEach(t => { want.neg.t[t] = 1; });
        want.negLabels.push(L(v.nr || v.ru, v.ne || v.en));
      }
    });
    // длина и время
    const has = re => re.test(low);
    if (opts.short || has(/коротк|на вечер|один вечер|быстр|мини|short|quick|tonight|one evening/)) { want.short = true; want.labels.push(L('коротко', 'short')); }
    if (opts.movie || has(/фильм|полнометраж|movie|film/)) { want.movie = true; want.labels.push(L('фильм', 'movie')); }
    if (has(/длинн|надолго|много серий|бесконеч|long|lots of episodes/)) { want.long = true; want.labels.push(L('надолго', 'long')); }
    if (opts.fresh || has(/нов(ое|ые|ый|енькое)|свеж|последн|недавн|new|recent|fresh/)) { want.fresh = true; want.labels.push(L('свежее', 'recent')); }
    if (has(/стар(ое|ые|ый|енькое)|классик|олдскул|90|old|classic|retro/)) { want.old = true; want.labels.push(L('классика', 'classic')); }
    if (has(/популяр|известн|хит|popular|famous/)) want.popular = true;
    if (has(/недооцен|малоизвест|необычн|скрыт|hidden gem|underrated|obscure/)) { want.hidden = true; want.labels.push(L('малоизвестное', 'hidden gem')); }
    // ничего не понятно — ориентируемся на вкусы из списка
    if (!Object.keys(want.g).length && !Object.keys(want.t).length && !want.minScore) want.taste = true;
    return want;
  }

  /* ---------- Подбор ---------- */
  const Q_MOOD = `query($g:[String],$t:[String],$f:[MediaFormat],$el:Int,$eg:Int,$sg:FuzzyDateInt,$sl:FuzzyDateInt,$ms:Int,$p:Int,$s:[MediaSort]){
    Page(page:$p,perPage:40){media(type:ANIME,isAdult:false,genre_in:$g,tag_in:$t,format_in:$f,episodes_lesser:$el,episodes_greater:$eg,
      startDate_greater:$sg,startDate_lesser:$sl,averageScore_greater:$ms,sort:$s){${MEDIA_DESC} tags{name rank isMediaSpoiler}}}}`;
  function tasteGenres() {
    const acc = {};
    Object.values(state.items).forEach(it => {
      const w = (it.score ? it.score / 5 : 1) * (it.status === 'completed' ? 1.4 : 1);
      (it.genres || []).forEach(g => { acc[g] = (acc[g] || 0) + w; });
    });
    return acc;
  }
  async function pick(text, opts) {
    const w = parse(text, opts);
    const taste = tasteGenres();
    const topTaste = Object.entries(taste).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]);
    const topG = Object.entries(w.g).sort((a, b) => b[1] - a[1]).map(x => x[0]).slice(0, 3);
    const topT = Object.entries(w.t).sort((a, b) => b[1] - a[1]).map(x => x[0]).slice(0, 4);
    const base = {
      f: w.movie ? ['MOVIE'] : ['TV', 'ONA', 'MOVIE', 'OVA'],
      el: w.short && !w.movie ? 14 : null,
      eg: w.long ? 40 : null,
      sg: w.fresh ? (new Date().getFullYear() - 3) * 10000 : null,
      sl: w.old ? 20100000 : null,
      ms: Math.max(w.minScore || 0, w.hidden ? 68 : 64),
      s: w.hidden ? ['SCORE_DESC'] : ['POPULARITY_DESC']
    };
    const jobs = [];
    const page = 1 + Math.floor(Math.random() * (w.popular ? 1 : 2));
    if (topG.length) jobs.push(gql(Q_MOOD, Object.assign({}, base, { g: topG.slice(0, 2), p: page })));
    if (topT.length) jobs.push(gql(Q_MOOD, Object.assign({}, base, { t: topT, p: 1 })));
    if (w.taste || (!topG.length && !topT.length)) jobs.push(gql(Q_MOOD, Object.assign({}, base, { g: topTaste.length ? topTaste.slice(0, 2) : null, p: page, s: ['SCORE_DESC'] })));
    if (topG.length > 1) jobs.push(gql(Q_MOOD, Object.assign({}, base, { g: [topG[1]], p: 1, s: ['SCORE_DESC'] })));
    const res = await Promise.all(jobs.map(j => j.then(d => d.Page.media || []).catch(() => null)));
    if (res.every(r => r === null)) throw new Error('net');
    const all = new Map();
    res.forEach(list => (list || []).forEach(m => { if (m && !all.has(m.id)) all.set(m.id, m); }));
    const map = byAni();
    const seen = it => it && (it.status === 'completed' || it.status === 'watching' || it.status === 'dropped' || it.status === 'paused');
    const scored = [...all.values()].filter(m => !(opts.unseen && seen(map[m.id]))).map(m => {
      const tags = {};
      (m.tags || []).forEach(t => { if (!t.isMediaSpoiler) tags[t.name] = t.rank || 50; });
      let s = 0;
      const why = [];
      Object.entries(w.g).forEach(([g, k]) => { if ((m.genres || []).includes(g)) { s += 10 * k; why.push((GENRE[g] || {}).ru || g); } });
      Object.entries(w.t).forEach(([t, k]) => { if (tags[t]) { s += 16 * k * tags[t] / 100; if (tags[t] >= 55) why.push(L(TAG_RU[t] || t, t)); } });
      Object.keys(w.neg.g).forEach(g => { if ((m.genres || []).includes(g)) s -= 28; });
      Object.keys(w.neg.t).forEach(t => { if (tags[t] && tags[t] >= 40) s -= 22 * tags[t] / 100; });
      if (w.taste) (m.genres || []).forEach(g => { s += Math.min(6, (taste[g] || 0)); });
      s += (m.averageScore || 60) / 8 + Math.log10((m.popularity || 0) + 10) * (w.hidden ? 0.5 : 1.6);
      if (w.hidden) s -= Math.max(0, Math.log10((m.popularity || 0) + 10) - 4.6) * 6;
      if (map[m.id] && map[m.id].status === 'planned') s -= 3;
      s += Math.random() * 3;   // чуть случайности, чтобы «Ещё» давало новое
      return { m, s, why: [...new Set(why)].slice(0, 4) };
    }).sort((a, b) => b.s - a.s);
    // разнообразие: не больше одного сезона одной франшизы
    const picked = [], keys = new Set();
    for (const x of scored) {
      const k = SmartSearch.norm((x.m.title.romaji || '').split(/[:\s]/).slice(0, 2).join(' '));
      if (keys.has(k)) continue;
      keys.add(k); picked.push(x);
      if (picked.length >= 24) break;
    }
    rememberMedia(picked.map(x => x.m));
    enrichRu(picked.map(x => x.m)).then(ok => { if (ok && S) renderRes(); });
    return { w, list: picked };
  }

  /* ---------- Окно ---------- */
  let S = null; // { text, opts, loading, err, res, shown }
  function open() {
    S = S && S.res ? S : { text: '', chips: {}, opts: { unseen: true, short: false, movie: false, fresh: false }, loading: false, err: '', res: null, shown: 0 };
    openSheet(html());
    const sh = document.querySelector('#sheetWrap .sheet');
    if (sh) sh.classList.add('mood-sheet');
    if (!S.res) setTimeout(() => { const t = $('#moodText'); if (t) t.focus(); }, 250);
  }
  function html() {
    const o = S.opts;
    const tog = (k, label) => `<button type="button" class="mood-opt" data-mood-opt="${k}" aria-pressed="${!!o[k]}">${label}</button>`;
    return `<div class="grab"></div>
      <h2>${T('Что хочется почувствовать?')}</h2>
      <p class="hint">${T('Опиши своими словами вайб — подберу пару тайтлов.')}</p>
      <textarea class="textarea mood-text" id="moodText" rows="3" maxlength="300" placeholder="${T('Например: хочу что-то уютное, без драмы, чтобы отдохнуть после работы')}">${esc(S.text)}</textarea>
      <div class="mood-chips">${PRESETS.map((p, i) => `<button type="button" class="mood-chip${S.chips[i] ? ' on' : ''}" data-mood-chip="${i}"><span>${p[0]}</span>${esc(p[1])}</button>`).join('')}</div>
      <div class="mood-opts">${tog('unseen', T('Без того, что видел'))}${tog('short', T('До 13 серий'))}${tog('movie', T('Фильм'))}${tog('fresh', T('Последние 3 года'))}</div>
      <button type="button" class="btn grad block mood-go" data-mood="go" ${S.loading ? 'disabled' : ''}>${S.loading ? '<span class="spinner sm"></span>' : '✨'} ${T('Подобрать')}</button>
      <div id="moodRes" aria-live="polite">${resHTML()}</div>`;
  }
  function resHTML() {
    if (S.err) return `<p class="hint mood-err">${esc(S.err)}</p>`;
    if (!S.res) return '';
    const { w, list } = S.res;
    const shown = list.slice(S.shown, S.shown + 5);
    const understood = w.labels.length || w.negLabels.length
      ? `<div class="mood-got"><span>${T('Понял:')}</span>${w.labels.map(l => `<i>${esc(l)}</i>`).join('')}${w.negLabels.map(l => `<i class="no">${T('без')} ${esc(l)}</i>`).join('')}</div>`
      : `<div class="mood-got"><span>${T('Не нашёл ключевых слов — подбираю по твоему списку и рейтингу.')}</span></div>`;
    if (!shown.length) return understood + `<p class="hint">${T('Больше вариантов нет — попробуй описать иначе.')}</p>`;
    const map = byAni();
    return understood + `<div class="mood-list">${shown.map((x, i) => {
      const m = x.m, t = mediaTitle(m), it = map[m.id];
      const meta = [FORMAT[m.format] || '', m.episodes ? m.episodes + T(' эп.') : '', m.seasonYear || ''].filter(Boolean).join(' · ');
      const desc = (ruD(m.idMal) || stripHtml(m.description) || '').slice(0, 150);
      return `<article class="mood-card rise" style="--i:${i};--c:${esc((m.coverImage && m.coverImage.color) || hueColor(t))}">
        <button type="button" class="mood-cov" data-action="open" data-ani="${m.id}" aria-label="${esc(t)}">${mediaCover(m) ? `<img src="${esc(mediaCover(m))}" alt="" loading="lazy">` : ''}${m.averageScore ? `<span class="mood-score">★ ${(m.averageScore / 10).toFixed(1)}</span>` : ''}</button>
        <div class="mood-info">
          <button type="button" class="mood-title" data-action="open" data-ani="${m.id}">${esc(t)}</button>
          <small>${esc(meta)}</small>
          ${x.why.length ? `<div class="mood-why">${x.why.map(y => `<i>${esc(y)}</i>`).join('')}</div>` : ''}
          ${desc ? `<p>${esc(desc)}${desc.length >= 150 ? '…' : ''}</p>` : ''}
          <div class="mood-act">
            ${it ? `<span class="mood-in">${esc(ST[it.status].label)}</span>` : `<button type="button" class="btn small grad" data-mood-add="${m.id}">${ICON.plus}${T('В планы')}</button>`}
            ${Watch.btnHTML(it || m, 'small')}
          </div>
        </div></article>`;
    }).join('')}</div>
    ${S.shown + 5 < list.length ? `<button type="button" class="btn line block" data-mood="more">${T('Ещё варианты')}</button>` : ''}`;
  }
  function renderRes() { const r = $('#moodRes'); if (r && S) r.innerHTML = resHTML(); }
  function rerender() { const sh = document.querySelector('#sheetWrap .sheet.mood-sheet'); if (sh && S) { const ta = $('#moodText'); if (ta) S.text = ta.value; sh.classList.add('no-anim'); sh.innerHTML = html(); } }

  async function go() {
    const ta = $('#moodText');
    S.text = ta ? ta.value : S.text;
    const chipText = Object.keys(S.chips).filter(i => S.chips[i]).map(i => PRESETS[i][2]).join(', ');
    const text = [S.text, chipText].filter(Boolean).join(', ');
    S.loading = true; S.err = ''; rerender();
    buzz(12);
    try { S.res = await pick(text, S.opts); S.shown = 0; if (typeof Ach !== 'undefined') Ach.bump('mood'); }
    catch (e) { S.err = T('Нет связи с AniList. Попробуй позже'); S.res = null; }
    S.loading = false;
    rerender();
    const r = $('#moodRes');
    if (r && S.res) setTimeout(() => r.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }), 60);
  }
  document.addEventListener('click', e => {
    if (!S) return;
    const c = e.target.closest('[data-mood-chip]');
    if (c) { const i = c.dataset.moodChip; S.chips[i] = !S.chips[i]; c.classList.toggle('on', !!S.chips[i]); buzz(6); return; }
    const o = e.target.closest('[data-mood-opt]');
    if (o) { const k = o.dataset.moodOpt; S.opts[k] = !S.opts[k]; o.setAttribute('aria-pressed', !!S.opts[k]); buzz(6); return; }
    const a = e.target.closest('[data-mood-add]');
    if (a) {
      const m = ui.media[+a.dataset.moodAdd];
      if (m && !byAni()[m.id]) { addToList(m, 'planned'); toast(T('Добавлено в «В планах»')); refreshAfterChange(); renderRes(); }
      return;
    }
    const b = e.target.closest('[data-mood]');
    if (!b) return;
    if (b.dataset.mood === 'go') go();
    else if (b.dataset.mood === 'more') { S.shown += 5; buzz(8); renderRes(); const r = $('#moodRes'); if (r) r.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); }
  });
  document.addEventListener('keydown', e => { if (S && e.target.id === 'moodText' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } });

  return { open, parse, pick };
})();
