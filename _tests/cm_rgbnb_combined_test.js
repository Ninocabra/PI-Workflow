#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"
#include <pjsr/UndoFlag.jsh>

// Validates the user's failing case: a COMBINED RGB image + a single H (and + H+O),
// via optCabraDispatch. Must NOT throw "need Ha and OIII".
var IP="C:/Users/ninoc/Documents/PixInsight/CabraSpace/Pagina Web/Imagenes Prueba/";
var MD="E:/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/Collinder 34 COPIADO/WBPP/master/";
var LOG="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/cm_rgbnb_combined_test.log";
var B=""; function L(s){B+=String(s)+"\n";try{File.writeTextFile(LOG,B);}catch(e){}}
function op(p){if(!File.exists(p))return null;var w=ImageWindow.open(p);return w&&w.length?w[0].mainView:null;}
function H(){return op(MD+"masterLight_BIN-1_6248x4176_EXPOSURE-300.00s_FILTER-H_mono_autocrop.xisf");}
function O(){return op(MD+"masterLight_BIN-1_6248x4176_EXPOSURE-300.00s_FILTER-O_mono_autocrop.xisf");}
function rgb(){return op(IP+"Collinder34_RGB.xisf");}
function test(tag,map){
   try{ var res=optCabraDispatch(map,{dialog:null});
      L(tag+": case="+res.decision.caseId+" usableNB=["+res.decision.usableNB.join(",")+"] candidates="+res.candidates.length+" -> "+res.candidates.map(function(c){return c.name;}).join(", "));
      for(var i=0;i<res.candidates.length;i++){var c=res.candidates[i];try{if(c.view&&c.view.window)c.view.window.forceClose();}catch(e){}}
   }catch(e){ L(tag+": ERROR "+e.message); }
}
try{
   // Scenario 1: combined RGB + only H
   test("RGB(combined)+H", {R:null,G:null,B:null,L:null,H:H(),O:null,S:null,RGB:rgb()});
   // Scenario 2: combined RGB + H + O
   test("RGB(combined)+H+O", {R:null,G:null,B:null,L:null,H:H(),O:O(),S:null,RGB:rgb()});
   L("DONE");
}catch(e){L("FATAL: "+e.message);}
