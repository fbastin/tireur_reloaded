"""Exposant k de la loi de canon v ∝ L^k, sur la longueur du canon et sur la course de la balle.

    python3 scripts/barrel_exponent_fit.py

Ajustement par moindres carrés de ln v sur ln L, points de 16 pouces et plus. Données publiées,
recopiées le 2026-10-02 :
  * Rifleshooter.com (Bill Marr), essais de canon raccourci 2013-2018 : tableaux publiés en IMAGE,
    relus à l'écran (un outil de lecture automatique en avait inventé un : ne jamais recopier
    sans regarder l'image) ; .243 Win. et .308 Win. : vitesses extrêmes du texte des articles ;
  * Litz, Applied Ballistics, 3e éd., p. 322 (.308 Win. 175 gr, 16″ et 30″).
Longueurs d'étui : data/calibers.json. Résultat et usage : velocity_model.js (k par défaut) et la
fiche wiki verification:technique:estimateur_vitesse.
"""
import math
D = {  # cartouche: (étui mm, {charge: [(L po, v fps), ...]})
 '223 Rem.': (44.7, {
   'BH 68 HM': [(26,2849),(25,2828),(24,2804),(23,2775),(22,2774),(21,2762),(20,2740),(19,2699),(18,2679),(17,2652),(16.5,2632)],
   'Win M855': [(26,3280),(25,3229),(24,3188),(23,3169),(22,3158),(21,3117),(20,3097),(19,3060),(18,3052),(17,2972),(16.5,2992)]}),
 '224 Valkyrie': (40.64, {
   '90 SP':  list(zip([28,27,26,25,24,23,22,21,20,19,18,17,16.5],[2797,2768,2743,2722,2719,2700,2683,2668,2621,2624,2616,2576,2561])),
   '90 SMK': list(zip([28,27,26,25,24,23,22,21,20,19,18,17,16.5],[2782,2750,2719,2736,2733,2708,2696,2659,2637,2630,2590,2564,2541])),
   '75 TMJ': list(zip([28,27,26,25,24,23,22,21,20,19,18,17,16.5],[3065,3055,3048,3018,3014,2984,2957,2937,2912,2893,2864,2821,2817])),
   '60 NBT': list(zip([28,27,26,25,24,23,22,21,20,19,18,17,16.5],[3395,3394,3358,3348,3328,3286,3275,3243,3217,3181,3166,3135,3065]))}),
 '7.62 x 39': (38.7, {
   'Brown Bear': list(zip([24,23,22,21,20,19,18,17,16.5],[2398,2454,2404,2377,2361,2319,2308,2304,2301])),
   'TCW':        list(zip([24,23,22,21,20,19,18,17,16.5],[2473,2486,2477,2463,2432,2409,2422,2399,2383]))}),
 '6 mm Creedmoor': (48.8, {
   '110 SMK': list(zip(range(31,16,-1),[3110,3088,3116,3100,3088,3073,3081,3062,3036,3005,2978,2949,2909,2876,2835])),
   '107 SMK': list(zip(range(31,16,-1),[3167,3156,3142,3165,3148,3140,3123,3075,3077,3063,3036,3000,2955,2920,2865]))}),
 '6.5 Creedmoor': (48.77, {
   '120 A-MAX': list(zip(range(27,15,-1),[2961,2949,2937,2918,2892,2872,2847,2819,2822,2761,2752,2728])),
   '142 SMK':   list(zip(range(27,15,-1),[2663,2677,2679,2683,2666,2649,2641,2609,2590,2562,2551,2505]))}),
 '243 Win.': (51.94, {'Rem 80 PSP': [(24,3123),(16,2806)], 'Win 100 PP': [(24,2826),(16,2488)]}),
 '308 Win.': (51.18, {'Win 147':[(28,2965),(16.5,2682)],'IMI 150':[(28,2823),(16.5,2561)],'GMM 168':[(28,2706),(16.5,2466)],'Win 180':[(28,2632),(16.5,2373)],'Litz 175':[(30,2800),(16,2500)]}),
 '300 Win. Mag.': (66.55, {'(article 2013)': list(zip([24.25,23.25,22.25,21.25,20.25,19.25,18.25,17.25,16.25],[2892,2851,2786,2789,2752,2727,2696,2640,2575]))}),
}
def slope(pts):
    x=[math.log(a) for a,_ in pts]; y=[math.log(b) for _,b in pts]; n=len(x); mx=sum(x)/n; my=sum(y)/n
    return sum((a-mx)*(b-my) for a,b in zip(x,y))/sum((a-mx)**2 for a in x)
allL=[];allC=[]
for cart,(case,loads) in D.items():
    c=case/25.4
    for nm,pts in loads.items():
        pts=[p for p in pts if p[0]>=16]
        kl=slope(pts); kc=slope([(L-c,v) for L,v in pts]); allL.append(kl); allC.append(kc)
        print(f'{cart:15s} {nm:15s} n={len(pts):2d}  k canon {kl:.3f}  k course {kc:.3f}')
import statistics as st
print(f'\n{len(allL)} séries : k canon médiane {st.median(allL):.3f} (min {min(allL):.3f}, max {max(allL):.3f}) ; k course médiane {st.median(allC):.3f} (min {min(allC):.3f}, max {max(allC):.3f})')
