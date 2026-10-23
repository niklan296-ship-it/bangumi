'use strict';
/* Бангуми — движение и жесты.
   Рябь от касания, скользящий индикатор вкладок, свайпы по строкам, долгое нажатие с меню,
   «потяни, чтобы обновить», смахивание окон, свайп дней, параллакс, искры, перелистывание цифр.
   Подключается после app.js и пользуется его глобальными функциями и состоянием. */
(function () {
  const RM = reduced;
  const TAB_ORDER = Object.keys(TABS);
  let swallowUntil = 0;
  const swallow = (ms) => { swallowUntil = Date.now() + (ms || 450); };
  /* Клик, пришедший сразу после свайпа или долгого нажатия, не должен ничего открывать */
  document.addEventListener('click', e => {
    if (Date.now() < swallowUntil) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  /* ============ Рябь ============ */
  const RIPPLE_SEL = 'button, .btn, [role="button"], .tabbar a, a.more, label.q-time';
  document.addEventListener('pointerdown', e => {
    if (RM || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const el = e.target.closest(RIPPLE_SEL);
    if (!el || el.disabled || el.closest('.switch')) return;
    let host = el;
    if (el.matches('.poster')) host = el.querySelector('.poster-img') || el;
    else if (el.matches('.tabbar a')) host = el.querySelector('.ib') || el;
    const r = host.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const cs = getComputedStyle(host);
    if (cs.position === 'static') host.style.position = 'relative';
    if (cs.overflow === 'visible') host.classList.add('rp-clip');
    el.style.setProperty('--mx', (e.clientX - el.getBoundingClientRect().left).toFixed(0) + 'px');
    el.style.setProperty('--my', (e.clientY - el.getBoundingClientRect().top).toFixed(0) + 'px');
    const d = Math.hypot(Math.max(e.clientX - r.left, r.right - e.clientX), Math.max(e.clientY - r.top, r.bottom - e.clientY)) * 2;
    const s = document.createElement('span');
    s.className = 'ripple';
    s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    host.appendChild(s);
    let done = false;
    const end = () => {
      if (done) return; done = true;
      s.classList.add('out');
      setTimeout(() => s.remove(), 500);
      window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end);
    };
    window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
    setTimeout(end, 900);
  }, { passive: true });

  /* ============ Искры ============ */
  window.sparkle = function (el, n) {
    if (RM || !el || !el.getBoundingClientRect) return;
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const colors = typeof skinFx === 'function' ? skinFx() : ['#FFC23D', '#FF7A45', '#FF4D8D', '#7C9DFF', '#3DDC97'];
    const box = document.createElement('div');
    box.className = 'sparks';
    box.style.left = cx + 'px'; box.style.top = cy + 'px';
    const count = n || 10;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * .5;
      const dist = 26 + Math.random() * 22;
      const p = document.createElement('i');
      p.style.setProperty('--dx', (Math.cos(a) * dist).toFixed(1) + 'px');
      p.style.setProperty('--dy', (Math.sin(a) * dist).toFixed(1) + 'px');
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = (Math.random() * 60) + 'ms';
      if (i % 3 === 0) p.className = 'long';
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 800);
  };

  /* ============ Индикатор вкладок ============ */
  const inner = document.querySelector('.tabbar-inner');
  const ind = document.createElement('span');
  ind.className = 'tab-ind';
  ind.setAttribute('aria-hidden', 'true');
  inner.prepend(ind);
  let lastTab = null;
  function moveTabInd(instant) {
    const a = inner.querySelector(`a[data-tab="${ui.tab}"]`);
    if (!a) return;
    if (instant) ind.style.transition = 'none';
    if (a.classList.contains('fab')) {
      const fab = a.querySelector('.ib').getBoundingClientRect(), base = inner.getBoundingClientRect();
      ind.style.opacity = '0';
      ind.style.transform = `translate(${fab.left - base.left + fab.width / 2 - 26}px, 18px) scale(.4)`;
    } else {
      const ib = a.querySelector('.ib').getBoundingClientRect(), base = inner.getBoundingClientRect();
      ind.style.opacity = '1';
      ind.style.transform = `translate(${ib.left - base.left}px, ${ib.top - base.top}px)`;
    }
    if (instant) { void ind.offsetWidth; ind.style.transition = ''; }
    if (lastTab !== ui.tab) {
      const ib = a.querySelector('.ib');
      if (lastTab !== null && ib) { ib.classList.remove('pop'); void ib.offsetWidth; ib.classList.add('pop'); }
      lastTab = ui.tab;
    }
  }
  window.addEventListener('resize', () => moveTabInd(true));

  /* ============ Проявление картинок ============ */
  document.addEventListener('load', e => { if (e.target.tagName === 'IMG') e.target.classList.add('loaded'); }, true);
  function markLoaded(root) {
    (root || document).querySelectorAll('img:not(.loaded)').forEach(img => { if (img.complete && img.naturalWidth) img.classList.add('loaded'); });
  }

  /* ============ Перелистывание цифр ============ */
  const ticks = {};
  function scanTicks() {
    document.querySelectorAll('[data-tick]').forEach(el => {
      const k = el.dataset.tick, v = el.textContent;
      if (k in ticks && ticks[k] !== v && !RM) { el.classList.remove('ticked'); void el.offsetWidth; el.classList.add('ticked'); }
      ticks[k] = v;
    });
  }
  let scanQueued = false;
  new MutationObserver(() => {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(() => { scanQueued = false; scanTicks(); markLoaded(); });
  }).observe(document.body, { childList: true, subtree: true, characterData: true });

  /* Вызывается из render() после смены вкладки */
  window.motionAfterRender = function () {
    requestAnimationFrame(() => moveTabInd(lastTab === null));
    markLoaded();
  };

  /* ============ Параллакс героя ============ */
  let pxQueued = false;
  window.addEventListener('scroll', () => {
    if (RM || pxQueued || ui.tab !== 'home' || isLite()) return;
    pxQueued = true;
    requestAnimationFrame(() => {
      pxQueued = false;
      const h = document.querySelector('.hero');
      if (!h) return;
      const y = Math.min(window.scrollY, h.offsetHeight);
      h.style.setProperty('--py', y.toFixed(0));
    });
  }, { passive: true });

  /* ============ Потяни, чтобы обновить ============ */
  const ptrEl = document.createElement('div');
  ptrEl.className = 'ptr';
  ptrEl.setAttribute('aria-hidden', 'true');
  ptrEl.innerHTML = '<span class="ptr-badge"><svg viewBox="0 0 40 40"><circle class="bg" cx="20" cy="20" r="16"/><circle class="fg" cx="20" cy="20" r="16"/></svg><b>番</b></span>';
  document.body.appendChild(ptrEl);
  const ptr = { on: false, x0: 0, y0: 0, d: 0, busy: false };
  const PTR_MAX = 130, PTR_GO = 74, C = 2 * Math.PI * 16;
  function ptrSet(d) {
    ptr.d = d;
    const k = Math.min(1, d / PTR_GO);
    ptrEl.style.transform = `translate(-50%, ${d - 60}px)`;
    ptrEl.querySelector('svg').style.rotate = (d * 2.4).toFixed(0) + 'deg';
    ptrEl.style.opacity = Math.min(1, d / 40).toFixed(2);
    ptrEl.querySelector('.fg').style.strokeDashoffset = (C * (1 - k)).toFixed(1);
    ptrEl.classList.toggle('ready', d >= PTR_GO);
  }
  function ptrHide() {
    ptrEl.classList.add('anim');
    ptrSet(0);
    setTimeout(() => ptrEl.classList.remove('anim', 'spin', 'ready'), 350);
  }
  document.addEventListener('touchstart', e => {
    ptr.on = false;
    if (ptr.busy || ui.overlays.length || (typeof quick !== 'undefined' && quick.open) || window.scrollY > 2 || e.touches.length !== 1) return;
    const t = e.touches[0];
    if (t.clientX < 30 || e.target.closest('.tabbar, input, textarea, .map-view')) return;
    ptr.on = true; ptr.x0 = t.clientX; ptr.y0 = t.clientY;
    ptrEl.classList.remove('anim');
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!ptr.on) return;
    const t = e.touches[0], dy = t.clientY - ptr.y0, dx = Math.abs(t.clientX - ptr.x0);
    if (dy <= 0 || (ptr.d < 12 && dx > dy)) { if (ptr.d) ptrSet(0); if (dx > 14) ptr.on = false; return; }
    if (window.scrollY > 2) { ptr.on = false; ptrSet(0); return; }
    const d = Math.min(PTR_MAX, dy * 0.55);
    if (d >= PTR_GO && ptr.d < PTR_GO) buzz(10);
    ptrSet(d);
  }, { passive: true });
  document.addEventListener('touchend', async () => {
    if (!ptr.on) return;
    ptr.on = false;
    if (ptr.d >= PTR_GO) {
      ptr.busy = true;
      ptrEl.classList.add('anim', 'spin');
      ptrSet(PTR_GO);
      const t0 = Date.now();
      try { await syncAll(false); } catch (err) { /* тост покажет syncAll */ }
      await new Promise(r => setTimeout(r, Math.max(0, 700 - (Date.now() - t0))));
      ptr.busy = false;
      ptrHide();
    } else if (ptr.d) ptrHide();
  }, { passive: true });

  /* ============ Свайп строк: «+1» и галочка плана ============ */
  let sw = null;
  const SW_GO = 88;
  document.addEventListener('pointerdown', e => {
    sw = null;
    if (e.pointerType === 'mouse') return;
    const row = e.target.closest('.lrow, .check-item');
    if (!row || e.clientX < 30 || e.target.closest('.cbox, .plus-btn')) return;
    sw = { row, id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, lock: null, under: null };
  }, { passive: true });
  function swAction(row) {
    if (row.matches('.lrow')) {
      const b = row.querySelector('.plus-btn');
      return b ? { label: '+1 серия', icon: ICON.play, run: () => { sparkle(row.querySelector('.thumb'), 12); incEpisode(b.dataset.id, null); } } : null;
    }
    const c = row.querySelector('.cbox');
    if (!c || c.disabled) return null;
    const on = c.classList.contains('on');
    return { label: on ? 'Снять отметку' : 'Посмотрел', icon: on ? ICON.x : ICON.check, run: () => { if (!on) sparkle(c, 12); togglePlan(c.dataset.key, c.dataset.id, c); } };
  }
  document.addEventListener('pointermove', e => {
    if (!sw || e.pointerId !== sw.id) return;
    const dx = e.clientX - sw.x0, dy = e.clientY - sw.y0;
    if (!sw.lock) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { sw = null; return; }
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        sw.lock = 'h';
        sw.act = swAction(sw.row);
        const parent = sw.row.parentElement;
        if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
        const u = document.createElement('div');
        u.className = 'swipe-under' + (sw.act ? '' : ' none');
        u.style.cssText = `left:${sw.row.offsetLeft}px;top:${sw.row.offsetTop}px;width:${sw.row.offsetWidth}px;height:${sw.row.offsetHeight}px`;
        u.innerHTML = sw.act ? `<span class="sw-ic">${sw.act.icon}</span><span>${esc(sw.act.label)}</span>` : '';
        parent.insertBefore(u, sw.row);
        sw.under = u;
        sw.row.querySelectorAll('.ripple').forEach(x => x.remove());
        clearLp();
        sw.row.classList.add('swiping');
      } else return;
    }
    let x = dx > 0 ? dx : dx / 4;
    if (!sw.act) x = Math.sign(x) * Math.min(28, Math.abs(x) / 3);
    else if (x > SW_GO) x = SW_GO + (x - SW_GO) * 0.35;
    sw.dx = dx;
    sw.row.style.transform = `translateX(${x.toFixed(1)}px)`;
    const k = Math.max(0, Math.min(1, dx / SW_GO));
    sw.under.style.setProperty('--k', k.toFixed(2));
    const ready = sw.act && dx >= SW_GO;
    if (ready && !sw.under.classList.contains('ready')) buzz(10);
    sw.under.classList.toggle('ready', !!ready);
  }, { passive: true });
  function swEnd() {
    if (!sw) return;
    const s = sw; sw = null;
    if (s.lock !== 'h') return;
    swallow();
    const fire = s.act && s.dx >= SW_GO;
    s.row.classList.add('swipe-back');
    s.row.style.transform = '';
    setTimeout(() => {
      s.row.classList.remove('swiping', 'swipe-back');
      if (s.under) s.under.remove();
      if (fire) s.act.run();
    }, fire ? 180 : 320);
  }
  document.addEventListener('pointerup', swEnd, { passive: true });
  document.addEventListener('pointercancel', swEnd, { passive: true });

  /* ============ Долгое нажатие: быстрое меню тайтла ============ */
  let lp = null;
  document.addEventListener('pointerdown', e => {
    clearLp();
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const a = e.target.closest('[data-action]');
    if (!a || a.dataset.action !== 'open' || a.closest('#sheetWrap')) return;
    lp = { el: a, x: e.clientX, y: e.clientY, t: setTimeout(() => fireLp(a), 430) };
  }, { passive: true });
  document.addEventListener('pointermove', e => {
    if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 9) clearLp();
  }, { passive: true });
  ['pointerup', 'pointercancel', 'scroll'].forEach(ev => document.addEventListener(ev, clearLp, { passive: true, capture: ev === 'scroll' }));
  function clearLp() {
    if (!lp) return;
    clearTimeout(lp.t);
    lp = null;
  }
  document.addEventListener('contextmenu', e => { if (e.target.closest('[data-action="open"], .poster-img, .thumb')) e.preventDefault(); });
  let peek = null;
  function fireLp(el) {
    if (!lp || lp.el !== el) return;
    lp = null;
    swallow(700);
    buzz(18);
    el.classList.add('lp-press');
    setTimeout(() => el.classList.remove('lp-press'), 380);
    peek = el.dataset.item ? { itemId: el.dataset.item } : { aniId: +el.dataset.ani };
    openSheet(peekHTML());
    const sh = document.querySelector('#sheetWrap .sheet');
    if (sh) sh.classList.add('peek-sheet');
  }
  window.openPeek = function (ref) {
    peek = ref;
    openSheet(peekHTML());
    const sh = document.querySelector('#sheetWrap .sheet');
    if (sh) sh.classList.add('peek-sheet');
  };
  function peekItem() {
    if (!peek) return null;
    if (peek.itemId && state.items[peek.itemId]) return state.items[peek.itemId];
    if (peek.aniId) return byAni()[peek.aniId] || null;
    return null;
  }
  function peekHTML() {
    const it = peekItem();
    const m = !it && peek.aniId ? ui.media[peek.aniId] : null;
    if (!it && !m) return '<div class="grab"></div><p class="hint">Тайтл не найден.</p>';
    const t = it ? title(it) : mediaTitle(m);
    const c = (it && it.color) || (m && m.coverImage && m.coverImage.color) || hueColor(t);
    const cover = it ? (it.coverXL || it.cover) : mediaCover(m, true);
    const next = it ? it.nextEp : m.nextAiringEpisode;
    const n = nowSec();
    let sub;
    if (it) {
      const ne = newEps(it);
      sub = `<span class="sbadge s-${it.status}" style="--st:var(--st-${it.status})"><span class="dot"></span>${esc(ST[it.status].label)}</span>
        <span class="mono" data-tick="pk-${esc(it.id)}">EP ${it.progress}/${it.total || '?'}</span>${ne > 0 && activeStatus(it.status) ? `<span class="p-new" style="position:static">+${ne}</span>` : ''}`;
    } else {
      sub = [FORMAT[m.format] || '', m.episodes ? m.episodes + ' эп.' : '', m.seasonYear || ''].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join('');
    }
    const nextLine = next && next.airingAt > n ? `<div class="peek-next"><span class="countdown-chip">${esc(until(next.airingAt))}</span>EP ${next.episode}, ${esc(fmtDay(next.airingAt))} в ${fmtTime(next.airingAt)}</div>` : '';
    let actions;
    if (it) {
      actions = `<div class="peek-actions">
          ${canInc(it) ? `<button class="btn primary" type="button" data-action="peek-inc">${ICON.play}Отметить EP ${it.progress + 1}</button>` : `<button class="btn primary" type="button" disabled>${ICON.check}Все серии отмечены</button>`}
          <button class="btn" type="button" data-action="peek-plan">${ICON.plus}В расписание</button>
        </div>
        <div class="statusbar peek-status" role="group" aria-label="Статус">${STATUSES.map(s => `<button type="button" class="sbtn${it.status === s.id ? ' on' : ''}" style="--st:var(--st-${s.id})" data-action="peek-status" data-v="${s.id}" aria-pressed="${it.status === s.id}"><span class="dot"></span>${s.label}</button>`).join('')}</div>`;
    } else {
      actions = `<div class="peek-actions">
          <button class="btn grad" type="button" data-action="peek-add" data-v="watching">${ICON.plus}Смотрю</button>
          <button class="btn" type="button" data-action="peek-add" data-v="planned"><span class="dot" style="--st:var(--st-planned)"></span>В планы</button>
        </div>`;
    }
    return `<div class="grab"></div>
      <div class="peek-head" style="--c:${esc(c)}">
        <span class="peek-cover"><span class="ph-art">${esc(initial(t))}</span>${cover ? `<img src="${esc(cover)}" alt="" decoding="async" onerror="this.remove()">` : ''}</span>
        <div class="peek-info"><h2>${esc(t)}</h2><div class="peek-sub">${sub}</div>${nextLine}</div>
      </div>
      ${actions}
      <button class="btn line block" type="button" data-action="peek-open">${ICON.info}Открыть страницу</button>`;
  }
  function rerenderPeek() {
    const sh = document.querySelector('#sheetWrap .sheet');
    if (sh && peek) { sh.classList.add('no-anim'); sh.innerHTML = peekHTML(); }
  }
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-action^="peek-"]');
    if (!t) return;
    const a = t.dataset.action;
    const it = peekItem();
    if (a === 'peek-inc' && it) { incEpisode(it.id, t); rerenderPeek(); }
    else if (a === 'peek-status' && it) {
      const prev = it.status;
      it.status = t.dataset.v;
      if (it.status === 'completed') { if (it.total) setProgress(it, it.total, { max: 3 }); if (prev !== 'completed') celebrate(); }
      it.updatedAt = Date.now(); save(); buzz(10);
      rerenderPeek(); refreshAfterChange(); loadWeek(ui.weekOffset, true);
      toast('Статус: ' + ST[it.status].label);
    } else if (a === 'peek-add' && peek.aniId) {
      const m = ui.media[peek.aniId];
      if (!m) return;
      const item = addToList(m, t.dataset.v);
      peek = { itemId: item.id };
      ui.heroIds = null;
      sparkle(t, 14);
      if (t.dataset.v === 'watching') celebrate();
      rerenderPeek(); refreshAfterChange();
      toast('Добавлено в «' + ST[item.status].label + '»');
    } else if (a === 'peek-open') {
      const ref = it ? { itemId: it.id } : { aniId: peek.aniId };
      back();
      setTimeout(() => openDetail(ref, null), 260);
    } else if (a === 'peek-plan') {
      back();
      setTimeout(() => openQuick(false), 260);
    }
  });

  /* ============ Смахнуть окна ============ */
  // Нижний лист — вниз; быстрый план — влево; страница тайтла — вниз от самого верха.
  const drag = { kind: null, el: null, x0: 0, y0: 0, dx: 0, dy: 0, lock: null, t0: 0 };
  document.addEventListener('touchstart', e => {
    drag.kind = null;
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const sheet = e.target.closest('#sheetWrap .sheet');
    const qk = e.target.closest('#quickWrap:not(.full) .quick');
    const det = e.target.closest('#detail');
    if (sheet) { if (sheet.scrollTop > 0) return; drag.kind = 'sheet'; drag.el = sheet; }
    else if (qk) { if (e.target.closest('.q-times, input, .q-days')) return; drag.kind = 'quick'; drag.el = qk; }
    else if (det && !ui.overlays.includes('sheet')) { if (det.scrollTop > 0 || e.target.closest('.rail, .statusbar, .epgrid, input, textarea')) return; drag.kind = 'detail'; drag.el = det; }
    else return;
    Object.assign(drag, { x0: t.clientX, y0: t.clientY, dx: 0, dy: 0, lock: null, t0: Date.now() });
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!drag.kind) return;
    const t = e.touches[0];
    drag.dx = t.clientX - drag.x0; drag.dy = t.clientY - drag.y0;
    if (!drag.lock) {
      const ax = Math.abs(drag.dx), ay = Math.abs(drag.dy);
      if (ax < 8 && ay < 8) return;
      const want = drag.kind === 'quick' ? (ax > ay && drag.dx < 0) : (ay > ax && drag.dy > 0);
      if (!want) { drag.kind = null; return; }
      if (drag.kind === 'detail' && drag.el.scrollTop > 0) { drag.kind = null; return; }
      drag.lock = true;
      drag.el.classList.add('dragging');
    }
    if (drag.kind === 'sheet') {
      const y = Math.max(0, drag.dy);
      drag.el.style.transform = `translateY(${y}px)`;
      const bd = document.querySelector('#sheetWrap .backdrop'); if (bd) bd.style.opacity = Math.max(0, 1 - y / 400).toFixed(2);
    } else if (drag.kind === 'quick') {
      const x = Math.min(0, drag.dx);
      drag.el.style.transform = `translateX(${x}px)`;
      const bd = document.querySelector('#quickWrap .backdrop'); if (bd) bd.style.opacity = Math.max(0, 1 + x / 400).toFixed(2);
    } else {
      const y = Math.max(0, drag.dy) * 0.6;
      const s = Math.max(0.9, 1 - y / 1600);
      drag.el.style.transform = `translateY(${y}px) scale(${s.toFixed(3)})`;
      drag.el.style.borderRadius = Math.min(32, y / 3).toFixed(0) + 'px';
    }
  }, { passive: true });
  document.addEventListener('touchend', () => {
    if (!drag.kind || !drag.lock) { drag.kind = null; return; }
    const el = drag.el, kind = drag.kind;
    drag.kind = null;
    el.classList.remove('dragging');
    const v = (kind === 'quick' ? -drag.dx : drag.dy) / Math.max(1, Date.now() - drag.t0);
    const dist = kind === 'quick' ? -drag.dx : drag.dy;
    const go = dist > (kind === 'detail' ? 150 : 110) || (v > 0.7 && dist > 40);
    el.classList.add('settle');
    if (go) {
      swallow(400);
      if (kind === 'sheet') { el.style.transform = 'translateY(110%)'; document.getElementById('sheetWrap').dataset.dragged = '1'; }
      else if (kind === 'quick') { el.style.transform = 'translateX(-110%)'; document.getElementById('quickWrap').dataset.dragged = '1'; }
      else { el.style.transform = 'translateY(70%) scale(.9)'; el.style.opacity = '0'; el.dataset.dragged = '1'; }
      buzz(8);
      back();
    } else {
      el.style.transform = ''; el.style.borderRadius = '';
      document.querySelectorAll('#sheetWrap .backdrop, #quickWrap .backdrop').forEach(b => { b.style.opacity = ''; });
    }
  }, { passive: true });

  /* ============ Тост: смахнуть в сторону ============ */
  let td = null;
  document.addEventListener('touchstart', e => {
    const t = e.target.closest('.toast');
    td = t ? { el: t, x0: e.touches[0].clientX, dx: 0 } : null;
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!td) return;
    td.dx = e.touches[0].clientX - td.x0;
    td.el.style.transition = 'none';
    td.el.style.transform = `translateX(calc(-50% + ${td.dx}px))`;
    td.el.style.opacity = Math.max(0, 1 - Math.abs(td.dx) / 240).toFixed(2);
  }, { passive: true });
  document.addEventListener('touchend', () => {
    if (!td) return;
    const el = td.el, dx = td.dx;
    td = null;
    el.style.transition = '';
    if (Math.abs(dx) > 90) {
      el.style.transform = `translateX(calc(-50% + ${dx > 0 ? 120 : -120}%))`;
      el.style.opacity = '0';
      setTimeout(() => { if (el.parentNode) el.remove(); }, 260);
    } else { el.style.transform = ''; el.style.opacity = ''; }
  }, { passive: true });

  /* ============ Свайп по расписанию: соседний день ============ */
  let ds = null;
  document.addEventListener('touchstart', e => {
    ds = null;
    if (ui.tab !== 'schedule' || ui.overlays.length || e.touches.length !== 1) return;
    const zone = e.target.closest('#dayContent, #daybar');
    if (!zone || e.target.closest('.check-item') || e.touches[0].clientX < 30) return;
    ds = { x0: e.touches[0].clientX, y0: e.touches[0].clientY, done: false };
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!ds || ds.done) return;
    const dx = e.touches[0].clientX - ds.x0, dy = e.touches[0].clientY - ds.y0;
    if (Math.abs(dy) > 30 && Math.abs(dy) > Math.abs(dx)) { ds = null; return; }
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) {
      ds.done = true;
      swallow();
      shiftDay(dx < 0 ? 1 : -1);
    }
  }, { passive: true });
  function shiftDay(step) {
    let d = ui.selDay + step;
    const dc = document.getElementById('dayContent');
    if (dc) dc.dataset.dir = step > 0 ? 'fwd' : 'back';
    if (d < 0 || d > 6) {
      ui.weekOffset += step;
      ui.selDay = d < 0 ? 6 : 0;
      renderWeekbar(); renderDaybar(); loadWeek(ui.weekOffset);
    } else {
      ui.selDay = d;
      document.querySelectorAll('.dayb').forEach(b => { const on = +b.dataset.d === ui.selDay; b.classList.toggle('sel', on); b.setAttribute('aria-pressed', on); });
      moveDayInd(false);
    }
    buzz(6);
    setAnimate(document.getElementById('dayContent'));
    renderDay();
  }
})();
