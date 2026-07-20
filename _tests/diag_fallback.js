#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"
#include <pjsr/UndoFlag.jsh>
var LOG="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/diag_fallback.log";
var B=""; function L(s){B+=String(s)+"\n";try{File.writeTextFile(LOG,B);}catch(e){}}
var NER="E:/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/";
function m82(f,e){return NER+"M82/WBPP2/master/masterLight_BIN-1_6248x4176_EXPOSURE-"+e+"_FILTER-"+f+"_mono.xisf";}
function op(p){if(!File.exists(p))return null;var w=ImageWindow.open(p);return w&&w.length?w[0].mainView:null;}
function sig(v){var im=v.image,n=im.width*im.height,rc=new Rect(0,0,im.width,im.height);var Y=new Float32Array(n);im.getSamples(Y,rc,0);var s=0;for(var i=0;i<n;i+=97)s+=Y[i];return s/(n/97);}
try{
   L("GraXpert exe: "+optResolveGraXpertExecutablePath());
   var R=op(m82("R","60.00s")),Gc=op(m82("G","60.00s")),Bb=op(m82("B","60.00s"));
   var rgb=optCabraCombineRGB(R.id,Gc.id,Bb.id,R.image.width,R.image.height,"fb_rgb");
   var before=sig(rgb);
   var ids={};var wb=ImageWindow.windows;for(var i=0;i<wb.length;i++)ids[wb[i].mainView.id]=true;
   optCabraBackgroundFallback(rgb);
   var after=sig(rgb),wa=ImageWindow.windows,extra=[];for(var k=0;k<wa.length;k++){if(!ids[wa[k].mainView.id])extra.push(wa[k].mainView.id);}
   L("delta="+(after-before).toExponential(3)+" => "+(Math.abs(after-before)>1e-7?"VIEW MODIFIED IN PLACE":"NO-OP!"));
   L("orphan windows left: ["+extra.join(", ")+"]");
   L("DONE");
}catch(e){L("FATAL: "+e.message);}
