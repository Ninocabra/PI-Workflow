function OptStretchingEngine() {
   function clampMasUnitInterval(v, fallbackValue) {
      var x = isFinite(v) ? v : fallbackValue;
      if (!isFinite(x))
         x = 0.0;
      return Math.max(0.0, Math.min(1.0, x));
   }

   function medianOfThree(a, b, c) {
      if (a > b) { var t1 = a; a = b; b = t1; }
      if (b > c) { var t2 = b; b = c; c = t2; }
      if (a > b) { var t3 = a; a = b; b = t3; }
      return b;
   }

   function buildMasLuminanceIntegral(view) {
      var img = view.image;
      var w = img.width;
      var h = img.height;
      var isRGB = optViewIsColor(view);
      var stride = w + 1;
      var integralLength = (w + 1) * (h + 1);
      var integral = (typeof Float32Array !== "undefined") ? new Float32Array(integralLength) : [];
      if (!(integral instanceof Float32Array))
         for (var ii = 0; ii < integralLength; ++ii)
            integral[ii] = 0.0;

      var rRow = (typeof Float32Array !== "undefined") ? new Float32Array(w) : new Array(w);
      var gRow = isRGB ? ((typeof Float32Array !== "undefined") ? new Float32Array(w) : new Array(w)) : null;
      var bRow = isRGB ? ((typeof Float32Array !== "undefined") ? new Float32Array(w) : new Array(w)) : null;
      for (var y = 1; y <= h; ++y) {
         var rowAccum = 0.0;
         var rowIndex = y * stride;
         var prevRowIndex = (y - 1) * stride;
         var rect = new Rect(0, y - 1, w, y);
         img.getSamples(rRow, rect, 0);
         if (isRGB) {
            img.getSamples(gRow, rect, 1);
            img.getSamples(bRow, rect, 2);
         }
         for (var x = 1; x <= w; ++x) {
            var xi = x - 1;
            rowAccum += isRGB ? medianOfThree(rRow[xi], gRow[xi], bRow[xi]) : rRow[xi];
            integral[rowIndex + x] = integral[prevRowIndex + x] + rowAccum;
         }
      }

      return {
         integral: integral,
         stride: stride,
         width: w,
         height: h
      };
   }

   function masWindowMeanFromIntegral(integralInfo, x0, y0, roiW, roiH) {
      var stride = integralInfo.stride;
      var data = integralInfo.integral;
      var x1 = x0 + roiW;
      var y1 = y0 + roiH;
      var a = data[y0 * stride + x0];
      var b = data[y0 * stride + x1];
      var c = data[y1 * stride + x0];
      var d = data[y1 * stride + x1];
      return (d - b - c + a) / (roiW * roiH);
   }

   function pushMasRoiCandidate(topCandidates, candidate, maxCandidates) {
      if (topCandidates.length < maxCandidates) {
         topCandidates.push(candidate);
         topCandidates.sort(function(a, b) {
            if (a.mean !== b.mean)
               return a.mean - b.mean;
            return a.y0 - b.y0 || a.x0 - b.x0;
         });
         return;
      }
      var last = topCandidates[topCandidates.length - 1];
      if (candidate.mean < last.mean) {
         topCandidates[topCandidates.length - 1] = candidate;
         topCandidates.sort(function(a, b) {
            if (a.mean !== b.mean)
               return a.mean - b.mean;
            return a.y0 - b.y0 || a.x0 - b.x0;
         });
      }
   }

   function computeMasRoiRobustStats(view, x0, y0, roiW, roiH) {
      var img = view.image;
      var isRGB = optViewIsColor(view);
      var size = roiW * roiH;
      var useTyped = (typeof Float64Array !== "undefined" && typeof Float64Array.prototype.sort === "function");
      var values = useTyped ? new Float64Array(size) : new Array(size);
      var n = 0;
      var rRow = (typeof Float32Array !== "undefined") ? new Float32Array(roiW) : new Array(roiW);
      var gRow = isRGB ? ((typeof Float32Array !== "undefined") ? new Float32Array(roiW) : new Array(roiW)) : null;
      var bRow = isRGB ? ((typeof Float32Array !== "undefined") ? new Float32Array(roiW) : new Array(roiW)) : null;
      for (var y = y0; y < y0 + roiH; ++y) {
         var rect = new Rect(x0, y, x0 + roiW, y + 1);
         img.getSamples(rRow, rect, 0);
         if (isRGB) {
            img.getSamples(gRow, rect, 1);
            img.getSamples(bRow, rect, 2);
         }
         for (var x = 0; x < roiW; ++x)
            values[n++] = isRGB ? medianOfThree(rRow[x], gRow[x], bRow[x]) : rRow[x];
      }
      if (useTyped) {
         values.sort();
      } else {
         values.sort(function(a, b) { return a - b; });
      }
      var median = 0.0;
      if (n > 0) {
         var half = Math.floor(n / 2);
         median = (n & 1) ? values[half] : 0.5 * (values[half - 1] + values[half]);
      }
      var deviations = useTyped ? new Float64Array(n) : new Array(n);
      for (var i = 0; i < n; ++i)
         deviations[i] = Math.abs(values[i] - median);
      if (useTyped) {
         deviations.sort();
      } else {
         deviations.sort(function(a, b) { return a - b; });
      }
      var mad = 0.0;
      if (n > 0) {
         var halfMad = Math.floor(n / 2);
         mad = (n & 1) ? deviations[halfMad] : 0.5 * (deviations[halfMad - 1] + deviations[halfMad]);
      }
      return {
         x0: x0,
         y0: y0,
         width: roiW,
         height: roiH,
         median: median,
         mad: mad,
         score: median + 0.35 * mad
      };
   }

   function findMasBackgroundROI(view, requestedWidth, requestedHeight) {
      if (!optSafeView(view))
         return null;
      var img = view.image;
      var w = img.width;
      var h = img.height;
      if (w <= 0 || h <= 0)
         return null;
      var roiW = Math.max(1, Math.min(Math.round(requestedWidth || 25), w));
      var roiH = Math.max(1, Math.min(Math.round(requestedHeight || 25), h));
      var maxX0 = Math.max(0, w - roiW);
      var maxY0 = Math.max(0, h - roiH);
      var integralInfo = buildMasLuminanceIntegral(view);
      var topCandidates = [];
      var maxCandidates = 12;
      for (var y0 = 0; y0 <= maxY0; ++y0)
         for (var x0 = 0; x0 <= maxX0; ++x0)
            pushMasRoiCandidate(topCandidates, {
               x0: x0,
               y0: y0,
               mean: masWindowMeanFromIntegral(integralInfo, x0, y0, roiW, roiH)
            }, maxCandidates);
      integralInfo.integral = null;
      integralInfo = null;
      gc();
      if (topCandidates.length <= 0)
         return { x0: 0, y0: 0, width: roiW, height: roiH, median: 0.0, mad: 0.0, score: 0.0 };
      var tested = {};
      var best = null;
      for (var iCand = 0; iCand < topCandidates.length; ++iCand) {
         var cand = topCandidates[iCand];
         for (var oy = -3; oy <= 3; ++oy) {
            for (var ox = -3; ox <= 3; ++ox) {
               var xx = Math.max(0, Math.min(maxX0, cand.x0 + ox));
               var yy = Math.max(0, Math.min(maxY0, cand.y0 + oy));
               var key = xx + "_" + yy;
               if (optHasOwn(tested, key) && tested[key] === true)
                  continue;
               tested[key] = true;
               var stats = computeMasRoiRobustStats(view, xx, yy, roiW, roiH);
               if (!best ||
                   stats.score < best.score ||
                   (stats.score === best.score && stats.mad < best.mad) ||
                   (stats.score === best.score && stats.mad === best.mad && stats.y0 < best.y0) ||
                   (stats.score === best.score && stats.mad === best.mad && stats.y0 === best.y0 && stats.x0 < best.x0))
                  best = stats;
            }
         }
      }
      return best;
   }

   function configureMasProcessInstance(mas, targetView, params, isRGB) {
      var roi = findMasBackgroundROI(targetView, 25, 25);
      var targetBackground = clampMasUnitInterval(params.ms_bg, 0.150);
      var aggressiveness = clampMasUnitInterval(params.ms_agg, 0.70);
      var drc = clampMasUnitInterval(params.ms_drc, 0.40);
      var contrastIntensity = clampMasUnitInterval(params.ms_cr_int, 1.000);
      var saturationAmount = clampMasUnitInterval(params.ms_cs_amt, 0.75);
      var saturationBoost = clampMasUnitInterval(params.ms_cs_boost, 0.50);
      var scaleSeparation = Math.max(16, Math.round(isFinite(params.ms_cr_scale) ? params.ms_cr_scale : 1024));

      mas.aggressiveness = aggressiveness;
      mas.targetBackground = targetBackground;
      mas.dynamicRangeCompression = drc;
      mas.contrastRecovery = (params.ms_cr === true);
      mas.scaleSeparation = scaleSeparation;
      mas.contrastRecoveryIntensity = mas.contrastRecovery ? contrastIntensity : 0.0;
      mas.previewLargeScale = false;
      mas.saturationEnabled = (isRGB && params.ms_cs === true);
      mas.saturationAmount = mas.saturationEnabled ? saturationAmount : 0.0;
      mas.saturationBoost = mas.saturationEnabled ? saturationBoost : 0.0;
      mas.saturationLightnessMask = (mas.saturationEnabled && params.ms_cs_light === true);
      if (params && params.narrowband === true) {
         optSetOptionalProcessProperty(mas, ["narrowbandMode", "narrowBandMode", "preserveNarrowbandRatios"], true);
         optSetOptionalProcessProperty(mas, ["preserveHue", "preserveColors", "preserveChrominance"], true);
      }

      if (roi) {
         mas.backgroundROIEnabled = true;
         mas.backgroundROIX0 = roi.x0;
         mas.backgroundROIY0 = roi.y0;
         mas.backgroundROIWidth = roi.width;
         mas.backgroundROIHeight = roi.height;
      } else {
         mas.backgroundROIEnabled = false;
      }
      return roi;
   }

   function configureStretchPixelMath(P) {
      P.clearImageCacheAndExit = false;
      P.cacheGeneratedImages = false;
      P.generateOutput = true;
      P.singleThreaded = false;
      P.optimization = true;
      P.use64BitWorkingImage = true;
      P.rescale = false;
      P.createNewImage = false;
      P.showNewImage = true;
   }

   function runStarStretch(view, params) {
      var stretchAmount = params && isFinite(params.star_amount) ? params.star_amount : 5.0;
      var saturationAmount = params && isFinite(params.star_sat) ? params.star_sat : 1.0;
      var removeGreen = params && params.star_removeGreen === true;
      var P = new PixelMath();
      P.useSingleExpression = true;
      P.expression = "((3^" + stretchAmount + ")*$T)/((3^" + stretchAmount + " - 1)*$T + 1)";
      configureStretchPixelMath(P);
      P.executeOn(view);
      if (view.image.numberOfChannels >= 3) {
         var C = new ColorSaturation();
         C.HS = [
            [0.00000, saturationAmount * 0.40000],
            [0.50000, saturationAmount * 0.70000],
            [1.00000, saturationAmount * 0.40000]
         ];
         C.HSt = ColorSaturation.prototype.AkimaSubsplines;
         C.hueShift = 0.000;
         C.executeOn(view);
         if (removeGreen) {
            var S = new SCNR();
            S.amount = 1.00;
            S.protectionMethod = SCNR.prototype.AverageNeutral;
            S.colorToRemove = SCNR.prototype.Green;
            S.preserveLightness = true;
            S.executeOn(view);
         }
      }
   }

   this.runStretch = function(view, algoId, params) {
      if (!optSafeView(view))
         return;
      params = params || {};
      var c = view.image.numberOfChannels;
      var isRGB = (c === 3);

      if (algoId === "STF") {
         var shadows = [];
         var midtones = [];
         var eff_shadow = params.stf_boost ? (params.stf_shadow * params.stf_boost_clip) : params.stf_shadow;
         var eff_mid = params.stf_boost ? (params.stf_mid * params.stf_boost_bg) : params.stf_mid;
         eff_mid = Math.min(0.999, Math.max(0.001, eff_mid));
         for (var i = 0; i < c; ++i) {
            view.image.selectedChannel = i;
            var med = view.image.median();
            var mad = view.image.MAD();
            var sh = Math.max(0, med + eff_shadow * mad);
            var val = med - sh;
            var m = 0.5;
            if (val > 0)
               m = (eff_mid - 1) * val / ((2 * eff_mid - 1) * val - eff_mid);
            shadows.push(sh);
            midtones.push(m);
         }
         view.image.resetSelections();
         var ht = new HistogramTransformation();
         if (c === 3)
            ht.H = [ [shadows[0], midtones[0], 1, 0, 1], [shadows[1], midtones[1], 1, 0, 1], [shadows[2], midtones[2], 1, 0, 1], [0, 0.5, 1, 0, 1], [0, 0.5, 1, 0, 1] ];
         else
            ht.H = [ [0, 0.5, 1, 0, 1], [0, 0.5, 1, 0, 1], [0, 0.5, 1, 0, 1], [shadows[0], midtones[0], 1, 0, 1], [0, 0.5, 1, 0, 1] ];
         ht.executeOn(view);
      } else if (algoId === "MAS") {
         var mas = new MultiscaleAdaptiveStretch();
         configureMasProcessInstance(mas, view, params, isRGB);
         mas.executeOn(view);
      } else if (algoId === "SS") {
         var P = new ProcessContainer();
         var P001 = new PixelMath();
         if (isRGB) {
            // Per-channel blackpoint for RGB: each channel uses its own median and MAD.
            // A shared luminance-weighted blackpoint causes green cast on SPCC-calibrated images.
            // expression0/1/2 require pure math expressions (no variable declarations).
            P001.useSingleExpression = false;
            var bpInline = params.stat_noclip ?
               "min($T)" :
               "iif((med($T)-" + params.stat_bp + "*1.4826*MAD($T))<min($T),min($T),med($T)-" + params.stat_bp + "*1.4826*MAD($T))";
            var bpExpr = "($T-(" + bpInline + "))/(1-(" + bpInline + "))";
            P001.expression0 = bpExpr;
            P001.expression1 = bpExpr;
            P001.expression2 = bpExpr;
         } else {
            P001.useSingleExpression = true;
            P001.symbols = "Med,Sig,MinC,BPraw,BP,Rescaled";
            P001.expression = "Med = med($T);\nSig = 1.4826*MAD($T);\nMinC = min($T);\nBPraw = Med - " + params.stat_bp + "*Sig;\nBP = iif(" + (params.stat_noclip ? "1" : "0") + ", MinC, iif(BPraw < MinC, MinC, BPraw));\nRescaled = ($T - BP) / (1 - BP);\nRescaled;";
         }
         configureStretchPixelMath(P001);
         P.add(P001);
         if (params.stat_luma && isRGB) {
            var b = Math.max(0, Math.min(1, params.stat_blend));
            var P002L = new PixelMath();
            P002L.useSingleExpression = true;
            P002L.symbols = "cr,cg,cb,Y,mr,mg,mb,MedianColor,Linked,mY,Yp,f,Luma,b";
            P002L.expression = "cr=0.2126; cg=0.7152; cb=0.0722;\nY = cr*$T[0] + cg*$T[1] + cb*$T[2];\nmr = med($T[0]); mg = med($T[1]); mb = med($T[2]);\nMedianColor = avg(mr,mg,mb);\nLinked = ((MedianColor-1)*" + params.stat_med + "*$T)/(MedianColor*(" + params.stat_med + "+$T-1)-" + params.stat_med + "*$T);\nmY = cr*mr + cg*mg + cb*mb;\nYp = ((mY-1)*" + params.stat_med + "*Y)/(mY*(" + params.stat_med + "+Y-1)-" + params.stat_med + "*Y);\nf = iif(Y<=1.0e-10, 1, Yp/Y);\nLuma = $T*f;\nb=" + b + ";\n((1-b)*Linked + b*Luma);";
            configureStretchPixelMath(P002L);
            P.add(P002L);
         } else {
            var P002 = new PixelMath();
            if (isRGB) {
               // Per-channel midtone stretch for RGB: each channel uses its own median as pivot.
               // A shared avg-median pivot stretches G more than R/B when G median > average.
               // expression0/1/2 require pure math expressions (no variable declarations).
               P002.useSingleExpression = false;
               var ssExpr = "((med($T)-1)*" + params.stat_med + "*$T)/(med($T)*(" + params.stat_med + "+$T-1)-" + params.stat_med + "*$T)";
               P002.expression0 = ssExpr;
               P002.expression1 = ssExpr;
               P002.expression2 = ssExpr;
            } else {
               P002.useSingleExpression = true;
               P002.symbols = "MedianColor";
               P002.expression = "MedianColor = med($T);\n((MedianColor-1)*" + params.stat_med + "*$T)/(MedianColor*(" + params.stat_med + "+$T-1)-" + params.stat_med + "*$T)";
            }
            configureStretchPixelMath(P002);
            P.add(P002);
         }
         if (params.stat_norm) {
            var P003 = new PixelMath();
            P003.useSingleExpression = true;
            P003.symbols = "Mcolor";
            if (isRGB)
               P003.expression = "Mcolor=max(max($T[0]),max($T[1]),max($T[2]));\n$T/Mcolor;";
            else
               P003.expression = "Mcolor=max($T);\n$T/Mcolor;";
            configureStretchPixelMath(P003);
            P.add(P003);
         }
         P.executeOn(view);
         if (params.stat_hdr) {
            var hdrLayers = Math.max(3, Math.min(8, Math.round(6 * params.stat_hdramt + 2)));
            var hdrOverdrive = Math.max(0, Math.min(1, params.stat_hdrknee));
            try {
               var hdrSS = new HDRMultiscaleTransform();
               hdrSS.numberOfLayers = hdrLayers;
               hdrSS.numberOfIterations = 1;
               hdrSS.overdrive = hdrOverdrive;
               hdrSS.medianTransform = false;
               hdrSS.invertedIterations = false;
               hdrSS.lightnessMask = true;
               hdrSS.toLightness = isRGB;
               try { hdrSS.preserveHue = true; } catch (eHdr0) {}
               hdrSS.executeOn(view);
            } catch (eHdr) {
               console.warningln("=> SS HDR Compress HDRMT failed: " + eHdr.message);
            }
         }
         if (params.stat_curve > 0) {
            var C = new CurvesTransformation();
            C.Bt = CurvesTransformation.prototype.AkimaSubsplines;
            C.K = [
               [0.0, 0.0],
               [0.5 * params.stat_med, 0.5 * params.stat_med],
               [params.stat_med, params.stat_med],
               [(1 / 4 * (1 - params.stat_med) + params.stat_med), Math.pow((1 / 4 * (1 - params.stat_med) + params.stat_med), (1 - params.stat_curve))],
               [(3 / 4 * (1 - params.stat_med) + params.stat_med), Math.pow(Math.pow((3 / 4 * (1 - params.stat_med) + params.stat_med), (1 - params.stat_curve)), (1 - params.stat_curve))],
               [1.0, 1.0]
            ];
            C.St = CurvesTransformation.prototype.AkimaSubsplines;
            C.executeOn(view);
         }
      } else if (algoId === "STAR") {
         runStarStretch(view, params);
      } else if (algoId === "AGHS") {
         optRunAutoGhsStretch(view, params);
      }
   };
}

function optEqualizeSkyBackgroundsBeforeStretch(view) {
   if (!optSafeView(view) || view.image.numberOfChannels < 3) return;
   var img = view.image;
   img.selectedChannel = 0; var mR = img.median();
   img.selectedChannel = 1; var mG = img.median();
   img.selectedChannel = 2; var mB = img.median();
   img.resetSelections();
   var avgM = (mR + mG + mB) / 3.0;
   if (Math.abs(mR - avgM) < 1.0e-9 && Math.abs(mG - avgM) < 1.0e-9 && Math.abs(mB - avgM) < 1.0e-9)
      return;
   var P = new PixelMath();
   P.clearImageCacheAndExit = false;
   P.cacheGeneratedImages = false;
   P.generateOutput = true;
   P.singleThreaded = false;
   P.optimization = true;
   P.use64BitWorkingImage = true;
   P.rescale = false;
   P.createNewImage = false;
   P.showNewImage = true;
   P.useSingleExpression = false;
   P.expression0 = "$T+(" + (avgM - mR).toFixed(10) + ")";
   P.expression1 = "$T+(" + (avgM - mG).toFixed(10) + ")";
   P.expression2 = "$T+(" + (avgM - mB).toFixed(10) + ")";
   P.executeOn(view);
}

function optApplyStretchCandidate(view, algoId, zone, dialog) {
   console.writeln("=> Stretch preview path: " + (algoId || "STF"));
   if ((algoId || "").toUpperCase() === "CURVES")
      return optApplyCurvesFromState(view, zone.curvesChan ? zone.curvesChan.combo.currentItem : 0, zone.curvesPoints, {
         contrast: zone.curvesContrast,
         brightness: zone.curvesBright,
         shadows: zone.curvesShadows,
         highlights: zone.curvesHighlights,
         saturation: zone.curvesSaturation
      });
   // NB->RGB stars (Stretching > Stars zone option): colour the RGB stars from the
   // narrowband channels via the SetiAstro transform instead of the normal star stretch.
   if (zone && zone.isStars && optChecked(zone.useNbStars, false) && optHasNbInfoForStars(dialog)) {
      console.writeln("=> Star stretch: using NB stars to produce RGB stars (SetiAstro transform).");
      if (optApplyNbStarsRGB(view, dialog, {
            stretchFactor: optNumericValue(zone.starAmount, 5),
            colorBoost: optNumericValue(zone.nbColorBoost, 1.0)
         })) return view;
      console.warningln("=> NB->RGB stars unavailable; falling back to normal star stretch.");
   }
   var params = optStretchParamsFromZone(zone || {});
   var algo = (algoId || "STF").toUpperCase();
   if ((algo === "MAS" || algo === "AGHS") && view.image.numberOfChannels >= 3) {
      var stretchKey = dialog && dialog.stretchTab ? dialog.stretchTab.preview.currentKey : "";
      var stretchRec = (stretchKey && dialog.store) ? dialog.store.record(stretchKey) : null;
      var stretchNbProfile = optGetNarrowbandProfileForView(view, dialog, stretchKey);
      if (stretchNbProfile && !stretchNbProfile.isMono) {
         params.narrowband = true;
         params.narrowbandDescription = stretchNbProfile.description;
         console.writeln("=> " + algo + ": narrowband RGB composite detected (" + stretchNbProfile.description + "). Channel emission-line ratios are preserved; broadband background equalization is skipped.");
      } else if (optRecordHasColorCorrection(stretchRec)) {
         optEqualizeSkyBackgroundsBeforeStretch(view);
         console.writeln("=> " + algo + ": Color-calibrated broadband image. Channel backgrounds equalized before stretch.");
      }
   }
   dialog.stretchEngine.runStretch(view, algo, params);
   return view;
}

function optOpenPathWithSystemViewer(path) {
   if (!path || path.length < 1)
      return false;
   try {
      if (!File.exists(path))
         throw new Error("File not found: " + path);
      if (typeof ExternalProcess === "undefined")
         throw new Error("ExternalProcess is not available in this PixInsight build.");
      var ep = new ExternalProcess();
      if (optIsWindowsPlatform())
         return ep.start("cmd", ["/c", "start", "", path]);
      if (optIsMacOSPlatform())
         return ep.start("open", [path]);
      return ep.start("xdg-open", [path]);
   } catch (e) {
      try { console.warningln("Could not open help file: " + e.message); } catch (e0) {}
   }
   return false;
}

// Opens the help XHTML in the system's default browser, scrolled to a
// specific anchor (e.g. "sec-13"). File existence is verified against the
// bare path (anchors are not valid filenames). The browser handles the
// "#anchor" fragment natively, which gives reliable scroll-to-section
// behaviour — unlike the in-script TextBox which leaves the visible
// scroll at the bottom after a long rich-text load on this PJSR build.
//
// Windows quirk: `cmd /c start "" "file:///path#anchor"` does NOT route
// the argument through the URL handler — start treats the whole string
// as a file path and Windows then reports "cannot find ...#sec-13"
// because the hash is taken literally. The canonical Windows API for
// opening a URL (including file:// with a fragment) is
// `rundll32 url.dll,FileProtocolHandler URL`, which dispatches to the
// default browser exactly as if the URL were clicked.
function optHelpFilePath() {
   var base = (#__FILE__).replace(/[^\\/]+$/, "");
   if (typeof OPT_LANG !== "undefined" && OPT_LANG === "es") {
      var esPath = base + "PI Workflow_help_es.xhtml";
      if (File.exists(esPath)) return esPath;
   }
   return base + "PI Workflow_help.xhtml";
}

function optOpenHelpAtAnchor(anchor) {
   try {
      var helpPath = optHelpFilePath();
      if (!File.exists(helpPath))
         throw new Error("Help file not found: " + helpPath);
      if (typeof ExternalProcess === "undefined")
         throw new Error("ExternalProcess is not available in this PixInsight build.");
      // Normalise to forward slashes so the browser parses the file URL
      // cleanly, then append the fragment.
      var url = "file:///" + helpPath.replace(/\\/g, "/");
      if (anchor && anchor.length > 0)
         url += "#" + anchor;
      var ep = new ExternalProcess();
      if (optIsWindowsPlatform()) {
         // Windows path: a temp redirect HTML is the only fully clean
         // option. `explorer.exe URL` does open the browser at the
         // right URL but also pops a File Explorer window as a side
         // effect. `cmd /c start "" URL` and `rundll32 url.dll,
         // FileProtocolHandler URL` either treat the URL fragment as a
         // literal filename or silently no-op on recent Windows builds.
         // The redirect file is a tiny HTML in %TEMP% that opens via
         // the standard file viewer (no Explorer side effect) and
         // bounces the browser to file:///.../help.xhtml#anchor.
         return optOpenHelpAnchorViaTempRedirect(helpPath, anchor);
      }
      if (optIsMacOSPlatform())
         return ep.start("open", [url]);
      return ep.start("xdg-open", [url]);
   } catch (e) {
      try { console.warningln("Could not open help section: " + e.message); } catch (e0) {}
   }
   return false;
}

// Last-resort fallback for Windows: writes a tiny HTML page in the user
// temp folder that immediately redirects to the help file at the desired
// anchor, then opens that page with the standard file viewer. Browsers
// resolve the meta-refresh and respect the fragment on the destination
// URL even when invoked via `start ""`, which is the path used by
// optOpenPathWithSystemViewer.
function optOpenHelpAnchorViaTempRedirect(helpPath, anchor) {
   try {
      if (typeof File === "undefined")
         return false;
      var tempDir = "";
      try { tempDir = File.systemTempDirectory; } catch (e0) { tempDir = ""; }
      if (!tempDir || tempDir.length < 1)
         return false;
      var redirectPath = tempDir + "/pi_workflow_help_jump.html";
      var url = "file:///" + helpPath.replace(/\\/g, "/");
      if (anchor && anchor.length > 0)
         url += "#" + anchor;
      var html =
         "<!doctype html><html><head><meta charset=\"utf-8\">" +
         "<meta http-equiv=\"refresh\" content=\"0;url=" + url + "\">" +
         "<title>PI Workflow Help</title></head><body>" +
         "<p>Opening PI Workflow help at <a href=\"" + url + "\">" + url + "</a>...</p>" +
         "</body></html>";
      try {
         var f = new File();
         f.createForWriting(redirectPath);
         f.outTextLn(html);
         f.close();
      } catch (eW) {
         return false;
      }
      return optOpenPathWithSystemViewer(redirectPath);
   } catch (e) {
      try { console.warningln("optOpenHelpAnchorViaTempRedirect failed: " + e.message); } catch (e1) {}
   }
   return false;
}
// ----------------------------------------------------------------------------
// <<< CHANNEL FIELD \u2014 Phase 4b ends here >>>
// ============================================================================

// ============================================================================
// >>> CROP SECTION — v33-opt-9 — easy-rollback block <<<
// ----------------------------------------------------------------------------
// Self-contained module that adds a "Crop" section between Image Selection and
// Plate Solving in the Pre Processing tab. Provides:
//   - Manual rectangular selection by SHIFT+drag on the preview
//   - Automatic edge detection (Auto-detect Edges button)
//   - 8 resize handles + interior move (drag handles or rectangle)
//   - Apply to Current or to All loaded images of the active mode
//   - Optional re-alignment via StarAlignment after multi-image crop
//
// Architectural notes for safe rollback:
//   - All helpers prefixed `optCrop*`     → easy to grep and remove
//   - All UI handles prefixed `dlg.__crop*` / `dlg.__cropSection`
//   - All state in single object `dlg.cropState`
//   - Only ONE line of foreign code touched: optBuildPreCropSection(this) call
//     inside configurePreTab (immediately after this block).
//   - Hooks into preview viewport via the existing onImageMouse* / onOverlayPaint
//     callback slots (lines ~5511-5516); no shared preview pane code changed.
//   - Astrometric WCS metadata is preserved automatically by the native Crop
//     process (it shifts CRPIX1/2 by the crop offsets).
//
// To roll back this feature entirely:
//   1. Delete this whole block (search "CROP SECTION — v33-opt-9").
//   2. Delete the single `optBuildPreCropSection(this);` line in configurePreTab.
//   3. Delete the 6 "crop." / 5 "button.<crop>" / 1 "check.Re-align..." entries
//      in PI Workflow_resources.jsh.
// ============================================================================

// ----- Constants -------------------------------------------------------------
var OPT_CROP_HANDLE_NONE = -1;
var OPT_CROP_HANDLE_TL = 0, OPT_CROP_HANDLE_TM = 1, OPT_CROP_HANDLE_TR = 2;
var OPT_CROP_HANDLE_ML = 3, OPT_CROP_HANDLE_MR = 4;
var OPT_CROP_HANDLE_BL = 5, OPT_CROP_HANDLE_BM = 6, OPT_CROP_HANDLE_BR = 7;
var OPT_CROP_HANDLE_INSIDE = 8;
var OPT_CROP_HANDLE_VIEWPORT_SIZE = 8;     // handle square side in viewport px
var OPT_CROP_HIT_TOLERANCE_PX     = 10;    // hit-test radius in viewport px
var OPT_CROP_MIN_SIZE             = 64;    // minimum rectangle in image px
var OPT_CROP_SHIFT_MODIFIER       = 0x01;  // matches Qt::ShiftModifier

// ----- State -----------------------------------------------------------------

/** Initializes a fresh crop state object. */
function optCropInitState() {
   return {
      rect: null,              // {x,y,width,height} in FULL IMAGE pixels, or null
      drawing: false,          // mid-SHIFT-drag (creating a new selection)
      dragMode: "",            // "" | "draw" | "move" | "resize"
      dragHandle: OPT_CROP_HANDLE_NONE,
      dragStartImg: null,      // {x,y} mouse anchor in image coords
      dragStartRect: null      // snapshot of rect at drag start
   };
}

/** True if rect lies entirely inside an image of the given dimensions. */
function optCropRectFitsImage(rect, imgW, imgH) {
   if (!rect) return false;
   return rect.x >= 0 && rect.y >= 0 &&
          (rect.x + rect.width)  <= imgW &&
          (rect.y + rect.height) <= imgH &&
          rect.width  >= OPT_CROP_MIN_SIZE &&
          rect.height >= OPT_CROP_MIN_SIZE;
}

/** Clamps a rectangle to image bounds and enforces minimum size. */
function optCropClampRect(rect, imgW, imgH) {
   if (!rect) return null;
   var x = Math.max(0, Math.round(rect.x));
   var y = Math.max(0, Math.round(rect.y));
   var w = Math.round(rect.width);
   var h = Math.round(rect.height);
   if (x + w > imgW) w = imgW - x;
   if (y + h > imgH) h = imgH - y;
   if (w < OPT_CROP_MIN_SIZE) {
      w = Math.min(OPT_CROP_MIN_SIZE, imgW);
      x = Math.min(x, imgW - w);
   }
   if (h < OPT_CROP_MIN_SIZE) {
      h = Math.min(OPT_CROP_MIN_SIZE, imgH);
      y = Math.min(y, imgH - h);
   }
   return { x: x, y: y, width: w, height: h };
}

// ----- Auto-detection --------------------------------------------------------

/**
 * Auto-detects the bounding rectangle of valid (non-defect) data in a view.
 *
 * Algorithm: a row (or column) is "valid" iff its minimum pixel value > EPS.
 * Stacking edge defects have pixel value 0 (or sub-EPS), while real data is
 * above the noise floor. Boundaries are found per edge with a COARSE linear
 * scan (step 16) followed by a FINE refinement within the matched window —
 * O((W+H)/16 + 32) region-statistics calls per edge. PJSR's minimum() runs
 * in C++ on the selected sub-rectangle, so the whole detection completes in
 * a few milliseconds even on 8K images.
 *
 * Multi-channel: a strip's "minimum" is taken across all channels (a defect
 * pixel is zero in every channel for stacking output, so this is conservative
 * and correct).
 *
 * @param {View} view
 * @returns {{x,y,width,height}|null}  rectangle in image pixels, or null if
 *          the image is too small or no valid region was found.
 */
function optCropDetectImageEdges(view) {
   if (!optSafeView(view)) return null;
   var img = view.image;
   var w = img.width, h = img.height;
   if (w < OPT_CROP_MIN_SIZE * 2 || h < OPT_CROP_MIN_SIZE * 2) return null;

   var EPS    = 1e-8;
   var COARSE = 16;

   // Minimum of a strip. Handles scalar / Vector return types uniformly.
   function stripMin(rect) {
      try {
         img.selectedRect = rect;
         var mn = img.minimum();
         if (typeof mn === "number") return mn;
         if (mn && typeof mn.length === "number" && mn.length > 0) {
            var m = mn[0];
            for (var i = 1; i < mn.length; ++i) if (mn[i] < m) m = mn[i];
            return m;
         }
         return 0;
      } catch (e) {
         return 0;
      } finally {
         try { img.resetSelections(); } catch (eR) {}
      }
   }
   function isValidRow(r) { return stripMin(new Rect(0, r, w, 1)) > EPS; }
   function isValidCol(c) { return stripMin(new Rect(c, 0, 1, h)) > EPS; }

   // Coarse linear probe + fine refinement within the matched 16-px window.
   function findBoundary(isValid, start, end, dir) {
      var firstValid = -1;
      if (dir > 0) {
         for (var i = start; i < end; i += COARSE)
            if (isValid(i)) { firstValid = i; break; }
         if (firstValid < 0) return -1;
         var lo = Math.max(start, firstValid - COARSE + 1);
         for (var j = lo; j <= firstValid; ++j) if (isValid(j)) return j;
         return firstValid;
      } else {
         for (var i2 = start; i2 > end; i2 -= COARSE)
            if (isValid(i2)) { firstValid = i2; break; }
         if (firstValid < 0) return -1;
         var hi = Math.min(start, firstValid + COARSE - 1);
         for (var j2 = hi; j2 >= firstValid; --j2) if (isValid(j2)) return j2;
         return firstValid;
      }
   }

   var top    = findBoundary(isValidRow, 0,     h, +1); if (top    < 0) return null;
   var bottom = findBoundary(isValidRow, h - 1, top, -1); if (bottom < 0 || bottom <= top) return null;
   var left   = findBoundary(isValidCol, 0,     w, +1); if (left   < 0) return null;
   var right  = findBoundary(isValidCol, w - 1, left, -1); if (right  < 0 || right <= left) return null;

   var rect = { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
   if (rect.width < OPT_CROP_MIN_SIZE || rect.height < OPT_CROP_MIN_SIZE) return null;
   return rect;
}

// ----- Apply / Re-align ------------------------------------------------------

// Astrometric solution PixInsight property names. Only these change at all
// after a crop; among them, ReferencePixel and ProjectionOrigin are PIXEL
// coordinates and therefore need to be shifted by the crop offset.
var OPT_CROP_WCS_PROPERTIES = [
   "PCL:AstrometricSolution:Information",
   "PCL:AstrometricSolution:ProjectionSystem",
   "PCL:AstrometricSolution:ReferencePixel",                // ← pixel coords (shift)
   "PCL:AstrometricSolution:ProjectionOrigin",              // ← pixel coords (shift if present)
   "PCL:AstrometricSolution:ReferenceCelestialCoordinates", // sky coords (no shift)
   "PCL:AstrometricSolution:LinearMatrix",                  // CD-matrix (no shift)
   "PCL:AstrometricSolution:Catalog",
   "PCL:AstrometricSolution:CreationTime",
   "PCL:AstrometricSolution:CreatorApplication",
   "PCL:AstrometricSolution:CreatorModule",
   "PCL:AstrometricSolution:CreatorOSName",
   "PCL:AstrometricSolution:SplineWorldTransformation",
   "PCL:AstrometricSolution:Description"
];

// Astrometric properties whose internal state encodes the image dimensions
// or the pixel-grid distortion. After a pixel-level crop they reference
// W₀×H₀ but the view image is now W₁×H₁, so any downstream call that goes
// through PixInsight's AstrometricMetadata path (notably
// ImageWindow.copyAstrometricSolution(), used by createStarSplit / SXT)
// throws: "AstrometricMetadata::Write(): Incompatible image dimensions".
//
// We deliberately drop these post-crop so PixInsight rebuilds the
// solution from the shifted CRPIX + the sky-coord keywords (CRVAL, CD,
// CTYPE, PV, LONPOLE, RADESYS, …). The TAN / SIN / AIRY projection stays
// correct for the cropped field; any spline-based distortion correction
// is lost (re-solve manually if sub-pixel astrometry is needed).
var OPT_CROP_WCS_PROPERTIES_STALE_AFTER_CROP = [
   "PCL:AstrometricSolution:Information",
   "PCL:AstrometricSolution:SplineWorldTransformation"
];

var OPT_CROP_WCS_PROPERTIES_STALE_MAP = (function() {
   var map = {};
   for (var i = 0; i < OPT_CROP_WCS_PROPERTIES_STALE_AFTER_CROP.length; ++i)
      map[OPT_CROP_WCS_PROPERTIES_STALE_AFTER_CROP[i]] = true;
   return map;
})();

// Subset of FITS keywords that carry WCS information. Those listed in
// OPT_CROP_WCS_KEYWORDS_PIXELSHIFT need their numeric value shifted by the
// crop offset; the rest are preserved unchanged.
var OPT_CROP_WCS_KEYWORDS_PIXELSHIFT = { "CRPIX1": "x", "CRPIX2": "y" };
var OPT_CROP_WCS_KEYWORDS_PRESERVE = {
   "CRVAL1":1, "CRVAL2":1, "CD1_1":1, "CD1_2":1, "CD2_1":1, "CD2_2":1,
   "CDELT1":1, "CDELT2":1, "CTYPE1":1, "CTYPE2":1,
   "CROTA1":1, "CROTA2":1, "CROTA":1,
   "PC1_1":1, "PC1_2":1, "PC2_1":1, "PC2_2":1,
   "PV1_0":1, "PV1_1":1, "PV1_2":1, "PV2_0":1, "PV2_1":1, "PV2_2":1,
   "LONPOLE":1, "LATPOLE":1, "RADESYS":1, "EQUINOX":1, "EPOCH":1
};

/**
 * Captures the full WCS state (FITS keywords + PixInsight astrometric
 * properties) BEFORE a crop so it can be restored afterwards with the
 * reference-pixel offset applied.
 *
 * @returns {object|null}  { properties: {name: value}, keywords: [...] }
 *                         or null if no WCS information was present.
 */
function optCropCaptureWCSState(view) {
   if (!optSafeView(view)) return null;
   var state = { properties: {}, keywords: [] };
   var hasAny = false;
   for (var i = 0; i < OPT_CROP_WCS_PROPERTIES.length; ++i) {
      var pid = OPT_CROP_WCS_PROPERTIES[i];
      // Skip props that encode stale dimensions/distortion; they will be
      // deleted from the view post-crop so PI rebuilds them on demand.
      if (OPT_CROP_WCS_PROPERTIES_STALE_MAP[pid]) continue;
      try {
         var pv = view.propertyValue(pid);
         if (pv !== undefined && pv !== null) { state.properties[pid] = pv; hasAny = true; }
      } catch (e) {}
   }
   try {
      var kw = view.window.keywords;
      for (var j = 0; j < kw.length; ++j) {
         var nm = (kw[j].name || "").toUpperCase();
         if (OPT_CROP_WCS_KEYWORDS_PIXELSHIFT[nm] || OPT_CROP_WCS_KEYWORDS_PRESERVE[nm]) {
            state.keywords.push({ name: kw[j].name, value: kw[j].value, comment: kw[j].comment || "" });
            hasAny = true;
         }
      }
   } catch (e2) {}
   return hasAny ? state : null;
}

/**
 * Restores a previously captured WCS state to a view after it has been
 * cropped. Shifts CRPIX1/2 (in FITS keywords) and ReferencePixel/
 * ProjectionOrigin (in PI properties) by the crop offsets. Sky-coordinate
 * fields (CRVAL, CD matrix, CTYPE, projection params) are restored unchanged.
 *
 * Also writes NAXIS1/NAXIS2 to reflect the new dimensions.
 */
function optCropApplyWCSState(view, state, cropX, cropY, newW, newH) {
   if (!optSafeView(view) || !state) return;

   // --- 1) Properties: restore everything; shift pixel-coordinate vectors. ---
   for (var name in state.properties) {
      if (!state.properties.hasOwnProperty(name)) continue;
      var val = state.properties[name];
      try {
         if (name === "PCL:AstrometricSolution:ReferencePixel" ||
             name === "PCL:AstrometricSolution:ProjectionOrigin") {
            var px = 0, py = 0;
            if (val && typeof val.at === "function") {
               px = val.at(0); py = val.at(1);
            } else if (val && val.length >= 2) {
               px = val[0];    py = val[1];
            } else {
               view.setPropertyValue(name, val);
               continue;
            }
            view.setPropertyValue(name, new Vector([px - cropX, py - cropY]));
         } else {
            view.setPropertyValue(name, val);
         }
      } catch (eP) {
         console.warningln("WCS restore property " + name + " failed: " + eP.message);
      }
   }

   // --- 2) FITS keywords: rebuild the WCS subset with CRPIX shifted, drop
   //        old WCS entries that may linger, write NAXIS1/2 to new dims.
   try {
      var current = view.window.keywords;
      var rebuilt = [];
      for (var k = 0; k < current.length; ++k) {
         var n = (current[k].name || "").toUpperCase();
         if (OPT_CROP_WCS_KEYWORDS_PIXELSHIFT[n] || OPT_CROP_WCS_KEYWORDS_PRESERVE[n]) continue;
         if (n === "NAXIS1" || n === "NAXIS2") continue;  // we re-write these below
         rebuilt.push(current[k]);
      }
      // Re-add the saved WCS keywords with CRPIX shifted.
      for (var s = 0; s < state.keywords.length; ++s) {
         var sk = state.keywords[s];
         var sn = (sk.name || "").toUpperCase();
         var sv = sk.value;
         var shift = OPT_CROP_WCS_KEYWORDS_PIXELSHIFT[sn];
         if (shift) {
            var num = parseFloat(sv);
            if (isFinite(num)) sv = ((shift === "x") ? (num - cropX) : (num - cropY)).toString();
         }
         rebuilt.push(new FITSKeyword(sk.name, sv, sk.comment || ""));
      }
      // Always update dimensions.
      rebuilt.push(new FITSKeyword("NAXIS1", newW.toString(), "PI Workflow crop new width"));
      rebuilt.push(new FITSKeyword("NAXIS2", newH.toString(), "PI Workflow crop new height"));
      view.window.keywords = rebuilt;
   } catch (eK) {
      console.warningln("WCS restore keywords failed: " + eK.message);
   }

   // --- 3) Drop dim-dependent astrometric properties carried over from
   //        before the crop. PixInsight will reconstruct the solution from
   //        the shifted CRPIX + the sky-coord keywords on first read.
   //        Without this step, copyAstrometricSolution() onto SXT outputs
   //        (or any other child window of the cropped view) fails with
   //        "AstrometricMetadata::Write(): Incompatible image dimensions".
   for (var d = 0; d < OPT_CROP_WCS_PROPERTIES_STALE_AFTER_CROP.length; ++d) {
      try { view.deleteProperty(OPT_CROP_WCS_PROPERTIES_STALE_AFTER_CROP[d]); }
      catch (eDel) {}
   }
}

// CROP-WCS-SHIFT-FIX-BEGIN
// A pixel crop done with image.cropTo() leaves the window's astrometric solution
// geometrically STALE: window.hasAstrometricSolution stays true, but the reference
// pixel is NOT shifted by the crop offset, so pixel->sky is wrong by that offset
// (~9 arcmin for a centered 40% crop, measured). SPCC/MGC then read an inconsistent
// solution and re-open ImageSolver. The legacy keyword surgery cannot fix this
// because modern WBPP solutions live in PCL properties, not FITS WCS keywords
// (these masters carry NO CTYPE/CRVAL/CD at all — verified).
//
// This rebuilds a CORRECT solution for the cropped frame ANALYTICALLY — no
// re-solve, no catalog, no GPU: it samples the original image->projection
// transform (ref_I_G) on a grid of (new-pixel + cropOffset) positions and refits
// a linear solution for the cropped image, then persists it via the ImageSolver
// library's AstrometricMetadata. Validated headless to < 0.5" across the frame
// for centered / corner / off-center crops on an ED127+ASI585 spline solution
// (pixel scale 0.63"/px, i.e. well under one pixel everywhere).
function optCropReadMetadata(window) {
   var m = new AstrometricMetadata(SETTINGS_MODULE);
   m.ExtractMetadata(window);
   return m;
}

function optCropRebuildAstrometricSolution(croppedWindow, mdOrig, cropX, cropY, newW, newH) {
   if (!mdOrig || !mdOrig.ref_I_G || newW < 2 || newH < 2)
      return false;
   var pI = [], pG = [], NX = 12, NY = 12;
   for (var iy = 0; iy <= NY; ++iy)
      for (var ix = 0; ix <= NX; ++ix) {
         var nx = ix * (newW - 1) / NX, ny = iy * (newH - 1) / NY;
         // The original image->projection transform is crop-invariant: the SAME
         // physical pixel lives at (new-pixel + cropOffset) in the original frame.
         var g = mdOrig.ref_I_G.apply(new Point(nx + cropX, ny + cropY));
         pI.push(new Point(nx, ny));
         pG.push(g);
      }
   var md2 = mdOrig.Clone();
   md2.width = newW; md2.height = newH;
   md2.scaledWidth = newW; md2.scaledHeight = newH;
   md2.ref_I_G_linear = Math.homography(pI, pG);
   md2.ref_I_G = md2.ref_I_G_linear;
   try { md2.ref_G_I = md2.ref_I_G.inverse(); } catch (eInv) { md2.ref_G_I = md2.ref_I_G.inverse; }
   md2.controlPoints = null;
   var cG = md2.ref_I_G.apply(new Point(newW / 2, newH / 2));
   var cRD = md2.projection.Inverse(cG);
   while (cRD.x < 0) cRD.x += 360;
   while (cRD.x >= 360) cRD.x -= 360;
   md2.ra = cRD.x; md2.dec = cRD.y;
   croppedWindow.mainView.beginProcess(UndoFlag.Keywords | UndoFlag.AstrometricSolution);
   try {
      md2.SaveKeywords(croppedWindow, false);
      md2.SaveProperties(croppedWindow, "PI Workflow crop-shift", "");
      croppedWindow.regenerateAstrometricSolution();
   } finally {
      croppedWindow.mainView.endProcess();
   }
   return true;
}
// CROP-WCS-SHIFT-FIX-END

/**
 * Applies a crop rectangle to a view IN PLACE using the low-level
 * `image.cropTo()` API — NOT the `Crop` process — to avoid PixInsight's
 * "astrometric solution will be invalidated" confirmation dialog.
 *
 * If the view carries a real astrometric solution it is rebuilt analytically
 * for the cropped frame (optCropRebuildAstrometricSolution). Otherwise the
 * legacy FITS-keyword surgery (optCropApplyWCSState) is used for keyword-only
 * WCS. Sky-coordinate fields stay unchanged.
 *
 * @returns {boolean} true if the view was modified
 */
function optCropApplyToView(view, rect) {
   if (!optSafeView(view)) return false;
   var w = view.image.width, h = view.image.height;
   var clamped = optCropClampRect(rect, w, h);
   if (!clamped) return false;
   if (clamped.x === 0 && clamped.y === 0 &&
       clamped.width === w && clamped.height === h)
      return false;   // no-op: rectangle equals the full image

   // CROP-WCS-SHIFT-FIX-BEGIN: capture a COMPLETE astrometric solution (if any)
   // BEFORE touching the view, so we can rebuild it correctly for the cropped
   // frame. This supersedes the legacy keyword surgery whenever the window
   // actually carries a solution (the common WBPP-master case).
   var hadSolution = false, mdOrig = null;
   try {
      if (view.window && view.window.hasAstrometricSolution) {
         mdOrig = optCropReadMetadata(view.window);
         hadSolution = (mdOrig && mdOrig.ref_I_G) ? true : false;
      }
   } catch (eCapSol) { hadSolution = false; mdOrig = null; }
   // CROP-WCS-SHIFT-FIX-END

   var wcs = hadSolution ? null : optCropCaptureWCSState(view);

   // CRITICAL: delete dim-dependent astrometric props BEFORE the pixel
   // crop. PixInsight's internal AstrometricMetadata::Write validates the
   // cached W×H in Information / SplineWorldTransformation against the
   // view's current image dimensions; any subsequent cropTo() or
   // setPropertyValue() on related props would otherwise abort with
   // "AstrometricMetadata::Write(): Incompatible image dimensions"
   // because Information still says W₀×H₀ while the image is now W₁×H₁.
   // The captured `wcs` has already preserved CRPIX / CRVAL / CD / etc.
   // so PI can rebuild a clean solution from those after the crop.
   for (var dPre = 0; dPre < OPT_CROP_WCS_PROPERTIES_STALE_AFTER_CROP.length; ++dPre) {
      try { view.deleteProperty(OPT_CROP_WCS_PROPERTIES_STALE_AFTER_CROP[dPre]); }
      catch (eDelPre) {}
   }

   try {
      view.beginProcess();
      try {
         // Low-level pixel crop — does NOT trigger any process-level dialog.
         view.image.cropTo(new Rect(clamped.x, clamped.y,
                                     clamped.x + clamped.width,
                                     clamped.y + clamped.height));
      } finally {
         view.endProcess();
      }
   } catch (e) {
      // Defensive fallback: image.cropTo() should always exist in PJSR but if
      // for any reason it fails, drop back to the Crop process. The WCS
      // properties have already been captured; we clear them BEFORE the
      // process call so PixInsight has nothing left to "invalidate" and
      // therefore no warning to show.
      console.warningln("image.cropTo failed (" + e.message + "), falling back to Crop process.");
      try {
         if (wcs) {
            for (var i = 0; i < OPT_CROP_WCS_PROPERTIES.length; ++i) {
               try { view.deleteProperty(OPT_CROP_WCS_PROPERTIES[i]); } catch (eDel) {}
            }
         }
         var P = new Crop;
         P.leftMargin   = -clamped.x;
         P.topMargin    = -clamped.y;
         P.rightMargin  = -(w - (clamped.x + clamped.width));
         P.bottomMargin = -(h - (clamped.y + clamped.height));
         P.mode             = Crop.prototype.AbsolutePixels;
         P.resolution       = 72;
         P.metric           = false;
         P.forceResolution  = false;
         P.executeOn(view);
      } catch (e2) {
         console.warningln("Crop fallback also failed on " + view.id + ": " + e2.message);
         return false;
      }
   }

   // CROP-WCS-SHIFT-FIX-BEGIN: rebuild a CORRECT solution for the cropped frame.
   // When the window carried a real solution, analytically shift it (no re-solve,
   // no catalog). Otherwise fall back to the legacy keyword surgery for
   // keyword-only WCS. Sky-coordinate fields stay unchanged in both paths.
   if (hadSolution) {
      try {
         if (!optCropRebuildAstrometricSolution(view.window, mdOrig,
                  clamped.x, clamped.y, clamped.width, clamped.height))
            console.warningln("Crop WCS rebuild produced no solution on " + view.id +
               " — re-solve if astrometry is needed downstream.");
      } catch (eShift) {
         console.warningln("Crop WCS rebuild failed on " + view.id + ": " + eShift.message +
            " — astrometry may be stale; re-solve if needed.");
      }
   } else if (wcs) {
      try {
         optCropApplyWCSState(view, wcs, clamped.x, clamped.y, clamped.width, clamped.height);
      } catch (eW) {
         console.warningln("WCS preservation failed on " + view.id + ": " + eW.message);
      }
   }
   // CROP-WCS-SHIFT-FIX-END

   // Belt-and-suspenders cleanup: ensure dim-dependent astrometric props
   // are gone post-crop even if optCropApplyWCSState wasn't called above
   // (no other WCS data was captured to trigger it). Otherwise downstream
   // copyAstrometricSolution() on SXT/Star Split outputs would fail with
   // "AstrometricMetadata::Write(): Incompatible image dimensions".
   // CROP-WCS-SHIFT-FIX: SKIP when we just rebuilt a valid solution — these
   // props are now correct for the new dimensions and must be preserved.
   if (!hadSolution) {
      for (var dPost = 0; dPost < OPT_CROP_WCS_PROPERTIES_STALE_AFTER_CROP.length; ++dPost) {
         try { view.deleteProperty(OPT_CROP_WCS_PROPERTIES_STALE_AFTER_CROP[dPost]); }
         catch (eDelPost) {}
      }
   }
   return true;
}

/**
 * Re-registers cropped views against a reference view using StarAlignment.
 * Produces new in-memory views (PixInsight defaults to "<src>_registered",
 * possibly numbered like "<src>_registered2" if that name is already taken).
 * The original cropped views are left untouched here; the caller decides
 * what to do with the aligned outputs (typical flow: swap-back + close).
 *
 * Detection: the StarAlignment property `outputSuffix` only affects FILE
 * output; in-memory view naming is fixed by PixInsight. To find the new
 * view robustly regardless of naming/numbering, we diff the workspace
 * window list before and after each execution (same pattern as
 * optRunMGCCompatibleWorkflow at line ~3654).
 *
 * @param {Array<View>} targets - cropped views to align (must exclude the reference)
 * @param {View} reference - the cropped reference view
 * @returns {{aligned:number, failed:number, pairs:Array<{target:View, aligned:View}>}}
 *          Pairs preserve the relationship between each source view and its
 *          aligned output, which is what swap-back needs.
 */
function optCropReAlignViews(targets, reference) {
   var result = { aligned: 0, failed: 0, pairs: [] };
   if (!optSafeView(reference)) {
      result.failed = (targets || []).length;
      return result;
   }
   for (var i = 0; i < targets.length; ++i) {
      var v = targets[i];
      if (!optSafeView(v) || v.id === reference.id) continue;

      var beforeMap = optCaptureOpenWindowIdMap();
      var success = false;
      try {
         var SA = new StarAlignment;
         SA.referenceImage        = reference.id;
         SA.referenceIsFile       = false;
         SA.mode                  = StarAlignment.prototype.RegisterMatch;
         SA.writeKeywords         = true;
         SA.generateMasks         = false;
         SA.generateDrizzleData   = false;
         SA.frameAdaptation       = false;
         SA.outputDirectory       = "";
         SA.outputExtension       = ".xisf";
         SA.outputPrefix          = "";
         SA.overwriteExistingFiles= true;
         SA.onError               = StarAlignment.prototype.Continue;
         success = SA.executeOn(v);
      } catch (e) {
         console.warningln("Re-align threw on " + v.id + ": " + e.message);
         success = false;
      }

      if (!success) { result.failed++; continue; }

      // Find the new window that appeared during this StarAlignment run.
      var alignedView = null, fallback = null;
      var prefix = v.id + "_";
      try {
         var afterWindows = ImageWindow.windows;
         for (var w = 0; w < afterWindows.length; ++w) {
            var win = afterWindows[w];
            if (!win || win.isNull || !win.mainView || win.mainView.isNull) continue;
            var wid = win.mainView.id;
            if (beforeMap[wid]) continue;
            if (wid === reference.id) continue;
            if (wid.indexOf(prefix) === 0) { alignedView = win.mainView; break; }
            if (!fallback) fallback = win.mainView;
         }
      } catch (eW) {}
      if (!alignedView) alignedView = fallback;

      if (alignedView) {
         result.pairs.push({ target: v, aligned: alignedView });
         result.aligned++;
      } else {
         result.failed++;
         console.warningln("Re-align: executeOn returned true for " + v.id +
                           " but no new view was found in the workspace.");
      }
   }
   return result;
}

/**
 * Swap-back: copies the pixel data AND WCS metadata from a StarAlignment
 * "_registered" output INTO the original target view in-place. The target
 * keeps its identity (id, slot membership, workflow position) but now
 * contains the sub-pixel-corrected pixels aligned to the reference frame.
 *
 * After this call the caller closes the aligned view (which is now redundant).
 *
 * Why also copy WCS: after StarAlignment, `aligned` carries the
 * reference's WCS (its pixels live in the reference's coordinate frame).
 * The original `target`'s old WCS no longer matches its new pixel content.
 * We sync WCS from `aligned` → `target` so metadata and pixels remain
 * consistent and the rest of the workflow (SPCC, plate-solve queries,
 * etc.) keeps working without re-solving.
 *
 * Dimensions must match — guaranteed by the same-crop pre-step in Apply
 * to All (and verified defensively here).
 *
 * @returns {boolean} true if pixels were copied (WCS copy is best-effort)
 */
function optCropSwapBackAlignedPixels(target, aligned) {
   if (!optSafeView(target) || !optSafeView(aligned)) return false;
   if (target.image.width        !== aligned.image.width  ||
       target.image.height       !== aligned.image.height ||
       target.image.numberOfChannels !== aligned.image.numberOfChannels) {
      console.warningln("Swap-back: dimension/channel mismatch " +
                        target.id + " (" + target.image.width + "x" +
                        target.image.height + "x" + target.image.numberOfChannels + ") vs " +
                        aligned.id + " (" + aligned.image.width + "x" +
                        aligned.image.height + "x" + aligned.image.numberOfChannels + ")");
      return false;
   }
   // Snapshot aligned's WCS (post-SA — matches the reference frame).
   var alignedWCS = optCropCaptureWCSState(aligned);
   // Replace target's pixels with aligned's pixels, with PI undo support.
   // Same pattern used in optRunMGCCompatibleWorkflow line ~3833.
   try {
      target.beginProcess();
      try {
         target.image.assign(aligned.image);
      } finally {
         target.endProcess();
      }
   } catch (e) {
      console.warningln("Swap-back pixel copy failed for " + target.id +
                        " <- " + aligned.id + ": " + e.message);
      return false;
   }
   // Sync target's WCS to the new pixel content. No crop offsets (cropX=cropY=0)
   // because this is a pure pixel replacement at the same dimensions.
   if (alignedWCS) {
      try {
         optCropApplyWCSState(target, alignedWCS, 0, 0,
                              target.image.width, target.image.height);
      } catch (eW) {
         console.warningln("Swap-back WCS sync failed for " + target.id +
                           ": " + eW.message + " (pixels are correct; WCS may be stale)");
      }
   }
   return true;
}

// ----- Paint + hit-test ------------------------------------------------------

/** Converts an image-space point to viewport-space using the current transform. */
function optCropImgToViewport(ix, iy, sc, sx, sy, kx, ky) {
   return { x: Math.round((ix / kx) * sc - sx),
            y: Math.round((iy / ky) * sc - sy) };
}

/** Returns the 8 handle centers (image coords) in OPT_CROP_HANDLE_* order. */
function optCropHandleImagePositions(r) {
   var mx = r.x + r.width  / 2, my = r.y + r.height / 2;
   var x2 = r.x + r.width,      y2 = r.y + r.height;
   return [
      { x: r.x, y: r.y },  { x: mx,  y: r.y },  { x: x2,  y: r.y },   // TL, TM, TR
      { x: r.x, y: my },                        { x: x2,  y: my },    // ML,     MR
      { x: r.x, y: y2 },  { x: mx,  y: y2 },  { x: x2,  y: y2 }       // BL, BM, BR
   ];
}

/**
 * Hit-tests a mouse position (image coords) against the rectangle handles
 * and interior. Tolerance is expressed in viewport pixels (so handles feel
 * the same size regardless of zoom level).
 *
 * @returns {number} OPT_CROP_HANDLE_* constant (0..7, INSIDE, or NONE)
 */
function optCropHitTest(rect, ix, iy, sc, kx, ky) {
   if (!rect) return OPT_CROP_HANDLE_NONE;
   // Convert tolerance from viewport pixels to image pixels.
   // For each axis, image-pixel-per-viewport-pixel ≈ k / sc.
   var tolX = Math.max(1, Math.round(OPT_CROP_HIT_TOLERANCE_PX * kx / sc));
   var tolY = Math.max(1, Math.round(OPT_CROP_HIT_TOLERANCE_PX * ky / sc));
   var tol  = Math.max(tolX, tolY);
   var handles = optCropHandleImagePositions(rect);
   for (var i = 0; i < handles.length; ++i)
      if (Math.abs(ix - handles[i].x) <= tol && Math.abs(iy - handles[i].y) <= tol)
         return i;
   if (ix > rect.x + tol && ix < rect.x + rect.width  - tol &&
       iy > rect.y + tol && iy < rect.y + rect.height - tol)
      return OPT_CROP_HANDLE_INSIDE;
   return OPT_CROP_HANDLE_NONE;
}

/** Mutates one or two edges of a rectangle from the active handle drag. */
function optCropResizeFromHandle(startRect, handleIdx, ix, iy, imgW, imgH) {
   var x1 = startRect.x, y1 = startRect.y;
   var x2 = startRect.x + startRect.width, y2 = startRect.y + startRect.height;
   switch (handleIdx) {
      case OPT_CROP_HANDLE_TL: x1 = ix; y1 = iy; break;
      case OPT_CROP_HANDLE_TM:          y1 = iy; break;
      case OPT_CROP_HANDLE_TR: x2 = ix; y1 = iy; break;
      case OPT_CROP_HANDLE_ML: x1 = ix;          break;
      case OPT_CROP_HANDLE_MR: x2 = ix;          break;
      case OPT_CROP_HANDLE_BL: x1 = ix; y2 = iy; break;
      case OPT_CROP_HANDLE_BM:          y2 = iy; break;
      case OPT_CROP_HANDLE_BR: x2 = ix; y2 = iy; break;
      default: return startRect;
   }
   // Normalize if user dragged past the opposite edge.
   if (x2 < x1) { var tx = x1; x1 = x2; x2 = tx; }
   if (y2 < y1) { var ty = y1; y1 = y2; y2 = ty; }
   return optCropClampRect({ x: x1, y: y1, width: x2 - x1, height: y2 - y1 }, imgW, imgH);
}

/** Paints the overlay: dim area outside the rect, border, and 8 handles. */
function optCropPaintOverlay(g, state, sc, sx, sy, kx, ky, viewportW, viewportH) {
   if (!state || !state.rect) return;
   var r  = state.rect;
   var tl = optCropImgToViewport(r.x,            r.y,            sc, sx, sy, kx, ky);
   var br = optCropImgToViewport(r.x + r.width,  r.y + r.height, sc, sx, sy, kx, ky);
   var rx = tl.x, ry = tl.y, rw = br.x - tl.x, rh = br.y - tl.y;
   g.antialiasing = false;
   // 4 strips dimming the area outside the selection. ARGB color with alpha.
   var dim = 0xA0000000;
   try {
      if (ry > 0)              g.fillRect(new Rect(0,       0,       viewportW, ry),                  dim);
      if (ry + rh < viewportH) g.fillRect(new Rect(0,       ry + rh, viewportW, viewportH),           dim);
      if (rx > 0)              g.fillRect(new Rect(0,       ry,      rx,        ry + rh),             dim);
      if (rx + rw < viewportW) g.fillRect(new Rect(rx + rw, ry,      viewportW, ry + rh),             dim);
   } catch (eDim) {}
   g.antialiasing = true;
   g.pen   = new Pen(0xFFFFD000, 2);  // amber border
   g.brush = new Brush(0x00000000);
   g.drawRect(rx, ry, rx + rw, ry + rh);
   var halfH = OPT_CROP_HANDLE_VIEWPORT_SIZE >> 1;
   var handles = optCropHandleImagePositions(r);
   for (var i = 0; i < handles.length; ++i) {
      var sp = optCropImgToViewport(handles[i].x, handles[i].y, sc, sx, sy, kx, ky);
      try { g.fillRect(new Rect(sp.x - halfH, sp.y - halfH, sp.x + halfH, sp.y + halfH), 0xFFFFD000); } catch (eF) {}
      g.pen = new Pen(0xFF000000, 1);
      try { g.drawRect(sp.x - halfH, sp.y - halfH, sp.x + halfH, sp.y + halfH); } catch (eD) {}
   }
}

/**
 * Binds the active Post mask to workView's window so the next process
 * respects it. When workView is a downsampled live-preview candidate, the
 * active mask (full resolution) is cloned and resampled to match — this
 * avoids the "active mask geometry does not match the target image" error
 * that otherwise breaks Curves/NR/Sharp/Color Balance live previews when
 * "Use active mask" is checked.
 *
 * Returns an info object on success (must be passed to optClearProcessMask
 * for cleanup) or null when no mask is applied.
 */
function optApplyMaskToProcessView(workView, dialog, useMask) {
   if (useMask !== true)
      return null;
   if (!dialog || !optSafeView(dialog.postActiveMask))
      throw new Error("No active Post mask is available. Generate a mask first.");
   var maskView = dialog.postActiveMask;
   var transientMask = null;
   if (workView.image.width !== maskView.image.width ||
       workView.image.height !== maskView.image.height) {
      // Live-preview path: clone the active mask and resample it to the
      // candidate's dimensions. Same pattern used in optPrepareCcSlotView
      // line ~11460 for CC slot masks.
      transientMask = optCloneView(maskView, "Opt_PostMaskLiveResampled", false);
      if (!optSafeView(transientMask))
         throw new Error("Could not clone the active mask for live preview.");
      try {
         transientMask.beginProcess(UndoFlag_NoSwapFile);
         transientMask.image.resample(workView.image.width, workView.image.height, Interpolation_Bilinear);
         transientMask.endProcess();
      } catch (eR) {
         try { transientMask.endProcess(); } catch (e0) {}
         optCloseView(transientMask);
         throw new Error("Could not resample the active mask for live preview: " + eR.message);
      }
   }
   var effective = transientMask || maskView;
   workView.window.mask = effective.window;
   try { workView.window.maskEnabled = true; } catch (e1) {}
   // Invert the mask polarity so WHITE areas receive the effect — matching the
   // script's UI promise ("The mask are the white areas", line 12225). Without
   // this PixInsight defaults to white=protect / black=process, which is the
   // opposite of how the user reads the mask preview. Symptom of leaving it
   // un-inverted: Curves (and any Post process using a mostly-white mask) appear
   // to do nothing because only the tiny black areas get processed.
   try { workView.window.maskInverted = true; } catch (e2) {}
   return { transientMask: transientMask };
}

function optClearProcessMask(workView, info) {
   try { if (optSafeView(workView)) workView.window.removeMask(); } catch (e0) {}
   try { if (optSafeView(workView)) workView.window.maskEnabled = false; } catch (e1) {}
   // Reset inversion to the workspace default in case the workView outlives
   // this process (defensive — most callers throw away candidates anyway).
   try { if (optSafeView(workView)) workView.window.maskInverted = false; } catch (e2) {}
   // Close the transient resampled mask if optApplyMaskToProcessView created
   // one for live-preview geometry matching. Backwards compatible: when called
   // without info (legacy CC slot paths that manage their own tempMask), this
   // is a no-op.
   try { if (info && info.transientMask) optCloseView(info.transientMask); } catch (e3) {}
}

