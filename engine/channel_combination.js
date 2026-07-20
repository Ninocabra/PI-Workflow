// CC-LAYERS-OPTIMIZATION-BEGIN
function optCcBlendExpression(modeName, viewAId, viewBId, opacity, maskId) {
   var A = viewAId, B = viewBId, mode = modeName || "Screen";
   var opVal = (typeof opacity === "number") ? opacity : 1.0;
   if (opVal <= 0.0001)
      return A;
   
   function getBaseBlend(m) {
      switch (m) {
      case "Replace": return B;
      case "Darken/Min": return "min(" + A + "," + B + ")";
      case "Multiply": return "(" + A + "*" + B + ")";
      case "Colour burn": return "max(0,1-min((1-" + A + ")/max(" + B + ",1.0e-6),1))";
      case "Linear burn": return "max(0," + A + "+" + B + "-1)";
      case "Darker colour": return "iif(CIEL(" + A + ")>CIEL(" + B + ")," + B + "," + A + ")";
      case "Lighten/Max": return "max(" + A + "," + B + ")";
      case "Screen": return "(1-(1-" + A + ")*(1-" + B + "))";
      case "Colour dodge": return "min(" + A + "/max(1-" + B + ",1.0e-6),1)";
      case "Linear dodge/Add": return "min(1," + A + "+" + B + ")";
      case "Lighter colour": return "iif(CIEL(" + A + ")>CIEL(" + B + ")," + A + "," + B + ")";
      case "Overlay": return "iif(" + A + "<=0.5,2*" + A + "*" + B + ",1-2*(1-" + A + ")*(1-" + B + "))";
      case "Soft light": return "max(0,min(1,(1-2*" + B + ")*" + A + "*" + A + "+2*" + A + "*" + B + "))";
      case "Hard light": return "iif(" + B + "<=0.5,2*" + A + "*" + B + ",1-2*(1-" + A + ")*(1-" + B + "))";
      case "Vivid light": return "iif(" + B + "<0.5,max(0,1-(1-" + A + ")/max(2*" + B + ",1.0e-6)),min(1," + A + "/max(2*(1-" + B + "),1.0e-6)))";
      case "Linear light": return "min(1,max(0,2*" + B + "+" + A + "-1))";
      case "Pin light": return "max(2*" + B + "-1,min(" + A + ",2*" + B + "))";
      case "Difference": return "abs(" + A + "-" + B + ")";
      case "Exclusion": return "(" + A + "+" + B + "-2*" + A + "*" + B + ")";
      case "Subtract": return "max(0," + A + "-" + B + ")";
      case "Divide": return "min(1," + A + "/max(" + B + ",1.0e-6))";
      case "Power": return "max(0,min(1,pow(max(" + A + ",0),max(" + B + ",0))))";
      case "Arctan": return "max(0,min(1,atan(" + A + "/max(" + B + ",1.0e-6))/1.57079632679))";
      case "Hue":
         // Hue from overlay (B), saturation+luminosity from base (A) — CIE L*a*b*
         // Scale B's color direction to A's chroma magnitude, set luminance to A's
         return "iif(sqrt(CIEa(" + B + ")*CIEa(" + B + ")+CIEb(" + B + ")*CIEb(" + B + "))>1.0e-6," +
                "min(1,max(0,CIEL(" + A + ")+(" + B + "-CIEL(" + B + "))*sqrt(CIEa(" + A + ")*CIEa(" + A + ")+CIEb(" + A + ")*CIEb(" + A + "))/max(sqrt(CIEa(" + B + ")*CIEa(" + B + ")+CIEb(" + B + ")*CIEb(" + B + ")),1.0e-6)))," +
                A + ")";
      case "Saturation":
         // Saturation from overlay (B), hue+luminosity from base (A) — CIE L*a*b*
         // Scale A's color deviation to B's chroma magnitude, keep A's luminance and hue direction
         return "iif(sqrt(CIEa(" + A + ")*CIEa(" + A + ")+CIEb(" + A + ")*CIEb(" + A + "))>1.0e-6," +
                "min(1,max(0,CIEL(" + A + ")+(" + A + "-CIEL(" + A + "))*sqrt(CIEa(" + B + ")*CIEa(" + B + ")+CIEb(" + B + ")*CIEb(" + B + "))/max(sqrt(CIEa(" + A + ")*CIEa(" + A + ")+CIEb(" + A + ")*CIEb(" + A + ")),1.0e-6)))," +
                A + ")";
      case "Lightness":
         // Luminosity from overlay (B), hue+saturation from base (A)
         // Scale A by luminance ratio L(B)/L(A)
         return "iif(CIEL(" + A + ")>1.0e-6,min(1,max(0," + A + "*CIEL(" + B + ")/CIEL(" + A + "))),0)";
      default: return B;
      }
   }
   
   var expr = getBaseBlend(mode);
   // Photoshop-style layer mask (optional): the mask modulates this layer's
   // contribution to the composite as a per-pixel alpha (alpha = opacity * mask,
   // with the mask normalised to [0,1]). Where the mask is black the backdrop A
   // shows through; where white the layer blends at full opacity. Passing no maskId
   // keeps the plain scalar-opacity path (used by the headless harness).
   if (maskId) {
      var a = (opVal < 0.9999)
            ? ("(" + opVal.toFixed(4) + "*" + maskId + ")")
            : maskId;
      return "(" + A + "*(1-" + a + ")+(" + expr + ")*" + a + ")";
   }
   if (opVal < 0.9999) {
      // Wrap the whole opacity mix in parentheses so the returned string stays a
      // single atomic operand. In the Live "See all Images Blended" path this
      // expression is nested as the A (backdrop) operand of the layer above; without
      // the outer parens, operator precedence corrupts any upper blend that embeds A
      // in a multiplicative/subtractive context (Screen, Multiply, Overlay, Colour
      // burn/dodge, ...), so the live preview diverges from the applied (Full) result.
      return "(" + A + " * (1 - " + opVal.toFixed(4) + ") + (" + expr + ") * " + opVal.toFixed(4) + ")";
   }
   return expr;
}
// CC-LAYERS-OPTIMIZATION-END

function optCreateGrayExpressionView(sourceView, expression, baseId) {
   var win = optCreateWindowLike(sourceView, baseId || "Opt_Gray", 1, false);
   win.mainView.beginProcess(UndoFlag_NoSwapFile);
   win.mainView.image.fill(0);
   win.mainView.endProcess();
   var pm = new PixelMath();
   pm.expression = expression;
   pm.useSingleExpression = true;
   pm.createNewImage = false;
   pm.showNewImage = false;
   pm.executeOn(win.mainView);
   optCopyMetadata(win, sourceView);
   try { win.hide(); } catch (e0) {}
   return win.mainView;
}

function optRefreshCcSlotCombos(dialog) {
   if (!dialog || !dialog.ccSlots)
      return;
   // Show every loaded image, not only those explicitly promoted to the
   // CC tab via the Post tab. Channel Combination is the one place where
   // the user typically wants to mix images from different pipeline
   // stages (a stretched RGB master with separate H/O/S monos, etc.),
   // so the tab-availability filter that the Pre / Stretch / Post combos
   // use would just hide useful sources here.
   var keys = dialog.store.keysWithValidView();
   for (var s = 0; s < dialog.ccSlots.length; ++s) {
      var slot = dialog.ccSlots[s];
      if (!slot || !slot.comboSource)
         continue;
      var previous = optComboText(slot.comboSource, "");
      try {
         while (slot.comboSource.numberOfItems > 0)
            slot.comboSource.removeItem(slot.comboSource.numberOfItems - 1);
      } catch (e0) {}
      slot.comboSource.addItem("None");
      slot.sourceKeys = [];
      for (var i = 0; i < keys.length; ++i)
      {
         slot.sourceKeys.push(keys[i]);
         slot.comboSource.addItem(optLabelForKey(keys[i]));
      }
      var selectIndex = 0;
      for (var j = 0; j < slot.comboSource.numberOfItems; ++j)
         if (slot.comboSource.itemText(j) === previous)
            selectIndex = j;
      slot.comboSource.currentItem = selectIndex;
      optRefreshCcSlotMaskCombo(dialog, slot);
      optRefreshCcSlotControlState(dialog, slot);
      optRefreshCcSlotHistogram(dialog, slot);
   }
}

function optCcSlotSourceKey(slot) {
   if (!slot || !slot.comboSource)
      return "";
   var idx = 0;
   try { idx = slot.comboSource.currentItem; } catch (e0) { idx = 0; }
   if (idx <= 0)
      return "";
   if (slot.sourceKeys && idx - 1 < slot.sourceKeys.length)
      return slot.sourceKeys[idx - 1] || "";
   var key = optComboText(slot.comboSource, "");
   return key === "None" ? "" : key;
}

function optCcSlotSourceView(dialog, slot) {
   var key = optCcSlotSourceKey(slot);
   if (!key)
      return null;
   var rec = dialog.store.record(key);
   return optSafeView(rec.view) ? rec.view : null;
}

function optRefreshCcSlotMaskCombo(dialog, slot) {
   if (!dialog || !slot || !slot.comboMask)
      return;
   var previous = optComboText(slot.comboMask, "None");
   try {
      while (slot.comboMask.numberOfItems > 0)
         slot.comboMask.removeItem(slot.comboMask.numberOfItems - 1);
   } catch (e0) {}
   slot.comboMask.addItem("None");
   slot.maskMemoryIndices = [];
   var selected = 0;
   try {
      var mem = dialog.postMaskMemory;
      if (mem && mem.slots) {
         for (var i = 0; i < mem.slots.length; ++i) {
            var m = mem.slots[i];
            if (!m || !optSafeView(m.view))
               continue;
            var label = (m.label || m.view.id || ("Mask " + (i + 1)));
            slot.maskMemoryIndices.push(i);
            slot.comboMask.addItem(label);
            if (label === previous)
               selected = slot.comboMask.numberOfItems - 1;
         }
      }
   } catch (e1) {}
   try { slot.comboMask.currentItem = selected; } catch (e2) {}
}

function optRefreshCcMaskCombos(dialog) {
   if (!dialog || !dialog.ccSlots)
      return;
   for (var i = 0; i < dialog.ccSlots.length; ++i)
      optRefreshCcSlotMaskCombo(dialog, dialog.ccSlots[i]);
}

function optCcSlotMaskView(dialog, slot) {
   if (!dialog || !slot || !slot.comboMask || !dialog.postMaskMemory)
      return null;
   var idx = 0;
   try { idx = slot.comboMask.currentItem; } catch (e0) { idx = 0; }
   if (idx <= 0 || !slot.maskMemoryIndices || idx - 1 >= slot.maskMemoryIndices.length)
      return null;
   var memIndex = slot.maskMemoryIndices[idx - 1];
   var memSlot = dialog.postMaskMemory.slots && memIndex >= 0 && memIndex < dialog.postMaskMemory.slots.length ? dialog.postMaskMemory.slots[memIndex] : null;
   return memSlot && optSafeView(memSlot.view) ? memSlot.view : null;
}

function optApplyCcSlotCurvesToView(view, points) {
   if (!optSafeView(view) || !points || points.length < 2)
      return view;
   var identity = points.length === 2 &&
      Math.abs(points[0][0]) < 0.001 && Math.abs(points[0][1]) < 0.001 &&
      Math.abs(points[1][0] - 1.0) < 0.001 && Math.abs(points[1][1] - 1.0) < 0.001;
   if (identity)
      return view;
   var ct = new CurvesTransformation();
   ct.K = points;
   ct.executeOn(view);
   return view;
}

function optRefreshCcSlotControlState(dialog, slot) {
   if (!dialog || !slot)
      return;
   var src = optCcSlotSourceView(dialog, slot);
   var hasSource = optSafeView(src);
   try { slot.chkColour.visible = hasSource; } catch (e0) {}
   try { slot.colourWheel.visible = hasSource && slot.chkColour && slot.chkColour.checked === true; } catch (e1) {}
   try { slot.comboBlend.enabled = hasSource; } catch (e2) {}
   try { if (slot.comboMask) slot.comboMask.enabled = hasSource; } catch (eM) {}
   try { slot.ncBrightness.enabled = hasSource; } catch (e3) {}
   try { slot.ncSaturation.enabled = hasSource; } catch (e4) {}
   // CC-LAYERS-OPTIMIZATION-BEGIN
   try { if (slot.ncOpacity) slot.ncOpacity.enabled = hasSource; } catch (eOp) {}
   // CC-LAYERS-OPTIMIZATION-END
   try { slot.chkLive.enabled = hasSource; } catch (e5) {}
   try { slot.chkColour.enabled = hasSource; } catch (e6) {}
   try { slot.chkActive.enabled = hasSource; } catch (e7) {}
   try { slot.chkHistogram.enabled = hasSource; } catch (e8) {}
   try { if (slot.colorGroup) slot.colorGroup.visible = hasSource && slot.chkColour && slot.chkColour.checked === true; } catch (e9) {}
   try { if (slot.histogramGroup) slot.histogramGroup.visible = hasSource && slot.chkHistogram && slot.chkHistogram.checked === true; } catch (e10) {}
}

function optRefreshCcSlotHistogram(dialog, slot) {
   if (!slot)
      return;
   var src = optCcSlotSourceView(dialog, slot);
   slot.cachedHistogramData = optSafeView(src) ? optGetCachedHistogram(src, 256) : null;
}

function optUpdateCcCurvesWidget(dialog, slot) {
   if (!dialog || !dialog.ccCurvesWidget)
      return;
   if (slot)
      optRefreshCcSlotHistogram(dialog, slot);
   dialog.ccActiveSlot = slot || null;
   dialog.ccCurvesWidget.__slot = slot || null;
   dialog.ccCurvesWidget.__pts = slot && slot.curvesPoints ? slot.curvesPoints : [[0, 0], [1, 1]];
   dialog.ccCurvesWidget.__hist = slot ? slot.cachedHistogramData : null;
   var visible = !!(slot && slot.chkHistogram && slot.chkHistogram.checked === true);
   if (dialog.ccCurvesLabel)
      dialog.ccCurvesLabel.visible = visible;
   dialog.ccCurvesWidget.visible = visible;
   dialog.ccCurvesWidget.repaint();
}

function optUpdateCcSlotColorStats(dialog, slot, force) {
   if (!dialog || !slot)
      return;
   var src = optCcSlotSourceView(dialog, slot);
   if (!optSafeView(src))
      return;
   if (force === true || !slot.__colorStatsReady) {
      if (src.image.numberOfChannels >= 3) {
         var stats = optComputeViewMeanHueSat(src, 4096);
         slot.colorMeanHueDeg = stats.hueDeg;
         slot.colorMeanSat = stats.sat;
         slot.colorPointHueDeg = stats.hueDeg;
         slot.colorPointIntensity = Math.max(0.65, stats.sat);
      } else {
         slot.colorMeanHueDeg = 0.0;
         slot.colorMeanSat = 0.0;
         slot.colorPointHueDeg = isFinite(slot.colorPointHueDeg) ? slot.colorPointHueDeg : 0.0;
         slot.colorPointIntensity = isFinite(slot.colorPointIntensity) ? slot.colorPointIntensity : 0.75;
      }
      slot.__colorStatsReady = true;
   }
}

function optUpdateCcSlotColorReadout(slot) {
   if (!slot || !slot.lblColorReadout)
      return;
   var delta = optShortestHueDeltaDegrees(slot.colorMeanHueDeg || 0.0, slot.colorPointHueDeg || 0.0);
   slot.lblColorReadout.text =
      "<b>Mean:</b> " + (slot.colorMeanHueDeg || 0.0).toFixed(1) + " deg / " + (slot.colorMeanSat || 0.0).toFixed(2) +
      " | <b>Target:</b> " + (slot.colorPointHueDeg || 0.0).toFixed(1) + " deg / " + (slot.colorPointIntensity || 0.0).toFixed(2) +
      " | <b>Shift:</b> " + (delta * optClamp01(slot.colorPointIntensity || 0.0)).toFixed(1) + " deg";
}

function optCcSlotColorState(slot) {
   return {
      meanHueDeg: slot.colorMeanHueDeg || 0.0,
      pointHueDeg: slot.colorPointHueDeg || 0.0,
      pointIntensity: slot.colorPointIntensity || 0.0,
      hueSaturation: slot.ncColorHueSaturation,
      r: slot.ncColorR,
      g: slot.ncColorG,
      b: slot.ncColorB,
      saturation: slot.ncColorSaturation,
      scnr: slot.chkColorSCNR,
      scnrAmount: slot.ncColorSCNR
   };
}

function optPrepareCcSlotView(dialog, slot, opts) {
   opts = opts || {};
   var live = opts.live === true;
   var liveMaxDim = opts.liveMaxDim || OPT_CC_LIVE_MAX_DIM;
   var key = optCcSlotSourceKey(slot);
   if (!key)
      return null;
   var rec = dialog.store.record(key);
   if (!optSafeView(rec.view))
      return null;
   var work = optCloneView(rec.view, "Opt_CC_Slot_" + slot.index, false);
   if (!optSafeView(work))
      return null;
   try {
      if (live)
         optDownsamplePreparedView(work, liveMaxDim);
      // Slot adjustments (brightness / colour / saturation / curves) apply to the
      // WHOLE layer. The slot mask is no longer consumed here: it is now applied at
      // compose time as a Photoshop-style layer mask that modulates how much this
      // layer shows through in the blend (see optComposeCcSlots).
      var bright = optNumericValue(slot.ncBrightness, 1.0);
      if (Math.abs(bright - 1.0) > 0.0001)
         optRunPixelMath(work, "min(max($T*" + bright.toFixed(6) + ",0),1)");
      var sat = optNumericValue(slot.ncSaturation, 1.0);
      var useColourWheel = slot.chkColour && slot.chkColour.checked === true;
      if (useColourWheel) {
         optUpdateCcSlotColorStats(dialog, slot, false);
         if (work.image.numberOfChannels < 3) {
            // Mono source (e.g. H-alpha): convert to RGB first, then colorize.
            // A plain hue-shift cannot work here because saturation is 0 in HSI
            // for a neutral grey (all channels equal) — no shift has any effect.
            var rgb = new ConvertToRGBColor();
            rgb.executeOn(work);
            optColorizeMono(work, slot.colorPointHueDeg || 0.0, slot.colorPointIntensity || 0.75);
         } else {
            optApplyColorBalanceFromState(work, optCcSlotColorState(slot));
         }
      }
      if (work.image.numberOfChannels >= 3 && Math.abs(sat - 1.0) > 0.0001) {
         var cs = new ColorSaturation();
         cs.HS = [[0.0, 0.5 * sat], [0.5, 0.85 * sat], [1.0, 0.5 * sat]];
         cs.HSt = ColorSaturation.prototype.AkimaSubsplines;
         cs.executeOn(work);
      }
      if (slot.chkHistogram && slot.chkHistogram.checked === true)
         optApplyCcSlotCurvesToView(work, slot.curvesPoints);
      return work;
   } catch (e) {
      optCloseView(work);
      throw e;
   }
}

// CC slot cache (#3): each slot keeps two cache entries (`__preparedCacheLive`
// and `__preparedCacheFull`) keyed on a hash of the slot's parameters and the
// current source view id. While `chkCcSeeAllBlended` is active and the user
// only changes one slot, the other slots short-circuit through the cache and
// only one slot is rebuilt per frame. Live entries are downsampled to fit
// within OPT_CC_LIVE_MAX_DIM so PixelMath operates on much smaller images.

function optCcSlotCacheKey(dialog, slot, live, liveMaxDim) {
   if (!dialog || !slot)
      return null;
   var key = optCcSlotSourceKey(slot);
   if (!key)
      return null;
   var rec = dialog.store.record(key);
   if (!optSafeView(rec.view))
      return null;
   var bright = optNumericValue(slot.ncBrightness, 1.0);
   var sat = optNumericValue(slot.ncSaturation, 1.0);
   // CC-LAYERS-OPTIMIZATION-BEGIN
   var opacity = optNumericValue(slot.ncOpacity, 1.0);
   // CC-LAYERS-OPTIMIZATION-END
   var chkColour = slot.chkColour && slot.chkColour.checked === true;
   var chkHist = slot.chkHistogram && slot.chkHistogram.checked === true;
   var maskView = optCcSlotMaskView(dialog, slot);
   var parts = [
      rec.view.id,
      optSafeView(maskView) ? maskView.id : "NoMask",
      bright.toFixed(4),
      sat.toFixed(4),
      // CC-LAYERS-OPTIMIZATION-BEGIN
      opacity.toFixed(4),
      // CC-LAYERS-OPTIMIZATION-END
      chkColour ? "1" : "0",
      chkHist ? "1" : "0",
      live === true ? "L" : "F",
      live === true ? ("D" + (liveMaxDim || OPT_CC_LIVE_MAX_DIM)) : "D0"
   ];
   if (chkColour) {
      parts.push((slot.colorMeanHueDeg || 0.0).toFixed(2));
      parts.push((slot.colorMeanSat || 0.0).toFixed(4));
      parts.push((slot.colorPointHueDeg || 0.0).toFixed(2));
      parts.push((slot.colorPointIntensity || 0.0).toFixed(4));
   }
   if (chkHist) {
      var pts = slot.curvesPoints;
      if (pts && pts.length) {
         var ptsStr = "";
         for (var i = 0; i < pts.length; ++i)
            ptsStr += pts[i][0].toFixed(4) + "/" + pts[i][1].toFixed(4) + ";";
         parts.push(ptsStr);
      } else {
         parts.push("");
      }
   }
   return parts.join("|");
}

function optDownsamplePreparedView(view, maxDim) {
   if (!optSafeView(view) || !maxDim || maxDim < 1)
      return false;
   var img = view.image;
   var W = img.width, H = img.height;
   var maxD = Math.max(W, H);
   if (maxD <= maxDim)
      return false;
   var scale = maxDim / maxD;
   var newW = Math.max(1, Math.round(W * scale));
   var newH = Math.max(1, Math.round(H * scale));
   try {
      view.beginProcess(UndoFlag_NoSwapFile);
      view.image.resample(newW, newH, Interpolation_Bilinear);
      view.endProcess();
      return true;
   } catch (eR) {
      try { view.endProcess(); } catch (e0) {}
      return false;
   }
}

function optCcLivePreviewMaxDim(dialog, referenceView) {
   var reduction = OPT_PREVIEW_REDUCTION_DEFAULT;
   try { reduction = dialog.sharedPreviewReduction || OPT_PREVIEW_REDUCTION_DEFAULT; } catch (e0) {}
   if (!isFinite(reduction) || reduction < 1)
      reduction = OPT_PREVIEW_REDUCTION_DEFAULT;
   var longest = OPT_CC_LIVE_MAX_DIM;
   try {
      if (optSafeView(referenceView))
         longest = Math.max(referenceView.image.width, referenceView.image.height);
   } catch (e1) {}
   var maxDim = Math.max(128, Math.round(longest / Math.max(1, reduction)));
   return Math.max(128, Math.min(longest, maxDim));
}

function optGetCachedCcSlot(dialog, slot, live, liveMaxDim) {
   if (!dialog || !slot)
      return null;
   var cacheKey = optCcSlotCacheKey(dialog, slot, live === true, liveMaxDim);
   if (!cacheKey)
      return null;
   var cacheProp = (live === true) ? "__preparedCacheLive" : "__preparedCacheFull";
   var cache = slot[cacheProp];
   if (cache && cache.cacheKey === cacheKey && optSafeView(cache.view))
      return cache.view;
   if (cache && optSafeView(cache.view)) {
      try { optCloseView(cache.view); } catch (e0) {}
   }
   slot[cacheProp] = null;
   var prepared = optPrepareCcSlotView(dialog, slot, live === true ? { live: true, liveMaxDim: liveMaxDim || OPT_CC_LIVE_MAX_DIM } : null);
   if (!optSafeView(prepared))
      return null;
   slot[cacheProp] = { cacheKey: cacheKey, view: prepared };
   return prepared;
}

function optInvalidateCcSlotCache(slot, which) {
   if (!slot) return;
   // CC-LAYERS-OPTIMIZATION-BEGIN: also clear progressive merge caches
   var props = (which === "live")
      ? ["__preparedCacheLive",  "__mergedCacheLive"]
      : (which === "full")
      ? ["__preparedCacheFull",  "__mergedCacheFull"]
      : ["__preparedCacheLive", "__preparedCacheFull",
         "__mergedCacheLive",  "__mergedCacheFull"];
   // CC-LAYERS-OPTIMIZATION-END
   for (var i = 0; i < props.length; ++i) {
      var c = slot[props[i]];
      if (c && optSafeView(c.view)) {
         try { optCloseView(c.view); } catch (e) {}
      }
      slot[props[i]] = null;
   }
}

function optReleaseCcSlotCaches(dialog) {
   if (!dialog || !dialog.ccSlots) return;
   for (var i = 0; i < dialog.ccSlots.length; ++i)
      optInvalidateCcSlotCache(dialog.ccSlots[i], "all");
}

// Snapshot a Channel Combination slot's user-visible state. Does NOT capture
// the live cache pointer — that ownership stays bound to the UI slot object
// and the cache is still looked up via dialog.ccSlots[i] at compose time
// (see optComposeCcSlots). This intentional partial decoupling is documented
// in "PI Workflow 2 to 4 migration guide.md" Phase 9.
function optBuildCcSlotConfigFromDialog(dialog, slot) {
   if (!slot)
      return null;
   return {
      active: !(slot.chkActive && slot.chkActive.checked !== true),
      sourceKey: optCcSlotSourceKey(slot),
      maskView: optCcSlotMaskView(dialog, slot),
      blendMode: optComboText(slot.comboBlend, "Screen"),
      brightness: optNumericValue(slot.ncBrightness, 1.0),
      saturation: optNumericValue(slot.ncSaturation, 1.0),
      // CC-LAYERS-OPTIMIZATION-BEGIN
      opacity: optNumericValue(slot.ncOpacity, 1.0),
      // CC-LAYERS-OPTIMIZATION-END
      colorEnabled: optChecked(slot.chkColour, false),
      histogramEnabled: optChecked(slot.chkHistogram, false),
      live: optChecked(slot.chkLive, false)
   };
}

function optBuildCcConfigFromDialog(dialog) {
   var cfg = { slots: [] };
   if (!dialog || !dialog.ccSlots)
      return cfg;
   for (var i = 0; i < dialog.ccSlots.length; ++i) {
      var slotCfg = optBuildCcSlotConfigFromDialog(dialog, dialog.ccSlots[i]);
      if (slotCfg)
         cfg.slots.push(slotCfg);
   }
   return cfg;
}

function optComposeCcSlots(dialog, opts) {
   if (!dialog || !dialog.ccSlots)
      throw new Error("Channel Combination slots are not available.");
   var live = opts && opts.live === true;
   var liveMaxDim = (opts && opts.liveMaxDim) ? opts.liveMaxDim : OPT_CC_LIVE_MAX_DIM;
   var slots = dialog.ccSlots;
   var composeCfg = optBuildCcConfigFromDialog(dialog);

   // Find the base slot (highest index = bottom-most layer with a valid source).
   var highest = -1;
   for (var i = composeCfg.slots.length - 1; i >= 0; --i) {
      var sCfg = composeCfg.slots[i];
      if (!sCfg.active) continue;
      if (sCfg.sourceKey && optSafeView(dialog.store.record(sCfg.sourceKey).view)) {
         highest = i;
         break;
      }
   }
   if (highest < 0)
      throw new Error("Load at least one Channel Combination image slot.");

   // CC-LAYERS-OPTIMIZATION-BEGIN
   // Progressive Merge Cache: build merge keys bottom-up (cheap — string concat only).
   // mergeKeys[s] encodes the accumulated state of all slots from highest down through s.
   // If mergeKeys[s] matches the stored __mergedCache key we can reuse that cached
   // composition as our starting point and only blend the remaining slots above it.
   var cachePropM = live ? "__mergedCacheLive" : "__mergedCacheFull";
   var mergeKeys = new Array(composeCfg.slots.length);
   mergeKeys[highest] = optCcSlotCacheKey(dialog, slots[highest], live, liveMaxDim) || "";
   for (var k = highest - 1; k >= 0; --k) {
      var kCfg = composeCfg.slots[k];
      if (!kCfg.active || !kCfg.sourceKey) {
         mergeKeys[k] = mergeKeys[k + 1]; continue;
      }
      var kPrepKey = optCcSlotCacheKey(dialog, slots[k], live, liveMaxDim);
      if (!kPrepKey) {
         mergeKeys[k] = mergeKeys[k + 1]; continue;
      }
      mergeKeys[k] = mergeKeys[k + 1] + "|" + k + ":" + kCfg.blendMode
                     + "@" + kCfg.opacity.toFixed(4) + "+" + kPrepKey;
   }

   // Walk from top (j=0) toward base: take the first slot whose merge cache
   // is valid. Because a merge key incorporates all slots below it, the first
   // hit is the deepest valid pre-computed composition — the optimal starting point.
   var startFrom = highest;   // default: rebuild from base
   for (var j = 0; j < highest; ++j) {
      var jmc = slots[j][cachePropM];
      if (jmc && jmc.mergeKey === mergeKeys[j] && optSafeView(jmc.view)) {
         startFrom = j;
         break;
      }
   }
   // CC-LAYERS-OPTIMIZATION-END

   // Clone the best available starting view.
   var result;
   if (startFrom === highest) {
      // No merge cache hit — start from the per-slot prepared cache.
      var basePrepared = optGetCachedCcSlot(dialog, slots[highest], live, liveMaxDim);
      if (!optSafeView(basePrepared))
         throw new Error("Failed to prepare the Channel Combination base slot.");
      result = optCloneView(basePrepared, "Opt_CC_Compose_" + (live ? "Live" : "Full"), false);
   } else {
      // CC-LAYERS-OPTIMIZATION-BEGIN
      result = optCloneView(slots[startFrom][cachePropM].view,
                            "Opt_CC_Compose_" + (live ? "Live" : "Full"), false);
      // CC-LAYERS-OPTIMIZATION-END
   }
   if (!optSafeView(result))
      throw new Error("Failed to prepare the Channel Combination compose target.");

   // CC-LAYERS-OPTIMIZATION-BEGIN
   // Unified progressive sequential blend for BOTH Live and Full. Each layer is one
   // bounded PixelMath pass with A = "$T" (the running composite) and B = the overlay,
   // so the expression stays O(1) per layer (no exponential nesting) and the opacity
   // mix can never be corrupted by operator precedence — the Live preview now matches
   // the applied Full result exactly (WYSIWYG). Cloning the running composite into the
   // per-slot merge cache (`__mergedCache*`) lets a later edit to a single slot reuse
   // everything below it and re-blend only the layers above (fast interactive drag).
   // Supersedes the former single-nested-expression Live path ("PROPOSAL 3"), which was
   // both precedence-buggy at opacity < 1 and exponential in the number of layers.
   var blendStart = (startFrom < highest) ? startFrom - 1 : highest - 1;
   try {
      for (var s = blendStart; s >= 0; --s) {
         var slotCfg = composeCfg.slots[s];
         if (!slotCfg.active) continue;
         var overlay = optGetCachedCcSlot(dialog, slots[s], live, liveMaxDim);
         if (!optSafeView(overlay)) continue;
         var overlayId = overlay.id;
         var tempOverlay = null;
         var tempMask = null;
         try {
            if ((result.image.numberOfChannels >= 3) !== (overlay.image.numberOfChannels >= 3)) {
               if (result.image.numberOfChannels < 3) {
                  var c1 = new ConvertToRGBColor();
                  c1.executeOn(result);
               }
               if (overlay.image.numberOfChannels < 3) {
                  tempOverlay = optCloneView(overlay, "Opt_CC_OverlayRGB_" + s, false);
                  if (optSafeView(tempOverlay)) {
                     var c2 = new ConvertToRGBColor();
                     c2.executeOn(tempOverlay);
                     overlayId = tempOverlay.id;
                  }
               }
            }
            // Photoshop-style layer mask: modulate this layer's contribution to the
            // composite per pixel. The mask must match the compose geometry, so for
            // live previews (blended at a reduced size) resample a clone to fit.
            var maskId = null;
            var maskView = slotCfg.maskView;
            if (optSafeView(maskView)) {
               if (result.image.width === maskView.image.width &&
                   result.image.height === maskView.image.height) {
                  maskId = maskView.id;
               } else {
                  tempMask = optCloneView(maskView, "Opt_CC_Mask_" + s, false);
                  if (optSafeView(tempMask)) {
                     try {
                        tempMask.beginProcess(UndoFlag_NoSwapFile);
                        tempMask.image.resample(result.image.width, result.image.height, Interpolation_Bilinear);
                        tempMask.endProcess();
                        maskId = tempMask.id;
                     } catch (eRs) {
                        try { tempMask.endProcess(); } catch (eRs0) {}
                        maskId = null;   // fall back to an unmasked blend
                     }
                  }
               }
            }
            var expr = optCcBlendExpression(slotCfg.blendMode, "$T", overlayId, slotCfg.opacity, maskId);
            var pm = new PixelMath();
            pm.expression = expr;
            pm.useSingleExpression = true;
            pm.createNewImage = false;
            pm.showNewImage = false;
            pm.executeOn(result);

            var mcView = optCloneView(result, "Opt_CC_Mrg" + s + (live ? "L" : "F"), false);
            if (optSafeView(mcView)) {
               var oldMc = slots[s][cachePropM];
               if (oldMc && optSafeView(oldMc.view))
                  try { optCloseView(oldMc.view); } catch (eMC) {}
               slots[s][cachePropM] = { mergeKey: mergeKeys[s], view: mcView };
            }
         } finally {
            if (tempOverlay)
               optCloseView(tempOverlay);
            if (tempMask)
               optCloseView(tempMask);
         }
      }
   } catch (eC) {
      optCloseView(result);
      throw eC;
   }
   // CC-LAYERS-OPTIMIZATION-END
   return result;
}

