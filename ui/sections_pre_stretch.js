// ----- UI Builder ------------------------------------------------------------

/**
 * Builds the Crop section into the Pre Processing tab leftContent and wires
 * the preview viewport mouse hooks (onImageMousePress/Move/Release,
 * onOverlayPaint). Called from configurePreTab BEFORE the Plate Solving
 * section so the Crop section appears between Image Selection and Plate
 * Solving in the UI.
 *
 * Hooks are installed permanently (the Pre tab does not share these callback
 * slots with any other feature — only the Post tab's FAME mode does an
 * install/remove dance because it shares its preview across mask modes).
 */
function optBuildPreCropSection(dlg) {
   dlg.cropState = optCropInitState();

   dlg.__cropSection = dlg.preTab.addProcessSection("Crop", [], {
      info: "<p>Hold <b>SHIFT</b>+drag on the preview to draw a crop rectangle, or press <b>Auto-detect Edges</b>. Drag the handles to resize, the interior to move. <b>Apply</b> removes the area outside the rectangle. Astrometric metadata (WCS) is preserved automatically.</p>",
      build: function(body) {
         // Phase 5.3: themed Crop body (Flat pattern, DESIGN_SPEC §10.2).
         //   status pill -> [Auto-detect | Clear] -> toggle -> [Apply x2]
         optThemeApplyModuleBody(body);
         dlg.__cropStatusLabel = new Label(body);
         optThemeSetStatus(dlg.__cropStatusLabel, "● No selection", "pending");
         body.sizer.add(dlg.__cropStatusLabel);

         var rowDetect = new Control(body);
         rowDetect.sizer = new HorizontalSizer();
         rowDetect.sizer.spacing = Theme.s2;
         dlg.__btnCropAuto  = optButton(rowDetect, "Auto-detect", 0);
         dlg.__btnCropClear = optButton(rowDetect, "Clear",       0);
         optThemeApplyActionButton(dlg.__btnCropAuto);
         optThemeApplyActionButton(dlg.__btnCropClear);
         rowDetect.sizer.add(dlg.__btnCropAuto,  1);
         rowDetect.sizer.add(dlg.__btnCropClear, 1);
         body.sizer.add(rowDetect);

         dlg.__chkCropReAlign = new CheckBox(body);
         dlg.__chkCropReAlign.text = "Re-align after multi-crop";
         optApplyCheckBoxTooltip(dlg.__chkCropReAlign);
         optThemeApplyCheckBox(dlg.__chkCropReAlign);
         body.sizer.add(dlg.__chkCropReAlign);

         var rowApply = new Control(body);
         rowApply.sizer = new HorizontalSizer();
         rowApply.sizer.spacing = Theme.s2;
         dlg.__btnCropApplyCurrent = optButton(rowApply, "Apply Current", 0);
         dlg.__btnCropApplyAll     = optButton(rowApply, "Apply All",     0);
         optThemeApplyPrimaryActionButton(dlg.__btnCropApplyCurrent, false);
         optThemeApplyPrimaryActionButton(dlg.__btnCropApplyAll,     false);
         rowApply.sizer.add(dlg.__btnCropApplyCurrent, 1);
         rowApply.sizer.add(dlg.__btnCropApplyAll,     1);
         body.sizer.add(rowApply);

         // ---- Status / button-enablement refresh -----------------------------
         dlg.__cropUpdateStatus = function() {
            var r = dlg.cropState ? dlg.cropState.rect : null;
            if (r) {
               optThemeSetStatus(dlg.__cropStatusLabel,
                  "● " + r.width + " × " + r.height +
                  " px @ (" + r.x + ", " + r.y + ")", "ok");
            } else {
               optThemeSetStatus(dlg.__cropStatusLabel, "● No selection", "pending");
            }
            var hasRect = !!r;
            try { dlg.__btnCropApplyCurrent.enabled = hasRect; } catch (e1) {}
            try { dlg.__btnCropApplyAll.enabled     = hasRect; } catch (e2) {}
            try { dlg.__btnCropClear.enabled        = hasRect; } catch (e3) {}
         };
         dlg.__cropUpdateStatus();

         // ---- Auto-detect ----------------------------------------------------
         dlg.__btnCropAuto.onClick = function() {
            optSafeUi("Auto-detect crop edges", function() {
               var view = dlg.preTab.preview.currentView;
               if (!optSafeView(view))
                  throw new Error("Load an image into Pre Processing first.");
               var rect = optCropDetectImageEdges(view);
               if (!rect)
                  throw new Error("Could not auto-detect valid edges (image too small or no defect pixels).");
               dlg.cropState.rect = rect;
               dlg.__cropUpdateStatus();
               try { dlg.preTab.preview.preview.viewport.repaint(); } catch (eR) {}
               console.noteln("Crop: auto-detected " + rect.width + "x" + rect.height +
                              " @ (" + rect.x + "," + rect.y + ") on " + view.id);
            });
         };

         // ---- Clear ----------------------------------------------------------
         dlg.__btnCropClear.onClick = function() {
            optSafeUi("Clear crop selection", function() {
               dlg.cropState = optCropInitState();
               dlg.__cropUpdateStatus();
               try { dlg.preTab.preview.preview.viewport.repaint(); } catch (eR) {}
            });
         };

         // ---- Apply to Current (single view) ---------------------------------
         dlg.__btnCropApplyCurrent.onClick = function() {
            optSafeUi("Apply crop to current image", function() {
               var view = dlg.preTab.preview.currentView;
               if (!optSafeView(view))    throw new Error("No active image to crop.");
               if (!dlg.cropState.rect)   throw new Error("Draw or auto-detect a crop rectangle first.");
               var ok = optCropApplyToView(view, dlg.cropState.rect);
               if (!ok) throw new Error("Crop produced no change (rectangle equals the image, or view rejected).");
               // Refresh canonical preview because the underlying view changed dimensions.
               try { dlg.preTab.preview.render(view, true, dlg.preTab.preview.currentGradientView); } catch (eR) {}
               dlg.cropState = optCropInitState();
               dlg.__cropUpdateStatus();
               console.noteln("Crop: applied to " + view.id);
            });
         };

         // ---- Apply to All (visible slot buttons above the preview) ----------
         dlg.__btnCropApplyAll.onClick = function() {
            optSafeUi("Apply crop to all loaded images", function() {
               if (!dlg.cropState.rect) throw new Error("Draw or auto-detect a crop rectangle first.");
               var rect = dlg.cropState.rect;

               // Iterate the slot buttons displayed above the preview.
               // A button is visible only when its slot has been registered
               // in this tab's store (Process Separately, Combine, Process
               // RGB, SXT split, etc.). This matches the user's mental
               // model exactly: "crop the images whose buttons I see above
               // the preview" — independent of which input mode is
               // selected in Image Selection and independent of auto-
               // detected ghosts in hidden combos.
               // Dedup by view.id covers the rare case of the same view
               // registered under multiple keys.
               var seen = {};
               var views = [];
               var pathButtons = (dlg.preTab && dlg.preTab.preview && dlg.preTab.preview.pathButtons) || {};
               for (var key in pathButtons) {
                  if (!pathButtons.hasOwnProperty(key)) continue;
                  var btn = pathButtons[key];
                  if (!btn || btn.visible !== true) continue;
                  var rec = null;
                  try { rec = dlg.store.record(key); } catch (eR0) {}
                  if (!rec || !optSafeView(rec.view)) continue;
                  if (seen[rec.view.id]) continue;
                  seen[rec.view.id] = true;
                  views.push(rec.view);
               }
               if (views.length === 0)
                  throw new Error("No slot buttons are active above the preview. Load an image and click Process Separately, Combine, or Process RGB first.");

               var cropped = [], skipped = 0;
               for (var j = 0; j < views.length; ++j) {
                  if (optCropApplyToView(views[j], rect)) cropped.push(views[j]);
                  else skipped++;
               }
               console.noteln("Crop: applied to " + cropped.length + " view(s) (matching active slot buttons)" +
                              (skipped > 0 ? ", " + skipped + " skipped (no-op or invalid)" : ""));
               for (var c = 0; c < cropped.length; ++c)
                  console.writeln("  cropped: " + cropped[c].id);

               // Optional re-alignment (only meaningful with ≥ 2 successfully cropped views).
               if (dlg.__chkCropReAlign.checked && cropped.length >= 2) {
                  var ref  = cropped[0];
                  var rest = cropped.slice(1);
                  var res  = optCropReAlignViews(rest, ref);
                  console.noteln("Crop re-align: " + res.aligned + " aligned, " +
                                 res.failed + " failed");
                  // Swap-back: copy the corrected pixels (and matching WCS)
                  // from each "_registered" output INTO its original target
                  // view, then close the now-redundant aligned view. After
                  // this, the workflow continues with R, G, B, H (their
                  // original names and slot positions) but holding the
                  // sub-pixel-corrected pixel data. The workspace stays
                  // clean of "_registered" auxiliary views.
                  if (res.pairs && res.pairs.length > 0) {
                     var swapped = 0;
                     var closedNames = [];
                     for (var p = 0; p < res.pairs.length; ++p) {
                        var pair = res.pairs[p];
                        if (optCropSwapBackAlignedPixels(pair.target, pair.aligned)) swapped++;
                        closedNames.push(pair.aligned.id);
                        optCloseView(pair.aligned);
                     }
                     console.writeln("  swapped corrected pixels into originals: " + swapped + " view(s)");
                     console.writeln("  closed _registered views: " + closedNames.join(", "));
                  }
               }
               // Refresh canonical preview.
               var cur = dlg.preTab.preview.currentView;
               if (optSafeView(cur)) {
                  try { dlg.preTab.preview.render(cur, true, dlg.preTab.preview.currentGradientView); } catch (eR) {}
               }
               dlg.cropState = optCropInitState();
               dlg.__cropUpdateStatus();
            });
         };

         // ---- Viewport mouse + overlay hooks ---------------------------------
         var ctrl = dlg.preTab.preview.preview;

         ctrl.onOverlayPaint = function(g, sc, sx, sy) {
            // Skip if the cached rect doesn't fit the currently displayed image
            // (typical when the user loads a different-sized image afterwards).
            var v = dlg.preTab.preview.currentView;
            if (optSafeView(v) && dlg.cropState && dlg.cropState.rect &&
                !optCropRectFitsImage(dlg.cropState.rect, v.image.width, v.image.height))
               return;
            optCropPaintOverlay(g, dlg.cropState, sc, sx, sy,
                                ctrl.imageCoordScaleX, ctrl.imageCoordScaleY,
                                ctrl.viewport.width, ctrl.viewport.height);
         };

         ctrl.onImageMousePress = function(imgX, imgY, button, modifiers) {
            if (button !== OPT_MOUSE_LEFT) return false;
            if (!optSafeView(dlg.preTab.preview.currentView)) return false;
            var st = dlg.cropState;
            // SHIFT held → start a new selection (replaces any existing rect).
            if (modifiers & OPT_CROP_SHIFT_MODIFIER) {
               st.rect          = { x: imgX, y: imgY, width: 1, height: 1 };
               st.drawing       = true;
               st.dragMode      = "draw";
               st.dragStartImg  = { x: imgX, y: imgY };
               st.dragStartRect = null;
               dlg.__cropUpdateStatus();
               try { ctrl.viewport.repaint(); } catch (eR) {}
               return true;   // consume → prevents the default pan
            }
            // No SHIFT: if there's a rectangle, check handle / interior hit.
            if (st.rect) {
               var hit = optCropHitTest(st.rect, imgX, imgY, ctrl.scale,
                                        ctrl.imageCoordScaleX, ctrl.imageCoordScaleY);
               if (hit === OPT_CROP_HANDLE_INSIDE) {
                  st.dragMode      = "move";
                  st.dragHandle    = OPT_CROP_HANDLE_INSIDE;
                  st.dragStartImg  = { x: imgX, y: imgY };
                  st.dragStartRect = { x: st.rect.x, y: st.rect.y, width: st.rect.width, height: st.rect.height };
                  return true;
               }
               if (hit !== OPT_CROP_HANDLE_NONE) {
                  st.dragMode      = "resize";
                  st.dragHandle    = hit;
                  st.dragStartImg  = { x: imgX, y: imgY };
                  st.dragStartRect = { x: st.rect.x, y: st.rect.y, width: st.rect.width, height: st.rect.height };
                  return true;
               }
            }
            return false;  // let pan handle it
         };

         ctrl.onImageMouseMove = function(imgX, imgY, buttons, modifiers) {
            var st = dlg.cropState;
            if (!st.dragMode) return;
            var v = dlg.preTab.preview.currentView;
            if (!optSafeView(v)) return;
            var iw = v.image.width, ih = v.image.height;
            if (st.dragMode === "draw") {
               var x1 = Math.min(st.dragStartImg.x, imgX);
               var y1 = Math.min(st.dragStartImg.y, imgY);
               var x2 = Math.max(st.dragStartImg.x, imgX);
               var y2 = Math.max(st.dragStartImg.y, imgY);
               st.rect = optCropClampRect({ x: x1, y: y1, width: x2 - x1, height: y2 - y1 }, iw, ih);
            } else if (st.dragMode === "move") {
               var dx = imgX - st.dragStartImg.x;
               var dy = imgY - st.dragStartImg.y;
               var nx = Math.max(0, Math.min(iw - st.dragStartRect.width,  st.dragStartRect.x + dx));
               var ny = Math.max(0, Math.min(ih - st.dragStartRect.height, st.dragStartRect.y + dy));
               st.rect = { x: nx, y: ny, width: st.dragStartRect.width, height: st.dragStartRect.height };
            } else if (st.dragMode === "resize") {
               st.rect = optCropResizeFromHandle(st.dragStartRect, st.dragHandle, imgX, imgY, iw, ih);
            }
            dlg.__cropUpdateStatus();
            try { ctrl.viewport.repaint(); } catch (eR) {}
         };

         ctrl.onImageMouseRelease = function(imgX, imgY, button, modifiers) {
            var st = dlg.cropState;
            if (!st.dragMode) return;
            // Discard rectangles below the minimum size (e.g. accidental click).
            if (st.rect && (st.rect.width < OPT_CROP_MIN_SIZE || st.rect.height < OPT_CROP_MIN_SIZE))
               st.rect = null;
            st.dragMode      = "";
            st.dragHandle    = OPT_CROP_HANDLE_NONE;
            st.dragStartImg  = null;
            st.dragStartRect = null;
            st.drawing       = false;
            dlg.__cropUpdateStatus();
            try { ctrl.viewport.repaint(); } catch (eR) {}
         };
      }
   });
}

// ============================================================================
// <<< END CROP SECTION — v33-opt-9 — easy-rollback block >>>
// ============================================================================

// CONTINUUM-SUB-UI-BEGIN (helpers)
// UI layer for Continuum Subtraction. The automatic, hybrid engine lives in
// PI Workflow.js (optRunContinuumSubtractionAuto); the card is added inside
// configurePreTab (also marked CONTINUUM-SUB-UI). Both are gated by
// OPT_CONTINUUM_SUB_ENABLED; delete the two blocks to remove the feature.
// (No picker helpers needed — the engine auto-detects loaded channels.)
// CONTINUUM-SUB-UI-END (helpers)

PIWorkflowOptDialog.prototype.configurePreTab = function() {
   var dlg = this;
   this.prePlateSolved = false;
   // UI-MODE (F6): widgets toggled by applyUiMode. simpleOnly = CabraMagic + Intensity;
   // advancedOnly = Suggest Defaults + the "To Stretching" CTA (manual workflow only).
   this.preTab.simpleOnlyWidgets = [];
   this.preTab.advancedOnlyWidgets = [];

   // >>> Crop section (v33-opt-9) — between Image Selection and Plate Solving.
   // Single line to delete for full rollback of the Crop feature.
   optBuildPreCropSection(this);

   // CABRAMAGIC-UI-BEGIN (button): standalone one-click auto-process button, placed
   // BETWEEN Crop and Plate Solving so the user can crop first and CabraMagic acts on
   // the cropped image (it operates on the active Pre view). No section/menu — just the
   // button + an on-screen "working" banner. Rollback: OPT_CABRAMAGIC_ENABLED=false.
   if (typeof OPT_CABRAMAGIC_ENABLED === "undefined" || OPT_CABRAMAGIC_ENABLED) {
      var cabraBtn = optPrimaryButton(this.preTab.leftContent, "✨ CabraMagic — Auto Process", 0);
      optThemeApplyPrimaryCta(cabraBtn);
      optApplyExplicitTooltip(cabraBtn, "cabramagic.button");
      cabraBtn.onClick = function() { optSafeUi("CabraMagic", function() { dlg.runCabraMagic(); }); };
      this.preTab.leftContent.sizer.add(cabraBtn);
      this.preTab.btnCabraMagic = cabraBtn;
      // UI-MODE (F6): CabraMagic + intensity are SIMPLE-only; applyUiMode toggles these.
      this.preTab.simpleOnlyWidgets.push(cabraBtn);

      // RECIPE-ENGINE-UI (F5): intensity picker — modulates how strong the auto
      // finishing is. The analysis still decides object type and base settings.
      if (typeof OPT_RECIPE_INTENSITY !== "undefined") {
         var intItems = [], intIds = [];
         for (var ii = 0; ii < OPT_RECIPE_INTENSITY.length; ++ii) { intItems.push(OPT_RECIPE_INTENSITY[ii].name); intIds.push(OPT_RECIPE_INTENSITY[ii].id); }
         var cabraIntRow = optComboRow(this.preTab.leftContent, "Intensity", intItems, 100);
         dlg.cabraIntensity = intIds[0];   // "auto" — analysis unchanged
         cabraIntRow.combo.currentItem = 0;
         optApplyExplicitTooltip(cabraIntRow.combo, "cabramagic.intensity");
         cabraIntRow.combo.onItemSelected = function(idx) { dlg.cabraIntensity = intIds[idx] || "auto"; };
         dlg.comboCabraIntensity = cabraIntRow.combo;
         this.preTab.leftContent.sizer.add(cabraIntRow.row);
         this.preTab.simpleOnlyWidgets.push(cabraIntRow.row);
      }

      // ANALYSIS-DEFAULTS-UI-BEGIN (F6 v2): seed the MANUAL controls from the analysis of
      // the active Pre image (object type, star density, SNR) so the manual workflow starts
      // informed. Sets Star Reduction / Detail / Color Mixer widgets only — runs no process.
      // Rollback: OPT_ANALYSIS_DEFAULTS_ENABLED=false, or delete this block + the applier.
      if (typeof OPT_ANALYSIS_DEFAULTS_ENABLED === "undefined" || OPT_ANALYSIS_DEFAULTS_ENABLED) {
         var defBtn = optButton(this.preTab.leftContent, "Suggest Defaults from Image", 0);
         optThemeApplyActionButton(defBtn);
         optApplyExplicitTooltip(defBtn, "analysisDefaults.button");
         defBtn.onClick = function() { optSafeUi("Suggest Defaults", function() { dlg.applyAnalysisDefaults(); }); };
         this.preTab.leftContent.sizer.add(defBtn);
         this.preTab.btnAnalysisDefaults = defBtn;
         // UI-MODE (F6): seeds the manual (advanced) controls -> show only in Advanced.
         this.preTab.advancedOnlyWidgets.push(defBtn);
      }
      // ANALYSIS-DEFAULTS-UI-END
   }
   // CABRAMAGIC-UI-END (button)

   var preSolveSection = this.preTab.addProcessSection("Plate Solving", [{
      text: "Solve Image",
      stage: "Plate Solving",
      width: 130,
      action: function(tab, pane) {
         if (!pane.currentKey || !optSafeView(pane.currentView))
            throw new Error("Select a Pre-processing image first.");
         // Phase 5.2: themed status pill (pending/ok/error states).
         optThemeSetStatus(dlg.preSolveStatus,
            "● Solving… (" + pane.currentView.id + ")", "pending");
         optProcessEvents();
         dlg.prePlateSolved = optHasAstrometricSolution(pane.currentView);
         if (!dlg.prePlateSolved)
            dlg.prePlateSolved = optSolveAstrometryOnWindow(pane.currentView.window, "the current target");
         if (dlg.prePlateSolved) {
            dlg.store.markStage(pane.currentKey, "Plate Solving");
            optThemeSetStatus(dlg.preSolveStatus,
               "● Solved · " + pane.currentView.id, "ok");
         } else {
            optThemeSetStatus(dlg.preSolveStatus,
               "● Failed · " + pane.currentView.id, "error");
         }
         pane.refreshButtons();
         pane.render(pane.currentView, false);
      }
   }], {
      info: "<p>Plate solving provides the astrometric solution required by MGC, SPCC and RGB geometric correction.</p>",
      build: function(body) {
         // Phase 5.2: Status + Action pattern (DESIGN_SPEC §10.2). The body
         // is just the status pill; the "Solve Image" button lives at the
         // section level (added by addProcessSection above).
         optThemeApplyModuleBody(body);
         dlg.preSolveStatus = new Label(body);
         optThemeSetStatus(dlg.preSolveStatus, "● Not solved", "pending");
         body.sizer.add(dlg.preSolveStatus);
      }
   });
   // BATCH-APPLY-BEGIN (Plate Solving "Apply all": solve active + propagate WCS)
   this.preTab.btnPreSolveAll = optAddApplyAllButton(this.preTab, preSolveSection, function() {
      optSafeUi("Plate Solving (Apply all)", function() {
         var pane = dlg.preTab.preview;
         if (!pane.currentKey || !optSafeView(pane.currentView))
            throw new Error("Select a Pre-processing image first.");
         optThemeSetStatus(dlg.preSolveStatus,
            "● Solving… (" + pane.currentView.id + ")", "pending");
         optProcessEvents();
         dlg.prePlateSolved = optHasAstrometricSolution(pane.currentView);
         if (!dlg.prePlateSolved)
            dlg.prePlateSolved = optSolveAstrometryOnWindow(pane.currentView.window, "the current target");
         if (!dlg.prePlateSolved) {
            optThemeSetStatus(dlg.preSolveStatus,
               "● Failed · " + pane.currentView.id, "error");
            pane.refreshButtons();
            return;
         }
         dlg.store.markStage(pane.currentKey, "Plate Solving");
         var res = optPropagateAstrometricSolution(dlg, pane.currentView, pane.currentKey);
         var txt = "● Solved · " + pane.currentView.id;
         if (res.applied.length > 0)
            txt += " → propagated to " + res.applied.length;
         if (res.skipped.length > 0 || res.failed.length > 0)
            txt += " (" + (res.skipped.length + res.failed.length) + " skipped/failed, see console)";
         optThemeSetStatus(dlg.preSolveStatus, txt, "ok");
         pane.refreshButtons();
         pane.render(pane.currentView, false);
      });
   }, "applyAll.solve");
   // BATCH-APPLY-END

   var preGradientSection = this.preTab.addProcessSection("Gradient Correction", [{
      text: "Gradient Correction",
      stage: "Gradient Correction",
      actionKey: "gradient",
      name: "btnPreGradient",
      width: 170
   }, {
      // ===== COMPARE-BEGIN (button entry) =====
      text: "Compare",
      stage: "Compare Gradient Correction",
      name: "btnPreGradientCompare",
      width: 90,
      primary: false,
      action: function(tab, pane, btn) { optCompareGradientCorrection(tab.dialog); }
      // ===== COMPARE-END =====
   }], {
      info: "<p>Choose the background-correction engine and generate a candidate preview. External engines degrade safely when unavailable.</p>",
      build: function(body) {
         // Phase 5.4: themed Gradient Correction body (Subcards pattern,
         // DESIGN_SPEC §10.2). Full-width algorithm combo, then a stack
         // of algorithm-specific groups, each made of one or two subcards.
         optThemeApplyModuleBody(body);

         dlg.comboPreGradient = new ComboBox(body);
         dlg.comboPreGradient.addItem("MGC");
         dlg.comboPreGradient.addItem("AutoDBE (SetiAstro)");
         dlg.comboPreGradient.addItem("ABE");
         dlg.comboPreGradient.addItem("GraXpert");
         optThemeApplyChannelComboStyle(dlg.comboPreGradient);
         body.sizer.add(dlg.comboPreGradient);

         // --- MGC: 2 subcards (Gradient Model + Channel Multipliers) -------
         dlg.preMgcGroup = new Control(body);
         dlg.preMgcGroup.sizer = new VerticalSizer();
         dlg.preMgcGroup.sizer.margin = 0;
         dlg.preMgcGroup.sizer.spacing = Theme.s2;

         var mgcModel = optThemeBuildSubcard(dlg.preMgcGroup, "Gradient Model");
         dlg.comboMgcScale = { combo: new ComboBox(mgcModel) };
         ["128","256","512","1024","2048","4096","8192"].forEach(function(v){ dlg.comboMgcScale.combo.addItem(v); });
         dlg.comboMgcScale.combo.currentItem = 3;
         optThemeApplyChannelComboStyle(dlg.comboMgcScale.combo);
         dlg.comboMgcScale.row = dlg.comboMgcScale.combo;       // legacy alias
         dlg.comboMgcSep = { combo: new ComboBox(mgcModel) };
         ["1","2","3","4","5","6","7","8"].forEach(function(v){ dlg.comboMgcSep.combo.addItem(v); });
         dlg.comboMgcSep.combo.currentItem = 2;
         optThemeApplyChannelComboStyle(dlg.comboMgcSep.combo);
         dlg.comboMgcSep.row = dlg.comboMgcSep.combo;
         dlg.ncMgcSmoothness = optNumeric(mgcModel, "Smooth", 0.0, 10.0, 1.00, 2, 76);
         optThemeApplyNumericControl(dlg.ncMgcSmoothness);
         mgcModel.sizer.add(dlg.comboMgcScale.combo);
         mgcModel.sizer.add(dlg.comboMgcSep.combo);
         mgcModel.sizer.add(dlg.ncMgcSmoothness);
         dlg.preMgcGroup.sizer.add(mgcModel);

         var mgcMult = optThemeBuildSubcard(dlg.preMgcGroup, "Channel Multipliers");
         dlg.ncMgcScaleR = optNumeric(mgcMult, "R/K", 0.0, 5.0, 1.0000, 4, 60);
         dlg.ncMgcScaleG = optNumeric(mgcMult, "G",   0.0, 5.0, 1.0000, 4, 60);
         dlg.ncMgcScaleB = optNumeric(mgcMult, "B",   0.0, 5.0, 1.0000, 4, 60);
         optThemeApplyNumericControl(dlg.ncMgcScaleR);
         optThemeApplyNumericControl(dlg.ncMgcScaleG);
         optThemeApplyNumericControl(dlg.ncMgcScaleB);
         mgcMult.sizer.add(dlg.ncMgcScaleR);
         mgcMult.sizer.add(dlg.ncMgcScaleG);
         mgcMult.sizer.add(dlg.ncMgcScaleB);
         dlg.preMgcGroup.sizer.add(mgcMult);
         body.sizer.add(dlg.preMgcGroup);

         // --- AutoDBE: 1 subcard ------------------------------------------
         dlg.preAdbeGroup = new Control(body);
         dlg.preAdbeGroup.sizer = new VerticalSizer();
         dlg.preAdbeGroup.sizer.margin = 0;
         dlg.preAdbeGroup.sizer.spacing = Theme.s2;
         var adbeCard = optThemeBuildSubcard(dlg.preAdbeGroup, "AutoDBE");
         dlg.ncAdbePaths  = optNumeric(adbeCard, "Paths",     10, 200, 50, 0, 76);
         dlg.ncAdbeTol    = optNumeric(adbeCard, "Tolerance", 0.5, 5.0, 2.0, 2, 76);
         dlg.ncAdbeSmooth = optNumeric(adbeCard, "Smooth",    0.1, 0.8, 0.25, 2, 76);
         optThemeApplyNumericControl(dlg.ncAdbePaths);
         optThemeApplyNumericControl(dlg.ncAdbeTol);
         optThemeApplyNumericControl(dlg.ncAdbeSmooth);
         adbeCard.sizer.add(dlg.ncAdbePaths);
         adbeCard.sizer.add(dlg.ncAdbeTol);
         adbeCard.sizer.add(dlg.ncAdbeSmooth);
         dlg.preAdbeGroup.sizer.add(adbeCard);
         body.sizer.add(dlg.preAdbeGroup);

         // --- ABE: 1 subcard ----------------------------------------------
         dlg.preAbeGroup = new Control(body);
         dlg.preAbeGroup.sizer = new VerticalSizer();
         dlg.preAbeGroup.sizer.margin = 0;
         dlg.preAbeGroup.sizer.spacing = Theme.s2;
         var abeCard = optThemeBuildSubcard(dlg.preAbeGroup, "ABE");
         dlg.comboAbeCorrection = { combo: new ComboBox(abeCard) };
         dlg.comboAbeCorrection.combo.addItem("Subtraction");
         dlg.comboAbeCorrection.combo.addItem("Division");
         optThemeApplyChannelComboStyle(dlg.comboAbeCorrection.combo);
         dlg.comboAbeCorrection.row = dlg.comboAbeCorrection.combo;
         dlg.ncAbeFunctionDegree = optNumeric(abeCard, "Degree", 0, 8, 1, 0, 60);
         optThemeApplyNumericControl(dlg.ncAbeFunctionDegree);
         dlg.chkAbeNormalize = new CheckBox(abeCard);
         optI18nLabel(dlg.chkAbeNormalize, "Normalize");
         optApplyCheckBoxTooltip(dlg.chkAbeNormalize);
         optThemeApplyCheckBox(dlg.chkAbeNormalize);
         abeCard.sizer.add(dlg.comboAbeCorrection.combo);
         abeCard.sizer.add(dlg.ncAbeFunctionDegree);
         abeCard.sizer.add(dlg.chkAbeNormalize);
         dlg.preAbeGroup.sizer.add(abeCard);
         body.sizer.add(dlg.preAbeGroup);

         // --- GraXpert: 1 subcard -----------------------------------------
         dlg.preGraXpertGroup = new Control(body);
         dlg.preGraXpertGroup.sizer = new VerticalSizer();
         dlg.preGraXpertGroup.sizer.margin = 0;
         dlg.preGraXpertGroup.sizer.spacing = Theme.s2;
         var gxCard = optThemeBuildSubcard(dlg.preGraXpertGroup, "GraXpert");
         dlg.comboGraXpertCorrection = { combo: new ComboBox(gxCard) };
         dlg.comboGraXpertCorrection.combo.addItem("Subtraction");
         dlg.comboGraXpertCorrection.combo.addItem("Division");
         optThemeApplyChannelComboStyle(dlg.comboGraXpertCorrection.combo);
         dlg.comboGraXpertCorrection.row = dlg.comboGraXpertCorrection.combo;
         dlg.ncGraXpertSmoothing = optNumeric(gxCard, "Smooth", 0.0, 1.0, 0.82, 3, 76);
         optThemeApplyNumericControl(dlg.ncGraXpertSmoothing);
         gxCard.sizer.add(dlg.comboGraXpertCorrection.combo);
         gxCard.sizer.add(dlg.ncGraXpertSmoothing);
         dlg.preGraXpertGroup.sizer.add(gxCard);
         body.sizer.add(dlg.preGraXpertGroup);

         dlg.syncPreGradientPanels = function(idx) {
            dlg.preMgcGroup.visible      = idx === 0;
            dlg.preAdbeGroup.visible     = idx === 1;
            dlg.preAbeGroup.visible      = idx === 2;
            dlg.preGraXpertGroup.visible = idx === 3;
         };
         dlg.comboPreGradient.onItemSelected = function(idx) { dlg.syncPreGradientPanels(idx); };
         dlg.syncPreGradientPanels(0);
      }
   });
   // BATCH-APPLY-BEGIN (Gradient Correction "Apply all")
   this.preTab.btnPreGradientAll = optAddApplyAllButton(this.preTab, preGradientSection, function() {
      optSafeUi("Gradient Correction (Apply all)", function() {
         optRunPreApplyAll(dlg.preTab, dlg.preTab.preview, "gradient", "Gradient Correction");
      });
   }, "applyAll.gradient");
   // BATCH-APPLY-END

   // Phase 5.5: Color Calibration as Action-only flow (DESIGN_SPEC §10.2,
   // §10.3). Three big clickable action cards stacked vertically inside
   // the section body; the buttons array is empty so no native PushButton
   // is appended at the section level. Each card replicates the wireButton
   // logic that addProcessSection would have applied to the old buttons.
   this.__sectionPreColorCalibration = this.preTab.addProcessSection("Color Calibration", [{
      text: "Compare",
      stage: "Compare Color Calibration",
      name: "btnPreColorCalibrationCompare",
      width: 90,
      primary: false,
      action: function(tab, pane, btn) { optCompareColorCalibration(tab.dialog); }
   }], {
      info: "<p>Calibrate color balance using SPCC, Optimal Transport, Auto Linear Fit or Background Neutralization. Each action produces a candidate for Toggle and Use this Image.</p>",
      build: function(body, tab) {
         optThemeApplyModuleBody(body);

         // Eyebrow per spec §10.3: "Choose a method" header above the cards.
         var eyebrow = new Label(body);
         eyebrow.text = "CHOOSE A METHOD";
         try {
            eyebrow.styleSheet =
               "QLabel {" +
               " color: " + Theme.textDim + ";" +
               " background-color: transparent; border: 0px;" +
               " font-family: " + Theme.fontMono + ";" +
               " font-size: 8pt; font-weight: 600;" +
               " padding-top: 2px; padding-bottom: 4px;" +
               "}";
         } catch (eE) {}
         body.sizer.add(eyebrow);

         var paneRef = tab.preview;
         function runCC(stageName, actionKey) {
            optSafeUi(stageName, function() {
               paneRef.beginCandidate(stageName, function(candidate) {
                  return optApplyPreCandidate(candidate, actionKey, dlg);
               }, actionKey);
            });
         }

         var spccCard = optThemeBuildActionCard(body, {
            title: "SPCC",
            hint: "Photometric color calibration",
            toolTip: optTooltipTextByKey("button.SPCC") || "SPCC",
            isPrimary: true,
            iconLetter: "S",
            onClick: function() { runCC("Color Calibration (SPCC)", "spcc"); }
         });
         body.sizer.add(spccCard);
         dlg.preTab.btnPreSPCC = spccCard;        // legacy alias

         // SSSC-INTEGRATION-BEGIN (action card)
         var ssscCard = optThemeBuildActionCard(body, {
            title: "SSSC",
            hint: "Empirical — Gaia spectra, no filter curves",
            toolTip: optTooltipTextByKey("button.SSSC") || "SSSC",
            isPrimary: true,
            iconLetter: "C",
            onClick: function() { runCC("Color Calibration (SSSC)", "sssc"); }
         });
         body.sizer.add(ssscCard);
         dlg.preTab.btnPreSSSC = ssscCard;
         // SSSC-INTEGRATION-END (action card)

         var alfCard = optThemeBuildActionCard(body, {
            title: "Auto Linear Fit",
            hint: "Statistical white balance",
            toolTip: optTooltipTextByKey("button.Auto Linear Fit") || "Auto Linear Fit",
            iconLetter: "A",
            onClick: function() { runCC("Auto Linear Fit", "alf"); }
         });
         body.sizer.add(alfCard);
         dlg.preTab.btnPreALF = alfCard;

         // --- Optimal Transport ---
         var otGroup = new Control(body);
         otGroup.sizer = new VerticalSizer();
         otGroup.sizer.margin = 0;
         otGroup.sizer.spacing = Theme.s2;
         
         var otCard = optThemeBuildActionCard(otGroup, {
            title: "Optimal Transport",
            hint: "1D Wasserstein exact histogram match",
            toolTip: optTooltipTextByKey("button.Optimal Transport") || "Optimal Transport",
            iconLetter: "O",
            onClick: function() { runCC("Optimal Transport", "ot_match"); }
         });
         
         otGroup.sizer.add(otCard);
         body.sizer.add(otGroup);
         dlg.preTab.btnPreOT = otCard;

         var bnCard = optThemeBuildActionCard(body, {
            title: "Bkg. Neutralization",
            hint: "Subtracts background colour",
            toolTip: optTooltipTextByKey("button.Background Neutralization") || "Background Neutralization",
            iconLetter: "B",
            onClick: function() { runCC("Background Neutralization", "bn"); }
         });
         body.sizer.add(bnCard);
         dlg.preTab.btnPreBN = bnCard;
      }
   });

   var preDeconSection = this.preTab.addProcessSection("Deconvolution", [{
      text: "Deconvolution",
      stage: "Deconvolution",
      actionKey: "decon",
      name: "btnPreApplyDecon",
      width: 150
   }, {
      // ===== COMPARE-BEGIN (button entry) =====
      text: "Compare",
      stage: "Compare Deconvolution",
      name: "btnPreDeconCompare",
      width: 90,
      primary: false,
      action: function(tab, pane, btn) { optComparePreDeconvolution(tab.dialog); }
      // ===== COMPARE-END =====
   }], {
      info: "<p>BlurXTerminator and Cosmic Clarity settings. The optimized script keeps the same controls and creates a safe candidate preview for testing.</p>",
      build: function(body) {
         // Phase 5: redesigned Deconvolution body per DESIGN_SPEC §2.10.b.
         // Layout = Algorithm combo + 3 subcards (Stars / Nonstellar /
         // Output). Variable names (dlg.ncBxt*, dlg.chkBxt*, etc.) are
         // preserved verbatim so every state-management callsite keeps
         // working unchanged.
         optThemeApplyModuleBody(body);

         // Algorithm combo: no label row (subcard headers below carry the
         // context), full-width combo to maximise text room for the
         // "BlurXTerminator" / "Cosmic Clarity (SetiAstro)" item names.
         dlg.comboPreDecon = new ComboBox(body);
         dlg.comboPreDecon.addItem("BlurXTerminator");
         // PARALLAX-INTEGRATION-BEGIN (combo item — kept at index 1, after BXT)
         if (OPT_PRE_PARALLAX_ENABLED)
            dlg.comboPreDecon.addItem("Parallax (SyQon)");
         // PARALLAX-INTEGRATION-END (combo item)
         dlg.comboPreDecon.addItem("Cosmic Clarity (SetiAstro)");
         optThemeApplyChannelComboStyle(dlg.comboPreDecon);
         body.sizer.add(dlg.comboPreDecon);

         // BXT group: a Control hosting 3 themed subcards. Sub-cards switch
         // visibility together with the parent group via syncPreDeconPanels.
         dlg.preBxtGroup = new Control(body);
         dlg.preBxtGroup.sizer = new VerticalSizer();
         dlg.preBxtGroup.sizer.margin = 0;
         dlg.preBxtGroup.sizer.spacing = Theme.s2;

         // --- Subcard: STARS -----------------------------------------------
         var bxtStars = optThemeBuildSubcard(dlg.preBxtGroup, "Stars");
         // Shorter labels — subcard header "STARS" already carries context.
         dlg.ncBxtStars            = optNumeric(bxtStars, "Sharpen",     0.0, 1.0, 0.27, 2, 60);
         dlg.ncBxtAdjustStarHalos  = optNumeric(bxtStars, "Halos",      -1.0, 1.0, 0.00, 2, 60);
         optThemeApplyNumericControl(dlg.ncBxtStars);
         optThemeApplyNumericControl(dlg.ncBxtAdjustStarHalos);
         bxtStars.sizer.add(dlg.ncBxtStars);
         bxtStars.sizer.add(dlg.ncBxtAdjustStarHalos);
         dlg.preBxtGroup.sizer.add(bxtStars);

         // --- Subcard: NONSTELLAR ------------------------------------------
         var bxtNs = optThemeBuildSubcard(dlg.preBxtGroup, "Nonstellar");
         dlg.chkBxtAutoPSF         = new CheckBox(bxtNs);
         optI18nLabel(dlg.chkBxtAutoPSF, "Automatic PSF");
         dlg.chkBxtAutoPSF.checked = true;
         optApplyCheckBoxTooltip(dlg.chkBxtAutoPSF);
         optThemeApplyCheckBox(dlg.chkBxtAutoPSF);
         dlg.ncBxtPSFDiameter      = optNumeric(bxtNs, "PSF Ø",     0.0, 12.0, 4.0, 2, 60);
         dlg.ncBxtSharpenNonstellar = optNumeric(bxtNs, "Sharpen",      0.0,  1.0, 0.35, 2, 60);
         optThemeApplyNumericControl(dlg.ncBxtPSFDiameter);
         optThemeApplyNumericControl(dlg.ncBxtSharpenNonstellar);
         bxtNs.sizer.add(dlg.chkBxtAutoPSF);
         bxtNs.sizer.add(dlg.ncBxtPSFDiameter);
         bxtNs.sizer.add(dlg.ncBxtSharpenNonstellar);
         dlg.preBxtGroup.sizer.add(bxtNs);

         // --- Subcard: OUTPUT ---------------------------------------------
         var bxtOut = optThemeBuildSubcard(dlg.preBxtGroup, "Output");
         dlg.chkBxtCorrectOnly          = new CheckBox(bxtOut);
         optI18nLabel(dlg.chkBxtCorrectOnly, "Correlation Only");
         optApplyCheckBoxTooltip(dlg.chkBxtCorrectOnly);
         optThemeApplyCheckBox(dlg.chkBxtCorrectOnly);
         dlg.chkBxtLuminanceOnly        = new CheckBox(bxtOut);
         optI18nLabel(dlg.chkBxtLuminanceOnly, "Luminance Only");
         dlg.chkBxtLuminanceOnly.checked = true;
         optApplyCheckBoxTooltip(dlg.chkBxtLuminanceOnly);
         optThemeApplyCheckBox(dlg.chkBxtLuminanceOnly);
         bxtOut.sizer.add(dlg.chkBxtCorrectOnly);
         bxtOut.sizer.add(dlg.chkBxtLuminanceOnly);
         dlg.preBxtGroup.sizer.add(bxtOut);

         body.sizer.add(dlg.preBxtGroup);

         // PARALLAX-INTEGRATION-BEGIN (Pre Deconvolution group)
         // SyQon Parallax: 4 subcards mirroring the standalone script's UI.
         // Variable names dlg.*PreParallax* are read by optBuildPreParallaxConfigFromControls.
         if (OPT_PRE_PARALLAX_ENABLED) {
            dlg.preParallaxGroup = new Control(body);
            dlg.preParallaxGroup.sizer = new VerticalSizer();
            dlg.preParallaxGroup.sizer.margin = 0;
            dlg.preParallaxGroup.sizer.spacing = Theme.s2;

            // --- Subcard: PROCESSING STAGES ---------------------------------
            var plxStages = optThemeBuildSubcard(dlg.preParallaxGroup, "Processing Stages");
            // PARALLAX-MODE (v1.5): Natural (classic models) / Defined (aesthetics
            // models). Same labels as SyQon's own dialog. Read by
            // optBuildPreParallaxConfigFromControls -> --mode CLI flag.
            var plxModeRow = optComboRow(plxStages, "Model Style:", ["Natural", "Defined"], 60);
            dlg.comboPreParallaxMode = plxModeRow.combo;
            dlg.comboPreParallaxMode.currentItem = 0; // Natural (classic)
            optApplyExplicitTooltip(dlg.comboPreParallaxMode, "parallax.mode");
            dlg.chkPreParallaxCorrectAb = new CheckBox(plxStages);
            optI18nLabel(dlg.chkPreParallaxCorrectAb, "Correct Aberration");
            dlg.chkPreParallaxCorrectAb.checked = true;
            optApplyExplicitTooltip(dlg.chkPreParallaxCorrectAb, "parallax.correctAberration");
            optThemeApplyCheckBox(dlg.chkPreParallaxCorrectAb);
            dlg.ncPreParallaxStarReduction = optNumeric(plxStages, "Star Reduction", 0, 6, 3, 0, 60);
            dlg.ncPreParallaxSharpen       = optNumeric(plxStages, "Sharpen",        0.0, 1.0, 0.80, 2, 60);
            optThemeApplyNumericControl(dlg.ncPreParallaxStarReduction);
            optThemeApplyNumericControl(dlg.ncPreParallaxSharpen);
            optApplyNumericTooltipKey(dlg.ncPreParallaxStarReduction, "parallax.starReduction");
            optApplyNumericTooltipKey(dlg.ncPreParallaxSharpen, "parallax.sharpen");
            plxStages.sizer.add(plxModeRow.row);
            plxStages.sizer.add(dlg.chkPreParallaxCorrectAb);
            plxStages.sizer.add(dlg.ncPreParallaxStarReduction);
            plxStages.sizer.add(dlg.ncPreParallaxSharpen);
            dlg.preParallaxGroup.sizer.add(plxStages);

            // --- Subcard: MODEL SETTINGS ------------------------------------
            var plxModel = optThemeBuildSubcard(dlg.preParallaxGroup, "Model Settings");
            dlg.ncPreParallaxTileSize = optNumeric(plxModel, "Tile Size", 128, 2048, 512, 0, 60);
            dlg.ncPreParallaxOverlap  = optNumeric(plxModel, "Overlap",   8,   512,  128, 0, 60);
            dlg.ncPreParallaxPad      = optNumeric(plxModel, "Pad",       0,   2048, 512, 0, 60);
            optThemeApplyNumericControl(dlg.ncPreParallaxTileSize);
            optThemeApplyNumericControl(dlg.ncPreParallaxOverlap);
            optThemeApplyNumericControl(dlg.ncPreParallaxPad);
            optApplyNumericTooltipKey(dlg.ncPreParallaxTileSize, "parallax.tileSize");
            optApplyNumericTooltipKey(dlg.ncPreParallaxOverlap, "parallax.overlap");
            optApplyNumericTooltipKey(dlg.ncPreParallaxPad, "parallax.pad");
            plxModel.sizer.add(dlg.ncPreParallaxTileSize);
            plxModel.sizer.add(dlg.ncPreParallaxOverlap);
            plxModel.sizer.add(dlg.ncPreParallaxPad);
            dlg.preParallaxGroup.sizer.add(plxModel);

            // "Linear Data Stretch" and "Performance" subcards removed 2026-06-18 — managed
            // internally (Pre: temp MTF stretch always on, median 0.15, unlinked; GPU with
            // automatic CPU fallback). See optBuildPreParallaxConfigFromControls /
            // optRunSyQonParallaxOnView.
            body.sizer.add(dlg.preParallaxGroup);
         }
         // PARALLAX-INTEGRATION-END (Pre Deconvolution group)

         // Cosmic Clarity group: single subcard (5 controls, no sub-grouping).
         dlg.preCCSharpGroup = new Control(body);
         dlg.preCCSharpGroup.sizer = new VerticalSizer();
         dlg.preCCSharpGroup.sizer.margin = 0;
         dlg.preCCSharpGroup.sizer.spacing = Theme.s2;
         var ccCard = optThemeBuildSubcard(dlg.preCCSharpGroup, "Cosmic Clarity Sharpening");
         // Mode combo as full-width row (no label — subcard header carries it).
         dlg.comboPreCCSharpenMode = { combo: new ComboBox(ccCard) };
         dlg.comboPreCCSharpenMode.combo.addItem("Both (Stellar + Non-Stellar)");
         dlg.comboPreCCSharpenMode.combo.addItem("Stellar Only");
         dlg.comboPreCCSharpenMode.combo.addItem("Non-Stellar Only");
         optThemeApplyChannelComboStyle(dlg.comboPreCCSharpenMode.combo);
         // This combo is built without optComboRow because the subcard header
         // ("Cosmic Clarity Sharpening") already labels the section. Apply
         // the Cosmic Clarity-specific tooltip explicitly so the lookup
         // does not fall back to the generic ComboBox text.
         optApplyExplicitTooltip(dlg.comboPreCCSharpenMode.combo, "combo.Targets:");
         // The .row property is kept for legacy callers that expect it; expose
         // the combo itself so the same wiring works.
         dlg.comboPreCCSharpenMode.row = dlg.comboPreCCSharpenMode.combo;
         dlg.ncPreCCStellarAmt  = optNumeric(ccCard, "Stellar",  0.0, 1.0, 0.90, 2, 60);
         dlg.ncPreCCNSStrength  = optNumeric(ccCard, "Ns. Size", 1.0, 8.0, 3.0, 1, 60);
         dlg.ncPreCCNSAmount    = optNumeric(ccCard, "Ns. Amt",  0.0, 1.0, 0.50, 2, 60);
         optThemeApplyNumericControl(dlg.ncPreCCStellarAmt);
         optThemeApplyNumericControl(dlg.ncPreCCNSStrength);
         optThemeApplyNumericControl(dlg.ncPreCCNSAmount);
         dlg.chkPreCCRemoveAb = new CheckBox(ccCard);
         dlg.chkPreCCRemoveAb.text = "Remove Aberration First";
         optApplyCheckBoxTooltip(dlg.chkPreCCRemoveAb);
         optThemeApplyCheckBox(dlg.chkPreCCRemoveAb);
         ccCard.sizer.add(dlg.comboPreCCSharpenMode.row);
         ccCard.sizer.add(dlg.ncPreCCStellarAmt);
         ccCard.sizer.add(dlg.ncPreCCNSStrength);
         ccCard.sizer.add(dlg.ncPreCCNSAmount);
         ccCard.sizer.add(dlg.chkPreCCRemoveAb);
         dlg.preCCSharpGroup.sizer.add(ccCard);
         body.sizer.add(dlg.preCCSharpGroup);

         dlg.syncPreDeconPanels = function(idx) {
            // Match by item label so the panel mapping is independent of whether
            // the Parallax item is present (OPT_PRE_PARALLAX_ENABLED).
            var lbl = "";
            try { lbl = dlg.comboPreDecon.itemText(idx); } catch (eLbl) {}
            var isCC = /cosmic/i.test(lbl);
            var isParallax = /parallax/i.test(lbl);
            dlg.preBxtGroup.visible = !isCC && !isParallax;
            dlg.preCCSharpGroup.visible = isCC;
            if (dlg.preParallaxGroup)
               dlg.preParallaxGroup.visible = isParallax;
            if (optHasOwn(dlg.preTab, "btnPreApplyDecon") && dlg.preTab.btnPreApplyDecon)
               dlg.preTab.btnPreApplyDecon.text = "Deconvolution";
         };
         dlg.comboPreDecon.onItemSelected = function(idx) { dlg.syncPreDeconPanels(idx); };
         dlg.syncPreDeconPanels(0);
      }
   });
   // BATCH-APPLY-BEGIN (Deconvolution "Apply all")
   this.preTab.btnPreApplyDeconAll = optAddApplyAllButton(this.preTab, preDeconSection, function() {
      optSafeUi("Deconvolution (Apply all)", function() {
         optRunPreApplyAll(dlg.preTab, dlg.preTab.preview, "decon", "Deconvolution");
      });
   }, "applyAll.decon");
   // BATCH-APPLY-END

   // CONTINUUM-SUB-UI-BEGIN (Pre operations card)
   if (OPT_CONTINUUM_SUB_ENABLED) {
      this.preTab.addProcessSection("Continuum Subtraction", [{
         text: "Run Continuum Subtraction",
         stage: "Continuum Subtraction",
         name: "btnRunContinuumSub",   // exposed for the i18n tooltip wiring below
         width: 230,
         action: function(tab, pane, btn) {
            var d = tab.dialog;
            optThemeSetStatus(d.csStatus, "● Working… (removing stars + subtracting)", "pending");
            optProcessEvents();
            var r = optRunContinuumSubtractionAuto(d);
            var msg = "";
            if (r.created.length > 0)
               msg += "✓ " + r.created.length + " emission map(s): " + r.created.join("; ");
            if (r.skipped.length > 0)
               msg += (msg ? "  ·  " : "") + "skipped: " + r.skipped.join("; ");
            if (r.created.length === 0 && r.skipped.length === 0)
               msg = "Nothing to do — load narrowband lines (H/O/S) and a broadband continuum first.";
            // Compact targets are subtracted WITH stars (star removal would eat the compact
            // HII structure), so they keep star halos/dark rings — warn the user visibly.
            var hasCompact = r.compact && r.compact.length > 0;
            if (hasCompact)
               msg += "  ·  ⚠ " + r.compact.join(", ") + ": compact target — subtracted WITH stars, so star halos (dark rings) are expected. Remove/handle stars separately.";
            var level = (r.created.length === 0) ? "error" : (hasCompact ? "pending" : "ok");
            optThemeSetStatus(d.csStatus, "● " + msg, level);
            if (r.created.length > 0 && d.preTab && d.preTab.preview) {
               // Focus the first new emission map so its new slot chip is visible.
               var firstOut = r.created[0].indexOf("H_CS") >= 0 ? "H_CS" :
                              (r.created[0].indexOf("O_CS") >= 0 ? "O_CS" : "S_CS");
               try { d.preTab.preview.activate(firstOut, true); } catch (eAct) {}
            }
         }
      }], {
         info: "<p><b>Continuum Subtraction</b> (automatic, hybrid). Isolates the pure " +
            "emission-line signal by subtracting a scaled broadband continuum: " +
            "<i>Emission = Line &minus; k&middot;Continuum</i>.</p>" +
            "<p>One click does everything: it detects every loaded narrowband line " +
            "(<b>Ha / OIII / SII</b>), pairs each with its broadband continuum channel " +
            "(Ha&rarr;R, OIII&rarr;G, SII&rarr;R, from a loaded RGB or separate R/G/B), " +
            "derives <b>k</b> automatically from common star fluxes, removes the stars from " +
            "both (StarXTerminator / StarNet2 / SyQon) and subtracts on the starless pair " +
            "so no per-star colour residual is left.</p>" +
            "<p><b>Compact targets</b> (galaxies / HII knots, high concentration index) are " +
            "subtracted <b>with stars kept</b> — star removal would eat the compact structure — " +
            "so they show <b>star halos (dark rings)</b> by design. Remove or handle those stars " +
            "separately for compact objects.</p>" +
            "<p>Each result appears as a new <b>H&nbsp;CS / O&nbsp;CS / S&nbsp;CS</b> slot " +
            "chip (and image window) ready to take into Stretching.</p>",
         build: function(body, tab) {
            var d = tab.dialog;
            optThemeApplyModuleBody(body);
            d.csStatus = new Label(body);
            optThemeSetStatus(d.csStatus, "● Idle — load H/O/S + a broadband continuum, then run", "pending");
            try { d.csStatus.wordWrapping = true; } catch (eWW) {}
            body.sizer.add(d.csStatus);
         }
      });
      // i18n tooltip (EN/ES via cs.run key); retranslates on live language toggle.
      try { optApplyExplicitTooltip(this.preTab.btnRunContinuumSub, "cs.run"); } catch (eCsTt) {}
   }
   // CONTINUUM-SUB-UI-END

   // Phase 4h: primary CTA, full-width, amber gradient (§2.15).
   this.btnToStretch = optPrimaryButton(this.preTab.leftContent, "To Stretching", 0);
   optThemeApplyPrimaryCta(this.btnToStretch);
   this.btnToStretch.onClick = function() { optSafeUi("To Stretching", function() { dlg.sendActiveToStretch(); }); };
   this.preTab.leftContent.sizer.add(this.btnToStretch);
   // UI-MODE (F6): the manual "To Stretching" hand-off is not needed in Simple (CabraMagic
   // runs the whole pipeline) -> show it only in Advanced.
   this.preTab.advancedOnlyWidgets.push(this.btnToStretch);
   this.preTab.leftContent.sizer.addStretch();
};

PIWorkflowOptDialog.prototype.configureStretchTab = function() {
   var dlg = this;
   var sxt = optSection(this.stretchTab.leftContent, "Star Split");
   this.stretchTab.registerSection(sxt);
   // Saved for sendActiveToStretch, which re-expands this section after
   // the auto Pre → Stretch transition so the user lands directly on
   // the "Split Stars" CTA instead of a fully-collapsed left panel.
   this.stretchTab.starSplitSection = sxt;

   // ===== STARNET2-BEGIN — easy-rollback block (v137 dual-engine) =====
   // Algorithm selector. Default item is StarXTerminator (idx 0); the
   // alternative is StarNet2 (idx 1). The engine is chosen at runtime
   // inside createStarSplit so only the selected branch executes.
   var rowAlgo = optComboRow(sxt.body, "Algorithm:", ["StarXTerminator (SXT)", "StarNet2", "SyQon Starless"], 80);
   this.comboStarSplitAlgo = rowAlgo.combo;
   sxt.body.sizer.add(rowAlgo.row);

   // SXT parameter group: only Overlap is exposed (default 0.20).
   this.starSplitSxtGroup = optInnerGroup(sxt.body, "StarXTerminator Settings");
   this.ncStarSplitOverlap = optNumeric(this.starSplitSxtGroup, "Overlap:", 0.05, 0.75, 0.20, 2, 120);
   this.starSplitSxtGroup.sizer.add(this.ncStarSplitOverlap);
   sxt.body.sizer.add(this.starSplitSxtGroup);

   // StarNet2 parameter group: only Stride and 2x upsample exposed.
   // The remaining StarNet2 properties (linear=true, mask=false,
   // unscreen=true, shadows_clipping=-2.80, target_background=0.25)
   // are fixed at engine-call time and intentionally hidden from the
   // user to keep the panel small and the workflow opinionated.
   this.starSplitSn2Group = optInnerGroup(sxt.body, "StarNet2 Settings");
   var rowStride = optComboRow(this.starSplitSn2Group, "Stride:", ["Large", "Standard", "Small"], 120);
   this.comboStarSplitStride = rowStride.combo;
   try { this.comboStarSplitStride.currentItem = 1; } catch (eStr0) {}   // default Standard
   this.chkStarSplitUpsample = new CheckBox(this.starSplitSn2Group);
   this.chkStarSplitUpsample.text = "2x upsample";
   optApplyCheckBoxTooltip(this.chkStarSplitUpsample);
   this.starSplitSn2Group.sizer.add(rowStride.row);
   this.starSplitSn2Group.sizer.add(this.chkStarSplitUpsample);
   sxt.body.sizer.add(this.starSplitSn2Group);

   // SYQON-STARLESS-INTEGRATION-BEGIN
   // SYQON-STARLESS-V3: the Axiom V3 SyQonStarless.exe CLI only understands
   // -v (overlap, default 64) and -d (device Auto/GPU/CPU); the old Python CLI
   // controls (Tile/Pad/AMP/AMP type/Force CPU/Disable DirectML) no longer
   // exist on the binary, so they were removed from the panel. The exe runs
   // headless (no --gui), so no SyQon window appears during the split.
   this.starSplitSyQonGroup = optInnerGroup(sxt.body, "SyQon Starless Settings");
   this.ncStarSplitSyQonOverlap = optNumeric(this.starSplitSyQonGroup, "Overlap:", 8, 512, 64, 0, 100);

   var deviceRowObj = optComboRow(this.starSplitSyQonGroup, "Device:", ["Auto", "GPU", "CPU"], 100);
   this.comboStarSplitSyQonDevice = deviceRowObj.combo;
   this.comboStarSplitSyQonDevice.currentItem = 0; // Auto
   optApplyExplicitTooltip(this.comboStarSplitSyQonDevice, "starless.device");

   var starsModeRowObj = optComboRow(this.starSplitSyQonGroup, "Stars Mode:", ["None", "Subtraction", "Unscreen"], 100);
   this.comboStarSplitSyQonStarsMode = starsModeRowObj.combo;
   this.comboStarSplitSyQonStarsMode.currentItem = 2; // Unscreen
   optApplyExplicitTooltip(this.comboStarSplitSyQonStarsMode, "starless.starsOnlyMode");

   this.starSplitSyQonGroup.sizer.add(this.ncStarSplitSyQonOverlap);
   this.starSplitSyQonGroup.sizer.add(deviceRowObj.row);
   this.starSplitSyQonGroup.sizer.add(starsModeRowObj.row);

   optApplyExplicitTooltip(this.ncStarSplitSyQonOverlap, "starless.overlap");
   try {
      var ttOv = optTooltipTextByKey("starless.overlap");
      if (ttOv) {
         this.ncStarSplitSyQonOverlap.label.toolTip = ttOv;
         this.ncStarSplitSyQonOverlap.slider.toolTip = ttOv;
      }
   } catch(e) {}

   sxt.body.sizer.add(this.starSplitSyQonGroup);
   // SYQON-STARLESS-INTEGRATION-END

   // Sync parameter-group visibility with the algorithm combo. Hooks
   // into optUpdateStarSplitButtonState so the Split Stars button
   // reflects availability of the currently selected engine.
   this.syncStarSplitPanels = function(idx) {
      try { dlg.starSplitSxtGroup.visible = idx === 0; } catch (eS0) {}
      try { dlg.starSplitSn2Group.visible = idx === 1; } catch (eS1) {}
      try { dlg.starSplitSyQonGroup.visible = idx === 2; } catch (eS1_2) {}
      try { optUpdateStarSplitButtonState(dlg); } catch (eS2) {}
   };
   this.comboStarSplitAlgo.onItemSelected = function(idx) { dlg.syncStarSplitPanels(idx); };
   this.syncStarSplitPanels(0);   // initial: SXT selected
   // ===== STARNET2-END =====

   // Primary CTA: runs the selected engine. Action label stays in
   // English for tooltip lookup and console messages. The CTA shares a
   // horizontal row with the secondary Compare button so both Star
   // Split engines can be benchmarked side by side in one click.
   var ssRow = new Control(sxt.body);
   ssRow.sizer = new HorizontalSizer();
   ssRow.sizer.spacing = 5;
   this.btnCreateStarSplit = optPrimaryButton(ssRow, "Split Stars", 0);
   optThemeApplyPrimaryCta(this.btnCreateStarSplit);
   this.btnCreateStarSplit.onClick = function() { optSafeUi("Split Stars", function() { dlg.createStarSplit(); }); };
   // ===== COMPARE-BEGIN — Star Split Compare button =====
   this.btnCreateStarSplitCompare = optButton(ssRow, "Compare", 0);
   optThemeApplyActionButton(this.btnCreateStarSplitCompare);
   optApplyExplicitTooltip(this.btnCreateStarSplitCompare, "button.Compare");
   this.btnCreateStarSplitCompare.onClick = function() {
      optSafeUi("Compare Star Split", function() { optCompareStarSplit(dlg); });
   };
   // ===== COMPARE-END =====
   ssRow.sizer.add(this.btnCreateStarSplit, 1);
   ssRow.sizer.add(this.btnCreateStarSplitCompare, 1);
   sxt.body.sizer.add(ssRow);
   // BATCH-APPLY-BEGIN (Star Split "Apply all" button)
   this.btnStarSplitAll = optAddApplyAllButton(this.stretchTab, sxt, function() {
      optSafeUi("Star Split (Apply all)", function() { dlg.runStarSplitApplyAll(); });
   }, "applyAll.starSplit");
   // BATCH-APPLY-END (Star Split "Apply all" button)
   this.stretchTab.leftContent.sizer.add(sxt.bar);
   this.stretchTab.leftContent.sizer.add(sxt.body);

   this.stretchZoneRgb = optBuildStretchZone(this.stretchTab, "RGB / STARLESS", false);
   this.stretchZoneStars = optBuildStretchZone(this.stretchTab, "STARS", true);
   this.stretchTab.registerSection(this.stretchZoneRgb.section);
   this.stretchTab.registerSection(this.stretchZoneStars.section);
   this.buildStretchCurvesWidget();

   this.stretchTab.leftContent.sizer.addStretch();
};

PIWorkflowOptDialog.prototype.buildStretchCurvesWidget = function() {
   var dlg = this;
   this.stretchCurvesLabel = optInfoLabel(this.stretchTab.preview.control, "Curves: left click adds/drags points, right click removes points.");
   this.stretchCurvesWidget = new Control(this.stretchTab.preview.control);
   this.stretchCurvesWidget.setFixedHeight(190);
   this.stretchCurvesWidget.cursor = new Cursor(StdCursor_Cross);
   this.stretchCurvesWidget.__zone = null;
   this.stretchCurvesWidget.__hist = null;
   this.stretchCurvesWidget.__pts = [[0, 0], [1, 1]];
   this.stretchCurvesWidget.__dragging = -1;
   this.stretchCurvesWidget.__hoverIdx = -1;
   this.stretchCurvesWidget.__pointRadius = 5;
   this.stretchCurvesWidget.xToCanvas = function(x) { var m = 10; return m + x * (this.width - 2 * m); };
   this.stretchCurvesWidget.yToCanvas = function(y) { var m = 10; return (this.height - m) - y * (this.height - 2 * m); };
   this.stretchCurvesWidget.canvasToX = function(x) { var m = 10; return (x - m) / Math.max(1, this.width - 2 * m); };
   this.stretchCurvesWidget.canvasToY = function(y) { var m = 10; return ((this.height - m) - y) / Math.max(1, this.height - 2 * m); };
   this.stretchCurvesWidget.findNearest = function(x, y) {
      var pts = this.__pts || [[0, 0], [1, 1]];
      var best = 15 * 15, idx = -1;
      for (var i = 0; i < pts.length; ++i) {
         var px = this.xToCanvas(pts[i][0]);
         var py = this.yToCanvas(pts[i][1]);
         var d = (x - px) * (x - px) + (y - py) * (y - py);
         if (d < best) { best = d; idx = i; }
      }
      return idx;
   };
   this.stretchCurvesWidget.onPaint = function() {
      var g = new Graphics(this);
      try {
         var w = this.width, h = this.height, m = 10, cw = w - 2 * m, ch = h - 2 * m;
         // Phase 6 theme: surface bg, subtle white grid, amber curve.
         g.fillRect(0, 0, w, h, new Brush(optThemeColorInt("surface")));
         g.pen = new Pen(optThemeColorInt("border"), 1);
         for (var gi = 0; gi <= 4; ++gi) {
            g.drawLine(m + gi * cw / 4, m, m + gi * cw / 4, h - m);
            g.drawLine(m, h - m - gi * ch / 4, w - m, h - m - gi * ch / 4);
         }
         g.pen = new Pen(optThemeColorInt("borderStrong"), 1);
         g.drawRect(m, m, w - m, h - m);
         var zone = this.__zone;
         var key = zone && zone.curvesChan ? (["K", "R", "G", "B", "S"][zone.curvesChan.combo.currentItem] || "K") : "K";
         var hist = this.__hist;
         if (hist) {
            var chans = key === "K" ? ["R", "G", "B"] : [key];
            var colors = { R: 0x60ff4444, G: 0x6044ff44, B: 0x604488ff, S: 0x60ffaa00, K: 0x60dddddd };
            var maxCount = 1;
            for (var c = 0; c < chans.length; ++c) {
               var data = hist[chans[c]] || hist.K;
               for (var bi = 0; data && bi < data.length; ++bi)
                  if (data[bi] > maxCount) maxCount = data[bi];
            }
            for (var c2 = 0; c2 < chans.length; ++c2) {
               var ck = chans[c2], d = hist[ck] || hist.K;
               if (!d) continue;
               g.pen = new Pen(colors[ck] || 0x60dddddd, 1);
               for (var bj = 1; bj < d.length - 1; ++bj) {
                  var bx = m + (bj / (d.length - 1)) * cw;
                  var bh = (d[bj] / maxCount) * ch * 0.85;
                  g.drawLine(bx, h - m, bx, h - m - bh);
               }
            }
         } else {
            g.pen = new Pen(optThemeColorInt("textMuted"), 1);
            g.drawTextRect(new Rect(m, m, w - m, h - m), "Histogram", TextAlign_Center | TextAlign_VertCenter);
         }
         var dashInt = optThemeColorInt("textDim");
         try { g.pen = new Pen(dashInt, 1, PenStyle_Dash); } catch (eDash) { g.pen = new Pen(dashInt, 1); }
         g.drawLine(m, h - m, w - m, m);
         var pts = this.__pts || [[0, 0], [1, 1]];
         var lut = optAkimaInterpolate(pts, 512);
         g.antialiasing = true;
         g.pen = new Pen(optThemeColorInt("amber"), 2);
         for (var si = 1; si < lut.length; ++si)
            g.drawLine(m + ((si - 1) / (lut.length - 1)) * cw, h - m - lut[si - 1] * ch, m + (si / (lut.length - 1)) * cw, h - m - lut[si] * ch);
         var pointFill   = optThemeColorInt("amber");
         var pointHover  = optThemeColorInt("amberBright");
         var pointBorder = optThemeColorInt("surface");
         for (var pi = 0; pi < pts.length; ++pi) {
            var px = this.xToCanvas(pts[pi][0]), py = this.yToCanvas(pts[pi][1]), rr = this.__pointRadius;
            g.pen = new Pen(pointBorder, 2);
            g.brush = new Brush(pi === this.__hoverIdx ? pointHover : pointFill);
            g.fillRect(px - rr, py - rr, px + rr, py + rr, g.brush);
            g.drawRect(px - rr, py - rr, px + rr, py + rr);
         }
      } finally {
         try { g.end(); } catch (e0) {}
      }
   };
   this.stretchCurvesWidget.onMousePress = function(x, y, button) {
      var zone = this.__zone;
      if (!zone)
         return;
      var idxKey = zone.curvesChan ? zone.curvesChan.combo.currentItem : 0;
      var key = ["K", "R", "G", "B", "S"][idxKey] || "K";
      var pts = zone.curvesPoints[key] || [[0, 0], [1, 1]];
      if (button === OPT_MOUSE_LEFT) {
         var idx = this.findNearest(x, y);
         if (idx < 0) {
            var nx = optClamp01(this.canvasToX(x)), ny = optClamp01(this.canvasToY(y));
            pts.push([nx, ny]);
            pts.sort(function(a, b) { return a[0] - b[0]; });
            idx = this.findNearest(x, y);
         }
         zone.curvesManual = true;
         zone.curvesPoints[key] = pts;
         this.__pts = pts;
         this.__dragging = idx;
         this.repaint();
      } else if (button === OPT_MOUSE_RIGHT) {
         var ridx = this.findNearest(x, y);
         if (ridx > 0 && ridx < pts.length - 1) {
            pts.splice(ridx, 1);
            zone.curvesManual = true;
            zone.curvesPoints[key] = pts;
            this.__pts = pts;
            this.repaint();
            zone.scheduleCurvesLive(160);
         }
      }
   };
   this.stretchCurvesWidget.onMouseMove = function(x, y) {
      var zone = this.__zone;
      if (!zone)
         return;
      var idxKey = zone.curvesChan ? zone.curvesChan.combo.currentItem : 0;
      var key = ["K", "R", "G", "B", "S"][idxKey] || "K";
      var pts = zone.curvesPoints[key] || [[0, 0], [1, 1]];
      if (this.__dragging >= 0 && this.__dragging < pts.length) {
         var di = this.__dragging, ny = optClamp01(this.canvasToY(y));
         if (di === 0 || di === pts.length - 1)
            pts[di][1] = ny;
         else {
            pts[di][0] = Math.max(pts[di - 1][0] + 0.005, Math.min(pts[di + 1][0] - 0.005, optClamp01(this.canvasToX(x))));
            pts[di][1] = ny;
         }
         zone.curvesPoints[key] = pts;
         this.__pts = pts;
         this.repaint();
      } else {
         var old = this.__hoverIdx;
         this.__hoverIdx = this.findNearest(x, y);
         if (old !== this.__hoverIdx) this.repaint();
      }
   };
   this.stretchCurvesWidget.onMouseRelease = function() {
      if (this.__dragging >= 0) {
         this.__dragging = -1;
         if (this.__zone)
            this.__zone.scheduleCurvesLive(160);
      }
   };
   this.updateStretchCurvesWidgetVisibility = function() {
      var zone = dlg.activeStretchCurvesZone;
      var visible = !!(zone && zone.getAlgorithmId && zone.getAlgorithmId() === "CURVES" && zone.curvesLive && zone.curvesLive.checked === true);
      dlg.stretchCurvesLabel.visible = visible;
      dlg.stretchCurvesWidget.visible = visible;
   };
   this.stretchTab.preview.control.sizer.add(this.stretchCurvesLabel);
   this.stretchTab.preview.control.sizer.add(this.stretchCurvesWidget);
   this.updateStretchCurvesWidgetVisibility();
};

