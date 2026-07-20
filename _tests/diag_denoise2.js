#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"
#include <pjsr/UndoFlag.jsh>

var LOG="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/diag_denoise2.log";
var B=""; function L(s){B+=String(s)+"\n";try{File.writeTextFile(LOG,B);}catch(e){}}
var NER="E:/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/";
function m82(f,e){return NER+"M82/WBPP2/master/masterLight_BIN-1_6248x4176_EXPOSURE-"+e+"_FILTER-"+f+"_mono.xisf";}
function op(p){if(!File.exists(p))return null;var w=ImageWindow.open(p);return w&&w.length?w[0].mainView:null;}

// High-frequency energy of channel 0: mean(|Y - blur(Y)|). Sharpen RAISES it on structure,
// denoise LOWERS it (removes noise). Far more sensitive than the median.
function hf(v){var im=v.image,W=im.width,H=im.height,n=W*H,rc=new Rect(0,0,W,H);var Y=new Float32Array(n);im.getSamples(Y,rc,0);
   var bl=optCmBoxBlur(Y,W,H,3),s=0;for(var i=0;i<n;i++)s+=Math.abs(Y[i]-bl[i]);return s/n;}

function tryTool(name, src, fn){
   L(""); L("---- "+name+" ----");
   var v=null;
   try{
      v=optCabraClonePM(src,"d2_"+name.replace(/[^A-Za-z0-9]/g,""));
      var before=hf(v);
      L("  before HF="+before.toExponential(4));
      console.beginLog();
      var t0=(new Date()).getTime();
      var ret;
      try{ ret=fn(v); }
      finally{
         var dt=(((new Date()).getTime()-t0)/1000).toFixed(2);
         var clog="";
         try{ clog=console.endLog(); }catch(eL){ clog="(endLog failed: "+eL.message+")"; }
         var after=hf(v);
         L("  AFTER  HF="+after.toExponential(4)+"  ratio="+(after/Math.max(1e-12,before)).toFixed(3)+"  ("+dt+"s)  ret="+ret);
         L("  CONSOLE (proceso):");
         L("    "+String(clog).replace(/\n/g,"\n    ").slice(0,4000));
      }
   }catch(e){
      L("  *** EXCEPTION: "+e.message);
      if(e.stack)L("  STACK:\n"+e.stack);
   }finally{ try{if(v&&v.window)v.window.forceClose();}catch(e2){} }
}

try{
   L("=== DIAG 2 (HF metric + console capture) ===");
   // verify instances actually create
   var nxtInst=optCreateGenericProcessInstance(["NoiseXTerminator"], ["NXT","NoiseXTerminator"]);
   var bxtInst=optCreateGenericProcessInstance(["BlurXTerminator"], ["BXT","BlurXTerminator"]);
   L("instance NXT="+(nxtInst!=null)+"  BXT="+(bxtInst!=null));
   if(typeof NoiseXTerminator!=="undefined") L("typeof NoiseXTerminator = process class present");
   if(typeof BlurXTerminator!=="undefined") L("typeof BlurXTerminator = process class present");

   var R=op(m82("R","60.00s")),G=op(m82("G","60.00s")),Bb=op(m82("B","60.00s"));
   var rgb=optCabraCombineRGB(R.id,G.id,Bb.id,R.image.width,R.image.height,"d2_rgb");
   L("rgb ch="+rgb.image.numberOfChannels);

   tryTool("NXT", rgb, function(v){ return optExecuteNoiseXConfiguredOnView(v, {denoise:0.90, iterations:2, enable_color_separation:false,
         enable_frequency_separation:false, denoise_color:0.0, denoise_lf:0.0, denoise_lf_color:0.0, frequency_scale:5}); });
   tryTool("BXT", rgb, function(v){ return optExecuteBlurXConfiguredOnView(v, {automatic_psf:true, sharpen_stars:0.10, adjust_star_halos:0.0, sharpen_nonstellar:0.50, correct_only:false}); });
   // raw NXT, defaults only, to rule out our property-setting
   tryTool("NXT-raw", rgb, function(v){ var p=new NoiseXTerminator(); p.executeOn(v); return "raw-ok"; });

   try{rgb.window.forceClose();}catch(e){}
   try{[R,G,Bb].forEach(function(x){if(x&&x.window)x.window.forceClose();});}catch(e){}
   L(""); L("DONE");
}catch(e){L("FATAL: "+e.message+(e.stack?("\n"+e.stack):""));}
