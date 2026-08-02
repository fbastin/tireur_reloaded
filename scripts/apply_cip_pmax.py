#!/usr/bin/env python3
"""Aligne les pressions de l'estimateur sur les tables C.I.P. (référentiel prioritaire).

    python3 scripts/apply_cip_pmax.py --dry-run   # rapport seul
    python3 scripts/apply_cip_pmax.py             # applique

POURQUOI. `data/calibers.json` stockait la limite de pression dans `pmax_cip_bar`
quelle que soit sa provenance, `pmax_src="SAAMI"` signalant les valeurs SAAMI. Le
drapeau manquait sur 26 cartouches : `index.php` leur appliquait donc la chaîne
C.I.P. (P_K 1,15× puis P_E 1,25×/1,30×) et l'étiquette « P_max C.I.P. » à une valeur
qui n'en était pas une — le .454 Casull affichait 4482 bar (65 000 psi SAAMI) là où
la C.I.P. publie 3900, soit une limite 15 % trop permissive.

RÈGLE APPLIQUÉE (décision du 2026-08-02, référentiel C.I.P. prioritaire).
  * `pmax_cip_bar`   : la limite qui pilote la courbe. Vaut la valeur des tables
                       C.I.P. dès que la cartouche y est homologuée ; sinon la
                       valeur SAAMI, et alors seulement `pmax_src="SAAMI"`.
  * `pmax_saami_bar` : la valeur SAAMI quand elle est connue et distincte —
                       informative, elle n'est jamais perdue par l'alignement.
  * `pmax_src`       : présent SI ET SEULEMENT SI `pmax_cip_bar` n'est pas une
                       valeur C.I.P. L'invariant se lit en une ligne.

Une valeur qui se disait C.I.P. et diffère de la table est une erreur de saisie sans
provenance établie : elle est remplacée par la valeur C.I.P., et n'est PAS recyclée
en SAAMI — seule une attribution explicite préexistante alimente `pmax_saami_bar`.
Les cartouches absentes du relevé C.I.P. ne sont pas touchées, seulement listées.
Le script est idempotent.
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
DATA = os.path.join(HERE, "..", "data", "calibers.json")
REF = os.path.join(ROOT, "calibers", "cip_pmax_reference.json")

sys.path.insert(0, os.path.join(ROOT, "calibers"))
import generate_calibers_db as G  # noqa: E402  (mapping libellé estimateur → id de base)

PSI_PER_BAR = 1.0 / 0.0689476


def psi_round(bar):
    """Renvoie la valeur en psi si elle tombe sur un millier ou un demi-millier.

    N'INTERVIENT DANS AUCUNE DÉCISION — seulement dans le rapport, pour éclairer
    l'œil sur l'origine probable d'une valeur écartée. Deux raisons de s'en méfier :
    la C.I.P. reprend parfois telle quelle une valeur SAAMI convertie (le .375 Ruger
    est homologué à 4275 bar = 62 004 psi, fiche TDCC TAB. I du 09-05-05), et le pas
    de 100 psi initialement toléré acceptait près d'un tiers des valeurs au hasard —
    il attribuait ainsi le 7,5 × 55 Swiss à SAAMI sans le moindre fondement.
    """
    p = bar * PSI_PER_BAR
    for step in (1000, 500):
        r = round(p / step) * step
        if abs(p - r) <= 25:
            return int(r)
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="rapport seul, n'écrit pas")
    args = ap.parse_args()

    with open(REF, encoding="utf-8") as f:
        ref = json.load(f)["calibres"]
    with open(DATA, encoding="utf-8") as f:
        doc = json.load(f)
    est = doc["calibers"]

    aligned, kept_saami, orphans, no_attr = [], [], [], []
    changes = 0

    for key, val in est.items():
        cid = G.sim_key_to_id.get(key, G.clean_id(key))
        cip = ref.get(cid, {}).get("pmax_bar")
        cur = val.get("pmax_cip_bar")
        src = val.get("pmax_src")
        saami = val.get("pmax_saami_bar")

        # Valeur SAAMI connue : celle déjà rangée, ou celle qu'on s'apprête à écraser
        # SI ET SEULEMENT SI elle était explicitement attribuée. Une valeur qui se
        # disait C.I.P. à tort n'est pas pour autant une valeur SAAMI : la ranger
        # comme telle sur la foi d'un psi rond fabriquerait une provenance.
        if saami is None and cur is not None and src == "SAAMI":
            saami = cur

        before = (val.get("pmax_cip_bar"), val.get("pmax_saami_bar"), val.get("pmax_src"))

        if cip is not None:
            if cur is None:
                orphans.append((key, cip))
            elif abs(cur - cip) > 1:
                aligned.append((key, cur, cip, src or ("psi %d" % psi_round(cur) if psi_round(cur) else "sans provenance")))
            val["pmax_cip_bar"] = cip
            val.pop("pmax_src", None)
        else:
            # Hors relevé C.I.P. : on ne fabrique rien, ni valeur ni provenance.
            if cur is not None and not src:
                no_attr.append((key, cur, psi_round(cur)))
            elif cur is not None:
                kept_saami.append((key, cur, src))

        if saami is not None:
            val["pmax_saami_bar"] = saami

        if (val.get("pmax_cip_bar"), val.get("pmax_saami_bar"), val.get("pmax_src")) != before:
            changes += 1

    print(f"{len(est)} cartouches examinées\n")
    print(f"### {len(aligned)} valeurs réalignées sur la table C.I.P.")
    for k, cur, cip, prov in sorted(aligned, key=lambda x: -abs(x[1] / x[2] - 1)):
        sens = "↓" if cip < cur else "↑"
        print(f"    {k:26s} {cur:5} → {cip:5} bar  {sens} {(cip/cur-1)*100:+5.1f} %   ({prov})")
    print(f"\n### {len(orphans)} cartouches sans limite qui en reçoivent une")
    for k, cip in orphans:
        print(f"    {k:26s}       → {cip:5} bar")
    print(f"\n### {len(kept_saami)} hors C.I.P., provenance déjà attribuée (pmax_src maintenu)")
    for k, cur, src in kept_saami:
        print(f"    {k:26s} {cur:5} bar   ({src})")
    if no_attr:
        print(f"\n/!\\ {len(no_attr)} valeurs SANS attribution et hors relevé C.I.P. —")
        print("    l'interface les étiquette « C.I.P. » sans preuve. À vérifier à la main :")
        for k, cur, psi in no_attr:
            ind = f"  (= {psi} psi, sent le SAAMI)" if psi else ""
            print(f"    {k:26s} {cur:5} bar{ind}")

    if args.dry_run:
        print(f"\n--dry-run : {changes} entrée(s) auraient été modifiées, rien écrit.")
        return 0
    if not changes:
        print("\nRien à faire — les pressions sont déjà alignées.")
        return 0
    with open(DATA, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"\n{changes} entrée(s) mises à jour dans {os.path.relpath(DATA, ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
