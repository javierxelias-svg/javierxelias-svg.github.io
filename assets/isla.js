/* Isla — Puerto Rico built from blocks, one building per project, a day that passes as you scroll.
   It opens on a map of the region and dives into the island. East (sunrise) to west (Rincón, sunset).
   Each building's condition tells the truth about the project. Scroll flies the camera; hover lifts blocks;
   point at anything to learn what it is; click a building to read its project; drag looks around. At night the bays glow and the coquíes sing. */
import * as THREE from 'three';
import { plan, rng } from './isla-plans.js?v=20261008j';

/* ---------------- settings ---------------- */
// the island always moves, for everyone: the art is the motion (buildings drop in block by block, flicks glide)
const MOTION = true, CALM = false;
const MOBILE = matchMedia('(max-width: 820px)').matches;

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = k => k * k * (3 - 2 * k);
const easeOut = k => 1 - Math.pow(1 - k, 3);
const easeInOut = k => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
const C = h => new THREE.Color(h);
const CC = new Map(), hex = h => { let c = CC.get(h); if (!c) { c = C(h); CC.set(h, c); } return c; };

/* ---------------- Puerto Rico ---------------- */
const LON0 = -66.45, LAT0 = 18.21, S = 76, CL = Math.cos(18.2 * Math.PI / 180);
const proj = (lon, lat) => [(lon - LON0) * CL * S, -(lat - LAT0) * S];   // +x east, +z south
const MAIN_LL = [[-67.27, 18.36], [-67.15, 18.49], [-67.02, 18.51], [-66.72, 18.48], [-66.27, 18.48], [-66.10, 18.47],
  [-65.88, 18.43], [-65.62, 18.38], [-65.63, 18.22], [-65.75, 18.12], [-65.90, 18.00], [-66.11, 17.95], [-66.30, 17.95],
  [-66.40, 17.96], [-66.61, 17.98], [-66.79, 17.99], [-66.92, 17.95], [-67.19, 17.93], [-67.20, 18.02], [-67.16, 18.20]];
const VIEQUES_LL = [[-65.58, 18.15], [-65.45, 18.16], [-65.30, 18.14], [-65.28, 18.11], [-65.40, 18.09], [-65.57, 18.10]];
const CULEBRA_LL = [[-65.34, 18.33], [-65.25, 18.34], [-65.22, 18.31], [-65.29, 18.29], [-65.34, 18.30]];
const PR_LL = [MAIN_LL, VIEQUES_LL, CULEBRA_LL];
const POLYS = PR_LL.map(p => p.map(q => proj(q[0], q[1])));

function inPoly(P, x, z) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, zi] = P[i], [xj, zj] = P[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
}
const inside = (x, z) => POLYS.some(P => inPoly(P, x, z));
function coastDist(x, z) {
  let m = 1e9;
  for (const P of POLYS) for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [ax, az] = P[j], [bx, bz] = P[i], dx = bx - ax, dz = bz - az;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz));
    m = Math.min(m, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return m;
}
// value noise
const NR = rng(1234), NG = new Float32Array(64 * 64).map(() => NR());
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = smooth(x - xi), zf = smooth(z - zi);
  const g = (a, b) => NG[((a & 63) * 64 + (b & 63))];
  return lerp(lerp(g(xi, zi), g(xi + 1, zi), xf), lerp(g(xi, zi + 1), g(xi + 1, zi + 1), xf), zf);
}
const gauss = (x, z, c, rx, rz, a) => a * Math.exp(-(((x - c[0]) / rx) ** 2 + ((z - c[1]) / rz) ** 2));
const RIDGE = Array.from({ length: 9 }, (_, i) => proj(lerp(-67.0, -66.15, i / 8), lerp(18.18, 18.14, i / 8)));
const LUQ = proj(-65.79, 18.30), CAYEY = proj(-66.15, 18.06), KARST = proj(-66.72, 18.37);
function mountain(x, z) {
  let m = 0; for (const c of RIDGE) m = Math.max(m, gauss(x, z, c, 7, 4.5, 1));
  m = Math.max(m, gauss(x, z, LUQ, 5.5, 4, 0.9), gauss(x, z, CAYEY, 8, 3.5, 0.62), gauss(x, z, KARST, 12, 3, 0.32));
  return m;
}
function rawHeight(x, z) {
  const d = coastDist(x, z), b = smooth(clamp(d / 5.5));
  const n = vnoise(x * 0.18, z * 0.18) * 0.7 + vnoise(x * 0.5 + 9, z * 0.5) * 0.3;
  return 0.5 + b * (0.8 + 9.5 * mountain(x, z) + n * 1.6);
}

/* ---------------- one building, placed on the island ---------------- */
const TU = 0.2;   // one building block in world units
const ORANGE = C('#ff5a1f'), BLUE = C('#3a3fc4');
class Temple {
  constructor(site, P, scene, box) {
    this.site = site; this.P = P;
    const g = this.group = new THREE.Group(); g.position.copy(site.pos); g.rotation.y = site.yaw; scene.add(g);
    const r = rng(site.seed + 99), n = P.solid.length;
    this.mesh = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ color: 0xffffff }), n);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.userData.temple = this;
    const col = new THREE.Color();
    P.solid.forEach((b, i) => {
      col.copy(hex(b.c)).offsetHSL(0, 0, (r() - 0.5) * 0.05);
      col.multiplyScalar((0.88 + 0.12 * clamp(b.y / 14)) * (b.part === 'fallen' ? 0.9 : 1));   // lower blocks sit in a little shade
      this.mesh.setColorAt(i, col);
    });
    // its real size, fixed up front: the blocks start hidden, and a size measured then would be zero (no clicks, no hover)
    this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, P.roofTop * TU * 0.5, 0), Math.max(P.ext, P.roofTop) * TU * 1.1);
    g.add(this.mesh);
    // hand-laid: every block sits a hair off true
    this.jit = new Float32Array(n * 3); for (let i = 0; i < n; i++) { this.jit[i * 3] = (r() - 0.5) * 0.07; this.jit[i * 3 + 1] = (r() - 0.5) * 0.04; this.jit[i * 3 + 2] = (r() - 0.5) * 0.06; }
    this.lift = new Float32Array(n); this.delay = new Float32Array(n);
    P.solid.forEach((b, i) => { this.delay[i] = (b.y / (P.roofTop + 1)) * 1.1 + r() * 0.45; });
    if (P.ghost.length) {
      this.ghost = new THREE.InstancedMesh(new THREE.BoxGeometry(TU * 0.22, TU * 0.22, TU * 0.22), new THREE.MeshBasicMaterial({ color: BLUE, transparent: true, opacity: 0.6, depthWrite: false }), P.ghost.length);
      const d = new THREE.Object3D(); P.ghost.forEach((b, i) => { d.position.set(b.x * TU, (b.y + 0.5) * TU, b.z * TU); d.updateMatrix(); this.ghost.setMatrixAt(i, d.matrix); });
      g.add(this.ghost);
    }
    if (P.glow.length) { this.glow = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ color: ORANGE, transparent: true, opacity: 0.9 }), P.glow.length); g.add(this.glow); }
    if (P.poles.length) {   // posts, rebar, rafters, cables: thin beams from a to b
      this.poles = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), P.poles.length); this.poles.castShadow = true;
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
      P.poles.forEach((o, i) => { a.set(o.a[0], o.a[1], o.a[2]).multiplyScalar(TU); b.set(o.b[0], o.b[1], o.b[2]).multiplyScalar(TU);
        const len = a.distanceTo(b); q.setFromUnitVectors(up, b.clone().sub(a).normalize()); s.set(o.w * TU, len, o.w * TU);
        m.compose(a.clone().add(b).multiplyScalar(0.5), q, s); this.poles.setMatrixAt(i, m); this.poles.setColorAt(i, hex(o.c)); });
      g.add(this.poles);
    }
    this.anim = null; this.built = false; this.dirty = true; this.d = new THREE.Object3D();
    this.setVisible(!MOTION);   // with motion on, buildings wait for you and build when you arrive
  }
  setVisible(v) { this.shown = v; [this.ghost, this.poles, this.glow].forEach(m => m && (m.visible = v)); if (v) this.built = true; this.dirty = true; }
  build(t) { if (this.built) return; this.built = true; this.setVisible(true); this.anim = CALM ? null : { type: 'build', t0: t }; this.dirty = true; }
  write(t) {
    const P = this.P, d = this.d, A = this.anim; let busy = false;
    for (let i = 0; i < P.solid.length; i++) {
      const b = P.solid[i]; let ox = 0, oy = 0, oz = 0, s = this.shown ? 1 : 0;
      if (A) { const kk = t - A.t0 - this.delay[i]; if (kk < 0) { s = 0; busy = true; } else if (kk < 0.7) { oy = (1 - easeOut(kk / 0.7)) * 14; busy = true; } }
      const L = this.lift[i]; if (L > 0.002) busy = true;
      const bs = b.s || 1;   // fine blocks (people, drums, flags) are a fraction of a block
      d.position.set((b.x + ox + this.jit[i * 3] * bs) * TU, (b.y + bs / 2 + oy + L + this.jit[i * 3 + 1] * bs) * TU, (b.z + oz + this.jit[i * 3 + 2] * bs) * TU);
      if (b.rot) d.rotation.set(b.rot[0], b.rot[1], b.rot[2]); else d.rotation.set(0, this.jit[i * 3 + 2] * 0.4 * bs, 0);
      d.scale.setScalar(s * (bs < 1 ? 0.985 : 0.94) * bs); d.updateMatrix(); this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true; if (A && !busy) this.anim = null; this.dirty = busy; return busy;
  }
  writeGlow(t, moving) {
    if (!this.glow || !this.shown) return; const d = this.d;
    this.P.glow.forEach((g, i) => { const k = moving ? (g.ph + t * 0.04 * g.sp) % 1 : g.ph;
      d.position.set(g.x * TU, (g.y0 + k * g.span) * TU, g.z * TU); d.rotation.set(k * 3 + g.ph * 6, k * 4, 0); d.scale.setScalar(g.s * (1 - k * 0.8)); d.updateMatrix(); this.glow.setMatrixAt(i, d.matrix); });
    this.glow.instanceMatrix.needsUpdate = true;
  }
  hover(localCell, active) {
    const P = this.P; let any = false;
    for (let i = 0; i < P.solid.length; i++) {
      let goal = 0; if (localCell && active) { const b = P.solid[i], q = (b.x - localCell.x) ** 2 + (b.y - localCell.y) ** 2 + (b.z - localCell.z) ** 2; if (q < 36) goal = (1 - q / 36) * 2.2; }
      const v = this.lift[i] + (goal - this.lift[i]) * 0.18; this.lift[i] = v; if (v > 0.002 || goal > 0) any = true;
    }
    if (any) this.dirty = true; return any;
  }
}

/* ---------------- time of day ---------------- */
// tod 0 = dawn in the east, 1 = night. Sun crosses east -> south -> west (Rincón sunsets).
const SKY = [
  { t: 0.00, top: '#8d98d4', hor: '#f3c9b6', sun: '#ffb48c', si: 1.6, az: 0.12, el: 0.10, hs: '#d6d8f6', hg: '#efcab5', hi: 1.15, sea: '#a9bfe2' },
  { t: 0.22, top: '#9ab3e6', hor: '#e9e8ee', sun: '#fff0dc', si: 2.3, az: 0.75, el: 0.62, hs: '#e6e8ff', hg: '#f3d9c6', hi: 1.15, sea: '#3d8fc0' },
  { t: 0.48, top: '#86a9e4', hor: '#eef1f5', sun: '#ffffff', si: 2.5, az: 1.57, el: 1.15, hs: '#e8ecff', hg: '#f1e2d2', hi: 1.2, sea: '#2f8ac3' },
  { t: 0.72, top: '#7a8bd0', hor: '#f6d0a6', sun: '#ffae6c', si: 2.2, az: 2.55, el: 0.32, hs: '#d8d2f0', hg: '#efbf98', hi: 0.9, sea: '#3a6fa8' },
  { t: 0.88, top: '#414c90', hor: '#ff9663', sun: '#ff7438', si: 1.7, az: 2.98, el: 0.06, hs: '#8e8fc6', hg: '#d18766', hi: 0.6, sea: '#2d4b84' },
  { t: 1.00, top: '#0f1533', hor: '#353a68', sun: '#8fa2ff', si: 0.6, az: 1.2, el: 0.9, hs: '#3b4274', hg: '#2a2433', hi: 0.5, sea: '#101b3a' },
].map(k => Object.assign({}, k, { top: C(k.top), hor: C(k.hor), sun: C(k.sun), hs: C(k.hs), hg: C(k.hg), sea: C(k.sea) }));
function sky(tod) {
  let i = 0; while (i < SKY.length - 2 && tod > SKY[i + 1].t) i++;
  const a = SKY[i], b = SKY[i + 1], k = smooth(clamp((tod - a.t) / (b.t - a.t)));
  const o = {}; for (const f of ['top', 'hor', 'sun', 'hs', 'hg', 'sea']) o[f] = a[f].clone().lerp(b[f], k);
  for (const f of ['si', 'az', 'el', 'hi']) o[f] = lerp(a[f], b[f], k);
  o.night = smooth(clamp((tod - 0.84) / 0.14));
  return o;
}

/* shared with the map and the frogs */
const LIVE = { screen: null, night: 0, t: 0 };
const ES = () => document.documentElement.lang === 'es';

/* ---------------- the world ---------------- */
function start() {
  const canvas = document.getElementById('world');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: !MOBILE, powerPreference: 'high-performance' }); }
  catch (e) { document.documentElement.classList.add('no-gl'); return null; }
  renderer.setPixelRatio(Math.min(MOBILE ? 1.5 : 2, devicePixelRatio || 1));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(32, 1, 0.1, 900);
  scene.fog = new THREE.Fog(0xe9e8ee, 30, 300);

  // sky dome
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, sunCol: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunVis: { value: 1 } },
    vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `uniform vec3 uTop; uniform vec3 uHor; uniform vec3 sunCol; uniform vec3 sunDir; uniform float sunVis; varying vec3 vD;
      void main(){ vec3 d = normalize(vD); float h = clamp(d.y, 0., 1.); vec3 c = mix(uHor, uTop, pow(clamp(h * 2.2, 0., 1.) + 1e-4, .6));
        float s = max(dot(d, normalize(sunDir)), 0.); c += sunCol * (pow(s, 900.) * 1.4 + pow(s, 14.) * .22) * sunVis;
        gl_FragColor = vec4(c, 1.);
        #include <colorspace_fragment>
      }`
  });
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(700, 32, 16), skyMat); skyDome.frustumCulled = false; skyDome.renderOrder = -1; scene.add(skyDome);

  // lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2); sun.castShadow = true;
  const SM = MOBILE ? 1024 : 2048; sun.shadow.mapSize.set(SM, SM); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  // island cells: Puerto Rico, Vieques, Culebra
  const unit = new THREE.BoxGeometry(1, 1, 1); unit.translate(0, 0.5, 0);
  const cells = [], H = new Map();
  for (let x = -66; x <= 94; x++) for (let z = -28; z <= 28; z++) {
    const ins = inside(x, z), d = coastDist(x, z);
    if (ins) { const h = rawHeight(x, z); cells.push({ x, z, h, d, land: true }); }
    else if (d < 5) cells.push({ x, z, h: -0.35 - d * 0.28, d, land: false });
  }
  // sites, east to west, in the order of the page
  const SITES = {
    careeros: { kind: 'barrio', ll: [-65.93, 18.31], yaw: 0.25, seed: 7, blocks: 11280 },
    pantry: { kind: 'colmado', ll: [-66.09, 18.40], yaw: 0, seed: 11 },
    xpt: { kind: 'central', ll: [-66.55, 18.41], yaw: -0.2, seed: 23 },
    webos: { kind: 'construccion', ll: [-66.57, 18.19], yaw: 0.15, seed: 31 },
    elias: { kind: 'toldo', ll: [-66.66, 18.19], yaw: 0.45, seed: 47 },
    brain: { kind: 'arecibo', ll: [-66.75, 18.35], yaw: -0.2, seed: 53 },
    cowork: { kind: 'kiosko', ll: [-67.18, 18.33], yaw: -1.57, seed: 61 },
  };
  // the island's culture: not projects, always standing
  const LANDMARKS = {
    bombas: { kind: 'bombas', ll: [-66.614, 18.012], yaw: 0, seed: 71, name: ['Parque de Bombas & vejigantes · Ponce', 'Parque de Bombas y vejigantes · Ponce'] },
    loiza: { kind: 'loiza', ll: [-65.84, 18.405], yaw: 2.8, seed: 73, name: ['Bomba & plena · Loíza', 'Bomba y plena · Loíza'] },
    casita: { kind: 'casitaDTMF', ll: [-66.387, 18.42], yaw: -3.0, seed: 79, name: ['La Casita · for Bad Bunny · Vega Baja', 'La Casita · para Bad Bunny · Vega Baja'] },
  };
  const key = (x, z) => x + ',' + z; cells.forEach(c => H.set(key(c.x, c.z), c));
  const plans = {};
  for (const [id, s] of Object.entries({ ...SITES, ...LANDMARKS })) {
    const P = plans[id] = plan(s.kind, s.seed, s.blocks || 0);
    const [sx, sz] = proj(s.ll[0], s.ll[1]); s.id = id;
    const rf = clamp(P.ext * TU * 0.85, 3.5, 7.5), ramp = 4.5;
    let sum = 0, n = 0; for (const c of cells) if (c.land && Math.hypot(c.x - sx, c.z - sz) < rf) { sum += c.h; n++; }
    const hs = Math.round((n ? sum / n : 1) * 2) / 2 + 0.5;
    for (const c of cells) { if (!c.land) continue; const dd = Math.hypot(c.x - sx, c.z - sz);
      if (dd < rf + 1.5) c.site = true; if (dd < rf + 7) c.near = true;
      if (dd < rf) { c.h = hs; c.paved = true; } else if (dd < rf + ramp) c.h = lerp(hs, c.h, smooth((dd - rf) / ramp)); }
    s.pos = new THREE.Vector3(sx, hs, sz);
  }
  for (const c of cells) if (c.land) c.h = Math.max(0.5, Math.round(c.h * 2) / 2);   // terraces, in half-block steps

  const land = cells.filter(c => c.land), shallow = cells.filter(c => !c.land);
  const terrain = new THREE.InstancedMesh(unit, new THREE.MeshLambertMaterial({ color: 0xffffff }), land.length + shallow.length);
  terrain.castShadow = true; terrain.receiveShadow = true;
  const tr = rng(77), m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), col = new THREE.Color();
  const SAND = C('#ead9bb'), SAGE = C('#a9b88f'), FOREST = C('#5f8457'), ROCK = C('#a9a08f'), PAVE = C('#b4c096'), REEF = C('#5ad3c6'), DEEP = C('#2a7db4');
  [...land, ...shallow].forEach((c, i) => {
    const base = c.land ? -2 : -3; v3.set(c.x, base, c.z); s3.set(1, c.h - base, 1); m4.compose(v3, q0, s3); terrain.setMatrixAt(i, m4);
    if (!c.land) col.copy(REEF).lerp(DEEP, clamp(c.d / 5));
    else if (c.paved) col.copy(PAVE);
    else if (c.h <= 0.6) col.copy(SAND);
    else { const m = clamp((c.h - 1) / 6); col.copy(SAGE).lerp(FOREST, m); if (c.h > 8) col.lerp(ROCK, clamp((c.h - 8) / 3) * 0.6); }
    col.offsetHSL(0, 0, (tr() - 0.5) * 0.04); terrain.setColorAt(i, col);
  });
  scene.add(terrain);

  // the island's life, at island scale: palms on the beaches, flamboyanes in the lowlands, El Yunque's forest, towns of concrete houses
  const props = [], pr = rng(19), euler = new THREE.Euler(), qq = new THREE.Quaternion();
  const prop = (x, y, z, sx, sy, sz, c, ry = 0) => props.push({ x, y, z, sx, sy, sz, c, ry });
  const PASTEL = ['#8fd3c8', '#f2a488', '#f4c45a', '#c3b2e0', '#b9e3b0', '#ef7f6a', '#9cc8ef', '#f3b6c4', '#f4f1ea', '#efe4cc', '#f4f1ea'];
  const GREENS = ['#3f6b3a', '#4e7d43', '#35593a', '#5d8a4c', '#466f3d'];
  let nPalm = 0, nFlam = 0, nTree = 0;
  for (const c of land) {
    if (c.near) continue; const jx = (pr() - 0.5) * 0.5, jz = (pr() - 0.5) * 0.5;
    if (c.h <= 0.6 && nPalm < 120 && pr() < 0.17) { nPalm++;
      const ox = (pr() - 0.5) * 0.18, oz = (pr() - 0.5) * 0.18, x = c.x + jx, z = c.z + jz, a = pr() * 3;
      prop(x, c.h, z, 0.1, 0.55, 0.1, '#7a5c40'); prop(x + ox, c.h + 0.55, z + oz, 0.09, 0.5, 0.09, '#7a5c40');
      for (let k = 0; k < 3; k++) prop(x + ox * 2, c.h + 1.02, z + oz * 2, 1.0 - k * 0.15, 0.06, 0.16, k ? '#5f9447' : '#4f8a3c', a + k * 1.05);
      continue; }
    const md = mountain(c.x, c.z), yunque = Math.hypot(c.x - LUQ[0], c.z - LUQ[1]) < 8;
    if (c.h > 2.5 && (md > 0.3 || yunque) && nTree < 950 && pr() < (yunque ? 0.6 : 0.12)) { nTree++;
      const w = 0.45 + pr() * 0.3; prop(c.x + jx, c.h, c.z + jz, w, 0.3 + pr() * 0.3, w, GREENS[Math.floor(pr() * GREENS.length)], pr()); continue; }
    if (c.h >= 1 && c.h <= 3.5 && nFlam < 130 && pr() < 0.06) { nFlam++; const f0 = props.length;
      prop(c.x + jx, c.h, c.z + jz, 0.1, 0.38, 0.1, '#6b4a33');
      prop(c.x + jx, c.h + 0.36, c.z + jz, 0.66, 0.2, 0.66, pr() < 0.5 ? '#e8452c' : '#ff6a2b', pr());
      prop(c.x + jx, c.h + 0.54, c.z + jz, 0.4, 0.12, 0.4, '#ff6a2b', pr());
      for (let k = f0; k < props.length; k++) props[k].kind = 'flamboyan'; }
  }
  // towns, where the towns really are: concrete houses, some with a water tank
  const TOWNS = [[-66.07, 18.43, 80, 4], [-66.16, 18.39, 30, 3], [-66.04, 18.23, 30, 3], [-66.61, 18.01, 55, 4], [-67.15, 18.20, 35, 3], [-66.72, 18.47, 22, 2.5], [-67.15, 18.43, 18, 2.5], [-65.83, 18.15, 14, 2], [-65.65, 18.33, 14, 2], [-66.93, 18.44, 10, 2], [-66.16, 17.97, 12, 2], [-65.44, 18.14, 6, 1.5], [-65.30, 18.31, 4, 1]];
  let nHouse = 0; const placeHouse = (x, z) => { const c = H.get(key(Math.round(x), Math.round(z))); if (!c || !c.land || c.near || c.h > 7) return false;
    const w = 0.26 + pr() * 0.16, d = 0.26 + pr() * 0.16, hh = 0.22 + pr() * 0.12, ry = Math.floor(pr() * 4) * Math.PI / 2 + (pr() - 0.5) * 0.3;
    prop(x, c.h, z, w, hh, d, PASTEL[Math.floor(pr() * PASTEL.length)], ry); if (pr() < 0.3) prop(x, c.h + hh, z, 0.09, 0.08, 0.09, '#2f2f33'); nHouse++; return true; };
  for (const [lo, la, n, rad] of TOWNS) { const [cx, cz] = proj(lo, la); let k = 0; for (let i = 0; i < n * 5 && k < n * 1.6; i++) { const a = pr() * 6.28, d = Math.sqrt(pr()) * rad; if (placeHouse(cx + Math.cos(a) * d, cz + Math.sin(a) * d)) k++; } }
  for (const c of land) if (!c.near && c.h > 1 && c.h < 6 && pr() < 0.025) placeHouse(c.x + (pr() - 0.5) * 0.6, c.z + (pr() - 0.5) * 0.6);
  const propMesh = new THREE.InstancedMesh(unit, new THREE.MeshLambertMaterial({ color: 0xffffff }), props.length); propMesh.castShadow = true; propMesh.receiveShadow = true;
  props.forEach((p, i) => { qq.setFromEuler(euler.set(0, p.ry, 0)); v3.set(p.x, p.y, p.z); s3.set(p.sx, p.sy, p.sz); m4.compose(v3, qq, s3); propMesh.setMatrixAt(i, m4); propMesh.setColorAt(i, hex(p.c)); });
  scene.add(propMesh);

  // El Yunque wears a cloud
  const peak = H.get(key(Math.round(LUQ[0]), Math.round(LUQ[1]))), mistMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32, depthWrite: false });
  const mist = [], mr = rng(41);
  for (let i = 0; i < 26; i++) mist.push({ x: LUQ[0] + (mr() - 0.5) * 9, z: LUQ[1] + (mr() - 0.5) * 6, y: (peak ? peak.h : 8) + 0.8 + mr() * 1.8, sx: 2 + mr() * 3.5, sz: 1.4 + mr() * 2.4, ph: mr() * 6.28 });
  const mistMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.22, 1), mistMat, mist.length); scene.add(mistMesh);
  const writeMist = t => { mist.forEach((m, i) => { v3.set(m.x + Math.sin(t * 0.05 + m.ph) * 1.6, m.y + Math.sin(t * 0.11 + m.ph) * 0.15, m.z); s3.set(m.sx, 1, m.sz); m4.compose(v3, q0, s3); mistMesh.setMatrixAt(i, m4); }); mistMesh.instanceMatrix.needsUpdate = true; };
  writeMist(0);
  // it is always raining somewhere over El Yunque: heavier, then lighter, never gone
  const rain = [], rr = rng(83), RAIN_TOP = (peak ? peak.h : 8) + 5;
  for (let i = 0; i < 320; i++) { const a = rr() * 6.28, d = Math.sqrt(rr()) * 6.5, x = LUQ[0] + Math.cos(a) * d, z = LUQ[1] + Math.sin(a) * d * 0.75, c = H.get(key(Math.round(x), Math.round(z)));
    rain.push({ x, z, floor: c ? c.h : 0.2, ph: rr(), sp: 0.8 + rr() * 0.5 }); }
  const rainMat = new THREE.MeshBasicMaterial({ color: 0xdfe6f2, transparent: true, opacity: 0, depthWrite: false });
  const rainMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 0.7, 0.035), rainMat, rain.length); rainMesh.frustumCulled = false; scene.add(rainMesh);
  const writeRain = t => { rain.forEach((d, i) => { const span = RAIN_TOP - d.floor, k = (d.ph + t * 0.55 * d.sp) % 1; v3.set(d.x, RAIN_TOP - k * span, d.z); s3.set(1, 1, 1); m4.compose(v3, q0, s3); rainMesh.setMatrixAt(i, m4); }); rainMesh.instanceMatrix.needsUpdate = true; };
  const shower = t => 0.78 + 0.22 * Math.sin(t * 0.09); let rainStill = false;

  // sea: a little see-through, so the reef shows turquoise
  const seaMat = new THREE.MeshLambertMaterial({ color: 0x2f8ac3, transparent: true, opacity: 0.78 });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), seaMat); sea.rotation.x = -Math.PI / 2; sea.position.y = 0.02; sea.receiveShadow = true; scene.add(sea);

  // surf along the coast
  const coastCells = shallow.filter(c => c.d < 1.3), surf = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.06, 0.7), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }), coastCells.length);
  scene.add(surf); const surfMat = surf.material;
  // town lights at night
  const lightsAt = [], lr = rng(5);
  for (const [lo, la, n, rad] of TOWNS) { const [cx, cz] = proj(lo, la); let k = 0;
    for (let i = 0; i < n * 6 && k < n * 2; i++) { const a = lr() * 6.28, d = Math.sqrt(lr()) * rad, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, c = H.get(key(Math.round(x), Math.round(z)));
      if (c && c.land && !c.paved) { lightsAt.push({ x, z, y: c.h + 0.12 }); k++; } } }
  for (const s of Object.values(LANDMARKS)) { const r = plans[s.id].ext * TU * 0.9 + 0.4; for (let a = 0; a < 6.28; a += 0.32) lightsAt.push({ x: s.pos.x + Math.cos(a) * r, z: s.pos.z + Math.sin(a) * r, y: s.pos.y + 0.18, small: true }); }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffcf8a, transparent: true, opacity: 0, fog: false });
  const lights = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), lightMat, lightsAt.length);
  // sized for the whole island; up close they shrink to window-light size instead of glowing squares
  let lightScale = 0; const writeLights = k => { lightScale = k; lightsAt.forEach((p, i) => { v3.set(p.x, p.y, p.z); s3.setScalar((p.small ? 0.5 : 1) * k); m4.compose(v3, q0, s3); lights.setMatrixAt(i, m4); }); lights.instanceMatrix.needsUpdate = true; };
  writeLights(1); scene.add(lights);
  // the bioluminescent bays: Mosquito Bay (Vieques), La Parguera, Laguna Grande (Fajardo)
  const BAYS = [[-65.44, 18.09], [-67.05, 17.92], [-65.62, 18.36]], bio = [], br = rng(29);
  for (const [lo, la] of BAYS) { const [bx, bz] = proj(lo, la);
    for (let i = 0; i < 120; i++) { const a = br() * 6.28, d = Math.sqrt(br()) * 3.2, x = bx + Math.cos(a) * d, z = bz + Math.sin(a) * d;
      if (!inside(x, z)) bio.push({ x, z, ph: br() * 6.28, s: 0.25 + br() * 0.4 }); } }
  const bioMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, fog: false, blending: THREE.AdditiveBlending, depthWrite: false });
  const bioMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.04, 1), bioMat, bio.length); scene.add(bioMesh);
  bio.forEach((b, i) => { v3.set(b.x, 0.1, b.z); s3.set(b.s, 1, b.s); m4.compose(v3, q0, s3); bioMesh.setMatrixAt(i, m4); bioMesh.setColorAt(i, hex('#4ff3ff')); });
  const BIO = C('#4ff3ff'), bc = new THREE.Color();
  const writeBio = t => { bio.forEach((b, i) => { bc.copy(BIO).multiplyScalar(0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.7 + b.ph))); bioMesh.setColorAt(i, bc); }); bioMesh.instanceColor.needsUpdate = true; };

  // buildings
  const box = new THREE.BoxGeometry(TU, TU, TU), temples = {};
  for (const s of Object.values(SITES)) temples[s.id] = new Temple(s, plans[s.id], scene, box);
  for (const s of Object.values(LANDMARKS)) { temples[s.id] = new Temple(s, plans[s.id], scene, box); temples[s.id].setVisible(true); }

  // two cotorras puertorriqueñas circling El Yunque. They fly in pairs.
  const CT = 0.11, birds = [];   // small: a cotorra is a 30 cm parrot, seen from far off
  function cotorra() {
    const g = new THREE.Group(), parts = { body: [], L: [], R: [] }, add = (arr, x, y, z, c) => arr.push([x, y, z, c]);
    for (let x = -1; x <= 5; x++) for (let y = 0; y <= 2; y++) for (let z = -1; z <= 1; z++) if (((x - 2) / 3.6) ** 2 + ((y - 1) / 1.5) ** 2 + (z / 1.5) ** 2 <= 1.05) add(parts.body, x, y, z, y === 0 ? '#58b85a' : '#2f9e44');
    for (let x = 5; x <= 7; x++) for (let y = 1; y <= 3; y++) for (let z = -1; z <= 1; z++) add(parts.body, x, y, z, y === 3 && x >= 6 ? '#d62828' : '#2f9e44');
    add(parts.body, 8, 2, 0, '#e9dcc3'); add(parts.body, 8, 1, 0, '#cbbfa6'); add(parts.body, 7, 2, 1, '#f4f1ea'); add(parts.body, 7, 2, -1, '#f4f1ea');
    for (let x = -4; x <= -2; x++) add(parts.body, x, 1, 0, x === -4 ? '#2851a3' : '#2f9e44');
    for (let x = 0; x <= 4; x++) for (let z = 1; z <= 6; z++) if (x <= 4 - Math.floor(z / 3)) { add(parts.L, x, 0, z, z >= 5 ? '#2851a3' : '#2f9e44'); add(parts.R, x, 0, -z, z >= 5 ? '#2851a3' : '#2f9e44'); }
    const mk = list => { const m = new THREE.InstancedMesh(new THREE.BoxGeometry(CT, CT, CT), new THREE.MeshLambertMaterial({ color: 0xffffff }), list.length), o = new THREE.Object3D();
      list.forEach(([x, y, z, c], i) => { o.position.set(x * CT, y * CT, z * CT); o.updateMatrix(); m.setMatrixAt(i, o.matrix); m.setColorAt(i, hex(c)); }); m.castShadow = true; return m; };
    const L = new THREE.Group(), R = new THREE.Group(); L.position.set(0, 1.6 * CT, 1.2 * CT); R.position.set(0, 1.6 * CT, -1.2 * CT);
    L.add(mk(parts.L.map(([x, y, z, c]) => [x, y, z - 1, c]))); R.add(mk(parts.R.map(([x, y, z, c]) => [x, y, z + 1, c])));
    g.add(mk(parts.body), L, R); scene.add(g); return { g, L, R };
  }
  const nestY = (peak ? peak.h : 8) + 3.2;
  for (let i = 0; i < 2; i++) birds.push(Object.assign(cotorra(), { a0: i * 0.32, r: 5.6 + i * 0.7 }));
  const writeBirds = t => birds.forEach(b => {
    const a = b.a0 + t * 0.22, px = LUQ[0] + Math.cos(a) * b.r, pz = LUQ[1] + Math.sin(a) * b.r * 0.8, dx = -Math.sin(a), dz = Math.cos(a) * 0.8;
    b.g.position.set(px, nestY + Math.sin(t * 0.7 + b.a0 * 5) * 0.6, pz); b.g.rotation.set(0, Math.atan2(-dz, dx), -0.25);
    const f = Math.sin(t * 8 + b.a0 * 9) * 0.65; b.L.rotation.x = -f; b.R.rotation.x = f; });
  writeBirds(0);
  const chapterIds = [...document.querySelectorAll('[data-cam]')].map(el => el.dataset.cam);
  for (const tp of Object.values(temples)) tp.kf = chapterIds.indexOf(tp.site.id);

  /* ---------- chapters: where the camera goes, what time it is ---------- */
  // the night tour at the end: San Juan, El Yunque, Vieques' glowing bay, Ponce, La Parguera, Rincón, then the whole island to spin
  const TOUR = [
    // every camera sits out at sea, looking back at the coast
    { ll: [-66.07, 18.44], az: 3.14, el: 0.42, dist: 30 }, { ll: [-65.84, 18.405], az: 2.8, el: 0.36, dist: 13 },
    { ll: [-65.80, 18.30], az: 2.3, el: 0.42, dist: 34 }, { ll: [-65.44, 18.10], az: 1.2, el: 0.55, dist: 28 },
    { ll: [-66.614, 18.012], az: 0, el: 0.34, dist: 16 }, { ll: [-67.05, 17.95], az: -0.8, el: 0.5, dist: 26 },
    { ll: [-67.17, 18.33], az: -1.57, el: 0.42, dist: 30 }, { ll: [-66.387, 18.42], az: -3.0, el: 0.32, dist: 15 },
    innerWidth < innerHeight ? { ll: [-66.28, 18.2], az: 0, el: 1.25, dist: 340, wide: true } : { ll: [-66.28, 18.2], az: 0, el: 0.85, dist: 205, wide: true }   /* the whole island, north up like a map; a phone backs off to fit its width */];
  const chapters = [...document.querySelectorAll('[data-cam]')];
  const KF = chapters.map(el => {
    const id = el.dataset.cam, side = el.dataset.side || 'none', tod = +el.dataset.tod;
    const shift = side === 'left' ? 0.17 : side === 'right' ? -0.17 : 0;
    if (SITES[id]) { const s = SITES[id], big = s.kind === 'barrio';
      return { id, temple: temples[id], target: s.pos.clone().add(new THREE.Vector3(0, temples[id].P.roofTop * TU * 0.42, 0)), az: s.yaw + (+el.dataset.az || 0.45), el: +el.dataset.el || 0.4, dist: +el.dataset.dist || (big ? 30 : 23), shift, vs: 0.04, tod }; }
    if (id === 'hero') return { id, target: new THREE.Vector3(8, 0, 2), az: 0, el: 1.25, dist: 215, shift: 0.18, vs: 0.1, tod };   // from above, north up: a map
    if (id === 'tour') { const T = TOUR[+el.dataset.tour] || TOUR[0], [tx, tz] = proj(T.ll[0], T.ll[1]), c = H.get(key(Math.round(tx), Math.round(tz)));
      return { id, target: new THREE.Vector3(tx, (c && c.land ? c.h : 0) + 0.6, tz), az: T.az, el: T.el, dist: T.dist, shift: 0, vs: T.wide ? -0.06 : 0.02, tod: 1, tour: true }; }
    if (id === 'about') { const [ax, az2] = proj(-65.9, 18.27); return { id, target: new THREE.Vector3(ax, 2, az2), az: 0.35, el: 0.3, dist: 70, shift, vs: 0.06, tod }; }
    return { id, target: new THREE.Vector3(10, 1, 2), az: 0.42, el: 0.42, dist: 135, shift: 0, vs: 0.18, tod };
  });

  function fAt() {
    const vc = scrollY + innerHeight / 2, cs = chapters.map(c => { const r = c.getBoundingClientRect(); return r.top + scrollY + r.height / 2; });
    if (vc <= cs[0]) return 0; if (vc >= cs[cs.length - 1]) return cs.length - 1;
    let i = 0; while (i < cs.length - 2 && vc > cs[i + 1]) i++;
    const t = clamp((vc - cs[i]) / (cs[i + 1] - cs[i])); return i + smooth(clamp((t - 0.08) / 0.84));
  }
  let fTarget = fAt(), fCam = fTarget, dragYaw = 0; const TOUR_AT = KF.findIndex(k => k.tour);
  const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3();
  function pose(f) {
    const i = Math.min(Math.floor(f), KF.length - 2), k = f - i, a = KF[i], b = KF[Math.min(i + 1, KF.length - 1)];
    camTgt.copy(a.target).lerp(b.target, k);
    const gap = a.target.distanceTo(b.target), far = a.tour && b.tour ? 70 : 30, bump = Math.sin(Math.PI * k) * clamp(gap / far);
    let daz = b.az - a.az; while (daz > Math.PI) daz -= 2 * Math.PI; while (daz < -Math.PI) daz += 2 * Math.PI;
    const az = a.az + daz * k + dragYaw, el = Math.min(1.35, lerp(a.el, b.el, k) + bump * 0.32), dist = lerp(a.dist, b.dist, k) * (1 + bump * (a.tour && b.tour ? 1.1 : 1.6));
    const asp = innerWidth / innerHeight, fit = asp < 1 ? 1 / Math.max(0.55, asp * 1.15) : 1;
    camPos.set(camTgt.x + Math.sin(az) * Math.cos(el) * dist * fit, camTgt.y + Math.sin(el) * dist * fit, camTgt.z + Math.cos(az) * Math.cos(el) * dist * fit);
    return { shift: lerp(a.shift, b.shift, k), vs: lerp(a.vs, b.vs, k), tod: lerp(a.tod, b.tod, k), dist: dist * fit };
  }

  /* ---------- input ---------- */
  const mouse = new THREE.Vector2(9, 9), ray = new THREE.Raycaster(); let hovering = false, down = false, lx = 0, ly = 0, sx0 = 0, sy0 = 0, moved = 0, sideways = false;
  const EXP = { on: false, k: 0, yaw: 0, el: 0.9, dist: 165, gy: 0, ge: 0.9, gd: 165, vy: 0, ve: 0, px: 0, pz: 0, lt: 0, tgt: new THREE.Vector3(), goal: new THREE.Vector3(), tod: 1, todNow: 1 }, pts = new Map(); let pinch0 = 0, dragGoal = 0, turning = false, turnMode = false, twist0 = 0, mid0 = null, lastTouch = false;
  const atEnd = () => KF.length - 1 - fCam < 0.35;   // arrived at the whole island: from here the island is yours

  // names for the places you point at: the buildings first, then the towns, then the sea around them
  const PLACES = [['San Juan', -66.07, 18.45], ['Carolina', -65.96, 18.38], ['Bayamón', -66.16, 18.39], ['Guaynabo', -66.11, 18.36], ['Caguas', -66.04, 18.23],
    ['Loíza', -65.88, 18.43], ['Río Grande', -65.83, 18.38], ['Luquillo', -65.72, 18.37], ['Fajardo', -65.65, 18.33], ['El Yunque', -65.79, 18.30], ['Naguabo', -65.74, 18.21],
    ['Humacao', -65.83, 18.15], ['Yabucoa', -65.88, 18.05], ['Guayama', -66.11, 17.98], ['Salinas', -66.30, 17.98], ['Coamo', -66.36, 18.08], ['Ponce', -66.61, 18.01],
    ['Yauco', -66.85, 18.03], ['Guánica', -66.91, 17.97], ['La Parguera', -67.05, 17.97], ['Cabo Rojo', -67.15, 18.09], ['San Germán', -67.04, 18.08], ['Mayagüez', -67.14, 18.20],
    ['Rincón', -67.25, 18.34], ['Aguadilla', -67.15, 18.43], ['Isabela', -67.02, 18.50], ['Arecibo', -66.72, 18.47], ['Manatí', -66.49, 18.43], ['Vega Baja', -66.39, 18.44],
    ['Dorado', -66.27, 18.46], ['Utuado', -66.70, 18.27], ['Jayuya', -66.59, 18.22], ['Adjuntas', -66.72, 18.16], ['Lares', -66.88, 18.30], ['Orocovis', -66.39, 18.23],
    ['Barranquitas', -66.31, 18.19], ['Aibonito', -66.26, 18.14], ['Cayey', -66.17, 18.11], ['Ciales', -66.47, 18.34], ['Vieques', -65.44, 18.13], ['Culebra', -65.29, 18.31]]
    .map(([n, lo, la]) => { const [x, z] = proj(lo, la); return { n, x, z }; });
  const SITE_NAMES = { careeros: ['CareerOS · the barrio', 'CareerOS · el barrio'], pantry: ['Food Pantry · the colmado', 'Food Pantry · el colmado'],
    xpt: ['XPT OS · the sugar mill', 'XPT OS · el central'], webos: ['Web OS · the rebar house', 'Web OS · la casa con varillas'], elias: ['ELiaS · after María', 'ELiaS · después de María'],
    brain: ['2nd Brain OS · Arecibo', '2nd Brain OS · Arecibo'], cowork: ['Claude Cowork Skills · the kiosko', 'Claude Cowork Skills · el kiosko'] };
  const ptr = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP = new THREE.Vector3();
  function groundAt(cx, cy) {   // where on the island a screen point lands: step a flat plane to the ground height twice
    ptr.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1); ray.setFromCamera(ptr, camera); let y = 1.5;
    for (let i = 0; i < 3; i++) { plane.constant = -y; if (!ray.ray.intersectPlane(plane, hitP)) return null; const c = H.get(key(Math.round(hitP.x), Math.round(hitP.z))); y = c && c.land ? c.h : 0.05; }
    return hitP.clone();
  }
  function placeAt(pt) {
    for (const st of Object.values(LANDMARKS)) if (Math.hypot(pt.x - st.pos.x, pt.z - st.pos.z) < 5) return { name: st.name[ES() ? 1 : 0], site: st };
    for (const st of Object.values(SITES)) if (Math.hypot(pt.x - st.pos.x, pt.z - st.pos.z) < 5) return { name: SITE_NAMES[st.id][ES() ? 1 : 0], site: st };
    const c = H.get(key(Math.round(pt.x), Math.round(pt.z)));
    if (c && c.land) { let best = null, bd = 14; for (const pl of PLACES) { const d = Math.hypot(pt.x - pl.x, pt.z - pl.z); if (d < bd) { bd = d; best = pl; } } return best ? { name: best.n } : null; }
    return { name: LAT0 - pt.z / S > 18.25 ? (ES() ? 'Océano Atlántico' : 'Atlantic Ocean') : (ES() ? 'Mar Caribe' : 'Caribbean Sea'), sea: true };
  }
  // what things are, in a sentence or two: [title, text] in English, then Spanish
  const TOPICS = {
    coqui: [['Coquí', 'A frog no bigger than a thumbnail, found in the wild only in Puerto Rico. At night the males sing their own name: co-quí. Turn on Coquíes to hear a real one.'],
      ['Coquí', 'Una rana del tamaño de una uña que en estado silvestre solo vive en Puerto Rico. De noche los machos cantan su propio nombre: co-quí. Prende Coquíes para escuchar uno de verdad.']],
    cotorra: [['Cotorra puertorriqueña', 'The Puerto Rican parrot: green, a red forehead, blue wings in flight, and found nowhere else on Earth. In 1975 only 13 were left in the wild; decades of care brought it back.'],
      ['Cotorra puertorriqueña', 'Verde, con la frente roja y alas azules al volar, y no existe en ningún otro lugar del mundo. En 1975 quedaban solo 13 en libertad; décadas de cuidado la trajeron de vuelta.']],
    flamboyan: [['Flamboyán', 'The flame tree. Every summer it covers the island in red and orange, a wide umbrella of shade over yards and roadsides. It came from Madagascar and became ours.'],
      ['Flamboyán', 'Cada verano cubre la isla de rojo y anaranjado, una sombrilla ancha de sombra sobre patios y carreteras. Vino de Madagascar y se hizo nuestro.']],
    benito: [['Benito · Bad Bunny', 'Benito Antonio Martínez Ocasio, from Vega Baja: Spotify\'s most-streamed artist in the world three years running. Here he is a jíbaro, the island\'s countryside farmer, in a straw pava, with the flag in its original light blue.'],
      ['Benito · Bad Bunny', 'Benito Antonio Martínez Ocasio, de Vega Baja: el artista más escuchado del mundo en Spotify tres años seguidos. Aquí es un jíbaro, el campesino de la isla, con su pava de paja y la bandera en su azul claro original.']],
    casita: [['La Casita · Vega Baja', 'A tribute to the pink house at the center of Bad Bunny\'s 2025 residency in San Juan: an everyday Puerto Rican home, white plastic chairs out front, plantains in the yard.'],
      ['La Casita · Vega Baja', 'Un homenaje a la casa rosada en el centro de la residencia de Bad Bunny en San Juan en 2025: una casa puertorriqueña de todos los días, sillas plásticas blancas al frente y plátanos en el patio.']],
    bomba: [['Bomba · Loíza', 'Puerto Rico\'s oldest living music, born among enslaved Africans on the sugar plantations. The dancer leads and the lead drum answers every move. Loíza is its heartland.'],
      ['Bomba · Loíza', 'La música viva más antigua de Puerto Rico, nacida entre africanos esclavizados en las haciendas de caña. La bailadora manda y el tambor primo le contesta cada movimiento. Loíza es su corazón.']],
    plena: [['Plena', 'Born in Ponce\'s working barrios in the early 1900s and called the sung newspaper: hand drums called panderos and a güiro, singing the news of the day. The Plena button plays a real one.'],
      ['Plena', 'Nació en los barrios obreros de Ponce a principios del 1900 y le dicen el periódico cantado: panderos y güiro, y las noticias del día cantadas. El botón Plena toca una de verdad.']],
    vejigante: [['Vejigante', 'The masked trickster of Puerto Rico\'s festivals, part devil, part Moor from the old Spanish stories. In Ponce the masks are papier-mâché bristling with horns; in Loíza, carved coconuts.'],
      ['Vejigante', 'El personaje enmascarado de las fiestas de Puerto Rico, mitad diablo, mitad moro de las viejas historias españolas. En Ponce las caretas son de papel maché llenas de cuernos; en Loíza, de coco tallado.']],
    parque: [['Parque de Bombas · Ponce', 'Built in 1882 for a fair, then Ponce\'s firehouse for more than a century, painted in the city\'s red and black. Today it is a museum.'],
      ['Parque de Bombas · Ponce', 'Construido en 1882 para una feria y luego estación de bomberos de Ponce por más de un siglo, pintado del rojo y negro de la ciudad. Hoy es un museo.']],
    yunque: [['El Yunque', 'The only tropical rainforest in the U.S. National Forest System. A shower most afternoons, and at night a chorus of coquíes.'],
      ['El Yunque', 'El único bosque tropical lluvioso del Sistema de Bosques Nacionales de EE. UU. Un aguacero casi todas las tardes y, de noche, un coro de coquíes.']],
    bahia: [['Bioluminescent bay', 'Tiny plankton glow blue when the water moves. Puerto Rico has three of these bays; Mosquito Bay in Vieques is one of the brightest in the world.'],
      ['Bahía bioluminiscente', 'Un plancton diminuto brilla en azul cuando el agua se mueve. Puerto Rico tiene tres de estas bahías; la Bahía Mosquito en Vieques es de las más brillantes del mundo.']],
  };
  const LANDMARK_TOPIC = { bombas: 'parque', loiza: 'bomba', casita: 'casita' };
  const PROJECT_LINES = {   // what each building's condition says about its project
    careeros: ['A hillside barrio, every house finished and lived in: the system runs every day.', 'Un barrio en la loma, cada casa terminada y habitada: el sistema corre todos los días.'],
    pantry: ['The corner store, open for business: a complete, live demo.', 'El colmado, abierto: un demo completo y en vivo.'],
    xpt: ['An old sugar mill whose machinery ran every week, June to September: 41 emails out, 4 replies back.', 'Un viejo central cuya maquinaria corrió todas las semanas, de junio a septiembre: 41 emails enviados, 4 respuestas.'],
    webos: ['Rebar on the roof for the second floor: version 1 is built and ran; version 2 is next.', 'Varillas en el techo para el segundo piso: la versión 1 está construida y corrió; la versión 2 es lo próximo.'],
    elias: ['A blue tarp after Hurricane María: it fell, and how it fell taught me how to build.', 'Un toldo azul después de María: se cayó, y cómo se cayó me enseñó a construir.'],
    brain: ['Arecibo: the dish still stands. The knowledge is live and growing; the platform above it was retired.', 'Arecibo: el plato sigue en pie. El conocimiento está activo y creciendo; la plataforma de arriba se retiró.'],
    cowork: ['A beach kiosko in Rincón, lights on at sunset: live and for sale in English and Spanish.', 'Un kiosko de playa en Rincón con las luces prendidas al atardecer: a la venta en inglés y en español.'],
  };
  const BAYS_XZ = BAYS.map(([lo, la]) => proj(lo, la));
  const pickList = [...Object.values(temples).map(t => t.mesh), propMesh];
  // what is under a screen point: a cotorra, a tagged block, a building, an island flamboyán, El Yunque, a glowing bay, or just ground
  function pick(cx, cy) {
    ptr.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1); ray.setFromCamera(ptr, camera);
    for (const b of birds) if (ray.ray.distanceToPoint(b.g.position) < 0.35 + camera.position.distanceTo(b.g.position) * 0.015) return { topic: 'cotorra', pos: b.g.position.clone() };
    for (const h of ray.intersectObjects(pickList, false)) {
      if (h.object === propMesh) { const k = props[h.instanceId] && props[h.instanceId].kind; if (k) return { topic: k, pos: h.point }; break; }   // a house or a tree in the way
      const tp = h.object.userData.temple; if (!tp || !tp.shown) continue;
      const b = tp.P.solid[h.instanceId], id = tp.site.id;
      if (b && b.tag) return { topic: b.tag, pos: h.point, site: tp.site };
      return LANDMARKS[id] ? { topic: LANDMARK_TOPIC[id], pos: h.point, site: tp.site } : { project: id, pos: h.point, site: tp.site };
    }
    const pt = groundAt(cx, cy); if (!pt) return null;
    if (!inside(pt.x, pt.z) && BAYS_XZ.some(([bx, bz]) => Math.hypot(pt.x - bx, pt.z - bz) < 3.4)) return { topic: 'bahia', pos: pt };
    if (inside(pt.x, pt.z) && Math.hypot(pt.x - LUQ[0], pt.z - LUQ[1]) < 6.5) return { topic: 'yunque', pos: pt };
    return { pt };
  }
  const tip = document.querySelector('.place-tip'); let tipTimer = 0, tipHeld = 0;
  function showTip(title, text, sub, x, y, above, sheet) {
    if (!tip) return; if (!title) { tip.hidden = true; return; }
    tip.classList.toggle('sheet', !!sheet);   // on a phone the answer sits at the top of the screen, clear of your finger
    const [tb, tp, ts] = [tip.querySelector('b'), tip.querySelector('p'), tip.querySelector('span')];
    tb.textContent = title; tp.textContent = text || ''; tp.hidden = !text; ts.textContent = sub || ''; ts.hidden = !sub; tip.hidden = false;
    const r = tip.getBoundingClientRect();
    const tx = above ? clamp(x - r.width / 2, 8, innerWidth - r.width - 8) : clamp(x + 14, 8, innerWidth - r.width - 8), ty = above ? clamp(y - r.height - 12, 8, innerHeight - r.height - 8) : clamp(y + 14 + r.height > innerHeight - 8 ? y - r.height - 14 : y + 14, 8, innerHeight - r.height - 8);
    tip.style.transform = `translate(${tx}px, ${ty}px)`;
  }
  function tipFor(th, x, y, sub, sheet) {
    const L = ES() ? 1 : 0;
    if (th.topic) { const [t, d] = TOPICS[th.topic][L]; showTip(t, d, sub, x, y, false, sheet); }
    else showTip(SITE_NAMES[th.project][L], PROJECT_LINES[th.project][L], sub, x, y, false, sheet);
  }
  const holdTip = ms => { tipHeld = performance.now() + ms; clearTimeout(tipTimer); tipTimer = setTimeout(() => { if (tip) tip.hidden = true; }, ms); };
  let hoverQ = null;   // at most ~25 looks a second, however fast the mouse moves
  function hoverAt(x, y) {
    const first = !hoverQ; hoverQ = [x, y]; if (!first) return;
    setTimeout(() => { const [hx, hy] = hoverQ; hoverQ = null; if (down || performance.now() < tipHeld) return;
      const th = pick(hx, hy), roam = EXP.on || atEnd(), go = ES() ? 'clic para ir' : 'click to go';
      if (th && (th.topic || th.project)) { tipFor(th, hx, hy, roam ? go : th.project ? (ES() ? 'clic para ver el proyecto' : 'click to see the project') : ''); canvas.style.cursor = 'pointer'; return; }
      canvas.style.cursor = '';
      const place = roam && th && th.pt && placeAt(th.pt);
      if (place && !place.sea) showTip(place.name, '', go, hx, hy); else if (place) showTip(place.name, '', '', hx, hy); else if (tip) tip.hidden = true;
    }, 40);
  }
  // the two sound buttons say what they play
  for (const [sel, topic] of [['.sound', 'coqui'], ['.drums', 'plena']]) { const b = document.querySelector(sel); if (!b) continue;
    b.addEventListener('mouseenter', () => { const r = b.getBoundingClientRect(), [t, d] = TOPICS[topic][ES() ? 1 : 0]; showTip(t, d, '', r.left + r.width / 2, r.top, true); });
    b.addEventListener('mouseleave', () => { if (tip) tip.hidden = true; });
    b.addEventListener('pointerup', e => { if (e.pointerType === 'mouse' || b.getAttribute('aria-pressed') === 'true') return;   // a phone turning it on hears what it is
      const [t, d] = TOPICS[topic][ES() ? 1 : 0]; showTip(t, d, '', 0, 0, false, true); holdTip(7000); }); }
  function flyTo(pt, place) { if (!EXP.on) explore(true); EXP.goal.copy(pt); if (place && place.site) EXP.goal.y += 1; EXP.gd = clamp(Math.min(EXP.gd, place && place.site ? (LANDMARKS[place.site.id] ? 13 : 26) : 42), 6, 320); kick(); }

  // like a map: dragging slides the island; the spot you grabbed stays under your finger
  const panPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), pa = new THREE.Vector3(), pb = new THREE.Vector3();
  const onPlane = (cx, cy, out) => { ptr.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1); ray.setFromCamera(ptr, camera); panPlane.constant = -EXP.goal.y; return ray.ray.intersectPlane(panPlane, out); };
  function panBy(x0, y0, x1, y1, dts) {
    if (!onPlane(x0, y0, pa) || !onPlane(x1, y1, pb)) return;
    let dx = pa.x - pb.x, dz = pa.z - pb.z; const m = Math.hypot(dx, dz), cap = EXP.dist * 0.4; if (m > cap) { dx *= cap / m; dz *= cap / m; }   // near the horizon, don't fling
    const nx = clamp(EXP.goal.x + dx, -70, 100), nz = clamp(EXP.goal.z + dz, -36, 36); dx = nx - EXP.goal.x; dz = nz - EXP.goal.z;
    EXP.goal.x += dx; EXP.goal.z += dz; EXP.tgt.x += dx; EXP.tgt.z += dz;
    if (dts) { EXP.px = lerp(EXP.px, dx / dts, 0.35); EXP.pz = lerp(EXP.pz, dz / dts, 0.35); }
  }
  canvas.addEventListener('contextmenu', e => { if (EXP.on || atEnd()) e.preventDefault(); });   // right-drag turns the island
  canvas.addEventListener('pointermove', e => {
    mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); hovering = e.pointerType === 'mouse';
    if (EXP.on && pts.has(e.pointerId)) { pts.set(e.pointerId, [e.clientX, e.clientY]);
      const now = performance.now(), dts = Math.max(0.008, (now - (EXP.lt || now)) / 1000); EXP.lt = now;
      if (pts.size >= 2) {   // two fingers: pinch to zoom, twist to turn, slide together to move
        const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]), mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        if (pinch0) { EXP.gd = clamp(EXP.gd * pinch0 / d, 6, 320); let da = ang - twist0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; EXP.gy += da; }
        if (mid0) panBy(mid0[0], mid0[1], mid[0], mid[1]);
        pinch0 = d; twist0 = ang; mid0 = mid; moved += 99; EXP.vy = EXP.ve = EXP.px = EXP.pz = 0; }
      else if (turning) {   // right-drag (or shift-drag): turn and tilt
        const dx = e.clientX - lx, dy = e.clientY - ly, dyaw = -dx * 0.006, del = dy * 0.004;
        moved += Math.abs(dx) + Math.abs(dy); EXP.gy += dyaw; EXP.ge = clamp(EXP.ge + del, 0.12, 1.45);
        EXP.vy = clamp(lerp(EXP.vy, dyaw / dts, 0.35), -5, 5); EXP.ve = clamp(lerp(EXP.ve, del / dts, 0.35), -3, 3); }
      else { moved += Math.abs(e.clientX - lx) + Math.abs(e.clientY - ly); panBy(lx, ly, e.clientX, e.clientY, dts); }
      lx = e.clientX; ly = e.clientY; if (tip) tip.hidden = true; kick(); return; }
    if (down) { const dx = e.clientX - lx; lx = e.clientX; ly = e.clientY;
      if (!sideways && Math.abs(e.clientX - sx0) > 10 && Math.abs(e.clientX - sx0) > Math.abs(e.clientY - sy0) * 1.5) sideways = true;
      const far = Math.abs(e.clientX - sx0) + Math.abs(e.clientY - sy0) > 6;
      // at the end, turning the island hands it to you: it stays wherever you leave it
      if (atEnd() && (e.pointerType === 'mouse' ? far : sideways)) { explore(true); pts.set(e.pointerId, [e.clientX, e.clientY]); moved = 99; try { canvas.setPointerCapture(e.pointerId); } catch (x) {} kick(); return; }
      if (sideways || e.pointerType === 'mouse') { moved += Math.abs(dx); dragGoal += dx * 0.004; } }
    else if (e.pointerType === 'mouse') hoverAt(e.clientX, e.clientY);
    kick(); });
  canvas.addEventListener('pointerdown', e => { down = true; lx = sx0 = e.clientX; ly = sy0 = e.clientY; moved = 0; sideways = false; EXP.vy = EXP.ve = EXP.px = EXP.pz = 0; EXP.lt = performance.now();
    lastTouch = e.pointerType !== 'mouse';
    turning = turnMode || (e.pointerType === 'mouse' && (e.button === 2 || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey));   // the Turn button, or right-drag
    pts.set(e.pointerId, [e.clientX, e.clientY]); pinch0 = 0; mid0 = null;
    if (pts.size >= 2 && atEnd() && !EXP.on) explore(true);   // two fingers at the end: pinch to zoom
    if (EXP.on) { moved = pts.size >= 2 ? 99 : moved; try { canvas.setPointerCapture(e.pointerId); } catch (x) {} } });
  const letGo = e => { pts.delete(e.pointerId); pinch0 = 0; mid0 = null; if (!down) return;
    if (pts.size === 0) { down = false; sideways = false; if (performance.now() - EXP.lt > 90 || CALM) EXP.vy = EXP.ve = EXP.px = EXP.pz = 0; }   // held still before letting go: no glide
    else { EXP.vy = EXP.ve = EXP.px = EXP.pz = 0; const [q] = [...pts.values()]; lx = q[0]; ly = q[1]; }   // one finger left: carry on from it
    kick(); };
  addEventListener('pointercancel', letGo);
  addEventListener('pointerup', e => { const wasDown = down, touch = e.pointerType !== 'mouse'; letGo(e); if (!wasDown || moved >= (touch ? 12 : 6) || e.target !== canvas || pts.size) return;
    const th = pick(e.clientX, e.clientY), about = th && (th.topic || th.project), stay = touch ? 9000 : 5000;
    if (EXP.on || atEnd()) {   // a click or tap explains the thing, or names the place, and takes you there
      const pt = groundAt(e.clientX, e.clientY), place = pt && placeAt(pt);
      if (about) { tipFor(th, e.clientX, e.clientY, '', touch); flyTo(th.site ? th.site.pos.clone() : th.pos.clone(), th.site ? { site: th.site } : null); holdTip(stay); }
      else if (pt && place && !place.sea) { showTip(place.name, '', '', e.clientX, e.clientY, false, touch); flyTo(pt, place); holdTip(touch ? 3000 : 1800); }
      else if (tip) tip.hidden = true; }
    else if (th && th.project && !touch) { const card = document.querySelector('[data-cam="' + th.project + '"]');   // a project's building opens its card
      if (card) card.scrollIntoView({ behavior: CALM ? 'auto' : 'smooth', block: 'center' }); }
    else if (about) { tipFor(th, e.clientX, e.clientY, '', touch); holdTip(stay); }   // on a phone, a tap is the hover
    else if (tip) tip.hidden = true;
    kick(); });
  canvas.addEventListener('pointerleave', e => { if (e.pointerType !== 'mouse') return;   // a finger lifting also 'leaves': that must not hide what the tap just showed
    hovering = false; mouse.set(9, 9); if (tip) tip.hidden = true; });
  canvas.addEventListener('wheel', e => {
    if (!EXP.on) { if (!(atEnd() && e.ctrlKey)) return; explore(true); }   // a trackpad pinch at the end zooms too
    e.preventDefault(); EXP.gd = clamp(EXP.gd * Math.exp(clamp(e.deltaY, -60, 60) * (e.ctrlKey ? 0.01 : 0.0025)), 6, 320); kick(); }, { passive: false });
  // explore mode: the page steps aside and the island is yours
  const exploreBtn = document.querySelector('.explore-btn'), exitBtn = document.querySelector('.explore-done');
  function explore(on) {
    if (on === EXP.on) return; EXP.on = on; document.documentElement.classList.toggle('exploring', on);
    if (on) { EXP.tod = EXP.todNow = 1; dayLabel && dayBtn && dayLabel(); const asp = innerWidth / innerHeight, fit = asp < 1 ? 1 / Math.max(0.55, asp * 1.15) : 1, d = camPos.clone().sub(camTgt);
      EXP.dist = EXP.gd = d.length() / fit; EXP.el = EXP.ge = Math.asin(clamp(d.y / d.length(), -1, 1)); EXP.yaw = EXP.gy = Math.atan2(d.x, d.z); EXP.vy = EXP.ve = 0;
      EXP.px = EXP.pz = 0; EXP.tgt.copy(camTgt); EXP.goal.copy(camTgt); EXP.home = { yaw: EXP.yaw, el: EXP.el, dist: EXP.dist, tgt: camTgt.clone() }; }
    else { pts.clear(); down = false; if (tip) tip.hidden = true; }
    kick();
  }
  exploreBtn && exploreBtn.addEventListener('click', () => explore(true));
  exitBtn && exitBtn.addEventListener('click', () => explore(false));
  addEventListener('keydown', e => { if (e.key === 'Escape') explore(false); });
  document.querySelectorAll('.explore-zoom').forEach(b => b.addEventListener('click', () => { EXP.gd = clamp(EXP.gd * (b.dataset.z === 'in' ? 0.7 : 1.4), 6, 320); kick(); }));
  const dayBtn = document.querySelector('.explore-day'), dayLabel = () => { if (dayBtn) dayBtn.textContent = EXP.tod > 0.5 ? (ES() ? 'Día' : 'Day') : (ES() ? 'Noche' : 'Night'); };
  dayBtn && dayBtn.addEventListener('click', () => { EXP.tod = EXP.tod > 0.5 ? 0.45 : 1; dayLabel(); kick(); }); addEventListener('langchange', dayLabel); dayLabel();
  const turnBtn = document.querySelector('.explore-turn');   // Turn: one finger or the mouse rotates and tilts instead of moving
  turnBtn && turnBtn.addEventListener('click', () => { turnMode = !turnMode; turnBtn.setAttribute('aria-pressed', turnMode ? 'true' : 'false'); });
  const resetBtn = document.querySelector('.explore-reset');
  resetBtn && resetBtn.addEventListener('click', () => { if (EXP.home) { EXP.gy = EXP.home.yaw; EXP.ge = EXP.home.el; EXP.gd = EXP.home.dist; EXP.vy = EXP.ve = EXP.px = EXP.pz = 0; EXP.goal.copy(EXP.home.tgt); } kick(); });
  // ?look: a close-up camera for checking the details by eye (not linked anywhere)
  if (/[?&]look\b/.test(location.search)) window.__isla = { look(at, dist = 12, yaw = 0.6, el = 0.35, tod = 0.45) {
    const st = typeof at === 'string' ? (SITES[at] || LANDMARKS[at]).pos : new THREE.Vector3(at[0], at[1], at[2]);
    explore(true); EXP.goal.copy(st).add(new THREE.Vector3(0, 0.8, 0)); EXP.tgt.copy(EXP.goal); EXP.dist = EXP.gd = dist; EXP.yaw = EXP.gy = yaw; EXP.el = EXP.ge = el; EXP.tod = EXP.todNow = tod; kick(); },
    yunque: () => [LUQ[0], nestY, LUQ[1]], pick: (x, y) => { const t = pick(x, y); return t ? (t.topic || t.project || 'ground') : null; }, state: () => ({ dist: +EXP.dist.toFixed(2), gd: +EXP.gd.toFixed(2), yaw: +EXP.yaw.toFixed(3), gy: +EXP.gy.toFixed(3), rain: rainMesh.visible ? +rainMat.opacity.toFixed(2) : 0 }),
    building: id => ({ built: temples[id].built, animating: !!temples[id].anim }),
    pos: id => { const p = (SITES[id] || LANDMARKS[id]).pos; return [p.x, p.y, p.z]; },
    under: (x, y) => { const v = new THREE.Vector3(); return onPlane(x, y, v) ? [+v.x.toFixed(2), +v.z.toFixed(2)] : null; } };
  addEventListener('scroll', () => { fTarget = fAt(); kick(); }, { passive: true });
  addEventListener('resize', () => { resize(); fTarget = fAt(); kick(); });

  addEventListener('langchange', kick);

  function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
  resize();

  /* ---------- frame ---------- */
  const clock = new THREE.Clock(), sunDir = new THREE.Vector3(), pW = new THREE.Vector3(), pE = new THREE.Vector3(), pC = new THREE.Vector3();
  const [wx, wz] = proj(-67.27, 18.2), [ex, ez] = proj(-65.62, 18.2), [ccx, ccz] = proj(-66.445, 18.21);
  let raf = 0, first = true; const quality = { n: 0, m: 0, sum: 0, down: false };
  function kick() { if (!raf) { const t = clock.getElapsedTime(); if (t - (frame.last || 0) > 0.1) frame.last = t - 1 / 60; raf = requestAnimationFrame(frame); } }   // waking from rest: start from one calm frame
  function frame() {
    raf = 0; const t = clock.getElapsedTime(), dt = Math.min(0.1, t - (frame.last || t)); frame.last = t; LIVE.t = t;
    const prevF = fCam; fCam = fCam + (fTarget - fCam) * (1 - Math.exp(-dt * (MOTION ? 3.2 : 7))); if (Math.abs(fTarget - fCam) < 0.0005) fCam = fTarget;
    const ease = 1 - Math.exp(-dt * 9);
    if (!down) { dragGoal *= Math.exp(-dt * 3); if (Math.abs(dragGoal) < 0.0005) dragGoal = 0; }
    dragYaw += (dragGoal - dragYaw) * ease; if (Math.abs(dragYaw - dragGoal) < 0.0005) dragYaw = dragGoal;
    if (!pts.size && (EXP.px || EXP.pz)) { const ox = EXP.goal.x, oz = EXP.goal.z; EXP.goal.x = clamp(ox + EXP.px * dt, -70, 100); EXP.goal.z = clamp(oz + EXP.pz * dt, -36, 36);
      EXP.tgt.x += EXP.goal.x - ox; EXP.tgt.z += EXP.goal.z - oz; const f = Math.exp(-dt * 4); EXP.px *= f; EXP.pz *= f;
      if (Math.hypot(EXP.px, EXP.pz) < 0.05) EXP.px = EXP.pz = 0; }
    if (!pts.size && (EXP.vy || EXP.ve)) { EXP.gy += EXP.vy * dt; EXP.ge = clamp(EXP.ge + EXP.ve * dt, 0.12, 1.45); const f = Math.exp(-dt * 4.5); EXP.vy *= f; EXP.ve *= f;
      if (Math.abs(EXP.vy) < 0.004) EXP.vy = 0; if (Math.abs(EXP.ve) < 0.004) EXP.ve = 0; }
    const easing = Math.abs(EXP.gy - EXP.yaw) > 1e-4 || Math.abs(EXP.ge - EXP.el) > 1e-4 || Math.abs(EXP.gd / EXP.dist - 1) > 1e-4;
    if (easing) { EXP.yaw += (EXP.gy - EXP.yaw) * ease; EXP.el += (EXP.ge - EXP.el) * ease; EXP.dist *= Math.pow(EXP.gd / EXP.dist, ease); } else { EXP.yaw = EXP.gy; EXP.el = EXP.ge; EXP.dist = EXP.gd; }
    const P = pose(fCam);
    // explore mode blends in and out of the scroll camera, never jumps
    const ek = EXP.k; EXP.k = clamp(EXP.k + (EXP.on ? dt : -dt) * 1.6); const expMoving = EXP.k !== ek || EXP.tgt.distanceToSquared(EXP.goal) > 1e-4 || Math.abs(EXP.tod - EXP.todNow) > 0.002 || easing || EXP.vy !== 0 || EXP.ve !== 0 || EXP.px !== 0 || EXP.pz !== 0;
    if (EXP.k > 0) { EXP.tgt.lerp(EXP.goal, 1 - Math.exp(-dt * 4)); const asp = innerWidth / innerHeight, fit = asp < 1 ? 1 / Math.max(0.55, asp * 1.15) : 1, m = smooth(EXP.k);
      const ep = new THREE.Vector3(EXP.tgt.x + Math.sin(EXP.yaw) * Math.cos(EXP.el) * EXP.dist * fit, EXP.tgt.y + Math.sin(EXP.el) * EXP.dist * fit, EXP.tgt.z + Math.cos(EXP.yaw) * Math.cos(EXP.el) * EXP.dist * fit);
      EXP.todNow += (EXP.tod - EXP.todNow) * (1 - Math.exp(-dt * 2)); camPos.lerp(ep, m); camTgt.lerp(EXP.tgt, m); P.tod = lerp(P.tod, EXP.todNow, m); P.dist = lerp(P.dist, EXP.dist * fit, m); P.shift = lerp(P.shift, 0, m); P.vs = lerp(P.vs, 0, m); }
    camera.position.copy(camPos); camera.lookAt(camTgt);
    const w = innerWidth, h = innerHeight;
    camera.setViewOffset(w, h, w > 820 ? -w * P.shift : 0, w <= 820 ? (h * 0.2 - h * P.vs * 0.35) * (1 - smooth(EXP.k)) : -h * P.vs, w, h);   // exploring: the place you pick sits in the middle
    camera.updateMatrixWorld();
    // where the island sits on screen, so the map can land exactly on it
    const toScreen = v => { v.project(camera); return [(v.x + 1) / 2 * w, (1 - v.y) / 2 * h]; };
    const a = toScreen(pW.set(wx, 1, wz)), b = toScreen(pE.set(ex, 1, ez)), c = toScreen(pC.set(ccx, 1, ccz));
    LIVE.screen = { cx: c[0], cy: c[1], w: Math.hypot(b[0] - a[0], b[1] - a[1]) };

    // time of day
    const S = sky(clamp(P.tod)); sunDir.set(Math.cos(S.az) * Math.cos(S.el), Math.sin(S.el), Math.sin(S.az) * Math.cos(S.el));
    skyMat.uniforms.uTop.value.copy(S.top); skyMat.uniforms.uHor.value.copy(S.hor); scene.background = S.hor; skyMat.uniforms.sunCol.value.copy(S.sun); skyMat.uniforms.sunDir.value.copy(sunDir);
    skyMat.uniforms.sunVis.value = 1 - S.night; skyDome.position.copy(camera.position);
    scene.fog.color.copy(S.hor); scene.fog.near = P.dist * 0.9; scene.fog.far = P.dist * 3 + 60;
    hemi.color.copy(S.hs); hemi.groundColor.copy(S.hg); hemi.intensity = S.hi + 0.75 * S.night * (1 - clamp((P.dist - 18) / 45)); sun.color.copy(S.sun); sun.intensity = S.si;   // close up at night, the streetlights
    seaMat.color.copy(S.sea); lightMat.opacity = S.night; bioMat.opacity = S.night; surfMat.opacity = 0.55 * (1 - S.night * 0.65); mistMat.opacity = 0.32 * (1 - S.night * 0.75) * clamp((P.dist - 45) / 50);   // a cloud you see from afar, not one you sit in
    LIVE.night = S.night;
    if (S.night > 0.01) { const k = clamp(P.dist / 110, 0.2, 1); if (Math.abs(k - lightScale) > 0.04) writeLights(k); }
    document.documentElement.style.setProperty('--night', S.night.toFixed(3));
    // shadows follow what you're looking at
    const half = clamp(P.dist * 0.55, 6, 75); sun.target.position.copy(camTgt); sun.position.copy(camTgt).addScaledVector(sunDir, 120);
    const sc = sun.shadow.camera; if (sc.right !== half) { sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 1; sc.far = 260; sc.updateProjectionMatrix(); }

    // arrive -> build
    const near = Math.round(fCam), kf = KF[near];
    for (const k of KF) if (k.temple && !k.temple.built && Math.abs(KF.indexOf(k) - fCam) < 0.9) k.temple.build(t);
    // hover the building you're at
    let lifting = false; const active = kf && kf.temple && Math.abs(near - fCam) < 0.25 ? kf.temple : null;
    if (active) { let local = null;
      if (hovering && !active.anim) { ray.setFromCamera(mouse, camera); const hit = ray.intersectObject(active.mesh, false)[0];
        if (hit) { local = active.group.worldToLocal(hit.point.clone()).divideScalar(TU); local.y -= 0.5; } }
      lifting = active.hover(local, true); }
    let busy = lifting || Math.abs(fTarget - fCam) > 0.0005 || dragYaw !== 0 || dragGoal !== 0 || expMoving;
    for (const tp of Object.values(temples)) { if (tp.dirty || tp.anim) busy = tp.write(t) || busy; if (Math.abs(tp.kf - fCam) < 1.6 || !MOTION) tp.writeGlow(t, MOTION); }
    if (MOTION) { coastCells.forEach((c, i) => { const k = (Math.sin(t * 0.9 + c.x * 0.7 + c.z * 0.5) + 1) / 2; v3.set(c.x, 0.06 + k * 0.05, c.z); s3.set(0.6 + k * 0.5, 1, 0.6 + k * 0.5); m4.compose(v3, q0, s3); surf.setMatrixAt(i, m4); }); surf.instanceMatrix.needsUpdate = true;
      writeMist(t); writeBirds(t); if (S.night > 0.01) writeBio(t);
      }
    else if (first) { coastCells.forEach((c, i) => { v3.set(c.x, 0.08, c.z); s3.set(0.8, 1, 0.8); m4.compose(v3, q0, s3); surf.setMatrixAt(i, m4); }); surf.instanceMatrix.needsUpdate = true; writeBio(0); }

    {   // rain over El Yunque, seen from afar or up close; with motion off it hangs still instead of vanishing
      const dY = Math.hypot(camTgt.x - LUQ[0], camTgt.z - LUQ[1]), sh = (MOTION ? shower(t) : 0.85) * Math.max(clamp((P.dist - 45) / 40), clamp(1 - (dY - 4) / 4));
      rainMat.opacity = 0.55 * sh * (1 - S.night * 0.45); rainMesh.visible = sh > 0.02;
      if (rainMesh.visible && (MOTION || !rainStill)) { writeRain(MOTION ? t : 0); rainStill = !MOTION; } }
    if (MOBILE) { renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = (frame.n = (frame.n || 0) + 1) % 2 === 0 || !MOTION; }
    renderer.render(scene, camera);
    drawMap();
    // a device that can't keep up gets fewer pixels and no shadows, once, instead of a stutter
    if (MOTION && !first && !quality.down) { quality.n++; if (quality.n > 30) { quality.sum += dt; quality.m++;
      if (quality.m === 90) { if (quality.sum / quality.m > 1 / 24) { quality.down = true; renderer.setPixelRatio(1); sun.castShadow = false; resize(); } else { quality.m = 0; quality.sum = 0; } } } }
    if (first) { first = false; document.documentElement.classList.add('world-ready'); }
    // phones have no hover: the first time the night tour starts, say that a tap explains anything
    if (!frame.told && TOUR_AT >= 0 && fCam > TOUR_AT - 0.3 && !EXP.on && matchMedia('(hover: none)').matches) { frame.told = true;
      showTip(ES() ? 'Toca cualquier cosa' : 'Tap anything', ES() ? 'Toca cualquier cosa en la isla (un edificio, a Benito, una cotorra) para saber qué es.' : 'Tap anything on the island (a building, Benito, a cotorra) to learn what it is.', '', 0, 0, false, true); holdTip(5000); }
    if (MOTION || busy || prevF !== fCam) kick();
  }
  kick();
  return { kick };
}

/* ---------------- the opening: where Puerto Rico is ---------------- */
// A map of the region in blocks. Puerto Rico glows; scrolling dives the map into the island, which hands off to the 3D world.
const MAP = {
  US: [[-101, 33.5], [-81.2, 33.5], [-81.1, 32.0], [-81.4, 30.7], [-81.2, 29.5], [-80.5, 28.0], [-80.0, 26.8], [-80.1, 25.8], [-80.4, 25.2], [-81.1, 25.1], [-81.8, 26.1], [-82.7, 27.5], [-82.6, 28.5], [-83.0, 29.1], [-84.0, 30.0], [-85.4, 29.7], [-86.5, 30.4], [-88.0, 30.4], [-89.6, 30.2], [-89.4, 29.2], [-90.4, 29.1], [-92.0, 29.6], [-93.8, 29.7], [-95.0, 29.3], [-96.5, 28.3], [-97.4, 27.3], [-97.2, 25.95], [-101, 25.95]],
  MESO: [[-101, 25.95], [-97.2, 25.95], [-97.7, 24.0], [-97.8, 22.5], [-97.3, 21.0], [-96.3, 19.3], [-95.0, 18.6], [-94.0, 18.2], [-92.5, 18.6], [-91.2, 18.7], [-90.4, 19.9], [-90.3, 21.0], [-88.0, 21.6], [-86.8, 21.3], [-87.4, 20.0], [-87.6, 18.5], [-88.2, 17.6], [-88.3, 15.9], [-87.6, 15.8], [-86.0, 15.9], [-84.3, 15.8], [-83.2, 15.0], [-83.5, 12.5], [-83.7, 11.0], [-83.0, 10.0], [-81.6, 9.0], [-80.0, 9.3], [-78.8, 9.4], [-77.4, 8.6], [-76.8, 8.2], [-75.6, 9.4], [-75.2, 10.6], [-74.2, 11.2], [-73.0, 11.6], [-71.9, 12.4], [-71.3, 11.8], [-71.6, 11.0], [-70.2, 11.6], [-69.0, 11.4], [-67.9, 10.6], [-66.0, 10.6], [-64.2, 10.6], [-62.7, 10.7], [-61.9, 10.7], [-61.0, 10.1], [-60.0, 8.5], [-58.5, 7.2], [-55, 6.0], [-55, 2], [-78, 2], [-77.4, 6.5], [-77.9, 7.2], [-78.2, 8.0], [-79.5, 8.9], [-80.4, 8.2], [-80.0, 7.4], [-81.7, 8.1], [-83.6, 8.4], [-85.7, 10.0], [-85.8, 11.2], [-87.5, 12.9], [-88.5, 13.2], [-90.0, 13.8], [-91.8, 14.4], [-93.5, 15.8], [-94.7, 16.2], [-96.5, 15.7], [-98.0, 16.1], [-101, 17.2]],
  CUBA: [[-84.95, 21.86], [-84.3, 22.4], [-83.2, 22.9], [-82.2, 23.2], [-80.6, 23.1], [-79.3, 22.6], [-77.9, 21.9], [-77.2, 21.3], [-75.7, 21.1], [-74.2, 20.3], [-74.6, 19.9], [-75.8, 19.9], [-77.7, 19.85], [-77.2, 20.5], [-78.1, 20.7], [-78.7, 21.6], [-79.9, 21.7], [-81.4, 22.1], [-82.0, 22.4], [-83.0, 22.0], [-84.4, 21.8]],
  HISP: [[-74.45, 18.45], [-72.7, 18.55], [-72.8, 19.0], [-73.4, 19.7], [-72.8, 19.95], [-71.7, 19.9], [-70.0, 19.7], [-69.2, 19.3], [-68.35, 18.6], [-68.7, 18.2], [-69.9, 18.4], [-70.7, 18.25], [-71.4, 17.6], [-72.0, 18.15], [-73.4, 18.2], [-74.45, 18.3]],
  JAM: [[-78.35, 18.45], [-77.2, 18.5], [-76.3, 18.2], [-76.4, 17.9], [-77.2, 17.75], [-78.2, 18.2]],
  TT: [[-61.9, 10.85], [-61.0, 10.85], [-60.9, 10.1], [-61.9, 10.05]],
};
const DOTS_LL = [[-77.8, 24.5], [-77.4, 25.1], [-77.0, 26.6], [-78.3, 26.7], [-76.2, 25.0], [-75.8, 24.0], [-75.5, 23.4], [-74.6, 22.8], [-73.5, 21.2], [-72.0, 21.8], [-71.6, 21.5], [-73.0, 22.4],
  [-64.9, 18.35], [-64.6, 18.43], [-63.0, 18.2], [-62.8, 17.9], [-62.7, 17.3], [-61.8, 17.1], [-61.6, 16.2], [-61.4, 15.4], [-61.0, 14.6], [-61.0, 13.9], [-61.2, 13.25], [-61.6, 12.1], [-69.0, 12.2], [-68.3, 12.2], [-70.0, 12.5]];
const STEP = 0.32;
let LAND = null;
function landDots() {
  if (LAND) return LAND; LAND = [];
  const polys = Object.values(MAP);
  const inLL = (P, lo, la) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, zi] = P[i], [xj, zj] = P[j]; if ((zi > la) !== (zj > la) && lo < (xj - xi) * (la - zi) / (zj - zi) + xi) c = !c; } return c; };
  for (let lo = -100; lo <= -55; lo += STEP) for (let la = 3; la <= 34; la += STEP) if (polys.some(P => inLL(P, lo, la))) LAND.push(proj(lo, la));
  for (const [lo, la] of DOTS_LL) LAND.push(proj(lo, la));
  return LAND;
}
const mapEl = document.getElementById('locator'), mapBg = document.getElementById('locator-bg'), whereEl = document.querySelector('.where');
let mctx = null, mapDone = false;
function sizeMap() { if (!mapEl) return; const r = Math.min(2, devicePixelRatio || 1); mapEl.width = innerWidth * r; mapEl.height = innerHeight * r; mctx = mapEl.getContext('2d'); mctx.setTransform(r, 0, 0, r, 0, 0); }
function drawMap() {
  if (!mapEl) return;
  const W = innerWidth, Hh = innerHeight, p = clamp(scrollY / (Hh * 0.6));
  const fade = 1 - smooth(clamp((p - 0.62) / 0.38));
  if (fade <= 0) { if (!mapDone) { mapEl.hidden = mapBg.hidden = true; if (whereEl) whereEl.hidden = true; mapDone = true; } return; }
  if (mapDone) { mapEl.hidden = mapBg.hidden = false; if (whereEl) whereEl.hidden = false; mapDone = false; }
  if (!mctx) sizeMap();
  const sc = LIVE.screen || { cx: W * (W > 820 ? 0.68 : 0.5), cy: Hh * (W > 820 ? 0.45 : 0.28), w: W * (W > 820 ? 0.3 : 0.8) };
  const k0 = W / ((W > 820 ? 40 : 20) * CL * S), k1 = sc.w / ((67.27 - 65.62) * CL * S);
  const e = MOTION ? easeInOut(clamp(p / 0.95)) : 0, k = k0 * Math.pow(k1 / k0, e);
  const X = u => sc.cx + u * k, Y = v => sc.cy + v * k, lab = 1 - smooth(clamp(p * 2.6));
  mapEl.style.opacity = mapBg.style.opacity = fade.toFixed(3);
  const g = mctx; g.clearRect(0, 0, W, Hh);
  // the region
  const ds = Math.max(1.6, STEP * CL * S * k * 0.62), da = 0.28 * (1 - smooth(clamp((e - 0.3) / 0.5)));
  if (da > 0.005) { g.fillStyle = `rgba(23,22,28,${da})`; for (const [u, v] of landDots()) { const x = X(u), y = Y(v); if (x > -ds && x < W + ds && y > -ds && y < Hh + ds) g.fillRect(x - ds / 2, y - ds / 2, ds, ds); } }
  // routes from home
  if (lab > 0.01) {
    const [su, sv] = proj(-66.1, 18.46), sx = X(su), sy = Y(sv);
    const route = (lo, la, text, row) => { const [u, v] = proj(lo, la); let x = X(u), y = Y(v);
      g.save(); g.globalAlpha = lab * 0.9; g.strokeStyle = '#ff5a1f'; g.lineWidth = 1.2; g.setLineDash([3, 4]);
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(x, y); g.stroke(); g.setLineDash([]);
      // keep the label on screen: walk back along the route until it is
      const m = 18, minX = W > 820 ? W * 0.55 : m, maxY = W > 820 ? Hh - m : Hh * 0.42, minY = W > 820 ? m + 10 : 88; let tt = 1; while (tt > 0.05 && (x < minX || x > W - 150 || y < minY || y > maxY)) { tt -= 0.02; x = sx + (X(u) - sx) * tt; y = sy + (Y(v) - sy) * tt; }   // a phone keeps the labels below the buttons
      g.fillStyle = '#ff5a1f'; g.fillRect(x - 3, y - 3, 6, 6);
      g.fillStyle = '#17161c'; g.font = (W > 820 ? '500 11px' : '500 10px') + ' "Geist Mono", ui-monospace, Menlo, monospace'; g.fillText(text, x + 8, y + 4); g.restore(); };
    route(-80.19, 25.76, ES() ? 'Miami · menos de 3 h' : 'Miami · under 3 h', 1);
    route(-74.0, 40.7, ES() ? 'Nueva York · ~4 h' : 'New York · ~4 h', 0);
  }
  // Puerto Rico, Vieques, Culebra
  g.save(); g.fillStyle = '#a9b88f'; g.strokeStyle = '#ff5a1f'; g.lineWidth = 1.5 * (1 - e);
  for (const poly of POLYS) { g.beginPath(); poly.forEach(([u, v], i) => i ? g.lineTo(X(u), Y(v)) : g.moveTo(X(u), Y(v))); g.closePath(); g.fill(); if (e < 0.98) g.stroke(); }
  g.restore();
  if (lab > 0.01) {
    const prw = (67.27 - 65.62) * CL * S * k;
    if (MOTION) { const ph = (LIVE.t * 0.6) % 1; g.strokeStyle = `rgba(255,90,31,${(1 - ph) * 0.7 * lab})`; g.lineWidth = 1.5; g.beginPath(); g.arc(sc.cx, sc.cy, prw * 0.6 + ph * 34, 0, 6.283); g.stroke(); }
    g.globalAlpha = lab; g.fillStyle = '#17161c'; g.font = '600 13px "Geist", ui-sans-serif, system-ui, sans-serif';
    g.fillText('Puerto Rico', sc.cx + prw * 0.6 + 12, sc.cy - 6); g.globalAlpha = 1;
  }
  if (whereEl) { whereEl.style.opacity = lab.toFixed(3); const r = whereEl.getBoundingClientRect(), prw = (67.27 - 65.62) * CL * S * k;
    let left, top;
    if (W > 820) { left = clamp(sc.cx + prw * 0.6 + 12, 16, W - r.width - 16); top = clamp(sc.cy + 6, 16, Hh - r.height - 16); }
    else { const name = document.querySelector('.hero__meta'), limit = name ? name.getBoundingClientRect().top - r.height - 28 : Hh;
      left = 16; top = Math.max(96, Math.min(sc.cy + prw * 0.35 + 22, limit)); }
    whereEl.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px)`; whereEl.classList.add('placed'); }
}
addEventListener('resize', () => { sizeMap(); drawMap(); });

/* ---------------- the coquí, at night, if you ask for it ---------------- */
// "co" ~1.15 kHz, then "quí" rising ~1.9 to 2.4 kHz. Built with the oldest Web Audio calls so Safari plays it too.
export function coqui(ctx, dest, when, pan, vol) {
  const g = ctx.createGain(); g.gain.value = 0;
  if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(dest); } else g.connect(dest);
  const co = ctx.createOscillator(), qui = ctx.createOscillator(); co.type = qui.type = 'sine'; co.frequency.value = 1150; qui.frequency.value = 1900;
  co.connect(g); qui.connect(g);
  g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(vol, when + 0.01); g.gain.exponentialRampToValueAtTime(0.0008, when + 0.1);
  g.gain.setValueAtTime(0, when + 0.14); g.gain.linearRampToValueAtTime(vol, when + 0.155); g.gain.exponentialRampToValueAtTime(0.0008, when + 0.33);
  qui.frequency.setValueAtTime(1900, when + 0.14); qui.frequency.linearRampToValueAtTime(2400, when + 0.3);
  co.start(when); co.stop(when + 0.12); qui.start(when + 0.13); qui.stop(when + 0.35);
}
/* ---------------- the coquí: a real recording from Río Grande, louder at night ---------------- */
// Recording: Gabriel Leite, xeno-canto XC996296, CC BY-NC-SA 4.0, trimmed into a loop. If it can't load, a drawn call stands in.
function frogs() {
  const btn = document.querySelector('.sound'); if (!btn) return;
  let ctx = null, on = false, master = null, src = null, timer = 0, synth = false, keep = null;
  // iPhones mute web sound with the silent switch. Asking for "playback" (newer iOS), and playing a silent
  // <audio> loop inside the tap (older iOS), both move the page to media sound, like a video, so the frogs play.
  const unmute = () => { try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
    try { if (!keep) { keep = new Audio('/assets/silent.mp3'); keep.loop = true; keep.setAttribute('playsinline', ''); } const p = keep.play(); p && p.catch(() => {}); } catch (e) {} };
  const label = () => { btn.textContent = innerWidth <= 820 ? 'Coquíes' : ES() ? (on ? 'Coquíes prendidos' : 'Coquíes apagados') : (on ? 'Coquíes on' : 'Coquíes off'); btn.setAttribute('aria-pressed', on ? 'true' : 'false'); };
  const level = () => 0.35 + 0.65 * LIVE.night;   // a few far off by day, the full chorus at night
  function follow() { if (!on) return; master.gain.setTargetAtTime(level(), ctx.currentTime, 0.4);
    if (synth && (LIVE.night > 0.3 || Math.random() < 0.45)) coqui(ctx, master, ctx.currentTime + 0.05, Math.random() * 1.6 - 0.8, 0.06 + 0.06 * LIVE.night);
    timer = setTimeout(follow, synth ? 600 + Math.random() * 1200 : 250); }
  async function load() {
    try { const r = await fetch('/assets/coqui.mp3'); if (!r.ok) throw new Error(r.status); const buf = await ctx.decodeAudioData(await r.arrayBuffer());
      src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.loopStart = 0.06; src.loopEnd = buf.duration - 0.06; src.connect(master); src.start(); }
    catch (e) { synth = true; coqui(ctx, master, ctx.currentTime + 0.02, 0, 0.1); }
  }
  btn.addEventListener('click', () => {
    on = !on; label(); clearTimeout(timer);
    if (on) unmute(); else if (keep) keep.pause();
    try {
      if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; ctx = new AC(); master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination); }
      if (!on) { master.gain.setTargetAtTime(0, ctx.currentTime, 0.15); return; }
      const go = () => { master.gain.setTargetAtTime(level(), ctx.currentTime, 0.08); if (!src && !synth) load(); follow(); };
      ctx.state === 'running' ? go() : ctx.resume().then(go);
    } catch (e) { on = false; label(); }
  });
  addEventListener('langchange', label);
  label();
}

/* ---------------- plena: a real recording, panderos and güiro, quiet in the background ---------------- */
// Recording: Reilly Gault, "Plena Puertorriqueña", YouTube, CC BY 3.0, cut to 64 beats so it loops hit to hit.
function plena() {
  const btn = document.querySelector('.drums'); if (!btn) return;
  let ctx = null, out = null, src = null, on = false, keep = null, loading = false;
  const label = () => { btn.textContent = innerWidth <= 820 ? 'Plena' : ES() ? (on ? 'Plena prendida' : 'Plena apagada') : (on ? 'Plena on' : 'Plena off'); btn.setAttribute('aria-pressed', on ? 'true' : 'false'); };
  async function load() {
    loading = true;
    try { const r = await fetch('/assets/plena.mp3'); if (!r.ok) throw new Error(r.status); const buf = await ctx.decodeAudioData(await r.arrayBuffer());
      src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.loopStart = 0.5; src.loopEnd = Math.min(buf.duration, 31.521859); src.connect(out); src.start(0, 0.5); }
    catch (e) { on = false; label(); out.gain.value = 0; }
    loading = false;
  }
  btn.addEventListener('click', () => {
    on = !on; label();
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
    try { if (on) { if (!keep) { keep = new Audio('/assets/silent.mp3'); keep.loop = true; keep.setAttribute('playsinline', ''); } const pr = keep.play(); pr && pr.catch(() => {}); } else if (keep) keep.pause(); } catch (e) {}
    try {
      if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; ctx = new AC(); out = ctx.createGain(); out.gain.value = 0; out.connect(ctx.destination); }
      if (!on) { out.gain.setTargetAtTime(0, ctx.currentTime, 0.2); return; }
      const go = () => { out.gain.setTargetAtTime(0.5, ctx.currentTime, 0.3); if (!src && !loading) load(); };
      ctx.state === 'running' ? go() : ctx.resume().then(go);
    } catch (e) { on = false; label(); }
  });
  addEventListener('langchange', label); addEventListener('resize', label);
  label();
}

sizeMap();
const world = start();
if (!world) { drawMap(); addEventListener('scroll', drawMap, { passive: true }); }
frogs();
plena();
