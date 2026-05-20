/*
 * PI Workflow 4 — parameter-model layer on top of the PI Workflow 3 split.
 * Same UI as PI Workflow 2 / 3 (visual redesign rc1). Same physical split:
 * dialog, theme, widgets and section builders live in "PI Workflow 4_UI.js",
 * #include'd from this file just before the architecture self-check.
 *
 * What's new vs PI Workflow 3:
 *   - Config builders (optBuildPreCandidateConfig, optBuildPostCandidateConfig,
 *     optBuildCcConfigFromDialog) extract a normalized parameter object from
 *     the dialog once per candidate, instead of letting process functions
 *     read controls directly.
 *   - Configured execution variants accept a cfg object. Legacy
 *     ...OnView(targetView, dialog) wrappers are kept for back-compat.
 *   - optApplyPreCandidate / optApplyPostCandidate accept either the old
 *     (view, actionKey, dialog) call style or a cfg object.
 *
 * Reference: PI Workflow 2 to 4 migration guide.md.
 */

#feature-id    Utilities > PI_Workflow_4
#feature-info  PI Workflow 4 - parameter-model layer (Phases 5-9) on top of the PI Workflow 3 split. Same redesigned UI; processing functions now consume normalized config objects produced by per-stage builders, and configured execution variants decouple processes from dialog controls.

#ifndef PI_WORKFLOW_OPT_NO_MAIN
#define PI_WORKFLOW_OPT_NO_MAIN 0
#endif

#ifndef PI_WORKFLOW_OPT_TEST_MODE
#define PI_WORKFLOW_OPT_TEST_MODE 0
#endif

#define SETTINGS_MODULE ImageSolver

#include <pjsr/StdButton.jsh>
#include <pjsr/StdIcon.jsh>
#include <pjsr/StdCursor.jsh>
#include <pjsr/Sizer.jsh>
#include <pjsr/FrameStyle.jsh>
#include <pjsr/NumericControl.jsh>
#include <pjsr/DataType.jsh>
#include <pjsr/UndoFlag.jsh>
#include <pjsr/ColorSpace.jsh>
#include <pjsr/SampleType.jsh>
#include <pjsr/TextAlign.jsh>
#include <pjsr/ImageOp.jsh>
#include <pjsr/Interpolation.jsh>
#include <pjsr/RBFType.jsh>
#include <pjsr/FileMode.jsh>
#include <pjsr/PenStyle.jsh>
#include <pjsr/Color.jsh>
#include <../src/scripts/AdP/WCSmetadata.jsh>
#include <../src/scripts/AdP/AstronomicalCatalogs.jsh>
#include <../src/scripts/AdP/WarpImage.js>
#include "PI Workflow_resources.jsh"

#ifndef Ext_DataType_Complex
#define Ext_DataType_Complex 1001
#endif

#ifndef Ext_DataType_StringArray
#define Ext_DataType_StringArray 1002
#endif

#ifndef Ext_DataType_JSON
#define Ext_DataType_JSON 1003
#endif

#ifndef WCS_MIN_CATALOG_STARS
#define WCS_MIN_CATALOG_STARS 100
#endif

#ifndef WCS_MAX_CATALOG_STARS
#define WCS_MAX_CATALOG_STARS 2500
#endif

#ifndef WCS_DEFAULT_RBF_TYPE
#define WCS_DEFAULT_RBF_TYPE RBFType_DDMThinPlateSpline
#endif

#ifndef WCS_MIN_SPLINE_POINTS
#define WCS_MIN_SPLINE_POINTS 10
#endif

#ifndef WCS_MAX_DENSE_SPLINE_POINTS
#define WCS_MAX_DENSE_SPLINE_POINTS 2000
#endif

#ifndef WCS_MAX_DDM_SPLINE_POINTS
#define WCS_MAX_DDM_SPLINE_POINTS 2000
#endif

#ifndef WCS_DEFAULT_DDM_SPLINE_POINTS
#define WCS_DEFAULT_DDM_SPLINE_POINTS 400
#endif

#ifndef WCS_DEFAULT_MAX_SPLINE_POINTS
#define WCS_DEFAULT_MAX_SPLINE_POINTS 2000
#endif

// These three items are normally defined inside ImageSolver.js's
// #ifndef USE_SOLVER_LIBRARY block, which is skipped when including as a
// library. They are required by ImageSolverDialog at construction time.
#ifndef STAR_CSV_FILE
#define STAR_CSV_FILE (File.systemTempDirectory + format("/stars-%03d.csv", CoreApplication.instance))
#endif
#include <../src/scripts/AdP/CommonUIControls.js>
#include <../src/scripts/AdP/SearchCoordinatesDialog.js>

#define USE_SOLVER_LIBRARY
#include <../src/scripts/AdP/ImageSolver.js>
#undef USE_SOLVER_LIBRARY

var OPT_VERSION = "34-param-model-v1";
var OPT_LAST_SPCC_GUI_NB_ICON = false;
var OPT_PREVIEW_REDUCTION_DEFAULT = 3;
var OPT_MEMORY_SLOTS = 8;
var OPT_MASK_MEMORY_SLOTS = 8;
// Max longest-side dimension for the live mask preview. Larger sources are
// downsampled with Bilinear before mask computation so live previews stay
// responsive while the user drags strip handles or the hue wheel.
var OPT_POST_LIVE_MAX_DIM = 1024;
// Generic longest-side cap for live candidates that are later regenerated at
// full resolution when the user commits them. This avoids running expensive
// post-processing on 24-60 MP frames for every slider movement.
var OPT_LIVE_CANDIDATE_MAX_DIM = 1600;
// Max longest-side dimension for the Channel Combination live compose (#3).
// When chkCcSeeAllBlended is checked, prepared slot views are resampled to fit
// within this bound BEFORE blending so that PixelMath operates on much smaller
// images. Set to Current re-runs the compose at full resolution.
var OPT_CC_LIVE_MAX_DIM = 1024;
// Soft cap on bytes held by memory slots across all tabs + mask memories (#5).
// Fixed at 1.5 GB — conservative ceiling that fits comfortably in RAM while
// leaving room for PixInsight's own working memory and the user's active images.
var OPT_MEMORY_BUDGET_BYTES = 1.5 * 1024 * 1024 * 1024;
var OPT_BG = 0xff0e0e10;
var OPT_PANEL = 0xff17171a;
var OPT_TEXT = 0xffe8e8ea;
var OPT_DIM = 0xffa0a0a8;
var OPT_ACCENT = 0xffd9a560;

var OPT_TAB_PRE = "pre";
var OPT_TAB_STRETCH = "stretch";
var OPT_TAB_POST = "post";
var OPT_TAB_CC = "cc";

var OPT_BASE_KEYS = ["MonoRGB", "R", "G", "B", "L", "HSO", "H", "O", "S", "HO", "OS", "RGB"];
var OPT_MONO_KEYS = ["R", "G", "B", "L", "H", "O", "S"];
var OPT_COLOR_KEYS = ["RGB", "HO", "OS", "MonoRGB", "HSO"];
var OPT_INPUT_KEYS = ["R", "G", "B", "L", "H", "O", "S", "HO", "OS", "RGB"];
var OPT_RECIPE_NAMES = ["SHO", "HOO", "HSO", "HOS", "OSS", "OHH", "OSH", "OHS", "HSS", "REAL1", "REAL2", "FORAXX"];
var OPT_MOUSE_LEFT = (typeof MouseButton_Left !== "undefined") ? MouseButton_Left : 0x01;
var OPT_MOUSE_RIGHT = (typeof MouseButton_Right !== "undefined") ? MouseButton_Right : 0x02;
var OPT_PIW_HAS_AUTODBE = (typeof GradientDescentParameters !== "undefined" &&
                           GradientDescentParameters != null &&
                           typeof executeGradientDescent === "function");
var processVeraLux;
var OPT_PIW_HAS_VERALUX = (typeof processVeraLux === "function");
var OPT_LAST_VERALUX_LOAD_REPORT = "";
var OPT_LAST_VERALUX_LOADED_PATH = "";
var OPT_GRAXPERT_DEFAULT_CORRECTION = 0;
var OPT_GRAXPERT_DEFAULT_SMOOTHING = 0.629;
var OPT_TEST_MODE = (PI_WORKFLOW_OPT_TEST_MODE != 0);
var OPT_SYNTHETIC_WCS_IDS = {};
var OPT_OPTIONAL_SCRIPT_LOAD_STATE = {};

var GRAXPERT_SCRIPT_CONFIG;

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
   return (typeof ImageSolver === "function") &&
          (typeof ImageMetadata === "function") &&
          (typeof ObjectWithSettings !== "undefined");
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
   // scripts (GraXpertLib, verlux.js) can use them without ReferenceErrors.
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
   for (var i = 0; i < lines.length; ++i) {
      var line = lines[i];
      if (skipPreprocessorContinuation) {
         skipPreprocessorContinuation = optPjsrPreprocessorLineContinues(line);
         continue;
      }
      var m = line.match(/^\s*#define\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+(.+?))?\s*$/);
      if (m) {
         skipPreprocessorContinuation = optPjsrPreprocessorLineContinues(line);
         if (skipPreprocessorContinuation)
            continue;
         var value = (m[2] !== undefined) ? m[2] : "true";
         value = value.replace(/\s*\/\/.*$/, "");
         value = value.replace(/\s*\/\*.*?\*\/\s*$/, "");
         if (value.length > 0)
            macros[m[1]] = value;
         continue;
      }
      m = line.match(/^\s*#undef\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/);
      if (m) {
         delete macros[m[1]];
         continue;
      }
      if (/^\s*#/.test(line)) {
         skipPreprocessorContinuation = optPjsrPreprocessorLineContinues(line);
         continue;
      }
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

function optTryLoadVeraLuxScript(candidatePaths, quiet) {
   OPT_LAST_VERALUX_LOAD_REPORT = "";
   OPT_LAST_VERALUX_LOADED_PATH = "";
   if (optHasOwn(OPT_OPTIONAL_SCRIPT_LOAD_STATE, "veralux") && OPT_OPTIONAL_SCRIPT_LOAD_STATE.veralux === true &&
       optResolveVeraLuxProcessFunction() != null)
      return true;
   if (optResolveVeraLuxProcessFunction() != null) {
      OPT_OPTIONAL_SCRIPT_LOAD_STATE.veralux = true;
      return true;
   }
   var attempts = [];
   var existing = 0;
   for (var i = 0; i < candidatePaths.length; ++i) {
      var path = candidatePaths[i];
      try {
         if (!File.exists(path))
            continue;
         ++existing;
         var text = optExpandOptionalScriptIncludes(path, {});
         if (!text || text.length === 0)
            continue;
         text = optPreprocessOptionalScriptText(text, optOptionalScriptMacros(path, null));
         text = optPreprocessVeraLuxScriptText(text, path);
         text = optOptionalScriptPreamble(path) + text;
         var captured = eval("(function(){\n" + text + "\nreturn (typeof processVeraLux === 'function') ? processVeraLux : null;\n})()");
         if (typeof captured === "function") {
            processVeraLux = captured;
            OPT_OPTIONAL_SCRIPT_LOAD_STATE.veralux = true;
            OPT_LAST_VERALUX_LOADED_PATH = path;
            if (quiet !== true)
               console.writeln("=> VeraLux: loaded script " + path);
            return true;
         }
         attempts.push(path + " => loaded but did not export processVeraLux(img, params, callback)");
      } catch (e) {
         attempts.push(path + " => " + e.message);
         if (quiet !== true)
            console.warningln("=> VeraLux script load failed from " + path + ": " + e.message);
      }
   }
   if (existing < 1) {
      var sample = [];
      for (var j = 0; j < Math.min(12, candidatePaths.length); ++j)
         sample.push(candidatePaths[j]);
      OPT_LAST_VERALUX_LOAD_REPORT = "No existing VeraLux script file was found. First checked paths:\n" + sample.join("\n");
   } else {
      OPT_LAST_VERALUX_LOAD_REPORT = attempts.length ? attempts.join("\n") : "Existing VeraLux scripts were found, but none exported processVeraLux.";
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

function optVeraLuxCandidatePaths() {
   return optBuildRunningInstallScriptCandidates([
      "C:/Program Files/PixInsight/src/scripts/VeraLux/verlux.js",
      "C:/Program Files/PixInsight/src/scripts/VeraLux/VeraLux.js",
      "C:/Program Files/PixInsight/verlux.js",
      "C:/Program Files/PixInsight/VeraLux.js",
      "verlux.js",
      "VeraLux.js",
      "../src/scripts/Toolbox/VeraLux/VeraLux.js",
      "../src/scripts/Toolbox/VeraLux/VeraLux.jsh",
      "../src/scripts/Toolbox/VeraLux/VeraLux_lib.js",
      "../src/scripts/Toolbox/VeraLux/VeraLux_lib.jsh",
      "../src/scripts/Toolbox/VeraLux/verlux.js",
      "../src/scripts/Toolbox/VeraLux/verlux.jsh",
      "../src/scripts/Toolbox/VeraLux/verlux_lib.js",
      "../src/scripts/Toolbox/VeraLux/verlux_lib.jsh",
      "../src/scripts/Toolbox/VelaLux/VelaLux.js",
      "../src/scripts/Toolbox/VelaLux/VelaLux_lib.js",
      "../src/scripts/Toolbox/VelaLux/veralux.js",
      "../src/scripts/Toolbox/VelaLux/veralux_lib.js",
      "../src/scripts/VelaLux.js",
      "../src/scripts/VelaLux_lib.js",
      "../src/scripts/VelaLux/VelaLux.js",
      "../src/scripts/VelaLux/VelaLux_lib.js",
      "../src/scripts/Toolbox/VelaLux.js",
      "../src/scripts/Toolbox/VelaLux_lib.js",
      "../src/scripts/verlux.js",
      "../src/scripts/verlux/verlux.js",
      "../src/scripts/verlux/VeraLux.js",
      "../src/scripts/verlux/VeraLux_lib.js",
      "../src/scripts/VeraLux_lib.js",
      "../src/scripts/VeraLux.js",
      "../src/scripts/VeraLux/VeraLux.js",
      "../src/scripts/VeraLux/VeraLux.jsh",
      "../src/scripts/VeraLux/verlux.js",
      "../src/scripts/VeraLux/verlux.jsh",
      "../src/scripts/VeraLux/VeraLux_lib.js",
      "../src/scripts/VeraLux/VeraLux_lib.jsh",
      "../src/scripts/Toolbox/verlux.js",
      "../src/scripts/Toolbox/VeraLux.js",
      "../src/scripts/Toolbox/VeraLux_lib.js",
      "../src/scripts/Toolbox/veralux.js",
      "../src/scripts/Toolbox/veralux_lib.js",
      "src/scripts/VelaLux.js",
      "src/scripts/VelaLux_lib.js",
      "src/scripts/VelaLux/VelaLux.js",
      "src/scripts/VelaLux/VelaLux_lib.js",
      "src/scripts/Toolbox/VeraLux/VeraLux.js",
      "src/scripts/Toolbox/VeraLux/VeraLux.jsh",
      "src/scripts/Toolbox/VeraLux/VeraLux_lib.js",
      "src/scripts/Toolbox/VeraLux/VeraLux_lib.jsh",
      "src/scripts/Toolbox/VeraLux/verlux.js",
      "src/scripts/Toolbox/VeraLux/verlux.jsh",
      "src/scripts/Toolbox/VeraLux/verlux_lib.js",
      "src/scripts/Toolbox/VeraLux/verlux_lib.jsh",
      "src/scripts/Toolbox/VelaLux/VelaLux.js",
      "src/scripts/Toolbox/VelaLux/VelaLux_lib.js",
      "src/scripts/Toolbox/VelaLux/veralux.js",
      "src/scripts/Toolbox/VelaLux/veralux_lib.js",
      "src/scripts/Toolbox/VelaLux.js",
      "src/scripts/Toolbox/VelaLux_lib.js",
      "src/scripts/verlux.js",
      "src/scripts/verlux/verlux.js",
      "src/scripts/verlux/VeraLux.js",
      "src/scripts/verlux/VeraLux_lib.js",
      "src/scripts/VeraLux_lib.js",
      "src/scripts/VeraLux.js",
      "src/scripts/VeraLux/VeraLux.js",
      "src/scripts/VeraLux/VeraLux.jsh",
      "src/scripts/VeraLux/verlux.js",
      "src/scripts/VeraLux/verlux.jsh",
      "src/scripts/VeraLux/VeraLux_lib.js",
      "src/scripts/VeraLux/VeraLux_lib.jsh",
      "src/scripts/Toolbox/verlux.js",
      "src/scripts/Toolbox/VeraLux.js",
      "src/scripts/Toolbox/VeraLux_lib.js",
      "src/scripts/Toolbox/veralux.js",
      "src/scripts/Toolbox/veralux_lib.js"
   ]);
}

function optPreprocessVeraLuxScriptText(text) {
   var out = String(text || "");
   out = out.replace(/^\s*main\s*\(\s*\)\s*;\s*$/gm, "");
   out = out.replace(/^\s*if\s*\([^\n\r]*\)\s*main\s*\(\s*\)\s*;\s*$/gm, "");
   out = out.replace(/^\s*else\s+main\s*\(\s*\)\s*;\s*$/gm, "");
   out = out.replace(/\n\s*main\s*\(\s*\)\s*;\s*$/m, "\n");
   return out;
}

function optPreprocessAutoDBEScriptText(text) {
   var out = String(text || "");
   out = out.replace(/^\s*main\s*\(\s*\)\s*;\s*$/gm, "");
   out = out.replace(/^\s*if\s*\([^\n\r]*\)\s*main\s*\(\s*\)\s*;\s*$/gm, "");
   out = out.replace(/^\s*else\s+main\s*\(\s*\)\s*;\s*$/gm, "");
   return out;
}

function optResolveVeraLuxProcessFunction() {
   // Strict resolver: only return the exact `processVeraLux(img, params, cb)`
   // global defined by verlux.js / VeraLux Suite. Earlier versions used a
   // permissive heuristic scan (object methods, fuzzy name matching) that
   // would also pick up the native VeraLux PXM constructor (the .dll exposes
   // `VeraLux` as a global). Returning that constructor as a "function" then
   // calling it without `new` produced the silent "el boton no hace nada"
   // failure: the progress callback never fired and the candidate came back
   // unchanged. The ProcessInstance fallback in the VLX branch handles the
   // PXM case explicitly with parameter validation, so this resolver should
   // be conservative.
   try {
      if (typeof processVeraLux === "function")
         return processVeraLux;
   } catch (e0) {
   }
   try {
      var directFn = eval("processVeraLux");
      if (typeof directFn === "function") {
         try { processVeraLux = directFn; } catch (eDirect0) {}
         return directFn;
      }
   } catch (eDirect1) {
   }
   try {
      if (typeof this["processVeraLux"] === "function")
         return this["processVeraLux"];
   } catch (eThis) {
   }
   return null;
}

function optPickNewestExistingPath(candidatePaths) {
   var best = null;
   var bestTime = -1;
   for (var i = 0; i < candidatePaths.length; ++i) {
      var p = candidatePaths[i];
      try {
         if (!File.exists(p))
            continue;
         var info = new FileInfo(p);
         var lm = info.lastModified;
         var t = (lm && typeof lm.getTime === "function") ? lm.getTime() : 0;
         if (t > bestTime) {
            bestTime = t;
            best = p;
         }
      } catch (eFi) {
      }
   }
   return best;
}

function optOrderCandidatePathsNewestFirst(candidatePaths) {
   var newest = optPickNewestExistingPath(candidatePaths);
   if (!newest || newest.length < 1)
      return candidatePaths;
   var out = [newest];
   var newestNorm = optNormalizePath(newest);
   for (var i = 0; i < candidatePaths.length; ++i) {
      if (optNormalizePath(candidatePaths[i]) !== newestNorm)
         out.push(candidatePaths[i]);
   }
   return out;
}

function optIsPjsrImage(image) {
   try {
      return !!(
         image &&
         typeof image === "object" &&
         typeof image.width !== "undefined" &&
         typeof image.height !== "undefined" &&
         typeof image.numberOfChannels !== "undefined" &&
         typeof image.assign === "function"
      );
   } catch (e) {
      return false;
   }
}

function optVeraLuxReturnTypeName(value) {
   if (value === null)
      return "null";
   if (typeof value === "undefined")
      return "undefined";
   try {
      if (optIsPjsrImage(value))
         return "Image";
      if (optSafeView(value))
         return "View";
      if (value.mainView && optSafeView(value.mainView))
         return "ImageWindow";
   } catch (e0) {
   }
   return typeof value;
}

function optFindNewVeraLuxImage(beforeMap, targetView) {
   try {
      var windows = ImageWindow.windows;
      for (var i = windows.length - 1; i >= 0; --i) {
         var win = windows[i];
         if (win == null || win.isNull || win.mainView == null || win.mainView.isNull)
            continue;
         var id = win.mainView.id;
         if (beforeMap && optHasOwn(beforeMap, id) && beforeMap[id] === true)
            continue;
         if (!optIsPjsrImage(win.mainView.image))
            continue;
         if (optSafeView(targetView)) {
            if (win.mainView.image.width !== targetView.image.width ||
                win.mainView.image.height !== targetView.image.height ||
                win.mainView.image.numberOfChannels !== targetView.image.numberOfChannels)
               continue;
         }
         return { image: win.mainView.image, owned: false, closeWindow: win, source: "new-window" };
      }
   } catch (e0) {
   }
   return null;
}

function optValidateVeraLuxImageGeometry(image, targetView) {
   if (!optSafeView(targetView) || !optIsPjsrImage(image))
      return;
   if (image.width !== targetView.image.width ||
       image.height !== targetView.image.height ||
       image.numberOfChannels !== targetView.image.numberOfChannels)
      throw new Error("VeraLux returned an Image with incompatible geometry/channels: " +
         image.width + "x" + image.height + "x" + image.numberOfChannels +
         " for target " + targetView.image.width + "x" + targetView.image.height + "x" + targetView.image.numberOfChannels + ".");
}

function optNormalizeVeraLuxResult(result, targetView, beforeMap) {
   if (optIsPjsrImage(result)) {
      optValidateVeraLuxImageGeometry(result, targetView);
      return { image: result, owned: !(optSafeView(targetView) && result === targetView.image), closeWindow: null, source: "image" };
   }
   if (optSafeView(result)) {
      optValidateVeraLuxImageGeometry(result.image, targetView);
      return { image: result.image, owned: false, closeWindow: null, source: "view" };
   }
   if (result && result.mainView && optSafeView(result.mainView)) {
      optValidateVeraLuxImageGeometry(result.mainView.image, targetView);
      return { image: result.mainView.image, owned: false, closeWindow: null, source: "window" };
   }
   if (result && typeof result.image !== "undefined" && optIsPjsrImage(result.image)) {
      optValidateVeraLuxImageGeometry(result.image, targetView);
      return { image: result.image, owned: false, closeWindow: null, source: "object.image" };
   }
   if (result && result.view && optSafeView(result.view)) {
      optValidateVeraLuxImageGeometry(result.view.image, targetView);
      return { image: result.view.image, owned: false, closeWindow: null, source: "object.view" };
   }
   if (result && result.window && result.window.mainView && optSafeView(result.window.mainView)) {
      optValidateVeraLuxImageGeometry(result.window.mainView.image, targetView);
      return { image: result.window.mainView.image, owned: false, closeWindow: null, source: "object.window.mainView" };
   }
   if (result && result.outputView && optSafeView(result.outputView)) {
      optValidateVeraLuxImageGeometry(result.outputView.image, targetView);
      return { image: result.outputView.image, owned: false, closeWindow: null, source: "object.outputView" };
   }
   if (result && result.outputWindow && result.outputWindow.mainView && optSafeView(result.outputWindow.mainView)) {
      optValidateVeraLuxImageGeometry(result.outputWindow.mainView.image, targetView);
      return { image: result.outputWindow.mainView.image, owned: false, closeWindow: null, source: "object.outputWindow.mainView" };
   }
   if (result && typeof result.outputImage !== "undefined" && optIsPjsrImage(result.outputImage)) {
      optValidateVeraLuxImageGeometry(result.outputImage, targetView);
      return { image: result.outputImage, owned: false, closeWindow: null, source: "object.outputImage" };
   }
   if (result && result.result && result.result !== result) {
      try {
         return optNormalizeVeraLuxResult(result.result, targetView, beforeMap);
      } catch (eNested0) {
      }
   }
   var opened = optFindNewVeraLuxImage(beforeMap, targetView);
   if (opened != null)
      return opened;
   if (result && typeof result === "object" && optSafeView(targetView) && optIsPjsrImage(targetView.image))
      return { image: targetView.image, owned: false, closeWindow: null, source: "target-image-in-place" };
   throw new Error("VeraLux did not return an Image-compatible result. Return type: " + optVeraLuxReturnTypeName(result) + ".");
}

function optCreateVeraLuxProcessInstance() {
   var names = ["VeraLux", "VelaLux", "Veralux"];
   for (var i = 0; i < names.length; ++i) {
      try {
         var ctor = eval(names[i]);
         if (typeof ctor !== "function")
            continue;
         var P = new ctor();
         if (P != null && !P.isNull && typeof P.processId === "function")
            return P;
      } catch (e0) {}
   }
   var icons = ["VeraLux", "VelaLux", "Veralux"];
   for (var j = 0; j < icons.length; ++j) {
      try {
         var iconProc = ProcessInstance.fromIcon(icons[j]);
         if (iconProc != null && !iconProc.isNull && typeof iconProc.processId === "function") {
            var pid = iconProc.processId();
            if (pid === "VeraLux" || pid === "VelaLux" || pid === "Veralux")
               return iconProc;
         }
      } catch (e1) {}
   }
   return null;
}

function optHasVeraLuxProcess() {
   return optCreateVeraLuxProcessInstance() != null;
}

function optEnsureVeraLuxSupportLoaded() {
   if (optResolveVeraLuxProcessFunction() != null)
      return true;
   // Pick only the most recently modified existing candidate. Some PixInsight
   // installs end up with multiple verlux.js copies registered under different
   // menus (e.g. "VeraLux > VeraLux Suite" v2.0.7 at the install root and the
   // older "VHS-Porting > VeraLux HyperMetric Stretch" under src/scripts/VeraLux/).
   // Both define `processVeraLux(img, params, cb)` with the same signature, so
   // either works, but loading both would let the second eval overwrite the
   // first arbitrarily. We pick by mtime so the user effectively runs the
   // newest available version of the script.
   var candidates = optVeraLuxCandidatePaths();
   var ordered = optOrderCandidatePathsNewestFirst(candidates);
   var loaded = optTryLoadVeraLuxScript(ordered, true);
   if (loaded && OPT_LAST_VERALUX_LOADED_PATH && OPT_LAST_VERALUX_LOADED_PATH.length > 0) {
      try { console.writeln("=> VeraLux: loaded script " + OPT_LAST_VERALUX_LOADED_PATH); } catch (eLog) {}
   }
   return loaded;
}

function optEnsureGraXpertLibLoaded() {
   if (typeof GraXpertLib !== "undefined")
      return true;
   optEnsureGraXpertScriptConfig();
   var candidates = optGraXpertLibCandidatePaths();
   return optTryLoadOptionalScript("graxpertlib", candidates, function() {
      return typeof GraXpertLib !== "undefined";
   }, true, {
      GRAXPERT_SCRIPT_CONFIG: "\"" + optDetectGraXpertScriptConfigName() + "\""
   });
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

function optGetVeraLuxSupportInfo() {
   var sourcePath = optFindFirstExistingCandidatePath(optVeraLuxCandidatePaths());
   var loaded = (optResolveVeraLuxProcessFunction() != null);
   var processAvailable = optHasVeraLuxProcess();
   return {
      installed: processAvailable || loaded || (sourcePath.length > 0),
      loaded: loaded === true,
      process: processAvailable === true,
      available: processAvailable === true || loaded === true || sourcePath.length > 0,
      sourcePath: sourcePath
   };
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
      if (optSafeView(view) && view.window && !view.window.isNull)
         view.window.forceClose();
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

function optRenderPreviewBitmap(view, reductionFactor, stretchMode) {
   if (!optSafeView(view))
      return null;
   var img = null;
   try {
      if (!view.image)
         return null;
      var w = view.image.width;
      var h = view.image.height;
      var reduction = optClampPreviewReduction(reductionFactor);
      var rw = Math.max(1, Math.round(w / reduction));
      var rh = Math.max(1, Math.round(h / reduction));
      var previewInterpolation = Interpolation_Bilinear;
      try {
         var viewId0 = String(view.id || "");
         if (view.image.numberOfChannels === 1 &&
             (viewId0.indexOf("RangeMaskBinary") >= 0 || viewId0.indexOf("RS-BIN") >= 0))
            previewInterpolation = Interpolation_NearestNeighbor;
      } catch (eI0) {}
      img = new Image(w, h, view.image.numberOfChannels, view.image.colorSpace, 32, SampleType_Real);
      img.assign(view.image);
      if (reduction > 1)
         img.resample(rw, rh, previewInterpolation);
      if (stretchMode === "mad-unlinked")
         optApplyMadAutoStretch(img, false);
      else if (stretchMode === "mad-linked")
         optApplyMadAutoStretch(img, true);
      return img.render();
   } finally {
      if (img)
         try { img.free(); } catch (e) {}
   }
}

function optRenderPreviewBitmapToSize(view, targetW, targetH, stretchMode) {
   if (!optSafeView(view))
      return null;
   var img = null;
   try {
      if (!view.image)
         return null;
      var rw = Math.max(1, targetW);
      var rh = Math.max(1, targetH);
      var previewInterpolation = Interpolation_Bilinear;
      try {
         var viewId1 = String(view.id || "");
         if (view.image.numberOfChannels === 1 &&
             (viewId1.indexOf("RangeMaskBinary") >= 0 || viewId1.indexOf("RS-BIN") >= 0))
            previewInterpolation = Interpolation_NearestNeighbor;
      } catch (eI1) {}
      img = new Image(view.image.width, view.image.height, view.image.numberOfChannels, view.image.colorSpace, 32, SampleType_Real);
      img.assign(view.image);
      if (rw !== view.image.width || rh !== view.image.height)
         img.resample(rw, rh, previewInterpolation);
      if (stretchMode === "mad-unlinked")
         optApplyMadAutoStretch(img, false);
      else if (stretchMode === "mad-linked")
         optApplyMadAutoStretch(img, true);
      return img.render();
   } finally {
      if (img)
         try { img.free(); } catch (e) {}
   }
}

function optBuildPreviewImage(view, targetW, targetH, stretchMode) {
   if (!optSafeView(view) || !view.image)
      return null;
   var rw = Math.max(1, targetW);
   var rh = Math.max(1, targetH);
   var previewInterpolation = Interpolation_Bilinear;
   try {
      var viewId1 = String(view.id || "");
      if (view.image.numberOfChannels === 1 &&
          (viewId1.indexOf("RangeMaskBinary") >= 0 || viewId1.indexOf("RS-BIN") >= 0))
         previewInterpolation = Interpolation_NearestNeighbor;
   } catch (eI1) {}
   var img = new Image(view.image.width, view.image.height, view.image.numberOfChannels, view.image.colorSpace, 32, SampleType_Real);
   img.assign(view.image);
   if (rw !== view.image.width || rh !== view.image.height)
      img.resample(rw, rh, previewInterpolation);
   if (stretchMode === "mad-unlinked")
      optApplyMadAutoStretch(img, false);
   else if (stretchMode === "mad-linked")
      optApplyMadAutoStretch(img, true);
   return img;
}

function optRenderPreviewBitmapWithMask(view, maskView, reductionFactor, stretchMode) {
   if (!optSafeView(view) || !optSafeView(maskView))
      return null;
   if (view.image.width !== maskView.image.width || view.image.height !== maskView.image.height)
      return null;
   var reduction = optClampPreviewReduction(reductionFactor);
   var rw = Math.max(1, Math.round(view.image.width / reduction));
   var rh = Math.max(1, Math.round(view.image.height / reduction));
   var srcImg = null;
   var maskImg = null;
   try {
      srcImg = optBuildPreviewImage(view, rw, rh, stretchMode);
      maskImg = optBuildPreviewImage(maskView, rw, rh, "");
      if (!srcImg || !maskImg)
         return null;
      var bmp = new Bitmap(rw, rh);
      var rRow = optCreateSampleArray(rw);
      var gRow = optCreateSampleArray(rw);
      var bRow = optCreateSampleArray(rw);
      var mRow = optCreateSampleArray(rw);
      var color = srcImg.numberOfChannels >= 3;
      for (var y = 0; y < rh; ++y) {
         var rect = new Rect(0, y, rw, y + 1);
         maskImg.getSamples(mRow, rect, 0);
         if (color) {
            srcImg.getSamples(rRow, rect, 0);
            srcImg.getSamples(gRow, rect, 1);
            srcImg.getSamples(bRow, rect, 2);
         } else {
            srcImg.getSamples(rRow, rect, 0);
         }
         // v33-opt-9n: overlay color changed from red to amber-gold (0xFFFFD000:
         // R=1.0, G=0.816, B=0.0) for visual consistency with the rest of the
         // script (Crop handles, accents) and to match the painted-region
         // appearance the user expects in FAME — white-area-of-mask = where
         // the mask will act (post v33-opt-9k's maskInverted=true).
         var TINT_R = 1.0;       // 255/255
         var TINT_G = 0.8157;    // 208/255
         var TINT_B = 0.0;       //   0/255
         for (var x = 0; x < rw; ++x) {
            var a = 0.65 * optClamp01(mRow[x]);
            var rv = optClamp01(rRow[x]);
            var gv = color ? optClamp01(gRow[x]) : rv;
            var bv = color ? optClamp01(bRow[x]) : rv;
            var rr = Math.max(0, Math.min(255, Math.round(255 * (rv * (1 - a) + a * TINT_R))));
            var gg = Math.max(0, Math.min(255, Math.round(255 * (gv * (1 - a) + a * TINT_G))));
            var bb = Math.max(0, Math.min(255, Math.round(255 * (bv * (1 - a) + a * TINT_B))));
            bmp.setPixel(x, y, 0xff000000 | (rr << 16) | (gg << 8) | bb);
         }
      }
      return bmp;
   } finally {
      if (srcImg)
         try { srcImg.free(); } catch (e0) {}
      if (maskImg)
         try { maskImg.free(); } catch (e1) {}
   }
}

function optRenderStackedPreviewBitmap(topView, bottomView, reductionFactor, stretchMode) {
   var top = optRenderPreviewBitmap(topView, reductionFactor, stretchMode);
   if (!top || !optSafeView(bottomView))
      return top;
   // Gradient model is always rendered at exactly half the linear size of the main preview,
   // regardless of the gradient view's native pixel dimensions (ABE, AutoDBE, GraXpert differ).
   var targetW = Math.max(1, Math.round(top.width / 2));
   var targetH = Math.max(1, Math.round(top.height / 2));
   var bottom = optRenderPreviewBitmapToSize(bottomView, targetW, targetH, "mad-unlinked");
   if (!bottom)
      return top;
   var gap = 8;
   var out = new Bitmap(Math.max(top.width, bottom.width), top.height + gap + bottom.height);
   var g = new Graphics(out);
   try {
      g.fillRect(new Rect(0, 0, out.width, out.height), new Brush(0xff202020));
      g.drawBitmap(Math.round((out.width - top.width) / 2), 0, top);
      g.fillRect(new Rect(0, top.height, out.width, top.height + gap), new Brush(0xff0e0e10));
      g.drawBitmap(Math.round((out.width - bottom.width) / 2), top.height + gap, bottom);
   } finally {
      g.end();
   }
   return out;
}

function optCreateRgbFromChannels(viewR, viewG, viewB, baseId, metadataView) {
   if (!optSafeView(viewR) || !optSafeView(viewG) || !optSafeView(viewB))
      throw new Error("R, G and B channels are required.");
   optRequireSameGeometry("RGB channel combination", [viewR, viewG, viewB]);
   var win = null;
   var inProcess = false;
   try {
      win = optCreateWindowLike(viewG, baseId || "Opt_RGB", 3, true);
      win.mainView.beginProcess(UndoFlag_NoSwapFile);
      inProcess = true;
      var pm = new PixelMath();
      pm.useSingleExpression = false;
      pm.expression = viewR.id;
      pm.expression1 = viewG.id;
      pm.expression2 = viewB.id;
      pm.executeOn(win.mainView);
      win.mainView.endProcess();
      inProcess = false;
      optCopyMetadata(win, metadataView || viewG);
      try { win.hide(); } catch (eHide) {}
      return win.mainView;
   } catch (e) {
      if (inProcess && win && !win.isNull) {
         try { win.mainView.endProcess(); } catch (eEnd) {}
      }
      if (win && !win.isNull) {
         try { win.forceClose(); } catch (eClose) {}
      }
      throw e;
   }
}

function optApplyLuminanceLRGB(rgbView, luminanceView) {
   optRequireSameGeometry("LRGB luminance application", [rgbView, luminanceView]);
   var lrgb = new LRGBCombination();
   lrgb.channels = [
      [true,  luminanceView.id, 1.0],
      [false, "", 1.0],
      [false, "", 1.0],
      [false, "", 1.0]
   ];
   lrgb.mL = 1.0;
   lrgb.mC = 1.0;
   lrgb.clipping = true;
   lrgb.noiseReduction = false;
   lrgb.layersCount = 5;
   var inProcess = false;
   try {
      rgbView.beginProcess(UndoFlag_NoSwapFile);
      inProcess = true;
      lrgb.executeOn(rgbView);
      rgbView.endProcess();
      inProcess = false;
   } catch (e) {
      if (inProcess) {
         try { rgbView.endProcess(); } catch (eEnd) {}
      }
      throw e;
   }
}

// =========================================================================
// LRGB-WEIGHT-BEGIN — Added 2026-05-18
// Feature: user-adjustable L blending weight (0%–200%) for R+G+B+L combine.
// UI: inline slider revealed by right-clicking the "L:" label, only when an
// L image is selected (auto-hides when L is set to None).
// To revert this feature, remove every block tagged // LRGB-WEIGHT-BEGIN ...
// // LRGB-WEIGHT-END throughout the file, plus the single-line marker:
//   - `this.luminanceWeight = 1.0;`  in PIWorkflowOptDialog constructor.
// Locations:
//   1. This helper block (LRGB-WEIGHT-BEGIN … LRGB-WEIGHT-END below).
//   2. Inline slider row block inside `buildMonoGroup` (~line 5996).
//   3. Two blocks inside `combineMono` (~line 6924) — RGB backup + post-blend.
//   4. Single line `this.luminanceWeight = 1.0;` in dialog constructor.
// =========================================================================
function optGetLuminanceWeight(dialog) {
   if (!dialog) return 1.0;
   var w = dialog.luminanceWeight;
   if (typeof w !== "number" || !isFinite(w)) return 1.0;
   if (w < 0.0) return 0.0;
   if (w > 2.0) return 2.0;
   return w;
}

function optLrgbWeightBlend(lrgbView, rgbBackupView, weight) {
   // PixelMath: $T = lrgb * w + rgb * (1 - w), clipped to [0,1].
   // weight = 1.0 → pure LRGB (no change). weight = 0.0 → pure RGB (no L).
   // weight > 1.0 extrapolates: amplifies L's effect beyond standard LRGB.
   var pm = new PixelMath();
   pm.expression = "$T*" + weight + " + " + rgbBackupView.id + "*(1-" + weight + ")";
   pm.useSingleExpression = true;
   pm.createNewImage = false;
   pm.rescale = false;
   pm.truncate = true;
   pm.truncateLower = 0.0;
   pm.truncateUpper = 1.0;
   var inProcess = false;
   try {
      lrgbView.beginProcess(UndoFlag_NoSwapFile);
      inProcess = true;
      pm.executeOn(lrgbView);
      lrgbView.endProcess();
      inProcess = false;
   } catch (e) {
      if (inProcess) try { lrgbView.endProcess(); } catch (eEnd) {}
      throw e;
   }
}

// =========================================================================
// LRGB-WEIGHT-END
// =========================================================================

function optRecipeChannels(recipe) {
   var r = (recipe || "SHO").toUpperCase();
   if (r === "HOO") return ["H", "O", "O"];
   if (r === "HSO") return ["H", "S", "O"];
   if (r === "HOS") return ["H", "O", "S"];
   if (r === "OSS") return ["O", "S", "S"];
   if (r === "OHH") return ["O", "H", "H"];
   if (r === "OSH") return ["O", "S", "H"];
   if (r === "OHS") return ["O", "H", "S"];
   if (r === "HSS") return ["H", "S", "S"];
   if (r === "REAL1") return ["H", "O", "S"];
   if (r === "REAL2") return ["O", "H", "S"];
   if (r === "FORAXX") return ["H", "O", "O"];
   return ["S", "H", "O"];
}

// =========================================================================
// DBXTRACT-BEGIN — Added 2026-05-18
// Invokes the external DBXtract.js script to extract Ha / OIII / SII from
// two dual-band RGB filter images (HO = Ha+OIII, SO = SII+OIII).
// Sensor=0 (no specific OSC sensor model), rgbCustomize=false (default
// extraction matrix). Returns the three extracted mono views by their
// canonical DBXtract IDs (_HA, _OIII, _SII). Throws if any output is missing.
// To revert: delete this block AND the DBXTRACT branch inside combineNb().
// =========================================================================
function optRunDBXtract(hoView, soView) {
   if (!optSafeView(hoView) || !optSafeView(soView))
      throw new Error("DBXtract requires both HO and OS source views.");
   // Script path. $PXI_SRCDIR resolves at preprocess time only, not at runtime,
   // so we hard-code the conventional install path.
   var dbxPath = "C:/Program Files/PixInsight/src/scripts/DBXtract/DBXtract.js";
   if (!File.exists(dbxPath))
      throw new Error("DBXtract.js not found at: " + dbxPath +
         "\nVerify the script is installed under PixInsight's src/scripts/DBXtract/.");
   // Populate the global Parameters object that DBXtract reads via Parameters.get*.
   Parameters.set("referenceHO",  hoView.id);
   Parameters.set("referenceSO",  soView.id);
   Parameters.set("sensor",       0);
   Parameters.set("rgbCustomize", false);
   Parameters.set("integracion",  0);
   Parameters.set("r1", 0.04); Parameters.set("r2", 0.8);
   Parameters.set("r3", 0.74); Parameters.set("r4", 0.04);
   Parameters.set("g1", 0.93); Parameters.set("g2", 0.11);
   Parameters.set("g3", 0.13); Parameters.set("g4", 0.67);
   Parameters.set("b1", 0.5);  Parameters.set("b2", 0.04);
   Parameters.set("b3", 0.05); Parameters.set("b4", 0.7);
   // Read DBXtract source and strip PJSR preprocessor directives so eval() can parse it:
   //   #include  → no-op comment       (we already #include the same .jsh files at top of this script)
   //   #feature-*→ no-op comment       (script-registration metadata, irrelevant at runtime)
   //   #define K V → var K = V;        (preprocessor macros become real JS constants)
   var code = File.readFile(dbxPath).toString();
   code = code.replace(/^[ \t]*#include[^\n\r]*$/gm,                "// stripped #include");
   code = code.replace(/^[ \t]*#feature-[^\n\r]*$/gm,                "// stripped #feature");
   code = code.replace(/^[ \t]*#define\s+(\w+)\s+(.+?)\s*$/gm,       "var $1 = $2;");
   try {
      // eval runs in this function's scope; DBXtract's globals (data, scriptMain, main, etc.)
      // become locals here and are GC'd when this function returns. main() at the bottom
      // of DBXtract reads Parameters → sees referenceHO/SO set → runs DBXtractStart(data)
      // directly without showing any dialog.
      eval(code);
   } catch (eEval) {
      throw new Error("DBXtract eval failed: " + (eEval && eEval.message ? eEval.message : eEval));
   }
   var ha   = View.viewById("_HA");
   var oiii = View.viewById("_OIII");
   var sii  = View.viewById("_SII");
   if (!optSafeView(ha) || !optSafeView(oiii) || !optSafeView(sii))
      throw new Error("DBXtract did not produce the expected output views (_HA / _OIII / _SII).");
   return { ha: ha, oiii: oiii, sii: sii };
}

// Closes every view DBXtract leaves in the workspace. Safe to call when only
// some of them exist (partial run after an error). Hard-coded against the
// view IDs declared in DBXtract.js (R_NAME, G_NAME, ..., SII_SH_NAME).
function optCloseDBXtractIntermediates() {
   var names = [
      "_R", "_G", "_B",                     // extracted RGB primary channels
      "_HA", "_OIII", "_SII", "_HB",        // extracted narrowband emission lines
      "OIII_HO", "OIII_SO", "SII_SO", "SII_SH"  // dual-band intermediate composites
   ];
   for (var i = 0; i < names.length; ++i) {
      try {
         var v = View.viewById(names[i]);
         if (optSafeView(v))
            optCloseView(v);
      } catch (eClose) {}
   }
}
// =========================================================================
// DBXTRACT-END
// =========================================================================


var OPT_NB_LINE_DB = {
   H: { id: "H", name: "H-alpha", shortName: "Ha", wavelength: 656.28, bandwidth: 7.0 },
   O: { id: "O", name: "OIII", shortName: "OIII", wavelength: 500.70, bandwidth: 7.0 },
   S: { id: "S", name: "SII", shortName: "SII", wavelength: 672.40, bandwidth: 7.0 }
};

function optNarrowbandLine(id) {
   var k = String(id || "").toUpperCase().charAt(0);
   if (k === "H" || k === "O" || k === "S")
      return OPT_NB_LINE_DB[k];
   return null;
}

function optIsNarrowbandRecipeName(text) {
   var r = String(text || "").toUpperCase();
   if (r === "SHO" || r === "HOO" || r === "HSO" || r === "HOS" || r === "OSS" ||
       r === "OHH" || r === "OSH" || r === "OHS" || r === "HSS" ||
       r === "REAL1" || r === "REAL2" || r === "FORAXX")
      return true;
   return false;
}

function optReadWorkflowKeyword(view, keywordName) {
   if (!optSafeView(view))
      return "";
   var wanted = String(keywordName || "").toUpperCase();
   try {
      var kw = view.window.keywords;
      for (var i = 0; i < kw.length; ++i) {
         var name = String(kw[i].name || "").toUpperCase();
         if (name === wanted) {
            var v = kw[i].strippedValue;
            if (typeof v === "undefined")
               v = kw[i].value;
            try { return String(v || "").replace(/^'|'$/g, "").replace(/^\s+|\s+$/g, ""); } catch (e0) { return ""; }
         }
      }
   } catch (e1) {}
   return "";
}

function optSetWorkflowKeyword(view, keywordName, value, comment) {
   if (!optSafeView(view))
      return false;
   try {
      if (typeof FITSKeyword === "undefined")
         return false;
      var wanted = String(keywordName || "").toUpperCase();
      var kwOld = [];
      try { kwOld = view.window.keywords; } catch (e0) { kwOld = []; }
      var kwNew = [];
      for (var i = 0; i < kwOld.length; ++i) {
         var name = String(kwOld[i].name || "").toUpperCase();
         if (name !== wanted)
            kwNew.push(kwOld[i]);
      }
      kwNew.push(new FITSKeyword(wanted, String(value || ""), String(comment || "")));
      view.window.keywords = kwNew;
      return true;
   } catch (e1) {}
   return false;
}

function optSetWorkflowProperty(view, propertyId, value) {
   if (!optSafeView(view))
      return false;
   try {
      if (typeof view.setPropertyValue === "function") {
         view.setPropertyValue(propertyId, value);
         return true;
      }
   } catch (e0) {}
   try {
      if (view.window && view.window.mainView && typeof view.window.mainView.setPropertyValue === "function") {
         view.window.mainView.setPropertyValue(propertyId, value);
         return true;
      }
   } catch (e1) {}
   return false;
}

function optAnnotateNarrowbandView(view, recipe, originText) {
   if (!optSafeView(view) || !optIsNarrowbandRecipeName(recipe))
      return;
   var channels = optRecipeChannels(recipe);
   optSetWorkflowKeyword(view, "PIWNB", "T", "PI Workflow narrowband RGB composite flag");
   optSetWorkflowKeyword(view, "PIWNBREC", String(recipe || "SHO").toUpperCase(), "PI Workflow narrowband palette");
   optSetWorkflowKeyword(view, "PIWNBR", channels[0], "PI Workflow red channel emission line");
   optSetWorkflowKeyword(view, "PIWNBG", channels[1], "PI Workflow green channel emission line");
   optSetWorkflowKeyword(view, "PIWNBB", channels[2], "PI Workflow blue channel emission line");
   optSetWorkflowProperty(view, "PIW:NB:Flag", true);
   optSetWorkflowProperty(view, "PIW:NB:Recipe", String(recipe || "SHO").toUpperCase());
   optSetWorkflowProperty(view, "PIW:NB:Channels", channels.join(""));
   console.writeln("=> Narrowband metadata: " + view.id + " tagged as " + String(recipe || "SHO").toUpperCase() + " (" + channels.join("/") + ")" + (originText ? " from " + originText : "") + ".");
}

function optWorkflowKeyForView(dialog, view) {
   if (!dialog || !dialog.store || !optSafeView(view))
      return "";
   try {
      if (dialog.preTab && dialog.preTab.preview && optSafeView(dialog.preTab.preview.currentView) && dialog.preTab.preview.currentView.id === view.id)
         return dialog.preTab.preview.currentKey || "";
   } catch (e0) {}
   try {
      if (dialog.stretchTab && dialog.stretchTab.preview && optSafeView(dialog.stretchTab.preview.currentView) && dialog.stretchTab.preview.currentView.id === view.id)
         return dialog.stretchTab.preview.currentKey || "";
   } catch (e1) {}
   try {
      if (dialog.ccTab && dialog.ccTab.preview && optSafeView(dialog.ccTab.preview.currentView) && dialog.ccTab.preview.currentView.id === view.id)
         return dialog.ccTab.preview.currentKey || "";
   } catch (e2) {}
   try {
      if (dialog.postTab && dialog.postTab.preview && optSafeView(dialog.postTab.preview.currentView) && dialog.postTab.preview.currentView.id === view.id)
         return dialog.postTab.preview.currentKey || "";
   } catch (e3) {}
   try {
      for (var key in dialog.store.records) {
         if (!optHasOwn(dialog.store.records, key))
            continue;
         var rec = dialog.store.records[key];
         if (rec && optSafeView(rec.view) && rec.view.id === view.id)
            return key;
      }
   } catch (e4) {}
   return "";
}

function optNarrowbandRecipeFromView(view, dialog, explicitKey) {
   var rec = optReadWorkflowKeyword(view, "PIWNBREC");
   if (optIsNarrowbandRecipeName(rec))
      return rec.toUpperCase();
   var prop = optSafeViewProperty(view, "PIW:NB:Recipe");
   try {
      if (prop != null && optIsNarrowbandRecipeName(prop.toString()))
         return prop.toString().toUpperCase();
   } catch (e0) {}
   try {
      var id = String(view.id || "").toUpperCase();
      var marker = "NB_RGB_";
      var p = id.indexOf(marker);
      if (p >= 0) {
         var tail = id.substr(p + marker.length).replace(/[^A-Z0-9].*$/, "");
         if (optIsNarrowbandRecipeName(tail))
            return tail;
      }
   } catch (e1) {}
   var key = String(explicitKey || "").toUpperCase();
   if (key === "HSO") {
      var chosen = "SHO";
      try { chosen = dialog.selectedRecipe || "SHO"; } catch (e2) {}
      if (optIsNarrowbandRecipeName(chosen))
         return String(chosen).toUpperCase();
      return "SHO";
   }
   if (optIsNarrowbandRecipeName(key))
      return key;
   return "";
}

function optNarrowbandProfileFromRecipe(recipe) {
   if (!optIsNarrowbandRecipeName(recipe))
      return null;
   var channels = optRecipeChannels(recipe);
   var r = optNarrowbandLine(channels[0]);
   var g = optNarrowbandLine(channels[1]);
   var b = optNarrowbandLine(channels[2]);
   if (!r || !g || !b)
      return null;
   return {
      isNarrowband: true,
      isMono: false,
      recipe: String(recipe || "SHO").toUpperCase(),
      channels: channels,
      linesRGB: [r, g, b],
      description: String(recipe || "SHO").toUpperCase() + " (" + r.shortName + "/" + g.shortName + "/" + b.shortName + ")"
   };
}

function optNarrowbandProfileFromMonoKey(key) {
   var k = String(key || "").toUpperCase();
   if (k === "H" || k === "O" || k === "S") {
      var line = optNarrowbandLine(k);
      return {
         isNarrowband: true,
         isMono: true,
         recipe: k,
         channels: [k],
         monoLine: line,
         linesRGB: [line, line, line],
         description: line.shortName + " mono"
      };
   }
   return null;
}

function optGetNarrowbandProfileForView(view, dialog, explicitKey) {
   if (!optSafeView(view))
      return null;
   var key = String(explicitKey || "").toUpperCase();
   if (!key || key.length < 1)
      key = optWorkflowKeyForView(dialog, view);
   var mono = optNarrowbandProfileFromMonoKey(key);
   if (mono)
      return mono;
   var recipe = optNarrowbandRecipeFromView(view, dialog, key);
   if (recipe)
      return optNarrowbandProfileFromRecipe(recipe);
   return null;
}

function optProcessParameterSetCount(P, propertyNames, value) {
   return optSetOptionalProcessProperty(P, propertyNames, value) ? 1 : 0;
}

function optApplyNarrowbandLineToProcess(P, channelTags, line) {
   if (!P || !line)
      return 0;
   var count = 0;
   for (var i = 0; i < channelTags.length; ++i) {
      var c = channelTags[i];
      count += optProcessParameterSetCount(P, [
         c + "FilterName", c + "Filter", c + "FilterId", c + "filterName", c + "filter",
         c + "NarrowbandFilter", c + "narrowbandFilter"
      ], line.name);
      count += optProcessParameterSetCount(P, [
         c + "FilterWavelength", c + "Wavelength", c + "CentralWavelength", c + "CenterWavelength",
         c + "filterWavelength", c + "wavelength", c + "centralWavelength", c + "centerWavelength"
      ], line.wavelength);
      count += optProcessParameterSetCount(P, [
         c + "FilterBandwidth", c + "Bandwidth", c + "FWHM", c + "filterBandwidth", c + "bandwidth", c + "fwhm"
      ], line.bandwidth);
   }
   return count;
}

function optApplyNarrowbandProcessParameters(P, profile, processName, guiConfiguredIcon) {
   if (!P || !profile || !profile.isNarrowband)
      return 0;
   var count = 0;
   count += optProcessParameterSetCount(P, ["narrowbandMode", "narrowBandMode", "useNarrowband", "narrowband", "NarrowbandMode"], true);
   var modeParam = optSetOptionalProcessProperty(P, ["workingMode", "WorkingMode", "calibrationMode", "CalibrationMode", "filterMode", "FilterMode"], "Narrowband");
   if (modeParam)
      ++count;
   else
      count += optProcessParameterSetCount(P, ["workingMode", "WorkingMode", "calibrationMode", "CalibrationMode", "filterMode", "FilterMode"], 1);
   count += optProcessParameterSetCount(P, ["palette", "Palette", "narrowbandPalette", "NarrowbandPalette"], profile.recipe);

   var r = profile.linesRGB[0], g = profile.linesRGB[1], b = profile.linesRGB[2];
   count += optApplyNarrowbandLineToProcess(P, ["red", "Red", "R", "channel0", "Channel0", "channel1", "Channel1"], r);
   count += optApplyNarrowbandLineToProcess(P, ["green", "Green", "G", "channel2", "Channel2"], g);
   count += optApplyNarrowbandLineToProcess(P, ["blue", "Blue", "B", "channel3", "Channel3"], b);

   if (profile.isMono && profile.monoLine) {
      count += optProcessParameterSetCount(P, ["filterName", "FilterName", "narrowbandFilterName", "NarrowbandFilterName"], profile.monoLine.name);
      count += optProcessParameterSetCount(P, ["filterWavelength", "FilterWavelength", "centralWavelength", "CentralWavelength", "wavelength", "Wavelength"], profile.monoLine.wavelength);
      count += optProcessParameterSetCount(P, ["filterBandwidth", "FilterBandwidth", "bandwidth", "Bandwidth", "fwhm", "FWHM"], profile.monoLine.bandwidth);
   }

   if (count > 0)
      console.writeln("=> " + processName + ": narrowband profile applied: " + profile.description + " (" + count + " process parameter assignments).");
   else if (guiConfiguredIcon === true)
      console.writeln("=> " + processName + ": narrowband profile handled by configured process icon for " + profile.description + "; this PixInsight build did not expose scriptable NB filter parameters.");
   else
      console.warningln("=> " + processName + ": narrowband profile detected (" + profile.description + "), but this process instance exposes no known scriptable NB parameters. Use a configured " + processName + "_NB icon if your PixInsight build requires GUI-only filter selection.");
   return count;
}

function optGetSPFCProcessForProfile(profile) {
   if (profile && profile.isNarrowband) {
      if (profile.isMono && profile.monoLine) {
         var monoIcon = "SPFC_" + profile.monoLine.id;
         var mono = optGetProcessIconInstance(monoIcon, "SpectrophotometricFluxCalibration", true);
         if (mono != null) {
            console.writeln("=> Running user-configured '" + monoIcon + "' process icon for " + profile.description + ".");
            return mono;
         }
      }
      var nb = optGetProcessIconInstance("SPFC_NB", "SpectrophotometricFluxCalibration", true);
      if (nb != null) {
         console.writeln("=> Running user-configured 'SPFC_NB' process icon for " + profile.description + ".");
         return nb;
      }
   }
   var spfc = optGetProcessIconInstance("SPFC", "SpectrophotometricFluxCalibration");
   if (spfc != null)
      console.writeln("=> Running user-configured 'SPFC' process icon.");
   return spfc;
}

function optGetSPCCProcessForProfile(profile) {
   OPT_LAST_SPCC_GUI_NB_ICON = false;
   if (profile && profile.isNarrowband) {
      var nb = optGetProcessIconInstance("SPCC_NB", "SpectrophotometricColorCalibration", true);
      if (nb != null) {
         console.writeln("=> Running user-configured 'SPCC_NB' process icon for " + profile.description + ".");
         OPT_LAST_SPCC_GUI_NB_ICON = true;
         return nb;
      }
   }
   return new SpectrophotometricColorCalibration();
}

function optGetMGCProcessForProfile(profile) {
   if (profile && profile.isNarrowband) {
      var nb = optGetProcessIconInstance("MGC_NB", "MultiscaleGradientCorrection", true);
      if (nb != null) {
         console.writeln("=> Running user-configured 'MGC_NB' process icon for " + profile.description + ".");
         return { process: nb, guiConfiguredIcon: true };
      }
   }
   var mgc = optGetProcessIconInstance("MGC", "MultiscaleGradientCorrection");
   if (mgc != null)
      console.writeln("=> Running user-configured 'MGC' process icon.");
   return { process: mgc, guiConfiguredIcon: false };
}

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
   try { processEvents(); } catch (e0) {}
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
   return optHasAutoDBERuntime() || optEnsureAutoDBESupportLoaded();
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
      for (var y = 0; y < sz; ++y) {
         for (var x = 0; x < sz; ++x) {
            var dx = x - cx;
            var dy = y - cy;
            var r = Math.sqrt(dx * dx + dy * dy);
            if (r > outer || r < inner) {
               img.setSample(0.06, x, y, 0);
               img.setSample(0.06, x, y, 1);
               img.setSample(0.07, x, y, 2);
               continue;
            }
            var hue = (northZero === true ? Math.atan2(dx, -dy) : Math.atan2(dy, dx)) / (2.0 * Math.PI);
            if (hue < 0.0)
               hue += 1.0;
            var sat = optClamp01((r - inner) / Math.max(1.0e-6, outer - inner));
            var rgb = optHsvToRgb(hue, sat, 1.0);
            img.setSample(rgb.r, x, y, 0);
            img.setSample(rgb.g, x, y, 1);
            img.setSample(rgb.b, x, y, 2);
         }
      }
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

function optDependencyProcessExists(processName) {
   try {
      return typeof this[processName] === "function";
   } catch (e0) {
   }
   try {
      return eval("typeof " + processName + " === 'function'");
   } catch (e1) {
   }
   return false;
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
      return optDependencyStatus(def.id, def.label, def.group, "ok", def.okSummary || "Runtime disponible.", def.okDetail || "");
   return optDependencyStatus(def.id, def.label, def.group, def.missingSeverity || "error", def.missingSummary || "Runtime incompleto.", def.missingDetail || "");
}

function optDependencyCheckProcess(def) {
   var processName = def.processName || def.label;
   if (optDependencyProcessExists(processName))
      return optDependencyStatus(def.id, def.label, def.group, "ok", def.okSummary || "Proceso disponible.", def.okDetail || (processName + " esta instalado en la build de PixInsight que esta corriendo."));
   return optDependencyStatus(def.id, def.label, def.group, def.missingSeverity || "warn", def.missingSummary || "Proceso no instalado.", def.missingDetail || (processName + " no esta disponible como proceso scriptable en la build de PixInsight que esta corriendo."));
}

function optDependencyCheckProcessIcon(def) {
   var processStatus = optDependencyCheckProcess(def);
   if (processStatus.severity !== "ok")
      return processStatus;
   var P = optGetProcessIconInstanceSilent(def.iconId, def.processName);
   if (P)
      return optDependencyStatus(def.id, def.label, def.group, "ok", def.iconOkSummary || "Icono encontrado.", def.iconOkDetail || ("El icono '" + def.iconId + "' existe y pertenece a " + def.processName + "."));
   return optDependencyStatus(def.id, def.label, def.group, def.iconMissingSeverity || "warn", def.iconMissingSummary || "Icono ausente.", def.iconMissingDetail || ("No existe un icono de proceso '" + def.iconId + "' configurado para " + def.processName + "."));
}

function optDependencyCheckScript(def) {
   var loaded = false;
   try {
      loaded = (typeof def.runtime === "function" && def.runtime());
   } catch (e0) {
      loaded = false;
   }
   if (loaded)
      return optDependencyStatus(def.id, def.label, def.group, "ok", def.loadedSummary || "Script cargado.", def.loadedDetail || (def.label + " ya esta disponible en el runtime de PixInsight."));
   var path = "";
   try {
      path = optFindFirstExistingCandidatePath(typeof def.paths === "function" ? def.paths() : (def.paths || []));
   } catch (e1) {
      path = "";
   }
   if (path && path.length > 0)
      return optDependencyStatus(def.id, def.label, def.group, "ok", def.installedSummary || "Script instalado.", (def.installedDetail || (def.label + " existe en el arbol de scripts de la instalacion de PixInsight que esta corriendo: ")) + path + ".");
   return optDependencyStatus(def.id, def.label, def.group, def.missingSeverity || "warn", def.missingSummary || "Script no instalado.", def.missingDetail || ("No se ha encontrado " + def.label + " en el arbol de scripts de la instalacion de PixInsight que esta corriendo."));
}

function optDependencyCheckExternalRuntime(def) {
   if (typeof def.runtime === "function" && def.runtime())
      return optDependencyStatus(def.id, def.label, def.group, "ok", def.okSummary || "Runtime disponible.", def.okDetail || "");
   return optDependencyStatus(def.id, def.label, def.group, def.missingSeverity || "warn", def.missingSummary || "Runtime no disponible.", def.missingDetail || "");
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
               okSummary: "Runtime cargado.",
               okDetail: "ImageSolver, ImageMetadata y ObjectWithSettings estan disponibles.",
               missingSeverity: "error",
               missingSummary: "Runtime incompleto.",
               missingDetail: "Falta parte del stack AdP necesario para Plate Solving y SPCC."
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
               missingSummary: "Proceso no instalado.",
               missingDetail: "SpectrophotometricFluxCalibration no esta disponible como proceso scriptable en la build de PixInsight que esta corriendo.",
               iconOkDetail: "El icono 'SPFC' existe. La ruta Gaia/QE/filtros se validara al ejecutar SPFC.",
               iconMissingDetail: "MGC necesita un icono 'SPFC' real y configurado con Gaia/QE/filtros."
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
               missingSummary: "Proceso no instalado.",
               missingDetail: "MultiscaleGradientCorrection no esta disponible como proceso scriptable en la build de PixInsight que esta corriendo.",
               iconOkDetail: "El icono 'MGC' existe. La referencia MARS/.xmars se validara al ejecutar MGC.",
               iconMissingDetail: "MGC necesita un icono 'MGC' configurado con su referencia MARS/.xmars o imagen de referencia."
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
               installedDetail: "AutoDBE existe en el arbol de scripts de la instalacion de PixInsight que esta corriendo: ",
               missingDetail: "No se ha encontrado AutoDBE en el arbol de scripts de la instalacion de PixInsight que esta corriendo."
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
               return optDependencyStatus("graxpert", "GraXpert", "Pre/Post", "ok", "Proceso nativo disponible.", "GraXpert esta disponible como proceso nativo de PixInsight; Opt_6d lo usa para Background Extraction y GraXpert Denoise.");
            if (info.scriptLoaded)
               return optDependencyStatus("graxpert", "GraXpert", "Pre/Post", "warn", "Toolbox heredado cargado.", "GraXpertLib esta disponible para el fallback de Background Extraction, pero GraXpert Denoise requiere el proceso nativo en Process > Etc.");
            return optDependencyCheckScript({
               id: "graxpert",
               label: "GraXpert",
               group: "Pre",
               runtime: function() { return typeof GraXpertLib !== "undefined"; },
               paths: optGraXpertLibCandidatePaths,
               installedSummary: "Toolbox instalado.",
               installedDetail: "GraXpertLib existe en el arbol de scripts de la instalacion de PixInsight que esta corriendo: ",
               missingSummary: "Toolbox no instalado.",
               missingDetail: "No se ha encontrado GraXpertLib en el arbol de scripts ni GraXpert como proceso nativo de la instalacion de PixInsight que esta corriendo."
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
               missingDetail: "BlurXTerminator no esta disponible como proceso scriptable en la build de PixInsight que esta corriendo."
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
               okSummary: "Lanzador disponible.",
               okDetail: "ExternalProcess esta disponible. Cosmic Clarity usa un ejecutable externo, no un proceso/script instalado dentro de PixInsight; el ejecutable se validara al ejecutar.",
               missingSummary: "Lanzador no disponible.",
               missingDetail: "ExternalProcess no esta disponible en esta build de PixInsight."
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
               missingDetail: "StarXTerminator no esta disponible como proceso scriptable en la build de PixInsight que esta corriendo. El split Stars/Starless caera al fallback estructural."
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
               missingDetail: "MultiscaleAdaptiveStretch no esta disponible como proceso scriptable en la build de PixInsight que esta corriendo."
            });
         }
      },
      {
         id: "veralux",
         label: "VeraLux",
         group: "Stretch",
         check: function() {
            var info = optGetVeraLuxSupportInfo();
            if (info.process === true)
               return optDependencyStatus("veralux", "VeraLux", "Stretch", "ok", "Proceso disponible.", "VeraLux esta disponible como proceso nativo/scriptable de PixInsight.");
            return optDependencyCheckScript({
               id: "veralux",
               label: "VeraLux",
               group: "Stretch",
               runtime: function() { return optResolveVeraLuxProcessFunction() != null; },
               paths: optVeraLuxCandidatePaths,
               installedDetail: "VeraLux existe en el arbol de scripts de la instalacion de PixInsight que esta corriendo: ",
               missingDetail: "No se ha encontrado VeraLux en el arbol de scripts de la instalacion de PixInsight que esta corriendo."
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
               missingDetail: "NoiseXTerminator no esta disponible como proceso scriptable. Post Noise Reduction ofrecera TGVDenoise o fallback estructural en TEST_MODE."
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
               return optDependencyStatus("post_sharpen_processes", "Post sharpening processes", "Post", "ok", "Procesos disponibles.", "UnsharpMask, HDRMultiscaleTransform y LocalHistogramEqualization estan disponibles.");
            return optDependencyStatus("post_sharpen_processes", "Post sharpening processes", "Post", "warn", "Procesos incompletos.", "Faltan procesos opcionales: " + missing.join(", ") + ".");
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
   lines.push("Version: " + OPT_VERSION);
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

// Snapshot the dialog state needed by a Pre-tab candidate as a plain object.
// SPCC / Auto Linear Fit / Background Neutralization remain coupled to the
// dialog at execution time (the guide's known scope limit), so cfg only
// carries the gradient/decon details — the rest of the branches still pass
// `dialog` through to the existing workflows.
function optBuildPreCandidateConfig(dialog, actionKey) {
   var cfg = { actionKey: actionKey || "" };
   if (cfg.actionKey === "gradient") {
      var hasComboGradient = dialog && optHasOwn(dialog, "comboPreGradient") && dialog.comboPreGradient;
      cfg.gradient = {
         algorithmIndex: hasComboGradient ? dialog.comboPreGradient.currentItem : 0,
         label: hasComboGradient ? optComboText(dialog.comboPreGradient, "Gradient Correction") : "Gradient Correction"
      };
   } else if (cfg.actionKey === "decon") {
      var hasComboDecon = dialog && optHasOwn(dialog, "comboPreDecon") && dialog.comboPreDecon;
      cfg.decon = {
         algorithmIndex: hasComboDecon ? dialog.comboPreDecon.currentItem : 0,
         label: hasComboDecon ? optComboText(dialog.comboPreDecon, "BlurXTerminator") : "BlurXTerminator",
         blurX: optBuildPreBlurXConfigFromControls(dialog),
         cosmicClarity: optBuildPreCosmicClarityConfig(dialog)
      };
   }
   return cfg;
}

function optApplyPreCandidate(view, actionKey, dialog) {
   if (!optSafeView(view))
      throw new Error("No valid candidate view.");
   var cfg = (actionKey && typeof actionKey === "object") ? actionKey : optBuildPreCandidateConfig(dialog, actionKey);
   actionKey = cfg.actionKey || "";
   if (actionKey === "gradient") {
      console.writeln("=> Pre Gradient Correction preview path: " + cfg.gradient.label);
      return optExecuteGradientCorrectionForView(view, dialog);
   }
   if (actionKey === "decon") {
      console.writeln("=> Pre Deconvolution preview path: " + cfg.decon.label);
      if (cfg.decon.algorithmIndex === 1) {
         if (!optIsCosmicClarityAvailable())
            throw new Error("Cosmic Clarity: ExternalProcess not available in this PixInsight build.");
         return optRunCosmicClarityOnView(view, cfg.decon.cosmicClarity);
      }
      return optExecuteBlurXConfiguredOnView(view, cfg.decon.blurX);
   }
   if (actionKey === "spcc") {
      console.writeln("=> Pre Color Calibration preview path: SPCC.");
      return optRunSPCCCompatibleWorkflow(view, dialog);
   }
   if (actionKey === "alf") {
      console.writeln("=> Pre Color Calibration preview path: Auto Linear Fit.");
      return optRunAutoLinearFitWorkflow(view);
   }
   if (actionKey === "bn") {
      console.writeln("=> Pre Color Calibration preview path: Background Neutralization.");
      return optRunBackgroundNeutralization(view);
   }
   return optApplyFallbackTransform(view, "lift", 0.05);
}

function optHasAstrometricSolution(view) {
   if (!optSafeView(view))
      return false;
   try {
      if (view.id && optHasOwn(OPT_SYNTHETIC_WCS_IDS, view.id) && OPT_SYNTHETIC_WCS_IDS[view.id] === true)
         return true;
   } catch (eSynthetic0) {}
   try {
      var projection = optSafeViewProperty(view, "PCL:AstrometricSolution:ProjectionSystem");
      if (projection != null && projection !== undefined) {
         var projectionText = "";
         try { projectionText = projection.toString(); } catch (e0) { projectionText = "" + projection; }
         if (projectionText != null && projectionText.length > 0)
            return true;
      }
   } catch (e0) {}
   try {
      var kw = view.window.keywords;
      for (var i = 0; i < kw.length; ++i) {
         var name = (kw[i].name || "").toUpperCase();
         if (name === "CTYPE1" || name === "CRVAL1" || name === "CD1_1" || name === "PC1_1")
            return true;
      }
   } catch (e1) {}
   return false;
}

function optSafeViewProperty(view, propertyId) {
   if (!optSafeView(view))
      return null;
   try {
      return view.propertyValue(propertyId);
   } catch (e0) {}
   try {
      return view.window.mainView.propertyValue(propertyId);
   } catch (e1) {}
   return null;
}

// Copy a source window's FITS keywords onto a target window, EXCLUDING the
// WCS-related ones (CRPIX1/2, CRVAL, CD/PC matrix, CTYPE, PV, CDELT, CROTA,
// LONPOLE, LATPOLE, RADESYS, EQUINOX, EPOCH). The exclusion exists so PI
// doesn't auto-build an AstrometricMetadata on the target from a partial
// keyword set — that build path triggers
// "AstrometricMetadata::Write(): Incompatible image dimensions" whenever
// the source view has been cropped (CRPIX shifted but the cached
// AstrometricSolution::Information blob no longer matches dims). The
// caller decides whether to also copy the astrometric solution via
// optCopyAstrometricSolution; if so, that function carries the WCS over
// in a dimension-safe way (and skips if the source has no Information).
// Use this helper everywhere we'd otherwise assign sourceWindow.keywords
// blindly across window boundaries.
function optCopyKeywordsExcludingWCS(targetWindow, sourceWindow) {
   try {
      if (!targetWindow || targetWindow.isNull) return false;
      if (!sourceWindow || sourceWindow.isNull) return false;
      var src = sourceWindow.keywords;
      if (!src || !src.length) return false;
      var filtered = [];
      for (var i = 0; i < src.length; ++i) {
         var nm = (src[i].name || "").toUpperCase();
         if (OPT_CROP_WCS_KEYWORDS_PIXELSHIFT[nm]) continue;
         if (OPT_CROP_WCS_KEYWORDS_PRESERVE[nm]) continue;
         filtered.push(src[i]);
      }
      targetWindow.keywords = filtered;
      return true;
   } catch (e) {}
   return false;
}

function optCopyAstrometricSolution(targetWindow, sourceWindow) {
   try {
      if (!targetWindow || targetWindow.isNull) return false;
      if (!sourceWindow || sourceWindow.isNull) return false;
      if (typeof targetWindow.copyAstrometricSolution !== "function") return false;

      // PixInsight's copyAstrometricSolution requires the source view to
      // carry a complete AstrometricMetadata, which is serialized in the
      // PCL:AstrometricSolution:Information property. Without it, the call
      // throws "*** Error: AstrometricMetadata::Write(): Incompatible image
      // dimensions" because PI tries (and fails) to rebuild metadata from
      // the partial PCL properties / FITS keywords and then validate it
      // against the target's dimensions. This is the exact scenario after
      // optCropApplyToView, which deliberately drops Information /
      // SplineWorldTransformation to avoid leaving stale W×H on the view.
      // Skip silently in that case — the caller can plate-solve the
      // target later if astrometry on the new view is required.
      var hasInformation = false;
      try {
         var v = sourceWindow.mainView;
         if (v && !v.isNull) {
            var info = v.propertyValue("PCL:AstrometricSolution:Information");
            hasInformation = (info !== undefined && info !== null);
         }
      } catch (eInfo) {}
      if (!hasInformation) return false;

      return targetWindow.copyAstrometricSolution(sourceWindow);
   } catch (e) {}
   return false;
}

function optExecuteSilently(action) {
   var originalWriteln = console.writeln;
   var originalWrite = console.write;
   var isMuted = false;
   try { console.writeln = function() {}; console.write = function() {}; isMuted = true; } catch (e0) {}
   try { action(); } catch (e1) {
      if (isMuted) {
         console.writeln = originalWriteln;
         console.write = originalWrite;
         isMuted = false;
      }
      throw e1;
   } finally {
      if (isMuted) {
         console.writeln = originalWriteln;
         console.write = originalWrite;
      }
   }
}

function optKillDiagnostics() {
   var trashWindows = ["stars", "matches", "distortion"];
   for (var i = 0; i < trashWindows.length; ++i) {
      var win = ImageWindow.windowById(trashWindows[i]);
      if (win != null && !win.isNull)
         win.forceClose();
   }
}

function optPrepareWindowForInteractiveImageSolver(window, contextLabel) {
   if (!window || window.isNull)
      return false;
   try { window.show(); } catch (e0) {}
   try { window.bringToFront(); } catch (e1) {}
   try { window.zoomToOptimalFit(); } catch (e2) {}
   try { window.currentView = window.mainView; } catch (e3) {}
   if (window.mainView && !window.mainView.isNull)
      console.writeln("=> Preparing ImageSolver on " + contextLabel + " [" + window.mainView.id + "].");
   return true;
}

function optSolveAstrometryOnWindow(window, contextLabel) {
   if (!window || window.isNull)
      return false;

   if (OPT_TEST_MODE) {
      optMarkSyntheticSolved(window);
      console.writeln("=> PI_Workflow_Opt TEST MODE: synthetic astrometric solution granted for " + contextLabel + ".");
      return true;
   }

   optPrepareWindowForInteractiveImageSolver(window, contextLabel);

   if (!optHasAdpSolverRuntime())
      throw new Error("ImageSolver/AdP runtime is not fully available in this PixInsight installation.");

   // Drop dim-dependent astrometric properties that may linger from a
   // previous solve / crop / session. If the view's image dimensions
   // don't match what these blobs encode, ImageSolver's internal
   // AstrometricMetadata::Write fails with "Incompatible image dimensions"
   // before our solve even starts. Letting it rebuild from scratch is the
   // safe path — the FITS keywords (CRPIX / CRVAL / CD / CTYPE / ...)
   // remain untouched and feed ImageSolver's initial estimate.
   try {
      if (window.mainView && !window.mainView.isNull) {
         for (var dSolve = 0; dSolve < OPT_CROP_WCS_PROPERTIES_STALE_AFTER_CROP.length; ++dSolve) {
            try { window.mainView.deleteProperty(OPT_CROP_WCS_PROPERTIES_STALE_AFTER_CROP[dSolve]); }
            catch (eDelSolve) {}
         }
      }
   } catch (eSolvePre) {}

   var solver = new ImageSolver();
   solver.Init(window, false);
   try { solver.solverCfg.distortionCorrection = true; } catch (e0) {}
   try { solver.solverCfg.rbfType = RBFType_DDMThinPlateSpline; } catch (e1) {}

   var metadata = null;
   try {
      if (solver.metadata)
         metadata = solver.metadata;
   } catch (e2) {}
   if (metadata == null) {
      try {
         metadata = new ImageMetadata();
         metadata.ExtractMetadata(window);
      } catch (e3) {}
   }
   try {
      if (metadata != null)
         solver.metadata = metadata;
   } catch (e4) {}

   var solved = false;
   try {
      optExecuteSilently(function() { solved = solver.SolveImage(window); });
   } catch (eAuto) {
      console.warningln("=> Automatic ImageSolver attempt failed on " + contextLabel + ": " + eAuto.message);
      solved = false;
   }
   optKillDiagnostics();

   try {
      if (solved && window.mainView && !window.mainView.isNull && optHasAstrometricSolution(window.mainView)) {
         console.writeln("=> ImageSolver automatic solve OK on " + contextLabel + ".");
         return true;
      }
   } catch (eCheck) {}

   console.warningln("=> Automatic astrometric solve did not succeed for " + contextLabel + ". Opening the ImageSolver dialog...");

   // Try to build minimal metadata if missing, so the dialog can open
   if (metadata == null) {
      console.warningln("=> No image metadata for " + contextLabel + ". Attempting to create minimal metadata.");
      try {
         metadata = new ImageMetadata();
         metadata.ExtractMetadata(window);
      } catch (eMetaRetry) {}
   }
   if (metadata == null) {
      try { metadata = new ImageMetadata(); } catch (eMetaEmpty) {}
   }

   var accepted = true;
   var dialogOpened = false;

   if (typeof ImageSolverDialog === "function" && metadata != null) {
      try {
         var dlgSolver = new ImageSolverDialog(solver.solverCfg, metadata, true);
         dialogOpened = true;
         accepted = dlgSolver.execute();

         if (accepted) {
            try {
               solver.solverCfg = dlgSolver.solverCfg;
               console.writeln("=> ImageSolver dialog configuration synced back to solver.");
            } catch (eSyncCfg) {
               console.warningln("=> Could not sync ImageSolver configuration from dialog: " + eSyncCfg.message);
            }
         }
      } catch (eDlg) {
         console.warningln("=> ImageSolver dialog could not be opened: " + eDlg.message);
         dialogOpened = false;
      }
   } else {
      if (typeof ImageSolverDialog !== "function")
         console.warningln("=> ImageSolverDialog is not available in this PixInsight installation.");
      if (metadata == null)
         console.warningln("=> metadata is null — cannot open ImageSolverDialog.");
   }

   if (dialogOpened && !accepted) {
      console.warningln("=> ImageSolver was cancelled for " + contextLabel + ".");
      return false;
   }

   solved = false;
   try {
      optExecuteSilently(function() { solved = solver.SolveImage(window); });
   } catch (eSolve) {
      console.warningln("=> ImageSolver threw an error during manual solve on " + contextLabel + ": " + eSolve.message);
      solved = false;
   }
   optKillDiagnostics();

   try {
      if (solved && window.mainView && !window.mainView.isNull && optHasAstrometricSolution(window.mainView)) {
         console.writeln("=> ImageSolver OK on " + contextLabel + ".");
         return true;
      }
   } catch (eCheck2) {}

   console.warningln("=> ImageSolver could not solve " + contextLabel + ".");
   return false;
}

function optVeraLuxAvailable() {
   return (optResolveVeraLuxProcessFunction() != null) || optEnsureVeraLuxSupportLoaded() || optHasVeraLuxProcess();
}

function optWindowArrayContainsView(windows, view) {
   if (!windows || !optSafeView(view))
      return false;
   for (var i = 0; i < windows.length; ++i)
      if (windows[i] && !windows[i].isNull && windows[i].mainView && !windows[i].mainView.isNull && windows[i].mainView.id === view.id)
         return true;
   return false;
}

function optIsBackgroundResidualViewId(viewId) {
   var id = "";
   try { id = String(viewId || "").toLowerCase(); } catch (e0) { id = ""; }
   return id.indexOf("background") >= 0 ||
          id.indexOf("bkg") >= 0 ||
          id.indexOf("model") >= 0 ||
          id.indexOf("gradient") >= 0 ||
          id.indexOf("residual") >= 0;
}

function optRunSPFCForMGC(targetView, dlg) {
   if (optHasSPFCScaleFactors(targetView))
      return true;
   if (typeof SpectrophotometricFluxCalibration === "undefined")
      throw new Error("[SPFC/AVAILABILITY] SpectrophotometricFluxCalibration is not available in this PixInsight installation.");
   var profile = optGetNarrowbandProfileForView(targetView, dlg, dlg && dlg.preTab && dlg.preTab.preview ? dlg.preTab.preview.currentKey : "");
   var spfc = optGetSPFCProcessForProfile(profile);
   if (spfc == null) {
      if (profile && profile.isNarrowband)
         throw new Error("[SPFC/PARAMETERS] No suitable SPFC icon was found for " + profile.description + ". Create 'SPFC_NB' for RGB narrowband composites or 'SPFC_H'/'SPFC_O'/'SPFC_S' for mono channels, or configure the generic 'SPFC' icon with matching filters.");
      throw new Error("[SPFC/PARAMETERS] The 'SPFC' icon was not found. Create a real configured 'SPFC' process icon or run SPFC manually before using MGC.");
   }
   optApplyNarrowbandProcessParameters(spfc, profile, "SPFC");
   var ok = false;
   var beforeMap = optCaptureOpenWindowIdMap();
   var protectedIds = {};
   protectedIds[targetView.id] = true;
   optSuppressSPFCAuxiliaryOutputs(spfc);
   try {
      ok = spfc.executeOn(targetView);
   } catch (e0) {
      var msg = e0.message || "";
      var low = msg.toLowerCase();
      if (low.indexOf("parsing csv spectrum parameter") >= 0)
         throw new Error("[SPFC/PARAMETERS] SPFC is not configured correctly. " + msg + "\nCheck the SPFC icon: QE curve and filters. For narrowband data, use SPFC_NB or SPFC_H/SPFC_O/SPFC_S icons with Ha/OIII/SII filters.");
      if (low.indexOf("gaia") >= 0 || low.indexOf("xpsd") >= 0 || low.indexOf("spectrum wavelength table") >= 0)
         throw new Error("[SPFC/GAIA] SPFC could not access the configured Gaia DR3/SP resources. " + msg + "\nCheck the Gaia DR3/SP database path configured in PixInsight and in the selected SPFC icon.");
      throw new Error("[SPFC/EXECUTION] " + msg);
   } finally {
      optCloseAuxiliaryProcessWindows(beforeMap, protectedIds, "SPFC");
   }
   if (!ok)
      throw new Error("[SPFC/EXECUTION] SPFC returned false before completing execution.\nCheck the selected SPFC icon and its external resources: Gaia DR3/SP database path, QE curve, and broadband or narrowband filters.");
   if (!optHasSPFCScaleFactors(targetView))
      throw new Error("[SPFC/METADATA] SPFC finished but did not generate valid PCL:SPFC:ScaleFactors.");
   return true;
}

function optClassifyMGCError(errorMessage) {
   var msg = (errorMessage || "").toLowerCase();
   if (msg.indexOf("pcl:spfc:scalefactors") >= 0 || msg.indexOf("flux calibration") >= 0)
      return "SPFC";
   if (msg.indexOf("astrometric") >= 0 || msg.indexOf("wcs") >= 0)
      return "ASTROMETRY";
   if (msg.indexOf("no reference data") >= 0 || msg.indexOf("0 reference image") >= 0 || msg.indexOf("mars") >= 0 || msg.indexOf("reference image") >= 0)
      return "REFERENCE";
   if ((msg.indexOf("linear") >= 0 && msg.indexOf("non") >= 0) ||
       msg.indexOf("must be linear") >= 0 ||
       msg.indexOf("not linear") >= 0 ||
       msg.indexOf("nonlinear") >= 0 ||
       msg.indexOf("non-linear") >= 0)
      return "LINEARITY";
   return "OTHER";
}

function optApplyMGCParameters(mgc, dlg) {
   try { mgc.gradientScale = parseInt(dlg.comboMgcScale.combo.itemText(dlg.comboMgcScale.combo.currentItem), 10); } catch (e0) {}
   try { mgc.structureSeparation = parseInt(dlg.comboMgcSep.combo.itemText(dlg.comboMgcSep.combo.currentItem), 10); } catch (e1) {}
   try { mgc.modelSmoothness = dlg.ncMgcSmoothness.value; } catch (e2) {}
   try { mgc.showGradientModel = true; } catch (e3) {}
   try { mgc.scaleFactorR = dlg.ncMgcScaleR.value; } catch (e4) {}
   try { mgc.scaleFactorG = dlg.ncMgcScaleG.value; } catch (e5) {}
   try { mgc.scaleFactorB = dlg.ncMgcScaleB.value; } catch (e6) {}
}

function optRunMGCCompatibleWorkflow(targetView, dlg) {
   if (!optSafeView(targetView))
      throw new Error("[MGC/TARGET] There is no valid target view to execute MGC.");
   optRequireLinearImage(targetView, "MGC");
   if (OPT_TEST_MODE)
      return { mode: "MGC", continueView: optRunTestModePreviewTransform(targetView, "contrast", 0.16), bkgView: null };
   if (typeof MultiscaleGradientCorrection === "undefined")
      throw new Error("[MGC/AVAILABILITY] MultiscaleGradientCorrection is not available. PixInsight 1.9.0+ is required.");
   var mgcInfo = optGetMGCProcessForProfile(optGetNarrowbandProfileForView(targetView, dlg, dlg && dlg.preTab && dlg.preTab.preview ? dlg.preTab.preview.currentKey : ""));
   var mgc = mgcInfo ? mgcInfo.process : null;
   if (mgc == null)
      throw new Error("[MGC/REFERENCE] A valid MGC process icon was not found in the workspace. Configure 'MGC_NB' for narrowband composites or 'MGC' for the generic path.");
   if (!optHasAstrometricSolution(targetView))
      optSolveAstrometryOnWindow(targetView.window, "the MGC target view");
   if (!optHasAstrometricSolution(targetView))
      throw new Error("[MGC/WCS] ImageSolver could not generate a valid astrometric solution. MGC requires a real WCS solution on the target image.");
   var mgcNbProfile = optGetNarrowbandProfileForView(targetView, dlg, dlg && dlg.preTab && dlg.preTab.preview ? dlg.preTab.preview.currentKey : "");
   if (mgcNbProfile)
      console.writeln("=> MGC/MARS: narrowband-aware calibration path selected for " + mgcNbProfile.description + ".");
   optRunSPFCForMGC(targetView, dlg);
   optApplyNarrowbandProcessParameters(mgc, mgcNbProfile, "MGC", mgcInfo && mgcInfo.guiConfiguredIcon === true);
   optApplyMGCParameters(mgc, dlg);

   var beforeMap = optCaptureOpenWindowIdMap();
   beforeMap[targetView.id] = true;
   var ok = false;
   try {
      ok = mgc.executeOn(targetView);
   } catch (e0) {
      var msg = e0.message || "";
      var kind = optClassifyMGCError(msg);
      if (kind === "REFERENCE")
         throw new Error("[MGC/REFERENCE] " + msg + "\nCheck the 'MGC' icon: MARS/reference image and filter configuration.");
      if (kind === "SPFC")
         throw new Error("[MGC/SPFC] " + msg + "\nThe image does not have valid SPFC metadata.");
      if (kind === "ASTROMETRY")
         throw new Error("[MGC/WCS] " + msg);
      if (kind === "LINEARITY")
         throw new Error("[MGC/LINEARITY] " + msg + "\nThis message comes from the real MGC process.");
      throw new Error("[MGC/EXECUTION] " + msg);
   }
   if (!ok)
      throw new Error("[MGC/EXECUTION] MGC returned false before completing execution.\nThe SPFC stage did complete correctly; the problem is now in the MGC configuration/execution stage.\nCheck the 'MGC' icon: MARS/reference image, .xmars databases and filters.");

   var afterWindows = ImageWindow.windows;
   var correctedWin = null;
   var bkgWin = null;
   for (var i = 0; i < afterWindows.length; ++i) {
      var win = afterWindows[i];
      if (!win || win.isNull || !win.mainView || win.mainView.isNull)
         continue;
      var winId = win.mainView.id;
      if (optHasOwn(beforeMap, winId))
         continue;
      if (optIsBackgroundResidualViewId(winId)) {
         bkgWin = win;
         continue;
      }
      correctedWin = win;
   }
   try {
      if (correctedWin && correctedWin.mainView && !correctedWin.mainView.isNull && correctedWin.mainView.id !== targetView.id)
         correctedWin.hide();
   } catch (e1) {}
   try {
      if (bkgWin && bkgWin.mainView && !bkgWin.mainView.isNull)
         bkgWin.hide();
   } catch (e2) {}
   return {
      mode: "MGC",
      continueView: correctedWin && correctedWin.mainView && !correctedWin.mainView.isNull ? correctedWin.mainView : targetView,
      bkgView: bkgWin && bkgWin.mainView && !bkgWin.mainView.isNull ? bkgWin.mainView : null
   };
}

function optConfigureABEInstance(abe, dlg, forceModelOutput, forceReplaceTarget) {
   var correctionIndex = 0;
   if (dlg && dlg.comboAbeCorrection)
      correctionIndex = dlg.comboAbeCorrection.combo.currentItem;
   var subtractValue = 0;
   var divideValue = 1;
   try {
      if (typeof AutomaticBackgroundExtractor !== "undefined" && AutomaticBackgroundExtractor.prototype) {
         if (typeof AutomaticBackgroundExtractor.prototype.Subtract !== "undefined")
            subtractValue = AutomaticBackgroundExtractor.prototype.Subtract;
         if (typeof AutomaticBackgroundExtractor.prototype.Divide !== "undefined")
            divideValue = AutomaticBackgroundExtractor.prototype.Divide;
      }
   } catch (e0) {}
   var targetCorrectionValue = (correctionIndex === 1) ? divideValue : subtractValue;
   var functionDegree = 1;
   if (dlg && dlg.ncAbeFunctionDegree)
      functionDegree = Math.max(0, Math.min(8, Math.round(dlg.ncAbeFunctionDegree.value)));
   var normalize = false;
   if (dlg && dlg.chkAbeNormalize)
      normalize = dlg.chkAbeNormalize.checked === true;
   var discardModel = (forceModelOutput === true) ? false : true;
   var replaceTarget = (forceReplaceTarget === true);
   try { abe.targetCorrection = targetCorrectionValue; } catch (e0) {}
   try { abe.functionDegree = functionDegree; } catch (e1) {}
   try { abe.normalize = normalize; } catch (e2) {}
   try { abe.discardModel = discardModel; } catch (e3) {}
   try { abe.replaceTarget = replaceTarget; } catch (e4) {}
   optSetRequiredProcessProperty(abe, ["targetCorrection", "correction", "target_correction", "Correction"], targetCorrectionValue, "ABE Target Correction");
   optSetRequiredProcessProperty(abe, ["polyDegree", "functionDegree", "function_degree", "degree", "FunctionDegree"], functionDegree, "ABE Function Degree");
   optSetRequiredProcessProperty(abe, ["normalize", "Normalize"], normalize, "ABE Normalize");
   optSetRequiredProcessProperty(abe, ["discardModel", "discard_model"], discardModel, "ABE Discard Model");
   optSetRequiredProcessProperty(abe, ["replaceTarget", "replace_target"], replaceTarget, "ABE Replace Target");
   try {
      if (typeof AutomaticBackgroundExtractor !== "undefined" &&
          AutomaticBackgroundExtractor.prototype &&
          typeof AutomaticBackgroundExtractor.prototype.SameAsTarget !== "undefined")
         abe.correctedImageSampleFormat = AutomaticBackgroundExtractor.prototype.SameAsTarget;
   } catch (e5) {}
   try { abe.correctedImageId = ""; } catch (e6) {}
}

function optExecuteABEWorkflow(targetView, dlg) {
   if (!optSafeView(targetView))
      throw new Error("There is no valid target view for ABE.");
   var windowsBefore = ImageWindow.windows;
   var abe = new AutomaticBackgroundExtractor();
   optConfigureABEInstance(abe, dlg, true, true);
   abe.executeOn(targetView);
   var bkgView = null;
   var windowsAfter = ImageWindow.windows;
   for (var iWin = 0; iWin < windowsAfter.length; ++iWin) {
      var afterWin = windowsAfter[iWin];
      var wasPresent = false;
      for (var jWin = 0; jWin < windowsBefore.length; ++jWin)
         if (afterWin.mainView.id === windowsBefore[jWin].mainView.id) {
            wasPresent = true;
            break;
         }
      if (wasPresent)
         continue;
      var afterId = afterWin.mainView.id.toLowerCase();
      if (optIsBackgroundResidualViewId(afterId)) {
         bkgView = afterWin.mainView;
         try { afterWin.hide(); } catch (e0) {}
      } else {
         try { afterWin.hide(); } catch (e1) {}
      }
   }
   try {
      if (targetView.window && !targetView.window.isNull)
         targetView.window.hide();
   } catch (e2) {}
   return { mode: "ABE", continueView: targetView, bkgView: bkgView };
}

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
      GradientDescentParameters.targetView = workView;
      GradientDescentParameters.replaceTarget = true;
      if (params) {
         if (params.descentPathsInput !== undefined) GradientDescentParameters.descentPathsInput = params.descentPathsInput;
         if (params.tolerance !== undefined) GradientDescentParameters.tolerance = params.tolerance;
         if (params.smoothing !== undefined) GradientDescentParameters.smoothing = params.smoothing;
         if (params.showModel !== undefined) GradientDescentParameters.discardModel = !(params.showModel === true);
      }
      executeGradientDescent(workView, []);
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
   var idx = dlg.comboPreGradient ? dlg.comboPreGradient.currentItem : 0;

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
   bxt.executeOn(targetView);
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
   var configured = optReadCosmicClarityConfiguredLauncherPath();
   if (configured && configured.length > 0)
      candidates.push({ prog: configured, prefix: [] });
   if (isWin)
      candidates.push({ prog: "C:\\Program Files\\SetiAstroSuitePro\\SetiAstroSuitePro.exe", prefix: [] });
   else
      candidates.push({ prog: "/Applications/SetiAstroSuitePro.app/Contents/MacOS/SetiAstroSuitePro", prefix: [] });
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
      var started = proc.start(c.prog, fullArgs);
      if (!started) { lastStderr = "Failed to start: " + c.prog; continue; }
      var t0 = new Date().getTime();
      while (proc.isStarting || proc.isRunning) {
         if ((new Date().getTime() - t0) > maxMs) {
            optTerminateExternalProcess(proc);
            throw new Error("Cosmic Clarity timed out after " + Math.round(maxMs / 1000) + " seconds: " + c.prog);
         }
         msleep(100);
         processEvents();
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
      msleep(500);
      processEvents();
   }
   return File.exists(filePath);
}

function optApplyOutputFitsToView(outputFilePath, targetView) {
   msleep(1500);
   var opened = null;
   for (var attempt = 1; attempt <= 3; ++attempt) {
      try {
         opened = ImageWindow.open(outputFilePath);
         if (opened && opened.length > 0)
            break;
      } catch (e0) {}
      if (attempt < 3) msleep(1500);
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

function optRunSPCCWorkflow(targetView, dlg) {
   if (!optSafeView(targetView))
      throw new Error("[SPCC/TARGET] There is no valid target view to execute SPCC.");
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

function optStretchParamsFromZone(zone) {
   var scale = 1024;
   try {
      scale = parseInt(zone.msScale.combo.itemText(zone.msScale.combo.currentItem), 10);
   } catch (e0) {
      scale = 1024;
   }
   var starAmount = optHasOwn(zone, "starAmount") ? zone.starAmount : null;
   var starSat = optHasOwn(zone, "starSat") ? zone.starSat : null;
   var starRemoveGreen = optHasOwn(zone, "starRemoveGreen") ? zone.starRemoveGreen : null;
   var statMed = optHasOwn(zone, "statMed") ? zone.statMed : null;
   var statBp = optHasOwn(zone, "statBp") ? zone.statBp : null;
   var statClip = optHasOwn(zone, "statClip") ? zone.statClip : null;
   var statHdr = optHasOwn(zone, "statHdr") ? zone.statHdr : null;
   var statHdrAmt = optHasOwn(zone, "statHdrAmt") ? zone.statHdrAmt : null;
   var statHdrKnee = optHasOwn(zone, "statHdrKnee") ? zone.statHdrKnee : null;
   var statLuma = optHasOwn(zone, "statLuma") ? zone.statLuma : null;
   var statBlend = optHasOwn(zone, "statBlend") ? zone.statBlend : null;
   var statNorm = optHasOwn(zone, "statNorm") ? zone.statNorm : null;
   var statCurve = optHasOwn(zone, "statCurve") ? zone.statCurve : null;
   return {
      stf_shadow: optNumericValue(zone.stfShadow, zone.isStars ? -0.5000 : -2.8000),
      stf_mid: optNumericValue(zone.stfMid, zone.isStars ? 0.0300 : 0.2500),
      stf_boost_clip: optNumericValue(zone.stfBoostClip, 0.75),
      stf_boost_bg: optNumericValue(zone.stfBoostBg, 2.00),
      stf_boost: optChecked(zone.stfBoost, false),
      ms_bg: optNumericValue(zone.msBg, zone.isStars ? 0.020 : 0.150),
      ms_agg: optNumericValue(zone.msAgg, zone.isStars ? 0.10 : 0.70),
      ms_drc: optNumericValue(zone.msDrc, zone.isStars ? 0.05 : 0.40),
      ms_cr: optChecked(zone.msCR, true),
      ms_cr_scale: scale,
      ms_cr_int: optNumericValue(zone.msIntensity, 1.000),
      ms_cs: optChecked(zone.msCS, true),
      ms_cs_amt: optNumericValue(zone.msCSAmount, 0.75),
      ms_cs_boost: optNumericValue(zone.msCSBoost, 0.50),
      ms_cs_light: optChecked(zone.msCSLightness, true),
      stat_med: optNumericValue(statMed, 0.25),
      stat_bp: optNumericValue(statBp, 5.0),
      stat_noclip: optChecked(statClip, false),
      stat_hdr: optChecked(statHdr, false),
      stat_hdramt: optNumericValue(statHdrAmt, 0.25),
      stat_hdrknee: optNumericValue(statHdrKnee, 0.35),
      stat_luma: optChecked(statLuma, false),
      stat_blend: optNumericValue(statBlend, 0.60),
      stat_norm: optChecked(statNorm, false),
      stat_curve: optNumericValue(statCurve, 0.00),
      star_amount: optNumericValue(starAmount, 5.0),
      star_sat: optNumericValue(starSat, 1.0),
      star_removeGreen: optChecked(starRemoveGreen, false),
      vlx_d: optNumericValue(zone.vlxD, 2.0),
      vlx_b: optNumericValue(zone.vlxProtect, 6.0),
      vlx_conv: optNumericValue(zone.vlxConvergence, 3.5),
      vlx_bg: optNumericValue(zone.vlxBg, 0.20),
      vlx_grip: optNumericValue(zone.vlxGrip, 1.0)
   };
}

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
      var values = [];
      var n = 0;
      values.length = roiW * roiH;
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
      values.sort(function(a, b) { return a - b; });
      var median = 0.0;
      if (n > 0) {
         var half = Math.floor(n / 2);
         median = (n & 1) ? values[half] : 0.5 * (values[half - 1] + values[half]);
      }
      var deviations = [];
      deviations.length = n;
      for (var i = 0; i < n; ++i)
         deviations[i] = Math.abs(values[i] - median);
      deviations.sort(function(a, b) { return a - b; });
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
      } else if (algoId === "VLX") {
         var vlxParams = {
            weights: [0.2126, 0.7152, 0.0722],
            logD: params.vlx_d,
            protectB: params.vlx_b,
            convergence: params.vlx_conv,
            targetBg: params.vlx_bg,
            colorGrip: params.vlx_grip,
            processingMode: "ready_to_use"
         };
         // Force the verlux.js script to be loaded (defines the `processVeraLux`
         // function). The loader tries the newest copy first, then all other
         // candidates, because installations can contain both the VeraLux Suite
         // script and the HyperMetric Stretch script.
         try { optEnsureVeraLuxSupportLoaded(); } catch (eEnsure) { OPT_LAST_VERALUX_LOAD_REPORT = eEnsure.message; }
         var veraLuxFn = optResolveVeraLuxProcessFunction();
         if (typeof veraLuxFn === "function") {
            console.writeln("=> VeraLux: using script function (processVeraLux).");
            var beforeVlxMap = optCaptureOpenWindowIdMap();
            var vlxResult;
            view.beginProcess(UndoFlag_NoSwapFile);
            try {
               var rawVlxResult = veraLuxFn(view.image, vlxParams, function(message) {
                  try {
                     if (message && String(message).length > 0)
                        console.writeln("=> VeraLux: " + message);
                  } catch (eProgress) {
                  }
               });
               vlxResult = optNormalizeVeraLuxResult(rawVlxResult, view, beforeVlxMap);
               view.image.assign(vlxResult.image);
            } finally {
               view.endProcess();
            }
            if (vlxResult.owned === true) {
               try { vlxResult.image.free(); } catch (eFree) {}
            }
            if (vlxResult.closeWindow && !vlxResult.closeWindow.isNull) {
               try { vlxResult.closeWindow.forceClose(); } catch (eClose) {}
            }
            return;
         }
         // Fallback: only attempt the native Process if the script function
         // could not be resolved. Prefer a native constructor over icons; if
         // this build exposes no known script parameter names, run the native
         // or user-icon configuration as-is instead of aborting availability.
         var vlxProc = optCreateVeraLuxProcessInstance();
         if (vlxProc != null) {
            console.writeln("=> VeraLux: using ProcessInstance (script function unavailable).");
            var anySet = false;
            if (optTrySetProcessPropertySilently(vlxProc, ["logD", "d", "D", "stretchD"], params.vlx_d)) anySet = true;
            if (optTrySetProcessPropertySilently(vlxProc, ["protectB", "b", "B", "protection"], params.vlx_b)) anySet = true;
            if (optTrySetProcessPropertySilently(vlxProc, ["convergence", "conv"], params.vlx_conv)) anySet = true;
            if (optTrySetProcessPropertySilently(vlxProc, ["targetBg", "targetBackground", "background"], params.vlx_bg)) anySet = true;
            if (optTrySetProcessPropertySilently(vlxProc, ["colorGrip", "colourGrip"], params.vlx_grip)) anySet = true;
            if (!anySet)
               console.warningln("=> VeraLux: ProcessInstance did not expose known script parameters; executing the native/icon configuration as fallback.");
            vlxProc.executeOn(view);
            return;
         }
         var detail = OPT_LAST_VERALUX_LOAD_REPORT && OPT_LAST_VERALUX_LOAD_REPORT.length > 0
            ? ("\nVeraLux script loader report:\n" + OPT_LAST_VERALUX_LOAD_REPORT)
            : "";
         throw new Error("VeraLux is not available as a native process or loadable script in this PixInsight runtime." + detail);
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
   var params = optStretchParamsFromZone(zone || {});
   var algo = (algoId || "STF").toUpperCase();
   if ((algo === "MAS" || algo === "VLX") && view.image.numberOfChannels >= 3) {
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

/**
 * Applies a crop rectangle to a view IN PLACE using the low-level
 * `image.cropTo()` API — NOT the `Crop` process — to avoid PixInsight's
 * "astrometric solution will be invalidated" confirmation dialog.
 *
 * The astrometric solution is captured before the crop and restored after
 * it, with `CRPIX1/2` (FITS keywords) and `ReferencePixel`/`ProjectionOrigin`
 * (PI properties) shifted by the crop offsets. Sky-coordinate fields stay
 * unchanged.
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

   var wcs = optCropCaptureWCSState(view);

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
      view.beginProcess(UndoFlag_NoSwapFile);
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

   // Re-apply the WCS state with CRPIX/ReferencePixel shifted by the crop
   // offsets. If the view had no WCS to begin with, this is a no-op.
   if (wcs) {
      try {
         optCropApplyWCSState(view, wcs, clamped.x, clamped.y, clamped.width, clamped.height);
      } catch (eW) {
         console.warningln("WCS preservation failed on " + view.id + ": " + eW.message);
      }
   }

   // Belt-and-suspenders cleanup: ensure dim-dependent astrometric props
   // are gone post-crop even if optCropApplyWCSState wasn't called above
   // (no other WCS data was captured to trigger it). Otherwise downstream
   // copyAstrometricSolution() on SXT/Star Split outputs would fail with
   // "AstrometricMetadata::Write(): Incompatible image dimensions".
   for (var dPost = 0; dPost < OPT_CROP_WCS_PROPERTIES_STALE_AFTER_CROP.length; ++dPost) {
      try { view.deleteProperty(OPT_CROP_WCS_PROPERTIES_STALE_AFTER_CROP[dPost]); }
      catch (eDelPost) {}
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
      target.beginProcess(UndoFlag_NoSwapFile);
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
   nxt.executeOn(targetView);
   return targetView;
}

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

function optRenderMaskViewPreviewBitmap(maskView, dialog) {
   if (!optSafeView(maskView))
      return null;
   var img = maskView.image;
   var srcW = img.width;
   var srcH = img.height;
   var size = optPostMaskPreviewBitmapSize(dialog, maskView);
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

// One-stop normalized snapshot of every Post-tab control needed to execute a
// candidate. Only the fields relevant to `actionKey` are populated; the rest
// stay undefined to make accidental cross-branch reads obvious.
function optBuildPostCandidateConfig(dialog, actionKey) {
   var cfg = { actionKey: actionKey || "" };
   if (cfg.actionKey === "post_nr") {
      cfg.useMask = optChecked(dialog.chkPostNRUseMask, false);
      cfg.algorithmIndex = dialog.comboPostNR ? dialog.comboPostNR.currentItem : 0;
      cfg.nxt = optBuildPostNxtConfigFromDialog(dialog);
      cfg.tgv = optBuildPostTgvConfigFromDialog(dialog);
      cfg.cosmicClarity = optBuildPostCosmicClarityDenoiseConfigFromDialog(dialog);
   } else if (cfg.actionKey === "post_sharp") {
      cfg.useMask = optChecked(dialog.chkPostSharpUseMask, false);
      cfg.algorithmIndex = dialog.comboPostSharp ? dialog.comboPostSharp.currentItem : 0;
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
         return targetView;
      });
   }
   if (actionKey === "post_sharp") {
      return optRunPostOperationWithOptionalMask(view, dialog, cfg.useMask === true, function(targetView) {
         var sidx = cfg.algorithmIndex;
         if (sidx === 0)
            return optExecuteBlurXConfiguredOnView(targetView, cfg.blurX);
         if (sidx === 1)
            return optExecuteUnsharpMaskConfiguredOnView(targetView, cfg.unsharpMask);
         if (sidx === 2)
            return optExecuteHdrMtConfiguredOnView(targetView, cfg.hdrMt);
         if (sidx === 3)
            return optExecuteLheConfiguredOnView(targetView, cfg.lhe);
         if (sidx === 4)
            return optApplyFallbackTransform(targetView, "contrast", cfg.dseAmount);
         if (sidx === 5) {
            if (OPT_TEST_MODE)
               return optRunTestModePreviewTransform(targetView, "contrast", 0.14);
            return optRunCosmicClarityOnView(targetView, cfg.cosmicClarity);
         }
         return targetView;
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

function optCreateLiveCandidateView(sourceView, baseId, dialog) {
   if (!optSafeView(sourceView))
      throw new Error("No valid source view for live preview.");
   var candidate = optCloneView(sourceView, baseId || "Opt_LiveCandidate", false);
   if (!optSafeView(candidate))
      throw new Error("Could not create live preview candidate.");
   try {
      optDownsamplePreparedView(candidate, optLiveCandidateMaxDim(dialog, sourceView));
      return candidate;
   } catch (e) {
      optCloseView(candidate);
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
         var live = optCreateLiveCandidateView(currentView, "Opt_Live_" + actionKey, dialog);
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

var OPT_CC_BLEND_MODES = [
   "Replace", "Darken/Min", "Multiply", "Colour burn", "Linear burn", "Darker colour",
   "Lighten/Max", "Screen", "Colour dodge", "Linear dodge/Add", "Lighter colour",
   "Overlay", "Soft light", "Hard light", "Vivid light", "Linear light", "Pin light",
   "Difference", "Exclusion", "Subtract", "Divide", "Power", "Arctan", "Hue", "Saturation", "Lightness"
];

function optCcBlendExpression(modeName, viewAId, viewBId) {
   var A = viewAId, B = viewBId, mode = modeName || "Screen";
   switch (mode) {
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
   var keys = dialog.store.keysForTab(OPT_TAB_CC);
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
   var slotMaskApplied = false;
   var tempMask = null;
   try {
      if (live)
         optDownsamplePreparedView(work, liveMaxDim);
      var slotMask = optCcSlotMaskView(dialog, slot);
      if (optSafeView(slotMask)) {
         var effectiveMask = slotMask;
         if (live && (work.image.width !== slotMask.image.width ||
                      work.image.height !== slotMask.image.height)) {
            tempMask = optCloneView(slotMask, "Opt_CC_SlotMaskLive_" + slot.index, false);
            if (optSafeView(tempMask))
               optDownsamplePreparedView(tempMask, Math.max(work.image.width, work.image.height));
            effectiveMask = tempMask;
         }
         if (!optSafeView(effectiveMask) ||
             work.image.width !== effectiveMask.image.width ||
             work.image.height !== effectiveMask.image.height)
            throw new Error("Channel Combination Image " + slot.index + " mask geometry does not match the selected source image.");
         work.window.mask = effectiveMask.window;
         try { work.window.maskEnabled = true; } catch (eM) {}
         slotMaskApplied = true;
      }
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
      if (slotMaskApplied)
         optClearProcessMask(work);
      if (tempMask)
         try { optCloseView(tempMask); } catch (eTmp0) {}
      return work;
   } catch (e) {
      if (slotMaskApplied)
         optClearProcessMask(work);
      if (tempMask)
         try { optCloseView(tempMask); } catch (eTmp1) {}
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
   var chkColour = slot.chkColour && slot.chkColour.checked === true;
   var chkHist = slot.chkHistogram && slot.chkHistogram.checked === true;
   var maskView = optCcSlotMaskView(dialog, slot);
   var parts = [
      rec.view.id,
      optSafeView(maskView) ? maskView.id : "NoMask",
      bright.toFixed(4),
      sat.toFixed(4),
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
   var props = (which === "live") ? ["__preparedCacheLive"] :
               (which === "full") ? ["__preparedCacheFull"] :
               ["__preparedCacheLive", "__preparedCacheFull"];
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
   var composeCfg = optBuildCcConfigFromDialog(dialog);
   var highest = -1;
   for (var i = composeCfg.slots.length - 1; i >= 0; --i) {
      var sCfg = composeCfg.slots[i];
      if (!sCfg.active)
         continue;
      if (sCfg.sourceKey && optSafeView(dialog.store.record(sCfg.sourceKey).view)) {
         highest = i;
         break;
      }
   }
   if (highest < 0)
      throw new Error("Load at least one Channel Combination image slot.");
   // Cache access still goes through the live UI slot object; the cfg snapshot
   // covers only the user-visible parameters (active flag, source, blend mode).
   var basePrepared = optGetCachedCcSlot(dialog, dialog.ccSlots[highest], live, liveMaxDim);
   if (!optSafeView(basePrepared))
      throw new Error("Failed to prepare the Channel Combination base slot.");
   // Result is a fresh clone of the cached base; PM mutates it in place.
   var result = optCloneView(basePrepared, "Opt_CC_Compose_" + (live ? "Live" : "Full"), false);
   if (!optSafeView(result))
      throw new Error("Failed to prepare the Channel Combination compose target.");
   try {
      for (var s = highest - 1; s >= 0; --s) {
         var slotCfg = composeCfg.slots[s];
         if (!slotCfg.active)
            continue;
         var overlay = optGetCachedCcSlot(dialog, dialog.ccSlots[s], live, liveMaxDim);
         if (!optSafeView(overlay))
            continue;
         var overlayId = overlay.id;
         var tempOverlay = null;
         try {
            if ((result.image.numberOfChannels >= 3) !== (overlay.image.numberOfChannels >= 3)) {
               if (result.image.numberOfChannels < 3) {
                  var c1 = new ConvertToRGBColor();
                  c1.executeOn(result);
               }
               if (overlay.image.numberOfChannels < 3) {
                  // Cached overlay is mono and result is RGB; clone the cached
                  // overlay so the in-place ConvertToRGBColor doesn't pollute
                  // the cache for future iterations/frames.
                  tempOverlay = optCloneView(overlay, "Opt_CC_OverlayRGB_" + s, false);
                  if (optSafeView(tempOverlay)) {
                     var c2 = new ConvertToRGBColor();
                     c2.executeOn(tempOverlay);
                     overlayId = tempOverlay.id;
                  }
               }
            }
            var expr = optCcBlendExpression(slotCfg.blendMode, "$T", overlayId);
            var pm = new PixelMath();
            pm.expression = expr;
            pm.useSingleExpression = true;
            pm.createNewImage = false;
            pm.showNewImage = false;
            pm.executeOn(result);
         } finally {
            if (tempOverlay)
               optCloseView(tempOverlay);
         }
      }
   } catch (eC) {
      optCloseView(result);
      throw eC;
   }
   return result;
}

// Apply a single policy decision to one target. Handles both section
// (has .body and .bar) and plain controls (buttons, inner groups).
function optApplyPolicyToTarget(target, enabled, disabledTooltip) {
   if (!target) return;
   var isSection = !!(target.body && target.bar);
   // For sections: only the body gets disabled (the bar stays clickable so
   // the user can still collapse/expand). For other controls: disable directly.
   var ctrl = isSection ? target.body : target;
   if (!ctrl) return;
   // Save original tooltip the first time we touch this target.
   if (typeof ctrl.__origTooltip === "undefined") {
      try { ctrl.__origTooltip = ctrl.toolTip || ""; } catch (eT) { ctrl.__origTooltip = ""; }
   }
   try { ctrl.enabled = enabled; } catch (e1) {}
   try { ctrl.toolTip = enabled ? ctrl.__origTooltip : disabledTooltip; } catch (e2) {}
};

// UI layer: dialog construction, theme tokens, widgets, event handlers,
// memory managers and UI section builders. Must be included before the
// architecture self-check runs so its symbol probes pass.
#include "PI Workflow 4_UI.js"

function optRunArchitectureSelfCheck() {
   var missing = [];
   // Core processing
   if (typeof optCloseViews !== "function")
      missing.push("optCloseViews");
   if (typeof optPreparePostMaskWorkImage !== "function")
      missing.push("optPreparePostMaskWorkImage");
   if (typeof optFinishPostMaskView !== "function")
      missing.push("optFinishPostMaskView");
   if (typeof optBuildPostRangeMaskViewTiled !== "function")
      missing.push("optBuildPostRangeMaskViewTiled");
   if (typeof optBuildPostColorMaskViewTiled !== "function")
      missing.push("optBuildPostColorMaskViewTiled");
   if (typeof OptPostMaskLiveCache !== "function")
      missing.push("OptPostMaskLiveCache");
   if (typeof optFillRangeMaskRgbLuma !== "function")
      missing.push("optFillRangeMaskRgbLuma");
   if (typeof optFillColorMaskArray !== "function")
      missing.push("optFillColorMaskArray");
   if (typeof optGaussianKernelForSigma !== "function")
      missing.push("optGaussianKernelForSigma");
   if (typeof optApplyPreCandidate !== "function")
      missing.push("optApplyPreCandidate");
   if (typeof optApplyPostCandidate !== "function")
      missing.push("optApplyPostCandidate");
   if (typeof optComposeCcSlots !== "function")
      missing.push("optComposeCcSlots");
   // Parameter-model layer (PI Workflow 4)
   if (typeof optBuildPreCandidateConfig !== "function")
      missing.push("optBuildPreCandidateConfig");
   if (typeof optBuildPostCandidateConfig !== "function")
      missing.push("optBuildPostCandidateConfig");
   if (typeof optExecuteTgvDenoiseConfiguredOnView !== "function")
      missing.push("optExecuteTgvDenoiseConfiguredOnView");
   if (typeof optExecuteUnsharpMaskConfiguredOnView !== "function")
      missing.push("optExecuteUnsharpMaskConfiguredOnView");
   if (typeof optExecuteHdrMtConfiguredOnView !== "function")
      missing.push("optExecuteHdrMtConfiguredOnView");
   if (typeof optExecuteLheConfiguredOnView !== "function")
      missing.push("optExecuteLheConfiguredOnView");
   if (typeof optBuildCcConfigFromDialog !== "function")
      missing.push("optBuildCcConfigFromDialog");
   // UI layer (must be present — its absence means the #include failed).
   if (typeof PIWorkflowOptDialog !== "function")
      missing.push("PIWorkflowOptDialog");
   if (typeof OptWorkflowTab !== "function")
      missing.push("OptWorkflowTab");
   if (typeof OptPreviewPane !== "function")
      missing.push("OptPreviewPane");
   if (typeof OptMemoryManager !== "function")
      missing.push("OptMemoryManager");
   if (typeof OptMaskMemoryManager !== "function")
      missing.push("OptMaskMemoryManager");
   if (typeof optRenderMaskViewInPreview !== "function")
      missing.push("optRenderMaskViewInPreview");
   if (typeof optReleaseOwnedSlotViews !== "function")
      missing.push("optReleaseOwnedSlotViews");
   if (typeof optBuildPostNoiseSection !== "function")
      missing.push("optBuildPostNoiseSection");
   if (typeof optBuildPostSharpeningSection !== "function")
      missing.push("optBuildPostSharpeningSection");
   if (typeof optBuildPostColorBalanceSection !== "function")
      missing.push("optBuildPostColorBalanceSection");
   if (typeof optBuildPostCurvesSection !== "function")
      missing.push("optBuildPostCurvesSection");
   if (typeof optBuildPostMaskingSection !== "function")
      missing.push("optBuildPostMaskingSection");
   if (missing.length > 0)
      throw new Error("PI Workflow 4 architecture check failed: " + missing.join(", "));
}

function optMain() {
   console.show();
   optRunArchitectureSelfCheck();
   var dlg = null;
   try {
      dlg = new PIWorkflowOptDialog();
      dlg.execute();
   } finally {
      if (dlg)
         try { dlg.finalCleanup(); } catch (e) {}
   }
}

if (!PI_WORKFLOW_OPT_NO_MAIN)
   optMain();
