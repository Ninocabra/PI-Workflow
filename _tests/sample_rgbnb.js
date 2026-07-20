#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"
#include <pjsr/UndoFlag.jsh>

// Tests the rgb_nb (stars_only) branch on Collinder34 and measures the RGB star color.
var MDIR="E:/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/Collinder 34 COPIADO/WBPP/master/";
var OUT ="C:/Users/ninoc/Documents/PixInsight/CabraSpace/Pagina Web/Imagenes Prueba/NB_blend_samples/";
var LOG ="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/sample_rgbnb.log";
var B=""; function L(s){B+=String(s)+"\n";try{File.writeTextFile(LOG,B);}catch(e){}}
function ch(f,e){return MDIR+"masterLight_BIN-1_6248x4176_EXPOSURE-"+e+"_FILTER-"+f+"_mono_autocrop.xisf";}
function op(p){var w=ImageWindow.open(p);return w[0];}
function png(win,name){try{var k=Math.ceil(Math.max(win.mainView.image.width,win.mainView.image.height)/1000);if(k>1){var P=new IntegerResample;P.zoomFactor=-k;P.downsamplingMode=0;P.executeOn(win.mainView);}win.saveAs(OUT+name+".png",false,false,false,false);}catch(e){}}
function measureStars(v,tag){ // star layer on black: bright pixels are stars
   var im=v.image,W=im.width,H=im.height,n=W*H,rc=new Rect(0,0,W,H);
   var R=new Float32Array(n),G=new Float32Array(n),Bb=new Float32Array(n);
   im.getSamples(R,rc,0);im.getSamples(G,rc,1);im.getSamples(Bb,rc,2);
   var sr=0,sg=0,sb=0,wsum=0,cnt=0,mxv=0;
   for(var i=0;i<n;i++){var lum=0.2126*R[i]+0.7152*G[i]+0.0722*Bb[i];if(lum>mxv)mxv=lum;if(lum>0.03){sr+=R[i]*lum;sg+=G[i]*lum;sb+=Bb[i]*lum;wsum+=lum;cnt++;}}
   L(tag+": maxLum="+mxv.toFixed(3)+" pix>0.03="+cnt);
   if(wsum<=0){L(tag+": no stars");return;}
   var mr=sr/wsum,mg=sg/wsum,mb=sb/wsum,mx=Math.max(mr,mg,mb);
   L(tag+": starPix="+cnt+" hue/max=("+(mr/mx).toFixed(2)+","+(mg/mx).toFixed(2)+","+(mb/mx).toFixed(2)+")  [1,1,1]=neutral");
}
function run(){
   L("rgb_nb branch test — Collinder34 HOO + calibrated RGB stars");
   // measure RGB stars in isolation first
   var rW=op(ch("R","180.00s")),gW=op(ch("G","180.00s")),bW=op(ch("B","180.00s"));
   var stars=optCabraRGBStars(rW.mainView,gW.mainView,bW.mainView,{tag:"c34meas"});
   measureStars(stars,"RGB stars (star-WB)");
   png(stars.window,"Collinder34_rgbnb_starsRGB"); stars.window.forceClose();
   rW.forceClose();gW.forceClose();bW.forceClose();
   // full branch composition
   var R2=op(ch("R","180.00s")),G2=op(ch("G","180.00s")),B2=op(ch("B","180.00s"));
   var H=op(ch("H","300.00s")),O=op(ch("O","300.00s")),S=op(ch("S","300.00s"));
   var fin=optCabraComposeRGBNB(H.mainView,O.mainView,S.mainView,R2.mainView,G2.mainView,B2.mainView,"HOO",{tag:"c34rgbnb"});
   fin.window.saveAs(OUT+"Collinder34_rgbnb_HOO.xisf",false,false,false,false); L("saved Collinder34_rgbnb_HOO");
   png(fin.window,"Collinder34_rgbnb_HOO");
   try{[R2,G2,B2,H,O,S].forEach(function(x){if(x)x.forceClose();});fin.window.forceClose();}catch(e){}
   L("DONE");
}
try{run();}catch(e){L("ERROR: "+e.message+(e.stack?("\n"+e.stack):""));}
