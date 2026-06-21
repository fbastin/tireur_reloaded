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
@media print { .vm-noprint { display:none !important; } .vm-grid { grid-template-columns:1fr 1fr; } .vm-panel { border:none; background:#fff; } }
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

<div class="vm-noprint" style="text-align:right;margin-bottom:0.3rem;"><button type="button" class="vm-print" onclick="window.print()">&#128424;&nbsp;Imprimer</button></div>

<div class="vm-grid">
  <div class="vm-panel">
    <div class="vm-field"><label>Préréglage système</label>
      <select id="unitSystem" onchange="applySystem()">
        <option value="metric">Métrique international (g, mm, m/s, bar)</option>
        <option value="imperial">Impérial (gr, in, fps, psi)</option>
        <option value="mixed" selected>Hybride (gr, mm, m/s, bar)</option>
      </select></div>
    <div class="vm-field"><label>Cartouche</label><select id="cart" onchange="onCart();calc()"></select></div>
    <div class="vm-field"><label>Poudre</label><select id="pwd" onchange="calc()"></select></div>
    <div class="vm-field"><label>Masse de balle <span class="vm-unit" id="u_mass" onclick="toggleU('mass')">gr</span></label><input type="number" id="m" value="150" step="1" oninput="calc()"></div>
    <div class="vm-field"><label>Charge <span class="vm-unit" id="u_charge" onclick="toggleU('charge')">gr</span></label><input type="number" id="c" value="44" step="0.1" oninput="calc()"></div>
    <div class="vm-field"><label>Longueur de canon <span class="vm-unit" id="u_bbl" onclick="toggleU('bbl')">mm</span></label><input type="number" id="bbl" value="600" step="5" oninput="calc()"></div>
    <hr style="border:none;border-top:1px dashed var(--color-border);margin:0.6rem 0;">
    <div class="vm-field"><label>Vitesse mesurée v&#8320; <span class="vm-unit" id="u_vmeas" onclick="toggleU('vmeas')">m/s</span> — <em>optionnel, pour ancrer</em></label><input type="number" id="vmeas" placeholder="ex. 845" step="1" oninput="calc()"></div>
    <p class="vm-note" id="derived"></p>
  </div>
  <div class="vm-panel">
    <div id="danger" class="vm-alert" style="display:none;"></div>
    <div class="vm-kpi">
      <div><div class="vm-out"><span id="o_v">—</span> <small class="vm-unit" id="u_v" onclick="toggleU('v')">m/s</small></div><small>vitesse <span id="o_vtag" class="vm-tag">à froid ±10%</span></small></div>
      <div><div class="vm-out" id="pbox"><span id="o_p">—</span> <small class="vm-unit" id="u_p" onclick="toggleU('p')">bar</small></div><small>pression <span class="vm-tag">indicative</span> <span id="o_pcip"></span></small>
        <div class="vm-bar" id="pbar"><span style="width:0"></span></div></div>
    </div>
    <div id="plot" style="width:100%;height:330px;"></div>
    <p class="vm-note" id="warn"></p>
  </div>
</div>

<p class="vm-note vm-noprint" style="margin-top:1rem;">Approche complémentaire pour l'effet de la <strong>longueur de canon</strong> et de la <strong>température</strong> :
<a href="/techniques/balistique/velocite.php">estimateur de vitesse (loi de canon &amp; Le Duc)</a>.</p>

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
<p>Catalogue&nbsp;: <strong>~480 poudres</strong> (Reload Swiss et Vihtavuori calibrées&nbsp;; autres marques en repli énergie effective). Les situations à risque (<strong>surpression vs limite CIP, surremplissage</strong>) sont signalées en couleur — à titre indicatif.</p>
<p><strong>Pour aller plus loin&nbsp;:</strong>
<a href="/wiki/doku.php?id=technique:balistique_interieure">théorie</a> ·
<a href="/wiki/doku.php?id=technique:balistique_interieure_validation">validation &amp; limites</a> ·
<a href="/wiki/doku.php?id=technique:donnees_balistiques">produire vos données</a> ·
<a href="https://github.com/fbastin/tireur_reloaded/blob/main/docs/MODEL.md" target="_blank" rel="noopener">description formelle du modèle (EN)</a>.</p>
</div>
</details>

</div>

<script>
let CAL={}, PWD={}, COEF={}, ANCH={};
const G=6.479891e-5;
// --- Gestion des unités (mêmes conventions que la balistique extérieure) ---
const GR_G=0.06479891, IN_MM=25.4, MS_FPS=3.280839895, BAR_PSI=14.5037738;
const U={
  mass:  {cur:'gr',  opt:['gr','g'],    el:'m'},
  charge:{cur:'gr',  opt:['gr','g'],    el:'c'},
  bbl:   {cur:'mm',  opt:['mm','in'],   el:'bbl'},
  vmeas: {cur:'m/s', opt:['m/s','fps'], el:'vmeas'},
  v:     {cur:'m/s', opt:['m/s','fps']},      // sortie vitesse
  p:     {cur:'bar', opt:['bar','psi']},      // sortie pression
};
// vers les unités canoniques (gr, mm, m/s)
const toGr=(v,u)=>u==='g'?  v/GR_G : v;
const toMm=(v,u)=>u==='in'? v*IN_MM : v;
const toMs=(v,u)=>u==='fps'?v/MS_FPS: v;
// depuis les unités canoniques (gr/mm/m/s/bar) vers l'affichage
const frMm =(v,u)=>u==='in'? v/IN_MM  : v;
const frMs =(v,u)=>u==='fps'?v*MS_FPS : v;
const frBar=(v,u)=>u==='psi'?v*BAR_PSI: v;
function toggleU(k){
  const u=U[k]; u.cur=u.opt[(u.opt.indexOf(u.cur)+1)%u.opt.length];
  document.getElementById('u_'+k).textContent=u.cur;
  if(u.el){const el=document.getElementById(u.el),v=parseFloat(el.value);
    if(el.value!==''&&isFinite(v)){
      if(k==='mass')        el.value=(u.cur==='g'? v*GR_G : v/GR_G).toFixed(1);
      else if(k==='charge') el.value=(u.cur==='g'? v*GR_G : v/GR_G).toFixed(2);
      else if(k==='bbl')    el.value=(u.cur==='in'? v/IN_MM : v*IN_MM).toFixed(u.cur==='in'?1:0);
      else if(k==='vmeas')  el.value=(u.cur==='fps'? v*MS_FPS : v/MS_FPS).toFixed(0);
    }
  }
  calc();
}
function applySystem(){
  const sys=document.getElementById('unitSystem').value;
  const want = sys==='metric'   ? {mass:'g', charge:'g', bbl:'mm', vmeas:'m/s', v:'m/s', p:'bar'}
            : sys==='imperial' ? {mass:'gr',charge:'gr',bbl:'in', vmeas:'fps', v:'fps', p:'psi'}
            :                    {mass:'gr',charge:'gr',bbl:'mm', vmeas:'m/s', v:'m/s', p:'bar'}; // hybride
  Object.keys(want).forEach(k=>{ if(U[k].cur!==want[k]) toggleU(k); });
}
Promise.all([
  fetch('data/calibers.json').then(r=>r.json()),
  fetch('data/powders.json').then(r=>r.json()),
  fetch('data/model_coefficients.json').then(r=>r.json()),
  fetch('data/anchors.json').then(r=>r.json()).catch(()=>({anchors:{}})),
]).then(([cal,pwd,coef,anc])=>{
  CAL=cal.calibers; PWD=pwd.powders; COEF=coef; ANCH=anc.anchors||{};
  const cs=document.getElementById('cart');
  Object.keys(CAL).forEach(k=>{const o=document.createElement('option');o.value=k;o.textContent=k;cs.appendChild(o);});
  cs.value='308 Win.';
  const ps=document.getElementById('pwd');
  const pLabel=(k)=>{const p=PWD[k];return (p.mfg?p.mfg+' ':'')+(p.name||k);};
  Object.keys(PWD).sort((a,b)=>pLabel(a).localeCompare(pLabel(b),'fr',{numeric:true})).forEach(k=>{const o=document.createElement('option');o.value=k;o.textContent=pLabel(k);ps.appendChild(o);});
  ps.value='RS52';
  onCart(); calc();
});
function onCart(){ // défaut canon selon type (pistolet court)
  const c=CAL[document.getElementById('cart').value]; if(!c)return;
  const bbl_mm = c.case_mm<30 ? 122 : 600;
  document.getElementById('bbl').value = U.bbl.cur==='in' ? frMm(bbl_mm,'in').toFixed(1) : bbl_mm;
}
function lin(coef,feats){return coef.reduce((s,w,i)=>s+w*feats[i],0);}
function calc(){
  const cart=CAL[document.getElementById('cart').value], pw=PWD[document.getElementById('pwd').value];
  if(!cart||!pw) return;
  const m_gr=toGr(+document.getElementById('m').value,U.mass.cur), C_gr=toGr(+document.getElementById('c').value,U.charge.cur), bbl=toMm(+document.getElementById('bbl').value,U.bbl.cur);
  const vmeas=toMs(parseFloat(document.getElementById('vmeas').value),U.vmeas.cur);
  if(!(m_gr>0&&C_gr>0&&bbl>cart.case_mm)) return;
  const m=m_gr*G, C=C_gr*G, m_e=m+C/3;
  const d=cart.bore_mm/1000, A=Math.PI*d*d/4, travel=(bbl-cart.case_mm)/1000;
  const Cg=C_gr*0.06479891;                             // charge (g)
  const hasPcd=pw.pcd>0;                                 // densité bulk optionnelle
  const caseVol=cart.case_vol_cm3*1e-6;                  // m³
  const Re=1+(A*travel)/caseVol;                         // indépendant de pcd
  const fill = hasPcd ? (Cg/(pw.pcd/1000))/cart.case_vol_cm3*100 : null;
  const fillFrac = hasPcd ? fill/100 : 1.0;             // nominal 100 % si pcd inconnu
  // priorité : mesure utilisateur > ancrage fabricant (couple connu) > à froid
  const anc=ANCH[document.getElementById('cart').value+'|'+document.getElementById('pwd').value]||null;
  let v0, eta_p, anchored=false, dataAnchor=false, viaEeff=false, eta_b=null;
  if(vmeas>0){
    v0=vmeas; anchored=true;
    eta_p=anc?anc.np:lin(COEF.eta_p.coef,[1,fillFrac,Math.log(Re)]);
  } else if(anc){                                        // données fabricant pour ce couple
    v0=Math.sqrt(2*anc.eeff*C/m_e); eta_p=anc.np; dataAnchor=true;
  } else if(pw.Qex && pw.Ba){
    eta_p=lin(COEF.eta_p.coef,[1,fillFrac,Math.log(Re)]);
    eta_b=lin(COEF.eta_b.coef,[1,fillFrac,pw.Ba]);
    v0=Math.sqrt(2*eta_b*C*pw.Qex*1000/m_e);
  } else {                                               // repli énergie effective E_eff
    eta_p=lin(COEF.eta_p.coef,[1,fillFrac,Math.log(Re)]);
    const Eeff=lin(COEF.e_eff.coef,[1,fillFrac]); v0=Math.sqrt(2*Eeff*C/m_e); viaEeff=true;
  }
  const Pmax=0.5*m_e*v0*v0/(eta_p*A*travel)/1e5;         // bar (depuis v0 retenu)
  // affichage
  document.getElementById('o_v').textContent=frMs(v0,U.v.cur).toFixed(0);
  document.getElementById('o_p').textContent=frBar(Pmax,U.p.cur).toFixed(0);
  // --- situations dangereuses (surpression / surremplissage), affichage proéminent ---
  const pcip=cart.pmax_cip_bar||null, pct=pcip?Pmax/pcip*100:null;
  let lvl='ok'; const al=[];
  if(pct!=null){
    if(pct>100){al.push(`Surpression estimée : <strong>${pct.toFixed(0)} %</strong> de la limite CIP (${frBar(pcip,U.p.cur).toFixed(0)} ${U.p.cur})`);lvl='danger';}
    else if(pct>=85){al.push(`Pression proche de la limite CIP (${pct.toFixed(0)} %)`);lvl='warn';}
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
  document.getElementById('o_pcip').textContent = pct!=null ? `· ${pct.toFixed(0)} % CIP` : '(limite CIP non renseignée)';
  const pbar=document.getElementById('pbar');
  if(pct!=null){pbar.style.display='block';pbar.className='vm-bar'+(pct>100?' danger':pct>=85?' warn':'');pbar.firstElementChild.style.width=Math.min(pct,100)+'%';}
  else pbar.style.display='none';
  const tag=document.getElementById('o_vtag');
  tag.textContent=anchored?'ancrée (vos données)':dataAnchor?'ancrée fabricant ~5%':'à froid ±10%';
  tag.className='vm-tag'+((anchored||dataAnchor)?' anchored':'');
  const fillTxt = hasPcd ? `Remplissage ${fill.toFixed(0)} %` : 'Remplissage inconnu (densité bulk absente)';
  const mode = anchored?'mesure perso' : dataAnchor?`ancré fabricant (n=${anc.n})` : (viaEeff?'énergie générique (Qex/Ba inconnus)':'η_b '+eta_b.toFixed(3));
  document.getElementById('derived').textContent=
    `${fillTxt}  ·  rapport de détente ${Re.toFixed(1)}  ·  ${mode}  ·  η_p ${eta_p.toFixed(3)}`;
  let w='Pression indicative (η_p ±15 % au mieux) — ne jamais valider une charge sur cette base.';
  if(hasPcd && fill>110) w='⚠ Remplissage > 110 % (charge comprimée hors domaine usuel) : estimation peu fiable.';
  else if(hasPcd && fill<55) w='⚠ Remplissage faible (< 55 %) : hors domaine usuel, estimation peu fiable.';
  if(!hasPcd) w='Densité bulk inconnue : remplissage et pression approximés (nominal). '+w;
  if(viaEeff) w='Poudre sans Qex/Ba connus : vitesse via énergie générique (±10 %). '+w;
  document.getElementById('warn').textContent=w;
  // courbe Le Duc (couche 3)
  const ld=VelocityModel.leDuc(v0,Pmax,m,C,d,travel);
  if(!ld){Plotly.purge('plot');return;}
  const xs=[],vs=[],ps=[];
  for(let i=0;i<=100;i++){const x=travel*i/100;xs.push(frMm(x*1000,U.bbl.cur));vs.push(frMs(ld.v(x),U.v.cur));ps.push(frBar(ld.P_bar(x),U.p.cur));}
  const pcipD=pcip?frBar(pcip,U.p.cur):null;
  const yTop=Math.max(Math.max.apply(null,ps), pcipD||0)*1.12;
  const lay={margin:{t:10,r:55,l:55,b:40},legend:{orientation:'h'},
     xaxis:{title:'Course de la balle ('+U.bbl.cur+')'},
     yaxis:{title:'Pression ('+U.p.cur+')',rangemode:'tozero',range:[0,yTop]},
     yaxis2:{title:'Vitesse ('+U.v.cur+')',overlaying:'y',side:'right',rangemode:'tozero'}};
  if(pcipD){
    lay.shapes=[
      {type:'rect',xref:'paper',x0:0,x1:1,yref:'y',y0:pcipD,y1:yTop,fillcolor:'rgba(192,57,43,0.10)',line:{width:0},layer:'below'},
      {type:'line',xref:'paper',x0:0,x1:1,yref:'y',y0:pcipD,y1:pcipD,line:{color:'#c0392b',width:2.5,dash:'dash'},layer:'above'}
    ];
    lay.annotations=[{xref:'paper',x:0.5,xanchor:'center',yref:'y',y:pcipD,yanchor:'bottom',text:'<b>Limite CIP '+pcipD.toFixed(0)+' '+U.p.cur+'</b>',showarrow:false,font:{size:11,color:'#c0392b'},bgcolor:'rgba(255,255,255,0.75)'}];
  }
  Plotly.react('plot',[
    {x:xs,y:ps,name:'Pression ('+U.p.cur+')',yaxis:'y',line:{color:'#c0392b'}},
    {x:xs,y:vs,name:'Vitesse ('+U.v.cur+')',yaxis:'y2',line:{color:'#2980b9'}}
  ],lay,{displayModeBar:false,responsive:true});
}
// Ouvre la note « Comment ça marche » si on arrive via #howto (lien profond depuis le guide)
(function(){function openHowto(){if(location.hash==='#howto'){var d=document.getElementById('howto');if(d){d.open=true;d.scrollIntoView();}}}
window.addEventListener('hashchange',openHowto);openHowto();})();
</script>

<?php include '../../foot.php'; ?>
