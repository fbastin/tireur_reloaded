<?php
$title = "Estimateur de balistique intérieure — Tireur.org";
$meta_description = "Estimateur de vitesse et de pression au rechargement par modèle énergie-efficacité, calé sur données fabricant et affinable sur vos propres mesures. Courbe pression/vitesse (Le Duc).";
include '../../header.php';
?>
<link rel="stylesheet" href="/rechargement/css/reloading.css" />
<script src="https://cdn.plot.ly/plotly-2.35.2.min.js" charset="utf-8"></script>
<script src="energy_model.js"></script>
<script src="velocity_model.js"></script>

<style>
.vm-grid { display:grid; grid-template-columns: 340px 1fr; gap:1.5rem; margin-top:1rem; align-items:start; }
@media (max-width: 860px){ .vm-grid { grid-template-columns:1fr; } }
.vm-panel { background:var(--color-surface); border:1px solid var(--color-border); border-radius:var(--radius); padding:1rem; }
.vm-field { margin-bottom:0.7rem; }
.vm-field label { display:block; font-size:0.85rem; color:var(--color-text-light); margin-bottom:0.2rem; }
.vm-field input, .vm-field select { width:100%; padding:0.4rem 0.6rem; border:1px solid var(--color-border); border-radius:var(--radius); background:var(--color-bg); color:var(--color-text); }
.vm-out { font-size:1.6rem; font-weight:700; color:var(--color-accent); }
.vm-out small { font-size:0.8rem; font-weight:400; color:var(--color-text-light); }
.vm-kpi { display:flex; gap:1.8rem; flex-wrap:wrap; margin:0.3rem 0 1rem; }
.vm-banner { background:rgba(231,76,60,0.07); border:1px solid #e74c3c; border-left:4px solid #e74c3c; border-radius:var(--radius); padding:0.8rem 1rem; font-size:0.88rem; margin-bottom:1rem; }
.vm-banner strong { color:#c0392b; }
.vm-note { font-size:0.82rem; color:var(--color-text-light); }
.vm-tag { display:inline-block; font-size:0.72rem; padding:0.1rem 0.5rem; border-radius:10px; background:var(--color-border); color:var(--color-text-light); }
.vm-tag.anchored { background:#2E5A1C; color:#fff; }
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
<strong>calées sur des données fabricant</strong>, sans la fonction de forme propriétaire de l'ancien solveur.
Base de composants dérivée de <em>Gordon's Reloading Tool</em> (Gordon †) et de la communauté (CC0).</p>

<div class="vm-banner">
<strong>&#9888; Estimation, pas une donnée de sécurité.</strong> À froid, la <strong>vitesse</strong> est donnée à
<strong>±10&nbsp;%</strong> et la <strong>pression à titre purement indicatif</strong> (±15&nbsp;% au mieux) :
une charge réellement au-dessus de la limite CIP peut s'afficher « sûre ». Affinez en saisissant
<strong>votre vitesse mesurée</strong>. Vérifiez toujours dans les données officielles du fabricant.
<a href="/wiki/doku.php?id=technique:balistique_interieure_validation">Validation &amp; limites &rarr;</a>
&middot; <a href="/wiki/doku.php?id=technique:donnees_balistiques">produire vos données &rarr;</a>
</div>

<div class="vm-grid">
  <div class="vm-panel">
    <div class="vm-field"><label>Cartouche</label><select id="cart" onchange="onCart();calc()"></select></div>
    <div class="vm-field"><label>Poudre (Reload Swiss)</label><select id="pwd" onchange="calc()"></select></div>
    <div class="vm-field"><label>Masse de balle (gr)</label><input type="number" id="m" value="150" step="1" oninput="calc()"></div>
    <div class="vm-field"><label>Charge (gr)</label><input type="number" id="c" value="44" step="0.1" oninput="calc()"></div>
    <div class="vm-field"><label>Longueur de canon (mm)</label><input type="number" id="bbl" value="600" step="5" oninput="calc()"></div>
    <hr style="border:none;border-top:1px dashed var(--color-border);margin:0.6rem 0;">
    <div class="vm-field"><label>Vitesse mesurée v&#8320; (m/s) — <em>optionnel, pour ancrer</em></label><input type="number" id="vmeas" placeholder="ex. 845" step="1" oninput="calc()"></div>
    <p class="vm-note" id="derived"></p>
  </div>
  <div class="vm-panel">
    <div class="vm-kpi">
      <div><div class="vm-out"><span id="o_v">—</span> <small>m/s</small></div><small>vitesse <span id="o_vtag" class="vm-tag">à froid ±10%</span></small></div>
      <div><div class="vm-out"><span id="o_p">—</span> <small>bar</small></div><small>pression <span class="vm-tag">indicative</span></small></div>
    </div>
    <div id="plot" style="width:100%;height:330px;"></div>
    <p class="vm-note" id="warn"></p>
  </div>
</div>

<p class="vm-note" style="margin-top:1rem;">Approche complémentaire pour l'effet de la <strong>longueur de canon</strong> et de la <strong>température</strong> :
<a href="/techniques/balistique/velocite.php">estimateur de vitesse (loi de canon &amp; Le Duc)</a>. Pour explorer les courbes de combustion :
<a href="/reloading/tireur_reloaded/legacy/">simulateur GRT</a> (indicatif, hérité).</p>

<details id="howto" class="vm-howto" style="margin-top:1.2rem;border:1px solid var(--color-border);border-radius:var(--radius);padding:0.4rem 1rem;">
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
<p>Catalogue de poudres actuel&nbsp;: gamme <strong>Reload Swiss</strong> et <strong>Vihtavuori</strong> (en cours d'extension depuis les guides fabricant).</p>
<p><strong>Pour aller plus loin&nbsp;:</strong>
<a href="/wiki/doku.php?id=technique:balistique_interieure">théorie</a> ·
<a href="/wiki/doku.php?id=technique:balistique_interieure_validation">validation &amp; limites</a> ·
<a href="/wiki/doku.php?id=technique:donnees_balistiques">produire vos données</a> ·
<a href="https://github.com/fbastin/tireur_reloaded/blob/main/docs/MODEL.md" target="_blank" rel="noopener">description formelle du modèle (EN)</a>.</p>
</div>
</details>

</div>

<script>
let CAL={}, PWD={}, COEF={};
const G=6.479891e-5;
Promise.all([
  fetch('data/calibers.json').then(r=>r.json()),
  fetch('data/powders.json').then(r=>r.json()),
  fetch('data/model_coefficients.json').then(r=>r.json()),
]).then(([cal,pwd,coef])=>{
  CAL=cal.calibers; PWD=pwd.powders; COEF=coef;
  const cs=document.getElementById('cart');
  Object.keys(CAL).forEach(k=>{const o=document.createElement('option');o.value=k;o.textContent=k;cs.appendChild(o);});
  cs.value='308 Win.';
  const ps=document.getElementById('pwd');
  const pLabel=(k)=>/^RS\d/.test(k) ? 'Reload Swiss '+k.slice(2) : 'Vihtavuori '+k;
  Object.keys(PWD).sort((a,b)=>pLabel(a).localeCompare(pLabel(b),'fr',{numeric:true})).forEach(k=>{const o=document.createElement('option');o.value=k;o.textContent=pLabel(k);ps.appendChild(o);});
  ps.value='RS52';
  onCart(); calc();
});
function onCart(){ // défaut canon selon type (pistolet court)
  const c=CAL[document.getElementById('cart').value]; if(!c)return;
  document.getElementById('bbl').value = c.case_mm<30 ? 122 : 600;
}
function lin(coef,feats){return coef.reduce((s,w,i)=>s+w*feats[i],0);}
function calc(){
  const cart=CAL[document.getElementById('cart').value], pw=PWD[document.getElementById('pwd').value];
  if(!cart||!pw) return;
  const m_gr=+document.getElementById('m').value, C_gr=+document.getElementById('c').value, bbl=+document.getElementById('bbl').value;
  const vmeas=parseFloat(document.getElementById('vmeas').value);
  if(!(m_gr>0&&C_gr>0&&bbl>cart.case_mm)) return;
  const m=m_gr*G, C=C_gr*G, m_e=m+C/3;
  const d=cart.bore_mm/1000, A=Math.PI*d*d/4, travel=(bbl-cart.case_mm)/1000;
  const Cg=C_gr*0.06479891, pcd=pw.pcd/1000;
  const fill=(Cg/pcd)/cart.case_vol_cm3*100;            // %
  const caseVol=cart.case_vol_cm3*1e-6;                  // m³
  const Re=1+(A*travel)/caseVol;
  // η à froid (coefficients dérivés)
  const eta_b=lin(COEF.eta_b.coef,[1,fill/100,pw.Ba]);
  const eta_p=lin(COEF.eta_p.coef,[1,fill/100,Math.log(Re)]);
  let v0=Math.sqrt(2*eta_b*C*pw.Qex*1000/m_e), anchored=false;
  if(vmeas>0){v0=vmeas;anchored=true;}                  // ancrage utilisateur
  const Pmax=0.5*m_e*v0*v0/(eta_p*A*travel)/1e5;         // bar (depuis v0 retenu)
  // affichage
  document.getElementById('o_v').textContent=v0.toFixed(0);
  document.getElementById('o_p').textContent=Pmax.toFixed(0);
  const tag=document.getElementById('o_vtag');
  tag.textContent=anchored?'ancrée (vos données)':'à froid ±10%';
  tag.className='vm-tag'+(anchored?' anchored':'');
  document.getElementById('derived').textContent=
    `Remplissage ${fill.toFixed(0)} %  ·  rapport de détente ${Re.toFixed(1)}  ·  η_b ${eta_b.toFixed(3)}  ·  η_p ${eta_p.toFixed(3)}`;
  let w='Pression indicative (η_p ±15 % au mieux) — ne jamais valider une charge sur cette base.';
  if(fill>110) w='⚠ Remplissage > 110 % (charge comprimée hors domaine usuel) : estimation peu fiable.';
  else if(fill<55) w='⚠ Remplissage faible (< 55 %) : hors domaine usuel, estimation peu fiable.';
  document.getElementById('warn').textContent=w;
  // courbe Le Duc (couche 3)
  const ld=VelocityModel.leDuc(v0,Pmax,m,C,d,travel);
  if(!ld){Plotly.purge('plot');return;}
  const xs=[],vs=[],ps=[];
  for(let i=0;i<=100;i++){const x=travel*i/100;xs.push(x*1000);vs.push(ld.v(x));ps.push(ld.P_bar(x));}
  Plotly.react('plot',[
    {x:xs,y:ps,name:'Pression (bar)',yaxis:'y',line:{color:'#c0392b'}},
    {x:xs,y:vs,name:'Vitesse (m/s)',yaxis:'y2',line:{color:'#2980b9'}}
  ],{margin:{t:10,r:50,l:55,b:40},legend:{orientation:'h'},
     xaxis:{title:'Course de la balle (mm)'},
     yaxis:{title:'Pression (bar)',rangemode:'tozero'},
     yaxis2:{title:'Vitesse (m/s)',overlaying:'y',side:'right',rangemode:'tozero'}},
    {displayModeBar:false,responsive:true});
}
// Ouvre la note « Comment ça marche » si on arrive via #howto (lien profond depuis le guide)
(function(){function openHowto(){if(location.hash==='#howto'){var d=document.getElementById('howto');if(d){d.open=true;d.scrollIntoView();}}}
window.addEventListener('hashchange',openHowto);openHowto();})();
</script>

<?php include '../../foot.php'; ?>
