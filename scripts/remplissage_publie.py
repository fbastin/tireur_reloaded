#!/usr/bin/env python3
"""Remplissage des charges MAXIMALES publiées par les fabricants, au volume nominal de la base.

    python3 scripts/remplissage_publie.py [--cartouches]

L'outil (index.php) affiche le remplissage (charge / densité apparente) / volume utile nominal et
alerte au-delà d'un seuil. Une alerte de danger qui se déclenche sur les maxima des fabricants perd son
sens : ce script mesure, sur toutes les données de charge locales, combien de charges maximales
publiées dépassent chaque seuil, et désigne ce qui les fait dépasser :
  * une SOURCE à l'écart du consensus des autres pour une même cartouche : erreur d'extraction
    probable (2026-10-13 : le parseur Alliant prêtait à la .338 Win. Mag. les charges de la .338 RUM) ;
  * TOUTES les sources trop hautes : volume de la base trop petit probable (.357 SIG, corrigée le
    2026-10-13). Avant de corriger, le test de la balle enfoncée : (capacité en eau mesurée − volume
    de la base) / section de l'alésage doit être une profondeur plausible pour une balle courante.
Les marques « charge comprimée » des fabricants (Western, Lyman, Alliant) servent d'étalon : une charge
non marquée tient dans l'étui sans tassement.
Données : data/*.local.json (locales, hors git).
"""
import json
import os
import re
import statistics as st
import sys
from collections import defaultdict

ICI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GRAIN = 0.06479891
SOURCES = {'hodgdon': 'charge_gr', 'western': 'charge_gr', 'vihtavuori': 'max_gr', 'lyman': 'max_gr',
           'lovex': 'max_gr', 'alliant': 'charge_gr', 'norma': 'max_gr', 'adi': 'charge_gr'}
SEUILS = (1.05, 1.10, 1.15, 1.20, 1.25, 1.30)


def norm(s):
    s = str(s).lower().replace('winchester', 'win').replace('remington', 'rem').replace('magnum', 'mag')
    return re.sub(r'[^a-z0-9]', '', s.replace('springfield', 'spring'))


def q(a, p):
    a = sorted(a)
    return a[min(len(a) - 1, int(p * len(a)))]


def main():
    d = lambda f: os.path.join(ICI, 'data', f)
    pw = json.load(open(d('powders.json'), encoding='utf-8'))['powders']
    cal = json.load(open(d('calibers.json'), encoding='utf-8'))['calibers']
    idx = {norm(a): k for k, v in cal.items() for a in [k] + v.get('aliases', [])}
    L = []
    for s, kc in SOURCES.items():
        if not os.path.exists(d(s + '.local.json')):
            continue
        for r in json.load(open(d(s + '.local.json'), encoding='utf-8'))['rows']:
            if r.get('cast'):
                continue                                   # balles coulées : autre domaine
            ck, p = idx.get(norm(r.get('cartridge'))), pw.get(r.get('powder'), {})
            if not ck or not p.get('pcd') or not r.get(kc) or not cal[ck].get('case_vol_cm3'):
                continue
            L.append(dict(src=s, ck=ck, ff=r[kc] * GRAIN / (p['pcd'] / 1000) / cal[ck]['case_vol_cm3'],
                          forme=p.get('type'), comp=r.get('compressed'), poing=cal[ck].get('type') == 'handgun'))
    print(f"{len(L)} charges maximales publiées ({len({x['ck'] for x in L})} cartouches)")
    for t in SEUILS:
        n = sum(x['ff'] > t for x in L)
        print(f"  au-delà de {t:.2f} : {n:5d} ({100 * n / len(L):4.1f} %)")
    print("\nrépartition (carabine par forme de poudre, arme de poing) :")
    for nom, sel in (('extrudée', lambda x: x['forme'] == 'Extruded' and not x['poing']),
                     ('sphérique', lambda x: x['forme'] == 'Spherical' and not x['poing']),
                     ('arme de poing', lambda x: x['poing'])):
        a = [x['ff'] for x in L if sel(x)]
        print(f"  {nom:14s} n = {len(a):5d}  P50 {q(a, .5):.2f}  P90 {q(a, .9):.2f}  P95 {q(a, .95):.2f}  P99 {q(a, .99):.2f}")
    m = [x for x in L if x['comp'] is not None]
    for etat, sel in (('non comprimées', False), ('comprimées', True)):
        a = [x['ff'] for x in m if bool(x['comp']) is sel and not x['poing']]
        if a:
            print(f"  marquées {etat:15s} (Western, Lyman, Alliant) n = {len(a):4d}  P50 {q(a, .5):.2f}  P90 {q(a, .9):.2f}")
    par = defaultdict(lambda: defaultdict(list))
    for x in L:
        par[x['ck']][x['src']].append(x['ff'])
    print("\nsource à l'écart du consensus (|écart| > 0,12, au moins trois sources de 5 charges) :")
    trop = []
    for ck, ds in sorted(par.items()):
        meds = {s: st.median(v) for s, v in ds.items() if len(v) >= 5}
        if not meds:
            continue
        cons = st.median(meds.values())
        if len(meds) >= 3:
            for s, v in meds.items():
                if abs(v - cons) > 0.12:
                    print(f"  {ck:22s} {s:10s} {v:.2f} contre {cons:.2f}")
        if cons > 1.10 and len(meds) >= 2:
            trop.append((cons, ck, meds))
    print("\ntoutes sources au-dessus de 1,10 (volume de la base à examiner) :")
    for cons, ck, meds in sorted(trop, reverse=True):
        print(f"  {ck:22s} volume {cal[ck]['case_vol_cm3']:.3f}  consensus {cons:.2f}  "
              + '  '.join(f'{s} {v:.2f}' for s, v in sorted(meds.items())))
    if '--cartouches' in sys.argv:
        print("\npar cartouche, part des charges maximales au-delà de 1,25 :")
        for ck in sorted(par, key=lambda k: -sum(f > 1.25 for v in par[k].values() for f in v)):
            tout = [f for v in par[ck].values() for f in v]
            n = sum(f > 1.25 for f in tout)
            if n:
                print(f"  {ck:22s} {n:4d}/{len(tout):4d}")


if __name__ == '__main__':
    main()
