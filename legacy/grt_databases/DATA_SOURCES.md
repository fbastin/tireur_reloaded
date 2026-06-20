# Base de données GRT — provenance & licence

Données de composants pour le simulateur de balistique intérieure (compilées en
`../grt_db.json` par `../compile_db.php`). Contenu actuel :

| Type | Fichiers |
|---|---|
| `calibers/` (`.caliber`) | 48 |
| `projectiles/` (`.projectile`) | 175 |
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

## Licence & avertissement

- Les données issues de zen/grt_databases sont en **CC0 1.0** (`LICENSE`).
- Les fichiers communautaires sont redistribués **dans le même esprit de partage
  communautaire GRT**, attribution préservée.
- **Aucune garantie d'exactitude.** Comme le rappellent GRT et la source amont :
  *« Measurements have to be verified! »*. En particulier, **la capacité d'étui
  et la longueur de balle doivent toujours être mesurées**. Ces données servent à
  un outil **indicatif/pédagogique** — ne développez jamais une charge réelle sur
  leur seule base (voir l'avertissement de l'outil et `../ROADMAP.md`, Phase 6).
