// DISPATCH-BY-ID (Pre Deconvolution): single source of truth for the algorithm
// ORDER (canonical indices). Parallax is conditionally present per
// OPT_PRE_PARALLAX_ENABLED, which shifts item indices — exactly why the engine
// dispatch keys on the stable `id`, not on the display label or index. Consumed by
// both the combo builder (optApplyProcessAvailabilityToUI) and the resolver below.
function optPreDeconCanonicalEntries() {
   var e = [{ id: "bxt", label: "BlurXTerminator" }];
   if (typeof OPT_PRE_PARALLAX_ENABLED !== "undefined" && OPT_PRE_PARALLAX_ENABLED)
      e.push({ id: "parallax", label: "Parallax (SyQon)" });
   e.push({ id: "cc", label: "Cosmic Clarity (SetiAstro)" });
   return e;
}
function optPreDeconIdForCanonical(idx) {
   var e = optPreDeconCanonicalEntries();
   return (idx >= 0 && idx < e.length) ? e[idx].id : "bxt";
}

function optBuildPreCandidateConfig(dialog, actionKey) {
   var cfg = { actionKey: actionKey || "" };
   if (cfg.actionKey === "gradient") {
      var hasComboGradient = dialog && optHasOwn(dialog, "comboPreGradient") && dialog.comboPreGradient;
      cfg.gradient = {
         algorithmIndex: hasComboGradient ? optComboCanonicalItem(dialog.comboPreGradient) : 0,
         label: hasComboGradient ? optComboText(dialog.comboPreGradient, "Gradient Correction") : "Gradient Correction"
      };
   } else if (cfg.actionKey === "decon") {
      var hasComboDecon = dialog && optHasOwn(dialog, "comboPreDecon") && dialog.comboPreDecon;
      cfg.decon = {
         algorithmIndex: hasComboDecon ? dialog.comboPreDecon.currentItem : 0,
         id: hasComboDecon ? optPreDeconIdForCanonical(optComboCanonicalItem(dialog.comboPreDecon)) : "bxt",
         label: hasComboDecon ? optComboText(dialog.comboPreDecon, "BlurXTerminator") : "BlurXTerminator",
         blurX: optBuildPreBlurXConfigFromControls(dialog),
         cosmicClarity: optBuildPreCosmicClarityConfig(dialog),
         // PARALLAX-INTEGRATION-BEGIN (config)
         parallax: optBuildPreParallaxConfigFromControls(dialog)
         // PARALLAX-INTEGRATION-END (config)
      };
   }
   return cfg;
}

// BATCH-APPLY-BEGIN ----------------------------------------------------------
// "Apply all" (Pre-processing): apply the current Gradient Correction /
// Deconvolution settings to every loaded Pre slot in one click, and propagate
// the active image's astrometric solution to the other (registered) slots in
// Plate Solving. Rollback: set OPT_BATCH_APPLY_ENABLED = false to hide the
// three "Apply all" buttons, or delete the BATCH-APPLY blocks in both files.
var OPT_BATCH_APPLY_ENABLED = true;

// Pre slots that can receive a batch apply: available in the Pre tab with a
// valid view, excluding `excludeKey` (the active image, handled by the pane).
function optPreBatchTargetKeys(dialog, excludeKey) {
   var out = [];
   if (!dialog || !dialog.store)
      return out;
   var keys = optAllWorkflowKeys();
   for (var i = 0; i < keys.length; ++i) {
      var key = keys[i];
      if (key === excludeKey)
         continue;
      if (!dialog.store.isAvailable(key, OPT_TAB_PRE))
         continue;
      var rec = dialog.store.record(key);
      if (!optSafeView(rec.view))
         continue;
      out.push(key);
   }
   return out;
}

// Base Stretching slots that can be star-split (valid view, available in the
// Stretching tab, excluding the _Starless/_Stars derivatives that would be
// created). Used by the Star Split "Apply all" button.
function optStarSplitBatchTargetKeys(dialog) {
   var out = [];
   if (!dialog || !dialog.store)
      return out;
   var keys = optAllWorkflowKeys();
   for (var i = 0; i < keys.length; ++i) {
      var key = keys[i];
      if (key.indexOf("_Starless") > 0 || key.indexOf("_Stars") > 0)
         continue;
      if (!dialog.store.isAvailable(key, OPT_TAB_STRETCH))
         continue;
      var rec = dialog.store.record(key);
      if (!optSafeView(rec.view))
         continue;
      out.push(key);
   }
   return out;
}

// Core batch loop: for each target slot, clone its view, run the SAME process
// the panel is configured for (optApplyPreCandidate), commit the result to the
// store and mark the stage. Per-slot try/catch: one failure does not stop the
// batch. Returns { applied: [keys], failed: [{key, message}] }.
function optApplyPreBatchToSlots(dialog, actionKey, stageName, excludeKey, progressFn) {
   var result = { applied: [], failed: [] };
   var keys = optPreBatchTargetKeys(dialog, excludeKey);
   for (var i = 0; i < keys.length; ++i) {
      var key = keys[i];
      if (typeof progressFn === "function") {
         // CANCEL: progressFn may return false to abort the batch (the caller polls
         // the preview's ✕ after yielding). Any other return keeps the old behaviour.
         var _cont;
         try { _cont = progressFn(key, i, keys.length); } catch (eP) { _cont = undefined; }
         if (_cont === false) { result.cancelled = true; break; }
      }
      var clone = null;
      try {
         var rec = dialog.store.record(key);
         clone = optCloneView(rec.view, "Opt_Batch_" + key + "_" + (actionKey || "stage"), false);
         if (!optSafeView(clone))
            throw new Error("Could not clone the view of " + optLabelForKey(key) + ".");
         var resultView = clone;
         var r = optApplyPreCandidate(clone, actionKey, dialog);
         if (r && typeof r === "object" && !optSafeView(r)) {
            if (optSafeView(r.view))
               resultView = r.view;
            else if (optSafeView(r.continueView))
               resultView = r.continueView;
            // Batch slots have no per-slot gradient preview; release any
            // gradient/background model view the engine produced.
            var gv = null;
            if (optSafeView(r.gradientView))
               gv = r.gradientView;
            else if (r.bkgView !== undefined && optSafeView(r.bkgView))
               gv = r.bkgView;
            if (gv && (!optSafeView(resultView) || gv.id !== resultView.id)) {
               try { optCloseView(gv); } catch (eG) {}
            }
         } else if (optSafeView(r) && r.id !== clone.id) {
            resultView = r;
         }
         if (!optSafeView(resultView))
            throw new Error("The process returned no usable view for " + optLabelForKey(key) + ".");
         if (resultView.id !== clone.id) {
            try { optCloseView(clone); } catch (eC0) {}
         }
         clone = null; // ownership transfers to the store below
         dialog.store.setView(key, resultView, true, OPT_TAB_PRE);
         if (stageName)
            dialog.store.markStage(key, stageName);
         result.applied.push(key);
         console.writeln("=> Apply all: " + stageName + " applied to " + optLabelForKey(key) + ".");
      } catch (e) {
         if (clone) {
            try { optCloseView(clone); } catch (eC1) {}
         }
         result.failed.push({ key: key, message: e.message });
         console.warningln("=> Apply all: " + optLabelForKey(key) + " failed: " + e.message);
      }
   }
   return result;
}

// Plate Solving "Apply all": the channels of one session are registered, so
// the active image's astrometric solution is valid for all of them. Copy the
// solution (no re-solve) to every other Pre slot with IDENTICAL dimensions —
// same guard as optCopyMetadata, which prevents both wrong WCS on unregistered
// images and the AstrometricMetadata::Write incompatible-dimensions warning.
// Returns { applied: [keys], skipped: [{key, message}], failed: [{key, message}] }.
function optPropagateAstrometricSolution(dialog, sourceView, excludeKey) {
   var result = { applied: [], skipped: [], failed: [] };
   if (!optSafeView(sourceView))
      throw new Error("No valid source view for astrometric propagation.");
   if (!optHasAstrometricSolution(sourceView))
      throw new Error("The active image has no astrometric solution. Solve it first.");
   var srcSynthetic = false;
   try {
      srcSynthetic = (sourceView.id && OPT_SYNTHETIC_WCS_IDS[sourceView.id] === true);
   } catch (eS) {}
   var keys = optPreBatchTargetKeys(dialog, excludeKey);
   for (var i = 0; i < keys.length; ++i) {
      var key = keys[i];
      var rec = dialog.store.record(key);
      var v = rec.view;
      try {
         if (optHasAstrometricSolution(v)) {
            result.skipped.push({ key: key, message: "already solved" });
            continue;
         }
         if (v.image.width !== sourceView.image.width ||
             v.image.height !== sourceView.image.height) {
            result.skipped.push({ key: key, message: "different dimensions (not registered with the active image)" });
            console.warningln("=> Apply all: skipping " + optLabelForKey(key) +
               " — dimensions differ from the active image; the solution would be invalid.");
            continue;
         }
         if (srcSynthetic) {
            optMarkSyntheticSolved(v.window);
         } else {
            v.window.copyAstrometricSolution(sourceView.window);
         }
         if (!optHasAstrometricSolution(v))
            throw new Error("solution copy did not take effect");
         dialog.store.markStage(key, "Plate Solving");
         result.applied.push(key);
         console.writeln("=> Apply all: astrometric solution propagated to " + optLabelForKey(key) + ".");
      } catch (e) {
         result.failed.push({ key: key, message: e.message });
         console.warningln("=> Apply all: WCS propagation to " + optLabelForKey(key) + " failed: " + e.message);
      }
   }
   return result;
}
// BATCH-APPLY-END ------------------------------------------------------------

// ----------------------------------------------------------------------------
// Optimal Transport (Wasserstein 1D) exact histogram matching algorithm
// ----------------------------------------------------------------------------
function optCalculateOptimalTransport1D(targetPixels, refPixels, bins) {
   var nT = targetPixels.length;
   var nR = refPixels.length;
   
   var minT = 1e9, maxT = -1e9;
   for (var i = 0; i < nT; i++) {
      var v = targetPixels[i];
      if (v < minT) minT = v;
      if (v > maxT) maxT = v;
   }
   var minR = 1e9, maxR = -1e9;
   for (var i = 0; i < nR; i++) {
      var v = refPixels[i];
      if (v < minR) minR = v;
      if (v > maxR) maxR = v;
   }
   
   var minVal = Math.min(minT, minR);
   var maxVal = Math.max(maxT, maxR);
   
   if (maxVal === minVal) return targetPixels;
   
   var range = maxVal - minVal;
   minVal -= range * 1e-5;
   maxVal += range * 1e-5;
   var scale = (bins - 1) / (maxVal - minVal);
   
   var histT = new Uint32Array(bins);
   var histR = new Uint32Array(bins);
   
   for (var i = 0; i < nT; i++) {
      var idx = (targetPixels[i] - minVal) * scale;
      histT[idx | 0]++;
   }
   for (var i = 0; i < nR; i++) {
      var idx = (refPixels[i] - minVal) * scale;
      histR[idx | 0]++;
   }
   
   var cdfT = new Uint32Array(bins);
   var cdfR = new Uint32Array(bins);
   var sumT = 0, sumR = 0;
   for (var i = 0; i < bins; i++) {
      sumT += histT[i];
      cdfT[i] = sumT;
      sumR += histR[i];
      cdfR[i] = sumR;
   }
   
   var mapping = new Uint32Array(bins);
   var j = 0;
   for (var i = 0; i < bins; i++) {
      var reqR = (cdfT[i] / nT) * nR;
      while (j < bins - 1 && cdfR[j] < reqR) {
         j++;
      }
      mapping[i] = j;
   }
   
   var invScale = (maxVal - minVal) / (bins - 1);
   for (var i = 0; i < nT; i++) {
      var idx = (targetPixels[i] - minVal) * scale;
      var m = mapping[idx | 0];
      targetPixels[i] = minVal + m * invScale;
   }
   
   return targetPixels;
}

function optRunOptimalTransportMatch(targetView, dialog) {
   if (!optSafeView(targetView))
      throw new Error("[OT] No valid target view.");
      
   // AUTO MODE ONLY: 
   // We align the RGB channels of the target image against its own best channel (like Auto Linear Fit)
   console.writeln("=> Optimal Transport (Auto RGB Channel Match)");
   if (targetView.image.numberOfChannels < 3)
       throw new Error("[OT/CHANNELS] Auto mode requires an RGB image with at least 3 channels.");
       
   var P = new ChannelExtraction();
   P.colorSpace = ChannelExtraction.prototype.RGB;
   P.channels = [[true, targetView.id + "_OT_R"], [true, targetView.id + "_OT_G"], [true, targetView.id + "_OT_B"]];
   P.sampleFormat = ChannelExtraction.prototype.SameAsSource;
   P.executeOn(targetView);
   
   var viewR = View.viewById(targetView.id + "_OT_R");
   var viewG = View.viewById(targetView.id + "_OT_G");
   var viewB = View.viewById(targetView.id + "_OT_B");
   
   try {
       var medR = viewR.image.median();
       var medG = viewG.image.median();
       var medB = viewB.image.median();
       
       var bestRefView = viewR;
       var refName = "R";
       var minMed = medR;
       if (medG < minMed) { bestRefView = viewG; refName = "G"; minMed = medG; }
       if (medB < minMed) { bestRefView = viewB; refName = "B"; minMed = medB; }
       
       console.writeln("   Auto-selected reference channel: " + refName + " (median: " + minMed.toFixed(5) + ")");
       
       var bins = 1048576;
       var rect = bestRefView.image.bounds;
       var refPixels = new Float32Array(rect.area);
       bestRefView.image.getSamples(refPixels, rect, 0);
       
       var chs = [ {name:"R", v:viewR}, {name:"G", v:viewG}, {name:"B", v:viewB} ];
       for (var i = 0; i < 3; i++) {
           if (chs[i].name !== refName) {
               console.writeln("   Matching channel " + chs[i].name + " to " + refName + "...");
               var tPixels = new Float32Array(rect.area);
               chs[i].v.image.getSamples(tPixels, rect, 0);
               optCalculateOptimalTransport1D(tPixels, refPixels, bins);
               chs[i].v.beginProcess(UndoFlag_NoSwapFile);
               chs[i].v.image.setSamples(tPixels, rect, 0);
               chs[i].v.endProcess();
           }
       }
       
       var CC = new ChannelCombination();
       CC.colorSpace = ChannelCombination.prototype.RGB;
       CC.channels = [[true, viewR.id], [true, viewG.id], [true, viewB.id]];
       CC.executeOn(targetView);
       
   } finally {
       optCloseView(viewR);
       optCloseView(viewG);
       optCloseView(viewB);
   }
   console.writeln("=> Auto Optimal Transport finished successfully.");
   return true;
}

// CHANNEL-SPLIT-WCS-FIX: ALF / Background Neutralization / Optimal Transport
// split the image into RGB channels (ChannelExtraction) and recombine them
// (ChannelCombination). If the view's WINDOW carries an astrometric solution
// whose dimensions no longer match the image (e.g. a crop/downsample that did
// not update the in-window AstrometricMetadata — the solution is not in the
// FITS keywords nor in view properties, so it cannot be deleted), PixInsight
// emits "AstrometricMetadata::Write(): Incompatible image dimensions" while
// propagating it. These algorithms do not use astrometry, so run them on a
// FRESH metadata-free window (image.assign copies pixels only, no solution) and
// copy the processed pixels back. The original view and its metadata are left
// untouched. Returns the original view.
function optRunChannelAlgoWithoutAstrometry(view, op) {
   if (!optSafeView(view))
      throw new Error("No valid candidate view.");
   var img = view.image;
   var nch = img.numberOfChannels;
   var bits = 32, isFloat = true;
   try { bits = view.window.bitsPerSample; } catch (eB) {}
   try { isFloat = view.window.isFloatSample; } catch (eF) {}
   var w = new ImageWindow(img.width, img.height, nch, bits, isFloat, nch >= 3, optUniqueId("PIW_NoWCS"));
   try {
      w.mainView.beginProcess(UndoFlag_NoSwapFile);
      w.mainView.image.assign(img);
      w.mainView.endProcess();
      op(w.mainView);
      view.beginProcess(UndoFlag_NoSwapFile);
      view.image.assign(w.mainView.image);
      view.endProcess();
   } finally {
      try { w.forceClose(); } catch (eC) {}
   }
   return view;
}

function optApplyPreCandidate(view, actionKey, dialog) {
   if (!optSafeView(view))
      throw new Error("No valid candidate view.");
   var cfg = (actionKey && typeof actionKey === "object") ? actionKey : optBuildPreCandidateConfig(dialog, actionKey);
   actionKey = cfg.actionKey || "";
   if (actionKey === "gradient") {
      console.writeln("=> Gradient Correction: Executing " + cfg.gradient.label + " based gradient modeling and subtraction.");
      return optExecuteGradientCorrectionForView(view, dialog);
   }
   if (actionKey === "decon") {
      console.writeln("=> Deconvolution: Executing " + cfg.decon.label + " point spread function restoration.");
      // Dispatch by the stable algorithm id (see optPreDeconCanonicalEntries):
      // robust to combo ordering, to the OPT_PRE_PARALLAX_ENABLED revert flag AND to
      // any future rename/translation of the display label.
      var deconId = cfg.decon.id || "bxt";
      if (deconId === "cc") {
         if (!optIsCosmicClarityAvailable())
            throw new Error("Cosmic Clarity: ExternalProcess not available in this PixInsight build.");
         return optRunCosmicClarityOnView(view, cfg.decon.cosmicClarity);
      }
      // PARALLAX-INTEGRATION-BEGIN (dispatch)
      if (deconId === "parallax") {
         if (typeof optIsParallaxAvailable !== "function" || !optIsParallaxAvailable())
            throw new Error("Parallax (SyQon): the SyQon Parallax script/executable is not installed or configured. Open and configure the SyQon Parallax standalone script first.");
         return optRunSyQonParallaxOnView(view, cfg.decon.parallax, dialog);
      }
      // PARALLAX-INTEGRATION-END (dispatch)
      return optExecuteBlurXConfiguredOnView(view, cfg.decon.blurX);
   }
   if (actionKey === "spcc") {
      console.writeln("=> SPCC: Executing Spectrophotometric Color Calibration to match WCS-resolved stars with Gaia DR3/SP profiles.");
      return optRunSPCCCompatibleWorkflow(view, dialog);
   }
   // SSSC-INTEGRATION-BEGIN (dispatch)
   if (actionKey === "sssc") {
      console.writeln("=> SSSC: Empirical star-spectrum colour calibration from Gaia DR3 spectra (no sensor/filter curves required).");
      if (OPT_TEST_MODE)
         return optRunTestModePreviewTransform(view, "contrast", 0.18);
      optRunSSSC(view.window, dialog, {});
      return view;
   }
   // SSSC-INTEGRATION-END (dispatch)
   if (actionKey === "alf") {
      console.writeln("=> Auto Linear Fit: Equilibrating RGB channels dynamically based on minimal median variance reference.");
      return optRunChannelAlgoWithoutAstrometry(view, function(v) { return optRunAutoLinearFitWorkflow(v); });
   }
   if (actionKey === "bn") {
      console.writeln("=> Background Neutralization: Aligning lower RGB boundaries utilizing minimal-variance 50x50px patches.");
      return optRunChannelAlgoWithoutAstrometry(view, function(v) { return optRunBackgroundNeutralization(v); });
   }
   if (actionKey === "ot_match") {
      console.writeln("=> Optimal Transport: Equalizing 1D Wasserstein CDF mappings across RGB histograms.");
      return optRunChannelAlgoWithoutAstrometry(view, function(v) { return optRunOptimalTransportMatch(v, dialog); });
   }
   return optApplyFallbackTransform(view, "lift", 0.05);
}

function optHasAstrometricSolution(view) {
   if (!optSafeView(view))
      return false;
   try {
      if (view.id && optHasOwn(OPT_SYNTHETIC_WCS_IDS, view.id) && OPT_SYNTHETIC_WCS_IDS[view.id] === true)
         return true;
   } catch (eSynthetic0) {}
   // CROP-WCS-SHIFT-FIX: the core's hasAstrometricSolution is the authoritative
   // indicator (true even when the solution lives only in PCL properties with no
   // FITS WCS keywords, as WBPP masters often do). Trust it first.
   try {
      if (view.window && view.window.hasAstrometricSolution)
         return true;
   } catch (eAuth) {}
   try {
      var projection = optSafeViewProperty(view, "PCL:AstrometricSolution:ProjectionSystem");
      if (projection != null && projection !== undefined) {
         var projectionText = "";
         try { projectionText = projection.toString(); } catch (e0) { projectionText = "" + projection; }
         if (projectionText != null && projectionText.length > 0)
            return true;
      }
   } catch (e0) {}
   try {
      var kw = view.window.keywords;
      for (var i = 0; i < kw.length; ++i) {
         var name = (kw[i].name || "").toUpperCase();
         if (name === "CTYPE1" || name === "CRVAL1" || name === "CD1_1" || name === "PC1_1")
            return true;
      }
   } catch (e1) {}
   return false;
}

function optSafeViewProperty(view, propertyId) {
   if (!optSafeView(view))
      return null;
   try {
      return view.propertyValue(propertyId);
   } catch (e0) {}
   try {
      return view.window.mainView.propertyValue(propertyId);
   } catch (e1) {}
   return null;
}

// Copy a source window's FITS keywords onto a target window, EXCLUDING the
// WCS-related ones (CRPIX1/2, CRVAL, CD/PC matrix, CTYPE, PV, CDELT, CROTA,
// LONPOLE, LATPOLE, RADESYS, EQUINOX, EPOCH). The exclusion exists so PI
// doesn't auto-build an AstrometricMetadata on the target from a partial
// keyword set — that build path triggers
// "AstrometricMetadata::Write(): Incompatible image dimensions" whenever
// the source view has been cropped (CRPIX shifted but the cached
// AstrometricSolution::Information blob no longer matches dims). The
// caller decides whether to also copy the astrometric solution via
// optCopyAstrometricSolution; if so, that function carries the WCS over
// in a dimension-safe way (and skips if the source has no Information).
// Use this helper everywhere we'd otherwise assign sourceWindow.keywords
// blindly across window boundaries.
function optCopyKeywordsExcludingWCS(targetWindow, sourceWindow) {
   try {
      if (!targetWindow || targetWindow.isNull) return false;
      if (!sourceWindow || sourceWindow.isNull) return false;
      var src = sourceWindow.keywords;
      if (!src || !src.length) return false;
      var filtered = [];
      for (var i = 0; i < src.length; ++i) {
         var nm = (src[i].name || "").toUpperCase();
         if (OPT_CROP_WCS_KEYWORDS_PIXELSHIFT[nm]) continue;
         if (OPT_CROP_WCS_KEYWORDS_PRESERVE[nm]) continue;
         filtered.push(src[i]);
      }
      targetWindow.keywords = filtered;
      return true;
   } catch (e) {}
   return false;
}

function optCopyAstrometricSolution(targetWindow, sourceWindow) {
   try {
      if (!targetWindow || targetWindow.isNull) return false;
      if (!sourceWindow || sourceWindow.isNull) return false;
      if (typeof targetWindow.copyAstrometricSolution !== "function") return false;

      // PixInsight's copyAstrometricSolution requires the source view to
      // carry a complete AstrometricMetadata, which is serialized in the
      // PCL:AstrometricSolution:Information property. Without it, the call
      // throws "*** Error: AstrometricMetadata::Write(): Incompatible image
      // dimensions" because PI tries (and fails) to rebuild metadata from
      // the partial PCL properties / FITS keywords and then validate it
      // against the target's dimensions. This is the exact scenario after
      // optCropApplyToView, which deliberately drops Information /
      // SplineWorldTransformation to avoid leaving stale W×H on the view.
      // Skip silently in that case — the caller can plate-solve the
      // target later if astrometry on the new view is required.
      var hasInformation = false;
      try {
         var v = sourceWindow.mainView;
         if (v && !v.isNull) {
            var info = v.propertyValue("PCL:AstrometricSolution:Information");
            hasInformation = (info !== undefined && info !== null);
         }
      } catch (eInfo) {}
      if (!hasInformation) return false;

      return targetWindow.copyAstrometricSolution(sourceWindow);
   } catch (e) {}
   return false;
}

function optExecuteSilently(action) {
   var originalWriteln = console.writeln;
   var originalWrite = console.write;
   var isMuted = false;
   try { console.writeln = function() {}; console.write = function() {}; isMuted = true; } catch (e0) {}
   try { action(); } catch (e1) {
      if (isMuted) {
         console.writeln = originalWriteln;
         console.write = originalWrite;
         isMuted = false;
      }
      throw e1;
   } finally {
      if (isMuted) {
         console.writeln = originalWriteln;
         console.write = originalWrite;
      }
   }
}

function optKillDiagnostics() {
   var trashWindows = ["stars", "matches", "distortion"];
   for (var i = 0; i < trashWindows.length; ++i) {
      var win = ImageWindow.windowById(trashWindows[i]);
      if (win != null && !win.isNull)
         win.forceClose();
   }
}

function optPrepareWindowForInteractiveImageSolver(window, contextLabel) {
   if (!window || window.isNull)
      return false;
   try { window.show(); } catch (e0) {}
   try { window.bringToFront(); } catch (e1) {}
   try { window.zoomToOptimalFit(); } catch (e2) {}
   try { window.currentView = window.mainView; } catch (e3) {}
   if (window.mainView && !window.mainView.isNull)
      console.writeln("=> Preparing ImageSolver on " + contextLabel + " [" + window.mainView.id + "].");
   return true;
}

// V8-ADP-SOLVE-GUARD-BEGIN
// The interactive solve uses divergent APIs: under V8 the new ImageSolver 6.4.1
// (initialize/solveImage/AstrometricMetadata, throw-on-failure); under
// SpiderMonkey the legacy AdP ImageSolver (Init/SolveImage/ImageMetadata,
// boolean return). Each branch is the validated, verbatim implementation for its
// engine; only one is compiled (the preprocessor strips the other).
function optSolveAstrometryOnWindow(window, contextLabel) {
   if (!window || window.isNull)
      return false;

   if (OPT_TEST_MODE) {
      optMarkSyntheticSolved(window);
      console.writeln("=> PI_Workflow_Opt TEST MODE: synthetic astrometric solution granted for " + contextLabel + ".");
      return true;
   }

   optPrepareWindowForInteractiveImageSolver(window, contextLabel);

   if (!optHasAdpSolverRuntime())
      throw new Error("ImageSolver/AdP runtime is not fully available in this PixInsight installation.");

   // Drop dim-dependent astrometric properties that may linger from a
   // previous solve / crop / session. If the view's image dimensions
   // don't match what these blobs encode, ImageSolver's internal
   // AstrometricMetadata::Write fails with "Incompatible image dimensions"
   // before our solve even starts. Letting it rebuild from scratch is the
   // safe path — the FITS keywords (CRPIX / CRVAL / CD / CTYPE / ...)
   // remain untouched and feed ImageSolver's initial estimate.
   try {
      if (window.mainView && !window.mainView.isNull) {
         for (var dSolve = 0; dSolve < OPT_CROP_WCS_PROPERTIES_STALE_AFTER_CROP.length; ++dSolve) {
            try { window.mainView.deleteProperty(OPT_CROP_WCS_PROPERTIES_STALE_AFTER_CROP[dSolve]); }
            catch (eDelSolve) {}
         }
      }
   } catch (eSolvePre) {}

   var solver = new ImageSolver();
   // V8 API: initialize() populates solver.solverCfg and solver.metadata
   // (an AstrometricMetadata) from the window. Replaces the legacy Init() +
   // manual ImageMetadata.ExtractMetadata().
   solver.initialize(window, false);
   try { solver.solverCfg.distortionCorrection = true; } catch (e0) {}
   try { solver.solverCfg.rbfType = RBFType_DDMThinPlateSpline; } catch (e1) {}

   var metadata = null;
   try { metadata = solver.metadata; } catch (e2) {}

   var solved = false;
   try {
      optExecuteSilently(function() { solver.solveImage(window); });
      solved = true;
   } catch (eAuto) {
      console.warningln("=> Automatic ImageSolver attempt failed on " + contextLabel + ": " + eAuto.message);
      solved = false;
   }
   optKillDiagnostics();

   try {
      if (solved && window.mainView && !window.mainView.isNull && optHasAstrometricSolution(window.mainView)) {
         console.writeln("=> ImageSolver automatic solve OK on " + contextLabel + ".");
         return true;
      }
   } catch (eCheck) {}

   console.warningln("=> Automatic astrometric solve did not succeed for " + contextLabel + ". Opening the ImageSolver dialog...");

   // Ensure metadata exists so the dialog can open. solver.metadata is normally
   // populated by initialize(); fall back to a fresh AstrometricMetadata.
   if (metadata == null) {
      try { metadata = solver.metadata; } catch (eMetaRetry) {}
   }
   if (metadata == null) {
      try { metadata = new AstrometricMetadata(); } catch (eMetaEmpty) {}
   }

   var accepted = true;
   var dialogOpened = false;

   if (typeof ImageSolverDialog === "function" && metadata != null) {
      try {
         var dlgSolver = new ImageSolverDialog(solver.solverCfg, metadata, true);
         dialogOpened = true;
         accepted = dlgSolver.execute();

         if (accepted) {
            try {
               solver.solverCfg = dlgSolver.solverCfg;
               try { solver.metadata = dlgSolver.metadata; } catch (eSyncMeta) {}
               console.writeln("=> ImageSolver dialog configuration synced back to solver.");
            } catch (eSyncCfg) {
               console.warningln("=> Could not sync ImageSolver configuration from dialog: " + eSyncCfg.message);
            }
         }
      } catch (eDlg) {
         console.warningln("=> ImageSolver dialog could not be opened: " + eDlg.message);
         dialogOpened = false;
      }
   } else {
      if (typeof ImageSolverDialog !== "function")
         console.warningln("=> ImageSolverDialog is not available in this PixInsight installation.");
      if (metadata == null)
         console.warningln("=> metadata is null — cannot open ImageSolverDialog.");
   }

   if (dialogOpened && !accepted) {
      console.warningln("=> ImageSolver was cancelled for " + contextLabel + ".");
      return false;
   }

   solved = false;
   try {
      optExecuteSilently(function() { solver.solveImage(window); });
      solved = true;
   } catch (eSolve) {
      console.warningln("=> ImageSolver threw an error during manual solve on " + contextLabel + ": " + eSolve.message);
      solved = false;
   }
   optKillDiagnostics();

   try {
      if (solved && window.mainView && !window.mainView.isNull && optHasAstrometricSolution(window.mainView)) {
         console.writeln("=> ImageSolver OK on " + contextLabel + ".");
         return true;
      }
   } catch (eCheck2) {}

   console.warningln("=> ImageSolver could not solve " + contextLabel + ".");
   return false;
}
// V8-ADP-SOLVE-GUARD-END

function optWindowArrayContainsView(windows, view) {
   if (!windows || !optSafeView(view))
      return false;
   for (var i = 0; i < windows.length; ++i)
      if (windows[i] && !windows[i].isNull && windows[i].mainView && !windows[i].mainView.isNull && windows[i].mainView.id === view.id)
         return true;
   return false;
}

function optIsBackgroundResidualViewId(viewId) {
   var id = "";
   try { id = String(viewId || "").toLowerCase(); } catch (e0) { id = ""; }
   return id.indexOf("background") >= 0 ||
          id.indexOf("bkg") >= 0 ||
          id.indexOf("model") >= 0 ||
          id.indexOf("gradient") >= 0 ||
          id.indexOf("residual") >= 0;
}

function optRunSPFCForMGC(targetView, dlg) {
   if (optHasSPFCScaleFactors(targetView))
      return true;
   if (typeof SpectrophotometricFluxCalibration === "undefined")
      throw new Error("[SPFC/AVAILABILITY] SpectrophotometricFluxCalibration is not available in this PixInsight installation.");
   var profile = optGetNarrowbandProfileForView(targetView, dlg, dlg && dlg.preTab && dlg.preTab.preview ? dlg.preTab.preview.currentKey : "");
   var spfc = optGetSPFCProcessForProfile(profile);
   if (spfc == null) {
      if (profile && profile.isNarrowband)
         throw new Error("[SPFC/PARAMETERS] No suitable SPFC icon was found for " + profile.description + ". Create 'SPFC_NB' for RGB narrowband composites or 'SPFC_H'/'SPFC_O'/'SPFC_S' for mono channels, or configure the generic 'SPFC' icon with matching filters.");
      throw new Error("[SPFC/PARAMETERS] The 'SPFC' icon was not found. Create a real configured 'SPFC' process icon or run SPFC manually before using MGC.");
   }
   optApplyNarrowbandProcessParameters(spfc, profile, "SPFC");
   var ok = false;
   var beforeMap = optCaptureOpenWindowIdMap();
   var protectedIds = {};
   protectedIds[targetView.id] = true;
   optSuppressSPFCAuxiliaryOutputs(spfc);
   try {
      ok = spfc.executeOn(targetView);
   } catch (e0) {
      var msg = e0.message || "";
      var low = msg.toLowerCase();
      if (low.indexOf("parsing csv spectrum parameter") >= 0)
         throw new Error("[SPFC/PARAMETERS] SPFC is not configured correctly. " + msg + "\nCheck the SPFC icon: QE curve and filters. For narrowband data, use SPFC_NB or SPFC_H/SPFC_O/SPFC_S icons with Ha/OIII/SII filters.");
      if (low.indexOf("gaia") >= 0 || low.indexOf("xpsd") >= 0 || low.indexOf("spectrum wavelength table") >= 0)
         throw new Error("[SPFC/GAIA] SPFC could not access the configured Gaia DR3/SP resources. " + msg + "\nCheck the Gaia DR3/SP database path configured in PixInsight and in the selected SPFC icon.");
      throw new Error("[SPFC/EXECUTION] " + msg);
   } finally {
      optCloseAuxiliaryProcessWindows(beforeMap, protectedIds, "SPFC");
   }
   if (!ok)
      throw new Error("[SPFC/EXECUTION] SPFC returned false before completing execution.\nCheck the selected SPFC icon and its external resources: Gaia DR3/SP database path, QE curve, and broadband or narrowband filters.");
   if (!optHasSPFCScaleFactors(targetView))
      throw new Error("[SPFC/METADATA] SPFC finished but did not generate valid PCL:SPFC:ScaleFactors.");
   return true;
}

function optClassifyMGCError(errorMessage) {
   var msg = (errorMessage || "").toLowerCase();
   if (msg.indexOf("pcl:spfc:scalefactors") >= 0 || msg.indexOf("flux calibration") >= 0)
      return "SPFC";
   if (msg.indexOf("astrometric") >= 0 || msg.indexOf("wcs") >= 0)
      return "ASTROMETRY";
   if (msg.indexOf("no reference data") >= 0 || msg.indexOf("0 reference image") >= 0 || msg.indexOf("mars") >= 0 || msg.indexOf("reference image") >= 0)
      return "REFERENCE";
   if ((msg.indexOf("linear") >= 0 && msg.indexOf("non") >= 0) ||
       msg.indexOf("must be linear") >= 0 ||
       msg.indexOf("not linear") >= 0 ||
       msg.indexOf("nonlinear") >= 0 ||
       msg.indexOf("non-linear") >= 0)
      return "LINEARITY";
   return "OTHER";
}

function optApplyMGCParameters(mgc, dlg) {
   try { mgc.gradientScale = parseInt(dlg.comboMgcScale.combo.itemText(dlg.comboMgcScale.combo.currentItem), 10); } catch (e0) {}
   try { mgc.structureSeparation = parseInt(dlg.comboMgcSep.combo.itemText(dlg.comboMgcSep.combo.currentItem), 10); } catch (e1) {}
   try { mgc.modelSmoothness = dlg.ncMgcSmoothness.value; } catch (e2) {}
   try { mgc.showGradientModel = true; } catch (e3) {}
   try { mgc.scaleFactorRK = dlg.ncMgcScaleR.value; } catch (e4) {}   // real property is scaleFactorRK (was scaleFactorR, a no-op)
   try { mgc.scaleFactorG = dlg.ncMgcScaleG.value; } catch (e5) {}
   try { mgc.scaleFactorB = dlg.ncMgcScaleB.value; } catch (e6) {}
}

function optRunMGCCompatibleWorkflow(targetView, dlg) {
   if (!optSafeView(targetView))
      throw new Error("[MGC/TARGET] There is no valid target view to execute MGC.");
   optRequireLinearImage(targetView, "MGC");
   if (OPT_TEST_MODE)
      return { mode: "MGC", continueView: optRunTestModePreviewTransform(targetView, "contrast", 0.16), bkgView: null };
   if (typeof MultiscaleGradientCorrection === "undefined")
      throw new Error("[MGC/AVAILABILITY] MultiscaleGradientCorrection is not available. PixInsight 1.9.0+ is required.");
   var mgcInfo = optGetMGCProcessForProfile(optGetNarrowbandProfileForView(targetView, dlg, dlg && dlg.preTab && dlg.preTab.preview ? dlg.preTab.preview.currentKey : ""));
   var mgc = mgcInfo ? mgcInfo.process : null;
   if (mgc == null)
      throw new Error("[MGC/REFERENCE] A valid MGC process icon was not found in the workspace. Configure 'MGC_NB' for narrowband composites or 'MGC' for the generic path.");
   if (!optHasAstrometricSolution(targetView))
      optSolveAstrometryOnWindow(targetView.window, "the MGC target view");
   if (!optHasAstrometricSolution(targetView))
      throw new Error("[MGC/WCS] ImageSolver could not generate a valid astrometric solution. MGC requires a real WCS solution on the target image.");
   var mgcNbProfile = optGetNarrowbandProfileForView(targetView, dlg, dlg && dlg.preTab && dlg.preTab.preview ? dlg.preTab.preview.currentKey : "");
   if (mgcNbProfile)
      console.writeln("=> MGC/MARS: narrowband-aware calibration path selected for " + mgcNbProfile.description + ".");
   optRunSPFCForMGC(targetView, dlg);
   // MGC-MARS-FILTERS: tell MGC which MARS broadband reference matches the image type, using
   // the REAL grayMARSFilter/red/green/blueMARSFilter properties (the generic guessed-name path
   // was a no-op for MGC — see optApplyMGCMarsFilters). Broadband -> defaults L/R/G/B untouched.
   optApplyMGCMarsFilters(mgc, mgcNbProfile, mgcInfo && mgcInfo.guiConfiguredIcon === true);
   optApplyMGCParameters(mgc, dlg);

   var beforeMap = optCaptureOpenWindowIdMap();
   beforeMap[targetView.id] = true;
   var ok = false;
   try {
      ok = mgc.executeOn(targetView);
   } catch (e0) {
      var msg = e0.message || "";
      var kind = optClassifyMGCError(msg);
      if (kind === "REFERENCE")
         throw new Error("[MGC/REFERENCE] " + msg + "\nCheck the 'MGC' icon: MARS/reference image and filter configuration.");
      if (kind === "SPFC")
         throw new Error("[MGC/SPFC] " + msg + "\nThe image does not have valid SPFC metadata.");
      if (kind === "ASTROMETRY")
         throw new Error("[MGC/WCS] " + msg);
      if (kind === "LINEARITY")
         throw new Error("[MGC/LINEARITY] " + msg + "\nThis message comes from the real MGC process.");
      throw new Error("[MGC/EXECUTION] " + msg);
   }
   if (!ok)
      throw new Error("[MGC/EXECUTION] MGC returned false before completing execution.\nThe SPFC stage did complete correctly; the problem is now in the MGC configuration/execution stage.\nCheck the 'MGC' icon: MARS/reference image, .xmars databases and filters.");

   var afterWindows = ImageWindow.windows;
   var correctedWin = null;
   var bkgWin = null;
   for (var i = 0; i < afterWindows.length; ++i) {
      var win = afterWindows[i];
      if (!win || win.isNull || !win.mainView || win.mainView.isNull)
         continue;
      var winId = win.mainView.id;
      if (optHasOwn(beforeMap, winId))
         continue;
      if (optIsBackgroundResidualViewId(winId)) {
         bkgWin = win;
         continue;
      }
      correctedWin = win;
   }
   try {
      if (correctedWin && correctedWin.mainView && !correctedWin.mainView.isNull && correctedWin.mainView.id !== targetView.id)
         correctedWin.hide();
   } catch (e1) {}
   try {
      if (bkgWin && bkgWin.mainView && !bkgWin.mainView.isNull)
         bkgWin.hide();
   } catch (e2) {}
   return {
      mode: "MGC",
      continueView: correctedWin && correctedWin.mainView && !correctedWin.mainView.isNull ? correctedWin.mainView : targetView,
      bkgView: bkgWin && bkgWin.mainView && !bkgWin.mainView.isNull ? bkgWin.mainView : null
   };
}

function optConfigureABEInstance(abe, dlg, forceModelOutput, forceReplaceTarget) {
   var correctionIndex = 0;
   if (dlg && dlg.comboAbeCorrection)
      correctionIndex = dlg.comboAbeCorrection.combo.currentItem;
   // AutomaticBackgroundExtractor target-correction enum: None=0, Subtract=1, Divide=2.
   // Default to the CORRECT enum values so the correction is actually applied. Under
   // V8 (macOS/1.9.4) these constants are NOT exposed on .prototype the way they are
   // on SpiderMonkey, so the lookup below returns undefined there; the previous
   // defaults (0/1 = None/Subtract) left targetCorrection = None on V8, so ABE built
   // the background model but subtracted nothing — the image never changed. We now
   // try the static class first, then .prototype, and fall back to the standard enum.
   var subtractValue = 1;
   var divideValue = 2;
   try {
      var ABEclass = AutomaticBackgroundExtractor;
      if (typeof ABEclass !== "undefined" && ABEclass) {
         if (typeof ABEclass.Subtract !== "undefined")
            subtractValue = ABEclass.Subtract;
         else if (ABEclass.prototype && typeof ABEclass.prototype.Subtract !== "undefined")
            subtractValue = ABEclass.prototype.Subtract;
         if (typeof ABEclass.Divide !== "undefined")
            divideValue = ABEclass.Divide;
         else if (ABEclass.prototype && typeof ABEclass.prototype.Divide !== "undefined")
            divideValue = ABEclass.prototype.Divide;
      }
   } catch (e0) {}
   var targetCorrectionValue = (correctionIndex === 1) ? divideValue : subtractValue;
   var functionDegree = 1;
   if (dlg && dlg.ncAbeFunctionDegree)
      functionDegree = Math.max(0, Math.min(8, Math.round(dlg.ncAbeFunctionDegree.value)));
   var normalize = false;
   if (dlg && dlg.chkAbeNormalize)
      normalize = dlg.chkAbeNormalize.checked === true;
   var discardModel = (forceModelOutput === true) ? false : true;
   var replaceTarget = (forceReplaceTarget === true);
   try { abe.targetCorrection = targetCorrectionValue; } catch (e0) {}
   try { abe.functionDegree = functionDegree; } catch (e1) {}
   try { abe.normalize = normalize; } catch (e2) {}
   try { abe.discardModel = discardModel; } catch (e3) {}
   try { abe.replaceTarget = replaceTarget; } catch (e4) {}
   optSetRequiredProcessProperty(abe, ["targetCorrection", "correction", "target_correction", "Correction"], targetCorrectionValue, "ABE Target Correction");
   optSetRequiredProcessProperty(abe, ["polyDegree", "functionDegree", "function_degree", "degree", "FunctionDegree"], functionDegree, "ABE Function Degree");
   optSetRequiredProcessProperty(abe, ["normalize", "Normalize"], normalize, "ABE Normalize");
   optSetRequiredProcessProperty(abe, ["discardModel", "discard_model"], discardModel, "ABE Discard Model");
   optSetRequiredProcessProperty(abe, ["replaceTarget", "replace_target"], replaceTarget, "ABE Replace Target");
   try {
      if (typeof AutomaticBackgroundExtractor !== "undefined" &&
          AutomaticBackgroundExtractor.prototype &&
          typeof AutomaticBackgroundExtractor.prototype.SameAsTarget !== "undefined")
         abe.correctedImageSampleFormat = AutomaticBackgroundExtractor.prototype.SameAsTarget;
   } catch (e5) {}
   try { abe.correctedImageId = ""; } catch (e6) {}
}

function optExecuteABEWorkflow(targetView, dlg) {
   if (!optSafeView(targetView))
      throw new Error("There is no valid target view for ABE.");
   var windowsBefore = ImageWindow.windows;
   var abe = new AutomaticBackgroundExtractor();
   optConfigureABEInstance(abe, dlg, true, true);
   abe.executeOn(targetView);
   var bkgView = null;
   var windowsAfter = ImageWindow.windows;
   for (var iWin = 0; iWin < windowsAfter.length; ++iWin) {
      var afterWin = windowsAfter[iWin];
      var wasPresent = false;
      for (var jWin = 0; jWin < windowsBefore.length; ++jWin)
         if (afterWin.mainView.id === windowsBefore[jWin].mainView.id) {
            wasPresent = true;
            break;
         }
      if (wasPresent)
         continue;
      var afterId = afterWin.mainView.id.toLowerCase();
      if (optIsBackgroundResidualViewId(afterId)) {
         bkgView = afterWin.mainView;
         try { afterWin.hide(); } catch (e0) {}
      } else {
         try { afterWin.hide(); } catch (e1) {}
      }
   }
   try {
      if (targetView.window && !targetView.window.isNull)
         targetView.window.hide();
   } catch (e2) {}
   return { mode: "ABE", continueView: targetView, bkgView: bkgView };
}

