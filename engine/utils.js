function optUiError(title, error) {
   var message = "";
   try {
      if (error && typeof error === "object" && ("message" in error))
         message = error.message;
      else
         message = String(error);
   } catch (e) {
      message = String(error);
   }
   try { console.criticalln(title + ": " + message); } catch (e0) {}
   try { new MessageBox(title + ": " + message, "PI Workflow", StdIcon_Error, StdButton_Ok).execute(); } catch (e1) {}
}

// Guards an AI/external tool's executeOn() result. Those tools (StarXTerminator,
// BlurXTerminator, NoiseXTerminator, DeepSNR, ...) return `false` instead of
// throwing when their runtime fails to run (e.g. no GPU/GLES in headless mode),
// leaving the view UNTOUCHED. Without this check the pipeline believes the step
// was applied. Throwing turns the silent no-op into a real error, which also lets
// the CabraMagic fallback chains advance to the next engine. `ret` truthy or
// undefined (some bindings return undefined on success) passes; only an explicit
// `false` fails.
function optAssertExecuteOk(ret, toolName) {
   if (ret === false)
      throw new Error((toolName || "External tool") + ": executeOn returned false — the tool did not run (its AI runtime may be unavailable, e.g. no GPU in headless mode). The image was left unchanged.");
   return ret;
}

// Global re-entrancy lock. Prevents a user from triggering a second long
// operation (Preview, Apply, etc.) while a previous one is still running,
// which would otherwise create orphan candidates and corrupt pane state.
// The lock is scoped to all UI handlers that go through optSafeUi.
var OPT_OP_IN_PROGRESS = false;

function optSafeUi(title, fn) {
   if (OPT_OP_IN_PROGRESS) {
      try {
         console.warningln(title + ": another operation is in progress. Please wait for it to finish.");
      } catch (eC) {}
      return null;
   }
   OPT_OP_IN_PROGRESS = true;
   try {
      return fn();
   } catch (e) {
      try { if (typeof optDiagError === "function") optDiagError("UI: " + title, e, ""); } catch (eD) {}  // F3-full: record before surfacing
      optUiError(title, e);
   } finally {
      OPT_OP_IN_PROGRESS = false;
   }
   return null;
}

// Accepts either a UI control (reads .value) or a plain number. Returns
// `fallback` when neither path yields a finite value. The plain-number path
// is what PI Workflow 4's parameter-model layer relies on; the control path
// preserves backward compatibility with PI Workflow 2 / 3 call sites.
function optNumericValue(control, fallback) {
   if (typeof control === "number" && isFinite(control))
      return control;
   try {
      if (control && isFinite(control.value))
         return control.value;
   } catch (e) {}
   return fallback;
}

// Accepts either a UI control (reads .checked) or a plain boolean. Same
// rationale as optNumericValue: parameter-model callers pass booleans,
// legacy callers pass controls.
function optChecked(control, fallback) {
   if (typeof control === "boolean")
      return control;
   try {
      if (control)
         return control.checked === true;
   } catch (e) {}
   return fallback === true;
}

function optComboText(combo, fallback) {
   try {
      return combo.itemText(combo.currentItem);
   } catch (e) {
   }
   return fallback || "";
}

function optRunPixelMath(view, expression, expression1, expression2) {
   if (!optSafeView(view) || typeof PixelMath === "undefined")
      return false;
   var pm = new PixelMath();
   pm.useSingleExpression = !(expression1 || expression2);
   pm.expression = expression || "$T";
   if (expression1)
      pm.expression1 = expression1;
   if (expression2)
      pm.expression2 = expression2;
   try { pm.rescale = true; } catch (e0) {}
   try { pm.truncate = true; } catch (e1) {}
   return pm.executeOn(view);
}

function optCaptureOpenWindowIdMap() {
   var map = {};
   try {
      var windows = ImageWindow.windows;
      for (var i = 0; i < windows.length; ++i) {
         var win = windows[i];
         if (win != null && !win.isNull && win.mainView != null && !win.mainView.isNull)
            map[win.mainView.id] = true;
      }
   } catch (e) {}
   return map;
}

function optMapHasTrueValue(map, key) {
   try {
      return optHasOwn(map, key) && map[key] === true;
   } catch (e) {}
   return false;
}

function optCloseAuxiliaryProcessWindows(beforeMap, protectedIds, processTag) {
   if (!beforeMap)
      beforeMap = {};
   if (!protectedIds)
      protectedIds = {};
   try { optProcessEvents(); } catch (e0) {}
   var windows = ImageWindow.windows;
   var closedIds = [];
   for (var i = windows.length - 1; i >= 0; --i) {
      var win = windows[i];
      if (win == null || win.isNull || win.mainView == null || win.mainView.isNull)
         continue;
      var id = win.mainView.id;
      if (optHasOwn(beforeMap, id) && beforeMap[id] === true)
         continue;
      if (optHasOwn(protectedIds, id) && protectedIds[id] === true)
         continue;
      closedIds.push(id);
      try { win.hide(); } catch (e1) {}
      try { win.forceClose(); } catch (e2) {}
   }
   if (closedIds.length > 0)
      console.writeln("=> Closed " + closedIds.length + " auxiliary " + processTag + " window(s): " + closedIds.join(", "));
}

function optProcessValuesEquivalent(a, b) {
   try {
      if (typeof b === "boolean")
         return !!a === !!b;
   } catch (e0) {}
   try {
      var na = parseFloat(a);
      var nb = parseFloat(b);
      if (isFinite(na) && isFinite(nb))
         return Math.abs(na - nb) <= 1.5e-12;
   } catch (e1) {}
   try {
      return String(a) === String(b);
   } catch (e2) {}
   return a === b;
}

function optReadProcessParameterValue(P, parameterId) {
   try {
      if (typeof P.parameterValue === "function")
         return P.parameterValue(parameterId);
   } catch (e0) {}
   try {
      if (typeof P.ParameterValue === "function")
         return P.ParameterValue(parameterId);
   } catch (e1) {}
   return undefined;
}

function optExpandProcessPropertyNames(propertyNames) {
   var out = [];
   function add(name) {
      if (!name || name.length === 0)
         return;
      for (var k = 0; k < out.length; ++k)
         if (out[k] === name)
            return;
      out.push(name);
   }
   for (var i = 0; i < propertyNames.length; ++i) {
      var base = propertyNames[i];
      add(base);
      if (!base)
         continue;
      var camel = base.replace(/[\s\-]+/g, "");
      add(camel);
      if (camel.length > 0) {
         add(camel.charAt(0).toLowerCase() + camel.substr(1));
         add(camel.charAt(0).toUpperCase() + camel.substr(1));
      }
      var snake = base.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[\s\-]+/g, "_");
      add(snake);
      add(snake.toLowerCase());
      if (snake.length > 0)
         add(snake.charAt(0).toUpperCase() + snake.substr(1));
      var compact = base.replace(/[\s_\-]/g, "");
      add(compact);
      if (compact.length > 0) {
         add(compact.charAt(0).toLowerCase() + compact.substr(1));
         add(compact.charAt(0).toUpperCase() + compact.substr(1));
      }
   }
   return out;
}

function optTrySetProcessParameter(P, parameterId, value) {
   var hasOfficialSetter = false;
   var hadDirectProperty = false;
   var previousDirectValue = undefined;
   try {
      hadDirectProperty = (typeof P[parameterId] !== "undefined");
      if (hadDirectProperty)
         previousDirectValue = P[parameterId];
   } catch (e0) {}
   try {
      if (typeof P.setParameterValue === "function") {
         hasOfficialSetter = true;
         try {
            var r1 = P.setParameterValue(value, parameterId);
            if (r1 === true)
               return true;
            var pv1 = optReadProcessParameterValue(P, parameterId);
            if (pv1 !== undefined && optProcessValuesEquivalent(pv1, value))
               return true;
         } catch (e1) {}
         try {
            var r2 = P.setParameterValue(parameterId, value);
            if (r2 === true)
               return true;
            var pv2 = optReadProcessParameterValue(P, parameterId);
            if (pv2 !== undefined && optProcessValuesEquivalent(pv2, value))
               return true;
         } catch (e2) {}
      }
   } catch (e3) {}
   try {
      if (typeof P.SetParameterValue === "function") {
         hasOfficialSetter = true;
         try {
            var r3 = P.SetParameterValue(value, parameterId);
            if (r3 === true)
               return true;
            var pv3 = optReadProcessParameterValue(P, parameterId);
            if (pv3 !== undefined && optProcessValuesEquivalent(pv3, value))
               return true;
         } catch (e4) {}
         try {
            var r4 = P.SetParameterValue(parameterId, value);
            if (r4 === true)
               return true;
            var pv4 = optReadProcessParameterValue(P, parameterId);
            if (pv4 !== undefined && optProcessValuesEquivalent(pv4, value))
               return true;
         } catch (e5) {}
      }
   } catch (e6) {}
   try {
      P[parameterId] = value;
      var pv = optReadProcessParameterValue(P, parameterId);
      if (pv !== undefined)
         return optProcessValuesEquivalent(pv, value);
      if (!hasOfficialSetter && hadDirectProperty && typeof P[parameterId] !== "undefined")
         return optProcessValuesEquivalent(P[parameterId], value);
      if (!hadDirectProperty) {
         try { delete P[parameterId]; } catch (ed) {}
      } else {
         try { P[parameterId] = previousDirectValue; } catch (er) {}
      }
   } catch (e7) {}
   return false;
}

function optSetRequiredProcessProperty(P, propertyNames, value, what) {
   var names = optExpandProcessPropertyNames(propertyNames);
   for (var i = 0; i < names.length; ++i)
      if (optTrySetProcessParameter(P, names[i], value))
         return names[i];
   throw new Error("The required parameter '" + what + "' could not be assigned on process " + P.processId() + ". Tried candidates: " + names.join(", "));
}

function optSetOptionalProcessProperty(P, propertyNames, value) {
   var names = optExpandProcessPropertyNames(propertyNames);
   for (var i = 0; i < names.length; ++i)
      if (optTrySetProcessParameter(P, names[i], value))
         return names[i];
   return null;
}

function optTrySetProcessPropertySilently(P, propertyNames, value) {
   var names = optExpandProcessPropertyNames(propertyNames);
   for (var i = 0; i < names.length; ++i)
      if (optTrySetProcessParameter(P, names[i], value))
         return names[i];
   return null;
}

function optExtractGrayChannelView(sourceView, channelIndex, baseId) {
   if (!optSafeView(sourceView))
      return null;
   var w = sourceView.image.width;
   var h = sourceView.image.height;
   var outWin = optCreateWindowLike(sourceView, baseId || "Channel", 1, false);
   if (!outWin || outWin.isNull)
      return null;
   var srcImg = sourceView.image;
   var gray = new Image(w, h, 1, ColorSpace_Gray, 32, SampleType_Real);
   srcImg.selectedChannel = channelIndex;
   gray.selectedChannel = 0;
   gray.apply(srcImg, ImageOp_Mov);
   srcImg.resetSelections();
   gray.resetSelections();
   outWin.mainView.beginProcess(UndoFlag_NoSwapFile);
   outWin.mainView.image.assign(gray);
   outWin.mainView.endProcess();
   gray.free();
   optCopyMetadata(outWin, sourceView);
   try { outWin.hide(); } catch (e0) {}
   return outWin.mainView;
}

function optGetProcessIconInstance(iconId, expectedProcessId, quiet) {
   try {
      var P = ProcessInstance.fromIcon(iconId);
      if (P != null && !P.isNull && typeof P.processId === "function") {
         var pid = P.processId();
         if (pid === expectedProcessId)
            return P;
         if (quiet !== true)
            console.warningln("=> The icon '" + iconId + "' exists, but belongs to process '" + pid + "' instead of '" + expectedProcessId + "'.");
      }
   } catch (e) {
      if (quiet !== true)
         console.warningln("=> Could not load process icon '" + iconId + "': " + e.message);
   }
   return null;
}

function optSuppressSPFCAuxiliaryOutputs(spfc) {
   if (!spfc)
      return;
   optSetOptionalProcessProperty(spfc, ["showFluxGraph", "showOrderedFluxGraph", "showFluxCalibrationFunction", "showFluxCalibrationFunctions", "showFluxCalibrationFunctionGraph", "showFluxCalibrationFunctionGraphs", "showPlot", "showPlots", "showGraphs", "showGraph", "generatePlot", "generatePlots", "generateGraph", "generateGraphs", "generateFluxCalibrationFunction", "generateFluxCalibrationFunctions"], false);
}

function optSuppressSPCCAuxiliaryOutputs(spcc) {
   if (!spcc)
      return;
   optSetOptionalProcessProperty(spcc, ["showWhiteBalanceFunction", "showWhiteBalanceFunctions", "showWhiteBalanceFunctionGraph", "showWhiteBalanceFunctionGraphs", "showBackgroundNeutralizationFunction", "showBackgroundNeutralizationFunctions", "showPlot", "showPlots", "showGraphs", "showGraph", "generatePlot", "generatePlots", "generateGraph", "generateGraphs", "generateWhiteBalanceFunction", "generateWhiteBalanceFunctions", "generateBackgroundNeutralizationFunction", "generateBackgroundNeutralizationFunctions"], false);
}

function optHasSPFCScaleFactors(view) {
   var sf = optSafeViewProperty(view, "PCL:SPFC:ScaleFactors");
   if (sf == null || sf === undefined)
      return false;
   try {
      if (typeof sf === "number")
         return isFinite(sf);
      if (typeof sf.length !== "undefined")
         return sf.length >= 1;
      var ss = sf.toString();
      return ss != null && ss.length > 0 && ss.indexOf("null") < 0;
   } catch (e) {}
   return true;
}

function optIsAutoDBEAvailable() {
   // AUTODBE-AVAIL-FIX (v138): AutoDBE (SetiAstro) is now run as a Script
   // process, so the script file simply existing in the install tree is
   // sufficient. The legacy global-runtime check stays as a fast path. We no
   // longer require optEnsureAutoDBESupportLoaded()'s global capture, which can
   // never succeed under the V8 runtime (AutoDBE.js's top-level let/function do
   // not leak to the script global) and was the cause of the greyed-out button.
   if (optHasAutoDBERuntime())
      return true;
   var adbePath = optResolveAutoDBEScriptPath();
   if (adbePath && adbePath.length > 0)
      return true;
   return optEnsureAutoDBESupportLoaded();
}

function optApplyFallbackTransform(view, family, strength) {
   var s = Math.max(0, Math.min(1, isFinite(strength) ? strength : 0.15));
   if (family === "stretch") {
      var gamma = Math.max(0.25, 1.0 - 0.55 * s);
      optRunPixelMath(view, "min(max(pow(max($T,0)," + gamma.toFixed(4) + "),0),1)");
      return view;
   }
   if (family === "darken") {
      optRunPixelMath(view, "min(max($T*" + (1.0 - 0.08 * s).toFixed(4) + ",0),1)");
      return view;
   }
   if (family === "contrast") {
      optRunPixelMath(view, "min(max(($T-0.5)*" + (1.0 + 0.18 * s).toFixed(4) + "+0.5,0),1)");
      return view;
   }
   if (family === "lift") {
      optRunPixelMath(view, "min(max($T*" + (1.0 + 0.12 * s).toFixed(4) + "+" + (0.01 * s).toFixed(4) + ",0),1)");
      return view;
   }
   optRunPixelMath(view, "min(max($T,0),1)");
   return view;
}

function optClamp01(v) {
   var x = isFinite(v) ? v : 0.0;
   return Math.max(0.0, Math.min(1.0, x));
}

function optShortestHueDeltaDegrees(fromDeg, toDeg) {
   var d = ((toDeg - fromDeg + 540.0) % 360.0) - 180.0;
   return d;
}

function optHsvToRgb(h, s, v) {
   h = ((h % 1.0) + 1.0) % 1.0;
   s = optClamp01(s);
   v = optClamp01(v);
   var i = Math.floor(h * 6.0);
   var f = h * 6.0 - i;
   var p = v * (1.0 - s);
   var q = v * (1.0 - f * s);
   var t = v * (1.0 - (1.0 - f) * s);
   switch (i % 6) {
   case 0: return { r: v, g: t, b: p };
   case 1: return { r: q, g: v, b: p };
   case 2: return { r: p, g: v, b: t };
   case 3: return { r: p, g: q, b: v };
   case 4: return { r: t, g: p, b: v };
   default: return { r: v, g: p, b: q };
   }
}

function optGenerateHueWheelBitmap(size, innerRatio, northZero) {
   var sz = Math.max(32, Math.round(size || 160));
   var img = new Image(sz, sz, 3, ColorSpace_RGB, 32, SampleType_Real);
   var cx = (sz - 1) * 0.5;
   var cy = (sz - 1) * 0.5;
   var outer = Math.max(1.0, sz * 0.5 - 1.0);
   var inner = Math.max(0.0, Math.min(0.95, innerRatio || 0.0)) * outer;
   try {
      // PERF-V8 (Tier 1.1): fill three flat Float32Array buffers and write them
      // with one Image.setSamples() per channel, instead of ~77k per-pixel
      // setSample() calls (sz=160 -> 25600 px x 3). Result is pixel-identical.
      var n = sz * sz;
      var rBuf = new Float32Array(n);
      var gBuf = new Float32Array(n);
      var bBuf = new Float32Array(n);
      var idx = 0;
      var invSpan = 1.0 / Math.max(1.0e-6, outer - inner);
      for (var y = 0; y < sz; ++y) {
         for (var x = 0; x < sz; ++x, ++idx) {
            var dx = x - cx;
            var dy = y - cy;
            var r = Math.sqrt(dx * dx + dy * dy);
            if (r > outer || r < inner) {
               rBuf[idx] = 0.06; gBuf[idx] = 0.06; bBuf[idx] = 0.07;
               continue;
            }
            var hue = (northZero === true ? Math.atan2(dx, -dy) : Math.atan2(dy, dx)) / (2.0 * Math.PI);
            if (hue < 0.0)
               hue += 1.0;
            var sat = optClamp01((r - inner) * invSpan);
            var rgb = optHsvToRgb(hue, sat, 1.0);
            rBuf[idx] = rgb.r; gBuf[idx] = rgb.g; bBuf[idx] = rgb.b;
         }
      }
      var rect = new Rect(0, 0, sz, sz);
      img.setSamples(rBuf, rect, 0);
      img.setSamples(gBuf, rect, 1);
      img.setSamples(bBuf, rect, 2);
      return img.render();
   } finally {
      try { img.free(); } catch (e0) {}
   }
}

function optComputeViewMeanHueSat(view, maxSamples) {
   if (!optSafeView(view) || view.image.numberOfChannels < 3)
      return { hueDeg: 0.0, sat: 0.0 };
   var img = view.image;
   var step = Math.max(1, Math.ceil(Math.sqrt((img.width * img.height) / Math.max(128, maxSamples || 4096))));
   var sumSin = 0.0, sumCos = 0.0, sumSat = 0.0, sumWeight = 0.0;
   for (var y = 0; y < img.height; y += step) {
      for (var x = 0; x < img.width; x += step) {
         var hs = optPostHueSatFromRgb(img.sample(x, y, 0), img.sample(x, y, 1), img.sample(x, y, 2));
         var w = Math.max(0.02, hs.sat);
         var a = hs.hue * 2.0 * Math.PI;
         sumSin += Math.sin(a) * w;
         sumCos += Math.cos(a) * w;
         sumSat += hs.sat * w;
         sumWeight += w;
      }
   }
   if (sumWeight <= 0.0)
      return { hueDeg: 0.0, sat: 0.0 };
   var hue = Math.atan2(sumSin / sumWeight, sumCos / sumWeight) * 180.0 / Math.PI;
   if (hue < 0.0)
      hue += 360.0;
   return { hueDeg: hue, sat: optClamp01(sumSat / sumWeight) };
}

// Histogram cache (#2): keyed on view.id + dimensions + bins. Invalidated by
// OptImageStore.setView when a record's view is replaced. Stale entries waste
// only a few KB each (5 × bins × 8B) and are bounded by the number of unique
// view ids touched by Stretch/Post curves and CC slot histograms.
var OPT_HISTOGRAM_CACHE = {};

function optHistogramCacheKey(view, bins) {
   var img = view.image;
   return view.id + ":" + img.width + "x" + img.height + ":c" + img.numberOfChannels + ":b" + bins;
}

function optInvalidateHistogramCache(viewId) {
   if (!viewId) return;
   var prefix = viewId + ":";
   var keys = [];
   for (var k in OPT_HISTOGRAM_CACHE)
      if (optHasOwn(OPT_HISTOGRAM_CACHE, k) && k.substr(0, prefix.length) === prefix)
         keys.push(k);
   for (var i = 0; i < keys.length; ++i)
      delete OPT_HISTOGRAM_CACHE[keys[i]];
}

function optClearHistogramCache() {
   OPT_HISTOGRAM_CACHE = {};
}

// Bulk-read histogram (#2): replaces the per-pixel img.sample() loop with
// img.getSamples() in horizontal bands (~1Mpix per band, ~4MB Float32Array
// each). Iterates the whole image instead of subsampling — the bulk read is
// fast enough that we no longer need the step-based subsample of the JS path.
function optComputeHistogramDataForView(view, binsParam) {
   if (!optSafeView(view))
      return null;
   var img = view.image;
   var W = img.width;
   var H = img.height;
   var bins = binsParam || 256;
   var binMax = bins - 1;
   var isRGB = img.numberOfChannels >= 3;
   var R = []; var G = []; var B = []; var K = []; var S = [];
   for (var i = 0; i < bins; ++i) {
      R[i] = 0; G[i] = 0; B[i] = 0; K[i] = 0; S[i] = 0;
   }
   var maxBandPixels = 1024 * 1024; // ~4 MB Float32Array per channel band
   var bandRows = Math.max(1, Math.min(H, Math.floor(maxBandPixels / Math.max(1, W))));
   var bandPixels = W * bandRows;
   var bufR = new Float32Array(bandPixels);
   var bufG = isRGB ? new Float32Array(bandPixels) : null;
   var bufB = isRGB ? new Float32Array(bandPixels) : null;
   for (var y0 = 0; y0 < H; y0 += bandRows) {
      var rows = Math.min(bandRows, H - y0);
      var n = W * rows;
      var rect = new Rect(0, y0, W, y0 + rows);
      try {
         img.getSamples(bufR, rect, 0);
         if (isRGB) {
            img.getSamples(bufG, rect, 1);
            img.getSamples(bufB, rect, 2);
         }
      } catch (eGS) {
         return null;
      }
      for (var p = 0; p < n; ++p) {
         var r = bufR[p]; if (r < 0) r = 0; else if (r > 1) r = 1;
         var rb = (r * binMax) | 0;
         R[rb]++;
         if (isRGB) {
            var g = bufG[p]; if (g < 0) g = 0; else if (g > 1) g = 1;
            var b = bufB[p]; if (b < 0) b = 0; else if (b > 1) b = 1;
            G[(g * binMax) | 0]++;
            B[(b * binMax) | 0]++;
            var lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            if (lum > 1) lum = 1;
            K[(lum * binMax) | 0]++;
            var mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
            var mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
            var sat = mx > 0 ? (mx - mn) / mx : 0;
            S[(sat * binMax) | 0]++;
         } else {
            G[rb]++;
            B[rb]++;
            K[rb]++;
            S[0]++;
         }
      }
   }
   return { bins: bins, isRGB: isRGB, R: R, G: G, B: B, K: K, S: S };
}

// Cached wrapper: callers should normally use this; falls back to direct
// computation if cache key derivation fails.
function optGetCachedHistogram(view, binsParam) {
   if (!optSafeView(view))
      return null;
   var bins = binsParam || 256;
   var key = null;
   try { key = optHistogramCacheKey(view, bins); } catch (eK) { key = null; }
   if (key && optHasOwn(OPT_HISTOGRAM_CACHE, key))
      return OPT_HISTOGRAM_CACHE[key];
   var hist = optComputeHistogramDataForView(view, bins);
   if (hist && key)
      OPT_HISTOGRAM_CACHE[key] = hist;
   return hist;
}

function optDependencySeverityRank(severity) {
   if (severity === "error")
      return 3;
   if (severity === "warn")
      return 2;
   return 1;
}

function optDependencyStatus(id, label, group, severity, summary, detail) {
   return {
      id: id || "",
      label: label || "",
      group: group || "",
      severity: severity || "ok",
      summary: summary || "",
      detail: detail || ""
   };
}

// Process-class existence is stable for the whole session (installing a process
// module needs a PixInsight restart), so memoize it. This is queried ~15x on every
// availability refresh / tab change, and the miss path hits a slow eval() fallback.
var OPT_DEP_EXISTS_CACHE = {};
function optDependencyProcessExists(processName) {
   if (optHasOwn(OPT_DEP_EXISTS_CACHE, processName))
      return OPT_DEP_EXISTS_CACHE[processName];
   var exists = false;
   try {
      exists = (typeof this[processName] === "function");
   } catch (e0) {
      try {
         exists = eval("typeof " + processName + " === 'function'");
      } catch (e1) {
         exists = false;
      }
   }
   OPT_DEP_EXISTS_CACHE[processName] = exists;
   return exists;
}

function optGetProcessIconInstanceSilent(iconId, expectedProcessId) {
   try {
      var P = ProcessInstance.fromIcon(iconId);
      if (P != null && !P.isNull && typeof P.processId === "function") {
         var pid = P.processId();
         if (!expectedProcessId || pid === expectedProcessId)
            return P;
      }
   } catch (e) {
   }
   return null;
}

function optDependencyCheckRuntime(def) {
   if (typeof def.runtime === "function" && def.runtime())
      return optDependencyStatus(def.id, def.label, def.group, "ok", def.okSummary || "Runtime available.", def.okDetail || "");
   return optDependencyStatus(def.id, def.label, def.group, def.missingSeverity || "error", def.missingSummary || "Runtime incomplete.", def.missingDetail || "");
}

function optDependencyCheckProcess(def) {
   var processName = def.processName || def.label;
   if (optDependencyProcessExists(processName))
      return optDependencyStatus(def.id, def.label, def.group, "ok", def.okSummary || "Process available.", def.okDetail || (processName + " is installed in the running PixInsight build."));
   return optDependencyStatus(def.id, def.label, def.group, def.missingSeverity || "warn", def.missingSummary || "Process not installed.", def.missingDetail || (processName + " is not available as a scriptable process in the running PixInsight build."));
}

function optDependencyCheckProcessIcon(def) {
   var processStatus = optDependencyCheckProcess(def);
   if (processStatus.severity !== "ok")
      return processStatus;
   var P = optGetProcessIconInstanceSilent(def.iconId, def.processName);
   if (P)
      return optDependencyStatus(def.id, def.label, def.group, "ok", def.iconOkSummary || "Icon found.", def.iconOkDetail || ("Icon '" + def.iconId + "' exists and belongs to " + def.processName + "."));
   return optDependencyStatus(def.id, def.label, def.group, def.iconMissingSeverity || "warn", def.iconMissingSummary || "Icon missing.", def.iconMissingDetail || ("No process icon '" + def.iconId + "' is configured for " + def.processName + "."));
}

function optDependencyCheckScript(def) {
   var loaded = false;
   try {
      loaded = (typeof def.runtime === "function" && def.runtime());
   } catch (e0) {
      loaded = false;
   }
   if (loaded)
      return optDependencyStatus(def.id, def.label, def.group, "ok", def.loadedSummary || "Script loaded.", def.loadedDetail || (def.label + " is already available in the PixInsight runtime."));
   var path = "";
   try {
      path = optFindFirstExistingCandidatePath(typeof def.paths === "function" ? def.paths() : (def.paths || []));
   } catch (e1) {
      path = "";
   }
   if (path && path.length > 0)
      return optDependencyStatus(def.id, def.label, def.group, "ok", def.installedSummary || "Script installed.", (def.installedDetail || (def.label + " exists in the script tree of the running PixInsight installation: ")) + path + ".");
   return optDependencyStatus(def.id, def.label, def.group, def.missingSeverity || "warn", def.missingSummary || "Script not installed.", def.missingDetail || (def.label + " was not found in the script tree of the running PixInsight installation."));
}

function optDependencyCheckExternalRuntime(def) {
   if (typeof def.runtime === "function" && def.runtime())
      return optDependencyStatus(def.id, def.label, def.group, "ok", def.okSummary || "Runtime available.", def.okDetail || "");
   return optDependencyStatus(def.id, def.label, def.group, def.missingSeverity || "warn", def.missingSummary || "Runtime not available.", def.missingDetail || "");
}

// New dependencies should be added here through the common check helpers.
// Process checks mean scriptable process constructors in the running PI build.
// Script checks mean files under src/scripts of the running PI installation.
function optDependencyChecksRegistry() {
   return [
      {
         id: "adp_solver",
         label: "AdP / ImageSolver",
         group: "Core",
         check: function() {
            return optDependencyCheckRuntime({
               id: "adp_solver",
               label: "AdP / ImageSolver",
               group: "Core",
               runtime: optHasAdpSolverRuntime,
               okSummary: "Runtime loaded.",
               okDetail: "ImageSolver and AstrometricMetadata (V8 astrometry) are available.",
               missingSeverity: "error",
               missingSummary: "Runtime incomplete.",
               missingDetail: "Part of the AdP stack required for Plate Solving and SPCC is missing."
            });
         }
      },
      {
         id: "spfc_icon",
         label: "SPFC icon",
         group: "Pre",
         check: function() {
            return optDependencyCheckProcessIcon({
               id: "spfc_icon",
               label: "SPFC icon",
               group: "Pre",
               processName: "SpectrophotometricFluxCalibration",
               iconId: "SPFC",
               missingSeverity: "error",
               missingSummary: "Process not installed.",
               missingDetail: "SpectrophotometricFluxCalibration is not available as a scriptable process in the running PixInsight build.",
               iconOkDetail: "The 'SPFC' icon exists. The Gaia/QE/filters path will be validated when SPFC runs.",
               iconMissingDetail: "MGC needs a real 'SPFC' icon configured with Gaia/QE/filters."
            });
         }
      },
      {
         id: "mgc_icon",
         label: "MGC icon",
         group: "Pre",
         check: function() {
            return optDependencyCheckProcessIcon({
               id: "mgc_icon",
               label: "MGC icon",
               group: "Pre",
               processName: "MultiscaleGradientCorrection",
               iconId: "MGC",
               missingSeverity: "error",
               missingSummary: "Process not installed.",
               missingDetail: "MultiscaleGradientCorrection is not available as a scriptable process in the running PixInsight build.",
               iconOkDetail: "The 'MGC' icon exists. The MARS/.xmars reference will be validated when MGC runs.",
               iconMissingDetail: "MGC needs an 'MGC' icon configured with its MARS/.xmars reference or a reference image."
            });
         }
      },
      {
         id: "spcc",
         label: "SPCC",
         group: "Pre",
         check: function() {
            return optDependencyCheckProcess({
               id: "spcc",
               label: "SPCC",
               group: "Pre",
               processName: "SpectrophotometricColorCalibration",
               missingSeverity: "error"
            });
         }
      },
      {
         id: "abe",
         label: "ABE",
         group: "Pre",
         check: function() {
            return optDependencyCheckProcess({
               id: "abe",
               label: "ABE",
               group: "Pre",
               processName: "AutomaticBackgroundExtractor",
               missingSeverity: "error"
            });
         }
      },
      {
         id: "autodbe",
         label: "AutoDBE",
         group: "Pre",
         check: function() {
            return optDependencyCheckScript({
               id: "autodbe",
               label: "AutoDBE",
               group: "Pre",
               runtime: optHasAutoDBERuntime,
               paths: optAutoDBECandidatePaths,
               installedDetail: "AutoDBE exists in the script tree of the running PixInsight installation: ",
               missingDetail: "AutoDBE was not found in the script tree of the running PixInsight installation."
            });
         }
      },
      {
         id: "graxpert",
         label: "GraXpert",
         group: "Pre",
         check: function() {
            var info = optGetGraXpertSupportInfo();
            if (info.mode === "process")
               return optDependencyStatus("graxpert", "GraXpert", "Pre/Post", "ok", "Native process available.", "GraXpert is available as a native PixInsight process; Opt_6d uses it for Background Extraction and GraXpert Denoise.");
            if (info.scriptLoaded)
               return optDependencyStatus("graxpert", "GraXpert", "Pre/Post", "warn", "Legacy toolbox loaded.", "GraXpertLib is available for the Background Extraction fallback, but GraXpert Denoise requires the native process in Process > Etc.");
            return optDependencyCheckScript({
               id: "graxpert",
               label: "GraXpert",
               group: "Pre",
               runtime: function() { return typeof GraXpertLib !== "undefined"; },
               paths: optGraXpertLibCandidatePaths,
               installedSummary: "Toolbox installed.",
               installedDetail: "GraXpertLib exists in the script tree of the running PixInsight installation: ",
               missingSummary: "Toolbox not installed.",
               missingDetail: "Neither GraXpertLib in the script tree nor GraXpert as a native process was found in the running PixInsight installation."
            });
         }
      },
      {
         id: "blurx",
         label: "BlurXTerminator",
         group: "Pre",
         check: function() {
            return optDependencyCheckProcess({
               id: "blurx",
               label: "BlurXTerminator",
               group: "Pre",
               processName: "BlurXTerminator",
               missingSeverity: "warn",
               missingDetail: "BlurXTerminator is not available as a scriptable process in the running PixInsight build."
            });
         }
      },
      {
         id: "cosmic_clarity",
         label: "Cosmic Clarity",
         group: "Pre",
         check: function() {
            return optDependencyCheckExternalRuntime({
               id: "cosmic_clarity",
               label: "Cosmic Clarity",
               group: "Pre",
               runtime: optIsCosmicClarityAvailable,
               okSummary: "Launcher available.",
               okDetail: "ExternalProcess is available. Cosmic Clarity uses an external executable, not a process/script installed inside PixInsight; the executable will be validated when it runs.",
               missingSummary: "Launcher not available.",
               missingDetail: "ExternalProcess is not available in this PixInsight build."
            });
         }
      },
      {
         id: "starx",
         label: "StarXTerminator",
         group: "Stretch",
         check: function() {
            return optDependencyCheckProcess({
               id: "starx",
               label: "StarXTerminator",
               group: "Stretch",
               processName: "StarXTerminator",
               missingSeverity: "warn",
               missingDetail: "StarXTerminator is not available as a scriptable process in the running PixInsight build. The Stars/Starless split can run with StarNet2 if installed, or falls back to the structural method."
            });
         }
      },
      {
         id: "starnet2",
         label: "StarNet2",
         group: "Stretch",
         check: function() {
            return optDependencyCheckProcess({
               id: "starnet2",
               label: "StarNet2",
               group: "Stretch",
               processName: "StarNet2",
               missingSeverity: "warn",
               missingDetail: "StarNet2 is not available. It is an alternative engine for the Stars/Starless split. " +
                  "Add the official StarNet2 repositories (pixinsight.starnetastro.com and its tensorflow subfolder) " +
                  "from Resources > Updates > Manage Repositories, run Check for Updates and restart PixInsight."
            });
         }
      },
      {
         id: "mas",
         label: "Multiscale Adaptive Stretch",
         group: "Stretch",
         check: function() {
            return optDependencyCheckProcess({
               id: "mas",
               label: "Multiscale Adaptive Stretch",
               group: "Stretch",
               processName: "MultiscaleAdaptiveStretch",
               missingSeverity: "error",
               missingDetail: "MultiscaleAdaptiveStretch is not available as a scriptable process in the running PixInsight build."
            });
         }
      },
      {
         id: "noisex",
         label: "NoiseXTerminator",
         group: "Post",
         check: function() {
            return optDependencyCheckProcess({
               id: "noisex",
               label: "NoiseXTerminator",
               group: "Post",
               processName: "NoiseXTerminator",
               missingSeverity: "warn",
               missingDetail: "NoiseXTerminator is not available as a scriptable process. Post Noise Reduction will offer TGVDenoise or the structural fallback in TEST_MODE."
            });
         }
      },
      {
         id: "tgvdenoise",
         label: "TGVDenoise",
         group: "Post",
         check: function() {
            return optDependencyCheckProcess({
               id: "tgvdenoise",
               label: "TGVDenoise",
               group: "Post",
               processName: "TGVDenoise",
               missingSeverity: "warn"
            });
         }
      },
      // PRISM-INTEGRATION-BEGIN
      {
         id: "syqon_prism",
         label: "SyQon Prism Denoise",
         group: "Post",
         check: function() {
            return optDependencyCheckScript({
               id: "syqon_prism",
               label: "SyQon Prism Denoise",
               group: "Post",
               runtime: function() { return false; },
               paths: optSyQonPrismScriptCandidates,
               installedSummary: "Prism script found.",
               installedDetail: "The SyQon_Prism.js script is installed at: ",
               missingSeverity: "warn",
               missingSummary: "Prism script not installed.",
               missingDetail: "SyQon_Prism.js was not found in the PixInsight script tree. The 'Prism (SyQon)' denoise will not be available."
            });
         }
      },
      // PRISM-INTEGRATION-END
      // DEEPSNR-INTEGRATION-BEGIN
      {
         id: "deepsnr",
         label: "DeepSNR",
         group: "Post",
         check: function() {
            return optDependencyCheckProcess({
               id: "deepsnr",
               label: "DeepSNR",
               group: "Post",
               processName: "DeepSNR",
               missingSeverity: "warn",
               missingDetail: "DeepSNR is not available as a scriptable process in the PixInsight build (DeepSNR-pxm.dll in bin/)."
            });
         }
      },
      // DEEPSNR-INTEGRATION-END
      // SYQON-STARLESS-INTEGRATION-BEGIN
      {
         id: "syqon_starless",
         label: "SyQon Starless",
         group: "Stretch",
         check: function() {
            return optDependencyCheckScript({
               id: "syqon_starless",
               label: "SyQon Starless",
               group: "Stretch",
               runtime: function() { return false; },
               paths: optSyQonStarlessScriptCandidates,
               installedSummary: "SyQon Starless script found.",
               installedDetail: "The SyQon_Starless.js script is installed at: ",
               missingSeverity: "warn",
               missingSummary: "SyQon Starless script not installed.",
               missingDetail: "SyQon_Starless.js was not found in the PixInsight script tree. The 'SyQon Starless' Star Split will not be available."
            });
         }
      },
      // SYQON-STARLESS-INTEGRATION-END
      {
         id: "post_sharpen_processes",
         label: "Post sharpening processes",
         group: "Post",
         check: function() {
            var missing = [];
            var names = ["UnsharpMask", "HDRMultiscaleTransform", "LocalHistogramEqualization"];
            for (var i = 0; i < names.length; ++i)
               if (!optDependencyProcessExists(names[i]))
                  missing.push(names[i]);
            if (missing.length === 0)
               return optDependencyStatus("post_sharpen_processes", "Post sharpening processes", "Post", "ok", "Processes available.", "UnsharpMask, HDRMultiscaleTransform and LocalHistogramEqualization are available.");
            return optDependencyStatus("post_sharpen_processes", "Post sharpening processes", "Post", "warn", "Processes incomplete.", "Missing optional processes: " + missing.join(", ") + ".");
         }
      },
      {
         id: "post_curves",
         label: "CurvesTransformation",
         group: "Post",
         check: function() {
            return optDependencyCheckProcess({
               id: "post_curves",
               label: "CurvesTransformation",
               group: "Post",
               processName: "CurvesTransformation",
               missingSeverity: "error"
            });
         }
      },
      {
         id: "channel_combination",
         label: "ChannelCombination",
         group: "Channel Combination",
         check: function() {
            return optDependencyCheckProcess({
               id: "channel_combination",
               label: "ChannelCombination",
               group: "Channel Combination",
               processName: "ChannelCombination",
               missingSeverity: "error"
            });
         }
      }
   ];
}
function optRunDependencyChecks() {
   var entries = [];
   var registry = optDependencyChecksRegistry();
   var counts = { ok: 0, warn: 0, error: 0 };
   var worst = "ok";
   for (var i = 0; i < registry.length; ++i) {
      var entry = null;
      try {
         entry = registry[i].check();
      } catch (e) {
         entry = optDependencyStatus(registry[i].id, registry[i].label, registry[i].group, "error", "Chequeo fallido.", e.message || String(e));
      }
      entries.push(entry);
      counts[entry.severity] = (counts[entry.severity] || 0) + 1;
      if (optDependencySeverityRank(entry.severity) > optDependencySeverityRank(worst))
         worst = entry.severity;
   }
   return {
      generatedAt: new Date(),
      worst: worst,
      counts: counts,
      entries: entries
   };
}

function optFormatDependencyReport(report) {
   if (!report || !report.entries)
      return "No dependency report available.";
   var lines = [];
   lines.push("PI Workflow dependency check");
   lines.push("Version: " + OPT_VERSION +
      ((typeof OPT_BUILD_DATE !== "undefined") ? ("  ·  " + OPT_BUILD_DATE) : "") +
      ((typeof OPT_BUILD !== "undefined") ? ("  ·  build " + OPT_BUILD) : ""));
   lines.push("Summary: OK=" + report.counts.ok + "  WARN=" + report.counts.warn + "  ERROR=" + report.counts.error);
   var currentGroup = "";
   for (var i = 0; i < report.entries.length; ++i) {
      var e = report.entries[i];
      if (e.group !== currentGroup) {
         currentGroup = e.group;
         lines.push("");
         lines.push("[" + currentGroup + "]");
      }
      lines.push("- " + e.label + " [" + e.severity.toUpperCase() + "]: " + e.summary);
      if (e.detail && e.detail.length > 0)
         lines.push("  " + e.detail);
   }
   return lines.join("\n");
}

// LOAD-AUTOASSIGN — pure helpers for the "Load Image Files…" button: infer
// which selector slot a freshly opened image belongs to. Two sources, tried
// in order by the caller: the trailing "_<tag>" suffix of the file base name,
// then the FILTER FITS/XISF keyword. Both return one of "R","G","B","L","H",
// "O","S","HO","OS","RGB", or null when nothing recognizable is found — the
// caller must never guess a slot from an unrecognized name.
var OPT_SLOT_NAME_TAGS = {
   "HO": "HO",
   "OS": "OS", "SO": "OS",
   "HA": "H", "H": "H",
   "OIII": "O", "O3": "O", "O": "O",
   "SII": "S", "S2": "S", "S": "S",
   "R": "R", "RED": "R",
   "G": "G", "GREEN": "G",
   "B": "B", "BLUE": "B",
   "L": "L", "LUM": "L", "LUMINANCE": "L",
   "RGB": "RGB"
};

function optInferSlotFromName(fileName) {
   if (!fileName) return null;
   var base = String(fileName);
   var cut = Math.max(base.lastIndexOf("/"), base.lastIndexOf("\\"));
   if (cut >= 0) base = base.substring(cut + 1);
   var dot = base.lastIndexOf(".");
   if (dot > 0) base = base.substring(0, dot);
   var us = base.lastIndexOf("_");
   if (us < 0 || us === base.length - 1) return null;
   var tag = base.substring(us + 1).toUpperCase();
   return Object.prototype.hasOwnProperty.call(OPT_SLOT_NAME_TAGS, tag) ? OPT_SLOT_NAME_TAGS[tag] : null;
}

var OPT_SLOT_FILTER_TAGS = {
   "HA": "H", "HALPHA": "H", "H-ALPHA": "H", "H_ALPHA": "H", "H": "H",
   "OIII": "O", "O-III": "O", "O3": "O", "O": "O",
   "SII": "S", "S-II": "S", "S2": "S", "S": "S",
   "R": "R", "RED": "R",
   "G": "G", "GREEN": "G",
   "B": "B", "BLUE": "B",
   "L": "L", "LUM": "L", "LUMINANCE": "L"
};

function optInferSlotFromFilter(filterValue) {
   if (filterValue === null || filterValue === undefined) return null;
   var f = String(filterValue).replace(/['"]/g, "").replace(/^\s+|\s+$/g, "").toUpperCase();
   if (!f) return null;
   return Object.prototype.hasOwnProperty.call(OPT_SLOT_FILTER_TAGS, f) ? OPT_SLOT_FILTER_TAGS[f] : null;
}

// Reads the FILTER keyword of an ImageWindow; null when absent/unreadable.
// FITS string values may come quoted ('Ha') — optInferSlotFromFilter strips
// quotes/whitespace itself, so raw value passthrough is fine here.
function optReadFilterKeyword(window) {
   try {
      var kws = window.keywords;
      for (var i = 0; i < kws.length; ++i) {
         if (String(kws[i].name).toUpperCase() !== "FILTER") continue;
         var v = null;
         try { v = kws[i].strippedValue; } catch (eSv) {}
         if (v === null || v === undefined || v === "") { try { v = kws[i].value; } catch (eV) {} }
         return (v === null || v === undefined) ? null : String(v);
      }
   } catch (e) {}
   return null;
}

// Snapshot the dialog state needed by a Pre-tab candidate as a plain object.
// SPCC / Auto Linear Fit / Background Neutralization remain coupled to the
// dialog at execution time (the guide's known scope limit), so cfg only
// carries the gradient/decon details — the rest of the branches still pass
// `dialog` through to the existing workflows.
