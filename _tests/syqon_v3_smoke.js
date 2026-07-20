#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"

// =============================================================================
// syqon_v3_smoke.js — smoke HEADLESS de la integración SyQon V3 (2026-07-16).
// Verifica con los EJECUTABLES REALES instalados:
//   S1  args puros de Starless (contrato Axiom V3: -i/-o/-v/-d/-c, SIN --gui)
//   S2  args puros de Parallax (--mode solo cuando es "aesthetics")
//   S3  Starless headless end-to-end (starless+stars, TIFF, sin ventana SyQon)
//   S4  Starless applyToTarget (contrato in-place del fallback de CabraMagic)
//   S5  Parallax v1.5 modo classic (Natural) end-to-end
//   S6  Parallax v1.5 modo aesthetics (Defined) end-to-end
//   S7  Prism (flags sin cambios en la versión nueva) end-to-end
// Log: _tests/syqon_v3_smoke.log (incremental). Guard de fugas de ventanas.
// =============================================================================

var DIR = "C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_200/_tests/";
var LOG = DIR + "syqon_v3_smoke.log";
var B = "";
function L(s) { B += String(s) + "\n"; try { File.writeTextFile(LOG, B); } catch (e) {} }
function A(cond, msg) { if (!cond) throw new Error(msg); }

var RES = [];
function T(name, fn) {
   var before = ImageWindow.windows.length;
   var t0 = (new Date).getTime(), status = "PASS", msg = "";
   try {
      var r = fn();
      if (r && r.skip) { status = "SKIP"; msg = r.skip; }
   } catch (e) { status = "FAIL"; msg = String(e.message || e); }
   var leak = ImageWindow.windows.length - before;
   if (leak !== 0) {
      try {
         var wins = ImageWindow.windows;
         for (var i = wins.length - 1; i >= before; --i) { try { wins[i].forceClose(); } catch (e2) {} }
      } catch (e3) {}
      if (status === "PASS") { status = "FAIL"; msg = "fuga de ventanas: " + leak; }
      else msg += " · fuga de ventanas: " + leak;
   }
   RES.push({ name: name, status: status, msg: msg });
   L("  " + status + " " + name + " (" + ((new Date).getTime() - t0) + " ms)" + (msg ? " — " + msg : ""));
}

// Campo de estrellas sintético determinista RGB (gaussianas + fondo).
// size: 768 para Starless (el exe V3 exige >=512 por lado — tesela fija);
// 256 basta para Parallax/Prism (teselan con pad correctamente).
function makeStarField(id, size) {
   var W = size || 256, H = size || 256;
   var win = new ImageWindow(W, H, 3, 32, true, true, id);
   var k = W / 256;
   var stars = [[64*k,64*k,6,0.9],[192*k,80*k,4,0.7],[128*k,160*k,8,0.8],[48*k,208*k,3,0.6],[210*k,210*k,5,0.75],[100*k,40*k,2.5,0.5]];
   win.mainView.beginProcess(UndoFlag_NoSwapFile);
   for (var c = 0; c < 3; ++c) {
      var buf = new Float32Array(W * H);
      for (var y = 0; y < H; ++y)
         for (var x = 0; x < W; ++x) {
            var v = 0.08 + 0.02 * Math.sin(x * 0.05) * Math.cos(y * 0.04);   // fondo suave
            for (var s = 0; s < stars.length; ++s) {
               var dx = x - stars[s][0], dy = y - stars[s][1], sg = stars[s][2];
               v += stars[s][3] * Math.exp(-(dx * dx + dy * dy) / (2 * sg * sg)) * (c === 0 ? 1.0 : (c === 1 ? 0.9 : 0.8));
            }
            buf[y * W + x] = Math.min(0.98, v);
         }
         win.mainView.image.setSamples(buf, new Rect(0, 0, W, H), c);
   }
   win.mainView.endProcess();
   return win;
}
function viewMedian(view) { return view.image.median(); }
function viewsDiffer(v1, v2) {
   var r = new Rect(96, 96, 160, 160);
   var a = new Float32Array(64 * 64), b = new Float32Array(64 * 64);
   v1.image.getSamples(a, r, 0); v2.image.getSamples(b, r, 0);
   var d = 0;
   for (var i = 0; i < a.length; ++i) d = Math.max(d, Math.abs(a[i] - b[i]));
   return d > 1e-5;
}

try {
   L("SYQON V3 SMOKE — inicio " + (new Date).toISOString() + " · build " + (typeof OPT_BUILD !== "undefined" ? OPT_BUILD : "?"));
   var winsAtStart = ImageWindow.windows.length;

   // ---- S1: args puros Starless ------------------------------------------------
   T("S1 args Starless (contrato V3, sin --gui)", function () {
      var a = optBuildStarlessArgs("C:\\t\\in.tif", "C:/t/out.tif", { overlap: 64, device: "CPU" });
      A(a.join(" ") === "-i C:/t/in.tif -o C:/t/out.tif -v 64 -d CPU -c pixinsight",
        "args inesperados: " + a.join(" "));
      A(a.indexOf("--gui") < 0, "NUNCA debe pasarse --gui (abriría la ventana)");
      var d = optBuildStarlessArgs("i.tif", "o.tif", {});
      A(d.join(" ") === "-i i.tif -o o.tif -v 64 -d Auto -c pixinsight", "defaults inesperados: " + d.join(" "));
   });

   // ---- S2: args puros Parallax --------------------------------------------------
   T("S2 args Parallax (--mode solo aesthetics)", function () {
      var base = { correctAberration: true, starReduction: 3, sharpen: 0.8, tileSize: 512, overlap: 128, pad: 512 };
      var c = optBuildParallaxArgs("i.fits", "o.fits", "", base);
      A(c.indexOf("--mode") < 0, "classic no debe pasar --mode (compat CLIs antiguos)");
      base.mode = "classic";
      c = optBuildParallaxArgs("i.fits", "o.fits", "", base);
      A(c.indexOf("--mode") < 0, "mode=classic no debe pasar --mode");
      base.mode = "aesthetics";
      var ae = optBuildParallaxArgs("i.fits", "o.fits", "", base);
      var mi = ae.indexOf("--mode");
      A(mi >= 0 && ae[mi + 1] === "aesthetics", "aesthetics debe pasar --mode aesthetics");
   });

   // ---- S3: Starless headless end-to-end ----------------------------------------
   T("S3 Starless V3 headless (starless+stars)", function () {
      var exe = optReadStarlessConfiguredExecutablePath();
      if (!exe || !File.exists(exe)) return { skip: "SyQonStarless.exe no configurado/instalado" };
      var w = makeStarField("SMK_SL", 768);
      var res = null;
      try {
         res = optRunSyQonStarlessOnView(w.mainView, { overlap: 64, device: "Auto", starsOnlyMode: "Unscreen", outputTimeoutMinutes: 10 }, null);
         A(res && res.starlessWindow && !res.starlessWindow.isNull, "sin ventana starless");
         A(res.starsWindow && !res.starsWindow.isNull, "sin ventana de estrellas (Unscreen)");
         A(viewsDiffer(res.starlessWindow.mainView, w.mainView), "la starless es idéntica al original (¿no procesó?)");
         var mOrig = viewMedian(w.mainView), mSl = viewMedian(res.starlessWindow.mainView);
         A(isFinite(mSl) && mSl > 0 && mSl < 1, "mediana starless fuera de rango: " + mSl);
         L("     mediana original " + mOrig.toFixed(4) + " -> starless " + mSl.toFixed(4));
      } finally {
         try { if (res && res.starlessWindow) res.starlessWindow.forceClose(); } catch (e0) {}
         try { if (res && res.starsWindow) res.starsWindow.forceClose(); } catch (e1) {}
         w.forceClose();
      }
   });

   // ---- S4: Starless applyToTarget (contrato CabraMagic) -------------------------
   T("S4 Starless applyToTarget (in-place, 0 ventanas)", function () {
      var exe = optReadStarlessConfiguredExecutablePath();
      if (!exe || !File.exists(exe)) return { skip: "SyQonStarless.exe no configurado/instalado" };
      var w = makeStarField("SMK_SL_IP", 768);
      var ref = makeStarField("SMK_SL_REF", 768);
      try {
         var res = optRunSyQonStarlessOnView(w.mainView, { starsOnlyMode: "None", applyToTarget: true, outputTimeoutMinutes: 10 }, null);
         A(res.starlessWindow === null && res.starsWindow === null, "applyToTarget no debe devolver ventanas");
         A(viewsDiffer(w.mainView, ref.mainView), "la vista NO cambió in-place");
      } finally { w.forceClose(); ref.forceClose(); }
   });

   // ---- S5/S6: Parallax classic y aesthetics -------------------------------------
   function runParallaxMode(modeName) {
      var exe = optReadParallaxConfiguredExecutablePath();
      if (!exe || !File.exists(exe)) return { skip: "parallax_cli.exe no configurado/instalado" };
      var w = makeStarField("SMK_PLX_" + modeName);
      var ref = makeStarField("SMK_PLX_REF_" + modeName);
      try {
         optRunSyQonParallaxOnView(w.mainView, {
            mode: modeName, correctAberration: true, starReduction: 2, sharpen: 0.5,
            tileSize: 512, overlap: 64, pad: 96,
            useMTF: true, mtfTarget: 0.15, linkedStretch: false, useCPU: false, noDML: false
         }, null);
         A(viewsDiffer(w.mainView, ref.mainView), "Parallax(" + modeName + ") no modificó la vista");
         var m = viewMedian(w.mainView);
         A(isFinite(m) && m > 0 && m < 1, "mediana fuera de rango tras Parallax: " + m);
      } finally { w.forceClose(); ref.forceClose(); }
   }
   T("S5 Parallax v1.5 classic (Natural)", function () { return runParallaxMode("classic"); });
   T("S6 Parallax v1.5 aesthetics (Defined)", function () { return runParallaxMode("aesthetics"); });

   // ---- S7: Prism (compatibilidad) ------------------------------------------------
   T("S7 Prism (flags sin cambios)", function () {
      var exe = optReadPrismConfiguredExecutablePath();
      if (!exe || !File.exists(exe)) return { skip: "prism_cli.exe no configurado/instalado" };
      var w = makeStarField("SMK_PRISM");
      var ref = makeStarField("SMK_PRISM_REF");
      try {
         optRunSyQonPrismOnView(w.mainView, { tileSize: 512, overlap: 128, pad: 512, strength: 0.85, useAMP: true, ampDType: "fp16", useCPU: false, noDML: false }, null);
         A(viewsDiffer(w.mainView, ref.mainView), "Prism no modificó la vista");
         var m = viewMedian(w.mainView);
         A(isFinite(m) && m > 0 && m < 1, "mediana fuera de rango tras Prism: " + m);
      } finally { w.forceClose(); ref.forceClose(); }
   });

   var leakTotal = ImageWindow.windows.length - winsAtStart;
   L("Guard global de ventanas: " + leakTotal + " huérfanas");
   var pass = 0, fail = 0, skip = 0;
   for (var i = 0; i < RES.length; ++i) {
      if (RES[i].status === "PASS") ++pass;
      else if (RES[i].status === "FAIL") ++fail;
      else ++skip;
   }
   if (leakTotal !== 0) ++fail;
   L("RESULT: " + ((fail === 0) ? "GREEN" : "RED") + " (" + pass + " pass / " + fail + " fail / " + skip + " skip)");
   L("DONE.");
} catch (eTop) {
   L("ERROR FATAL: " + (eTop.message || eTop));
   L("RESULT: RED");
}
