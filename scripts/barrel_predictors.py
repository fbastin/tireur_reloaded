"""Quatre prédicteurs de la vitesse en fonction de la longueur de canon, confrontés aux 19 séries.

    python3 scripts/barrel_predictors.py

QUESTION. Une vitesse est mesurée sur un canon de longueur L_ref ; que vaut-elle sur un canon
plus court ? Chaque prédicteur reçoit le point de référence (le canon le plus long de la série)
et prédit les autres points, sans rien voir de la série qu'il prédit.

PRÉDICTEURS
  K   loi de puissance v ∝ L^k, k = médiane des AUTRES cartouches (validation croisée par
      cartouche : la cartouche prédite n'entre pas dans son propre k) ;
  P   Powley/Davis : v ∝ √(1 − R^(−1/4)), R = 1 + A·x/U, x = course de la balle (canon − étui),
      U = volume effectif de chambre (calibers.json, volume sous la balle) ; aucun paramètre ;
  MH  Mayer & Hart (1945), éq. 34 : v ∝ √(1 − R'^(1−γ) / (1 − (γ−1)φ)), R' calculé sur le volume
      libre (U moins le volume solide de la charge), φ = p_c/(2 p_q) (éq. 8, 28, 30), γ = 1,20
      comme mayer_hart_crosscheck.js ; charge et Qex : médianes Reload Swiss de la cartouche
      (data/rs_dataset.local.json, local) ; sans données RS pour la cartouche, charge = volume ×
      densité de chargement médiane des carabines RS ; P_max = Pmax C.I.P. ; le cas φ = 0 sépare
      l'effet de γ de celui de la combustion ;
  LD  Le Duc, v = a·x/(b + x), ancré comme dans MODEL.md § 3.4 sur le point de référence et la
      pression maximale : P_max = 4 m_e a² / (27 A b), m_e = m + C/3 ; P_max = Pmax C.I.P. de la
      cartouche (munitions du commerce : borne haute ; sensibilité à 85 % imprimée).

POWLEY EST UN CAS PARTICULIER DE MAYER-HART : γ = 1,25 et φ = 0 (détente isentropique d'une charge
brûlée d'un coup) donnent exactement 1 − R^(−1/4).

Masses de balle : dans le nom de la charge ; 7.62 × 39 : balles et charges PESÉES par Marr
(tableau de l'article de 2016, lu en image le 2026-10-03 : Brown Bear 123,9 gr / 25,4 gr,
TCW 122,3 gr / 25,0 gr) ; .300 Win. Mag. : Federal Gold Medal 190 gr SMK (texte de l'article).
"""
import contextlib
import importlib.util
import io
import json
import math
import os
import statistics as st

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'data')
spec = importlib.util.spec_from_file_location('fit', os.path.join(HERE, 'barrel_exponent_fit.py'))
fit = importlib.util.module_from_spec(spec)
with contextlib.redirect_stdout(io.StringIO()):
    spec.loader.exec_module(fit)
CAL = json.load(open(os.path.join(DATA, 'calibers.json')))['calibers']

GR, IN = 6.479891e-5, 0.0254           # kg par grain, m par pouce
RHO_P, GAMMA = 1600.0, 1.20            # densité de la poudre solide (kg/m³) ; γ (MH)
MASS = {('223 Rem.', 'BH 68 HM'): 68, ('223 Rem.', 'Win M855'): 62,
        ('224 Valkyrie', '90 SP'): 90, ('224 Valkyrie', '90 SMK'): 90,
        ('224 Valkyrie', '75 TMJ'): 75, ('224 Valkyrie', '60 NBT'): 60,
        ('7.62 x 39', 'Brown Bear'): 123.9, ('7.62 x 39', 'TCW'): 122.3,
        ('6 mm Creedmoor', '110 SMK'): 110, ('6 mm Creedmoor', '107 SMK'): 107,
        ('6.5 Creedmoor', '120 A-MAX'): 120, ('6.5 Creedmoor', '142 SMK'): 142,
        ('243 Win.', 'Rem 80 PSP'): 80, ('243 Win.', 'Win 100 PP'): 100,
        ('308 Win.', 'Win 147'): 147, ('308 Win.', 'IMI 150'): 150,
        ('308 Win.', 'GMM 168'): 168, ('308 Win.', 'Win 180'): 180,
        ('300 Win. Mag.', '(article 2013)'): 190}
CHARGE = {('7.62 x 39', 'Brown Bear'): 25.4, ('7.62 x 39', 'TCW'): 25.0}

# JEU DE VALIDATION, ajouté APRÈS le choix de k = 0,167 sur les 19 séries : deux cartouches que
# rien n'a servi à régler. Rifleshooter.com (Marr), tableaux lus en image le 2026-10-03 ; les
# totaux publiés (« Change from 28" », « CHG 30" ») recoupent les lignes.
#   7 mm Rem. Mag. (2015-04) : Federal Premium 150 gr GameKing (commerce, 5 coups) ; 160 gr Swift
#   A-Frame, 66,0 gr RL22 ; 165 gr GameKing, 66,5 gr H4831SC ; 175 gr GameKing, 60,0 gr RL22
#   (3 à 4 coups) ; 28 → 20 po.
#   .338 Lapua Mag. (2017-03) : 250 gr SMK, 89,0 gr H4831SC ; 300 gr SMK, 93,3 gr Retumbo ;
#   4 coups ; 30 → 17 po.
L7 = list(range(28, 19, -1))
L338 = list(range(30, 16, -1))
EXT = {
 '7 Rem. Mag.': {
   'Fed 150 GK': list(zip(L7, [2974, 2966, 2939, 2919, 2881, 2821, 2766, 2757, 2719])),
   '160 A-Frame': list(zip(L7, [3055, 3023, 2979, 2980, 2942, 2929, 2915, 2880, 2836])),
   '165 GK': list(zip(L7, [3000, 2974, 2954, 2920, 2897, 2837, 2834, 2759, 2746])),
   '175 GK': list(zip(L7, [2685, 2645, 2640, 2646, 2615, 2585, 2573, 2560, 2455]))},
 '338 Lapua Mag.': {
   '250 SMK': list(zip(L338, [2942, 2928, 2919, 2891, 2868, 2848, 2820, 2785, 2751, 2711, 2682, 2639, 2602, 2547])),
   '300 SMK': list(zip(L338, [2833, 2871, 2835, 2818, 2799, 2790, 2760, 2732, 2708, 2690, 2620, 2595, 2529, 2492]))}}
MASS.update({('7 Rem. Mag.', 'Fed 150 GK'): 150, ('7 Rem. Mag.', '160 A-Frame'): 160,
             ('7 Rem. Mag.', '165 GK'): 165, ('7 Rem. Mag.', '175 GK'): 175,
             ('338 Lapua Mag.', '250 SMK'): 250, ('338 Lapua Mag.', '300 SMK'): 300})
CHARGE.update({('7 Rem. Mag.', '160 A-Frame'): 66.0, ('7 Rem. Mag.', '165 GK'): 66.5,
               ('7 Rem. Mag.', '175 GK'): 60.0, ('338 Lapua Mag.', '250 SMK'): 89.0,
               ('338 Lapua Mag.', '300 SMK'): 93.3})


def rs_medians():
    """Par cartouche (carabines Reload Swiss) : charge médiane (gr) et Qex médian (kJ/kg) ;
    pour toutes les carabines : densité de chargement médiane (gr par cm³ de chambre) et Qex."""
    p = os.path.join(DATA, 'rs_dataset.local.json')
    if not os.path.exists(p):
        raise SystemExit('data/rs_dataset.local.json absent : prédicteur MH impossible')
    per, dens, qex = {}, [], []
    for r in json.load(open(p)):
        ca = CAL.get(r['cartridge'])
        if not ca or ca.get('type') != 'rifle' or not (r.get('Qex') and r.get('C_gr')):
            continue
        per.setdefault(r['cartridge'], []).append((r['C_gr'], r['Qex']))
        dens.append(r['C_gr'] / ca['case_vol_cm3'])
        qex.append(r['Qex'])
    return ({k: (st.median(x[0] for x in v), st.median(x[1] for x in v)) for k, v in per.items()},
            st.median(dens), st.median(qex))


RS, DENS, QEX = rs_medians()


def charge_qex(cart, load):
    """(charge gr, Qex kJ/kg, origine) d'une série : publiée, sinon médiane RS, sinon densité médiane."""
    c, q = RS.get(cart, (None, QEX))
    if (cart, load) in CHARGE:
        return CHARGE[(cart, load)], q, 'publiée'
    if c is not None:
        return c, q, 'RS'
    return CAL[cart]['case_vol_cm3'] * DENS, q, 'densité'


def geom(cart):
    ca = CAL[cart]
    return math.pi / 4 * (ca['bore_mm'] / 1000) ** 2, ca['case_vol_cm3'] * 1e-6, ca['case_mm'] / 1000


def travel(cart, L_in):
    return L_in * IN - geom(cart)[2]


def powley(cart, L_in):
    A, U, _ = geom(cart)
    return math.sqrt(1 - (1 + A * travel(cart, L_in) / U) ** -0.25)


def mayer_hart(cart, load, L_in, with_phi=True):
    A, U, _ = geom(cart)
    C_gr, Qex, _ = charge_qex(cart, load)
    C = C_gr * GR
    vfree = U - C / RHO_P
    R = (vfree + A * travel(cart, L_in)) / vfree
    lam = Qex * 1000 * (GAMMA - 1)
    phi = (C * lam / vfree) / (2 * math.e * CAL[cart]['pmax_cip_bar'] * 1e5 * (1 + 0.75 * (GAMMA - 1)))
    f = 1 - (GAMMA - 1) * phi if with_phi else 1.0
    e = 1 - R ** (1 - GAMMA) / f
    return math.sqrt(e) if e > 0 else float('nan')     # hors du domaine de l'éq. 34


def phi_of(cart, load):
    A, U, _ = geom(cart)
    C_gr, Qex, _ = charge_qex(cart, load)
    C = C_gr * GR
    return (C * Qex * 1000 * (GAMMA - 1) / (U - C / RHO_P)) / (
        2 * math.e * CAL[cart]['pmax_cip_bar'] * 1e5 * (1 + 0.75 * (GAMMA - 1)))


def le_duc(cart, load, Lref, vref_fps, pfrac=1.0):
    """Constantes (a, b) de Le Duc ancrées sur v(Lref) et P_max ; renvoie v(L) en fps."""
    A = geom(cart)[0]
    C_gr = charge_qex(cart, load)[0]
    me = (MASS[(cart, load)] + C_gr / 3) * GR
    P = CAL[cart]['pmax_cip_bar'] * 1e5 * pfrac
    xr, vr = travel(cart, Lref), vref_fps * 0.3048
    # P = 4 me vr² (b + xr)² / (27 A b xr²)  →  b² + (2xr − K) b + xr² = 0,  K = 27 A P xr² / (4 me vr²)
    K = 27 * A * P * xr ** 2 / (4 * me * vr ** 2)
    disc = (2 * xr - K) ** 2 - 4 * xr ** 2
    if disc < 0:
        return None
    b = ((K - 2 * xr) - math.sqrt(disc)) / 2      # petite racine : pic de pression près du culot
    a = vr * (b + xr) / xr
    return lambda L: a * travel(cart, L) / (b + travel(cart, L)) / 0.3048


def series(ext=False):
    src = EXT.items() if ext else ((c, loads) for c, (_, loads) in fit.D.items())
    for cart, loads in src:
        for load, pts in loads.items():
            pts = sorted(p for p in pts if p[0] >= 16)
            yield cart, load, pts


def evaluate(S, k_of, titre):
    kobs = {(c, l): fit.slope(p) for c, l, p in S}
    print(f'\n=== {titre}')
    res = {k: [] for k in ('K', 'P', 'MH', 'MH0', 'LD', 'LD85')}
    kpred = {k: [] for k in ('P', 'MH', 'LD')}
    print(f"{'cartouche':15s} {'charge':15s} {'k obs':>6s} | écart quadratique (fps) : "
          f"{'K':>5s} {'P':>5s} {'MH':>5s} {'MH φ=0':>6s} {'LD':>5s} {'LD85':>5s} | v court obs / LD")
    for cart, load, pts in S:
        Lref, vref = pts[-1]
        others = [p for p in pts if p[0] < Lref]
        k_loco = k_of(cart)
        ld, ld85 = le_duc(cart, load, Lref, vref), le_duc(cart, load, Lref, vref, 0.85)
        pred = {
            'K': lambda L: vref * (L / Lref) ** k_loco,
            'P': lambda L: vref * powley(cart, L) / powley(cart, Lref),
            'MH': lambda L: vref * mayer_hart(cart, load, L) / mayer_hart(cart, load, Lref),
            'MH0': lambda L: vref * mayer_hart(cart, load, L, False) / mayer_hart(cart, load, Lref, False),
            'LD': ld, 'LD85': ld85}
        row = {}
        for k, f in pred.items():
            row[k] = (math.sqrt(st.mean((f(L) - v) ** 2 for L, v in others)) if f else float('nan'))
            if not math.isnan(row[k]):
                res[k].append(row[k])
        for k in kpred:
            f = pred[k]
            kp = fit.slope([(L, f(L)) for L, _ in pts]) if f else float('nan')
            if not math.isnan(kp):
                kpred[k].append((kobs[(cart, load)], kp))
        Ls, vs = pts[0]
        print(f"{cart:15s} {load:15s} {kobs[(cart, load)]:6.3f} | {'':24s}"
              f"{row['K']:5.0f} {row['P']:5.0f} {row['MH']:5.0f} {row['MH0']:6.0f} {row['LD']:5.0f} {row['LD85']:5.0f}"
              f" | {vs:.0f} / {ld(Ls) if ld else float('nan'):.0f}")

    ko = [kobs[(c, l)] for c, l, _ in S]

    def r(a, b):
        ma, mb = st.mean(a), st.mean(b)
        return sum((x - ma) * (y - mb) for x, y in zip(a, b)) / math.sqrt(
            sum((x - ma) ** 2 for x in a) * sum((y - mb) ** 2 for y in b))
    print(f"\n{len(S)} séries, {len({c for c, _, _ in S})} cartouches. Écart quadratique sur les points prédits (fps) :")
    for k, lab in [('K', 'k constant'), ('P', 'Powley'), ('MH', 'Mayer-Hart'),
                   ('MH0', 'Mayer-Hart, φ = 0'), ('LD', 'Le Duc, Pmax C.I.P.'), ('LD85', 'Le Duc, 85 % Pmax')]:
        print(f"  {lab:32s} n = {len(res[k]):2d}  médiane {st.median(res[k]):5.1f}   moyenne {st.mean(res[k]):5.1f}   pire {max(res[k]):5.1f}")
    print('\nExposant implicite (pente log-log des prédictions) contre k mesuré :')
    for k in kpred:
        o, p_ = zip(*kpred[k])
        print(f"  {k:3s} n = {len(p_):2d}  médiane {st.median(p_):.3f} (mesurée sur ces séries {st.median(o):.3f})"
              f"   corrélation r = {r(o, p_):.2f}")
    # Bruit de mesure : résidu d'un ajustement libre à deux paramètres (loi de puissance, Le Duc)
    pw, ldr = [], []
    for _, _, pts in S:
        if len(pts) < 4:
            continue
        k = fit.slope(pts)
        lx = [math.log(L) for L, _ in pts]
        c0 = st.mean(math.log(v) for _, v in pts) - k * st.mean(lx)
        pw.append(math.sqrt(st.mean((math.exp(c0 + k * math.log(L)) - v) ** 2 for L, v in pts)))
        # Le Duc libre : 1/v = 1/a + (b/a)·(1/x), linéaire en 1/x (x en pouces de canon, l'origine se compense)
        X = [1 / L for L, _ in pts]; Y = [1 / v for _, v in pts]
        mx, my = st.mean(X), st.mean(Y)
        s = sum((x - mx) * (y - my) for x, y in zip(X, Y)) / sum((x - mx) ** 2 for x in X)
        ia = my - s * mx
        ldr.append(math.sqrt(st.mean((1 / (ia + s / L) - v) ** 2 for L, v in pts)))
    print(f"\nAjustement libre à deux paramètres sur les {len(pw)} séries de 4 points ou plus "
          f"(bruit + défaut de forme), écart quadratique médian : loi de puissance {st.median(pw):.1f} fps, "
          f"Le Duc {st.median(ldr):.1f} fps")
    print(f"\nCharges et φ (MH, γ = {GAMMA}, Pmax C.I.P.) ; densité de chargement médiane RS {DENS:.2f} gr/cm³, Qex médian {QEX:.0f} kJ/kg :")
    for c, l, _ in S:
        C_gr, q, o = charge_qex(c, l)
        print(f"  {c:15s} {l:15s} charge {C_gr:5.1f} gr ({o:7s})  Qex {q:5.0f}  φ {phi_of(c, l):.3f}")


def main():
    S = list(series())
    kall = {(c, l): fit.slope(p) for c, l, p in S}
    evaluate(S, lambda cart: st.median(v for (c, _), v in kall.items() if c != cart),
             '19 séries de référence ; k constant en validation croisée par cartouche')
    k19 = st.median(kall.values())
    evaluate(list(series(ext=True)), lambda cart: k19,
             f'Jeu de validation (2 cartouches nouvelles) ; k constant = {k19:.3f}, médiane des 19')
    paired(S + list(series(ext=True)))


def paired(S, B=10000, seed=2026):
    """Comparaison appariée PAR CARTOUCHE (les séries d'une même cartouche ne sont pas
    indépendantes) : moyenne des écarts quadratiques de la cartouche, rééchantillonnage des
    cartouches (graine fixe), test du signe exact."""
    import random
    kobs = {(c, l): fit.slope(p) for c, l, p in S}
    rows = {}
    for cart, load, pts in S:
        Lref, vref = pts[-1]
        k = st.median(v for (c, _), v in kobs.items() if c != cart)
        f = {'K': lambda L: vref * (L / Lref) ** k,
             'P': lambda L: vref * powley(cart, L) / powley(cart, Lref),
             'MH': lambda L: vref * mayer_hart(cart, load, L) / mayer_hart(cart, load, Lref),
             'LD': le_duc(cart, load, Lref, vref)}
        rows.setdefault(cart, []).append(
            {n: math.sqrt(st.mean((g(L) - v) ** 2 for L, v in pts[:-1])) for n, g in f.items()})
    per = {c: {n: st.mean(r[n] for r in v) for n in v[0]} for c, v in rows.items()}
    carts = sorted(per)
    print(f"\n=== Comparaison appariée, {len(S)} séries, {len(carts)} cartouches "
          f"(k constant en validation croisée par cartouche)")
    print('  écart quadratique moyen par cartouche (fps) :')
    for c in carts:
        print(f"    {c:15s} " + '  '.join(f"{n} {per[c][n]:5.0f}" for n in ('K', 'P', 'MH', 'LD')))
    rnd = random.Random(seed)
    for a, b in (('P', 'K'), ('MH', 'K'), ('LD', 'K'), ('MH', 'P')):
        d0 = [per[c][a] - per[c][b] for c in carts]
        boot = sorted(st.mean(per[c][a] - per[c][b] for c in (rnd.choice(carts) for _ in carts))
                      for _ in range(B))
        w = sum(x < 0 for x in d0)
        p = sum(math.comb(len(carts), i) for i in range(w, len(carts) + 1)) / 2 ** len(carts)
        print(f"  {a:2s} contre {b:2s} : meilleur sur {w}/{len(carts)} cartouches, écart moyen {st.mean(d0):+6.1f} fps, "
              f"IC 95 % [{boot[int(.025 * B)]:+.1f} ; {boot[int(.975 * B)]:+.1f}], test du signe unilatéral p = {p:.3f}")


if __name__ == '__main__':
    main()
