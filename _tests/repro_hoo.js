#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"
#include <pjsr/UndoFlag.jsh>
// Reproduce the broken HOO rgb_nb composite headless (dialog=null -> compose background is
// the no-op path after the revert). Save a PNG so we can SEE if stars are dark holes
// independent of the GUI configured-gradient path.
var OUT="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/repro_hoo.png";
var LOG="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/repro_hoo.log";
var B=""; function L(s){B+=String(s)+"\n";try{File.writeTextFile(LOG,B);}catch(e){}}
var NER="E:/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/";
function col(f,e){return NER+"Collinder 34 COPIADO/WBPP/master/masterLight_BIN-1_6248x4176_EXPOSURE-"+e+"_FILTER-"+f+"_mono_autocrop.xisf";}
function op(p){if(!File.exists(p))return null;var w=ImageWindow.open(p);return w&&w.length?w[0].mainView:null;}
try{
   var map={R:op(col("R","180.00s")),G:op(col("G","180.00s")),B:op(col("B","180.00s")),H:op(col("H","300.00s")),O:op(col("O","300.00s")),S:null,L:null,RGB:null};
   L("loaded R/G/B/H/O = "+!!map.R+"/"+!!map.G+"/"+!!map.B+"/"+!!map.H+"/"+!!map.O);
   var res=optCabraDispatch(map,{dialog:null,palettes:["HOO"]});
   L("case="+res.decision.caseId+" cand="+res.candidates.length);
   var v=res.candidates[0].view;
   // downsample for a manageable PNG via manual integer pick (no IntegerResample)
   var im=v.image,W0=im.width,H0=im.height,k=Math.ceil(Math.max(W0,H0)/1400);
   var W=Math.floor(W0/k),H=Math.floor(H0/k);
   var sw=new ImageWindow(W,H,3,32,true,true,"repro_small");
   var dst=new Image(W,H,3,ColorSpace_RGB,32,SampleType_Real),rc=new Rect(0,0,W0,H0);
   for(var ch=0;ch<3;ch++){var full=new Float32Array(W0*H0);im.getSamples(full,rc,ch);var red=new Float32Array(W*H);for(var y=0;y<H;y++){var sy=(y*k)*W0;for(var x=0;x<W;x++)red[y*W+x]=full[sy+x*k];}dst.selectedChannel=ch;dst.setSamples(red,new Rect(0,0,W,H));}
   dst.resetSelections();
   sw.mainView.beginProcess(UndoFlag_NoSwapFile);sw.mainView.image.assign(dst);sw.mainView.endProcess();
   sw.saveAs(OUT,false,false,false,false);
   L("saved "+OUT+" ("+W+"x"+H+")");
   L("DONE");
}catch(e){L("FATAL: "+e.message+(e.stack?("\n"+e.stack):""));}
