# Base de données GRT — provenance & licence

Données de composants pour le simulateur de balistique intérieure (compilées en
`../grt_db.json` par `../compile_db.php`). Contenu actuel :

| Type | Fichiers |
|---|---|
| `calibers/` (`.caliber`) | 48 |
| `projectiles/` (`.projectile`) | 181 |
| `powders/` (`.propellant`) | 32 |
| `loads/` (`.grtload`) | 7 |

## Provenance

- **Calibres, charges (loads) et fonds de poudres/projectiles** : dépôt
  communautaire **[zen/grt_databases](https://github.com/zen/grt_databases)**,
  publié sous **CC0 1.0** (domaine public). Voir `LICENSE`.
- **Poudres et projectiles complémentaires** : fichiers **partagés par la
  communauté Gordon's Reloading Tool** (canal Discord), dont le **pack officiel
  Reload Swiss** (`RS 12`…`RS 80`). L'attribution d'origine est **conservée**
  dans le nom des fichiers et dans les champs XML (`cby`, `mby`, `origin`).

Doublons **strictement identiques** (octet pour octet) retirés ; toutes les
variantes distinctes sont conservées.

## Dernière synchronisation

| Source | Date de l'export | Fichier d'origine |
|---|---|---|
| Projectiles communauté GRT | 2026-08-14 (00:40 UTC) | `Projectiles-20260814T004027Z-1-001.zip` |
| Poudres communauté GRT | 2026-08-14 (00:40 UTC) | `Propellants-20260814T004057Z-1-001.zip` |
| Pack officiel Reload Swiss | 2023-08-21 | `Reload-Swiss-GRT.zip` (`GRT_RS_Propellant_Files_RS_2023_08_21/`) |

Comparés le 2026-10-03 : tout le contenu de ces exports est dans la base, sauf
deux variantes de projectiles écartées volontairement — `Hornady_ELD-VT_24372`
du 2023-12-02 (la version du 2024-04-13, documentée « Lot 24372 », est gardée)
et une troisième version de `Sierra_HPBT_MK_1755` (grtuser, 2023-04-30) qui ne
diffère que par la géométrie du culot.

Pour la prochaine mise à jour, seuls les fichiers dont `cdate` ou `mdate` est
postérieur au 2026-08-14 sont à examiner.

## Licence & avertissement

- Les données issues de zen/grt_databases sont en **CC0 1.0** (`LICENSE`).
- Les fichiers communautaires sont redistribués **dans le même esprit de partage
  communautaire GRT**, attribution préservée.
- **Aucune garantie d'exactitude.** Comme le rappellent GRT et la source amont :
  *« Measurements have to be verified! »*. En particulier, **la capacité d'étui
  et la longueur de balle doivent toujours être mesurées**. Ces données servent à
  un outil **indicatif/pédagogique** — ne développez jamais une charge réelle sur
  leur seule base (voir l'avertissement de l'outil et `../ROADMAP.md`, Phase 6).
