#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"

// SSSC live diagnostic (run in GUI). Lists open windows; finds/combines an RGB; runs
// optRunSSSC on a CLONE (fresh engine) and reports per-channel median BEFORE/AFTER plus
// the selected stage & gains. Reveals whether a channel collapses (=> red cast).
var LOG = "C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/sssc_diag2.log";
var B = "";
function L(s){ B += String(s) + "\n"; try { File.writeTextFile(LOG, B); } catch(e){} console.writeln(s); }
function chMed(view){ var im=view.image,o=[]; for(var c=0;c<im.numberOfChannels;++c){ im.firstSelectedChannel=c; im.lastSelectedChannel=c; o.push(im.median()); } im.resetSelections(); return o; }

try {
   var wins = ImageWindow.windows, color = null, monoR=null, monoG=null, monoB=null;
   L("=== open windows ===");
   for (var i = 0; i < wins.length; ++i) {
      var v = wins[i].mainView, id = v.id, nc = v.image.numberOfChannels;
      L("  " + id + "  " + v.image.width + "x" + v.image.height + "  ch=" + nc);
      if (nc >= 3 && !color) color = wins[i];
      if (nc === 1) {
         if (/(^|_|\b)R(_|\b|$)/i.test(id) && !monoR) monoR = v;
         else if (/(^|_|\b)G(_|\b|$)/i.test(id) && !monoG) monoG = v;
         else if (/(^|_|\b)B(_|\b|$)/i.test(id) && !monoB) monoB = v;
      }
   }
   L("color RGB found: " + (color ? color.mainView.id : "none") + " | mono R/G/B: " +
     (monoR?monoR.id:"-") + "/" + (monoG?monoG.id:"-") + "/" + (monoB?monoB.id:"-"));

   var src = color;
   if (!src && monoR && monoG && monoB) {
      L("combining R/G/B -> DIAG_RGB ...");
      var cc = new ChannelCombination; cc.colorSpace = ChannelCombination.prototype.RGB;
      cc.channels = [[true, monoR.id], [true, monoG.id], [true, monoB.id]];
      var nw = new ImageWindow(monoR.image.width, monoR.image.height, 3, 32, true, true, "DIAG_RGB");
      cc.executeOn(nw.mainView); nw.show(); src = nw;
      try { nw.copyAstrometricSolution(monoR.window); } catch(e){}
   }
   if (!src) throw new Error("No RGB and no R/G/B mono channels found to combine.");

   // clone the source so we never touch the user's image
   var sv = src.mainView;
   var work = new ImageWindow(sv.image.width, sv.image.height, sv.image.numberOfChannels, 32, true, true, "DIAG_SSSC");
   work.mainView.beginProcess(UndoFlag_NoSwapFile); work.mainView.image.assign(sv.image); work.mainView.endProcess();
   try { work.copyAstrometricSolution(src); } catch(e){}
   work.show();

   L("WCS on clone: " + optHasAstrometricSolution(work.mainView));
   var before = chMed(work.mainView);
   L("median BEFORE  R/G/B = " + before.map(function(x){return x.toFixed(5);}).join(" / "));

   var model = optRunSSSC(work, null, { magLow: 7.0, magHigh: 16.5 });
   var after = chMed(work.mainView);
   L("model: stage=" + model.stage + " gR=" + (model.gR!=null?model.gR.toFixed(3):"-") + " gB=" + (model.gB!=null?model.gB.toFixed(3):"-"));
   L("median AFTER   R/G/B = " + after.map(function(x){return x.toFixed(5);}).join(" / "));
   L("ratio AFTER R:G = " + (after[0]/after[1]).toFixed(3) + "  B:G = " + (after[2]/after[1]).toFixed(3) + "  (near 1 = neutral bg)");
   L("DIAG DONE.");
} catch(e){ L("ERROR: " + e.message + (e.stack ? ("\n"+e.stack) : "")); }
