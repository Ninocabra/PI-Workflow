#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"
#include <pjsr/UndoFlag.jsh>

// Validates the NB-ONLY branch: NB-dominant nebula (HOO) + stars colored via the
// SetiAstro NB->RGB transform (optNBtoRGBStars). No broadband RGB. Collinder34 NB.
var MDIR="E:/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/Collinder 34 COPIADO/WBPP/master/";
var OUT ="C:/Users/ninoc/Documents/PixInsight/CabraSpace/Pagina Web/Imagenes Prueba/NB_blend_samples/";
var LOG ="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/sample_nb_only.log";
var B=""; function L(s){B+=String(s)+"\n";try{File.writeTextFile(LOG,B);}catch(e){}}
function ch(f,e){return MDIR+"masterLight_BIN-1_6248x4176_EXPOSURE-"+e+"_FILTER-"+f+"_mono_autocrop.xisf";}
function openOne(p){var w=ImageWindow.open(p);return w[0];}
function scnrGreen(v){var s=new SCNR;try{s.amount=1;s.protectionMethod=SCNR.AverageNeutral;s.colorToRemove=SCNR.Green;s.preserveLightness=true;}catch(e){}s.executeOn(v);}
function starless(v){var x=optCreateGenericProcessInstance(["StarXTerminator"],["StarXTerminator","SXT"]);try{optTrySetProcessPropertySilently(x,["stars"],false);}catch(e){}x.executeOn(v);}
function clone(v,id){var P=new PixelMath;P.expression=v.id;P.useSingleExpression=true;P.createNewImage=true;P.newImageId=id;P.newImageColorSpace=PixelMath.SameAsTarget;P.newImageSampleFormat=PixelMath.SameAsTarget;P.showNewImage=false;P.executeOn(v);return ImageWindow.windowById(id).mainView;}
function monoStars(fullV,id){ // stars = full - starless(full)
   var sl=clone(fullV,id+"_sl"); starless(sl);
   var P=new PixelMath;P.expression="max(0,"+fullV.id+"-"+sl.id+")";P.useSingleExpression=true;P.createNewImage=true;P.newImageId=id;P.newImageColorSpace=PixelMath.Gray;P.newImageSampleFormat=PixelMath.SameAsTarget;P.showNewImage=false;P.executeOn(fullV);
   ImageWindow.windowById(id+"_sl").forceClose();
   return ImageWindow.windowById(id).mainView;
}
function pmRGB(t,id,eR,eG,eB){var P=new PixelMath;P.expression=eR;P.expression1=eG;P.expression2=eB;P.expression3="";P.useSingleExpression=false;P.generateOutput=true;P.createNewImage=true;P.truncate=true;P.truncateLower=0;P.truncateUpper=1;P.rescale=false;P.showNewImage=false;P.newImageId=id;P.newImageColorSpace=PixelMath.RGB;P.newImageSampleFormat=PixelMath.SameAsTarget;P.executeOn(t);return ImageWindow.windowById(id);}
function setBlackPoint(v,t){var im=v.image,w=im.width,h=im.height,n=w*h,rc=new Rect(0,0,w,h);for(var c=0;c<3;++c){var a=new Float32Array(n);im.getSamples(a,rc,c);var s=[],st=Math.max(1,(n/40000)|0);for(var i=0;i<n;i+=st)s.push(a[i]);s.sort(function(x,y){return x-y;});var bg=s[(s.length*0.05)|0]||0,sh=bg-t;v.beginProcess(UndoFlag_NoSwapFile);for(var j=0;j<n;++j){var val=a[j]-sh;a[j]=val<0?0:(val>1?1:val);}im.setSamples(a,rc,c);v.endProcess();}}
function png(win,name){try{var k=Math.ceil(Math.max(win.mainView.image.width,win.mainView.image.height)/1000);if(k>1){var P=new IntegerResample;P.zoomFactor=-k;P.downsamplingMode=0;P.executeOn(win.mainView);}win.saveAs(OUT+name+".png",false,false,false,false);}catch(e){}}

function run(){
   L("NB-only branch test (HOO + NB->RGB transform stars) — Collinder34");
   var hW=openOne(ch("H","300.00s")),oW=openOne(ch("O","300.00s")),sW=openOne(ch("S","300.00s"));
   // stretch each NB
   optCabraBackgroundAuto(hW.mainView);optRunAutoGhsStretch(hW.mainView,{aghs_intensity:0.85,aghs_bp:3.2});
   optCabraBackgroundAuto(oW.mainView);optRunAutoGhsStretch(oW.mainView,{aghs_intensity:0.85,aghs_bp:3.2});
   optCabraBackgroundAuto(sW.mainView);optRunAutoGhsStretch(sW.mainView,{aghs_intensity:0.85,aghs_bp:3.2});
   // NB star images (mono) BEFORE making the channels starless
   var sHa=monoStars(hW.mainView,"c34s_ha"),sO=monoStars(oW.mainView,"c34s_o"),sS=monoStars(sW.mainView,"c34s_s");
   // RGB-colored stars via SetiAstro transform
   var starsRGB=optNBtoRGBStars(sHa,sO,sS,{newImageId:"c34_nbstars"});
   L("    NB->RGB stars built");
   png(ImageWindow.windowById("c34_nbstars"),"Collinder34_NBonly_starsRGB");
   // nebula: make channels starless (emission), combine HOO
   starless(hW.mainView);starless(oW.mainView);starless(sW.mainView);
   var neb=pmRGB(hW.mainView,"c34_nbneb",hW.mainView.id,oW.mainView.id,oW.mainView.id);
   scnrGreen(neb.mainView);
   // composite stars (strong mask preserves star color)
   var ST=starsRGB.id, m="min(1,3*max("+ST+"[0],"+ST+"[1],"+ST+"[2]))";
   var fin=pmRGB(neb.mainView,"c34_nbfinal",
      neb.mainView.id+"[0]*(1-"+m+")+0.8*"+ST+"[0]",
      neb.mainView.id+"[1]*(1-"+m+")+0.8*"+ST+"[1]",
      neb.mainView.id+"[2]*(1-"+m+")+0.8*"+ST+"[2]");
   setBlackPoint(fin.mainView,0.10);
   fin.saveAs(OUT+"Collinder34_NBonly_HOO.xisf",false,false,false,false); L("    saved Collinder34_NBonly_HOO");
   png(fin,"Collinder34_NBonly_HOO");
   L("DONE");
}
try{run();}catch(e){L("ERROR: "+e.message+(e.stack?("\n"+e.stack):""));}
