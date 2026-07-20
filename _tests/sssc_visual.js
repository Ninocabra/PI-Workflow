#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"

// Clean SSSC before/after: open a FRESH linear copy, calibrate a clone with SSSC, then
// apply the SAME linked auto-stretch to both so the colour cast (before) vs neutral
// (after) is directly comparable. Self-contained — ignores any messy prior windows.
var IMG = "C:/Users/ninoc/Downloads/RGB_LDu_2.xisf";

function autoStretchLinked(win) {
   var view = win.mainView, img = view.image;
   var shadowsClipping = -2.80, targetBackground = 0.25, n = img.numberOfChannels;
   var med = 0, mad = 0;
   for (var c = 0; c < n; ++c) {
      img.firstSelectedChannel = c; img.lastSelectedChannel = c;
      med += img.median();
      mad += (typeof img.MAD === "function") ? img.MAD() : img.avgDev();
   }
   img.resetSelections();
   med /= n; mad /= n;
   var normMad = 1.4826 * mad;
   var c0 = Math.range(med + shadowsClipping * normMad, 0, 1);
   var x = med - c0;
   if (x < 0.01) x = 0.01;   // floor: avoids midtones collapse (washout) on low-noise data
   var m = (x * (targetBackground - 1)) / (2 * targetBackground * x - targetBackground - x);
   var ht = new HistogramTransformation;
   ht.H = [[0, 0.5, 1, 0, 1], [0, 0.5, 1, 0, 1], [0, 0.5, 1, 0, 1],
           [c0, m, 1.0, 0, 1], [0, 0.5, 1, 0, 1]];
   view.beginProcess(UndoFlag_NoSwapFile);
   ht.executeOn(view, false);
   view.endProcess();
}

try {
   // BEFORE (fresh, uncalibrated)
   var before = ImageWindow.open(IMG)[0];
   try { before.mainView.id = "SSSC_BEFORE"; } catch (e0) {}

   // AFTER (calibrated clone of the same linear data)
   var after = new ImageWindow(before.mainView.image.width, before.mainView.image.height,
                               before.mainView.image.numberOfChannels, 32, true, true, "SSSC_AFTER");
   after.mainView.beginProcess(UndoFlag_NoSwapFile);
   after.mainView.image.assign(before.mainView.image);
   after.mainView.endProcess();
   try { after.copyAstrometricSolution(before); } catch (eC) {}
   var model = optRunSSSC(after, null, { magLow: 7.0, magHigh: 16.5 });
   console.noteln("=> SSSC calibrated SSSC_AFTER with Stage " + model.stage + ".");

   // Same linked stretch on both
   autoStretchLinked(before);
   autoStretchLinked(after);
   before.show(); before.zoomToFit();
   after.show(); after.zoomToFit();
   console.noteln("=> Visual ready: SSSC_BEFORE (cast) vs SSSC_AFTER (calibrated).");
} catch (e) { console.criticalln("ERROR: " + e.message + (e.stack ? ("\n" + e.stack) : "")); }
