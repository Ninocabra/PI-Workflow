function OptWorkflowTab(dialog, tabName, title) {
   this.dialog = dialog;
   this.tabName = tabName;
   this.title = title;
   this.sections = [];
   this.page = new Control(dialog);
   this.page.autoFillBackground = true;
   this.page.backgroundColor = OPT_BG;
   this.page.sizer = new HorizontalSizer();
   // Phase 3: outer padding around the two cards (s7 = 26 px) and gap
   // between them (s5 = 18 px), per DESIGN_SPEC §2.4 / §3.
   this.page.sizer.margin = Theme.s7;
   this.page.sizer.spacing = Theme.s5;

   // -------- Phase 3: left card wraps the ScrollBox --------
   // surface bg, hairline border, rXl radius; fixed 300 px wide (was 450).
   this.leftCard = new Control(this.page);
   try {
      this.leftCard.styleSheet =
         "QWidget {" +
         " background-color: " + Theme.surface + ";" +
         " border: 1px solid " + optThemeRgba("border") + ";" +
         " border-radius: " + Theme.rXl + "px;" +
         "}";
   } catch (eLc) {}
   this.leftCard.sizer = new VerticalSizer();
   this.leftCard.sizer.margin = 0;
   this.leftCard.sizer.spacing = 0;
   this.leftCard.setFixedWidth(340);  // Phase 6.5: 300 -> 340 to give labels + sliders more horizontal room across every tab.

   this.left = new ScrollBox(this.leftCard);
   this.left.autoScroll = true;
   this.leftContent = new Control(this.left);
   this.leftContent.sizer = new VerticalSizer();
   this.leftContent.sizer.margin = 6;
   this.leftContent.sizer.spacing = 6;
   this.left.viewport.sizer = new VerticalSizer();
   this.left.viewport.sizer.add(this.leftContent);
   this.leftCard.sizer.add(this.left);

   this.headerLabel = optEngineTitle(this.leftContent, title.toUpperCase() + " ENGINE");
   this.leftContent.sizer.add(this.headerLabel);

   this.selectionSection = optSection(this.leftContent, "Image Selection");
   this.selection = new OptSelectionPanel(dialog, tabName);
   this.selectionSection.body.sizer.add(this.selection.control);
   this.sections.push(this.selectionSection);
   this.leftContent.sizer.add(this.selectionSection.bar);
   this.leftContent.sizer.add(this.selectionSection.body);

   // -------- Phase 3: preview card wraps the preview pane --------
   // Same card styleSheet as the left card.
   this.previewCard = new Control(this.page);
   try {
      this.previewCard.styleSheet =
         "QWidget {" +
         " background-color: " + Theme.surface + ";" +
         " border: 1px solid " + optThemeRgba("border") + ";" +
         " border-radius: " + Theme.rXl + "px;" +
         "}";
   } catch (ePc) {}
   this.previewCard.sizer = new VerticalSizer();
   this.previewCard.sizer.margin = 0;
   this.previewCard.sizer.spacing = 0;

   this.preview = new OptPreviewPane(dialog, tabName, this.previewCard);
   this.previewCard.sizer.add(this.preview.control);

   this.page.sizer.add(this.leftCard);
   this.page.sizer.add(this.previewCard, 100);

   this.wireSelection();
}

OptWorkflowTab.prototype.registerSection = function(section) {
   if (section) {
      var tab = this;
      var origSetExpanded = section.bar.setExpanded;
      section.bar.setExpanded = function(expanded) {
         origSetExpanded(expanded);
         if (expanded) {
            for (var i = 0; i < tab.sections.length; ++i)
               if (tab.sections[i] !== section && tab.sections[i].expanded)
                  tab.sections[i].setExpanded(false);
         }
      };
      this.sections.push(section);
   }
   return section;
};

// Calculates base preview dimensions maintaining exact aspect ratio from the minor axis,
// avoiding distortion from unequal rounding or clipping.
function optCalculateCompareBaseDims(sourceW, sourceH, renderReduction, minLimit) {
   var limit = minLimit || 128;
   var w = Math.round(sourceW / renderReduction);
   var h = Math.round(sourceH / renderReduction);
   if (sourceW <= 0 || sourceH <= 0) {
      return { width: Math.max(1, w), height: Math.max(1, h) };
   }
   if (sourceW < sourceH) {
      // Width is the minor axis
      if (w < limit) {
         w = limit;
         h = Math.round(limit * (sourceH / sourceW));
      }
   } else {
      // Height is the minor axis
      if (h < limit) {
         h = limit;
         w = Math.round(limit * (sourceW / sourceH));
      }
   }
   return { width: Math.max(1, w), height: Math.max(1, h) };
}

// ===== COMPARE-BEGIN — easy-rollback block (v138 Phase 1: GC) =====
// Builds a mosaic Bitmap from tile bitmaps. Each tile is drawn scaled into its cell
// preserving its original aspect ratio, with an amber border and a labelled header strip.
// Missing tiles (algorithm not installed or failed) get a flat dark cell.
// The mosaic is sized to mosaicW x mosaicH so zoom/pan logic works without extra plumbing.
function optBuildCompareMosaicBitmap(tiles, mosaicW, mosaicH, cols) {
   var n = tiles && tiles.length ? tiles.length : 0;
   if (n < 1)
      return null;
   if (cols === undefined || cols === null) {
      // Layout: 1 tile = 1x1, 2 = 2x1, 3 = 3x1 (clean horizontal triplet),
      // 4 = 2x2. The (n <= 3) branch keeps 3-engine comparisons aligned
      // on a single row instead of falling into a 2x2 grid with one
      // empty cell, which read as broken.
      cols = (n <= 3) ? Math.max(1, n) : 2;
   }
   var rows = Math.ceil(n / cols);
   var bmp = new Bitmap(mosaicW, mosaicH);
   bmp.fill(0xFF101012);
   var g = new Graphics(bmp);
   try {
      var cellW = Math.floor(mosaicW / cols);
      var cellH = Math.floor(mosaicH / rows);
      try { g.font = new Font("Segoe UI", 10); } catch (eFont) {}
      for (var i = 0; i < n; ++i) {
         var c = i % cols;
         var r = Math.floor(i / cols);
         var x = c * cellW;
         var y = r * cellH;
         var tile = tiles[i] || {};
         // Clean cell background first
         g.fillRect(new Rect(x, y, x + cellW, y + cellH), new Brush(0xFF1f1f23));
         if (tile.bmp) {
            // Determine dimensions and scale factor to fit maintaining aspect ratio
            var tileW = tile.bmp.width;
            var tileH = tile.bmp.height;
            var scale = Math.min(cellW / Math.max(1, tileW), cellH / Math.max(1, tileH));
            var drawW = Math.round(tileW * scale);
            var drawH = Math.round(tileH * scale);
            // Center the drawn image inside the cell
            var offsetX = Math.round((cellW - drawW) / 2);
            var offsetY = Math.round((cellH - drawH) / 2);
            var targetRect = new Rect(x + offsetX, y + offsetY, x + offsetX + drawW, y + offsetY + drawH);
            try { g.drawScaledBitmap(targetRect, tile.bmp); } catch (eDS) {
               try { g.drawScaledBitmap(targetRect.left, targetRect.top, targetRect.right, targetRect.bottom, tile.bmp); } catch (eDS2) {}
            }
         }
         // Header strip with semi-transparent black band + label text.
         g.fillRect(new Rect(x + 1, y + 1, x + cellW - 1, y + 22), new Brush(0xCC000000));
         g.pen = new Pen(0xFFFFFFFF, 1);
         var labelText = (i + 1) + ". " + (tile.label || "");
         if (tile.error)
            labelText += "  [" + tile.error + "]";
         g.drawTextRect(new Rect(x + 8, y + 3, x + cellW - 8, y + 21), labelText, TextAlign_Left | TextAlign_VertCenter);
         // Cell border in theme amber.
         g.pen = new Pen(0xFFd9a560, 1);
         g.drawRect(new Rect(x, y, x + cellW - 1, y + cellH - 1));
      }
   } finally {
      try { g.end(); } catch (eG) {}
   }
   return bmp;
}

// Runs every Gradient Correction algorithm exposed by the combo against
// a clone of the currently active Pre image, stores each full-resolution
// result in the corresponding memory slot (1..N), and renders a 2x2
// labelled mosaic into the preview so the user can compare them at a
// glance. After Compare the user inspects individual variants by
// right-clicking a memory slot and commits the winner with
// "Use this Image" — the standard memory-recall path commits the
// full-resolution slot view directly without any upgrade step.
function optCompareGradientCorrection(dlg) {
   if (!dlg || !dlg.preTab || !dlg.preTab.preview)
      throw new Error("Pre Processing pane not available.");
   var combo = dlg.comboPreGradient;
   if (!combo)
      throw new Error("Gradient Correction combo not available.");
   // Thin wrapper over the shared optCompareCombo driver (this used to be a
   // ~110-line near-duplicate of it, kept in sync by hand).
   optCompareCombo({
      pane: dlg.preTab.preview,
      combo: combo,
      names: optVisibleComboNames(combo),
      available: optAllTrue(combo.numberOfItems),
      syncFn: function(idx) { try { if (typeof dlg.syncPreGradientPanels === "function") dlg.syncPreGradientPanels(optComboCanonicalItem(combo)); } catch (eSync) {} },
      menuCode: "GC",
      compareKind: "gradient",
      stretchMode: "mad-unlinked",
      busyText: "Compare: running gradient algorithms...",
      runOne: function(sourceView, idx) {
         var candidate = optCloneView(sourceView, "Opt_Compare_GC_" + idx + "_" + sourceView.id, false);
         try {
            var result = optApplyPreCandidate(candidate, "gradient", dlg);
            // Gradient engines (MGC/ABE/AutoDBE/GraXpert) usually return a NEW
            // corrected view plus a background model, leaving the candidate clone
            // orphaned. The driver only frees the returned view(s), so release the
            // candidate here whenever it is not the view being kept.
            var kept = (result && typeof result === "object" && !optSafeView(result))
               ? (result.view || result.continueView) : result;
            if (optSafeView(candidate) && (!optSafeView(kept) || kept.id !== candidate.id))
               try { optCloseView(candidate); } catch (eC0) {}
            return result;
         } catch (eR) {
            try { optCloseView(candidate); } catch (eC) {}
            throw eR;
         }
      }
   });
}

function optCompareColorCalibration(dlg) {
   if (!dlg || !dlg.preTab || !dlg.preTab.preview)
      throw new Error("Pre Processing pane not available.");
   // Color Calibration has no algorithm combo (each method is its own action
   // card), so build the filtered method list here and drive the shared
   // optCompareCombo with combo:null + a per-item dispatch inside runOne.
   // CONFIG-TAB: include only methods visible after Configuration filtering.
   var allNames = ["SPCC", "SSSC", "Auto Linear Fit", "Optimal Transport", "Bkg. Neutralization"];
   var allActionKeys = ["spcc", "sssc", "alf", "ot_match", "bn"];
   var allPrefIds = ["spcc", "sssc", "alf", "ot", "bn"];
   var hasSPCC = optDependencyProcessExists("SpectrophotometricColorCalibration");
   var allInstalled = [hasSPCC, true, true, true, true];
   var names = [], actionKeys = [];
   for (var fi = 0; fi < allActionKeys.length; ++fi) {
      if (allInstalled[fi] && optIsAlgoEnabled("preColor", allPrefIds[fi])) {
         names.push(allNames[fi]);
         actionKeys.push(allActionKeys[fi]);
      }
   }
   optCompareCombo({
      pane: dlg.preTab.preview,
      combo: null,
      names: names,
      available: optAllTrue(names.length),
      menuCode: "CC",
      compareKind: "color_calibration",
      stretchMode: "mad-unlinked",
      busyText: "Compare: running color calibration...",
      runOne: function(sourceView, idx) {
         var candidate = optCloneView(sourceView, "Opt_Compare_CC_" + idx + "_" + sourceView.id, false);
         try {
            // Color-calibration engines (SPCC/ALF/OT/BN) run in place on the
            // candidate; the driver frees it after cloning into the memory slot.
            optApplyPreCandidate(candidate, actionKeys[idx], dlg);
            return candidate;
         } catch (eR) {
            try { optCloseView(candidate); } catch (eC) {}
            throw eR;
         }
      }
   });
}
// ===== COMPARE-END =====

// ===== COMPARE-BEGIN — Phase 2 generic helper + wrappers =====
// Generic Compare driver shared by Decon, Noise Reduction, Stretch zones
// and Star Split. It abstracts the loop over combo items, the per-iter
// engine call (delegated to opts.runOne), the memory slot store with
// compare meta, the per-tile bitmap render and the mosaic composition.
// The existing optCompareGradientCorrection() is left untouched on
// purpose (it already works in production); this driver only services
// the new sections.
//
// opts contract:
//   pane         OptPreviewPane (target tab's preview)
//   combo        ComboBox (algorithm selector)
//   names        [string]  user-facing algorithm names; one per combo item
//   available    [bool]    parallel array; false → tile renders "not installed"
//   syncFn       optional function(idx) — updates UI before engine runs
//   menuCode     short code used in slot meta (e.g. "Dec", "NR", "RGB", "STR", "SS")
//   compareKind  meta tag consumed by setToCurrent (e.g. "decon", "nr", "stretch_rgb",
//                "stretch_stars", "star_split")
//   stretchMode  passed to optRenderPreviewBitmapToSize; "" for post-stretch tabs,
//                "mad-unlinked" for linear tabs
//   skipIndices  optional [int]  combo positions that have no comparable
//                output (e.g. interactive Curves item in Stretch zones)
//   busyText     string shown in the preview busy overlay
//   runOne       function(sourceView, idx) → view | { view, gradientView?, companionView? }
//                Responsible for cloning sourceView, running the engine
//                and freeing any intermediate views; returns the result.
function optCompareCombo(opts) {
   if (!opts || !opts.pane)
      throw new Error("optCompareCombo: opts.pane required");
   var pane = opts.pane;
   if (!pane.currentKey || !optSafeView(pane.currentView))
      throw new Error("Select an image first.");
   // combo is optional: sections without an algorithm dropdown (e.g. Color
   // Calibration, whose methods are separate action cards) pass combo:null and
   // drive the loop from opts.names + a per-item dispatch inside runOne.
   var combo = opts.combo || null;
   var names = opts.names || [];
   if (!combo && !names.length)
      throw new Error("Compare: no algorithm combo or names provided.");
   var available = opts.available || [];
   var skip = opts.skipIndices || [];
   var sourceView = pane.currentView;
   var sourceKey = pane.currentKey;
   var sourceW = sourceView.image.width;
   var sourceH = sourceView.image.height;
   var originalIdx = 0;
   if (combo) try { originalIdx = combo.currentItem; } catch (eOI) { originalIdx = 0; }
   var tiles = [];
   var dlg = pane.dialog;
   var renderReduction = (dlg && dlg.sharedPreviewReduction) ? dlg.sharedPreviewReduction : (typeof OPT_PREVIEW_REDUCTION_DEFAULT !== "undefined" ? OPT_PREVIEW_REDUCTION_DEFAULT : 1);
   var baseDims = optCalculateCompareBaseDims(sourceW, sourceH, renderReduction, 128);
   var baseW = baseDims.width;
   var baseH = baseDims.height;
   var maxItems = combo
      ? Math.min(names.length, (typeof combo.numberOfItems === "number") ? combo.numberOfItems : names.length)
      : names.length;
   var slotIndex = 0;

   function isSkipped(i) {
      for (var j = 0; j < skip.length; ++j) if (skip[j] === i) return true;
      return false;
   }

   var cancelled = false;   // CANCEL: set if the user clicks ✕ mid-run
   pane.preview.setBusy(true, opts.busyText || "Compare: running...", true);
   try {
      for (var i = 0; i < maxItems; ++i) {
         if (isSkipped(i))
            continue;
         var tile = { index: i, label: names[i] || ("Item " + i), bmp: null, error: null };
         if (!available[i]) {
            tile.error = "not installed";
            tiles.push(tile);
            ++slotIndex;
            continue;
         }
         var runResult = null;
         var resultView = null;
         var gradientView = null;
         var companionView = null;
         try {
            if (combo) try { combo.currentItem = i; } catch (eCSet) {}
            if (typeof opts.syncFn === "function") {
               try { opts.syncFn(i); } catch (eSync) {}
            }
            // Per-item progress in the busy overlay ("3/4: GraXpert...") so the user
            // knows how many algorithms are left during a long Compare run.
            try { pane.preview.setBusy(true, optT("Compare") + " " + (i + 1) + "/" + maxItems + ": " + (names[i] || ("Item " + i)) + "...", true); } catch (eProg) {}
            try { optProcessEvents(); } catch (ePE) {}
            // CANCEL: optProcessEvents above dispatched any ✕ click; stop before the
            // next (possibly minutes-long) algorithm. Variants already computed stay
            // in their memory slots so the user keeps the partial comparison.
            if (pane.preview.isCancelRequested && pane.preview.isCancelRequested()) { cancelled = true; break; }
            runResult = opts.runOne(sourceView, i);
            if (!runResult)
               throw new Error((names[i] || ("Item " + i)) + " returned no result.");
            if (optSafeView(runResult)) {
               resultView = runResult;
            } else if (typeof runResult === "object") {
               if (optSafeView(runResult.view)) resultView = runResult.view;
               else if (optSafeView(runResult.continueView)) resultView = runResult.continueView;
               if (optSafeView(runResult.gradientView)) gradientView = runResult.gradientView;
               else if (runResult.bkgView && optSafeView(runResult.bkgView)) gradientView = runResult.bkgView;
               if (optSafeView(runResult.companionView)) companionView = runResult.companionView;
            }
            if (!optSafeView(resultView))
               throw new Error("Algorithm " + (names[i] || ("Item " + i)) + " returned no usable view.");
            var meta = {
               image: optLabelForKey(sourceKey),
               menu: opts.menuCode || "M",
               algorithm: names[i] || ("Alg" + i),
               stage: "Compare: " + (names[i] || ("Item " + i)),
               signature: "Compare|" + (opts.menuCode || "M") + "|" + (names[i] || i),
               compareKind: opts.compareKind || "compare",
               method: names[i] || ("Item " + i)
            };
            pane.memory.store(slotIndex, sourceKey, resultView, meta, gradientView, companionView);
            // Render each tile using calculated base dimensions to prevent aspect ratio distortion
            tile.bmp = optRenderPreviewBitmapToSize(resultView, baseW, baseH, opts.stretchMode || "");
         } catch (eRun) {
            tile.error = (eRun && eRun.message) ? eRun.message : ("" + eRun);
            try { console.warningln("Compare " + (opts.menuCode || "") + " " + (names[i] || i) + " failed: " + tile.error); } catch (eW) {}
         }
         // memory.store cloned everything, so we can release the engine
         // outputs once the slot owns its own copies.
         if (resultView && optSafeView(resultView))
            try { optCloseView(resultView); } catch (eClR) {}
         if (gradientView && optSafeView(gradientView))
            try { optCloseView(gradientView); } catch (eClG) {}
         if (companionView && optSafeView(companionView))
            try { optCloseView(companionView); } catch (eClC) {}
         tiles.push(tile);
         ++slotIndex;
      }
   } finally {
      if (combo) try { combo.currentItem = originalIdx; } catch (eRest) {}
      if (typeof opts.syncFn === "function") {
         try { opts.syncFn(originalIdx); } catch (eSyncR) {}
      }
      pane.preview.setBusy(false);
   }

   // Mosaic dimensions follow the grid layout — cols * baseW wide,
   // rows * baseH tall — so every cell ends up exactly source-shaped.
   // Without this the 2-tile case (cols=2, rows=1) was halving the cell
   // width while keeping full height, which stretched each tile
   // vertically. The 4-tile case (cols=2, rows=2) preserved aspect
   // accidentally because both axes were halved equally.
   var n = tiles.length;
   var cols = opts.cols || ((n <= 3) ? Math.max(1, n) : 2);
   var rows = Math.ceil(n / cols);
   var mosaicW = cols * baseW;
   var mosaicH = rows * baseH;
   var MAX_MOSAIC = 2400;
   if (mosaicW > MAX_MOSAIC) { mosaicH = Math.round(mosaicH * (MAX_MOSAIC / mosaicW)); mosaicW = MAX_MOSAIC; }
   if (mosaicH > MAX_MOSAIC) { mosaicW = Math.round(mosaicW * (MAX_MOSAIC / mosaicH)); mosaicH = MAX_MOSAIC; }
   var mosaic = optBuildCompareMosaicBitmap(tiles, mosaicW, mosaicH, cols);
   var validCount = 0;
   for (var k = 0; k < tiles.length; ++k) if (tiles[k].bmp) ++validCount;
   var statusLabel = "<b>" + optT("Compare") + (cancelled ? " (" + optT("cancelled") + ")" : "") + ":</b> " + validCount + "/" + tiles.length +
      " " + optT("variants stored in Memory") + " 1-" + tiles.length +
      ". " + optT("Right-click a slot to inspect, then click Use this Image to commit the winner.");
   // The preview's pixel-coordinate scaling assumes the bitmap represents
   // the source view, so pass the source dimensions multiplied by the
   // grid — otherwise clicking on a tile would map to wrong source
   // coordinates if any per-cell interaction is added later.
   pane.renderBitmap(mosaic, statusLabel, true, cols * sourceW, rows * sourceH);
   // Leak sentinel (log-only): every per-algorithm candidate clone must be closed;
   // the mosaic results live in the memory slots, not as loose "Opt_Compare_" windows.
   try { if (typeof optDiagScanTempLeaks === "function") optDiagScanTempLeaks("Compare " + (opts.menuCode || ""), ["Opt_Compare_"]); } catch (eLk) {}
}

// --- Wrappers --------------------------------------------------------------

function optComparePreDeconvolution(dlg) {
   if (!dlg || !dlg.preTab) throw new Error("Pre tab not available.");
   var combo = dlg.comboPreDecon;
   if (!combo) throw new Error("Deconvolution combo not available.");
   var hasBXT = (typeof BlurXTerminator !== "undefined");
   var hasCC  = (typeof optIsCosmicClarityAvailable === "function") ? optIsCosmicClarityAvailable() : false;
   optCompareCombo({
      pane: dlg.preTab.preview,
      combo: combo,
      names: optVisibleComboNames(combo),
      available: optAllTrue(combo.numberOfItems),
      syncFn: function(idx) { if (typeof dlg.syncPreDeconPanels === "function") dlg.syncPreDeconPanels(idx); },
      menuCode: "Dec",
      compareKind: "decon",
      stretchMode: "mad-unlinked",
      busyText: "Compare: running deconvolution algorithms...",
      runOne: function(sourceView, idx) {
         var candidate = optCloneView(sourceView, "Opt_Compare_Dec_" + idx + "_" + sourceView.id, false);
         try {
            return optApplyPreCandidate(candidate, "decon", dlg);
         } catch (eR) {
            try { optCloseView(candidate); } catch (eC) {}
            throw eR;
         }
      }
   });
}

function optComparePostNoiseReduction(dlg) {
   if (!dlg || !dlg.postTab) throw new Error("Post tab not available.");
   var combo = dlg.comboPostNR;
   if (!combo) throw new Error("Noise Reduction combo not available.");
   var hasNXT = (typeof NoiseXTerminator !== "undefined") || (typeof optDependencyProcessExists === "function" && optDependencyProcessExists("NoiseXTerminator"));
   var hasTGV = (typeof optDependencyProcessExists === "function") ? optDependencyProcessExists("TGVDenoise") : (typeof TGVDenoise !== "undefined");
   var hasCC  = (typeof optIsCosmicClarityAvailable === "function") ? optIsCosmicClarityAvailable() : false;
   var hasGraX = (typeof optHasGraXpertProcess === "function" && optHasGraXpertProcess()) || (typeof optEnsureGraXpertLibLoaded === "function" && optEnsureGraXpertLibLoaded()) || (typeof GraXpertLib !== "undefined");
   // DEEPSNR-INTEGRATION-BEGIN
   var hasPrism = (typeof optIsPrismAvailable === "function") ? optIsPrismAvailable() : false;
   var hasDeepSNR = (typeof optIsDeepSNRAvailable === "function") ? optIsDeepSNRAvailable() : false;
   // DEEPSNR-INTEGRATION-END
   optCompareCombo({
      pane: dlg.postTab.preview,
      combo: combo,
      names: optVisibleComboNames(combo),
      available: optAllTrue(combo.numberOfItems),
      cols: 3,
      syncFn: function(idx) { if (typeof dlg.syncPostNRPanels === "function") dlg.syncPostNRPanels(optComboCanonicalItem(combo)); },
      menuCode: "NR",
      compareKind: "nr",
      stretchMode: "",                  // Post is already stretched; do not re-stretch
      busyText: "Compare: running noise-reduction algorithms...",
      runOne: function(sourceView, idx) {
         var candidate = optCloneView(sourceView, "Opt_Compare_NR_" + idx + "_" + sourceView.id, false);
         try {
            return optApplyPostCandidate(candidate, "post_nr", dlg);
         } catch (eR) {
            try { optCloseView(candidate); } catch (eC) {}
            throw eR;
         }
      }
   });
}

function optComparePostSharpening(dlg) {
   if (!dlg || !dlg.postTab) throw new Error("Post tab not available.");
   var combo = dlg.comboPostSharp;
   if (!combo) throw new Error("Sharpening combo not available.");
   var hasBXT = (typeof BlurXTerminator !== "undefined") || (typeof optDependencyProcessExists === "function" && optDependencyProcessExists("BlurXTerminator"));
   var hasUSM = true;
   var hasHDR = true;
   var hasLHE = true;
   var hasDSE = true;
   var hasCC  = (typeof optIsCosmicClarityAvailable === "function") ? optIsCosmicClarityAvailable() : false;
   // CONFIG-TAB: combo is filtered to visible (installed && enabled) algorithms.
   optCompareCombo({
      pane: dlg.postTab.preview,
      combo: combo,
      names: optVisibleComboNames(combo),
      available: optAllTrue(combo.numberOfItems),
      cols: 3,
      syncFn: function(idx) { if (typeof dlg.syncPostSharpPanels === "function") dlg.syncPostSharpPanels(idx); },
      menuCode: "SH",
      compareKind: "post_sharp",
      stretchMode: "",                  // Post is already stretched; do not re-stretch
      busyText: "Compare: running sharpening algorithms...",
      runOne: function(sourceView, idx) {
         var candidate = optCloneView(sourceView, "Opt_Compare_SH_" + idx + "_" + sourceView.id, false);
         try {
            return optApplyPostCandidate(candidate, "post_sharp", dlg);
         } catch (eR) {
            try { optCloseView(candidate); } catch (eC) {}
            throw eR;
         }
      }
   });
}

function optCompareStretchZone(zone, dlg) {
   if (!zone || !zone.combo) throw new Error("Stretch zone combo not available.");
   var isStars = zone.isStars === true;
   var pane = dlg.stretchTab.preview;
   // Map combo items to availability and skip the interactive "Curves"
   // item; it is not a stretch algorithm that produces a comparable
   // candidate (it edits the live displayed view via point dragging).
   var labels = [];
   var avail = [];
   var skip = [];
   for (var i = 0; i < zone.combo.numberOfItems; ++i) {
      var algoId = zone.algorithmIds[i] || ("ALG" + i);
      var label = "";
      try { label = zone.combo.itemText(i); } catch (eIT) { label = algoId; }
      labels.push(label || algoId);
      // Curves is interactive — skip in Compare.
      if (algoId === "CURVES") {
         skip.push(i);
         avail.push(false);
         continue;
      }
      // Engine availability checks — assume true unless we know better.
      if (algoId === "MAS") {
         avail.push(typeof optDependencyProcessExists === "function" ? optDependencyProcessExists("MultiscaleAdaptiveStretch") : true);
         continue;
      }
      avail.push(true);  // STF, Statistical, Star Stretch, AutoGHS — always available
   }
   optCompareCombo({
      pane: pane,
      combo: zone.combo,
      names: labels,
      available: avail,
      skipIndices: skip,
      syncFn: function(idx) { try { if (typeof zone.sync === "function") zone.sync(); } catch (eS) {} },
      menuCode: isStars ? "STR" : "RGB",
      compareKind: isStars ? "stretch_stars" : "stretch_rgb",
      stretchMode: "",                  // results are non-linear already; no MAD stretch
      busyText: "Compare: running " + (isStars ? "stars" : "RGB/Starless") + " stretch algorithms...",
      runOne: function(sourceView, idx) {
         var candidate = optCloneView(sourceView, "Opt_Compare_Str_" + (isStars ? "S" : "R") + idx + "_" + sourceView.id, false);
         try {
            return optApplyStretchCandidate(candidate, zone.algorithmIds[idx], zone, dlg);
         } catch (eR) {
            try { optCloseView(candidate); } catch (eC) {}
            throw eR;
         }
      }
   });
}

// ===== COMPARE-SS-BEGIN — easy-rollback block (v140 Option B) =====
// Star Split Compare uses TWO memory slots per engine: an even slot
// for the Starless layer and the next-higher (odd) slot for the
// matching Stars layer. With 2 engines, slots 1..4 are populated; with
// 3 engines, slots 1..6. The mosaic is composed as a 2-column grid
// (Starless | Stars) × N rows (one per engine), so a single glance
// answers "which engine produces the cleanest starless AND which one
// produces the cleanest stars". Slot tooltips identify each cell
// unambiguously ("Memory 1: Starless (StarXTerminator)" etc.).
//
// Commit semantics: right-clicking any slot recalls that layer; the
// first "Use this Image" promotes that single layer to the workflow
// store (<Base>_Starless or <Base>_Stars), the mosaic disappears
// because the preview activates the just-committed view. The user is
// free to recall another slot afterwards and commit it too — mixing
// engines between layers (e.g. SXT for starless + StarNet2 for stars)
// works out of the box.
//
// To revert this block to the previous "single slot + companion view"
// design, restore the earlier optCompareStarSplit + the "star_split"
// branch in setToCurrent from git history (commit fd30ab3 and the v140
// commit that introduces this block).
function optCompareStarSplit(dlg) {
   if (!dlg || !dlg.stretchTab) throw new Error("Stretch tab not available.");
   var combo = dlg.comboStarSplitAlgo;
   if (!combo) throw new Error("Star Split algorithm combo not available.");
   var pane = dlg.stretchTab.preview;
   if (!pane.currentKey || !optSafeView(pane.currentView))
      throw new Error("Select a Stretching image first.");
   // CONFIG-TAB: combo is filtered to visible (installed && enabled) engines;
   // iterate exactly those and map the display index to the canonical method.
   var names = optVisibleComboNames(combo);
   var available = optAllTrue(names.length);
   var sourceView = pane.currentView;
   var sourceKey = pane.currentKey;
   var sourceW = sourceView.image.width;
   var sourceH = sourceView.image.height;
   var originalIdx = 0;
   try { originalIdx = combo.currentItem; } catch (eOI) {}
   var renderReduction = dlg.sharedPreviewReduction || (typeof OPT_PREVIEW_REDUCTION_DEFAULT !== "undefined" ? OPT_PREVIEW_REDUCTION_DEFAULT : 1);
   var baseDims = optCalculateCompareBaseDims(sourceW, sourceH, renderReduction, 128);
   var baseW = baseDims.width;
   var baseH = baseDims.height;
   var maxItems = Math.min(names.length, (typeof combo.numberOfItems === "number") ? combo.numberOfItems : names.length);
   var tiles = [];  // 2 per engine: starless tile first, then stars tile
   var slotIndex = 0;
   var baseKey = optBaseKey(sourceKey);

   pane.preview.setBusy(true, "Compare: running star-removal engines...");
   try {
      for (var i = 0; i < maxItems; ++i) {
         var slTile = { index: slotIndex, label: "Starless: " + names[i], bmp: null, error: null };
         var stTile = { index: slotIndex + 1, label: "Stars: " + names[i], bmp: null, error: null };
         if (!available[i]) {
            slTile.error = "not installed";
            stTile.error = "not installed";
            tiles.push(slTile);
            tiles.push(stTile);
            slotIndex += 2;
            continue;
         }
         var result = null;
         try {
            try { combo.currentItem = i; } catch (eCSet) {}
            try { optProcessEvents(); } catch (ePE) {}
            var rec = { view: sourceView };
            result = dlg.runStarSplitEngineOn(rec, baseKey + "_Cmp" + i, optComboCanonicalItem(combo));
            if (!result || !optSafeView(result.starless))
               throw new Error("engine returned no starless layer");

            // Store starless in the even slot of this engine's pair.
            // Meta carries compareKind/layer so setToCurrent knows
            // which workflow key to commit into on "Use this Image".
            pane.memory.store(slotIndex, sourceKey, result.starless, {
               image: optLabelForKey(sourceKey),
               menu: "SS",
               algorithm: "Starless " + names[i],
               stage: "Compare Starless: " + names[i],
               signature: "Compare|SS|Starless|" + names[i],
               compareKind: "star_split_starless",
               method: names[i],
               layer: "starless"
            });
            // Augment the slot tooltip beyond the generic
            // "Memory N: ..." that store() applies so users can
            // tell starless from stars at a glance on the chips.
            try {
               if (pane.memory.buttons[slotIndex])
                  pane.memory.buttons[slotIndex].toolTip =
                     "Memory " + (slotIndex + 1) + ": <b>Starless</b> (" + names[i] + ")\n" +
                     "Right-click to inspect. Use this Image commits as <Base>_Starless.";
            } catch (eTip0) {}

            // Store stars in the odd slot of this engine's pair.
            if (optSafeView(result.stars)) {
               pane.memory.store(slotIndex + 1, sourceKey, result.stars, {
                  image: optLabelForKey(sourceKey),
                  menu: "SS",
                  algorithm: "Stars " + names[i],
                  stage: "Compare Stars: " + names[i],
                  signature: "Compare|SS|Stars|" + names[i],
                  compareKind: "star_split_stars",
                  method: names[i],
                  layer: "stars"
               });
               try {
                  if (pane.memory.buttons[slotIndex + 1])
                     pane.memory.buttons[slotIndex + 1].toolTip =
                        "Memory " + (slotIndex + 2) + ": <b>Stars</b> (" + names[i] + ")\n" +
                        "Right-click to inspect. Use this Image commits as <Base>_Stars.";
               } catch (eTip1) {}
            } else {
               stTile.error = "no stars layer";
            }

            // Tile bitmaps using calculated base dimensions to prevent aspect ratio distortion
            slTile.bmp = optRenderPreviewBitmapToSize(result.starless, baseW, baseH, "mad-linked");
            if (optSafeView(result.stars))
               stTile.bmp = optRenderPreviewBitmapToSize(result.stars, baseW, baseH, "mad-linked");
         } catch (eRun) {
            var msg = (eRun && eRun.message) ? eRun.message : ("" + eRun);
            slTile.error = msg;
            stTile.error = msg;
            try { console.warningln("Compare SS " + names[i] + " failed: " + msg); } catch (eW) {}
         }
         // Memory.store cloned the views, so we can release the engine outputs.
         if (result) {
            if (optSafeView(result.starless)) try { optCloseView(result.starless); } catch (eC0) {}
            if (optSafeView(result.stars))    try { optCloseView(result.stars); } catch (eC1) {}
         }
         tiles.push(slTile);
         tiles.push(stTile);
         slotIndex += 2;
      }
   } finally {
      try { combo.currentItem = originalIdx; } catch (eRest) {}
      pane.preview.setBusy(false);
   }

   // Mosaic: 2 columns (Starless | Stars) × N rows (one per engine).
   // optBuildCompareMosaicBitmap already picks cols=2 for n>=4, which
   // is exactly what we want when both engines are installed (4 tiles).
   // For corner cases (single engine, only 2 tiles) the layout falls
   // back to 2×1 which still reads as Starless | Stars side by side.
   var cols = 2;
   var rows = Math.ceil(tiles.length / cols);
   var baseW = Math.max(128, Math.round(sourceW / renderReduction));
   var baseH = Math.max(128, Math.round(sourceH / renderReduction));
   var mosaicW = cols * baseW;
   var mosaicH = rows * baseH;
   var MAX_MOSAIC = 2400;
   if (mosaicW > MAX_MOSAIC) { mosaicH = Math.round(mosaicH * (MAX_MOSAIC / mosaicW)); mosaicW = MAX_MOSAIC; }
   if (mosaicH > MAX_MOSAIC) { mosaicW = Math.round(mosaicW * (MAX_MOSAIC / mosaicH)); mosaicH = MAX_MOSAIC; }
   var mosaic = optBuildCompareMosaicBitmap(tiles, mosaicW, mosaicH);
   var validCount = 0;
   for (var k = 0; k < tiles.length; ++k) if (tiles[k].bmp) ++validCount;
   var statusLabel = "<b>Compare:</b> " + validCount + "/" + tiles.length +
      " Star Split tiles in Memory 1-" + tiles.length +
      ". Layout: <b>Starless | Stars</b> per row, one row per engine. " +
      "Right-click a slot to inspect; <b>Use this Image</b> commits that single layer " +
      "(Starless or Stars) — you can mix engines (e.g. SXT starless + StarNet2 stars).";
   pane.renderBitmap(mosaic, statusLabel, true, cols * sourceW, rows * sourceH);
}
// ===== COMPARE-SS-END =====
// ===== COMPARE-END =====

// BATCH-APPLY-BEGIN (UI) ------------------------------------------------------
// Shared driver for the Pre-processing "Apply all" buttons (Gradient
// Correction / Deconvolution). Runs immediately (no confirmation pop-up).
// Flow: ensure the ACTIVE image gets the process through the standard candidate
// pipeline (committing a matching pending candidate, or generating + committing
// one now) -> batch the remaining slots through optApplyPreBatchToSlots ->
// report the outcome in the status line + console.
function optRunPreApplyAll(tab, pane, actionKey, stageName) {
   var dlg = tab.dialog;
   if (!pane.currentKey || !optSafeView(pane.currentView))
      throw new Error("Select a Pre-processing image first.");
   var activeKey = pane.currentKey;
   var targets = optPreBatchTargetKeys(dlg, activeKey);
   // No confirmation pop-up: "Apply all" runs immediately (the scope is spelled
   // out in the button tooltip). The console + status line report the outcome.
   // 1) Active image. Reuse the pending candidate when it belongs to this same
   //    process (the user already reviewed it); otherwise run the process now
   //    through the standard pipeline, then commit — exactly "Use this Image".
   if (!(optSafeView(pane.candidateView) && pane.pendingActionKey === actionKey)) {
      pane.beginCandidate(stageName, function(candidate) {
         return optApplyPreCandidate(candidate, actionKey, dlg);
      }, actionKey);
   }
   pane.setToCurrent();
   // 2) Remaining slots.
   var res = { applied: [], failed: [] };
   if (targets.length > 0) {
      pane.preview.setBusy(true, "Apply all: preparing...", true);   // CANCEL: cancelable overlay
      try {
         res = optApplyPreBatchToSlots(dlg, actionKey, stageName, activeKey, function(key, idx, total) {
            pane.preview.setBusy(true, optT("Apply all") + ": " + optLabelForKey(key) + " (" + (idx + 1) + "/" + total + ")...", true);
            optProcessEvents();   // deliver a queued ✕ click before the next slot
            // CANCEL: returning false aborts the batch before this slot is processed.
            return !(pane.preview.isCancelRequested && pane.preview.isCancelRequested());
         });
      } finally {
         pane.preview.setBusy(false);
      }
   }
   pane.refreshButtons();
   dlg.refreshWorkflowButtons();
   var msg = "<b>" + optT("Apply all") + (res.cancelled ? " (" + optT("cancelled") + ")" : "") + ":</b> " + stageName + " " + optT("applied to") + " " + (res.applied.length + 1) + " " + optT("image(s).");
   if (res.failed.length > 0) {
      var failTxt = [];
      for (var f = 0; f < res.failed.length; ++f)
         failTxt.push(optLabelForKey(res.failed[f].key));
      msg += " <b>Failed:</b> " + failTxt.join(", ") + " (see console).";
   }
   if (res.cancelled)
      msg += " " + optT("remaining images were skipped.");
   pane.status.text = msg;
   console.writeln("=> Apply all: " + stageName + " — done. Applied: " +
      (res.applied.length + 1) + ", failed: " + res.failed.length + ".");
}

// Appends the full-width "Apply all" row to a Pre process section. Returns the
// button (or null when the feature flag is off). The 4th arg is an
// OPT6D_TOOLTIPS[_ES] key (e.g. "applyAll.gradient") so the tooltip follows the
// active ES/EN language and live-retranslates, instead of a hardcoded string.
function optAddApplyAllButton(tab, section, onClickFn, toolTipKey) {
   if (typeof OPT_BATCH_APPLY_ENABLED === "undefined" || OPT_BATCH_APPLY_ENABLED !== true)
      return null;
   var btn = optButton(section.body, "Apply all", 0);
   optThemeApplyActionButton(btn);
   if (toolTipKey)
      optApplyExplicitTooltip(btn, toolTipKey);
   btn.onClick = onClickFn;
   section.body.sizer.add(btn);
   return btn;
}
// BATCH-APPLY-END (UI) --------------------------------------------------------

OptWorkflowTab.prototype.addProcessSection = function(title, buttons, options) {
   options = options || {};
   var section = optSection(this.leftContent, title);
   if (optHasOwn(options, "build") && typeof options.build === "function")
      options.build(section.body, this);
   function wireButton(button, spec, tab, pane) {
      button.onClick = function() {
         var clicked = this;
         optSafeUi(clicked.__stageName, function() {
            if (optHasOwn(spec, "action") && typeof spec.action === "function") {
               spec.action(tab, pane, clicked);
               return;
            }
            pane.beginCandidate(clicked.__stageName, function(candidate) {
               if (optHasOwn(spec, "transform") && typeof spec.transform === "function")
                  return spec.transform(candidate, tab.dialog, tab, clicked);
               return optApplyPreCandidate(candidate, clicked.__actionKey, tab.dialog);
            }, clicked.__actionKey);
         });
      };
   }
   for (var i = 0; i < buttons.length; ++i) {
      var spec = buttons[i];
      var width = optHasOwn(spec, "width") ? spec.width : 0;
      var isPrimary = !(optHasOwn(spec, "primary") && spec.primary === false);
      var b = isPrimary
         ? optPrimaryButton(section.body, spec.text, width)
         : optButton(section.body, spec.text, width);
      b.__stageName = optHasOwn(spec, "stage") ? spec.stage : title;
      b.__actionKey = optHasOwn(spec, "actionKey") ? spec.actionKey : "";
      var pane = this.preview;
      var tab = this;
      wireButton(b, spec, tab, pane);
      // Phase 6: in-module action buttons get the compact gradient CTA
      // (32 px) for primaries, or the neutral action style for secondaries.
      // Stretch=1 makes them share the row when there are multiple.
      if (isPrimary)
         optThemeApplyModuleCta(b);
      else
         optThemeApplyActionButton(b);
      if (buttons.length > 1) section.body.sizer.add(b, 1);
      else                    section.body.sizer.add(b);
      if (optHasOwn(spec, "name") && spec.name)
         this[spec.name] = b;
   }
   this.registerSection(section);
   this.leftContent.sizer.add(section.bar);
   this.leftContent.sizer.add(section.body);
   return section;
};

OptWorkflowTab.prototype.wireSelection = function() {
   var tab = this;
   this.selection.btnCombineMono.onClick = function() { optSafeUi("Combine mono channels", function() { tab.combineMono(); }); };
   this.selection.btnSeparateMono.onClick = function() { optSafeUi("Process separate mono channels", function() { tab.processSeparateMono(); }); };
   this.selection.btnCombineNb.onClick = function() { optSafeUi("Combine narrowband channels", function() { tab.combineNb(); }); };
   this.selection.btnSeparateNb.onClick = function() { optSafeUi("Process separate narrowband channels", function() { tab.processSeparateNb(); }); };
   this.selection.btnProcessRgb.onClick = function() { optSafeUi("Process RGB image", function() { tab.processRgb(); }); };
};

OptWorkflowTab.prototype.setRecord = function(key, view, owned) {
   this.dialog.store.setView(key, view, owned === true, this.tabName);
   this.dialog.store.setAvailable(key, this.tabName, true);
   // Cualquier imagen de trabajo (committed en cualquier pestaña) queda disponible
   // para Anotaciones — para poder anotar la imagen con la que trabajas, venga de donde venga.
   if (typeof OPT_TAB_ANNOT !== "undefined") this.dialog.store.setAvailable(key, OPT_TAB_ANNOT, true);
   if (this.tabName === OPT_TAB_POST) {
      // A Post image is usable downstream everywhere: CC, Image Enhancement.
      this.dialog.store.setAvailable(key, OPT_TAB_CC, true);
      if (typeof OPT_TAB_IMGENH !== "undefined") this.dialog.store.setAvailable(key, OPT_TAB_IMGENH, true);
   }
   this.dialog.refreshWorkflowButtons();
   this.preview.activate(key, true);
};

OptWorkflowTab.prototype.combineMono = function() {
   var r = this.selection.view("R");
   var g = this.selection.view("G");
   var b = this.selection.view("B");
   var l = this.selection.view("L_MONO");
   var useL = optSafeView(l);
   var combined = optCreateRgbFromChannels(r, g, b, useL ? "L_R_G_B" : "R_G_B", g);
   if (useL) {
      // LRGB-WEIGHT-BEGIN — capture RGB backup before LRGB if weight != 100%
      var lrgbWeight = optGetLuminanceWeight(this.dialog);
      var rgbBackup = null;
      if (lrgbWeight !== 1.0) {
         try {
            rgbBackup = optCloneView(combined, "LRGB_Weight_Backup_" + combined.id, false);
         } catch (eClone) {
            try { console.warningln("[LRGB] Could not clone RGB for weight blend; falling back to standard LRGB. " + eClone.message); } catch (eW) {}
            rgbBackup = null;
         }
      }
      // LRGB-WEIGHT-END
      optApplyLuminanceLRGB(combined, l);
      // LRGB-WEIGHT-BEGIN — blend LRGB result with RGB backup using user weight
      if (rgbBackup && optSafeView(rgbBackup)) {
         try {
            optLrgbWeightBlend(combined, rgbBackup, lrgbWeight);
            try { console.writeln("[LRGB] Applied L blending weight: " + Math.round(lrgbWeight * 100) + "%."); } catch (eC) {}
         } finally {
            try { optCloseView(rgbBackup); } catch (eClose) {}
         }
      }
      // LRGB-WEIGHT-END
   }
   this.setRecord("MonoRGB", combined, true);
};

OptWorkflowTab.prototype.processSeparateMono = function() {
   var keys =      ["R", "G", "B", "L"];
   var comboKeys = ["R", "G", "B", "L_MONO"];
   for (var i = 0; i < keys.length; ++i) {
      var v = this.selection.view(comboKeys[i]);
      if (optSafeView(v))
         this.dialog.store.setView(keys[i], v, false, this.tabName);
   }
   this.dialog.refreshWorkflowButtons();
   for (var j = 0; j < keys.length; ++j)
      if (this.dialog.store.isAvailable(keys[j], this.tabName)) {
         this.preview.activate(keys[j], true);
         break;
      }
};

OptWorkflowTab.prototype.combineNb = function() {
   // DBXTRACT-BEGIN — branch when both HO and OS dual-band filter images are present.
   // Extracts Ha / OIII / SII via DBXtract.js and feeds them to the recipe combiner
   // as if they were the H / O / S inputs. Default palette is HSO unless the user
   // has clicked a specific palette button. To revert: delete this entire branch.
   var hoView = this.selection.view("HO");
   var soView = this.selection.view("OS");
   if (optSafeView(hoView) && optSafeView(soView)) {
      var palette = this.dialog.recipeManuallySelected ? this.dialog.selectedRecipe : "HSO";
      console.writeln("[NB] Dual-band detected (HO + OS) → DBXtract extraction, palette: " + palette);
      try {
         var extracted;
         try {
            extracted = optRunDBXtract(hoView, soView);
         } catch (eDbx) {
            throw new Error("DBXtract path failed: " + eDbx.message +
               "\nTip: ensure HO and OS are valid RGB images of identical geometry.");
         }
         var mapDbx = { H: extracted.ha, O: extracted.oiii, S: extracted.sii };
         var recipeDbx = optRecipeChannels(palette);
         var rD = mapDbx[recipeDbx[0]];
         var gD = mapDbx[recipeDbx[1]];
         var bD = mapDbx[recipeDbx[2]];
         var combinedDbx = optCreateRgbFromChannels(rD, gD, bD, "NB_RGB_DBX_" + palette, gD || rD || bD);
         optAnnotateNarrowbandView(combinedDbx, palette, "DBXtract Combination");
         this.setRecord("HSO", combinedDbx, true);
      } finally {
         // Always clean up DBXtract intermediates, even if combine threw partway through.
         optCloseDBXtractIntermediates();
      }
      return;
   }
   // DBXTRACT-END

   var map = {
      H: this.selection.view("H"),
      O: this.selection.view("O"),
      S: this.selection.view("S")
   };
   var recipe = optRecipeChannels(this.dialog.selectedRecipe);
   var r = map[recipe[0]];
   var g = map[recipe[1]];
   var b = map[recipe[2]];
   var combined = optCreateRgbFromChannels(r, g, b, "NB_RGB_" + this.dialog.selectedRecipe, g || r || b);
   optAnnotateNarrowbandView(combined, this.dialog.selectedRecipe, "Channel Combination");
   this.setRecord("HSO", combined, true);
};

OptWorkflowTab.prototype.processSeparateNb = function() {
   var keys = ["H", "O", "S", "HO", "OS"];
   for (var i = 0; i < keys.length; ++i) {
      var v = this.selection.view(keys[i]);
      if (optSafeView(v))
         this.dialog.store.setView(keys[i], v, false, this.tabName);
   }
   this.dialog.refreshWorkflowButtons();
   for (var j = 0; j < keys.length; ++j)
      if (this.dialog.store.isAvailable(keys[j], this.tabName)) {
         this.preview.activate(keys[j], true);
         break;
      }
};

OptWorkflowTab.prototype.processRgb = function() {
   var v = this.selection.view("RGB");
   if (!optSafeView(v))
      throw new Error("Select an RGB view first.");
   this.setRecord("RGB", v, false);
};

OptWorkflowTab.prototype.refreshSelections = function() {
   this.selection.refresh();
};

// ===== STARNET2-BEGIN — easy-rollback block (v137) =====
// Resolves the user-facing StarNet2 stride label (Large / Standard / Small)
// into the integer or prototype constant expected by the StarNet2 process.
// Tries StarNet2.prototype.Stride_<Label> first, then defStride for the
// Standard case, then falls back to a sensible integer mapping. This lets
// the call site stay agnostic of build-specific stride encodings.
function optResolveStarNet2Stride(dlg) {
   var idx = 1; // Standard default
   try {
      if (dlg && dlg.comboStarSplitStride && typeof dlg.comboStarSplitStride.currentItem === "number")
         idx = dlg.comboStarSplitStride.currentItem;
   } catch (e0) {}
   var labels = ["Large", "Standard", "Small"];
   var label = labels[idx] || "Standard";
   if (typeof StarNet2 !== "undefined" && StarNet2.prototype) {
      var key = "Stride_" + label;
      if (typeof StarNet2.prototype[key] !== "undefined")
         return StarNet2.prototype[key];
      if (label === "Standard" && typeof StarNet2.prototype.defStride !== "undefined")
         return StarNet2.prototype.defStride;
   }
   // Integer fallback if the prototype does not expose named constants.
   // Larger numerical stride = coarser grid = faster inference, so Large
   // maps to the largest value and Small to the smallest.
   if (label === "Large") return 256;
   if (label === "Small") return 64;
   return 128; // Standard
}

// Updates the Split Stars button (enabled/disabled + reason tooltip)
// based on the engine currently chosen in the Algorithm combo. Called
// both at startup (from optApplyProcessAvailabilityToUI) and whenever
// the user changes the combo selection.
function optUpdateStarSplitButtonState(dlg) {
   if (!dlg || !dlg.btnCreateStarSplit)
      return;
   var idx = 0;
   try { if (dlg.comboStarSplitAlgo) idx = optComboCanonicalItem(dlg.comboStarSplitAlgo); } catch (e0) {}
   var installed, engineLabel, prefId;
   if (idx === 1) {
      installed = (typeof StarNet2 !== "undefined");
      engineLabel = "StarNet2";
      prefId = "starnet2";
   } else if (idx === 2) {
      installed = optIsSyQonStarlessAvailable();
      engineLabel = "SyQon Starless";
      prefId = "syqon";
   } else {
      installed = (typeof StarXTerminator !== "undefined");
      engineLabel = "StarXTerminator";
      prefId = "sxt";
   }
   // CONFIG-TAB: effective availability = installed AND user-enabled in Configuration.
   var prefOn = (typeof optIsAlgoEnabled === "function") ? optIsAlgoEnabled("starSplit", prefId) : true;
   var available = installed && prefOn;
   try {
      if (available) {
         dlg.btnCreateStarSplit.enabled = true;
         dlg.btnCreateStarSplit.toolTip = "";
      } else if (installed && !prefOn) {
         dlg.btnCreateStarSplit.enabled = false;
         dlg.btnCreateStarSplit.toolTip = engineLabel + " is disabled in the Configuration tab.";
      } else {
         dlg.btnCreateStarSplit.enabled = false;
         dlg.btnCreateStarSplit.toolTip = engineLabel + " is not installed in this PixInsight build. Select another algorithm in the dropdown or install the corresponding repository.";
      }
      // BATCH-APPLY-BEGIN (mirror availability onto the Star Split "Apply all" button)
      if (dlg.btnStarSplitAll)
         dlg.btnStarSplitAll.enabled = available;
      // BATCH-APPLY-END
   } catch (eUI) {}
}
// ===== STARNET2-END =====

// CONFIG-TAB: rebuild `combo` to show only visible algorithms (installed AND
// enabled in Configuration). Stores combo.__canonicalIndex (display -> canonical)
// so index-based dispatch can recover the canonical index via
// optComboCanonicalItem(). Preserves selection by canonical index, sets the Apply
// (and optional "all") button, syncs panels and (re)wires onItemSelected. The
// onItemSelected is overwritten (not chained), so calling this repeatedly is safe.
function optWireFilterableCombo(dlg, spec) {
   var combo = spec.combo;
   if (!combo) return;
   var entries = spec.entries, installed = spec.installed;
   var prevCanon = optComboCanonicalItem(combo);
   var vis = [];
   for (var i = 0; i < entries.length; ++i) {
      if (installed[i] && optIsAlgoEnabled(spec.menuId, entries[i].id))
         vis.push(i);
   }
   try { combo.clear(); } catch (eClr) {}
   for (var k = 0; k < vis.length; ++k) {
      try { combo.addItem(entries[vis[k]].label); } catch (eAdd) {}
   }
   combo.__canonicalIndex = vis;
   combo.__menuId = spec.menuId;
   var sel = 0;
   for (var s = 0; s < vis.length; ++s) if (vis[s] === prevCanon) { sel = s; break; }
   if (vis.length > 0) { try { combo.currentItem = sel; } catch (eSel) {} }
   var empty = (vis.length === 0);
   if (spec.applyBtn) {
      if (empty) {
         spec.applyBtn.enabled = false;
         spec.applyBtn.toolTip = spec.emptyReason || "No algorithms are enabled for this step. Enable one in the Configuration tab.";
      } else {
         spec.applyBtn.enabled = true;
         spec.applyBtn.toolTip = "";
      }
   }
   if (spec.allBtn) spec.allBtn.enabled = !empty;
   if (typeof spec.syncFn === "function") { try { spec.syncFn(); } catch (eSy) {} }
   combo.onItemSelected = function() {
      if (typeof spec.syncFn === "function") { try { spec.syncFn(); } catch (eSy2) {} }
   };
}

// CONFIG-TAB: labels currently visible in a filtered combo, to build a Compare
// grid from exactly the algorithms the user kept.
function optVisibleComboNames(combo) {
   var out = [];
   try {
      var n = combo.numberOfItems;
      for (var i = 0; i < n; ++i) out.push(combo.itemText(i));
   } catch (e) {}
   return out;
}
function optAllTrue(n) { var a = []; for (var i = 0; i < n; ++i) a.push(true); return a; }

// Detects which optional third-party processes/scripts are installed in the running
// PixInsight build and enables or disables the corresponding UI controls. Called
// from runDependencyChecks() after every tab is fully constructed.
function optApplyProcessAvailabilityToUI(dlg) {
   if (!dlg) return;

   // --- Availability flags ---
   var hasBXT  = optCreateBlurXTerminatorProcessInstance() != null;
   var hasNXT  = optCreateGenericProcessInstance(["NoiseXTerminator"], ["NXT", "NoiseXTerminator"]) != null;
   var hasGraX = optHasGraXpertProcess() || (typeof optEnsureGraXpertLibLoaded === "function" && optEnsureGraXpertLibLoaded()) || (typeof GraXpertLib !== "undefined");
   var hasMAS  = optDependencyProcessExists("MultiscaleAdaptiveStretch");
   var hasSPCC = optDependencyProcessExists("SpectrophotometricColorCalibration");
   var hasTGV  = optDependencyProcessExists("TGVDenoise");
   var hasABE  = optDependencyProcessExists("AutomaticBackgroundExtractor");
   var hasCC   = optIsCosmicClarityAvailable();
   var hasDBE  = optIsAutoDBEAvailable(); // lazy-load: OPT_PIW_HAS_AUTODBE is false at module load before scripts are resolved
   var hasMGC  = optDependencyProcessExists("MultiscaleGradientCorrection");
   var hasSXT  = (typeof StarXTerminator !== "undefined");
   var hasSN2  = (typeof StarNet2 !== "undefined");

   function disableBtn(btn, reason) {
      if (!btn) return;
      btn.enabled = false;
      btn.toolTip = reason + " is not installed in this PixInsight build.";
   }
   function enableBtn(btn) {
      if (!btn) return;
      btn.enabled = true;
      btn.toolTip = "";
   }
   // CONFIG-TAB: disabled by the user in the Configuration tab (installed but turned off).
   function disableBtnCfg(btn, name) {
      if (!btn) return;
      btn.enabled = false;
      btn.toolTip = (name || "This algorithm") + " is disabled in the Configuration tab.";
   }

   var hasParallax = (typeof optIsParallaxAvailable === "function") ? optIsParallaxAvailable() : false;
   var hasPrism = (typeof optIsPrismAvailable === "function") ? optIsPrismAvailable() : false;
   var hasDeepSNR = (typeof optIsDeepSNRAvailable === "function") ? optIsDeepSNRAvailable() : false;
   var hasSyQonStarless = (typeof optIsSyQonStarlessAvailable === "function") ? optIsSyQonStarlessAvailable() : false;

   // --- Pre > Color Correction action cards: show only installed AND enabled ---
   function wireColorCard(btn, algoId, installed) {
      if (!btn) return;
      try { btn.visible = (installed && optIsAlgoEnabled("preColor", algoId)); } catch (eV) {}
   }
   if (dlg.preTab) {
      wireColorCard(dlg.preTab.btnPreSPCC, "spcc", hasSPCC);
      wireColorCard(dlg.preTab.btnPreSSSC, "sssc", true);   // SSSC: siempre "instalado"; si falta Gaia/gdr3sp da error en runtime
      wireColorCard(dlg.preTab.btnPreALF, "alf", true);
      wireColorCard(dlg.preTab.btnPreOT, "ot", true);
      wireColorCard(dlg.preTab.btnPreBN, "bn", true);
   }

   // --- Stretch zone rebuild: filter the combo and keep zone.algorithmIds in
   // lockstep (dispatch reads zone.algorithmIds[displayIndex] directly). ---
   function wireStretchZone(zone, menuId, canon) {
      if (!zone || !zone.combo) return;
      var prevId = null;
      try { if (zone.algorithmIds) prevId = zone.algorithmIds[zone.combo.currentItem]; } catch (eP) {}
      var ids = [];
      try { zone.combo.clear(); } catch (eC) {}
      for (var i = 0; i < canon.length; ++i) {
         if (canon[i].inst && optIsAlgoEnabled(menuId, canon[i].prefId)) {
            try { zone.combo.addItem(canon[i].label); } catch (eA) {}
            ids.push(canon[i].id);
         }
      }
      zone.algorithmIds = ids;
      var zsel = 0;
      for (var s = 0; s < ids.length; ++s) if (ids[s] === prevId) { zsel = s; break; }
      if (ids.length > 0) { try { zone.combo.currentItem = zsel; } catch (eS) {} }
      if (zone.btnPreview) {
         if (ids.length === 0) { zone.btnPreview.enabled = false; zone.btnPreview.toolTip = optT("No stretch algorithms are enabled for this zone. Enable one in the Configuration tab."); }
         else { zone.btnPreview.enabled = true; zone.btnPreview.toolTip = ""; }
      }
      if (typeof zone.sync === "function") { try { zone.sync(); } catch (eSy) {} }
      zone.combo.onItemSelected = function() { if (typeof zone.sync === "function") { try { zone.sync(); } catch (eSy2) {} } };
   }

   // --- Star Split combo (Stretch) ---
   optWireFilterableCombo(dlg, {
      combo: dlg.comboStarSplitAlgo,
      menuId: "starSplit",
      entries: [
         { id: "sxt", label: "StarXTerminator (SXT)" },
         { id: "starnet2", label: "StarNet2" },
         { id: "syqon", label: "SyQon Starless" }
      ],
      installed: [hasSXT, hasSN2, hasSyQonStarless],
      applyBtn: dlg.btnCreateStarSplit,
      allBtn: dlg.btnStarSplitAll,
      emptyReason: "No star-removal engines are enabled. Enable one in the Configuration tab or install StarXTerminator / StarNet2 / SyQon.",
      syncFn: function() { if (dlg.syncStarSplitPanels) dlg.syncStarSplitPanels(optComboCanonicalItem(dlg.comboStarSplitAlgo)); }
   });

   // --- Pre Gradient Correction combo ---
   optWireFilterableCombo(dlg, {
      combo: dlg.comboPreGradient,
      menuId: "preGradient",
      entries: [
         { id: "mgc", label: "MGC" },
         { id: "autodbe", label: "AutoDBE (SetiAstro)" },
         { id: "abe", label: "ABE" },
         { id: "graxpert", label: "GraXpert" }
      ],
      installed: [hasMGC, hasDBE, hasABE, hasGraX],
      applyBtn: dlg.preTab ? dlg.preTab.btnPreGradient : null,
      allBtn: dlg.preTab ? dlg.preTab.btnPreGradientAll : null,
      syncFn: function() { if (dlg.syncPreGradientPanels) dlg.syncPreGradientPanels(optComboCanonicalItem(dlg.comboPreGradient)); }
   });

   // --- Pre Deconvolution combo (dispatch is label-based) ---
   // PARALLAX-INTEGRATION: Parallax is a canonical entry; visibility = installed && enabled.
   // Order comes from the single source of truth shared with the engine dispatch
   // (optPreDeconCanonicalEntries); here we only attach per-id installed flags.
   var deconInstById = { bxt: hasBXT, parallax: hasParallax, cc: hasCC };
   var deconEntries = optPreDeconCanonicalEntries();
   var deconInstalled = [];
   for (var di = 0; di < deconEntries.length; ++di) deconInstalled.push(deconInstById[deconEntries[di].id] === true);
   optWireFilterableCombo(dlg, {
      combo: dlg.comboPreDecon,
      menuId: "preDecon",
      entries: deconEntries,
      installed: deconInstalled,
      applyBtn: dlg.preTab ? dlg.preTab.btnPreApplyDecon : null,
      allBtn: dlg.preTab ? dlg.preTab.btnPreApplyDeconAll : null,
      syncFn: function() { if (dlg.syncPreDeconPanels) dlg.syncPreDeconPanels(dlg.comboPreDecon.currentItem); }
   });

   // --- Post Noise Reduction combo ---
   optWireFilterableCombo(dlg, {
      combo: dlg.comboPostNR,
      menuId: "postNR",
      entries: [
         { id: "nxt", label: "NoiseXTerminator" },
         { id: "tgv", label: "TGVDenoise" },
         { id: "cc", label: "Cosmic Clarity (Seti Astro)" },
         { id: "graxpert", label: "GraXpert Denoise" },
         { id: "prism", label: "Prism (SyQon)" },
         { id: "deepsnr", label: "DeepSNR" }
      ],
      installed: [hasNXT, hasTGV, hasCC, hasGraX, hasPrism, hasDeepSNR],
      applyBtn: dlg.postTab ? dlg.postTab.btnPostNR : null,
      syncFn: function() { if (dlg.syncPostNRPanels) dlg.syncPostNRPanels(optComboCanonicalItem(dlg.comboPostNR)); }
   });

   // --- Post Sharpening combo (dispatch is label-based) ---
   // PARALLAX-INTEGRATION: Parallax is a canonical entry; visibility = installed && enabled.
   // Order comes from the single source of truth shared with the engine dispatch
   // (optPostSharpCanonicalEntries); here we only attach per-id installed flags.
   var sharpInstById = { bxt: hasBXT, parallax: hasParallax, usm: true, hdr: true, lhe: true, dse: true, cc: hasCC };
   var sharpEntries = optPostSharpCanonicalEntries();
   var sharpInstalled = [];
   for (var si = 0; si < sharpEntries.length; ++si) sharpInstalled.push(sharpInstById[sharpEntries[si].id] === true);
   optWireFilterableCombo(dlg, {
      combo: dlg.comboPostSharp,
      menuId: "postSharp",
      entries: sharpEntries,
      installed: sharpInstalled,
      applyBtn: dlg.postTab ? dlg.postTab.btnPostSharp : null,
      syncFn: function() { if (dlg.syncPostSharpPanels) dlg.syncPostSharpPanels(dlg.comboPostSharp.currentItem); }
   });

   // --- Stretch RGB / STARLESS zone (dispatch reads zone.algorithmIds[idx]) ---
   wireStretchZone(dlg.stretchZoneRgb, "stretchStarless", [
      { prefId: "aghs",   id: "AGHS",   label: "AutoGHS",                         inst: true },
      { prefId: "stf",    id: "STF",    label: "Auto STF (Histogram Transform)", inst: true },
      { prefId: "mas",    id: "MAS",    label: "Multiscale Adaptive Stretch",     inst: hasMAS },
      { prefId: "ss",     id: "SS",     label: "Statistical Stretch",             inst: true },
      { prefId: "curves", id: "CURVES", label: "Curves",                          inst: true }
   ]);

   // --- Stretch STARS zone (AutoGHS default: the saturation-damped stretch looks best on stars) ---
   wireStretchZone(dlg.stretchZoneStars, "stretchStars", [
      { prefId: "aghs",   id: "AGHS",   label: "AutoGHS",                         inst: true },
      { prefId: "star",   id: "STAR",   label: "Star Stretch",                    inst: true },
      { prefId: "mas",    id: "MAS",    label: "Multiscale Adaptive Stretch",     inst: hasMAS },
      { prefId: "stf",    id: "STF",    label: "Auto STF (Histogram Transform)", inst: true },
      { prefId: "curves", id: "CURVES", label: "Curves",                          inst: true }
   ]);
}

