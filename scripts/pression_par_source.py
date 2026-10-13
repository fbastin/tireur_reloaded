#!/usr/bin/env python3
"""Pression du modèle contre la pression publiée, laboratoire par laboratoire.

    python3 scripts/pression_par_source.py

Deux mesures sur toutes les charges publiées avec une pression (Reload Swiss, Western, Hodgdon en psi pour ses
propres poudres, Lovex, ADI en psi, Shooters World en carabine) :
  1. η_p seul : pression tirée de la vitesse PUBLIÉE et du η_p du modèle (η_p mesuré / η_p du modèle). Isole
     la relation de pression.
  2. prédiction complète à froid, comme l'outil sans ancre : énergie et η_p du modèle, pression au canon de
     référence de la cartouche (la pression de pic ne dépend pas du canon). C'est elle que décrit le bandeau
     de l'outil (« sous-estimée de plus de 15 % pour une charge sur cinq sans données fabricant »).
Le modèle de pression est calé sur Reload Swiss, Western et Vihtavuori au plafond C.I.P.
(fit_pressure_multibrand.js) ; Lovex, ADI et Shooters World n'y entrent pas. Résultat du 2026-10-13 : l'écart
tient d'abord au laboratoire (carabine, η_p seul : Reload Swiss +7 %, Lovex −9 %), qu'aucun recalage commun
n'absorbe (recalé sur quatre laboratoires : ADI −4,6 %, Shooters World −7,5 %), et la prédiction à froid sous-estime
de plus de 15 % une charge sur cinq au calage, une sur quatre sur les laboratoires neufs, une sur trois chez Lovex
et Shooters World. Biais > 0 : modèle prudent.
Données : data/*.local.json (locales, hors git).
"""
import json
import math
import os
import statistics as st
import sys

ICI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ICI, 'scripts'))
from remplissage_publie import index, norm  # noqa: E402
from sw_remplissage import CLE as SW_CLE  # noqa: E402

G, GR, PSI = 6.479891e-5, 0.06479891, 0.0689476
CALAGE = ('RS', 'Western', 'Hodgdon')
NEUFS = ('Lovex', 'ADI', 'SW')


def charger():
    d = lambda f: os.path.join(ICI, 'data', f)
    pw = json.load(open(d('powders.json'), encoding='utf-8'))['powders']
    cal = json.load(open(d('calibers.json'), encoding='utf-8'))['calibers']
    co = json.load(open(d('model_coefficients.json'), encoding='utf-8'))
    pidx, cart = index(pw, cal)
    lin = lambda c, f: sum(a * b for a, b in zip(c, f))
    L = []

    def ajoute(src, ck, pk, m_gr, c_gr, v_ms, p_bar, bbl_mm, bore=None):
        if not ck or not pk or not pw.get(pk, {}).get('pcd'):
            return
        ca, p = cal[ck], pw[pk]
        if bore and abs(bore - ca['bore_mm']) > 0.3:
            return
        if not (bbl_mm and bbl_mm > ca['case_mm'] and p_bar and p_bar > 0 and v_ms > 0 and c_gr > 0 and m_gr > 0):
            return
        A = math.pi * (ca['bore_mm'] / 1000) ** 2 / 4
        V = ca['case_vol_cm3'] * 1e-6
        C, fill = c_gr * G, c_gr * GR / (p['pcd'] / 1000) / ca['case_vol_cm3']
        ls = (bbl_mm - ca['case_mm']) / 1000
        ref = ca.get('test_barrel_mm') or (122 if ca.get('type') == 'handgun' else 600)
        lr = (ref - ca['case_mm']) / 1000
        mesure = 0.5 * (m_gr * G + C / 3) * v_ms ** 2 / (p_bar * 1e5 * A * ls)
        eta_src = lin(co['eta_p']['coef'], [1, fill, math.log(1 + A * ls / V)])
        eta_ref = lin(co['eta_p']['coef'], [1, fill, math.log(1 + A * lr / V)])
        E = (lin(co['eta_b']['coef'], [1, fill, p['Ba']]) * p['Qex'] * 1000 if p.get('Qex') and p.get('Ba')
             else lin(co['e_eff']['coef'], [1, fill]))
        L.append(dict(src=src, poing=ca.get('type') == 'handgun', seul=mesure / eta_src - 1,
                      froid=E * C / (eta_ref * A * lr) / 1e5 / p_bar - 1))

    for r in json.load(open(d('rs_dataset.local.json'), encoding='utf-8')):
        ajoute('RS', cart(r['cartridge']), pidx.get(norm(r['powder'])), r['m_gr'], r['C_gr'], r['v0'], r['Pmax'], r['barrel_mm'])
    for r in json.load(open(d('western.local.json'), encoding='utf-8'))['rows']:
        ajoute('Western', cart(r['cartridge']), pidx.get(norm(r['powder'])), r['bullet_gr'], r['charge_gr'],
               r['v0_fps'] * 0.3048, (r['Pmax_psi'] or 0) * PSI, r['barrel_mm'], r.get('bore_mm'))
    for r in json.load(open(d('hodgdon.local.json'), encoding='utf-8'))['rows']:
        pk = pidx.get(norm(r['powder']))
        if r.get('Pmax_unit') != 'PSI' or (pk and pw[pk].get('mfg') not in ('Hodgdon', 'IMR', 'Winchester')):
            continue                                       # CUP non convertible ; réimpressions Western déjà comptées
        ajoute('Hodgdon', cart(r['cartridge']), pk, r['bullet_gr'], r['charge_gr'], r['v0_fps'] * 0.3048,
               r['Pmax_psi'] * PSI, r['barrel_mm'], r.get('bore_mm'))
    for r in json.load(open(d('lovex.local.json'), encoding='utf-8'))['rows']:
        ajoute('Lovex', cart(r['cartridge']), pidx.get(norm(r['powder'])), r['bullet_gr'], r['max_gr'], r['max_ms'],
               r.get('max_Pmax_bar'), r.get('barrel_mm'))
    for r in json.load(open(d('adi.local.json'), encoding='utf-8'))['rows']:
        if r.get('Pmax_unit') == 'PSI':
            ajoute('ADI', cart(r['cartridge']), pidx.get(norm(r['powder'])), r['bullet_gr'], r['charge_gr'],
                   r['v0_fps'] * 0.3048, r['Pmax_psi'] * PSI, r['barrel_mm'], r.get('bore_mm'))
    for r in json.load(open(d('shooters_world.local.json'), encoding='utf-8'))['rows']:
        ck = SW_CLE.get(r['cartouche'])
        if r.get('max_psi') and ck and cal.get(ck, {}).get('type') != 'handgun':   # canon d'arme de poing inconnu
            ajoute('SW', ck, r['poudre'], r['balle_gr'], r['max_gr'], r['max_fps'] * 0.3048, r['max_psi'] * PSI,
                   (r['canon_in'] or 24) * 25.4)
    return L


def ligne(nom, e):
    e = sorted(e)
    f = sum(v < -0.15 for v in e) / len(e)
    return (f"  {nom:32s} n = {len(e):5d}  biais {100 * st.mean(e):+5.1f} %  RMS {100 * math.sqrt(st.mean([v * v for v in e])):4.1f} %"
            f"  sous-estimées de plus de 15 % : {100 * f:4.1f} % (une sur {1 / f:.0f})  centile 1 % {100 * e[int(0.01 * len(e))]:+.0f} %")


def main():
    L = charger()
    for cle, titre in (('seul', 'η_p seul (vitesse publiée)'), ('froid', 'prédiction complète à froid, comme l\'outil sans ancre')):
        print(f"\n{titre} :")
        for nom, sel in [('calage (RS, Western, Hodgdon)', lambda x: x['src'] in CALAGE),
                         ('neufs (Lovex, ADI, Shooters World)', lambda x: x['src'] in NEUFS)] + \
                        [(s, (lambda s: lambda x: x['src'] == s)(s)) for s in CALAGE + NEUFS]:
            for arme, s2 in (('', lambda x: True), (', carabine', lambda x: not x['poing'])):
                e = [x[cle] for x in L if sel(x) and s2(x)]
                if len(e) >= 20:
                    print(ligne(nom + arme, e))


if __name__ == '__main__':
    main()
