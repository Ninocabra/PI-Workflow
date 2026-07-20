#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"

// SSSC F1 ground-truth self-test (headless):
//  Build synthetic stars with KNOWN blackbody spectra, apply a KNOWN per-channel cast
//  (gRtrue,gBtrue) + photometric noise + a couple of outliers, then verify
//  optSSSCFitStage1Gains recovers the inverse cast (gR ~ 1/gRtrue, gB ~ 1/gBtrue).
//  Also verify optSSSCApplyGains rebalances a flat image to neutral.
var LOG = "C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/sssc_f1_test.log";
var B = "";
function L(s){ B += String(s) + "\n"; try { File.writeTextFile(LOG, B); } catch(e){} }

// deterministic LCG so the test is reproducible
var _seed = 12345;
function rnd(){ _seed = (1103515245 * _seed + 12345) & 0x7fffffff; return _seed / 0x7fffffff; }

var grid = { start: 336, step: 2, count: 343 };
function blackbodyPhotons(T) {
   // photon spectral distribution ~ lambda^-4 / (exp(c2/(lambda*T)) - 1), c2 = 1.4388e7 nm.K
   var c2 = 1.4388e7, out = [];
   for (var k = 0; k < grid.count; ++k) {
      var lam = grid.start + k * grid.step;
      var x = c2 / (lam * T);
      var v = (x > 80) ? 0 : 1.0 / (Math.pow(lam, 4) * (Math.exp(x) - 1));
      out.push(v);
   }
   return out;
}

try {
   L("symbols: fit=" + (typeof optSSSCFitStage1Gains) + " apply=" + (typeof optSSSCApplyGains) +
     " robust=" + (typeof optSSSCRobustRatio) + " run=" + (typeof optRunSSSCStage1));

   // ---------- A) Gain recovery from a blackbody star cloud ----------
   var gRtrue = 1.40, gBtrue = 0.80;          // raw uncalibrated cast (red strong, blue weak)
   var temps = [3500,4200,4800,5200,5800,6200,6800,7500,8500,9500,11000,4000,5500,6000,7000];
   var stars = [];
   for (var i = 0; i < temps.length; ++i) {
      var sp = blackbodyPhotons(temps[i]);
      var e = optSSSCIntegrateSpectrum(sp, grid);     // true band integrals
      var bright = 0.5 + rnd();                        // arbitrary per-star brightness
      var nR = 1 + (rnd() - 0.5) * 0.06;               // +/-3% photometric noise
      var nG = 1 + (rnd() - 0.5) * 0.06;
      var nB = 1 + (rnd() - 0.5) * 0.06;
      stars.push({ ok: true, flux: sp,
                   Rm: e[0] * gRtrue * bright * nR,
                   Gm: e[1] * 1.0    * bright * nG,
                   Bm: e[2] * gBtrue * bright * nB });
   }
   // two outliers (e.g. blended / wrong match): random colours
   stars.push({ ok: true, flux: blackbodyPhotons(5800), Rm: 5.0, Gm: 1.0, Bm: 0.2 });
   stars.push({ ok: true, flux: blackbodyPhotons(5800), Rm: 0.1, Gm: 1.0, Bm: 9.0 });

   var gains = optSSSCFitStage1Gains(stars, grid);
   var expR = 1 / gRtrue, expB = 1 / gBtrue;
   var errR = Math.abs(gains.gR - expR) / expR, errB = Math.abs(gains.gB - expB) / expB;
   L("recovered gR=" + gains.gR.toFixed(4) + " (expect " + expR.toFixed(4) + ", err " + (errR*100).toFixed(2) + "%)");
   L("recovered gB=" + gains.gB.toFixed(4) + " (expect " + expB.toFixed(4) + ", err " + (errB*100).toFixed(2) + "%)");
   L("used stars = " + gains.n + " (15 good + 2 outliers; outliers should be clipped)");
   L("GAIN RECOVERY: " + (errR < 0.05 && errB < 0.05 ? "PASS" : "FAIL"));

   // ---------- B) Apply gains rebalances a cast flat image ----------
   var W = 32, H = 32, N = W * H;
   var Rr = new Float32Array(N), Gg = new Float32Array(N), Bb = new Float32Array(N);
   for (var p = 0; p < N; ++p) { Rr[p] = 0.30 * gRtrue; Gg[p] = 0.30; Bb[p] = 0.30 * gBtrue; } // casted gray
   var win = new ImageWindow(W, H, 3, 32, true, true, "sssc_f1_flat");
   var mv = win.mainView, rect = new Rect(0, 0, W, H);
   mv.beginProcess(UndoFlag_NoSwapFile);
   mv.image.setSamples(Rr, rect, 0); mv.image.setSamples(Gg, rect, 1); mv.image.setSamples(Bb, rect, 2);
   mv.endProcess();
   optSSSCApplyGains(mv, gains);
   var aR = mv.image.sample(16,16,0), aG = mv.image.sample(16,16,1), aB = mv.image.sample(16,16,2);
   var rgErr = Math.abs(aR/aG - 1), bgErr = Math.abs(aB/aG - 1);
   L("after apply: R/G=" + (aR/aG).toFixed(4) + " B/G=" + (aB/aG).toFixed(4) + " (expect ~1.0 = neutral)");
   L("REBALANCE: " + (rgErr < 0.05 && bgErr < 0.05 ? "PASS" : "FAIL"));
   win.forceClose();

   L("F1 DONE.");
} catch(e) {
   L("ERROR: " + e.message + (e.stack ? ("\n" + e.stack) : ""));
}
