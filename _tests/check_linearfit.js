#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"
var MDIR="E:/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/Collinder 34 COPIADO/WBPP/master/";
var LOG="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/check_linearfit.log";
var B=""; function L(s){B+=String(s)+"\n";try{File.writeTextFile(LOG,B);}catch(e){}}
function ch(f,e){return MDIR+"masterLight_BIN-1_6248x4176_EXPOSURE-"+e+"_FILTER-"+f+"_mono_autocrop.xisf";}
function med(v){var im=v.image,w=im.width,h=im.height,n=w*h,rc=new Rect(0,0,w,h),o=[];
   for(var c=0;c<3;c++){var a=new Float32Array(n);im.getSamples(a,rc,c);var s=[],st=Math.max(1,(n/30000)|0);for(var i=0;i<n;i+=st)s.push(a[i]);s.sort(function(x,y){return x-y;});o.push(s[(s.length/2)|0]);}
   return "("+o[0].toFixed(4)+","+o[1].toFixed(4)+","+o[2].toFixed(4)+")";}
try{
   var r=ImageWindow.open(ch("R","180.00s"))[0],g=ImageWindow.open(ch("G","180.00s"))[0],b=ImageWindow.open(ch("B","180.00s"))[0];
   var w=r.mainView.image.width,h=r.mainView.image.height;
   var tw=new ImageWindow(w,h,3,32,true,true,"lf_test");var cc=new ChannelCombination;cc.colorSpace=0;cc.channels=[[true,r.mainView.id],[true,g.mainView.id],[true,b.mainView.id]];cc.executeOn(tw.mainView);
   var v=tw.mainView;
   L("after combine medians="+med(v));
   try{optCabraBackgroundAuto(v);L("ABE ok, medians="+med(v));}catch(e){L("ABE THREW: "+e.message);}
   try{optRunBackgroundNeutralization(v);L("BN ok, medians="+med(v));}catch(e){L("BN THREW: "+e.message);}
   try{optRunAutoLinearFitWorkflow(v);L("LinearFit ok, medians="+med(v));}catch(e){L("LinearFit THREW: "+e.message+(e.stack?(" | "+e.stack):""));}
   L("DONE");
}catch(e){L("ERROR: "+e.message);}
