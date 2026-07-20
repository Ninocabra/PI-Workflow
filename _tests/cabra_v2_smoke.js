#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"

// ============================================================================
// CabraMagic V2 functional smoke (headless): runs the FULL single-image
// pipeline (optCabraMagicRun) on a synthetic linear RGB frame with stars +
// gradient, with dialog=null (ABE fallback background, ALF+BN colour). Asserts:
//  - the run completes and reports stages
//  - the V2 finish stage ran (finisher + P3 quality gates)
//  - the result is a sane stretched image (median in a plausible window)
//  - no window leak (same open-window count before/after)
// Also exercises the FORAXX palette combine on synthetic mono channels.
// ============================================================================
var LOG = "C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_200/_tests/cabra_v2_smoke.log";
var B = "";
function L(s){ B += String(s) + "\n"; try { File.writeTextFile(LOG, B); } catch(e){} }

function synthLinearRGB(W, H, id) {
   var win = new ImageWindow(W, H, 3, 32, true, true, id);
   var rect = new Rect(0, 0, W, H), N = W * H;
   var R = new Float32Array(N), G = new Float32Array(N), Bb = new Float32Array(N);
   for (var y = 0; y < H; ++y) for (var x = 0; x < W; ++x) {
      var i = y * W + x;
      var grad = 0.010 + 0.012 * (x / W) + 0.008 * (y / H);          // linear-ish sky + gradient
      var neb = 0.030 * Math.exp(-(Math.pow(x - W * 0.55, 2) + Math.pow(y - H * 0.45, 2)) / (2 * Math.pow(W * 0.18, 2)));
      var n = 0.0015 * (((x * 7 + y * 13) % 17) / 17 - 0.5);          // deterministic "noise"
      R[i] = grad + neb * 1.1 + n; G[i] = grad + neb * 0.8 + n; Bb[i] = grad + neb * 0.6 + n;
      if (((x * 3 + y * 5) % 97) === 0 && x > 2 && y > 2) {           // sparse stars
         R[i] += 0.35; G[i] += 0.33; Bb[i] += 0.30;
         R[i-1] += 0.12; R[i+1] += 0.12; R[i-W] += 0.12; R[i+W] += 0.12;
         G[i-1] += 0.11; G[i+1] += 0.11; G[i-W] += 0.11; G[i+W] += 0.11;
         Bb[i-1] += 0.10; Bb[i+1] += 0.10; Bb[i-W] += 0.10; Bb[i+W] += 0.10;
      }
      R[i] = Math.min(1, Math.max(0, R[i])); G[i] = Math.min(1, Math.max(0, G[i])); Bb[i] = Math.min(1, Math.max(0, Bb[i]));
   }
   win.mainView.beginProcess(UndoFlag_NoSwapFile);
   win.mainView.image.setSamples(R, rect, 0);
   win.mainView.image.setSamples(G, rect, 1);
   win.mainView.image.setSamples(Bb, rect, 2);
   win.mainView.endProcess();
   win.hide();
   return win;
}

var fails = 0;
function check(name, ok, detail) {
   L((ok ? "PASS " : "FAIL ") + name + (detail ? ("  — " + detail) : ""));
   if (!ok) ++fails;
}

try {
   var winsBefore = ImageWindow.windows.length;

   // ---- 1) Full single-image pipeline on synthetic data --------------------
   var win = synthLinearRGB(256, 200, "cv2_rgb");
   var report = optCabraMagicRun(win.mainView, null, {});
   var names = [], okCount = 0;
   for (var i = 0; i < report.stages.length; ++i) {
      names.push(report.stages[i].name + ":" + report.stages[i].status);
      if (report.stages[i].status === "ok") ++okCount;
   }
   L("stages: " + names.join(" | "));
   check("run completed with stages", report.stages.length >= 4, report.stages.length + " stages, " + okCount + " ok");
   var hasFinish = false, splitAttempted = false;
   for (var j = 0; j < report.stages.length; ++j) {
      if (report.stages[j].name.indexOf("finish") === 0) hasFinish = (report.stages[j].status === "ok");
      if (report.stages[j].name.indexOf("star split") === 0) splitAttempted = true;
   }
   check("V2 finish stage ran ok", hasFinish, "");
   check("star split stage attempted", splitAttempted, "(ok OR graceful skip both valid)");
   var q = optQualityMetrics(win.mainView);
   L("result: median=" + q.median.toFixed(4) + " bg=" + q.background.toFixed(4) + " clipped=" + q.saturationPct.toFixed(3) + "%");
   check("result is stretched & sane", q.median > 0.03 && q.median < 0.55, "median " + q.median.toFixed(4));
   check("highlights under control", q.saturationPct < 2.0, q.saturationPct.toFixed(3) + "%");
   win.forceClose();

   // ---- 2) FORAXX palette combine on synthetic mono channels ---------------
   function synthMono(W, H, id, amp) {
      var w2 = new ImageWindow(W, H, 1, 32, true, false, id);
      var r2 = new Rect(0, 0, W, H), n2 = W * H, a = new Float32Array(n2);
      for (var p = 0; p < n2; ++p) a[p] = Math.min(1, amp * (0.2 + 0.6 * ((p * 31) % 101) / 101));
      w2.mainView.beginProcess(UndoFlag_NoSwapFile);
      w2.mainView.image.setSamples(a, r2, 0); w2.mainView.endProcess(); w2.hide();
      return w2;
   }
   var wH = synthMono(64, 64, "cv2_H", 0.9), wO = synthMono(64, 64, "cv2_O", 0.6), wS = synthMono(64, 64, "cv2_S", 0.4);
   try {
      var fx = optCabraCombinePalette(wH.mainView, wO.mainView, wS.mainView, "FORAXX", "cv2_fx");
      var fxOk = fx && !fx.isNull && fx.image && fx.image.numberOfChannels === 3;
      check("FORAXX combine produced RGB", fxOk, "");
      if (fxOk) {
         var qf = optQualityMetrics(fx);
         check("FORAXX output in range", qf.max <= 1.0001 && qf.min >= 0, "min " + qf.min.toFixed(4) + " max " + qf.max.toFixed(4));
         try { fx.window.forceClose(); } catch(e0) {}
      } else {
         check("FORAXX output in range", false, "combine failed — no output to measure");
      }
   } catch (eFx) {
      check("FORAXX combine produced RGB", false, eFx.message || String(eFx));
      check("FORAXX output in range", false, "exception");
      try { var fxw = ImageWindow.windowById("cv2_fx"); if (fxw && !fxw.isNull) fxw.forceClose(); } catch(e1) {}
   }
   wH.forceClose(); wO.forceClose(); wS.forceClose();

   // ---- 3) Window-leak guard ------------------------------------------------
   var winsAfter = ImageWindow.windows.length;
   check("no window leak", winsAfter === winsBefore, winsBefore + " -> " + winsAfter);

   L(fails === 0 ? "RESULT: GREEN" : ("RESULT: RED (" + fails + " fail)"));
} catch (e) {
   L("ERROR: " + e.message + (e.stack ? ("\n" + e.stack) : ""));
   L("RESULT: RED (exception)");
}
