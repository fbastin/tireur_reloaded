#!/usr/bin/env python3
"""Données de charge du guide Shooters World (poudres Explosia / Lovex, données SAAMI, pression en psi).

    python3 scripts/parse_shooters_world.py GUIDE.pdf [--debug PAGE]

Écrit data/shooters_world.local.json (LOCAL, hors git : valeurs citées, document non redistribué).

Le PDF a une couche de texte native (InDesign), donc les chiffres sont exacts ; la difficulté est la
mise en page. Une ligne de tableau tient sur plusieurs lignes de texte : la cartouche, l'étui et la balle
se coupent au-dessus ET au-dessous de la ligne des chiffres (« .243 / Win- » au-dessus, « Winchester /
chester » au-dessous). Le parseur lit donc les mots avec leurs coordonnées (pdftotext -bbox) :
  1. une ligne d'ANCRE porte, à droite de la colonne « Load Length », au moins cinq valeurs numériques
     (ou « N/A ») ; chaque valeur est rangée dans la colonne d'en-tête la plus proche ;
  2. chaque autre ligne de texte du tableau va à l'ancre la plus proche en hauteur. Les cellules sont
     CENTRÉES sous leur en-tête : un mot dont le centre tombe à moins de 22 pt du centre de « Case » est
     l'étui (relevé du 2026-10-12 : seuls des noms de fabricants d'étuis y tombent, à ±15 pt ; les mots
     de la cartouche sont à 35 pt ou plus à gauche, ceux de la balle à 40 pt ou plus à droite) ; à gauche,
     la cartouche ; à droite, la balle. Onglets de page (RIFLE, HANDGUN, SHOTGUN), numéros de page et
     notes de bas de tableau (« ** MSSS = … ») sont écartés.
Le nombre d'ancres par page est contrôlé contre le nombre de lignes à six nombres du texte mis en page.
"""
import html
import json
import os
import re
import subprocess
import sys

ICI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SORTIE = os.path.join(ICI, 'data', 'shooters_world.local.json')

# Titre de section -> (clé de data/powders.json, code Lovex imprimé)
POUDRES = [
    (r'CLEAN SHOT', 'Shooters World Clean Shot'),
    (r'ULTIMATE PISTOL', 'Shooters World Ultimate Pistol'),
    (r'AUTO PISTOL', 'Shooters World Auto Pistol'),
    (r'MAJOR PISTOL,? D037', 'Shooters World Major Pistol'),
    (r'HEAVY PISTOL D037', 'Shooters World Heavy Pistol'),
    (r'BUFFALO RIFLE D060', 'Shooters World Buffalo Rifle'),
    (r'SBR - SOCOM', 'Shooters World SOCOM'),
    (r'BLACKOUT D063', 'Shooters World Blackout'),
    (r'AR PLUS D073', 'Shooters World AR Plus'),
    (r'TACTICAL RIFLE D073', 'Shooters World Tactical Rifle'),
    (r'MATCH RIFLE D073', 'Shooters World Match Rifle'),
    (r'PRECISION RIFLE S062', 'Shooters World Precision'),
    (r'LONG RIFLE S065', 'Shooters World Long Rifle'),
    (r'SW4350 S070', 'Shooters World SW 4350'),
    (r'(?:SW ?)?50 ?BMG|D100', 'Shooters World SW50BMG'),
]
NUM = re.compile(r'^(?:\d{1,2}(?:,\d{3})+|\d+(?:\.\d+)?C?|\.\d+|N/A)$')   # « 26C » : charge comprimée
COLONNES = ['coal_in', 'start_gr', 'start_fps', 'max_gr', 'max_fps', 'max_psi']


def mots_par_page(pdf):
    out = subprocess.run(['pdftotext', '-bbox', pdf, '-'], capture_output=True, text=True).stdout
    pages = []
    for p in re.split(r'<page ', out)[1:]:
        mots = [(float(a), float(b), float(c), float(d), html.unescape(t)) for a, b, c, d, t in
                re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', p)]
        pages.append(mots)
    return pages


def lignes(mots, tol=2.5):
    """Regroupe les mots en lignes par le milieu de leur hauteur."""
    out = []
    for m in sorted(mots, key=lambda m: ((m[1] + m[3]) / 2, m[0])):
        y = (m[1] + m[3]) / 2
        if out and abs(out[-1]['y'] - y) <= tol:
            out[-1]['mots'].append(m)
            out[-1]['y'] = (out[-1]['y'] * (len(out[-1]['mots']) - 1) + y) / len(out[-1]['mots'])
        else:
            out.append({'y': y, 'mots': [m]})
    for l in out:
        l['mots'].sort(key=lambda m: m[0])
        l['texte'] = ' '.join(m[4] for m in l['mots'])
    return out


def nombre(s):
    if s in (None, '', 'N/A'):
        return None
    return float(s.replace(',', ''))


def page_tableau(mots, poudre_courante):
    L = lignes(mots)
    titre = next((l for l in L if re.search(r'RELOAD DATA|POWDER SBR|Competition Data', l['texte'])), None)
    poudre = poudre_courante
    if titre:
        poudre = next((k for motif, k in POUDRES if re.search(motif, titre['texte'], re.I)), None) or 'INCONNUE:' + titre['texte']
    # en-tête : la ligne qui porte « Caliber »
    tete = next((l for l in L if any(m[4] in ('Caliber', 'CALIBER') for m in l['mots'])), None)
    if tete is None:
        return poudre, []
    c_case = next(((m[0] + m[2]) / 2 for m in tete['mots'] if m[4].startswith('Case')), None)
    if c_case is None:
        return poudre, [{'erreur': 'colonne Case introuvable', 'texte': tete['texte']}]
    # colonnes numériques : centres des mots d'en-tête dans la bande de l'en-tête (± 14 pt)
    bande = [m for l in L if abs(l['y'] - tete['y']) <= 14 for m in l['mots']]
    def centre(mots):
        return sum((m[0] + m[2]) / 2 for m in mots) / len(mots)
    cols = {}
    # « Power Factor » (données de compétition, p. 49) : colonne lue pour être écartée
    for nom, cles in (('coal_in', ('Load', 'Length')), ('pression', ('Pressure', 'Pressure,', '(PSI)', 'PSI', 'Press', 'sure,')),
                      ('facteur', ('Power', 'Factor'))):
        ms = [m for m in bande if m[4] in cles]
        if ms:
            cols[nom] = centre(ms)
    charges = sorted([m for m in bande if m[4] == 'Charge'], key=lambda m: m[0])
    vitesses = sorted([m for m in bande if m[4] in ('Velocity', 'Vel')], key=lambda m: m[0])
    if len(charges) >= 2 and len(vitesses) >= 2:
        cols['start_gr'], cols['max_gr'] = centre([charges[0]]), centre([charges[-1]])
        cols['start_fps'], cols['max_fps'] = centre([vitesses[0]]), centre([vitesses[-1]])
    x_num = min(cols.values()) - 18 if cols else None
    if x_num is None or 'pression' not in cols:
        return poudre, [{'erreur': 'en-tête illisible', 'texte': tete['texte']}]
    cols['max_psi'] = cols.pop('pression')
    x_num = min(cols.values()) - 18
    corps = [l for l in L if l['y'] > tete['y'] + 14]
    ancres = []
    for l in corps:
        nums = [m for m in l['mots'] if m[0] >= x_num and NUM.match(m[4])]
        if len(nums) >= 5:
            ancres.append(l)
    lignes_out = []
    for a in ancres:
        rec = {k: None for k in COLONNES}
        rec['comprimee'] = False
        for m in [m for m in a['mots'] if m[0] >= x_num and NUM.match(m[4])]:
            c = min(cols, key=lambda k: abs(cols[k] - (m[0] + m[2]) / 2))
            if c == 'facteur':
                continue
            v = m[4]
            if v.endswith('C'):
                rec['comprimee'], v = True, v[:-1]
            rec[c] = v if rec[c] is None else rec[c] + ' ' + v
        rec['_y'] = a['y']
        rec['_texte'] = {'cal': [], 'case': [], 'proj': [], 'notes': []}
        lignes_out.append(rec)
    if not lignes_out:
        return poudre, []
    # texte : chaque ligne du corps (ancres comprises) va à l'ancre la plus proche
    for l in corps:
        if l['y'] > ancres[-1]['y'] + 40 or l['y'] > 590 or '=' in l['texte']:
            continue                                     # pied de page, notes de bas de tableau
        rec = min(lignes_out, key=lambda r: abs(r['_y'] - l['y']))
        if abs(rec['_y'] - l['y']) > 26:
            continue
        for m in l['mots']:
            xm, c = m[0], (m[0] + m[2]) / 2
            if m[4] in ('RIFLE', 'HANDGUN', 'SHOTGUN', '/', 'DATA'):
                continue                                 # onglets de page
            if re.fullmatch(r'\d{1,2}', m[4]) and len(l['mots']) == 1 and l['y'] > 560:
                continue                                 # numéro de page, seul en bas de page ; « 38 » de « 38 / Special » reste
            if xm >= x_num:
                if not NUM.match(m[4]):
                    rec['_texte']['notes'].append(m[4])
                continue
            if abs(c - c_case) <= 22:
                rec['_texte']['case'].append((l['y'], xm, m[4]))
            elif c < c_case:
                rec['_texte']['cal'].append((l['y'], xm, m[4]))
            else:
                rec['_texte']['proj'].append((l['y'], xm, m[4]))
    out = []
    precedente = None
    for r in lignes_out:
        t = r.pop('_texte')
        # canon d'essai noté dans la colonne de la cartouche (« *24-inch Test Barrel », « (22" barrel) »),
        # parfois entremêlé aux lignes du nom de la cartouche
        canon = None
        for k in ('cal', 'proj'):
            garde = []
            for y, xx, w in t[k]:
                mb = re.match(r'^\*?\(?(\d{2})(?:-inch|"|”)$', w)
                if mb:
                    canon = int(mb.group(1))
                elif w.strip('()*') in ('Test', 'Barrel', 'barrel'):
                    continue
                else:
                    garde.append((y, xx, w))
            t[k] = garde
        join = lambda ws: re.sub(r'(\w)- (\w)', r'\1\2', ' '.join(w for _, _, w in sorted(ws)))
        cal, case, proj = join(t['cal']), join(t['case']), join(t['proj'])
        notes = ' '.join(t['notes'])
        g = re.search(r'(\d{2,3})\s*(?:gr\b|grain|gr\.|grs?\b)', proj) or re.match(r'^(\d{2,3})\b', proj)
        # « (22" barrel) », « *45" Test Barrel » seuls dans la case de la cartouche : la ligne prolonge la
        # précédente (7,62 mm NATO, .50 BMG), avec ce canon (lu en image le 2026-10-12, p. 35 et 46).
        if not cal and precedente:
            cal = precedente
        precedente = cal
        out.append(dict(poudre=poudre, cartouche=cal, etui=case, balle=proj, comprimee=r['comprimee'],
                        balle_gr=int(g.group(1)) if g else None,
                        canon_in=canon,
                        notes=notes or None,
                        **{k: nombre(r[k]) if r[k] and ' ' not in r[k] else (r[k] and 'DOUBLE:' + r[k]) for k in COLONNES}))
    return poudre, out


def main():
    pdf = sys.argv[1]
    pages = mots_par_page(pdf)
    poudre, toutes = None, []
    for i, mots in enumerate(pages, start=1):
        poudre, rows = page_tableau(mots, poudre)
        for r in rows:
            r['page_pdf'] = i
        if '--debug' in sys.argv and str(i) == sys.argv[sys.argv.index('--debug') + 1]:
            for r in rows:
                print(r)
        toutes += rows
    # contrôle : lignes à au moins cinq nombres dans le texte mis en page, par page
    lay = subprocess.run(['pdftotext', '-layout', pdf, '-'], capture_output=True, text=True).stdout.split('\f')
    ecarts = []
    for i, t in enumerate(lay, start=1):
        n_lay = sum(1 for l in t.split('\n')
                    if len(re.findall(r'(?<![\w.])(?:\d{1,2},\d{3}|\d+\.\d+|\d{3,4}|N/A)(?![\w])', l)) >= 5
                    and re.search(r'\d\.\d', l) and not re.search(r'Hull|Wad|oz\b|Bushing', l))
        n_parse = sum(1 for r in toutes if r['page_pdf'] == i)
        if n_lay != n_parse:
            ecarts.append((i, n_lay, n_parse))
    doc = {'_doc': "Guide Shooters World (poudres Explosia/Lovex), données de charge SAAMI : charge de départ et "
                   "maximale avec vitesses, pression maximale en psi. LOCAL/gitignore, non redistribué. Produit par "
                   "scripts/parse_shooters_world.py (coordonnées des mots, pdftotext -bbox).",
           '_source': os.path.basename(pdf), 'rows': toutes}
    with open(SORTIE, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    print(f"{len(toutes)} lignes -> {os.path.relpath(SORTIE, ICI)}")
    for i, a, b in ecarts:
        print(f"  page {i} : {a} lignes à cinq nombres dans le texte mis en page, {b} lignes relevées")


if __name__ == '__main__':
    main()
