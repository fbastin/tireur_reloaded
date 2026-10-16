#!/usr/bin/env python3
"""Remplissage des charges MAXIMALES publiées par les fabricants, au volume nominal de la base.

    python3 scripts/remplissage_publie.py [--cartouches]
    python3 scripts/remplissage_publie.py --check    # nocturne : sort en 1 sur un signal nouveau


L'outil (index.php) affiche le remplissage (charge / densité apparente) / volume utile nominal et
alerte au-delà d'un seuil. Une alerte de danger qui se déclenche sur les maxima des fabricants perd son
sens : ce script mesure, sur toutes les données de charge locales, combien de charges maximales
publiées dépassent chaque seuil, et désigne ce qui les fait dépasser :
  * une SOURCE à l'écart du consensus des autres pour une même cartouche : erreur d'extraction
    probable (2026-10-13 : le parseur Alliant prêtait à la .338 Win. Mag. les charges de la .338 RUM) ;
    Le test désigne, il ne prouve rien : un fabricant qui ne publie que des poudres lentes et denses
    remplit plus (Western en .243 Win. : Hunter, Magnum, Magpro, données identiques à Hodgdon) ;
  * TOUTES les sources trop hautes : volume de la base trop petit probable (.357 SIG, corrigée le
    2026-10-13). Avant de corriger, le test de la balle enfoncée : (capacité en eau mesurée − volume
    de la base) / section de l'alésage doit être une profondeur plausible pour une balle courante.
Les marques « charge comprimée » des fabricants (Hodgdon, Western, Lyman, Alliant) servent d'étalon : une charge
non marquée tient dans l'étui sans tassement.
Données : data/*.local.json (locales, hors git).

Contrôle nocturne (--check, étape 8quinquies de la maintenance du site, 2026-10-13). Chaque signal admis est
inscrit, avec sa raison, dans data/remplissage_reference.json ; le contrôle sort en 1 sur un signal qui n'y
est pas, sur une charge maximale qui remplirait plus de 1,6 fois l'étui (impossible, donc la ligne d'une autre
cartouche), sur une part de maxima au-delà du seuil rouge supérieure au plafond inscrit, ou sur un nombre de
charges lues tombé sous 90 % de la référence (un lecteur de guide cassé, un fichier local absent). Il aurait
signalé le lecteur Alliant (charges de la .338 RUM prêtées à la .338 Win. Mag.) et le lecteur Vihtavuori (les
tableaux à virgule décimale, 6,5 Grendel rangée sous la .25-06), tous deux trouvés à la main.
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
ROUGE = 1.25                                               # seuil de l'alerte rouge d'index.php
IMPOSSIBLE = 1.6   # au-delà, la charge ne tient pas dans l'étui même tassée : ligne d'une autre cartouche
                   # (Vihtavuori : .460 S&W sous la .45 ACP, remplissage 2 à 3, 2026-10-13)


# Appariement identique à celui de build_anchors.js : libellés normalisés (parenthèses ôtées,
# « (continued) » de Western), poudre par clé puis par nom de produit, cartouche par clé, alias ou
# variante de pression ramenée à la base, garde sur le calibre. Jusqu'au 2026-10-13, la poudre
# n'était cherchée que par sa clé exacte : aucune ligne Western (« RAMSHOT TRUE BLUE ») n'entrait.
def norm(s):
    s = re.sub(r'\(.*?\)', '', str(s).lower())
    s = s.replace('winchester', 'win').replace('remington', 'rem').replace('magnum', 'mag')
    return re.sub(r'[^a-z0-9]', '', s.replace('springfield', 'spring'))


def sans_variante(s):
    return re.sub(r'\bfor ar-?15.*', '', re.sub(r'\s*\+p\+?\b', '', str(s), flags=re.I), flags=re.I)


def index(pw, cal):
    pidx = {norm(k): k for k in pw}
    for k, v in pw.items():
        pidx.setdefault(norm(v.get('name', '')), k)
    pidx.pop('', None)
    cidx = {norm(a): k for k, v in cal.items() for a in [k] + v.get('aliases', [])}
    def cartouche(nom):
        if re.search(r'\bpsi\b|specification|standard saami', str(nom), re.I):
            return None
        return cidx.get(norm(nom)) or cidx.get(norm(sans_variante(nom)))
    return pidx, cartouche


def q(a, p):
    a = sorted(a)
    return a[min(len(a) - 1, int(p * len(a)))]


def verifier(n, part_rouge, ecarts, trop, absents, impossibles):
    ref = json.load(open(os.path.join(ICI, 'data', 'remplissage_reference.json'), encoding='utf-8'))
    pb = []
    if absents:
        pb.append(f"données locales absentes : {', '.join(absents)}")
    if n < 0.9 * ref['charges']:
        pb.append(f"{n} charges maximales lues, contre {ref['charges']} à la référence : un lecteur de guide a cassé ?")
    if part_rouge > ref['part_rouge_max']:
        pb.append(f"{100 * part_rouge:.1f} % des maxima publiés au-delà du seuil rouge ({100 * ROUGE:.0f} %), plafond "
                  f"{100 * ref['part_rouge_max']:.1f} % : un volume ou une densité a changé ?")
    for x in impossibles:
        pb.append(f"charge impossible ({x['src']}) : {x['ck']}, {x['pk']}, balle {x['m']} gr, remplissage {x['ff']:.2f}"
                  f" — ligne d'une autre cartouche ?")
    # Les fenêtres de départ que l'outil affiche viennent aussi de sources hors de ce diagnostic (Speer, Sierra,
    # LoadData, Vectan) : leur charge maximale est soumise à la même garde (2026-10-13).
    f = os.path.join(ICI, 'data', 'start_charges.local.json')
    if os.path.exists(f):
        pw = json.load(open(os.path.join(ICI, 'data', 'powders.json'), encoding='utf-8'))['powders']
        cal = json.load(open(os.path.join(ICI, 'data', 'calibers.json'), encoding='utf-8'))['calibers']
        sc = json.load(open(f, encoding='utf-8'))
        # fenêtres typiques, et fenêtres par masse (2026-10-16 : loi de pression à deux pentes, échelle de charge)
        fen = [(k, '', w) for k, w in sc['charges'].items()]
        fen += [(k, f", balle {m} gr", w) for k, f in (sc.get('fenetres_masse') or {}).items() for m, w in f.items()]
        for k, balle, w in fen:
            ck, pk = k.split('|', 1)
            if w.get('c') is not None and w['c'] > w['cmax']:
                pb.append(f"fenêtre affichée par l'outil, départ au-dessus du max : {k}{balle}, {w['c']}-{w['cmax']} gr")
            if w.get('cmoy') is not None and w['cmoy'] < w['cmax'] - 0.005:
                pb.append(f"fenêtre par masse, maximum moyen sous le plus petit : {k}{balle}, {w['cmoy']} < {w['cmax']} gr")
            if ck in cal and pw.get(pk, {}).get('pcd') and cal[ck].get('case_vol_cm3'):
                ff = w['cmax'] * GRAIN / (pw[pk]['pcd'] / 1000) / cal[ck]['case_vol_cm3']
                if ff > IMPOSSIBLE:
                    pb.append(f"fenêtre de départ impossible affichée par l'outil : {k}{balle}, {w['c']}-{w['cmax']} gr, remplissage {ff:.2f}")
    else:
        pb.append("data/start_charges.local.json absent : les fenêtres de départ de l'outil ne sont pas contrôlées")
    for e in ecarts:
        if e not in ref['ecarts']:
            pb.append(f"source à l'écart du consensus, non examinée : {e.replace('|', ' — ')}")
    for c in trop:
        if c not in ref['trop_pleins']:
            pb.append(f"toutes les sources au-dessus de 1,10, non examiné : {c}")
    print()
    for e in sorted(set(ref['ecarts']) - set(ecarts)) + sorted(set(ref['trop_pleins']) - set(trop)):
        print(f"(signal admis disparu, la référence peut être allégée : {e})")
    if pb:
        print('\n'.join('/!\\ ' + p for p in pb))
        return 1
    print(f"remplissage des charges publiées : OK — {n} maxima, {100 * part_rouge:.1f} % au-delà du seuil rouge, "
          f"{len(ecarts) + len(trop)} signaux, tous examinés")
    return 0


def main():
    d = lambda f: os.path.join(ICI, 'data', f)
    pw = json.load(open(d('powders.json'), encoding='utf-8'))['powders']
    cal = json.load(open(d('calibers.json'), encoding='utf-8'))['calibers']
    pidx, cartouche = index(pw, cal)
    L = []
    # Hodgdon réimprime les lignes Accurate/Ramshot de Western : la copie compterait deux fois (et ferait
    # paraître les deux sources d'accord) ; seule la ligne Western est gardée (2026-10-13).
    western = set()
    if os.path.exists(d('western.local.json')):
        for r in json.load(open(d('western.local.json'), encoding='utf-8'))['rows']:
            western.add((cartouche(r.get('cartridge')), pidx.get(norm(r.get('powder') or '')), r.get('bullet_gr'), r.get('charge_gr'), r.get('v0_fps')))
    for s, kc in SOURCES.items():
        if not os.path.exists(d(s + '.local.json')):
            continue
        for r in json.load(open(d(s + '.local.json'), encoding='utf-8'))['rows']:
            if r.get('cast'):
                continue                                   # balles coulées : autre domaine
            if s == 'hodgdon' and (cartouche(r.get('cartridge')), pidx.get(norm(r.get('powder') or '')), r.get('bullet_gr'),
                                   r.get('charge_gr'), r.get('v0_fps')) in western:
                continue
            ck, pk = cartouche(r.get('cartridge')), pidx.get(norm(r.get('powder') or ''))
            p = pw.get(pk, {})
            if not ck or not p.get('pcd') or not r.get(kc) or not cal[ck].get('case_vol_cm3'):
                continue
            if r.get('bore_mm') and abs(r['bore_mm'] - cal[ck]['bore_mm']) > 0.3:
                continue                                   # mauvaise cartouche (garde de build_anchors.js)
            L.append(dict(src=s, ck=ck, ff=r[kc] * GRAIN / (p['pcd'] / 1000) / cal[ck]['case_vol_cm3'], pk=pk, m=r.get('bullet_gr'),
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
            print(f"  marquées {etat:15s} (Hodgdon, Western, Lyman, Alliant) n = {len(a):4d}  P50 {q(a, .5):.2f}  P90 {q(a, .9):.2f}")
    par = defaultdict(lambda: defaultdict(list))
    for x in L:
        par[x['ck']][x['src']].append(x['ff'])
    # Carabines seulement : pour une arme de poing, le remplissage suit surtout la vivacité des poudres que
    # chaque fabricant retient (Western et Hodgdon : beaucoup de poudres vives), pas une erreur d'extraction.
    print("\nsource à l'écart du consensus, carabines (|écart| > 0,12, au moins trois sources de 5 charges) :")
    trop, ecarts = [], []
    for ck, ds in sorted(par.items()):
        meds = {s: st.median(v) for s, v in ds.items() if len(v) >= 5}
        if not meds:
            continue
        cons = st.median(meds.values())
        if len(meds) >= 3 and cal[ck].get('type') != 'handgun':
            for s, v in meds.items():
                if abs(v - cons) > 0.12:
                    ecarts.append(f"{ck}|{s}")
                    print(f"  {ck:22s} {s:10s} {v:.2f} contre {cons:.2f}")
        if cons > 1.10 and len(meds) >= 2:
            trop.append((cons, ck, meds))
    print("\ntoutes sources au-dessus de 1,10 (volume de la base à examiner) :")
    for cons, ck, meds in sorted(trop, reverse=True):
        print(f"  {ck:22s} volume {cal[ck]['case_vol_cm3']:.3f}  consensus {cons:.2f}  "
              + '  '.join(f'{s} {v:.2f}' for s, v in sorted(meds.items())))
    if '--check' in sys.argv:
        return verifier(len(L), sum(x['ff'] > ROUGE for x in L) / len(L), ecarts, [ck for _, ck, _ in trop],
                        [s for s in SOURCES if not os.path.exists(d(s + '.local.json'))],
                        [x for x in L if x['ff'] > IMPOSSIBLE])
    if '--cartouches' in sys.argv:
        print("\npar cartouche, part des charges maximales au-delà de 1,25 :")
        for ck in sorted(par, key=lambda k: -sum(f > 1.25 for v in par[k].values() for f in v)):
            tout = [f for v in par[ck].values() for f in v]
            n = sum(f > 1.25 for f in tout)
            if n:
                print(f"  {ck:22s} {n:4d}/{len(tout):4d}")


if __name__ == '__main__':
    sys.exit(main())
