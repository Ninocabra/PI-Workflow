#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../../PI Workflow.js"

// =============================================================================
// e2e_suite.js — TEST E2E + RENDIMIENTO FINO + CALIDAD (autocontenido).
// Ver README_E2E.md. Corre en PixInsight headless:
//   "C:\Program Files\PixInsight\bin\PixInsight.exe" -n=152 --automation-mode
//     -r=".../_tests/e2e/e2e_suite.js" --force-exit
// Hace en una pasada, por cada imagen de referencia:
//   (1) flujo E2E real = optCabraComposeRGB (camino de producción de CabraMagic RGB),
//   (2) cronómetro del E2E total + de cada proceso por separado -> perf_history.json
//       (aviso si un proceso se desvía >20% respecto a la pasada anterior),
//   (3) métricas de calidad de la salida vs quality_baseline.json (aviso si gran desviación).
// =============================================================================

var DIR   = "C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_200/_tests/e2e/";
var LOG    = DIR + "e2e_suite.log";
var REPORT = DIR + "e2e_report.md";
var PERF   = DIR + "perf_history.json";
var QUAL   = DIR + "quality_baseline.json";

var E2E_CROP      = 1024;    // recorte central fijo (tiempos comparables entre pasadas)
var PERF_WARN_PCT = 20;      // aviso de rendimiento si |Δ| > 20% respecto a la medida previa
// umbrales de calidad (relativos salvo saturación, que es en puntos porcentuales absolutos)
var QUALITY_THRESH = { median:0.15, noise:0.30, snr:0.20, dynamicRange:0.20, background:0.15, chMed:0.15, satPP:1.0 };

// Imágenes de referencia (broadband RGB, que es el caso del pipeline RGB de CabraMagic).
var IMG_DIRS = [ "C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_200/_tests/images/",
                 "C:/Users/ninoc/Documents/PixInsight/CabraSpace/Pagina Web/Imagenes Prueba/" ];
var IMG_SET  = [ "NGC3184_RGB.xisf", "LDu2_RGB.xisf", "M13_RGB.xisf" ];

// ---- codificador UTF-8 manual (File.writeTextFile corrompe emojis de 4 bytes;
//      mismo patrón que battery_suite.js) --------------------------------------
function utf8ByteArrayFromString(str){
   var ba = new ByteArray(0);
   function push(b){ var one = new ByteArray(1); one.at(0, b); ba.add(one); }
   for (var i=0;i<str.length;++i){ var c = str.charCodeAt(i);
      if (c>=0xD800 && c<=0xDBFF && i+1<str.length){ var lo=str.charCodeAt(i+1);
         if (lo>=0xDC00 && lo<=0xDFFF){ c=0x10000+((c-0xD800)<<10)+(lo-0xDC00); ++i; } }
      if (c<0x80) push(c);
      else if (c<0x800){ push(0xC0|(c>>6)); push(0x80|(c&63)); }
      else if (c<0x10000){ push(0xE0|(c>>12)); push(0x80|((c>>6)&63)); push(0x80|(c&63)); }
      else { push(0xF0|(c>>18)); push(0x80|((c>>12)&63)); push(0x80|((c>>6)&63)); push(0x80|(c&63)); } }
   return ba;
}
function writeTextUtf8(path, str){ try { File.writeFile(path, utf8ByteArrayFromString(str)); } catch(e){ try { File.writeTextFile(path, str); } catch(e2){} } }

// ---- log incremental ---------------------------------------------------------
var B = "";
function L(s){ B += String(s) + "\n"; try { File.writeTextFile(LOG, B); } catch(e){} }
function now(){ return (new Date).getTime(); }
function rnd(){ return Math.floor(Math.random()*1e6); }

// ---- utilidades JSON ---------------------------------------------------------
function readJson(path, dflt){ try { if (File.exists(path)) return JSON.parse(File.readTextFile(path)); } catch(e){} return dflt; }
function writeJson(path, obj){ try { File.writeTextFile(path, JSON.stringify(obj, null, 2)); } catch(e){ L("  (no pude escribir " + path + ": " + e.message + ")"); } }

// ---- imagen: recorte central a tamaño fijo (acota RAM/tiempo, comparable) -----
function openCrop(path, maxSz){
   // Los másters WBPP pueden ser XISF MULTI-IMAGEN → cerrar TODAS las ventanas
   // devueltas, no solo arr[0] (fuga cazada por el guard de la batería 2026-07-08).
   var arr = ImageWindow.open(path);
   if (!arr || !arr.length) throw new Error("no se pudo abrir " + path);
   var win = arr[0];
   try {
      var im = win.mainView.image, W = im.width, H = im.height, nc = im.numberOfChannels;
      var cw = Math.min(maxSz, W), ch = Math.min(maxSz, H);
      var x0 = ((W-cw)/2)|0, y0 = ((H-ch)/2)|0;
      var src = new Rect(x0,y0,x0+cw,y0+ch), dst = new Rect(0,0,cw,ch);
      var out = new ImageWindow(cw, ch, nc, 32, true, nc>1, "E2E_"+rnd());
      out.mainView.beginProcess(UndoFlag_NoSwapFile);
      var buf = new Float32Array(cw*ch);
      for (var c=0;c<nc;++c){ im.getSamples(buf, src, c); out.mainView.image.setSamples(buf, dst, c); }
      out.mainView.endProcess();
      return out;
   } finally { for (var wi=0; wi<arr.length; ++wi){ try { arr[wi].forceClose(); } catch(eW){} } }
}

function countNonFinite(view){
   var im = view.image, w = im.width, h = im.height, nc = im.numberOfChannels, rc = new Rect(0,0,w,h), bad = 0;
   for (var c=0;c<nc;++c){ var a = new Float32Array(w*h); im.getSamples(a, rc, c);
      for (var i=0;i<a.length;++i){ var v=a[i]; if (!(v===v) || v===Infinity || v===-Infinity) ++bad; } }
   return bad;
}

// ---- cronómetro de un proceso aislado sobre un clon fresco de la base --------
function timeStage(base, name, fn){
   var c = null, dt = -1, err = null;
   try {
      c = optCabraClonePM(base, "perf_" + name + "_" + rnd());
      var t = now();
      fn(c);
      dt = now() - t;
   } catch(e){ err = String(e.message || e); }
   try { if (c && c.window) c.window.forceClose(); } catch(_){}
   return { ms: dt, err: err };
}

// =============================================================================
var RES = { images: {}, e2eFails: [], perfWarns: [], qualWarns: [], errors: [] };
var perfHist = readJson(PERF, { runs: [] });
var qualBase = readJson(QUAL, { images: {} });
var thisPerf = { ts: (new Date).toISOString(), build: (typeof OPT_BUILD!=="undefined"?OPT_BUILD:0), crop: E2E_CROP, images: {} };

function priorPerf(imgName, stage){
   for (var r = perfHist.runs.length - 1; r >= 0; --r){
      var e = perfHist.runs[r].images[imgName];
      if (e){ if (stage === "e2e") { if (isFinite(e.e2e)) return e.e2e; }
              else if (e.stages && isFinite(e.stages[stage])) return e.stages[stage]; }
   }
   return null;
}

try {
   L("E2E SUITE — inicio " + thisPerf.ts + " · build " + thisPerf.build + " · crop " + E2E_CROP);
   var winsAtStart = ImageWindow.windows.length;

   // localizar directorio de imágenes
   var IMGDIR = null;
   for (var d=0; d<IMG_DIRS.length; ++d) if (File.directoryExists(IMG_DIRS[d])) { IMGDIR = IMG_DIRS[d]; break; }
   if (!IMGDIR) throw new Error("no existe ningún directorio de imágenes de referencia");
   L("  directorio: " + IMGDIR);

   var pp0 = optCabraFinishParams(0.15);   // params de finish para el desglose de perf

   for (var i=0; i<IMG_SET.length; ++i){
      var name = IMG_SET[i], path = IMGDIR + name;
      if (!File.exists(path)) { L("  SKIP (no existe): " + name); continue; }
      L("== " + name + " ==");
      var rec = { e2e: -1, e2eOk: false, stages: {}, quality: null };
      var w = null;
      try {
         w = openCrop(path, E2E_CROP);
         var base = w.mainView;
         var inputQ = optQualityMetrics(base);

         // (1)+(2a) FLUJO E2E REAL (camino de producción) + tiempo total
         var fin = null;
         try {
            var t0 = now();
            fin = optCabraComposeRGB({ RGB: base }, { tag: "e2e_" + i });
            rec.e2e = now() - t0;
            // validación de resultado
            if (!optSafeView(fin)) throw new Error("E2E no devolvió vista válida");
            var okDims = fin.image.width === base.image.width && fin.image.height === base.image.height;
            var okCh   = fin.image.numberOfChannels === 3;
            var nan    = countNonFinite(fin);
            if (!okDims) RES.e2eFails.push(name + ": dimensiones cambiaron " + fin.image.width + "x" + fin.image.height);
            if (!okCh)   RES.e2eFails.push(name + ": canales != 3 (" + fin.image.numberOfChannels + ")");
            if (nan>0)   RES.e2eFails.push(name + ": " + nan + " muestras NaN/Inf en la salida");
            rec.e2eOk = okDims && okCh && nan===0;
            // (3) CALIDAD de la salida
            var outputQ = optQualityMetrics(fin);
            rec.quality = { input: inputQ, output: outputQ };
         } catch(eE){
            RES.e2eFails.push(name + ": excepción en E2E — " + (eE.message||eE));
            L("  FALLO E2E: " + (eE.message||eE));
         } finally {
            try { if (fin && fin.window) fin.window.forceClose(); } catch(_){}
         }

         // (2b) DESGLOSE DE PERF por proceso (clones frescos de la base)
         var stages = [
            ["gradient",  function(v){ optCabraGradientRGB(v); }],
            ["starSplit", function(v){ optCabraMakeStarless(v, null); }],
            ["autoghs",   function(v){ optRunAutoGhsStretch(v, { aghs_intensity: pp0.stretchIntensity, aghs_bp: 3.0 }); }],
            ["starReduce",function(v){ optStarReduceOnView(v, 0.5, 3); }],
            ["denoise",   function(v){ optCabraDenoiseFallback(v, null, 0.60); }],
            ["finish",    function(v){ optCabraFinishView(v, null, pp0, { saturation: Math.min(1.4, pp0.saturation), detailAmount: 1.3 }); }]
         ];
         for (var s=0; s<stages.length; ++s){
            var r = timeStage(base, stages[s][0], stages[s][1]);
            rec.stages[stages[s][0]] = r.ms;
            if (r.err){ RES.errors.push(name + "/" + stages[s][0] + ": " + r.err); L("  stage " + stages[s][0] + " ERROR: " + r.err); }
            else L("  stage " + stages[s][0] + ": " + r.ms + " ms");
         }
         L("  E2E total: " + rec.e2e + " ms · resultado " + (rec.e2eOk?"OK":"FALLO"));
      } catch(eImg){
         RES.errors.push(name + ": " + (eImg.message||eImg));
         L("  ERROR imagen: " + (eImg.message||eImg));
      } finally {
         try { if (w) w.forceClose(); } catch(_){}
      }

      RES.images[name] = rec;
      thisPerf.images[name] = { e2e: rec.e2e, stages: rec.stages };

      // ---- comparación de PERF vs medida previa (>20% -> aviso) ----
      var perfKeys = ["e2e"]; for (var k in rec.stages) perfKeys.push(k);
      for (var pk=0; pk<perfKeys.length; ++pk){
         var key = perfKeys[pk];
         var cur = (key==="e2e") ? rec.e2e : rec.stages[key];
         if (!isFinite(cur) || cur < 0) continue;
         var prev = priorPerf(name, key);
         if (prev !== null && prev > 0){
            var dpct = 100*(cur - prev)/prev;
            if (Math.abs(dpct) > PERF_WARN_PCT)
               RES.perfWarns.push((dpct>0?"🐌 ":"🐇 ") + name + " / " + key + ": " + prev + "→" + cur + " ms (" + (dpct>0?"+":"") + dpct.toFixed(0) + "%)");
         }
      }

      // ---- comparación de CALIDAD vs baseline ----
      if (rec.quality){
         var bkey = name;
         if (!qualBase.images[bkey]){
            qualBase.images[bkey] = rec.quality;   // primera vez: establece baseline
            L("  calidad: baseline establecido");
         } else {
            var comp = compareQuality(name, qualBase.images[bkey].output, rec.quality.output);
            for (var cw2=0; cw2<comp.length; ++cw2) RES.qualWarns.push(comp[cw2]);
         }
      }
   }

   var leak = ImageWindow.windows.length - winsAtStart;
   if (leak !== 0){
      L("  cierre defensivo de " + leak + " ventanas huérfanas");
      try { var wins = ImageWindow.windows; for (var wi=wins.length-1; wi>=winsAtStart; --wi){ try{wins[wi].forceClose();}catch(_){} } } catch(_){}
      RES.errors.push("fuga de ventanas: " + leak);
   }

   // persistir historial y baseline
   perfHist.runs.push(thisPerf);
   writeJson(PERF, perfHist);
   writeJson(QUAL, qualBase);

   writeReport();
   var red = RES.e2eFails.length > 0 || RES.errors.length > 0;
   L("RESULT: " + (red ? "RED" : "GREEN") + " (E2E fails " + RES.e2eFails.length + ", perf warns " + RES.perfWarns.length + ", qual warns " + RES.qualWarns.length + ", errores " + RES.errors.length + ")");
   L("DONE.");
} catch(e){
   L("FATAL: " + e.message + (e.stack?("\n"+e.stack):""));
   try { writeReport(); } catch(_){}
}

// ---- comparación de calidad métrica a métrica -------------------------------
function compareQuality(name, base, cur){
   var out = [];
   function relCheck(label, b, c, thr){
      if (!isFinite(b) || !isFinite(c)) return;
      if (Math.abs(b) < 1e-9){ if (Math.abs(c) > 1e-6) out.push("⚠️ " + name + " / " + label + ": " + b.toFixed(5) + "→" + c.toFixed(5)); return; }
      var d = (c-b)/Math.abs(b);
      if (Math.abs(d) > thr) out.push("⚠️ " + name + " / " + label + ": " + b.toPrecision(4) + "→" + c.toPrecision(4) + " (" + (d>0?"+":"") + (100*d).toFixed(0) + "%)");
   }
   relCheck("median", base.median, cur.median, QUALITY_THRESH.median);
   relCheck("noise",  base.noise,  cur.noise,  QUALITY_THRESH.noise);
   relCheck("snr",    base.snr,    cur.snr,    QUALITY_THRESH.snr);
   relCheck("dynamicRange", base.dynamicRange, cur.dynamicRange, QUALITY_THRESH.dynamicRange);
   relCheck("background", base.background, cur.background, QUALITY_THRESH.background);
   if (isFinite(base.saturationPct) && isFinite(cur.saturationPct) && Math.abs(cur.saturationPct - base.saturationPct) > QUALITY_THRESH.satPP)
      out.push("⚠️ " + name + " / saturationPct: " + base.saturationPct.toFixed(3) + "→" + cur.saturationPct.toFixed(3) + " pp");
   if (base.channelMedians && cur.channelMedians && base.channelMedians.length===3)
      for (var c=0;c<3;++c) relCheck("chMed["+c+"]", base.channelMedians[c], cur.channelMedians[c], QUALITY_THRESH.chMed);
   return out;
}

// ---- reporte ----------------------------------------------------------------
function writeReport(){
   var M = "";
   var red = RES.e2eFails.length > 0 || RES.errors.length > 0;
   M += "# E2E PI Workflow — " + (new Date).toISOString().substring(0,10) + " · build " + thisPerf.build + " · RESULTADO: " + (red?"RED":"GREEN") + "\n\n";

   M += "## ❌ E2E fallido\n" + (RES.e2eFails.length ? RES.e2eFails.map(function(x){return "- "+x;}).join("\n") : "- (ninguno)") + "\n\n";
   M += "## 🐌 Rendimiento: desviación >" + PERF_WARN_PCT + "% vs pasada anterior\n" + (RES.perfWarns.length ? RES.perfWarns.map(function(x){return "- "+x;}).join("\n") : "- (ninguno)") + "\n\n";
   M += "## ⚠️ Calidad: desviación grande vs baseline\n" + (RES.qualWarns.length ? RES.qualWarns.map(function(x){return "- "+x;}).join("\n") : "- (ninguna)") + "\n\n";
   if (RES.errors.length) M += "## ⚠️ Errores/avisos\n" + RES.errors.map(function(x){return "- "+x;}).join("\n") + "\n\n";

   // tabla de perf
   M += "## ⏱️ Rendimiento por proceso (ms) · Δ% vs pasada anterior\n\n";
   M += "| Imagen | E2E total | gradient | starSplit | autoghs | starReduce | denoise | finish |\n";
   M += "|---|--:|--:|--:|--:|--:|--:|--:|\n";
   for (var n in RES.images){ var r = RES.images[n];
      function cell(key){ var cur=(key==="e2e")?r.e2e:r.stages[key]; if(!isFinite(cur)||cur<0) return "err";
         var prev=priorPerf2(n,key); if(prev===null) return cur+""; var d=100*(cur-prev)/prev; return cur+" ("+(d>0?"+":"")+d.toFixed(0)+"%)"; }
      M += "| " + n + " | " + cell("e2e") + " | " + cell("gradient") + " | " + cell("starSplit") + " | " + cell("autoghs") + " | " + cell("starReduce") + " | " + cell("denoise") + " | " + cell("finish") + " |\n";
   }
   M += "\n## 🎯 Calidad de la salida (vs baseline)\n\n";
   M += "| Imagen | mediana | ruido σ | SNR | saturación % | rango din. | R/G/B med. |\n";
   M += "|---|--:|--:|--:|--:|--:|---|\n";
   for (var n2 in RES.images){ var q = RES.images[n2].quality; if (!q){ M += "| " + n2 + " | — | — | — | — | — | — |\n"; continue; }
      var o = q.output, cm = (o.channelMedians&&o.channelMedians.length===3)?(o.channelMedians[0].toFixed(3)+"/"+o.channelMedians[1].toFixed(3)+"/"+o.channelMedians[2].toFixed(3)):"—";
      M += "| " + n2 + " | " + o.median.toFixed(4) + " | " + o.noise.toExponential(2) + " | " + o.snr.toFixed(1) + " | " + o.saturationPct.toFixed(3) + " | " + o.dynamicRange.toFixed(1) + " | " + cm + " |\n";
   }
   M += "\n_Historial: " + perfHist.runs.length + " pasada(s) en perf_history.json · baseline de calidad en quality_baseline.json · " + (new Date).toISOString() + "_\n";
   writeTextUtf8(REPORT, M);
}
// priorPerf2 excluye la pasada actual (que ya está en perfHist tras el push) para el reporte
function priorPerf2(imgName, stage){
   for (var r = perfHist.runs.length - 2; r >= 0; --r){   // -2: salta la actual
      var e = perfHist.runs[r].images[imgName];
      if (e){ if (stage === "e2e") { if (isFinite(e.e2e)) return e.e2e; }
              else if (e.stages && isFinite(e.stages[stage])) return e.stages[stage]; }
   }
   return null;
}
