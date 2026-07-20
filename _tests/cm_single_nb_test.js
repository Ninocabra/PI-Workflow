#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"
#include <pjsr/UndoFlag.jsh>

// Tests RGB + single-NB (Ha only) -> should route to Ha+RGB without "need Ha and OIII".
var MDIR="E:/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/LDu 2 COPIADO/WBPP/master/";
var OUT ="C:/Users/ninoc/Documents/PixInsight/CabraSpace/Pagina Web/Imagenes Prueba/NB_blend_samples/";
var LOG ="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/cm_single_nb_test.log";
var B=""; function L(s){B+=String(s)+"\n";try{File.writeTextFile(LOG,B);}catch(e){}}
function ch(f,e){return MDIR+"masterLight_BIN-1_6248x4176_EXPOSURE-"+e+"_FILTER-"+f+"_mono_autocrop.xisf";}
function op(p){if(!File.exists(p))return null;var w=ImageWindow.open(p);return w&&w.length?w[0].mainView:null;}
function png(win,name){try{var k=Math.ceil(Math.max(win.mainView.image.width,win.mainView.image.height)/1000);if(k>1){var P=new IntegerResample;P.zoomFactor=-k;P.downsamplingMode=0;P.executeOn(win.mainView);}win.saveAs(OUT+name+".png",false,false,false,false);}catch(e){}}
try{
   var map={R:op(ch("R","180.00s")),G:op(ch("G","180.00s")),B:op(ch("B","180.00s")),L:op(ch("L","180.00s")),H:op(ch("H","300.00s")),O:null,S:null,RGB:null};
   L("inputs: R="+!!map.R+" G="+!!map.G+" B="+!!map.B+" H="+!!map.H+" O="+!!map.O);
   var res=optCabraDispatch(map,{dialog:null});
   L("case="+res.decision.caseId+" role="+res.decision.role+" usableNB=["+res.decision.usableNB.join(",")+"]  candidates="+res.candidates.length);
   for(var i=0;i<res.candidates.length;i++){var c=res.candidates[i];
      L("  ["+i+"] "+c.name+" -> "+(c.view&&c.view.id?c.view.id:"null"));
      if(c.view&&c.view.window){c.view.window.saveAs(OUT+"LDu2_single_"+c.name.replace(/[^A-Za-z0-9]/g,"")+".xisf",false,false,false,false);png(c.view.window,"LDu2_single_"+c.name.replace(/[^A-Za-z0-9]/g,""));}
   }
   L("DONE");
}catch(e){L("ERROR: "+e.message+(e.stack?("\n"+e.stack):""));}
