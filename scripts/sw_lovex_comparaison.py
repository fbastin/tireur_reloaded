#!/usr/bin/env python3
"""Même poudre, deux normes : le guide Shooters World (SAAMI, psi) contre le guide Lovex (C.I.P., bar).

    python3 scripts/sw_lovex_comparaison.py [--detail]

Explosia vend les mêmes poudres sous deux noms (le guide Shooters World donne le nom Lovex de chacune).
Pour chaque cartouche, poudre et masse de balle publiées des deux côtés, on compare la charge maximale,
la vitesse maximale et la pression maximale (médianes par combinaison, la balle pouvant différer d'un
guide à l'autre). Données locales : data/shooters_world.local.json, data/lovex.local.json.

Une combinaison dont charge, vitesse et pression concordent à 0,2 % près est une REPRISE : le guide
Shooters World recopie alors la donnée Lovex (C.I.P.), sa « pression en psi » étant des bars convertis.
Les reprises sont comptées à part et sorties des médianes. Le plafond de pression de chaque guide (plus
haute pression publiée, par cartouche) est comparé à la pression maximale C.I.P. de la base.
"""
import collections
import importlib.util
import json
import os
import statistics as st
import sys

ICI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location('r', os.path.join(ICI, 'scripts', 'sw_remplissage.py'))
REMP = importlib.util.module_from_spec(spec)
spec.loader.exec_module(REMP)
PSI_PAR_BAR = 14.5038
JUMELLE = {'Shooters World Clean Shot': 'Lovex D032', 'Shooters World Auto Pistol': 'Lovex D036',
           'Shooters World Major Pistol': 'Lovex D037.1', 'Shooters World Heavy Pistol': 'Lovex D037.2',
           'Shooters World Buffalo Rifle': 'Lovex D060', 'Shooters World Blackout': 'Lovex D063',
           'Shooters World AR Plus': 'Lovex D073.4', 'Shooters World Match Rifle': 'Lovex D073.6',
           'Shooters World Precision': 'Lovex S062', 'Shooters World Long Rifle': 'Lovex S065',
           'Shooters World SW 4350': 'Lovex S070', 'Shooters World SW50BMG': 'Lovex D100-1'}


def main():
    sw = json.load(open(os.path.join(ICI, 'data', 'shooters_world.local.json'), encoding='utf-8'))['rows']
    lv = json.load(open(os.path.join(ICI, 'data', 'lovex.local.json'), encoding='utf-8'))['rows']
    cal = json.load(open(os.path.join(ICI, 'data', 'calibers.json'), encoding='utf-8'))['calibers']
    a, b = collections.defaultdict(list), collections.defaultdict(list)
    for r in sw:
        k, j = REMP.CLE.get(r['cartouche']), JUMELLE.get(r['poudre'])
        if k and j and r['cartouche'] not in ('5.56mm', '5.56 mm', '7.62mm NATO'):
            a[(k, j, r['balle_gr'])].append(r)
    for r in lv:
        b[(r['cartridge'], r['powder'], r['bullet_gr'])].append(r)
    combis = sorted(set(a) & set(b))
    lignes = []
    for c in combis:
        A, B = a[c], b[c]
        ch = st.median(r['max_gr'] for r in A) / st.median(r['max_gr'] for r in B)
        v = st.median(r['max_fps'] for r in A) / (st.median(r['max_ms'] for r in B) / 0.3048)
        pa = [r['max_psi'] for r in A if r['max_psi']]
        pb = [r['max_Pmax_bar'] for r in B if r.get('max_Pmax_bar')]
        p = st.median(pa) / (st.median(pb) * PSI_PAR_BAR) if pa and pb else None
        reprise = all(x is not None and abs(x - 1) < 0.002 for x in (ch, v, p))
        lignes.append(dict(c=c, n=(len(A), len(B)), charge=ch, vitesse=v, pression=p, reprise=reprise,
                           type=cal[c[0]].get('type', 'rifle'), canon=st.median(r['barrel_mm'] for r in B)))
    rep = [l for l in lignes if l['reprise']]
    print(f"{len(combis)} combinaisons cartouche/poudre/masse de balle publiées dans les deux guides, dont "
          f"{len(rep)} reprises de Lovex ({', '.join(sorted({l['c'][0] for l in rep}))})")
    for t in ('rifle', 'handgun'):
        s = [l for l in lignes if l['type'] == t and not l['reprise']]
        if not s:
            continue
        print(f"\n{'carabine' if t == 'rifle' else 'arme de poing'} : {len(s)} combinaisons")
        for nom in ('charge', 'vitesse', 'pression'):
            x = sorted(l[nom] for l in s if l[nom])
            print(f"  {nom:9s} Shooters World / Lovex : médiane {st.median(x):.3f}, de {x[0]:.3f} à {x[-1]:.3f} (n = {len(x)})")
    # plafond de pression de chaque guide, par cartouche commune
    print("\nplus haute pression publiée (psi) : Shooters World | Lovex | limite C.I.P. de la base")
    for k in sorted({l['c'][0] for l in lignes if not l['reprise']}):
        psw = max((r['max_psi'] for r in sw if REMP.CLE.get(r['cartouche']) == k and r['max_psi']), default=None)
        plv = max((r['max_Pmax_bar'] for r in lv if r['cartridge'] == k and r.get('max_Pmax_bar')), default=None)
        cip = cal[k].get('pmax_cip_bar')
        print(f"  {k:16s} {psw or 0:7.0f} | {(plv or 0) * PSI_PAR_BAR:7.0f} | {(cip or 0) * PSI_PAR_BAR:7.0f}")
    if '--detail' in sys.argv:
        for l in lignes:
            p = f"{l['pression']:.3f}" if l['pression'] else '  -  '
            print(f"  {l['c'][0]:16s} {l['c'][1]:13s} {l['c'][2]:>4} gr  n {l['n']}  charge {l['charge']:.3f}  "
                  f"vitesse {l['vitesse']:.3f}  pression {p}  canon Lovex {l['canon']:.0f} mm")


if __name__ == '__main__':
    main()
