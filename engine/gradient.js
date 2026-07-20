function optRunAutoDBEGradientCorrection(targetView, params) {
   if (!optSafeView(targetView))
      throw new Error("[AutoDBE/TARGET] There is no valid target view to execute AutoDBE.");
   if (OPT_TEST_MODE)
      return optRunTestModePreviewTransform(targetView, "contrast", 0.11);
   if (!optIsAutoDBEAvailable())
      throw new Error("[AutoDBE/AVAILABILITY] AutoDBE is not available in this PixInsight runtime. If it is installed, this session could not load its script helpers.");
   var isMono = (targetView.image.numberOfChannels < 3);
   var workView = targetView;
   var tempWin = null;
   if (isMono) {
      var monoImg = targetView.image;
      var w = monoImg.width, h = monoImg.height;
      tempWin = new ImageWindow(w, h, 3, 32, true, true, optUniqueId("ADBE_RGB_Tmp"));
      var tmpImg = new Image(w, h, 3, ColorSpace_RGB, 32, SampleType_Real);
      try {
         monoImg.selectedChannel = 0;
         for (var c = 0; c < 3; ++c) {
            tmpImg.selectedChannel = c;
            tmpImg.apply(monoImg, ImageOp_Mov);
         }
         monoImg.resetSelections();
         tmpImg.resetSelections();
         tempWin.mainView.beginProcess(UndoFlag_NoSwapFile);
         tempWin.mainView.image.assign(tmpImg);
         tempWin.mainView.endProcess();
      } finally {
         try { tmpImg.free(); } catch (ef) {}
      }
      workView = tempWin.mainView;
      try { tempWin.show(); tempWin.bringToFront(); } catch (e0) {}
   }
   try { workView.window.show(); workView.window.bringToFront(); } catch (e1) {}
   try {
      // AUTODBE-IIFE-BEGIN (v138): AutoDBE.js (SetiAstro) declares
      // GradientDescentParameters (object) and executeGradientDescent (function)
      // as top-level let/function. Under the V8 runtime (PixInsight 1.9.4) an
      // indirect eval does NOT leak those to the script global, so the legacy
      // direct-global path saw them as "undefined" -> feature greyed out /
      // failed. The Script-process route is also out (Script.filePath is
      // read-only). We therefore load AutoDBE.js inside an IIFE and CAPTURE both
      // symbols (same pattern as GraXpertLib), then drive them
      // directly. The values below are the 1.9.4-optimized defaults; the three
      // workflow sliders override Paths/Tolerance/Smoothing. replaceTarget=true
      // corrects the view in place; the model is emitted unless "Show model" off.
      if (!optTryLoadAutoDBEScript(false) || optAutoDBEParams == null || typeof optAutoDBEExecuteFn !== "function")
         throw new Error("[AutoDBE/AVAILABILITY] Could not load AutoDBE.js (SetiAstro) helpers from the PixInsight script tree.");
      var adbePaths = (params && params.descentPathsInput !== undefined) ? Math.round(params.descentPathsInput) : 50;
      var adbeTol = (params && params.tolerance !== undefined) ? params.tolerance : 2;
      var adbeSmooth = (params && params.smoothing !== undefined) ? params.smoothing : 0.25;
      var adbeDiscardModel = !(params && params.showModel === true);
      optAutoDBEParams.targetView = workView;
      optAutoDBEParams.replaceTarget = true;
      optAutoDBEParams.discardModel = adbeDiscardModel;
      optAutoDBEParams.descentPathsInput = adbePaths;
      optAutoDBEParams.tolerance = adbeTol;
      optAutoDBEParams.smoothing = adbeSmooth;
      optAutoDBEParams.defaultSampleRadius = 10;
      optAutoDBEParams.overrideSampleRadius = false;
      optAutoDBEParams.overrideSmoothing = false;
      optAutoDBEParams.enableSimplifiedInitialModelling = true;
      optAutoDBEParams.rigidlyFixCornerPoints = false;
      optAutoDBEParams.correctionType = 1;
      optAutoDBEParams.polynomialDegree = 1;
      optAutoDBEExecuteFn(workView, []);
      // AUTODBE-IIFE-END
      if (isMono) {
         var corrImg = new Image(workView.image.width, workView.image.height, 1, ColorSpace_Gray, 32, SampleType_Real);
         try {
            workView.image.selectedChannel = 0;
            corrImg.selectedChannel = 0;
            corrImg.apply(workView.image, ImageOp_Mov);
            workView.image.resetSelections();
            corrImg.resetSelections();
            targetView.beginProcess(UndoFlag_NoSwapFile);
            targetView.image.assign(corrImg);
            targetView.endProcess();
         } finally {
            try { corrImg.free(); } catch (ef2) {}
         }
      }
   } finally {
      if (tempWin && !tempWin.isNull)
         try { tempWin.forceClose(); } catch (ec) {}
   }
   return targetView;
}

function optCreateGraXpertProcessInstance() {
   return optCreateGenericProcessInstance(["GraXpert", "Graxpert"], ["GraXpert", "Graxpert"]);
}

function optUserHomeDirectory() {
   try {
      if (File.homeDirectory && File.homeDirectory.length > 0)
         return optNormalizePath(File.homeDirectory);
   } catch (e0) {
   }
   return "";
}

function optGraXpertExecutableCandidatePaths() {
   var home = optUserHomeDirectory();
   var paths = [
      "C:/Program Files/GraXpert/GraXpert.exe",
      "C:/Program Files/GraXpert/graxpert.exe",
      "C:/Program Files (x86)/GraXpert/GraXpert.exe",
      "C:/Program Files (x86)/GraXpert/graxpert.exe",
      "/Applications/GraXpert.app",
      "/Applications/GraXpert.app/Contents/MacOS/GraXpert",
      "/usr/local/bin/GraXpert",
      "/usr/local/bin/graxpert",
      "/opt/GraXpert/GraXpert",
      "/opt/graxpert/graxpert"
   ];
   if (home && home.length > 0) {
      paths.push(home + "/AppData/Local/Programs/GraXpert/GraXpert.exe");
      paths.push(home + "/AppData/Local/Programs/GraXpert/graxpert.exe");
      paths.push(home + "/AppData/Local/GraXpert/GraXpert.exe");
      paths.push(home + "/AppData/Local/GraXpert/graxpert.exe");
      paths.push(home + "/Applications/GraXpert.app");
      paths.push(home + "/bin/GraXpert");
      paths.push(home + "/bin/graxpert");
   }
   return paths;
}

function optHasConfiguredGraXpertExecutablePath(gxp) {
   var objs = [];
   try { if (gxp) objs.push(gxp); } catch (e0) {}
   try { if (gxp && gxp.graxpertParameters) objs.push(gxp.graxpertParameters); } catch (e1) {}
   var names = [
      "graxpertPath",
      "graxpert_path",
      "graXpertPath",
      "graXpert_path",
      "graxpertExe",
      "graxpertExePath",
      "graxpertExecutable",
      "graxpertExecutablePath",
      "executable",
      "executablePath",
      "executable_path",
      "applicationPath",
      "appPath",
      "path"
   ];
   for (var i = 0; i < objs.length; ++i) {
      var obj = objs[i];
      if (!obj)
         continue;
      for (var j = 0; j < names.length; ++j) {
         try {
            var value = obj[names[j]];
            if (value && typeof value === "string" && value.length > 0 && File.exists(value))
               return true;
         } catch (e2) {
         }
      }
   }
   return false;
}

function optSetPathOnObject(obj, path) {
   if (!obj || !path || path.length === 0)
      return false;
   var names = [
      "graxpertPath",
      "graxpert_path",
      "graXpertPath",
      "graXpert_path",
      "graxpertExe",
      "graxpertExePath",
      "graxpertExecutable",
      "graxpertExecutablePath",
      "executable",
      "executablePath",
      "executable_path",
      "applicationPath",
      "appPath",
      "path"
   ];
   var ok = false;
   for (var i = 0; i < names.length; ++i) {
      try {
         obj[names[i]] = path;
         ok = true;
      } catch (e0) {
      }
   }
   return ok;
}

function optConfigureGraXpertExecutablePath(gxp) {
   if (!gxp)
      return false;
   var path = optFindFirstExistingCandidatePath(optGraXpertExecutableCandidatePaths());
   if (!path || path.length === 0)
      return false;
   var changed = false;
   try { changed = optSetPathOnObject(gxp.graxpertParameters, path) || changed; } catch (e0) {}
   try { changed = optSetPathOnObject(gxp, path) || changed; } catch (e1) {}
   if (changed && typeof gxp.storeGraXpertParameters === "function") {
      try { gxp.storeGraXpertParameters(); } catch (e2) {}
   }
   if (changed && typeof gxp.readGraXpertParameters === "function") {
      try { gxp.readGraXpertParameters(); } catch (e3) {}
   }
   try {
      console.writeln("=> GraXpert executable path applied: " + path);
   } catch (e4) {
   }
   return changed;
}

// Robust GraXpert-path bridge for the legacy GraXpertLib. The lib's private
// getGraXpertPath() reads GRAXPERT_PATH_CONFIG (a path baked in at eval time from
// the platform #ifeq macro) and ignores any instance property. If that macro
// resolved to the wrong platform directory, the lib won't find the user's
// configured path even though it exists. hasGraXpertPath() migrates a file from
// ~/GraXpertPath.txt into GRAXPERT_PATH_CONFIG, so we read the real path from
// whichever platform config dir actually has it and seed ~/GraXpertPath.txt; the
// lib then finds it regardless of how its macro resolved.
function optEnsureGraXpertPathFile() {
   try {
      var home = optNormalizePath(File.homeDirectory);
      if (!home || home.length === 0)
         return false;
      var dirs = [
         home + "/Library/Application Support/GraXpertScript",
         home + "/AppData/Local/GraXpertScript",
         home + "/.local/share/GraXpertScript"
      ];
      var foundFile = "";
      var foundPath = "";
      for (var i = 0; i < dirs.length; ++i) {
         var f = dirs[i] + "/GraXpertPath.txt";
         try {
            if (File.exists(f)) {
               foundPath = File.readTextFile(f);
               foundFile = f;
               break;
            }
         } catch (eR) {}
      }
      console.noteln("=> GraXpert path resolver [v4]: platform=" + optDetectPlatformToken() +
                     ", configFile=" + (foundFile.length ? foundFile : "(GraXpertPath.txt NOT found in any platform dir)"));
      if (!foundPath || foundPath.length === 0)
         return false;
      var seed = home + "/GraXpertPath.txt";
      try {
         if (!File.exists(seed)) {
            File.writeTextFile(seed, foundPath);
            console.noteln("=> GraXpert path resolver [v4]: seeded " + seed + " -> " + foundPath);
         }
      } catch (eW) {}
      return true;
   } catch (e0) {
      return false;
   }
}

function optGraXpertCorrectionTextFromDialog(dlg) {
   var idx = OPT_GRAXPERT_DEFAULT_CORRECTION;
   try { idx = dlg.comboGraXpertCorrection.combo.currentItem; } catch (e0) {}
   return (idx === 1) ? "Division" : "Subtraction";
}

function optConfigureGraXpertNativeProcess(P, mode, dlg) {
   if (!P)
      return;
   var isDenoise = mode === "denoise";
   var smoothing = OPT_GRAXPERT_DEFAULT_SMOOTHING;
   try { smoothing = dlg.ncGraXpertSmoothing.value; } catch (e0) {}
   if (!isFinite(smoothing))
      smoothing = OPT_GRAXPERT_DEFAULT_SMOOTHING;
   smoothing = Math.max(0.0, Math.min(1.0, smoothing));

   var strength = 1.00;
   try { strength = dlg.ncPostGraXpertStrength.value; } catch (e1) {}
   if (!isFinite(strength))
      strength = 1.00;
   strength = Math.max(0.0, Math.min(2.0, strength));

   var batchSize = 4;
   try { batchSize = Math.round(dlg.ncPostGraXpertBatchSize.value); } catch (e2) {}
   if (!isFinite(batchSize) || batchSize < 1)
      batchSize = 4;
   batchSize = Math.max(1, Math.min(16, batchSize));

   var disableGPU = false;
   var showLogs = false;

   P.backgroundExtraction = !isDenoise;
   P.smoothing = isDenoise ? 0.0 : smoothing;
   P.correction = optGraXpertCorrectionTextFromDialog(dlg);
   P.createBackground = !isDenoise;
   P.backgroundExtractionAIModel = "";
   P.denoising = isDenoise;
   P.strength = isDenoise ? strength : 1.00;
   P.batchSize = batchSize;
   P.denoiseAIModel = "";
   P.disableGPU = disableGPU;
   P.replaceImage = true;
   P.showLogs = showLogs;
   P.appPath = "";
   P.deconvolution = false;
   P.deconvolutionMode = "Object-only";
   P.deconvolutionObjectStrength = 0.5;
   P.deconvolutionObjectPSFSize = 5.0;
   P.deconvolutionObjectAIModel = "";
   P.deconvolutionStarsAIModel = "";

   // Fallback aliases for transitional GraXpert process builds.
   optSetOptionalProcessProperty(P, ["backgroundExtraction", "background_extraction"], !isDenoise);
   optSetOptionalProcessProperty(P, ["smoothing", "Smoothing"], isDenoise ? 0.0 : smoothing);
   optSetOptionalProcessProperty(P, ["correction", "Correction"], optGraXpertCorrectionTextFromDialog(dlg));
   optSetOptionalProcessProperty(P, ["createBackground", "showBackground", "generateBackground", "showModel"], !isDenoise);
   optSetOptionalProcessProperty(P, ["denoising", "denoise"], isDenoise);
   optSetOptionalProcessProperty(P, ["strength", "denoiseStrength"], isDenoise ? strength : 1.00);
   optSetOptionalProcessProperty(P, ["batchSize", "batch_size"], batchSize);
   optSetOptionalProcessProperty(P, ["disableGPU", "disableGpu", "useCPU"], disableGPU);
   optSetOptionalProcessProperty(P, ["replaceImage", "replaceTarget", "replace_target"], true);
   optSetOptionalProcessProperty(P, ["showLogs", "showLog"], showLogs);
   optSetOptionalProcessProperty(P, ["deconvolution"], false);
}

function optRunGraXpertProcessWorkflow(targetView, dlg) {
   optRequireLinearImage(targetView, "GRAXPERT");
   var gxProc = optCreateGraXpertProcessInstance();
   if (gxProc == null)
      throw new Error("[GRAXPERT/AVAILABILITY] GraXpert is installed as a process, but no valid process instance could be created.");
   optConfigureGraXpertNativeProcess(gxProc, "background", dlg);
   console.writeln("=> GraXpert native process: Background Extraction=" + gxProc.backgroundExtraction + ", correction=" + gxProc.correction + ", smoothing=" + gxProc.smoothing + ", createBackground=" + gxProc.createBackground + ".");
   var ok = gxProc.executeOn(targetView);
   if (ok === false)
      throw new Error("[GRAXPERT/EXECUTION] GraXpert returned false before completing the process.");
   return "GraXpert";
}

function optRunGraXpertDenoiseProcessWorkflow(targetView, dlg) {
   if (!optSafeView(targetView))
      throw new Error("[GRAXPERT/DENOISE/TARGET] There is no valid target view to execute GraXpert Denoise.");
   if (OPT_TEST_MODE)
      return optRunTestModePreviewTransform(targetView, "darken", 0.07);
   // GRAXPERT-DENOISE-DIRECT-BEGIN: prefer running GraXpert ourselves (Plan B),
   // the same robust path used for background correction (optRunGraXpertDirectly).
   // The native process below is only a fallback for builds that expose a compiled
   // GraXpert module. To revert to native-only, delete this marked block.
   try {
      return optRunGraXpertDenoiseDirectly(targetView, dlg);
   } catch (eDirect) {
      console.warningln("=> GraXpert Denoise direct run failed (" + eDirect.message + "); trying native process.");
   }
   // GRAXPERT-DENOISE-DIRECT-END
   var gxProc = optCreateGraXpertProcessInstance();
   if (gxProc == null)
      throw new Error("[GRAXPERT/DENOISE/AVAILABILITY] The native GraXpert process is not available. Add the DeepSkyForge GraXpert process repository and install the process from Process > Etc.");
   optConfigureGraXpertNativeProcess(gxProc, "denoise", dlg);
   console.writeln("=> GraXpert native process: Denoising=true, strength=" + gxProc.strength + ", batchSize=" + gxProc.batchSize + ", disableGPU=" + gxProc.disableGPU + ".");
   var ok = gxProc.executeOn(targetView);
   if (ok === false)
      throw new Error("[GRAXPERT/DENOISE/EXECUTION] GraXpert Denoise returned false before completing the process.");
   return targetView;
}

// Resolve the GraXpert executable, independent of GraXpertLib. Reads the path the
// user configured (GraXpertPath.txt in any platform config dir), then falls back
// to standard install locations. macOS .app bundles resolve to the inner binary.
function optResolveGraXpertExecutablePath() {
   var home = optUserHomeDirectory();
   var cands = [];
   var cfgDirs = [
      home + "/Library/Application Support/GraXpertScript",
      home + "/AppData/Local/GraXpertScript",
      home + "/.local/share/GraXpertScript"
   ];
   for (var i = 0; i < cfgDirs.length; ++i) {
      try {
         var f = cfgDirs[i] + "/GraXpertPath.txt";
         if (File.exists(f)) {
            var p = optNormalizePath(File.readTextFile(f)).replace(/^\s+|\s+$/g, "");
            if (p && p.length > 0)
               cands.push(p);
         }
      } catch (eR) {}
   }
   cands = cands.concat(optGraXpertExecutableCandidatePaths());
   for (var j = 0; j < cands.length; ++j) {
      var c = cands[j];
      if (!c || c.length === 0)
         continue;
      if (/\.app$/i.test(c)) {
         var bin = c + "/Contents/MacOS/GraXpert";
         try { if (File.exists(bin)) return bin; } catch (eB) {}
      }
      try { if (File.exists(c)) return c; } catch (eC) {}
   }
   return "";
}

// Run GraXpert directly via ExternalProcess (no GraXpertLib). Mirrors exactly what
// the GraXpert script does: write the view to a temp .xisf, call
// "<exe> -cli <file> -correction <C> -smoothing <S>", then read the produced
// "<file-without-ext>_GraXpert.xisf" back into the target view. Robust across
// platforms because it does not depend on the lib's macro/path resolution.
function optRunGraXpertDirectly(targetView, dlg) {
   var exe = optResolveGraXpertExecutablePath();
   if (!exe || exe.length === 0)
      throw new Error("[GRAXPERT/DIRECT] GraXpert executable not found. Configure it once in the GraXpert script (wrench icon) or install GraXpert.");
   var correction = "Subtraction";
   try { if (dlg && dlg.comboGraXpertCorrection && dlg.comboGraXpertCorrection.combo.currentItem === 1) correction = "Division"; } catch (e0) {}
   var smoothing = OPT_GRAXPERT_DEFAULT_SMOOTHING;
   try { smoothing = dlg.ncGraXpertSmoothing.value; } catch (e1) {}
   if (!isFinite(smoothing)) smoothing = OPT_GRAXPERT_DEFAULT_SMOOTHING;
   smoothing = Math.max(0, Math.min(1, smoothing));

   var base = optNormalizePath(File.systemTempDirectory) + "/" + optUniqueId("PIW_GraXpert");
   var inPath = base + "_Temp.xisf";
   var outPath = inPath.replace(/\.xisf$/i, "_GraXpert.xisf");
   var bgPath = inPath.replace(/\.xisf$/i, "_GraXpert_background.xisf");

   var src = targetView.image;
   var nch = src.numberOfChannels;
   var win = new ImageWindow(src.width, src.height, nch, 32, true, nch >= 3, optUniqueId("PIW_GX_in"));
   try {
      win.mainView.beginProcess(UndoFlag_NoSwapFile);
      win.mainView.image.assign(src);
      win.mainView.endProcess();
      if (!win.saveAs(inPath, false, false, true, false))
         throw new Error("[GRAXPERT/DIRECT] Could not write temp image: " + inPath);
   } finally {
      try { win.forceClose(); } catch (eW) {}
   }

   console.noteln("=> GraXpert (direct): \"" + exe + "\" -cli \"" + inPath + "\" -correction " + correction + " -smoothing " + smoothing);
   var proc = new ExternalProcess();
   proc.onStandardOutputDataAvailable = function() { var t = String(this.stdout); if (t && t.length > 0) console.writeln(t); };
   proc.onStandardErrorDataAvailable = function() { var t = String(this.stderr); if (t && t.length > 0) console.noteln(t); };
   var started = false;
   // -bg makes GraXpert also write the extracted background model, so the
   // "Show Gradient" toggle has a model to display (same UX as ABE/MGC).
   try { proc.start(exe, ["-cli", inPath, "-correction", correction, "-smoothing", String(smoothing), "-bg"]); started = true; } catch (eS) {}
   if (!started) {
      try { File.remove(inPath); } catch (e) {}
      throw new Error("[GRAXPERT/DIRECT] Could not start GraXpert: " + exe);
   }
   var t0 = new Date().getTime();
   var maxMs = 1200000; // 20 min ceiling for slow AI background extraction
   while (proc.isStarting || proc.isRunning) {
      if ((new Date().getTime() - t0) > maxMs) {
         try { optTerminateExternalProcess(proc); } catch (e) {}
         break;
      }
      optMsleep(100);
      optProcessEvents();
   }
   var exitCode = optExternalProcessExitCode(proc);
   optWaitForFile(outPath, 15000);
   if (!File.exists(outPath)) {
      try { File.remove(inPath); } catch (e) {}
      throw new Error("[GRAXPERT/DIRECT] GraXpert produced no output (" + outPath + "). Exit code: " + exitCode + ".");
   }
   var rwins = null;
   try { rwins = ImageWindow.open(outPath); } catch (eO) {}
   if (!rwins || rwins.length === 0) {
      try { File.remove(inPath); } catch (e) {}
      try { File.remove(outPath); } catch (e) {}
      throw new Error("[GRAXPERT/DIRECT] Could not open GraXpert result: " + outPath);
   }
   var rw = rwins[0];
   try {
      targetView.beginProcess(UndoFlag_NoSwapFile);
      targetView.image.assign(rw.mainView.image);
      targetView.endProcess();
   } finally {
      try { rw.forceClose(); } catch (eRW) {}
   }
   // Open the background model (if produced) as a new window whose id contains
   // "background", so optExecuteGradientCorrectionForView picks it up as the
   // gradient model (gradientView) and the "Show Gradient" toggle works.
   try {
      if (File.exists(bgPath)) {
         var bgWins = ImageWindow.open(bgPath, optUniqueId("GraXpert_Background"));
         if (bgWins && bgWins.length > 0) {
            try { bgWins[0].mainView.id = optUniqueId("GraXpert_Background"); } catch (eId) {}
         }
      }
   } catch (eBG) {}
   try { File.remove(inPath); } catch (e) {}
   try { File.remove(outPath); } catch (e) {}
   try { File.remove(bgPath); } catch (e) {}
   console.noteln("=> GraXpert (direct): done.");
   return "GraXpert";
}

// GRAXPERT-DENOISE-DIRECT-FN-BEGIN
// Run GraXpert Denoise directly via ExternalProcess (no GraXpertLib, no native
// process module). Mirrors optRunGraXpertDirectly but uses GraXpert's modern
// denoising subcommand:
//   "<exe>" -cli -cmd denoising -strength <0..1> -batch_size <N> "<file>"
// (command verified against the DeepSkyForge GraXpertDenoise.js the user installed).
// Reads the produced "<file-without-ext>_GraXpert.xisf" back into the target view.
// Denoising emits no background model, so there is no "Show Gradient" wiring here.
function optRunGraXpertDenoiseDirectly(targetView, dlg) {
   var exe = optResolveGraXpertExecutablePath();
   if (!exe || exe.length === 0)
      throw new Error("[GRAXPERT/DENOISE/DIRECT] GraXpert executable not found. Configure it once in the GraXpert script (wrench icon) or install GraXpert.");

   // GraXpert's denoising CLI strength is in [0,1]. The UI slider is 0..2 (shared
   // with the native-process path), so clamp to the CLI's valid range.
   var strength = 1.0;
   try { strength = dlg.ncPostGraXpertStrength.value; } catch (e1) {}
   if (!isFinite(strength)) strength = 1.0;
   strength = Math.max(0, Math.min(1, strength));

   var batchSize = 4;
   try { batchSize = Math.round(dlg.ncPostGraXpertBatchSize.value); } catch (e2) {}
   if (!isFinite(batchSize) || batchSize < 1) batchSize = 4;
   batchSize = Math.max(1, Math.min(16, batchSize));

   var base = optNormalizePath(File.systemTempDirectory) + "/" + optUniqueId("PIW_GraXpertNR");
   var inPath = base + "_Temp.xisf";
   var outPath = inPath.replace(/\.xisf$/i, "_GraXpert.xisf");

   var src = targetView.image;
   var nch = src.numberOfChannels;
   var win = new ImageWindow(src.width, src.height, nch, 32, true, nch >= 3, optUniqueId("PIW_GXNR_in"));
   try {
      win.mainView.beginProcess(UndoFlag_NoSwapFile);
      win.mainView.image.assign(src);
      win.mainView.endProcess();
      if (!win.saveAs(inPath, false, false, true, false))
         throw new Error("[GRAXPERT/DENOISE/DIRECT] Could not write temp image: " + inPath);
   } finally {
      try { win.forceClose(); } catch (eW) {}
   }

   console.noteln("=> GraXpert Denoise (direct): \"" + exe + "\" -cli -cmd denoising -strength " + strength + " -batch_size " + batchSize);
   var proc = new ExternalProcess();
   proc.onStandardOutputDataAvailable = function() { var t = String(this.stdout); if (t && t.length > 0) console.writeln(t); };
   proc.onStandardErrorDataAvailable = function() { var t = String(this.stderr); if (t && t.length > 0) console.noteln(t); };
   var started = false;
   try { proc.start(exe, ["-cli", "-cmd", "denoising", "-strength", String(strength), "-batch_size", String(batchSize), inPath]); started = true; } catch (eS) {}
   if (!started) {
      try { File.remove(inPath); } catch (e) {}
      throw new Error("[GRAXPERT/DENOISE/DIRECT] Could not start GraXpert: " + exe);
   }
   var t0 = new Date().getTime();
   var maxMs = 1200000; // 20 min ceiling for slow AI denoising
   while (proc.isStarting || proc.isRunning) {
      if ((new Date().getTime() - t0) > maxMs) {
         try { optTerminateExternalProcess(proc); } catch (e) {}
         break;
      }
      optMsleep(100);
      optProcessEvents();
   }
   var exitCode = optExternalProcessExitCode(proc);
   optWaitForFile(outPath, 15000);
   if (!File.exists(outPath)) {
      try { File.remove(inPath); } catch (e) {}
      throw new Error("[GRAXPERT/DENOISE/DIRECT] GraXpert produced no output (" + outPath + "). Exit code: " + exitCode + ".");
   }
   var rwins = null;
   try { rwins = ImageWindow.open(outPath); } catch (eO) {}
   if (!rwins || rwins.length === 0) {
      try { File.remove(inPath); } catch (e) {}
      try { File.remove(outPath); } catch (e) {}
      throw new Error("[GRAXPERT/DENOISE/DIRECT] Could not open GraXpert result: " + outPath);
   }
   var rw = rwins[0];
   try {
      targetView.beginProcess(UndoFlag_NoSwapFile);
      targetView.image.assign(rw.mainView.image);
      targetView.endProcess();
   } finally {
      try { rw.forceClose(); } catch (eRW) {}
   }
   try { File.remove(inPath); } catch (e) {}
   try { File.remove(outPath); } catch (e) {}
   console.noteln("=> GraXpert Denoise (direct): done.");
   return targetView;
}
// GRAXPERT-DENOISE-DIRECT-FN-END

function optRunGraXpertWorkflow(targetView, dlg) {
   if (!optSafeView(targetView))
      throw new Error("[GRAXPERT/TARGET] There is no valid target view to execute GraXpert.");
   optRequireLinearImage(targetView, "GRAXPERT");
   if (OPT_TEST_MODE) {
      optRunTestModePreviewTransform(targetView, "contrast", 0.13);
      return "GraXpert";
   }
   optEnsureGraXpertScriptConfig();
   var gxMode = optGraXpertSupportMode();
   if (gxMode === "process")
      return optRunGraXpertProcessWorkflow(targetView, dlg);
   if (gxMode !== "script")
      throw new Error("[GRAXPERT/AVAILABILITY] GraXpert is not available in this PixInsight runtime. If it is installed, this session could not load GraXpertLib and no GraXpert process was found.");
   // Primary path: run GraXpert ourselves (robust; bypasses GraXpertLib's fragile
   // platform/path resolution). Fall back to the legacy lib only if this fails.
   try {
      return optRunGraXpertDirectly(targetView, dlg);
   } catch (eDirect) {
      console.warningln("=> GraXpert direct run failed (" + eDirect.message + "); falling back to legacy GraXpertLib.");
   }
   optEnsureGraXpertPathFile();
   var gxp = new GraXpertLib();
   if (typeof gxp.readGraXpertParameters === "function")
      gxp.readGraXpertParameters();
   if (typeof gxp.hasGraXpertPath === "function" && !gxp.hasGraXpertPath()) {
      var configNames = optGraXpertConfigNameCandidates();
      for (var cfgIdx = 0; cfgIdx < configNames.length; ++cfgIdx) {
         var cfgName = configNames[cfgIdx];
         if (!cfgName || cfgName.length < 1)
            continue;
         try { GRAXPERT_SCRIPT_CONFIG = cfgName; } catch (eCfg0) {}
         try {
            if (optReloadGraXpertLibWithConfigName(cfgName))
               gxp = new GraXpertLib();
         } catch (eCfgReload) {
         }
         try {
            if (typeof gxp.readGraXpertParameters === "function")
               gxp.readGraXpertParameters();
         } catch (eCfg1) {
         }
         try {
            if (typeof gxp.hasGraXpertPath === "function" && gxp.hasGraXpertPath())
               break;
         } catch (eCfg2) {
         }
      }
   }
   if (typeof gxp.hasGraXpertPath === "function" && !gxp.hasGraXpertPath())
      optConfigureGraXpertExecutablePath(gxp);
   var hasPath = true;
   try {
      if (typeof gxp.hasGraXpertPath === "function")
         hasPath = gxp.hasGraXpertPath();
      else
         hasPath = optHasConfiguredGraXpertExecutablePath(gxp);
   } catch (ePath0) {
      hasPath = optHasConfiguredGraXpertExecutablePath(gxp);
   }
   if (!hasPath && optHasConfiguredGraXpertExecutablePath(gxp))
      hasPath = true;
   if (!hasPath) {
      var gxProcFallback = optCreateGraXpertProcessInstance();
      if (gxProcFallback != null)
         return optRunGraXpertProcessWorkflow(targetView, dlg);
      throw new Error("[GRAXPERT/PATH] GraXpertLib is loaded but has no executable path. Configure it with the GraXpert Toolbox wrench once, or place GraXpert in a standard executable path such as C:/Program Files/GraXpert/GraXpert.exe.");
   }
   if (!gxp.graxpertParameters)
      throw new Error("[GRAXPERT/PARAMETERS] GraXpertLib does not expose the graxpertParameters object.");
   var correction = OPT_GRAXPERT_DEFAULT_CORRECTION;
   try { correction = dlg.comboGraXpertCorrection.combo.currentItem; } catch (e0) {}
   correction = (correction === 1) ? 1 : 0;
   var smoothing = OPT_GRAXPERT_DEFAULT_SMOOTHING;
   try { smoothing = dlg.ncGraXpertSmoothing.value; } catch (e1) {}
   if (!isFinite(smoothing))
      smoothing = OPT_GRAXPERT_DEFAULT_SMOOTHING;
   smoothing = Math.max(0, Math.min(1, smoothing));
   var isMono = (targetView.image.numberOfChannels < 3);
   var workView = targetView;
   var gxTempWin = null;
   if (isMono) {
      var monoImg = targetView.image;
      var gxW = monoImg.width, gxH = monoImg.height;
      gxTempWin = new ImageWindow(gxW, gxH, 3, 32, true, true, optUniqueId("GraXpert_RGB_Tmp"));
      var tmpImg = new Image(gxW, gxH, 3, ColorSpace_RGB, 32, SampleType_Real);
      try {
         monoImg.selectedChannel = 0;
         for (var c = 0; c < 3; ++c) {
            tmpImg.selectedChannel = c;
            tmpImg.apply(monoImg, ImageOp_Mov);
         }
         monoImg.resetSelections();
         tmpImg.resetSelections();
         gxTempWin.mainView.beginProcess(UndoFlag_NoSwapFile);
         gxTempWin.mainView.image.assign(tmpImg);
         gxTempWin.mainView.endProcess();
      } finally {
         try { tmpImg.free(); } catch (ef) {}
      }
      workView = gxTempWin.mainView;
      try { gxTempWin.hide(); } catch (eh) {}
   }
   gxp.graxpertParameters.targetView = workView;
   gxp.graxpertParameters.correction = correction;
   gxp.graxpertParameters.smoothing = smoothing;
   gxp.graxpertParameters.showBackground = true;
   gxp.graxpertParameters.replaceTarget = true;
   if (typeof gxp.storeGraXpertParameters === "function")
      gxp.storeGraXpertParameters();
   var ok = gxp.process();
   if (ok === false)
      throw new Error("[GRAXPERT/EXECUTION] GraXpert returned false before completing the process.");
   if (isMono) {
      var corrImg = new Image(gxW, gxH, 1, ColorSpace_Gray, 32, SampleType_Real);
      try {
         workView.image.selectedChannel = 0;
         corrImg.selectedChannel = 0;
         corrImg.apply(workView.image, ImageOp_Mov);
         workView.image.resetSelections();
         corrImg.resetSelections();
         targetView.beginProcess(UndoFlag_NoSwapFile);
         targetView.image.assign(corrImg);
         targetView.endProcess();
      } finally {
         try { corrImg.free(); } catch (_) {}
         try { gxTempWin.forceClose(); } catch (_) {}
      }
   }
   return "GraXpert";
}

function optExecuteGradientCorrectionForView(targetView, dlg) {
   if (!optSafeView(targetView))
      throw new Error("There is no valid target view for Gradient Correction.");
   var windowsBefore = ImageWindow.windows;
   var gradMode = "";
   var continueView = null;
   var bkgView = null;
   var idx = dlg.comboPreGradient ? optComboCanonicalItem(dlg.comboPreGradient) : 0;

   if (idx === 0) {
      var mgcResult = optRunMGCCompatibleWorkflow(targetView, dlg);
      gradMode = mgcResult.mode;
      continueView = mgcResult.continueView;
      bkgView = mgcResult.bkgView;
      return {
         view: continueView || targetView,
         gradientView: bkgView,
         meta: { algorithm: "MGC", signature: optMemoryJoinSignature([dlg.comboMgcScale.combo, dlg.comboMgcSep.combo, dlg.ncMgcSmoothness, dlg.ncMgcScaleR, dlg.ncMgcScaleG, dlg.ncMgcScaleB]), gradient: true }
      };
   }
   if (idx === 1) {
      var params = { descentPathsInput: dlg.ncAdbePaths.value, tolerance: dlg.ncAdbeTol.value, smoothing: dlg.ncAdbeSmooth.value, showModel: true };
      optRunAutoDBEGradientCorrection(targetView, params);
      gradMode = "AutoDBE";
   } else if (idx === 2) {
      var abeResult = optExecuteABEWorkflow(targetView, dlg);
      gradMode = abeResult.mode || "ABE";
      continueView = abeResult.continueView || targetView;
      bkgView = abeResult.bkgView || null;
      return {
         view: continueView,
         gradientView: bkgView,
         meta: { algorithm: "ABE", signature: optMemoryJoinSignature([dlg.comboAbeCorrection.combo, dlg.ncAbeFunctionDegree, dlg.chkAbeNormalize]), gradient: true }
      };
   } else {
      gradMode = optRunGraXpertWorkflow(targetView, dlg);
   }

   var activeMainViewAfterGrad = null;
   try {
      var activeWin = ImageWindow.activeWindow;
      if (activeWin && !activeWin.isNull && activeWin.mainView && !activeWin.mainView.isNull)
         activeMainViewAfterGrad = activeWin.mainView;
   } catch (e0) {}

   var windowsAfter = ImageWindow.windows;
   var newWindows = [];
   for (var i = 0; i < windowsAfter.length; ++i) {
      var found = false;
      for (var j = 0; j < windowsBefore.length; ++j)
         if (windowsAfter[i].mainView.id === windowsBefore[j].mainView.id) {
            found = true;
            break;
         }
      if (!found)
         newWindows.push(windowsAfter[i]);
   }
   var correctedWin = null;
   var bkgWin = null;
   for (var k = 0; k < newWindows.length; ++k) {
      var wId = newWindows[k].mainView.id.toLowerCase();
      if (optIsBackgroundResidualViewId(wId)) {
         bkgWin = newWindows[k];
         try { bkgWin.hide(); } catch (e1) {}
      } else {
         correctedWin = newWindows[k];
         try { correctedWin.hide(); } catch (e2) {}
      }
   }
   if (!correctedWin)
      correctedWin = targetView.window;
   if (optSafeView(activeMainViewAfterGrad) &&
       !optIsBackgroundResidualViewId(activeMainViewAfterGrad.id) &&
       (optWindowArrayContainsView(newWindows, activeMainViewAfterGrad) || activeMainViewAfterGrad.id === targetView.id))
      continueView = activeMainViewAfterGrad;
   else if (correctedWin && correctedWin.mainView && !correctedWin.mainView.isNull)
      continueView = correctedWin.mainView;
   else
      continueView = targetView;
   return {
      view: continueView,
      gradientView: bkgWin && bkgWin.mainView && !bkgWin.mainView.isNull ? bkgWin.mainView : null,
      meta: {
         algorithm: gradMode === "AutoDBE" ? "ADBE" : "GX",
         signature: gradMode === "AutoDBE" ?
            optMemoryJoinSignature([dlg.ncAdbePaths, dlg.ncAdbeTol, dlg.ncAdbeSmooth]) :
            optMemoryJoinSignature([dlg.comboGraXpertCorrection.combo, dlg.ncGraXpertSmoothing]),
         gradient: true
      }
   };
}

function optCreateBlurXTerminatorProcessInstance() {
   if (typeof BlurXTerminator === "undefined")
      throw new Error("BlurXTerminator is not installed or not available in this PixInsight build.");
   var bxt = null;
   try {
      bxt = ProcessInstance.fromIcon("BXT");
      if (bxt != null && !bxt.isNull && typeof bxt.processId === "function" && bxt.processId() === "BlurXTerminator")
         return { process: bxt, usingIcon: true };
   } catch (e0) {}
   return { process: new BlurXTerminator(), usingIcon: false };
}

function optBuildPreBlurXConfigFromControls(dlg) {
   return {
      sharpen_stars: dlg.ncBxtStars.value,
      adjust_star_halos: dlg.ncBxtAdjustStarHalos.value,
      sharpen_nonstellar: dlg.ncBxtSharpenNonstellar.value,
      automatic_psf: dlg.chkBxtAutoPSF.checked === true,
      psf_diameter: dlg.ncBxtPSFDiameter.value,
      correct_only: dlg.chkBxtCorrectOnly.checked === true,
      correct_first: false,
      nonstellar_then_stellar: false,
      luminance_only: dlg.chkBxtLuminanceOnly.checked === true
   };
}

