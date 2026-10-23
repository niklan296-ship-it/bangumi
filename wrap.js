'use strict';
/* «Итоги года»: истории на весь экран (листаются касанием, сами идут дальше),
   в конце — карточка, которую можно отправить друзьям картинкой. */

const YearWrap = (() => {
  const DUR = 6500;
  let W = null; // { year, st, i, n, timer, start, elapsed, paused, downAt }

  /* ---------- Подсчёт ---------- */
  function pickYear() {
    const now = new Date(), y = now.getFullYear();
    if (now.getMonth() === 0 && now.getDate() <= 20 && stats(y).eps === 0 && stats(y - 1).eps > 0) return y - 1;
    return y;
  }
  function info(id) {
    const it = state.items[id], g = state.gone[id];
    if (it) return { t: title(it), c: it.coverXL || it.cover || '', col: it.color || hueColor(title(it)), genres: it.genres || [] };
    if (g) return { t: g.t, c: g.c || '', col: g.col || hueColor(g.t), genres: [] };
    return null;
  }
  function stats(year) {
    const from = new Date(year, 0, 1).getTime(), to = new Date(year + 1, 0, 1).getTime();
    const perId = {}, perMonth = new Array(12).fill(0), days = [];
    let eps = 0, mins = 0, best = { k: null, e: 0 };
    Object.entries(state.watchLog || {}).forEach(([k, day]) => {
      const tm = keyTime(k);
      if (tm < from || tm >= to) return;
      let de = 0;
      Object.entries(day).forEach(([id, e]) => { if (e > 0) { perId[id] = (perId[id] || 0) + e; de += e; mins += e * itemDur(id); } });
      if (de <= 0) return;
      eps += de; days.push(tm); perMonth[new Date(tm).getMonth()] += de;
      if (de > best.e) best = { k, e: de };
    });
    days.sort((a, b) => a - b);
    let streak = 0, run = 0;
    days.forEach((tm, i) => { run = i && Math.round((tm - days[i - 1]) / 86400000) === 1 ? run + 1 : 1; streak = Math.max(streak, run); });
    const top = Object.entries(perId).map(([id, e]) => ({ id, e, mins: e * itemDur(id), x: info(id) })).filter(r => r.x).sort((a, b) => b.mins - a.mins);
    const gAcc = {};
    top.forEach(r => (r.x.genres || []).forEach(g => { gAcc[g] = (gAcc[g] || 0) + r.mins; }));
    const genres = Object.entries(gAcc).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g, m]) => ({ g, name: (GENRE[g] || {}).ru || g, c: (GENRE[g] || {}).c || '#FFB81C', pct: mins ? Math.min(100, Math.round(m / mins * 100)) : 0 }));
    const mi = perMonth.indexOf(Math.max(...perMonth));
    const completed = Object.values(state.items).filter(it => it.status === 'completed' && it.updatedAt >= from && it.updatedAt < to).length;
    return { year, eps, mins, hours: Math.round(mins / 60), titles: top.length, top, genres, month: eps ? mi : -1, monthEps: perMonth[mi] || 0, streak, active: days.length, best, completed };
  }
  const monthName = i => { const s = new Intl.DateTimeFormat(LOC, { month: 'long' }).format(new Date(2000, i, 1)); return s.charAt(0).toUpperCase() + s.slice(1); };

  /* ---------- Слайды ---------- */
  function slides(st) {
    const y = st.year;
    const intro = `<div class="yw-c"><div class="yw-in yw-kick" style="--d:0">番 ${T('Бангуми')}</div>
      <div class="yw-in yw-year" style="--d:1">${y}</div>
      <p class="yw-in yw-sub" style="--d:2">${T('Твой год в аниме')}</p>
      <span class="yw-in yw-hint" style="--d:4">${T('Касайся справа — дальше, слева — назад')}</span></div>`;
    if (!st.eps) return [intro, `<div class="yw-c"><div class="yw-in yw-emoji" style="--d:0">🌱</div>
      <p class="yw-in yw-lead" style="--d:1">${T('Пока пусто')}</p>
      <p class="yw-in yw-sub" style="--d:2">${T('Отмечай серии — итоги соберутся сами.')}</p></div>`];
    const out = [intro];
    const days = (st.mins / 1440).toLocaleString(LOC, { maximumFractionDigits: 1 });
    out.push(`<div class="yw-c"><p class="yw-in yw-lead" style="--d:0">${T('В этом году ты смотрел аниме')}</p>
      <div class="yw-in yw-num" style="--d:1" data-yw-count="${st.hours}">0</div>
      <div class="yw-in yw-unit" style="--d:2">${pl(st.hours, T('час'), T('часа'), T('часов'))}</div>
      <p class="yw-in yw-sub" style="--d:3">${sers(st.eps)} · ${st.titles} ${pl(st.titles, T('тайтл'), T('тайтла'), T('тайтлов'))}</p>
      <p class="yw-in yw-note" style="--d:4">${T('Это')} ${days} ${L('суток без перерыва', 'days non-stop')}</p></div>`);
    if (st.genres.length) {
      const g = st.genres[0];
      out.push(`<div class="yw-c" style="--g:${g.c}"><p class="yw-in yw-lead" style="--d:0">${T('Жанр года')}</p>
        <div class="yw-in yw-genre" style="--d:1">${esc(g.name)}</div>
        <p class="yw-in yw-sub" style="--d:2">${g.pct}% ${T('времени — тайтлы этого жанра')}</p>
        <div class="yw-bars">${st.genres.map((x, i) => `<div class="yw-in yw-bar" style="--d:${3 + i};--c:${x.c};--w:${Math.max(8, x.pct)}%"><span>${esc(x.name)}</span><i></i><b>${x.pct}%</b></div>`).join('')}</div></div>`);
    }
    out.push(`<div class="yw-c"><p class="yw-in yw-lead" style="--d:0">${T('Топ года')}</p>
      <ol class="yw-top">${st.top.slice(0, 5).map((r, i) => `<li class="yw-in" style="--d:${1 + i};--c:${esc(r.x.col)}"><span class="yw-rank">${i + 1}</span>
        <span class="yw-cov">${r.x.c ? `<img src="${esc(r.x.c)}" alt="" loading="lazy">` : ''}</span>
        <span class="yw-tt"><b>${esc(r.x.t)}</b><small>${fmtDur(r.mins)} · ${sers(r.e)}</small></span></li>`).join('')}</ol></div>`);
    out.push(`<div class="yw-c"><p class="yw-in yw-lead" style="--d:0">${T('Твой ритм')}</p>
      <div class="yw-grid">
        <div class="yw-in yw-tile" style="--d:1"><small>${T('Самый активный месяц')}</small><b class="txt">${monthName(st.month)}</b><span>${sers(st.monthEps)}</span></div>
        <div class="yw-in yw-tile" style="--d:2"><small>${T('Дней подряд')}</small><b>${st.streak}</b><span>${T('лучшая серия дней')}</span></div>
        <div class="yw-in yw-tile" style="--d:3"><small>${T('Дней с аниме')}</small><b>${st.active}</b><span>${T('из')} ${isLeap(st.year) ? 366 : 365}</span></div>
        <div class="yw-in yw-tile" style="--d:4"><small>${T('Рекорд за день')}</small><b>${st.best.e}</b><span>${st.best.k ? esc(new Intl.DateTimeFormat(LOC, { day: 'numeric', month: 'long' }).format(keyDate(st.best.k))) : ''}</span></div>
      </div></div>`);
    out.push(`<div class="yw-c yw-final"><div class="yw-in yw-card" style="--d:0">
        <div class="yw-card-top"><span>番 ${T('Бангуми')}</span><span>${y}</span></div>
        <div class="yw-card-big"><b>${st.hours}</b><span>${pl(st.hours, T('час'), T('часа'), T('часов'))} ${T('аниме')}</span></div>
        <div class="yw-card-row"><div><b>${st.eps}</b><small>${pl(st.eps, T('серия'), T('серии'), T('серий'))}</small></div><div><b>${st.titles}</b><small>${pl(st.titles, T('тайтл'), T('тайтла'), T('тайтлов'))}</small></div><div><b>${st.streak}</b><small>${T('дней подряд')}</small></div></div>
        <div class="yw-card-top3">${st.top.slice(0, 3).map((r, i) => `<span><i>${i + 1}</i>${esc(r.x.t)}</span>`).join('')}</div>
        ${st.genres[0] ? `<div class="yw-card-g" style="--c:${st.genres[0].c}">${T('Жанр года')}: <b>${esc(st.genres[0].name)}</b></div>` : ''}
      </div>
      <div class="yw-in yw-actions" style="--d:2"><button type="button" class="btn grad" data-yw="share">${T('Поделиться')}</button><button type="button" class="btn" data-yw="save">${T('Сохранить картинку')}</button></div></div>`);
    return out;
  }
  const isLeap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

  /* ---------- Показ ---------- */
  function open(year) {
    const y = year || pickYear();
    const st = stats(y);
    const list = slides(st);
    W = { year: y, st, i: 0, n: list.length, timer: 0, start: 0, elapsed: 0, paused: false, downAt: 0, downX: 0 };
    const root = document.createElement('div');
    root.className = 'yw';
    root.id = 'yearWrap';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', T('Итоги года') + ' ' + y);
    root.innerHTML = `<div class="yw-bg"><i></i><i></i><i></i></div>
      <div class="yw-prog">${list.map(() => '<span><i></i></span>').join('')}</div>
      <button type="button" class="yw-close" data-yw="close" aria-label="${T('Закрыть')}">${ICON.x}</button>
      <div class="yw-slides">${list.map((h, k) => `<section class="yw-slide" data-k="${k}">${h}</section>`).join('')}</div>`;
    document.body.appendChild(root);
    document.body.classList.add('locked');
    pushOverlay('wrap');
    requestAnimationFrame(() => { root.classList.add('in'); show(0); });
    buzz(16);
  }
  function show(i) {
    const root = $('#yearWrap');
    if (!root || !W) return;
    W.i = Math.max(0, Math.min(W.n - 1, i));
    root.querySelectorAll('.yw-slide').forEach((s, k) => { s.classList.toggle('on', k === W.i); s.classList.toggle('past', k < W.i); });
    root.querySelectorAll('.yw-prog span').forEach((s, k) => { s.className = k < W.i ? 'done' : k === W.i ? 'cur' : ''; });
    root.style.setProperty('--hue', (W.i * 47) % 360);
    const cur = root.querySelector('.yw-slide.on');
    cur.querySelectorAll('[data-yw-count]').forEach(el => countTo(el, +el.dataset.ywCount));
    clearTimeout(W.timer);
    W.elapsed = 0; W.start = Date.now(); W.paused = false;
    root.classList.remove('paused');
    const bar = root.querySelector('.yw-prog .cur i');
    if (bar) { bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; bar.style.animationDuration = DUR + 'ms'; }
    if (W.i < W.n - 1) W.timer = setTimeout(() => show(W.i + 1), DUR);
  }
  function countTo(el, to) {
    if (reduced || !to) { el.textContent = to.toLocaleString(LOC); return; }
    const t0 = performance.now(), dur = 1400;
    const step = now => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(to * e).toLocaleString(LOC);
      if (p < 1 && document.body.contains(el)) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function pause() {
    if (!W || W.paused) return;
    W.paused = true; W.elapsed += Date.now() - W.start; clearTimeout(W.timer);
    $('#yearWrap').classList.add('paused');
  }
  function resume() {
    if (!W || !W.paused) return;
    W.paused = false; W.start = Date.now();
    $('#yearWrap').classList.remove('paused');
    if (W.i < W.n - 1) W.timer = setTimeout(() => show(W.i + 1), Math.max(300, DUR - W.elapsed));
  }
  function close() { if ($('#yearWrap')) back(); }
  function closeNow() {
    const root = $('#yearWrap');
    if (W) clearTimeout(W.timer);
    W = null;
    if (!root) return;
    root.classList.remove('in');
    root.classList.add('out');
    document.body.classList.remove('locked');
    setTimeout(() => root.remove(), reduced ? 0 : 320);
  }

  /* ---------- Картинка ---------- */
  function loadImg(src) {
    return new Promise(res => {
      if (!src) return res(null);
      const im = new Image();
      im.crossOrigin = 'anonymous';
      const tm = setTimeout(() => res(null), 5000);
      im.onload = () => { clearTimeout(tm); res(im); };
      im.onerror = () => { clearTimeout(tm); res(null); };
      im.src = src + (src.includes('?') ? '&' : '?') + 'yw=1';
    });
  }
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function fit(ctx, text, max) {
    if (ctx.measureText(text).width <= max) return text;
    let s = text;
    while (s.length > 1 && ctx.measureText(s + '…').width > max) s = s.slice(0, -1);
    return s.trimEnd() + '…';
  }
  async function drawCard(st, withCovers) {
    const Wd = 1080, H = 1350;
    const cv = document.createElement('canvas');
    cv.width = Wd; cv.height = H;
    const ctx = cv.getContext('2d');
    const disp = "'Unbounded', 'Onest', system-ui, sans-serif", body = "'Onest', system-ui, sans-serif";
    try { await Promise.all([document.fonts.load(`800 120px Unbounded`), document.fonts.load(`700 40px Onest`)]); } catch (e) { /* без шрифтов */ }
    // фон
    const bg = ctx.createLinearGradient(0, 0, Wd, H);
    bg.addColorStop(0, '#16112A'); bg.addColorStop(.55, '#0D0C15'); bg.addColorStop(1, '#1A0F1E');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, Wd, H);
    [[880, 180, 420, 'rgba(255,122,69,.38)'], [120, 560, 460, 'rgba(124,157,255,.26)'], [760, 1180, 520, 'rgba(255,77,141,.30)']].forEach(([x, y, r, c]) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, Wd, H);
    });
    const grad = ctx.createLinearGradient(80, 0, 900, 0);
    grad.addColorStop(0, '#FFC23D'); grad.addColorStop(.52, '#FF7A45'); grad.addColorStop(1, '#FF4D8D');
    // шапка
    rr(ctx, 80, 80, 64, 64, 18); ctx.fillStyle = grad; ctx.fill();
    ctx.fillStyle = '#1E1400'; ctx.font = `800 36px ${body}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('番', 112, 114);
    ctx.textAlign = 'left'; ctx.fillStyle = '#F4F3FA'; ctx.font = `700 34px ${disp}`; ctx.fillText(T('Бангуми'), 166, 114);
    ctx.textBaseline = 'alphabetic';
    // год
    ctx.font = `800 230px ${disp}`; ctx.fillStyle = grad; ctx.fillText(String(st.year), 72, 390);
    ctx.font = `600 44px ${body}`; ctx.fillStyle = '#C9C7DA'; ctx.fillText(T('Мой год в аниме'), 84, 462);
    // цифры
    const nums = [[st.hours, pl(st.hours, T('час'), T('часа'), T('часов'))], [st.eps, pl(st.eps, T('серия'), T('серии'), T('серий'))], [st.titles, pl(st.titles, T('тайтл'), T('тайтла'), T('тайтлов'))]];
    nums.forEach(([n, l], k) => {
      const x = 84 + k * 320;
      ctx.fillStyle = '#FFFFFF'; ctx.font = `800 96px ${disp}`; ctx.fillText(Number(n).toLocaleString(LOC), x, 610);
      ctx.fillStyle = '#A09FB8'; ctx.font = `600 34px ${body}`; ctx.fillText(l, x + 4, 660);
    });
    // топ-3
    ctx.fillStyle = '#FFB81C'; ctx.font = `700 30px ${body}`; ctx.fillText(T('Топ года').toUpperCase(), 84, 760);
    const top = st.top.slice(0, 3);
    const imgs = withCovers ? await Promise.all(top.map(r => loadImg(r.x.c))) : [];
    top.forEach((r, k) => {
      const y = 800 + k * 150;
      rr(ctx, 84, y, 96, 132, 16);
      if (imgs[k]) { ctx.save(); ctx.clip(); const im = imgs[k], s = Math.max(96 / im.width, 132 / im.height); ctx.drawImage(im, 84 + (96 - im.width * s) / 2, y + (132 - im.height * s) / 2, im.width * s, im.height * s); ctx.restore(); }
      else { ctx.fillStyle = r.x.col || '#333'; ctx.fill(); }
      ctx.fillStyle = '#FFFFFF'; ctx.font = `700 42px ${body}`; ctx.fillText(fit(ctx, (k + 1) + '. ' + r.x.t, 790), 210, y + 58);
      ctx.fillStyle = '#A09FB8'; ctx.font = `500 32px ${body}`; ctx.fillText(fmtDur(r.mins) + ' · ' + sers(r.e), 210, y + 104);
    });
    // жанр и серия дней
    const yb = 800 + Math.max(1, top.length) * 150 + 40;
    ctx.font = `600 34px ${body}`;
    const parts = [];
    if (st.genres[0]) parts.push(T('Жанр года') + ': ' + st.genres[0].name);
    if (st.streak > 1) parts.push(st.streak + ' ' + T('дней подряд'));
    ctx.fillStyle = '#F4F3FA'; ctx.fillText(fit(ctx, parts.join('  ·  '), 912), 84, Math.min(yb, 1270));
    return cv;
  }
  async function image() {
    let cv = await drawCard(W.st, true);
    try { return cv.toDataURL('image/png'); }
    catch (e) { cv = await drawCard(W.st, false); return cv.toDataURL('image/png'); }
  }
  async function shareOrSave(kind) {
    if (!W) return;
    const btn = document.querySelector(`[data-yw="${kind}"]`);
    if (btn) btn.disabled = true;
    try {
      const url = await image();
      const name = `bangumi-${W.year}.png`;
      const text = L(`Мой ${W.year} в аниме: ${W.st.hours} ч, ${W.st.eps} серий`, `My ${W.year} in anime: ${W.st.hours} h, ${W.st.eps} episodes`);
      const b64 = url.split(',')[1];
      if (kind === 'share' && NATIVE && typeof NATIVE.shareImage === 'function') { if (NATIVE.shareImage(b64, name, text)) return; }
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], name, { type: 'image/png' });
      if (kind === 'share' && navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], text }); return; } catch (e) { if (e.name === 'AbortError') return; } }
      if (kind === 'save' && NATIVE && typeof NATIVE.saveImage === 'function') { const w = NATIVE.saveImage(b64, name); toast(w ? T('Картинка сохранена') + ': ' + L('Картинки/Bangumi', 'Pictures/Bangumi') : T('Не получилось сделать картинку')); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast(T('Картинка сохранена'));
    } catch (e) { toast(T('Не получилось сделать картинку')); }
    finally { if (btn) btn.disabled = false; }
  }

  /* ---------- Касания ---------- */
  document.addEventListener('pointerdown', e => {
    if (!W || !e.target.closest('#yearWrap') || e.target.closest('button, a')) return;
    W.downAt = Date.now(); W.downX = e.clientX;
    pause();
  });
  document.addEventListener('pointerup', e => {
    if (!W || !W.downAt) return;
    const held = Date.now() - W.downAt;
    W.downAt = 0;
    if (held < 260 && e.target.closest('#yearWrap')) {
      buzz(6);
      if (W.downX < innerWidth * 0.33) show(W.i - 1);
      else if (W.i < W.n - 1) show(W.i + 1);
      else resume();
    } else resume();
  });
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-yw]');
    if (!b) return;
    const a = b.dataset.yw;
    if (a === 'close') close();
    else if (a === 'share' || a === 'save') shareOrSave(a);
  });
  document.addEventListener('keydown', e => {
    if (!W) return;
    if (e.key === 'ArrowRight') show(W.i + 1);
    else if (e.key === 'ArrowLeft') show(W.i - 1);
  });

  return { open, closeNow, stats, pickYear, _draw: drawCard, _state: () => W };
})();
