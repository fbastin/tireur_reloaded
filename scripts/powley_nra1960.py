#!/usr/bin/env python3
"""Le calculateur de Powley (1961) contre les charges mesurées par H. P. White pour le NRA Illustrated
Reloading Handbook (1960).

    python3 scripts/powley_nra1960.py          # rapport lisible
    python3 scripts/powley_nra1960.py --json   # chiffres pour scripts/check_powley_page.py du site

Données : data/nra1960_charges.local.json (relevé du 2026-10-12, local, hors git : valeurs citées,
document non redistribué). Méthode et sources : docs/powley_dossier.md du site.

Formule de vitesse (forme du calculateur kwk.us, attribuée à Davis, Handloading, NRA, 1981 ; Powley ne
publie que des tables, imprimées sur la règle) :
    V = 8000 sqrt(I (1 - R^-1/4) / (G + I/3)),  R = 1 + A x / U
I charge (gr), G balle (gr), A section de l'âme, x course de la balle, U volume sous la balle.
Conventions des outils du site (velocity_model.js, powleyFactor) : A = pi/4 bore_mm^2,
x = canon - longueur d'étui, U = case_vol_cm3 de data/calibers.json.

Cinq contrôles :
  1. la formule contre les sept vitesses d'exemple du manuel de Powley ;
  2. la pression à la bouche que la formule implique, contre la rubrique « Muzzle Pressure » du manuel ;
  3. la vitesse mesurée rapportée à la formule, par tranche de pression et par cartouche ;
  4. la règle du manuel « charge +x % : vitesse +x %, pression +2x % », sur les séries homogènes ;
  5. l'indice de poudre de kwk.us, contre les exemples du manuel puis la meilleure poudre de chaque balle.
"""
import json, math, os, re, statistics as st

ICI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DONNEES = os.path.join(ICI, 'data', 'nra1960_charges.local.json')
CALIBRES = os.path.join(ICI, 'data', 'calibers.json')

# Cartouche du relevé -> clé de calibers.json ; absente : hors banc (pas de volume d'étui dans la base).
CLE = {
    '7.5 mm Swiss': '7.5 x 55 Swiss', "30-'06": '30-06 Spring.', '30-06': '30-06 Spring.',
    '22 Hornet': '22 Hornet', '222 Remington Magnum': '222 Rem. Mag.', '222 Remington': '222 Rem.',
    '220 Swift': '220 Swift', '22-250': '22-250 Rem.', '243 Winchester': '243 Win.',
    '244 Remington': '6 mm Remington', '338 Winchester Magnum': '338 Win. Mag.',
    '250-3000 Savage': '250 Savage', '6.5x55': '6.5 x 55 SE', '270 Winchester': '270 Win.',
    '7 mm Mauser': '7 x 57', '280 Remington': '280 Remington', '300 Savage': '300 Savage',
    '30-30 Winchester': '30-30 Win.', '308 Winchester': '308 Win.', '303 British': '303 British',
    '8 mm Mauser': '8 x 57 IS', '35 Remington': '35 Remington', '375 H&H Magnum': '375 H&H Mag.',
    '458 Winchester Magnum': '458 Winchester Magnum', '45-70': '45 - 70 Govt.',
}
# Poudres au banc : IMR (nitrocellulose extrudée, celles du calculateur) et HiVel n° 2 (double base ;
# le manuel la donne pour interchangeable avec la 3031 à poids égal).
IMR = {'3031', '4064', '4320', '4350', '4831', '4895', '4198', '4227', '4759'}
# Ordre de vivacité des poudres selon le manuel (de la plus rapide à la plus lente), HiVel n° 2 avec la 3031.
ORDRE = ['4227', '4198', '3031', 'HiVel 2', '4064', '4320', '4895', '4350', '4831']


def vitesse(I, G, R):
    return 8000 * math.sqrt(I * (1 - R ** -0.25) / (G + I / 3))


def num(s):
    s = re.sub(r'^\.(\d{4})$', r'\1', (s or '').strip())   # « .3027 » : point parasite (.308, charge 8)
    try:
        return float(s.replace(',', ''))
    except ValueError:
        return None


def pouces(s):
    if s is None:
        return None
    s = str(s).replace('"', '').strip()
    u = {'¼': .25, '½': .5, '¾': .75, '⅛': .125, '⅜': .375, '⅝': .625, '⅞': .875}
    m = re.match(r'^(\d+(?:\.\d+)?)\s*([¼½¾⅛⅜⅝⅞])?$', s)
    if m:
        return float(m[1]) + (u[m[2]] if m[2] else 0)
    m = re.match(r'^(\d+)-(\d+)/(\d+)$', s)
    return int(m[1]) + int(m[2]) / int(m[3]) if m else None


def poudre(p):
    p = (p or '').upper().replace('IMR', '').replace('#', '').strip()
    if 'HI' in p and 'VEL' in p:
        return 'HiVel 2'
    m = re.search(r'\b(\d{4})\b', p)
    return m[1] if m and m[1] in IMR else None


def cle(cart):
    c = cart[1:] if cart.startswith('.') else cart
    return next((v for k, v in CLE.items() if c.startswith(k)), None)


def charger():
    cal = json.load(open(CALIBRES, encoding='utf-8'))['calibers']
    d = json.load(open(DONNEES, encoding='utf-8'))
    canon = {(t['cartouche'], str(t['page_pdf'])): pouces(t.get('canon_in')) for t in d['tableaux']}
    banc, ecartees, absentes = [], {}, set()
    for r in d['charges']:
        k = cle(r['cartouche'])
        I, G, V, P = (num(r[c]) for c in ('charge_gr', 'balle_gr', 'vitesse_fps', 'pression_psi'))
        z = dict(cart=r['cartouche'], page=r['page_pdf'], no=r['no'], cle=k, I=I, G=G, V=V, P=P,
                 poudre=poudre(r['poudre']), canon=canon.get((r['cartouche'], r['page_pdf'])),
                 balle=re.sub(r'\([a-z]\)\s*', '', r['balle_type']).strip().lower(), notes=r['notes'],
                 verification=r['verification'])
        raison = ('cartouche absente de la base' if k is None else 'munition du commerce (sans charge)' if not I
                  else f"poudre hors banc ({r['poudre']})" if not z['poudre'] else 'canon non précisé' if not z['canon']
                  else None)
        if raison:
            ecartees[raison] = ecartees.get(raison, 0) + 1
            if k is None:
                absentes.add(r['cartouche'])
            continue
        c = cal[k]
        A = math.pi * (c['bore_mm'] / 1000) ** 2 / 4
        z['R'] = 1 + A * (z['canon'] * 0.0254 - c['case_mm'] / 1000) / (c['case_vol_cm3'] * 1e-6)
        z['Vp'] = vitesse(I, G, z['R'])
        z['r'] = V / z['Vp']
        z['c'] = c
        banc.append(z)
    return d, banc, ecartees, sorted(absentes)


RES = {}
def resume(sel, nom, cle_res=None):
    rr = sorted(z['r'] for z in sel)
    q = lambda p: rr[min(len(rr) - 1, int(p * len(rr)))]
    print(f"  {nom:40s} n = {len(sel):3d}  médiane {st.median(rr):.3f}, quartiles {q(.25):.3f}–{q(.75):.3f}, "
          f"extrêmes {rr[0]:.3f}–{rr[-1]:.3f}")
    if cle_res:
        RES.setdefault('rapports', {})[cle_res] = dict(n=len(sel), mediane=round(st.median(rr), 3),
                                                      q1=round(q(.25), 3), q3=round(q(.75), 3))


def pente(xs, ys):
    mx, my = st.mean(xs), st.mean(ys)
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)


def main():
    print("=== 1. La formule contre les exemples du manuel de Powley (p. 9 à 11)")
    for nom, I, G, R, vm in [('.308 Win., 150 gr, 4064', 44.3, 150, 9.0, 2730), ('.30-06, 180 gr, 4350', 55.6, 180, 7.5, 2680),
                             ('.264 Win. Mag., 140 gr, 5010', 71.4, 140, 5.1, 3080), ('6,5 sur .300 Wby, 139 gr', 81.7, 139, 5.0, 3220),
                             ('.30-378, 77 gr', 112, 77, 4.5, 4480), ('50 gr / 180 gr, R = 4', 50, 180, 4, 2200),
                             ('50 gr / 180 gr, R = 12', 50, 180, 12, 2770)]:
        v = vitesse(I, G, R)
        print(f"  {nom:30s} formule {v:5.0f}, manuel {vm} ({100 * (v - vm) / vm:+.1f} %)")
        RES.setdefault('exemples', []).append(dict(nom=nom, formule=round(v), manuel=vm, ecart=round(100 * (v - vm) / vm, 1)))

    print("\n=== 2. Pression à la bouche impliquée par la formule (rubrique « Muzzle Pressure », p. 6)")
    # P = m_eff v dv/dx / A, m_eff = G + I/3, dR/dx = A/U ; avec I = 0,86 W (W en grains d'eau, 253 gr/po³) :
    # P = 64e6 I R^(-5/4) / (8 U), indépendante de la balle et du rapport charge/balle.
    def p_bouche(R, G=150.0, rapport=0.2):
        I = rapport * G
        U = I / 0.86 / 253.0 / 1728.0                       # pied³
        m = (G + I / 3) / 7000.0 / 32.174                    # slug
        return m * 64e6 * I / (G + I / 3) * R ** -1.25 / (8 * U) / 144.0
    for (R, rap), pm in {(6, 0.2): 29000, (6, 0.6): 40000, (10, 0.2): 5600, (10, 0.6): 7300, (10, 1.0): 9800}.items():
        print(f"  R = {R:2d}, charge/balle {rap} : formule {p_bouche(R, rapport=rap):6.0f} psi, manuel {pm:6d} psi")
    RES['bouche'] = dict(R6=round(p_bouche(6)), R10=round(p_bouche(10)), facteur=round(p_bouche(6) / p_bouche(10), 2),
                         adiabatique=round((10 / 6) ** 1.25, 2), manuel=[round(29000 / 5600, 2), round(40000 / 7300, 2)])
    print(f"  de R = 6 à R = 10 : la formule divise la pression par {p_bouche(6) / p_bouche(10):.2f} "
          f"(détente adiabatique, gamma 1,25 : {(10 / 6) ** 1.25:.2f}) ; le manuel par {29000 / 5600:.2f} et {40000 / 7300:.2f}")

    d, banc, ecartees, absentes = charger()
    print(f"\n=== 3. Vitesse mesurée / formule de Powley ({len(d['charges'])} lignes relevées, {len(banc)} au banc, "
          f"{len({z['cle'] for z in banc})} cartouches)")
    for k, v in sorted(ecartees.items(), key=lambda kv: -kv[1]):
        print(f"  écartées : {v:3d}  {k}")
    RES['banc'] = dict(lignes=len(d['charges']), tableaux=len(d['tableaux']), au_banc=len(banc),
                       cartouches=len({z['cle'] for z in banc}), ecartees=ecartees, absentes=absentes)
    resume(banc, 'toutes', 'toutes')
    avecP = [z for z in banc if z['P']]
    for lo, hi in ((0, 35000), (35000, 40000), (40000, 45000), (45000, 50000), (50000, 60000)):
        resume([z for z in avecP if lo <= z['P'] < hi], f"pression {lo // 1000} à {hi // 1000} kpsi", f"{lo // 1000}-{hi // 1000}")
    resume([z for z in avecP if 40000 <= z['P'] < 50000], 'pression 40 à 50 kpsi (celle du calculateur)', '40-50')
    resume([z for z in banc if z['poudre'] == 'HiVel 2'], 'HiVel n° 2', 'hivel')
    resume([z for z in banc if z['poudre'] != 'HiVel 2'], 'IMR', 'imr')
    b = pente([math.log(z['P'] / 45000) for z in avecP], [math.log(z['r']) for z in avecP])
    print(f"  mesurée/formule proportionnelle à P^{b:.2f} (n = {len(avecP)})")
    RES['pente_pression'] = round(b, 2)
    print("  par cartouche, 40 à 50 kpsi :")
    for k in sorted({z['cle'] for z in banc}):
        s = [z for z in avecP if z['cle'] == k and 40000 <= z['P'] < 50000]
        if s:
            resume(s, f"  {k} (R = {st.median(z['R'] for z in s):.1f})", 'cartouche:' + k)

    # Sensibilité au volume d'étui : 0,90 × la capacité en eau de Peterson (médiane des lots) à la place du
    # volume de la base, pour les cartouches que Peterson couvre (calibers/peterson_capacity_reference.json du site).
    pet = os.path.join(os.path.dirname(os.path.dirname(ICI)), 'calibers', 'peterson_capacity_reference.json')
    if os.path.exists(pet):
        cap = json.load(open(pet, encoding='utf-8'))['calibres']
        nom = {'22-250 Rem.': '22-250 Remington', '243 Win.': '243 Winchester', '270 Win.': '270 Winchester',
               '280 Remington': '280 Remington', '30-06 Spring.': '30-06 Springfield', '308 Win.': '308 Winchester',
               '338 Win. Mag.': '338 Winchester Magnum'}
        ecarts = []
        for k, p in nom.items():
            s = [z for z in avecP if z['cle'] == k and 40000 <= z['P'] < 50000]
            if not s:
                continue
            U = 0.90 * cap[p]['mediane_gr'] / 15.4324 * 1e-6
            r2 = []
            for z in s:
                A = math.pi * (z['c']['bore_mm'] / 1000) ** 2 / 4
                R = 1 + A * (z['canon'] * 0.0254 - z['c']['case_mm'] / 1000) / U
                r2.append(z['V'] / vitesse(z['I'], z['G'], R))
            m1, m2 = st.median(z['r'] for z in s), st.median(r2)
            ecarts.append(abs(m2 / m1 - 1))
            print(f"  volume 0,90 × Peterson, {k:14s} n = {len(s):2d} : médiane {m1:.3f} -> {m2:.3f}")
        RES['volume'] = dict(cartouches=len(ecarts), ecart_max_pct=round(100 * max(ecarts), 1))
        print(f"  {len(ecarts)} cartouches : médiane déplacée de {100 * max(ecarts):.1f} % au plus")

    print("\n=== 4. Charge +x % : vitesse +x %, pression +2x % (manuel, p. 11)")
    # Série homogène : même tableau, même balle, même poudre, même lot, même amorce, même enfoncement ;
    # au moins deux charges qui diffèrent de 5 % ou plus.
    series = {}
    for z in avecP:
        g = lambda k: (re.search(k + r'[^=;]*=\s*([^;]+)', z['notes']) or [None, ''])[1].strip()
        series.setdefault((z['cle'], z['page'], z['G'], z['balle'], z['poudre'], g('lot'), g('amorce'),
                           g('enfoncement'), g('table')), []).append(z)
    eV, eP, cart, n222 = [], [], set(), 0
    for s in series.values():
        if len(s) >= 2 and max(z['I'] for z in s) >= 1.05 * min(z['I'] for z in s):
            xs = [math.log(z['I']) for z in s]
            eV.append(pente(xs, [math.log(z['V']) for z in s]))
            eP.append(pente(xs, [math.log(z['P']) for z in s]))
            cart.add(s[0]['cle'])
            n222 += s[0]['cle'] == '222 Rem.'
    print(f"  {len(eV)} séries, {len(cart)} cartouches : vitesse +{st.median(eV):.2f} x (de {min(eV):.2f} à {max(eV):.2f}) ; "
          f"pression +{st.median(eP):.2f} x (de {min(eP):.2f} à {max(eP):.2f})")
    RES['series'] = dict(n=len(eV), cartouches=len(cart), n222=n222, vitesse=[round(st.median(eV), 2), round(min(eV), 2), round(max(eV), 2)],
                         pression=[round(st.median(eP), 2), round(min(eP), 2), round(max(eP), 2)])

    print("\n=== 5. Indice de poudre de kwk.us : X = 20 + 12 / (Z sqrt(0,86 W / G))")
    def X(W, G, d):
        return 20 + 12 / (G / 7000 / d ** 2 * math.sqrt(0.86 * W / G))
    def classe(x):
        return (['plus lente que 4831'] if x <= 91 else ['4831', '4350'] if x <= 110 else ['4320', '4895', '4064']
                if x <= 125 else ['3031', 'HiVel 2'] if x <= 145 else ['4198'] if x <= 165 else ['4227'] if x <= 180
                else ['plus rapide que 4227'])
    for nom, W, G, dd, manuel in [('.308 Win., 150 gr', 51.5, 150, .308, '4064'), ('.30-06, 180 gr', 61.5, 180, .308, '« D », 4350'),
                                   ('.264 Win. Mag., 140 gr', 79, 140, .264, '« B », 5010'), ('6,5 sur .300 Wby, 139 gr', 95, 139, .264, '5010'),
                                   ('.30-378, 77 gr', 107 / 0.86, 77, .308, '« D »')]:
        x = X(W, G, dd)
        print(f"  {nom:26s} X = {x:5.1f} : {'/'.join(classe(x)):22s} manuel : {manuel}")
    groupes = {}
    for z in avecP:
        if 40000 <= z['P'] <= 52000:
            groupes.setdefault((z['cle'], z['page'], z['G']), []).append(z)
    n = dans = voisine = 0
    for (k, _, G), s in groupes.items():
        if len({z['poudre'] for z in s}) < 2:
            continue
        meilleure = max(s, key=lambda z: z['V'])['poudre']
        cl = classe(X(s[0]['c']['case_vol_cm3'] * 15.4324, G, s[0]['c']['bore_mm'] / 25.4))
        n += 1
        dans += meilleure in cl
        voisine += meilleure in cl or any(p in ORDRE and abs(ORDRE.index(p) - ORDRE.index(meilleure)) <= 1 for p in cl)
    print(f"  {n} balles essayées avec au moins deux poudres entre 40 et 52 kpsi : la plus rapide est dans la classe "
          f"indiquée {dans} fois, elle ou sa voisine {voisine} fois")
    RES['poudre'] = dict(balles=n, dans=dans, voisine=voisine)


if __name__ == '__main__':
    import contextlib, io, sys
    if '--json' in sys.argv:
        with contextlib.redirect_stdout(io.StringIO()):
            main()
        print(json.dumps(RES, ensure_ascii=False, indent=1))
    else:
        main()
