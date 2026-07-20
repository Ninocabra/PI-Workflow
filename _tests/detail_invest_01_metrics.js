#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"
#include <pjsr/UndoFlag.jsh>

// ============================================================
// detail_invest_01_metrics.js
// Quantitative analysis of the 6 Detail & Contrast methods.
// ============================================================

var DIR  = "C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/";
var IDIR = "C:/Users/ninoc/Documents/PixInsight/CabraSpace/Pagina Web/Imagenes Prueba/";
var LOG  = DIR + "detail_invest_01_metrics.log";
var BUF  = "";
function L(s){ BUF += String(s) + "\n"; try { File.writeTextFile(LOG, BUF); } catch(e){} }

// ---------- pure-JS box blur (sliding window) ----------
// Returns a new Float32Array of same length as src.
function bblur(src, w, h, r) {
   if (r < 1) { var c = new Float32Array(src.length); c.set(src); return c; }
   var tmp = new Float32Array(w * h);
   var diam = 2 * r + 1;
   // horizontal
   for (var y = 0; y < h; ++y) {
      var base = y * w;
      var s = 0.0;
      // seed the window for x=0
      for (var k = -r; k <= r; ++k) {
         var xx = k < 0 ? 0 : (k >= w ? w-1 : k);
         s += src[base + xx];
      }
      tmp[base] = s / diam;
      for (var x = 1; x < w; ++x) {
         var leave = x - r - 1; if (leave < 0) leave = 0;
         var enter = x + r;     if (enter >= w) enter = w - 1;
         s = s - src[base + leave] + src[base + enter];
         tmp[base + x] = s / diam;
      }
   }
   var out = new Float32Array(w * h);
   // vertical
   for (var x2 = 0; x2 < w; ++x2) {
      var s2 = 0.0;
      for (var k2 = -r; k2 <= r; ++k2) {
         var yy = k2 < 0 ? 0 : (k2 >= h ? h-1 : k2);
         s2 += tmp[yy * w + x2];
      }
      out[x2] = s2 / diam;
      for (var y2 = 1; y2 < h; ++y2) {
         var ly = y2 - r - 1; if (ly < 0) ly = 0;
         var ey = y2 + r;     if (ey >= h) ey = h - 1;
         s2 = s2 - tmp[ly * w + x2] + tmp[ey * w + x2];
         out[y2 * w + x2] = s2 / diam;
      }
   }
   return out;
}

// Stride-subsample a Float32Array (no interpolation — just stride pick)
function stride(src, w, h, fac) {
   var ow = Math.floor(w / fac), oh = Math.floor(h / fac);
   var out = new Float32Array(ow * oh);
   for (var y = 0; y < oh; ++y)
      for (var x = 0; x < ow; ++x)
         out[y * ow + x] = src[(y * fac) * w + (x * fac)];
   return { data: out, w: ow, h: oh };
}

// HF energy at blur-radius r: mean(|Y-blur|)/meanY — scale-invariant measure
function hfe(Y, w, h, r) {
   var bl = bblur(Y, w, h, r);
   var sd = 0, sy = 0, n = Y.length;
   for (var i = 0; i < n; ++i) { sd += Math.abs(Y[i] - bl[i]); sy += Y[i]; }
   return sy > 1e-8 ? (sd / n) / (sy / n) : 0;
}

// Background noise stdev: top-left 8% corner (typically sky/background)
function bgnoise(Y, w, h) {
   var pw = Math.max(8, Math.floor(w * 0.08));
   var ph = Math.max(8, Math.floor(h * 0.08));
   var s = 0, n = 0;
   for (var y = 0; y < ph; ++y)
      for (var x = 0; x < pw; ++x) { s += Y[y * w + x]; n++; }
   var m = s / n, v = 0;
   for (var y2 = 0; y2 < ph; ++y2)
      for (var x2 = 0; x2 < pw; ++x2) { var d = Y[y2 * w + x2] - m; v += d * d; }
   return Math.sqrt(v / n);
}

// Clipping fraction (pixels within 0.001 of 0 or 1)
function clipf(Y) {
   var n = Y.length, c = 0;
   for (var i = 0; i < n; ++i) if (Y[i] <= 0.001 || Y[i] >= 0.999) c++;
   return c / n;
}

// Normalized cross-correlation of two arrays (same length)
function ncc(A, B) {
   var n = A.length, mA = 0, mB = 0;
   for (var i = 0; i < n; ++i) { mA += A[i]; mB += B[i]; }
   mA /= n; mB /= n;
   var num = 0, dA = 0, dB = 0;
   for (var j = 0; j < n; ++j) {
      var da = A[j] - mA, db = B[j] - mB;
      num += da * db; dA += da * da; dB += db * db;
   }
   var den = Math.sqrt(dA * dB);
   return den > 1e-14 ? num / den : 0;
}

// Mean absolute of array
function mabs(A) {
   var s = 0, n = A.length;
   for (var i = 0; i < n; ++i) s += Math.abs(A[i]);
   return s / n;
}

// Extract luma from a view as Float32Array
function getLuma(v) {
   var img = v.image, w = img.width, h = img.height;
   var count = w * h, rect = new Rect(0, 0, w, h);
   if (img.numberOfChannels >= 3) {
      var R = new Float32Array(count), G = new Float32Array(count), B = new Float32Array(count);
      img.getSamples(R, rect, 0); img.getSamples(G, rect, 1); img.getSamples(B, rect, 2);
      var Y = new Float32Array(count);
      for (var i = 0; i < count; ++i) Y[i] = 0.2126*R[i] + 0.7152*G[i] + 0.0722*B[i];
      return { d: Y, w: w, h: h };
   }
   var C = new Float32Array(count); img.getSamples(C, rect, 0);
   return { d: C, w: w, h: h };
}

// Load + auto-stretch a file. Returns the view (caller must close).
function loadStretched(path, label) {
   L("  Loading: " + label + " (" + path + ")");
   var ws = ImageWindow.open(path);
   if (!ws || !ws.length) throw new Error("Cannot open: " + path);
   var v = ws[0].mainView;
   var img = v.image;
   L("  Size: " + img.width + "x" + img.height + " ch:" + img.numberOfChannels);
   // Quick median check on channel 0
   var rect = new Rect(0,0,img.width,img.height);
   var Ch = new Float32Array(img.width * img.height);
   img.getSamples(Ch, rect, 0);
   // Sort a sampled subset to estimate median
   var step = Math.max(1, Math.floor(Ch.length / 10000));
   var samp = [];
   for (var i = 0; i < Ch.length; i += step) samp.push(Ch[i]);
   samp.sort(function(a,b){return a-b;});
   var med = samp[Math.floor(samp.length/2)];
   L("  Sampled median=" + med.toFixed(4));
   if (med < 0.05) {
      L("  Stretching with AutoGHS...");
      optRunAutoGhsStretch(v, { aghs_intensity: 0.75, aghs_bp: 3.0 });
      img.getSamples(Ch, rect, 0);
      step = Math.max(1, Math.floor(Ch.length / 5000));
      samp = [];
      for (var i2 = 0; i2 < Ch.length; i2 += step) samp.push(Ch[i2]);
      samp.sort(function(a,b){return a-b;});
      med = samp[Math.floor(samp.length/2)];
      L("  Post-stretch median=" + med.toFixed(4));
   }
   return v;
}

// 6 algorithms with default params
var ALGOS = [
   { id: "localContrast", lbl: "LocalContrast", fn: function(st){ st.lcAmount=0.20; st.lcRadius=80; } },
   { id: "highPass",      lbl: "HighPass",      fn: function(st){ st.hpAmount=0.50; st.hpRadius=3; } },
   { id: "multiscale",    lbl: "Multiscale",    fn: function(st){ st.mdFine=0.40; st.mdMedium=0.20; } },
   { id: "mmtTexture",    lbl: "MMTTexture",    fn: function(st){ st.txAmount=0.50; } },
   { id: "edgeAware",     lbl: "EdgeAware",     fn: function(st){ st.eaRadius=8; st.eaAmount=0.70; } },
   { id: "dehaze",        lbl: "Dehaze",        fn: function(st){ st.dhRadius=48; st.dhStrength=0.40; } }
];

// Analyze all 6 methods on one image view
// Returns array of result objects; also logs NCC pairwise matrix
function analyzeView(baseV, label) {
   L("\n=== " + label + " ===");

   // Get baseline luma, subsample to max ~600px wide for speed
   var base = getLuma(baseV);
   var fac = Math.max(1, Math.ceil(base.w / 600));
   var bs = fac > 1 ? stride(base.d, base.w, base.h, fac) : { data: base.d, w: base.w, h: base.h };
   var sw = bs.w, sh = bs.h;
   L("  Analysis grid: " + sw + "x" + sh + " (stride=" + fac + ")");

   // Baseline metrics
   var b1 = hfe(bs.data, sw, sh, 1);
   var b4 = hfe(bs.data, sw, sh, 4);
   var b16 = hfe(bs.data, sw, sh, 16);
   var bBg = bgnoise(bs.data, sw, sh);
   var bCl = clipf(bs.data);
   L("  Baseline   HF1=" + b1.toFixed(5) + " HF4=" + b4.toFixed(5) + " HF16=" + b16.toFixed(5) + " bg=" + bBg.toFixed(5) + " clip=" + (bCl*100).toFixed(2) + "%");

   var deltas = [];   // {id, label, delta[]}
   var rows = [];

   for (var a = 0; a < ALGOS.length; ++a) {
      var algo = ALGOS[a];
      var cid = label.replace(/[^a-zA-Z0-9]/g,"_").substring(0,12) + "_" + algo.id;
      var cv = null;
      try {
         cv = optCabraClonePM(baseV, cid);
         var st = optDetailDefaultState();
         st.algoId = algo.id;
         algo.fn(st);
         optRunDetailOnView(cv, st);

         var proc = getLuma(cv);
         var ps = fac > 1 ? stride(proc.d, proc.w, proc.h, fac) : { data: proc.d, w: proc.w, h: proc.h };

         // delta map
         var delta = new Float32Array(sw * sh);
         for (var i = 0; i < delta.length; ++i) delta[i] = ps.data[i] - bs.data[i];
         deltas.push({ id: algo.id, lbl: algo.lbl, delta: delta });

         // metrics
         var p1 = hfe(ps.data, sw, sh, 1);
         var p4 = hfe(ps.data, sw, sh, 4);
         var p16 = hfe(ps.data, sw, sh, 16);
         var pBg = bgnoise(ps.data, sw, sh);
         var pCl = clipf(ps.data);
         var dh1 = (p1-b1)*100/(b1+1e-10);
         var dh4 = (p4-b4)*100/(b4+1e-10);
         var dh16 = (p16-b16)*100/(b16+1e-10);
         var dBg = (pBg-bBg)*100/(bBg+1e-10);
         var dCl = (pCl-bCl)*100/(bCl+1e-10);
         var dm = mabs(delta);

         var row = {
            id: algo.id, lbl: algo.lbl,
            dh1: dh1, dh4: dh4, dh16: dh16,
            dBg: dBg, dCl: dCl, dm: dm
         };
         rows.push(row);

         L("  " + algo.lbl.padEnd(14) +
            " dHF1=" + (dh1>=0?"+":"") + dh1.toFixed(1).padStart(5) + "%" +
            " dHF4=" + (dh4>=0?"+":"") + dh4.toFixed(1).padStart(5) + "%" +
            " dHF16=" + (dh16>=0?"+":"") + dh16.toFixed(1).padStart(5) + "%" +
            " dBg=" + (dBg>=0?"+":"") + dBg.toFixed(1).padStart(5) + "%" +
            " dClip=" + (dCl>=0?"+":"") + dCl.toFixed(0).padStart(4) + "%" +
            " |Δ|=" + dm.toFixed(5));

      } catch(e) {
         L("  " + algo.lbl + " ERROR: " + e.message);
         rows.push({ id: algo.id, lbl: algo.lbl, error: e.message });
      }
      try { if (cv) cv.window.forceClose(); } catch(ex) {}
   }

   // Pairwise NCC matrix
   L("\n  -- Pairwise delta NCC (1=identical, 0=orthogonal, negative=anti-correlated) --");
   for (var p = 0; p < deltas.length; ++p) {
      for (var q = p+1; q < deltas.length; ++q) {
         var nc = ncc(deltas[p].delta, deltas[q].delta);
         L("  NCC(" + deltas[p].lbl + " vs " + deltas[q].lbl + ") = " + nc.toFixed(4));
      }
   }
   return rows;
}

// ---- main ----
function main() {
   L("=== Detail & Contrast Investigation — 2026-06-22 ===");
   L("Methods: " + ALGOS.map(function(a){return a.id;}).join(", "));

   var images = [
      { path: IDIR+"NGC3184_RGB.xisf",   lbl:"Galaxy_NGC3184",    type:"galaxy" },
      { path: IDIR+"Collinder34_RGB.xisf",lbl:"Nebula_Coll34",     type:"nebula" },
      { path: IDIR+"M13_RGB.xisf",        lbl:"Globular_M13",      type:"globular" },
      { path: IDIR+"NGC2392_RGB.xisf",    lbl:"Planetary_NGC2392", type:"planetary" }
   ];

   var allRows = {};

   for (var ii = 0; ii < images.length; ++ii) {
      var img = images[ii];
      var v = null;
      try {
         v = loadStretched(img.path, img.lbl);
         allRows[img.type] = analyzeView(v, img.lbl);
      } catch(e) {
         L("\nERROR [" + img.lbl + "]: " + e.message + (e.stack ? "\n" + e.stack : ""));
      }
      try { if (v) v.window.forceClose(); } catch(ex) {}
   }

   // Master summary table
   L("\n\n========== MASTER SUMMARY TABLE ==========");
   L("Type        | Method         | dHF1%  | dHF4%  | dHF16% | dBg%   | dClip%");
   L("------------|----------------|--------|--------|--------|--------|-------");
   var types = ["galaxy","nebula","globular","planetary"];
   for (var t = 0; t < types.length; ++t) {
      var rr = allRows[types[t]];
      if (!rr) { L(types[t] + " | (no data)"); continue; }
      for (var r = 0; r < rr.length; ++r) {
         var ro = rr[r];
         if (ro.error) { L(types[t].padEnd(12)+"| "+ro.id.padEnd(16)+"| ERROR: "+ro.error); continue; }
         L(types[t].padEnd(12) + "| " + ro.id.padEnd(15) + "| " +
            (ro.dh1>=0?"+":"") + ro.dh1.toFixed(1).padStart(5) + "  | " +
            (ro.dh4>=0?"+":"") + ro.dh4.toFixed(1).padStart(5) + "  | " +
            (ro.dh16>=0?"+":"") + ro.dh16.toFixed(1).padStart(5) + "  | " +
            (ro.dBg>=0?"+":"") + ro.dBg.toFixed(1).padStart(5) + "  | " +
            (ro.dCl>=0?"+":"") + ro.dCl.toFixed(0).padStart(5));
      }
   }
   L("\n=== DONE ===");
}

try { main(); } catch(e) { L("FATAL: " + e.message + (e.stack ? "\n"+e.stack:"")); }
