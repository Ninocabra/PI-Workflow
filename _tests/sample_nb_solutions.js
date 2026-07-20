#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"
#include <pjsr/UndoFlag.jsh>

// Generates 3 candidate FINAL compositions for Collinder34 (the "CabraMagic offers up
// to 3 solutions" model). NB-dominant base (matching the user's Final_5 reference) +
// reduced RGB stars re-added. Variants differ by palette: HOO, SHO, HOO+SII.
var MDIR="E:/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/Collinder 34 COPIADO/WBPP/master/";
var OUT ="C:/Users/ninoc/Documents/PixInsight/CabraSpace/Pagina Web/Imagenes Prueba/NB_blend_samples/";
var LOG ="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/sample_nb_solutions.log";
var B=""; function L(s){B+=String(s)+"\n";try{File.writeTextFile(LOG,B);}catch(e){}}
function ch(f,e){return MDIR+"masterLight_BIN-1_6248x4176_EXPOSURE-"+e+"_FILTER-"+f+"_mono_autocrop.xisf";}
function openOne(p){if(!File.exists(p))throw new Error("missing "+p);var w=ImageWindow.open(p);if(!w||!w.length)throw new Error("open "+p);return w[0];}
function combineRGB(r,g,b,w,h,id){var tw=new ImageWindow(w,h,3,32,true,true,id);var cc=new ChannelCombination;cc.colorSpace=0;cc.channels=[[true,r],[true,g],[true,b]];cc.executeOn(tw.mainView);return tw;}
function stretchStrong(v){optCabraBackgroundAuto(v);optRunAutoGhsStretch(v,{aghs_intensity:0.85,aghs_bp:3.2});}
function scnrGreen(v){var s=new SCNR;try{s.amount=1;s.protectionMethod=SCNR.AverageNeutral;s.colorToRemove=SCNR.Green;s.preserveLightness=true;}catch(e){}s.executeOn(v);}
function starless(v){var x=null;try{x=optCreateGenericProcessInstance(["StarXTerminator"],["StarXTerminator","SXT"]);}catch(e){}if(!x){L("    (no SXT)");return false;}try{optTrySetProcessPropertySilently(x,["stars"],false);}catch(e){}x.executeOn(v);return true;}
function setBlackPoint(v,t){var im=v.image,w=im.width,h=im.height,n=w*h,rc=new Rect(0,0,w,h);
   for(var c=0;c<3;++c){var a=new Float32Array(n);im.getSamples(a,rc,c);var s=[],st=Math.max(1,(n/40000)|0);
      for(var i=0;i<n;i+=st)s.push(a[i]);s.sort(function(x,y){return x-y;});var bg=s[(s.length*0.05)|0]||0,sh=bg-t;
      v.beginProcess(UndoFlag_NoSwapFile);for(var j=0;j<n;++j){var val=a[j]-sh;a[j]=val<0?0:(val>1?1:val);}im.setSamples(a,rc,c);v.endProcess();}}
function pmRGB(t,id,eR,eG,eB){var P=new PixelMath;P.expression=eR;P.expression1=eG;P.expression2=eB;P.expression3="";
   P.useSingleExpression=false;P.generateOutput=true;P.createNewImage=true;P.truncate=true;P.truncateLower=0;P.truncateUpper=1;P.rescale=false;
   P.showNewImage=false;P.newImageId=id;P.newImageColorSpace=PixelMath.RGB;P.newImageSampleFormat=PixelMath.SameAsTarget;P.executeOn(t);return ImageWindow.windowById(id);}
function pngOf(win,name){try{var k=Math.ceil(Math.max(win.mainView.image.width,win.mainView.image.height)/1000);
   if(k>1){var P=new IntegerResample;P.zoomFactor=-k;P.downsamplingMode=0;P.executeOn(win.mainView);}win.saveAs(OUT+name+".png",false,false,false,false);}catch(e){}}

var STARS=null;   // RGB stars layer id (reduced when screened)
function buildStars(w,h){
   var rW=openOne(ch("R","180.00s")),gW=openOne(ch("G","180.00s")),bW=openOne(ch("B","180.00s"));
   var full=combineRGB(rW.mainView.id,gW.mainView.id,bW.mainView.id,w,h,"c34_rgbfull");
   // Color-calibrate the LINEAR RGB so star colors are natural (raw R+G+B combine is
   // unbalanced): ABE gradient -> background neutralization -> auto linear fit, THEN stretch.
   try{ optCabraBackgroundAuto(full.mainView); }catch(e){}
   try{ optRunBackgroundNeutralization(full.mainView); }catch(e){L("    BN warn: "+e.message);}
   try{ optRunAutoLinearFitWorkflow(full.mainView); }catch(e){L("    LF warn: "+e.message);}
   optRunAutoGhsStretch(full.mainView,{aghs_intensity:0.85,aghs_bp:3.2}); scnrGreen(full.mainView);
   var sl=pmRGB(full.mainView,"c34_rgbsl",full.mainView.id+"[0]",full.mainView.id+"[1]",full.mainView.id+"[2]"); // clone
   starless(sl.mainView);
   var st=pmRGB(full.mainView,"c34_stars",
      "max(0,"+full.mainView.id+"[0]-"+sl.mainView.id+"[0])",
      "max(0,"+full.mainView.id+"[1]-"+sl.mainView.id+"[1])",
      "max(0,"+full.mainView.id+"[2]-"+sl.mainView.id+"[2])");
   rW.forceClose();gW.forceClose();bW.forceClose();full.forceClose();sl.forceClose();
   STARS=st.mainView.id; L("    RGB stars layer ready"); return st;
}
function addStarsAndFinish(nebWin,name){
   scnrGreen(nebWin.mainView);
   // Mask composite (NOT screen): at a star pixel the RGB star color REPLACES the nebula
   // (so the star keeps its true RGB hue, not tinted by the underlying nebula color).
   // m = star coverage = max channel of the star layer; k = reduced star brightness.
   var N=nebWin.mainView.id, k=0.75, m="min(1,3*max("+STARS+"[0],"+STARS+"[1],"+STARS+"[2]))";
   var fin=pmRGB(nebWin.mainView,name+"_tmpfin",
      N+"[0]*(1-"+m+") + "+k+"*"+STARS+"[0]",
      N+"[1]*(1-"+m+") + "+k+"*"+STARS+"[1]",
      N+"[2]*(1-"+m+") + "+k+"*"+STARS+"[2]");
   setBlackPoint(fin.mainView,0.10);
   fin.saveAs(OUT+name+".xisf",false,false,false,false); L("    saved "+name);
   pngOf(fin,name); fin.forceClose();
}

function run(){
   try{if(!File.directoryExists(OUT))File.createDirectory(OUT,true);}catch(e){}
   L("3 candidate finals — Collinder34 (NB-dominant + reduced RGB stars)");
   var hW=openOne(ch("H","300.00s")),oW=openOne(ch("O","300.00s")),sW=openOne(ch("S","300.00s"));
   var w=hW.mainView.image.width,h=hW.mainView.image.height;
   stretchStrong(hW.mainView);stretchStrong(oW.mainView);stretchStrong(sW.mainView);
   starless(hW.mainView);starless(oW.mainView);starless(sW.mainView);
   var H=hW.mainView.id,O=oW.mainView.id,S=sW.mainView.id;
   buildStars(w,h);
   // 1) HOO: R=Ha, G=OIII, B=OIII
   var hoo=pmRGB(hW.mainView,"c34_hoo",H,O,O); addStarsAndFinish(hoo,"Collinder34_SOL1_HOO"); hoo.forceClose();
   // 2) SHO: R=SII, G=Ha, B=OIII (SCNR turns the green Ha to gold)
   var sho=pmRGB(hW.mainView,"c34_sho",S,H,O); addStarsAndFinish(sho,"Collinder34_SOL2_SHO"); sho.forceClose();
   try{var st=ImageWindow.windowById(STARS);if(st){pngOf(st,"Collinder34_RGBstars_layer");st.forceClose();}}catch(e){}
   try{hW.forceClose();oW.forceClose();sW.forceClose();}catch(e){}
   L("DONE -> "+OUT);
}
try{run();}catch(e){L("ERROR: "+e.message+(e.stack?("\n"+e.stack):""));}
