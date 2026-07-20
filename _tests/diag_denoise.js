#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"
#include <pjsr/UndoFlag.jsh>

// Focused diagnostic: applies each sharpen/denoise tool on a real RGB view, ONE at a time,
// and dumps the full console + any exception (message + stack). Everything is printed to
// stdout (captured by the task output file) AND mirrored to the .log.
var LOG="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/diag_denoise.log";
var B=""; function L(s){var line=String(s);B+=line+"\n";try{File.writeTextFile(LOG,B);}catch(e){} console.writeln(line);}
var NER="E:/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/";
function m82(f,e){return NER+"M82/WBPP2/master/masterLight_BIN-1_6248x4176_EXPOSURE-"+e+"_FILTER-"+f+"_mono.xisf";}
function op(p){if(!File.exists(p))return null;var w=ImageWindow.open(p);return w&&w.length?w[0].mainView:null;}

console.show();
L("=== DENOISE/SHARPEN DIAGNOSTIC ===");
L("OPT_TEST_MODE = "+OPT_TEST_MODE+"  (si true, las tools se sustituyen por un transform falso)");
L("PI_WORKFLOW_OPT_TEST_MODE = "+(typeof PI_WORKFLOW_OPT_TEST_MODE!=="undefined"?PI_WORKFLOW_OPT_TEST_MODE:"undef"));

function chans(v){return v?v.image.numberOfChannels:-1;}
function medY(v){var im=v.image,n=im.width*im.height,rc=new Rect(0,0,im.width,im.height);var Y=new Float32Array(n);im.getSamples(Y,rc,0);var s=0;for(var i=0;i<n;i+=97)s+=Y[i];return s/(n/97);}

function tryTool(name, src, fn){
   L(""); L("---- "+name+" ----");
   var v=null;
   try{
      v=optCabraClonePM(src,"diag_"+name.replace(/[^A-Za-z0-9]/g,""));
      var before=medY(v);
      L("  before: ch="+chans(v)+" medY="+before.toFixed(5));
      var t0=(new Date()).getTime();
      fn(v);
      var dt=(((new Date()).getTime()-t0)/1000).toFixed(1);
      var after=medY(v);
      L("  AFTER : medY="+after.toFixed(5)+"  (delta="+(after-before).toFixed(5)+", "+dt+"s)  => "+(Math.abs(after-before)>1e-6?"APPLIED (image changed)":"NO CHANGE (tool likely a no-op)"));
   }catch(e){
      L("  *** EXCEPTION: "+e.message);
      if(e.stack)L("  STACK:\n"+e.stack);
   }finally{ try{if(v&&v.window)v.window.forceClose();}catch(e2){} }
}

try{
   var R=op(m82("R","60.00s")),G=op(m82("G","60.00s")),Bb=op(m82("B","60.00s"));
   L("channels loaded: R="+!!R+" G="+!!G+" B="+!!Bb);
   var rgb=optCabraCombineRGB(R.id,G.id,Bb.id,R.image.width,R.image.height,"diag_rgb");
   L("rgb combined: ch="+chans(rgb));

   tryTool("NXT", rgb, function(v){
      optExecuteNoiseXConfiguredOnView(v, {denoise:0.80, iterations:2, enable_color_separation:false,
         enable_frequency_separation:false, denoise_color:0.0, denoise_lf:0.0, denoise_lf_color:0.0, frequency_scale:5});
   });
   tryTool("BXT", rgb, function(v){
      optExecuteBlurXConfiguredOnView(v, {automatic_psf:true, sharpen_stars:0.10, adjust_star_halos:0.0, sharpen_nonstellar:0.30, correct_only:false});
   });
   tryTool("Prism", rgb, function(v){ optRunSyQonPrismOnView(v, {}, null); });
   tryTool("Parallax", rgb, function(v){ optRunSyQonParallaxOnView(v, {}, null); });

   try{rgb.window.forceClose();}catch(e){}
   try{[R,G,Bb].forEach(function(x){if(x&&x.window)x.window.forceClose();});}catch(e){}
   L(""); L("DONE");
}catch(e){L("FATAL: "+e.message+(e.stack?("\n"+e.stack):""));}
