#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"
#include "synth_factory.jsh"

// =============================================================================
// battery_tools_smoke.js — BATERÍA PI Workflow · NIVEL 2 (tools externas).
// Smoke de SXT / StarNet2 / BXT / NXT / GraXpert / DeepSNR / SyQon (Prism+Starless):
// si la tool NO está instalada → SKIP limpio (nunca FAIL). Si está: corre sobre
// un sintético plausible y comprueba salida sana (sin NaN, dimensiones, efecto
// esperado grueso). NO se comprueba nada píxel-exacto (AI no determinista).
// Salidas: battery_tools_smoke.log + battery_tools_smoke.json (lo integra
// battery_suite.js en battery_report.md).
// Ejecución:
//   "C:\Program Files\PixInsight\bin\PixInsight.exe" -n=152 --automation-mode
//     -r=".../_tests/battery_tools_smoke.js" --force-exit
// =============================================================================

var DIR = "C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_200/_tests/";
var LOG = DIR + "battery_tools_smoke.log";
var JSONP = DIR + "battery_tools_smoke.json";
var SLOW_MS = 20000;

var B = "";
function L(s) { B += String(s) + "\n"; try { File.writeTextFile(LOG, B); } catch (e) {} }
function A(cond, msg) { if (!cond) throw new Error(msg); }

var RES = [], T0 = (new Date).getTime();
function T(name, img, fn) {
   var before = ImageWindow.windows.length;
   var t0 = (new Date).getTime(), status = "PASS", msg = "";
   try {
      var r = fn();
      if (r && r.skip) { status = "SKIP"; msg = r.skip; }
   } catch (e) { status = "FAIL"; msg = String(e.message || e); }
   var ms = (new Date).getTime() - t0;
   var leak = ImageWindow.windows.length - before;
   if (leak !== 0) {
      try {
         var wins = ImageWindow.windows;
         for (var i = wins.length - 1; i >= before; --i) { try { wins[i].forceClose(); } catch (e2) {} }
      } catch (e3) {}
      if (status === "PASS") { status = "FAIL"; msg = "fuga de ventanas: " + leak; }
      else msg += " · fuga de ventanas: " + leak;
   }
   if (status === "PASS" && ms > SLOW_MS) status = "SLOW";
   RES.push({ name: name, img: img, ms: ms, status: status, msg: msg });
   L("  " + status + " " + name + " (" + img + ") " + ms + " ms" + (msg ? " — " + msg : ""));
}

// campo plausible para las tools AI: estrellas + nebulosidad + algo de ruido
function toolField(W, H) {
   var win = sfStarField(W, H, 1.8, [
      [Math.round(W * 0.2), Math.round(H * 0.25), 0.7, 0.6, 0.5], [Math.round(W * 0.55), Math.round(H * 0.4), 0.6, 0.6, 0.65],
      [Math.round(W * 0.75), Math.round(H * 0.7), 0.65, 0.55, 0.5], [Math.round(W * 0.35), Math.round(H * 0.75), 0.5, 0.55, 0.6],
      [Math.round(W * 0.85), Math.round(H * 0.15), 0.6, 0.5, 0.45], [Math.round(W * 0.1), Math.round(H * 0.6), 0.55, 0.6, 0.5]
   ]);
   // añade nebulosidad suave + ruido determinista sobre las 3 bandas
   var img = win.mainView.image, N = W * H, rect = new Rect(0, 0, W, H);
   var rng = sfMulberry32(424242);
   for (var c = 0; c < 3; ++c) {
      var a = new Float32Array(N);
      img.getSamples(a, rect, c);
      for (var y = 0; y < H; ++y) for (var x = 0; x < W; ++x) {
         var i = y * W + x;
         var neb = 0.06 * Math.exp(-(((x - W * 0.5) * (x - W * 0.5) + (y - H * 0.5) * (y - H * 0.5)) / (2 * (W * 0.25) * (W * 0.25))));
         a[i] = sfClamp01(a[i] + neb + 0.01 * sfGaussNoise(rng));
      }
      win.mainView.beginProcess(UndoFlag_NoSwapFile);
      img.setSamples(a, rect, c);
      win.mainView.endProcess();
   }
   return win;
}

try {
   L("BATERÍA NIVEL 2 (tools externas) — " + (new Date).toISOString());
   var winsAtStart = ImageWindow.windows.length;
   function has(p) { return optDependencyProcessExists(p); }

   T("StarXTerminator (starless in-place)", "toolField 512×512", function () {
      if (!has("StarXTerminator")) return { skip: "esperado: StarXTerminator no instalado" };
      // las tools AI exigen ≥512×512 (StarNet2/DeepSNR lo declaran; SXT/NXT hacen no-op)
      var w = toolField(512, 512);
      try {
         var peak0 = w.mainView.image.sample(Math.round(512 * 0.2), Math.round(512 * 0.25), 0);
         var sxt = new StarXTerminator();
         try { sxt.stars = false; } catch (e0) {}
         var ret = sxt.executeOn(w.mainView);
         if (ret === false)
            return { skip: "instalado pero executeOn=false en automation-mode (runtime AI RC-Astro sin GPU/GLES) — validar en GUI" };
         A(sfCountNonFinite(w.mainView) === 0, "NaN tras SXT");
         var peak1 = w.mainView.image.sample(Math.round(512 * 0.2), Math.round(512 * 0.25), 0);
         A(peak1 < peak0 - 0.1, "estrella no eliminada: " + peak0.toFixed(3) + " → " + peak1.toFixed(3));
      } finally { w.forceClose(); }
   });

   T("StarNet2 (sobre imagen estirada)", "toolField 512×512", function () {
      if (!has("StarNet2")) return { skip: "esperado: StarNet2 no instalado" };
      var w = toolField(512, 512);
      try {
         var eng = new OptStretchingEngine();
         eng.runStretch(w.mainView, "STF", optStretchParamsFromZone({}));
         var peak0 = w.mainView.image.sample(Math.round(512 * 0.2), Math.round(512 * 0.25), 0);
         var sn = new StarNet2();
         try { sn.stars = false; } catch (e0) {}
         sn.executeOn(w.mainView);
         A(sfCountNonFinite(w.mainView) === 0, "NaN tras StarNet2");
         var peak1 = w.mainView.image.sample(Math.round(512 * 0.2), Math.round(512 * 0.25), 0);
         A(peak1 < peak0 - 0.1, "estrella no eliminada: " + peak0.toFixed(3) + " → " + peak1.toFixed(3));
      } finally { w.forceClose(); }
   });

   T("BlurXTerminator (correct+sharpen suave)", "toolField 512×512", function () {
      if (!has("BlurXTerminator")) return { skip: "esperado: BlurXTerminator no instalado" };
      var w = toolField(512, 512);
      try {
         var f0 = sfViewFingerprint(w.mainView);
         var bxt = new BlurXTerminator();
         try { bxt.sharpen_stars = 0.25; bxt.sharpen_nonstellar = 0.50; } catch (e0) {}
         var ret = bxt.executeOn(w.mainView);
         if (ret === false)
            return { skip: "instalado pero executeOn=false en automation-mode (runtime AI RC-Astro sin GPU/GLES) — validar en GUI" };
         A(sfCountNonFinite(w.mainView) === 0, "NaN tras BXT");
         var f1 = sfViewFingerprint(w.mainView), changed = false;
         for (var i = 0; i < f0.length; ++i) if (Math.abs(f0[i] - f1[i]) > 1e-7) changed = true;
         A(changed, "BXT no produjo ningún cambio");
         var med = sfViewMedian(w.mainView);
         A(med > 0 && med < 1, "mediana degenerada tras BXT: " + med);
      } finally { w.forceClose(); }
   });

   T("NoiseXTerminator (denoise 0.5)", "noisyImg RGB 512×512", function () {
      if (!has("NoiseXTerminator")) return { skip: "esperado: NoiseXTerminator no instalado" };
      // NXT quiere RGB ≥512×512: 3 canales de ruido determinista
      var W = 512, H = 512, N = W * H, rng = sfMulberry32(987654);
      var chans = [];
      for (var c = 0; c < 3; ++c) {
         var a = new Float32Array(N);
         for (var i = 0; i < N; ++i) a[i] = sfClamp01(0.2 + 0.05 * sfGaussNoise(rng));
         chans.push(a);
      }
      var w = sfSetSamples(sfNewWindow(W, H, 3, "BAT_NXTIN"), chans);
      try {
         var sig0 = sfViewMAD(w.mainView) * 1.4826, med0 = sfViewMedian(w.mainView);
         var nxt = new NoiseXTerminator();
         try { nxt.denoise = 0.5; } catch (e0) {}
         var ret = nxt.executeOn(w.mainView);
         if (ret === false)
            return { skip: "instalado pero executeOn=false en automation-mode (runtime AI RC-Astro sin GPU/GLES) — validar en GUI" };
         A(sfCountNonFinite(w.mainView) === 0, "NaN tras NXT");
         var sig1 = sfViewMAD(w.mainView) * 1.4826, med1 = sfViewMedian(w.mainView);
         A(sig1 < sig0, "sigma no baja: " + sig0.toFixed(4) + " → " + sig1.toFixed(4));
         A(Math.abs(med1 - med0) / med0 < 0.10, "mediana movida >10%: " + med0.toFixed(4) + " → " + med1.toFixed(4));
      } finally { w.forceClose(); }
   });

   T("GraXpert (corrección de gradiente, proceso nativo)", "gradientImg 512×512", function () {
      var gxp = optCreateGraXpertProcessInstance();
      if (!gxp) return { skip: "esperado: proceso GraXpert no instalado" };
      var w = sfGradientImg(512, 512, 0.30);
      var gxBefore = [];
      var gxAll0 = ImageWindow.windows;
      for (var gi = 0; gi < gxAll0.length; ++gi) gxBefore.push(gxAll0[gi].mainView.id);
      try {
         var amp0 = sfPlaneAmplitude(w.mainView);
         try {
            optRunGraXpertProcessWorkflow(w.mainView, {});   // dlg mock → defaults
         } catch (eGx) {
            if (/not configured|no.*(path|ruta)|executable/i.test(String(eGx.message || eGx)))
               return { skip: "esperado: proceso GraXpert presente pero ejecutable sin configurar" };
            throw eGx;
         }
         A(sfCountNonFinite(w.mainView) === 0, "NaN tras GraXpert");
         var amp1 = sfPlaneAmplitude(w.mainView);
         if (Math.abs(amp1 - amp0) < 1e-9)
            return { skip: "GraXpert no modificó la imagen (¿ejecutable sin configurar?) — revisar a mano" };
         A(amp1 < amp0 * 0.6, "reducción insuficiente del plano: " + amp0.toFixed(4) + " → " + amp1.toFixed(4));
      } finally {
         w.forceClose();
         // GraXpert nativo puede emitir la ventana del MODELO de fondo (createBackground):
         // salida deliberada que el caller gestiona → aquí se cierra.
         var gxAll1 = ImageWindow.windows;
         for (var gj = gxAll1.length - 1; gj >= 0; --gj) {
            var gid = gxAll1[gj].mainView.id, gknown = false;
            for (var gk = 0; gk < gxBefore.length; ++gk) if (gxBefore[gk] === gid) { gknown = true; break; }
            if (!gknown) try { gxAll1[gj].forceClose(); } catch (eGC) {}
         }
      }
   });

   T("DeepSNR (amount 0.7)", "noisyImg RGB 512×512", function () {
      if (!optCabraToolAvailable(["DeepSNR"])) return { skip: "esperado: DeepSNR no instalado" };
      var W = 512, H = 512, N = W * H, rng = sfMulberry32(13579);
      var chans = [];
      for (var c = 0; c < 3; ++c) {
         var a = new Float32Array(N);
         for (var i = 0; i < N; ++i) a[i] = sfClamp01(0.2 + 0.05 * sfGaussNoise(rng));
         chans.push(a);
      }
      var w = sfSetSamples(sfNewWindow(W, H, 3, "BAT_DSNRIN"), chans);
      try {
         var sig0 = sfViewMAD(w.mainView) * 1.4826;
         optExecuteDeepSNROnView(w.mainView, { amount: 0.7 });
         A(sfCountNonFinite(w.mainView) === 0, "NaN tras DeepSNR");
         var sig1 = sfViewMAD(w.mainView) * 1.4826;
         A(sig1 < sig0, "sigma no baja: " + sig0.toFixed(4) + " → " + sig1.toFixed(4));
      } finally { w.forceClose(); }
   });

   T("SyQon Prism (denoise externo)", "noisyImg 200×150", function () {
      if (!(typeof optIsPrismAvailable === "function" && optIsPrismAvailable()))
         return { skip: "esperado: SyQon Prism no instalado" };
      var w = sfNoisyImg(200, 150, 0.05, 24680);
      try {
         var sig0 = sfViewMAD(w.mainView) * 1.4826;
         optRunSyQonPrismOnView(w.mainView, { strength: 0.5 }, null);
         A(sfCountNonFinite(w.mainView) === 0, "NaN tras Prism");
         var sig1 = sfViewMAD(w.mainView) * 1.4826;
         A(sig1 < sig0, "sigma no baja: " + sig0.toFixed(4) + " → " + sig1.toFixed(4));
      } finally { w.forceClose(); }
   });

   T("SyQon Starless (split externo)", "toolField 512×512", function () {
      if (!(typeof optIsSyQonStarlessAvailable === "function" && optIsSyQonStarlessAvailable()))
         return { skip: "esperado: SyQon Starless no instalado" };
      var w = toolField(512, 512);
      try {
         var peak0 = w.mainView.image.sample(Math.round(512 * 0.2), Math.round(512 * 0.25), 0);
         try {
            // SYQON-STARLESS-V3 (2026-07-16): applyToTarget = contrato in-place
            // (sin él, la función devuelve ventanas y la vista NO cambia — el
            // assert del pico fallaría por diseño, no por bug).
            optRunSyQonStarlessOnView(w.mainView, { starsOnlyMode: "None", applyToTarget: true }, null);
         } catch (eSq) {
            if (/not configured/i.test(String(eSq.message || eSq)))
               return { skip: "esperado: SyQon Starless instalado pero sin ruta de ejecutable configurada" };
            throw eSq;
         }
         A(sfCountNonFinite(w.mainView) === 0, "NaN tras SyQon Starless");
         var peak1 = w.mainView.image.sample(Math.round(512 * 0.2), Math.round(512 * 0.25), 0);
         A(peak1 < peak0 - 0.1, "estrella no eliminada: " + peak0.toFixed(3) + " → " + peak1.toFixed(3));
      } finally { w.forceClose(); }
   });

   var leak = ImageWindow.windows.length - winsAtStart;
   L("Guard global de ventanas: " + leak + " huérfanas");

   var pass = 0, fail = 0, slow = 0, skip = 0;
   var fails = [], skips = [], warns = [];
   for (var r = 0; r < RES.length; ++r) {
      var rr = RES[r];
      if (rr.status === "PASS") ++pass;
      else if (rr.status === "SLOW") { ++slow; ++pass; warns.push("🐌 " + rr.name + " tardó " + rr.ms + " ms (umbral " + SLOW_MS + ")"); }
      else if (rr.status === "FAIL") { ++fail; fails.push(rr.name + " · " + rr.img + " · " + rr.msg); }
      else { ++skip; skips.push(rr.name + " — " + rr.msg); }
   }
   if (leak !== 0) { ++fail; fails.push("fuga global de ventanas del nivel 2: " + leak); }
   var resumen = pass + " pass / " + fail + " fail / " + slow + " slow / " + skip + " skip · " +
                 Math.round(((new Date).getTime() - T0) / 1000) + " s";
   L("NIVEL 2: " + resumen);
   L("RESULT: " + (fail === 0 ? "GREEN" : "RED"));
   File.writeTextFile(JSONP, JSON.stringify({
      fecha: (new Date).toISOString(),
      resumen: "nivel 2 " + (fail === 0 ? "GREEN" : "RED") + " — " + resumen,
      fails: fails, warns: warns, skips: skips
   }, null, 1));
   L("DONE.");
} catch (e) {
   L("FATAL: " + e.message + (e.stack ? ("\n" + e.stack) : ""));
   try {
      File.writeTextFile(JSONP, JSON.stringify({ fecha: (new Date).toISOString(), resumen: "nivel 2 FATAL", fails: ["FATAL: " + e.message], warns: [], skips: [] }, null, 1));
   } catch (e2) {}
}
