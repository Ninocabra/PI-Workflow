#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"
#include <pjsr/UndoFlag.jsh>

// Expanded multi-target consistency bench: drives optCabraDispatch (real branch routing)
// on 6 targets covering all branches/types, and compares candidate[0] to the user's
// reference with rich metrics (color + structure + contrast + tonal). dialog=null -> ABE.
var LOG="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/multi_target_bench.log";
var B=""; function L(s){B+=String(s)+"\n";try{File.writeTextFile(LOG,B);}catch(e){}}
var NER="E:/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/";
var ED="E:/ASTRO Sin Procesar/ED127 en Valls/";
function col(f,e){return NER+"Collinder 34 COPIADO/WBPP/master/masterLight_BIN-1_6248x4176_EXPOSURE-"+e+"_FILTER-"+f+"_mono_autocrop.xisf";}
function m82(f,e){return NER+"M82/WBPP2/master/masterLight_BIN-1_6248x4176_EXPOSURE-"+e+"_FILTER-"+f+"_mono.xisf";}
function pk(f,e){return NER+"PK 164+31.1/WBPP/master/masterLight_BIN-1_6248x4176_EXPOSURE-"+e+"_FILTER-"+f+"_mono_autocrop.xisf";}
function ngc(f){return ED+"NGC3184 Repetir/WBPP/master/masterLight_BIN-1_6248x4176_EXPOSURE-180.00s_FILTER-"+f+"_mono_autocrop.xisf";}
function cad(f,e){return NER+"Cadwell 5 COPIADO/WBPP3/master/masterLight_BIN-1_6248x4176_EXPOSURE-"+e+"_FILTER-"+f+"_mono_autocrop.xisf";}
function ldu(f,e){return NER+"LDu 2 COPIADO/WBPP/master/masterLight_BIN-1_6248x4176_EXPOSURE-"+e+"_FILTER-"+f+"_mono_autocrop.xisf";}
function op(p){if(!File.exists(p))return null;var w=ImageWindow.open(p);return w&&w.length?w[0].mainView:null;}

var T=[
 {n:"Collinder34_neb",   type:"nebula",   m:function(){return {R:op(col("R","180.00s")),G:op(col("G","180.00s")),B:op(col("B","180.00s")),H:op(col("H","300.00s")),O:op(col("O","300.00s")),S:op(col("S","300.00s")),L:null,RGB:null};}, ref:NER+"Collinder 34 COPIADO/Imagenes/Collinder 34 Final_5.tif"},
 {n:"M82_galaxyNB",      type:"galaxy",   m:function(){return {R:op(m82("R","60.00s")),G:op(m82("G","60.00s")),B:op(m82("B","60.00s")),H:op(m82("H","180.00s")),O:op(m82("O","180.00s")),S:op(m82("S","180.00s")),L:null,RGB:null};}, ref:NER+"M82/WBPP2/Images/M82_Final_1.tif"},
 {n:"PK164_planetary",   type:"planetary",m:function(){return {R:op(pk("R","30.00s")),G:op(pk("G","30.00s")),B:op(pk("B","30.00s")),H:op(pk("H","180.00s")),O:op(pk("O","180.00s")),S:op(pk("S","180.00s")),L:null,RGB:null};}, ref:NER+"PK 164+31.1/PM2/PiMagic-PK_164_31_1-2026-04-24-14-54-53/PiMagic/Previews/Final_Preview_PK_164_31_1_HOO.jpg"},
 {n:"NGC3184_rgbGal",    type:"galaxy",   m:function(){return {R:op(ngc("R")),G:op(ngc("G")),B:op(ngc("B")),L:op(ngc("L")),H:null,O:null,S:null,RGB:null};}, ref:ED+"NGC3184 Repetir/PiMagic-NGC3184-2026-01-31-11-41-51/PiMagic/Final_NGC3184_RGB.tif"},
 {n:"Cadwell5_HaRGBgal", type:"galaxy",   m:function(){return {R:op(cad("R","180.00s")),G:op(cad("G","180.00s")),B:op(cad("B","180.00s")),L:op(cad("L","300.00s")),H:op(cad("H","300.00s")),O:null,S:null,RGB:null};}, ref:NER+"Cadwell 5 COPIADO/Imagenes/Imagenes 3/Cadwell 5 Final.tif"},
 {n:"LDu2_HaRGBneb",     type:"nebula",   m:function(){return {R:op(ldu("R","180.00s")),G:op(ldu("G","180.00s")),B:op(ldu("B","180.00s")),L:op(ldu("L","180.00s")),H:op(ldu("H","300.00s")),O:null,S:null,RGB:null};}, ref:NER+"LDu 2 COPIADO/Imagenes/LDu_2_final_2.png"}
];

// Manual decimation (NO IntegerResample -> no astrometry-discard pop-up). Reads each
// channel full, strided-subsamples into a ~1200px grid.
function feat(v){
   var im=v.image,W0=im.width,H0=im.height,k=Math.ceil(Math.max(W0,H0)/1200);if(k<1)k=1;
   var W=Math.floor(W0/k),H=Math.floor(H0/k),n=W*H,rc=new Rect(0,0,W0,H0);
   var c=[];for(var ic=0;ic<3;ic++){var full=new Float32Array(W0*H0);im.getSamples(full,rc,ic);var red=new Float32Array(n);for(var yy=0;yy<H;yy++){var sy=(yy*k)*W0;for(var xx=0;xx<W;xx++)red[yy*W+xx]=full[sy+xx*k];}c.push(red);full=null;}
   var Y=new Float32Array(n),my=0;for(var j=0;j<n;j++){Y[j]=0.2126*c[0][j]+0.7152*c[1][j]+0.0722*c[2][j];my+=Y[j];}my/=n;
   function pct(a,p){var s=[],st=Math.max(1,(n/40000)|0);for(var k=0;k<n;k+=st)s.push(a[k]);s.sort(function(x,y){return x-y;});return s[Math.min(s.length-1,(s.length*p)|0)];}
   var f={med:[]};for(var k2=0;k2<3;k2++)f.med.push(pct(c[k2],0.5));
   var cs=0,cc=0,st2=Math.max(1,(n/80000)|0);for(var m=0;m<n;m+=st2){var r=c[0][m],g=c[1][m],b=c[2][m],mx=Math.max(r,g,b);if(mx>0.05){cs+=(mx-Math.min(r,g,b))/mx;cc++;}}f.chroma=cc?cs/cc:0;
   var bl=optCmBoxBlur(Y,W,H,8),hf=0;for(var q=0;q<n;q++)hf+=Math.abs(Y[q]-bl[q]);f.struct=(hf/n)/Math.max(1e-4,my);
   f.lum50=pct(Y,0.5);
   return f;
}
function run(){
   L("EXPANDED MULTI-TARGET BENCH (dispatch; chroma/R:B/struct/lum)");
   for(var i=0;i<T.length;i++){var t=T[i];
      L(""); L("== "+t.n+" ["+t.type+"] ==");
      if(!File.exists(t.ref)){L("  REF MISSING"); continue;}
      var map; try{ map=t.m(); }catch(eM){L("  map err "+eM.message);continue;}
      var res; try{ res=optCabraDispatch(map,{dialog:null,palettes:["HOO","SHO"]}); }catch(eD){L("  dispatch ERR "+eD.message);continue;}
      L("  case="+res.decision.caseId+" usableNB=["+res.decision.usableNB.join(",")+"] cand="+res.candidates.length+" ("+res.candidates.map(function(c){return c.name;}).join(",")+")");
      if(!res.candidates.length){continue;}
      var mine=res.candidates[0].view; var fm=feat(mine);
      var refV=op(t.ref); var fr=refV?feat(refV):null;
      L("  MINE chroma="+fm.chroma.toFixed(3)+" R:B="+(fm.med[0]/Math.max(1e-4,fm.med[2])).toFixed(2)+" struct="+fm.struct.toFixed(3)+" lum="+fm.lum50.toFixed(2));
      if(fr) L("  REF  chroma="+fr.chroma.toFixed(3)+" R:B="+(fr.med[0]/Math.max(1e-4,fr.med[2])).toFixed(2)+" struct="+fr.struct.toFixed(3)+" lum="+fr.lum50.toFixed(2)
              +"   GAP chroma "+(fm.chroma-fr.chroma).toFixed(3)+" lum "+(fm.lum50-fr.lum50).toFixed(2));
      try{mine.window.forceClose();if(refV)refV.window.forceClose();
          for(var z=1;z<res.candidates.length;z++){if(res.candidates[z].view&&res.candidates[z].view.window)res.candidates[z].view.window.forceClose();}}catch(e){}
   }
   L("");L("DONE");
}
try{run();}catch(e){L("FATAL: "+e.message+(e.stack?("\n"+e.stack):""));}
