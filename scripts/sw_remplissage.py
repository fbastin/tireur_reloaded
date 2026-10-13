#!/usr/bin/env python3
"""Les volumes d'étui de data/calibers.json contre les charges maximales du guide Shooters World.

    python3 scripts/sw_remplissage.py [--lignes]

Remplissage d'une charge, au sens de l'estimateur (index.php) : volume apparent de la poudre rapporté au
volume utile de l'étui, (charge en g / densité apparente en g/cm³) / case_vol_cm3. Une charge maximale
publiée dépasse rarement l'étui plein : au-delà, la poudre est tassée, et le guide le signale par un « C »
(six charges de 5,56 mm). Un remplissage nettement supérieur à 1 sur une charge NON signalée DÉSIGNE une
cartouche à examiner, il ne prouve rien : une poudre extrudée se tasse jusqu'à 110-115 % aux charges
maximales sans que le guide l'écrive. L'examen : (capacité en eau mesurée − volume de la base) / section
de l'alésage = profondeur de balle enfoncée qu'implique le volume de la base ; impossible pour une balle
courante, le volume est faux (7-08 : 1,83 cm, corrigée le 2026-10-12 ; .308 1,1 cm et .260 1,4 cm,
plausibles). Le contrôle ne voit pas un volume trop GRAND : une poudre vive remplit peu.

Densités : data/powders.json (pcd), confirmées par le même guide (bloc CONFIRMATIONS de
import_catalog.js). Données : data/shooters_world.local.json (parse_shooters_world.py, local).
"""
import json
import os
import statistics as st
import sys

ICI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GRAIN = 0.06479891

# Libellé du guide -> clé de calibers.json. Les cartouches militaires (5,56 mm, 7,62 mm NATO) prennent
# le volume de leur pendant civil, en le disant : leurs étuis sont plus épais.
CLE = {
    '.204 Ruger': '204 Ruger', '.22-250 Remington': '22-250 Rem.', '.222 Remington': '222 Rem.',
    '.223 Remington': '223 Rem.', '5.56mm': '223 Rem.', '5.56 mm': '223 Rem.', '224 Valkyrie': '224 Valkyrie',
    '.243 Winchester': '243 Win.', '243 Winchester': '243 Win.', '.260 Rem': '260 Rem.', '.260 Remington': '260 Rem.',
    '6mm BR': '6 Norma BR', '6mm BR Norma': '6 Norma BR', '6mm Creedmoor': '6 mm Creedmoor', '6XC': '6 XC',
    '6 mm ARC': '6mm ARC', '6mm ARC': '6mm ARC', '6.5 Creedmoor': '6.5 Creedmoor', '6.5 Grendel': '6.5 Grendel',
    '6.5 Precision Rifle Cartridge': '6.5 PRC', '270 Winchester': '270 Win.', '7mm-08': '7 -08 Rem.',
    '7mm-08 Winchester': '7 -08 Rem.', '7mm Rem Mag': '7 Rem. Mag.', '7.62x39': '7.62 x 39',
    '7.62x54R': '7.62 x 54 R', '.30-30 Winchester': '30-30 Win.', '.300 Blackout': '300 AAC BLK',
    '300 Blackout': '300 AAC BLK', '.308 Winchester': '308 Win.', '308 Winchester': '308 Win.',
    '7.62mm NATO': '308 Win.', '.30-06 Springfield': '30-06 Spring.', '30-06 Springfield Garand': '30-06 Spring.',
    '.300 Win Mag': '300 Win. Mag.', '.303 British': '303 British', '9.3x62': '9.3 x 62',
    '.45-70': '45 - 70 Govt.', '.458 SOCOM': '458 SOCOM', '458 SOCOM': '458 SOCOM',
    '.380 Auto': '9 mm Browning court', '9mm Luger': '9 mm Luger', '9mm': '9 mm Luger', '9mm +P': '9 mm Luger',
    '.38 SPL': '38 Special', '.38 SPL +P': '38 Special', '38 Special': '38 Special',
    '38 Super Auto +P': '38 Super Auto', '.357 Magnum': '357 Magnum', '.357 SIG': '357 SIG', '.357 Sig': '357 SIG',
    '.40 S&W': '40 S&W', '10mm Auto': '10 mm Auto', '.44 REM MAG': '44 Rem. Mag.', '.44 REM Mag': '44 Rem. Mag.',
    '.44 Remington Magnum': '44 Rem. Mag.', '44 REM MAG carbine': '44 Rem. Mag.', '.45 Auto': '45 ACP (Auto)',
    '45 ACP': '45 ACP (Auto)', '.45 Colt': '45 Colt', '45 Long Colt': '45 Colt',
}


def main():
    cal = json.load(open(os.path.join(ICI, 'data', 'calibers.json'), encoding='utf-8'))['calibers']
    pw = json.load(open(os.path.join(ICI, 'data', 'powders.json'), encoding='utf-8'))['powders']
    rows = json.load(open(os.path.join(ICI, 'data', 'shooters_world.local.json'), encoding='utf-8'))['rows']
    par, absentes = {}, set()
    for r in rows:
        k = CLE.get(r['cartouche'])
        if k is None or k not in cal or not cal[k].get('case_vol_cm3'):
            absentes.add(r['cartouche'])
            continue
        p = pw[r['poudre']]
        ff = r['max_gr'] * GRAIN / (p['pcd'] / 1000) / cal[k]['case_vol_cm3']
        par.setdefault(k, []).append(dict(r, ff=ff, forme=p.get('type'), U=cal[k]['case_vol_cm3']))
    print(f"{sum(len(v) for v in par.values())} charges maximales de {len(par)} cartouches confrontées ; "
          f"hors base : {', '.join(sorted(absentes))}")
    comp = [z for v in par.values() for z in v if z['comprimee']]
    print(f"charges signalées comprimées (« C ») : {len(comp)}, remplissage calculé "
          f"{min(z['ff'] for z in comp):.2f} à {max(z['ff'] for z in comp):.2f}")
    print(f"\n{'cartouche':22s} {'volume':>7s} {'n':>3s}  {'médiane':>7s}  {'max':>5s}  charge la plus remplie")
    suspects = []
    for k in sorted(par, key=lambda k: -max(z['ff'] for z in par[k] if not z['comprimee']) if any(not z['comprimee'] for z in par[k]) else 0):
        s = [z for z in par[k] if not z['comprimee']]
        if not s:
            continue
        top = max(s, key=lambda z: z['ff'])
        med = st.median(z['ff'] for z in s)
        drap = ' <==' if top['ff'] > 1.10 else ''
        if drap:
            suspects.append(k)
        print(f"{k:22s} {s[0]['U']:6.3f}  {len(s):3d}  {med:7.2f}  {top['ff']:5.2f}  "
              f"{top['max_gr']} gr {top['poudre'][15:]} ({top['forme']}), {top['balle']}, COAL {top['coal_in']}{drap}")
    print(f"\nremplissage > 1,10 sans « C » : {', '.join(suspects) or 'aucune'}")
    if '--lignes' in sys.argv:
        for k in suspects:
            for z in sorted(par[k], key=lambda z: -z['ff'])[:6]:
                print(f"  {k} : {z['ff']:.2f}  {z['max_gr']} gr {z['poudre'][15:]}, {z['balle']}, COAL {z['coal_in']}, p. {z['page_pdf']}")


if __name__ == '__main__':
    main()
