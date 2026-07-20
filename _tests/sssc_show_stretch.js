#engine v8
#include <pjsr/UndoFlag.jsh>
// Visual before/after for SSSC: apply a LINKED auto-stretch (same midtones for R/G/B, so
// the colour cast remains visible) to a fresh copy of the uncalibrated RGB and to the
// SSSC-calibrated result. Linked is essential — an unlinked stretch would auto-neutralise
// each channel and hide the very colour difference we want to show.
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
   var normMad = 1.4826 * mad; if (normMad < 1e-8) normMad = 1e-8;
   var c0 = Math.range(med + shadowsClipping * normMad, 0, 1);
   var x = med - c0; if (x < 1e-6) x = 1e-6;
   var m = (x * (targetBackground - 1)) / (2 * targetBackground * x - targetBackground - x);
   var ht = new HistogramTransformation;
   ht.H = [[0, 0.5, 1, 0, 1], [0, 0.5, 1, 0, 1], [0, 0.5, 1, 0, 1],
           [c0, m, 1.0, 0, 1], [0, 0.5, 1, 0, 1]];
   view.beginProcess(UndoFlag_NoSwapFile);
   ht.executeOn(view, false);
   view.endProcess();
}

try {
   // BEFORE: fresh uncalibrated copy
   var b = ImageWindow.open(IMG)[0];
   try { b.mainView.id = "BEFORE_uncalibrated"; } catch (e0) {}
   autoStretchLinked(b);
   b.show(); b.zoomToFit();

   // AFTER: the SSSC-calibrated window (id contains "_SSSC"), still linear -> stretch it
   var after = null, wins = ImageWindow.windows;
   for (var i = 0; i < wins.length; ++i) {
      try { if (wins[i] && !wins[i].isNull && /_SSSC/i.test(wins[i].mainView.id)) after = wins[i]; } catch (e1) {}
   }
   if (after) {
      autoStretchLinked(after);
      after.show(); after.zoomToFit();
      console.noteln("=> Stretched BEFORE_uncalibrated and " + after.mainView.id + " (linked auto-stretch).");
   } else {
      console.warningln("No *_SSSC window found; only BEFORE shown.");
   }
} catch (e) { console.criticalln("ERROR: " + e.message); }
