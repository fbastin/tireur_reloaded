/**
 * parse_vectan.js — extrait les tables de rechargement du catalogue Vectan (Nobel Sport).
 *
 *   node scripts/parse_vectan.js <file.pdf>
 *
 * Source OFFICIELLE (vectan.fr), PDF à couche texte, données établies « NORMES CIP / CIP
 * RULES » — donc dans notre convention (canon d'essai CIP). Charge DÉPART + MAX avec les
 * vitesses : même forme que Norma/Speer. Longueur de canon non publiée → v0 traitée au canon
 * de référence de la cartouche.
 *
 * ATOUT DE CETTE SOURCE : tout est donné en DEUX UNITÉS (masses en g ET en grains, vitesses
 * en m/s ET en fps). Chaque ligne porte donc sa propre redondance : si les deux unités ne
 * concordent pas, c'est que la ligne a été mal découpée → on la REJETTE. C'est une
 * auto-vérification qu'aucune de nos autres sources n'offre.
 *
 * PIÈGE DE MISE EN PAGE (et pourquoi on jette beaucoup de lignes) : quand une balle porte
 * PLUSIEURS poudres, sa cellule est fusionnée sur le bloc, et sa position verticale n'est pas
 * fiable — tantôt centrée sur ses lignes, tantôt en tête, avec des décalages de police qui
 * interdisent toute règle géométrique sûre (vérifié aux coordonnées, via pdftotext -bbox).
 * Les heuristiques de proximité testées produisaient ~7 % de lignes physiquement impossibles
 * (balle plus lourde ET plus rapide à charge égale). On n'accepte donc QUE les lignes où la
 * balle figure sur la ligne elle-même : aucune attribution, aucun risque de masse fausse.
 * C'est un choix de CORRECTION contre COUVERTURE, assumé.
 *
 * Règle commune à tous nos parseurs : ON NE DEVINE JAMAIS. Cartouche ou poudre non résolue,
 * unités discordantes, invariants violés ⇒ rejet, jamais réparation.
 *
 * Sortie LOCALE/gitignorée (données fabricant, non redistribuées).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const pdf = process.argv[2];
if (!pdf) { console.error('usage: node scripts/parse_vectan.js <file.pdf>'); process.exit(1); }

const d = (f) => path.join(__dirname, '..', 'data', f);
const CAL = JSON.parse(fs.readFileSync(d('calibers.json'))).calibers;
const PWD = JSON.parse(fs.readFileSync(d('powders.json'))).powders;

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const num = (s) => parseFloat(String(s).replace(/\s/g, '').replace(',', '.'));   // « 1 424 », « 0,36 »

// --- index cartouches (clé + alias), avec canonicalisation des libellés Vectan -------------
// Vectan écrit « .308 WINCHESTER (7,62 x 51) », « .44 REMINGTON MAGNUM » ; nos clés suivent le
// Guide Reload Swiss (« 308 Win. », « 44 Rem. Mag. »). Canonicalisation DÉTERMINISTE des mots
// de marque, appliquée des deux côtés — jamais d'appariement flou.
const BRAND = [
  [/\bremington\b/g, 'rem'], [/\bwinchester\b/g, 'win'], [/\bmagnum\b/g, 'mag'],
  [/\bspringfield\b/g, 'spring'], [/\bweatherby\b/g, 'wby'], [/\bautomatic\b/g, 'auto'],
  [/\bmauser\b/g, ''], [/\bmm\b/g, ''],
];
const canonCal = (s) => {
  let t = String(s).toLowerCase().replace(/[.,]/g, ' ');
  for (const [re, to] of BRAND) t = t.replace(re, to);
  return t.replace(/[^a-z0-9]/g, '');
};
const calIdx = {};
const canonIdx = new Map();
for (const k of Object.keys(CAL)) {
  for (const a of [k, ...(CAL[k].aliases || [])]) {
    calIdx[norm(a)] = k;
    const c = canonCal(a);
    if (canonIdx.has(c) && canonIdx.get(c) !== k) canonIdx.set(c, null);   // ambigu → écarté
    else if (!canonIdx.has(c)) canonIdx.set(c, k);
  }
}
const cleanHead = (s) => s
  .replace(/NORMES CIP.*$|CIP RULES.*$/i, '')
  .replace(/LONGUEUR.*$|PRESSION.*$/i, '')
  .replace(/\s+OU\s+/i, ' | ')                 // « 7,63 mm MAUSER OU .30 MAUSER » = 2 libellés
  .trim();
const one = (s) => calIdx[norm(s)] || canonIdx.get(canonCal(s)) || null;
const matchCal = (s) => {
  for (const cand of cleanHead(s).split('|')) {
    const bare = cand.replace(/\([^)]*\)/g, '').trim();          // « .308 WINCHESTER (7,62 x 51) »
    const inner = [...cand.matchAll(/\(([^)]*)\)/g)].map((m) => m[1].trim());
    for (const part of [cand, bare, ...inner]) {
      const hit = part && one(part);
      if (hit) return hit;
    }
  }
  return null;
};

// --- index poudres (les tables écrivent « Ba9 1/2 », « SP2 » ; la base « BA 9 1/2 », « SP 2 »)
const pwdIdx = {};
for (const k of Object.keys(PWD)) pwdIdx[norm(k)] = k;
for (const k of Object.keys(PWD)) { const n = norm(PWD[k].name || ''); if (n && !pwdIdx[n]) pwdIdx[n] = k; }
// Les tables abrègent les Tubal en « Tu7000 » (la base les nomme « Tubal 7000 ») : règle
// typographique déterministe, pas un appariement approximatif.
const expand = (s) => s.replace(/^Tu\s*(\d{4})$/i, 'Tubal $1');
const powderKey = (raw) => {
  for (const c of [raw, expand(raw)]) {
    const k = pwdIdx[norm(c)] || pwdIdx[norm('Vectan ' + c)];
    if (k) return k;
  }
  return null;
};

// --- motifs ------------------------------------------------------------------------------
const N = '\\d+(?:[.,]\\d+)?';
const V = '\\d[\\d\\s]{2,5}';                                   // vitesse, avec espace fin de millier
// Queue commune : poudre + (départ: g, grs, m/s, fps) + (max: g, grs, m/s, fps).
// La poudre est une CELLULE : précédée de 2+ espaces (ou du début de ligne) et sans double
// espace interne — sinon la regex avale les colonnes voisines (« XTP  Small Pistol  Ba9 »)
// dès que l'en-tête de balle n'a pas été reconnu.
const TAIL = new RegExp(
  `(?:^|\\s{2})\\s*([A-Za-z][A-Za-z0-9/]*(?: \\d/\\d| ?\\d+)?)\\s+(${N})\\s+(${N})\\s+(${V})\\s+(${V})\\s+(${N})\\s+(${N})\\s+(${V})\\s+(${V})\\s*$`);
// tête optionnelle : masse balle (g), masse (grs), type, amorçage
const HEAD = new RegExp(`^\\s*(${N})\\s+(\\d{2,3})\\s+(\\S.*?)\\s{2,}(Small Pistol|Large Pistol|Small Rifle|Large Rifle|[A-Z][A-Za-z .°n]+?)\\s{2,}`);

const GR2G = 0.06479891, FPS2MS = 0.3048;
const close = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(Math.abs(a), Math.abs(b));

const txt = execFileSync('pdftotext', ['-layout', pdf, '-'], { maxBuffer: 1 << 28 }).toString();

const rows = [];
const rej = { section_inconnue: 0, poudre_inconnue: 0, unites_discordantes: 0, invariant: 0, balle_non_attribuable: 0, balle_plomb: 0, sans_balle: 0 };
const unkP = new Map(), unkC = new Map();

// On travaille par SECTION de cartouche, sur des blocs de lignes contigus.
let ck = null;
let block = [];      // { bullet:{g,gr}|null, powder:{...}|null }

const flush = () => {
  if (!block.length) { return; }
  for (let i = 0; i < block.length; i++) {
    const r = block[i];
    if (!r.powder) continue;

    // ATTRIBUTION DE LA BALLE : on n'accepte QUE les lignes où la balle figure sur la ligne
    // elle-même. Quand une balle porte plusieurs poudres, sa cellule est fusionnée sur le bloc
    // et sa position verticale n'est PAS fiable (tantôt centrée, tantôt en tête ; les décalages
    // de police interdisent toute règle géométrique sûre). Toute heuristique de proximité
    // testée produisait ~6,7 % de lignes physiquement impossibles (balle plus lourde ET plus
    // rapide). On préfère perdre ces lignes que risquer une masse de balle fausse.
    if (!r.bullet) { rej.balle_non_attribuable++; continue; }
    const b = r.bullet;

    // Balles PLOMB / COULÉES : Vectan les mêle aux chemisées (« LYMAN coulé », « NORMA Plomb »,
    // LRN, SWC, WC, GC, « HN Plastifié »). Moins freinées dans les rayures, elles rendent un
    // E_eff plus élevé et biaiseraient des coefficients calés sur du CHEMISÉ. Même traitement
    // que pour le guide Alliant.
    if (/coul[ée]|plomb|\bPb\b|\bLRN\b|\bLFN\b|\bSWC\b|\bWC\b|\bGC\b|\bPB\b|plastifi/i.test(b.type)) {
      rej.balle_plomb++; continue;
    }

    const p = r.powder;
    // --- REDONDANCE DES UNITÉS : la garantie propre à cette source -------------------------
    if (!close(b.g, b.gr * GR2G, 0.03)) { rej.unites_discordantes++; continue; }
    if (!close(p.sg, p.sgr * GR2G, 0.06) || !close(p.mg, p.mgr * GR2G, 0.06)) { rej.unites_discordantes++; continue; }
    if (!close(p.sms, p.sfps * FPS2MS, 0.02) || !close(p.mms, p.mfps * FPS2MS, 0.02)) { rej.unites_discordantes++; continue; }
    // invariants : la charge max dépasse la charge de départ, la vitesse croît avec la charge
    if (!(p.mgr > p.sgr && p.mms > p.sms)) { rej.invariant++; continue; }

    const pk = powderKey(p.name);
    if (!pk) { rej.poudre_inconnue++; unkP.set(p.name, (unkP.get(p.name) || 0) + 1); continue; }

    rows.push({
      cartridge: ck, bullet_gr: b.gr, powder: pk,
      start_gr: +p.sgr.toFixed(2), start_ms: Math.round(p.sms),
      max_gr: +p.mgr.toFixed(2), max_ms: Math.round(p.mms),
    });
  }
  block = [];
};

for (const line of txt.split('\n')) {
  if (!line.trim()) { flush(); continue; }                 // ligne vide = fin de bloc

  const tail = TAIL.exec(line);
  const head = HEAD.exec(line);

  // en-tête de cartouche : pas de données, mais un libellé (souvent suivi de « NORMES CIP »)
  if (!tail && !head && /[A-Za-z]/.test(line) && /\d/.test(line)) {
    const hit = matchCal(line);
    if (hit) { flush(); ck = hit; continue; }
    if (/NORMES CIP|CIP RULES/i.test(line)) {              // section non résolue → on bloque
      const h = cleanHead(line);
      if (h) { flush(); ck = null; unkC.set(h, (unkC.get(h) || 0) + 1); rej.section_inconnue++; }
      continue;
    }
    continue;
  }
  if (!ck) continue;

  const rec = { bullet: null, powder: null };
  if (head) rec.bullet = { g: num(head[1]), gr: parseInt(head[2], 10), type: head[3].trim() };
  if (tail) {
    rec.powder = {
      name: tail[1].trim(),
      sg: num(tail[2]), sgr: num(tail[3]), sms: num(tail[4]), sfps: num(tail[5]),
      mg: num(tail[6]), mgr: num(tail[7]), mms: num(tail[8]), mfps: num(tail[9]),
    };
  }
  if (rec.bullet || rec.powder) block.push(rec);
}
flush();

const out = {
  _src: 'Vectan / Nobel Sport — Tables de rechargement (catalogue officiel, vectan.fr). '
      + 'Données NORMES CIP (canon d\'essai CIP ; longueur non publiée → v0 au canon de '
      + 'référence de la cartouche). Charge départ + max. Données fabricant : brut NON '
      + 'redistribué (local/gitignored), seuls les coefficients dérivés sont publiés.',
  _date: new Date().toISOString().slice(0, 10),
  rows,
};
fs.writeFileSync(d('vectan.local.json'), JSON.stringify(out, null, 1));

const combos = new Set(rows.map((r) => r.cartridge + '|' + r.powder));
console.log(`Vectan : ${rows.length} lignes retenues`);
console.log(`  ${combos.size} couples cartouche|poudre, ${new Set(rows.map((r) => r.cartridge)).size} cartouches, ${new Set(rows.map((r) => r.powder)).size} poudres`);
console.log(`  rejets : poudre inconnue ${rej.poudre_inconnue} | unités discordantes ${rej.unites_discordantes} | balle plomb/coulée ${rej.balle_plomb} | balle non attribuable ${rej.balle_non_attribuable} | invariant ${rej.invariant} | section non résolue ${rej.section_inconnue}`);
const tp = [...unkP.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
if (tp.length) console.log('  poudres non reconnues :', tp.map(([k, n]) => `${k}×${n}`).join(', '));
const tc = [...unkC.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
if (tc.length) console.log('  cartouches non résolues :', tc.map(([k, n]) => `${k}×${n}`).join(', '));
console.log('-> data/vectan.local.json');
