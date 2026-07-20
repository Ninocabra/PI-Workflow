#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"
#include <pjsr/UndoFlag.jsh>

// v2 NB-blend samples on Collinder34, fixing v1 feedback: NB made STARLESS (no burned
// stars; RGB keeps natural stars), SCNR green removal, background pulled to ~0.10, OIII
// pushed to blue/cyan. Target = HOO bicolor (red Ha + cyan OIII, neutral bg).
var MDIR="E:/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/Collinder 34 COPIADO/WBPP/master/";
var OUT ="C:/Users/ninoc/Documents/PixInsight/CabraSpace/Pagina Web/Imagenes Prueba/NB_blend_samples/";
var LOG ="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/sample_nb_blend.log";
var B=""; function L(s){B+=String(s)+"\n";try{File.writeTextFile(LOG,B);}catch(e){}}
function ch(f,e){return MDIR+"masterLight_BIN-1_6248x4176_EXPOSURE-"+e+"_FILTER-"+f+"_mono_autocrop.xisf";}
function openOne(p){if(!File.exists(p))throw new Error("missing "+p);var w=ImageWindow.open(p);if(!w||!w.length)throw new Error("open "+p);return w[0];}
function save(win,n){win.saveAs(OUT+n+".xisf",false,false,false,false);L("    saved "+n);}
function combineRGB(r,g,b,w,h,id){var tw=new ImageWindow(w,h,3,32,true,true,id);var cc=new ChannelCombination;cc.colorSpace=0;cc.channels=[[true,r],[true,g],[true,b]];cc.executeOn(tw.mainView);return tw;}
function stretch(v){optCabraBackgroundAuto(v);optRunAutoGhsStretch(v,{aghs_intensity:0.7,aghs_bp:3.2});}
function scnrGreen(v){var s=new SCNR;try{s.amount=1;s.protectionMethod=SCNR.AverageNeutral;s.colorToRemove=SCNR.Green;s.preserveLightness=true;}catch(e){}s.executeOn(v);}
function starless(v){var sxt=null;try{sxt=optCreateGenericProcessInstance(["StarXTerminator"],["StarXTerminator","SXT"]);}catch(e){}if(!sxt){L("    (no SXT)");return;}try{optTrySetProcessPropertySilently(sxt,["stars"],false);}catch(e){}sxt.executeOn(v);}
// Pull each channel so its 5th-percentile background -> ~target (neutral dark bg).
function setBlackPoint(v,target){
   var im=v.image,w=im.width,h=im.height,n=w*h,rc=new Rect(0,0,w,h);
   for(var c=0;c<3;++c){var a=new Float32Array(n);im.getSamples(a,rc,c);
      var s=[],st=Math.max(1,(n/40000)|0);for(var i=0;i<n;i+=st)s.push(a[i]);s.sort(function(x,y){return x-y;});
      var bg=s[(s.length*0.05)|0]||0,sh=bg-target;
      v.beginProcess(UndoFlag_NoSwapFile);
      for(var j=0;j<n;++j){var val=a[j]-sh;a[j]=val<0?0:(val>1?1:val);}
      im.setSamples(a,rc,c);v.endProcess();}
}
function pmRGB(t,id,eR,eG,eB){var P=new PixelMath;P.expression=eR;P.expression1=eG;P.expression2=eB;P.expression3="";
   P.useSingleExpression=false;P.generateOutput=true;P.createNewImage=true;P.truncate=true;P.truncateLower=0;P.truncateUpper=1;P.rescale=false;
   P.showNewImage=false;P.newImageId=id;P.newImageColorSpace=PixelMath.RGB;P.newImageSampleFormat=PixelMath.SameAsTarget;P.executeOn(t);
   return ImageWindow.windowById(id);}
function finishAndSave(win,name){scnrGreen(win.mainView);setBlackPoint(win.mainView,0.10);save(win,name);
   // small PNG preview (PixelMath output has no WCS -> IntegerResample is dialog-free)
   try{var k=Math.ceil(Math.max(win.mainView.image.width,win.mainView.image.height)/1000);
      if(k>1){var P=new IntegerResample;P.zoomFactor=-k;P.downsamplingMode=0;P.executeOn(win.mainView);}
      win.saveAs(OUT+name+".png",false,false,false,false);}catch(e){L("    png warn "+name+": "+e.message);}}

function run(){
   try{if(!File.directoryExists(OUT))File.createDirectory(OUT,true);}catch(e){}
   L("NB blend samples v2 — Collinder34 (NB starless, SCNR, bg~0.10, OIII->cyan)");
   var rW=openOne(ch("R","180.00s")),gW=openOne(ch("G","180.00s")),bW=openOne(ch("B","180.00s"));
   var w=rW.mainView.image.width,h=rW.mainView.image.height;
   var rgb=combineRGB(rW.mainView.id,gW.mainView.id,bW.mainView.id,w,h,"col34_rgb");
   stretch(rgb.mainView); scnrGreen(rgb.mainView);      // RGB keeps its (natural) stars
   rW.forceClose();gW.forceClose();bW.forceClose();
   var SR=rgb.mainView.id;
   var hW=openOne(ch("H","300.00s")),oW=openOne(ch("O","300.00s")),sW=openOne(ch("S","300.00s"));
   stretch(hW.mainView);stretch(oW.mainView);stretch(sW.mainView);
   starless(hW.mainView);starless(oW.mainView);starless(sW.mainView);   // emission only
   var H=hW.mainView.id,O=oW.mainView.id,S=sW.mainView.id;
   L("  H->red, O->cyan (G+strong B), S->deep red; NB starless so RGB stars survive");

   // A) continuum-additive (emission excess over the RGB continuum)
   var a=pmRGB(rgb.mainView,"Col34_A",
      SR+"[0] + 0.7*max(0,"+H+"-"+SR+"[0]) + 0.3*max(0,"+S+"-"+SR+"[0])",
      SR+"[1] + 0.4*max(0,"+O+"-"+SR+"[1])",
      SR+"[2] + 0.7*max(0,"+O+"-"+SR+"[2])");
   if(a)finishAndSave(a,"Collinder34_blend_A_continuum");
   // B) screen
   var b=pmRGB(rgb.mainView,"Col34_B",
      "~(~"+SR+"[0]*~(0.7*"+H+")*~(0.3*"+S+"))",
      "~(~"+SR+"[1]*~(0.4*"+O+"))",
      "~(~"+SR+"[2]*~(0.7*"+O+"))");
   if(b)finishAndSave(b,"Collinder34_blend_B_screen");
   // C) weighted linear (NBRGBCombination-style)
   var c=pmRGB(rgb.mainView,"Col34_C",
      "0.5*"+SR+"[0] + 0.4*"+H+" + 0.1*"+S,
      "0.6*"+SR+"[1] + 0.4*"+O,
      "0.45*"+SR+"[2] + 0.55*"+O);
   if(c)finishAndSave(c,"Collinder34_blend_C_linear");

   try{hW.forceClose();oW.forceClose();sW.forceClose();rgb.forceClose();if(a)a.forceClose();if(b)b.forceClose();if(c)c.forceClose();}catch(e){}
   L("DONE -> "+OUT);
}
try{run();}catch(e){L("ERROR: "+e.message+(e.stack?("\n"+e.stack):""));}
