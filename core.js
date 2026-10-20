/* Бангуми — общее ядро: хранилище, AniList, фоновая проверка серий.
   Подключается и страницей, и service worker'ом (importScripts). */

const ANILIST = 'https://graphql.anilist.co';

const DB = {
  _p: null,
  open() {
    if (!this._p) {
      this._p = new Promise((resolve, reject) => {
        const r = indexedDB.open('bangumi', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    }
    return this._p;
  },
  async get(key) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const q = db.transaction('kv').objectStore('kv').get(key);
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    });
  },
  async set(key, value) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
};

async function gql(query, variables) {
  const r = await fetch(ANILIST, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables })
  });
  let j = null;
  try { j = await r.json(); } catch (e) { /* пусто */ }
  if (!r.ok) {
    const msg = j && j.errors && j.errors[0] ? j.errors[0].message : 'HTTP ' + r.status;
    throw new Error(msg);
  }
  if (j.errors && j.errors.length) throw new Error(j.errors[0].message);
  return j.data;
}

const MEDIA_FIELDS = `id title{romaji english native} synonyms coverImage{large medium color}
  episodes duration status format season seasonYear averageScore genres siteUrl
  nextAiringEpisode{episode airingAt}`;

const Q_SCHEDULES = `query($ids:[Int],$from:Int,$to:Int,$page:Int){
  Page(page:$page,perPage:50){ pageInfo{hasNextPage}
    airingSchedules(mediaId_in:$ids,airingAt_greater:$from,airingAt_lesser:$to,sort:TIME){ episode airingAt mediaId } } }`;

async function fetchSchedules(ids, from, to) {
  let out = [];
  for (let page = 1; page <= 6; page++) {
    const d = await gql(Q_SCHEDULES, { ids, from, to, page });
    out = out.concat(d.Page.airingSchedules || []);
    if (!d.Page.pageInfo.hasNextPage) break;
  }
  return out;
}

function itemTitle(item, pref) {
  if (item.customTitle) return item.customTitle;
  const t = item.titles || {};
  if (pref === 'english') return t.english || t.romaji || t.native || item.title || 'Без названия';
  return t.romaji || t.english || t.native || item.title || 'Без названия';
}

function notifiableItems(state) {
  return Object.values(state.items || {}).filter(
    i => i.anilistId && (i.status === 'watching' || i.status === 'planned')
  );
}

function dayIndexMon(d) { return (d.getDay() + 6) % 7; }
function dayKey(d) { return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }

/* Проверка: какие серии вышли с прошлой проверки + напоминание о плане на сегодня.
   Вызывается при открытии приложения и из periodic background sync. */
async function runBackgroundCheck(reg) {
  const state = await DB.get('state');
  if (!state) return { aired: [] };
  const meta = (await DB.get('meta')) || {};
  const settings = state.settings || {};
  const now = Math.floor(Date.now() / 1000);
  const result = { aired: [] };
  const canNotify = typeof Notification !== 'undefined' && Notification.permission === 'granted' && reg;
  const pref = settings.titleLang || 'romaji';
  const byAni = {};
  Object.values(state.items || {}).forEach(i => { if (i.anilistId) byAni[i.anilistId] = i; });

  if (settings.notifyEpisodes) {
    const items = notifiableItems(state);
    const from = meta.lastCheck || now;
    if (items.length && now - from > 60) {
      try {
        const list = await fetchSchedules(items.map(i => i.anilistId), Math.max(from, now - 7 * 86400), now + 1);
        result.aired = list;
        let shown = 0;
        for (const s of list) {
          const it = byAni[s.mediaId];
          if (!it || !canNotify || shown >= 6) continue;
          shown++;
          await reg.showNotification('Вышла ' + s.episode + ' серия', {
            body: itemTitle(it, pref),
            tag: 'ep-' + s.mediaId + '-' + s.episode,
            icon: 'icons/icon-192.png',
            badge: 'icons/badge-96.png',
            data: { url: './#list' }
          });
        }
        meta.lastCheck = now;
      } catch (e) { /* нет сети — попробуем в следующий раз */ }
    } else {
      meta.lastCheck = now;
    }
  }

  if (settings.notifyPlan && canNotify) {
    const d = new Date();
    const today = dayKey(d);
    const di = dayIndexMon(d);
    const minutesNow = d.getHours() * 60 + d.getMinutes();
    if (meta.lastPlanDay !== today) {
      const planned = Object.values(state.items || {}).filter(i =>
        i.plan && Array.isArray(i.plan.days) && i.plan.days.includes(di) &&
        (i.status === 'watching' || i.status === 'planned'));
      const earliest = planned.reduce((m, i) => {
        const t = i.plan.time ? i.plan.time.split(':') : null;
        const mins = t ? (+t[0]) * 60 + (+t[1]) : 9 * 60;
        return Math.min(m, mins);
      }, 24 * 60);
      if (planned.length && minutesNow >= earliest - 30) {
        const body = planned.slice(0, 4).map(i => {
          const n = (i.plan.eps || 1);
          return itemTitle(i, pref) + ' — ' + n + ' сер.' + (i.plan.time ? ' в ' + i.plan.time : '');
        }).join('\n');
        await reg.showNotification('Сегодня по плану', {
          body, tag: 'plan-' + today, icon: 'icons/icon-192.png', badge: 'icons/badge-96.png',
          data: { url: './#schedule' }
        });
        meta.lastPlanDay = today;
      }
    }
  }

  await DB.set('meta', meta);
  return result;
}
