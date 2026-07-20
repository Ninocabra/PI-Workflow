#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"
#include <pjsr/UndoFlag.jsh>

// Does optCabraBackgroundAuto (CabraMagic's real background step) actually modify the view
// IN PLACE, or does replaceTarget=false leave it unchanged + create a separate window?
var LOG="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/diag_abe.log";
var B=""; function L(s){B+=String(s)+"\n";try{File.writeTextFile(LOG,B);}catch(e){}}
var NER="E:/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/";
function m82(f,e){return NER+"M82/WBPP2/master/masterLight_BIN-1_6248x4176_EXPOSURE-"+e+"_FILTER-"+f+"_mono.xisf";}
function op(p){if(!File.exists(p))return null;var w=ImageWindow.open(p);return w&&w.length?w[0].mainView:null;}
function sig(v){var im=v.image,n=im.width*im.height,rc=new Rect(0,0,im.width,im.height);var Y=new Float32Array(n);im.getSamples(Y,rc,0);var s=0;for(var i=0;i<n;i+=97)s+=Y[i];return s/(n/97);}
try{
   var R=op(m82("R","60.00s")),G=op(m82("G","60.00s")),Bb=op(m82("B","60.00s"));
   var rgb=optCabraCombineRGB(R.id,G.id,Bb.id,R.image.width,R.image.height,"abe_rgb");
   var before=sig(rgb);
   var idsBefore={};var wb=ImageWindow.windows;for(var i=0;i<wb.length;i++)idsBefore[wb[i].mainView.id]=true;
   L("before: meanCh0="+before.toExponential(5)+"  windows="+wb.length);
   console.beginLog();
   optCabraBackgroundAuto(rgb);
   var clog=""; try{clog=console.endLog();}catch(e){}
   var after=sig(rgb);
   var wa=ImageWindow.windows,newWins=[];for(var k=0;k<wa.length;k++){if(!idsBefore[wa[k].mainView.id])newWins.push(wa[k].mainView.id);}
   L("after : meanCh0="+after.toExponential(5)+"  delta="+(after-before).toExponential(3)+"  => "+(Math.abs(after-before)>1e-7?"VIEW MODIFIED IN PLACE":"VIEW UNCHANGED (no-op!)"));
   L("new windows created: ["+newWins.join(", ")+"]");
   L("console tail: ..."+String(clog).slice(-600).replace(/\n/g," | "));
   L("DONE");
}catch(e){L("FATAL: "+e.message+(e.stack?("\n"+e.stack):""));}
