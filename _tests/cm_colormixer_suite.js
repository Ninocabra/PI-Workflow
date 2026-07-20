#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"
#include <pjsr/UndoFlag.jsh>

// Quantitative test suite for the REAL Color Mixer engine (loaded via NO_MAIN).
// Builds controlled synthetic images and asserts which pixels changed / how.
var DIR = "C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/";
var LOG = DIR + "cm_suite.log";
var BUF = ""; var PASS = 0, FAIL = 0;
function L(s){ BUF += String(s)+"\n"; try { File.writeTextFile(LOG, BUF); } catch(e){} }
function check(name, cond, detail){ if(cond){PASS++;L("PASS  "+name+(detail?("  ["+detail+"]"):""));}else{FAIL++;L("FAIL  "+name+(detail?("  ["+detail+"]"):""));} }

function hsl2rgb(h,s,l){var c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2,r,g,b;
   if(h<60){r=c;g=x;b=0;}else if(h<120){r=x;g=c;b=0;}else if(h<180){r=0;g=c;b=x;}else if(h<240){r=0;g=x;b=c;}else if(h<300){r=x;g=0;b=c;}else{r=c;g=0;b=x;}return[r+m,g+m,b+m];}
function hueOf(r,g,b){var mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn,h=0;if(d>1e-7){if(mx===r)h=((g-b)/d)%6;else if(mx===g)h=(b-r)/d+2;else h=(r-g)/d+4;h*=60;if(h<0)h+=360;}return h;}
function lumOf(r,g,b){return 0.2126*r+0.7152*g+0.0722*b;}

function makeView(id,w,h,fill){var win=new ImageWindow(w,h,3,32,true,true,id);var v=win.mainView,img=v.image,rect=new Rect(0,0,w,h);
   var R=new Float32Array(w*h),G=new Float32Array(w*h),B=new Float32Array(w*h);
   for(var y=0;y<h;++y)for(var x=0;x<w;++x){var rgb=fill(x,y);var i=y*w+x;R[i]=rgb[0];G[i]=rgb[1];B[i]=rgb[2];}
   v.beginProcess(UndoFlag_NoSwapFile);img.setSamples(R,rect,0);img.setSamples(G,rect,1);img.setSamples(B,rect,2);v.endProcess();return v;}
function colSamples(v,x){var img=v.image,h=img.height;var r=img.sample(x,Math.floor(h/2),0),g=img.sample(x,Math.floor(h/2),1),b=img.sample(x,Math.floor(h/2),2);return[r,g,b];}
function colDelta(va,vb,x){var a=colSamples(va,x),b=colSamples(vb,x);return Math.max(Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1]),Math.abs(a[2]-b[2]));}
function clone(v,id){return optCloneView(v,id,false);}

function run(){
   L("engine: run="+(typeof optRunColorMixerOnView)+" mask="+(typeof optBuildColorMixerMaskView)+" def="+(typeof optColorMixerDefaultState));
   // ---- Image A: hue sweep (column x = hue x deg, S=0.6, L=0.45) ----
   var W=360,H=8;
   var sweep=makeView("sweep",W,H,function(x,y){return hsl2rgb(x%360,0.6,0.45);});
   var centers=[0,30,60,120,180,240,275,315];

   // T1: each band, sat +50 only that band -> center changes, far columns don't.
   for(var bi=0;bi<8;++bi){
      var c=centers[bi];
      var st=optColorMixerDefaultState(); st.bands[bi].saturation=50;
      var t=clone(sweep,"t1_"+bi); optRunColorMixerOnView(t,st);
      var dC=colDelta(sweep,t,c);
      var farA=(c+90)%360, farB=(c+270)%360;
      var dFarA=colDelta(sweep,t,farA), dFarB=colDelta(sweep,t,farB);
      check("T1 band "+bi+" center changed", dC>0.02, "dC="+dC.toFixed(4));
      check("T1 band "+bi+" far cols unchanged", dFarA<0.003 && dFarB<0.003, "dFar="+dFarA.toFixed(4)+"/"+dFarB.toFixed(4));
      try{t.window.forceClose();}catch(e){}
   }

   // T2: hue shift +30 on red band -> hue at col 0 rotates noticeably.
   var stH=optColorMixerDefaultState(); stH.bands[0].hueShift=30;
   var tH=clone(sweep,"t2"); optRunColorMixerOnView(tH,stH);
   var hAfter=hueOf.apply(null,colSamples(tH,0)); var hBefore=hueOf.apply(null,colSamples(sweep,0));
   var dHue=((hAfter-hBefore+540)%360)-180;
   check("T2 hue shift moved hue", Math.abs(dHue)>8, "before="+hBefore.toFixed(1)+" after="+hAfter.toFixed(1)+" d="+dHue.toFixed(1));
   try{tH.window.forceClose();}catch(e){}

   // T3: luminance +60 on green band -> col 120 brighter, col 0 unchanged.
   var stL=optColorMixerDefaultState(); stL.bands[3].luminance=60;
   var tL=clone(sweep,"t3"); optRunColorMixerOnView(tL,stL);
   var lG_b=lumOf.apply(null,colSamples(sweep,120)), lG_a=lumOf.apply(null,colSamples(tL,120));
   check("T3 luminance raised in-band", lG_a-lG_b>0.02, "Lbefore="+lG_b.toFixed(3)+" after="+lG_a.toFixed(3));
   check("T3 luminance unchanged out-of-band", colDelta(sweep,tL,0)<0.003, "dRed="+colDelta(sweep,tL,0).toFixed(4));
   try{tL.window.forceClose();}catch(e){}

   // T4: globalStrength 0.5 ~ half of full effect (red sat +50 at center).
   var stF=optColorMixerDefaultState(); stF.bands[0].saturation=50;
   var tF=clone(sweep,"t4f"); optRunColorMixerOnView(tF,stF); var dFull=colDelta(sweep,tF,0);
   var stHf=optColorMixerDefaultState(); stHf.bands[0].saturation=50; stHf.globalStrength=0.5;
   var tHf=clone(sweep,"t4h"); optRunColorMixerOnView(tHf,stHf); var dHalf=colDelta(sweep,tHf,0);
   check("T4 globalStrength scales effect", dHalf>0.005 && dHalf<dFull*0.75, "full="+dFull.toFixed(4)+" half="+dHalf.toFixed(4));
   try{tF.window.forceClose();}catch(e){}try{tHf.window.forceClose();}catch(e){}

   // T5: empty state -> no change.
   var tE=clone(sweep,"t5"); optRunColorMixerOnView(tE,optColorMixerDefaultState());
   check("T5 empty state = no change", colDelta(sweep,tE,0)<1e-4 && colDelta(sweep,tE,180)<1e-4, "d0="+colDelta(sweep,tE,0).toFixed(6));
   try{tE.window.forceClose();}catch(e){}

   // ---- Image B: red (hue 0) lightness ramp, S=0.6, L from 0.02..0.98 ----
   var W2=256;
   function Lat(x){return 0.02+0.96*x/(W2-1);}
   var ramp=makeView("ramp",W2,H,function(x,y){return hsl2rgb(0,0.6,Lat(x));});
   function colForL(targetL){return Math.round((targetL-0.02)/0.96*(W2-1));}

   // T6: Range Mask [0.3,0.6] + red sat +50 -> only mid-L columns change.
   var stR=optColorMixerDefaultState(); stR.bands[0].saturation=50; stR.rangeMask={enabled:true,low:0.3,high:0.6,feather:0.04};
   var tR=clone(ramp,"t6"); optRunColorMixerOnView(tR,stR);
   var dMid=colDelta(ramp,tR,colForL(0.45)), dLow=colDelta(ramp,tR,colForL(0.12)), dHigh=colDelta(ramp,tR,colForL(0.80));
   check("T6 range mask: mid-L changed", dMid>0.02, "dMid="+dMid.toFixed(4));
   check("T6 range mask: low-L excluded", dLow<0.004, "dLow="+dLow.toFixed(4));
   check("T6 range mask: high-L excluded", dHigh<0.004, "dHigh="+dHigh.toFixed(4));
   try{tR.window.forceClose();}catch(e){}

   // T7: highlight protection (protectStars) -> very bright col barely changes vs mid.
   var stP=optColorMixerDefaultState(); stP.bands[0].saturation=50; // protectStars default true, highlightStart 0.92
   var tP=clone(ramp,"t7"); optRunColorMixerOnView(tP,stP);
   var dBright=colDelta(ramp,tP,colForL(0.96)), dMid2=colDelta(ramp,tP,colForL(0.5));
   check("T7 highlight protection suppresses bright", dBright<dMid2*0.5, "dBright="+dBright.toFixed(4)+" dMid="+dMid2.toFixed(4));
   try{tP.window.forceClose();}catch(e){}

   // T8: protectLowSat -> low-sat pixel suppressed vs high-sat.
   var lowSat=makeView("lowsat",16,H,function(x,y){return hsl2rgb(0,0.05,0.45);});   // S=0.05 (below satFull 0.16)
   var hiSat =makeView("hisat", 16,H,function(x,y){return hsl2rgb(0,0.60,0.45);});
   var stS=optColorMixerDefaultState(); stS.bands[0].saturation=50; // protectLowSat default true
   var tLS=clone(lowSat,"t8l"); optRunColorMixerOnView(tLS,stS); var dLS=colDelta(lowSat,tLS,8);
   var tHS=clone(hiSat,"t8h");  optRunColorMixerOnView(tHS,stS); var dHS=colDelta(hiSat,tHS,8);
   check("T8 protectLowSat suppresses low-sat", dLS<dHS*0.4, "dLowSat="+dLS.toFixed(4)+" dHiSat="+dHS.toFixed(4));
   // protectLowSat OFF -> low-sat now changes more
   var stS2=optColorMixerDefaultState(); stS2.bands[0].saturation=50; stS2.protectLowSat=false;
   var tLS2=clone(lowSat,"t8l2"); optRunColorMixerOnView(tLS2,stS2); var dLS2=colDelta(lowSat,tLS2,8);
   check("T8 protectLowSat OFF lets low-sat through", dLS2>dLS, "off="+dLS2.toFixed(4)+" on="+dLS.toFixed(4));
   try{lowSat.window.forceClose();}catch(e){}try{hiSat.window.forceClose();}catch(e){}try{tLS.window.forceClose();}catch(e){}try{tHS.window.forceClose();}catch(e){}try{tLS2.window.forceClose();}catch(e){}

   // T9: mask blur spreads the selection (blurred mask reaches farther columns than sharp).
   var sb=optColorMixerDefaultState();
   var mkSharp=optBuildColorMixerMaskView(sweep,sb,0);
   var sb2=optColorMixerDefaultState(); sb2.bands[0].maskBlur=3;
   var mkBlur=optBuildColorMixerMaskView(sweep,sb2,0);
   // sample mask value at a column just outside the sharp edge (e.g. col 50, >45 from center 0)
   var mSharp50=mkSharp.image.sample(50,4,0), mBlur50=mkBlur.image.sample(50,4,0);
   check("T9 blur spreads mask beyond sharp edge", mBlur50>mSharp50+0.001, "sharp@50="+mSharp50.toFixed(4)+" blur@50="+mBlur50.toFixed(4));
   try{mkSharp.window.forceClose();}catch(e){}try{mkBlur.window.forceClose();}catch(e){}

   try{sweep.window.forceClose();}catch(e){}try{ramp.window.forceClose();}catch(e){}
   L("");
   L("SUMMARY  PASS="+PASS+"  FAIL="+FAIL);
}
try{run();}catch(e){L("ERROR: "+e.message+(e.stack?("\n"+e.stack):""));}
