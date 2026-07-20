#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"
#include "synth_factory.jsh"

// =============================================================================
// battery_suite.js — BATERÍA DE TESTS PI Workflow (Nivel 1: motor PJSR).
// Plan: PLAN_BATERIA_TESTS.md §PLAN EJECUTABLE (2026-07-08).
// Ejecuta los packs P1..P12 sobre la matriz sintética (synth_factory.jsh),
// cronometra cada test, escribe log incremental (battery_suite.log) y genera
// battery_report.md (solo lo malo arriba; resumen + apéndice completo),
// integrando los JSON de nivel 0 (battery_level0.json) y nivel 2
// (battery_tools_smoke.json) si existen.
// Invariantes globales de TODO test: no lanza excepción · sin NaN/Inf ·
// mediana en (0,1) · no filtra ventanas · duración registrada.
// Ejecución:
//   "C:\Program Files\PixInsight\bin\PixInsight.exe" -n=152 --automation-mode
//     -r=".../_tests/battery_suite.js" --force-exit
// =============================================================================

var DIR      = "C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_200/_tests/";
var LOG      = DIR + "battery_suite.log";
var REPORT   = DIR + "battery_report.md";
var SLOW_MS  = 20000;            // umbral (caracol) por test
var TOTAL_WARN_MS = 5 * 60000;   // WARN si el nivel 1 completo pasa de 5 min

// Emoji caracol construido con surrogates (fuente ASCII puro: PJSR corrompe los
// literales UTF-8 de 4 bytes del fichero fuente).
var EMOJI_SNAIL = String.fromCharCode(0xD83D, 0xDC0C);

// Codificador UTF-8 manual: File.writeTextFile corrompe los pares surrogate
// (🐌 salía como otro emoji) y `new ByteArray(str)` trunca a bytes. Verificado
// con sonda 2026-07-08: esta ruta produce los 4 bytes F0 9F 90 8C correctos.
function utf8ByteArrayFromString(str) {
   var ba = new ByteArray(0);
   function push(b) { var one = new ByteArray(1); one.at(0, b); ba.add(one); }
   for (var i = 0; i < str.length; ++i) {
      var c = str.charCodeAt(i);
      if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length) {
         var lo = str.charCodeAt(i + 1);
         if (lo >= 0xDC00 && lo <= 0xDFFF) { c = 0x10000 + ((c - 0xD800) << 10) + (lo - 0xDC00); ++i; }
      }
      if (c < 0x80) push(c);
      else if (c < 0x800) { push(0xC0 | (c >> 6)); push(0x80 | (c & 63)); }
      else if (c < 0x10000) { push(0xE0 | (c >> 12)); push(0x80 | ((c >> 6) & 63)); push(0x80 | (c & 63)); }
      else { push(0xF0 | (c >> 18)); push(0x80 | ((c >> 12) & 63)); push(0x80 | ((c >> 6) & 63)); push(0x80 | (c & 63)); }
   }
   return ba;
}

// ---- log incremental (patrón L() del regression: sobrevive a crashes) -------
var B = "";
function L(s) { B += String(s) + "\n"; try { File.writeTextFile(LOG, B); } catch (e) {} }

// ---- registro de resultados --------------------------------------------------
var RES = [];        // {pack, name, img, ms, status, msg}
var T0 = (new Date).getTime();

function A(cond, msg) { if (!cond) throw new Error(msg); }

// Ejecuta un test: cronómetro + try/catch + guard de fuga de ventanas.
// fn puede devolver {skip:"motivo"} para SKIP limpio; si lanza → FAIL.
function T(pack, name, img, fn) {
   var before = ImageWindow.windows.length;
   var t0 = (new Date).getTime(), status = "PASS", msg = "";
   try {
      var r = fn();
      if (r && r.skip) { status = "SKIP"; msg = r.skip; }
   } catch (e) {
      status = "FAIL"; msg = String(e.message || e);
   }
   var ms = (new Date).getTime() - t0;
   var leak = ImageWindow.windows.length - before;
   if (leak !== 0) {
      // cierre defensivo de huérfanas para no contaminar los tests siguientes
      try {
         var wins = ImageWindow.windows;
         for (var i = wins.length - 1; i >= before; --i) { try { wins[i].forceClose(); } catch (e2) {} }
      } catch (e3) {}
      if (status === "PASS") { status = "FAIL"; msg = "fuga de ventanas: " + leak; }
      else msg += " · fuga de ventanas: " + leak;
   }
   if (status === "PASS" && ms > SLOW_MS) status = "SLOW";
   RES.push({ pack: pack, name: name, img: img, ms: ms, status: status, msg: msg });
   L("  " + status + " [" + pack + "] " + name + " (" + img + ") " + ms + " ms" + (msg ? " — " + msg : ""));
}

// Hallazgos de construcción (van a la sección de avisos del reporte).
var HALLAZGOS = [
   "HALLAZGO Nº1 — DeepSNR se añadió al registro (OPT_ALGO_MENUS, postNR) sin recapturar el baseline del " +
   "regression ni anotarlo en README_DEV_200.md (los checks session_capture/session_roundtrip pasaron a 38 " +
   "algos vs 37 del baseline → RED). Drift exactamente del tipo que el nivel 0 anti-drift debe cazar. " +
   "Baseline recapturado 2026-07-08 con autorización (backup: regression_baseline_pre_deepsnr.json.bak); " +
   "diff verificado: SOLO cambiaron los conteos de sesión, ningún fingerprint matemático.",
   "HALLAZGO Nº2 — [RESUELTO 2026-07-08, build 28] DeepSNR incumplía el sitio 5 de la convención (help): " +
   "no estaba documentado en PI Workflow_help.xhtml ni en PI Workflow_help_es.xhtml. Detectado por el nivel 0. " +
   "Corregido: fila DeepSNR en la tabla §6.1 de ambos help (EN+ES) + encabezado/intro/TOC actualizados a 6 motores. " +
   "El nivel 0 (DeepSNR sitio 5 EN/ES) debe pasar a PASS.",
   "HALLAZGO Nº3 — [RESUELTO 2026-07-08, build 28] Los wrappers de las tools RC-Astro/IA ignoraban el retorno de " +
   "executeOn: cuando SXT/BXT/NXT/DeepSNR fallan sin excepción (executeOn devuelve false, p.ej. runtime IA sin GPU " +
   "en automation-mode), continuaban en silencio con la imagen SIN modificar. Corregido: nuevo helper " +
   "optAssertExecuteOk(ret, tool) en utils.js aplicado en optCabraStarless (SXT), optExecuteBlurXConfiguredOnView (BXT), " +
   "optExecuteNoiseXConfiguredOnView (NXT) y optExecuteDeepSNROnView (DeepSNR) — ahora lanzan si ret===false. Esto además " +
   "REPARA las cadenas de fallback de CabraMagic (deconv/denoise/star-split), que ya usaban try/catch esperando que " +
   "lanzaran y por tanto nunca avanzaban al siguiente motor en headless.",
   "HALLAZGO Nº4 — [RESUELTO 2026-07-08, build 29] StarNet2 (cabramagic.js:1173, dentro de optCabraMakeStarless) tenía " +
   "el MISMO fallo silencioso que el Nº3 pero quedó fuera del build 28 (no es RC-Astro ni DeepSNR): devolvia \"StarNet2\" " +
   "aunque executeOn devolviera false. Corregido con optAssertExecuteOk; al estar dentro del try/catch de la cadena de " +
   "fallback, ahora un fallo real cae a null (sin motor) en vez de afirmar exito. Portado a Dev_200 y RELEASE_2.0_RC1."
];

// ---- generador de battery_report.md ------------------------------------------
function writeReport() {
   var pass = 0, fail = 0, slow = 0, skip = 0;
   for (var i = 0; i < RES.length; ++i) {
      var r = RES[i];
      if (r.status === "PASS") ++pass;
      else if (r.status === "FAIL") ++fail;
      else if (r.status === "SLOW") { ++slow; ++pass; }  // SLOW cuenta como pass lento
      else if (r.status === "SKIP") ++skip;
   }
   var totalMs = (new Date).getTime() - T0;

   // resultados de nivel 0 y nivel 2 (si sus JSON existen, se integran)
   var extra = { fails: [], warns: [], skips: [], resumen: [] };
   function mergeJson(path, label) {
      try {
         if (!File.exists(path)) return;
         var j = JSON.parse(File.readTextFile(path));
         if (j.fails) for (var a = 0; a < j.fails.length; ++a) extra.fails.push("[" + label + "] " + j.fails[a]);
         if (j.warns) for (var b = 0; b < j.warns.length; ++b) extra.warns.push("[" + label + "] " + j.warns[b]);
         if (j.skips) for (var c = 0; c < j.skips.length; ++c) extra.skips.push("[" + label + "] " + j.skips[c]);
         if (j.resumen) extra.resumen.push("[" + label + "] " + j.resumen);
      } catch (e) { extra.warns.push("[" + label + "] no pude leer su JSON: " + e.message); }
   }
   mergeJson(DIR + "battery_level0.json", "nivel 0");
   mergeJson(DIR + "battery_tools_smoke.json", "nivel 2");

   var red = (fail > 0 || extra.fails.length > 0);
   var d = new Date();
   var fecha = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
   var build = (typeof OPT_BUILD !== "undefined") ? OPT_BUILD : "?";
   var M = "";
   M += "# Batería PI Workflow — " + fecha + " · build " + build + " · RESULTADO: " + (red ? "RED" : "GREEN") + "\n\n";

   M += "## ❌ Falla (test · imagen · qué se esperaba vs qué salió)\n";
   var anyF = false;
   for (var f = 0; f < RES.length; ++f)
      if (RES[f].status === "FAIL") {
         anyF = true;
         M += "- `" + RES[f].pack + " / " + RES[f].name + "` · " + RES[f].img + " · " + RES[f].msg + "\n";
      }
   for (var f2 = 0; f2 < extra.fails.length; ++f2) { anyF = true; M += "- " + extra.fails[f2] + "\n"; }
   if (!anyF) M += "- (ninguna)\n";

   M += "\n## " + EMOJI_SNAIL + " Demasiado lento (test · duración · umbral)\n";
   var anyS = false;
   for (var s = 0; s < RES.length; ++s)
      if (RES[s].status === "SLOW") {
         anyS = true;
         M += "- `" + RES[s].pack + " / " + RES[s].name + "` · " + RES[s].ms + " ms · umbral " + SLOW_MS + " ms\n";
      }
   if (totalMs > TOTAL_WARN_MS) { anyS = true; M += "- WARN: el nivel 1 completo tardó " + Math.round(totalMs / 1000) + " s (> 5 min objetivo)\n"; }
   if (!anyS) M += "- (ninguno)\n";

   M += "\n## ⚠️ Erróneo / no llegó a nada (excepciones, SKIPs inesperados, resultados vacíos)\n";
   var anyW = false;
   for (var w = 0; w < RES.length; ++w)
      if (RES[w].status === "SKIP" && RES[w].msg.indexOf("esperado") < 0) {
         anyW = true;
         M += "- SKIP inesperado: `" + RES[w].pack + " / " + RES[w].name + "` · " + RES[w].msg + "\n";
      }
   for (var w2 = 0; w2 < extra.warns.length; ++w2) { anyW = true; M += "- " + extra.warns[w2] + "\n"; }
   for (var h = 0; h < HALLAZGOS.length; ++h) { anyW = true; M += "- " + HALLAZGOS[h] + "\n"; }
   if (!anyW) M += "- (nada)\n";

   M += "\n## ✅ Resumen: " + pass + " pass / " + fail + " fail / " + slow + " slow / " + skip + " skip · tiempo total " +
        Math.round(totalMs / 1000) + " s (nivel 1)\n";
   for (var r2 = 0; r2 < extra.resumen.length; ++r2) M += "- " + extra.resumen[r2] + "\n";
   if (extra.skips.length) {
      M += "- SKIPs esperados de otros niveles:\n";
      for (var k = 0; k < extra.skips.length; ++k) M += "  - " + extra.skips[k] + "\n";
   }

   M += "\n## Apéndice: tabla completa test × imagen × ms × estado\n";
   M += "| Pack | Test | Imagen | ms | Estado | Nota |\n|---|---|---|---:|---|---|\n";
   for (var t = 0; t < RES.length; ++t) {
      var rr = RES[t];
      M += "| " + rr.pack + " | " + rr.name + " | " + rr.img + " | " + rr.ms + " | " + rr.status +
           " | " + (rr.msg || "") + " |\n";
   }
   M += "\n_Generado por battery_suite.js · SLOW_MS=" + SLOW_MS + " · " + d.toISOString() + "_\n";
   try { File.writeFile(REPORT, utf8ByteArrayFromString(M)); } catch (e) { L("ERROR escribiendo reporte: " + e.message); }
}

// =============================================================================
// PACKS
// =============================================================================

// ---- P0 — semillas: sanity de la propia fábrica (fase 1) --------------------
function packP0() {
   L("== P0 fábrica sintética ==");

   T("P0", "rgbLinear básica", "rgbLinear", function () {
      var w = sfRgbLinear(96, 72);
      try {
         A(w.mainView.image.numberOfChannels === 3, "esperaba 3 canales");
         A(w.mainView.image.width === 96 && w.mainView.image.height === 72, "dimensiones 96×72");
         var med = sfCheckInvariants(w.mainView);
         A(med > 0.05 && med < 0.5, "mediana en rango lineal esperado (0.05,0.5), salió " + med);
      } finally { w.forceClose(); }
   });

   T("P0", "determinismo (2 llamadas idénticas)", "rgbLinear+noisy", function () {
      var w1 = sfRgbLinear(64, 48), w2 = sfRgbLinear(64, 48);
      var n1 = sfNoisyImg(64, 48, 0.05, 12345), n2 = sfNoisyImg(64, 48, 0.05, 12345);
      try {
         var f1 = sfViewFingerprint(w1.mainView), f2 = sfViewFingerprint(w2.mainView);
         for (var i = 0; i < f1.length; ++i) A(f1[i] === f2[i], "rgbLinear no determinista en [" + i + "]");
         var g1 = sfViewFingerprint(n1.mainView), g2 = sfViewFingerprint(n2.mainView);
         for (var j = 0; j < g1.length; ++j) A(g1[j] === g2[j], "noisyImg no determinista en [" + j + "]");
      } finally { w1.forceClose(); w2.forceClose(); n1.forceClose(); n2.forceClose(); }
   });

   T("P0", "ground truth (k, sigma, gradiente, límites)", "matriz", function () {
      var pair = sfLineContinuumPair(120, 90, 0.7);
      var noisy = sfNoisyImg(160, 120, 0.05, 777);
      var grad = sfGradientImg(128, 96, 0.30);
      var sat = sfSaturatedImg(64, 48), dark = sfNearBlackImg(64, 48), tiny = sfTinyImg();
      try {
         // par línea+continuo: el centro del NB (emisión) supera al continuo
         var nbC = pair.nbWin.mainView.image.sample(60, 45, 0), ctC = pair.ctWin.mainView.image.sample(60, 45, 0);
         A(nbC > ctC + 0.1, "emisión NB no destaca sobre continuo: nb=" + nbC + " ct=" + ctC);
         // ruidosa: MAD·1.4826 ≈ sigma pedida (tol 20%)
         var sig = sfViewMAD(noisy.mainView) * 1.4826;
         A(Math.abs(sig - 0.05) < 0.05 * 0.20, "sigma medida " + sig + " vs 0.05 pedida");
         // gradiente: amplitud del plano ≈ slope·0.9 (banda 10% a cada lado)
         var amp = sfPlaneAmplitude(grad.mainView);
         A(amp > 0.20 && amp < 0.32, "amplitud plano " + amp + " vs ~0.27 esperada");
         // límites
         A(sfViewMedian(sat.mainView) >= 0.999, "saturada: mediana debería ser ~1.0");
         A(sfViewMedian(dark.mainView) < 0.001, "casi negra: mediana debería ser <0.001");
         A(tiny.mainView.image.width === 16, "tiny 16×16");
         A(sfCountNonFinite(pair.nbWin.mainView) === 0 && sfCountNonFinite(grad.mainView) === 0, "NaN en fábrica");
      } finally {
         pair.nbWin.forceClose(); pair.ctWin.forceClose();
         noisy.forceClose(); grad.forceClose(); sat.forceClose(); dark.forceClose(); tiny.forceClose();
      }
   });
}

// ---- P2 — stretches ×5 (STF / MAS / SS / AGHS / Curves) ---------------------
// Sobre rgbLinear y nearBlack. Asserts: mediana sube (lineal → no lineal),
// monotonía aproximada (estrella sigue ≥ fondo), sin clipping total, invariantes.
function packP2() {
   L("== P2 stretches ==");
   var eng = new OptStretchingEngine();
   var hasMAS = false; try { hasMAS = (typeof MultiscaleAdaptiveStretch !== "undefined"); } catch (e) {}
   var imgs = [
      { name: "rgbLinear", mk: function () { return sfRgbLinear(96, 72); } },
      { name: "nearBlack", mk: function () { return sfNearBlackImg(96, 72); } }
   ];
   var algos = ["STF", "MAS", "SS", "AGHS", "CURVES"];
   for (var ii = 0; ii < imgs.length; ++ii) (function (im) {
      for (var aa = 0; aa < algos.length; ++aa) (function (algo) {
         T("P2", "stretch " + algo, im.name, function () {
            if (algo === "MAS" && !hasMAS) return { skip: "esperado: MultiscaleAdaptiveStretch no instalado" };
            var w = im.mk();
            try {
               var med0 = sfViewMedian(w.mainView);
               // monotonía: estrella (0,0) vs fondo (5,3) en canal 0
               var s0 = w.mainView.image.sample(0, 0, 0), b0 = w.mainView.image.sample(5, 3, 0);
               if (algo === "CURVES")
                  optApplyCurvesFromState(w.mainView, 0, { K: [[0, 0], [0.25, 0.60], [1, 1]] }, { saturation: 1.0 });
               else
                  eng.runStretch(w.mainView, algo, optStretchParamsFromZone({}));
               var med1 = sfCheckInvariants(w.mainView);
               A(med1 > med0, "mediana no sube: antes " + med0 + " → después " + med1);
               A(med1 < 0.95, "clipping casi total: mediana " + med1);
               var s1 = w.mainView.image.sample(0, 0, 0), b1 = w.mainView.image.sample(5, 3, 0);
               if (s0 > b0) A(s1 >= b1 - 1e-4, "monotonía rota: estrella " + s1 + " < fondo " + b1);
            } finally { w.forceClose(); }
         });
      })(algos[aa]);
   })(imgs[ii]);
}

// ---- P3 — continuum subtraction (k conocido + rama compacta) ----------------
function packP3() {
   L("== P3 continuum subtraction ==");
   var ks = [0.7, 1.3];
   for (var ki = 0; ki < ks.length; ++ki) (function (k) {
      T("P3", "estimador recupera k=" + k, "lineContinuumPair", function () {
         var p = sfLineContinuumPair(120, 90, k);
         try {
            var est = optEstimateContinuumK(p.nbWin.mainView, p.ctWin.mainView, "");
            A(est && isFinite(est.k), "el estimador no devolvió k finito");
            A(Math.abs(est.k - k) / k <= 0.15, "k estimado " + est.k.toFixed(4) + " vs " + k + " inyectado (tol 15%)");
         } finally { p.nbWin.forceClose(); p.ctWin.forceClose(); }
      });
   })(ks[ki]);

   T("P3", "resta: emisión conservada, estrellas eliminadas, sin negativos", "lineContinuumPair k=0.7", function () {
      var p = sfLineContinuumPair(120, 90, 0.7), res = null;
      try {
         var est = optEstimateContinuumK(p.nbWin.mainView, p.ctWin.mainView, "");
         res = optRunContinuumSubtraction(p.nbWin.mainView, p.ctWin.mainView, { k: est.k, line: "", floor: 0.0 });
         A(res && res.image, "la resta no devolvió vista");
         A(sfCountNonFinite(res) === 0, "NaN/Inf en el resultado");
         var mn = res.image.minimum();
         A(mn >= 0, "negativo masivo: min " + mn);
         var emCentro = res.image.sample(60, 45, 0);               // blob de emisión (solo NB)
         A(emCentro > 0.30, "emisión perdida: centro " + emCentro + " (esperaba >0.30)");
         var star = res.image.sample(Math.round(120 * 0.25), Math.round(90 * 0.28), 0);  // estrella inyectada
         var bg = res.image.sample(5, 80, 0);
         A(star < bg + 0.10, "estrella no restada: " + star + " vs fondo " + bg);
      } finally {
         if (res) try { optCloseView(res); } catch (e) { try { res.window.forceClose(); } catch (e2) {} }
         p.nbWin.forceClose(); p.ctWin.forceClose();
      }
   });

   T("P3", "decisión rama compacta (índice de concentración)", "compacta vs extendida", function () {
      // compacta: perfil galaxia = núcleo brillante concentrado + halo débil extenso.
      // C = 5·log10(r80/r20) (Conselice/Lotz): una gaussiana pura satura en C≈2.1;
      // el núcleo+halo concentra el 20% del flujo en r pequeño → C ≥ 3 → resta CON estrellas.
      var W = 160, H = 120, N = W * H, a = new Float32Array(N);
      for (var y = 0; y < H; ++y) for (var x = 0; x < W; ++x) {
         var dx = x - 80, dy = y - 60, r2 = dx * dx + dy * dy;
         a[y * W + x] = sfClamp01(0.02 + 0.9 * Math.exp(-(r2 / (2 * 2.5 * 2.5)))
                                       + 0.04 * Math.exp(-(r2 / (2 * 20 * 20))));
      }
      var wC = sfSetSamples(sfNewWindow(W, H, 1, "BAT_COMPACT"), [a]);
      var p = sfLineContinuumPair(120, 90, 0.7);   // su NB tiene el blob ANCHO (extendida)
      try {
         var ciC = optCabraAnalyze(wC.mainView).concentrationIndex;
         var ciE = optCabraAnalyze(p.nbWin.mainView).concentrationIndex;
         A(isFinite(ciC) && isFinite(ciE), "índices no finitos: C=" + ciC + " E=" + ciE);
         A(ciC >= 3.0, "objeto compacto NO dispararía la rama compacta (C=" + ciC + " < 3.0 → r.compact vacío)");
         A(ciE < 3.0, "nebulosa extendida dispararía la rama compacta por error (C=" + ciE + " ≥ 3.0)");
      } finally { wC.forceClose(); p.nbWin.forceClose(); p.ctWin.forceClose(); }
   });
}

// ---- P1 — combinación de canales (RGB / HOO / SHO / FORAXX) -----------------
function packP1() {
   L("== P1 combinación de canales ==");

   T("P1", "RGB desde 3 monos (optCreateRgbFromChannels)", "monoChannel×3", function () {
      var r = sfMonoChannel(96, 72, 1), g = sfMonoChannel(96, 72, 2), b = sfMonoChannel(96, 72, 3);
      var rgb = null;
      try {
         rgb = optCreateRgbFromChannels(r.mainView, g.mainView, b.mainView, "BAT_RGBCOMB", r.mainView);
         A(rgb && rgb.image, "no devolvió vista");
         A(rgb.image.numberOfChannels === 3, "esperaba 3 canales, hay " + rgb.image.numberOfChannels);
         A(rgb.image.width === 96 && rgb.image.height === 72, "dimensiones incorrectas");
         A(sfCountNonFinite(rgb) === 0, "NaN en el resultado");
         // cada canal del RGB debe ser EXACTAMENTE el mono correspondiente
         A(Math.abs(sfChannelMedian(rgb, 0) - sfViewMedian(r.mainView)) < 1e-6, "canal R ≠ mono R");
         A(Math.abs(sfChannelMedian(rgb, 1) - sfViewMedian(g.mainView)) < 1e-6, "canal G ≠ mono G");
         A(Math.abs(sfChannelMedian(rgb, 2) - sfViewMedian(b.mainView)) < 1e-6, "canal B ≠ mono B");
      } finally {
         if (rgb) try { rgb.window.forceClose(); } catch (e) {}
         r.forceClose(); g.forceClose(); b.forceClose();
      }
   });

   var palettes = [
      { name: "HOO", withS: false, map: function (mH, mO, mS) { return [mH, mO, mO]; } },
      { name: "SHO", withS: true, map: function (mH, mO, mS) { return [mS, mH, mO]; } },
      { name: "FORAXX", withS: true, map: null },   // dinámica: solo invariantes
      { name: "FORAXX", withS: false, map: null }   // degradación HOO dinámica sin SII
   ];
   for (var pi = 0; pi < palettes.length; ++pi) (function (pal) {
      T("P1", "paleta " + pal.name + (pal.withS ? " (H+O+S)" : " (H+O)"), "monoChannel(Ha/OIII/SII)", function () {
         var ha = sfMonoChannel(96, 72, 11), oiii = sfMonoChannel(96, 72, 12);
         var sii = pal.withS ? sfMonoChannel(96, 72, 13) : null;
         var out = null;
         try {
            out = optCabraCombinePalette(ha.mainView, oiii.mainView, sii ? sii.mainView : null,
               pal.name, "BAT_PAL_" + Math.floor(Math.random() * 1e6));
            A(out && out.image, "no devolvió vista");
            A(out.image.numberOfChannels === 3, "esperaba 3 canales");
            A(out.image.width === 96 && out.image.height === 72, "dimensiones incorrectas");
            A(sfCountNonFinite(out) === 0, "NaN en el resultado");
            A(out.image.minimum() >= 0 && out.image.maximum() <= 1, "fuera de [0,1]");
            if (pal.map) {
               var exp = pal.map(sfViewMedian(ha.mainView), sfViewMedian(oiii.mainView),
                                 sii ? sfViewMedian(sii.mainView) : 0);
               for (var c = 0; c < 3; ++c)
                  A(Math.abs(sfChannelMedian(out, c) - exp[c]) < 1e-6,
                    "canal " + c + ": mediana " + sfChannelMedian(out, c) + " vs " + exp[c] + " esperada");
            } else {
               var medOut = sfViewMedian(out);
               A(medOut > 0.01 && medOut < 0.9, "FORAXX: mediana global fuera de rango razonable: " + medOut);
            }
         } finally {
            if (out) try { out.window.forceClose(); } catch (e) {}
            ha.forceClose(); oiii.forceClose(); if (sii) sii.forceClose();
         }
      });
   })(palettes[pi]);
}

// ---- P4 — máscaras (rango ×3 modos, color, banda del mixer) -----------------
function packP4() {
   L("== P4 máscaras ==");
   function checkMask(mv, srcView, what) {
      A(mv && mv.image, what + ": no devolvió vista");
      A(mv.image.width === srcView.image.width && mv.image.height === srcView.image.height, what + ": dimensiones ≠ fuente");
      A(sfCountNonFinite(mv) === 0, what + ": NaN");
      var mn = mv.image.minimum(), mx = mv.image.maximum();
      A(mn >= 0 && mx <= 1, what + ": fuera de [0,1] (min " + mn + " max " + mx + ")");
      A(mx - mn > 0.05, what + ": máscara ~constante (min " + mn + " max " + mx + ")");
   }
   var modes = [{ idx: 0, n: "binaria" }, { idx: 1, n: "rango" }, { idx: 2, n: "brillo" }];
   for (var mi = 0; mi < modes.length; ++mi) (function (md) {
      T("P4", "máscara rango/luminancia modo " + md.n, "rgbLinear", function () {
         var w = sfRgbLinear(96, 72), mv = null;
         try {
            mv = optMakeMask(w.mainView, { type: "range", low: 0.10, high: 0.50, fuzz: 0.10, modeIdx: md.idx, smooth: 2 });
            checkMask(mv, w.mainView, "rango-" + md.n);
         } finally { if (mv) try { optCloseView(mv); } catch (e) {} w.forceClose(); }
      });
   })(modes[mi]);

   T("P4", "máscara de color (hue verde)", "rgbLinear", function () {
      var w = sfRgbLinear(96, 72), mv = null;
      try {
         mv = optMakeMask(w.mainView, { type: "color", hue: 120, hueRange: 60, satLow: 0.02, smooth: 2 });
         checkMask(mv, w.mainView, "color");
      } finally { if (mv) try { optCloseView(mv); } catch (e) {} w.forceClose(); }
   });

   T("P4", "máscara rango sobre campo de estrellas (selección de estrellas)", "starField", function () {
      var w = sfStarField(96, 72, 1.6, [[20, 20, 0.6, 0.55, 0.5], [50, 30, 0.5, 0.5, 0.55], [70, 55, 0.55, 0.5, 0.45], [30, 60, 0.6, 0.6, 0.6]]);
      var mv = null;
      try {
         mv = optMakeMask(w.mainView, { type: "range", low: 0.20, high: 1.0, fuzz: 0.05, modeIdx: 1, smooth: 1 });
         checkMask(mv, w.mainView, "estrellas-rango");
         // la máscara debe encender las estrellas y apagar el fondo
         A(mv.image.sample(20, 20, 0) > 0.5, "estrella no seleccionada: " + mv.image.sample(20, 20, 0));
         A(mv.image.sample(5, 5, 0) < 0.2, "fondo seleccionado: " + mv.image.sample(5, 5, 0));
      } finally { if (mv) try { optCloseView(mv); } catch (e) {} w.forceClose(); }
   });

   T("P4", "máscara de estrellas dedicada (motor de star split)", "starField", function () {
      // El tipo "estrellas" del Mask Maker está diferido a v2 (masks.js) y el split
      // real necesita SXT/StarNet2 → cubierto por el nivel 2 (battery_tools_smoke).
      return { skip: "esperado: star mask v2 diferida en masks.js; split real via SXT/StarNet2 → nivel 2" };
   });
}

// ---- P5 — Color Mixer (apply completo + identidad + máscaras por banda) -----
function packP5() {
   L("== P5 Color Mixer ==");

   T("P5", "apply sin trabajo == identidad", "rgbLinear", function () {
      var w = sfRgbLinear(96, 72);
      try {
         var f0 = sfViewFingerprint(w.mainView);
         optRunColorMixerOnView(w.mainView, optColorMixerDefaultState());   // sin ajustes
         var f1 = sfViewFingerprint(w.mainView);
         for (var i = 0; i < f0.length; ++i)
            A(Math.abs(f0[i] - f1[i]) < 1e-6, "estado por defecto alteró la imagen en [" + i + "]: " + f0[i] + " → " + f1[i]);
      } finally { w.forceClose(); }
   });

   T("P5", "apply completo (sat+hue+vib+lum en varias bandas)", "rgbLinear", function () {
      var w = sfRgbLinear(96, 72);
      try {
         var f0 = sfViewFingerprint(w.mainView);
         var st = optColorMixerDefaultState();
         st.bands[0].saturation = 50; st.bands[2].hueShift = 15;
         st.bands[4].vibrance = 40; st.bands[5].luminance = -20;
         st.globalStrength = 0.9;
         optRunColorMixerOnView(w.mainView, st);
         var med = sfCheckInvariants(w.mainView);
         var f1 = sfViewFingerprint(w.mainView), changed = false;
         for (var i = 0; i < f0.length; ++i) if (Math.abs(f0[i] - f1[i]) > 1e-5) changed = true;
         A(changed, "el apply con trabajo no cambió nada");
         A(med > 0.05 && med < 0.6, "mediana fuera del rango esperable tras mixer: " + med);
      } finally { w.forceClose(); }
   });

   T("P5", "máscara por banda (las 8 bandas + global -1)", "hueStrips", function () {
      // franjas con el tono EXACTO del centro de cada banda → ninguna máscara
      // de banda puede salir vacía (rgbLinear no tiene verdes: no sirve aquí)
      var centers = [];
      for (var ci = 0; ci < OPT_CM_BAND_DEFS.length; ++ci) centers.push(OPT_CM_BAND_DEFS[ci].center);
      var w = sfHueStrips(160, 48, centers);
      try {
         var bandsToTest = [];
         for (var b0 = 0; b0 < OPT_CM_BAND_DEFS.length; ++b0) bandsToTest.push(b0);
         bandsToTest.push(-1);
         for (var bi = 0; bi < bandsToTest.length; ++bi) {
            var b = bandsToTest[bi], mv = null;
            try {
               var st = optColorMixerDefaultState();
               st.protectLowSat = false; st.protectStars = false;
               if (b >= 0) st.bands[b].saturation = 40; else st.bands[5].saturation = 40;
               mv = optBuildColorMixerMaskView(w.mainView, st, b);
               A(mv && mv.image, "banda " + b + ": sin vista");
               A(sfCountNonFinite(mv) === 0, "banda " + b + ": NaN");
               var mn = mv.image.minimum(), mx = mv.image.maximum();
               A(mn >= 0 && mx <= 1, "banda " + b + ": fuera de [0,1]");
               A(mx > 0.1, "banda " + b + " (" + (b >= 0 ? OPT_CM_BAND_DEFS[b].id : "global") + "): máscara vacía (max " + mx + ")");
               A(mn < 0.5, "banda " + b + ": máscara ~todo blanco (min " + mn + ")");
            } finally { if (mv) try { optCloseView(mv); } catch (e) {} }
         }
      } finally { w.forceClose(); }
   });
}

// ---- P6 — Detail & Contrast (9 algoritmos + extremos) -----------------------
function packP6() {
   L("== P6 Detail & Contrast ==");
   var algos = ["localContrast", "mmtTexture", "edgeAware", "hdrmt", "dse", "clahe", "sigmoid", "vibrance", "byObjectType"];
   for (var di = 0; di < algos.length; ++di) (function (algo) {
      T("P6", "detail " + algo + " (defaults)", "rgbLinear", function () {
         var w = sfRgbLinear(96, 72);
         try {
            var st = optDetailDefaultState(); st.algoId = algo;
            optRunDetailOnView(w.mainView, st);
            sfCheckInvariants(w.mainView);
         } finally { w.forceClose(); }
      });
   })(algos[di]);

   T("P6", "extremo: strength 0 ≈ identidad (localContrast/edgeAware)", "rgbLinear", function () {
      var pares = [["localContrast", "lcAmount"], ["edgeAware", "eaAmount"]];
      for (var i = 0; i < pares.length; ++i) {
         var w = sfRgbLinear(96, 72);
         try {
            var f0 = sfViewFingerprint(w.mainView);
            var st = optDetailDefaultState(); st.algoId = pares[i][0]; st[pares[i][1]] = 0;
            optRunDetailOnView(w.mainView, st);
            var f1 = sfViewFingerprint(w.mainView);
            for (var j = 0; j < f0.length; ++j)
               A(Math.abs(f0[j] - f1[j]) < 0.02, pares[i][0] + " strength 0 movió [" + j + "]: " + f0[j] + " → " + f1[j]);
         } finally { w.forceClose(); }
      }
   });

   T("P6", "extremo: strength máxima → sin NaN ni clipping total", "rgbLinear", function () {
      var maxes = [
        { algoId: "localContrast", lcAmount: 1.0, lcRadius: 120 },
        { algoId: "sigmoid", sigStrength: 10.0, sigBias: 0.5 },
        { algoId: "clahe", claTiles: 8, claClip: 4.0, claAmount: 1.0 },
        { algoId: "vibrance", vibAmount: 1.0 }
      ];
      for (var i = 0; i < maxes.length; ++i) {
         var w = sfRgbLinear(96, 72);
         try {
            var st = optDetailDefaultState();
            for (var kk in maxes[i]) st[kk] = maxes[i][kk];
            optRunDetailOnView(w.mainView, st);
            var med = sfCheckInvariants(w.mainView);
            A(med > 0.001 && med < 0.999, maxes[i].algoId + " max: mediana degenerada " + med);
         } finally { w.forceClose(); }
      }
   });
}

// ---- P7 — corrección de gradiente interna (ABE nativo; AutoDBE si está) -----
function packP7() {
   L("== P7 gradiente ==");

   T("P7", "ABE reduce el plano ≥50%", "gradientImg slope=0.30", function () {
      var w = sfGradientImg(128, 96, 0.30), out = null;
      try {
         var amp0 = sfPlaneAmplitude(w.mainView);
         out = optExecuteABEWorkflow(w.mainView, {});   // dlg mock: degree 1, subtract, in-place
         var amp1 = sfPlaneAmplitude(w.mainView);
         A(sfCountNonFinite(w.mainView) === 0, "NaN tras ABE");
         A(amp1 < amp0 * 0.5, "reducción insuficiente: " + amp0.toFixed(4) + " → " + amp1.toFixed(4) + " (esperaba ≥50%)");
      } finally {
         if (out && out.bkgView) try { out.bkgView.window.forceClose(); } catch (e) {}
         w.forceClose();
      }
   });

   T("P7", "AutoDBE (SetiAstro) reduce el plano", "gradientImg 512×384 slope=0.30", function () {
      if (!optIsAutoDBEAvailable())
         return { skip: "esperado: AutoDBE (SetiAstro) no disponible en este runtime" };
      // AutoDBE dimensiona su rejilla de muestras desde la imagen: con 128×96 el nº
      // de muestras cae por debajo de 1 (error "samples(): 0.5 out of range") → se
      // usa un tamaño realista mínimo.
      var w = sfGradientImg(512, 384, 0.30);
      var winsBefore = [];
      var all0 = ImageWindow.windows;
      for (var wi = 0; wi < all0.length; ++wi) winsBefore.push(all0[wi].mainView.id);
      try {
         var amp0 = sfPlaneAmplitude(w.mainView);
         optRunAutoDBEGradientCorrection(w.mainView, {});
         var amp1 = sfPlaneAmplitude(w.mainView);
         A(sfCountNonFinite(w.mainView) === 0, "NaN tras AutoDBE");
         A(amp1 < amp0 * 0.5, "reducción insuficiente: " + amp0.toFixed(4) + " → " + amp1.toFixed(4));
      } finally {
         w.forceClose();
         // la ventana del MODELO de fondo es salida deliberada de AutoDBE (en la GUI
         // se muestra con showModel:true); el caller la gestiona → aquí se cierra.
         var all1 = ImageWindow.windows;
         for (var wj = all1.length - 1; wj >= 0; --wj) {
            var id1 = all1[wj].mainView.id, known = false;
            for (var wk = 0; wk < winsBefore.length; ++wk) if (winsBefore[wk] === id1) { known = true; break; }
            if (!known) try { all1[wj].forceClose(); } catch (eC) {}
         }
      }
   });
}

// ---- P8 — denoise interno (TGV nativo) --------------------------------------
function packP8() {
   L("== P8 denoise ==");

   T("P8", "TGVDenoise baja sigma sin mover la mediana", "noisyImg σ=0.05", function () {
      var w = sfNoisyImg(160, 120, 0.05, 20260708);
      try {
         var med0 = sfViewMedian(w.mainView), sig0 = sfViewMAD(w.mainView) * 1.4826;
         optExecuteTgvDenoiseConfiguredOnView(w.mainView, {
            strengthL: 5.0, strengthC: 3.0, edgeProtection: 0.002, smoothness: 2.0, maxIterations: 100
         });
         var med1 = sfViewMedian(w.mainView), sig1 = sfViewMAD(w.mainView) * 1.4826;
         A(sfCountNonFinite(w.mainView) === 0, "NaN tras TGV");
         A(sig1 < sig0 * 0.7, "sigma no baja ≥30%: " + sig0.toFixed(4) + " → " + sig1.toFixed(4));
         A(Math.abs(med1 - med0) / med0 < 0.05, "mediana movida >5%: " + med0.toFixed(4) + " → " + med1.toFixed(4));
      } finally { w.forceClose(); }
   });

   T("P8", "star reduce interno (morfológico) atenúa estrellas, fondo estable", "starField", function () {
      var w = sfStarField(96, 72, 1.6, [[20, 20, 0.7, 0.65, 0.6], [50, 30, 0.6, 0.6, 0.65], [70, 55, 0.65, 0.6, 0.55]]);
      try {
         var peak0 = w.mainView.image.sample(20, 20, 0), bg0 = w.mainView.image.sample(5, 60, 0);
         optStarReduceOnView(w.mainView, 0.6, 2);
         var peak1 = w.mainView.image.sample(20, 20, 0), bg1 = w.mainView.image.sample(5, 60, 0);
         A(sfCountNonFinite(w.mainView) === 0, "NaN tras star reduce");
         A(peak1 < peak0 - 0.05, "estrella no reducida: " + peak0.toFixed(3) + " → " + peak1.toFixed(3));
         A(Math.abs(bg1 - bg0) < 0.02, "fondo alterado: " + bg0.toFixed(3) + " → " + bg1.toFixed(3));
      } finally { w.forceClose(); }
   });
}

// ---- P9 — export multi-formato + log embebido + sidecars --------------------
function packP9() {
   L("== P9 export + log + sidecars ==");
   var TMP = DIR + "_battery_tmp/";

   T("P9", "export tif/png/jpg/fits/xisf + tamaño >0", "rgbLinear 64×48", function () {
      try { if (!File.directoryExists(TMP)) File.createDirectory(TMP); } catch (e0) {}
      var w = sfRgbLinear(64, 48);
      var exts = ["tif", "png", "jpg", "fits", "xisf"];
      try {
         for (var i = 0; i < exts.length; ++i) {
            var p = TMP + "bat_export." + exts[i];
            var spec = optExportViewToFile(w.mainView, p);
            A(File.exists(p), exts[i] + ": fichero no creado");
            var bytes = File.readFile(p);
            A(bytes && bytes.length > 0, exts[i] + ": fichero vacío");
            A(spec && spec.format, exts[i] + ": sin spec de formato");
            try { File.remove(p); } catch (e1) {}
         }
      } finally { w.forceClose(); }
   });

   T("P9", "log embebido (keywords PIW en XISF reabierto)", "rgbLinear 64×48", function () {
      try { if (!File.directoryExists(TMP)) File.createDirectory(TMP); } catch (e0) {}
      var w = sfRgbLinear(64, 48), reopened = null;
      var p = TMP + "bat_log.xisf";
      try {
         var log = optProcLogBuild(w.mainView, null);
         A(log && log.text && log.text.length > 0, "optProcLogBuild no devolvió texto");
         optExportViewToFile(w.mainView, p, log.text);
         var arr = ImageWindow.open(p);
         A(arr && arr.length > 0, "no se pudo reabrir el XISF");
         reopened = arr[0];
         var kws = reopened.keywords, found = false;
         for (var i = 0; i < kws.length; ++i) {
            var k = kws[i];
            if ((String(k.value).indexOf("PIW") >= 0) || (String(k.comment).indexOf("PIW") >= 0) ||
                (String(k.name).indexOf("PIW") >= 0)) { found = true; break; }
         }
         A(found, "sin keywords PIW| embebidas en el XISF exportado (" + kws.length + " keywords)");
      } finally {
         if (reopened) try { reopened.forceClose(); } catch (e1) {}
         try { File.remove(p); } catch (e2) {}
         w.forceClose();
      }
   });

   T("P9", "sidecars .txt + _astrobin.csv", "rgbLinear 64×48", function () {
      try { if (!File.directoryExists(TMP)) File.createDirectory(TMP); } catch (e0) {}
      var w = sfRgbLinear(64, 48);
      var img = TMP + "bat_side.tif";
      try {
         var log = optProcLogBuild(w.mainView, null);
         optExportViewToFile(w.mainView, img, log.text);
         var out = optProcLogWriteSidecars(img, log.data, log.text);
         A(out.txtPath && File.exists(out.txtPath), "sidecar .txt no creado");
         A(out.csvPath && File.exists(out.csvPath), "sidecar _astrobin.csv no creado");
         var txt = File.readTextFile(out.txtPath);
         A(txt.length > 20, "sidecar .txt vacío");
         var csv = File.readTextFile(out.csvPath);
         A(csv.indexOf("date") >= 0 || csv.indexOf(",") >= 0, "csv sin cabecera AstroBin");
         try { File.remove(out.txtPath); } catch (e1) {}
         try { File.remove(out.csvPath); } catch (e2) {}
         try { File.remove(img); } catch (e3) {}
      } finally {
         w.forceClose();
         try { if (File.directoryExists(TMP)) File.removeDirectory(TMP); } catch (e4) {}
      }
   });
}

// ---- P10 — SSSC: fotometría sobre starField con colores CONOCIDOS -----------
function packP10() {
   L("== P10 SSSC starField ==");

   T("P10", "fotometría recupera ratios de color inyectados (tol 15%)", "starField σ=1.6", function () {
      // amplitudes con ratios conocidos: R/G y B/G por estrella (misma PSF → ratio flujo == ratio amp)
      var specs = [[20, 20, 0.60, 0.40, 0.20], [44, 28, 0.30, 0.50, 0.60], [16, 46, 0.50, 0.50, 0.50], [50, 50, 0.24, 0.40, 0.56]];
      var w = sfStarField(64, 64, 1.6, specs);
      try {
         var stars = [];
         for (var i = 0; i < specs.length; ++i) stars.push({ x: specs[i][0], y: specs[i][1] });
         optSSSCStarPhotometry(w.mainView, stars, { satLevel: 0.99 });
         var nOk = 0;
         for (var j = 0; j < stars.length; ++j) {
            if (!stars[j].ok) continue;
            ++nOk;
            var rgInj = specs[j][2] / specs[j][3], bgInj = specs[j][4] / specs[j][3];
            var rgMeas = stars[j].Rm / stars[j].Gm, bgMeas = stars[j].Bm / stars[j].Gm;
            A(Math.abs(rgMeas - rgInj) / rgInj < 0.15,
              "estrella " + j + ": R/G medido " + rgMeas.toFixed(3) + " vs " + rgInj.toFixed(3) + " inyectado");
            A(Math.abs(bgMeas - bgInj) / bgInj < 0.15,
              "estrella " + j + ": B/G medido " + bgMeas.toFixed(3) + " vs " + bgInj.toFixed(3) + " inyectado");
         }
         A(nOk >= 3, "solo " + nOk + "/4 estrellas medibles");
      } finally { w.forceClose(); }
   });
}

// ---- P11 — action-cards no-AI: AutoGHS variantes, post (USM/HDR/LHE), pre (ALF/BN), MAD-STF
function packP11() {
   L("== P11 AutoGHS / post / pre ==");

   T("P11", "AutoGHS saturación 0.92 + noise ceiling", "rgbLinear", function () {
      var w = sfRgbLinear(96, 72);
      try {
         var med0 = sfViewMedian(w.mainView);
         optRunAutoGhsStretch(w.mainView, { aghs_sigmas: 1.0, aghs_intensity: 0.7, aghs_iterations: 5, aghs_bp: 2.8, aghs_saturation: 0.92, aghs_noiseCeiling: 0.01 });
         var med1 = sfCheckInvariants(w.mainView);
         A(med1 > med0, "mediana no sube: " + med0 + " → " + med1);
      } finally { w.forceClose(); }
   });

   var posts = [
      { n: "UnsharpMask", fn: function (v) { return optExecuteUnsharpMaskConfiguredOnView(v, { sigma: 2.0, amount: 0.5, deringing: false, deringingDark: 0.1, deringingBright: 0.0 }); } },
      { n: "HDRMultiscaleTransform", fn: function (v) { return optExecuteHdrMtConfiguredOnView(v, { numberOfLayers: 6, numberOfIterations: 1, overdrive: 0.0, medianTransform: false, lightnessMask: true }); } },
      { n: "LocalHistogramEqualization", fn: function (v) { return optExecuteLheConfiguredOnView(v, { kernelRadius: 32, contrastLimit: 2.0, amount: 0.7, circularKernel: true }); } }
   ];
   for (var pi = 0; pi < posts.length; ++pi) (function (p) {
      T("P11", "post " + p.n + " (nativo, defaults)", "rgbLinear estirada", function () {
         var w = sfRgbLinear(96, 72);
         try {
            var eng = new OptStretchingEngine();
            eng.runStretch(w.mainView, "STF", optStretchParamsFromZone({}));   // los post esperan no lineal
            var f0 = sfViewFingerprint(w.mainView);
            p.fn(w.mainView);
            sfCheckInvariants(w.mainView);
            var f1 = sfViewFingerprint(w.mainView), changed = false;
            for (var i = 0; i < f0.length; ++i) if (Math.abs(f0[i] - f1[i]) > 1e-6) changed = true;
            A(changed, p.n + " no cambió nada");
         } finally { w.forceClose(); }
      });
   })(posts[pi]);

   T("P11", "pre Auto Linear Fit acerca las medianas de canal", "rgbLinear", function () {
      var w = sfRgbLinear(96, 72);
      try {
         function spread(v) {
            var m = [sfChannelMedian(v, 0), sfChannelMedian(v, 1), sfChannelMedian(v, 2)];
            return Math.max(m[0], m[1], m[2]) - Math.min(m[0], m[1], m[2]);
         }
         var s0 = spread(w.mainView);
         optRunAutoLinearFitWorkflow(w.mainView);
         var s1 = spread(w.mainView);
         A(sfCountNonFinite(w.mainView) === 0, "NaN tras ALF");
         A(s1 <= s0 + 1e-6, "dispersión de canales no mejora: " + s0.toFixed(4) + " → " + s1.toFixed(4));
      } finally { w.forceClose(); }
   });

   T("P11", "pre Background Neutralization neutraliza el fondo", "rgbLinear", function () {
      var w = sfRgbLinear(96, 72);
      try {
         optRunBackgroundNeutralization(w.mainView);
         sfCheckInvariants(w.mainView);
         var m = [sfChannelMedian(w.mainView, 0), sfChannelMedian(w.mainView, 1), sfChannelMedian(w.mainView, 2)];
         var sp = Math.max(m[0], m[1], m[2]) - Math.min(m[0], m[1], m[2]);
         A(sp < 0.05, "fondos no neutralizados: dispersión " + sp.toFixed(4));
      } finally { w.forceClose(); }
   });

   T("P11", "MAD auto-stretch del preview (Image suelta, uso de preview.js)", "rgbLinear", function () {
      // optApplyMadAutoStretch se usa en producción sobre COPIAS Image del preview
      // (engine/preview.js), no sobre view.image (una vista fuera de beginProcess
      // no es modificable → no-op silencioso; así se detectó aquí).
      var w = sfRgbLinear(96, 72), img = null;
      try {
         var src = w.mainView.image;
         img = new Image(src.width, src.height, src.numberOfChannels, src.colorSpace, 32, SampleType_Real);
         img.assign(src);
         var med0 = img.median();
         var okRet = optApplyMadAutoStretch(img, true);
         var med1 = img.median();
         A(okRet === true, "optApplyMadAutoStretch devolvió false (falló internamente)");
         A(med1 > med0, "mediana no sube: " + med0 + " → " + med1);
         A(med1 > 0.1 && med1 < 0.5, "mediana estirada fuera del target ~0.25: " + med1);
      } finally { if (img) try { img.free(); } catch (e) {} w.forceClose(); }
   });

   T("P11", "casos límite: AutoGHS y STF no rompen (saturada, tiny)", "saturada+tiny", function () {
      var s = sfSaturatedImg(64, 48), t = sfTinyImg();
      try {
         optRunAutoGhsStretch(s.mainView, { aghs_intensity: 0.7 });
         A(sfCountNonFinite(s.mainView) === 0, "NaN en saturada tras AutoGHS");
         var eng = new OptStretchingEngine();
         eng.runStretch(t.mainView, "STF", optStretchParamsFromZone({}));
         A(sfCountNonFinite(t.mainView) === 0, "NaN en tiny tras STF");
      } finally { s.forceClose(); t.forceClose(); }
   });
}

// ---- P12 — imágenes reales del usuario -------------------------------------
// Directorios candidatos, en orden de prioridad:
//   1) _tests/images/  (override local: recortes que el usuario deje ahí)
//   2) el repositorio de imágenes reales de CabraSpace (por defecto, 2026-07-08).
var REAL_IMG_DIRS = [
   DIR + "images/",
   "C:/Users/ninoc/Documents/PixInsight/CabraSpace/Pagina Web/Imagenes Prueba/"
];
// Subconjunto CURADO representativo (cubre las categorías del plan). Si un
// fichero no está, se salta esa entrada; así el pack no revienta si cambia el
// repositorio. Nombres relativos al directorio elegido.
var REAL_IMG_SET = [
   { file: "NGC1560_RGB_linear.xisf", cat: "rgb_linear", linear: true },
   { file: "NGC3184_RGB.xisf",        cat: "galaxia" },
   { file: "M13_RGB.xisf",            cat: "campo_estrellas" },
   { file: "Abell39_SHO.xisf",        cat: "nebulosa_SHO" },
   { file: "PK164_HSO.xisf",          cat: "nebulosa_HSO" },
   { file: "LDu2_RGB.xisf",           cat: "nebulosa_banda_ancha" },
   { file: "masterLight_BIN-1_6248x4176_EXPOSURE-300.00s_FILTER-H_mono_autocrop.xisf", cat: "mono_Ha_master" }
];
var REAL_CROP = 1024;   // recorte central máximo: acota el coste a un tamaño "recorte real"

// Abre una imagen grande, extrae el recorte central (<=REAL_CROP px por lado) a
// una ventana nueva y cierra la original de inmediato (acota RAM y tiempo de proceso).
function sfOpenRealCrop(path, maxSz) {
   // Los másters WBPP pueden ser XISF MULTI-IMAGEN (máster + mapas de rechazo/peso)
   // → cerrar TODAS las ventanas devueltas, no solo arr[0] (fuga cazada 2026-07-08).
   var arr = ImageWindow.open(path);
   if (!arr || !arr.length) throw new Error("no se pudo abrir");
   var win = arr[0];
   try {
      var im = win.mainView.image, W = im.width, H = im.height, nc = im.numberOfChannels;
      var cw = Math.min(maxSz, W), ch = Math.min(maxSz, H);
      var x0 = ((W - cw) / 2) | 0, y0 = ((H - ch) / 2) | 0;
      var src = new Rect(x0, y0, x0 + cw, y0 + ch), dst = new Rect(0, 0, cw, ch);
      var out = new ImageWindow(cw, ch, nc, 32, true, nc > 1, "REAL_" + Math.floor(Math.random() * 1e6));
      out.mainView.beginProcess(UndoFlag_NoSwapFile);
      var buf = new Float32Array(cw * ch);
      for (var c = 0; c < nc; ++c) { im.getSamples(buf, src, c); out.mainView.image.setSamples(buf, dst, c); }
      out.mainView.endProcess();
      return out;
   } finally { for (var wi = 0; wi < arr.length; ++wi) { try { arr[wi].forceClose(); } catch (eW) {} } }
}

function packP12() {
   L("== P12 imágenes reales ==");
   // Elige el primer directorio candidato que exista.
   var IMGDIR = null;
   for (var d = 0; d < REAL_IMG_DIRS.length; ++d)
      if (File.directoryExists(REAL_IMG_DIRS[d])) { IMGDIR = REAL_IMG_DIRS[d]; break; }
   if (!IMGDIR) {
      T("P12", "imágenes reales", "(ningún directorio)", function () {
         return { skip: "esperado: no existe ni _tests/images/ ni el repositorio CabraSpace" };
      });
      return;
   }
   L("  usando directorio: " + IMGDIR);

   // Construye la lista efectiva: primero el subconjunto curado que exista; si
   // ninguno del subconjunto está presente, cae a los primeros .xisf del directorio.
   var picks = [];
   for (var i = 0; i < REAL_IMG_SET.length; ++i)
      if (File.exists(IMGDIR + REAL_IMG_SET[i].file)) picks.push(REAL_IMG_SET[i]);
   if (picks.length === 0) {
      var ff = new FileFind(), n = 0;
      if (ff.begin(IMGDIR + "*.xisf")) { do { if (ff.isFile && n < 6) { picks.push({ file: ff.name, cat: "auto" }); ++n; } } while (ff.next()); }
   }
   if (picks.length === 0) {
      T("P12", "imágenes reales", IMGDIR, function () { return { skip: "esperado: el directorio no tiene .xisf" }; });
      return;
   }

   // Una fila por imagen: invariantes de P2 (STF) + P4 (máscara) sobre el recorte
   // real. Sin ground truth (imagen real): solo se comprueba que no rompe.
   for (var p = 0; p < picks.length; ++p) {
      (function (pick) {
         T("P12", "real: STF + máscara (" + pick.cat + ")", pick.file, function () {
            var w = sfOpenRealCrop(IMGDIR + pick.file, REAL_CROP);
            try {
               A(sfCountNonFinite(w.mainView) === 0, pick.file + ": NaN en el recorte de origen");
               var eng = new OptStretchingEngine();
               eng.runStretch(w.mainView, "STF", optStretchParamsFromZone({}));
               sfCheckInvariants(w.mainView);
               var mv = optMakeMask(w.mainView, { type: "range", low: 0.1, high: 0.9, fuzz: 0.1, modeIdx: 1, smooth: 2 });
               try { A(sfCountNonFinite(mv) === 0, pick.file + ": NaN en la máscara"); }
               finally { try { optCloseView(mv); } catch (e) {} }
            } finally { w.forceClose(); }
         });
      })(picks[p]);
   }
}

// ---- P14 — autoasignación de slots de "Load Image Files…" (build 32) --------
// Inferencia PURA nombre/FILTER → slot (engine/utils.js). El contrato de panel
// (solo rellenar slots en "None", solo modo activo) es UI y se valida en GUI
// (GUI_CHECKLIST.md); aquí se fija la tabla de mapeo para que no derive.
function packP14() {
   L("== P14 autoasignación de slots (inferencia pura) ==");

   T("P14", "sufijo de nombre → slot", "(tabla)", function () {
      var cases = [
         ["C1_HO.xisf", "HO"], ["c2_os.xisf", "OS"], ["C2_SO.fit", "OS"],
         ["M42_Ha.xisf", "H"], ["M42_H.xisf", "H"],
         ["M42_OIII.xisf", "O"], ["M42_O3.xisf", "O"], ["M42_O.xisf", "O"],
         ["M42_SII.xisf", "S"], ["M42_S2.xisf", "S"], ["M42_S.xisf", "S"],
         ["target_R.xisf", "R"], ["target_Red.tif", "R"],
         ["target_G.xisf", "G"], ["target_B.xisf", "B"],
         ["target_L.xisf", "L"], ["target_Lum.xisf", "L"], ["target_Luminance.xisf", "L"],
         ["target_RGB.xisf", "RGB"],
         ["C:/data/deep/C1_HO.xisf", "HO"],                       // ruta completa /
         ["C:\\data\\deep\\c1_ho.xisf", "HO"],                    // ruta completa \
         ["masterLight_BIN-1_FILTER-H_mono_autocrop.xisf", null], // último token no reconocible → FILTER decide
         ["NGC1560.xisf", null],                                  // sin underscore
         ["raro_.xisf", null],                                    // underscore final
         ["", null], [null, null]
      ];
      for (var i = 0; i < cases.length; ++i) {
         var got = optInferSlotFromName(cases[i][0]);
         A(got === cases[i][1], "'" + cases[i][0] + "' → esperaba " + cases[i][1] + ", salió " + got);
      }
   });

   T("P14", "keyword FILTER → slot", "(tabla)", function () {
      var cases = [
         ["Ha", "H"], ["'Ha'", "H"], ["H-alpha", "H"], ["Halpha", "H"], ["H", "H"],
         ["OIII", "O"], ["O-III", "O"], ["O3", "O"],
         ["SII", "S"], ["S-II", "S"], ["S2", "S"],
         ["Red", "R"], ["Green", "G"], ["Blue", "B"],
         ["L", "L"], ["Lum", "L"], ["Luminance", "L"],
         ["  'OIII'  ", "O"],                                     // comillas+espacios FITS
         ["", null], [null, null], ["X123", null]                 // nunca adivinar
      ];
      for (var i = 0; i < cases.length; ++i) {
         var got = optInferSlotFromFilter(cases[i][0]);
         A(got === cases[i][1], "'" + cases[i][0] + "' → esperaba " + cases[i][1] + ", salió " + got);
      }
   });
}

// =============================================================================
// MAIN
// =============================================================================
try {
   L("BATERÍA PI Workflow — inicio " + (new Date).toISOString() +
     " · build " + (typeof OPT_BUILD !== "undefined" ? OPT_BUILD : "?"));
   var winsAtStart = ImageWindow.windows.length;

   packP0();
   packP2();
   packP3();
   packP1();
   packP4();
   packP5();
   packP6();
   packP7();
   packP8();
   packP9();
   packP10();
   packP11();
   packP12();
   packP14();

   var leakTotal = ImageWindow.windows.length - winsAtStart;
   L("Guard global de ventanas: " + leakTotal + " huérfanas");
   if (leakTotal !== 0)
      RES.push({ pack: "GUARD", name: "fuga global de ventanas", img: "-", ms: 0, status: "FAIL", msg: leakTotal + " ventanas huérfanas al final" });

   writeReport();
   var nf = 0; for (var i = 0; i < RES.length; ++i) if (RES[i].status === "FAIL") ++nf;
   L("RESULT: " + (nf === 0 ? "GREEN" : "RED") + " (" + RES.length + " tests, " + nf + " fail)");
   L("DONE.");
} catch (e) {
   L("FATAL: " + e.message + (e.stack ? ("\n" + e.stack) : ""));
   try { writeReport(); } catch (e2) {}
}
