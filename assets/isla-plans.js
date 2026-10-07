/* Isla — the buildings, as block plans. No three.js here, so plans can be counted and tested on their own.
   One block = one cell. y = 0 sits on the ground. +z faces the camera (front), +x is to the right.
   Each building's condition tells the truth about its project. */

export const PAL = {
  aqua: '#8fd3c8', salmon: '#f2a488', mango: '#f4c45a', lilac: '#c3b2e0', mint: '#b9e3b0', coral: '#ef7f6a', sky: '#9cc8ef',
  white: '#f4f1ea', cream: '#efe4cc', pink: '#f3b6c4',
  conc: '#c4c0b7', conc2: '#aeaaa1', slab: '#dcd8cf', ink: '#2a2933', tank: '#2f2f33', rust: '#7a4b35',
  wood: '#a77b4f', wood2: '#dcbc8c', zinc: '#a9adb3', tarp: '#2f6fd6', tarp2: '#3f80e6',
  brick: '#a5563a', brick2: '#8b4430', brick3: '#bf6e4f', stucco: '#e3d6bd',
  leaf: '#4f8a3c', leaf2: '#6aa84f', cane: '#9bbf4a', cane2: '#c2c95a', flam: '#e8452c', flam2: '#ff6a2b', trunk: '#6b4a33',
  grass: '#93ad6b', grass2: '#7f9c5c', retain: '#cfc9bd', steel: '#5d6470', alu: '#dfe3e8', alu2: '#c6ccd4', print: '#2b4fb3', red: '#d23f31', green: '#2e8b57',
};

export function rng(seed) { let s = seed % 2147483647 || 7; return () => (s = (s * 16807) % 2147483647, (s - 1) / 2147483646); }

function builder(seed) {
  const r = rng(seed), solid = [], ghost = [], glow = [], poles = [], key = new Set();
  let tag = null;   // what the blocks being laid are (benito, flamboyan, plena...), so pointing at one can explain it
  const setTag = t => { const was = tag; tag = t; return was; };
  const put = (x, y, z, c, part = 'wall', extra) => {
    x = Math.round(x); y = Math.round(y); z = Math.round(z);
    const k = x + ',' + y + ',' + z; if (key.has(k)) return; key.add(k);
    solid.push(Object.assign({ x, y, z, c, part }, tag ? { tag } : null, extra || {}));
  };
  const gh = (x, y, z) => { if ((x + y + z) & 1 || (y % 2 && (x % 3 || z % 3))) return; ghost.push({ x, y, z }); };
  const box = (x0, x1, y0, y1, z0, z1, c, part, keep) => {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++)
      if (!keep || keep(x, y, z)) put(x, y, z, typeof c === 'function' ? c(x, y, z) : c, part);
  };
  const shell = (x0, x1, y0, y1, z0, z1, c, part, keep) =>
    box(x0, x1, y0, y1, z0, z1, c, part, (x, y, z) => (x === x0 || x === x1 || z === z0 || z === z1) && (!keep || keep(x, y, z)));
  const pole = (a, b, w, c) => poles.push({ a, b, w: w || 0.22, c });
  const pick = arr => arr[Math.floor(r() * arr.length)];
  const fall = (x, z, y, c) => put(x, y, z, c, 'fallen', { rot: [r() * 0.9, r() * 6.28, r() * 0.9] });
  const sparks = (n, rx, rz, y0, span, small) => {
    for (let i = 0; i < n; i++) glow.push({ x: (r() - 0.5) * 2 * rx, z: (r() - 0.5) * 2 * rz, y0, span, ph: r(), sp: 0.35 + r() * 0.8, s: small ? 0.14 + r() * 0.24 : 0.3 + r() * 0.4 });
  };
  // fine(res): a put/box in cells 1/res of a block, for things smaller than a block (people, drums, flags)
  const fine = res => { const s = 1 / res;
    const fp = (x, y, z, c, part = 'fig') => { x = Math.round(x); y = Math.round(y); z = Math.round(z);
      const k = 'f' + res + ':' + x + ',' + y + ',' + z; if (key.has(k)) return; key.add(k); solid.push(Object.assign({ x: x * s, y: y * s, z: z * s, c, part, s }, tag ? { tag } : null)); };
    const fb = (x0, x1, y0, y1, z0, z1, c, part, keep) => {   // either corner may come first (a left leg is drawn right to left)
      if (x0 > x1) [x0, x1] = [x1, x0]; if (y0 > y1) [y0, y1] = [y1, y0]; if (z0 > z1) [z0, z1] = [z1, z0];
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++)
      if (!keep || keep(x, y, z)) fp(x, y, z, typeof c === 'function' ? c(x, y, z) : c, part); };
    return { put: fp, box: fb, res, r }; };
  return { r, solid, ghost, glow, poles, put, gh, box, shell, pole, pick, fall, sparks, fine, setTag };
}

/* ---------- pieces of everyday Puerto Rico ---------- */

// a concrete house: slab, painted block walls, windows with rejas, flat roof, parapet, maybe a water tank and a carport
function casa(K, o) {
  const { x: x0, z: z0, y: y0, w, d, h } = o, x1 = x0 + w - 1, z1 = z0 + d - 1, top = y0 + h, mid = Math.floor(w / 2);
  K.box(x0, x1, y0, y0, z0, z1, PAL.slab, 'base');
  for (let x = x0; x <= x1; x++) for (let y = y0 + 1; y < top; y++) for (let z = z0; z <= z1; z++) {
    if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue;
    const front = z === z1 || z === z0, along = front ? x - x0 : z - z0, len = front ? w : d;
    if (z === z1 && Math.abs(along - mid) <= 1 && y <= y0 + 5) { K.put(x, y, z, o.door || PAL.wood, 'door'); continue; }
    const winY = y >= y0 + 3 && y <= y0 + 5, winX = along >= 2 && along <= len - 3 && (along - 2) % 5 < 3 && Math.abs(along - mid) > 2;
    if (winY && winX) { if (o.boarded) K.put(x, y, z, (y & 1) ? PAL.wood : PAL.wood2, 'board'); else if ((along + y) % 2 === 0) K.put(x, y, z, PAL.ink, 'reja'); continue; }
    if (o.damage && o.damage(x, y, z)) continue;
    K.put(x, y, z, y === y0 + 1 ? (o.trim || PAL.conc2) : typeof o.wall === 'function' ? o.wall(x, y, z) : o.wall, 'wall');
  }
  if (o.flatRoof !== false) {
    K.box(x0 - 1, x1 + 1, top, top, z0 - 1, z1 + 1, PAL.slab, 'roof');
    if (o.parapet !== false) K.box(x0 - 1, x1 + 1, top + 1, top + 1, z0 - 1, z1 + 1, o.wall2 || (typeof o.wall === 'string' ? o.wall : PAL.white), 'roof',
      (x, y, z) => (x === x0 - 1 || x === x1 + 1 || z === z0 - 1 || z === z1 + 1) && (z !== z1 + 1 || (x + y) % 2 === 0 || !o.calado));
  }
  if (o.tank) tanque(K, x1 - 2, top + 1, z0 + 2, o.tankColor || PAL.tank);
  if (o.marq) {   // marquesina: carport roof on two posts, a calado wall at its end
    const mx = x1 + 7;
    K.box(x1 + 1, mx, top, top, z0 + 1, z1 + 2, PAL.slab, 'roof');
    for (const zz of [z0 + 1, z1 + 2]) K.box(mx, mx, y0 + 1, top - 1, zz, zz, PAL.white, 'col');
    K.box(mx, mx, y0, y0 + 3, z0 + 2, z1 + 1, PAL.white, 'wall', (x, y, z) => y === y0 || (y + z) % 2 === 0);
    K.box(x1 + 1, mx, y0, y0, z0 + 1, z1 + 2, PAL.conc2, 'base');
  }
  return top;
}
function tanque(K, cx, y0, cz, c) {   // the water tank on every roof
  K.box(cx - 1, cx + 1, y0, y0, cz - 1, cz + 1, PAL.conc2, 'roof');
  for (let y = y0 + 1; y <= y0 + 3; y++) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) K.put(cx + dx, y, cz + dz, c, 'tank');
}
export function flamboyan(K, x, z, y0, h = 6, rad = 5) {
  const was = K.setTag('flamboyan');
  K.box(x, x, y0, y0 + h, z, z, PAL.trunk, 'trunk');
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) K.put(x + dx * 2, y0 + h - 1, z + dz * 2, PAL.trunk, 'trunk');
  for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
    const q = dx * dx + dz * dz; if (q > rad * rad + 1) continue;
    const c = () => { const t = K.r(); return t < 0.18 ? PAL.leaf2 : t < 0.6 ? PAL.flam : PAL.flam2; };
    K.put(x + dx, y0 + h, z + dz, c(), 'leaf'); if (q <= (rad - 2) * (rad - 2)) K.put(x + dx, y0 + h + 1, z + dz, c(), 'leaf');
  }
  K.setTag(was);
}
export function palma(K, x, z, y0, h = 9, lean = 1) {
  let tx = x; for (let y = 0; y < h; y++) { tx = x + Math.round(lean * (y / h) ** 2 * 3); K.put(tx, y0 + y, z, y % 3 ? PAL.trunk : '#857055', 'trunk'); }
  const top = y0 + h;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]])
    for (let i = 1; i <= 4; i++) K.put(tx + dx * i, top - (i > 2 ? i - 2 : 0), z + dz * i, i % 2 ? PAL.leaf : PAL.leaf2, 'leaf');
  K.put(tx, top, z, PAL.leaf, 'leaf'); K.put(tx, top - 1, z + 1, '#6b4f2a', 'leaf');
}
function poste(K, x, z, y0, h) { K.pole([x, y0, z], [x, y0 + h, z], 0.32, '#5a4636'); K.pole([x - 1.2, y0 + h - 1, z], [x + 1.2, y0 + h - 1, z], 0.2, '#5a4636'); return [x, y0 + h - 1, z]; }
function cable(K, a, b, sag = 1.2) {   // two straight pieces make a sag
  const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - sag, (a[2] + b[2]) / 2];
  K.pole(a, m, 0.07, '#1d1c22'); K.pole(m, b, 0.07, '#1d1c22');
}

/* ---------- the seven buildings ---------- */

// CareerOS: a hillside barrio, terraces of concrete houses. Complete, running: sparks rise.
function barrio(K, target) {
  const X0 = -30, X1 = 30, tiers = [{ z0: 4, z1: 20, top: 0 }, { z0: -8, z1: 3, top: 6 }, { z0: -21, z1: -9, top: 12 }];
  for (const t of tiers.slice(1)) {
    K.box(X0, X1, t.top - 1, t.top - 1, t.z0, t.z1, (x, y, z) => (K.r() < 0.12 ? PAL.grass2 : PAL.grass), 'terrace');
    K.box(X0, X1, 0, t.top - 2, t.z1, t.z1, PAL.retain, 'terrace', (x, y) => y >= t.top - 7);
    for (const x of [X0, X1]) K.box(x, x, 0, t.top - 2, t.z0, t.z1, PAL.retain, 'terrace');
  }
  K.box(X0, X1, 0, 10, -21, -21, PAL.retain, 'terrace', (x, y, z) => (x + y) % 3 !== 0);
  // concrete steps up the middle
  for (let i = 0; i < 6; i++) K.box(-2, 0, 0, i, 9 - i, 9 - i, PAL.conc2, 'step');
  for (let i = 0; i < 6; i++) K.box(-2, 0, 6, 6 + i, -3 - i, -3 - i, PAL.conc2, 'step');
  const colors = [PAL.aqua, PAL.salmon, PAL.mango, PAL.lilac, PAL.mint, PAL.coral, PAL.sky, PAL.pink, PAL.cream, PAL.white, PAL.aqua, PAL.salmon];
  const homes = [
    { x: -29, z: 8, y: 0, w: 11, d: 9, h: 9, tank: true }, { x: -15, z: 9, y: 0, w: 10, d: 8, h: 9, marq: true }, { x: 6, z: 7, y: 0, w: 12, d: 10, h: 10, calado: true, tank: true }, { x: 21, z: 9, y: 0, w: 9, d: 8, h: 8 },
    { x: -29, z: -7, y: 6, w: 10, d: 9, h: 9, tank: true }, { x: -16, z: -6, y: 6, w: 11, d: 8, h: 8, calado: true }, { x: 3, z: -7, y: 6, w: 10, d: 9, h: 10, tank: true }, { x: 16, z: -6, y: 6, w: 13, d: 8, h: 9 },
    { x: -28, z: -20, y: 12, w: 12, d: 9, h: 9, tank: true }, { x: -12, z: -19, y: 12, w: 9, d: 8, h: 8 }, { x: 3, z: -20, y: 12, w: 11, d: 9, h: 10, calado: true, tank: true, tankColor: PAL.white }, { x: 18, z: -19, y: 12, w: 10, d: 8, h: 8 },
  ];
  homes.forEach((o, i) => casa(K, Object.assign({ wall: colors[i], trim: PAL.conc2, wall2: PAL.white }, o)));
  flamboyan(K, -4, 16, 0, 7, 5); palma(K, 28, 18, 0, 10, -1); palma(K, -30, 2, 6, 8, 1);
  const p1 = poste(K, -22, 21, 0, 15), p2 = poste(K, -4, 21, 0, 15), p3 = poste(K, 16, 21, 0, 15);
  cable(K, p1, p2); cable(K, p2, p3); cable(K, p1, [-24, 10, 13], 0.6); cable(K, p3, [17, 11, 12], 0.6); cable(K, p2, [-1, 15, 0], 0.8);
  const n = target - K.solid.length; if (n < 0) throw new Error('barrio has ' + K.solid.length + ' blocks, over its ' + target);
  K.sparks(n, 30, 21, 24, 26, true);
}

// Food Pantry: a colmado on the corner. Complete, live.
function colmado(K) {
  K.box(-15, 15, 0, 0, -9, 12, PAL.slab, 'base');
  const x0 = -11, x1 = 10, z0 = -8, z1 = 4, top = 10;
  for (let x = x0; x <= x1; x++) for (let y = 1; y < top; y++) for (let z = z0; z <= z1; z++) {
    if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue;
    if (z === z1) {
      if (x >= -7 && x <= 5 && y <= 6) { if (y >= 5) K.put(x, y, z, y === 5 ? PAL.zinc : PAL.steel, 'gate'); continue; }   // roll-up gate, half up
      if (y >= 7 && y <= 9) { const letter = y === 8 ? K.r() < 0.55 : K.r() < 0.18; K.put(x, y, z, letter && x > x0 && x < x1 ? PAL.red : PAL.white, 'sign'); continue; }
    }
    K.put(x, y, z, y <= 2 ? PAL.green : PAL.mango, 'wall');
  }
  for (let x = -6; x <= 4; x++) for (let y = 2; y <= 6; y++) if (K.r() < 0.75) K.put(x, y, z0 + 1, K.pick([PAL.red, PAL.mango, PAL.leaf2, PAL.sky, PAL.white, PAL.coral]), 'shelf');
  K.box(x0 - 1, x1 + 1, top, top, z0 - 1, z1 + 1, PAL.slab, 'roof');
  K.box(x0 - 1, x1 + 1, top + 1, top + 1, z0 - 1, z1 + 1, PAL.mango, 'roof', (x, y, z) => x === x0 - 1 || x === x1 + 1 || z === z0 - 1 || z === z1 + 1);
  tanque(K, x0 + 3, top + 1, z0 + 3, PAL.tank);
  K.box(-8, 6, 7, 7, 5, 7, (x) => (x & 1 ? PAL.red : PAL.white), 'awning');
  for (const [cx, c] of [[-9, PAL.leaf2], [-6, PAL.mango], [3, PAL.flam2], [6, PAL.red]]) { K.box(cx, cx + 1, 1, 1, 6, 7, PAL.wood, 'crate'); K.box(cx, cx + 1, 2, 2, 6, 7, c, 'fruit'); }
  K.box(9, 13, 1, 1, 9, 9, PAL.wood, 'bench'); K.box(9, 9, 1, 1, 9, 9, PAL.wood, 'bench');
  flamboyan(K, 13, -3, 1, 7, 5);
  K.sparks(140, 12, 9, 14, 26, false);
}

// XPT OS: the chimney of an old sugar mill, its mill house fallen, cane growing around. Dormant.
function central(K) {
  const brick = () => { const t = K.r(); return t < 0.4 ? PAL.brick : t < 0.75 ? PAL.brick2 : PAL.brick3; };
  K.box(7, 13, 0, 4, -7, -1, brick, 'chimney', (x, y, z) => x === 7 || x === 13 || z === -7 || z === -1 || y === 0);
  for (let y = 5; y <= 34; y++) { const hw = y < 16 ? 3 : y < 26 ? 2 : 1;
    for (let x = 10 - hw; x <= 10 + hw; x++) for (let z = -4 - hw; z <= -4 + hw; z++) {
      if (x !== 10 - hw && x !== 10 + hw && z !== -4 - hw && z !== -4 + hw) continue;
      if (y > 31 && K.r() < 0.45) continue; K.put(x, y, z, brick(), 'chimney'); } }
  const hgt = x => 3 + Math.round(Math.abs(Math.sin(x * 0.7) * 6 + Math.sin(x * 0.23) * 4));
  for (let x = -18; x <= 4; x++) for (let z = -9; z <= 6; z++) {
    if (x !== -18 && x !== 4 && z !== -9 && z !== 6) continue;
    const h = hgt(x * 3 + z * 7), along = (z === -9 || z === 6) ? x + 18 : z + 9;
    for (let y = 0; y <= h; y++) {
      if (y >= 1 && y <= 6 && along % 5 >= 2 && along % 5 <= 3 && !(y === 6 && along % 5 === 2)) continue;   // arched openings
      K.put(x, y, z, K.r() < 0.55 ? brick() : PAL.stucco, 'ruin'); }
    if (K.r() < 0.25) K.put(x, h + 1, z, PAL.leaf2, 'overgrowth');
  }
  for (let i = 0; i < 240; i++) K.fall(-20 + K.r() * 27, -11 + K.r() * 20, K.r() < 0.8 ? 0 : 1, K.r() < 0.6 ? brick() : PAL.stucco);
  for (let x = -27; x <= 27; x += 2) for (const [za, zb] of [[10, 20], [-21, -13]]) for (let z = za; z <= zb; z += 2) {
    const h = 2 + Math.floor(K.r() * 4); for (let y = 0; y < h; y++) K.put(x, y, z, y === h - 1 ? PAL.cane2 : PAL.cane, 'cane'); }
}

// Web OS: a concrete house, rebar waiting on the roof for a second floor that has not come. v1, pivoted.
function construccion(K) {
  const top = casa(K, { x: -9, z: -6, y: 0, w: 18, d: 12, h: 9, wall: (x, y, z) => (z === 5 && x < -1 && y > 1 ? PAL.aqua : K.r() < 0.5 ? PAL.conc : PAL.conc2), parapet: false });
  for (const [cx, cz] of [[-9, -6], [0, -6], [8, -6], [-9, 5], [0, 5], [8, 5]]) for (const [ox, oz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]])
    K.pole([cx + ox, top + 0.5, cz + oz], [cx + ox, top + 9, cz + oz], 0.09, PAL.rust);
  K.box(-9, 8, top + 1, top + 3, -6, -6, () => (K.r() < 0.5 ? PAL.conc : PAL.conc2), 'wall2', (x, y) => y < top + 3 || x < 2);
  K.box(-9, -9, top + 1, top + 2, -5, 1, PAL.conc2, 'wall2');
  for (let x = -9; x <= 8; x++) for (let y = top + 1; y <= top + 9; y++) for (let z = -6; z <= 5; z++) if (x === -9 || x === 8 || z === -6 || z === 5 || y === top + 9) K.gh(x, y, z);
  K.box(2, 6, top + 1, top + 2, -2, 1, PAL.conc, 'pile', (x, y) => y === top + 1 || x < 5);
  K.box(11, 14, 0, 2, -4, -1, PAL.conc, 'pile', (x, y, z) => y < 2 || (x + z) % 2 === 0);
  K.box(11, 13, 0, 0, 2, 3, PAL.cream, 'bags'); K.box(11, 12, 1, 1, 2, 2, PAL.cream, 'bags');
  K.pole([4, 0, 8], [4.5, top, 6.2], 0.15, PAL.wood2); K.pole([6, 0, 8], [6.5, top, 6.2], 0.15, PAL.wood2);
  for (let i = 1; i < 9; i += 2) K.pole([4 + i * 0.055, i * 1.1, 8 - i * 0.2], [6 + i * 0.055, i * 1.1, 8 - i * 0.2], 0.1, PAL.wood2);
  palma(K, -14, 4, 0, 9, 1);
}

// ELiaS: a house after María. Blue tarp where the roof was, new rafters going up. Dormant; its fall wrote the rules.
function toldo(K) {
  const x0 = -8, x1 = 8, z0 = -6, z1 = 5, top = casa(K, { x: x0, z: z0, y: 0, w: 17, d: 12, h: 8, wall: (x, y) => (y > 3 ? PAL.cream : PAL.salmon), boarded: true, flatRoof: false,
    damage: (x, y, z) => x > 3 && y > 5 && (x + y * 3 + z) % 4 === 0 });
  const zc = (z0 + z1) / 2, half = (z1 - z0) / 2 + 1;
  for (let x = x0 - 1; x <= x1 + 1; x++) for (let z = z0 - 1; z <= z1 + 1; z++) {
    const y = top + Math.round((half - Math.abs(z - zc)) * 0.6);
    if (x <= x0 + 1) K.put(x, y, z, PAL.zinc, 'roof');
    else if (x <= x0 + 10) K.put(x, y - (Math.abs(z - zc) < 2 && x % 4 === 0 ? 1 : 0), z, (x + z) % 5 ? PAL.tarp : PAL.tarp2, 'tarp');
  }
  for (let x = x0 + 11; x <= x1 + 1; x += 3) { K.pole([x, top, z0 - 0.5], [x, top + half * 0.6, zc], 0.18, PAL.wood2); K.pole([x, top, z1 + 0.5], [x, top + half * 0.6, zc], 0.18, PAL.wood2); }
  K.pole([x0 + 11, top + half * 0.6, zc], [x1 + 1, top + half * 0.6, zc], 0.18, PAL.wood2);
  for (let i = 0; i < 90; i++) K.fall(-14 + K.r() * 30, -10 + K.r() * 22, 0, K.pick([PAL.zinc, PAL.zinc, PAL.wood, PAL.cream]));
  K.pole([12, 0, 9], [16, 14, 11.5], 0.32, '#5a4636'); K.pole([16, 13, 11.5], [9, 0.1, 15], 0.07, '#1d1c22');
  palma(K, -13, 7, 0, 9, -1);
}

// 2nd Brain: Arecibo. The dish still stands; the platform that hung over it fell in 2020. Knowledge live, agents down.
function arecibo(K) {
  const R = 20;
  for (let x = -R - 1; x <= R + 1; x++) for (let z = -R - 1; z <= R + 1; z++) {
    const d = Math.hypot(x, z); if (d > R + 1) continue;
    if (d > R - 0.6) { for (let y = 0; y <= 7; y++) K.put(x, y, z, y === 7 ? PAL.alu2 : PAL.conc, 'rim'); continue; }
    if (x % 2 && z % 2 && d < R - 2) continue;   // the mesh
    K.put(x, Math.round(6 * (d / R) ** 2), z, (x + z) % 3 ? PAL.alu : PAL.alu2, 'dish');
  }
  const tops = [];
  for (const a of [Math.PI / 2, Math.PI / 2 + 2.094, Math.PI / 2 + 4.189]) {
    const tx = Math.round(Math.cos(a) * (R + 5)), tz = Math.round(Math.sin(a) * (R + 5));
    K.box(tx - 1, tx + 1, 0, 34, tz - 1, tz + 1, (x, y) => (y % 6 === 0 ? PAL.conc2 : PAL.conc), 'tower');
    tops.push([tx, 34, tz]);
  }
  for (const t of tops) { const m = [t[0] * 0.55, 20, t[2] * 0.55]; K.pole(t, m, 0.1, PAL.steel); K.pole(m, [m[0] * 0.9, 3, m[2] * 0.9], 0.08, PAL.steel); }
  const tri = [[0, -7], [6, 4], [-6, 4]];
  for (let s = 0; s < 3; s++) { const [ax, az] = tri[s], [bx, bz] = tri[(s + 1) % 3];
    for (let i = 0; i <= 14; i++) { const t = i / 14; K.fall(ax + (bx - ax) * t, az + (bz - az) * t, 1 + Math.round(t * 2), PAL.steel); K.fall(ax + (bx - ax) * t + 0.6, az + (bz - az) * t, 2 + Math.round(t * 2), PAL.steel); } }
  for (let i = 0; i < 26; i++) { const a = -1.2 + i * 0.09; K.fall(Math.cos(a) * 9, Math.sin(a) * 9 + 2, 1 + (i % 3), PAL.steel); }
  K.sparks(160, R - 4, R - 4, 6, 26, false);
}

// Claude Cowork Skills: a beach kiosko in Rincón at sunset, open for business. A finished product, on sale in two languages.
// Palm-thatch roof, a painted counter window with seven packages on it (one per skill), stools, string lights, surfboards, palms.
function kiosko(K) {
  const F = K.fine(4), sand = () => (K.r() < 0.15 ? '#e2cfa9' : '#ead9bb');
  K.box(-15, 15, 0, 0, -11, 13, sand, 'sand');
  const x0 = -5, x1 = 5, z0 = -4, z1 = 2;
  for (let x = x0; x <= x1; x++) for (let y = 1; y <= 7; y++) for (let z = z0; z <= z1; z++) {
    if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue;
    if (z === z1 && x > x0 && x < x1 && y >= 4 && y <= 6) continue;   // the open counter window
    K.put(x, y, z, y <= 3 ? ((x + z) % 2 ? '#1f9e8f' : '#2fb5a5') : y === 7 ? '#f4c45a' : '#f2a488', 'wall');
  }
  K.box(x0 - 1, x1 + 1, 4, 4, z1 + 1, z1 + 1, '#a77b4f', 'counter');
  for (let x = x0 + 1; x <= x1 - 1; x++) for (let y = 4; y <= 6; y++) if (K.r() < 0.6) K.put(x, y, z0 + 1, K.pick(['#ef7f6a', '#f4c45a', '#8fd3c8', '#f4f1ea']), 'shelf');
  for (let x = x0; x <= x1; x++) K.put(x, 8, z1 + 1, x % 2 ? '#ff7a1a' : '#f4f1ea', 'sign');   // the hand-painted sign under the eave
  for (let x = x0 - 2; x <= x1 + 2; x++) for (let z = z0 - 2; z <= z1 + 3; z++) {   // palm-thatch roof, pitched, overhanging
    const y = 9 + Math.round((3.5 - Math.abs(z - (z0 + z1) / 2)) * 0.7); K.put(x, y, z, (x + z * 3) % 4 ? '#c9a25a' : '#b08a45', 'thatch');
    if ((z === z0 - 2 || z === z1 + 3) && K.r() < 0.5) K.put(x, y - 1, z, '#d8b56a', 'thatch'); }
  for (const [px, pz] of [[x0 - 2, z1 + 3], [x1 + 2, z1 + 3]]) K.pole([px + 0.5, 1, pz + 0.5], [px + 0.5, 9, pz + 0.5], 0.3, PAL.wood);
  // seven packages on the counter, one per skill
  ['#ff7a1a', '#2fb5a5', '#f4c45a', '#ef7f6a', '#3a3fc4', '#e8452c', '#8fd3c8'].forEach((c, i) => F.box(-22 + i * 6, -19 + i * 6, 20, 22, 12, 13, c, 'skill'));
  for (const sx of [-14, -2, 10]) { F.box(sx, sx + 3, 4, 13, 18, 18, '#3a2a1f', 'stool'); F.box(sx - 1, sx + 4, 14, 14, 16, 20, '#a77b4f', 'stool'); }   // stools
  // string lights from the roof to the palm
  for (let i = 0; i <= 14; i++) { const t = i / 14; F.put(-28 + t * -28, 36 - Math.sin(t * Math.PI) * 6, 14 + t * 18, i % 3 ? '#ffd98a' : '#ff9b4a', 'light'); }
  // surfboards leaning on the side wall: this is Rincón
  [['#ff7a1a', '#f4f1ea'], ['#2fb5a5', '#f4f1ea'], ['#f4f1ea', '#e8452c']].forEach(([c, st], i) => { const bz = -12 + i * 6;
    for (let y = 0; y < 24; y++) { const w = y < 2 || y > 21 ? 0 : 1; F.box(26, 26, 4 + y, 4 + y, bz - w, bz + w, y === 12 ? st : c, 'surf'); } });
  palma(K, -12, 7, 1, 13, 1); palma(K, 11, -6, 1, 10, -1); palma(K, 13, 8, 1, 8, -1);
  for (const [bx, bz] of [[-13, -8], [8, 10], [-6, 10]]) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (K.r() < 0.8) K.put(bx + dx, 1 + (dx === 0 && dz === 0 ? 1 : 0), bz + dz, K.r() < 0.5 ? '#4f8a3c' : '#6aa84f', 'uva');   // sea grape
  K.sparks(30, 10, 8, 12, 22, true);   // a few small sparks: live, but quiet
}

/* ---------- the island's culture: landmarks that are not projects ---------- */
// People, drums, masks and flags are built in fine cells, a quarter of a block (F = K.fine(4)), so they keep true size:
// a door is 5 blocks (2 m), a person 18 cells (4.5 blocks, about 1.75 m), a barril 7 cells (70 cm).

// a person, facing +z. y0 = feet. o: skin, shirt, pants, shoes, hair, armL/armR ('down' | 'forward' | 'out' | 'up' | 'hold'),
// seated (straddling something whose top is at y0 + 6), skirt, beard, shades, scarf. Returns where the hands are.
function gente(F, x, z, y0, o) {
  const B = F.box, P = F.put, sk = o.skin || '#8d5a36', sh = o.shirt || PAL.white, pa = o.pants || '#2e3a52', shoe = o.shoes || '#2a2420';
  if (o.seated) {   // astride: thighs over the top, shins down either side
    for (const s of [-1, 1]) { B(x + s * 3, x + s * 4, y0 + 1, y0 + 5, z, z + 1, pa, 'legs'); B(x + s * 2, x + s * 4, y0 + 6, y0 + 6, z - 1, z + 1, pa, 'legs'); B(x + s * 3, x + s * 4, y0, y0, z, z + 2, shoe, 'shoe'); }
  } else if (!o.skirt) {
    for (const s of [-1, 1]) { B(x + s * 1, x + s * 2, y0 + 1, y0 + 7, z - 1, z, pa, 'legs'); B(x + s * 1, x + s * 2, y0, y0, z - 1, z + 1, shoe, 'shoe'); }
  }
  const yb = o.seated ? y0 + 7 : y0 + 8, hands = {};
  // the face first: put() keeps the first color a cell gets
  const fy = yb + 6, fz = z + 1;
  if (o.shades) { B(x - 1, x + 1, fy + 2, fy + 2, fz + 1, fz + 1, '#121214', 'shades'); }
  P(x - 1, fy + 2, fz, '#1c1a1d', 'eye'); P(x + 1, fy + 2, fz, '#1c1a1d', 'eye');
  if (o.beard) { B(x - 1, x + 1, fy, fy, z - 1, fz, o.beard, 'beard'); P(x, fy + 1, fz, o.beard, 'beard'); }
  const hair = o.scarf || o.hair || '#1c1a1d';
  B(x - 1, x + 1, fy + 3, fy + 3, z - 1, fz, hair, 'hair'); B(x - 1, x + 1, fy + 1, fy + 2, z - 1, z - 1, hair, 'hair');
  if (o.scarf) { P(x, fy + 4, z - 1, o.scarf, 'hair'); P(x, fy + 3, z - 2, o.scarf, 'hair'); }
  B(x - 1, x + 1, fy, fy + 3, z - 1, fz, sk, 'head');
  // body
  B(x - 2, x + 2, yb, yb + 5, z - 1, z + 1, sh, 'body');
  for (const [s, kind] of [[-1, o.armL || o.arms || 'down'], [1, o.armR || o.arms || 'down']]) {
    const ax = x + s * 3, side = s < 0 ? 'L' : 'R';
    if (kind === 'down') { B(ax, ax, yb + 1, yb + 5, z, z, sh, 'arm'); P(ax, yb, z, sk, 'hand'); hands[side] = [ax, yb, z]; }
    else if (kind === 'forward') { B(ax, ax, yb + 3, yb + 5, z, z, sh, 'arm'); B(ax, ax, yb + 2, yb + 2, z, z + 3, sk, 'arm'); P(ax, yb + 2, z + 4, sk, 'hand'); hands[side] = [ax, yb + 2, z + 4]; }
    else if (kind === 'hold') { B(ax, ax, yb + 3, yb + 5, z, z, sh, 'arm'); B(ax, ax, yb + 3, yb + 3, z + 1, z + 2, sh, 'arm'); P(ax, yb + 3, z + 3, sk, 'hand'); hands[side] = [ax, yb + 3, z + 3]; }
    else if (kind === 'out') { for (let i = 0; i < 4; i++) P(ax + s * i, yb + 5 - i, z + (i > 1 ? 1 : 0), i < 2 ? sh : sk, 'arm'); hands[side] = [ax + s * 3, yb + 2, z + 1]; }
    else if (kind === 'up') { B(ax, ax, yb + 5, yb + 9, z, z, sh, 'arm'); P(ax, yb + 10, z, sk, 'hand'); hands[side] = [ax, yb + 10, z]; }
  }
  if (o.skirt) {   // a bomba skirt, wide and white, its hem held out in both hands as she turns
    for (let y = y0; y <= yb; y++) { const rr = 2.2 + (yb - y) * 0.62;
      for (let dx = -7; dx <= 7; dx++) for (let dz = -7; dz <= 7; dz++) { const q = Math.hypot(dx, dz * 1.15); if (q <= rr && q > rr - 1.3) P(x + dx, y, z + dz, (y === y0 + 1 && (dx + dz) % 2 === 0) ? o.skirtTrim || o.skirt : o.skirt, 'skirt'); } }
    for (const s of [-1, 1]) for (let i = 3; i <= 6; i++) for (let y = yb - 1; y <= yb + 2 - Math.floor((i - 3) / 2); y++) P(x + s * i, y, z + 1, o.skirt, 'skirt');
  }
  return hands;
}

// Parque de Bombas, Ponce (1882): a two-story wooden firehouse in red and black stripes, a lookout on the roof, a fountain in front
function bombas(K) {
  const X0 = -8, X1 = 8, Z0 = -5, Z1 = 5, F = K.fine(4);
  K.setTag('parque');
  K.box(-12, 12, 0, 0, -8, 15, '#d8d1c4', 'base');
  const stripe = a => (a % 2 ? '#1c1a1d' : '#c8102e');
  for (let x = X0; x <= X1; x++) for (let y = 1; y <= 11; y++) for (let z = Z0; z <= Z1; z++) {
    if (x !== X0 && x !== X1 && z !== Z0 && z !== Z1) continue;
    const along = (z === Z0 || z === Z1) ? x - X0 : z - Z0;
    if (z === Z1 && y <= 4) { const d = [-5, 0, 5].find(c => Math.abs(x - c) <= 1);   // three arched doors for the engines
      if (d !== undefined && (y <= 3 || x === d)) { K.put(x, y, z, '#3a2a1f', 'door'); continue; } }
    if (y >= 8 && y <= 9 && along % 3 === 1 && along > 0) { K.put(x, y, z, y === 9 && z === Z1 ? '#f4f1ea' : '#2e3f5a', 'window'); continue; }
    K.put(x, y, z, y === 6 || y === 11 ? '#f2d16b' : stripe(along), 'wall');
  }
  for (let x = X0; x <= X1; x++) { K.put(x, 6, Z1 + 1, '#f2d16b', 'balcony'); if (x % 2 === 0) K.put(x, 7, Z1 + 1, PAL.white, 'rail'); }
  for (let x = X0 - 1; x <= X1 + 1; x++) for (let z = Z0 - 1; z <= Z1 + 1; z++) {   // pitched roof, the stripes carried up into the gables
    const y = 12 + Math.round((Z1 + 1 - Math.abs(z)) * 0.5); K.put(x, y, z, (x - X0) % 2 ? '#1c1a1d' : '#9e0d24', 'roof');
    if (Math.abs(x) === X1 + 1) for (let yy = 12; yy < y; yy++) K.put(x, yy, z, stripe(z - Z0), 'gable'); }
  for (let y = 15; y <= 17; y++) for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) if (Math.abs(x) === 1 || Math.abs(z) === 1) K.put(x, y, z, y === 16 && (x === 0 || z === 0) ? '#2e3f5a' : stripe(x + 1), 'tower');
  K.box(-1, 1, 18, 18, -1, 1, '#1c1a1d', 'tower'); K.put(0, 19, 0, '#f2d16b', 'tower');
  for (let x = -3; x <= 3; x++) for (let z = 7; z <= 13; z++) { const d = Math.hypot(x, z - 10);   // the fountain
    if (d <= 3.2 && d > 2.2) K.put(x, 1, z, PAL.white, 'fountain'); else if (d <= 2.2) K.put(x, 1, z, '#5fb3e0', 'water'); }
  K.box(0, 0, 1, 3, 10, 10, PAL.white, 'fountain');
  for (const [px, pz] of [[-11, 6], [11, 6]]) palma(K, px, pz, 1, 10, px > 0 ? -1 : 1);
  camion(F, -20, 26, 4);   // an antique engine rolled out of the left door, like the ones the museum keeps
  K.setTag('vejigante');
  vejigante(F, 36, 40, 4, ['#f7c948', '#2e8b57', '#d62828']); vejigante(F, -40, 42, 4, ['#1d4ed8', '#f7f7f7', '#d62828']);   // at the plaza's front corners
}

// an antique fire engine, front toward +z: red body, spoked wheels, brass radiator, lamps and bell, a wooden ladder on top
function camion(F, cx, z0, y0) {
  const B = F.box, P = F.put, X = d => cx + d, Z = d => z0 + d, red = '#c8102e', red2 = '#9e0d24', brass = '#c9a24a', blk = '#1c1a1d', wood = '#c8a15a';
  for (const s of [-1, 1]) { P(X(s * 4), y0 + 12, Z(37), '#fff3c4', 'lamp'); B(X(s * 4), X(s * 4), y0 + 12, y0 + 13, Z(36), Z(37), brass, 'lamp'); }
  for (const wz of [7, 30]) for (const s of [-1, 1]) for (let dy = -4; dy <= 4; dy++) for (let dz = -4; dz <= 4; dz++) {   // wheels: tire, red spokes, brass hub
    const q = Math.hypot(dy, dz); if (q > 4.5) continue; const spoke = dy === 0 || dz === 0 || Math.abs(dy) === Math.abs(dz);
    for (const t of [6, 7]) P(X(s * t), y0 + 4 + dy, Z(wz + dz), q > 3.3 ? blk : q < 1.2 ? brass : spoke ? red : '#3a3a40', 'wheel'); }
  B(X(-5), X(5), y0 + 4, y0 + 5, Z(1), Z(36), blk, 'chassis');
  for (const [a, b] of [[1, 13], [24, 36]]) for (const s of [-1, 1]) { B(X(s * 6), X(s * 8), y0 + 9, y0 + 9, Z(a), Z(b), blk, 'fender'); B(X(s * 6), X(s * 8), y0 + 8, y0 + 8, Z(a), Z(a), blk, 'fender'); B(X(s * 6), X(s * 8), y0 + 8, y0 + 8, Z(b), Z(b), blk, 'fender'); }
  for (const s of [-1, 1]) B(X(s * 6), X(s * 7), y0 + 6, y0 + 6, Z(14), Z(23), blk, 'step');
  B(X(-5), X(5), y0 + 6, y0 + 12, Z(0), Z(20), (x, y) => (y === y0 + 12 ? brass : red), 'body', (x, y, z) => x === X(-5) || x === X(5) || z === Z(0) || z === Z(20) || y === y0 + 6);   // the hose bed
  B(X(-4), X(4), y0 + 11, y0 + 11, Z(1), Z(19), (x, y, z) => ((x + z) % 3 ? '#8a8f96' : '#6f747b'), 'hose');
  B(X(-4), X(4), y0 + 6, y0 + 8, Z(21), Z(24), '#3a2a1f', 'seat'); B(X(-4), X(4), y0 + 9, y0 + 12, Z(21), Z(21), '#3a2a1f', 'seat');
  B(X(-4), X(4), y0 + 6, y0 + 13, Z(26), Z(26), red, 'cowl'); P(X(2), y0 + 14, Z(25), blk, 'wheel'); P(X(1), y0 + 14, Z(25), blk, 'wheel'); P(X(3), y0 + 14, Z(25), blk, 'wheel');
  B(X(-1), X(1), y0 + 14, y0 + 15, Z(26), Z(27), brass, 'bell'); P(X(0), y0 + 16, Z(26), brass, 'bell');
  B(X(-4), X(4), y0 + 6, y0 + 12, Z(27), Z(35), (x, y, z) => ((x === X(-4) || x === X(4)) && z % 2 && y > y0 + 8 && y < y0 + 11 ? red2 : red), 'hood', (x, y, z) => x === X(-4) || x === X(4) || y === y0 + 12);
  B(X(-4), X(4), y0 + 6, y0 + 13, Z(36), Z(36), (x, y) => (x === X(-4) || x === X(4) || y === y0 + 13 || y === y0 + 6 ? brass : (x + y) % 2 ? '#8a6d2a' : brass), 'radiator');
  for (const s of [-1, 1]) B(X(s * 4), X(s * 4), y0 + 13, y0 + 13, Z(-3), Z(24), wood, 'ladder');   // the ladder rides on top
  for (let d = -2; d <= 23; d += 3) B(X(-3), X(3), y0 + 13, y0 + 13, Z(d), Z(d), wood, 'ladder');
}

// a vejigante: the carnival devil of Ponce. A papier-mâché mask bristling with horns, bulging eyes and fangs;
// a one-piece suit whose wide sleeves open into bat wings when the arms go up; a vejiga, the dried bladder, on a stick
function vejigante(F, x, z, y0, colors) {
  const [a, b, c] = colors, B = F.box, P = F.put, my = y0 + 14;
  // mask details first
  for (const s of [-1, 1]) { P(x + s, my + 3, z + 3, '#111', 'mask'); P(x + s, my + 4, z + 2, PAL.white, 'mask'); P(x + s, my, z + 3, PAL.white, 'mask'); }   // eyes, brows, fangs
  B(x - 1, x + 1, my + 1, my + 1, z + 3, z + 3, '#7a1020', 'mask'); P(x, my + 2, z + 3, b, 'mask');   // the open mouth, the snout
  const horns = [[0, 6, 0, 0, 1, 0, 4], [-2, 5, 0, -1, 1, 0, 3], [2, 5, 0, 1, 1, 0, 3], [-1, 5, -1, -1, 1, -1, 3], [1, 5, -1, 1, 1, -1, 3], [-3, 3, 0, -1, 0, 0, 3], [3, 3, 0, 1, 0, 0, 3],
    [-2, 5, 2, -1, 1, 1, 2], [2, 5, 2, 1, 1, 1, 2], [0, 5, 2, 0, 1, 1, 2], [-3, 4, -1, -1, 1, 0, 2], [3, 4, -1, 1, 1, 0, 2], [-3, 2, 1, -1, 0, 1, 2], [3, 2, 1, 1, 0, 1, 2], [0, 4, -3, 0, 1, -1, 2]];
  horns.forEach(([hx, hy, hz, dx, dy, dz, n], i) => { for (let k = 1; k <= n; k++) P(x + hx + dx * k, my + hy + dy * k, z + hz + dz * k, k === n ? PAL.white : i % 2 ? a : b, 'horn'); });
  B(x - 2, x + 2, my, my + 5, z - 2, z + 2, (xx, yy, zz) => ((xx * 3 + yy * 5 + zz * 7) % 5 === 0 ? b : c), 'mask');
  // the vejiga in the left hand
  B(x - 8, x - 8, y0 + 17, y0 + 20, z + 1, z + 1, '#7a5230', 'vejiga'); B(x - 10, x - 8, y0 + 21, y0 + 23, z, z + 2, '#e8d6a8', 'vejiga');
  // arms up and out, the wings hanging from them to the knees, fringed at the hem
  for (const s of [-1, 1]) for (let i = 0; i <= 5; i++) { P(x + s * (3 + i), y0 + 12 + Math.round(i * 0.8), z, i > 4 ? '#8d5a36' : a, 'arm');
    for (let y = y0 + 4 + i; y < y0 + 12 + Math.round(i * 0.8); y++) P(x + s * (3 + i), y, z - 1, (i + (y >> 1)) % 2 ? a : c, 'cape');
    if (i % 2 === 0) P(x + s * (3 + i), y0 + 3 + i, z - 1, PAL.white, 'fringe'); }
  B(x - 2, x + 2, y0 + 8, y0 + 13, z - 1, z + 1, (xx, yy) => ((xx + yy * 2) % 3 === 0 ? b : a), 'body');
  for (const s of [-1, 1]) { B(x + s, x + s * 2, y0 + 1, y0 + 7, z - 1, z, (xx, yy) => (yy % 3 === 0 ? b : a), 'legs'); B(x + s, x + s * 2, y0, y0, z - 1, z + 1, '#1c1a1d', 'shoe'); }
}

// Bomba y plena, Loíza: three barriles laid down with their drummers astride, a dancer in a white skirt, the cuá, maracas; panderos and a güiro for plena
function barril(F, x, z0, y0) {   // a barrel on its side, its skin facing +z
  for (let z = z0; z <= z0 + 8; z++) for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) {
    if (dx * dx + dy * dy > 10.5) continue;
    F.put(x + dx, y0 + 3 + dy, z, z === z0 + 8 ? '#e8d6b0' : (z - z0) % 3 === 1 ? '#3e2716' : (dx + 9) % 2 ? '#8a5a34' : '#9b6a40', 'barril');
  }
}
function loiza(K) {
  K.setTag('bomba');
  K.box(-10, 10, 0, 0, -7, 8, '#e6d6b4', 'base');
  const F = K.fine(4), y0 = 4, SKINS = ['#5a3a24', '#6b4226', '#7a4a2b', '#4a2f1d', '#8d5a36'];
  [[-16, '#f4f1ea'], [-2, '#f7c948'], [12, '#f4f1ea']].forEach(([bx, shirt], i) => { barril(F, bx, -22, y0);
    gente(F, bx, -20, y0, { seated: true, arms: 'forward', skin: SKINS[i], shirt, pants: '#2e2a26', hair: '#1c1a1d' }); });
  gente(F, 0, 6, y0, { skirt: PAL.white, skirtTrim: '#d62828', arms: 'out', skin: SKINS[3], shirt: PAL.white, scarf: '#d62828' });   // the dancer, facing the drums' call
  F.box(26, 28, y0, y0 + 4, -16, -14, '#7a5230', 'cua'); gente(F, 27, -21, y0, { arms: 'forward', skin: SKINS[4], shirt: '#2e8b57', pants: '#2e2a26' });   // cuá: sticks on a wooden block
  const mh = gente(F, -30, -6, y0, { armR: 'up', skin: SKINS[1], shirt: '#f4f1ea', pants: '#c8b089', hair: '#1c1a1d' });   // the singer, a maraca up
  F.box(mh.R[0], mh.R[0] + 1, mh.R[1] + 1, mh.R[1] + 2, mh.R[2], mh.R[2] + 1, '#c99a3c', 'maraca');
  K.setTag('plena');
  for (const [px, pz, sh, sk] of [[22, 12, '#d62828', SKINS[2]], [31, 8, '#f4f1ea', SKINS[0]]]) {   // plena: panderos held up at the chest
    const h = gente(F, px, pz, y0, { armL: 'hold', armR: 'forward', skin: sk, shirt: sh, pants: '#1f2a44', hair: '#1c1a1d' }), [cx, cy, cz] = h.L;
    for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) { const q = dx * dx + dy * dy; if (q <= 10) F.put(cx + 1 + dx, cy + 2 + dy, cz, q > 6 ? '#5a3a22' : '#ecdcb6', 'pandero'); }
  }
  const g = gente(F, 26, 22, y0, { armL: 'hold', armR: 'hold', skin: SKINS[4], shirt: '#f7c948', pants: '#1f2a44', hair: '#1c1a1d' });   // güiro across the chest
  F.box(g.L[0], g.R[0], g.L[1], g.L[1] + 1, g.L[2], g.L[2], (xx) => (xx % 2 ? '#c9a24a' : '#a8812f'), 'guiro');
  K.setTag('bomba');
  for (const [px, pz, l] of [[-9, 7, 1], [9, -6, -1], [-9, -6, 1]]) palma(K, px, pz, 1, 11, l);
}

// La Casita: a homage to the house at the heart of Bad Bunny's DTMF residency, set in his hometown, Vega Baja.
// Pink facade, flat gray roof, rattan chairs on the porch, an AC unit on the wall; the two white plastic chairs and the
// plantain trees from the album cover; an orange flamboyán shading the yard; Benito, dressed as a jíbaro with a pava, the light-blue flag in hand.
function platano(K, x, z, y0) {
  K.box(x, x, y0, y0 + 5, z, z, '#6f8f3a', 'trunk');
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) for (let i = 1; i <= 4; i++) K.put(x + dx * i, y0 + 6 - Math.floor(i / 2), z + dz * i, i % 2 ? '#4f9a3a' : '#69b04a', 'leaf');
  K.box(x + 1, x + 1, y0 + 3, y0 + 4, z, z, '#8fb83a', 'fruit');
}
function silla(F, x, z, y0, c) {   // a patio chair at true size, in fine cells: seat 45 cm up, back to 90 cm, armrests
  for (const lx of [x, x + 4]) for (const lz of [z, z + 4]) F.box(lx, lx, y0, y0 + 3, lz, lz, c, 'chair');
  F.box(x, x + 4, y0 + 4, y0 + 4, z, z + 4, c, 'chair'); F.box(x, x + 4, y0 + 5, y0 + 9, z, z, c, 'chair');
  for (const ax of [x, x + 4]) F.box(ax, ax, y0 + 6, y0 + 6, z, z + 4, c, 'chair');
}
// a flamboyán as it really grows: a short trunk that splits into spreading limbs under a wide, flat umbrella of flowers
function flamboyanAncho(K, x, z, y0, rad, cols) {
  const was = K.setTag('flamboyan');
  K.box(x, x, y0, y0 + 3, z, z, PAL.trunk, 'trunk');
  for (let i = 0; i < 5; i++) { const a = i * 1.257 + 0.4, l = rad * 0.6; K.pole([x, y0 + 3, z], [x + Math.cos(a) * l, y0 + 7.5, z + Math.sin(a) * l], 0.45, PAL.trunk); }
  for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
    const d = Math.hypot(dx, dz); if (d > rad + 0.3 || (d > rad - 1.5 && K.r() < 0.3)) continue;
    const c = () => { const t = K.r(); return t < 0.14 ? '#5f8f3e' : cols[Math.floor(K.r() * cols.length)]; };
    K.put(x + dx, y0 + 8, z + dz, c(), 'leaf');
    if (d < rad - 1.5) K.put(x + dx, y0 + 9, z + dz, c(), 'leaf');
    if (d < rad * 0.5) K.put(x + dx, y0 + 10, z + dz, c(), 'leaf');
    if (d > rad * 0.45 && K.r() < 0.18) K.put(x + dx, y0 + 7, z + dz, c(), 'leaf');
  }
  const F = K.fine(4);   // fallen petals on the grass
  for (let i = 0; i < 70; i++) { const a = K.r() * 6.28, d = Math.sqrt(K.r()) * rad * 4; F.put((x + 0.5) * 4 + Math.cos(a) * d, y0 * 4, (z + 0.5) * 4 + Math.sin(a) * d, cols[i % cols.length], 'petal'); }
  K.setTag(was);
}
// Benito as a jíbaro, in finer cells than anyone else (a sixth of a block, ~6.7 cm) so his face and his pava read:
// beard and sideburns, a white guayabera with pleats and buttons, khakis, the flag raised in his right hand.
// The pava: the jíbaro's woven straw hat, a wide brim that droops a little at the edge, a low rounded crown with a peak, a frayed rim.
function jibaro(K, x, z, y0) {
  const F = K.fine(6), B = F.box, P = F.put;
  const skin = '#b98a5f', skin2 = '#a3744b', shirt = '#f2efe6', pleat = '#dcd6c6', pants = '#c9b48c', shoe = '#5a3a22', beard = '#4a382b';
  const h0 = y0 + 22;   // the chin; the head is 5 cells tall, 3 wide, face on z + 2
  // the pava first: put() keeps the first color a cell gets
  const hb = h0 + 5, cz = z + 0.5;
  for (let dx = -7; dx <= 7; dx++) for (let dz = -7; dz <= 7; dz++) { const q = Math.hypot(dx, dz);   // a wide, nearly flat brim, about 80 cm across
    if (q > 6.2 || (q > 5.6 && K.r() < 0.3)) continue;                                   // a frayed rim
    const straw = q > 2.3 && q < 2.9 ? '#b8974f' : (Math.round(q * 1.5) % 2) ? '#e3cb8a' : '#d4b671';   // woven in rings, a darker ring where brim meets crown
    P(x + dx, q > 5.2 ? hb - 1 : hb, Math.round(cz + dz), straw, 'pava'); }
  [[1, 2.4], [2, 2.2], [3, 1.6]].forEach(([dy, rr]) => { for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++)
    if (Math.hypot(dx, dz) <= rr) P(x + dx, hb + dy, Math.round(cz + dz), (dx + dz + dy) % 2 ? '#e3cb8a' : '#cfb06a', 'pava'); });
  // the face
  P(x - 1, h0 + 3, z + 2, '#1c1a1d', 'eye'); P(x + 1, h0 + 3, z + 2, '#1c1a1d', 'eye');
  P(x, h0 + 2, z + 3, skin2, 'nose'); P(x, h0 + 1, z + 2, '#5a3226', 'mouth');
  B(x - 1, x + 1, h0, h0, z, z + 2, beard, 'beard'); for (const s of [-1, 1]) { P(x + s, h0 + 1, z + 2, beard, 'beard'); B(x + s, x + s, h0 + 1, h0 + 3, z - 1, z, beard, 'hair'); }   // a trimmed beard along the jaw
  P(x, h0 + 2, z + 2, skin2, 'nose'); B(x - 1, x + 1, h0 + 1, h0 + 4, z - 1, z - 1, '#1c1a1d', 'hair');
  for (const s of [-1, 1]) P(x + s * 2, h0 + 2, z, skin, 'ear');
  B(x - 1, x + 1, h0, h0 + 4, z - 1, z + 2, skin, 'head');
  B(x - 1, x + 1, h0 - 1, h0 - 1, z - 1, z, skin, 'neck');
  // the guayabera: open collar, a button line, two pleats each side
  P(x, y0 + 20, z + 1, skin, 'collar'); P(x, y0 + 19, z + 1, skin, 'collar');
  for (let y = y0 + 12; y <= y0 + 18; y += 2) P(x, y, z + 1, '#cfc6b2', 'button');
  for (const px of [-2, 2]) B(x + px, x + px, y0 + 12, y0 + 19, z + 1, z + 1, pleat, 'pleat');
  B(x - 3, x + 3, y0 + 12, y0 + 20, z - 1, z + 1, shirt, 'body');
  // khakis and shoes
  for (const s of [-1, 1]) { B(x + s, x + s * 2, y0, y0, z - 1, z + 1, shoe, 'shoe'); B(x + s, x + s * 2, y0 + 1, y0 + 11, z - 1, z, pants, 'legs'); }
  // left arm down, right arm raised with the flag
  B(x - 4, x - 4, y0 + 13, y0 + 20, z - 1, z, shirt, 'arm'); B(x - 4, x - 4, y0 + 11, y0 + 12, z - 1, z, skin, 'hand');
  B(x + 4, x + 4, y0 + 18, y0 + 27, z, z, shirt, 'arm'); B(x + 4, x + 4, y0 + 28, y0 + 29, z, z, skin, 'hand');
  const px = (x + 4.5) / 6, pz = (z + 0.5) / 6; K.pole([px, (y0 + 22) / 6, pz], [px, (y0 + 54) / 6, pz], 0.08, '#d9d4c8');
  for (let fx = 0; fx < 13; fx++) for (let fy = 0; fy < 9; fy++) {   // a hand flag, ~90 x 60 cm: five stripes, the light-blue triangle, a white star
    const inTri = fx < 8 && Math.abs(fy - 4) <= (8 - fx) * 0.56, star = (fx === 2 && fy >= 3 && fy <= 5) || ((fx === 1 || fx === 3) && fy === 4);
    P(x + 5 + fx, y0 + 53 - fy - Math.round(Math.sin(fx * 0.55) * 0.8), z, star ? PAL.white : inTri ? '#6ec1e4' : (Math.floor(fy * 5 / 9) % 2 ? PAL.white : '#d62828'), 'flag'); }
}
function casitaDTMF(K) {
  K.setTag('casita');
  K.box(-18, 16, 0, 0, -10, 16, '#8fae6b', 'yard');
  const top = casa(K, { x: -9, z: -8, y: 0, w: 18, d: 11, h: 8, wall: '#f3a6b8', trim: '#f3a6b8', wall2: '#9a9a9a', door: '#7a4b35' });
  K.box(-10, 9, top, top, -9, 3, '#9a9a9a', 'roof');
  K.box(-9, 8, 0, 0, 3, 7, '#c9c4bb', 'porch'); K.box(-9, 8, top, top, 3, 7, '#9a9a9a', 'roof');
  for (const px of [-9, -1, 8]) K.box(px, px, 1, top - 1, 7, 7, PAL.white, 'col');
  K.box(10, 12, 2, 4, -5, -4, '#e9e9e9', 'ac'); K.box(10, 10, 2, 4, -5, -4, '#8a8f96', 'ac');   // the AC condenser on the wall
  const F = K.fine(4);
  silla(F, -28, 15, 4, '#b58b55'); silla(F, -16, 15, 4, '#b58b55'); F.box(-22, -19, 4, 6, 18, 20, '#b58b55', 'table');   // rattan on the porch
  silla(F, -24, 44, 4, '#f4f4f4'); silla(F, -14, 45, 4, '#f4f4f4');   // the two white plastic chairs
  for (const [px, pz] of [[15, 14], [14, 2], [11, -9], [-16, -7]]) platano(K, px, pz, 1);
  flamboyanAncho(K, -14, 9, 1, 7, ['#ff7a1a', '#f2611c', '#ff8f2e', '#f57418']);
  // Benito on the porch roof, dressed as a jíbaro the way he appeared in the DTMF residency
  K.setTag('benito'); jibaro(K, 12, 33, (top + 1) * 6); K.setTag('casita');
}

const PLANS = { barrio, colmado, central, construccion, toldo, arecibo, kiosko, bombas, loiza, casitaDTMF };
export function plan(kind, seed, target) {
  const K = builder(seed); PLANS[kind](K, target);
  let roofTop = 0, ext = 0; for (const b of K.solid) { roofTop = Math.max(roofTop, b.y); ext = Math.max(ext, Math.hypot(b.x, b.z)); }
  for (const p of K.poles) for (const q of [p.a, p.b]) { roofTop = Math.max(roofTop, q[1]); ext = Math.max(ext, Math.hypot(q[0], q[2])); }
  return { solid: K.solid, ghost: K.ghost, glow: K.glow, poles: K.poles, roofTop, ext: ext + 2 };
}
