// IMG-ENH-BEGIN
PIWorkflowOptDialog.prototype.configureImgEnhTab = function() {
   var dlg = this;
   optBuildImageEnhancementColorMixerSection(dlg);
   optBuildImageEnhancementDetailSection(dlg);
   this.imgEnhTab.leftContent.sizer.addStretch();
};

// COLOR-MIXER (Stage 2a): 8-band Hue/Saturation/Luminance mixer + global strength
// + protections, driven by the clean-room engine optRunColorMixerOnView. Context
// Tools (per-band hue radius/feather, band mask shaping), Range Mask UI and the
// interactive hue wheel land in Stage 2b. dlg.colorMixerState is the single source
// of truth read by optApplyImageEnhCandidate.
function optBuildImageEnhancementColorMixerSection(dlg) {
   dlg.colorMixerState = optColorMixerDefaultState();
   dlg.cmBandSliders = [];

   dlg.imgEnhTab.addProcessSection("Color Mixer", [{
      text: "Apply Color Mixer",
      stage: "Color Mixer",
      actionKey: "imgenh_colormixer",
      width: 160,
      transform: function(candidate, dialog) { if (dialog.autoColorMixerImageType) dialog.autoColorMixerImageType(); return optApplyImageEnhCandidate(candidate, "imgenh_colormixer", dialog); }
   }, {
      text: "Reset",
      stage: "Reset Color Mixer",
      width: 70,
      primary: false,
      action: function(tab, pane, btn) {
         dlg.colorMixerState = optColorMixerDefaultState();
         if (typeof dlg.reloadColorMixerBands === "function") dlg.reloadColorMixerBands();
         if (dlg.ncColorMixerStrength) try { dlg.ncColorMixerStrength.setValue(1.0); } catch (eR) {}
         if (dlg.ncColorMixerSelectivity) try { dlg.ncColorMixerSelectivity.setValue(0.5); } catch (eSel) {}
         if (dlg.applyColorMixerSelectivity) dlg.applyColorMixerSelectivity(0.5);
         if (dlg.autoColorMixerImageType) dlg.autoColorMixerImageType(true);   // re-detect + set protection internally
         if (dlg.scheduleColorMixerLive) dlg.scheduleColorMixerLive(60);
      }
   }], {
      build: function(body) {
         optThemeApplyModuleBody(body);

         // Luminance mode removed 2026-06-18; replaced by Vibrance 2026-06-23 (per-band
         // smart saturation: boosts faint colour, spares already-vivid pixels). Channel =
         // Hue / Saturation / Vibrance.
         var modeKeys = ["hue", "saturation", "vibrance"];
         var modeRanges = { hue: [-45, 45, 1], saturation: [-100, 100, 0], vibrance: [-100, 100, 0] };
         function curModeKey() {
            var i = dlg.comboColorMixerMode ? dlg.comboColorMixerMode.currentItem : 1;
            return modeKeys[i] || "saturation";
         }
         function stateKeyFor(mk) { return mk === "hue" ? "hueShift" : mk; }

         // Channel selector: which parameter the 8 band sliders edit.
         var modeRow = optComboRow(body, "Channel:", ["Hue", "Saturation", "Vibrance"], 90);
         dlg.comboColorMixerMode = modeRow.combo;
         dlg.comboColorMixerMode.currentItem = 1;   // Saturation by default.
         body.sizer.add(modeRow.row);

         // Live preview helper (gated by the Live checkbox built below).
         dlg.scheduleColorMixerLive = function(delayMs) {
            if (dlg.autoColorMixerImageType) dlg.autoColorMixerImageType();   // auto image-type guardrails
            if (dlg.chkColorMixerLive && dlg.chkColorMixerLive.checked)
               optScheduleImageEnhLive(dlg, delayMs || 100);
         };

         // 8 hue-band sliders, each prefixed by a colored swatch (band hue).
         var bandCard = optThemeBuildSubcard(body, "Bands");
         for (var i = 0; i < dlg.colorMixerState.bands.length; ++i) {
            (function(bi) {
               var band = dlg.colorMixerState.bands[bi];
               var row = new Control(bandCard);
               row.sizer = new HorizontalSizer();
               row.sizer.spacing = 6;
               var sw = new Frame(row);
               sw.setFixedSize(12, 12);
               try { sw.styleSheet = "QWidget { background-color: " + band.color + "; border: 1px solid rgba(0,0,0,0.45); border-radius: 2px; }"; } catch (eSw) {}
               row.sizer.add(sw);
               var nc = optNumeric(row, band.label, -100, 100, 0, 0, 90);
               nc.onValueUpdated = function(v) {
                  dlg.colorMixerState.bands[bi][stateKeyFor(curModeKey())] = v;
                  if (dlg.scheduleColorMixerLive) dlg.scheduleColorMixerLive(100);
               };
               row.sizer.add(nc, 100);
               bandCard.sizer.add(row);
               dlg.cmBandSliders.push(nc);
            })(i);
         }
         body.sizer.add(bandCard);

         dlg.reloadColorMixerBands = function() {
            var mk = curModeKey();
            var sk = stateKeyFor(mk);
            var rng = modeRanges[mk];
            for (var i = 0; i < dlg.cmBandSliders.length; ++i) {
               var nc = dlg.cmBandSliders[i];
               try { nc.setRange(rng[0], rng[1]); } catch (e0) {}
               try { nc.setPrecision(rng[2]); } catch (e1) {}
               try { nc.setValue(dlg.colorMixerState.bands[i][sk]); } catch (e2) {}
            }
         };
         dlg.comboColorMixerMode.onItemSelected = function() { dlg.reloadColorMixerBands(); };
         dlg.reloadColorMixerBands();

         // Global strength + protection guardrails.
         var protCard = optThemeBuildSubcard(body, "Global & Protection");
         dlg.ncColorMixerStrength = optNumeric(protCard, "Strength", 0.0, 1.0, 1.0, 2, 100);
         dlg.ncColorMixerStrength.onValueUpdated = function(v) {
            dlg.colorMixerState.globalStrength = v;
            if (dlg.scheduleColorMixerLive) dlg.scheduleColorMixerLive(100);
         };
         protCard.sizer.add(dlg.ncColorMixerStrength);
         dlg.chkColorMixerLive = new CheckBox(protCard);
         dlg.chkColorMixerLive.text = "Live preview";
         dlg.chkColorMixerLive.checked = true;
         optApplyCheckBoxTooltip(dlg.chkColorMixerLive);
         optThemeApplyCheckBox(dlg.chkColorMixerLive);
         dlg.chkColorMixerLive.onCheck = function(c) { if (c && dlg.scheduleColorMixerLive) dlg.scheduleColorMixerLive(60); };
         protCard.sizer.add(dlg.chkColorMixerLive);
         // PROTECTION-AUTO (2026-06-23): the manual "Protect stars" + "Protect background"
         // controls were removed. Protection (star/highlight guard + low-sat background guard)
         // is now managed internally by autoColorMixerImageType() from the detected image kind,
         // with gentle thresholds so faint real colour passes (no more "everything protected").
         dlg.applyColorMixerProtectionAuto = function(kind) {
            var st = dlg.colorMixerState;
            // Gentle low-sat floor: protect only true background noise (sat < ~0.015), full
            // effect by sat ~0.07 so faint nebula/galaxy colour is not blocked.
            st.satFloor = 0.015; st.satFull = 0.07;
            if (kind === "narrowband") { st.protectStars = true; st.protectLowSat = false; } // reach all faint colour
            else if (kind === "starless") { st.protectStars = false; st.protectLowSat = true; }
            else { st.protectStars = true; st.protectLowSat = true; }                         // broadband RGB
         };

         // Selectivity: one global control replacing the per-band Context Tools (hue radius /
         // feather). 0 = narrow band selection, 1 = wide. Writes the width of every band.
         dlg.applyColorMixerSelectivity = function(v) {
            var width = 18 + v * 42;   // 18 deg (narrow) .. 60 deg (wide)
            for (var i = 0; i < dlg.colorMixerState.bands.length; ++i) {
               dlg.colorMixerState.bands[i].width = width;
               dlg.colorMixerState.bands[i].feather = 0.75;
            }
         };
         dlg.ncColorMixerSelectivity = optNumeric(protCard, "Selectivity", 0.0, 1.0, 0.5, 2, 110);
         protCard.sizer.add(dlg.ncColorMixerSelectivity);
         dlg.ncColorMixerSelectivity.onValueUpdated = function(v) {
            dlg.colorMixerState.selectivity = v;
            dlg.applyColorMixerSelectivity(v);
            if (dlg.refreshColorMixerMaskIfShown) dlg.refreshColorMixerMaskIfShown();
            if (dlg.scheduleColorMixerLive) dlg.scheduleColorMixerLive(100);
         };
         dlg.applyColorMixerSelectivity(0.5);
         // IMAGE-TYPE-AUTO (2026-06-18): the manual "Image Type" combo was removed. The image
         // kind (broadband / narrowband / starless) is detected automatically from the active
         // Image Enhancement view and sets the protection guardrails internally (see
         // applyColorMixerProtectionAuto). Runs once per working image (keyed).
         dlg.colorMixerAutoTypeKey = null;
         dlg.autoColorMixerImageType = function(force) {
            var pane = (dlg.imgEnhTab && dlg.imgEnhTab.preview) ? dlg.imgEnhTab.preview : null;
            if (!pane || !optSafeView(pane.currentView)) return;
            var key = pane.currentKey || pane.currentView.id || "";
            if (!force && key === dlg.colorMixerAutoTypeKey) return;
            dlg.colorMixerAutoTypeKey = key;
            var t = "broadband";
            try {
               if (/starless/i.test(key) || /starless/i.test(pane.currentView.id)) t = "starless";
               else if (optGetNarrowbandProfileForView(pane.currentView, dlg, key)) t = "narrowband";
            } catch (eT) {}
            dlg.applyColorMixerProtectionAuto(t);
            if (dlg.refreshColorMixerMaskIfShown) dlg.refreshColorMixerMaskIfShown();
            console.noteln("=> Color Mixer: image type auto-detected = " + t + " (protection set internally).");
         };
         body.sizer.add(protCard);

         // Rebuilds + shows the union selection mask if currently shown.
         dlg.refreshColorMixerMaskIfShown = function() {
            if (dlg.imgEnhActiveMaskShown !== true) return;
            var pane = dlg.imgEnhTab.preview;
            if (!pane || !optSafeView(pane.currentView)) return;
            if (optSafeView(dlg.imgEnhActiveMask)) { try { optCloseView(dlg.imgEnhActiveMask); } catch (e0) {} }
            try {
               dlg.imgEnhActiveMask = optBuildColorMixerMaskView(pane.currentView, dlg.colorMixerState, -1);
            } catch (e1) { dlg.imgEnhActiveMask = null; dlg.imgEnhActiveMaskShown = false; }
            pane.render(pane.currentView, false);
         };

         // Show/Hide the EFFECTIVE selection mask (union of all adjusted bands × protections).
         dlg.btnColorMixerShowMask = optButton(protCard, "Show / Hide Mask", 0);
         optThemeApplyActionButton(dlg.btnColorMixerShowMask);
         optApplyExplicitTooltip(dlg.btnColorMixerShowMask, "colormixer.showMask");
         dlg.btnColorMixerShowMask.onClick = function() {
            optSafeUi("Show / Hide Mask", function() {
               var pane = dlg.imgEnhTab.preview;
               if (!pane || !optSafeView(pane.currentView))
                  throw new Error("Select an image in Image Enhancement first.");
               if (dlg.imgEnhActiveMaskShown === true) {
                  dlg.imgEnhActiveMaskShown = false;
                  if (optSafeView(dlg.imgEnhActiveMask)) { try { optCloseView(dlg.imgEnhActiveMask); } catch (e0) {} dlg.imgEnhActiveMask = null; }
               } else {
                  if (optSafeView(dlg.imgEnhActiveMask)) { try { optCloseView(dlg.imgEnhActiveMask); } catch (e1) {} }
                  dlg.imgEnhActiveMask = optBuildColorMixerMaskView(pane.currentView, dlg.colorMixerState, -1);
                  dlg.imgEnhActiveMaskShown = true;
               }
               pane.render(pane.currentView, false);
            });
         };
         protCard.sizer.add(dlg.btnColorMixerShowMask);
      }
   });
}

// Detail & Contrast section: 7 non-colour finishing enhancers in one combo, each
// with a small parameter panel, live preview and Apply. dlg.detailState is the
// single source read by optApplyImageEnhCandidate("imgenh_detail").
function optBuildImageEnhancementDetailSection(dlg) {
   dlg.detailState = optDetailDefaultState();
   dlg.detailNcs = [];
   dlg.imgEnhTab.addProcessSection("Detail & Contrast", [{
      text: "Preview", stage: "Detail & Contrast", actionKey: "imgenh_detail", width: 100,
      transform: function(candidate, dialog) { return optApplyImageEnhCandidate(candidate, "imgenh_detail", dialog); }
   }, {
      text: "Compare", stage: "Compare Detail", width: 90, primary: false,
      action: function(tab, pane, btn) { optCompareImageEnhDetail(tab.dialog); }
   }, {
      text: "Reset", stage: "Reset Detail", width: 70, primary: false,
      action: function(tab, pane, btn) {
         dlg.detailState = optDetailDefaultState();
         if (dlg.reloadDetailPanels) dlg.reloadDetailPanels();
         if (dlg.scheduleDetailLive) dlg.scheduleDetailLive(60);
      }
   }], {
      build: function(body) {
         optThemeApplyModuleBody(body);
         dlg.scheduleDetailLive = function(d) {
            if (dlg.chkDetailLive && dlg.chkDetailLive.checked)
               optScheduleImageEnhLive(dlg, "imgenh_detail", d || 100);
         };
         function num(group, label, min, max, def, prec, key) {
            var nc = optNumeric(group, label, min, max, def, prec, 100);
            group.sizer.add(nc);
            nc.onValueUpdated = function(v) { dlg.detailState[key] = v; if (dlg.scheduleDetailLive) dlg.scheduleDetailLive(100); };
            dlg.detailNcs.push({ nc: nc, key: key });
            return nc;
         }

         // Detail methods pruned (2026-06-18 A/B study): Multiscale (==HighPass), High-Pass
         // (==Texture@r1) and Dehaze (near-inert) removed as redundant. Kept the 3 distinct
         // behaviours + a new "By Object Type" preset (last) that applies the best one.
         // 2026-06-18: 3 base methods + 5 depth/contrast methods (HDRMT, DSE, CLAHE, Sigmoidal,
         // Vibrance) + "By Object Type" (last). Multiscale/HighPass/Dehaze pruned (redundant).
         var algoIds = ["localContrast", "mmtTexture", "edgeAware", "hdrmt", "dse", "clahe", "sigmoid", "vibrance", "byObjectType"];
         var objTypeIds = ["galaxy", "nebula", "globular", "planetary"];
         var row = optComboRow(body, "Algorithm:",
            ["Local Contrast (Clarity)", "Texture (fine detail)", "Edge-aware Detail (halo-free)",
             "HDR Multiscale (depth)", "Dark Structure Enhance", "CLAHE (local contrast)",
             "Sigmoidal Contrast", "Vibrance", "By Object Type (auto)"], 80);
         dlg.comboDetailAlgo = row.combo;
         body.sizer.add(row.row);

         dlg.detLcGroup = optInnerGroup(body, "Local Contrast Settings");
         num(dlg.detLcGroup, "Amount", 0.0, 1.0, 0.30, 2, "lcAmount");
         num(dlg.detLcGroup, "Radius", 10, 250, 80, 0, "lcRadius");
         body.sizer.add(dlg.detLcGroup);

         dlg.detTxGroup = optInnerGroup(body, "Texture Settings");
         num(dlg.detTxGroup, "Amount", 0.0, 1.5, 0.50, 2, "txAmount");
         body.sizer.add(dlg.detTxGroup);

         dlg.detEaGroup = optInnerGroup(body, "Edge-aware Detail Settings");
         num(dlg.detEaGroup, "Detail", 0.0, 2.0, 0.70, 2, "eaAmount");
         num(dlg.detEaGroup, "Radius", 2, 40, 8, 0, "eaRadius");
         body.sizer.add(dlg.detEaGroup);

         dlg.detHdrGroup = optInnerGroup(body, "HDR Multiscale Settings");
         optApplyExplicitTooltip(dlg.detHdrGroup, "detail.hdrmt");
         optApplyNumericTooltipKey(num(dlg.detHdrGroup, "Strength", 0.0, 1.0, 0.50, 2, "hdrAmount"), "detail.hdrmt.amount");
         optApplyNumericTooltipKey(num(dlg.detHdrGroup, "Layers", 2, 8, 5, 0, "hdrLayers"), "detail.hdrmt.layers");
         body.sizer.add(dlg.detHdrGroup);

         dlg.detDseGroup = optInnerGroup(body, "Dark Structure Settings");
         optApplyExplicitTooltip(dlg.detDseGroup, "detail.dse");
         optApplyNumericTooltipKey(num(dlg.detDseGroup, "Amount", 0.0, 1.0, 0.30, 2, "dseAmount"), "detail.dse.amount");
         optApplyNumericTooltipKey(num(dlg.detDseGroup, "Layers", 4, 12, 9, 0, "dseLayers"), "detail.dse.layers");
         body.sizer.add(dlg.detDseGroup);

         dlg.detClaGroup = optInnerGroup(body, "CLAHE Settings");
         optApplyExplicitTooltip(dlg.detClaGroup, "detail.clahe");
         optApplyNumericTooltipKey(num(dlg.detClaGroup, "Amount", 0.0, 1.0, 0.50, 2, "claAmount"), "detail.clahe.amount");
         optApplyNumericTooltipKey(num(dlg.detClaGroup, "Clip Limit", 1.0, 5.0, 2.0, 1, "claClip"), "detail.clahe.clip");
         optApplyNumericTooltipKey(num(dlg.detClaGroup, "Tiles", 2, 16, 8, 0, "claTiles"), "detail.clahe.tiles");
         body.sizer.add(dlg.detClaGroup);

         dlg.detSigGroup = optInnerGroup(body, "Sigmoidal Contrast Settings");
         optApplyExplicitTooltip(dlg.detSigGroup, "detail.sigmoid");
         optApplyNumericTooltipKey(num(dlg.detSigGroup, "Strength", 1.0, 12.0, 5.0, 1, "sigStrength"), "detail.sigmoid.strength");
         optApplyNumericTooltipKey(num(dlg.detSigGroup, "Bias", 0.1, 0.9, 0.40, 2, "sigBias"), "detail.sigmoid.bias");
         body.sizer.add(dlg.detSigGroup);

         dlg.detVibGroup = optInnerGroup(body, "Vibrance Settings");
         optApplyExplicitTooltip(dlg.detVibGroup, "detail.vibrance");
         optApplyNumericTooltipKey(num(dlg.detVibGroup, "Amount", 0.0, 1.0, 0.40, 2, "vibAmount"), "detail.vibrance.amount");
         body.sizer.add(dlg.detVibGroup);

         // By Object Type: pick object + intensity; the engine applies the best method+params.
         dlg.detObjGroup = optInnerGroup(body, "By Object Type Settings");
         optApplyExplicitTooltip(dlg.detObjGroup, "detail.byObjectType");
         var objRow = optComboRow(dlg.detObjGroup, "Object:", ["Galaxy", "Nebula", "Stars / Globular", "Planetary"], 110);
         dlg.comboDetailObjType = objRow.combo;
         optApplyExplicitTooltip(dlg.comboDetailObjType, "detail.objType");
         dlg.detObjGroup.sizer.add(objRow.row);
         dlg.comboDetailObjType.onItemSelected = function(idx) {
            dlg.detailState.objType = objTypeIds[idx] || "galaxy";
            if (dlg.scheduleDetailLive) dlg.scheduleDetailLive(100);
         };
         var intRow = optComboRow(dlg.detObjGroup, "Intensity:", ["Low", "Medium", "High"], 110);
         dlg.comboDetailObjIntensity = intRow.combo;
         optApplyExplicitTooltip(dlg.comboDetailObjIntensity, "detail.objIntensity");
         dlg.comboDetailObjIntensity.currentItem = 1;
         dlg.detObjGroup.sizer.add(intRow.row);
         dlg.comboDetailObjIntensity.onItemSelected = function(idx) {
            dlg.detailState.objIntensity = idx;
            if (dlg.scheduleDetailLive) dlg.scheduleDetailLive(100);
         };
         body.sizer.add(dlg.detObjGroup);

         dlg.syncDetailPanels = function(idx) {
            var id = algoIds[idx] || "localContrast";
            dlg.detailState.algoId = id;
            dlg.detLcGroup.visible = id === "localContrast";
            dlg.detTxGroup.visible = id === "mmtTexture";
            dlg.detEaGroup.visible = id === "edgeAware";
            dlg.detHdrGroup.visible = id === "hdrmt";
            dlg.detDseGroup.visible = id === "dse";
            dlg.detClaGroup.visible = id === "clahe";
            dlg.detSigGroup.visible = id === "sigmoid";
            dlg.detVibGroup.visible = id === "vibrance";
            dlg.detObjGroup.visible = id === "byObjectType";
         };
         dlg.reloadDetailPanels = function() {
            for (var i = 0; i < dlg.detailNcs.length; ++i) {
               try { dlg.detailNcs[i].nc.setValue(dlg.detailState[dlg.detailNcs[i].key]); } catch (e0) {}
            }
            try { var oi = objTypeIds.indexOf(dlg.detailState.objType); dlg.comboDetailObjType.currentItem = oi < 0 ? 0 : oi; } catch (eo) {}
            try { dlg.comboDetailObjIntensity.currentItem = Math.max(0, Math.min(2, dlg.detailState.objIntensity || 1)); } catch (ei) {}
            var idx = 0;
            for (var k = 0; k < algoIds.length; ++k) if (algoIds[k] === dlg.detailState.algoId) { idx = k; break; }
            try { dlg.comboDetailAlgo.currentItem = idx; } catch (e1) {}
            dlg.syncDetailPanels(idx);
         };
         dlg.comboDetailAlgo.onItemSelected = function(idx) { dlg.syncDetailPanels(idx); };

         dlg.chkDetailLive = new CheckBox(body);
         dlg.chkDetailLive.text = "Live preview";
         dlg.chkDetailLive.checked = true;
         optThemeApplyCheckBox(dlg.chkDetailLive);
         dlg.chkDetailLive.onCheck = function(c) { if (c && dlg.scheduleDetailLive) dlg.scheduleDetailLive(60); };
         body.sizer.add(dlg.chkDetailLive);

         dlg.syncDetailPanels(0);
      }
   });
}

// Compare grid for the Detail & Contrast menu (mirrors optComparePostSharpening):
// runs each visible algorithm against the active image and shows them side by side.
function optCompareImageEnhDetail(dlg) {
   if (!dlg || !dlg.imgEnhTab) throw new Error("Image Enhancement tab not available.");
   var combo = dlg.comboDetailAlgo;
   if (!combo) throw new Error("Detail & Contrast combo not available.");
   optCompareCombo({
      pane: dlg.imgEnhTab.preview,
      combo: combo,
      names: optVisibleComboNames(combo),
      available: optAllTrue(combo.numberOfItems),
      cols: 3,
      syncFn: function(idx) { if (dlg.syncDetailPanels) dlg.syncDetailPanels(idx); },
      menuCode: "DET",
      compareKind: "imgenh_detail",
      stretchMode: "",
      busyText: "Compare: running detail / contrast algorithms...",
      runOne: function(sourceView, idx) {
         var candidate = optCloneView(sourceView, "Opt_Compare_DET_" + idx + "_" + sourceView.id, false);
         try {
            return optApplyImageEnhCandidate(candidate, "imgenh_detail", dlg);
         } catch (eR) {
            try { optCloseView(candidate); } catch (eC) {}
            throw eR;
         }
      }
   });
}
// IMG-ENH-END

PIWorkflowOptDialog.prototype.configureCcTab = function() {
   var dlg = this;
   this.ccSlots = [];
   dlg.ccAutoPreview = function() {
      if (dlg.chkCcSeeAllBlended && dlg.chkCcSeeAllBlended.checked)
         return true;
      for (var j = 0; j < dlg.ccSlots.length; ++j)
         if (dlg.ccSlots[j].chkLive && dlg.ccSlots[j].chkLive.checked)
            return true;
      return false;
   };
   dlg.ccHighestActiveKey = function() {
      for (var i = dlg.ccSlots.length - 1; i >= 0; --i) {
         var slot = dlg.ccSlots[i];
         if (slot.chkActive && slot.chkActive.checked !== true)
            continue;
         var key = optCcSlotSourceKey(slot);
         if (key && dlg.store.isAvailable(key, OPT_TAB_CC))
            return key;
      }
      return "";
   };
   dlg.ccLiveSlot = function() {
      for (var i = 0; i < dlg.ccSlots.length; ++i)
         if (dlg.ccSlots[i].chkLive && dlg.ccSlots[i].chkLive.checked)
            return dlg.ccSlots[i];
      return null;
   };
   dlg.scheduleCcSlotsPreview = function(delayMs) {
      dlg.previewScheduler.request("cc.slots", function() {
         optRefreshCcSlotCombos(dlg);
         if (dlg.chkCcSeeAllBlended && dlg.chkCcSeeAllBlended.checked) {
            var highestKey = dlg.ccHighestActiveKey();
            if (!highestKey)
               return;
            if (!dlg.ccTab.preview.activate(highestKey, false))
               return;
            if (dlg.ccTab.preview.currentKey !== highestKey && !dlg.ccTab.preview.activate(highestKey, false))
               return;
            // #4: factoryFn always returns a fresh view, so skip the
            // upfront candidate clone of currentView that beginCandidate does.
            // #3/#6d: live mode downsamples slots to the same raster size used
            // by the tab preview, then render() bypasses the second preview
            // reduction for this live candidate. This preserves zoom, pan and
            // apparent resolution instead of showing a small corner image.
            // PERF-PLAN-A-BEGIN: CC live preview at full resolution (sharp at any zoom).
            // Supersedes the former 400px "instant drag" cap (CC-LAYERS-OPTIMIZATION); the
            // render() override already bypasses the second reduction for "cc_combine".
            // Trade-off: dragging opacity/blend recomputes the full-res blend each debounce.
            // FAST-DRAG (UX): optional checkbox trades that sharpness for responsiveness on
            // big rasters — live compose at the preview-reduction size (like pre-PLAN-A but
            // using the shared reduction, not a hard 400px cap). Full resolution still
            // arrives on commit via upgradeFn, so the applied result is identical.
            var ccLiveMaxDim = (dlg.chkCcFastDrag && dlg.chkCcFastDrag.checked)
               ? optCcLivePreviewMaxDim(dlg, dlg.ccTab.preview.currentView)
               : optLiveFullResDim(dlg.ccTab.preview.currentView);
            // PERF-PLAN-A-END
            dlg.ccTab.preview.beginCandidateFromFactory("Channel Combination (live)", function() {
               return optComposeCcSlots(dlg, { live: true, liveMaxDim: ccLiveMaxDim });
            }, "cc_combine", {
               upgradeFn: function() {
                  return optComposeCcSlots(dlg, { live: false });
               }
            });
            return;
         }
         var slot = dlg.ccLiveSlot();
         if (!slot)
            return;
         var key = optCcSlotSourceKey(slot);
         if (!key || !dlg.store.isAvailable(key, OPT_TAB_CC))
            return;
         if (!dlg.ccTab.preview.activate(key, false))
            return;
         if (dlg.ccTab.preview.currentKey !== key && !dlg.ccTab.preview.activate(key, false))
            return;
         // #4: factoryFn returns its own prepared view; skip upfront clone.
         var slotLiveMaxDim = optCcLivePreviewMaxDim(dlg, dlg.ccTab.preview.currentView);
         dlg.ccTab.preview.beginCandidateFromFactory("Image" + slot.index + " (live)", function() {
            return optPrepareCcSlotView(dlg, slot, { live: true, liveMaxDim: slotLiveMaxDim });
         }, "cc_image", {
            upgradeFn: function() {
               return optPrepareCcSlotView(dlg, slot);
            }
         });
      }, {
         debounceMs: delayMs || 160,
         statusLabel: dlg.ccTab.preview.status,
         busyText: "<b>Live:</b> rendering Channel Combination...",
         doneText: "<b>Live:</b> Channel Combination preview ready.",
         errorText: "<b>Live:</b> Channel Combination failed.",
         onError: function(k, e) { console.warningln("Channel Combination live preview error: " + e.message); }
      });
   };

   function uncheckOtherLive(activeSlot) {
      for (var i = 0; i < dlg.ccSlots.length; ++i)
         if (dlg.ccSlots[i] !== activeSlot && dlg.ccSlots[i].chkLive)
            dlg.ccSlots[i].chkLive.checked = false;
   }

   function buildCcSlotSection(slotIndex) {
      // Phase 6.10: capture the section so we can refresh the Source/Mask
      // combos every time the slot is expanded. Otherwise the combos only
      // hold whatever keys were known at the last tab-change refresh —
      // images sent to CC after that read as "None" until the user clicks
      // Refresh Sources manually.
      var ccSection = dlg.ccTab.addProcessSection("Image " + slotIndex, [], {
         build: function(body) {
            var slot = {
               index: slotIndex,
               colorMeanHueDeg: 0.0,
               colorMeanSat: 0.0,
               colorPointHueDeg: 0.0,
               colorPointIntensity: 0.75,
               curvesPoints: [[0, 0], [1, 1]],
               cachedHistogramData: null,
               sourceKeys: []
            };
            var src = optComboRow(body, "Source:", ["None"], 88);
            slot.comboSource = src.combo;
            body.sizer.add(src.row);
            var maskRow = optComboRow(body, "Mask:", ["None"], 88);
            slot.comboMask = maskRow.combo;
            slot.maskMemoryIndices = [];
            body.sizer.add(maskRow.row);
            if (slotIndex < 6) {
               var mode = optComboRow(body, "Blend mode:", OPT_CC_BLEND_MODES, 88);
               slot.comboBlend = mode.combo;
               slot.comboBlend.currentItem = 7;
               body.sizer.add(mode.row);
               // CC-LAYERS-OPTIMIZATION-BEGIN
               slot.ncOpacity = optNumeric(body, "Opacity:", 0.0, 1.0, 1.0, 2, 96);
               body.sizer.add(slot.ncOpacity);
               // CC-LAYERS-OPTIMIZATION-END
            } else {
               slot.comboBlend = null;
               // CC-LAYERS-OPTIMIZATION-BEGIN
               slot.ncOpacity = null;
               // CC-LAYERS-OPTIMIZATION-END
            }
            slot.ncBrightness = optNumeric(body, "Brightness:", 0.0, 2.0, 1.0, 2, 96);
            slot.ncSaturation = optNumeric(body, "Saturation:", 0.0, 2.0, 1.0, 2, 96);
            body.sizer.add(slot.ncBrightness);
            body.sizer.add(slot.ncSaturation);
            var checkRow = new Control(body);
            checkRow.sizer = new HorizontalSizer();
            checkRow.sizer.spacing = 8;
            slot.chkActive = new CheckBox(checkRow);
            optI18nLabel(slot.chkActive, "Active");
            slot.chkActive.checked = true;
            slot.chkLive = new CheckBox(checkRow);
            optI18nLabel(slot.chkLive, "Live");
            slot.chkColour = new CheckBox(checkRow);
            optI18nLabel(slot.chkColour, "Color");
            slot.chkHistogram = new CheckBox(checkRow);
            optI18nLabel(slot.chkHistogram, "Histogram");
            optApplyCheckBoxTooltip(slot.chkActive);
            optApplyCheckBoxTooltip(slot.chkLive);
            optApplyCheckBoxTooltip(slot.chkColour);
            optApplyCheckBoxTooltip(slot.chkHistogram);
            checkRow.sizer.add(slot.chkActive);
            checkRow.sizer.add(slot.chkLive);
            checkRow.sizer.add(slot.chkColour);
            checkRow.sizer.add(slot.chkHistogram);
            checkRow.sizer.addStretch();
            body.sizer.add(checkRow);
            slot.colorGroup = optInnerGroup(body, "Color Correction");
            slot.lblColorReadout = optInfoLabel(slot.colorGroup, "<b>Mean:</b> --");
            slot.colorGroup.sizer.add(slot.lblColorReadout);
            var colorWheelRow = new Control(slot.colorGroup);
            colorWheelRow.styleSheet = "QWidget { background: transparent; border: 0px; }";
            colorWheelRow.sizer = new HorizontalSizer();
            slot.colourWheel = new Control(colorWheelRow);
            slot.colourWheel.setScaledFixedSize(200, 200);
            slot.colourWheel.cursor = new Cursor(StdCursor_Cross);
            slot.colourWheel.__slot = slot;
            slot.colourWheel.onPaint = function() {
               var s = this.__slot;
               var g = new Graphics(this);
               try {
                  g.antialiasing = true;
                  var ratio = this.logicalPixelsToPhysical(1.0);
                  var w = this.width / ratio;
                  var h = this.height / ratio;
                  var sz = Math.min(w, h);
                  var cx = w * 0.5;
                  var cy = h * 0.5;
                  var outerR = sz * 0.5 - 2.0;
                  var sz_phys = sz * ratio;
                  var x0 = cx - sz * 0.5;
                  var y0 = cy - sz * 0.5;
                  g.drawScaledBitmap(new Rect(x0, y0, x0 + sz, y0 + sz), optGenerateHueWheelBitmap(sz_phys, 0.0));
                  // Phase 6 theme: amber mean indicator + amber drag anchor.
                  var meanRad = (s.colorMeanHueDeg || 0.0) * Math.PI / 180.0;
                  g.pen = new Pen(optThemeColorInt("amber"), 2);
                  g.drawLine(cx, cy, cx + Math.cos(meanRad) * outerR * 0.65, cy + Math.sin(meanRad) * outerR * 0.65);
                  var pointRad = (s.colorPointHueDeg || 0.0) * Math.PI / 180.0;
                  var pointR = outerR * optClamp01(s.colorPointIntensity || 0.0);
                  var px = cx + pointR * Math.cos(pointRad);
                  var py = cy + pointR * Math.sin(pointRad);
                  g.pen = new Pen(optThemeColorInt("surface"), 2);
                  g.brush = new Brush(optThemeColorInt("amber"));
                  g.drawEllipse(new Rect(px - 5, py - 5, px + 5, py + 5));
               } finally {
                  try { g.end(); } catch (e0) {}
               }
            };
            slot.colourWheel.pick = function(x, y) {
               var s = this.__slot;
               var ratio = this.logicalPixelsToPhysical(1.0);
               var w = this.width / ratio;
               var h = this.height / ratio;
               var sz = Math.min(w, h);
               var cx = w * 0.5;
               var cy = h * 0.5;
               var outerR = sz * 0.5 - 2.0;
               var dx = x - cx, dy = y - cy;
               var dist = Math.sqrt(dx * dx + dy * dy);
               if (dist > outerR) {
                  var scale = outerR / Math.max(1.0e-6, dist);
                  dx *= scale; dy *= scale; dist = outerR;
               }
               var ang = Math.atan2(dy, dx);
               if (ang < 0.0)
                  ang += 2.0 * Math.PI;
               s.colorPointHueDeg = (ang * 180.0 / Math.PI) % 360.0;
               s.colorPointIntensity = optClamp01(dist / Math.max(1.0e-6, outerR));
               optUpdateCcSlotColorReadout(s);
               this.repaint();
            };
            slot.colourWheel.onMousePress = function(x, y, button) {
               if (button !== OPT_MOUSE_LEFT) return;
               this.__dragging = true;
               optUpdateCcSlotColorStats(dlg, this.__slot, false);
               this.pick(x, y);
            };
            slot.colourWheel.onMouseMove = function(x, y) {
               if (this.__dragging === true)
                  this.pick(x, y);
            };
            slot.colourWheel.onMouseRelease = function(x, y, button) {
               if (button !== OPT_MOUSE_LEFT) return;
               this.pick(x, y);
               this.__dragging = false;
               if (this.__slot.chkLive && this.__slot.chkLive.checked)
                  dlg.scheduleCcSlotsPreview(160);
            };
            colorWheelRow.sizer.addStretch();
            colorWheelRow.sizer.add(slot.colourWheel);
            colorWheelRow.sizer.addStretch();
            slot.colorGroup.sizer.add(colorWheelRow);
            slot.ncColorHueSaturation = optNumeric(slot.colorGroup, "Hue sat", 0.0, 4.0, 1.0, 2, 150);
            slot.ncColorR = optNumeric(slot.colorGroup, "R mult", 0.0, 2.0, 1.0, 3, 150);
            slot.ncColorG = optNumeric(slot.colorGroup, "G mult", 0.0, 2.0, 1.0, 3, 150);
            slot.ncColorB = optNumeric(slot.colorGroup, "B mult", 0.0, 2.0, 1.0, 3, 150);
            slot.ncColorSaturation = optNumeric(slot.colorGroup, "Saturation:", 0.0, 2.0, 1.0, 2, 150);
            slot.chkColorSCNR = new CheckBox(slot.colorGroup); slot.chkColorSCNR.text = "SCNR green"; optApplyCheckBoxTooltip(slot.chkColorSCNR);
            slot.ncColorSCNR = optNumeric(slot.colorGroup, "SCNR amt", 0.0, 1.0, 0.60, 2, 150);
            slot.btnColorReset = optButton(slot.colorGroup, "Reset Hue Anchor", 140);
            slot.colorGroup.sizer.add(slot.ncColorHueSaturation);
            slot.colorGroup.sizer.add(slot.ncColorR);
            slot.colorGroup.sizer.add(slot.ncColorG);
            slot.colorGroup.sizer.add(slot.ncColorB);
            slot.colorGroup.sizer.add(slot.ncColorSaturation);
            slot.colorGroup.sizer.add(slot.chkColorSCNR);
            slot.colorGroup.sizer.add(slot.ncColorSCNR);
            slot.colorGroup.sizer.add(slot.btnColorReset);
            body.sizer.add(slot.colorGroup);
            slot.histogramGroup = optInnerGroup(body, "Curves");
            slot.comboCurvesChan = optComboRow(slot.histogramGroup, "Channel:", ["RGB/K", "Red", "Green", "Blue", "Saturation"], 118);
            slot.ncCurvesContrast = optNumeric(slot.histogramGroup, "Contrast:", 0.0, 1.0, 0.0, 2, 150);
            slot.ncCurvesBright = optNumeric(slot.histogramGroup, "Brightness:", -0.5, 0.5, 0.0, 3, 150);
            slot.ncCurvesShadows = optNumeric(slot.histogramGroup, "Shadows", 0.0, 0.5, 0.0, 3, 150);
            slot.ncCurvesHighlights = optNumeric(slot.histogramGroup, "Highlights", 0.0, 0.5, 0.0, 3, 150);
            slot.ncCurvesSaturation = optNumeric(slot.histogramGroup, "Saturation:", 0.0, 2.0, 1.0, 2, 150);
            slot.histogramGroup.sizer.add(slot.comboCurvesChan.row);
            slot.histogramGroup.sizer.add(slot.ncCurvesContrast);
            slot.histogramGroup.sizer.add(slot.ncCurvesBright);
            slot.histogramGroup.sizer.add(slot.ncCurvesShadows);
            slot.histogramGroup.sizer.add(slot.ncCurvesHighlights);
            slot.histogramGroup.sizer.add(slot.ncCurvesSaturation);
            body.sizer.add(slot.histogramGroup);
            slot.syncCurvesFromControls = function(force) {
               var idx = slot.comboCurvesChan ? slot.comboCurvesChan.combo.currentItem : 0;
               var key = ["K", "R", "G", "B", "S"][idx] || "K";
               if (force === true || !slot.curvesManual)
                  slot.curvesPoints[key] = optCurvePointsFromControls({
                     contrast: slot.ncCurvesContrast,
                     brightness: slot.ncCurvesBright,
                     shadows: slot.ncCurvesShadows,
                     highlights: slot.ncCurvesHighlights,
                     saturation: slot.ncCurvesSaturation
                  });
               if (slot.chkHistogram && slot.chkHistogram.checked)
                  optUpdateCcCurvesWidget(dlg, slot);
            };
            var slotColorChanged = function() {
               optUpdateCcSlotColorReadout(slot);
               if (dlg.ccAutoPreview && dlg.ccAutoPreview())
                  dlg.scheduleCcSlotsPreview(160);
            };
            var slotCurvesChanged = function() {
               slot.curvesManual = false;
               slot.syncCurvesFromControls(true);
               if (dlg.ccAutoPreview && dlg.ccAutoPreview())
                  dlg.scheduleCcSlotsPreview(160);
            };
            slot.ncColorHueSaturation.onValueUpdated = slotColorChanged;
            slot.ncColorR.onValueUpdated = slotColorChanged;
            slot.ncColorG.onValueUpdated = slotColorChanged;
            slot.ncColorB.onValueUpdated = slotColorChanged;
            slot.ncColorSaturation.onValueUpdated = slotColorChanged;
            slot.chkColorSCNR.onCheck = slotColorChanged;
            slot.ncColorSCNR.onValueUpdated = slotColorChanged;
            slot.btnColorReset.onClick = function() {
               slot.__colorStatsReady = false;
               optUpdateCcSlotColorStats(dlg, slot, true);
               optUpdateCcSlotColorReadout(slot);
               if (slot.colourWheel)
                  slot.colourWheel.repaint();
               slotColorChanged();
            };
            slot.comboCurvesChan.combo.onItemSelected = function() {
               slot.syncCurvesFromControls(false);
               if (dlg.ccAutoPreview && dlg.ccAutoPreview())
                  dlg.scheduleCcSlotsPreview(140);
            };
            slot.ncCurvesContrast.onValueUpdated = slotCurvesChanged;
            slot.ncCurvesBright.onValueUpdated = slotCurvesChanged;
            slot.ncCurvesShadows.onValueUpdated = slotCurvesChanged;
            slot.ncCurvesHighlights.onValueUpdated = slotCurvesChanged;
            slot.ncCurvesSaturation.onValueUpdated = slotCurvesChanged;
            slot.comboSource.onItemSelected = function() {
               slot.__colorStatsReady = false;
               optUpdateCcSlotColorStats(dlg, slot, true);
               optUpdateCcSlotColorReadout(slot);
               optRefreshCcSlotControlState(dlg, slot);
               if (slot.chkHistogram && slot.chkHistogram.checked)
                  optUpdateCcCurvesWidget(dlg, slot);
               if (dlg.ccAutoPreview && dlg.ccAutoPreview())
                  dlg.scheduleCcSlotsPreview();
            };
            slot.comboMask.onItemSelected = function() {
               optInvalidateCcSlotCache(slot, "all");
               if (dlg.ccAutoPreview && dlg.ccAutoPreview())
                  dlg.scheduleCcSlotsPreview(120);
            };
            if (slot.comboBlend) {
               slot.comboBlend.onItemSelected = function() {
                  if (dlg.ccAutoPreview && dlg.ccAutoPreview())
                     dlg.scheduleCcSlotsPreview();
               };
            }
            slot.ncBrightness.onValueUpdated = function() { if (dlg.ccAutoPreview && dlg.ccAutoPreview()) dlg.scheduleCcSlotsPreview(); };
            slot.ncSaturation.onValueUpdated = function() { if (dlg.ccAutoPreview && dlg.ccAutoPreview()) dlg.scheduleCcSlotsPreview(); };
            // CC-LAYERS-OPTIMIZATION-BEGIN
            if (slot.ncOpacity)
               slot.ncOpacity.onValueUpdated = function() { if (dlg.ccAutoPreview && dlg.ccAutoPreview()) dlg.scheduleCcSlotsPreview(); };
            // CC-LAYERS-OPTIMIZATION-END
            slot.chkActive.onCheck = function() { if (dlg.chkCcSeeAllBlended && dlg.chkCcSeeAllBlended.checked) dlg.scheduleCcSlotsPreview(140); };
            slot.chkLive.onCheck = function(checked) {
               if (checked) {
                  // CC-LIVE-BLEND-COEXIST-BEGIN: do NOT turn off "See all Images
                  // Blended" anymore. The two modes can coexist: when both are on
                  // the view stays on the full blend (scheduleCcSlotsPreview gives
                  // it priority) while edits to this "live" slot are integrated
                  // into the blend in real time. Only one slot stays live at a
                  // time so toggling See-All off returns to that isolated slot.
                  // To revert: re-add `dlg.chkCcSeeAllBlended.checked = false;`.
                  uncheckOtherLive(slot);
                  dlg.ccActiveSlot = slot;
                  optUpdateCcCurvesWidget(dlg, slot);
                  dlg.scheduleCcSlotsPreview(120);
                  // CC-LIVE-BLEND-COEXIST-END
               }
            };
            slot.chkColour.onCheck = function() {
               if (slot.chkColour.checked) {
                  optUpdateCcSlotColorStats(dlg, slot, false);
                  optUpdateCcSlotColorReadout(slot);
               }
               optRefreshCcSlotControlState(dlg, slot);
               if (dlg.ccAutoPreview && dlg.ccAutoPreview())
                  dlg.scheduleCcSlotsPreview(140);
            };
            slot.chkHistogram.onCheck = function(checked) {
               optRefreshCcSlotControlState(dlg, slot);
               if (checked) {
                  slot.syncCurvesFromControls(false);
                  optUpdateCcCurvesWidget(dlg, slot);
               } else if (dlg.ccActiveSlot === slot || (dlg.ccCurvesWidget && dlg.ccCurvesWidget.__slot === slot)) {
                  optUpdateCcCurvesWidget(dlg, null);
               }
            };
            dlg.ccSlots.push(slot);
            optRefreshCcSlotMaskCombo(dlg, slot);
            optRefreshCcSlotControlState(dlg, slot);
         }
      });
      // Phase 6.10: every time this slot is expanded, re-read the latest
      // workflow keys from the store so the Source/Mask dropdowns reflect
      // whatever the user has produced since the last refresh.
      try {
         var origSetExpanded = ccSection.setExpanded;
         ccSection.setExpanded = function(expanded) {
            origSetExpanded(expanded);
            if (expanded) {
               try { optRefreshCcSlotCombos(dlg); } catch (eRf) {}
            }
         };
      } catch (eHk) {}
   }

   for (var slotIndex = 1; slotIndex <= 6; ++slotIndex)
      buildCcSlotSection(slotIndex);

   dlg.ccFooter = new Control(this.ccTab.leftContent);
   dlg.ccFooter.sizer = new VerticalSizer();
   dlg.ccFooter.sizer.spacing = 5;
   dlg.chkCcSeeAllBlended = new CheckBox(dlg.ccFooter);
   dlg.chkCcSeeAllBlended.text = "See all Images Blended";
   optApplyCheckBoxTooltip(dlg.chkCcSeeAllBlended);
   dlg.chkCcSeeAllBlended.onCheck = function(checked) {
      // CC-LIVE-BLEND-COEXIST: keep any slot's "live" selection so the user can
      // watch the blend while editing the marked channel. (Previously this called
      // uncheckOtherLive(null), forcing the two modes to be mutually exclusive.)
      // To revert: re-add `if (checked) uncheckOtherLive(null);`.
      dlg.scheduleCcSlotsPreview(120);
   };
   // FAST-DRAG (UX): live blend at reduced resolution while editing. Toggling
   // invalidates the live caches (their keys embed the live dimension, so stale
   // entries would only waste memory) and re-renders at the new size.
   dlg.chkCcFastDrag = new CheckBox(dlg.ccFooter);
   optI18nLabel(dlg.chkCcFastDrag, "Fast drag (reduced live preview)");
   optApplyExplicitTooltip(dlg.chkCcFastDrag, "cc.fastDrag");
   dlg.chkCcFastDrag.onCheck = function() {
      for (var i = 0; i < dlg.ccSlots.length; ++i)
         optInvalidateCcSlotCache(dlg.ccSlots[i], "live");
      if (dlg.ccAutoPreview && dlg.ccAutoPreview())
         dlg.scheduleCcSlotsPreview(120);
   };
   dlg.btnCcRefreshSources = optButton(dlg.ccFooter, "Refresh Sources", 130);
   dlg.btnCcRefreshSources.onClick = function() { optRefreshCcSlotCombos(dlg); };
   dlg.ccFooter.sizer.add(dlg.chkCcSeeAllBlended);
   dlg.ccFooter.sizer.add(dlg.chkCcFastDrag);
   dlg.ccFooter.sizer.add(dlg.btnCcRefreshSources);
   this.ccTab.leftContent.sizer.add(dlg.ccFooter);

   dlg.ccCurvesWidget = new Control(this.ccTab.preview.control);
         dlg.ccCurvesWidget.setFixedHeight(180);
         dlg.ccCurvesWidget.cursor = new Cursor(StdCursor_Cross);
         dlg.ccCurvesWidget.__slot = null;
         dlg.ccCurvesWidget.__hist = null;
         dlg.ccCurvesWidget.__pts = [[0, 0], [1, 1]];
         dlg.ccCurvesWidget.__dragging = -1;
         dlg.ccCurvesWidget.__hoverIdx = -1;
         dlg.ccCurvesWidget.__pointRadius = 5;
         dlg.ccCurvesWidget.xToCanvas = function(x) { var m = 8; return m + x * (this.width - 2 * m); };
         dlg.ccCurvesWidget.yToCanvas = function(y) { var m = 8; return (this.height - m) - y * (this.height - 2 * m); };
         dlg.ccCurvesWidget.canvasToX = function(x) { var m = 8; return (x - m) / Math.max(1, this.width - 2 * m); };
         dlg.ccCurvesWidget.canvasToY = function(y) { var m = 8; return ((this.height - m) - y) / Math.max(1, this.height - 2 * m); };
         dlg.ccCurvesWidget.findNearest = function(x, y) {
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
         dlg.ccCurvesWidget.onPaint = function() {
            var g = new Graphics(this);
            try {
               var w = this.width, h = this.height, m = 8, cw = w - 2 * m, ch = h - 2 * m;
               // Phase 6 theme: surface bg + subtle grid.
               g.fillRect(0, 0, w, h, new Brush(optThemeColorInt("surface")));
               g.pen = new Pen(optThemeColorInt("border"), 1);
               for (var gi = 0; gi <= 4; ++gi) {
                  g.drawLine(m + gi * cw / 4, m, m + gi * cw / 4, h - m);
                  g.drawLine(m, h - m - gi * ch / 4, w - m, h - m - gi * ch / 4);
               }
               g.pen = new Pen(optThemeColorInt("borderStrong"), 1);
               g.drawRect(m, m, w - m, h - m);
               var hist = this.__hist;
               if (hist) {
                  var chans = hist.isRGB ? ["R", "G", "B"] : ["K"];
                  var colors = { R: 0x60ff4444, G: 0x6044ff44, B: 0x604488ff, K: 0x60dddddd };
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
                  g.drawTextRect(new Rect(m, m, w - m, h - m), "Select an Image slot to see its histogram", TextAlign_Center | TextAlign_VertCenter);
               }
               var ccDashInt = optThemeColorInt("textDim");
               try { g.pen = new Pen(ccDashInt, 1, PenStyle_Dash); } catch (eDash) { g.pen = new Pen(ccDashInt, 1); }
               g.drawLine(m, h - m, w - m, m);
               var pts = this.__pts || [[0, 0], [1, 1]];
               var lut = optAkimaInterpolate(pts, 512);
               g.antialiasing = true;
               g.pen = new Pen(optThemeColorInt("amber"), 2);
               for (var si = 1; si < lut.length; ++si)
                  g.drawLine(m + ((si - 1) / (lut.length - 1)) * cw, h - m - lut[si - 1] * ch, m + (si / (lut.length - 1)) * cw, h - m - lut[si] * ch);
               var ccPointFill   = optThemeColorInt("amber");
               var ccPointHover  = optThemeColorInt("amberBright");
               var ccPointBorder = optThemeColorInt("surface");
               for (var pi = 0; pi < pts.length; ++pi) {
                  var px = this.xToCanvas(pts[pi][0]), py = this.yToCanvas(pts[pi][1]), rr = this.__pointRadius;
                  g.pen = new Pen(ccPointBorder, 2);
                  g.brush = new Brush(pi === this.__hoverIdx ? ccPointHover : ccPointFill);
                  g.fillRect(px - rr, py - rr, px + rr, py + rr, g.brush);
                  g.drawRect(px - rr, py - rr, px + rr, py + rr);
               }
            } finally {
               try { g.end(); } catch (e0) {}
            }
         };
         dlg.ccCurvesWidget.onMousePress = function(x, y, button) {
            if (!this.__slot)
               return;
            var pts = this.__pts || [[0, 0], [1, 1]];
            if (button === OPT_MOUSE_LEFT) {
               var idx = this.findNearest(x, y);
               if (idx < 0) {
                  var nx = optClamp01(this.canvasToX(x)), ny = optClamp01(this.canvasToY(y));
                  pts.push([nx, ny]);
                  pts.sort(function(a, b) { return a[0] - b[0]; });
                  idx = this.findNearest(x, y);
               }
               this.__dragging = idx;
               this.__slot.curvesPoints = pts;
               this.repaint();
            } else if (button === OPT_MOUSE_RIGHT) {
               var ridx = this.findNearest(x, y);
               if (ridx > 0 && ridx < pts.length - 1) {
                  pts.splice(ridx, 1);
                  this.__slot.curvesPoints = pts;
                  this.repaint();
                  if (this.__slot.chkLive && this.__slot.chkLive.checked)
                     dlg.scheduleCcSlotsPreview(160);
               }
            }
         };
         dlg.ccCurvesWidget.onMouseMove = function(x, y) {
            if (!this.__slot)
               return;
            var pts = this.__pts || [[0, 0], [1, 1]];
            if (this.__dragging >= 0 && this.__dragging < pts.length) {
               var di = this.__dragging, ny = optClamp01(this.canvasToY(y));
               if (di === 0 || di === pts.length - 1)
                  pts[di][1] = ny;
               else {
                  pts[di][0] = Math.max(pts[di - 1][0] + 0.005, Math.min(pts[di + 1][0] - 0.005, optClamp01(this.canvasToX(x))));
                  pts[di][1] = ny;
               }
               this.__slot.curvesPoints = pts;
               this.repaint();
            } else {
               var old = this.__hoverIdx;
               this.__hoverIdx = this.findNearest(x, y);
               if (old !== this.__hoverIdx) this.repaint();
            }
         };
         dlg.ccCurvesWidget.onMouseRelease = function() {
            if (this.__dragging >= 0) {
               this.__dragging = -1;
               if (this.__slot && this.__slot.chkLive && this.__slot.chkLive.checked)
                  dlg.scheduleCcSlotsPreview(160);
            }
         };
         var ccCurvesLabel = optInfoLabel(this.ccTab.preview.control, "Curves: select a slot histogram to edit its curve. Left click adds/drags points, right click removes points.");
         this.ccCurvesLabel = ccCurvesLabel;
         this.ccTab.preview.control.sizer.add(ccCurvesLabel);
         this.ccTab.preview.control.sizer.add(dlg.ccCurvesWidget);
         optRefreshCcSlotCombos(dlg);
         optUpdateCcCurvesWidget(dlg, null);
   // IMG-ENH: promote the blended channels as "Final" and open it in Image Enhancement.
   if (dlg.imgEnhTab) {
      dlg.btnCcToImageEnh = optPrimaryButton(dlg.ccTab.leftContent, "To Image Enhancement", 0);
      optThemeApplyPrimaryCta(dlg.btnCcToImageEnh);
      optApplyExplicitTooltip(dlg.btnCcToImageEnh, "cc.toImageEnh");
      dlg.btnCcToImageEnh.onClick = function() { optSafeUi("To Image Enhancement", function() { dlg.sendCcFinalToImageEnh(); }); };
      dlg.ccTab.leftContent.sizer.add(dlg.btnCcToImageEnh);
   }
   this.ccTab.leftContent.sizer.addStretch();
};

