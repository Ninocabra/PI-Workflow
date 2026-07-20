#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"

// SSSC F0 ground-truth self-test (headless, no Gaia needed):
//  A) optSSSCStarPhotometry recovers known per-channel star flux ratios from a
//     synthetic Gaussian-star image with a flat background.
//  B) optSSSCIntegrateSpectrum integrates a sampled spectrum through the seed bands
//     with the expected colour ordering (red spectrum -> R>B, blue -> B>R, flat -> ~band areas).
var LOG = "C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/sssc_f0_test.log";
var B = "";
function L(s){ B += String(s) + "\n"; try { File.writeTextFile(LOG, B); } catch(e){} }
function approx(a, b, tol){ return Math.abs(a - b) <= tol; }

try {
   L("symbols: query=" + (typeof optSSSCQueryGaiaSpectra) +
     " photometry=" + (typeof optSSSCStarPhotometry) +
     " integrate=" + (typeof optSSSCIntegrateSpectrum) +
     " seedBand=" + (typeof optSSSCSeedBand));

   // ---------- A) Photometry ground truth ----------
   var W = 256, H = 256, N = W * H, bg = 0.03;
   var R = new Float32Array(N), Gc = new Float32Array(N), Bc = new Float32Array(N);
   for (var i = 0; i < N; ++i) { R[i] = bg; Gc[i] = bg; Bc[i] = bg; }

   // Inject Gaussian stars with KNOWN per-channel total flux ratios.
   var sigma = 1.6, twoSig2 = 2 * sigma * sigma;
   // amplitude per channel chosen so total flux = amp * 2*pi*sigma^2; we compare ratios.
   var stars = [];
   var truth = [];
   var positions = [[40,40],[80,60],[130,50],[190,70],[60,120],[120,130],[180,140],
                    [50,190],[110,200],[170,205],[210,150],[95,95]];
   // distinct colour ratios (R:G:B amplitudes)
   var ratios = [[1.0,0.8,0.6],[0.5,0.7,1.0],[1.2,1.0,0.4],[0.9,0.9,0.9],
                 [1.0,0.6,0.5],[0.4,0.8,1.1],[1.1,0.95,0.7],[0.7,1.0,0.9],
                 [1.3,0.9,0.5],[0.6,0.85,1.0],[1.0,1.0,0.8],[0.8,1.1,1.0]];
   for (var sIdx = 0; sIdx < positions.length; ++sIdx) {
      var px0 = positions[sIdx][0], py0 = positions[sIdx][1];
      var aR = 0.5 * ratios[sIdx][0], aG = 0.5 * ratios[sIdx][1], aB = 0.5 * ratios[sIdx][2];
      for (var dy = -6; dy <= 6; ++dy) for (var dx = -6; dx <= 6; ++dx) {
         var x = px0 + dx, y = py0 + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue;
         var ga = Math.exp(-(dx*dx + dy*dy) / twoSig2), idx = y * W + x;
         R[idx]  += aR * ga; Gc[idx] += aG * ga; Bc[idx] += aB * ga;
      }
      stars.push({ x: px0, y: py0 });
      truth.push({ rg: ratios[sIdx][0]/ratios[sIdx][1], bg: ratios[sIdx][2]/ratios[sIdx][1] });
   }

   var win = new ImageWindow(W, H, 3, 32, true, true, "sssc_synth");
   var mv = win.mainView, rect = new Rect(0, 0, W, H);
   mv.beginProcess(UndoFlag_NoSwapFile);
   mv.image.setSamples(R, rect, 0); mv.image.setSamples(Gc, rect, 1); mv.image.setSamples(Bc, rect, 2);
   mv.endProcess();

   optSSSCStarPhotometry(mv, stars, { aperture: 5, annulusIn: 8, annulusOut: 12, satLevel: 0.99 });

   var nPass = 0, nTested = 0, maxErr = 0;
   for (var t = 0; t < stars.length; ++t) {
      var st = stars[t]; if (!st.ok) { L("  star " + t + " rejected: " + st.reason); continue; }
      var mRG = st.Rm / st.Gm, mBG = st.Bm / st.Gm;
      var eRG = Math.abs(mRG - truth[t].rg), eBG = Math.abs(mBG - truth[t].bg);
      maxErr = Math.max(maxErr, eRG, eBG); ++nTested;
      var ok = eRG < 0.05 && eBG < 0.05; if (ok) ++nPass;
      L("  star " + t + " measured R/G=" + mRG.toFixed(3) + " (truth " + truth[t].rg.toFixed(3) + ")" +
        " B/G=" + mBG.toFixed(3) + " (truth " + truth[t].bg.toFixed(3) + ") " + (ok ? "ok" : "OFF"));
   }
   L("PHOTOMETRY: " + nPass + "/" + nTested + " stars within 0.05 ratio; maxErr=" + maxErr.toFixed(4));
   L("PHOTOMETRY result: " + (nPass === nTested && nTested >= 8 ? "PASS" : "FAIL"));
   win.forceClose();

   // ---------- B) Spectrum integration ----------
   var grid = { start: 336, step: 2, count: 343 };
   var flat = [], red = [], blue = [];
   for (var k = 0; k < grid.count; ++k) {
      var lam = grid.start + k * grid.step;
      flat.push(1.0);
      red.push(Math.max(0, (lam - 450) / 570));     // rises toward red
      blue.push(Math.max(0, (700 - lam) / 320));    // rises toward blue
   }
   var iFlat = optSSSCIntegrateSpectrum(flat, grid);
   var iRed  = optSSSCIntegrateSpectrum(red, grid);
   var iBlue = optSSSCIntegrateSpectrum(blue, grid);
   L("integrate flat [r,g,b] = " + iFlat.map(function(v){return v.toFixed(1);}).join(", "));
   L("integrate red  [r,g,b] = " + iRed.map(function(v){return v.toFixed(1);}).join(", "));
   L("integrate blue [r,g,b] = " + iBlue.map(function(v){return v.toFixed(1);}).join(", "));
   var bOk = (iRed[0] > iRed[2]) && (iBlue[2] > iBlue[0]) && (iFlat[0] > 0 && iFlat[1] > 0 && iFlat[2] > 0);
   L("INTEGRATION result: " + (bOk ? "PASS" : "FAIL"));

   L("F0 DONE.");
} catch(e) {
   L("ERROR: " + e.message + (e.stack ? ("\n" + e.stack) : ""));
}
