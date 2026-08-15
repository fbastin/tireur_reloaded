#!/usr/bin/env python3
"""Contrôle croisé des couples ancrés par les courbes de Manning (1948).

    python3 scripts/manning_crosscheck.py [--all] [--seuil 10]

CE QUE C'EST. H. P. Manning (Frankford Arsenal, rapport R-859, juin 1948) a établi
par l'expérience une relation de SIMILITUDE pour les armes légères : la vitesse
de bouche s'obtient de trois grandeurs seulement — le rapport charge/masse de
balle C/W, le rapport d'expansion Um/U0, et la pression maximale P. Ni la poudre,
ni le calibre, ni la forme de l'étui n'y figurent.

C. M. Dickey en a tiré une forme close (Frankford Arsenal, 1975), reproduite p. 5
du rapport DTIC ADA076175 (S. Goldstein, « Interior Ballistics Modeling Applied to
Small Arms Systems », US Army ARRADCOM, juin 1979), § Empirical Models :

    V_{5,60} = 3213 log10(C/W) + 4120        [fps]
    V_x/V_5  = 0.668 (Um/U0)^0.25
    V_m/V_60 = 0.545 P^0.148                 [P en kpsi]
    V        = V_{5,60} × (V_x/V_5) × (V_m/V_60)

Œuvre du gouvernement des États-Unis, domaine public. Le rapport n'est pas versé
au dépôt (règle du projet) : il est en accès libre chez DTIC et sur archive.org.

CE QUE ÇA N'EST PAS. Manning prend la PRESSION EN ENTRÉE. Ce n'est donc pas un
prédicteur de charge et cela ne concurrence pas le modèle énergie-efficacité :
c'est une relation de cohérence entre (C/W, Um/U0, P) et la vitesse. Son usage
ici est le contrôle de données — une charge qui s'en écarte franchement est une
candidate à l'erreur de transcription, comme pour les autres *_crosscheck.

⚠️ ET SURTOUT, ÇA N'AIDE PAS SUR LA PRESSION. Inversée pour rendre P depuis v,
la relation porte l'exposant 1/0.148 = 6,76 : 1 % d'erreur sur la vitesse en fait
7 % sur la pression, et nos 4,3 % de RMS en feraient 33 %. C'est une TROISIÈME
démonstration indépendante du plancher structurel sur la pression — pas une issue.

DOMAINE. La droite de Dickey n'est PAS la figure 1 de Manning : c'est un
ajustement linéaire d'une courbe concave. Relevé au rendu image de la figure, il
colle entre C/W ≈ 0,25 et 2,0, et décroche à gauche — à C/W = 0,1 il rend 907 fps
là où la figure en donne ~1400, et il passe NÉGATIF sous C/W = 0,052. Toutes les
charges de pistolet sont sous ce seuil : elles sont donc écartées, et l'échec
apparent du modèle sur elles est un artefact de l'ajustement de Dickey, pas de
Manning. Les figures, elles, descendent jusqu'à C/W = 0,02.

CE QUE LE CONTRÔLE A DONNÉ (2026-08-14, 934 charges Reload Swiss, 38 cartouches).
Écart absolu médian **2,8 %**, p90 7,5 %. Une corrélation de 1948 calée sur des
armes de service américaines reproduit donc les vitesses de poudres européennes
modernes à quelques pour cent — la similitude est réelle, et elle a tenu 78 ans.
L'ablation confirme que chaque terme gagne sa place : sans la pression 5,9 %,
sans l'expansion 7,0 %, avec C/W seul 5,2 %, contre 7,2 % pour un témoin à
vitesse constante.

Mais le biais n'est PAS uniforme, et c'est la vraie leçon : il tombe de +5,2 % à
30-38 kpsi à +0,6 % au-delà de 55 kpsi, et monte de +1,1 % à C/W ≈ 0,3 à +6,1 %
au-delà de 0,55. Manning est calé sur des charges de service à pleine pression et
sur-estime d'autant plus qu'on s'en éloigne — les charges de départ sortent à
+3,1 %, les charges maxi à +1,6 %. Le terme d'expansion, lui, est plat sur toute
la plage : c'est le mieux tenu des trois.

POURQUOI CE BIAIS — la réponse a 97 ans. Le *Textbook of Small Arms* (War Office,
1929, ch. III), qui expose la similitude de Housman dont Manning est l'héritier,
donne un critère de combustion complète : la poudre brûle entièrement avant la
bouche si **V × (W/d²) dépasse ~500 à ~600** (V en f/s, W/d² = densité
sectionnelle) ; en deçà, « *loads … blow out some of their powder unconsumed from
the muzzle* ». Ce critère prédit le résidu de Manning mieux que la pression :

    V·W/d²   < 500     500-600    600-700    700-900    > 900
    biais    +7,3 %     +4,7 %     +2,1 %     +1,0 %    +0,6 %

et il ne se réduit PAS à la pression déguisée : à bande de pression fixée, il
sépare encore de 2 à 4 points. Manning est calé sur des charges qui brûlent tout ;
sous le seuil, il suppose une énergie que la charge n'a pas délivrée, et
sur-estime. Un critère de 1929 explique le résidu d'un modèle de 1948, mesuré en
2026 sur des poudres européennes modernes.

CONSÉQUENCE D'USAGE. Comme détecteur d'erreur de transcription, l'outil ne vaut
qu'au-dessus du seuil de 1929, où son propre biais (1,6 %) est petit devant ce
qu'on cherche. En dessous, son biais de domaine noierait le signal : ne pas y voir
des erreurs de saisie.
"""
import argparse, json, math, os, statistics as st

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
BAR_TO_KPSI = 14.5037738 / 1000.0
FPS_TO_MS = 0.3048
# Bornes du domaine où la forme close de Dickey reproduit la figure 1.
CW_MIN, CW_MAX = 0.25, 2.0
P_MIN, P_MAX = 30.0, 82.0


def manning_fps(cw, er, p_kpsi):
    return (3213 * math.log10(cw) + 4120) * (0.668 * er ** 0.25) * (0.545 * p_kpsi ** 0.148)


def charger(tout=False):
    cal = json.load(open(os.path.join(DATA, 'calibers.json')))['calibers']
    rows = json.load(open(os.path.join(DATA, 'rs_dataset.local.json')))
    gardees, ecartees = [], {}

    def rejet(motif):
        ecartees[motif] = ecartees.get(motif, 0) + 1

    for r in rows:
        c = cal.get(r['cartridge'])
        if not c:
            rejet('cartouche absente de calibers.json'); continue
        if not all(c.get(k) for k in ('bore_mm', 'case_mm', 'case_vol_cm3')):
            rejet('cotes incomplètes'); continue
        if not r.get('Pmax') or not r.get('v0'):
            rejet('pas de couple vitesse/pression'); continue
        travel_cm = (r['barrel_mm'] - c['case_mm']) / 10.0
        if travel_cm <= 0:
            rejet('canon plus court que l\'étui'); continue
        u0 = c['case_vol_cm3']
        er = (math.pi * (c['bore_mm'] / 20.0) ** 2 * travel_cm + u0) / u0
        cw = r['C_gr'] / r['m_gr']
        p = r['Pmax'] * BAR_TO_KPSI
        if not tout and not (CW_MIN <= cw <= CW_MAX and P_MIN <= p <= P_MAX):
            rejet('hors du domaine de la droite de Dickey'); continue
        v = manning_fps(cw, er, p) * FPS_TO_MS
        # Critère d'« all-burnt » du Textbook of Small Arms (1929, ch. III) :
        # la combustion est complète avant la bouche si V × (W/d²) dépasse ~500
        # (cordite MDT 5,2) à ~600 (poudre Z). En deçà, « loads … blow out some of
        # their powder unconsumed from the muzzle ». V en f/s, W/d² en lb/in².
        sd = (r['m_gr'] / 7000.0) / (c['bore_mm'] / 25.4) ** 2
        gardees.append(dict(cartouche=r['cartridge'], poudre=r['powder'], niveau=r.get('level'),
                            cw=cw, er=er, p=p, ab=(r['v0'] / FPS_TO_MS) * sd,
                            v_mes=r['v0'], v_man=v, ecart=100 * (v / r['v0'] - 1)))
    return gardees, ecartees


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--all', action='store_true',
                    help="ne pas restreindre au domaine de validité de la droite de Dickey")
    ap.add_argument('--seuil', type=float, default=10.0,
                    help="écart (%%) au-delà duquel une charge est signalée (défaut 10)")
    a = ap.parse_args()

    d, ecartees = charger(a.all)
    if not d:
        print("Aucune charge exploitable."); return 2

    e = [x['ecart'] for x in d]
    ae = sorted(abs(v) for v in e)
    print(f"Manning (forme close de Dickey) — {len(d)} charges, "
          f"{len(set(x['cartouche'] for x in d))} cartouches")
    for k, v in sorted(ecartees.items(), key=lambda kv: -kv[1]):
        print(f"    écartées : {v:5d}  {k}")
    print(f"\n  biais médian     {st.median(e):+5.1f} %")
    print(f"  |écart| médian   {st.median(ae):5.1f} %"
          f"   p90 {ae[int(.9 * len(ae))]:5.1f} %   max {ae[-1]:5.1f} %")

    # Le biais n'est pas uniforme : Manning est calé sur des charges de service à
    # pleine pression, et il SUR-ESTIME d'autant plus qu'on s'en éloigne. Cette
    # structure est imprimée à chaque exécution, sans quoi on prendrait un défaut
    # de domaine pour une erreur de transcription.
    print("\n  Structure du résidu — le biais est une propriété du domaine, pas du bruit :")
    for label, cle, bornes in (("V·W/d²  ", 'ab', [0, 500, 600, 700, 900, 3000]),
                               ("P (kpsi)", 'p', [30, 38, 45, 50, 55, 60, 65]),
                               ("C/W     ", 'cw', [0.25, 0.35, 0.45, 0.55, 0.70, 2.0]),
                               ("Um/U0   ", 'er', [5, 7, 9, 11, 25])):
        for lo, hi in zip(bornes, bornes[1:]):
            s = [x for x in d if lo <= x[cle] < hi]
            if len(s) < 15:
                continue
            ec = [x['ecart'] for x in s]
            print(f"    {label} {lo:5.2f}–{hi:5.2f} : {len(s):4d} charges   "
                  f"biais {st.median(ec):+5.1f} %   "
                  f"|écart| médian {st.median([abs(v) for v in ec]):4.1f} %")

    hors = sorted((x for x in d if abs(x['ecart']) > a.seuil),
                  key=lambda x: -abs(x['ecart']))
    print(f"\n  {len(hors)} charge(s) au-delà de {a.seuil:.0f} % "
          f"— à confronter à la page imprimée :")
    for x in hors[:25]:
        print(f"    {x['cartouche']:22s} {x['poudre']:10s} {str(x['niveau']):4s} "
              f"C/W {x['cw']:5.2f}  ER {x['er']:5.1f}  P {x['p']:4.0f} kpsi   "
              f"{x['v_mes']:4.0f} → {x['v_man']:4.0f} m/s  {x['ecart']:+6.1f} %")
    if len(hors) > 25:
        print(f"    … et {len(hors) - 25} autres")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
