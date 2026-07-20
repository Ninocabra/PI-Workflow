function optExecuteBlurXConfiguredOnView(targetView, cfg) {
   if (!optSafeView(targetView))
      throw new Error("There is no valid target view to execute BlurXTerminator.");
   var procInfo = optCreateBlurXTerminatorProcessInstance();
   var bxt = procInfo.process;
   optTrySetProcessPropertySilently(bxt, ["sharpen_stars"], isFinite(cfg.sharpen_stars) ? cfg.sharpen_stars : 0.13);
   optTrySetProcessPropertySilently(bxt, ["adjust_star_halos"], isFinite(cfg.adjust_star_halos) ? cfg.adjust_star_halos : 0.00);
   optTrySetProcessPropertySilently(bxt, ["sharpen_nonstellar"], isFinite(cfg.sharpen_nonstellar) ? cfg.sharpen_nonstellar : 0.34);
   optTrySetProcessPropertySilently(bxt, ["automatic_psf"], cfg.automatic_psf === true);
   optTrySetProcessPropertySilently(bxt, ["psf_diameter"], cfg.automatic_psf === true ? 0.0 : cfg.psf_diameter);
   optTrySetProcessPropertySilently(bxt, ["correct_only"], cfg.correct_only === true);
   optTrySetProcessPropertySilently(bxt, ["correct_first"], cfg.correct_first === true);
   optTrySetProcessPropertySilently(bxt, ["nonstellar_then_stellar"], cfg.nonstellar_then_stellar === true);
   optTrySetProcessPropertySilently(bxt, ["luminance_only"], cfg.luminance_only === true);
   optAssertExecuteOk(bxt.executeOn(targetView), "BlurXTerminator");
   return targetView;
}

function optIsCosmicClarityAvailable() {
   return (typeof ExternalProcess !== "undefined");
}

function optNormalizePathOS(p) {
   var isWin = (CoreApplication.platform === "MSWINDOWS" || CoreApplication.platform === "Windows");
   if (!p) return p;
   return isWin ? String(p).split("/").join("\\") : String(p);
}

function optIsWindowsPlatform() {
   return CoreApplication.platform === "MSWINDOWS" || CoreApplication.platform === "Windows";
}

function optIsMacOSPlatform() {
   return CoreApplication.platform === "MACOSX" || CoreApplication.platform === "MacOSX" ||
          CoreApplication.platform === "MacOS" || CoreApplication.platform === "Darwin";
}

function optSaveViewToFITS(view, filePath) {
   var src = view.image;
   var isFloat = (src.sampleType === SampleType_Real);
   var isColor = (src.colorSpace !== ColorSpace_Gray);
   var tmp = new ImageWindow(src.width, src.height, src.numberOfChannels, src.bitsPerSample, isFloat, isColor, "PIW_CC_TmpSave");
   var inProcess = false;
   try {
      tmp.mainView.beginProcess(UndoFlag_NoSwapFile);
      inProcess = true;
      tmp.mainView.image.assign(src);
      tmp.mainView.endProcess();
      inProcess = false;
      if (!tmp.saveAs(filePath, false, false, false, false))
         throw new Error("Cosmic Clarity: failed to save temp FITS: " + filePath);
   } finally {
      if (inProcess) {
         try { tmp.mainView.endProcess(); } catch (eEnd) {}
      }
      try { tmp.forceClose(); } catch (eClose) {}
   }
}

// SYQON-STARLESS-V3: the Axiom V3 SyQonStarless.exe only accepts TIFF or PNG
// input (FITS is rejected), so the Starless path saves a 32-bit float TIFF,
// mirroring the vendor script (SyQon_Starless.js saveImageAsTiff: 32-bit
// IEEE float, compression=none).
function optSaveViewToTIFF(view, filePath) {
   var F = new FileFormat("TIFF", false, true);
   if (F.isNull)
      throw new Error("TIFF file format not available.");
   var f = new FileFormatInstance(F);
   if (f.isNull)
      throw new Error("Unable to create FileFormatInstance for TIFF.");
   var description = new ImageDescription();
   description.bitsPerSample = 32;
   description.ieeefpSampleFormat = true;
   if (!f.create(filePath, "compression=none"))
      throw new Error("Unable to create TIFF file: " + filePath);
   if (!f.setOptions(description)) {
      f.close();
      throw new Error("Unable to set 32-bit float options for TIFF.");
   }
   if (!f.writeImage(view.image)) {
      f.close();
      throw new Error("Failed to write image to TIFF: " + filePath);
   }
   f.close();
}

function optBuildCosmicClarityArgs(mode, inputFile, outputFile, params) {
   var normIn  = String(inputFile).split("\\").join("/");
   var normOut = String(outputFile).split("\\").join("/");
   var useGPU  = (params.useGPU !== false);
   var removeAb = (params.removeAberrationFirst === true);
   var args = ["cc", mode, "-i", normIn, "-o", normOut];
   if (useGPU) args.push("--gpu"); else args.push("--no-gpu");
   if (removeAb) args.push("--aberration-first");
   args.push("--no-temp-stretch");
   args.push("--target-median"); args.push("0.25");
   args.push("--chunk-size"); args.push("256");
   args.push("--overlap"); args.push("64");
   if (mode === "sharpen" || mode === "both") {
      args.push("--sharpening-mode"); args.push(params.sharpeningMode || "Both");
      args.push("--stellar-amount"); args.push(format("%.2f", isFinite(params.stellarAmount) ? params.stellarAmount : 0.9));
      args.push("--nonstellar-amount"); args.push(format("%.2f", isFinite(params.nonStellarAmount) ? params.nonStellarAmount : 0.5));
      args.push("--no-auto-psf");
      args.push("--nonstellar-psf"); args.push(format("%.2f", isFinite(params.nonStellarStrength) ? params.nonStellarStrength : 3.0));
   }
   if (mode === "denoise" || mode === "both") {
      args.push("--denoise-luma"); args.push(format("%.2f", isFinite(params.denoiseLuma) ? params.denoiseLuma : 0.5));
      args.push("--denoise-color"); args.push(format("%.2f", isFinite(params.denoiseColor) ? params.denoiseColor : 0.5));
      args.push("--denoise-mode"); args.push(params.denoiseMode || "full");
      if (params.denoiseModel === "Walking Noise")
         args.push("--denoise-walking");
   }
   return args;
}

function optReadCosmicClarityConfiguredLauncherPath() {
   try {
      var sep = (CoreApplication.platform === "MSWINDOWS" || CoreApplication.platform === "Windows") ? "\\" : "/";
      var cfgPath = File.systemTempDirectory + sep + "SetiAstroCosmicClarity_SASpro" + sep + "saspro_cc_cli_config.txt";
      if (!File.exists(cfgPath))
         return "";
      var lines = File.readLines(cfgPath);
      var launcherPath = "";
      var launcherMode = "";
      for (var i = 0; i < lines.length; ++i) {
         var line = String(lines[i]);
         var eq = line.indexOf("=");
         if (eq <= 0)
            continue;
         var k = line.substring(0, eq).trim();
         var v = line.substring(eq + 1).trim();
         if (k === "cliLauncherPath")
            launcherPath = v;
         if (k === "cliLauncherMode")
            launcherMode = v;
      }
      if (launcherPath.length > 0 && File.exists(launcherPath))
         return launcherPath;
      if (launcherMode === "setiastrosuitepro cc (installed command)")
         return "setiastrosuitepro";
   } catch (e0) {}
   return "";
}

function optTerminateExternalProcess(proc) {
   if (!proc)
      return;
   try { if (typeof proc.kill === "function") proc.kill(); } catch (e0) {}
   try { if (typeof proc.terminate === "function") proc.terminate(); } catch (e1) {}
}

function optExternalProcessExitCode(proc) {
   if (!proc)
      return null;
   try {
      if (typeof proc.exitCode !== "undefined")
         return proc.exitCode;
   } catch (e0) {}
   try {
      if (typeof proc.exitStatus !== "undefined")
         return proc.exitStatus;
   } catch (e1) {}
   return null;
}

function optRunCosmicClarityCLI(args, timeoutMs) {
   var isWin = optIsWindowsPlatform();
   var maxMs = Math.max(1000, timeoutMs || 300000);
   var candidates = [];
   // The frozen SetiAstroSuitePro binary needs the "cc" subcommand to
   // route into Cosmic Clarity's CLI; without it the executable either
   // launches the full Suite GUI or falls back to a system Python that
   // does not have the setiastro package installed (this is exactly
   // what produced the "ModuleNotFoundError: No module named
   // 'setiastro'" report from the user's first failed run). The same
   // subcommand is needed for the on-PATH `setiastrosuitepro` invocation;
   // the matching mode in CC's own config is literally called
   // "setiastrosuitepro cc (installed command)".
    if (isWin) {
       candidates.push({ prog: "C:\\Program Files\\SetiAstroSuitePro\\SetiAstroSuitePro.exe", prefix: [] });
    } else {
       candidates.push({ prog: "/Applications/SetiAstroSuitePro.app/Contents/MacOS/SetiAstroSuitePro", prefix: [] });
    }
    var configured = optReadCosmicClarityConfiguredLauncherPath();
    if (configured && configured.length > 0) {
       candidates.push({ prog: configured, prefix: [] });
    }
    candidates.push({ prog: "setiastrosuitepro", prefix: [] });
    if (isWin)
       candidates.push({ prog: "py", prefix: ["-3", "-m", "setiastro.saspro"] });
    else
       candidates.push({ prog: "python3", prefix: ["-m", "setiastro.saspro"] });
    var lastStderr = "";
    for (var ci = 0; ci < candidates.length; ++ci) {
       var c = candidates[ci];
       if (c.prefix.length === 0 && c.prog !== "setiastrosuitepro")
          if (!File.exists(c.prog))
             continue;
       var fullArgs = c.prefix.concat(args);
       var proc = new ExternalProcess();
       var stderrBuf = "";
       proc.onStandardOutputDataAvailable = function() {
          var t = String(this.stdout);
          if (t && t.length > 0) console.writeln(t);
       };
       proc.onStandardErrorDataAvailable = function() {
          var t = String(this.stderr);
          if (t && t.length > 0) { stderrBuf += t; console.warningln(t); }
       };
       // CC-BUGFIX-EXEC-BEGIN
       var started = false;
       try {
          proc.start(c.prog, fullArgs);
          started = true;
       } catch (e) {
          lastStderr = "Failed to start: " + c.prog + " (" + e.message + ")";
       }
       if (!started) {
          continue;
       }
       // CC-BUGFIX-EXEC-END
      var t0 = new Date().getTime();
      while (proc.isStarting || proc.isRunning) {
         if ((new Date().getTime() - t0) > maxMs) {
            optTerminateExternalProcess(proc);
            throw new Error("Cosmic Clarity timed out after " + Math.round(maxMs / 1000) + " seconds: " + c.prog);
         }
         optMsleep(100);
         optProcessEvents();
      }
      lastStderr = stderrBuf;
      var exitCode = optExternalProcessExitCode(proc);
      if (exitCode !== null && exitCode !== 0) {
         lastStderr = "Process exited with code " + exitCode + ": " + c.prog +
            (stderrBuf && stderrBuf.length > 0 ? "\n" + stderrBuf : "");
         continue;
      }
      return { ok: true, stderr: stderrBuf };
   }
   return { ok: false, stderr: lastStderr };
}

function optWaitForFile(filePath, timeoutMs) {
   var t0 = new Date().getTime();
   while ((new Date().getTime() - t0) < timeoutMs) {
      if (File.exists(filePath)) {
         try {
            var f = new File();
            f.openForReading(filePath);
            var sz = f.size;
            f.close();
            if (sz > 0) return true;
         } catch (e0) {}
      }
      optMsleep(500);
      optProcessEvents();
   }
   return File.exists(filePath);
}

function optApplyOutputFitsToView(outputFilePath, targetView) {
   optMsleep(1500);
   var opened = null;
   for (var attempt = 1; attempt <= 3; ++attempt) {
      try {
         opened = ImageWindow.open(outputFilePath);
         if (opened && opened.length > 0)
            break;
      } catch (e0) {}
      if (attempt < 3) optMsleep(1500);
   }
   if (!opened || opened.length < 1)
      throw new Error("Cosmic Clarity: failed to open output file: " + outputFilePath);
   var outWin = opened[0];
   try {
      outWin.show();
      var pm = new PixelMath();
      pm.expression = "iif(" + outWin.mainView.id + " == 0, $T, " + outWin.mainView.id + ")";
      pm.useSingleExpression = true;
      pm.createNewImage = false;
      pm.executeOn(targetView);
   } finally {
      outWin.forceClose();
      try { File.remove(outputFilePath); } catch (e1) {}
   }
}

// PRISM-INTEGRATION-BEGIN
function optBuildPrismArgs(inputFilePath, outputFilePath, jsonInfoPath, params) {
   var normIn  = String(inputFilePath).split("\\").join("/");
   var normOut = String(outputFilePath).split("\\").join("/");
   var normJson = jsonInfoPath ? String(jsonInfoPath).split("\\").join("/") : "";
   
   var args = [];
   args.push("--input");
   args.push(normIn);
   args.push("--output");
   args.push(normOut);
   args.push("--model-kind");
   args.push("prism_deep"); // Always use prism_deep
   args.push("--tile");
   args.push(String(params.tileSize || 512));
   args.push("--overlap");
   args.push(String(params.overlap || 128));
   args.push("--pad");
   args.push(String(params.pad || 512));
   args.push("--strength");
   args.push(format("%.2f", params.strength || 0.85));
   if (params.useAMP !== false)
      args.push("--use-amp");
   args.push("--amp-dtype");
   args.push(params.ampDType || "fp16");
   if (params.useCPU === true)
      args.push("--cpu");
   if (params.noDML === true)
      args.push("--no-dml");
   if (normJson && normJson.length > 0) {
      args.push("--json-info");
      args.push(normJson);
   }
   return args;
}

function optRunSyQonPrismOnView(targetView, params, dialog) {
   if (!optSafeView(targetView))
      throw new Error("No valid target view for SyQon Prism.");
   
   var isWin = (CoreApplication.platform === "MSWINDOWS" || CoreApplication.platform === "Windows");
   var sep = isWin ? "\\" : "/";
   var sysTemp = optNormalizePathOS(File.systemTempDirectory);
   var tempDir = optNormalizePathOS(sysTemp + sep + "PIWorkflow_Prism");
   if (!File.directoryExists(tempDir))
      File.createDirectory(tempDir);
      
   var base = optNormalizePathOS(tempDir + sep + targetView.id + "_" + new Date().getTime());
   var inputFile = base + "_in.fits";
   var outputFile = base + "_out.fits";
   var jsonFile = base + "_info.json";
   
   var exePath = optNormalizePathOS(optReadPrismConfiguredExecutablePath());
   if (!exePath || exePath.length === 0)
      throw new Error("SyQon Prism executable path is not configured. Please open and configure the SyQon Prism standalone script first.");
      
   if (!File.exists(exePath))
      throw new Error("SyQon Prism executable does not exist at configured path: " + exePath + "\nPlease verify your SyQon Prism installation.");
      
   // PRISM-INTEGRATION-BEGIN
   var preview = (dialog && dialog.postTab && dialog.postTab.preview && dialog.postTab.preview.preview) ? dialog.postTab.preview.preview : null;
   // PRISM-INTEGRATION-END
   if (preview) {
      preview.setBusy(true, "Prism (SyQon): running...");
   }
   
   try {
      optSaveViewToFITS(targetView, inputFile);
      if (!optWaitForFile(inputFile, 30000))
         throw new Error("SyQon Prism: input FITS not ready: " + inputFile);
         
      var args = optBuildPrismArgs(inputFile, outputFile, jsonFile, params);
      
      console.writeln("=> Executing SyQon Prism CLI...");
      console.writeln("   Command: " + exePath + " " + args.join(" "));
      
      var proc = new ExternalProcess();
      var stderrBuf = "";
      proc.onStandardOutputDataAvailable = function() {
         var t = String(this.stdout);
         if (t && t.length > 0) {
            console.writeln(t);
            var m = t.match(/\[\s*(\d+)%\]/);
            if (m && preview) {
               preview.setBusy(true, "Prism (SyQon): running (" + m[1] + "%)...");
            }
         }
      };
      proc.onStandardErrorDataAvailable = function() {
         var t = String(this.stderr);
         if (t && t.length > 0) {
            stderrBuf += t;
            console.warningln(t);
         }
      };
      
      // PRISM-INTEGRATION-BEGIN
      try {
         proc.start(exePath, args);
      } catch (e) {
         throw new Error("Failed to start SyQon Prism process: " + e.message);
      }
      // PRISM-INTEGRATION-END
         
      var t0 = new Date().getTime();
      var maxMs = 600000; // 10 minutes timeout
      while (proc.isStarting || proc.isRunning) {
         if ((new Date().getTime() - t0) > maxMs) {
            optTerminateExternalProcess(proc);
            throw new Error("SyQon Prism timed out after " + Math.round(maxMs / 1000) + " seconds.");
         }
         optMsleep(100);
         optProcessEvents();
      }
      
      var exitCode = optExternalProcessExitCode(proc);
      if (exitCode !== null && exitCode !== 0) {
         throw new Error("SyQon Prism process exited with code " + exitCode + "." + 
            (stderrBuf.length > 0 ? "\n" + stderrBuf.substring(0, 1000) : ""));
      }
      
      if (!optWaitForFile(outputFile, 30000)) {
         throw new Error("SyQon Prism did not produce output file in time.");
      }
      
      optApplyOutputFitsToView(outputFile, targetView);
      console.writeln("=> SyQon Prism Noise Reduction applied successfully.");
   } finally {
      if (preview) {
         preview.setBusy(false);
      }
      try { if (File.exists(inputFile)) File.remove(inputFile); } catch (e0) {}
      try { if (File.exists(outputFile)) File.remove(outputFile); } catch (e1) {}
      try { if (File.exists(jsonFile)) File.remove(jsonFile); } catch (e2) {}
   }
   return targetView;
}

function optBuildPostPrismConfigFromDialog(dlg) {
   var ampTypeIdx = 0;
   try { ampTypeIdx = dlg.comboPostPrismAMPDType.currentItem; } catch (e0) {}
   return {
      tileSize: optNumericValue(dlg.ncPostPrismTileSize, 512),
      overlap: optNumericValue(dlg.ncPostPrismOverlap, 128),
      pad: optNumericValue(dlg.ncPostPrismPad, 512),
      strength: optNumericValue(dlg.ncPostPrismStrength, 0.85),
      useAMP: optChecked(dlg.chkPostPrismUseAMP, true),
      ampDType: ["fp16", "bf16"][ampTypeIdx] || "fp16",
      useCPU: optChecked(dlg.chkPostPrismUseCPU, false),
      noDML: optChecked(dlg.chkPostPrismNoDML, false)
   };
}
// PRISM-INTEGRATION-END

// PARALLAX-INTEGRATION-BEGIN (engine)
// Non-rescaling PixelMath (rescale=false) — REQUIRED for the median-transfer
// stretch/inverse below, whose math relies on absolute pixel values. The generic
// optRunPixelMath rescales, which would corrupt these expressions.
function optParallaxPixelMath(view, exprR, exprG, exprB) {
   if (!optSafeView(view) || typeof PixelMath === "undefined")
      return false;
   var pm = new PixelMath();
   pm.useSingleExpression = !(exprG || exprB);
   pm.expression = exprR;
   if (exprG) pm.expression1 = exprG;
   if (exprB) pm.expression2 = exprB;
   pm.rescale = false;
   pm.truncate = true;
   pm.truncateLower = 0;
   pm.truncateUpper = 1;
   pm.createNewImage = false;
   pm.showNewImage = false;
   pm.use64BitWorkingImage = true;
   return pm.executeOn(view);
}

// Replicates SyQon_Parallax.js createPIStretchedTempWindow: clone the view into a
// hidden window and apply a black-point normalization + median-transfer stretch to
// targetMedian (mono / linked-color / unlinked-color variants). Returns the temp
// window plus the stretchInfo needed to invert it after inference.
function optParallaxCreateStretched(sourceView, targetMedian, linkedStretch) {
   // optCloneView returns the cloned VIEW (win.mainView); get its window for cleanup.
   var view = optCloneView(sourceView, sourceView.id + "_ParallaxTmp", false);
   if (!view || view.isNull)
      throw new Error("Parallax: failed to create temporary stretch image.");
   var win = view.window;
   try {
      var img = view.image;
      var full = new Rect(0, 0, img.width, img.height);
      var info = { used: true, targetMedian: targetMedian, wasColor: img.isColor, originalMin: [], originalMedian: [] };
      var tm = format("%.16f", targetMedian);
      var c;
      if (!img.isColor) {
         info.originalMin.push(img.minimum(full, 0, 0));
         var mn = format("%.16f", info.originalMin[0]);
         optParallaxPixelMath(view, "($T-" + mn + ")/(1-" + mn + ")", "", "");
         var om = view.image.median();
         if (!isFinite(om) || om <= 0 || om >= 1)
            throw new Error("Parallax: invalid normalized median: " + om);
         info.originalMedian.push(om);
         var omS = format("%.16f", om);
         optParallaxPixelMath(view,
            "((" + omS + "-1)*" + tm + "*$T)/(" + omS + "*(" + tm + "+$T-1)-" + tm + "*$T)", "", "");
      } else if (linkedStretch) {
         for (c = 0; c < 3; ++c) info.originalMin.push(img.minimum(full, c, c));
         var allMin = Math.min(info.originalMin[0], info.originalMin[1], info.originalMin[2]);
         var mnL = format("%.16f", allMin);
         optParallaxPixelMath(view, "($T-" + mnL + ")/(1-" + mnL + ")", "", "");
         var ni = view.image;
         var lm = (ni.median(full, 0, 0) + ni.median(full, 1, 1) + ni.median(full, 2, 2)) / 3.0;
         if (!isFinite(lm) || lm <= 0 || lm >= 1)
            throw new Error("Parallax: invalid normalized median: " + lm);
         info.originalMedian = [lm, lm, lm];
         info.originalMin = [allMin, allMin, allMin];
         var lmS = format("%.16f", lm);
         optParallaxPixelMath(view,
            "((" + lmS + "-1)*" + tm + "*$T)/(" + lmS + "*(" + tm + "+$T-1)-" + tm + "*$T)", "", "");
      } else {
         for (c = 0; c < 3; ++c) info.originalMin.push(img.minimum(full, c, c));
         var n0 = format("%.16f", info.originalMin[0]), n1 = format("%.16f", info.originalMin[1]), n2 = format("%.16f", info.originalMin[2]);
         optParallaxPixelMath(view,
            "($T-" + n0 + ")/(1-" + n0 + ")",
            "($T-" + n1 + ")/(1-" + n1 + ")",
            "($T-" + n2 + ")/(1-" + n2 + ")");
         var pim = view.image;
         for (c = 0; c < 3; ++c) {
            var omc = pim.median(full, c, c);
            if (!isFinite(omc) || omc <= 0 || omc >= 1)
               throw new Error("Parallax: invalid normalized median for channel " + c + ": " + omc);
            info.originalMedian.push(omc);
         }
         var o0 = format("%.16f", info.originalMedian[0]), o1 = format("%.16f", info.originalMedian[1]), o2 = format("%.16f", info.originalMedian[2]);
         optParallaxPixelMath(view,
            "((" + o0 + "-1)*" + tm + "*$T)/(" + o0 + "*(" + tm + "+$T-1)-" + tm + "*$T)",
            "((" + o1 + "-1)*" + tm + "*$T)/(" + o1 + "*(" + tm + "+$T-1)-" + tm + "*$T)",
            "((" + o2 + "-1)*" + tm + "*$T)/(" + o2 + "*(" + tm + "+$T-1)-" + tm + "*$T)");
      }
      return { win: win, stretchInfo: info };
   } catch (e) {
      try { win.forceClose(); } catch (e2) {}
      throw e;
   }
}

// Inverse of optParallaxCreateStretched (SyQon_Parallax.js reversePIStretchOnWindow).
function optParallaxReverseStretch(view, info) {
   if (!info || !info.used)
      return;
   var tm = format("%.16f", info.targetMedian);
   if (!info.wasColor) {
      var om = format("%.16f", info.originalMedian[0]);
      var mn = format("%.16f", info.originalMin[0]);
      optParallaxPixelMath(view,
         "(" + om + "*$T*(" + tm + "-1))/(" + om + "*" + tm + " - " + om + "*$T + " + tm + "*$T - " + tm + ")", "", "");
      optParallaxPixelMath(view, "($T*(1-" + mn + ")+" + mn + ")", "", "");
   } else {
      var o0 = format("%.16f", info.originalMedian[0]), o1 = format("%.16f", info.originalMedian[1]), o2 = format("%.16f", info.originalMedian[2]);
      var m0 = format("%.16f", info.originalMin[0]), m1 = format("%.16f", info.originalMin[1]), m2 = format("%.16f", info.originalMin[2]);
      optParallaxPixelMath(view,
         "(" + o0 + "*$T*(" + tm + "-1))/(" + o0 + "*" + tm + "-" + o0 + "*$T+" + tm + "*$T-" + tm + ")",
         "(" + o1 + "*$T*(" + tm + "-1))/(" + o1 + "*" + tm + "-" + o1 + "*$T+" + tm + "*$T-" + tm + ")",
         "(" + o2 + "*$T*(" + tm + "-1))/(" + o2 + "*" + tm + "-" + o2 + "*$T+" + tm + "*$T-" + tm + ")");
      optParallaxPixelMath(view,
         "($T*(1-" + m0 + ")+" + m0 + ")",
         "($T*(1-" + m1 + ")+" + m1 + ")",
         "($T*(1-" + m2 + ")+" + m2 + ")");
   }
}

// Build parallax_cli.exe argument list (flags confirmed via --help). Input/output
// are --i / --o (not --input/--output). MTF is NOT a CLI flag — it is handled by
// optParallaxCreateStretched/Reverse around this call.
function optBuildParallaxArgs(inputFilePath, outputFilePath, jsonInfoPath, params) {
   var normIn = String(inputFilePath).split("\\").join("/");
   var normOut = String(outputFilePath).split("\\").join("/");
   var normJson = jsonInfoPath ? String(jsonInfoPath).split("\\").join("/") : "";
   var args = [];
   args.push("--i"); args.push(normIn);
   args.push("--o"); args.push(normOut);
   // PARALLAX-MODE: v1.5 model style — "classic" (Natural, the original
   // StellarDirectNet/AstroNAFLite models) or "aesthetics" (Defined, SyQon's
   // NAFNet aesthetics models; bolder, and star reduction clamps to 7).
   // Only passed when non-default so older parallax_cli builds that don't
   // know the flag keep working (same guard as the vendor script).
   if (params.mode && params.mode !== "classic") {
      args.push("--mode");
      args.push(params.mode);
   }
   if (params.correctAberration === true)
      args.push("--correct-aberration");
   if (params.starReduction && params.starReduction > 0) {
      args.push("--star-reduction");
      args.push(String(Math.round(params.starReduction)));
   }
   if (params.sharpen && params.sharpen > 0.0) {
      args.push("--sharpen");
      args.push(format("%.2f", params.sharpen));
   }
   args.push("--tile"); args.push(String(params.tileSize || 512));
   args.push("--overlap"); args.push(String(params.overlap || 128));
   args.push("--pad"); args.push(String(params.pad || 512));
   if (params.useCPU === true) args.push("--cpu");
   if (params.noDML === true) args.push("--no-dml");
   if (normJson && normJson.length > 0) { args.push("--json-info"); args.push(normJson); }
   return args;
}

// Synchronous Parallax engine (mirrors optRunSyQonPrismOnView): optional PI temp
// stretch, save FITS, run the CLI with a blocking wait loop, reverse the stretch on
// the output, and write the result back into the candidate view in place.
function optRunSyQonParallaxOnView(targetView, params, dialog) {
   if (!optSafeView(targetView))
      throw new Error("No valid target view for SyQon Parallax.");

   var isWin = (CoreApplication.platform === "MSWINDOWS" || CoreApplication.platform === "Windows");
   var sep = isWin ? "\\" : "/";
   var sysTemp = optNormalizePathOS(File.systemTempDirectory);
   var tempDir = optNormalizePathOS(sysTemp + sep + "PIWorkflow_Parallax");
   if (!File.directoryExists(tempDir))
      File.createDirectory(tempDir);

   var base = optNormalizePathOS(tempDir + sep + targetView.id + "_" + new Date().getTime());
   var inputFile = base + "_in.fits";
   var outputFile = base + "_out.fits";
   var jsonFile = base + "_info.json";

   var exePath = optNormalizePathOS(optReadParallaxConfiguredExecutablePath());
   if (!exePath || exePath.length === 0)
      throw new Error("SyQon Parallax executable path is not configured. Please open and configure the SyQon Parallax standalone script first.");
   if (!File.exists(exePath))
      throw new Error("SyQon Parallax executable does not exist at configured path: " + exePath + "\nPlease verify your SyQon Parallax installation.");

   var preview = null;
   try {
      if (dialog && dialog.preTab && dialog.preTab.preview && dialog.preTab.preview.preview)
         preview = dialog.preTab.preview.preview;
      else if (dialog && dialog.postTab && dialog.postTab.preview && dialog.postTab.preview.preview)
         preview = dialog.postTab.preview.preview;
   } catch (ePv) {}
   if (preview)
      preview.setBusy(true, "Parallax (SyQon): running...");

   var stretchInfo = { used: false };
   var stretchWin = null;
   var outputWin = null;
   try {
      var saveView = targetView;
      if (params.useMTF === true) {
         var st = optParallaxCreateStretched(targetView, (params.mtfTarget != null ? params.mtfTarget : 0.12), params.linkedStretch === true);
         stretchWin = st.win;
         stretchInfo = st.stretchInfo;
         saveView = stretchWin.mainView;
      }

      optSaveViewToFITS(saveView, inputFile);
      if (!optWaitForFile(inputFile, 30000))
         throw new Error("SyQon Parallax: input FITS not ready: " + inputFile);

      var args = optBuildParallaxArgs(inputFile, outputFile, jsonFile, params);
      // Run the CLI once with the given extra args; throws on start/timeout/exit/output error.
      function runParallaxCli(extra) {
         var a = (extra && extra.length) ? args.concat(extra) : args;
         console.writeln("=> Executing SyQon Parallax CLI...");
         console.writeln("   Command: " + exePath + " " + a.join(" "));
         var proc = new ExternalProcess();
         var stderrBuf = "";
         proc.onStandardOutputDataAvailable = function() {
            var t = String(this.stdout);
            if (t && t.length > 0) { console.writeln(t); var m = t.match(/\[\s*(\d+)%\]/); if (m && preview) preview.setBusy(true, "Parallax (SyQon): running (" + m[1] + "%)..."); }
         };
         proc.onStandardErrorDataAvailable = function() { var t = String(this.stderr); if (t && t.length > 0) { stderrBuf += t; console.warningln(t); } };
         try { proc.start(exePath, a); } catch (e) { throw new Error("Failed to start SyQon Parallax process: " + e.message); }
         var t0 = new Date().getTime(), maxMs = 1200000;
         while (proc.isStarting || proc.isRunning) {
            if ((new Date().getTime() - t0) > maxMs) { optTerminateExternalProcess(proc); throw new Error("SyQon Parallax timed out after " + Math.round(maxMs / 1000) + " seconds."); }
            optMsleep(100); optProcessEvents();
         }
         var exitCode = optExternalProcessExitCode(proc);
         if (exitCode !== null && exitCode !== 0) throw new Error("SyQon Parallax process exited with code " + exitCode + "." + (stderrBuf.length > 0 ? "\n" + stderrBuf.substring(0, 1000) : ""));
         if (!optWaitForFile(outputFile, 30000)) throw new Error("SyQon Parallax did not produce output file in time.");
      }
      // GPU/DirectML first; on failure, automatically retry on CPU (--cpu --no-dml). Skip the
      // retry if the caller already forced CPU.
      try {
         runParallaxCli(null);
      } catch (eGpu) {
         if (params.useCPU === true || params.noDML === true) throw eGpu;
         console.warningln("=> SyQon Parallax GPU run failed (" + (eGpu.message || eGpu) + "); retrying on CPU...");
         try { if (File.exists(outputFile)) File.remove(outputFile); } catch (eR) {}
         runParallaxCli(["--cpu", "--no-dml"]);
      }

      if (stretchInfo.used) {
         // Reverse the temp stretch on the CLI output, then copy it back in place.
         var opened = ImageWindow.open(outputFile);
         if (!opened || opened.length < 1)
            throw new Error("SyQon Parallax: failed to open output FITS.");
         outputWin = opened[0];
         outputWin.show();
         optParallaxReverseStretch(outputWin.mainView, stretchInfo);
         var pmOut = new PixelMath();
         pmOut.useSingleExpression = true;
         pmOut.expression = outputWin.mainView.id;
         pmOut.createNewImage = false;
         pmOut.rescale = false;
         pmOut.truncate = false;
         pmOut.executeOn(targetView);
      } else {
         optApplyOutputFitsToView(outputFile, targetView);
      }
      console.writeln("=> SyQon Parallax applied successfully.");
   } finally {
      if (preview)
         preview.setBusy(false);
      try { if (stretchWin && !stretchWin.isNull) stretchWin.forceClose(); } catch (e0) {}
      try { if (outputWin && !outputWin.isNull) outputWin.forceClose(); } catch (e1) {}
      try { if (File.exists(inputFile)) File.remove(inputFile); } catch (e2) {}
      try { if (File.exists(outputFile)) File.remove(outputFile); } catch (e3) {}
      try { if (File.exists(jsonFile)) File.remove(jsonFile); } catch (e4) {}
   }
   return targetView;
}

function optBuildPreParallaxConfigFromControls(dlg) {
   var preModeIdx = 0;
   try { preModeIdx = dlg.comboPreParallaxMode.currentItem; } catch (eM) {}
   return {
      mode: ["classic", "aesthetics"][preModeIdx] || "classic",
      correctAberration: optChecked(dlg.chkPreParallaxCorrectAb, true),
      starReduction: Math.round(optNumericValue(dlg.ncPreParallaxStarReduction, 3)),
      sharpen: optNumericValue(dlg.ncPreParallaxSharpen, 0.80),
      tileSize: optNumericValue(dlg.ncPreParallaxTileSize, 512),
      overlap: optNumericValue(dlg.ncPreParallaxOverlap, 128),
      pad: optNumericValue(dlg.ncPreParallaxPad, 512),
      // Linear Data Stretch + Performance managed internally (UI removed 2026-06-18): Pre data
      // is LINEAR, so the temp MTF stretch is always on (median target 0.15, unlinked); GPU
      // by default with an automatic CPU fallback handled in optRunSyQonParallaxOnView.
      useMTF: true, mtfTarget: 0.15, linkedStretch: false, useCPU: false, noDML: false
   };
}

// Post Sharpening variant. Reads the dlg.*PostParallax* controls. Same shape and
// engine (optRunSyQonParallaxOnView) as Pre, but the temp stretch defaults OFF:
// Post data is already non-linear, so it is fed to the model as-is unless the
// user opts in.
function optBuildPostParallaxConfigFromControls(dlg) {
   var postModeIdx = 0;
   try { postModeIdx = dlg.comboPostParallaxMode.currentItem; } catch (eM) {}
   return {
      mode: ["classic", "aesthetics"][postModeIdx] || "classic",
      correctAberration: optChecked(dlg.chkPostParallaxCorrectAb, true),
      starReduction: Math.round(optNumericValue(dlg.ncPostParallaxStarReduction, 3)),
      sharpen: optNumericValue(dlg.ncPostParallaxSharpen, 0.80),
      tileSize: optNumericValue(dlg.ncPostParallaxTileSize, 512),
      overlap: optNumericValue(dlg.ncPostParallaxOverlap, 128),
      pad: optNumericValue(dlg.ncPostParallaxPad, 512),
      // Managed internally (UI removed 2026-06-18): Post data is already NON-LINEAR, so the
      // temp stretch stays OFF; GPU by default with automatic CPU fallback.
      useMTF: false, mtfTarget: 0.15, linkedStretch: false, useCPU: false, noDML: false
   };
}
// PARALLAX-INTEGRATION-END (engine)

// DEEPSNR-INTEGRATION-BEGIN
function optBuildPostDeepSnrConfigFromDialog(dlg) {
   return {
      amount: optNumericValue(dlg.ncPostDeepSNRAmount, 1.0)
   };
}
// DEEPSNR-INTEGRATION-END

// SYQON-STARLESS-INTEGRATION-BEGIN
// SYQON-STARLESS-V3: argument list for the NEW SyQonStarless.exe (Qt6/C++
// "Axiom V3" build, installed under C:\Program Files\SyQon\Starless). Contract
// confirmed against the binary's --help and the vendor's SyQon_Starless.js:
//   -i/-o (TIFF or PNG), -v overlap (default 64), -d Auto|GPU|CPU,
//   -c context ('pixinsight'), --gui (opens the interactive window).
// The old Python starless_cli flags (--input/--output/--stars/--tile/--pad/
// --use-mtf/--use-amp/--amp-dtype/--cpu/--no-dml/--json-info) DO NOT exist on
// this binary — passing any of them causes an immediate exit. --gui is
// deliberately NOT passed: without it the exe runs fully headless, so no
// SyQon window ever appears and the result flows to the preview as before.
// The stars layer is computed here with PixelMath (the CLI has no --stars).
function optBuildStarlessArgs(inputFilePath, outputFilePath, params) {
   var normIn  = String(inputFilePath).split("\\").join("/");
   var normOut = String(outputFilePath).split("\\").join("/");
   var args = [];
   args.push("-i"); args.push(normIn);
   args.push("-o"); args.push(normOut);
   args.push("-v"); args.push(String(params.overlap || 64));
   args.push("-d"); args.push(params.device || "Auto");
   args.push("-c"); args.push("pixinsight");
   return args;
}

function optRunSyQonStarlessOnView(targetView, params, dialog) {
   if (!optSafeView(targetView))
      throw new Error("No valid target view for SyQon Starless.");

   // SYQON-STARLESS-V3: the Axiom V3 exe uses a fixed 512x512 tile and crashes
   // ("Image index out of bounds", exit 1) on images smaller than the tile in
   // either dimension (verified 2026-07-16 against the real binary). Guard it
   // with a clear error so fallback chains (CabraMagic) move on cleanly.
   if (targetView.image.width < 512 || targetView.image.height < 512)
      throw new Error("SyQon Starless (Axiom V3) requires images of at least 512x512 pixels; got " +
         targetView.image.width + "x" + targetView.image.height + ".");

   var isWin = (CoreApplication.platform === "MSWINDOWS" || CoreApplication.platform === "Windows");
   var sep = isWin ? "\\" : "/";
   var sysTemp = optNormalizePathOS(File.systemTempDirectory);
   var tempDir = optNormalizePathOS(sysTemp + sep + "PIWorkflow_Starless");
   if (!File.directoryExists(tempDir))
      File.createDirectory(tempDir);
      
   // SYQON-STARLESS-V3: the new exe only reads TIFF/PNG and writes back the
   // same format — both temp files are 32-bit float TIFF now (was FITS).
   var baseName = targetView.id + "_" + new Date().getTime();
   var inputFile = optNormalizePathOS(tempDir + sep + baseName + "_in.tif");
   var outputFile = optNormalizePathOS(tempDir + sep + baseName + "_starless.tif");

   var exePath = optNormalizePathOS(optReadStarlessConfiguredExecutablePath());
   if (!exePath || exePath.length === 0)
      throw new Error("SyQon Starless executable path is not configured. Please open and configure the SyQon Starless standalone script first.");
      
   if (!File.exists(exePath))
      throw new Error("SyQon Starless executable does not exist at configured path: " + exePath + "\nPlease verify your SyQon Starless installation.");
      
   var preview = (dialog && dialog.stretchTab && dialog.stretchTab.preview && dialog.stretchTab.preview.preview) ? dialog.stretchTab.preview.preview : null;
   if (preview) {
      preview.setBusy(true, "Starless (SyQon): running...");
   }
   
   var starlessWindow = null;
   var starsWindow = null;
   
   try {
      // SYQON-STARLESS-V3: 32-bit float TIFF input (the exe rejects FITS).
      optSaveViewToTIFF(targetView, inputFile);
      if (!optWaitForFile(inputFile, 30000))
         throw new Error("SyQon Starless: input TIFF not ready: " + inputFile);

      var args = optBuildStarlessArgs(inputFile, outputFile, params);

      // Run the headless CLI once with the given args; throws on start/timeout/
      // exit/output error (same shape as runParallaxCli).
      function runStarlessCli(a) {
         console.writeln("=> Executing SyQon Starless CLI (headless)...");
         console.writeln("   Command: " + exePath + " " + a.join(" "));
         var proc = new ExternalProcess();
         var stderrBuf = "";
         proc.onStandardOutputDataAvailable = function() {
            var t = String(this.stdout);
            if (t && t.length > 0) {
               console.writeln(t);
               // Axiom V3 prints "[CLI] Progress: 37%"; older CLIs printed "[ 37%]".
               var m = t.match(/Progress:\s*(\d+)%/) || t.match(/\[\s*(\d+)%\]/);
               if (m && preview)
                  preview.setBusy(true, "Starless (SyQon): running (" + m[1] + "%)...");
            }
         };
         proc.onStandardErrorDataAvailable = function() {
            var t = String(this.stderr);
            if (t && t.length > 0) { stderrBuf += t; console.warningln(t); }
         };
         try {
            proc.start(exePath, a);
         } catch (e) {
            throw new Error("Failed to start SyQon Starless process: " + e.message);
         }
         var t0 = new Date().getTime();
         var maxMs = (params.outputTimeoutMinutes || 20) * 60 * 1000;
         while (proc.isStarting || proc.isRunning) {
            if ((new Date().getTime() - t0) > maxMs) {
               optTerminateExternalProcess(proc);
               throw new Error("SyQon Starless timed out after " + Math.round(maxMs / 1000) + " seconds.");
            }
            optMsleep(100);
            optProcessEvents();
         }
         var exitCode = optExternalProcessExitCode(proc);
         if (exitCode !== null && exitCode !== 0) {
            throw new Error("SyQon Starless process exited with code " + exitCode + "." +
               (stderrBuf.length > 0 ? "\n" + stderrBuf.substring(0, 1000) : ""));
         }
         if (!optWaitForFile(outputFile, 30000))
            throw new Error("SyQon Starless did not produce starless output file in time.");
      }
      // GPU/Auto first; on failure retry once forcing CPU (mirrors the Parallax
      // fallback). Skip the retry if the caller already forced CPU.
      try {
         runStarlessCli(args);
      } catch (eGpu) {
         if (params.device === "CPU") throw eGpu;
         console.warningln("=> SyQon Starless GPU run failed (" + (eGpu.message || eGpu) + "); retrying on CPU...");
         try { if (File.exists(outputFile)) File.remove(outputFile); } catch (eR) {}
         var cpuParams = { overlap: params.overlap, device: "CPU" };
         runStarlessCli(optBuildStarlessArgs(inputFile, outputFile, cpuParams));
      }

      // Load starless TIFF
      var openedStarless = ImageWindow.open(outputFile);
      if (!openedStarless || openedStarless.length < 1)
         throw new Error("Failed to open starless output FITS file.");
      starlessWindow = openedStarless[0];
      starlessWindow.show();
      
      // Compute stars image
      if (params.starsOnlyMode !== "None") {
         starsWindow = new ImageWindow(
            targetView.image.width,
            targetView.image.height,
            targetView.image.numberOfChannels,
            targetView.window.bitsPerSample,
            targetView.window.isFloatSample,
            optViewIsColor(targetView),
            optUniqueId(targetView.id + "_stars")
         );
         
         starsWindow.mainView.beginProcess(UndoFlag_NoSwapFile);
         starsWindow.mainView.image.assign(targetView.image);
         starsWindow.mainView.endProcess();
         
         var originalId = targetView.id;
         var starlessId = starlessWindow.mainView.id;
         var expr = "";
         if (params.starsOnlyMode === "Subtraction") {
            expr = "(" + originalId + "-" + starlessId + ")";
         } else { // Unscreen (default)
            expr = "(" + originalId + "-" + starlessId + ")/(1-" + starlessId + ")";
         }
         
         // Run PixelMath using standard PJSR PixelMath class
         var pm = new PixelMath();
         pm.expression = expr;
         pm.useSingleExpression = true;
         pm.createNewImage = false;
         pm.executeOn(starsWindow.mainView);
         starsWindow.show();
      }
      
      // SYQON-STARLESS-V3: optional in-place mode (applyToTarget) — copies the
      // starless result back into the target view and closes the temp windows.
      // Used by the CabraMagic star-split fallback, whose contract is "remove
      // stars from `view` IN PLACE" (before this, the SyQon branch returned
      // windows the caller ignored: the view kept its stars and both windows
      // leaked).
      if (params.applyToTarget === true) {
         var pmApply = new PixelMath();
         pmApply.useSingleExpression = true;
         pmApply.expression = starlessWindow.mainView.id;
         pmApply.createNewImage = false;
         pmApply.rescale = false;
         pmApply.truncate = false;
         pmApply.executeOn(targetView);
         try { starlessWindow.forceClose(); } catch (eCw) {}
         starlessWindow = null;
         if (starsWindow) { try { starsWindow.forceClose(); } catch (eCs) {} starsWindow = null; }
      }

      console.writeln("=> SyQon Starless applied successfully.");
   } finally {
      if (preview) {
         preview.setBusy(false);
      }
      try { if (File.exists(inputFile)) File.remove(inputFile); } catch (e0) {}
      try { if (File.exists(outputFile)) File.remove(outputFile); } catch (e1) {}
   }

   return { starlessWindow: starlessWindow, starsWindow: starsWindow };
}

// SYQON-STARLESS-V3: the dialog exposes only what the new exe understands —
// Overlap (-v) and Device (-d Auto/GPU/CPU) — plus the Stars Mode, which is
// ours (PixelMath). Tile/Pad/AMP/dtype/DirectML controls were removed with the
// old Python CLI.
function optBuildStarlessParamsFromDialog(dlg) {
   var deviceIdx = 0;
   try { deviceIdx = dlg.comboStarSplitSyQonDevice.currentItem; } catch (e0) {}
   var starsModeIdx = 2;
   try { starsModeIdx = dlg.comboStarSplitSyQonStarsMode.currentItem; } catch (e1) {}
   return {
      overlap: optNumericValue(dlg.ncStarSplitSyQonOverlap, 64),
      device: ["Auto", "GPU", "CPU"][deviceIdx] || "Auto",
      starsOnlyMode: ["None", "Subtraction", "Unscreen"][starsModeIdx] || "Unscreen",
      outputTimeoutMinutes: 20
   };
}
// SYQON-STARLESS-INTEGRATION-END


function optRunCosmicClarityOnView(targetView, params) {
   if (!optSafeView(targetView))
      throw new Error("No valid target view for Cosmic Clarity.");
   var isWin = (CoreApplication.platform === "MSWINDOWS" || CoreApplication.platform === "Windows");
   var sep = isWin ? "\\" : "/";
   var sysTemp = optNormalizePathOS(File.systemTempDirectory);
   var tempDir = optNormalizePathOS(sysTemp + sep + "PIWorkflow_CC");
   if (!File.directoryExists(tempDir))
      File.createDirectory(tempDir);
   var base = optNormalizePathOS(tempDir + sep + targetView.id + "_" + new Date().getTime());
   var inputFile = base + "_in.fits";
   var outputFile = base + "_out.fits";
   try {
      optSaveViewToFITS(targetView, inputFile);
      if (!optWaitForFile(inputFile, 30000))
         throw new Error("Cosmic Clarity: input FITS not ready: " + inputFile);
      var args = optBuildCosmicClarityArgs(params.processMode || "sharpen", inputFile, outputFile, params);
      var runResult = optRunCosmicClarityCLI(args, 300000);
      if (!runResult || runResult.ok !== true) {
         var runExtra = (runResult && runResult.stderr && runResult.stderr.length > 0) ? "\n\n" + runResult.stderr.substring(0, 1200) : "";
         throw new Error("Cosmic Clarity could not be executed." + runExtra);
      }
      if (!optWaitForFile(outputFile, 300000)) {
         var extra = (runResult && runResult.stderr && runResult.stderr.length > 0) ? "\n\n" + runResult.stderr.substring(0, 1200) : "";
         throw new Error("Cosmic Clarity did not produce output in time." + extra);
      }
      optApplyOutputFitsToView(outputFile, targetView);
   } finally {
      try { if (File.exists(inputFile)) File.remove(inputFile); } catch (e0) {}
   }
   return targetView;
}

function optBuildPreCosmicClarityConfig(dlg) {
   var mode = dlg.comboPreCCSharpenMode.combo.currentItem;
   var modeText = "Both";
   if (mode === 1) modeText = "Stellar Only";
   else if (mode === 2) modeText = "Non-Stellar Only";
   return {
      sharpeningMode: modeText,
      stellarAmount: dlg.ncPreCCStellarAmt.value,
      nonStellarStrength: dlg.ncPreCCNSStrength.value,
      nonStellarAmount: dlg.ncPreCCNSAmount.value,
      removeAberrationFirst: dlg.chkPreCCRemoveAb.checked === true,
      useGPU: true
   };
}
