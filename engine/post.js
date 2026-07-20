function optRunPostOperationWithOptionalMask(workView, dialog, useMask, operationFn) {
   if (!optSafeView(workView))
      throw new Error("No valid Post target view.");
   if (typeof operationFn !== "function")
      return workView;
   var maskInfo = optApplyMaskToProcessView(workView, dialog, useMask);
   try {
      return operationFn(workView) || workView;
   } finally {
      if (maskInfo)
         optClearProcessMask(workView, maskInfo);
   }
}

function optExecuteNoiseXConfiguredOnView(targetView, cfg) {
   if (!optSafeView(targetView))
      throw new Error("There is no valid target view to execute NoiseXTerminator.");
   if (OPT_TEST_MODE)
      return optRunTestModePreviewTransform(targetView, "darken", 0.10);
   var nxt = optCreateGenericProcessInstance(["NoiseXTerminator"], ["NXT", "NoiseXTerminator"]);
   if (!nxt)
      throw new Error("NoiseXTerminator is not installed or not available in this PixInsight build.");
   optTrySetProcessPropertySilently(nxt, ["denoise", "Denoise", "amount"], cfg.denoise);
   optTrySetProcessPropertySilently(nxt, ["iterations", "Iterations"], Math.round(cfg.iterations));
   optTrySetProcessPropertySilently(nxt, ["enable_color_separation", "enableColorSeparation", "color_separation"], cfg.enable_color_separation === true);
   optTrySetProcessPropertySilently(nxt, ["enable_frequency_separation", "enableFrequencySeparation", "frequency_separation"], cfg.enable_frequency_separation === true);
   optTrySetProcessPropertySilently(nxt, ["denoise_color", "denoiseColor"], cfg.denoise_color);
   optTrySetProcessPropertySilently(nxt, ["denoise_lf", "denoiseLF", "denoise_low_frequency"], cfg.denoise_lf);
   optTrySetProcessPropertySilently(nxt, ["denoise_lf_color", "denoiseLFColor"], cfg.denoise_lf_color);
   optTrySetProcessPropertySilently(nxt, ["frequency_scale", "frequencyScale"], cfg.frequency_scale);
   optAssertExecuteOk(nxt.executeOn(targetView), "NoiseXTerminator");
   return targetView;
}

// DEEPSNR-INTEGRATION-BEGIN
function optExecuteDeepSNROnView(targetView, cfg) {
   if (!optSafeView(targetView))
      throw new Error("There is no valid target view to execute DeepSNR.");
   if (OPT_TEST_MODE)
      return optRunTestModePreviewTransform(targetView, "darken", 0.08);
   var deepsnr = optCreateGenericProcessInstance(["DeepSNR"], ["DeepSNR"]);
   if (!deepsnr)
      throw new Error("DeepSNR is not installed or not available in this PixInsight build.");
   
   var modelVal = 2;
   if (typeof DeepSNR !== "undefined" && DeepSNR.prototype && typeof DeepSNR.prototype.v2 !== "undefined") {
      modelVal = DeepSNR.prototype.v2;
   }
   
   optTrySetProcessPropertySilently(deepsnr, ["linear"], false);
   optTrySetProcessPropertySilently(deepsnr, ["model"], modelVal);
   optTrySetProcessPropertySilently(deepsnr, ["amount"], cfg.amount);
   optTrySetProcessPropertySilently(deepsnr, ["shadows_clipping", "shadowsClipping"], -2.80);
   optTrySetProcessPropertySilently(deepsnr, ["target_background", "targetBackground"], 0.25);

   optAssertExecuteOk(deepsnr.executeOn(targetView), "DeepSNR");
   return targetView;
}
// DEEPSNR-INTEGRATION-END

function optBuildPostTgvConfigFromDialog(dlg) {
   return {
      strengthL: optNumericValue(dlg.ncPostTgvStrengthL, 5.0),
      strengthC: optNumericValue(dlg.ncPostTgvStrengthC, 3.0),
      edgeProtection: optNumericValue(dlg.ncPostTgvEdge, 0.002),
      smoothness: optNumericValue(dlg.ncPostTgvSmooth, 2.0),
      maxIterations: Math.round(optNumericValue(dlg.ncPostTgvIter, 500))
   };
}

function optExecuteTgvDenoiseConfiguredOnView(targetView, cfg) {
   if (OPT_TEST_MODE)
      return optRunTestModePreviewTransform(targetView, "darken", 0.08);
   var tgv = optCreateGenericProcessInstance(["TGVDenoise"], []);
   if (!tgv)
      throw new Error("TGVDenoise is not available in this PixInsight build.");
   optTrySetProcessPropertySilently(tgv, ["strengthL", "luminanceStrength"], cfg.strengthL);
   optTrySetProcessPropertySilently(tgv, ["strengthC", "chrominanceStrength"], cfg.strengthC);
   optTrySetProcessPropertySilently(tgv, ["edgeProtection"], cfg.edgeProtection);
   optTrySetProcessPropertySilently(tgv, ["smoothness"], cfg.smoothness);
   optTrySetProcessPropertySilently(tgv, ["maxIterations", "iterations"], cfg.maxIterations);
   tgv.executeOn(targetView);
   return targetView;
}

function optExecuteTgvDenoiseOnView(targetView, dialog) {
   return optExecuteTgvDenoiseConfiguredOnView(targetView, optBuildPostTgvConfigFromDialog(dialog));
}

function optBuildPostBlurXConfigFromControls(dlg) {
   return {
      sharpen_stars: optNumericValue(dlg.ncPostBxtStars, 0.13),
      adjust_star_halos: optNumericValue(dlg.ncPostBxtAdjustStarHalos, 0.00),
      sharpen_nonstellar: optNumericValue(dlg.ncPostBxtSharpenNonstellar, 0.34),
      automatic_psf: optChecked(dlg.chkPostBxtAutoPSF, true),
      psf_diameter: optNumericValue(dlg.ncPostBxtPSFDiameter, 4.0),
      correct_only: optChecked(dlg.chkPostBxtCorrectOnly, false),
      correct_first: false,
      nonstellar_then_stellar: false,
      luminance_only: optChecked(dlg.chkPostBxtLuminanceOnly, true)
   };
}

function optBuildPostUnsharpMaskConfigFromDialog(dlg) {
   return {
      sigma: optNumericValue(dlg.ncPostUsmSigma, 2.0),
      amount: optNumericValue(dlg.ncPostUsmAmount, 0.50),
      deringing: optChecked(dlg.chkPostUsmDeringing, false),
      deringingDark: optNumericValue(dlg.ncPostUsmDeringDark, 0.10),
      deringingBright: optNumericValue(dlg.ncPostUsmDeringBright, 0.00)
   };
}

function optExecuteUnsharpMaskConfiguredOnView(targetView, cfg) {
   if (OPT_TEST_MODE)
      return optRunTestModePreviewTransform(targetView, "contrast", 0.12);
   var usm = optCreateGenericProcessInstance(["UnsharpMask"], []);
   if (!usm)
      throw new Error("UnsharpMask is not available in this PixInsight build.");
   optTrySetProcessPropertySilently(usm, ["sigma", "stdDev"], cfg.sigma);
   optTrySetProcessPropertySilently(usm, ["amount"], cfg.amount);
   optTrySetProcessPropertySilently(usm, ["deringing"], cfg.deringing);
   optTrySetProcessPropertySilently(usm, ["deringingDark"], cfg.deringingDark);
   optTrySetProcessPropertySilently(usm, ["deringingBright"], cfg.deringingBright);
   usm.executeOn(targetView);
   return targetView;
}

function optExecuteUnsharpMaskOnView(targetView, dialog) {
   return optExecuteUnsharpMaskConfiguredOnView(targetView, optBuildPostUnsharpMaskConfigFromDialog(dialog));
}

function optBuildPostHdrMtConfigFromDialog(dlg) {
   return {
      numberOfLayers: Math.round(optNumericValue(dlg.ncPostHdrLayers, 6)),
      numberOfIterations: Math.round(optNumericValue(dlg.ncPostHdrIter, 1)),
      overdrive: optNumericValue(dlg.ncPostHdrOverdrive, 0.0),
      medianTransform: optChecked(dlg.chkPostHdrMedian, false),
      lightnessMask: optChecked(dlg.chkPostHdrLightProt, true)
   };
}

function optExecuteHdrMtConfiguredOnView(targetView, cfg) {
   if (OPT_TEST_MODE)
      return optRunTestModePreviewTransform(targetView, "contrast", 0.16);
   var hdr = optCreateGenericProcessInstance(["HDRMultiscaleTransform"], []);
   if (!hdr)
      throw new Error("HDRMultiscaleTransform is not available in this PixInsight build.");
   optTrySetProcessPropertySilently(hdr, ["numberOfLayers", "layers"], cfg.numberOfLayers);
   optTrySetProcessPropertySilently(hdr, ["numberOfIterations", "iterations"], cfg.numberOfIterations);
   optTrySetProcessPropertySilently(hdr, ["overdrive"], cfg.overdrive);
   optTrySetProcessPropertySilently(hdr, ["medianTransform"], cfg.medianTransform);
   optTrySetProcessPropertySilently(hdr, ["lightnessMask"], cfg.lightnessMask);
   hdr.executeOn(targetView);
   return targetView;
}

function optExecuteHdrMtOnView(targetView, dialog) {
   return optExecuteHdrMtConfiguredOnView(targetView, optBuildPostHdrMtConfigFromDialog(dialog));
}

function optBuildPostLheConfigFromDialog(dlg) {
   return {
      kernelRadius: Math.round(optNumericValue(dlg.ncPostLheRadius, 64)),
      contrastLimit: optNumericValue(dlg.ncPostLheSlope, 2.0),
      amount: optNumericValue(dlg.ncPostLheAmount, 0.70),
      circularKernel: optChecked(dlg.chkPostLheCircular, true)
   };
}

function optExecuteLheConfiguredOnView(targetView, cfg) {
   if (OPT_TEST_MODE)
      return optRunTestModePreviewTransform(targetView, "contrast", 0.18);
   var lhe = optCreateGenericProcessInstance(["LocalHistogramEqualization"], []);
   if (!lhe)
      throw new Error("LocalHistogramEqualization is not available in this PixInsight build.");
   optTrySetProcessPropertySilently(lhe, ["kernelRadius", "radius"], cfg.kernelRadius);
   optTrySetProcessPropertySilently(lhe, ["contrastLimit", "slopeLimit"], cfg.contrastLimit);
   optTrySetProcessPropertySilently(lhe, ["amount"], cfg.amount);
   optTrySetProcessPropertySilently(lhe, ["circularKernel"], cfg.circularKernel);
   lhe.executeOn(targetView);
   return targetView;
}

function optExecuteLheOnView(targetView, dialog) {
   return optExecuteLheConfiguredOnView(targetView, optBuildPostLheConfigFromDialog(dialog));
}

function optApplyColorBalanceFromState(view, state) {
   if (!optSafeView(view))
      throw new Error("No valid color-balance view.");
   if (view.image.numberOfChannels >= 3 &&
       state && optHasOwn(state, "meanHueDeg") && optHasOwn(state, "pointHueDeg")) {
      var shiftTurns = optShortestHueDeltaDegrees(state.meanHueDeg, state.pointHueDeg) / 360.0;
      var intensity = optClamp01(state.pointIntensity);
      var saturationFactor = optNumericValue(state.hueSaturation, 1.0);
      optApplyHueSaturationCorrectionToView(view, shiftTurns * intensity, saturationFactor);
   }
   var r = optNumericValue(state ? state.r : null, 1.0);
   var g = optNumericValue(state ? state.g : null, 1.0);
   var b = optNumericValue(state ? state.b : null, 1.0);
   if (view.image.numberOfChannels >= 3 && (Math.abs(r - 1) > 0.0001 || Math.abs(g - 1) > 0.0001 || Math.abs(b - 1) > 0.0001)) {
      var pm = new PixelMath();
      pm.useSingleExpression = false;
      pm.expression = "min(max($T[0]*" + r.toFixed(6) + ",0),1)";
      pm.expression1 = "min(max($T[1]*" + g.toFixed(6) + ",0),1)";
      pm.expression2 = "min(max($T[2]*" + b.toFixed(6) + ",0),1)";
      pm.createNewImage = false;
      pm.showNewImage = false;
      pm.executeOn(view);
   }
   if (view.image.numberOfChannels >= 3 && Math.abs(optNumericValue(state ? state.saturation : null, 1.0) - 1.0) > 0.0001) {
      var cs = new ColorSaturation();
      var sat = optNumericValue(state ? state.saturation : null, 1.0);
      cs.HS = [[0.00000, 0.50 * sat], [0.50000, 0.85 * sat], [1.00000, 0.50 * sat]];
      cs.HSt = ColorSaturation.prototype.AkimaSubsplines;
      cs.executeOn(view);
   }
   if (view.image.numberOfChannels >= 3 && optChecked(state ? state.scnr : null, false)) {
      var scnr = new SCNR();
      scnr.amount = optNumericValue(state ? state.scnrAmount : null, 0.60);
      scnr.protectionMethod = SCNR.prototype.AverageNeutral;
      scnr.colorToRemove = SCNR.prototype.Green;
      scnr.preserveLightness = true;
      scnr.executeOn(view);
   }
   return view;
}

function optApplyPostColorBalance(view, dialog) {
   return optApplyColorBalanceFromState(view, {
      meanHueDeg: dialog.postBalanceMeanHueDeg,
      pointHueDeg: dialog.postBalancePointHueDeg,
      pointIntensity: dialog.postBalancePointIntensity,
      hueSaturation: dialog.ncPostColorBalanceSaturation,
      r: dialog.ncPostBalanceR,
      g: dialog.ncPostBalanceG,
      b: dialog.ncPostBalanceB,
      saturation: dialog.ncPostBalanceSat,
      scnr: dialog.chkPostBalanceSCNR,
      scnrAmount: dialog.ncPostBalanceSCNR
   });
}

// Colorize a greyscale-converted-to-RGB view with a specific hue and saturation.
// Used in Channel Combination when the source slot is a mono image (e.g. H-alpha).
// A plain hue shift cannot work on mono because saturation starts at 0 in HSI space
// (all channels equal → no chroma), so any multiplier still gives 0.
// This function bypasses the existing saturation: it sets H to a constant, S to
// `saturation * sqrt(I)` (bright areas get more chroma — looks natural), and keeps I.
function optColorizeMono(view, hueDeg, saturation) {
   if (!optSafeView(view) || view.image.numberOfChannels < 3)
      return view;
   var hue = (((isFinite(hueDeg) ? hueDeg : 0) % 360.0) + 360.0) % 360.0 / 360.0;
   var sat = Math.max(0.0, Math.min(1.0, isFinite(saturation) ? saturation : 0.5));
   var iView = null, hView = null, sView = null;
   try {
      iView = optCreateGrayExpressionView(view, "I(" + view.id + ")", "Opt_Col_I");
      hView = optCreateGrayExpressionView(view, hue.toFixed(10), "Opt_Col_H");
      sView = optCreateGrayExpressionView(view, sat.toFixed(10) + "*sqrt(I(" + view.id + "))", "Opt_Col_S");
      var cc = new ChannelCombination();
      cc.colorSpace = ChannelCombination.prototype.HSI;
      cc.channels = [[true, hView.id], [true, sView.id], [true, iView.id]];
      cc.executeOn(view);
   } finally {
      optCloseView(iView);
      optCloseView(hView);
      optCloseView(sView);
   }
   return view;
}

function optApplyHueSaturationCorrectionToView(view, hueShiftTurns, saturationFactor) {
   if (!optSafeView(view) || view.image.numberOfChannels < 3)
      return view;
   var shift = Math.max(-0.25, Math.min(0.25, isFinite(hueShiftTurns) ? hueShiftTurns : 0.0));
   var sat = Math.max(0.0, Math.min(4.0, isFinite(saturationFactor) ? saturationFactor : 1.0));
   if (Math.abs(shift) <= 1.0e-6 && Math.abs(sat - 1.0) <= 0.001)
      return view;
   var hView = null, sView = null, iView = null;
   try {
      var shifted = "(H(" + view.id + ")+" + shift.toFixed(10) + ")";
      hView = optCreateGrayExpressionView(view, "(" + shifted + "-floor(" + shifted + "))", "Opt_CB_H");
      sView = optCreateGrayExpressionView(view, "max(0,min(1," + sat.toFixed(10) + "*Si(" + view.id + ")))", "Opt_CB_S");
      iView = optCreateGrayExpressionView(view, "I(" + view.id + ")", "Opt_CB_I");
      var cc = new ChannelCombination();
      cc.colorSpace = ChannelCombination.prototype.HSI;
      cc.channels = [[true, hView.id], [true, sView.id], [true, iView.id]];
      cc.executeOn(view);
   } finally {
      optCloseView(hView);
      optCloseView(sView);
      optCloseView(iView);
   }
   return view;
}

function optPostCurvePoints(dialog) {
   var contrast = optNumericValue(dialog.ncPostCurvesContrast, 0.0);
   var bright = optNumericValue(dialog.ncPostCurvesBright, 0.0);
   var shadows = optNumericValue(dialog.ncPostCurvesShadows, 0.0);
   var highlights = optNumericValue(dialog.ncPostCurvesHighlights, 0.0);
   function c01(v) { return Math.max(0, Math.min(1, v)); }
   return [
      [0.00, c01(shadows)],
      [0.25, c01(0.25 + bright - 0.15 * contrast + shadows * 0.5)],
      [0.50, c01(0.50 + bright)],
      [0.75, c01(0.75 + bright + 0.15 * contrast - highlights * 0.5)],
      [1.00, c01(1.00 - highlights)]
   ];
}

function optApplyCurvesFromState(view, channelIndex, pointsMap, controls) {
   var ct = new CurvesTransformation();
   var channel = isFinite(channelIndex) ? channelIndex : 0;
   var chKey = ["K", "R", "G", "B", "S"][channel] || "K";
   var pts = (pointsMap && pointsMap[chKey]) ? pointsMap[chKey] : optCurvePointsFromControls(controls);
   try { ct.K = [[0, 0], [1, 1]]; } catch (e0) {}
   try { ct.R = [[0, 0], [1, 1]]; } catch (e1) {}
   try { ct.G = [[0, 0], [1, 1]]; } catch (e2) {}
   try { ct.B = [[0, 0], [1, 1]]; } catch (e3) {}
   try { ct.S = [[0, 0], [1, 1]]; } catch (e4) {}
   if (channel === 1) ct.R = pts;
   else if (channel === 2) ct.G = pts;
   else if (channel === 3) ct.B = pts;
   else if (channel === 4) ct.S = pts;
   else ct.K = pts;
   var sat = optNumericValue(controls ? controls.saturation : null, 1.0);
   if (view.image.numberOfChannels >= 3 && Math.abs(sat - 1.0) > 0.0001)
      ct.S = [[0, 0], [0.5, Math.max(0, Math.min(1, 0.5 * sat))], [1, Math.max(0, Math.min(1, sat))]];
   ct.executeOn(view);
   return view;
}

function optCurvePointsFromControls(controls) {
   var c = optNumericValue(controls ? controls.contrast : null, 0.0);
   var b = optNumericValue(controls ? controls.brightness : null, 0.0);
   var sh = optNumericValue(controls ? controls.shadows : null, 0.0);
   var hi = optNumericValue(controls ? controls.highlights : null, 0.0);
   var p1y = optClamp01(0.25 + b + sh - c * 0.10);
   var p2y = optClamp01(0.50 + b + c * 0.18);
   var p3y = optClamp01(0.75 + b - hi + c * 0.10);
   return [[0, 0], [0.25, p1y], [0.50, p2y], [0.75, p3y], [1, 1]];
}

function optApplyPostCurves(view, dialog) {
   return optApplyCurvesFromState(view, dialog.comboPostCurvesChan ? dialog.comboPostCurvesChan.currentItem : 0, dialog.postCurvesPoints, {
      contrast: dialog.ncPostCurvesContrast,
      brightness: dialog.ncPostCurvesBright,
      shadows: dialog.ncPostCurvesShadows,
      highlights: dialog.ncPostCurvesHighlights,
      saturation: dialog.ncPostCurvesSaturation
   });
}

function optPostCurvesChannelKey(dialog) {
   var idx = dialog && dialog.comboPostCurvesChan ? dialog.comboPostCurvesChan.currentItem : 0;
   return ["K", "R", "G", "B", "S"][idx] || "K";
}

function optAkimaInterpolate(points, numOut) {
   if (!points || points.length < 2) {
      var id = [];
      for (var ii = 0; ii < numOut; ++ii)
         id.push(ii / Math.max(1, numOut - 1));
      return id;
   }
   var pts = points.slice().sort(function(a, b) { return a[0] - b[0]; });
   if (pts.length === 2) {
      var line = [];
      for (var i = 0; i < numOut; ++i) {
         var x = i / Math.max(1, numOut - 1);
         var t = (x - pts[0][0]) / Math.max(1.0e-12, pts[1][0] - pts[0][0]);
         t = optClamp01(t);
         line.push(optClamp01(pts[0][1] + t * (pts[1][1] - pts[0][1])));
      }
      return line;
   }
   var n = pts.length, dx = [], dy = [], m = [], tang = [];
   for (var j = 0; j < n - 1; ++j) {
      dx[j] = Math.max(1.0e-12, pts[j + 1][0] - pts[j][0]);
      dy[j] = pts[j + 1][1] - pts[j][1];
      m[j] = dy[j] / dx[j];
   }
   for (var k = 0; k < n; ++k) {
      if (k === 0) tang[k] = m[0];
      else if (k === n - 1) tang[k] = m[n - 2];
      else {
         var mm0 = (k >= 2) ? m[k - 2] : 2 * m[0] - m[1];
         var mm1 = m[k - 1];
         var mm2 = m[k];
         var mm3 = (k < n - 2) ? m[k + 1] : 2 * m[n - 2] - m[n - 3];
         var w1 = Math.abs(mm3 - mm2) + 1.0e-12;
         var w2 = Math.abs(mm1 - mm0) + 1.0e-12;
         tang[k] = (w1 * mm1 + w2 * mm2) / (w1 + w2);
      }
   }
   var out = [];
   for (var o = 0; o < numOut; ++o) {
      var xx = o / Math.max(1, numOut - 1);
      var seg = 0;
      for (var s = 0; s < n - 1; ++s)
         if (xx >= pts[s][0] && xx <= pts[s + 1][0]) { seg = s; break; }
      if (xx > pts[n - 1][0])
         seg = n - 2;
      var h = dx[seg];
      var tt = optClamp01((xx - pts[seg][0]) / h);
      var h00 = (1 + 2 * tt) * (1 - tt) * (1 - tt);
      var h10 = tt * (1 - tt) * (1 - tt);
      var h01 = tt * tt * (3 - 2 * tt);
      var h11 = tt * tt * (tt - 1);
      out.push(optClamp01(h00 * pts[seg][1] + h10 * h * tang[seg] + h01 * pts[seg + 1][1] + h11 * h * tang[seg + 1]));
   }
   return out;
}

function optPostHueSatFromRgb(r, g, b) {
   var mx = Math.max(r, g, b);
   var mn = Math.min(r, g, b);
   var d = mx - mn;
   var sat = mx <= 1.0e-12 ? 0 : d / mx;
   var hue = 0;
   if (d > 1.0e-12) {
      if (mx === r) hue = (g - b) / (6 * d);
      else if (mx === g) hue = (b - r) / (6 * d) + 1 / 3;
      else hue = (r - g) / (6 * d) + 2 / 3;
      if (hue < 0) hue += 1;
      if (hue >= 1) hue -= 1;
   }
   return { hue: hue, sat: sat };
}

function optCreateMaskWindowFromImage(maskImage, baseId, sourceView) {
   var win = new ImageWindow(maskImage.width, maskImage.height, 1, 32, true, false, optUniqueId(baseId || "Post_Mask"));
   win.mainView.beginProcess(UndoFlag_NoSwapFile);
   win.mainView.image.assign(maskImage);
   win.mainView.endProcess();
   optCopyMetadata(win, sourceView);
   try { win.hide(); } catch (e0) {}
   return win.mainView;
}

function optCreateEmptyMaskWindowView(width, height, baseId, sourceView) {
   var win = new ImageWindow(width, height, 1, 32, true, false, optUniqueId(baseId || "Post_Mask"));
   optCopyMetadata(win, sourceView);
   try { win.hide(); } catch (e0) {}
   return win.mainView;
}

// ---- Post Masking standalone helpers (v29-opt-14) --------------------------

function optPostRangeWeight(v, low, high, fuzz, binary) {
   var lo = Math.min(low, high), hi = Math.max(low, high);
   if (binary)
      return (v >= lo && v <= hi) ? 1 : 0;
   if (v >= lo && v <= hi) return 1;
   if (fuzz > 0 && v >= lo - fuzz && v < lo) return Math.max(0, (v - (lo - fuzz)) / fuzz);
   if (fuzz > 0 && v > hi && v <= hi + fuzz) return Math.max(0, ((hi + fuzz) - v) / fuzz);
   return 0;
}

function optBuildHueWheelBitmap(sz) {
   return optGenerateHueWheelBitmap(sz, 0.58, true);
}

// ---- FAME helpers -----------------------------------------------------------

function optPostFameAngle(cx, cy, x, y) { return Math.atan2(y - cy, x - cx); }

function optPostFameDistance(x0, y0, x1, y1) {
   var dx = x1 - x0, dy = y1 - y0;
   return Math.sqrt(dx * dx + dy * dy);
}

function optPostFameBuildEllipsePoints(x0, y0, x1, y1) {
   var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
   var rx = Math.abs(x1 - x0) / 2, ry = Math.abs(y1 - y0) / 2;
   var steps = Math.max(32, Math.round(2 * Math.PI * Math.max(rx, ry)));
   var pts = [];
   for (var i = 0; i <= steps; ++i)
      pts.push([cx + rx * Math.cos(2 * Math.PI * i / steps), cy + ry * Math.sin(2 * Math.PI * i / steps)]);
   return pts;
}

function optPostFameBuildRectanglePoints(x0, y0, x1, y1) {
   return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
}

function optPostFameCloneShape(shape) {
   var s = {};
   for (var k in shape) {
      if (!Object.prototype.hasOwnProperty.call(shape, k)) continue;
      s[k] = Array.isArray(shape[k]) ? shape[k].map(function(p) { return Array.isArray(p) ? p.slice() : p; }) : shape[k];
   }
   return s;
}

function optPostFameGetShapePoints(shape) {
   if (!shape) return [];
   return (shape.type === "Brush") ? (shape.centers || []) : (shape.points || []);
}

function optPostFameTransformCenter(shape) {
   var pts = optPostFameGetShapePoints(shape);
   if (!pts.length) return [0, 0];
   var sx = 0, sy = 0;
   for (var i = 0; i < pts.length; ++i) { sx += pts[i][0]; sy += pts[i][1]; }
   return [sx / pts.length, sy / pts.length];
}

function optPostFameMoveShape(shape, dx, dy) {
   var arr = (shape.type === "Brush") ? shape.centers : shape.points;
   if (arr) for (var i = 0; i < arr.length; ++i) { arr[i][0] += dx; arr[i][1] += dy; }
}

function optPostFameTransformShape(shape, angle, scale, cx, cy) {
   var arr = (shape.type === "Brush") ? shape.centers : shape.points;
   if (!arr) return;
   for (var i = 0; i < arr.length; ++i) {
      var dx = arr[i][0] - cx, dy = arr[i][1] - cy;
      var dist = Math.sqrt(dx * dx + dy * dy) * scale;
      var ang = Math.atan2(dy, dx) + angle;
      arr[i][0] = cx + dist * Math.cos(ang);
      arr[i][1] = cy + dist * Math.sin(ang);
   }
}

function optPostFamePixelValue(srcImg, x, y, mode, colorRange, gradState) {
   if (mode === "Binary") return 1;
   var r = srcImg.sample(x, y, 0);
   var nch = srcImg.numberOfChannels;
   var g = nch >= 3 ? srcImg.sample(x, y, 1) : r;
   var b = nch >= 3 ? srcImg.sample(x, y, 2) : r;
   if (mode === "Lightness") return nch >= 3 ? 0.2126 * r + 0.7152 * g + 0.0722 * b : r;
   if (mode === "Chrominance") {
      if (nch < 3) return 0;
      var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      return mx <= 1.0e-10 ? 0 : (mx - mn) / mx;
   }
   if (mode === "Color") {
      if (nch < 3) return 0;
      var hs = optPostHueSatFromRgb(r, g, b);
      var hueDeg = hs.hue * 360.0;
      if (!colorRange) return 0;
      var inRange = colorRange.min < colorRange.max
         ? (hueDeg >= colorRange.min && hueDeg <= colorRange.max)
         : (hueDeg >= colorRange.min || hueDeg <= colorRange.max);
      return inRange ? hs.sat : 0;
   }
   if (mode === "Gradient" && gradState && gradState.A && gradState.B) {
      var gdx = gradState.B[0] - gradState.A[0], gdy = gradState.B[1] - gradState.A[1];
      var len = Math.sqrt(gdx * gdx + gdy * gdy);
      if (len <= 1.0e-10) return 0;
      var vx = x - gradState.A[0], vy = y - gradState.A[1];
      return Math.max(0, Math.min(1, (vx * gdx + vy * gdy) / (len * len)));
   }
   return 0;
}

function optPostFameFillPolygon(outImg, srcImg, polygon, pixelFn, replaceOnly) {
   if (!polygon || polygon.length < 3) return;
   var w = outImg.width, h = outImg.height;
   var minY = polygon[0][1], maxY = polygon[0][1];
   for (var i = 1; i < polygon.length; ++i) {
      if (polygon[i][1] < minY) minY = polygon[i][1];
      if (polygon[i][1] > maxY) maxY = polygon[i][1];
   }
   for (var y = Math.max(0, Math.floor(minY)); y <= Math.min(h - 1, Math.ceil(maxY)); ++y) {
      var xs = [];
      for (var p = 0; p < polygon.length; ++p) {
         var q = (p + 1) % polygon.length;
         var y1 = polygon[p][1], y2 = polygon[q][1];
         if ((y1 <= y && y < y2) || (y2 <= y && y < y1))
            xs.push(Math.round(polygon[p][0] + (y - y1) * (polygon[q][0] - polygon[p][0]) / (y2 - y1)));
      }
      xs.sort(function(a, b) { return a - b; });
      for (var k = 0; k + 1 < xs.length; k += 2) {
         for (var x = Math.max(0, xs[k]); x <= Math.min(w - 1, xs[k + 1]); ++x) {
            var v = Math.max(0, Math.min(1, pixelFn(srcImg, x, y)));
            if (v > 0 && (replaceOnly || v > outImg.sample(x, y, 0))) outImg.setSample(v, x, y, 0);
         }
      }
   }
}

function optPostFameRasterizeCircle(outImg, srcImg, cx, cy, radius, pixelFn, replaceOnly) {
   radius = Math.max(1, radius);
   var w = outImg.width, h = outImg.height, r2 = radius * radius;
   for (var y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(h - 1, Math.ceil(cy + radius)); ++y)
      for (var x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(w - 1, Math.ceil(cx + radius)); ++x)
         if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r2) {
            var v = Math.max(0, Math.min(1, pixelFn(srcImg, x, y)));
            if (v > 0 && (replaceOnly || v > outImg.sample(x, y, 0))) outImg.setSample(v, x, y, 0);
         }
}

function optPostFameFillBrush(outImg, srcImg, shape, pixelFn, replaceOnly) {
   var centers = shape.centers || [], radius = Math.max(1, shape.radius || 10);
   for (var i = 0; i < centers.length; ++i)
      optPostFameRasterizeCircle(outImg, srcImg, centers[i][0], centers[i][1], radius, pixelFn, replaceOnly);
   for (var s = 0; s < centers.length - 1; ++s) {
      var p0 = centers[s], p1 = centers[s + 1];
      var steps = Math.max(1, Math.ceil(optPostFameDistance(p0[0], p0[1], p1[0], p1[1]) / Math.max(1, radius * 0.35)));
      for (var t = 0; t <= steps; ++t) {
         var u = t / steps;
         optPostFameRasterizeCircle(outImg, srcImg, p0[0] + (p1[0] - p0[0]) * u, p0[1] + (p1[1] - p0[1]) * u, radius, pixelFn, replaceOnly);
      }
   }
}

function optPostFameFillSpray(outImg, srcImg, shape, pixelFn, replaceOnly) {
   var pts = shape.points || [], w = outImg.width, h = outImg.height;
   for (var i = 0; i < pts.length; ++i) {
      var x = Math.round(pts[i][0]), y = Math.round(pts[i][1]);
      if (x >= 0 && y >= 0 && x < w && y < h) {
         var v = Math.max(0, Math.min(1, pixelFn(srcImg, x, y)));
         if (v > 0 && (replaceOnly || v > outImg.sample(x, y, 0))) outImg.setSample(v, x, y, 0);
      }
   }
}

function optPostFameAppendSprayPoints(shape, cx, cy, radius, density) {
   var count = Math.max(1, Math.round(Math.PI * radius * radius * Math.max(0.01, density) * 0.15));
   for (var i = 0; i < count; ++i) {
      var ang = Math.random() * 2 * Math.PI;
      var dist = Math.random() * radius;
      shape.points.push([cx + dist * Math.cos(ang), cy + dist * Math.sin(ang)]);
   }
}

function optBuildPostFameMaskImage(tv, dialog) {
   if (!optSafeView(tv)) throw new Error("Select a target image first.");
   var st = dialog.postFameState;
   if (!st || !st.shapes || st.shapes.length === 0)
      throw new Error("FAME requires at least one drawn shape.");
   var mode = dialog.comboPostFameMaskMode
      ? dialog.comboPostFameMaskMode.itemText(dialog.comboPostFameMaskMode.currentItem)
      : "Binary";
   if (mode === "Gradient" && (!st.gradientA || !st.gradientB))
      throw new Error("FAME Gradient mode requires two right-click points on the preview.");
   if (mode === "Color" && tv.image.numberOfChannels < 3)
      throw new Error("FAME Color mode requires an RGB image.");
   var colorRanges = { Red:{min:330,max:40}, Yellow:{min:40,max:85}, Green:{min:85,max:160}, Cyan:{min:160,max:200}, Blue:{min:200,max:270}, Magenta:{min:270,max:330} };
   var colorName = dialog.comboPostFameColor ? dialog.comboPostFameColor.itemText(dialog.comboPostFameColor.currentItem) : "";
   var colorRange = colorRanges[colorName] || null;
   var gradState = { A: st.gradientA, B: st.gradientB };
   var srcImg = tv.image;
   var outImg = new Image(srcImg.width, srcImg.height, 1, ColorSpace_Gray, 32, SampleType_Real);
   outImg.fill(0);
   var pixelFn = function(img, x, y) { return optPostFamePixelValue(img, x, y, mode, colorRange, gradState); };
   var replaceOnly = (mode === "Binary");
   for (var i = 0; i < st.shapes.length; ++i) {
      var shape = st.shapes[i];
      if (shape.type === "Brush")      optPostFameFillBrush(outImg, srcImg, shape, pixelFn, replaceOnly);
      else if (shape.type === "SprayCan") optPostFameFillSpray(outImg, srcImg, shape, pixelFn, replaceOnly);
      else                             optPostFameFillPolygon(outImg, srcImg, optPostFameGetShapePoints(shape), pixelFn, replaceOnly);
   }
   return outImg;
}

function optRenderFameOverlay(g, sc, sx, sy, fameState, coordScaleX, coordScaleY) {
   if (!fameState) return;
   var st = fameState;
   g.antialiasing = true;
   var kx = coordScaleX && coordScaleX > 0 ? coordScaleX : 1.0;
   var ky = coordScaleY && coordScaleY > 0 ? coordScaleY : 1.0;
   function toScreen(ix, iy) { return { x: Math.round((ix / kx) * sc - sx), y: Math.round((iy / ky) * sc - sy) }; }
   function drawShape(shape, active) {
      var pts = optPostFameGetShapePoints(shape);
      if (!pts.length) return;
      // v33-opt-9n: FAME live drawing color changed from cyan to amber-gold
      // (the same 0xFFFFD000 hue used by Crop handles and the mask overlay).
      // Visual continuity between designing (FAME live shapes) and the
      // activated mask overlay: both now show the same color over the area
      // where the mask will act.
      g.pen = new Pen(active ? 0xFFFFD000 : 0xFFCC9000, active ? 2 : 1);
      if (shape.type === "Brush" || shape.type === "SprayCan") {
         var rad = Math.max(1, Math.round((shape.radius || 10) * sc / Math.max(kx, ky)));
         for (var i = 0; i < pts.length; ++i) { var sp = toScreen(pts[i][0], pts[i][1]); g.drawCircle(sp.x, sp.y, rad); }
      } else {
         for (var j = 0; j < pts.length - 1; ++j) { var a = toScreen(pts[j][0], pts[j][1]); var b = toScreen(pts[j+1][0], pts[j+1][1]); g.drawLine(a.x, a.y, b.x, b.y); }
      }
   }
   for (var i = 0; i < (st.shapes || []).length; ++i) drawShape(st.shapes[i], i === st.activeShapeIndex);
   if (st.currentShape) drawShape(st.currentShape, true);
   if (st.gradientA) { var ga = toScreen(st.gradientA[0], st.gradientA[1]); g.pen = new Pen(0xFF00FF00, 2); g.drawCircle(ga.x, ga.y, 6); g.drawText(ga.x + 9, ga.y + 4, "A"); }
   if (st.gradientB) { var gb = toScreen(st.gradientB[0], st.gradientB[1]); g.pen = new Pen(0xFFFF4444, 2); g.drawCircle(gb.x, gb.y, 6); g.drawText(gb.x + 9, gb.y + 4, "B"); }
}

// ---- end Post Masking standalone helpers ------------------------------------

// Build Range mask view. opts.live = true → downsample large images to OPT_POST_LIVE_MAX_DIM
// in the longest dimension, skip gconv smoothing (smooth is a final-quality refinement).
// Bulk getSamples()/setSamples() avoids per-pixel function-call overhead.
function optCreateSampleArray(length) {
   return (typeof Float32Array !== "undefined") ? new Float32Array(length) : [];
}

function OptPostMaskLiveCache() {
   this.key = "";
   this.workImg = null;
   this.freeWork = false;
   this.W = 0;
   this.H = 0;
   this.srcW = 0;
   this.srcH = 0;
   this.buffers = {};
   this.bitmap = null;
   this.bitmapKey = "";
}

OptPostMaskLiveCache.prototype.release = function() {
   if (this.freeWork && this.workImg)
      try { this.workImg.free(); } catch (e0) {}
   this.key = "";
   this.workImg = null;
   this.freeWork = false;
   this.W = 0;
   this.H = 0;
   this.srcW = 0;
   this.srcH = 0;
   this.buffers = {};
   this.bitmap = null;
   this.bitmapKey = "";
};

OptPostMaskLiveCache.prototype.buffer = function(name, length) {
   var b = this.buffers[name];
   if (!b || b.length !== length) {
      b = optCreateSampleArray(length);
      this.buffers[name] = b;
   }
   return b;
};

function optPostMaskWorkBuffer(work, name, length) {
   if (work && work.cache)
      return work.cache.buffer(name, length);
   return optCreateSampleArray(length);
}

function optPostMaskLiveBitmap(cache, width, height) {
   if (!cache)
      return new Bitmap(width, height);
   var key = width + "x" + height;
   if (!cache.bitmap || cache.bitmapKey !== key) {
      cache.bitmap = new Bitmap(width, height);
      cache.bitmapKey = key;
   }
   return cache.bitmap;
}

function optPostMaskLiveCacheKey(sourceView, W, H) {
   try {
      return String(sourceView.id || "") + "|" +
         sourceView.image.width + "x" + sourceView.image.height + "|" +
         W + "x" + H + "|" +
         sourceView.image.numberOfChannels + "|" +
         sourceView.image.colorSpace;
   } catch (e0) {
   }
   return "";
}

function optPostMaskPreviewBitmapSize(dialog, sourceView) {
   var reduction = OPT_PREVIEW_REDUCTION_DEFAULT;
   try { reduction = optClampPreviewReduction(dialog.sharedPreviewReduction || OPT_PREVIEW_REDUCTION_DEFAULT); } catch (e0) {}
   try {
      return {
         width: Math.max(1, Math.round(sourceView.image.width / reduction)),
         height: Math.max(1, Math.round(sourceView.image.height / reduction))
      };
   } catch (e1) {
   }
   return { width: 1, height: 1 };
}

function optPreparePostMaskWorkImage(sourceView, live, cache) {
   var srcImg = sourceView.image;
   var srcW = srcImg.width, srcH = srcImg.height;
   var W = srcW, H = srcH;
   var workImg = srcImg, freeWork = false;
   if (live && Math.max(srcW, srcH) > OPT_POST_LIVE_MAX_DIM) {
      var f = OPT_POST_LIVE_MAX_DIM / Math.max(srcW, srcH);
      W = Math.max(1, Math.round(srcW * f));
      H = Math.max(1, Math.round(srcH * f));
   }
   if (live && cache) {
      var key = optPostMaskLiveCacheKey(sourceView, W, H);
      if (cache.key === key && cache.workImg)
         return { srcImg: srcImg, srcW: srcW, srcH: srcH, workImg: cache.workImg, W: cache.W, H: cache.H, freeWork: false, cache: cache };
      cache.release();
      if (W !== srcW || H !== srcH) {
         workImg = new Image(srcW, srcH, srcImg.numberOfChannels, srcImg.colorSpace, 32, SampleType_Real);
         workImg.assign(srcImg);
         workImg.resample(W, H, Interpolation_Bilinear);
         freeWork = true;
      }
      cache.key = key;
      cache.workImg = workImg;
      cache.freeWork = freeWork;
      cache.W = W;
      cache.H = H;
      cache.srcW = srcW;
      cache.srcH = srcH;
      return { srcImg: srcImg, srcW: srcW, srcH: srcH, workImg: workImg, W: W, H: H, freeWork: false, cache: cache };
   }
   if (live && (W !== srcW || H !== srcH)) {
      workImg = new Image(srcW, srcH, srcImg.numberOfChannels, srcImg.colorSpace, 32, SampleType_Real);
      workImg.assign(srcImg);
      workImg.resample(W, H, Interpolation_Bilinear);
      freeWork = true;
   }
   return { srcImg: srcImg, srcW: srcW, srcH: srcH, workImg: workImg, W: W, H: H, freeWork: freeWork };
}

function optRenderPostMaskBitmap(maskArr, work, binary, targetW, targetH) {
   var outW = Math.max(1, Math.round(targetW || work.W));
   var outH = Math.max(1, Math.round(targetH || work.H));
   var bmp = optPostMaskLiveBitmap(work.cache || null, outW, outH);
   var scaleX = work.W / outW;
   var scaleY = work.H / outH;
   for (var y = 0; y < outH; ++y) {
      var sy = Math.min(work.H - 1, Math.floor(y * scaleY));
      var row = sy * work.W;
      for (var x = 0; x < outW; ++x) {
         var sx = Math.min(work.W - 1, Math.floor(x * scaleX));
         var g = Math.max(0, Math.min(255, Math.round(maskArr[row + sx] * 255)));
         bmp.setPixel(x, y, 0xff000000 | (g << 16) | (g << 8) | g);
      }
   }
   return {
      bitmap: bmp,
      id: (binary ? "Post_RangeMaskBinaryLive" : "Post_MaskLive"),
      width: outW,
      height: outH,
      sourceWidth: work.srcW,
      sourceHeight: work.srcH
   };
}

function optRenderMaskViewPreviewBitmap(maskView, dialog, fullRes) {
   if (!optSafeView(maskView))
      return null;
   var img = maskView.image;
   var srcW = img.width;
   var srcH = img.height;
   // PERF-PLAN-A-BEGIN: fullRes → display bitmap at native resolution (sharp at any
   // zoom). Default path keeps the shared-reduction downsample for speed.
   var size = (fullRes === true) ? { width: srcW, height: srcH }
                                 : optPostMaskPreviewBitmapSize(dialog, maskView);
   // PERF-PLAN-A-END
   var outW = Math.max(1, size.width);
   var outH = Math.max(1, size.height);
   var cache = dialog && dialog.postMaskLiveCache ? dialog.postMaskLiveCache : null;
   var bmp = optPostMaskLiveBitmap(cache, outW, outH);
   var scaleX = srcW / outW;
   var scaleY = srcH / outH;
   var row = cache ? cache.buffer("maskPreviewRow", srcW) : optCreateSampleArray(srcW);
   for (var y = 0; y < outH; ++y) {
      var sy = Math.min(srcH - 1, Math.floor(y * scaleY));
      img.getSamples(row, new Rect(0, sy, srcW, sy + 1), 0);
      for (var x = 0; x < outW; ++x) {
         var sx = Math.min(srcW - 1, Math.floor(x * scaleX));
         var g = Math.max(0, Math.min(255, Math.round(row[sx] * 255)));
         bmp.setPixel(x, y, 0xff000000 | (g << 16) | (g << 8) | g);
      }
   }
   return { bitmap: bmp, sourceWidth: srcW, sourceHeight: srcH };
}

function optRenderMaskViewInPreview(dialog, maskView, label, previewPane, fit) {
   var pane = previewPane || (dialog && dialog.postTab ? dialog.postTab.preview : null);
   if (!pane || !optSafeView(maskView))
      return;
   var rendered = optRenderMaskViewPreviewBitmap(maskView, dialog);
   if (rendered && rendered.bitmap)
      pane.renderBitmap(rendered.bitmap, label || ("<b>Mask:</b> " + maskView.id), fit !== false, rendered.sourceWidth, rendered.sourceHeight);
}

function optFinishPostMaskView(maskArr, work, sourceView, live, baseId, smooth) {
   var mask = new Image(work.W, work.H, 1, ColorSpace_Gray, 32, SampleType_Real);
   try {
      mask.setSamples(maskArr, new Rect(0, 0, work.W, work.H), 0);
      if (live && (work.W !== work.srcW || work.H !== work.srcH))
         mask.resample(work.srcW, work.srcH, Interpolation_Bilinear);
      var maskView = optCreateMaskWindowFromImage(mask, live ? (baseId + "Live") : baseId, sourceView);
      if (smooth > 0.0 && !live) {
         var pmSmooth = new PixelMath();
         pmSmooth.expression = "gconv($T," + smooth.toFixed(4) + ")";
         pmSmooth.useSingleExpression = true;
         pmSmooth.createNewImage = false;
         pmSmooth.showNewImage = false;
         pmSmooth.executeOn(maskView);
      }
      return maskView;
   } finally {
      try { mask.free(); } catch (e0) {}
   }
}

function optApplyPostMaskSmoothing(maskView, smooth) {
   if (!optSafeView(maskView) || !(smooth > 0.0))
      return;
   try {
      var pmSmooth = new PixelMath();
      pmSmooth.expression = "gconv($T," + smooth.toFixed(4) + ")";
      pmSmooth.useSingleExpression = true;
      pmSmooth.createNewImage = false;
      pmSmooth.showNewImage = false;
      pmSmooth.executeOn(maskView);
   } catch (e) {
      console.warningln("Mask smoothing skipped: " + e.message);
   }
}

function optPostMaskTileRows(width) {
   if (width >= 8000)
      return 64;
   if (width >= 4000)
      return 96;
   return 128;
}

function optBuildPostRangeMaskViewTiled(sourceView, low, high, fuzz, invert, modeIdx, smooth) {
   var img = sourceView.image;
   var width = img.width;
   var height = img.height;
   var nch = img.numberOfChannels;
   var useBrightness = (modeIdx === 2);
   var isBinary = (modeIdx === 0);
   var baseId = isBinary ? "Post_RangeMaskBinary" : "Post_RangeMask";
   var maskView = optCreateEmptyMaskWindowView(width, height, baseId, sourceView);
   var tileRows = optPostMaskTileRows(width);
   var rArr = null, gArr = null, bArr = null, maskArr = null;
   try {
      maskView.beginProcess(UndoFlag_NoSwapFile);
      try {
         for (var y = 0; y < height; y += tileRows) {
            var h = Math.min(tileRows, height - y);
            var n = width * h;
            var rect = new Rect(0, y, width, y + h);
            if (!rArr || rArr.length !== n) {
               rArr = optCreateSampleArray(n);
               maskArr = optCreateSampleArray(n);
               if (nch >= 3) {
                  gArr = optCreateSampleArray(n);
                  bArr = optCreateSampleArray(n);
               }
            }
            img.getSamples(rArr, rect, 0);
            if (nch >= 3) {
               img.getSamples(gArr, rect, 1);
               img.getSamples(bArr, rect, 2);
            }
            if (nch >= 3 && useBrightness)
               optFillRangeMaskRgbBrightness(maskArr, rArr, gArr, bArr, n, low, high, fuzz, invert, isBinary);
            else if (nch >= 3)
               optFillRangeMaskRgbLuma(maskArr, rArr, gArr, bArr, n, low, high, fuzz, invert, isBinary);
            else
               optFillRangeMaskMono(maskArr, rArr, n, low, high, fuzz, invert, isBinary);
            maskView.image.setSamples(maskArr, rect, 0);
         }
      } finally {
         maskView.endProcess();
      }
      if (!isBinary)
         optApplyPostMaskSmoothing(maskView, smooth);
      return maskView;
   } catch (e) {
      optCloseView(maskView);
      throw e;
   }
}

function optBuildPostColorMaskViewTiled(sourceView, hue, hueRange, satLow, invert, smooth) {
   var img = sourceView.image;
   var width = img.width;
   var height = img.height;
   var maskView = optCreateEmptyMaskWindowView(width, height, "Post_ColorMask", sourceView);
   var tileRows = optPostMaskTileRows(width);
   var rArr = null, gArr = null, bArr = null, maskArr = null;
   try {
      maskView.beginProcess(UndoFlag_NoSwapFile);
      try {
         for (var y = 0; y < height; y += tileRows) {
            var h = Math.min(tileRows, height - y);
            var n = width * h;
            var rect = new Rect(0, y, width, y + h);
            if (!rArr || rArr.length !== n) {
               rArr = optCreateSampleArray(n);
               gArr = optCreateSampleArray(n);
               bArr = optCreateSampleArray(n);
               maskArr = optCreateSampleArray(n);
            }
            img.getSamples(rArr, rect, 0);
            img.getSamples(gArr, rect, 1);
            img.getSamples(bArr, rect, 2);
            optFillColorMaskArray(maskArr, rArr, gArr, bArr, n, hue, hueRange, satLow, invert);
            maskView.image.setSamples(maskArr, rect, 0);
         }
      } finally {
         maskView.endProcess();
      }
      optApplyPostMaskSmoothing(maskView, smooth);
      return maskView;
   } catch (e) {
      optCloseView(maskView);
      throw e;
   }
}

function optFillRangeMaskMono(maskArr, rArr, n, low, high, fuzz, invert, binary) {
   var lo = Math.min(low, high), hi = Math.max(low, high);
   if (binary) {
      if (invert) {
         for (var i0 = 0; i0 < n; ++i0) {
            var v0 = rArr[i0];
            maskArr[i0] = (v0 >= lo && v0 <= hi) ? 0 : 1;
         }
      } else {
         for (var i1 = 0; i1 < n; ++i1) {
            var v1 = rArr[i1];
            maskArr[i1] = (v1 >= lo && v1 <= hi) ? 1 : 0;
         }
      }
      return;
   }
   if (invert) {
      for (var i2 = 0; i2 < n; ++i2)
         maskArr[i2] = 1 - optPostRangeWeight(rArr[i2], lo, hi, fuzz, false);
   } else {
      for (var i3 = 0; i3 < n; ++i3)
         maskArr[i3] = optPostRangeWeight(rArr[i3], lo, hi, fuzz, false);
   }
}

function optFillRangeMaskRgbLuma(maskArr, rArr, gArr, bArr, n, low, high, fuzz, invert, binary) {
   var lo = Math.min(low, high), hi = Math.max(low, high);
   if (binary) {
      if (invert) {
         for (var i0 = 0; i0 < n; ++i0) {
            var v0 = 0.2126 * rArr[i0] + 0.7152 * gArr[i0] + 0.0722 * bArr[i0];
            maskArr[i0] = (v0 >= lo && v0 <= hi) ? 0 : 1;
         }
      } else {
         for (var i1 = 0; i1 < n; ++i1) {
            var v1 = 0.2126 * rArr[i1] + 0.7152 * gArr[i1] + 0.0722 * bArr[i1];
            maskArr[i1] = (v1 >= lo && v1 <= hi) ? 1 : 0;
         }
      }
      return;
   }
   if (invert) {
      for (var i2 = 0; i2 < n; ++i2) {
         var v2 = 0.2126 * rArr[i2] + 0.7152 * gArr[i2] + 0.0722 * bArr[i2];
         maskArr[i2] = 1 - optPostRangeWeight(v2, lo, hi, fuzz, false);
      }
   } else {
      for (var i3 = 0; i3 < n; ++i3) {
         var v3 = 0.2126 * rArr[i3] + 0.7152 * gArr[i3] + 0.0722 * bArr[i3];
         maskArr[i3] = optPostRangeWeight(v3, lo, hi, fuzz, false);
      }
   }
}

function optFillRangeMaskRgbBrightness(maskArr, rArr, gArr, bArr, n, low, high, fuzz, invert, binary) {
   var lo = Math.min(low, high), hi = Math.max(low, high);
   if (binary) {
      if (invert) {
         for (var i0 = 0; i0 < n; ++i0) {
            var v0 = Math.max(rArr[i0], gArr[i0], bArr[i0]);
            maskArr[i0] = (v0 >= lo && v0 <= hi) ? 0 : 1;
         }
      } else {
         for (var i1 = 0; i1 < n; ++i1) {
            var v1 = Math.max(rArr[i1], gArr[i1], bArr[i1]);
            maskArr[i1] = (v1 >= lo && v1 <= hi) ? 1 : 0;
         }
      }
      return;
   }
   if (invert) {
      for (var i2 = 0; i2 < n; ++i2) {
         var v2 = Math.max(rArr[i2], gArr[i2], bArr[i2]);
         maskArr[i2] = 1 - optPostRangeWeight(v2, lo, hi, fuzz, false);
      }
   } else {
      for (var i3 = 0; i3 < n; ++i3) {
         var v3 = Math.max(rArr[i3], gArr[i3], bArr[i3]);
         maskArr[i3] = optPostRangeWeight(v3, lo, hi, fuzz, false);
      }
   }
}

function optFillColorMaskArray(maskArr, rArr, gArr, bArr, n, hue, hueRange, satLow, invert) {
   var halfRange = hueRange * 0.5;
   if (invert) {
      for (var i0 = 0; i0 < n; ++i0)
         maskArr[i0] = 1 - optColorMaskWeight(rArr[i0], gArr[i0], bArr[i0], hue, halfRange, satLow);
   } else {
      for (var i1 = 0; i1 < n; ++i1)
         maskArr[i1] = optColorMaskWeight(rArr[i1], gArr[i1], bArr[i1], hue, halfRange, satLow);
   }
}

function optColorMaskWeight(r, g, b, hue, halfRange, satLow) {
   var mx = Math.max(r, g, b);
   var mn = Math.min(r, g, b);
   var d = mx - mn;
   if (mx <= 0 || d <= 0)
      return 0;
   var sat = d / mx;
   if (sat < satLow)
      return 0;
   var h = 0;
   if (mx === r)
      h = (g - b) / (6 * d);
   else if (mx === g)
      h = (b - r) / (6 * d) + 1 / 3;
   else
      h = (r - g) / (6 * d) + 2 / 3;
   if (h < 0) h += 1;
   if (h >= 1) h -= 1;
   var delta = Math.abs(h - hue);
   if (delta > 0.5)
      delta = 1.0 - delta;
   return delta <= halfRange ? sat : 0;
}

function optApplySmoothToMaskArr(maskArr, W, H, sigma) {
   if (W <= 1 || H <= 1 || sigma <= 0) return;
   var kernel = optGaussianKernelForSigma(sigma);
   var radius = Math.floor(kernel.length / 2);
   var kLen = kernel.length;
   var n = W * H;
   var tmp = new Float32Array(n);
   for (var y = 0; y < H; ++y) {
      var rowOff = y * W;
      for (var x = 0; x < W; ++x) {
         var s = 0;
         if (x >= radius && x < W - radius) {
            var base = rowOff + x - radius;
            for (var k = 0; k < kLen; ++k)
               s += maskArr[base + k] * kernel[k];
         } else {
            for (var ke = 0; ke < kLen; ++ke) {
               var xi = Math.max(0, Math.min(W - 1, x + ke - radius));
               s += maskArr[rowOff + xi] * kernel[ke];
            }
         }
         tmp[rowOff + x] = s;
      }
   }
   for (var x2 = 0; x2 < W; ++x2) {
      for (var y2 = 0; y2 < H; ++y2) {
         var s2 = 0;
         if (y2 >= radius && y2 < H - radius) {
            var base2 = (y2 - radius) * W + x2;
            for (var k2 = 0; k2 < kLen; ++k2)
               s2 += tmp[base2 + k2 * W] * kernel[k2];
         } else {
            for (var k2e = 0; k2e < kLen; ++k2e) {
               var yi = Math.max(0, Math.min(H - 1, y2 + k2e - radius));
               s2 += tmp[yi * W + x2] * kernel[k2e];
            }
         }
         maskArr[y2 * W + x2] = s2;
      }
   }
}

function optBuildPostRangeMaskView(sourceView, dialog, opts) {
   if (!optSafeView(sourceView))
      throw new Error("Select a Post image first.");
   opts = opts || {};
   var live = optHasOwn(opts, "live") && opts.live === true;
   var low = optNumericValue(dialog.ncPostRangeLow, 0.15);
   var high = optNumericValue(dialog.ncPostRangeHigh, 0.85);
   var fuzz = Math.max(0, optNumericValue(dialog.ncPostRangeFuzz, 0.05));
   var invert = optChecked(dialog.chkPostRangeInvert, false);
   var modeIdx = dialog.comboPostRangeMode ? dialog.comboPostRangeMode.currentItem : 1;
   var useBrightness = (modeIdx === 2);
   var isBinary = (modeIdx === 0);
   var asBitmap = optHasOwn(opts, "asBitmap") && opts.asBitmap === true;
   if (!live && !asBitmap)
      return optBuildPostRangeMaskViewTiled(sourceView, low, high, fuzz, invert, modeIdx, isBinary ? 0.0 : optNumericValue(dialog.ncPostRangeSmooth, 0.0));
   var work = optPreparePostMaskWorkImage(sourceView, live, optHasOwn(opts, "cache") ? opts.cache : null);
   try {
      var nch = work.workImg.numberOfChannels;
      var n = work.W * work.H;
      var fullRect = new Rect(0, 0, work.W, work.H);
      var rArr = optPostMaskWorkBuffer(work, "r", n); work.workImg.getSamples(rArr, fullRect, 0);
      var gArr = null, bArr = null;
      if (nch >= 3) {
         gArr = optPostMaskWorkBuffer(work, "g", n); work.workImg.getSamples(gArr, fullRect, 1);
         bArr = optPostMaskWorkBuffer(work, "b", n); work.workImg.getSamples(bArr, fullRect, 2);
      }
      var maskArr = optPostMaskWorkBuffer(work, "mask", n);
      if (nch >= 3 && useBrightness)
         optFillRangeMaskRgbBrightness(maskArr, rArr, gArr, bArr, n, low, high, fuzz, invert, isBinary);
      else if (nch >= 3)
         optFillRangeMaskRgbLuma(maskArr, rArr, gArr, bArr, n, low, high, fuzz, invert, isBinary);
      else
         optFillRangeMaskMono(maskArr, rArr, n, low, high, fuzz, invert, isBinary);
      var baseId = isBinary ? "Post_RangeMaskBinary" : "Post_RangeMask";
      var smooth = isBinary ? 0.0 : optNumericValue(dialog.ncPostRangeSmooth, 0.0);
      if (smooth > 0.0) {
         var liveSigma = smooth * work.W / Math.max(1, work.srcW);
         if (liveSigma > 0.1)
            optApplySmoothToMaskArr(maskArr, work.W, work.H, liveSigma);
      }
      if (asBitmap)
         return optRenderPostMaskBitmap(maskArr, work, isBinary,
            optHasOwn(opts, "targetWidth") ? opts.targetWidth : 0,
            optHasOwn(opts, "targetHeight") ? opts.targetHeight : 0);
      var maskView = optFinishPostMaskView(maskArr, work, sourceView, live, baseId, smooth);
      if (isBinary && optSafeView(maskView)) {
         var pmBinary = new PixelMath();
         pmBinary.expression = "iif($T>=0.5,1,0)";
         pmBinary.useSingleExpression = true;
         pmBinary.createNewImage = false;
         pmBinary.showNewImage = false;
         pmBinary.executeOn(maskView);
      }
      return maskView;
   } finally {
      if (work.freeWork) try { work.workImg.free(); } catch (eW) {}
   }
}

function optBuildPostColorMaskView(sourceView, dialog, opts) {
   if (!optSafeView(sourceView) || sourceView.image.numberOfChannels < 3)
      throw new Error("Color Mask requires an RGB Post image.");
   opts = opts || {};
   var live = optHasOwn(opts, "live") && opts.live === true;
   var hue = optNumericValue(dialog.ncPostCMHue, 30.0) / 360.0;
   var hueRange = optNumericValue(dialog.ncPostCMHueRange, 40.0) / 360.0;
   var satLow = optNumericValue(dialog.ncPostCMSatLow, 0.10);
   var invert = optChecked(dialog.chkPostCMInvert, false);
   var asBitmap = optHasOwn(opts, "asBitmap") && opts.asBitmap === true;
   if (!live && !asBitmap)
      return optBuildPostColorMaskViewTiled(sourceView, hue, hueRange, satLow, invert, optNumericValue(dialog.ncPostCMSmooth, 0.0));
   var work = optPreparePostMaskWorkImage(sourceView, live, optHasOwn(opts, "cache") ? opts.cache : null);
   try {
      var n = work.W * work.H;
      var fullRect = new Rect(0, 0, work.W, work.H);
      var rArr = optPostMaskWorkBuffer(work, "r", n); work.workImg.getSamples(rArr, fullRect, 0);
      var gArr = optPostMaskWorkBuffer(work, "g", n); work.workImg.getSamples(gArr, fullRect, 1);
      var bArr = optPostMaskWorkBuffer(work, "b", n); work.workImg.getSamples(bArr, fullRect, 2);
      var maskArr = optPostMaskWorkBuffer(work, "mask", n);
      optFillColorMaskArray(maskArr, rArr, gArr, bArr, n, hue, hueRange, satLow, invert);
      var cmSmooth = optNumericValue(dialog.ncPostCMSmooth, 0.0);
      if (cmSmooth > 0.0) {
         var cmLiveSigma = cmSmooth * work.W / Math.max(1, work.srcW);
         if (cmLiveSigma > 0.1)
            optApplySmoothToMaskArr(maskArr, work.W, work.H, cmLiveSigma);
      }
      if (asBitmap)
         return optRenderPostMaskBitmap(maskArr, work, false,
            optHasOwn(opts, "targetWidth") ? opts.targetWidth : 0,
            optHasOwn(opts, "targetHeight") ? opts.targetHeight : 0);
      return optFinishPostMaskView(maskArr, work, sourceView, live, "Post_ColorMask", cmSmooth);
   } finally {
      if (work.freeWork) try { work.workImg.free(); } catch (eW) {}
   }
}

var OPT_POST_GAUSSIAN_KERNEL_CACHE = {};

function optGaussianKernelForSigma(sigma) {
   var s = Math.max(0.001, sigma);
   var radius = Math.max(1, Math.ceil(3 * s));
   var key = radius + "|" + s.toFixed(4);
   if (OPT_POST_GAUSSIAN_KERNEL_CACHE[key])
      return OPT_POST_GAUSSIAN_KERNEL_CACHE[key];
   var kernel = [];
   var sum = 0;
   for (var i = -radius; i <= radius; ++i) {
      var v = Math.exp(-(i * i) / (2 * s * s));
      kernel.push(v);
      sum += v;
   }
   for (var j = 0; j < kernel.length; ++j)
      kernel[j] /= sum;
   OPT_POST_GAUSSIAN_KERNEL_CACHE[key] = kernel;
   return kernel;
}

// Builds a full-resolution mask from the current Post-mask UI parameters
// (Range Selection / Color Mask / FAME) and installs it as the active mask
// (dialog.postActiveMask). Invoked from the "Use This Mask" button.
// Note (v33-opt-9m): the previous postGeneratedMask alias was removed — it
// always equaled postActiveMask, so the two-name pattern was redundant
// and the source of confusion in the mask-state code.
function optGeneratePostMask(dialog) {
   var view = dialog.postTab.preview.candidateView || dialog.postTab.preview.currentView;
   if (!optSafeView(view))
      throw new Error("Select a Post image first.");
   if (optSafeView(dialog.postActiveMask))
      optCloseView(dialog.postActiveMask);
   var algo = dialog.comboPostMask ? dialog.comboPostMask.currentItem : 0;
   var maskImg = null;
   var baseId = "Post_RangeMask";
   if (algo === 1) {
      dialog.postActiveMask = optBuildPostColorMaskView(view, dialog);
   } else if (algo === 2) {
      maskImg = optBuildPostFameMaskImage(view, dialog);
      baseId = "Post_FAMEMask";
      var blurAmt = dialog.ncPostFameBlur ? dialog.ncPostFameBlur.value : 0;
      try {
         if (blurAmt > 0) {
            var kernel = optGaussianKernelForSigma(blurAmt);
            maskImg.convolveSeparable(kernel, kernel);
         }
         dialog.postActiveMask = optCreateMaskWindowFromImage(maskImg, baseId, view);
      } finally {
         try { maskImg.free(); } catch (e0) {}
      }
   } else {
      dialog.postActiveMask = optBuildPostRangeMaskView(view, dialog);
   }
   dialog.postActiveMaskShown = true;
   optRenderPostSourcePreview(dialog, dialog.postTab.preview, false);
   if (typeof dialog.refreshPostMaskMemoryUi === "function")
      dialog.refreshPostMaskMemoryUi();
   return dialog.postActiveMask;
}

// Activates a previously stored memory slot as the current postActiveMask.
// Invoked from RIGHT-CLICK on a memory slot button (v33-opt-9m: the separate
// "Set to Active Mask" button was removed; right-click now does
// recall+activate in a single gesture, mirroring image-memory right-click).
function optSetActivePostMaskFromMemory(dialog, sourceView, previewPane) {
   if (!dialog || !optSafeView(sourceView))
      throw new Error("Select a saved mask memory first.");
   if (optSafeView(dialog.postActiveMask))
      optCloseView(dialog.postActiveMask);
   dialog.postActiveMask = optMemoryCloneView(sourceView, "Opt_ActiveMask", sourceView.id || "Post", 0);
   dialog.postActiveMaskShown = true;
   optRenderPostSourcePreview(dialog, previewPane, false);
   if (dialog.lblPostMaskStatus && optSafeView(dialog.postActiveMask))
      dialog.lblPostMaskStatus.text = "Mask: " + dialog.postActiveMask.id + " (from memory)";
   if (typeof dialog.refreshPostMaskMemoryUi === "function")
      dialog.refreshPostMaskMemoryUi();
   return dialog.postActiveMask;
}

function optRenderPostSourcePreview(dialog, previewPane, fit) {
   var pane = previewPane || (dialog && dialog.postTab ? dialog.postTab.preview : null);
   var srcView = pane ? (pane.candidateView || pane.currentView) : null;
   if (pane && optSafeView(srcView))
      pane.render(srcView, fit !== false);
   return srcView;
}

function optSetPostActiveMaskShown(dialog, shown, previewPane) {
   if (!dialog || !optSafeView(dialog.postActiveMask))
      throw new Error("No active mask is available. Generate a mask or set one from memory first.");
   var pane = previewPane || (dialog.postTab && dialog.postTab.preview ? dialog.postTab.preview : null);
   dialog.postActiveMaskShown = shown === true;
   if (dialog.postActiveMaskShown) {
      optRenderPostSourcePreview(dialog, pane, false);
      if (dialog.lblPostMaskStatus)
         dialog.lblPostMaskStatus.text = "Mask: " + dialog.postActiveMask.id + " (shown)";
   } else {
      optRenderPostSourcePreview(dialog, pane, false);
      if (dialog.lblPostMaskStatus)
         dialog.lblPostMaskStatus.text = "Mask: " + dialog.postActiveMask.id + " (hidden)";
   }
   if (typeof dialog.refreshPostMaskMemoryUi === "function")
      dialog.refreshPostMaskMemoryUi();
}

function optResetPostFameState(dialog) {
   if (!dialog || !dialog.postFameState)
      return;
   var st = dialog.postFameState;
   st.shapes = [];
   st.currentShape = null;
   st.activeShapeIndex = -1;
   st.isDrawing = false;
   st.isMoving = false;
   st.isTransforming = false;
   st.gradientA = null;
   st.gradientB = null;
   if (typeof dialog.updatePostFameStateLabel === "function")
      dialog.updatePostFameStateLabel();
}

function optClearPostMaskState(dialog) {
   if (!dialog)
      return;
   if (optSafeView(dialog.postActiveMask))
      optCloseView(dialog.postActiveMask);
   try { if (optSafeView(dialog._postLiveMask)) optCloseView(dialog._postLiveMask); } catch (e0) {}
   dialog.postActiveMask = null;
   dialog.postActiveMaskShown = false;
   dialog._postLiveMask = null;
   dialog._postLiveMaskBitmap = null;
   if (dialog.postMaskLiveCache)
      dialog.postMaskLiveCache.release();
   optResetPostFameState(dialog);
   if (dialog.lblPostMaskStatus)
      dialog.lblPostMaskStatus.text = "Mask: none";
   var pane = dialog.postTab && dialog.postTab.preview ? dialog.postTab.preview : null;
   var srcView = pane ? (pane.candidateView || pane.currentView) : null;
   if (pane && optSafeView(srcView))
      pane.render(srcView, false);
   if (dialog.postTab && dialog.postTab.preview && dialog.postTab.preview.preview)
      dialog.postTab.preview.preview.viewport.repaint();
   if (typeof dialog.refreshPostMaskMemoryUi === "function")
      dialog.refreshPostMaskMemoryUi();
}

function optBuildPostNxtConfigFromDialog(dlg) {
   return {
      denoise: optNumericValue(dlg.ncPostNxtDenoise, 0.85),
      iterations: optNumericValue(dlg.ncPostNxtIter, 2),
      enable_color_separation: optChecked(dlg.chkPostNxtColorSep, false),
      enable_frequency_separation: optChecked(dlg.chkPostNxtFreqSep, false),
      denoise_color: optNumericValue(dlg.ncPostNxtDenoiseColor, 0.95),
      denoise_lf: optNumericValue(dlg.ncPostNxtDenoiseLF, 0.60),
      denoise_lf_color: optNumericValue(dlg.ncPostNxtDenoiseLFColor, 1.00),
      frequency_scale: optNumericValue(dlg.ncPostNxtFreqScale, 5.0)
   };
}

// Cosmic Clarity denoise pulls from two wrapper combos (chip-style mini-cards
// that expose the underlying combo as .combo). Reading them here keeps that
// detail out of optApplyPostCandidate.
function optBuildPostCosmicClarityDenoiseConfigFromDialog(dlg) {
   var modeIdx = 0, modelIdx = 0;
   try { modeIdx = dlg.comboPostCCDenoiseMode.combo.currentItem; } catch (e0) {}
   try { modelIdx = dlg.comboPostCCDenoiseModel.combo.currentItem; } catch (e1) {}
   return {
      processMode: "denoise",
      useGPU: true,
      removeAberrationFirst: optChecked(dlg.chkPostCCNRRemoveAb, false),
      denoiseMode: ["full", "luminance"][modeIdx] || "full",
      denoiseModel: ["Walking Noise", "Standard"][modelIdx] || "Walking Noise",
      denoiseLuma: optNumericValue(dlg.ncPostCCNRLuma, 0.50),
      denoiseColor: optNumericValue(dlg.ncPostCCNRColor, 0.50)
   };
}

function optBuildPostCosmicClaritySharpenConfigFromDialog(dlg) {
   return {
      sharpeningMode: optComboText(dlg.comboPostCCSharpenModeCombo, "Both"),
      stellarAmount: optNumericValue(dlg.ncPostCCStellarAmt, 0.90),
      nonStellarStrength: optNumericValue(dlg.ncPostCCNSStrength, 3.0),
      nonStellarAmount: optNumericValue(dlg.ncPostCCNSAmount, 0.50),
      removeAberrationFirst: optChecked(dlg.chkPostCCRemoveAb, false),
      useGPU: true
   };
}

function optBuildPostColorBalanceConfigFromDialog(dlg) {
   return {
      meanHueDeg: dlg.postBalanceMeanHueDeg,
      pointHueDeg: dlg.postBalancePointHueDeg,
      pointIntensity: dlg.postBalancePointIntensity,
      hueSaturation: optNumericValue(dlg.ncPostColorBalanceSaturation, 1.0),
      r: optNumericValue(dlg.ncPostBalanceR, 1.0),
      g: optNumericValue(dlg.ncPostBalanceG, 1.0),
      b: optNumericValue(dlg.ncPostBalanceB, 1.0),
      saturation: optNumericValue(dlg.ncPostBalanceSat, 1.0),
      scnr: optChecked(dlg.chkPostBalanceSCNR, false),
      scnrAmount: optNumericValue(dlg.ncPostBalanceSCNR, 0.60)
   };
}

function optBuildPostCurvesConfigFromDialog(dlg) {
   return {
      channelIndex: dlg.comboPostCurvesChan ? dlg.comboPostCurvesChan.currentItem : 0,
      points: dlg.postCurvesPoints,
      controls: {
         contrast: optNumericValue(dlg.ncPostCurvesContrast, 0.0),
         brightness: optNumericValue(dlg.ncPostCurvesBright, 0.0),
         shadows: optNumericValue(dlg.ncPostCurvesShadows, 0.0),
         highlights: optNumericValue(dlg.ncPostCurvesHighlights, 0.0),
         saturation: optNumericValue(dlg.ncPostCurvesSaturation, 1.0)
      }
   };
}

// DISPATCH-BY-ID (Post Sharpening): single source of truth for the algorithm ORDER
// (canonical indices). Parallax is conditionally present per OPT_PRE_PARALLAX_ENABLED,
// which shifts item indices — exactly why the engine dispatch keys on the stable `id`,
// not on the display label or index. Consumed by both the combo builder
// (optApplyProcessAvailabilityToUI) and the resolver below.
function optPostSharpCanonicalEntries() {
   var e = [{ id: "bxt", label: "BlurXTerminator" }];
   if (typeof OPT_PRE_PARALLAX_ENABLED !== "undefined" && OPT_PRE_PARALLAX_ENABLED)
      e.push({ id: "parallax", label: "Parallax (SyQon)" });
   e.push({ id: "usm", label: "Unsharp Mask" });
   e.push({ id: "hdr", label: "HDR Multiscale Transform" });
   e.push({ id: "lhe", label: "Local Histogram Equalization" });
   e.push({ id: "dse", label: "Dark Structure Enhance" });
   e.push({ id: "cc", label: "Cosmic Clarity" });
   return e;
}
function optPostSharpIdForCanonical(idx) {
   var e = optPostSharpCanonicalEntries();
   return (idx >= 0 && idx < e.length) ? e[idx].id : "bxt";
}

// One-stop normalized snapshot of every Post-tab control needed to execute a
// candidate. Only the fields relevant to `actionKey` are populated; the rest
// stay undefined to make accidental cross-branch reads obvious.
function optBuildPostCandidateConfig(dialog, actionKey) {
   var cfg = { actionKey: actionKey || "" };
   if (cfg.actionKey === "post_nr") {
      cfg.useMask = optChecked(dialog.chkPostNRUseMask, false);
      cfg.algorithmIndex = dialog.comboPostNR ? optComboCanonicalItem(dialog.comboPostNR) : 0;
      cfg.nxt = optBuildPostNxtConfigFromDialog(dialog);
      cfg.tgv = optBuildPostTgvConfigFromDialog(dialog);
      cfg.cosmicClarity = optBuildPostCosmicClarityDenoiseConfigFromDialog(dialog);
      // PRISM-INTEGRATION-BEGIN
      cfg.prism = optBuildPostPrismConfigFromDialog(dialog);
      // PRISM-INTEGRATION-END
      // DEEPSNR-INTEGRATION-BEGIN
      cfg.deepsnr = optBuildPostDeepSnrConfigFromDialog(dialog);
      // DEEPSNR-INTEGRATION-END
   } else if (cfg.actionKey === "post_sharp") {
      cfg.useMask = optChecked(dialog.chkPostSharpUseMask, false);
      cfg.algorithmIndex = dialog.comboPostSharp ? dialog.comboPostSharp.currentItem : 0;
      // Stable dispatch id (see optPostSharpCanonicalEntries) — robust to combo
      // ordering, the parallax revert flag, and label rename/translation.
      cfg.sharpId = dialog.comboPostSharp ? optPostSharpIdForCanonical(optComboCanonicalItem(dialog.comboPostSharp)) : "bxt";
      // PARALLAX-INTEGRATION-BEGIN (post sharpen config): keep the label for logging.
      cfg.algorithmLabel = "";
      try { cfg.algorithmLabel = dialog.comboPostSharp.itemText(cfg.algorithmIndex); } catch (eSL) {}
      cfg.parallax = optBuildPostParallaxConfigFromControls(dialog);
      // PARALLAX-INTEGRATION-END (post sharpen config)
      cfg.blurX = optBuildPostBlurXConfigFromControls(dialog);
      cfg.unsharpMask = optBuildPostUnsharpMaskConfigFromDialog(dialog);
      cfg.hdrMt = optBuildPostHdrMtConfigFromDialog(dialog);
      cfg.lhe = optBuildPostLheConfigFromDialog(dialog);
      cfg.dseAmount = optNumericValue(dialog.ncPostDseAmount, 0.18);
      cfg.cosmicClarity = optBuildPostCosmicClaritySharpenConfigFromDialog(dialog);
   } else if (cfg.actionKey === "post_color") {
      cfg.useMask = optChecked(dialog.chkPostColorUseMask, false);
      cfg.colorBalance = optBuildPostColorBalanceConfigFromDialog(dialog);
   } else if (cfg.actionKey === "post_curves") {
      cfg.useMask = optChecked(dialog.chkPostCurvesUseMask, false);
      cfg.curves = optBuildPostCurvesConfigFromDialog(dialog);
   }
   return cfg;
}

function optApplyPostCandidate(view, actionKey, dialog) {
   if (!optSafeView(view))
      throw new Error("No valid Post candidate view.");
   var cfg = (actionKey && typeof actionKey === "object") ? actionKey : optBuildPostCandidateConfig(dialog, actionKey);
   actionKey = cfg.actionKey || "";
   if (actionKey === "post_nr") {
      return optRunPostOperationWithOptionalMask(view, dialog, cfg.useMask === true, function(targetView) {
         var idx = cfg.algorithmIndex;
         if (idx === 0)
            return optExecuteNoiseXConfiguredOnView(targetView, cfg.nxt);
         if (idx === 1)
            return optExecuteTgvDenoiseConfiguredOnView(targetView, cfg.tgv);
         if (idx === 2) {
            if (OPT_TEST_MODE)
               return optRunTestModePreviewTransform(targetView, "darken", 0.09);
            if (!optIsCosmicClarityAvailable())
               throw new Error("Cosmic Clarity: ExternalProcess not available in this PixInsight build.");
            return optRunCosmicClarityOnView(targetView, cfg.cosmicClarity);
         }
         if (idx === 3)
            return optRunGraXpertDenoiseProcessWorkflow(targetView, dialog);
         // PRISM-INTEGRATION-BEGIN
         if (idx === 4) {
            if (OPT_TEST_MODE)
               return optRunTestModePreviewTransform(targetView, "darken", 0.05);
            if (!optIsPrismAvailable())
               throw new Error("SyQon Prism is not installed or available. Denoise 'Prism (SyQon)' is not available.");
            return optRunSyQonPrismOnView(targetView, cfg.prism, dialog);
         }
         // PRISM-INTEGRATION-END
         // DEEPSNR-INTEGRATION-BEGIN
         if (idx === 5) {
            if (OPT_TEST_MODE)
               return optRunTestModePreviewTransform(targetView, "darken", 0.08);
            if (!optIsDeepSNRAvailable())
               throw new Error("DeepSNR is not installed or available.");
            return optExecuteDeepSNROnView(targetView, cfg.deepsnr);
         }
         // DEEPSNR-INTEGRATION-END
         return targetView;
      });
   }
   if (actionKey === "post_sharp") {
      return optRunPostOperationWithOptionalMask(view, dialog, cfg.useMask === true, function(targetView) {
         // Dispatch by the stable algorithm id (see optPostSharpCanonicalEntries):
         // robust to combo ordering, the OPT_PRE_PARALLAX_ENABLED revert flag AND to
         // any future rename/translation of the display label.
         var sharpId = cfg.sharpId || "bxt";
         // PARALLAX-INTEGRATION-BEGIN (post sharpen dispatch)
         if (sharpId === "parallax") {
            if (OPT_TEST_MODE)
               return optRunTestModePreviewTransform(targetView, "contrast", 0.10);
            if (typeof optIsParallaxAvailable !== "function" || !optIsParallaxAvailable())
               throw new Error("Parallax (SyQon): the SyQon Parallax script/executable is not installed or configured. Open and configure the SyQon Parallax standalone script first.");
            return optRunSyQonParallaxOnView(targetView, cfg.parallax, dialog);
         }
         // PARALLAX-INTEGRATION-END (post sharpen dispatch)
         if (sharpId === "usm")
            return optExecuteUnsharpMaskConfiguredOnView(targetView, cfg.unsharpMask);
         if (sharpId === "hdr")
            return optExecuteHdrMtConfiguredOnView(targetView, cfg.hdrMt);
         if (sharpId === "lhe")
            return optExecuteLheConfiguredOnView(targetView, cfg.lhe);
         if (sharpId === "dse")
            return optApplyFallbackTransform(targetView, "contrast", cfg.dseAmount);
         if (sharpId === "cc") {
            if (OPT_TEST_MODE)
               return optRunTestModePreviewTransform(targetView, "contrast", 0.14);
            return optRunCosmicClarityOnView(targetView, cfg.cosmicClarity);
         }
         // Default / "bxt" (BlurXTerminator).
         return optExecuteBlurXConfiguredOnView(targetView, cfg.blurX);
      });
   }
   if (actionKey === "post_color")
      return optRunPostOperationWithOptionalMask(view, dialog, cfg.useMask === true, function(targetView) {
         return optApplyColorBalanceFromState(targetView, cfg.colorBalance);
      });
   if (actionKey === "post_curves")
      return optRunPostOperationWithOptionalMask(view, dialog, cfg.useMask === true, function(targetView) {
         return optApplyCurvesFromState(targetView, cfg.curves.channelIndex, cfg.curves.points, cfg.curves.controls);
      });
   return view;
}

function optLiveCandidateMaxDim(dialog, referenceView) {
   var longest = OPT_LIVE_CANDIDATE_MAX_DIM;
   try {
      if (optSafeView(referenceView))
         longest = Math.max(referenceView.image.width, referenceView.image.height);
   } catch (e0) {}
   var maxDim = OPT_LIVE_CANDIDATE_MAX_DIM;
   try {
      var reduction = dialog.sharedPreviewReduction || OPT_PREVIEW_REDUCTION_DEFAULT;
      if (isFinite(reduction) && reduction > 1)
         maxDim = Math.min(maxDim, Math.max(128, Math.round(longest / reduction)));
   } catch (e1) {}
   return Math.max(128, Math.min(longest, maxDim));
}

// PERF-PLAN-A-BEGIN: longest image dimension → used as a no-op downsample cap so a
// live candidate keeps full resolution (sharp at any zoom). Returns 0 on failure,
// which makes callers fall back to the default reduced cap.
function optLiveFullResDim(view) {
   try {
      if (optSafeView(view))
         return Math.max(view.image.width, view.image.height);
   } catch (e0) {}
   return 0;
}
// PERF-PLAN-A-END

function optCreateLiveCandidateView(sourceView, baseId, dialog, maxDimOverride) {
   if (!optSafeView(sourceView))
      throw new Error("No valid source view for live preview.");
   
   var win = dialog ? dialog.__reusableLiveWindow : null;
   var canReuse = false;
   if (win && !win.isNull && optSafeView(win.mainView)) {
      var mv = win.mainView;
      if (mv.image.numberOfChannels === sourceView.image.numberOfChannels &&
          mv.image.colorSpace === sourceView.image.colorSpace) {
         canReuse = true;
      } else {
         win.isReusable = false;
         mv.isReusable = false;
         try { win.forceClose(); } catch (eClose) {}
         if (dialog) dialog.__reusableLiveWindow = null;
      }
   }

   var candidate;
   if (canReuse) {
      candidate = win.mainView;
      candidate.beginProcess(UndoFlag_NoSwapFile);
      candidate.image.assign(sourceView.image);
      candidate.endProcess();
   } else {
      candidate = optCloneView(sourceView, baseId || "Opt_LiveCandidate", false);
      if (!optSafeView(candidate))
         throw new Error("Could not create live preview candidate.");
      candidate.window.isReusable = true;
      candidate.isReusable = true;
      if (dialog) {
         dialog.__reusableLiveWindow = candidate.window;
      }
   }

   try {
      // PERF-PLAN-A-BEGIN: full-res override (curvas live). maxDimOverride = longest
      // image dim → optDownsamplePreparedView is a no-op → candidate stays full-res.
      var cap = (maxDimOverride && maxDimOverride > 0) ? maxDimOverride : optLiveCandidateMaxDim(dialog, sourceView);
      optDownsamplePreparedView(candidate, cap);
      // PERF-PLAN-A-END
      return candidate;
   } catch (e) {
      if (!canReuse) {
         candidate.window.isReusable = false;
         candidate.isReusable = false;
         optCloseView(candidate);
         if (dialog) dialog.__reusableLiveWindow = null;
      }
      throw e;
   }
}

function optBuildFullResPostCandidate(dialog, stageName, actionKey) {
   var pane = dialog && dialog.postTab ? dialog.postTab.preview : null;
   if (!pane || !optSafeView(pane.currentView))
      return null;
   var full = optCloneView(pane.currentView, "Opt_Candidate_" + pane.currentKey + "_" + stageName + "_Full", false);
   try {
      return optApplyPostCandidate(full, actionKey, dialog) || full;
   } catch (e) {
      optCloseView(full);
      throw e;
   }
}

function optSchedulePostLiveCandidate(dialog, key, stageName, actionKey, delayMs) {
   if (!dialog || !dialog.previewScheduler || !dialog.postTab || !dialog.postTab.preview)
      return;
   dialog.previewScheduler.request(key, function() {
      dialog.postTab.preview.beginCandidateFromFactory(stageName + " (live)", function(currentView) {
         // PERF-PLAN-A-BEGIN: full-res live candidate for Post Curves only (matches
         // the render() reduction override keyed on "post_curves"). Other post
         // actions (e.g. post_color) keep the reduced cap.
         var fullCap = (actionKey === "post_curves") ? optLiveFullResDim(currentView) : 0;
         var live = optCreateLiveCandidateView(currentView, "Opt_Live_" + actionKey, dialog, fullCap);
         // PERF-PLAN-A-END
         return optApplyPostCandidate(live, actionKey, dialog) || live;
      }, actionKey, {
         upgradeFn: function() {
            return optBuildFullResPostCandidate(dialog, stageName, actionKey);
         }
      });
   }, {
      debounceMs: delayMs || 120,
      statusLabel: dialog.postTab.preview.status,
      busyText: "<b>Live:</b> rendering " + stageName + "...",
      doneText: "<b>Live:</b> " + stageName + " preview ready.",
      errorText: "<b>Live:</b> " + stageName + " preview failed.",
      onError: function(k, e) { console.warningln(stageName + " live preview error: " + e.message); }
   });
}

// IMG-ENH: live preview for the Color Mixer. The per-pixel engine is JS, so for
// interactivity the live candidate is a fresh clone DOWNSAMPLED to the preview's
// display resolution (≈ full-res / reduction → ~reduction² fewer pixels) and
// render() shows it 1:1 (forceFullRes for "imgenh_colormixer"). "Use this Image"
// upgrades to a full-resolution result via upgradeFn. Debounced to coalesce drags.
function optScheduleImageEnhLive(dialog, actionKey, delayMs) {
   if (!dialog || !dialog.previewScheduler || !dialog.imgEnhTab || !dialog.imgEnhTab.preview)
      return;
   // Back-compat: old signature was (dialog, delayMs) for the Color Mixer.
   if (typeof actionKey === "number") { delayMs = actionKey; actionKey = "imgenh_colormixer"; }
   if (!actionKey) actionKey = "imgenh_colormixer";
   var label = (actionKey === "imgenh_detail") ? "Detail & Contrast" : "Color Mixer";
   var pane = dialog.imgEnhTab.preview;
   dialog.previewScheduler.request("imgenh." + actionKey, function() {
      pane.beginCandidateFromFactory(label + " (live)", function(currentView) {
         var clone = optCloneView(currentView, "Opt_Live_" + actionKey + "_" + (pane.currentKey || "x"), false);
         try {
            var reduction = dialog.sharedPreviewReduction || OPT_PREVIEW_REDUCTION_DEFAULT;
            var longest = Math.max(currentView.image.width, currentView.image.height);
            var cap = Math.max(256, Math.round(longest / Math.max(1, reduction)));
            optDownsamplePreparedView(clone, cap);
            return optApplyImageEnhCandidate(clone, actionKey, dialog) || clone;
         } catch (e) {
            optCloseView(clone);
            throw e;
         }
      }, actionKey, {
         upgradeFn: function() {
            if (!optSafeView(pane.currentView))
               return null;
            var full = optCloneView(pane.currentView, "Opt_Candidate_" + pane.currentKey + "_" + actionKey + "_Full", false);
            try {
               return optApplyImageEnhCandidate(full, actionKey, dialog) || full;
            } catch (e) {
               optCloseView(full);
               throw e;
            }
         }
      });
   }, {
      debounceMs: delayMs || 120,
      statusLabel: pane.status,
      busyText: "<b>Live:</b> rendering " + label + "...",
      doneText: "<b>Live:</b> " + label + " preview ready.",
      errorText: "<b>Live:</b> " + label + " preview failed.",
      onError: function(k, e) { console.warningln(label + " live preview error: " + e.message); }
   });
}

var OPT_CC_BLEND_MODES = [
   "Replace", "Darken/Min", "Multiply", "Colour burn", "Linear burn", "Darker colour",
   "Lighten/Max", "Screen", "Colour dodge", "Linear dodge/Add", "Lighter colour",
   "Overlay", "Soft light", "Hard light", "Vivid light", "Linear light", "Pin light",
   "Difference", "Exclusion", "Subtract", "Divide", "Power", "Arctan", "Hue", "Saturation", "Lightness"
];

