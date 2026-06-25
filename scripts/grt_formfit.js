// Can a better FORM FUNCTION shape break the v-P conflict? Standalone parametrized 0-D ODE
// with a tunable phi(z;p,q): phi = (1 + p*z) * (1-z)^q  (p=progressivity, q=taper).
// Global energy scale kQ. Grid-search min combined v+P RMS on the full RS set. Local data only.
const fs=require('fs'),path=require('path');
const d=f=>path.join(__dirname,'..','data',f);
const CAL=JSON.parse(fs.readFileSync(d('calibers.json'))).calibers;
const DB=JSON.parse(fs.readFileSync(path.join(__dirname,'..','legacy','grt_db.json'))).powders;
const RS=JSON.parse(fs.readFileSync(d('rs_dataset.local.json')));
const GR=0.06479891;
const norm=s=>String(s).toLowerCase().replace(/\(.*?\)/g,'').replace(/winchester/g,'win').replace(/remington/g,'rem').replace(/magnum/g,'mag').replace(/springfield/g,'spring').replace(/[^a-z0-9]/g,'');
const calIdx={};for(const k of Object.keys(CAL)){calIdx[norm(k)]=k;for(const a of(CAL[k].aliases||[]))calIdx[norm(a)]=k;}
const pIdx={};for(const p of DB){const m=String(p.pname||'').match(/RS\s*(\d+)/i);if(m&&/reload/i.test(p.mname||''))pIdx['rs'+m[1]]=p;}
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length, rms=a=>Math.sqrt(mean(a.map(x=>x*x)));
// build calibration loads once
const loads=[];for(const r of RS){const pw=pIdx['rs'+(String(r.powder).match(/\d+/)||[''])[0]];const ck=calIdx[norm(r.cartridge)];if(!pw||!ck)continue;const ca=CAL[ck];
  const pcd=parseFloat(pw.pcd);const V0=(r.C_gr*GR/(pcd/1000))/(r.fill/100)*1e-6;
  loads.push({mb:r.m_gr*GR*1e-3,mc:r.C_gr*GR*1e-3,V0,A:Math.PI*(ca.bore_mm/1000/2)**2,
    L:(r.barrel_mm-ca.case_mm)/1000, Ba:parseFloat(pw.Ba),Qex:parseFloat(pw.Qex)*1e3,k:parseFloat(pw.k),
    eta:parseFloat(pw.eta)*1e-3,pc:parseFloat(pw.pc),vm:r.v0,Pm:r.Pmax,type:ca.type});}
function phi(z,p,q){if(z<=0)return 1;if(z>=1)return 0;return (1+p*z)*Math.pow(1-z,q);}
function sim(ld,p,q,kQ,beta,Pf){
  let x=0,v=0,z=0.01,E=ld.mc*z*ld.Qex*kQ*(1-beta);const dt=1e-6;let peak=0;
  const Pfr=Pf*1e5, Ps=150e5;
  for(let s=0;s<20000;s++){
    const f=(st)=>{let[X,V,Z,EE]=st;let Vg=ld.V0+ld.A*X-ld.mc*(1-Z)/ld.pc-ld.eta*ld.mc*Z;if(Vg<1e-9)Vg=1e-9;
      let P=EE*(ld.k-1)/Vg;if(P<0)P=0;let dz=Z<1?ld.Ba*(P/1e5)*phi(Z,p,q):0;if(dz<0)dz=0;
      let ax=0;if(V>0||P>=Ps){ax=ld.A*(P-Pfr)/(ld.mb+ld.mc/3);if(V<=0&&ax<0)ax=0;}
      let dE=ld.mc*ld.Qex*kQ*dz*(1-beta);if(V>0||P>=Ps)dE-=P*ld.A*V;return [V,ax,dz,dE];};
    const k1=f([x,v,z,E]);const k2=f([x+dt/2*k1[0],v+dt/2*k1[1],z+dt/2*k1[2],E+dt/2*k1[3]]);
    const k3=f([x+dt/2*k2[0],v+dt/2*k2[1],z+dt/2*k2[2],E+dt/2*k2[3]]);const k4=f([x+dt*k3[0],v+dt*k3[1],z+dt*k3[2],E+dt*k3[3]]);
    x+=dt/6*(k1[0]+2*k2[0]+2*k3[0]+k4[0]);v+=dt/6*(k1[1]+2*k2[1]+2*k3[1]+k4[1]);z+=dt/6*(k1[2]+2*k2[2]+2*k3[2]+k4[2]);E+=dt/6*(k1[3]+2*k2[3]+2*k3[3]+k4[3]);
    let Vg=ld.V0+ld.A*x-ld.mc*(1-z)/ld.pc-ld.eta*ld.mc*z;if(Vg<1e-9)Vg=1e-9;let P=E*(ld.k-1)/Vg;if(P>peak)peak=P;
    if(x>=ld.L){return {v,P:peak/1e5};}
  }
  return {v,P:peak/1e5};
}
function evalAll(p,q,kQ,beta,Pf){const ve=[],pe=[];for(const ld of loads){const o=sim(ld,p,q,kQ,beta,Pf);if(o.v>0){ve.push((o.v/ld.vm-1)*100);pe.push((o.P/ld.Pm-1)*100);}}
  return {vR:rms(ve),vB:mean(ve),pR:rms(pe),pB:mean(pe),score:Math.sqrt((rms(ve)**2+rms(pe)**2)/2),n:ve.length};}
console.log("loads:",loads.length);
console.log("baseline-ish (p=0,q=1 deg.linear, kQ=1, beta.15, Pf100):",JSON.stringify(evalAll(0,1,1,0.15,100)));
console.log("\np    q    kQ   | vRMS vBias | pRMS pBias | score");
let best=null;
for(const p of [0,1,2,4]) for(const q of [0.3,0.6,1.0]) for(const kQ of [1.0,1.15,1.3]){
  const r=evalAll(p,q,kQ,0.1,100);
  if(!best||r.score<best.score)best={p,q,kQ,...r};
  console.log(`${p}   ${q.toFixed(1)}  ${kQ.toFixed(2)} | ${r.vR.toFixed(1)} ${r.vB.toFixed(1)} | ${r.pR.toFixed(1)} ${r.pB.toFixed(1)} | ${r.score.toFixed(1)}`);
}
console.log("\nBEST:",JSON.stringify(best));
