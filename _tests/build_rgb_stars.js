#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"
#include <pjsr/UndoFlag.jsh>

// Isolates the RGB star layer for Collinder34 and measures its star color, to settle
// whether RGB-extracted stars are neutral or need stronger calibration (e.g. SPCC).
var MDIR="E:/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/Collinder 34 COPIADO/WBPP/master/";
var OUT ="C:/Users/ninoc/Documents/PixInsight/CabraSpace/Pagina Web/Imagenes Prueba/NB_blend_samples/";
var LOG ="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/build_rgb_stars.log";
var B=""; function L(s){B+=String(s)+"\n";try{File.writeTextFile(LOG,B);}catch(e){}}
function ch(f,e){return MDIR+"masterLight_BIN-1_6248x4176_EXPOSURE-"+e+"_FILTER-"+f+"_mono_autocrop.xisf";}
function openOne(p){var w=ImageWindow.open(p);return w[0];}
function combineRGB(r,g,b,w,h,id){var tw=new ImageWindow(w,h,3,32,true,true,id);var cc=new ChannelCombination;cc.colorSpace=0;cc.channels=[[true,r],[true,g],[true,b]];cc.executeOn(tw.mainView);return tw;}
function scnrGreen(v){var s=new SCNR;try{s.amount=1;s.protectionMethod=SCNR.AverageNeutral;s.colorToRemove=SCNR.Green;s.preserveLightness=true;}catch(e){}s.executeOn(v);}
function starless(v){var x=optCreateGenericProcessInstance(["StarXTerminator"],["StarXTerminator","SXT"]);try{optTrySetProcessPropertySilently(x,["stars"],false);}catch(e){}x.executeOn(v);}
function pmRGB(t,id,eR,eG,eB){var P=new PixelMath;P.expression=eR;P.expression1=eG;P.expression2=eB;P.expression3="";
   P.useSingleExpression=false;P.generateOutput=true;P.createNewImage=true;P.truncate=true;P.truncateLower=0;P.truncateUpper=1;P.rescale=false;
   P.showNewImage=false;P.newImageId=id;P.newImageColorSpace=PixelMath.RGB;P.newImageSampleFormat=PixelMath.SameAsTarget;P.executeOn(t);return ImageWindow.windowById(id);}
function measureStars(v,tag){
   var im=v.image,W=im.width,H=im.height,n=W*H,rc=new Rect(0,0,W,H);
   var R=new Float32Array(n),G=new Float32Array(n),Bb=new Float32Array(n);
   im.getSamples(R,rc,0);im.getSamples(G,rc,1);im.getSamples(Bb,rc,2);
   // star layer is on black bg: bright pixels are stars. weight by brightness.
   var sr=0,sg=0,sb=0,wsum=0,cnt=0;
   for(var i=0;i<n;i++){var lum=0.2126*R[i]+0.7152*G[i]+0.0722*Bb[i];
      if(lum>0.15){var wt=lum;sr+=R[i]*wt;sg+=G[i]*wt;sb+=Bb[i]*wt;wsum+=wt;cnt++;}}
   if(wsum<=0){L(tag+": no stars");return;}
   var mr=sr/wsum,mg=sg/wsum,mb=sb/wsum,mx=Math.max(mr,mg,mb);
   L(tag+": starPix="+cnt+" meanRGB=("+mr.toFixed(3)+","+mg.toFixed(3)+","+mb.toFixed(3)+
     ") hue/max=("+(mr/mx).toFixed(2)+","+(mg/mx).toFixed(2)+","+(mb/mx).toFixed(2)+")");
}
function buildStars(useSPCC){
   var rW=openOne(ch("R","180.00s")),gW=openOne(ch("G","180.00s")),bW=openOne(ch("B","180.00s"));
   var w=rW.mainView.image.width,h=rW.mainView.image.height;
   var full=combineRGB(rW.mainView.id,gW.mainView.id,bW.mainView.id,w,h,"st_full"+(useSPCC?"S":""));
   optCabraBackgroundAuto(full.mainView);
   try{optRunBackgroundNeutralization(full.mainView);}catch(e){L("BN warn "+e.message);}
   try{optRunAutoLinearFitWorkflow(full.mainView);}catch(e){L("LF warn "+e.message);}
   optRunAutoGhsStretch(full.mainView,{aghs_intensity:0.85,aghs_bp:3.2}); scnrGreen(full.mainView);
   var sl=pmRGB(full.mainView,"st_sl"+(useSPCC?"S":""),full.mainView.id+"[0]",full.mainView.id+"[1]",full.mainView.id+"[2]");
   starless(sl.mainView);
   var st=pmRGB(full.mainView,"st_layer"+(useSPCC?"S":""),
      "max(0,"+full.mainView.id+"[0]-"+sl.mainView.id+"[0])","max(0,"+full.mainView.id+"[1]-"+sl.mainView.id+"[1])","max(0,"+full.mainView.id+"[2]-"+sl.mainView.id+"[2])");
   measureStars(st.mainView,"RGB stars (BN+LinearFit)");
   try{st.saveAs(OUT+"Collinder34_RGBstars_layer.xisf",false,false,false,false);}catch(e){}
   rW.forceClose();gW.forceClose();bW.forceClose();full.forceClose();sl.forceClose();st.forceClose();
}
try{ buildStars(false); L("DONE"); }catch(e){L("ERROR: "+e.message+(e.stack?("\n"+e.stack):""));}
