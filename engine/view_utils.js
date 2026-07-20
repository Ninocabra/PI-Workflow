function optCreateGenericProcessInstance(processNames, iconNames) {
   var names = processNames || [];
   var icons = iconNames || [];
   for (var i = 0; i < icons.length; ++i) {
      try {
         var iconProc = ProcessInstance.fromIcon(icons[i]);
         if (iconProc != null && !iconProc.isNull)
            return iconProc;
      } catch (e0) {
      }
   }
   for (var j = 0; j < names.length; ++j) {
      try {
         var ctorName = names[j];
         if (!ctorName || ctorName.length === 0)
            continue;
         var ctor = eval(ctorName);
         if (typeof ctor === "function")
            return new ctor();
      } catch (e1) {
      }
   }
   return null;
}

function optMarkSyntheticSolved(window) {
   if (!window || window.isNull || !window.mainView || window.mainView.isNull)
      return;
   try {
      if (window.mainView.id && window.mainView.id.length > 0)
         OPT_SYNTHETIC_WCS_IDS[window.mainView.id] = true;
   } catch (e0) {}
}

function optRunTestModePreviewTransform(targetView, family, strength) {
   console.warningln("=> PI_Workflow_Opt TEST MODE: using synthetic fallback instead of the real process.");
   return optApplyFallbackTransform(targetView, family || "contrast", isFinite(strength) ? strength : 0.12);
}

function optLabelForKey(key) {
   switch (key) {
   case "MonoRGB": return "R+G+B";
   case "HSO": return "NB RGB";
   case "MonoRGB_Starless": return "R+G+B Starless";
   case "MonoRGB_Stars": return "R+G+B Stars";
   case "HSO_Starless": return "NB RGB Starless";
   case "HSO_Stars": return "NB RGB Stars";
   default:
      if (key && key.indexOf("_Starless") > 0)
         return key.replace("_Starless", " Starless");
      if (key && key.indexOf("_Stars") > 0)
         return key.replace("_Stars", " Stars");
      // CONTINUUM-SUB: emission-map output slots (H_CS -> "H CS").
      if (key && key.indexOf("_CS") > 0)
         return key.replace("_CS", " CS");
      // IMG-ENH: Final1 -> "Final 1", etc. ("Final" falls through to itself.)
      if (key && /^Final[0-9]+$/.test(key))
         return "Final " + key.substring(5);
      return key || "";
   }
}

function optBaseKey(key) {
   if (!key)
      return "";
   if (key.indexOf("_Starless") > 0)
      return key.replace(/_Starless$/, "");
   if (key.indexOf("_Stars") > 0)
      return key.replace(/_Stars$/, "");
   if (key.indexOf("_CS") > 0)
      return key.replace(/_CS$/, "");
   return key;
}

function optAllWorkflowKeys() {
   var baseKeys = OPT_BASE_KEYS;
   if (!baseKeys || typeof baseKeys.length === "undefined")
      baseKeys = ["MonoRGB", "R", "G", "B", "L", "HSO", "H", "O", "S", "HO", "OS", "RGB"];
   var out = [];
   for (var i = 0; i < baseKeys.length; ++i) {
      var key = baseKeys[i];
      out.push(key);
      out.push(key + "_Starless");
      out.push(key + "_Stars");
   }
   // CONTINUUM-SUB: emission-map output slots, created by Continuum Subtraction.
   // Only the narrowband lines get a _CS slot (the only meaningful CS outputs);
   // they appear as path chips once populated, like any other slot. Added
   // unconditionally (harmless when unpopulated) to avoid depending on the
   // OPT_CONTINUUM_SUB_ENABLED assignment order during early calls.
   out.push("H_CS");
   out.push("O_CS");
   out.push("S_CS");
   // IMG-ENH: "Final" (and Final1..Final4) hold blended/enhanced results routed to the
   // Image Enhancement tab. Multiple slots so repeated promotions don't overwrite an earlier
   // Final (the promotion picks the first free one). Harmless when unpopulated.
   if (typeof OPT_IMG_ENH_ENABLED === "undefined" || OPT_IMG_ENH_ENABLED) {
      out.push("Final"); out.push("Final1"); out.push("Final2"); out.push("Final3"); out.push("Final4");
   }
   return out;
}

function optHasOwn(map, key) {
   return !!(map && Object.prototype.hasOwnProperty.call(map, key));
}

function optSafeView(view) {
   try {
      var notNull = true;
      try {
         if (typeof view.isNull !== "undefined")
            notNull = (view.isNull === false);
      } catch (e0) {
         notNull = true;
      }
      return !!(
         view &&
         typeof view === "object" &&
         notNull &&
         view.image &&
         view.window
      );
   } catch (e) {
      return false;
   }
}

function optViewIsColor(view) {
   try {
      if (!optSafeView(view))
         return false;
      return view.image.numberOfChannels >= 3;
   } catch (e) {
      return false;
   }
}

function optViewIsMono(view) {
   try {
      if (!optSafeView(view))
         return false;
      return view.image.numberOfChannels === 1;
   } catch (e) {
      return false;
   }
}

function optWorkspaceViews() {
   var out = [];
   try {
      var windows = ImageWindow.windows;
      for (var i = 0; i < windows.length; ++i) {
         var view = windows[i].mainView;
         if (optSafeView(view))
            out.push(view);
      }
   } catch (e) {
   }
   return out;
}

function optFindWorkspaceViewById(id) {
   if (!id || id.length === 0)
      return null;
   try {
      var view = View.viewById(id);
      if (optSafeView(view))
         return view;
   } catch (e) {
   }
   return null;
}

function optUniqueId(baseId) {
   var clean = (baseId || "PIW_Opt").replace(/[^A-Za-z0-9_]/g, "_");
   if (!/^[A-Za-z]/.test(clean))
      clean = "PIW_" + clean;
   var id = clean;
   var n = 1;
   while (optFindWorkspaceViewById(id)) {
      if (n > 100000)
         throw new Error("Could not generate a unique view id for base id: " + clean);
      id = clean + "_" + n;
      ++n;
   }
   return id;
}

function optCreateWindowLike(referenceView, id, channels, color) {
   if (!optSafeView(referenceView))
      throw new Error("Cannot create an ImageWindow without a valid reference view.");
   var w = referenceView.image.width;
   var h = referenceView.image.height;
   // We always create the destination as 32-bit float because the rest of the
   // workflow (STF, MAS, deconvolution, gradient correction, etc.) operates in
   // float. Reading bitsPerSample directly from the source was unsafe: a 16-bit
   // integer master (common in FITS/XISF stacks that have not been plate-solved
   // yet) combined with isFloat=true produced an invalid (16, float) sample
   // format and threw "ImageWindow.ImageWindow(): invalid sample format".
   // We only honour the source depth when it is genuinely 64-bit float, to
   // preserve precision; in every other case we promote to 32-bit float.
   var bits = 32;
   try {
      var srcBits = referenceView.window.bitsPerSample;
      var srcIsFloat = (referenceView.image.sampleType === SampleType_Real);
      if (srcIsFloat && srcBits === 64)
         bits = 64;
   } catch (e0) {}
   return new ImageWindow(w, h, channels, bits, true, color, optUniqueId(id));
}

function optRequireSameGeometry(label, views) {
   if (!views || views.length < 1 || !optSafeView(views[0]))
      throw new Error(label + ": missing reference view.");
   var ref = views[0];
   var w = ref.image.width;
   var h = ref.image.height;
   for (var i = 1; i < views.length; ++i) {
      var v = views[i];
      if (!optSafeView(v))
         throw new Error(label + ": missing input view " + (i + 1) + ".");
      if (v.image.width !== w || v.image.height !== h)
         throw new Error(label + ": input image geometry mismatch. Reference is " + w + "x" + h +
            ", but " + v.id + " is " + v.image.width + "x" + v.image.height + ".");
   }
}

function optCopyMetadata(targetWindow, sourceView) {
   if (!targetWindow || targetWindow.isNull || !optSafeView(sourceView))
      return;
   var tgtId = (targetWindow.mainView && !targetWindow.mainView.isNull) ? targetWindow.mainView.id : "";
   var srcId = sourceView.id;
    // WCS-CANDIDATE-FIX-BEGIN: allow WCS and keywords to copy to full-resolution Candidate views, only skip for Live views
    if (tgtId.indexOf("Live") >= 0 || srcId.indexOf("Live") >= 0) {
       return;
    }
    // WCS-CANDIDATE-FIX-END
   try { targetWindow.keywords = sourceView.window.keywords; } catch (e0) {}
   // v33-opt-9o: only copy the astrometric solution when source and target
   // have IDENTICAL pixel dimensions. Otherwise PixInsight emits a noisy
   // "AstrometricMetadata::Write(): Incompatible image dimensions" warning
   // during downstream processes (typical when a downsampled live-preview
   // candidate is cloned/extracted and the parent's WCS no longer matches
   // the new size). The warning is harmless but pollutes the console.
   try {
      var tgtView = targetWindow.mainView;
      if (tgtView && !tgtView.isNull &&
          tgtView.image.width  === sourceView.image.width &&
          tgtView.image.height === sourceView.image.height) {
         tgtView.window.copyAstrometricSolution(sourceView.window);
      }
   } catch (e1) {}
}


function optRequireLinearImage(view, context) {
   if (!optSafeView(view))
      throw new Error("[" + (context || "PROCESS") + "/TARGET] Invalid target view.");
   try {
      var hasLinearityProperty = false;
      try { hasLinearityProperty = view.image && ("isLinear" in view.image); } catch (eProp) { hasLinearityProperty = false; }
      if (hasLinearityProperty && view.image["isLinear"] === false)
         throw new Error("[" + (context || "PROCESS") + "/LINEARITY] " + context + " requires a linear image. The selected view appears to be non-linear.");
   } catch (e0) {
      if (e0 && e0.message && e0.message.indexOf("/LINEARITY]") >= 0)
         throw e0;
   }
}

function optCloneView(view, baseId, showWindow) {
   if (!optSafeView(view))
      return null;
   var channels = view.image.numberOfChannels;
   var color = channels >= 3;
   var win = null;
   var inProcess = false;
   try {
      win = optCreateWindowLike(view, baseId || (view.id + "_clone"), channels, color);
      win.mainView.beginProcess(UndoFlag_NoSwapFile);
      inProcess = true;
      win.mainView.image.assign(view.image);
      win.mainView.endProcess();
      inProcess = false;
      optCopyMetadata(win, view);
      if (showWindow)
         win.show();
      else
         win.hide();
   } catch (e) {
      if (inProcess && win && !win.isNull) {
         try { win.mainView.endProcess(); } catch (eEnd) {}
      }
      if (win && !win.isNull) {
         try { win.forceClose(); } catch (eClose) {}
      }
      throw e;
   }
   return win.mainView;
}

function optCloseView(view) {
   try {
      if (optSafeView(view) && view.window && !view.window.isNull) {
         if (view.window.isReusable === true || view.isReusable === true)
            return;
         view.window.forceClose();
      }
   } catch (e) {
   }
}

function optCloseViews(views) {
   if (!views || typeof views.length === "undefined")
      return;
   for (var i = 0; i < views.length; ++i)
      optCloseView(views[i]);
}

function optMadMidtone(median, shadow, targetBackground) {
   var value = median - shadow;
   var target = isFinite(targetBackground) ? targetBackground : 0.25;
   if (!isFinite(value) || value <= 0)
      return 0.5;
   var denom = ((2 * target - 1) * value - target);
   if (Math.abs(denom) < 1.0e-12)
      return 0.5;
   var midtone = (target - 1) * value / denom;
   if (!isFinite(midtone))
      return 0.5;
   return Math.max(0.0001, Math.min(0.9999, midtone));
}

function optApplyMadAutoStretch(image, linked) {
   if (!image || typeof HistogramTransformation === "undefined")
      return false;
   var channels = 1;
   try { channels = image.numberOfChannels; } catch (e0) { channels = 1; }
   var targetBackground = 0.25;
   var shadows = [0.0, 0.0, 0.0];
   var midtones = [0.5, 0.5, 0.5];
   try {
      if (linked === true && channels >= 3) {
         var sumMedian = 0.0;
         var sumMad = 0.0;
         for (var c0 = 0; c0 < 3; ++c0) {
            image.selectedChannel = c0;
            sumMedian += image.median();
            sumMad += image.MAD();
         }
         image.resetSelections();
         var linkedMedian = sumMedian / 3.0;
         var linkedMad = sumMad / 3.0;
         var linkedShadow = Math.max(0.0, linkedMedian - 1.25 * linkedMad);
         var linkedMidtone = optMadMidtone(linkedMedian, linkedShadow, targetBackground);
         shadows = [linkedShadow, linkedShadow, linkedShadow];
         midtones = [linkedMidtone, linkedMidtone, linkedMidtone];
      } else {
         var count = Math.min(channels, 3);
         for (var c1 = 0; c1 < count; ++c1) {
            image.selectedChannel = c1;
            var median = image.median();
            var mad = image.MAD();
            var shadow = Math.max(0.0, median - 1.25 * mad);
            shadows[c1] = isFinite(shadow) ? shadow : 0.0;
            midtones[c1] = optMadMidtone(median, shadows[c1], targetBackground);
         }
         image.resetSelections();
      }
      var ht = new HistogramTransformation();
      if (channels >= 3) {
         ht.H = [
            [shadows[0], midtones[0], 1.0, 0.0, 1.0],
            [shadows[1], midtones[1], 1.0, 0.0, 1.0],
            [shadows[2], midtones[2], 1.0, 0.0, 1.0],
            [0.0, 0.5, 1.0, 0.0, 1.0],
            [0.0, 0.5, 1.0, 0.0, 1.0]
         ];
      } else {
         ht.H = [
            [0.0, 0.5, 1.0, 0.0, 1.0],
            [0.0, 0.5, 1.0, 0.0, 1.0],
            [0.0, 0.5, 1.0, 0.0, 1.0],
            [shadows[0], midtones[0], 1.0, 0.0, 1.0],
            [0.0, 0.5, 1.0, 0.0, 1.0]
         ];
      }
      ht.executeOn(image);
      return true;
   } catch (e1) {
      try { image.resetSelections(); } catch (e2) {}
   }
   return false;
}

// PREVIEW-MIPMAP-BEGIN — high-quality preview downscaling (Option C, render stage).
// Downscale an Image to (rw, rh) using a cascade of 2:1 halving steps with Bilinear,
// then a final Bilinear step for the remainder. Image.resample() only reliably
// accepts NearestNeighbor and Bilinear, so this uses Bilinear exclusively. An exact
// 2:1 halving with Bilinear is a perfect 4-pixel box average (every source pixel is
// integrated), so chaining halvings avoids the aliasing/banding that a single large
// reduction (e.g. 3:1 or 6:1) produces by skipping pixels. Binary masks keep their
// hard edges via a single NearestNeighbor pass (no cascade).
// To revert Option C: restore "img.resample(rw, rh, previewInterpolation)" at the
// three call sites and delete this function plus the UI-side mipmap block.
