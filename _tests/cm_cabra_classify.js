#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"
#include <pjsr/UndoFlag.jsh>

// Validates the REAL CabraMagic analyzer/classifier on synthetic objects of known
// type + the user's real image. Lets me calibrate the classifier thresholds.
var DIR = "C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/";
var SRC = "C:/Users/ninoc/Downloads/RGB_LDu_2.xisf";
var LOG = DIR + "cm_cabra_classify.log";
var BUF = "", PASS = 0, FAIL = 0;
function L(s){ BUF += String(s)+"\n"; try { File.writeTextFile(LOG, BUF); } catch(e){} }
function check(n,c,d){ if(c){PASS++;L("PASS  "+n+(d?("  ["+d+"]"):""));}else{FAIL++;L("FAIL  "+n+(d?("  ["+d+"]"):""));} }

function rnd(){ return Math.random(); }
function mkView(id,fill){var w=256,h=256;var win=new ImageWindow(w,h,3,32,true,true,id);var v=win.mainView,img=v.image,rect=new Rect(0,0,w,h);
   var R=new Float32Array(w*h),G=new Float32Array(w*h),B=new Float32Array(w*h);fill(R,G,B,w,h);
   v.beginProcess(UndoFlag_NoSwapFile);img.setSamples(R,rect,0);img.setSamples(G,rect,1);img.setSamples(B,rect,2);v.endProcess();return v;}
function addStar(R,G,B,w,h,x,y,bright){ if(x<0||y<0||x>=w||y>=h)return; var i=y*w+x; R[i]=bright;G[i]=bright;B[i]=bright;
   // tiny halo
   var nb=[[1,0],[-1,0],[0,1],[0,-1]];for(var k=0;k<4;k++){var xx=x+nb[k][0],yy=y+nb[k][1];if(xx<0||yy<0||xx>=w||yy>=h)continue;var j=yy*w+xx;var hv=bright*0.5;if(R[j]<hv){R[j]=hv;G[j]=hv;B[j]=hv;}}}

function fillBase(R,G,B,w,h){for(var i=0;i<w*h;++i){var n=0.04+0.01*rnd();R[i]=n;G[i]=n;B[i]=n;}}

function run(){
   L("engine: analyze="+(typeof optCabraAnalyze)+" classify="+(typeof optCabraClassify));

   // STARFIELD: ~120 uniform sparse stars, no extended.
   var sf=mkView("sf",function(R,G,B,w,h){fillBase(R,G,B,w,h);for(var s=0;s<120;++s)addStar(R,G,B,w,h,(rnd()*w)|0,(rnd()*h)|0,0.7+0.3*rnd());});
   var aSF=optCabraAnalyze(sf),cSF=optCabraClassify(aSF);
   L("STARFIELD stats: ext="+aSF.extendedFraction.toFixed(4)+" C="+aSF.concentrationIndex.toFixed(2)+" starDens="+aSF.starDensity.toFixed(0)+" -> "+cSF.className);
   check("starfield -> starfield", cSF.className==="starfield");

   // GLOBULAR: ~700 stars concentrated centrally (gaussian), minimal extended.
   var gc=mkView("gc",function(R,G,B,w,h){fillBase(R,G,B,w,h);var cx=w/2,cy=h/2;for(var s=0;s<700;++s){var a=rnd()*6.283,r=Math.abs(randn())*w*0.12;var x=(cx+Math.cos(a)*r)|0,y=(cy+Math.sin(a)*r)|0;addStar(R,G,B,w,h,x,y,0.6+0.4*rnd());}});
   var aGC=optCabraAnalyze(gc),cGC=optCabraClassify(aGC);
   L("GLOBULAR stats: ext="+aGC.extendedFraction.toFixed(4)+" C="+aGC.concentrationIndex.toFixed(2)+" starDens="+aGC.starDensity.toFixed(0)+" -> "+cGC.className);
   check("globular -> starfield", cGC.className==="starfield");

   // GALAXY: concentrated central extended blob + moderate stars.
   var gx=mkView("gx",function(R,G,B,w,h){fillBase(R,G,B,w,h);var cx=w/2,cy=h/2,sc=w*0.07;
      for(var y=0;y<h;++y)for(var x=0;x<w;++x){var dx=(x-cx)/sc,dy=(y-cy)/(sc*0.6);var v=0.5*Math.exp(-(dx*dx+dy*dy)*0.5);var i=y*w+x;R[i]+=v*1.1;G[i]+=v;B[i]+=v*0.9;if(R[i]>1)R[i]=1;if(G[i]>1)G[i]=1;if(B[i]>1)B[i]=1;}
      for(var s=0;s<40;++s)addStar(R,G,B,w,h,(rnd()*w)|0,(rnd()*h)|0,0.7+0.3*rnd());});
   var aGX=optCabraAnalyze(gx),cGX=optCabraClassify(aGX);
   L("GALAXY stats: ext="+aGX.extendedFraction.toFixed(4)+" C="+aGX.concentrationIndex.toFixed(2)+" starDens="+aGX.starDensity.toFixed(0)+" -> "+cGX.className);
   check("galaxy -> galaxy", cGX.className==="galaxy");

   // NEBULA: large diffuse structure (several broad blobs spread out) + stars, reddish.
   var nb=mkView("nb",function(R,G,B,w,h){fillBase(R,G,B,w,h);
      var blobs=[[0.3,0.35,0.30],[0.7,0.55,0.28],[0.45,0.75,0.25],[0.6,0.25,0.22]];
      for(var y=0;y<h;++y)for(var x=0;x<w;++x){var i=y*w+x;var acc=0;
         for(var k=0;k<blobs.length;++k){var bx=blobs[k][0]*w,by=blobs[k][1]*h,sc=w*0.22;var dx=(x-bx)/sc,dy=(y-by)/sc;acc+=blobs[k][2]*Math.exp(-(dx*dx+dy*dy)*0.5);}
         R[i]+=acc*1.3;G[i]+=acc*0.7;B[i]+=acc*0.8;if(R[i]>1)R[i]=1;if(G[i]>1)G[i]=1;if(B[i]>1)B[i]=1;}
      for(var s=0;s<40;++s)addStar(R,G,B,w,h,(rnd()*w)|0,(rnd()*h)|0,0.7+0.3*rnd());});
   var aNB=optCabraAnalyze(nb),cNB=optCabraClassify(aNB);
   L("NEBULA stats: ext="+aNB.extendedFraction.toFixed(4)+" C="+aNB.concentrationIndex.toFixed(2)+" starDens="+aNB.starDensity.toFixed(0)+" nb="+aNB.narrowbandLikely+" -> "+cNB.className);
   check("nebula -> nebula", cNB.className==="nebula");

   try{sf.window.forceClose();gc.window.forceClose();gx.window.forceClose();nb.window.forceClose();}catch(e){}

   // REAL image (report only — ground truth unknown; RGB_LDu looked like a sparse field).
   try{
      var wins=ImageWindow.open(SRC);
      if(wins&&wins.length>0){var v=wins[0].mainView;var a=optCabraAnalyze(v),c=optCabraClassify(a);
         L("REAL RGB_LDu_2: "+v.image.width+"x"+v.image.height+" median="+a.median.toFixed(5)+" ext="+a.extendedFraction.toFixed(4)+" C="+a.concentrationIndex.toFixed(2)+" starDens="+a.starDensity.toFixed(0)+" nb="+a.narrowbandLikely+" -> "+c.className+" ("+c.reasons.join("; ")+")");
         try{wins[0].forceClose();}catch(e){}}
   }catch(eR){L("REAL image error: "+eR.message);}

   L("");L("SUMMARY  PASS="+PASS+"  FAIL="+FAIL);
}
// Box-Muller normal
function randn(){var u=1-Math.random(),v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(6.283185*v);}
try{run();}catch(e){L("ERROR: "+e.message+(e.stack?("\n"+e.stack):""));}
