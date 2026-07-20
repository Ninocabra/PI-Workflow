function OptImageCombo(parent, labelText, key, requireColor) {
   this.key = key;
   this.requireColor = requireColor === true;
   this.row = new Control(parent);
   this.row.sizer = new HorizontalSizer();
   this.row.sizer.margin = 0;
   this.row.sizer.spacing = Theme.s2;     // 8 px between dot, label and combo

   // Phase 4b: coloured dot painted on a small Control via onPaint. The
   // bitmap is precomputed once per channel key and rendered every paint.
   var dotBm = null;
   try { dotBm = optThemeBuildChannelDotBitmap(key); } catch (eBm) { dotBm = null; }
   this.dot = new Control(this.row);
   try {
      this.dot.minWidth = 16; this.dot.maxWidth = 16;
      this.dot.minHeight = 16; this.dot.maxHeight = 16;
      this.dot.styleSheet = "QWidget { background-color: transparent; border: 0px; }";
   } catch (eDim) {}
   if (dotBm) {
      this.dot.onPaint = function() {
         var g = new Graphics(this);
         try { g.drawBitmap(0, 0, dotBm); } finally { g.end(); }
      };
   }

   // Phase 4b: themed label (mono, no colon, narrow fixed column).
   this.label = new Label(this.row);
   this.label.text = labelText;
   optThemeApplyChannelLabel(this.label);

   // Phase 4b: themed combo (surfaceRaised bg, hairline border, rSm radius).
   this.combo = new ComboBox(this.row);
   optThemeApplyChannelComboStyle(this.combo);

   this.views = [];
   this.records = [];
   this.onSelectionChanged = null;
   this.row.sizer.add(this.dot);
   this.row.sizer.add(this.label);
   this.row.sizer.add(this.combo, 100);

   var self = this;
   this.combo.onItemSelected = function() {
      if (typeof self.onSelectionChanged === "function")
         self.onSelectionChanged(self.selectedView());
   };
}

OptImageCombo.prototype.refresh = function() {
   this.views = [];
   this.records = [];
   try {
      while (this.combo.numberOfItems > 0)
         this.combo.removeItem(this.combo.numberOfItems - 1);
   } catch (e0) {
   }
   this.combo.addItem("None");
   var selected = 0;
   var views = optWorkspaceViews();
   for (var i = 0; i < views.length; ++i) {
      var v = views[i];
      if (this.requireColor && !optViewIsColor(v))
         continue;
      if (!this.requireColor && !optViewIsMono(v))
         continue;
      this.views.push(v);
      this.combo.addItem(v.id);
      if (v.id.toUpperCase() === this.key.toUpperCase())
         selected = this.views.length;
   }
   try { this.combo.currentItem = selected; } catch (e1) {}
};

OptImageCombo.prototype.selectedView = function() {
   var index = 0;
   try { index = this.combo.currentItem; } catch (e) { index = 0; }
   if (index <= 0)
      return null;
   return this.views[index - 1] || null;
};

function OptSelectionPanel(dialog, tab) {
   this.dialog = dialog;
   this.tab = tab;
   this.combos = {};
   this.mode = "MONO";
   this.control = new Control(dialog);
   this.control.sizer = new VerticalSizer();
   this.control.sizer.spacing = 6;

   // Phase 4a: mode segmented pill — three equal columns inside a dark
   // container with rLg radius. The buttons stretch to fill instead of
   // having fixed widths; this scales naturally inside the 300 px left
   // card without overflow.
   this.modeRow = new Control(this.control);
   optThemeStyleModeSegmentedContainer(this.modeRow);
   this.modeRow.sizer = new HorizontalSizer();
   this.modeRow.sizer.margin = 3;
   this.modeRow.sizer.spacing = 2;
   this.btnModeMono = optButton(this.modeRow, "R+G+B", 0);
   this.btnModeNb = optButton(this.modeRow, "NB", 0);
   this.btnModeRgb = optButton(this.modeRow, "RGB", 0);
   this.modeRow.sizer.add(this.btnModeMono, 1);
   this.modeRow.sizer.add(this.btnModeNb, 1);
   this.modeRow.sizer.add(this.btnModeRgb, 1);
   this.control.sizer.add(this.modeRow);

   this.buildMonoGroup();
   this.buildNbGroup();
   this.buildRgbGroup();

   // LOAD-FILES (UX): the dialog is MODAL, so PixInsight's File > Open is
   // unreachable while it is up and the channel combos only list views that were
   // already open. This button closes that gap: it opens image files from disk
   // right here (OpenFileDialog works fine on top of a modal PJSR dialog — the
   // Export As… button already relies on that) and refreshes the combos so the
   // new views are immediately selectable.
   var panelSelf = this;
   this.btnLoadFiles = optButton(this.control, "Load Image Files…", 0);
   optThemeApplyActionButtonMono(this.btnLoadFiles);
   optI18nLabel(this.btnLoadFiles, "Load Image Files…");
   optApplyExplicitTooltip(this.btnLoadFiles, "panel.loadFiles");
   this.btnLoadFiles.onClick = function() {
      optSafeUi("Load Image Files", function() {
         var ofd = new OpenFileDialog;
         ofd.multipleSelections = true;
         ofd.caption = "Load Image Files";
         try { ofd.loadImageFilters(); } catch (eF) {}
         if (!ofd.execute())
            return;
         var opened = 0;
         for (var i = 0; i < ofd.fileNames.length; ++i) {
            try {
               var wins = ImageWindow.open(ofd.fileNames[i]);
               for (var k = 0; k < wins.length; ++k) { try { wins[k].show(); } catch (eS) {} ++opened; }
            } catch (eO) {
               console.warningln("Load Image Files: could not open " + ofd.fileNames[i] + " — " + (eO.message || eO));
            }
         }
         panelSelf.refresh();
         console.writeln("=> Load Image Files: " + opened + " image(s) opened and selectors refreshed.");
      });
   };
   this.control.sizer.add(this.btnLoadFiles);

   this.control.sizer.addStretch();
   this.wireModeButtons();
   this.setMode("MONO");
}

OptSelectionPanel.prototype.addCombo = function(parentSizer, label, key, requireColor, dictKey) {
   var combo = new OptImageCombo(this.control, label, key, requireColor);
   parentSizer.add(combo.row);
   this.combos[dictKey || key] = combo;
   return combo;
};

OptSelectionPanel.prototype.buildMonoGroup = function() {
   var g = new Control(this.control);
   this.monoGroup = g;
   g.sizer = new VerticalSizer();
   g.sizer.margin = 0;
   g.sizer.spacing = Theme.s2;     // Phase 4b: 4 -> 8 px between channel rows
   this.addCombo(g.sizer, "R", "R", false);
   this.addCombo(g.sizer, "G", "G", false);
   this.addCombo(g.sizer, "B", "B", false);
   this.addCombo(g.sizer, "L", "L", false, "L_MONO");
   // LRGB-WEIGHT-BEGIN — inline L weight slider revealed by right-click on "L:" label.
   // Hidden by default. Auto-hides when L combo is set to "None".
   (function(panel) {
      var lCombo = panel.combos["L_MONO"];
      if (!lCombo) return;
      var dialog = panel.dialog;
      var weightRow = new Control(panel.control);
      weightRow.sizer = new HorizontalSizer;
      weightRow.sizer.margin = 0;
      weightRow.sizer.spacing = 4;
      // Phase 6.10: the legacy addSpacing(52) that aligned the slider under
      // the old L combo column is removed — with the new themed channel
      // rows the slider can now use the full panel width.
      var nc = new NumericControl(weightRow);
      nc.label.text = "L wt %";
      nc.label.minWidth = 60;
      try { nc.label.maxWidth = 60; } catch (eW) {}
      nc.setRange(0, 200);
      nc.setPrecision(0);
      nc.slider.setRange(0, 200);
      nc.slider.minWidth = 80;     // a baseline; the stretch below grows it
      try { optThemeApplyNumericControl(nc); } catch (eTh) {}
      nc.toolTip =
         "<p><b>L blending weight</b> for the R+G+B+L combine.</p>" +
         "<ul>" +
         "<li><b>100%</b> — standard LRGB (default)</li>" +
         "<li><b>0%</b>   — no L influence (pure RGB)</li>" +
         "<li><b>50%</b>  — half L, half RGB luminance</li>" +
         "<li><b>200%</b> — double L influence (extrapolated; highlights may clip)</li>" +
         "</ul>" +
         "<p>Right-click the <b>L:</b> label to hide this slider.</p>";
      nc.setValue(Math.round(optGetLuminanceWeight(dialog) * 100));
      nc.onValueUpdated = function(v) {
         dialog.luminanceWeight = v / 100.0;
      };
      weightRow.sizer.add(nc, 100);
      g.sizer.add(weightRow);
      panel.lWeightRow = weightRow;
      panel.lWeightControl = nc;
      // Reserve the vertical space permanently so toggling the slider does not
      // shift the rest of the panel. We measure the row with content visible,
      // lock its height, then hide only the inner NumericControl.
      try {
         weightRow.adjustToContents();
         var reservedH = Math.max(weightRow.height, 24);
         weightRow.setFixedHeight(reservedH);
      } catch (eFH) {}
      nc.visible = false;
      // Right-click on the "L:" label toggles the slider — only when L has a real selection.
      try {
         lCombo.label.onMousePress = function(x, y, button) {
            if (button !== OPT_MOUSE_RIGHT) return;
            if (!optSafeView(lCombo.selectedView())) return;
            nc.visible = !nc.visible;
            if (nc.visible)
               nc.setValue(Math.round(optGetLuminanceWeight(dialog) * 100));
         };
         lCombo.label.toolTip =
            "<p>Luminance channel for LRGB combination.</p>" +
            "<p><b>Right-click</b> when an L image is selected to reveal the " +
            "<b>L blending weight</b> slider (0–200%, default 100%).</p>";
      } catch (eLbl) {}
      // Auto-hide slider content if L combo is set back to None (row keeps its reserved height).
      var priorOnSel = lCombo.onSelectionChanged;
      lCombo.onSelectionChanged = function(view) {
         if (!optSafeView(view))
            nc.visible = false;
         if (typeof priorOnSel === "function")
            try { priorOnSel(view); } catch (ePS) {}
      };
   })(this);
   // LRGB-WEIGHT-END
   // Phase 4c: Combine / Separately as a 2-column segmented pill (§2.8).
   // Combine takes the active (amber) variant; Separately the inactive
   // (transparent / muted) variant. Click handlers are wired elsewhere.
   var row = new Control(g);
   optThemeStyleModeSegmentedContainer(row);
   row.sizer = new HorizontalSizer();
   row.sizer.margin = 3;
   row.sizer.spacing = 2;
   this.btnCombineMono = optButton(row, "Combine RGB", 0);
   this.btnSeparateMono = optButton(row, "Separately", 0);
   optThemeStyleModeSegmentedButton(this.btnCombineMono, true);
   optThemeStyleModeSegmentedButton(this.btnSeparateMono, false);
   row.sizer.add(this.btnCombineMono, 1);
   row.sizer.add(this.btnSeparateMono, 1);
   g.sizer.add(row);
   this.control.sizer.add(g);
};

OptSelectionPanel.prototype.buildNbGroup = function() {
   var g = new Control(this.control);
   this.nbGroup = g;
   g.sizer = new VerticalSizer();
   g.sizer.margin = 0;
   g.sizer.spacing = Theme.s2;     // Phase 4b: 4 -> 8 px between channel rows
   this.addCombo(g.sizer, "H", "H", false);
   this.addCombo(g.sizer, "O", "O", false);
   this.addCombo(g.sizer, "S", "S", false);
   this.addCombo(g.sizer, "HO", "HO", true);
   this.addCombo(g.sizer, "OS", "OS", true);
   // Phase 4c: Combine / Separately as a 2-column segmented pill (§2.8).
   var row = new Control(g);
   optThemeStyleModeSegmentedContainer(row);
   row.sizer = new HorizontalSizer();
   row.sizer.margin = 3;
   row.sizer.spacing = 2;
   this.btnCombineNb = optButton(row, "Combine HOS", 0);
   this.btnSeparateNb = optButton(row, "Separately", 0);
   optThemeStyleModeSegmentedButton(this.btnCombineNb, true);
   optThemeStyleModeSegmentedButton(this.btnSeparateNb, false);
   row.sizer.add(this.btnCombineNb, 1);
   row.sizer.add(this.btnSeparateNb, 1);
   g.sizer.add(row);
   this.recipeRow = new Control(this.control);
   this.recipeRow.sizer = new VerticalSizer();
   this.recipeRow.sizer.spacing = 3;
   // Phase 6.8: 3 rows × 4 pills (was 2 × 6) — each pill is wider and
   // easier to hit.
   var recipeRow1 = new Control(this.recipeRow);
   recipeRow1.sizer = new HorizontalSizer();
   recipeRow1.sizer.spacing = 3;
   var recipeRow2 = new Control(this.recipeRow);
   recipeRow2.sizer = new HorizontalSizer();
   recipeRow2.sizer.spacing = 3;
   var recipeRow3 = new Control(this.recipeRow);
   recipeRow3.sizer = new HorizontalSizer();
   recipeRow3.sizer.spacing = 3;
   for (var i = 0; i < OPT_RECIPE_NAMES.length; ++i) {
      var recipeParent = i < 4 ? recipeRow1 : (i < 8 ? recipeRow2 : recipeRow3);
      var b = optButton(recipeParent, OPT_RECIPE_NAMES[i], 0);
      // Phase 6: themed recipe pill. No more fixed 35-40 px width — each
      // row spreads its 6 buttons evenly via stretch=1.
      optThemeApplyRecipeButton(b, false);
      b.__recipe = OPT_RECIPE_NAMES[i];
      try {
         var ttRecipe = optTooltipTextByKey("recipe." + OPT_RECIPE_NAMES[i]);
         if (ttRecipe) b.toolTip = ttRecipe;
      } catch (eRec) {}
      var dlg = this.dialog;
      b.onClick = function() {
         dlg.selectedRecipe = this.__recipe;
         dlg.recipeManuallySelected = true;
         dlg.refreshRecipeButtons();
      };
      recipeParent.sizer.add(b, 1);
      this.dialog.recipeButtons.push(b);
   }
   this.recipeRow.sizer.add(recipeRow1);
   this.recipeRow.sizer.add(recipeRow2);
   this.recipeRow.sizer.add(recipeRow3);
   g.sizer.add(this.recipeRow);
   this.control.sizer.add(g);
};

OptSelectionPanel.prototype.buildRgbGroup = function() {
   var g = new Control(this.control);
   this.rgbGroup = g;
   g.sizer = new VerticalSizer();
   g.sizer.margin = 0;
   g.sizer.spacing = Theme.s2;     // Phase 4b: 4 -> 8 px between channel rows
   this.addCombo(g.sizer, "RGB", "RGB", true);
   // Phase 4c: single Process RGB button wrapped in the same segmented
   // container as Combine / Separately, with the active (amber) variant.
   var row = new Control(g);
   optThemeStyleModeSegmentedContainer(row);
   row.sizer = new HorizontalSizer();
   row.sizer.margin = 3;
   row.sizer.spacing = 2;
   this.btnProcessRgb = optButton(row, "Process RGB", 0);
   optThemeStyleModeSegmentedButton(this.btnProcessRgb, true);
   row.sizer.add(this.btnProcessRgb, 1);
   g.sizer.add(row);
   this.control.sizer.add(g);
};

OptSelectionPanel.prototype.wireModeButtons = function() {
   var self = this;
   this.btnModeMono.onClick = function() { self.setMode("MONO"); };
   this.btnModeNb.onClick = function() { self.setMode("NB"); };
   this.btnModeRgb.onClick = function() { self.setMode("RGB"); };
};

OptSelectionPanel.prototype.setMode = function(mode) {
   this.mode = (mode === "NB" || mode === "RGB") ? mode : "MONO";
   optSetControlVisible(this.monoGroup, this.mode === "MONO");
   optSetControlVisible(this.nbGroup, this.mode === "NB");
   optSetControlVisible(this.rgbGroup, this.mode === "RGB");
   // Phase 4a: replace OPT_CSS_MODE_ON / OPT_CSS_MODE_OFF with the new
   // themed segmented-pill helper. Active state uses amberSoft / amberRing;
   // inactive state is transparent with textMuted.
   optThemeStyleModeSegmentedButton(this.btnModeMono, this.mode === "MONO");
   optThemeStyleModeSegmentedButton(this.btnModeNb,   this.mode === "NB");
   optThemeStyleModeSegmentedButton(this.btnModeRgb,  this.mode === "RGB");
};

OptSelectionPanel.prototype.refresh = function() {
   for (var key in this.combos)
      if (optHasOwn(this.combos, key))
         this.combos[key].refresh();
};

OptSelectionPanel.prototype.view = function(key) {
   return this.combos[key] ? this.combos[key].selectedView() : null;
};

function OptPreviewPane(dialog, tab, parent) {
   this.dialog = dialog;
   this.tab = tab;
   this.currentKey = "";
   this.currentView = null;
   this.candidateView = null;
   this.candidateGradientView = null;
   this.currentGradientView = null;
   this.previousView = null;
   this.pendingStage = "";
   this.pendingActionKey = "";
   this.pendingMemoryMeta = null;
   this.currentMemoryMeta = null;
   this.recalledMemoryIndex = -1;
   this.showingPrevious = false;
   this.memory = new OptMemoryManager(OPT_MEMORY_SLOTS);
   this.previewReduction = OPT_PREVIEW_REDUCTION_DEFAULT;
   this.lastRenderView = null;
   this.lastRenderGradientView = null;

   this.control = new Control(parent);
   this.control.sizer = new VerticalSizer();
   this.control.sizer.spacing = 5;

   this.pathRow = new Control(parent);
   this.pathRow.sizer = new HorizontalSizer();
   this.pathRow.sizer.spacing = 4;
   this.pathButtons = {};
   var keys = optAllWorkflowKeys();
   // Cached tooltip text — looked up once instead of inside the loop because
   // every path button shares the same generic explanation (which slot,
   // bracketed = active, populated after Combine/Process). Specific slot
   // meaning is conveyed by the button label itself (R/G/B/H/RGB/...).
   var ttPathBtn = "";
   try { ttPathBtn = optTooltipTextByKey("path.button") || ""; } catch (eTP) {}
   for (var i = 0; i < keys.length; ++i) {
      var key = keys[i];
      var b = optButton(this.pathRow, optLabelForKey(key), 0);
      b.visible = false;
      // Phase 4f: path chip styled as a fully-rounded pill (§2.13). Initial
      // state is "off" (no stages yet); refreshButtons() flips this to
      // "active" / "done" as the workflow advances.
      optThemeApplyPathChip(b, "off");
      b.__pathKey = key;
      if (ttPathBtn) { optApplyTooltip(b, ttPathBtn); }
      var self = this;
      b.onClick = function() {
         self.activate(this.__pathKey, false);
      };
      this.pathButtons[key] = b;
      this.pathRow.sizer.add(b);
   }
   this.pathRow.sizer.addStretch();
   this.control.sizer.add(this.pathRow);

   // Phase 4d: themed memory bank (DESIGN_SPEC §2.11):
   //   MEMORY  [container: 1 2 3 4 5 6 7 8]   RESET (ghost)
   this.memoryRow = new Control(parent);
   this.memoryRow.sizer = new HorizontalSizer();
   this.memoryRow.sizer.spacing = Theme.s2;     // 8 px gaps
   var memLabel = new Label(this.memoryRow);
   memLabel.text = "MEMORY";
   memLabel.textAlignment = TextAlign_Left | TextAlign_VertCenter;
   optThemeApplyMemoryLabel(memLabel);
   // Phase 6.11: fixed label column so the MEMORY and MASK rows align.
   memLabel.minWidth = 60; try { memLabel.maxWidth = 60; } catch (eML) {}
   this.memoryRow.sizer.add(memLabel);

   // Pill container for the 8 slot buttons.
   var memContainer = new Control(this.memoryRow);
   optThemeApplyMemoryContainer(memContainer);
   memContainer.sizer = new HorizontalSizer();
   memContainer.sizer.margin = 3;
   memContainer.sizer.spacing = 2;

   var ttMemSlot = "";
   try { ttMemSlot = optTooltipTextByKey("memory.slot") || ""; } catch (eTM) {}
   for (var m = 0; m < OPT_MEMORY_SLOTS; ++m) {
      var mb = optButton(memContainer, "" + (m + 1), 0);
      optThemeApplyMemorySlot(mb, false);   // empty initial state
      mb.__memoryIndex = m;
      if (ttMemSlot) { optApplyTooltip(mb, ttMemSlot); }
      this.memory.buttons.push(mb);
      var pane = this;
      mb.onClick = function() {
         pane.storeMemory(this.__memoryIndex);
      };
      mb.onMousePress = function(x, y, button) {
         if (button === OPT_MOUSE_RIGHT)
            pane.recallMemory(this.__memoryIndex);
      };
      memContainer.sizer.add(mb);
   }
   this.memoryRow.sizer.add(memContainer);

   this.btnResetMemory = optButton(this.memoryRow, "RESET", 0);
   optThemeApplyMemoryReset(this.btnResetMemory);
   try {
      var ttRstMem = optTooltipTextByKey("reset.memory");
      if (ttRstMem) this.btnResetMemory.toolTip = ttRstMem;
   } catch (eRstM) {}
   this.btnResetMemory.onClick = function() { self.memory.clear(); };
   this.memoryRow.sizer.add(this.btnResetMemory);


   this.memoryRow.sizer.addStretch();
   this.control.sizer.add(this.memoryRow);
   if (this.tab === OPT_TAB_POST || this.tab === OPT_TAB_CC)
      optBuildMaskMemoryPanel(dialog, this.control, this);

   this.toolRow = new Control(parent);
   this.toolRow.sizer = new HorizontalSizer();
   this.toolRow.sizer.spacing = 4;
   // Phase 4e: themed action buttons (DESIGN_SPEC §2.12). Toggle / Export /
   // Export TIF use the neutral surfaceRaised look; Use this Image uses the
   // primary-action variant (amber when READY, green when APPLIED).
   this.btnToggle = optButton(this.toolRow, "Toggle", 60);
   optThemeApplyActionButton(this.btnToggle);
   // >>> SPLIT COMPARE BEGIN >>>
   this.btnSplit = optButton(this.toolRow, "Split", 60);
   optThemeApplyActionButton(this.btnSplit);
   optApplyExplicitTooltip(this.btnSplit, "panel.splitCompare");
   // <<< SPLIT COMPARE END <<<
   this.btnSetCurrent = optButton(this.toolRow, "Use this Image", 130);
   optThemeApplyPrimaryActionButton(this.btnSetCurrent, false);   // READY state
   this.btnSetCurrent.enabled = false;
   // Phase 4g: Zoom mini-card (DESIGN_SPEC §2.14). Dark container, uppercase
   // mono label inside, themed compact combo.
   this.zoomCard = new Control(this.toolRow);
   optThemeApplyMiniCardContainer(this.zoomCard);
   this.zoomCard.sizer = new HorizontalSizer();
   this.zoomCard.sizer.margin = 3;
   this.zoomCard.sizer.spacing = 4;
   this.zoomLabel = new Label(this.zoomCard);
   this.zoomLabel.text = "ZOOM";
   optThemeApplyMiniCardLabel(this.zoomLabel);
   this.zoomCard.sizer.add(this.zoomLabel);
   this.zoomCombo = new ComboBox(this.zoomCard);
   this.zoomCombo.editEnabled = true;
   this.zoomCombo.addItem("Fit");
   this.zoomCombo.addItem("25%");
   this.zoomCombo.addItem("50%");
   this.zoomCombo.addItem("100%");
   this.zoomCombo.addItem("200%");
   optThemeApplyMiniCardCombo(this.zoomCombo);
   this.zoomCard.sizer.add(this.zoomCombo);
   try {
      var ttZoom = optTooltipTextByKey("zoom");
      if (ttZoom) {
         optApplyTooltip(this.zoomCard, ttZoom);
         optApplyTooltip(this.zoomLabel, ttZoom);
         optApplyTooltip(this.zoomCombo, ttZoom);
      }
   } catch (eZ) {}

   // Phase 4g: Reduction mini-card (same shape as Zoom).
   this.resCard = new Control(this.toolRow);
   optThemeApplyMiniCardContainer(this.resCard);
   this.resCard.sizer = new HorizontalSizer();
   this.resCard.sizer.margin = 3;
   this.resCard.sizer.spacing = 4;
   this.resLabel = new Label(this.resCard);
   this.resLabel.text = "REDUCTION";
   optThemeApplyMiniCardLabel(this.resLabel);
   this.resCard.sizer.add(this.resLabel);
   this.resCombo = new ComboBox(this.resCard);
   this.resCombo.addItem("1");
   this.resCombo.addItem("2");
   this.resCombo.addItem("3");
   this.resCombo.addItem("4");
   this.resCombo.addItem("5");
   this.resCombo.addItem("6");
   this.resCombo.currentItem = optClampPreviewReduction(dialog.sharedPreviewReduction || OPT_PREVIEW_REDUCTION_DEFAULT) - 1;
   optThemeApplyMiniCardCombo(this.resCombo);
   this.resCard.sizer.add(this.resCombo);
   try {
      var ttRes = optTooltipTextByKey("preview.resolution");
      if (ttRes) {
         optApplyTooltip(this.resCard, ttRes);
         optApplyTooltip(this.resLabel, ttRes);
         optApplyTooltip(this.resCombo, ttRes);
      }
   } catch (eR) {}

   this.toolRow.sizer.add(this.btnToggle);
   this.toolRow.sizer.add(this.btnSetCurrent);
   // Visual breathing room between the "Use this Image" button and the
   // companion "Show Gradient" checkbox — without it the two controls
   // looked glued together on the wider Pre tab tool row.
   this.toolRow.sizer.addSpacing(12);

   // Show Gradient checkbox: read as a companion toggle to "Use this
   // Image" (only Pre tab, only when a gradient model exists). Lives
   // inside the tool row so it shares horizontal alignment and theming
   // with every other checkbox in the panel; visibility is still
   // managed by updateGradientControl() below.
   this.chkShowGradient = new CheckBox(this.toolRow);
   optI18nLabel(this.chkShowGradient, "Show Gradient");
   this.chkShowGradient.checked = false;
   optApplyCheckBoxTooltip(this.chkShowGradient);
   optThemeApplyCheckBox(this.chkShowGradient);
   optSetControlVisible(this.chkShowGradient, false);
   this.toolRow.sizer.add(this.chkShowGradient);

   this.toolRow.sizer.addStretch();
   this.toolRow.sizer.add(this.btnSplit);
   this.toolRow.sizer.add(this.zoomCard);
   this.toolRow.sizer.add(this.resCard);
   this.control.sizer.add(this.toolRow);

   this.status = new Label(parent);
   this.status.useRichText = true;
   this.status.text = "<b>Current:</b> none";
   // Phase 4f: themed status line (mono, textMuted) per §2.13.
   optThemeApplyStatusLabel(this.status);
   this.control.sizer.add(this.status);

   // QUALITY-LINE: image-quality readout just below the status line, refreshed whenever the
   // displayed view changes (see updateQualityStatus). Replaces the old Configuration-tab card.
   this.qualityStatus = new Label(parent);
   this.qualityStatus.useRichText = true;
   this.qualityStatus.text = "";
   optThemeApplyStatusLabel(this.qualityStatus);
   this.control.sizer.add(this.qualityStatus);

   this.preview = new OptPreviewControl(parent);
   this.preview.minHeight = 520;
   this.control.sizer.add(this.preview, 100);

   this.preview.onZoomChanged = function(scale, isFit) {
      if (isFit)
         self.zoomCombo.currentItem = 0;
      else
         self.zoomCombo.editText = Math.round(scale * 100) + "%";
   };

   this.zoomCombo.onItemSelected = function(index) {
      if (index === 0)
         self.preview.fitToWindow();
      else if (index === 1)
         self.preview.setManualScale(0.25);
      else if (index === 2)
         self.preview.setManualScale(0.50);
      else if (index === 3)
         self.preview.setManualScale(1.00);
      else if (index === 4)
         self.preview.setManualScale(2.00);
   };

   this.resCombo.onItemSelected = function(index) {
      dialog.setSharedPreviewReduction(index + 1);
   };

   this.btnToggle.onClick = function() { self.toggle(); };
   // >>> SPLIT COMPARE BEGIN >>>
   this.btnSplit.onClick = function() { self.toggleSplitMode(); };
   // <<< SPLIT COMPARE END <<<
   this.btnSetCurrent.onClick = function() { self.setToCurrent(); };
   this.chkShowGradient.onCheck = function() {
      if (optSafeView(self.lastRenderView))
         self.render(self.lastRenderView, false, self.lastRenderGradientView);
   };
}

OptPreviewPane.prototype.toggleSplitMode = function() {
   this.preview.isSplitMode = !this.preview.isSplitMode;
   optThemeApplyActionButton(this.btnSplit, this.preview.isSplitMode ? "active" : "neutral");
   if (optSafeView(this.lastRenderView))
      this.render(this.lastRenderView, false, this.lastRenderGradientView);
};

OptPreviewPane.prototype.refreshButtons = function() {
   var keys = optAllWorkflowKeys();
   for (var i = 0; i < keys.length; ++i) {
      var key = keys[i];
      var btn = this.pathButtons[key];
      var visible = this.dialog.store.isAvailable(key, this.tab);
      var rec = this.dialog.store.record(key);
      var hasStages = optStageList(rec).length > 0;
      btn.visible = visible;
      btn.enabled = visible;
      if (key === this.currentKey)
         btn.text = "[" + optLabelForKey(key) + "]";
      else
         btn.text = optLabelForKey(key);
      // Phase 4f: themed path chip state transitions (§2.13).
      if (!visible)
         optThemeApplyPathChip(btn, "off");
      else if (key === this.currentKey)
         optThemeApplyPathChip(btn, "active");
      else if (hasStages)
         optThemeApplyPathChip(btn, "done");
      else
         optThemeApplyPathChip(btn, "off");
   }
};

OptPreviewPane.prototype.activate = function(key, fit) {
   var rec = this.dialog.store.record(key);
   if (!optSafeView(rec.view))
      return false;
   if (this.tab === OPT_TAB_POST && this.dialog && this.dialog.postMaskLiveCache)
      this.dialog.postMaskLiveCache.release();
   optCloseViews([this.previousView, this.candidateView, this.candidateGradientView]);
   if (key !== this.currentKey)
      optCloseViews([this.currentGradientView]);
   this.previousView = null;
   this.previousActiveView = null;
   this.candidateGradientView = null;
   if (key !== this.currentKey) {
      this.currentGradientView = null;
      this.currentMemoryMeta = null;
   }
   this.pendingMemoryMeta = null;
   this.pendingActionKey = "";
   this.recalledMemoryIndex = -1;
   this.currentKey = key;
   this.currentView = rec.view;
   this.candidateView = null;
   this.pendingStage = "";
   this.showingPrevious = false;
   optThemeApplyPrimaryActionButton(this.btnSetCurrent, false);  // READY
   this.btnSetCurrent.enabled = false;
   this.render(rec.view, fit !== false, this.currentGradientView);
   this.refreshButtons();
   // Re-evaluate UI gating policies because the canonical view of this tab
   // just changed (mono <-> RGB transitions need to (re)enable color sections).
   // Hooking here catches ALL paths that change currentView, not just setRecord.
   try {
      if (this.dialog && typeof this.dialog.applyUIPolicies === "function")
         this.dialog.applyUIPolicies();
   } catch (ePol) {}
   return true;
};

OptPreviewPane.prototype.updateGradientControl = function(gradientView) {
   var visible = this.tab === OPT_TAB_PRE && optSafeView(gradientView);
   // v137: the checkbox now lives directly in toolRow (no wrapping
   // gradientRow Control), so toggle its visibility on the checkbox
   // itself. The Pre-tab guard keeps it hidden on Stretching / Post /
   // CC tabs even if a gradient view happens to be valid.
   optSetControlVisible(this.chkShowGradient, visible);
   if (!visible && this.chkShowGradient)
      this.chkShowGradient.checked = false;
};

OptPreviewPane.prototype.render = function(view, fit, gradientView) {
   if (!optSafeView(view)) {
      this.preview.setBitmap(null, fit !== false);
      // >>> SPLIT COMPARE BEGIN >>>
      this.preview.compareBitmap = null;
      // <<< SPLIT COMPARE END <<<
      this.status.text = "<b>Current:</b> " + (this.currentKey ? optLabelForKey(this.currentKey) : "none");
      this.updateQualityStatus(null);
      this.lastRenderView = null;
      this.lastRenderGradientView = null;
      this.updateGradientControl(null);
      return;
   }
   if (typeof gradientView === "undefined") {
      if (view === this.candidateView)
         gradientView = this.candidateGradientView;
      else if (view === this.currentView)
         gradientView = this.currentGradientView;
      else
         gradientView = null;
   }
   // >>> SPLIT COMPARE BEGIN >>>
   if (optSafeView(view) && this.lastRenderView !== view) {
      this.previousActiveView = this.lastRenderView;
   }
   // <<< SPLIT COMPARE END <<<
   this.lastRenderView = view;
   this.lastRenderGradientView = optSafeView(gradientView) ? gradientView : null;
   this.updateGradientControl(this.lastRenderGradientView);
   var rec = this.currentKey ? this.dialog.store.record(this.currentKey) : null;
   var stages = optStageList(rec);
   var stretchMode = "";
   if (this.tab === OPT_TAB_PRE) {
      // Unlinked MAD-STF gives an approximate auto white balance on uncalibrated
      // broadband data, but it is destructive on narrowband composites: the weak
      // channel (e.g. SII in SHO) gets over-stretched, blowing up its noise and
      // tinting the background. Force linked stretch for narrowband so the preview
      // matches a clean STF view (neutral background, noise not amplified).
      var isNarrowbandPre = false;
      try { isNarrowbandPre = !!optNarrowbandRecipeFromView(view, this.dialog); } catch (eNB) {}
      stretchMode = (optRecordHasColorCorrection(rec) || optIsColorCorrectionStage(this.pendingStage) || isNarrowbandPre) ? "mad-linked" : "mad-unlinked";
   } else if (this.tab === OPT_TAB_STRETCH) {
      var recalledSlot = (this.recalledMemoryIndex >= 0) ? this.memory.slot(this.recalledMemoryIndex) : null;
      if (recalledSlot && optSafeView(recalledSlot.view) && recalledSlot.view === view) {
         if (recalledSlot.meta && (recalledSlot.meta.compareKind === "star_split_starless" || recalledSlot.meta.compareKind === "star_split_stars" || recalledSlot.meta.menu === "SS")) {
            stretchMode = "mad-linked";
         }
      }
   }
   var showGradient = this.chkShowGradient && this.chkShowGradient.checked === true && optSafeView(this.lastRenderGradientView);
   // PERF-PLAN-A-BEGIN: compute showPostMask first so it can force a full-res render.
   // Force reduction=1 for the live full-res contexts: Stretch/Post curves, CC combine,
   // and the mask overlay. pendingActionKey is cleared on commit/activate, so this only
   // affects the live candidate (no permanent full-res regression).
   var showPostMask = this.tab === OPT_TAB_POST &&
      this.dialog &&
      this.dialog.postActiveMaskShown === true &&
      optSafeView(this.dialog.postActiveMask) &&
      (view === this.currentView || view === this.candidateView);
   // IMG-ENH: Color Mixer selection-mask overlay (same visual as the Post mask).
   var showImgEnhMask = this.tab === OPT_TAB_IMGENH &&
      this.dialog &&
      this.dialog.imgEnhActiveMaskShown === true &&
      optSafeView(this.dialog.imgEnhActiveMask) &&
      (view === this.currentView || view === this.candidateView);
   var activeMaskView = showPostMask ? this.dialog.postActiveMask : (showImgEnhMask ? this.dialog.imgEnhActiveMask : null);
   var renderReduction = this.dialog.sharedPreviewReduction || OPT_PREVIEW_REDUCTION_DEFAULT;
   var forceFullRes =
      (this.tab === OPT_TAB_CC && view === this.candidateView && this.pendingActionKey === "cc_combine") ||
      this.pendingActionKey === "stretch_curves" ||
      this.pendingActionKey === "post_curves" ||
      // IMG-ENH: the Color Mixer live candidate is pre-reduced to display resolution,
      // so render it 1:1 (no second reduction) like the other live candidates.
      (view === this.candidateView && (this.pendingActionKey === "imgenh_colormixer" || this.pendingActionKey === "imgenh_detail")) ||
      // showImgEnhMask intentionally NOT forced full-res: the Color Mixer selection
      // overlay only needs to show WHERE the mask acts, so render it at the normal
      // reduced preview resolution (full-res made Show/Hide Mask extremely slow).
      showPostMask;
   if (forceFullRes)
      renderReduction = 1;
   // PERF-PLAN-A-END
   var bmp = showGradient ?
      optRenderStackedPreviewBitmap(view, this.lastRenderGradientView, renderReduction, stretchMode) :
      optRenderPreviewBitmap(view, renderReduction, stretchMode);
   if (optSafeView(activeMaskView)) {
      var maskedBmp = optRenderPreviewBitmapWithMask(view, activeMaskView, renderReduction, stretchMode);
      if (maskedBmp)
         bmp = maskedBmp;
   }
   this.preview.imageCoordScaleX = bmp && bmp.width > 0 ? view.image.width / bmp.width : 1.0;
   this.preview.imageCoordScaleY = bmp && bmp.height > 0 ? view.image.height / bmp.height : 1.0;

   // >>> SPLIT COMPARE BEGIN >>>
   if (this.preview.isSplitMode) {
      var compareView = this.currentView;
      if (this.recalledMemoryIndex >= 0) {
         var slot = this.memory.slot(this.recalledMemoryIndex);
         if (slot && optSafeView(slot.view)) {
            if (this.previousActiveView && optSafeView(this.previousActiveView) && this.previousActiveView !== slot.view) {
               compareView = this.previousActiveView;
            }
         }
      } else if (view === this.candidateView) {
         compareView = this.currentView;
      }
      var compareBmp = null;
      if (optSafeView(compareView)) {
         var compGradient = (compareView === this.currentView) ? this.currentGradientView : null;
         if (this.recalledMemoryIndex >= 0 && compareView !== this.currentView) {
            for (var s = 0; s < OPT_MEMORY_SLOTS; ++s) {
               var sl = this.memory.slot(s);
               if (sl && optSafeView(sl.view) && sl.view === compareView) {
                  compGradient = sl.gradientView;
                  break;
               }
            }
         }
         var showCompGradient = this.chkShowGradient && this.chkShowGradient.checked === true && optSafeView(compGradient);
         compareBmp = showCompGradient ?
            optRenderStackedPreviewBitmap(compareView, compGradient, renderReduction, stretchMode) :
            optRenderPreviewBitmap(compareView, renderReduction, stretchMode);
         var showCompPostMask = this.tab === OPT_TAB_POST &&
            this.dialog &&
            this.dialog.postActiveMaskShown === true &&
            optSafeView(this.dialog.postActiveMask) &&
            compareView === this.currentView;
         if (showCompPostMask) {
            var compMaskedBmp = optRenderPreviewBitmapWithMask(compareView, this.dialog.postActiveMask, renderReduction, stretchMode);
            if (compMaskedBmp)
               compareBmp = compMaskedBmp;
         }
      }
      this.preview.compareBitmap = compareBmp;
   } else {
      this.preview.compareBitmap = null;
   }
   // <<< SPLIT COMPARE END <<<

   var stageText = stages.length > 0 ? " | Stages: " + stages.join(", ") : "";
   var previewText = "";
   if (stretchMode === "mad-unlinked")
      previewText = " | Preview: MAD AutoSTF unlinked";
   else if (stretchMode === "mad-linked")
      previewText = " | Preview: MAD AutoSTF linked";
   if (showGradient)
      previewText += " | Gradient model below";
   if (showPostMask)
      previewText += " | Active mask shown";
   this.preview.setBitmap(bmp, fit !== false);
   this.status.text = "<b>Current:</b> " + (this.currentKey ? optLabelForKey(this.currentKey) : "none") + (optSafeView(view) ? " (" + view.id + ")" : "") + stageText + previewText;
   this.updateQualityStatus(view);
};

// QUALITY-LINE: refresh the quality readout below the status line. Only recomputes when the
// view actually CHANGES (the metrics read the whole image; skip on zoom/pan/re-render of the
// same view). Replaces the Configuration-tab "Measure Quality" card.
OptPreviewPane.prototype.updateQualityStatus = function(view) {
   if (!this.qualityStatus) return;
   if (!optSafeView(view)) { this.qualityStatus.text = ""; this.__qualityViewId = null; return; }
   if (view.id === this.__qualityViewId) return;   // already measured this view
   this.__qualityViewId = view.id;
   try {
      var m = optQualityMetrics(view);
      this.qualityStatus.text = "<b>Quality:</b> bg " + m.background.toFixed(4) +
         " · noise " + m.noise.toExponential(1) + " · SNR " + m.snr.toFixed(1) +
         " · sat " + m.saturationPct.toFixed(2) + "% · DR " + m.dynamicRange.toFixed(1) + " stops" +
         " · range [" + m.min.toFixed(3) + ", " + m.max.toFixed(3) + "]";
   } catch (e) {
      this.qualityStatus.text = "";
      this.__qualityViewId = null;
   }
};

OptPreviewPane.prototype.renderBitmap = function(bitmap, label, fit, sourceWidth, sourceHeight) {
   if (!bitmap) {
      this.preview.setBitmap(null, fit !== false);
      this.status.text = label || "<b>Preview:</b> none";
      return;
   }
   this.lastRenderView = null;
   this.lastRenderGradientView = null;
   this.updateGradientControl(null);
   this.preview.imageCoordScaleX = bitmap.width > 0 && sourceWidth > 0 ? sourceWidth / bitmap.width : 1.0;
   this.preview.imageCoordScaleY = bitmap.height > 0 && sourceHeight > 0 ? sourceHeight / bitmap.height : 1.0;
   this.preview.setBitmap(bitmap, fit !== false);
   this.status.text = label || "<b>Preview:</b> bitmap";
};

OptPreviewPane.prototype.beginCandidate = function(stageName, transformFn, actionKey) {
   if (!this.currentKey || !optSafeView(this.currentView))
      throw new Error("Select a workflow image first.");
   this.preview.setBusy(true, stageName || "Working");
   var candidate = null;
   // Outer try/finally: setBusy(false) is GUARANTEED to run, even if optCloneView
   // or any other step throws. Without this, a failed clone left the pane locked
   // in "Working..." state forever.
   try {
      optCloseViews([this.previousView, this.candidateView, this.candidateGradientView]);
      this.previousView = optCloneView(this.currentView, "Opt_Previous_" + this.currentKey, false);
      candidate = optCloneView(this.currentView, "Opt_Candidate_" + this.currentKey + "_" + stageName, false);
      // #3: regular beginCandidate flow has no upgrader; clear any stale one
      // left over from a previous beginCandidateFromFactory invocation.
      this.__candidateUpgrader = null;
      var resultMeta = null;
      var resultGradientView = null;
      try {
         if (typeof transformFn === "function") {
            var replacement = transformFn(candidate, this.currentView);
            if (replacement && typeof replacement === "object" && !optSafeView(replacement)) {
               var objectReplacementView = null;
               if (optSafeView(replacement.view))
                  objectReplacementView = replacement.view;
               else if (optSafeView(replacement.continueView))
                  objectReplacementView = replacement.continueView;
               if (optSafeView(objectReplacementView) && objectReplacementView.id !== candidate.id) {
                  optCloseView(candidate);
                  candidate = objectReplacementView;
               }
               if (optSafeView(replacement.gradientView))
                  resultGradientView = replacement.gradientView;
               else if (replacement.bkgView !== undefined && optSafeView(replacement.bkgView))
                  resultGradientView = replacement.bkgView;
               resultMeta = replacement.meta || replacement;
               replacement = candidate;
            }
            var replacementIsDifferent = false;
            try {
               var replacementId = optSafeView(replacement) ? replacement.id : "";
               var candidateId = optSafeView(candidate) ? candidate.id : "";
               replacementIsDifferent = replacementId.length > 0 && candidateId.length > 0 && replacementId !== candidateId;
            } catch (e0) {
               replacementIsDifferent = false;
            }
            if (replacementIsDifferent) {
               optCloseView(candidate);
               candidate = replacement;
            }
         }
         if (!optSafeView(candidate))
            throw new Error("The candidate preview view is not valid after applying the process.");
      } catch (e) {
         optCloseView(candidate);
         throw e;
      }
      this.candidateView = candidate;
      this.candidateGradientView = optSafeView(resultGradientView) ? resultGradientView : null;
      this.pendingStage = stageName || "";
      this.pendingActionKey = actionKey || "";
      this.pendingMemoryMeta = optBuildMemoryMeta(this, this.pendingStage, this.pendingActionKey, resultMeta);
      this.showingPrevious = false;
      this.recalledMemoryIndex = -1;
      this.render(candidate, false, this.candidateGradientView);
      optThemeApplyPrimaryActionButton(this.btnSetCurrent, false);  // READY
      this.btnSetCurrent.enabled = true;
   } finally {
      this.preview.setBusy(false);
   }
};

// Skip-clone variant of beginCandidate (#4): use when the factoryFn always
// constructs and returns its own view (e.g. Channel Combination compose).
// Avoids the upfront optCloneView(currentView, "Opt_Candidate_*") that
// beginCandidate creates and immediately discards. The factoryFn signature
// is `function(currentView)` and may return either a View or an object
// `{ view, gradientView, meta, bkgView, continueView }` like beginCandidate.
//
// `opts.upgradeFn` (#3): optional function called from setToCurrent before the
// candidate is committed. Used by CC live compose to regenerate a full-res
// view when the user commits a downsampled live preview.
OptPreviewPane.prototype.beginCandidateFromFactory = function(stageName, factoryFn, actionKey, opts) {
   if (!this.currentKey || !optSafeView(this.currentView))
      throw new Error("Select a workflow image first.");
   if (typeof factoryFn !== "function")
      throw new Error("beginCandidateFromFactory: factoryFn is required.");
   this.preview.setBusy(true, stageName || "Working");
   var candidate = null;
   // Outer try/finally so setBusy(false) ALWAYS fires. See note in beginCandidate.
   try {
      optCloseViews([this.previousView, this.candidateView, this.candidateGradientView]);
      this.previousView = optCloneView(this.currentView, "Opt_Previous_" + this.currentKey, false);
      this.__candidateUpgrader = (opts && typeof opts.upgradeFn === "function") ? opts.upgradeFn : null;
      var resultMeta = null;
      var resultGradientView = null;
      try {
         var produced = factoryFn(this.currentView);
         if (produced && typeof produced === "object" && !optSafeView(produced)) {
            if (optSafeView(produced.view))
               candidate = produced.view;
            else if (optSafeView(produced.continueView))
               candidate = produced.continueView;
            if (optSafeView(produced.gradientView))
               resultGradientView = produced.gradientView;
            else if (produced.bkgView !== undefined && optSafeView(produced.bkgView))
               resultGradientView = produced.bkgView;
            resultMeta = produced.meta || produced;
         } else if (optSafeView(produced)) {
            candidate = produced;
         }
         if (!optSafeView(candidate))
            throw new Error("The candidate preview view is not valid after applying the process.");
      } catch (e) {
         optCloseView(candidate);
         throw e;
      }
      this.candidateView = candidate;
      this.candidateGradientView = optSafeView(resultGradientView) ? resultGradientView : null;
      this.pendingStage = stageName || "";
      this.pendingActionKey = actionKey || "";
      this.pendingMemoryMeta = optBuildMemoryMeta(this, this.pendingStage, this.pendingActionKey, resultMeta);
      this.showingPrevious = false;
      this.recalledMemoryIndex = -1;
      this.render(candidate, false, this.candidateGradientView);
      optThemeApplyPrimaryActionButton(this.btnSetCurrent, false);  // READY
      this.btnSetCurrent.enabled = true;
   } finally {
      this.preview.setBusy(false);
   }
};

OptPreviewPane.prototype.setToCurrent = function() {
   var fromMemory = this.recalledMemoryIndex >= 0 ? this.memory.slot(this.recalledMemoryIndex) : null;
   if (fromMemory && optSafeView(fromMemory.view)) {
      // ===== COMPARE-SS-BEGIN — single-layer Star Split commit
      // (v140 Option B). Each Star Split Compare slot holds exactly
      // one layer (Starless or Stars); committing one publishes only
      // that layer to <Base>_Starless or <Base>_Stars in the store.
      // The user is expected to repeat the action for the other layer
      // if they want to commit a different engine's stars after
      // committing one engine's starless (or vice versa). Mosaic
      // disappears on the first commit because the preview activates
      // the just-committed key. =====
      var splitMeta = fromMemory.meta || null;
      if (splitMeta && (splitMeta.compareKind === "star_split_starless" || splitMeta.compareKind === "star_split_stars")) {
         var splitBaseKey = fromMemory.key || this.currentKey || "";
         var base = optBaseKey(splitBaseKey);
         var isStars = (splitMeta.compareKind === "star_split_stars");
         var destKey = isStars ? (base + "_Stars") : (base + "_Starless");
         var destClone = optMemoryCloneView(
            fromMemory.view,
            isStars ? "Opt_CurrentSplitStars" : "Opt_CurrentSplitStarless",
            destKey, this.recalledMemoryIndex);
         if (!optSafeView(destClone))
            return;
         this.dialog.store.setView(destKey, destClone, true, OPT_TAB_STRETCH);
         this.dialog.store.markStage(destKey, isStars ? "Stars" : "Starless");
         optCloseViews([this.candidateView, this.candidateGradientView]);
         this.recalledMemoryIndex = -1;
         this.candidateView = null;
         this.candidateGradientView = null;
         this.pendingStage = "";
         this.pendingActionKey = "";
         this.pendingMemoryMeta = null;
         this.dialog.refreshWorkflowButtons();
         this.activate(destKey, false);   // shows the committed layer; mosaic disappears
         optThemeApplyPrimaryActionButton(this.btnSetCurrent, true);   // APPLIED
         this.btnSetCurrent.enabled = false;
         return;
      }
      // ===== COMPARE-SS-END =====
      optCloseViews([this.currentGradientView]);
      this.currentKey = fromMemory.key || this.currentKey;
      var currentClone = optMemoryCloneView(fromMemory.view, "Opt_CurrentFromMemory", this.currentKey, this.recalledMemoryIndex);
      var gradClone = optMemoryCloneView(fromMemory.gradientView, "Opt_CurrentGradientFromMemory", this.currentKey, this.recalledMemoryIndex);
      if (!optSafeView(currentClone)) {
         optCloseViews([gradClone]);
         return;
      }
      this.dialog.store.setView(this.currentKey, currentClone, true, this.tab);
      this.currentView = currentClone;
      this.currentGradientView = gradClone;
      this.currentMemoryMeta = fromMemory.meta || null;
      if (this.currentMemoryMeta && this.currentMemoryMeta.stage)
         this.dialog.store.markStage(this.currentKey, this.currentMemoryMeta.stage);
      var defaultStage = optDefaultTabStageLabel(this.tab);
      if (defaultStage)
         this.dialog.store.markStage(this.currentKey, defaultStage);
      optCloseViews([this.candidateView, this.candidateGradientView]);
      this.recalledMemoryIndex = -1;
      this.candidateView = null;
      this.candidateGradientView = null;
      this.pendingStage = "";
      this.pendingActionKey = "";
      this.pendingMemoryMeta = null;
      this.dialog.refreshWorkflowButtons();
      this.render(this.currentView, false, this.currentGradientView);
      optThemeApplyPrimaryActionButton(this.btnSetCurrent, true);   // APPLIED
      this.btnSetCurrent.enabled = false;
      return;
   }
   if (!this.currentKey || !optSafeView(this.candidateView))
      return;
   // #3: if a candidate upgrader is registered (live preview), regenerate a
   // full-res view before committing it to the store.
   if (typeof this.__candidateUpgrader === "function") {
      var upgrader = this.__candidateUpgrader;
      this.__candidateUpgrader = null;
      var upgradeFailed = false;
      this.preview.setBusy(true, optT("Upgrading to full resolution..."));
      try {
         var upgraded = upgrader(this.candidateView);
         if (optSafeView(upgraded)) {
            if (upgraded.id !== this.candidateView.id) {
               optCloseView(this.candidateView);
               this.candidateView = upgraded;
            }
         } else {
            upgradeFailed = true;
         }
      } catch (eU) {
         try { console.warningln("Use this Image upgrade failed: " + eU.message); } catch (eW) {}
         upgradeFailed = true;
      } finally {
         this.preview.setBusy(false);
      }
      if (upgradeFailed || !optSafeView(this.candidateView))
         return;
   }
   optCloseViews([this.currentGradientView]);
   this.dialog.store.setView(this.currentKey, this.candidateView, true, this.tab);
   if (this.pendingStage)
      this.dialog.store.markStage(this.currentKey, this.pendingStage);
   this.currentView = this.candidateView;
   this.currentGradientView = this.candidateGradientView;
   this.currentMemoryMeta = this.pendingMemoryMeta;
   this.candidateView = null;
   this.candidateGradientView = null;
   this.pendingStage = "";
   this.pendingActionKey = "";
   this.pendingMemoryMeta = null;
   this.recalledMemoryIndex = -1;
   this.dialog.refreshWorkflowButtons();
   this.render(this.currentView, false, this.currentGradientView);
   optThemeApplyPrimaryActionButton(this.btnSetCurrent, true);   // APPLIED
   this.btnSetCurrent.enabled = false;
};

// >>> SPLIT COMPARE BEGIN >>>
OptPreviewPane.prototype.toggleSplitMode = function() {
   this.preview.isSplitMode = !this.preview.isSplitMode;
   if (this.preview.isSplitMode) {
      this.btnSplit.text = "[Split]";
      optThemeApplyPrimaryActionButton(this.btnSplit, false);
   } else {
      this.btnSplit.text = "Split";
      optThemeApplyActionButton(this.btnSplit);
   }
   if (optSafeView(this.lastRenderView)) {
      this.render(this.lastRenderView, false, this.lastRenderGradientView);
   }
};
// <<< SPLIT COMPARE END <<<

OptPreviewPane.prototype.toggle = function() {
   if (!optSafeView(this.previousView) || !optSafeView(this.currentView) && !optSafeView(this.candidateView))
      return;
   this.showingPrevious = !this.showingPrevious;
   if (this.showingPrevious)
      this.render(this.previousView, false, null);
   else
      this.render(this.candidateView || this.currentView, false, this.candidateView ? this.candidateGradientView : this.currentGradientView);
};

OptPreviewPane.prototype.exportCurrent = function() {
   var view = this.candidateView || this.currentView;
   if (!optSafeView(view))
      return;
   // If the candidate is a live downsampled preview (e.g. CC compose), regenerate
   // at full resolution before exporting so the exported image is not cropped/scaled.
   var toExport = view;
   var tempUpgraded = null;
   if (typeof this.__candidateUpgrader === "function") {
      this.preview.setBusy(true, optT("Preparing full-resolution export..."));
      try {
         var upgraded = this.__candidateUpgrader(view);
         if (optSafeView(upgraded)) {
            toExport = upgraded;
            tempUpgraded = upgraded;
         }
      } catch (eU) {
         try { console.warningln("Export: full-resolution upgrade failed — exporting current preview resolution. " + eU.message); } catch (eW) {}
      } finally {
         this.preview.setBusy(false);
      }
   }
   // optCloneView copies FITS keywords + WCS astrometric solution via optCopyMetadata.
   var exported = optCloneView(toExport, "Opt_Export_" + (this.currentKey || view.id), true);
   if (tempUpgraded && tempUpgraded !== view)
      try { optCloseView(tempUpgraded); } catch (eTmp) {}
   if (optSafeView(exported)) {
      // PROC-LOG: this image only goes to the PixInsight workspace (no disk file),
      // so the processing log must ride embedded in the view itself — HISTORY
      // keywords + XISF property, so it survives a later manual save.
      try {
         var recExp = this.currentKey ? this.dialog.store.record(this.currentKey) : null;
         var builtExp = optProcLogBuild(exported, recExp);
         if (builtExp) optProcLogEmbed(exported, builtExp.text);
      } catch (eLog) {
         try { console.warningln("Export: could not embed processing log — " + (eLog.message || eLog)); } catch (eW) {}
      }
      try { exported.window.bringToFront(); } catch (eBTF) {}
      console.writeln("Exported: " + exported.id +
         " (" + exported.image.width + "x" + exported.image.height + ", " +
         exported.image.numberOfChannels + "ch)");
   }
};

OptPreviewPane.prototype.exportCurrentTiff = function() {
   var view = this.candidateView || this.currentView;
   if (!optSafeView(view))
      return;
   var toExport = view;
   var tempUpgraded = null;
   if (typeof this.__candidateUpgrader === "function") {
      this.preview.setBusy(true, optT("Preparing full-resolution export..."));
      try {
         var upgraded = this.__candidateUpgrader(view);
         if (optSafeView(upgraded)) {
            toExport = upgraded;
            tempUpgraded = upgraded;
         }
      } catch (eU) {
         try { console.warningln("Export TIF: full-resolution upgrade failed — " + eU.message); } catch (eW) {}
      } finally {
         this.preview.setBusy(false);
      }
   }
   try {
      var fd = new SaveFileDialog();
      fd.caption = "Export 16-bit TIFF (Photoshop compatible)";
      if (!fd.execute())
         return;
      var filePath = fd.fileName;
      if (!/\.tiff?$/i.test(filePath))
         filePath += ".tif";
      var img = toExport.image;
      // PROC-LOG: build once from the full-res source; embed into the TIFF
      // (HISTORY keywords) and drop the .txt/.csv sidecars next to it.
      var builtTif = null;
      try {
         var recTif = this.currentKey ? this.dialog.store.record(this.currentKey) : null;
         builtTif = optProcLogBuild(toExport, recTif);
      } catch (eB) { builtTif = null; }
      // Create a native 16-bit integer ImageWindow — PixInsight normalizes [0,1]→[0,65535] automatically.
      var exportWin = new ImageWindow(
         img.width, img.height, img.numberOfChannels,
         16, false, img.isColor, ""
      );
      try {
         exportWin.mainView.beginProcess(UndoFlag_NoSwapFile);
         exportWin.mainView.image.assign(img);
         exportWin.mainView.endProcess();
         // Use FileFormatInstance to write with explicit compression=none.
         // writeImage() takes exactly one argument (the image); ImageDescription is not accepted.
         var F = new FileFormat("TIFF", false, true);
         if (F.isNull)
            throw new Error("TIFF format module not available.");
         var fInst = new FileFormatInstance(F);
         if (!fInst.create(filePath, "compression none"))
            throw new Error("Cannot create file: " + filePath);
         if (builtTif && typeof optProcLogEmbedInstance === "function")
            try { optProcLogEmbedInstance(fInst, F, builtTif.text); } catch (eEmb) {}
         if (!fInst.writeImage(exportWin.mainView.image))
            throw new Error("TIFF write failed for: " + filePath);
         fInst.close();
         console.writeln("Exported 16-bit TIFF (uncompressed): " + filePath +
            " (" + img.width + "x" + img.height +
            ", " + img.numberOfChannels + "ch)");
         if (builtTif) {
            var sideTif = optProcLogWriteSidecars(filePath, builtTif.data, builtTif.text);
            if (sideTif.txtPath)
               console.writeln("=> Processing log: " + sideTif.txtPath +
                  (sideTif.csvPath ? (" + " + sideTif.csvPath) : "") + " (embedded in TIFF keywords).");
         }
      } finally {
         exportWin.close();
      }
   } catch (eX) {
      console.warningln("Export TIF: " + eX.message);
   } finally {
      if (tempUpgraded && tempUpgraded !== view)
         try { optCloseView(tempUpgraded); } catch (eTmp) {}
   }
};

OptPreviewPane.prototype.storeMemory = function(index) {
   var view = this.candidateView || this.currentView;
   var gradientView = this.candidateView ? this.candidateGradientView : this.currentGradientView;
   var meta = this.candidateView ? this.pendingMemoryMeta : this.currentMemoryMeta;
   if (!meta) {
      var fallbackStage = this.pendingStage || optDefaultTabStageLabel(this.tab) || "Current";
      meta = optBuildMemoryMeta(this, fallbackStage, this.pendingActionKey || "", null);
   }
   if (optSafeView(view)) {
      this.memory.store(index, this.currentKey || view.id, view, meta, gradientView);
   }
};

OptPreviewPane.prototype.recallMemory = function(index) {
   var slot = this.memory.slot(index);
   if (slot && optSafeView(slot.view)) {
      this.recalledMemoryIndex = index;
      this.showingPrevious = false;
      optTouchSlot(slot);
      this.render(slot.view, false, slot.gradientView);
      optThemeApplyPrimaryActionButton(this.btnSetCurrent, false);  // READY
      this.btnSetCurrent.enabled = true;
   }
};

OptPreviewPane.prototype.releaseTransient = function() {
   optCloseViews([this.previousView, this.candidateView, this.candidateGradientView, this.currentGradientView]);
   try { if (this.preview) this.preview.setBitmap(null, false); } catch (eBmp) {}
   // >>> SPLIT COMPARE BEGIN >>>
   try { if (this.preview) this.preview.compareBitmap = null; } catch (eComp) {}
   this.previousActiveView = null;
   // <<< SPLIT COMPARE END <<<
   this.previousView = null;
   this.candidateView = null;
   this.candidateGradientView = null;
   this.currentGradientView = null;
   this.pendingStage = "";
   this.pendingActionKey = "";
   this.pendingMemoryMeta = null;
   this.currentMemoryMeta = null;
   this.recalledMemoryIndex = -1;
   this.memory.clear();
};

