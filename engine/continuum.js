// CONTINUUM-SUB-ENGINE-BEGIN
// Continuum Subtraction — isolates pure emission-line signal by subtracting a
// scaled broadband continuum:  Emission = NB - k*(Continuum - bg). Stars and
// continuum sources are flat across the band, so with the right k they cancel
// and only the emission nebula survives. The scaling factor k is estimated by
// robust regression over the flux of stars common to both images: StarDetector
// runs on the continuum, and the SAME aperture (each star's detection rect) is
// integrated on both views, which guarantees correspondence without a matching
// step and avoids the over-subtraction of a naive LinearFit (nebula pixels bias
// that fit). The community-standard PixelMath form keeps the NB background and
// removes only the continuum structure above its own background. When the
// continuum is RGB, the channel matching the emission line is used (Ha/SII -> R,
// OIII -> G), with luminance as the fallback for an unknown line.
//
// Two robustness features for real-world data:
//  - STAR-POOR FALLBACK: if StarDetector finds too few stars (galaxy / narrow fields), k is
//    derived from a high-frequency structural regression instead of the crude k=1 default
//    (optCsEstimateKHighpass); unified optCsEstimateK picks stars -> high-pass -> default.
//  - COMPACT GUARD (auto hybrid): a COMPACT object (a galaxy's HII knots) would be eaten by
//    star removal, so compact targets (high concentration index) are subtracted WITH stars.
//
// Reversibility: this whole block is bounded by CONTINUUM-SUB-ENGINE-BEGIN/END
// and the feature is gated by OPT_CONTINUUM_SUB_ENABLED. Delete the block (and
// the matching CONTINUUM-SUB-UI block) to remove the feature entirely.
var OPT_CONTINUUM_SUB_ENABLED = true;
var OPT_CS_STAR_SENSITIVITY = 0.5;    // StarDetector sensitivity
var OPT_CS_MAX_STARS        = 250;    // cap on stars used for the fit (brightest first)
var OPT_CS_MIN_STARS        = 8;      // need at least this many to trust auto-k
var OPT_CS_SATURATION       = 0.92;   // skip stars with a peak above this (clipped cores bias the ratio)
var OPT_CS_K_CLIP_SIGMA     = 2.5;    // sigma-clip on per-star ratios for robust k
var OPT_CS_K_MAX            = 4.0;    // sanity cap on auto-k
var OPT_CS_DEFAULT_K        = 1.0;    // fallback when auto-estimation is unreliable

// Local-background-subtracted star core flux over a square box centred on
// (cx,cy), half-size r. The box median estimates the LOCAL background (the star
// core is a minority of the box), so any smooth offset under the star — most
// importantly real nebulosity in the NB image — is removed locally. This is what
// keeps the k regression unbiased: a global background would let the nebula leak
// into the per-star flux and corrupt k. Aperture is built from the star centroid
// + size because StarDetector's Star object exposes `pos`/`size`, not a `rect`.
function optCsStarApertureFlux(image, cx, cy, r) {
   var R = r + 2;   // small margin so the box holds enough background pixels
   var x0 = Math.max(0, Math.floor(cx - R));
   var y0 = Math.max(0, Math.floor(cy - R));
   var x1 = Math.min(image.width, Math.ceil(cx + R + 1));
   var y1 = Math.min(image.height, Math.ceil(cy + R + 1));
   var vals = [];
   for (var y = y0; y < y1; ++y)
      for (var x = x0; x < x1; ++x)
         vals.push(image.sample(x, y, 0));
   if (vals.length === 0)
      return 0;
   vals.sort(function(a, b) { return a - b; });
   var localBg = optCsMedianSorted(vals);
   // Sum ALL deviations from the local background (no positive clipping): with
   // localBg = box median, the background noise is ~symmetric and cancels, so the
   // result is the star core flux without the upward rectification bias that
   // clipping would add (which otherwise pushes k high).
   var sum = 0;
   for (var i = 0; i < vals.length; ++i)
      sum += vals[i] - localBg;
   return sum;
}

// Detect stars on starImage and return per-star {nb, cont} core-flux pairs,
// each measured with its own local background on nbImage and contImage (all
// single-channel images).
function optCsStarFluxPairs(starImage, nbImage, contImage) {
   var SD = new StarDetector();
   try { SD.sensitivity = OPT_CS_STAR_SENSITIVITY; } catch (e0) {}
   try { SD.upperLimit = OPT_CS_SATURATION; } catch (e1) {}   // exclude near-saturated cores
   var stars = SD.stars(starImage);
   if (!stars || stars.length === 0)
      return [];
   // Brightest first, then cap — keeps the fit fast and weighted to high-SNR stars.
   stars.sort(function(a, b) { return (b.flux || 0) - (a.flux || 0); });
   var pairs = [];
   var limit = Math.min(stars.length, OPT_CS_MAX_STARS);
   for (var i = 0; i < limit; ++i) {
      var st = stars[i];
      var p = st.pos;
      if (!p) continue;
      // Aperture half-size from the detected star area (size = px^2).
      var sz = isFinite(st.size) ? st.size : 9;
      var r = Math.max(2, Math.min(12, Math.round(Math.sqrt(Math.max(1, sz)))));
      var fc = optCsStarApertureFlux(contImage, p.x, p.y, r);
      if (!(fc > 0)) continue;
      var fn = optCsStarApertureFlux(nbImage, p.x, p.y, r);
      if (!(fn > 0)) continue;
      pairs.push({ nb: fn, cont: fc });
   }
   return pairs;
}

// Robust scaling factor k from flux pairs via a flux-weighted least-squares fit
// through the origin: k = Σ(nb·cont) / Σ(cont²). Weighting by cont² lets bright,
// high-SNR stars dominate and suppresses the bias that faint stars (where nebula
// and noise rival the stellar core) would inject into an unweighted median of
// ratios. One robust sigma-clip pass on the residuals drops outliers (variable
// or blended stars) before the final refit. Returns { k, n, ok }.
function optCsSlopeThroughOrigin(arr) {
   var sxy = 0, sxx = 0;
   for (var i = 0; i < arr.length; ++i) {
      sxy += arr[i].nb * arr[i].cont;
      sxx += arr[i].cont * arr[i].cont;
   }
   return sxx > 0 ? sxy / sxx : NaN;
}
function optCsEstimateKFromPairs(allPairs) {
   if (allPairs.length < OPT_CS_MIN_STARS)
      return { k: OPT_CS_DEFAULT_K, n: allPairs.length, ok: false };
   // Fit on the brighter half of stars (at least MIN_STARS): faint cores have
   // nebula/noise rivalling the signal and are unreliable for a photometric scale.
   var sorted = allPairs.slice(0).sort(function(a, b) { return b.cont - a.cont; });
   var useN = Math.max(OPT_CS_MIN_STARS, Math.ceil(sorted.length * 0.5));
   var pairs = sorted.slice(0, Math.min(sorted.length, useN));
   var n = pairs.length;
   var k = optCsSlopeThroughOrigin(pairs);
   if (!isFinite(k))
      return { k: OPT_CS_DEFAULT_K, n: n, ok: false };
   // Robust scale of residuals (1.4826*MAD) for one sigma-clip pass.
   var res = [];
   for (var i = 0; i < n; ++i)
      res.push(Math.abs(pairs[i].nb - k * pairs[i].cont));
   res.sort(function(a, b) { return a - b; });
   var mad = 1.4826 * optCsMedianSorted(res);
   var kept = pairs;
   if (mad > 0) {
      kept = [];
      for (var j = 0; j < n; ++j)
         if (Math.abs(pairs[j].nb - k * pairs[j].cont) <= OPT_CS_K_CLIP_SIGMA * mad)
            kept.push(pairs[j]);
      if (kept.length >= OPT_CS_MIN_STARS) {
         var k2 = optCsSlopeThroughOrigin(kept);
         if (isFinite(k2)) k = k2;
      } else {
         kept = pairs;
      }
   }
   if (!isFinite(k) || k <= 0)
      return { k: OPT_CS_DEFAULT_K, n: kept.length, ok: false };
   if (k > OPT_CS_K_MAX) k = OPT_CS_K_MAX;
   return { k: k, n: kept.length, ok: true };
}

// FALLBACK k (star-poor / galaxy fields): regress the HIGH-FREQUENCY (structural) component.
// Stars and other continuum point sources live in the high-pass (image − boxblur); the smooth
// emission nebula that would bias a global LinearFit is removed by the high-pass, so the slope
// over significant-structure pixels gives the continuum scale even when StarDetector finds too
// few discrete stars. Downsampled for speed (this is a scalar estimate, not a per-pixel map).
function optCsEstimateKHighpass(nbImage, contImage) {
   var w = nbImage.width, h = nbImage.height, count = w * h, rect = new Rect(0, 0, w, h);
   var nb = new Float32Array(count), co = new Float32Array(count);
   nbImage.getSamples(nb, rect, 0); contImage.getSamples(co, rect, 0);
   var dn = optCabraBoxDown(nb, w, h, 1500), dc = optCabraBoxDown(co, w, h, 1500);
   var dw = dn.w, dh = dn.h, n = dw * dh, an = dn.a, ac = dc.a;
   var r = 8;   // low-pass radius -> high-pass isolates stars/structure, drops smooth nebula
   var lpN = optCmBoxBlur(an, dw, dh, r), lpC = optCmBoxBlur(ac, dw, dh, r);
   var hpN = new Float32Array(n), hpC = new Float32Array(n), absC = [];
   for (var i = 0; i < n; ++i) { hpN[i] = an[i] - lpN[i]; hpC[i] = ac[i] - lpC[i]; absC.push(Math.abs(hpC[i])); }
   absC.sort(function(a, b) { return a - b; });
   var madC = 1.4826 * (absC[absC.length >> 1] || 0);
   var thr = Math.max(1e-6, 3 * madC);   // regress only on real structure, not flat noise/nebula
   var sxy = 0, sxx = 0, used = 0;
   for (var p = 0; p < n; ++p) {
      if (Math.abs(hpC[p]) < thr) continue;
      sxy += hpN[p] * hpC[p]; sxx += hpC[p] * hpC[p]; ++used;
   }
   var k = (sxx > 0) ? sxy / sxx : NaN;
   if (!isFinite(k) || k <= 0 || used < 20)
      return { k: OPT_CS_DEFAULT_K, n: used, ok: false, method: "highpass" };
   if (k > OPT_CS_K_MAX) k = OPT_CS_K_MAX;
   return { k: k, n: used, ok: true, method: "highpass" };
}

// Unified k estimate: prefer star photometry (reliable when enough stars), else fall back to
// high-frequency structural regression (galaxy / star-poor), else the safe default. Always
// returns { k, n, ok, method }.
function optCsEstimateK(nbImage, contImage, starImage) {
   var pairs = optCsStarFluxPairs(starImage, nbImage, contImage);
   if (pairs.length >= OPT_CS_MIN_STARS) {
      var est = optCsEstimateKFromPairs(pairs);
      if (est.ok) { est.method = "stars"; return est; }
   }
   var hp = optCsEstimateKHighpass(nbImage, contImage);
   if (hp.ok) return hp;
   return { k: OPT_CS_DEFAULT_K, n: pairs.length, ok: false, method: "default" };
}

function optCsMedianSorted(sortedArr) {
   var n = sortedArr.length;
   if (n === 0) return NaN;
   var mid = n >> 1;
   return (n % 2) ? sortedArr[mid] : 0.5 * (sortedArr[mid - 1] + sortedArr[mid]);
}

// RGB continuum -> single channel matching the emission line (Ha/SII -> R=0,
// OIII -> G=1). Returns a channel index, or -1 to request luminance.
function optCsContinuumChannelForLine(line) {
   if (line === "O") return 1;
   if (line === "H" || line === "S") return 0;
   return -1;
}

// Rec.709 luminance of an RGB view as a hidden mono view (caller closes it).
function optCsExtractLuminance(rgbView, baseId) {
   var win = optCreateWindowLike(rgbView, baseId || "CS_Lum", 1, false);
   try {
      win.mainView.beginProcess(UndoFlag_NoSwapFile);
      var pm = new PixelMath();
      pm.useSingleExpression = true;
      pm.createNewImage = false;
      pm.expression = "0.2126*" + rgbView.id + "[0] + 0.7152*" + rgbView.id + "[1] + 0.0722*" + rgbView.id + "[2]";
      pm.executeOn(win.mainView);
      win.mainView.endProcess();
      try { win.hide(); } catch (eH) {}
      return win.mainView;
   } catch (e) {
      try { win.forceClose(); } catch (eC) {}
      throw e;
   }
}

// Resolve the continuum to a single-channel view ready for subtraction. Returns
// { view, temp } where temp is true if the caller must close `view`.
function optCsResolveContinuumMono(contView, line) {
   if (optViewIsMono(contView))
      return { view: contView, temp: false };
   var ch = optCsContinuumChannelForLine(line);
   if (ch >= 0 && ch < contView.image.numberOfChannels) {
      var chView = optExtractGrayChannelView(contView, ch, "CS_ContCh_" + contView.id);
      if (!optSafeView(chView))
         throw new Error("[CS] Failed to extract continuum channel " + ch + ".");
      return { view: chView, temp: true };
   }
   var lum = optCsExtractLuminance(contView, "CS_ContLum_" + contView.id);
   if (!optSafeView(lum))
      throw new Error("[CS] Failed to extract continuum luminance.");
   return { view: lum, temp: true };
}

// Public: estimate k for a NB line vs a continuum reference (no subtraction).
// Used by the UI "Auto (stars)" button. Returns { k, n, ok }.
function optEstimateContinuumK(nbView, contView, line) {
   if (!optSafeView(nbView) || !optSafeView(contView))
      throw new Error("[CS] A valid emission-line view and continuum view are required.");
   optRequireSameGeometry("Continuum Subtraction", [nbView, contView]);
   var resolved = optCsResolveContinuumMono(contView, line || "");
   try {
      return optCsEstimateK(nbView.image, resolved.view.image, resolved.view.image);
   } finally {
      if (resolved.temp) optCloseView(resolved.view);
   }
}

// Public engine: produce a star-free emission map = max(floor, NB - k*(Cont-bg)).
// opts: { k (<=0 => auto), line ("H"|"O"|"S"|""), floor (default 0), baseId }.
// Returns a new hidden mono view (caller routes it into the pipeline).
function optRunContinuumSubtraction(nbView, contView, opts) {
   if (!OPT_CONTINUUM_SUB_ENABLED)
      throw new Error("[CS] Continuum Subtraction is disabled.");
   if (!optSafeView(nbView) || !optSafeView(contView))
      throw new Error("[CS] A valid emission-line view and continuum view are required.");
   if (!optViewIsMono(nbView))
      throw new Error("[CS] The emission line must be a single-channel image.");
   optRequireSameGeometry("Continuum Subtraction", [nbView, contView]);
   opts = opts || {};
   var line = opts.line || "";
   var floor = isFinite(opts.floor) ? opts.floor : 0.0;
   var baseId = opts.baseId || ((line || nbView.id) + "_CS");

   var resolved = optCsResolveContinuumMono(contView, line);
   var contMono = resolved.view;
   var resultView = null;
   try {
      var contBg = contMono.image.median();
      var k = isFinite(opts.k) ? opts.k : -1;
      if (!(k > 0)) {
         var est = optCsEstimateK(nbView.image, contMono.image, contMono.image);
         k = est.k;
         console.writeln("=> Continuum Subtraction: auto k = " + k.toFixed(4) + " (" + est.method + ", " +
            est.n + (est.method === "highpass" ? " structure px" : " stars") + ")" +
            (est.ok ? "." : " — unreliable, using fallback."));
      } else {
         console.writeln("=> Continuum Subtraction: manual k = " + k.toFixed(4) + ".");
      }
      // Work on a hidden clone of the NB line so the source view is untouched.
      var outWin = optCreateWindowLike(nbView, baseId, 1, false);
      outWin.mainView.beginProcess(UndoFlag_NoSwapFile);
      outWin.mainView.image.assign(nbView.image);
      outWin.mainView.endProcess();
      var pm = new PixelMath();
      pm.useSingleExpression = true;
      pm.createNewImage = false;
      pm.expression = "max(" + floor.toFixed(6) + ", $T - " + k.toFixed(6) +
         "*(" + contMono.id + " - " + contBg.toFixed(8) + "))";
      pm.executeOn(outWin.mainView);
      optCopyMetadata(outWin, nbView);
      try { outWin.hide(); } catch (eH) {}
      resultView = outWin.mainView;
      return resultView;
   } finally {
      if (resolved.temp) optCloseView(resolved.view);
   }
}

// ---- Automatic, hybrid (starless) Continuum Subtraction -------------------
// The hybrid workflow follows the modern community best practice: derive k from
// the stars (photometric, reliable) but apply the subtraction on STARLESS images
// so a single global k cannot leave per-star colour residuals. Stars are removed
// with whatever engine is installed; results land in the H_CS / O_CS / S_CS slots.

// Best installed star-removal engine: 0 = StarXTerminator, 1 = StarNet2,
// 2 = SyQon Starless; -1 if none.
function optCsBestStarRemovalMethod() {
   if (typeof StarXTerminator !== "undefined") return 0;
   if (typeof StarNet2 !== "undefined") return 1;
   if (typeof optIsSyQonStarlessAvailable === "function" && optIsSyQonStarlessAvailable()) return 2;
   return -1;
}

// Starless copy of `view` via the existing dual-engine split. Returns the
// starless view (caller closes it); the stars output is discarded here.
function optCsStarlessOf(dlg, view, baseId, methodIdx) {
   var split = dlg.runStarSplitEngineOn({ view: view }, baseId, methodIdx);
   if (split && optSafeView(split.stars)) {
      try { optCloseView(split.stars); } catch (e0) {}
   }
   if (!split || !optSafeView(split.starless))
      throw new Error("[CS] Star removal produced no starless image for '" + view.id + "'.");
   return split.starless;
}

// Resolve the broadband continuum channel (with stars) for an emission line,
// from the loaded slots: Ha/SII -> Red, OIII -> Green. Prefers separate mono
// channels (R/G/B slots), else extracts the channel from a combined RGB/MonoRGB
// broadband. Returns { view, temp } (temp => caller closes it) or null.
function optCsResolveAutoContinuum(dlg, lineTag) {
   var store = dlg.store;
   var ch = (lineTag === "O") ? 1 : 0;            // OIII -> G(1); Ha/SII -> R(0)
   var sepKey = (lineTag === "O") ? "G" : "R";
   var sep = store.record(sepKey).view;
   if (optSafeView(sep) && optViewIsMono(sep))
      return { view: sep, temp: false };
   var comb = store.record("RGB").view;
   if (!optSafeView(comb)) comb = store.record("MonoRGB").view;
   if (optSafeView(comb)) {
      if (optViewIsMono(comb))
         return { view: comb, temp: false };
      var chView = optExtractGrayChannelView(comb, ch, "CS_Cont_" + sepKey + "_" + comb.id);
      if (optSafeView(chView))
         return { view: chView, temp: true };
   }
   if (optSafeView(sep)) {  // separate slot held a colour image
      var chV2 = optExtractGrayChannelView(sep, 0, "CS_Cont_" + sepKey + "_" + sep.id);
      if (optSafeView(chV2))
         return { view: chV2, temp: true };
   }
   return null;
}

// Automatic, hybrid Continuum Subtraction over every loaded narrowband line.
// Detects H/O/S, pairs each with its broadband continuum, derives k from the
// stars, removes stars from both, subtracts on the starless pair, and stores the
// emission map in the matching _CS slot (also shown as a new image). Star-removed
// continuum channels are cached so each broadband channel is only processed once.
// Returns { created:[...], skipped:[...], method }.
function optRunContinuumSubtractionAuto(dlg) {
   if (!OPT_CONTINUUM_SUB_ENABLED)
      throw new Error("[CS] Continuum Subtraction is disabled.");
   var methodIdx = optCsBestStarRemovalMethod();
   if (methodIdx < 0)
      throw new Error("[CS] No star-removal engine is installed (StarXTerminator / StarNet2 / SyQon Starless).");
   var methodName = (methodIdx === 1) ? "StarNet2" : (methodIdx === 2 ? "SyQon Starless" : "StarXTerminator");
   console.writeln("=> Continuum Subtraction (auto, hybrid): star removal via " + methodName + ".");

   var lines = [
      { tag: "H", slot: "H", out: "H_CS", name: "Ha" },
      { tag: "O", slot: "O", out: "O_CS", name: "OIII" },
      { tag: "S", slot: "S", out: "S_CS", name: "SII" }
   ];
   var created = [], skipped = [], compactLines = [];   // líneas restadas CON estrellas (halos esperados)
   var contCache = {};   // channelKey ("R"/"G") -> { starless, temp, source }

   try {
      for (var i = 0; i < lines.length; ++i) {
         var ln = lines[i];
         var nb = dlg.store.record(ln.slot).view;
         if (!optSafeView(nb)) { skipped.push(ln.name + ": no line image loaded"); continue; }
         if (!optViewIsMono(nb)) { skipped.push(ln.name + ": line image is not single-channel"); continue; }

         var contInfo = optCsResolveAutoContinuum(dlg, ln.tag);
         if (!contInfo) { skipped.push(ln.name + ": no broadband continuum found (load RGB or R/G/B)"); continue; }

         var channelKey = (ln.tag === "O") ? "G" : "R";
         var nbStarless = null, resultView = null;
         try {
            // k (unified: star photometry -> high-pass structural fallback -> default).
            var est = optEstimateContinuumK(nb, contInfo.view, "");

            // GALAXY/COMPACT GUARD: a compact narrowband object (e.g. a galaxy's HII knots) gets
            // EATEN by star removal, so for compact targets we subtract WITH stars to preserve the
            // structure (accepts star halos; the user handles stars separately). Detected by the
            // CabraMagic concentration index. Extended nebulae take the hybrid (starless) path.
            var anNB = null; try { anNB = optCabraAnalyze(nb); } catch (eAn) {}
            var compact = anNB && isFinite(anNB.concentrationIndex) && anNB.concentrationIndex >= 3.0;

            if (compact) {
               console.writeln("=> Continuum Subtraction: " + ln.name + " is compact (C=" +
                  anNB.concentrationIndex.toFixed(1) + ") -> subtracting WITH stars to protect structure (no star removal).");
               compactLines.push(ln.name);   // aviso UI: se restó con estrellas -> halos esperados
               resultView = optRunContinuumSubtraction(nb, contInfo.view, { k: est.k, line: "", baseId: ln.out });
            } else {
               // hybrid: derive k with stars (above), subtract on STARLESS to avoid star residuals.
               // Cache the star-removed continuum channel (R is shared by Ha and SII).
               if (!contCache[channelKey]) {
                  var cs = optCsStarlessOf(dlg, contInfo.view, "CS_cont_" + channelKey, methodIdx);
                  contCache[channelKey] = { starless: cs };
               }
               var contStarless = contCache[channelKey].starless;
               nbStarless = optCsStarlessOf(dlg, nb, "CS_line_" + ln.tag, methodIdx);
               resultView = optRunContinuumSubtraction(nbStarless, contStarless, { k: est.k, line: "", baseId: ln.out });
            }
            if (!optSafeView(resultView))
               throw new Error("subtraction produced no result");

            dlg.store.setView(ln.out, resultView, true, OPT_TAB_PRE);
            dlg.store.setAvailable(ln.out, OPT_TAB_PRE, true);
            dlg.store.markStage(ln.out, "Continuum Subtraction");
            try { resultView.window.show(); resultView.window.zoomToFit(); } catch (eShow) {}
            var mode = compact ? "with-stars" : "starless";
            created.push(ln.name + " -> " + ln.out + " (k=" + est.k.toFixed(3) + ", " + est.method + ", " + mode + ")");
            console.writeln("=> Continuum Subtraction: " + ln.name + " emission map ready in slot " + ln.out +
               " (k=" + est.k.toFixed(4) + ", " + est.method + ", " + est.n + " refs, " + mode + ").");
         } catch (eLine) {
            skipped.push(ln.name + ": " + eLine.message);
         } finally {
            if (nbStarless) try { optCloseView(nbStarless); } catch (eN) {}
            if (contInfo.temp) try { optCloseView(contInfo.view); } catch (eC) {}
         }
      }
   } finally {
      for (var key in contCache)
         if (optHasOwn(contCache, key) && contCache[key] && optSafeView(contCache[key].starless))
            try { optCloseView(contCache[key].starless); } catch (eK) {}
      try { dlg.refreshWorkflowButtons(); } catch (eR) {}
   }
   return { created: created, skipped: skipped, method: methodName, compact: compactLines };
}
// CONTINUUM-SUB-ENGINE-END
