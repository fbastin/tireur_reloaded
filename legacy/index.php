<?php
$title = "Gordon's Reloading Tool — Simulation Balistique Interne";
$meta_description = "Simulateur de balistique interne basé sur les équations thermodynamiques (RK4) et l'équation d'état de Noble-Abel. Optimisation des charges de rechargement en temps réel.";
include '../../../header.php';
?>

<link rel="stylesheet" href="/css/ballistics.css?v=20260604a">
<!-- Plotly.js -->
<script src="https://cdn.plot.ly/plotly-2.35.2.min.js" charset="utf-8"></script>
<script src="grt_solver.js"></script>

<style>
/* Custom premium styles for GRT Clone */
.grt-layout {
    display: grid;
    grid-template-columns: 350px 1fr;
    gap: 1.5rem;
    margin-top: 1.5rem;
    align-items: start;
}
@media (max-width: 900px) {
    .grt-layout {
        grid-template-columns: 1fr;
    }
}
.grt-visualizer-box {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    padding: 1rem;
    margin-bottom: 1rem;
    text-align: center;
}
.grt-visualizer-svg {
    max-width: 150px;
    height: auto;
    margin: 0 auto;
}
.grt-warning-box {
    padding: 0.75rem 1rem;
    border-radius: var(--radius);
    margin-bottom: 1rem;
    font-size: 0.88rem;
    font-weight: 600;
    line-height: 1.4;
    display: none;
}
.grt-warning-danger {
    background: rgba(231, 76, 60, 0.15);
    border: 1px solid #e74c3c;
    color: #e74c3c;
}
.grt-warning-warning {
    background: rgba(241, 196, 15, 0.15);
    border: 1px solid #f1c40f;
    color: #f1c40f;
}
.grt-warning-safe {
    background: rgba(46, 204, 113, 0.15);
    border: 1px solid #2ecc71;
    color: #2ecc71;
}
.grt-disclaimer {
    background: rgba(231, 76, 60, 0.08);
    border: 1px solid #e74c3c;
    border-left: 4px solid #e74c3c;
    border-radius: var(--radius);
    padding: 0.85rem 1rem;
    margin-bottom: 1rem;
    font-size: 0.86rem;
    line-height: 1.5;
    color: var(--color-text);
}
.grt-disclaimer strong { color: #c0392b; }

/* Tabs for Charts */
.grt-tabs {
    display: flex;
    border-bottom: 1px solid var(--color-border);
    margin-bottom: 1rem;
    gap: 0.5rem;
}
.grt-tab-btn {
    background: transparent;
    border: none;
    border-bottom: 3px solid transparent;
    color: var(--color-text-light);
    font-weight: 600;
    padding: 0.6rem 1rem;
    cursor: pointer;
    font-size: 0.88rem;
    transition: all 0.2s;
}
.grt-tab-btn:hover {
    color: var(--color-accent);
}
.grt-tab-btn.active {
    color: var(--color-accent);
    border-bottom-color: var(--color-accent);
}
.grt-tab-content {
    display: none;
}
.grt-tab-content.active {
    display: block;
}

/* Custom inputs styling */
.grt-override-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.8rem;
    color: var(--color-text-light);
    margin-top: 0.8rem;
    padding-top: 0.5rem;
    border-top: 1px dashed var(--color-border);
    cursor: pointer;
}
.grt-override-header:hover {
    color: var(--color-accent);
}
.grt-override-section {
    display: none;
    margin-top: 0.5rem;
}
.btn-export-ballistics {
    background: var(--color-accent);
    color: #fff;
    border: none;
    border-radius: var(--radius);
    padding: 0.75rem 1rem;
    font-weight: 600;
    cursor: pointer;
    width: 100%;
    margin-top: 1rem;
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: background 0.2s;
}
.btn-export-ballistics:hover {
    filter: brightness(1.1);
}
.slider-container {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}
.slider-container input[type="range"] {
    flex-grow: 1;
    height: 6px;
    background: var(--color-border);
    outline: none;
    border-radius: 3px;
    cursor: pointer;
}
</style>

<div id="cadre">
    <?php
    $breadcrumb_links = [
        ['url' => '/index.php', 'label' => 'Accueil'],
        ['url' => '/rechargement/', 'label' => 'Rechargement'],
        ['url' => '/reloading/tireur_reloaded/', 'label' => 'Estimateur'],
        ['label' => 'Simulateur GRT (hérité)'],
    ];
    include $_SERVER['DOCUMENT_ROOT'] . '/includes/breadcrumb.php';
    ?>

    <h1>Gordon's Reloading Tool (GRT) — Ballistique Interne</h1>
    <p>Simulateur thermodynamique de combustion et pression. Les calculs physiques s'effectuent localement et en temps réel dans votre navigateur. 
    Pour compléter vos analyses, consultez notre <a href="/techniques/balistique/">Guide de Balistique Extérieure</a> et le manuel de rechargement complet <a href="/reloading/The_Art_of_the_Precision_Rifle.pdf" target="_blank">The Art of the Precision Rifle (PDF)</a>.</p>

    <!-- Avertissement permanent : l'outil sous-estime pression et vitesse (validation
         contre données fabricant). Voir ROADMAP.md, Phase 6. Ne JAMAIS développer une
         charge sur ces seules valeurs. -->
    <div class="grt-disclaimer noprint">
        <strong><i class="li-alert-triangle"></i> Outil indicatif &amp; pédagogique — ne pas l'utiliser pour développer des charges réelles.</strong>
        Le modèle interne <strong>sous-estime la pression (de l'ordre de 25–35 %) et la vitesse (~15–25 %)</strong> par rapport aux données fabricant.
        Une charge réellement <em>au-dessus</em> de la limite CIP peut donc s'afficher « sûre ». Utilisez-le pour comprendre les <em>tendances</em>
        (effet d'un changement de charge, de poudre, de canon…), puis <strong>vérifiez toute charge dans les données officielles du fabricant
        ou dans l'application GRT</strong> avant tout tir.
        <a href="/wiki/doku.php?id=technique:balistique_interieure_validation">Pourquoi&nbsp;? &mdash; validation &amp; limites &rarr;</a>
        <br><strong>Pour une vitesse fiable</strong>, pr&eacute;f&eacute;rez l'<a href="/reloading/tireur_reloaded/">Estimateur de balistique int&eacute;rieure</a> (mod&egrave;le &eacute;nergie-efficacit&eacute;, ancr&eacute; sur vos mesures).
    </div>

    <!-- Warnings Container -->
    <div id="pressureWarning" class="grt-warning-box"></div>

    <div class="grt-layout">
        <!-- Configuration Panel -->
        <div class="calc-panel" style="position: sticky; top: 72px;">
            <div class="field field-full" style="margin-bottom: 0.8rem">
                <label><span>Préréglage unités</span></label>
                <select id="unitSystem" onchange="applyUnitSystem()">
                    <option value="mixed" selected>Mixte (gr, mm, m/s, bar)</option>
                    <option value="metric">Métrique complet (g, mm, m/s, bar)</option>
                    <option value="imperial">Impérial complet (gr, in, fps, psi)</option>
                </select>
            </div>

            <h3>Composants de rechargement</h3>
            
            <div class="field field-full">
                <label for="caliberSelect">Calibre / Cartouche</label>
                <select id="caliberSelect" onchange="loadCaliber()"></select>
            </div>

            <div class="field field-full">
                <label for="projectileSelect">Projectile / Balle</label>
                <select id="projectileSelect" onchange="loadProjectile()"></select>
            </div>

            <div class="field field-full">
                <label for="powderSelect">Poudre / Propulsant</label>
                <select id="powderSelect" onchange="loadPowder()"></select>
            </div>

            <h3>Paramètres de chargement</h3>

            <!-- Charge weight slider & number -->
            <div class="field">
                <label>
                    <span>Masse de poudre <span class="help-icon" data-help="Poids de la charge propulsive.">?</span></span>
                    <span id="label-charge-unit" class="unit-toggle">gr</span>
                </label>
                <div class="slider-container">
                    <input type="number" id="chargeInput" value="4.5" step="0.1" style="width:70px" oninput="updateFromNumber('charge')">
                    <input type="range" id="chargeSlider" min="1.0" max="15.0" step="0.1" oninput="updateFromSlider('charge')">
                </div>
            </div>

            <!-- COAL / Seating depth -->
            <div class="field-row">
                <div class="field">
                    <label>
                        <span>L.H.T. (COAL) <span class="help-icon" data-help="Longueur Hors Tout de la cartouche finie.">?</span></span>
                        <span class="unit-toggle">mm</span>
                    </label>
                    <input type="number" id="coalInput" value="29.69" step="0.05" oninput="updateFromCoal()">
                </div>
                <div class="field">
                    <label>
                        <span>Enfoncement <span class="help-icon" data-help="Profondeur d'enfoncement du projectile dans l'étui.">?</span></span>
                        <span class="unit-toggle">mm</span>
                    </label>
                    <input type="number" id="depthInput" value="5.60" step="0.05" oninput="updateFromDepth()">
                </div>
            </div>

            <!-- Barrel length -->
            <div class="field">
                <label>
                    <span>Longueur de canon <span class="help-icon" data-help="Longueur totale du canon de l'arme.">?</span></span>
                    <span class="unit-toggle">mm</span>
                </label>
                <div class="slider-container">
                    <input type="number" id="barrelInput" value="127" step="1" style="width:70px" oninput="updateFromNumber('barrel')">
                    <input type="range" id="barrelSlider" min="50" max="800" step="1" oninput="updateFromSlider('barrel')">
                </div>
            </div>

            <!-- Custom / Physics Overrides Toggle -->
            <div class="grt-override-header" onclick="toggleOverrides()">
                <span>Options avancées & physiques</span>
                <i class="li-chevron-down" id="overrideArrow"></i>
            </div>
            
            <div class="grt-override-section" id="overrideSection">
                <div class="field-row">
                    <div class="field">
                        <label><span>Vol. étui (H₂O)</span><span class="unit-toggle">gr</span></label>
                        <input type="number" id="volH2oInput" value="13.9" step="0.1" oninput="computeGrt()">
                    </div>
                    <div class="field">
                        <label><span>Section canon</span><span class="unit-toggle">mm²</span></label>
                        <input type="number" id="boreAreaInput" value="62.61" step="0.1" oninput="computeGrt()">
                    </div>
                </div>
                <div class="field-row">
                    <div class="field">
                        <label><span>P. forcement</span><span class="unit-toggle">bar</span></label>
                        <input type="number" id="pStartInput" value="150" step="10" oninput="computeGrt()">
                    </div>
                    <div class="field">
                        <label><span>P. frottement</span><span class="unit-toggle">bar</span></label>
                        <input type="number" id="pFrictionInput" value="100" step="10" oninput="computeGrt()">
                    </div>
                </div>
                <div class="field-row">
                    <div class="field">
                        <label><span>Poids balle</span><span class="unit-toggle">gr</span></label>
                        <input type="number" id="bulletMassInput" value="115" step="1" oninput="computeGrt()">
                    </div>
                    <div class="field">
                        <label><span>Longueur balle</span><span class="unit-toggle">mm</span></label>
                        <input type="number" id="bulletLenInput" value="14.3" step="0.1" oninput="computeGrt()">
                    </div>
                </div>
                <div class="field">
                    <label><span>Diamètre balle</span><span class="unit-toggle">mm</span></label>
                    <input type="number" id="bulletDiaInput" value="9.02" step="0.01" oninput="computeGrt()">
                </div>
            </div>
        </div>

        <!-- Results & Charts -->
        <div>
            <!-- Visual Cartridge Casing -->
            <div class="grt-visualizer-box">
                <div style="font-size:0.85rem;font-weight:600;color:var(--color-text-light);margin-bottom:0.5rem">Visualisation de la Charge & Remplissage</div>
                <div id="svgContainer"></div>
            </div>

            <!-- KPI Cards -->
            <div class="result-summary" style="margin-top: 1rem;">
                <div class="result-card">
                    <div class="val" id="resMuzzleVelocity">-</div>
                    <div class="lbl">Vitesse initiale (<span class="unit-toggle-text" data-unit="mv">m/s</span>)</div>
                </div>
                <div class="result-card" id="cardPressure">
                    <div class="val" id="resMaxPressure">-</div>
                    <div class="lbl">Pression max (<span class="unit-toggle-text" data-unit="pressure">bar</span>)</div>
                </div>
                <div class="result-card">
                    <div class="val" id="resMuzzleEnergy">-</div>
                    <div class="lbl">Énergie initiale (<span class="unit-toggle-text" data-unit="energy">J</span>)</div>
                </div>
                <div class="result-card" id="cardFill">
                    <div class="val" id="resFillRatio">-</div>
                    <div class="lbl">Remplissage (%)</div>
                </div>
                <div class="result-card">
                    <div class="val" id="resBurnedPct">-</div>
                    <div class="lbl">Poudre brûlée (%)</div>
                </div>
                <div class="result-card">
                    <div class="val" id="resBarrelTime">-</div>
                    <div class="lbl">Temps de canon (ms)</div>
                </div>
            </div>

            <!-- Tabbed Plots and Data Table -->
            <div class="grt-tabs">
                <button class="grt-tab-btn active" onclick="switchTab(event, 'tabPlotPressureTravel')">Pression / Déplacement</button>
                <button class="grt-tab-btn" onclick="switchTab(event, 'tabPlotPressureTime')">Pression / Temps</button>
                <button class="grt-tab-btn" onclick="switchTab(event, 'tabPlotVelocity')">Vitesse / Déplacement</button>
                <button class="grt-tab-btn" onclick="switchTab(event, 'tabDataTable')">Tableau de données</button>
                <button class="grt-tab-btn" onclick="switchTab(event, 'tabLadderTest')">Test Escalier (Ladder)</button>
            </div>

            <div id="tabPlotPressureTravel" class="grt-tab-content active">
                <div id="plotPressureTravel" style="width:100%;height:380px;"></div>
            </div>
            
            <div id="tabPlotPressureTime" class="grt-tab-content">
                <div id="plotPressureTime" style="width:100%;height:380px;"></div>
            </div>
            
            <div id="tabPlotVelocity" class="grt-tab-content">
                <div id="plotVelocity" style="width:100%;height:380px;"></div>
            </div>

            <div id="tabDataTable" class="grt-tab-content">
                <div style="overflow-x:auto; max-height: 400px;">
                    <table class="result-table">
                        <thead>
                            <tr>
                                <th>Temps (ms)</th>
                                <th>Déplacement (mm)</th>
                                <th>Vitesse (<span class="unit-toggle-text" data-unit="mv">m/s</span>)</th>
                                <th>Pression (<span class="unit-toggle-text" data-unit="pressure">bar</span>)</th>
                                <th>Brûlé (%)</th>
                            </tr>
                        </thead>
                        <tbody id="trajectoryTableBody"></tbody>
                    </table>
                </div>
            </div>

            <div id="tabLadderTest" class="grt-tab-content">
                <div style="margin-bottom: 1rem; display: flex; gap: 1rem; align-items: center; background: var(--color-surface); padding: 1rem; border-radius: var(--radius); border: 1px solid var(--color-border); flex-wrap: wrap;">
                    <label style="font-size: 0.85rem; font-weight: 600;">Incrément (gr): <input type="number" id="ladderStep" value="0.2" step="0.1" style="width:60px; margin-left:5px"></label>
                    <label style="font-size: 0.85rem; font-weight: 600;">Nb. de charges: <input type="number" id="ladderCount" value="10" step="1" style="width:60px; margin-left:5px"></label>
                    <button class="btn-export-ballistics" style="margin-top:0; width:auto; padding:0.5rem 1rem;" onclick="generateLadder()">Générer l'escalier</button>
                    <button class="btn-export-ballistics" style="margin-top:0; width:auto; padding:0.5rem 1rem; background:#34495e" onclick="printLadder()">Imprimer (Stand)</button>
                </div>
                <div style="overflow-x:auto; max-height: 400px;">
                    <table class="result-table" id="ladderTable">
                        <thead>
                            <tr>
                                <th>Charge (gr)</th>
                                <th>Vitesse (<span class="unit-toggle-text" data-unit="mv">m/s</span>)</th>
                                <th>Pression Max (<span class="unit-toggle-text" data-unit="pressure">bar</span>)</th>
                                <th>Temps Canon (ms)</th>
                                <th>Remplissage (%)</th>
                                <th>Vitesse mesurée (Stand)</th>
                            </tr>
                        </thead>
                        <tbody id="ladderTableBody">
                            <tr><td colspan="6" style="text-align:center; padding: 2rem;">Cliquez sur "Générer l'escalier" pour simuler une plage de charges centrée autour de votre charge actuelle.</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Export to Exterior Ballistics -->
            <button class="btn-export-ballistics" onclick="exportToExteriorBallistics()">
                <i class="li-share-2"></i> Exporter vers le Calculateur de Trajectoire (3-DOF)
            </button>
            <p style="font-size: 0.82rem; margin-top: 1rem; color: var(--color-text-light); text-align: center; line-height: 1.4;">
                Pour en savoir plus sur la physique sous-jacente, lisez l'article de référence sur la 
                <a href="/wiki/doku.php?id=technique:balistique_interieure" style="font-weight: 600; color: var(--color-accent);">Balistique Intérieure</a> 
                ou téléchargez notre guide LaTeX complet 
                <a href="/reloading/The_Art_of_the_Precision_Rifle.pdf" target="_blank" style="font-weight: 600; color: var(--color-accent);">The Art of the Precision Rifle (PDF)</a>.
            </p>
        </div>
    </div>
</div>

<script>
// Load GRT compiled database
const GRT_DB = <?php echo file_get_contents(__DIR__ . '/grt_db.json'); ?>;

let activeCaliber = null;
let activeProjectile = null;
let activePowder = null;
let activeUnits = 'mixed'; // mixed, metric, imperial
let overridesOpen = false;

// Initialize dropdowns
function initDropdowns() {
    const calSelect = document.getElementById('caliberSelect');
    const projSelect = document.getElementById('projectileSelect');
    const powderSelect = document.getElementById('powderSelect');

    // Populate calibers
    GRT_DB.calibers.forEach((cal, idx) => {
        const opt = document.createElement('option');
        opt.value = idx;
        opt.textContent = cal.cipname + (cal.altname ? ' (' + cal.altname + ')' : '');
        calSelect.appendChild(opt);
    });

    // Populate projectiles
    GRT_DB.projectiles.forEach((proj, idx) => {
        const opt = document.createElement('option');
        opt.value = idx;
        opt.textContent = proj.mname + ' - ' + proj.pname + ' (' + proj.gmass + ' gr)';
        projSelect.appendChild(opt);
    });

    // Populate powders
    GRT_DB.powders.forEach((pow, idx) => {
        const opt = document.createElement('option');
        opt.value = idx;
        opt.textContent = pow.mname + ' ' + pow.pname;
        powderSelect.appendChild(opt);
    });

    // Load defaults (9mm Luger template caliber, Speer projectile, Winchester powder if available)
    // Find index of 9 mm Luger
    let defaultCalIdx = GRT_DB.calibers.findIndex(c => c.cipname.includes('9 mm Luger') || c.cipname.includes('9mm') || c.altname.includes('9 x 19'));
    if (defaultCalIdx === -1) defaultCalIdx = 0;
    calSelect.value = defaultCalIdx;

    // Défaut : une vraie balle de 9 mm Luger (Ø 9,02/9,03, masse pistolet) et
    // non n'importe quel calibre commençant par « 9 » (qui attrapait une balle
    // de 9,52 mm / 353 gr ELR → surpression à l'ouverture).
    let defaultProjIdx = GRT_DB.projectiles.findIndex(p =>
        (p.gdia === '9.02' || p.gdia === '9.03') && parseFloat(p.gmass) >= 90 && parseFloat(p.gmass) <= 160);
    if (defaultProjIdx === -1) defaultProjIdx = GRT_DB.projectiles.findIndex(p => p.gdia === '9.02' || p.gdia === '9.03');
    if (defaultProjIdx === -1) defaultProjIdx = 0;
    projSelect.value = defaultProjIdx;

    // Défaut : une poudre vive adaptée au 9 mm (sinon une poudre lente de
    // carabine brûle de façon incomplète en canon court → avertissement).
    let defaultPowderIdx = GRT_DB.powders.findIndex(p => p.pname.includes('Clays'));
    if (defaultPowderIdx === -1) defaultPowderIdx = GRT_DB.powders.findIndex(p => p.pname.includes('231'));
    if (defaultPowderIdx === -1) defaultPowderIdx = GRT_DB.powders.findIndex(p => p.pname.includes('Red Dot'));
    if (defaultPowderIdx === -1) defaultPowderIdx = GRT_DB.powders.findIndex(p => parseFloat(p.Ba) > 1.5);
    if (defaultPowderIdx === -1) defaultPowderIdx = 0;
    powderSelect.value = defaultPowderIdx;

    loadCaliber();
}

function loadCaliber() {
    const idx = document.getElementById('caliberSelect').value;
    activeCaliber = GRT_DB.calibers[idx];
    
    // Update overrides input fields
    document.getElementById('volH2oInput').value = activeCaliber.V;
    document.getElementById('boreAreaInput').value = activeCaliber.c_Q || (Math.PI * Math.pow(parseFloat(activeCaliber.c_Z || 9.02), 2) / 4).toFixed(2);
    
    // Setup charge weights slider ranges based on caliber size
    const vH2o = parseFloat(activeCaliber.V);
    const chargeSlider = document.getElementById('chargeSlider');
    const chargeInput = document.getElementById('chargeInput');
    
    // Estimate logical charge ranges
    const maxCharge = (vH2o * 0.9).toFixed(1); // logical max powder weight
    chargeSlider.max = maxCharge;
    chargeSlider.min = (maxCharge * 0.1).toFixed(1);
    // Charge de départ adaptée à la vivacité : une poudre vive (Ba élevé)
    // atteint la pression nominale avec bien moins de masse qu'une poudre lente.
    const selPowderBa = parseFloat((GRT_DB.powders[document.getElementById('powderSelect').value] || {}).Ba) || 0.3;
    const fillFrac = selPowderBa > 1.5 ? 0.28 : 0.40;
    chargeSlider.value = (maxCharge * fillFrac).toFixed(1);
    chargeInput.value = chargeSlider.value;
    
    // Setup barrel length sliders
    const isPistol = activeCaliber.ciptype && activeCaliber.ciptype.includes('pistol');
    const barrelSlider = document.getElementById('barrelSlider');
    const barrelInput = document.getElementById('barrelInput');
    barrelSlider.min = isPistol ? 50 : 250;
    barrelSlider.max = isPistol ? 300 : 900;
    barrelSlider.value = isPistol ? 127 : 610; // 5" for pistol, 24" for rifle
    barrelInput.value = barrelSlider.value;

    loadProjectile();
}

function loadProjectile() {
    const idx = document.getElementById('projectileSelect').value;
    activeProjectile = GRT_DB.projectiles[idx];
    
    document.getElementById('bulletMassInput').value = activeProjectile.gmass;
    document.getElementById('bulletLenInput').value = activeProjectile.glen;
    document.getElementById('bulletDiaInput').value = activeProjectile.gdia;
    document.getElementById('pStartInput').value = activeProjectile.gpressure || 150;
    
    // COAL par défaut = longueur max CIP de la cartouche (champ L6) quand elle est
    // connue ; on en déduit l'enfoncement. L'ancienne estimation gtailh+2 donnait
    // 2 mm pour une balle à base plate (gtailh "0.00" est truthy en JS) → COAL
    // irréaliste (ex. 32 mm en 9 mm, max 29,69) qui faussait le volume/pression.
    const caseLen = parseFloat(activeCaliber.L3);
    const bulletLen = parseFloat(activeProjectile.glen);
    const maxCOAL = parseFloat(activeCaliber.L6) || 0;
    let defaultDepth = maxCOAL > 0 ? (caseLen + bulletLen - maxCOAL) : bulletLen * 0.5;
    if (!(defaultDepth >= 1.0)) defaultDepth = Math.max(1.0, bulletLen * 0.4); // garde-fou

    document.getElementById('depthInput').value = defaultDepth.toFixed(2);
    document.getElementById('coalInput').value = (caseLen + bulletLen - defaultDepth).toFixed(2);
    
    loadPowder();
}

function loadPowder() {
    const idx = document.getElementById('powderSelect').value;
    activePowder = GRT_DB.powders[idx];
    
    computeGrt();
}

function updateFromSlider(key) {
    const val = document.getElementById(key + 'Slider').value;
    document.getElementById(key + 'Input').value = val;
    computeGrt();
}

function updateFromNumber(key) {
    const val = document.getElementById(key + 'Input').value;
    document.getElementById(key + 'Slider').value = val;
    computeGrt();
}

function updateFromCoal() {
    const coal = parseFloat(document.getElementById('coalInput').value);
    const caseLen = parseFloat(activeCaliber.L3);
    const bulletLen = parseFloat(document.getElementById('bulletLenInput').value);
    
    const depth = caseLen + bulletLen - coal;
    document.getElementById('depthInput').value = depth.toFixed(2);
    computeGrt();
}

function updateFromDepth() {
    const depth = parseFloat(document.getElementById('depthInput').value);
    const caseLen = parseFloat(activeCaliber.L3);
    const bulletLen = parseFloat(document.getElementById('bulletLenInput').value);
    
    const coal = caseLen + bulletLen - depth;
    document.getElementById('coalInput').value = coal.toFixed(2);
    computeGrt();
}

function toggleOverrides() {
    overridesOpen = !overridesOpen;
    const section = document.getElementById('overrideSection');
    const arrow = document.getElementById('overrideArrow');
    
    if (overridesOpen) {
        section.style.display = 'block';
        arrow.className = 'li-chevron-up';
    } else {
        section.style.display = 'none';
        arrow.className = 'li-chevron-down';
    }
}

function applyUnitSystem() {
    activeUnits = document.getElementById('unitSystem').value;
    
    // Update KPI label units
    document.querySelectorAll('.unit-toggle-text').forEach(el => {
        const uType = el.dataset.unit;
        if (uType === 'mv') {
            el.textContent = activeUnits === 'imperial' ? 'fps' : 'm/s';
        } else if (uType === 'pressure') {
            el.textContent = activeUnits === 'imperial' ? 'psi' : 'bar';
        } else if (uType === 'energy') {
            el.textContent = activeUnits === 'imperial' ? 'ft-lb' : 'J';
        }
    });

    // Update table header units
    const tableHeaders = document.querySelectorAll('.result-table th span.unit-toggle-text');
    tableHeaders.forEach(el => {
        const uType = el.dataset.unit;
        if (uType === 'mv') {
            el.textContent = activeUnits === 'imperial' ? 'fps' : 'm/s';
        } else if (uType === 'pressure') {
            el.textContent = activeUnits === 'imperial' ? 'psi' : 'bar';
        }
    });

    computeGrt();
}

// Visual Casing representation
function drawCartridgeSVG(fillRatio, seatingDepth, bulletLen, caseLen) {
    const container = document.getElementById('svgContainer');
    container.innerHTML = '';
    
    // Scale parameters for SVG display (height: 120px)
    const svgHeight = 120;
    const svgWidth = 100;
    
    // Normalized dimensions
    const cLen = parseFloat(caseLen);
    const bLen = parseFloat(bulletLen);
    const sDepth = parseFloat(seatingDepth);
    const totalHeight = cLen + bLen - sDepth;
    
    const scale = 80.0 / totalHeight; // fit max size inside 80px space
    
    const svgCaseH = cLen * scale;
    const svgBulletH = bLen * scale;
    const svgDepthH = sDepth * scale;
    const svgWidthC = 25; // fixed casing width representation
    
    const caseTopY = 80;
    const caseBottomY = caseTopY + svgCaseH;
    
    const bulletTopY = caseTopY - (svgBulletH - svgDepthH);
    const bulletBottomY = caseTopY + svgDepthH;
    
    const powderFillH = (svgCaseH - svgDepthH) * (fillRatio / 100.0);
    const powderTopY = caseBottomY - powderFillH;
    
    // Cap filling at physical casing top
    const powderDrawH = Math.min(powderFillH, svgCaseH - svgDepthH);
    const powderDrawY = caseBottomY - powderDrawH;
    
    const colorFill = fillRatio > 100 ? '#e74c3c' : (fillRatio > 90 ? '#f1c40f' : '#2ecc71');
    
    const svg = `
        <svg viewBox="0 0 100 150" class="grt-visualizer-svg">
            <!-- Background grids/guidelines -->
            <rect width="100" height="150" fill="transparent" />
            
            <!-- Powder fill -->
            <rect x="${50 - svgWidthC/2 + 2}" y="${powderDrawY}" width="${svgWidthC - 4}" height="${powderDrawH}" fill="${colorFill}" opacity="0.7" rx="1" />
            
            <!-- Bullet -->
            <path d="M ${50 - svgWidthC/2 + 1} ${bulletBottomY} 
                     L ${50 - svgWidthC/2 + 1} ${bulletTopY + 12}
                     Q 50 ${bulletTopY} 50 ${bulletTopY} 
                     Q 50 ${bulletTopY} ${50 + svgWidthC/2 - 1} ${bulletTopY + 12} 
                     L ${50 + svgWidthC/2 - 1} ${bulletBottomY} Z" 
                  fill="#c0392b" stroke="#7f8c8d" stroke-width="1.5" />
            
            <!-- Case body -->
            <rect x="${50 - svgWidthC/2}" y="${caseTopY}" width="${svgWidthC}" height="${svgCaseH}" fill="rgba(241, 196, 15, 0.25)" stroke="#f1c40f" stroke-width="2" rx="1" />
            
            <!-- Case Rim -->
            <rect x="${50 - svgWidthC/2 - 2}" y="${caseBottomY - 3}" width="${svgWidthC + 4}" height="4" fill="rgba(241, 196, 15, 0.5)" stroke="#f1c40f" stroke-width="1.5" rx="1" />
            
            <!-- Label Text -->
            <text x="50" y="145" font-size="9" text-anchor="middle" fill="var(--color-text-light)" font-weight="bold">
                Remplissage: ${fillRatio.toFixed(1)}%
            </text>
        </svg>
    `;
    
    container.innerHTML = svg;
}

let grtResults = null;

function computeGrt() {
    const inputs = {
        bullet_mass_gr: parseFloat(document.getElementById('bulletMassInput').value),
        charge_mass_gr: parseFloat(document.getElementById('chargeInput').value),
        case_volume_gr_h2o: parseFloat(document.getElementById('volH2oInput').value),
        bore_area_mm2: parseFloat(document.getElementById('boreAreaInput').value),
        seating_depth_mm: parseFloat(document.getElementById('depthInput').value),
        barrel_length_mm: parseFloat(document.getElementById('barrelInput').value),
        case_length_mm: parseFloat(activeCaliber.L3),
        P_start_bar: parseFloat(document.getElementById('pStartInput').value),
        P_friction_bar: parseFloat(document.getElementById('pFrictionInput').value),
        powder: activePowder
    };

    try {
        grtResults = GrtSolver.solve(inputs);
        
        displayResults(grtResults);
    } catch (e) {
        console.error("Simulation error: ", e);
    }
}

function displayResults(res) {
    const bulletMassGr = parseFloat(document.getElementById('bulletMassInput').value);
    
    // Muzzle Energy = 0.5 * m * v^2
    const grains_to_kg = 6.479891e-5;
    const m_bullet_kg = bulletMassGr * grains_to_kg;
    const energyJ = 0.5 * m_bullet_kg * Math.pow(res.muzzle_velocity, 2);
    
    // Unit conversions for display
    let dispVel = res.muzzle_velocity;
    let dispPres = res.peak_pressure;
    let dispEnergy = energyJ;
    
    if (activeUnits === 'imperial') {
        dispVel = res.muzzle_velocity * 3.28084; // fps
        dispPres = res.peak_pressure * 14.5038; // psi
        dispEnergy = energyJ * 0.737562; // ft-lbs
    }
    
    document.getElementById('resMuzzleVelocity').textContent = Math.round(dispVel);
    document.getElementById('resMaxPressure').textContent = Math.round(dispPres);
    document.getElementById('resMuzzleEnergy').textContent = Math.round(dispEnergy);
    document.getElementById('resFillRatio').textContent = res.fill_ratio.toFixed(1);
    document.getElementById('resBurnedPct').textContent = res.burned_pct.toFixed(1);
    
    // OBT calculations
    const barrelLengthMm = parseFloat(document.getElementById('barrelInput').value);
    const nodes = getOBTNodes(barrelLengthMm);
    let closestNode = null;
    let minDelta = Infinity;
    nodes.forEach(n => {
        const delta = res.barrel_time - n.t;
        if (Math.abs(delta) < Math.abs(minDelta)) {
            minDelta = delta;
            closestNode = n;
        }
    });
    
    let obtHtml = res.barrel_time.toFixed(3);
    if (closestNode && Math.abs(minDelta) < 0.3) {
        const color = Math.abs(minDelta) < 0.05 ? '#2ecc71' : (Math.abs(minDelta) < 0.1 ? '#f1c40f' : 'var(--color-text-light)');
        obtHtml += `<div style="font-size:0.55em; color:${color}; margin-top:2px;">Nœud ${closestNode.n} : ${minDelta > 0 ? '+' : ''}${minDelta.toFixed(3)} ms</div>`;
    } else if (closestNode) {
        obtHtml += `<div style="font-size:0.55em; color:var(--color-text-light); margin-top:2px;">Hors Nœud</div>`;
    }
    document.getElementById('resBarrelTime').innerHTML = obtHtml;
    
    // Warnings and Color Coding
    const pMaxAllowed = parseFloat(activeCaliber.Pmax); // bar
    const pMaxAllowedDisp = activeUnits === 'imperial' ? pMaxAllowed * 14.5038 : pMaxAllowed;
    
    const warnBox = document.getElementById('pressureWarning');
    const cardPres = document.getElementById('cardPressure');
    const cardFill = document.getElementById('cardFill');
    
    // Reset classes
    warnBox.className = 'grt-warning-box';
    cardPres.style.background = 'var(--color-bg)';
    cardFill.style.background = 'var(--color-bg)';
    
    if (res.peak_pressure > pMaxAllowed) {
        // OVERPRESSURE Danger
        warnBox.style.display = 'block';
        warnBox.classList.add('grt-warning-danger');
        warnBox.innerHTML = `⚠️ DANGER : Surpression critique ! La pression maximale simulée de ${Math.round(dispPres)} ${activeUnits === 'imperial' ? 'psi' : 'bar'} dépasse la limite de sécurité CIP de ${Math.round(pMaxAllowedDisp)} ${activeUnits === 'imperial' ? 'psi' : 'bar'}. Diminuez immédiatement la charge propulsive !`;
        cardPres.style.background = 'rgba(231, 76, 60, 0.2)';
    } else if (res.peak_pressure > pMaxAllowed * 0.9) {
        // High pressure warning
        warnBox.style.display = 'block';
        warnBox.classList.add('grt-warning-warning');
        warnBox.innerHTML = `⚠️ Attention : Pression élevée. La pression maximale de ${Math.round(dispPres)} ${activeUnits === 'imperial' ? 'psi' : 'bar'} approche la limite maximale de sécurité (${Math.round(pMaxAllowedDisp)} ${activeUnits === 'imperial' ? 'psi' : 'bar'}). Procédez avec prudence.`;
        cardPres.style.background = 'rgba(241, 196, 15, 0.2)';
    } else {
        warnBox.style.display = 'none';
    }
    
    // Fill ratio warning
    if (res.fill_ratio > 105.0) {
        cardFill.style.background = 'rgba(231, 76, 60, 0.2)';
        warnBox.style.display = 'block';
        warnBox.classList.add('grt-warning-warning');
        warnBox.innerHTML = `⚠️ Charge comprimée excessive (${res.fill_ratio.toFixed(1)}%). Le volume de poudre dépasse le volume interne disponible. Risque de tassement excessif ou d'incapacité à siéger le projectile.`;
    } else if (res.fill_ratio < 40.0) {
        cardFill.style.background = 'rgba(241, 196, 15, 0.2)';
    }
    
    // Unburned powder muzzle warning
    if (res.burned_pct < 90.0) {
        warnBox.style.display = 'block';
        warnBox.classList.add('grt-warning-warning');
        warnBox.innerHTML = `⚠️ Rendement de combustion faible. Seuls ${res.burned_pct.toFixed(1)}% de la poudre brûlent dans le canon. Le reste brûle à l'extérieur (flamme de bouche importante, perte d'énergie, encrassement élevé). Utilisez une poudre plus vive ou augmentez le canon.`;
    }

    // Render cartridge SVG
    drawCartridgeSVG(res.fill_ratio, parseFloat(document.getElementById('depthInput').value), parseFloat(document.getElementById('bulletLenInput').value), parseFloat(activeCaliber.L3));
    
    // Build and populate table
    populateTable(res.trajectory);
    
    // Update Plotly Graphs
    updatePlots(res.trajectory, pMaxAllowed);
}

function populateTable(traj) {
    const tbody = document.getElementById('trajectoryTableBody');
    tbody.innerHTML = '';
    
    traj.forEach(pt => {
        let dispVel = pt.v;
        let dispPres = pt.P;
        if (activeUnits === 'imperial') {
            dispVel = pt.v * 3.28084;
            dispPres = pt.P * 14.5038;
        }
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${pt.t.toFixed(3)}</td>
            <td>${pt.x.toFixed(1)}</td>
            <td>${Math.round(dispVel)}</td>
            <td>${Math.round(dispPres)}</td>
            <td>${pt.z.toFixed(1)}</td>
        `;
        tbody.appendChild(row);
    });
}

function updatePlots(traj, pMaxAllowed) {
    const xTravel = traj.map(pt => pt.x);
    const yPressure = traj.map(pt => activeUnits === 'imperial' ? pt.P * 14.5038 : pt.P);
    const yVelocity = traj.map(pt => activeUnits === 'imperial' ? pt.v * 3.28084 : pt.v);
    const xTime = traj.map(pt => pt.t);
    
    const pLimit = activeUnits === 'imperial' ? pMaxAllowed * 14.5038 : pMaxAllowed;
    const pUnit = activeUnits === 'imperial' ? 'psi' : 'bar';
    const vUnit = activeUnits === 'imperial' ? 'fps' : 'm/s';
    
    const layoutBase = {
        margin: { l: 60, r: 20, t: 30, b: 40 },
        plot_bgcolor: "var(--color-bg)",
        paper_bgcolor: "transparent",
        font: { color: "var(--color-text)", size: 11 },
        xaxis: { gridcolor: "var(--color-border)", zerolinecolor: "var(--color-text-light)" },
        yaxis: { gridcolor: "var(--color-border)", zerolinecolor: "var(--color-text-light)" }
    };

    // Plot 1: Pressure vs Travel
    const tracePTravel = {
        x: xTravel, y: yPressure, name: 'Pression',
        type: 'scatter', mode: 'lines', line: { color: '#3498db', width: 3 }
    };
    const tracePLimitTravel = {
        x: [0, Math.max(...xTravel)], y: [pLimit, pLimit], name: 'Pmax CIP',
        type: 'scatter', mode: 'lines', line: { color: '#e74c3c', width: 2, dash: 'dash' }
    };
    
    Plotly.newPlot('plotPressureTravel', [tracePTravel, tracePLimitTravel], {
        ...layoutBase,
        xaxis: { ...layoutBase.xaxis, title: 'Déplacement du projectile (mm)' },
        yaxis: { ...layoutBase.yaxis, title: 'Pression (' + pUnit + ')' }
    });

    // Plot 2: Pressure vs Time
    const tracePTime = {
        x: xTime, y: yPressure, name: 'Pression',
        type: 'scatter', mode: 'lines', line: { color: '#9b59b6', width: 3 }
    };
    const tracePLimitTime = {
        x: [0, Math.max(...xTime)], y: [pLimit, pLimit], name: 'Pmax CIP',
        type: 'scatter', mode: 'lines', line: { color: '#e74c3c', width: 2, dash: 'dash' }
    };
    
    const barrelLengthMmObj = parseFloat(document.getElementById('barrelInput').value);
    const obtNodes = getOBTNodes(barrelLengthMmObj);
    const tracesTime = [tracePTime, tracePLimitTime];
    
    obtNodes.forEach(node => {
        if (node.t < Math.max(...xTime) + 0.5) {
            tracesTime.push({
                x: [node.t, node.t],
                y: [0, pLimit * 1.05],
                mode: 'lines',
                line: { color: 'rgba(230, 126, 34, 0.6)', width: 1.5, dash: 'dot' },
                name: 'Nœud OBT ' + node.n,
                hoverinfo: 'name+x'
            });
        }
    });
    
    Plotly.newPlot('plotPressureTime', tracesTime, {
        ...layoutBase,
        xaxis: { ...layoutBase.xaxis, title: 'Temps écoulé (ms)' },
        yaxis: { ...layoutBase.yaxis, title: 'Pression (' + pUnit + ')' }
    });

    // Plot 3: Velocity vs Travel
    const traceVTravel = {
        x: xTravel, y: yVelocity, name: 'Vitesse',
        type: 'scatter', mode: 'lines', line: { color: '#2ecc71', width: 3 }
    };
    
    Plotly.newPlot('plotVelocity', [traceVTravel], {
        ...layoutBase,
        xaxis: { ...layoutBase.xaxis, title: 'Déplacement du projectile (mm)' },
        yaxis: { ...layoutBase.yaxis, title: 'Vitesse (' + vUnit + ')' }
    });
}

function switchTab(evt, tabId) {
    const contents = document.querySelectorAll('.grt-tab-content');
    contents.forEach(c => c.classList.remove('active'));
    
    const btns = document.querySelectorAll('.grt-tab-btn');
    btns.forEach(b => b.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    evt.currentTarget.classList.add('active');
    
    // Trigger graph resizing for Plotly
    setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
    }, 50);
}

function exportToExteriorBallistics() {
    if (!grtResults) return;
    
    // We export to /calculateur-balistique.php via localStorage profile insertion
    const projectileMass = parseFloat(document.getElementById('bulletMassInput').value);
    const projectileDia = parseFloat(document.getElementById('bulletDiaInput').value);
    const projectileLen = parseFloat(document.getElementById('bulletLenInput').value);
    
    const bcG7 = parseFloat(activeProjectile.g7bc || 0) > 0 ? parseFloat(activeProjectile.g7bc) : 0.15; // default fallback if 0
    const mVel = grtResults.muzzle_velocity;
    
    // Load current ballistics profiles from localStorage
    let profiles = [];
    const saved = localStorage.getItem('ballistics_profiles');
    if (saved) {
        try {
            profiles = JSON.parse(saved);
        } catch (e) {
            profiles = [];
        }
    }
    
    const newProfile = {
        id: Date.now(),
        name: `Simulé (${activePowder.mname} ${activePowder.pname})`,
        visible: true,
        color: "#e67e22",
        params: {
            mass: projectileMass,
            cal: projectileDia,
            bc: bcG7,
            len: projectileLen,
            mv: Math.round(mVel * 3.28084), // exterior solver default init is in fps
            zero: 100,
            twist: parseFloat(activeCaliber.c_u_ ? activeCaliber.c_u_ / 25.4 : 10), // twist estimate
            sightHt: 3.8,
            clickUnit: "MOA",
            clickVal: 0.25,
            temp: 15,
            pres: 1013.25,
            humid: 0,
            alt: 0,
            wind: 15,
            windAng: 90,
            range: 1000,
            step: 100,
            incline: 0,
            lat: 45,
            az: 0
        },
        units: {
            mass:    { current: 'gr', options: ['gr', 'g'] },
            cal:     { current: 'mm', options: ['mm', 'in'] },
            len:     { current: 'mm', options: ['mm', 'in'] },
            mv:      { current: 'm/s', options: ['m/s', 'fps'] },
            zero:    { current: 'm', options: ['m', 'yd'] },
            twist:   { current: 'in', options: ['in', 'mm'] },
            sightHt: { current: 'cm', options: ['cm', 'in'] },
            temp:    { current: '°C', options: ['°C', '°F'] },
            pres:    { current: 'hPa', options: ['hPa', 'inHg'] },
            alt:     { current: 'm', options: ['m', 'ft'] },
            wind:    { current: 'km/h', options: ['km/h', 'm/s', 'mph'] },
            range:   { current: 'm', options: ['m', 'yd'] },
            step:    { current: 'm', options: ['m', 'yd'] }
        }
    };
    
    // Add to profile list
    profiles.unshift(newProfile); // put it first
    localStorage.setItem('ballistics_profiles', JSON.stringify(profiles));
    
    // Redirect to the calculator page
    window.location.href = '/calculateur-balistique.php';
}

function getOBTNodes(barrelLengthMm) {
    const L = barrelLengthMm / 25.4; // Convert to inches
    const nodes = [];
    for (let N = 1; N <= 8; N++) {
        let A, B, C, D;
        if (N % 2 !== 0) { // Odd
            A = 4.42642857E-03;
            B = 2.84942857E-02;
            C = -3.18785714E-03;
            D = 2.91180952E-02;
        } else { // Even
            A = 4.40803571E-03;
            B = 2.68380952E-02;
            C = -2.40148810E-03;
            D = 4.39015873E-02;
        }
        const obtMs = (A * N + B) * L + C * N + D;
        nodes.push({ n: N, t: obtMs });
    }
    return nodes;
}

function generateLadder() {
    const step = parseFloat(document.getElementById('ladderStep').value);
    const count = parseInt(document.getElementById('ladderCount').value, 10);
    const baseCharge = parseFloat(document.getElementById('chargeInput').value);
    
    // start charge is baseCharge - (count/2 * step)
    const halfCount = Math.floor(count / 2);
    let currentCharge = baseCharge - (halfCount * step);
    
    const tbody = document.getElementById('ladderTableBody');
    tbody.innerHTML = '';
    
    const inputs = {
        bullet_mass_gr: parseFloat(document.getElementById('bulletMassInput').value),
        case_volume_gr_h2o: parseFloat(document.getElementById('volH2oInput').value),
        bore_area_mm2: parseFloat(document.getElementById('boreAreaInput').value),
        seating_depth_mm: parseFloat(document.getElementById('depthInput').value),
        barrel_length_mm: parseFloat(document.getElementById('barrelInput').value),
        case_length_mm: parseFloat(activeCaliber.L3),
        P_start_bar: parseFloat(document.getElementById('pStartInput').value),
        P_friction_bar: parseFloat(document.getElementById('pFrictionInput').value),
        powder: activePowder
    };
    
    const pMaxAllowed = parseFloat(activeCaliber.Pmax);
    const pLimit = activeUnits === 'imperial' ? pMaxAllowed * 14.5038 : pMaxAllowed;
    const nodes = getOBTNodes(inputs.barrel_length_mm);
    
    for (let i = 0; i < count; i++) {
        inputs.charge_mass_gr = currentCharge;
        try {
            const res = GrtSolver.solve(inputs);
            
            // formatting
            let dispVel = res.muzzle_velocity;
            let dispPres = res.peak_pressure;
            if (activeUnits === 'imperial') {
                dispVel *= 3.28084;
                dispPres *= 14.5038;
            }
            
            // OBT closest
            let closestNode = null;
            let minDelta = Infinity;
            nodes.forEach(n => {
                const delta = res.barrel_time - n.t;
                if (Math.abs(delta) < Math.abs(minDelta)) { minDelta = delta; closestNode = n; }
            });
            let obtStr = res.barrel_time.toFixed(3);
            if (closestNode && Math.abs(minDelta) < 0.1) {
                const cColor = Math.abs(minDelta) < 0.05 ? '#2ecc71' : '#f1c40f';
                obtStr += ` <span style="color:${cColor}; font-size:0.9em; font-weight:bold">(N${closestNode.n})</span>`;
            }
            
            const isBase = Math.abs(currentCharge - baseCharge) < 0.05;
            const bg = isBase ? 'rgba(52, 152, 219, 0.15)' : 'transparent';
            const fw = isBase ? 'bold' : 'normal';
            
            const pColor = dispPres > pLimit ? '#e74c3c' : (dispPres > pLimit * 0.9 ? '#f1c40f' : 'inherit');
            
            const row = document.createElement('tr');
            row.style.background = bg;
            row.style.fontWeight = fw;
            
            row.innerHTML = `
                <td>${currentCharge.toFixed(1)}</td>
                <td>${Math.round(dispVel)}</td>
                <td style="color:${pColor}">${Math.round(dispPres)}</td>
                <td>${obtStr}</td>
                <td>${res.fill_ratio.toFixed(1)}</td>
                <td style="border-bottom: 1px dotted var(--color-border);"></td>
            `;
            tbody.appendChild(row);
        } catch (e) {
            console.error("Ladder gen error: ", e);
        }
        currentCharge += step;
    }
}

function printLadder() {
    const tableHtml = document.getElementById('ladderTable').outerHTML;
    const printWin = window.open('', '_blank');
    printWin.document.write(`
        <html>
        <head>
            <title>Ladder Test - Tireur.org</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #333; }
                h2 { color: #2c3e50; border-bottom: 2px solid #2ecc71; padding-bottom: 10px; }
                table { border-collapse: collapse; width: 100%; margin-top: 20px; }
                th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
                th { background-color: #f8f9fa; font-weight: 600; color: #2c3e50; }
                .info-panel { background: #f8f9fa; padding: 15px; border-radius: 5px; border: 1px solid #e9ecef; margin-bottom: 20px; }
                .info-row { margin: 5px 0; }
            </style>
        </head>
        <body>
            <h2>Test de l'escalier (Ladder Test)</h2>
            <div class="info-panel">
                <div class="info-row"><strong>Calibre:</strong> ${activeCaliber.cipname}</div>
                <div class="info-row"><strong>Projectile:</strong> ${activeProjectile.mname} ${activeProjectile.pname} (${activeProjectile.gmass} gr)</div>
                <div class="info-row"><strong>Poudre:</strong> ${activePowder.mname} ${activePowder.pname}</div>
                <div class="info-row"><strong>L.H.T (COAL):</strong> ${document.getElementById('coalInput').value} mm | <strong>Canon:</strong> ${document.getElementById('barrelInput').value} mm</div>
            </div>
            ${tableHtml}
            <script>window.print(); setTimeout(() => window.close(), 500);<\/script>
        </body>
        </html>
    `);
    printWin.document.close();
}

window.onload = initDropdowns;
</script>

<?php
include '../../../footer.php';
?>
