#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"
#include <pjsr/UndoFlag.jsh>

// A/B TOOL BENCH: runs the full optCabraMagicRun pipeline on a linear broadband RGB with
// tool variants (sharpen BXT vs SyQon Parallax; denoise NXT vs SyQon Prism), holding
// everything else constant (dialog=null -> ABE gradient + LinearFit/BkgNeutralize color).
// Metrics: chroma, struct (HF energy -> sharpen signal), noiseBg (dark-region stdev ->
// denoise signal), lum; plus the gap of chroma/struct/lum to the user's reference final.
var LOG="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/ab_tools_bench.log";
var B=""; function L(s){B+=String(s)+"\n";try{File.writeTextFile(LOG,B);}catch(e){}}
var NER="E:/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/";
function col(f,e){return NER+"Collinder 34 COPIADO/WBPP/master/masterLight_BIN-1_6248x4176_EXPOSURE-"+e+"_FILTER-"+f+"_mono_autocrop.xisf";}
function m82(f,e){return NER+"M82/WBPP2/master/masterLight_BIN-1_6248x4176_EXPOSURE-"+e+"_FILTER-"+f+"_mono.xisf";}
function op(p){if(!File.exists(p))return null;var w=ImageWindow.open(p);return w&&w.length?w[0].mainView:null;}

var T=[
 {n:"M82_galaxy", m:function(){return {R:op(m82("R","60.00s")),G:op(m82("G","60.00s")),B:op(m82("B","60.00s"))};}, ref:NER+"M82/WBPP2/Images/M82_Final_1.tif"},
 {n:"Collinder34_neb", m:function(){return {R:op(col("R","180.00s")),G:op(col("G","180.00s")),B:op(col("B","180.00s"))};}, ref:NER+"Collinder 34 COPIADO/Imagenes/Collinder 34 Final_5.tif"}
];

var VARIANTS=[
 {tag:"BXT+NXT (baseline)", sharpen:"BXT",      denoise:"NXT"},
 {tag:"Parallax+NXT",       sharpen:"PARALLAX", denoise:"NXT"},
 {tag:"BXT+Prism",          sharpen:"BXT",      denoise:"PRISM"}
];

// Manual decimation (NO IntegerResample -> no pop-up dialog). Reads each channel full,
// then strided-subsamples into a reduced grid. Returns {c:[R,G,B], W, H, n}.
function decimate(v){
   var im=v.image,W0=im.width,H0=im.height,k=Math.ceil(Math.max(W0,H0)/1200);if(k<1)k=1;
   var W=Math.floor(W0/k),H=Math.floor(H0/k),n=W*H,rc=new Rect(0,0,W0,H0);
   var c=[];
   for(var ch=0;ch<3;ch++){
      var full=new Float32Array(W0*H0);im.getSamples(full,rc,ch);
      var red=new Float32Array(n);
      for(var y=0;y<H;y++){var sy=(y*k)*W0;for(var x=0;x<W;x++)red[y*W+x]=full[sy+x*k];}
      c.push(red);full=null;
   }
   return {c:c,W:W,H:H,n:n};
}
function feat(v){
   var D=decimate(v); var W=D.W,H=D.H,n=D.n,c=D.c;
   var Y=new Float32Array(n),my=0;for(var j=0;j<n;j++){Y[j]=0.2126*c[0][j]+0.7152*c[1][j]+0.0722*c[2][j];my+=Y[j];}my/=n;
   function pct(a,p){var s=[],st=Math.max(1,(n/40000)|0);for(var k=0;k<n;k+=st)s.push(a[k]);s.sort(function(x,y){return x-y;});return s[Math.min(s.length-1,(s.length*p)|0)];}
   var f={};
   var mr=pct(c[0],0.5),mb=pct(c[2],0.5); f.rb=mr/Math.max(1e-4,mb);
   var cs=0,cc=0,st2=Math.max(1,(n/80000)|0);for(var m=0;m<n;m+=st2){var r=c[0][m],g=c[1][m],b=c[2][m],mx=Math.max(r,g,b);if(mx>0.05){cs+=(mx-Math.min(r,g,b))/mx;cc++;}}f.chroma=cc?cs/cc:0;
   var bl=optCmBoxBlur(Y,W,H,8),hf=0;for(var q=0;q<n;q++)hf+=Math.abs(Y[q]-bl[q]);f.struct=(hf/n)/Math.max(1e-4,my);
   f.lum50=pct(Y,0.5);
   // noiseBg: stdev of Y over the darkest 30% of pixels (background), as HF residual to
   // ignore the global gradient. Lower = cleaner background -> better denoise.
   var thr=pct(Y,0.30),sum=0,sq=0,nb=0;for(var p2=0;p2<n;p2++){if(Y[p2]<=thr){var d=Y[p2]-bl[p2];sum+=d;sq+=d*d;nb++;}}
   var mean=nb?sum/nb:0; f.noiseBg=nb?Math.sqrt(Math.max(0,sq/nb-mean*mean)):0;
   return f;
}

function run(){
   L("A/B TOOL BENCH (full pipeline; sharpen=struct, denoise=noiseBg; gap vs reference)");
   for(var i=0;i<T.length;i++){var t=T[i];
      L(""); L("======== "+t.n+" ========");
      var refV=File.exists(t.ref)?op(t.ref):null; var fr=refV?feat(refV):null;
      if(fr) L("  REF   chroma="+fr.chroma.toFixed(3)+" R:B="+fr.rb.toFixed(2)+" struct="+fr.struct.toFixed(3)+" noiseBg="+fr.noiseBg.toFixed(4)+" lum="+fr.lum50.toFixed(2));
      else   L("  REF MISSING ("+t.ref+")");
      if(refV) try{refV.window.forceClose();}catch(e){}
      var map; try{map=t.m();}catch(eM){L("  map err "+eM.message);continue;}
      if(!optSafeView(map.R)||!optSafeView(map.G)||!optSafeView(map.B)){L("  RGB channels missing");continue;}
      for(var v=0;v<VARIANTS.length;v++){var V=VARIANTS[v];
         var rgb=null;
         try{
            rgb=optCabraResolveRGB(map,"abrgb"+i+"_"+v);
            if(!optSafeView(rgb)){L("  ["+V.tag+"] resolveRGB failed");continue;}
            var t0=(new Date()).getTime();
            var rep=optCabraMagicRun(rgb,null,{sharpen:V.sharpen,denoise:V.denoise});
            var dt=(((new Date()).getTime()-t0)/1000).toFixed(1);
            // which sharpen/denoise stage actually ran (confirms the tool wasn't skipped)
            var sStage="",dStage="";
            for(var rs=0;rs<rep.stages.length;rs++){var nm=rep.stages[rs].name;
               if(nm.indexOf("sharpen")===0)sStage=nm+":"+rep.stages[rs].status;
               if(nm.indexOf("denoise")===0)dStage=nm+":"+rep.stages[rs].status;}
            var fm=feat(rgb);
            var gstr=fr?(" | dStruct "+(fm.struct-fr.struct).toFixed(3)+" dChroma "+(fm.chroma-fr.chroma).toFixed(3)+" dLum "+(fm.lum50-fr.lum50).toFixed(2)):"";
            L("  ["+V.tag+"]  "+sStage+" / "+dStage);
            L("       chroma="+fm.chroma.toFixed(3)+" R:B="+fm.rb.toFixed(2)+" struct="+fm.struct.toFixed(3)+" noiseBg="+fm.noiseBg.toFixed(4)+" lum="+fm.lum50.toFixed(2)+"  ("+dt+"s)"+gstr);
         }catch(eV){L("  ["+V.tag+"] ERR "+eV.message);}
         finally{ try{if(rgb&&rgb.window)rgb.window.forceClose();}catch(e){} }
      }
      // free the channel masters between targets
      try{["R","G","B"].forEach(function(k){if(map[k]&&map[k].window)map[k].window.forceClose();});}catch(e){}
   }
   L("");L("DONE");
}
try{run();}catch(e){L("FATAL: "+e.message+(e.stack?("\n"+e.stack):""));}
