#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"

// Validates optCabraDecideTree on real loaded channels for several scenarios.
var ND="E:/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/";
var LOG="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/cm_tree_test.log";
var B=""; function L(s){B+=String(s)+"\n";try{File.writeTextFile(LOG,B);}catch(e){}}
function col(f,e){return ND+"Collinder 34 COPIADO/WBPP/master/masterLight_BIN-1_6248x4176_EXPOSURE-"+e+"_FILTER-"+f+"_mono_autocrop.xisf";}
function ngc(f,e){return ND+"NGC 2392/WBPP/master/masterLight_BIN-1_6248x4176_EXPOSURE-"+e+"_FILTER-"+f+"_mono_autocrop.xisf";}
function op(p){try{if(!File.exists(p))return null;var w=ImageWindow.open(p);return w&&w.length?w[0]:null;}catch(e){return null;}}
function v(win){return win?win.mainView:null;}
function report(tag,map){
   var d=optCabraDecideTree(map);
   L("== "+tag+" ==");
   var qs=["R","G","B","L","H","O","S","RGB"],line="  SNR:";
   for(var i=0;i<qs.length;i++){var Q=d.quality[qs[i]];if(Q)line+=" "+qs[i]+"="+Q.snr.toFixed(1)+"(exp"+Q.exposure+")";}
   L(line);
   L("  -> case="+d.caseId+" role="+d.role+" usableNB=["+d.usableNB.join(",")+"] hasL="+d.hasL);
   for(var r=0;r<d.reasons.length;r++)L("     . "+d.reasons[r]);
}
try{
   // Scenario A: full RGB+NB (Collinder34 has R,G,B,L,H,O,S)
   var wins=[];
   var R=op(col("R","180.00s")),G=op(col("G","180.00s")),Bc=op(col("B","180.00s")),Lc=op(col("L","180.00s"));
   var H=op(col("H","300.00s")),O=op(col("O","300.00s")),S=op(col("S","300.00s"));
   wins=[R,G,Bc,Lc,H,O,S];
   report("Collinder34 full RGB+NB", {R:v(R),G:v(G),B:v(Bc),L:v(Lc),H:v(H),O:v(O),S:v(S),RGB:null});
   // Scenario B: only RGB (drop NB)
   report("Collinder34 RGB only", {R:v(R),G:v(G),B:v(Bc),L:v(Lc),H:null,O:null,S:null,RGB:null});
   // Scenario C: only NB (drop broadband)
   report("Collinder34 NB only", {R:null,G:null,B:null,L:null,H:v(H),O:v(O),S:v(S),RGB:null});
   for(var i=0;i<wins.length;i++){try{if(wins[i])wins[i].forceClose();}catch(e){}}
   // Scenario D: NGC2392 (planetary) RGB short 10s + NB 180s -> expect RGB stars_only (3a)
   var nR=op(ngc("R","10.00s")),nG=op(ngc("G","10.00s")),nB=op(ngc("B","10.00s")),nH=op(ngc("H","180.00s")),nO=op(ngc("O","180.00s"));
   report("NGC2392 RGB(10s)+NB(180s)", {R:v(nR),G:v(nG),B:v(nB),L:null,H:v(nH),O:v(nO),S:null,RGB:null});
   [nR,nG,nB,nH,nO].forEach(function(x){try{if(x)x.forceClose();}catch(e){}});
   L("DONE");
}catch(e){L("ERROR: "+e.message+(e.stack?("\n"+e.stack):""));}
