#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"

// PI Workflow 2.0 — PERF BASELINE (F2). Times the hot engine ops on a large synthetic
// image so optimisation is data-driven. Deterministic content; reports ms per op.
var LOG = "C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_200/_tests/perf_suite.log";
var B = "";
function L(s){ B += String(s) + "\n"; try { File.writeTextFile(LOG, B); } catch(e){} }
function now(){ return (new Date()).getTime(); }
function ms(fn){ var t=now(); fn(); return now()-t; }

function synthArray(w,h){ var a=new Float32Array(w*h);
   for(var y=0;y<h;++y)for(var x=0;x<w;++x){ var v=0.15+0.12*Math.sin(x*0.021)*Math.cos(y*0.017); a[y*w+x]=v<0?0:v>1?1:v; } return a; }
function synthRGB(W,H){ var win=new ImageWindow(W,H,3,32,true,true,"PERF_"+Math.floor(Math.random()*1e6));
   var rect=new Rect(0,0,W,H),N=W*H,R=new Float32Array(N),G=new Float32Array(N),Bb=new Float32Array(N);
   for(var y=0;y<H;++y)for(var x=0;x<W;++x){ var i=y*W+x;
      R[i]=0.18+0.10*Math.sin(x*0.02); G[i]=0.16+0.09*Math.sin(x*0.02+0.5); Bb[i]=0.20+0.11*Math.sin(x*0.02+1.0);
      R[i]=Math.max(0,Math.min(1,R[i]));G[i]=Math.max(0,Math.min(1,G[i]));Bb[i]=Math.max(0,Math.min(1,Bb[i])); }
   win.mainView.beginProcess(UndoFlag_NoSwapFile);
   win.mainView.image.setSamples(R,rect,0);win.mainView.image.setSamples(G,rect,1);win.mainView.image.setSamples(Bb,rect,2);
   win.mainView.endProcess(); return win; }

try {
   var W=1800, H=1800, MP=(W*H/1e6).toFixed(2);
   L("=== PERF baseline @ " + W + "x" + H + " (" + MP + " Mpx) ===");
   var Y = synthArray(W,H);

   L("boxBlur r3        : " + ms(function(){ optCmBoxBlur(Y.slice(0),W,H,3); }) + " ms");
   L("boxBlur r30       : " + ms(function(){ optCmBoxBlur(Y.slice(0),W,H,30); }) + " ms");
   L("boxMin r2         : " + ms(function(){ optDetailBoxMin(Y.slice(0),W,H,2); }) + " ms");
   L("boxMin r10        : " + ms(function(){ optDetailBoxMin(Y.slice(0),W,H,10); }) + " ms");
   L("boxMax r10        : " + ms(function(){ optDetailBoxMax(Y.slice(0),W,H,10); }) + " ms");
   L("atrousDecompose 5 : " + ms(function(){ optAtrousDecompose(Y.slice(0),W,H,5); }) + " ms");
   L("guidedLuma r8     : " + ms(function(){ optDetailGuidedLuma(Y.slice(0),W,H,8,0.7); }) + " ms");

   var win1=synthRGB(W,H); var st=optColorMixerDefaultState(); st.bands[0].saturation=40; st.bands[5].vibrance=30;
   L("colorMixer apply  : " + ms(function(){ optRunColorMixerOnView(win1.mainView, st); }) + " ms"); win1.forceClose();

   var win2=synthRGB(W,H); var cmst=optColorMixerDefaultState(); cmst.bands[5].saturation=40; cmst.protectLowSat=false;
   var mv=null;
   L("colorMixer mask   : " + ms(function(){ mv=optBuildColorMixerMaskView(win2.mainView,cmst,-1); }) + " ms");
   try{optCloseView(mv);}catch(e){} win2.forceClose();

   var detailAlgos=["edgeAware","clahe","byObjectType","hdrmt","dse"];
   for (var d=0;d<detailAlgos.length;++d){ (function(algo){
      var w=synthRGB(W,H); var dst=optDetailDefaultState(); dst.algoId=algo;
      L("detail "+algo+(algo.length<10?"        ":"   ").substring(0,12-algo.length)+": " + ms(function(){ optRunDetailOnView(w.mainView,dst); }) + " ms"); w.forceClose();
   })(detailAlgos[d]); }

   L("DONE.");
} catch(e){ L("ERROR: " + e.message + (e.stack?("\n"+e.stack):"")); }
