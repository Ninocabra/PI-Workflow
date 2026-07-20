#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"
#include <pjsr/UndoFlag.jsh>

// Verifies: building an RGB image from mono H/O/S and assigning it into a MONO view
// converts that view to 3-channel RGB (the candidate is a mono star channel in the GUI).
var MD="E:/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/Collinder 34 COPIADO/WBPP/master/";
var LOG="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/cm_assign_mono2rgb.log";
var B=""; function L(s){B+=String(s)+"\n";try{File.writeTextFile(LOG,B);}catch(e){}}
function op(p){if(!File.exists(p))return null;var w=ImageWindow.open(p);return w&&w.length?w[0].mainView:null;}
function chroma(v){var im=v.image,n=im.width*im.height,rc=new Rect(0,0,im.width,im.height);if(im.numberOfChannels<3)return 0;var R=new Float32Array(n),G=new Float32Array(n),Bb=new Float32Array(n);im.getSamples(R,rc,0);im.getSamples(G,rc,1);im.getSamples(Bb,rc,2);var s=0,c=0,st=Math.max(1,(n/80000)|0);for(var i=0;i<n;i+=st){var mx=Math.max(R[i],G[i],Bb[i]);if(mx>0.05){s+=(mx-Math.min(R[i],G[i],Bb[i]))/mx;c++;}}return c?s/c:0;}
try{
   var H=op(MD+"masterLight_BIN-1_6248x4176_EXPOSURE-300.00s_FILTER-H_mono_autocrop.xisf");
   var O=op(MD+"masterLight_BIN-1_6248x4176_EXPOSURE-300.00s_FILTER-O_mono_autocrop.xisf");
   var S=op(MD+"masterLight_BIN-1_6248x4176_EXPOSURE-300.00s_FILTER-S_mono_autocrop.xisf");
   H.id="H_Stars"; O.id="O_Stars"; S.id="S_Stars";
   L("loaded H/O/S: "+!!H+"/"+!!O+"/"+!!S);
   // mono target candidate (clone of S as a separate mono window)
   var tgtW=new ImageWindow(S.image.width,S.image.height,1,S.image.bitsPerSample,S.image.isReal,false,"Opt_Candidate_S_Stars");
   tgtW.mainView.beginProcess(UndoFlag_NoSwapFile); tgtW.mainView.image.assign(S.image); tgtW.mainView.endProcess();
   var tgt=tgtW.mainView;
   L("target channels BEFORE = "+tgt.image.numberOfChannels+" chroma="+chroma(tgt).toFixed(3));
   var map={H_Stars:H,O_Stars:O,S_Stars:S};
   var mockDlg={ store:{ record:function(k){ return { view:(map.hasOwnProperty(k)?map[k]:null) }; } } };
   var boosts=[1.0,1.5,2.0];
   for(var bI=0;bI<boosts.length;bI++){
      var tw=new ImageWindow(S.image.width,S.image.height,1,S.image.bitsPerSample,S.image.isReal,false,"Opt_Cand_"+bI);
      tw.mainView.beginProcess(UndoFlag_NoSwapFile); tw.mainView.image.assign(S.image); tw.mainView.endProcess();
      var ok=optApplyNbStarsRGB(tw.mainView, mockDlg, {stretchFactor:6.5, colorBoost:boosts[bI]});
      L("colorBoost="+boosts[bI].toFixed(1)+" -> ok="+ok+" ch="+tw.mainView.image.numberOfChannels+" chroma="+chroma(tw.mainView).toFixed(3));
      tw.forceClose();
   }
   L("DONE");
}catch(e){L("ERR: "+e.message+(e.stack?("\n"+e.stack):""));}
