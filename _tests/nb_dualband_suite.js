#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"

// =============================================================================
// nb_dualband_suite.js — camino de entrada NB DUAL-BAND (batería permanente).
// Nacido de la verificación profunda de la RC (2026-07-08) con las imágenes
// reales del usuario (C1_HO + C2_OS). Replica EXACTAMENTE la rama DBXTRACT de
// la UI (ui/tabs_core.js:959):
//   optRunDBXtract(HO, OS) → _HA/_OIII/_SII → optRecipeChannels(paleta) →
//   optCreateRgbFromChannels → optAnnotateNarrowbandView → cleanup intermedios.
// Asserts: extracción produce 3 monos válidos (dims, sin NaN, no constantes,
// distintos entre sí), combinación 3 canales válida por paleta, 0 fugas.
// SKIP limpio si DBXtract.js o las imágenes no están (regla de deps externas).
//
// AMPLIACIÓN 2026-07-08: sección "NB MONOS REALES H/O/S" con los másters del
// usuario (trío 300s autocrop + trío 180s drizzle). Replica la rama NO-DBXtract
// de combineNb (tabs_core.js:992): map H/O/S → optRecipeChannels(receta) →
// optCreateRgbFromChannels → optAnnotateNarrowbandView. Verifica el mapeo de
// canales numéricamente (mediana de cada canal del combinado == mediana del
// mono fuente que dicta la receta). SKIP limpio si faltan los másters.
// =============================================================================

var DIR = "C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_200/_tests/";
var LOG = DIR + "nb_dualband_suite.log";
var IMG = "C:/Users/ninoc/Documents/PixInsight/CabraSpace/Pagina Web/Imagenes Prueba/";
var CROP = 1024;   // recorte central: acota RAM/tiempo (la GUI probará full-size)

var B = "", pass = 0, fails = 0;
function L(s){ B += String(s)+"\n"; try{ File.writeTextFile(LOG,B); }catch(e){} }
function ok(name, cond, extra){ if(cond){ ++pass; L("  PASS "+name); } else { ++fails; L("  FAIL "+name+(extra?" — "+extra:"")); } }
function A(cond,msg){ if(!cond) throw new Error(msg); }

function openCrop(path, maxSz, id){
   // OJO: los másters WBPP pueden ser XISF MULTI-IMAGEN (máster + mapas de
   // rechazo/peso embebidos) → ImageWindow.open devuelve VARIAS ventanas.
   // Hay que cerrarlas TODAS, no solo arr[0] (fuga cazada por el guard 2026-07-08).
   var arr = ImageWindow.open(path);
   if (!arr || !arr.length) throw new Error("no se pudo abrir " + path);
   var win = arr[0];
   if (arr.length > 1) L("  (fichero multi-imagen: " + arr.length + " imágenes embebidas — uso la 1ª)");
   try {
      var im = win.mainView.image, W = im.width, H = im.height, nc = im.numberOfChannels;
      L("  origen " + id + ": " + W + "x" + H + " · " + nc + " ch");
      var cw = Math.min(maxSz,W), ch = Math.min(maxSz,H);
      var x0 = ((W-cw)/2)|0, y0 = ((H-ch)/2)|0;
      var src = new Rect(x0,y0,x0+cw,y0+ch), dst = new Rect(0,0,cw,ch);
      var out = new ImageWindow(cw, ch, nc, 32, true, nc>1, id);
      out.mainView.beginProcess(UndoFlag_NoSwapFile);
      var buf = new Float32Array(cw*ch);
      for (var c=0;c<nc;++c){ im.getSamples(buf,src,c); out.mainView.image.setSamples(buf,dst,c); }
      out.mainView.endProcess();
      return out;
   } finally { for (var wi=0; wi<arr.length; ++wi){ try { arr[wi].forceClose(); } catch(eW){} } }
}
function stats(view){
   var im=view.image, w=im.width, h=im.height, nc=im.numberOfChannels, rc=new Rect(0,0,w,h);
   var o={w:w,h:h,nc:nc,bad:0,med:[],mn:1e9,mx:-1e9};
   for (var c=0;c<nc;++c){ var a=new Float32Array(w*h); im.getSamples(a,rc,c);
      var s=[],st=Math.max(1,(a.length/40000)|0);
      for(var i=0;i<a.length;++i){ var v=a[i]; if(!(v===v)||v===Infinity||v===-Infinity)++o.bad; else { if(v<o.mn)o.mn=v; if(v>o.mx)o.mx=v; } if(i%st===0)s.push(v); }
      s.sort(function(x,y){return x-y;}); o.med.push(s[s.length>>1]||0); }
   return o;
}

try {
   L("NB DUAL-BAND — inicio " + (new Date).toISOString() + " · build " + (typeof OPT_BUILD!=="undefined"?OPT_BUILD:"?"));
   var wins0 = ImageWindow.windows.length;

   // SKIP limpio (por sección) si faltan dependencias externas
   var haveDbx = File.exists("C:/Program Files/PixInsight/src/scripts/DBXtract/DBXtract.js");
   var haveHOOS = File.exists(IMG + "C1_HO.xisf") && File.exists(IMG + "C2_OS.xisf");
   if (!haveDbx) L("SKIP dual-band: DBXtract.js no instalado — sección omitida (no es FAIL).");
   else if (!haveHOOS) L("SKIP dual-band: C1_HO.xisf / C2_OS.xisf no encontrados en " + IMG);

   if (haveDbx && haveHOOS) {
   // 1) abrir recortes de las imágenes reales del usuario
   var ho = openCrop(IMG + "C1_HO.xisf", CROP, "RCNB_HO");
   var os = openCrop(IMG + "C2_OS.xisf", CROP, "RCNB_OS");
   var sHO = stats(ho.mainView), sOS = stats(os.mainView);
   ok("HO: RGB 3 canales", sHO.nc === 3, "nc=" + sHO.nc);
   ok("OS: RGB 3 canales", sOS.nc === 3, "nc=" + sOS.nc);
   ok("HO/OS mismas dimensiones", sHO.w===sOS.w && sHO.h===sOS.h);
   ok("HO sin NaN", sHO.bad === 0, sHO.bad + " muestras malas");
   ok("OS sin NaN", sOS.bad === 0, sOS.bad + " muestras malas");
   L("  HO med R/G/B: " + sHO.med.map(function(x){return x.toFixed(5);}).join("/"));
   L("  OS med R/G/B: " + sOS.med.map(function(x){return x.toFixed(5);}).join("/"));

   // 2) extracción DBXtract (idéntico a la rama de la UI)
   var t0 = (new Date).getTime();
   var extracted = null, exErr = null;
   try { extracted = optRunDBXtract(ho.mainView, os.mainView); }
   catch(eD){ exErr = String(eD.message||eD); }
   ok("optRunDBXtract corre sin excepción", exErr===null, exErr);
   var tExtract = (new Date).getTime() - t0;
   L("  DBXtract: " + tExtract + " ms");

   if (extracted){
      var sH = stats(extracted.ha), sO = stats(extracted.oiii), sS = stats(extracted.sii);
      ok("_HA mono válido",  sH.nc===1 && sH.w===sHO.w && sH.h===sHO.h && sH.bad===0, JSON.stringify({nc:sH.nc,w:sH.w,bad:sH.bad}));
      ok("_OIII mono válido", sO.nc===1 && sO.w===sHO.w && sO.h===sHO.h && sO.bad===0, JSON.stringify({nc:sO.nc,w:sO.w,bad:sO.bad}));
      ok("_SII mono válido",  sS.nc===1 && sS.w===sHO.w && sS.h===sHO.h && sS.bad===0, JSON.stringify({nc:sS.nc,w:sS.w,bad:sS.bad}));
      ok("_HA no constante",  sH.mx - sH.mn > 1e-6);
      ok("_OIII no constante", sO.mx - sO.mn > 1e-6);
      ok("_SII no constante",  sS.mx - sS.mn > 1e-6);
      // los 3 canales extraídos deben diferir entre sí (si DBXtract degenerase a copiar, medianas iguales)
      ok("Ha ≠ OIII (medianas)", Math.abs(sH.med[0]-sO.med[0]) > 1e-7, sH.med[0]+" vs "+sO.med[0]);
      ok("OIII ≠ SII (medianas)", Math.abs(sO.med[0]-sS.med[0]) > 1e-7, sO.med[0]+" vs "+sS.med[0]);
      L("  medianas Ha/OIII/SII: " + sH.med[0].toFixed(6) + " / " + sO.med[0].toFixed(6) + " / " + sS.med[0].toFixed(6));

      // 3b) paleta GOLDEN (build 31): mezcla ponderada vía optCreateGoldenNbFromChannels
      //     (la rama GOLDEN de combineNb usa esta función, no el mapeo 1:1)
      var gDbx = null, gErr = null;
      try { gDbx = optCreateGoldenNbFromChannels(extracted.ha, extracted.oiii, extracted.sii, "RCNB_GOLDEN_DBX", extracted.oiii); }
      catch(eG){ gErr = String(eG.message||eG); }
      ok("GOLDEN (dual-band) corre", gErr===null, gErr);
      if (gDbx){
         var sG = stats(gDbx);
         ok("GOLDEN (dual-band): RGB válido", sG.nc===3 && sG.w===sHO.w && sG.h===sHO.h && sG.bad===0);
         ok("GOLDEN (dual-band): no constante", sG.mx - sG.mn > 1e-6);
         try { gDbx.window.forceClose(); } catch(e){}
      }

      // 3) combinación por paleta (HSO = default de la rama DBXtract, + HOO)
      var palettes = ["HSO", "HOO"];
      for (var p=0;p<palettes.length;++p){
         var pal = palettes[p];
         var map = { H: extracted.ha, O: extracted.oiii, S: extracted.sii };
         var rec = optRecipeChannels(pal);
         var comb = null, cErr = null;
         var t1 = (new Date).getTime();
         try {
            comb = optCreateRgbFromChannels(map[rec[0]], map[rec[1]], map[rec[2]], "RCNB_" + pal, map[rec[1]] || map[rec[0]]);
            optAnnotateNarrowbandView(comb, pal, "DBXtract Combination");
         } catch(eC){ cErr = String(eC.message||eC); }
         ok("combinación " + pal + " corre", cErr===null, cErr);
         if (comb){
            var sC = stats(comb);
            ok(pal + ": RGB válido (3ch, dims, sin NaN)", sC.nc===3 && sC.w===sHO.w && sC.h===sHO.h && sC.bad===0);
            ok(pal + ": no constante", sC.mx - sC.mn > 1e-6);
            L("  " + pal + ": " + ((new Date).getTime()-t1) + " ms · med R/G/B " + sC.med.map(function(x){return x.toFixed(5);}).join("/"));
            try { comb.window.forceClose(); } catch(e){}
         }
      }
   }

   // 4) limpieza (idéntica al finally de la UI) + guard de fugas
   optCloseDBXtractIntermediates();
   try { ho.forceClose(); } catch(e){}
   try { os.forceClose(); } catch(e){}
   var leak = ImageWindow.windows.length - wins0;
   ok("0 fugas de ventanas", leak === 0, leak + " huérfanas");
   if (leak !== 0){ var ws=ImageWindow.windows; for (var i=ws.length-1;i>=wins0;--i){ try{ L("  huérfana: "+ws[i].mainView.id); ws[i].forceClose(); }catch(e){} } }
   } // fin sección dual-band

   // ==========================================================================
   // SECCIÓN 2 — NB MONOS REALES H/O/S (másters del usuario, 2026-07-08)
   // ==========================================================================
   var M300 = {
      H: "masterLight_BIN-1_6248x4176_EXPOSURE-300.00s_FILTER-H_mono_autocrop.xisf",
      O: "masterLight_BIN-1_6248x4176_EXPOSURE-300.00s_FILTER-O_mono_autocrop.xisf",
      S: "masterLight_BIN-1_6248x4176_EXPOSURE-300.00s_FILTER-S_mono_autocrop.xisf"
   };
   var M180 = {
      H: "masterLight_BIN-1_6248x4176_EXPOSURE-180.00s_FILTER-H_mono_drizzle_1x_autocrop.xisf",
      O: "masterLight_BIN-1_6248x4176_EXPOSURE-180.00s_FILTER-O_mono_drizzle_1x_autocrop.xisf",
      S: "masterLight_BIN-1_6248x4176_EXPOSURE-180.00s_FILTER-S_mono_drizzle_1x_autocrop.xisf"
   };
   var haveMonos = true;
   for (var mk in M300) if (!File.exists(IMG + M300[mk])) haveMonos = false;
   if (!haveMonos) {
      L("SKIP monos: másters H/O/S 300s no encontrados en " + IMG + " — sección omitida.");
   } else {
      L("== NB monos reales (trío 300s) ==");
      var wins1 = ImageWindow.windows.length;
      var mono = {};
      for (var ch in M300) mono[ch] = openCrop(IMG + M300[ch], CROP, "RCNB_M" + ch);
      var sM = {};
      for (var ch2 in mono) sM[ch2] = stats(mono[ch2].mainView);
      ok("monos 300s: 1 canal cada uno", sM.H.nc===1 && sM.O.nc===1 && sM.S.nc===1);
      ok("monos 300s: dims iguales", sM.H.w===sM.O.w && sM.O.w===sM.S.w && sM.H.h===sM.S.h);
      ok("monos 300s: sin NaN", sM.H.bad+sM.O.bad+sM.S.bad === 0, "H:"+sM.H.bad+" O:"+sM.O.bad+" S:"+sM.S.bad);
      ok("monos 300s: no constantes", (sM.H.mx-sM.H.mn)>1e-6 && (sM.O.mx-sM.O.mn)>1e-6 && (sM.S.mx-sM.S.mn)>1e-6);
      L("  medianas H/O/S: " + sM.H.med[0].toFixed(6) + " / " + sM.O.med[0].toFixed(6) + " / " + sM.S.med[0].toFixed(6));

      // combinación por receta (rama NO-DBXtract de combineNb) + verificación del mapeo
      var recipes = ["SHO", "HOO", "FORAXX"];
      for (var rix=0; rix<recipes.length; ++rix){
         var rcp = recipes[rix];
         var mmap = { H: mono.H.mainView, O: mono.O.mainView, S: mono.S.mainView };
         var rr = optRecipeChannels(rcp);
         var combM = null, mErr = null;
         var tM = (new Date).getTime();
         try {
            combM = optCreateRgbFromChannels(mmap[rr[0]], mmap[rr[1]], mmap[rr[2]], "RCNBM_" + rcp, mmap[rr[1]] || mmap[rr[0]]);
            optAnnotateNarrowbandView(combM, rcp, "Channel Combination");
         } catch(eM){ mErr = String(eM.message||eM); }
         ok("combinación " + rcp + " (monos) corre", mErr===null, mErr);
         if (combM){
            var sC2 = stats(combM);
            ok(rcp + ": RGB válido", sC2.nc===3 && sC2.w===sM.H.w && sC2.h===sM.H.h && sC2.bad===0);
            // mapeo numérico: mediana de cada canal == mediana del mono fuente (tol 1e-6)
            var mapOk = true, expl = [];
            for (var cix=0; cix<3; ++cix){
               var srcMed = sM[rr[cix]].med[0], dstMed = sC2.med[cix];
               if (Math.abs(srcMed - dstMed) > 1e-6) mapOk = false;
               expl.push(rr[cix] + "→" + "RGB"[cix] + " " + dstMed.toFixed(6));
            }
            ok(rcp + ": mapeo de canales exacto (" + rr.join("") + ")", mapOk, expl.join(" · "));
            L("  " + rcp + ": " + ((new Date).getTime()-tM) + " ms · " + expl.join(" · "));
            try { combM.window.forceClose(); } catch(e){}
         }
      }
      // GOLDEN (builds 31+33) — verificación PONDERADA exacta en píxeles fijos.
      // Fórmula build 33 (neutralización de fondo): con mX = mediana del mono X
      // y p = min(medianas):
      //   R = p + ((H-mH) + 0.40·(O-mO))/1.40
      //   G = p + (0.65·(H-mH) + 0.10·(O-mO) + 0.80·(S-mS))/1.55
      //   B = p + (0.15·(H-mH) + (O-mO) + (S-mS))/2.15
      var gM = null, gMErr = null;
      try { gM = optCreateGoldenNbFromChannels(mono.H.mainView, mono.O.mainView, mono.S.mainView, "RCNB_GOLDEN_M", mono.O.mainView); }
      catch(eGM){ gMErr = String(eGM.message||eGM); }
      ok("GOLDEN (monos) corre", gMErr===null, gMErr);
      if (gM){
         var sGM = stats(gM);
         ok("GOLDEN (monos): RGB válido", sGM.nc===3 && sGM.w===sM.H.w && sGM.h===sM.H.h && sGM.bad===0);
         var mH2 = parseFloat(mono.H.mainView.image.median().toFixed(8));
         var mO2 = parseFloat(mono.O.mainView.image.median().toFixed(8));
         var mS2 = parseFloat(mono.S.mainView.image.median().toFixed(8));
         var p2 = parseFloat(Math.min(mH2, Math.min(mO2, mS2)).toFixed(8));
         var W2 = sM.H.w, H2 = sM.H.h;
         var pts = [[ (W2/4)|0, (H2/4)|0 ], [ (W2/2)|0, (H2/2)|0 ], [ (3*W2/4)|0, (3*H2/4)|0 ]];
         var wOk = true, wExpl = [];
         function clamp01(x){ return x<0?0:(x>1?1:x); }
         for (var pi=0; pi<pts.length; ++pi){
            var px = pts[pi][0], py = pts[pi][1];
            var vH = mono.H.mainView.image.sample(px,py,0), vO = mono.O.mainView.image.sample(px,py,0), vS = mono.S.mainView.image.sample(px,py,0);
            var dH = vH-mH2, dO = vO-mO2, dS = vS-mS2;
            var eR = clamp01(p2 + (dH + 0.40*dO)/1.40);
            var eG2 = clamp01(p2 + (0.65*dH + 0.10*dO + 0.80*dS)/1.55);
            var eB = clamp01(p2 + (0.15*dH + dO + dS)/2.15);
            var aR = gM.image.sample(px,py,0), aG = gM.image.sample(px,py,1), aB = gM.image.sample(px,py,2);
            if (Math.abs(aR-eR)>1e-5 || Math.abs(aG-eG2)>1e-5 || Math.abs(aB-eB)>1e-5){ wOk = false; wExpl.push("("+px+","+py+") esperado "+eR.toFixed(6)+"/"+eG2.toFixed(6)+"/"+eB.toFixed(6)+" real "+aR.toFixed(6)+"/"+aG.toFixed(6)+"/"+aB.toFixed(6)); }
         }
         ok("GOLDEN (monos): pesos exactos en 3 píxeles (fórmula build 33)", wOk, wExpl.join(" · "));
         // Neutralización: las medianas R/G/B del combinado deben quedar ~iguales (fondo neutro)
         var spread = Math.max(Math.abs(sGM.med[0]-sGM.med[1]), Math.max(Math.abs(sGM.med[1]-sGM.med[2]), Math.abs(sGM.med[0]-sGM.med[2])));
         ok("GOLDEN (monos): fondo NEUTRO (medianas R/G/B parejas)", spread < 5e-4, "medianas " + sGM.med.map(function(x){return x.toFixed(6);}).join("/") + " · spread " + spread.toExponential(2));
         try { gM.window.forceClose(); } catch(e){}
      }
      // GOLDEN sin SII (S opcional): debe correr con solo H+O
      var gHO = null, gHOErr = null;
      try { gHO = optCreateGoldenNbFromChannels(mono.H.mainView, mono.O.mainView, null, "RCNB_GOLDEN_HO", mono.O.mainView); }
      catch(eHO2){ gHOErr = String(eHO2.message||eHO2); }
      ok("GOLDEN sin SII corre (S opcional)", gHOErr===null, gHOErr);
      if (gHO){ var sHO2 = stats(gHO); ok("GOLDEN sin SII: RGB válido", sHO2.nc===3 && sHO2.bad===0); try { gHO.window.forceClose(); } catch(e){} }

      for (var ch3 in mono) { try { mono[ch3].forceClose(); } catch(e){} }
      ok("monos 300s: 0 fugas", ImageWindow.windows.length - wins1 === 0);
   }

   // trío 180s drizzle: invariantes rápidas (mismo pipeline de apertura)
   var have180 = true;
   for (var dk in M180) if (!File.exists(IMG + M180[dk])) have180 = false;
   if (!have180) {
      L("SKIP monos 180s drizzle: no encontrados — sección omitida.");
   } else {
      L("== NB monos reales (trío 180s drizzle) ==");
      var winsD = ImageWindow.windows.length;
      var sD = {};
      for (var dch in M180){
         var wD = openCrop(IMG + M180[dch], CROP, "RCNB_D" + dch);
         sD[dch] = stats(wD.mainView);
         try { wD.forceClose(); } catch(e){}
      }
      ok("drizzle 180s: 1 canal y sin NaN", sD.H.nc===1 && sD.O.nc===1 && sD.S.nc===1 && (sD.H.bad+sD.O.bad+sD.S.bad)===0);
      ok("drizzle 180s: dims iguales entre sí", sD.H.w===sD.O.w && sD.O.w===sD.S.w);
      ok("drizzle 180s: no constantes", (sD.H.mx-sD.H.mn)>1e-6 && (sD.O.mx-sD.O.mn)>1e-6 && (sD.S.mx-sD.S.mn)>1e-6);
      L("  medianas H/O/S: " + sD.H.med[0].toFixed(6) + " / " + sD.O.med[0].toFixed(6) + " / " + sD.S.med[0].toFixed(6));
      ok("drizzle 180s: 0 fugas", ImageWindow.windows.length - winsD === 0);
   }

   L("NB-DUALBAND: " + (fails===0?"GREEN":"RED") + " (" + pass + " pass, " + fails + " fail)");
   L("DONE.");
} catch(e){
   if (String(e.message) !== "__SKIP__")
      L("FATAL: " + e.message + (e.stack?("\n"+e.stack):""));
}
