#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"
#include <pjsr/UndoFlag.jsh>

// Tests optCabraDispatch end-to-end with a channel map (Collinder34 RGB+NB).
var MDIR="E:/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/Collinder 34 COPIADO/WBPP/master/";
var OUT ="C:/Users/ninoc/Documents/PixInsight/CabraSpace/Pagina Web/Imagenes Prueba/NB_blend_samples/";
var LOG ="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/cm_dispatch_test.log";
var B=""; function L(s){B+=String(s)+"\n";try{File.writeTextFile(LOG,B);}catch(e){}}
function ch(f,e){return MDIR+"masterLight_BIN-1_6248x4176_EXPOSURE-"+e+"_FILTER-"+f+"_mono_autocrop.xisf";}
function op(p){var w=ImageWindow.open(p);return w[0].mainView;}
function png(win,name){try{var k=Math.ceil(Math.max(win.mainView.image.width,win.mainView.image.height)/1000);if(k>1){var P=new IntegerResample;P.zoomFactor=-k;P.downsamplingMode=0;P.executeOn(win.mainView);}win.saveAs(OUT+name+".png",false,false,false,false);}catch(e){}}
try{
   var map={R:op(ch("R","180.00s")),G:op(ch("G","180.00s")),B:op(ch("B","180.00s")),
            L:op(ch("L","180.00s")),H:op(ch("H","300.00s")),O:op(ch("O","300.00s")),S:op(ch("S","300.00s")),RGB:null};
   var res=optCabraDispatch(map,{palettes:["HOO","SHO"]});
   L("decision: case="+res.decision.caseId+" role="+res.decision.role+" usableNB=["+res.decision.usableNB.join(",")+"]");
   L("candidates: "+res.candidates.length);
   for(var i=0;i<res.candidates.length;i++){var c=res.candidates[i];
      L("  ["+i+"] "+c.name+" -> "+(c.view&&c.view.id?c.view.id:"null"));
      if(c.view&&c.view.window){ c.view.window.saveAs(OUT+"Dispatch_Collinder34_"+c.name+".xisf",false,false,false,false); png(c.view.window,"Dispatch_Collinder34_"+c.name); }
   }
   L("DONE");
}catch(e){L("ERROR: "+e.message+(e.stack?("\n"+e.stack):""));}
