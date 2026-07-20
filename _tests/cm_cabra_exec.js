#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"
#include <pjsr/UndoFlag.jsh>

// End-to-end headless test of the CabraMagic executor CORE on a real linear RGB
// master. Dialog-coupled stages (background/SPCC) self-skip without a dialog; the
// tool stages (BXT/NXT/AutoGHS/finishing) actually run, proving the orchestration.
var SRC = "E:/ASTRO Sin Procesar/ED127 en Valls/ASI 585 MC/NGC 1560/WBPP/master/masterLight_BIN-1_3840x2160_EXPOSURE-180.00s_FILTER-Galx_combined_RGB_autocrop.xisf";
var LOG = "C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/cm_cabra_exec.log";
var B=""; function L(s){ B+=String(s)+"\n"; try{File.writeTextFile(LOG,B);}catch(e){} }
function med(view){ var im=view.image,n=im.width*im.height,a=new Float32Array(n);im.getSamples(a,new Rect(0,0,im.width,im.height),0);
   var s=[],st=Math.max(1,(n/40000)|0); for(var i=0;i<n;i+=st)s.push(a[i]); s.sort(function(x,y){return x-y;}); return s[(s.length/2)|0]; }
try{
   if(!File.exists(SRC)){ L("MISSING "+SRC); throw new Error("no src"); }
   var w=ImageWindow.open(SRC)[0], v=w.mainView;
   var k=Math.ceil(Math.max(v.image.width,v.image.height)/1400);
   if(k>1){var P=new IntegerResample;P.zoomFactor=-k;P.downsamplingMode=0;P.executeOn(v);}
   L("input "+v.image.width+"x"+v.image.height+" ch="+v.image.numberOfChannels+" medianR(before)="+med(v).toFixed(5));
   var t0=Date.now();
   var rep=optCabraMagicRun(v, null);
   L("elapsed "+((Date.now()-t0)/1000).toFixed(1)+"s");
   L("recipe: "+JSON.stringify(rep.recipe));
   L("--- stages ---");
   for(var i=0;i<rep.stages.length;++i) L("  "+rep.stages[i].name+": "+rep.stages[i].status+(rep.stages[i].detail?(" ("+rep.stages[i].detail+")"):""));
   L("medianR(after)="+med(v).toFixed(5)+"   (stretch should lift it well above the linear value)");
   try{ var out="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/cm_cabra_NGC1560_Final.xisf";
        w.saveAs(out,false,false,false,false); L("saved Final -> "+out); }catch(es){ L("save warn: "+es.message); }
   try{w.forceClose();}catch(e){}
   L("DONE");
}catch(e){ L("ERROR: "+e.message+(e.stack?("\n"+e.stack):"")); }
