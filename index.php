<?php
$title = "Estimateur de balistique intérieure — Tireur.org";
$meta_description = "Estimateur de vitesse et de pression au rechargement par modèle énergie-efficacité, calé sur données fabricant et affinable sur vos propres mesures. Courbe pression/vitesse (Le Duc).";
include '../../header.php';
?>
<link rel="stylesheet" href="/rechargement/css/reloading.css?v=<?php echo filemtime($_SERVER['DOCUMENT_ROOT'].'/rechargement/css/reloading.css'); ?>" />
<script src="/js/vendor/plotly/plotly-2.35.2.min.js?v=2.35.2" charset="utf-8"></script>
<?php
// Scripts du modèle versionnés par leur date : sans paramètre, un navigateur peut garder des
// jours un ancien energy_model.js (servi sans Cache-Control) face à une page qui appelle une
// fonction ajoutée depuis — la page cassait chez les visiteurs réguliers (2026-10-10).
foreach (['energy_model.js', 'velocity_model.js', 'cartridge_diagram.js'] as $js) {
    echo '<script src="' . $js . '?v=' . filemtime(__DIR__ . '/' . $js) . '"></script>' . "\n";
}
?>

<style>
.vm-grid { display:grid; grid-template-columns: 340px 1fr; gap:1.5rem; margin-top:1rem; align-items:start; }
@media (max-width: 860px){ .vm-grid { grid-template-columns:1fr; } }
.vm-panel { background:var(--color-surface); border:1px solid var(--color-border); border-radius:var(--radius); padding:1rem; }
.vm-field { margin-bottom:0.7rem; }
.vm-field label { display:block; font-size:0.85rem; color:var(--color-text-light); margin-bottom:0.2rem; }
.vm-field input, .vm-field select { width:100%; padding:0.4rem 0.6rem; border:1px solid var(--color-border); border-radius:var(--radius); background:var(--color-bg); color:var(--color-text); }
.vm-unit { display:inline-block; cursor:pointer; font-size:0.72rem; font-weight:600; padding:0.02rem 0.4rem; border-radius:10px; background:var(--color-border); color:var(--color-text); user-select:none; }
.vm-unit:hover { background:var(--color-accent); color:#fff; }
.vm-out small.vm-unit { font-size:0.78rem; font-weight:600; }
.vm-out { font-size:1.6rem; font-weight:700; color:var(--color-link); }
.vm-out small { font-size:0.8rem; font-weight:400; color:var(--color-text-light); }
.vm-kpi { display:flex; gap:1.8rem; flex-wrap:wrap; margin:0.3rem 0 1rem; }
.vm-banner { background:rgba(231,76,60,0.07); border:1px solid #e74c3c; border-left:4px solid #e74c3c; border-radius:var(--radius); padding:0.8rem 1rem; font-size:0.88rem; margin-bottom:1rem; }
.vm-banner strong { color:#c0392b; }
.vm-note { font-size:0.82rem; color:var(--color-text-light); }
.vm-tag { display:inline-block; font-size:0.72rem; padding:0.1rem 0.5rem; border-radius:10px; background:var(--color-border); color:var(--color-text-light); }
.vm-tag.anchored { background:#2E5A1C; color:#fff; }
.vm-alert { border-radius:var(--radius); padding:0.55rem 0.9rem; font-size:0.9rem; margin-bottom:0.8rem; }
.vm-alert.danger { background:#fdecea; border:1px solid #e74c3c; border-left:5px solid #c0392b; color:#7d241c; }
.vm-alert.warn { background:#fef5e7; border:1px solid #e67e22; border-left:5px solid #e67e22; color:#7e5109; }
.vm-out.danger { color:#c0392b; }
.vm-out.warn { color:#e67e22; }
.vm-bar { height:8px; border-radius:4px; background:var(--color-border); overflow:hidden; margin:0.25rem 0; }
.vm-bar > span { display:block; height:100%; background:#9aa0a6; }
.vm-bar.warn > span { background:#e67e22; } .vm-bar.danger > span { background:#c0392b; }
.vm-print { background:var(--color-accent); color:#fff; border:none; border-radius:var(--radius); padding:0.35rem 0.8rem; cursor:pointer; font-size:0.85rem; }
.vm-btn2 { background:var(--color-bg); color:var(--color-text); border:1px solid var(--color-border); border-radius:var(--radius); padding:0.35rem 0.8rem; cursor:pointer; font-size:0.85rem; }
.vm-btn2:hover { border-color:var(--color-accent); color:var(--color-link); }
.vm-io { margin-top:0.5rem; display:flex; gap:0.4rem; flex-wrap:wrap; align-items:center; }
@media print { .vm-noprint { display:none !important; } .vm-grid { grid-template-columns:1fr 2fr; } .vm-panel { border:none; background:#fff; }
  /* Ladder : imprimé seulement s'il est développé ; on garde les tables, on masque les contrôles */
  #ladder:not([open]) { display:none !important; } #ladder { border:none; page-break-inside:avoid; }
  #ladder summary { font-weight:700; list-style:none; } #ladder summary::-webkit-details-marker { display:none; }
  #ladder .vm-field, #ladder textarea, #ladder button { display:none !important; } }
</style>

<div id="cadre">
<?php
$breadcrumb_links = [
    ['url' => '/index.php', 'label' => 'Accueil'],
    ['url' => '/techniques/balistique/', 'label' => 'Balistique'],
    ['label' => 'Estimateur de balistique intérieure'],
];
include $_SERVER['DOCUMENT_ROOT'] . '/includes/breadcrumb.php';
?>

<div class="page-title-row">
  <h1 class="lang-fr">Estimateur de balistique intérieure</h1>
  <h1 class="lang-en">Internal Ballistics Estimator</h1>
  <?php include $_SERVER['DOCUMENT_ROOT'] . '/includes/lang-toggle.php'; ?>
</div>

<p class="lang-fr">Modèle <strong>énergie-efficacité</strong> : la vitesse vient de l'énergie de la poudre via une efficacité
balistique η<sub>b</sub>, la pression d'une efficacité piézométrique η<sub>p</sub> — deux relations
<strong>calées sur plusieurs guides fabricant</strong> (Reload Swiss, Accurate/Ramshot, Vihtavuori),
sans la fonction de forme propriétaire de l'ancien solveur.
Base de composants dérivée de <em>Gordon's Reloading Tool</em> (Gordon †) et de la communauté (CC0).</p>
<p class="lang-en">An <strong>energy-efficiency</strong> model: velocity comes from the powder's energy through a ballistic
efficiency η<sub>b</sub>, pressure from a piezometric efficiency η<sub>p</sub> — two relations
<strong>fitted to several manufacturers' load manuals</strong> (Reload Swiss, Accurate/Ramshot, Vihtavuori),
without the proprietary form function of the former solver.
Component database derived from <em>Gordon's Reloading Tool</em> (Gordon †) and the community (CC0).</p>

<?php /* Chiffres du bandeau : validation du 2026-10-13 (docs/MODEL.md § 3.5, node
   scripts/fit_local_laws.js ; lois locales recalées sur les données corrigées ce jour, copies Hodgdon
   des lignes Western écartées), outil tel qu'il calcule, chaque balle prédite sans ses propres données.
   Pression : avec données fabricant 14,6 % d'écart quadratique, 7,8 % des charges sous-estimées de plus
   de 15 % ; à froid 25,4 % et 20,5 % ; centile 1 % : −37 % et −42 %. Vitesse : 3,4 % et 7,7 %. À froid, sur trois laboratoires qui n'ont pas
   servi au calage (scripts/pression_par_source.py, 2026-10-13) : une charge sur quatre sous-estimée de
   plus de 15 % (Lovex et Shooters World : une sur trois), biais −5 % ; au calage, une sur cinq.
   Vitesse recalculée le 2026-10-13 après la relecture Sierra : 3,3 % (29 795 charges) et 7,7 % (32 252) ; le
   2026-10-15, après les 278 lignes Vihtavuori retrouvées : 3,3 % (30 250) et 7,7 % (32 703).
   2026-10-15, charges subsoniques de carabine retirées des couples mixtes (build_anchors.js), lois publiées
   inchangées : pression avec données fabricant 13,1 %, 7,5 % sous-estimées de plus de 15 %, centile 1 % −35 % ;
   à froid 25,3 % et 20,2 %, centile 1 % −40 % ; vitesse 3,3 % (30 166 charges) et 7,6 % (32 609).
   2026-10-16, facteur du repli des carabines (scripts/fit_repli_carabine.js, énergie et η_p × 0,943) : vitesse à
   froid 7,0 % (32 609) ; pression à froid inchangée, celle tirée d'une vitesse connue +6 %. */ ?>
<div class="vm-banner lang-fr">
<strong>&#9888; Estimation, pas une donnée de sécurité.</strong> La <strong>vitesse</strong> est donnée à
~7&nbsp;% d'écart quadratique à froid, ~3&nbsp;% pour un couple cartouche/poudre marqué «&nbsp;●&nbsp;» (données
fabricant), et presque exacte avec votre vitesse mesurée. La <strong>pression</strong> n'est
qu'indicative&nbsp;: ~13&nbsp;% d'écart quadratique pour un couple «&nbsp;●&nbsp;» (~8&nbsp;% en carabine quand
les guides publient la pression et la masse de balle, ~21&nbsp;% en arme de poing), ~25&nbsp;% à froid.
Elle peut être <strong>sous-estimée</strong>&nbsp;: de plus de 15&nbsp;% pour une charge sur dix-huit avec
données fabricant (une sur cinq en arme de poing), une sur cinq sans — une sur trois pour des fabricants
dont les données n'ont pas servi au calage —, et de plus de 35&nbsp;% pour une charge sur cent. Une charge
réellement au-dessus de la limite C.I.P. peut donc s'afficher «&nbsp;sûre&nbsp;». D'une charge à l'autre,
la pression réelle peut monter plus vite que celle affichée (pente médiane d'une échelle de charge en
carabine&nbsp;: 2,8 chez Reload Swiss, 2,35 chez Hodgdon, contre 2,2 ici)&nbsp;: au-delà du maximum publié,
l'écart peut se creuser.
<strong>Votre vitesse mesurée ne corrige pas la pression&nbsp;:</strong> vitesse et pression sortent de
<em>deux</em> efficacités distinctes, et le chronographe n'en contraint qu'une. Vérifiez toujours dans
les données officielles du fabricant.
<a href="/wiki/doku.php?id=technique:balistique_interieure_validation">Validation &amp; limites &rarr;</a>
&middot; <a href="/wiki/doku.php?id=technique:donnees_balistiques">produire vos données &rarr;</a>
</div>
<div class="vm-banner lang-en">
<strong>&#9888; An estimate, not safety data.</strong> <strong>Velocity</strong> is given to ~7% root-mean-square error uncalibrated,
~3% for a cartridge/powder combination marked “●” (manufacturer data), and near-exact with your
measured velocity. <strong>Pressure</strong> is for indication only: ~13% root-mean-square error for a
“●” combination (~8% for a rifle when the manuals publish the pressure and the bullet weight, ~21% for a
handgun), ~25% uncalibrated. It can be <strong>underestimated</strong>: by more than 15% for one
load in eighteen with manufacturer data (one in five for handguns), one in five without — one in three for
manufacturers whose data were not used in the fit —, and by more than 35% for one load in a hundred. A load that is really above the C.I.P. limit can therefore be displayed as “safe”. From one
charge to the next, real pressure can rise faster than the displayed one (median slope of a rifle charge
ladder: 2.8 at Reload Swiss, 2.35 at Hodgdon, against 2.2 here): beyond the published maximum, the gap can
widen.
<strong>Your measured velocity does not correct the pressure:</strong> velocity and pressure come from
<em>two</em> distinct efficiencies, and your chronograph constrains only one of them. Always check
against the manufacturer's official load data.
<a href="/wiki/doku.php?id=technique:balistique_interieure_validation">Validation &amp; limits &rarr;</a>
&middot; <a href="/wiki/doku.php?id=technique:donnees_balistiques">producing your own data &rarr;</a> <small>(in French)</small>
</div>

<div class="vm-noprint" style="text-align:right;margin-bottom:0.3rem;"><button type="button" class="vm-print" onclick="window.print()">&#128424;&nbsp;<span class="lang-fr">Imprimer</span><span class="lang-en">Print</span></button></div>

<div class="vm-grid">
  <div class="vm-panel">
    <div class="vm-field"><label><span class="lang-fr">Préréglage système</span><span class="lang-en">Unit system preset</span></label>
      <select id="unitSystem" onchange="applySystem()">
        <option value="metric" data-en="International metric (g, mm, m/s, bar)">Métrique international (g, mm, m/s, bar)</option>
        <option value="imperial" data-en="Imperial (gr, in, fps, psi)">Impérial (gr, in, fps, psi)</option>
        <option value="mixed" selected data-en="Mixed (gr, mm, m/s, bar)">Hybride (gr, mm, m/s, bar)</option>
      </select></div>
    <div class="vm-field"><label><span class="lang-fr">Cartouche</span><span class="lang-en">Cartridge</span></label><select id="cart" onchange="onCart();applyStartLoad();renderDiag();calc()"></select></div>
    <div class="vm-field"><label><span class="lang-fr">Poudre</span><span class="lang-en">Powder</span> <select id="pwdSort" onchange="populatePowders()" style="float:right;width:auto;padding:0.05rem 0.3rem;font-size:0.74rem;">
        <option value="az" selected data-en="sort: A → Z">tri : A → Z</option>
        <option value="za" data-en="sort: Z → A">tri : Z → A</option>
        <option value="burn-fast" data-en="sort: fast → slow burning">tri : combustion rapide → lente</option>
        <option value="burn-slow" data-en="sort: slow → fast burning">tri : combustion lente → rapide</option>
      </select></label><select id="pwd" onchange="applyStartLoad();calc()"></select>
      <small class="vm-note" style="display:block;margin-top:.15rem;"><span class="lang-fr">« <strong>●</strong> » = données fabricant pour ce calibre (ancrage, vitesse à ~3 % + fenêtre ladder). Sans « ● » : estimation à froid, ladder non borné.</span><span class="lang-en">“<strong>●</strong>” = manufacturer data for this cartridge (anchoring, velocity to ~3%, + ladder window). Without “●”: uncalibrated estimate, unbounded ladder.</span></small></div>
    <div class="vm-field"><label><span class="lang-fr">Masse de balle</span><span class="lang-en">Bullet weight</span> <span class="vm-unit" id="u_mass" onclick="toggleU('mass')">gr</span></label><input type="number" id="m" value="150" step="1" oninput="calc()"></div>
    <div class="vm-field"><label><span class="lang-fr">Construction de la balle</span><span class="lang-en">Bullet construction</span></label><select id="mono" onchange="calc()">
        <option value="0" selected data-en="lead core (jacketed)">à noyau de plomb (chemisée)</option>
        <option value="1" data-en="monolithic (solid copper or brass)">monolithique (cuivre ou laiton massif)</option>
      </select></div>
    <div class="vm-field"><label><span class="lang-fr">Charge</span><span class="lang-en">Charge</span> <span class="vm-unit" id="u_charge" onclick="toggleU('charge')">gr</span> — <em class="lang-fr">charge de départ (min) pré-remplie ; augmentez prudemment</em><em class="lang-en">starting (minimum) charge pre-filled; work up carefully</em></label><input type="number" id="c" value="44" step="0.1" oninput="calc()"></div>
    <div class="vm-field"><label><span class="lang-fr">Longueur de canon</span><span class="lang-en">Barrel length</span> <span class="vm-unit" id="u_bbl" onclick="toggleU('bbl')">mm</span></label><input type="number" id="bbl" value="600" step="5" oninput="calc()"></div>
    <hr style="border:none;border-top:1px dashed var(--color-border);margin:0.6rem 0;">
    <div class="vm-field"><label><span class="lang-fr">Vitesse mesurée</span><span class="lang-en">Measured velocity</span> v&#8320; <span class="vm-unit" id="u_vmeas" onclick="toggleU('vmeas')">m/s</span> — <em class="lang-fr">optionnel, pour ancrer</em><em class="lang-en">optional, to anchor</em></label><input type="number" id="vmeas" placeholder="ex. 845" data-en-placeholder="e.g. 845" step="1" oninput="calc()"></div>
    <div class="vm-field"><label><span class="lang-fr">Température</span><span class="lang-en">Temperature</span> <span class="vm-unit" id="u_temp" onclick="toggleU('temp')">°C</span> — <em class="lang-fr">sensibilité thermique (Litz), réf. 21&nbsp;°C</em><em class="lang-en">temperature sensitivity (Litz), ref. 21&nbsp;°C</em></label><input type="number" id="temp" value="21" step="1" oninput="calc()"></div>
    <div class="vm-field"><label><span class="lang-fr">Volume d'étui</span><span class="lang-en">Case capacity</span> <span class="vm-unit" id="u_cvol" onclick="toggleCvolUnit()">cm³</span> — <em class="lang-fr">avancé ; vide = nominal · <a href="/wiki/doku.php?id=rechargement:volume_etui_pression" target="_blank" rel="noopener">comment mesurer ?</a></em><em class="lang-en">advanced; empty = nominal · <a href="/wiki/doku.php?id=rechargement:volume_etui_pression" target="_blank" rel="noopener">how to measure?</a> (in French)</em></label>
      <div style="display:flex;gap:.35rem;align-items:stretch;">
        <input type="number" id="cvol" placeholder="nominal" step="0.01" oninput="onCvol()" style="flex:1;min-width:0;">
        <select id="cvolMode" onchange="updateCvolPlaceholder();onCvol()" style="width:auto;padding:0.05rem 0.3rem;font-size:0.74rem;" title="utile = balle sertie (exact, méthode ogive dans l'eau) ; pleine = étui vide au ras (×facteur, approché)" data-en-title="usable = bullet seated (exact, water method with the bullet in place); full = empty case filled to the brim (×factor, approximate)">
          <option value="usable" selected data-en="usable (bullet seated)">utile (balle sertie)</option>
          <option value="full" data-en="full (empty case)">pleine (étui vide)</option>
        </select>
      </div></div>
    <p class="vm-note" id="derived"></p>
    <div class="vm-io vm-noprint">
      <button type="button" class="vm-btn2" onclick="exportEstimateur()" title="Télécharger la configuration (et les résultats) en CSV" data-en-title="Download the configuration (and results) as CSV">&#11015;&nbsp;<span class="lang-fr">Exporter CSV</span><span class="lang-en">Export CSV</span></button>
      <button type="button" class="vm-btn2" onclick="document.getElementById('impEst').click()" title="Charger une configuration depuis un CSV" data-en-title="Load a configuration from a CSV file">&#11014;&nbsp;<span class="lang-fr">Importer CSV</span><span class="lang-en">Import CSV</span></button>
      <input type="file" id="impEst" accept=".csv,text/csv" style="display:none" onchange="if(this.files[0]){importEstimateur(this.files[0]);this.value='';}">
    </div>
    <p class="vm-note vm-noprint lang-fr" style="margin-top:.3rem;">CSV <code>champ,valeur,unité</code> (lignes <code>#</code> = commentaires). À l'import, seules les <em>entrées</em> sont reprises ; vitesse et pression sont recalculées.</p>
    <p class="vm-note vm-noprint lang-en" style="margin-top:.3rem;">CSV <code>champ,valeur,unité</code> (field, value, unit — the keys stay in French so that files remain interchangeable; <code>#</code> lines = comments). On import, only the <em>inputs</em> are read back; velocity and pressure are recalculated.</p>
  </div>
  <div class="vm-panel">
    <div id="cartdiag" style="text-align:center;margin-bottom:0.6rem;"></div>
    <div id="danger" class="vm-alert" style="display:none;"></div>
    <div class="vm-kpi">
      <div><div class="vm-out"><span id="o_v">—</span> <small class="vm-unit" id="u_v" onclick="toggleU('v')">m/s</small></div><small><span class="lang-fr">vitesse</span><span class="lang-en">velocity</span> <span id="o_vtag" class="vm-tag">à froid ~7 %</span></small></div>
      <div><div class="vm-out" id="pbox"><span id="o_p">—</span> <small class="vm-unit" id="u_p" onclick="toggleU('p')">bar</small></div><small><span class="lang-fr">pression</span><span class="lang-en">pressure</span> <span class="vm-tag"><span class="lang-fr">indicative</span><span class="lang-en">indicative</span></span> <span id="o_pcip"></span></small>
        <div class="vm-bar" id="pbar"><span style="width:0"></span></div></div>
    </div>
    <div style="position:relative;">
      <div id="plot" style="width:100%;height:440px;cursor:zoom-in;"></div>
      <button type="button" id="plotZoom" class="vm-noprint" title="Agrandir le graphe (ou cliquez sur la courbe)" data-en-title="Enlarge the chart (or click on the curve)" onclick="openPlotModal()" style="position:absolute;top:4px;right:6px;border:1px solid var(--color-border);background:rgba(255,255,255,0.85);border-radius:4px;cursor:pointer;font-size:1rem;line-height:1;padding:.15rem .35rem;">&#9974;</button>
    </div>
    <p class="vm-note" id="warn"></p>
    <p class="vm-note"><span class="lang-fr">La courbe est celle de <a href="/wiki/doku.php?id=technique:formule_le_duc">Le Duc</a>, ajustée sur la vitesse et la pression estimées&nbsp;; la pression tracée est celle de la chambre (gradient de Lagrange). Après le pic, elle passe sous la pression réelle&nbsp;: n'en tirez pas la pression à la bouche (<a href="/wiki/doku.php?id=technique:formule_le_duc#domaine_de_validite">domaine de validité</a>).</span><span class="lang-en">The curve is the <a href="/wiki/doku.php?id=technique:formule_le_duc">Le Duc</a> curve, fitted on the estimated velocity and pressure; the pressure plotted is the chamber pressure (Lagrange gradient). After the peak, it falls below the real pressure: do not read the muzzle pressure off it (<a href="/wiki/doku.php?id=technique:formule_le_duc#domaine_de_validite">range of validity</a>, in French).</span></p>
    <div class="vm-noprint" style="margin-top:0.5rem">
      <button type="button" id="toExt" class="vm-print" onclick="toExterior()" disabled style="opacity:.5">&#127919;&nbsp;<span class="lang-fr">Vers la balistique extérieure</span><span class="lang-en">To external ballistics</span></button>
      <small class="vm-note" style="display:inline;margin-left:.4rem"><span class="lang-fr">envoie V₀, masse et calibre au calculateur de trajectoire (renseignez-y le CB et la longueur de balle)</span><span class="lang-en">sends V₀, bullet weight and calibre to the trajectory calculator (enter the BC and bullet length there)</span></small>
    </div>
  </div>
</div>

<p class="vm-note vm-noprint lang-fr" style="margin-top:1rem;">Approche complémentaire pour l'effet de la <strong>longueur de canon</strong> et de la <strong>température</strong> :
<a href="/techniques/balistique/velocite.php">estimateur de vitesse (loi de canon &amp; Le Duc)</a>.</p>
<p class="vm-note vm-noprint lang-en" style="margin-top:1rem;">A complementary approach for the effect of <strong>barrel length</strong> and <strong>temperature</strong>:
<a href="/techniques/balistique/velocite.php?lang=en">velocity estimator (barrel law &amp; Le Duc)</a>.</p>

<details id="ladder" style="margin-top:1.2rem;border:1px solid var(--color-border);border-radius:var(--radius);padding:0.4rem 1rem;">
<summary style="cursor:pointer;font-weight:600;"><span class="lang-fr">Ladder (développement de charge)</span><span class="lang-en">Ladder (load development)</span></summary>
<div style="font-size:0.9rem;">
<p class="vm-note lang-fr">L'estimateur <strong>planifie</strong> et <strong>borne</strong> votre ladder, et <strong>exploite</strong> vos vitesses mesurées. Il <strong>ne désigne pas</strong> le nœud : le modèle est lisse (pas d'harmoniques de canon) — c'est au tir + à la statistique (≥ 20 coups, SD/ES) de trancher. <a href="/wiki/doku.php?id=technique:rechargement_balistique">méthode ladder &rarr;</a></p>
<p class="vm-note lang-en">The estimator <strong>plans</strong> and <strong>bounds</strong> your ladder, and <strong>uses</strong> your measured velocities. It does <strong>not</strong> pick the node: the model is smooth (no barrel harmonics) — shooting plus statistics (≥ 20 shots, SD/ES) must decide. <a href="/wiki/doku.php?id=technique:rechargement_balistique">ladder method &rarr;</a> <small>(in French)</small></p>
<h4 style="margin:.6rem 0 .2rem;"><span class="lang-fr">1. Plan — fenêtre sûre (charge de départ → max fabricant)</span><span class="lang-en">1. Plan — safe window (starting charge → manufacturer maximum)</span></h4>
<div style="display:flex;flex-wrap:wrap;gap:.6rem;align-items:flex-end;margin-bottom:.4rem;">
  <div class="vm-field" style="max-width:110px;margin:0;"><label>Min <span class="vm-unit" id="u_lad" onclick="toggleLadUnit()">gr</span></label><input type="number" id="ladMin" step="0.1" placeholder="fabricant" data-en-placeholder="manufacturer" oninput="calc()"></div>
  <div class="vm-field" style="max-width:110px;margin:0;"><label><span class="lang-fr">Départ</span><span class="lang-en">Start</span></label><input type="number" id="ladStart" step="0.1" placeholder="= min" oninput="calc()"></div>
  <div class="vm-field" style="max-width:110px;margin:0;"><label>Max</label><input type="number" id="ladMax" step="0.1" placeholder="fabricant" data-en-placeholder="manufacturer" oninput="calc()"></div>
  <div class="vm-field" style="max-width:110px;margin:0;"><label><span class="lang-fr">Incrément</span><span class="lang-en">Step</span></label><input type="number" id="ladStep" value="0.2" step="0.05" min="0.01" oninput="calc()"></div>
  <label style="font-size:.8rem;display:flex;align-items:center;gap:.3rem;cursor:pointer;"><input type="checkbox" id="ladPlot" onchange="calc()"> <span class="lang-fr">courbes du ladder sur le graphe</span><span class="lang-en">ladder curves on the chart</span></label>
</div>
<div id="ladTable" style="overflow-x:auto;"></div>
<h4 style="margin:.8rem 0 .2rem;"><span class="lang-fr">2. Exploiter — vos vitesses mesurées (ancrage carabine)</span><span class="lang-en">2. Use — your measured velocities (rifle anchoring)</span></h4>
<p class="vm-note lang-fr">Une ligne par tir : <code>charge,vitesse</code> (unités courantes). L'outil cale l'efficacité de <em>votre</em> carabine et compare mesuré vs courbe lisse.</p>
<p class="vm-note lang-en">One line per shot: <code>charge,velocity</code> (current units). The tool fits the efficiency of <em>your</em> rifle and compares measured values with the smooth curve.</p>
<textarea id="ladMeas" rows="5" style="width:100%;font-family:monospace;font-size:0.82rem;" placeholder="41.0, 845&#10;41.2, 851&#10;41.4, 858&#10;..." oninput="fitLadder()"></textarea>
<div id="ladFit" style="margin-top:0.4rem;"></div>
<div class="vm-io vm-noprint">
  <button type="button" class="vm-btn2" onclick="exportLadder()" title="Télécharger les mesures en CSV" data-en-title="Download the measurements as CSV">&#11015;&nbsp;<span class="lang-fr">Exporter CSV</span><span class="lang-en">Export CSV</span></button>
  <button type="button" class="vm-btn2" onclick="document.getElementById('impLad').click()" title="Charger des mesures depuis un CSV" data-en-title="Load measurements from a CSV file">&#11014;&nbsp;<span class="lang-fr">Importer CSV</span><span class="lang-en">Import CSV</span></button>
  <input type="file" id="impLad" accept=".csv,text/csv" style="display:none" onchange="if(this.files[0]){importLadder(this.files[0]);this.value='';}">
  <small class="vm-note"><span class="lang-fr">format : en-tête <code>charge,vitesse</code> puis une ligne par tir (valeurs dans les <strong>unités courantes</strong> ; lignes <code>#</code> ignorées)</span><span class="lang-en">format: header <code>charge,vitesse</code> then one line per shot (values in the <strong>current units</strong>; <code>#</code> lines ignored)</span></small>
</div>
</div>
</details>

<details id="howto" class="vm-howto vm-noprint" style="margin-top:1.2rem;border:1px solid var(--color-border);border-radius:var(--radius);padding:0.4rem 1rem;">
<summary style="cursor:pointer;font-weight:600;"><span class="lang-fr">Comment ça marche&nbsp;?</span><span class="lang-en">How does it work?</span></summary>
<div style="font-size:0.9rem;" class="lang-fr">
<p>L'estimateur n'effectue <strong>aucune simulation de combustion</strong> et n'utilise pas la « fonction de forme » propriétaire des logiciels fermés. Il repose sur deux <strong>efficacités</strong> physiquement interprétables, <strong>calées sur des données fabricant</strong>&nbsp;:</p>
<ul>
<li>la <strong>vitesse</strong> découle de l'énergie de la poudre via l'efficacité balistique η<sub>b</sub>&nbsp;;</li>
<li>la <strong>pression</strong> d'une efficacité piézométrique η<sub>p</sub> (sortie <strong>la plus incertaine</strong>, donnée à titre indicatif).</li>
</ul>
<p>La précision se resserre selon ce que vous lui fournissez&nbsp;:</p>
<ul>
<li><strong>à froid</strong> (cartouche + poudre + charge)&nbsp;: vitesse à <strong>~7&nbsp;%</strong> d'écart quadratique&nbsp;;</li>
<li><strong>ancré</strong> sur les données fabricant de votre couple cartouche/poudre&nbsp;: vitesse à <strong>~3&nbsp;%</strong>&nbsp;;</li>
<li><strong>avec votre vitesse mesurée</strong> au chronographe (champ ci-dessus)&nbsp;: vitesse <strong>quasi-exacte</strong>.</li>
</ul>
<p><strong>&#9888; Ces trois échelons ne valent que pour la vitesse.</strong> La pression reste
indicative quoi qu'on fournisse (~13&nbsp;% d'écart quadratique avec données fabricant, ~25&nbsp;% sans),
parce qu'elle sort d'une <em>autre</em> relation (efficacité
piézométrique) que la vitesse (efficacité balistique)&nbsp;: le chronographe cale la seconde et
ne dit rien de la première. Nous l'avons vérifié par trois chemins indépendants, dont la
similitude de Manning, où remonter à la pression depuis la vitesse <strong>amplifie l'erreur
d'un facteur 6,8</strong>. <em>Croire qu'une vitesse juste garantit une pression juste est la
manière la plus courante de se fabriquer une fausse marge de sécurité.</em></p>
<p>Pour un couple cartouche/poudre ancré, vitesse et pression suivent la <strong>charge</strong> et la
<strong>masse de balle</strong> selon des lois mesurées dans les guides&nbsp;: à charge égale, une balle
plus lourde donne une pression plus forte. D'une charge à l'autre, la pression affichée monte
pourtant moins vite qu'en réalité (pente de 2,0 contre 2,7 en médiane dans les guides)&nbsp;:
au-delà du maximum publié, l'écart joue contre vous. La <strong>température</strong> corrige la
vitesse (sensibilité générique de Litz) et la pression, supposée réagir comme à la variation de
charge équivalente.</p>
<p>Catalogue&nbsp;: <strong>~470 poudres</strong> (Reload Swiss, Accurate/Ramshot et Vihtavuori calibrées&nbsp;; autres marques en repli énergie effective). Les situations à risque (<strong>surpression vs limite CIP, surremplissage</strong>) sont signalées en couleur — à titre indicatif.</p>
<p><strong>Pour aller plus loin&nbsp;:</strong>
<a href="/wiki/doku.php?id=technique:balistique_interieure">théorie</a> ·
<a href="/wiki/doku.php?id=technique:balistique_interieure_validation">validation &amp; limites</a> ·
<a href="/wiki/doku.php?id=technique:donnees_balistiques">produire vos données</a> ·
<a href="/wiki/doku.php?id=technique:formule_le_duc">courbe de Le Duc</a> ·
<a href="https://github.com/fbastin/tireur_reloaded/blob/main/docs/MODEL.md" target="_blank" rel="noopener">description formelle du modèle (EN)</a>.</p>
</div>
<div style="font-size:0.9rem;" class="lang-en">
<p>The estimator runs <strong>no combustion simulation</strong> and does not use the proprietary “form function” of closed-source software. It rests on two physically interpretable <strong>efficiencies</strong>, <strong>fitted to manufacturers' data</strong>:</p>
<ul>
<li><strong>velocity</strong> follows from the powder's energy through the ballistic efficiency η<sub>b</sub>;</li>
<li><strong>pressure</strong> from a piezometric efficiency η<sub>p</sub> (the <strong>most uncertain</strong> output, given for indication only).</li>
</ul>
<p>Accuracy tightens with what you give it:</p>
<ul>
<li><strong>uncalibrated</strong> (cartridge + powder + charge): velocity to <strong>~7%</strong> root-mean-square error;</li>
<li><strong>anchored</strong> on the manufacturer's data for your cartridge/powder combination: velocity to <strong>~3%</strong>;</li>
<li><strong>with your measured velocity</strong> from a chronograph (field above): <strong>near-exact</strong> velocity.</li>
</ul>
<p><strong>&#9888; These three levels apply to velocity only.</strong> Pressure stays
indicative whatever you provide (~13% root-mean-square error with manufacturer data, ~25% without),
because it comes from a <em>different</em> relation (piezometric
efficiency) than velocity (ballistic efficiency): the chronograph calibrates the latter and
says nothing about the former. We checked this along three independent paths, including
Manning similitude, where working back from velocity to pressure <strong>amplifies the error
by a factor of 6.8</strong>. <em>Believing that a correct velocity guarantees a correct pressure is the
most common way of building a false safety margin.</em></p>
<p>For an anchored cartridge/powder combination, velocity and pressure follow the <strong>charge</strong>
and the <strong>bullet weight</strong> through laws measured in the manuals: at equal charge, a heavier
bullet gives a higher pressure. From one charge to the next, however, the displayed pressure rises
more slowly than in reality (slope 2.0 against a median of 2.7 in the manuals): beyond the
published maximum, the difference works against you. <strong>Temperature</strong> corrects velocity
(Litz's generic sensitivity) and pressure, assumed to react as to the equivalent change of charge.</p>
<p>Catalogue: <strong>~470 powders</strong> (Reload Swiss, Accurate/Ramshot and Vihtavuori calibrated; other brands fall back on an effective energy). Risky situations (<strong>overpressure against the C.I.P. limit, overfilling</strong>) are flagged in colour — for indication only.</p>
<p><strong>Further reading:</strong>
<a href="https://github.com/fbastin/tireur_reloaded/blob/main/docs/MODEL.md" target="_blank" rel="noopener">formal description of the model</a> ·
in French: <a href="/wiki/doku.php?id=technique:balistique_interieure">theory</a> ·
<a href="/wiki/doku.php?id=technique:balistique_interieure_validation">validation &amp; limits</a> ·
<a href="/wiki/doku.php?id=technique:donnees_balistiques">producing your own data</a> ·
<a href="/wiki/doku.php?id=technique:formule_le_duc">the Le Duc curve</a>.</p>
</div>
</details>

</div>

<div id="plotModal" class="vm-noprint" onclick="if(event.target===this)closePlotModal()" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:1000;align-items:center;justify-content:center;padding:2vh 2vw;">
  <div style="background:#fff;border-radius:8px;width:96vw;max-width:1150px;height:92vh;display:flex;flex-direction:column;box-shadow:0 12px 48px rgba(0,0,0,0.45);">
    <div style="display:flex;justify-content:space-between;align-items:center;padding:.5rem .8rem;border-bottom:1px solid #ddd;">
      <strong style="color:#222;"><span class="lang-fr">Pression / vitesse &mdash; vue agrandie</span><span class="lang-en">Pressure / velocity &mdash; enlarged view</span></strong>
      <button type="button" onclick="closePlotModal()" title="Fermer (Échap)" data-en-title="Close (Esc)" style="border:none;background:none;font-size:1.4rem;line-height:1;cursor:pointer;color:#444;">&times;</button>
    </div>
    <div id="plotBig" style="flex:1;min-height:0;"></div>
  </div>
</div>

<script>
// --- Langue (FR/EN) : bascule commune du site, cf. /includes/lang-toggle.php ---
const L=()=>(window.siteLang?window.siteLang():'fr');
const T=(fr,en)=>L()==='en'?en:fr;
const nf=(x,d)=>L()==='en'?x.toFixed(d):x.toFixed(d).replace('.',',');   // nombre affiché dans une phrase
// Attributs et <option> fixes : data-en / data-en-title / data-en-placeholder.
function applyStaticLang(){
  document.querySelectorAll('option[data-en]').forEach(o=>{ if(!o.hasAttribute('data-fr')) o.setAttribute('data-fr',o.textContent); o.textContent=T(o.getAttribute('data-fr'),o.getAttribute('data-en')); });
  document.querySelectorAll('[data-en-title]').forEach(o=>{ if(!o.hasAttribute('data-fr-title')) o.setAttribute('data-fr-title',o.title); o.title=T(o.getAttribute('data-fr-title'),o.getAttribute('data-en-title')); });
  document.querySelectorAll('[data-en-placeholder]').forEach(o=>{ if(!o.hasAttribute('data-fr-placeholder')) o.setAttribute('data-fr-placeholder',o.placeholder); o.placeholder=T(o.getAttribute('data-fr-placeholder'),o.getAttribute('data-en-placeholder')); });
}
let CAL={}, PWD={}, COEF={}, ANCH={}, BRRANK={}, STARTC={}, STARTM={}, DIMS={}, RIFLE={eeff:null,n:0}, LAST=null;
let CVOL=null, CVOLUNIT='cm3';   // volume utile d'étui saisi (cm³ ; null = valeur nominale de la cartouche)
let LADUNIT='gr';                // unité de masse des champs du ladder (gr | g)
let LASTPLOT=null, PLOTBOUND=false;   // dernier graphe (data+layout) pour la vue agrandie
const G=6.479891e-5;
// --- Gestion des unités (mêmes conventions que la balistique extérieure) ---
const GR_G=0.06479891, IN_MM=25.4, MS_FPS=3.280839895, BAR_PSI=14.5037738;
const U={
  mass:  {cur:'gr',  opt:['gr','g'],    el:'m'},
  charge:{cur:'gr',  opt:['gr','g'],    el:'c'},
  bbl:   {cur:'mm',  opt:['mm','in'],   el:'bbl'},
  vmeas: {cur:'m/s', opt:['m/s','fps'], el:'vmeas'},
  temp:  {cur:'°C',  opt:['°C','°F'],   el:'temp'},
  v:     {cur:'m/s', opt:['m/s','fps']},      // sortie vitesse
  p:     {cur:'bar', opt:['bar','psi']},      // sortie pression
};
const toC=(v,u)=>u==='°F'? (v-32)*5/9 : v;     // °F/°C -> °C canonique
// vers les unités canoniques (gr, mm, m/s)
const toGr=(v,u)=>u==='g'?  v/GR_G : v;
const toMm=(v,u)=>u==='in'? v*IN_MM : v;
const toMs=(v,u)=>u==='fps'?v/MS_FPS: v;
// depuis les unités canoniques (gr/mm/m/s/bar) vers l'affichage
const frMm =(v,u)=>u==='in'? v/IN_MM  : v;
const frMs =(v,u)=>u==='fps'?v*MS_FPS : v;
const frBar=(v,u)=>u==='psi'?v*BAR_PSI: v;
const frChg=(gr)=>U.charge.cur==='g'? gr*GR_G : gr;          // charge gr -> unité d'affichage
function toggleU(k){
  const u=U[k], avant=u.cur; u.cur=u.opt[(u.opt.indexOf(u.cur)+1)%u.opt.length];
  if(k==='charge') ladderConvertir(0, x=>u.cur==='g'? toGr(x,avant)*GR_G : toGr(x,avant));
  if(k==='v')      ladderConvertir(1, x=>frMs(toMs(x,avant),u.cur));
  document.getElementById('u_'+k).textContent=u.cur;
  if(u.el){const el=document.getElementById(u.el),v=parseFloat(el.value);
    if(el.value!==''&&isFinite(v)){
      if(k==='mass')        el.value=(u.cur==='g'? v*GR_G : v/GR_G).toFixed(1);
      else if(k==='charge') el.value=(u.cur==='g'? v*GR_G : v/GR_G).toFixed(2);
      else if(k==='bbl')    el.value=(u.cur==='in'? v/IN_MM : v*IN_MM).toFixed(u.cur==='in'?1:0);
      else if(k==='vmeas')  el.value=(u.cur==='fps'? v*MS_FPS : v/MS_FPS).toFixed(0);
      else if(k==='temp')   el.value=(u.cur==='°F'? v*9/5+32 : (v-32)*5/9).toFixed(0);
    }
  }
  calc();
}
function applySystem(){
  const sys=document.getElementById('unitSystem').value;
  const want = sys==='metric'   ? {mass:'g', charge:'g', bbl:'mm', vmeas:'m/s', temp:'°C', v:'m/s', p:'bar'}
            : sys==='imperial' ? {mass:'gr',charge:'gr',bbl:'in', vmeas:'fps', temp:'°F', v:'fps', p:'psi'}
            :                    {mass:'gr',charge:'gr',bbl:'mm', vmeas:'m/s', temp:'°C', v:'m/s', p:'bar'}; // hybride
  Object.keys(want).forEach(k=>{ if(U[k].cur!==want[k]) toggleU(k); });
}
// Données revalidées à chaque chargement (304 si inchangées) : le serveur n'envoie pas de
// Cache-Control, et un navigateur peut garder plusieurs jours, sans la redemander, une copie
// vieille de quelques mois. C'est ainsi qu'une correction des charges de départ (2026-10-10)
// aurait mis des jours à atteindre les visiteurs.
const getData=(f)=>fetch('data/'+f,{cache:'no-cache'});
Promise.all([
  getData('calibers.json').then(r=>r.json()),
  getData('powders.json').then(r=>r.json()),
  getData('model_coefficients.json').then(r=>r.json()),
  getData('anchors.json').then(r=>r.json()).catch(()=>({anchors:{}})),
  getData('burn_rate_chart.txt').then(r=>r.text()).catch(()=>''),   // classement vitesse de combustion (optionnel)
  getData('start_charges.local.json').then(r=>r.json()).catch(()=>({charges:{}})), // charges de départ (optionnel, live)
  getData('cartridge_dims.json').then(r=>r.json()).catch(()=>({dims:{}})), // cotes pour le schéma (optionnel)
]).then(([cal,pwd,coef,anc,brTxt,sc,cd])=>{
  CAL=cal.calibers; PWD=pwd.powders; COEF=coef; ANCH=anc.anchors||{}; STARTC=sc.charges||{}; STARTM=sc.fenetres_masse||{}; DIMS=cd.dims||{};
  const cs=document.getElementById('cart');
  const byName=(a,b)=>a.localeCompare(b,'fr',{numeric:true});
  [['Armes longues','Rifles','rifle'],['Armes de poing','Handguns','handgun']].forEach(([label,labelEn,type])=>{
    const keys=Object.keys(CAL).filter(k=>(CAL[k].type||'rifle')===type).sort(byName);
    if(!keys.length) return;
    const og=document.createElement('optgroup'); og.label=T(label,labelEn); og.dataset.labelFr=label; og.dataset.labelEn=labelEn;   // pas data-en : applyStaticLang réécrirait le texte, et viderait le groupe
    keys.forEach(k=>{const o=document.createElement('option');o.value=k;o.textContent=k;og.appendChild(o);});
    cs.appendChild(og);
  });
  cs.value='308 Win.';
  // rang de vitesse de combustion (rapide -> lente) depuis burn_rate_chart.txt (optionnel)
  const pnorm=(s)=>String(s).toLowerCase().replace(/[^a-z0-9]/g,'');
  const pIdx={}; Object.keys(PWD).forEach(k=>{const p=PWD[k];pIdx[pnorm(k)]=k;pIdx[pnorm((p.mfg||'')+(p.name||''))]=k;pIdx[pnorm(p.name||'')]=k;});
  BRRANK={}; (brTxt||'').split('\n').map(s=>s.trim()).filter(s=>s&&!s.startsWith('#')).forEach((nm,i)=>{const k=pIdx[pnorm(nm)]; if(k!=null&&BRRANK[k]==null) BRRANK[k]=i;});
  // si le tri par combustion n'a aucune donnée, masquer ces options
  if(!Object.keys(BRRANK).length){[...document.querySelectorAll('#pwdSort option')].forEach(o=>{if(o.value.startsWith('burn'))o.remove();});}
  populatePowders('RS52');
  applyStaticLang();
  onCart(); applyStartLoad(); renderDiag(); calc();
});
// Changement de langue : tout ce que le script a écrit est réécrit dans la nouvelle langue.
document.addEventListener('site:langchange',()=>{
  applyStaticLang();
  document.querySelectorAll('#cart optgroup').forEach(g=>{ g.label=T(g.dataset.labelFr,g.dataset.labelEn); });
  populatePowders(); updateCvolPlaceholder(); renderDiag(); calc(); fitLadder();
});
// (re)peuple le menu poudres selon le tri choisi (#pwdSort), en conservant la sélection
function populatePowders(defaultSel){
  const ps=document.getElementById('pwd'); const keep=defaultSel||ps.value;
  const mode=document.getElementById('pwdSort').value;
  const pLabel=(k)=>{const p=PWD[k];return (p.mfg?p.mfg+' ':'')+(p.name||k);};
  const byName=(a,b)=>pLabel(a).localeCompare(pLabel(b),'fr',{numeric:true});
  // « ● » = données fabricant pour CE calibre (ancrage et/ou fenêtre de charge ladder).
  const ck=document.getElementById('cart').value;
  const hasData=(k)=> !!(ANCH[ck+'|'+k] || STARTC[ck+'|'+k]);
  const opt=(parent,k)=>{const o=document.createElement('option');o.value=k;o.textContent=(hasData(k)?'● ':'')+pLabel(k);parent.appendChild(o);};
  ps.innerHTML='';
  if(mode==='burn-fast'||mode==='burn-slow'){
    const fast=mode==='burn-fast';
    const ranked=Object.keys(PWD).filter(k=>BRRANK[k]!=null).sort((a,b)=>fast?BRRANK[a]-BRRANK[b]:BRRANK[b]-BRRANK[a]);
    const rest=Object.keys(PWD).filter(k=>BRRANK[k]==null).sort(byName);
    if(ranked.length){const g=document.createElement('optgroup');g.label=T('Vitesse de combustion ('+(fast?'rapide → lente':'lente → rapide')+')','Burning rate ('+(fast?'fast → slow':'slow → fast')+')');ranked.forEach(k=>opt(g,k));ps.appendChild(g);}
    const g2=document.createElement('optgroup');g2.label=T('Autres poudres (A → Z)','Other powders (A → Z)');rest.forEach(k=>opt(g2,k));ps.appendChild(g2);
  } else {
    const keys=Object.keys(PWD).sort(byName); if(mode==='za')keys.reverse();
    keys.forEach(k=>opt(ps,k));
  }
  if(keep&&PWD[keep])ps.value=keep;
}
// pré-remplit balle typique + charge de DÉPART (min fabricant réelle) au changement de couple
function applyStartLoad(){
  RIFLE.eeff=null;                                   // l'ancrage carabine (ladder) est propre au couple -> réinit
  const sc=STARTC[document.getElementById('cart').value+'|'+document.getElementById('pwd').value];
  if(sc){
    document.getElementById('m').value = U.mass.cur==='g' ? (sc.m*GR_G).toFixed(2) : sc.m;
    document.getElementById('c').value = U.charge.cur==='g' ? (sc.c*GR_G).toFixed(2) : sc.c;
  }
  setLadderDefaults();                               // pré-remplit Min/Départ du ladder (fenêtre fabricant)
}
// --- Ladder : planificateur (fenêtre sûre) + interprète (ancrage carabine) ---
// Longueur de canon de RÉFÉRENCE pour la PRESSION (tube d'essai). La pression de pic se
// forme près de la chambre et ne dépend quasi pas du canon réel : on l'évalue à une course
// fixe (champ `test_barrel_mm` de la cartouche, sinon défaut par type) pour que P_max ne
// dérive pas — à tort — avec la longueur de canon saisie. La vitesse, elle, reste calculée
// par η_b (geometry-free) ; l'effet du canon sur v0 relève de l'outil Le Duc dédié.
function refBbl(cart){ return cart.test_barrel_mm || (cart.type==='handgun'?122:600); }
// Source de la limite de pression. `pmax_src` n'est présent QUE si la valeur n'est pas
// celle des tables C.I.P. : absent = C.I.P., 'SAAMI' = standard SAAMI, toute autre
// valeur = limite sans normalisation (wildcat), à ne pas présenter comme officielle.
const limSrc=(c)=> !c || !c.pmax_src ? 'C.I.P.' : (c.pmax_src==='SAAMI' ? 'SAAMI' : T('estimée','estimated'));
// volume utile d'étui effectif (cm³) : saisie utilisateur si fournie, sinon nominal cartouche.
function effCV(cart){ return (CVOL>0 ? CVOL : cart.case_vol_cm3); }
// Volume d'étui saisi par l'utilisateur : facteurs sur l'énergie effective et sur η_p, par rapport
// au volume nominal (au nominal -> {e:1, np:1}).
//
// HYPOTHÈSE DE DENSITÉ DE CHARGEMENT (2026-10-13). À charge égale, un étui de volume utile V se
// comporte comme l'étui nominal V_n chargé de C·V_n/V : les efficacités suivent la charge
// équivalente par les lois locales, la masse de poudre reste la vraie. Avec r = V_n/V :
//     E_eff × r^δ   (v ∝ r^(δ/2))      et      P ∝ r^γ,   d'où   η_p × r^(δ − γ).
// Jusqu'à cette date, la page appliquait la pente du modèle à FROID (η_b·Qex ou E_eff et
// η_p(fill, Re)), une régression faite d'une cartouche et d'une poudre à l'autre, qui ne dit rien
// du volume à l'intérieur d'une cartouche : un étui 10 % plus petit faisait BAISSER la pression
// affichée de 0,7 % (.308 + Varget) au lieu de la faire monter. Le solveur physique hérité
// (legacy/grt_solver.js, combustion intégrée, volume de chambre explicite) donne, à charge égale,
// dlnP/dlnV = −2,1 à −2,3 et dln v/dlnV ≈ −0,4 à −0,5 (.308 + RS 52, 9 mm + RS 12) ; l'hypothèse
// donne −γ ≈ −2,0 et −δ/2 ≈ −0,43. Elle n'est pas validée sur des mesures : la page le dit.
function cvScales(cart,pw,C_gr){
  if(!(CVOL>0 && cart.case_vol_cm3>0 && COEF.local)) return {e:1,np:1};
  const r=cart.case_vol_cm3/CVOL, L=COEF.local;
  return { e: Math.pow(r,L.delta), np: Math.pow(r,L.delta-L.gamma) };
}
// Ancres du couple : celle du fabricant (énergie et η_p à un point de référence C, m) et, si
// l'utilisateur l'a demandé, celle de sa carabine (énergie seule, tirée de ses vitesses).
// fen : fenêtres par masse du couple (carabines à plafond de pression, loi à deux pentes).
function anchorsFor(ck,pk){ return { anc: ANCH[ck+'|'+pk]||null, rifle: RIFLE.eeff!=null ? RIFLE : null, fen: STARTM[ck+'|'+pk]||null }; }
// Exposant de la pression sur la vitesse quand la température change : on la traite comme la
// variation de charge équivalente, P ∝ v^(2γ/(δ+1)) par les lois locales (2 sans elles). C'est
// une HYPOTHÈSE, faute de mesures de pression en température dans nos données.
// Loi à deux pentes (dp) : la pente de charge est γL (bloc deux_pentes).
const penteCharge=(dp)=> dp&&COEF.deux_pentes ? COEF.deux_pentes.gammaL : (COEF.local ? COEF.local.gamma : 1);
const kTempP=(dp)=> COEF.local ? 2*penteCharge(dp)/(COEF.local.delta+1) : 2;
// Pente charge-pression du tableau (γ des lois locales), lue dans les coefficients : écrite en dur dans la note
// de l'échelle, elle était restée à 1,95 après le recalage du 2026-10-13 (1,99).
const penteP=(dp)=> penteCharge(dp).toFixed(1);
// Balle monolithique (cuivre, laiton massif) : facteurs du bloc `monolithique` des coefficients
// (scripts/fit_monolithique.js), appliqués par EnergyModel.energyAndEtaP.
const isMono=()=>document.getElementById('mono').value==='1';
// UNE prédiction pour l'affichage principal ET le tableau du ladder. Jusqu'au 2026-10-10 il y en
// avait deux copies, et le tableau ignorait la température. opt : {vmeas (m/s, au canon de
// l'utilisateur), Tc (°C), mono (balle monolithique)}.
function predict(cart,pw,m_gr,C_gr,bbl,an,opt){
  opt=opt||{};
  const d=cart.bore_mm/1000, A=Math.PI*d*d/4;
  const uT=(bbl-cart.case_mm)/1000, refTravel=(refBbl(cart)-cart.case_mm)/1000;  // course canon réel / référence
  const cv=effCV(cart), hasPcd=pw.pcd>0;
  const fill=hasPcd?(C_gr*GR_G/(pw.pcd/1000))/cv*100:null;
  const load={m_gr:m_gr,C_gr:C_gr,d_mm:cart.bore_mm,barrel_mm:bbl,case_mm:cart.case_mm};
  const loadP={m_gr:m_gr,C_gr:C_gr,d_mm:cart.bore_mm,barrel_mm:refBbl(cart),case_mm:cart.case_mm};
  const sc=(v,La,Lb)=>VelocityModel.scaleByBarrelFor(cart,v,La,Lb,cv);   // Powley (carabine) ou loi de puissance (poing)
  const S=cvScales(cart,pw,C_gr);                        // sensibilité au volume d'étui saisi (1,1 si nominal)
  // Énergie et η_p : ancre fabricant (lois locales comprises) ou modèle à froid. La pression est
  // évaluée au canon de RÉFÉRENCE (ln Re à la course de référence). Le tout au volume NOMINAL : le
  // volume saisi n'agit que par cvScales (S), une seule fois. Évalué au volume saisi, le modèle à
  // froid y ajoutait sa propre pente, que cvScales remplace (2026-10-13).
  const cvN=cart.case_vol_cm3, fillN=hasPcd?(C_gr*GR_G/(pw.pcd/1000))/cvN:null;
  const base=EnergyModel.energyAndEtaP(COEF,pw,fillN,Math.log(1+(A*refTravel)/(cvN*1e-6)),m_gr,C_gr,an.anc,opt.mono?cart.type:null,cart.type);
  let eta_p=base.np*S.np;
  let vRef,vUser,mode;
  if(opt.vmeas>0){                                       // vitesse MESURÉE au canon de l'utilisateur
    vUser=opt.vmeas; vRef=sc(vUser,uT,refTravel); mode='mesure';
  } else if(an.rifle){                                   // ancrage carabine : énergie au canon réel, avec son étui (pas de S.e)
    vUser=EnergyModel.velocityFromEnergy(load,an.rifle.eeff*EnergyModel.localE(COEF.local,C_gr,m_gr,an.rifle.C,an.rifle.m));
    vRef=sc(vUser,uT,refTravel); mode='carabine';
  } else {                                               // ancre fabricant ou à froid : vitesse au canon de référence
    vRef=EnergyModel.velocityFromEnergy(load,base.E*S.e); vUser=sc(vRef,refTravel,uT); mode=base.path;
  }
  let Pmax=EnergyModel.predictPmax(loadP,vRef,eta_p);   // bar — canon de référence
  // Loi à deux pentes (carabines, scripts/fit_deux_pentes.js, 2026-10-16) : pression rapportée à la plus petite
  // charge maximale publiée pour cette masse de balle, au plafond de pression du couple. Elle ne dépend ni de la
  // vitesse (prédite ou mesurée) ni de η_p ; η_p affiché = celui qu'elle implique. Volume d'étui saisi : même
  // hypothèse de densité de chargement que cvScales, avec γL. Balle monolithique : PAS de facteur, la charge maximale
  // publiée de la masse porte déjà la construction (fit_deux_pentes.js : +2,1 % sans facteur, +5,2 % avec).
  const win=an.fen?EnergyModel.fenetreMasse(an.fen,m_gr):null;
  const P2=EnergyModel.pressionDeuxPentes(COEF,an.anc,win,m_gr,C_gr,cart.type), deuxPentes=P2!=null;
  if(deuxPentes){
    const rV=(CVOL>0&&cart.case_vol_cm3>0&&COEF.local)?cart.case_vol_cm3/CVOL:1;
    Pmax=P2*Math.pow(rV,COEF.deux_pentes.gammaL);
    eta_p=EnergyModel.predictPmax(loadP,vRef,1)/Pmax;
  }
  // Température (réf. 21 °C), sur une vitesse PRÉDITE seulement : vitesse par la sensibilité de
  // Litz, pression par kTempP(). Jusqu'au 2026-10-10, la pression restait celle de 21 °C.
  let tempApplied=false;
  if(!(opt.vmeas>0) && isFinite(opt.Tc) && opt.Tc!==21){
    const vT=VelocityModel.tempCorrect(vUser,opt.Tc-21);
    Pmax*=Math.pow(vT/vUser,kTempP(deuxPentes)); vUser=vT; tempApplied=true;
  }
  return {v0:vUser,vRef,Pmax,eta_p,fill,pct:cart.pmax_cip_bar?Pmax/cart.pmax_cip_bar*100:null,mode,base,tempApplied,deuxPentes,win:deuxPentes?win:null};
}
// --- unité de masse du ladder (gr <-> g) ---
const ladToGr=(v)=> LADUNIT==='g' ? v/GR_G : v;           // saisie (LADUNIT) -> grains
const ladDisp=(gr)=> LADUNIT==='g' ? gr*GR_G : gr;        // grains -> affichage (LADUNIT)
function toggleLadUnit(){
  // Les quatre champs : Max était oublié, et 37,20 gr devenait 37,20 g (574 gr) au passage en grammes.
  const suivait=LADDEF!=null && ladChamps()===LADDEF;
  ['ladMin','ladStart','ladMax','ladStep'].forEach(id=>{const el=document.getElementById(id);const v=parseFloat(el.value);
    // Quatre décimales en grammes : avec trois, un aller-retour gr -> g -> gr déplaçait le max
    // de ±0,01 gr (42,40 revenait 42,39), assez pour fausser la comparaison au max fabricant.
    if(v>0) el.value=(LADUNIT==='gr'? v*GR_G : v/GR_G).toFixed(LADUNIT==='gr'?4:2);});
  LADUNIT = LADUNIT==='gr' ? 'g' : 'gr';
  if(suivait) LADDEF=ladChamps();
  document.getElementById('u_lad').textContent=LADUNIT;
  calc();
}
// Fenêtre fabricant de l'échelle : celle de la MASSE saisie quand elle existe (carabines à plafond de pression :
// fenêtres par masse, 2026-10-16), sinon la fenêtre typique du couple. {m, c, cmax, nb} ; c = null : charge de
// départ absente de nos données (Hodgdon, extrait sans sa colonne de départ). Avant, une balle de 190 gr recevait
// le maximum de la balle typique (168 gr), plus fort.
function fenetreLadder(){
  const ck=document.getElementById('cart').value, pk=document.getElementById('pwd').value, cart=CAL[ck];
  const m_gr=toGr(+document.getElementById('m').value,U.mass.cur);
  const wm=(cart&&cart.type==='rifle')?EnergyModel.fenetreMasse(STARTM[ck+'|'+pk],m_gr):null;
  return wm || STARTC[ck+'|'+pk] || null;
}
// pré-remplit Min/Départ depuis la fenêtre fabricant (au changement de couple)
let LADDEF=null;                                       // valeurs pré-remplies, tant que l'utilisateur n'y touche pas
const ladChamps=()=>['ladMin','ladStart','ladMax'].map(id=>document.getElementById(id).value).join('|');
function setLadderDefaults(){
  const sc=fenetreLadder();
  const dp=(gr)=>ladDisp(gr).toFixed(LADUNIT==='gr'?2:4);
  document.getElementById('ladMin').value   = sc&&sc.c!=null ? dp(sc.c) : '';
  document.getElementById('ladStart').value = sc&&sc.c!=null ? dp(sc.c) : '';
  document.getElementById('ladMax').value   = sc ? dp(sc.cmax) : '';
  LADDEF=ladChamps();
}
// La fenêtre dépend de la masse (fenêtres par masse, 2026-10-16) : quand la masse change, l'échelle suit, tant que
// ses champs gardent les valeurs pré-remplies. Sans cela, le maximum restait celui de la masse d'avant.
function suivreFenetre(){ if(LADDEF!=null && ladChamps()===LADDEF) setLadderDefaults(); }
// fenêtre effective (en GRAINS) : départ/min utilisateur, plafond = max fabricant (sécurité)
function ladderWindow(){
  const sc=fenetreLadder(), cur=toGr(+document.getElementById('c').value,U.charge.cur);
  let mfgMin,mfgMax,note;
  // Plusieurs balles de cette masse : départ et max sont ceux de la plus prudente (build_start_charges.js).
  const nbTxt=sc&&sc.nb>1?T(` ; ${sc.nb} balles de cette masse dans les guides : départ et max les plus bas`,`; ${sc.nb} bullets of this weight in the manuals: lowest start and lowest max`):'';
  if(sc&&sc.c!=null){ mfgMin=sc.c; mfgMax=sc.cmax; note=T('fenêtre fabricant ','manufacturer window ')+ladDisp(sc.c).toFixed(2)+'–'+ladDisp(sc.cmax).toFixed(2)+' '+LADUNIT+T(' (balle ',' (bullet ')+sc.m+' gr'+nbTxt+')'; }
  // départ inconnu : 5 % sous la charge saisie (bornée au max), comme sans données
  else if(sc){ mfgMin=Math.min(cur,sc.cmax)*0.95; mfgMax=sc.cmax; note=T('max fabricant ','manufacturer max ')+ladDisp(sc.cmax).toFixed(2)+' '+LADUNIT+T(' (balle ',' (bullet ')+sc.m+' gr'+nbTxt+T(') ; charge de départ absente de nos données : saisissez <strong>Min</strong>',') ; starting charge not in our data: enter <strong>Min</strong>'); }
  else { mfgMin=cur*0.95; mfgMax=cur; note=T('⚠ <strong>pas de données fabricant</strong> pour ce couple (poudre sans « ● ») — choisissez une poudre marquée ● ou saisissez <strong>Min / Max / Incrément</strong> à la main.','⚠ <strong>no manufacturer data</strong> for this combination (powder without “●”) — choose a powder marked ● or enter <strong>Min / Max / Step</strong> by hand.'); }
  const fMin=parseFloat(document.getElementById('ladMin').value), fStart=parseFloat(document.getElementById('ladStart').value),
        fMax=parseFloat(document.getElementById('ladMax').value), fStep=parseFloat(document.getElementById('ladStep').value);
  // Sans données fabricant, mfgMax n'est que la charge courante : la dépasser n'est pas sortir des données.
  const minG=fMin>0?ladToGr(fMin):mfgMin, cmax=fMax>0?ladToGr(fMax):mfgMax, over=!!sc&&cmax>mfgMax+1e-9;
  let startG=fStart>0?ladToGr(fStart):minG; startG=Math.max(minG,Math.min(startG,cmax));
  const stepG=fStep>0?ladToGr(fStep):0.2;
  return {minG,startG,cmax,stepG,mfgMax,over,note};
}
function ladderCharges(w){ const out=[]; const n=Math.min(60,Math.floor((w.cmax-w.startG)/w.stepG+1e-9));
  for(let i=0;i<=n;i++){ const Cg=w.startG+i*w.stepG; if(Cg>=w.cmax-1e-9){out.push(w.cmax);return out;} out.push(Cg); }
  if(out[out.length-1]<w.cmax-1e-9) out.push(w.cmax);   // garantit la charge max (plafond fabricant)
  return out; }
function renderLadder(){
  const el=document.getElementById('ladTable'); if(!el)return;
  const ck=document.getElementById('cart').value, pk=document.getElementById('pwd').value, cart=CAL[ck], pw=PWD[pk];
  if(!cart||!pw){el.innerHTML='';return;}
  const m_gr=toGr(+document.getElementById('m').value,U.mass.cur), bbl=toMm(+document.getElementById('bbl').value,U.bbl.cur);
  const w=ladderWindow();
  if(!(w.cmax>w.startG+1e-6&&w.stepG>0)){el.innerHTML='<p class="vm-note">'+w.note+T(' — plage trop étroite (départ ≥ max ou incrément nul).',' — range too narrow (start ≥ max or zero step).')+'</p>';return;}
  const an=anchorsFor(ck,pk), charges=ladderCharges(w), Tc=toC(parseFloat(document.getElementById('temp').value),U.temp.cur);
  let t='<table style="width:100%;border-collapse:collapse;font-size:0.82rem;"><tr style="text-align:right"><th style="text-align:left">'+T('Charge','Charge')+' ('+LADUNIT+')</th><th>v₀ ('+U.v.cur+')</th><th>Pmax ('+U.p.cur+')</th><th>% '+limSrc(cart)+'</th></tr>';
  let dp=false;                                          // loi à deux pentes sur ces lignes (pente de la note)
  for(const Cg of charges){ const r=predict(cart,pw,m_gr,Cg,bbl,an,{Tc,mono:isMono()}); if(r.deuxPentes) dp=true;
    const col=r.pct==null?'':(r.pct>100?'color:#c0392b;font-weight:600':r.pct>=85?'color:#e67e22':'');
    t+='<tr style="text-align:right;border-top:1px solid var(--color-border);'+col+'"><td style="text-align:left">'+ladDisp(Cg).toFixed(LADUNIT==='gr'?2:3)+'</td><td>'+frMs(r.v0,U.v.cur).toFixed(0)+'</td><td>'+frBar(r.Pmax,U.p.cur).toFixed(0)+'</td><td>'+(r.pct!=null?r.pct.toFixed(0)+'%':'—')+'</td></tr>'; }
  const overTxt = w.over ? ' <strong style="color:#c0392b">'+T('⚠ max saisi ','⚠ entered max ')+ladDisp(w.cmax).toFixed(2)+' '+LADUNIT+T(' &gt; max fabricant ',' &gt; manufacturer max ')+ladDisp(w.mfgMax).toFixed(2)+' '+LADUNIT+T(' — zone NON couverte par les données, danger.',' — range NOT covered by the data, danger.')+'</strong>' : '';
  el.innerHTML='<p class="vm-note">'+w.note+(an.rifle?T(' · <strong>ancré carabine</strong>',' · <strong>rifle-anchored</strong>'):'')+overTxt+' — Pmax/%'+limSrc(cart)+T(' indicatifs. D\'une charge à l\'autre, la pression réelle peut monter plus vite que celle du tableau (pente médiane départ → maximum : '+(cart.type==='handgun'?'2,5 chez Reload Swiss, 1,75 chez Hodgdon':'2,8 chez Reload Swiss, 2,35 chez Hodgdon')+', contre '+penteP(dp).replace('.',',')+' ici). Ne dépassez pas le max fabricant.',' for indication only. From one charge to the next, real pressure can rise faster than in this table (median slope from start to maximum: '+(cart.type==='handgun'?'2.5 at Reload Swiss, 1.75 at Hodgdon':'2.8 at Reload Swiss, 2.35 at Hodgdon')+', against '+penteP(dp)+' here). Do not exceed the manufacturer maximum.')+'</p>'+t+'</table>';
}
// Une ligne de mesures de l'échelle de charge -> [charge, vitesse] (nombres), ou null.
// Accepte « 41.0, 845 » (point décimal, virgule séparatrice : le format de l'exemple),
// « 41,2 851 » et « 41,2;851 » (virgule décimale à la française, séparateur espace,
// point-virgule ou tabulation). L'ancien découpage, sur [,; \t], faisait de « 41,2 851 »
// trois nombres, et de la charge 41,2 le point (41 ; 2) — sans rien signaler (2026-09-25).
function ladderLigne(l){
  l=String(l).replace(/^﻿/,'').trim().replace(/^"|"$/g,'');
  if(!l||l[0]==='#')return null;
  let parts;
  if(/[;\t]/.test(l)) parts=l.split(/\s*[;\t]\s*/).map(x=>x.replace(',','.'));
  else if(/\d,\d/.test(l) && !/\./.test(l) && /\s/.test(l)) parts=l.split(/\s+/).map(x=>x.replace(',','.'));
  else parts=l.split(/[,\s]+/);
  const a=parts.map(x=>parseFloat(x.replace(/^"|"$/g,'')));
  return (a.length>=2 && a[0]>0 && a[1]>0) ? [a[0],a[1]] : null;
}
function ladderPoints(){
  return document.getElementById('ladMeas').value.split('\n').map(ladderLigne).filter(Boolean);
}
// Réécrit les mesures saisies dans d'autres unités. Appelé quand l'unité de charge ou de
// vitesse change : sans cela, « 845 » restait 845 et passait de m/s à fps — E_eff chutait
// de 91 % au simple passage de l'affichage en impérial.
function ladderConvertir(col, f){
  const el=document.getElementById('ladMeas'); if(!el||!el.value.trim())return;
  const pts=ladderPoints(); if(!pts.length)return;
  // Charge au millième en grammes (0,015 gr), au centième en grains : 0,01 g vaut 0,15 gr,
  // l'ordre du pas d'une échelle — un aller-retour gr -> g -> gr ramenait 41 à 41,05.
  const dec=U.charge.cur==='g'?3:2;
  el.value=pts.map(a=>{ const b=a.slice(); b[col]=f(b[col]); return b[0].toFixed(dec).replace(/\.?0+$/,'')+', '+Math.round(b[1]); }).join('\n');
}
// Ancrage carabine : l'énergie effective de VOTRE arme, tirée de vos vitesses mesurées, ramenée
// à un point de référence (charge moyenne géométrique, masse de balle courante) par la loi de
// charge δ. Avant le 2026-10-10, une moyenne simple et une courbe lissée en √C : la courbe montait
// deux fois moins vite que les mesures, et l'écart mesuré/lissé mesurait surtout ce défaut.
function fitLadder(){
  const out=document.getElementById('ladFit'); if(!out)return;
  const m_gr=toGr(+document.getElementById('m').value,U.mass.cur), m=m_gr*G;
  const pts=ladderPoints().map(a=>({C:toGr(a[0],U.charge.cur), v:toMs(a[1],U.v.cur)}));
  if(pts.length<2){out.innerHTML=pts.length?'<p class="vm-note">'+T('Au moins 2 lignes valides nécessaires.','At least 2 valid lines are needed.')+'</p>':'';return;}
  const dl=(COEF.local&&COEF.local.delta)||0;
  const lc=pts.reduce((s,p)=>s+Math.log(p.C),0)/pts.length, Cref=Math.exp(lc);
  const eeff=Math.exp(pts.reduce((s,p)=>{const C=p.C*G,me=m+C/3;return s+Math.log(me*p.v*p.v/(2*C))-dl*(Math.log(p.C)-lc);},0)/pts.length);
  const vfit=(Cgr)=>{const C=Cgr*G,me=m+C/3;return Math.sqrt(2*eeff*Math.pow(Cgr/Cref,dl)*C/me);};
  const vmean=pts.reduce((s,p)=>s+p.v,0)/pts.length;
  const resid=pts.map(p=>p.v-vfit(p.C));
  const rms=Math.sqrt(resid.reduce((s,x)=>s+x*x,0)/resid.length);
  let t='<table style="width:100%;border-collapse:collapse;font-size:0.8rem;"><tr style="text-align:right"><th style="text-align:left">'+T('Charge','Charge')+'</th><th>'+T('v₀ mes.','v₀ meas.')+'</th><th>'+T('v₀ lissé','v₀ smoothed')+'</th><th>'+T('écart','diff.')+'</th></tr>';
  pts.forEach((p,i)=>{const vf=vfit(p.C);t+='<tr style="text-align:right;border-top:1px solid var(--color-border)"><td style="text-align:left">'+frChg(p.C).toFixed(2)+'</td><td>'+frMs(p.v,U.v.cur).toFixed(0)+'</td><td>'+frMs(vf,U.v.cur).toFixed(0)+'</td><td>'+(resid[i]>=0?'+':'')+frMs(resid[i],U.v.cur).toFixed(0)+'</td></tr>';});
  out.innerHTML='<p class="vm-note">'+T('E_eff carabine','Rifle E_eff')+' ≈ <strong>'+Math.round(eeff)+'&nbsp;J/kg</strong> '+T('à ','at ')+nf(frChg(Cref),2)+'&nbsp;'+U.charge.cur+' · '+T('écart mesuré/lissé','measured/smoothed deviation')+' <strong>'+nf(frMs(rms,U.v.cur),1)+'&nbsp;'+U.v.cur+'</strong> ('+nf(rms/vmean*100,1)+'%) — <em>'+T('proxy de consistance ; un vrai SD/ES exige des tirs répétés à charge fixe','a consistency proxy; a true SD/ES requires repeated shots at a fixed charge')+'</em>. '
    +'<button type="button" class="vm-print" onclick="applyRifle('+eeff.toFixed(1)+','+pts.length+','+Cref.toFixed(4)+','+m_gr.toFixed(2)+')">'+T('Ancrer cette carabine','Anchor this rifle')+'</button></p>'+t+'</table>';
}
function applyRifle(eeff,n,C,m){ RIFLE.eeff=eeff; RIFLE.n=n; RIFLE.C=C; RIFLE.m=m; calc(); renderLadder(); }
// passe la sortie (V₀ m/s, masse gr, calibre mm) au calculateur de balistique extérieure
function toExterior(){
  if(!LAST) return;
  const q=new URLSearchParams({mv:Math.round(LAST.v0),mass:LAST.m_gr.toFixed(1),cal:LAST.bore.toFixed(2)});
  window.open('/calculateur-balistique.php?'+q.toString(),'_blank','noopener');
}
// schéma coté de la cartouche sélectionnée (cotes exactes si dispo, sinon profil estimé)
function renderDiag(){
  const el=document.getElementById('cartdiag'); if(!el||typeof cartridgeDiagram!=='function')return;
  const n=document.getElementById('cart').value, cart=CAL[n];
  if(!cart){ el.innerHTML=''; return; }
  const svg=cartridgeDiagram(cart, DIMS[n]||null, 210);
  const num=(v,d)=> (v==null||!isFinite(v))?'—':(+v.toFixed(d)).toString();
  const rows=[
    ['Type', cart.type==='handgun'?T('Arme de poing','Handgun'):T('Carabine','Rifle')],
    [T('Ø balle','Bullet Ø'), num(cart.bore_mm,2)+' mm'],
    [T('Longueur d\'étui','Case length'), num(cart.case_mm,1)+' mm'],
    [T('Volume d\'étui','Case capacity'), cart.case_vol_cm3?num(cart.case_vol_cm3,2)+' cm³':'—'],
    [T('Pression max ','Max pressure ')+limSrc(cart), cart.pmax_cip_bar?num(cart.pmax_cip_bar,0)+' bar':'—'],
    [T('Canon d\'essai','Test barrel'), cart.test_barrel_mm?num(cart.test_barrel_mm,0)+' mm':'—'],
  ];
  const specs='<div style="flex:1 1 150px;min-width:150px;text-align:left;">'
    +'<div style="font-weight:700;color:var(--color-link);margin-bottom:0.35rem;">'+n+'</div>'
    +'<table style="font-size:0.82rem;border-collapse:collapse;width:100%;">'
    +rows.map(r=>'<tr><td style="color:var(--color-text-light);padding:0.13rem 0.6rem 0.13rem 0;white-space:nowrap;">'+r[0]+'</td><td style="text-align:right;font-weight:600;white-space:nowrap;">'+r[1]+'</td></tr>').join('')
    +'</table></div>';
  el.innerHTML='<div style="display:flex;gap:1rem;align-items:center;justify-content:center;flex-wrap:wrap;">'
    +'<div style="flex:0 0 auto;">'+svg+'</div>'+specs+'</div>';
}
function onCart(){ // défaut canon selon type (pistolet court)
  const c=CAL[document.getElementById('cart').value]; if(!c)return;
  const bbl_mm = c.type==='handgun' ? 122 : 600;
  document.getElementById('bbl').value = U.bbl.cur==='in' ? frMm(bbl_mm,'in').toFixed(1) : bbl_mm;
  CVOL=null; document.getElementById('cvol').value=''; updateCvolPlaceholder();   // volume perso propre à la cartouche
  populatePowders();                                  // rafraîchit les marqueurs « ● données » pour ce calibre
}
// volume utile d'étui : conversion gr H₂O ↔ cm³ (1 gr H₂O ≈ 0,0648 cm³), stockage interne en cm³.
// facteur capacité PLEINE (étui vide, au ras) -> capacité UTILE (balle sertie), par type d'arme.
// Carabine : 0,90, médiane du rapport volume utile de la base / capacité en eau mesurée par Peterson
// sur 21 cartouches à volume Reload Swiss (0,85 à 0,95 ; calibers/facteur_utile.py, 2026-10-12) — le
// facteur même qui a converti les capacités publiées de la base. La page gardait l'ancien 0,87 sans
// source : une capacité saisie « pleine » donnait un volume utile 3 % trop petit (corrigé le 2026-10-13).
// Arme de poing : 0,66, SANS SOURCE (aucune capacité pleine d'arme de poing relevée pour le caler).
function cvFullFactor(c){ return (c && c.type==='handgun') ? 0.66 : 0.90; }
function onCvol(){ const raw=parseFloat(document.getElementById('cvol').value);
  if(!(raw>0)){ CVOL=null; calc(); return; }
  let cm3 = (CVOLUNIT==='grh2o') ? raw*0.0648 : raw;            // -> cm³
  if(document.getElementById('cvolMode').value==='full') cm3 *= cvFullFactor(CAL[document.getElementById('cart').value]); // pleine -> utile
  CVOL = cm3; calc(); }
function toggleCvolUnit(){ const el=document.getElementById('cvol'), raw=parseFloat(el.value);
  CVOLUNIT = CVOLUNIT==='cm3' ? 'grh2o' : 'cm3';
  document.getElementById('u_cvol').textContent = CVOLUNIT==='cm3' ? 'cm³' : 'gr H₂O';
  if(raw>0) el.value = (CVOLUNIT==='grh2o' ? raw/0.0648 : raw*0.0648).toFixed(2);
  updateCvolPlaceholder(); }
function updateCvolPlaceholder(){ const c=CAL[document.getElementById('cart').value]; const el=document.getElementById('cvol'); if(!c||!el)return;
  const full = document.getElementById('cvolMode').value==='full';
  const nom_cm3 = full ? c.case_vol_cm3/cvFullFactor(c) : c.case_vol_cm3;   // nominal dans le mode courant
  const nom = CVOLUNIT==='grh2o' ? nom_cm3/0.0648 : nom_cm3;
  el.placeholder = isFinite(nom) ? 'nominal '+nom.toFixed(2) : 'nominal'; }   // même mot dans les deux langues
function lin(coef,feats){return coef.reduce((s,w,i)=>s+w*feats[i],0);}
function calc(){
  const cart=CAL[document.getElementById('cart').value], pw=PWD[document.getElementById('pwd').value];
  if(!cart||!pw) return;
  suivreFenetre();
  const m_gr=toGr(+document.getElementById('m').value,U.mass.cur), C_gr=toGr(+document.getElementById('c').value,U.charge.cur), bbl=toMm(+document.getElementById('bbl').value,U.bbl.cur);
  const vmeas=toMs(parseFloat(document.getElementById('vmeas').value),U.vmeas.cur);
  if(!(m_gr>0&&C_gr>0&&bbl>cart.case_mm)) return;
  const m=m_gr*G, C=C_gr*G;
  const d=cart.bore_mm/1000, A=Math.PI*d*d/4, travel=(bbl-cart.case_mm)/1000;
  const hasPcd=pw.pcd>0;                                 // densité bulk optionnelle
  const cv_cm3=effCV(cart);                              // volume utile (saisi ou nominal), cm³
  const Re=1+(A*travel)/(cv_cm3*1e-6);                   // rapport de détente du canon réel (affichage, courbe Le Duc)
  const refBbl_mm=refBbl(cart), refTravel=(refBbl_mm-cart.case_mm)/1000;
  // priorité : mesure utilisateur > ancrage carabine > ancrage fabricant (couple connu) > à froid
  const an=anchorsFor(document.getElementById('cart').value,document.getElementById('pwd').value), anc=an.anc;
  const Tc=toC(parseFloat(document.getElementById('temp').value),U.temp.cur);
  const r=predict(cart,pw,m_gr,C_gr,bbl,an,{vmeas,Tc,mono:isMono()});
  const v0=r.v0, Pmax=r.Pmax, eta_p=r.eta_p, fill=r.fill, tempApplied=r.tempApplied;
  const anchored=r.mode==='mesure', dataAnchor=r.mode==='carabine'||r.mode==='anchor';
  const viaEeff=r.mode==='e_eff', eta_b=r.mode==='eta_b'?r.base.eta_b:null;
  // affichage
  document.getElementById('o_v').textContent=frMs(v0,U.v.cur).toFixed(0);
  document.getElementById('o_p').textContent=frBar(Pmax,U.p.cur).toFixed(0);
  // mémorise la sortie (unités SI) pour l'export vers la balistique extérieure
  LAST={v0:v0,m_gr:m_gr,bore:cart.bore_mm};
  const _be=document.getElementById('toExt'); if(_be){_be.disabled=false; _be.style.opacity='';}
  // --- situations dangereuses (surpression / surremplissage), affichage proéminent ---
  const pcip=cart.pmax_cip_bar||null, pct=pcip?Pmax/pcip*100:null;
  let lvl='ok'; const al=[];
  if(pct!=null){
    if(pct>100){al.push(T(`Surpression estimée : <strong>${pct.toFixed(0)} %</strong> de la limite ${limSrc(cart)} (${frBar(pcip,U.p.cur).toFixed(0)} ${U.p.cur})`,`Estimated overpressure: <strong>${pct.toFixed(0)}%</strong> of the ${limSrc(cart)} limit (${frBar(pcip,U.p.cur).toFixed(0)} ${U.p.cur})`));lvl='danger';}
    else if(pct>=85){al.push(T(`Pression proche de la limite ${limSrc(cart)} (${pct.toFixed(0)} %)`,`Pressure close to the ${limSrc(cart)} limit (${pct.toFixed(0)}%)`));lvl='warn';}
  }
  // Seuils de remplissage (2026-10-13, scripts/remplissage_publie.py) : au volume nominal de la base,
  // les 20 390 charges MAXIMALES publiées par les fabricants (sans balles en plomb ni copies d'un guide à
  // l'autre) remplissent l'étui de carabine à 0,97 en médiane et à 1,16-1,17 au 99e centile (poudres
  // sphériques ou extrudées), à 1,30 en arme de poing ; le
  // rouge à 110 % touchait une charge maximale publiée sur dix. Rouge au-delà de 125 % (0,4 % des maxima
  // publiés au-dessus), orange au-delà de 105 % (les maxima marqués « comprimés » : 1,05 en médiane).
  if(hasPcd){
    if(fill>125){al.push(T(`Surremplissage : taux <strong>${fill.toFixed(0)} %</strong>`,`Overfilled case: load density <strong>${fill.toFixed(0)}%</strong>`));lvl='danger';}
    else if(fill>105){al.push(T(`Charge comprimée (${fill.toFixed(0)} %)`,`Compressed charge (${fill.toFixed(0)}%)`));if(lvl!=='danger')lvl='warn';}
    else if(fill<55){al.push(T(`Charge très faible (${fill.toFixed(0)} %)`,`Very low load density (${fill.toFixed(0)}%)`));if(lvl!=='danger')lvl='warn';}
  }
  const dz=document.getElementById('danger');
  if(al.length){dz.style.display='block';dz.className='vm-alert '+(lvl==='danger'?'danger':'warn');
    dz.innerHTML=`<strong>${lvl==='danger'?'⛔ DANGER':T('⚠ Attention','⚠ Caution')}</strong> — ${al.join(' · ')}. <em>${T('Estimation indicative — confirmez dans les données fabricant.','Indicative estimate — confirm against the manufacturer\'s data.')}</em>`;}
  else dz.style.display='none';
  document.getElementById('pbox').className='vm-out'+(pct==null?'':(pct>100?' danger':pct>=85?' warn':''));
  document.getElementById('o_pcip').textContent = pct!=null ? T(`· ${pct.toFixed(0)} % ${limSrc(cart)}`,`· ${pct.toFixed(0)}% of ${limSrc(cart)}`) : T('(limite de pression non renseignée)','(no pressure limit on record)');
  const pbar=document.getElementById('pbar');
  if(pct!=null){pbar.style.display='block';pbar.className='vm-bar'+(pct>100?' danger':pct>=85?' warn':'');pbar.firstElementChild.style.width=Math.min(pct,100)+'%';}
  else pbar.style.display='none';
  const ancFlag = !!(anc && anc.mhflag);                 // couple fabricant atypique (garde-fou Mayer-Hart)
  const tag=document.getElementById('o_vtag');
  tag.textContent=anchored?T('ancrée (vos données)','anchored (your data)'):dataAnchor?(r.mode==='carabine'?T('ancrée carabine (ladder)','rifle-anchored (ladder)'):ancFlag?T('ancrée fabricant (à vérifier)','manufacturer-anchored (to check)'):T('ancrée fabricant ~3 %','manufacturer-anchored ~3%')):T('à froid ~7 %','uncalibrated ~7%');
  tag.className='vm-tag'+((anchored||dataAnchor)?' anchored':'');
  const fillTxt = (hasPcd ? T(`Remplissage ${fill.toFixed(0)} %`,`Load density ${fill.toFixed(0)}%`) : T('Remplissage inconnu (densité bulk absente)','Load density unknown (no bulk density)')) + (CVOL>0?T(` · volume étui perso ${nf(cv_cm3,2)} cm³`,` · custom case capacity ${nf(cv_cm3,2)} cm³`):'');
  const mode = anchored?T('mesure perso','your measurement') : r.mode==='carabine'?`${T('ancré carabine','rifle-anchored')} (n=${an.rifle.n})` : dataAnchor?`${T('ancré fabricant','manufacturer-anchored')} (n=${anc.n}${anc.np==null?T(', vitesse seule — pression η_p global',', velocity only — global η_p for pressure'):''})` : (viaEeff?T('énergie générique (Qex/Ba inconnus)','generic energy (Qex/Ba unknown)'):'η_b '+nf(eta_b,3));
  // Loi de canon : celle de VelocityModel.scaleByBarrelFor (Powley pour une carabine, loi de puissance pour une arme de poing).
  const loiFr = cart.type==='rifle' ? 'règle de Powley' : 'loi de puissance, k = 0,15', loiEn = cart.type==='rifle' ? "Powley's rule" : 'power law, k = 0.15';
  const pRefTxt = Math.abs(bbl-refBbl_mm)>1 ? T(`  ·  v₀ mise à l'échelle du canon saisi (${loiFr}), pression au canon réf. ${nf(frMm(refBbl_mm,U.bbl.cur),U.bbl.cur==='in'?1:0)} ${U.bbl.cur}`,`  ·  v₀ scaled to the entered barrel (${loiEn}), pressure at the ref. barrel ${nf(frMm(refBbl_mm,U.bbl.cur),U.bbl.cur==='in'?1:0)} ${U.bbl.cur}`) : '';
  document.getElementById('derived').textContent=
    `${fillTxt}  ·  ${T('rapport de détente','expansion ratio')} ${nf(Re,1)}  ·  ${mode}  ·  η_p ${nf(eta_p,3)}${pRefTxt}`;
  // Précision de la pression selon sa source (validation du 2026-10-13, docs/MODEL.md § 3.5 ; à froid, laboratoires
  // hors calage : scripts/pression_par_source.py, 2026-10-13). Couple ancré par des sources qui ne publient pas la
  // pression (énergie de l'ancre, η_p à froid) : simulation par classe de scripts/fit_repli_carabine.js (2026-10-16),
  // carabine 9,8 % / 3,1 % au repli, 19,8 % / 4,1 % à constantes ; arme de poing 22,2 % / 12,7 %, 37,8 % / 9,4 %.
  // Jusqu'au 2026-10-16, ces couples (1 356 sur 2 597, dont 1 168 de carabine au repli) recevaient le message du
  // modèle à froid, « ~25 %, une sur cinq ».
  const PSANS={'rifle|r':[10,'trente','thirty'],'rifle|c':[20,'vingt-cinq','twenty-five'],'handgun|r':[22,'huit','eight'],'handgun|c':[38,'dix','ten']};
  const pSans=(anc && anc.np==null) ? PSANS[cart.type+'|'+((pw.Qex&&pw.Ba)?'c':'r')] : null;
  // Loi à deux pentes (carabines, scripts/fit_deux_pentes.js, 2026-10-16), balle laissée de côté : 7,9 %, biais +2,4 %,
  // 0,5 % des charges sous-estimées de plus de 15 % (6 057 charges ; la loi des ancres : 8,9 % et 3,1 % sur les mêmes).
  const enU=(gr,u)=> U[u].cur==='g' ? nf(gr*GR_G,2)+' g' : nf(gr,u==='mass'?(gr%1?1:0):2)+' gr';   // masse, charge dans l'unité choisie
  let w = r.deuxPentes
    ? T(`Pression indicative (~8 % d'écart quadratique, rapportée à la charge maximale publiée pour une balle de ${enU(r.win.m,'mass')}, ${enU(r.win.cmax,'charge')} ; sous-estimée de plus de 15 % pour une charge sur deux cents) — ne jamais valider une charge sur cette base.`,`Pressure for indication only (~8% RMS error, relative to the published maximum charge for a ${enU(r.win.m,'mass')} bullet, ${enU(r.win.cmax,'charge')}; underestimated by more than 15% for one load in two hundred) — never validate a load on this basis.`)
    : pSans
    ? T(`Pression indicative (~${pSans[0]} % d'écart quadratique : énergie tirée des données fabricant de ce couple, qui ne publient pas la pression, η_p générique ; sous-estimée de plus de 15 % pour une charge sur ${pSans[1]}) — ne jamais valider une charge sur cette base.`,`Pressure for indication only (~${pSans[0]}% RMS error: energy from the manufacturer data for this combination, which give no pressure, generic η_p; underestimated by more than 15% for one load in ${pSans[2]}) — never validate a load on this basis.`)
    : (anc && anc.np!=null)
    // loi des ancres, balle laissée de côté (fit_deux_pentes.js, 2026-10-16) : carabine 8,9 %, 3,2 % sous-estimées
    // de plus de 15 % ; arme de poing 20,8 %, 19,6 %. Jusqu'au 2026-10-16, « ~13 %, une sur treize » pour les deux.
    ? (cart.type==='handgun'
      ? T('Pression indicative (~21 % d\'écart quadratique avec les données fabricant de ce couple ; sous-estimée de plus de 15 % pour une charge sur cinq) — ne jamais valider une charge sur cette base.','Pressure for indication only (~21% RMS error with the manufacturer data for this combination; underestimated by more than 15% for one load in five) — never validate a load on this basis.')
      : T('Pression indicative (~9 % d\'écart quadratique avec les données fabricant de ce couple ; sous-estimée de plus de 15 % pour une charge sur trente) — ne jamais valider une charge sur cette base.','Pressure for indication only (~9% RMS error with the manufacturer data for this combination; underestimated by more than 15% for one load in thirty) — never validate a load on this basis.'))
    : T('Pression indicative (~25 % d\'écart quadratique sans données fabricant de pression pour ce couple ; sous-estimée de plus de 15 % pour une charge sur cinq, jusqu\'à une sur trois selon le fabricant) — ne jamais valider une charge sur cette base.','Pressure for indication only (~25% RMS error without manufacturer pressure data for this combination; underestimated by more than 15% for one load in five, up to one in three depending on the manufacturer) — never validate a load on this basis.');
  // 16 des 1 700 charges Reload Swiss qui calent le modèle dépassent 110 % (rs_dataset, 2026-10-13).
  if(hasPcd && fill>110) w=T('⚠ Remplissage > 110 % : presque aucune des charges qui calent le modèle ne va si loin, estimation peu fiable.','⚠ Load density > 110%: almost none of the loads the model is fitted on go that far, unreliable estimate.');
  else if(hasPcd && fill<55) w=T('⚠ Remplissage faible (< 55 %) : hors domaine usuel, estimation peu fiable.','⚠ Low load density (< 55%): outside the usual range, unreliable estimate.');
  if(CVOL>0 && cart.case_vol_cm3>0){ const r=CVOL/cart.case_vol_cm3; if(r<0.6||r>1.6) w=T('⚠ Volume d\'étui (ramené en utile) très éloigné du nominal ('+(r*100).toFixed(0)+' %) — vérifiez l\'unité (cm³ / gr H₂O) et le mode (utile balle sertie / pleine étui vide). ','⚠ Case capacity (converted to usable) far from nominal ('+(r*100).toFixed(0)+'%) — check the unit (cm³ / gr H₂O) and the mode (usable, bullet seated / full, empty case). ')+w; }
  if(CVOL>0 && COEF.local) w=T('Volume d\'étui perso : vitesse et pression ramenées comme pour la charge de même densité de chargement dans l\'étui nominal (hypothèse non validée sur des mesures : à charge égale, P ∝ (V nominal / V)^'+nf(COEF.local.gamma,1)+' et v ∝ (V nominal / V)^'+nf(COEF.local.delta/2,2)+' ; un étui 10 % plus petit donne ainsi '+nf((Math.pow(1/0.9,COEF.local.gamma)-1)*100,0)+' % de pression en plus). ','Custom case capacity: velocity and pressure scaled as for the charge of the same loading density in the nominal case (an assumption, not validated on measurements: at equal charge, P ∝ (nominal V / V)^'+nf(COEF.local.gamma,1)+' and v ∝ (nominal V / V)^'+nf(COEF.local.delta/2,2)+'; a case 10% smaller thus gives '+nf((Math.pow(1/0.9,COEF.local.gamma)-1)*100,0)+'% more pressure). ')+w;
  if(!pcip) w=T('ℹ Cartouche sans limite de pression publiée dans nos données (absente du standard SAAMI carabine ; valeur CIP non renseignée) → pas de bandes de sécurité ni de % limite sur cette cartouche. ','ℹ No published pressure limit for this cartridge in our data (not in the SAAMI rifle standard; no C.I.P. value on record) → no safety bands or % of limit for it. ')+w;
  if(!hasPcd) w=T('Densité bulk inconnue : remplissage et pression approximés (nominal). ','Bulk density unknown: load density and pressure approximated (nominal). ')+w;
  // Écart du repli, toutes charges publiées (scripts/fit_repli_carabine.js, 2026-10-16) : carabine 5,8 % avec son
  // facteur, arme de poing 10,8 %. La page disait « ~8 % » pour les deux.
  if(viaEeff){ const e=cart.type==='rifle'?6:11; w=T('Poudre sans Qex/Ba connus : vitesse via énergie générique (~'+e+' % d\'écart quadratique). ','Powder without known Qex/Ba: velocity from a generic energy (~'+e+'% root-mean-square error). ')+w; }
  if(ancFlag) w=T('⚠ Données fabricant atypiques pour ce couple (cohérence vitesse/pression Mayer-Hart hors norme : '+anc.mhr.toFixed(0)+' %) : ancrage pression à confirmer. ','⚠ Atypical manufacturer data for this combination (Mayer-Hart velocity/pressure consistency out of range: '+anc.mhr.toFixed(0)+'%): pressure anchoring to be confirmed. ')+w;
  // Balle monolithique (scripts/fit_monolithique.js, 2026-10-15) : sans ce choix, une monolithique d'arme de
  // poing sortait 16 % trop bas en pression ancrée, et plus d'une charge sur deux de plus de 15 %.
  const MONO=COEF.monolithique&&COEF.monolithique[cart.type];
  if(r.base.mono&&MONO){
    const parAncre=r.base.path==='anchor'&&r.base.npFromAnchor, pA=nf((MONO.P-1)*100,1), pF=nf((MONO.froidP-1)*100,1);
    w=(r.deuxPentes
      ? T('Balle monolithique : la pression est rapportée à la plus petite charge maximale publiée pour cette masse de balle, où comptent déjà les monolithiques publiées ; aucun facteur ajouté. ','Monolithic bullet: pressure is relative to the lowest published maximum charge for this bullet weight, which already includes the published monolithic bullets; no factor added. ')
      : parAncre
      ? T('Balle monolithique : à charge et masse égales, les guides Hodgdon et Western donnent '+pA+' % de pression de plus qu\'avec une balle à noyau ('+(cart.type==='handgun'?'arme de poing':'carabine')+') ; la pression ancrée en tient compte. ','Monolithic bullet: at equal charge and bullet weight, the Hodgdon and Western manuals give '+pA+'% more pressure than with a lead-core bullet ('+(cart.type==='handgun'?'handguns':'rifles')+'); the anchored pressure takes it into account. ')
      : MONO.froidP>1
        ? T('Balle monolithique : pression majorée de '+pF+' % (écart mesuré sans ancre sur les guides Hodgdon et Western, arme de poing). ','Monolithic bullet: pressure raised by '+pF+'% (gap measured without an anchor on the Hodgdon and Western manuals, handguns). ')
        : T('Balle monolithique : pas de correction sans données fabricant de pression pour ce couple (aucun écart net mesuré dans ce cas en carabine). ','Monolithic bullet: no correction without manufacturer pressure data for this combination (no clear gap measured in this case for rifles). '))+w;
  }
  if(tempApplied) w=T('Vitesse et pression ajustées à '+Tc.toFixed(0)+' °C (réf. 21 °C) : vitesse par la sensibilité générique de Litz, ~1,8 fps/°C, qui varie selon la poudre ; pression comme pour la variation de charge équivalente (hypothèse, P ∝ v^'+nf(kTempP(r.deuxPentes),1)+'). ','Velocity and pressure adjusted to '+Tc.toFixed(0)+' °C (ref. 21 °C): velocity by Litz\'s generic sensitivity, ~1.8 fps/°C, which varies with the powder; pressure as for the equivalent change of charge (an assumption, P ∝ v^'+nf(kTempP(r.deuxPentes),1)+'). ')+w;
  const bRatio=travel/refTravel;
  if(bRatio<0.6||bRatio>1.7) w=T('⚠ Canon très éloigné de la longueur de référence ('+nf(frMm(refBbl_mm,U.bbl.cur),U.bbl.cur==='in'?1:0)+' '+U.bbl.cur+') : mise à l\'échelle de v₀ extrapolée ('+loiFr+'), à confirmer au chronographe. ','⚠ Barrel far from the reference length ('+nf(frMm(refBbl_mm,U.bbl.cur),U.bbl.cur==='in'?1:0)+' '+U.bbl.cur+'): v₀ scaling extrapolated ('+loiEn+'), confirm with a chronograph. ')+w;
  document.getElementById('warn').textContent=w;
  renderLadder();
  // courbe Le Duc (couche 3)
  const ld=VelocityModel.leDuc(v0,Pmax,m,C,d,travel);
  if(!ld){Plotly.purge('plot');
    document.getElementById('warn').textContent=T('Courbe pression/vitesse indisponible : paramètres hors domaine du modèle Le Duc (combinaison inhabituelle). Les estimations chiffrées ci-dessus restent valides. ','Pressure/velocity curve unavailable: parameters outside the Le Duc model range (unusual combination). The figures above remain valid. ')+w;
    return;}
  const xs=[],vs=[],ps=[];
  for(let i=0;i<=100;i++){const x=travel*i/100;xs.push(frMm(x*1000,U.bbl.cur));vs.push(frMs(ld.v(x),U.v.cur));ps.push(frBar(ld.P_bar(x),U.p.cur));}
  const pcipD=pcip?frBar(pcip,U.p.cur):null;
  // Superposition des courbes du LADDER (en plus clair) : une P(x)/v(x) par charge de la fenêtre.
  const ladTraces=[]; let maxLadP=0;
  if(document.getElementById('ladPlot') && document.getElementById('ladPlot').checked){
    const w=ladderWindow(), chgs=ladderCharges(w);
    const stride=Math.max(1,Math.ceil(chgs.length/14));     // ~14 courbes max pour rester lisible
    for(let k=0;k<chgs.length;k+=stride){ const Cg=chgs[k];
      const rk=predict(cart,pw,m_gr,Cg,bbl,an,{Tc}); if(!(rk.v0>0&&rk.Pmax>0))continue;
      const lk=VelocityModel.leDuc(rk.v0,rk.Pmax,m,Cg*G,d,travel); if(!lk)continue;
      const xk=[],vk=[],pk2=[]; for(let i=0;i<=50;i++){const x=travel*i/50;xk.push(frMm(x*1000,U.bbl.cur));vk.push(frMs(lk.v(x),U.v.cur));const P=frBar(lk.P_bar(x),U.p.cur);pk2.push(P);if(P>maxLadP)maxLadP=P;}
      const nm=ladDisp(Cg).toFixed(LADUNIT==='gr'?1:3)+' '+LADUNIT;
      ladTraces.push({x:xk,y:pk2,yaxis:'y',name:nm,legendgroup:'lad',showlegend:false,line:{color:'rgba(192,57,43,0.20)',width:1},hoverinfo:'name'});
      ladTraces.push({x:xk,y:vk,yaxis:'y2',name:nm,legendgroup:'lad',showlegend:false,line:{color:'rgba(41,128,185,0.20)',width:1},hoverinfo:'name'});
    }
  }
  // seuils selon la source de la pression max : CIP (P_K 1,15× / P_E 1,25×) ou
  // SAAMI (MPSM 1,065× / épreuve = MPLM×1,30 ≈ 1,334× MAP).
  // SAAMI : CV 0,04 (carabine) / 0,05 (pistolet) → MPSM 1,065×/1,078× et épreuve = MPLM×1,30.
  // `hg30` : les familles auxquelles la C.I.P. impose +30 % à l'épreuve. La base ne contient
  // aujourd'hui que 'rifle' et 'handgun', mais la table V (percussion annulaire) demande 1,30
  // elle aussi : le jour où un .22 LR entrera dans la base il serait typé 'rifle' et verrait sa
  // ligne d'épreuve tracée 5 points trop bas. Le cas est couvert d'avance. (2026-08-19)
  const saami=cart.pmax_src==='SAAMI', hg=cart.type==='handgun',
        hg30=hg||cart.type==='rimfire';
  // P_E C.I.P. : +25 % pour une arme RAYÉE à percussion centrale, +30 % pour pistolet, revolver
  // et percussion annulaire. La branche C.I.P. appliquait 1,25 à tout, alors que le drapeau `hg`
  // était déjà là et déjà utilisé par la branche SAAMI juste à côté — un 9 mm voyait donc sa
  // ligne d'épreuve tracée 5 points trop bas. Trouvé le 2026-07-29 en vérifiant technique:cip.
  const kMul=saami?(hg?1.078:1.065):1.15, eMul=saami?((hg?1.0316:1.026)*1.30):(hg30?1.30:1.25);
  // si la limite est connue, on étend l'axe au-dessus de l'épreuve pour montrer toutes les zones
  const yTop=Math.max(pcipD?Math.max(Math.max.apply(null,ps),pcipD*eMul)*1.06:Math.max.apply(null,ps)*1.12, maxLadP*1.06);
  const lay={margin:{t:10,r:55,l:55,b:80},legend:{orientation:'h',x:0.5,xanchor:'center',y:-0.28,yanchor:'top'},
     xaxis:{title:T('Course de la balle','Bullet travel')+' ('+U.bbl.cur+')'},
     yaxis:{title:T('Pression','Pressure')+' ('+U.p.cur+')',rangemode:'tozero',range:[0,yTop]},
     yaxis2:{title:T('Vitesse','Velocity')+' ('+U.v.cur+')',overlaying:'y',side:'right',rangemode:'tozero'}};
  if(pcipD){
    // Seuils : limite moyenne (P_max CIP / MAP SAAMI), seuil intermédiaire (P_K 1,15× cartouche
    // CIP / MPSM 1,065× échantillon SAAMI) et épreuve arme (P_E). ATTENTION : le coefficient de
    // P_E n'est PAS unique — la C.I.P. exige 1,25× pour les armes rayées à percussion centrale
    // mais 1,30× pour les armes de poing, la percussion annulaire et la grenaille ; d'où le
    // branchement sur `hg` dans eMul ci-dessus (corrigé le 2026-07-29, cf. wiki technique:limite_cip).
    // pWarn=0,90× : bande de garde, PAS une correction chiffrée — aucun biais de pression n'est
    // établi pour ce modèle ; une estimation entrant ici peut déjà valoir la limite en réalité.
    const pK=pcipD*kMul, pE=pcipD*eMul, pWarn=pcipD*0.9, u=U.p.cur;
    const fx=(x,n)=>nf(x,n);
    const limLab=saami?'MAP SAAMI':'P_max C.I.P.', kLab=saami?('MPSM '+fx(kMul,3)+T('× (échantillon)','× (sample)')):T('P_K 1,15× (cartouche)','P_K 1.15× (cartridge)'), eLab=saami?(T('épreuve ','proof ')+fx(eMul,2)+T('× (proof)','×')):('P_E '+fx(eMul,2)+T('× (épreuve arme)','× (firearm proof)'));
    lay.shapes=[
      {type:'rect',xref:'paper',x0:0,x1:1,yref:'y',y0:pWarn,y1:pcipD,fillcolor:'rgba(243,156,18,0.13)',line:{width:0},layer:'below'},
      {type:'rect',xref:'paper',x0:0,x1:1,yref:'y',y0:pcipD,y1:pK,fillcolor:'rgba(192,57,43,0.12)',line:{width:0},layer:'below'},
      {type:'rect',xref:'paper',x0:0,x1:1,yref:'y',y0:pK,y1:pE,fillcolor:'rgba(123,36,28,0.17)',line:{width:0},layer:'below'},
      {type:'rect',xref:'paper',x0:0,x1:1,yref:'y',y0:pE,y1:yTop,fillcolor:'rgba(80,20,15,0.24)',line:{width:0},layer:'below'},
      {type:'line',xref:'paper',x0:0,x1:1,yref:'y',y0:pWarn,y1:pWarn,line:{color:'#e67e22',width:1.2,dash:'dot'},layer:'above'},
      {type:'line',xref:'paper',x0:0,x1:1,yref:'y',y0:pcipD,y1:pcipD,line:{color:'#c0392b',width:2.5,dash:'dash'},layer:'above'},
      {type:'line',xref:'paper',x0:0,x1:1,yref:'y',y0:pK,y1:pK,line:{color:'#a93226',width:1.4,dash:'dot'},layer:'above'},
      {type:'line',xref:'paper',x0:0,x1:1,yref:'y',y0:pE,y1:pE,line:{color:'#7b241c',width:1.4,dash:'dot'},layer:'above'}
    ];
    const lab=(y,anchor,text,color,bold)=>({xref:'paper',x:0.99,xanchor:'right',yref:'y',y:y,yanchor:anchor,text:bold?'<b>'+text+'</b>':text,showarrow:false,font:{size:10,color:color},bgcolor:'rgba(255,255,255,0.72)'});
    lay.annotations=[
      lab(pWarn,'top',T('≈90 % · marge modèle','≈90% · model margin'),  '#b9770e',false),
      lab(pcipD,'bottom',limLab+' '+pcipD.toFixed(0)+' '+u,'#c0392b',true),
      lab(pK,'bottom',kLab,'#a93226',false),
      lab(pE,'bottom',eLab,'#7b241c',false)
    ];
  }
  const plotData=[
    ...ladTraces,                                            // courbes du ladder (clair) sous les courbes principales
    {x:xs,y:ps,name:T('Pression de chambre','Chamber pressure')+' ('+U.p.cur+')'+(ladTraces.length?T(' · charge courante',' · current charge'):''),yaxis:'y',line:{color:'#c0392b',width:2.5}},
    {x:xs,y:vs,name:T('Vitesse','Velocity')+' ('+U.v.cur+')'+(ladTraces.length?T(' · charge courante',' · current charge'):''),yaxis:'y2',line:{color:'#2980b9',width:2.5}}
  ];
  LASTPLOT={data:plotData,layout:lay};                       // mémorisé pour la vue agrandie
  Plotly.react('plot',plotData,lay,{displayModeBar:false,responsive:true});
  if(!PLOTBOUND){ const gd=document.getElementById('plot'); if(gd&&gd.on){ gd.on('plotly_click',openPlotModal); PLOTBOUND=true; } }
  if(document.getElementById('plotModal').style.display==='flex') openPlotModal();   // rafraîchit la modale ouverte
}
// --- Vue agrandie du graphe (modale, zoom/pan via la barre Plotly) -----------
function openPlotModal(){
  if(!LASTPLOT) return;
  const modal=document.getElementById('plotModal'); modal.style.display='flex';
  const data=JSON.parse(JSON.stringify(LASTPLOT.data)), layout=JSON.parse(JSON.stringify(LASTPLOT.layout));
  layout.margin={t:14,r:65,l:65,b:90}; layout.font={size:13};
  Plotly.newPlot('plotBig',data,layout,{displayModeBar:true,responsive:true,scrollZoom:true,
    modeBarButtonsToRemove:['lasso2d','select2d'],displaylogo:false});
}
function closePlotModal(){ document.getElementById('plotModal').style.display='none'; Plotly.purge('plotBig'); }
document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&document.getElementById('plotModal').style.display==='flex') closePlotModal(); });
// --- Import / Export CSV ---------------------------------------------------
// Déclenche le téléchargement d'un fichier CSV (UTF-8)
function csvDownload(name,text){
  const blob=new Blob(['﻿'+text],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
// Échappe une cellule CSV (séparateur virgule, guillemets RFC 4180)
function csvCell(s){ s=String(s); return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; }
const csvRows=rows=>rows.map(r=>r.map(csvCell).join(',')).join('\n')+'\n';
// Découpe une ligne CSV en respectant les guillemets
function csvSplit(line){
  const out=[]; let cur='',q=false;
  for(let i=0;i<line.length;i++){const ch=line[i];
    if(q){ if(ch==='"'){ if(line[i+1]==='"'){cur+='"';i++;} else q=false; } else cur+=ch; }
    else { if(ch==='"')q=true; else if(ch===','){out.push(cur);cur='';} else cur+=ch; } }
  out.push(cur); return out.map(s=>s.trim());
}
// Écrit une entrée numérique (clé U) à partir d'une valeur exprimée dans `unit`, convertie vers l'unité d'affichage courante
function importField(key,val,unit){
  const el=document.getElementById(U[key].el); if(!el)return;
  val=String(val==null?'':val).trim().replace(',','.');   // tableur français : « 175,5 »
  if(val===''||!isFinite(parseFloat(val))){ if(key==='vmeas')el.value=''; return; }
  val=parseFloat(val); unit=unit||U[key].cur; const cur=U[key].cur; let out;
  if(key==='mass'||key==='charge'){ const gr=toGr(val,unit); out=cur==='g'?gr*GR_G:gr; el.value=out.toFixed(key==='mass'?1:2); }
  else if(key==='bbl'){ const mm=toMm(val,unit); el.value=(cur==='in'?frMm(mm,'in'):mm).toFixed(cur==='in'?1:0); }
  else if(key==='vmeas'){ el.value=frMs(toMs(val,unit),cur).toFixed(0); }
  else if(key==='temp'){ const c=toC(val,unit); el.value=(cur==='°F'?c*9/5+32:c).toFixed(0); }
}
// Volume d'étui importé : toujours en capacité UTILE (c'est ce que l'export écrit), en cm³ ou gr H₂O.
function importCvol(val,unit){
  const v=parseFloat(String(val==null?'':val).replace(',','.')); if(!(v>0)) return;
  const cm3=/h2o|h₂o/i.test(unit||'') ? v*0.0648 : v;
  document.getElementById('cvolMode').value='usable';
  document.getElementById('cvol').value=(CVOLUNIT==='grh2o'? cm3/0.0648 : cm3).toFixed(2);
  onCvol();
}
// Estimateur : exporte la configuration courante + les résultats affichés
function exportEstimateur(){
  const v=id=>document.getElementById(id).value;
  const rows=[
    ['# Tireur.org — Estimateur de balistique intérieure'],
    ['# https://www.tireur.org/reloading/tireur_reloaded/ — export '+new Date().toISOString().slice(0,10)],
    ['champ','valeur','unité'],
    ['cartouche',v('cart'),''],
    ['poudre',v('pwd'),''],
    ['masse',v('m'),U.mass.cur],
    ['charge',v('c'),U.charge.cur],
    ['canon',v('bbl'),U.bbl.cur],
    ['vitesse_mesuree',v('vmeas'),U.vmeas.cur],
    ['temperature',v('temp'),U.temp.cur],
    ['balle_monolithique',isMono()?'oui':'non',''],
  ];
  if(CVOL>0) rows.push(['volume_etui',CVOL.toFixed(3),'cm3']);   // capacité utile, déjà convertie
  if(LAST){
    rows.push(['# résultats (indicatifs — recalculés à l\'import)']);
    rows.push(['v0',document.getElementById('o_v').textContent,U.v.cur]);
    rows.push(['pmax',document.getElementById('o_p').textContent,U.p.cur]);
  }
  csvDownload('estimateur_'+v('cart').replace(/\W+/g,'_')+'.csv',csvRows(rows));
}
// Estimateur : recharge la configuration depuis un CSV (clé;valeur), recalcule
function importEstimateur(file){
  const r=new FileReader();
  r.onload=()=>{
    const map={};
    r.result.split(/\r?\n/).forEach(l=>{ l=l.replace(/^﻿/,'').trim();
      if(!l||l[0]==='#')return; const f=l.includes(';')? l.split(';').map(x=>x.trim().replace(/^"|"$/g,'')) : csvSplit(l);
      if(f.length>=2 && f[0].toLowerCase()!=='champ') map[f[0].toLowerCase()]=f; });
    RIFLE.eeff=null;                                   // couple potentiellement changé -> réinit ancrage carabine
    // onCart() remet à zéro ce qui appartient à la cartouche (volume d'étui saisi, canon par défaut,
    // marqueurs « ● ») : sans lui, un volume saisi pour un .308 restait appliqué au 9 mm importé.
    if(map.cartouche && CAL[map.cartouche[1]]){ document.getElementById('cart').value=map.cartouche[1]; onCart(); renderDiag(); }
    if(map.poudre && PWD[map.poudre[1]]) populatePowders(map.poudre[1]);
    setLadderDefaults();                               // fenêtre du ladder : celle du couple importé
    [['masse','mass'],['charge','charge'],['canon','bbl'],['vitesse_mesuree','vmeas'],['temperature','temp']]
      .forEach(([k,key])=>{ if(map[k]) importField(key,map[k][1],map[k][2]); });
    if(map.volume_etui) importCvol(map.volume_etui[1],map.volume_etui[2]);
    // Absent des fichiers exportés avant le 2026-10-15 : balle à noyau, comme alors.
    document.getElementById('mono').value=(map.balle_monolithique && /^(oui|yes|1|true)$/i.test(map.balle_monolithique[1])) ? '1' : '0';
    calc();
  };
  r.readAsText(file);
}
// Ladder : exporte les mesures saisies (charge,vitesse) dans les unités courantes
function exportLadder(){
  const ck=document.getElementById('cart').value, pk=document.getElementById('pwd').value;
  const pts=ladderPoints();
  const rows=[
    ['# Tireur.org — Ladder (mesures de vitesse)'],
    ['# couple: '+ck+' | '+pk+' — unités: charge='+U.charge.cur+', vitesse='+U.v.cur],
    ['charge ('+U.charge.cur+')','vitesse ('+U.v.cur+')'],   // unités lues à l'import
    ...pts.map(a=>[a[0],a[1]]),
  ];
  csvDownload('ladder_'+ck.replace(/\W+/g,'_')+'.csv',csvRows(rows));
}
// Ladder : importe des mesures depuis un CSV vers la zone de saisie, puis ajuste
function importLadder(file){
  const r=new FileReader();
  r.onload=()=>{
    const texte=r.result.replace(/^﻿/,'');
    // Unités du fichier : en-tête « charge (gr),vitesse (m/s) », ou, dans les fichiers
    // exportés avant le 2026-09-25, le commentaire « unités: charge=gr, vitesse=m/s ».
    // Faute de mieux, les unités d'affichage courantes (comportement d'avant).
    const uc=(texte.match(/charge\s*(?:\(|=)\s*(gr|g)\b/i)||[])[1]||U.charge.cur;
    const uv=(texte.match(/vitesse\s*(?:\(|=)\s*(m\/s|fps)/i)||[])[1]||U.v.cur;
    const lines=texte.split(/\r?\n/).map(ladderLigne).filter(Boolean).map(a=>{
      const gr=toGr(a[0],uc.toLowerCase()), c=U.charge.cur==='g'? gr*GR_G : gr;
      const v=frMs(toMs(a[1],uv.toLowerCase()),U.v.cur);
      return c.toFixed(U.charge.cur==='g'?3:2).replace(/\.?0+$/,'')+', '+Math.round(v);
    });
    document.getElementById('ladMeas').value=lines.join('\n');
    fitLadder();
  };
  r.readAsText(file);
}
// Ouvre la note « Comment ça marche » si on arrive via #howto (lien profond depuis le guide)
(function(){function openHowto(){if(location.hash==='#howto'){var d=document.getElementById('howto');if(d){d.open=true;d.scrollIntoView();}}}
window.addEventListener('hashchange',openHowto);openHowto();})();
</script>

<script>
// Hors ligne au stand : le service worker (/sw.js) met cette page, ses scripts et ses
// données (calibres, poudres, coefficients) en cache, comme le calculateur balistique.
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .catch(err => console.warn('Service worker non enregistré :', err));
    });
}
</script>
<?php include '../../foot.php'; ?>
