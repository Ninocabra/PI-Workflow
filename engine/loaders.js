function optEnsureGraXpertScriptConfig() {
   var detectedName = "Graxpert";
   try { detectedName = optDetectGraXpertScriptConfigName(); } catch (e00) {}
   try {
      if (typeof GRAXPERT_SCRIPT_CONFIG === "undefined" || !GRAXPERT_SCRIPT_CONFIG)
         GRAXPERT_SCRIPT_CONFIG = detectedName;
   } catch (e0) {
   }
}

optEnsureGraXpertScriptConfig();

// Some AdP/ImageSolver builds expect this UI placeholder when invoked from another script.
if (typeof fieldLabel === "undefined" || fieldLabel === undefined)
   var fieldLabel = { text: "", visible: false, adjustToContents: function(){}, setFixedWidth: function(){}, toolTip: "" };

function optHasAdpSolverRuntime() {
// V8-ADP-RUNTIME-GUARD-BEGIN
   // V8 astrometry (ImageSolver 6.4.1+): the engine class is ImageSolver and the
   // metadata class is AstrometricMetadata (replaces the legacy ImageMetadata).
   return (typeof ImageSolver === "function") &&
          (typeof AstrometricMetadata === "function");
// V8-ADP-RUNTIME-GUARD-END
}

function optNormalizePath(path) {
   var text = "";
   try { text = String(path || ""); } catch (e0) { text = ""; }
   return text.replace(/\\/g, "/");
}

function optDirName(path) {
   var normalized = optNormalizePath(path);
   var slash = normalized.lastIndexOf("/");
   return slash >= 0 ? normalized.substring(0, slash) : "";
}

function optRunningPixInsightInstallRoots() {
   var roots = [
      "",
      ".",
      "..",
      "C:/Program Files/PixInsight",
      "C:/Program Files/PixInsight/include",
      "C:/Program Files/PixInsight2",
      "C:/Program Files/PixInsight2/include",
      "C:/Program Files/PixInsight 2",
      "C:/Program Files/PixInsight 2/include",
      "/Applications/PixInsight",
      "/Applications/PixInsight/PixInsight.app/Contents",
      "/Applications/PixInsight/include",
      "/opt/PixInsight",
      "/opt/PixInsight/include",
      "/usr/local/PixInsight",
      "/usr/local/PixInsight/include"
   ];
   var props = ["installationDirectory", "applicationDirectory", "binDirectory", "coreDirectory", "srcDirectory"];
   for (var i = 0; i < props.length; ++i) {
      try {
         var value = CoreApplication[props[i]];
         if (value && typeof value === "string" && value.length > 0) {
            var p = optNormalizePath(value);
            roots.push(p);
            roots.push(optDirName(p));
            roots.push(optDirName(optDirName(p)));
         }
      } catch (e0) {
      }
   }
   var seen = {};
   var out = [];
   for (var j = 0; j < roots.length; ++j) {
      var root = optNormalizePath(roots[j]);
      if (!optHasOwn(seen, root)) {
         seen[root] = true;
         out.push(root);
      }
   }
   return out;
}

function optJoinInstallPath(root, relativePath) {
   if (!root || root.length === 0 || root === ".")
      return relativePath;
   return root + "/" + relativePath;
}

function optBuildRunningInstallScriptCandidates(relativePaths) {
   var out = [];
   var roots = optRunningPixInsightInstallRoots();
   var seen = {};
   for (var r = 0; r < roots.length; ++r) {
      for (var i = 0; i < relativePaths.length; ++i) {
         var rel = relativePaths[i];
         var path = optJoinInstallPath(roots[r], rel);
         if (!seen[path]) {
            seen[path] = true;
            out.push(path);
         }
      }
   }
   return out;
}

function optFindFirstExistingCandidatePath(candidatePaths) {
   for (var i = 0; i < candidatePaths.length; ++i)
      try {
         if (File.exists(candidatePaths[i]))
            return candidatePaths[i];
      } catch (e0) {
      }
   return "";
}

// STARX-AIFILE-RESOLVER-BEGIN (v138)
// Discover the StarXTerminator AI model installed in the running PixInsight.
// Models live in "<install>/library/" and SXT resolves a bare filename there.
// The model format is PLATFORM-SPECIFIC:
//   - macOS: CoreML "StarX*terminator.<N>.mlpackage" (a directory/bundle)
//   - Windows/Linux: TensorFlow "StarX*terminator.<N>.pb" (a file)
// To stay robust as new model databases ship (new versions, casing or naming
// tweaks), we ENUMERATE the library directory and pick the highest-versioned
// "StarX*" model carrying the platform's extension. If directory enumeration is
// unavailable in this runtime, we fall back to a numeric-version probe. Returns
// the bare filename (SXT resolves it against library/), or "" if none found.
// Replaces the old hardcoded "StarXTerminator.11.pb".

// Rank a model filename by its highest embedded version number (e.g.
// "StarXterminator.11.mlpackage" -> 11, "StarXTerminator.12.1.pb" -> 12.1).
// Unversioned names rank 0 so any versioned model is preferred.
function optStarXModelVersionRank(name) {
   var nums = String(name).match(/\d+(?:\.\d+)?/g);
   if (!nums || nums.length === 0)
      return 0;
   var best = 0;
   for (var i = 0; i < nums.length; ++i) {
      var n = parseFloat(nums[i]);
      if (isFinite(n) && n > best)
         best = n;
   }
   return best;
}

// Enumerate "<dir>" for "StarX*.<ext>" entries via FileFind. Returns an array of
// bare names (possibly empty), or null if FileFind is unavailable/throws so the
// caller can fall back to a probe.
function optEnumerateStarXModelsInDir(dir, ext) {
   var matches = [];
   try {
      var re = new RegExp("^starx.*\\." + ext + "$", "i");
      var ff = new FileFind();
      if (ff.begin(dir + "/*")) {
         do {
            var nm = ff.name;
            if (nm && nm !== "." && nm !== ".." && re.test(nm))
               matches.push(nm);
         } while (ff.next());
      }
      try { ff.end(); } catch (eE) {}
   } catch (e0) {
      return null;
   }
   return matches;
}

function optResolveStarXTerminatorAiFile() {
   var isMac = (optDetectPlatformToken() === "MACOSX");
   var ext = isMac ? "mlpackage" : "pb";
   var roots = optRunningPixInsightInstallRoots();
   for (var r = 0; r < roots.length; ++r) {
      var libDir = optNormalizePath(optJoinInstallPath(roots[r], "library"));
      try { if (!File.directoryExists(libDir)) continue; } catch (eD) { continue; }

      // Preferred: enumerate the directory, pick the highest-version model.
      var found = optEnumerateStarXModelsInDir(libDir, ext);
      if (found && found.length > 0) {
         var best = "";
         var bestRank = -1;
         for (var i = 0; i < found.length; ++i) {
            var rank = optStarXModelVersionRank(found[i]);
            if (rank > bestRank) {
               bestRank = rank;
               best = found[i];
            }
         }
         if (best.length > 0)
            return best;
      }

      // Fallback (FileFind unavailable): probe known name patterns by version.
      if (found === null) {
         var bases = ["StarXTerminator", "StarXterminator"]; // casing varies
         for (var v = 40; v >= 1; --v) {
            for (var b = 0; b < bases.length; ++b) {
               var name = bases[b] + "." + v + "." + ext;
               var full = libDir + "/" + name;
               try {
                  // .mlpackage is a bundle directory, .pb is a regular file.
                  if (isMac ? File.directoryExists(full) : File.exists(full))
                     return name;
               } catch (e1) {}
            }
         }
      }
   }
   return "";
}
// STARX-AIFILE-RESOLVER-END

function optResolveOptionalIncludePath(currentPath, includeSpec) {
   var spec = optNormalizePath(includeSpec);
   if (!spec || spec.length === 0)
      return "";
   var isWindowsAbsolute =
      spec.length >= 3 &&
      ((spec.charCodeAt(0) >= 65 && spec.charCodeAt(0) <= 90) || (spec.charCodeAt(0) >= 97 && spec.charCodeAt(0) <= 122)) &&
      spec.charAt(1) === ":" &&
      spec.charAt(2) === "/";
   if (isWindowsAbsolute || spec.indexOf("/") === 0)
      return File.exists(spec) ? spec : "";
   var currentDir = optDirName(currentPath);
   var candidates = [];
   if (currentDir.length > 0)
      candidates.push(optNormalizePath(currentDir + "/" + spec));
   var roots = optRunningPixInsightInstallRoots();
   for (var i = 0; i < roots.length; ++i)
      candidates.push(optJoinInstallPath(roots[i], spec));
   return optFindFirstExistingCandidatePath(candidates);
}

function optExpandOptionalScriptIncludes(path, visited) {
   var normalizedPath = optNormalizePath(path);
   if (!normalizedPath || normalizedPath.length === 0)
      return "";
   if (!visited)
      visited = {};
   if (optHasOwn(visited, normalizedPath) && visited[normalizedPath] === true)
      return "";
   visited[normalizedPath] = true;
   var lines = File.readLines(normalizedPath);
   var out = [];
   for (var i = 0; i < lines.length; ++i) {
      var line = lines[i];
      var includeMatch = line.match(/^\s*#include\s+[<"]([^>"]+)[>"]\s*$/);
      if (includeMatch) {
         var resolved = optResolveOptionalIncludePath(normalizedPath, includeMatch[1]);
         if (resolved && resolved.length > 0)
            out.push(optExpandOptionalScriptIncludes(resolved, visited));
         continue;
      }
      out.push(line);
   }
   return out.join("\n");
}

function optEscapeRegExp(text) {
   return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function optJsStringLiteral(text) {
   return "\"" + String(text || "").replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\r/g, "\\r").replace(/\n/g, "\\n") + "\"";
}

function optOptionalScriptMacros(path, predefinedMacros) {
   var macros = {};
   if (predefinedMacros) {
      for (var k in predefinedMacros)
         if (Object.prototype.hasOwnProperty.call(predefinedMacros, k))
            macros[k] = predefinedMacros[k];
   }
   var dirLiteral = optJsStringLiteral(optDirName(path));
   if (!Object.prototype.hasOwnProperty.call(macros, "GRAXPERT_SCRIPT_DIR"))
      macros.GRAXPERT_SCRIPT_DIR = dirLiteral;
   if (!Object.prototype.hasOwnProperty.call(macros, "GRAXPERT_SCRPT_DIR"))
      macros.GRAXPERT_SCRPT_DIR = dirLiteral;
   return macros;
}

function optOptionalScriptPreamble(path) {
   var dirLiteral = optJsStringLiteral(optDirName(path));
   // PJSR #define constants are resolved at compile time and are NOT available
   // as JS variables in eval'd scripts. pjsr include files live in
   // C:/Program Files/PixInsight/include/pjsr/ which optExpandOptionalScriptIncludes
   // does not reach. Declare them here with canonical values so external
   // scripts (GraXpertLib, AutoDBE.js) can use them without ReferenceErrors.
   // Values verified against PixInsight include/pjsr/ColorSpace+SampleType+StdIcon+StdButton.jsh 2025-02-19.
   var pjsrConstants =
      "var StdIcon_NoIcon=0,StdIcon_Question=1,StdIcon_Information=2," +
      "StdIcon_Warning=3,StdIcon_Error=4;\n" +
      "var StdButton_NoButton=0,StdButton_Ok=1,StdButton_Cancel=2," +
      "StdButton_Yes=3,StdButton_No=4,StdButton_Abort=5," +
      "StdButton_Retry=6,StdButton_Ignore=7," +
      "StdButton_YesToAll=8,StdButton_NoToAll=9;\n" +
      "var ColorSpace_Unknown=-1,ColorSpace_Gray=0,ColorSpace_RGB=1," +
      "ColorSpace_CIEXYZ=2,ColorSpace_CIELab=3,ColorSpace_CIELch=4," +
      "ColorSpace_HSV=5,ColorSpace_HSI=6;\n" +
      "var SampleType_Integer=0,SampleType_Real=1,SampleType_Complex=2;\n";
   return "var GRAXPERT_SCRIPT_DIR = " + dirLiteral + ";\n" +
          "var GRAXPERT_SCRPT_DIR = " + dirLiteral + ";\n" +
          pjsrConstants;
}

function optPjsrPreprocessorLineContinues(line) {
   var text = String(line || "");
   text = text.replace(/\s*\/\/.*$/, "");
   return /\\\s*$/.test(text);
}

// Detect the running platform as the token PixInsight's preprocessor uses for
// __PI_PLATFORM__ (MACOSX / MSWINDOWS / LINUX). Derived from the home directory
// because CoreApplication dir properties are undefined under the V8 runtime.
function optDetectPlatformToken() {
   // Robust filesystem signals first (independent of File.homeDirectory, which
   // can be empty/unexpected in some runtime contexts). /System/Library exists
   // only on macOS; C:/Windows only on Windows.
   try { if (File.directoryExists("/System/Library") || File.directoryExists("/Applications")) return "MACOSX"; } catch (eM) {}
   try { if (File.directoryExists("C:/Windows") || File.directoryExists("C:/Program Files")) return "MSWINDOWS"; } catch (eW) {}
   // Fallback: parse the home directory.
   var home = "";
   try { home = String(File.homeDirectory || ""); } catch (e0) { home = ""; }
   home = home.replace(/\\/g, "/");
   if (/^[A-Za-z]:/.test(home) || home.indexOf("/AppData/") >= 0)
      return "MSWINDOWS";
   if (home.indexOf("/Users/") === 0 || home.indexOf("/Library/") >= 0)
      return "MACOSX";
   return "LINUX";
}

function optPreprocessOptionalScriptText(text, predefinedMacros) {
   var macros = {};
   if (predefinedMacros) {
      for (var k in predefinedMacros)
         if (Object.prototype.hasOwnProperty.call(predefinedMacros, k))
            macros[k] = predefinedMacros[k];
   }
   var lines = String(text || "").replace(/^\uFEFF/, "").split(/\r\n|\n|\r/);
   var body = [];
   var skipPreprocessorContinuation = false;
   // Conditional stack. Only `#ifeq/#ifneq __PI_PLATFORM__ <PLAT>` are evaluated
   // (so platform-specific blocks resolve correctly \u2014 e.g. GraXpertLib's config
   // directory). Every other #if-family directive keeps the legacy behaviour of
   // emitting the content of both branches, so non-platform conditionals are
   // unaffected. Each entry: { active, evaluated, taken }.
   var cond = [];
   var plat = optDetectPlatformToken();
   function optCondActiveBelow(n) {
      for (var c = 0; c < n; ++c)
         if (!cond[c].active) return false;
      return true;
   }
   for (var i = 0; i < lines.length; ++i) {
      var line = lines[i];
      if (skipPreprocessorContinuation) {
         skipPreprocessorContinuation = optPjsrPreprocessorLineContinues(line);
         continue;
      }
      var mPlat = line.match(/^\s*#(ifeq|ifneq)\s+__PI_PLATFORM__\s+([A-Za-z0-9_]+)\s*$/);
      if (mPlat) {
         var parentActive = optCondActiveBelow(cond.length);
         var matches = (mPlat[2] === plat);
         var taken = (mPlat[1] === "ifeq") ? matches : !matches;
         cond.push({ active: parentActive && taken, evaluated: true, taken: taken });
         continue;
      }
      if (/^\s*#(if|ifdef|ifndef|ifeq|ifneq|ifgteq|ifgt|iflt|iflteq)\b/.test(line)) {
         // Non-platform conditional: keep both branches (legacy behaviour).
         cond.push({ active: optCondActiveBelow(cond.length), evaluated: false, taken: false });
         continue;
      }
      if (/^\s*#else\b/.test(line)) {
         if (cond.length > 0) {
            var top = cond[cond.length - 1];
            var parent = optCondActiveBelow(cond.length - 1);
            top.active = top.evaluated ? (parent && !top.taken) : parent;
         }
         continue;
      }
      if (/^\s*#endif\b/.test(line)) {
         if (cond.length > 0) cond.pop();
         continue;
      }
      var activeNow = optCondActiveBelow(cond.length);
      var m = line.match(/^\s*#define\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+(.+?))?\s*$/);
      if (m) {
         skipPreprocessorContinuation = optPjsrPreprocessorLineContinues(line);
         if (skipPreprocessorContinuation)
            continue;
         var value = (m[2] !== undefined) ? m[2] : "true";
         value = value.replace(/\s*\/\/.*$/, "");
         value = value.replace(/\s*\/\*.*?\*\/\s*$/, "");
         if (activeNow && value.length > 0)
            macros[m[1]] = value;
         continue;
      }
      m = line.match(/^\s*#undef\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/);
      if (m) {
         if (activeNow) delete macros[m[1]];
         continue;
      }
      if (/^\s*#/.test(line)) {
         skipPreprocessorContinuation = optPjsrPreprocessorLineContinues(line);
         continue;
      }
      if (activeNow)
         body.push(line);
   }
   var out = body.join("\n");
   for (var name in macros) {
      if (!Object.prototype.hasOwnProperty.call(macros, name))
         continue;
      var macroValue = macros[name];
      if (!macroValue || macroValue.length === 0)
         continue;
      out = out.replace(new RegExp("\\b" + optEscapeRegExp(name) + "\\b", "g"), macroValue);
   }
   return out;
}

function optTryLoadOptionalScript(stateKey, candidatePaths, successPredicate, quiet, predefinedMacros, textTransform) {
   if (optHasOwn(OPT_OPTIONAL_SCRIPT_LOAD_STATE, stateKey) && OPT_OPTIONAL_SCRIPT_LOAD_STATE[stateKey] === true)
      return true;
   if (typeof successPredicate === "function" && successPredicate()) {
      OPT_OPTIONAL_SCRIPT_LOAD_STATE[stateKey] = true;
      return true;
   }
   for (var i = 0; i < candidatePaths.length; ++i) {
      var path = candidatePaths[i];
      try {
         if (!File.exists(path))
            continue;
         var text = optExpandOptionalScriptIncludes(path, {});
         if (!text || text.length === 0)
            continue;
         text = optPreprocessOptionalScriptText(text, optOptionalScriptMacros(path, predefinedMacros));
         if (typeof textTransform === "function")
            text = textTransform(text, path);
         text = optOptionalScriptPreamble(path) + text;
         (1, eval)(text);
         if (typeof successPredicate === "function" && successPredicate()) {
            OPT_OPTIONAL_SCRIPT_LOAD_STATE[stateKey] = true;
            if (quiet !== true)
               console.writeln("=> Optional script loaded: " + path);
            return true;
         }
      } catch (e) {
         if (quiet !== true)
            console.warningln("=> Optional script load failed [" + stateKey + "] from " + path + ": " + e.message);
      }
   }
   return false;
}

function optAutoDBECandidatePaths() {
   return optBuildRunningInstallScriptCandidates([
      "../src/scripts/AutoDBE.js",
      "../src/scripts/AutoDBE/AutoDBE.js",
      "../src/scripts/Toolbox/AutoDBE.js",
      "../src/scripts/Toolbox/AutoDBE/AutoDBE.js",
      "../src/scripts/SetiAstro/AutoDBE.js",
      "../src/scripts/SetiAstro/AutoDBE/AutoDBE.js",
      "src/scripts/AutoDBE.js",
      "src/scripts/AutoDBE/AutoDBE.js",
      "src/scripts/Toolbox/AutoDBE.js",
      "src/scripts/Toolbox/AutoDBE/AutoDBE.js",
      "src/scripts/SetiAstro/AutoDBE.js",
      "src/scripts/SetiAstro/AutoDBE/AutoDBE.js"
   ]);
}

// Resolve the absolute path of the installed SetiAstro AutoDBE.js, or "" if not
// found. Used both for availability (button enable) and to run it as a Script
// process (see optRunAutoDBEGradientCorrection).
function optResolveAutoDBEScriptPath() {
   return optFindFirstExistingCandidatePath(optAutoDBECandidatePaths());
}

// PRISM-INTEGRATION-BEGIN
function optSyQonPrismScriptCandidates() {
   return optBuildRunningInstallScriptCandidates([
      "../src/scripts/SyQon_Prism.js",
      "../src/scripts/SyQon/SyQon_Prism.js",
      "../src/scripts/SetiAstro/SyQon_Prism.js",
      "../src/scripts/SyQonPrism.js",
      "src/scripts/SyQon_Prism.js",
      "src/scripts/SyQon/SyQon_Prism.js",
      "src/scripts/SetiAstro/SyQon_Prism.js",
      "src/scripts/SyQonPrism.js"
   ]);
}

function optIsPrismAvailable() {
   var path = optFindFirstExistingCandidatePath(optSyQonPrismScriptCandidates());
   return (path && path.length > 0);
}

function optReadPrismConfiguredExecutablePath() {
   var isWin = (CoreApplication.platform === "MSWINDOWS" || CoreApplication.platform === "Windows");
   var sep = isWin ? "\\" : "/";
   var csvFile = File.systemTempDirectory + sep + "SyQonPrismCLI" + sep + "syqon_prism_config.csv";
   try {
      if (File.exists(csvFile)) {
         var lines = File.readLines(csvFile);
         if (lines.length > 0)
            return lines[0].trim();
      }
   } catch (e) {
      console.warningln("Failed to read Prism config path: " + e.message);
   }
   return "";
}
// PRISM-INTEGRATION-END

// PARALLAX-INTEGRATION-BEGIN (discovery)
// SyQon Parallax (aberration correction / star reduction / sharpening), exposed as
// a Pre Deconvolution algorithm. It is a SEPARATE executable from Prism
// (parallax_cli.exe), so it has its own script-tree discovery and its own
// configured-executable-path CSV. The CLI has no MTF flags: the "PI Temp Stretch"
// (useMTF / mtfTarget / linkedStretch) is a median-transfer stretch applied here
// before inference and reversed afterwards (see optParallaxCreateStretched /
// optParallaxReverseStretch in the engine block). Reversible: set
// OPT_PRE_PARALLAX_ENABLED = false to hide the combo item, or delete the
// PARALLAX-INTEGRATION blocks in both files.
var OPT_PRE_PARALLAX_ENABLED = true;

function optSyQonParallaxScriptCandidates() {
   return optBuildRunningInstallScriptCandidates([
      "../src/scripts/SyQon_Parallax.js",
      "../src/scripts/SyQon/SyQon_Parallax.js",
      "../src/scripts/SetiAstro/SyQon_Parallax.js",
      "../src/scripts/SyQonParallax.js",
      "src/scripts/SyQon_Parallax.js",
      "src/scripts/SyQon/SyQon_Parallax.js",
      "src/scripts/SetiAstro/SyQon_Parallax.js",
      "src/scripts/SyQonParallax.js"
   ]);
}

function optIsParallaxAvailable() {
   var path = optFindFirstExistingCandidatePath(optSyQonParallaxScriptCandidates());
   return (path && path.length > 0);
}

// Read the Parallax executable path the standalone SyQon_Parallax.js script saves
// to <systemTemp>/SyQonParallaxCLI/syqon_parallax_config.csv (first line). This is
// how the path is discovered without hardcoding it; it is platform-correct on
// Windows/macOS/Linux because the script writes the native path for that machine.
function optReadParallaxConfiguredExecutablePath() {
   var isWin = (CoreApplication.platform === "MSWINDOWS" || CoreApplication.platform === "Windows");
   var sep = isWin ? "\\" : "/";
   var csvFile = File.systemTempDirectory + sep + "SyQonParallaxCLI" + sep + "syqon_parallax_config.csv";
   try {
      if (File.exists(csvFile)) {
         var lines = File.readLines(csvFile);
         if (lines.length > 0)
            return lines[0].trim();
      }
   } catch (e) {
      console.warningln("Failed to read Parallax config path: " + e.message);
   }
   return "";
}
// PARALLAX-INTEGRATION-END (discovery)

// DEEPSNR-INTEGRATION-BEGIN
function optIsDeepSNRAvailable() {
   return optDependencyProcessExists("DeepSNR");
}
// DEEPSNR-INTEGRATION-END

// SYQON-STARLESS-INTEGRATION-BEGIN
function optSyQonStarlessScriptCandidates() {
   return optBuildRunningInstallScriptCandidates([
      "../src/scripts/SyQon_Starless.js",
      "../src/scripts/SyQon/SyQon_Starless.js",
      "../src/scripts/SetiAstro/SyQon_Starless.js",
      "../src/scripts/SyQonStarless.js",
      "src/scripts/SyQon_Starless.js",
      "src/scripts/SyQon/SyQon_Starless.js",
      "src/scripts/SetiAstro/SyQon_Starless.js",
      "src/scripts/SyQonStarless.js"
   ]);
}

function optIsSyQonStarlessAvailable() {
   var path = optFindFirstExistingCandidatePath(optSyQonStarlessScriptCandidates());
   return (path && path.length > 0);
}

function optReadStarlessConfiguredExecutablePath() {
   var isWin = (CoreApplication.platform === "MSWINDOWS" || CoreApplication.platform === "Windows");
   var sep = isWin ? "\\" : "/";
   var csvFile = File.systemTempDirectory + sep + "SyQonStarlessCLI" + sep + "syqon_starless_config.csv";
   try {
      if (File.exists(csvFile)) {
         var lines = File.readLines(csvFile);
         if (lines.length > 0)
            return lines[0].trim();
      }
   } catch (e) {
      console.warningln("Failed to read Starless config path: " + e.message);
   }
   return "";
}
// SYQON-STARLESS-INTEGRATION-END


function optEnsureAutoDBESupportLoaded() {
   if (typeof GradientDescentParameters !== "undefined" &&
       GradientDescentParameters != null &&
       typeof executeGradientDescent === "function")
      return true;
   var candidates = optAutoDBECandidatePaths();
   return optTryLoadOptionalScript("autodbe", candidates, function() {
      return typeof GradientDescentParameters !== "undefined" &&
             GradientDescentParameters != null &&
             typeof executeGradientDescent === "function";
   }, true, null, optPreprocessAutoDBEScriptText);
}

// AUTODBE-IIFE-LOADER-BEGIN (v138)
// Captured AutoDBE.js (SetiAstro) symbols. Under PixInsight's V8 runtime the
// script's top-level `let GradientDescentParameters` / `function
// executeGradientDescent` do NOT leak to the script global on indirect eval, so
// we load AutoDBE.js inside an IIFE and capture both here (same approach as
// GraXpertLib). Driven by optRunAutoDBEGradientCorrection.
var optAutoDBEParams = null;     // captured GradientDescentParameters object
var optAutoDBEExecuteFn = null;  // captured executeGradientDescent function

function optTryLoadAutoDBEScript(quiet) {
   if (optAutoDBEParams != null && typeof optAutoDBEExecuteFn === "function")
      return true;
   var candidatePaths = optAutoDBECandidatePaths();
   for (var i = 0; i < candidatePaths.length; ++i) {
      var path = candidatePaths[i];
      try {
         if (!File.exists(path))
            continue;
         var text = optExpandOptionalScriptIncludes(path, {});
         if (!text || text.length === 0)
            continue;
         text = optPreprocessOptionalScriptText(text, optOptionalScriptMacros(path, null));
         text = optPreprocessAutoDBEScriptText(text); // strip the trailing main() call
         text = optOptionalScriptPreamble(path) + text;
         var captured = eval("(function(){\n" + text +
            "\nreturn { gdp:(typeof GradientDescentParameters!=='undefined')?GradientDescentParameters:null," +
            " egd:(typeof executeGradientDescent!=='undefined')?executeGradientDescent:null };\n})()");
         if (captured && captured.gdp != null && typeof captured.egd === "function") {
            optAutoDBEParams = captured.gdp;
            optAutoDBEExecuteFn = captured.egd;
            OPT_OPTIONAL_SCRIPT_LOAD_STATE.autodbe = true;
            if (quiet !== true)
               console.writeln("=> AutoDBE: loaded script " + path);
            return true;
         }
      } catch (e) {
         if (quiet !== true)
            console.warningln("=> AutoDBE script load failed from " + path + ": " + e.message);
      }
   }
   return false;
}
// AUTODBE-IIFE-LOADER-END

function optGraXpertLibCandidatePaths() {
   return optBuildRunningInstallScriptCandidates([
      "../src/scripts/Toolbox/GraXpert/GraXpertLib.jsh",
      "../src/scripts/Toolbox/GraXpert/GraxpertLib.jsh",
      "../src/scripts/Toolbox/GraXpert/GraxPertLib.jsh",
      "../src/scripts/Toolbox/GraXpertLib.jsh",
      "../src/scripts/Toolbox/GraxpertLib.jsh",
      "../src/scripts/Toolbox/GraxPertLib.jsh",
      "src/scripts/Toolbox/GraXpert/GraXpertLib.jsh",
      "src/scripts/Toolbox/GraXpert/GraxpertLib.jsh",
      "src/scripts/Toolbox/GraXpert/GraxPertLib.jsh",
      "src/scripts/Toolbox/GraXpertLib.jsh",
      "src/scripts/Toolbox/GraxpertLib.jsh",
      "src/scripts/Toolbox/GraxPertLib.jsh"
   ]);
}

function optGraXpertMainScriptCandidatePaths() {
   return optBuildRunningInstallScriptCandidates([
      "C:/Program Files/PixInsight/src/scripts/Toolbox/Graxpert.js",
      "C:/Program Files/PixInsight/src/scripts/Toolbox/GraXpert.js",
      "C:/Program Files/PixInsight/src/scripts/Toolbox/GraXpertDenoise.js",
      "../src/scripts/Toolbox/Graxpert.js",
      "../src/scripts/Toolbox/GraXpert.js",
      "../src/scripts/Toolbox/GraxPert.js",
      "../src/scripts/Toolbox/GraXpert/Graxpert.js",
      "../src/scripts/Toolbox/GraXpert/GraXpert.js",
      "../src/scripts/Toolbox/GraXpert/GraxPert.js",
      "src/scripts/Toolbox/Graxpert.js",
      "src/scripts/Toolbox/GraXpert.js",
      "src/scripts/Toolbox/GraxPert.js",
      "src/scripts/Toolbox/GraXpert/Graxpert.js",
      "src/scripts/Toolbox/GraXpert/GraXpert.js",
      "src/scripts/Toolbox/GraXpert/GraxPert.js"
   ]);
}

function optDetectGraXpertScriptConfigName() {
   var mainPath = optFindFirstExistingCandidatePath(optGraXpertMainScriptCandidatePaths());
   if (mainPath && mainPath.length > 0) {
      if (mainPath.indexOf("GraXpertDenoise") >= 0)
         return "GraXpertDenoise";
      if (mainPath.indexOf("Graxpert") >= 0)
         return "Graxpert";
      if (mainPath.indexOf("GraXpert") >= 0)
         return "GraXpert";
   }
   return "Graxpert";
}

function optGraXpertConfigNameCandidates() {
   return ["Graxpert", "GraXpert", "GraXpertDenoise", optDetectGraXpertScriptConfigName()];
}

function optPreprocessAutoDBEScriptText(text) {
   var out = String(text || "");
   out = out.replace(/^\s*main\s*\(\s*\)\s*;\s*$/gm, "");
   out = out.replace(/^\s*if\s*\([^\n\r]*\)\s*main\s*\(\s*\)\s*;\s*$/gm, "");
   out = out.replace(/^\s*else\s+main\s*\(\s*\)\s*;\s*$/gm, "");
   return out;
}

function optEnsureGraXpertLibLoaded() {
   if (typeof GraXpertLib === "function")
      return true;
   // Cache the attempt so repeated UI enablement checks don't re-read/re-eval the
   // file every time (and don't spam the console).
   if (OPT_OPTIONAL_SCRIPT_LOAD_STATE["graxpertlib_attempted"] === true)
      return (typeof GraXpertLib === "function");
   OPT_OPTIONAL_SCRIPT_LOAD_STATE["graxpertlib_attempted"] = true;
   optEnsureGraXpertScriptConfig();
   var candidates = optGraXpertLibCandidatePaths();
   var macros = { GRAXPERT_SCRIPT_CONFIG: "\"" + optDetectGraXpertScriptConfigName() + "\"" };
   var lastError = "";
   for (var i = 0; i < candidates.length; ++i) {
      var path = candidates[i];
      try {
         if (!File.exists(path))
            continue;
         var text = optExpandOptionalScriptIncludes(path, {});
         if (!text || text.length === 0)
            continue;
         text = optPreprocessOptionalScriptText(text, optOptionalScriptMacros(path, macros));
         text = optOptionalScriptPreamble(path) + text;
         // Capture the constructor via an IIFE return. Under PixInsight's V8 a
         // top-level `function GraXpertLib(){}` evaluated through indirect eval does
         // NOT become a script global, so we must return it explicitly (same pattern
         // as the AutoDBE loader) and assign it to the declared `GraXpertLib` holder.
         var captured = eval("(function(){\n" + text + "\nreturn (typeof GraXpertLib === 'function') ? GraXpertLib : null;\n})()");
         if (typeof captured === "function") {
            GraXpertLib = captured;
            OPT_OPTIONAL_SCRIPT_LOAD_STATE["graxpertlib"] = true;
            console.noteln("=> GraXpert: GraXpertLib loaded from " + path);
            return true;
         }
         lastError = "eval ran but did not yield a GraXpertLib constructor";
      } catch (e0) {
         lastError = (e0 && e0.message) ? e0.message : String(e0);
      }
   }
   console.warningln("=> GraXpert: could not load GraXpertLib (" + (lastError || "no candidate file found") + ").");
   return false;
}

function optEnsureGraXpertMainScriptLoaded() {
   var candidates = optGraXpertMainScriptCandidatePaths();
   return optTryLoadOptionalScript("graxpertmain", candidates, function() {
      return typeof GraXpertLib !== "undefined" || optHasGraXpertProcess();
   }, true, {
      GRAXPERT_SCRIPT_CONFIG: "\"" + optDetectGraXpertScriptConfigName() + "\""
   });
}

function optReloadGraXpertLibWithConfigName(configName) {
   var candidates = optGraXpertLibCandidatePaths();
   var macros = { GRAXPERT_SCRIPT_CONFIG: "\"" + (configName || "Graxpert") + "\"" };
   for (var i = 0; i < candidates.length; ++i) {
      var path = candidates[i];
      try {
         if (!File.exists(path))
            continue;
         var text = optExpandOptionalScriptIncludes(path, {});
         text = optPreprocessOptionalScriptText(text, optOptionalScriptMacros(path, macros));
         text = optOptionalScriptPreamble(path) + text;
         (1, eval)(text);
         if (typeof GraXpertLib !== "undefined")
            return true;
      } catch (e0) {
      }
   }
   return false;
}

function optHasGraXpertProcess() {
   return optCreateGenericProcessInstance(["GraXpert", "Graxpert"], ["GraXpert", "Graxpert"]) != null;
}

function optGraXpertSupportMode() {
   if (optHasGraXpertProcess())
      return "process";
   if (typeof GraXpertLib !== "undefined")
      return "script";
   if (optEnsureGraXpertMainScriptLoaded()) {
      if (optHasGraXpertProcess())
         return "process";
      if (typeof GraXpertLib !== "undefined")
         return "script";
   }
   if (optEnsureGraXpertLibLoaded())
      return "script";
   return "";
}

function optHasAutoDBERuntime() {
   return typeof GradientDescentParameters !== "undefined" &&
          GradientDescentParameters != null &&
          typeof executeGradientDescent === "function";
}

function optClampPreviewReduction(value) {
   var v = parseInt(value, 10);
   if (!isFinite(v))
      v = OPT_PREVIEW_REDUCTION_DEFAULT;
   return Math.max(1, Math.min(6, v));
}

function optGetGraXpertSupportInfo() {
   var sourcePath = optFindFirstExistingCandidatePath(optGraXpertLibCandidatePaths());
   var scriptLoaded = (typeof GraXpertLib !== "undefined");
   var processAvailable = optHasGraXpertProcess();
   var mode = processAvailable ? "process" : (scriptLoaded ? "script" : "");
   return {
      installed: scriptLoaded || processAvailable || (sourcePath.length > 0),
      mode: mode,
      scriptLoaded: scriptLoaded,
      processAvailable: processAvailable,
      available: scriptLoaded || processAvailable || (sourcePath.length > 0),
      sourcePath: sourcePath
   };
}

