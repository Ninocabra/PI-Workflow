#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"

// Fair comparison: RAW vs SSSC vs SPCC on the SAME combined RGB, each shown with the
// WORKFLOW'S OWN display stretch (optApplyMadAutoStretch linked = exactly what the Pre
// preview uses after colour calibration). This judges SSSC the way the system shows it.
var LOG = "C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/sssc_vs_spcc.log";
var B = "";
function L(s){ B += String(s) + "\n"; try { File.writeTextFile(LOG, B); } catch(e){} console.writeln(s); }
function chMed(view){ var im=view.image,o=[]; for(var c=0;c<im.numberOfChannels;++c){ im.firstSelectedChannel=c; im.lastSelectedChannel=c; o.push(im.median()); } im.resetSelections(); return o; }

function cloneOf(srcWin, id) {
   var sv = srcWin.mainView;
   var w = new ImageWindow(sv.image.width, sv.image.height, sv.image.numberOfChannels, 32, true, true, id);
   w.mainView.beginProcess(UndoFlag_NoSwapFile); w.mainView.image.assign(sv.image); w.mainView.endProcess();
   try { w.copyAstrometricSolution(srcWin); } catch(e){}
   return w;
}

try {
   // Always open a FRESH linear copy from disk (avoids picking up already-calibrated windows).
   var TAG = "X" + (new Date().getTime() % 10000);   // unique id suffix
   var P = "C:/Users/ninoc/Downloads/RGB_LDu_2.xisf";
   if (!File.exists(P)) throw new Error("RGB_LDu_2.xisf not found.");
   var src = ImageWindow.open(P)[0]; src.show(); L("opened fresh " + P + " (tag " + TAG + ")");

   // SSSC (now includes background neutralization)
   var sW = cloneOf(src, "SSSCbn_" + TAG);
   var m = optRunSSSC(sW, null, { magLow:7.0, magHigh:16.5 });
   L("SSSC stage=" + m.stage + " medians=" + chMed(sW.mainView).map(function(x){return x.toFixed(5);}).join("/"));
   optApplyMadAutoStretch(sW.mainView.image, true); sW.show(); sW.zoomToFit();

   // SPCC (native workflow) for reference
   try {
      var pW = cloneOf(src, "SPCCref_" + TAG);
      optRunSPCCWorkflow(pW.mainView, null);
      L("SPCC medians=" + chMed(pW.mainView).map(function(x){return x.toFixed(5);}).join("/"));
      optApplyMadAutoStretch(pW.mainView.image, true); pW.show(); pW.zoomToFit();
   } catch (eP) { L("SPCC skipped: " + eP.message); }

   L("CMP DONE.");
} catch(e){ L("ERROR: " + e.message + (e.stack ? ("\n"+e.stack) : "")); }
