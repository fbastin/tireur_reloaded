#!/usr/bin/env python3
"""Table « VMD » de Lee Precision : densité apparente des poudres mesurée par un tiers, confrontée à la base.

    python3 scripts/lee_vmd.py [--telecharger] [--pdf FICHIER] [--detail]

Lee publie, pour ses doseurs, le volume qu'occupe un grain de chaque poudre (« VMD », volume measured density, en
cm³ par grain) : https://leeprecision.com/files/instruct/VMD.pdf (« Download the latest Powder VMD's », page du
Pro Auto-Disk ; fichier « VMD 1-8-24.xlsx » du 8 janvier 2024, lu le 2026-10-17). La densité en vrac s'en déduit :
rho (g/cm³) = 0,06479891 / VMD. C'est une mesure de Lee, au doseur, pas une valeur du fabricant de la poudre.

Le script :
  1. --telecharger : télécharge le PDF dans le dossier local des guides (../guides/lee, interdit au web) ;
  2. lit le tableau (pdftotext -layout) et rapporte chaque libellé de Lee à une clé de data/powders.json (table
     LIBELLES ci-dessous ; un libellé ambigu reste sans clé) ;
  3. confronte la densité de Lee à celle des fabricants qui la publient (Vihtavuori, Shooters World : `pcd_src`
     de la base), à la base, et à la densité implicite des fiches Nosler (data/nosler.local.json) ;
  4. liste les poudres de la base sans densité que Lee mesure, et celles où base et Nosler divergent.
Console seule : n'écrit rien.
"""
import collections
import json
import os
import re
import statistics as st
import subprocess
import sys
import urllib.request

ICI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'https://leeprecision.com/files/instruct/VMD.pdf'
PDF = os.path.join(ICI, '..', 'guides', 'lee', 'VMD.pdf')
GR_G = 0.06479891

# Libellé de Lee (fabricant, nom) -> clé de powders.json. Absent : sans clé (poudre absente de la base, ou identité
# incertaine : « A NITRO100 », Nitro 100 ou 100NF ? « RELODER 10 », 10X ?).
LIBELLES = {
    ('ACCURATE', '11FS'): 'Accurate 11FS', ('ACCURATE', 'ACC MAG PRO'): 'Accurate Magpro',
    ('ACCURATE', 'ACCUR #2'): 'Accurate No. 2', ('ACCURATE', 'ACCUR #5'): 'Accurate No. 5',
    ('ACCURATE', 'ACCUR #7'): 'Accurate No. 7', ('ACCURATE', 'ACCUR #9'): 'Accurate No.9',
    ('ACCURATE', 'LT-30'): 'Accurate LT-30', ('ACCURATE', 'LT-32'): 'Accurate LT-32',
    ('ACCURATE', 'SOLO 1000'): 'Accurate Solo 1000', ('ACCURATE', 'TCM'): 'Accurate TCM',
    ('ADI', 'AR2213'): 'ADI AR 2213, AR 2213SC', ('ADI', 'AS50'): 'ADI AS50N',
    ('ALLIANT', 'ALLIANT STEEL'): 'Alliant Steel', ('ALLIANT', 'ALNT 300 MP'): 'Alliant Power Pro 300-MP',
    ('ALLIANT', 'ALNT 4000 MR'): 'Alliant Power Pro 4000-MR', ('ALLIANT', 'ALNT 410'): 'Alliant 410',
    ('ALLIANT', 'ALNT AR-COMP'): 'Alliant AR Comp', ('ALLIANT', 'ALNT E3'): 'Alliant e3',
    ('ALLIANT', 'ALNT VARMINT'): 'Alliant Power Pro Varmit', ('ALLIANT', 'AMER-SELECT'): 'Alliant American Select',
    ('ALLIANT', 'HERC 2400'): 'Alliant 2400',
    ('HODGDON', 'CFE 223'): 'Hodgdon CFE-223', ('HODGDON', 'CFE PISTOL'): 'Hodgdon CFE Pistol', ('HODGDON', 'H 50 BMG'): 'Hodgdon H50BMG',
    ('HODGDON', 'H LIL GUN'): 'Hodgdon Lil Gun', ('HODGDON', 'H RETUMBO'): 'Hodgdon Retumbo',
    ('HODGDON', 'H-LVR'): 'Hodgdon Leverevolution', ('HODGDON', 'H-SUPRFORM'): 'Hodgdon Superformance',
    ('HODGDON', 'H-VARGET'): 'Hodgdon Varget', ('HODGDON', 'H4831'): 'Hodgdon H4831, H4831C',
    ('HODGDON', 'HO US869'): 'Hodgdon US869', ('HODGDON', 'HP38'): 'Hodgdon HP-38', ('HODGDON', 'HS6'): 'Hodgdon HS-6',
    ('HODGDON', 'HYBRID100'): 'Hodgdon Hybrid 100V', ('HODGDON', 'LONGSHOT'): 'Hodgdon Long Shot',
    ('HODGDON', 'WIN 244'): 'Winchester 244', ('HODGDON', 'IMR 700X'): 'Hodgdon Hi-Skor 700X',
    ('HODGDON', 'IMR 800X'): 'Hodgdon Hi-Skor 800X', ('HODGDON', 'IMR PB'): 'Hodgdon PB',
    ('HODGDON', 'IMR TRAIL BOSS'): 'Hodgdon Trail Boss', ('HODGDON', 'SR4756'): 'IMR SR 4756',
    ('HODGDON', 'SR7625'): 'IMR SR 7625', ('HODGDON', 'AUTOCOMP'): 'Winchester Autocomp',
    ('HODGDON', 'STABALL6.5'): 'Winchester StaBall 6.5', ('HODGDON', 'STABALL MATCH'): 'Winchester StaBall Match',
    ('HODGDON', 'STABALL HD'): 'Winchester StaBall HD', ('HODGDON', 'SUPRM780'): 'Winchester Supreme 780',
    ('HODGDON', 'WIN MAG RIFLE'): 'Winchester WMR', ('HODGDON', 'WIN SUPER HANDI'): 'Winchester WSH Super-Handicap',
    ('HODGDON', 'wSUPER-FLD'): 'Winchester WSF Super-Field', ('HODGDON', 'wSUPER-TAR'): 'Winchester WST',
    ('RAMSHOT', 'LRT'): 'Ramshot LRT', ('RAMSHOT', 'RAM BIG GAME'): 'Ramshot Big Game', ('RAMSHOT', 'RAM MAGNUM'): 'Ramshot Magnum',
    ('RAMSHOT', 'RAM TAC'): 'Ramshot TAC', ('RAMSHOT', 'RAM ZIP'): 'Ramshot Zip',
    ('SHOOTERS WORLD', 'BUFFALO'): 'Shooters World Buffalo Rifle', ('SHOOTERS WORLD', 'CLEANSHOT'): 'Shooters World Clean Shot',
    ('SHOOTERS WORLD', 'HEAVYPISTOL'): 'Shooters World Heavy Pistol', ('SHOOTERS WORLD', 'MAJ PISTOL'): 'Shooters World Major Pistol',
    ('SHOOTERS WORLD', 'MATCHRIFLE'): 'Shooters World Match Rifle', ('SHOOTERS WORLD', 'SW4350'): 'Shooters World SW 4350',
    ('SHOOTERS WORLD', 'TAC RIFLE'): 'Shooters World Tactical Rifle', ('SHOOTERS WORLD', 'ULT PISTOL'): 'Shooters World Ultimate Pistol',
    ('VECTAN', 'VEC AO'): 'Vectan A0', ('VECTAN', 'VEC TU7000'): 'Vectan Tubal 7000', ('VECTAN', 'VEC TU8000'): 'Vectan Tubal 8000',
    ('VECTAN', 'V-3N38'): '3N38',
}


def cle_generique(fab, nom, P):
    """Règles mécaniques : préfixe de fabricant, espaces et tirets ; None si rien ne correspond."""
    n = nom.strip()
    cands = []
    if fab == 'ACCURATE':
        cands.append('Accurate ' + n.replace('ACCUR ', ''))
    elif fab == 'ADI':
        m = re.match(r'AR(\d{4})$', n)
        if m:
            cands.append('ADI AR ' + m.group(1))
    elif fab == 'ALLIANT':
        m = re.match(r'RELODER ?(\d+)$', n)
        cands.append('Alliant Reloder ' + m.group(1) if m else 'Alliant ' + n.title())
    elif fab == 'HODGDON':
        m = re.match(r'IMR ?(\d{4}.*)$', n)
        if m:
            cands.append('IMR ' + m.group(1))
        m = re.match(r'WIN (\d{3})$', n)
        if m:
            cands.append('Winchester ' + m.group(1))
        cands += ['Hodgdon ' + n, 'Hodgdon ' + n.title(), 'IMR ' + n.replace('IMR ', '').title()]
    elif fab == 'NORMA':
        cands.append('Norma ' + n.replace('NORMA ', ''))
    elif fab == 'RAMSHOT':
        cands.append('Ramshot ' + re.sub(r'^R ', '', n).title())
    elif fab == 'SHOOTERS WORLD':
        cands.append('Shooters World ' + n.title())
        cands.append('Shooters World ' + n)
    elif fab == 'VECTAN':
        m = re.match(r'VEC (SP|BA)(\d+)$', n)
        if m:
            cands.append(f'Vectan {m.group(1)} {m.group(2)}')
    elif fab == 'VIHTAVUORI':
        cands.append(re.sub(r'^[vV]-', '', n))
    for c in cands:
        if c in P:
            return c
    return None


def lire(pdf):
    txt = subprocess.run(['pdftotext', '-layout', pdf, '-'], capture_output=True, text=True, check=True).stdout
    rows, fab_suivant = [], None
    for ligne in txt.splitlines():
        if not ligne.strip() or ligne.startswith('MANUFACTURER'):
            continue
        if ligne.strip() == 'WORLD':       # « SHOOTERS » / « WORLD » sur deux lignes
            continue
        m = re.match(r'^(\S+)\s{2,}(.+?)\s+(0\.\d{3,4})\s*$', ligne)
        if not m:
            continue
        fab, nom, vmd = m.group(1), m.group(2).strip(), float(m.group(3))
        rows.append(('SHOOTERS WORLD' if fab == 'SHOOTERS' else fab, nom, vmd))
    return rows


def nosler_implicite():
    """Densité implicite des fiches Nosler par clé : médiane des médianes par fiche (scripts/nosler_fiches.py)."""
    try:
        rows = json.load(open(os.path.join(ICI, 'data', 'nosler.local.json'), encoding='utf-8'))['rows']
    except FileNotFoundError:
        return {}
    par = collections.defaultdict(lambda: collections.defaultdict(list))
    for r in rows:
        if r.get('poudre') and r.get('ld_pct') and r.get('eau_gr') and r.get('charge_gr'):
            par[r['poudre']][r['fiche']].append(r['charge_gr'] / (r['ld_pct'] / 100 * r['eau_gr']))
    return {k: st.median(st.median(v) for v in f.values()) for k, f in par.items()}


def main():
    pdf = sys.argv[sys.argv.index('--pdf') + 1] if '--pdf' in sys.argv else PDF
    if '--telecharger' in sys.argv:
        os.makedirs(os.path.dirname(pdf), exist_ok=True)
        req = urllib.request.Request(URL, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=60) as r, open(pdf, 'wb') as f:
            f.write(r.read())
    P = json.load(open(os.path.join(ICI, 'data', 'powders.json'), encoding='utf-8'))['powders']
    rows = lire(pdf)
    lee, sans = {}, []
    for fab, nom, vmd in rows:
        k = LIBELLES.get((fab, nom)) or cle_generique(fab, nom, P)
        if k:
            lee[k] = GR_G / vmd * 1000          # kg/m³, comme pcd
        else:
            sans.append(f'{fab} {nom}')
    nos = nosler_implicite()
    print(f'Lee VMD : {len(rows)} poudres lues, {len(lee)} rapportées à la base ; sans clé : {", ".join(sans)}')

    def stats(r):
        s = sorted(r)
        return f'médiane {st.median(s):.3f}, moitié centrale {s[len(s) // 4]:.3f}–{s[3 * len(s) // 4]:.3f}, extrêmes {s[0]:.3f}–{s[-1]:.3f} (n {len(s)})'

    fabr = {k: P[k]['pcd'] for k in lee if P[k].get('pcd') and re.match(r'(Vihtavuori|Shooters World)', P[k].get('pcd_src', ''))}
    print(f'\n1. Lee / densité publiée par le fabricant (Vihtavuori, Shooters World) : {stats([lee[k] / v for k, v in fabr.items()])}')
    if '--detail' in sys.argv:
        for k, v in sorted(fabr.items()):
            print(f'     {k:32s} fabricant {v:5.0f}  Lee {lee[k]:5.0f}  {lee[k] / v:.3f}')
    base = {k: P[k]['pcd'] for k in lee if P[k].get('pcd') and k not in fabr and not P[k].get('pcd_src', '').startswith('Nosler')}
    exact = [k for k, v in base.items() if abs(lee[k] / v - 1) < 0.005]
    print(f'2. Lee / base (hors densités confirmées ou Nosler) : {stats([lee[k] / v for k, v in base.items()])} ;'
          f'\n   {len(exact)} sur {len(base)} à moins de 0,5 % : la base reprend probablement Lee pour celles-là')
    com = [k for k in lee if k in nos]
    print(f'3. Lee / Nosler (densité implicite) : {stats([lee[k] / (1000 * nos[k]) for k in com])}')
    print('\n4. Poudres de la base sans densité, mesurées par Lee :')
    for k in sorted(k for k in lee if not P[k].get('pcd')):
        print(f'     {k:32s} Lee {lee[k]:5.0f}' + (f'  Nosler {1000 * nos[k]:5.0f}' if k in nos else ''))
    print('\n5. Base et Nosler à plus de 8 % : où tombe Lee ?')
    for k in sorted(k for k in lee if P[k].get('pcd') and k in nos and abs(1000 * nos[k] / P[k]['pcd'] - 1) > 0.08):
        b, n, l = P[k]['pcd'], 1000 * nos[k], lee[k]
        proche = 'base' if abs(l / b - 1) < abs(l / n - 1) else 'Nosler'
        print(f'     {k:32s} base {b:5.0f}  Nosler {n:5.0f}  Lee {l:5.0f}  -> plus proche : {proche} ({100 * (l / (b if proche == "base" else n) - 1):+.1f} %)')
    print('\n6. Équivalences ADI / Hodgdon (data/powder_aliases.json) :')
    eq = {k: v for k, v in json.load(open(os.path.join(ICI, 'data', 'powder_aliases.json'), encoding='utf-8'))['equivalences'].items() if k[0] != '_'}
    for a, h in eq.items():
        f = lambda k: f'{P[k]["pcd"]:5.0f}' if P.get(k, {}).get('pcd') else '    —'
        print(f'     {a:24s} {f(a)}  {h:22s} {f(h)}  Lee ADI {lee.get(a, 0):5.0f}  Lee Hodgdon {lee.get(h, 0):5.0f}  Nosler {1000 * nos.get(h, 0):5.0f}')


if __name__ == '__main__':
    main()
