<?php
$title = "Estimateur de balistique intérieure — Tireur.org";
$meta_description = "Estimateur de vitesse et de pression au rechargement par modèle énergie-efficacité, calé sur données fabricant et affinable sur vos propres mesures. Courbe pression/vitesse (Le Duc).";
include '../../header.php';
?>
<link rel="stylesheet" href="/rechargement/css/reloading.css" />
<script src="https://cdn.plot.ly/plotly-2.35.2.min.js" charset="utf-8"></script>
<script src="energy_model.js"></script>
<script src="velocity_model.js"></script>
<script src="cartridge_diagram.js"></script>

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
.vm-out { font-size:1.6rem; font-weight:700; color:var(--color-accent); }
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
.vm-btn2:hover { border-color:var(--color-accent); color:var(--color-accent); }
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

<h1>Estimateur de balistique intérieure</h1>

<p>Modèle <strong>énergie-efficacité</strong> : la vitesse vient de l'énergie de la poudre via une efficacité
balistique η<sub>b</sub>, la pression d'une efficacité piézométrique η<sub>p</sub> — deux relations
<strong>calées sur plusieurs guides fabricant</strong> (Reload Swiss, Accurate/Ramshot, Vihtavuori),
sans la fonction de forme propriétaire de l'ancien solveur.
Base de composants dérivée de <em>Gordon's Reloading Tool</em> (Gordon †) et de la communauté (CC0).</p>

<div class="vm-banner">
<strong>&#9888; Estimation, pas une donnée de sécurité.</strong> À froid, la <strong>vitesse</strong> est donnée à
<strong>±10&nbsp;%</strong> et la <strong>pression à titre purement indicatif</strong> (±15&nbsp;% au mieux) :
une charge réellement au-dessus de la limite CIP peut s'afficher « sûre ». L'estimation est
<strong>affinée automatiquement (~5&nbsp;%) pour les couples cartouche/poudre connus</strong> ;
saisissez <strong>votre vitesse mesurée</strong> pour la rendre quasi-exacte. Vérifiez toujours dans les données officielles du fabricant.
<a href="/wiki/doku.php?id=technique:balistique_interieure_validation">Validation &amp; limites &rarr;</a>
&middot; <a href="/wiki/doku.php?id=technique:donnees_balistiques">produire vos données &rarr;</a>
</div>

<div class="vm-noprint" style="text-align:right;margin-bottom:0.3rem;"><button type="button" class="vm-print" onclick="window.print()">&#128424;&nbsp;Imprimer</button></div>

<div class="vm-grid">
  <div class="vm-panel">
    <div class="vm-field"><label>Préréglage système</label>
      <select id="unitSystem" onchange="applySystem()">
        <option value="metric">Métrique international (g, mm, m/s, bar)</option>
        <option value="imperial">Impérial (gr, in, fps, psi)</option>
        <option value="mixed" selected>Hybride (gr, mm, m/s, bar)</option>
      </select></div>
    <div class="vm-field"><label>Cartouche</label><select id="cart" onchange="onCart();applyStartLoad();renderDiag();calc()"></select></div>
    <div class="vm-field"><label>Poudre <select id="pwdSort" onchange="populatePowders()" style="float:right;width:auto;padding:0.05rem 0.3rem;font-size:0.74rem;">
        <option value="az" selected>tri : A → Z</option>
        <option value="za">tri : Z → A</option>
        <option value="burn-fast">tri : combustion rapide → lente</option>
        <option value="burn-slow">tri : combustion lente → rapide</option>
      </select></label><select id="pwd" onchange="applyStartLoad();calc()"></select>
      <small class="vm-note" style="display:block;margin-top:.15rem;">« <strong>●</strong> » = données fabricant pour ce calibre (ancrage ~5 % + fenêtre ladder). Sans « ● » : estimation à froid, ladder non borné.</small></div>
    <div class="vm-field"><label>Masse de balle <span class="vm-unit" id="u_mass" onclick="toggleU('mass')">gr</span></label><input type="number" id="m" value="150" step="1" oninput="calc()"></div>
    <div class="vm-field"><label>Charge <span class="vm-unit" id="u_charge" onclick="toggleU('charge')">gr</span> — <em>charge de départ (min) pré-remplie ; augmentez prudemment</em></label><input type="number" id="c" value="44" step="0.1" oninput="calc()"></div>
    <div class="vm-field"><label>Longueur de canon <span class="vm-unit" id="u_bbl" onclick="toggleU('bbl')">mm</span></label><input type="number" id="bbl" value="600" step="5" oninput="calc()"></div>
    <hr style="border:none;border-top:1px dashed var(--color-border);margin:0.6rem 0;">
    <div class="vm-field"><label>Vitesse mesurée v&#8320; <span class="vm-unit" id="u_vmeas" onclick="toggleU('vmeas')">m/s</span> — <em>optionnel, pour ancrer</em></label><input type="number" id="vmeas" placeholder="ex. 845" step="1" oninput="calc()"></div>
    <div class="vm-field"><label>Température <span class="vm-unit" id="u_temp" onclick="toggleU('temp')">°C</span> — <em>sensibilité thermique (Litz), réf. 21&nbsp;°C</em></label><input type="number" id="temp" value="21" step="1" oninput="calc()"></div>
    <div class="vm-field"><label>Volume d'étui <span class="vm-unit" id="u_cvol" onclick="toggleCvolUnit()">cm³</span> — <em>avancé ; vide = nominal · <a href="/wiki/doku.php?id=rechargement:volume_etui_pression" target="_blank" rel="noopener">comment mesurer ?</a></em></label>
      <div style="display:flex;gap:.35rem;align-items:stretch;">
        <input type="number" id="cvol" placeholder="nominal" step="0.01" oninput="onCvol()" style="flex:1;min-width:0;">
        <select id="cvolMode" onchange="updateCvolPlaceholder();onCvol()" style="width:auto;padding:0.05rem 0.3rem;font-size:0.74rem;" title="utile = balle sertie (exact, méthode ogive dans l'eau) ; pleine = étui vide au ras (×facteur, approché)">
          <option value="usable" selected>utile (balle sertie)</option>
          <option value="full">pleine (étui vide)</option>
        </select>
      </div></div>
    <p class="vm-note" id="derived"></p>
    <div class="vm-io vm-noprint">
      <button type="button" class="vm-btn2" onclick="exportEstimateur()" title="Télécharger la configuration (et les résultats) en CSV">&#11015;&nbsp;Exporter CSV</button>
      <button type="button" class="vm-btn2" onclick="document.getElementById('impEst').click()" title="Charger une configuration depuis un CSV">&#11014;&nbsp;Importer CSV</button>
      <input type="file" id="impEst" accept=".csv,text/csv" style="display:none" onchange="if(this.files[0]){importEstimateur(this.files[0]);this.value='';}">
    </div>
    <p class="vm-note vm-noprint" style="margin-top:.3rem;">CSV <code>champ,valeur,unité</code> (lignes <code>#</code> = commentaires). À l'import, seules les <em>entrées</em> sont reprises ; vitesse et pression sont recalculées.</p>
  </div>
  <div class="vm-panel">
    <div id="cartdiag" style="text-align:center;margin-bottom:0.6rem;"></div>
    <div id="danger" class="vm-alert" style="display:none;"></div>
    <div class="vm-kpi">
      <div><div class="vm-out"><span id="o_v">—</span> <small class="vm-unit" id="u_v" onclick="toggleU('v')">m/s</small></div><small>vitesse <span id="o_vtag" class="vm-tag">à froid ±10%</span></small></div>
      <div><div class="vm-out" id="pbox"><span id="o_p">—</span> <small class="vm-unit" id="u_p" onclick="toggleU('p')">bar</small></div><small>pression <span class="vm-tag">indicative</span> <span id="o_pcip"></span></small>
        <div class="vm-bar" id="pbar"><span style="width:0"></span></div></div>
    </div>
    <div style="position:relative;">
      <div id="plot" style="width:100%;height:440px;cursor:zoom-in;"></div>
      <button type="button" id="plotZoom" class="vm-noprint" title="Agrandir le graphe (ou cliquez sur la courbe)" onclick="openPlotModal()" style="position:absolute;top:4px;right:6px;border:1px solid var(--color-border);background:rgba(255,255,255,0.85);border-radius:4px;cursor:pointer;font-size:1rem;line-height:1;padding:.15rem .35rem;">&#9974;</button>
    </div>
    <p class="vm-note" id="warn"></p>
    <div class="vm-noprint" style="margin-top:0.5rem">
      <button type="button" id="toExt" class="vm-print" onclick="toExterior()" disabled style="opacity:.5">&#127919;&nbsp;Vers la balistique extérieure</button>
      <small class="vm-note" style="display:inline;margin-left:.4rem">envoie V₀, masse et calibre au calculateur de trajectoire (renseignez-y le CB et la longueur de balle)</small>
    </div>
  </div>
</div>

<p class="vm-note vm-noprint" style="margin-top:1rem;">Approche complémentaire pour l'effet de la <strong>longueur de canon</strong> et de la <strong>température</strong> :
<a href="/techniques/balistique/velocite.php">estimateur de vitesse (loi de canon &amp; Le Duc)</a>.</p>

<details id="ladder" style="margin-top:1.2rem;border:1px solid var(--color-border);border-radius:var(--radius);padding:0.4rem 1rem;">
<summary style="cursor:pointer;font-weight:600;">Ladder (développement de charge)</summary>
<div style="font-size:0.9rem;">
<p class="vm-note">L'estimateur <strong>planifie</strong> et <strong>borne</strong> votre ladder, et <strong>exploite</strong> vos vitesses mesurées. Il <strong>ne désigne pas</strong> le nœud : le modèle est lisse (pas d'harmoniques de canon) — c'est au tir + à la statistique (≥ 20 coups, SD/ES) de trancher. <a href="/wiki/doku.php?id=technique:rechargement_balistique">méthode ladder &rarr;</a></p>
<h4 style="margin:.6rem 0 .2rem;">1. Plan — fenêtre sûre (charge de départ → max fabricant)</h4>
<div style="display:flex;flex-wrap:wrap;gap:.6rem;align-items:flex-end;margin-bottom:.4rem;">
  <div class="vm-field" style="max-width:110px;margin:0;"><label>Min <span class="vm-unit" id="u_lad" onclick="toggleLadUnit()">gr</span></label><input type="number" id="ladMin" step="0.1" placeholder="fabricant" oninput="calc()"></div>
  <div class="vm-field" style="max-width:110px;margin:0;"><label>Départ</label><input type="number" id="ladStart" step="0.1" placeholder="= min" oninput="calc()"></div>
  <div class="vm-field" style="max-width:110px;margin:0;"><label>Max</label><input type="number" id="ladMax" step="0.1" placeholder="fabricant" oninput="calc()"></div>
  <div class="vm-field" style="max-width:110px;margin:0;"><label>Incrément</label><input type="number" id="ladStep" value="0.2" step="0.05" min="0.01" oninput="calc()"></div>
  <label style="font-size:.8rem;display:flex;align-items:center;gap:.3rem;cursor:pointer;"><input type="checkbox" id="ladPlot" onchange="calc()"> courbes du ladder sur le graphe</label>
</div>
<div id="ladTable" style="overflow-x:auto;"></div>
<h4 style="margin:.8rem 0 .2rem;">2. Exploiter — vos vitesses mesurées (ancrage carabine)</h4>
<p class="vm-note">Une ligne par tir : <code>charge,vitesse</code> (unités courantes). L'outil cale l'efficacité de <em>votre</em> carabine et compare mesuré vs courbe lisse.</p>
<textarea id="ladMeas" rows="5" style="width:100%;font-family:monospace;font-size:0.82rem;" placeholder="41.0, 845&#10;41.2, 851&#10;41.4, 858&#10;..." oninput="fitLadder()"></textarea>
<div id="ladFit" style="margin-top:0.4rem;"></div>
<div class="vm-io vm-noprint">
  <button type="button" class="vm-btn2" onclick="exportLadder()" title="Télécharger les mesures en CSV">&#11015;&nbsp;Exporter CSV</button>
  <button type="button" class="vm-btn2" onclick="document.getElementById('impLad').click()" title="Charger des mesures depuis un CSV">&#11014;&nbsp;Importer CSV</button>
  <input type="file" id="impLad" accept=".csv,text/csv" style="display:none" onchange="if(this.files[0]){importLadder(this.files[0]);this.value='';}">
  <small class="vm-note">format : en-tête <code>charge,vitesse</code> puis une ligne par tir (valeurs dans les <strong>unités courantes</strong> ; lignes <code>#</code> ignorées)</small>
</div>
</div>
</details>

<details id="howto" class="vm-howto vm-noprint" style="margin-top:1.2rem;border:1px solid var(--color-border);border-radius:var(--radius);padding:0.4rem 1rem;">
<summary style="cursor:pointer;font-weight:600;">Comment ça marche&nbsp;?</summary>
<div style="font-size:0.9rem;">
<p>L'estimateur n'effectue <strong>aucune simulation de combustion</strong> et n'utilise pas la « fonction de forme » propriétaire des logiciels fermés. Il repose sur deux <strong>efficacités</strong> physiquement interprétables, <strong>calées sur des données fabricant</strong>&nbsp;:</p>
<ul>
<li>la <strong>vitesse</strong> découle de l'énergie de la poudre via l'efficacité balistique η<sub>b</sub>&nbsp;;</li>
<li>la <strong>pression</strong> d'une efficacité piézométrique η<sub>p</sub> (sortie <strong>la plus incertaine</strong>, donnée à titre indicatif).</li>
</ul>
<p>La précision se resserre selon ce que vous lui fournissez&nbsp;:</p>
<ul>
<li><strong>à froid</strong> (cartouche + poudre + charge)&nbsp;: vitesse à <strong>±10&nbsp;%</strong>&nbsp;;</li>
<li><strong>ancré</strong> sur les données fabricant de votre couple cartouche/poudre&nbsp;: <strong>~5&nbsp;%</strong>&nbsp;;</li>
<li><strong>avec votre vitesse mesurée</strong> au chronographe (champ ci-dessus)&nbsp;: <strong>quasi-exact</strong>.</li>
</ul>
<p>Catalogue&nbsp;: <strong>~470 poudres</strong> (Reload Swiss, Accurate/Ramshot et Vihtavuori calibrées&nbsp;; autres marques en repli énergie effective). Les situations à risque (<strong>surpression vs limite CIP, surremplissage</strong>) sont signalées en couleur — à titre indicatif.</p>
<p><strong>Pour aller plus loin&nbsp;:</strong>
<a href="/wiki/doku.php?id=technique:balistique_interieure">théorie</a> ·
<a href="/wiki/doku.php?id=technique:balistique_interieure_validation">validation &amp; limites</a> ·
<a href="/wiki/doku.php?id=technique:donnees_balistiques">produire vos données</a> ·
<a href="https://github.com/fbastin/tireur_reloaded/blob/main/docs/MODEL.md" target="_blank" rel="noopener">description formelle du modèle (EN)</a>.</p>
</div>
</details>

</div>

<div id="plotModal" class="vm-noprint" onclick="if(event.target===this)closePlotModal()" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:1000;align-items:center;justify-content:center;padding:2vh 2vw;">
  <div style="background:#fff;border-radius:8px;width:96vw;max-width:1150px;height:92vh;display:flex;flex-direction:column;box-shadow:0 12px 48px rgba(0,0,0,0.45);">
    <div style="display:flex;justify-content:space-between;align-items:center;padding:.5rem .8rem;border-bottom:1px solid #ddd;">
      <strong style="color:#222;">Pression / vitesse &mdash; vue agrandie</strong>
      <button type="button" onclick="closePlotModal()" title="Fermer (Échap)" style="border:none;background:none;font-size:1.4rem;line-height:1;cursor:pointer;color:#444;">&times;</button>
    </div>
    <div id="plotBig" style="flex:1;min-height:0;"></div>
  </div>
</div>

<script>
let CAL={}, PWD={}, COEF={}, ANCH={}, BRRANK={}, STARTC={}, DIMS={}, RIFLE={eeff:null,n:0}, LAST=null;
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
  const u=U[k]; u.cur=u.opt[(u.opt.indexOf(u.cur)+1)%u.opt.length];
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
Promise.all([
  fetch('data/calibers.json').then(r=>r.json()),
  fetch('data/powders.json').then(r=>r.json()),
  fetch('data/model_coefficients.json').then(r=>r.json()),
  fetch('data/anchors.json').then(r=>r.json()).catch(()=>({anchors:{}})),
  fetch('data/burn_rate_chart.txt').then(r=>r.text()).catch(()=>''),   // classement vitesse de combustion (optionnel)
  fetch('data/start_charges.local.json').then(r=>r.json()).catch(()=>({charges:{}})), // charges de départ (optionnel, live)
  fetch('data/cartridge_dims.json').then(r=>r.json()).catch(()=>({dims:{}})), // cotes pour le schéma (optionnel)
]).then(([cal,pwd,coef,anc,brTxt,sc,cd])=>{
  CAL=cal.calibers; PWD=pwd.powders; COEF=coef; ANCH=anc.anchors||{}; STARTC=sc.charges||{}; DIMS=cd.dims||{};
  const cs=document.getElementById('cart');
  const byName=(a,b)=>a.localeCompare(b,'fr',{numeric:true});
  [['Armes longues','rifle'],['Armes de poing','handgun']].forEach(([label,type])=>{
    const keys=Object.keys(CAL).filter(k=>(CAL[k].type||'rifle')===type).sort(byName);
    if(!keys.length) return;
    const og=document.createElement('optgroup'); og.label=label;
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
  onCart(); applyStartLoad(); renderDiag(); calc();
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
    if(ranked.length){const g=document.createElement('optgroup');g.label='Vitesse de combustion ('+(fast?'rapide → lente':'lente → rapide')+')';ranked.forEach(k=>opt(g,k));ps.appendChild(g);}
    const g2=document.createElement('optgroup');g2.label='Autres poudres (A → Z)';rest.forEach(k=>opt(g2,k));ps.appendChild(g2);
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
const limSrc=(c)=> c && c.pmax_src==='SAAMI' ? 'SAAMI' : 'CIP';   // source de la limite de pression
// volume utile d'étui effectif (cm³) : saisie utilisateur si fournie, sinon nominal cartouche.
function effCV(cart){ return (CVOL>0 ? CVOL : cart.case_vol_cm3); }
// Sensibilité au volume d'étui pour les prédictions ANCRÉES (eeff/np figés au volume
// nominal du fabricant) : on applique le GRADIENT du modèle global (η_b·Qex / E_eff pour
// l'énergie, η_p(fill,Re) pour la pression) entre le fill utilisateur et le fill nominal.
// Au volume nominal -> {e:1, np:1}. C'est la philosophie « ancre = niveau, modèle = pente ».
function cvScales(cart,pw,C_gr){
  if(!(CVOL>0 && pw.pcd>0)) return {e:1,np:1};
  const Cg=C_gr*GR_G, A=Math.PI*(cart.bore_mm/1000)**2/4, refTravel=(refBbl(cart)-cart.case_mm)/1000;
  const cvN=cart.case_vol_cm3, cvU=CVOL;
  const ffN=(Cg/(pw.pcd/1000))/cvN, ffU=(Cg/(pw.pcd/1000))/cvU;
  const eg=(ff)=> (pw.Qex&&pw.Ba) ? lin(COEF.eta_b.coef,[1,ff,pw.Ba])*pw.Qex : lin(COEF.e_eff.coef,[1,ff]);
  const npg=(ff,cv)=>lin(COEF.eta_p.coef,[1,ff,Math.log(1+(A*refTravel)/(cv*1e-6))]);
  return { e: eg(ffU)/eg(ffN), np: npg(ffU,cvU)/npg(ffN,cvN) };
}
// ancre effective : override carabine (ladder) > ancre fabricant du couple
function effAnchor(ck,pk){
  const anc=ANCH[ck+'|'+pk]||null;
  if(RIFLE.eeff!=null) return {eeff:RIFLE.eeff, np:anc?anc.np:null, n:RIFLE.n, rifle:true};
  return anc;
}
// prédiction modèle (v0, Pmax, fill, %CIP) pour une charge ARBITRAIRE (sans vmeas/température)
function modelVP(cart,pw,m_gr,C_gr,bbl,anc){
  const C=C_gr*G, d=cart.bore_mm/1000, A=Math.PI*d*d/4;
  const uT=(bbl-cart.case_mm)/1000, refTravel=(refBbl(cart)-cart.case_mm)/1000;  // course canon réel / référence
  const cv=effCV(cart);
  const ReP=1+(A*refTravel)/(cv*1e-6), hasPcd=pw.pcd>0, Cg=C_gr*GR_G;
  const fill=hasPcd?(Cg/(pw.pcd/1000))/cv*100:null, ff=hasPcd?fill/100:1;
  const load={m_gr:m_gr,C_gr:C_gr,d_mm:cart.bore_mm,barrel_mm:bbl,case_mm:cart.case_mm};
  const loadP={m_gr:m_gr,C_gr:C_gr,d_mm:cart.bore_mm,barrel_mm:refBbl(cart),case_mm:cart.case_mm};
  const npG=lin(COEF.eta_p.coef,[1,ff,Math.log(ReP)]), sc=(v,La,Lb)=>VelocityModel.scaleByBarrel(v,La,Lb);
  const S=cvScales(cart,pw,C_gr);                        // sensibilité au volume d'étui saisi (1,1 si nominal)
  let vRef,vUser,eta_p;
  if(anc && anc.rifle){ vUser=EnergyModel.velocityFromEnergy(load,anc.eeff*S.e); vRef=sc(vUser,uT,refTravel); eta_p=anc.np!=null?anc.np*S.np:npG; }
  else if(anc){ vRef=EnergyModel.velocityFromEnergy(load,anc.eeff*S.e); vUser=sc(vRef,refTravel,uT); eta_p=anc.np!=null?anc.np*S.np:npG; }
  else if(pw.Qex&&pw.Ba){ eta_p=npG; vRef=EnergyModel.velocityFromEnergy(load,lin(COEF.eta_b.coef,[1,ff,pw.Ba])*pw.Qex*1000); vUser=sc(vRef,refTravel,uT); }
  else { eta_p=npG; vRef=EnergyModel.velocityFromEnergy(load,lin(COEF.e_eff.coef,[1,ff])); vUser=sc(vRef,refTravel,uT); }
  const Pmax=EnergyModel.predictPmax(loadP,vRef,eta_p);        // pression au canon de référence (depuis vRef)
  return {v0:vUser,Pmax,fill,pct:cart.pmax_cip_bar?Pmax/cart.pmax_cip_bar*100:null};
}
// --- unité de masse du ladder (gr <-> g) ---
const ladToGr=(v)=> LADUNIT==='g' ? v/GR_G : v;           // saisie (LADUNIT) -> grains
const ladDisp=(gr)=> LADUNIT==='g' ? gr*GR_G : gr;        // grains -> affichage (LADUNIT)
function toggleLadUnit(){
  ['ladMin','ladStart','ladStep'].forEach(id=>{const el=document.getElementById(id);const v=parseFloat(el.value);
    if(v>0) el.value=(LADUNIT==='gr'? v*GR_G : v/GR_G).toFixed(LADUNIT==='gr'?3:2);});
  LADUNIT = LADUNIT==='gr' ? 'g' : 'gr';
  document.getElementById('u_lad').textContent=LADUNIT;
  calc();
}
// pré-remplit Min/Départ depuis la fenêtre fabricant (au changement de couple)
function setLadderDefaults(){
  const sc=STARTC[document.getElementById('cart').value+'|'+document.getElementById('pwd').value];
  const dp=(gr)=>ladDisp(gr).toFixed(LADUNIT==='gr'?2:3);
  document.getElementById('ladMin').value   = sc ? dp(sc.c)    : '';
  document.getElementById('ladStart').value = sc ? dp(sc.c)    : '';
  document.getElementById('ladMax').value   = sc ? dp(sc.cmax) : '';
}
// fenêtre effective (en GRAINS) : départ/min utilisateur, plafond = max fabricant (sécurité)
function ladderWindow(){
  const ck=document.getElementById('cart').value, pk=document.getElementById('pwd').value;
  const sc=STARTC[ck+'|'+pk];
  let mfgMin,mfgMax,note;
  if(sc){ mfgMin=sc.c; mfgMax=sc.cmax; note='fenêtre fabricant '+ladDisp(sc.c).toFixed(2)+'–'+ladDisp(sc.cmax).toFixed(2)+' '+LADUNIT+' (balle '+sc.m+' gr)'; }
  else { const cur=toGr(+document.getElementById('c').value,U.charge.cur); mfgMin=cur*0.95; mfgMax=cur; note='⚠ <strong>pas de données fabricant</strong> pour ce couple (poudre sans « ● ») — choisissez une poudre marquée ● ou saisissez <strong>Min / Max / Incrément</strong> à la main.'; }
  const fMin=parseFloat(document.getElementById('ladMin').value), fStart=parseFloat(document.getElementById('ladStart').value),
        fMax=parseFloat(document.getElementById('ladMax').value), fStep=parseFloat(document.getElementById('ladStep').value);
  const minG=fMin>0?ladToGr(fMin):mfgMin, cmax=fMax>0?ladToGr(fMax):mfgMax, over=cmax>mfgMax+1e-9;
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
  if(!(w.cmax>w.startG+1e-6&&w.stepG>0)){el.innerHTML='<p class="vm-note">'+w.note+' — plage trop étroite (départ ≥ max ou incrément nul).</p>';return;}
  const anc=effAnchor(ck,pk), charges=ladderCharges(w);
  let t='<table style="width:100%;border-collapse:collapse;font-size:0.82rem;"><tr style="text-align:right"><th style="text-align:left">Charge ('+LADUNIT+')</th><th>v₀ ('+U.v.cur+')</th><th>Pmax ('+U.p.cur+')</th><th>% '+limSrc(cart)+'</th></tr>';
  for(const Cg of charges){ const r=modelVP(cart,pw,m_gr,Cg,bbl,anc);
    const col=r.pct==null?'':(r.pct>100?'color:#c0392b;font-weight:600':r.pct>=85?'color:#e67e22':'');
    t+='<tr style="text-align:right;border-top:1px solid var(--color-border);'+col+'"><td style="text-align:left">'+ladDisp(Cg).toFixed(LADUNIT==='gr'?2:3)+'</td><td>'+frMs(r.v0,U.v.cur).toFixed(0)+'</td><td>'+frBar(r.Pmax,U.p.cur).toFixed(0)+'</td><td>'+(r.pct!=null?r.pct.toFixed(0)+'%':'—')+'</td></tr>'; }
  const overTxt = w.over ? ' <strong style="color:#c0392b">⚠ max saisi '+ladDisp(w.cmax).toFixed(2)+' '+LADUNIT+' &gt; max fabricant '+ladDisp(w.mfgMax).toFixed(2)+' '+LADUNIT+' — zone NON couverte par les données, danger.</strong>' : '';
  el.innerHTML='<p class="vm-note">'+w.note+(anc&&anc.rifle?' · <strong>ancré carabine</strong>':'')+overTxt+' — Pmax/%'+limSrc(cart)+' indicatifs (sous-estimés). Ne dépassez pas le max fabricant.</p>'+t+'</table>';
}
function fitLadder(){
  const out=document.getElementById('ladFit'); if(!out)return;
  const m_gr=toGr(+document.getElementById('m').value,U.mass.cur), m=m_gr*G;
  const pts=document.getElementById('ladMeas').value.split('\n').map(l=>l.trim()).filter(Boolean)
    .map(l=>l.split(/[,;\t ]+/).map(parseFloat)).filter(a=>a.length>=2&&a[0]>0&&a[1]>0)
    .map(a=>({C:toGr(a[0],U.charge.cur), v:toMs(a[1],U.v.cur)}));
  if(pts.length<2){out.innerHTML=pts.length?'<p class="vm-note">Au moins 2 lignes valides nécessaires.</p>':'';return;}
  const eeffs=pts.map(p=>{const C=p.C*G,me=m+C/3;return me*p.v*p.v/(2*C);});
  const eeff=eeffs.reduce((a,b)=>a+b,0)/eeffs.length, vmean=pts.reduce((s,p)=>s+p.v,0)/pts.length;
  const resid=pts.map(p=>{const C=p.C*G,me=m+C/3;return p.v-Math.sqrt(2*eeff*C/me);});
  const rms=Math.sqrt(resid.reduce((s,x)=>s+x*x,0)/resid.length);
  let t='<table style="width:100%;border-collapse:collapse;font-size:0.8rem;"><tr style="text-align:right"><th style="text-align:left">Charge</th><th>v₀ mes.</th><th>v₀ lissé</th><th>écart</th></tr>';
  pts.forEach((p,i)=>{const C=p.C*G,me=m+C/3,vf=Math.sqrt(2*eeff*C/me);t+='<tr style="text-align:right;border-top:1px solid var(--color-border)"><td style="text-align:left">'+frChg(p.C).toFixed(2)+'</td><td>'+frMs(p.v,U.v.cur).toFixed(0)+'</td><td>'+frMs(vf,U.v.cur).toFixed(0)+'</td><td>'+(resid[i]>=0?'+':'')+frMs(resid[i],U.v.cur).toFixed(0)+'</td></tr>';});
  out.innerHTML='<p class="vm-note">E_eff carabine ≈ <strong>'+Math.round(eeff)+'&nbsp;J/kg</strong> · écart mesuré/lissé <strong>'+frMs(rms,U.v.cur).toFixed(1)+'&nbsp;'+U.v.cur+'</strong> ('+(rms/vmean*100).toFixed(1)+'%) — <em>proxy de consistance ; un vrai SD/ES exige des tirs répétés à charge fixe</em>. '
    +'<button type="button" class="vm-print" onclick="applyRifle('+eeff.toFixed(1)+','+pts.length+')">Ancrer cette carabine</button></p>'+t+'</table>';
}
function applyRifle(eeff,n){ RIFLE.eeff=eeff; RIFLE.n=n; calc(); renderLadder(); }
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
    ['Type', cart.type==='handgun'?'Arme de poing':'Carabine'],
    ['Ø balle', num(cart.bore_mm,2)+' mm'],
    ['Longueur d\'étui', num(cart.case_mm,1)+' mm'],
    ['Volume d\'étui', cart.case_vol_cm3?num(cart.case_vol_cm3,2)+' cm³':'—'],
    ['Pression max C.I.P.', cart.pmax_cip_bar?num(cart.pmax_cip_bar,0)+' bar':'—'],
    ['Canon d\'essai', cart.test_barrel_mm?num(cart.test_barrel_mm,0)+' mm':'—'],
  ];
  const specs='<div style="flex:1 1 150px;min-width:150px;text-align:left;">'
    +'<div style="font-weight:700;color:var(--color-accent);margin-bottom:0.35rem;">'+n+'</div>'
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
function cvFullFactor(c){ return (c && c.type==='handgun') ? 0.66 : 0.87; }
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
  el.placeholder = isFinite(nom) ? 'nominal '+nom.toFixed(2) : 'nominal'; }
function lin(coef,feats){return coef.reduce((s,w,i)=>s+w*feats[i],0);}
function calc(){
  const cart=CAL[document.getElementById('cart').value], pw=PWD[document.getElementById('pwd').value];
  if(!cart||!pw) return;
  const m_gr=toGr(+document.getElementById('m').value,U.mass.cur), C_gr=toGr(+document.getElementById('c').value,U.charge.cur), bbl=toMm(+document.getElementById('bbl').value,U.bbl.cur);
  const vmeas=toMs(parseFloat(document.getElementById('vmeas').value),U.vmeas.cur);
  if(!(m_gr>0&&C_gr>0&&bbl>cart.case_mm)) return;
  const m=m_gr*G, C=C_gr*G;            // m_e=m+C/3 désormais calculé dans EnergyModel
  const d=cart.bore_mm/1000, A=Math.PI*d*d/4, travel=(bbl-cart.case_mm)/1000;
  const Cg=C_gr*0.06479891;                             // charge (g)
  const hasPcd=pw.pcd>0;                                 // densité bulk optionnelle
  const cv_cm3=effCV(cart), caseVol=cv_cm3*1e-6;         // volume utile (saisi ou nominal), m³
  const Re=1+(A*travel)/caseVol;                         // rapport de détente du canon réel (affichage, courbe Le Duc)
  // Pression : course de RÉFÉRENCE (tube d'essai), indépendante du canon utilisateur
  const refBbl_mm=refBbl(cart), refTravel=(refBbl_mm-cart.case_mm)/1000, ReP=1+(A*refTravel)/caseVol;
  const fill = hasPcd ? (Cg/(pw.pcd/1000))/cv_cm3*100 : null;
  const fillFrac = hasPcd ? fill/100 : 1.0;             // nominal 100 % si pcd inconnu
  // formules physiques centralisées dans EnergyModel (évite la duplication) ; load reprend la géométrie courante
  const load={m_gr:m_gr,C_gr:C_gr,d_mm:cart.bore_mm,barrel_mm:bbl,case_mm:cart.case_mm};
  const loadP={m_gr:m_gr,C_gr:C_gr,d_mm:cart.bore_mm,barrel_mm:refBbl_mm,case_mm:cart.case_mm}; // pour la pression (canon réf.)
  // priorité : mesure utilisateur > ancrage fabricant (couple connu) > à froid
  const anc=effAnchor(document.getElementById('cart').value,document.getElementById('pwd').value);
  let vRef, vUser, eta_p, anchored=false, dataAnchor=false, viaEeff=false, eta_b=null;
  const npGlobal=lin(COEF.eta_p.coef,[1,fillFrac,Math.log(ReP)]);   // η_p à la course de référence
  // Loi de canon (Powley/Litz) : v à La -> v à Lb. La calibration (η_b, eeff fabricant) donne la
  // vitesse au canon de RÉFÉRENCE ; on la met à l'échelle du canon réel. Une vitesse fournie par
  // l'utilisateur (mesure, ancrage carabine) est déjà au canon réel -> on la ramène à la réf. pour la pression.
  const sc=(v,La,Lb)=>VelocityModel.scaleByBarrel(v,La,Lb);
  const S=cvScales(cart,pw,C_gr);                        // sensibilité au volume d'étui saisi (1,1 si nominal)
  if(vmeas>0){                                          // vitesse MESURÉE au canon de l'utilisateur
    vUser=vmeas; vRef=sc(vmeas,travel,refTravel); anchored=true;
    eta_p=(anc&&anc.np!=null)?anc.np*S.np:npGlobal;      // ancre sans np (VV, vitesse seule) -> η_p global
  } else if(anc && anc.rifle){                          // ancrage carabine (ladder) : eeff au canon réel
    vUser=EnergyModel.velocityFromEnergy(load,anc.eeff*S.e); vRef=sc(vUser,travel,refTravel); eta_p=(anc.np!=null)?anc.np*S.np:npGlobal; dataAnchor=true;
  } else if(anc){                                       // données fabricant (canon d'essai ≈ réf.)
    vRef=EnergyModel.velocityFromEnergy(load,anc.eeff*S.e); vUser=sc(vRef,refTravel,travel); eta_p=(anc.np!=null)?anc.np*S.np:npGlobal; dataAnchor=true;
  } else if(pw.Qex && pw.Ba){
    eta_p=npGlobal;
    eta_b=lin(COEF.eta_b.coef,[1,fillFrac,pw.Ba]);
    vRef=EnergyModel.velocityFromEnergy(load,eta_b*pw.Qex*1000); vUser=sc(vRef,refTravel,travel);
  } else {                                               // repli énergie effective E_eff
    eta_p=npGlobal;
    const Eeff=lin(COEF.e_eff.coef,[1,fillFrac]); vRef=EnergyModel.velocityFromEnergy(load,Eeff); vUser=sc(vRef,refTravel,travel); viaEeff=true;
  }
  // correction thermique (Litz) sur la vitesse PRÉDITE (pas sur une vitesse mesurée par l'utilisateur), réf. 21 °C
  const Tc=toC(parseFloat(document.getElementById('temp').value),U.temp.cur);
  let tempApplied=false;
  if(!anchored && isFinite(Tc) && Tc!==21){ vUser=VelocityModel.tempCorrect(vUser,Tc-21); tempApplied=true; }
  const v0=vUser;                                        // vitesse affichée = au canon de l'utilisateur
  const Pmax=EnergyModel.predictPmax(loadP,vRef,eta_p);  // bar — canon de référence (pic chambre ~indép. du canon réel)
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
    if(pct>100){al.push(`Surpression estimée : <strong>${pct.toFixed(0)} %</strong> de la limite ${limSrc(cart)} (${frBar(pcip,U.p.cur).toFixed(0)} ${U.p.cur})`);lvl='danger';}
    else if(pct>=85){al.push(`Pression proche de la limite ${limSrc(cart)} (${pct.toFixed(0)} %)`);lvl='warn';}
  }
  if(hasPcd){
    if(fill>110){al.push(`Surremplissage : taux <strong>${fill.toFixed(0)} %</strong>`);lvl='danger';}
    else if(fill>105){al.push(`Charge comprimée (${fill.toFixed(0)} %)`);if(lvl!=='danger')lvl='warn';}
    else if(fill<55){al.push(`Charge très faible (${fill.toFixed(0)} %)`);if(lvl!=='danger')lvl='warn';}
  }
  const dz=document.getElementById('danger');
  if(al.length){dz.style.display='block';dz.className='vm-alert '+(lvl==='danger'?'danger':'warn');
    dz.innerHTML=`<strong>${lvl==='danger'?'⛔ DANGER':'⚠ Attention'}</strong> — ${al.join(' · ')}. <em>Estimation indicative — confirmez dans les données fabricant.</em>`;}
  else dz.style.display='none';
  document.getElementById('pbox').className='vm-out'+(pct==null?'':(pct>100?' danger':pct>=85?' warn':''));
  document.getElementById('o_pcip').textContent = pct!=null ? `· ${pct.toFixed(0)} % ${limSrc(cart)}` : '(limite de pression non renseignée)';
  const pbar=document.getElementById('pbar');
  if(pct!=null){pbar.style.display='block';pbar.className='vm-bar'+(pct>100?' danger':pct>=85?' warn':'');pbar.firstElementChild.style.width=Math.min(pct,100)+'%';}
  else pbar.style.display='none';
  const ancFlag = !!(anc && anc.mhflag);                 // couple fabricant atypique (garde-fou Mayer-Hart)
  const tag=document.getElementById('o_vtag');
  tag.textContent=anchored?'ancrée (vos données)':dataAnchor?(anc&&anc.rifle?'ancrée carabine (ladder)':ancFlag?'ancrée fabricant (à vérifier)':'ancrée fabricant ~5%'):'à froid ±10%';
  tag.className='vm-tag'+((anchored||dataAnchor)?' anchored':'');
  const fillTxt = (hasPcd ? `Remplissage ${fill.toFixed(0)} %` : 'Remplissage inconnu (densité bulk absente)') + (CVOL>0?` · volume étui perso ${cv_cm3.toFixed(2)} cm³`:'');
  const mode = anchored?'mesure perso' : dataAnchor?`${anc&&anc.rifle?'ancré carabine':'ancré fabricant'} (n=${anc.n}${anc.np==null?', vitesse seule — pression η_p global':''})` : (viaEeff?'énergie générique (Qex/Ba inconnus)':'η_b '+eta_b.toFixed(3));
  const pRefTxt = Math.abs(bbl-refBbl_mm)>1 ? `  ·  v₀ mise à l'échelle du canon saisi (loi Powley/Litz), pression au canon réf. ${frMm(refBbl_mm,U.bbl.cur).toFixed(U.bbl.cur==='in'?1:0)} ${U.bbl.cur}` : '';
  document.getElementById('derived').textContent=
    `${fillTxt}  ·  rapport de détente ${Re.toFixed(1)}  ·  ${mode}  ·  η_p ${eta_p.toFixed(3)}${pRefTxt}`;
  let w='Pression indicative (η_p ±15 % au mieux) — ne jamais valider une charge sur cette base.';
  if(hasPcd && fill>110) w='⚠ Remplissage > 110 % (charge comprimée hors domaine usuel) : estimation peu fiable.';
  else if(hasPcd && fill<55) w='⚠ Remplissage faible (< 55 %) : hors domaine usuel, estimation peu fiable.';
  if(CVOL>0 && cart.case_vol_cm3>0){ const r=CVOL/cart.case_vol_cm3; if(r<0.6||r>1.6) w='⚠ Volume d\'étui (ramené en utile) très éloigné du nominal ('+(r*100).toFixed(0)+' %) — vérifiez l\'unité (cm³ / gr H₂O) et le mode (utile balle sertie / pleine étui vide). '+w; }
  if(!pcip) w='ℹ Cartouche sans limite de pression publiée dans nos données (absente du standard SAAMI carabine ; valeur CIP non renseignée) → pas de bandes de sécurité ni de % limite sur cette cartouche. '+w;
  if(!hasPcd) w='Densité bulk inconnue : remplissage et pression approximés (nominal). '+w;
  if(viaEeff) w='Poudre sans Qex/Ba connus : vitesse via énergie générique (±10 %). '+w;
  if(ancFlag) w='⚠ Données fabricant atypiques pour ce couple (cohérence vitesse/pression Mayer-Hart hors norme : '+anc.mhr.toFixed(0)+' %) : ancrage pression à confirmer. '+w;
  if(tempApplied) w='Vitesse ajustée à '+Tc.toFixed(0)+' °C (réf. 21 °C, sensibilité Litz générique ~1,8 fps/°C — indicatif, varie selon la poudre). '+w;
  const bRatio=travel/refTravel;
  if(bRatio<0.6||bRatio>1.7) w='⚠ Canon très éloigné de la longueur de référence ('+frMm(refBbl_mm,U.bbl.cur).toFixed(U.bbl.cur==='in'?1:0)+' '+U.bbl.cur+') : mise à l\'échelle de v₀ extrapolée (loi de puissance), à confirmer au chronographe. '+w;
  document.getElementById('warn').textContent=w;
  renderLadder();
  // courbe Le Duc (couche 3)
  const ld=VelocityModel.leDuc(v0,Pmax,m,C,d,travel);
  if(!ld){Plotly.purge('plot');
    document.getElementById('warn').textContent='Courbe pression/vitesse indisponible : paramètres hors domaine du modèle Le Duc (combinaison inhabituelle). Les estimations chiffrées ci-dessus restent valides. '+w;
    return;}
  const xs=[],vs=[],ps=[];
  for(let i=0;i<=100;i++){const x=travel*i/100;xs.push(frMm(x*1000,U.bbl.cur));vs.push(frMs(ld.v(x),U.v.cur));ps.push(frBar(ld.P_bar(x),U.p.cur));}
  const pcipD=pcip?frBar(pcip,U.p.cur):null;
  // Superposition des courbes du LADDER (en plus clair) : une P(x)/v(x) par charge de la fenêtre.
  const ladTraces=[]; let maxLadP=0;
  if(document.getElementById('ladPlot') && document.getElementById('ladPlot').checked){
    const w=ladderWindow(), chgs=ladderCharges(w), anc2=effAnchor(document.getElementById('cart').value,document.getElementById('pwd').value);
    const stride=Math.max(1,Math.ceil(chgs.length/14));     // ~14 courbes max pour rester lisible
    for(let k=0;k<chgs.length;k+=stride){ const Cg=chgs[k];
      const r=modelVP(cart,pw,m_gr,Cg,bbl,anc2); if(!(r.v0>0&&r.Pmax>0))continue;
      const lk=VelocityModel.leDuc(r.v0,r.Pmax,m,Cg*G,d,travel); if(!lk)continue;
      const xk=[],vk=[],pk2=[]; for(let i=0;i<=50;i++){const x=travel*i/50;xk.push(frMm(x*1000,U.bbl.cur));vk.push(frMs(lk.v(x),U.v.cur));const P=frBar(lk.P_bar(x),U.p.cur);pk2.push(P);if(P>maxLadP)maxLadP=P;}
      const nm=ladDisp(Cg).toFixed(LADUNIT==='gr'?1:3)+' '+LADUNIT;
      ladTraces.push({x:xk,y:pk2,yaxis:'y',name:nm,legendgroup:'lad',showlegend:false,line:{color:'rgba(192,57,43,0.20)',width:1},hoverinfo:'name'});
      ladTraces.push({x:xk,y:vk,yaxis:'y2',name:nm,legendgroup:'lad',showlegend:false,line:{color:'rgba(41,128,185,0.20)',width:1},hoverinfo:'name'});
    }
  }
  // seuils selon la source de la pression max : CIP (P_K 1,15× / P_E 1,25×) ou
  // SAAMI (MPSM 1,065× / épreuve = MPLM×1,30 ≈ 1,334× MAP).
  // SAAMI : CV 0,04 (carabine) / 0,05 (pistolet) → MPSM 1,065×/1,078× et épreuve = MPLM×1,30.
  const saami=cart.pmax_src==='SAAMI', hg=cart.type==='handgun';
  const kMul=saami?(hg?1.078:1.065):1.15, eMul=saami?((hg?1.0316:1.026)*1.30):1.25;
  // si la limite est connue, on étend l'axe au-dessus de l'épreuve pour montrer toutes les zones
  const yTop=Math.max(pcipD?Math.max(Math.max.apply(null,ps),pcipD*eMul)*1.06:Math.max.apply(null,ps)*1.12, maxLadP*1.06);
  const lay={margin:{t:10,r:55,l:55,b:80},legend:{orientation:'h',x:0.5,xanchor:'center',y:-0.28,yanchor:'top'},
     xaxis:{title:'Course de la balle ('+U.bbl.cur+')'},
     yaxis:{title:'Pression ('+U.p.cur+')',rangemode:'tozero',range:[0,yTop]},
     yaxis2:{title:'Vitesse ('+U.v.cur+')',overlaying:'y',side:'right',rangemode:'tozero'}};
  if(pcipD){
    // Seuils : limite moyenne (P_max CIP / MAP SAAMI), seuil intermédiaire (P_K 1,15× cartouche
    // CIP / MPSM 1,065× échantillon SAAMI) et épreuve arme (P_E 1,25× CIP / MPLM×1,30 ≈1,33× MAP
    // SAAMI). pWarn=0,90× : marge de sous-estimation du modèle — une estimation entrant ici peut
    // déjà valoir la limite en réalité.
    const pK=pcipD*kMul, pE=pcipD*eMul, pWarn=pcipD*0.9, u=U.p.cur;
    const fx=(x,n)=>x.toFixed(n).replace('.',',');
    const limLab=saami?'MAP SAAMI':'P_max C.I.P.', kLab=saami?('MPSM '+fx(kMul,3)+'× (échantillon)'):'P_K 1,15× (cartouche)', eLab=saami?('épreuve '+fx(eMul,2)+'× (proof)'):'P_E 1,25× (épreuve arme)';
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
      lab(pWarn,'top','≈90 % · marge modèle',  '#b9770e',false),
      lab(pcipD,'bottom',limLab+' '+pcipD.toFixed(0)+' '+u,'#c0392b',true),
      lab(pK,'bottom',kLab,'#a93226',false),
      lab(pE,'bottom',eLab,'#7b241c',false)
    ];
  }
  const plotData=[
    ...ladTraces,                                            // courbes du ladder (clair) sous les courbes principales
    {x:xs,y:ps,name:'Pression ('+U.p.cur+')'+(ladTraces.length?' · charge courante':''),yaxis:'y',line:{color:'#c0392b',width:2.5}},
    {x:xs,y:vs,name:'Vitesse ('+U.v.cur+')'+(ladTraces.length?' · charge courante':''),yaxis:'y2',line:{color:'#2980b9',width:2.5}}
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
  if(val===''||!isFinite(parseFloat(val))){ if(key==='vmeas')el.value=''; return; }
  val=parseFloat(val); unit=unit||U[key].cur; const cur=U[key].cur; let out;
  if(key==='mass'||key==='charge'){ const gr=toGr(val,unit); out=cur==='g'?gr*GR_G:gr; el.value=out.toFixed(key==='mass'?1:2); }
  else if(key==='bbl'){ const mm=toMm(val,unit); el.value=(cur==='in'?frMm(mm,'in'):mm).toFixed(cur==='in'?1:0); }
  else if(key==='vmeas'){ el.value=frMs(toMs(val,unit),cur).toFixed(0); }
  else if(key==='temp'){ const c=toC(val,unit); el.value=(cur==='°F'?c*9/5+32:c).toFixed(0); }
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
  ];
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
      if(!l||l[0]==='#')return; const f=csvSplit(l);
      if(f.length>=2 && f[0].toLowerCase()!=='champ') map[f[0].toLowerCase()]=f; });
    RIFLE.eeff=null;                                   // couple potentiellement changé -> réinit ancrage carabine
    if(map.cartouche && CAL[map.cartouche[1]]){ document.getElementById('cart').value=map.cartouche[1]; renderDiag(); }
    if(map.poudre && PWD[map.poudre[1]]) populatePowders(map.poudre[1]);
    [['masse','mass'],['charge','charge'],['canon','bbl'],['vitesse_mesuree','vmeas'],['temperature','temp']]
      .forEach(([k,key])=>{ if(map[k]) importField(key,map[k][1],map[k][2]); });
    calc();
  };
  r.readAsText(file);
}
// Ladder : exporte les mesures saisies (charge,vitesse) dans les unités courantes
function exportLadder(){
  const ck=document.getElementById('cart').value, pk=document.getElementById('pwd').value;
  const pts=document.getElementById('ladMeas').value.split('\n').map(l=>l.trim()).filter(Boolean)
    .map(l=>l.split(/[,;\t ]+/).map(parseFloat)).filter(a=>a.length>=2&&a[0]>0&&a[1]>0);
  const rows=[
    ['# Tireur.org — Ladder (mesures de vitesse)'],
    ['# couple: '+ck+' | '+pk+' — unités: charge='+U.charge.cur+', vitesse='+U.v.cur],
    ['charge','vitesse'],
    ...pts.map(a=>[a[0],a[1]]),
  ];
  csvDownload('ladder_'+ck.replace(/\W+/g,'_')+'.csv',csvRows(rows));
}
// Ladder : importe des mesures depuis un CSV vers la zone de saisie, puis ajuste
function importLadder(file){
  const r=new FileReader();
  r.onload=()=>{
    const lines=r.result.split(/\r?\n/).map(l=>l.replace(/^﻿/,'').trim())
      .filter(l=>l&&l[0]!=='#').map(csvSplit)
      .filter(a=>a.length>=2&&isFinite(parseFloat(a[0]))&&isFinite(parseFloat(a[1])))
      .map(a=>parseFloat(a[0])+', '+parseFloat(a[1]));
    document.getElementById('ladMeas').value=lines.join('\n');
    fitLadder();
  };
  r.readAsText(file);
}
// Ouvre la note « Comment ça marche » si on arrive via #howto (lien profond depuis le guide)
(function(){function openHowto(){if(location.hash==='#howto'){var d=document.getElementById('howto');if(d){d.open=true;d.scrollIntoView();}}}
window.addEventListener('hashchange',openHowto);openHowto();})();
</script>

<?php include '../../foot.php'; ?>
