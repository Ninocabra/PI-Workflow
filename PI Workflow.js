// ===========================================================================
// ENGINE SELECTION — V8 ONLY (PixInsight 1.9.4+)
// ---------------------------------------------------------------------------
// This is the V8-only build line for PixInsight 1.9.4 and newer. The legacy
// SpiderMonkey code paths have been stripped, so the engine is selected
// unconditionally. This build does NOT load on PixInsight 1.9.3 (it would
// reject `#engine v8`); 1.9.3 is served by the frozen dual build (V8_5).
// ===========================================================================
#engine v8

/*
 * PI Workflow. Provided by Oscar Rodriguez with the help of Claude Opus 4.7, Antigravity under Gamini 3.5 Lite and Codex with Chat GPT 5.5.
 * Version/build/fecha: ver OPT_VERSION / OPT_BUILD / OPT_BUILD_DATE más abajo (fuente única; no duplicar aquí).
 */

#feature-id    CabraSpace > PI_Workflow
#feature-icon  PI Workflow.svg
#feature-info  PI Workflow - end-to-end PixInsight processing cockpit with a parameter-model layer that lets processing functions consume normalized config objects produced by per-stage builders, decoupling processes from dialog controls.

#ifndef PI_WORKFLOW_OPT_NO_MAIN
#define PI_WORKFLOW_OPT_NO_MAIN 0
#endif

#ifndef PI_WORKFLOW_OPT_TEST_MODE
#define PI_WORKFLOW_OPT_TEST_MODE 0
#endif

// V8-ADP-SETTINGS-GUARD-BEGIN
// V8 (1.9.4+): the new ImageSolver library calls module.replace(...) on this
// value, so it must be a STRING literal, not the bare token the legacy AdP
// convention used.
#define SETTINGS_MODULE "ImageSolver"
// V8-ADP-SETTINGS-GUARD-END

// V8-PJSR-GUARD-BEGIN
// Pure-constant pjsr headers below are plain #define files; they are harmless
// on both the legacy SpiderMonkey and the V8 runtimes, so they are always
// included. Only the three headers that DECLARE UI classes already provided
// natively by V8 (Sizer -> HorizontalSizer/VerticalSizer, NumericControl, Color)
// must be skipped under V8, where re-declaring them raises
// "Identifier already declared". Under V8 those classes are native; we only
// re-supply the Align_* constants that Sizer.jsh would otherwise define.
#include <pjsr/StdButton.jsh>
#include <pjsr/StdIcon.jsh>
#include <pjsr/StdCursor.jsh>
#include <pjsr/FrameStyle.jsh>
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
#include <pjsr/StarDetector.jsh>   // CONTINUUM-SUB: star-flux regression for the k factor
// V8: HorizontalSizer/VerticalSizer, NumericControl and Color are native.
// Re-supply only the alignment constants that Sizer.jsh would define.
#define Align_Expand 0
#define Align_Left   1
#define Align_Top    1
#define Align_Right  2
#define Align_Bottom 2
#define Align_Center 3
#define Align_Default 0
// V8-PJSR-GUARD-END
// V8-ADP-WCS-GUARD-BEGIN
// SpiderMonkey (1.9.3): the legacy AdP WCS/catalog libraries provide plate
// solving and WCS metadata. Under V8 (1.9.4+) these AdP headers are obsolete and
// must NOT be used; the new ImageSolver 6.4.1 library (included further below)
// pulls in the V8-safe astrometry headers (pjsr astrometry headers) itself.
// V8-ADP-WCS-GUARD-END
#include "PI Workflow_resources.jsh"

// ============================================================================
// PI Workflow V8 - V8/SpiderMonkey Compatibility Engine & Shims
// ============================================================================
var optIsV8 = (typeof BigInt !== 'undefined');

// 1. Memory deallocation shims. Neither SpiderMonkey 24 nor the V8 runtime
//    expose Image.prototype.free / Bitmap.prototype.clear, so we install
//    safe no-ops on whichever engine lacks them. This protects the few
//    unguarded callers (e.g. gray.free()) from a TypeError under V8.
if (typeof Image.prototype.free === "undefined") {
   Image.prototype.free = function() {}; // No-op where the engine lacks it
}
if (typeof Bitmap.prototype.clear === "undefined") {
   Bitmap.prototype.clear = function() {}; // No-op where the engine lacks it
}

// Engine-agnostic event-loop / sleep helpers. The legacy SpiderMonkey runtime
// (1.9.3) exposes the global functions processEvents()/msleep(); the V8 runtime
// (1.9.4+) exposes them as CoreApplication.processEvents()/System.msleep().
// Calling the wrong form throws "X is not a function". These wrappers pick
// whichever the running engine provides.
function optProcessEvents() {
   // Prefer the modern qualified form (V8 / 1.9.4+); fall back to the global
   // (SpiderMonkey / 1.9.3). On V8 the bare global still exists but is deprecated
   // and emits a console warning, so the qualified form must be tried first.
   try { if (typeof CoreApplication !== "undefined" && typeof CoreApplication["processEvents"] === "function") { CoreApplication["processEvents"](); return; } } catch (e0) {}
   try { if (typeof processEvents === "function") { processEvents(); return; } } catch (e1) {}
}
function optMsleep(ms) {
   try { if (typeof System !== "undefined" && typeof System["msleep"] === "function") { System["msleep"](ms); return; } } catch (e0) {}
   try { if (typeof msleep === "function") { msleep(ms); return; } } catch (e1) {}
}

// 2. Global constant aliases under V8
if (optIsV8) {
   var global = (typeof globalSelf !== 'undefined') ? globalSelf : (typeof globalThis !== 'undefined') ? globalThis : this;
   
   if (typeof StdIcon !== "undefined") {
      global["StdIcon_NoIcon"] = StdIcon.NoIcon;
      global["StdIcon_Question"] = StdIcon.Question;
      global["StdIcon_Information"] = StdIcon.Information;
      global["StdIcon_Warning"] = StdIcon.Warning;
      global["StdIcon_Error"] = StdIcon.Error;
   }
   
   if (typeof StdButton !== "undefined") {
      global["StdButton_NoButton"] = StdButton.NoButton;
      global["StdButton_Ok"] = StdButton.Ok;
      global["StdButton_Cancel"] = StdButton.Cancel;
      global["StdButton_Yes"] = StdButton.Yes;
      global["StdButton_No"] = StdButton.No;
      global["StdButton_Abort"] = StdButton.Abort;
      global["StdButton_Retry"] = StdButton.Retry;
      global["StdButton_Ignore"] = StdButton.Ignore;
      global["StdButton_YesToAll"] = StdButton.YesToAll;
      global["StdButton_NoToAll"] = StdButton.NoToAll;
   }
   
   if (typeof UndoFlag !== "undefined") {
      global["UndoFlag_NoSwapFile"] = UndoFlag.NoSwapFile;
   }
   
   if (typeof ColorSpace !== "undefined") {
      global["ColorSpace_Unknown"] = ColorSpace.Unknown;
      global["ColorSpace_Gray"] = ColorSpace.Gray;
      global["ColorSpace_RGB"] = ColorSpace.RGB;
      global["ColorSpace_CIEXYZ"] = ColorSpace.CIEXYZ;
      global["ColorSpace_CIELab"] = ColorSpace.CIELab;
      global["ColorSpace_CIELch"] = ColorSpace.CIELch;
      global["ColorSpace_HSV"] = ColorSpace.HSV;
      global["ColorSpace_HSI"] = ColorSpace.HSI;
   }
   
   if (typeof PixelSampleType !== "undefined") {
      global["SampleType_Integer"] = PixelSampleType.Integer;
      global["SampleType_Real"] = PixelSampleType.Real;
      global["SampleType_Complex"] = PixelSampleType.Complex;
   }
   
   if (typeof TextAlignment !== "undefined") {
      global["TextAlign_Left"] = TextAlignment.Left;
      global["TextAlign_Right"] = TextAlignment.Right;
      global["TextAlign_HorzCenter"] = TextAlignment.HorzCenter;
      global["TextAlign_Justify"] = TextAlignment.Justify;
      global["TextAlign_Top"] = TextAlignment.Top;
      global["TextAlign_Bottom"] = TextAlignment.Bottom;
      global["TextAlign_VertCenter"] = TextAlignment.VertCenter;
      global["TextAlign_Center"] = TextAlignment.HorzCenter | TextAlignment.VertCenter;
   }
   
   if (typeof InterpolationAlgorithm !== "undefined") {
      global["Interpolation_Auto"] = InterpolationAlgorithm.Auto;
      global["Interpolation_NearestNeighbor"] = InterpolationAlgorithm.NearestNeighbor;
      global["Interpolation_Bilinear"] = InterpolationAlgorithm.Bilinear;
   }
   
   if (typeof RadialBasisFunction !== "undefined") {
      global["RBFType_Unknown"] = RadialBasisFunction.Unknown;
      global["RBFType_ThinPlateSpline"] = RadialBasisFunction.ThinPlateSpline;
      global["RBFType_DDMThinPlateSpline"] = RadialBasisFunction.DDMThinPlateSpline;
   }
   
   if (typeof FrameStyle !== "undefined") {
      global["FrameStyle_Flat"] = FrameStyle.Flat;
   }
   
   if (typeof PenStyle !== "undefined") {
      global["PenStyle_Dash"] = PenStyle.Dash;
   }

   global["StdCursor_NoCursor"] = 0;
   global["StdCursor_Arrow"] = 1;
   global["StdCursor_Cross"] = 13;
   global["StdCursor_PointingHand"] = 26;
   global["StdCursor_OpenHand"] = 27;
   global["StdCursor_ClosedHand"] = 28;
   global["StdCursor_HorizontalSize"] = 20;
   global["StdCursor_SizeHor"] = 20;
   
   global["ImageOp_Mov"] = 1;
}

// 3. Process static constants synchronization helper
function optShimProcessClass(processClass) {
   if (typeof processClass === "undefined")
      return;
   try {
      if (processClass.prototype) {
         var protoProps = Object.getOwnPropertyNames(processClass.prototype);
         for (var i = 0; i < protoProps.length; ++i) {
            var prop = protoProps[i];
            if (prop !== "constructor" && typeof processClass[prop] === "undefined") {
               try { processClass[prop] = processClass.prototype[prop]; } catch (e) {}
            }
         }
      }
   } catch (eProto) {}
   try {
      var staticProps = Object.getOwnPropertyNames(processClass);
      for (var i = 0; i < staticProps.length; ++i) {
         var prop = staticProps[i];
         if (prop !== "prototype" && prop !== "name" && prop !== "length" && processClass.prototype && typeof processClass.prototype[prop] === "undefined") {
            try { processClass.prototype[prop] = processClass[prop]; } catch (eStatic) {}
         }
      }
   } catch (eStaticOuter) {}
}

// Synchronize all processes that access static or prototype constants
if (typeof AutomaticBackgroundExtractor !== "undefined") optShimProcessClass(AutomaticBackgroundExtractor);
if (typeof ChannelExtraction !== "undefined") optShimProcessClass(ChannelExtraction);
if (typeof ChannelCombination !== "undefined") optShimProcessClass(ChannelCombination);
if (typeof BackgroundNeutralization !== "undefined") optShimProcessClass(BackgroundNeutralization);
if (typeof ColorSaturation !== "undefined") optShimProcessClass(ColorSaturation);
if (typeof SCNR !== "undefined") optShimProcessClass(SCNR);
if (typeof CurvesTransformation !== "undefined") optShimProcessClass(CurvesTransformation);
if (typeof Crop !== "undefined") optShimProcessClass(Crop);
if (typeof StarAlignment !== "undefined") optShimProcessClass(StarAlignment);
if (typeof PixelMath !== "undefined") optShimProcessClass(PixelMath);
if (typeof StarNet2 !== "undefined") optShimProcessClass(StarNet2);
if (typeof DeepSNR !== "undefined") optShimProcessClass(DeepSNR);

// V8-EVAL-SHIM-REMOVED-BEGIN
// 4. (Removed) ES6 array utility shims optFind/optFilter/optMap. They were never
//    called anywhere in the script (dead code: 0 call sites). The V8 branch used a
//    direct eval() that, under PixInsight's V8 runtime, prevented some top-level
//    function declarations from registering — the architecture self-check then
//    reported optCloseViews / optApplyPreCandidate / optBuildPreCandidateConfig as
//    missing (only under V8; SpiderMonkey tolerated it). The validated V8-only
//    build also removed them. To restore, re-add the if(optIsV8){...}else{...}
//    block here.
// V8-EVAL-SHIM-REMOVED-END
// ============================================================================

#ifndef Ext_DataType_Complex
#define Ext_DataType_Complex 1001
#endif

#ifndef Ext_DataType_StringArray
#define Ext_DataType_StringArray 1002
#endif

#ifndef Ext_DataType_JSON
#define Ext_DataType_JSON 1003
#endif

// V8-ADP-WCSDEFS-GUARD-BEGIN
// SpiderMonkey (1.9.3): the legacy AdP WCSmetadata expects these spline/catalog
// defaults. Under V8 (1.9.4+) the new ImageSolver library defines them itself,
// so re-defining them here would only produce "redefinition of macro" warnings.
// V8-ADP-WCSDEFS-GUARD-END

// These three items are normally defined inside ImageSolver.js's
// #ifndef USE_SOLVER_LIBRARY block, which is skipped when including as a
// library. They are required by ImageSolverDialog at construction time.
#ifndef STAR_CSV_FILE
#define STAR_CSV_FILE (File.systemTempDirectory + format("/stars-%03d.csv", CoreApplication.instance))
#endif
// V8-ADP-SOLVER-GUARD-BEGIN
// V8 (1.9.4+): the new ImageSolver 6.4.1 library. As a library it pulls in the
// V8-safe astrometry headers (pjsr astrometry headers) plus its own Engine and
// Dialog, providing the ImageSolver / AstrometricMetadata / ImageSolverDialog /
// SolverConfiguration classes used below.
#define USE_SOLVER_LIBRARY
#include <../src/scripts/ImageSolver/ImageSolver.js>
#undef USE_SOLVER_LIBRARY
// V8-ADP-SOLVER-GUARD-END

// VERSIONADO / TRAZABILIDAD DE BUILDS
//   OPT_VERSION    — versión legible. Se cambia SOLO cuando el usuario lo pide
//                    explícitamente (p.ej. 1.0 → 1.1). Nunca de forma automática.
//   OPT_BUILD      — contador de build monotónico. Se incrementa en CADA
//                    modificación del script (automático), para trazabilidad por
//                    cambio. No se reinicia al subir de versión.
//   OPT_BUILD_DATE — fecha (AAAA-MM-DD) del build actual.
// La cabecera los muestra en este orden: versión · fecha · build.
// El registro de builds vive en README_DEV_200.md (tabla "VERSIÓN Y BUILDS").
var OPT_VERSION    = "1.0";
var OPT_BUILD      = 35;
var OPT_BUILD_DATE = "2026-07-16";

// I18N-BEGIN: UI language ("en" | "es"). English is the source of truth; Spanish
// comes from the tables in resources (OPT6D_TOOLTIPS_ES / OPT_I18N_ES). A missing
// translation falls back to English. The choice persists across sessions, and the
// ES/EN button retranslates the live dialog IN PLACE (no rebuild, state preserved)
// by walking OPT_I18N_REGISTRY — see optI18nRegister / optI18nRetranslate.
var OPT_LANG = "en";

// Registry of translatable controls in the currently open dialog. Each entry is
// { c: control, kind: "text"|"tip", key: <english literal or tooltip key> }.
// Populated during build via optI18nLabel / the tooltip apply path; cleared on
// dialog teardown. Walked by optI18nRetranslate() when the language toggles.
var OPT_I18N_REGISTRY = [];

function optLoadLang() {
   try {
      var v = Settings.read("PIWorkflow/lang", DataType_String);
      if (v === "es" || v === "en") OPT_LANG = v;
   } catch (e) {}
}
function optSaveLang() {
   try { Settings.write("PIWorkflow/lang", DataType_String, OPT_LANG); } catch (e) {}
}
// Translate an English UI literal. Use for button/label/section text:
//   btn.text = optT("Export");
function optT(s) {
   try {
      if (OPT_LANG === "es" && typeof OPT_I18N_ES !== "undefined" &&
          OPT_I18N_ES && OPT_I18N_ES.hasOwnProperty(s) && OPT_I18N_ES[s])
         return OPT_I18N_ES[s];
   } catch (e) {}
   return s;
}

// Set a control's text to the translated English literal AND register it so the
// language toggle can retranslate it in place. Use everywhere a UI label/button
// caption is assigned: optI18nLabel(myButton, "Export").
function optI18nLabel(control, enText) {
   try { control.text = optT(enText); } catch (e) {}
   try { OPT_I18N_REGISTRY.push({ c: control, kind: "text", key: enText }); } catch (e2) {}
   return control;
}

// Like optI18nLabel but uppercases the (translated) text. Used for subcard headers
// that are rendered all-caps. Keeps the English key for lookup; uppercases the
// Spanish result so accents survive (JS toUpperCase handles them).
function optI18nLabelUpper(control, enText) {
   try { control.text = String(optT(enText)).toUpperCase(); } catch (e) {}
   try { OPT_I18N_REGISTRY.push({ c: control, kind: "text-upper", key: enText }); } catch (e2) {}
   return control;
}

// Register a control that paints its own text (e.g. a section header drawn in
// onPaint via optT(title)). On language toggle we just force a repaint so the
// paint handler re-reads optT() in the new language. No text is stored here.
function optI18nRegisterRepaint(control) {
   try { OPT_I18N_REGISTRY.push({ c: control, kind: "repaint", key: "" }); } catch (e) {}
   return control;
}

// Register a control whose tooltip was set from a tooltip-table key, so the
// toggle can re-pull it in the new language. (The actual tooltip text is fetched
// by optTooltipTextByKey, which is already language-aware.)
function optI18nRegisterTip(control, key) {
   try { OPT_I18N_REGISTRY.push({ c: control, kind: "tip", key: key }); } catch (e) {}
   return control;
}

// Drop all registered controls (called on dialog teardown; controls are dead).
function optI18nClear() { OPT_I18N_REGISTRY = []; }

// Walk the registry and re-apply text/tooltips for the current OPT_LANG. Stale or
// destroyed controls are skipped. optTooltipTextByKey is defined in the UI file.
function optI18nRetranslate() {
   for (var i = 0; i < OPT_I18N_REGISTRY.length; ++i) {
      var e = OPT_I18N_REGISTRY[i];
      if (!e || !e.c) continue;
      try {
         if (e.kind === "text")
            e.c.text = optT(e.key);
         else if (e.kind === "text-upper")
            e.c.text = String(optT(e.key)).toUpperCase();
         else if (e.kind === "title")
            e.c.title = optT(e.key);
         else if (e.kind === "tip" && typeof optTooltipTextByKey === "function")
            e.c.toolTip = optTooltipTextByKey(e.key);
         else if (e.kind === "repaint")
            e.c.update();
      } catch (eApply) {}
   }
}
// I18N-END

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
var OPT_TAB_IMGENH = "imgenh";   // IMG-ENH: Image Enhancement tab (Color Mixer, etc.)
var OPT_IMG_ENH_ENABLED = true;  // IMG-ENH: master flag — false removes the tab entirely.
var OPT_TAB_ANNOT = "annot";     // #13: Annotations tab ("what's in my image" DSO overlay + sky map).
var OPT_ANNOTATIONS_ENABLED = true; // #13: master flag — false removes the tab entirely (release gating).

#include "engine/config_registry.js"
#include "engine/session.js"
#include "engine/ui_mode.js"
#include "engine/diag.js"

#include "engine/enhance.js"

#include "engine/cabramagic.js"
#include "engine/recipes.js"
#include "engine/defaults.js"
#include "engine/metrics.js"
#include "engine/export.js"
#include "engine/masks.js"

var OPT_BASE_KEYS = ["MonoRGB", "R", "G", "B", "L", "HSO", "H", "O", "S", "HO", "OS", "RGB"];
var OPT_MONO_KEYS = ["R", "G", "B", "L", "H", "O", "S"];
var OPT_COLOR_KEYS = ["RGB", "HO", "OS", "MonoRGB", "HSO"];
var OPT_INPUT_KEYS = ["R", "G", "B", "L", "H", "O", "S", "HO", "OS", "RGB"];
var OPT_RECIPE_NAMES = ["SHO", "HOO", "HSO", "HOS", "OSS", "OHH", "OSH", "OHS", "HSS", "REAL1", "REAL2", "FORAXX", "GOLDEN"];
var OPT_MOUSE_LEFT = (typeof MouseButton_Left !== "undefined") ? MouseButton_Left : 0x01;
var OPT_MOUSE_RIGHT = (typeof MouseButton_Right !== "undefined") ? MouseButton_Right : 0x02;
var OPT_PIW_HAS_AUTODBE = (typeof GradientDescentParameters !== "undefined" &&
                           GradientDescentParameters != null &&
                           typeof executeGradientDescent === "function");
// Holder for the GraXpertLib constructor. Under PixInsight's V8 runtime an
// INDIRECT eval ((1,eval)(text)) of GraXpertLib.jsh runs in a scope whose
// top-level `function GraXpertLib(){}` does NOT leak to the script global, so
// the lib evaluated "OK" yet `typeof GraXpertLib` stayed "undefined" on macOS.
// We now capture the constructor explicitly (IIFE return) and assign it to
// this declared global so detection and `new GraXpertLib()` work.
var GraXpertLib;
var OPT_GRAXPERT_DEFAULT_CORRECTION = 0;
var OPT_GRAXPERT_DEFAULT_SMOOTHING = 0.629;
var OPT_TEST_MODE = (PI_WORKFLOW_OPT_TEST_MODE != 0);
// DIRECT-PROCESS-BEGIN: when true, SPFC/MGC run as plain process instances (defaults +
// global Gaia/MARS config) when no configured process icon exists. A configured icon,
// if present, still takes precedence (fallback/override). Set to false to restore the
// icon-required behavior.
var OPT_DIRECT_PROCESS_INSTANTIATION = true;
// DIRECT-PROCESS-END
var OPT_SYNTHETIC_WCS_IDS = {};
var OPT_OPTIONAL_SCRIPT_LOAD_STATE = {};

var GRAXPERT_SCRIPT_CONFIG;

#include "engine/loaders.js"
#include "engine/view_utils.js"
#include "engine/preview.js"
#include "engine/channels.js"
#include "engine/utils.js"
#include "engine/pre.js"
#include "engine/gradient.js"
#include "engine/external_tools.js"

#include "engine/sssc.js"

#include "engine/color_calibration.js"

#include "engine/continuum.js"

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
      aghs_sigmas: optNumericValue(zone.aghsSigmas, 1.0),
      aghs_intensity: optNumericValue(zone.aghsIntensity, 0.7),
      aghs_iterations: optNumericValue(zone.aghsIterations, 10),
      aghs_bp: optNumericValue(zone.aghsBp, 2.8),
      // RGB/STARLESS reads the Saturation slider; STARS (no slider) uses the fixed
      // star-tuned value 0.92 (looks best on stars).
      aghs_saturation: optNumericValue(zone.aghsSaturation, zone.isStars ? 0.92 : 0.95)
   };
}

#include "engine/autoghs.js"

#include "engine/stretch.js"
#include "engine/post.js"
#include "engine/channel_combination.js"
#include "engine/processing_log.js"
#include "engine/annotations.js"
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
#include "PI Workflow_UI.js"

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
   optLoadLang();   // I18N: restore the persisted UI language
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
