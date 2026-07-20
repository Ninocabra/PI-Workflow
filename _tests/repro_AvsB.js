#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"
#include <pjsr/UndoFlag.jsh>
var DIR="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/";
var LOG=DIR+"repro_AvsB.log";
var B=""; function L(s){B+=String(s)+"\n";try{File.writeTextFile(LOG,B);}catch(e){}}
var NER="E:/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/";
function m82(f,e){return NER+"M82/WBPP2/master/masterLight_BIN-1_6248x4176_EXPOSURE-"+e+"_FILTER-"+f+"_mono.xisf";}
function op(p){if(!File.exists(p))return null;var w=ImageWindow.open(p);return w&&w.length?w[0].mainView:null;}
function savePng(v,path){var im=v.image,W0=im.width,H0=im.height,k=Math.ceil(Math.max(W0,H0)/1300),W=Math.floor(W0/k),H=Math.floor(H0/k);
   var sw=new ImageWindow(W,H,3,32,true,true,"rr"+Math.floor(Math.random()*1e6)),dst=new Image(W,H,3,ColorSpace_RGB,32,SampleType_Real),rc=new Rect(0,0,W0,H0);
   for(var ch=0;ch<3;ch++){var full=new Float32Array(W0*H0);im.getSamples(full,rc,ch);var red=new Float32Array(W*H);for(var y=0;y<H;y++){var sy=(y*k)*W0;for(var x=0;x<W;x++)red[y*W+x]=full[sy+x*k];}dst.selectedChannel=ch;dst.setSamples(red,new Rect(0,0,W,H));}
   dst.resetSelections();sw.mainView.beginProcess(UndoFlag_NoSwapFile);sw.mainView.image.assign(dst);sw.mainView.endProcess();sw.saveAs(path,false,false,false,false);sw.forceClose();}
try{
   var R=op(m82("R","60.00s")),G=op(m82("G","60.00s")),Bb=op(m82("B","60.00s"));
   // ROUTE A: combine into one RGB, run optCabraMagicRun (single-image pipeline)
   var rgbA=optCabraCombineRGB(R.id,G.id,Bb.id,R.image.width,R.image.height,"AvsB_A");
   optCabraMagicRun(rgbA,null);
   savePng(rgbA,DIR+"AvsB_routeA.png"); try{rgbA.window.forceClose();}catch(e){}
   L("Route A done.");
   // ROUTE B: rgb case compose from the same channels
   var finB=optCabraComposeRGB({R:R,G:G,B:Bb},{dialog:null,tag:"AvsB_B"});
   savePng(finB,DIR+"AvsB_routeB.png"); try{finB.window.forceClose();}catch(e){}
   L("Route B done.");
   L("DONE");
}catch(e){L("FATAL: "+e.message+(e.stack?("\n"+e.stack):""));}
