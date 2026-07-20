// ===== CABRAMAGIC-BEGIN (auto-process analyzer + classifier) =====
// Master flag — false removes the CabraMagic button and all hooks.
var OPT_CABRAMAGIC_ENABLED = true;

// Analyzes a (linear or non-linear) view and returns robust statistics used to
// classify the deep-sky object type. Pure-JS (headless-safe): does NOT depend on
// StarDetector/GPU. Star density is a compact-bright-peak proxy, extended
// structure is measured from a large box-blur (removes stars), and concentration
// is the normalized RMS spread of the extended flux about its centroid.
// Box-average downsample of a luminance buffer to a standard analysis resolution.
// Pure JS (no IntegerResample => no astrometric-deletion confirmation dialog), and it
// regularizes the star/structure statistics across very different input sizes and
// linear/stretched regimes (correlated stacking noise and saturated star plateaus are
// averaged away). Returns {a, w, h}.
function optCabraBoxDown(src, w, h, maxDim) {
   var k = Math.ceil(Math.max(w, h) / maxDim);
   if (k <= 1) return { a: src, w: w, h: h };
   var wr = Math.floor(w / k), hr = Math.floor(h / k), out = new Float32Array(wr * hr), inv = 1 / (k * k);
   for (var y = 0; y < hr; ++y) {
      var orow = y * wr, y0 = y * k;
      for (var x = 0; x < wr; ++x) {
         var s = 0, x0 = x * k;
         for (var yy = 0; yy < k; ++yy) { var row = (y0 + yy) * w + x0; for (var xx = 0; xx < k; ++xx) s += src[row + xx]; }
         out[orow + x] = s * inv;
      }
   }
   return { a: out, w: wr, h: hr };
}

function optCabraAnalyze(view) {
   if (!optSafeView(view)) throw new Error("No valid view to analyze.");
   var img = view.image, w = img.width, h = img.height, count = w * h, rect = new Rect(0, 0, w, h);
   var nch = img.numberOfChannels;
   var Y = new Float32Array(count), mr = 0, mg = 0, mb = 0;
   if (nch >= 3) {
      var R = new Float32Array(count), G = new Float32Array(count), B = new Float32Array(count);
      img.getSamples(R, rect, 0); img.getSamples(G, rect, 1); img.getSamples(B, rect, 2);
      var sr = 0, sg = 0, sb = 0;
      for (var i = 0; i < count; ++i) { Y[i] = 0.2126 * R[i] + 0.7152 * G[i] + 0.0722 * B[i]; sr += R[i]; sg += G[i]; sb += B[i]; }
      mr = sr / count; mg = sg / count; mb = sb / count;
   } else {
      img.getSamples(Y, rect, 0);
   }
   // Reduce to a standard analysis resolution (pure JS, no process/dialog). All metrics
   // below are scale-relative, so this only makes star/structure detection robust and
   // fast regardless of the (often 24+ Mpx) input. Channel means (mr/mg/mb) keep the
   // full-frame values computed above.
   var ds = optCabraBoxDown(Y, w, h, 1500);
   Y = ds.a; w = ds.w; h = ds.h; count = w * h;
   // Background = 5th percentile; noise estimated ONLY from the dark population
   // (lowest 30%), so a frame-filling nebula does NOT inflate it (global MAD would).
   var step = Math.max(1, Math.floor(count / 60000)), samp = [];
   for (var s = 0; s < count; s += step) samp.push(Y[s]);
   samp.sort(function(a, b) { return a - b; });
   var ns = samp.length;
   var bg = samp[Math.floor(ns * 0.05)] || 0;
   var med = samp[Math.floor(ns * 0.5)] || 0;
   var darkN = Math.max(8, Math.floor(ns * 0.30)), dmed = samp[Math.floor(darkN / 2)] || bg;
   var ddev = []; for (var d = 0; d < darkN; ++d) ddev.push(Math.abs(samp[d] - dmed));
   ddev.sort(function(a, b) { return a - b; });
   var noise = (1.4826 * (ddev[Math.floor(ddev.length / 2)] || 0)) || 1e-5;
   // STAR-REMOVED (morphological opening r=2) on the luminance; threshold relative to
   // the dark-sky noise so faint diffuse structure is detected on linear data too.
   var op = optDetailBoxMax(optDetailBoxMin(Y, w, h, 2), w, h, 2);
   var thrExt = bg + 4 * noise, extCount = 0, cxw = 0, cyw = 0, wsum = 0;
   for (var p = 0; p < count; ++p) {
      if (op[p] > thrExt) { var x = p % w, y = (p - x) / w, wgt = op[p] - bg; extCount++; cxw += x * wgt; cyw += y * wgt; wsum += wgt; }
   }
   var extendedFraction = extCount / count;
   // Non-parametric Concentration index C = 5*log10(r80/r20) of the diffuse flux
   // about its centroid (Conselice/Lotz). High C = concentrated (galaxy), low C =
   // spread (nebula). Radial-flux histogram, no full sort.
   var concentrationIndex = 0;
   if (wsum > 0 && extCount > 50) {
      var cx = cxw / wsum, cy = cyw / wsum, nbins = 160, hist = new Float64Array(nbins), diag = Math.sqrt(w * w + h * h);
      for (var p2 = 0; p2 < count; ++p2) {
         if (op[p2] > thrExt) { var x2 = p2 % w, y2 = (p2 - x2) / w, dx = x2 - cx, dy = y2 - cy;
            var bin = Math.floor(Math.sqrt(dx * dx + dy * dy) / diag * nbins); if (bin >= nbins) bin = nbins - 1; hist[bin] += (op[p2] - bg); }
      }
      var tot = 0, b1; for (b1 = 0; b1 < nbins; ++b1) tot += hist[b1];
      var cum = 0, r20 = -1, r80 = -1;
      for (var b2 = 0; b2 < nbins; ++b2) { cum += hist[b2]; var frac = cum / tot, rr = (b2 + 1) / nbins * diag;
         if (r20 < 0 && frac >= 0.20) r20 = rr; if (frac >= 0.80) { r80 = rr; break; } }
      if (r20 > 0 && r80 > 0) concentrationIndex = 5 * (Math.log(r80 / r20) / Math.LN10);
   }
   // Star count = bright, compact, PSF-shaped peaks. Noise-robust (tuning #3): a
   // single-pixel noise spike in a low-SNR / narrowband frame previously counted as a
   // star and inflated the density (saturating starReduce). We now require (a) a higher
   // threshold, (b) real prominence over the star-removed background, (c) a STRICT local
   // maximum on the 4-connected neighbours, and (d) PSF "wings": at least 2 direct
   // neighbours also elevated above the sky — a real star's core is wider than 1px, a
   // noise spike's neighbours are not.
   var thrStar = bg + 7 * noise, thrWing = bg + 3 * noise, starCount = 0;
   for (var y3 = 1; y3 < h - 1; ++y3) {
      var rowb = y3 * w;
      for (var x3 = 1; x3 < w - 1; ++x3) {
         var i3 = rowb + x3, v = Y[i3];
         if (v <= thrStar || (v - op[i3]) <= 5 * noise) continue;
         // strict 4-connected local max (kills plateaus / double counts), >= on diagonals
         if (!(v > Y[i3 - 1] && v > Y[i3 + 1] && v > Y[i3 - w] && v > Y[i3 + w])) continue;
         if (!(v >= Y[i3 - w - 1] && v >= Y[i3 - w + 1] && v >= Y[i3 + w - 1] && v >= Y[i3 + w + 1])) continue;
         var wings = (Y[i3 - 1] > thrWing ? 1 : 0) + (Y[i3 + 1] > thrWing ? 1 : 0) +
                     (Y[i3 - w] > thrWing ? 1 : 0) + (Y[i3 + w] > thrWing ? 1 : 0);
         if (wings >= 2) starCount++;
      }
   }
   var starDensity = starCount / Math.max(0.01, count / 1e6);
   var narrowbandLikely = false;
   if (nch >= 3) {
      var maxc = Math.max(mr, mg, mb), minc = Math.min(mr, mg, mb);
      narrowbandLikely = (maxc > 1e-4) && ((maxc - minc) / maxc > 0.35) && (mg < Math.max(mr, mb) * 0.9);
   }
   return { w: w, h: h, isColor: nch >= 3, background: bg, median: med, noise: noise,
            extendedFraction: extendedFraction, concentrationIndex: concentrationIndex,
            starCount: starCount, starDensity: starDensity,
            meanR: mr, meanG: mg, meanB: mb, narrowbandLikely: narrowbandLikely };
}

// HYBRID model: the label below is INFORMATIONAL only (a human-readable summary).
// The actual processing is driven by optCabraBuildRecipe() from the CONTINUOUS
// metrics, so a misnamed label never changes the result. Validated on real linear
// data (Orion/Pleiades/Rosette/Soul/Tulip/Witch/IC1396): a hard galaxy/nebula split
// on C is unreliable because a bright concentrated nebula core (M42) is statistically
// indistinguishable from a galaxy. We therefore name only what is robust.
function optCabraClassify(st) {
   var reasons = [], cls;
   // A strongly concentrated source (C high) is checked FIRST: ext is frame-relative,
   // so a small bright object (planetary nebula NGC2392 C=4-8, galaxy bulge, M42 core)
   // can sit below the starfield ext gate yet clearly dominate. C catches it regardless.
   if (st.concentrationIndex >= 3.0) {
      cls = "compact";
      reasons.push("strongly concentrated source C=" + st.concentrationIndex.toFixed(2) + " (planetary / galaxy core / bright nebula core)");
   } else if (st.extendedFraction < 0.03) {
      cls = "starfield";
      reasons.push("no diffuse structure after star removal (cluster / star field)");
   } else {
      cls = "nebula";
      reasons.push("extended diffuse structure ext=" + st.extendedFraction.toFixed(2) + " (nebula / extended object incl. galaxies)");
   }
   if (st.narrowbandLikely) reasons.push("narrowband palette likely");
   return { className: cls, narrowband: st.narrowbandLikely === true, reasons: reasons };
}

// METRIC-DRIVEN RECIPE (the "brain"). Maps continuous statistics to finishing
// parameters for the engines we actually own (Color Mixer / Detail&Contrast /
// Star Reduction). Returns a plain object the Executor consumes. No hard class
// gating: every parameter is a smooth function of the measured stats, so the recipe
// degrades gracefully across the galaxy<->nebula ambiguity.
function optCabraBuildRecipe(st) {
   function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
   var ext = st.extendedFraction, C = st.concentrationIndex, dens = st.starDensity;
   var label = optCabraClassify(st);
   // Star reduction: scales with star density (busy fields get more). Tuning #B:
   // gentler ramp + lower cap (0.45) for the "balanced" aesthetic — 0.55 over-reduced
   // dense fields (Witch hit the cap). Now reliable thanks to the noise-robust detector.
   var starReduce = clamp((dens - 6000) / 70000, 0, 0.45);
   // Structure / local-contrast boost: scales with diffuse extent (more nebula -> more).
   var structure = clamp(0.10 + ext * 0.45, 0.10, 0.35);
   // Core protection: high concentration -> protect the bright core from over-sharpening.
   var coreProtect = clamp((C - 1.5) / 2.5, 0, 1);
   // Detail sharpening: compact objects tolerate more; broad faint nebulae less (noise).
   var detailAmount = clamp(0.12 + coreProtect * 0.18 - ext * 0.10, 0.06, 0.30);
   // Fixed modest saturation lift (tuning #1). Narrowband CANNOT be reliably detected
   // from linear statistics — raw NB channels are highly correlated, giving LOW chroma
   // (the opposite of the old "NB = saturated" assumption), and the per-image guess
   // flagged over-saturated LRGB artifacts while missing real SHO/HSO. Validated on the
   // 38-image test set. A single gentle lift is honest and safe; finer color decisions
   // belong AFTER the stretch, not in the linear analysis.
   var saturation = 0.15;
   return {
      label: label.className, narrowband: label.narrowband, reasons: label.reasons,
      starReduce: Math.round(starReduce * 100) / 100,
      structure: Math.round(structure * 100) / 100,
      coreProtect: Math.round(coreProtect * 100) / 100,
      detailAmount: Math.round(detailAmount * 100) / 100,
      saturation: Math.round(saturation * 100) / 100
   };
}
// ===== CABRAMAGIC-TREE-BEGIN (input detection + decision tree) =====
// Quality/role thresholds (seeds, tunable).
var OPT_CABRA_USABLE_SNR   = 3.0;   // below this a channel is too weak to contribute
var OPT_CABRA_OS_DROP_SNR  = 4.0;   // O/S below this are dropped (case 3c)
var OPT_CABRA_RGB_STARS_RATIO = 0.6; // RGB SNR < this * Ha SNR => RGB only good for stars (3a)
// NB-VIA-RGB (2026-06-18, alternative for separate H/O/S): when true, the "nb" case ALSO
// offers a candidate that combines the NB into an HSO RGB (auto palette) and runs the new
// "rgb" pipeline on it, but with stars coloured by the SetiAstro NB->RGB transform. The
// classic NB candidates (optCabraComposeNBonly) are still produced for side-by-side
// comparison. Set to false to revert to classic-only.
var OPT_CABRA_NB_VIA_RGB_ENABLED = true;

// Reads the exposure time (seconds) from a view's FITS header, or 0 if absent.
function optCabraReadExposure(view) {
   try {
      var kw = view.window ? view.window.keywords : null;
      if (!kw) return 0;
      for (var i = 0; i < kw.length; ++i) {
         var n = String(kw[i].name || "").toUpperCase();
         if (n === "EXPTIME" || n === "EXPOSURE" || n === "EXPOINUS") {
            var val = parseFloat(String(kw[i].value).replace(/[^0-9.eE+-]/g, ""));
            if (isFinite(val) && val > 0) return val;
         }
      }
   } catch (e) {}
   return 0;
}

// DUALBAND-BEGIN: single-shot dual-band / OSC narrowband (L-eXtreme, L-Ultimate, Duo, ...).
// A dual-band colour sub holds Ha in red and OIII in green+blue; processed as plain RGB it loses
// the whole narrowband advantage, so CabraMagic extracts Ha/OIII and routes them to the NB
// pipeline. Detection is CONSERVATIVE — the FITS FILTER keyword only — so a true broadband RGB is
// never mis-split (a master that lost its FILTER keyword simply falls through to the RGB path).
// Reversibility: flag below + the runCabraMagic DUALBAND block. Set false to disable.
var OPT_CABRA_DUALBAND_ENABLED = true;

// True if a FILTER string names a known dual/multi-band one-shot filter. Pure (harness-testable).
function optCabraIsDualbandFilter(name) {
   var s = String(name || "").toLowerCase().replace(/[\s_\-+]/g, "");
   if (s.length === 0) return false;
   var keys = ["lextreme", "lenhance", "lultimate", "lquad", "quadband", "triband", "dualband",
               "duoband", "duo", "dual", "alpt", "triad"];
   for (var i = 0; i < keys.length; ++i) if (s.indexOf(keys[i]) >= 0) return true;
   // explicit "contains both Ha and OIII" (e.g. "Ha+OIII", "HaOIII")
   if ((s.indexOf("ha") >= 0 || s.indexOf("halpha") >= 0) && (s.indexOf("oiii") >= 0 || s.indexOf("o3") >= 0)) return true;
   return false;
}

// Read the FITS FILTER keyword; return the dual-band filter name if it is one, else null.
function optCabraDetectDualband(view) {
   if (typeof OPT_CABRA_DUALBAND_ENABLED !== "undefined" && !OPT_CABRA_DUALBAND_ENABLED) return null;
   if (!optSafeView(view) || view.image.numberOfChannels < 3) return null;
   try {
      var kw = view.window ? view.window.keywords : null;
      if (!kw) return null;
      for (var i = 0; i < kw.length; ++i) {
         var n = String(kw[i].name || "").toUpperCase();
         if (n === "FILTER" || n === "FILTER1" || n === "INSFLNAM") {
            var val = String(kw[i].value || "").replace(/'/g, "").trim();
            if (optCabraIsDualbandFilter(val)) return val;
         }
      }
   } catch (e) {}
   return null;
}

// Extract Ha (red) and OIII (green+blue average) mono views from a dual-band colour view.
// Returns { ha, oiii } as new hidden mono views (caller closes them).
function optCabraExtractDualband(view, baseId) {
   if (!optSafeView(view) || view.image.numberOfChannels < 3)
      throw new Error("Dual-band extract: need a 3-channel colour view.");
   var tag = baseId || "CM_DB";
   var haV = optExtractGrayChannelView(view, 0, tag + "_Ha");   // Ha = red channel
   if (!optSafeView(haV)) throw new Error("Dual-band extract: Ha (red channel) failed.");
   var oWin = optCreateWindowLike(view, tag + "_OIII", 1, false);   // OIII = mean(green, blue)
   try {
      oWin.mainView.beginProcess(UndoFlag_NoSwapFile);
      var pm = new PixelMath();
      pm.useSingleExpression = true; pm.createNewImage = false;
      pm.expression = "0.5*(" + view.id + "[1] + " + view.id + "[2])";
      pm.executeOn(oWin.mainView);
      oWin.mainView.endProcess();
      try { oWin.hide(); } catch (eH) {}
   } catch (e) {
      try { oWin.forceClose(); } catch (eC) {}
      try { optCloseView(haV); } catch (eC2) {}
      throw e;
   }
   return { ha: haV, oiii: oWin.mainView };
}
// DUALBAND-END

// Robust per-channel quality: background (5th pct), noise (dark-population MAD) and a
// structure SNR = (median - background) / noise. Pure-JS, downsampled for speed.
function optCabraChannelQuality(view) {
   if (!optSafeView(view)) return null;
   var img = view.image, w = img.width, h = img.height, count = w * h, rect = new Rect(0, 0, w, h);
   var Yf = new Float32Array(count);
   if (img.numberOfChannels >= 3) {
      var R = new Float32Array(count), G = new Float32Array(count), Bc = new Float32Array(count);
      img.getSamples(R, rect, 0); img.getSamples(G, rect, 1); img.getSamples(Bc, rect, 2);
      for (var i = 0; i < count; ++i) Yf[i] = 0.2126 * R[i] + 0.7152 * G[i] + 0.0722 * Bc[i];
   } else img.getSamples(Yf, rect, 0);
   var ds = optCabraBoxDown(Yf, w, h, 1500); Yf = ds.a; count = ds.w * ds.h;
   var step = Math.max(1, Math.floor(count / 60000)), samp = [];
   for (var s = 0; s < count; s += step) samp.push(Yf[s]);
   samp.sort(function(a, b) { return a - b; });
   var ns = samp.length, bg = samp[Math.floor(ns * 0.05)] || 0, med = samp[Math.floor(ns * 0.5)] || 0;
   var darkN = Math.max(8, Math.floor(ns * 0.30)), dmed = samp[Math.floor(darkN / 2)] || bg, ddev = [];
   for (var d = 0; d < darkN; ++d) ddev.push(Math.abs(samp[d] - dmed));
   ddev.sort(function(a, b) { return a - b; });
   var noise = (1.4826 * (ddev[Math.floor(ddev.length / 2)] || 0)) || 1e-5;
   return { background: bg, median: med, noise: noise, snr: (med - bg) / noise, exposure: optCabraReadExposure(view) };
}

// DECISION TREE: given a channel map {R,G,B,L,H,O,S,RGB: view|null}, classify the input
// scenario and decide how to combine. Pure (testable headless). Returns:
//   { caseId: "rgb"|"nb"|"rgb_nb"|"none", role, usableNB:[...], hasL, quality:{}, reasons:[] }
function optCabraDecideTree(map) {
   function q(k) { return (map[k] && optSafeView(map[k])) ? optCabraChannelQuality(map[k]) : null; }
   var Q = { R: q("R"), G: q("G"), B: q("B"), L: q("L"), H: q("H"), O: q("O"), S: q("S"), RGB: q("RGB") };
   var reasons = [];
   function usable(x) { return x && x.snr >= OPT_CABRA_USABLE_SNR; }
   var hasBroadRGB = usable(Q.RGB) || (usable(Q.R) && usable(Q.G) && usable(Q.B));
   var hasHa = usable(Q.H);
   var nbPresent = hasHa || usable(Q.O) || usable(Q.S);
   // usable NB list (SNR gate; O/S held to a higher bar — case 3c)
   var usableNB = [];
   if (hasHa) usableNB.push("H");
   if (Q.O && Q.O.snr >= OPT_CABRA_OS_DROP_SNR) usableNB.push("O"); else if (usable(Q.O)) reasons.push("OIII SNR low (" + Q.O.snr.toFixed(1) + ") - dropped");
   if (Q.S && Q.S.snr >= OPT_CABRA_OS_DROP_SNR) usableNB.push("S"); else if (usable(Q.S)) reasons.push("SII SNR low (" + Q.S.snr.toFixed(1) + ") - dropped");

   var caseId = "none", role = "";
   if (hasBroadRGB && !nbPresent) { caseId = "rgb"; reasons.push("broadband only -> RGB pipeline"); }
   else if (!hasBroadRGB && nbPresent) { caseId = "nb"; reasons.push("narrowband only -> NB pipeline (stars via NB->RGB transform)"); }
   else if (hasBroadRGB && nbPresent) {
      caseId = "rgb_nb";
      // RGB role: SNR primary, exposure tiebreaker. Compare RGB structure SNR to Ha SNR.
      var rgbSNR = usable(Q.RGB) ? Q.RGB.snr : (((Q.R ? Q.R.snr : 0) + (Q.G ? Q.G.snr : 0) + (Q.B ? Q.B.snr : 0)) / 3);
      var haSNR = hasHa ? Q.H.snr : 1e9;
      var rgbExp = usable(Q.RGB) ? Q.RGB.exposure : (Q.R ? Q.R.exposure : 0);
      var nbExp = hasHa ? Q.H.exposure : 0;
      var poor = rgbSNR < OPT_CABRA_RGB_STARS_RATIO * haSNR;
      if (poor) reasons.push("RGB SNR " + rgbSNR.toFixed(1) + " << Ha " + haSNR.toFixed(1));
      // A much SHORTER RGB integration is a deliberate star-grab regardless of SNR
      // (e.g. 10s RGB next to 180s NB). Primary signal, not just a tiebreaker.
      if (!poor && rgbExp > 0 && nbExp > 0 && rgbExp < 0.35 * nbExp) { poor = true; reasons.push("RGB exposure " + rgbExp + "s << NB " + nbExp + "s (star-grab)"); }
      if (poor) { role = "stars_only"; reasons.push("-> RGB for stars only (3a)"); }
      else { role = "full"; reasons.push("RGB quality good (SNR " + rgbSNR.toFixed(1) + ") -> stars + starless combined with NB (3b)"); }
   } else reasons.push("no usable input found");

   return { caseId: caseId, role: role, usableNB: usableNB, hasL: usable(Q.L), quality: Q, reasons: reasons };
}
// ===== CABRAMAGIC-TREE-END =====

// ===== NB-TO-RGB-STARS-BEGIN =====
// Reusable narrowband->RGB star-color transform (SetiAstro "NB to RGB Stars", Franklin
// Marek, CC BY-NC 4.0). Builds a realistic RGB star color from Ha/OIII/SII star images:
//   R = 0.5*Ha + 0.5*(SII or Ha),  G = ratio*Ha + (1-ratio)*OIII,  B = OIII
// then SCNR(green) -> MTF(0.01) stretch -> SCNR(green) -> MTF(0.99) reverse, which
// neutralizes the magenta/green star cast while keeping a natural balance. Standalone
// (no flag) so it can also be reused from the manual workflow. Returns the new RGB view.
function optNbScnrGreenStars(view) {
   var s = new SCNR;
   try { s.amount = 1.0; } catch (e0) {}
   try { s.protectionMethod = SCNR.AverageNeutral; } catch (e1) {}
   try { s.colorToRemove = SCNR.Green; } catch (e2) {}
   try { s.preserveLightness = true; } catch (e3) {}
   s.executeOn(view);
}
function optNbMtfStars(view, m) {
   var P = new PixelMath;
   P.expression = "mtf(" + m + ", $T)";
   P.useSingleExpression = true;
   P.createNewImage = false;
   P.executeOn(view);
}
// SetiAstro "Apply Star Stretch": strong nonlinear stretch + ColorSaturation. Without this
// the NB->RGB combination stays linear/dark (looks grey); the colour only emerges here.
function optNbStarStretch(view, stretchFactor, colorBoost) {
   var sf = isFinite(stretchFactor) ? stretchFactor : 5;
   var cb = isFinite(colorBoost) ? colorBoost : 1.0;
   var P = new PixelMath;
   P.expression = "((3^" + sf + ")*$T)/((3^" + sf + "-1)*$T+1)";
   P.useSingleExpression = true;
   P.createNewImage = false;
   P.executeOn(view);
   var C = new ColorSaturation;
   C.HS = [
      [0.00000, cb * 0.40000],
      [0.50000, cb * 0.70000],
      [1.00000, cb * 0.40000]
   ];
   C.HSt = ColorSaturation.AkimaSubsplines;
   C.hueShift = 0.000;
   C.executeOn(view);
}
function optNBtoRGBStars(haView, oiiiView, siiView, opts) {
   opts = opts || {};
   if (!optSafeView(haView) || !optSafeView(oiiiView))
      throw new Error("NB->RGB stars: need at least Ha and OIII star views.");
   var ratio = isFinite(opts.haToOiiRatio) ? opts.haToOiiRatio : 0.3;
   var sii = optSafeView(siiView) ? siiView : haView;
   var newId = opts.newImageId || "NBtoRGB_stars";
   var P = new PixelMath;
   P.expression  = "0.5*" + haView.id + " + 0.5*" + sii.id;
   P.expression1 = ratio + "*" + haView.id + " + ~" + ratio + "*" + oiiiView.id;
   P.expression2 = oiiiView.id;
   P.expression3 = "";
   P.useSingleExpression = false;
   P.generateOutput = true;
   P.truncate = true; P.truncateLower = 0; P.truncateUpper = 1;
   P.rescale = false;
   P.createNewImage = true;
   P.showNewImage = opts.show === true;
   P.newImageId = newId;
   P.newImageColorSpace = PixelMath.RGB;
   P.newImageSampleFormat = PixelMath.SameAsTarget;
   P.executeOn(haView);
   var win = ImageWindow.windowById(newId);
   if (!win || win.isNull) throw new Error("NB->RGB stars: PixelMath did not produce '" + newId + "'.");
   var v = win.mainView;
   // SetiAstro color-balance trick: balance star colors while briefly stretched.
   optNbScnrGreenStars(v);
   optNbMtfStars(v, 0.01);
   optNbScnrGreenStars(v);
   optNbMtfStars(v, "~0.01");   // reverse stretch (mtf(0.99,$T))
   // Apply the (recommended) SetiAstro star stretch so the result is non-linear and
   // colourful. Skipped only if the caller explicitly opts out (opts.applyStretch === false).
   if (opts.applyStretch !== false)
      optNbStarStretch(v, opts.stretchFactor, opts.colorBoost);
   return v;
}
// True if narrowband info (H, O, or an HSO composite) is loaded — gates the
// "Use NB stars to produce RGB stars" option in Stretching.
function optHasNbInfoForStars(dialog) {
   function sv(k) { try { var r = dialog.store.record(k); return optSafeView(r.view); } catch (e) { return false; } }
   return (sv("H") || sv("O") || sv("HSO") || sv("H_Stars") || sv("O_Stars"));
}
// Applies SetiAstro NB->RGB star colour to the stars view in Stretching: gathers the
// Ha/OIII/SII Star-Split layers from the store, builds realistic RGB stars and assigns
// them into `view`. The user typically works on a *mono* star channel (H Stars / O Stars /
// S Stars), so the target is mono — image.assign() of the RGB result converts it to a
// 3-channel RGB candidate. Requires at least Ha+OIII Star-Split layers. Returns true on success.
function optApplyNbStarsRGB(view, dialog, opts) {
   opts = opts || {};
   try { console.show(); } catch (e) {}
   if (!optSafeView(view)) { console.warningln("NB->RGB stars: no valid target view; skipped."); return false; }
   function sv(k) { try { var r = dialog.store.record(k); return optSafeView(r.view) ? r.view : null; } catch (e) { return null; } }
   var temps = [];
   // Requires the Star-Split star layers of the NB channels (proper, stretched star-only
   // images). On-the-fly extraction proved unreliable (gave grey stars), so we ask the
   // user to Star Split H/O (/S) first — the SetiAstro workflow expects separate NB stars.
   var ha = sv("H_Stars"), oiii = sv("O_Stars"), sii = sv("S_Stars");
   var ok = false;
   try {
      if (!optSafeView(ha) || !optSafeView(oiii)) {
         console.warningln("NB->RGB stars: needs the Star-Split star layers of the narrowband channels.");
         console.warningln("   -> Run Star Split on your H and OIII (and SII) channels first, so H_Stars / O_Stars exist, then re-run.");
      } else {
         console.writeln("=> NB->RGB stars: combining H_Stars + O_Stars" + (optSafeView(sii) ? " + S_Stars" : "") + " (SetiAstro transform).");
         var rgb = optNBtoRGBStars(ha, oiii, sii, {
            newImageId: optUniqueId("nbrgbstars"),
            stretchFactor: opts.stretchFactor,
            colorBoost: opts.colorBoost
         });
         if (optSafeView(rgb)) {
            temps.push(rgb.window);
            if (rgb.image.width === view.image.width && rgb.image.height === view.image.height) {
               view.beginProcess(UndoFlag_NoSwapFile); view.image.assign(rgb.image); view.endProcess();
               console.noteln("=> NB->RGB stars: applied (RGB star colour from narrowband).");
               ok = true;
            } else console.warningln("NB->RGB stars: NB star dimensions (" + rgb.image.width + "x" + rgb.image.height + ") differ from the stars layer (" + view.image.width + "x" + view.image.height + "); skipped.");
         }
      }
   } catch (eA) { console.warningln("NB->RGB stars: " + eA.message); }
   for (var i = 0; i < temps.length; ++i) { try { if (temps[i]) temps[i].forceClose(); } catch (e) {} }
   return ok;
}
// ===== NB-TO-RGB-STARS-END =====

// ===== CABRAMAGIC-COMPOSE-BEGIN (NB-dominant final composition) =====
// Star separation using StarXTerminator (the script's default Star Split engine).
function optCabraStarless(view) {
   var sxt = optCreateGenericProcessInstance(["StarXTerminator"], ["StarXTerminator", "SXT"]);
   if (!sxt) throw new Error("StarXTerminator not available for star separation.");
   try { optTrySetProcessPropertySilently(sxt, ["stars"], false); } catch (e) {}
   optAssertExecuteOk(sxt.executeOn(view), "StarXTerminator");
}
// Pull each channel so its 5th-percentile background -> target (neutral dark sky).
function optCabraSetBlackPoint(view, target) {
   var im = view.image, w = im.width, h = im.height, n = w * h, rc = new Rect(0, 0, w, h), nc = im.numberOfChannels;
   for (var c = 0; c < nc; ++c) {
      var a = new Float32Array(n); im.getSamples(a, rc, c);
      var s = [], st = Math.max(1, Math.floor(n / 40000));
      for (var i = 0; i < n; i += st) s.push(a[i]);
      s.sort(function(x, y) { return x - y; });
      var bg = s[Math.floor(s.length * 0.05)] || 0, sh = bg - target;
      view.beginProcess(UndoFlag_NoSwapFile);
      for (var j = 0; j < n; ++j) { var val = a[j] - sh; a[j] = val < 0 ? 0 : (val > 1 ? 1 : val); }
      im.setSamples(a, rc, c); view.endProcess();
   }
}
// V2-P2 soft variant: same per-channel shift toward `target`, but shadows below
// half-target are COMPRESSED (slope 1/2) instead of clipped to 0, so faint signal
// riding just above the background (IFN, tidal tails, outer shells) survives the
// black-point set. The hard variant above is kept for callers that want a true clip.
function optCabraSetBlackPointSoft(view, target) {
   var im = view.image, w = im.width, h = im.height, n = w * h, rc = new Rect(0, 0, w, h), nc = im.numberOfChannels;
   var knee = Math.max(0.005, target * 0.5);
   for (var c = 0; c < nc; ++c) {
      var a = new Float32Array(n); im.getSamples(a, rc, c);
      var s = [], st = Math.max(1, Math.floor(n / 40000));
      for (var i = 0; i < n; i += st) s.push(a[i]);
      s.sort(function(x, y) { return x - y; });
      var bg = s[Math.floor(s.length * 0.05)] || 0, sh = bg - target;
      view.beginProcess(UndoFlag_NoSwapFile);
      for (var j = 0; j < n; ++j) {
         var val = a[j] - sh;
         if (val < knee) val = knee + (val - knee) * 0.5;   // soft shadow knee
         a[j] = val < 0 ? 0 : (val > 1 ? 1 : val);
      }
      im.setSamples(a, rc, c); view.endProcess();
   }
}
function optCabraClonePM(view, id) {
   var P = new PixelMath; P.expression = view.id; P.useSingleExpression = true; P.createNewImage = true;
   P.newImageId = id; P.newImageColorSpace = PixelMath.SameAsTarget; P.newImageSampleFormat = PixelMath.SameAsTarget; P.showNewImage = false;
   P.executeOn(view); return ImageWindow.windowById(id).mainView;
}
// Mono star image = stretched channel minus its starless version.
function optCabraMonoStars(fullV, id) {
   var sl = optCabraClonePM(fullV, id + "_sl");
   // F3-full: the `_sl` temp window must be closed even if optCabraStarless or the
   // PixelMath throws — guard with finally so a failure can't leak an orphan.
   try {
      optCabraStarless(sl);
      var P = new PixelMath; P.expression = "max(0," + fullV.id + "-" + sl.id + ")"; P.useSingleExpression = true;
      P.createNewImage = true; P.newImageId = id; P.newImageColorSpace = PixelMath.Gray; P.newImageSampleFormat = PixelMath.SameAsTarget; P.showNewImage = false;
      P.executeOn(fullV);
   } finally {
      try { var slWin = ImageWindow.windowById(id + "_sl"); if (slWin && !slWin.isNull) slWin.forceClose(); }
      catch (e) { if (typeof optDiagError === "function") optDiagError("cabra-monostars-cleanup", e, ""); }
   }
   return ImageWindow.windowById(id).mainView;
}
// Composite an RGB star layer onto a starless nebula so star colours are PRESERVED
// (strong mask: at a star the star colour replaces the nebula, no nebula tint). k=brightness.
function optCabraStarComposite(nebView, starsView, k, outId) {
   var N = nebView.id, ST = starsView.id, kk = isFinite(k) ? k : 0.8;
   var m = "min(1,3*max(" + ST + "[0]," + ST + "[1]," + ST + "[2]))";
   var P = new PixelMath;
   P.expression  = N + "[0]*(1-" + m + ")+" + kk + "*" + ST + "[0]";
   P.expression1 = N + "[1]*(1-" + m + ")+" + kk + "*" + ST + "[1]";
   P.expression2 = N + "[2]*(1-" + m + ")+" + kk + "*" + ST + "[2]";
   P.useSingleExpression = false; P.generateOutput = true; P.createNewImage = true;
   P.truncate = true; P.truncateLower = 0; P.truncateUpper = 1; P.rescale = false; P.showNewImage = false;
   P.newImageId = outId; P.newImageColorSpace = PixelMath.RGB; P.newImageSampleFormat = PixelMath.SameAsTarget;
   P.executeOn(nebView); return ImageWindow.windowById(outId).mainView;
}
function optCabraStretchNB(view, intensity, dialog) {
   optCabraBackground(view, dialog);
   optRunAutoGhsStretch(view, { aghs_intensity: isFinite(intensity) ? intensity : 0.85, aghs_bp: 3.2 });
}
// Adaptive denoise for a (linear) narrowband channel BEFORE the SXT split. StarXTerminator
// tiles produce a visible grid on low-SNR data; denoising first lets it work cleanly, so even
// a weak channel keeps its colour instead of being dropped. Strength scales with the measured
// noise (optCabraChannelQuality SNR): clean channel ~0.3, noisy ~0.6+. Noise = quality lever.
function optCabraDenoiseNBAdaptive(view, dialog) {
   var snr = 4.0;
   try { var q = optCabraChannelQuality(view); if (q && isFinite(q.snr)) snr = q.snr; } catch (e) {}
   var s = 0.5 + (4 - snr) * 0.12;
   if (s < 0.3) s = 0.3; else if (s > 0.8) s = 0.8;
   console.noteln("=> CabraMagic NB denoise: SNR " + snr.toFixed(1) + " -> strength " + s.toFixed(2));
   try { optCabraDenoiseFallback(view, dialog, s); } catch (e2) { if (typeof optDiagError === "function") optDiagError("cabra-nb-denoise", e2, ""); }
}
// ADAPTIVE finishing parameters from the diffuse extent (extendedFraction). Multi-target
// bench finding: fixed saturation/stretch overfit a frame-filling nebula and wash out
// small objects (galaxies/planetaries on dark sky). Frame-filling nebula -> high
// saturation + strong stretch; small object -> low saturation + gentle stretch + darker
// sky. Structure was NOT the gap (mine >= reference), so NO structure boost is added.
function optCabraFinishParams(ext) {
   function cl(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
   var e = isFinite(ext) ? ext : 0.15;
   return {
      saturation:       cl(1.10 + e * 3.2, 1.10, 2.60),   // moderate; pushing higher looked over-saturated/garish (GUI feedback)
      redBoost:         cl(1.00 + e * 0.80, 1.00, 1.35),
      blackPoint:       cl(0.06 + e * 0.06, 0.06, 0.10),   // neutral dark sky
      stretchIntensity: cl(0.64 + e * 0.55, 0.64, 0.85),
      lumTarget:        cl(0.10 + e * 0.20, 0.10, 0.20)    // galaxy/small ~0.10, frame-filling nebula ~0.20 (from reference finals)
   };
}
// ===== CABRA-V2 SHARED FINISHER (P2 canonical order + P3 self-check) =====
// One finishing tail for BOTH pipelines (single-image run and the multichannel
// composes), applied to a STRETCHED view. Canonical order per the community
// reference workflows (nrStellar / RC Astro / CN): colour cast -> colour boost ->
// brightness target -> midtone S-curve ("Curves is the most powerful tool") ->
// neutral dark sky -> optional final detail. Colour uses VIBRANCE (the existing
// Detail engine: boosts faint colour, spares already-vivid pixels — a masked
// saturation without mask plumbing) plus a CONTAINED flat saturation, replacing
// the old single flat multiplier that amplified background chroma noise.
// P3: after finishing, the view is measured with optQualityMetrics and up to one
// corrective iteration runs on the cheap tail ops (brightness re-target, highlight
// taming) — the autopilot checks its own output instead of hoping.
function optCabraFinishView(view, dialog, fp, o) {
   o = o || {};
   var isColor = view.image.numberOfChannels >= 3;
   var satX = isFinite(o.saturation) ? o.saturation : fp.saturation;
   var lumT = isFinite(o.lumTarget) ? o.lumTarget : fp.lumTarget;
   // NOISE-AWARE BOOSTS (user feedback 2026-07-02: "the grain appears at the END of
   // the RGB treatment"). The tail's vibrance / S-curve / edge-aware detail are noise
   // AMPLIFIERS running after the denoise, so on a noisy field they re-manufacture
   // grain — vibrance is the worst (it boosts faint chroma = background colour mottle).
   // Measure BEFORE boosting and scale the amplifiers down as SNR drops.
   var snr0 = 10, noisy = false, veryNoisy = false;
   try {
      if (typeof optQualityMetrics === "function") {
         var q0 = optQualityMetrics(view);
         if (isFinite(q0.snr)) snr0 = q0.snr;
      }
      noisy = snr0 < 5; veryNoisy = snr0 < 3;
      if (noisy) console.noteln("=> CabraMagic finish: SNR " + snr0.toFixed(1) + (veryNoisy ? " (very noisy)" : " (noisy)") +
         " -> damped boosts" + (veryNoisy ? " + vibrance OFF" : "") + " + chroma cleanup.");
   } catch (eN) {}
   if (isColor && o.skipGreen !== true)
      try { optCabraRemoveGreen(view); } catch (eG) {}
   if (isColor) {
      if (!veryNoisy) {
         var vibA = Math.max(0.15, Math.min(0.45, 0.15 + (satX - 1) * 0.15));
         if (noisy) vibA *= 0.5;
         try { optRunDetailOnView(view, { algoId: "vibrance", vibAmount: vibA }); } catch (eV) {}
      }
      var satFlat = Math.min(1.35, 1 + (satX - 1) * 0.4);
      if (noisy) satFlat = 1 + (satFlat - 1) * 0.6;
      try { optCabraSaturate(view, satFlat, 0); } catch (eS) {}
   }
   try { optCabraTargetBrightness(view, lumT); } catch (eB) {}
   if (o.sCurve !== false) {
      var sigS = isFinite(o.sigStrength) ? o.sigStrength : 3.2;
      if (noisy) sigS = Math.max(2.0, sigS * 0.75);
      try { optRunDetailOnView(view, { algoId: "sigmoid", sigStrength: sigS, sigBias: 0.42 }); } catch (eC) {}
   }
   try { optCabraSetBlackPointSoft(view, isFinite(o.blackPoint) ? o.blackPoint : fp.blackPoint); } catch (eK) {}
   if (isFinite(o.detailAmount) && o.detailAmount > 0 && !veryNoisy) {
      var eaA = o.detailAmount * (noisy ? 0.6 : 1.0);
      try { optRunDetailOnView(view, { algoId: "edgeAware", eaRadius: 8, eaAmount: eaA }); } catch (eD) {}
   }
   // CHROMA CLEANUP (noisy colour fields): a chroma-only TGV pass kills the coloured
   // mottle the boosts amplified WITHOUT touching luminance detail (strengthL ~0).
   // Native TGVDenoise -> always available; only runs when the field measured noisy.
   if (isColor && noisy) {
      try {
         optExecuteTgvDenoiseConfiguredOnView(view, { strengthL: 0.3, strengthC: 2.5, edgeProtection: 0.002, smoothness: 2.0, maxIterations: 150 });
         console.noteln("=> CabraMagic finish: chroma-only cleanup applied (TGV C=2.5, L=0.3).");
      } catch (eT) {}
   }
   // ---- P3 quality gates (one corrective pass, tail ops only) ----
   try {
      if (typeof optQualityMetrics === "function") {
         var q = optQualityMetrics(view), fixes = [];
         if (q.median > 0 && lumT > 0 && Math.abs(q.median - lumT) / lumT > 0.35) {
            optCabraTargetBrightness(view, lumT);
            fixes.push("brightness re-target (median " + q.median.toFixed(3) + " vs " + lumT.toFixed(2) + ")");
         }
         if (q.saturationPct > 0.25) {
            optCabraTameHighlights(view, 0.88, 0.30);
            fixes.push("highlight taming (" + q.saturationPct.toFixed(2) + "% clipped)");
         }
         if (fixes.length) console.noteln("=> CabraMagic QA: corrected — " + fixes.join("; ") + ".");
         else console.noteln("=> CabraMagic QA: within gates (median " + q.median.toFixed(3) + ", clipped " + q.saturationPct.toFixed(2) + "%).");
      }
   } catch (eQ) {}
   return view;
}
// ===== CABRA-V2 SHARED FINISHER END =====

// Saturation boost so the NB palette reads vivid (dull/"mortecino" -> rich red/blue).
// Optional hueShift (turns) nudges warm tones toward red.
function optCabraSaturate(view, factor, hueShift) {
   if (view.image.numberOfChannels < 3) return;
   try { optApplyHueSaturationCorrectionToView(view, isFinite(hueShift) ? hueShift : 0, factor); } catch (e) {}
}
// Brings the luminance MEDIAN to a target (via a per-channel gamma), so the overall
// brightness matches the object type. Reference finals: galaxies sit dark (median ~0.10),
// nebulae medium (~0.20). Without this the AutoGHS stretch left everything too bright.
function optCabraTargetBrightness(view, target) {
   if (!(target > 0.02 && target < 0.6)) return;
   var im = view.image, w = im.width, h = im.height, n = w * h, rc = new Rect(0, 0, w, h), nc = im.numberOfChannels;
   var Y = new Float32Array(n);
   if (nc >= 3) { var R = new Float32Array(n), G = new Float32Array(n), Bc = new Float32Array(n); im.getSamples(R, rc, 0); im.getSamples(G, rc, 1); im.getSamples(Bc, rc, 2); for (var i = 0; i < n; ++i) Y[i] = 0.2126 * R[i] + 0.7152 * G[i] + 0.0722 * Bc[i]; }
   else im.getSamples(Y, rc, 0);
   var s = [], st = Math.max(1, Math.floor(n / 40000));
   for (var j = 0; j < n; j += st) s.push(Y[j]);
   s.sort(function(a, b) { return a - b; });
   var med = s[Math.floor(s.length / 2)] || 0;
   if (med <= 1e-3 || med >= 0.999) return;
   var gamma = Math.log(target) / Math.log(med);
   if (!(gamma > 0.2 && gamma < 6)) return;   // sanity clamp
   for (var c = 0; c < nc; ++c) {
      var a = new Float32Array(n); im.getSamples(a, rc, c);
      view.beginProcess(UndoFlag_NoSwapFile);
      for (var k = 0; k < n; ++k) { var v = a[k]; a[k] = v <= 0 ? 0 : Math.pow(v, gamma); }
      im.setSamples(a, rc, c); view.endProcess();
   }
}
// Soft highlight compression: pulls values above `knee` down (per channel) so blown star
// cores stop clipping to pure white. amount 0..1 (fraction of the over-knee range removed).
function optCabraTameHighlights(view, knee, amount) {
   if (!(amount > 0)) return;
   var im = view.image, w = im.width, h = im.height, n = w * h, rc = new Rect(0, 0, w, h), nc = im.numberOfChannels;
   for (var c = 0; c < nc; ++c) {
      var a = new Float32Array(n); im.getSamples(a, rc, c);
      view.beginProcess(UndoFlag_NoSwapFile);
      for (var i = 0; i < n; ++i) { var v = a[i]; if (v > knee) v = knee + (v - knee) * (1 - amount); a[i] = v > 1 ? 1 : v; }
      im.setSamples(a, rc, c); view.endProcess();
   }
}
// Red/blue balance push (>1 = more red-dominant, like a Ha-emphasized final). Scales R
// up and B slightly down about the midpoint, preserving overall brightness.
function optCabraRedBalance(view, factor) {
   if (!(factor > 1.0001) || view.image.numberOfChannels < 3) return;
   var im = view.image, w = im.width, h = im.height, n = w * h, rc = new Rect(0, 0, w, h);
   var R = new Float32Array(n), Bc = new Float32Array(n);
   im.getSamples(R, rc, 0); im.getSamples(Bc, rc, 2);
   var fb = 1 / Math.sqrt(factor);   // reduce blue by the inverse-sqrt so luma drifts little
   view.beginProcess(UndoFlag_NoSwapFile);
   for (var i = 0; i < n; ++i) { var r = R[i] * factor, b = Bc[i] * fb; R[i] = r > 1 ? 1 : r; Bc[i] = b > 1 ? 1 : b; }
   im.setSamples(R, rc, 0); im.setSamples(Bc, rc, 2); view.endProcess();
}
function optCabraCombinePalette(haSL, oiiiSL, siiSL, palette, outId) {
   var H = haSL.id, O = oiiiSL.id, S = (siiSL ? siiSL.id : haSL.id), eR, eG, eB;
   if (palette === "SHO") { eR = S; eG = H; eB = O; }
   // FORAXX (V2-P4): dynamic palette per the public Foraxx Palette Utility PixelMath.
   // The green channel blends Ha/OIII per-pixel weighted by the local signal
   // (pow(x,1-x) peaks at mid signal), giving the golden-teal "dynamic SHO" look the
   // community loves without the flat-green SHO cast. With SII present the red channel
   // gets the same dynamic Ha/SII blend; without SII it degrades to dynamic HOO.
   else if (palette === "FORAXX") {
      // NOTE: PixelMath has no pow(x,y) function — exponentiation is the ^ operator.
      if (siiSL) {
         var wH = "((" + H + ")^(1-" + H + "))";
         var wHO = "((" + H + "*" + O + ")^(1-(" + H + "*" + O + ")))";
         eR = wH + "*" + S + " + (1-" + wH + ")*" + H;
         eG = wHO + "*" + H + " + (1-" + wHO + ")*" + O;
         eB = O;
      } else {
         var wO = "((" + O + ")^(1-" + O + "))";
         eR = H;
         eG = wO + "*" + H + " + (1-" + wO + ")*" + O;
         eB = O;
      }
   }
   else { eR = H; eG = O; eB = O; }                      // HOO default
   var P = new PixelMath; P.expression = eR; P.expression1 = eG; P.expression2 = eB; P.expression3 = "";
   P.useSingleExpression = false; P.generateOutput = true; P.createNewImage = true;
   P.truncate = true; P.truncateLower = 0; P.truncateUpper = 1; P.rescale = false; P.showNewImage = false;
   P.newImageId = outId; P.newImageColorSpace = PixelMath.RGB; P.newImageSampleFormat = PixelMath.SameAsTarget;
   P.executeOn(haSL); return ImageWindow.windowById(outId).mainView;
}
// COMPACT-NB colour path (planetaries / small bright objects). The frame-filling compose
// (optCabraComposeNBonly) over-cooks a compact object — confirmed via the SXT debug windows:
// SXT separates correctly, but the per-channel stretch + saturate/brightness blow the core and
// amplify the faint background into noise mush. This mirrors the proven MONO treatment but in
// colour: denoise each channel by its noise, combine to the palette (keeps stars + the object,
// NO SXT extraction), BXT to sharpen without blowing, then AutoGHS with the noise ceiling (clean
// background) + colour saturation damping (no blown core). NO SCNR (the HOO/SHO colour is
// intentional) and none of the aggressive saturate/redBalance/targetBrightness of the classic
// compose. Inputs are LINEAR mono NB views; returns a new RGB "Final" view.
function optCabraComposeNBCompact(haView, oiiiView, siiView, palette, opts) {
   opts = opts || {};
   if (!optSafeView(haView) && optSafeView(oiiiView)) haView = oiiiView;          // degrade: O-only
   if (optSafeView(haView) && !optSafeView(oiiiView)) oiiiView = haView;          // degrade: Ha-only
   if (!optSafeView(haView)) throw new Error("NB compact: no usable narrowband channel.");
   var tag = opts.tag || "nbcompact", hasS = optSafeView(siiView), rgb = null;
   try {
      // 1) denoise each linear channel by its own noise (clean before combine + stretch).
      optCabraDenoiseNBAdaptive(haView, opts.dialog);
      if (oiiiView !== haView) optCabraDenoiseNBAdaptive(oiiiView, opts.dialog);
      if (hasS && siiView !== haView && siiView !== oiiiView) optCabraDenoiseNBAdaptive(siiView, opts.dialog);
      // 2) combine to colour (linear) — keeps the field stars AND the compact object.
      rgb = optCabraCombinePalette(haView, oiiiView, hasS ? siiView : null, palette || "HOO", tag + "_rgb");
      // 3) deconvolution (BXT): sharpens without blowing the compact core. Skipped if absent.
      try {
         if (optCabraToolAvailable(["BlurXTerminator"]))
            optExecuteBlurXConfiguredOnView(rgb, { automatic_psf: true, sharpen_stars: 0.10, adjust_star_halos: 0.0, sharpen_nonstellar: 0.20, correct_only: false });
      } catch (eB) { console.warningln("CabraMagic NB-compact: BXT skipped (" + (eB.message || eB) + ")."); }
      // 4) stretch — AutoGHS with the noise ceiling (no background mush) + colour saturation
      //    damping (no blown core). No SCNR, no aggressive finishing.
      optRunAutoGhsStretch(rgb, { aghs_intensity: 0.7, aghs_noiseCeiling: 0.05, aghs_saturation: 0.92 });
      // 5) gentle black point.
      optCabraSetBlackPoint(rgb, isFinite(opts.blackPoint) ? opts.blackPoint : 0.06);
      return rgb;
   } catch (e) {
      if (rgb && rgb.window && !rgb.window.isNull) { try { rgb.window.forceClose(); } catch (eR) {} }
      throw e;
   } finally {
      // Close the consumed input clones (the rgb result is independent of them).
      try { if (haView && haView.window && !haView.window.isNull) haView.window.forceClose(); } catch (e1) {}
      try { if (oiiiView && oiiiView !== haView && oiiiView.window && !oiiiView.window.isNull) oiiiView.window.forceClose(); } catch (e2) {}
      try { if (hasS && siiView && siiView !== haView && siiView !== oiiiView && siiView.window && !siiView.window.isNull) siiView.window.forceClose(); } catch (e3) {}
   }
}
// NB-ONLY branch composition: NB-dominant nebula (palette) + stars colored by the
// SetiAstro NB->RGB transform. Inputs are LINEAR mono NB views (Ha/OIII/SII). Returns a
// new RGB "Final" view. Validated on Collinder34 NB (HOO).
function optCabraComposeNBonly(haView, oiiiView, siiView, palette, opts) {
   opts = opts || {};
   if (!optSafeView(haView) && optSafeView(oiiiView)) haView = oiiiView;          // degrade: O-only
   if (optSafeView(haView) && !optSafeView(oiiiView)) oiiiView = haView;          // degrade: Ha-only
   if (!optSafeView(haView)) throw new Error("NB compose: no usable narrowband channel.");
   var tag = opts.tag || "nbonly";
   var ext = 0.15; try { ext = optCabraAnalyze(haView).extendedFraction; } catch (eX) {}
   var pp = optCabraFinishParams(ext);
   var sat = isFinite(opts.saturation) ? opts.saturation : pp.saturation;
   var red = isFinite(opts.redBoost) ? opts.redBoost : pp.redBoost;
   var bp  = isFinite(opts.blackPoint) ? opts.blackPoint : pp.blackPoint;
   var si  = isFinite(opts.stretchIntensity) ? opts.stretchIntensity : pp.stretchIntensity;
   var sHa = null, sO = null, sS = null, starsRGB = null, neb = null;
   // F3-full: temp NB intermediates must close even if a step throws — guard with finally.
   try {
   var hasS = optSafeView(siiView);
   // Denoise each channel (linear) by its own noise BEFORE the SXT split, so a low-SNR channel
   // (e.g. a weak OIII) does not tile-artifact. Identity guards: the Ha/O-only degrade above can
   // alias oiiiView=haView, so denoise each distinct view once.
   optCabraDenoiseNBAdaptive(haView, opts.dialog);
   if (oiiiView !== haView) optCabraDenoiseNBAdaptive(oiiiView, opts.dialog);
   if (hasS && siiView !== haView && siiView !== oiiiView) optCabraDenoiseNBAdaptive(siiView, opts.dialog);
   optCabraStretchNB(haView, si, opts.dialog); optCabraStretchNB(oiiiView, si, opts.dialog);
   if (hasS) optCabraStretchNB(siiView, si, opts.dialog);
   // star images (mono) BEFORE making channels starless, then NB->RGB transform
   sHa = optCabraMonoStars(haView, tag + "_sha");
   sO = optCabraMonoStars(oiiiView, tag + "_so");
   sS = hasS ? optCabraMonoStars(siiView, tag + "_ss") : null;
   starsRGB = optNBtoRGBStars(sHa, sO, sS, { newImageId: tag + "_stars" });
   // nebula from starless emission
   optCabraStarless(haView); optCabraStarless(oiiiView); if (hasS) optCabraStarless(siiView);
   neb = optCabraCombinePalette(haView, oiiiView, hasS ? siiView : null, palette || "HOO", tag + "_neb");
   optCabraRemoveGreen(neb);
   // Saturate the NEBULA only (before stars) so NB->RGB stars keep their natural colour
   // instead of being over-saturated by the global boost (GUI feedback).
   optCabraSaturate(neb, sat, isFinite(opts.hueShift) ? opts.hueShift : -0.012);
   optCabraRedBalance(neb, red);
   optCabraRemoveGreen(neb);
   var fin = optCabraStarComposite(neb, starsRGB, isFinite(opts.starK) ? opts.starK : 0.52, tag + "_final");
   optCabraTameHighlights(fin, 0.88, 0.30);   // soften blown star cores
   optCabraTargetBrightness(fin, pp.lumTarget);
   optCabraSetBlackPoint(fin, bp);
   return fin;
   } finally {
      try { [sHa, sO, sS, starsRGB, neb].forEach(function(v){ if (v && v.window && !v.window.isNull) v.window.forceClose(); }); } catch (e) { if (typeof optDiagError === "function") optDiagError("cabra-nbonly-cleanup", e, ""); }
   }
}
// ChannelCombination of three mono views into a new RGB window.
function optCabraCombineRGB(rId, gId, bId, w, h, id) {
   var tw = new ImageWindow(w, h, 3, 32, true, true, id);
   var cc = new ChannelCombination; cc.colorSpace = 0; cc.channels = [[true, rId], [true, gId], [true, bId]];
   cc.executeOn(tw.mainView); return tw.mainView;
}
// Star-based white balance (gray-world on the brightest ~0.1% pixels). Neutralizes the
// AVERAGE star color so RGB stars look natural without needing SPCC/WCS. Linear data.
function optCabraStarWhiteBalance(view) {
   var im = view.image, w = im.width, h = im.height, n = w * h, rc = new Rect(0, 0, w, h);
   var R = new Float32Array(n), G = new Float32Array(n), Bc = new Float32Array(n);
   im.getSamples(R, rc, 0); im.getSamples(G, rc, 1); im.getSamples(Bc, rc, 2);
   var Y = new Float32Array(n), samp = [], st = Math.max(1, Math.floor(n / 50000));
   for (var i = 0; i < n; ++i) Y[i] = 0.2126 * R[i] + 0.7152 * G[i] + 0.0722 * Bc[i];
   for (var s = 0; s < n; s += st) samp.push(Y[s]);
   samp.sort(function(a, b) { return a - b; });
   var thr = samp[Math.floor(samp.length * 0.999)] || 0.5;
   var sr = 0, sg = 0, sb = 0, c = 0;
   for (var j = 0; j < n; ++j) if (Y[j] >= thr) { sr += R[j]; sg += G[j]; sb += Bc[j]; c++; }
   if (c < 10) return;
   var mr = sr / c, mg = sg / c, mb = sb / c, tgt = (mr + mg + mb) / 3;
   var fr = mr > 1e-6 ? tgt / mr : 1, fg = mg > 1e-6 ? tgt / mg : 1, fb = mb > 1e-6 ? tgt / mb : 1;
   view.beginProcess(UndoFlag_NoSwapFile);
   for (var k = 0; k < n; ++k) { R[k] *= fr; G[k] *= fg; Bc[k] *= fb; }
   im.setSamples(R, rc, 0); im.setSamples(G, rc, 1); im.setSamples(Bc, rc, 2); view.endProcess();
}
// Builds a color-calibrated RGB star layer (on black) from a COMBINED RGB view.
function optCabraRGBStars(rgbView, opts) {
   opts = opts || {}; var tag = opts.tag || "rgbst";
   var full = optCabraClonePM(rgbView, tag + "_full");
   var sl = null;
   try {                                         // F3-full: close full/sl even on throw
   optCabraBackground(full, opts.dialog);
   // Star colour calibration: SPCC (photometric) if we can give the RGB a WCS by copying
   // it from the source and a dialog is available; else background neutralization + linear
   // fit. SPCC neutralizes the bright-end star cast that linear fit leaves behind.
   var didSPCC = false;
   if (opts.dialog) {
      try {
         if (optCopyAstrometricSolution(full.window, rgbView.window) && typeof optRunSPCCWorkflow === "function") {
            optRunSPCCWorkflow(full, opts.dialog); didSPCC = true;
         }
      } catch (eSPCC) {}
   }
   if (!didSPCC) {
      try { optRunBackgroundNeutralization(full); } catch (e) {}
      try { optRunAutoLinearFitWorkflow(full); } catch (e) {}
   }
   optRunAutoGhsStretch(full, { aghs_intensity: isFinite(opts.stretchIntensity) ? opts.stretchIntensity : 0.85, aghs_bp: 3.2 });
   optCabraRemoveGreen(full);
   sl = optCabraClonePM(full, tag + "_sl"); optCabraStarless(sl);
   var P = new PixelMath;
   P.expression = "max(0," + full.id + "[0]-" + sl.id + "[0])";
   P.expression1 = "max(0," + full.id + "[1]-" + sl.id + "[1])";
   P.expression2 = "max(0," + full.id + "[2]-" + sl.id + "[2])"; P.expression3 = "";
   P.useSingleExpression = false; P.generateOutput = true; P.createNewImage = true;
   P.truncate = true; P.truncateLower = 0; P.truncateUpper = 1; P.showNewImage = false;
   P.newImageId = tag + "_stars"; P.newImageColorSpace = PixelMath.RGB; P.newImageSampleFormat = PixelMath.SameAsTarget;
   P.executeOn(full);
   var stars = ImageWindow.windowById(tag + "_stars").mainView;
   // If SPCC already calibrated colour, skip the gray-world fallback. Otherwise
   // white-balance the ISOLATED star layer (stars on black -> no nebula contamination).
   if (!didSPCC) optCabraStarWhiteBalance(stars);
   return stars;
   } finally {
      try { if (full && full.window && !full.window.isNull) full.window.forceClose(); } catch (e) { if (typeof optDiagError === "function") optDiagError("cabra-rgbstars2-cleanup", e, "full"); }
      try { if (sl && sl.window && !sl.window.isNull) sl.window.forceClose(); } catch (e2) { if (typeof optDiagError === "function") optDiagError("cabra-rgbstars2-cleanup", e2, "sl"); }
   }
}
// Screen blend of two RGB views: out = 1-(1-a)(1-b) per channel. Reusable.
function optCabraScreenCombine(a, b, outId) {
   var P = new PixelMath;
   P.expression  = "1-(1-" + a.id + "[0])*(1-" + b.id + "[0])";
   P.expression1 = "1-(1-" + a.id + "[1])*(1-" + b.id + "[1])";
   P.expression2 = "1-(1-" + a.id + "[2])*(1-" + b.id + "[2])"; P.expression3 = "";
   P.useSingleExpression = false; P.generateOutput = true; P.createNewImage = true;
   P.truncate = true; P.truncateLower = 0; P.truncateUpper = 1; P.showNewImage = false;
   P.newImageId = outId; P.newImageColorSpace = PixelMath.RGB; P.newImageSampleFormat = PixelMath.SameAsTarget;
   P.executeOn(a); return ImageWindow.windowById(outId).mainView;
}
// RGB star layer for the rgb_nb compose (user spec 2026-06-18, B): gradient -> colour
// correction (SPCC if dialog+WCS, else BackgroundNeutralization+LinearFit) -> deconvolution
// (BXT->Parallax) -> split (SXT->SyQon->StarNet, keep STARS) -> SetiAstro Star Stretch.
function optCabraRGBStarsForCompose(rgbView, tag, dialog, wcsSrc) {
   var full = optCabraClonePM(rgbView, tag + "_rgbfull");
   var sl = null;
   // F3-full: guarantee the `full`/`sl` temp windows close even if a step throws.
   try {
      optCabraGradientRGB(full);                              // gradient
      var didSPCC = false;                                    // colour correction
      if (dialog && wcsSrc) {
         try { if (optCopyAstrometricSolution(full.window, wcsSrc) && typeof optRunSPCCWorkflow === "function") { optRunSPCCWorkflow(full, dialog); didSPCC = true; } } catch (e) {}
      }
      if (!didSPCC) { try { optRunBackgroundNeutralization(full); } catch (e) {} try { optRunAutoLinearFitWorkflow(full); } catch (e) {} }
      optCabraDeconvFallback(full, dialog);                   // deconvolution
      sl = optCabraClonePM(full, tag + "_rgbsl");
      optCabraMakeStarless(sl, dialog);                       // split (keep stars below)
      var P = new PixelMath;
      P.expression  = "max(0," + full.id + "[0]-" + sl.id + "[0])";
      P.expression1 = "max(0," + full.id + "[1]-" + sl.id + "[1])";
      P.expression2 = "max(0," + full.id + "[2]-" + sl.id + "[2])"; P.expression3 = "";
      P.useSingleExpression = false; P.generateOutput = true; P.createNewImage = true;
      P.truncate = true; P.truncateLower = 0; P.truncateUpper = 1; P.showNewImage = false;
      P.newImageId = tag + "_rgbstars"; P.newImageColorSpace = PixelMath.RGB; P.newImageSampleFormat = PixelMath.SameAsTarget;
      P.executeOn(full);
      var stars = ImageWindow.windowById(tag + "_rgbstars").mainView;
      optNbStarStretch(stars, 5, 1.0);   // SetiAstro Star Stretch
      return stars;
   } finally {
      try { if (full && full.window && !full.window.isNull) full.window.forceClose(); } catch (e) { if (typeof optDiagError === "function") optDiagError("cabra-rgbstars-cleanup", e, "full"); }
      try { if (sl && sl.window && !sl.window.isNull) sl.window.forceClose(); } catch (e2) { if (typeof optDiagError === "function") optDiagError("cabra-rgbstars-cleanup", e2, "sl"); }
   }
}
// RGB+NB branch. Nebula from the NB channels; stars from the broadband RGB. Per user spec
// 2026-06-18: per-channel gradient = GraXpert->AutoDBE->ABE3; per-channel star split =
// SXT->SyQon->StarNet; nebula SCNR-after-combine removed; stars via optCabraRGBStarsForCompose;
// nebula+stars merged with SCREEN. Returns a new RGB "Final" view.
// ===== SIGNAL-WEIGHTED-RGBNB-BEGIN (A+B+C) — reversible via the flags below =====
// Fixes observed on a compact planetary: (B) NB-dominant rgb_nb lost weak OIII; (C) SXT in the
// NB prep ate the compact object; (A) broadband L washed an emission target in LRGB. All three
// are flag-gated: set a flag false to fall back to the previous behaviour for that path.
var OPT_CABRA_RGBNB_SIGNAL_WEIGHTED = true;   // B: RGB-base + SNR-weighted continuum-subtracted NB add (vs NB-dominant)
var OPT_CABRA_RGBNB_COMPACT_GUARD   = true;   // C: in the OLD NB-dominant path, skip SXT on NB channels for compact objects
var OPT_CABRA_LRGB_SYNTH_LUM        = true;   // A: LRGB luminance = lighten(L, Lum(RGB)) so emission is not washed out

// SNR-advantage weight for adding a narrowband line on top of the broadband: weak NB -> low
// weight (broadband colour preserved), strong NB -> higher weight (enhance). Pure/testable.
function optCabraNbAddWeight(snrNb, snrBb) {
   var a = (isFinite(snrNb) && snrNb > 0) ? snrNb : 0;
   var b = (isFinite(snrBb) && snrBb > 0) ? snrBb : 1;
   var w = a / (a + b);
   if (w < 0.10) w = 0.10; else if (w > 0.70) w = 0.70;
   return w;
}

// Line-specific shaping ON TOP of the pure SNR weight above (which is harness-
// fingerprinted and stays untouched). User feedback 2026-07-02 (RGB+H+O real run):
// OIII's SNR is almost always far below a broadband master's, so the raw weight sat
// at/near the 0.10 floor and the teal was invisible against the red Ha field. OIII
// gets a gain and a higher floor so it reads in the final; Ha/SII pass through.
function optCabraNbLineGain(line, w) {
   if (line === "O") { w = w * 1.5; if (w < 0.28) w = 0.28; }
   if (w > 0.70) w = 0.70;
   return w;
}

// B: signal-weighted RGB+NB. The broadband RGB is the COLOUR base (validated single-image
// pipeline — keeps natural Ha/OIII colour, and its star reduction is morphological, NOT SXT, so
// a compact object is preserved). Each NB line is continuum-subtracted against the broadband and
// SCREENED into the matching channel(s) scaled by its SNR advantage (Ha/SII->R, OIII->G,B). A weak
// line barely perturbs the good broadband colour; a strong line enhances it. Returns a new RGB view.
function optCabraComposeRGBNBWeighted(haView, oiiiView, siiView, rgbView, opts) {
   opts = opts || {}; var tag = opts.tag || "rgbnbw";
   var hasS = optSafeView(siiView);
   var ext = 0.15; try { ext = optCabraAnalyze(haView).extendedFraction; } catch (eX) {}
   var si = optCabraFinishParams(ext).stretchIntensity;
   var base = optCabraClonePM(rgbView, tag + "_base");
   try {
      optCabraMagicRun(base, opts.dialog);   // the "RGB" result the user judged OK (keeps OIII)
      var snrBb = 1; try { var qb = optCabraChannelQuality(rgbView); if (qb && isFinite(qb.snr)) snrBb = qb.snr; } catch (eB) {}
      function addLine(nbV, line, channels) {
         if (!optSafeView(nbV)) return;
         var w = 0.30;
         try { var qn = optCabraChannelQuality(nbV); w = optCabraNbAddWeight(qn ? qn.snr : 0, snrBb); } catch (eW) {}
         w = optCabraNbLineGain(line, w);   // OIII gain+floor so the teal actually reads
         var cs = null;
         try {
            cs = optRunContinuumSubtraction(nbV, rgbView, { line: line, baseId: tag + "_" + line + "cs" });
            optRunAutoGhsStretch(cs, { aghs_intensity: si, aghs_noiseCeiling: 0.05 });
            // GRAIN FIX (user feedback 2026-07-02): the continuum subtraction ADDS noise
            // (variances sum) and the stretch amplifies it — and this layer lands on the
            // base AFTER all of the base's denoising, so its speckle screened straight
            // into the final as coarse red/teal grain. Denoise the stretched line layer
            // (SNR-adaptive strength) BEFORE screening it in; the base is never re-blurred.
            optCabraDenoiseNBAdaptive(cs, opts.dialog);
            var e0 = (channels.indexOf(0) >= 0) ? "1-(1-" + base.id + "[0])*(1-" + w.toFixed(4) + "*" + cs.id + ")" : base.id + "[0]";
            var e1 = (channels.indexOf(1) >= 0) ? "1-(1-" + base.id + "[1])*(1-" + w.toFixed(4) + "*" + cs.id + ")" : base.id + "[1]";
            var e2 = (channels.indexOf(2) >= 0) ? "1-(1-" + base.id + "[2])*(1-" + w.toFixed(4) + "*" + cs.id + ")" : base.id + "[2]";
            var pm = new PixelMath; pm.useSingleExpression = false; pm.createNewImage = false;
            pm.expression = e0; pm.expression1 = e1; pm.expression2 = e2; pm.expression3 = "";
            pm.truncate = true; pm.truncateLower = 0; pm.truncateUpper = 1;
            pm.executeOn(base);
            console.writeln("=> CabraMagic RGB+NB (weighted): " + line + " added at w=" + w.toFixed(2) + " (SNR-weighted).");
         } catch (eL) { console.warningln("=> RGB+NB weighted " + line + " add skipped: " + (eL.message || eL)); }
         finally { if (cs) try { optCloseView(cs); } catch (eC) {} }
      }
      addLine(haView, "H", [0]);          // Ha  -> R
      addLine(oiiiView, "O", [1, 2]);     // OIII -> G, B
      if (hasS) addLine(siiView, "S", [0]); // SII -> R
      return base;
   } catch (e) {
      if (base && base.window && !base.window.isNull) try { base.window.forceClose(); } catch (eBc) {}
      throw e;
   }
}
// ===== SIGNAL-WEIGHTED-RGBNB-END =====

function optCabraComposeRGBNB(haView, oiiiView, siiView, rgbView, palette, opts) {
   opts = opts || {}; var tag = opts.tag || "rgbnb";
   // B: signal-weighted RGB-base + NB-add (preserves weak lines, compact-safe). Flag off -> old NB-dominant.
   if (OPT_CABRA_RGBNB_SIGNAL_WEIGHTED)
      return optCabraComposeRGBNBWeighted(haView, oiiiView, siiView, rgbView, opts);
   var ext = 0.15; try { ext = optCabraAnalyze(haView).extendedFraction; } catch (eX) {}
   var si  = isFinite(opts.stretchIntensity) ? opts.stretchIntensity : optCabraFinishParams(ext).stretchIntensity;
   var dn  = isFinite(opts.denoiseStrength) ? opts.denoiseStrength : 0.5;
   var hasS = optSafeView(siiView);
   // C: COMPACT GUARD. SXT (the star split in prepNB) eats a compact object (planetary). For a
   // compact target, skip the NB star removal AND the separate RGB star screen (the NB keeps its
   // own stars) to protect the structure. Reversible: OPT_CABRA_RGBNB_COMPACT_GUARD=false.
   var compact = false;
   if (OPT_CABRA_RGBNB_COMPACT_GUARD) { try { var anC = optCabraAnalyze(haView); compact = anC && isFinite(anC.concentrationIndex) && anC.concentrationIndex >= 3.0; } catch (eCk) {} }
   // PARED-BACK (user 2026-06-18, "sale mal — acotar"): per-NB-channel gradient -> deconvolution
   // -> star split (keep starless) -> denoise; combine palette; stretch; screen the RGB star layer.
   function prepNB(v) {
      optCabraGradientRGB(v);
      optCabraDeconvFallback(v, opts.dialog);
      if (!compact) optCabraMakeStarless(v, opts.dialog);   // skip for compact -> protect structure
      optCabraDenoiseFallback(v, opts.dialog, dn);
   }
   var neb = null, stars = null;
   try {                                         // F3-full: close neb/stars even on throw
   if (compact) console.writeln("=> CabraMagic RGB+NB: compact object (C>=3) -> skipping SXT on NB channels (and RGB star screen) to protect structure.");
   prepNB(haView); prepNB(oiiiView); if (hasS) prepNB(siiView);
   neb = optCabraCombinePalette(haView, oiiiView, hasS ? siiView : null, palette || "HOO", tag + "_neb");
   optRunAutoGhsStretch(neb, { aghs_intensity: si, aghs_bp: 3.2 });   // stretch combined nebula
   var fin;
   if (compact) {
      fin = neb; neb = null;   // keep the NB-with-stars nebula as the result (no double stars)
   } else {
      // B) Stars from the broadband RGB (gradient -> colour -> deconv -> split -> Star Stretch)
      stars = optCabraRGBStarsForCompose(rgbView, tag, opts.dialog, optSafeView(rgbView) ? rgbView.window : null);
      // C) Merge with SCREEN.
      fin = optCabraScreenCombine(neb, stars, tag + "_final");
   }
   return fin;
   } finally {
      try { if (neb && neb.window && !neb.window.isNull) neb.window.forceClose(); } catch (e) { if (typeof optDiagError === "function") optDiagError("cabra-rgbnb-cleanup", e, "neb"); }
      try { if (stars && stars.window && !stars.window.isNull) stars.window.forceClose(); } catch (e2) { if (typeof optDiagError === "function") optDiagError("cabra-rgbnb-cleanup", e2, "stars"); }
   }
}
// Resolve a single COMBINED RGB view from the channel map (clone of map.RGB, or combine
// R/G/B). Caller owns the returned view. Lets every branch accept either input form.
function optCabraResolveRGB(map, tag) {
   if (optSafeView(map.RGB)) return optCabraClonePM(map.RGB, tag + "_rgb");
   if (optSafeView(map.R) && optSafeView(map.G) && optSafeView(map.B))
      return optCabraCombineRGB(map.R.id, map.G.id, map.B.id, map.R.image.width, map.R.image.height, tag + "_rgb");
   return null;
}
// RGB + a SINGLE narrowband channel (HaRGB / OIIIRGB): the broadband RGB is the base
// (keeps natural star colour + structure) and the one NB channel is injected as emission
// in its colour (Ha/SII -> red, OIII -> cyan). Returns a new RGB "Final" view.
function optCabraComposeRGBplusNB(rgbView, nbView, nbType, opts) {
   opts = opts || {}; var tag = opts.tag || "rgb1nb";
   var full = optCabraClonePM(rgbView, tag + "_full");
   try {                                         // F3-full: close full even on throw
   optCabraBackground(full, opts.dialog);
   var didSPCC = false;
   if (opts.dialog) {
      try { if (optCopyAstrometricSolution(full.window, rgbView.window) && typeof optRunSPCCWorkflow === "function") { optRunSPCCWorkflow(full, opts.dialog); didSPCC = true; } } catch (e) {}
   }
   if (!didSPCC) { try { optRunBackgroundNeutralization(full); } catch (e) {} try { optRunAutoLinearFitWorkflow(full); } catch (e) {} }
   var ext = 0.15; try { ext = optCabraAnalyze(full).extendedFraction; } catch (eX) {}
   var pp = optCabraFinishParams(ext);
   optRunAutoGhsStretch(full, { aghs_intensity: pp.stretchIntensity, aghs_bp: 3.0 });
   optCabraRemoveGreen(full);
   // NB emission (starless), stretched to match, injected into the RGB (Ha/SII->red, O->cyan).
   optCabraStretchNB(nbView, pp.stretchIntensity, opts.dialog); optCabraStarless(nbView);
   var k = isFinite(opts.nbAmount) ? opts.nbAmount : 0.9, N = nbView.id, F = full.id, eR, eG, eB;
   if (nbType === "O") { eR = F + "[0]"; eG = F + "[1] + " + k + "*max(0," + N + "-" + F + "[1])"; eB = F + "[2] + " + k + "*max(0," + N + "-" + F + "[2])"; }
   else { eR = F + "[0] + " + k + "*max(0," + N + "-" + F + "[0])"; eG = F + "[1]"; eB = F + "[2]"; }
   var P = new PixelMath; P.expression = eR; P.expression1 = eG; P.expression2 = eB; P.expression3 = "";
   P.useSingleExpression = false; P.generateOutput = true; P.createNewImage = true;
   P.truncate = true; P.truncateLower = 0; P.truncateUpper = 1; P.showNewImage = false;
   P.newImageId = tag + "_final"; P.newImageColorSpace = PixelMath.RGB; P.newImageSampleFormat = PixelMath.SameAsTarget;
   P.executeOn(full);
   var fin = ImageWindow.windowById(tag + "_final").mainView;
   optCabraRemoveGreen(fin);
   optCabraSaturate(fin, isFinite(opts.saturation) ? opts.saturation : Math.min(1.6, pp.saturation), 0);  // RGB-based: contained
   optCabraTameHighlights(fin, 0.88, 0.30);   // soften blown star cores
   optCabraTargetBrightness(fin, pp.lumTarget);
   optCabraSetBlackPoint(fin, isFinite(opts.blackPoint) ? opts.blackPoint : pp.blackPoint);
   return fin;
   } finally {
      try { if (full && full.window && !full.window.isNull) full.window.forceClose(); } catch (e) { if (typeof optDiagError === "function") optDiagError("cabra-rgb1nb-cleanup", e, "full"); }
   }
}
// Broadband RGB branch: calibrated, stretched RGB final (stars kept).
// Gradient correction for the RGB case (one application on the combined colour image).
// Order (user spec 2026-06-18): GraXpert -> AutoDBE -> ABE (polynomial degree 3).
// AutoDBE is run on a probe clone and only committed if its result looks sane (no gross
// black-clipping / has dynamic range); otherwise we fall through to ABE deg 3 on the
// untouched original (no double correction).
function optCabraGradientRGB(view) {
   // 1) GraXpert (external exe; modifies in place, leaves a background window we close)
   try {
      var gx = (typeof optResolveGraXpertExecutablePath === "function") ? optResolveGraXpertExecutablePath() : "";
      if (gx && gx.length > 0) {
         var ids = {}, wb = ImageWindow.windows;
         for (var i = 0; i < wb.length; ++i) ids[wb[i].mainView.id] = true;
         optRunGraXpertDirectly(view, null);
         var wa = ImageWindow.windows;
         for (var j = 0; j < wa.length; ++j) { var gid = wa[j].mainView.id; if (!ids[gid] && gid !== view.id && /background/i.test(gid)) { try { wa[j].forceClose(); } catch (eC) {} } }
         console.noteln("=> CabraMagic RGB gradient: GraXpert."); return;
      }
   } catch (eg) { console.warningln("=> CabraMagic RGB gradient: GraXpert failed (" + (eg.message || eg) + "), trying AutoDBE."); }
   // 2) AutoDBE on a probe clone; commit only if sane
   if (view.image.numberOfChannels >= 3 && typeof optIsAutoDBEAvailable === "function" && optIsAutoDBEAvailable()) {
      var probe = null;
      try {
         probe = optCabraClonePM(view, optUniqueId("adbeprobe"));
         optRunAutoDBEGradientCorrection(probe, { descentPathsInput: 500, tolerance: 1.0, smoothing: 0.5, showModel: false });
         if (optCabraResultLooksSane(probe)) {
            view.beginProcess(UndoFlag_NoSwapFile); view.image.assign(probe.image); view.endProcess();
            try { probe.window.forceClose(); } catch (e) {}
            console.noteln("=> CabraMagic RGB gradient: AutoDBE."); return;
         }
         console.warningln("=> CabraMagic RGB gradient: AutoDBE output looked off, using ABE (degree 3).");
      } catch (ed) { console.warningln("=> CabraMagic RGB gradient: AutoDBE failed (" + (ed.message || ed) + "), using ABE (degree 3)."); }
      try { if (probe && probe.window) probe.window.forceClose(); } catch (e) {}
   }
   // 3) ABE polynomial degree 3
   optCabraABEInPlace(view, 3);
   console.noteln("=> CabraMagic RGB gradient: ABE (degree 3).");
}
// Light sanity check for an auto-gradient result: not mostly black-clipped and has range.
function optCabraResultLooksSane(view) {
   if (!optSafeView(view)) return false;
   var im = view.image, n = im.width * im.height, rc = new Rect(0, 0, im.width, im.height), nc = im.numberOfChannels;
   var z = 0, tot = 0, mn = 1e9, mx = -1e9;
   for (var c = 0; c < nc; ++c) { var a = new Float32Array(n); im.getSamples(a, rc, c); for (var i = 0; i < n; i += 11) { tot++; var v = a[i]; if (v <= 0) z++; if (v < mn) mn = v; if (v > mx) mx = v; } }
   return (z / Math.max(1, tot)) < 0.40 && (mx - mn) > 0.01;
}
// Star/starless split with engine fallback (user spec): StarXTerminator -> SyQon Starless
// -> StarNet2 -> none. Removes stars from `view` IN PLACE. Returns the engine name, or null
// if no engine is available (caller then skips the split).
function optCabraMakeStarless(view, dialog) {
   try { optCabraStarless(view); return "StarXTerminator"; }
   catch (e1) { console.warningln("=> Star split: StarXTerminator unavailable/failed (" + (e1.message || e1) + "), trying SyQon."); }
   try {
      // applyToTarget honours this function's contract (starless IN PLACE, no
      // extra windows); starsOnlyMode "None" skips the stars layer we don't use.
      if (typeof optIsSyQonStarlessAvailable === "function" && optIsSyQonStarlessAvailable()) { optRunSyQonStarlessOnView(view, { starsOnlyMode: "None", applyToTarget: true }, dialog); return "SyQon Starless"; }
   } catch (e2) { console.warningln("=> Star split: SyQon Starless failed (" + (e2.message || e2) + "), trying StarNet2."); }
   try {
      if (typeof StarNet2 !== "undefined") { var sn = new StarNet2(); optAssertExecuteOk(sn.executeOn(view), "StarNet2"); return "StarNet2"; }
   } catch (e3) { console.warningln("=> Star split: StarNet2 failed (" + (e3.message || e3) + ")."); }
   return null;
}
// Moderate noise reduction with engine fallback (user spec 2026-06-18):
// SyQon Prism -> NoiseXTerminator -> DeepSNR -> TGVDenoise. `strength` (default 0.3) drives
// Prism/NXT; best applied on LINEAR data (before stretch).
function optCabraDenoiseFallback(view, dialog, strength) {
   var s = isFinite(strength) ? strength : 0.3;
   try {
      if (typeof optIsPrismAvailable === "function" && optIsPrismAvailable()) {
         optRunSyQonPrismOnView(view, { strength: s }, dialog);
         console.noteln("=> CabraMagic denoise: SyQon Prism (" + s.toFixed(2) + ")."); return "SyQon Prism";
      }
   } catch (e1) { console.warningln("=> CabraMagic denoise: SyQon Prism failed (" + (e1.message || e1) + "), trying NoiseXTerminator."); }
   try {
      if (optCabraToolAvailable(["NoiseXTerminator"])) {
         optExecuteNoiseXConfiguredOnView(view, { denoise: s, iterations: 1, enable_color_separation: false, enable_frequency_separation: false, denoise_color: 0.0, denoise_lf: 0.0, denoise_lf_color: 0.0, frequency_scale: 5 });
         console.noteln("=> CabraMagic denoise: NoiseXTerminator (" + s.toFixed(2) + ")."); return "NoiseXTerminator";
      }
   } catch (e2) { console.warningln("=> CabraMagic denoise: NoiseXTerminator failed (" + (e2.message || e2) + "), trying DeepSNR."); }
   try {
      if (optCabraToolAvailable(["DeepSNR"])) {
         optExecuteDeepSNROnView(view, { amount: Math.min(0.9, s + 0.1) });
         console.noteln("=> CabraMagic denoise: DeepSNR."); return "DeepSNR";
      }
   } catch (e3) { console.warningln("=> CabraMagic denoise: DeepSNR failed (" + (e3.message || e3) + "), trying TGVDenoise."); }
   try {
      optExecuteTgvDenoiseConfiguredOnView(view, { strengthL: 1.5, strengthC: 1.0, edgeProtection: 0.003, smoothness: 2.0, maxIterations: 100 });
      console.noteln("=> CabraMagic denoise: TGVDenoise (light)."); return "TGVDenoise";
   } catch (e4) { console.warningln("=> CabraMagic denoise: TGVDenoise failed (" + (e4.message || e4) + "); no denoise applied."); }
   return null;
}
// Deconvolution/sharpen with engine fallback: BlurXTerminator -> SyQon Parallax -> none.
// In place. (Headless BXT is a GPU no-op; runs in the GUI.)
function optCabraDeconvFallback(view, dialog) {
   try {
      if (optCabraToolAvailable(["BlurXTerminator"])) {
         optExecuteBlurXConfiguredOnView(view, { automatic_psf: true, sharpen_stars: 0.10, adjust_star_halos: 0.0, sharpen_nonstellar: 0.30, correct_only: false });
         console.noteln("=> CabraMagic deconv: BlurXTerminator."); return "BXT";
      }
   } catch (e1) { console.warningln("=> CabraMagic deconv: BXT failed (" + (e1.message || e1) + "), trying Parallax."); }
   try {
      if (typeof optIsParallaxAvailable === "function" && optIsParallaxAvailable()) {
         optRunSyQonParallaxOnView(view, {}, dialog);
         console.noteln("=> CabraMagic deconv: SyQon Parallax."); return "Parallax";
      }
   } catch (e2) { console.warningln("=> CabraMagic deconv: Parallax failed (" + (e2.message || e2) + ")."); }
   return null;
}
// CASE rgb (broadband only). User spec 2026-06-18:
//  1) gradient (GraXpert -> AutoDBE -> ABE deg3)
//  2) colour: SPCC (WCS+dialog) else BackgroundNeutralization + LinearFit
//  3) star split (SXT -> SyQon -> StarNet2 -> none)
//  4) stretch starless: AutoGHS    5) stretch stars: StarStretch    (then recombine)
//  6) SCNR green   7) saturation (HSI, <=1.4)   8) gamma -> lumTarget   9) black point
function optCabraComposeRGB(map, opts) {
   opts = opts || {}; var tag = opts.tag || "rgb";
   var full, wcsSrc = null;
   if (optSafeView(map.RGB)) { full = optCabraClonePM(map.RGB, tag + "_full"); wcsSrc = map.RGB.window; }
   else { var w = map.R.image.width, h = map.R.image.height; full = optCabraCombineRGB(map.R.id, map.G.id, map.B.id, w, h, tag + "_full"); wcsSrc = map.R.window; }

   // 1) Gradient
   optCabraGradientRGB(full);

   // 2) Colour calibration (on the linear, gradient-corrected RGB)
   var didSPCC = false;
   if (opts.dialog && wcsSrc) {
      try { if (optCopyAstrometricSolution(full.window, wcsSrc) && typeof optRunSPCCWorkflow === "function") { optRunSPCCWorkflow(full, opts.dialog); didSPCC = true; } } catch (e) {}
   }
   if (!didSPCC) { try { optRunBackgroundNeutralization(full); } catch (e) {} try { optRunAutoLinearFitWorkflow(full); } catch (e) {} }

   var ext = 0.15; try { ext = optCabraAnalyze(full).extendedFraction; } catch (eX) {}
   var pp = optCabraFinishParams(ext);
   var si = isFinite(opts.stretchIntensity) ? opts.stretchIntensity : pp.stretchIntensity;

   // 3) Star split (in place on a starless clone) -> stars = full - starless (linear)
   var starless = optCabraClonePM(full, tag + "_sl");
   var engine = optCabraMakeStarless(starless, opts.dialog);
   var fin;
   if (engine) {
      console.noteln("=> CabraMagic RGB: star split via " + engine + ".");
      // Stars: an externally-supplied RGB star layer (e.g. SetiAstro NB->RGB stars for the
      // NB-via-RGB path) takes precedence; otherwise extract them from the split (full-starless)
      // and apply the Star Stretch.
      var stars, ownStars;
      if (optSafeView(opts.starsView) &&
          opts.starsView.image.width === full.image.width && opts.starsView.image.height === full.image.height) {
         stars = opts.starsView; ownStars = false;
         console.noteln("=> CabraMagic RGB: using supplied star layer (NB->RGB SetiAstro).");
      } else {
         var Pe = new PixelMath;
         Pe.expression  = "max(0," + full.id + "[0]-" + starless.id + "[0])";
         Pe.expression1 = "max(0," + full.id + "[1]-" + starless.id + "[1])";
         Pe.expression2 = "max(0," + full.id + "[2]-" + starless.id + "[2])"; Pe.expression3 = "";
         Pe.useSingleExpression = false; Pe.generateOutput = true; Pe.createNewImage = true;
         Pe.truncate = true; Pe.truncateLower = 0; Pe.truncateUpper = 1; Pe.rescale = false; Pe.showNewImage = false;
         Pe.newImageId = tag + "_st"; Pe.newImageColorSpace = PixelMath.RGB; Pe.newImageSampleFormat = PixelMath.SameAsTarget;
         Pe.executeOn(full);
         stars = ImageWindow.windowById(tag + "_st").mainView; ownStars = true;
      }
      // 4) starless stretch (AutoGHS) + star reduction (cleans residual stars left by the
      //    split: morphological erosion of bright compact peaks, strength 0.5, size 3)
      optRunAutoGhsStretch(starless, { aghs_intensity: si, aghs_bp: 3.0 });
      optStarReduceOnView(starless, isFinite(opts.starlessReduceStrength) ? opts.starlessReduceStrength : 0.5,
                                     isFinite(opts.starlessReduceSize) ? opts.starlessReduceSize : 3);
      // V2-P2 canonical order: denoise the freshly-stretched STARLESS here — before the
      // stars come back and before any detail/saturation boost (the old flow denoised the
      // recombined final AFTER edge-aware detail, partially undoing it and smearing star
      // profiles). Stars are never denoised (they don't need it and NR erodes their cores).
      // 0.60 (was 0.45): too light for the finishing boosts on noisy fields (user 2026-07-02).
      optCabraDenoiseFallback(starless, opts.dialog, 0.60);
      // 5) stars stretch (StarStretch) — only for self-extracted stars; a supplied SetiAstro
      //    layer is already stretched/coloured.
      if (ownStars)
         optNbStarStretch(stars, isFinite(opts.starAmount) ? opts.starAmount : 5, isFinite(opts.starSat) ? opts.starSat : 1.0);
      // recombine: screen the stretched stars back onto the stretched starless
      var Pc = new PixelMath;
      Pc.expression  = "1-(1-" + starless.id + "[0])*(1-" + stars.id + "[0])";
      Pc.expression1 = "1-(1-" + starless.id + "[1])*(1-" + stars.id + "[1])";
      Pc.expression2 = "1-(1-" + starless.id + "[2])*(1-" + stars.id + "[2])"; Pc.expression3 = "";
      Pc.useSingleExpression = false; Pc.generateOutput = true; Pc.createNewImage = true;
      Pc.truncate = true; Pc.truncateLower = 0; Pc.truncateUpper = 1; Pc.showNewImage = false;
      Pc.newImageId = tag + "_final"; Pc.newImageColorSpace = PixelMath.RGB; Pc.newImageSampleFormat = PixelMath.SameAsTarget;
      Pc.executeOn(starless);
      fin = ImageWindow.windowById(tag + "_final").mainView;
      try { full.window.forceClose(); starless.window.forceClose(); if (ownStars && stars.window) stars.window.forceClose(); } catch (e) {}
   } else {
      // No star-split engine: stretch the full image (stars included) and continue.
      console.warningln("=> CabraMagic RGB: no star-split engine available; stretching without split.");
      try { starless.window.forceClose(); } catch (e) {}
      optRunAutoGhsStretch(full, { aghs_intensity: si, aghs_bp: 3.0 });
      // V2-P2: with no split the denoise still belongs right after the stretch,
      // before any detail/colour boost (was: at the very end, after detail).
      optCabraDenoiseFallback(full, opts.dialog, 0.60);
      fin = full;
   }

   // Optional highlight compression (opts.tameFinal) — keeps bright NB shells / planetary
   // cores + screened stars from clipping to pure white. Off for the broadband rgb case
   // (validated without it); on for the NB-via-RGB path (bright emission cores).
   if (opts.tameFinal === true) optCabraTameHighlights(fin, 0.88, 0.30);
   // V2 finishing tail — shared with the single-image pipeline (optCabraFinishView):
   // SCNR -> vibrance + contained saturation -> gamma to lumTarget -> gentle S-curve ->
   // SOFT black point -> edge-aware detail -> P3 quality gates. Replaces the old inline
   // tail (flat saturate / hard black point / detail-then-denoise).
   optCabraFinishView(fin, opts.dialog, pp, {
      saturation: isFinite(opts.saturation) ? opts.saturation : Math.min(1.4, pp.saturation),
      blackPoint: opts.blackPoint,
      detailAmount: isFinite(opts.detailAmount) ? opts.detailAmount : 1.3
   });
   return fin;
}

// Picks the NB palette by measuring channel signal: SHO (tri-colour, more colour separation)
// when SII has solid signal; HOO (bicolour) when SII is weak/absent. First heuristic — easy
// to extend with structure/contrast measures.
function optCabraChooseNBPalette(ha, oiii, sii) {
   function snr(v) { try { return optSafeView(v) ? optCabraChannelQuality(v).snr : 0; } catch (e) { return 0; } }
   var sH = snr(ha), sS = snr(sii);
   if (optSafeView(sii) && sS >= OPT_CABRA_OS_DROP_SNR && sS >= 0.5 * sH)
      return { palette: "SHO", reason: "SII solid (SNR " + sS.toFixed(1) + ") -> SHO tri-colour" };
   return { palette: "HOO", reason: "SII weak/absent -> HOO bicolour" };
}
// NB-VIA-RGB path: combine the separate NB channels into an HSO RGB (auto palette) and run
// the new "rgb" pipeline on it for the NEBULA, but colour the STARS with the SetiAstro
// NB->RGB transform (from the separate NB star images). Returns an RGB "Final" view.
function optCabraComposeNBviaRGB(haView, oiiiView, siiView, opts) {
   opts = opts || {}; var tag = opts.tag || "nbviargb";
   var hasS = optSafeView(siiView);
   var ext = 0.15; try { ext = optCabraAnalyze(haView).extendedFraction; } catch (e) {}
   var si = optCabraFinishParams(ext).stretchIntensity;
   var pc = optCabraChooseNBPalette(haView, oiiiView, hasS ? siiView : null);
   console.noteln("=> CabraMagic NB-via-RGB: palette " + pc.palette + " (" + pc.reason + ").");
   // 1) RGB stars via SetiAstro from the separate NB (stretched copies; NO per-channel
   //    gradient, to avoid star halos — the combined HSO gets the single gradient below).
   var cH = optCabraClonePM(haView, tag + "_sh0"), cO = optCabraClonePM(oiiiView, tag + "_so0"), cS = hasS ? optCabraClonePM(siiView, tag + "_ss0") : null;
   optRunAutoGhsStretch(cH, { aghs_intensity: si, aghs_bp: 3.2 });
   optRunAutoGhsStretch(cO, { aghs_intensity: si, aghs_bp: 3.2 });
   if (hasS) optRunAutoGhsStretch(cS, { aghs_intensity: si, aghs_bp: 3.2 });
   var sHa = optCabraMonoStars(cH, tag + "_msh"), sO = optCabraMonoStars(cO, tag + "_mso"), sS = hasS ? optCabraMonoStars(cS, tag + "_mss") : null;
   var starsRGB = optNBtoRGBStars(sHa, sO, sS, { newImageId: tag + "_stars" });
   try { [cH, cO, cS, sHa, sO, sS].forEach(function(v) { if (v && v.window) v.window.forceClose(); }); } catch (e) {}
   // 2) Linear HSO composite (palette) for the nebula -> RGB pipeline, stars = the SetiAstro layer.
   var hso = optCabraCombinePalette(haView, oiiiView, hasS ? siiView : null, pc.palette, tag + "_hso");
   var fin = optCabraComposeRGB({ RGB: hso }, { dialog: opts.dialog, tag: tag, starsView: starsRGB,
      tameFinal: true, detailAmount: 0.7 });   // NB: protect bright emission cores; gentler detail (noisier data)
   try { if (hso && hso.window) hso.window.forceClose(); if (starsRGB && starsRGB.window) starsRGB.window.forceClose(); } catch (e) {}
   return fin;
}

// Builds the channel map {R,G,B,L,H,O,S,RGB} from the dialog's image store. The broadband
// RGB can live under "RGB" or "MonoRGB" (the generic colour slot); we accept either.
function optCabraInputsFromStore(dialog) {
   function vk(k) { try { var r = dialog.store.record(k); return optSafeView(r.view) ? r.view : null; } catch (e) { return null; } }
   return { R: vk("R"), G: vk("G"), B: vk("B"), L: vk("L"), H: vk("H"), O: vk("O"), S: vk("S"),
            RGB: vk("RGB") || vk("MonoRGB") || vk("HSO") };
}

// DISPATCHER: given the channel map, decide the case and produce up to N candidate Final
// views (one per palette for NB cases) — the "CabraMagic offers up to 3 solutions" model.
// Source views are cloned per candidate (the compose functions mutate their inputs).
// Returns { decision, candidates:[{name, view}] }.
function optCabraDispatch(map, opts) {
   opts = opts || {};
   var d = optCabraDecideTree(map);
   var palettes = opts.palettes || ["HOO", "SHO"];
   var hasS = d.usableNB.indexOf("S") >= 0;
   var cands = [];
   function cl(v, id) { return optSafeView(v) ? optCabraClonePM(v, id) : null; }
   var dlg = opts.dialog || null;
   if (d.caseId === "rgb") {
      // RGB-ROUTE-A (2026-06-18, user decision): broadband channels are COMBINED and run
      // through the single-image pipeline (Route A, optCabraMagicRun) — which uses BXT/NXT.
      // The Route-B compose (optCabraComposeRGB) gave poor results on separate R/G/B, so it
      // is no longer used for this case. To revert: replace this block with
      //   cands.push({ name: "RGB", view: optCabraComposeRGB(map, { tag: "cmrgb", dialog: dlg }) });
      var rgbV = optCabraResolveRGB(map, "cmrgb");   // clone RGB/MonoRGB/HSO, else combine R/G/B
      if (optSafeView(rgbV)) {
         try { optCabraMagicRun(rgbV, dlg); }
         catch (eA) { console.warningln("CabraMagic rgb (Route A) failed: " + (eA.message || eA)); }
         // LRGB: if a usable luminance channel is loaded, process it through the same pipeline
         // (so its stretch matches) and inject it as the luminance of the colour final via
         // LRGBCombination — the L carries the SNR/detail, the RGB carries colour. Was dropped
         // before (hasL detected but unused). Reversible: delete this block (RGB stays as-is).
         var isLRGB = false;
         if (d.hasL && optSafeView(map.L)) {
            var lumV = cl(map.L, "cmL");
            if (optSafeView(lumV)) {
               var synWin = null;
               try {
                  optCabraMagicRun(lumV, dlg);
                  // A: emission targets are faint in the broadband L, so pure-L luminance washes
                  // them out. Build a LIGHTEN luminance = max(L, Lum(RGB)) — per pixel, whichever
                  // carries more signal wins, so the emission (bright in RGB) is preserved while
                  // L's depth helps the broadband parts. Reversible: OPT_CABRA_LRGB_SYNTH_LUM=false.
                  var applyView = lumV;
                  if (OPT_CABRA_LRGB_SYNTH_LUM) {
                     synWin = optCreateWindowLike(lumV, "cmLsyn", 1, false);
                     synWin.mainView.beginProcess(UndoFlag_NoSwapFile);
                     var pmL = new PixelMath; pmL.useSingleExpression = true; pmL.createNewImage = false;
                     pmL.expression = "max(" + lumV.id + ", 0.2126*" + rgbV.id + "[0] + 0.7152*" + rgbV.id + "[1] + 0.0722*" + rgbV.id + "[2])";
                     pmL.executeOn(synWin.mainView); synWin.mainView.endProcess();
                     try { synWin.hide(); } catch (eSh) {}
                     applyView = synWin.mainView;
                  }
                  optApplyLuminanceLRGB(rgbV, applyView);
                  isLRGB = true;
                  console.noteln("=> CabraMagic: LRGB -> " + (OPT_CABRA_LRGB_SYNTH_LUM ? "lighten(L, RGB-lum)" : "L") + " luminance applied to the RGB final.");
               } catch (eL) { console.warningln("CabraMagic LRGB luminance step skipped: " + (eL.message || eL)); }
               finally {
                  try { if (synWin && !synWin.isNull) synWin.forceClose(); } catch (eSc) {}
                  try { if (optSafeView(lumV)) optCloseView(lumV); } catch (eLc) {}
               }
            }
         }
         cands.push({ name: isLRGB ? "LRGB" : "RGB", view: rgbV });
      }
   } else if (d.caseId === "nb") {
      var hasHnb = d.usableNB.indexOf("H") >= 0, hasOnb = d.usableNB.indexOf("O") >= 0;
      // SINGLE-NB (Ha-only / OIII-only / SII-only): count the narrowband channels actually
      // LOADED (present in the map), NOT usableNB — usableNB drops O/S below SNR 4.0, so a lone
      // weak OIII (e.g. SNR 3.5) would otherwise fall into the grey HOO/SHO degrade. With one
      // NB channel there is no second emission line for colour, so route it through the
      // single-image MONOCHROME pipeline (Route A): background -> BXT -> NXT -> AutoGHS ->
      // star reduction -> local contrast, with all colour stages skipped. Same clean treatment
      // as an unslotted active mono channel; avoids the fake-OIII=Ha double-stretch.
      var presentNB = [];
      if (optSafeView(map.H)) presentNB.push("H");
      if (optSafeView(map.O)) presentNB.push("O");
      if (optSafeView(map.S)) presentNB.push("S");
      // SINGLE-NB (only ONE narrowband channel LOADED): no second emission line for colour ->
      // monochrome pipeline (optCabraMagicRun: BXT + morphological star reduction, no SXT). With
      // 2+ channels loaded we ALWAYS produce colour (HOO/SHO), honouring the user's selection —
      // a low-SNR channel is NOT dropped. Instead optCabraComposeNBonly denoises each channel by
      // its measured noise before the SXT split (which otherwise tile-artifacts on noisy data):
      // here noise is a quality lever to make the channel usable, not a gate to discard it.
      if (presentNB.length === 1) {
         var nbId = presentNB[0];                                  // "H" | "O" | "S"
         var nbName = (nbId === "O") ? "OIII" : (nbId === "S") ? "SII" : "Ha";
         var nbMono = cl(map[nbId], "cmnbmono");
         if (optSafeView(nbMono)) {
            console.noteln("=> CabraMagic: single narrowband channel (" + nbName + ") -> monochrome pipeline.");
            try { optCabraMagicRun(nbMono, dlg); }
            catch (eM) { console.warningln("CabraMagic " + nbName + " (mono) failed: " + (eM.message || eM)); }
            cands.push({ name: nbName + " (mono)", view: nbMono });
         }
      } else {
         // COMPACT object (planetary / small bright object)? The frame-filling compose over-cooks
         // it (blown core + noisy background — confirmed via SXT debug windows), so route compact
         // NB targets to the mono-style COLOUR path (combine + BXT + noise-ceiling stretch, no SXT
         // extraction). Detected by concentrationIndex, same threshold as the "compact" classifier.
         var nbCompact = false;
         try {
            var nbRef = optSafeView(map.H) ? map.H : (optSafeView(map.O) ? map.O : map.S);
            var anNB = optCabraAnalyze(nbRef);
            if (anNB && isFinite(anNB.concentrationIndex) && anNB.concentrationIndex >= 3.0) nbCompact = true;
         } catch (eCk) {}
         if (nbCompact) {
            console.noteln("=> CabraMagic: compact narrowband object (C>=3) -> compact colour path (no SXT extraction).");
            for (var ci = 0; ci < palettes.length; ++ci)
               cands.push({ name: palettes[ci] + " (compact)", view: optCabraComposeNBCompact(
                  cl(map.H, "ckH" + ci), cl(map.O, "ckO" + ci), hasS ? cl(map.S, "ckS" + ci) : null, palettes[ci], { tag: "cknb" + ci, dialog: dlg }) });
         } else {
            // CLASSIC (existing, reliable): NB-dominant nebula + SetiAstro stars, one per palette.
            // Pushed FIRST so candidate[0] (the promoted "Final") is the dependable result.
            for (var i = 0; i < palettes.length; ++i)
               cands.push({ name: palettes[i] + " (classic)", view: optCabraComposeNBonly(
                  cl(map.H, "cmH" + i), cl(map.O, "cmO" + i), hasS ? cl(map.S, "cmS" + i) : null, palettes[i], { tag: "cmnb" + i }) });
            // NEW (alternative, OPT_CABRA_NB_VIA_RGB_ENABLED): combine -> rgb pipeline + SetiAstro
            // stars. Offered as an extra candidate to compare; not the default Final.
            if (OPT_CABRA_NB_VIA_RGB_ENABLED && hasHnb && hasOnb) {
               try {
                  cands.push({ name: "NB-RGB (auto)", view: optCabraComposeNBviaRGB(
                     cl(map.H, "nvH"), cl(map.O, "nvO"), hasS ? cl(map.S, "nvS") : null, { dialog: dlg, tag: "nvrgb" }) });
               } catch (eNV) { console.warningln("CabraMagic NB-via-RGB candidate failed: " + (eNV.message || eNV)); }
            }
         }
      }
      // GAP 3: L + narrowband. If a usable luminance is loaded, add an extra "<palette> + L"
      // candidate — L run through the same pipeline and injected as luminance over the first
      // COLOUR NB result — ALONGSIDE the pure NB candidate, so the user compares both images and
      // picks. Skipped for the single-NB mono case (no colour to carry the luminance).
      if (d.hasL && optSafeView(map.L)) {
         var baseLnb = null;
         for (var bl = 0; bl < cands.length; ++bl)
            if (optSafeView(cands[bl].view) && cands[bl].view.image.numberOfChannels >= 3) { baseLnb = cands[bl]; break; }
         if (baseLnb) {
            var lnbLum = cl(map.L, "cmLnb"), lnbView = null;
            try {
               optCabraMagicRun(lnbLum, dlg);
               lnbView = optCabraClonePM(baseLnb.view, "cmLNB");
               optApplyLuminanceLRGB(lnbView, lnbLum);
               cands.push({ name: baseLnb.name + " + L", view: lnbView });
               console.noteln("=> CabraMagic: L+NB candidate added (luminance over " + baseLnb.name + ").");
            } catch (eLN) {
               console.warningln("CabraMagic L+NB candidate skipped: " + (eLN.message || eLN));
               if (lnbView && lnbView.window) try { lnbView.window.forceClose(); } catch (eW) {}
            } finally {
               try { if (optSafeView(lnbLum)) optCloseView(lnbLum); } catch (eLc) {}
            }
         }
      }
   } else if (d.caseId === "rgb_nb") {
      var hasH = d.usableNB.indexOf("H") >= 0, hasO = d.usableNB.indexOf("O") >= 0;
      var rgbSrc = optCabraResolveRGB(map, "cmrgbsrc");   // combined RGB (either input form)
      if (hasH && hasO) {
         // full HOO/SHO palettes (NB-dominant); stars from the combined RGB
         for (var j = 0; j < palettes.length; ++j)
            cands.push({ name: palettes[j], view: optCabraComposeRGBNB(
               cl(map.H, "cmH" + j), cl(map.O, "cmO" + j), hasS ? cl(map.S, "cmS" + j) : null,
               rgbSrc, palettes[j], { tag: "cmrn" + j, dialog: dlg }) });
      } else {
         // single NB channel: RGB base + that NB as emission (HaRGB / OIIIRGB), plus plain RGB.
         var nbT = hasH ? "H" : (hasO ? "O" : "S");
         var nbV = hasH ? map.H : (hasO ? map.O : map.S);
         var label = (nbT === "O") ? "OIII+RGB" : (nbT === "S" ? "SII+RGB" : "Ha+RGB");
         cands.push({ name: label, view: optCabraComposeRGBplusNB(rgbSrc, cl(nbV, "cm1nb"), nbT, { tag: "cm1nb", dialog: dlg }) });
         cands.push({ name: "RGB", view: optCabraComposeRGB(map, { tag: "cmrgbonly", dialog: dlg }) });
      }
      try { if (rgbSrc && rgbSrc.window) rgbSrc.window.forceClose(); } catch (eR) {}
   }
   return { decision: d, candidates: cands };
}
// ===== CABRAMAGIC-COMPOSE-END =====

// ===== CABRAMAGIC-EXEC-BEGIN (full linear->Final auto-pilot) =====
// Returns a non-null process instance if `ids` is installed, else null. Used to
// gate native stages (BXT/NXT) with graceful degradation to SyQon equivalents.
function optCabraToolAvailable(ids) {
   try { return optCreateGenericProcessInstance(ids, ids) != null; } catch (e) { return false; }
}

// Self-contained background extraction (no dialog needed). Native ABE with a
// higher function degree to handle STRONG gradients, Subtract correction applied
// in place. Used as the headless path and as the GUI fallback if the configured
// gradient stage fails. Returns nothing; throws on hard failure.
function optCabraBackgroundAuto(view) { return optCabraABEInPlace(view, 4); }
// ABE with a configurable polynomial degree, applied IN PLACE (see ABE-INPLACE-FIX below).
function optCabraABEInPlace(view, degree) {
   var deg = isFinite(degree) ? degree : 4;
   var abe = new AutomaticBackgroundExtractor();
   // Subtract = 1 (enum not always exposed under V8; 1 is the standard value).
   var subtractValue = 1;
   try { if (typeof AutomaticBackgroundExtractor.prototype.Subtract !== "undefined") subtractValue = AutomaticBackgroundExtractor.prototype.Subtract; } catch (e0) {}
   try { abe.targetCorrection = subtractValue; } catch (e1) {}
   try { abe.functionDegree = deg; } catch (e2) {}
   try { abe.normalize = false; } catch (e3) {}
   try { abe.discardModel = true; } catch (e4) {}
   try { abe.replaceTarget = false; } catch (e5) {}
   optSetRequiredProcessProperty(abe, ["targetCorrection", "correction", "target_correction", "Correction"], subtractValue, "ABE Target Correction");
   optSetRequiredProcessProperty(abe, ["polyDegree", "functionDegree", "function_degree", "degree", "FunctionDegree"], deg, "ABE Function Degree");
   // ABE-INPLACE-FIX (2026-06-18): ABE writes the corrected result to a NEW window
   // (<id>_ABE) and leaves `view` UNCHANGED (replaceTarget=false is not honored as an
   // in-place flag here). Headless/fallback callers expect the correction applied to
   // `view`, so we capture the new corrected window, assign it back into `view`, and close
   // the orphan. Without this the background step was a silent no-op (gradients survived).
   var idsBefore = {};
   var wb = ImageWindow.windows;
   for (var iB = 0; iB < wb.length; ++iB) idsBefore[wb[iB].mainView.id] = true;
   abe.executeOn(view);
   var corrected = null, extras = [];
   var wa = ImageWindow.windows;
   for (var iA = 0; iA < wa.length; ++iA) {
      var id = wa[iA].mainView.id;
      if (idsBefore[id]) continue;
      extras.push(wa[iA]);
      if (/_ABE$/.test(id) || (!corrected && !/background/i.test(id))) corrected = wa[iA];
   }
   try {
      if (corrected && optSafeView(corrected.mainView) &&
          corrected.mainView.image.width === view.image.width &&
          corrected.mainView.image.height === view.image.height) {
         view.beginProcess(UndoFlag_NoSwapFile);
         view.image.assign(corrected.mainView.image);
         view.endProcess();
      } else {
         console.warningln("CabraMagic background: ABE produced no usable corrected window; gradient NOT applied.");
      }
   } finally {
      for (var iE = 0; iE < extras.length; ++iE) { try { extras[iE].forceClose(); } catch (eC) {} }
   }
}

// Auto/headless gradient fallback. Order chosen from the deep A/B bench (2026-06-18,
// 6 targets + known-gradient ground truth): GraXpert -> AutoDBE -> ABE.
//   GraXpert: most accurate (lowest residual on a KNOWN injected gradient, 2-3x better than
//             ABE/AutoDBE) and NEVER eats signal (sigKeep 100% on every target). External
//             exe, so used only when its executable is configured/installed.
//   AutoDBE : flattens aggressively on background-dominant frames but OVER-SUBTRACTS objects
//             that fill the frame (big galaxies, planetaries: sigKeep dropped to 16-32%),
//             so it is the 2nd choice. Colour-only (its mono path builds a temp RGB and
//             would not write back in place).
//   ABE     : self-contained native fallback (always available; handles mono too).
function optCabraBackgroundFallback(view) {
   if (!optSafeView(view)) { optCabraBackgroundAuto(view); return; }
   var isColor = view.image.numberOfChannels >= 3;
   // 1) GraXpert (if its executable is available). It modifies `view` in place but leaves a
   //    "GraXpert_Background" model window open — snapshot ids and close any new background
   //    window afterwards so the pipeline does not accumulate orphans.
   try {
      var gxExe = (typeof optResolveGraXpertExecutablePath === "function") ? optResolveGraXpertExecutablePath() : "";
      if (gxExe && gxExe.length > 0) {
         var gxIds = {};
         var gwb = ImageWindow.windows;
         for (var iG = 0; iG < gwb.length; ++iG) gxIds[gwb[iG].mainView.id] = true;
         optRunGraXpertDirectly(view, null);
         var gwa = ImageWindow.windows;
         for (var iGA = 0; iGA < gwa.length; ++iGA) {
            var gid = gwa[iGA].mainView.id;
            if (!gxIds[gid] && gid !== view.id && /background/i.test(gid)) { try { gwa[iGA].forceClose(); } catch (eClose) {} }
         }
         return;
      }
   } catch (eGX) { console.warningln("CabraMagic background: GraXpert failed (" + (eGX.message || eGX) + "), trying AutoDBE."); }
   // 2) AutoDBE (colour only)
   if (isColor && typeof optIsAutoDBEAvailable === "function" && optIsAutoDBEAvailable()) {
      try {
         optRunAutoDBEGradientCorrection(view, { descentPathsInput: 500, tolerance: 1.0, smoothing: 0.5, showModel: false });
         return;
      } catch (eDBE) { console.warningln("CabraMagic background: AutoDBE failed (" + (eDBE.message || eDBE) + "), using ABE."); }
   }
   // 3) ABE (always available)
   optCabraBackgroundAuto(view);
}

// Gradient correction for the COMPOSE path (called per NB channel by optCabraStretchNB and
// on the RGB stars layer by optCabraRGBStars). Uses the user's CONFIGURED tool if available,
// otherwise does NOTHING.
// IMPORTANT (2026-06-18 regression fix): do NOT run the aggressive auto fallback
// (GraXpert/AutoDBE/ABE) here. The compose pipeline is tuned for channels WITHOUT
// per-channel gradient subtraction; applying it per NB channel blows out the emission
// (over-stretch) and carves dark halos/rings around stars. Until 2026-06-18 the fallback
// was a SILENT no-op (ABE created an orphan window and left the view unchanged), and that
// no-op is exactly what produced the validated-good HOO/SHO composites. We now make the
// no-op explicit. The single-image auto-pilot (optCabraMagicRun) still calls
// optCabraBackgroundFallback directly for real gradient removal.
function optCabraBackground(view, dialog) {
   if (dialog && dialog.comboPreGradient) {
      try { optApplyPreCandidate(view, "gradient", dialog); return; }
      catch (e) { console.warningln("CabraMagic gradient: configured tool failed (" + (e.message || e) + "), skipping per-channel background."); }
   }
   // No configured tool (or it failed): intentionally no per-channel auto background.
}

// Removes the green color cast (SCNR, average-neutral) — standard astro step that
// was missing and caused the greenish background/galaxy tint. Color images only.
function optCabraRemoveGreen(view) {
   if (view.image.numberOfChannels < 3) return;
   var s = new SCNR();
   try { s.protectionMethod = SCNR.prototype.AverageNeutral; } catch (e0) {}
   try { s.colorToRemove = SCNR.prototype.Green; } catch (e1) {}
   try { s.amount = 1.0; } catch (e2) {}
   s.executeOn(view);
}

// Master auto-pilot. Runs the whole pipeline IN PLACE on `view` (the UI layer
// clones the active image into a "Final" view first, then calls this and jumps to
// Image Enhancement). Every stage is wrapped: one failure logs + continues, so a
// missing tool never aborts the run. `dialog` is the live dialog (gradient/SPCC
// stages stay coupled to it, per the script's known scope limit). Aggressiveness
// is BALANCED. Returns { recipe, stats, stages:[{name,status,detail}] }.
// NATIVE-DENOISE (F7): pick the denoiser for an auto run. External tools (NXT,
// Prism) are preferred when present; otherwise fall back to TGVDenoise — PixInsight
// core, always available — so the autopilot ALWAYS denoises instead of skipping.
// Pure / deterministic. Returns "NXT" | "PRISM" | "TGV" | "NONE".
function optCabraDenoiseChoice(mode, nxtOk, prismOk) {
   mode = String(mode || "AUTO").toUpperCase();
   if (mode === "NONE") return "NONE";
   if (mode === "PRISM" && prismOk) return "PRISM";
   if (mode === "NXT" && nxtOk) return "NXT";
   if (nxtOk) return "NXT";
   if (prismOk) return "PRISM";
   return "TGV";
}

function optCabraMagicRun(view, dialog, opts) {
   // CABRAMAGIC-ABOPTS-BEGIN: optional tool overrides for A/B benchmarking. Defaults
   // ("AUTO") preserve the production preference order (BXT->Parallax, NXT->Prism).
   //   opts.sharpen : "AUTO" | "BXT" | "PARALLAX" | "NONE"
   //   opts.denoise : "AUTO" | "NXT" | "PRISM" | "NONE"
   opts = opts || {};
   var abSharpen = (opts.sharpen || "AUTO").toUpperCase();
   var abDenoise = (opts.denoise || "AUTO").toUpperCase();
   // CABRAMAGIC-ABOPTS-END
   if (!optSafeView(view)) throw new Error("CabraMagic: no valid view.");
   var stats = optCabraAnalyze(view);
   // RECIPE-ENGINE (F5): opts.recipe overrides the auto-computed recipe when supplied.
   var recipe = (typeof optCabraResolveRecipe === "function") ? optCabraResolveRecipe(stats, opts) : optCabraBuildRecipe(stats);
   var isColor = view.image.numberOfChannels >= 3;
   var report = { recipe: recipe, stats: stats, stages: [] };
   function stage(name, fn) {
      // CANCEL (GUI only): when the caller supplies a shouldCancel probe, yield so a
      // queued ✕ click is delivered, then stop before the next stage. Headless callers
      // (harness / smoke) pass no shouldCancel → this is a no-op and stage() stays
      // byte-identical, so the regression baseline is unaffected.
      if (report.cancelled) return;
      if (opts && typeof opts.shouldCancel === "function") {
         try { optProcessEvents(); } catch (ePE) {}
         if (opts.shouldCancel()) { report.cancelled = true; console.writeln("=> CabraMagic: cancelled by user before [" + name + "]."); return; }
      }
      try { console.writeln("=> CabraMagic [" + name + "] ..."); fn(); report.stages.push({ name: name, status: "ok", detail: "" }); }
      catch (e) { console.warningln("CabraMagic [" + name + "] skipped: " + (e.message || e)); try { if (typeof optDiagError === "function") optDiagError("CabraMagic: " + name, e, ""); } catch (eD) {} report.stages.push({ name: name, status: "skip", detail: e.message || String(e) }); }
   }
   console.writeln("=> CabraMagic: label=" + recipe.label + (recipe.narrowband ? " (NB)" : "") +
      "  starReduce=" + recipe.starReduce + " structure=" + recipe.structure +
      " coreProtect=" + recipe.coreProtect + " detail=" + recipe.detailAmount + " sat=" + recipe.saturation);

   // 1) BACKGROUND — GUI: the user's configured Gradient Correction; headless or on
   //    failure: self-contained ABE (degree 4) so strong gradients are still removed.
   stage("background", function() {
      var done = false;
      if (dialog && dialog.comboPreGradient) {
         try { optApplyPreCandidate(view, "gradient", dialog); done = true; }
         catch (eG) { console.warningln("CabraMagic background: configured gradient failed (" + (eG.message || eG) + "), falling back to auto (AutoDBE -> ABE)."); }
      }
      if (!done) optCabraBackgroundFallback(view);
   });

   // 2) COLOR — SPCC if RGB + astrometry, else Auto Linear Fit + Background Neutralization.
   // V2 robustness (found in the real-data GUI validation): if the SPCC stage FAILS
   // (no Gaia DB, offline, fresh instance...), fall back to ALF+BN instead of leaving
   // the image with no colour calibration at all — colorDone only flips inside the
   // stage fn, so a thrown SPCC never sets it.
   if (isColor) {
      var colorDone = false;
      if (optHasAstrometricSolution(view))
         stage("color (SPCC)", function() { optApplyPreCandidate(view, "spcc", dialog); colorDone = true; });
      if (!colorDone) {
         stage("color (LinearFit)", function() { optApplyPreCandidate(view, "alf", dialog); });
         stage("color (BkgNeutralize)", function() { optApplyPreCandidate(view, "bn", dialog); });
      }
   }

   // 3) DECONV / SHARPEN — BXT preferred; else SyQon Parallax; else skip.
   //    sharpen_nonstellar eased by coreProtect (protect concentrated cores from over-sharpen).
   function abRunBXT() {
      stage("sharpen (BXT)", function() {
         optExecuteBlurXConfiguredOnView(view, {
            automatic_psf: true, sharpen_stars: 0.10, adjust_star_halos: 0.0,
            sharpen_nonstellar: Math.max(0.18, Math.min(0.36, 0.34 - recipe.coreProtect * 0.12)),
            correct_only: false
         });
      });
   }
   function abRunParallax() { stage("sharpen (SyQon Parallax)", function() { optRunSyQonParallaxOnView(view, {}, dialog); }); }
   var bxtOk = optCabraToolAvailable(["BlurXTerminator"]);
   var parOk = (typeof optIsParallaxAvailable === "function" && optIsParallaxAvailable());
   if (abSharpen === "NONE") {
      report.stages.push({ name: "sharpen", status: "skip", detail: "disabled (A/B)" });
   } else if (abSharpen === "PARALLAX" && parOk) { abRunParallax(); }
   else if (abSharpen === "BXT" && bxtOk) { abRunBXT(); }
   else if (bxtOk) { abRunBXT(); }
   else if (parOk) { abRunParallax(); }
   else { report.stages.push({ name: "sharpen", status: "skip", detail: "no BXT / Parallax installed" }); }

   // 4) DENOISE — NXT preferred; else SyQon Prism; else skip.
   function abRunNXT() {
      stage("denoise (NXT)", function() {
         optExecuteNoiseXConfiguredOnView(view, {
            denoise: 0.80, iterations: 2, enable_color_separation: false,
            enable_frequency_separation: false, denoise_color: 0.0, denoise_lf: 0.0,
            denoise_lf_color: 0.0, frequency_scale: 5
         });
      });
   }
   function abRunPrism() { stage("denoise (SyQon Prism)", function() { optRunSyQonPrismOnView(view, {}, dialog); }); }
   // NATIVE-DENOISE (F7): TGVDenoise fallback — light, edge-protecting, always available.
   function abRunTGV() {
      stage("denoise (TGVDenoise fallback)", function() {
         optExecuteTgvDenoiseConfiguredOnView(view, { strengthL: 1.5, strengthC: 1.0, edgeProtection: 0.003, smoothness: 2.0, maxIterations: 100 });
      });
   }
   var nxtOk = optCabraToolAvailable(["NoiseXTerminator"]);
   var prismOk = (typeof optIsPrismAvailable === "function" && optIsPrismAvailable());
   var dnChoice = optCabraDenoiseChoice(abDenoise, nxtOk, prismOk);

   // V2 adaptive finishing targets (stretch intensity, lumTarget, blackPoint, saturation)
   // from the diffuse extent — the single-image path used to hard-code these.
   var fp = optCabraFinishParams(stats.extendedFraction);

   // 4) V2-P1: STAR SPLIT + DUAL STRETCH (community-canon workflow: DBE -> SPCC -> BXT ->
   //    SXT -> NXT on starless -> stretch per layer -> screen recombine). This was the big
   //    asymmetry vs the multichannel pipeline: the single-image path stretched WITH the
   //    stars in, baking in bloated halos that the later morphological reduction cannot
   //    undo. With no engine installed (or opts.noSplit) the stage throws and the legacy
   //    single-stretch path below runs unchanged — graceful degradation.
   var split = { done: false };
   if (opts.noSplit !== true) stage("star split + dual stretch", function() {
      var sl = optCabraClonePM(view, view.id + "_cmsl"), st = null;
      try {
         var engine = optCabraMakeStarless(sl, dialog);
         if (!engine) throw new Error("no star-removal engine installed (SXT/StarNet) — classic single-stretch path");
         console.noteln("=> CabraMagic: star split via " + engine + ".");
         // stars = view - starless (linear residual)
         var Pe = new PixelMath;
         if (isColor) {
            Pe.expression  = "max(0," + view.id + "[0]-" + sl.id + "[0])";
            Pe.expression1 = "max(0," + view.id + "[1]-" + sl.id + "[1])";
            Pe.expression2 = "max(0," + view.id + "[2]-" + sl.id + "[2])"; Pe.expression3 = "";
            Pe.useSingleExpression = false; Pe.newImageColorSpace = PixelMath.RGB;
         } else {
            Pe.expression = "max(0," + view.id + "-" + sl.id + ")";
            Pe.useSingleExpression = true; Pe.newImageColorSpace = PixelMath.Gray;
         }
         Pe.createNewImage = true; Pe.newImageId = view.id + "_cmst";
         Pe.newImageSampleFormat = PixelMath.SameAsTarget; Pe.showNewImage = false;
         Pe.truncate = true; Pe.truncateLower = 0; Pe.truncateUpper = 1;
         Pe.executeOn(view);
         st = ImageWindow.windowById(view.id + "_cmst").mainView;
         // Starless, canonical order: stretch -> residual star cleanup -> denoise
         // (denoising the freshly-stretched starless, never the stars).
         optRunAutoGhsStretch(sl, { aghs_intensity: fp.stretchIntensity, aghs_noiseCeiling: 0.05, aghs_bp: 3.0 });
         optStarReduceOnView(sl, 0.5, 3);
         // 0.60 (was 0.45): the legacy pipeline denoised at NXT 0.80x2 — 0.45 left too
         // much residue for the finishing boosts on noisy fields (user 2026-07-02).
         if (dnChoice !== "NONE") optCabraDenoiseFallback(sl, dialog, 0.60);
         // Stars: gentle StarStretch keeps profiles tight and colour saturated.
         optNbStarStretch(st, 5, 1.0);
         // Screen-recombine both layers back INTO the working view (in place).
         var Pc = new PixelMath;
         if (isColor) {
            Pc.expression  = "1-(1-" + sl.id + "[0])*(1-" + st.id + "[0])";
            Pc.expression1 = "1-(1-" + sl.id + "[1])*(1-" + st.id + "[1])";
            Pc.expression2 = "1-(1-" + sl.id + "[2])*(1-" + st.id + "[2])"; Pc.expression3 = "";
            Pc.useSingleExpression = false;
         } else {
            Pc.expression = "1-(1-" + sl.id + ")*(1-" + st.id + ")";
            Pc.useSingleExpression = true;
         }
         Pc.createNewImage = false; Pc.showNewImage = false;
         Pc.executeOn(view);
         split.done = true;
      } finally {
         try { if (sl && sl.window) sl.window.forceClose(); } catch (eSl) {}
         try { if (st && st.window) st.window.forceClose(); } catch (eSt) {}
      }
   });

   // 5) LEGACY single-stretch path — only when the split did not happen. Denoise stays
   //    linear-before-stretch here (the historical behaviour), then AutoGHS with the
   //    noise ceiling, then morphological star reduction on the stretched result.
   if (!split.done) {
      if (dnChoice === "PRISM") abRunPrism();
      else if (dnChoice === "NXT") abRunNXT();
      else if (dnChoice === "TGV") abRunTGV();
      else report.stages.push({ name: "denoise", status: "skip", detail: "disabled (A/B)" });
      stage("stretch (AutoGHS)", function() { optRunAutoGhsStretch(view, { aghs_intensity: fp.stretchIntensity, aghs_noiseCeiling: 0.05 }); });
      if (recipe.starReduce > 0.02)
         stage("star reduction", function() { optStarReduceOnView(view, recipe.starReduce, 2); });
   }

   // 6) STRUCTURE — local-contrast boost from the recipe (both paths). Noise-aware:
   //    local contrast runs AFTER the denoise and amplifies background texture, so on
   //    a noisy field it is damped (same SNR gate as the finisher's boosts).
   stage("structure (local contrast)", function() {
      var dst = (typeof optDetailDefaultState === "function") ? optDetailDefaultState() : { algoId: "localContrast" };
      var lcA = recipe.structure;
      try {
         var qS = optCabraChannelQuality(view);
         if (qS && isFinite(qS.snr) && qS.snr < 5) {
            lcA = lcA * 0.6;
            console.noteln("=> CabraMagic structure: SNR " + qS.snr.toFixed(1) + " (noisy) -> local contrast damped to " + lcA.toFixed(2) + ".");
         }
      } catch (eQ) {}
      dst.algoId = "localContrast"; dst.lcAmount = lcA;
      optRunDetailOnView(view, dst);
   });

   // 7) V2-P2/P3 FINISH — shared finisher (SCNR + vibrance/saturation + lumTarget +
   //    S-curve + soft black point + quality gates). Replaces the legacy SCNR and flat
   //    saturation stages; detailAmount 0 because structure was just applied above.
   stage("finish (colour / contrast / QA)", function() {
      optCabraFinishView(view, dialog, fp, { detailAmount: 0, saturation: fp.saturation });
   });

   console.writeln("=> CabraMagic: done (" + report.stages.length + " stages).");
   // Leak sentinel (log-only): shared helpers (Channel Combination compose, gray
   // PixelMath temps, compare clones) must never survive an autopilot run. The
   // autopilot's own solution views use different ids, so they are not flagged.
   try { if (typeof optDiagScanTempLeaks === "function") optDiagScanTempLeaks("CabraMagic", ["Opt_CC_", "Opt_Gray", "Opt_Compare_"]); } catch (eLk) {}
   return report;
}
// ===== CABRAMAGIC-EXEC-END =====
// ===== CABRAMAGIC-END =====
