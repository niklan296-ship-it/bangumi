'use strict';
/* Бангуми — «Карта»: «Мой список» в виде ментальной карты, как в Заметках.
   Центр → группы → тайтлы. Карту можно двигать, приближать и поворачивать пальцами,
   узлы — перетаскивать. Раскладка, группы, вид узлов, линии, цвета, фон и анимации
   настраиваются в панели «Оформление». Всё хранится в state.settings.map. */
const MindMap = (function () {
  const DEF = {
    layout: 'right', group: 'status', node: 'line', edge: 'curve', width: 2.5,
    color: 'status', solid: '#FFB81C', bg: 'dots', appear: true, flow: 'none',
    rotate: 0, rotateGesture: true, bgMode: 'still', upright: false, root: 'Мой список', font: 100, show: 'all'
  };
  const RAINBOW = ['#FFB81C', '#FF7A45', '#FF4D8D', '#B18CFF', '#6EA8FF', '#3DDC97', '#4CC9F0', '#FF5E5B'];
  const SWATCHES = ['#FFB81C', '#FF7A45', '#FF4D8D', '#B18CFF', '#6EA8FF', '#3DDC97', '#4CC9F0', '#E8E6F5'];
  const RM = reduced;

  function cfg() {
    let c = state.settings.map;
    if (!c || typeof c !== 'object') c = state.settings.map = {};
    for (const k in DEF) if (c[k] === undefined) c[k] = DEF[k];
    if (!c.offsets) c.offsets = {};
    if (!c.collapsed) c.collapsed = {};
    return c;
  }

  let host = null, world = null, svg = null, layer = null, bubble = null;
  let tree = null, flat = [], byId = {};
  let view = { x: 0, y: 0, s: 1, r: 0 };
  let sel = null, full = false;

  /* ---------- Дерево ---------- */
  function buildTree(c) {
    const order = id => STATUSES.findIndex(s => s.id === id);
    const all = Object.values(state.items)
      .filter(it => c.show === 'all' || activeStatus(it.status))
      .sort((a, b) => order(a.status) - order(b.status) || title(a).localeCompare(title(b), 'ru'));
    const root = { id: 'root', kind: 'root', label: c.root || 'Мой список', children: [] };
    const leaf = (it, suf) => ({ id: 't:' + it.id + (suf || ''), kind: 'title', it, label: title(it), children: [] });
    let groups = null;
    if (c.group === 'status') {
      groups = STATUSES.map(s => ({ id: 'g:' + s.id, label: s.label, color: `var(--st-${s.id})`, items: all.filter(it => it.status === s.id) }));
    } else if (c.group === 'day') {
      groups = DAYS_FULL.map((d, i) => ({ id: 'g:d' + i, label: d, suf: '@' + i, items: all.filter(it => it.plan && it.plan.days && it.plan.days.includes(i)) }));
      groups.push({ id: 'g:dn', label: 'Без плана', suf: '@n', items: all.filter(it => !(it.plan && it.plan.days && it.plan.days.length)) });
    } else if (c.group === 'genre') {
      const m = {};
      all.forEach(it => { const g = (it.genres && it.genres[0]) || '—'; (m[g] = m[g] || []).push(it); });
      groups = Object.keys(m).sort((a, b) => m[b].length - m[a].length)
        .map(g => ({ id: 'g:ge:' + g, label: g === '—' ? 'Без жанра' : ((GENRE[g] || {}).ru || g), color: (GENRE[g] || {}).c, items: m[g] }));
    }
    if (!groups) root.children = all.map(it => leaf(it));
    else root.children = groups.filter(g => g.items.length).map(g => ({
      id: g.id, kind: 'group', label: g.label, gcolor: g.color, count: g.items.length,
      children: c.collapsed[g.id] ? [] : g.items.map(it => leaf(it, g.suf))
    }));
    root.color = c.color === 'solid' ? c.solid : 'var(--accent)';
    root.children.forEach((ch, i) => {
      let col;
      if (c.color === 'solid') col = c.solid;
      else if (c.color === 'rainbow') col = RAINBOW[i % RAINBOW.length];
      else if (c.color === 'status') col = ch.kind === 'group' ? (ch.gcolor || RAINBOW[i % 8]) : `var(--st-${ch.it.status})`;
      else col = ch.kind === 'title' ? (ch.it.color || hueColor(ch.label)) : (ch.gcolor || RAINBOW[i % 8]);
      ch.color = col;
      ch.children.forEach(l => {
        l.color = c.color === 'cover' ? (l.it.color || hueColor(l.label))
          : (c.color === 'status' && c.group !== 'status') ? `var(--st-${l.it.status})` : col;
      });
    });
    return root;
  }

  const horizontal = c => c.layout === 'right' || c.layout === 'left' || c.layout === 'both';
  const soloLine = c => !horizontal(c) || (c.upright && ((c.rotate % 360) + 360) % 360 !== 0);

  function nodeHTML(n, c, k) {
    const d = `style="--d:${n.depth};--i:${k};--bc:${n.color || 'var(--accent)'}"`;
    if (n.kind === 'root') return `<div class="mn mn-root" data-node="root" ${d}><span class="mn-in">${esc(n.label)}</span></div>`;
    if (n.kind === 'group') {
      const col = c.collapsed[n.id];
      return `<div class="mn mn-group${col ? ' collapsed' : ''}" data-node="${esc(n.id)}" ${d}><span class="mn-in">${esc(n.label)}<b>${n.count}</b>${col ? '<i class="mn-more">+</i>' : ''}</span></div>`;
    }
    const it = n.it, ne = activeStatus(it.status) ? newEps(it) : 0;
    const prog = `${it.progress}/${it.total || '?'}`;
    const dot = ne > 0 ? `<i class="mn-new" title="Доступно ещё ${ne}"></i>` : '';
    if (c.node === 'cover') {
      const col = it.color || hueColor(n.label);
      return `<div class="mn mn-title mn-cover" data-node="${esc(n.id)}" ${d}><span class="mn-in">
        <span class="mn-th" style="--c:${esc(col)}">${it.cover ? `<img src="${esc(it.cover)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : esc(initial(n.label))}</span>
        <span class="mn-tx"><span class="t">${esc(n.label)}</span><small>${prog}</small></span>${dot}</span></div>`;
    }
    const cls = c.node === 'pill' ? 'mn-pill' : ('mn-line' + (soloLine(c) ? ' solo' : ''));
    return `<div class="mn mn-title ${cls}" data-node="${esc(n.id)}" ${d}><span class="mn-in"><span class="t">${esc(n.label)}</span><small>${prog}</small>${dot}</span></div>`;
  }

  /* ---------- Раскладка ---------- */
  function layout(c) {
    flat = []; byId = {};
    (function walk(n, d, p) { n.depth = d; n.parent = p; flat.push(n); byId[n.id] = n; n.children.forEach(ch => walk(ch, d + 1, n)); })(tree, 0, null);
    flat.forEach(n => { const el = n.el; n.w = el.offsetWidth; n.h = el.offsetHeight; });
    if (c.layout === 'radial') radial(c);
    else treeLayout(c);
    applyOffsets(c);
  }
  function treeLayout(c) {
    const H = horizontal(c);
    const GAP_D = H ? 58 : 54;
    const GAP_S = c.node === 'cover' ? 12 : H ? 8 : 14;
    const ext = n => H ? n.w : n.h, cross = n => H ? n.h : n.w;
    function size(n) {
      if (!n.children.length) return (n.sz = cross(n));
      let s = 0;
      n.children.forEach((ch, i) => { s += size(ch) + (i ? GAP_S : 0); });
      return (n.sz = Math.max(cross(n), s));
    }
    const kids = tree.children;
    kids.forEach(size);
    let right = kids, left = [];
    if (c.layout === 'left') { right = []; left = kids; }
    else if (c.layout === 'both') {
      right = []; left = [];
      let rs = 0, ls = 0;
      kids.forEach(k => { if (rs <= ls) { right.push(k); rs += k.sz; } else { left.push(k); ls += k.sz; } });
    }
    tree.bx = 0; tree.by = 0;
    [[right, 1], [left, -1]].forEach(([list, dir]) => {
      if (!list.length) return;
      const maxExt = [];
      (function m(ns) { ns.forEach(n => { maxExt[n.depth] = Math.max(maxExt[n.depth] || 0, ext(n)); m(n.children); }); })(list);
      const colStart = [];
      colStart[1] = ext(tree) / 2 + GAP_D;
      for (let d = 2; d < maxExt.length; d++) colStart[d] = colStart[d - 1] + maxExt[d - 1] + GAP_D;
      const total = list.reduce((s, n, i) => s + n.sz + (i ? GAP_S : 0), 0);
      (function place(ns, start) {
        let cur = start;
        ns.forEach(n => {
          const main = dir * (colStart[n.depth] + ext(n) / 2);
          const span = n.children.reduce((s, ch, i) => s + ch.sz + (i ? GAP_S : 0), 0);
          const crossC = cur + n.sz / 2;
          if (H) { n.bx = main; n.by = crossC; } else { n.bx = crossC; n.by = main; }
          if (n.children.length) place(n.children, crossC - span / 2);
          cur += n.sz + GAP_S;
        });
      })(list, -total / 2);
    });
  }
  function radial(c) {
    const leaves = flat.filter(n => n !== tree && !n.children.length);
    const L = Math.max(1, leaves.length);
    leaves.forEach((n, i) => { n.ang = -Math.PI / 2 + (2 * Math.PI * i) / L; });
    (function ang(n) {
      if (!n.children.length) return;
      n.children.forEach(ang);
      const a = n.children[0].ang, b = n.children[n.children.length - 1].ang;
      n.ang = (a + b) / 2;
    })(tree);
    const maxD = Math.max(...flat.map(n => n.depth));
    const maxW = []; flat.forEach(n => { maxW[n.depth] = Math.max(maxW[n.depth] || 0, n.w); });
    const leafH = Math.max(...leaves.map(n => n.h), 20);
    const R = [0];
    R[1] = Math.max(tree.w / 2 + 70, maxD === 1 ? (L * (leafH + 10)) / (2 * Math.PI) : 120);
    for (let d = 2; d <= maxD; d++) R[d] = Math.max(R[d - 1] + maxW[d - 1] + 60, d === maxD ? (L * (leafH + 10)) / (2 * Math.PI) : 0);
    tree.bx = 0; tree.by = 0;
    flat.forEach(n => {
      if (n === tree) return;
      const r = R[n.depth], cs = Math.cos(n.ang), sn = Math.sin(n.ang);
      n.bx = r * cs + (n.children.length ? 0 : cs * n.w / 2);
      n.by = r * sn + (n.children.length ? 0 : sn * n.h / 2);
    });
  }
  function applyOffsets(c) {
    (function walk(n, ox, oy) {
      const o = c.offsets[n.id];
      const nx = ox + (o ? o.x : 0), ny = oy + (o ? o.y : 0);
      n.x = n.bx + nx; n.y = n.by + ny;
      n.children.forEach(ch => walk(ch, nx, ny));
    })(tree, 0, 0);
  }

  /* ---------- Рисование ---------- */
  function placeNodes() {
    flat.forEach(n => { n.el.style.left = (n.x - n.w / 2).toFixed(1) + 'px'; n.el.style.top = (n.y - n.h / 2).toFixed(1) + 'px'; });
  }
  function anchor(n, tx, ty) {
    const dx = tx - n.x, dy = ty - n.y;
    if (!dx && !dy) return [n.x, n.y];
    const sx = Math.abs(dx) / (n.w / 2 + 2), sy = Math.abs(dy) / (n.h / 2 + 2);
    const k = 1 / Math.max(sx, sy, 1e-6);
    return [n.x + dx * k, n.y + dy * k];
  }
  function edgeD(p, n, c) {
    const lineTail = n.kind === 'title' && c.node === 'line' && !soloLine(c);
    const f = v => v.toFixed(1);
    if (horizontal(c)) {
      const dir = n.x >= p.x ? 1 : -1;
      const x1 = p.x + dir * p.w / 2, y1 = p.y;
      const x2 = n.x - dir * n.w / 2;
      const y2 = lineTail ? n.y + n.h / 2 - 1 : n.y;
      const k = Math.abs(x2 - x1) * 0.55;
      let d;
      if (c.edge === 'straight') d = `M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`;
      else if (c.edge === 'elbow') { const mx = x1 + dir * Math.min(26, Math.abs(x2 - x1) / 2); d = `M${f(x1)} ${f(y1)}H${f(mx)}V${f(y2)}H${f(x2)}`; }
      else d = `M${f(x1)} ${f(y1)}C${f(x1 + dir * k)} ${f(y1)} ${f(x2 - dir * k)} ${f(y2)} ${f(x2)} ${f(y2)}`;
      if (lineTail) d += `H${f(n.x + dir * n.w / 2)}`;
      return d;
    }
    if (c.layout === 'down') {
      const dir = n.y >= p.y ? 1 : -1;
      const x1 = p.x, y1 = p.y + dir * p.h / 2, x2 = n.x, y2 = n.y - dir * n.h / 2;
      const k = Math.abs(y2 - y1) * 0.55;
      if (c.edge === 'straight') return `M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`;
      if (c.edge === 'elbow') { const my = y1 + dir * Math.min(24, Math.abs(y2 - y1) / 2); return `M${f(x1)} ${f(y1)}V${f(my)}H${f(x2)}V${f(y2)}`; }
      return `M${f(x1)} ${f(y1)}C${f(x1)} ${f(y1 + dir * k)} ${f(x2)} ${f(y2 - dir * k)} ${f(x2)} ${f(y2)}`;
    }
    const [x1, y1] = anchor(p, n.x, n.y), [x2, y2] = anchor(n, p.x, p.y);
    if (c.edge === 'straight') return `M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`;
    const ux = Math.cos(n.ang || 0), uy = Math.sin(n.ang || 0);
    const k = Math.hypot(x2 - x1, y2 - y1) * 0.45;
    if (c.edge === 'elbow') return `M${f(x1)} ${f(y1)}L${f(x1 + ux * k * 0.6)} ${f(y1 + uy * k * 0.6)}L${f(x2)} ${f(y2)}`;
    return `M${f(x1)} ${f(y1)}C${f(x1 + ux * k)} ${f(y1 + uy * k)} ${f(x2 - ux * k)} ${f(y2 - uy * k)} ${f(x2)} ${f(y2)}`;
  }
  function drawEdges(c) {
    const under = [], core = [], over = [];
    const lite = typeof isLite === 'function' && isLite();
    flat.forEach((n, i) => {
      if (!n.parent) return;
      const d = edgeD(n.parent, n, c);
      const wn = n.depth === 1 ? c.width * 1.4 : c.width;
      const id = esc(n.id), col = n.color;
      const hi = `color-mix(in srgb, ${col} 40%, #fff)`;
      const dl = ((n.depth - 1) * 0.42 + (i % 7) * 0.07).toFixed(2);
      const pid = 'mp' + i;
      const f = v => v.toFixed(2);
      let coreCol = col, coreW = wn;
      if (c.flow === 'flow') {
        // Поток: от центра к краям бегут кометы с хвостом, ветки слегка подсвечены
        if (!lite) under.push(`<path class="me-halo" data-e="${id}" d="${d}" style="stroke:${col};stroke-width:${f(wn * 3.4)}"/>`);
        over.push(`<path class="me-tail" data-e="${id}" d="${d}" pathLength="1" style="stroke:${col};stroke-width:${f(wn * 1.6)};--dl:${dl}s"/>`);
        over.push(`<path class="me-head" data-e="${id}" d="${d}" pathLength="1" style="stroke:${hi};stroke-width:${f(wn * 1.7)};--dl:${dl}s"/>`);
        if (!lite) over.push(`<path class="me-headglow" data-e="${id}" d="${d}" pathLength="1" style="stroke:${col};stroke-width:${f(wn * 6)};--dl:${dl}s"/>`);
      } else if (c.flow === 'glow') {
        // Дыхание: мягкое свечение волной от центра наружу
        const bd = ((n.depth - 1) * 0.38).toFixed(2);
        under.push(`<path class="me-breath" data-e="${id}" d="${d}" style="stroke:${col};stroke-width:${f(wn * 6)};--dl:${bd}s"/>`);
        if (!lite) under.push(`<path class="me-breath2" data-e="${id}" d="${d}" style="stroke:${col};stroke-width:${f(wn * 2.6)};--dl:${bd}s"/>`);
      } else if (c.flow === 'sparks') {
        // Искры: светлячки летят по веткам
        under.push(`<path class="me-halo soft" data-e="${id}" d="${d}" style="stroke:${col};stroke-width:${f(wn * 3)}"/>`);
        const dur = (2.6 + (i % 4) * 0.4).toFixed(2);
        const count = lite ? 1 : (n.depth === 1 ? 3 : 2);
        for (let k = 0; k < count; k++) {
          const b = (n.depth * 0.3 + k * dur / count + (i % 5) * 0.13).toFixed(2);
          const anim = `<animateMotion dur="${dur}s" begin="${b}s" repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines=".4 0 .6 1" keyPoints="0;1"><mpath href="#${pid}"/></animateMotion><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.12;.82;1" dur="${dur}s" begin="${b}s" repeatCount="indefinite"/>`;
          over.push(`<g class="me-spark" opacity="0">${lite ? '' : `<circle r="${f(wn * 2.6)}" fill="${col}" opacity=".28"/>`}<circle r="${f(Math.max(1.6, wn * 0.95))}" fill="${hi}"/>${anim}</g>`);
        }
      } else if (c.flow === 'neon') {
        // Неон: светящаяся трубка, иногда мерцает
        const fl = (-((i * 1.37) % 7)).toFixed(2);
        under.push(`<path class="me-neon-o" data-e="${id}" d="${d}" style="stroke:${col};stroke-width:${f(wn * 6.5)};--fl:${fl}s"/>`);
        under.push(`<path class="me-neon-m" data-e="${id}" d="${d}" style="stroke:${col};stroke-width:${f(wn * 2.8)};--fl:${fl}s"/>`);
        coreCol = hi; coreW = Math.max(1, wn * 0.75);
        core.push(`<path class="me neon" id="${pid}" data-e="${id}" d="${d}" pathLength="1" style="stroke:${coreCol};stroke-width:${f(coreW)};--d:${n.depth};--i:${i};--fl:${fl}s"/>`);
        return;
      }
      core.push(`<path class="me" id="${pid}" data-e="${id}" d="${d}" pathLength="1" style="stroke:${coreCol};stroke-width:${f(coreW)};--d:${n.depth};--i:${i};--dl:${dl}s"/>`);
    });
    svg.innerHTML = `<g class="fx-under">${under.join('')}</g><g class="fx-core">${core.join('')}</g><g class="fx-over">${over.join('')}</g>`;
  }
  function updateEdges(c, ids) {
    flat.forEach(n => {
      if (!n.parent || (ids && !ids.has(n.id))) return;
      const d = edgeD(n.parent, n, c);
      svg.querySelectorAll(`[data-e="${CSS.escape(n.id)}"]`).forEach(e => e.setAttribute('d', d));
    });
  }

  /* ---------- Вид: сдвиг, масштаб, поворот ---------- */
  function applyView(animated) {
    if (!world) return;
    world.classList.toggle('glide', !!animated && !RM);
    world.style.transform = `translate(${view.x.toFixed(1)}px, ${view.y.toFixed(1)}px) rotate(${view.r.toFixed(2)}deg) scale(${view.s.toFixed(4)})`;
    world.style.setProperty('--rr', view.r.toFixed(2));
    host.style.setProperty('--bgx', view.x.toFixed(1) + 'px');
    host.style.setProperty('--bgy', view.y.toFixed(1) + 'px');
    host.style.setProperty('--bgs', Math.max(0.35, view.s).toFixed(3));
    if (animated) setTimeout(() => { if (world) world.classList.remove('glide'); positionBubble(); }, 460);
    positionBubble();
  }
  function toScreen(x, y) {
    const a = view.r * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
    return [view.x + view.s * (x * cs - y * sn), view.y + view.s * (x * sn + y * cs)];
  }
  function toWorldDelta(dx, dy) {
    const a = -view.r * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
    return [(dx * cs - dy * sn) / view.s, (dx * sn + dy * cs) / view.s];
  }
  function fit(animated) {
    if (!flat.length || !host) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const a = view.r * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
    flat.forEach(n => {
      [[n.x - n.w / 2, n.y - n.h / 2], [n.x + n.w / 2, n.y - n.h / 2], [n.x - n.w / 2, n.y + n.h / 2], [n.x + n.w / 2, n.y + n.h / 2]].forEach(([px, py]) => {
        const rx = px * cs - py * sn, ry = px * sn + py * cs;
        x0 = Math.min(x0, rx); x1 = Math.max(x1, rx); y0 = Math.min(y0, ry); y1 = Math.max(y1, ry);
      });
    });
    const W = host.clientWidth, Hh = host.clientHeight;
    const want = Math.min((W - 40) / Math.max(1, x1 - x0), (Hh - 110) / Math.max(1, y1 - y0));
    const wantW = (W - 32) / Math.max(1, x1 - x0);
    let s = want < 0.6 ? Math.max(0.6, Math.min(1.2, wantW)) : Math.min(1.5, want);
    view.s = s;
    const c = cfg();
    const rx = tree.x * cs - tree.y * sn, ry = tree.x * sn + tree.y * cs;
    // По ширине: всё влезает — по центру, иначе прижимаем к краю со стороны центра карты
    if (s * (x1 - x0) <= W - 32) view.x = W / 2 - s * (x0 + x1) / 2;
    else if (c.layout === 'left') view.x = W - 16 - s * x1;
    else if (c.layout === 'right') view.x = 16 - s * x0;
    else view.x = W / 2 - s * rx;
    // По высоте: всё влезает — по центру, иначе центр карты посередине, остальное свайпом
    if (s * (y1 - y0) <= Hh - 110) view.y = (Hh - 60) / 2 - s * (y0 + y1) / 2;
    else if (c.layout === 'down') view.y = 40 - s * y0;
    else view.y = (Hh - 60) / 2 - s * ry;
    applyView(animated);
    saveView();
  }
  let saveT = null;
  function saveView() {
    clearTimeout(saveT);
    saveT = setTimeout(() => { const c = cfg(); c.view = { x: view.x, y: view.y, s: view.s, r: view.r }; c.rotate = Math.round(view.r); save(); }, 300);
  }
  function zoomAt(f, sx, sy, animated) {
    const s2 = Math.max(0.25, Math.min(3, view.s * f));
    const k = s2 / view.s;
    view.x = sx - (sx - view.x) * k; view.y = sy - (sy - view.y) * k; view.s = s2;
    applyView(animated); saveView();
  }
  function rotateBy(deg, animated) {
    const W = host.clientWidth / 2, Hh = host.clientHeight / 2;
    const a = deg * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
    const dx = view.x - W, dy = view.y - Hh;
    view.x = W + dx * cs - dy * sn; view.y = Hh + dx * sn + dy * cs;
    view.r += deg;
    applyView(animated); saveView();
    if (cfg().upright) relayoutSoon();
  }

  /* ---------- Пузырь действий над выбранным узлом ---------- */
  function positionBubble() {
    if (!bubble || bubble.hidden || !sel || !byId[sel]) return;
    const n = byId[sel];
    const [sx, sy] = toScreen(n.x, n.y);
    const top = sy - (n.h / 2) * view.s - 10;
    const bw = bubble.offsetWidth || 140;
    bubble.style.left = Math.max(bw / 2 + 8, Math.min(host.clientWidth - bw / 2 - 8, sx)).toFixed(0) + 'px';
    bubble.style.top = Math.max(56, top).toFixed(0) + 'px';
  }
  function select(id) {
    sel = id;
    host.querySelectorAll('.mn.sel').forEach(e => e.classList.remove('sel'));
    const n = id && byId[id];
    if (!n) { bubble.hidden = true; return; }
    n.el.classList.add('sel');
    let h = '';
    if (n.kind === 'title') {
      const it = n.it;
      h = (canInc(it) ? `<button type="button" data-mact="inc">${ICON.play}<span>EP ${it.progress + 1}</span></button>` : '')
        + `<button type="button" data-mact="open">${ICON.info}<span>Открыть</span></button>`
        + `<button type="button" data-mact="menu" aria-label="Меню">${ICON.rows}</button>`;
    } else if (n.kind === 'group') {
      const col = cfg().collapsed[n.id];
      h = `<button type="button" data-mact="collapse">${col ? ICON.plus : ICON.x}<span>${col ? 'Развернуть' : 'Свернуть'}</span></button>`;
    } else {
      h = `<button type="button" data-mact="custom">${ICON.grid}<span>Оформление</span></button><button type="button" data-mact="fit">${ICON.check}<span>По центру</span></button>`;
    }
    if (n.kind !== 'root' && cfg().offsets[n.id]) h += `<button type="button" data-mact="unmove" aria-label="Вернуть на место">↺</button>`;
    bubble.innerHTML = h;
    bubble.hidden = false;
    bubble.classList.remove('pop'); void bubble.offsetWidth; bubble.classList.add('pop');
    positionBubble();
  }

  /* ---------- Жесты ---------- */
  function bind(el) {
    const pts = new Map();
    let g = null, lastTap = { id: null, t: 0 }, lpT = null;
    el.addEventListener('pointerdown', e => {
      if (e.target.closest('.map-tools, .map-bubble')) return;
      el.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const rect = el.getBoundingClientRect();
      if (pts.size === 1) {
        const nodeEl = e.target.closest('.mn');
        g = { mode: nodeEl ? 'press' : 'pan', node: nodeEl ? nodeEl.dataset.node : null, x0: e.clientX, y0: e.clientY, v0: { ...view }, t0: Date.now(), rect, moved: false };
        clearTimeout(lpT);
        if (nodeEl && byId[g.node] && byId[g.node].kind === 'title') {
          lpT = setTimeout(() => {
            if (!g || g.moved || g.mode !== 'press') return;
            g.mode = 'done'; buzz(18);
            const n = byId[g.node];
            if (window.openPeek) openPeek({ itemId: n.it.id });
          }, 460);
        }
      } else if (pts.size === 2) {
        clearTimeout(lpT);
        const [a, b] = [...pts.values()];
        g = { mode: 'pinch', d0: Math.hypot(b.x - a.x, b.y - a.y), a0: Math.atan2(b.y - a.y, b.x - a.x), m0: [(a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top], v0: { ...view }, rect, moved: true };
        host.classList.add('live');
      }
    });
    el.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId) || !g) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const c = cfg();
      if (g.mode === 'pinch' && pts.size >= 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(b.x - a.x, b.y - a.y), an = Math.atan2(b.y - a.y, b.x - a.x);
        const m = [(a.x + b.x) / 2 - g.rect.left, (a.y + b.y) / 2 - g.rect.top];
        const s = Math.max(0.25, Math.min(3, g.v0.s * d / g.d0));
        let r = g.v0.r;
        if (c.rotateGesture) {
          let dr = (an - g.a0) * 180 / Math.PI;
          r = g.v0.r + dr;
          const snap = Math.round(r / 90) * 90;
          if (Math.abs(r - snap) < 6) r = snap;
        }
        // мировая точка под начальным центром щипка остаётся под пальцами
        const a0 = g.v0.r * Math.PI / 180, cs0 = Math.cos(-a0), sn0 = Math.sin(-a0);
        const px = (g.m0[0] - g.v0.x) / g.v0.s, py = (g.m0[1] - g.v0.y) / g.v0.s;
        const wx = px * cs0 - py * sn0, wy = px * sn0 + py * cs0;
        const a1 = r * Math.PI / 180, cs = Math.cos(a1), sn = Math.sin(a1);
        view.s = s; view.r = r;
        view.x = m[0] - s * (wx * cs - wy * sn);
        view.y = m[1] - s * (wx * sn + wy * cs);
        applyView(false);
        return;
      }
      const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
      if (!g.moved && Math.hypot(dx, dy) < 7) return;
      if (!g.moved) {
        g.moved = true; clearTimeout(lpT);
        if (g.mode === 'press') {
          const n = byId[g.node];
          if (n && n.kind !== 'root') {
            g.mode = 'drag';
            const o = c.offsets[n.id] || { x: 0, y: 0 };
            g.o0 = { x: o.x, y: o.y };
            const ids = new Set();
            (function sub(m) { ids.add(m.id); m.children.forEach(sub); })(n);
            g.ids = ids;
            n.el.classList.add('dragging');
            host.classList.add('live');
            buzz(8);
          } else g.mode = 'pan';
        }
        if (g.mode === 'pan') host.classList.add('live');
      }
      if (g.mode === 'pan') {
        view.x = g.v0.x + dx; view.y = g.v0.y + dy;
        applyView(false);
      } else if (g.mode === 'drag') {
        const n = byId[g.node];
        const [wx, wy] = toWorldDelta(dx, dy);
        c.offsets[n.id] = { x: Math.round(g.o0.x + wx), y: Math.round(g.o0.y + wy) };
        applyOffsets(c);
        g.ids.forEach(id => { const m = byId[id]; m.el.style.left = (m.x - m.w / 2).toFixed(1) + 'px'; m.el.style.top = (m.y - m.h / 2).toFixed(1) + 'px'; });
        updateEdges(c, g.ids);
        positionBubble();
      }
    });
    const up = e => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      clearTimeout(lpT);
      if (!g) return;
      if (g.mode === 'pinch') {
        if (pts.size === 1) { const [p] = [...pts.values()]; g = { mode: 'pan', x0: p.x, y0: p.y, v0: { ...view }, moved: true, rect: g.rect }; return; }
        host.classList.remove('live'); saveView(); g = null;
        if (cfg().upright) relayoutSoon();
        return;
      }
      if (pts.size) return;
      host.classList.remove('live');
      if (g.mode === 'drag') {
        const n = byId[g.node]; if (n) n.el.classList.remove('dragging');
        save(); select(g.node);
      } else if (g.mode === 'pan' && g.moved) saveView();
      else if (!g.moved && g.mode !== 'done') {
        const now = Date.now();
        if (g.node) {
          const n = byId[g.node];
          if (n && n.kind === 'title' && lastTap.id === g.node && now - lastTap.t < 320) { lastTap = { id: null, t: 0 }; openDetail({ itemId: n.it.id }, n.el); }
          else { lastTap = { id: g.node, t: now }; buzz(6); select(sel === g.node && n.kind !== 'title' ? null : g.node); }
        } else {
          if (lastTap.id === '_bg' && now - lastTap.t < 320) { lastTap = { id: null, t: 0 }; const r = el.getBoundingClientRect(); zoomAt(1.6, e.clientX - r.left, e.clientY - r.top, true); }
          else { lastTap = { id: '_bg', t: now }; select(null); }
        }
      }
      g = null;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', e => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || !e.shiftKey) zoomAt(Math.exp(-e.deltaY * 0.0018), e.clientX - r.left, e.clientY - r.top, false);
      else { view.x -= e.deltaX; view.y -= e.deltaY; applyView(false); saveView(); }
    }, { passive: false });
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-mact]');
      if (!b) return;
      const a = b.dataset.mact, n = sel && byId[sel];
      if (a === 'inc' && n) { incEpisode(n.it.id, b); }
      else if (a === 'open' && n) openDetail({ itemId: n.it.id }, n.el);
      else if (a === 'menu' && n && window.openPeek) openPeek({ itemId: n.it.id });
      else if (a === 'collapse' && n) { const c = cfg(); if (c.collapsed[n.id]) delete c.collapsed[n.id]; else c.collapsed[n.id] = 1; save(); refresh(false); buzz(10); }
      else if (a === 'unmove' && n) { delete cfg().offsets[n.id]; save(); refresh(false); buzz(10); }
      else if (a === 'custom') openCustom();
      else if (a === 'fit') fit(true);
      else if (a === 'zin') zoomAt(1.3, host.clientWidth / 2, host.clientHeight / 2, true);
      else if (a === 'zout') zoomAt(1 / 1.3, host.clientWidth / 2, host.clientHeight / 2, true);
      else if (a === 'rot') rotateBy(90, true);
      else if (a === 'full') toggleFull();
    });
  }
  let relayT = null;
  function relayoutSoon() { clearTimeout(relayT); relayT = setTimeout(() => refresh(false), 200); }

  /* ---------- Полный экран ---------- */
  function toggleFull() {
    if (full) { back(); return; }
    full = true;
    document.body.classList.add('map-full', 'locked');
    pushOverlay('map');
    setTimeout(() => { sizeHost(); fit(true); }, 30);
  }
  function exitFull() {
    full = false;
    document.body.classList.remove('map-full');
    if (!ui.detailStack.length && !document.getElementById('sheetWrap')) document.body.classList.remove('locked');
    setTimeout(() => { sizeHost(); fit(true); }, 30);
  }
  function sizeHost() {
    if (!host || !host.isConnected) return;
    if (full) { host.style.height = ''; return; }
    const top = host.getBoundingClientRect().top + window.scrollY;
    const bar = document.querySelector('.tabbar');
    const h = window.innerHeight - top - (bar ? bar.offsetHeight : 66) - 12;
    host.style.height = Math.max(380, h) + 'px';
  }

  /* ---------- Монтирование ---------- */
  function mount(el, opt) {
    opt = opt || {};
    host = el;
    const c = cfg();
    host.className = `map-view bleed bg-${c.bg}${c.bgMode === 'live' ? ' bg-live' : ''}${c.flow !== 'none' ? ' flow-' + c.flow : ''}${c.upright ? ' upright' : ''}`;
    host.style.setProperty('--mf', (c.font / 100).toFixed(2));
    const coverItem = Object.values(state.items).filter(i => i.status === 'watching' && (i.banner || i.coverXL || i.cover)).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    host.innerHTML = `<div class="map-bgfx"${c.bg === 'cover' && coverItem ? ` style="background-image:url('${esc(coverItem.banner || coverItem.coverXL || coverItem.cover)}')"` : ''}>${c.bgMode === 'live' ? '<i class="fx1"></i><i class="fx2"></i><i class="fx3"></i>' : ''}</div>
      <div class="map-world"><svg class="map-edges" width="1" height="1" aria-hidden="true"></svg><div class="map-nodes"></div></div>
      <div class="map-bubble" hidden></div>
      <div class="map-tools map-tools-r">
        <button type="button" class="map-tool" data-mact="custom" aria-label="Оформление"><svg class="ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><circle cx="8.5" cy="10" r="1.3" fill="currentColor"/><circle cx="12" cy="7.5" r="1.3" fill="currentColor"/><circle cx="15.5" cy="10" r="1.3" fill="currentColor"/><path d="M12 20.5c-1.5 0-2-1-2-2s1-2 2.5-2h1.5"/></svg></button>
        <button type="button" class="map-tool" data-mact="rot" aria-label="Повернуть на 90°"><svg class="ico" viewBox="0 0 24 24"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4v4.5H15"/></svg></button>
        <button type="button" class="map-tool" data-mact="fit" aria-label="Показать всё"><svg class="ico" viewBox="0 0 24 24"><path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/><circle cx="12" cy="12" r="2.5"/></svg></button>
        <button type="button" class="map-tool" data-mact="full" aria-label="${full ? 'Свернуть' : 'На весь экран'}">${full ? '<svg class="ico" viewBox="0 0 24 24"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>' : '<svg class="ico" viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>'}</button>
      </div>
      <div class="map-tools map-tools-l">
        <button type="button" class="map-tool" data-mact="zin" aria-label="Приблизить">${ICON.plus}</button>
        <button type="button" class="map-tool" data-mact="zout" aria-label="Отдалить"><svg class="ico" viewBox="0 0 24 24"><path d="M5 12h14"/></svg></button>
      </div>`;
    world = host.querySelector('.map-world');
    svg = host.querySelector('.map-edges');
    layer = host.querySelector('.map-nodes');
    bubble = host.querySelector('.map-bubble');
    if (!host._bound) { host._bound = true; bind(host); }
    sizeHost();
    if (!host.offsetWidth) return;
    tree = buildTree(c);
    const order = [];
    (function walk(n, d) { n.depth = d; order.push(n); n.children.forEach(ch => walk(ch, d + 1)); })(tree, 0);
    layer.innerHTML = order.map((n, k) => nodeHTML(n, c, k)).join('');
    order.forEach(n => { n.el = layer.querySelector(`[data-node="${CSS.escape(n.id)}"]`); });
    layout(c);
    placeNodes();
    drawEdges(c);
    if (c.view && !opt.refit) { view = { ...c.view }; applyView(false); }
    else { view.r = c.rotate || 0; fit(false); }
    if (opt.animate && c.appear && !RM) {
      host.classList.add('appear');
      setTimeout(() => host && host.classList.remove('appear'), 2200);
    }
    if (sel && byId[sel]) select(sel); else sel = null;
  }
  function refresh(animate, refit) {
    if (host && host.isConnected) mount(host, { animate, refit });
  }
  window.addEventListener('resize', () => { if (host && host.isConnected) { sizeHost(); positionBubble(); } });

  /* ---------- Панель «Оформление» ---------- */
  const OPT = {
    layout: [['right', 'Вправо'], ['left', 'Влево'], ['both', 'В обе стороны'], ['down', 'Вниз'], ['radial', 'Кругом']],
    group: [['none', 'Без групп'], ['status', 'По статусу'], ['day', 'По дням плана'], ['genre', 'По жанрам']],
    node: [['line', 'Текст на линии'], ['pill', 'Плашки'], ['cover', 'С обложками']],
    edge: [['curve', 'Плавные'], ['straight', 'Прямые'], ['elbow', 'Углом']],
    color: [['status', 'По статусу'], ['rainbow', 'Радуга'], ['cover', 'Цвет обложки'], ['solid', 'Один цвет']],
    bg: [['plain', 'Чистый'], ['dots', 'Точки'], ['grid', 'Клетка'], ['gradient', 'Градиент'], ['stars', 'Звёзды'], ['aurora', 'Сияние'], ['cover', 'Обложка']],
    flow: [['none', 'Нет'], ['flow', 'Поток'], ['glow', 'Дыхание'], ['sparks', 'Искры'], ['neon', 'Неон']],
    bgMode: [['still', 'Неподвижный'], ['live', 'Живой']],
    show: [['all', 'Все'], ['active', 'Только текущие']]
  };
  function chips(key, c) {
    return `<div class="mc-chips" role="group">${OPT[key].map(([v, l]) => `<button type="button" class="mc-chip${c[key] === v ? ' on' : ''}" data-mset="${key}" data-v="${v}" aria-pressed="${c[key] === v}">${key === 'bg' ? `<i class="mc-bg bg-${v}"></i>` : ''}${l}</button>`).join('')}</div>`;
  }
  function customHTML() {
    const c = cfg();
    const sw = (k, label, hint) => `<div class="mc-row"><div class="txt"><span>${label}</span>${hint ? `<small>${hint}</small>` : ''}</div><label class="switch"><input type="checkbox" data-mtog="${k}" ${c[k] ? 'checked' : ''} aria-label="${label}"><span></span></label></div>`;
    return `<div class="grab"></div>
      <div class="mc-head"><h2>Оформление карты</h2><button class="btn small" type="button" data-mset="_done">Готово</button></div>
      <div class="mc-sec"><span class="label">Раскладка</span>${chips('layout', c)}</div>
      <div class="mc-sec"><span class="label">Группы</span>${chips('group', c)}</div>
      <div class="mc-sec"><span class="label">Узлы</span>${chips('node', c)}</div>
      <div class="mc-sec"><span class="label">Линии</span>${chips('edge', c)}
        <div class="mc-range"><span>Толщина</span><input type="range" min="1" max="6" step="0.5" value="${c.width}" data-mrange="width" aria-label="Толщина линий"><b class="mono">${c.width}</b></div></div>
      <div class="mc-sec"><span class="label">Цвета</span>${chips('color', c)}
        <div class="mc-sw${c.color === 'solid' ? '' : ' dim'}">${SWATCHES.map(s => `<button type="button" class="mc-dot${c.solid === s ? ' on' : ''}" style="--c:${s}" data-mset="solid" data-v="${s}" aria-label="Цвет ${s}"></button>`).join('')}
          <label class="mc-dot custom" aria-label="Свой цвет"><input type="color" value="${esc(c.solid)}" data-mcolor="1"></label></div></div>
      <div class="mc-sec"><span class="label">Фон</span>${chips('bg', c)}${chips('bgMode', c)}</div>
      <div class="mc-sec"><span class="label">Анимации</span>
        ${sw('appear', 'Появление веток', 'Ветки прорисовываются при открытии')}
        <div class="mc-row"><div class="txt"><span>Движение линий</span></div></div>${chips('flow', c)}</div>
      <div class="mc-sec"><span class="label">Поворот</span>
        <div class="mc-range"><span>Угол</span><input type="range" min="-180" max="180" step="1" value="${Math.round(((view.r % 360) + 540) % 360 - 180)}" data-mrange="rotate" aria-label="Угол поворота"><b class="mono">${Math.round(((view.r % 360) + 540) % 360 - 180)}°</b></div>
        ${sw('rotateGesture', 'Поворот двумя пальцами', 'Крути карту, как фото')}
        ${sw('upright', 'Текст всегда ровно', 'Надписи не наклоняются при повороте')}</div>
      <div class="mc-sec"><span class="label">Текст</span>
        <div class="mc-range"><span>Размер</span><input type="range" min="70" max="160" step="5" value="${c.font}" data-mrange="font" aria-label="Размер текста"><b class="mono">${c.font}%</b></div>
        <label class="mc-field"><span>Надпись в центре</span><input class="input" type="text" maxlength="40" value="${esc(c.root)}" data-mroot="1" placeholder="Мой список"></label></div>
      <div class="mc-sec"><span class="label">Что показывать</span>${chips('show', c)}</div>
      <div class="mc-actions">
        <button class="btn line" type="button" data-mset="_unmove">Вернуть узлы на места</button>
        <button class="btn danger" type="button" data-mset="_reset">Сбросить оформление</button>
      </div>`;
  }
  function openCustom() {
    openSheet(customHTML());
    const sh = document.querySelector('#sheetWrap .sheet');
    if (sh) { sh.classList.add('map-sheet'); document.getElementById('sheetWrap').classList.add('light-scrim'); }
  }
  function rerenderCustom() {
    const sh = document.querySelector('#sheetWrap .sheet.map-sheet');
    if (!sh) return;
    const st = sh.scrollTop;
    sh.innerHTML = customHTML();
    sh.scrollTop = st;
  }
  const STRUCT = new Set(['layout', 'group', 'node', 'show']);
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-mset]');
    if (!b) return;
    const k = b.dataset.mset, v = b.dataset.v, c = cfg();
    if (k === '_done') { back(); return; }
    if (k === '_unmove') { c.offsets = {}; save(); refresh(false); rerenderCustom(); toast('Узлы вернулись на места'); return; }
    if (k === '_reset') {
      const keep = { offsets: {}, collapsed: {} };
      state.settings.map = Object.assign({}, DEF, keep);
      save(); view.r = 0; sel = null; refresh(true, true); rerenderCustom(); toast('Оформление сброшено'); return;
    }
    if (k === 'solid') { c.solid = v; c.color = 'solid'; }
    else c[k] = v;
    buzz(8); save();
    refresh(k === 'layout' || k === 'group' || k === 'node' || k === 'edge', STRUCT.has(k));
    rerenderCustom();
  });
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.mrange) {
      const k = t.dataset.mrange, c = cfg(), v = +t.value;
      const lab = t.parentElement.querySelector('b');
      if (k === 'rotate') { rotateBy(v - view.r, false); if (lab) lab.textContent = v + '°'; return; }
      c[k] = v; if (lab) lab.textContent = k === 'font' ? v + '%' : v;
      save();
      if (k === 'width') { flat.forEach(n => { const p = svg && svg.querySelector(`[data-e="${CSS.escape(n.id)}"]`); if (p) p.style.strokeWidth = (n.depth === 1 ? v * 1.4 : v).toFixed(2); }); }
      else relayoutSoon();
    } else if (t.dataset.mroot) {
      cfg().root = t.value; save();
      const r = host && host.querySelector('.mn-root .mn-in'); if (r) r.textContent = t.value || 'Мой список';
      relayoutSoon();
    } else if (t.dataset.mcolor) {
      const c = cfg(); c.solid = t.value; c.color = 'solid'; save(); relayoutSoon();
    }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.mtog) { cfg()[t.dataset.mtog] = t.checked; save(); buzz(8); refresh(t.dataset.mtog === 'appear' && t.checked); }
    else if (t.dataset.mcolor) rerenderCustom();
  });

  return { mount, refresh, exitFull, openCustom, isFull: () => full };
})();
