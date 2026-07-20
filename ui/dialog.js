PIWorkflowOptDialog.prototype.buildConfigPage = function() {
   var page = new Control(this);
   page.autoFillBackground = true;
   page.backgroundColor = OPT_BG;
   page.sizer = new VerticalSizer();
   page.sizer.margin = 8;
   page.sizer.spacing = 6;

   var title = new Label(page);
   title.useRichText = true;
   title.styleSheet = OPT_CSS_ENGINE_TITLE;
   title.text = "Configuration / Dependency Check";
   page.sizer.add(title);

   var info = optInfoLabel(page, "<p>Quick check of critical processes, scripts and icons at startup. This block is centralized and can be expanded or trimmed from the dependency registry.</p>");
   page.sizer.add(info);

   this.cfgDependencySummary = optInfoLabel(page, "Dependency summary pending.");
   page.sizer.add(this.cfgDependencySummary);

   this.cfgDependencyDetails = new TextBox(page);
   this.cfgDependencyDetails.readOnly = true;
   this.cfgDependencyDetails.minWidth = 760;
   this.cfgDependencyDetails.minHeight = 340;
   this.cfgDependencyDetails.styleSheet =
      "QTextEdit { background-color:" + OPT_UI.bgInset +
      "; color:" + OPT_UI.text +
      "; border:1px solid " + OPT_UI.border +
      "; border-radius:4px; font-family:Consolas,monospace; font-size:8pt; padding:6px; }";
   page.sizer.add(this.cfgDependencyDetails, 100);

   var row = new Control(page);
   row.sizer = new HorizontalSizer();
   row.sizer.spacing = 4;
   this.btnRefreshDependencyCheck = optPrimaryButton(row, "Refresh Dependency Check", 210);
   var dlg = this;
   this.btnRefreshDependencyCheck.onClick = function() {
      optSafeUi("Refresh Dependency Check", function() {
         dlg.runDependencyChecks();
      });
   };
   row.sizer.add(this.btnRefreshDependencyCheck);
   row.sizer.addStretch();
   page.sizer.add(row);

   page.sizer.addStretch();
   return page;
};

// ============================================================================
// Centralized UI Gating Policy System (v33-opt-8k)
// ----------------------------------------------------------------------------
// Declarative registry of UI policies. Each policy declares a set of target
// controls (or sections) gated by a named predicate. A single engine evaluates
// all policies and applies enable/disable + tooltip swap uniformly.
//
// To add a new gating rule in the future:
//   1. (If new condition) add a predicate to PIWorkflowOptDialog.prototype.uiPredicates
//   2. Add an entry to buildUIPolicies()
//   3. Add the corresponding "policy.xxx" tooltip text to PI Workflow_resources.jsh
//
// Coarse (Phase 1, current): targets a whole section.body or a button.
// Granular (Phase 2, future): targets specific sub-controls inside a section.
// Both modes share the same engine — only the targets array differs.
// ============================================================================

// Helper: detect whether the canonical image of a given tab is a color (RGB) image.
PIWorkflowOptDialog.prototype.canonicalIsColor = function(tabName) {
   var tab = this.tabsByName ? this.tabsByName[tabName] : null;
   if (!tab || !tab.preview) return false;
   var view = tab.preview.candidateView || tab.preview.currentView;
   if (!optSafeView(view)) return false;
   try { return view.image.numberOfChannels >= 3; } catch (e) { return false; }
};

// Registry of predicates. Each predicate receives the dialog and returns boolean.
// Add new predicates here when introducing new gating conditions.
PIWorkflowOptDialog.prototype.uiPredicates = {
   "canonical-rgb-pre":     function(dlg) { return dlg.canonicalIsColor(OPT_TAB_PRE); },
   "canonical-rgb-stretch": function(dlg) { return dlg.canonicalIsColor(OPT_TAB_STRETCH); },
   "canonical-rgb-post":    function(dlg) { return dlg.canonicalIsColor(OPT_TAB_POST); }
};

// Registry of policies. Built once after all tabs are configured because the
// targets reference controls created during tab construction.
PIWorkflowOptDialog.prototype.buildUIPolicies = function() {
   var dlg = this;
   dlg.uiPolicies = [
      // ----- COARSE policies (Phase 1) ------------------------------------
      {
         id: "pre.colorCalibration",
         requires: "canonical-rgb-pre",
         message: "policy.requiresRGB",
         targets: function() {
            var t = [];
            if (dlg.preTab && dlg.preTab.btnPreSPCC) t.push(dlg.preTab.btnPreSPCC);
            if (dlg.preTab && dlg.preTab.btnPreALF)  t.push(dlg.preTab.btnPreALF);
            if (dlg.preTab && dlg.preTab.btnPreOT)   t.push(dlg.preTab.btnPreOT);
            if (dlg.preTab && dlg.preTab.btnPreBN)   t.push(dlg.preTab.btnPreBN);
            if (dlg.preTab && dlg.preTab.btnPreColorCalibrationCompare) t.push(dlg.preTab.btnPreColorCalibrationCompare);
            return t;
         }
      },
      {
         id: "post.colorBalance",
         requires: "canonical-rgb-post",
         message: "policy.requiresRGB",
         targets: function() {
            return dlg.__sectionPostColorBalance ? [dlg.__sectionPostColorBalance] : [];
         }
      },
      {
         id: "post.colorMask",
         requires: "canonical-rgb-post",
         message: "policy.requiresRGB",
         targets: function() {
            return dlg.postColorMaskGroup ? [dlg.postColorMaskGroup] : [];
         }
      },
      // ----- GRANULAR policies (Phase 2) ----------------------------------
      {
         // Pre > Gradient Correction > MGC: G/B per-channel scales (R/K stays
         // enabled because in mono workflows the only channel maps to K).
         id: "pre.mgc.colorChannels",
         requires: "canonical-rgb-pre",
         message: "policy.requiresRGB",
         targets: function() {
            var t = [];
            if (dlg.ncMgcScaleG) t.push(dlg.ncMgcScaleG);
            if (dlg.ncMgcScaleB) t.push(dlg.ncMgcScaleB);
            return t;
         }
      },
      {
         // Stretching (both zones) > MAS > Color Saturation sub-controls.
         // Engine already skips these in mono (isRGB check at line ~7507);
         // gating just makes the inactive state visible.
         id: "stretch.mas.colorSat",
         requires: "canonical-rgb-stretch",
         message: "policy.requiresRGB",
         targets: function() {
            var t = [];
            var zones = [dlg.stretchZoneRgb, dlg.stretchZoneStars];
            for (var k = 0; k < zones.length; ++k) {
               var z = zones[k];
               if (!z) continue;
               if (z.msCS)          t.push(z.msCS);
               if (z.msCSAmount)    t.push(z.msCSAmount);
               if (z.msCSBoost)     t.push(z.msCSBoost);
               if (z.msCSLightness) t.push(z.msCSLightness);
            }
            return t;
         }
      },
      {
         // Stretching > Stars zone > Star Stretch color controls.
         // Color Boost (saturation) and Remove Green via SCNR are color-only.
         id: "stretch.starStretch.color",
         requires: "canonical-rgb-stretch",
         message: "policy.requiresRGB",
         targets: function() {
            var t = [];
            var z = dlg.stretchZoneStars;
            if (z && z.starSat)         t.push(z.starSat);
            if (z && z.starRemoveGreen) t.push(z.starRemoveGreen);
            return t;
         }
      },
      {
         // Stretching (both zones) > Curves > Channel selector + Saturation.
         // Disabling the row greys the "Channel:" label together with the combo.
         id: "stretch.curves.color",
         requires: "canonical-rgb-stretch",
         message: "policy.requiresRGB",
         targets: function() {
            var t = [];
            var zones = [dlg.stretchZoneRgb, dlg.stretchZoneStars];
            for (var k = 0; k < zones.length; ++k) {
               var z = zones[k];
               if (!z) continue;
               if (z.curvesChan && z.curvesChan.row) t.push(z.curvesChan.row);
               if (z.curvesSaturation) t.push(z.curvesSaturation);
            }
            return t;
         }
      },
      {
         // Post > Noise Reduction: per-engine chrominance/color sub-controls
         // (NXT color sep + color amounts, TGV chrominance, CC Denoise color).
         id: "post.nr.color",
         requires: "canonical-rgb-post",
         message: "policy.requiresRGB",
         targets: function() {
            var t = [];
            if (dlg.chkPostNxtColorSep)      t.push(dlg.chkPostNxtColorSep);
            if (dlg.ncPostNxtDenoiseColor)   t.push(dlg.ncPostNxtDenoiseColor);
            if (dlg.ncPostNxtDenoiseLFColor) t.push(dlg.ncPostNxtDenoiseLFColor);
            if (dlg.ncPostTgvStrengthC)      t.push(dlg.ncPostTgvStrengthC);
            if (dlg.ncPostCCNRColor)         t.push(dlg.ncPostCCNRColor);
            return t;
         }
      },
      {
         // Post > Curves > Channel selector + Saturation slider.
         id: "post.curves.color",
         requires: "canonical-rgb-post",
         message: "policy.requiresRGB",
         targets: function() {
            var t = [];
            if (dlg.__postCurvesChannelRow) t.push(dlg.__postCurvesChannelRow);
            if (dlg.ncPostCurvesSaturation) t.push(dlg.ncPostCurvesSaturation);
            return t;
         }
      }
   ];
};

// Engine: evaluate all policies and apply their decisions.
PIWorkflowOptDialog.prototype.applyUIPolicies = function() {
   if (!this.uiPolicies) return;
   var dlg = this;
   for (var i = 0; i < dlg.uiPolicies.length; ++i) {
      var p = dlg.uiPolicies[i];
      var pred = dlg.uiPredicates ? dlg.uiPredicates[p.requires] : null;
      if (typeof pred !== "function") continue;
      var ok = false;
      try { ok = pred(dlg) === true; } catch (ePred) { ok = false; }
      var targets = [];
      try { targets = (typeof p.targets === "function") ? (p.targets() || []) : []; } catch (eT) { targets = []; }
      var msg = "";
      try { msg = optTooltipTextByKey(p.message) || ""; } catch (eM) { msg = ""; }
      for (var j = 0; j < targets.length; ++j)
         optApplyPolicyToTarget(targets[j], ok, msg);
   }
   if (typeof dlg.updateNxtUiStates === "function") {
      try { dlg.updateNxtUiStates(); } catch (eNxt) {}
   }
};

PIWorkflowOptDialog.prototype.runDependencyChecks = function() {
   this.dependencyReport = optRunDependencyChecks();
   var counts = this.dependencyReport.counts || { ok: 0, warn: 0, error: 0 };
   var summaryColor = "#FF7ed89b";
   if (this.dependencyReport.worst === "warn")
      summaryColor = "#FFe5c070";
   else if (this.dependencyReport.worst === "error")
      summaryColor = "#FFe08070";
   if (this.cfgDependencySummary)
      this.cfgDependencySummary.text =
         "<b style='color:" + summaryColor + ";'>Dependency Check</b> &nbsp; " +
         "OK=" + counts.ok + " &nbsp; WARN=" + counts.warn + " &nbsp; ERROR=" + counts.error;
   if (this.cfgDependencyDetails)
      this.cfgDependencyDetails.text = optFormatDependencyReport(this.dependencyReport);
   try {
      console.noteln("=> Dependency Check: OK=" + counts.ok + " WARN=" + counts.warn + " ERROR=" + counts.error);
      if (counts.warn > 0 || counts.error > 0) {
         console.writeln("Missing or inactive modules details:");
         for (var i = 0; i < this.dependencyReport.entries.length; ++i) {
            var entry = this.dependencyReport.entries[i];
            if (entry.severity === "warn") {
               console.warningln("  * " + entry.label + " (" + entry.group + ") - WARNING: " + entry.summary);
               if (entry.detail) {
                  console.writeln("    " + entry.detail);
               }
            } else if (entry.severity === "error") {
               console.criticalln("  * " + entry.label + " (" + entry.group + ") - ERROR: " + entry.summary);
               if (entry.detail) {
                  console.writeln("    " + entry.detail);
               }
            }
         }
      }
   } catch (e) {
   }
   try { optApplyProcessAvailabilityToUI(this); } catch (eAvail) {}
   try { this.applyUIPolicies(); } catch (ePol) {}
   return this.dependencyReport;
};

PIWorkflowOptDialog.prototype.refreshSelections = function() {
   this.preTab.refreshSelections();
   this.stretchTab.refreshSelections();
   this.postTab.refreshSelections();
   this.ccTab.refreshSelections();
   if (this.annotTab) this.annotTab.refreshSelections();
};

PIWorkflowOptDialog.prototype.refreshWorkflowButtons = function() {
   this.preTab.preview.refreshButtons();
   this.stretchTab.preview.refreshButtons();
   this.postTab.preview.refreshButtons();
   this.ccTab.preview.refreshButtons();
   if (this.imgEnhTab) this.imgEnhTab.preview.refreshButtons();   // IMG-ENH
   if (this.annotTab) this.annotTab.preview.refreshButtons();     // #13: chips de imágenes en Anotaciones
   // NB-RGB-STARS: enable "Use NB stars to produce RGB stars" only when H/O/HSO is loaded.
   try {
      if (this.stretchZoneStars && this.stretchZoneStars.useNbStars) {
         var nbOk = !!optHasNbInfoForStars(this);
         this.stretchZoneStars.useNbStars.enabled = nbOk;
         if (this.stretchZoneStars.nbColorBoost)
            this.stretchZoneStars.nbColorBoost.enabled = nbOk && this.stretchZoneStars.useNbStars.checked;
      }
   } catch (eNb) {}
   // Re-evaluate UI policies because workflow state (canonical image, slot
   // availability) may have changed. Cheap operation — just enable/disable
   // and tooltip swaps; no image work involved.
   try { this.applyUIPolicies(); } catch (ePol) {}
};

PIWorkflowOptDialog.prototype.refreshAllPreviews = function(fit) {
   var tabs = [this.preTab, this.stretchTab, this.postTab, this.ccTab];
   if (this.imgEnhTab) tabs.push(this.imgEnhTab);   // IMG-ENH
   for (var i = 0; i < tabs.length; ++i) {
      var p = tabs[i].preview;
      if (optSafeView(p.candidateView || p.currentView))
         p.render(p.candidateView || p.currentView, fit === true);
   }
};

PIWorkflowOptDialog.prototype.setSharedPreviewReduction = function(value) {
   var reduction = optClampPreviewReduction(value);
   this.sharedPreviewReduction = reduction;
   if (this.__syncingSharedPreviewReduction)
      return;
   this.__syncingSharedPreviewReduction = true;
   try {
      var tabs = [this.preTab, this.stretchTab, this.postTab, this.ccTab];
      for (var i = 0; i < tabs.length; ++i) {
         var preview = tabs[i] && tabs[i].preview;
         if (!preview || !preview.resCombo)
            continue;
         try {
            if (preview.resCombo.currentItem !== reduction - 1)
               preview.resCombo.currentItem = reduction - 1;
         } catch (e0) {}
      }
   } finally {
      this.__syncingSharedPreviewReduction = false;
   }
   this.refreshAllPreviews(false);
};

PIWorkflowOptDialog.prototype.refreshRecipeButtons = function() {
   for (var i = 0; i < this.recipeButtons.length; ++i) {
      var b = this.recipeButtons[i];
      var active = b.__recipe === this.selectedRecipe;
      // Phase 6: amber colour shows selection; the [brackets] indicator is
      // no longer necessary.
      b.text = b.__recipe;
      optThemeApplyRecipeButton(b, active);
   }
};

PIWorkflowOptDialog.prototype.activeWorkflowTab = function() {
   var idx = 0;
   try { idx = this.tabs.currentPageIndex; } catch (e) { idx = 0; }
   if (idx === 0) return this.preTab;
   if (idx === 1) return this.stretchTab;
   if (idx === 2) return this.postTab;
   if (idx === 3) return this.ccTab;
   if (this.imgEnhTab && idx === this.__imgEnhTabIndex) return this.imgEnhTab;
   if (this.annotTab && idx === this.__annotTabIndex) return this.annotTab;
   return null;
};

PIWorkflowOptDialog.prototype.ensureTabConfigured = function(tab) {
   // Tabs are built eagerly in the constructor, so this is normally a no-op.
   // Kept as a safety net in case future code defers a tab again.
   if (!tab || tab.__configured)
      return;
   tab.__configured = true;
   if (tab === this.stretchTab)
      this.configureStretchTab();
   else if (tab === this.postTab)
      this.configurePostTab();
   else if (tab === this.ccTab)
      this.configureCcTab();
   else if (tab === this.preTab)
      this.configurePreTab();
   this.collapseTabSections(tab);
};

// Phase 2b fix: programmatic tab switches (e.g. "To Stretching" /
// "To Post Processing" CTAs) need to update BOTH the TabBox and the custom
// pill bar. PJSR's TabBox does not always fire onPageSelected when
// currentPageIndex is assigned from code, so the custom bar would otherwise
// remain stuck on the previous tab. Every callsite that wants to switch
// tabs should go through this helper instead of touching currentPageIndex
// directly.
PIWorkflowOptDialog.prototype.setActiveTab = function(index) {
   try { this.tabs.currentPageIndex = index; } catch (e0) {}
   try { this.customTabBar.setActiveTab(index); } catch (e1) {}
};

PIWorkflowOptDialog.prototype.onTabChanged = function(index) {
   if (this.previousTabIndex !== index) {
      var oldTab = null;
      if (this.previousTabIndex === 0) oldTab = this.preTab;
      if (this.previousTabIndex === 1) oldTab = this.stretchTab;
      if (this.previousTabIndex === 2) oldTab = this.postTab;
      if (this.previousTabIndex === 3) oldTab = this.ccTab;
      if (this.imgEnhTab && this.previousTabIndex === this.__imgEnhTabIndex) oldTab = this.imgEnhTab;
      if (this.annotTab && this.previousTabIndex === this.__annotTabIndex) oldTab = this.annotTab;
      if (oldTab && oldTab.preview && oldTab.preview.memory)
         oldTab.preview.memory.clear();
   }
   this.previousTabIndex = index;
   // ANNOTATIONS (#13): al ENTRAR en Anotaciones, cualquier imagen de trabajo con
   // vista valida queda disponible aqui (para anotar la imagen con la que trabajas,
   // venga del flujo que venga), y se refresca la barra + los combos.
   if (this.annotTab && index === this.__annotTabIndex && typeof OPT_TAB_ANNOT !== "undefined") {
      try {
         var akeys = this.store.keysWithValidView();
         for (var ai = 0; ai < akeys.length; ++ai) this.store.setAvailable(akeys[ai], OPT_TAB_ANNOT, true);
         this.annotTab.refreshSelections();
         this.refreshWorkflowButtons();
      } catch (eAnn) {}
   }
   var tab = this.activeWorkflowTab();
   this.ensureTabConfigured(tab);
   this.collapseTabSections(tab);
   if (index === 3)
      optRefreshCcSlotCombos(this);
   if (tab && tab.preview && optSafeView(tab.preview.currentView))
      tab.preview.render(tab.preview.currentView, true);
};

PIWorkflowOptDialog.prototype.resolveStretchZoneKey = function(starsZone) {
   var current = this.stretchTab.preview.currentKey || "";
   if (starsZone === true) {
      if (current.indexOf("_Stars") > 0 && this.store.isAvailable(current, OPT_TAB_STRETCH))
         return current;
      var starCompanion = optBaseKey(current) + "_Stars";
      if (this.store.isAvailable(starCompanion, OPT_TAB_STRETCH))
         return starCompanion;
      var starKeys = this.store.keysForTab(OPT_TAB_STRETCH);
      for (var s = 0; s < starKeys.length; ++s)
         if (starKeys[s].indexOf("_Stars") > 0)
            return starKeys[s];
      return "";
   }
   if (current && current.indexOf("_Stars") < 0 && this.store.isAvailable(current, OPT_TAB_STRETCH))
      return current;
   var base = optBaseKey(current);
   var starlessCompanion = base + "_Starless";
   if (this.store.isAvailable(starlessCompanion, OPT_TAB_STRETCH))
      return starlessCompanion;
   if (this.store.isAvailable(base, OPT_TAB_STRETCH))
      return base;
   var keys = this.store.keysForTab(OPT_TAB_STRETCH);
   for (var i = 0; i < keys.length; ++i)
      if (keys[i].indexOf("_Stars") < 0)
         return keys[i];
   return "";
};

PIWorkflowOptDialog.prototype.sendActiveToStretch = function() {
   var key = this.preTab.preview.currentKey;
   if (!key)
      throw new Error("Select an image in Pre Processing first.");
   var rec = this.store.record(key);
   if (!optSafeView(rec.view))
      throw new Error("The selected Pre image is not valid.");
   this.store.setAvailable(key, OPT_TAB_STRETCH, true);
   if (typeof OPT_TAB_ANNOT !== "undefined") this.store.setAvailable(key, OPT_TAB_ANNOT, true);
   this.refreshWorkflowButtons();
   this.setActiveTab(1);                  // Phase 2b: sync TabBox + custom bar
   this.stretchTab.preview.activate(key, true);
   // Auto-expand Star Split: the natural next step after coming from Pre.
   // Done AFTER setActiveTab because onTabChanged → collapseTabSections
   // runs synchronously inside setActiveTab and would otherwise undo this.
   if (this.stretchTab.starSplitSection &&
       typeof this.stretchTab.starSplitSection.setExpanded === "function") {
      try { this.stretchTab.starSplitSection.setExpanded(true); } catch (eExp) {}
   }
};

// Engine selection for Star Split, shared by the single-image split and the
// "Apply all" batch. 0 = StarXTerminator (default), 1 = StarNet2, 2 = SyQon Starless.
PIWorkflowOptDialog.prototype.starSplitEngineParams = function() {
   // ===== STARNET2-BEGIN — easy-rollback (v137 dual-engine dispatch) =====
   var methodIdx = 0;
   try { if (this.comboStarSplitAlgo) methodIdx = optComboCanonicalItem(this.comboStarSplitAlgo); } catch (eM0) { methodIdx = 0; }
   // SYQON-STARLESS-INTEGRATION-BEGIN
   var methodLabel = (methodIdx === 1) ? "StarNet2" : (methodIdx === 2 ? "SyQon Starless" : "StarXTerminator");
   var engineAvailable;
   if (methodIdx === 1)
      engineAvailable = (typeof StarNet2 !== "undefined");
   else if (methodIdx === 2)
      engineAvailable = optIsSyQonStarlessAvailable();
   else
      engineAvailable = (typeof StarXTerminator !== "undefined");
   // SYQON-STARLESS-INTEGRATION-END
   // ===== STARNET2-END =====
   return { methodIdx: methodIdx, methodLabel: methodLabel, engineAvailable: engineAvailable };
};

// Runs Star Split on a single store slot and stores the resulting
// <base>_Starless / <base>_Stars views (with a safe fallback when the engine is
// unavailable). No busy indicator and no preview focus — the caller owns those,
// so the batch can drive its own progress. Returns the keys it created.
PIWorkflowOptDialog.prototype.splitStarsForKey = function(key, ep) {
   var rec = this.store.record(key);
   if (!optSafeView(rec.view))
      throw new Error("The selected Stretching image is not valid.");
   var base = optBaseKey(key);
   var starlessKey = base + "_Starless";
   var starsKey = base + "_Stars";
   var starless = null;
   var stars = null;
   if (!OPT_TEST_MODE && ep.engineAvailable) {
      var result = this.runStarSplitEngineOn(rec, base, ep.methodIdx);
      starless = result.starless;
      stars = result.stars;
   }
   if (!optSafeView(starless)) {
      starless = optCloneView(rec.view, base + "_Starless", false);
      optApplyFallbackTransform(starless, "darken", 0.18);
   }
   if (!optSafeView(stars)) {
      stars = optCloneView(rec.view, base + "_Stars", false);
      optApplyFallbackTransform(stars, "lift", 0.12);
   }
   this.store.setView(starlessKey, starless, true, OPT_TAB_STRETCH);
   this.store.setView(starsKey, stars, true, OPT_TAB_STRETCH);
   this.store.markStage(starlessKey, "Starless");
   this.store.markStage(starsKey, "Stars");
   return { starlessKey: starlessKey, starsKey: starsKey };
};

PIWorkflowOptDialog.prototype.createStarSplit = function() {
   var key = this.stretchTab.preview.currentKey;
   if (!key)
      throw new Error("Select a Stretching image first.");
   var ep = this.starSplitEngineParams();
   var busyPreview = this.stretchTab && this.stretchTab.preview ? this.stretchTab.preview.preview : null;
   if (busyPreview) {
      busyPreview.setBusy(true, "Generating Starless / Stars (" + ep.methodLabel + ")");
      try { optProcessEvents(); } catch (eBusy0) {}
   }
   try {
      var out = this.splitStarsForKey(key, ep);
      this.refreshWorkflowButtons();
      this.stretchTab.preview.activate(out.starlessKey, true);
   } finally {
      if (busyPreview)
         busyPreview.setBusy(false);
   }
};

// BATCH-APPLY-BEGIN (Star Split "Apply all")
// Runs Star Split on every base image currently available in the Stretching tab,
// producing <base>_Starless / <base>_Stars for each. Per-slot try/catch so one
// failure does not abort the rest; progress + summary via the preview busy
// indicator and the console. Reversible with OPT_BATCH_APPLY_ENABLED.
PIWorkflowOptDialog.prototype.runStarSplitApplyAll = function() {
   var ep = this.starSplitEngineParams();
   var keys = optStarSplitBatchTargetKeys(this);
   if (keys.length === 0)
      throw new Error("No Stretching images available to split. Send at least one image to Stretching first.");
   var busyPreview = this.stretchTab && this.stretchTab.preview ? this.stretchTab.preview.preview : null;
   var activeKey = this.stretchTab.preview.currentKey;
   var applied = [];
   var failed = [];
   if (busyPreview)
      busyPreview.setBusy(true, "Apply all: preparing...");
   try {
      for (var i = 0; i < keys.length; ++i) {
         var key = keys[i];
         if (busyPreview) {
            busyPreview.setBusy(true, "Apply all: " + optLabelForKey(key) + " (" + (i + 1) + "/" + keys.length + ")...");
            try { optProcessEvents(); } catch (eP) {}
         }
         try {
            this.splitStarsForKey(key, ep);
            applied.push(key);
         } catch (eSlot) {
            failed.push(key);
            console.warningln("=> Star Split (Apply all) failed for " + optLabelForKey(key) + ": " + eSlot.message);
         }
      }
   } finally {
      if (busyPreview)
         busyPreview.setBusy(false);
   }
   this.refreshWorkflowButtons();
   // Focus the active image's starless if it was split, else the first result.
   var focusBase = null;
   if (activeKey && applied.indexOf(activeKey) >= 0)
      focusBase = optBaseKey(activeKey);
   else if (applied.length > 0)
      focusBase = optBaseKey(applied[0]);
   if (focusBase) {
      try { this.stretchTab.preview.activate(focusBase + "_Starless", true); } catch (eAct) {}
   }
   var msg = "Star Split (Apply all): split " + applied.length + " image(s)";
   if (failed.length > 0) {
      var ft = [];
      for (var f = 0; f < failed.length; ++f) ft.push(optLabelForKey(failed[f]));
      msg += "; failed: " + ft.join(", ") + " (see console)";
   }
   console.writeln("=> " + msg + ".");
};
// BATCH-APPLY-END (Star Split "Apply all")

// ===== STARNET2-BEGIN — easy-rollback block (v137) =====
// Runs the selected star-removal engine on a clone of rec.view and returns
// { starless, stars } as fresh workflow views. WCS handling, dimension
// safety and window cleanup are the same regardless of engine; only the
// process configuration block differs between methodIdx=0 (SXT) and
// methodIdx=1 (StarNet2).
PIWorkflowOptDialog.prototype.runStarSplitEngineOn = function(rec, base, methodIdx) {
   var dlg = this;
   var starless = null;
   var stars = null;
   var starlessWindow = null;
   var starsWindow = null;

   try {
      // SYQON-STARLESS-INTEGRATION-BEGIN
      if (methodIdx === 2) {
         // ----- SyQon Starless branch --------------------------------
         var starlessParams = optBuildStarlessParamsFromDialog(dlg);
         var res = optRunSyQonStarlessOnView(rec.view, starlessParams, dlg);
         starlessWindow = res.starlessWindow;
         starsWindow = res.starsWindow;
         
         // Transfer astrometric solution and keywords to the starless output
         if (starlessWindow && !starlessWindow.isNull) {
            try { optCopyKeywordsExcludingWCS(starlessWindow, rec.view.window); } catch (e0_sl) {}
            try { optCopyAstrometricSolution(starlessWindow, rec.view.window); } catch (e1_sl) {}
            try { starlessWindow.hide(); } catch (e8_sl) {}
         }
         // Transfer astrometric solution and keywords to the stars output
         if (starsWindow && !starsWindow.isNull) {
            try { optCopyKeywordsExcludingWCS(starsWindow, rec.view.window); } catch (e0_st) {}
            try { optCopyAstrometricSolution(starsWindow, rec.view.window); } catch (e1_st) {}
            try { starsWindow.hide(); } catch (e8_st) {}
         }
      } else {
         // ----- SXT or StarNet2 branches -----------------------------
         starlessWindow = new ImageWindow(
            rec.view.image.width,
            rec.view.image.height,
            rec.view.image.numberOfChannels,
            rec.view.window.bitsPerSample,
            rec.view.window.isFloatSample,
            optViewIsColor(rec.view),
            optUniqueId(rec.view.id + "_starless")
         );
         starlessWindow.mainView.beginProcess(UndoFlag_NoSwapFile);
         starlessWindow.mainView.image.assign(rec.view.image);
         starlessWindow.mainView.endProcess();
         // Filter WCS keywords out of the copy: PI auto-builds an
         // AstrometricMetadata on the target from any WCS keywords it
         // sees, and that build fails with "AstrometricMetadata::Write():
         // Incompatible image dimensions" when the source was cropped
         // (CRPIX shifted but stale cached W×H). optCopyAstrometricSolution
         // below handles the WCS transfer in a dim-safe way.
         try { optCopyKeywordsExcludingWCS(starlessWindow, rec.view.window); } catch (e0) {}
         try { optCopyAstrometricSolution(starlessWindow, rec.view.window); } catch (e1) {}

         var windowsBefore = ImageWindow.windows;

         if (methodIdx === 1) {
            // ----- StarNet2 branch ---------------------------------------
            // Per user spec: P.linear = true, P.mask = false and P.unscreen
            // = true are fixed; Stride and 2x upsample come from the UI.
            // shadows_clipping / target_background take their canonical
            // StarNet2 defaults explicitly so behaviour does not drift
            // when the user has set them differently in the StarNet2 GUI.
            var sn2 = new StarNet2();
            try { sn2.stride = optResolveStarNet2Stride(dlg); } catch (sn2e1) {}
            try { sn2.mask = false; } catch (sn2e2) {}
            try { sn2.unscreen = true; } catch (sn2e3) {}
            try { sn2.linear = true; } catch (sn2e4) {}
            try { sn2.upsample = (dlg.chkStarSplitUpsample && dlg.chkStarSplitUpsample.checked === true); } catch (sn2e5) {}
            try { sn2.shadows_clipping = -2.80; } catch (sn2e6) {}
            try { sn2.target_background = 0.25; } catch (sn2e7) {}
            sn2.executeOn(starlessWindow.mainView);
         } else {
            // ----- StarXTerminator branch --------------------------------
            // Overlap comes from the UI slider (default 0.20).
            var sxt = new StarXTerminator();
            // STARX-AIFILE-FIX-BEGIN (v138): discover the installed SXT model
            // instead of pinning a fixed version. The old hardcoded
            // "StarXTerminator.11.pb" failed on installs shipping a different
            // model (e.g. macOS: "could not find AI file .../StarXTerminator.11.pb").
            // If discovery fails, leave ai_file unset so SXT selects its own default.
            try {
               var sxtAi = optResolveStarXTerminatorAiFile();
               if (sxtAi && sxtAi.length > 0)
                  sxt.ai_file = sxtAi;
            } catch (eAi) {}
            // STARX-AIFILE-FIX-END
            try { sxt.stars = true; } catch (e2) {}
            try { sxt.generate_stars = true; } catch (e3) {}
            try { sxt.generateStars = true; } catch (e4) {}
            try { sxt.unscreen = false; } catch (e5) {}
            try { sxt.unscreen_stars = false; } catch (e6) {}
            try { sxt.unscreenStars = false; } catch (e7) {}
            var overlap = 0.20;
            try { if (dlg.ncStarSplitOverlap) overlap = dlg.ncStarSplitOverlap.value; } catch (eOv) {}
            try { sxt.overlap = overlap; } catch (eOvSet) {}
            sxt.executeOn(starlessWindow.mainView);
         }

         try { starlessWindow.hide(); } catch (e8) {}
         optProcessEvents();

         var windowsAfter = ImageWindow.windows;
         for (var iWin = 0; iWin < windowsAfter.length; ++iWin) {
            var found = false;
            for (var jWin = 0; jWin < windowsBefore.length; ++jWin) {
               if (windowsAfter[iWin].mainView.id === windowsBefore[jWin].mainView.id) {
                  found = true;
                  break;
               }
            }
            if (!found && windowsAfter[iWin].mainView.id !== starlessWindow.mainView.id) {
               starsWindow = windowsAfter[iWin];
               break;
            }
         }
      }
      // SYQON-STARLESS-INTEGRATION-END

      starless = optCloneView(starlessWindow.mainView, base + "_Starless", false);
      if (starsWindow && starsWindow.mainView && !starsWindow.mainView.isNull) {
         try { optCopyKeywordsExcludingWCS(starsWindow, rec.view.window); } catch (e9) {}
         try { optCopyAstrometricSolution(starsWindow, rec.view.window); } catch (e10) {}
         try { starsWindow.hide(); } catch (e11) {}
         stars = optCloneView(starsWindow.mainView, base + "_Stars", false);
      }
   } finally {
      if (starlessWindow && !starlessWindow.isNull && starlessWindow.mainView)
         optCloseView(starlessWindow.mainView);
      if (starsWindow && !starsWindow.isNull && starsWindow.mainView)
         optCloseView(starsWindow.mainView);
   }

   return { starless: starless, stars: stars };
};
// ===== STARNET2-END =====

PIWorkflowOptDialog.prototype.sendActiveToPost = function() {
   var key = this.stretchTab.preview.currentKey;
   if (!key)
      throw new Error("Select a Stretching image first.");
   var rec = this.store.record(key);
   if (!optSafeView(rec.view))
      throw new Error("The selected Stretching image is not valid.");
   var stages = optStageList(rec);
   var stretched = false;
   for (var i = 0; i < stages.length; ++i)
      if (stages[i].indexOf("Stretch") === 0) {
         stretched = true;
         break;
      }
   if (!stretched)
      throw new Error("There is no committed stretched image available for " + optLabelForKey(key) + ". Click Preview and then 'Use this Image' first.");
   this.store.setAvailable(key, OPT_TAB_POST, true);
   this.store.setAvailable(key, OPT_TAB_CC, true);
   // A stretched image sent to Post is also available in Image Enhancement + Annotations.
   if (typeof OPT_TAB_IMGENH !== "undefined") this.store.setAvailable(key, OPT_TAB_IMGENH, true);
   if (typeof OPT_TAB_ANNOT !== "undefined") this.store.setAvailable(key, OPT_TAB_ANNOT, true);
   this.refreshWorkflowButtons();
   this.setActiveTab(2);                  // Phase 2b: sync TabBox + custom bar
   this.postTab.preview.activate(key, true);
};

// IMG-ENH-BEGIN: routing into the Image Enhancement tab.
// From Post (or any preview tab): make the active image available there and open it.
PIWorkflowOptDialog.prototype.sendActiveToImageEnh = function() {
   if (!this.imgEnhTab)
      return;
   var src = this.activeWorkflowTab();
   var key = (src && src.preview) ? src.preview.currentKey : "";
   if (!key)
      throw new Error("Select an image first.");
   var rec = this.store.record(key);
   if (!optSafeView(rec.view))
      throw new Error("The selected image is not valid.");
   this.store.setAvailable(key, OPT_TAB_IMGENH, true);
   if (typeof OPT_TAB_ANNOT !== "undefined") this.store.setAvailable(key, OPT_TAB_ANNOT, true);
   this.refreshWorkflowButtons();
   this.setActiveTab(this.__imgEnhTabIndex);
   this.imgEnhTab.preview.activate(key, true);
};

// First free Final slot (Final, then Final1, Final2, ...) so repeated promotions don't
// overwrite an earlier Final.
function optNextFreeFinalKey(store) {
   var candidates = ["Final", "Final1", "Final2", "Final3", "Final4"];
   for (var i = 0; i < candidates.length; ++i) {
      var r = store.record(candidates[i]);
      if (!r || !optSafeView(r.view)) return candidates[i];
   }
   return "Final4"; // all full -> reuse the last
}

// Makes a Final image available across Post Processing, Channel Combination AND Image
// Enhancement, so a promoted result can be picked up and refined from any of the three.
PIWorkflowOptDialog.prototype.publishFinal = function(key) {
   this.store.setAvailable(key, OPT_TAB_POST, true);
   this.store.setAvailable(key, OPT_TAB_CC, true);
   this.store.setAvailable(key, OPT_TAB_IMGENH, true);
   if (typeof OPT_TAB_ANNOT !== "undefined") this.store.setAvailable(key, OPT_TAB_ANNOT, true);
};

// From Channel Combination: build the blended composite, promote it as a fresh Final image
// (Final / Final1 / Final2 ...), make it available in Post, CC and Image Enhancement, and
// open it in Image Enhancement.
PIWorkflowOptDialog.prototype.sendCcFinalToImageEnh = function() {
   if (!this.imgEnhTab)
      return;
   var dlg = this;
   var blended = optComposeCcSlots(dlg, { live: false });
   if (!optSafeView(blended))
      throw new Error("No blended result available. Activate at least one channel in Channel Combination first.");
   var finalKey = optNextFreeFinalKey(this.store);
   var finalView = optCloneView(blended, finalKey, false);
   try { if (blended.id !== finalView.id) optCloseView(blended); } catch (eC) {}
   if (!optSafeView(finalView))
      throw new Error("Could not create the Final image.");
   this.store.setView(finalKey, finalView, true, OPT_TAB_IMGENH);
   this.publishFinal(finalKey);
   this.store.markStage(finalKey, "Channel Combination");
   this.refreshWorkflowButtons();
   this.setActiveTab(this.__imgEnhTabIndex);
   this.imgEnhTab.preview.activate(finalKey, true);
};
// IMG-ENH-END

// CABRAMAGIC-UI-BEGIN: one-click auto-process. Clones the active Pre image into a
// new "Final" view, runs the metric-driven full pipeline (optCabraMagicRun) on it,
// then promotes it to Image Enhancement and jumps there. Rollback: set
// OPT_CABRAMAGIC_ENABLED=false (hides the button) or delete this block + the section.
PIWorkflowOptDialog.prototype.runCabraMagic = function() {
   if (typeof OPT_CABRAMAGIC_ENABLED !== "undefined" && !OPT_CABRAMAGIC_ENABLED)
      return;
   var dlg = this;
   var src = this.activeWorkflowTab();
   var pane = (src && src.preview) ? src.preview : (this.preTab ? this.preTab.preview : null);
   var busyPane = pane || (this.preTab ? this.preTab.preview : null);
   console.show();

   // Decide between the multi-channel decision tree (RGB/NB channels loaded in Image
   // Selection) and the single-image auto-pilot.
   var map = optCabraInputsFromStore(this);
   // Fallback: if no broadband RGB slot is set but the active image is a colour view,
   // treat it as the RGB so "RGB + Ha" (etc.) is not misread as narrowband-only.
   if (!optSafeView(map.RGB) && !(optSafeView(map.R) && optSafeView(map.G) && optSafeView(map.B))) {
      var av = pane ? pane.currentView : null;
      if (optSafeView(av) && av.image.numberOfChannels >= 3) map.RGB = av;
   }
   // DUALBAND: a colour source shot through a dual-band/OSC-NB filter (L-eXtreme etc.) holds Ha
   // in red and OIII in green+blue. Detected by the FITS FILTER keyword (conservative), extract
   // Ha/OIII and route to the narrowband pipeline instead of processing it as broadband RGB.
   var dbTemps = null;
   if (optSafeView(map.RGB) && !optSafeView(map.H) && !optSafeView(map.O) &&
       typeof optCabraDetectDualband === "function") {
      var dbName = optCabraDetectDualband(map.RGB);
      if (dbName) {
         try {
            var db = optCabraExtractDualband(map.RGB, "CM_DB");
            map.H = db.ha; map.O = db.oiii; map.RGB = null; dbTemps = [db.ha, db.oiii];
            console.noteln("=> CabraMagic: dual-band filter '" + dbName +
               "' detected -> extracted Ha (red) + OIII (green/blue), running the narrowband pipeline.");
         } catch (eDB) { console.warningln("CabraMagic: dual-band extraction failed (" + (eDB.message || eDB) + "); treating as broadband RGB."); }
      }
   }
   var nbCount = (map.H ? 1 : 0) + (map.O ? 1 : 0) + (map.S ? 1 : 0);
   var bbCount = (map.RGB ? 1 : 0) + (map.R ? 1 : 0) + (map.G ? 1 : 0) + (map.B ? 1 : 0) + (map.L ? 1 : 0);
   var multiChannel = (nbCount > 0) || (bbCount >= 2);

   if (multiChannel) {
      console.writeln("==== CabraMagic: reading loaded channels & building solutions ====");
      if (busyPane && busyPane.setBusy) busyPane.setBusy(true, optT("CabraMagic is working its magic…"));
      optProcessEvents();
      var res;
      // V2-P4: FORAXX (dynamic palette) added as a third NB candidate alongside HOO/SHO.
      try { res = optCabraDispatch(map, { dialog: dlg, palettes: ["HOO", "SHO", "FORAXX"] }); }
      finally {
         if (busyPane && busyPane.setBusy) busyPane.setBusy(false);
         // Close the extracted dual-band Ha/OIII originals (the dispatch cloned them per candidate).
         if (dbTemps) for (var dt = 0; dt < dbTemps.length; ++dt) try { if (optSafeView(dbTemps[dt])) optCloseView(dbTemps[dt]); } catch (eDT) {}
      }
      var d = res.decision, cands = res.candidates;
      console.writeln("CabraMagic: case=" + d.caseId + " role=" + d.role +
         " usableNB=[" + d.usableNB.join(",") + "]  -> " + cands.length + " solution(s)");
      for (var r = 0; r < d.reasons.length; ++r) console.writeln("   . " + d.reasons[r]);
      if (!cands.length)
         throw new Error("CabraMagic could not build a solution from the loaded channels.");
      // Show each solution as a friendly-named window; promote the first to "Final".
      var shown = [];
      for (var i = 0; i < cands.length; ++i) {
         try {
            var nv = optCloneView(cands[i].view, "CabraMagic_" + cands[i].name, false);
            try { if (cands[i].view && cands[i].view.window) cands[i].view.window.forceClose(); } catch (eC) {}
            if (optSafeView(nv) && nv.window) { nv.window.show(); shown.push({ name: cands[i].name, view: nv }); }
         } catch (eS) { console.warningln("CabraMagic: could not finalize solution " + cands[i].name); }
      }
      if (this.imgEnhTab && shown.length) {
         var finalKey = optNextFreeFinalKey(this.store);
         var finalView = optCloneView(shown[0].view, finalKey, false);
         this.store.setView(finalKey, finalView, true, OPT_TAB_IMGENH);
         // A stretched RGB Final is usable downstream too: Post, Channel Combination and Enhancement.
         this.publishFinal(finalKey);
         this.store.markStage(finalKey, "CabraMagic (" + d.caseId + "/" + shown[0].name + ")");
         this.refreshWorkflowButtons();
         this.revealImgEnhTab();   // UI-MODE (F6): in Simple, surface Image Enhancement to refine
         this.setActiveTab(this.__imgEnhTabIndex);
         this.imgEnhTab.preview.activate(finalKey, true);
         try { this.collapseTabSections(this.imgEnhTab); } catch (eCol) {}   // start with right-side menus collapsed
      }
      var names = []; for (var s = 0; s < shown.length; ++s) names.push(shown[s].name);
      console.writeln("==== CabraMagic done. Solutions: " + names.join(", ") +
         ". 'Final' = " + (shown.length ? shown[0].name : "-") +
         " (the other windows are open to compare; pick the one you like). ====");
      return;
   }

   // ---- single-image auto-pilot (no separate channels loaded) ----
   var key = (pane && pane.currentKey) ? pane.currentKey : "";
   if (!key || !optSafeView(pane.currentView))
      throw new Error("Select a Pre-processing image first (or load R/G/B/Ha/OIII/SII channels for the full decision tree).");
   var finalKey2 = this.imgEnhTab ? optNextFreeFinalKey(this.store) : "Final";
   var finalView2 = optCloneView(pane.currentView, finalKey2, false);
   if (!optSafeView(finalView2))
      throw new Error("Could not create the Final image.");
   console.writeln("==== CabraMagic: analyzing & auto-processing '" + key + "' ====");
   if (pane && pane.setBusy) pane.setBusy(true, optT("CabraMagic is working its magic…"), true);   // CANCEL: cancelable overlay
   optProcessEvents();
   var report;
   try {
      report = optCabraMagicRun(finalView2, dlg, {
         recipeIntensity: dlg.cabraIntensity || "auto",   // RECIPE-ENGINE (F5)
         // CANCEL: stage() polls this (after yielding) to stop between stages.
         shouldCancel: function() { return !!(pane && pane.isCancelRequested && pane.isCancelRequested()); }
      });
   }
   finally { if (pane && pane.setBusy) pane.setBusy(false); }
   // CANCEL: a half-processed view is not a usable "Final" — discard it and report.
   if (report && report.cancelled) {
      console.warningln("==== CabraMagic cancelled by user. Partial result discarded. ====");
      try { if (optSafeView(finalView2)) optCloseView(finalView2); } catch (eCc) {}
      return;
   }
   var ran = [], skipped = [];
   for (var j = 0; j < report.stages.length; ++j)
      (report.stages[j].status === "ok" ? ran : skipped).push(report.stages[j].name);
   console.writeln("==== CabraMagic done. Ran: " + ran.join(", ") +
      (skipped.length ? ("  |  Skipped: " + skipped.join(", ")) : "") + " ====");
   if (this.imgEnhTab) {
      this.store.setView(finalKey2, finalView2, true, OPT_TAB_IMGENH);
      this.publishFinal(finalKey2);
      this.store.markStage(finalKey2, "CabraMagic (" + report.recipe.label + ")");
      this.refreshWorkflowButtons();
      this.revealImgEnhTab();   // UI-MODE (F6): in Simple, surface Image Enhancement to refine
      this.setActiveTab(this.__imgEnhTabIndex);
      this.imgEnhTab.preview.activate(finalKey2, true);
      try { this.collapseTabSections(this.imgEnhTab); } catch (eCol) {}   // start with right-side menus collapsed
   }
};
// CABRAMAGIC-UI-END

// UI-MODE (F6): make the Image Enhancement pill visible. In Simple mode applyUiMode hides
// all advanced pills; after CabraMagic we surface Image Enhancement so the user can refine.
// No-op in Advanced (already visible). Safe if the tab/pill does not exist.
PIWorkflowOptDialog.prototype.revealImgEnhTab = function() {
   try {
      if (this.imgEnhTab && this.customTabBar && this.customTabBar.tabs &&
          this.customTabBar.tabs[this.__imgEnhTabIndex])
         this.customTabBar.tabs[this.__imgEnhTabIndex].visible = true;
   } catch (e) {}
};

// ANALYSIS-DEFAULTS-UI-BEGIN (F6 v2): seed the manual controls from the analysis of the
// active Pre image. Reads optAnalysisDefaults (engine/defaults.js) and sets the Star
// Reduction, Detail & Contrast and Color Mixer widgets. Runs NO process and modifies no
// view. Rollback: OPT_ANALYSIS_DEFAULTS_ENABLED=false, or remove this block + the button.
PIWorkflowOptDialog.prototype.applyAnalysisDefaults = function() {
   if (typeof OPT_ANALYSIS_DEFAULTS_ENABLED !== "undefined" && !OPT_ANALYSIS_DEFAULTS_ENABLED)
      return;
   var dlg = this;
   var pane = this.preTab ? this.preTab.preview : null;
   if (!pane || !optSafeView(pane.currentView))
      throw new Error("Select a Pre-processing image first.");

   console.show();
   var stats = optCabraAnalyze(pane.currentView);
   var d = optAnalysisDefaults(stats);
   var applied = [];

   // Star Reduction (Post tab) — 1:1 strength.
   if (dlg.ncPostStarRedStrength) {
      try { dlg.ncPostStarRedStrength.setValue(d.starRedStrength); applied.push("Star Reduction Strength=" + d.starRedStrength); } catch (e0) {}
   }
   // Detail & Contrast (Image Enhancement) — route to "By Object Type".
   if (dlg.detailState && dlg.reloadDetailPanels) {
      try {
         dlg.detailState.algoId = "byObjectType";
         dlg.detailState.objType = d.detailObjType;
         dlg.detailState.objIntensity = d.detailObjIntensity;
         dlg.reloadDetailPanels();
         applied.push("Detail=By Object Type/" + d.detailObjType + " (" + ["Low", "Medium", "High"][d.detailObjIntensity] + ")");
      } catch (e1) {}
   }
   // Color Mixer (Image Enhancement) — strength from measured SNR.
   if (dlg.colorMixerState && dlg.ncColorMixerStrength) {
      try {
         dlg.colorMixerState.globalStrength = d.colorMixerStrength;
         dlg.ncColorMixerStrength.setValue(d.colorMixerStrength);
         applied.push("Color Mixer Strength=" + d.colorMixerStrength);
      } catch (e2) {}
   }

   console.noteln("=> Analysis Defaults (" + d.label + (d.narrowband ? "/NB" : "") +
      ", SNR=" + d.snr + "): " + (applied.length ? applied.join("  |  ") : "no manual controls available"));
   (new MessageBox(
      "Manual controls seeded from the active image (" + d.label + ", SNR " + d.snr + "):\n\n" +
      "• " + applied.join("\n• ") + "\n\nReview them in Image Enhancement / Post and adjust before applying.",
      "Analysis Defaults", StdIcon_Information, StdButton_Ok)).execute();
};
// ANALYSIS-DEFAULTS-UI-END

PIWorkflowOptDialog.prototype.finalCleanup = function() {
   try { if (this.previewScheduler) this.previewScheduler.cancelAll(); } catch (eS) {}
   try { if (this.preTab && this.preTab.preview) this.preTab.preview.releaseTransient(); } catch (ePre) {}
   try { if (this.stretchTab && this.stretchTab.preview) this.stretchTab.preview.releaseTransient(); } catch (eStretch) {}
   try { if (this.postTab && this.postTab.preview) this.postTab.preview.releaseTransient(); } catch (ePost) {}
   try { if (this.ccTab && this.ccTab.preview) this.ccTab.preview.releaseTransient(); } catch (eCc) {}
   try { if (this.imgEnhTab && this.imgEnhTab.preview) this.imgEnhTab.preview.releaseTransient(); } catch (eIE) {}
   try { if (optSafeView(this.imgEnhActiveMask)) optCloseView(this.imgEnhActiveMask); this.imgEnhActiveMask = null; this.imgEnhActiveMaskShown = false; } catch (eIEM) {}
   if (optSafeView(this.postActiveMask))
      optCloseView(this.postActiveMask);
   if (optSafeView(this._postLiveMask)) {
      try { optCloseView(this._postLiveMask); } catch (eLM) {}
   }
   this.postActiveMask = null;
   this.postActiveMaskShown = false;
   this._postLiveMask = null;
   this._postLiveMaskBitmap = null;
   if (this.postMaskLiveCache)
      try { this.postMaskLiveCache.release(); } catch (eLC) {}
   if (this.postMaskMemory) {
      try { this.postMaskMemory.clear(); } catch (eMM) {}
   }
   try { if (this.store) this.store.releaseAll(); } catch (eStore) {}
   try { optI18nClear(); } catch (eI18n) {}   // I18N: drop dead control refs
   try { optClearHistogramCache(); } catch (eHC) {}
   try { optReleaseCcSlotCaches(this); } catch (eCcC) {}
   if (this.removePostFameHooks) try { this.removePostFameHooks(); } catch (eF) {}
};

