#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"
#include <pjsr/UndoFlag.jsh>
var OUT="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/repro_rgb.png";
var LOG="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/repro_rgb.log";
var B=""; function L(s){B+=String(s)+"\n";try{File.writeTextFile(LOG,B);}catch(e){}}
var ED="E:/ASTRO Sin Procesar/ED127 en Valls/";
function ngc(f){return ED+"NGC3184 Repetir/WBPP/master/masterLight_BIN-1_6248x4176_EXPOSURE-180.00s_FILTER-"+f+"_mono_autocrop.xisf";}
function op(p){if(!File.exists(p))return null;var w=ImageWindow.open(p);return w&&w.length?w[0].mainView:null;}
try{
   var map={R:op(ngc("R")),G:op(ngc("G")),B:op(ngc("B")),L:null,H:null,O:null,S:null,RGB:null};
   L("loaded R/G/B = "+!!map.R+"/"+!!map.G+"/"+!!map.B);
   console.beginLog();
   var res=optCabraDispatch(map,{dialog:null,palettes:["HOO"]});
   var clog=""; try{clog=console.endLog();}catch(e){}
   L("case="+res.decision.caseId+" role="+res.decision.role+" cand="+res.candidates.length);
   L("reasons: "+res.decision.reasons.join(" | "));
   // grep the console for which gradient/split engine ran
   var lines=String(clog).split("\n"); for(var i=0;i<lines.length;i++){ if(/RGB gradient:|star split|Star split|StarNet|SyQon|AutoDBE|GraXpert/i.test(lines[i])) L("   > "+lines[i].replace(/^\[[^\]]*\]\s*/,"")); }
   var v=res.candidates[0].view;
   var im=v.image,W0=im.width,H0=im.height,k=Math.ceil(Math.max(W0,H0)/1400),W=Math.floor(W0/k),H=Math.floor(H0/k);
   var sw=new ImageWindow(W,H,3,32,true,true,"repro_small"),dst=new Image(W,H,3,ColorSpace_RGB,32,SampleType_Real),rc=new Rect(0,0,W0,H0);
   for(var ch=0;ch<3;ch++){var full=new Float32Array(W0*H0);im.getSamples(full,rc,ch);var red=new Float32Array(W*H);for(var y=0;y<H;y++){var sy=(y*k)*W0;for(var x=0;x<W;x++)red[y*W+x]=full[sy+x*k];}dst.selectedChannel=ch;dst.setSamples(red,new Rect(0,0,W,H));}
   dst.resetSelections();sw.mainView.beginProcess(UndoFlag_NoSwapFile);sw.mainView.image.assign(dst);sw.mainView.endProcess();
   sw.saveAs(OUT,false,false,false,false);
   L("saved "+OUT+" ("+W+"x"+H+")"); L("DONE");
}catch(e){L("FATAL: "+e.message+(e.stack?("\n"+e.stack):""));}
