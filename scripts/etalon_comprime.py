#!/usr/bin/env python3
"""Les marques « charge comprimée » des fabricants comme étalon des densités de poudre et des volumes d'étui.

    python3 scripts/etalon_comprime.py [--toutes]

Un fabricant marque une charge maximale « C » quand la poudre dépasse le volume sous la balle. Le seuil de
marquage, exprimé dans le remplissage CALCULÉ par l'estimateur (charge / densité apparente de la base / volume
utile de la base), vaut donc seuil vrai × (densité vraie / densité de la base) × (volume vrai / volume de la
base). Une régression logistique à effets poudre et cartouche estime les deux rapports d'un coup :

    logit P(C) = k · (ln remplissage − θ − a_poudre − b_cartouche) + β · ln(balle / balle médiane de la cartouche)

a_poudre = ln(densité vraie / densité de la base), b_cartouche = ln(volume vrai / volume de la base) ; la balle
lourde s'enfonce et réduit le volume. Pénalité ridge sur les effets (une poudre ou une cartouche peu marquée
reste près de zéro) ; écart-type par l'inverse du hessien pénalisé. Les effets sont relatifs : la moyenne des
erreurs de la base passe dans θ.

La forme des grains a son propre effet, non pénalisé : les extrudées longues sont marquées plus tôt que les
sphériques, à densité juste (premier passage du 2026-10-13 : Retumbo, H4831, IMR 4350 −6 à −10 % ; H335,
Accurate 2200 +7 à +12 %). Une poudre est donc jugée contre les poudres de sa forme. L'effet poudre mêle encore
densité et façon dont les grains se rangent : il désigne, il ne mesure pas.

Contrôle : les poudres Vihtavuori, dont la densité de la base est celle du fabricant (guide 2026) et que le
manuel Hodgdon publie aussi, doivent sortir près de zéro.

Données : charges maximales de carabine marquées ou non, appariées comme build_anchors.js
(scripts/remplissage_publie.py). Une source ne compte que pour les poudres dont elle produit les données :
Hodgdon pour Hodgdon, IMR et Winchester (il réimprime les charges Accurate et Ramshot de Western SANS leurs
« C » : 48 marques sur 3 065 lignes, contre 19 % pour ses poudres), Western pour Accurate et Ramshot, Alliant
pour Alliant, Lyman (essais propres) pour toutes. Une ligne imprimée à l'identique par deux guides retenus ne
compte qu'une fois ; un désaccord de marque entre eux est compté.
"""
import json
import os
import statistics as st
import sys
from collections import defaultdict

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from remplissage_publie import GRAIN, index, norm  # noqa: E402

ICI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCES = {'western': 'charge_gr', 'hodgdon': 'charge_gr', 'lyman': 'max_gr', 'alliant': 'charge_gr'}
PROPRES = {'hodgdon': {'Hodgdon', 'IMR', 'Winchester'}, 'western': {'Accurate', 'Ramshot'}, 'alliant': {'Alliant'}}
FORME = {'Extruded': 'extrudée', 'Spherical': 'sphérique', 'Ball': 'sphérique', 'Flake': 'paillette'}
LAMBDA = 1.0


def charger():
    d = lambda f: os.path.join(ICI, 'data', f)
    pw = json.load(open(d('powders.json'), encoding='utf-8'))['powders']
    cal = json.load(open(d('calibers.json'), encoding='utf-8'))['calibers']
    pidx, cartouche = index(pw, cal)
    vus, conflits, L = {}, 0, []
    for s, kc in SOURCES.items():
        for r in json.load(open(d(s + '.local.json'), encoding='utf-8'))['rows']:
            if r.get('cast') or r.get('compressed') is None:
                continue
            ck, pk = cartouche(r.get('cartridge')), pidx.get(norm(r.get('powder') or ''))
            if not ck or not pk or cal[ck].get('type') == 'handgun' or not pw[pk].get('pcd') or not r.get(kc):
                continue
            if s in PROPRES and pw[pk].get('mfg') not in PROPRES[s]:
                continue
            if r.get('bore_mm') and abs(r['bore_mm'] - cal[ck]['bore_mm']) > 0.3:
                continue
            cle = (ck, pk, r.get('bullet_gr'), r[kc])
            if cle in vus:
                conflits += vus[cle] != bool(r['compressed'])
                continue
            vus[cle] = bool(r['compressed'])
            L.append(dict(src=s, ck=ck, pk=pk, m=r['bullet_gr'], c=bool(r['compressed']),
                          forme=FORME.get(pw[pk].get('type'), 'inconnue'),
                          ff=r[kc] * GRAIN / (pw[pk]['pcd'] / 1000) / cal[ck]['case_vol_cm3']))
    return pw, cal, L, conflits


def ajuster(L):
    pk = sorted({x['pk'] for x in L}); ck = sorted({x['ck'] for x in L})
    formes = sorted({x['forme'] for x in L} - {'extrudée'})
    ip = {p: i for i, p in enumerate(pk)}; ic = {c: i for i, c in enumerate(ck)}; jf = {f: i for i, f in enumerate(formes)}
    mmed = {c: st.median(x['m'] for x in L if x['ck'] == c) for c in ck}
    o = 3 + len(formes)                                    # constante, ln remplissage, balle, formes
    n, q = len(L), o + len(pk) + len(ck)
    X = np.zeros((n, q)); y = np.array([x['c'] for x in L], float)
    for i, x in enumerate(L):
        X[i, 0] = 1; X[i, 1] = np.log(x['ff']); X[i, 2] = np.log(x['m'] / mmed[x['ck']])
        if x['forme'] in jf:
            X[i, 3 + jf[x['forme']]] = 1
        X[i, o + ip[x['pk']]] = 1; X[i, o + len(pk) + ic[x['ck']]] = 1
    pen = np.full(q, LAMBDA); pen[:3] = 0; pen[3:o] = 0.1   # forme : pénalité légère (aucune paillette marquée en carabine)
    b = np.zeros(q)
    for _ in range(100):                                   # Newton (IRLS) pénalisé
        p = 1 / (1 + np.exp(-(X @ b)))
        g = X.T @ (y - p) - pen * b
        H = (X * (p * (1 - p))[:, None]).T @ X + np.diag(pen)
        pas = np.linalg.solve(H, g)
        b += pas
        if np.max(np.abs(pas)) < 1e-9:
            break
    cov = np.linalg.inv(H)
    k = b[1]
    eff = lambda j: (-b[j] / k, np.sqrt(cov[j, j]) / k)    # ln(rapport), écart-type (delta, k tenu fixe)
    poudres = {p: eff(o + ip[p]) for p in pk}
    cartouches = {c: eff(o + len(pk) + ic[c]) for c in ck}
    formes = {f: eff(3 + jf[f]) for f in formes}
    return b, poudres, cartouches, formes


def main():
    pw, cal, L, conflits = charger()
    nC = sum(x['c'] for x in L)
    par_src = defaultdict(lambda: [0, 0])
    for x in L:
        par_src[x['src']][x['c']] += 1
    print(f"{len(L)} charges maximales de carabine ({nC} marquées comprimées) ; lignes répétées entre guides "
          f"comptées une fois, {conflits} désaccords de marque entre elles")
    print('  ' + ' · '.join(f"{s} {v[1]}/{v[0] + v[1]}" for s, v in par_src.items()))
    b, poudres, cartouches, formes = ajuster(L)
    print(f"pente k = {b[1]:.1f} (largeur de la transition ≈ {100 * 2.2 / b[1]:.0f} % de remplissage), seuil "
          f"exp(θ) = {np.exp(-b[0] / b[1]):.3f} (poudres extrudées), balle : β = {b[2]:.2f}")
    print('  formes, seuil relatif aux extrudées : ' + ' · '.join(
        f"{f} {100 * (np.exp(a) - 1):+.1f} % ± {100 * se:.1f}" for f, (a, se) in formes.items()))
    comptes = defaultdict(lambda: defaultdict(lambda: [0, 0]))
    for x in L:
        comptes['p'][x['pk']][x['c']] += 1
        comptes['c'][x['ck']][x['c']] += 1
    tout = '--toutes' in sys.argv

    def ligne(nom, base, a, se, n):
        return f"  {nom[:28]:28s} {base:7.3f} {np.exp(a) * base:8.3f} {100 * (np.exp(a) - 1):+6.1f} % ± {100 * se:4.1f}  C {n[1]:3d} / {n[0] + n[1]:4d}"

    vv = [p for p in poudres if str(pw[p].get('pcd_src', '')).startswith('Vihtavuori')]
    print(f"\ncontrôle — poudres Vihtavuori (densité du fabricant), {len(vv)} :")
    print(f"  {'poudre':28s} {'base':>7s} {'implicite':>8s} {'écart':>8s}")
    for p in sorted(vv, key=lambda p: poudres[p][0]):
        a, se = poudres[p]
        print(ligne(p, pw[p]['pcd'] / 1000, a, se, comptes['p'][p]))
    ok = [poudres[p][0] for p in vv if min(comptes['p'][p]) >= 3]
    if ok:
        print(f"  écart médian {100 * (np.exp(st.median(ok)) - 1):+.1f} % sur les {len(ok)} poudres marquées et non marquées au moins 3 fois")

    print(f"\npoudres : densité implicite de la base corrigée ({'toutes' if tout else 'écart > 4 % et ≥ 3 charges de chaque sorte'})")
    print(f"  {'poudre':28s} {'base':>7s} {'implicite':>8s} {'écart':>8s}")
    for p in sorted(poudres, key=lambda p: poudres[p][0]):
        a, se = poudres[p]
        n = comptes['p'][p]
        if tout or (abs(a) > 0.04 and min(n) >= 3):
            src = str(pw[p].get('pcd_src', ''))
            note = ' [Nosler]' if src.startswith('Nosler') else (' [fabricant]' if src else '')
            print(ligne(p, pw[p]['pcd'] / 1000, a, se, n) + note)

    ref = os.path.join(ICI, '..', '..', 'calibers', 'nosler_capacity_reference.json')
    nos = defaultdict(list)
    if os.path.exists(ref):
        for c in json.load(open(ref, encoding='utf-8'))['calibres'].values():
            nos[c['cle_estimateur']] += [x['case_holds_gr'] / 15.4324 for x in c['detail']]
    # sans les cartouches dont la base a repris le volume Nosler (2026-10-13) : comparées à elles-mêmes
    commun = [c for c in cartouches if c in nos and min(comptes['c'][c]) >= 3
              and abs(cal[c]['case_vol_cm3'] / st.median(nos[c]) - 1) > 0.005]
    if commun:
        e = [(np.exp(cartouches[c][0]) * cal[c]['case_vol_cm3'], st.median(nos[c]), cal[c]['case_vol_cm3']) for c in commun]
        r = np.corrcoef([np.log(a / v) for a, n_, v in e], [np.log(n_ / v) for a, n_, v in e])[0, 1]
        ec = sorted(abs(np.log(a / n_)) for a, n_, v in e)
        eb = sorted(abs(np.log(v / n_)) for a, n_, v in e)
        print(f"\ncontrôle — volumes contre les capacités Nosler balle en place, {len(commun)} cartouches : corrélation "
              f"des écarts à la base {r:.2f} ; écart absolu médian à Nosler : étalon {100 * st.median(ec):.1f} %, "
              f"base {100 * st.median(eb):.1f} %")

    print(f"\ncartouches : volume implicite ({'toutes' if tout else 'écart > 5 % et ≥ 3 charges de chaque sorte'})")
    print(f"  {'cartouche':28s} {'base':>7s} {'implicite':>8s} {'écart':>8s}")
    for c in sorted(cartouches, key=lambda c: cartouches[c][0]):
        a, se = cartouches[c]
        n = comptes['c'][c]
        if tout or (abs(a) > 0.05 and min(n) >= 3):
            print(ligne(c, cal[c]['case_vol_cm3'], a, se, n) + (f"  Nosler {st.median(nos[c]):.3f}" if c in nos else ''))


if __name__ == '__main__':
    main()
