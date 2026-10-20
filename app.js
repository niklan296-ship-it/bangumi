'use strict';
/* Бангуми — список аниме и расписание. Данные хранятся на телефоне (IndexedDB),
   сведения о тайтлах и датах выхода серий берутся из открытого API AniList. */

const STATUSES = [
  { id: 'watching', label: 'Смотрю' },
  { id: 'planned', label: 'В планах' },
  { id: 'paused', label: 'Отложено' },
  { id: 'completed', label: 'Просмотрено' },
  { id: 'dropped', label: 'Брошено' }
];
const ST = Object.fromEntries(STATUSES.map(s => [s.id, s]));
const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const KANJI = ['月', '火', '水', '木', '金', '土', '日'];
const FORMAT = { TV: 'TV', TV_SHORT: 'TV-короткий', MOVIE: 'Фильм', SPECIAL: 'Спешл', OVA: 'OVA', ONA: 'ONA', MUSIC: 'Клип' };
const AIR = { RELEASING: 'Выходит', FINISHED: 'Завершено', NOT_YET_RELEASED: 'Анонс', CANCELLED: 'Отменено', HIATUS: 'Перерыв' };
const SEASON_RU = { WINTER: 'Зима', SPRING: 'Весна', SUMMER: 'Лето', FALL: 'Осень' };
const TITLES = { schedule: 'Расписание', list: 'Мой список', search: 'Поиск', more: 'Ещё' };

const MEDIA_FULL = MEDIA_FIELDS + ' description(asHtml:false)';
const Q_SEARCH = `query($q:String){Page(perPage:30){media(search:$q,type:ANIME,sort:SEARCH_MATCH,isAdult:false){${MEDIA_FULL}}}}`;
const Q_SEASON = `query($s:MediaSeason,$y:Int){Page(perPage:30){media(season:$s,seasonYear:$y,type:ANIME,sort:POPULARITY_DESC,isAdult:false){${MEDIA_FULL}}}}`;
const Q_BY_IDS = `query($ids:[Int]){Page(perPage:50){media(id_in:$ids){${MEDIA_FIELDS}}}}`;

let state = defaultState();
const ui = {
  tab: 'schedule', weekOffset: 0, selDay: dayIndexMon(new Date()), schedFilter: 'all', listFilter: 'watching',
  query: '', results: null, searching: false, searchError: null, searchToken: 0,
  season: null, seasonError: null, seasonLoading: false,
  weekAir: {}, weekLoading: false, weekError: false,
  media: {}, sheet: null, confirmDelete: false,
  deferredInstall: null, swReg: null, syncing: false
};

function defaultState() {
  return {
    v: 1, items: {}, airCache: {}, lastSync: 0,
    settings: { titleLang: 'romaji', theme: 'system', notifyEpisodes: false, notifyPlan: false }
  };
}

/* ---------- утилиты ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nowSec = () => Math.floor(Date.now() / 1000);
const pad = n => String(n).padStart(2, '0');
const title = it => itemTitle(it, state.settings.titleLang);

function fmtTime(sec) { const d = new Date(sec * 1000); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function fmtJST(sec) {
  try { return new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' }).format(new Date(sec * 1000)); }
  catch (e) { return ''; }
}
function fmtDay(sec) {
  const d = new Date(sec * 1000);
  return DAYS[dayIndexMon(d)].toLowerCase() + ', ' + d.getDate() + ' ' + new Intl.DateTimeFormat('ru-RU', { month: 'short' }).format(d).replace('.', '');
}
function until(sec) {
  let s = Math.max(0, sec - nowSec());
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60);
  if (d > 0) return d + ' дн ' + h + ' ч';
  if (h > 0) return h + ' ч ' + m + ' мин';
  return m + ' мин';
}
function weekStart(offset) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - dayIndexMon(d) + offset * 7);
  return d;
}
function weekLabel(start) {
  const end = new Date(start); end.setDate(end.getDate() + 6);
  const mon = d => new Intl.DateTimeFormat('ru-RU', { month: 'short' }).format(d).replace('.', '');
  if (start.getMonth() === end.getMonth()) return start.getDate() + '–' + end.getDate() + ' ' + mon(end);
  return start.getDate() + ' ' + mon(start) + ' – ' + end.getDate() + ' ' + mon(end);
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
  return String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim();
}
function computeAired(m) {
  if (m.status === 'FINISHED') return m.episodes || null;
  if (m.nextAiringEpisode) return m.nextAiringEpisode.episode - 1;
  if (m.status === 'NOT_YET_RELEASED') return 0;
  return m.episodes || null;
}
function newEps(it) {
  if (it.aired == null) return 0;
  return Math.max(0, it.aired - (it.progress || 0));
}
function coverHtml(src, name, cls) {
  if (src) return `<img class="cover ${cls || ''}" src="${esc(src)}" alt="" loading="lazy" decoding="async">`;
  const ch = (name || '?').trim().charAt(0).toUpperCase();
  return `<div class="cover ph ${cls || ''}" aria-hidden="true">${esc(ch)}</div>`;
}
function byAni() {
  const map = {};
  Object.values(state.items).forEach(i => { if (i.anilistId) map[i.anilistId] = i; });
  return map;
}
function activeStatus(s) { return s === 'watching' || s === 'planned' || s === 'paused'; }

/* ---------- сохранение ---------- */
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 250);
}
async function flush() {
  clearTimeout(saveTimer);
  try { await DB.set('state', state); }
  catch (e) {
    try { localStorage.setItem('bangumi-state', JSON.stringify(state)); } catch (e2) { /* нет места */ }
  }
}
async function load() {
  let s = null;
  try { s = await DB.get('state'); } catch (e) { /* IndexedDB недоступна */ }
  if (!s) { try { s = JSON.parse(localStorage.getItem('bangumi-state') || 'null'); } catch (e) { s = null; } }
  if (s && s.items) {
    const d = defaultState();
    state = Object.assign(d, s, { settings: Object.assign(d.settings, s.settings || {}) });
    state.airCache = state.airCache || {};
  }
  Object.entries(state.airCache).forEach(([k, v]) => { ui.weekAir[k] = v.list; });
}

/* ---------- тема ---------- */
function applyTheme() {
  const t = state.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  else document.documentElement.removeAttribute('data-theme');
}

/* ---------- тост ---------- */
let toastTimer = null, toastFn = null;
function toast(msg, actionLabel, fn, ms) {
  const el = $('#toast');
  toastFn = fn || null;
  el.innerHTML = `<span>${esc(msg)}</span>` + (actionLabel ? `<button type="button" data-action="toast-action">${esc(actionLabel)}</button>` : '');
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; toastFn = null; }, ms || 3800);
}

/* ---------- AniList ---------- */
function rememberMedia(list) { (list || []).forEach(m => { ui.media[m.id] = m; }); }

function itemFromMedia(m, status) {
  const t = Date.now();
  return {
    id: 'a' + m.id, anilistId: m.id, titles: m.title, synonyms: m.synonyms || [],
    cover: (m.coverImage && (m.coverImage.large || m.coverImage.medium)) || '',
    total: m.episodes || null, duration: m.duration || null, airStatus: m.status, format: m.format,
    season: m.season, seasonYear: m.seasonYear, siteUrl: m.siteUrl, genres: m.genres || [],
    nextEp: m.nextAiringEpisode || null, aired: computeAired(m),
    status, progress: 0, score: null, notes: '', customTitle: '',
    plan: { days: [], time: '', eps: 1 }, addedAt: t, updatedAt: t
  };
}
function updateFromMedia(it, m) {
  it.titles = m.title; it.synonyms = m.synonyms || it.synonyms || [];
  it.cover = (m.coverImage && (m.coverImage.large || m.coverImage.medium)) || it.cover;
  it.total = m.episodes || it.total || null; it.duration = m.duration || it.duration;
  it.airStatus = m.status; it.format = m.format; it.season = m.season; it.seasonYear = m.seasonYear;
  it.siteUrl = m.siteUrl; it.genres = m.genres || it.genres || [];
  it.nextEp = m.nextAiringEpisode || null; it.aired = computeAired(m);
}

async function syncAll(quiet) {
  if (ui.syncing) return;
  const ids = Object.values(state.items).filter(i => i.anilistId).map(i => i.anilistId);
  ui.syncing = true;
  try {
    const map = byAni();
    for (let i = 0; i < ids.length; i += 50) {
      const d = await gql(Q_BY_IDS, { ids: ids.slice(i, i + 50) });
      (d.Page.media || []).forEach(m => { if (map[m.id]) updateFromMedia(map[m.id], m); });
    }
    state.lastSync = Date.now();
    await flush();
    await loadWeek(ui.weekOffset, true);
    if (!quiet) toast('Данные обновлены');
  } catch (e) {
    if (!quiet) toast('Не удалось обновить: нет связи с AniList');
  } finally {
    ui.syncing = false;
    render();
  }
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
  if (ui.tab === 'schedule') renderSchedule();
  try {
    const from = start.getTime() / 1000 - 1;
    const list = await fetchSchedules(ids, from, from + 7 * 86400 + 1);
    ui.weekAir[key] = list;
    state.airCache[key] = { at: Date.now(), ids: ids.join(','), list };
    const keys = Object.keys(state.airCache).sort();
    while (keys.length > 4) delete state.airCache[keys.shift()];
    save();
  } catch (e) {
    ui.weekError = true;
  } finally {
    ui.weekLoading = false;
    if (ui.tab === 'schedule') renderSchedule();
  }
}

/* ---------- расписание ---------- */
function weekEvents(offset) {
  const start = weekStart(offset);
  const s0 = start.getTime() / 1000, s1 = s0 + 7 * 86400;
  const key = String(s0);
  const map = byAni();
  const days = Array.from({ length: 7 }, () => []);
  let air = ui.weekAir[key];
  if (!air) {
    air = Object.values(state.items)
      .filter(i => i.anilistId && i.nextEp && activeStatus(i.status))
      .map(i => ({ mediaId: i.anilistId, episode: i.nextEp.episode, airingAt: i.nextEp.airingAt }));
  }
  air.forEach(a => {
    if (a.airingAt < s0 || a.airingAt >= s1) return;
    const it = map[a.mediaId];
    if (!it || !activeStatus(it.status)) return;
    const d = new Date(a.airingAt * 1000);
    days[dayIndexMon(d)].push({ kind: 'air', it, ep: a.episode, at: a.airingAt, min: d.getHours() * 60 + d.getMinutes() });
  });
  Object.values(state.items).forEach(it => {
    if (!(it.status === 'watching' || it.status === 'planned') || !it.plan || !it.plan.days || !it.plan.days.length) return;
    it.plan.days.forEach(di => {
      let min = -1;
      if (it.plan.time) { const [h, m] = it.plan.time.split(':'); min = (+h) * 60 + (+m); }
      days[di].push({ kind: 'plan', it, min, eps: it.plan.eps || 1 });
    });
  });
  days.forEach(list => list.sort((a, b) => a.min - b.min || (a.kind === 'air' ? -1 : 1)));
  return { start, days };
}

function nextUp() {
  const n = nowSec();
  let best = null;
  Object.values(state.items).forEach(it => {
    if (!activeStatus(it.status) || !it.nextEp || it.nextEp.airingAt <= n) return;
    if (!best || it.nextEp.airingAt < best.nextEp.airingAt) best = it;
  });
  return best;
}

function installBanner() {
  if (!ui.deferredInstall) return '';
  return `<div class="install"><p>Установи Бангуми на главный экран — будет работать как обычное приложение.</p>
    <button class="btn small" type="button" data-action="install">Установить</button></div>`;
}

function renderSchedule() {
  const el = $('#view-schedule');
  const items = Object.values(state.items);
  if (!items.length) {
    el.innerHTML = installBanner() + `<div class="empty">
      <h2 class="h2">Здесь будет твоя телепрограмма</h2>
      <p>Добавь аниме через поиск. Даты выхода новых серий появятся тут сами, а свои дни просмотра ты расставишь в карточке тайтла.</p>
      <a class="btn primary" href="#search">Найти аниме</a></div>`;
    return;
  }
  const { start, days } = weekEvents(ui.weekOffset);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const n = nowSec();
  const nu = nextUp();
  let html = installBanner();

  if (nu) {
    html += `<button type="button" class="card next-up" data-action="open-item" data-id="${esc(nu.id)}" style="text-align:left;width:100%">
      ${coverHtml(nu.cover, title(nu))}
      <div class="info">
        <span class="label">Следующая серия</span>
        <span class="t">${esc(title(nu))}</span>
        <span class="countdown">${esc(until(nu.nextEp.airingAt))}</span>
        <span class="muted" style="font-size:13px"><span class="ep">EP ${nu.nextEp.episode}</span> ${esc(fmtDay(nu.nextEp.airingAt))}, ${fmtTime(nu.nextEp.airingAt)}</span>
      </div></button>`;
  }

  html += `<div class="week-nav">
    <button class="icon-btn" type="button" data-action="week-prev" aria-label="Прошлая неделя"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>
    <span class="range">${esc(weekLabel(start))}${ui.weekOffset === 0 ? '' : ''}</span>
    ${ui.weekOffset !== 0 ? `<button class="btn small" type="button" data-action="week-today">Сегодня</button>` : ''}
    ${ui.weekLoading ? '<span class="spinner" aria-label="Загрузка"></span>' : ''}
    <button class="icon-btn" type="button" data-action="week-next" aria-label="Следующая неделя"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>
  </div>`;

  html += '<div class="days" role="group" aria-label="Дни недели">';
  for (let i = 0; i < 7; i++) {
    const d = new Date(start); d.setDate(d.getDate() + i);
    const isToday = d.getTime() === today.getTime();
    const airN = days[i].filter(e => e.kind === 'air').length;
    const planN = days[i].filter(e => e.kind === 'plan').length;
    const dots = '<i></i>'.repeat(Math.min(airN, 3)) + '<i class="plan"></i>'.repeat(Math.min(planN, Math.max(0, 3 - Math.min(airN, 3))));
    html += `<button type="button" class="day${isToday ? ' today' : ''}" data-action="day" data-d="${i}" aria-pressed="${ui.selDay === i}" aria-label="${DAYS[i]} ${d.getDate()}">
      <span class="kanji">${KANJI[i]}</span><span class="dn">${DAYS[i]}</span><span class="dd">${d.getDate()}</span><span class="dots">${dots}</span></button>`;
  }
  html += '</div>';

  const f = ui.schedFilter;
  const all = days[ui.selDay];
  const cnt = { all: all.length, air: all.filter(e => e.kind === 'air').length, plan: all.filter(e => e.kind === 'plan').length };
  html += `<div class="chips" role="group" aria-label="Что показывать">
    <button type="button" class="chip" data-action="sched-filter" data-f="all" aria-pressed="${f === 'all'}">Всё <span class="n">${cnt.all}</span></button>
    <button type="button" class="chip" data-action="sched-filter" data-f="air" aria-pressed="${f === 'air'}">Выход серий <span class="n">${cnt.air}</span></button>
    <button type="button" class="chip" data-action="sched-filter" data-f="plan" aria-pressed="${f === 'plan'}">Мой план <span class="n">${cnt.plan}</span></button>
  </div>`;

  const list = all.filter(e => f === 'all' || e.kind === f);
  const selDate = new Date(start); selDate.setDate(selDate.getDate() + ui.selDay);
  const isSelToday = selDate.getTime() === today.getTime();
  const isSelPast = selDate.getTime() < today.getTime();
  if (!list.length) {
    const msg = f === 'plan'
      ? 'На этот день ничего не запланировано. Открой тайтл и отметь дни, когда хочешь его смотреть.'
      : f === 'air' ? 'В этот день новых серий из твоего списка нет.' : 'Свободный день: ни выходов, ни планов.';
    html += `<div class="empty"><p>${esc(msg)}</p></div>`;
  } else {
    html += '<div class="timeline">';
    const curMin = new Date().getHours() * 60 + new Date().getMinutes();
    list.forEach(e => {
      const it = e.it;
      if (e.kind === 'air') {
        const past = e.at <= n;
        html += `<div class="slot air${past ? ' past' : ''}">
          <div class="time"><b>${fmtTime(e.at)}</b><small>JST ${esc(fmtJST(e.at))}</small></div>
          <div class="rail"><button type="button" class="prog" data-action="open-item" data-id="${esc(it.id)}">
            ${coverHtml(it.cover, title(it))}
            <div class="body"><span class="t">${esc(title(it))}</span>
              <span class="sub"><span class="ep">EP ${e.ep}</span>${past ? 'вышла' : 'выходит'}${it.total ? ' · из ' + it.total : ''}</span></div>
          </button></div></div>`;
      } else {
        const from = (it.progress || 0) + 1;
        const to = it.total ? Math.min(it.total, from + e.eps - 1) : from + e.eps - 1;
        const epTxt = from === to ? 'EP ' + from : 'EP ' + from + '–' + to;
        const past = isSelPast || (isSelToday && e.min >= 0 && e.min + 60 < curMin);
        const showEp = !isSelPast && (!it.total || from <= it.total);
        html += `<div class="slot plan${past ? ' past' : ''}">
          <div class="time"><b>${e.min >= 0 ? pad(Math.floor(e.min / 60)) + ':' + pad(e.min % 60) : '—'}</b><small>план</small></div>
          <div class="rail"><button type="button" class="prog" data-action="open-item" data-id="${esc(it.id)}">
            ${coverHtml(it.cover, title(it))}
            <div class="body"><span class="t">${esc(title(it))}</span>
              <span class="sub">${showEp ? `<span class="ep outline">${epTxt}</span>` : ''}${e.eps} ${e.eps === 1 ? 'серия' : e.eps < 5 ? 'серии' : 'серий'}</span></div>
          </button></div></div>`;
      }
    });
    html += '</div>';
  }
  if (ui.weekError) html += `<p class="hint">Нет связи с AniList — показываю последние сохранённые даты.</p>`;
  el.innerHTML = html;
}

/* ---------- мой список ---------- */
function renderList() {
  const el = $('#view-list');
  const items = Object.values(state.items);
  if (!items.length) {
    el.innerHTML = `<div class="empty"><h2 class="h2">Список пока пуст</h2>
      <p>Найди аниме по названию и добавь со статусом «Смотрю» или «В планах».</p>
      <a class="btn primary" href="#search">Найти аниме</a></div>`;
    return;
  }
  const counts = {};
  STATUSES.forEach(s => { counts[s.id] = 0; });
  items.forEach(i => { counts[i.status] = (counts[i.status] || 0) + 1; });
  let html = '<div class="chips" role="group" aria-label="Статус">';
  STATUSES.forEach(s => {
    html += `<button type="button" class="chip" data-action="list-filter" data-f="${s.id}" aria-pressed="${ui.listFilter === s.id}">
      <span class="status-dot s-${s.id}"></span>${s.label} <span class="n">${counts[s.id]}</span></button>`;
  });
  html += '</div>';
  const list = items.filter(i => i.status === ui.listFilter)
    .sort((a, b) => (newEps(b) > 0) - (newEps(a) > 0) || b.updatedAt - a.updatedAt);
  if (!list.length) {
    html += `<div class="empty"><p>В «${esc(ST[ui.listFilter].label)}» пока ничего нет.</p></div>`;
  } else {
    html += '<div class="list">';
    list.forEach(it => {
      const total = it.total;
      const pct = total ? Math.min(100, Math.round((it.progress / total) * 100)) : (it.progress ? 100 : 0);
      const ne = newEps(it);
      const canInc = activeStatus(it.status) && (!total || it.progress < total);
      const meta = [FORMAT[it.format] || '', it.season ? SEASON_RU[it.season] + ' ' + it.seasonYear : (it.seasonYear || ''), it.airStatus === 'RELEASING' ? 'выходит' : ''].filter(Boolean).join(' · ');
      html += `<div class="card row s-${it.status}">
        <button type="button" class="open" data-action="open-item" data-id="${esc(it.id)}">
          ${coverHtml(it.cover, title(it))}
          <div class="body">
            <span class="t">${esc(title(it))}</span>
            <span class="meta">${esc(meta)}${it.score ? `<span class="score">★ ${it.score}</span>` : ''}${ne > 0 && activeStatus(it.status) ? `<span class="new-badge">+${ne} ${ne === 1 ? 'новая' : 'новых'}</span>` : ''}</span>
            <span class="progline"><span class="bar"><i style="width:${pct}%"></i></span>${it.progress} / ${total || '?'}</span>
          </div>
        </button>
        ${canInc ? `<button type="button" class="plus" data-action="inc" data-id="${esc(it.id)}" aria-label="Отметить серию ${it.progress + 1}">+1</button>` : ''}
      </div>`;
    });
    html += '</div>';
  }
  el.innerHTML = html;
}

function incEpisode(id) {
  const it = state.items[id];
  if (!it) return;
  const before = { progress: it.progress, status: it.status };
  it.progress = (it.progress || 0) + 1;
  if (it.status === 'planned' || it.status === 'paused') it.status = 'watching';
  it.updatedAt = Date.now();
  save(); render();
  if (it.total && it.progress >= it.total) {
    toast('Последняя серия! Отметить «Просмотрено»?', 'Да', () => {
      it.status = 'completed'; it.updatedAt = Date.now(); save(); render(); toast('Перенесено в «Просмотрено»');
    }, 6000);
  } else {
    toast('EP ' + it.progress + ' — ' + title(it), 'Отменить', () => {
      it.progress = before.progress; it.status = before.status; save(); render();
    });
  }
}

/* ---------- поиск ---------- */
function renderSearch() {
  const el = $('#view-search');
  if (!el.dataset.ready) {
    el.innerHTML = `<div class="searchbox">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20.5 20.5"/></svg>
        <input id="q" type="search" placeholder="Название: Frieren, Ван Пис…" autocomplete="off" enterkeyhint="search" aria-label="Поиск аниме">
      </div>
      <div id="searchBody" class="view"></div>`;
    el.dataset.ready = '1';
    $('#q').addEventListener('input', onSearchInput);
  }
  const body = $('#searchBody');
  const map = byAni();
  const tiles = list => '<div class="grid">' + list.map(m => {
    const inList = map[m.id];
    const t = itemTitle({ titles: m.title }, state.settings.titleLang);
    const nx = m.nextAiringEpisode ? `<span class="nx">EP ${m.nextAiringEpisode.episode} · ${DAYS[dayIndexMon(new Date(m.nextAiringEpisode.airingAt * 1000))]}</span>` : '';
    return `<button type="button" class="tile" data-action="open-media" data-ani="${m.id}">
      <span class="poster">${coverHtml(m.coverImage && (m.coverImage.large || m.coverImage.medium), t)}
        ${inList ? `<span class="in s-${inList.status}">${esc(ST[inList.status].label)}</span>` : ''}${nx}</span>
      <span class="t">${esc(t)}</span>
      <span class="muted" style="font-size:12px">${esc([FORMAT[m.format] || '', m.episodes ? m.episodes + ' сер.' : '', m.seasonYear || ''].filter(Boolean).join(' · '))}</span>
    </button>`;
  }).join('') + '</div>';

  let html = '';
  if (ui.query.trim().length >= 2) {
    if (ui.searching && !ui.results) html += `<div class="loading"><span class="spinner"></span>Ищу «${esc(ui.query)}»…</div>`;
    else if (ui.searchError) html += `<div class="empty"><p>Не получилось связаться с AniList. Проверь интернет и попробуй ещё раз.</p></div>`;
    else if (ui.results && !ui.results.length) html += `<div class="empty"><p>Ничего не нашлось. AniList лучше понимает английские и японские названия (ромадзи), например «Shingeki no Kyojin».</p></div>`;
    else if (ui.results) html += `<div class="label">Найдено: ${ui.results.length}</div>` + tiles(ui.results);
  } else {
    const cs = currentSeason();
    html += `<div class="label">Популярное · ${SEASON_RU[cs.s]} ${cs.y}</div>`;
    if (ui.season) html += tiles(ui.season);
    else if (ui.seasonError) html += `<div class="empty"><p>Без интернета список сезона недоступен. Твой список и расписание работают и офлайн.</p><button class="btn small" type="button" data-action="season-retry">Повторить</button></div>`;
    else html += `<div class="loading"><span class="spinner"></span>Загружаю сезон…</div>`;
  }
  html += `<div class="empty"><p>Нет нужного тайтла в базе? Добавь его вручную: название и число серий.</p>
    <button class="btn small" type="button" data-action="manual-open">Добавить вручную</button></div>`;
  body.innerHTML = html;
}

let searchTimer = null;
function onSearchInput(e) {
  ui.query = e.target.value;
  clearTimeout(searchTimer);
  if (ui.query.trim().length < 2) { ui.results = null; ui.searchError = null; renderSearch(); return; }
  searchTimer = setTimeout(doSearch, 450);
}
async function doSearch() {
  const q = ui.query.trim();
  const token = ++ui.searchToken;
  ui.searching = true; ui.searchError = null; ui.results = null; renderSearch();
  try {
    const d = await gql(Q_SEARCH, { q });
    if (token !== ui.searchToken) return;
    ui.results = d.Page.media || [];
    rememberMedia(ui.results);
  } catch (e) {
    if (token !== ui.searchToken) return;
    ui.searchError = e.message || 'error';
  } finally {
    if (token === ui.searchToken) { ui.searching = false; renderSearch(); }
  }
}
async function loadSeason() {
  if (ui.season || ui.seasonLoading) return;
  ui.seasonLoading = true; ui.seasonError = null;
  const cs = currentSeason();
  try {
    const d = await gql(Q_SEASON, { s: cs.s, y: cs.y });
    ui.season = d.Page.media || [];
    rememberMedia(ui.season);
  } catch (e) {
    ui.seasonError = e.message || 'error';
  } finally {
    ui.seasonLoading = false;
    if (ui.tab === 'search') renderSearch();
  }
}

/* ---------- ещё ---------- */
function renderMore() {
  const el = $('#view-more');
  const items = Object.values(state.items);
  const eps = items.reduce((s, i) => s + (i.progress || 0), 0);
  const mins = items.reduce((s, i) => s + (i.progress || 0) * (i.duration || 24), 0);
  const done = items.filter(i => i.status === 'completed').length;
  const s = state.settings;
  const perm = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
  const permTxt = perm === 'granted' ? 'Разрешены' : perm === 'denied' ? 'Запрещены в настройках Android — включи их для Бангуми' : perm === 'unsupported' ? 'Этот браузер не поддерживает уведомления' : 'Ещё не разрешены';
  const seg = (action, cur, opts) => `<div class="seg" role="group">${opts.map(o => `<button type="button" data-action="${action}" data-v="${o[0]}" aria-pressed="${cur === o[0]}">${o[1]}</button>`).join('')}</div>`;
  const sync = state.lastSync ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(state.lastSync)) : 'ещё не обновлялось';

  el.innerHTML = installBanner() + `
    <div class="stats">
      <div class="card stat"><b>${eps}</b><span>серий просмотрено</span></div>
      <div class="card stat"><b>${Math.round(mins / 60)}</b><span>часов за экраном</span></div>
      <div class="card stat"><b>${done}</b><span>тайтлов завершено</span></div>
    </div>

    <div class="label">Уведомления</div>
    <div class="card group">
      <div class="setting"><div class="txt"><span>О новых сериях</span><small>Когда выходит серия того, что ты смотришь или запланировал</small></div>
        <label class="switch"><input type="checkbox" id="swEp" data-action="toggle-notify" data-k="notifyEpisodes" ${s.notifyEpisodes ? 'checked' : ''} aria-label="Уведомления о новых сериях"><span></span></label></div>
      <div class="setting"><div class="txt"><span>О моём плане на день</span><small>Напоминание, что сегодня по расписанию</small></div>
        <label class="switch"><input type="checkbox" id="swPlan" data-action="toggle-notify" data-k="notifyPlan" ${s.notifyPlan ? 'checked' : ''} aria-label="Напоминания о плане"><span></span></label></div>
      <div class="setting"><div class="txt"><small>Статус: ${esc(permTxt)}. Android проверяет новые серии в фоне раз в несколько часов, а при каждом открытии приложения — сразу.</small></div></div>
    </div>

    <div class="label">Вид</div>
    <div class="card group">
      <div class="setting"><div class="txt"><span>Названия</span></div>${seg('set-lang', s.titleLang, [['romaji', 'Ромадзи'], ['english', 'English']])}</div>
      <div class="setting"><div class="txt"><span>Тема</span></div>${seg('set-theme', s.theme, [['system', 'Авто'], ['light', 'Светлая'], ['dark', 'Тёмная']])}</div>
    </div>

    <div class="label">Данные</div>
    <div class="card group">
      <div class="setting"><div class="txt"><span>Обновить с AniList</span><small>Последний раз: ${esc(sync)}</small></div>
        <button class="btn small" type="button" data-action="refresh" ${ui.syncing ? 'disabled' : ''}>${ui.syncing ? 'Обновляю…' : 'Обновить'}</button></div>
      <div class="setting"><div class="txt"><span>Резервная копия</span><small>Список хранится только на этом телефоне. Сохраняй копию, чтобы не потерять его.</small></div>
        <div class="btn-row"><button class="btn small" type="button" data-action="export">Сохранить</button>
        <button class="btn small" type="button" data-action="import">Загрузить</button></div></div>
    </div>
    <input type="file" id="importFile" accept="application/json,.json" hidden>
    <p class="hint">Сведения о тайтлах и расписание серий — <a class="link" href="https://anilist.co" target="_blank" rel="noopener">AniList</a>. Время выхода показано по твоему часовому поясу, рядом — японское (JST).</p>`;
}

/* ---------- нижний лист ---------- */
function openSheet(kind, data) {
  const wasOpen = !!ui.sheet;
  ui.sheet = { kind, data };
  ui.confirmDelete = false;
  renderSheet();
  $('#sheetRoot').hidden = false;
  document.body.style.overflow = 'hidden';
  if (!wasOpen) history.pushState({ sheet: true }, '');
  $('#sheet').scrollTop = 0;
}
function closeSheet(fromPop) {
  if (!ui.sheet) return;
  ui.sheet = null;
  $('#sheetRoot').hidden = true;
  document.body.style.overflow = '';
  flush();
  render();
  if (!fromPop && history.state && history.state.sheet) history.back();
}
function renderSheet() {
  const sh = ui.sheet;
  if (!sh) return;
  const el = $('#sheet');
  if (sh.kind === 'item') el.innerHTML = itemSheet(state.items[sh.data]);
  else if (sh.kind === 'media') el.innerHTML = mediaSheet(ui.media[sh.data]);
  else if (sh.kind === 'manual') el.innerHTML = manualSheet();
}

function nextLine(next, aired, total) {
  let out = '';
  if (next) out += `<span class="ep">EP ${next.episode}</span> ${esc(fmtDay(next.airingAt))}, ${fmtTime(next.airingAt)} · через ${esc(until(next.airingAt))}`;
  else if (aired != null && total) out += `Вышло ${aired} из ${total}`;
  return out ? `<div class="d-next">${out}</div>` : '';
}

function itemSheet(it) {
  if (!it) return '';
  const alt = it.customTitle ? itemTitle(Object.assign({}, it, { customTitle: '' }), state.settings.titleLang) : (it.titles && it.titles.native) || '';
  const meta = [FORMAT[it.format] || '', it.total ? it.total + ' сер.' : '', it.season ? SEASON_RU[it.season] + ' ' + it.seasonYear : (it.seasonYear || ''), AIR[it.airStatus] || ''].filter(Boolean);
  const p = it.plan || { days: [], time: '', eps: 1 };
  const ne = newEps(it);
  return `<div class="grab"></div>
  <div class="d-head">
    ${coverHtml(it.cover, title(it))}
    <div class="info">
      <h2 class="d-title" id="sheetTitle">${esc(title(it))}</h2>
      ${alt ? `<div class="d-alt">${esc(alt)}</div>` : ''}
      <div class="d-meta">${meta.map(m => `<span>${esc(m)}</span>`).join('')}</div>
      ${nextLine(it.nextEp, it.aired, it.total)}
      ${ne > 0 ? `<div><span class="new-badge">Доступно ещё ${ne}</span></div>` : ''}
      ${it.siteUrl ? `<a class="link" href="${esc(it.siteUrl)}" target="_blank" rel="noopener">Открыть на AniList ↗</a>` : ''}
    </div>
  </div>

  <div class="field"><span class="label">Статус</span>
    <div class="status-pick">${STATUSES.map(s => `<button type="button" class="s-${s.id}" data-action="set-status" data-v="${s.id}" aria-pressed="${it.status === s.id}"><span class="status-dot s-${s.id}"></span>${s.label}</button>`).join('')}</div>
  </div>

  <div class="field"><span class="label">Просмотрено серий</span>
    <div class="stepper">
      <button type="button" data-action="prog-dec" aria-label="Минус серия">−</button>
      <input id="progInput" type="number" inputmode="numeric" min="0" ${it.total ? `max="${it.total}"` : ''} value="${it.progress || 0}" aria-label="Просмотрено серий">
      <button type="button" data-action="prog-inc" aria-label="Плюс серия">+</button>
      <span class="of">из ${it.total || '?'}</span>
    </div>
  </div>

  <div class="field"><span class="label">Оценка${it.score ? ': ' + it.score + ' из 10' : ''}</span>
    <div class="scores" role="group" aria-label="Оценка">${Array.from({ length: 10 }, (_, i) => i + 1).map(v => `<button type="button" data-action="score" data-v="${v}" class="${it.score && v <= it.score ? 'on' : ''}" aria-pressed="${it.score === v}">${v}</button>`).join('')}</div>
  </div>

  <div class="field"><span class="label">Когда смотрю</span>
    <div class="weekpick" role="group" aria-label="Дни просмотра">${DAYS.map((d, i) => `<button type="button" data-action="plan-day" data-v="${i}" aria-pressed="${p.days.includes(i)}">${d}<small>${KANJI[i]}</small></button>`).join('')}</div>
    <div class="plan-row">
      <label for="planTime">Время<input class="input time" id="planTime" type="time" value="${esc(p.time || '')}"></label>
      <label>Серий за раз
        <span class="stepper"><button type="button" data-action="eps-dec" aria-label="Меньше">−</button>
        <input id="planEps" type="number" inputmode="numeric" min="1" max="50" value="${p.eps || 1}" aria-label="Серий за раз">
        <button type="button" data-action="eps-inc" aria-label="Больше">+</button></span></label>
    </div>
    <p class="hint">Выбранные дни появятся во вкладке «Расписание»${state.settings.notifyPlan ? ', и придёт напоминание' : ''}.</p>
  </div>

  <div class="field"><label class="label" for="customTitle">Своё название</label>
    <input class="input" id="customTitle" type="text" placeholder="Например, по-русски" value="${esc(it.customTitle || '')}">
  </div>

  <div class="field"><label class="label" for="notes">Заметки</label>
    <textarea class="textarea" id="notes" placeholder="Где смотрю, с кем, что понравилось…">${esc(it.notes || '')}</textarea>
  </div>

  ${ui.confirmDelete ? `<div class="confirm"><p>Удалить «${esc(title(it))}» из списка?</p>
      <button class="btn small danger" type="button" data-action="delete-yes">Удалить</button>
      <button class="btn small" type="button" data-action="delete-no">Оставить</button></div>`
    : `<div class="btn-row"><button class="btn primary" type="button" data-action="close-sheet" style="flex:1">Готово</button>
      <button class="btn danger" type="button" data-action="delete-ask">Удалить</button></div>`}`;
}

function mediaSheet(m) {
  if (!m) return '';
  const t = itemTitle({ titles: m.title }, state.settings.titleLang);
  const alt = state.settings.titleLang === 'english' ? m.title.romaji : (m.title.english || m.title.native);
  const meta = [FORMAT[m.format] || '', m.episodes ? m.episodes + ' сер.' : '', m.season ? SEASON_RU[m.season] + ' ' + m.seasonYear : (m.seasonYear || ''), AIR[m.status] || '', m.averageScore ? '★ ' + (m.averageScore / 10).toFixed(1) : ''].filter(Boolean);
  const desc = stripHtml(m.description);
  return `<div class="grab"></div>
  <div class="d-head">
    ${coverHtml(m.coverImage && (m.coverImage.large || m.coverImage.medium), t)}
    <div class="info">
      <h2 class="d-title" id="sheetTitle">${esc(t)}</h2>
      ${alt && alt !== t ? `<div class="d-alt">${esc(alt)}</div>` : ''}
      <div class="d-meta">${meta.map(x => `<span>${esc(x)}</span>`).join('')}</div>
      ${nextLine(m.nextAiringEpisode, computeAired(m), m.episodes)}
      ${m.genres && m.genres.length ? `<div class="d-meta">${esc(m.genres.slice(0, 4).join(', '))}</div>` : ''}
    </div>
  </div>
  ${desc ? `<p class="d-desc clamp" data-action="expand">${esc(desc)}</p>` : ''}
  <div class="field"><span class="label">Добавить в список</span>
    <div class="status-pick">${['watching', 'planned', 'completed', 'paused'].map(s => `<button type="button" class="s-${s}" data-action="add-media" data-v="${s}"><span class="status-dot s-${s}"></span>${ST[s].label}</button>`).join('')}</div>
  </div>
  ${m.siteUrl ? `<a class="link" href="${esc(m.siteUrl)}" target="_blank" rel="noopener">Открыть на AniList ↗</a>` : ''}`;
}

function manualSheet() {
  return `<div class="grab"></div>
  <h2 class="d-title" id="sheetTitle">Добавить вручную</h2>
  <div class="field"><label class="label" for="mTitle">Название</label><input class="input" id="mTitle" type="text" placeholder="Название тайтла"></div>
  <div class="field"><label class="label" for="mEps">Всего серий</label><input class="input" id="mEps" type="number" inputmode="numeric" min="1" placeholder="Если не знаешь — оставь пустым"></div>
  <p class="hint">Для тайтлов, добавленных вручную, даты выхода серий не подтягиваются — только твой план.</p>
  <div class="field"><span class="label">Статус</span>
    <div class="status-pick">${['watching', 'planned', 'completed'].map(s => `<button type="button" class="s-${s}" data-action="manual-save" data-v="${s}"><span class="status-dot s-${s}"></span>${ST[s].label}</button>`).join('')}</div>
  </div>`;
}

/* ---------- общий рендер ---------- */
function render() {
  document.querySelectorAll('.tabbar a').forEach(a => {
    const on = a.dataset.tab === ui.tab;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  ['schedule', 'list', 'search', 'more'].forEach(t => { $('#view-' + t).hidden = t !== ui.tab; });
  $('#pageTitle').textContent = TITLES[ui.tab];
  const cs = currentSeason();
  $('#seasonLabel').textContent = SEASON_RU[cs.s] + ' ' + cs.y;
  if (ui.tab === 'schedule') renderSchedule();
  else if (ui.tab === 'list') renderList();
  else if (ui.tab === 'search') { renderSearch(); loadSeason(); }
  else renderMore();
}

function route() {
  const h = (location.hash || '').replace('#', '');
  ui.tab = TITLES[h] ? h : 'schedule';
  render();
  window.scrollTo(0, 0);
}

/* ---------- уведомления ---------- */
async function getReg() {
  if (!('serviceWorker' in navigator)) return null;
  try { return await navigator.serviceWorker.ready; } catch (e) { return null; }
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
async function toggleNotify(key, on, input) {
  if (on) {
    if (typeof Notification === 'undefined') { input.checked = false; toast('Уведомления здесь не поддерживаются'); return; }
    let perm = Notification.permission;
    if (perm === 'default') { try { perm = await Notification.requestPermission(); } catch (e) { perm = 'denied'; } }
    if (perm !== 'granted') {
      input.checked = false;
      toast('Разреши уведомления: Настройки Android → Приложения → Бангуми → Уведомления', null, null, 6000);
      renderMore();
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
  renderMore();
  toast(on ? 'Уведомления включены' : 'Уведомления выключены');
}
async function startupCheck() {
  if (!state.settings.notifyEpisodes && !state.settings.notifyPlan) return;
  const reg = await getReg();
  try {
    const r = await runBackgroundCheck(reg);
    if (r.aired && r.aired.length) render();
  } catch (e) { /* без сети */ }
}

/* ---------- резервная копия ---------- */
function exportData() {
  const blob = new Blob([JSON.stringify({ app: 'bangumi', exportedAt: new Date().toISOString(), state }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const d = new Date();
  a.href = url; a.download = `bangumi-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
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
      Object.values(s.items).forEach(it => {
        if (it && it.id && it.status) { state.items[it.id] = it; n++; }
      });
      if (s.settings) state.settings = Object.assign(state.settings, s.settings);
      applyTheme(); flush(); render();
      toast('Загружено тайтлов: ' + n);
      syncAll(true);
    } catch (e) {
      toast('Это не файл копии Бангуми. Выбери файл bangumi-….json');
    }
  };
  r.readAsText(file);
}

/* ---------- события ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-action]');
  if (!t) return;
  const a = t.dataset.action;
  const sh = ui.sheet;
  const it = sh && sh.kind === 'item' ? state.items[sh.data] : null;
  const touch = () => { if (it) { it.updatedAt = Date.now(); save(); } };

  switch (a) {
    case 'toast-action': { const fn = toastFn; $('#toast').hidden = true; toastFn = null; if (fn) fn(); break; }
    case 'close-sheet': closeSheet(); break;
    case 'open-item': openSheet('item', t.dataset.id); break;
    case 'open-media': {
      const id = +t.dataset.ani;
      const ex = byAni()[id];
      if (ex) openSheet('item', ex.id); else openSheet('media', id);
      break;
    }
    case 'expand': t.classList.toggle('clamp'); break;
    case 'add-media': {
      const m = ui.media[sh.data];
      if (!m) break;
      const item = itemFromMedia(m, t.dataset.v);
      if (t.dataset.v === 'completed' && item.total) item.progress = item.total;
      state.items[item.id] = item;
      save();
      openSheet('item', item.id);
      toast('Добавлено в «' + ST[item.status].label + '»');
      loadWeek(ui.weekOffset, true);
      break;
    }
    case 'manual-save': {
      const name = ($('#mTitle').value || '').trim();
      if (!name) { $('#mTitle').focus(); toast('Впиши название'); break; }
      const total = parseInt($('#mEps').value, 10) || null;
      const id = 'm' + Date.now();
      const now = Date.now();
      state.items[id] = { id, anilistId: null, title: name, titles: {}, cover: '', total, status: t.dataset.v,
        progress: t.dataset.v === 'completed' && total ? total : 0, score: null, notes: '', customTitle: '',
        plan: { days: [], time: '', eps: 1 }, addedAt: now, updatedAt: now, aired: null, nextEp: null };
      save();
      openSheet('item', id);
      break;
    }
    case 'manual-open': openSheet('manual'); break;
    case 'inc': incEpisode(t.dataset.id); break;
    case 'set-status':
      if (!it) break;
      it.status = t.dataset.v;
      if (it.status === 'completed' && it.total) it.progress = it.total;
      touch(); renderSheet(); loadWeek(ui.weekOffset, true);
      break;
    case 'prog-dec': case 'prog-inc':
      if (!it) break;
      it.progress = Math.max(0, (it.progress || 0) + (a === 'prog-inc' ? 1 : -1));
      if (it.total) it.progress = Math.min(it.total, it.progress);
      if (a === 'prog-inc' && (it.status === 'planned' || it.status === 'paused')) it.status = 'watching';
      touch(); renderSheet();
      if (a === 'prog-inc' && it.total && it.progress === it.total && it.status !== 'completed')
        toast('Последняя серия! Отметить «Просмотрено»?', 'Да', () => { it.status = 'completed'; touch(); renderSheet(); }, 6000);
      break;
    case 'score':
      if (!it) break;
      it.score = it.score === +t.dataset.v ? null : +t.dataset.v;
      touch(); renderSheet();
      break;
    case 'plan-day': {
      if (!it) break;
      it.plan = it.plan || { days: [], time: '', eps: 1 };
      const d = +t.dataset.v;
      it.plan.days = it.plan.days.includes(d) ? it.plan.days.filter(x => x !== d) : it.plan.days.concat(d).sort();
      touch();
      t.setAttribute('aria-pressed', it.plan.days.includes(d));
      break;
    }
    case 'eps-dec': case 'eps-inc': {
      if (!it) break;
      it.plan = it.plan || { days: [], time: '', eps: 1 };
      it.plan.eps = Math.min(50, Math.max(1, (it.plan.eps || 1) + (a === 'eps-inc' ? 1 : -1)));
      $('#planEps').value = it.plan.eps;
      touch();
      break;
    }
    case 'delete-ask': ui.confirmDelete = true; renderSheet(); break;
    case 'delete-no': ui.confirmDelete = false; renderSheet(); break;
    case 'delete-yes': {
      if (!it) break;
      const copy = it;
      delete state.items[it.id];
      save(); closeSheet();
      toast('Удалено: ' + title(copy), 'Вернуть', () => { state.items[copy.id] = copy; save(); render(); }, 6000);
      break;
    }
    case 'week-prev': case 'week-next':
      ui.weekOffset += a === 'week-next' ? 1 : -1;
      renderSchedule(); loadWeek(ui.weekOffset);
      break;
    case 'week-today':
      ui.weekOffset = 0; ui.selDay = dayIndexMon(new Date()); renderSchedule(); loadWeek(0);
      break;
    case 'day': ui.selDay = +t.dataset.d; renderSchedule(); break;
    case 'sched-filter': ui.schedFilter = t.dataset.f; renderSchedule(); break;
    case 'list-filter': ui.listFilter = t.dataset.f; renderList(); break;
    case 'season-retry': ui.seasonError = null; renderSearch(); loadSeason(); break;
    case 'set-lang': state.settings.titleLang = t.dataset.v; save(); renderMore(); break;
    case 'set-theme': state.settings.theme = t.dataset.v; applyTheme(); save(); renderMore(); break;
    case 'refresh': syncAll(false); renderMore(); break;
    case 'export': exportData(); break;
    case 'import': $('#importFile').click(); break;
    case 'install':
      if (ui.deferredInstall) {
        ui.deferredInstall.prompt();
        ui.deferredInstall.userChoice.finally(() => { ui.deferredInstall = null; render(); });
      }
      break;
  }
});

document.addEventListener('change', e => {
  const t = e.target;
  const it = ui.sheet && ui.sheet.kind === 'item' ? state.items[ui.sheet.data] : null;
  if (t.dataset.action === 'toggle-notify') { toggleNotify(t.dataset.k, t.checked, t); return; }
  if (t.id === 'importFile' && t.files && t.files[0]) { importData(t.files[0]); t.value = ''; return; }
  if (!it) return;
  if (t.id === 'progInput') {
    let v = parseInt(t.value, 10); if (isNaN(v) || v < 0) v = 0;
    if (it.total) v = Math.min(it.total, v);
    it.progress = v; it.updatedAt = Date.now(); save(); renderSheet();
  } else if (t.id === 'planTime') {
    it.plan.time = t.value; it.updatedAt = Date.now(); save();
  } else if (t.id === 'planEps') {
    let v = parseInt(t.value, 10); if (isNaN(v) || v < 1) v = 1;
    it.plan.eps = Math.min(50, v); t.value = it.plan.eps; it.updatedAt = Date.now(); save();
  }
});

document.addEventListener('input', e => {
  const t = e.target;
  const it = ui.sheet && ui.sheet.kind === 'item' ? state.items[ui.sheet.data] : null;
  if (!it) return;
  if (t.id === 'notes') { it.notes = t.value; it.updatedAt = Date.now(); save(); }
  else if (t.id === 'customTitle') {
    it.customTitle = t.value.trim(); it.updatedAt = Date.now(); save();
    const h = $('#sheetTitle'); if (h) h.textContent = title(it);
  }
});

window.addEventListener('hashchange', route);
window.addEventListener('popstate', () => { if (ui.sheet) closeSheet(true); });
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); ui.deferredInstall = e; render(); });
window.addEventListener('appinstalled', () => { ui.deferredInstall = null; render(); toast('Бангуми установлен'); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flush();
  else if (Date.now() - state.lastSync > 30 * 60 * 1000) { syncAll(true).then(startupCheck); }
});
setInterval(() => { if (ui.tab === 'schedule' && !ui.sheet && document.visibilityState === 'visible') renderSchedule(); }, 60 * 1000);

/* ---------- старт ---------- */
(async function start() {
  await load();
  applyTheme();
  route();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(() => setupPeriodicSync()).catch(() => {});
  }
  if (Object.keys(state.items).length) {
    await syncAll(true);
    startupCheck();
  }
})();
