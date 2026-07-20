#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"

// SSSC REAL-IMAGE analysis — run in the user's PixInsight GUI (Gaia DR3SP configured).
// Opens an RGB linear integration, queries Gaia spectra, measures stars, and reports how
// each SSSC stage performs on REAL data (star counts, colour span, residual RMS per
// stage), then applies the auto-selected stage to a clone.
var IMG = "C:/Users/ninoc/Downloads/RGB_LDu_2.xisf";
var LOG = "C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/sssc_real_analysis.log";
var B = "";
function L(s){ B += String(s) + "\n"; try { File.writeTextFile(LOG, B); } catch(e){} console.writeln(s); }

function residualRms(stars, grid, model, kind) {
   // colour residual in log2 ratio space after a given model is applied to measured ratios.
   var rr = [];
   for (var i = 0; i < stars.length; ++i) {
      var st = stars[i]; if (!st.ok || !st.flux || st.Gm <= 0) continue;
      var e = optSSSCIntegrateSpectrum(st.flux, grid); if (e[1] <= 0) continue;
      var eR = e[0]/e[1], eB = e[2]/e[1];
      var mR = st.Rm/st.Gm, mB = st.Bm/st.Gm, cR, cG = 1, cB;
      if (kind === "raw") { cR = mR; cB = mB; }
      else if (kind === "s1") { cR = model.gR*mR; cB = model.gB*mB; }
      else if (kind === "s2") {
         var x = optSSSCLog2(model.gR*mR, model.gB*mB);
         if (x < model.xMin) x = model.xMin; else if (x > model.xMax) x = model.xMax;
         cR = model.gR*mR*Math.pow(2, model.aR + model.bR*x);
         cB = model.gB*mB*Math.pow(2, model.aB + model.bB*x);
      } else if (kind === "s3") {
         var A = model.ccm;
         cR = A[0][0]*mR + A[0][1]*1 + A[0][2]*mB;
         cG = A[1][0]*mR + A[1][1]*1 + A[1][2]*mB;
         cB = A[2][0]*mR + A[2][1]*1 + A[2][2]*mB;
      }
      if (cR > 0 && cG > 0 && cB > 0) { rr.push(optSSSCLog2(cR,cG) - optSSSCLog2(eR,1)); rr.push(optSSSCLog2(cB,cG) - optSSSCLog2(eB,1)); }
   }
   return optSSSCRms(rr);
}

try {
   L("=== SSSC real-image analysis ===");
   var arr = ImageWindow.open(IMG);
   if (!arr || !arr.length) throw new Error("Could not open " + IMG);
   var win = arr[0]; win.show();
   var view = win.mainView;
   L("opened: " + view.id + " " + view.image.width + "x" + view.image.height + " ch=" + view.image.numberOfChannels);
   if (view.image.numberOfChannels < 3) throw new Error("Not an RGB image.");

   // Astrometric solution?
   var solved = optHasAstrometricSolution(view);
   L("astrometric solution present: " + solved);
   if (!solved) {
      L("attempting plate solve...");
      try { optSolveAstrometryOnWindow(win, "the SSSC test image"); } catch (eS) { L("solve error: " + eS.message); }
      solved = optHasAstrometricSolution(view);
      L("after solve: " + solved);
   }
   if (!solved) throw new Error("No astrometric solution; cannot run SSSC. Solve the image first.");

   // Query + photometry
   var stars = optSSSCQueryGaiaSpectra(win, { magLow: 7.0, magHigh: 16.5 });
   optSSSCStarPhotometry(view, stars, {});
   var nOk = 0, xs = [];
   for (var i = 0; i < stars.length; ++i) if (stars[i].ok) { ++nOk;
      var e = optSSSCIntegrateSpectrum(stars[i].flux, stars.grid);
      if (e[1] > 0) xs.push(optSSSCLog2(e[0], e[2])); }
   xs.sort(function(a,b){return a-b;});
   var span = xs.length ? (xs[xs.length-1] - xs[0]) : 0;
   L("usable stars = " + nOk + " of " + stars.length + "; spectral colour span (log2 R/B) = " + span.toFixed(2));

   // Per-stage fit + residuals on REAL data
   var g1 = optSSSCFitStage1Gains(stars, stars.grid);
   L("Stage1 gains: R=" + g1.gR.toFixed(4) + " G=1 B=" + g1.gB.toFixed(4));
   L("  residual RMS raw   = " + residualRms(stars, stars.grid, g1, "raw").toFixed(4));
   L("  residual RMS Stage1 = " + residualRms(stars, stars.grid, g1, "s1").toFixed(4));
   if (nOk >= 50) {
      var m2 = optSSSCFitStage2Response(stars, stars.grid, g1, { minStars: 50 });
      L("  residual RMS Stage2 = " + residualRms(stars, stars.grid, m2, "s2").toFixed(4) + " (slopes bR=" + m2.bR.toFixed(3) + " bB=" + m2.bB.toFixed(3) + ")");
   }
   if (nOk >= 30) {
      var m3 = optSSSCFitStage3CCM(stars, stars.grid, { minStars: 30 });
      L("  residual RMS Stage3 = " + residualRms(stars, stars.grid, m3, "s3").toFixed(4));
   }

   // Apply auto-selected stage to a CLONE (keep original intact).
   var cw = new ImageWindow(view.image.width, view.image.height, view.image.numberOfChannels, 32, true, true, view.id + "_SSSC");
   cw.mainView.beginProcess(UndoFlag_NoSwapFile);
   cw.mainView.image.assign(view.image);
   cw.mainView.endProcess();
   try { cw.copyAstrometricSolution(win); } catch (eC) {}
   cw.show();
   var model = optRunSSSC(cw, null, { magLow: 7.0, magHigh: 16.5 });
   L("APPLIED auto-selected Stage " + model.stage + " to " + cw.mainView.id);
   L("DONE.");
} catch (e) { L("ERROR: " + e.message + (e.stack ? ("\n"+e.stack) : "")); }
