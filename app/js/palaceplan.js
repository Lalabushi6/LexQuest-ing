// Draws a memory palace as a floor plan (SVG): a house whose rooms follow the walking order, a door
// between each room and the next, a numbered marker for every locus, a dashed route through them, and a
// garden around the house. Works for any palace, the person's own included, since it only needs
// rooms and loci. No DOM or app state in here, so it can be tested on its own (test/palaceplan.test.js).
'use strict';
(function () {
  const xml = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const plain = s => String(s == null ? '' : s).replace(/\*\*|\*|`/g, '').replace(/\s+/g, ' ').trim();
  const cut = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
  const EMOJI = "'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif";
  const TEXT = "'Segoe UI',system-ui,-apple-system,sans-serif";
  // Floor finishes, in turn: wood, tile, stone, carpet…
  const FLOORS = ['#e9d3b0', '#d9e4e8', '#e6dccb', '#eadfd0', '#dfe6d3', '#efe0c8', '#e3d9e6', '#f0e6d2'];
  const PLANTS = ['🌴', '🌳', '🌿', '🌲', '🪴'];
  // Windows has no flag emoji (it shows two letters), so a flag icon becomes a plain flag.
  const icon = s => (/[\u{1F1E6}-\u{1F1FF}]/u.test(String(s || '')) ? '🚩' : (s || '🚪'));
  // A room name over at most two lines of the given width.
  function nameLines(name, perLine) {
    const words = name.split(' '), lines = [''];
    for (const w of words) {
      const cur = lines[lines.length - 1];
      if (!cur || (cur + ' ' + w).length <= perLine) lines[lines.length - 1] = cur ? cur + ' ' + w : w;
      else if (lines.length < 2) lines.push(w);
      else { lines[1] = cut(lines[1] + ' ' + w, perLine); }
    }
    return lines.map(l => cut(l, perLine));
  }

  // Rooms laid out in a snake (left to right, then right to left), so each room touches the next.
  // counts: loci per room. Each row of rooms is as tall as its fullest room needs.
  function layout(counts) {
    const nRooms = counts.length;
    const cols = nRooms <= 2 ? nRooms : nRooms <= 4 ? 2 : nRooms <= 9 ? 3 : 4;
    const rows = Math.ceil(nRooms / cols);
    const W = 1000, M = 56, cw = (W - 2 * M) / cols;
    const rowH = [], rowY = [];
    for (let r = 0, y = M; r < rows; r++) {
      const most = Math.max(1, ...counts.slice(r * cols, r * cols + cols));
      rowH.push(96 + Math.ceil(most / 3) * 78); rowY.push(y); y += rowH[r];
    }
    const at = i => { const r = Math.floor(i / cols), k = i % cols, c = r % 2 === 0 ? k : cols - 1 - k; return { x: M + c * cw, y: rowY[r], w: cw, h: rowH[r], r, c }; };
    const cells = [], empty = [];
    for (let i = 0; i < nRooms; i++) cells.push(at(i));
    for (let i = nRooms; i < rows * cols; i++) empty.push(at(i));
    return { W, H: 2 * M + rowH.reduce((a, b) => a + b, 0), M, cols, rows, cw, cells, empty };
  }

  // Marker positions inside a room: up to three a row, below the room's name.
  // On rows walked right to left, loci run right to left too, so the route doesn't double back.
  function spots(cell, n) {
    const perRow = Math.min(3, Math.max(1, n)), rtl = cell.r % 2 === 1;
    const out = [];
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / perRow), inRow = Math.min(perRow, n - row * perRow);
      const col = rtl ? inRow - 1 - (i % perRow) : i % perRow;
      const span = cell.w - 40, step = span / inRow;
      out.push({ x: cell.x + 20 + step * (col + 0.5) + (row % 2 ? step * 0.12 : 0), y: cell.y + 86 + row * 78 });
    }
    return out;
  }

  // The door between two neighbouring cells: a gap in their shared wall.
  function door(a, b) {
    if (a.r === b.r) { const x = Math.max(a.x, b.x), y = a.y + a.h / 2; return { x1: x, y1: y - 22, x2: x, y2: y + 22, mx: x, my: y }; }
    const y = Math.max(a.y, b.y), x = a.x + a.w / 2; return { x1: x - 22, y1: y, x2: x + 22, y2: y, mx: x, my: y };
  }

  // palace: { name, rooms: [{ name, icon, loci: [{ id, spot, mark }] }] }
  // opts.walks: { locusId: { ok } } colours the markers recalled (green) or missed (red).
  function planSvg(palace, opts = {}) {
    const rooms = (palace && palace.rooms ? palace.rooms : []).filter(r => r && Array.isArray(r.loci));
    if (!rooms.length) return '';
    const walks = opts.walks || {};
    const L = layout(rooms.map(r => r.loci.length));
    const parts = [], route = [], marks = [];
    let n = 0;
    rooms.forEach((room, i) => {
      const cell = L.cells[i];
      parts.push(`<rect x="${cell.x}" y="${cell.y}" width="${cell.w}" height="${cell.h}" fill="${FLOORS[i % FLOORS.length]}"/>`);
      parts.push(`<rect x="${cell.x + cell.w * 0.18}" y="${cell.y + 58}" width="${cell.w * 0.64}" height="${cell.h - 80}" rx="14" fill="#fff" opacity="0.28" stroke="#5b3a29" stroke-opacity="0.18" stroke-width="2" stroke-dasharray="6 6"/>`);
      parts.push(`<text x="${cell.x + 16}" y="${cell.y + 27}" font-family="${EMOJI}" font-size="22" dominant-baseline="central">${xml(icon(room.icon))}</text>`);
      const nl = nameLines(plain(room.name).toUpperCase(), Math.max(10, Math.floor((cell.w - 62) / 9.2)));
      nl.forEach((line, k) => parts.push(`<text x="${cell.x + 46}" y="${cell.y + (nl.length === 1 ? 27 : 19 + k * 18)}" font-family="${TEXT}" font-size="15" font-weight="800" fill="#4a3426" dominant-baseline="central" letter-spacing="0.4">${xml(line)}</text>`));
      const at = spots(cell, room.loci.length);
      room.loci.forEach((l, j) => {
        n += 1;
        const p = at[j], w = walks[l.id];
        if (i > 0 && j === 0) { const d = door(L.cells[i - 1], cell); route.push([d.mx, d.my]); }
        route.push([p.x, p.y]);
        const fill = w ? (w.ok ? '#2f9e5b' : '#c8463d') : '#7a4b2a';
        const spot = cut(plain(l.spot), Math.max(9, Math.floor((L.cw - 40) / Math.min(3, room.loci.length) / 6.6)));
        marks.push(`<g><title>${xml(`${n}. ${plain(l.spot)}`)}</title>
  ${l.mark ? `<text x="${p.x}" y="${p.y - 2}" font-family="${EMOJI}" font-size="30" text-anchor="middle" dominant-baseline="central">${xml(l.mark)}</text>
  <circle cx="${p.x + 18}" cy="${p.y - 18}" r="11" fill="${fill}" stroke="#fff" stroke-width="2"/><text x="${p.x + 18}" y="${p.y - 17.5}" font-family="${TEXT}" font-size="11" font-weight="800" fill="#fff" text-anchor="middle" dominant-baseline="central">${n}</text>`
          : `<circle cx="${p.x}" cy="${p.y - 2}" r="16" fill="${fill}" stroke="#fff" stroke-width="2.5"/><text x="${p.x}" y="${p.y - 1.5}" font-family="${TEXT}" font-size="14" font-weight="800" fill="#fff" text-anchor="middle" dominant-baseline="central">${n}</text>`}
  <text x="${p.x}" y="${p.y + 28}" font-family="${TEXT}" font-size="11.5" font-weight="600" fill="#3b2a1e" text-anchor="middle">${xml(spot)}</text></g>`);
      });
    });
    // Walls: the outline of each room, then doors cut into shared walls and the front door.
    const walls = L.cells.slice(0, rooms.length).map(c => `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="none" stroke="#5b3a29" stroke-width="7"/>`);
    const doors = [];
    for (let i = 1; i < rooms.length; i++) { const d = door(L.cells[i - 1], L.cells[i]); doors.push(`<line x1="${d.x1}" y1="${d.y1}" x2="${d.x2}" y2="${d.y2}" stroke="${FLOORS[i % FLOORS.length]}" stroke-width="9"/>`); }
    const first = L.cells[0], front = { x: first.x, y: first.y + first.h / 2 };
    doors.push(`<line x1="${front.x}" y1="${front.y - 22}" x2="${front.x}" y2="${front.y + 22}" stroke="${FLOORS[0]}" stroke-width="9"/>`);
    route.unshift([front.x - 30, front.y]);
    // Garden and pool in any empty cells, plants along the edge.
    const garden = L.empty.map((c, i) => i === 0
      ? `<rect x="${c.x + 14}" y="${c.y + 14}" width="${c.w - 28}" height="${c.h - 28}" rx="12" fill="#cfe3c2"/><ellipse cx="${c.x + c.w / 2}" cy="${c.y + c.h / 2}" rx="${c.w * 0.32}" ry="${c.h * 0.26}" fill="#8fd0ea" stroke="#5aa9c9" stroke-width="4"/><text x="${c.x + c.w / 2}" y="${c.y + c.h / 2}" font-family="${TEXT}" font-size="14" font-weight="700" fill="#2c6c87" text-anchor="middle" dominant-baseline="central">POOL</text>`
      : `<rect x="${c.x + 14}" y="${c.y + 14}" width="${c.w - 28}" height="${c.h - 28}" rx="12" fill="#cfe3c2"/><text x="${c.x + c.w / 2}" y="${c.y + c.h / 2}" font-family="${EMOJI}" font-size="40" text-anchor="middle" dominant-baseline="central">🌳</text>`);
    const plants = [];
    const nTop = Math.max(4, Math.round(L.W / 140));
    for (let i = 0; i < nTop; i++) {
      const x = 40 + i * ((L.W - 80) / (nTop - 1));
      plants.push([x, 26], [x, L.H - 24]);
    }
    for (let y = 120; y < L.H - 90; y += 170) plants.push([22, y], [L.W - 22, y]);
    const plantSvg = plants.map(([x, y], i) => `<text x="${x}" y="${y}" font-family="${EMOJI}" font-size="26" text-anchor="middle" dominant-baseline="central" opacity="0.9">${PLANTS[i % PLANTS.length]}</text>`);
    const path = route.map(([x, y], i) => `${i ? 'L' : 'M'}${Math.round(x)} ${Math.round(y)}`).join(' ');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L.W} ${L.H}" class="palace-plan-svg" role="img" aria-label="${xml(`Floor plan of ${plain(palace.name || 'the palace')}: ${rooms.length} rooms, ${n} loci`)}">
  <defs><marker id="pp-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#c0563a"/></marker></defs>
  <rect width="${L.W}" height="${L.H}" rx="22" fill="#e8e1d2"/>
  <rect x="${L.M - 18}" y="${L.M - 18}" width="${L.W - 2 * L.M + 36}" height="${L.H - 2 * L.M + 36}" rx="16" fill="#d8ccb6"/>
  ${garden.join('\n  ')}
  ${parts.join('\n  ')}
  ${walls.join('\n  ')}
  ${doors.join('\n  ')}
  <path d="${path}" fill="none" stroke="#c0563a" stroke-width="3" stroke-dasharray="9 7" stroke-linecap="round" stroke-linejoin="round" marker-mid="url(#pp-arrow)" opacity="0.85"/>
  <text x="${front.x - 34}" y="${front.y - 30}" font-family="${TEXT}" font-size="13" font-weight="800" fill="#c0563a" text-anchor="middle">START</text>
  ${marks.join('\n  ')}
  ${plantSvg.join('\n  ')}
</svg>`;
  }

  const api = { planSvg, layout };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.LQ = window.LQ || {}; window.LQ.palacePlan = planSvg; }
})();
