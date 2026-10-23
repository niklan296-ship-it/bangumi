'use strict';
/* Бангуми — аниме-список, расписание и план просмотра.
   Данные пользователя живут на телефоне (IndexedDB). Тайтлы и даты серий — AniList,
   русские названия и описания — Shikimori (если доступен). */

/* ================= Константы ================= */
const STATUSES = [
  { id: 'watching', label: 'Смотрю' },
  { id: 'planned', label: 'В планах' },
  { id: 'paused', label: 'Отложено' },
  { id: 'completed', label: 'Просмотрено' },
  { id: 'dropped', label: 'Брошено' }
];
const ST = Object.fromEntries(STATUSES.map(s => [s.id, s]));
const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const DAYS_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const DAYS_DAT = ['понедельникам', 'вторникам', 'средам', 'четвергам', 'пятницам', 'субботам', 'воскресеньям'];
const DAYS_EVERY = ['каждый понедельник', 'каждый вторник', 'каждую среду', 'каждый четверг', 'каждую пятницу', 'каждую субботу', 'каждое воскресенье'];
const KANJI = ['月', '火', '水', '木', '金', '土', '日'];
const FORMAT = { TV: 'TV', TV_SHORT: 'TV-короткий', MOVIE: 'Фильм', SPECIAL: 'Спешл', OVA: 'OVA', ONA: 'ONA', MUSIC: 'Клип' };
const AIR = { RELEASING: 'Выходит', FINISHED: 'Завершён', NOT_YET_RELEASED: 'Анонс', CANCELLED: 'Отменён', HIATUS: 'Перерыв' };
const SEASON_RU = { WINTER: 'Зима', SPRING: 'Весна', SUMMER: 'Лето', FALL: 'Осень' };
const SOURCE_RU = { ORIGINAL: 'Оригинал', MANGA: 'Манга', LIGHT_NOVEL: 'Ранобэ', WEB_NOVEL: 'Веб-новелла', NOVEL: 'Роман', VISUAL_NOVEL: 'Визуальная новелла', VIDEO_GAME: 'Игра', GAME: 'Игра', WEB_MANGA: 'Веб-манга', OTHER: 'Другое' };
const TABS = { home: 'Главная', schedule: 'Расписание', search: 'Поиск', list: 'Мой список', profile: 'Профиль' };
const GENRES = [
  ['Action', 'Экшен', '#FF5E5B'], ['Fantasy', 'Фэнтези', '#7C9DFF'], ['Romance', 'Романтика', '#FF6FAE'],
  ['Comedy', 'Комедия', '#FFC23D'], ['Slice of Life', 'Повседневность', '#9BE15D'], ['Drama', 'Драма', '#B18CFF'],
  ['Adventure', 'Приключения', '#FF9F43'], ['Supernatural', 'Сверхъестественное', '#8E7CFF'], ['Mystery', 'Детектив', '#5AC8FA'],
  ['Psychological', 'Психология', '#E056FD'], ['Sci-Fi', 'Фантастика', '#3DDC97'], ['Sports', 'Спорт', '#FF7A45'],
  ['Thriller', 'Триллер', '#FF4757'], ['Horror', 'Ужасы', '#C44569'], ['Mecha', 'Меха', '#4CC9F0'],
  ['Music', 'Музыка', '#F72585'], ['Mahou Shoujo', 'Махо-сёдзё', '#FF9CEE'], ['Ecchi', 'Этти', '#FF8FB1']
];
const GENRE = Object.fromEntries(GENRES.map(g => [g[0], { ru: g[1], c: g[2] }]));
const QUICK_GENRES = GENRES.filter(g => g[0] !== 'Ecchi' && g[0] !== 'Mahou Shoujo');

const MEDIA_DESC = MEDIA_FIELDS + ' description(asHtml:false)';
const LITE = 'id idMal title{romaji english native} coverImage{extraLarge large color} format seasonYear episodes status averageScore nextAiringEpisode{episode airingAt}';
const Q_SEARCH = `query($q:String){Page(perPage:30){media(search:$q,type:ANIME,sort:SEARCH_MATCH,isAdult:false){${MEDIA_DESC}}}}`;
const Q_SEASON = `query($s:MediaSeason,$y:Int){Page(perPage:30){media(season:$s,seasonYear:$y,type:ANIME,sort:POPULARITY_DESC,isAdult:false){${MEDIA_DESC}}}}`;
const Q_TREND = `query{Page(perPage:20){media(type:ANIME,sort:TRENDING_DESC,isAdult:false){${MEDIA_DESC}}}}`;
const Q_GENRE = `query($g:String){Page(perPage:30){media(genre:$g,type:ANIME,sort:POPULARITY_DESC,isAdult:false){${MEDIA_DESC}}}}`;
const Q_BY_IDS = `query($ids:[Int]){Page(perPage:50){media(id_in:$ids){${MEDIA_FIELDS}}}}`;
const Q_BY_MAL = `query($ids:[Int]){Page(perPage:50){media(idMal_in:$ids,type:ANIME){${MEDIA_DESC}}}}`;
const Q_DETAIL = `query($id:Int){Media(id:$id){${MEDIA_DESC} source studios(isMain:true){nodes{name}}
  startDate{year month day} recommendations(perPage:12,sort:RATING_DESC){nodes{mediaRecommendation{${LITE}}}}}}`;
const SHIKI = ['https://shikimori.io', 'https://shikimori.one'];

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ================= Состояние ================= */
let state = defaultState();
const ui = {
  tab: 'home', animate: true,
  weekOffset: 0, selDay: dayIndexMon(new Date()), weekAir: {}, weekLoading: false, weekError: false,
  listFilter: 'watching', timePeriod: 'month', timeAll: false,
  query: '', results: null, searching: false, searchError: null, searchToken: 0,
  genre: null, genreRes: {}, genreLoading: false,
  season: null, seasonError: false, seasonLoading: false,
  media: {}, detailStack: [], overlays: [], detailFull: {},
  sheet: null, confirmDelete: false, deferredInstall: null, syncing: false, heroIds: null
};

function defaultState() {
  return {
    v: 2, items: {}, airCache: {}, lastSync: 0, planLog: {}, activity: {}, watchLog: {}, gone: {}, shareMap: {}, ru: {}, trend: null, trendAt: 0,
    settings: { titleLang: 'russian', theme: 'system', notifyEpisodes: false, notifyPlan: false, listView: 'grid', listSort: 'recent', edgeGesture: true, glass: true, perf: 'auto', skin: 'cinema' }
  };
}

/* ================= Утилиты ================= */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nowSec = () => Math.floor(Date.now() / 1000);
const pad = n => String(n).padStart(2, '0');
const pl = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c; };
const sers = n => n + ' ' + pl(n, 'серия', 'серии', 'серий');
const title = it => itemTitle(it, state.settings.titleLang);
const activeStatus = s => s === 'watching' || s === 'planned' || s === 'paused';
const initial = s => (String(s || '?').trim().charAt(0) || '?').toUpperCase();
const ICON = {
  check: '<svg class="ico" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  back: '<svg class="ico" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  next: '<svg class="ico" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  ext: '<svg class="ico" viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  plus: '<svg class="ico" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  info: '<svg class="ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.01"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>',
  grid: '<svg class="ico" viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>',
  rows: '<svg class="ico" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  map: '<svg class="ico" viewBox="0 0 24 24"><rect x="2.5" y="9.5" width="6" height="5" rx="1.5"/><path d="M8.5 12c3.5 0 3-6.5 6.5-6.5h6M8.5 12h12.5M8.5 12c3.5 0 3 6.5 6.5 6.5h6"/></svg>',
  x: '<svg class="ico" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  bell: '<svg class="ico" viewBox="0 0 24 24"><path d="M6 17V11a6 6 0 1 1 12 0v6l1.5 2h-15zM10 21h4"/></svg>',
  trash: '<svg class="ico" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/></svg>'
};

function fmtTime(sec) { const d = new Date(sec * 1000); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function fmtJST(sec) {
  try { return new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' }).format(new Date(sec * 1000)); }
  catch (e) { return ''; }
}
const monShort = d => new Intl.DateTimeFormat('ru-RU', { month: 'short' }).format(d).replace('.', '');
function fmtDay(sec) {
  const d = new Date(sec * 1000), t = new Date(); t.setHours(0, 0, 0, 0);
  const dd = new Date(d); dd.setHours(0, 0, 0, 0);
  const diff = Math.round((dd - t) / 86400000);
  if (diff === 0) return 'сегодня';
  if (diff === 1) return 'завтра';
  return DAYS[dayIndexMon(d)].toLowerCase() + ', ' + d.getDate() + ' ' + monShort(d);
}
function until(sec) {
  let s = Math.max(0, sec - nowSec());
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60);
  if (d > 0) return d + ' д ' + h + ' ч';
  if (h > 0) return h + ' ч ' + m + ' мин';
  return Math.max(1, m) + ' мин';
}
function weekStart(offset) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - dayIndexMon(d) + offset * 7);
  return d;
}
function weekLabel(start) {
  const end = new Date(start); end.setDate(end.getDate() + 6);
  if (start.getMonth() === end.getMonth()) return start.getDate() + '–' + end.getDate() + ' ' + monShort(end);
  return start.getDate() + ' ' + monShort(start) + ' – ' + end.getDate() + ' ' + monShort(end);
}
function currentSeason() {
  const d = new Date(), m = d.getMonth() + 1, y = d.getFullYear();
  if (m === 12) return { s: 'WINTER', y: y + 1 };
  if (m <= 2) return { s: 'WINTER', y };
  if (m <= 5) return { s: 'SPRING', y };
  if (m <= 8) return { s: 'SUMMER', y };
  return { s: 'FALL', y };
}
function stripHtml(s) {
  return String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'").replace(/\n{3,}/g, '\n\n').trim();
}
function cleanBB(s) {
  return String(s || '').replace(/\[\[|\]\]/g, '').replace(/\[\/?[a-z_]+(?:=[^\]]*)?\]/gi, '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 1600);
}
function computeAired(m) {
  if (!m) return null;
  if (m.status === 'FINISHED') return m.episodes || null;
  if (m.nextAiringEpisode) return m.nextAiringEpisode.episode - 1;
  if (m.status === 'NOT_YET_RELEASED') return 0;
  return m.episodes || null;
}
function newEps(it) { return it.aired == null ? 0 : Math.max(0, it.aired - (it.progress || 0)); }
function canInc(it) { return activeStatus(it.status) && (!it.total || it.progress < it.total); }
function hueColor(s) { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 360; return `hsl(${h} 62% 52%)`; }
function byAni() { const m = {}; Object.values(state.items).forEach(i => { if (i.anilistId) m[i.anilistId] = i; }); return m; }
const ruN = id => (id && state.ru[id] && state.ru[id].n) || '';
const ruD = id => (id && state.ru[id] && state.ru[id].d) || '';
function mediaTitle(m) { return itemTitle({ titles: Object.assign({}, m.title, { russian: ruN(m.idMal) }) }, state.settings.titleLang); }
function mediaCover(m, big) { const c = m.coverImage || {}; return (big ? c.extraLarge || c.large : c.large || c.extraLarge) || ''; }
/* Отдельное приложение (APK) даёт мост BangumiNative; в Chrome его нет */
const NATIVE = window.BangumiNative || null;
function buzz(ms) {
  try {
    if (NATIVE) { NATIVE.vibrate(JSON.stringify(Array.isArray(ms) ? ms : [ms || 12])); return; }
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    if (navigator.vibrate) navigator.vibrate(ms || 12);
  } catch (e) { /* нет вибро */ }
}

/* ================= Хранилище ================= */
let saveTimer = null;
function save() { ui.ver = (ui.ver || 0) + 1; clearTimeout(saveTimer); saveTimer = setTimeout(flush, 250); }
/* Слабый телефон: меньше размытия и тяжёлых эффектов, внешне почти то же самое */
function weakDevice() {
  const mem = navigator.deviceMemory, cores = navigator.hardwareConcurrency;
  return (mem && mem <= 4) || (cores && cores <= 4);
}
/* ---------- Интерфейсы ---------- */
const SKINS = {
  cinema: { name: 'Кинотеатр', sub: 'Постеры, свет и стекло', theme: ['#0B0B12', '#F3F3F6'], font: null,
    fx: ['#FFC23D', '#FF7A45', '#FF4D8D', '#7C9DFF', '#3DDC97', '#B18CFF', '#ffffff'] },
  manga: { name: 'Манга', sub: 'Тушь, бумага и панели', theme: ['#121212', '#EFEEEA'], font: 'Dela+Gothic+One',
    fx: ['#141414', '#E0262E', '#141414', '#E0262E', '#FFFFFF', '#8C8A84'] },
  quest: { name: 'Квест', sub: 'Пиксели, уровни и опыт', theme: ['#17132E', '#17132E'], font: 'Press+Start+2P',
    fx: ['#FFD23F', '#FF3E9A', '#3DE0FF', '#7CF06B', '#C58BFF'] }
};
const skin = () => (SKINS[state.settings.skin] ? state.settings.skin : 'cinema');
const skinFx = () => SKINS[skin()].fx;
const loadedFonts = {};
function applySkin() {
  const k = skin();
  document.documentElement.dataset.skin = k;
  ensureFont(k);
}
function ensureFont(k) {
  const f = SKINS[k] && SKINS[k].font;
  if (f && !loadedFonts[f]) {
    loadedFonts[f] = true;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = `https://fonts.googleapis.com/css2?family=${f}&display=swap`;
    document.head.appendChild(l);
  }
}
/* Уровни для «Квеста»: уровень L начинается с 3·(L−1)² серий */
function questLevel(eps) {
  const L = Math.floor(Math.sqrt(eps / 3)) + 1;
  const from = 3 * (L - 1) * (L - 1), to = 3 * L * L;
  return { L, from, to, into: eps - from, need: to - from };
}
const totalEps = () => Object.values(state.items).reduce((s, i) => s + (i.progress || 0), 0);
function isLite() { return document.documentElement.classList.contains('lite'); }
function applyPerf() {
  const p = state.settings.perf || 'auto';
  document.documentElement.classList.toggle('lite', p === 'fast' || (p === 'auto' && weakDevice()));
}
async function flush() {
  clearTimeout(saveTimer);
  try { await DB.set('state', state); }
  catch (e) { try { localStorage.setItem('bangumi-state', JSON.stringify(state)); } catch (e2) { /* нет места */ } }
  scheduleNative();
}

/* Точные уведомления в APK: Android сам покажет их в нужную минуту, даже если Бангуми закрыт */
let nativeSig = '';
function scheduleNative() {
  if (!NATIVE) return;
  try {
    const st = state.settings, list = [];
    const pref = st.titleLang || 'romaji';
    const now = Date.now();
    if (st.notifyEpisodes) {
      Object.values(state.items).forEach(it => {
        if (!it.anilistId || !it.nextEp || !(it.status === 'watching' || it.status === 'planned')) return;
        // следующая серия точно по AniList, ещё две — по недельному шагу (уточнятся при следующем открытии)
        for (let k = 0; k < 3; k++) {
          const ep = it.nextEp.episode + k;
          if (k && it.total && ep > it.total) break;
          const at = (it.nextEp.airingAt + k * 7 * 86400) * 1000;
          if (at > now) list.push({ id: 1000000 + (it.anilistId % 300000) * 3 + k, at, title: 'Вышла ' + ep + ' серия', body: itemTitle(it, pref) });
        }
      });
    }
    if (st.notifyPlan) {
      for (let k = 0; k < 7; k++) {
        const d = new Date(); d.setDate(d.getDate() + k);
        const di = dayIndexMon(d);
        const planned = Object.values(state.items).filter(i => i.plan && Array.isArray(i.plan.days) && i.plan.days.includes(di) && (i.status === 'watching' || i.status === 'planned'));
        if (!planned.length) continue;
        const mins = planned.reduce((m, i) => { const t = i.plan.time ? i.plan.time.split(':') : null; return Math.min(m, t ? (+t[0]) * 60 + (+t[1]) : 19 * 60); }, 24 * 60);
        d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
        if (d.getTime() <= now) continue;
        const body = planned.slice(0, 4).map(i => itemTitle(i, pref) + ' — ' + (i.plan.eps || 1) + ' сер.' + (i.plan.time ? ' в ' + i.plan.time : '')).join('\n');
        list.push({ id: 900 + k, at: d.getTime(), title: 'Сегодня по плану', body });
      }
    }
    const json = JSON.stringify(list);
    if (json === nativeSig) return;
    nativeSig = json;
    NATIVE.schedule(json);
  } catch (e) { /* без моста */ }
}
async function load() {
  let s = null;
  try { s = await DB.get('state'); } catch (e) { /* IndexedDB недоступна */ }
  if (!s) { try { s = JSON.parse(localStorage.getItem('bangumi-state') || 'null'); } catch (e) { s = null; } }
  if (s && s.items) {
    const d = defaultState();
    const oldV = s.v || 1;
    state = Object.assign(d, s, { settings: Object.assign(d.settings, s.settings || {}) });
    ['airCache', 'planLog', 'activity', 'watchLog', 'gone', 'shareMap', 'ru'].forEach(k => { state[k] = state[k] || {}; });
    if (oldV < 2) { state.settings.titleLang = 'russian'; state.v = 2; }
  }
  Object.entries(state.airCache).forEach(([k, v]) => { ui.weekAir[k] = v.list; });
  if (state.trend) rememberMedia(state.trend);
}

/* ================= Тема ================= */
function applyTheme() {
  applySkin();
  document.documentElement.classList.toggle('glass', state.settings.glass !== false && skin() === 'cinema');
  applyPerf();
  const t = skin() === 'quest' ? 'dark' : state.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  else document.documentElement.removeAttribute('data-theme');
  const dark = t === 'dark' || (t === 'system' && !matchMedia('(prefers-color-scheme: light)').matches);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', SKINS[skin()].theme[dark ? 0 : 1]);
  if (NATIVE) { try { NATIVE.setBars(SKINS[skin()].theme[dark ? 0 : 1], !dark); } catch (e) { /* старая версия APK */ } }
}

/* ================= Источники данных ================= */
function rememberMedia(list) {
  (list || []).forEach(m => { if (m && m.id) ui.media[m.id] = Object.assign({}, ui.media[m.id] || {}, m); });
}

let shikiDownUntil = 0;
async function shiki(query) {
  if (Date.now() < shikiDownUntil) throw new Error('shiki down');
  for (const host of SHIKI) {
    try {
      const ctl = new AbortController();
      const tm = setTimeout(() => ctl.abort(), 7000);
      const r = await fetch(host + '/api/graphql', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query }), signal: ctl.signal
      });
      clearTimeout(tm);
      if (!r.ok) continue;
      const j = await r.json();
      if (j && j.data) return j.data;
    } catch (e) { /* пробуем следующий адрес */ }
  }
  shikiDownUntil = Date.now() + 10 * 60 * 1000;
  throw new Error('shiki unavailable');
}
function storeRu(a) { if (a && a.malId) state.ru[+a.malId] = { n: a.russian || '', d: cleanBB(a.description || '') }; }
function trimRu() {
  const keys = Object.keys(state.ru);
  if (keys.length > 900) keys.slice(0, keys.length - 900).forEach(k => delete state.ru[k]);
}
async function enrichRu(list) {
  const ids = [...new Set((list || []).map(m => m && m.idMal).filter(id => id && !(id in state.ru)))];
  if (!ids.length) return false;
  try {
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      const d = await shiki(`{animes(ids:"${chunk.join(',')}",limit:50){malId russian description}}`);
      const got = new Set();
      (d.animes || []).forEach(a => { storeRu(a); got.add(+a.malId); });
      chunk.forEach(id => { if (!got.has(id)) state.ru[id] = { n: '', d: '' }; });
    }
    trimRu();
    Object.values(state.items).forEach(it => { if (it.idMal && ruN(it.idMal)) { it.titles = it.titles || {}; it.titles.russian = ruN(it.idMal); } });
    save();
    return true;
  } catch (e) { return false; }
}
async function searchRu(q) {
  const d = await shiki(`{animes(search:${JSON.stringify(q)},limit:25){malId russian description}}`);
  const arr = d.animes || [];
  arr.forEach(storeRu);
  const ids = arr.map(a => +a.malId).filter(Boolean);
  if (!ids.length) return [];
  const r = await gql(Q_BY_MAL, { ids });
  const byMal = {};
  (r.Page.media || []).forEach(m => { byMal[m.idMal] = m; });
  return ids.map(id => byMal[id]).filter(Boolean);
}

function itemFromMedia(m, status) {
  const t = Date.now();
  return {
    id: 'a' + m.id, anilistId: m.id, idMal: m.idMal || null,
    titles: Object.assign({}, m.title, { russian: ruN(m.idMal) || undefined }), synonyms: m.synonyms || [],
    cover: mediaCover(m), coverXL: mediaCover(m, true), banner: m.bannerImage || '', color: (m.coverImage && m.coverImage.color) || null,
    total: m.episodes || null, duration: m.duration || null, airStatus: m.status, format: m.format,
    season: m.season, seasonYear: m.seasonYear, siteUrl: m.siteUrl, genres: m.genres || [], avg: m.averageScore || null,
    nextEp: m.nextAiringEpisode || null, aired: computeAired(m),
    status, progress: 0, score: null, notes: '', customTitle: '',
    plan: { days: [], time: '', eps: 1 }, addedAt: t, updatedAt: t
  };
}
function updateFromMedia(it, m) {
  it.titles = Object.assign({}, m.title, { russian: ruN(m.idMal) || (it.titles && it.titles.russian) || undefined });
  it.idMal = m.idMal || it.idMal || null;
  it.cover = mediaCover(m) || it.cover; it.coverXL = mediaCover(m, true) || it.coverXL;
  it.banner = m.bannerImage || it.banner || ''; it.color = (m.coverImage && m.coverImage.color) || it.color || null;
  it.total = m.episodes || it.total || null; it.duration = m.duration || it.duration;
  it.airStatus = m.status; it.format = m.format; it.season = m.season; it.seasonYear = m.seasonYear;
  it.siteUrl = m.siteUrl; it.genres = m.genres || it.genres || []; it.avg = m.averageScore || it.avg || null;
  it.nextEp = m.nextAiringEpisode || null; it.aired = computeAired(m);
}

async function loadTrend(force) {
  if (!force && state.trend && Date.now() - state.trendAt < 6 * 3600 * 1000) return;
  try {
    const d = await gql(Q_TREND);
    state.trend = d.Page.media || [];
    state.trendAt = Date.now();
    rememberMedia(state.trend);
    save();
    enrichRu(state.trend).then(ok => { if (ok && ui.tab === 'home') renderHome(['hero', 'trend']); });
  } catch (e) { /* без сети */ }
}

async function syncAll(quiet) {
  if (ui.syncing) return;
  ui.syncing = true;
  if (ui.tab === 'profile') renderProfile();
  const ids = Object.values(state.items).filter(i => i.anilistId).map(i => i.anilistId);
  let ok = true;
  try {
    const map = byAni();
    for (let i = 0; i < ids.length; i += 50) {
      const d = await gql(Q_BY_IDS, { ids: ids.slice(i, i + 50) });
      (d.Page.media || []).forEach(m => { if (map[m.id]) updateFromMedia(map[m.id], m); });
    }
    state.lastSync = Date.now();
    ui.ver = (ui.ver || 0) + 1;
    await flush();
  } catch (e) { ok = false; }
  await Promise.all([
    loadTrend(),
    enrichRu(Object.values(state.items).map(i => ({ idMal: i.idMal }))),
    loadWeek(ui.weekOffset, true)
  ]);
  ui.syncing = false;
  if (ui.tab === 'home' && $('#homeBody')) { if (!ui.heroIds || ui.heroIds.length < 2) ui.heroIds = null; renderHome(['hero']); }
  if (!quiet) toast(ok ? 'Данные обновлены' : 'Нет связи с AniList. Попробуй позже');
  renderCurrent();
  if (ui.detailStack.length) renderDetailBlocks();
}

function scheduleIds() {
  return Object.values(state.items)
    .filter(i => i.anilistId && activeStatus(i.status) && i.airStatus !== 'FINISHED' && i.airStatus !== 'CANCELLED')
    .map(i => i.anilistId);
}
async function loadWeek(offset, force) {
  const start = weekStart(offset);
  const key = String(start.getTime() / 1000);
  const ids = scheduleIds();
  if (!ids.length) { ui.weekAir[key] = []; return; }
  const cached = state.airCache[key];
  if (!force && cached && Date.now() - cached.at < 3 * 3600 * 1000 && cached.ids === ids.join(',')) return;
  ui.weekLoading = true; ui.weekError = false;
  if (ui.tab === 'schedule') renderWeekbar();
  try {
    const from = start.getTime() / 1000 - 1;
    const list = await fetchSchedules(ids, from, from + 7 * 86400 + 1);
    ui.weekAir[key] = list;
    state.airCache[key] = { at: Date.now(), ids: ids.join(','), list };
    const keys = Object.keys(state.airCache).sort();
    while (keys.length > 4) delete state.airCache[keys.shift()];
    save();
  } catch (e) { ui.weekError = true; }
  ui.weekLoading = false;
  if (ui.tab === 'schedule') renderSchedule();
}

async function loadDetailMedia(aniId) {
  if (!aniId || ui.detailFull[aniId]) return;
  try {
    const d = await gql(Q_DETAIL, { id: aniId });
    const m = d.Media;
    ui.detailFull[aniId] = true;
    rememberMedia([m]);
    const recs = ((m.recommendations && m.recommendations.nodes) || []).map(n => n.mediaRecommendation).filter(Boolean);
    rememberMedia(recs);
    const it = byAni()[aniId];
    if (it) { updateFromMedia(it, m); save(); }
    await enrichRu([m].concat(recs));
    const cur = currentDetail();
    if (cur && (cur.aniId === aniId || (cur.itemId && state.items[cur.itemId] && state.items[cur.itemId].anilistId === aniId))) renderDetailBlocks(true);
  } catch (e) {
    const cur = currentDetail();
    if (cur) { const el = $('#dAbout'); if (el && !el.innerHTML.trim()) el.innerHTML = '<p class="hint">Описание появится, когда будет интернет.</p>'; }
  }
}

/* ================= Прогресс, план, активность ================= */
/* opts.log=false — не писать в историю по дням (отметка «уже смотрел раньше»).
   opts.max — писать в историю, только если за раз отмечено не больше max серий. opts.day — ключ дня для истории. */
function setProgress(it, val, opts) {
  opts = opts || {};
  val = Math.max(0, Math.round(val));
  if (it.total) val = Math.min(it.total, val);
  const delta = val - (it.progress || 0);
  if (!delta) return 0;
  const lvBefore = delta > 0 && skin() === 'quest' && opts.log !== false ? questLevel(totalEps()).L : 0;
  it.progress = val;
  if (lvBefore) {
    const lv = questLevel(totalEps()).L;
    if (lv > lvBefore) setTimeout(() => { celebrate(); toast('Новый уровень: ' + lv + '!', { icon: '<b style="font-size:13px">★</b>', ms: 4500 }); }, 900);
  }
  if (delta > 0 && (it.status === 'planned' || it.status === 'paused')) it.status = 'watching';
  const doLog = opts.log !== false && (opts.max == null || Math.abs(delta) <= opts.max);
  if (doLog) {
    const k = opts.day || dayKey(new Date());
    state.activity[k] = Math.max(0, (state.activity[k] || 0) + delta);
    const day = state.watchLog[k] = state.watchLog[k] || {};
    day[it.id] = Math.max(0, (day[it.id] || 0) + delta);
    if (!day[it.id]) delete day[it.id];
    trimWatchLog();
  }
  it.updatedAt = Date.now();
  save();
  return delta;
}
function trimWatchLog() {
  const limit = Date.now() - 420 * 86400000;
  Object.keys(state.watchLog).forEach(k => { if (keyTime(k) < limit) delete state.watchLog[k]; });
}
function fmtDur(mins) {
  mins = Math.round(mins);
  if (mins < 60) return mins + ' мин';
  const h = Math.floor(mins / 60), m = mins % 60;
  return h.toLocaleString('ru-RU') + ' ч' + (m ? ' ' + m + ' мин' : '');
}
function itemDur(id) {
  const it = state.items[id] || state.gone[id];
  return (it && (it.duration || it.d)) || 24;
}
function periodInfo(p) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const month = d => { const s = new Intl.DateTimeFormat('ru-RU', { month: 'long' }).format(d); return s.charAt(0).toUpperCase() + s.slice(1); };
  if (p === 'week') { const from = new Date(t); from.setDate(from.getDate() - 6); const to = new Date(t); to.setDate(to.getDate() + 1); return { from, to, label: 'Последние 7 дней' }; }
  if (p === 'month') return { from: new Date(t.getFullYear(), t.getMonth(), 1), to: new Date(t.getFullYear(), t.getMonth() + 1, 1), label: month(t) + ' ' + t.getFullYear() };
  if (p === 'prev') { const from = new Date(t.getFullYear(), t.getMonth() - 1, 1); return { from, to: new Date(t.getFullYear(), t.getMonth(), 1), label: month(from) + ' ' + from.getFullYear() }; }
  return { from: null, to: null, label: 'За всё время' };
}
/* Минуты по тайтлам за период: [{id, eps, mins}] по убыванию. */
function timeByTitle(p) {
  const acc = {};
  if (p === 'all') {
    Object.values(state.items).forEach(it => { if (it.progress) acc[it.id] = it.progress; });
  } else {
    const { from, to } = periodInfo(p);
    Object.entries(state.watchLog).forEach(([k, day]) => {
      const tm = keyTime(k);
      if (tm < from.getTime() || tm >= to.getTime()) return;
      Object.entries(day).forEach(([id, e]) => { acc[id] = (acc[id] || 0) + e; });
    });
  }
  return Object.entries(acc).filter(x => x[1] > 0).map(([id, eps]) => ({ id, eps, mins: eps * itemDur(id) })).sort((a, b) => b.mins - a.mins);
}
function minsForItem(id, p) {
  const r = timeByTitle(p).find(x => x.id === id);
  return r ? r.mins : 0;
}
function maybeComplete(it) {
  if (it.total && it.progress >= it.total && it.status !== 'completed') {
    celebrate();
    toast('Финал! Перенести в «Просмотрено»?', {
      action: 'Да', ms: 7000, fn: () => { it.status = 'completed'; it.updatedAt = Date.now(); save(); celebrate(); refreshAfterChange(); toast('«' + title(it) + '» — просмотрено'); }
    });
    return true;
  }
  return false;
}
function incEpisode(id, srcEl) {
  const it = state.items[id];
  if (!it || !canInc(it)) return;
  const before = { progress: it.progress, status: it.status };
  setProgress(it, (it.progress || 0) + 1);
  buzz(14);
  if (srcEl) { floatPlus(srcEl); srcEl.classList.remove('bump'); void srcEl.offsetWidth; srcEl.classList.add('bump'); }
  refreshAfterChange();
  if (!maybeComplete(it)) {
    toast('EP ' + it.progress + ' — ' + title(it), {
      action: 'Отменить', fn: () => { setProgress(it, before.progress); it.status = before.status; save(); refreshAfterChange(); }
    });
  }
}
function planFor(date) {
  const di = dayIndexMon(date), key = dayKey(date), log = state.planLog[key] || {};
  return Object.values(state.items)
    .filter(it => it.plan && it.plan.days && it.plan.days.includes(di) && ((it.status === 'watching' || it.status === 'planned') || log[it.id]))
    .sort((a, b) => (a.plan.time || '99').localeCompare(b.plan.time || '99') || title(a).localeCompare(title(b)));
}
function togglePlan(key, id, el) {
  const it = state.items[id];
  if (!it) return;
  state.planLog[key] = state.planLog[key] || {};
  const log = state.planLog[key];
  if (log[id]) {
    setProgress(it, (it.progress || 0) - (log[id].added || 0), { day: key });
    delete log[id];
    buzz(8);
  } else {
    const from = (it.progress || 0) + 1;
    const added = setProgress(it, (it.progress || 0) + (it.plan.eps || 1), { day: key });
    if (it.status === 'planned' || it.status === 'paused') it.status = 'watching';
    log[id] = { added, from, to: from + added - 1 };
    buzz(18);
    if (el) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); if (window.sparkle) sparkle(el, 12); }
  }
  const keys = Object.keys(state.planLog);
  if (keys.length > 70) keys.sort((a, b) => keyTime(a) - keyTime(b)).slice(0, keys.length - 70).forEach(k => delete state.planLog[k]);
  save();
  const date = keyDate(key);
  const list = planFor(date);
  const allDone = list.length && list.every(x => state.planLog[key] && state.planLog[key][x.id]);
  refreshAfterChange();
  if (log[id]) {
    const nb = document.querySelector(`.cbox[data-key="${key}"][data-id="${CSS.escape(id)}"]`);
    if (nb) nb.classList.add('pop');
  }
  if (log[id] && !maybeComplete(it)) {
    if (allDone) { celebrate(); toast('План на ' + (sameDay(date, new Date()) ? 'сегодня' : DAYS_FULL[dayIndexMon(date)].toLowerCase()) + ' выполнен!'); }
  }
}
function keyTime(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).getTime(); }
function keyDate(k) { return new Date(keyTime(k)); }
function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }

/* ================= Анимации ================= */
function floatPlus(el) {
  if (reduced) return;
  if (window.sparkle) sparkle(el, 8);
  const r = el.getBoundingClientRect();
  const s = document.createElement('span');
  s.className = 'float-plus'; s.textContent = skin() === 'quest' ? '+1 XP' : skin() === 'manga' ? 'ДОН!' : '+1';
  s.style.left = (r.left + r.width / 2) + 'px'; s.style.top = (r.top - 4) + 'px';
  document.body.appendChild(s);
  setTimeout(() => s.remove(), 950);
}
let confettiRun = 0;
function celebrate() {
  buzz([20, 40, 30]);
  if (reduced) return;
  const cv = $('#confetti'), ctx = cv.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const colors = skinFx();
  const P = [];
  const N = isLite() ? 70 : 150;
  for (let i = 0; i < N; i++) {
    const fromLeft = i % 2 === 0;
    P.push({
      x: fromLeft ? -10 : innerWidth + 10, y: innerHeight * (0.55 + Math.random() * 0.25),
      vx: (fromLeft ? 1 : -1) * (5 + Math.random() * 9), vy: -(11 + Math.random() * 10),
      w: 6 + Math.random() * 6, h: 8 + Math.random() * 8, r: Math.random() * 6, vr: (Math.random() - .5) * .4,
      c: colors[i % colors.length], shape: i % 5
    });
  }
  const id = ++confettiRun, t0 = performance.now();
  (function frame(t) {
    if (id !== confettiRun) return;
    const el = t - t0;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    P.forEach(p => {
      p.vy += 0.38; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.globalAlpha = Math.max(0, 1 - el / 2400);
      ctx.fillStyle = p.c;
      if (p.shape === 0) { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * (0.4 + 0.6 * Math.abs(Math.cos(p.r * 2))));
      ctx.restore();
    });
    if (el < 2400) requestAnimationFrame(frame); else ctx.clearRect(0, 0, innerWidth, innerHeight);
  })(t0);
}
function countUp(root) {
  (root || document).querySelectorAll('[data-count]').forEach(el => {
    const to = +el.dataset.count;
    if (reduced || !to) { el.textContent = to.toLocaleString('ru-RU'); return; }
    const t0 = performance.now(), dur = 1000;
    (function step(t) {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(to * e).toLocaleString('ru-RU');
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  });
}
function animateRings(root) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    (root || document).querySelectorAll('.ring .fg[data-off]').forEach(c => { c.style.strokeDashoffset = c.dataset.off; });
  }));
}

/* ================= Компоненты ================= */
function imgTag(src, cls) {
  return src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" class="${cls || ''}" onload="this.classList.add('loaded')" onerror="this.remove()">` : '';
}
function thumbHTML(src, name, color, vt, cls) {
  return `<span class="${cls || 'thumb'}" style="--c:${esc(color)}"${vt ? ` data-vt="${esc(vt)}"` : ''}><span class="ph-art" style="font-size:17px">${esc(initial(name))}</span>${src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : ''}</span>`;
}
function ringHTML(frac, text, size) {
  const r = 20, C = 2 * Math.PI * r;
  const off = (C * (1 - Math.max(0, Math.min(1, frac)))).toFixed(1);
  return `<span class="ring"${size ? ` style="width:${size}px;height:${size}px"` : ''}><svg viewBox="0 0 46 46" aria-hidden="true"><circle class="bg" cx="23" cy="23" r="${r}"/><circle class="fg" cx="23" cy="23" r="${r}" stroke-dasharray="${C.toFixed(1)}" style="stroke-dashoffset:${C.toFixed(1)}" data-off="${off}"/></svg><span>${esc(text)}</span></span>`;
}
function cardFromItem(it) {
  return { key: it.id, item: it, aniId: it.anilistId, title: title(it), cover: it.cover, coverXL: it.coverXL || it.cover, color: it.color || hueColor(title(it)), next: it.nextEp, avg: it.avg, format: it.format, year: it.seasonYear, eps: it.total };
}
function cardFromMedia(m) {
  const it = byAni()[m.id];
  if (it) return cardFromItem(it);
  const t = mediaTitle(m);
  return { key: 'a' + m.id, item: null, aniId: m.id, title: t, cover: mediaCover(m), coverXL: mediaCover(m, true), color: (m.coverImage && m.coverImage.color) || hueColor(t), next: m.nextAiringEpisode, avg: m.averageScore, format: m.format, year: m.seasonYear, eps: m.episodes };
}
function openAttrs(c) { return c.item ? `data-item="${esc(c.item.id)}"` : `data-ani="${c.aniId}"`; }
function posterHTML(c, o) {
  o = o || {};
  const it = c.item, st = it && it.status;
  let b = '';
  if (it && o.badge !== false) b += `<span class="p-badge s-${st}" style="--st:var(--st-${st})"><span class="dot"></span>${esc(ST[st].label)}</span>`;
  if (it && activeStatus(st) && newEps(it) > 0) b += `<span class="p-new">+${newEps(it)}</span>`;
  if (o.plus && it && canInc(it)) b += `<button type="button" class="p-plus" data-action="inc" data-id="${esc(it.id)}" aria-label="Отметить серию ${it.progress + 1}">+1</button>`;
  else if (c.next && c.next.airingAt > nowSec() && o.air !== false) b += `<span class="p-air">EP ${c.next.episode} · ${DAYS[dayIndexMon(new Date(c.next.airingAt * 1000))]}</span>`;
  else if (c.avg) b += `<span class="p-score">★ ${(c.avg / 10).toFixed(1)}</span>`;
  if (it && it.progress && st !== 'completed') {
    const pct = it.total ? Math.min(100, it.progress / it.total * 100) : 60;
    b += `<span class="p-bar"><i style="width:${pct}%"></i></span>`;
  }
  const sub = o.sub != null ? o.sub : [FORMAT[c.format] || '', c.eps ? c.eps + ' эп.' : '', c.year || ''].filter(Boolean).join(' · ');
  return `<div class="poster ${o.cls || ''} rise" style="--i:${o.i || 0};--c:${esc(c.color)}" role="button" tabindex="0" data-action="open" ${openAttrs(c)} aria-label="${esc(c.title)}">
    <span class="poster-img" data-vt="${esc(c.key)}"><span class="ph-art">${esc(initial(c.title))}</span>${imgTag(c.cover)}${b}</span>
    <span class="poster-title">${esc(c.title)}</span>${sub ? `<span class="poster-sub">${esc(sub)}</span>` : ''}
  </div>`;
}
function skeletonPosters(n, grid) {
  return (grid ? '<div class="grid">' : '<div class="rail bleed">') + Array.from({ length: n }, () => '<div class="skel skel-poster"></div>').join('') + '</div>';
}
function installBanner() {
  if (!ui.deferredInstall) return '';
  return `<div class="install rise"><p>Поставь Бангуми на главный экран — откроется как обычное приложение.</p>
    <button class="btn small" type="button" data-action="install">Установить</button></div>`;
}

/* ================= Главная ================= */
function heroSlides() {
  const n = nowSec();
  const map = byAni();
  if (!ui.heroIds) {
    const items = Object.values(state.items).filter(i => activeStatus(i.status));
    const scored = items.map(it => {
      let s = 0;
      const ne = newEps(it);
      if (it.status === 'watching' && ne > 0) s += 100 + ne;
      if (it.nextEp && it.nextEp.airingAt > n && it.nextEp.airingAt - n < 3 * 86400) s += 60 - (it.nextEp.airingAt - n) / 8640;
      if (it.status === 'watching') s += 20;
      return { id: it.id, s: s + (it.updatedAt || 0) / 1e13 };
    }).sort((a, b) => b.s - a.s).slice(0, 4).map(x => 'i:' + x.id);
    (state.trend || []).filter(m => !map[m.id]).slice(0, Math.max(1, 5 - scored.length)).forEach(m => scored.push('m:' + m.id));
    ui.heroIds = scored;
  }
  return ui.heroIds.map(k => {
    const [t, id] = [k.slice(0, 1), k.slice(2)];
    if (t === 'i') { const it = state.items[id]; return it ? { kind: 'item', it } : null; }
    const m = ui.media[id];
    if (!m) return null;
    const it = map[m.id];
    return it ? { kind: 'item', it } : { kind: 'media', m };
  }).filter(Boolean);
}
function heroSlideHTML(s, i) {
  const n = nowSec();
  if (s.kind === 'item') {
    const it = s.it, ne = newEps(it);
    let kicker;
    if (it.status === 'watching' && ne > 0) kicker = `<span class="live"></span>Доступно ещё ${sers(ne)}`;
    else if (it.nextEp && it.nextEp.airingAt > n) kicker = `<span class="live"></span>EP ${it.nextEp.episode} через ${until(it.nextEp.airingAt)}`;
    else kicker = it.status === 'planned' ? 'В твоих планах' : 'Продолжить просмотр';
    const chips = [
      it.avg ? `<span class="mchip star">${(it.avg / 10).toFixed(1)}</span>` : '',
      FORMAT[it.format] ? `<span class="mchip">${esc(FORMAT[it.format])}</span>` : '',
      it.seasonYear ? `<span class="mchip">${it.seasonYear}</span>` : '',
      `<span class="mchip ep" data-tick="he-${esc(it.id)}" data-hero-ep="${esc(it.id)}">EP ${it.progress}/${it.total || '?'}</span>`
    ].join('');
    const desc = ruD(it.idMal);
    const color = it.color || hueColor(title(it));
    return `<article class="hero-slide" style="--c:${esc(color)}" data-i="${i}">
      <div class="hero-bg">${it.coverXL || it.cover ? `<img src="${esc(it.coverXL || it.cover)}" alt="" ${i ? 'loading="lazy"' : 'fetchpriority="high"'} decoding="async">` : ''}</div>
      <div class="hero-glow"></div><div class="hero-shade"></div>
      <div class="hero-content">
        <div class="hero-kicker">${kicker}</div>
        <h2 class="hero-title">${esc(title(it))}</h2>
        <div class="meta-chips">${chips}</div>
        ${desc ? `<p class="hero-desc">${esc(desc)}</p>` : ''}
        <div class="hero-actions">
          ${canInc(it) ? `<button class="btn primary" type="button" data-action="inc" data-id="${esc(it.id)}">${ICON.play}+1 серия</button>` : ''}
          <button class="btn glass" type="button" data-action="open" data-item="${esc(it.id)}">${ICON.info}Подробнее</button>
        </div>
      </div></article>`;
  }
  const m = s.m, t = mediaTitle(m);
  const rank = (state.trend || []).findIndex(x => x.id === m.id) + 1;
  const desc = ruD(m.idMal) || stripHtml(m.description);
  const chips = [
    m.averageScore ? `<span class="mchip star">${(m.averageScore / 10).toFixed(1)}</span>` : '',
    FORMAT[m.format] ? `<span class="mchip">${esc(FORMAT[m.format])}</span>` : '',
    m.seasonYear ? `<span class="mchip">${m.seasonYear}</span>` : '',
    m.episodes ? `<span class="mchip">${m.episodes} эп.</span>` : ''
  ].join('');
  return `<article class="hero-slide" style="--c:${esc((m.coverImage && m.coverImage.color) || hueColor(t))}" data-i="${i}">
    <div class="hero-bg">${mediaCover(m, true) ? `<img src="${esc(mediaCover(m, true))}" alt="" ${i ? 'loading="lazy"' : 'fetchpriority="high"'} decoding="async">` : ''}</div>
    <div class="hero-glow"></div><div class="hero-shade"></div>
    <div class="hero-content">
      <div class="hero-kicker">В тренде${rank ? ' · №' + rank : ''}</div>
      <h2 class="hero-title">${esc(t)}</h2>
      <div class="meta-chips">${chips}</div>
      ${desc ? `<p class="hero-desc">${esc(desc)}</p>` : ''}
      <div class="hero-actions">
        <button class="btn primary" type="button" data-action="quick-add" data-ani="${m.id}">${ICON.plus}В список</button>
        <button class="btn glass" type="button" data-action="open" data-ani="${m.id}">${ICON.info}Подробнее</button>
      </div>
    </div></article>`;
}
function heroHTML() {
  const slides = heroSlides();
  if (!slides.length) {
    return `<div class="hero" style="--c:#FF7A45"><div class="hero-track"><article class="hero-slide active" style="background:radial-gradient(120% 80% at 80% 0%, #3a2a6e, transparent 60%), radial-gradient(100% 70% at 0% 100%, #6e2a3a, transparent 60%), #0B0B12">
      <div class="hero-shade"></div>
      <div class="hero-content">
        <div class="hero-kicker">Добро пожаловать</div>
        <h2 class="hero-title">Твоё аниме. Твоё расписание.</h2>
        <p class="hero-desc" style="-webkit-line-clamp:3">Добавляй тайтлы, отмечай серии одним касанием и раскладывай просмотр по дням недели.</p>
        <div class="hero-actions"><a class="btn primary" href="#search" data-tab-link="search">${ICON.plus}Найти аниме</a></div>
      </div></article></div></div>`;
  }
  return `<div class="hero" id="hero"><div class="hero-track" id="heroTrack">${slides.map(heroSlideHTML).join('')}</div>
    <div class="hero-dots" id="heroDots" style="--dur:6.5s">${slides.map(() => '<i></i>').join('')}</div></div>`;
}

const hero = { timer: null, idx: 0, n: 0, settle: null, bound: null };
function setupHero(keepIdx) {
  const track = $('#heroTrack');
  clearTimeout(hero.timer);
  if (!track) return;
  hero.n = track.children.length;
  const idx = keepIdx ? Math.min(hero.idx, hero.n - 1) : 0;
  if (idx) track.scrollLeft = idx * track.clientWidth;
  if (hero.bound !== track) {
    hero.bound = track;
    track.addEventListener('scroll', () => {
      clearTimeout(hero.settle);
      hero.settle = setTimeout(() => {
        const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
        if (i !== hero.idx) markHero(i); else restartHero();
      }, 110);
    }, { passive: true });
    track.addEventListener('touchstart', () => { clearTimeout(hero.timer); const d = $('#heroDots'); if (d) d.classList.add('paused'); }, { passive: true });
    track.addEventListener('touchend', () => { const d = $('#heroDots'); if (d) d.classList.remove('paused'); restartHero(); }, { passive: true });
  }
  markHero(idx, true);
}
function markHero(i, first) {
  const track = $('#heroTrack');
  if (!track) return;
  hero.idx = i;
  Array.from(track.children).forEach((s, k) => s.classList.toggle('active', k === i));
  const dots = $$('#heroDots i');
  dots.forEach(d => d.classList.remove('on'));
  if (dots[i]) { void dots[i].offsetWidth; dots[i].classList.add('on'); }
  restartHero();
}
function restartHero() {
  clearTimeout(hero.timer);
  if (hero.n < 2) return;
  hero.timer = setTimeout(() => {
    const track = $('#heroTrack');
    if (!track) return;
    if (document.hidden || ui.tab !== 'home' || ui.overlays.length || window.scrollY > 300) { restartHero(); return; }
    const next = (hero.idx + 1) % hero.n;
    track.scrollTo({ left: next * track.clientWidth, behavior: reduced ? 'auto' : 'smooth' });
  }, 6500);
}

function contCardHTML(it, i) {
  const pct = it.total ? Math.min(100, it.progress / it.total * 100) : (it.progress ? 50 : 0);
  const ne = newEps(it);
  const art = it.banner || it.coverXL || it.cover;
  return `<div class="cont rise" style="--i:${i};--c:${esc(it.color || hueColor(title(it)))}" role="button" tabindex="0" data-action="open" data-item="${esc(it.id)}" aria-label="${esc(title(it))}">
    <div class="cont-art" data-vt="${esc(it.id)}">${art ? `<img src="${esc(art)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : ''}
      ${ne > 0 ? `<span class="p-new">+${ne}</span>` : ''}
      <span class="cont-ep"><b data-tick="ce-${esc(it.id)}">EP ${it.progress}</b><span>из ${it.total || '?'}</span></span></div>
    <div class="bar"><i style="width:${pct}%"></i></div>
    <div class="cont-body"><span class="t">${esc(title(it))}</span>
      ${canInc(it) ? `<button class="plus-btn" type="button" data-action="inc" data-id="${esc(it.id)}" aria-label="Отметить серию ${it.progress + 1}">+1</button>` : ''}</div>
  </div>`;
}
function soonCardHTML(it, i) {
  return `<div class="soon rise" style="--i:${i};--c:${esc(it.color || hueColor(title(it)))}" role="button" tabindex="0" data-action="open" data-item="${esc(it.id)}">
    ${thumbHTML(it.cover, title(it), it.color || hueColor(title(it)), it.id)}
    <span class="info"><span class="t">${esc(title(it))}</span>
      <span class="when"><span class="countdown-chip">${esc(until(it.nextEp.airingAt))}</span>EP ${it.nextEp.episode} · ${esc(fmtDay(it.nextEp.airingAt))}, ${fmtTime(it.nextEp.airingAt)}</span></span>
  </div>`;
}
function checklistHTML(date, opts) {
  opts = opts || {};
  const key = dayKey(date), di = dayIndexMon(date), log = state.planLog[key] || {};
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d0 = new Date(date); d0.setHours(0, 0, 0, 0);
  const future = d0 > today, isToday = d0.getTime() === today.getTime();
  const list = planFor(date);
  const done = list.filter(it => log[it.id]).length;
  const head = opts.title || (DAYS_FULL[di] + (isToday ? ' · сегодня' : ''));
  const sub = list.length ? (future ? sers(list.reduce((s, it) => s + (it.plan.eps || 1), 0)) + ' запланировано' : `${done} из ${list.length} выполнено`) : 'Пока ничего не запланировано';
  let rows = list.map(it => {
    const l = log[it.id];
    let from, to;
    if (l) { from = l.from; to = l.to; }
    else { from = (it.progress || 0) + 1; to = from + (it.plan.eps || 1) - 1; if (it.total) to = Math.min(it.total, to); }
    const range = (it.total && from > it.total && !l) ? 'всё просмотрено' : (from >= to ? 'EP ' + from : 'EP ' + from + '–' + to);
    const c = it.color || hueColor(title(it));
    return `<div class="check-item${l ? ' done' : ''}">
      <button type="button" class="cbox${l ? ' on' : ''}" data-action="plan-check" data-key="${key}" data-id="${esc(it.id)}" ${future ? 'disabled' : ''} aria-pressed="${!!l}" aria-label="Отметить: ${esc(title(it))}">
        <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>
      <button type="button" class="open" data-action="open" data-item="${esc(it.id)}">
        ${thumbHTML(it.cover, title(it), c, it.id)}
        <span class="info"><span class="t">${esc(title(it))}</span>
          <span class="s"><span class="epchip">${esc(range)}</span>${it.plan.time ? `<span class="mono">${esc(it.plan.time)}</span>` : ''}${l ? '<span>готово</span>' : ''}</span></span>
      </button></div>`;
  }).join('');
  return `<div class="daycard">
    <div class="daycard-head">${ringHTML(list.length ? done / list.length : 0, list.length ? `${done}/${list.length}` : '0')}
      <div class="txt"><h3>${esc(head)}</h3><small>${esc(sub)}</small></div></div>
    ${rows}
    <button type="button" class="add-row" data-action="plan-add" data-d="${di}"><span class="plus">${ICON.plus}</span>${list.length ? 'Изменить план по ' + DAYS_DAT[di] : 'Запланировать по ' + DAYS_DAT[di]}</button>
  </div>`;
}

function renderHome(parts) {
  const el = $('#view-home');
  const all = !parts;
  if (all) {
    el.innerHTML = `<div id="homeHero"></div>
      <div class="wrap view" id="homeBody">
        ${installBanner()}
        <div id="homeToday"></div><div id="homeCont"></div><div id="homeSoon"></div><div id="homeTrend"></div><div id="homeEmpty"></div>
      </div>`;
    parts = ['hero', 'today', 'cont', 'soon', 'trend', 'empty'];
  }
  const items = Object.values(state.items);
  const has = p => parts.includes(p);
  const keepScroll = id => { const r = document.querySelector('#' + id + ' .rail'); return r ? r.scrollLeft : 0; };
  const restore = (id, x) => { const r = document.querySelector('#' + id + ' .rail'); if (r && x) r.scrollLeft = x; };

  if (has('hero')) { $('#homeHero').innerHTML = heroHTML(); setupHero(!all); }

  if (has('today')) {
    const hasActive = items.some(i => i.status === 'watching' || i.status === 'planned');
    $('#homeToday').innerHTML = hasActive ? `<section class="section"><div class="section-head"><h2>Сегодня</h2><a class="more" href="#schedule" data-tab-link="schedule">Вся неделя</a></div>${checklistHTML(new Date())}</section>` : '';
    animateRings($('#homeToday'));
  }
  if (has('cont')) {
    const x = keepScroll('homeCont');
    const cont = items.filter(i => i.status === 'watching').sort((a, b) => (newEps(b) > 0) - (newEps(a) > 0) || b.updatedAt - a.updatedAt);
    $('#homeCont').innerHTML = cont.length ? `<section class="section"><div class="section-head"><h2>Продолжить просмотр</h2><a class="more" href="#list" data-tab-link="list">Все</a></div>
      <div class="rail bleed">${cont.map(contCardHTML).join('')}</div></section>` : '';
    restore('homeCont', x);
  }
  if (has('soon')) {
    const x = keepScroll('homeSoon');
    const n = nowSec();
    const soon = items.filter(i => activeStatus(i.status) && i.nextEp && i.nextEp.airingAt > n && i.nextEp.airingAt - n < 8 * 86400)
      .sort((a, b) => a.nextEp.airingAt - b.nextEp.airingAt);
    $('#homeSoon').innerHTML = soon.length ? `<section class="section"><div class="section-head"><h2>Скоро выйдет</h2><a class="more" href="#schedule" data-tab-link="schedule">Расписание</a></div>
      <div class="rail bleed">${soon.map(soonCardHTML).join('')}</div></section>` : '';
    restore('homeSoon', x);
  }
  if (has('trend')) {
    const x = keepScroll('homeTrend');
    const tr = state.trend;
    $('#homeTrend').innerHTML = `<section class="section"><div class="section-head"><h2>В тренде</h2><a class="more" href="#search" data-tab-link="search">Ещё</a></div>
      ${tr ? `<div class="rail bleed">${tr.slice(0, 10).map((m, i) => `<div class="rank"><span class="rank-n" aria-hidden="true">${i + 1}</span>${posterHTML(cardFromMedia(m), { i, cls: '', sub: '' })}</div>`).join('')}</div>` : skeletonPosters(4)}</section>`;
    restore('homeTrend', x);
  }
  if (has('empty')) {
    $('#homeEmpty').innerHTML = items.length ? '' : `<div class="empty rise"><span class="art">番</span><h3>Собери свой список</h3>
      <p>Найди аниме, отметь «Смотрю» или «В планах», а потом разложи просмотр по дням — как чек-лист в заметках, только серии считаются сами.</p>
      <a class="btn grad" href="#search" data-tab-link="search">${ICON.plus}Найти аниме</a></div>`;
  }
}
function updateHeroChip(it) {
  const c = document.querySelector(`[data-hero-ep="${CSS.escape(it.id)}"]`);
  if (c) c.textContent = `EP ${it.progress}/${it.total || '?'}`;
}

/* ================= Расписание ================= */
function weekEvents(offset) {
  const start = weekStart(offset);
  const s0 = start.getTime() / 1000, s1 = s0 + 7 * 86400;
  const map = byAni();
  const days = Array.from({ length: 7 }, () => []);
  let air = ui.weekAir[String(s0)];
  if (!air) {
    air = Object.values(state.items).filter(i => i.anilistId && i.nextEp && activeStatus(i.status))
      .map(i => ({ mediaId: i.anilistId, episode: i.nextEp.episode, airingAt: i.nextEp.airingAt }));
  }
  air.forEach(a => {
    if (a.airingAt < s0 || a.airingAt >= s1) return;
    const it = map[a.mediaId];
    if (!it || !activeStatus(it.status)) return;
    const d = new Date(a.airingAt * 1000);
    days[dayIndexMon(d)].push({ it, ep: a.episode, at: a.airingAt });
  });
  days.forEach(l => l.sort((a, b) => a.at - b.at));
  return { start, days };
}
function renderSchedule() {
  const el = $('#view-schedule');
  const items = Object.values(state.items);
  el.innerHTML = `<div class="title-row"><div><h1 class="page-title" id="pageTitle">Расписание</h1><p class="page-sub">Выход серий и твой план по дням</p></div>
      <button class="btn small grad" type="button" data-action="quick-open">${ICON.plus}В план</button></div>
    <div class="weekbar" id="weekbar"></div>
    <div class="daybar" id="daybar"></div>
    <div id="dayContent" class="view" style="gap:22px"></div>`;
  if (!items.length) {
    $('#weekbar').remove(); $('#daybar').remove();
    $('#dayContent').innerHTML = `<div class="empty rise"><span class="art">月</span><h3>Здесь будет твоя телепрограмма</h3>
      <p>Добавь аниме — даты новых серий появятся сами, а дни просмотра ты отметишь галочками.</p>
      <a class="btn grad" href="#search" data-tab-link="search">${ICON.plus}Найти аниме</a></div>`;
    return;
  }
  renderWeekbar();
  renderDaybar();
  renderDay();
}
function renderWeekbar() {
  const el = $('#weekbar');
  if (!el) return;
  el.innerHTML = `<button class="icon-btn" type="button" data-action="week" data-v="-1" aria-label="Прошлая неделя">${ICON.back}</button>
    <span class="range">${esc(weekLabel(weekStart(ui.weekOffset)))}</span>
    ${ui.weekLoading ? '<span class="spinner" aria-label="Загрузка"></span>' : ''}
    ${ui.weekOffset !== 0 ? '<button class="btn small" type="button" data-action="week-today">Сегодня</button>' : ''}
    <button class="icon-btn" type="button" data-action="week" data-v="1" aria-label="Следующая неделя">${ICON.next}</button>`;
}
function renderDaybar() {
  const el = $('#daybar');
  if (!el) return;
  const { start, days } = weekEvents(ui.weekOffset);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let h = '<span class="ind" id="dayInd"></span>';
  for (let i = 0; i < 7; i++) {
    const d = new Date(start); d.setDate(d.getDate() + i);
    const plan = planFor(d), log = state.planLog[dayKey(d)] || {};
    const allDone = plan.length && plan.every(it => log[it.id]);
    const dots = '<i></i>'.repeat(Math.min(days[i].length, 2)) + (plan.length ? `<i class="${allDone ? 'ok' : 'p'}"></i>` : '');
    h += `<button type="button" class="dayb${d.getTime() === today.getTime() ? ' today' : ''}${ui.selDay === i ? ' sel' : ''}" data-action="day" data-d="${i}" aria-pressed="${ui.selDay === i}" aria-label="${DAYS_FULL[i]}, ${d.getDate()}">
      <span class="k">${KANJI[i]}</span><span class="w">${DAYS[i]}</span><span class="d">${d.getDate()}</span><span class="dots">${dots}</span></button>`;
  }
  el.innerHTML = h;
  requestAnimationFrame(() => moveDayInd(true));
}
function moveDayInd(instant) {
  const ind = $('#dayInd'), btn = document.querySelector(`.dayb[data-d="${ui.selDay}"]`);
  if (!ind || !btn) return;
  if (instant) ind.style.transition = 'none';
  ind.style.width = btn.offsetWidth + 'px';
  ind.style.transform = `translateX(${btn.offsetLeft - 5}px)`;
  if (instant) { void ind.offsetWidth; ind.style.transition = ''; }
}
function renderDay() {
  const el = $('#dayContent');
  if (!el) return;
  const { start, days } = weekEvents(ui.weekOffset);
  const date = new Date(start); date.setDate(date.getDate() + ui.selDay);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const isToday = date.getTime() === today.getTime();
  const n = nowSec();
  const air = days[ui.selDay];
  let tl = '';
  if (!air.length) {
    tl = `<div class="empty soft"><p>${ui.weekError ? 'Нет связи с AniList — показываю сохранённые даты.' : 'В этот день новых серий из твоего списка нет.'}</p></div>`;
  } else {
    let nowShown = !isToday;
    tl = '<div class="timeline">' + air.map((e, i) => {
      const it = e.it, past = e.at <= n, c = it.color || hueColor(title(it));
      let line = '';
      if (!nowShown && !past) { nowShown = true; line = `<div class="now-line">СЕЙЧАС ${fmtTime(n)}</div>`; }
      return line + `<div class="tl${past ? ' past' : ''} rise" style="--i:${i}">
        <div class="time"><b>${fmtTime(e.at)}</b><small>JST ${esc(fmtJST(e.at))}</small></div>
        <button type="button" class="tl-card" style="--c:${esc(c)}" data-action="open" data-item="${esc(it.id)}">
          ${thumbHTML(it.cover, title(it), c, it.id)}
          <span class="info"><span class="t">${esc(title(it))}</span>
            <span class="s"><span class="epchip air">EP ${e.ep}</span>${past ? 'вышла' : 'через ' + esc(until(e.at))}${it.total ? ' · из ' + it.total : ''}</span></span>
        </button></div>`;
    }).join('') + (!nowShown ? `<div class="now-line">СЕЙЧАС ${fmtTime(n)}</div>` : '') + '</div>';
  }
  el.innerHTML = `<section class="section rise"><div class="section-head"><h2>Мой план</h2></div>${checklistHTML(date)}</section>
    <section class="section"><div class="section-head"><h2>Выход серий</h2><span class="label">${air.length ? sers(air.length) : ''}</span></div>${tl}</section>`;
  animateRings(el);
}

/* ================= Поиск ================= */
function renderSearch() {
  const el = $('#view-search');
  if (!el.dataset.ready) {
    el.innerHTML = `<div><h1 class="page-title" id="pageTitle">Поиск</h1><p class="page-sub">По-русски, по-английски или ромадзи</p></div>
      <div class="searchbox">
        <svg class="s-ico ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>
        <input id="q" type="search" placeholder="Фрирен, Ван Пис, Chainsaw Man…" autocomplete="off" enterkeyhint="search" aria-label="Поиск аниме">
        <button class="clear" type="button" data-action="clear-search" aria-label="Очистить" hidden>${ICON.x}</button>
      </div>
      <div class="genres bleed" id="genres" style="padding-inline:max(16px, env(safe-area-inset-left, 0px))"></div>
      <div id="searchBody" class="view"></div>`;
    el.dataset.ready = '1';
    $('#q').addEventListener('input', onSearchInput);
    $('#q').addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(searchTimer); doSearch(); e.target.blur(); } });
  }
  $('#genres').innerHTML = QUICK_GENRES.map(g => `<button type="button" class="gchip${ui.genre === g[0] ? ' on' : ''}" style="--g:${g[2]}" data-action="genre" data-v="${esc(g[0])}">${esc(g[1])}</button>`).join('');
  $('.searchbox .clear').hidden = !ui.query;
  const body = $('#searchBody');
  const grid = list => '<div class="grid">' + list.map((m, i) => posterHTML(cardFromMedia(m), { i: Math.min(i, 12) })).join('') + '</div>';
  let h = '';
  if (ui.query.trim().length >= 2) {
    if (ui.searching && !ui.results) h += skeletonPosters(6, true);
    else if (ui.searchError) h += `<div class="empty"><h3>Нет связи</h3><p>Не получилось достучаться до базы аниме. Проверь интернет и попробуй ещё раз.</p></div>`;
    else if (ui.results && !ui.results.length) h += `<div class="empty"><h3>Ничего не нашлось</h3><p>Попробуй другое написание: «Атака титанов», «Shingeki no Kyojin» или «Attack on Titan».</p></div>`;
    else if (ui.results) h += `<div class="section"><div class="section-head"><h2>Найдено: ${ui.results.length}</h2></div>${grid(ui.results)}</div>`;
  } else if (ui.genre) {
    const g = GENRE[ui.genre];
    const res = ui.genreRes[ui.genre];
    h += `<div class="section"><div class="section-head"><h2>${esc(g.ru)}</h2><span class="label">Популярное</span></div>
      ${res ? (res.length ? grid(res) : '<div class="empty soft"><p>Пусто.</p></div>') : ui.genreLoading ? skeletonPosters(6, true) : '<div class="empty soft"><p>Нет связи.</p></div>'}</div>`;
  } else {
    const cs = currentSeason();
    h += `<section class="section"><div class="section-head"><h2>Топ недели</h2></div>
      ${state.trend ? `<div class="rail bleed">${state.trend.slice(0, 10).map((m, i) => `<div class="rank"><span class="rank-n" aria-hidden="true">${i + 1}</span>${posterHTML(cardFromMedia(m), { i, sub: '' })}</div>`).join('')}</div>` : skeletonPosters(4)}</section>
      <section class="section"><div class="section-head"><h2>${SEASON_RU[cs.s]} ${cs.y}</h2><span class="label">Сезон</span></div>
      ${ui.season ? grid(ui.season) : ui.seasonError ? `<div class="empty soft"><p>Без интернета сезон не загрузить. Список и расписание работают офлайн.</p><button class="btn small" type="button" data-action="season-retry">Повторить</button></div>` : skeletonPosters(6, true)}</section>`;
  }
  h += `<div class="empty soft"><p>Нет нужного тайтла в базе? Добавь вручную — название и число серий.</p>
    <div class="btn-row"><button class="btn small line" type="button" data-action="manual-open">${ICON.plus}Добавить вручную</button>
    <button class="btn small line" type="button" data-action="share-manual">${ICON.ext}Ссылка на серию</button></div></div>`;
  body.innerHTML = h;
}
let searchTimer = null;
function onSearchInput(e) {
  ui.query = e.target.value;
  $('.searchbox .clear').hidden = !ui.query;
  clearTimeout(searchTimer);
  if (ui.query.trim().length < 2) { ui.results = null; ui.searchError = null; ui.searchToken++; renderSearch(); return; }
  searchTimer = setTimeout(doSearch, 420);
}
async function doSearch() {
  const q = ui.query.trim();
  if (q.length < 2) return;
  const token = ++ui.searchToken;
  ui.searching = true; ui.searchError = null; ui.results = null; ui.animate = true; renderSearch();
  let res = null, err = null;
  try {
    if (/[а-яё]/i.test(q)) {
      try { res = await searchRu(q); } catch (e) { res = null; }
    }
    if (!res || !res.length) {
      const d = await gql(Q_SEARCH, { q });
      res = d.Page.media || [];
      if (token === ui.searchToken) enrichRu(res).then(ok => { if (ok && token === ui.searchToken && ui.tab === 'search') { ui.animate = false; renderSearch(); } });
    }
  } catch (e) { err = e; }
  if (token !== ui.searchToken) return;
  ui.searching = false;
  if (err) ui.searchError = err.message || 'error';
  else { ui.results = res; rememberMedia(res); }
  setAnimate($('#view-search'));
  renderSearch();
}
async function loadSeason() {
  if (ui.season || ui.seasonLoading) return;
  ui.seasonLoading = true; ui.seasonError = false;
  const cs = currentSeason();
  try {
    const d = await gql(Q_SEASON, { s: cs.s, y: cs.y });
    ui.season = d.Page.media || [];
    rememberMedia(ui.season);
    enrichRu(ui.season).then(ok => { if (ok && ui.tab === 'search' && !ui.query) renderSearch(); });
  } catch (e) { ui.seasonError = true; }
  ui.seasonLoading = false;
  if (ui.tab === 'search') renderSearch();
}
async function loadGenre(g) {
  if (ui.genreRes[g]) return;
  ui.genreLoading = true;
  try {
    const d = await gql(Q_GENRE, { g });
    ui.genreRes[g] = d.Page.media || [];
    rememberMedia(ui.genreRes[g]);
    enrichRu(ui.genreRes[g]).then(ok => { if (ok && ui.tab === 'search' && ui.genre === g) renderSearch(); });
  } catch (e) { /* нет сети */ }
  ui.genreLoading = false;
  if (ui.tab === 'search') { setAnimate($('#view-search')); renderSearch(); }
}

/* ================= Мой список ================= */
function renderList() {
  const el = $('#view-list');
  const items = Object.values(state.items);
  const s = state.settings;
  if (!items.length) {
    el.innerHTML = `<div><h1 class="page-title" id="pageTitle">Мой список</h1></div>
      <div class="empty rise"><span class="art">栞</span><h3>Список пока пуст</h3><p>Найди аниме и добавь со статусом «Смотрю» или «В планах».</p>
      <a class="btn grad" href="#search" data-tab-link="search">${ICON.plus}Найти аниме</a></div>`;
    return;
  }
  const viewSeg = `<div class="seg" role="group" aria-label="Вид">
        <button type="button" data-action="list-view" data-v="grid" aria-pressed="${s.listView === 'grid'}" aria-label="Сетка">${ICON.grid}</button>
        <button type="button" data-action="list-view" data-v="rows" aria-pressed="${s.listView === 'rows'}" aria-label="Список">${ICON.rows}</button>
        <button type="button" data-action="list-view" data-v="map" aria-pressed="${s.listView === 'map'}" aria-label="Карта">${ICON.map}</button>
      </div>`;
  if (s.listView === 'map') {
    const hadMap = !!$('#mapView');
    const animate = !hadMap || el.classList.contains('animate');
    el.innerHTML = `<div class="title-row"><div><h1 class="page-title" id="pageTitle">Мой список</h1><p class="page-sub">${items.length} ${pl(items.length, 'тайтл', 'тайтла', 'тайтлов')} на карте</p></div>${viewSeg}</div>
      <div class="map-view bleed" id="mapView"></div>`;
    MindMap.mount($('#mapView'), { animate });
    return;
  }
  const counts = {};
  STATUSES.forEach(x => { counts[x.id] = 0; });
  items.forEach(i => { counts[i.status] = (counts[i.status] || 0) + 1; });
  let list = items.filter(i => i.status === ui.listFilter);
  if (s.listSort === 'az') list.sort((a, b) => title(a).localeCompare(title(b), 'ru'));
  else if (s.listSort === 'score') list.sort((a, b) => (b.score || 0) - (a.score || 0) || b.updatedAt - a.updatedAt);
  else list.sort((a, b) => (newEps(b) > 0) - (newEps(a) > 0) || b.updatedAt - a.updatedAt);

  let body;
  if (!list.length) body = `<div class="empty soft"><p>В «${esc(ST[ui.listFilter].label)}» пока пусто.</p></div>`;
  else if (s.listView === 'grid') body = '<div class="grid">' + list.map((it, i) => posterHTML(cardFromItem(it), { i: Math.min(i, 12), plus: true, badge: false, sub: `EP ${it.progress} / ${it.total || '?'}${it.score ? ' · ★' + it.score : ''}` })).join('') + '</div>';
  else body = '<div class="list">' + list.map((it, i) => {
    const pct = it.total ? Math.min(100, it.progress / it.total * 100) : (it.progress ? 60 : 0);
    const ne = newEps(it), c = it.color || hueColor(title(it));
    const meta = [FORMAT[it.format] || '', it.season ? SEASON_RU[it.season] + ' ' + it.seasonYear : (it.seasonYear || '')].filter(Boolean).join(' · ');
    return `<div class="lrow rise" style="--i:${Math.min(i, 12)};--c:${esc(c)}">
      <button type="button" class="open" data-action="open" data-item="${esc(it.id)}">
        ${thumbHTML(it.cover, title(it), c, it.id)}
        <span class="info"><span class="t">${esc(title(it))}</span>
          <span class="meta">${esc(meta)}${it.score ? `<span class="mono" style="color:var(--accent-ink)">★ ${it.score}</span>` : ''}${ne > 0 && activeStatus(it.status) ? `<span class="p-new" style="position:static">+${ne}</span>` : ''}</span>
          <span class="pbar"><span class="b"><i style="width:${pct}%"></i></span>${it.progress}/${it.total || '?'}</span></span>
      </button>
      ${canInc(it) ? `<button class="plus-btn" type="button" data-action="inc" data-id="${esc(it.id)}" aria-label="Отметить серию ${it.progress + 1}">+1</button>` : ''}
    </div>`;
  }).join('') + '</div>';

  el.innerHTML = `<div><h1 class="page-title" id="pageTitle">Мой список</h1><p class="page-sub">${items.length} ${pl(items.length, 'тайтл', 'тайтла', 'тайтлов')}</p></div>
    <div class="tabs bleed" style="padding-inline:max(16px, env(safe-area-inset-left, 0px))" role="group" aria-label="Статус">
      ${STATUSES.map(x => `<button type="button" class="tab${ui.listFilter === x.id ? ' on' : ''}" style="--st:var(--st-${x.id})" data-action="list-filter" data-v="${x.id}" aria-pressed="${ui.listFilter === x.id}"><span class="dot"></span>${x.label}<span class="n">${counts[x.id]}</span></button>`).join('')}
    </div>
    <div class="toolbar">
      <div class="seg" role="group" aria-label="Сортировка">
        ${[['recent', 'Недавние'], ['az', 'А–Я'], ['score', 'Оценка']].map(o => `<button type="button" data-action="list-sort" data-v="${o[0]}" aria-pressed="${s.listSort === o[0]}">${o[1]}</button>`).join('')}
      </div>
      ${viewSeg}
    </div>
    ${body}`;
}

/* ================= Профиль ================= */
function renderProfile() {
  const el = $('#view-profile');
  const items = Object.values(state.items);
  const eps = items.reduce((s, i) => s + (i.progress || 0), 0);
  const mins = items.reduce((s, i) => s + (i.progress || 0) * (i.duration || 24), 0);
  const done = items.filter(i => i.status === 'completed').length;
  const scored = items.filter(i => i.score);
  const avg = scored.length ? (scored.reduce((s, i) => s + i.score, 0) / scored.length).toFixed(1) : '—';

  const stCounts = STATUSES.map(x => ({ x, n: items.filter(i => i.status === x.id).length })).filter(o => o.n);
  const stBar = stCounts.length ? `<div class="stack">${stCounts.map((o, k) => `<i style="flex:${o.n};background:var(--st-${o.x.id});animation-delay:${k * 80}ms"></i>`).join('')}</div>
    <div class="legend">${stCounts.map(o => `<span><i style="background:var(--st-${o.x.id})"></i>${o.x.label} <b>${o.n}</b></span>`).join('')}</div>` : '<p class="hint">Добавь тайтлы, и здесь появится разбивка.</p>';

  const gw = {};
  items.forEach(i => (i.genres || []).forEach(g => { gw[g] = (gw[g] || 0) + Math.max(1, i.progress || 0); }));
  const gTop = Object.entries(gw).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const gSum = gTop.reduce((s, g) => s + g[1], 0);
  const gBar = gTop.length ? `<div class="stack">${gTop.map((g, k) => `<i style="flex:${g[1]};background:${(GENRE[g[0]] || {}).c || '#888'};animation-delay:${k * 80}ms"></i>`).join('')}</div>
    <div class="legend">${gTop.map(g => `<span><i style="background:${(GENRE[g[0]] || {}).c || '#888'}"></i>${esc((GENRE[g[0]] || {}).ru || g[0])} <b>${Math.round(g[1] / gSum * 100)}%</b></span>`).join('')}</div>` : '<p class="hint">Жанры посчитаются по просмотренным сериям.</p>';

  const cells = [];
  const t = new Date(); t.setHours(0, 0, 0, 0);
  let activeDays = 0;
  for (let k = 55; k >= 0; k--) {
    const d = new Date(t); d.setDate(d.getDate() - k);
    const v = state.activity[dayKey(d)] || 0;
    if (v) activeDays++;
    const l = v === 0 ? 0 : v <= 2 ? 1 : v <= 5 ? 2 : 3;
    cells.push(`<i data-l="${l}" class="${k === 0 ? 'today' : ''}" style="animation-delay:${(55 - k) * 8}ms" title="${d.getDate()} ${monShort(d)}: ${sers(v)}"></i>`);
  }

  const st = state.settings;
  const perm = NATIVE ? (NATIVE.notifEnabled() ? 'granted' : 'default') : typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
  const permTxt = perm === 'granted' ? 'Разрешены' : perm === 'denied' ? 'Запрещены в настройках Android — включи их для Бангуми' : perm === 'unsupported' ? 'Браузер не поддерживает уведомления' : 'Ещё не разрешены';
  const seg = (action, cur, opts) => `<div class="seg" role="group">${opts.map(o => `<button type="button" data-action="${action}" data-v="${o[0]}" aria-pressed="${cur === o[0]}">${o[1]}</button>`).join('')}</div>`;
  const sync = state.lastSync ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(state.lastSync)) : 'ещё не обновлялось';

  el.innerHTML = `<div><h1 class="page-title" id="pageTitle">Профиль</h1></div>
    ${installBanner()}
    ${skin() === 'quest' ? (() => { const q = questLevel(eps); const segs = 12, on = Math.round(q.into / q.need * segs);
      return `<div class="lvl-card rise"><div class="lvl-badge"><small>УР.</small><b>${q.L}</b></div>
        <div class="lvl-info"><span class="lvl-title">${['Новичок', 'Зритель', 'Знаток', 'Отаку', 'Сэнсэй', 'Легенда'][Math.min(5, Math.floor((q.L - 1) / 3))]}</span>
        <span class="lvl-bar">${Array.from({ length: segs }, (_, k) => `<i class="${k < on ? 'on' : ''}" style="--k:${k}"></i>`).join('')}</span>
        <small>Опыт ${q.into}/${q.need} · до уровня ${q.L + 1}: ${sers(q.need - q.into)}</small></div></div>`; })() : ''}
    <div class="profile-hero rise">
      <div class="label">Время за аниме</div>
      <div class="big-stat"><b data-count="${Math.round(mins / 60)}">0</b><span>${pl(Math.round(mins / 60), 'час', 'часа', 'часов')}</span></div>
      <div class="stat-row">
        <div><b data-count="${eps}">0</b><span>${pl(eps, 'серия', 'серии', 'серий')}</span></div>
        <div><b data-count="${done}">0</b><span>завершено</span></div>
        <div><b>${avg}</b><span>средняя оценка</span></div>
      </div>
    </div>
    <div class="card pad rise" style="--i:1"><div class="section-head"><h2 style="font-size:16px">Активность</h2><span class="label">8 недель · ${activeDays} ${pl(activeDays, 'день', 'дня', 'дней')}</span></div><div class="heat">${cells.join('')}</div></div>
    <div class="card pad rise" style="--i:2" id="timeCard">${timeCardHTML()}</div>
    <div class="card pad rise" style="--i:3"><div class="section-head"><h2 style="font-size:16px">Любимые жанры</h2></div>${gBar}</div>
    <div class="card pad rise" style="--i:4"><div class="section-head"><h2 style="font-size:16px">Статусы</h2></div>${stBar}</div>

    <div class="section">
      <div class="label">Интерфейс</div>
      <div class="skins" role="group" aria-label="Интерфейс">${Object.entries(SKINS).map(([k, v]) => `<button type="button" class="skin-tile sk-${k}${skin() === k ? ' on' : ''}" data-action="set-skin" data-v="${k}" aria-pressed="${skin() === k}">
        <span class="sk-prev" aria-hidden="true"><i class="a"></i><i class="b"></i><i class="c"></i><i class="d"></i><i class="e"></i></span>
        <b>${v.name}</b><small>${v.sub}</small></button>`).join('')}</div>
    </div>

    <div class="section">
      <div class="label">Уведомления</div>
      <div class="card group">
        <div class="setting"><div class="txt"><span>О новых сериях</span><small>Когда выходит серия того, что смотришь или запланировал</small></div>
          <label class="switch"><input type="checkbox" id="swEp" data-k="notifyEpisodes" ${st.notifyEpisodes ? 'checked' : ''} aria-label="Уведомления о новых сериях"><span></span></label></div>
        <div class="setting"><div class="txt"><span>План на день</span><small>Напоминание, что сегодня по расписанию</small></div>
          <label class="switch"><input type="checkbox" id="swPlan" data-k="notifyPlan" ${st.notifyPlan ? 'checked' : ''} aria-label="Напоминания о плане"><span></span></label></div>
        <div class="setting"><div class="txt"><small>Статус: ${esc(permTxt)}. ${NATIVE ? 'Уведомление придёт в минуту выхода серии, даже если Бангуми закрыт. Время берётся из AniList и уточняется каждый раз, когда открываешь приложение.' : 'Android проверяет серии в фоне раз в несколько часов, а при открытии приложения — сразу.'}</small></div></div>
      </div>
    </div>
    <div class="section">
      <div class="label">Вид</div>
      <div class="card group">
        <div class="setting"><div class="txt"><span>Названия</span></div>${seg('set-lang', st.titleLang, [['russian', 'Рус'], ['romaji', 'Ромадзи'], ['english', 'Eng']])}</div>
        <div class="setting"><div class="txt"><span>Быстрый план</span><small>Два свайпа вправо от левого края экрана открывают окошко «Быстро в расписание»</small></div>
          <label class="switch"><input type="checkbox" id="swEdge" ${st.edgeGesture !== false ? 'checked' : ''} aria-label="Жест быстрого плана"><span></span></label></div>
        <div class="setting"><div class="txt"><span>Мой список</span><small>Карта — как ментальная карта в Заметках</small></div>${seg('set-listview', st.listView, [['grid', 'Сетка'], ['rows', 'Строки'], ['map', 'Карта']])}</div>
        <div class="setting"><div class="txt"><span>Стеклянные кнопки</span><small>Полупрозрачные кнопки с размытием и бликом</small></div>
          <label class="switch"><input type="checkbox" id="swGlass" ${st.glass !== false ? 'checked' : ''} aria-label="Стеклянные кнопки"><span></span></label></div>
        <div class="setting"><div class="txt"><span>Плавность</span><small>«Быстро» убирает размытие и тяжёлые эффекты. «Авто» само решает по телефону${weakDevice() ? ' — у тебя включится «Быстро»' : ''}</small></div>${seg('set-perf', st.perf || 'auto', [['auto', 'Авто'], ['beauty', 'Красиво'], ['fast', 'Быстро']])}</div>
        <div class="setting"><div class="txt"><span>Тема</span>${skin() === 'quest' ? '<small>В «Квесте» всегда тёмная</small>' : ''}</div>${seg('set-theme', st.theme, [['system', 'Авто'], ['dark', 'Тёмная'], ['light', 'Светлая']])}</div>
      </div>
    </div>
    <div class="section">
      <div class="label">Данные</div>
      <div class="card group">
        <div class="setting"><div class="txt"><span>Обновить</span><small>Последний раз: ${esc(sync)}</small></div>
          <button class="btn small" type="button" data-action="refresh" ${ui.syncing ? 'disabled' : ''}>${ui.syncing ? '<span class="spinner"></span>' : 'Обновить'}</button></div>
        <div class="setting"><div class="txt"><span>Резервная копия</span><small>Список хранится только на этом телефоне</small></div>
          <div class="btn-row"><button class="btn small" type="button" data-action="export">Сохранить</button>
          <button class="btn small" type="button" data-action="import">Загрузить</button></div></div>
      </div>
      <input type="file" id="importFile" accept="application/json,.json" hidden>
    </div>
    <p class="hint">Бангуми, версия ${APP_VERSION}. Тайтлы и расписание — <a class="link" href="https://anilist.co" target="_blank" rel="noopener">AniList</a>, русские названия и описания — <a class="link" href="https://shikimori.io" target="_blank" rel="noopener">Shikimori</a>. Время серий — по твоему часовому поясу, рядом японское (JST).</p>`;
  countUp(el);
}

function timeCardHTML() {
  const p = ui.timePeriod, info = periodInfo(p);
  const rows = timeByTitle(p);
  const total = rows.reduce((s, r) => s + r.mins, 0);
  const eps = rows.reduce((s, r) => s + r.eps, 0);
  const max = rows.length ? rows[0].mins : 1;
  const shown = ui.timeAll ? rows : rows.slice(0, 8);
  const list = shown.map((r, k) => {
    const it = state.items[r.id], g = state.gone[r.id];
    const name = it ? title(it) : g ? g.t : 'Удалённый тайтл';
    const c = (it && it.color) || (g && g.col) || hueColor(name);
    const cover = (it && it.cover) || (g && g.c) || '';
    const pct = Math.max(3, r.mins / max * 100);
    return `<div class="trow"${it ? ` role="button" tabindex="0" data-action="open" data-item="${esc(it.id)}"` : ''} style="--c:${esc(c)}">
      <span class="n">${k + 1}</span>${thumbHTML(cover, name, c, it ? it.id : null)}
      <span class="info"><span class="t">${esc(name)}</span><span class="tb"><i style="width:${pct}%;animation-delay:${k * 60}ms"></i></span></span>
      <span class="v"><b>${fmtDur(r.mins)}</b><small>${sers(r.eps)}</small></span></div>`;
  }).join('');
  return `<div class="section-head"><h2 style="font-size:16px">Время по тайтлам</h2></div>
    <div class="seg" role="group" aria-label="Период">${[['week', 'Неделя'], ['month', 'Месяц'], ['prev', 'Прошлый'], ['all', 'Всё время']].map(o => `<button type="button" data-action="time-period" data-v="${o[0]}" aria-pressed="${p === o[0]}">${o[1]}</button>`).join('')}</div>
    <div class="time-total"><span class="label">${esc(info.label)}</span><b>${total ? fmtDur(total) : '0 мин'}</b><small class="muted">${eps ? sers(eps) + ' · ' + rows.length + ' ' + pl(rows.length, 'тайтл', 'тайтла', 'тайтлов') : 'В этот период ничего не отмечено'}</small></div>
    ${list ? `<div class="tlist">${list}</div>` : ''}
    ${rows.length > 8 ? `<button class="expand" type="button" data-action="time-all">${ui.timeAll ? 'Свернуть' : 'Показать все ' + rows.length}</button>` : ''}
    <p class="hint">${p === 'all' ? 'Считается по всем отмеченным сериям и длительности серии.' : 'Учитываются серии, отмеченные в эти дни: «+1», галочки плана и сетка серий. Разовая отметка многих серий сразу (уже смотрел раньше) сюда не попадает.'}</p>`;
}

/* ================= Страница тайтла ================= */
function currentDetail() { return ui.detailStack[ui.detailStack.length - 1] || null; }
function dvm() {
  const d = currentDetail();
  if (!d) return null;
  let it = d.itemId ? state.items[d.itemId] : null;
  const aniId = d.aniId || (it && it.anilistId) || null;
  if (!it && aniId) it = byAni()[aniId] || null;
  const m = aniId ? ui.media[aniId] : null;
  const t = it ? title(it) : m ? mediaTitle(m) : '';
  const idMal = (it && it.idMal) || (m && m.idMal);
  return {
    it, m, aniId, t, idMal,
    cover: (it && (it.coverXL || it.cover)) || (m && mediaCover(m, true)) || '',
    banner: (it && it.banner) || (m && m.bannerImage) || (it && (it.coverXL || it.cover)) || (m && mediaCover(m, true)) || '',
    color: (it && it.color) || (m && m.coverImage && m.coverImage.color) || hueColor(t),
    next: it ? it.nextEp : m && m.nextAiringEpisode,
    total: it ? it.total : m && m.episodes,
    aired: it ? it.aired : computeAired(m),
    avg: (m && m.averageScore) || (it && it.avg),
    format: (it && it.format) || (m && m.format), year: (it && it.seasonYear) || (m && m.seasonYear),
    season: (it && it.season) || (m && m.season), airStatus: (it && it.airStatus) || (m && m.status),
    genres: (it && it.genres && it.genres.length ? it.genres : m && m.genres) || [],
    siteUrl: (it && it.siteUrl) || (m && m.siteUrl) || (aniId ? 'https://anilist.co/anime/' + aniId : ''),
    desc: ruD(idMal) || stripHtml(m && m.description),
    duration: (it && it.duration) || (m && m.duration)
  };
}
function openDetail(ref, srcEl) {
  const wasOpen = ui.detailStack.length > 0;
  ui.detailStack.push(ref);
  pushOverlay('detail');
  ui.confirmDelete = false;
  const aniId = ref.aniId || (ref.itemId && state.items[ref.itemId] && state.items[ref.itemId].anilistId);
  const src = srcEl && (srcEl.matches('[data-vt]') ? srcEl : srcEl.querySelector('[data-vt]'));
  if (!wasOpen && src && document.startViewTransition && !reduced && !isLite()) {
    src.style.viewTransitionName = 'cover';
    const vt = document.startViewTransition(() => { src.style.viewTransitionName = ''; mountDetail(false, true); });
    vt.finished.finally(() => { const c = $('#dCover'); if (c) c.style.viewTransitionName = ''; });
  } else mountDetail(!wasOpen, false);
  buzz(6);
  if (aniId) loadDetailMedia(aniId);
}
function mountDetail(anim, vtCover) {
  const v = dvm();
  if (!v) return;
  document.body.classList.add('locked', 'detail-open');
  const chips = [
    v.avg ? `<span class="mchip star">${(v.avg / 10).toFixed(1)}</span>` : '',
    FORMAT[v.format] ? `<span class="mchip">${esc(FORMAT[v.format])}</span>` : '',
    v.season ? `<span class="mchip">${SEASON_RU[v.season]} ${v.year}</span>` : v.year ? `<span class="mchip">${v.year}</span>` : '',
    AIR[v.airStatus] ? `<span class="mchip">${esc(AIR[v.airStatus])}</span>` : ''
  ].join('');
  const alt = v.it && v.it.customTitle ? itemTitle(Object.assign({}, v.it, { customTitle: '' }), state.settings.titleLang)
    : v.it ? (state.settings.titleLang === 'romaji' ? (v.it.titles && (v.it.titles.english || v.it.titles.native)) : (v.it.titles && v.it.titles.romaji))
      : v.m ? (state.settings.titleLang === 'romaji' ? (v.m.title.english || v.m.title.native) : v.m.title.romaji) : '';
  $('#detailRoot').innerHTML = `<div class="detail${anim ? ' enter' : ''}" id="detail" style="--c:${esc(v.color)}" role="dialog" aria-modal="true" aria-labelledby="dTitle">
    <div class="d-tint"></div>
    <div class="d-top" id="dTop">
      <button class="icon-btn glass" type="button" data-action="back" aria-label="Назад">${ICON.back}</button>
      <span class="ttl">${esc(v.t)}</span>
      ${v.siteUrl ? `<a class="icon-btn glass" href="${esc(v.siteUrl)}" target="_blank" rel="noopener" aria-label="Открыть на AniList">${ICON.ext}</a>` : ''}
    </div>
    <div class="d-banner" id="dBanner">${v.banner ? `<img src="${esc(v.banner)}" alt="" decoding="async" onerror="this.remove()">` : ''}</div>
    <div class="d-body wrap">
      <div class="d-head">
        <div class="d-cover" id="dCover" ${vtCover ? 'style="view-transition-name:cover"' : ''}><span class="ph-art">${esc(initial(v.t))}</span>${v.cover ? `<img src="${esc(v.cover)}" alt="" decoding="async" onerror="this.remove()">` : ''}</div>
        <div class="info">
          <h2 class="d-title" id="dTitle">${esc(v.t)}</h2>
          ${alt && alt !== v.t ? `<div class="d-alt">${esc(alt)}</div>` : ''}
          <div class="d-chips meta-chips">${chips}</div>
        </div>
      </div>
      <div id="dNext"></div>
      <div id="dMain"></div>
      <div id="dScore"></div>
      <div id="dPlan"></div>
      <section class="section" id="dAboutWrap"><div class="section-head"><h2>О тайтле</h2></div><div id="dAbout" class="view" style="gap:14px"></div></section>
      <div id="dPersonal"></div>
      <div id="dRecs"></div>
      <div id="dDanger"></div>
    </div>
  </div>`;
  const det = $('#detail');
  det.addEventListener('scroll', onDetailScroll, { passive: true });
  setAnimate(det);
  renderDetailBlocks(true);
}
function onDetailScroll() {
  const det = $('#detail');
  if (!det) return;
  const y = det.scrollTop;
  const img = $('#dBanner img');
  if (img && !reduced) img.style.transform = `translate3d(0, ${y * 0.35}px, 0) scale(${1 + Math.min(0.08, y / 3000)})`;
  $('#dTop').classList.toggle('solid', y > 170);
}
function renderDetailBlocks(all) {
  const v = dvm();
  if (!v || !$('#detail')) return;
  const it = v.it;
  const n = nowSec();

  $('#dNext').innerHTML = v.next && v.next.airingAt > n ? `<div class="nextbox rise">
      ${ringHTML(v.total ? (v.next.episode - 1) / v.total : 0.5, 'EP' + v.next.episode, 52)}
      <div class="txt"><span class="label">Следующая серия</span><span class="cd">${esc(until(v.next.airingAt))}</span>
      <small>${esc(fmtDay(v.next.airingAt))}, ${fmtTime(v.next.airingAt)} · JST ${esc(fmtJST(v.next.airingAt))}</small></div></div>` : '';

  if (!it) {
    $('#dMain').innerHTML = `<div class="section rise"><div class="label">Добавить в список</div><div class="add-grid">
      ${['watching', 'planned', 'completed', 'paused'].map((s, k) => `<button type="button" class="btn ${k === 0 ? 'grad' : ''}" style="--st:var(--st-${s})" data-action="add" data-v="${s}">${k ? '<span class="dot"></span>' : ICON.plus}${ST[s].label}</button>`).join('')}
    </div></div>`;
    ['dScore', 'dPlan', 'dPersonal', 'dDanger'].forEach(id => { $('#' + id).innerHTML = ''; });
  } else {
    renderDMain();
    renderDScore();
    renderDPlan();
    if (all || !$('#notes')) {
      $('#dPersonal').innerHTML = `<section class="section"><div class="section-head"><h2>Моё</h2></div>
        <label class="label" for="customTitle">Своё название</label>
        <input class="input" id="customTitle" type="text" placeholder="Например, как ты его называешь" value="${esc(it.customTitle || '')}">
        <label class="label" for="notes">Заметки</label>
        <textarea class="textarea" id="notes" placeholder="Где смотрю, с кем, любимые моменты…">${esc(it.notes || '')}</textarea></section>`;
    }
    renderDDanger();
  }

  const about = $('#dAbout');
  const kv = [];
  const m = v.m || {};
  if (m.studios && m.studios.nodes && m.studios.nodes.length) kv.push(['Студия', m.studios.nodes.map(s => s.name).join(', ')]);
  if (v.total) kv.push(['Серий', v.total + (v.duration ? ` по ${v.duration} мин` : '')]);
  if (m.source && SOURCE_RU[m.source]) kv.push(['Источник', SOURCE_RU[m.source]]);
  if (m.startDate && m.startDate.year) kv.push(['Старт', [m.startDate.day, m.startDate.month ? monShort(new Date(2000, m.startDate.month - 1, 1)) : '', m.startDate.year].filter(Boolean).join(' ')]);
  const longDesc = v.desc && v.desc.length > 260;
  about.innerHTML = (v.desc ? `<p class="d-desc${longDesc ? ' clamp' : ''}" id="dDesc">${esc(v.desc)}</p>${longDesc ? '<button class="expand" type="button" data-action="expand">Читать полностью</button>' : ''}`
    : (ui.detailFull[v.aniId] || !v.aniId ? '' : '<div class="loading"><span class="spinner"></span>Загружаю описание…</div>')) +
    (v.genres.length ? `<div class="tags">${v.genres.map(g => `<span class="tag" style="--g:${(GENRE[g] || {}).c || '#888'}">${esc((GENRE[g] || {}).ru || g)}</span>`).join('')}</div>` : '') +
    (kv.length ? `<dl class="kv">${kv.map(r => `<dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd>`).join('')}</dl>` : '');
  $('#dAboutWrap').hidden = !about.innerHTML.trim();

  const recs = ((m.recommendations && m.recommendations.nodes) || []).map(x => x.mediaRecommendation).filter(Boolean);
  $('#dRecs').innerHTML = recs.length ? `<section class="section"><div class="section-head"><h2>Похожее</h2></div>
    <div class="rail bleed">${recs.map((r, i) => posterHTML(cardFromMedia(ui.media[r.id] || r), { i, cls: '' })).join('')}</div></section>` : '';
  animateRings($('#detail'));
}
function renderDMain(popFrom, popTo) {
  const v = dvm(), it = v.it;
  const p = it.progress || 0, total = it.total;
  const ne = newEps(it);
  let label = it.status === 'completed' ? 'Всё просмотрено' : ne > 0 ? `Доступно ещё ${sers(ne)}` : v.next ? 'Ты в курсе всех серий' : 'просмотрено';
  let cnt = total || Math.max(it.aired || 0, p) + (v.next ? 1 : 0);
  cnt = Math.max(cnt, 1);
  const grid = cnt <= 160 ? `<div class="epgrid" role="group" aria-label="Серии">${Array.from({ length: cnt }, (_, k) => {
    const e = k + 1;
    let c = e <= p ? 'w' : (it.aired != null && e <= it.aired) ? 'av' : (it.aired != null ? 'fu' : '');
    if (popFrom && e >= popFrom && e <= popTo) c += ' pop';
    return `<button type="button" class="epc ${c}" data-action="ep" data-n="${e}" style="${popFrom ? `animation-delay:${(e - popFrom) * 25}ms` : ''}" aria-label="Серия ${e}">${e}</button>`;
  }).join('')}</div><p class="hint">Нажми на номер, чтобы отметить всё до этой серии.${it.aired != null ? ' Обведены вышедшие, но не просмотренные.' : ''}</p>` : '';
  $('#dMain').innerHTML = `<div class="section">
    <div class="statusbar bleed" style="padding-inline:max(16px, env(safe-area-inset-left, 0px))" role="group" aria-label="Статус">
      ${STATUSES.map(s => `<button type="button" class="sbtn${it.status === s.id ? ' on' : ''}" style="--st:var(--st-${s.id})" data-action="set-status" data-v="${s.id}" aria-pressed="${it.status === s.id}"><span class="dot"></span>${s.label}</button>`).join('')}
    </div>
    <div class="card progress-card">
      <div class="prog-top"><div class="big"><b data-tick="dp-${esc(it.id)}">${p}<small> / ${total || '?'}</small></b><span>${esc(label)}</span></div>
        ${ringHTML(total ? p / total : (p ? 0.5 : 0), total ? Math.round(p / total * 100) + '%' : 'EP' + p)}</div>
      <div class="prog-btns">
        <button class="btn minus" type="button" data-action="d-dec" aria-label="Минус серия" ${p ? '' : 'disabled'}>−</button>
        <button class="btn primary" type="button" data-action="d-inc" ${total && p >= total ? 'disabled' : ''}>${ICON.play}${total && p >= total ? 'Все серии отмечены' : 'Отметить EP ' + (p + 1)}</button>
      </div>
      ${grid}
      <div class="spent"><span class="label">Потрачено</span><b>${p ? fmtDur(p * (it.duration || 24)) : '0 мин'}</b>
        ${minsForItem(it.id, 'month') ? `<span class="muted">· в этом месяце ${fmtDur(minsForItem(it.id, 'month'))}</span>` : ''}</div>
    </div></div>`;
  animateRings($('#dMain'));
}
function scoreWord(s) { return !s ? 'Нажми, чтобы оценить' : s <= 3 ? 'Слабо' : s <= 5 ? 'Так себе' : s <= 7 ? 'Хорошо' : s <= 9 ? 'Отлично' : 'Шедевр'; }
function renderDScore() {
  const it = dvm().it;
  $('#dScore').innerHTML = `<section class="section"><div class="section-head"><h2>Моя оценка</h2><span class="score-face">${it.score ? it.score + '/10 · ' : ''}${scoreWord(it.score)}</span></div>
    <div class="stars" role="group" aria-label="Оценка">${Array.from({ length: 10 }, (_, k) => k + 1).map(s => `<button type="button" class="${it.score && s <= it.score ? 'on' : ''}" style="--s:${s};transition-delay:${s * 18}ms" data-action="score" data-v="${s}" aria-pressed="${it.score === s}">${s}</button>`).join('')}</div></section>`;
}
function renderDPlan() {
  const it = dvm().it;
  const p = it.plan || { days: [], time: '', eps: 1 };
  $('#dPlan').innerHTML = `<section class="section"><div class="section-head"><h2>Когда смотрю</h2>${p.days.length ? `<span class="label">${p.days.length} ${pl(p.days.length, 'день', 'дня', 'дней')} в неделю</span>` : ''}</div>
    <div class="weekpick" role="group" aria-label="Дни просмотра">${DAYS.map((d, i) => `<button type="button" data-action="plan-day" data-v="${i}" aria-pressed="${p.days.includes(i)}">${d}<small>${KANJI[i]}</small></button>`).join('')}</div>
    <div class="plan-row">
      <label for="planTime">Время<input class="input time" id="planTime" type="time" value="${esc(p.time || '')}"></label>
      <label>Серий за раз<span class="stepper"><button type="button" data-action="eps" data-v="-1" aria-label="Меньше">−</button>
        <input id="planEps" type="number" inputmode="numeric" min="1" max="50" value="${p.eps || 1}" aria-label="Серий за раз">
        <button type="button" data-action="eps" data-v="1" aria-label="Больше">+</button></span></label>
    </div>
    <p class="hint">Отмеченные дни станут чек-листом во вкладке «Расписание»: галочка сама засчитает серии.</p></section>`;
}
function renderDDanger() {
  const it = dvm().it;
  $('#dDanger').innerHTML = ui.confirmDelete ? `<div class="confirm"><p>Удалить «${esc(title(it))}» из списка?</p>
      <button class="btn small danger" type="button" data-action="delete-yes">Удалить</button>
      <button class="btn small" type="button" data-action="delete-no">Оставить</button></div>`
    : `<button class="btn danger block" type="button" data-action="delete-ask">${ICON.trash}Удалить из списка</button>`;
}
function popDetail() {
  ui.detailStack.pop();
  if (ui.detailStack.length) { mountDetail(false, false); const d = currentDetail(); const a = d.aniId || (d.itemId && state.items[d.itemId] && state.items[d.itemId].anilistId); if (a) loadDetailMedia(a); return; }
  const det = $('#detail');
  if (!det) return;
  flush();
  const cover = $('#dCover');
  const finish = () => { $('#detailRoot').innerHTML = ''; document.body.classList.remove('locked', 'detail-open'); };
  if (det.dataset.dragged) { setTimeout(() => { finish(); renderCurrent(); }, reduced ? 0 : 240); return; }
  if (document.startViewTransition && !reduced && cover && !isLite()) {
    cover.style.viewTransitionName = 'cover';
    let target = null;
    const vt = document.startViewTransition(() => {
      cover.style.viewTransitionName = '';
      finish();
      renderCurrent();
      const key = lastDetailKey;
      target = key ? document.querySelector(`#view-${ui.tab} [data-vt="${CSS.escape(key)}"]`) : null;
      if (target && isVisible(target)) target.style.viewTransitionName = 'cover'; else target = null;
    });
    vt.finished.finally(() => { if (target) target.style.viewTransitionName = ''; });
  } else {
    det.classList.add('leave');
    setTimeout(() => { finish(); renderCurrent(); }, reduced ? 0 : 260);
  }
}
let lastDetailKey = null;
function isVisible(el) { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; }

/* ================= Нижние листы ================= */
function openSheet(html) {
  const root = $('#sheetRoot');
  root.innerHTML = `<div class="sheet-root" id="sheetWrap"><div class="backdrop" data-action="back"></div><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`;
  document.body.classList.add('locked', 'sheet-open');
  pushOverlay('sheet');
}
function closeSheetNow() {
  const w = $('#sheetWrap');
  if (!w) return;
  w.classList.add('leave');
  setTimeout(() => { $('#sheetRoot').innerHTML = ''; document.body.classList.remove('sheet-open'); if (!ui.detailStack.length) document.body.classList.remove('locked'); }, reduced ? 0 : 240);
}
function planPickerHTML(di) {
  const items = Object.values(state.items).filter(it => activeStatus(it.status))
    .sort((a, b) => (b.status === 'watching') - (a.status === 'watching') || title(a).localeCompare(title(b), 'ru'));
  return `<div class="grab"></div><h2>Что смотрю по ${DAYS_DAT[di]}</h2>
    ${items.length ? `<div>${items.map(it => {
      const c = it.color || hueColor(title(it));
      const on = it.plan && it.plan.days.includes(di);
      return `<div class="pick-row">${thumbHTML(it.cover, title(it), c, null)}<span class="t">${esc(title(it))}<br><small class="muted">${esc(ST[it.status].label)} · EP ${it.progress}/${it.total || '?'}</small></span>
        <label class="switch"><input type="checkbox" data-pick-day="${di}" data-id="${esc(it.id)}" ${on ? 'checked' : ''} aria-label="${esc(title(it))}"><span></span></label></div>`;
    }).join('')}</div><p class="hint">Время и число серий за раз настраиваются в карточке тайтла.</p>`
    : `<p class="hint">В списке нет тайтлов со статусом «Смотрю» или «В планах».</p><a class="btn grad" href="#search" data-tab-link="search">${ICON.plus}Найти аниме</a>`}
    <button class="btn block" type="button" data-action="back">Готово</button>`;
}
function manualHTML() {
  return `<div class="grab"></div><h2>Добавить вручную</h2>
    <label class="label" for="mTitle">Название</label><input class="input" id="mTitle" type="text" placeholder="Название тайтла">
    <label class="label" for="mEps">Всего серий</label><input class="input" id="mEps" type="number" inputmode="numeric" min="1" placeholder="Если не знаешь — оставь пустым">
    <p class="hint">Для таких тайтлов даты выхода не подтягиваются — только твой план и счётчик.</p>
    <div class="add-grid">${['watching', 'planned', 'completed', 'paused'].map((s, k) => `<button type="button" class="btn ${k === 0 ? 'grad' : ''}" style="--st:var(--st-${s})" data-action="manual-save" data-v="${s}">${k ? '<span class="dot"></span>' : ''}${ST[s].label}</button>`).join('')}</div>`;
}

/* ================= Быстрый план (свайп от левого края) ================= */
const quick = { open: false, full: false, day: 0, eps: 1, time: '', q: '', res: null, loading: false, token: 0, flash: null };
const QUICK_TIMES = ['', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00'];
function openQuick(full, day) {
  if (quick.open) return;
  Object.assign(quick, { open: true, full: !!full, day: day != null ? day : dayIndexMon(new Date()), q: '', res: null, loading: false, flash: null });
  $('#quickRoot').innerHTML = `<div class="quick-root${quick.full ? ' full' : ''}" id="quickWrap">
    <div class="backdrop" data-action="back"></div>
    <aside class="quick" role="dialog" aria-modal="true" aria-labelledby="qTitle">
      <div class="q-head">
        <span class="q-mark" aria-hidden="true">番</span>
        <div class="q-ttl"><h2 id="qTitle">Быстро в расписание</h2><small id="qSub"></small></div>
        <button class="icon-btn" type="button" data-action="back" aria-label="Закрыть">${ICON.x}</button>
      </div>
      <div class="q-days" id="qDays" role="group" aria-label="День недели"></div>
      <div class="q-opts" id="qOpts"></div>
      <div class="searchbox q-search">
        <svg class="s-ico ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>
        <input id="qq" type="search" placeholder="Найти в списке или в базе" autocomplete="off" enterkeyhint="search" aria-label="Найти аниме">
      </div>
      <div class="q-body" id="qBody"></div>
      <div class="q-foot" id="qFoot"></div>
    </aside></div>`;
  document.body.classList.add('locked', 'quick-open');
  pushOverlay('quick');
  $('#qq').addEventListener('input', onQuickInput);
  renderQuick(true);
  buzz(15);
}
function closeQuickNow() {
  const w = $('#quickWrap');
  quick.open = false;
  clearTimeout(quickTimer);
  if (!w) return;
  w.classList.add('leave');
  setTimeout(() => {
    $('#quickRoot').innerHTML = '';
    document.body.classList.remove('quick-open');
    if (!ui.detailStack.length && !$('#sheetWrap')) document.body.classList.remove('locked');
  }, reduced ? 0 : 260);
  refreshAfterChange();
}
function quickDayList(di) {
  return Object.values(state.items).filter(it => it.plan && it.plan.days && it.plan.days.includes(di) && (it.status === 'watching' || it.status === 'planned'))
    .sort((a, b) => (a.plan.time || '99').localeCompare(b.plan.time || '99') || title(a).localeCompare(title(b), 'ru'));
}
function quickRow(it, inPlan) {
  const c = it.color || hueColor(title(it));
  const sub = inPlan
    ? [it.plan.time || 'без времени', sers(it.plan.eps || 1)].join(' · ')
    : [ST[it.status].label, 'EP ' + (it.progress || 0) + '/' + (it.total || '?')].join(' · ');
  const fl = quick.flash === it.id ? ' flash' : '';
  return `<div class="q-row${inPlan ? ' on' : ''}${fl}" style="--c:${esc(c)}">
    ${thumbHTML(it.cover, title(it), c, null)}
    <span class="info"><span class="t">${esc(title(it))}</span><span class="s">${esc(sub)}</span></span>
    <button type="button" class="q-btn" data-action="${inPlan ? 'q-rm' : 'q-add'}" data-id="${esc(it.id)}" aria-label="${inPlan ? 'Убрать из плана' : 'Добавить в план'}: ${esc(title(it))}">
      ${inPlan ? ICON.check : ICON.plus}</button></div>`;
}
function quickMediaRow(m) {
  const t = mediaTitle(m), c = (m.coverImage && m.coverImage.color) || hueColor(t);
  const sub = [FORMAT[m.format] || '', m.episodes ? m.episodes + ' эп.' : '', m.seasonYear || ''].filter(Boolean).join(' · ');
  return `<div class="q-row" style="--c:${esc(c)}">
    ${thumbHTML(mediaCover(m), t, c, null)}
    <span class="info"><span class="t">${esc(t)}</span><span class="s">${esc(sub || 'из базы')}</span></span>
    <button type="button" class="q-btn" data-action="q-add-media" data-ani="${m.id}" aria-label="Добавить в список и в план: ${esc(t)}">${ICON.plus}</button></div>`;
}
function renderQuick(first) {
  if (!quick.open) return;
  const di = quick.day;
  const today = dayIndexMon(new Date());
  $('#qDays').innerHTML = DAYS.map((d, i) => {
    const n = quickDayList(i).length;
    return `<button type="button" class="q-day${i === di ? ' sel' : ''}${i === today ? ' today' : ''}" data-action="q-day" data-v="${i}" aria-pressed="${i === di}">
      <span class="k">${KANJI[i]}</span><span class="w">${d}</span>${n ? `<span class="c">${n}</span>` : '<span class="c empty"></span>'}</button>`;
  }).join('');
  $('#qSub').textContent = (di === today ? 'Сегодня · ' : '') + DAYS_EVERY[di];
  const custom = quick.time && !QUICK_TIMES.includes(quick.time);
  $('#qOpts').innerHTML = `<div class="q-opt"><span class="label">Время</span>
      <div class="q-times">${QUICK_TIMES.map(tm => `<button type="button" class="q-time${quick.time === tm ? ' on' : ''}" data-action="q-time" data-v="${tm}">${tm || 'Любое'}</button>`).join('')}
        <label class="q-time custom${custom ? ' on' : ''}"><input type="time" id="qTimeCustom" value="${custom ? esc(quick.time) : ''}" aria-label="Своё время"></label></div></div>
    <div class="q-opt row"><span class="label">Серий за раз</span>
      <span class="stepper"><button type="button" data-action="q-eps" data-v="-1" aria-label="Меньше">−</button><b class="mono" id="qEps">${quick.eps}</b><button type="button" data-action="q-eps" data-v="1" aria-label="Больше">+</button></span></div>`;
  renderQuickBody();
  if (first) setAnimate($('#qBody'));
}
function renderQuickBody() {
  if (!quick.open) return;
  const di = quick.day;
  const planned = quickDayList(di);
  const plannedIds = new Set(planned.map(i => i.id));
  const q = quick.q.trim().toLowerCase();
  let h = '';
  if (!q) {
    h += `<div class="q-sec"><div class="label">В плане по ${DAYS_DAT[di]}</div>${planned.length ? planned.map((it, k) => quickRow(it, true)).join('') : '<p class="hint">Пока пусто. Нажми «+» у тайтла ниже.</p>'}</div>`;
    const rest = Object.values(state.items).filter(it => !plannedIds.has(it.id) && activeStatus(it.status))
      .sort((a, b) => (b.status === 'watching') - (a.status === 'watching') || b.updatedAt - a.updatedAt);
    h += `<div class="q-sec"><div class="label">Из моего списка</div>${rest.length ? rest.map(it => quickRow(it, false)).join('') : '<p class="hint">Найди аниме через поиск выше — оно сразу попадёт и в список, и в план.</p>'}</div>`;
  } else {
    const map = byAni();
    const mine = Object.values(state.items).filter(it => {
      const names = [title(it), it.customTitle, it.title, it.titles && it.titles.romaji, it.titles && it.titles.english, it.titles && it.titles.russian].filter(Boolean).join(' ').toLowerCase();
      return names.includes(q);
    });
    (quick.res || []).forEach(m => { const it = map[m.id]; if (it && !mine.includes(it)) mine.push(it); });
    if (mine.length) h += `<div class="q-sec"><div class="label">В моём списке</div>${mine.map(it => quickRow(it, plannedIds.has(it.id))).join('')}</div>`;
    const online = (quick.res || []).filter(m => !map[m.id]).slice(0, 8);
    h += `<div class="q-sec"><div class="label">В базе</div>${quick.loading && !quick.res ? '<div class="loading"><span class="spinner"></span>Ищу…</div>'
      : quick.res === false ? '<p class="hint">Нет связи с базой. Можно выбрать из своего списка.</p>'
        : online.length ? online.map(quickMediaRow).join('') : (quick.res ? '<p class="hint">Ничего нового не нашлось.</p>' : '')}</div>`;
  }
  $('#qBody').innerHTML = h;
  const eps = planned.reduce((s, it) => s + (it.plan.eps || 1), 0);
  $('#qFoot').innerHTML = `<span class="q-sum">${planned.length ? `<b>${planned.length}</b> ${pl(planned.length, 'тайтл', 'тайтла', 'тайтлов')} · ${sers(eps)}` : 'Ничего не запланировано'}</span>
    <button class="btn small line" type="button" data-action="q-open-day">Расписание</button>
    <button class="btn small primary" type="button" data-action="back">Готово</button>`;
}
let quickTimer = null;
function onQuickInput(e) {
  quick.q = e.target.value;
  clearTimeout(quickTimer);
  if (quick.q.trim().length < 2) { quick.res = null; quick.loading = false; quick.token++; renderQuickBody(); return; }
  renderQuickBody();
  quickTimer = setTimeout(async () => {
    const q = quick.q.trim(), token = ++quick.token;
    quick.loading = true; quick.res = null; renderQuickBody();
    let res = null;
    try {
      if (/[а-яё]/i.test(q)) { try { res = await searchRu(q); } catch (err) { res = null; } }
      if (!res || !res.length) { const d = await gql(Q_SEARCH, { q }); res = d.Page.media || []; enrichRu(res).then(ok => { if (ok && token === quick.token) renderQuickBody(); }); }
      rememberMedia(res);
    } catch (err) { res = false; }
    if (token !== quick.token || !quick.open) return;
    quick.loading = false; quick.res = res; renderQuickBody();
  }, 380);
}
function quickAdd(it) {
  it.plan = it.plan || { days: [], time: '', eps: 1 };
  if (!it.plan.days.includes(quick.day)) it.plan.days = it.plan.days.concat(quick.day).sort();
  it.plan.eps = quick.eps;
  if (quick.time) it.plan.time = quick.time;
  if (!(it.status === 'watching' || it.status === 'planned')) it.status = it.progress ? 'watching' : 'planned';
  it.updatedAt = Date.now();
  save(); buzz(14);
  quick.flash = it.id;
  renderQuick();
  setTimeout(() => { quick.flash = null; }, 600);
  toast(`${title(it)} — по ${DAYS_DAT[quick.day]}${it.plan.time ? ' в ' + it.plan.time : ''}`, { icon: ICON.check });
}

/* Жест: два быстрых свайпа вправо от левого края экрана */
const edge = { tracking: false, sx: 0, sy: 0, count: 0, last: 0 };
function edgeGlow(stage) {
  const g = $('#edgeGlow');
  if (!g) return;
  g.className = 'edge-glow ' + stage;
  clearTimeout(g._t);
  if (stage === 'one') g._t = setTimeout(() => { g.className = 'edge-glow'; }, 900);
  if (stage === 'go') g._t = setTimeout(() => { g.className = 'edge-glow'; }, 450);
}
document.addEventListener('touchstart', e => {
  edge.tracking = false;
  if (state.settings.edgeGesture === false || quick.open || e.touches.length !== 1 || (e.target.closest && e.target.closest('.map-view'))) return;
  const t = e.touches[0];
  if (t.clientX > 30) return;
  edge.tracking = true; edge.sx = t.clientX; edge.sy = t.clientY;
}, { passive: true });
document.addEventListener('touchmove', e => {
  if (!edge.tracking) return;
  const t = e.touches[0], dx = t.clientX - edge.sx, dy = Math.abs(t.clientY - edge.sy);
  if (dy > 60 && dy > dx) { edge.tracking = false; return; }
  if (dx > 46 && dy < dx * 0.8) {
    edge.tracking = false;
    const now = Date.now();
    edge.count = now - edge.last < 1000 ? edge.count + 1 : 1;
    edge.last = now;
    if (edge.count >= 2) { edge.count = 0; edgeGlow('go'); openQuick(false); }
    else { edgeGlow('one'); buzz(6); }
  }
}, { passive: true });
document.addEventListener('touchend', () => { edge.tracking = false; }, { passive: true });

/* ================= Навигация и история ================= */
function pushOverlay(kind) { ui.overlays.push(kind); history.pushState({ ov: kind, n: ui.overlays.length }, ''); }
function back() { if (ui.overlays.length) history.back(); }
window.addEventListener('popstate', () => {
  const k = ui.overlays.pop();
  if (k === 'sheet') { if (window.Share) Share.close(); closeSheetNow(); }
  else if (k === 'detail') popDetail();
  else if (k === 'quick') closeQuickNow();
  else if (k === 'map') MindMap.exitFull();
});

function setAnimate(el) {
  if (!el) return;
  el.classList.remove('animate'); void el.offsetWidth; el.classList.add('animate');
  clearTimeout(el._anim);
  el._anim = setTimeout(() => el.classList.remove('animate'), 1400);
}
function go(tab) {
  if (!TABS[tab]) tab = 'home';
  if (tab === ui.tab) { window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }); return; }
  history.replaceState(history.state, '', '#' + tab);
  const order = Object.keys(TABS);
  ui.tabDir = order.indexOf(tab) > order.indexOf(ui.tab) ? 'fwd' : 'back';
  ui.tab = tab;
  render(true);
  window.scrollTo(0, 0);
}
function render(enter) {
  $$('.tabbar a').forEach(a => {
    const on = a.dataset.tab === ui.tab;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  Object.keys(TABS).forEach(t => { $('#view-' + t).hidden = t !== ui.tab; });
  const cs = currentSeason();
  $('#seasonPill').textContent = SEASON_RU[cs.s] + ' ' + cs.y;
  $('#compactTitle').textContent = TABS[ui.tab];
  const bar = $('#appbar');
  bar.classList.toggle('on-hero', ui.tab === 'home');
  $('.appbar .logo').hidden = ui.tab !== 'home';
  const view = $('#view-' + ui.tab);
  const stamp = viewStamp[ui.tab];
  // Вкладка не менялась с прошлого раза — показываем готовую, без перерисовки
  const cached = enter && stamp && stamp.v === ui.ver && Date.now() - stamp.t < 60000 && view.childElementCount;
  if (enter) {
    if (!cached) { if (ui.tab === 'home') ui.heroIds = null; setAnimate(view); }
    if (!reduced) {
      view.classList.remove('tab-in-fwd', 'tab-in-back'); void view.offsetWidth;
      view.classList.add('tab-in-' + (ui.tabDir || 'fwd'));
      clearTimeout(view._tin); view._tin = setTimeout(() => view.classList.remove('tab-in-fwd', 'tab-in-back'), 450);
    }
  }
  if (cached) { if (ui.tab === 'home') setupHero(true); }
  else renderCurrent(true);
  onScroll();
  if (window.motionAfterRender) motionAfterRender();
}
const viewStamp = {};
function renderCurrent(full) {
  if (ui.tab === 'home') { if (full || !$('#homeBody')) renderHome(); else renderHome(['today', 'cont', 'soon', 'trend', 'empty']); }
  else if (ui.tab === 'schedule') renderSchedule();
  else if (ui.tab === 'search') { renderSearch(); loadSeason(); }
  else if (ui.tab === 'list') renderList();
  else renderProfile();
  viewStamp[ui.tab] = { v: ui.ver, t: Date.now() };
}
function resetViewCache() { Object.keys(viewStamp).forEach(k => delete viewStamp[k]); }
function refreshAfterChange() {
  if (ui.detailStack.length) {
    const v = dvm();
    if (v && v.it) { renderDMain(); renderDScore(); renderDPlan(); renderDDanger(); }
    else renderDetailBlocks();
  }
  if (ui.tab === 'home' && $('#homeBody')) {
    renderHome(['today', 'cont', 'soon', 'empty']);
    Object.values(state.items).forEach(updateHeroChip);
    viewStamp.home = { v: ui.ver, t: Date.now() };
  } else if (ui.tab === 'schedule' && $('#daybar')) { renderDaybar(); renderDay(); }
  else renderCurrent();
}
function onScroll() {
  const y = window.scrollY;
  const bar = $('#appbar');
  if (ui.tab === 'home') {
    const h = $('.hero');
    bar.classList.toggle('solid', y > 40);
    bar.classList.remove('show-title');
  } else {
    bar.classList.toggle('solid', y > 8);
    bar.classList.toggle('show-title', y > 46);
  }
}
window.addEventListener('scroll', onScroll, { passive: true });

/* ================= Уведомления ================= */
async function getReg() {
  if (!('serviceWorker' in navigator)) return null;
  try { return await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(() => r(null), 3000))]); } catch (e) { return null; }
}
async function setupPeriodicSync() {
  const reg = await getReg();
  if (!reg || !('periodicSync' in reg)) return;
  try {
    const st = await navigator.permissions.query({ name: 'periodic-background-sync' });
    if (st.state !== 'granted') return;
    if (state.settings.notifyEpisodes || state.settings.notifyPlan) await reg.periodicSync.register('episodes', { minInterval: 3 * 3600 * 1000 });
    else await reg.periodicSync.unregister('episodes');
  } catch (e) { /* не поддерживается */ }
}
async function nativeNotifyAllowed() {
  if (NATIVE.notifEnabled()) return true;
  NATIVE.requestNotifications();
  // ждём ответа на системный вопрос: пока он открыт, страница теряет фокус
  let asked = false;
  for (let k = 0; k < 40; k++) {
    await new Promise(r => setTimeout(r, 400));
    if (NATIVE.notifEnabled()) return true;
    const away = document.visibilityState === 'hidden' || !document.hasFocus();
    if (away) asked = true;
    else if (asked || k >= 4) break;
  }
  return NATIVE.notifEnabled();
}
async function toggleNotify(key, on, input) {
  if (on && NATIVE) {
    if (!(await nativeNotifyAllowed())) {
      input.checked = false;
      toast('Разреши уведомления: Настройки → Приложения → Бангуми → Уведомления', { ms: 6000 });
      renderProfile();
      return;
    }
  } else if (on) {
    if (typeof Notification === 'undefined') { input.checked = false; toast('Уведомления здесь не поддерживаются'); return; }
    let perm = Notification.permission;
    if (perm === 'default') { try { perm = await Notification.requestPermission(); } catch (e) { perm = 'denied'; } }
    if (perm !== 'granted') {
      input.checked = false;
      toast('Разреши уведомления: Настройки → Приложения → Бангуми', { ms: 6000 });
      renderProfile();
      return;
    }
    if (key === 'notifyEpisodes') {
      const m = (await DB.get('meta').catch(() => null)) || {};
      m.lastCheck = nowSec();
      await DB.set('meta', m).catch(() => {});
    }
  }
  state.settings[key] = on;
  await flush();
  setupPeriodicSync();
  renderProfile();
  toast(on ? 'Уведомления включены' : 'Уведомления выключены', { icon: ICON.bell });
}
async function startupCheck() {
  if (!state.settings.notifyEpisodes && !state.settings.notifyPlan) return;
  const reg = await getReg();
  try { await runBackgroundCheck(reg); } catch (e) { /* без сети */ }
}

/* ================= Смена интерфейса ================= */
function switchSkin(k, srcEl) {
  if (!SKINS[k] || k === skin()) return;
  buzz(16);
  ensureFont(k);
  const r = srcEl ? srcEl.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const apply = () => {
    state.settings.skin = k;
    applyTheme(); save(); resetViewCache();
    render(false);
  };
  if (reduced) { apply(); toast('Интерфейс: ' + SKINS[k].name); return; }
  const w = document.createElement('div');
  w.className = 'skin-wipe to-' + k;
  w.style.setProperty('--x', x + 'px'); w.style.setProperty('--y', y + 'px');
  w.innerHTML = `<span>${SKINS[k].name}</span>`;
  document.body.appendChild(w);
  setTimeout(() => { apply(); w.classList.add('out'); }, 520);
  setTimeout(() => { w.remove(); toast('Интерфейс: ' + SKINS[k].name); }, 1050);
}

/* ================= Тост ================= */
let toastTimer = null, toastFn = null;
function toast(msg, o) {
  o = o || {};
  toastFn = o.fn || null;
  const ms = o.ms || 3800;
  $('#toastRoot').innerHTML = `<div class="toast" role="status"><span class="ti">${o.icon || ICON.check}</span><span>${esc(msg)}</span>${o.action ? `<button type="button" data-action="toast-action">${esc(o.action)}</button><i class="toast-bar" style="animation-duration:${ms}ms"></i>` : ''}</div>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, ms);
}
function hideToast() {
  const t = $('#toastRoot .toast');
  toastFn = null;
  if (!t) return;
  t.classList.add('out');
  setTimeout(() => { if (t.parentNode) t.remove(); }, reduced ? 0 : 260);
}

/* ================= Резервная копия ================= */
function exportData() {
  const json = JSON.stringify({ app: 'bangumi', exportedAt: new Date().toISOString(), state }, null, 1);
  const d = new Date();
  const name = `bangumi-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
  if (NATIVE) {
    const where = NATIVE.saveFile(name, json);
    toast(where ? 'Сохранено: ' + where : 'Не получилось сохранить файл', { ms: 5000 });
    return;
  }
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  toast('Копия сохранена в «Загрузки»');
}
function importData(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const j = JSON.parse(r.result);
      const s = j.state || j;
      if (!s.items || typeof s.items !== 'object') throw new Error('bad');
      let n = 0;
      Object.values(s.items).forEach(it => { if (it && it.id && it.status) { state.items[it.id] = it; n++; } });
      ['planLog', 'activity', 'watchLog', 'gone', 'ru'].forEach(k => { if (s[k]) state[k] = Object.assign(state[k] || {}, s[k]); });
      if (s.settings) state.settings = Object.assign(state.settings, s.settings);
      applyTheme(); flush(); ui.heroIds = null; render();
      toast('Загружено тайтлов: ' + n);
      syncAll(true);
    } catch (e) { toast('Это не файл копии Бангуми. Выбери bangumi-….json'); }
  };
  r.readAsText(file);
}

/* ================= События ================= */
function addToList(m, status) {
  const item = itemFromMedia(m, status);
  if (status === 'completed' && item.total) { item.progress = 0; setProgress(item, item.total, { log: false }); item.status = 'completed'; }
  state.items[item.id] = item;
  save();
  buzz(16);
  loadWeek(ui.weekOffset, true);
  return item;
}

document.addEventListener('click', e => {
  const tl = e.target.closest('[data-tab-link], .tabbar a[data-tab]');
  if (tl) {
    e.preventDefault();
    const tab = tl.dataset.tabLink || tl.dataset.tab;
    if (ui.overlays.length) {
      const n = ui.overlays.length;
      ui.overlays.length = 0;
      ui.detailStack.length = 0;
      $('#detailRoot').innerHTML = ''; $('#sheetRoot').innerHTML = ''; $('#quickRoot').innerHTML = ''; quick.open = false;
      document.body.classList.remove('locked', 'detail-open', 'sheet-open', 'quick-open', 'map-full');
      history.go(-n);
      setTimeout(() => go(tab), 60);
    } else go(tab);
    return;
  }
  const t = e.target.closest('[data-action]');
  if (!t) return;
  const a = t.dataset.action;
  const v = ui.detailStack.length ? dvm() : null;
  const it = v && v.it;
  const touch = () => { if (it) { it.updatedAt = Date.now(); save(); } };

  switch (a) {
    case 'toast-action': { const fn = toastFn; $('#toastRoot').innerHTML = ''; toastFn = null; if (fn) fn(); break; }
    case 'back': back(); break;
    case 'open': {
      const ref = t.dataset.item ? { itemId: t.dataset.item } : { aniId: +t.dataset.ani };
      lastDetailKey = t.dataset.item || ('a' + t.dataset.ani);
      if (ui.detailStack.length) {
        const cur = currentDetail();
        if ((cur.itemId && cur.itemId === ref.itemId) || (cur.aniId && cur.aniId === ref.aniId)) break;
        $('#detail').scrollTop = 0;
      }
      openDetail(ref, t);
      break;
    }
    case 'inc': incEpisode(t.dataset.id, t); break;
    case 'quick-add': {
      const m = ui.media[+t.dataset.ani];
      if (!m) break;
      const item = addToList(m, 'planned');
      ui.heroIds = null;
      celebrate();
      toast('Добавлено в «В планах»', { action: 'Открыть', fn: () => openDetail({ itemId: item.id }) });
      renderCurrent(true);
      break;
    }
    case 'add': {
      const m = v && v.m;
      if (!m) break;
      const item = addToList(m, t.dataset.v);
      ui.detailStack[ui.detailStack.length - 1] = { itemId: item.id, aniId: m.id };
      if (t.dataset.v === 'watching' || t.dataset.v === 'completed') celebrate();
      renderDetailBlocks(true);
      toast('Добавлено в «' + ST[item.status].label + '»');
      break;
    }
    case 'expand': { const d = $('#dDesc'); if (d) { d.classList.remove('clamp'); t.remove(); } break; }
    case 'set-status': {
      if (!it) break;
      const prev = it.status;
      it.status = t.dataset.v;
      if (it.status === 'completed') { if (it.total) setProgress(it, it.total, { max: 3 }); if (prev !== 'completed') celebrate(); }
      touch(); buzz(10); refreshAfterChange(); loadWeek(ui.weekOffset, true);
      break;
    }
    case 'd-inc': case 'd-dec': {
      if (!it) break;
      const old = it.progress || 0;
      setProgress(it, old + (a === 'd-inc' ? 1 : -1));
      buzz(a === 'd-inc' ? 14 : 8);
      if (a === 'd-inc') floatPlus(t);
      refreshAfterChange();
      if (a === 'd-inc') { renderDMain(it.progress, it.progress); maybeComplete(it); }
      break;
    }
    case 'ep': {
      if (!it) break;
      const nEp = +t.dataset.n, old = it.progress || 0;
      const val = nEp === old ? nEp - 1 : nEp;
      setProgress(it, val, { max: 3 });
      buzz(12);
      refreshAfterChange();
      if (val > old) { renderDMain(old + 1, val); maybeComplete(it); }
      break;
    }
    case 'score': {
      if (!it) break;
      it.score = it.score === +t.dataset.v ? null : +t.dataset.v;
      touch(); buzz(10); renderDScore();
      if (it.score === 10) celebrate();
      break;
    }
    case 'plan-day': {
      if (!it) break;
      it.plan = it.plan || { days: [], time: '', eps: 1 };
      const d = +t.dataset.v;
      it.plan.days = it.plan.days.includes(d) ? it.plan.days.filter(x => x !== d) : it.plan.days.concat(d).sort();
      touch(); buzz(8);
      t.setAttribute('aria-pressed', it.plan.days.includes(d));
      const lab = $('#dPlan .section-head .label');
      if (lab) lab.textContent = it.plan.days.length ? `${it.plan.days.length} ${pl(it.plan.days.length, 'день', 'дня', 'дней')} в неделю` : '';
      break;
    }
    case 'eps': {
      if (!it) break;
      it.plan = it.plan || { days: [], time: '', eps: 1 };
      it.plan.eps = Math.min(50, Math.max(1, (it.plan.eps || 1) + +t.dataset.v));
      $('#planEps').value = it.plan.eps;
      touch();
      break;
    }
    case 'delete-ask': ui.confirmDelete = true; renderDDanger(); break;
    case 'delete-no': ui.confirmDelete = false; renderDDanger(); break;
    case 'delete-yes': {
      if (!it) break;
      const copy = it;
      state.gone[it.id] = { t: title(it), c: it.cover || '', col: it.color || null, d: it.duration || 24 };
      delete state.items[it.id];
      ui.confirmDelete = false; ui.heroIds = null;
      save(); back();
      setTimeout(() => toast('Удалено: ' + title(copy), { action: 'Вернуть', ms: 7000, fn: () => { state.items[copy.id] = copy; save(); ui.heroIds = null; renderCurrent(true); } }), 320);
      break;
    }
    case 'plan-check': togglePlan(t.dataset.key, t.dataset.id, t); break;
    case 'plan-add': openQuick(false, +t.dataset.d); break;
    case 'quick-open': openQuick(false); break;
    case 'q-day': quick.day = +t.dataset.v; buzz(6); renderQuick(true); break;
    case 'q-time': quick.time = t.dataset.v; buzz(6); renderQuick(); break;
    case 'q-eps': quick.eps = Math.min(20, Math.max(1, quick.eps + +t.dataset.v)); $('#qEps').textContent = quick.eps; buzz(6); break;
    case 'q-add': { const x = state.items[t.dataset.id]; if (x) quickAdd(x); break; }
    case 'q-add-media': {
      const m = ui.media[+t.dataset.ani];
      if (!m) break;
      const x = byAni()[m.id] || addToList(m, 'planned');
      ui.heroIds = null;
      quickAdd(x);
      break;
    }
    case 'q-rm': {
      const x = state.items[t.dataset.id];
      if (!x || !x.plan) break;
      const d = quick.day;
      x.plan.days = x.plan.days.filter(v => v !== d); x.updatedAt = Date.now(); save(); buzz(8); renderQuick();
      toast('Убрано из плана: ' + title(x), { action: 'Вернуть', fn: () => { if (!x.plan.days.includes(d)) x.plan.days = x.plan.days.concat(d).sort(); save(); renderQuick(); refreshAfterChange(); } });
      break;
    }
    case 'q-open-day': {
      const d = quick.day;
      back();
      setTimeout(() => { ui.weekOffset = 0; ui.selDay = d; if (ui.tab === 'schedule') { renderWeekbar(); renderDaybar(); renderDay(); } else go('schedule'); }, 300);
      break;
    }
    case 'week':
      ui.weekOffset += +t.dataset.v;
      if ($('#dayContent')) { $('#dayContent').dataset.dir = +t.dataset.v > 0 ? 'fwd' : 'back'; setAnimate($('#dayContent')); }
      renderWeekbar(); renderDaybar(); renderDay(); loadWeek(ui.weekOffset);
      break;
    case 'week-today':
      ui.weekOffset = 0; ui.selDay = dayIndexMon(new Date());
      renderWeekbar(); renderDaybar(); renderDay(); loadWeek(0);
      break;
    case 'day': {
      const prevDay = ui.selDay;
      ui.selDay = +t.dataset.d;
      if ($('#dayContent')) $('#dayContent').dataset.dir = ui.selDay >= prevDay ? 'fwd' : 'back';
      $$('.dayb').forEach(b => { const on = +b.dataset.d === ui.selDay; b.classList.toggle('sel', on); b.setAttribute('aria-pressed', on); });
      moveDayInd(false); buzz(6);
      setAnimate($('#dayContent')); renderDay();
      break;
    }
    case 'list-filter': ui.listFilter = t.dataset.v; setAnimate($('#view-list')); renderList(); break;
    case 'list-sort': state.settings.listSort = t.dataset.v; save(); setAnimate($('#view-list')); renderList(); break;
    case 'list-view': state.settings.listView = t.dataset.v; save(); setAnimate($('#view-list')); renderList(); break;
    case 'genre': {
      ui.genre = ui.genre === t.dataset.v ? null : t.dataset.v;
      if (ui.query) { ui.query = ''; $('#q').value = ''; ui.results = null; }
      setAnimate($('#view-search')); renderSearch();
      if (ui.genre) loadGenre(ui.genre);
      break;
    }
    case 'clear-search': ui.query = ''; ui.results = null; ui.searchToken++; $('#q').value = ''; $('#q').focus(); renderSearch(); break;
    case 'season-retry': ui.seasonError = false; renderSearch(); loadSeason(); break;
    case 'manual-open': openSheet(manualHTML()); break;
    case 'share-manual': Share.open({}, { manual: true }); break;
    case 'manual-save': {
      const name = ($('#mTitle').value || '').trim();
      if (!name) { $('#mTitle').focus(); toast('Впиши название'); break; }
      const total = parseInt($('#mEps').value, 10) || null;
      const id = 'm' + Date.now(), now = Date.now();
      state.items[id] = { id, anilistId: null, title: name, titles: {}, cover: '', color: null, total, status: t.dataset.v,
        progress: 0, score: null, notes: '', customTitle: '', genres: [], plan: { days: [], time: '', eps: 1 },
        addedAt: now, updatedAt: now, aired: null, nextEp: null };
      if (t.dataset.v === 'completed' && total) { setProgress(state.items[id], total, { log: false }); state.items[id].status = 'completed'; }
      save(); back();
      setTimeout(() => openDetail({ itemId: id }), 300);
      break;
    }
    case 'time-period': ui.timePeriod = t.dataset.v; ui.timeAll = false; $('#timeCard').innerHTML = timeCardHTML(); setAnimate($('#timeCard')); break;
    case 'time-all': ui.timeAll = !ui.timeAll; $('#timeCard').innerHTML = timeCardHTML(); break;
    case 'set-listview': state.settings.listView = t.dataset.v; save(); buzz(8); renderProfile(); toast(t.dataset.v === 'map' ? 'Мой список: карта' : t.dataset.v === 'rows' ? 'Мой список: строки' : 'Мой список: сетка'); break;
    case 'set-perf': state.settings.perf = t.dataset.v; applyTheme(); save(); buzz(8); renderProfile(); toast(isLite() ? 'Плавность: быстро' : 'Плавность: красиво'); break;
    case 'set-skin': switchSkin(t.dataset.v, t); break;
    case 'set-lang': state.settings.titleLang = t.dataset.v; save(); renderProfile(); break;
    case 'set-theme': state.settings.theme = t.dataset.v; applyTheme(); save(); renderProfile(); break;
    case 'refresh': syncAll(false); break;
    case 'export': exportData(); break;
    case 'import': $('#importFile').click(); break;
    case 'install':
      if (ui.deferredInstall) { ui.deferredInstall.prompt(); ui.deferredInstall.userChoice.finally(() => { ui.deferredInstall = null; renderCurrent(true); }); }
      break;
  }
});
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="button"][data-action]')) { e.preventDefault(); e.target.click(); }
  if (e.key === 'Escape' && ui.overlays.length) back();
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.matches('#swEp, #swPlan')) { toggleNotify(t.dataset.k, t.checked, t); return; }
  if (t.id === 'swGlass') { state.settings.glass = t.checked; applyTheme(); save(); buzz(8); return; }
  if (t.id === 'swEdge') { state.settings.edgeGesture = t.checked; save(); buzz(8); toast(t.checked ? 'Жест включён: два свайпа от левого края' : 'Жест выключен'); return; }
  if (t.id === 'qTimeCustom') { quick.time = t.value; renderQuick(); return; }
  if (t.id === 'importFile' && t.files && t.files[0]) { importData(t.files[0]); t.value = ''; return; }
  if (t.dataset.pickDay != null) {
    const item = state.items[t.dataset.id], di = +t.dataset.pickDay;
    if (!item) return;
    item.plan = item.plan || { days: [], time: '', eps: 1 };
    item.plan.days = t.checked ? [...new Set(item.plan.days.concat(di))].sort() : item.plan.days.filter(x => x !== di);
    item.updatedAt = Date.now(); save(); buzz(8);
    if (ui.tab === 'schedule' && $('#daybar')) { renderDaybar(); renderDay(); } else if (ui.tab === 'home') renderHome(['today']);
    return;
  }
  const v = ui.detailStack.length ? dvm() : null;
  const it = v && v.it;
  if (!it) return;
  if (t.id === 'planTime') { it.plan.time = t.value; it.updatedAt = Date.now(); save(); }
  else if (t.id === 'planEps') {
    let n = parseInt(t.value, 10); if (isNaN(n) || n < 1) n = 1;
    it.plan.eps = Math.min(50, n); t.value = it.plan.eps; it.updatedAt = Date.now(); save();
  }
});
document.addEventListener('input', e => {
  const t = e.target;
  const v = ui.detailStack.length ? dvm() : null;
  const it = v && v.it;
  if (!it) return;
  if (t.id === 'notes') { it.notes = t.value; it.updatedAt = Date.now(); save(); }
  else if (t.id === 'customTitle') {
    it.customTitle = t.value.trim(); it.updatedAt = Date.now(); save();
    const h = $('#dTitle'); if (h) h.textContent = title(it);
    const tt = $('#dTop .ttl'); if (tt) tt.textContent = title(it);
  }
});
window.addEventListener('resize', () => { moveDayInd(true); });
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); ui.deferredInstall = e; if (ui.tab === 'home' || ui.tab === 'profile') renderCurrent(true); });
window.addEventListener('appinstalled', () => { ui.deferredInstall = null; renderCurrent(true); celebrate(); toast('Бангуми установлен'); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flush();
  else if (Date.now() - state.lastSync > 30 * 60 * 1000) syncAll(true).then(startupCheck);
});
matchMedia('(prefers-color-scheme: light)').addEventListener('change', applyTheme);
setInterval(() => {
  if (document.visibilityState !== 'visible' || ui.overlays.length) return;
  if (ui.tab === 'schedule' && $('#dayContent')) renderDay();
  else if (ui.tab === 'home' && $('#homeBody')) renderHome(['soon']);
}, 60 * 1000);

/* ================= Обновления ================= */
const APP_VERSION = 12;
const bootAt = Date.now();
let launchedWithShare = false;
function setupUpdates() {
  const sw = navigator.serviceWorker;
  const hadController = !!sw.controller;
  let reloading = false;
  sw.register('sw.js', { updateViaCache: 'none' }).then(reg => {
    setupPeriodicSync();
    reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
  // Новая версия встала на место старой
  sw.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    const quiet = Date.now() - bootAt < 12000 && !ui.overlays.length && !launchedWithShare;
    if (quiet) { reloading = true; flush().finally(() => location.reload()); return; }
    toast('Бангуми обновился', { action: 'Перезапустить', ms: 12000, fn: () => { reloading = true; flush().finally(() => location.reload()); } });
  });
}

/* ================= Старт ================= */
(async function start() {
  await load();
  if (document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true }));
  applyTheme();
  const h = (location.hash || '').replace('#', '');
  const wantQuick = new URLSearchParams(location.search).has('quick');
  ui.tab = TABS[h] ? h : (wantQuick ? 'schedule' : 'home');
  const launchSearch = location.search;
  history.replaceState(null, '', location.pathname + '#' + ui.tab);
  render(true);
  if (wantQuick) openQuick(true);
  else launchedWithShare = Share.fromLaunch(launchSearch);
  if ('serviceWorker' in navigator) setupUpdates();
  await syncAll(true);
  scheduleNative();
  startupCheck();
})();
