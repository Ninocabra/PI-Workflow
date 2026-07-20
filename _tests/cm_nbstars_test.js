#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"
#include <pjsr/UndoFlag.jsh>

// Validates optApplyNbStarsRGB end-to-end with a mock dialog/store (H + O present, no
// _Stars -> on-the-fly extraction path). Confirms it produces an effect, not a silent no-op.
var MD="E:/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/Collinder 34 COPIADO/WBPP/master/";
var IP="C:/Users/ninoc/Documents/PixInsight/CabraSpace/Pagina Web/Imagenes Prueba/";
var OUT="C:/Users/ninoc/Documents/PixInsight/CabraSpace/Pagina Web/Imagenes Prueba/NB_blend_samples/";
var LOG="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/cm_nbstars_test.log";
var B=""; function L(s){B+=String(s)+"\n";try{File.writeTextFile(LOG,B);}catch(e){}}
function op(p){if(!File.exists(p))return null;var w=ImageWindow.open(p);return w&&w.length?w[0].mainView:null;}
function chroma(v){var im=v.image,n=im.width*im.height,rc=new Rect(0,0,im.width,im.height);var R=new Float32Array(n),G=new Float32Array(n),Bb=new Float32Array(n);im.getSamples(R,rc,0);im.getSamples(G,rc,1);im.getSamples(Bb,rc,2);var s=0,c=0,st=Math.max(1,(n/80000)|0);for(var i=0;i<n;i+=st){var mx=Math.max(R[i],G[i],Bb[i]);if(mx>0.05){s+=(mx-Math.min(R[i],G[i],Bb[i]))/mx;c++;}}return c?s/c:0;}
try{
   var H=op(MD+"masterLight_BIN-1_6248x4176_EXPOSURE-300.00s_FILTER-H_mono_autocrop.xisf");
   var O=op(MD+"masterLight_BIN-1_6248x4176_EXPOSURE-300.00s_FILTER-O_mono_autocrop.xisf");
   var S=op(MD+"masterLight_BIN-1_6248x4176_EXPOSURE-300.00s_FILTER-S_mono_autocrop.xisf");
   var target=op(IP+"Collinder34_RGB.xisf");   // RGB "stars" target proxy
   L("inputs: H="+!!H+" O="+!!O+" S="+!!S+" target="+!!target);
   var map={H:H,O:O,S:S}; map.H_Stars=null;map.O_Stars=null;map.S_Stars=null;
   var mockDlg={ store:{ record:function(k){ return { view: (map.hasOwnProperty(k)?map[k]:null) }; } } };
   L("chroma BEFORE = "+chroma(target).toFixed(3));
   var ok=optApplyNbStarsRGB(target, mockDlg);
   L("optApplyNbStarsRGB returned: "+ok);
   L("chroma AFTER = "+chroma(target).toFixed(3));
   var k=Math.ceil(Math.max(target.image.width,target.image.height)/1000);if(k>1){var P=new IntegerResample;P.zoomFactor=-k;P.downsamplingMode=0;P.executeOn(target);}
   target.window.saveAs(OUT+"NBstars_test_result.png",false,false,false,false);
   L("DONE");
}catch(e){L("ERR: "+e.message+(e.stack?("\n"+e.stack):""));}
