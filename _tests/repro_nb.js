#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"
#include <pjsr/UndoFlag.jsh>
var OUT="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/repro_nb.png";
var LOG="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/repro_nb.log";
var B=""; function L(s){B+=String(s)+"\n";try{File.writeTextFile(LOG,B);}catch(e){}}
var NER="E:/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/";
function col(f,e){return NER+"PK 164+31.1/WBPP/master/masterLight_BIN-1_6248x4176_EXPOSURE-"+e+"_FILTER-"+f+"_mono_autocrop.xisf";}
function op(p){if(!File.exists(p))return null;var w=ImageWindow.open(p);return w&&w.length?w[0].mainView:null;}
function savePng(v,path){var im=v.image,W0=im.width,H0=im.height,k=Math.ceil(Math.max(W0,H0)/1400),W=Math.floor(W0/k),H=Math.floor(H0/k);
   var sw=new ImageWindow(W,H,3,32,true,true,"r_"+Math.floor(Math.random()*1e6)),dst=new Image(W,H,3,ColorSpace_RGB,32,SampleType_Real),rc=new Rect(0,0,W0,H0);
   for(var ch=0;ch<3;ch++){var full=new Float32Array(W0*H0);im.getSamples(full,rc,ch);var red=new Float32Array(W*H);for(var y=0;y<H;y++){var sy=(y*k)*W0;for(var x=0;x<W;x++)red[y*W+x]=full[sy+x*k];}dst.selectedChannel=ch;dst.setSamples(red,new Rect(0,0,W,H));}
   dst.resetSelections();sw.mainView.beginProcess(UndoFlag_NoSwapFile);sw.mainView.image.assign(dst);sw.mainView.endProcess();sw.saveAs(path,false,false,false,false);sw.forceClose();}
try{
   var map={R:null,G:null,B:null,L:null,RGB:null,H:op(col("H","180.00s")),O:op(col("O","180.00s")),S:op(col("S","180.00s"))};
   L("loaded H/O/S = "+!!map.H+"/"+!!map.O+"/"+!!map.S);
   var res=optCabraDispatch(map,{dialog:null,palettes:["HOO","SHO"]});
   L("case="+res.decision.caseId+" cand="+res.candidates.length+" -> "+res.candidates.map(function(c){return c.name;}).join(", "));
   for(var i=0;i<res.candidates.length;i++){
      var nm=res.candidates[i].name.replace(/[^A-Za-z0-9]/g,"_");
      var p=OUT.replace(/\.png$/, "_"+i+"_"+nm+".png");
      savePng(res.candidates[i].view, p);
      L("saved cand["+i+"] "+res.candidates[i].name+" -> "+p);
   }
   L("DONE");
}catch(e){L("FATAL: "+e.message+(e.stack?("\n"+e.stack):""));}
