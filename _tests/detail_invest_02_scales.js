#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"
#include <pjsr/UndoFlag.jsh>

// ============================================================
// detail_invest_02_scales.js
// Per-scale analysis: wavelet-band energy per method,
// and deeper redundancy with per-primitive groupings.
// Also investigates planetary edgeAware anomaly.
// ============================================================

var DIR  = "C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/";
var IDIR = "C:/Users/ninoc/Documents/PixInsight/CabraSpace/Pagina Web/Imagenes Prueba/";
var LOG  = DIR + "detail_invest_02_scales.log";
var BUF  = "";
function L(s){ BUF += String(s) + "\n"; try { File.writeTextFile(LOG, BUF); } catch(e){} }

// Box blur (sliding-window, same as detail_invest_01)
function bblur(src, w, h, r) {
   if (r < 1) { var c = new Float32Array(src.length); c.set(src); return c; }
   var tmp = new Float32Array(w * h);
   var diam = 2 * r + 1;
   for (var y = 0; y < h; ++y) {
      var base = y * w, s = 0.0;
      for (var k = -r; k <= r; ++k) { var xx = k<0?0:(k>=w?w-1:k); s += src[base+xx]; }
      tmp[base] = s / diam;
      for (var x = 1; x < w; ++x) {
         var leave = x-r-1; if(leave<0)leave=0;
         var enter = x+r;   if(enter>=w)enter=w-1;
         s = s - src[base+leave] + src[base+enter];
         tmp[base+x] = s / diam;
      }
   }
   var out = new Float32Array(w * h);
   for (var x2 = 0; x2 < w; ++x2) {
      var s2 = 0.0;
      for (var k2 = -r; k2 <= r; ++k2) { var yy=k2<0?0:(k2>=h?h-1:k2); s2 += tmp[yy*w+x2]; }
      out[x2] = s2 / diam;
      for (var y2 = 1; y2 < h; ++y2) {
         var ly=y2-r-1; if(ly<0)ly=0;
         var ey=y2+r;   if(ey>=h)ey=h-1;
         s2 = s2 - tmp[ly*w+x2] + tmp[ey*w+x2];
         out[y2*w+x2] = s2/diam;
      }
   }
   return out;
}

function stride(src, w, h, fac) {
   var ow=Math.floor(w/fac), oh=Math.floor(h/fac);
   var out=new Float32Array(ow*oh);
   for(var y=0;y<oh;++y) for(var x=0;x<ow;++x) out[y*ow+x]=src[(y*fac)*w+(x*fac)];
   return {data:out,w:ow,h:oh};
}

function getLuma(v) {
   var img=v.image,w=img.width,h=img.height,count=w*h,rect=new Rect(0,0,w,h);
   if(img.numberOfChannels>=3){
      var R=new Float32Array(count),G=new Float32Array(count),B=new Float32Array(count);
      img.getSamples(R,rect,0);img.getSamples(G,rect,1);img.getSamples(B,rect,2);
      var Y=new Float32Array(count);
      for(var i=0;i<count;++i) Y[i]=0.2126*R[i]+0.7152*G[i]+0.0722*B[i];
      return {d:Y,w:w,h:h};
   }
   var C=new Float32Array(count);img.getSamples(C,rect,0);
   return {d:C,w:w,h:h};
}

function loadStretched(path,label){
   L("  Loading: "+label);
   var ws=ImageWindow.open(path);
   if(!ws||!ws.length) throw new Error("Cannot open: "+path);
   var v=ws[0].mainView;
   L("  Size: "+v.image.width+"x"+v.image.height);
   // Quick median check
   var rect=new Rect(0,0,v.image.width,v.image.height);
   var C=new Float32Array(v.image.width*v.image.height);
   v.image.getSamples(C,rect,0);
   var step=Math.max(1,Math.floor(C.length/5000)),samp=[];
   for(var i=0;i<C.length;i+=step) samp.push(C[i]);
   samp.sort(function(a,b){return a-b;});
   var med=samp[Math.floor(samp.length/2)];
   L("  Sampled median="+med.toFixed(4));
   if(med<0.05){
      optRunAutoGhsStretch(v,{aghs_intensity:0.75,aghs_bp:3.0});
      v.image.getSamples(C,rect,0);
      samp=[];for(var i2=0;i2<C.length;i2+=step)samp.push(C[i2]);
      samp.sort(function(a,b){return a-b;});
      med=samp[Math.floor(samp.length/2)];
      L("  Post-stretch median="+med.toFixed(4));
   }
   return v;
}

// Wavelet decomposition: compute per-scale energy in the DELTA map
// bands: [1px, 2px, 4px, 8px, 16px, residual]
// Energy per band = mean(|layer_k|) where layer_k = blur_{k-1} - blur_k
function waveEnergy(delta, w, h) {
   var bands = [1, 2, 4, 8, 16];
   var energies = [];
   var cur = delta;
   for (var b = 0; b < bands.length; ++b) {
      var next = bblur(cur, w, h, bands[b]);
      var n = cur.length, s = 0;
      for (var i = 0; i < n; ++i) s += Math.abs(cur[i] - next[i]);
      energies.push(s / n);
      cur = next;
   }
   // residual (very low freq)
   var sr = 0;
   for (var j = 0; j < cur.length; ++j) sr += Math.abs(cur[j]);
   energies.push(sr / cur.length);
   return energies; // [e@1, e@2, e@4, e@8, e@16, e_residual]
}

// NCC between two arrays
function ncc(A,B){
   var n=A.length,mA=0,mB=0;
   for(var i=0;i<n;++i){mA+=A[i];mB+=B[i];}
   mA/=n;mB/=n;
   var num=0,dA=0,dB=0;
   for(var j=0;j<n;++j){var da=A[j]-mA,db=B[j]-mB;num+=da*db;dA+=da*da;dB+=db*db;}
   var den=Math.sqrt(dA*dB);return den>1e-14?num/den:0;
}

// background stdev in top-left 8% corner
function bgnoise(Y,w,h){
   var pw=Math.max(8,Math.floor(w*0.08)),ph=Math.max(8,Math.floor(h*0.08));
   var s=0,n=0;
   for(var y=0;y<ph;++y) for(var x=0;x<pw;++x){s+=Y[y*w+x];n++;}
   var m=s/n,v=0;
   for(var y2=0;y2<ph;++y2) for(var x2=0;x2<pw;++x2){var d=Y[y2*w+x2]-m;v+=d*d;}
   return Math.sqrt(v/n);
}

var ALGOS = [
   { id:"localContrast", lbl:"LocalContrast", fn:function(st){st.lcAmount=0.20;st.lcRadius=80;} },
   { id:"highPass",      lbl:"HighPass",      fn:function(st){st.hpAmount=0.50;st.hpRadius=3;} },
   { id:"multiscale",    lbl:"Multiscale",    fn:function(st){st.mdFine=0.40;st.mdMedium=0.20;} },
   { id:"mmtTexture",    lbl:"MMTTexture",    fn:function(st){st.txAmount=0.50;} },
   { id:"edgeAware",     lbl:"EdgeAware",     fn:function(st){st.eaRadius=8;st.eaAmount=0.70;} },
   { id:"dehaze",        lbl:"Dehaze",        fn:function(st){st.dhRadius=48;st.dhStrength=0.40;} }
];

function analyzeView(baseV, label) {
   L("\n===== " + label + " =====");
   var base = getLuma(baseV);
   var fac = Math.max(1, Math.ceil(base.w / 600));
   var bs = fac>1 ? stride(base.d,base.w,base.h,fac) : {data:base.d,w:base.w,h:base.h};
   var sw=bs.w, sh=bs.h;
   L("  Analysis grid: "+sw+"x"+sh+" (stride="+fac+")");

   var baseBg = bgnoise(bs.data, sw, sh);
   L("  Baseline bg-noise=" + baseBg.toFixed(5));

   var deltas = {};
   var bandEnergies = {};

   for (var a = 0; a < ALGOS.length; ++a) {
      var algo = ALGOS[a];
      var cid = label.replace(/[^a-zA-Z0-9]/g,"_").substring(0,10)+"_"+algo.id;
      var cv = null;
      try {
         cv = optCabraClonePM(baseV, cid);
         var st = optDetailDefaultState();
         st.algoId = algo.id;
         algo.fn(st);
         optRunDetailOnView(cv, st);

         var proc = getLuma(cv);
         var ps = fac>1 ? stride(proc.d,proc.w,proc.h,fac) : {data:proc.d,w:proc.w,h:proc.h};

         // Delta map (always positive conceptually, but keep sign for NCC)
         var delta = new Float32Array(sw*sh);
         for (var i=0; i<delta.length; ++i) delta[i] = ps.data[i] - bs.data[i];
         deltas[algo.id] = delta;

         // Wavelet band energies of the delta
         var we = waveEnergy(delta, sw, sh);
         bandEnergies[algo.id] = we;

         var procBg = bgnoise(ps.data, sw, sh);
         var bgInc = (procBg - baseBg) * 100 / (baseBg + 1e-10);

         // Normalize band energies to sum=1 to show RELATIVE distribution
         var tot = 0; for(var b=0;b<we.length;++b) tot+=we[b];
         var norm = we.map(function(e){return tot>1e-12?(e/tot*100):0;});

         L("  "+algo.lbl.padEnd(14)+
            " |Δ|="+Math.abs(delta.reduce(function(s,v){return s+Math.abs(v);},0)/delta.length).toFixed(5)+
            " bgInc="+bgInc.toFixed(1)+"%"+
            " bands[1px,2px,4px,8px,16px,low]=["+
            norm.map(function(v){return v.toFixed(0)+"%;";}).join("")+"]");

      } catch(e) {
         L("  "+algo.lbl+" ERROR: "+e.message);
      }
      try { if(cv) cv.window.forceClose(); } catch(ex){}
   }

   // NCC matrix — full for all pairs
   L("\n  === NCC Matrix ===");
   var ids = Object.keys(deltas);
   L("  Pair                           NCC    Interpret.");
   for(var p=0;p<ids.length;++p) {
      for(var q=p+1;q<ids.length;++q) {
         var nc = ncc(deltas[ids[p]], deltas[ids[q]]);
         var interp = nc>0.98?"NEAR-IDENTICAL":nc>0.90?"HIGH (likely redundant)":nc>0.75?"MODERATE":nc>0.50?"LOW":"DISTINCT";
         L("  "+ids[p].padEnd(15)+" vs "+ids[q].padEnd(15)+" "+nc.toFixed(4)+"  "+interp);
      }
   }

   // Per-primitive group check
   // Group A: box-unsharp = localContrast, highPass
   // Group B: atrous      = multiscale, mmtTexture
   // Group C: guided      = edgeAware, dehaze
   L("\n  === Within-primitive-group NCC ===");
   if(deltas["localContrast"] && deltas["highPass"])
      L("  Group A (box): localContrast vs highPass   NCC="+ncc(deltas["localContrast"],deltas["highPass"]).toFixed(4));
   if(deltas["multiscale"] && deltas["mmtTexture"])
      L("  Group B (atrous): multiscale vs mmtTexture NCC="+ncc(deltas["multiscale"],deltas["mmtTexture"]).toFixed(4));
   if(deltas["edgeAware"] && deltas["dehaze"])
      L("  Group C (guided): edgeAware vs dehaze      NCC="+ncc(deltas["edgeAware"],deltas["dehaze"]).toFixed(4));

   // Best cross-group NCC (should be lower than within-group)
   L("\n  === Cross-group NCC (best pairs) ===");
   var crossPairs=[
      ["localContrast","multiscale"],["localContrast","edgeAware"],
      ["highPass","multiscale"],["highPass","edgeAware"],
      ["multiscale","edgeAware"],["multiscale","dehaze"]
   ];
   for(var cp=0;cp<crossPairs.length;++cp){
      var a0=crossPairs[cp][0],a1=crossPairs[cp][1];
      if(deltas[a0]&&deltas[a1])
         L("  "+a0.padEnd(15)+" vs "+a1.padEnd(15)+" NCC="+ncc(deltas[a0],deltas[a1]).toFixed(4));
   }

   return {deltas:deltas, bandEnergies:bandEnergies};
}

function main(){
   L("=== Detail & Contrast Scale Investigation — 2026-06-22 ===");

   var images=[
      {path:IDIR+"NGC3184_RGB.xisf",   lbl:"Galaxy_NGC3184",    type:"galaxy"},
      {path:IDIR+"Collinder34_RGB.xisf",lbl:"Nebula_Coll34",     type:"nebula"},
      {path:IDIR+"M13_RGB.xisf",        lbl:"Globular_M13",      type:"globular"},
      {path:IDIR+"NGC2392_RGB.xisf",    lbl:"Planetary_NGC2392", type:"planetary"}
   ];

   var allData={};

   for(var ii=0;ii<images.length;++ii){
      var img=images[ii];
      var v=null;
      try {
         v=loadStretched(img.path,img.lbl);
         allData[img.type]=analyzeView(v,img.lbl);
      } catch(e){
         L("\nERROR ["+img.lbl+"]: "+e.message+(e.stack?"\n"+e.stack:""));
      }
      try{if(v)v.window.forceClose();}catch(ex){}
   }

   // Final verdict section
   L("\n\n========== REDUNDANCY VERDICT ==========");
   L("Hypothesis: 6 methods = 3 primitives (box-unsharp, a-trous, guided-filter).");
   L("");
   L("Within-primitive NCC summary across all images:");
   var types=["galaxy","nebula","globular","planetary"];
   for(var t=0;t<types.length;++t){
      var d=allData[types[t]];
      if(!d||!d.deltas) continue;
      var dl=d.deltas;
      var nccA = (dl.localContrast&&dl.highPass) ? ncc(dl.localContrast,dl.highPass) : null;
      var nccB = (dl.multiscale&&dl.mmtTexture) ? ncc(dl.multiscale,dl.mmtTexture) : null;
      var nccC = (dl.edgeAware&&dl.dehaze) ? ncc(dl.edgeAware,dl.dehaze) : null;
      L("  "+types[t].padEnd(12)+
         " A(LC vs HP)=" + (nccA!==null?nccA.toFixed(3):"n/a")+
         "  B(MS vs MMT)=" + (nccB!==null?nccB.toFixed(3):"n/a")+
         "  C(EA vs DH)=" + (nccC!==null?nccC.toFixed(3):"n/a"));
   }
   L("\n=== DONE ===");
}

try{main();}catch(e){L("FATAL: "+e.message+(e.stack?"\n"+e.stack:""));}
