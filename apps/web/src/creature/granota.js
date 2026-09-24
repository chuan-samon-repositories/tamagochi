// Generador procedural de granotes pixel-art.
// Cada granota és un "genoma" determinista a partir d'una llavor (seed).
// El renderitzador dibuixa qualsevol pose (repòs, parpelleig, gola inflada,
// ajupida, salt, caiguda, boca oberta...) a partir del mateix genoma, de manera
// que totes les animacions s'adapten a la forma de cada granota.
//
// Portat gairebé literal des de github.com/ArnauSamonRos/RANA — només el
// generador i el renderitzador de `src/granota.js`. No s'ha tocat res del
// joc (`joc.js`), del gust après (`gust.js`, `aprenentatge.js`, `model.js`)
// ni de la vista 3D (`vista3d.js`): el bicho decideix quina pose triar amb
// el seu propi cicle d'estados (`useCreature`), no amb el bucle de RANA.

export const Granota = (() => {

// Versió del generador: s'apuja quan un mateix codi (llavor) passa a dibuixar
// una granota diferent. Els vots guarden la versió i els trets per no perdre's.
const VERSION = 9;

// ---------------------------------------------------------------- RNG ----
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function makeRng(seed) {
  const r = mulberry32(seed);
  const R = {
    f: r,
    range: (a, b) => a + r() * (b - a),
    int: (a, b) => Math.floor(a + r() * (b - a + 1)),
    pick: arr => arr[Math.floor(r() * arr.length)],
    chance: p => r() < p,
    // {clau: pes}
    weighted(obj) {
      let tot = 0; for (const k in obj) tot += obj[k];
      let x = r() * tot;
      for (const k in obj) { x -= obj[k]; if (x < 0) return k; }
      return Object.keys(obj)[0];
    },
  };
  return R;
}
function hash2(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2246822519);
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}
function noise2(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const sm = t => t * t * (3 - 2 * t);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  const u = sm(xf), v = sm(yf);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

// ------------------------------------------------------------- Colors ----
function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  const x = v => Math.round(v * 255).toString(16).padStart(2, '0');
  return '#' + x(f(0)) + x(f(8)) + x(f(4));
}
function shift(hex, dh, ds, dl) {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h + dh, s + ds, l + dl);
}
// Variant il·luminada / ombrejada amb desplaçament de to (estil pixel-art)
function towardHue(h, target, amt) {
  let d = ((target - h + 540) % 360) - 180;
  return h + Math.sign(d) * Math.min(Math.abs(d), amt);
}
const variantCache = new Map();
function variant(hex, lvl) {
  if (!lvl) return hex;
  const key = hex + lvl;
  let v = variantCache.get(key);
  if (v) return v;
  const [h, s, l] = hexToHsl(hex);
  if (lvl > 0) v = hslToHex(towardHue(h, 55, 8 * lvl), s + 0.03, l + 0.09 * lvl);
  else v = hslToHex(towardHue(h, 250, 10 * -lvl), s + 0.04, l + 0.12 * lvl);
  variantCache.set(key, v);
  return v;
}

// ----------------------------------------------- Paletes de referència ----
// Extretes de la imatge de referència (cos, panxa, accent/potes, iris).
const PALETTES = [
  { n: 'dart',    body: '#e1382c', belly: '#e1382c', accent: '#1d5199', iris: '#0b0f1e' },
  { n: 'arbre',   body: '#aedd2b', belly: '#ffffcf', accent: '#ff5a2a', iris: '#ff3033' },
  { n: 'pluja',   body: '#b2b2aa', belly: '#dbdbd8', accent: '#808079', iris: '#1f1d1d' },
  { n: 'toro',    body: '#8e8f49', belly: '#f5f2eb', accent: '#5d5e26', iris: '#dcc156' },
  { n: 'gripau',  body: '#b65836', belly: '#dfbe9d', accent: '#8b3c20', iris: '#2b0f05' },
  { n: 'sorra',   body: '#d39d57', belly: '#f3d8a0', accent: '#8e642d', iris: '#140c02' },
  { n: 'oliva',   body: '#868324', belly: '#e4c836', accent: '#52500f', iris: '#e4c836' },
  { n: 'fang',    body: '#744d2e', belly: '#e9bda4', accent: '#4c301a', iris: '#b18546' },
  { n: 'pàl·lida',body: '#b4bc45', belly: '#ecda90', accent: '#fbd42f', iris: '#2f320a' },
  { n: 'carmí',   body: '#d53235', belly: '#d53235', accent: '#850f1a', iris: '#010004' },
  { n: 'pissarra',body: '#596273', belly: '#e9b349', accent: '#394050', iris: '#9f954d' },
  { n: 'avellana',body: '#9a5f2e', belly: '#f6d6a3', accent: '#7d4b26', iris: '#060300' },
  { n: 'llima',   body: '#a6c706', belly: '#ff6206', accent: '#627600', iris: '#1a1a06' },
  { n: 'pedra',   body: '#837866', belly: '#c9bdbd', accent: '#dfb166', iris: '#1a160e' },
  { n: 'desert',  body: '#c5b091', belly: '#d8c8aa', accent: '#815d25', iris: '#e69b43' },
  { n: 'banyuda', body: '#c5a45d', belly: '#ddc9c4', accent: '#886f39', iris: '#1f170f' },
  { n: 'menta',   body: '#7ea592', belly: '#acc3b8', accent: '#496859', iris: '#1c2b24' },
  { n: 'taronja', body: '#db7400', belly: '#f7ad1e', accent: '#9d3f00', iris: '#290f00' },
  { n: 'gel',     body: '#a2bac6', belly: '#b8ccd6', accent: '#5a7583', iris: '#c5a45d' },
  { n: 'carbó',   body: '#54514c', belly: '#54514c', accent: '#35312b', iris: '#0f0e0b' },
  { n: 'sàlvia',  body: '#95a75e', belly: '#d0d4c3', accent: '#5f6c37', iris: '#2c3317' },
  { n: 'blava',   body: '#2f5bbe', belly: '#a0d3fc', accent: '#122f6f', iris: '#06122b' },
  { n: 'os',      body: '#b1a389', belly: '#d9d6cd', accent: '#eec5a4', iris: '#242018' },
  { n: 'prat',    body: '#68a24f', belly: '#ffffcf', accent: '#356023', iris: '#e0b020' },
];
const IRIS = {
  '#0b0f1e': 5, '#1a1208': 3, '#dcc156': 2, '#e69b43': 1.5, '#ff3033': 1.2,
  '#c5a45d': 1, '#9f954d': 0.8, '#b8d040': 0.5, '#8ab0d0': 0.5, '#e8e8e0': 0.4, '#d06020': 0.6,
};
const TONGUES = ['#e0607a', '#d8506a', '#c84860', '#e888a0', '#b0506a', '#d86a5a', '#a64b77'];
const MOUTHS = ['#ae7397', '#b85a6a', '#9a5a80', '#c07080', '#8a4a60'];

// ------------------------------------------------------------ Genoma ----
// Arquetips inspirats en la imatge de referència. Cada un fixa proporcions,
// paletes i preferències de peces. Les peces es poden barrejar entre arquetips,
// però les proporcions i la disposició (cara a dalt, braços sota la boca) es
// mantenen sempre coherents.
const ALL_PAL = PALETTES.map(p => p.n);
const ARCH = {
  arbre: {
    w: 3, bw: [9, 12], ratio: [0.95, 1.12], taper: [-0.05, 0.12],
    pal: ['arbre', 'prat', 'llima', 'blava', 'pàl·lida', 'menta', 'gel'],
    eye: { bulge: 5, white: 1, side: 1.5, oval: 0.6, calm: 0.8, crescent: 0.6, vivid: 2.5 }, er: [3.2, 4.3],
    iris: { '#ff3033': 3, '#dcc156': 2, '#e69b43': 1, '#0b0f1e': 2 },
    pupil: { vert: 2, horiz: 2, shine: 1, round: 1, ring: 0.5 },
    mouth: { line: 3, smile: 3, droop: 2, chevron: 1 }, belly: { big: 3, oval: 2, bib: 3 },
    arms: { pads: 4, thin: 2, long: 1.5 }, thighs: { slim: 2, normal: 3 }, feet: { pads: 3, toes: 1, fingers: 1 },
    waist: [0.04, 0.18], feetAccent: 0.45,
    pats: { none: 5, lines: 1.5, speckle: 1, twotone: 1, freckle: 1 },
  },
  dard: {
    w: 2, bw: [9, 12], ratio: [0.9, 1.05], taper: [0, 0.18],
    pal: ['dart', 'carmí', 'blava', 'taronja', 'llima', 'arbre'],
    eye: { bulge: 3, bead: 2, side: 1, oval: 3, vivid: 0.5 }, er: [2.6, 3.5],
    iris: { '#0b0f1e': 5 }, pupil: { shine: 4, full: 1, round: 1 },
    mouth: { line: 2, frown: 1, small: 1, chevron: 3 }, belly: { none: 3, chin: 1, oval: 1 },
    arms: { thin: 3, pads: 1 }, thighs: { normal: 3, slim: 1 }, feet: { toes: 2, pads: 1, fingers: 3 },
    waist: [0.08, 0.22], cheeks: 0.4,
    pats: { twotone: 3, spots: 2, blotch: 2, none: 1.5 },
  },
  gripau: {
    w: 3, bw: [13, 17], ratio: [0.7, 0.85], taper: [0.15, 0.38],
    pal: ['gripau', 'sorra', 'fang', 'pedra', 'desert', 'avellana', 'oliva', 'banyuda'],
    eye: { toad: 4, hooded: 2, knob: 1, bulge: 1, rim: 2.5, crescent: 2.5 }, er: [2.6, 3.6],
    iris: { '#dcc156': 2, '#e69b43': 2, '#0b0f1e': 2, '#1a1208': 2 },
    pupil: { horiz: 4, ring: 1.5, round: 1, full: 1 },
    mouth: { line: 3, frown: 2, droop: 3 }, belly: { big: 3, oval: 2, ribbed: 0.6, huge: 2.5 },
    arms: { stubby: 4, thin: 1 }, thighs: { bulky: 4, normal: 1 }, feet: { toes: 3, webbed: 1 },
    pats: { warts: 4, spots: 2, mottle: 2, blotch: 1, none: 1 },
  },
  toro: {
    w: 2.5, bw: [14, 17], ratio: [0.75, 0.9], taper: [0.1, 0.28],
    pal: ['toro', 'sàlvia', 'prat', 'oliva', 'pàl·lida', 'menta'],
    eye: { bulge: 3, knob: 3, toad: 1, crescent: 1.5 }, er: [3, 4],
    iris: { '#dcc156': 3, '#e69b43': 1, '#0b0f1e': 2 }, pupil: { horiz: 3, round: 2, dot: 2 },
    mouth: { line: 3, smile: 3, droop: 1.5 }, belly: { big: 4, chin: 1, huge: 1, bib: 1 },
    arms: { stubby: 3, thin: 1 }, thighs: { bulky: 3, normal: 2 }, feet: { webbed: 2, toes: 2 },
    pats: { none: 3, spots: 2, mottle: 1.5, speckle: 1 },
  },
  pluja: {
    w: 1.5, bw: [11, 15], ratio: [0.78, 0.92], taper: [0, 0.12], pTop: [1.8, 2.2],
    pal: ['pluja', 'carbó', 'sorra', 'fang', 'pedra', 'os', 'gel'],
    eye: { bead: 4, dot: 2, happy: 2, calm: 1 }, er: [1.4, 2.2], iris: { '#0b0f1e': 5 }, pupil: { full: 1 },
    mouth: { frown: 2, small: 2, line: 1, none: 1 }, belly: { none: 3, oval: 1 },
    arms: { hidden: 2, stubby: 2 }, thighs: { hidden: 2, normal: 1 }, feet: { toes: 1 },
    pats: { none: 3, speckle: 2, freckle: 2, mottle: 1 },
  },
  banyuda: {
    w: 1.2, bw: [14, 17], ratio: [0.72, 0.85], taper: [0.2, 0.38], horns: 0.85, angry: 0.5,
    pal: ['banyuda', 'desert', 'sorra', 'gripau', 'prat', 'sàlvia'],
    eye: { toad: 3, hooded: 2, happy: 1, bulge: 1, rim: 1.5, crescent: 1 }, er: [2.6, 3.4],
    iris: { '#0b0f1e': 3, '#dcc156': 1 }, pupil: { horiz: 2, full: 2, ring: 1 },
    mouth: { frown: 3, line: 2, droop: 2 }, belly: { big: 4, huge: 2 },
    arms: { stubby: 3 }, thighs: { bulky: 3 }, feet: { toes: 2, webbed: 1 },
    pats: { blotch: 3, spots: 2, mask: 1, bands: 1 },
  },
  bassa: {
    w: 3, bw: [10, 15], ratio: [0.8, 1.0], taper: [0, 0.28], pal: ALL_PAL,
    eye: { bulge: 3, toad: 1.2, white: 1, bead: 1, knob: 1, side: 1, happy: 0.7, hooded: 1, calm: 0.7, rim: 0.7, oval: 1, crescent: 1, vivid: 0.6 }, er: [2.8, 4],
    iris: { '#0b0f1e': 3, '#dcc156': 2, '#e69b43': 1, '#c5a45d': 1, '#ff3033': 0.5 },
    pupil: { round: 2, horiz: 3, full: 1, ring: 1, shine: 1, dot: 0.5 },
    mouth: { line: 4, smile: 2, frown: 1, small: 0.6, chevron: 1, droop: 1 }, belly: { big: 3, oval: 3, chin: 1, none: 0.5, bib: 1, huge: 0.5 },
    arms: { thin: 2, stubby: 2, pads: 1 }, thighs: { normal: 3, bulky: 1.5, slim: 1 }, feet: { toes: 3, webbed: 1, pads: 1 },
    pats: { none: 3, spots: 2, stripe: 1, lines: 1, speckle: 1, chevron: 0.5, mottle: 1 },
    waist: [0, 0.12], feetAccent: 0.15,
  },
  // Granota de cintura estreta, ulls tranquils i pitet (inspirada en la verda pàl·lida)
  cintura: {
    w: 2, bw: [10, 13], ratio: [1.0, 1.15], taper: [0.05, 0.2],
    pal: ['pàl·lida', 'prat', 'arbre', 'menta', 'sàlvia', 'llima', 'gel'],
    eye: { calm: 3, bulge: 1.5, oval: 0.6, vivid: 0.6 }, er: [3.2, 4.2],
    iris: { '#0b0f1e': 2, '#dcc156': 1 }, pupil: { round: 1, vert: 1, shine: 1 },
    mouth: { chevron: 2.5, droop: 2, line: 1 }, belly: { bib: 4, big: 1 },
    arms: { long: 3, thin: 1 }, thighs: { normal: 2, slim: 1 }, feet: { fingers: 1.5, toes: 1, pads: 1 },
    pats: { none: 4, lines: 1, freckle: 0.5 },
    waist: [0.12, 0.22], feetAccent: 0.7,
  },
};
const CREAMS = ['#f5f2eb', '#ffffcf', '#f3e6b8', '#ecdcc8', '#e2ebe2', '#f4e0cc'];

function genome(seed) {
  seed = seed >>> 0;
  const R = makeRng(seed);
  const g = { seed };
  const jit = hex => shift(hex, R.range(-8, 8), R.range(-0.05, 0.05), R.range(-0.04, 0.04));
  const archNames = Object.keys(ARCH);
  const archW = {}; for (const k of archNames) archW[k] = ARCH[k].w;
  const A = ARCH[R.weighted(archW)];
  g.arch = Object.keys(ARCH).find(k => ARCH[k] === A);
  // Cada peça surt de l'arquetip (80%) o d'un altre arquetip (20%)
  const part = key => R.weighted((R.chance(0.8) ? A : ARCH[R.pick(archNames)])[key] || A[key]);

  // --- Cos (proporcions sempre de l'arquetip)
  g.bw = R.range(A.bw[0], A.bw[1]);                       // mitja amplada
  g.bh = Math.min(34, 2 * g.bw * R.range(A.ratio[0], A.ratio[1]));
  g.pTop = A.pTop ? R.range(A.pTop[0], A.pTop[1]) : R.range(1.9, 2.7);
  g.pBot = R.range(2.2, 3.1);
  g.taper = R.range(A.taper[0], A.taper[1]);
  g.waist = A.waist ? R.range(A.waist[0], A.waist[1]) : 0;   // cintura (forma de rellotge de sorra)
  // Coll estret: cap ample i pla separat del cos per un coll (com la granota dard i la
  // d'arbre de la referència). El cos es manté prim i alt, mai més gruixut.
  const neckP = { arbre: 0.35, dard: 0.4, cintura: 0.3, bassa: 0.12 }[g.arch] || 0.04;
  g.neck = R.chance(neckP) ? R.range(0.16, 0.24) : 0;
  if (g.neck) {
    g.headW = R.range(1.08, 1.18);
    g.bw = Math.min(g.bw, R.range(9.5, 12));
    g.bh = Math.max(g.bh, 2 * g.bw * R.range(1.0, 1.12));
    g.taper = Math.min(g.taper, 0.1);
    g.pTop = Math.max(g.pTop, R.range(2.5, 3.1));
    g.waist = 0;
  } else g.headW = 1;

  // --- Colors harmònics
  const pn = R.pick(A.pal);
  const P = R.chance(0.85) ? PALETTES.find(p => p.n === pn) : R.pick(PALETTES);
  g.palette = P.n;
  g.body = jit(P.body);
  g.belly = jit(P.belly);
  g.accent = jit(P.accent);
  const [bh0] = hexToHsl(g.body);
  if (R.chance(0.15)) {                                    // panxa crema tenyida del to del cos
    const [ch, cs, cl] = hexToHsl(R.pick(CREAMS));
    g.belly = hslToHex(towardHue(ch, bh0, 15), cs, cl);
  }
  if (R.chance(0.08)) {                                    // paleta nova però harmònica (anàloga)
    const h = R.range(0, 360), s = R.range(0.4, 0.68);
    g.body = hslToHex(h, s, R.range(0.42, 0.55));
    g.belly = hslToHex(towardHue(h, 55, 25), s * 0.7, R.range(0.82, 0.9));
    g.accent = hslToHex(h + R.pick([-20, 20]), s, R.range(0.26, 0.34));
  }
  const bl = hexToHsl(g.body)[2], lb = hexToHsl(g.belly)[2];
  if (Math.abs(bl - lb) < 0.07) g.belly = g.body;          // poc contrast: sense panxa
  g.iris = R.chance(0.6) ? R.weighted(A.iris) : P.iris;
  if (Math.abs(hexToHsl(g.iris)[2] - bl) < 0.1 && hexToHsl(g.iris)[1] > 0.2) g.iris = '#0b0f1e';
  g.tongue = R.pick(TONGUES);
  g.mouthIn = R.pick(MOUTHS);
  const [bh_, bs_] = hexToHsl(g.body);
  g.outline = hslToHex(bh_, Math.min(0.45, bs_ * 0.55), 0.1);
  g.patColor = R.weighted({ dark: 6, accent: 2.5, light: 1 });
  g.pat = {
    dark: shift(g.body, R.range(-10, 10), 0.04, -R.range(0.16, 0.24)),
    accent: g.accent,
    light: shift(g.body, 0, -0.05, R.range(0.12, 0.18)),
  }[g.patColor];
  g.legColor = R.weighted({ body: 7, dark: 1 });

  // --- Ulls
  g.eyeType = part('eye');
  const ER = { bulge: [3, 4.2], toad: [2.6, 3.6], white: [3, 4.2], bead: [1.5, 2.3], dot: [1, 1.4],
    knob: [1.8, 2.6], side: [2.8, 3.8], hooded: [2.8, 3.8], happy: [2.4, 3.4],
    calm: [3, 4.2], rim: [2.8, 3.8], oval: [2.8, 3.8], crescent: [2.6, 3.5], vivid: [3, 4] };
  const own = A.eye[g.eyeType] && A.er && !['knob', 'happy', 'dot', 'crescent'].includes(g.eyeType);
  const erR = own ? A.er : ER[g.eyeType];
  g.er = Math.min(R.range(erR[0], erR[1]), g.bw * 0.3);
  if (g.eyeType === 'bead' || g.eyeType === 'dot') g.er = Math.min(g.er, 2.3);
  // ulls petits encastats: negres, amb mitja lluna daurada o vermells amb pupil·la
  g.beadStyle = g.eyeType === 'bead' ? R.weighted({ plain: 3, moon: 2, red: 1.5 }) : 'plain';
  if (g.beadStyle !== 'plain') g.er = Math.max(g.er, R.range(2.2, 2.7));
  g.eyeSpread = g.eyeType === 'side' || g.eyeType === 'crescent' ? R.range(0.74, 0.86) : R.range(0.4, 0.62);
  const er = g.er;
  g.eyeDrop = {
    bead: g.bh * R.range(0.18, 0.28), dot: g.bh * R.range(0.18, 0.28),
    toad: R.range(-er * 0.2, er * 0.4), hooded: R.range(-er * 0.2, er * 0.3), rim: R.range(-er * 0.2, er * 0.3), crescent: R.range(er * 0.1, er * 0.5),
    knob: R.range(-er * 1.0, -er * 0.6), side: R.range(-er * 0.2, er * 0.3),
    happy: R.range(-er * 0.3, er * 0.5),
  }[g.eyeType] ?? R.range(-er * 0.5, er * 0.15);
  g.pupil = g.eyeType === 'white' ? 'round' : part('pupil');
  if (g.eyeType === 'knob' && (g.pupil === 'full' || g.pupil === 'shine')) g.pupil = 'dot';
  // parpella: color del sòcol de l'ull
  g.lidColor = R.weighted({ body: 6, light: 1.5, pink: 0.7, accent: 0.8 });
  g.lid = { body: g.body, light: shift(g.body, 0, -0.05, 0.14), pink: '#eec5a4', accent: g.accent }[g.lidColor];
  // ulls tranquils: sòcol pàl·lid; ulls amb vora: anell de color al voltant d'una ranura fosca
  g.calmLid = g.belly !== g.body ? shift(g.belly, 0, -0.05, 0.02) : shift(g.body, 0, -0.1, 0.2);
  g.rimColor = hexToHsl(g.iris)[2] > 0.42 && hexToHsl(g.iris)[1] > 0.3 ? g.iris : R.pick(['#e39a4f', '#dcb050', '#e0784a']);
  // ulls de mitja lluna: bola negra amb una mitja lluna daurada per dins i per sota
  g.moonColor = R.pick(['#e0c040', '#e6b84a', '#d9c35a', '#e8a848']);
  // ulls vius (granota d'ulls vermells): l'iris de color viu arriba fins al contorn, sense parpella
  if (g.eyeType === 'vivid') {
    g.iris = R.weighted({ '#f0302c': 5, '#ff5a24': 1.5, '#e8b020': 1, '#e84868': 0.7 });
    g.pupil = R.weighted({ vert: 3, round: 1.5, horiz: 1 });
  }
  g.happySocket = g.eyeType === 'happy' ? R.weighted({ none: 2, body: 2, white: 1.2 }) : 'none';
  // cella/parpella superior: plana (gripau), pesada (mig tancat) o enfadada (inclinada)
  const flat = ['bulge', 'side', 'knob', 'white', 'toad', 'hooded', 'vivid'].includes(g.eyeType);  // la mitja lluna no porta cella
  g.angry = flat && g.eyeType !== 'white' && R.chance(A.angry || 0.1);
  g.brow = g.eyeType === 'toad' || g.eyeType === 'hooded' || g.angry || (g.eyeType === 'bulge' && R.chance(0.12));
  g.horns = R.chance(A.horns || 0.03) && !['bead', 'dot', 'calm'].includes(g.eyeType);

  // --- Boca
  g.mouth = part('mouth');
  g.mouthW = R.range(0.1, 0.55);                           // extensió més enllà del centre de l'ull
  g.mouthGap = R.range(0.6, 2.2);
  g.openH = R.range(3, 5);
  g.nostrils = R.chance(0.5);
  g.droopLen = R.int(2, 5);                                 // boca caiguda: llargada de les puntes
  g.cheeks = R.chance(A.cheeks || 0.1);                     // galtes clares sota els ulls
  g.cheekColor = hexToHsl(g.body)[2] < 0.6 ? shift(g.body, 0, 0.05, 0.14) : '#f0a0a8';

  // --- Panxa
  g.bellyType = g.belly === g.body ? 'none' : part('belly');
  g.bellyW = R.range(0.55, 0.78);
  g.navel = g.bellyType === 'huge' && R.chance(0.6);

  // --- Potes
  g.arms = part('arms');
  g.armX = R.range(0.32, 0.5);
  g.armLen = g.arms === 'long' ? R.range(9, 13) : R.range(4, 7);
  g.thighs = part('thighs');
  g.tw = { bulky: R.range(4.5, 6.5), normal: R.range(3.5, 5), slim: R.range(2.5, 3.5), hidden: 0 }[g.thighs];
  g.th = { bulky: R.range(4, 6), normal: R.range(3.5, 5), slim: R.range(3, 4.5), hidden: 0 }[g.thighs];
  g.feet = part('feet');
  g.feetAccent = R.chance(A.feetAccent || 0.08);             // mans i peus d'un altre color
  g.legLen = R.range(7, 12);

  // --- Patrons (fins a 2), coordenades normalitzades al cos
  g.patterns = [];
  const first = part('pats');
  const chosen = first === 'none' ? [] : [first];
  if (chosen.length && R.chance(0.3)) {
    const pool = Object.assign({}, A.pats); delete pool.none; delete pool[first];
    if (Object.keys(pool).length) chosen.push(R.weighted(pool));
  }
  for (const type of chosen) {
    const p = { type, seed: R.int(1, 1e9) };
    if (type === 'spots') {
      p.list = []; const n = R.int(2, 5);
      for (let k = 0; k < n; k++) {
        const s = { u: R.range(0.15, 0.75), v: R.range(-0.8, 0.5), r: R.range(1, 2.4) };
        p.list.push(s, { u: -s.u + R.range(-0.08, 0.08), v: s.v + R.range(-0.08, 0.08), r: s.r });
      }
      p.ring = R.chance(0.2);
    }
    if (type === 'warts') { p.density = R.range(0.04, 0.09); }
    if (type === 'speckle' || type === 'freckle') { p.density = R.range(0.04, 0.1); }
    if (type === 'stripe') { p.w = R.range(0.04, 0.08); }
    if (type === 'lines') { p.pos = R.range(0.45, 0.65); p.w = R.range(0.05, 0.08); }
    if (type === 'bands') { p.k = R.int(3, 5); p.phase = R.range(0, 1); }
    if (type === 'blotch') { p.scale = R.range(1.6, 2.6); p.thr = R.range(0.58, 0.68); }
    if (type === 'mottle') { p.scale = R.range(2, 3.5); }
    if (type === 'twotone') { p.at = R.range(0.2, 0.45); }
    g.patterns.push(p);
  }
  if (g.patterns.some(p => p.type === 'twotone')) g.legColor = 'accent';

  // --- Personalitat (adapta les animacions a cada cos)
  g.mass = Math.max(0, Math.min(1, (g.bw * g.bh - 160) / 340));   // 0 = petita, 1 = grossa
  g.jumpy = R.range(0.85, 1.2) * (g.arms === 'pads' || g.thighs === 'slim' ? 1.2 : 1) * (1.15 - g.mass * 0.4);
  g.lazy = R.range(0.7, 1.3) * (0.8 + g.mass * 0.7);
  g.croaky = R.range(0.3, 1.5);
  g.reach = R.range(26, 44) * (0.8 + g.mass * 0.4);          // abast de la llengua (px lògics)
  g.curious = R.range(0.3, 1);

  // Ulls a les cantonades: cap pla per dalt i ulls que en sobresurten, arran del
  // costat del cap (la cara s'uneix amb els ulls). Sorteig a part perquè la resta
  // de trets de cada llavor no canviï.
  const R2 = makeRng((seed ^ 0x5bd1e995) >>> 0);
  const cornerOk = ['bulge', 'white', 'vivid', 'oval', 'rim', 'toad', 'hooded', 'bead'].includes(g.eyeType) && !(g.eyeType === 'bead' && g.beadStyle === 'plain');
  g.cornerEyes = cornerOk && R2.chance(0.3);
  if (g.cornerEyes) {
    g.pTop = Math.max(g.pTop, R2.range(2.9, 3.6));
    g.eyeDrop = g.eyeType === 'bead' ? g.er * R2.range(0.3, 0.6) : -g.er * R2.range(0.15, 0.45);
    g.horns = false;
  }

  g.name = nameOf(g);

  // Escala de dibuix: granotes més grans (més píxels = més detall, com la referència).
  // Es fa al final perquè no canviï cap tret ni cap sorteig (els vots continuen valent).
  const K = 1.3;
  g.bw *= K; g.bh *= K; g.tw *= K; g.th *= K; g.legLen *= K; g.armLen *= K;
  g.er *= 1.15;
  for (const p of g.patterns) if (p.list) for (const sp of p.list) sp.r *= K;
  return g;
}

function colorWord(hex) {
  const [h, s, l] = hexToHsl(hex);
  if (s < 0.2) return l < 0.3 ? 'negra' : l > 0.7 ? 'blanca' : 'grisa';
  if (h < 14 || h >= 340) return l < 0.35 ? 'granat' : 'vermella';
  if (h < 38) return l < 0.45 ? 'marró' : 'taronja';
  if (h < 58) return l < 0.45 ? 'marró' : s < 0.45 ? 'terrosa' : 'groga';
  if (h < 80) return s < 0.4 ? 'oliva' : 'llimona';
  if (h < 160) return 'verda';
  if (h < 200) return 'turquesa';
  if (h < 260) return 'blava';
  if (h < 300) return 'violeta';
  return 'rosada';
}

const PAT_WORD = { spots: 'tacada', warts: 'berrugosa', speckle: 'pigallada', stripe: 'ratllada', lines: 'llistada', bands: 'tigrada', blotch: 'clapejada', mottle: 'jaspiada', mask: 'emmascarada', twotone: 'bicolor', chevron: 'ornada', freckle: 'pigosa' };

// Trets llegibles d'un genoma: [clau, etiqueta]. Serveixen per aprendre el gust de l'usuari.
function features(g) {
  const f = [];
  const add = (k, label) => f.push([k, label]);
  const [, s, l] = hexToHsl(g.body);
  add('arch:' + g.arch, 'tipus ' + g.arch);
  add('pal:' + g.palette, 'paleta ' + g.palette);
  add('col:' + colorWord(g.body), 'color ' + colorWord(g.body));
  add('lum:' + (l < 0.35 ? 0 : l < 0.6 ? 1 : 2), 'to ' + (l < 0.35 ? 'fosc' : l < 0.6 ? 'mitjà' : 'clar'));
  add('sat:' + (s < 0.3 ? 0 : s < 0.6 ? 1 : 2), 'color ' + (s < 0.3 ? 'apagat' : s < 0.6 ? 'suau' : 'viu'));
  if (g.bellyType !== 'none') add('bcol:' + colorWord(g.belly), 'panxa ' + colorWord(g.belly));
  add('belly:' + g.bellyType, { oval: 'panxa ovalada', big: 'panxa gran', chin: 'papada', ribbed: 'panxa estriada', none: 'sense panxa', bib: 'panxa de pitet', huge: 'panxa enorme' }[g.bellyType]);
  add('eye:' + g.eyeType, 'ulls ' + { bulge: 'sortints', toad: 'de gripau', white: 'blancs', bead: 'petits', dot: 'de punt', knob: 'sobre bonys', side: 'als costats', hooded: 'endormiscats', happy: 'contents', calm: 'tranquils', rim: 'amb vora de color', oval: 'ovalats', crescent: 'de mitja lluna', vivid: 'vius' }[g.eyeType]);
  if (g.beadStyle !== 'plain') add('bst:' + g.beadStyle, g.beadStyle === 'moon' ? 'ulls petits amb mitja lluna' : 'ulls petits vermells');
  if (g.eyeType !== 'bead' && g.eyeType !== 'dot' && g.lidColor !== 'body') add('lid:' + g.lidColor, 'parpella ' + { light: 'clara', pink: 'rosada', accent: 'de contrast' }[g.lidColor]);
  if (g.angry) add('angry', 'ulls enfadats');
  const es = g.er / g.bw;
  add('esz:' + (es < 0.2 ? 0 : es < 0.27 ? 1 : 2), 'ulls ' + (es < 0.2 ? 'petits' : es < 0.27 ? 'mitjans' : 'grans'));
  if (!['happy', 'calm', 'rim', 'oval', 'crescent'].includes(g.eyeType)) add('pup:' + g.pupil, 'pupil·la ' + { round: 'rodona', horiz: 'horitzontal', vert: 'vertical', full: 'plena', shine: 'brillant', ring: 'amb anella', dot: 'de punt' }[g.pupil]);
  add('iris:' + colorWord(g.iris), 'iris ' + colorWord(g.iris));
  add('mouth:' + g.mouth, 'boca ' + { line: 'recta', smile: 'somrient', frown: 'trista', small: 'petita', open: 'oberta', none: 'invisible', chevron: 'de bigoti', droop: 'caiguda' }[g.mouth]);
  add('arms:' + g.arms, 'braços ' + { thin: 'prims', stubby: 'grossos', pads: 'amb ventoses', hidden: 'amagats', long: 'llargs' }[g.arms]);
  add('thigh:' + g.thighs, 'cuixes ' + { bulky: 'grosses', normal: 'normals', slim: 'primes', hidden: 'amagades' }[g.thighs]);
  add('feet:' + g.feet, 'peus ' + { toes: 'amb dits', pads: 'amb ventoses', webbed: 'palmats', fingers: 'amb dits llargs' }[g.feet]);
  if (!g.patterns.length) add('pat:none', 'sense patró');
  for (const p of g.patterns) add('pat:' + p.type, 'patró ' + PAT_WORD[p.type]);
  if (g.patterns.length) add('patc:' + g.patColor, 'patró ' + { dark: 'fosc', accent: 'de contrast', light: 'clar' }[g.patColor]);
  const ratio = g.bh / (2 * g.bw);
  add('ratio:' + (ratio < 0.8 ? 0 : ratio < 0.95 ? 1 : 2), 'cos ' + (ratio < 0.8 ? 'aplanat' : ratio < 0.95 ? 'equilibrat' : 'alt'));
  add('size:' + (g.mass < 0.3 ? 0 : g.mass < 0.65 ? 1 : 2), 'mida ' + (g.mass < 0.3 ? 'petita' : g.mass < 0.65 ? 'mitjana' : 'grossa'));
  add('head:' + (g.pTop < 2.2 ? 0 : 1), 'cap ' + (g.pTop < 2.2 ? 'rodó' : 'quadrat'));
  if (g.cornerEyes) add('eyepos:corner', 'ulls a les cantonades del cap');
  add('taper:' + (g.taper > 0.22 ? 1 : 0), g.taper > 0.22 ? 'forma de pera' : 'forma recta');
  if (g.horns) add('horns', 'banyes');
  if (g.brow && !g.angry && g.eyeType !== 'toad' && g.eyeType !== 'hooded') add('brow', 'celles');
  if (g.cheeks) add('cheeks', 'galtes clares');
  if (g.waist > 0.1) add('waist', 'cintura estreta');
  if (g.neck) add('neck', 'cap ample i coll estret');
  if (g.feetAccent) add('facc', 'mans i peus de color');
  if (g.navel) add('navel', 'melic');
  if (g.nostrils) add('nost', 'narius');
  return f;
}

function nameOf(g) {
  const c = colorWord(g.body);
  const pat = PAT_WORD;
  const size = g.mass > 0.65 ? ' grossa' : g.mass < 0.12 ? ' petita' : '';
  const p = g.patterns.length ? ' ' + pat[g.patterns[0].type] : '';
  const eye = g.horns ? ' cornuda' : g.angry ? ' enfadada' : { white: ' ullerosa', happy: ' somiadora', hooded: ' endormiscada', knob: ' ullbonys', calm: ' tranquil·la', oval: ' ullnegra' }[g.eyeType] || '';
  return 'Granota ' + c + p + eye + size;
}

// --------------------------------------------------------- Renderitzat ----
const GW = 84, GH = 84, G = 78, CX = 42;       // quadrícula lògica, terra i centre

const POSES = {
  idle:    {},
  breath:  { sx: 1.03, sy: 0.97 },
  blink:   { eyes: 'closed' },
  half:    { eyes: 'half' },
  puff1:   { puff: 0.5, sx: 1.02 },
  puff2:   { puff: 1, sx: 1.05, sy: 0.97 },
  crouch:  { sx: 1.1, sy: 0.84, legs: 'crouch' },
  takeoff: { sx: 0.9, sy: 1.12, legs: 'jump', arms: 'down' },
  air:     { sx: 0.93, sy: 1.07, legs: 'jump', arms: 'out' },
  fall:    { sx: 0.98, sy: 1.02, legs: 'spread', arms: 'reach' },
  tongue:  { mouth: 'open' },
  gulp:    { eyes: 'closed', puff: 0.35, sx: 1.03 },
};

// opts.noLegs: només el cos, el cap i la cara; opts.raw: afegeix les dades dels píxels (per a la vista 3D)
function render(g, poseName, lookX = 0, lookY = 0, opts = {}) {
  const pose = POSES[poseName] || {};
  const sx = pose.sx || 1, sy = pose.sy || 1;
  const N = GW * GH;
  const col = new Array(N).fill(null);
  const lvl = new Int8Array(N);
  const idx = (x, y) => y * GW + x;
  const inb = (x, y) => x >= 0 && y >= 0 && x < GW && y < GH;

  // Estampa una màscara amb contorn i ombrejat propis
  function stamp(maskFn, colorFn, o = {}) {
    const inside = new Uint8Array(N);
    const list = [];
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      if (maskFn(x + 0.5, y + 0.5) && (!o.clip || o.clip[idx(x, y)])) { inside[idx(x, y)] = 1; list.push(x, y); }
    }
    const has = (x, y) => inb(x, y) && inside[idx(x, y)];
    if (o.outline !== false) {
      for (let i = 0; i < list.length; i += 2) {
        const x = list[i], y = list[i + 1];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (o.noOutlineAbove !== undefined && ny < o.noOutlineAbove) continue;
          if (inb(nx, ny) && !inside[idx(nx, ny)]) { col[idx(nx, ny)] = g.outline; lvl[idx(nx, ny)] = 0; }
        }
      }
    }
    for (let i = 0; i < list.length; i += 2) {
      const x = list[i], y = list[i + 1], k = idx(x, y);
      col[k] = colorFn ? colorFn(x, y) : o.color;
      let l = 0;
      if (o.shade !== false) {
        if (!has(x + 1, y + 1) || !has(x, y + 1)) l = -1;
        else if (o.soft && (!has(x, y + 2) || !has(x + 2, y + 1))) l = -1;
        else if (!has(x - 1, y - 1) || (o.soft && !has(x - 1, y - 2))) l = 1;
      }
      lvl[k] = l;
    }
    return inside;
  }
  const ellipse = (cx, cy, rx, ry) => (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  const rect = (x0, y0, x1, y1) => (x, y) => x >= x0 && x < x1 && y >= y0 && y < y1;
  const capsule = (ax, ay, bx, by, r) => (x, y) => {
    const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - ax - dx * t, y - ay - dy * t) <= r;
  };
  const both = (f) => (x, y) => f(x, y) || f(2 * CX - x, y);   // simetria

  const legHex = g.legColor === 'accent' ? g.accent : g.legColor === 'dark' ? shift(g.body, 0, 0, -0.12) : g.body;
  const footHex = g.feetAccent ? g.accent : legHex;

  // --- Geometria del cos segons la pose
  const legs = pose.legs || 'sit';
  const bodyW = g.bw * sx, bodyH = g.bh * sy;
  const raise = legs === 'jump' ? g.legLen : legs === 'spread' ? g.legLen * 0.45 : 0;
  const bottom = G - 1 - raise - (g.thighs === 'hidden' && legs === 'sit' ? 0 : 0);
  const cy = bottom - bodyH / 2, top = bottom - bodyH;
  // Coll: cap més ample a dalt, escletxa estreta just sota la boca i cos a sota
  const neckV = -0.08;
  const neckFactor = v => {
    if (!g.neck) return 1;
    const t = Math.max(0, Math.min(1, (v - (neckV - 0.1)) / 0.2)), sm = t * t * (3 - 2 * t);
    return (1 + (g.headW - 1) * (1 - sm)) * (1 - g.neck * Math.exp(-(((v - neckV) / 0.09) ** 2)));
  };
  const bodyMask = (x, y) => {
    const v = (y - cy) / (bodyH / 2);
    if (v < -1 || v > 1) return false;
    const w = bodyW * (1 + g.taper * v * 0.5) / (1 + g.taper * 0.5) * (1 + Math.max(0, g.taper) * 0.15)
      * (1 - g.waist * Math.exp(-(((v - 0.12) / 0.38) ** 2)))        // cintura
      * neckFactor(v);
    const u = (x - CX) / w;
    const p = v < 0 ? g.pTop : g.pBot;
    return Math.abs(u) ** p + Math.abs(v) ** p <= 1;
  };
  const U = x => (x - CX) / bodyW, V = y => (y - cy) / (bodyH / 2);

  // Ulls: posició (dins l'amplada del cap i sense tocar-se)
  const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
  let er = g.er;
  let eyeDX = g.cornerEyes ? bodyW : clampN(bodyW * g.eyeSpread, er + 1.2, Math.max(er + 1.2, g.eyeType === 'side' ? bodyW - er * 0.4 : g.eyeType === 'crescent' ? bodyW - er * 0.3 : bodyW * 0.9 - er));
  const eyeY = top + g.eyeDrop + er * 0.3;
  const small = g.eyeType === 'bead' || g.eyeType === 'dot';
  // Els ulls mai surten del cos pels costats: el sòcol ha de cabre dins l'amplada del cap
  // a l'alçada dels ulls (per als que sobresurten per dalt, just per sota del cim).
  {
    const halfAt = yy => { let hw = 0; while (hw < bodyW + 2 && bodyMask(CX + hw + 0.5, yy)) hw++; return hw; };
    const rows = small ? [eyeY - er, eyeY, eyeY + er] : [Math.max(eyeY, top + er * 0.9), Math.max(eyeY + er * 0.6, top + er * 1.4)];
    const half = Math.min(...rows.map(halfAt));
    const extra = small ? (g.beadStyle === 'moon' ? 2.2 : g.beadStyle === 'red' ? 1.8 : 1.4)
      : g.eyeType === 'calm' ? 1.7 : g.eyeType === 'happy' ? 1.2 : g.eyeType === 'crescent' ? 1.1 : 1.4;
    er = Math.max(1, Math.min(er, (half - 1.2 - extra) / 2));        // si el cap és estret, ulls més petits
    eyeDX = Math.max(er + 1.2, Math.min(eyeDX, half - er - extra));
  }
  const eyes = [CX - eyeDX, CX + eyeDX];

  // Boca: sota els ulls i sempre dins la meitat superior del cos
  let mouthY = Math.round(eyeY + (small ? er + 1.5 : er + 2.2) + g.mouthGap);
  mouthY = clampN(mouthY, Math.round(eyeY + 2), Math.round(top + bodyH * 0.55));
  if (g.neck) mouthY = Math.max(Math.round(eyeY + 2), Math.min(mouthY, Math.round(cy + neckV * bodyH / 2) - 1));   // boca al cap, sobre el coll
  const mouthW = g.mouth === 'small' ? 1.5 : Math.min(eyeDX + er * g.mouthW, bodyW * 0.8);
  // La zona inferior (panxa, braços) comença sota la boca
  const shoulderY = Math.max(mouthY + 3, bottom - Math.min(bodyH * (g.arms === 'long' ? 0.5 : 0.3), g.armLen));

  // --- Potes posteriors en salt (darrere del cos)
  if (!opts.noLegs && (legs === 'jump' || legs === 'spread')) {
    const hipX = bodyW * 0.6, r = g.thighs === 'bulky' ? 2.1 : g.thighs === 'slim' ? 1.4 : 1.7;
    const footX = legs === 'jump' ? hipX + g.legLen * 0.45 : hipX + g.legLen * 0.8;
    const footY = legs === 'jump' ? G - 1 : G - 1 - g.legLen * 0.2;
    stamp(both(capsule(CX - hipX, bottom - 2, CX - footX, footY - 1, r)), null, { color: legHex });
    stamp(both(rect(CX - footX - 2.5, footY - 1, CX - footX + 2, footY + 0.5)), null, { color: legHex, shade: false });
  }

  // --- Cos + patrons
  // Ulls a les cantonades: el front puja entre els ulls i s'hi uneix (un pont pla
  // a prop del cim dels ulls, amb un petit graó al mig)
  let headTop = top;
  let bridge = () => false;
  if (g.cornerEyes) {
    // la silueta del cap inclou els ulls: pell al voltant de cada ull i un sol contorn
    const yb = eyeY - er * 0.6, mid = Math.max(1.5, eyeDX * 0.35);
    const rx = er + 1.6, ry = er + 1.4;
    headTop = Math.min(top, yb, eyeY - ry);
    bridge = (x, y) => (Math.abs(x - CX) <= eyeDX && y <= top + 3 && y >= yb + (Math.abs(x - CX) < mid ? 1 : 0))
      || eyes.some(ex => ((x - ex) / rx) ** 2 + ((y - eyeY) / ry) ** 2 <= 1)
      || (Math.abs(x - CX) <= eyeDX + rx * 0.9 && y >= eyeY && y <= top + 3);        // costat del cap arran de l'ull
  }
  const bodyIn = stamp((x, y) => bodyMask(x, y) || bridge(x, y), null, { color: g.body, soft: true });
  // Volum: costat dret i part baixa més foscos, franja de llum a dalt a l'esquerra
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const k = idx(x, y);
    if (!bodyIn[k] || lvl[k] !== 0) continue;
    const u = U(x + 0.5), v = V(y + 0.5);
    if ((u > 0.62 && v > -0.35) || (v > 0.78 && Math.abs(u) > 0.35) || (u > 0.45 && v > 0.55)) lvl[k] = -1;
    else if (u < -0.3 && u > -0.8 && v < -0.25 && v > -0.9) lvl[k] = 1;
  }
  // opts.raw (vista 3D): nivell d'ombra de volum i color de pell de cada píxel, per
  // poder refer la llum en girar la granota sense perdre taques ni berrugues
  const vol = opts.raw ? new Int8Array(N) : null, volCol = opts.raw ? new Array(N).fill(null) : null;
  if (vol) for (let k = 0; k < N; k++) if (bodyIn[k]) vol[k] = lvl[k];
  applyPatterns(g, col, lvl, bodyIn, U, V, eyeY, cy, bodyH, idx, 'body');
  if (vol) for (let k = 0; k < N; k++) if (bodyIn[k]) volCol[k] = col[k];

  // --- Panxa
  if (g.bellyType !== 'none' && g.belly !== g.body) {
    let bm;
    const bt = mouthY + 2;
    if (g.bellyType === 'chin') bm = ellipse(CX, bt + 1.5, Math.max(3, eyeDX * 0.9), Math.min(3.5, (bottom - bt) * 0.3));
    else if (g.bellyType === 'big') bm = ellipse(CX, (bt + bottom) / 2 + 1, bodyW * g.bellyW, (bottom - bt) / 2 + 1);
    else if (g.bellyType === 'huge') bm = ellipse(CX, (bt + bottom) / 2 + 1.5, bodyW * 0.9, (bottom - bt) / 2 + 2.5);
    else if (g.bellyType === 'bib') {                 // pitet: ample sota la boca i estret a baix
      const top = bt - 0.5, h = bottom - top;
      bm = (x, y) => {
        const t = (y - top) / h;
        if (t < 0 || t > 1) return false;
        return Math.abs(x - CX) <= bodyW * g.bellyW * 1.05 + (bodyW * 0.16 + 1 - bodyW * g.bellyW * 1.05) * Math.pow(t, 0.7);
      };
    }
    else { const t2 = bt + (bottom - bt) * 0.2; bm = ellipse(CX, (t2 + bottom) / 2 + 1, bodyW * g.bellyW * 0.85, (bottom - t2) / 2 + 1); }
    // la panxa mai és blanca pura: com a la referència, sempre té una mica de to
    const [bh2, bs2, bl2] = hexToHsl(g.belly);
    const bellyHex = bl2 > 0.86 ? hslToHex(bh2, Math.max(bs2, 0.25), 0.84) : g.belly;
    const bIn = stamp(bm, null, { color: bellyHex, outline: false, clip: bodyIn, soft: true });
    // volum de la panxa: més fosca a baix i als costats, llum a dalt a l'esquerra
    let bTop = GH, bBot = 0;
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (bIn[idx(x, y)]) { bTop = Math.min(bTop, y); bBot = Math.max(bBot, y); }
    for (let y = bTop; y <= bBot; y++) {
      let x0 = GW, x1 = -1;
      for (let x = 0; x < GW; x++) if (bIn[idx(x, y)]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
      for (let x = x0; x <= x1; x++) {
        const k = idx(x, y);
        if (!bIn[k] || lvl[k] !== 0) continue;
        const t = (y - bTop) / Math.max(1, bBot - bTop), w = (x - x0) / Math.max(1, x1 - x0);
        if (t > 0.8 || (w > 0.82 && t > 0.3)) lvl[k] = -1;
        else if (w < 0.35 && t < 0.35) lvl[k] = 1;
      }
    }
    if (vol) for (let k = 0; k < N; k++) if (bIn[k]) { vol[k] = lvl[k]; volCol[k] = col[k]; }
    if (g.navel) {                                    // melic: línia i marca a la part baixa de la panxa
      const ny = Math.round(bottom - 4), nw = Math.round(bodyW * 0.3);
      for (let x = -nw; x < nw; x++) { const k = idx(CX + x, ny); if (bIn[k]) lvl[k] = -1; }
      for (const k of [idx(CX - 1, ny + 1), idx(CX, ny + 1)]) if (bIn[k]) lvl[k] = -1;
    }
    if (g.bellyType === 'ribbed') {
      for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
        const k = idx(x, y);
        if (bIn[k] && (y - Math.round(mouthY)) % 3 === 0 && Math.abs(x + 0.5 - CX) > 0.8) lvl[k] = -1;
      }
    }
  }

  // --- Cuixes i peus posteriors (asseguda / ajupida)
  if (!opts.noLegs && (legs === 'sit' || legs === 'crouch')) {
    const k = legs === 'crouch' ? 1.2 : 1;
    if (g.thighs !== 'hidden') {
      const tcx = bodyW - g.tw * 0.55, tcy = G - 1 - g.th * 0.9;
      const tIn = stamp(both(ellipse(CX - tcx * (legs === 'crouch' ? 1.04 : 1), tcy, g.tw * k, g.th)), null, { color: legHex, soft: true });
      applyPatterns(g, col, lvl, tIn, U, V, eyeY, cy, bodyH, idx, 'leg');
      const fx = tcx + g.tw * 0.6 * k;
      footRow(CX - fx - 4, CX - fx + 1, G - 1, -1);
    } else {
      footRow(CX - bodyW * 0.7 - 2, CX - bodyW * 0.7 + 2, G - 1, -1);
    }
  }

  // --- Braços
  if (!opts.noLegs && (g.arms !== 'hidden' || legs !== 'sit')) {
    // braços per dins de les cuixes i sense tocar-se entre ells
    const inner = g.thighs === 'hidden' ? bodyW * 0.75 : bodyW - g.tw * 1.2 - 1.5;
    const ax = Math.max(2.5, Math.min(bodyW * g.armX + 2.5, inner));
    const aw = g.arms === 'stubby' ? 1.9 : 1.4;
    const armStyle = pose.arms || 'sit';
    if (armStyle === 'sit') {
      // Braç com a la referència: neix del costat de la panxa fos amb el cos (sense
      // contorn a dalt), baixa amb un petit colze cap enfora, més gruixut a dalt,
      // i acaba en una mà ampla recolzada a terra que apunta cap endins.
      const len = legs === 'crouch' ? 0.6 : 1;
      const top = shoulderY + (1 - len) * 3;
      const sx = CX - ax + 0.6;
      const elx = CX - ax - (g.arms === 'stubby' ? 1.3 : 0.9), ely = top + (G - 2 - top) * 0.55;
      const wx = CX - ax + 0.4, wy = G - 2.4;
      const arm = (x, y) => capsule(sx, top, elx, ely, aw + 0.4)(x, y) || capsule(elx, ely, wx, wy, aw)(x, y);
      const aIn = stamp(both(arm), null, { color: legHex, soft: true, noOutlineAbove: Math.round(top) });
      // cara interna del braç il·luminada i externa ombrejada (el separa de la cuixa)
      for (let y = Math.ceil(top); y < G - 1; y++) for (let x = 0; x < GW; x++) {
        if (!aIn[idx(x, y)]) continue;
        const inward = x < CX ? 1 : -1;
        if (y < top + 1) lvl[idx(x, y)] = 0;
        else if (!aIn[idx(x + inward, y)]) lvl[idx(x, y)] = 1;
        else if (!aIn[idx(x - inward, y)]) lvl[idx(x, y)] = -1;
      }
      if (g.arms === 'long' && g.feetAccent) {          // ratlla de color a la cara interna del braç
        for (let y = Math.ceil(top + 2); y < G - 2; y++) {
          const t = (y - top) / (G - 2 - top), xs = Math.floor((t < 0.55 ? sx + (elx - sx) * t / 0.55 : elx + (wx - elx) * (t - 0.55) / 0.45) + aw * 0.6);
          dot(xs, y, g.accent); dot(2 * CX - xs - 1, y, g.accent);
        }
      }
      handRow(wx + 1, G - 1);
    } else if (armStyle === 'down') {
      stamp(both(capsule(CX - ax, shoulderY, CX - ax - 1, bottom + 3, aw)), null, { color: legHex });
    } else if (armStyle === 'out') {
      stamp(both(capsule(CX - ax, shoulderY, CX - bodyW - 2, shoulderY + 3, aw)), null, { color: legHex });
    } else if (armStyle === 'reach') {
      stamp(both(capsule(CX - ax, shoulderY, CX - ax - 3, G - 2, aw)), null, { color: legHex });
      handRow(CX - ax - 3, G - 1);
    }
  }

  function footRow(x0, x1, y, dir) {
    const m = g.feet === 'webbed' ? rect(x0 - 1, y - 1, x1, y + 1) : g.feet === 'fingers' ? rect(x0 - 1, y - 2, x1, y + 1) : rect(x0, y, x1, y + 1);
    stamp(both(m), null, { color: footHex, shade: false });
    if (g.feet === 'fingers') for (let x = Math.ceil(x0) + 1; x < x1 - 1; x += 2) for (let yy = y - 2; yy < y; yy++) { dot(x, yy, g.outline); dot(2 * CX - x - 1, yy, g.outline); }
    if (g.feet === 'toes') for (let x = Math.ceil(x0) + 1; x < x1 - 1; x += 2) { dot(x, y, g.outline); dot(2 * CX - x - 1, y, g.outline); }
    if (g.feet === 'pads') { dot(Math.floor(x0), y, variant(footHex, 1)); dot(2 * CX - Math.floor(x0) - 1, y, variant(footHex, 1)); }
  }
  // Mà: 5 píxels d'ample i 2 d'alt (3 amb dits llargs), amb tres dits separats
  // per píxels foscos a la fila de terra, com a la referència.
  function handRow(x, y) {
    const xi = Math.round(x);
    const both2 = (c, yy, colr, l = 0) => { dot(c, yy, colr, l); dot(2 * CX - c - 1, yy, colr, l); };
    if (g.feet === 'fingers') {                        // dits llargs marcats amb línies
      stamp(both(rect(xi - 2, y - 2, xi + 3, y + 1)), null, { color: footHex, shade: false });
      for (const c of [xi - 1, xi + 1]) for (let yy = y - 2; yy < y; yy++) both2(c, yy, g.outline);
      return;
    }
    const wide = 0;
    stamp(both(rect(xi - 2 - wide, y - 1, xi + 3, y + 1)), null, { color: footHex, shade: false });
    for (let c = xi - 2 - wide; c <= xi + 2; c++) both2(c, y - 1, footHex, 1);    // part de dalt il·luminada
    if (g.feet !== 'webbed') for (const c of [xi - 1, xi + 1]) both2(c, y, g.outline);
    if (g.arms === 'pads') for (const c of [xi - 2, xi, xi + 2]) both2(c, y, footHex, 1);
  }
  function dot(x, y, c, l = 0) { x = Math.floor(x); y = Math.floor(y); if (inb(x, y)) { col[idx(x, y)] = c; lvl[idx(x, y)] = l; } }

  // --- Gola inflada (sac vocal)
  if (pose.puff) {
    const rx = bodyW * 0.3 * (0.6 + 0.5 * pose.puff) + 1, ry = 1.5 + 3.5 * pose.puff;
    stamp(ellipse(CX, mouthY + 1 + ry, rx, ry), null, { color: variant(g.belly === g.body ? shift(g.body, 0, -0.1, 0.2) : g.belly, 1), soft: true });
  }

  // --- Banyes / celles
  if (g.horns) {
    for (const ex of eyes) {
      const d = Math.sign(ex - CX);
      stamp(capsule(ex - d * 0.5, eyeY - er - 0.5, ex + d * (er * 0.6), eyeY - er - 3.5, 1.1), null, { color: g.body });
    }
  }

  // --- Ulls
  const eyesState = pose.eyes || 'open';
  const lx = Math.round(lookX), ly = Math.round(lookY);
  const socketed = ['bulge', 'toad', 'white', 'knob', 'side', 'hooded', 'rim', 'oval', 'vivid'];
  const PC = '#0a0a10';
  for (const ex of eyes) {
    const t = g.eyeType;
    const d = Math.sign(ex - CX);                     // -1 ull esquerre, 1 dret
    if (t === 'crescent') {
      // Ull de mitja lluna: parpella clara a sobre, bola negra que arriba a la vora
      // del cap, mitja lluna daurada per la cara interna i per sota, i lluentor clara.
      stamp(ellipse(ex - d * 0.4, eyeY - er * 0.75, er + 0.6, er * 0.75), null, { color: shift(g.body, 0, -0.05, 0.13), soft: false });
      const rx = er, ry = er * 0.85;
      const moon = (x, y) => ellipse(ex, eyeY, rx + 1, ry + 1)(x, y) && !ellipse(ex, eyeY, rx, ry)(x, y)
        && y > eyeY - ry * 0.8 && ((x - ex) * d < rx * 0.35 || y > eyeY + ry * 0.55);
      if (eyesState === 'closed') {
        stamp(ellipse(ex, eyeY, rx + 1, ry + 1), null, { color: shift(g.body, 0, -0.05, 0.13), outline: false });
        for (let x = Math.floor(ex - rx + 0.5); x < ex + rx - 0.5; x++) dot(x, eyeY + 0.5, g.outline);
        continue;
      }
      stamp(moon, null, { color: g.moonColor, outline: false, shade: false });
      stamp(ellipse(ex, eyeY, rx, ry), null, { color: '#07060a', outline: false, shade: false });
      dot(ex - rx * 0.45, eyeY - ry * 0.25, g.belly !== g.body ? g.belly : '#f6dcae');
      if (eyesState === 'half') for (let y = Math.floor(eyeY - ry - 1); y < eyeY; y++) for (let x = Math.floor(ex - rx - 1); x <= ex + rx + 1; x++) {
        if (inb(x, y) && col[idx(x, y)] === '#07060a') { col[idx(x, y)] = shift(g.body, 0, -0.05, 0.13); lvl[idx(x, y)] = -1; }
      }
      continue;
    }
    if (t === 'calm') {
      // ulls tranquils: sòcol pàl·lid amb la línia de la parpella que surt cap enfora
      stamp(ellipse(ex, eyeY, er + 1.3, er + 1.1), null, { color: g.calmLid, soft: false });
      const ly2 = Math.floor(eyeY - er * (eyesState === 'closed' ? 0 : 0.3));
      for (let x = Math.floor(ex - er + 0.5); x <= ex + er + 1.5; x++) {
        const xx = d > 0 ? x : Math.floor(2 * ex) - x;       // cap enfora a cada costat
        dot(xx, ly2, g.outline);
      }
      dot(ex - d * (er - 1), ly2, variant(g.body, -1));
      continue;
    }
    if (t === 'happy') {
      // ulls tancats en arc (⌒), com les granotes contentes
      if (g.happySocket !== 'none') stamp(ellipse(ex, eyeY, er + 1.1, er + 0.8), null, { color: g.happySocket === 'white' ? '#f2f0e6' : g.lid, soft: false });
      for (let x = Math.floor(ex - er + 0.5); x < ex + er - 0.5; x++) {
        const u = (x + 0.5 - ex) / er;
        dot(x, eyeY + 0.5 + Math.round(u * u * er * 0.7) - er * 0.25, g.outline);
      }
      continue;
    }
    if (socketed.includes(t)) {
      // sòcol de l'ull (parpella), del color de la parpella
      const brx = t === 'oval' ? er * 0.8 : er, bry = t === 'oval' ? er * 1.15 : t === 'rim' ? er * 0.5 : er;
      stamp(ellipse(ex, eyeY, brx + 1.3, Math.max(bry, er * 0.9) + 1.1), null, { color: t === 'rim' ? g.rimColor : t === 'vivid' ? g.iris : g.lid, soft: false, outline: !g.cornerEyes });
      if (eyesState === 'closed') {
        stamp(ellipse(ex, eyeY, er, er * 0.9), null, { color: g.lid, outline: false });
        for (let x = Math.floor(ex - er + 0.5); x < ex + er - 0.5; x++) dot(x, eyeY + 0.5, g.outline);
        continue;
      }
      if (t === 'rim' || t === 'oval') {
        // ulls amb vora: ranura fosca dins un anell de color · ulls ovalats: grans, negres i brillants
        stamp(ellipse(ex + (t === 'rim' ? d * 0.5 : 0), eyeY, brx, bry), null, { color: PC, outline: false, shade: false });
        if (t === 'oval') {
          const hx = Math.round(ex - brx * 0.45 + lx * 0.5), hy = Math.round(eyeY - bry * 0.55);
          dot(hx, hy, '#ffffff'); if (er > 3) { dot(hx + 1, hy, '#ffffff'); dot(hx, hy + 1, '#ffffff'); dot(hx + 1, hy + 1, '#ffffff'); }
        }
        if (eyesState === 'half') for (let x = Math.floor(ex - brx - 1); x <= ex + brx + 1; x++) for (let y = Math.floor(eyeY - bry - 1); y < eyeY; y++) {
          if (inb(x, y) && col[idx(x, y)] === PC) { col[idx(x, y)] = g.lid; lvl[idx(x, y)] = -1; }
        }
        continue;
      }
      const ball = t === 'white' ? '#f2f0e6' : g.iris;
      const bIn = stamp(ellipse(ex, eyeY, er, er), null, { color: ball, outline: false, shade: false });
      const o = { color: PC, outline: false, shade: false, clip: bIn };
      const px = ex + lx * (er > 2.6 ? 1 : 0.5), py = eyeY + ly * (er > 3 ? 1 : 0);
      let hl = true;
      if (t === 'white') stamp(ellipse(px, py, Math.max(1.1, er * 0.5), Math.max(1.1, er * 0.55)), null, o);
      else if (g.pupil === 'round') stamp(ellipse(px, py, Math.max(0.9, er * 0.42), Math.max(0.9, er * 0.42)), null, o);
      else if (g.pupil === 'horiz') stamp(rect(px - er * 0.75, py - 0.5 - (er > 3.5 ? 0.5 : 0), px + er * 0.75, py + 0.5), null, o);
      else if (g.pupil === 'vert') stamp(rect(px - 0.5, py - er * 0.8, px + 0.5, py + er * 0.8), null, o);
      else if (g.pupil === 'ring') stamp(ellipse(ex + lx * 0.5, eyeY, Math.max(1, er - 1), Math.max(1, er - 1)), null, o);   // iris en anella
      else if (g.pupil === 'dot') { stamp(rect(Math.round(px) - 1, Math.round(py) - 1, Math.round(px) + (er > 2.4 ? 1 : 0), Math.round(py) + (er > 2.4 ? 1 : 0)), null, o); hl = false; }
      else stamp(ellipse(ex, eyeY, er, er), null, { color: '#0c0c14', outline: false, shade: false });           // full / shine
      // ombra inferior de l'iris i brillantor
      if (t !== 'white') for (let x = Math.floor(ex - er); x <= ex + er; x++) {
        const y = Math.floor(eyeY + er - 0.6);
        if (inb(x, y) && bIn[idx(x, y)] && col[idx(x, y)] === ball) lvl[idx(x, y)] = -1;
      }
      if (t === 'vivid') {                          // lluentor gran de 2 píxels
        dot(ex - er * 0.45, eyeY - er * 0.55, '#fff6f0'); dot(ex - er * 0.45, eyeY - er * 0.55 + 1, '#fff6f0');
      } else if (hl) {
        dot(ex - er * 0.45, eyeY - er * 0.45, '#ffffff');
        if (er > 3.4) dot(ex - er * 0.45 + 1, eyeY - er * 0.45, '#ffffff');
      }
      if (g.pupil === 'shine' && t !== 'white') dot(ex + er * 0.35, eyeY + er * 0.35, '#8a90a8');
      // parpella superior: plana, pesada (mig tancat) o enfadada (inclinada cap al centre)
      if (g.brow || eyesState === 'half') {
        let cut = t === 'hooded' ? 0.05 : t === 'toad' ? -0.35 : -0.6;
        if (g.angry) cut = Math.max(cut, -0.3);
        if (eyesState === 'half') cut = Math.max(cut, 0);
        const slope = g.angry ? 0.6 : 0;
        const cutAt = x => eyeY + er * cut + slope * (-(x + 0.5 - ex) * d);
        for (let y = Math.floor(eyeY - er - 1); y <= eyeY + er; y++) for (let x = Math.floor(ex - er - 1); x <= ex + er + 1; x++) {
          if (!inb(x, y) || !bIn[idx(x, y)]) continue;
          const cy2 = cutAt(x);
          if (y + 0.5 < cy2 - 0.5) { col[idx(x, y)] = g.lid; lvl[idx(x, y)] = -1; }
          else if (y + 0.5 < cy2 + 0.5) dot(x, y, g.outline);
        }
      }
    } else {
      // ulls petits encastats
      if (eyesState === 'closed') { for (let x = Math.floor(ex - er - 0.5); x < ex + er + 0.5; x++) dot(x, eyeY, g.outline); continue; }
      const d = Math.sign(ex - CX);
      const rx = er + 0.3, ry = er + (eyesState === 'half' ? -0.4 : 0.3);
      if (g.beadStyle === 'moon') {
        // com l'ull de mitja lluna: parpella clara a sobre i mitja lluna daurada per dins i per sota
        stamp((x, y) => ellipse(ex, eyeY, rx + 1, ry + 1)(x, y) && y < eyeY - ry * 0.55, null, { color: shift(g.body, 0, -0.05, 0.13), outline: false, shade: false });
        stamp((x, y) => ellipse(ex, eyeY, rx + 1, ry + 1)(x, y) && y > eyeY - ry * 0.55 && ((x - ex) * d < rx * 0.35 || y > eyeY + ry * 0.5),
          null, { color: g.moonColor, outline: false, shade: false });
      }
      const c = g.beadStyle === 'red' ? '#f0302c' : g.iris === g.body ? PC : (hexToHsl(g.iris)[2] > 0.5 ? PC : g.iris);
      stamp(ellipse(ex, eyeY, rx, ry), null, { color: g.beadStyle === 'moon' ? '#07060a' : c, outline: g.beadStyle === 'red', shade: false });
      if (g.beadStyle === 'red') {                 // com els ulls vius: iris vermell amb pupil·la vertical
        for (let y = Math.floor(eyeY - ry * 0.6); y < eyeY + ry * 0.6; y++) dot(ex + lx * 0.5 - 0.5, y, PC);
        dot(ex - rx * 0.5, eyeY - ry * 0.55, '#fff6f0');
      } else if (g.eyeType === 'bead') dot(ex - er * 0.5 + lx * 0.5, eyeY - er * 0.5, '#ffffff');
    }
  }
  if (g.brow && !g.angry && socketed.includes(g.eyeType)) {
    for (const ex of eyes) for (let x = Math.floor(ex - er); x <= ex + er; x++) {
      const y = Math.floor(eyeY - er - 1.2);
      if (inb(x, y) && col[idx(x, y)] && col[idx(x, y)] !== g.outline) lvl[idx(x, y)] = -1;
    }
  }

  // --- Boca
  const mc = g.outline;
  const mopen = pose.mouth === 'open';
  const mw = Math.round(mouthW);
  if (mopen || g.mouth === 'open') {
    const rx = mopen && g.mouth !== 'open' ? Math.max(2, Math.min(mw, 5)) : mw;
    const ry = mopen && g.mouth !== 'open' ? 2 : g.openH * (mopen ? 1.15 : 1);
    stamp(ellipse(CX, mouthY + ry * 0.5, rx, ry), null, { color: g.mouthIn, soft: true });
    if (g.mouth === 'open' && !mopen) {
      stamp(ellipse(CX, mouthY + ry * 1.1, rx * 0.6, ry * 0.45), null, { color: variant(g.mouthIn, 1), outline: false });
      for (let x = Math.floor(CX - rx + 1); x < CX + rx - 1; x++) if (col[idx(x, Math.floor(mouthY - ry * 0.5 + 1))] === g.mouthIn) dot(x, mouthY - ry * 0.5 + 1, '#f4f0e8');
    }
    if (mopen) stamp(ellipse(CX, mouthY + ry * 0.7, Math.max(1, rx * 0.45), 1), null, { color: g.tongue, outline: false });
  } else if (g.mouth !== 'none') {
    for (let x = -mw; x < mw; x++) {
      const e = Math.abs(x + 0.5) / mw;             // 0 al centre, 1 als extrems
      let dy = 0;
      if (g.mouth === 'smile' && e > 0.75) dy = -1;
      if (g.mouth === 'line' && e > 0.88) dy = -1;
      if (g.mouth === 'frown') dy = e > 0.8 ? 1 : 0;
      if (g.mouth === 'chevron') dy = Math.max(0, Math.ceil((Math.abs(x + 0.5) - Math.max(1.5, mw * 0.3)) / 2));   // boca de bigoti
      dot(CX + x, mouthY + dy, mc);
    }
    if (g.mouth === 'droop') for (const side of [-1, 1]) {   // boca ampla amb les puntes caigudes
      const onBody = (x, y) => inb(x, y) && col[idx(x, y)] && col[idx(x, y)] !== g.outline;
      for (let k = 0; k < g.droopLen; k++) { const x = CX + (side > 0 ? mw + k : -mw - 1 - k); if (onBody(x + side, mouthY + 1)) dot(x, mouthY + 1, mc); }
      const xe = CX + (side > 0 ? mw + g.droopLen : -mw - 1 - g.droopLen);
      if (onBody(xe + side, mouthY + 2)) dot(xe, mouthY + 2, mc);
    }
    if (g.mouth !== 'small') for (let x = -mw + 1; x < mw - 1; x++) {   // llavi inferior il·luminat
      const k = idx(CX + x, mouthY + 1);
      if (col[k] && col[k] !== g.outline) lvl[k] = 1;
    }
  }
  if (g.nostrils && mouthY - eyeY > 2) { dot(CX - 2, mouthY - 2, mc); dot(CX + 1, mouthY - 2, mc); }
  if (g.cheeks) for (const ex of eyes) {                    // galtes clares sota els ulls
    const d = Math.sign(ex - CX), cy3 = Math.round(eyeY + er + 2.2), cx3 = Math.round(ex + d * er * 0.4);
    for (const x of [cx3 - 1, cx3]) if (inb(x, cy3) && col[idx(x, cy3)] && col[idx(x, cy3)] !== g.outline) { col[idx(x, cy3)] = g.cheekColor; lvl[idx(x, cy3)] = 0; }
  }

  // --- A píxels
  const cv = document.createElement('canvas');
  cv.width = GW; cv.height = GH;
  const cx = cv.getContext('2d');
  const img = cx.createImageData(GW, GH);
  for (let k = 0; k < N; k++) {
    if (!col[k]) continue;
    const hex = variant(col[k], lvl[k]);
    const n = parseInt(hex.slice(1), 16);
    img.data[k * 4] = n >> 16 & 255; img.data[k * 4 + 1] = n >> 8 & 255; img.data[k * 4 + 2] = n & 255; img.data[k * 4 + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  const raw = opts.raw ? { col, lvl, vol, volCol, eyes, eyeY, er, mouthY, shoulderY, bottom, top, headTop, bodyW, bodyH } : undefined;
  return { canvas: cv, mouth: { x: CX, y: mouthY + 1 }, bodyW, top, cx: CX, g: G, raw };
}

function applyPatterns(g, col, lvl, mask, U, V, eyeY, cy, bodyH, idx, part) {
  const pc = g.pat;
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const k = idx(x, y);
    if (!mask[k] || col[k] === g.outline) continue;
    const u = U(x + 0.5), v = V(y + 0.5), au = Math.abs(u);
    for (const p of g.patterns) {
      switch (p.type) {
        case 'spots':
          for (const s of p.list) {
            const d = Math.hypot((u - s.u) * g.bw, (v - s.v) * g.bh / 2);
            if (d < s.r) { col[k] = p.ring && d > s.r - 1 ? g.outline : pc; break; }
          }
          break;
        case 'warts': {
          const h = hash2(x, y, p.seed);
          if (h < p.density) lvl[k] = 1;
          else if (hash2(x, y - 1, p.seed) < p.density) lvl[k] = -1;
          break;
        }
        case 'speckle':
          if (hash2(Math.round(u * 40), Math.round(v * 40), p.seed) < p.density) col[k] = pc;
          break;
        case 'freckle':
          if (v < 0.3 && hash2(Math.round(u * 30), Math.round(v * 30), p.seed) < p.density) lvl[k] = -1;
          break;
        case 'stripe':
          if (au < p.w && v < 0.7 && part === 'body') col[k] = pc;
          break;
        case 'lines':
          if (Math.abs(au - p.pos) < p.w && v < 0.6) col[k] = pc;
          break;
        case 'bands':
          if (Math.floor((v + 1) * p.k + p.phase + (part === 'leg' ? u * 3 : 0)) % 2 === 0 && (part === 'leg' || au > 0.15)) col[k] = pc;
          break;
        case 'blotch':
          if (noise2((au + 0.3) * p.scale * 2, (v + 2) * p.scale, p.seed) > p.thr) col[k] = pc;
          break;
        case 'mottle':
          if (noise2((au + 0.3) * p.scale * 3, (v + 2) * p.scale * 1.5, p.seed) > 0.62 && lvl[k] === 0) lvl[k] = -1;
          break;
        case 'mask':
          if (part === 'body' && Math.abs(y + 0.5 - eyeY) < 1.6 && au > 0.25) col[k] = g.outline === col[k] ? col[k] : shift(g.body, 0, 0, -0.28);
          break;
        case 'twotone':
          if (v > p.at || part === 'leg') col[k] = g.accent;
          break;
        case 'chevron':
          if (part === 'body' && Math.abs(((v * 3 + au * 2.2) % 1 + 1) % 1 - 0.5) < 0.12 && v > -0.6 && v < 0.5) col[k] = pc;
          break;
      }
    }
  }
}

// Cau de fotogrames per granota
function create(seed) {
  const g = genome(seed);
  const cache = new Map();
  return {
    g,
    // yaw: direcció cap on mira (0 = de cara, 1..7 = girs de 45°; vegeu src/vista3d.js).
    // De cara es fa servir el dibuix 2D; la resta de direccions, el model 3D.
    frame(pose, lx = 0, ly = 0, yaw = 0) {
      const key = pose + '|' + lx + '|' + ly + '|' + yaw;
      let f = cache.get(key);
      if (!f) {
        f = yaw && typeof Granota3D !== 'undefined' ? Granota3D.render(g, pose, yaw) : render(g, pose, lx, ly);
        cache.set(key, f);
      }
      return f;
    },
  };
}

return { create, genome, features, VERSION, GW, GH, G, CX, POSES, renderFront: (g, pose, opts) => render(g, pose, 0, 0, opts), util: { variant, shift, hexToHsl, hslToHex, hash2, noise2 } };
})();
