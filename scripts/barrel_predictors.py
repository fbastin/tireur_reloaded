"""Quatre prédicteurs de la vitesse en fonction de la longueur de canon, confrontés aux 19 séries.

    python3 scripts/barrel_predictors.py
    python3 scripts/barrel_predictors.py --tableau   # tableau par cartouche de la page wiki
    python3 scripts/barrel_predictors.py --sensibilite   # volume de la .50 BMG
    python3 scripts/barrel_predictors.py --pression-mesuree   # Le Duc sur les pressions de Hodgdon
    python3 scripts/barrel_predictors.py --second-facteur     # rapport charge / balle (Powley)

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
      pression maximale : P_max = 4 m_c a² / (27 A b), m_c = m + C/2 (pression de chambre par le
      gradient de Lagrange ; m + C/3 jusqu'au 2026-10-11, pression moyenne) ; P_max = Pmax C.I.P.
      de la cartouche (munitions du commerce : borne haute ; sensibilité à 85 % imprimée).

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
# .50 BMG, hors de l'estimateur (aucune charge de .50 dans nos guides). Cotes de la fiche C.I.P.
# « 50 Browning » (TDCC tab. I, rév. 2010-05-26) : L3 = 99,31 mm, G1 = 12,98 mm, Pmax = 3 700 bar.
# Volume : 290 gr d'eau (« The average .50 BMG case holds 290 grains of water », P. Meitin,
# « Loading the Big .50 », Handloader 57, déc.-janv. 2022) × 0,90, le facteur de volume utile
# calibré le 2026-10-12 sur les capacités mesurées par Peterson (calibers/facteur_utile.py :
# médiane du rapport volume Reload Swiss ÷ capacité, 21 cartouches ; 0,87 sans source jusque-là) ;
# valeur ronde d'une seule source, sensibilité imprimée par --sensibilite. La base des calibres du site porte le même volume
# depuis le 2026-10-12 (calibers/case_volume_reference.json) ; elle avait auparavant les 292,8 gr
# de Wikipédia (18,97 cm³), que l'article ne source pas.
CAP_50_GR, UTILE = 290, 0.90
CAL = dict(CAL, **{'50 BMG': {'type': 'rifle', 'bore_mm': 12.98, 'case_mm': 99.31,
                              'case_vol_cm3': CAP_50_GR / 15.4324 * UTILE, 'pmax_cip_bar': 3700}})

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

# JEU DE VALIDATION, ajouté APRÈS le choix de k = 0,167 sur les 19 séries : quatre cartouches que
# rien n'a servi à régler. Rifleshooter.com (Marr), tableaux lus en image le 2026-10-03 ; les
# totaux publiés (« Change from 28" », « CHG 30" ») recoupent les lignes.
#   7 mm Rem. Mag. (2015-04) : Federal Premium 150 gr GameKing (commerce, 5 coups) ; 160 gr Swift
#   A-Frame, 66,0 gr RL22 ; 165 gr GameKing, 66,5 gr H4831SC ; 175 gr GameKing, 60,0 gr RL22
#   (3 à 4 coups) ; 28 → 20 po.
#   .338 Lapua Mag. (2017-03) : 250 gr SMK, 89,0 gr H4831SC ; 300 gr SMK, 93,3 gr Retumbo ;
#   4 coups ; 30 → 17 po.
#   7.62 × 54 R : B. L. Clark, Effect of Barrel Length on the Muzzle Velocity and Report from a
#   Mosin-Nagant 7.62x54R Rifle, Honors Thesis, University of South Florida, 2011, tableau 1
#   (moyennes de 10 coups, recalculées sur les tableaux 2 à 8) ; surplus bulgare 147 gr ; vitesse
#   à environ 10 pieds de la bouche ; 28,75 → 16,75 po par pas de 2 po.
#   .30-06 : Hatcher's Notebook (2e éd., 1957), p. 399, item 14 « Velocity vs. Barrel Length »,
#   lu en image le 2026-10-03 : essais de Springfield Armory, mitrailleuse Browning, 24 / 28 / 30 /
#   32 po ; munition et nombre de coups non précisés ; balle de 172 gr SUPPOSÉE (M1, table de la
#   p. 400 ; ne sert qu'à Le Duc). La colonne .50 de la même table (lue en image le même jour :
#   2 444,9 / 2 567 / 2 673,9 / 2 702 f.s.) est reprise depuis le 2026-10-12, avec le volume
#   d'étui défini plus bas ; balle de 750 gr SUPPOSÉE (balle et AP M1, même table de la p. 400).
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
   '300 SMK': list(zip(L338, [2833, 2871, 2835, 2818, 2799, 2790, 2760, 2732, 2708, 2690, 2620, 2595, 2529, 2492]))},
 '7.62 x 54 R': {
   'Clark 147 (BG)': list(zip([28.75, 26.75, 24.75, 22.75, 20.75, 18.75, 16.75],
                              [2827, 2778, 2751, 2698, 2632, 2578, 2521]))},
 '30-06 Spring.': {
   'Hatcher, Browning MG': [(24, 2709), (28, 2776), (30, 2833), (32, 2848)]},
 '50 BMG': {
   'Hatcher, Browning MG': [(24, 2444.9), (28, 2567), (30, 2673.9), (32, 2702)]}}
MASS.update({('7 Rem. Mag.', 'Fed 150 GK'): 150, ('7 Rem. Mag.', '160 A-Frame'): 160,
             ('7 Rem. Mag.', '165 GK'): 165, ('7 Rem. Mag.', '175 GK'): 175,
             ('338 Lapua Mag.', '250 SMK'): 250, ('338 Lapua Mag.', '300 SMK'): 300,
             ('7.62 x 54 R', 'Clark 147 (BG)'): 147, ('30-06 Spring.', 'Hatcher, Browning MG'): 172,
             ('50 BMG', 'Hatcher, Browning MG'): 750})
CHARGE.update({('7 Rem. Mag.', '160 A-Frame'): 66.0, ('7 Rem. Mag.', '165 GK'): 66.5,
               ('7 Rem. Mag.', '175 GK'): 60.0, ('338 Lapua Mag.', '250 SMK'): 89.0,
               ('338 Lapua Mag.', '300 SMK'): 93.3})

# JEU INDÉPENDANT, ajouté le 2026-10-11 : trois sources autres que Marr, tableaux lus en image le
# 2026-10-11 ; pour chaque série, les écarts et le total publiés recoupent les vitesses recopiées.
#   Hodgdon Powder Company, « Barrel Length Versus Velocity », 12 mars 2026 (laboratoire
#   balistique) : un canon de 6,5 Creedmoor et deux de .223 Wylde (chambre hybride ; étui de .223
#   Rem., d'où la clé « 223 Rem. »), coupés au tour de 24 à 16 po un pouce à la fois, 5 coups par
#   longueur, canon nettoyé à chaque coupe, pression relevée à chaque longueur. 6,5 Creedmoor :
#   balle non publiée (Le Duc sans objet) ; le tableau porte « 2,93 » au 5e coup à 23 po, que la
#   moyenne publiée (2593) corrige. Premier canon de .223 (« H-A ») : balles et charges publiées.
#   Second (« H-B », « 540 total rounds ») : balles publiées, charges non ; boîtier de culasse
#   reconstruit avant les tirs à 18 po (« * Rebuilt receiver »), où trois séries remontent de 0 à
#   21 fps.
#   Eagleman Long Range, forum Long Range Hunting, 6 octobre 2023 : canons Benchmark de 26 po
#   coupés à 18 po par pas de 2 po, 6,5 PRC, 7 mm PRC et 300 PRC, chronographe LabRadar ; masse
#   des balles publiée, charges et nombre de coups non.
#   AccurateShooter.com, « Barrel Length and Velocity — Barrel Cut-Down Tests », Daily Bulletin,
#   20 décembre 2011 (tableau en texte, lu le 2026-10-12 ; les écarts publiés à 28 po recoupent
#   les moyennes) : essais de J. Schmidt, 6 mm BR, canon Krieger de 33 po raccourci d'un pouce à la fois
#   jusqu'à 28 po, Sierra 107 gr MatchKing, Vihtavuori N140 (charge non publiée), amorces Federal
#   205M, séries de 15 coups, Oehler 35. Écarté le 2026-10-11 « faute de volume d'étui » : à tort,
#   la cartouche est dans calibers.json sous « 6 Norma BR » (2,172 cm³, médiane Reload Swiss),
#   soit 0,85 à 0,88 des 38 à 39,5 gr d'eau de l'étui Lapua formé (FAQ de 6mmBR.com).
# Considérés et non retenus, le 2026-10-11 : Gun Mart, .308 de 24 à 14,5 po
# (vitesses de départ et moyennes par pouce seulement) ; comparatif Tikka d'all4shooters (trois
# carabines, pas un canon raccourci).
L24 = list(range(24, 15, -1))
IND = {
 '6.5 Creedmoor': {
   'Hodgdon': list(zip(L24, [2608, 2593, 2576, 2560, 2525, 2506, 2478, 2450, 2411]))},
 '223 Rem.': {
   'H-A 40 BK X-Term': list(zip(L24, [3791, 3784, 3741, 3729, 3683, 3642, 3593, 3549, 3498])),
   'H-A 40 BK 2520':   list(zip(L24, [3727, 3719, 3679, 3654, 3618, 3593, 3531, 3478, 3419])),
   'H-A 60 TMK X-Term': list(zip(L24, [3147, 3112, 3106, 3095, 3066, 3040, 3026, 2979, 2941])),
   'H-A 60 TMK 2520':  list(zip(L24, [3191, 3173, 3150, 3140, 3096, 3081, 3035, 2983, 2970])),
   'H-A 77 X-Term':    list(zip(L24, [2671, 2658, 2637, 2626, 2600, 2582, 2555, 2526, 2491])),
   'H-A 77 2520':      list(zip(L24, [2821, 2792, 2781, 2750, 2713, 2710, 2655, 2630, 2592])),
   'H-B 40 BK X-Term': list(zip(L24, [3841, 3828, 3783, 3746, 3705, 3673, 3657, 3592, 3562])),
   'H-B 40 BK 2520':   list(zip(L24, [3819, 3809, 3767, 3721, 3689, 3610, 3611, 3559, 3496])),
   'H-B 62 FMJ X-Term': list(zip(L24, [3092, 3077, 3051, 3020, 2989, 2949, 2949, 2915, 2863])),
   'H-B 62 FMJ 2520':  list(zip(L24, [3117, 3109, 3075, 3040, 3038, 2965, 2955, 2916, 2891])),
   'H-B 77 X-Term':    list(zip(L24, [2724, 2731, 2705, 2674, 2636, 2599, 2620, 2586, 2556])),
   'H-B 77 2520':      list(zip(L24, [2821, 2816, 2790, 2753, 2738, 2698, 2709, 2680, 2633]))},
 '300 PRC': {'Eagleman 212': [(26, 2887), (24, 2855), (22, 2788), (20, 2729), (18, 2655)]},
 '6.5 PRC': {'Eagleman 147': [(26, 2863), (24, 2807), (22, 2763), (20, 2672), (18, 2604)]},
 '7mm PRC': {'Eagleman 175': [(26, 2870), (24, 2820), (22, 2792), (20, 2715), (18, 2664)]},
 '6 Norma BR': {'Schmidt 107 SMK': list(zip(range(28, 34), [2952, 2948, 2968, 2973, 2982, 2992]))}}
MASS.update({('6.5 Creedmoor', 'Hodgdon'): None,
             ('300 PRC', 'Eagleman 212'): 212, ('6.5 PRC', 'Eagleman 147'): 147,
             ('7mm PRC', 'Eagleman 175'): 175, ('6 Norma BR', 'Schmidt 107 SMK'): 107})
for _l in IND['223 Rem.']:
    MASS[('223 Rem.', _l)] = int(_l.split()[1])

# PRESSIONS MESURÉES par Hodgdon sur les deux canons de .223, à chaque longueur de 24 à 16 po :
# colonne « P » des deux tableaux, lue en image le 2026-10-12 sur les fichiers d'origine (4909 px
# de large). Unité non écrite ; des psi (de 48 980 à 57 270, autour de la limite SAAMI de la .223,
# 55 000 psi). Les lignes « Group High P », « Group Low P » et « Pressure Diff » recoupent chaque
# colonne. La 6,5 Creedmoor de Hodgdon n'a pas de pression publiée.
PSI_HODGDON = {
 'H-A 40 BK X-Term':  [50740, 51680, 50860, 51980, 52000, 51860, 51840, 52140, 52360],
 'H-A 40 BK 2520':    [50640, 51540, 51120, 51080, 51820, 52840, 52720, 52540, 52320],
 'H-A 60 TMK X-Term': [52140, 50020, 51200, 51440, 51960, 52040, 53480, 52340, 52320],
 'H-A 60 TMK 2520':   [50660, 50320, 50500, 51040, 50740, 51620, 51160, 50480, 52300],
 'H-A 77 X-Term':     [50000, 50240, 50080, 49360, 49560, 49600, 49360, 49460, 48980],
 'H-A 77 2520':       [52020, 50760, 51360, 50260, 50780, 51580, 50060, 50420, 49740],
 'H-B 40 BK X-Term':  [54280, 54640, 53900, 53960, 54040, 54170, 54520, 53690, 54600],
 'H-B 40 BK 2520':    [55490, 56600, 56230, 55850, 56500, 55010, 55780, 56130, 55590],
 'H-B 62 FMJ X-Term': [56830, 56860, 56090, 55400, 55400, 54260, 55040, 54920, 53620],
 'H-B 62 FMJ 2520':   [52610, 52850, 52140, 51980, 53500, 51140, 51460, 51550, 52380],
 'H-B 77 X-Term':     [55740, 57270, 56260, 55300, 54410, 53570, 54420, 54790, 54300],
 'H-B 77 2520':       [53950, 54850, 53930, 53350, 54350, 53630, 54040, 54610, 53460]}
PSI_BAR = 0.0689476
CHARGE.update({('223 Rem.', 'H-A 40 BK X-Term'): 29.0, ('223 Rem.', 'H-A 40 BK 2520'): 31.0,
               ('223 Rem.', 'H-A 60 TMK X-Term'): 24.9, ('223 Rem.', 'H-A 60 TMK 2520'): 27.3,
               ('223 Rem.', 'H-A 77 X-Term'): 22.5, ('223 Rem.', 'H-A 77 2520'): 25.2})


def groupe(cart, load):
    """Unité de la comparaison appariée : la cartouche pour Marr, Clark et Hatcher (une arme par
    cartouche) ; le canon pour le jeu indépendant (Hodgdon a deux canons de .223)."""
    for pref in ('H-A', 'H-B', 'Hodgdon', 'Eagleman', 'Schmidt'):
        if load.startswith(pref):
            return f"{cart} · {pref}"
    return cart


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


def mayer_hart(cart, load, L_in, with_phi=True, p_bar=None):
    A, U, _ = geom(cart)
    C_gr, Qex, _ = charge_qex(cart, load)
    C = C_gr * GR
    vfree = U - C / RHO_P
    R = (vfree + A * travel(cart, L_in)) / vfree
    lam = Qex * 1000 * (GAMMA - 1)
    phi = (C * lam / vfree) / (2 * math.e * (p_bar or CAL[cart]['pmax_cip_bar']) * 1e5 * (1 + 0.75 * (GAMMA - 1)))
    f = 1 - (GAMMA - 1) * phi if with_phi else 1.0
    e = 1 - R ** (1 - GAMMA) / f
    return math.sqrt(e) if e > 0 else float('nan')     # hors du domaine de l'éq. 34


def phi_of(cart, load):
    A, U, _ = geom(cart)
    C_gr, Qex, _ = charge_qex(cart, load)
    C = C_gr * GR
    return (C * Qex * 1000 * (GAMMA - 1) / (U - C / RHO_P)) / (
        2 * math.e * CAL[cart]['pmax_cip_bar'] * 1e5 * (1 + 0.75 * (GAMMA - 1)))


def le_duc(cart, load, Lref, vref_fps, pfrac=1.0, p_bar=None):
    """Constantes (a, b) de Le Duc ancrées sur v(Lref) et P_max ; renvoie v(L) en fps (None si la
    masse de balle n'est pas publiée, ou sans solution)."""
    if MASS.get((cart, load)) is None:
        return None
    A = geom(cart)[0]
    C_gr = charge_qex(cart, load)[0]
    mc = (MASS[(cart, load)] + C_gr / 2) * GR       # Carlucci et Jacobson, éq. 3.54
    P = (p_bar or CAL[cart]['pmax_cip_bar']) * 1e5 * pfrac
    xr, vr = travel(cart, Lref), vref_fps * 0.3048
    # P = 4 mc vr² (b + xr)² / (27 A b xr²)  →  b² + (2xr − K) b + xr² = 0,  K = 27 A P xr² / (4 mc vr²)
    K = 27 * A * P * xr ** 2 / (4 * mc * vr ** 2)
    disc = (2 * xr - K) ** 2 - 4 * xr ** 2
    if disc < 0:
        return None
    b = ((K - 2 * xr) - math.sqrt(disc)) / 2      # petite racine : pic de pression près du culot
    a = vr * (b + xr) / xr
    return lambda L: a * travel(cart, L) / (b + travel(cart, L)) / 0.3048


def series(jeu='ref'):
    """'ref' : les 19 séries de référence (Marr) ; 'val' : le jeu de validation (Marr, Clark,
    Hatcher) ; 'ind' : le jeu des expérimentateurs indépendants (Hodgdon, Eagleman, Schmidt)."""
    src = {'ref': lambda: ((c, loads) for c, (_, loads) in fit.D.items()),
           'val': lambda: EXT.items(), 'ind': lambda: IND.items()}[jeu]()
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


def tableau():
    """Par cartouche, sur toutes les séries : longueurs couvertes, exposant k mesuré, perte moyenne par
    pouce entre le canon le plus long et le plus court, rapport de détente à 24 pouces. C'est le
    tableau de la page wiki technique:longueur_canon_vitesse."""
    fr = lambda x, n=0: f"{x:,.{n}f}".replace(",", " ").replace(".", ",")
    po = lambda x: f"{x:g}".replace(".", ",")          # 16,25 et non 16,2 : demi-pouces et quarts exacts
    NOM = {'223 Rem.': '.223 Remington', '300 PRC': '300 PRC', '6.5 PRC': '6,5 PRC', '7mm PRC': '7 mm PRC', '224 Valkyrie': '.224 Valkyrie', '7.62 x 39': '7,62 × 39',
           '6 mm Creedmoor': '6 mm Creedmoor', '6.5 Creedmoor': '6,5 Creedmoor', '243 Win.': '.243 Winchester',
           '308 Win.': '.308 Winchester', '300 Win. Mag.': '.300 Winchester Magnum',
           '7 Rem. Mag.': '7 mm Remington Magnum', '338 Lapua Mag.': '.338 Lapua Magnum',
           '7.62 x 54 R': '7,62 × 54 R', '30-06 Spring.': '.30-06 Springfield',
           '50 BMG': '.50 BMG', '6 Norma BR': '6 mm BR Norma'}
    rows = {}
    for jeu in ('ref', 'val', 'ind'):
        for cart, load, pts in series(jeu):
            pts = sorted(pts)
            (Ls, vs), (Ll, vl) = pts[0], pts[-1]
            rows.setdefault(cart, []).append((Ls, Ll, fit.slope(pts), (vl - vs) / (Ll - Ls)))
    print("| Cartouche | Séries | Canons (pouces) | k mesuré | Perte par pouce (pieds/s) | Perte par pouce (m/s) "
          "| Rapport de détente à 24 pouces |")
    rdet = lambda c: 1 + geom(c)[0] * travel(c, 24) / geom(c)[1]
    for cart, R in sorted(rows.items(), key=lambda kv: -rdet(kv[0])):    # du plus grand rapport au plus petit
        A, U, _ = geom(cart)
        ks, pi = [r[2] for r in R], [r[3] for r in R]
        rng = lambda a, b, n=0: fr(a, n) if fr(a, n) == fr(b, n) else f"{fr(a, n)} à {fr(b, n)}"
        print(f"| {NOM[cart]} | {len(R)} | {po(min(r[0] for r in R))} à {po(max(r[1] for r in R))} | {rng(min(ks), max(ks), 2)} "
              f"| {rng(min(pi), max(pi))} | {rng(min(pi) * 0.3048, max(pi) * 0.3048, 1)} "
              f"| {fr(1 + A * travel(cart, 24) / U, 1)} |")
    allk = [r[2] for R in rows.values() for r in R]
    print(f"\n{len(allk)} séries, {len(rows)} cartouches ; k de {fr(min(allk), 2)} à {fr(max(allk), 2)}, médiane {fr(st.median(allk), 2)}")


def sensibilite():
    """Le volume de la .50 BMG repose sur une valeur ronde d'une seule source : écart quadratique
    de chaque prédicteur sur la série de Hatcher quand le facteur de volume utile ou la capacité
    changent (la charge de MH et de Le Duc suit le volume, par la densité de chargement médiane)."""
    cart, load = '50 BMG', 'Hatcher, Browning MG'
    pts = sorted(EXT[cart][load])
    Lref, vref = pts[-1]
    print(f"Série .50 BMG de Hatcher, écart quadratique sur 24, 28 et 30 po (fps) :")
    for cap, ut in ((CAP_50_GR, 0.80), (CAP_50_GR, UTILE), (CAP_50_GR, 0.95), (292.8, UTILE)):
        CAL[cart]['case_vol_cm3'] = cap / 15.4324 * ut
        ld = le_duc(cart, load, Lref, vref)
        f = {'P': lambda L: vref * powley(cart, L) / powley(cart, Lref),
             'MH': lambda L: vref * mayer_hart(cart, load, L) / mayer_hart(cart, load, Lref),
             'LD': ld}
        e = {n: math.sqrt(st.mean((g(L) - v) ** 2 for L, v in pts[:-1])) if g else float('nan')
             for n, g in f.items()}
        print(f"  {cap:5.1f} gr d'eau × {ut:.2f} = {CAL[cart]['case_vol_cm3']:5.2f} cm³ : "
              + '  '.join(f"{n} {x:4.0f}" for n, x in e.items()))
    CAL[cart]['case_vol_cm3'] = CAP_50_GR / 15.4324 * UTILE


def pression_mesuree():
    """Le Duc (et Mayer-Hart) ancrés sur la pression MESURÉE au canon de référence (24 po) au lieu
    de la Pmax C.I.P. (4 300 bar), sur les douze séries de .223 de Hodgdon. La pression de pointe
    ne dépend pas de la longueur dans le modèle de Le Duc (pic en x = b/2, près du culot) : la
    moyenne des neuf longueurs est imprimée aussi, comme mesure moins bruitée."""
    cart, cip = '223 Rem.', CAL['223 Rem.']['pmax_cip_bar']
    print(f"Douze séries de .223 de Hodgdon, écart quadratique sur 23 à 16 po (fps) ; Pmax C.I.P. {cip} bar")
    print(f"{'série':18s} {'P 24 po':>8s} {'P moy.':>7s} | {'K':>4s} {'P':>4s} | {'LD CIP':>6s} {'LD 24':>6s} {'LD moy':>6s} | {'MH CIP':>6s} {'MH 24':>6s}")
    acc = {k: [] for k in ('K', 'P', 'LDc', 'LD24', 'LDm', 'MHc', 'MH24')}
    k19 = st.median(fit.slope(p) for _, _, p in series())
    for load, psi in PSI_HODGDON.items():
        pts = sorted(IND[cart][load])
        Lref, vref = pts[-1]
        p24, pm = psi[0] * PSI_BAR, st.mean(psi) * PSI_BAR
        f = {'K': lambda L: vref * (L / Lref) ** k19,
             'P': lambda L: vref * powley(cart, L) / powley(cart, Lref),
             'LDc': le_duc(cart, load, Lref, vref), 'LD24': le_duc(cart, load, Lref, vref, p_bar=p24),
             'LDm': le_duc(cart, load, Lref, vref, p_bar=pm),
             'MHc': lambda L: vref * mayer_hart(cart, load, L) / mayer_hart(cart, load, Lref),
             'MH24': lambda L: vref * mayer_hart(cart, load, L, p_bar=p24) / mayer_hart(cart, load, Lref, p_bar=p24)}
        e = {n: math.sqrt(st.mean((g(L) - v) ** 2 for L, v in pts[:-1])) if g else float('nan')
             for n, g in f.items()}
        for n, x in e.items():
            acc[n].append(x)
        print(f"{load:18s} {p24:8.0f} {pm:7.0f} | {e['K']:4.0f} {e['P']:4.0f} | {e['LDc']:6.0f} {e['LD24']:6.0f} {e['LDm']:6.0f}"
              f" | {e['MHc']:6.0f} {e['MH24']:6.0f}")
    print('médiane' + ' ' * 28 + ' '.join(f"{n} {st.median(v):5.1f}" for n, v in acc.items()))
    for a, b in (('LD24', 'LDc'), ('LD24', 'P'), ('MH24', 'MHc')):
        w = sum(x < y for x, y in zip(acc[a], acc[b]))
        print(f"  {a} meilleur que {b} sur {w}/{len(acc[a])} séries")


def second_facteur():
    """Le second facteur de Powley (rapport charge / masse de balle) dans un même canon : les
    séries de .223 de Hodgdon (charges publiées pour H-A, balles pour les deux). Dans la forme de
    Davis, charge et balle s'annulent dans le rapport de deux longueurs : Powley prédit le même k
    pour toutes."""
    cart = '223 Rem.'
    print(f"k Powley de la .223 sur 16-24 po : {fit.slope([(L, powley(cart, L)) for L in range(16, 25)]):.3f}")
    print(f"{'série':18s} {'C/m':>6s} {'k obs':>6s} {'k MH':>6s}")
    for load, pts in IND[cart].items():
        pts = sorted(pts)
        cm = CHARGE[(cart, load)] / MASS[(cart, load)] if (cart, load) in CHARGE else float('nan')
        kmh = fit.slope([(L, mayer_hart(cart, load, L)) for L, _ in pts])
        print(f"{load:18s} {cm:6.3f} {fit.slope(pts):6.3f} {kmh:6.3f}")
    for canon in ('H-A', 'H-B'):
        for poudre in ('X-Term', '2520'):
            k = {l.split()[1]: fit.slope(sorted(p)) for l, p in IND[cart].items()
                 if l.startswith(canon) and l.endswith(poudre)}
            print(f"  {canon} {poudre:6s} : k(40 gr) {k['40']:.3f} contre k(77 gr) {k['77']:.3f}")


def main():
    import sys
    if '--pression-mesuree' in sys.argv:
        return pression_mesuree()
    if '--second-facteur' in sys.argv:
        return second_facteur()
    if '--tableau' in sys.argv:
        return tableau()
    if '--sensibilite' in sys.argv:
        return sensibilite()
    S = list(series())
    kall = {(c, l): fit.slope(p) for c, l, p in S}
    evaluate(S, lambda cart: st.median(v for (c, _), v in kall.items() if c != cart),
             '19 séries de référence ; k constant en validation croisée par cartouche')
    k19 = st.median(kall.values())
    evaluate(list(series('val')), lambda cart: k19,
             f'Jeu de validation (cartouches nouvelles) ; k constant = {k19:.3f}, médiane des 19')
    evaluate(list(series('ind')), lambda cart: k19,
             f'Jeu indépendant (Hodgdon, Eagleman, Schmidt) ; k constant = {k19:.3f}, médiane des 19')
    d1 = paired(S + list(series('val')))
    d2 = paired(list(series('ind')), k_fixe=k19, titre='jeu indépendant, par canon')
    print(f"\n=== Les deux comparaisons réunies : {len(d1['P-K'])} cartouches et {len(d2['P-K'])} canons")
    for cle in ('P-K', 'MH-K', 'LD-K', 'MH-P'):
        d = [x for x in d1[cle] + d2[cle] if not math.isnan(x)]
        w = sum(x < 0 for x in d)
        p = sum(math.comb(len(d), i) for i in range(w, len(d) + 1)) / 2 ** len(d)
        a, b = cle.split('-')
        print(f"  {a:2s} contre {b:2s} : meilleur sur {w}/{len(d)}, test du signe unilatéral p = {p:.4f}")


def paired(S, B=10000, seed=2026, k_fixe=None, titre=None):
    """Comparaison appariée PAR CARTOUCHE, ou par canon pour le jeu indépendant (les séries d'une
    même arme ne sont pas indépendantes) : moyenne des écarts quadratiques du groupe,
    rééchantillonnage des groupes (graine fixe), test du signe exact. Rend, par comparaison, la
    liste des écarts par groupe. k constant : validation croisée par cartouche, ou `k_fixe`."""
    import random
    kobs = {(c, l): fit.slope(p) for c, l, p in S}
    rows = {}
    for cart, load, pts in S:
        Lref, vref = pts[-1]
        k = k_fixe if k_fixe is not None else st.median(v for (c, _), v in kobs.items() if c != cart)
        f = {'K': lambda L: vref * (L / Lref) ** k,
             'P': lambda L: vref * powley(cart, L) / powley(cart, Lref),
             'MH': lambda L: vref * mayer_hart(cart, load, L) / mayer_hart(cart, load, Lref),
             'LD': le_duc(cart, load, Lref, vref)}
        rows.setdefault(groupe(cart, load), []).append(
            {n: (math.sqrt(st.mean((g(L) - v) ** 2 for L, v in pts[:-1])) if g else float('nan'))
             for n, g in f.items()})
    per = {c: {n: st.mean(r[n] for r in v) for n in v[0]} for c, v in rows.items()}
    carts = sorted(per)
    print(f"\n=== Comparaison appariée, {len(S)} séries, {len(carts)} "
          + (f"groupes ({titre}, k constant = {k_fixe:.3f})" if titre else
             "cartouches (k constant en validation croisée par cartouche)"))
    print('  écart quadratique moyen par groupe (fps) :')
    for c in carts:
        print(f"    {c:22s} " + '  '.join(f"{n} {per[c][n]:5.0f}" for n in ('K', 'P', 'MH', 'LD')))
    rnd = random.Random(seed)
    sortie = {}
    for a, b in (('P', 'K'), ('MH', 'K'), ('LD', 'K'), ('MH', 'P')):
        d_all = [per[c][a] - per[c][b] for c in carts]
        sortie[f'{a}-{b}'] = d_all
        cs = [c for c, x in zip(carts, d_all) if not math.isnan(x)]
        d0 = [per[c][a] - per[c][b] for c in cs]
        boot = sorted(st.mean(per[c][a] - per[c][b] for c in (rnd.choice(cs) for _ in cs))
                      for _ in range(B))
        w = sum(x < 0 for x in d0)
        p = sum(math.comb(len(cs), i) for i in range(w, len(cs) + 1)) / 2 ** len(cs)
        unite = 'cartouches' if not titre else 'groupes'
        print(f"  {a:2s} contre {b:2s} : meilleur sur {w}/{len(cs)} {unite}, écart moyen {st.mean(d0):+6.1f} fps, "
              f"IC 95 % [{boot[int(.025 * B)]:+.1f} ; {boot[int(.975 * B)]:+.1f}], test du signe unilatéral p = {p:.3f}")
    return sortie


if __name__ == '__main__':
    main()
