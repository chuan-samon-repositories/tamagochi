// Vistes de la granota des de qualsevol direcció (tres quarts, perfil, esquena).
//
// El volum surt del dibuix de cara de la mateixa granota, perquè girada continuï
// sent ella: cada fila de la silueta del cos (sense potes) és una el·lipse amb la
// mateixa amplada que de cara, i el gruix segueix el perfil d'una granota asseguda
// (morro endavant, esquena que baixa fins al cul). La meitat del davant es pinta
// amb els colors exactes del dibuix de cara (boca, panxa, taques, galtes) i
// l'esquena amb els colors de pell que hi ha a la mateixa alçada. Els ulls són esferes amb la textura dels ulls
// del dibuix, girades una mica cap als costats (així de perfil es veu l'ull).
// Cuixes, peus i braços són peces 3D amb les mides del genoma i els colors del
// dibuix. Als salts, el cos s'inclina i les potes del darrere s'estiren enrere,
// primes i llargues, amb el peu llarg i els dits oberts, com al full de sprites.
//
// Es dibuixa llançant un raig per píxel (projecció ortogràfica, càmera una mica
// per sobre), amb ombrejat en 3 tons i contorns com el pixel-art de cara.
// Eixos: x a la dreta de la imatge de cara, y amunt, z endavant (cap al morro).
// yaw 0..7 en passos de 45°: 0 = de cara, 2 = mira a la dreta, 4 = d'esquena,
// 6 = mira a l'esquerra.
//
// Portat gairebé literal des de github.com/ArnauSamonRos/RANA — solo el
// export ES module cambia; ver la nota en ./granota.js.
import { Granota } from './granota'

export const Granota3D = (() => {
  const { variant, shift } = Granota.util;
  const SW = Granota.GW, SH = Granota.GH, SCX = Granota.CX, SG = Granota.G;   // dibuix de cara
  const GW = 112, GH = 100, CX = 56, G = 90;                                  // llenç de les vistes 3D
  const PITCH = 15 * Math.PI / 180;                 // càmera una mica per sobre (com la vista de cara)
  const LIGHT = norm([-0.45, 0.72, 0.55]);
  const PC = '#0a0a10';
  const DEPTH = { gripau: 1.2, toro: 1.15, banyuda: 1.2, pluja: 0.95, arbre: 0.95, dard: 1.0, cintura: 1.0, bassa: 1.05 };
  const TILT = { takeoff: -0.14, air: 0.06, fall: 0.45 };   // salts: morro amunt (-) o avall (+)
  const RAISE = { takeoff: 1, air: 1, fall: 0.45 };          // alçada del cos (× llargada de les potes)
  const EYE_OUT = 0.5;                               // els ulls miren ~30° cap als costats

  function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lightLevel = ndl => ndl > 0.75 ? 1 : ndl < -0.3 ? -2 : ndl < 0.12 ? -1 : 0;

  // ---- Volum a partir del dibuix de cara ------------------------------------
  function volume(g, R, jump) {
    const N = SW * SH;
    const col = R.col.slice(), lv = Int8Array.from(R.lvl), dl = new Int8Array(N), skin = new Uint8Array(N), mask = new Uint8Array(N);
    for (let k = 0; k < N; k++) {
      if (!col[k]) continue;
      mask[k] = 1;
      // pell: es refà la llum en 3D i es conserven les marques (berrugues, melic...)
      if (R.volCol[k] && col[k] === R.volCol[k]) { skin[k] = 1; dl[k] = R.lvl[k] - R.vol[k]; }
    }
    // el contorn de la silueta pren el color del píxel interior del costat (el 3D fa el seu contorn)
    const cy0 = (R.top + R.bottom) / 2;
    const isIn = (x, y) => x >= 0 && y >= 0 && x < SW && y < SH && mask[y * SW + x];
    const ring = (x, y) => isIn(x, y) && R.col[y * SW + x] === g.outline && (!isIn(x + 1, y) || !isIn(x - 1, y) || !isIn(x, y + 1) || !isIn(x, y - 1));
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
      if (!ring(x, y)) continue;
      const k = y * SW + x;
      let best = -1, bd = 1e9;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const nx = x + dx, ny = y + dy, q = ny * SW + nx;
        if (!isIn(nx, ny) || ring(nx, ny) || R.col[q] === g.outline) continue;
        const d = Math.hypot(nx + 0.5 - SCX, (ny - cy0) * 0.8);          // cap al centre del cos
        if (d < bd) { bd = d; best = q; }
      }
      if (best >= 0) { col[k] = R.col[best]; lv[k] = R.lvl[best]; skin[k] = skin[best]; dl[k] = dl[best]; }
      else { col[k] = g.body; lv[k] = 0; skin[k] = 1; dl[k] = 0; }
    }
    let top = SH, bottom = 0, x0 = SW, x1 = 0;
    for (let k = 0; k < N; k++) {
      if (!mask[k]) continue;
      const x = k % SW, y = (k - x) / SW;
      top = Math.min(top, y); bottom = Math.max(bottom, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    }
    // Cada fila de la silueta és una el·lipse (la mateixa amplada que de cara); C diu
    // quina fracció del gruix de la fila hi ha a cada píxel (1 al mig, 0 a la vora).
    // (el que sobresurt per sobre del cap, els sòcols dels ulls, ja ho fan les esferes dels ulls)
    const vmask = new Uint8Array(N);
    for (let k = 0; k < N; k++) vmask[k] = mask[k] && Math.floor(k / SW) + 0.5 >= R.headTop ? 1 : 0;
    const C = new Float32Array(N).fill(-0.3), segW = new Float32Array(SH);
    for (let y = 0; y < SH; y++) {
      let x = 0;
      while (x < SW) {
        if (!vmask[y * SW + x]) { x++; continue; }
        const xa = x;
        while (x < SW && vmask[y * SW + x]) x++;
        const xm = (xa + x) / 2, w = (x - xa) / 2;
        if (xa <= SCX && x >= SCX) segW[y] = Math.max(segW[y], w);
        for (let i = xa; i < x; i++) C[y * SW + i] = Math.sqrt(Math.max(0.02, 1 - ((i + 0.5 - xm) / w) ** 2));
      }
    }
    for (let pass = 0; pass < 2; pass++) {                              // suavitza (sense esglaons de llum)
      const C2 = C.slice();
      for (let y = 1; y < SH - 1; y++) for (let x = 1; x < SW - 1; x++) {
        const k = y * SW + x;
        if (!vmask[k]) continue;
        let sum = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const q = k + dy * SW + dx; if (vmask[q]) { sum += C[q]; n++; } }
        C2[k] = sum / n;
      }
      C.set(C2);
    }
    // Perfil de costat d'una granota (en mitges amplades del cos), de dalt del cap (0)
    // a terra (1): davant (morro a l'alçada de la boca, gola, pit) i esquena fins al cul.
    // unitat de profunditat: mitja amplada, o més si el cos és alt (de costat ha de ser llarga)
    const Hb = Math.max(1, R.bottom - R.top), W = clamp(Hb * 0.62, R.bodyW, R.bodyW * 1.25), dk = DEPTH[g.arch] || 1.05;
    const ym = clamp((R.mouthY - R.top) / Hb, 0.2, 0.5);
    const F = jump ? [[0, 0.35], [0.1, 0.7], [ym, 1.05], [ym + 0.12, 0.8], [0.7, 0.72], [1, 0.35]]
      : [[0, 0.25], [0.08, 0.55], [ym * 0.6, 0.8], [ym, 0.95], [ym + 0.1, 0.72], [0.65, 0.78], [0.9, 0.62], [1, 0.35]];
    const B = jump ? [[0, -0.3], [0.12, -0.7], [0.45, -1.3], [0.7, -1.45], [0.9, -1.2], [1, -0.75]]
      : [[0, -0.2], [0.1, -0.45], [0.5, -0.85], [0.8, -1.15], [0.93, -1.1], [1, -0.8]];
    let zc = new Float32Array(SH), D = new Float32Array(SH);
    const Wm = Math.max(...segW);
    for (let y = 0; y < SH; y++) {
      const yn = clamp((y + 0.5 - R.top) / Hb, 0, 1);
      const f = interp(F, yn) * (0.9 + 0.1 * dk), b = interp(B, yn) * dk;
      zc[y] = (f + b) / 2 * W;
      // cim del cap arrodonit; files estretes (coll, cap petit) també més primes
      const round = yn < 0.12 ? 0.35 + 0.65 * Math.sqrt(1 - (1 - yn / 0.12) ** 2) : 1;
      D[y] = (f - b) / 2 * W * round * clamp(segW[y] / (0.8 * Wm), 0.35, 1) ** 0.6;
    }
    for (let pass = 0; pass < 3; pass++) {                              // suavitza entre files
      const z2 = zc.slice(), d2 = D.slice();
      for (let y = 1; y < SH - 1; y++) { z2[y] = (zc[y - 1] + 2 * zc[y] + zc[y + 1]) / 4; d2[y] = (D[y - 1] + 2 * D[y] + D[y + 1]) / 4; }
      zc = z2; D = d2;
    }
    return { col, lv, dl, skin, mask, C, zc, D, W, segW, top, bottom, x0, x1 };
  }
  const interp = (pts, x) => {
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) {
      const [xa, ya] = pts[i - 1], [xb, yb] = pts[i];
      return ya + (yb - ya) * (x - xa) / Math.max(1e-6, xb - xa);
    }
    return pts[pts.length - 1][1];
  };

  // Consultes sobre el volum en coordenades del model (X, Y; Z endavant)
  function sampler(V) {
    const cAt = (x, y) => x < 0 || y < 0 || x >= SW || y >= SH ? -0.3 : V.C[y * SW + x];
    const C = (X, Y) => {
      const fx = X + SCX - 0.5, fy = SG - Y - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
      return (cAt(x0, y0) * (1 - ax) + cAt(x0 + 1, y0) * ax) * (1 - ay) + (cAt(x0, y0 + 1) * (1 - ax) + cAt(x0 + 1, y0 + 1) * ax) * ay;
    };
    const row = (arr, Y) => { const fy = clamp(SG - Y - 0.5, 0, SH - 1.001), y0 = Math.floor(fy), a = fy - y0; return arr[y0] * (1 - a) + arr[y0 + 1] * a; };
    const front = (X, Y) => row(V.zc, Y) + row(V.D, Y) * Math.max(0, C(X, Y));
    const back = (X, Y) => row(V.zc, Y) - row(V.D, Y) * Math.max(0, C(X, Y));
    const inside = (X, Y, Z) => {
      const c = C(X, Y);
      return c > 0 && Math.abs(Z - row(V.zc, Y)) <= row(V.D, Y) * c;
    };
    // píxel del dibuix de cara corresponent (el més proper dins la silueta)
    const pix = (X, Y) => {
      const x = clamp(Math.floor(X + SCX), 0, SW - 1), y = clamp(Math.floor(SG - Y), 0, SH - 1);
      const k = y * SW + x;
      if (V.mask[k]) return k;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < SW && ny < SH && V.mask[ny * SW + nx]) return ny * SW + nx;
      }
      return k;
    };
    return { row, front, back, inside, pix };
  }

  // ---- Peces 3D (ulls, sac vocal, potes, braços) -----------------------------
  // El·lipsoide amb rotació opcional al voltant de l'eix x; càpsula entre dos punts.
  function ell(part, c, r, rotX = 0) { return { kind: 'ell', part, c, r, cs: Math.cos(rotX), sn: Math.sin(rotX) }; }
  function cap(part, a, b, r) { return { kind: 'cap', part, a, b, r }; }
  function hitEll(e, o, d) {
    const ox = o[0] - e.c[0], oy = o[1] - e.c[1], oz = o[2] - e.c[2];
    const ly = oy * e.cs + oz * e.sn, lz = -oy * e.sn + oz * e.cs;
    const dy = d[1] * e.cs + d[2] * e.sn, dz = -d[1] * e.sn + d[2] * e.cs;
    const qx = ox / e.r[0], qy = ly / e.r[1], qz = lz / e.r[2];
    const ux = d[0] / e.r[0], uy = dy / e.r[1], uz = dz / e.r[2];
    const A = ux * ux + uy * uy + uz * uz, B = 2 * (qx * ux + qy * uy + qz * uz), C = qx * qx + qy * qy + qz * qz - 1;
    const disc = B * B - 4 * A * C;
    if (disc < 0) return null;
    const t = (-B - Math.sqrt(disc)) / (2 * A);
    if (t < 0) return null;
    const px = ox + d[0] * t, py = ly + dy * t, pz = lz + dz * t;
    const nl = [px / (e.r[0] * e.r[0]), py / (e.r[1] * e.r[1]), pz / (e.r[2] * e.r[2])];
    return { t, n: norm([nl[0], nl[1] * e.cs - nl[2] * e.sn, nl[1] * e.sn + nl[2] * e.cs]) };
  }
  function hitCap(c, o, d) {
    const ba = [c.b[0] - c.a[0], c.b[1] - c.a[1], c.b[2] - c.a[2]], oa = [o[0] - c.a[0], o[1] - c.a[1], o[2] - c.a[2]];
    const baba = dot(ba, ba), bard = dot(ba, d), baoa = dot(ba, oa), rdoa = dot(d, oa), oaoa = dot(oa, oa);
    const A = baba - bard * bard, B = baba * rdoa - baoa * bard, C = baba * oaoa - baoa * baoa - c.r * c.r * baba;
    let t = -1;
    if (A > 1e-9) {
      const h = B * B - A * C;
      if (h < 0) return null;
      t = (-B - Math.sqrt(h)) / A;
      const y = baoa + t * bard;
      if (!(y > 0 && y < baba)) t = -1;
    }
    if (t < 0) {                                      // extrems esfèrics
      for (const end of [c.a, c.b]) {
        const oc = [o[0] - end[0], o[1] - end[1], o[2] - end[2]], b = dot(d, oc), h = b * b - (dot(oc, oc) - c.r * c.r);
        if (h > 0) { const tt = -b - Math.sqrt(h); if (tt > 0 && (t < 0 || tt < t)) t = tt; }
      }
      if (t < 0) return null;
    }
    const p = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
    const pa = [p[0] - c.a[0], p[1] - c.a[1], p[2] - c.a[2]], s = clamp(dot(pa, ba) / baba, 0, 1);
    return { t, n: norm([pa[0] - ba[0] * s, pa[1] - ba[1] * s, pa[2] - ba[2] * s]) };
  }
  const hitPart = (e, o, d) => e.kind === 'ell' ? hitEll(e, o, d) : hitCap(e, o, d);

  // Model 3D d'una granota en una pose (no depèn de cap a on mira: es guarda)
  function model(g, poseName) {
    const pose = Granota.POSES[poseName] || {};
    const jump = poseName in TILT;
    // als salts el cos és el de repòs (sense estirar-lo cap amunt) i s'aixeca i s'inclina aquí
    const R = Granota.renderFront(g, jump ? 'idle' : poseName, { noLegs: true, raw: true }).raw;
    const full = jump ? null : Granota.renderFront(g, poseName, { raw: true }).raw;   // colors de cuixes i peus
    const V = volume(g, R, jump), S = sampler(V);
    const W = R.bodyW, U = V.W;                         // U: unitat de profunditat
    const legHex = g.legColor === 'accent' ? g.accent : g.legColor === 'dark' ? shift(g.body, 0, 0, -0.12) : g.body;
    const footHex = g.feetAccent ? g.accent : legHex;
    const SKIN = new Set([g.body, g.pat, g.accent, legHex, footHex, shift(g.body, 0, 0, -0.28)]);
    const LIMB = new Set([legHex, footHex, g.pat, g.accent]);

    // Inclinació del cos als salts (al voltant del seu centre) i alçada mínima
    const tilt = TILT[poseName] || 0, ct = Math.cos(tilt), st = Math.sin(tilt);
    const pv = [0, SG - (V.top + V.bottom + 1) / 2, 0];
    let lift = jump ? g.legLen * RAISE[poseName] : 0;
    const toWorld = b => { const y = b[1] - pv[1], z = b[2] - pv[2]; return [b[0], pv[1] + y * ct - z * st + lift, pv[2] + y * st + z * ct]; };
    const toBody = w => { const y = w[1] - pv[1] - lift, z = w[2] - pv[2]; return [w[0], pv[1] + y * ct + z * st, pv[2] - y * st + z * ct]; };
    const dirWorld = v => [v[0], v[1] * ct - v[2] * st, v[1] * st + v[2] * ct];
    const dirBody = v => [v[0], v[1] * ct + v[2] * st, -v[1] * st + v[2] * ct];
    let zmin = 1e9, zmax = -1e9, minY = 1e9;
    for (let y = V.top; y <= V.bottom; y++) for (let x = V.x0; x <= V.x1; x++) {
      if (!V.mask[y * SW + x]) continue;
      const X = x + 0.5 - SCX, Y = SG - y - 0.5, f = S.front(X, Y), b = S.back(X, Y);
      zmin = Math.min(zmin, b); zmax = Math.max(zmax, f);
      minY = Math.min(minY, toWorld([X, Y, f])[1], toWorld([X, Y, b])[1]);
    }
    if (jump && minY < 1.5) lift += 1.5 - minY;
    const box = [V.x0 - SCX - 1, SG - V.bottom - 2, zmin - 1, V.x1 + 1 - SCX + 1, SG - V.top + 1, zmax + 1];

    // --- ulls: esferes amb la textura dels ulls del dibuix
    const t = g.eyeType, small = t === 'bead' || t === 'dot', flat = t === 'happy' || t === 'calm';
    const socket = t === 'vivid' ? g.iris : t === 'rim' ? g.rimColor : t === 'crescent' ? shift(g.body, 0, -0.05, 0.13)
      : t === 'calm' ? g.calmLid : t === 'happy' ? (g.happySocket === 'white' ? '#f2f0e6' : g.happySocket === 'none' ? g.body : g.lid)
      : small ? g.body : g.lid || g.body;
    const Rt = small ? R.er + 0.6 : R.er + 1.3;                          // radi del sòcol de l'ull
    const bodyParts = [], parts = [];
    const eyeY = SG - R.eyeY;
    for (const ex of R.eyes) {
      const X = ex - SCX, sgn = Math.sign(X) || 1;
      const z = S.front(X, Math.min(eyeY, SG - R.top - 1)) - Rt * (small ? 0.45 : 0.5);
      const e = ell('eye', [X, eyeY, z], [Rt, Rt, Rt]);
      e.ex = ex; e.cf = Math.cos(EYE_OUT * sgn); e.sf = Math.sin(-EYE_OUT * sgn);
      bodyParts.push(e);
      if (g.horns) bodyParts.push(cap('horn', [X - sgn * 0.5, SG - (R.eyeY - R.er - 0.5), z - 0.5], [X + sgn * R.er * 0.6, SG - (R.eyeY - R.er - 3.5), z - 1.5], 1.1));
    }
    // zona de l'ull al dibuix (amb el seu contorn i les línies de parpella): a la cara
    // hi va pell, perquè l'ull i el sòcol ja els porta l'esfera
    const inEye = (X, Y) => R.eyes.some(ex => Math.hypot(X - (ex - SCX), Y - eyeY) < Rt + 1.5);
    // la boca continua pels costats del cap fins a sota l'ull
    const mouthY = SG - R.mouthY - 0.5, mouthBack = bodyParts[0].c[2] - Rt * 0.3;
    const mouthSide = p => g.mouth !== 'none' && g.mouth !== 'small' && Math.abs(p[1] - mouthY) < 0.5 && p[2] > mouthBack;
    // --- sac vocal inflat
    if (pose.puff) {
      const rx = W * 0.3 * (0.6 + 0.5 * pose.puff) + 1, ry = 1.5 + 3.5 * pose.puff, Y = SG - (R.mouthY + 1 + ry);
      const e = ell('sac', [0, Y, S.front(0, Y) - ry * 0.45], [rx, ry, ry * 1.1]);
      e.color = R.col[S.pix(0, Y)] || g.belly;
      bodyParts.push(e);
    }

    // --- potes i braços
    const toesAt = (base, dir, s, len, r) => {
      for (const j of [-1, 0, 1]) {
        const d2 = norm([dir[0] + s * 0.3 * j, dir[1] + 0.42 * j, dir[2]]);
        const tip = [base[0] + d2[0] * len, base[1] + d2[1] * len, base[2] + d2[2] * len];
        parts.push(cap('toe', base, tip, r));
        if (g.feet === 'pads') parts.push(ell('pad', tip, [r + 0.35, r + 0.35, r + 0.35]));
      }
    };
    if (!jump) {
      const crouch = pose.legs === 'crouch', k = crouch ? 1.2 : 1;
      const footW = g.feet === 'webbed' ? 3 : 2.3;
      const foot = (s, fx) => {
        const fz = U * 0.1, fl = U * 0.52;
        parts.push(ell('foot', [s * fx, 0.9, fz], [footW, 0.95, fl]));
        if (g.feet !== 'webbed') toesAt([s * fx, 0.8, fz + fl * 0.8], [s * 0.15, 0, 1], s, 2.4, 0.6);
      };
      if (g.thighs !== 'hidden') {
        // la cuixa sobresurt pel costat del cos (a l'alçada on és, el cos pot ser més ample)
        const rowW = V.segW[clamp(Math.round(SG - g.th), 0, SH - 1)] || W;
        const tcx = Math.max(W - g.tw * 0.55, rowW - g.tw * 0.35) * (crouch ? 1.04 : 1), fx = tcx + g.tw * 0.6 * k - 1.5;
        for (const s of [-1, 1]) {
          parts.push(ell('thigh', [s * tcx, g.th * 0.9 + 0.3, -U * 0.5], [g.tw * k * 0.95, g.th, U * 0.62], 0.12));
          parts.push(cap('leg', [s * (tcx + g.tw * 0.45), 1.6, U * 0.15], [s * (tcx + g.tw * 0.5), 1.3, -U * 1.0], 1.3));
          foot(s, fx);
        }
      } else for (const s of [-1, 1]) foot(s, W * 0.7);
      if (g.arms !== 'hidden') {
        const inner = g.thighs === 'hidden' ? W * 0.75 : W - g.tw * 1.2 - 1.5;
        const ax = Math.max(2.5, Math.min(W * g.armX + 2.5, inner));
        const aw = g.arms === 'stubby' ? 1.9 : 1.4;
        const Ys = SG - (R.shoulderY + (crouch ? 1.2 : 0));
        for (const s of [-1, 1]) {
          const zs = S.front(s * ax, Ys) - aw * 1.3;
          const zh = Math.max(zs + 1.5, S.front(s * ax, 2.5) + 1.2);
          const sh = [s * (ax - 0.4), Ys, zs], el = [s * (ax + 1), Ys * 0.45 + 0.5, (zs + zh) / 2 + 0.8], hd = [s * (ax - 0.4), 1.1, zh];
          parts.push(cap('arm', sh, el, aw + 0.3), cap('arm', el, hd, aw));
          parts.push(ell('hand', [hd[0], 0.85, hd[2] + 0.6], [2.4, 0.85, 2.2]));
          if (g.arms === 'pads' || g.feet === 'fingers') toesAt([hd[0], 0.8, hd[2] + 1.8], [-s * 0.2, 0, 1], s, 1.6, 0.55);
        }
      }
    } else {
      // Salt: potes del darrere primes i llargues, estirades enrere des del cul
      const Yb = SG - V.bottom - 0.5;
      const thin = clamp(g.tw * 0.26, 1.1, 1.9);
      const Lleg = clamp(g.legLen * 2, U * 1.4, 32);
      for (const s of [-1, 1]) {
        const hx = s * W * 0.42, hy = Yb + U * 0.35;
        const hip = toWorld([hx, hy, S.back(hx, hy) + U * 0.35]);
        const a = poseName === 'takeoff' ? Math.asin(clamp((hip[1] - 1.2) / Lleg, 0.15, 0.95)) : poseName === 'air' ? 0.16 : -0.5;
        const dir = norm([s * 0.1, -Math.sin(a), -Math.cos(a)]);
        const P = f => [hip[0] + dir[0] * Lleg * f, hip[1] + dir[1] * Lleg * f, hip[2] + dir[2] * Lleg * f];
        const knee = P(0.4), ankle = P(0.78), toe = P(1);
        knee[1] -= 0.8;                                   // genoll lleugerament doblegat
        parts.push(cap('thigh', hip, knee, thin * 1.45), cap('leg', knee, ankle, thin), cap('foot', ankle, toe, Math.max(0.8, thin * 0.75)));
        toesAt(toe, dir, s, 3, 0.6);
      }
      const ax = W * 0.5, Ys = SG - R.shoulderY;
      for (const s of [-1, 1]) {
        const zf = S.front(s * ax, Ys);
        const sh = toWorld([s * ax, Ys, zf - 1.8]);
        const hd = pose.arms === 'down' ? toWorld([s * (ax + 0.5), Ys - U * 0.55, zf - U * 0.5])
          : pose.arms === 'out' ? toWorld([s * (ax + 3), Ys - 2.5, zf + 2.5])
          : [sh[0] + s * 1.5, Math.max(0.9, sh[1] - U * 1.1), sh[2] + U * 0.45];
        parts.push(cap('arm', sh, hd, 1.25), ell('hand', hd, [1.7, 0.8, 1.7]));
      }
    }

    return { R, V, S, full, legHex, footHex, SKIN, LIMB, toWorld, toBody, dirWorld, dirBody, box, parts, bodyParts, socket, Rt, inEye, mouthSide, small, flat };
  }

  const models = new WeakMap();
  function render(g, poseName, yaw) {
    let byPose = models.get(g);
    if (!byPose) models.set(g, byPose = new Map());
    let M = byPose.get(poseName);
    if (!M) byPose.set(poseName, M = model(g, poseName));
    const { R, V, S, full, legHex, footHex, SKIN, LIMB, toWorld, toBody, dirWorld, dirBody, box, parts, bodyParts, socket, Rt, inEye, mouthSide, small, flat } = M;

    // --- càmera
    const th = yaw * Math.PI / 4, cy = Math.cos(th), sy = Math.sin(th), cp = Math.cos(PITCH), sp = Math.sin(PITCH);
    const toObj = v => {
      const y1 = v[1] * cp + v[2] * sp, z1 = -v[1] * sp + v[2] * cp, x1 = v[0];
      return [x1 * cy - z1 * sy, y1, x1 * sy + z1 * cy];
    };
    const toView = v => {
      const x1 = v[0] * cy + v[2] * sy, z1 = -v[0] * sy + v[2] * cy, y1 = v[1];
      return [x1, y1 * cp - z1 * sp, y1 * sp + z1 * cp];
    };
    const dW = toObj([0, 0, -1]), dB = dirBody(dW);
    // només es llancen raigs dins el rectangle que ocupa la granota
    const pts = [];
    for (let i = 0; i < 8; i++) pts.push(toWorld([box[i & 1 ? 3 : 0], box[i & 2 ? 4 : 1], box[i & 4 ? 5 : 2]]));
    for (const e of parts) {
      const m = e.kind === 'ell' ? Math.max(...e.r) : e.r;
      for (const c of e.kind === 'ell' ? [e.c] : [e.a, e.b]) for (let i = 0; i < 8; i++) pts.push([c[0] + (i & 1 ? m : -m), c[1] + (i & 2 ? m : -m), c[2] + (i & 4 ? m : -m)]);
    }
    // si les potes estirades no hi caben, es desplaça el dibuix (cx diu on és l'origen)
    let vx0 = 1e9, vx1 = -1e9, vy0 = 1e9, vy1 = -1e9;
    for (const p of pts) {
      const v = toView(p);
      vx0 = Math.min(vx0, v[0]); vx1 = Math.max(vx1, v[0]); vy0 = Math.min(vy0, v[1]); vy1 = Math.max(vy1, v[1]);
    }
    let ox = 0;
    if (CX + vx0 < 2) ox = Math.ceil(2 - (CX + vx0));                 // marge per al contorn
    if (CX + vx1 + ox > GW - 2) ox = vx1 - vx0 > GW - 4 ? Math.round(GW / 2 - CX - (vx0 + vx1) / 2) : Math.floor(GW - 2 - (CX + vx1));
    const cxo = CX + ox;
    const px0 = Math.max(0, Math.floor(cxo + vx0) - 1), px1 = Math.min(GW - 1, Math.ceil(cxo + vx1) + 1);
    const py0 = Math.max(0, Math.floor(G - vy1) - 1), py1 = Math.min(GH - 1, Math.ceil(G - vy0) + 1);

    function marchBody(o, d) {
      let t0 = -1e9, t1 = 1e9;
      for (let i = 0; i < 3; i++) {
        if (Math.abs(d[i]) < 1e-9) { if (o[i] < box[i] || o[i] > box[i + 3]) return null; continue; }
        let a = (box[i] - o[i]) / d[i], b = (box[i + 3] - o[i]) / d[i];
        if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, b);
      }
      if (t0 >= t1) return null;
      const step = 0.5;
      for (let tt = t0; tt <= t1; tt += step) {
        if (!S.inside(o[0] + d[0] * tt, o[1] + d[1] * tt, o[2] + d[2] * tt)) continue;
        let a = Math.max(t0, tt - step), b = tt;
        for (let i = 0; i < 6; i++) {
          const m = (a + b) / 2;
          if (S.inside(o[0] + d[0] * m, o[1] + d[1] * m, o[2] + d[2] * m)) b = m; else a = m;
        }
        return b;
      }
      return null;
    }
    function bodyNormal(p) {
      const X = p[0], Y = p[1], e = 1.2;
      const isFront = p[2] >= S.row(V.zc, Y);
      const f = isFront ? S.front : S.back;
      const dx = (f(X + e, Y) - f(X - e, Y)) / (2 * e), dy = (f(X, Y + e) - f(X, Y - e)) / (2 * e);
      return { n: isFront ? norm([-dx, -dy, 1]) : norm([dx, dy, -1]), isFront };
    }
    const levelOf = nBody => lightLevel(dot(toView(dirWorld(nBody)), LIGHT));

    const N = GW * GH;
    const col = new Array(N).fill(null), lvl = new Int8Array(N), depth = new Float32Array(N).fill(1e9), pid = new Int16Array(N).fill(-1);
    for (let py = py0; py <= py1; py++) for (let px = px0; px <= px1; px++) {
      const oW = toObj([px + 0.5 - cxo, G - (py + 0.5), 300]), oB = toBody(oW);
      let best = marchBody(oB, dB), bi = 0, bn = null;
      bodyParts.forEach((e, i) => { const h = hitPart(e, oB, dB); if (h && (best === null || h.t < best)) { best = h.t; bi = i + 1; bn = h.n; } });
      parts.forEach((e, i) => { const h = hitPart(e, oW, dW); if (h && (best === null || h.t < best)) { best = h.t; bi = 100 + i; bn = h.n; } });
      if (best === null) continue;
      const k = py * GW + px;
      depth[k] = best; pid[k] = bi;
      let c, l;
      if (bi === 0) {                                     // cos
        const p = [oB[0] + dB[0] * best, oB[1] + dB[1] * best, oB[2] + dB[2] * best];
        const { n, isFront } = bodyNormal(p), l3 = levelOf(n), q = S.pix(p[0], p[1]);
        if (mouthSide(p)) { c = g.outline; l = 0; }
        else if (isFront && inEye(p[0], p[1])) { c = g.body; l = l3; }
        else if (isFront) {
          c = V.col[q];
          if (V.skin[q]) l = clamp(l3 + V.dl[q], -2, 1);
          else { l = V.lv[q]; if (l3 === -2 && l === 0) l = -1; }
        } else {
          c = SKIN.has(V.col[q]) ? V.col[q] : g.body;
          l = clamp(l3 + (V.skin[q] ? V.dl[q] : 0), -2, 1);
        }
      } else if (bi < 100) {                              // ulls i sac (lligats al cos)
        const e = bodyParts[bi - 1], l3 = levelOf(bn);
        if (e.part === 'sac') { c = e.color; l = Math.max(0, l3); }
        else if (e.part === 'horn') { c = g.body; l = l3; }
        else {
          const p = [oB[0] + dB[0] * best, oB[1] + dB[1] * best, oB[2] + dB[2] * best];
          const m = norm([p[0] - e.c[0], p[1] - e.c[1], p[2] - e.c[2]]);
          const mx = m[0] * e.cf + m[2] * e.sf, mz = -m[0] * e.sf + m[2] * e.cf;   // gir cap al davant de l'ull
          if (mz > 0.05) {
            const sx = Math.floor(e.ex + mx * Rt), syy = Math.floor(R.eyeY - m[1] * Rt), q = syy * SW + sx;
            // (sense l'anell de contorn del dibuix: el 3D ja en fa)
            const ring = R.col[q] === g.outline && Math.hypot(sx + 0.5 - e.ex, syy + 0.5 - R.eyeY) > R.er + 0.3;
            if (sx >= 0 && syy >= 0 && sx < SW && syy < SH && V.mask[q] && !ring) {
              c = V.col[q]; l = V.skin[q] ? clamp(l3 + V.dl[q], -2, 1) : V.lv[q];
            } else { c = socket; l = l3; }
          } else { c = small ? PC : flat ? g.body : socket; l = l3; }
        }
      } else {                                            // potes, peus i braços
        const e = parts[bi - 100], l3 = levelOf(dirBody(bn));
        c = e.part === 'foot' || e.part === 'hand' || e.part === 'toe' ? footHex : legHex; l = l3;
        if (e.part === 'pad') { c = variant(footHex, 1); l = 0; }
        if (full && (e.part === 'thigh' || e.part === 'leg')) {
          const p = [oW[0] + dW[0] * best, oW[1] + dW[1] * best];
          const x = Math.floor(p[0] + SCX), y = Math.floor(SG - p[1]);
          const fc = x >= 0 && y >= 0 && x < SW && y < SH ? full.col[y * SW + x] : null;
          if (fc && LIMB.has(fc)) c = fc;
        }
      }
      col[k] = c; lvl[k] = l;
    }

    // contorn exterior i interior (on una peça en tapa una altra)
    const out = new Uint8Array(N);
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      const k = y * GW + x;
      if (!col[k]) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        const q = ny * GW + nx;
        if (!col[q]) out[q] = 1;
        else if (depth[q] > depth[k] + (pid[q] === pid[k] ? 6 : 0.8)) out[q] = 1;
      }
    }
    for (let k = 0; k < N; k++) if (out[k]) { col[k] = g.outline; lvl[k] = 0; }

    const cv = document.createElement('canvas');
    cv.width = GW; cv.height = GH;
    const cx = cv.getContext('2d');
    const img = cx.createImageData(GW, GH);
    let top = GH;
    for (let k = 0; k < N; k++) {
      if (!col[k]) continue;
      top = Math.min(top, Math.floor(k / GW));
      const n = parseInt(variant(col[k], lvl[k]).slice(1), 16);
      img.data[k * 4] = n >> 16 & 255; img.data[k * 4 + 1] = n >> 8 & 255; img.data[k * 4 + 2] = n & 255; img.data[k * 4 + 3] = 255;
    }
    cx.putImageData(img, 0, 0);
    // boca projectada (per a la llengua)
    const mY = SG - (R.mouthY + 1), mv = toView(toWorld([0, mY, S.front(0, mY)]));
    return { canvas: cv, mouth: { x: cxo + mv[0], y: G - mv[1] }, bodyW: g.bw, top, cx: cxo, g: G };
  }

  return { render, GW, GH, CX, G };
})();
