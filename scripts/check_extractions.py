#!/usr/bin/env python3
"""
check_extractions.py — les fichiers de données servis sont-ils ceux que produisent les parseurs ACTUELS ?

Usage : python3 scripts/check_extractions.py [--detail]      (n'écrit rien dans data/ ; code 1 si écart)

POURQUOI. Le 2026-08-18, le parseur Sierra a été corrigé (en-têtes de vitesse décalés de 50 : pages entières
perdues) et rejoué sur les PDF présents. Deux fichiers ne l'ont pas été : la 6 mm BR Norma (PDF absent du
serveur) a servi 406 points sur 546 jusqu'au 2026-10-13, la 7,5 x 55 96 sur 138, sous un ancien nom de
fichier. Seul un nom de poudre inconnu (« Exterminator ») le laissait voir. Un correctif de parseur ne vaut
que si TOUS les fichiers de la source sont relus.

Méthode : copie de l'estimateur (scripts, data, modèles) dans un dossier temporaire, chaque parseur relancé
sur son guide, lignes comparées à celles du fichier servi (multiensemble, ordre indifférent). Signale aussi
tout fichier sierra_*, speer_*, loaddata_* sans source déclarée ici : un fichier orphelin est lu par
build_anchors.js comme les autres.
"""
import collections
import json
import os
import shutil
import subprocess
import sys
import tempfile

ICI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GUIDES = os.path.normpath(os.path.join(ICI, '..', 'guides'))
PRIVES = '/home/bastin/private_docs'          # PDF Sierra (voir l'en-tête de parse_sierra.js)

# fichier servi -> commande (relative à la copie ; {G} = guides, {P} = PDF privés, {T} = dossier temporaire)
SOURCES = {
    'western': ['node', 'scripts/import_western.js', '{G}/WesternPowdersHandloadingGuide8.0_WEB-1.pdf'],
    'adi': ['node', 'scripts/parse_adi.js', '{G}/ADI-Handloaders-guide-2013.pdf'],
    # pages en ligne d'ADI lues le 2026-10-15 (jeu de test, hors ancres) : un dossier, pas un PDF
    'adi_web': ['node', 'scripts/parse_adi_web.js', '{G}/adi_web_2026-10-15'],
    'alliant': ['node', 'scripts/parse_alliant.js', '{G}/Alliant_Powder_Reloaders_Guide_2012.pdf'],
    'hodgdon': ['node', 'scripts/parse_hodgdon.js', '{G}/AM24.pdf'],
    'lovex': ['node', 'scripts/parse_lovex.js', '{G}/LOVEX_Reloading-Guide_by_Explosia_2019.pdf'],
    'norma': ['node', 'scripts/parse_norma.js', '{G}/Norma-Reloading-Data-11-23.pdf'],
    'vectan': ['node', 'scripts/parse_vectan.js', '{G}/Vectan_Tables_de_Rechargement.pdf'],
    'shooters_world': ['python3', '-I', 'scripts/parse_shooters_world.py', '{G}/Shooters_World_Reloading_Guide.pdf'],
    'vihtavuori': ['node', 'scripts/parse_vihtavuori.js', '{T}/vv_bbox.html'],
    'rs_loads': ['node', 'scripts/01_parse_guide.js', '{T}/rs.txt'],
    'rs_dataset': ['node', 'scripts/02_build_dataset.js'],           # après rs_loads, dans la copie
    'nosler': ['python3', '-I', 'scripts/nosler_fiches.py', '--dossier', '{G}/nosler'],
    'lyman': ['node', 'scripts/parse_lyman.js', '{G}/Lyman Reloading Handbook - 48th Edition - 2002 - ocr.pdf'],
    'sierra_221remingtonfireball': ['node', 'scripts/parse_sierra.js', '{P}/sierra_221_remington_fireball_load_data.pdf', '221 Remington Fireball', '20'],
    'sierra_338normamag': ['node', 'scripts/parse_sierra.js', '{P}/sierra_338_norma_magnum_load_data.pdf', '338 Norma Mag.', '24'],
    'sierra_65x47lapua': ['node', 'scripts/parse_sierra.js', '{P}/sierra_6-5x47_lapua_load_data.pdf', '6.5 x 47 Lapua', '24'],
    'sierra_6mmbrnorma': ['node', 'scripts/parse_sierra.js', '{P}/sierra_6mm_br_norma_load_data.pdf', '6mm BR Norma', '24'],
    'sierra_75x55swiss': ['node', 'scripts/parse_sierra.js', '{P}/sierra_7-5x55_swiss_load_data.pdf', '7.5 x 55 Swiss', '30.7'],
    'sierra_762x39': ['node', 'scripts/parse_sierra.js', '{P}/sierra_7-62x39_load_data.pdf', '7.62 x 39', '18.5'],
}
# Étapes préalables : texte extrait des PDF que leur parseur lit sous cette forme.
PREALABLES = {
    'vihtavuori': ['pdftotext', '-bbox', '{G}/Vihtavuori_Reloading_Guide_2026_ENG_web.pdf', '{T}/vv_bbox.html'],
    'rs_loads': ['pdftotext', '-layout', '{G}/Reload-Swiss-Ladedaten-Guide-2025-DE-EN.pdf', '{T}/rs.txt'],
}
# Sources absentes du serveur (page ouverte par l'utilisateur, PDF non conservé) : non vérifiables, déclarées.
SANS_SOURCE = {'speer_6mmcreedmoor_100', 'loaddata_38special'}


def lignes(f):
    d = json.load(open(f, encoding='utf-8'))
    return d if isinstance(d, list) else d.get('rows') or []


def cles(f):
    return collections.Counter(json.dumps(r, sort_keys=True, ensure_ascii=False) for r in lignes(f))


def main():
    detail = '--detail' in sys.argv
    tmp = tempfile.mkdtemp(prefix='check_extractions_')
    copie = os.path.join(tmp, 'tireur_reloaded')
    try:
        os.makedirs(copie)
        for x in ('scripts', 'data'):
            shutil.copytree(os.path.join(ICI, x), os.path.join(copie, x), ignore=shutil.ignore_patterns('__pycache__'))
        for x in ('energy_model.js', 'velocity_model.js'):
            shutil.copy(os.path.join(ICI, x), copie)
        sub = lambda c: [a.replace('{G}', GUIDES).replace('{P}', PRIVES).replace('{T}', tmp) for a in c]
        ecarts, absents, ok = [], [], 0
        for nom, cmd in SOURCES.items():
            sortie = os.path.join(copie, 'data', nom + '.local.json')
            servi = os.path.join(ICI, 'data', nom + '.local.json')
            # entrées : PDF des guides, ou dossiers de pages (fiches Nosler, pages ADI en ligne)
            entrees = [a for a in sub(cmd) + sub(PREALABLES.get(nom, []))
                       if a.startswith((GUIDES, PRIVES)) and (a.endswith('.pdf') or '.' not in os.path.basename(a))]
            manque = [e for e in entrees if not os.path.exists(e)]
            if manque or not os.path.exists(servi):
                absents.append(f"{nom} : {'source absente ' + manque[0] if manque else 'fichier servi absent'}")
                continue
            os.remove(sortie) if os.path.exists(sortie) and nom != 'rs_dataset' else None
            if nom in PREALABLES:
                subprocess.run(sub(PREALABLES[nom]), cwd=copie, capture_output=True)
            r = subprocess.run(sub(cmd), cwd=copie, capture_output=True, text=True)
            if r.returncode or not os.path.exists(sortie):
                ecarts.append(f'{nom} : le parseur échoue (code {r.returncode}) — {(r.stderr or r.stdout).strip()[-200:]}')
                continue
            a, b = cles(servi), cles(sortie)
            seul_a, seul_b = sum((a - b).values()), sum((b - a).values())
            if seul_a or seul_b:
                ecarts.append(f'{nom} : servi {sum(a.values())} lignes, relu {sum(b.values())} '
                              f'({seul_a} seulement servies, {seul_b} seulement relues)')
            else:
                ok += 1
                if detail:
                    print(f'  {nom:28} à jour ({sum(a.values())} lignes)')
        # fichiers servis sans source déclarée ici
        connus = set(SOURCES) | SANS_SOURCE
        orphelins = sorted(f[:-len('.local.json')] for f in os.listdir(os.path.join(ICI, 'data'))
                           if f.endswith('.local.json') and f.startswith(('sierra_', 'speer_', 'loaddata_'))
                           and f[:-len('.local.json')] not in connus)
        for o in orphelins:
            ecarts.append(f'{o} : fichier servi sans source déclarée dans check_extractions.py (lu par build_anchors.js)')
        for e in ecarts + absents:
            print('  ' + e)
        bilan = (f"extractions des guides : {ok} fichier(s) à jour de leur parseur"
                 + (f", {len(ecarts)} écart(s)" if ecarts else '')
                 + (f", {len(absents)} non vérifiable(s)" if absents else '')
                 + f" ; sans source sur le serveur : {', '.join(sorted(SANS_SOURCE))}")
        print(bilan)
        return 1 if ecarts or absents else 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    sys.exit(main())
