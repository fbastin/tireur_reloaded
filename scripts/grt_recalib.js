// Diagnostic + recalibration harness for the legacy GRT-style ODE, on the full RS set
// (well-calibrated powders, joint v0+Pmax). Local data only (EULA), nothing published here.
const fs=require('fs'),path=require('path');
const GrtSolver=require('../legacy/grt_solver.js');
const d=f=>path.join(__dirname,'..','data',f);
const CAL=JSON.parse(fs.readFileSync(d('calibers.json'))).calibers;
const DB=JSON.parse(fs.readFileSync(path.join(__dirname,'..','legacy','grt_db.json'))).powders;
const RS=JSON.parse(fs.readFileSync(d('rs_dataset.local.json')));
const GR=0.06479891;
const norm=s=>String(s).toLowerCase().replace(/\(.*?\)/g,'').replace(/winchester/g,'win').replace(/remington/g,'rem').replace(/magnum/g,'mag').replace(/springfield/g,'spring').replace(/[^a-z0-9]/g,'');
const calIdx={};for(const k of Object.keys(CAL)){calIdx[norm(k)]=k;for(const a of(CAL[k].aliases||[]))calIdx[norm(a)]=k;}
// powder lookup: "RS52" -> grt_db ReloadSwiss RS 52
const pIdx={};for(const p of DB){const key=norm((p.mname||'')+(p.pname||''));pIdx[key]=p;
  const m=String(p.pname||'').match(/RS\s*(\d+)/i);if(m&&/reload/i.test(p.mname||''))pIdx['rs'+m[1]]=p;}
function solveLoad(r,opt){
  const pw=pIdx[norm(r.powder)]||pIdx['rs'+(String(r.powder).match(/\d+/)||[''])[0]];
  const ck=calIdx[norm(r.cartridge)]; if(!pw||!ck) return null;
  const ca=CAL[ck];
  const pcd=parseFloat(pw.pcd);
  const V0_cm3=(r.C_gr*GR/(pcd/1000))/(r.fill/100);          // derived from RS fill (self-consistent)
  const bore_area=Math.PI*(ca.bore_mm/2)**2;
  const P2={...pw};
  if(opt&&opt.Qex!=null)P2.Qex=opt.Qex;                       // global multipliers handled by caller via P2
  const out=GrtSolver.solve({bullet_mass_gr:r.m_gr,charge_mass_gr:r.C_gr,
    case_volume_gr_h2o:V0_cm3/0.0648, bore_area_mm2:bore_area, seating_depth_mm:0,
    barrel_length_mm:r.barrel_mm, case_length_mm:ca.case_mm, powder:P2,
    P_start_bar:(opt&&opt.P_start!=null)?opt.P_start:150,
    P_friction_bar:(opt&&opt.P_friction!=null)?opt.P_friction:100});
  return {v:out.muzzle_velocity,P:out.peak_pressure, type:ca.type||'rifle',
    Re:r.Re, fill:r.fill, vm:r.v0, Pm:r.Pmax};
}
const recs=[];for(const r of RS){const s=solveLoad(r,{});if(s&&s.v>0)recs.push(s);}
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length, rms=a=>Math.sqrt(mean(a.map(x=>x*x)));
function report(tag,rr){
  const ve=rr.map(s=>(s.v/s.vm-1)*100), pe=rr.map(s=>(s.P/s.Pm-1)*100);
  console.log(`${tag} (n=${rr.length}): v RMS ${rms(ve).toFixed(1)}% bias ${mean(ve).toFixed(1)}% | P RMS ${rms(pe).toFixed(1)}% bias ${mean(pe).toFixed(1)}%`);
}
console.log("=== Legacy ODE, defaults (beta=0.15, Pstart150, Pfric100) ===");
report("ALL",recs);
report("rifle",recs.filter(s=>s.type==='rifle'));
report("handgun",recs.filter(s=>s.type==='handgun'));
// correlation v-error vs P-error (energy deficit -> both move together)
const ve=recs.map(s=>(s.v/s.vm-1)*100),pe=recs.map(s=>(s.P/s.Pm-1)*100);
const mv=mean(ve),mp=mean(pe);
const cov=mean(recs.map((s,i)=>(ve[i]-mv)*(pe[i]-mp)));
const corr=cov/(Math.sqrt(mean(ve.map(x=>(x-mv)**2)))*Math.sqrt(mean(pe.map(x=>(x-mp)**2))));
console.log(`corr(v_err, P_err) = ${corr.toFixed(2)}  (≈1 => uniform energy deficit; low => shape problem)`);

// ---- global recalibration sweep ----
// modifiers: kBa (vivacity scale, burn completeness), beta (heat loss), Pf (friction), Ps (shot-start)
function evalGlobal(kBa,beta,Pf,Ps,kQ){
  const ve=[],pe=[];
  for(const r of RS){
    const pw=pIdx[norm(r.powder)]||pIdx['rs'+(String(r.powder).match(/\d+/)||[''])[0]];
    const ck=calIdx[norm(r.cartridge)]; if(!pw||!ck)continue; const ca=CAL[ck];
    const pcd=parseFloat(pw.pcd);
    const V0=(r.C_gr*GR/(pcd/1000))/(r.fill/100);
    const P2={...pw, Ba:parseFloat(pw.Ba)*kBa, Qex:parseFloat(pw.Qex)*kQ};
    // patch beta via a custom solve: GrtSolver hardcodes beta=0.15, so emulate by scaling Qex effective?
    const out=GrtSolver.solve({bullet_mass_gr:r.m_gr,charge_mass_gr:r.C_gr,
      case_volume_gr_h2o:V0/0.0648, bore_area_mm2:Math.PI*(ca.bore_mm/2)**2, seating_depth_mm:0,
      barrel_length_mm:r.barrel_mm, case_length_mm:ca.case_mm, powder:P2, P_start_bar:Ps, P_friction_bar:Pf});
    if(out.muzzle_velocity>0){ve.push((out.muzzle_velocity/r.v0-1)*100);pe.push((out.peak_pressure/r.Pmax-1)*100);}
  }
  return {n:ve.length,vR:rms(ve),vB:mean(ve),pR:rms(pe),pB:mean(pe)};
}
console.log("\n=== Sweep (beta hardcoded 0.15; vary kBa, Pf, Ps, kQ) ===");
console.log("kBa  kQ   Pf   Ps  | vRMS vBias | pRMS pBias");
for(const kBa of [1,1.5,2,3]) for(const kQ of [1.0,1.15,1.3]){
  const r=evalGlobal(kBa,0.15,100,150,kQ);
  console.log(`${kBa.toFixed(1)}  ${kQ.toFixed(2)} 100  150 | ${r.vR.toFixed(1)} ${r.vB.toFixed(1)} | ${r.pR.toFixed(1)} ${r.pB.toFixed(1)}`);
}
