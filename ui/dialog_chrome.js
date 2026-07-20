// CONFIG-TAB-BEGIN: builds the Configuration tab page — one collapsible section
// per algorithm menu, with a checkbox per algorithm. Toggling persists the pref
// and re-applies availability so combos/buttons update live. No preview pane.
function optBuildConfigTabPage(dlg) {
   var page = new Control(dlg);
   page.autoFillBackground = true;
   page.backgroundColor = OPT_BG;
   page.sizer = new HorizontalSizer();
   page.sizer.margin = Theme.s7;
   page.sizer.spacing = Theme.s5;

   var card = new Control(page);
   try {
      card.styleSheet =
         "QWidget {" +
         " background-color: " + Theme.surface + ";" +
         " border: 1px solid " + optThemeRgba("border") + ";" +
         " border-radius: " + Theme.rXl + "px;" +
         "}";
   } catch (eCard) {}
   card.sizer = new VerticalSizer();
   card.sizer.margin = 0;
   card.sizer.spacing = 0;
   card.setFixedWidth(420);   // CONFIG-TAB: keep the menu list compact (was full-width).

   var scroll = new ScrollBox(card);
   scroll.autoScroll = true;
   var content = new Control(scroll);
   content.sizer = new VerticalSizer();
   content.sizer.margin = 6;
   content.sizer.spacing = 6;
   scroll.viewport.sizer = new VerticalSizer();
   scroll.viewport.sizer.add(content);
   card.sizer.add(scroll);

   content.sizer.add(optEngineTitle(content, "CONFIGURATION"));
   content.sizer.add(optInfoLabel(content,
      "Enable or disable the algorithms you want available in each menu. Disabled algorithms stay listed but cannot be applied (their Apply button greys out and the selector skips them). Changes are saved automatically and persist between sessions."));

   dlg.__configSections = [];
   dlg.__configCheckBoxes = [];   // SESSION-PERSISTENCE: refs so Load Preset can refresh the toggles
   for (var i = 0; i < OPT_ALGO_MENUS.length; ++i) {
      (function(menu) {
         var section = optSection(content, menu.label);
         for (var j = 0; j < menu.algos.length; ++j) {
            (function(algo) {
               var cb = new CheckBox(section.body);
               cb.text = algo.label;
               cb.checked = optIsAlgoEnabled(menu.id, algo.id);
               optThemeApplyCheckBox(cb);
               cb.onCheck = function(checked) {
                  optSetAlgoEnabled(menu.id, algo.id, checked);
                  try { optApplyProcessAvailabilityToUI(dlg); } catch (eApply) {}
               };
               section.body.sizer.add(cb);
               dlg.__configCheckBoxes.push({ menuId: menu.id, algoId: algo.id, cb: cb });
            })(menu.algos[j]);
         }
         content.sizer.add(section.bar);
         content.sizer.add(section.body);
         // Start COLLAPSED so the Configuration tab opens tidy (user expands the menu they want).
         try { if (typeof section.setExpanded === "function") section.setExpanded(false); } catch (eEx) {}
         dlg.__configSections.push(section);
      })(OPT_ALGO_MENUS[i]);
   }

   // CONFIG-TAB trimmed (2026-06-30, user request): the Workflow Presets, Image Quality,
   // Mask Maker and Diagnostics cards were removed. Their engines stay (engine/session.js,
   // engine/metrics.js, engine/masks.js, engine/diag.js — diag still records errors internally),
   // so nothing breaks; only the Configuration-tab UI for them is gone. Image-quality metrics
   // now live on the status line under each workflow preview (OptPreviewPane.updateQualityStatus).

   content.sizer.addStretch();

   page.sizer.add(card);
   page.sizer.addStretch();   // CONFIG-TAB: left-align the compact card instead of filling the tab.
   return page;
}
// CONFIG-TAB-END

function optInitPIWorkflowOptDialog(self) {
   self.windowTitle = "PI Workflow V8";
   self.styleSheet = OPT_CSS_GLOBAL;
   optI18nClear();   // I18N: fresh translatable-control registry for this dialog
   self.store = new OptImageStore();
   self.stretchEngine = new OptStretchingEngine();
   self.previewScheduler = new OptPreviewScheduler(self);
   self.selectedRecipe = "SHO";
   self.recipeManuallySelected = false;   // DBXtract path uses HSO as default unless user clicks a palette button
   self.recipeButtons = [];
   self.sharedPreviewReduction = OPT_PREVIEW_REDUCTION_DEFAULT;
   self.__syncingSharedPreviewReduction = false;
   self.tabsByName = {};
   // CONFIG-TAB: load persisted algorithm enable/disable prefs before availability runs.
   if (typeof OPT_CONFIG_TAB_ENABLED !== "undefined" && OPT_CONFIG_TAB_ENABLED && typeof optLoadAlgoPrefs === "function")
      optLoadAlgoPrefs();
   self.dependencyReport = optRunDependencyChecks();
   self.luminanceWeight = 1.0;   // LRGB-WEIGHT — default 100% (current behavior). Range [0..2].
   self.postActiveMask = null;
   self.postActiveMaskShown = false;
   self._postLiveMask = null;
   self._postLiveMaskBitmap = null;
   self.postFameState = null;
   self.postMaskMemory = new OptMaskMemoryManager(OPT_MASK_MEMORY_SLOTS);
   self.postMaskLiveCache = new OptPostMaskLiveCache();
   self._postShowHideMaskButtons = [];
   self.refreshPostMaskMemoryUi = null;
   self.removePostFameHooks = null;
   self.schedulePostMaskLive = null;

   self.sizer = new VerticalSizer();
   self.sizer.margin = 6;
   self.sizer.spacing = 4;
   self.titleBar = optBuildWorkflowTitleBar(self);
   self.sizer.add(self.titleBar);

   // Phase 2b: custom pill-segmented tab bar above the TabBox. Clicks here
   // drive `this.tabs.currentPageIndex`; TabBox.onPageSelected mirrors back.
   // >>> SPLIT COMPARE BEGIN >>>
   var dialogRef = self;
   var tabRow = new Control(self);
   tabRow.sizer = new HorizontalSizer();
   tabRow.sizer.spacing = 8;

   // CONFIG-TAB: append the Configuration pill when the feature flag is on.
   var optTabLabels = [
      "Pre Processing",
      "Stretching",
      "Post Processing",
      "Channel Combination"
   ];
   if (typeof OPT_IMG_ENH_ENABLED !== "undefined" && OPT_IMG_ENH_ENABLED)
      optTabLabels.push("Image Enhancement");
   if (typeof OPT_ANNOTATIONS_ENABLED !== "undefined" && OPT_ANNOTATIONS_ENABLED)
      optTabLabels.push("Annotations");
   if (typeof OPT_CONFIG_TAB_ENABLED !== "undefined" && OPT_CONFIG_TAB_ENABLED)
      optTabLabels.push("Configuration");
   self.customTabBar = optBuildThemedTabBar(tabRow, optTabLabels);
   tabRow.sizer.add(self.customTabBar, 100);

   self.btnGlobalExport = optButton(tabRow, "Export", 60);
   optThemeApplyActionButton(self.btnGlobalExport);
   optApplyExplicitTooltip(self.btnGlobalExport, "global.export");
   self.btnGlobalExport.onClick = function() {
      var activeTab = null;
      var idx = dialogRef.tabs.currentPageIndex;
      if (idx === 0) activeTab = dialogRef.preTab;
      else if (idx === 1) activeTab = dialogRef.stretchTab;
      else if (idx === 2) activeTab = dialogRef.postTab;
      else if (idx === 3) activeTab = dialogRef.ccTab;
      else if (dialogRef.imgEnhTab && idx === dialogRef.__imgEnhTabIndex) activeTab = dialogRef.imgEnhTab;
      if (activeTab && activeTab.preview) {
         activeTab.preview.exportCurrent();
      }
   };

   self.btnGlobalExportTif = optButton(tabRow, "Export TIF", 80);
   optThemeApplyActionButton(self.btnGlobalExportTif);
   optApplyExplicitTooltip(self.btnGlobalExportTif, "global.exportTif");
   self.btnGlobalExportTif.onClick = function() {
      var activeTab = null;
      var idx = dialogRef.tabs.currentPageIndex;
      if (idx === 0) activeTab = dialogRef.preTab;
      else if (idx === 1) activeTab = dialogRef.stretchTab;
      else if (idx === 2) activeTab = dialogRef.postTab;
      else if (idx === 3) activeTab = dialogRef.ccTab;
      else if (dialogRef.imgEnhTab && idx === dialogRef.__imgEnhTabIndex) activeTab = dialogRef.imgEnhTab;
      if (activeTab && activeTab.preview) {
         activeTab.preview.exportCurrentTiff();
      }
   };

   // EXPORT-PLUS-UI (F7): multi-format "Export As…" (TIFF/PNG/JPEG/FITS/XISF by extension).
   self.btnGlobalExportAs = optButton(tabRow, "Export As…", 90);
   optThemeApplyActionButton(self.btnGlobalExportAs);
   optApplyExplicitTooltip(self.btnGlobalExportAs, "global.exportAs");
   self.btnGlobalExportAs.onClick = function() {
      optSafeUi("Export As", function() {
         var activeTab = null, idx = dialogRef.tabs.currentPageIndex;
         if (idx === 0) activeTab = dialogRef.preTab;
         else if (idx === 1) activeTab = dialogRef.stretchTab;
         else if (idx === 2) activeTab = dialogRef.postTab;
         else if (idx === 3) activeTab = dialogRef.ccTab;
         else if (dialogRef.imgEnhTab && idx === dialogRef.__imgEnhTabIndex) activeTab = dialogRef.imgEnhTab;
         var pane = (activeTab && activeTab.preview) ? activeTab.preview : null;
         var view = pane ? (pane.candidateView || pane.currentView) : null;
         if (!optSafeView(view))
            throw new Error("No image to export on this tab. Select or process an image first.");
         var fd = new SaveFileDialog();
         fd.caption = "Export image as…";
         fd.filters = [["TIFF 16-bit", "*.tif"], ["PNG 16-bit", "*.png"], ["JPEG", "*.jpg"],
                       ["FITS 32-bit float", "*.fits"], ["XISF 32-bit float", "*.xisf"]];
         if (!fd.execute()) return;
         // PROC-LOG: build the log, embed it in the written file (HISTORY keywords,
         // when the format supports them) and drop .txt/.csv sidecars next to it.
         var built = null;
         try {
            var record = (pane && pane.currentKey) ? dialogRef.store.record(pane.currentKey) : null;
            built = optProcLogBuild(view, record);
         } catch (eB) { built = null; }
         var spec = optExportViewToFile(view, fd.filePath, built ? built.text : null);
         var embedsKeywords = (spec.format === "TIFF" || spec.format === "FITS" || spec.format === "XISF");
         var logMsg = "";
         if (built) {
            var side = optProcLogWriteSidecars(fd.filePath, built.data, built.text);
            if (side.txtPath)
               logMsg = "\n\nProcessing log:\n" + side.txtPath +
                        (side.csvPath ? ("\n" + side.csvPath) : "") +
                        (embedsKeywords ? "\n(embedded in image keywords)" : "");
         }
         new MessageBox("Exported " + spec.format + ":\n" + fd.filePath + logMsg, "PI Workflow", StdIcon_Information, StdButton_Ok).execute();
      });
   };

   // PROC-LOG: there is no dedicated "Log…" button anymore. The processing log
   // (workflow stages + FITS/WBPP acquisition data) now rides along with every
   // export: embedded into the image on "Export" (workspace) and embedded + written
   // as .txt/_astrobin.csv sidecars on "Export TIF" / "Export As…" (disk). See the
   // export flows in ui/panels.js and engine/export.js.

   // UI-MODE (F6): Simple/Advanced toggle, left of the Export buttons. A golden CTA-style
   // toggle button (filled amber when Simple is active, amber ghost when Advanced).
   if (typeof OPT_UI_MODE_ENABLED === "undefined" || OPT_UI_MODE_ENABLED) {
      self.btnSimpleMode = optButton(tabRow, "✨ Simple", 0);
      optApplyExplicitTooltip(self.btnSimpleMode, "global.simpleMode");
      self.applySimpleModeButtonStyle = function(isSimple) {
         optThemeApplyGoldenToggle(self.btnSimpleMode, isSimple);
      };
      self.applySimpleModeButtonStyle(false);
      self.btnSimpleMode.onClick = function() {
         var nowSimple = (self.__uiMode !== "simple");
         self.applyUiMode(nowSimple ? "simple" : "advanced");
         optUiModeWrite(nowSimple ? "simple" : "advanced");
      };
      tabRow.sizer.add(self.btnSimpleMode);
   }

   tabRow.sizer.add(self.btnGlobalExport);
   tabRow.sizer.add(self.btnGlobalExportTif);
   tabRow.sizer.add(self.btnGlobalExportAs);
   self.sizer.add(tabRow);
   // <<< SPLIT COMPARE END <<<

   self.tabs = new TabBox(self);
   // Phase 2b: hide the native QTabBar; the custom bar above is the UI.
   try {
      self.tabs.styleSheet =
         "QTabWidget::pane { border: 0px; }" +
         "QTabBar { height: 0px; min-height: 0px; max-height: 0px; }" +
         "QTabBar::tab { height: 0px; min-height: 0px;" +
         " padding: 0px; margin: 0px; border: 0px; }";
   } catch (eHide) {}
   self.preTab = new OptWorkflowTab(self, OPT_TAB_PRE, "Pre Processing");
   self.stretchTab = new OptWorkflowTab(self, OPT_TAB_STRETCH, "Stretching");
   self.postTab = new OptWorkflowTab(self, OPT_TAB_POST, "Post Processing");
   self.ccTab = new OptWorkflowTab(self, OPT_TAB_CC, "Channel Combination");
   self.tabsByName[OPT_TAB_PRE] = self.preTab;
   self.tabsByName[OPT_TAB_STRETCH] = self.stretchTab;
   self.tabsByName[OPT_TAB_POST] = self.postTab;
   self.tabsByName[OPT_TAB_CC] = self.ccTab;
   // IMG-ENH-BEGIN: Image Enhancement is a full workflow tab (with preview).
   if (typeof OPT_IMG_ENH_ENABLED !== "undefined" && OPT_IMG_ENH_ENABLED) {
      self.imgEnhTab = new OptWorkflowTab(self, OPT_TAB_IMGENH, "Image Enhancement");
      self.tabsByName[OPT_TAB_IMGENH] = self.imgEnhTab;
   }
   // IMG-ENH-END
   // ANNOTATIONS (#13): full workflow tab (Image Selection + memory/preview bar como
   // las demas). configureAnnotTab() añade las secciones de anotacion y el overlay.
   if (typeof OPT_ANNOTATIONS_ENABLED !== "undefined" && OPT_ANNOTATIONS_ENABLED) {
      self.annotTab = new OptWorkflowTab(self, OPT_TAB_ANNOT, "Annotations");
      self.tabsByName[OPT_TAB_ANNOT] = self.annotTab;
   }

   // Eager tab configuration: every tab must be built BEFORE its page is added
   // to the TabBox. Earlier we tried lazy construction (configure on first
   // onTabChanged), but PJSR's ScrollBox viewport does not recalculate the
   // geometry of children added to its content sizer once the page is already
   // visible inside the TabBox. The first visit then showed only the Image
   // Selection section; only switching tabs once forced the hide/show cycle
   // that finally laid out the rest. Building all tabs up-front avoids that
   // path entirely. The __configured flag is kept so ensureTabConfigured()
   // remains a safe no-op.
   self.preTab.__configured = false;
   self.stretchTab.__configured = false;
   self.postTab.__configured = false;
   self.ccTab.__configured = false;
   self.configurePreTab();
   self.preTab.__configured = true;
   self.configureStretchTab();
   self.stretchTab.__configured = true;
   self.configurePostTab();
   self.postTab.__configured = true;
   self.configureCcTab();
   self.ccTab.__configured = true;
   // IMG-ENH-BEGIN
   if (self.imgEnhTab) {
      self.imgEnhTab.__configured = false;
      self.configureImgEnhTab();
      self.imgEnhTab.__configured = true;
   }
   // IMG-ENH-END
   if (self.annotTab) {
      self.annotTab.__configured = false;
      self.configureAnnotTab();
      self.annotTab.__configured = true;
   }

   self.tabs.addPage(self.preTab.page, "0. Pre Processing");
   self.tabs.addPage(self.stretchTab.page, "1. Stretching");
   self.tabs.addPage(self.postTab.page, "2. Post Processing");
   self.tabs.addPage(self.ccTab.page, "3. Channel Combination");
   var optNextTabIndex = 4;
   // IMG-ENH-BEGIN: full tab (with preview) inserted after Channel Combination.
   if (self.imgEnhTab) {
      self.tabs.addPage(self.imgEnhTab.page, optNextTabIndex + ". Image Enhancement");
      self.__imgEnhTabIndex = optNextTabIndex;
      ++optNextTabIndex;
   }
   // IMG-ENH-END
   // ANNOTATIONS-BEGIN (#13): full workflow tab (con preview), insertada ANTES de Configuration.
   if (self.annotTab) {
      self.tabs.addPage(self.annotTab.page, optNextTabIndex + ". Annotations");
      self.__annotTabIndex = optNextTabIndex;
      ++optNextTabIndex;
   }
   // ANNOTATIONS-END
   // CONFIG-TAB-BEGIN: settings-only page (no preview) added last.
   if (typeof OPT_CONFIG_TAB_ENABLED !== "undefined" && OPT_CONFIG_TAB_ENABLED) {
      self.configPage = optBuildConfigTabPage(self);
      self.tabs.addPage(self.configPage, optNextTabIndex + ". Configuration");
      self.__configTabIndex = optNextTabIndex;
      ++optNextTabIndex;
   }
   // CONFIG-TAB-END
   self.sizer.add(self.tabs, 100);

   self.previousTabIndex = 0;
   var dlg = self;
   // Phase 2b: wire custom tab bar -> TabBox.currentPageIndex.
   // PJSR's TabBox does NOT reliably fire onPageSelected when
   // `currentPageIndex` is assigned from code, so a pill click would
   // visually switch the page but skip every onTabChanged side-effect
   // (collapseTabSections, optRefreshCcSlotCombos on CC, preview render).
   // We use a small "pending" flag so we can detect whether onPageSelected
   // fired and only call onTabChanged manually as a fallback. This avoids
   // double-firing on Qt builds where the event DOES fire normally.
   self.__pendingTabClick = -1;
   self.customTabBar.onTabClicked = function(index) {
      dlg.__pendingTabClick = index;
      try { dlg.tabs.currentPageIndex = index; } catch (e) {}
      // If onPageSelected fired synchronously above, it consumed the flag.
      // If it didn't (PJSR/Qt quirk on programmatic assignment), the flag
      // is still set and we drive onTabChanged manually so the CC combo
      // refresh, section collapse and preview render still happen.
      if (dlg.__pendingTabClick === index) {
         dlg.__pendingTabClick = -1;
         dlg.onTabChanged(index);
      }
   };
   self.tabs.onPageSelected = function(index) {
      // Phase 2b: keep the custom bar visually in sync, including the case
      // where another part of the code drives `currentPageIndex = N`
      // directly (see "To Stretching" / "To Post Processing" CTAs).
      dlg.__pendingTabClick = -1;
      try { dlg.customTabBar.setActiveTab(index); } catch (e) {}
      dlg.onTabChanged(index);
   };

   self.initializeSectionExpansion();
   self.refreshSelections();
   self.refreshRecipeButtons();
   self.refreshWorkflowButtons();
   self.runDependencyChecks();
   optApplyContextTooltipsDeep(self, 0);
   // Build UI policy registry AFTER optApplyContextTooltipsDeep so the first
   // applyUIPolicies invocation caches the real dictionary tooltips (not the
   // empty defaults that exist before the deep tooltip pass runs).
   // Subsequent calls via refreshWorkflowButtons / runDependencyChecks reuse
   // the cache and correctly restore original tooltips on re-enable.
   self.buildUIPolicies();
   try { self.applyUIPolicies(); } catch (ePolInit) {}

   // UI-MODE (F6): capture advanced Pre sections and apply the persisted view mode.
   if (typeof OPT_UI_MODE_ENABLED === "undefined" || OPT_UI_MODE_ENABLED) {
      try {
         self.captureAdvancedPreSections();
         var optInitUiMode = optUiModeRead();
         self.applyUiMode(optInitUiMode);   // also styles btnSimpleMode + toggles CabraMagic visibility
      } catch (eUiMode) {}
   }

   self.adjustToContents();
   self.resize(1280, 820);
}

class PIWorkflowOptDialog extends Dialog {
   constructor() {
      super();
      optInitPIWorkflowOptDialog(this);
   }
}

PIWorkflowOptDialog.prototype.initializeSectionExpansion = function() {
   var names = [OPT_TAB_PRE, OPT_TAB_STRETCH, OPT_TAB_POST, OPT_TAB_CC];
   // Las pestañas extra (Mejora de Imagen, Anotaciones) también se configuran al
   // arranque y nacen expandidas → colapsarlas igual que las estándar.
   if (typeof OPT_TAB_IMGENH !== "undefined" && this.imgEnhTab) names.push(OPT_TAB_IMGENH);
   if (typeof OPT_TAB_ANNOT !== "undefined" && this.annotTab) names.push(OPT_TAB_ANNOT);
   for (var i = 0; i < names.length; ++i) {
      this.collapseTabSections(this.tabsByName[names[i]]);
   }
   if (this.preTab && this.preTab.selectionSection && typeof this.preTab.selectionSection.setExpanded === "function")
      this.preTab.selectionSection.setExpanded(true);
};

PIWorkflowOptDialog.prototype.collapseTabSections = function(tab) {
   if (!tab || !tab.sections)
      return;
   for (var j = 0; j < tab.sections.length; ++j)
      if (tab.sections[j] && typeof tab.sections[j].setExpanded === "function")
         tab.sections[j].setExpanded(false);
};

// UI-MODE (F6): show/hide advanced UI for the Simple/Advanced two-speed view.
// Simple = only the Pre Processing tab, trimmed to image selection + crop +
// CabraMagic (the one-click path). Advanced = the full manual workflow.
PIWorkflowOptDialog.prototype.applyUiMode = function(mode) {
   if (typeof OPT_UI_MODE_ENABLED !== "undefined" && !OPT_UI_MODE_ENABLED) mode = "advanced";
   var simple = (mode === "simple");
   // Advanced tabs: hide every pill except Pre Processing (index 0).
   if (this.customTabBar && this.customTabBar.tabs)
      for (var i = 1; i < this.customTabBar.tabs.length; ++i)
         try { this.customTabBar.tabs[i].visible = !simple; } catch (eP) {}
   // Advanced Pre-tab sections (Plate Solving … Continuum). The "Apply all" button
   // lives inside section.body, so hiding the body hides it too — no orphans.
   // In Advanced the body visibility must follow each section's OWN collapse state
   // (section.expanded) — forcing it true here would re-expand sections that
   // initializeSectionExpansion / the user had collapsed.
   var adv = this.__advancedPreSections || [];
   for (var k = 0; k < adv.length; ++k)
      try { adv[k].bar.visible = !simple; adv[k].body.visible = simple ? false : (adv[k].expanded === true); } catch (eS) {}
   // CabraMagic button + intensity selector = SIMPLE-only (the one-click path).
   var so = (this.preTab && this.preTab.simpleOnlyWidgets) ? this.preTab.simpleOnlyWidgets : [];
   for (var c = 0; c < so.length; ++c)
      try { so[c].visible = simple; } catch (eC) {}
   // Suggest-Defaults seeds the manual controls (advanced tabs) -> ADVANCED-only.
   var ao = (this.preTab && this.preTab.advancedOnlyWidgets) ? this.preTab.advancedOnlyWidgets : [];
   for (var a2 = 0; a2 < ao.length; ++a2)
      try { ao[a2].visible = !simple; } catch (eA2) {}
   if (simple) {
      try { this.tabs.currentPageIndex = 0; } catch (e0) {}
      try { this.customTabBar.setActiveTab(0); } catch (e1) {}
   }
   this.__uiMode = simple ? "simple" : "advanced";
   if (this.applySimpleModeButtonStyle) try { this.applySimpleModeButtonStyle(simple); } catch (eBtn) {}
};

// Collect the advanced Pre-tab sections (everything except Image Selection + Crop)
// by reference, so applyUiMode can toggle them without relying on order or titles.
PIWorkflowOptDialog.prototype.captureAdvancedPreSections = function() {
   this.__advancedPreSections = [];
   var sects = (this.preTab && this.preTab.sections) ? this.preTab.sections : [];
   for (var i = 0; i < sects.length; ++i) {
      var s = sects[i];
      if (!s) continue;
      if (s === this.preTab.selectionSection) continue;   // keep Image Selection
      if (s === this.__cropSection) continue;             // keep Crop
      this.__advancedPreSections.push(s);
   }
};

function optBuildStretchZone(tab, title, isStars) {
   var dlg = tab.dialog;
   var section = optSection(tab.leftContent, title);
   var body = section.body;
   var algoLabels = isStars ?
      ["AutoGHS", "Star Stretch", "Multiscale Adaptive Stretch", "Auto STF (Histogram Transform)", "Curves"] :
      ["AutoGHS", "Auto STF (Histogram Transform)", "Multiscale Adaptive Stretch", "Statistical Stretch", "Curves"];
   var algoIds = isStars ? ["AGHS", "STAR", "MAS", "STF", "CURVES"] : ["AGHS", "STF", "MAS", "SS", "CURVES"];
   var rowAlgo = optComboRow(body, "Algorithm:", algoLabels, 80);
   body.sizer.add(rowAlgo.row);

   var zone = {
      isStars: isStars === true,
      section: section,
      combo: rowAlgo.combo,
      algorithmIds: algoIds
   };

   zone.stfGroup = optInnerGroup(body, "Auto STF Settings");
   zone.stfShadow = optNumeric(zone.stfGroup, "Shad. Clip.", -10.0, 0.0, isStars ? -5.0000 : -2.8000, 4, 80);
   zone.stfMid = optNumeric(zone.stfGroup, "Targ. Bkgd", 0.0, 1.0, isStars ? 0.0100 : 0.2500, 4, 80);
   // Override the shared "Target background:" tooltip with the STF-specific one
   try {
      var ttStf = optTooltipTextByKey("stretch.stf.targetBg");
      if (ttStf) {
         zone.stfMid.toolTip = ttStf;
         optApplyTooltip(zone.stfMid.label, ttStf);
         optApplyTooltip(zone.stfMid.slider, ttStf);
         optApplyTooltip(zone.stfMid.edit, ttStf);
      }
   } catch (eTT0) {}
   zone.stfBoostClip = optNumeric(zone.stfGroup, "Boost Clip", 0.0, 5.0, 0.75, 2, 80);
   zone.stfBoostBg = optNumeric(zone.stfGroup, "Boost Bkgd", 0.0, 10.0, 2.00, 2, 80);
   zone.stfBoost = new CheckBox(zone.stfGroup);
   optI18nLabel(zone.stfBoost, "Apply Boost to Auto STF");
   zone.stfBoost.checked = false;
   optApplyCheckBoxTooltip(zone.stfBoost);
   zone.updateStfBoostUiState = function() {
      var enabled = zone.stfBoost.checked === true;
      zone.stfBoostClip.enabled = enabled;
      zone.stfBoostBg.enabled = enabled;
   };
   zone.stfBoost.onCheck = function() { zone.updateStfBoostUiState(); };
   zone.stfGroup.sizer.add(zone.stfShadow);
   zone.stfGroup.sizer.add(zone.stfMid);
   zone.stfGroup.sizer.add(zone.stfBoostClip);
   zone.stfGroup.sizer.add(zone.stfBoostBg);
   zone.stfGroup.sizer.add(zone.stfBoost);
   zone.updateStfBoostUiState();
   body.sizer.add(zone.stfGroup);

   zone.masGroup = optInnerGroup(body, "Multiscale Adaptive Settings");
   zone.msBg = optNumeric(zone.masGroup, "Targ. Bkgd", 0.0, 1.0, isStars ? 0.020 : 0.150, 3, 80);
   // Override the shared "Target background:" tooltip with the MAS-specific one
   try {
      var ttMasBg = optTooltipTextByKey("stretch.mas.bg");
      if (ttMasBg) {
         zone.msBg.toolTip = ttMasBg;
         optApplyTooltip(zone.msBg.label, ttMasBg);
         optApplyTooltip(zone.msBg.slider, ttMasBg);
         optApplyTooltip(zone.msBg.edit, ttMasBg);
      }
   } catch (eTT1) {}
   zone.msAgg = optNumeric(zone.masGroup, "Aggress.", 0.0, 1.0, isStars ? 0.10 : 0.70, 2, 80);
   zone.msDrc = optNumeric(zone.masGroup, "Dyn. Range", 0.0, 1.0, isStars ? 1.0 : 0.40, 2, 80);
   zone.msScale = optComboRow(zone.masGroup, "Scale separation:", ["16", "32", "64", "128", "256", "512", "1024", "2048", "4096"], 170);
   zone.msScale.combo.currentItem = 6;
   zone.msCR = new CheckBox(zone.masGroup);
   zone.msCR.text = "Contrast Recovery";
   zone.msCR.checked = true;
   optApplyCheckBoxTooltip(zone.msCR);
   zone.msIntensity = optNumeric(zone.masGroup, "Intensity:", 0.0, 1.0, 1.000, 3, 170);
   zone.msCS = new CheckBox(zone.masGroup);
   zone.msCS.text = "Color Saturation";
   zone.msCS.checked = true;
   optApplyCheckBoxTooltip(zone.msCS);
   zone.msCSAmount = optNumeric(zone.masGroup, "Amt", 0.0, 1.0, 0.75, 3, 80);
   // Override the shared "Amount:" tooltip with the MAS Color-Saturation-specific one
   try {
      var ttMasAmt = optTooltipTextByKey("stretch.mas.csAmount");
      if (ttMasAmt) {
         zone.msCSAmount.toolTip = ttMasAmt;
         optApplyTooltip(zone.msCSAmount.label, ttMasAmt);
         optApplyTooltip(zone.msCSAmount.slider, ttMasAmt);
         optApplyTooltip(zone.msCSAmount.edit, ttMasAmt);
      }
   } catch (eTT2) {}
   zone.msCSBoost = optNumeric(zone.masGroup, "Boost:", 0.0, 1.0, 0.50, 3, 170);
   // Override the shared "Boost:" tooltip with the MAS Color-Saturation-specific one
   try {
      var ttMasBst = optTooltipTextByKey("stretch.mas.csBoost");
      if (ttMasBst) {
         zone.msCSBoost.toolTip = ttMasBst;
         optApplyTooltip(zone.msCSBoost.label, ttMasBst);
         optApplyTooltip(zone.msCSBoost.slider, ttMasBst);
         optApplyTooltip(zone.msCSBoost.edit, ttMasBst);
      }
   } catch (eTT3) {}
   zone.msCSLightness = new CheckBox(zone.masGroup);
   zone.msCSLightness.text = "Lightness mask";
   zone.msCSLightness.checked = true;
   optApplyCheckBoxTooltip(zone.msCSLightness);
   zone.masGroup.sizer.add(zone.msBg);
   zone.masGroup.sizer.add(zone.msAgg);
   zone.masGroup.sizer.add(zone.msDrc);
   zone.masGroup.sizer.add(zone.msScale.row);
   zone.masGroup.sizer.add(zone.msCR);
   zone.masGroup.sizer.add(zone.msIntensity);
   zone.masGroup.sizer.add(zone.msCS);
   zone.masGroup.sizer.add(zone.msCSAmount);
   zone.masGroup.sizer.add(zone.msCSBoost);
   zone.masGroup.sizer.add(zone.msCSLightness);
   zone.msCR.onCheck = function(checked) {
      zone.msScale.combo.enabled = checked;
      zone.msIntensity.enabled = checked;
   };
   zone.msCS.onCheck = function(checked) {
      zone.msCSAmount.enabled = checked;
      zone.msCSBoost.enabled = checked;
      zone.msCSLightness.enabled = checked;
   };
   zone.msCR.onCheck(zone.msCR.checked);
   zone.msCS.onCheck(zone.msCS.checked);
   body.sizer.add(zone.masGroup);

   zone.statGroup = null;
   if (!isStars) {
      zone.statGroup = optInnerGroup(body, "Statistical Settings");
      zone.statMed = optNumeric(zone.statGroup, "Targ. Med", 0.01, 1.0, 0.25, 2, 80);
      zone.statBp = optNumeric(zone.statGroup, "Bp. Sigma", 0.0, 10.0, 5.0, 2, 80);
      zone.statClip = new CheckBox(zone.statGroup);
      optI18nLabel(zone.statClip, "No Black Clip");
      optApplyCheckBoxTooltip(zone.statClip);
      zone.statHdr = new CheckBox(zone.statGroup);
      optI18nLabel(zone.statHdr, "HDR Compress");
      zone.statHdr.checked = false;
      optApplyCheckBoxTooltip(zone.statHdr);
      zone.statHdrAmt = optNumeric(zone.statGroup, "HDR Amt", 0.0, 1.0, 0.25, 2, 80);
      zone.statHdrKnee = optNumeric(zone.statGroup, "HDR Knee", 0.1, 1.0, 0.35, 2, 80);
      zone.statLuma = new CheckBox(zone.statGroup);
      optI18nLabel(zone.statLuma, "Luma Only (preserve color)");
      zone.statLuma.checked = false;
      optApplyCheckBoxTooltip(zone.statLuma);
      zone.statBlend = optNumeric(zone.statGroup, "Luma Blend", 0.0, 1.0, 0.60, 2, 80);
      zone.statNorm = new CheckBox(zone.statGroup);
      zone.statNorm.text = "Normalize Range [0,1]";
      optApplyCheckBoxTooltip(zone.statNorm);
      zone.statCurve = optNumeric(zone.statGroup, "Cv. Boost", 0.0, 0.5, 0.00, 2, 80);
      zone.statGroup.sizer.add(zone.statMed);
      zone.statGroup.sizer.add(zone.statBp);
      zone.statGroup.sizer.add(zone.statClip);
      zone.statGroup.sizer.add(zone.statHdr);
      zone.statGroup.sizer.add(zone.statHdrAmt);
      zone.statGroup.sizer.add(zone.statHdrKnee);
      zone.statGroup.sizer.add(zone.statLuma);
      zone.statGroup.sizer.add(zone.statBlend);
      zone.statGroup.sizer.add(zone.statNorm);
      zone.statGroup.sizer.add(zone.statCurve);
      zone.statHdr.onCheck = function(checked) {
         zone.statHdrAmt.enabled = checked;
         zone.statHdrKnee.enabled = checked;
      };
      zone.statLuma.onCheck = function(checked) {
         zone.statBlend.enabled = checked;
      };
      zone.statHdr.onCheck(zone.statHdr.checked);
      zone.statLuma.onCheck(zone.statLuma.checked);
      body.sizer.add(zone.statGroup);
   }

   zone.starGroup = null;
   if (isStars) {
      zone.starGroup = optInnerGroup(body, "Star Stretch Settings");
      zone.starAmount = optNumeric(zone.starGroup, "Stretch Amt", 0.0, 8.0, 6.5, 2, 90);
      zone.starSat = optNumeric(zone.starGroup, "Color Boost", 0.0, 2.0, 1.0, 2, 90);
      zone.starGroup.sizer.add(zone.starAmount);
      zone.starGroup.sizer.add(zone.starSat);
      body.sizer.add(zone.starGroup);
      // NB-RGB-STARS-BEGIN: ALWAYS-VISIBLE in the Stars zone (independent of the selected
      // algorithm) — produce realistic RGB star colour from the narrowband channels
      // (SetiAstro NBtoRGBStars). Enabled only when H/O/HSO info is present (set in refresh).
      zone.nbStarsGroup = optInnerGroup(body, "Star Colour");
      zone.useNbStars = new CheckBox(zone.nbStarsGroup);
      optI18nLabel(zone.useNbStars, "Use NB stars to produce RGB stars");
      optApplyCheckBoxTooltip(zone.useNbStars);
      zone.useNbStars.enabled = false;
      zone.nbStarsGroup.sizer.add(zone.useNbStars);
      // Color Boost lives here (not in "Star Stretch Settings") so it is available for the
      // NB->RGB transform under any algorithm. Enabled only while the checkbox is on, since
      // the result is a colour image even though the NB inputs are mono.
      zone.nbColorBoost = optNumeric(zone.nbStarsGroup, "Color Boost", 0.0, 2.0, 1.0, 2, 90);
      zone.nbColorBoost.enabled = false;
      zone.nbStarsGroup.sizer.add(zone.nbColorBoost);
      zone.useNbStars.onCheck = function(checked) {
         zone.nbColorBoost.enabled = checked;
      };
      // NOTE: nbStarsGroup is added to body.sizer at the very bottom (just above the
      // Preview/To Post buttons) so it stays pinned there regardless of which algorithm
      // group is visible. See the body.sizer.add(zone.nbStarsGroup) right before rowButtons.
      // NB-RGB-STARS-END
   }

   // AUTOGHS-UI-BEGIN — AutoGHS subcard. Target median (0.22), highlight
   // protection (0.92), local intensity b (1.0) and luminance color mode are
   // fixed in the engine (see OPT_AUTOGHS_* constants in PI Workflow.js).
   zone.aghsGroup = optInnerGroup(body, "AutoGHS Settings");
   zone.aghsSigmas = optNumeric(zone.aghsGroup, "Sigmas Center:", -3.0, 6.0, 1.0, 2, 120);
   zone.aghsIntensity = optNumeric(zone.aghsGroup, "Stretch Int. (S):", 0.0, 3.0, 0.7, 2, 120);
   zone.aghsIterations = optNumeric(zone.aghsGroup, "Iterations:", 1, 30, 10, 0, 120);
   zone.aghsBp = optNumeric(zone.aghsGroup, "Bp. Sigmas:", 0.0, 6.0, 2.8, 2, 120);
   // RGB/STARLESS only: colour saturation of the stretch (chroma damping toward the
   // stretched luminance). 1 = full colour; <1 = less saturated (and softer star cores);
   // >1 = more saturated. Stars zone uses the engine default (fixed) and has no slider.
   if (!isStars) {
      zone.aghsSaturation = optNumeric(zone.aghsGroup, "Saturation:", 0.0, 1.0, 0.95, 2, 120);
      optApplyExplicitTooltip(zone.aghsSaturation, "autoghs.saturation");
   }
   // Explicit per-control tooltips: the generic "numeric.<label>" lookups would
   // collide with other cards (e.g. NXT "Iterations:", Statistical "Bp. Sigma").
   try {
      var aghsTT = [
         [zone.aghsSigmas, "aghs.sigmasCenter"],
         [zone.aghsIntensity, "aghs.stretchIntensity"],
         [zone.aghsIterations, "aghs.iterations"],
         [zone.aghsBp, "aghs.blackPointSigmas"]
      ];
      for (var iTTA = 0; iTTA < aghsTT.length; ++iTTA) {
         var ttAghs = optTooltipTextByKey(aghsTT[iTTA][1]);
         if (ttAghs) {
            aghsTT[iTTA][0].toolTip = ttAghs;
            optApplyTooltip(aghsTT[iTTA][0].label, ttAghs);
            optApplyTooltip(aghsTT[iTTA][0].slider, ttAghs);
            optApplyTooltip(aghsTT[iTTA][0].edit, ttAghs);
         }
      }
   } catch (eTTA) {}
   zone.aghsGroup.sizer.add(zone.aghsSigmas);
   zone.aghsGroup.sizer.add(zone.aghsIntensity);
   zone.aghsGroup.sizer.add(zone.aghsIterations);
   zone.aghsGroup.sizer.add(zone.aghsBp);
   if (zone.aghsSaturation) zone.aghsGroup.sizer.add(zone.aghsSaturation);
   body.sizer.add(zone.aghsGroup);
   // AUTOGHS-UI-END

   zone.curvesGroup = optInnerGroup(body, "Curves Settings");
   zone.curvesPoints = { K: [[0,0],[1,1]], R: [[0,0],[1,1]], G: [[0,0],[1,1]], B: [[0,0],[1,1]], S: [[0,0],[1,1]] };
   zone.curvesChan = optComboRow(zone.curvesGroup, "Channel:", ["RGB/K", "Red", "Green", "Blue", "Saturation"], 118);
   zone.curvesContrast = optNumeric(zone.curvesGroup, "Contrast:", 0.0, 1.0, 0.0, 2, 150);
   zone.curvesBright = optNumeric(zone.curvesGroup, "Brightness:", -0.5, 0.5, 0.0, 3, 150);
   zone.curvesShadows = optNumeric(zone.curvesGroup, "Shadows", 0.0, 0.5, 0.0, 3, 150);
   zone.curvesHighlights = optNumeric(zone.curvesGroup, "Highlights", 0.0, 0.5, 0.0, 3, 150);
   zone.curvesSaturation = optNumeric(zone.curvesGroup, "Saturation:", 0.0, 2.0, 1.0, 2, 150);
   zone.curvesLive = new CheckBox(zone.curvesGroup);
   optI18nLabel(zone.curvesLive, "Live");
   // Use Stretching-specific Live tooltip, not the Channel Combination one
   try {
      var ttCurvesLive = optTooltipTextByKey("stretch.curves.live");
      if (ttCurvesLive)
         zone.curvesLive.toolTip = ttCurvesLive;
   } catch (eCL) {}
   zone.curvesGroup.sizer.add(zone.curvesChan.row);
   zone.curvesGroup.sizer.add(zone.curvesContrast);
   zone.curvesGroup.sizer.add(zone.curvesBright);
   zone.curvesGroup.sizer.add(zone.curvesShadows);
   zone.curvesGroup.sizer.add(zone.curvesHighlights);
   zone.curvesGroup.sizer.add(zone.curvesSaturation);
   zone.curvesGroup.sizer.add(zone.curvesLive);
   body.sizer.add(zone.curvesGroup);
   zone.curvesHistogram = null;
   zone.computeCurvesHistogram = function() {
      var key = dlg.resolveStretchZoneKey(isStars);
      var view = key ? dlg.store.record(key).view : null;
      zone.curvesHistogram = optSafeView(view) ? optGetCachedHistogram(view) : null;
   };
   zone.updateCurvesWidget = function() {
      dlg.activeStretchCurvesZone = zone;
      if (dlg.stretchCurvesWidget) {
         zone.computeCurvesHistogram();
         dlg.stretchCurvesWidget.__zone = zone;
         dlg.stretchCurvesWidget.__hist = zone.curvesHistogram;
         var idx = zone.curvesChan ? zone.curvesChan.combo.currentItem : 0;
         var key = ["K", "R", "G", "B", "S"][idx] || "K";
         dlg.stretchCurvesWidget.__pts = zone.curvesPoints[key] || [[0, 0], [1, 1]];
         dlg.stretchCurvesWidget.repaint();
      }
      if (dlg.updateStretchCurvesWidgetVisibility)
         dlg.updateStretchCurvesWidgetVisibility();
   };
   zone.syncCurvesFromControls = function(force) {
      var idx = zone.curvesChan ? zone.curvesChan.combo.currentItem : 0;
      var key = ["K", "R", "G", "B", "S"][idx] || "K";
      if (force === true || !zone.curvesManual)
         zone.curvesPoints[key] = optCurvePointsFromControls({
            contrast: zone.curvesContrast,
            brightness: zone.curvesBright,
            shadows: zone.curvesShadows,
            highlights: zone.curvesHighlights,
            saturation: zone.curvesSaturation
         });
   };
   zone.scheduleCurvesLive = function(delayMs) {
      if (!(zone.curvesLive && zone.curvesLive.checked) || zone.getAlgorithmId() !== "CURVES")
         return;
      zone.computeCurvesHistogram();
      zone.updateCurvesWidget();
      dlg.previewScheduler.request("stretch.curves." + (isStars ? "stars" : "rgb"), function() {
         var key = dlg.resolveStretchZoneKey(isStars);
         if (!key)
            return;
         if (!tab.preview.activate(key, false))
            return;
         tab.preview.beginCandidateFromFactory("Stretch CURVES (live)", function(currentView) {
            // PERF-PLAN-A: full-res live candidate for Stretch Curves (sharp at any zoom).
            var live = optCreateLiveCandidateView(currentView, "Opt_Live_stretch_curves", dlg, optLiveFullResDim(currentView));
            return optApplyStretchCandidate(live, "CURVES", zone, dlg) || live;
         }, "stretch_curves", {
            upgradeFn: function() {
               var pane = tab.preview;
               if (!pane || !optSafeView(pane.currentView))
                  return null;
               var full = optCloneView(pane.currentView, "Opt_Candidate_" + pane.currentKey + "_Stretch_CURVES_Full", false);
               try {
                  return optApplyStretchCandidate(full, "CURVES", zone, dlg) || full;
               } catch (e) {
                  optCloseView(full);
                  throw e;
               }
            }
         });
      }, {
         debounceMs: delayMs || 160,
         statusLabel: tab.preview.status,
         busyText: "<b>Live:</b> rendering Stretch Curves...",
         doneText: "<b>Live:</b> Stretch Curves preview ready.",
         errorText: "<b>Live:</b> Stretch Curves preview failed.",
         onError: function(k, e) { console.warningln("Stretch Curves live preview error: " + e.message); }
      });
   };
   var stretchCurvesChanged = function() {
      zone.curvesManual = false;
      zone.syncCurvesFromControls(true);
      zone.scheduleCurvesLive(170);
   };
   zone.curvesChan.combo.onItemSelected = function() {
      zone.syncCurvesFromControls(false);
      zone.updateCurvesWidget();
      zone.scheduleCurvesLive(140);
   };
   zone.curvesContrast.onValueUpdated = stretchCurvesChanged;
   zone.curvesBright.onValueUpdated = stretchCurvesChanged;
   zone.curvesShadows.onValueUpdated = stretchCurvesChanged;
   zone.curvesHighlights.onValueUpdated = stretchCurvesChanged;
   zone.curvesSaturation.onValueUpdated = stretchCurvesChanged;
   zone.curvesLive.onCheck = function(checked) {
      zone.updateCurvesWidget();
      if (checked) zone.scheduleCurvesLive(140);
   };

   // Phase 6.8: status label removed. It was redundant — the preview-pane
   // status line below the image already reports state, and the "Use this
   // Image" button enables only when a candidate is ready, so the inline
   // "Status: Waiting." / "Status: Preview ready." messages added noise
   // without information.

   zone.getAlgorithmId = function() {
      var idx = 0;
      try { idx = zone.combo.currentItem; } catch (e) {}
      if (idx >= 0 && idx < zone.algorithmIds.length)
         return zone.algorithmIds[idx];
      return "STF";
   };
   zone.sync = function() {
      var id = zone.getAlgorithmId();
      zone.stfGroup.visible = id === "STF";
      zone.masGroup.visible = id === "MAS";
      if (zone.statGroup)
         zone.statGroup.visible = id === "SS";
      if (zone.starGroup)
         zone.starGroup.visible = id === "STAR";
      zone.aghsGroup.visible = id === "AGHS";
      zone.curvesGroup.visible = id === "CURVES";
      if (id === "CURVES")
         zone.updateCurvesWidget();
      else if (dlg.updateStretchCurvesWidgetVisibility)
         dlg.updateStretchCurvesWidgetVisibility();
   };
   zone.combo.onItemSelected = function() { zone.sync(); };
   zone.sync();

   // NB-RGB-STARS: pin the "Star Colour" group at the bottom of the column, right above
   // the Preview / To Post buttons, so it does not shift position when the visible
   // algorithm group (AutoGHS, Curves, ...) below it changes.
   if (isStars && zone.nbStarsGroup)
      body.sizer.add(zone.nbStarsGroup);

   var rowButtons = new Control(body);
   rowButtons.sizer = new HorizontalSizer();
   rowButtons.sizer.spacing = 5;
   // Phase 6: stretch both buttons (no fixed widths) so they share the row
   // evenly and survive the 300 px card; shorten "To Post Processing" to
   // "To Post Proc." so it does not get center-clipped at this width.
   zone.btnPreview = optPrimaryButton(rowButtons, "Preview", 0);
   optThemeApplyActionButton(zone.btnPreview);          // neutral secondary
   zone.btnToPost = optPrimaryButton(rowButtons, "To Post", 0);
   optThemeApplyPrimaryCta(zone.btnToPost);             // amber CTA
   rowButtons.sizer.add(zone.btnPreview, 1);
   rowButtons.sizer.add(zone.btnToPost, 1);
   body.sizer.add(rowButtons);

   // ===== COMPARE-BEGIN — Stretch zone Compare button on its own row =====
   // Compare lives on a second row below Preview / To Post so the
   // primary stretch path stays visually dominant; Compare is an
   // exploratory action and reads better as a follow-up step under
   // the main pair instead of squeezed between them.
   var rowCompare = new Control(body);
   rowCompare.sizer = new HorizontalSizer();
   rowCompare.sizer.spacing = 5;
   zone.btnCompare = optButton(rowCompare, "Compare", 0);
   optThemeApplyActionButton(zone.btnCompare);
   optApplyExplicitTooltip(zone.btnCompare, "button.Compare");
   zone.btnCompare.onClick = function() {
      optSafeUi(title + " Compare", function() {
         var key = dlg.resolveStretchZoneKey(isStars);
         if (!key)
            throw new Error(isStars ? "No STARS image available. Run Star Split first." : "No RGB / STARLESS image available in Stretching.");
         if (!tab.preview.activate(key, false))
            throw new Error(optLabelForKey(key) + " image is not valid.");
         optProcessEvents();
         if (tab.preview.currentKey !== key)
            tab.preview.activate(key, false);
         optCompareStretchZone(zone, dlg);
      });
   };
   rowCompare.sizer.add(zone.btnCompare, 1);
   body.sizer.add(rowCompare);
   // ===== COMPARE-END =====

   // ===== STAR-REDUCTION moved to Post Processing (optBuildPostStarReductionSection) =====

   zone.btnPreview.onClick = function() {
      optSafeUi(title + " Preview", function() {
         var key = dlg.resolveStretchZoneKey(isStars);
         if (!key)
            throw new Error(isStars ? "No STARS image available. Run SXT first." : "No RGB / STARLESS image available in Stretching.");
         if (!tab.preview.activate(key, false))
            throw new Error(optLabelForKey(key) + " image is not valid. Please run Star Split again.");
         optProcessEvents();
         // Re-activate after processEvents: a scheduled live-preview callback may have
         // changed currentKey/currentView to the companion image during the event flush.
         if (tab.preview.currentKey !== key)
            tab.preview.activate(key, false);
         tab.preview.beginCandidate("Stretch " + zone.getAlgorithmId(), function(candidate) {
            return optApplyStretchCandidate(candidate, zone.getAlgorithmId(), zone, dlg);
         }, "stretch_" + zone.getAlgorithmId());
      });
   };

   zone.btnToPost.onClick = function() {
      optSafeUi(title + " To Post Processing", function() {
         var key = dlg.resolveStretchZoneKey(isStars);
         if (!key)
            throw new Error(isStars ? "No committed STARS image available." : "No committed RGB / STARLESS image available.");
         tab.preview.activate(key, false);
         dlg.sendActiveToPost();
      });
   };
   tab.leftContent.sizer.add(section.bar);
   tab.leftContent.sizer.add(section.body);
   return zone;
}

// ============================================================================
// >>> HEADER REDESIGN — Phase 2a — easy-rollback block <<<
// ----------------------------------------------------------------------------
// Replaces the original optBuildWorkflowTitleBar with the redesigned header
// described in DESIGN_SPEC §2.2:
//   - Painted 44×44 π logo: surface bg, amber 1.5px ring, italic glyph.
//   - Title "PI Workflow" in tTitle (14pt / 700).
//   - Sub-row: mono version label + "OPTIMIZED" pill (amberSoft / amberRing).
//   - Three header buttons (Thanks, Repositories, Help) restyled with surface
//     bg, borderStrong border, radius rLg, padding 0/16, hover surfaceHover.
// Event handlers are preserved verbatim (Thanks dialog, Repositories dialog,
// Help XHTML opener). To revert this phase, restore the previous
// optBuildWorkflowTitleBar from git history and delete this block.
// ============================================================================

// Picks the most rounded serif available for the π glyph in the logo. The
// spec asks for a soft, humanist look; we prefer Palatino / Book Antiqua /
// Georgia (rounded humanist serifs that ship with Windows) over Cambria or
// DejaVu Serif (more angular). Falls back gracefully if Font.families is
// not exposed by the running PJSR build.
function optThemePickGlyphFont() {
   var preferred = [
      "Palatino Linotype",
      "Book Antiqua",
      "URW Bookman L",
      "Bookman Old Style",
      "Georgia",
      "Cambria",
      "DejaVu Serif",
      "serif"
   ];
   var available = null;
   try { available = Font.families; } catch (e) { available = null; }
   if (!available || available.length < 1)
      return preferred[0]; // best-guess; Qt will substitute if unavailable
   // Font.families is a QStringList bridge object; indexing it directly
   // makes the PJSR strict engine emit Warning 162. Copy into a plain JS
   // array first via String coercion, then iterate on that array.
   var availArr = [];
   try {
      var n = available.length;
      for (var k = 0; k < n; ++k) {
         var fam = "";
         try { fam = String(available[k] || ""); } catch (eFK) {}
         if (fam.length > 0) availArr.push(fam);
      }
   } catch (eA) {}
   if (availArr.length < 1)
      return preferred[0];
   var byLower = {};
   for (var i = 0; i < availArr.length; ++i)
      byLower[availArr[i].toLowerCase()] = availArr[i];
   for (var j = 0; j < preferred.length; ++j) {
      var hit = byLower[preferred[j].toLowerCase()];
      if (hit) return hit;
   }
   return preferred[0];
}

function optThemeBuildLogoBitmap() {
   // Paints the 44×44 π logo as a Bitmap. Returns the Bitmap, never throws.
   // The spec calls for a conic amber gradient on the ring; PJSR has no
   // ConicalGradient class, so we approximate with a solid amber stroke.
   var bm;
   try {
      bm = new Bitmap(44, 44);
      bm.fill(0); // fully transparent
      var g = new Graphics(bm);
      try {
         g.antialiasing = true;
         g.brush = new Brush(optThemeColorInt("surface"));
         g.pen = new Pen(optThemeColorInt("amber"), 1.5);
         g.drawRoundedRect(1, 1, 42, 42, Theme.rXl, Theme.rXl);
         var family = optThemePickGlyphFont();
         var f = new Font(family);
         try { f.italic = true; } catch (e0) {}
         try { f.pixelSize = 26; } catch (e1) { try { f.pointSize = 18; } catch (e2) {} }
         try { f.bold = true; } catch (e3) {}
         g.font = f;
         g.pen = new Pen(optThemeColorInt("amber"));
         var tw = 16;
         try { tw = g.textWidth("π"); } catch (eW) {}
         // Baseline at y=30 leaves ~7 px headroom above and ~7 px below for
         // a 24-px glyph — visually centred in the 44-px tile.
         g.drawText(Math.round((44 - tw) / 2), 30, "π");
      } finally {
         g.end();
      }
   } catch (eAll) {
      // Painting failed: solid amber square as last-resort fallback.
      bm = new Bitmap(44, 44);
      bm.fill(optThemeColorInt("amber"));
   }
   return bm;
}

function optThemeApplyHeaderButton(btn) {
   if (!btn) return;
   try {
      btn.minHeight = 34;
      // borderStrong is alpha-encoded → must go through optThemeRgba so Qt's
      // CSS parser does not mistake the hex8 form for #AARRGGBB.
      btn.styleSheet =
         "QPushButton {" +
         " background-color: " + Theme.surface + ";" +
         " color: " + Theme.text + ";" +
         " border: 1px solid " + optThemeRgba("borderStrong") + ";" +
         " border-radius: " + Theme.rLg + "px;" +
         " padding-top: 0px; padding-bottom: 0px;" +
         " padding-left: 16px; padding-right: 16px;" +
         " font-size: 9pt; font-weight: 500;" +
         " outline: none;" +
         "} " +
         "QPushButton:hover { background-color: " + Theme.surfaceHover +
         "; border: 1px solid " + optThemeRgba("borderStrong") + "; } " +
         "QPushButton:pressed { background-color: " + Theme.surfaceRaised +
         "; border: 1px solid " + optThemeRgba("borderStrong") + "; } " +
         "QPushButton:focus { outline: none; border: 1px solid " +
         optThemeRgba("borderStrong") + "; }";
   } catch (e) {}
}

function optBuildWorkflowTitleBar(parent) {
   var bar = new Control(parent);
   try {
      bar.styleSheet =
         "QWidget { background-color: " + Theme.bg + "; border: 0px; }";
   } catch (eBar) {}
   bar.sizer = new HorizontalSizer();
   bar.sizer.margin = Theme.s5;        // 18 px on all sides → ~80 px total height
   bar.sizer.spacing = Theme.s4;       // 14 px between logo / title / buttons

   // -------- Logo (painted on a Control via onPaint) --------
   // PJSR's Label does not have a usable icon property for arbitrary Bitmap,
   // so we use a custom Control and paint the pre-built Bitmap in its
   // onPaint handler — the canonical pattern in this codebase.
   var logoBm = null;
   try { logoBm = optThemeBuildLogoBitmap(); } catch (eBmp) { logoBm = null; }
   var logo = new Control(bar);
   try {
      logo.styleSheet =
         "QWidget { background-color: transparent; border: 0px; }";
   } catch (eLs) {}
   try {
      logo.minWidth = 44; logo.maxWidth = 44;
      logo.minHeight = 44; logo.maxHeight = 44;
   } catch (eDim) {}
   if (logoBm !== null) {
      logo.onPaint = function() {
         var g = new Graphics(this);
         try { g.drawBitmap(0, 0, logoBm); } finally { g.end(); }
      };
   } else {
      // Last-resort fallback: a styled Label with the glyph in text form.
      // Replaces the Control with a Label inline because we already added
      // the Control to the sizer; we just paint inside it instead.
      logo.onPaint = function() {
         var g = new Graphics(this);
         try {
            g.antialiasing = true;
            g.brush = new Brush(optThemeColorInt("surface"));
            g.pen = new Pen(optThemeColorInt("amber"), 1);
            g.drawRoundedRect(0, 0, 43, 43, Theme.rXl, Theme.rXl);
         } finally { g.end(); }
      };
   }
   bar.sizer.add(logo);

   // -------- Title stack (title + version row) --------
   var titleStack = new Control(bar);
   try {
      titleStack.styleSheet =
         "QWidget { background-color: transparent; border: 0px; }";
   } catch (eTs) {}
   titleStack.sizer = new VerticalSizer();
   titleStack.sizer.margin = 0;
   titleStack.sizer.spacing = Theme.s1;

   var title = new Label(titleStack);
   title.text = "PI Workflow";
   title.styleSheet =
      "QLabel {" +
      " color: " + Theme.text + ";" +
      " font-size: 14pt; font-weight: 700;" +
      " background-color: transparent; border: 0px;" +
      "}";
   optApplyTooltip(title, "title", "PI Workflow", "Section");

   var subRow = new Control(titleStack);
   try {
      subRow.styleSheet =
         "QWidget { background-color: transparent; border: 0px; }";
   } catch (eSr) {}
   subRow.sizer = new HorizontalSizer();
   subRow.sizer.margin = 0;
   subRow.sizer.spacing = Theme.s2;

   // Version traceability sub-row: version · date · build (see OPT_VERSION /
   // OPT_BUILD / OPT_BUILD_DATE in PI Workflow.js). Version is user-driven; the
   // build auto-increments on every script change.
   var versionLabel = new Label(subRow);
   versionLabel.text = OPT_VERSION + "  ·  " + OPT_BUILD_DATE + "  ·  build " + OPT_BUILD;
   versionLabel.styleSheet =
      "QLabel {" +
      " color: " + Theme.textMuted + ";" +
      " font-family: " + Theme.fontMono + ";" +
      " font-size: 8pt; font-weight: 500;" +
      " background-color: transparent; border: 0px;" +
      "}";

   var pill = new Label(subRow);
   pill.text = "OPTIMIZED";
   // amberSoft / amberRing are alpha-encoded; go through optThemeRgba so
   // Qt does not parse the hex8 form as #AARRGGBB.
   pill.styleSheet =
      "QLabel {" +
      " background-color: " + optThemeRgba("amberSoft") + ";" +
      " border: 1px solid " + optThemeRgba("amberRing") + ";" +
      " border-radius: 9px;" +
      " padding-top: 1px; padding-bottom: 1px;" +
      " padding-left: 8px; padding-right: 8px;" +
      " color: " + Theme.amber + ";" +
      " font-family: " + Theme.fontMono + ";" +
      " font-size: 8pt; font-weight: 600;" +
      "}";

   subRow.sizer.add(versionLabel);
   subRow.sizer.add(pill);
   subRow.sizer.addStretch();

   titleStack.sizer.add(title);
   titleStack.sizer.add(subRow);
   bar.sizer.add(titleStack);
   bar.sizer.addStretch();

   // -------- Header buttons (Thanks / Repositories / Help) --------
   // I18N: captions are translated + registered automatically by the context walk
   // (optApplyContextTooltipsDeep) since "Thanks"/"Repositories"/"Help" are keys in
   // OPT_I18N_ES. No per-site wiring needed.
   var thanksButton = optButton(bar, "Thanks", 80);
   thanksButton.onClick = function() { optShowThanksDialog(bar); };
   optThemeApplyHeaderButton(thanksButton);

   var repoButton = optButton(bar, "Repositories", 130);
   repoButton.onClick = function() { optShowRecommendedRepositoriesDialog(bar); };
   optThemeApplyHeaderButton(repoButton);

   var helpButton = optButton(bar, "Help", 70);
   helpButton.onClick = function() {
      optOpenPathWithSystemViewer(optHelpFilePath());
   };
   optThemeApplyHeaderButton(helpButton);

   // I18N: language toggle. Shows the language it will switch TO. Clicking
   // retranslates the WHOLE dialog in place — no rebuild, state untouched.
   function optLangButtonTip() {
      return (OPT_LANG === "en")
         ? "<b>Cambiar a Español</b><br/>Switch the interface, tooltips and manual to Spanish."
         : "<b>Switch to English</b><br/>Cambia la interfaz, los tooltips y el manual a inglés.";
   }
   var langButton = optButton(bar, (OPT_LANG === "en") ? "ES" : "EN", 50);
   langButton.toolTip = optLangButtonTip();
   langButton.onClick = function() {
      OPT_LANG = (OPT_LANG === "en") ? "es" : "en";
      optSaveLang();
      optI18nRetranslate();                                  // all registered controls
      langButton.text = (OPT_LANG === "en") ? "ES" : "EN";   // own caption
      langButton.toolTip = optLangButtonTip();
      try { parent.adjustToContents(); } catch (eAdj) {}     // relayout for longer ES text
   };
   optThemeApplyHeaderButton(langButton);

   bar.sizer.add(thanksButton);
   bar.sizer.add(repoButton);
   bar.sizer.add(helpButton);
   bar.sizer.add(langButton);

   return bar;
}
// ----------------------------------------------------------------------------
// <<< HEADER REDESIGN — Phase 2a ends here >>>
// ============================================================================


// ============================================================================
// >>> TAB BAR REDESIGN — Phase 2b — easy-rollback block <<<
// ----------------------------------------------------------------------------
// Replaces the native TabBox tab strip with a pill-segmented bar built from
// custom Frames (per DESIGN_SPEC §2.3). Strategy: we KEEP the TabBox for
// page management — every existing read/write of `this.tabs.currentPageIndex`
// keeps working — but we hide its native QTabBar via styleSheet and overlay
// our own Frame-based pill bar above. Clicks on the pill bar drive
// `tabs.currentPageIndex`; TabBox.onPageSelected drives the visual sync back.
//
// To revert: delete this block, remove the two new sizer additions in the
// constructor (customTabBar + the optBuildThemedTabBar call), and drop the
// styleSheet assignment on `this.tabs` that hides the native bar.
// ============================================================================

function optApplyTabPillStyle(tab, isActive) {
   if (!tab) return;
   try {
      if (isActive) {
         tab.styleSheet =
            "QWidget {" +
            " background-color: " + Theme.surfaceRaised + ";" +
            " border: 1px solid " + optThemeRgba("borderStrong") + ";" +
            " border-radius: " + Theme.rMd + "px;" +
            "}";
         if (tab.numberLabel) tab.numberLabel.styleSheet =
            "QLabel {" +
            " background-color: " + Theme.amber + ";" +
            " color: #15110a;" +
            " border: 0px;" +
            " border-radius: 3px;" +
            " padding-left: 5px; padding-right: 5px;" +
            " font-family: " + Theme.fontMono + ";" +
            " font-size: 9pt; font-weight: 700;" +
            " min-width: 14px; max-width: 18px;" +
            "}";
         if (tab.titleLabel) tab.titleLabel.styleSheet =
            "QLabel {" +
            " color: " + Theme.text + ";" +
            " background-color: transparent; border: 0px;" +
            " font-size: 10pt; font-weight: 600;" +
            "}";
      } else {
         tab.styleSheet =
            "QWidget {" +
            " background-color: transparent;" +
            " border: 1px solid transparent;" +
            " border-radius: " + Theme.rMd + "px;" +
            "}";
         if (tab.numberLabel) tab.numberLabel.styleSheet =
            "QLabel {" +
            " background-color: transparent;" +
            " color: " + Theme.textMuted + ";" +
            " border: 1px solid " + optThemeRgba("borderStrong") + ";" +
            " border-radius: 3px;" +
            " padding-left: 4px; padding-right: 4px;" +
            " font-family: " + Theme.fontMono + ";" +
            " font-size: 9pt; font-weight: 600;" +
            " min-width: 14px; max-width: 18px;" +
            "}";
         if (tab.titleLabel) tab.titleLabel.styleSheet =
            "QLabel {" +
            " color: " + Theme.textMuted + ";" +
            " background-color: transparent; border: 0px;" +
            " font-size: 10pt; font-weight: 500;" +
            "}";
      }
   } catch (e) {}
}

function optBuildTabPill(parent, index, label) {
   var tab = new Frame(parent);
   tab.sizer = new HorizontalSizer();
   tab.sizer.margin = Theme.s2;     // 8 px top/bottom
   tab.sizer.spacing = Theme.s2;    // 8 px between chip and title

   tab.numberLabel = new Label(tab);
   tab.numberLabel.text = String(index);
   tab.numberLabel.textAlignment = TextAlign_Center | TextAlign_VertCenter;

   tab.titleLabel = new Label(tab);
   optI18nLabel(tab.titleLabel, label);
   tab.titleLabel.textAlignment = TextAlign_Left | TextAlign_VertCenter;

   tab.sizer.add(tab.numberLabel);
   tab.sizer.add(tab.titleLabel);

   try { tab.cursor = new Cursor(StdCursor_PointingHand); } catch (e) {}
   return tab;
}

function optBuildThemedTabBar(parent, labels) {
   var bar = new Control(parent);
   try {
      bar.styleSheet =
         "QWidget {" +
         " background-color: " + Theme.surface + ";" +
         " border: 1px solid " + optThemeRgba("border") + ";" +
         " border-radius: " + Theme.rXl + "px;" +
         "}";
   } catch (eBg) {}
   bar.sizer = new HorizontalSizer();
   bar.sizer.margin = Theme.s1;     // 4 px container padding
   bar.sizer.spacing = Theme.s1;    // 4 px between pills

   var tabs = [];
   for (var i = 0; i < labels.length; ++i) {
      var t = optBuildTabPill(bar, i, labels[i]);
      tabs.push(t);
      bar.sizer.add(t);
   }
   bar.sizer.addStretch();

   bar.tabs = tabs;
   bar.activeIndex = 0;
   bar.onTabClicked = null;

   bar.setActiveTab = function(idx) {
      if (idx < 0 || idx >= this.tabs.length) return;
      this.activeIndex = idx;
      for (var k = 0; k < this.tabs.length; ++k)
         optApplyTabPillStyle(this.tabs[k], k === idx);
   };

   // Wire mouse-press events on each tab Frame. We use IIFE to capture i.
   for (var j = 0; j < tabs.length; ++j) {
      (function(idx, t) {
         t.onMousePress = function() {
            bar.setActiveTab(idx);
            if (bar.onTabClicked)
               bar.onTabClicked(idx);
         };
         // Also propagate the click from the children (label clicks would
         // otherwise be swallowed by the labels themselves on some Qt builds).
         if (t.numberLabel)
            t.numberLabel.onMousePress = function() { t.onMousePress(); };
         if (t.titleLabel)
            t.titleLabel.onMousePress = function() { t.onMousePress(); };
      })(j, tabs[j]);
   }

   bar.setActiveTab(0);
   return bar;
}
// ----------------------------------------------------------------------------
// <<< TAB BAR REDESIGN — Phase 2b ends here >>>
// ============================================================================


// ============================================================================
// >>> MODE SEGMENTED — Phase 4a — easy-rollback block <<<
// ----------------------------------------------------------------------------
// Styles the three-button mode selector (R+G+B / NB / RGB) in the Image
// Selection block per DESIGN_SPEC §2.6. The container becomes a dark pill
// (Theme.bg bg, hairline border, rLg radius, 3 px padding), and each
// PushButton becomes a borderless pill that flips between transparent
// (inactive) and amberSoft / amberRing (active) styling.
//
// To revert: delete this block, restore OPT_CSS_MODE_WRAPPER on this.modeRow
// in OptSelectionPanel, and use OPT_CSS_MODE_ON / OPT_CSS_MODE_OFF in
// OptSelectionPanel.setMode().
// ============================================================================

function optThemeStyleModeSegmentedContainer(widget) {
   if (!widget) return;
   try {
      widget.styleSheet =
         "QWidget {" +
         " background-color: " + Theme.bg + ";" +
         " border: 1px solid " + optThemeRgba("border") + ";" +
         " border-radius: " + Theme.rLg + "px;" +
         "}";
   } catch (e) {}
}

function optThemeStyleModeSegmentedButton(btn, isActive) {
   if (!btn) return;
   try {
      btn.minHeight = 30;
      btn.maxHeight = 30;
      if (isActive) {
         btn.styleSheet =
            "QPushButton {" +
            " background-color: " + optThemeRgba("amberSoft") + ";" +
            " color: " + Theme.amber + ";" +
            " border: 1px solid " + optThemeRgba("amberRing") + ";" +
            " border-radius: " + Theme.rSm + "px;" +
            " padding: 0px;" +
            " font-family: " + Theme.fontMono + ";" +
            " font-size: 9pt; font-weight: 700;" +
            " outline: none;" +
            "}" +
            "QPushButton:hover { background-color: " + optThemeRgba("amberSoft") +
            "; color: " + Theme.amber + "; }" +
            "QPushButton:focus { outline: none; }";
      } else {
         btn.styleSheet =
            "QPushButton {" +
            " background-color: transparent;" +
            " color: " + Theme.textMuted + ";" +
            " border: 1px solid transparent;" +
            " border-radius: " + Theme.rSm + "px;" +
            " padding: 0px;" +
            " font-family: " + Theme.fontMono + ";" +
            " font-size: 9pt; font-weight: 600;" +
            " outline: none;" +
            "}" +
            "QPushButton:hover { background-color: " + optThemeRgba("borderStrong") +
            "; color: " + Theme.text + "; }" +
            "QPushButton:focus { outline: none; }";
      }
   } catch (e) {}
}
// ----------------------------------------------------------------------------
// <<< MODE SEGMENTED — Phase 4a ends here >>>
// ============================================================================


// ============================================================================
// >>> RECIPE BUTTONS — Phase 6 polish — easy-rollback block <<<
// ----------------------------------------------------------------------------
// 12 small palette buttons (SHO, HOO, HSO, ... FORAXX) shown when the
// Image Selection mode is set to "NB". The legacy OPT_CSS_RECIPE styling
// produced cramped 35-40 px buttons that read as a checkerboard; this
// helper restyles them as thin mono pills inside the new amber theme.
// ============================================================================
function optThemeApplyRecipeButton(btn, isActive) {
   if (!btn) return;
   try {
      btn.minHeight = 24; btn.maxHeight = 24;
      if (isActive) {
         btn.styleSheet =
            "QPushButton {" +
            " background-color: " + optThemeRgba("amberSoft") + ";" +
            " color: " + Theme.amber + ";" +
            " border: 1px solid " + optThemeRgba("amberRing") + ";" +
            " border-radius: 4px; padding: 0px;" +
            " font-family: " + Theme.fontMono + ";" +
            " font-size: 8pt; font-weight: 700;" +
            " outline: none;" +
            "}" +
            "QPushButton:hover { background-color: " + optThemeRgba("amberSoft") +
            "; color: " + Theme.amber + "; }" +
            "QPushButton:focus { outline: none; }";
      } else {
         btn.styleSheet =
            "QPushButton {" +
            " background-color: transparent;" +
            " color: " + Theme.textMuted + ";" +
            " border: 1px solid " + optThemeRgba("borderStrong") + ";" +
            " border-radius: 4px; padding: 0px;" +
            " font-family: " + Theme.fontMono + ";" +
            " font-size: 8pt; font-weight: 600;" +
            " outline: none;" +
            "}" +
            "QPushButton:hover { background-color: " + Theme.surfaceHover +
            "; color: " + Theme.text + "; }" +
            "QPushButton:focus { outline: none; }";
      }
   } catch (e) {}
}
// ----------------------------------------------------------------------------
// <<< RECIPE BUTTONS — Phase 6 polish ends here >>>
// ============================================================================


// ============================================================================
// >>> CHANNEL FIELD — Phase 4b — easy-rollback block <<<
// ----------------------------------------------------------------------------
// Restyles the R/G/B/L (and H/O/S/HO/OS/RGB) selector rows in the Image
// Selection block, per DESIGN_SPEC §2.7. Each row is now:
//
//   [●dot] [label] [—— combo dropdown ——————————— ▾]
//
// where the dot is a 16×16 Bitmap painted with a coloured dot + a soft
// halo of the same colour at low alpha. The label is mono 9pt 700 in a
// fixed 24–28 px column. The combo gets a surfaceRaised bg, hairline
// border and rSm radius. Inactive widgets are intentionally invisible
// (no separate "empty L" rule yet — that polish is a follow-up).
//
// To revert: delete this block and restore the original OptImageCombo
// constructor (label with optLabel(... 48) + combo with minWidth 210).
// ============================================================================

function optThemeChannelColorKey(channelKey) {
   var map = {
      "R":  "chR",      "G":  "chG",      "B":  "chB",
      "H":  "chR",      "O":  "chB",      "S":  "chG",
      "HO": "chR",      "OS": "chB",      "RGB": "textMuted",
      "L":  "textDim",  "L_MONO": "textDim"
   };
   return map[channelKey] || "textMuted";
}

function optThemeBuildChannelDotBitmap(channelKey) {
   // Returns a 16×16 transparent Bitmap with a 7 px coloured dot in the
   // centre and a 13 px halo of the same colour at ~18 % alpha. The slight
   // bump from spec's 13 % to 18 % works better against the dark surface.
   var hex = optThemeColor(optThemeChannelColorKey(channelKey));
   if (hex.charAt(0) === "#") hex = hex.substring(1);
   var rr = parseInt(hex.substring(0, 2), 16);
   var gg = parseInt(hex.substring(2, 4), 16);
   var bb = parseInt(hex.substring(4, 6), 16);
   var dotInt  = ((0xFF << 24) | (rr << 16) | (gg << 8) | bb) >>> 0;
   var haloA   = Math.round(255 * 0.18);
   var haloInt = ((haloA << 24) | (rr << 16) | (gg << 8) | bb) >>> 0;
   var bm = new Bitmap(16, 16);
   bm.fill(0);
   try {
      var g = new Graphics(bm);
      try {
         g.antialiasing = true;
         g.pen = new Pen(0x00000000, 1);    // transparent outline
         g.brush = new Brush(haloInt);
         g.drawEllipse(1, 1, 14, 14);       // ~13 px halo
         g.brush = new Brush(dotInt);
         g.drawEllipse(4, 4, 11, 11);       // ~7 px dot
      } finally {
         g.end();
      }
   } catch (e) {}
   return bm;
}

function optThemeApplyChannelLabel(label) {
   if (!label) return;
   try {
      label.styleSheet =
         "QLabel {" +
         " color: " + Theme.text + ";" +
         " background-color: transparent; border: 0px;" +
         " font-family: " + Theme.fontMono + ";" +
         " font-size: 9pt; font-weight: 700;" +
         "}";
      label.textAlignment = TextAlign_Left | TextAlign_VertCenter;
      label.minWidth = 22;
      label.maxWidth = 32;
   } catch (e) {}
}

function optThemeApplyChannelComboStyle(combo) {
   if (!combo) return;
   try {
      combo.minHeight = 28;
      combo.maxHeight = 28;
      combo.styleSheet =
         "QComboBox {" +
         " background-color: " + Theme.surfaceRaised + ";" +
         " color: " + Theme.text + ";" +
         " border: 1px solid " + optThemeRgba("border") + ";" +
         " border-radius: " + Theme.rSm + "px;" +
         " padding-left: 11px; padding-right: 4px;" +
         " font-family: " + Theme.fontMono + ";" +
         " font-size: 9pt; font-weight: 500;" +
         "}" +
         "QComboBox:hover { background-color: " + Theme.surfaceHover + "; }" +
         "QComboBox::drop-down { border: 0px; width: 18px; }" +
         "QComboBox QAbstractItemView {" +
         " background-color: " + Theme.surfaceRaised + ";" +
         " color: " + Theme.text + ";" +
         " border: 1px solid " + optThemeRgba("border") + ";" +
         " selection-background-color: " + optThemeRgba("amberSoft") + ";" +
         " selection-color: " + Theme.amber + ";" +
         "}";
   } catch (e) {}
}

