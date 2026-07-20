function optBuildMaskMemoryPanel(dialog, parent, previewPane) {
   if (!dialog.postMaskMemory)
      dialog.postMaskMemory = new OptMaskMemoryManager(OPT_MASK_MEMORY_SLOTS);
   // Phase 6.10: themed Mask memory panel — same shape as the image memory
   // bank above the preview (MASK label + container of 8 chip buttons +
   // ghost reset, plus an extra Show/Hide button on the right).
   var row = new Control(parent);
   row.sizer = new HorizontalSizer();
   row.sizer.spacing = Theme.s2;
   var maskLabel = new Label(row);
   maskLabel.text = "MASK";
   maskLabel.textAlignment = TextAlign_Left | TextAlign_VertCenter;
   optThemeApplyMemoryLabel(maskLabel);
   // Phase 6.11: fixed label column matching the MEMORY row above.
   maskLabel.minWidth = 60; try { maskLabel.maxWidth = 60; } catch (eML) {}
   row.sizer.add(maskLabel);

   var maskContainer = new Control(row);
   optThemeApplyMemoryContainer(maskContainer);
   maskContainer.sizer = new HorizontalSizer();
   maskContainer.sizer.margin = 3;
   maskContainer.sizer.spacing = 2;

   var buttons = [];
   var ttMaskSlot = "";
   try { ttMaskSlot = optTooltipTextByKey("mask.memory.slot") || ""; } catch (eTMS) {}
   for (var i = 0; i < OPT_MASK_MEMORY_SLOTS; ++i) {
      var b = optButton(maskContainer, "" + (i + 1), 0);
      optThemeApplyMemorySlot(b, false);
      b.__maskMemoryIndex = i;
      if (ttMaskSlot) { optApplyTooltip(b, ttMaskSlot); }
      buttons.push(b);
      // Left-click: store the current postActiveMask in this slot.
      b.onClick = function() {
         var activeMask = dialog.postActiveMask;
         if (!optSafeView(activeMask)) return;
         var m = optMaskMemoryMeta(dialog);
         dialog.postMaskMemory.storeAt(this.__maskMemoryIndex, activeMask, m);
         if (typeof dialog.refreshPostMaskMemoryUi === "function")
            dialog.refreshPostMaskMemoryUi();
      };
      // Right-click: recall AND activate in a single gesture (v33-opt-9m).
      // Mirrors image-memory's right-click=recall: the slot's mask becomes
      // the new postActiveMask immediately. Eliminates the previous two-step
      // flow that required clicking "Set to Active Mask" after recall.
      b.onMousePress = function(x, y, button) {
         if (button !== OPT_MOUSE_RIGHT) return;
         var idx = this.__maskMemoryIndex;
         optSafeUi("Recall and activate mask memory", function() {
            var slot = dialog.postMaskMemory.select(idx);
            if (!slot || !optSafeView(slot.view)) return;
            optSetActivePostMaskFromMemory(dialog, slot.view, previewPane);
         });
      };
      maskContainer.sizer.add(b);
   }
   row.sizer.add(maskContainer);

   var btnReset = optButton(row, "RESET", 0);
   optThemeApplyMemoryReset(btnReset);
   try {
      var ttRstMsk = optTooltipTextByKey("reset.mask");
      if (ttRstMsk) btnReset.toolTip = ttRstMsk;
   } catch (eRstMsk) {}
   var btnShowHide = optButton(row, "SHOW/HIDE", 0);
   optThemeApplyMemoryReset(btnShowHide);
   if (!dialog._postShowHideMaskButtons) dialog._postShowHideMaskButtons = [];
   dialog._postShowHideMaskButtons.push(btnShowHide);
   // v33-opt-9m: "Set to Active Mask" button removed — right-click on a
   // memory slot now activates directly. Image-memory parity.
   dialog.refreshPostMaskMemoryUi = function() {
      var showHideEnabled = optSafeView(dialog.postActiveMask);
      for (var k = 0; k < dialog._postShowHideMaskButtons.length; ++k)
         if (dialog._postShowHideMaskButtons[k])
            dialog._postShowHideMaskButtons[k].enabled = showHideEnabled;
      optRefreshCcMaskCombos(dialog);
   };
   btnReset.onClick = function() {
      optSafeUi("Reset Mask Memories", function() {
         dialog.postMaskMemory.clear();
         dialog.refreshPostMaskMemoryUi();
      });
   };
   btnShowHide.onClick = function() {
      optSafeUi("Show/Hide Mask", function() {
         optSetPostActiveMaskShown(dialog, dialog.postActiveMaskShown !== true, previewPane);
      });
   };
   row.sizer.add(btnReset);
   row.sizer.add(btnShowHide);
   row.sizer.addStretch();
   dialog.postMaskMemory.registerButtons(buttons);
   dialog.refreshPostMaskMemoryUi();
   parent.sizer.add(row);
   return row;
}

function optBuildPostNoiseSection(dlg) {
   dlg.postTab.addProcessSection("Noise Reduction", [{
      text: "Apply Noise Reduction",
      stage: "Noise Reduction",
      actionKey: "post_nr",
      name: "btnPostNR",
      width: 180,
      transform: function(candidate, dialog) { return optApplyPostCandidate(candidate, "post_nr", dialog); }
   }, {
      // ===== COMPARE-BEGIN (button entry) =====
      text: "Compare",
      stage: "Compare Noise Reduction",
      name: "btnPostNRCompare",
      width: 90,
      primary: false,
      action: function(tab, pane, btn) { optComparePostNoiseReduction(tab.dialog); }
      // ===== COMPARE-END =====
   }], {
      build: function(body) {
         // DEEPSNR-INTEGRATION-BEGIN
         var row = optComboRow(body, "Algorithm:", ["NoiseXTerminator", "TGVDenoise", "Cosmic Clarity (Seti Astro)", "GraXpert Denoise", "Prism (SyQon)", "DeepSNR"], 80);
         // DEEPSNR-INTEGRATION-END
         dlg.comboPostNR = row.combo;
         body.sizer.add(row.row);
         dlg.postNXTGroup = optInnerGroup(body, "NoiseXTerminator Settings");
         dlg.ncPostNxtDenoise = optNumeric(dlg.postNXTGroup, "Denoise:", 0.0, 1.0, 0.85, 2, 100);
         dlg.ncPostNxtIter = optNumeric(dlg.postNXTGroup, "Iterations:", 1, 5, 2, 0, 100);
         
         dlg.chkPostNxtColorSep = new CheckBox(dlg.postNXTGroup);
         dlg.chkPostNxtColorSep.text = "Enable color separation";
         optApplyCheckBoxTooltip(dlg.chkPostNxtColorSep);
         
         dlg.chkPostNxtFreqSep = new CheckBox(dlg.postNXTGroup);
         dlg.chkPostNxtFreqSep.text = "Enable frequency separation";
         optApplyCheckBoxTooltip(dlg.chkPostNxtFreqSep);
         
         dlg.ncPostNxtDenoiseColor = optNumeric(dlg.postNXTGroup, "Denoise Color:", 0.0, 1.0, 0.95, 2, 100);
         // Engine-specific tooltip (NoiseXTerminator); the Cosmic Clarity denoise
         // panel uses cc.denoise.color on its own slider, so each gets its own text.
         optApplyNumericTooltipKey(dlg.ncPostNxtDenoiseColor, "nxt.denoise.color");
         dlg.ncPostNxtFreqScale = optNumeric(dlg.postNXTGroup, "HF/LF Scale:", 1.0, 15.0, 5.0, 1, 100);
         dlg.ncPostNxtDenoiseLF = optNumeric(dlg.postNXTGroup, "Denoise LF:", 0.0, 1.0, 0.60, 2, 100);
         dlg.ncPostNxtDenoiseLFColor = optNumeric(dlg.postNXTGroup, "Den. LF Color:", 0.0, 1.0, 1.00, 2, 100);
         
         // Layout main settings
         dlg.postNXTGroup.sizer.add(dlg.ncPostNxtDenoise);
         dlg.postNXTGroup.sizer.add(dlg.ncPostNxtIter);
         
         // Spacing
         dlg.postNXTGroup.sizer.addSpacing(4);
         
         // Layout Color Separation section
         dlg.postNXTGroup.sizer.add(dlg.chkPostNxtColorSep);
         dlg.postNXTGroup.sizer.add(dlg.ncPostNxtDenoiseColor);
         
         // Spacing
         dlg.postNXTGroup.sizer.addSpacing(4);
         
         // Layout Frequency Separation section
         dlg.postNXTGroup.sizer.add(dlg.chkPostNxtFreqSep);
         dlg.postNXTGroup.sizer.add(dlg.ncPostNxtFreqScale);
         dlg.postNXTGroup.sizer.add(dlg.ncPostNxtDenoiseLF);
         dlg.postNXTGroup.sizer.add(dlg.ncPostNxtDenoiseLFColor);
         
         // State synchronization logic
         dlg.updateNxtUiStates = function() {
            var isRgb = true;
            try {
               if (typeof dlg.canonicalIsColor === "function") {
                  isRgb = (dlg.canonicalIsColor(OPT_TAB_POST) === true);
               }
            } catch (eRgb) {}
            
            var colorSep = dlg.chkPostNxtColorSep.checked && isRgb;
            var freqSep = dlg.chkPostNxtFreqSep.checked;
            
            dlg.ncPostNxtDenoiseColor.enabled = colorSep;
            dlg.ncPostNxtFreqScale.enabled = freqSep;
            dlg.ncPostNxtDenoiseLF.enabled = freqSep;
            dlg.ncPostNxtDenoiseLFColor.enabled = (colorSep && freqSep);
         };
         
         dlg.chkPostNxtColorSep.onCheck = function(checked) {
            dlg.updateNxtUiStates();
         };
         dlg.chkPostNxtFreqSep.onCheck = function(checked) {
            dlg.updateNxtUiStates();
         };
         
         // Initial trigger
         dlg.updateNxtUiStates();
         
         body.sizer.add(dlg.postNXTGroup);
         dlg.postTGVGroup = optInnerGroup(body, "TGVDenoise Settings");
         dlg.ncPostTgvStrengthL = optNumeric(dlg.postTGVGroup, "Lum. Str.", 1.0, 20.0, 5.0, 1, 80);
         dlg.ncPostTgvStrengthC = optNumeric(dlg.postTGVGroup, "Chr. Str.", 0.0, 20.0, 3.0, 1, 80);
         dlg.ncPostTgvEdge = optNumeric(dlg.postTGVGroup, "Edge Prot.", 0.0, 0.1, 0.002, 4, 80);
         dlg.ncPostTgvSmooth = optNumeric(dlg.postTGVGroup, "Smoothness:", 1.0, 10.0, 2.0, 1, 150);
         dlg.ncPostTgvIter = optNumeric(dlg.postTGVGroup, "Iterations:", 100, 3000, 500, 0, 150);
         dlg.postTGVGroup.sizer.add(dlg.ncPostTgvStrengthL); dlg.postTGVGroup.sizer.add(dlg.ncPostTgvStrengthC);
         dlg.postTGVGroup.sizer.add(dlg.ncPostTgvEdge); dlg.postTGVGroup.sizer.add(dlg.ncPostTgvSmooth); dlg.postTGVGroup.sizer.add(dlg.ncPostTgvIter);
         body.sizer.add(dlg.postTGVGroup);
         dlg.postCCNRGroup = optInnerGroup(body, "Cosmic Clarity Denoise Settings");
         dlg.comboPostCCDenoiseMode = optComboRow(dlg.postCCNRGroup, "Den. Mode", ["Full Image", "Luminance Only"], 80);
         dlg.comboPostCCDenoiseModel = optComboRow(dlg.postCCNRGroup, "Den. Model", ["Walking Noise", "Standard"], 80);
         dlg.ncPostCCNRLuma = optNumeric(dlg.postCCNRGroup, "Den. Luma", 0.0, 1.0, 0.50, 2, 80);
         dlg.ncPostCCNRColor = optNumeric(dlg.postCCNRGroup, "Den. Color", 0.0, 1.0, 0.50, 2, 80);
         // Engine-specific tooltip (Cosmic Clarity); see the NXT panel above.
         optApplyNumericTooltipKey(dlg.ncPostCCNRColor, "cc.denoise.color");
         dlg.chkPostCCNRRemoveAb = new CheckBox(dlg.postCCNRGroup); dlg.chkPostCCNRRemoveAb.text = "Remove Aberration First"; optApplyCheckBoxTooltip(dlg.chkPostCCNRRemoveAb);
         dlg.postCCNRGroup.sizer.add(dlg.comboPostCCDenoiseMode.row);
         dlg.postCCNRGroup.sizer.add(dlg.comboPostCCDenoiseModel.row);
         dlg.postCCNRGroup.sizer.add(dlg.ncPostCCNRLuma);
         dlg.postCCNRGroup.sizer.add(dlg.ncPostCCNRColor);
         dlg.postCCNRGroup.sizer.add(dlg.chkPostCCNRRemoveAb);
         body.sizer.add(dlg.postCCNRGroup);

         dlg.postGraXpertNRGroup = optInnerGroup(body, "GraXpert Denoise Settings");
         dlg.ncPostGraXpertStrength = optNumeric(dlg.postGraXpertNRGroup, "Strength:", 0.0, 2.0, 1.00, 2, 150);
         dlg.ncPostGraXpertBatchSize = optNumeric(dlg.postGraXpertNRGroup, "Batch size:", 1, 16, 4, 0, 150);
         dlg.postGraXpertNRGroup.sizer.add(dlg.ncPostGraXpertStrength);
         dlg.postGraXpertNRGroup.sizer.add(dlg.ncPostGraXpertBatchSize);
         body.sizer.add(dlg.postGraXpertNRGroup);

         // PRISM-INTEGRATION-BEGIN
         dlg.postPrismGroup = optInnerGroup(body, "Prism (SyQon) Settings");
         dlg.ncPostPrismStrength = optNumeric(dlg.postPrismGroup, "Strength:", 0.0, 1.0, 0.85, 2, 100);
         dlg.ncPostPrismTileSize = optNumeric(dlg.postPrismGroup, "Tile Size:", 128, 2048, 512, 0, 100);
         dlg.ncPostPrismOverlap = optNumeric(dlg.postPrismGroup, "Overlap:", 8, 512, 128, 0, 100);
         dlg.ncPostPrismPad = optNumeric(dlg.postPrismGroup, "Pad:", 0, 2048, 512, 0, 100);
         
         optApplyExplicitTooltip(dlg.ncPostPrismStrength, "prism.strength");
         try {
            var ttStr = optTooltipTextByKey("prism.strength");
            if (ttStr) {
               dlg.ncPostPrismStrength.label.toolTip = ttStr;
               dlg.ncPostPrismStrength.slider.toolTip = ttStr;
            }
         } catch (e) {}
         
         optApplyExplicitTooltip(dlg.ncPostPrismTileSize, "prism.tileSize");
         try {
            var ttTile = optTooltipTextByKey("prism.tileSize");
            if (ttTile) {
               dlg.ncPostPrismTileSize.label.toolTip = ttTile;
               dlg.ncPostPrismTileSize.slider.toolTip = ttTile;
            }
         } catch (e) {}

         optApplyExplicitTooltip(dlg.ncPostPrismOverlap, "prism.overlap");
         try {
            var ttOverlap = optTooltipTextByKey("prism.overlap");
            if (ttOverlap) {
               dlg.ncPostPrismOverlap.label.toolTip = ttOverlap;
               dlg.ncPostPrismOverlap.slider.toolTip = ttOverlap;
            }
         } catch (e) {}

         optApplyExplicitTooltip(dlg.ncPostPrismPad, "prism.pad");
         try {
            var ttPad = optTooltipTextByKey("prism.pad");
            if (ttPad) {
               dlg.ncPostPrismPad.label.toolTip = ttPad;
               dlg.ncPostPrismPad.slider.toolTip = ttPad;
            }
         } catch (e) {}

         dlg.chkPostPrismUseAMP = new CheckBox(dlg.postPrismGroup);
         optI18nLabel(dlg.chkPostPrismUseAMP, "Use AMP");
         optApplyExplicitTooltip(dlg.chkPostPrismUseAMP, "prism.useAMP");
         
         var ampDTypeRowObj = optComboRow(dlg.postPrismGroup, "AMP Type:", ["fp16", "bf16"], 100);
         dlg.comboPostPrismAMPDType = ampDTypeRowObj.combo;
         optApplyExplicitTooltip(dlg.comboPostPrismAMPDType, "prism.ampDType");
         
         dlg.chkPostPrismUseCPU = new CheckBox(dlg.postPrismGroup);
         optI18nLabel(dlg.chkPostPrismUseCPU, "Force CPU");
         optApplyExplicitTooltip(dlg.chkPostPrismUseCPU, "prism.useCPU");
         
         dlg.chkPostPrismNoDML = new CheckBox(dlg.postPrismGroup);
         dlg.chkPostPrismNoDML.text = "Disable DirectML";
         optApplyExplicitTooltip(dlg.chkPostPrismNoDML, "prism.noDML");
         
         dlg.postPrismGroup.sizer.add(dlg.ncPostPrismStrength);
         dlg.postPrismGroup.sizer.add(dlg.ncPostPrismTileSize);
         dlg.postPrismGroup.sizer.add(dlg.ncPostPrismOverlap);
         dlg.postPrismGroup.sizer.add(dlg.ncPostPrismPad);
         dlg.postPrismGroup.sizer.addSpacing(4);
         dlg.postPrismGroup.sizer.add(dlg.chkPostPrismUseAMP);
         dlg.postPrismGroup.sizer.add(ampDTypeRowObj.row);
         dlg.postPrismGroup.sizer.add(dlg.chkPostPrismUseCPU);
         dlg.postPrismGroup.sizer.add(dlg.chkPostPrismNoDML);
         
         dlg.chkPostPrismUseAMP.onCheck = function(checked) {
            dlg.comboPostPrismAMPDType.enabled = checked;
         };
         dlg.comboPostPrismAMPDType.enabled = dlg.chkPostPrismUseAMP.checked;
         
         body.sizer.add(dlg.postPrismGroup);
         // PRISM-INTEGRATION-END
         // DEEPSNR-INTEGRATION-BEGIN
         dlg.postDeepSNRGroup = optInnerGroup(body, "DeepSNR Settings");
         dlg.ncPostDeepSNRAmount = optNumeric(dlg.postDeepSNRGroup, "Amount:", 0.0, 1.0, 0.75, 2, 100);
         optApplyExplicitTooltip(dlg.ncPostDeepSNRAmount, "deepsnr.amount");
         try {
            var ttDeepSNRAmount = optTooltipTextByKey("deepsnr.amount");
            if (ttDeepSNRAmount) {
               dlg.ncPostDeepSNRAmount.label.toolTip = ttDeepSNRAmount;
               dlg.ncPostDeepSNRAmount.slider.toolTip = ttDeepSNRAmount;
            }
         } catch (e) {}

         dlg.postDeepSNRGroup.sizer.add(dlg.ncPostDeepSNRAmount);
         body.sizer.add(dlg.postDeepSNRGroup);
         // DEEPSNR-INTEGRATION-END

         dlg.chkPostNRUseMask = new CheckBox(body); dlg.chkPostNRUseMask.text = "Use active mask"; optApplyCheckBoxTooltip(dlg.chkPostNRUseMask); body.sizer.add(dlg.chkPostNRUseMask);
         // DEEPSNR-INTEGRATION-BEGIN
         dlg.syncPostNRPanels = function(idx) {
            dlg.postNXTGroup.visible = idx === 0;
            dlg.postTGVGroup.visible = idx === 1;
            dlg.postCCNRGroup.visible = idx === 2;
            dlg.postGraXpertNRGroup.visible = idx === 3;
            dlg.postPrismGroup.visible = idx === 4;
            dlg.postDeepSNRGroup.visible = idx === 5;
         };
         // DEEPSNR-INTEGRATION-END
         dlg.comboPostNR.onItemSelected = function(idx) { dlg.syncPostNRPanels(idx); };
         dlg.syncPostNRPanels(0);
      }
   });

}

function optBuildPostSharpeningSection(dlg) {
   dlg.postTab.addProcessSection("Sharpening", [{
      text: "Apply Sharpening",
      stage: "Sharpening",
      actionKey: "post_sharp",
      name: "btnPostSharp",
      width: 160,
      transform: function(candidate, dialog) { return optApplyPostCandidate(candidate, "post_sharp", dialog); }
   }, {
      text: "Compare",
      stage: "Compare Sharpening",
      name: "btnPostSharpCompare",
      width: 90,
      primary: false,
      action: function(tab, pane, btn) { optComparePostSharpening(tab.dialog); }
   }], {
      build: function(body) {
         // PARALLAX-INTEGRATION-BEGIN (post sharpen combo item — index 1, after BXT)
         var postSharpItems = ["BlurXTerminator"];
         if (OPT_PRE_PARALLAX_ENABLED) postSharpItems.push("Parallax (SyQon)");
         postSharpItems = postSharpItems.concat(["Unsharp Mask", "HDR Multiscale Transform", "Local Histogram Equalization", "Dark Structure Enhance", "Cosmic Clarity"]);
         var row = optComboRow(body, "Algorithm:", postSharpItems, 80);
         // PARALLAX-INTEGRATION-END (post sharpen combo item)
         dlg.comboPostSharp = row.combo;
         body.sizer.add(row.row);
         // BXT Post Sharpening uses the same 3-subcard layout (Stars,
         // Nonstellar, Output) as Pre Deconvolution BXT — identical
         // labels, widths and defaults — so users see the same control
         // surface in both BXT entry points and muscle memory carries
         // across tabs.
         dlg.postBXTGroup = new Control(body);
         dlg.postBXTGroup.sizer = new VerticalSizer();
         dlg.postBXTGroup.sizer.margin = 0;
         dlg.postBXTGroup.sizer.spacing = Theme.s2;

         // --- Subcard: STARS -----------------------------------------------
         var postBxtStars = optThemeBuildSubcard(dlg.postBXTGroup, "Stars");
         dlg.ncPostBxtStars            = optNumeric(postBxtStars, "Sharpen",     0.0, 1.0, 0.27, 2, 60);
         dlg.ncPostBxtAdjustStarHalos  = optNumeric(postBxtStars, "Halos",      -1.0, 1.0, 0.00, 2, 60);
         optThemeApplyNumericControl(dlg.ncPostBxtStars);
         optThemeApplyNumericControl(dlg.ncPostBxtAdjustStarHalos);
         postBxtStars.sizer.add(dlg.ncPostBxtStars);
         postBxtStars.sizer.add(dlg.ncPostBxtAdjustStarHalos);
         dlg.postBXTGroup.sizer.add(postBxtStars);

         // --- Subcard: NONSTELLAR ------------------------------------------
         var postBxtNs = optThemeBuildSubcard(dlg.postBXTGroup, "Nonstellar");
         dlg.chkPostBxtAutoPSF         = new CheckBox(postBxtNs);
         optI18nLabel(dlg.chkPostBxtAutoPSF, "Automatic PSF");
         dlg.chkPostBxtAutoPSF.checked = true;
         optApplyCheckBoxTooltip(dlg.chkPostBxtAutoPSF);
         optThemeApplyCheckBox(dlg.chkPostBxtAutoPSF);
         dlg.ncPostBxtPSFDiameter      = optNumeric(postBxtNs, "PSF Ø",     0.0, 12.0, 4.0, 2, 60);
         dlg.ncPostBxtSharpenNonstellar = optNumeric(postBxtNs, "Sharpen",      0.0,  1.0, 0.35, 2, 60);
         optThemeApplyNumericControl(dlg.ncPostBxtPSFDiameter);
         optThemeApplyNumericControl(dlg.ncPostBxtSharpenNonstellar);
         postBxtNs.sizer.add(dlg.chkPostBxtAutoPSF);
         postBxtNs.sizer.add(dlg.ncPostBxtPSFDiameter);
         postBxtNs.sizer.add(dlg.ncPostBxtSharpenNonstellar);
         dlg.postBXTGroup.sizer.add(postBxtNs);

         // --- Subcard: OUTPUT ---------------------------------------------
         var postBxtOut = optThemeBuildSubcard(dlg.postBXTGroup, "Output");
         dlg.chkPostBxtCorrectOnly          = new CheckBox(postBxtOut);
         optI18nLabel(dlg.chkPostBxtCorrectOnly, "Correlation Only");
         optApplyCheckBoxTooltip(dlg.chkPostBxtCorrectOnly);
         optThemeApplyCheckBox(dlg.chkPostBxtCorrectOnly);
         dlg.chkPostBxtLuminanceOnly        = new CheckBox(postBxtOut);
         optI18nLabel(dlg.chkPostBxtLuminanceOnly, "Luminance Only");
         dlg.chkPostBxtLuminanceOnly.checked = true;
         optApplyCheckBoxTooltip(dlg.chkPostBxtLuminanceOnly);
         optThemeApplyCheckBox(dlg.chkPostBxtLuminanceOnly);
         postBxtOut.sizer.add(dlg.chkPostBxtCorrectOnly);
         postBxtOut.sizer.add(dlg.chkPostBxtLuminanceOnly);
         dlg.postBXTGroup.sizer.add(postBxtOut);

         body.sizer.add(dlg.postBXTGroup);

         // PARALLAX-INTEGRATION-BEGIN (Post Sharpening group)
         // SyQon Parallax in Post: same 4-subcard surface as Pre Deconvolution.
         // Variable names dlg.*PostParallax* are read by
         // optBuildPostParallaxConfigFromControls. Temp stretch defaults OFF here
         // because Post data is already non-linear.
         if (OPT_PRE_PARALLAX_ENABLED) {
            dlg.postParallaxGroup = new Control(body);
            dlg.postParallaxGroup.sizer = new VerticalSizer();
            dlg.postParallaxGroup.sizer.margin = 0;
            dlg.postParallaxGroup.sizer.spacing = Theme.s2;

            // --- Subcard: PROCESSING STAGES ---------------------------------
            var pPlxStages = optThemeBuildSubcard(dlg.postParallaxGroup, "Processing Stages");
            // PARALLAX-MODE (v1.5): Natural (classic) / Defined (aesthetics).
            // Read by optBuildPostParallaxConfigFromControls -> --mode CLI flag.
            var pPlxModeRow = optComboRow(pPlxStages, "Model Style:", ["Natural", "Defined"], 60);
            dlg.comboPostParallaxMode = pPlxModeRow.combo;
            dlg.comboPostParallaxMode.currentItem = 0; // Natural (classic)
            optApplyExplicitTooltip(dlg.comboPostParallaxMode, "parallax.mode");
            dlg.chkPostParallaxCorrectAb = new CheckBox(pPlxStages);
            optI18nLabel(dlg.chkPostParallaxCorrectAb, "Correct Aberration");
            dlg.chkPostParallaxCorrectAb.checked = true;
            optApplyExplicitTooltip(dlg.chkPostParallaxCorrectAb, "parallax.correctAberration");
            optThemeApplyCheckBox(dlg.chkPostParallaxCorrectAb);
            dlg.ncPostParallaxStarReduction = optNumeric(pPlxStages, "Star Reduction", 0, 6, 3, 0, 60);
            dlg.ncPostParallaxSharpen       = optNumeric(pPlxStages, "Sharpen",        0.0, 1.0, 0.80, 2, 60);
            optThemeApplyNumericControl(dlg.ncPostParallaxStarReduction);
            optThemeApplyNumericControl(dlg.ncPostParallaxSharpen);
            optApplyNumericTooltipKey(dlg.ncPostParallaxStarReduction, "parallax.starReduction");
            optApplyNumericTooltipKey(dlg.ncPostParallaxSharpen, "parallax.sharpen");
            pPlxStages.sizer.add(pPlxModeRow.row);
            pPlxStages.sizer.add(dlg.chkPostParallaxCorrectAb);
            pPlxStages.sizer.add(dlg.ncPostParallaxStarReduction);
            pPlxStages.sizer.add(dlg.ncPostParallaxSharpen);
            dlg.postParallaxGroup.sizer.add(pPlxStages);

            // --- Subcard: MODEL SETTINGS ------------------------------------
            var pPlxModel = optThemeBuildSubcard(dlg.postParallaxGroup, "Model Settings");
            dlg.ncPostParallaxTileSize = optNumeric(pPlxModel, "Tile Size", 128, 2048, 512, 0, 60);
            dlg.ncPostParallaxOverlap  = optNumeric(pPlxModel, "Overlap",   8,   512,  128, 0, 60);
            dlg.ncPostParallaxPad      = optNumeric(pPlxModel, "Pad",       0,   2048, 512, 0, 60);
            optThemeApplyNumericControl(dlg.ncPostParallaxTileSize);
            optThemeApplyNumericControl(dlg.ncPostParallaxOverlap);
            optThemeApplyNumericControl(dlg.ncPostParallaxPad);
            optApplyNumericTooltipKey(dlg.ncPostParallaxTileSize, "parallax.tileSize");
            optApplyNumericTooltipKey(dlg.ncPostParallaxOverlap, "parallax.overlap");
            optApplyNumericTooltipKey(dlg.ncPostParallaxPad, "parallax.pad");
            pPlxModel.sizer.add(dlg.ncPostParallaxTileSize);
            pPlxModel.sizer.add(dlg.ncPostParallaxOverlap);
            pPlxModel.sizer.add(dlg.ncPostParallaxPad);
            dlg.postParallaxGroup.sizer.add(pPlxModel);

            // "Linear Data Stretch" and "Performance" subcards removed 2026-06-18 — managed
            // internally (Post data is already non-linear -> temp stretch off; GPU with
            // automatic CPU fallback). See optBuildPostParallaxConfigFromControls.
            body.sizer.add(dlg.postParallaxGroup);
         }
         // PARALLAX-INTEGRATION-END (Post Sharpening group)

         dlg.postUSMGroup = optInnerGroup(body, "Unsharp Mask Settings");
         dlg.ncPostUsmSigma = optNumeric(dlg.postUSMGroup, "StdDev:", 0.1, 250.0, 2.0, 2, 160);
         dlg.ncPostUsmAmount = optNumeric(dlg.postUSMGroup, "Amount:", 0.01, 1.0, 0.50, 2, 160);
         dlg.chkPostUsmDeringing = new CheckBox(dlg.postUSMGroup); optI18nLabel(dlg.chkPostUsmDeringing, "Deringing"); optApplyCheckBoxTooltip(dlg.chkPostUsmDeringing);
         dlg.ncPostUsmDeringDark = optNumeric(dlg.postUSMGroup, "Dark dering", 0.0, 1.0, 0.10, 3, 90);
         dlg.ncPostUsmDeringBright = optNumeric(dlg.postUSMGroup, "Brt dering", 0.0, 1.0, 0.00, 3, 90);
         dlg.postUSMGroup.sizer.add(dlg.ncPostUsmSigma); dlg.postUSMGroup.sizer.add(dlg.ncPostUsmAmount);
         dlg.postUSMGroup.sizer.add(dlg.chkPostUsmDeringing); dlg.postUSMGroup.sizer.add(dlg.ncPostUsmDeringDark); dlg.postUSMGroup.sizer.add(dlg.ncPostUsmDeringBright);
         body.sizer.add(dlg.postUSMGroup);
         dlg.postHDRGroup = optInnerGroup(body, "HDR Multiscale Transform");
         dlg.ncPostHdrLayers = optNumeric(dlg.postHDRGroup, "Layers:", 1, 12, 6, 0, 160);
         dlg.ncPostHdrIter = optNumeric(dlg.postHDRGroup, "Iterations:", 1, 10, 1, 0, 160);
         dlg.ncPostHdrOverdrive = optNumeric(dlg.postHDRGroup, "Overdrive:", 0.0, 1.0, 0.0, 2, 160);
         dlg.chkPostHdrMedian = new CheckBox(dlg.postHDRGroup); dlg.chkPostHdrMedian.text = "Median transform"; optApplyCheckBoxTooltip(dlg.chkPostHdrMedian);
         dlg.chkPostHdrLightProt = new CheckBox(dlg.postHDRGroup); dlg.chkPostHdrLightProt.text = "Lightness mask"; optApplyCheckBoxTooltip(dlg.chkPostHdrLightProt); dlg.chkPostHdrLightProt.checked = true;
         dlg.postHDRGroup.sizer.add(dlg.ncPostHdrLayers); dlg.postHDRGroup.sizer.add(dlg.ncPostHdrIter); dlg.postHDRGroup.sizer.add(dlg.ncPostHdrOverdrive); dlg.postHDRGroup.sizer.add(dlg.chkPostHdrMedian); dlg.postHDRGroup.sizer.add(dlg.chkPostHdrLightProt);
         body.sizer.add(dlg.postHDRGroup);
         dlg.postLHEGroup = optInnerGroup(body, "Local Histogram Equalization");
         dlg.ncPostLheRadius = optNumeric(dlg.postLHEGroup, "Kernel rad", 8, 1024, 64, 0, 80);
         dlg.ncPostLheSlope = optNumeric(dlg.postLHEGroup, "Ctr. Limit", 1.0, 100.0, 2.0, 1, 80);
         dlg.ncPostLheAmount = optNumeric(dlg.postLHEGroup, "Amount:", 0.0, 1.0, 0.70, 2, 160);
         dlg.chkPostLheCircular = new CheckBox(dlg.postLHEGroup); optI18nLabel(dlg.chkPostLheCircular, "Circular kernel"); optApplyCheckBoxTooltip(dlg.chkPostLheCircular); dlg.chkPostLheCircular.checked = true;
         dlg.postLHEGroup.sizer.add(dlg.ncPostLheRadius); dlg.postLHEGroup.sizer.add(dlg.ncPostLheSlope); dlg.postLHEGroup.sizer.add(dlg.ncPostLheAmount); dlg.postLHEGroup.sizer.add(dlg.chkPostLheCircular);
         body.sizer.add(dlg.postLHEGroup);
         dlg.postDSEGroup = optInnerGroup(body, "Dark Structure Enhance");
         dlg.ncPostDseAmount = optNumeric(dlg.postDSEGroup, "Amount:", 0.0, 1.0, 0.18, 2, 160);
         dlg.postDSEGroup.sizer.add(dlg.ncPostDseAmount);
         body.sizer.add(dlg.postDSEGroup);
         dlg.postCCSharpGroup = optInnerGroup(body, "Cosmic Clarity Settings");
         dlg.comboPostCCSharpenMode = optComboRow(dlg.postCCSharpGroup, "Targets:", ["Both", "Stellar Only", "Non-Stellar Only"], 160);
         dlg.comboPostCCSharpenModeCombo = dlg.comboPostCCSharpenMode.combo;
         dlg.ncPostCCStellarAmt = optNumeric(dlg.postCCSharpGroup, "Stellar Amt", 0.0, 1.0, 0.90, 2, 90);
         dlg.ncPostCCNSStrength = optNumeric(dlg.postCCSharpGroup, "Ns. Size", 1.0, 8.0, 3.0, 1, 80);
         dlg.ncPostCCNSAmount = optNumeric(dlg.postCCSharpGroup, "Ns. Amt", 0.0, 1.0, 0.50, 2, 80);
         dlg.chkPostCCRemoveAb = new CheckBox(dlg.postCCSharpGroup); dlg.chkPostCCRemoveAb.text = "Remove Aberration First"; optApplyCheckBoxTooltip(dlg.chkPostCCRemoveAb);
         dlg.postCCSharpGroup.sizer.add(dlg.comboPostCCSharpenMode.row); dlg.postCCSharpGroup.sizer.add(dlg.ncPostCCStellarAmt); dlg.postCCSharpGroup.sizer.add(dlg.ncPostCCNSStrength); dlg.postCCSharpGroup.sizer.add(dlg.ncPostCCNSAmount); dlg.postCCSharpGroup.sizer.add(dlg.chkPostCCRemoveAb);
         body.sizer.add(dlg.postCCSharpGroup);
         dlg.chkPostSharpUseMask = new CheckBox(body); dlg.chkPostSharpUseMask.text = "Use active mask"; optApplyCheckBoxTooltip(dlg.chkPostSharpUseMask); body.sizer.add(dlg.chkPostSharpUseMask);
         dlg.syncPostSharpPanels = function(idx) {
            // Match by item label so the panel mapping is independent of whether
            // the Parallax item is present (OPT_PRE_PARALLAX_ENABLED).
            var lbl = "";
            try { lbl = dlg.comboPostSharp.itemText(idx); } catch (eL) {}
            var isParallax = /parallax/i.test(lbl);
            var isUSM = /unsharp/i.test(lbl);
            var isHDR = /hdr/i.test(lbl);
            var isLHE = /local histogram/i.test(lbl);
            var isDSE = /dark structure/i.test(lbl);
            var isCC = /cosmic/i.test(lbl);
            var isBXT = !isParallax && !isUSM && !isHDR && !isLHE && !isDSE && !isCC;
            dlg.postBXTGroup.visible = isBXT;
            if (dlg.postParallaxGroup) dlg.postParallaxGroup.visible = isParallax;
            dlg.postUSMGroup.visible = isUSM; dlg.postHDRGroup.visible = isHDR;
            dlg.postLHEGroup.visible = isLHE; dlg.postDSEGroup.visible = isDSE; dlg.postCCSharpGroup.visible = isCC;
         };
         dlg.comboPostSharp.onItemSelected = function(idx) { dlg.syncPostSharpPanels(idx); };
         dlg.syncPostSharpPanels(0);
      }
   });

}

function optBuildPostColorBalanceSection(dlg) {
   dlg.__sectionPostColorBalance = dlg.postTab.addProcessSection("Color Balance", [{
      text: "Apply Color Balance",
      stage: "Color Balance",
      actionKey: "post_color",
      width: 170,
      transform: function(candidate, dialog) { return optApplyPostCandidate(candidate, "post_color", dialog); }
   }], {
      build: function(body) {
         dlg.postBalanceMeanHueDeg = 0.0;
         dlg.postBalanceMeanSat = 0.0;
         dlg.postBalancePointHueDeg = 0.0;
         dlg.postBalancePointIntensity = 0.0;
         dlg.postBalanceWheelDragging = false;
         dlg.updatePostColorBalanceStats = function(force) {
            var view = dlg.postTab.preview.candidateView || dlg.postTab.preview.currentView;
            if (!optSafeView(view) || view.image.numberOfChannels < 3)
               return;
            if (force === true || !dlg.__postBalanceStatsReady) {
               var stats = optComputeViewMeanHueSat(view, 4096);
               dlg.postBalanceMeanHueDeg = stats.hueDeg;
               dlg.postBalanceMeanSat = stats.sat;
               dlg.postBalancePointHueDeg = stats.hueDeg;
               dlg.postBalancePointIntensity = Math.max(0.65, stats.sat);
               dlg.__postBalanceStatsReady = true;
            }
         };
         dlg.updatePostColorBalanceReadout = function() {
            if (!dlg.lblPostColorBalanceReadout)
               return;
            var delta = optShortestHueDeltaDegrees(dlg.postBalanceMeanHueDeg, dlg.postBalancePointHueDeg);
            dlg.lblPostColorBalanceReadout.text =
               "<b>Mean:</b> " + dlg.postBalanceMeanHueDeg.toFixed(1) + " deg / " + dlg.postBalanceMeanSat.toFixed(2) +
               " | <b>Target:</b> " + dlg.postBalancePointHueDeg.toFixed(1) + " deg / " + dlg.postBalancePointIntensity.toFixed(2) +
               " | <b>Shift:</b> " + (delta * dlg.postBalancePointIntensity).toFixed(1) + " deg";
         };
         dlg.pickPostColorBalanceWheel = function(x, y) {
            var ctrl = dlg.postColorBalanceWheel;
            var ratio = ctrl.logicalPixelsToPhysical(1.0);
            var w = ctrl.width / ratio;
            var h = ctrl.height / ratio;
            var sz = Math.min(w, h);
            var cx = w * 0.5;
            var cy = h * 0.5;
            var outer = sz * 0.5 - 2.0;
            var dx = x - cx;
            var dy = y - cy;
            var dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > outer) {
               var k = outer / Math.max(1.0e-6, dist);
               dx *= k; dy *= k; dist = outer;
            }
            dlg.postBalancePointIntensity = optClamp01(dist / Math.max(1.0e-6, outer));
            var a = Math.atan2(dy, dx) * 180.0 / Math.PI;
            dlg.postBalancePointHueDeg = ((a % 360.0) + 360.0) % 360.0;
            dlg.updatePostColorBalanceReadout();
            ctrl.repaint();
         };
         dlg.schedulePostColorBalanceLive = function(delayMs) {
            if (!(dlg.chkPostColorBalanceLive && dlg.chkPostColorBalanceLive.checked))
               return;
            optSchedulePostLiveCandidate(dlg, "post.colorBalance", "Color Balance", "post_color", delayMs || 160);
         };
         dlg.lblPostColorBalanceReadout = optInfoLabel(body, "<b>Mean:</b> --");
         body.sizer.add(dlg.lblPostColorBalanceReadout);
         var wheelRow = new Control(body);
         wheelRow.styleSheet = "QWidget { background: transparent; border: 0px; }";
         wheelRow.sizer = new HorizontalSizer();
         dlg.postColorBalanceWheel = new Control(wheelRow);
         dlg.postColorBalanceWheel.setScaledFixedSize(240, 240);
         dlg.postColorBalanceWheel.cursor = new Cursor(StdCursor_Cross);
         dlg.postColorBalanceWheel.onPaint = function() {
            var g = new Graphics(this);
            try {
               var ratio = this.logicalPixelsToPhysical(1.0);
               var w = this.width / ratio;
               var h = this.height / ratio;
               var sz = Math.min(w, h);
               var cx = w * 0.5;
               var cy = h * 0.5;
               var sz_phys = sz * ratio;
               if (!dlg.postBalanceWheelBmp || dlg.postBalanceWheelBmp.width !== sz_phys)
                  dlg.postBalanceWheelBmp = optGenerateHueWheelBitmap(sz_phys, 0.0);
               var x0 = cx - sz * 0.5;
               var y0 = cy - sz * 0.5;
               g.drawScaledBitmap(new Rect(x0, y0, x0 + sz, y0 + sz), dlg.postBalanceWheelBmp);
               // Phase 6 theme: amber mean indicator + amber drag anchor.
               var outer = sz * 0.5 - 2.0;
               var meanRad = dlg.postBalanceMeanHueDeg * Math.PI / 180.0;
               g.pen = new Pen(optThemeColorInt("amber"), 2);
               g.drawLine(cx, cy, cx + Math.cos(meanRad) * outer * 0.65, cy + Math.sin(meanRad) * outer * 0.65);
               var ptRad = dlg.postBalancePointHueDeg * Math.PI / 180.0;
               var pr = outer * optClamp01(dlg.postBalancePointIntensity);
               var px = cx + Math.cos(ptRad) * pr;
               var py = cy + Math.sin(ptRad) * pr;
               g.pen = new Pen(optThemeColorInt("surface"), 2);
               g.brush = new Brush(optThemeColorInt("amber"));
               g.drawEllipse(px - 6, py - 6, px + 6, py + 6);
            } finally {
               try { g.end(); } catch (e0) {}
            }
         };
         dlg.postColorBalanceWheel.onMousePress = function(x, y, button) {
            if (button !== OPT_MOUSE_LEFT) return;
            dlg.updatePostColorBalanceStats(false);
            dlg.postBalanceWheelDragging = true;
            dlg.pickPostColorBalanceWheel(x, y);
         };
         dlg.postColorBalanceWheel.onMouseMove = function(x, y, buttons) {
            if (!dlg.postBalanceWheelDragging) return;
            dlg.pickPostColorBalanceWheel(x, y);
         };
         dlg.postColorBalanceWheel.onMouseRelease = function(x, y, button) {
            if (button !== OPT_MOUSE_LEFT) return;
            dlg.postBalanceWheelDragging = false;
            dlg.pickPostColorBalanceWheel(x, y);
            dlg.schedulePostColorBalanceLive(160);
         };
         wheelRow.sizer.addStretch();
         wheelRow.sizer.add(dlg.postColorBalanceWheel);
         wheelRow.sizer.addStretch();
         body.sizer.add(wheelRow);
         dlg.ncPostColorBalanceSaturation = optNumeric(body, "Hue sat", 0.0, 4.0, 1.00, 2, 150);
         dlg.chkPostColorBalanceLive = new CheckBox(body); optI18nLabel(dlg.chkPostColorBalanceLive, "Live"); optApplyCheckBoxTooltip(dlg.chkPostColorBalanceLive);
         dlg.chkPostColorBalanceLive.onCheck = function(checked) { if (checked) dlg.schedulePostColorBalanceLive(160); };
         dlg.ncPostColorBalanceSaturation.onValueUpdated = function() { dlg.schedulePostColorBalanceLive(180); };
         body.sizer.add(dlg.ncPostColorBalanceSaturation);
         body.sizer.add(dlg.chkPostColorBalanceLive);
         var btnReset = optButton(body, "Reset Hue Anchor", 140);
         btnReset.onClick = function() {
            dlg.__postBalanceStatsReady = false;
            dlg.updatePostColorBalanceStats(true);
            dlg.updatePostColorBalanceReadout();
            dlg.postColorBalanceWheel.repaint();
            dlg.schedulePostColorBalanceLive(160);
         };
         body.sizer.add(btnReset);
         dlg.ncPostBalanceR = optNumeric(body, "R mult", 0.0, 2.0, 1.00, 3, 150);
         dlg.ncPostBalanceG = optNumeric(body, "G mult", 0.0, 2.0, 1.00, 3, 150);
         dlg.ncPostBalanceB = optNumeric(body, "B mult", 0.0, 2.0, 1.00, 3, 150);
         dlg.ncPostBalanceSat = optNumeric(body, "Saturation:", 0.0, 2.0, 1.00, 2, 150);
         dlg.chkPostBalanceSCNR = new CheckBox(body); dlg.chkPostBalanceSCNR.text = "SCNR green"; optApplyCheckBoxTooltip(dlg.chkPostBalanceSCNR);
         dlg.ncPostBalanceSCNR = optNumeric(body, "SCNR amt", 0.0, 1.0, 0.60, 2, 150);
         dlg.chkPostColorUseMask = new CheckBox(body); dlg.chkPostColorUseMask.text = "Use active mask"; optApplyCheckBoxTooltip(dlg.chkPostColorUseMask);
         body.sizer.add(dlg.ncPostBalanceR); body.sizer.add(dlg.ncPostBalanceG); body.sizer.add(dlg.ncPostBalanceB);
         body.sizer.add(dlg.ncPostBalanceSat); body.sizer.add(dlg.chkPostBalanceSCNR); body.sizer.add(dlg.ncPostBalanceSCNR);
         body.sizer.add(dlg.chkPostColorUseMask);
      }
   });

}

function optBuildPostCurvesSection(dlg) {
   dlg.postTab.addProcessSection("Curves", [{
      text: "Apply Curves",
      stage: "Curves",
      actionKey: "post_curves",
      width: 130,
      transform: function(candidate, dialog) { return optApplyPostCandidate(candidate, "post_curves", dialog); }
   }], {
      build: function(body) {
         dlg.postCurvesPoints = { K: [[0,0],[1,1]], R: [[0,0],[1,1]], G: [[0,0],[1,1]], B: [[0,0],[1,1]], S: [[0,0],[1,1]] };
         dlg.postCurvesHistogram = null;
         dlg.computePostHistogram = function() {
            var view = dlg.postTab.preview.candidateView || dlg.postTab.preview.currentView;
            dlg.postCurvesHistogram = optSafeView(view) ? optGetCachedHistogram(view) : null;
         };
         dlg.syncPostParametricCurve = function(force) {
            var key = optPostCurvesChannelKey(dlg);
            if (force === true || !dlg.postCurvesManual)
               dlg.postCurvesPoints[key] = optPostCurvePoints(dlg);
            if (dlg.postCurvesWidget)
               dlg.postCurvesWidget.repaint();
         };
         dlg.schedulePostCurvesLive = function(delayMs) {
            if (!(dlg.chkPostCurvesLive && dlg.chkPostCurvesLive.checked))
               return;
            optSchedulePostLiveCandidate(dlg, "post.curves", "Curves", "post_curves", delayMs || 120);
         };
         dlg.updatePostCurvesWidgetVisibility = function() {
            var visible = !!(dlg.chkPostCurvesLive && dlg.chkPostCurvesLive.checked === true);
            if (dlg.postCurvesRightLabel)
               dlg.postCurvesRightLabel.visible = visible;
            if (dlg.postCurvesWidget)
               dlg.postCurvesWidget.visible = visible;
         };
         var row = optComboRow(body, "Channel:", ["RGB/K", "Red", "Green", "Blue", "Saturation"], 118);
         dlg.comboPostCurvesChan = row.combo;
         dlg.__postCurvesChannelRow = row.row;   // exposed for UI gating (policy: post.curves.color)
         dlg.comboPostCurvesChan.onItemSelected = function() {
            dlg.computePostHistogram();
            dlg.syncPostParametricCurve(false);
            dlg.schedulePostCurvesLive(140);
         };
         body.sizer.add(row.row);
         dlg.ncPostCurvesContrast = optNumeric(body, "Contrast:", 0.0, 1.0, 0.0, 2, 150);
         dlg.ncPostCurvesBright = optNumeric(body, "Brightness:", -0.5, 0.5, 0.0, 3, 150);
         dlg.ncPostCurvesShadows = optNumeric(body, "Shadows", 0.0, 0.5, 0.0, 3, 150);
         dlg.ncPostCurvesHighlights = optNumeric(body, "Highlights", 0.0, 0.5, 0.0, 3, 150);
         dlg.ncPostCurvesSaturation = optNumeric(body, "Saturation:", 0.0, 2.0, 1.0, 2, 150);
         dlg.chkPostCurvesLive = new CheckBox(body); optI18nLabel(dlg.chkPostCurvesLive, "Live"); optApplyCheckBoxTooltip(dlg.chkPostCurvesLive);
         dlg.chkPostCurvesUseMask = new CheckBox(body); dlg.chkPostCurvesUseMask.text = "Use active mask"; optApplyCheckBoxTooltip(dlg.chkPostCurvesUseMask);
         var curvesChanged = function() { dlg.postCurvesManual = false; dlg.syncPostParametricCurve(true); dlg.schedulePostCurvesLive(170); };
         dlg.ncPostCurvesContrast.onValueUpdated = curvesChanged;
         dlg.ncPostCurvesBright.onValueUpdated = curvesChanged;
         dlg.ncPostCurvesShadows.onValueUpdated = curvesChanged;
         dlg.ncPostCurvesHighlights.onValueUpdated = curvesChanged;
         dlg.ncPostCurvesSaturation.onValueUpdated = curvesChanged;
         dlg.chkPostCurvesLive.onCheck = function(checked) {
            // Update visibility first and flush the UI so the checkbox tick
            // and the widget show/hide become visible immediately. Without this,
            // the synchronous histogram compute below blocks the UI thread and
            // the click feels frozen for hundreds of ms on large images.
            dlg.updatePostCurvesWidgetVisibility();
            try { optProcessEvents(); } catch (eFlush) {}
            if (!checked) {
               // Hiding: reset the curve state so the next time Live is enabled
               // the curve starts as a straight identity again. Reset all per
               // channel point sets, the numeric controls and the manual flag.
               dlg.postCurvesPoints = {
                  K: [[0, 0], [1, 1]],
                  R: [[0, 0], [1, 1]],
                  G: [[0, 0], [1, 1]],
                  B: [[0, 0], [1, 1]],
                  S: [[0, 0], [1, 1]]
               };
               dlg.postCurvesManual = false;
               try { dlg.ncPostCurvesContrast.setValue(0.0); } catch (eR0) {}
               try { dlg.ncPostCurvesBright.setValue(0.0); } catch (eR1) {}
               try { dlg.ncPostCurvesShadows.setValue(0.0); } catch (eR2) {}
               try { dlg.ncPostCurvesHighlights.setValue(0.0); } catch (eR3) {}
               try { dlg.ncPostCurvesSaturation.setValue(1.0); } catch (eR4) {}
               return;
            }
            dlg.computePostHistogram();
            if (dlg.postCurvesWidget) {
               dlg.postCurvesWidget.repaint();
               // Flush the paint event so the histogram is actually drawn now.
               // Without this, the widget's first paint (triggered by the show
               // above) can run with postCurvesHistogram still null and the
               // queued repaint never gets processed until another event (e.g.
               // dragging a curve point) arrives.
               try { optProcessEvents(); } catch (eFlush2) {}
            }
            dlg.schedulePostCurvesLive(140);
         };
         body.sizer.add(dlg.ncPostCurvesContrast); body.sizer.add(dlg.ncPostCurvesBright); body.sizer.add(dlg.ncPostCurvesShadows);
         body.sizer.add(dlg.ncPostCurvesHighlights); body.sizer.add(dlg.ncPostCurvesSaturation); body.sizer.add(dlg.chkPostCurvesLive); body.sizer.add(dlg.chkPostCurvesUseMask);
         dlg.postCurvesWidget = new Control(dlg.postTab.preview.control);
         dlg.postCurvesWidget.setFixedHeight(190);
         dlg.postCurvesWidget.cursor = new Cursor(StdCursor_Cross);
         dlg.postCurvesWidget.__dragging = -1;
         dlg.postCurvesWidget.__hoverIdx = -1;
         dlg.postCurvesWidget.__pointRadius = 5;
         dlg.postCurvesWidget.xToCanvas = function(x) { var m = 10; return m + x * (this.width - 2 * m); };
         dlg.postCurvesWidget.yToCanvas = function(y) { var m = 10; return (this.height - m) - y * (this.height - 2 * m); };
         dlg.postCurvesWidget.canvasToX = function(x) { var m = 10; return (x - m) / Math.max(1, this.width - 2 * m); };
         dlg.postCurvesWidget.canvasToY = function(y) { var m = 10; return ((this.height - m) - y) / Math.max(1, this.height - 2 * m); };
         dlg.postCurvesWidget.findNearest = function(x, y) {
            var pts = dlg.postCurvesPoints[optPostCurvesChannelKey(dlg)] || [[0,0],[1,1]];
            var best = 15 * 15, idx = -1;
            for (var i = 0; i < pts.length; ++i) {
               var px = this.xToCanvas(pts[i][0]);
               var py = this.yToCanvas(pts[i][1]);
               var d = (x - px) * (x - px) + (y - py) * (y - py);
               if (d < best) { best = d; idx = i; }
            }
            return idx;
         };
         dlg.postCurvesWidget.onPaint = function() {
            var g = new Graphics(this);
            try {
               var w = this.width, h = this.height, m = 10, cw = w - 2 * m, ch = h - 2 * m;
               // Phase 6 theme: surface bg + subtle grid + amber-friendly border.
               g.fillRect(0, 0, w, h, new Brush(optThemeColorInt("surface")));
               g.pen = new Pen(optThemeColorInt("border"), 1);
               for (var gi = 0; gi <= 4; ++gi) {
                  g.drawLine(m + gi * cw / 4, m, m + gi * cw / 4, h - m);
                  g.drawLine(m, h - m - gi * ch / 4, w - m, h - m - gi * ch / 4);
               }
               g.pen = new Pen(optThemeColorInt("borderStrong"), 1);
               g.drawRect(m, m, w - m, h - m);
               var hist = dlg.postCurvesHistogram;
               var key = optPostCurvesChannelKey(dlg);
               if (hist) {
                  // Background histogram channels:
                  //  - RGB/K and Saturation: overlap luminance (K) + R + G + B
                  //    so the user sees the full per-channel reference.
                  //  - R / G / B: only the matching channel, to keep the
                  //    reference focused while editing that channel's curve.
                  var chans = (key === "K" || key === "S") ? ["K", "R", "G", "B"] : [key];
                  var colors = { R: 0x60ff4444, G: 0x6044ff44, B: 0x604488ff, S: 0x60ffaa00, K: 0x60dddddd };
                  var maxCount = 1;
                  for (var c = 0; c < chans.length; ++c) {
                     var data = hist[chans[c]] || hist.K;
                     for (var bi = 0; bi < data.length; ++bi)
                        if (data[bi] > maxCount) maxCount = data[bi];
                  }
                  for (var c2 = 0; c2 < chans.length; ++c2) {
                     var ck = chans[c2], d = hist[ck] || hist.K;
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
               var pcDashInt = optThemeColorInt("textDim");
               try { g.pen = new Pen(pcDashInt, 1, PenStyle_Dash); } catch (eDash) { g.pen = new Pen(pcDashInt, 1); }
               g.drawLine(m, h - m, w - m, m);
               var pts = dlg.postCurvesPoints[key] || [[0,0],[1,1]];
               var lut = optAkimaInterpolate(pts, 512);
               // K and S curves use amber (the brand colour); per-channel
               // curves keep their literal RGB tint for orientation.
               var amberInt = optThemeColorInt("amber");
               var curveColors = { K: amberInt, R: 0xffff4444, G: 0xff44ff44, B: 0xff4488ff, S: amberInt };
               g.antialiasing = true;
               g.pen = new Pen(curveColors[key] || amberInt, 2);
               for (var si = 1; si < lut.length; ++si)
                  g.drawLine(m + ((si - 1) / (lut.length - 1)) * cw, h - m - lut[si - 1] * ch, m + (si / (lut.length - 1)) * cw, h - m - lut[si] * ch);
               var pcPointFill   = amberInt;
               var pcPointHover  = optThemeColorInt("amberBright");
               var pcPointBorder = optThemeColorInt("surface");
               for (var pi = 0; pi < pts.length; ++pi) {
                  var px = this.xToCanvas(pts[pi][0]), py = this.yToCanvas(pts[pi][1]), rr = this.__pointRadius;
                  g.pen = new Pen(pcPointBorder, 2);
                  g.brush = new Brush(pi === this.__hoverIdx ? pcPointHover : pcPointFill);
                  g.fillRect(px - rr, py - rr, px + rr, py + rr, g.brush);
                  g.drawRect(px - rr, py - rr, px + rr, py + rr);
               }
            } finally {
               try { g.end(); } catch (e0) {}
            }
         };
         dlg.postCurvesWidget.onMousePress = function(x, y, button) {
            var key = optPostCurvesChannelKey(dlg);
            var pts = dlg.postCurvesPoints[key] || [[0,0],[1,1]];
            if (button === OPT_MOUSE_LEFT) {
               var idx = this.findNearest(x, y);
               if (idx < 0) {
                  var nx = optClamp01(this.canvasToX(x)), ny = optClamp01(this.canvasToY(y));
                  pts.push([nx, ny]);
                  pts.sort(function(a, b) { return a[0] - b[0]; });
                  dlg.postCurvesPoints[key] = pts;
                  idx = this.findNearest(x, y);
               }
               this.__dragging = idx;
               dlg.postCurvesManual = true;
               this.repaint();
            } else if (button === OPT_MOUSE_RIGHT) {
               var ridx = this.findNearest(x, y);
               if (ridx > 0 && ridx < pts.length - 1) {
                  pts.splice(ridx, 1);
                  dlg.postCurvesManual = true;
                  this.repaint();
                  dlg.schedulePostCurvesLive(160);
               }
            }
         };
         dlg.postCurvesWidget.onMouseMove = function(x, y) {
            var key = optPostCurvesChannelKey(dlg);
            var pts = dlg.postCurvesPoints[key] || [[0,0],[1,1]];
            if (this.__dragging >= 0 && this.__dragging < pts.length) {
               var di = this.__dragging, ny = optClamp01(this.canvasToY(y));
               if (di === 0 || di === pts.length - 1)
                  pts[di][1] = ny;
               else {
                  pts[di][0] = Math.max(pts[di - 1][0] + 0.005, Math.min(pts[di + 1][0] - 0.005, optClamp01(this.canvasToX(x))));
                  pts[di][1] = ny;
               }
               this.repaint();
            } else {
               var old = this.__hoverIdx;
               this.__hoverIdx = this.findNearest(x, y);
               if (old !== this.__hoverIdx) this.repaint();
            }
         };
         dlg.postCurvesWidget.onMouseRelease = function() {
            if (this.__dragging >= 0) {
               this.__dragging = -1;
               dlg.schedulePostCurvesLive(160);
            }
         };
         var curvesLabel = optInfoLabel(dlg.postTab.preview.control, "Curves: left click adds/drags points, right click removes points.");
         dlg.postCurvesRightLabel = curvesLabel;
         dlg.postTab.preview.control.sizer.add(curvesLabel);
         dlg.postTab.preview.control.sizer.add(dlg.postCurvesWidget);
         dlg.updatePostCurvesWidgetVisibility();
      }
   });

}

// STAR-REDUCTION-POST: Star Reduction moved from Stretching to Post Processing. Includes
// the "Remove Green via SCNR" option (also moved out of Stretching). Shrinks stars in the
// active Post image (erosion gated to bright peaks; faint structure protected).
function optBuildPostStarReductionSection(dlg) {
   dlg.postTab.addProcessSection("Star Reduction", [{
      text: "Reduce Stars (Preview)",
      stage: "Star Reduction",
      name: "btnPostStarReduce",
      transform: function(candidate) {
         var strength = optNumericValue(dlg.ncPostStarRedStrength, 0.5);
         var size = Math.round(optNumericValue(dlg.ncPostStarRedSize, 2));
         optStarReduceOnView(candidate, strength, size);
         if (optChecked(dlg.chkPostStarRedSCNR, false) && candidate.image.numberOfChannels >= 3) {
            var S = new SCNR();
            try { S.amount = optNumericValue(dlg.ncPostStarRedSCNRamt, 1.0); } catch (e0) {}
            try { S.protectionMethod = SCNR.prototype.AverageNeutral; } catch (e1) {}
            try { S.colorToRemove = SCNR.prototype.Green; } catch (e2) {}
            try { S.preserveLightness = true; } catch (e3) {}
            S.executeOn(candidate);
         }
         return candidate;
      }
   }], {
      info: "<p><b>Star Reduction</b> shrinks stars in the active image (morphological erosion gated to bright compact peaks, so faint nebula/structure is protected). <b>Strength</b> 0–1, <b>Size</b> = erosion radius in px. Preview a candidate, then click <b>Use this Image</b> to commit. The optional <b>Remove Green via SCNR</b> (average-neutral) was moved here from Stretching.</p>",
      build: function(body) {
         optThemeApplyModuleBody(body);
         dlg.ncPostStarRedStrength = optNumeric(body, "Strength", 0.0, 1.0, 0.50, 2, 110);
         dlg.ncPostStarRedSize = optNumeric(body, "Size", 1, 6, 2, 0, 110);
         dlg.chkPostStarRedSCNR = new CheckBox(body);
         optI18nLabel(dlg.chkPostStarRedSCNR, "Remove Green via SCNR");
         optApplyCheckBoxTooltip(dlg.chkPostStarRedSCNR);
         dlg.ncPostStarRedSCNRamt = optNumeric(body, "SCNR amt", 0.0, 1.0, 1.00, 2, 110);
         body.sizer.add(dlg.ncPostStarRedStrength);
         body.sizer.add(dlg.ncPostStarRedSize);
         body.sizer.add(dlg.chkPostStarRedSCNR);
         body.sizer.add(dlg.ncPostStarRedSCNRamt);
      }
   });
}

function optBuildPostMaskingSection(dlg) {
   dlg.postTab.addProcessSection("Masking", [], {
      build: function(body) {

         var maskPolarityLabel = optInfoLabel(body, "The mask are the white areas.");
         body.sizer.add(maskPolarityLabel);

         // FAME state (reset when tab is configured)
         dlg.postFameState = {
            shapes: [], currentShape: null, activeShapeIndex: -1,
            shapeType: "Freehand", isDrawing: false, isMoving: false, isTransforming: false,
            startX: 0, startY: 0, originalShape: null, transformCenter: null,
            initialAngle: 0, initialDistance: 1,
            gradientA: null, gradientB: null
         };

         // ---- live preview scheduler ----------------------------------------
         // Builds a downsampled mask (no gconv smoothing) and renders it to the
         // preview WITHOUT promoting it to postActiveMask — the live mask has
         // smaller dimensions than the source image and would not match the
         // target view of any downstream Post process. The user must click
         // "Use This Mask" to produce the full-resolution mask that will
         // be applied to NR / Sharpening / Curves.
         dlg.schedulePostMaskLive = function(delayMs) {
            var idx = dlg.comboPostMask.currentItem;
            if (idx === 2) {
               // FAME: just repaint overlay shapes — no mask generation
               dlg.postTab.preview.preview.viewport.repaint();
               return;
            }
            var live = (idx === 0 && dlg.chkPostRangeLive && dlg.chkPostRangeLive.checked) ||
                       (idx === 1 && dlg.chkPostMaskLive && dlg.chkPostMaskLive.checked);
            if (!live) return;
            dlg.previewScheduler.request("post.mask", function() {
               var view = dlg.postTab.preview.candidateView || dlg.postTab.preview.currentView;
               if (!optSafeView(view)) return;
               try { if (optSafeView(dlg._postLiveMask)) optCloseView(dlg._postLiveMask); } catch (eL) {}
               dlg._postLiveMask = null;
               var maskPreviewView = (idx === 1)
                  ? optBuildPostColorMaskView(view, dlg)
                  : optBuildPostRangeMaskView(view, dlg);
               dlg._postLiveMask = maskPreviewView;
               var rendered = optRenderMaskViewPreviewBitmap(maskPreviewView, dlg, true);  // PERF-PLAN-A: full-res mask preview
               dlg._postLiveMaskBitmap = rendered ? rendered.bitmap : null;
               dlg.postActiveMaskShown = false;
               dlg.postTab.preview.renderBitmap(
                  dlg._postLiveMaskBitmap,
                  "<b>Live:</b> " + (maskPreviewView ? maskPreviewView.id : "mask preview"),
                  false,
                  rendered ? rendered.sourceWidth : view.image.width,
                  rendered ? rendered.sourceHeight : view.image.height
               );
               if (dlg.lblPostMaskStatus)
                  dlg.lblPostMaskStatus.text = "Mask (preview): " + (maskPreviewView ? maskPreviewView.id : "live") + " - click Use This Mask to commit";
            }, {
               debounceMs: delayMs || 140,
               statusLabel: dlg.postTab.preview.status,
               busyText: "<b>Live:</b> rendering mask preview...",
               doneText: "<b>Live:</b> mask preview ready.",
               errorText: "<b>Live:</b> mask preview failed.",
               busyPreviewControl: dlg.postTab.preview.preview,
               busyOverlayText: "Rendering mask",
               onError: function(k, e) {
                  console.warningln("Mask live preview: " + e.message);
                  if (e && String(e.message || "").toLowerCase().indexOf("out of memory") >= 0) {
                     try { if (dlg.postMaskLiveCache) dlg.postMaskLiveCache.release(); } catch (eC) {}
                     try {
                        if (dlg.comboPostMask.currentItem === 0 && dlg.chkPostRangeLive)
                           dlg.chkPostRangeLive.checked = false;
                        if (dlg.comboPostMask.currentItem === 1 && dlg.chkPostMaskLive)
                           dlg.chkPostMaskLive.checked = false;
                     } catch (eChk) {}
                     var src = dlg.postTab.preview.candidateView || dlg.postTab.preview.currentView;
                     if (optSafeView(src))
                        dlg.postTab.preview.render(src, false);
                     dlg.postActiveMaskShown = false;
                     if (dlg.lblPostMaskStatus)
                        dlg.lblPostMaskStatus.text = "Mask live preview disabled after out of memory. Re-enable Live to try again.";
                  }
               }
            });
         };

         // ---- FAME state label update ----------------------------------------
         dlg.updatePostFameStateLabel = function() {
            if (!dlg.lblPostFameState) return;
            var st = dlg.postFameState;
            var active = (st.activeShapeIndex >= 0 && st.activeShapeIndex < st.shapes.length)
               ? (st.activeShapeIndex + 1) + "/" + st.shapes.length : "none";
            dlg.lblPostFameState.text =
               "<b>Shapes:</b> " + (st.shapes ? st.shapes.length : 0) +
               "  <b>Active:</b> " + active +
               "  <b>Gradient A:</b> " + (st.gradientA ? "set" : "-") +
               "  <b>B:</b> " + (st.gradientB ? "set" : "-");
         };

         // ---- algorithm combo -----------------------------------------------
         var algoRow = optComboRow(body, "Algorithm:", ["Range Selection", "Color Mask", "FAME (Seti Astro)"], 80);
         dlg.comboPostMask = algoRow.combo;
         body.sizer.add(algoRow.row);

         // ---- Range Selection group -----------------------------------------
         dlg.postRangeGroup = optInnerGroup(body, "Range Selection");
         var rangeModeRow = optComboRow(dlg.postRangeGroup, "Mode:", ["Binary", "Luminance", "Brightness"], 120);
         dlg.comboPostRangeMode = rangeModeRow.combo;
         dlg.comboPostRangeMode.currentItem = 1;
         dlg.postRangeGroup.sizer.add(rangeModeRow.row);

         // Range strip (interactive gradient bar)
         dlg.postRangeStrip = new Control(dlg.postRangeGroup);
         dlg.postRangeStrip.setScaledFixedSize(220, 24);
         dlg.postRangeStrip.cursor = new Cursor(StdCursor_Cross);
         dlg.postRangeStripDragging = "";
         dlg.postRangeStrip.onPaint = function() {
            var g = new Graphics(this), w = this.width, h = this.height;
            try {
               // Black-to-white gradient strip (intensity bar).
               var bmp = new Bitmap(w, h);
               for (var x = 0; x < w; ++x) {
                  var v = Math.round(255 * x / Math.max(1, w - 1));
                  var px = 0xFF000000 | (v << 16) | (v << 8) | v;
                  for (var y = 0; y < h; ++y) bmp.setPixel(x, y, px);
               }
               g.drawBitmap(0, 0, bmp);
               var low = dlg.ncPostRangeLow.value, high = dlg.ncPostRangeHigh.value;
               var lx = Math.round(low * (w - 1)), hx = Math.round(high * (w - 1));
               // Phase 6 theme: amber for both range markers, amberRing outline
               // for the selected band rectangle.
               g.pen = new Pen(optThemeColorInt("amberRing"), 1);
               g.drawRect(new Rect(Math.min(lx,hx), 1, Math.max(lx,hx)+1, h-1));
               g.pen = new Pen(optThemeColorInt("amber"), 2);
               g.drawLine(lx, 0, lx, h);
               g.drawLine(hx, 0, hx, h);
            } finally { g.end(); }
         };
         dlg.postRangeStrip.onMousePress = function(x, y, button) {
            if (button !== OPT_MOUSE_LEFT) return;
            var lx = Math.round(dlg.ncPostRangeLow.value * (this.width - 1));
            var hx = Math.round(dlg.ncPostRangeHigh.value * (this.width - 1));
            dlg.postRangeStripDragging = (Math.abs(x - lx) <= Math.abs(x - hx)) ? "low" : "high";
            var v = Math.max(0, Math.min(1, x / Math.max(1, this.width - 1)));
            if (dlg.postRangeStripDragging === "low") dlg.ncPostRangeLow.setValue(Math.min(v, dlg.ncPostRangeHigh.value));
            else dlg.ncPostRangeHigh.setValue(Math.max(v, dlg.ncPostRangeLow.value));
            this.repaint();
         };
         dlg.postRangeStrip.onMouseMove = function(x, y) {
            if (!dlg.postRangeStripDragging) return;
            var v = Math.max(0, Math.min(1, x / Math.max(1, this.width - 1)));
            if (dlg.postRangeStripDragging === "low") dlg.ncPostRangeLow.setValue(Math.min(v, dlg.ncPostRangeHigh.value));
            else dlg.ncPostRangeHigh.setValue(Math.max(v, dlg.ncPostRangeLow.value));
            this.repaint();
         };
         dlg.postRangeStrip.onMouseRelease = function() {
            dlg.postRangeStripDragging = "";
            dlg.schedulePostMaskLive(160);
         };
         var stripRow = new HorizontalSizer(); stripRow.addStretch(); stripRow.add(dlg.postRangeStrip); stripRow.addStretch();
         dlg.postRangeGroup.sizer.add(stripRow);

         dlg.ncPostRangeLow    = optNumeric(dlg.postRangeGroup, "Low:",    0.0, 1.0, 0.15, 3, 120);
         dlg.ncPostRangeHigh   = optNumeric(dlg.postRangeGroup, "High:",   0.0, 1.0, 0.85, 3, 120);
         dlg.ncPostRangeFuzz   = optNumeric(dlg.postRangeGroup, "Fuzz:",   0.0, 0.5, 0.05, 3, 120);
         dlg.ncPostRangeSmooth = optNumeric(dlg.postRangeGroup, "Smooth:", 0.0, 10.0, 0.0, 2, 120);
         dlg.chkPostRangeInvert = new CheckBox(dlg.postRangeGroup); optI18nLabel(dlg.chkPostRangeInvert, "Invert"); optApplyCheckBoxTooltip(dlg.chkPostRangeInvert);
         dlg.chkPostRangeLive   = new CheckBox(dlg.postRangeGroup); optI18nLabel(dlg.chkPostRangeLive, "Live");
         // Use Range-Selection-specific Live tooltip, not the Channel Combination one
         try {
            var ttRangeLive = optTooltipTextByKey("post.range.live");
            if (ttRangeLive) dlg.chkPostRangeLive.toolTip = ttRangeLive;
         } catch (eRL) {}
         dlg.postRangeGroup.sizer.add(dlg.ncPostRangeLow); dlg.postRangeGroup.sizer.add(dlg.ncPostRangeHigh);
         dlg.postRangeGroup.sizer.add(dlg.ncPostRangeFuzz); dlg.postRangeGroup.sizer.add(dlg.ncPostRangeSmooth);
         dlg.postRangeGroup.sizer.add(dlg.chkPostRangeInvert); dlg.postRangeGroup.sizer.add(dlg.chkPostRangeLive);
         body.sizer.add(dlg.postRangeGroup);

         // ---- Color Mask group ---------------------------------------------
         dlg.postColorMaskGroup = optInnerGroup(body, "Color Mask");

         // Color presets
         var presetRow = optComboRow(dlg.postColorMaskGroup, "Preset:", ["(Custom)","Red","Orange","Yellow","Green","Cyan","Blue","Magenta"], 120);
         dlg.comboPostCMPreset = presetRow.combo;
         dlg.postCMPresets = [[0,30,0.20],[0,30,0.20],[20,20,0.25],[60,25,0.20],[120,40,0.15],[180,40,0.15],[240,35,0.15],[300,30,0.20]];
         dlg.comboPostCMPreset.onItemSelected = function(idx) {
            if (idx <= 0) return;
            var p = dlg.postCMPresets[idx];
            dlg.ncPostCMHue.setValue(p[0]); dlg.ncPostCMHueRange.setValue(p[1]); dlg.ncPostCMSatLow.setValue(p[2]);
            dlg.schedulePostMaskLive(140);
         };
         dlg.postColorMaskGroup.sizer.add(presetRow.row);

         // Hue wheel
         var hueWheelSz = 160;
         dlg.postHueWheel = new Control(dlg.postColorMaskGroup);
         dlg.postHueWheel.setScaledFixedSize(hueWheelSz, hueWheelSz);
         dlg.postHueWheel.cursor = new Cursor(StdCursor_Cross);
         dlg.postHueWheelDragging = false;
         dlg.postHueWheelDragMode = "";
         dlg._postHueWheelBmp = null;
         dlg.postHueWheel.onPaint = function() {
            var g = new Graphics(this);
            try {
               var ratio = this.logicalPixelsToPhysical(1.0);
               var sz = hueWheelSz;
               var sz_phys = sz * ratio;
               if (!dlg._postHueWheelBmp || dlg._postHueWheelBmp.width !== sz_phys)
                  dlg._postHueWheelBmp = optBuildHueWheelBitmap(sz_phys);
               g.drawScaledBitmap(new Rect(0, 0, sz, sz), dlg._postHueWheelBmp);
               // Phase 6 theme: amber centre line + amberRing range arms.
               var cx = sz / 2, cy = sz / 2, outerR = sz / 2 - 2;
               var hueRad = dlg.ncPostCMHue.value / 360.0 * 2 * Math.PI - Math.PI / 2;
               var hueRange = dlg.ncPostCMHueRange.value / 360.0 * 2 * Math.PI;
               g.pen = new Pen(optThemeColorInt("amber"), 2);
               g.drawLine(cx, cy, Math.round(cx + outerR * Math.cos(hueRad)), Math.round(cy + outerR * Math.sin(hueRad)));
               g.pen = new Pen(optThemeColorInt("amberRing"), 1);
               var r1 = hueRad - hueRange / 2, r2 = hueRad + hueRange / 2;
               g.drawLine(cx, cy, Math.round(cx + outerR * Math.cos(r1)), Math.round(cy + outerR * Math.sin(r1)));
               g.drawLine(cx, cy, Math.round(cx + outerR * Math.cos(r2)), Math.round(cy + outerR * Math.sin(r2)));
            } finally { g.end(); }
         };
         dlg.postHueWheel.onMousePress = function(x, y, button) {
            if (button !== OPT_MOUSE_LEFT) return;
            var cx = hueWheelSz / 2, cy = hueWheelSz / 2;
            var ang = Math.atan2(x - cx, -(y - cy));
            if (ang < 0) ang += 2 * Math.PI;
            var hueDeg = ang * 180 / Math.PI;
            dlg.postHueWheelDragMode = "center";
            dlg.ncPostCMHue.setValue(hueDeg);
            if (dlg.comboPostCMPreset) dlg.comboPostCMPreset.currentItem = 0;
            dlg.postHueWheelDragging = true;
            this.repaint();
         };
         dlg.postHueWheel.onMouseMove = function(x, y) {
            if (!dlg.postHueWheelDragging) return;
            var cx = hueWheelSz / 2, cy = hueWheelSz / 2;
            var ang = Math.atan2(x - cx, -(y - cy));
            if (ang < 0) ang += 2 * Math.PI;
            var hueDeg = ang * 180 / Math.PI;
            if (dlg.postHueWheelDragMode === "center") {
               dlg.ncPostCMHue.setValue(hueDeg);
            } else {
               var center = dlg.ncPostCMHue.value;
               var d = Math.abs(hueDeg - center);
               if (d > 180) d = 360 - d;
               dlg.ncPostCMHueRange.setValue(Math.max(1, Math.min(180, d)));
            }
            this.repaint();
         };
         dlg.postHueWheel.onMouseRelease = function(x, y, button) {
            if (button !== OPT_MOUSE_LEFT) return;
            dlg.postHueWheelDragging = false;
            dlg.schedulePostMaskLive(160);
         };
         var wheelRow = new HorizontalSizer(); wheelRow.addStretch(); wheelRow.add(dlg.postHueWheel); wheelRow.addStretch();
         dlg.postColorMaskGroup.sizer.add(wheelRow);

         dlg.ncPostCMHue      = optNumeric(dlg.postColorMaskGroup, "Hue deg:",   0.0, 360.0, 30.0, 1, 120);
         dlg.ncPostCMHueRange = optNumeric(dlg.postColorMaskGroup, "Hue range:", 1.0, 180.0, 40.0, 1, 120);
         dlg.ncPostCMSatLow   = optNumeric(dlg.postColorMaskGroup, "Sat min:",   0.0,   1.0,  0.10, 3, 120);
         dlg.ncPostCMSmooth   = optNumeric(dlg.postColorMaskGroup, "Smooth:",    0.0,  10.0,  0.0,  2, 120);
         dlg.chkPostCMInvert  = new CheckBox(dlg.postColorMaskGroup); optI18nLabel(dlg.chkPostCMInvert, "Invert");
         dlg.chkPostMaskLive  = new CheckBox(dlg.postColorMaskGroup); optI18nLabel(dlg.chkPostMaskLive, "Live");
         // Use Color-Mask-specific Live tooltip, not the Channel Combination one
         try {
            var ttCMLive = optTooltipTextByKey("post.colormask.live");
            if (ttCMLive) dlg.chkPostMaskLive.toolTip = ttCMLive;
         } catch (eCML) {}
         dlg.postColorMaskGroup.sizer.add(dlg.ncPostCMHue); dlg.postColorMaskGroup.sizer.add(dlg.ncPostCMHueRange);
         dlg.postColorMaskGroup.sizer.add(dlg.ncPostCMSatLow); dlg.postColorMaskGroup.sizer.add(dlg.ncPostCMSmooth);
         dlg.postColorMaskGroup.sizer.add(dlg.chkPostCMInvert); dlg.postColorMaskGroup.sizer.add(dlg.chkPostMaskLive);
         body.sizer.add(dlg.postColorMaskGroup);

         // ---- FAME group ---------------------------------------------------
         dlg.postFameGroup = optInnerGroup(body, "FAME - Manual Drawing");

         var fameInfoLbl = new Label(dlg.postFameGroup);
         fameInfoLbl.text = "Shift+drag: draw  |  Ctrl+drag: move active  |  Alt+drag: rotate/scale  |  Right-click: gradient A/B";
         fameInfoLbl.wordWrapping = true; fameInfoLbl.useRichText = false;
         dlg.postFameGroup.sizer.add(fameInfoLbl);

         var shapeRow = optComboRow(dlg.postFameGroup, "Shape:", ["Freehand","Brush","Spray Can","Ellipse","Rectangle"], 120);
         dlg.comboPostFameShape = shapeRow.combo;
         dlg.postFameGroup.sizer.add(shapeRow.row);

         var fameModeRow = optComboRow(dlg.postFameGroup, "Mask type:", ["Binary","Lightness","Chrominance","Color","Gradient"], 120);
         dlg.comboPostFameMaskMode = fameModeRow.combo;
         dlg.postFameGroup.sizer.add(fameModeRow.row);

         var fameColorRow = optComboRow(dlg.postFameGroup, "Color:", ["Red","Yellow","Green","Cyan","Blue","Magenta"], 120);
         dlg.comboPostFameColor = fameColorRow.combo;
         dlg.postFameGroup.sizer.add(fameColorRow.row);

         dlg.ncPostFameBrushRadius  = optNumeric(dlg.postFameGroup, "Brush rad", 1, 200, 20, 0, 80);
         dlg.ncPostFameSprayDensity = optNumeric(dlg.postFameGroup, "Density", 0.0, 1.0, 0.40, 2, 80);
         dlg.ncPostFameBlur         = optNumeric(dlg.postFameGroup, "Blur",  0, 50, 5, 0, 80);
         dlg.postFameGroup.sizer.add(dlg.ncPostFameBrushRadius);
         dlg.postFameGroup.sizer.add(dlg.ncPostFameSprayDensity);
         dlg.postFameGroup.sizer.add(dlg.ncPostFameBlur);

         dlg.lblPostFameState = new Label(dlg.postFameGroup);
         dlg.lblPostFameState.useRichText = true;
         dlg.lblPostFameState.text = "<b>Shapes:</b> 0  <b>Active:</b> none  <b>Gradient A:</b> -  <b>B:</b> -";
         dlg.postFameGroup.sizer.add(dlg.lblPostFameState);

         var fameToolRow = new HorizontalSizer(); fameToolRow.spacing = 5;
         dlg.btnPostFameNext  = optButton(dlg.postFameGroup, "Next",  55);
         dlg.btnPostFameUndo  = optButton(dlg.postFameGroup, "Undo",  55);
         dlg.btnPostFameReset = optButton(dlg.postFameGroup, "Reset", 55);
         try {
            var ttRstFame = optTooltipTextByKey("reset.fame");
            if (ttRstFame) dlg.btnPostFameReset.toolTip = ttRstFame;
         } catch (eRstF) {}
         dlg.btnPostFameNext.onClick = function() {
            var st = dlg.postFameState;
            if (!st.shapes.length) return;
            st.activeShapeIndex = (st.activeShapeIndex + 1) % st.shapes.length;
            dlg.updatePostFameStateLabel();
            dlg.postTab.preview.preview.viewport.repaint();
         };
         dlg.btnPostFameUndo.onClick = function() {
            var st = dlg.postFameState;
            if (!st.shapes.length) return;
            var idx = st.activeShapeIndex < 0 ? st.shapes.length - 1 : st.activeShapeIndex;
            st.shapes.splice(idx, 1);
            st.activeShapeIndex = st.shapes.length ? idx % st.shapes.length : -1;
            dlg.updatePostFameStateLabel();
            dlg.postTab.preview.preview.viewport.repaint();
         };
         dlg.btnPostFameReset.onClick = function() {
            var st = dlg.postFameState;
            st.shapes = []; st.currentShape = null; st.activeShapeIndex = -1;
            st.gradientA = null; st.gradientB = null;
            dlg.updatePostFameStateLabel();
            dlg.postTab.preview.preview.viewport.repaint();
         };
         fameToolRow.add(dlg.btnPostFameNext); fameToolRow.add(dlg.btnPostFameUndo); fameToolRow.add(dlg.btnPostFameReset); fameToolRow.addStretch();
         dlg.postFameGroup.sizer.add(fameToolRow);
         body.sizer.add(dlg.postFameGroup);

         // ---- wire all change events ----------------------------------------
         // Suppress mask scheduling while user is dragging the strip handles or
         // the hue wheel — those widgets call setValue() many times per second
         // and would otherwise spam the scheduler. Each widget's onMouseRelease
         // re-schedules with a small delay once dragging stops.
         var maskChanged = function() {
            if (dlg.postRangeStripDragging || dlg.postHueWheelDragging) return;
            dlg.schedulePostMaskLive(160);
         };
         dlg.ncPostRangeLow.onValueUpdated    = function() { dlg.postRangeStrip.repaint(); maskChanged(); };
         dlg.ncPostRangeHigh.onValueUpdated   = function() { dlg.postRangeStrip.repaint(); maskChanged(); };
         dlg.ncPostRangeFuzz.onValueUpdated   = maskChanged;
         dlg.ncPostRangeSmooth.onValueUpdated = maskChanged;
         dlg.comboPostRangeMode.onItemSelected = function() { maskChanged(); };
         dlg.chkPostRangeInvert.onCheck        = maskChanged;
         dlg.chkPostRangeLive.onCheck          = function(checked) { if (checked) dlg.schedulePostMaskLive(120); };
         dlg.ncPostCMHue.onValueUpdated        = function() { dlg.postHueWheel.repaint(); maskChanged(); };
         dlg.ncPostCMHueRange.onValueUpdated   = function() { dlg.postHueWheel.repaint(); maskChanged(); };
         dlg.ncPostCMSatLow.onValueUpdated     = maskChanged;
         dlg.ncPostCMSmooth.onValueUpdated     = maskChanged;
         dlg.chkPostCMInvert.onCheck           = maskChanged;
         dlg.chkPostMaskLive.onCheck           = function(checked) { if (checked) dlg.schedulePostMaskLive(120); };
         dlg.comboPostFameMaskMode.onItemSelected = function(idx) {
            dlg.postFameGroup.sizer.visible = true;
            // Show/hide Color combo only when mode is "Color"
            fameColorRow.row.visible = (idx === 3);
         };
         dlg.comboPostFameMaskMode.onItemSelected(0);

         // ---- FAME mouse hooks on preview -----------------------------------
         var previewCtrl = dlg.postTab.preview.preview;

         dlg.installPostFameHooks = function() {
            previewCtrl.onOverlayPaint = function(g, sc, sx, sy) {
               if (dlg.comboPostMask.currentItem === 2)
                  optRenderFameOverlay(g, sc, sx, sy, dlg.postFameState, previewCtrl.imageCoordScaleX, previewCtrl.imageCoordScaleY);
            };
            previewCtrl.onImageMousePress = function(imgX, imgY, button, modifiers) {
               if (dlg.comboPostMask.currentItem !== 2) return false;
               var st = dlg.postFameState;
               var SHIFT = 0x01, CTRL = 0x02, ALT = 0x04;
               if (button === OPT_MOUSE_RIGHT) { // right-click → gradient point
                  if (!st.gradientA)       st.gradientA = [imgX, imgY];
                  else if (!st.gradientB)  st.gradientB = [imgX, imgY];
                  else { st.gradientA = [imgX, imgY]; st.gradientB = null; }
                  dlg.updatePostFameStateLabel();
                  previewCtrl.viewport.repaint();
                  return true;
               }
               if (button !== OPT_MOUSE_LEFT) return false;
               // CTRL+drag → move active shape
               if ((modifiers & CTRL) && st.shapes.length > 0) {
                  if (st.activeShapeIndex < 0 || st.activeShapeIndex >= st.shapes.length)
                     st.activeShapeIndex = st.shapes.length - 1;
                  st.isMoving = true; st.startX = imgX; st.startY = imgY;
                  st.originalShape = optPostFameCloneShape(st.shapes[st.activeShapeIndex]);
                  return true;
               }
               // ALT+drag → rotate/scale active shape
               if ((modifiers & ALT) && st.shapes.length > 0) {
                  if (st.activeShapeIndex < 0 || st.activeShapeIndex >= st.shapes.length)
                     st.activeShapeIndex = st.shapes.length - 1;
                  var shapeXf = st.shapes[st.activeShapeIndex];
                  st.isTransforming = true; st.startX = imgX; st.startY = imgY;
                  st.originalShape = optPostFameCloneShape(shapeXf);
                  st.transformCenter = optPostFameTransformCenter(shapeXf);
                  st.initialAngle = optPostFameAngle(st.transformCenter[0], st.transformCenter[1], imgX, imgY);
                  st.initialDistance = Math.max(1.0e-6, optPostFameDistance(imgX, imgY, st.transformCenter[0], st.transformCenter[1]));
                  return true;
               }
               // SHIFT+drag → draw new shape
               if (modifiers & SHIFT) {
                  st.isDrawing = true; st.startX = imgX; st.startY = imgY;
                  var stype = dlg.comboPostFameShape.itemText(dlg.comboPostFameShape.currentItem);
                  st.shapeType = stype;
                  if (stype === "Freehand")   st.currentShape = { type:"Freehand", points:[[imgX,imgY]] };
                  else if (stype === "Brush") st.currentShape = { type:"Brush", centers:[[imgX,imgY]], radius:dlg.ncPostFameBrushRadius.value };
                  else if (stype === "Spray Can") { st.currentShape = { type:"SprayCan", points:[], radius:dlg.ncPostFameBrushRadius.value, density:dlg.ncPostFameSprayDensity.value }; optPostFameAppendSprayPoints(st.currentShape, imgX, imgY, st.currentShape.radius, st.currentShape.density); }
                  else if (stype === "Ellipse")   st.currentShape = { type:"Ellipse",   points:optPostFameBuildEllipsePoints(imgX,imgY,imgX,imgY) };
                  else                             st.currentShape = { type:"Rectangle", points:optPostFameBuildRectanglePoints(imgX,imgY,imgX,imgY) };
                  previewCtrl.viewport.repaint();
                  return true;
               }
               // No modifier → let pan handle it
               return false;
            };
            previewCtrl.onImageMouseMove = function(imgX, imgY, buttons, modifiers) {
               if (dlg.comboPostMask.currentItem !== 2) return;
               var st = dlg.postFameState;
               if (st.isDrawing && st.currentShape) {
                  var stype = st.shapeType;
                  if (stype === "Freehand")        st.currentShape.points.push([imgX, imgY]);
                  else if (stype === "Ellipse")    st.currentShape.points = optPostFameBuildEllipsePoints(st.startX, st.startY, imgX, imgY);
                  else if (stype === "Rectangle")  st.currentShape.points = optPostFameBuildRectanglePoints(st.startX, st.startY, imgX, imgY);
                  else if (stype === "Brush") {
                     var centers = st.currentShape.centers, last = centers[centers.length - 1];
                     if (!last || optPostFameDistance(last[0],last[1],imgX,imgY) >= Math.max(1, st.currentShape.radius * 0.35))
                        centers.push([imgX, imgY]);
                  } else if (stype === "Spray Can") {
                     optPostFameAppendSprayPoints(st.currentShape, imgX, imgY, st.currentShape.radius, st.currentShape.density);
                  }
                  previewCtrl.viewport.repaint();
               } else if (st.isMoving && st.originalShape) {
                  st.shapes[st.activeShapeIndex] = optPostFameCloneShape(st.originalShape);
                  optPostFameMoveShape(st.shapes[st.activeShapeIndex], imgX - st.startX, imgY - st.startY);
                  previewCtrl.viewport.repaint();
               } else if (st.isTransforming && st.originalShape && st.transformCenter) {
                  var curAngle = optPostFameAngle(st.transformCenter[0], st.transformCenter[1], imgX, imgY);
                  var curDist  = Math.max(1.0e-6, optPostFameDistance(imgX, imgY, st.transformCenter[0], st.transformCenter[1]));
                  st.shapes[st.activeShapeIndex] = optPostFameCloneShape(st.originalShape);
                  optPostFameTransformShape(st.shapes[st.activeShapeIndex], curAngle - st.initialAngle, curDist / st.initialDistance, st.transformCenter[0], st.transformCenter[1]);
                  previewCtrl.viewport.repaint();
               }
            };
            previewCtrl.onImageMouseRelease = function(imgX, imgY, button, modifiers) {
               if (dlg.comboPostMask.currentItem !== 2) return;
               var st = dlg.postFameState;
               if (st.isDrawing && st.currentShape) {
                  var shape = st.currentShape;
                  st.currentShape = null; st.isDrawing = false;
                  var valid = true;
                  if (shape.type === "Freehand") { if (shape.points.length < 2) valid = false; else shape.points.push([shape.points[0][0], shape.points[0][1]]); }
                  else if (shape.type === "Brush")    valid = !!(shape.centers && shape.centers.length > 0);
                  else if (shape.type === "SprayCan") valid = !!(shape.points  && shape.points.length  > 0);
                  else valid = !!(shape.points && shape.points.length > 2);
                  if (valid) { st.shapes.push(shape); st.activeShapeIndex = st.shapes.length - 1; }
                  dlg.updatePostFameStateLabel();
                  previewCtrl.viewport.repaint();
               }
               st.isMoving = false; st.isTransforming = false;
            };
         };

         dlg.removePostFameHooks = function() {
            previewCtrl.onOverlayPaint       = null;
            previewCtrl.onImageMousePress    = null;
            previewCtrl.onImageMouseMove     = null;
            previewCtrl.onImageMouseRelease  = null;
         };

         // ---- algorithm selector -------------------------------------------
         dlg.comboPostMask.onItemSelected = function(idx) {
            dlg.postRangeGroup.visible      = (idx === 0);
            dlg.postColorMaskGroup.visible  = (idx === 1);
            dlg.postFameGroup.visible       = (idx === 2);
            if (idx === 2) dlg.installPostFameHooks();
            else           dlg.removePostFameHooks();
            // Drop any stale live preview mask and restore the source image
            // in the preview pane. If Live is enabled for the new algorithm,
            // schedule a fresh preview at low debounce.
            try { if (optSafeView(dlg._postLiveMask)) optCloseView(dlg._postLiveMask); } catch (eA) {}
            dlg._postLiveMask = null;
            dlg._postLiveMaskBitmap = null;
            if (dlg.postMaskLiveCache)
               dlg.postMaskLiveCache.release();
            dlg.postActiveMaskShown = false;
            optRenderPostSourcePreview(dlg, dlg.postTab.preview, false);
            var liveOn = (idx === 0 && dlg.chkPostRangeLive && dlg.chkPostRangeLive.checked) ||
                         (idx === 1 && dlg.chkPostMaskLive && dlg.chkPostMaskLive.checked);
            if (liveOn) dlg.schedulePostMaskLive(120);
            previewCtrl.viewport.repaint();
         };
         dlg.comboPostMask.onItemSelected(0);

         // ---- Generate / Clear buttons -------------------------------------
         var rowButtons = new HorizontalSizer(); rowButtons.spacing = 5;
         // v33-opt-9m: button renamed from "Generate Active Mask" to "Use This
         // Mask". Same action (commit live params → full-res postActiveMask)
         // but the new label reads as the natural verb for committing the
         // currently-designed mask. Mirrors image-memory's "Set to Current".
         dlg.btnPostGenerateMask = optPrimaryButton(body, "Use This Mask", 180);
         dlg.btnPostClearMask    = optButton(body, "Clear Mask", 90);
         dlg.lblPostMaskStatus   = optInfoLabel(body, "Mask: none");
         dlg.btnPostGenerateMask.onClick = function() {
            optSafeUi("Use This Mask", function() {
               // Drop any low-res live preview before producing the full mask.
               try { if (optSafeView(dlg._postLiveMask)) optCloseView(dlg._postLiveMask); } catch (eG) {}
               dlg._postLiveMask = null;
               dlg._postLiveMaskBitmap = null;
               dlg.postTab.preview.preview.setBusy(true, "Generating mask");
               try {
                  var m = optGeneratePostMask(dlg);
                  dlg.lblPostMaskStatus.text = "Mask: " + m.id + " — click a memory slot to save";
               } finally {
                  dlg.postTab.preview.preview.setBusy(false);
               }
            });
         };
         dlg.btnPostClearMask.onClick = function() {
            optSafeUi("Clear Mask", function() {
               optClearPostMaskState(dlg);
            });
         };
         rowButtons.add(dlg.btnPostGenerateMask); rowButtons.add(dlg.btnPostClearMask); rowButtons.addStretch();
         body.sizer.add(rowButtons);
         body.sizer.add(dlg.lblPostMaskStatus);
      }
   });
}

PIWorkflowOptDialog.prototype.configurePostTab = function() {
   var dlg = this;
   this.postActiveMask = null;
   this.postActiveMaskShown = false;
   this._postLiveMask = null;
   this._postLiveMaskBitmap = null;
   this.postFameState = null;
   this.postMaskMemory = this.postMaskMemory || new OptMaskMemoryManager(OPT_MASK_MEMORY_SLOTS);
   this.postMaskLiveCache = this.postMaskLiveCache || new OptPostMaskLiveCache();

   optBuildPostNoiseSection(dlg);
   optBuildPostSharpeningSection(dlg);
   optBuildPostStarReductionSection(dlg);   // moved here from Stretching (incl. Remove Green via SCNR)
   optBuildPostColorBalanceSection(dlg);
   optBuildPostCurvesSection(dlg);
   optBuildPostMaskingSection(dlg);
   // IMG-ENH: send the active Post image to Image Enhancement.
   if (dlg.imgEnhTab) {
      dlg.btnPostToImageEnh = optPrimaryButton(dlg.postTab.leftContent, "To Image Enhancement", 0);
      optThemeApplyPrimaryCta(dlg.btnPostToImageEnh);
      dlg.btnPostToImageEnh.onClick = function() { optSafeUi("To Image Enhancement", function() { dlg.sendActiveToImageEnh(); }); };
      dlg.postTab.leftContent.sizer.add(dlg.btnPostToImageEnh);
   }
   this.postTab.leftContent.sizer.addStretch();
};

