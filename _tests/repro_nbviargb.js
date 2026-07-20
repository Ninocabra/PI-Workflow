#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"
#include <pjsr/UndoFlag.jsh>
var OUT="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/repro_nbviargb.png";
var LOG="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/repro_nbviargb.log";
var B=""; function L(s){B+=String(s)+"\n";try{File.writeTextFile(LOG,B);}catch(e){}}
var NER="E:/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/";
function pk(f,e){return NER+"PK 164+31.1/WBPP/master/masterLight_BIN-1_6248x4176_EXPOSURE-"+e+"_FILTER-"+f+"_mono_autocrop.xisf";}
function op(p){if(!File.exists(p))return null;var w=ImageWindow.open(p);return w&&w.length?w[0].mainView:null;}
function clip(v){var im=v.image,n=im.width*im.height,rc=new Rect(0,0,im.width,im.height),z=0,t=0;for(var c=0;c<3;c++){var a=new Float32Array(n);im.getSamples(a,rc,c);for(var i=0;i<n;i+=9){t++;if(a[i]>=0.999)z++;}}return 100*z/t;}
function savePng(v,path){var im=v.image,W0=im.width,H0=im.height,k=Math.ceil(Math.max(W0,H0)/1200),W=Math.floor(W0/k),H=Math.floor(H0/k);
   var sw=new ImageWindow(W,H,3,32,true,true,"rr"),dst=new Image(W,H,3,ColorSpace_RGB,32,SampleType_Real),rc=new Rect(0,0,W0,H0);
   for(var ch=0;ch<3;ch++){var full=new Float32Array(W0*H0);im.getSamples(full,rc,ch);var red=new Float32Array(W*H);for(var y=0;y<H;y++){var sy=(y*k)*W0;for(var x=0;x<W;x++)red[y*W+x]=full[sy+x*k];}dst.selectedChannel=ch;dst.setSamples(red,new Rect(0,0,W,H));}
   dst.resetSelections();sw.mainView.beginProcess(UndoFlag_NoSwapFile);sw.mainView.image.assign(dst);sw.mainView.endProcess();sw.saveAs(path,false,false,false,false);sw.forceClose();}
try{
   var H=op(pk("H","180.00s")),O=op(pk("O","180.00s")),S=op(pk("S","180.00s"));
   var fin=optCabraComposeNBviaRGB(optCabraClonePM(H,"h0"),optCabraClonePM(O,"o0"),optCabraClonePM(S,"s0"),{dialog:null,tag:"nv"});
   L("white-clip% (current NB-via-RGB) = "+clip(fin).toFixed(2));
   savePng(fin,OUT); L("saved "+OUT); L("DONE");
}catch(e){L("FATAL: "+e.message+(e.stack?("\n"+e.stack):""));}
