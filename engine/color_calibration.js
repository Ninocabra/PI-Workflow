function optRunSPCCWorkflow(targetView, dlg) {
   if (!optSafeView(targetView))
      throw new Error("[SPCC/TARGET] There is no valid target view to execute SPCC.");
   // BUGFIX-SPCC-PROPAGATION-BEGIN
   console.writeln("=> SPCC: Starting SpectrophotometricColorCalibration on view '" + targetView.id + "'...");
   // BUGFIX-SPCC-PROPAGATION-END
   optRequireLinearImage(targetView, "SPCC");
   if (OPT_TEST_MODE)
      return optRunTestModePreviewTransform(targetView, "contrast", 0.18);
   if (typeof SpectrophotometricColorCalibration === "undefined")
      throw new Error("[SPCC/AVAILABILITY] SpectrophotometricColorCalibration is not available in this PixInsight installation.");
   if (!optHasAstrometricSolution(targetView))
      optSolveAstrometryOnWindow(targetView.window, "the SPCC target view");
   if (!optHasAstrometricSolution(targetView))
      throw new Error("[SPCC/WCS] SPCC requires a valid astrometric solution.");
   var profile = optGetNarrowbandProfileForView(targetView, dlg, dlg && dlg.preTab && dlg.preTab.preview ? dlg.preTab.preview.currentKey : "");
   if (profile && profile.isMono)
      throw new Error("[SPCC/NARROWBAND] " + profile.description + " is a single-channel narrowband image. SPCC narrowband calibration requires an RGB narrowband composite such as SHO/HOO/HSO/HOS, not a pseudo-RGB copy of one emission line.");
   var spcc = optGetSPCCProcessForProfile(profile);
   optSuppressSPCCAuxiliaryOutputs(spcc);
   optApplyNarrowbandProcessParameters(spcc, profile, "SPCC", OPT_LAST_SPCC_GUI_NB_ICON === true);
   if (profile && profile.isNarrowband)
      console.writeln("=> SPCC: narrowband-aware calibration path selected for " + profile.description + ".");
   var beforeMap = optCaptureOpenWindowIdMap();
   var protectedIds = {};
   protectedIds[targetView.id] = true;
   var ok = false;
   try {
      ok = spcc.executeOn(targetView);
   } catch (e0) {
      throw new Error("[SPCC/EXECUTION] " + e0.message);
   }
   if (!ok)
      throw new Error("[SPCC/EXECUTION] SPCC returned false before completing execution.");
   var outputView = targetView;
   var windowsAfter = ImageWindow.windows;
   for (var i = 0; i < windowsAfter.length; ++i) {
      var win = windowsAfter[i];
      if (!win || win.isNull || !win.mainView || win.mainView.isNull)
         continue;
      if (optMapHasTrueValue(beforeMap, win.mainView.id))
         continue;
      var isLikelyImageResult = false;
      try {
         isLikelyImageResult =
            win.mainView.image.width === targetView.image.width &&
            win.mainView.image.height === targetView.image.height &&
            win.mainView.image.numberOfChannels === targetView.image.numberOfChannels;
      } catch (e1) {}
      if (isLikelyImageResult)
         outputView = win.mainView;
   }
   try {
      if (optSafeView(outputView))
         protectedIds[outputView.id] = true;
   } catch (e2) {}
   optCloseAuxiliaryProcessWindows(beforeMap, protectedIds, "SPCC");
   // BUGFIX-SPCC-PROPAGATION-BEGIN
   console.writeln("=> SPCC: SpectrophotometricColorCalibration finished successfully on view '" + targetView.id + "'.");
   // BUGFIX-SPCC-PROPAGATION-END
   return outputView;
}

function optRunSPCCCompatibleWorkflow(targetView, dlg) {
   if (!optSafeView(targetView))
      throw new Error("[SPCC/TARGET] There is no valid target view to execute SPCC.");
   if (OPT_TEST_MODE)
      return optRunTestModePreviewTransform(targetView, "contrast", 0.18);
   var profile = optGetNarrowbandProfileForView(targetView, dlg, dlg && dlg.preTab && dlg.preTab.preview ? dlg.preTab.preview.currentKey : "");
   if (profile && profile.isMono)
      throw new Error("[SPCC/NARROWBAND] " + profile.description + " is a mono emission-line image. SPCC is intentionally not run on pseudo-RGB mono copies because that would ignore the H/O/S filter physics. Combine the channels first (for example HOO or SHO) and run SPCC on the RGB narrowband composite.");
   if (targetView.image.numberOfChannels >= 3)
      return optRunSPCCWorkflow(targetView, dlg);
   var tempRGB = optCreateRgbFromChannels(targetView, targetView, targetView, "Memory_SPCC_MonoRGB_" + targetView.id, targetView);
   if (!optSafeView(tempRGB))
      throw new Error("[SPCC/MONO] Failed to create the temporary pseudo-RGB view required by SPCC.");
   try {
      var spccRGB = optRunSPCCWorkflow(tempRGB, dlg);
      var monoOut = optExtractGrayChannelView(spccRGB, 0, targetView.id + "_SPCC");
      if (spccRGB.id !== tempRGB.id)
         optCloseView(spccRGB);
      return monoOut;
   } finally {
      optCloseView(tempRGB);
   }
}

function optRunAutoLinearFitWorkflow(targetView) {
   if (!optSafeView(targetView))
      throw new Error("[ALF/TARGET] There is no valid target view to execute Auto Linear Fit.");
   if (OPT_TEST_MODE)
      return optRunTestModePreviewTransform(targetView, "contrast", 0.14);
   if (targetView.image.numberOfChannels < 3)
      throw new Error("[ALF/CHANNELS] Auto Linear Fit requires an RGB image with at least 3 channels.");
   var P = new ChannelExtraction();
   P.colorSpace = ChannelExtraction.prototype.RGB;
   P.channels = [[true, targetView.id + "_ALF_R"], [true, targetView.id + "_ALF_G"], [true, targetView.id + "_ALF_B"]];
   P.sampleFormat = ChannelExtraction.prototype.SameAsSource;
   P.executeOn(targetView);
   var viewR = View.viewById(targetView.id + "_ALF_R");
   var viewG = View.viewById(targetView.id + "_ALF_G");
   var viewB = View.viewById(targetView.id + "_ALF_B");
   if (!optSafeView(viewR) || !optSafeView(viewG) || !optSafeView(viewB))
      throw new Error("[ALF/EXTRACTION] Failed to extract one or more color channels.");
   try {
      try { viewR.window.hide(); } catch (e0) {}
      try { viewG.window.hide(); } catch (e1) {}
      try { viewB.window.hide(); } catch (e2) {}
      var medR = viewR.image.median();
      var medG = viewG.image.median();
      var medB = viewB.image.median();
      var refView = viewR;
      var refName = "R";
      var minMed = medR;
      if (medG < minMed) { refView = viewG; refName = "G"; minMed = medG; }
      if (medB < minMed) { refView = viewB; refName = "B"; minMed = medB; }
      var LF = new LinearFit();
      LF.referenceViewId = refView.id;
      LF.rejectLow = 0.000000;
      LF.rejectHigh = 0.920000;
      if (refName !== "R") LF.executeOn(viewR);
      if (refName !== "G") LF.executeOn(viewG);
      if (refName !== "B") LF.executeOn(viewB);
      var CC = new ChannelCombination();
      CC.colorSpace = ChannelCombination.prototype.RGB;
      CC.channels = [[true, viewR.id], [true, viewG.id], [true, viewB.id]];
      CC.executeOn(targetView);
   } finally {
      optCloseView(viewR);
      optCloseView(viewG);
      optCloseView(viewB);
   }
   return targetView;
}

function optRunBackgroundNeutralization(targetView) {
   if (!optSafeView(targetView))
      throw new Error("Select a valid target image first.");
   if (OPT_TEST_MODE)
      return optRunTestModePreviewTransform(targetView, "lift", 0.10);
   if (!optViewIsColor(targetView))
      throw new Error("Background Neutralization requires an RGB color image.");
   if (typeof BackgroundNeutralization === "undefined")
      throw new Error("BackgroundNeutralization is not available in this PixInsight installation.");
   var img = targetView.image;
   var imgW = img.width;
   var imgH = img.height;
   var roiW = Math.min(50, imgW);
   var roiH = Math.min(50, imgH);
   var step = Math.max(1, Math.round(Math.min(imgW, imgH) / 60));
   var bestX = 0, bestY = 0, bestMean = 1.0e9;
   var nc = img.numberOfChannels;
   for (var bnY = 0; bnY <= imgH - roiH; bnY += step) {
      for (var bnX = 0; bnX <= imgW - roiW; bnX += step) {
         var bnSum = 0, bnCnt = 0;
         for (var bnSy = 0; bnSy < roiH; bnSy += step) {
            for (var bnSx = 0; bnSx < roiW; bnSx += step) {
               var bnLum = 0;
               for (var bnC = 0; bnC < nc; ++bnC)
                  bnLum += img.sample(bnX + bnSx, bnY + bnSy, bnC);
               bnSum += bnLum / nc;
               ++bnCnt;
            }
         }
         var bnMean = bnCnt > 0 ? bnSum / bnCnt : 1.0;
         if (bnMean < bestMean) { bestMean = bnMean; bestX = bnX; bestY = bnY; }
      }
   }
   var P = new BackgroundNeutralization();
   P.backgroundReferenceViewId = "";
   P.backgroundLow = 0.0000000;
   P.backgroundHigh = 0.1000000;
   P.useROI = true;
   P.roiX0 = bestX;
   P.roiY0 = bestY;
   P.roiX1 = bestX + roiW;
   P.roiY1 = bestY + roiH;
   P.mode = BackgroundNeutralization.prototype.RescaleAsNeeded;
   P.targetBackground = 0.0010000;
   var bnOk = P.executeOn(targetView);
   if (!bnOk)
      throw new Error("BackgroundNeutralization returned false.");
   return targetView;
}
