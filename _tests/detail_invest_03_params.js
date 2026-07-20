#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"
#include <pjsr/UndoFlag.jsh>

// ============================================================
// detail_invest_03_params.js
// Parameter sweep: for the 3 "survivor" methods per object type,
// test low/medium/high param settings and report trade-offs.
// Also verifies the specific behavioral differences between
// localContrast (large-radius) and highPass (small-radius).
// ============================================================

var DIR  = "C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/";
var IDIR = "C:/Users/ninoc/Documents/PixInsight/CabraSpace/Pagina Web/Imagenes Prueba/";
var LOG  = DIR + "detail_invest_03_params.log";
var BUF  = "";
function L(s){ BUF += String(s) + "\n"; try { File.writeTextFile(LOG, BUF); } catch(e){} }

function bblur(src, w, h, r) {
   if(r<1){var c=new Float32Array(src.length);c.set(src);return c;}
   var tmp=new Float32Array(w*h),diam=2*r+1;
   for(var y=0;y<h;++y){
      var base=y*w,s=0.0;
      for(var k=-r;k<=r;++k){var xx=k<0?0:(k>=w?w-1:k);s+=src[base+xx];}
      tmp[base]=s/diam;
      for(var x=1;x<w;++x){
         var leave=x-r-1;if(leave<0)leave=0;
         var enter=x+r;if(enter>=w)enter=w-1;
         s=s-src[base+leave]+src[base+enter];tmp[base+x]=s/diam;
      }
   }
   var out=new Float32Array(w*h);
   for(var x2=0;x2<w;++x2){
      var s2=0.0;
      for(var k2=-r;k2<=r;++k2){var yy=k2<0?0:(k2>=h?h-1:k2);s2+=tmp[yy*w+x2];}
      out[x2]=s2/diam;
      for(var y2=1;y2<h;++y2){
         var ly=y2-r-1;if(ly<0)ly=0;
         var ey=y2+r;if(ey>=h)ey=h-1;
         s2=s2-tmp[ly*w+x2]+tmp[ey*w+x2];
         out[y2*w+x2]=s2/diam;
      }
   }
   return out;
}

function stride(src, w, h, fac) {
   var ow=Math.floor(w/fac),oh=Math.floor(h/fac),out=new Float32Array(ow*oh);
   for(var y=0;y<oh;++y) for(var x=0;x<ow;++x) out[y*ow+x]=src[(y*fac)*w+(x*fac)];
   return {data:out,w:ow,h:oh};
}

function getLuma(v){
   var img=v.image,w=img.width,h=img.height,count=w*h,rect=new Rect(0,0,w,h);
   if(img.numberOfChannels>=3){
      var R=new Float32Array(count),G=new Float32Array(count),B=new Float32Array(count);
      img.getSamples(R,rect,0);img.getSamples(G,rect,1);img.getSamples(B,rect,2);
      var Y=new Float32Array(count);
      for(var i=0;i<count;++i)Y[i]=0.2126*R[i]+0.7152*G[i]+0.0722*B[i];
      return{d:Y,w:w,h:h};
   }
   var C=new Float32Array(count);img.getSamples(C,rect,0);return{d:C,w:w,h:h};
}

function loadStretched(path,label){
   L("  Loading: "+label);
   var ws=ImageWindow.open(path);
   if(!ws||!ws.length)throw new Error("Cannot open: "+path);
   var v=ws[0].mainView;
   var rect=new Rect(0,0,v.image.width,v.image.height);
   var C=new Float32Array(v.image.width*v.image.height);
   v.image.getSamples(C,rect,0);
   var step=Math.max(1,Math.floor(C.length/5000)),samp=[];
   for(var i=0;i<C.length;i+=step)samp.push(C[i]);
   samp.sort(function(a,b){return a-b;});
   var med=samp[Math.floor(samp.length/2)];
   if(med<0.05){
      optRunAutoGhsStretch(v,{aghs_intensity:0.75,aghs_bp:3.0});
   }
   return v;
}

function bgnoise(Y,w,h){
   var pw=Math.max(8,Math.floor(w*0.08)),ph=Math.max(8,Math.floor(h*0.08));
   var s=0,n=0;
   for(var y=0;y<ph;++y)for(var x=0;x<pw;++x){s+=Y[y*w+x];n++;}
   var m=s/n,v=0;
   for(var y2=0;y2<ph;++y2)for(var x2=0;x2<pw;++x2){var d=Y[y2*w+x2]-m;v+=d*d;}
   return Math.sqrt(v/n);
}

// HF energy at radius r
function hfe(Y,w,h,r){
   var bl=bblur(Y,w,h,r),sd=0,sy=0,n=Y.length;
   for(var i=0;i<n;++i){sd+=Math.abs(Y[i]-bl[i]);sy+=Y[i];}
   return sy>1e-8?(sd/n)/(sy/n):0;
}

// Peak-to-dark contrast: mean of top 5% vs bottom 5%
function ptdContrast(Y){
   var sorted=Array.prototype.slice.call(Y).sort(function(a,b){return a-b;});
   var n=sorted.length,p5=Math.floor(n*0.05);
   var dark=0,bright=0;
   for(var i=0;i<p5;++i)dark+=sorted[i];
   for(var j=n-p5;j<n;++j)bright+=sorted[j];
   return (bright/p5)-(dark/p5);
}

// Run a single method with given params, return metrics
function runMethod(baseV, baseS, sw, sh, bBg, bContrast, algoId, stFn, tag) {
   var cid = tag.replace(/[^a-zA-Z0-9]/g,"_").substring(0,24);
   var cv = null;
   try {
      cv = optCabraClonePM(baseV, cid);
      var st = optDetailDefaultState();
      st.algoId = algoId;
      stFn(st);
      optRunDetailOnView(cv, st);
      var proc = getLuma(cv);
      var fac = Math.max(1, Math.ceil(proc.w / 600));
      var ps = fac>1 ? stride(proc.d,proc.w,proc.h,fac) : {data:proc.d,w:proc.w,h:proc.h};
      var pBg = bgnoise(ps.data, sw, sh);
      var pContrast = ptdContrast(ps.data);
      var hf1 = hfe(ps.data, sw, sh, 1);
      // delta mean abs
      var dm = 0; for(var i=0;i<ps.data.length;++i) dm+=Math.abs(ps.data[i]-baseS[i]); dm/=ps.data.length;
      return {
         tag: tag,
         dBg: (pBg-bBg)*100/(bBg+1e-10),
         dContrast: (pContrast-bContrast)*100/(bContrast+1e-10),
         dHF1: (hf1 - hfe(baseS,sw,sh,1))*100/(hfe(baseS,sw,sh,1)+1e-10),
         dm: dm
      };
   } catch(e) {
      return { tag: tag, error: e.message };
   } finally {
      try{if(cv)cv.window.forceClose();}catch(ex){}
   }
}

function printRow(r) {
   if (r.error) { L("  " + r.tag.padEnd(30) + " ERROR: " + r.error); return; }
   L("  " + r.tag.padEnd(30) +
      " dBg=" + (r.dBg>=0?"+":"") + r.dBg.toFixed(1).padStart(5) + "%" +
      " dContrast=" + (r.dContrast>=0?"+":"") + r.dContrast.toFixed(1).padStart(5) + "%" +
      " dHF1=" + (r.dHF1>=0?"+":"") + r.dHF1.toFixed(1).padStart(5) + "%" +
      " |Δ|=" + r.dm.toFixed(5));
}

function sweepImage(path, label, type) {
   L("\n===== " + label + " [" + type + "] =====");
   var v = null;
   try {
      v = loadStretched(path, label);
      var base = getLuma(v);
      var fac = Math.max(1, Math.ceil(base.w / 600));
      var bs = fac>1 ? stride(base.d,base.w,base.h,fac) : {data:base.d,w:base.w,h:base.h};
      var sw=bs.w, sh=bs.h;
      var bBg = bgnoise(bs.data, sw, sh);
      var bContrast = ptdContrast(bs.data);
      L("  Baseline bg=" + bBg.toFixed(5) + " contrast=" + bContrast.toFixed(4));

      // ---- LocalContrast (large-radius unsharp) ----
      L("\n  [LocalContrast — varies SCALE (radius) at fixed amount 0.20]");
      [20, 40, 80, 120, 200].forEach(function(r){
         printRow(runMethod(v, bs.data, sw, sh, bBg, bContrast, "localContrast",
            function(st){st.lcAmount=0.20;st.lcRadius=r;}, "LC r="+r));
      });
      L("  [LocalContrast — varies AMOUNT at fixed r=80]");
      [0.10, 0.20, 0.40, 0.60, 0.80].forEach(function(a){
         printRow(runMethod(v, bs.data, sw, sh, bBg, bContrast, "localContrast",
            function(st){st.lcAmount=a;st.lcRadius=80;}, "LC a="+a));
      });

      // ---- HighPass (small-radius unsharp) ----
      L("\n  [HighPass — varies radius (scale) at fixed amount 0.50]");
      [1, 2, 3, 6, 12].forEach(function(r){
         printRow(runMethod(v, bs.data, sw, sh, bBg, bContrast, "highPass",
            function(st){st.hpAmount=0.50;st.hpRadius=r;}, "HP r="+r));
      });
      L("  [HighPass — varies AMOUNT at fixed r=3]");
      [0.20, 0.50, 1.0, 1.5].forEach(function(a){
         printRow(runMethod(v, bs.data, sw, sh, bBg, bContrast, "highPass",
            function(st){st.hpAmount=a;st.hpRadius=3;}, "HP a="+a));
      });

      // ---- Multiscale (a-trous, fine+medium) ----
      L("\n  [Multiscale — fine/medium combinations]");
      [{f:0.4,m:0.0},{f:0.4,m:0.2},{f:0.4,m:0.4},{f:0.0,m:0.4},{f:0.2,m:0.6}].forEach(function(p){
         printRow(runMethod(v, bs.data, sw, sh, bBg, bContrast, "multiscale",
            function(st){st.mdFine=p.f;st.mdMedium=p.m;}, "MS f="+p.f+" m="+p.m));
      });

      // ---- MMTTexture (atrous finest only) ----
      L("\n  [MMTTexture — txAmount sweep]");
      [0.2, 0.5, 0.8, 1.2].forEach(function(a){
         printRow(runMethod(v, bs.data, sw, sh, bBg, bContrast, "mmtTexture",
            function(st){st.txAmount=a;}, "MMT a="+a));
      });

      // ---- EdgeAware (guided filter, small radius) ----
      L("\n  [EdgeAware — radius and amount sweep]");
      [{r:4,a:0.7},{r:8,a:0.7},{r:16,a:0.7},{r:8,a:0.4},{r:8,a:1.2}].forEach(function(p){
         printRow(runMethod(v, bs.data, sw, sh, bBg, bContrast, "edgeAware",
            function(st){st.eaRadius=p.r;st.eaAmount=p.a;}, "EA r="+p.r+" a="+p.a));
      });

      // ---- Dehaze (guided filter, large radius) ----
      L("\n  [Dehaze — radius and strength sweep]");
      [{r:24,s:0.4},{r:48,s:0.4},{r:96,s:0.4},{r:48,s:0.2},{r:48,s:0.8}].forEach(function(p){
         printRow(runMethod(v, bs.data, sw, sh, bBg, bContrast, "dehaze",
            function(st){st.dhRadius=p.r;st.dhStrength=p.s;}, "DH r="+p.r+" s="+p.s));
      });

   } catch(e) {
      L("ERROR: " + e.message + (e.stack?"\n"+e.stack:""));
   }
   try{if(v)v.window.forceClose();}catch(ex){}
}

function main(){
   L("=== Detail & Contrast Parameter Sweep — 2026-06-22 ===");
   sweepImage(IDIR+"NGC3184_RGB.xisf",    "Galaxy_NGC3184",    "galaxy");
   sweepImage(IDIR+"Collinder34_RGB.xisf","Nebula_Coll34",     "nebula");
   sweepImage(IDIR+"M13_RGB.xisf",        "Globular_M13",      "globular");
   sweepImage(IDIR+"NGC2392_RGB.xisf",    "Planetary_NGC2392", "planetary");
   L("\n=== DONE ===");
}

try{main();}catch(e){L("FATAL: "+e.message+(e.stack?"\n"+e.stack:""));}
