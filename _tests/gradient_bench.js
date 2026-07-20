#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"
#include <pjsr/UndoFlag.jsh>

// GRADIENT A/B BENCH (headless-valid: ABE / AutoDBE / GraXpert are CPU/script, no GPU).
// Metric = background FLATNESS: tile the frame, take a low percentile per tile (background,
// robust to stars/signal), then report the dispersion (bgStd) and peak-to-peak (bgRamp) of
// those tile-backgrounds across the frame. LOWER = flatter background = better correction.
var LOG="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/gradient_bench.log";
var B=""; function L(s){B+=String(s)+"\n";try{File.writeTextFile(LOG,B);}catch(e){}}
var NER="E:/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/";
function m82(f,e){return NER+"M82/WBPP2/master/masterLight_BIN-1_6248x4176_EXPOSURE-"+e+"_FILTER-"+f+"_mono.xisf";}
function col(f,e){return NER+"Collinder 34 COPIADO/WBPP/master/masterLight_BIN-1_6248x4176_EXPOSURE-"+e+"_FILTER-"+f+"_mono_autocrop.xisf";}
function op(p){if(!File.exists(p))return null;var w=ImageWindow.open(p);return w&&w.length?w[0].mainView:null;}

// Signal-retention metrics to catch OVER-subtraction (eating real nebulosity):
//   clip0   = % pixels pushed to 0 (black-clipped) -> high = over-correction
//   sigKeep = mean of brightest 5% AFTER / BEFORE (%) -> <100 = bright signal eaten
function bright5(v){var im=v.image,W=im.width,H=im.height,n=W*H,rc=new Rect(0,0,W,H);var s=0,c=0;
   for(var ch=0;ch<im.numberOfChannels;ch++){var Y=new Float32Array(n);im.getSamples(Y,rc,ch);
      var a=[],st=Math.max(1,(n/60000)|0);for(var i=0;i<n;i+=st)a.push(Y[i]);a.sort(function(x,y){return x-y;});
      var k=Math.floor(a.length*0.95),m=0;for(var j=k;j<a.length;j++)m+=a[j];s+=m/Math.max(1,a.length-k);c++;}
   return s/c;}
function clip0(v){var im=v.image,W=im.width,H=im.height,n=W*H,rc=new Rect(0,0,W,H),z=0,tot=0;
   for(var ch=0;ch<im.numberOfChannels;ch++){var Y=new Float32Array(n);im.getSamples(Y,rc,ch);
      for(var i=0;i<n;i+=7){tot++;if(Y[i]<=0)z++;}}
   return 100*z/Math.max(1,tot);}

// per-channel tile-background flatness, averaged over channels. G x G grid.
function flat(v){
   var im=v.image,W=im.width,H=im.height,n=W*H,rc=new Rect(0,0,W,H);var G=24;
   var nch=im.numberOfChannels,accStd=0,accRamp=0;
   for(var ch=0;ch<nch;ch++){
      var Y=new Float32Array(n);im.getSamples(Y,rc,ch);
      var tb=[];
      for(var ty=0;ty<G;ty++)for(var tx=0;tx<G;tx++){
         var x0=Math.floor(tx*W/G),x1=Math.floor((tx+1)*W/G),y0=Math.floor(ty*H/G),y1=Math.floor((ty+1)*H/G);
         var s=[];for(var y=y0;y<y1;y+=3){var row=y*W;for(var x=x0;x<x1;x+=3)s.push(Y[row+x]);}
         s.sort(function(a,b){return a-b;});
         tb.push(s[Math.floor(s.length*0.10)]); // 10th pct = local background
      }
      var m=0;for(var i=0;i<tb.length;i++)m+=tb[i];m/=tb.length;
      var sq=0,mn=1e9,mx=-1e9;for(var j=0;j<tb.length;j++){var d=tb[j]-m;sq+=d*d;if(tb[j]<mn)mn=tb[j];if(tb[j]>mx)mx=tb[j];}
      accStd+=Math.sqrt(sq/tb.length);accRamp+=(mx-mn);
   }
   return {std:(accStd/nch)*1000,ramp:(accRamp/nch)*1000};
}

// In-place ABE: compute background model (discardModel=false) then PixelMath-subtract it,
// so the correction is guaranteed measurable on `view`. degree = functionDegree.
function abeInPlace(view, degree){
   var before=ImageWindow.windows.length, ids={};var ww=ImageWindow.windows;for(var i=0;i<ww.length;i++)ids[ww[i].mainView.id]=true;
   var abe=new AutomaticBackgroundExtractor();
   try{abe.targetCorrection=AutomaticBackgroundExtractor.prototype.None;}catch(e0){try{abe.targetCorrection=0;}catch(e0b){}}
   try{abe.functionDegree=degree;}catch(e1){}
   try{abe.normalize=false;}catch(e2){}
   try{abe.discardModel=false;}catch(e3){}
   try{abe.replaceTarget=false;}catch(e4){}
   abe.executeOn(view);
   // find the new background-model window
   var model=null,wa=ImageWindow.windows;for(var k=0;k<wa.length;k++){var id=wa[k].mainView.id;if(!ids[id]&&/background/i.test(id)){model=wa[k];break;}}
   if(!model){for(var k2=0;k2<wa.length;k2++){var id2=wa[k2].mainView.id;if(!ids[id2]){model=wa[k2];break;}}}
   if(!model)throw new Error("ABE produced no background model window");
   var P=new PixelMath;P.expression=view.id+" - "+model.mainView.id+" + 0.0001";
   P.useSingleExpression=true;P.createNewImage=false;P.truncate=true;P.truncateLower=0;P.truncateUpper=1;
   P.executeOn(view);
   try{model.forceClose();}catch(e5){}
}

var VARIANTS=[
 {tag:"ABE deg4 (CabraMagic, real)", fn:function(v){optCabraBackgroundAuto(v);}},
 {tag:"ABE deg1 (manual)", fn:function(v){abeInPlace(v,1);}},
 {tag:"AutoDBE", fn:function(v){optRunAutoDBEGradientCorrection(v,{descentPathsInput:500,tolerance:1.0,smoothing:0.5,showModel:false});}},
 {tag:"GraXpert", fn:function(v){optRunGraXpertDirectly(v,null);}}
];

var TARGETS=[
 {n:"M82 (galaxy, bg-dominant)", m:function(){return {R:op(m82("R","60.00s")),G:op(m82("G","60.00s")),B:op(m82("B","60.00s"))};}},
 {n:"Collinder34 (nebula, extended signal)", m:function(){return {R:op(col("R","180.00s")),G:op(col("G","180.00s")),B:op(col("B","180.00s"))};}}
];

try{
   L("=== GRADIENT A/B BENCH (flatness + signal retention) ===");
   L("flatness: lower bgStd/bgRamp = flatter. retention: clip0% low + sigKeep% near 100 = signal preserved (NOT over-subtracted).");
   var gxExe=optResolveGraXpertExecutablePath();
   L("GraXpert exe: "+(gxExe&&gxExe.length?gxExe:"(not configured -> GraXpert skips)"));
   for(var ti=0;ti<TARGETS.length;ti++){var T=TARGETS[ti];
      L(""); L("======== "+T.n+" ========");
      var map;try{map=T.m();}catch(eM){L("  map err "+eM.message);continue;}
      if(!optSafeView(map.R)){L("  channels missing");continue;}
      var base=optCabraCombineRGB(map.R.id,map.G.id,map.B.id,map.R.image.width,map.R.image.height,"gb_base"+ti);
      var f0=flat(base),b0=bright5(base);
      // SCALE-INVARIANT flatness: bgStd / bright5 (signal). Both scale together if a tool
      // rescales the image, so the ratio is comparable across tools. Lower = flatter.
      var rel0=f0.std/Math.max(1e-9,b0);
      L("  RAW:  relFlat="+(rel0*1000).toFixed(3)+" (bgStd "+f0.std.toFixed(3)+" / sig "+b0.toExponential(2)+")");
      for(var v=0;v<VARIANTS.length;v++){var V=VARIANTS[v];var c=null;
         try{
            c=optCabraClonePM(base,"gb_"+ti+"_"+v);
            var t0=(new Date()).getTime();
            V.fn(c);
            var dt=(((new Date()).getTime()-t0)/1000).toFixed(1);
            var f=flat(c),bk=bright5(c),cz=clip0(c);
            var rel=f.std/Math.max(1e-9,bk);
            L("  ["+V.tag+"]  relFlat="+(rel*1000).toFixed(3)+" ("+((1-rel/rel0)*100).toFixed(0)+"% flatter)"+
              "  | sigKeep="+(100*bk/Math.max(1e-9,b0)).toFixed(0)+"% clip0="+cz.toFixed(2)+"%  ("+dt+"s)");
         }catch(e){L("  ["+V.tag+"] ERR/skip: "+e.message);}
         finally{try{if(c&&c.window)c.window.forceClose();}catch(e2){}}
      }
      try{base.window.forceClose();["R","G","B"].forEach(function(k){if(map[k]&&map[k].window)map[k].window.forceClose();});}catch(e){}
   }
   L(""); L("DONE");
}catch(e){L("FATAL: "+e.message+(e.stack?("\n"+e.stack):""));}
