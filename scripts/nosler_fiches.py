#!/usr/bin/env python3
"""Fiches de rechargement Nosler : capacité d'étui balle en place et densité apparente implicite des poudres.

    python3 scripts/nosler_fiches.py [--telecharger] [--dossier DIR] [--reference FICHIER] [--detail]

Nosler publie une fiche PDF par cartouche et par balle (https://www.nosler.com/load-data/caliber-and-
cartridge-data.html). Chacune imprime « CASE HOLDS: x Gr. WATER », la capacité en eau de l'étui Nosler balle
en place à la longueur d'essai, et pour chaque charge une densité de chargement « LOAD DENSITY (VOLUME) » en
pour cent (« ** = Compressed load » : elles sont toutes au-dessus de 100 %). Le script :
  1. --telecharger : relit l'index des cartouches et télécharge les fiches des cartouches de la base (1 s
     entre requêtes ; robots.txt vide le 2026-10-13) dans le dossier local des guides, hors git et interdit
     au web (../guides/nosler par défaut) ;
  2. lit toutes les lignes de charge -> data/nosler.local.json (local, non redistribué) ;
  3. imprime, par poudre, la densité implicite rho = charge / (densité de chargement × capacité en eau)
     contre data/powders.json, et, par cartouche, la capacité médiane contre case_vol_cm3 ;
  4. --reference FICHIER : écrit les capacités par cartouche (calibers/nosler_capacity_reference.json).

La densité implicite est celle de la table qu'applique Nosler, qu'il ne publie pas : les médianes par
fiche d'une même poudre concordent à 1 % près. Ce n'est pas une valeur de fabricant de poudre : sur les
poudres Vihtavuori, dont le fabricant publie la densité, Nosler est plus bas de 1 à 14 % (2026-10-13).
Elle ne sert qu'à combler un manque (bloc DENSITES_NOSLER de scripts/import_catalog.js).
"""
import collections
import json
import os
import re
import statistics as st
import subprocess
import sys
import time
import urllib.request

ICI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EAU = 15.4324                     # grains d'eau par cm³
INDEX = 'https://www.nosler.com/load-data/caliber-and-cartridge-data.html'

# Page Nosler -> clé de data/calibers.json, quand l'appariement par nom ne suffit pas (None : écartée).
PAGES = {'762-39mm': '7.62 x 39', '7-57mm-mauser': '7 x 57', '8-57mm-js-mauser': '8 x 57 IS', '93x62-mauser': '9.3 x 62',
         '93x64mm-brenneke': '9.3 x 64 Brenneke', '93x74-r': '9.3 x 74 R', '65-55-swedish-mauser': '6.5 x 55 SE',
         '6mm-br-remington': None, '45-70-govt-strong-actions-only': '45 - 70 Govt.', '45-auto-acp': '45 ACP (Auto)',
         '9mm-luger-parabellum': '9 mm Luger', '380-auto-acp': '9 mm Browning court', '40-s-w': '40 S&W',
         '44-remington-magnum-handgun': '44 Rem. Mag.', '44-remington-magnum': '44 Rem. Mag.', '7mm-08-remington': '7 -08 Rem.',
         '300-aac-blackout': '300 AAC BLK', '6-5-prc': '6.5 PRC', '65-284-norma': '6.5-284 Norma', '6mm-xc': '6 XC',
         '30-06-springfield': '30-06 Spring.', '250-3000-savage': '250 Savage', '45-colt-single-action-army-replicas': '45 Colt',
         '45-colt-ruger-t-c-contender-encore': None, '6mm-creedmoor': '6 mm Creedmoor', '6mm-remington': '6 mm Remington',
         '7mm-remington-magnum': '7 Rem. Mag.', '7mm-weatherby-magnum': '7mm Weatherby Magnum', '10mm-auto': '10 mm Auto',
         '270-winchester-short-magnum-wsm': '270 WSM', '300-prc-precision-rifle-cartridge': '300 PRC',
         '300-ruger-compact-magnum-rcm': '300 RCM', '300-remington-ultra-magnum-rum': '300 Rem. Ultra Mag.',
         '300-winchester-short-magnum-wsm': '300 WSM', '375-holland-holland-magnum': '375 H&H Mag.', '7mm-prc': '7mm PRC',
         '7mm-remington-ultra-magnum-rum': '7mm RUM', '7mm-winchester-short-magnum-wsm': '7mm WSM'}

# Libellé de poudre Nosler -> clé de data/powders.json. Les Reloder (« RL15 »), les Vihtavuori (« N150 »,
# « Viht N150 ») et les libellés déjà égaux à une clé (« IMR 4350 », « Norma 204 ») se résolvent par règle.
POUDRES = {'2400': 'Alliant 2400', 'A-2460': 'Accurate 2460', 'A-2520': 'Accurate 2520', 'AA #2': 'Accurate No. 2',
           'AA #5': 'Accurate No. 5', 'AA #7': 'Accurate No. 7', 'AA #9': 'Accurate No.9', 'AA 1680': 'Accurate 1680',
           'AA 2015': 'Accurate 2015', 'AA 2230': 'Accurate 2230', 'AA 2460': 'Accurate 2460', 'AA 2495': 'Accurate 2495',
           'AA 2520': 'Accurate 2520', 'AA 2700': 'Accurate 2700', 'AA 4350': 'Accurate 4350', 'AA 5744': 'Accurate 5744',
           'AR Comp': 'Alliant AR Comp', 'AutoComp': 'Winchester Autocomp', 'BL-C(2)': 'Hodgdon BL-C(2)',
           'Benchmark': 'Hodgdon Benchmark', 'Big Game': 'Ramshot Big Game', 'Blue Dot': 'Alliant Blue Dot',
           'Bullseye': 'Alliant Bullseye', 'CFE 223': 'Hodgdon CFE-223', 'CFE Pistol': 'Hodgdon CFE Pistol',
           'Competition': 'Ramshot Competition', 'Enforcer': 'Ramshot Enforcer', 'Green Dot': 'Alliant Green Dot',
           'H1000': 'Hodgdon H1000', 'H110': 'Hodgdon H110', 'H322': 'Hodgdon H322', 'H335': 'Hodgdon H335',
           'H380': 'Hodgdon H380', 'H414': 'Hodgdon H414', 'H4198': 'Hodgdon H4198', 'H4227': 'Hodgdon H4227',
           'H4350': 'Hodgdon H4350', 'H4831': 'Hodgdon H4831, H4831C', 'H4831SC': 'Hodgdon H4831SC',
           'H4895': 'Hodgdon H4895', 'HS-6': 'Hodgdon HS-6', 'Herco': 'Alliant Herco',
           'Hi-Skor 700-X': 'Hodgdon Hi-Skor 700X', 'Hi-Skor 800-X': 'Hodgdon Hi-Skor 800X', 'Hunter': 'Ramshot Hunter',
           'Hybrid 100V': 'Hodgdon Hybrid 100V', 'IMR 7828 SSC': 'IMR 7828SC', 'IMR BLUE': 'IMR Blue',
           'IMR TARGET': 'IMR Target', 'LT-30': 'Accurate LT-30', 'LT-32': 'Accurate LT-32', "Lil'Gun": 'Hodgdon Lil Gun',
           'Longshot': 'Hodgdon Long Shot', 'MAGPRO': 'Accurate Magpro', 'Magnum': 'Ramshot Magnum',
           'PP 2000-MR': 'Alliant Power Pro 2000-MR', 'PP 300-MP': 'Alliant Power Pro 300-MP',
           'PP 4000-MR': 'Alliant Power Pro 4000-MR', 'PP Varmint': 'Alliant Power Pro Varmit',
           'Power Pistol': 'Alliant Power Pistol', 'RL10x': 'Alliant Reloder 10X', 'Red Dot': 'Alliant Red Dot',
           'Retumbo': 'Hodgdon Retumbo', 'Silhouette': 'Ramshot Silhouette', 'StaBall 6.5': 'Winchester StaBall 6.5',
           'TAC': 'Ramshot TAC', 'Titegroup': 'Hodgdon Titegroup', 'True Blue': 'Ramshot True Blue',
           'US869': 'Hodgdon US869', 'Unique': 'Alliant Unique', 'Universal': 'Hodgdon Universal',
           'Varget': 'Hodgdon Varget', 'W296': 'Winchester 296', 'W748': 'Winchester 748', 'W760': 'Winchester 760',
           'WSF': 'Winchester WSF Super-Field', 'WST': 'Winchester WST', 'X-Terminator': 'Ramshot X-Terminator',
           'Zip': 'Ramshot Zip', 'H50BMG': 'Hodgdon H50BMG', 'LRT': 'Ramshot LRT'}

LIGNE = re.compile(r'^\s*(?P<nom>.*?)\s+(?P<chg>\d{1,3}\.\d)\s+(?P<acc>\*\s*)?(?P<max>MAX\.\s*)?(?P<vel>\d{3,4})\s+'
                   r'(?P<comp>\*\*\s+)?(?P<ld>\d{2,3})%\s*$')
ANNOTATION = re.compile(r'^(most accurate|powder tested|most accurate powder tested)$', re.I)


def norm(s):
    s = str(s).lower().replace('winchester', 'win').replace('remington', 'rem').replace('magnum', 'mag')
    return re.sub(r'[^a-z0-9]', '', s.replace('springfield', 'spring'))


def canon_mm(texte):
    """« 24" Lilja », « 18-1/2" Ruger », « 4.0" S&W », « 24 Wiseman », « 26' Pac-Nor » (apostrophe fautive)
    -> millimètres ; None si illisible."""
    m = re.match(r'^\s*(\d+(?:\.\d+)?)(?:-(\d+)/(\d+))?\s*["\'”’]?', texte or '')
    if not m:
        return None
    pouces = float(m[1]) + (int(m[2]) / int(m[3]) if m[2] else 0)
    return round(pouces * 25.4, 1) if 1.5 <= pouces <= 40 else None


def cle_poudre(nom):
    if nom in POUDRES:
        return POUDRES[nom]
    m = re.match(r'^RL(\d+)$', nom)
    if m:
        return 'Alliant Reloder ' + m[1]
    m = re.match(r'^(?:Viht )?(N\d{3}|3N37)$', nom)
    if m:
        return m[1]
    return nom


def lire(url, dest=None):
    data = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=60).read()
    time.sleep(1.0)
    if dest:
        with open(dest, 'wb') as f:
            f.write(data)
    return data


def telecharger(dossier, cal):
    idx = {norm(a): k for k, v in cal.items() for a in [k] + v.get('aliases', [])}
    page = lire(INDEX).decode('utf-8', 'replace')
    fiches = {}
    for slug in sorted(set(re.findall(r'href="https://www\.nosler\.com/([a-z0-9-]+)"', page))):
        k = PAGES[slug] if slug in PAGES else idx.get(norm(slug.replace('-', ' ')))
        if not k:
            continue
        # Fiches sous /media/load_data_assets/pdfs/ en général, sous /media/ ou /media/binaryanvil/… pour les
        # PRC : tout PDF de /media/ dont le nom porte une masse de balle (« 210gr »).
        page_c = lire('https://www.nosler.com/' + slug).decode('utf-8', 'replace')
        for p in sorted({re.sub(r'^https://www\.nosler\.com', '', u) for u in re.findall(
                r'href="((?:https://www\.nosler\.com)?/media/[A-Za-z0-9_./%-]+\.pdf)"', page_c)
                if re.search(r'\d+\s*gr', os.path.basename(u), re.I)}):
            f = os.path.join(dossier, os.path.basename(p))
            if not os.path.exists(f):
                lire('https://www.nosler.com' + p, f)
            fiches[os.path.basename(p)] = dict(cle=k, page=slug, pdf='https://www.nosler.com' + p)
    with open(os.path.join(dossier, 'fiches.json'), 'w', encoding='utf-8') as f:
        json.dump(fiches, f, ensure_ascii=False, indent=1)
    print(f"{len(fiches)} fiches dans {dossier}")


def lire_fiches(dossier):
    fiches = json.load(open(os.path.join(dossier, 'fiches.json'), encoding='utf-8'))
    entetes, lignes, perdues = [], [], 0
    for nom, meta in sorted(fiches.items()):
        t = subprocess.run(['pdftotext', '-layout', os.path.join(dossier, nom), '-'], capture_output=True, text=True).stdout
        eau = re.search(r'CASE HOLDS:\s*([\d.]+)\s*Gr', t)
        # Masse de balle de l'en-tête (« 300 BLK - 110 grain ») ; plusieurs balles par fiche pour 85 fiches
        # (« 165/168 grain », « 50/52/53 grain ») : milieu de la plage, et la plage gardée à côté.
        tete = (t.split('\n', 3) + ['', ''])[1]
        balle = re.search(r'(\d{2,3}(?:/\d{2,3})*)\s*gr(?:ain)?\b', tete)
        masses = [int(x) for x in balle[1].split('/')] if balle else []
        canon = re.search(r'BARREL Length/Make\s+([^\n]+)', t)
        etui = re.search(r'CASE TYPE:\s*(\S[^\n]*?)\s{2,}', t)
        essai = re.findall(r'\s(\d\.\d{3})"', t)
        e = dict(fiche=nom, cle=meta['cle'], pdf=meta['pdf'], eau_gr=float(eau[1]) if eau else None,
                 balle_gr=round((min(masses) + max(masses)) / 2, 1) if masses else None,
                 balle_plage=[min(masses), max(masses)] if len(masses) > 1 else None, oacl_essai=essai[1] if len(essai) > 1 else None,
                 etui=etui[1].strip() if etui else None, canon=canon[1].strip() if canon else None,
                 canon_mm=canon_mm(canon[1]) if canon else None,
                 archivee='archived' in nom)
        entetes.append(e)
        poudre = None
        for l in t.splitlines():
            m = LIGNE.match(l)
            if not m:
                perdues += '%' in l and bool(re.search(r'\d\.\d', l))
                continue
            n = re.sub(r'\s+', ' ', m['nom']).strip()
            if n and not ANNOTATION.match(n):
                poudre = n
            if not poudre or not e['eau_gr']:
                perdues += 1
                continue
            lignes.append(dict(fiche=nom, cle=e['cle'], balle_gr=e['balle_gr'], balle_plage=e['balle_plage'],
                               eau_gr=e['eau_gr'], canon_mm=e['canon_mm'],
                               poudre_nosler=poudre,
                               poudre=cle_poudre(poudre), charge_gr=float(m['chg']), fps=int(m['vel']), max=bool(m['max']),
                               comprimee=bool(m['comp']), ld_pct=int(m['ld'])))
    return entetes, lignes, perdues


def main():
    a = sys.argv
    dossier = a[a.index('--dossier') + 1] if '--dossier' in a else os.path.join(ICI, '..', 'guides', 'nosler')
    d = lambda f: os.path.join(ICI, 'data', f)
    cal = json.load(open(d('calibers.json'), encoding='utf-8'))['calibers']
    pw = json.load(open(d('powders.json'), encoding='utf-8'))['powders']
    if '--telecharger' in a:
        os.makedirs(dossier, exist_ok=True)
        telecharger(dossier, cal)
    entetes, lignes, perdues = lire_fiches(dossier)
    with open(d('nosler.local.json'), 'w', encoding='utf-8') as f:
        json.dump({'_doc': 'Fiches de rechargement Nosler (www.nosler.com/load-data) : en-têtes et lignes de charge. '
                   'Données brutes, LOCAL/gitignore, non redistribuées. scripts/nosler_fiches.py.',
                   'fiches': entetes, 'rows': lignes}, f, ensure_ascii=False, indent=0)
    print(f"{len(lignes)} lignes de charge, {len(entetes)} fiches ({perdues} lignes illisibles) -> data/nosler.local.json")

    par = collections.defaultdict(list)
    for x in lignes:
        par[x['poudre']].append(x)
    tab = []
    for k, v in par.items():
        fiches = collections.defaultdict(list)
        for x in v:
            fiches[x['fiche']].append(x['charge_gr'] / (x['ld_pct'] / 100 * x['eau_gr']))
        mf = [st.median(r) for r in fiches.values()]
        tab.append((k, len(v), len(fiches), st.median([r for rr in fiches.values() for r in rr]), min(mf), max(mf),
                    pw.get(k, {}).get('pcd'), k in pw))
    # sans les densités que la base tient de Nosler lui-même (DENSITES_NOSLER d'import_catalog.js)
    rap = [t[3] * 1000 / t[6] for t in tab if t[6] and not str(pw[t[0]].get('pcd_src', '')).startswith('Nosler')]
    print(f"\ndensité implicite, {len(tab)} poudres ; contre la base hors densités Nosler ({len(rap)}) : rapport médian {st.median(rap):.3f}, "
          f"moitié centrale {sorted(rap)[len(rap) // 4]:.3f}–{sorted(rap)[3 * len(rap) // 4]:.3f}")
    print(f"  {'poudre':30s} {'lignes':>6s} {'fiches':>6s} {'Nosler':>6s} {'par fiche':>13s} {'base':>5s}")
    for k, n, nf, m, lo, hi, base, existe in sorted(tab, key=lambda t: (t[6] is not None, -abs(t[3] * 1000 / t[6] - 1) if t[6] else 0)):
        if base and abs(m * 1000 / base - 1) <= 0.08 and '--detail' not in a:
            continue
        etat = f"{base:5d}  {m * 1000 / base:.3f}" if base else ('    —' if existe else '  CLÉ ABSENTE')
        print(f"  {k[:30]:30s} {n:6d} {nf:6d} {m:6.3f} {lo:6.3f}–{hi:.3f} {etat}")
    if '--detail' not in a:
        print("  (écarts à la base de 8 % au plus omis : --detail pour tout voir)")

    cap = collections.defaultdict(list)
    for e in entetes:
        if e['eau_gr']:
            cap[e['cle']].append(e)
    print(f"\ncapacité balle en place, {len(cap)} cartouches : écarts de plus de 10 % au volume de la base")
    for k, v in sorted(cap.items(), key=lambda kv: cal[kv[0]]['case_vol_cm3'] / st.median(e['eau_gr'] for e in kv[1])):
        mc = st.median(e['eau_gr'] for e in v) / EAU
        if abs(cal[k]['case_vol_cm3'] / mc - 1) > 0.10:
            print(f"  {k:22s} base {cal[k]['case_vol_cm3']:.3f}  Nosler {mc:.3f} cm³ ({len(v)} fiche{'s' if len(v) > 1 else ''})")
    if '--reference' in a:
        sortie = a[a.index('--reference') + 1]
        ref = json.load(open(sortie, encoding='utf-8')) if os.path.exists(sortie) else {'_provenance': {}}
        pages = collections.defaultdict(list)
        fiches = json.load(open(os.path.join(dossier, 'fiches.json'), encoding='utf-8'))
        for e in entetes:
            if e['eau_gr']:
                pages[(fiches[e['fiche']]['page'], e['cle'])].append(e)
        ref['calibres'] = {}
        for (page, k), v in sorted(pages.items()):
            g = [e['eau_gr'] for e in v]
            ref['calibres'][page] = {
                'cle_estimateur': k, 'fiches': len(v), 'mediane_gr': round(st.median(g), 2), 'min_gr': min(g),
                'max_gr': max(g), 'mediane_cm3': round(st.median(g) / EAU, 3),
                'detail': [{'pdf': e['pdf'], 'balle_gr': e['balle_gr'],
                            **({'balle_plage': e['balle_plage']} if e['balle_plage'] else {}), 'case_holds_gr': e['eau_gr'],
                            'oacl_essai': e['oacl_essai'], 'etui': e['etui'], 'canon': e['canon']} for e in sorted(v, key=lambda e: e['balle_gr'] or 0)]}
        with open(sortie, 'w', encoding='utf-8') as f:
            json.dump(ref, f, ensure_ascii=False, indent=2)
        print(f"-> {sortie}")


if __name__ == '__main__':
    main()
