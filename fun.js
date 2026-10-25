'use strict';
/* Для удовольствия: ачивки, рулетка «Что посмотреть» и сезон свайпами. */

/* ================= Ачивки ================= */
const Ach = (() => {
  // goal — сколько нужно; v(ctx) — сколько уже есть
  const LIST = [
    { id: 'first', e: '🎬', c: '#FFC23D', t: 'Первая серия', d: 'Отметь первую серию', goal: 1, v: x => x.eps },
    { id: 'eps100', e: '💯', c: '#FF7A45', t: 'Сотня', d: '100 серий за всё время', goal: 100, v: x => x.eps },
    { id: 'eps500', e: '🔥', c: '#FF4D8D', t: 'Пятисотка', d: '500 серий за всё время', goal: 500, v: x => x.eps },
    { id: 'eps1000', e: '👑', c: '#FFD23F', t: 'Тысячник', d: '1000 серий за всё время', goal: 1000, v: x => x.eps },
    { id: 'done1', e: '🏁', c: '#3DDC97', t: 'Финал', d: 'Досмотри первый тайтл', goal: 1, v: x => x.done },
    { id: 'done10', e: '🏆', c: '#5AC8FA', t: 'Коллекционер', d: 'Досмотри 10 тайтлов', goal: 10, v: x => x.done },
    { id: 'done30', e: '🗻', c: '#7C9DFF', t: 'Легенда списка', d: 'Досмотри 30 тайтлов', goal: 30, v: x => x.done },
    { id: 'marathon', e: '🏃', c: '#FF5E5B', t: 'Марафонец', d: '10 серий за один день', goal: 10, v: x => x.maxDay },
    { id: 'night', e: '🌙', c: '#8E7CFF', t: 'Ночной марафон', d: '5 серий после полуночи за одну ночь', goal: 5, v: x => x.night },
    { id: 'streak7', e: '📅', c: '#9BE15D', t: 'Неделя без пропусков', d: 'Смотри аниме 7 дней подряд', goal: 7, v: x => x.streak },
    { id: 'streak30', e: '⚡', c: '#F72585', t: 'Месяц без пропусков', d: 'Смотри аниме 30 дней подряд', goal: 30, v: x => x.streak },
    { id: 'long', e: '🐉', c: '#E056FD', t: 'Долгострой', d: 'Досмотри тайтл на 100+ серий', goal: 1, v: x => x.long },
    { id: 'genres', e: '🎨', c: '#4CC9F0', t: 'Всеядный', d: 'Тайтлы 8 разных жанров', goal: 8, v: x => x.genres },
    { id: 'season', e: '📡', c: '#FF9F43', t: 'В курсе сезона', d: 'Смотри 3 выходящих тайтла одновременно', goal: 3, v: x => x.airing },
    { id: 'planner', e: '🗓️', c: '#3DE0FF', t: 'Планировщик', d: '20 галочек в плане', goal: 20, v: x => x.ticks },
    { id: 'critic', e: '⭐', c: '#FFC23D', t: 'Критик', d: 'Оцени 10 тайтлов', goal: 10, v: x => x.rated },
    { id: 'writer', e: '📝', c: '#B18CFF', t: 'Летописец', d: 'Заметки к 5 тайтлам', goal: 5, v: x => x.notes },
    { id: 'roulette', e: '🎡', c: '#FF6FAE', t: 'Судьба решила', d: 'Покрути рулетку «Что посмотреть»', goal: 1, v: x => x.roulette },
    { id: 'hunter', e: '🎴', c: '#7CF06B', t: 'Сезонный охотник', d: 'Добавь 5 тайтлов, листая сезон', goal: 5, v: x => x.swipe },
    { id: 'wrap', e: '🎁', c: '#FF7A45', t: 'Подводим итоги', d: 'Открой «Итоги года»', goal: 1, v: x => x.wrap }
  ];

  function ctx() {
    const items = Object.values(state.items);
    const st = state.stats || {};
    let maxDay = 0;
    Object.values(state.watchLog || {}).forEach(day => { const s = Object.values(day).reduce((a, b) => a + Math.max(0, b), 0); if (s > maxDay) maxDay = s; });
    const days = Object.entries(state.activity || {}).filter(([, v]) => v > 0).map(([k]) => keyTime(k)).sort((a, b) => a - b);
    let streak = 0, run = 0;
    days.forEach((tm, i) => { run = i && Math.round((tm - days[i - 1]) / 86400000) === 1 ? run + 1 : 1; streak = Math.max(streak, run); });
    const genres = new Set();
    items.forEach(it => { if ((it.progress || 0) > 0) (it.genres || []).forEach(g => genres.add(g)); });
    let ticks = 0;
    Object.values(state.planLog || {}).forEach(d => { ticks += Object.keys(d).length; });
    ticks = Math.max(ticks, st.ticks || 0);
    return {
      eps: totalEps(),
      done: items.filter(it => it.status === 'completed').length,
      maxDay, streak,
      night: Math.max(0, ...Object.values(state.night || {})),
      long: items.some(it => it.status === 'completed' && (it.total || it.progress || 0) >= 100) ? 1 : 0,
      genres: genres.size,
      airing: items.filter(it => it.status === 'watching' && it.airStatus === 'RELEASING').length,
      ticks,
      rated: items.filter(it => it.score).length,
      notes: items.filter(it => (it.notes || '').trim().length > 2).length,
      roulette: st.roulette || 0, swipe: st.swipeAdd || 0, wrap: st.wrap || 0
    };
  }

  let queue = [], showing = false, timer = 0;
  function check() {
    if (!state || !state.items) return;
    state.ach = state.ach || {};
    const x = ctx();
    if (x.ticks > ((state.stats && state.stats.ticks) || 0)) { state.stats = state.stats || {}; state.stats.ticks = x.ticks; }
    const fresh = LIST.filter(a => !state.ach[a.id] && a.v(x) >= a.goal);
    if (!fresh.length) return;
    const silent = !state.achInit;
    fresh.forEach(a => { state.ach[a.id] = Date.now(); });
    state.achInit = true;
    clearTimeout(saveTimer); saveTimer = setTimeout(flush, 400);
    if (silent) return;
    queue.push(...fresh);
    if (!showing) next();
  }
  function next() {
    const a = queue.shift();
    if (!a) { showing = false; return; }
    showing = true;
    const el = document.createElement('div');
    el.className = 'ach-pop';
    el.setAttribute('role', 'status');
    el.style.setProperty('--c', a.c);
    el.innerHTML = `<div class="ach-pop-card"><div class="ach-rays"></div>
      <div class="ach-medal big"><span>${a.e}</span></div>
      <small>${T('Новая ачивка!')}</small><b>${esc(T(a.t))}</b><p>${esc(T(a.d))}</p></div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    celebrate();
    const done = () => { clearTimeout(timer); el.classList.remove('in'); el.classList.add('out'); setTimeout(() => { el.remove(); next(); }, reduced ? 0 : 320); };
    el.addEventListener('click', done, { once: true });
    timer = setTimeout(done, 3800);
  }
  function bump(key) {
    state.stats = state.stats || {};
    state.stats[key] = (state.stats[key] || 0) + 1;
    save();
  }

  function medal(a, got, x) {
    const prog = Math.min(1, a.v(x) / a.goal);
    return `<button type="button" class="ach${got ? ' got' : ''}" style="--c:${a.c};--p:${prog}" data-ach="${a.id}" aria-label="${esc(T(a.t))}">
      <span class="ach-medal"><span>${a.e}</span>${got ? '' : '<i class="ach-ring"></i>'}</span><span class="ach-name">${esc(T(a.t))}</span></button>`;
  }
  function sectionHTML() {
    const x = ctx(), got = state.ach || {};
    const n = LIST.filter(a => got[a.id]).length;
    const sorted = LIST.slice().sort((a, b) => (!!got[b.id] - !!got[a.id]) || (got[b.id] || 0) - (got[a.id] || 0));
    return `<div class="section-head"><h2 style="font-size:16px">${T('Ачивки')}</h2><span class="label">${n} / ${LIST.length}</span></div>
      <div class="ach-grid">${sorted.map(a => medal(a, !!got[a.id], x)).join('')}</div>`;
  }
  function openInfo(id) {
    const a = LIST.find(z => z.id === id);
    if (!a) return;
    const got = (state.ach || {})[id];
    const v = Math.min(a.goal, a.v(ctx()));
    openSheet(`<div class="grab"></div><div class="ach-info" style="--c:${a.c}">
      <div class="ach-medal big${got ? '' : ' locked'}"><span>${a.e}</span></div>
      <h2>${esc(T(a.t))}</h2><p class="hint">${esc(T(a.d))}</p>
      ${got ? `<p class="ach-when">${T('Получена')} ${esc(new Intl.DateTimeFormat(LOC, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(got)))}</p>`
        : `<div class="ach-bar"><i style="width:${Math.round(v / a.goal * 100)}%"></i></div><p class="ach-when">${v} / ${a.goal}</p>`}</div>`);
    buzz(8);
  }
  document.addEventListener('click', e => { const b = e.target.closest('[data-ach]'); if (b) openInfo(b.dataset.ach); });

  return { check, bump, sectionHTML, LIST, _ctx: ctx };
})();

/* ================= Рулетка ================= */
const Roulette = (() => {
  let R = null; // { pool, angle, spinning, pick }
  const SEG_COLORS = ['#FF5E5B', '#FFC23D', '#3DDC97', '#5AC8FA', '#B18CFF', '#FF6FAE', '#FF9F43', '#7C9DFF', '#9BE15D', '#E056FD'];

  function pool() {
    const items = Object.values(state.items).filter(it => (it.status === 'watching' && canInc(it)) || it.status === 'planned');
    const w = it => (it.status === 'watching' && newEps(it) > 0 ? 3 : it.status === 'watching' ? 2 : 1) + Math.random() * 1.5;
    return items.sort((a, b) => w(b) - w(a)).slice(0, 10).sort(() => Math.random() - .5);
  }
  function short(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1).trim() + '…' : s; }
  function wheelSVG(list) {
    const n = list.length, a = 360 / n;
    const pal = skin() === 'manga' ? ['#141414', '#E0262E', '#F2F0EA'] : skin() === 'quest' ? ['#FFD23F', '#FF3E9A', '#3DE0FF', '#7CF06B', '#C58BFF'] : SEG_COLORS;
    const segs = list.map((it, i) => {
      const a0 = (i * a - 90) * Math.PI / 180, a1 = ((i + 1) * a - 90) * Math.PI / 180;
      const x0 = 96 * Math.cos(a0), y0 = 96 * Math.sin(a0), x1 = 96 * Math.cos(a1), y1 = 96 * Math.sin(a1);
      const col = pal[i % pal.length] === pal[(i + 1) % n % pal.length] && i === n - 1 ? pal[(i + 1) % pal.length] : pal[i % pal.length];
      const dark = ['#141414', '#E0262E', '#FF5E5B', '#B18CFF', '#E056FD', '#7C9DFF', '#FF3E9A', '#C58BFF'].includes(col);
      const mid = i * a + a / 2;
      return `<path d="M0 0 L${x0.toFixed(2)} ${y0.toFixed(2)} A96 96 0 ${a > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z" fill="${col}"/>
        <text transform="rotate(${mid - 90}) translate(56 0)" fill="${dark ? '#fff' : '#1a1a1a'}" font-size="${n > 7 ? 7.2 : 8.4}" dominant-baseline="middle" text-anchor="middle">${esc(short(title(it), n > 7 ? 15 : 18))}</text>`;
    }).join('');
    return `<svg class="rl-wheel" id="rlWheel" viewBox="-100 -100 200 200" aria-hidden="true">
      <circle r="99" class="rl-rim"/>${segs}<circle r="99" fill="none" class="rl-rim2"/>
      ${list.map((_, i) => { const r = (i * a - 90) * Math.PI / 180; return `<circle cx="${(97 * Math.cos(r)).toFixed(2)}" cy="${(97 * Math.sin(r)).toFixed(2)}" r="2.1" class="rl-pin"/>`; }).join('')}</svg>`;
  }
  function open() {
    const list = pool();
    if (list.length < 2) { toast(T('Добавь хотя бы 2 тайтла в «Смотрю» или «В планах»')); return; }
    R = { pool: list, angle: 0, spinning: false, pick: null };
    openSheet(`<div class="grab"></div><h2>${T('Что посмотреть?')}</h2>
      <p class="hint">${T('Крути — выберет из того, что ты смотришь и планируешь.')}</p>
      <div class="rl-wrap"><span class="rl-pointer" id="rlPtr"></span>${wheelSVG(list)}
        <button type="button" class="rl-hub" data-rl="spin" aria-label="${T('Крутить')}">${T('Крутить')}</button></div>
      <div id="rlRes" aria-live="polite"></div>`);
    const sh = document.querySelector('#sheetWrap .sheet');
    if (sh) sh.classList.add('rl-sheet');
  }
  function spin() {
    if (!R || R.spinning) return;
    const n = R.pool.length, seg = 360 / n;
    const idx = Math.floor(Math.random() * n);
    // указатель сверху: нужно, чтобы центр сектора idx оказался на угле 0
    const jitter = (Math.random() - .5) * seg * .6;
    const target = R.angle + 360 * (5 + Math.floor(Math.random() * 2)) + ((360 - (idx * seg + seg / 2) - (R.angle % 360)) + 360) % 360 + jitter;
    const from = R.angle, dur = reduced ? 600 : 4800, t0 = performance.now();
    const wheel = $('#rlWheel'), ptr = $('#rlPtr');
    R.spinning = true;
    $('#rlRes').innerHTML = '';
    document.querySelector('[data-rl="spin"]').disabled = true;
    let lastSeg = Math.floor(from / seg);
    const ease = p => 1 - Math.pow(1 - p, 4);
    const step = now => {
      if (!R || !document.body.contains(wheel)) return;
      const p = Math.min(1, (now - t0) / dur);
      const ang = from + (target - from) * ease(p);
      wheel.style.transform = `rotate(${ang}deg)`;
      const sNow = Math.floor((ang + seg / 2) / seg);
      if (sNow !== lastSeg) { lastSeg = sNow; buzz(3); if (ptr) { ptr.classList.remove('tick'); void ptr.offsetWidth; ptr.classList.add('tick'); } }
      if (p < 1) requestAnimationFrame(step);
      else done(idx, target);
    };
    requestAnimationFrame(step);
    Ach.bump('roulette');
  }
  function done(idx, ang) {
    R.angle = ang; R.spinning = false;
    const it = R.pool[idx];
    R.pick = it;
    celebrate();
    const btn = document.querySelector('[data-rl="spin"]');
    if (btn) { btn.disabled = false; btn.textContent = T('Ещё раз'); }
    const res = $('#rlRes');
    if (!res) return;
    res.innerHTML = `<div class="rl-res rise" style="--c:${esc(it.color || hueColor(title(it)))}">
      <span class="rl-cov">${it.cover ? `<img src="${esc(it.cover)}" alt="">` : ''}</span>
      <div class="rl-info"><small>${T('Судьба говорит:')}</small><b>${esc(title(it))}</b>
        <span>${it.status === 'planned' ? T('Начни с первой серии') : 'EP ' + ((it.progress || 0) + 1) + (it.total ? ' / ' + it.total : '')}</span></div></div>
      <div class="peek-actions">${watchBtnHTML(it, 'grad')}<button class="btn" type="button" data-rl="open">${ICON.info}${T('Открыть страницу')}</button></div>`;
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-rl]');
    if (!b) return;
    if (b.dataset.rl === 'spin') spin();
    else if (b.dataset.rl === 'open' && R && R.pick) { const id = R.pick.id; back(); setTimeout(() => openDetail({ itemId: id }, null), 320); }
  });
  return { open };
})();

/* ================= Сезон свайпами ================= */
const SeasonSwipe = (() => {
  let S = null; // { s, y, cards, i, added, hist, loading }
  function nextSeason(cs) {
    const order = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];
    const k = order.indexOf(cs.s);
    return k === 3 ? { s: 'WINTER', y: cs.y + 1 } : { s: order[k + 1], y: cs.y };
  }
  const key = cs => cs.s + '-' + cs.y;

  async function open(which) {
    const cs = which === 'next' ? nextSeason(currentSeason()) : currentSeason();
    S = { cs, which: which || 'now', cards: [], i: 0, added: 0, skipped: 0, hist: [], loading: true, error: false };
    const root = document.createElement('div');
    root.className = 'sw';
    root.id = 'swipeRoot';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    document.body.appendChild(root);
    document.body.classList.add('locked');
    pushOverlay('swipe');
    render();
    requestAnimationFrame(() => root.classList.add('in'));
    try {
      const d = await gql(Q_SEASON, { s: cs.s, y: cs.y });
      if (!S) return;
      const map = byAni(), seen = state.swipeSeen || {};
      S.cards = (d.Page.media || []).filter(m => !map[m.id] && !seen[m.id] && m.format !== 'MUSIC');
      rememberMedia(S.cards);
      enrichRu(S.cards).then(() => { if (S) renderStack(); });
    } catch (e) { if (S) S.error = true; }
    if (!S) return;
    S.loading = false;
    render();
  }
  function closeNow() {
    const root = $('#swipeRoot');
    S = null;
    if (!root) return;
    root.classList.remove('in'); root.classList.add('out');
    document.body.classList.remove('locked');
    setTimeout(() => root.remove(), reduced ? 0 : 300);
    if (ui.tab === 'home') renderHome(['seq', 'cont', 'swipe']);
  }

  function render() {
    const root = $('#swipeRoot');
    if (!root || !S) return;
    const other = S.which === 'next' ? currentSeason() : nextSeason(currentSeason());
    root.innerHTML = `<div class="sw-top">
        <button type="button" class="icon-btn glass" data-sw="close" aria-label="${T('Закрыть')}">${ICON.x}</button>
        <div class="sw-title"><b>${SEASON_RU[S.cs.s]} ${S.cs.y}</b><small id="swCount"></small></div>
        <button type="button" class="btn small sw-other" data-sw="other">${SEASON_RU[other.s]} ${other.y}</button></div>
      <div class="sw-stack" id="swStack"></div>
      <div class="sw-btns" id="swBtns">
        <button type="button" class="sw-b no" data-sw="no" aria-label="${T('Мимо')}">${ICON.x}</button>
        <button type="button" class="sw-b undo" data-sw="undo" aria-label="${T('Вернуть')}"><svg class="ico" viewBox="0 0 24 24"><path d="M9 7 4 12l5 5M4 12h11a5 5 0 0 1 0 10h-2"/></svg></button>
        <button type="button" class="sw-b yes" data-sw="yes" aria-label="${T('Буду смотреть')}"><svg class="ico" viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg></button></div>
      <p class="sw-hint">${T('Вправо — в планы, влево — мимо')}</p>`;
    renderStack();
  }
  function cardHTML(m, k) {
    const t = mediaTitle(m);
    const genres = (m.genres || []).slice(0, 3).map(g => `<span class="tag" style="--g:${(GENRE[g] || {}).c || '#888'}">${esc((GENRE[g] || {}).ru || g)}</span>`).join('');
    const desc = ruD(m.idMal) || stripHtml(m.description);
    const meta = [FORMAT[m.format] || '', m.episodes ? m.episodes + T(' эп.') : '', m.averageScore ? '★ ' + (m.averageScore / 10).toFixed(1) : ''].filter(Boolean).join(' · ');
    const when = m.nextAiringEpisode ? 'EP ' + m.nextAiringEpisode.episode + ' · ' + fmtDay(m.nextAiringEpisode.airingAt) : AIR[m.status] || '';
    return `<article class="sw-card" data-k="${k}" style="--c:${esc((m.coverImage && m.coverImage.color) || hueColor(t))}">
      <div class="sw-img">${mediaCover(m, true) ? `<img src="${esc(mediaCover(m, true))}" alt="" draggable="false">` : ''}</div>
      <span class="sw-stamp yes">${T('БУДУ')}</span><span class="sw-stamp no">${T('МИМО')}</span>
      <div class="sw-info"><span class="sw-when">${esc(when)}</span><h3>${esc(t)}</h3><div class="sw-meta">${esc(meta)}</div>
        <div class="tags">${genres}</div>${desc ? `<p>${esc(desc.slice(0, 220))}${desc.length > 220 ? '…' : ''}</p>` : ''}</div></article>`;
  }
  function renderStack() {
    const st = $('#swStack');
    if (!st || !S) return;
    const left = S.cards.length - S.i;
    const cnt = $('#swCount');
    if (cnt) cnt.textContent = S.loading ? '' : left > 0 ? `${S.i + 1} / ${S.cards.length}` : '';
    const btns = $('#swBtns');
    if (btns) btns.classList.toggle('off', S.loading || left <= 0);
    if (S.loading) { st.innerHTML = `<div class="sw-msg"><span class="spinner"></span></div>`; return; }
    if (S.error) { st.innerHTML = `<div class="sw-msg"><p>${T('Нет связи с AniList. Попробуй позже')}</p><button class="btn" type="button" data-sw="retry">${T('Повторить')}</button></div>`; return; }
    if (left <= 0) {
      st.innerHTML = `<div class="sw-msg sw-end rise"><span class="sw-end-ico">${S.added ? '🎉' : '✨'}</span>
        <h3>${S.cards.length ? T('Сезон пролистан!') : T('Здесь всё уже просмотрено')}</h3>
        <p>${S.added ? T('В планы:') + ' ' + S.added + ' ' + pl(S.added, T('тайтл'), T('тайтла'), T('тайтлов')) : T('Ничего нового не добавлено')}</p>
        <div class="btn-row">${S.added ? `<button class="btn grad" type="button" data-sw="list">${T('Мой список')}</button>` : ''}<button class="btn" type="button" data-sw="close">${T('Готово')}</button></div></div>`;
      if (S.added) celebrate();
      return;
    }
    st.innerHTML = S.cards.slice(S.i, S.i + 3).map((m, j) => cardHTML(m, S.i + j)).reverse().join('');
    st.querySelectorAll('.sw-card').forEach(c => { const d = +c.dataset.k - S.i; c.style.setProperty('--depth', d); });
  }

  function decide(yes, card, vx) {
    if (!S || S.i >= S.cards.length) return;
    const m = S.cards[S.i];
    const el = card || document.querySelector(`.sw-card[data-k="${S.i}"]`);
    state.swipeSeen = state.swipeSeen || {};
    state.swipeSeen[m.id] = 1;
    let itemId = null;
    if (yes) { const it = addToList(m, 'planned'); itemId = it.id; S.added++; Ach.bump('swipeAdd'); }
    else { S.skipped++; save(); }
    S.hist.push({ m, yes, itemId });
    buzz(yes ? 16 : 8);
    S.i++;
    if (el) {
      el.classList.add('gone', yes ? 'to-yes' : 'to-no');
      el.style.transition = 'transform .38s cubic-bezier(.3,.7,.3,1), opacity .38s ease';
      el.style.transform = `translate(${(yes ? 1 : -1) * (innerWidth + 120)}px, ${(vx || 0) * 20}px) rotate(${yes ? 24 : -24}deg)`;
      el.style.opacity = '0';
      setTimeout(renderStack, reduced ? 0 : 300);
    } else renderStack();
  }
  function undo() {
    if (!S || !S.hist.length) return;
    const h = S.hist.pop();
    delete state.swipeSeen[h.m.id];
    if (h.yes && h.itemId && state.items[h.itemId]) { delete state.items[h.itemId]; S.added--; if (state.stats && state.stats.swipeAdd) state.stats.swipeAdd--; }
    else S.skipped--;
    save();
    S.i--;
    buzz(8);
    renderStack();
    const c = document.querySelector(`.sw-card[data-k="${S.i}"]`);
    if (c && !reduced) { c.classList.add('back-in'); }
  }

  /* перетаскивание верхней карточки */
  let drag = null;
  document.addEventListener('pointerdown', e => {
    if (!S) return;
    const c = e.target.closest('.sw-card');
    if (!c || +c.dataset.k !== S.i) return;
    drag = { c, x0: e.clientX, y0: e.clientY, t0: performance.now(), dx: 0, dy: 0, id: e.pointerId };
    c.style.transition = 'none';
    try { c.setPointerCapture(e.pointerId); } catch (er) { /* старый браузер */ }
  });
  document.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.dx = e.clientX - drag.x0; drag.dy = e.clientY - drag.y0;
    const r = drag.dx / innerWidth;
    drag.c.style.transform = `translate(${drag.dx}px, ${drag.dy * .35}px) rotate(${r * 22}deg)`;
    drag.c.style.setProperty('--yes', Math.max(0, Math.min(1, r * 3)));
    drag.c.style.setProperty('--no', Math.max(0, Math.min(1, -r * 3)));
  });
  const endDrag = e => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const d = drag; drag = null;
    const v = d.dx / Math.max(1, performance.now() - d.t0);
    if (Math.abs(d.dx) > innerWidth * .28 || Math.abs(v) > .7 && Math.abs(d.dx) > 40) decide(d.dx > 0, d.c, v);
    else {
      d.c.style.transition = 'transform .45s cubic-bezier(.2,1.4,.4,1)';
      d.c.style.transform = '';
      d.c.style.setProperty('--yes', 0); d.c.style.setProperty('--no', 0);
    }
  };
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-sw]');
    if (!b || !S) return;
    const a = b.dataset.sw;
    if (a === 'close') back();
    else if (a === 'yes' || a === 'no') { const c = document.querySelector(`.sw-card[data-k="${S.i}"]`); if (c) { c.style.setProperty(a === 'yes' ? '--yes' : '--no', 1); } setTimeout(() => decide(a === 'yes', c, 0), reduced ? 0 : 120); }
    else if (a === 'undo') undo();
    else if (a === 'retry') { const w = S.which; back(); setTimeout(() => open(w), 350); }
    else if (a === 'other') { const w = S.which === 'next' ? 'now' : 'next'; back(); setTimeout(() => open(w), 350); }
    else if (a === 'list') { back(); setTimeout(() => go('list'), 330); }
  });
  document.addEventListener('keydown', e => {
    if (!S) return;
    if (e.key === 'ArrowRight') decide(true);
    else if (e.key === 'ArrowLeft') decide(false);
  });

  /* баннер на главной в начале сезона */
  function bannerHTML() {
    const cs = currentSeason();
    if ((state.swipeBanner || '') === key(cs)) return '';
    return `<div class="sw-banner rise"><div><b>${SEASON_RU[cs.s]} ${cs.y}</b><span>${T('Листай новый сезон карточками — вправо в планы, влево мимо')}</span></div>
      <button class="btn small grad" type="button" data-action="swipe-open">${T('Листать')}</button>
      <button class="sw-banner-x" type="button" data-action="swipe-banner-x" aria-label="${T('Скрыть')}">${ICON.x}</button></div>`;
  }
  function hideBanner() { state.swipeBanner = key(currentSeason()); save(); }
  return { open, closeNow, bannerHTML, hideBanner };
})();
