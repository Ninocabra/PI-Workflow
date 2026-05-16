/*
 * PI Workflow Opt
 * New workflow shell focused on canonical image ownership, lightweight memory,
 * shared Image Selection, and one preview engine for all workflow tabs.
 */

#feature-id    Utilities > PI_Workflow_Opt_8
#feature-info  Optimized PI Workflow community review build v8 - live-preview downsampling, pre-process CC caching, row-buffer MAS sampling, and reusable preview paint buffers.

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

var OPT_VERSION = "33-opt-8-performance-rc1";
var OPT6D_TOOLTIP_APPLIED_CONTROLS = [];
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

var OPT_UI = {
   bg: "#FF0e0e10",
   bgPanel: "#FF17171a",
   bgPanelAlt: "#FFd9a560",
   bgInset: "#FF0a0a0b",
   border: "#FF262629",
   borderStrong: "#FF38383e",
   text: "#FFe8e8ea",
   textDim: "#FF9a9aa1",
   textMute: "#FF6b6b73",
   primary: "#FFd9a560",
   primaryBg: "#FF3a2d1a",
   comboBg: "#FF5d4624",
   comboBgHover: "#FF72552b",
   comboDrop: "#FF8a6534",
   primaryHover: "#FFe8e8ea",
   success: "#FF7ed89b",
   successBg: "#FF19301f",
   danger: "#FFe08070",
   dangerBg: "#FF2e1411",
   radius: "6px",
   radiusLg: "10px",
   fontFamily: "'Segoe UI','Helvetica Neue',sans-serif"
};

var OPT_CSS_GLOBAL =
   "* { font-family:" + OPT_UI.fontFamily + "; font-size:9pt; color:" + OPT_UI.text + "; border-image:none; outline:none; }" +
   "QDialog, QWidget { background-color:" + OPT_UI.bg + "; color:" + OPT_UI.text + "; border:1px solid " + OPT_UI.bg + "; }" +
   "QLabel { background-color:" + OPT_UI.bg + "; color:" + OPT_UI.text + "; border:1px solid " + OPT_UI.bg + "; padding:0px; }" +
   "QLabel:disabled { color:" + OPT_UI.textMute + "; }" +
   "QLineEdit, QSpinBox, QDoubleSpinBox { background-color:" + OPT_UI.bgInset + "; color:" + OPT_UI.text + "; border:1px solid " + OPT_UI.border + "; border-radius:" + OPT_UI.radius + "; padding:3px 7px; selection-background-color:" + OPT_UI.primary + "; }" +
   "QComboBox { background-color:" + OPT_UI.comboBg + "; color:" + OPT_UI.text + "; border:1px solid " + OPT_UI.primary + "; border-radius:" + OPT_UI.radius + "; padding:3px 7px; selection-background-color:" + OPT_UI.primary + "; min-height:20px; }" +
   "QLineEdit:focus, QSpinBox:focus, QDoubleSpinBox:focus { border:1px solid " + OPT_UI.borderStrong + "; }" +
   "QComboBox:focus, QComboBox:hover { background-color:" + OPT_UI.comboBgHover + "; border:1px solid " + OPT_UI.primary + "; }" +
   "QComboBox::drop-down { background-color:" + OPT_UI.comboDrop + "; border:1px solid " + OPT_UI.comboDrop + "; border-left:1px solid " + OPT_UI.primary + "; width:20px; }" +
   "QComboBox::down-arrow { width:9px; height:9px; }" +
   "QComboBox QAbstractItemView { background-color:" + OPT_UI.comboBg + " !important; color:" + OPT_UI.text + " !important; selection-background-color:" + OPT_UI.bgPanelAlt + " !important; selection-color:" + OPT_UI.text + " !important; border:1px solid " + OPT_UI.primary + "; outline:0px; }" +
   "QComboBox QAbstractItemView::item { background-color:" + OPT_UI.comboBg + " !important; color:" + OPT_UI.text + " !important; padding:4px; }" +
   "QComboBox QAbstractItemView::item:selected { background-color:" + OPT_UI.bgPanelAlt + " !important; color:" + OPT_UI.text + " !important; }" +
   "QPushButton { background-color:" + OPT_UI.bgPanelAlt + "; color:" + OPT_UI.text + "; border:1px solid " + OPT_UI.border + "; border-radius:" + OPT_UI.radius + "; padding:5px 12px; background-image:none; }" +
   "QPushButton:hover { background-color:" + OPT_UI.border + "; color:" + OPT_UI.text + "; border:1px solid " + OPT_UI.borderStrong + "; background-image:none; }" +
   "QPushButton:pressed { background-color:" + OPT_UI.bgInset + "; color:" + OPT_UI.text + "; border:1px solid " + OPT_UI.borderStrong + "; background-image:none; }" +
   "QPushButton:disabled { background-color:" + OPT_UI.bgPanel + "; color:" + OPT_UI.textMute + "; border:1px solid " + OPT_UI.border + "; background-image:none; }" +
   "QScrollBar:vertical { background-color:" + OPT_UI.bg + "; width:10px; margin:0; }" +
   "QScrollBar::handle:vertical { background:" + OPT_UI.border + "; border-radius:5px; min-height:20px; }" +
   "QScrollBar::handle:vertical:hover { background:" + OPT_UI.borderStrong + "; }" +
   "QScrollBar::add-line, QScrollBar::sub-line { height:0; }" +
   "QScrollBar::add-page, QScrollBar::sub-page { background-color:" + OPT_UI.bg + "; }" +
   "QTabWidget::pane { background-color:" + OPT_UI.bg + "; border:1px solid " + OPT_UI.bg + "; padding:0px; }" +
   "QTabBar { background:" + OPT_UI.bg + "; border-bottom:1px solid " + OPT_UI.border + "; }" +
   "QTabBar::tab { background-color:" + OPT_UI.bg + "; color:" + OPT_UI.textDim + "; padding:8px 16px; border:1px solid " + OPT_UI.bg + "; border-bottom:2px solid " + OPT_UI.bg + "; font-size:9pt; font-weight:500; margin-right:2px; }" +
   "QTabBar::tab:hover { background-color:" + OPT_UI.bg + "; color:" + OPT_UI.text + "; border:1px solid " + OPT_UI.bg + "; border-bottom:2px solid " + OPT_UI.bg + "; }" +
   "QTabBar::tab:selected { background-color:" + OPT_UI.bg + "; color:" + OPT_UI.text + "; border:1px solid " + OPT_UI.bg + "; border-bottom:2px solid " + OPT_UI.primary + "; font-weight:600; }" +
   "QToolTip { background:" + OPT_UI.bgPanel + "; color:" + OPT_UI.text + "; border:1px solid " + OPT_UI.borderStrong + "; padding:5px 8px; border-radius:5px; }" +
   "QGroupBox { background-color:" + OPT_UI.bgPanel + "; color:" + OPT_UI.textDim + "; border:1px solid " + OPT_UI.border + "; border-radius:" + OPT_UI.radiusLg + "; margin-top:10px; padding:8px; background-image:none; }" +
   "QGroupBox::title { subcontrol-origin:margin; subcontrol-position:top left; padding:0 6px; color:" + OPT_UI.textDim + "; font-size:9pt; font-weight:500; background:" + OPT_UI.bgPanel + "; }" +
   "QFrame, QPushButton, QGroupBox, QLabel, QWidget { background-image:none; }";

var OPT_CSS_HEADER =
   "QLabel { background-color:#FF2b2015; color:" + OPT_UI.primary + "; font-size:8pt; font-weight:600; border:1px solid #FF3d2e1a; border-radius:" + OPT_UI.radiusLg + "; padding:2px 10px; margin-top:2px; margin-bottom:1px; }";

var OPT_CSS_ENGINE_TITLE =
   "QLabel { color:" + OPT_UI.primary + "; background-color:" + OPT_UI.bgPanel + "; border:1px solid " + OPT_UI.border + "; border-radius:" + OPT_UI.radiusLg + "; padding:8px 12px; font-size:9pt; font-weight:700; letter-spacing:2px; min-height:20px; qproperty-alignment:AlignCenter; }";

var OPT_CSS_INFO =
   "QLabel { background-color:" + OPT_UI.bgPanel + "; color:" + OPT_UI.textDim + "; border:1px solid " + OPT_UI.bgPanel + "; padding:3px 2px; }";

var OPT_CSS_MODE_WRAPPER =
   "QWidget { background-color:" + OPT_UI.bgInset + "; border:1px solid " + OPT_UI.border + "; border-radius:" + OPT_UI.radiusLg + "; padding:2px; }";

var OPT_CSS_MODE_ON =
   "QPushButton { background-color:" + OPT_UI.bgPanelAlt + "; color:" + OPT_UI.text + "; border:1px solid " + OPT_UI.border + "; border-radius:" + OPT_UI.radius + "; padding:4px 14px; font-weight:600; background-image:none; }" +
   "QPushButton:hover { background-color:" + OPT_UI.bgPanelAlt + "; color:" + OPT_UI.text + "; border:1px solid " + OPT_UI.borderStrong + "; background-image:none; }";

var OPT_CSS_MODE_OFF =
   "QPushButton { background-color:" + OPT_UI.bgInset + "; color:" + OPT_UI.textDim + "; border:1px solid " + OPT_UI.border + "; border-radius:" + OPT_UI.radius + "; padding:4px 14px; font-weight:500; background-image:none; }" +
   "QPushButton:hover { background-color:" + OPT_UI.bgInset + "; color:" + OPT_UI.text + "; border:1px solid " + OPT_UI.border + "; background-image:none; }";

var OPT_CSS_PRIMARY =
   "QPushButton { background-color:" + OPT_UI.primary + "; color:" + OPT_UI.bg + "; border:1px solid " + OPT_UI.primary + "; border-radius:" + OPT_UI.radius + "; padding:6px 14px; font-weight:600; background-image:none; }" +
   "QPushButton:hover { background-color:" + OPT_UI.primaryHover + "; color:" + OPT_UI.bg + "; border:1px solid " + OPT_UI.primaryHover + "; background-image:none; }" +
   "QPushButton:pressed { background-color:" + OPT_UI.text + "; color:" + OPT_UI.bg + "; border:1px solid " + OPT_UI.text + "; background-image:none; }";

var OPT_CSS_SET_CURRENT =
   "QPushButton { background-color:" + OPT_UI.primaryBg + "; color:" + OPT_UI.primary + "; border:1px solid " + OPT_UI.primary + "; border-radius:" + OPT_UI.radius + "; padding:6px 14px; font-weight:700; background-image:none; }" +
   "QPushButton:hover { background-color:" + OPT_UI.primary + "; color:" + OPT_UI.bg + "; border:1px solid " + OPT_UI.primary + "; background-image:none; }" +
   "QPushButton:disabled { background-color:" + OPT_UI.bgInset + "; color:" + OPT_UI.textMute + "; border:1px solid " + OPT_UI.border + "; background-image:none; }";

var OPT_CSS_SET_CURRENT_APPLIED =
   "QPushButton { background-color:" + OPT_UI.successBg + "; color:" + OPT_UI.success + "; border:1px solid " + OPT_UI.success + "; border-radius:" + OPT_UI.radius + "; padding:6px 14px; font-weight:700; background-image:none; }" +
   "QPushButton:disabled { background-color:" + OPT_UI.successBg + "; color:" + OPT_UI.success + "; border:1px solid " + OPT_UI.success + "; background-image:none; }";

var OPT_CSS_MEMORY_EMPTY =
   "QPushButton { background-color:" + OPT_UI.bgInset + "; color:" + OPT_UI.textMute + "; border:1px solid " + OPT_UI.border + "; border-radius:" + OPT_UI.radius + "; font-size:8pt; padding:2px 0; min-width:26px; min-height:22px; background-image:none; }" +
   "QPushButton:hover { background-color:" + OPT_UI.bgInset + "; color:" + OPT_UI.text + "; border:1px solid " + OPT_UI.borderStrong + "; background-image:none; }";

var OPT_CSS_MEMORY_FILLED =
   "QPushButton { background-color:" + OPT_UI.bgPanelAlt + "; color:" + OPT_UI.text + "; border:1px solid " + OPT_UI.border + "; border-radius:" + OPT_UI.radius + "; font-size:8pt; padding:2px 0; min-width:26px; min-height:22px; background-image:none; }";

var OPT_CSS_PATH_DONE =
   "QPushButton { background-color:" + OPT_UI.successBg + "; color:" + OPT_UI.success + "; border:1px solid " + OPT_UI.success + "; border-radius:" + OPT_UI.radius + "; padding:4px 8px; font-weight:600; background-image:none; }";

var OPT_CSS_PATH_ACTIVE =
   "QPushButton { background-color:" + OPT_UI.primaryBg + "; color:" + OPT_UI.primary + "; border:1px solid " + OPT_UI.primary + "; border-radius:" + OPT_UI.radius + "; padding:4px 8px; font-weight:700; background-image:none; }";

var OPT_CSS_RECIPE =
   "QPushButton { background-color:" + OPT_UI.bg + "; color:" + OPT_UI.textDim + "; border:1px solid " + OPT_UI.borderStrong + "; border-radius:3px; padding:3px 2px; font-size:8pt; min-height:20px; background-image:none; }" +
   "QPushButton:hover { background-color:" + OPT_UI.bgPanel + "; color:" + OPT_UI.text + "; border-color:" + OPT_UI.primary + "; background-image:none; }";

function optSetControlVisible(control, visible) {
   if (!control)
      return;
   var isVisible = visible === true;
   control.__optVisible = isVisible;
   try { control.visible = isVisible; } catch (e0) {}
   try {
      if (isVisible) {
         if (typeof control.show === "function")
            control.show();
      } else {
         if (typeof control.hide === "function")
            control.hide();
      }
   } catch (e1) {
   }
}

var OPT_CSS_RECIPE_SELECTED =
   "QPushButton { background-color:" + OPT_UI.primaryBg + "; color:" + OPT_UI.primary + "; border:1px solid " + OPT_UI.primary + "; border-radius:3px; padding:3px 2px; font-size:8pt; min-height:20px; font-weight:bold; background-image:none; }" +
   "QPushButton:hover { background-color:" + OPT_UI.primaryBg + "; color:" + OPT_UI.primaryHover + "; border-color:" + OPT_UI.primaryHover + "; background-image:none; }";

var OPT_CSS_GROUP_INNER =
   "QGroupBox { background-color:" + OPT_UI.bgPanel + "; color:" + OPT_UI.textDim + "; border:1px solid " + OPT_UI.border + "; border-radius:" + OPT_UI.radius + "; margin-top:10px; padding:7px; }" +
   "QGroupBox::title { subcontrol-origin:margin; subcontrol-position:top left; padding:0 6px; color:" + OPT_UI.textDim + "; background:" + OPT_UI.bgPanel + "; }";

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
   var bits = 32;
   try { bits = referenceView.window.bitsPerSample; } catch (e0) {}
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
   try { targetWindow.mainView.window.copyAstrometricSolution(sourceView.window); } catch (e1) {}
}


function optTooltipTextByKey(key) {
   if (!key || key.length < 1)
      return "";
   try {
      if (typeof OPT6D_TOOLTIPS !== "undefined" && OPT6D_TOOLTIPS != null) {
         if (typeof OPT6D_TOOLTIPS[key] !== "undefined")
            return OPT6D_TOOLTIPS[key];
      }
   } catch (e0) {}
   return "";
}

function optNormalizeTooltipLabel(text) {
   var t = "";
   try { t = String(text || ""); } catch (e0) { t = ""; }
   t = t.replace(/<[^>]*>/g, " ");
   t = t.replace(/&nbsp;/g, " ");
   t = t.replace(/\s+/g, " ");
   t = t.replace(/^\s+|\s+$/g, "");
   return t;
}

function optTooltipFor(kind, labelText, genericKind) {
   var label = optNormalizeTooltipLabel(labelText);
   var keys = [];
   if (kind && label)
      keys.push(kind + "." + label);
   if (kind && label.charAt(label.length - 1) !== ":")
      keys.push(kind + "." + label + ":");
   if (kind && label.charAt(label.length - 1) === ":")
      keys.push(kind + "." + label.substring(0, label.length - 1));
   if (label)
      keys.push(label);
   if (genericKind)
      keys.push("generic." + genericKind);
   for (var i = 0; i < keys.length; ++i) {
      var tt = optTooltipTextByKey(keys[i]);
      if (tt && tt.length > 0)
         return tt;
   }
   return "";
}

function optApplyTooltip(control, kind, labelText, genericKind) {
   if (!control)
      return;
   var tt = optTooltipFor(kind, labelText, genericKind);
   if (!tt || tt.length < 1)
      return;
   try { control.toolTip = tt; } catch (e0) {}
}

function optApplyExplicitTooltip(control, key, fallback) {
   if (!control)
      return;
   var tt = optTooltipTextByKey(key);
   if ((!tt || tt.length < 1) && fallback)
      tt = fallback;
   if (!tt || tt.length < 1)
      return;
   try { control.toolTip = tt; } catch (e0) {}
}

function optApplyCheckBoxTooltip(checkBox) {
   if (!checkBox)
      return;
   var text = "";
   try { text = checkBox.text; } catch (e0) {}
   optApplyTooltip(checkBox, "check", text, "CheckBox");
}

function optTooltipAlreadyApplied(control) {
   for (var i = 0; i < OPT6D_TOOLTIP_APPLIED_CONTROLS.length; ++i)
      if (OPT6D_TOOLTIP_APPLIED_CONTROLS[i] === control)
         return true;
   OPT6D_TOOLTIP_APPLIED_CONTROLS.push(control);
   return false;
}

function optApplyContextTooltipsDeep(control, depth) {
   if (!control || depth > 24)
      return;
   if (optTooltipAlreadyApplied(control))
      return;
   try {
      if (typeof control.title !== "undefined" && control.title)
         optApplyTooltip(control, "group", control.title, "");
   } catch (e1) {}
   try {
      if (typeof control.text !== "undefined" && control.text) {
         optApplyTooltip(control, "button", control.text, "");
         optApplyTooltip(control, "check", control.text, "");
         optApplyTooltip(control, "section", control.text, "");
         optApplyTooltip(control, "title", control.text, "");
      }
   } catch (e2) {}
   try {
      var children = control.children;
      if (children && typeof children.length !== "undefined") {
         for (var i = 0; i < children.length; ++i)
            optApplyContextTooltipsDeep(children[i], depth + 1);
      }
   } catch (e3) {}
}

function optFormatRecommendedRepositoriesText() {
   var text = "";
   text += "PI Workflow Opt_6d - Recommended Repositories\n";
   text += "================================================\n\n";
   text += "Add repositories in PixInsight: Resources > Updates > Manage Repositories.\n";
   text += "After adding them, run Resources > Updates > Check for Updates and restart PixInsight when requested.\n\n";
   try {
      if (typeof OPT6D_RECOMMENDED_REPOSITORIES !== "undefined" && OPT6D_RECOMMENDED_REPOSITORIES != null) {
         text += "PIXINSIGHT UPDATE REPOSITORIES\n";
         text += "------------------------------\n";
         for (var i = 0; i < OPT6D_RECOMMENDED_REPOSITORIES.length; ++i) {
            var r = OPT6D_RECOMMENDED_REPOSITORIES[i];
            text += (i + 1) + ". " + r.name + "\n";
            text += "   URL: " + r.url + "\n";
            text += "   Required for: " + r.requiredFor + "\n";
            text += "   Notes: " + r.status + "\n\n";
         }
      }
   } catch (e0) {}
   try {
      if (typeof OPT6D_NON_REPOSITORY_REQUIREMENTS !== "undefined" && OPT6D_NON_REPOSITORY_REQUIREMENTS != null) {
         text += "NON-REPOSITORY RESOURCES\n";
         text += "------------------------\n";
         for (var j = 0; j < OPT6D_NON_REPOSITORY_REQUIREMENTS.length; ++j) {
            var n = OPT6D_NON_REPOSITORY_REQUIREMENTS[j];
            text += (j + 1) + ". " + n.name + "\n";
            text += "   URL: " + n.url + "\n";
            text += "   Required for: " + n.requiredFor + "\n";
            text += "   Notes: " + n.status + "\n\n";
         }
      }
   } catch (e1) {}
   return text;
}

function optShowRecommendedRepositoriesDialog(parent) {
   var d = new Dialog();
   d.windowTitle = "Recommended Repositories";
   d.sizer = new VerticalSizer();
   d.sizer.margin = 8;
   d.sizer.spacing = 6;
   var title = new Label(d);
   title.useRichText = true;
   title.text = "<b>PI Workflow Opt_6d Recommended Repositories</b>";
   title.styleSheet = OPT_CSS_ENGINE_TITLE;
   d.sizer.add(title);
   var info = optInfoLabel(d, "<p>These are the update repositories and external data resources used by the workflow. Add only the tools you actually intend to use.</p>");
   d.sizer.add(info);
   var box = new TextBox(d);
   box.readOnly = true;
   box.minWidth = 760;
   box.minHeight = 420;
   box.styleSheet =
      "QTextEdit { background-color:" + OPT_UI.bgInset +
      "; color:" + OPT_UI.text +
      "; border:1px solid " + OPT_UI.border +
      "; border-radius:4px; font-family:Consolas,monospace; font-size:8pt; padding:6px; }";
   box.text = optFormatRecommendedRepositoriesText();
   d.sizer.add(box, 100);
   var row = new Control(d);
   row.sizer = new HorizontalSizer();
   row.sizer.spacing = 6;
   row.sizer.addStretch();
   var closeButton = optPrimaryButton(row, "Close", 100);
   closeButton.onClick = function() { d.ok(); };
   row.sizer.add(closeButton);
   d.sizer.add(row);
   d.execute();
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
         for (var x = 0; x < rw; ++x) {
            var a = 0.65 * optClamp01(mRow[x]);
            var rv = optClamp01(rRow[x]);
            var gv = color ? optClamp01(gRow[x]) : rv;
            var bv = color ? optClamp01(bRow[x]) : rv;
            var rr = Math.max(0, Math.min(255, Math.round(255 * (rv * (1 - a) + a))));
            var gg = Math.max(0, Math.min(255, Math.round(255 * (gv * (1 - a)))));
            var bb = Math.max(0, Math.min(255, Math.round(255 * (bv * (1 - a)))));
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

function optNumericValue(control, fallback) {
   try {
      if (control && isFinite(control.value))
         return control.value;
   } catch (e) {}
   return fallback;
}

function optChecked(control, fallback) {
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

function OptPreviewScheduler(owner) {
   this.owner = owner || null;
   this.jobs = {};
   this.closed = false;
}

OptPreviewScheduler.prototype.cancel = function(key) {
   var job = this.jobs[key || "__default__"];
   if (!job)
      return;
   try { if (job.timer) job.timer.stop(); } catch (e0) {}
   job.timer = null;
   job.generation++;
};

OptPreviewScheduler.prototype.cancelAll = function() {
   this.closed = true;
   for (var key in this.jobs)
      if (optHasOwn(this.jobs, key))
         this.cancel(key);
};

OptPreviewScheduler.prototype.request = function(key, fn, options) {
   if (this.closed)
      return null;
   var k = key || "__default__";
   if (!this.jobs[k])
      this.jobs[k] = { timer: null, generation: 0, busy: false, pending: false };
   var job = this.jobs[k];
   job.generation++;
   var generation = job.generation;
   var delayMs = Math.max(0, Math.round((options && options.debounceMs) || 0));
   var scheduler = this;
   function runNow() {
      if (scheduler.closed || generation !== job.generation)
         return null;
      if (job.busy) {
         job.pending = true;
         return null;
      }
      job.busy = true;
      try {
         if (options && options.busyPreviewControl)
            options.busyPreviewControl.setBusy(true, options.busyOverlayText || "Working");
         if (options && options.statusLabel && options.busyText)
            options.statusLabel.text = options.busyText;
         var out = fn ? fn.call(scheduler.owner) : null;
         if (options && options.statusLabel && options.doneText)
            options.statusLabel.text = options.doneText;
         return out;
      } catch (e) {
         if (options && options.statusLabel && options.errorText)
            options.statusLabel.text = options.errorText;
         if (options && typeof options.onError === "function")
            options.onError.call(scheduler.owner, k, e);
         else
            console.warningln("Preview job failed: " + e.message);
         return null;
      } finally {
         if (options && options.busyPreviewControl)
            options.busyPreviewControl.setBusy(false);
         job.busy = false;
         if (job.pending) {
            job.pending = false;
            scheduler.request(k, fn, options);
         }
      }
   }
   try { if (job.timer) job.timer.stop(); } catch (e0) {}
   if (delayMs <= 0 || typeof Timer === "undefined")
      return runNow();
   var timer = new Timer();
   try { timer.singleShot = true; } catch (e1) {}
   try { timer.periodic = false; } catch (e2) {}
   try { timer.interval = Math.max(0.001, delayMs / 1000.0); } catch (e3) {}
   timer.onTimeout = runNow;
   job.timer = timer;
   try { timer.start(); } catch (e4) { return runNow(); }
   return null;
};

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

function optApplyPreCandidate(view, actionKey, dialog) {
   if (!optSafeView(view))
      throw new Error("No valid candidate view.");
   if (actionKey === "gradient") {
      var hasComboGradient = dialog && optHasOwn(dialog, "comboPreGradient") && dialog.comboPreGradient;
      var idx = hasComboGradient ? dialog.comboPreGradient.currentItem : 0;
      var label = hasComboGradient ? optComboText(dialog.comboPreGradient, "Gradient Correction") : "Gradient Correction";
      console.writeln("=> Pre Gradient Correction preview path: " + label);
      return optExecuteGradientCorrectionForView(view, dialog);
   }
   if (actionKey === "decon") {
      var hasComboDecon = dialog && optHasOwn(dialog, "comboPreDecon") && dialog.comboPreDecon;
      var decon = hasComboDecon ? optComboText(dialog.comboPreDecon, "BlurXTerminator") : "BlurXTerminator";
      console.writeln("=> Pre Deconvolution preview path: " + decon);
      if (hasComboDecon && dialog.comboPreDecon.currentItem === 1) {
         if (!optIsCosmicClarityAvailable())
            throw new Error("Cosmic Clarity: ExternalProcess not available in this PixInsight build.");
         return optRunCosmicClarityOnView(view, optBuildPreCosmicClarityConfig(dialog));
      }
      return optExecuteBlurXConfiguredOnView(view, optBuildPreBlurXConfigFromControls(dialog));
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

function optCopyAstrometricSolution(targetWindow, sourceWindow) {
   try {
      if (targetWindow && !targetWindow.isNull && sourceWindow && !sourceWindow.isNull &&
          typeof targetWindow.copyAstrometricSolution === "function")
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

function optStageList(record) {
   var out = [];
   if (!record || !record.stages)
      return out;
   for (var key in record.stages)
      if (optHasOwn(record.stages, key) && record.stages[key] === true)
         out.push(key);
   return out;
}

function optIsColorCorrectionStage(stage) {
   if (!stage)
      return false;
   return stage.indexOf("Color Calibration") >= 0 ||
          stage.indexOf("SPCC") >= 0 ||
          stage.indexOf("Auto Linear Fit") >= 0 ||
          stage.indexOf("Background Neutralization") >= 0;
}

function optRecordHasColorCorrection(record) {
   var stages = optStageList(record);
   for (var i = 0; i < stages.length; ++i)
      if (optIsColorCorrectionStage(stages[i]))
         return true;
   return false;
}

function OptImageRecord(key) {
   this.key = key;
   this.label = optLabelForKey(key);
   this.view = null;
   this.owned = false;
   this.available = {};
   this.stages = {};
}

OptImageRecord.prototype.clearView = function() {
   optReleaseOwnedSlotViews(this);
   this.view = null;
   this.owned = false;
};

function OptImageStore() {
   this.records = {};
   var keys = optAllWorkflowKeys();
   for (var i = 0; i < keys.length; ++i)
      this.records[keys[i]] = new OptImageRecord(keys[i]);
}

OptImageStore.prototype.record = function(key) {
   if (!optHasOwn(this.records, key))
      this.records[key] = new OptImageRecord(key);
   return this.records[key];
};

OptImageStore.prototype.setView = function(key, view, owned, tabName) {
   var rec = this.record(key);
   // #2: invalidate histogram cache for the previous view before clearing.
   if (optSafeView(rec.view))
      optInvalidateHistogramCache(rec.view.id);
   rec.clearView();
   rec.view = optSafeView(view) ? view : null;
   rec.owned = owned === true;
   if (!rec.available)
      rec.available = {};
   if (tabName && typeof tabName === "string" && tabName.length > 0)
      rec.available[tabName] = optSafeView(view);
   return rec;
};

OptImageStore.prototype.setAvailable = function(key, tabName, available) {
   var rec = this.record(key);
   if (!rec.available)
      rec.available = {};
   if (tabName && typeof tabName === "string" && tabName.length > 0)
      rec.available[tabName] = available === true;
};

OptImageStore.prototype.isAvailable = function(key, tabName) {
   var rec = this.record(key);
   if (!optSafeView(rec.view))
      return false;
   var availableMap = rec.available;
   if (!availableMap || !tabName || !optHasOwn(availableMap, tabName))
      return false;
   try {
      return availableMap[tabName] === true;
   } catch (e) {}
   return false;
};

OptImageStore.prototype.markStage = function(key, stage) {
   if (key && stage)
      this.record(key).stages[stage] = true;
};

OptImageStore.prototype.keysForTab = function(tabName) {
   var out = [];
   var keys = optAllWorkflowKeys();
   for (var i = 0; i < keys.length; ++i)
      if (this.isAvailable(keys[i], tabName))
         out.push(keys[i]);
   return out;
};

OptImageStore.prototype.releaseAll = function() {
   for (var key in this.records)
      if (optHasOwn(this.records, key))
         this.records[key].clearView();
};

function optAcronym(text, fallback) {
   var s = String(text || "").replace(/\([^)]*\)/g, " ").replace(/[^A-Za-z0-9]+/g, " ");
   var words = s.split(" ");
   var out = "";
   for (var i = 0; i < words.length; ++i) {
      var w = words[i];
      if (!w || w.length < 1)
         continue;
      var low = w.toLowerCase();
      if (low === "to" || low === "and" || low === "the" || low === "of" || low === "with" || low === "apply")
         continue;
      out += w.charAt(0).toUpperCase();
   }
   return out.length > 0 ? out : (fallback || "M");
}

function optControlSignature(control) {
   if (!control)
      return "";
   try {
      if (typeof control.currentItem !== "undefined")
         return "i" + control.currentItem;
   } catch (e0) {}
   try {
      if (typeof control.value !== "undefined")
         return "v" + format("%.6f", control.value);
   } catch (e1) {}
   try {
      if (typeof control.checked !== "undefined")
         return control.checked === true ? "1" : "0";
   } catch (e2) {}
   return "";
}

function optMemoryJoinSignature(items) {
   var out = [];
   for (var i = 0; i < items.length; ++i)
      out.push(optControlSignature(items[i]));
   return out.join("|");
}

function optMemoryMenuCode(tabName, stageName) {
   var s = String(stageName || "");
   if (s.indexOf("Gradient Correction") >= 0) return "GC";
   if (s.indexOf("Color Calibration") >= 0 || s.indexOf("SPCC") >= 0 || s.indexOf("Auto Linear Fit") >= 0 || s.indexOf("Background Neutralization") >= 0) return "CC";
   if (s.indexOf("Deconvolution") >= 0) return "D";
   if (s.indexOf("Noise Reduction") >= 0) return "NR";
   if (s.indexOf("Sharpening") >= 0) return "S";
   if (s.indexOf("Color Balance") >= 0) return "CB";
   if (s.indexOf("Curves") >= 0 || s.indexOf("CURVES") >= 0) return "C";
   if (s.indexOf("Channel Combination") >= 0) return "CC";
   if (s.indexOf("Stretch") >= 0) return "ST";
   if (tabName === OPT_TAB_PRE) return "PP";
   if (tabName === OPT_TAB_STRETCH) return "ST";
   if (tabName === OPT_TAB_POST) return "PP";
   if (tabName === OPT_TAB_CC) return "CC";
   return optAcronym(stageName, "M");
}

function optMemoryAlgorithmInfo(tabName, stageName, actionKey, dlg, resultMeta) {
   var info = { algorithm: "", signature: "" };
   if (resultMeta && resultMeta.algorithm) {
      info.algorithm = resultMeta.algorithm;
      info.signature = resultMeta.signature || resultMeta.algorithm;
      return info;
   }
   if (actionKey === "gradient") {
      var idx = 0;
      try { idx = dlg.comboPreGradient.currentItem; } catch (e0) {}
      if (idx === 0) {
         info.algorithm = "MGC";
         info.signature = optMemoryJoinSignature([dlg.comboMgcScale.combo, dlg.comboMgcSep.combo, dlg.ncMgcSmoothness, dlg.ncMgcScaleR, dlg.ncMgcScaleG, dlg.ncMgcScaleB]);
      } else if (idx === 1) {
         info.algorithm = "ADBE";
         info.signature = optMemoryJoinSignature([dlg.ncAdbePaths, dlg.ncAdbeTol, dlg.ncAdbeSmooth]);
      } else if (idx === 2) {
         info.algorithm = "ABE";
         info.signature = optMemoryJoinSignature([dlg.comboAbeCorrection.combo, dlg.ncAbeFunctionDegree, dlg.chkAbeNormalize]);
      } else {
         info.algorithm = "GX";
         info.signature = optMemoryJoinSignature([dlg.comboGraXpertCorrection.combo, dlg.ncGraXpertSmoothing]);
      }
      return info;
   }
   if (actionKey === "decon") {
      var deconIdx = 0;
      try { deconIdx = dlg.comboPreDecon.currentItem; } catch (e1) {}
      info.algorithm = deconIdx === 1 ? "CC" : "BXT";
      info.signature = deconIdx + "|" + (deconIdx === 1 ?
         optMemoryJoinSignature([dlg.comboPreCCSharpenMode.combo, dlg.ncPreCCStellarAmt, dlg.ncPreCCNSStrength, dlg.ncPreCCNSAmount, dlg.chkPreCCRemoveAb]) :
         optMemoryJoinSignature([dlg.ncBxtStars, dlg.ncBxtAdjustStarHalos, dlg.chkBxtAutoPSF, dlg.ncBxtPSFDiameter, dlg.ncBxtSharpenNonstellar, dlg.chkBxtCorrectOnly, dlg.chkBxtLuminanceOnly]));
      return info;
   }
   if (actionKey === "spcc") { info.algorithm = "SPCC"; info.signature = "SPCC"; return info; }
   if (actionKey === "alf") { info.algorithm = "ALF"; info.signature = "ALF"; return info; }
   if (actionKey === "bn") { info.algorithm = "BN"; info.signature = "BN"; return info; }
   if (actionKey === "post_nr") {
      var nrIdx = 0;
      try { nrIdx = dlg.comboPostNR.currentItem; } catch (e2) {}
      info.algorithm = nrIdx === 0 ? "NXT" : (nrIdx === 1 ? "TGV" : "CC");
      info.signature = "nr" + nrIdx + "|" + optMemoryJoinSignature([dlg.ncPostNxtDenoise, dlg.ncPostNxtIter, dlg.chkPostNxtColorSep, dlg.chkPostNxtFreqSep, dlg.ncPostNxtDenoiseColor, dlg.ncPostTgvStrengthL, dlg.ncPostTgvStrengthC, dlg.ncPostTgvEdge, dlg.ncPostTgvSmooth, dlg.ncPostTgvIter, dlg.comboPostCCDenoiseMode.combo, dlg.comboPostCCDenoiseModel.combo, dlg.ncPostCCNRLuma, dlg.ncPostCCNRColor, dlg.chkPostCCNRRemoveAb, dlg.chkPostNRUseMask]);
      return info;
   }
   if (actionKey === "post_sharp") {
      var shIdx = 0;
      try { shIdx = dlg.comboPostSharp.currentItem; } catch (e3) {}
      var shNames = ["BXT", "USM", "HDR", "LHE", "DSE", "CC"];
      info.algorithm = shNames[Math.max(0, Math.min(shNames.length - 1, shIdx))];
      info.signature = "sh" + shIdx + "|" + optMemoryJoinSignature([dlg.ncPostBxtStars, dlg.ncPostBxtAdjustStarHalos, dlg.chkPostBxtAutoPSF, dlg.ncPostBxtPSFDiameter, dlg.ncPostBxtSharpenNonstellar, dlg.ncPostUsmSigma, dlg.ncPostUsmAmount, dlg.chkPostUsmDeringing, dlg.ncPostHdrLayers, dlg.ncPostHdrIter, dlg.ncPostHdrOverdrive, dlg.ncPostLheRadius, dlg.ncPostLheSlope, dlg.ncPostLheAmount, dlg.ncPostDseAmount, dlg.comboPostCCSharpenModeCombo, dlg.ncPostCCStellarAmt, dlg.ncPostCCNSStrength, dlg.ncPostCCNSAmount, dlg.chkPostCCRemoveAb, dlg.chkPostSharpUseMask]);
      return info;
   }
   if (actionKey === "post_color") {
      info.algorithm = "CB";
      info.signature = optMemoryJoinSignature([dlg.ncPostColorBalanceSaturation, dlg.ncPostBalanceR, dlg.ncPostBalanceG, dlg.ncPostBalanceB, dlg.ncPostBalanceSat, dlg.chkPostBalanceSCNR, dlg.ncPostBalanceSCNR, dlg.chkPostColorUseMask]);
      return info;
   }
   if (actionKey === "post_curves") {
      info.algorithm = "CUR";
      info.signature = optMemoryJoinSignature([dlg.comboPostCurvesChan, dlg.ncPostCurvesContrast, dlg.ncPostCurvesBright, dlg.ncPostCurvesShadows, dlg.ncPostCurvesHighlights, dlg.ncPostCurvesSaturation, dlg.chkPostCurvesUseMask]);
      return info;
   }
   if (String(stageName || "").indexOf("Stretch ") === 0) {
      info.algorithm = String(stageName).replace("Stretch ", "");
      info.signature = info.algorithm;
      return info;
   }
   if (String(stageName || "").indexOf("Image") === 0) {
      info.algorithm = String(stageName).toUpperCase();
      info.signature = info.algorithm;
      return info;
   }
   info.algorithm = optAcronym(stageName, "IMG");
   info.signature = String(stageName || info.algorithm);
   return info;
}

function optBuildMemoryMeta(pane, stageName, actionKey, resultMeta) {
   var info = optMemoryAlgorithmInfo(pane ? pane.tab : "", stageName, actionKey, pane ? pane.dialog : null, resultMeta);
   var key = pane && pane.currentKey ? pane.currentKey : "";
   var menu = optMemoryMenuCode(pane ? pane.tab : "", stageName);
   return {
      key: key,
      image: optLabelForKey(key),
      stage: stageName || "",
      menu: menu,
      algorithm: info.algorithm || "IMG",
      signature: menu + "|" + (info.algorithm || "IMG") + "|" + (info.signature || ""),
      gradient: resultMeta && resultMeta.gradient === true
   };
}

// Returns the canonical "workflow stage" string that downstream gates expect
// for each tab. Used as a safety-net when committing from Memory so the
// "To <next>" buttons recognize the image as having passed through this tab,
// regardless of whether the slot meta carried a specific stage name.
function optDefaultTabStageLabel(tab) {
   if (tab === OPT_TAB_PRE)     return "Pre Processing (Memory)";
   if (tab === OPT_TAB_STRETCH) return "Stretch (Memory)";
   if (tab === OPT_TAB_POST)    return "Post Processing (Memory)";
   if (tab === OPT_TAB_CC)      return "Channel Combination (Memory)";
   return "";
}

function optMemoryCloneView(view, prefix, key, index) {
   if (!optSafeView(view))
      return null;
   return optCloneView(view, optUniqueId(prefix + "_" + (key || "Image") + "_" + (index + 1)), false);
}

function optReleaseOwnedSlotViews(slot) {
   if (!slot)
      return;
   if (slot.owned)
      optCloseViews([slot.view]);
   if (slot.gradientOwned)
      optCloseViews([slot.gradientView]);
}

// Memory budget helpers (#5).

function optEstimateViewBytes(view) {
   if (!optSafeView(view))
      return 0;
   try {
      var img = view.image;
      var bps = 4; // float32 default for PixInsight workflow images
      try { bps = Math.max(1, Math.floor(view.window.bitsPerSample / 8)); } catch (e0) { bps = 4; }
      return img.width * img.height * Math.max(1, img.numberOfChannels) * bps;
   } catch (eE) {
      return 0;
   }
}

function optEstimateSlotBytes(slot) {
   if (!slot) return 0;
   var bytes = 0;
   if (slot.owned)
      bytes += optEstimateViewBytes(slot.view);
   if (slot.gradientOwned)
      bytes += optEstimateViewBytes(slot.gradientView);
   return bytes;
}

// Mark a slot as recently accessed. Called after store and recall operations
// so LRU eviction prefers older, non-touched slots first.
function optTouchSlot(slot) {
   if (slot)
      slot.lastAccess = (new Date()).getTime();
}

// Build a flat census of all slots that hold owned views across the dialog's
// memory managers. Each entry tracks where the slot lives so it can be
// released through its manager's normal release path.
function optMemorySlotsCensus(dialog) {
   var entries = [];
   if (!dialog)
      return entries;
   var managers = [];
   if (dialog.preTab && dialog.preTab.preview && dialog.preTab.preview.memory)
      managers.push({ manager: dialog.preTab.preview.memory, label: "Pre", protectedIndex: dialog.preTab.preview.recalledMemoryIndex });
   if (dialog.stretchTab && dialog.stretchTab.preview && dialog.stretchTab.preview.memory)
      managers.push({ manager: dialog.stretchTab.preview.memory, label: "Stretch", protectedIndex: dialog.stretchTab.preview.recalledMemoryIndex });
   if (dialog.postTab && dialog.postTab.preview && dialog.postTab.preview.memory)
      managers.push({ manager: dialog.postTab.preview.memory, label: "Post", protectedIndex: dialog.postTab.preview.recalledMemoryIndex });
   if (dialog.ccTab && dialog.ccTab.preview && dialog.ccTab.preview.memory)
      managers.push({ manager: dialog.ccTab.preview.memory, label: "CC", protectedIndex: dialog.ccTab.preview.recalledMemoryIndex });
   for (var m = 0; m < managers.length; ++m) {
      var mgr = managers[m].manager;
      for (var i = 0; i < mgr.slots.length; ++i) {
         var slot = mgr.slots[i];
         if (!slot || !optSafeView(slot.view))
            continue;
         entries.push({
            kind: "image",
            label: managers[m].label,
            manager: mgr,
            index: i,
            slot: slot,
            bytes: optEstimateSlotBytes(slot),
            lastAccess: slot.lastAccess || 0,
            isProtected: i === managers[m].protectedIndex
         });
      }
   }
   if (dialog.postMaskMemory) {
      var mm = dialog.postMaskMemory;
      for (var k = 0; k < mm.slots.length; ++k) {
         var ms = mm.slots[k];
         if (!ms || !optSafeView(ms.view))
            continue;
         entries.push({
            kind: "mask",
            label: "Mask",
            manager: mm,
            index: k,
            slot: ms,
            bytes: optEstimateSlotBytes(ms),
            lastAccess: ms.lastAccess || 0,
            isProtected: k === mm.selectedIndex
         });
      }
   }
   return entries;
}

function optTotalMemorySlotBytes(dialog) {
   var entries = optMemorySlotsCensus(dialog);
   var total = 0;
   for (var i = 0; i < entries.length; ++i)
      total += entries[i].bytes;
   return total;
}

// Pre-flight memory check: warn the user (via console) when slot usage is
// approaching or has exceeded the soft budget. `addedBytes` (optional) accounts
// for an upcoming store that hasn't happened yet. `context` is a short label
// for the warning. Returns the projected total in bytes. Never throws.
function optMemoryPreflight(dialog, addedBytes, context) {
   if (!dialog)
      return 0;
   var current = 0;
   try { current = optTotalMemorySlotBytes(dialog); } catch (e0) { return 0; }
   var projected = current + (addedBytes || 0);
   var budget = OPT_MEMORY_BUDGET_BYTES;
   var gb = function(b) { return (b / (1024 * 1024 * 1024)).toFixed(2); };
   try {
      if (projected > budget) {
         console.warningln(
            "[Memory] " + (context || "store") +
            ": projected slot usage " + gb(projected) + " GB > budget " + gb(budget) +
            " GB. Oldest non-protected slots will be evicted to free space.");
      } else if (projected > budget * 0.85) {
         console.writeln(
            "[Memory] " + (context || "store") +
            ": slot usage " + gb(projected) + " GB approaching budget " + gb(budget) + " GB.");
      }
   } catch (eC) {}
   return projected;
}

// Releases an entry through its manager. Image-tab managers expose `slots[i]`
// directly with optReleaseOwnedSlotViews; mask manager releases the same way
// but also reflects the change in its UI.
function optEvictSlotEntry(entry) {
   if (!entry || !entry.manager || !entry.slot)
      return false;
   try {
      optReleaseOwnedSlotViews(entry.slot);
   } catch (e0) {}
   entry.manager.slots[entry.index] = null;
   if (entry.kind === "image") {
      var btn = entry.manager.buttons ? entry.manager.buttons[entry.index] : null;
      if (btn) {
         try {
            btn.text = "" + (entry.index + 1);
            btn.toolTip = "Empty memory slot (released to free memory)";
            btn.styleSheet = OPT_CSS_MEMORY_EMPTY;
         } catch (e1) {}
      }
   } else if (entry.kind === "mask") {
      try { entry.manager.refreshButtons(); } catch (e2) {}
   }
   return true;
}

// LRU eviction: while total slot memory exceeds OPT_MEMORY_BUDGET_BYTES,
// release the oldest non-protected slot. Called after every store operation.
// `selfDescription` is logged for the eviction reason.
// `protectedSlot` (optional): { manager, index } that should NEVER be evicted
// during this enforcement pass. Used by the image-memory store path to guarantee
// the slot the user just saved is preserved, regardless of LRU ordering.
function optEnforceMemoryBudget(dialog, selfDescription, protectedSlot) {
   if (!dialog)
      return 0;
   var entries = optMemorySlotsCensus(dialog);
   if (protectedSlot && protectedSlot.manager) {
      for (var p = 0; p < entries.length; ++p) {
         if (entries[p].manager === protectedSlot.manager && entries[p].index === protectedSlot.index)
            entries[p].isProtected = true;
      }
   }
   var total = 0;
   for (var i = 0; i < entries.length; ++i)
      total += entries[i].bytes;
   if (total <= OPT_MEMORY_BUDGET_BYTES)
      return 0;
   // Sort by lastAccess ascending: oldest first.
   entries.sort(function(a, b) { return a.lastAccess - b.lastAccess; });
   var evicted = 0;
   for (var j = 0; j < entries.length && total > OPT_MEMORY_BUDGET_BYTES; ++j) {
      var e = entries[j];
      if (e.isProtected)
         continue;
      var bytes = e.bytes;
      if (optEvictSlotEntry(e)) {
         total -= bytes;
         evicted++;
         try {
            console.noteln("[Memory budget] Evicted " + e.label + " slot " + (e.index + 1) +
                           " (" + Math.round(bytes / (1024 * 1024)) + " MB)" +
                           (selfDescription ? " — " + selfDescription : ""));
         } catch (eL) {}
      }
   }
   return evicted;
}

function OptMemoryManager(slotCount) {
   this.slots = [];
   for (var i = 0; i < slotCount; ++i)
      this.slots.push(null);
   this.buttons = [];
   this.signatureNumbers = {};
   this.nextSignatureNumber = 1;
}

OptMemoryManager.prototype.clear = function() {
   for (var i = 0; i < this.slots.length; ++i) {
      optReleaseOwnedSlotViews(this.slots[i]);
      this.slots[i] = null;
      if (this.buttons[i]) {
         this.buttons[i].text = "" + (i + 1);
         this.buttons[i].toolTip = "Empty memory slot";
         this.buttons[i].styleSheet = OPT_CSS_MEMORY_EMPTY;
      }
   }
   this.signatureNumbers = {};
   this.nextSignatureNumber = 1;
};

OptMemoryManager.prototype.numberForSignature = function(signature) {
   var sig = signature || "default";
   if (!optHasOwn(this.signatureNumbers, sig))
      this.signatureNumbers[sig] = this.nextSignatureNumber++;
   return this.signatureNumbers[sig];
};

OptMemoryManager.prototype.store = function(index, key, view, meta, gradientView) {
   if (index < 0 || index >= this.slots.length || !optSafeView(view))
      return;
   optReleaseOwnedSlotViews(this.slots[index]);
   var clone = optMemoryCloneView(view, "Opt_Memory", key, index);
   var gradClone = optMemoryCloneView(gradientView, "Opt_MemoryGradient", key, index);
   var slotMeta = meta || { image: optLabelForKey(key), menu: "M", algorithm: "IMG", signature: "IMG" };
   slotMeta.number = this.numberForSignature(slotMeta.signature);
   slotMeta.label = (slotMeta.image || optLabelForKey(key)) + " " + slotMeta.menu + " " + slotMeta.algorithm + " " + slotMeta.number;
   this.slots[index] = { key: key, view: clone, owned: true, gradientView: gradClone, gradientOwned: optSafeView(gradClone), meta: slotMeta };
   optTouchSlot(this.slots[index]);
   if (this.buttons[index]) {
      this.buttons[index].text = slotMeta.label;
      this.buttons[index].toolTip = "Memory " + (index + 1) + ": " + slotMeta.label;
      this.buttons[index].styleSheet = OPT_CSS_MEMORY_FILLED;
   }
};

OptMemoryManager.prototype.slot = function(index) {
   if (index < 0 || index >= this.slots.length)
      return null;
   return this.slots[index];
};

OptMemoryManager.prototype.view = function(index) {
   var slot = this.slot(index);
   if (!slot)
      return null;
   return slot.view;
};

function optMaskMemoryMeta(dialog) {
   var algo = dialog && dialog.comboPostMask ? dialog.comboPostMask.currentItem : 0;
   if (algo === 1) {
      var preset = optComboText(dialog.comboPostCMPreset, "(Custom)");
      var map = { "(Custom)":"CUS", "Red":"RED", "Orange":"ORG", "Yellow":"YEL", "Green":"GRN", "Cyan":"CYN", "Blue":"BLU", "Magenta":"MAG" };
      return { code: "CM-" + (map[preset] || optAcronym(preset, "CUS")), signature: "CM|" + preset };
   }
   if (algo === 2) {
      var shape = optComboText(dialog.comboPostFameShape, "Freehand");
      var smap = { "Freehand":"FH", "Brush":"BR", "Spray Can":"SP", "Ellipse":"EL", "Rectangle":"REC" };
      return { code: "F-" + (smap[shape] || optAcronym(shape, "SH")), signature: "F|" + shape };
   }
   var mode = optComboText(dialog.comboPostRangeMode, "Luminance");
   var rmap = { "Binary":"BIN", "Luminance":"LUM", "Brightness":"BRI" };
   return { code: "RS-" + (rmap[mode] || optAcronym(mode, "RS")), signature: "RS|" + mode };
}

function OptMaskMemoryManager(slotCount) {
   this.slots = [];
   for (var i = 0; i < slotCount; ++i)
      this.slots.push(null);
   this.buttonSets = [];
   this.selectedIndex = -1;
   this.nextIndex = 0;
   this.signatureNumbers = {};
   this.nextSignatureNumber = 1;
}

OptMaskMemoryManager.prototype.numberForSignature = function(signature) {
   var sig = signature || "mask";
   if (!optHasOwn(this.signatureNumbers, sig))
      this.signatureNumbers[sig] = this.nextSignatureNumber++;
   return this.signatureNumbers[sig];
};

OptMaskMemoryManager.prototype.registerButtons = function(buttons) {
   this.buttonSets.push(buttons || []);
   this.refreshButtons();
};

OptMaskMemoryManager.prototype.refreshButtons = function() {
   for (var s = 0; s < this.buttonSets.length; ++s) {
      var buttons = this.buttonSets[s];
      for (var i = 0; i < this.slots.length; ++i) {
         var b = buttons[i];
         if (!b)
            continue;
         var slot = this.slots[i];
         if (slot && optSafeView(slot.view)) {
            b.text = slot.label;
            b.toolTip = "Mask memory " + (i + 1) + ": " + slot.label;
            b.styleSheet = (i === this.selectedIndex) ? OPT_CSS_PATH_ACTIVE : OPT_CSS_MEMORY_FILLED;
         } else {
            b.text = "" + (i + 1);
            b.toolTip = "Empty mask memory slot";
            b.styleSheet = (i === this.selectedIndex) ? OPT_CSS_SET_CURRENT : OPT_CSS_MEMORY_EMPTY;
         }
      }
   }
};

OptMaskMemoryManager.prototype.select = function(index) {
   if (index < 0 || index >= this.slots.length)
      return null;
   this.selectedIndex = index;
   optTouchSlot(this.slots[index]);
   this.refreshButtons();
   return this.slots[index];
};

OptMaskMemoryManager.prototype.storeNext = function(view, meta) {
   if (!optSafeView(view))
      return -1;
   var index = -1;
   if (this.selectedIndex >= 0 && !this.slots[this.selectedIndex])
      index = this.selectedIndex;
   if (index < 0)
      for (var i = 0; i < this.slots.length; ++i)
         if (!this.slots[i]) {
            index = i;
            break;
         }
   if (index < 0) {
      index = this.nextIndex % this.slots.length;
      this.nextIndex = (index + 1) % this.slots.length;
   }
   optReleaseOwnedSlotViews(this.slots[index]);
   var m = meta || { code: "MASK", signature: "MASK" };
   var n = this.numberForSignature(m.signature);
   var clone = optMemoryCloneView(view, "Opt_MaskMemory", m.code || "Mask", index);
   this.slots[index] = { view: clone, owned: true, label: (m.code || "MASK") + " " + n, meta: m };
   optTouchSlot(this.slots[index]);
   this.selectedIndex = index;
   this.nextIndex = (index + 1) % this.slots.length;
   this.refreshButtons();
   return index;
};

OptMaskMemoryManager.prototype.storeNextShared = function(view, meta) {
   if (!optSafeView(view))
      return -1;
   var index = -1;
   if (this.selectedIndex >= 0 && !this.slots[this.selectedIndex])
      index = this.selectedIndex;
   if (index < 0)
      for (var i = 0; i < this.slots.length; ++i)
         if (!this.slots[i]) {
            index = i;
            break;
         }
   if (index < 0) {
      index = this.nextIndex % this.slots.length;
      this.nextIndex = (index + 1) % this.slots.length;
   }
   optReleaseOwnedSlotViews(this.slots[index]);
   var m = meta || { code: "MASK", signature: "MASK" };
   var n = this.numberForSignature(m.signature);
   this.slots[index] = { view: view, owned: false, label: (m.code || "MASK") + " " + n, meta: m };
   optTouchSlot(this.slots[index]);
   this.selectedIndex = index;
   this.nextIndex = (index + 1) % this.slots.length;
   this.refreshButtons();
   return index;
};

OptMaskMemoryManager.prototype.storeAt = function(index, view, meta) {
   if (index < 0 || index >= this.slots.length || !optSafeView(view))
      return -1;
   optReleaseOwnedSlotViews(this.slots[index]);
   var m = meta || { code: "MASK", signature: "MASK" };
   var n = this.numberForSignature(m.signature);
   var clone = optMemoryCloneView(view, "Opt_MaskMemory", m.code || "Mask", index);
   this.slots[index] = { view: clone, owned: true, label: (m.code || "MASK") + " " + n, meta: m };
   optTouchSlot(this.slots[index]);
   this.selectedIndex = index;
   this.refreshButtons();
   return index;
};

OptMaskMemoryManager.prototype.preserveSharedView = function(view) {
   if (!optSafeView(view))
      return;
   for (var i = 0; i < this.slots.length; ++i) {
      var slot = this.slots[i];
      if (!slot || slot.owned || !optSafeView(slot.view))
         continue;
      if (slot.view.id !== view.id)
         continue;
      var clone = optMemoryCloneView(view, "Opt_MaskMemory", (slot.meta && slot.meta.code) || "Mask", i);
      if (optSafeView(clone)) {
         slot.view = clone;
         slot.owned = true;
      }
   }
   this.refreshButtons();
};

OptMaskMemoryManager.prototype.selectedView = function() {
   if (this.selectedIndex < 0 || this.selectedIndex >= this.slots.length)
      return null;
   var slot = this.slots[this.selectedIndex];
   return slot && optSafeView(slot.view) ? slot.view : null;
};

OptMaskMemoryManager.prototype.clear = function() {
   for (var i = 0; i < this.slots.length; ++i) {
      optReleaseOwnedSlotViews(this.slots[i]);
      this.slots[i] = null;
   }
   this.selectedIndex = -1;
   this.nextIndex = 0;
   this.signatureNumbers = {};
   this.nextSignatureNumber = 1;
   this.refreshButtons();
};

function OptPreviewControl(parent) {
   this.__base__ = ScrollBox;
   this.__base__(parent);
   this.bitmap = null;
   this._paintCropBitmap = null;
   this._paintCropW = 0;
   this._paintCropH = 0;
   this.scale = 1.0;
   this.isFitMode = true;
   this.autoScroll = true;
   this.tracking = true;
   this.viewport.backgroundColor = 0xff202020;
   this.viewport.cursor = new Cursor(StdCursor_OpenHand);
   this.mousePressed = false;
   this.isDragging = false;
   this.didDrag = false;
   this.clickPoint = new Point(0, 0);
   this.scrollStart = new Point(0, 0);
   this.onZoomChanged = null;
   // Delegate hooks for tabs that need custom mouse/overlay behaviour (e.g. FAME drawing).
   // Each receives image-space coordinates. Return true from onImageMousePress to suppress pan.
   this.onImageMousePress = null;
   this.onImageMouseMove = null;
   this.onImageMouseRelease = null;
   // Called inside onPaint after the bitmap is drawn. Signature: (g, scale, scrollX, scrollY).
   this.onOverlayPaint = null;
   this.busyActive = false;
   this.busyText = "";
   this.imageCoordScaleX = 1.0;
   this.imageCoordScaleY = 1.0;

   this.clearPaintCache = function() {
      if (this._paintCropBitmap) {
         try { this._paintCropBitmap.clear(); } catch (e0) {}
      }
      this._paintCropBitmap = null;
      this._paintCropW = 0;
      this._paintCropH = 0;
   };

   this.clampScrollPoint = function(p) {
      var maxX = 0;
      var maxY = 0;
      if (this.bitmap) {
         maxX = Math.max(0, Math.round(this.bitmap.width * this.scale) - this.viewport.width);
         maxY = Math.max(0, Math.round(this.bitmap.height * this.scale) - this.viewport.height);
      }
      return new Point(Math.max(0, Math.min(maxX, Math.round(p.x))), Math.max(0, Math.min(maxY, Math.round(p.y))));
   };

   this.updateScrollBars = function() {
      if (this.bitmap) {
         var imgW = Math.round(this.bitmap.width * this.scale);
         var imgH = Math.round(this.bitmap.height * this.scale);
         this.setHorizontalScrollRange(0, Math.max(0, imgW - this.viewport.width));
         this.setVerticalScrollRange(0, Math.max(0, imgH - this.viewport.height));
      } else {
         this.setHorizontalScrollRange(0, 0);
         this.setVerticalScrollRange(0, 0);
      }
   };

   this.fitToWindow = function() {
      if (!this.bitmap || this.viewport.width <= 0 || this.viewport.height <= 0)
         return;
      var sx = this.viewport.width / this.bitmap.width;
      var sy = this.viewport.height / this.bitmap.height;
      this.scale = Math.max(0.05, Math.min(Math.min(sx, sy) * 0.98, 40.0));
      this.isFitMode = true;
      this.scrollPosition = new Point(0, 0);
      this.updateScrollBars();
      if (this.onZoomChanged)
         this.onZoomChanged(this.scale, true);
      this.viewport.repaint();
   };

   this.setManualScale = function(scale) {
      if (!this.bitmap)
         return;
      this.scale = Math.max(0.05, Math.min(scale, 40.0));
      this.isFitMode = false;
      this.updateScrollBars();
      this.scrollPosition = this.clampScrollPoint(this.scrollPosition);
      if (this.onZoomChanged)
         this.onZoomChanged(this.scale, false);
      this.viewport.repaint();
   };

   this.setBitmap = function(bitmap, fit) {
      var saved = new Point(this.scrollPosition.x, this.scrollPosition.y);
      var oldBitmap = this.bitmap;
      var oldScale = this.scale;
      var savedCenterX = 0.5;
      var savedCenterY = 0.5;
      if (oldBitmap && oldScale > 0) {
         savedCenterX = ((saved.x / oldScale) + (this.viewport.width / (2 * oldScale))) / Math.max(1, oldBitmap.width);
         savedCenterY = ((saved.y / oldScale) + (this.viewport.height / (2 * oldScale))) / Math.max(1, oldBitmap.height);
         savedCenterX = Math.max(0, Math.min(1, savedCenterX));
         savedCenterY = Math.max(0, Math.min(1, savedCenterY));
      }
      if (oldBitmap && oldBitmap !== bitmap) {
         try { oldBitmap.clear(); } catch (eClear) {}
      }
      this.bitmap = bitmap;
      if (!bitmap) {
         this.clearPaintCache();
         this.scrollPosition = new Point(0, 0);
         this.updateScrollBars();
         this.viewport.repaint();
         return;
      }
      if (fit !== false) {
         this.fitToWindow();
      } else {
         this.updateScrollBars();
         if (oldBitmap && bitmap && oldScale > 0) {
            var targetImageX = savedCenterX * bitmap.width;
            var targetImageY = savedCenterY * bitmap.height;
            var targetScroll = new Point(
               targetImageX * this.scale - this.viewport.width / 2,
               targetImageY * this.scale - this.viewport.height / 2
            );
            this.scrollPosition = this.clampScrollPoint(targetScroll);
         } else {
            this.scrollPosition = this.clampScrollPoint(saved);
         }
         this.viewport.repaint();
      }
   };

   this.setBusy = function(active, text) {
      this.busyActive = active === true;
      this.busyText = text || "Working";
      try { this.viewport.repaint(); } catch (e5) {}
   };

   this.paintBusyOverlay = function(g) {
      if (!this.busyActive)
         return;
      var x = 16, y = 16, r = 24;
      var w = Math.max(220, Math.min(360, 86 + (this.busyText ? this.busyText.length * 7 : 0)));
      var h = 62;
      g.brush = new Brush(0xcc000000);
      g.pen = new Pen(0xffd9a560, 1);
      g.drawRect(x, y, x + w, y + h);
      g.brush = new Brush(0xffd9a560);
      g.pen = new Pen(0xffe8e8ea, 2);
      g.drawEllipse(x + 10, y + 7, x + 10 + 2 * r, y + 7 + 2 * r);
      g.pen = new Pen(0xffffffff, 1);
      g.drawTextRect(new Rect(x + 10, y + 7, x + 10 + 2 * r, y + 7 + 2 * r), "\u03C0", TextAlign_Center | TextAlign_VertCenter);
      if (this.busyText && this.busyText.length > 0)
         g.drawTextRect(new Rect(x + 70, y + 10, x + w - 12, y + h - 10), this.busyText, TextAlign_Left | TextAlign_VertCenter);
   };

   this.viewport.onResize = function() {
      if (this.parent.isFitMode)
         this.parent.fitToWindow();
      else
         this.parent.updateScrollBars();
   };

   this.viewport.onPaint = function(x0, y0, x1, y1) {
      var g = new Graphics(this);
      g.fillRect(new Rect(x0, y0, x1, y1), new Brush(0xff202020));
      if (this.parent.bitmap) {
         try {
            var sc = this.parent.scale;
            var bmp = this.parent.bitmap;
            var sx = this.parent.scrollPosition.x;
            var sy = this.parent.scrollPosition.y;
            var srcX = Math.max(0, Math.floor(sx / sc));
            var srcY = Math.max(0, Math.floor(sy / sc));
            var srcW = Math.min(bmp.width - srcX, Math.ceil(this.width / sc) + 2);
            var srcH = Math.min(bmp.height - srcY, Math.ceil(this.height / sc) + 2);
            if (srcW > 0 && srcH > 0) {
               if (!this.parent._paintCropBitmap ||
                   this.parent._paintCropW !== srcW ||
                   this.parent._paintCropH !== srcH) {
                  this.parent.clearPaintCache();
                  this.parent._paintCropBitmap = new Bitmap(srcW, srcH);
                  this.parent._paintCropW = srcW;
                  this.parent._paintCropH = srcH;
               }
               var crop = this.parent._paintCropBitmap;
               var gcrop = new Graphics(crop);
               try {
                  gcrop.drawBitmap(-srcX, -srcY, bmp);
                  // Enable smooth interpolation to avoid grid artifacts when
                  // scaling the preview bitmap to non-integer zoom factors.
                  // Without this, drawScaledBitmap defaults to nearest-neighbor
                  // sampling, which produces visible grid lines because rows/
                  // columns of source pixels are duplicated unevenly.
                  try { g.smoothInterpolation = true; } catch (eSmooth) {}
                  g.drawScaledBitmap(-(sx % sc), -(sy % sc), srcW * sc, srcH * sc, crop);
               } finally {
                  try { gcrop.end(); } catch (eGcrop) {}
               }
            }
            if (this.parent.onOverlayPaint)
               this.parent.onOverlayPaint(g, sc, sx, sy);
            this.parent.paintBusyOverlay(g);
         } catch (e0) {
         }
      } else {
         g.pen = new Pen(0xff808080);
         g.drawTextRect(new Rect(0, 0, this.width, this.height), "Select Image", TextAlign_Center);
         this.parent.paintBusyOverlay(g);
      }
      g.end();
   };

   this.viewport.onMousePress = function(x, y, button, buttons, modifiers) {
      var ctrl = this.parent;
      var imgX = Math.floor(((ctrl.scrollPosition.x + x) / ctrl.scale) * ctrl.imageCoordScaleX);
      var imgY = Math.floor(((ctrl.scrollPosition.y + y) / ctrl.scale) * ctrl.imageCoordScaleY);
      if (ctrl.onImageMousePress && ctrl.onImageMousePress(imgX, imgY, button, modifiers))
         return;
      ctrl.mousePressed = true;
      ctrl.isDragging = false;
      ctrl.didDrag = false;
      ctrl.clickPoint = new Point(x, y);
      ctrl.scrollStart = new Point(ctrl.scrollPosition);
      if (button === OPT_MOUSE_LEFT)
         this.cursor = new Cursor(StdCursor_ClosedHand);
   };

   this.viewport.onMouseMove = function(x, y, buttons, modifiers) {
      var ctrl = this.parent;
      var imgX = Math.floor(((ctrl.scrollPosition.x + x) / ctrl.scale) * ctrl.imageCoordScaleX);
      var imgY = Math.floor(((ctrl.scrollPosition.y + y) / ctrl.scale) * ctrl.imageCoordScaleY);
      if (ctrl.onImageMouseMove) {
         ctrl.onImageMouseMove(imgX, imgY, buttons, modifiers);
      }
      if (!ctrl.mousePressed)
         return;
      var dx = x - ctrl.clickPoint.x;
      var dy = y - ctrl.clickPoint.y;
      if (dx * dx + dy * dy > 9) {
         ctrl.isDragging = true;
         ctrl.didDrag = true;
      }
      if (ctrl.isDragging) {
         ctrl.scrollPosition = ctrl.clampScrollPoint(new Point(ctrl.scrollStart.x - dx, ctrl.scrollStart.y - dy));
         this.repaint();
      }
   };

   this.viewport.onMouseRelease = function(x, y, button, buttons, modifiers) {
      var ctrl = this.parent;
      var imgX = Math.floor(((ctrl.scrollPosition.x + x) / ctrl.scale) * ctrl.imageCoordScaleX);
      var imgY = Math.floor(((ctrl.scrollPosition.y + y) / ctrl.scale) * ctrl.imageCoordScaleY);
      if (ctrl.onImageMouseRelease)
         ctrl.onImageMouseRelease(imgX, imgY, button, modifiers);
      ctrl.mousePressed = false;
      ctrl.isDragging = false;
      this.cursor = new Cursor(StdCursor_OpenHand);
   };

   this.viewport.onMouseWheel = function(x, y, delta) {
      if (!this.parent.bitmap)
         return;
      var oldScale = this.parent.scale;
      var newScale = delta > 0 ? oldScale * 1.1 : oldScale / 1.1;
      newScale = Math.max(0.05, Math.min(newScale, 40.0));
      var ix = (this.parent.scrollPosition.x + x) / oldScale;
      var iy = (this.parent.scrollPosition.y + y) / oldScale;
      this.parent.scale = newScale;
      this.parent.isFitMode = false;
      this.parent.updateScrollBars();
      this.parent.scrollPosition = this.parent.clampScrollPoint(new Point(ix * newScale - x, iy * newScale - y));
      if (this.parent.onZoomChanged)
         this.parent.onZoomChanged(newScale, false);
      this.repaint();
   };
}
OptPreviewControl.prototype = new ScrollBox();

function optButton(parent, text, width) {
   var b = new PushButton(parent);
   b.text = text;
   if (width)
      b.minWidth = width;
   b.styleSheet = OPT_CSS_MODE_OFF;
   optApplyTooltip(b, "button", text, "Button");
   return b;
}

function optPrimaryButton(parent, text, width) {
   var b = optButton(parent, text, width);
   b.styleSheet = OPT_CSS_PRIMARY;
   return b;
}

function optLabel(parent, text, width) {
   var l = new Label(parent);
   l.text = text;
   l.textAlignment = TextAlign_Right | TextAlign_VertCenter;
   if (width)
      l.minWidth = width;
   optApplyTooltip(l, "label", text, "");
   return l;
}

function optInfoLabel(parent, text) {
   var l = new Label(parent);
   l.useRichText = true;
   l.wordWrapping = true;
   l.text = text || "";
   l.styleSheet = OPT_CSS_INFO;
   return l;
}

function optEngineTitle(parent, text) {
   var l = new Label(parent);
   l.useRichText = true;
   l.text = "<b>" + text + "</b>";
   l.textAlignment = TextAlign_Center | TextAlign_VertCenter;
   l.styleSheet = OPT_CSS_ENGINE_TITLE;
   l.minHeight = 34;
   try { l.setFixedHeight(36); } catch (e) {}
   optApplyTooltip(l, "title", text, "Section");
   return l;
}

function optNumeric(parent, labelText, min, max, value, precision, labelWidth) {
   var nc = new NumericControl(parent);
   nc.label.text = labelText;
   if (labelWidth)
      nc.label.minWidth = labelWidth;
   nc.setRange(min, max);
   nc.setPrecision(precision || 0);
   nc.setValue(value);
   try {
      if (min >= 0 && max <= 1.0)
         nc.slider.setRange(Math.round(min * 100), Math.round(max * 100));
   } catch (e0) {}
   try { nc.label.styleSheet = "QLabel { border:1px solid transparent; }"; } catch (e1) {}
   var tt = optTooltipFor("numeric", labelText, "NumericControl");
   if (tt && tt.length > 0) {
      try { nc.toolTip = tt; } catch (e2) {}
      try { nc.label.toolTip = tt; } catch (e3) {}
      try { nc.slider.toolTip = tt; } catch (e4) {}
      try { nc.edit.toolTip = tt; } catch (e5) {}
   }
   return nc;
}

function optComboRow(parent, labelText, items, width) {
   var row = new Control(parent);
   row.sizer = new HorizontalSizer();
   row.sizer.spacing = 6;
   var label = optLabel(row, labelText, width || 118);
   var combo = new ComboBox(row);
   for (var i = 0; i < items.length; ++i)
      combo.addItem(items[i]);
   var tt = optTooltipFor("combo", labelText, "ComboBox");
   if (tt && tt.length > 0) {
      try { row.toolTip = tt; } catch (e0) {}
      try { label.toolTip = tt; } catch (e1) {}
      try { combo.toolTip = tt; } catch (e2) {}
   }
   row.sizer.add(label);
   row.sizer.add(combo, 100);
   return { row: row, label: label, combo: combo };
}

function optInnerGroup(parent, title) {
   var g = new GroupBox(parent);
   g.title = title;
   g.styleSheet = OPT_CSS_GROUP_INNER;
   g.sizer = new VerticalSizer();
   g.sizer.margin = 8;
   g.sizer.spacing = 5;
   optApplyTooltip(g, "group", title, "Section");
   return g;
}

function optSection(parent, title) {
   var header = new Control(parent);
   header.sizer = new HorizontalSizer();
   header.sizer.spacing = 4;
   header.sizer.margin = 3;
   header.minHeight = 30;
   header.maxHeight = 30;
   var body = new Control(parent);
   body.sizer = new VerticalSizer();
   body.sizer.margin = 6;
   body.sizer.spacing = 4;
   var label = new Label(header);
   label.text = title;
   label.textAlignment = TextAlign_Left | TextAlign_VertCenter;
   label.styleSheet = OPT_CSS_HEADER;
   label.minWidth = 360;
   label.minHeight = 22;
   label.maxHeight = 24;
   var sectionTip = optTooltipFor("section", title, "Section");
   if (sectionTip && sectionTip.length > 0) {
      try { header.toolTip = sectionTip; } catch (eT0) {}
      try { label.toolTip = sectionTip; } catch (eT1) {}
      try { body.toolTip = sectionTip; } catch (eT2) {}
   }
   var toggle = new PushButton(header);
   toggle.text = "-";
   toggle.minWidth = 16;
   toggle.maxWidth = 16;
   toggle.minHeight = 20;
   toggle.maxHeight = 20;
   toggle.styleSheet = OPT_CSS_MODE_OFF;
   header.sizer.add(label, 100);
   header.sizer.add(toggle);
   var section = { bar: header, body: body, expanded: true, title: title };
   header.expanded = true;
   header.body = body;
   header.setExpanded = function(expanded) {
      header.expanded = expanded === true;
      section.expanded = header.expanded;
      body.visible = header.expanded;
      toggle.text = header.expanded ? "-" : "+";
   };
   toggle.onClick = function() {
      header.setExpanded(!header.expanded);
   };
   section.setExpanded = function(expanded) {
      header.setExpanded(expanded);
   };
   return section;
}

function OptImageCombo(parent, labelText, key, requireColor) {
   this.key = key;
   this.requireColor = requireColor === true;
   this.row = new Control(parent);
   this.row.sizer = new HorizontalSizer();
   this.row.sizer.spacing = 4;
   this.label = optLabel(this.row, labelText + ":", 48);
   this.combo = new ComboBox(this.row);
   this.combo.minWidth = 210;
   this.views = [];
   this.records = [];
   this.onSelectionChanged = null;
   this.row.sizer.add(this.label);
   this.row.sizer.add(this.combo, 100);

   var self = this;
   this.combo.onItemSelected = function() {
      if (typeof self.onSelectionChanged === "function")
         self.onSelectionChanged(self.selectedView());
   };
}

OptImageCombo.prototype.refresh = function() {
   this.views = [];
   this.records = [];
   try {
      while (this.combo.numberOfItems > 0)
         this.combo.removeItem(this.combo.numberOfItems - 1);
   } catch (e0) {
   }
   this.combo.addItem("None");
   var selected = 0;
   var views = optWorkspaceViews();
   for (var i = 0; i < views.length; ++i) {
      var v = views[i];
      if (this.requireColor && !optViewIsColor(v))
         continue;
      if (!this.requireColor && !optViewIsMono(v))
         continue;
      this.views.push(v);
      this.combo.addItem(v.id);
      if (v.id.toUpperCase() === this.key.toUpperCase())
         selected = this.views.length;
   }
   try { this.combo.currentItem = selected; } catch (e1) {}
};

OptImageCombo.prototype.selectedView = function() {
   var index = 0;
   try { index = this.combo.currentItem; } catch (e) { index = 0; }
   if (index <= 0)
      return null;
   return this.views[index - 1] || null;
};

function OptSelectionPanel(dialog, tab) {
   this.dialog = dialog;
   this.tab = tab;
   this.combos = {};
   this.mode = "MONO";
   this.control = new Control(dialog);
   this.control.sizer = new VerticalSizer();
   this.control.sizer.spacing = 6;

   this.modeRow = new Control(this.control);
   this.modeRow.styleSheet = OPT_CSS_MODE_WRAPPER;
   this.modeRow.sizer = new HorizontalSizer();
   this.modeRow.sizer.spacing = 6;
   this.btnModeMono = optButton(this.modeRow, "R+G+B", 92);
   this.btnModeNb = optButton(this.modeRow, "NB", 70);
   this.btnModeRgb = optButton(this.modeRow, "RGB", 70);
   this.modeRow.sizer.add(this.btnModeMono);
   this.modeRow.sizer.add(this.btnModeNb);
   this.modeRow.sizer.add(this.btnModeRgb);
   this.modeRow.sizer.addStretch();
   this.control.sizer.add(this.modeRow);

   this.buildMonoGroup();
   this.buildNbGroup();
   this.buildRgbGroup();
   this.control.sizer.addStretch();
   this.wireModeButtons();
   this.setMode("MONO");
}

OptSelectionPanel.prototype.addCombo = function(parentSizer, label, key, requireColor, dictKey) {
   var combo = new OptImageCombo(this.control, label, key, requireColor);
   parentSizer.add(combo.row);
   this.combos[dictKey || key] = combo;
   return combo;
};

OptSelectionPanel.prototype.buildMonoGroup = function() {
   var g = new Control(this.control);
   this.monoGroup = g;
   g.sizer = new VerticalSizer();
   g.sizer.margin = 0;
   g.sizer.spacing = 4;
   this.addCombo(g.sizer, "R", "R", false);
   this.addCombo(g.sizer, "G", "G", false);
   this.addCombo(g.sizer, "B", "B", false);
   this.addCombo(g.sizer, "L", "L", false, "L_MONO");
   var row = new HorizontalSizer();
   row.spacing = 4;
   this.btnCombineMono = optButton(this.control, "Combine R+G+B", 130);
   this.btnSeparateMono = optButton(this.control, "Process Separately", 155);
   this.btnCombineMono.styleSheet = OPT_CSS_PRIMARY;
   row.add(this.btnCombineMono);
   row.add(this.btnSeparateMono);
   row.addStretch();
   g.sizer.add(row);
   this.control.sizer.add(g);
};

OptSelectionPanel.prototype.buildNbGroup = function() {
   var g = new Control(this.control);
   this.nbGroup = g;
   g.sizer = new VerticalSizer();
   g.sizer.margin = 0;
   g.sizer.spacing = 4;
   this.addCombo(g.sizer, "H", "H", false);
   this.addCombo(g.sizer, "O", "O", false);
   this.addCombo(g.sizer, "S", "S", false);
   this.addCombo(g.sizer, "L", "L", false);
   this.addCombo(g.sizer, "HO", "HO", true);
   this.addCombo(g.sizer, "OS", "OS", true);
   var row = new HorizontalSizer();
   row.spacing = 4;
   this.btnCombineNb = optButton(this.control, "Combine H+O+S", 130);
   this.btnSeparateNb = optButton(this.control, "Process Separately", 155);
   this.btnCombineNb.styleSheet = OPT_CSS_PRIMARY;
   row.add(this.btnCombineNb);
   row.add(this.btnSeparateNb);
   row.addStretch();
   g.sizer.add(row);
   this.recipeRow = new Control(this.control);
   this.recipeRow.sizer = new VerticalSizer();
   this.recipeRow.sizer.spacing = 3;
   var recipeRow1 = new Control(this.recipeRow);
   recipeRow1.sizer = new HorizontalSizer();
   recipeRow1.sizer.spacing = 3;
   var recipeRow2 = new Control(this.recipeRow);
   recipeRow2.sizer = new HorizontalSizer();
   recipeRow2.sizer.spacing = 3;
   for (var i = 0; i < OPT_RECIPE_NAMES.length; ++i) {
      var recipeParent = i < 6 ? recipeRow1 : recipeRow2;
      var b = optButton(recipeParent, OPT_RECIPE_NAMES[i], 55);
      b.styleSheet = OPT_CSS_RECIPE;
      b.__recipe = OPT_RECIPE_NAMES[i];
      // Apply palette-specific tooltip (overrides generic 'button.<name>' fallback)
      try {
         var ttRecipe = optTooltipTextByKey("recipe." + OPT_RECIPE_NAMES[i]);
         if (ttRecipe) b.toolTip = ttRecipe;
      } catch (eRec) {}
      var dlg = this.dialog;
      b.onClick = function() {
         dlg.selectedRecipe = this.__recipe;
         dlg.refreshRecipeButtons();
      };
      recipeParent.sizer.add(b);
      this.dialog.recipeButtons.push(b);
   }
   this.recipeRow.sizer.add(recipeRow1);
   this.recipeRow.sizer.add(recipeRow2);
   g.sizer.add(this.recipeRow);
   this.control.sizer.add(g);
};

OptSelectionPanel.prototype.buildRgbGroup = function() {
   var g = new Control(this.control);
   this.rgbGroup = g;
   g.sizer = new VerticalSizer();
   g.sizer.margin = 0;
   g.sizer.spacing = 4;
   this.addCombo(g.sizer, "RGB", "RGB", true);
   var row = new HorizontalSizer();
   this.btnProcessRgb = optButton(this.control, "Process RGB", 130);
   this.btnProcessRgb.styleSheet = OPT_CSS_PRIMARY;
   row.add(this.btnProcessRgb);
   row.addStretch();
   g.sizer.add(row);
   this.control.sizer.add(g);
};

OptSelectionPanel.prototype.wireModeButtons = function() {
   var self = this;
   this.btnModeMono.onClick = function() { self.setMode("MONO"); };
   this.btnModeNb.onClick = function() { self.setMode("NB"); };
   this.btnModeRgb.onClick = function() { self.setMode("RGB"); };
};

OptSelectionPanel.prototype.setMode = function(mode) {
   this.mode = (mode === "NB" || mode === "RGB") ? mode : "MONO";
   optSetControlVisible(this.monoGroup, this.mode === "MONO");
   optSetControlVisible(this.nbGroup, this.mode === "NB");
   optSetControlVisible(this.rgbGroup, this.mode === "RGB");
   this.btnModeMono.styleSheet = this.mode === "MONO" ? OPT_CSS_MODE_ON : OPT_CSS_MODE_OFF;
   this.btnModeNb.styleSheet = this.mode === "NB" ? OPT_CSS_MODE_ON : OPT_CSS_MODE_OFF;
   this.btnModeRgb.styleSheet = this.mode === "RGB" ? OPT_CSS_MODE_ON : OPT_CSS_MODE_OFF;
};

OptSelectionPanel.prototype.refresh = function() {
   for (var key in this.combos)
      if (optHasOwn(this.combos, key))
         this.combos[key].refresh();
};

OptSelectionPanel.prototype.view = function(key) {
   return this.combos[key] ? this.combos[key].selectedView() : null;
};

function OptPreviewPane(dialog, tab, parent) {
   this.dialog = dialog;
   this.tab = tab;
   this.currentKey = "";
   this.currentView = null;
   this.candidateView = null;
   this.candidateGradientView = null;
   this.currentGradientView = null;
   this.previousView = null;
   this.pendingStage = "";
   this.pendingActionKey = "";
   this.pendingMemoryMeta = null;
   this.currentMemoryMeta = null;
   this.recalledMemoryIndex = -1;
   this.showingPrevious = false;
   this.memory = new OptMemoryManager(OPT_MEMORY_SLOTS);
   this.previewReduction = OPT_PREVIEW_REDUCTION_DEFAULT;
   this.lastRenderView = null;
   this.lastRenderGradientView = null;

   this.control = new Control(parent);
   this.control.sizer = new VerticalSizer();
   this.control.sizer.spacing = 5;

   this.pathRow = new Control(parent);
   this.pathRow.sizer = new HorizontalSizer();
   this.pathRow.sizer.spacing = 4;
   this.pathButtons = {};
   var keys = optAllWorkflowKeys();
   for (var i = 0; i < keys.length; ++i) {
      var key = keys[i];
      var b = optButton(this.pathRow, optLabelForKey(key), 55);
      b.visible = false;
      b.styleSheet = OPT_CSS_MODE_OFF;
      b.__pathKey = key;
      var self = this;
      b.onClick = function() {
         self.activate(this.__pathKey, true);
      };
      this.pathButtons[key] = b;
      this.pathRow.sizer.add(b);
   }
   this.pathRow.sizer.addStretch();
   this.control.sizer.add(this.pathRow);

   this.memoryRow = new Control(parent);
   this.memoryRow.sizer = new HorizontalSizer();
   this.memoryRow.sizer.spacing = 4;
   this.memoryRow.sizer.add(optLabel(this.memoryRow, "Memory:", 55));
   for (var m = 0; m < OPT_MEMORY_SLOTS; ++m) {
      var mb = optButton(this.memoryRow, "" + (m + 1), 82);
      mb.styleSheet = OPT_CSS_MEMORY_EMPTY;
      mb.__memoryIndex = m;
      this.memory.buttons.push(mb);
      var pane = this;
      mb.onClick = function() {
         pane.storeMemory(this.__memoryIndex);
      };
      mb.onMousePress = function(x, y, button) {
         if (button === OPT_MOUSE_RIGHT)
            pane.recallMemory(this.__memoryIndex);
      };
      this.memoryRow.sizer.add(mb);
   }
   this.btnResetMemory = optButton(this.memoryRow, "Reset", 60);
   try {
      var ttRstMem = optTooltipTextByKey("reset.memory");
      if (ttRstMem) this.btnResetMemory.toolTip = ttRstMem;
   } catch (eRstM) {}
   this.btnResetMemory.onClick = function() { self.memory.clear(); };
   this.memoryRow.sizer.add(this.btnResetMemory);
   this.memoryRow.sizer.addStretch();
   this.control.sizer.add(this.memoryRow);
   if (this.tab === OPT_TAB_POST || this.tab === OPT_TAB_CC)
      optBuildMaskMemoryPanel(dialog, this.control, this);

   this.toolRow = new Control(parent);
   this.toolRow.sizer = new HorizontalSizer();
   this.toolRow.sizer.spacing = 4;
   this.btnToggle = optButton(this.toolRow, "Toggle", 60);
   this.btnExport = optButton(this.toolRow, "Export", 60);
   this.btnSetCurrent = optButton(this.toolRow, "Set to Current", 105);
   this.btnSetCurrent.styleSheet = OPT_CSS_SET_CURRENT;
   this.btnSetCurrent.enabled = false;
   this.zoomLabel = optLabel(this.toolRow, "Zoom:", 45);
   this.zoomCombo = new ComboBox(this.toolRow);
   this.zoomCombo.editEnabled = true;
   this.zoomCombo.addItem("Fit");
   this.zoomCombo.addItem("25%");
   this.zoomCombo.addItem("50%");
   this.zoomCombo.addItem("100%");
   this.zoomCombo.addItem("200%");
   this.resLabel = optLabel(this.toolRow, "Prev. Resol. Reduction", 148);
   this.resCombo = new ComboBox(this.toolRow);
   this.resCombo.addItem("1");
   this.resCombo.addItem("2");
   this.resCombo.addItem("3");
   this.resCombo.addItem("4");
   this.resCombo.addItem("5");
   this.resCombo.addItem("6");
   this.resCombo.currentItem = optClampPreviewReduction(dialog.sharedPreviewReduction || OPT_PREVIEW_REDUCTION_DEFAULT) - 1;
   this.toolRow.sizer.add(this.btnToggle);
   this.toolRow.sizer.add(this.btnExport);
   this.toolRow.sizer.add(this.btnSetCurrent);
   this.toolRow.sizer.addStretch();
   this.toolRow.sizer.add(this.zoomLabel);
   this.toolRow.sizer.add(this.zoomCombo);
   this.toolRow.sizer.add(this.resLabel);
   this.toolRow.sizer.add(this.resCombo);
   this.control.sizer.add(this.toolRow);

   this.status = new Label(parent);
   this.status.useRichText = true;
   this.status.text = "<b>Current:</b> none";
   this.control.sizer.add(this.status);

   this.gradientRow = new Control(parent);
   this.gradientRow.sizer = new HorizontalSizer();
   this.gradientRow.sizer.spacing = 4;
   this.chkShowGradient = new CheckBox(this.gradientRow);
   this.chkShowGradient.text = "Show Gradient";
   this.chkShowGradient.checked = false;
   optApplyCheckBoxTooltip(this.chkShowGradient);
   this.gradientRow.sizer.add(this.chkShowGradient);
   this.gradientRow.sizer.addStretch();
   optSetControlVisible(this.gradientRow, false);
   this.control.sizer.add(this.gradientRow);

   this.preview = new OptPreviewControl(parent);
   this.preview.minHeight = 520;
   this.control.sizer.add(this.preview, 100);

   this.preview.onZoomChanged = function(scale, isFit) {
      if (isFit)
         self.zoomCombo.currentItem = 0;
      else
         self.zoomCombo.editText = Math.round(scale * 100) + "%";
   };

   this.zoomCombo.onItemSelected = function(index) {
      if (index === 0)
         self.preview.fitToWindow();
      else if (index === 1)
         self.preview.setManualScale(0.25);
      else if (index === 2)
         self.preview.setManualScale(0.50);
      else if (index === 3)
         self.preview.setManualScale(1.00);
      else if (index === 4)
         self.preview.setManualScale(2.00);
   };

   this.resCombo.onItemSelected = function(index) {
      dialog.setSharedPreviewReduction(index + 1);
   };

   this.btnToggle.onClick = function() { self.toggle(); };
   this.btnExport.onClick = function() { self.exportCurrent(); };
   this.btnSetCurrent.onClick = function() { self.setToCurrent(); };
   this.chkShowGradient.onCheck = function() {
      if (optSafeView(self.lastRenderView))
         self.render(self.lastRenderView, false, self.lastRenderGradientView);
   };
}

OptPreviewPane.prototype.refreshButtons = function() {
   var keys = optAllWorkflowKeys();
   for (var i = 0; i < keys.length; ++i) {
      var key = keys[i];
      var btn = this.pathButtons[key];
      var visible = this.dialog.store.isAvailable(key, this.tab);
      var rec = this.dialog.store.record(key);
      var hasStages = optStageList(rec).length > 0;
      btn.visible = visible;
      btn.enabled = visible;
      if (key === this.currentKey)
         btn.text = "[" + optLabelForKey(key) + "]";
      else
         btn.text = optLabelForKey(key);
      if (!visible)
         btn.styleSheet = OPT_CSS_MODE_OFF;
      else if (key === this.currentKey)
         btn.styleSheet = OPT_CSS_PATH_ACTIVE;
      else if (hasStages)
         btn.styleSheet = OPT_CSS_PATH_DONE;
      else
         btn.styleSheet = OPT_CSS_MODE_OFF;
   }
};

OptPreviewPane.prototype.activate = function(key, fit) {
   var rec = this.dialog.store.record(key);
   if (!optSafeView(rec.view))
      return false;
   if (this.tab === OPT_TAB_POST && this.dialog && this.dialog.postMaskLiveCache)
      this.dialog.postMaskLiveCache.release();
   optCloseViews([this.previousView, this.candidateView, this.candidateGradientView]);
   if (key !== this.currentKey)
      optCloseViews([this.currentGradientView]);
   this.previousView = null;
   this.candidateGradientView = null;
   if (key !== this.currentKey) {
      this.currentGradientView = null;
      this.currentMemoryMeta = null;
   }
   this.pendingMemoryMeta = null;
   this.pendingActionKey = "";
   this.recalledMemoryIndex = -1;
   this.currentKey = key;
   this.currentView = rec.view;
   this.candidateView = null;
   this.pendingStage = "";
   this.showingPrevious = false;
   this.btnSetCurrent.styleSheet = OPT_CSS_SET_CURRENT;
   this.btnSetCurrent.enabled = false;
   this.render(rec.view, fit !== false, this.currentGradientView);
   this.refreshButtons();
   return true;
};

OptPreviewPane.prototype.updateGradientControl = function(gradientView) {
   var visible = this.tab === OPT_TAB_PRE && optSafeView(gradientView);
   optSetControlVisible(this.gradientRow, visible);
   if (!visible && this.chkShowGradient)
      this.chkShowGradient.checked = false;
};

OptPreviewPane.prototype.render = function(view, fit, gradientView) {
   if (!optSafeView(view)) {
      this.preview.setBitmap(null, fit !== false);
      this.status.text = "<b>Current:</b> " + (this.currentKey ? optLabelForKey(this.currentKey) : "none");
      this.lastRenderView = null;
      this.lastRenderGradientView = null;
      this.updateGradientControl(null);
      return;
   }
   if (typeof gradientView === "undefined") {
      if (view === this.candidateView)
         gradientView = this.candidateGradientView;
      else if (view === this.currentView)
         gradientView = this.currentGradientView;
      else
         gradientView = null;
   }
   this.lastRenderView = view;
   this.lastRenderGradientView = optSafeView(gradientView) ? gradientView : null;
   this.updateGradientControl(this.lastRenderGradientView);
   var rec = this.currentKey ? this.dialog.store.record(this.currentKey) : null;
   var stages = optStageList(rec);
   var stretchMode = "";
   if (this.tab === OPT_TAB_PRE) {
      stretchMode = (optRecordHasColorCorrection(rec) || optIsColorCorrectionStage(this.pendingStage)) ? "mad-linked" : "mad-unlinked";
   }
   var showGradient = this.chkShowGradient && this.chkShowGradient.checked === true && optSafeView(this.lastRenderGradientView);
   var renderReduction = this.dialog.sharedPreviewReduction || OPT_PREVIEW_REDUCTION_DEFAULT;
   if (this.tab === OPT_TAB_CC && view === this.candidateView && this.pendingActionKey === "cc_combine")
      renderReduction = 1;
   var bmp = showGradient ?
      optRenderStackedPreviewBitmap(view, this.lastRenderGradientView, renderReduction, stretchMode) :
      optRenderPreviewBitmap(view, renderReduction, stretchMode);
   var showPostMask = this.tab === OPT_TAB_POST &&
      this.dialog &&
      this.dialog.postActiveMaskShown === true &&
      optSafeView(this.dialog.postActiveMask) &&
      (view === this.currentView || view === this.candidateView);
   if (showPostMask) {
      var maskedBmp = optRenderPreviewBitmapWithMask(view, this.dialog.postActiveMask, renderReduction, stretchMode);
      if (maskedBmp)
         bmp = maskedBmp;
   }
   this.preview.imageCoordScaleX = bmp && bmp.width > 0 ? view.image.width / bmp.width : 1.0;
   this.preview.imageCoordScaleY = bmp && bmp.height > 0 ? view.image.height / bmp.height : 1.0;
   var stageText = stages.length > 0 ? " | Stages: " + stages.join(", ") : "";
   var previewText = "";
   if (stretchMode === "mad-unlinked")
      previewText = " | Preview: MAD AutoSTF unlinked";
   else if (stretchMode === "mad-linked")
      previewText = " | Preview: MAD AutoSTF linked";
   if (showGradient)
      previewText += " | Gradient model below";
   if (showPostMask)
      previewText += " | Active mask shown";
   this.preview.setBitmap(bmp, fit !== false);
   this.status.text = "<b>Current:</b> " + (this.currentKey ? optLabelForKey(this.currentKey) : "none") + (optSafeView(view) ? " (" + view.id + ")" : "") + stageText + previewText;
};

OptPreviewPane.prototype.renderBitmap = function(bitmap, label, fit, sourceWidth, sourceHeight) {
   if (!bitmap) {
      this.preview.setBitmap(null, fit !== false);
      this.status.text = label || "<b>Preview:</b> none";
      return;
   }
   this.lastRenderView = null;
   this.lastRenderGradientView = null;
   this.updateGradientControl(null);
   this.preview.imageCoordScaleX = bitmap.width > 0 && sourceWidth > 0 ? sourceWidth / bitmap.width : 1.0;
   this.preview.imageCoordScaleY = bitmap.height > 0 && sourceHeight > 0 ? sourceHeight / bitmap.height : 1.0;
   this.preview.setBitmap(bitmap, fit !== false);
   this.status.text = label || "<b>Preview:</b> bitmap";
};

OptPreviewPane.prototype.beginCandidate = function(stageName, transformFn, actionKey) {
   if (!this.currentKey || !optSafeView(this.currentView))
      throw new Error("Select a workflow image first.");
   this.preview.setBusy(true, stageName || "Working");
   var candidate = null;
   // Outer try/finally: setBusy(false) is GUARANTEED to run, even if optCloneView
   // or any other step throws. Without this, a failed clone left the pane locked
   // in "Working..." state forever.
   try {
      optCloseViews([this.previousView, this.candidateView, this.candidateGradientView]);
      this.previousView = optCloneView(this.currentView, "Opt_Previous_" + this.currentKey, false);
      candidate = optCloneView(this.currentView, "Opt_Candidate_" + this.currentKey + "_" + stageName, false);
      // #3: regular beginCandidate flow has no upgrader; clear any stale one
      // left over from a previous beginCandidateFromFactory invocation.
      this.__candidateUpgrader = null;
      var resultMeta = null;
      var resultGradientView = null;
      try {
         if (typeof transformFn === "function") {
            var replacement = transformFn(candidate, this.currentView);
            if (replacement && typeof replacement === "object" && !optSafeView(replacement)) {
               var objectReplacementView = null;
               if (optSafeView(replacement.view))
                  objectReplacementView = replacement.view;
               else if (optSafeView(replacement.continueView))
                  objectReplacementView = replacement.continueView;
               if (optSafeView(objectReplacementView) && objectReplacementView.id !== candidate.id) {
                  optCloseView(candidate);
                  candidate = objectReplacementView;
               }
               if (optSafeView(replacement.gradientView))
                  resultGradientView = replacement.gradientView;
               else if (replacement.bkgView !== undefined && optSafeView(replacement.bkgView))
                  resultGradientView = replacement.bkgView;
               resultMeta = replacement.meta || replacement;
               replacement = candidate;
            }
            var replacementIsDifferent = false;
            try {
               var replacementId = optSafeView(replacement) ? replacement.id : "";
               var candidateId = optSafeView(candidate) ? candidate.id : "";
               replacementIsDifferent = replacementId.length > 0 && candidateId.length > 0 && replacementId !== candidateId;
            } catch (e0) {
               replacementIsDifferent = false;
            }
            if (replacementIsDifferent) {
               optCloseView(candidate);
               candidate = replacement;
            }
         }
         if (!optSafeView(candidate))
            throw new Error("The candidate preview view is not valid after applying the process.");
      } catch (e) {
         optCloseView(candidate);
         throw e;
      }
      this.candidateView = candidate;
      this.candidateGradientView = optSafeView(resultGradientView) ? resultGradientView : null;
      this.pendingStage = stageName || "";
      this.pendingActionKey = actionKey || "";
      this.pendingMemoryMeta = optBuildMemoryMeta(this, this.pendingStage, this.pendingActionKey, resultMeta);
      this.showingPrevious = false;
      this.recalledMemoryIndex = -1;
      this.render(candidate, false, this.candidateGradientView);
      this.btnSetCurrent.styleSheet = OPT_CSS_SET_CURRENT;
      this.btnSetCurrent.enabled = true;
   } finally {
      this.preview.setBusy(false);
   }
};

// Skip-clone variant of beginCandidate (#4): use when the factoryFn always
// constructs and returns its own view (e.g. Channel Combination compose).
// Avoids the upfront optCloneView(currentView, "Opt_Candidate_*") that
// beginCandidate creates and immediately discards. The factoryFn signature
// is `function(currentView)` and may return either a View or an object
// `{ view, gradientView, meta, bkgView, continueView }` like beginCandidate.
//
// `opts.upgradeFn` (#3): optional function called from setToCurrent before the
// candidate is committed. Used by CC live compose to regenerate a full-res
// view when the user commits a downsampled live preview.
OptPreviewPane.prototype.beginCandidateFromFactory = function(stageName, factoryFn, actionKey, opts) {
   if (!this.currentKey || !optSafeView(this.currentView))
      throw new Error("Select a workflow image first.");
   if (typeof factoryFn !== "function")
      throw new Error("beginCandidateFromFactory: factoryFn is required.");
   this.preview.setBusy(true, stageName || "Working");
   var candidate = null;
   // Outer try/finally so setBusy(false) ALWAYS fires. See note in beginCandidate.
   try {
      optCloseViews([this.previousView, this.candidateView, this.candidateGradientView]);
      this.previousView = optCloneView(this.currentView, "Opt_Previous_" + this.currentKey, false);
      this.__candidateUpgrader = (opts && typeof opts.upgradeFn === "function") ? opts.upgradeFn : null;
      var resultMeta = null;
      var resultGradientView = null;
      try {
         var produced = factoryFn(this.currentView);
         if (produced && typeof produced === "object" && !optSafeView(produced)) {
            if (optSafeView(produced.view))
               candidate = produced.view;
            else if (optSafeView(produced.continueView))
               candidate = produced.continueView;
            if (optSafeView(produced.gradientView))
               resultGradientView = produced.gradientView;
            else if (produced.bkgView !== undefined && optSafeView(produced.bkgView))
               resultGradientView = produced.bkgView;
            resultMeta = produced.meta || produced;
         } else if (optSafeView(produced)) {
            candidate = produced;
         }
         if (!optSafeView(candidate))
            throw new Error("The candidate preview view is not valid after applying the process.");
      } catch (e) {
         optCloseView(candidate);
         throw e;
      }
      this.candidateView = candidate;
      this.candidateGradientView = optSafeView(resultGradientView) ? resultGradientView : null;
      this.pendingStage = stageName || "";
      this.pendingActionKey = actionKey || "";
      this.pendingMemoryMeta = optBuildMemoryMeta(this, this.pendingStage, this.pendingActionKey, resultMeta);
      this.showingPrevious = false;
      this.recalledMemoryIndex = -1;
      this.render(candidate, false, this.candidateGradientView);
      this.btnSetCurrent.styleSheet = OPT_CSS_SET_CURRENT;
      this.btnSetCurrent.enabled = true;
   } finally {
      this.preview.setBusy(false);
   }
};

OptPreviewPane.prototype.setToCurrent = function() {
   var fromMemory = this.recalledMemoryIndex >= 0 ? this.memory.slot(this.recalledMemoryIndex) : null;
   if (fromMemory && optSafeView(fromMemory.view)) {
      optCloseViews([this.currentGradientView]);
      this.currentKey = fromMemory.key || this.currentKey;
      var currentClone = optMemoryCloneView(fromMemory.view, "Opt_CurrentFromMemory", this.currentKey, this.recalledMemoryIndex);
      var gradClone = optMemoryCloneView(fromMemory.gradientView, "Opt_CurrentGradientFromMemory", this.currentKey, this.recalledMemoryIndex);
      if (!optSafeView(currentClone)) {
         optCloseViews([gradClone]);
         return;
      }
      this.dialog.store.setView(this.currentKey, currentClone, true, this.tab);
      this.currentView = currentClone;
      this.currentGradientView = gradClone;
      this.currentMemoryMeta = fromMemory.meta || null;
      if (this.currentMemoryMeta && this.currentMemoryMeta.stage)
         this.dialog.store.markStage(this.currentKey, this.currentMemoryMeta.stage);
      var defaultStage = optDefaultTabStageLabel(this.tab);
      if (defaultStage)
         this.dialog.store.markStage(this.currentKey, defaultStage);
      optCloseViews([this.candidateView, this.candidateGradientView]);
      this.recalledMemoryIndex = -1;
      this.candidateView = null;
      this.candidateGradientView = null;
      this.pendingStage = "";
      this.pendingActionKey = "";
      this.pendingMemoryMeta = null;
      this.dialog.refreshWorkflowButtons();
      this.render(this.currentView, false, this.currentGradientView);
      this.btnSetCurrent.styleSheet = OPT_CSS_SET_CURRENT_APPLIED;
      this.btnSetCurrent.enabled = false;
      return;
   }
   if (!this.currentKey || !optSafeView(this.candidateView))
      return;
   // #3: if a candidate upgrader is registered (live preview), regenerate a
   // full-res view before committing it to the store.
   if (typeof this.__candidateUpgrader === "function") {
      var upgrader = this.__candidateUpgrader;
      this.__candidateUpgrader = null;
      var upgradeFailed = false;
      this.preview.setBusy(true, "Upgrading to full resolution...");
      try {
         var upgraded = upgrader(this.candidateView);
         if (optSafeView(upgraded)) {
            if (upgraded.id !== this.candidateView.id) {
               optCloseView(this.candidateView);
               this.candidateView = upgraded;
            }
         } else {
            upgradeFailed = true;
         }
      } catch (eU) {
         try { console.warningln("Set to Current upgrade failed: " + eU.message); } catch (eW) {}
         upgradeFailed = true;
      } finally {
         this.preview.setBusy(false);
      }
      if (upgradeFailed || !optSafeView(this.candidateView))
         return;
   }
   optCloseViews([this.currentGradientView]);
   this.dialog.store.setView(this.currentKey, this.candidateView, true, this.tab);
   if (this.pendingStage)
      this.dialog.store.markStage(this.currentKey, this.pendingStage);
   this.currentView = this.candidateView;
   this.currentGradientView = this.candidateGradientView;
   this.currentMemoryMeta = this.pendingMemoryMeta;
   this.candidateView = null;
   this.candidateGradientView = null;
   this.pendingStage = "";
   this.pendingActionKey = "";
   this.pendingMemoryMeta = null;
   this.recalledMemoryIndex = -1;
   this.dialog.refreshWorkflowButtons();
   this.render(this.currentView, false, this.currentGradientView);
   this.btnSetCurrent.styleSheet = OPT_CSS_SET_CURRENT_APPLIED;
   this.btnSetCurrent.enabled = false;
};

OptPreviewPane.prototype.toggle = function() {
   if (!optSafeView(this.previousView) || !optSafeView(this.currentView) && !optSafeView(this.candidateView))
      return;
   this.showingPrevious = !this.showingPrevious;
   if (this.showingPrevious)
      this.render(this.previousView, false, null);
   else
      this.render(this.candidateView || this.currentView, false, this.candidateView ? this.candidateGradientView : this.currentGradientView);
};

OptPreviewPane.prototype.exportCurrent = function() {
   var view = this.candidateView || this.currentView;
   if (!optSafeView(view))
      return;
   // If the candidate is a live downsampled preview (e.g. CC compose), regenerate
   // at full resolution before exporting so the exported image is not cropped/scaled.
   var toExport = view;
   var tempUpgraded = null;
   if (typeof this.__candidateUpgrader === "function") {
      this.preview.setBusy(true, "Preparing full-resolution export...");
      try {
         var upgraded = this.__candidateUpgrader(view);
         if (optSafeView(upgraded)) {
            toExport = upgraded;
            tempUpgraded = upgraded;
         }
      } catch (eU) {
         try { console.warningln("Export: full-resolution upgrade failed — exporting current preview resolution. " + eU.message); } catch (eW) {}
      } finally {
         this.preview.setBusy(false);
      }
   }
   // optCloneView copies FITS keywords + WCS astrometric solution via optCopyMetadata.
   var exported = optCloneView(toExport, "Opt_Export_" + (this.currentKey || view.id), true);
   if (tempUpgraded && tempUpgraded !== view)
      try { optCloseView(tempUpgraded); } catch (eTmp) {}
   if (optSafeView(exported)) {
      try { exported.window.bringToFront(); } catch (eBTF) {}
      console.writeln("Exported: " + exported.id +
         " (" + exported.image.width + "x" + exported.image.height + ", " +
         exported.image.numberOfChannels + "ch)");
   }
};

OptPreviewPane.prototype.storeMemory = function(index) {
   var view = this.candidateView || this.currentView;
   var gradientView = this.candidateView ? this.candidateGradientView : this.currentGradientView;
   var meta = this.candidateView ? this.pendingMemoryMeta : this.currentMemoryMeta;
   if (!meta) {
      var fallbackStage = this.pendingStage || optDefaultTabStageLabel(this.tab) || "Current";
      meta = optBuildMemoryMeta(this, fallbackStage, this.pendingActionKey || "", null);
   }
   if (optSafeView(view)) {
      this.memory.store(index, this.currentKey || view.id, view, meta, gradientView);
   }
};

OptPreviewPane.prototype.recallMemory = function(index) {
   var slot = this.memory.slot(index);
   if (slot && optSafeView(slot.view)) {
      this.recalledMemoryIndex = index;
      this.showingPrevious = false;
      optTouchSlot(slot);
      this.render(slot.view, false, slot.gradientView);
      this.btnSetCurrent.styleSheet = OPT_CSS_SET_CURRENT;
      this.btnSetCurrent.enabled = true;
   }
};

OptPreviewPane.prototype.releaseTransient = function() {
   optCloseViews([this.previousView, this.candidateView, this.candidateGradientView, this.currentGradientView]);
   try { if (this.preview) this.preview.setBitmap(null, false); } catch (eBmp) {}
   this.previousView = null;
   this.candidateView = null;
   this.candidateGradientView = null;
   this.currentGradientView = null;
   this.pendingStage = "";
   this.pendingActionKey = "";
   this.pendingMemoryMeta = null;
   this.currentMemoryMeta = null;
   this.recalledMemoryIndex = -1;
   this.memory.clear();
};

function OptWorkflowTab(dialog, tabName, title) {
   this.dialog = dialog;
   this.tabName = tabName;
   this.title = title;
   this.sections = [];
   this.page = new Control(dialog);
   this.page.autoFillBackground = true;
   this.page.backgroundColor = OPT_BG;
   this.page.sizer = new HorizontalSizer();
   this.page.sizer.margin = 4;
   this.page.sizer.spacing = 6;

   this.left = new ScrollBox(this.page);
   this.left.setFixedWidth(450);
   this.left.autoScroll = true;
   this.leftContent = new Control(this.left);
   this.leftContent.sizer = new VerticalSizer();
   this.leftContent.sizer.margin = 6;
   this.leftContent.sizer.spacing = 6;
   this.left.viewport.sizer = new VerticalSizer();
   this.left.viewport.sizer.add(this.leftContent);

   this.headerLabel = optEngineTitle(this.leftContent, title.toUpperCase() + " ENGINE");
   this.leftContent.sizer.add(this.headerLabel);

   this.selectionSection = optSection(this.leftContent, "Image Selection");
   this.selection = new OptSelectionPanel(dialog, tabName);
   this.selectionSection.body.sizer.add(this.selection.control);
   this.sections.push(this.selectionSection);
   this.leftContent.sizer.add(this.selectionSection.bar);
   this.leftContent.sizer.add(this.selectionSection.body);

   this.preview = new OptPreviewPane(dialog, tabName, this.page);
   this.page.sizer.add(this.left);
   this.page.sizer.add(this.preview.control, 100);

   this.wireSelection();
}

OptWorkflowTab.prototype.registerSection = function(section) {
   if (section) {
      var tab = this;
      var origSetExpanded = section.bar.setExpanded;
      section.bar.setExpanded = function(expanded) {
         origSetExpanded(expanded);
         if (expanded) {
            for (var i = 0; i < tab.sections.length; ++i)
               if (tab.sections[i] !== section && tab.sections[i].expanded)
                  tab.sections[i].setExpanded(false);
         }
      };
      this.sections.push(section);
   }
   return section;
};

OptWorkflowTab.prototype.addProcessSection = function(title, buttons, options) {
   options = options || {};
   var section = optSection(this.leftContent, title);
   if (optHasOwn(options, "build") && typeof options.build === "function")
      options.build(section.body, this);
   function wireButton(button, spec, tab, pane) {
      button.onClick = function() {
         var clicked = this;
         optSafeUi(clicked.__stageName, function() {
            if (optHasOwn(spec, "action") && typeof spec.action === "function") {
               spec.action(tab, pane, clicked);
               return;
            }
            pane.beginCandidate(clicked.__stageName, function(candidate) {
               if (optHasOwn(spec, "transform") && typeof spec.transform === "function")
                  return spec.transform(candidate, tab.dialog, tab, clicked);
               return optApplyPreCandidate(candidate, clicked.__actionKey, tab.dialog);
            }, clicked.__actionKey);
         });
      };
   }
   for (var i = 0; i < buttons.length; ++i) {
      var spec = buttons[i];
      var width = optHasOwn(spec, "width") ? spec.width : 160;
      var b = (optHasOwn(spec, "primary") && spec.primary === false) ? optButton(section.body, spec.text, width) : optPrimaryButton(section.body, spec.text, width);
      b.__stageName = optHasOwn(spec, "stage") ? spec.stage : title;
      b.__actionKey = optHasOwn(spec, "actionKey") ? spec.actionKey : "";
      var pane = this.preview;
      var tab = this;
      wireButton(b, spec, tab, pane);
      section.body.sizer.add(b);
      if (optHasOwn(spec, "name") && spec.name)
         this[spec.name] = b;
   }
   this.registerSection(section);
   this.leftContent.sizer.add(section.bar);
   this.leftContent.sizer.add(section.body);
   return section;
};

OptWorkflowTab.prototype.wireSelection = function() {
   var tab = this;
   this.selection.btnCombineMono.onClick = function() { optSafeUi("Combine mono channels", function() { tab.combineMono(); }); };
   this.selection.btnSeparateMono.onClick = function() { optSafeUi("Process separate mono channels", function() { tab.processSeparateMono(); }); };
   this.selection.btnCombineNb.onClick = function() { optSafeUi("Combine narrowband channels", function() { tab.combineNb(); }); };
   this.selection.btnSeparateNb.onClick = function() { optSafeUi("Process separate narrowband channels", function() { tab.processSeparateNb(); }); };
   this.selection.btnProcessRgb.onClick = function() { optSafeUi("Process RGB image", function() { tab.processRgb(); }); };
};

OptWorkflowTab.prototype.setRecord = function(key, view, owned) {
   this.dialog.store.setView(key, view, owned === true, this.tabName);
   this.dialog.store.setAvailable(key, this.tabName, true);
   if (this.tabName === OPT_TAB_POST) {
      this.dialog.store.setAvailable(key, OPT_TAB_CC, true);
   }
   this.dialog.refreshWorkflowButtons();
   this.preview.activate(key, true);
};

OptWorkflowTab.prototype.combineMono = function() {
   var r = this.selection.view("R");
   var g = this.selection.view("G");
   var b = this.selection.view("B");
   var l = this.selection.view("L_MONO");
   var useL = optSafeView(l);
   var combined = optCreateRgbFromChannels(r, g, b, useL ? "L_R_G_B" : "R_G_B", g);
   if (useL)
      optApplyLuminanceLRGB(combined, l);
   this.setRecord("MonoRGB", combined, true);
};

OptWorkflowTab.prototype.processSeparateMono = function() {
   var keys =      ["R", "G", "B", "L"];
   var comboKeys = ["R", "G", "B", "L_MONO"];
   for (var i = 0; i < keys.length; ++i) {
      var v = this.selection.view(comboKeys[i]);
      if (optSafeView(v))
         this.dialog.store.setView(keys[i], v, false, this.tabName);
   }
   this.dialog.refreshWorkflowButtons();
   for (var j = 0; j < keys.length; ++j)
      if (this.dialog.store.isAvailable(keys[j], this.tabName)) {
         this.preview.activate(keys[j], true);
         break;
      }
};

OptWorkflowTab.prototype.combineNb = function() {
   var map = {
      H: this.selection.view("H"),
      O: this.selection.view("O"),
      S: this.selection.view("S")
   };
   var recipe = optRecipeChannels(this.dialog.selectedRecipe);
   var r = map[recipe[0]];
   var g = map[recipe[1]];
   var b = map[recipe[2]];
   var combined = optCreateRgbFromChannels(r, g, b, "NB_RGB_" + this.dialog.selectedRecipe, g || r || b);
   optAnnotateNarrowbandView(combined, this.dialog.selectedRecipe, "Channel Combination");
   this.setRecord("HSO", combined, true);
};

OptWorkflowTab.prototype.processSeparateNb = function() {
   var keys = ["H", "O", "S", "HO", "OS"];
   for (var i = 0; i < keys.length; ++i) {
      var v = this.selection.view(keys[i]);
      if (optSafeView(v))
         this.dialog.store.setView(keys[i], v, false, this.tabName);
   }
   this.dialog.refreshWorkflowButtons();
   for (var j = 0; j < keys.length; ++j)
      if (this.dialog.store.isAvailable(keys[j], this.tabName)) {
         this.preview.activate(keys[j], true);
         break;
      }
};

OptWorkflowTab.prototype.processRgb = function() {
   var v = this.selection.view("RGB");
   if (!optSafeView(v))
      throw new Error("Select an RGB view first.");
   this.setRecord("RGB", v, false);
};

OptWorkflowTab.prototype.refreshSelections = function() {
   this.selection.refresh();
};

// Detects which optional third-party processes/scripts are installed in the running
// PixInsight build and enables or disables the corresponding UI controls. Called
// from runDependencyChecks() after every tab is fully constructed.
function optApplyProcessAvailabilityToUI(dlg) {
   if (!dlg) return;

   // --- Availability flags ---
   var hasBXT  = optCreateBlurXTerminatorProcessInstance() != null;
   var hasNXT  = optCreateGenericProcessInstance(["NoiseXTerminator"], ["NXT", "NoiseXTerminator"]) != null;
   var hasGraX = optHasGraXpertProcess() || (typeof GraXpertLib !== "undefined");
   var hasVLX  = optResolveVeraLuxProcessFunction() != null || optHasVeraLuxProcess();
   var hasMAS  = optDependencyProcessExists("MultiscaleAdaptiveStretch");
   var hasSPCC = optDependencyProcessExists("SpectrophotometricColorCalibration");
   var hasTGV  = optDependencyProcessExists("TGVDenoise");
   var hasABE  = optDependencyProcessExists("AutomaticBackgroundExtractor");
   var hasCC   = optIsCosmicClarityAvailable();
   var hasDBE  = optIsAutoDBEAvailable(); // lazy-load: OPT_PIW_HAS_AUTODBE is false at module load before scripts are resolved
   var hasMGC  = optDependencyProcessExists("MultiscaleGradientCorrection");
   var hasSXT  = (typeof StarXTerminator !== "undefined");

   function disableBtn(btn, reason) {
      if (!btn) return;
      btn.enabled = false;
      btn.toolTip = reason + " no está instalado en esta build de PixInsight.";
   }
   function enableBtn(btn) {
      if (!btn) return;
      btn.enabled = true;
      btn.toolTip = "";
   }

   // --- SPCC button (Pre > Color Calibration) ---
   if (dlg.preTab && dlg.preTab.btnPreSPCC) {
      if (hasSPCC) enableBtn(dlg.preTab.btnPreSPCC);
      else disableBtn(dlg.preTab.btnPreSPCC, "SpectrophotometricColorCalibration (SPCC)");
   }

   // --- Star Split button (Stretch) ---
   if (dlg.btnCreateStarSplit) {
      if (hasSXT) enableBtn(dlg.btnCreateStarSplit);
      else disableBtn(dlg.btnCreateStarSplit, "StarXTerminator");
   }

   // --- Pre Gradient Correction combo ---
   // Items: 0=MGC, 1=AutoDBE, 2=ABE, 3=GraXpert
   var gradientAvail = [hasMGC, hasDBE, hasABE, hasGraX];
   var gradientNames = [
      "MultiscaleGradientCorrection (MGC)",
      "AutoDBE (SetiAstro)",
      "AutomaticBackgroundExtractor (ABE)",
      "GraXpert"
   ];
   if (dlg.comboPreGradient && dlg.preTab && dlg.preTab.btnPreGradient) {
      var updateGradientBtn = function() {
         var idx = dlg.comboPreGradient.currentItem;
         var avail = (idx >= 0 && idx < gradientAvail.length) ? gradientAvail[idx] : true;
         if (avail) enableBtn(dlg.preTab.btnPreGradient);
         else disableBtn(dlg.preTab.btnPreGradient, gradientNames[idx] || "Algoritmo seleccionado");
      };
      var prevGradientSel = dlg.comboPreGradient.onItemSelected;
      dlg.comboPreGradient.onItemSelected = function(idx) {
         if (prevGradientSel) prevGradientSel(idx);
         updateGradientBtn();
      };
      // Auto-select first available algorithm if current one is unavailable
      if (!gradientAvail[dlg.comboPreGradient.currentItem]) {
         for (var gi = 0; gi < gradientAvail.length; ++gi) {
            if (gradientAvail[gi]) {
               dlg.comboPreGradient.currentItem = gi;
               if (dlg.syncPreGradientPanels) dlg.syncPreGradientPanels(gi);
               break;
            }
         }
      }
      updateGradientBtn();
   }

   // --- Pre Deconvolution combo ---
   // Items: 0=BlurXTerminator, 1=Cosmic Clarity
   var deconAvail = [hasBXT, hasCC];
   var deconNames = ["BlurXTerminator", "Cosmic Clarity (SetiAstro)"];
   if (dlg.comboPreDecon && dlg.preTab && dlg.preTab.btnPreApplyDecon) {
      var updateDeconBtn = function() {
         var idx = dlg.comboPreDecon.currentItem;
         var avail = (idx >= 0 && idx < deconAvail.length) ? deconAvail[idx] : true;
         if (avail) enableBtn(dlg.preTab.btnPreApplyDecon);
         else disableBtn(dlg.preTab.btnPreApplyDecon, deconNames[idx] || "Algoritmo seleccionado");
      };
      var prevDeconSel = dlg.comboPreDecon.onItemSelected;
      dlg.comboPreDecon.onItemSelected = function(idx) {
         if (prevDeconSel) prevDeconSel(idx);
         updateDeconBtn();
      };
      if (!deconAvail[dlg.comboPreDecon.currentItem]) {
         for (var di = 0; di < deconAvail.length; ++di) {
            if (deconAvail[di]) {
               dlg.comboPreDecon.currentItem = di;
               if (dlg.syncPreDeconPanels) dlg.syncPreDeconPanels(di);
               break;
            }
         }
      }
      updateDeconBtn();
   }

   // --- Post Noise Reduction combo ---
   // Items: 0=NoiseXTerminator, 1=TGVDenoise, 2=Cosmic Clarity, 3=GraXpert Denoise
   var nrAvail = [hasNXT, hasTGV, hasCC, hasGraX];
   var nrNames = ["NoiseXTerminator", "TGVDenoise", "Cosmic Clarity", "GraXpert Denoise"];
   if (dlg.comboPostNR && dlg.postTab && dlg.postTab.btnPostNR) {
      var updatePostNRBtn = function() {
         var idx = dlg.comboPostNR.currentItem;
         var avail = (idx >= 0 && idx < nrAvail.length) ? nrAvail[idx] : true;
         if (avail) enableBtn(dlg.postTab.btnPostNR);
         else disableBtn(dlg.postTab.btnPostNR, nrNames[idx] || "Algoritmo seleccionado");
      };
      var prevPostNRSel = dlg.comboPostNR.onItemSelected;
      dlg.comboPostNR.onItemSelected = function(idx) {
         if (prevPostNRSel) prevPostNRSel(idx);
         updatePostNRBtn();
      };
      if (!nrAvail[dlg.comboPostNR.currentItem]) {
         for (var ni = 0; ni < nrAvail.length; ++ni) {
            if (nrAvail[ni]) {
               dlg.comboPostNR.currentItem = ni;
               if (dlg.syncPostNRPanels) dlg.syncPostNRPanels(ni);
               break;
            }
         }
      }
      updatePostNRBtn();
   }

   // --- Post Sharpening combo ---
   // Items: 0=BXT, 1=USM(built-in), 2=HDR(built-in), 3=LHE(built-in), 4=DSE(built-in), 5=Cosmic Clarity
   var sharpAvail = [hasBXT, true, true, true, true, hasCC];
   var sharpNames = [
      "BlurXTerminator",
      "Unsharp Mask",
      "HDR Multiscale Transform",
      "Local Histogram Equalization",
      "Dark Structure Enhance",
      "Cosmic Clarity"
   ];
   if (dlg.comboPostSharp && dlg.postTab && dlg.postTab.btnPostSharp) {
      var updatePostSharpBtn = function() {
         var idx = dlg.comboPostSharp.currentItem;
         var avail = (idx >= 0 && idx < sharpAvail.length) ? sharpAvail[idx] : true;
         if (avail) enableBtn(dlg.postTab.btnPostSharp);
         else disableBtn(dlg.postTab.btnPostSharp, sharpNames[idx] || "Algoritmo seleccionado");
      };
      var prevPostSharpSel = dlg.comboPostSharp.onItemSelected;
      dlg.comboPostSharp.onItemSelected = function(idx) {
         if (prevPostSharpSel) prevPostSharpSel(idx);
         updatePostSharpBtn();
      };
      if (!sharpAvail[dlg.comboPostSharp.currentItem]) {
         for (var si = 0; si < sharpAvail.length; ++si) {
            if (sharpAvail[si]) {
               dlg.comboPostSharp.currentItem = si;
               if (dlg.syncPostSharpPanels) dlg.syncPostSharpPanels(si);
               break;
            }
         }
      }
      updatePostSharpBtn();
   }

   // --- Stretch RGB / STARLESS zone ---
   // algoIds = ["STF", "MAS", "SS", "VLX", "CURVES"]
   var stretchRgbAvail = [true, hasMAS, true, hasVLX, true];
   var stretchRgbNames = [
      "Auto STF",
      "Multiscale Adaptive Stretch",
      "Statistical Stretch",
      "VeraLux HyperMetric",
      "Curves"
   ];
   if (dlg.stretchZoneRgb) {
      var zRgb = dlg.stretchZoneRgb;
      var updateStretchRgbBtn = function() {
         var idx = zRgb.combo ? zRgb.combo.currentItem : 0;
         var avail = (idx >= 0 && idx < stretchRgbAvail.length) ? stretchRgbAvail[idx] : true;
         if (avail) enableBtn(zRgb.btnPreview);
         else disableBtn(zRgb.btnPreview, stretchRgbNames[idx] || "Algoritmo seleccionado");
      };
      if (zRgb.combo) {
         var prevRgbSel = zRgb.combo.onItemSelected;
         zRgb.combo.onItemSelected = function() {
            if (prevRgbSel) prevRgbSel();
            updateStretchRgbBtn();
         };
         if (!stretchRgbAvail[zRgb.combo.currentItem]) {
            zRgb.combo.currentItem = 0;
            if (zRgb.sync) zRgb.sync();
         }
         updateStretchRgbBtn();
      }
   }

   // --- Stretch STARS zone ---
   // algoIds = ["STAR", "VLX", "MAS", "STF", "CURVES"]
   var stretchStarsAvail = [true, hasVLX, hasMAS, true, true];
   var stretchStarsNames = [
      "Star Stretch",
      "VeraLux HyperMetric",
      "Multiscale Adaptive Stretch",
      "Auto STF",
      "Curves"
   ];
   if (dlg.stretchZoneStars) {
      var zStars = dlg.stretchZoneStars;
      var updateStretchStarsBtn = function() {
         var idx = zStars.combo ? zStars.combo.currentItem : 0;
         var avail = (idx >= 0 && idx < stretchStarsAvail.length) ? stretchStarsAvail[idx] : true;
         if (avail) enableBtn(zStars.btnPreview);
         else disableBtn(zStars.btnPreview, stretchStarsNames[idx] || "Algoritmo seleccionado");
      };
      if (zStars.combo) {
         var prevStarsSel = zStars.combo.onItemSelected;
         zStars.combo.onItemSelected = function() {
            if (prevStarsSel) prevStarsSel();
            updateStretchStarsBtn();
         };
         if (!stretchStarsAvail[zStars.combo.currentItem]) {
            zStars.combo.currentItem = 0;
            if (zStars.sync) zStars.sync();
         }
         updateStretchStarsBtn();
      }
   }
}

function PIWorkflowOptDialog() {
   this.__base__ = Dialog;
   this.__base__();
   this.windowTitle = "PI Workflow";
   this.styleSheet = OPT_CSS_GLOBAL;
   this.store = new OptImageStore();
   this.stretchEngine = new OptStretchingEngine();
   this.previewScheduler = new OptPreviewScheduler(this);
   this.selectedRecipe = "SHO";
   this.recipeButtons = [];
   this.sharedPreviewReduction = OPT_PREVIEW_REDUCTION_DEFAULT;
   this.__syncingSharedPreviewReduction = false;
   this.tabsByName = {};
   this.dependencyReport = optRunDependencyChecks();
   this.postActiveMask = null;
   this.postActiveMaskShown = false;
   this.postGeneratedMask = null;
   this._postLiveMask = null;
   this._postLiveMaskBitmap = null;
   this.postFameState = null;
   this.postMaskMemory = new OptMaskMemoryManager(OPT_MASK_MEMORY_SLOTS);
   this.postMaskLiveCache = new OptPostMaskLiveCache();
   this.btnPostSetActiveMask = null;
   this._postShowHideMaskButtons = [];
   this.refreshPostMaskMemoryUi = null;
   this.removePostFameHooks = null;
   this.schedulePostMaskLive = null;

   this.sizer = new VerticalSizer();
   this.sizer.margin = 6;
   this.sizer.spacing = 4;
   this.titleBar = optBuildWorkflowTitleBar(this);
   this.sizer.add(this.titleBar);

   this.tabs = new TabBox(this);
   this.preTab = new OptWorkflowTab(this, OPT_TAB_PRE, "Pre Processing");
   this.stretchTab = new OptWorkflowTab(this, OPT_TAB_STRETCH, "Stretching");
   this.postTab = new OptWorkflowTab(this, OPT_TAB_POST, "Post Processing");
   this.ccTab = new OptWorkflowTab(this, OPT_TAB_CC, "Channel Combination");
   this.tabsByName[OPT_TAB_PRE] = this.preTab;
   this.tabsByName[OPT_TAB_STRETCH] = this.stretchTab;
   this.tabsByName[OPT_TAB_POST] = this.postTab;
   this.tabsByName[OPT_TAB_CC] = this.ccTab;

   // Eager tab configuration: every tab must be built BEFORE its page is added
   // to the TabBox. Earlier we tried lazy construction (configure on first
   // onTabChanged), but PJSR's ScrollBox viewport does not recalculate the
   // geometry of children added to its content sizer once the page is already
   // visible inside the TabBox. The first visit then showed only the Image
   // Selection section; only switching tabs once forced the hide/show cycle
   // that finally laid out the rest. Building all tabs up-front avoids that
   // path entirely. The __configured flag is kept so ensureTabConfigured()
   // remains a safe no-op.
   this.preTab.__configured = false;
   this.stretchTab.__configured = false;
   this.postTab.__configured = false;
   this.ccTab.__configured = false;
   this.configurePreTab();
   this.preTab.__configured = true;
   this.configureStretchTab();
   this.stretchTab.__configured = true;
   this.configurePostTab();
   this.postTab.__configured = true;
   this.configureCcTab();
   this.ccTab.__configured = true;

   this.tabs.addPage(this.preTab.page, "0. Pre Processing");
   this.tabs.addPage(this.stretchTab.page, "1. Stretching");
   this.tabs.addPage(this.postTab.page, "2. Post Processing");
   this.tabs.addPage(this.ccTab.page, "3. Channel Combination");
   this.sizer.add(this.tabs, 100);

   this.previousTabIndex = 0;
   var dlg = this;
   this.tabs.onPageSelected = function(index) {
      dlg.onTabChanged(index);
   };

   this.initializeSectionExpansion();
   this.refreshSelections();
   this.refreshRecipeButtons();
   this.refreshWorkflowButtons();
   this.runDependencyChecks();
   optApplyContextTooltipsDeep(this, 0);
   // Build UI policy registry AFTER optApplyContextTooltipsDeep so the first
   // applyUIPolicies invocation caches the real dictionary tooltips (not the
   // empty defaults that exist before the deep tooltip pass runs).
   // Subsequent calls via refreshWorkflowButtons / runDependencyChecks reuse
   // the cache and correctly restore original tooltips on re-enable.
   this.buildUIPolicies();
   try { this.applyUIPolicies(); } catch (ePolInit) {}
   this.adjustToContents();
   this.resize(1280, 820);
}

PIWorkflowOptDialog.prototype = new Dialog();

PIWorkflowOptDialog.prototype.initializeSectionExpansion = function() {
   var names = [OPT_TAB_PRE, OPT_TAB_STRETCH, OPT_TAB_POST, OPT_TAB_CC];
   for (var i = 0; i < names.length; ++i) {
      this.collapseTabSections(this.tabsByName[names[i]]);
   }
   if (this.preTab && this.preTab.selectionSection && typeof this.preTab.selectionSection.setExpanded === "function")
      this.preTab.selectionSection.setExpanded(true);
};

PIWorkflowOptDialog.prototype.collapseTabSections = function(tab) {
   if (!tab || !tab.sections)
      return;
   for (var j = 0; j < tab.sections.length; ++j)
      if (tab.sections[j] && typeof tab.sections[j].setExpanded === "function")
         tab.sections[j].setExpanded(false);
};

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

function optBuildStretchZone(tab, title, isStars) {
   var dlg = tab.dialog;
   var section = optSection(tab.leftContent, title);
   var body = section.body;
   var algoLabels = isStars ?
      ["Star Stretch", "VeraLux HyperMetric", "Multiscale Adaptive Stretch", "Auto STF (Histogram Transform)", "Curves"] :
      ["Auto STF (Histogram Transform)", "Multiscale Adaptive Stretch", "Statistical Stretch", "VeraLux HyperMetric", "Curves"];
   var algoIds = isStars ? ["STAR", "VLX", "MAS", "STF", "CURVES"] : ["STF", "MAS", "SS", "VLX", "CURVES"];
   var rowAlgo = optComboRow(body, "Algorithm:", algoLabels, 118);
   body.sizer.add(rowAlgo.row);

   var zone = {
      isStars: isStars === true,
      section: section,
      combo: rowAlgo.combo,
      algorithmIds: algoIds
   };

   zone.stfGroup = optInnerGroup(body, "Auto STF Settings");
   zone.stfShadow = optNumeric(zone.stfGroup, "Shadows clipping:", -10.0, 0.0, isStars ? -0.5000 : -2.8000, 4, 170);
   zone.stfMid = optNumeric(zone.stfGroup, "Target background:", 0.0, 1.0, isStars ? 0.0300 : 0.2500, 4, 170);
   // Override the shared "Target background:" tooltip with the STF-specific one
   try {
      var ttStf = optTooltipTextByKey("stretch.stf.targetBg");
      if (ttStf) {
         zone.stfMid.toolTip = ttStf;
         try { zone.stfMid.label.toolTip = ttStf; } catch (eL0) {}
         try { zone.stfMid.slider.toolTip = ttStf; } catch (eS0) {}
         try { zone.stfMid.edit.toolTip = ttStf; } catch (eE0) {}
      }
   } catch (eTT0) {}
   zone.stfBoostClip = optNumeric(zone.stfGroup, "Boost clipping factor:", 0.0, 5.0, 0.75, 2, 170);
   zone.stfBoostBg = optNumeric(zone.stfGroup, "Boost bkgd. factor:", 0.0, 10.0, 2.00, 2, 170);
   zone.stfBoost = new CheckBox(zone.stfGroup);
   zone.stfBoost.text = "Apply Boost to Auto STF";
   zone.stfBoost.checked = false;
   optApplyCheckBoxTooltip(zone.stfBoost);
   zone.updateStfBoostUiState = function() {
      var enabled = zone.stfBoost.checked === true;
      zone.stfBoostClip.enabled = enabled;
      zone.stfBoostBg.enabled = enabled;
   };
   zone.stfBoost.onCheck = function() { zone.updateStfBoostUiState(); };
   zone.stfGroup.sizer.add(zone.stfShadow);
   zone.stfGroup.sizer.add(zone.stfMid);
   zone.stfGroup.sizer.add(zone.stfBoostClip);
   zone.stfGroup.sizer.add(zone.stfBoostBg);
   zone.stfGroup.sizer.add(zone.stfBoost);
   zone.updateStfBoostUiState();
   body.sizer.add(zone.stfGroup);

   zone.masGroup = optInnerGroup(body, "Multiscale Adaptive Settings");
   zone.msBg = optNumeric(zone.masGroup, "Target background:", 0.0, 1.0, isStars ? 0.020 : 0.150, 3, 170);
   // Override the shared "Target background:" tooltip with the MAS-specific one
   try {
      var ttMasBg = optTooltipTextByKey("stretch.mas.bg");
      if (ttMasBg) {
         zone.msBg.toolTip = ttMasBg;
         try { zone.msBg.label.toolTip = ttMasBg; } catch (eL1) {}
         try { zone.msBg.slider.toolTip = ttMasBg; } catch (eS1) {}
         try { zone.msBg.edit.toolTip = ttMasBg; } catch (eE1) {}
      }
   } catch (eTT1) {}
   zone.msAgg = optNumeric(zone.masGroup, "Aggressiveness:", 0.0, 1.0, isStars ? 0.10 : 0.70, 2, 170);
   zone.msDrc = optNumeric(zone.masGroup, "Dynamic range compression:", 0.0, 1.0, isStars ? 0.05 : 0.40, 2, 170);
   zone.msScale = optComboRow(zone.masGroup, "Scale separation:", ["16", "32", "64", "128", "256", "512", "1024", "2048", "4096"], 170);
   zone.msScale.combo.currentItem = 6;
   zone.msCR = new CheckBox(zone.masGroup);
   zone.msCR.text = "Contrast Recovery";
   zone.msCR.checked = true;
   optApplyCheckBoxTooltip(zone.msCR);
   zone.msIntensity = optNumeric(zone.masGroup, "Intensity:", 0.0, 1.0, 1.000, 3, 170);
   zone.msCS = new CheckBox(zone.masGroup);
   zone.msCS.text = "Color Saturation";
   zone.msCS.checked = true;
   optApplyCheckBoxTooltip(zone.msCS);
   zone.msCSAmount = optNumeric(zone.masGroup, "Amount:", 0.0, 1.0, 0.75, 3, 170);
   // Override the shared "Amount:" tooltip with the MAS Color-Saturation-specific one
   try {
      var ttMasAmt = optTooltipTextByKey("stretch.mas.csAmount");
      if (ttMasAmt) {
         zone.msCSAmount.toolTip = ttMasAmt;
         try { zone.msCSAmount.label.toolTip = ttMasAmt; } catch (eL2) {}
         try { zone.msCSAmount.slider.toolTip = ttMasAmt; } catch (eS2) {}
         try { zone.msCSAmount.edit.toolTip = ttMasAmt; } catch (eE2) {}
      }
   } catch (eTT2) {}
   zone.msCSBoost = optNumeric(zone.masGroup, "Boost:", 0.0, 1.0, 0.50, 3, 170);
   // Override the shared "Boost:" tooltip with the MAS Color-Saturation-specific one
   try {
      var ttMasBst = optTooltipTextByKey("stretch.mas.csBoost");
      if (ttMasBst) {
         zone.msCSBoost.toolTip = ttMasBst;
         try { zone.msCSBoost.label.toolTip = ttMasBst; } catch (eL3) {}
         try { zone.msCSBoost.slider.toolTip = ttMasBst; } catch (eS3) {}
         try { zone.msCSBoost.edit.toolTip = ttMasBst; } catch (eE3) {}
      }
   } catch (eTT3) {}
   zone.msCSLightness = new CheckBox(zone.masGroup);
   zone.msCSLightness.text = "Lightness mask";
   zone.msCSLightness.checked = true;
   optApplyCheckBoxTooltip(zone.msCSLightness);
   zone.masGroup.sizer.add(zone.msBg);
   zone.masGroup.sizer.add(zone.msAgg);
   zone.masGroup.sizer.add(zone.msDrc);
   zone.masGroup.sizer.add(zone.msScale.row);
   zone.masGroup.sizer.add(zone.msCR);
   zone.masGroup.sizer.add(zone.msIntensity);
   zone.masGroup.sizer.add(zone.msCS);
   zone.masGroup.sizer.add(zone.msCSAmount);
   zone.masGroup.sizer.add(zone.msCSBoost);
   zone.masGroup.sizer.add(zone.msCSLightness);
   zone.msCR.onCheck = function(checked) {
      zone.msScale.combo.enabled = checked;
      zone.msIntensity.enabled = checked;
   };
   zone.msCS.onCheck = function(checked) {
      zone.msCSAmount.enabled = checked;
      zone.msCSBoost.enabled = checked;
      zone.msCSLightness.enabled = checked;
   };
   zone.msCR.onCheck(zone.msCR.checked);
   zone.msCS.onCheck(zone.msCS.checked);
   body.sizer.add(zone.masGroup);

   zone.statGroup = null;
   if (!isStars) {
      zone.statGroup = optInnerGroup(body, "Statistical Settings");
      zone.statMed = optNumeric(zone.statGroup, "Target Median:", 0.01, 1.0, 0.25, 2, 140);
      zone.statBp = optNumeric(zone.statGroup, "Blackpoint Sigma:", 0.0, 10.0, 5.0, 2, 140);
      zone.statClip = new CheckBox(zone.statGroup);
      zone.statClip.text = "No Black Clip";
      optApplyCheckBoxTooltip(zone.statClip);
      zone.statHdr = new CheckBox(zone.statGroup);
      zone.statHdr.text = "HDR Compress";
      zone.statHdr.checked = false;
      optApplyCheckBoxTooltip(zone.statHdr);
      zone.statHdrAmt = optNumeric(zone.statGroup, "HDR Amount:", 0.0, 1.0, 0.25, 2, 140);
      zone.statHdrKnee = optNumeric(zone.statGroup, "HDR Knee:", 0.1, 1.0, 0.35, 2, 140);
      zone.statLuma = new CheckBox(zone.statGroup);
      zone.statLuma.text = "Luma Only (preserve color)";
      zone.statLuma.checked = false;
      optApplyCheckBoxTooltip(zone.statLuma);
      zone.statBlend = optNumeric(zone.statGroup, "Luma Blend:", 0.0, 1.0, 0.60, 2, 140);
      zone.statNorm = new CheckBox(zone.statGroup);
      zone.statNorm.text = "Normalize Range [0,1]";
      optApplyCheckBoxTooltip(zone.statNorm);
      zone.statCurve = optNumeric(zone.statGroup, "Curves Boost:", 0.0, 0.5, 0.00, 2, 140);
      zone.statGroup.sizer.add(zone.statMed);
      zone.statGroup.sizer.add(zone.statBp);
      zone.statGroup.sizer.add(zone.statClip);
      zone.statGroup.sizer.add(zone.statHdr);
      zone.statGroup.sizer.add(zone.statHdrAmt);
      zone.statGroup.sizer.add(zone.statHdrKnee);
      zone.statGroup.sizer.add(zone.statLuma);
      zone.statGroup.sizer.add(zone.statBlend);
      zone.statGroup.sizer.add(zone.statNorm);
      zone.statGroup.sizer.add(zone.statCurve);
      zone.statHdr.onCheck = function(checked) {
         zone.statHdrAmt.enabled = checked;
         zone.statHdrKnee.enabled = checked;
      };
      zone.statLuma.onCheck = function(checked) {
         zone.statBlend.enabled = checked;
      };
      zone.statHdr.onCheck(zone.statHdr.checked);
      zone.statLuma.onCheck(zone.statLuma.checked);
      body.sizer.add(zone.statGroup);
   }

   zone.starGroup = null;
   if (isStars) {
      zone.starGroup = optInnerGroup(body, "Star Stretch Settings");
      zone.starAmount = optNumeric(zone.starGroup, "Stretch Amount:", 0.0, 8.0, 5.0, 2, 170);
      zone.starSat = optNumeric(zone.starGroup, "Color Boost:", 0.0, 2.0, 1.0, 2, 170);
      zone.starRemoveGreen = new CheckBox(zone.starGroup);
      zone.starRemoveGreen.text = "Remove Green via SCNR";
      optApplyCheckBoxTooltip(zone.starRemoveGreen);
      zone.starGroup.sizer.add(zone.starAmount);
      zone.starGroup.sizer.add(zone.starSat);
      zone.starGroup.sizer.add(zone.starRemoveGreen);
      body.sizer.add(zone.starGroup);
   }

   zone.vlxGroup = optInnerGroup(body, "VeraLux Settings");
   zone.vlxBg = optNumeric(zone.vlxGroup, "Target Bg:", 0.01, 1.0, 0.20, 2, 120);
   zone.vlxD = optNumeric(zone.vlxGroup, "Log D (Stretch):", 0.0, 7.0, 2.0, 2, 120);
   zone.vlxProtect = optNumeric(zone.vlxGroup, "Protect b:", 0.1, 15.0, 6.0, 1, 120);
   zone.vlxConvergence = optNumeric(zone.vlxGroup, "Star Core:", 1.0, 10.0, 3.5, 2, 120);
   zone.vlxGrip = optNumeric(zone.vlxGroup, "Grip:", 0.0, 1.0, 1.0, 2, 120);
   zone.vlxGroup.sizer.add(zone.vlxBg);
   zone.vlxGroup.sizer.add(zone.vlxD);
   zone.vlxGroup.sizer.add(zone.vlxProtect);
   zone.vlxGroup.sizer.add(zone.vlxConvergence);
   zone.vlxGroup.sizer.add(zone.vlxGrip);
   body.sizer.add(zone.vlxGroup);

   zone.curvesGroup = optInnerGroup(body, "Curves Settings");
   zone.curvesPoints = { K: [[0,0],[1,1]], R: [[0,0],[1,1]], G: [[0,0],[1,1]], B: [[0,0],[1,1]], S: [[0,0],[1,1]] };
   zone.curvesChan = optComboRow(zone.curvesGroup, "Channel:", ["RGB/K", "Red", "Green", "Blue", "Saturation"], 118);
   zone.curvesContrast = optNumeric(zone.curvesGroup, "Contrast:", 0.0, 1.0, 0.0, 2, 150);
   zone.curvesBright = optNumeric(zone.curvesGroup, "Brightness:", -0.5, 0.5, 0.0, 3, 150);
   zone.curvesShadows = optNumeric(zone.curvesGroup, "Shadows lift:", 0.0, 0.5, 0.0, 3, 150);
   zone.curvesHighlights = optNumeric(zone.curvesGroup, "Highlights compress:", 0.0, 0.5, 0.0, 3, 150);
   zone.curvesSaturation = optNumeric(zone.curvesGroup, "Saturation:", 0.0, 2.0, 1.0, 2, 150);
   zone.curvesLive = new CheckBox(zone.curvesGroup);
   zone.curvesLive.text = "Live";
   // Use Stretching-specific Live tooltip, not the Channel Combination one
   try {
      var ttCurvesLive = optTooltipTextByKey("stretch.curves.live");
      if (ttCurvesLive)
         zone.curvesLive.toolTip = ttCurvesLive;
   } catch (eCL) {}
   zone.curvesGroup.sizer.add(zone.curvesChan.row);
   zone.curvesGroup.sizer.add(zone.curvesContrast);
   zone.curvesGroup.sizer.add(zone.curvesBright);
   zone.curvesGroup.sizer.add(zone.curvesShadows);
   zone.curvesGroup.sizer.add(zone.curvesHighlights);
   zone.curvesGroup.sizer.add(zone.curvesSaturation);
   zone.curvesGroup.sizer.add(zone.curvesLive);
   body.sizer.add(zone.curvesGroup);
   zone.curvesHistogram = null;
   zone.computeCurvesHistogram = function() {
      var key = dlg.resolveStretchZoneKey(isStars);
      var view = key ? dlg.store.record(key).view : null;
      zone.curvesHistogram = optSafeView(view) ? optGetCachedHistogram(view) : null;
   };
   zone.updateCurvesWidget = function() {
      dlg.activeStretchCurvesZone = zone;
      if (dlg.stretchCurvesWidget) {
         zone.computeCurvesHistogram();
         dlg.stretchCurvesWidget.__zone = zone;
         dlg.stretchCurvesWidget.__hist = zone.curvesHistogram;
         var idx = zone.curvesChan ? zone.curvesChan.combo.currentItem : 0;
         var key = ["K", "R", "G", "B", "S"][idx] || "K";
         dlg.stretchCurvesWidget.__pts = zone.curvesPoints[key] || [[0, 0], [1, 1]];
         dlg.stretchCurvesWidget.repaint();
      }
      if (dlg.updateStretchCurvesWidgetVisibility)
         dlg.updateStretchCurvesWidgetVisibility();
   };
   zone.syncCurvesFromControls = function(force) {
      var idx = zone.curvesChan ? zone.curvesChan.combo.currentItem : 0;
      var key = ["K", "R", "G", "B", "S"][idx] || "K";
      if (force === true || !zone.curvesManual)
         zone.curvesPoints[key] = optCurvePointsFromControls({
            contrast: zone.curvesContrast,
            brightness: zone.curvesBright,
            shadows: zone.curvesShadows,
            highlights: zone.curvesHighlights,
            saturation: zone.curvesSaturation
         });
   };
   zone.scheduleCurvesLive = function(delayMs) {
      if (!(zone.curvesLive && zone.curvesLive.checked) || zone.getAlgorithmId() !== "CURVES")
         return;
      zone.computeCurvesHistogram();
      zone.updateCurvesWidget();
      dlg.previewScheduler.request("stretch.curves." + (isStars ? "stars" : "rgb"), function() {
         var key = dlg.resolveStretchZoneKey(isStars);
         if (!key)
            return;
         if (!tab.preview.activate(key, false))
            return;
         tab.preview.beginCandidateFromFactory("Stretch CURVES (live)", function(currentView) {
            var live = optCreateLiveCandidateView(currentView, "Opt_Live_stretch_curves", dlg);
            return optApplyStretchCandidate(live, "CURVES", zone, dlg) || live;
         }, "stretch_curves", {
            upgradeFn: function() {
               var pane = tab.preview;
               if (!pane || !optSafeView(pane.currentView))
                  return null;
               var full = optCloneView(pane.currentView, "Opt_Candidate_" + pane.currentKey + "_Stretch_CURVES_Full", false);
               try {
                  return optApplyStretchCandidate(full, "CURVES", zone, dlg) || full;
               } catch (e) {
                  optCloseView(full);
                  throw e;
               }
            }
         });
      }, {
         debounceMs: delayMs || 160,
         statusLabel: tab.preview.status,
         busyText: "<b>Live:</b> rendering Stretch Curves...",
         doneText: "<b>Live:</b> Stretch Curves preview ready.",
         errorText: "<b>Live:</b> Stretch Curves preview failed.",
         onError: function(k, e) { console.warningln("Stretch Curves live preview error: " + e.message); }
      });
   };
   var stretchCurvesChanged = function() {
      zone.curvesManual = false;
      zone.syncCurvesFromControls(true);
      zone.scheduleCurvesLive(170);
   };
   zone.curvesChan.combo.onItemSelected = function() {
      zone.syncCurvesFromControls(false);
      zone.updateCurvesWidget();
      zone.scheduleCurvesLive(140);
   };
   zone.curvesContrast.onValueUpdated = stretchCurvesChanged;
   zone.curvesBright.onValueUpdated = stretchCurvesChanged;
   zone.curvesShadows.onValueUpdated = stretchCurvesChanged;
   zone.curvesHighlights.onValueUpdated = stretchCurvesChanged;
   zone.curvesSaturation.onValueUpdated = stretchCurvesChanged;
   zone.curvesLive.onCheck = function(checked) {
      zone.updateCurvesWidget();
      if (checked) zone.scheduleCurvesLive(140);
   };

   zone.status = optInfoLabel(body, "Status: Waiting.");
   body.sizer.add(zone.status);

   zone.getAlgorithmId = function() {
      var idx = 0;
      try { idx = zone.combo.currentItem; } catch (e) {}
      if (idx >= 0 && idx < zone.algorithmIds.length)
         return zone.algorithmIds[idx];
      return "STF";
   };
   zone.sync = function() {
      var id = zone.getAlgorithmId();
      zone.stfGroup.visible = id === "STF";
      zone.masGroup.visible = id === "MAS";
      if (zone.statGroup)
         zone.statGroup.visible = id === "SS";
      if (zone.starGroup)
         zone.starGroup.visible = id === "STAR";
      zone.vlxGroup.visible = id === "VLX";
      zone.curvesGroup.visible = id === "CURVES";
      if (id === "CURVES")
         zone.updateCurvesWidget();
      else if (dlg.updateStretchCurvesWidgetVisibility)
         dlg.updateStretchCurvesWidgetVisibility();
   };
   zone.combo.onItemSelected = function() { zone.sync(); };
   zone.sync();

   var rowButtons = new Control(body);
   rowButtons.sizer = new HorizontalSizer();
   rowButtons.sizer.spacing = 5;
   zone.btnPreview = optPrimaryButton(rowButtons, "Preview", 80);
   zone.btnToPost = optPrimaryButton(rowButtons, "To Post Processing", 150);
   rowButtons.sizer.add(zone.btnPreview);
   rowButtons.sizer.add(zone.btnToPost);
   rowButtons.sizer.addStretch();
   body.sizer.add(rowButtons);

   zone.btnPreview.onClick = function() {
      optSafeUi(title + " Preview", function() {
         var key = dlg.resolveStretchZoneKey(isStars);
         if (!key)
            throw new Error(isStars ? "No STARS image available. Run SXT first." : "No RGB / STARLESS image available in Stretching.");
         if (!tab.preview.activate(key, false))
            throw new Error(optLabelForKey(key) + " image is not valid. Please run Star Split again.");
         zone.status.text = "Status: Calculating preview...";
         processEvents();
         // Re-activate after processEvents: a scheduled live-preview callback may have
         // changed currentKey/currentView to the companion image during the event flush.
         if (tab.preview.currentKey !== key)
            tab.preview.activate(key, false);
         tab.preview.beginCandidate("Stretch " + zone.getAlgorithmId(), function(candidate) {
            return optApplyStretchCandidate(candidate, zone.getAlgorithmId(), zone, dlg);
         }, "stretch_" + zone.getAlgorithmId());
         zone.status.text = "Status: Preview ready. Use Set to Current to commit.";
      });
   };

   zone.btnToPost.onClick = function() {
      optSafeUi(title + " To Post Processing", function() {
         var key = dlg.resolveStretchZoneKey(isStars);
         if (!key)
            throw new Error(isStars ? "No committed STARS image available." : "No committed RGB / STARLESS image available.");
         tab.preview.activate(key, false);
         dlg.sendActiveToPost();
      });
   };
   tab.leftContent.sizer.add(section.bar);
   tab.leftContent.sizer.add(section.body);
   return zone;
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

function optBuildWorkflowTitleBar(parent) {
   var bar = new Control(parent);
   bar.autoFillBackground = true;
   bar.backgroundColor = OPT_PANEL;
   bar.styleSheet = "QWidget { background-color:" + OPT_UI.bgPanel + "; border:1px solid " + OPT_UI.border + "; border-radius:" + OPT_UI.radiusLg + "; }";
   bar.sizer = new HorizontalSizer();
   bar.sizer.margin = 6;
   bar.sizer.spacing = 7;

   var logo = new Label(bar);
   logo.text = "\u03C0";
   logo.textAlignment = TextAlign_Center | TextAlign_VertCenter;
   logo.styleSheet =
      "QLabel { color:" + OPT_UI.primary + "; font-size:14pt; font-weight:700; background-color:" + OPT_UI.bgInset +
      "; border:1px solid " + OPT_UI.borderStrong + "; border-radius:" + OPT_UI.radius + "; padding:1px 7px; min-width:22px; min-height:22px; }";
   bar.sizer.add(logo);

   var titleStack = new Control(bar);
   titleStack.styleSheet = "QWidget { background-color:" + OPT_UI.bgPanel + "; border:0px; }";
   titleStack.sizer = new VerticalSizer();
   titleStack.sizer.spacing = 0;
   var title = new Label(titleStack);
   title.text = "PI Workflow";
   title.styleSheet = "QLabel { color:" + OPT_UI.text + "; font-size:11pt; font-weight:600; background-color:" + OPT_UI.bgPanel + "; border:0px; }";
   optApplyTooltip(title, "title", "PI Workflow", "Section");
   var sub = new Label(titleStack);
   sub.text = OPT_VERSION + " \u00B7 Optimized";
   sub.styleSheet = "QLabel { color:" + OPT_UI.textDim + "; font-size:8pt; background-color:" + OPT_UI.bgPanel + "; border:0px; }";
   optApplyTooltip(sub, "title", "PI Workflow", "Section");
   titleStack.sizer.add(title);
   titleStack.sizer.add(sub);
   bar.sizer.add(titleStack);
   var repoButton = optButton(bar, "Recommended Repositories", 190);
   repoButton.onClick = function() { optShowRecommendedRepositoriesDialog(bar); };
   var helpButton = optButton(bar, "Help", 60);
   helpButton.onClick = function() {
      var helpPath = (#__FILE__).replace(/[^\\/]+$/, "") + "PI Workflow_help.xhtml";
      optOpenPathWithSystemViewer(helpPath);
   };
   bar.sizer.addStretch();
   bar.sizer.add(repoButton);
   bar.sizer.add(helpButton);
   return bar;
}

PIWorkflowOptDialog.prototype.configurePreTab = function() {
   var dlg = this;
   this.prePlateSolved = false;

   this.preTab.addProcessSection("Plate Solving", [{
      text: "Solve Image",
      stage: "Plate Solving",
      width: 130,
      action: function(tab, pane) {
         if (!pane.currentKey || !optSafeView(pane.currentView))
            throw new Error("Select a Pre-processing image first.");
         dlg.preSolveStatus.text = "<b style='color:#FFe5c070;'>Solving...</b> (" + pane.currentView.id + ")";
         processEvents();
         dlg.prePlateSolved = optHasAstrometricSolution(pane.currentView);
         if (!dlg.prePlateSolved)
            dlg.prePlateSolved = optSolveAstrometryOnWindow(pane.currentView.window, "the current target");
         if (dlg.prePlateSolved) {
            dlg.store.markStage(pane.currentKey, "Plate Solving");
            dlg.preSolveStatus.text = "<b style='color:#FF7ed89b;'>Solved</b> (" + pane.currentView.id + ")";
         } else {
            dlg.preSolveStatus.text = "<b style='color:#FFe08070;'>Failed</b> (" + pane.currentView.id + ")";
         }
         pane.refreshButtons();
         pane.render(pane.currentView, false);
      }
   }], {
      info: "<p>Plate solving provides the astrometric solution required by MGC, SPCC and RGB geometric correction.</p>",
      build: function(body) {
         dlg.preSolveStatus = optInfoLabel(body, "<b style='color:#FFe5c070;'>Not solved</b>");
         body.sizer.add(dlg.preSolveStatus);
      }
   });

   this.preTab.addProcessSection("Gradient Correction", [{
      text: "Gradient Correction",
      stage: "Gradient Correction",
      actionKey: "gradient",
      name: "btnPreGradient",
      width: 170
   }], {
      info: "<p>Choose the background-correction engine and generate a candidate preview. External engines degrade safely when unavailable.</p>",
      build: function(body) {
         var row = optComboRow(body, "Algorithm:", [
            "MultiscaleGradient Correction (MGC)",
            "AutoDBE (SetiAstro)",
            "AutomaticBackgroundExtractor (ABE)",
            "GraXpert"
         ], 118);
         dlg.comboPreGradient = row.combo;
         body.sizer.add(row.row);

         dlg.preMgcGroup = optInnerGroup(body, "Gradient Model");
         dlg.comboMgcScale = optComboRow(dlg.preMgcGroup, "Gradient scale:", ["128", "256", "512", "1024", "2048", "4096", "8192"], 150);
         dlg.comboMgcScale.combo.currentItem = 3;
         dlg.comboMgcSep = optComboRow(dlg.preMgcGroup, "Structure separation:", ["1", "2", "3", "4", "5", "6", "7", "8"], 150);
         dlg.comboMgcSep.combo.currentItem = 2;
         dlg.ncMgcSmoothness = optNumeric(dlg.preMgcGroup, "Smoothness:", 0.0, 10.0, 1.00, 2, 150);
         dlg.ncMgcScaleR = optNumeric(dlg.preMgcGroup, "R/K:", 0.0, 5.0, 1.0000, 4, 150);
         dlg.ncMgcScaleG = optNumeric(dlg.preMgcGroup, "G:", 0.0, 5.0, 1.0000, 4, 150);
         dlg.ncMgcScaleB = optNumeric(dlg.preMgcGroup, "B:", 0.0, 5.0, 1.0000, 4, 150);
         dlg.preMgcGroup.sizer.add(dlg.comboMgcScale.row);
         dlg.preMgcGroup.sizer.add(dlg.comboMgcSep.row);
         dlg.preMgcGroup.sizer.add(dlg.ncMgcSmoothness);
         dlg.preMgcGroup.sizer.add(dlg.ncMgcScaleR);
         dlg.preMgcGroup.sizer.add(dlg.ncMgcScaleG);
         dlg.preMgcGroup.sizer.add(dlg.ncMgcScaleB);
         body.sizer.add(dlg.preMgcGroup);

         dlg.preAdbeGroup = optInnerGroup(body, "AutoDBE Parameters");
         dlg.ncAdbePaths = optNumeric(dlg.preAdbeGroup, "Descent Paths:", 10, 200, 50, 0, 140);
         dlg.ncAdbeTol = optNumeric(dlg.preAdbeGroup, "Tolerance:", 0.5, 5.0, 2.0, 2, 140);
         dlg.ncAdbeSmooth = optNumeric(dlg.preAdbeGroup, "Smoothing:", 0.1, 0.8, 0.25, 2, 140);
         dlg.preAdbeGroup.sizer.add(dlg.ncAdbePaths);
         dlg.preAdbeGroup.sizer.add(dlg.ncAdbeTol);
         dlg.preAdbeGroup.sizer.add(dlg.ncAdbeSmooth);
         body.sizer.add(dlg.preAdbeGroup);

         dlg.preAbeGroup = optInnerGroup(body, "ABE Parameters");
         dlg.comboAbeCorrection = optComboRow(dlg.preAbeGroup, "Correction:", ["Subtraction", "Division"], 140);
         dlg.ncAbeFunctionDegree = optNumeric(dlg.preAbeGroup, "Function degree:", 0, 8, 1, 0, 140);
         dlg.chkAbeNormalize = new CheckBox(dlg.preAbeGroup);
         dlg.chkAbeNormalize.text = "Normalize";
         optApplyCheckBoxTooltip(dlg.chkAbeNormalize);
         dlg.preAbeGroup.sizer.add(dlg.comboAbeCorrection.row);
         dlg.preAbeGroup.sizer.add(dlg.ncAbeFunctionDegree);
         dlg.preAbeGroup.sizer.add(dlg.chkAbeNormalize);
         body.sizer.add(dlg.preAbeGroup);

         dlg.preGraXpertGroup = optInnerGroup(body, "GraXpert Parameters");
         dlg.comboGraXpertCorrection = optComboRow(dlg.preGraXpertGroup, "Correction:", ["Subtraction", "Division"], 140);
         dlg.ncGraXpertSmoothing = optNumeric(dlg.preGraXpertGroup, "Smoothing:", 0.0, 1.0, 0.50, 3, 140);
         dlg.preGraXpertGroup.sizer.add(dlg.comboGraXpertCorrection.row);
         dlg.preGraXpertGroup.sizer.add(dlg.ncGraXpertSmoothing);
         body.sizer.add(dlg.preGraXpertGroup);

         dlg.syncPreGradientPanels = function(idx) {
            dlg.preMgcGroup.visible = idx === 0;
            dlg.preAdbeGroup.visible = idx === 1;
            dlg.preAbeGroup.visible = idx === 2;
            dlg.preGraXpertGroup.visible = idx === 3;
         };
         dlg.comboPreGradient.onItemSelected = function(idx) { dlg.syncPreGradientPanels(idx); };
         dlg.syncPreGradientPanels(0);
      }
   });

   this.__sectionPreColorCalibration = this.preTab.addProcessSection("Color Calibration", [
      { text: "SPCC", stage: "Color Calibration (SPCC)", actionKey: "spcc", name: "btnPreSPCC", width: 80 },
      { text: "Auto Linear Fit", stage: "Auto Linear Fit", actionKey: "alf", name: "btnPreALF", width: 140 },
      { text: "Background Neutralization", stage: "Background Neutralization", actionKey: "bn", name: "btnPreBN", width: 200 }
   ], {
      info: "<p>Calibrate color balance using SPCC, Auto Linear Fit or Background Neutralization. Each action produces a candidate for Toggle and Set to Current.</p>"
   });

   this.preTab.addProcessSection("Deconvolution", [{
      text: "Deconvolution",
      stage: "Deconvolution",
      actionKey: "decon",
      name: "btnPreApplyDecon",
      width: 150
   }], {
      info: "<p>BlurXTerminator and Cosmic Clarity settings. The optimized script keeps the same controls and creates a safe candidate preview for testing.</p>",
      build: function(body) {
         var row = optComboRow(body, "Algorithm:", ["BlurXTerminator", "Cosmic Clarity (SetiAstro)"], 118);
         dlg.comboPreDecon = row.combo;
         body.sizer.add(row.row);

         dlg.preBxtGroup = optInnerGroup(body, "BlurXTerminator Parameters");
         dlg.ncBxtStars = optNumeric(dlg.preBxtGroup, "Sharpen Stars:", 0.0, 1.0, 0.50, 2, 160);
         dlg.ncBxtAdjustStarHalos = optNumeric(dlg.preBxtGroup, "Adjust Star Halos:", -1.0, 1.0, 0.00, 2, 160);
         dlg.chkBxtAutoPSF = new CheckBox(dlg.preBxtGroup);
         dlg.chkBxtAutoPSF.text = "Automatic PSF";
         dlg.chkBxtAutoPSF.checked = true;
         optApplyCheckBoxTooltip(dlg.chkBxtAutoPSF);
         dlg.ncBxtPSFDiameter = optNumeric(dlg.preBxtGroup, "PSF Diameter (p):", 0.0, 12.0, 4.0, 2, 160);
         dlg.ncBxtSharpenNonstellar = optNumeric(dlg.preBxtGroup, "Sharpen Nonstellar:", 0.0, 1.0, 0.35, 2, 160);
         dlg.chkBxtCorrectOnly = new CheckBox(dlg.preBxtGroup);
         dlg.chkBxtCorrectOnly.text = "Cor. Only";
         optApplyCheckBoxTooltip(dlg.chkBxtCorrectOnly);
         dlg.chkBxtLuminanceOnly = new CheckBox(dlg.preBxtGroup);
         dlg.chkBxtLuminanceOnly.text = "Lum. Only";
         dlg.chkBxtLuminanceOnly.checked = true;
         optApplyCheckBoxTooltip(dlg.chkBxtLuminanceOnly);
         dlg.preBxtGroup.sizer.add(dlg.ncBxtStars);
         dlg.preBxtGroup.sizer.add(dlg.ncBxtAdjustStarHalos);
         dlg.preBxtGroup.sizer.add(dlg.chkBxtAutoPSF);
         dlg.preBxtGroup.sizer.add(dlg.ncBxtPSFDiameter);
         dlg.preBxtGroup.sizer.add(dlg.ncBxtSharpenNonstellar);
         dlg.preBxtGroup.sizer.add(dlg.chkBxtCorrectOnly);
         dlg.preBxtGroup.sizer.add(dlg.chkBxtLuminanceOnly);
         body.sizer.add(dlg.preBxtGroup);

         dlg.preCCSharpGroup = optInnerGroup(body, "Cosmic Clarity Sharpening Parameters");
         dlg.comboPreCCSharpenMode = optComboRow(dlg.preCCSharpGroup, "Sharpening Mode:", ["Both (Stellar + Non-Stellar)", "Stellar Only", "Non-Stellar Only"], 150);
         dlg.ncPreCCStellarAmt = optNumeric(dlg.preCCSharpGroup, "Stellar Amount:", 0.0, 1.0, 0.90, 2, 150);
         dlg.ncPreCCNSStrength = optNumeric(dlg.preCCSharpGroup, "Non-Stellar Size:", 1.0, 8.0, 3.0, 1, 150);
         dlg.ncPreCCNSAmount = optNumeric(dlg.preCCSharpGroup, "Non-Stellar Amt:", 0.0, 1.0, 0.50, 2, 150);
         dlg.chkPreCCRemoveAb = new CheckBox(dlg.preCCSharpGroup);
         dlg.chkPreCCRemoveAb.text = "Remove Aberration First";
         optApplyCheckBoxTooltip(dlg.chkPreCCRemoveAb);
         dlg.preCCSharpGroup.sizer.add(dlg.comboPreCCSharpenMode.row);
         dlg.preCCSharpGroup.sizer.add(dlg.ncPreCCStellarAmt);
         dlg.preCCSharpGroup.sizer.add(dlg.ncPreCCNSStrength);
         dlg.preCCSharpGroup.sizer.add(dlg.ncPreCCNSAmount);
         dlg.preCCSharpGroup.sizer.add(dlg.chkPreCCRemoveAb);
         body.sizer.add(dlg.preCCSharpGroup);

         dlg.syncPreDeconPanels = function(idx) {
            dlg.preBxtGroup.visible = idx === 0;
            dlg.preCCSharpGroup.visible = idx === 1;
            if (optHasOwn(dlg.preTab, "btnPreApplyDecon") && dlg.preTab.btnPreApplyDecon)
               dlg.preTab.btnPreApplyDecon.text = "Deconvolution";
         };
         dlg.comboPreDecon.onItemSelected = function(idx) { dlg.syncPreDeconPanels(idx); };
         dlg.syncPreDeconPanels(0);
      }
   });

   var row = new Control(this.preTab.leftContent);
   row.sizer = new HorizontalSizer();
   row.sizer.spacing = 4;
   this.btnToStretch = optPrimaryButton(row, "To Stretching", 130);
   this.btnToStretch.onClick = function() { optSafeUi("To Stretching", function() { dlg.sendActiveToStretch(); }); };
   row.sizer.add(this.btnToStretch);
   row.sizer.addStretch();
   this.preTab.leftContent.sizer.add(row);
   this.preTab.leftContent.sizer.addStretch();
};

PIWorkflowOptDialog.prototype.configureStretchTab = function() {
   var dlg = this;
   var sxt = optSection(this.stretchTab.leftContent, "Star Split");
   this.stretchTab.registerSection(sxt);
   this.btnCreateStarSplit = optPrimaryButton(sxt.body, "Generate Starless / Stars (SXT)", 200);
   this.btnCreateStarSplit.onClick = function() { optSafeUi("Generate Starless / Stars (SXT)", function() { dlg.createStarSplit(); }); };
   sxt.body.sizer.add(this.btnCreateStarSplit);
   this.stretchTab.leftContent.sizer.add(sxt.bar);
   this.stretchTab.leftContent.sizer.add(sxt.body);

   this.stretchZoneRgb = optBuildStretchZone(this.stretchTab, "RGB / STARLESS", false);
   this.stretchZoneStars = optBuildStretchZone(this.stretchTab, "STARS", true);
   this.stretchTab.registerSection(this.stretchZoneRgb.section);
   this.stretchTab.registerSection(this.stretchZoneStars.section);
   this.buildStretchCurvesWidget();

   this.stretchTab.leftContent.sizer.addStretch();
};

PIWorkflowOptDialog.prototype.buildStretchCurvesWidget = function() {
   var dlg = this;
   this.stretchCurvesLabel = optInfoLabel(this.stretchTab.preview.control, "Curves: left click adds/drags points, right click removes points.");
   this.stretchCurvesWidget = new Control(this.stretchTab.preview.control);
   this.stretchCurvesWidget.setFixedHeight(190);
   this.stretchCurvesWidget.cursor = new Cursor(StdCursor_Cross);
   this.stretchCurvesWidget.__zone = null;
   this.stretchCurvesWidget.__hist = null;
   this.stretchCurvesWidget.__pts = [[0, 0], [1, 1]];
   this.stretchCurvesWidget.__dragging = -1;
   this.stretchCurvesWidget.__hoverIdx = -1;
   this.stretchCurvesWidget.__pointRadius = 5;
   this.stretchCurvesWidget.xToCanvas = function(x) { var m = 10; return m + x * (this.width - 2 * m); };
   this.stretchCurvesWidget.yToCanvas = function(y) { var m = 10; return (this.height - m) - y * (this.height - 2 * m); };
   this.stretchCurvesWidget.canvasToX = function(x) { var m = 10; return (x - m) / Math.max(1, this.width - 2 * m); };
   this.stretchCurvesWidget.canvasToY = function(y) { var m = 10; return ((this.height - m) - y) / Math.max(1, this.height - 2 * m); };
   this.stretchCurvesWidget.findNearest = function(x, y) {
      var pts = this.__pts || [[0, 0], [1, 1]];
      var best = 15 * 15, idx = -1;
      for (var i = 0; i < pts.length; ++i) {
         var px = this.xToCanvas(pts[i][0]);
         var py = this.yToCanvas(pts[i][1]);
         var d = (x - px) * (x - px) + (y - py) * (y - py);
         if (d < best) { best = d; idx = i; }
      }
      return idx;
   };
   this.stretchCurvesWidget.onPaint = function() {
      var g = new Graphics(this);
      try {
         var w = this.width, h = this.height, m = 10, cw = w - 2 * m, ch = h - 2 * m;
         g.fillRect(0, 0, w, h, new Brush(0xff1a1a1a));
         g.pen = new Pen(0xff333333, 1);
         for (var gi = 0; gi <= 4; ++gi) {
            g.drawLine(m + gi * cw / 4, m, m + gi * cw / 4, h - m);
            g.drawLine(m, h - m - gi * ch / 4, w - m, h - m - gi * ch / 4);
         }
         g.pen = new Pen(0xff555555, 1);
         g.drawRect(m, m, w - m, h - m);
         var zone = this.__zone;
         var key = zone && zone.curvesChan ? (["K", "R", "G", "B", "S"][zone.curvesChan.combo.currentItem] || "K") : "K";
         var hist = this.__hist;
         if (hist) {
            var chans = key === "K" ? ["R", "G", "B"] : [key];
            var colors = { R: 0x60ff4444, G: 0x6044ff44, B: 0x604488ff, S: 0x60ffaa00, K: 0x60dddddd };
            var maxCount = 1;
            for (var c = 0; c < chans.length; ++c) {
               var data = hist[chans[c]] || hist.K;
               for (var bi = 0; data && bi < data.length; ++bi)
                  if (data[bi] > maxCount) maxCount = data[bi];
            }
            for (var c2 = 0; c2 < chans.length; ++c2) {
               var ck = chans[c2], d = hist[ck] || hist.K;
               if (!d) continue;
               g.pen = new Pen(colors[ck] || 0x60dddddd, 1);
               for (var bj = 1; bj < d.length - 1; ++bj) {
                  var bx = m + (bj / (d.length - 1)) * cw;
                  var bh = (d[bj] / maxCount) * ch * 0.85;
                  g.drawLine(bx, h - m, bx, h - m - bh);
               }
            }
         } else {
            g.pen = new Pen(0xff707070, 1);
            g.drawTextRect(new Rect(m, m, w - m, h - m), "Histogram", TextAlign_Center | TextAlign_VertCenter);
         }
         try { g.pen = new Pen(0xff404040, 1, PenStyle_Dash); } catch (eDash) { g.pen = new Pen(0xff404040, 1); }
         g.drawLine(m, h - m, w - m, m);
         var pts = this.__pts || [[0, 0], [1, 1]];
         var lut = optAkimaInterpolate(pts, 512);
         g.antialiasing = true;
         g.pen = new Pen(0xffffffff, 2);
         for (var si = 1; si < lut.length; ++si)
            g.drawLine(m + ((si - 1) / (lut.length - 1)) * cw, h - m - lut[si - 1] * ch, m + (si / (lut.length - 1)) * cw, h - m - lut[si] * ch);
         for (var pi = 0; pi < pts.length; ++pi) {
            var px = this.xToCanvas(pts[pi][0]), py = this.yToCanvas(pts[pi][1]), rr = this.__pointRadius;
            g.pen = new Pen(0xffffffff, 1);
            g.brush = new Brush(pi === this.__hoverIdx ? 0xffffcc00 : 0xffffffff);
            g.fillRect(px - rr, py - rr, px + rr, py + rr, g.brush);
            g.drawRect(px - rr, py - rr, px + rr, py + rr);
         }
      } finally {
         try { g.end(); } catch (e0) {}
      }
   };
   this.stretchCurvesWidget.onMousePress = function(x, y, button) {
      var zone = this.__zone;
      if (!zone)
         return;
      var idxKey = zone.curvesChan ? zone.curvesChan.combo.currentItem : 0;
      var key = ["K", "R", "G", "B", "S"][idxKey] || "K";
      var pts = zone.curvesPoints[key] || [[0, 0], [1, 1]];
      if (button === OPT_MOUSE_LEFT) {
         var idx = this.findNearest(x, y);
         if (idx < 0) {
            var nx = optClamp01(this.canvasToX(x)), ny = optClamp01(this.canvasToY(y));
            pts.push([nx, ny]);
            pts.sort(function(a, b) { return a[0] - b[0]; });
            idx = this.findNearest(x, y);
         }
         zone.curvesManual = true;
         zone.curvesPoints[key] = pts;
         this.__pts = pts;
         this.__dragging = idx;
         this.repaint();
      } else if (button === OPT_MOUSE_RIGHT) {
         var ridx = this.findNearest(x, y);
         if (ridx > 0 && ridx < pts.length - 1) {
            pts.splice(ridx, 1);
            zone.curvesManual = true;
            zone.curvesPoints[key] = pts;
            this.__pts = pts;
            this.repaint();
            zone.scheduleCurvesLive(160);
         }
      }
   };
   this.stretchCurvesWidget.onMouseMove = function(x, y) {
      var zone = this.__zone;
      if (!zone)
         return;
      var idxKey = zone.curvesChan ? zone.curvesChan.combo.currentItem : 0;
      var key = ["K", "R", "G", "B", "S"][idxKey] || "K";
      var pts = zone.curvesPoints[key] || [[0, 0], [1, 1]];
      if (this.__dragging >= 0 && this.__dragging < pts.length) {
         var di = this.__dragging, ny = optClamp01(this.canvasToY(y));
         if (di === 0 || di === pts.length - 1)
            pts[di][1] = ny;
         else {
            pts[di][0] = Math.max(pts[di - 1][0] + 0.005, Math.min(pts[di + 1][0] - 0.005, optClamp01(this.canvasToX(x))));
            pts[di][1] = ny;
         }
         zone.curvesPoints[key] = pts;
         this.__pts = pts;
         this.repaint();
      } else {
         var old = this.__hoverIdx;
         this.__hoverIdx = this.findNearest(x, y);
         if (old !== this.__hoverIdx) this.repaint();
      }
   };
   this.stretchCurvesWidget.onMouseRelease = function() {
      if (this.__dragging >= 0) {
         this.__dragging = -1;
         if (this.__zone)
            this.__zone.scheduleCurvesLive(160);
      }
   };
   this.updateStretchCurvesWidgetVisibility = function() {
      var zone = dlg.activeStretchCurvesZone;
      var visible = !!(zone && zone.getAlgorithmId && zone.getAlgorithmId() === "CURVES" && zone.curvesLive && zone.curvesLive.checked === true);
      dlg.stretchCurvesLabel.visible = visible;
      dlg.stretchCurvesWidget.visible = visible;
   };
   this.stretchTab.preview.control.sizer.add(this.stretchCurvesLabel);
   this.stretchTab.preview.control.sizer.add(this.stretchCurvesWidget);
   this.updateStretchCurvesWidgetVisibility();
};

function optApplyMaskToProcessView(workView, dialog, useMask) {
   if (useMask !== true)
      return false;
   if (!dialog || !optSafeView(dialog.postActiveMask))
      throw new Error("No active Post mask is available. Generate a mask first.");
   if (workView.image.width !== dialog.postActiveMask.image.width ||
       workView.image.height !== dialog.postActiveMask.image.height)
      throw new Error("The active mask geometry does not match the target image.");
   workView.window.mask = dialog.postActiveMask.window;
   try { workView.window.maskEnabled = true; } catch (e0) {}
   return true;
}

function optClearProcessMask(workView) {
   try { if (optSafeView(workView)) workView.window.removeMask(); } catch (e0) {}
   try { if (optSafeView(workView)) workView.window.maskEnabled = false; } catch (e1) {}
}

function optRunPostOperationWithOptionalMask(workView, dialog, useMask, operationFn) {
   if (!optSafeView(workView))
      throw new Error("No valid Post target view.");
   if (typeof operationFn !== "function")
      return workView;
   var maskApplied = optApplyMaskToProcessView(workView, dialog, useMask);
   try {
      return operationFn(workView) || workView;
   } finally {
      if (maskApplied)
         optClearProcessMask(workView);
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

function optExecuteTgvDenoiseOnView(targetView, dialog) {
   if (OPT_TEST_MODE)
      return optRunTestModePreviewTransform(targetView, "darken", 0.08);
   var tgv = optCreateGenericProcessInstance(["TGVDenoise"], []);
   if (!tgv)
      throw new Error("TGVDenoise is not available in this PixInsight build.");
   optTrySetProcessPropertySilently(tgv, ["strengthL", "luminanceStrength"], optNumericValue(dialog.ncPostTgvStrengthL, 5.0));
   optTrySetProcessPropertySilently(tgv, ["strengthC", "chrominanceStrength"], optNumericValue(dialog.ncPostTgvStrengthC, 3.0));
   optTrySetProcessPropertySilently(tgv, ["edgeProtection"], optNumericValue(dialog.ncPostTgvEdge, 0.002));
   optTrySetProcessPropertySilently(tgv, ["smoothness"], optNumericValue(dialog.ncPostTgvSmooth, 2.0));
   optTrySetProcessPropertySilently(tgv, ["maxIterations", "iterations"], Math.round(optNumericValue(dialog.ncPostTgvIter, 500)));
   tgv.executeOn(targetView);
   return targetView;
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

function optExecuteUnsharpMaskOnView(targetView, dialog) {
   if (OPT_TEST_MODE)
      return optRunTestModePreviewTransform(targetView, "contrast", 0.12);
   var usm = optCreateGenericProcessInstance(["UnsharpMask"], []);
   if (!usm)
      throw new Error("UnsharpMask is not available in this PixInsight build.");
   optTrySetProcessPropertySilently(usm, ["sigma", "stdDev"], optNumericValue(dialog.ncPostUsmSigma, 2.0));
   optTrySetProcessPropertySilently(usm, ["amount"], optNumericValue(dialog.ncPostUsmAmount, 0.50));
   optTrySetProcessPropertySilently(usm, ["deringing"], optChecked(dialog.chkPostUsmDeringing, false));
   optTrySetProcessPropertySilently(usm, ["deringingDark"], optNumericValue(dialog.ncPostUsmDeringDark, 0.10));
   optTrySetProcessPropertySilently(usm, ["deringingBright"], optNumericValue(dialog.ncPostUsmDeringBright, 0.00));
   usm.executeOn(targetView);
   return targetView;
}

function optExecuteHdrMtOnView(targetView, dialog) {
   if (OPT_TEST_MODE)
      return optRunTestModePreviewTransform(targetView, "contrast", 0.16);
   var hdr = optCreateGenericProcessInstance(["HDRMultiscaleTransform"], []);
   if (!hdr)
      throw new Error("HDRMultiscaleTransform is not available in this PixInsight build.");
   optTrySetProcessPropertySilently(hdr, ["numberOfLayers", "layers"], Math.round(optNumericValue(dialog.ncPostHdrLayers, 6)));
   optTrySetProcessPropertySilently(hdr, ["numberOfIterations", "iterations"], Math.round(optNumericValue(dialog.ncPostHdrIter, 1)));
   optTrySetProcessPropertySilently(hdr, ["overdrive"], optNumericValue(dialog.ncPostHdrOverdrive, 0.0));
   optTrySetProcessPropertySilently(hdr, ["medianTransform"], optChecked(dialog.chkPostHdrMedian, false));
   optTrySetProcessPropertySilently(hdr, ["lightnessMask"], optChecked(dialog.chkPostHdrLightProt, true));
   hdr.executeOn(targetView);
   return targetView;
}

function optExecuteLheOnView(targetView, dialog) {
   if (OPT_TEST_MODE)
      return optRunTestModePreviewTransform(targetView, "contrast", 0.18);
   var lhe = optCreateGenericProcessInstance(["LocalHistogramEqualization"], []);
   if (!lhe)
      throw new Error("LocalHistogramEqualization is not available in this PixInsight build.");
   optTrySetProcessPropertySilently(lhe, ["kernelRadius", "radius"], Math.round(optNumericValue(dialog.ncPostLheRadius, 64)));
   optTrySetProcessPropertySilently(lhe, ["contrastLimit", "slopeLimit"], optNumericValue(dialog.ncPostLheSlope, 2.0));
   optTrySetProcessPropertySilently(lhe, ["amount"], optNumericValue(dialog.ncPostLheAmount, 0.70));
   optTrySetProcessPropertySilently(lhe, ["circularKernel"], optChecked(dialog.chkPostLheCircular, true));
   lhe.executeOn(targetView);
   return targetView;
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
      g.pen = new Pen(active ? 0xFF00FFFF : 0xFF60C0FF, active ? 2 : 1);
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

function optGeneratePostMask(dialog) {
   var view = dialog.postTab.preview.candidateView || dialog.postTab.preview.currentView;
   if (!optSafeView(view))
      throw new Error("Select a Post image first.");
   if (dialog.postMaskMemory && optSafeView(dialog.postGeneratedMask))
      dialog.postMaskMemory.preserveSharedView(dialog.postGeneratedMask);
   if (optSafeView(dialog.postGeneratedMask))
      optCloseView(dialog.postGeneratedMask);
   var algo = dialog.comboPostMask ? dialog.comboPostMask.currentItem : 0;
   var maskImg = null;
   var baseId = "Post_RangeMask";
   if (algo === 1) {
      dialog.postGeneratedMask = optBuildPostColorMaskView(view, dialog);
   } else if (algo === 2) {
      maskImg = optBuildPostFameMaskImage(view, dialog);
      baseId = "Post_FAMEMask";
      var blurAmt = dialog.ncPostFameBlur ? dialog.ncPostFameBlur.value : 0;
      try {
         if (blurAmt > 0) {
            var kernel = optGaussianKernelForSigma(blurAmt);
            maskImg.convolveSeparable(kernel, kernel);
         }
         dialog.postGeneratedMask = optCreateMaskWindowFromImage(maskImg, baseId, view);
      } finally {
         try { maskImg.free(); } catch (e0) {}
      }
   } else {
      dialog.postGeneratedMask = optBuildPostRangeMaskView(view, dialog);
   }
   dialog.postActiveMask = dialog.postGeneratedMask;
   dialog.postActiveMaskShown = true;
   optRenderPostSourcePreview(dialog, dialog.postTab.preview, false);
   if (typeof dialog.refreshPostMaskMemoryUi === "function")
      dialog.refreshPostMaskMemoryUi();
   return dialog.postActiveMask;
}

function optSetActivePostMaskFromMemory(dialog, sourceView, previewPane) {
   if (!dialog || !optSafeView(sourceView))
      throw new Error("Select a saved mask memory first.");
   if (optSafeView(dialog.postGeneratedMask))
      optCloseView(dialog.postGeneratedMask);
   dialog.postGeneratedMask = optMemoryCloneView(sourceView, "Opt_ActiveMask", sourceView.id || "Post", 0);
   dialog.postActiveMask = dialog.postGeneratedMask;
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
   if (optSafeView(dialog.postGeneratedMask))
      optCloseView(dialog.postGeneratedMask);
   try { if (optSafeView(dialog._postLiveMask)) optCloseView(dialog._postLiveMask); } catch (e0) {}
   dialog.postGeneratedMask = null;
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

function optBuildMaskMemoryPanel(dialog, parent, previewPane) {
   if (!dialog.postMaskMemory)
      dialog.postMaskMemory = new OptMaskMemoryManager(OPT_MASK_MEMORY_SLOTS);
   var row = new Control(parent);
   row.sizer = new HorizontalSizer();
   row.sizer.spacing = 3;
   row.sizer.add(optLabel(row, "Mask memories:", 96));
   var buttons = [];
   for (var i = 0; i < OPT_MASK_MEMORY_SLOTS; ++i) {
      var b = optButton(row, "" + (i + 1), 56);
      try { b.maxWidth = 62; } catch (eB) {}
      b.__maskMemoryIndex = i;
      buttons.push(b);
      b.onClick = function() {
         var activeMask = dialog.postActiveMask;
         if (!optSafeView(activeMask)) return;
         var m = optMaskMemoryMeta(dialog);
         dialog.postMaskMemory.storeAt(this.__maskMemoryIndex, activeMask, m);
         if (typeof dialog.refreshPostMaskMemoryUi === "function")
            dialog.refreshPostMaskMemoryUi();
      };
      b.onMousePress = function(x, y, button) {
         if (button !== OPT_MOUSE_RIGHT) return;
         var slot = dialog.postMaskMemory.select(this.__maskMemoryIndex);
         dialog.postActiveMaskShown = false;
         if (slot && optSafeView(slot.view) && previewPane)
            optRenderMaskViewInPreview(dialog, slot.view, "<b>Mask memory:</b> " + (slot.label || slot.view.id), previewPane, false);
         if (typeof dialog.refreshPostMaskMemoryUi === "function")
            dialog.refreshPostMaskMemoryUi();
      };
      row.sizer.add(b);
   }
   var btnReset = optButton(row, "Reset", 58);
   try {
      var ttRstMsk = optTooltipTextByKey("reset.mask");
      if (ttRstMsk) btnReset.toolTip = ttRstMsk;
   } catch (eRstMsk) {}
   var btnShowHide = optButton(row, "Show/Hide Mask", 112);
   var isPostTab = previewPane && previewPane.tab === OPT_TAB_POST;
   var btnSet = isPostTab ? optPrimaryButton(row, "Set to Active Mask", 145) : null;
   if (!dialog._postShowHideMaskButtons) dialog._postShowHideMaskButtons = [];
   dialog._postShowHideMaskButtons.push(btnShowHide);
   if (btnSet) dialog.btnPostSetActiveMask = btnSet;
   dialog.refreshPostMaskMemoryUi = function() {
      var showHideEnabled = optSafeView(dialog.postActiveMask);
      for (var k = 0; k < dialog._postShowHideMaskButtons.length; ++k)
         if (dialog._postShowHideMaskButtons[k])
            dialog._postShowHideMaskButtons[k].enabled = showHideEnabled;
      if (dialog.btnPostSetActiveMask)
         dialog.btnPostSetActiveMask.enabled = optSafeView(dialog.postMaskMemory ? dialog.postMaskMemory.selectedView() : null);
      optRefreshCcMaskCombos(dialog);
   };
   btnReset.onClick = function() {
      optSafeUi("Reset Mask Memories", function() {
         dialog.postMaskMemory.clear();
         dialog.refreshPostMaskMemoryUi();
      });
   };
   btnShowHide.onClick = function() {
      optSafeUi("Show/Hide Mask", function() {
         optSetPostActiveMaskShown(dialog, dialog.postActiveMaskShown !== true, previewPane);
      });
   };
   if (btnSet) {
      btnSet.onClick = function() {
         optSafeUi("Set to Mask", function() {
            optSetActivePostMaskFromMemory(dialog, dialog.postMaskMemory.selectedView(), previewPane);
         });
      };
   }
   row.sizer.add(btnReset);
   row.sizer.add(btnShowHide);
   if (btnSet) row.sizer.add(btnSet);
   row.sizer.addStretch();
   dialog.postMaskMemory.registerButtons(buttons);
   dialog.refreshPostMaskMemoryUi();
   parent.sizer.add(row);
   return row;
}

function optApplyPostCandidate(view, actionKey, dialog) {
   if (!optSafeView(view))
      throw new Error("No valid Post candidate view.");
   if (actionKey === "post_nr") {
      return optRunPostOperationWithOptionalMask(view, dialog, optChecked(dialog.chkPostNRUseMask, false), function(targetView) {
         var idx = dialog.comboPostNR ? dialog.comboPostNR.currentItem : 0;
         if (idx === 0)
            return optExecuteNoiseXConfiguredOnView(targetView, {
               denoise: optNumericValue(dialog.ncPostNxtDenoise, 0.85),
               iterations: optNumericValue(dialog.ncPostNxtIter, 2),
               enable_color_separation: optChecked(dialog.chkPostNxtColorSep, false),
               enable_frequency_separation: optChecked(dialog.chkPostNxtFreqSep, false),
               denoise_color: optNumericValue(dialog.ncPostNxtDenoiseColor, 0.95),
               denoise_lf: optNumericValue(dialog.ncPostNxtDenoiseLF, 0.60),
               denoise_lf_color: optNumericValue(dialog.ncPostNxtDenoiseLFColor, 1.00),
               frequency_scale: optNumericValue(dialog.ncPostNxtFreqScale, 5.0)
            });
         if (idx === 1)
            return optExecuteTgvDenoiseOnView(targetView, dialog);
         if (idx === 2) {
            if (OPT_TEST_MODE)
               return optRunTestModePreviewTransform(targetView, "darken", 0.09);
            if (!optIsCosmicClarityAvailable())
               throw new Error("Cosmic Clarity: ExternalProcess not available in this PixInsight build.");
            var dnMode = ["full", "luminance"][dialog.comboPostCCDenoiseMode.combo.currentItem] || "full";
            var dnModel = ["Walking Noise", "Standard"][dialog.comboPostCCDenoiseModel.combo.currentItem] || "Walking Noise";
            return optRunCosmicClarityOnView(targetView, {
               processMode: "denoise",
               useGPU: true,
               removeAberrationFirst: optChecked(dialog.chkPostCCNRRemoveAb, false),
               denoiseMode: dnMode,
               denoiseModel: dnModel,
               denoiseLuma: optNumericValue(dialog.ncPostCCNRLuma, 0.50),
               denoiseColor: optNumericValue(dialog.ncPostCCNRColor, 0.50)
            });
         }
         if (idx === 3)
            return optRunGraXpertDenoiseProcessWorkflow(targetView, dialog);
         return targetView;
      });
   }
   if (actionKey === "post_sharp") {
      return optRunPostOperationWithOptionalMask(view, dialog, optChecked(dialog.chkPostSharpUseMask, false), function(targetView) {
         var sidx = dialog.comboPostSharp ? dialog.comboPostSharp.currentItem : 0;
         if (sidx === 0)
            return optExecuteBlurXConfiguredOnView(targetView, optBuildPostBlurXConfigFromControls(dialog));
         if (sidx === 1)
            return optExecuteUnsharpMaskOnView(targetView, dialog);
         if (sidx === 2)
            return optExecuteHdrMtOnView(targetView, dialog);
         if (sidx === 3)
            return optExecuteLheOnView(targetView, dialog);
         if (sidx === 4)
            return optApplyFallbackTransform(targetView, "contrast", optNumericValue(dialog.ncPostDseAmount, 0.18));
         if (sidx === 5) {
            if (OPT_TEST_MODE)
               return optRunTestModePreviewTransform(targetView, "contrast", 0.14);
            return optRunCosmicClarityOnView(targetView, {
               sharpeningMode: optComboText(dialog.comboPostCCSharpenModeCombo, "Both"),
               stellarAmount: optNumericValue(dialog.ncPostCCStellarAmt, 0.90),
               nonStellarStrength: optNumericValue(dialog.ncPostCCNSStrength, 3.0),
               nonStellarAmount: optNumericValue(dialog.ncPostCCNSAmount, 0.50),
               removeAberrationFirst: optChecked(dialog.chkPostCCRemoveAb, false),
               useGPU: true
            });
         }
         return targetView;
      });
   }
   if (actionKey === "post_color")
      return optRunPostOperationWithOptionalMask(view, dialog, optChecked(dialog.chkPostColorUseMask, false), function(targetView) { return optApplyPostColorBalance(targetView, dialog); });
   if (actionKey === "post_curves")
      return optRunPostOperationWithOptionalMask(view, dialog, optChecked(dialog.chkPostCurvesUseMask, false), function(targetView) { return optApplyPostCurves(targetView, dialog); });
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

function optComposeCcSlots(dialog, opts) {
   if (!dialog || !dialog.ccSlots)
      throw new Error("Channel Combination slots are not available.");
   var live = opts && opts.live === true;
   var liveMaxDim = (opts && opts.liveMaxDim) ? opts.liveMaxDim : OPT_CC_LIVE_MAX_DIM;
   var highest = -1;
   for (var i = dialog.ccSlots.length - 1; i >= 0; --i) {
      if (dialog.ccSlots[i].chkActive && dialog.ccSlots[i].chkActive.checked !== true)
         continue;
      var key = optCcSlotSourceKey(dialog.ccSlots[i]);
      if (key && optSafeView(dialog.store.record(key).view)) {
         highest = i;
         break;
      }
   }
   if (highest < 0)
      throw new Error("Load at least one Channel Combination image slot.");
   var basePrepared = optGetCachedCcSlot(dialog, dialog.ccSlots[highest], live, liveMaxDim);
   if (!optSafeView(basePrepared))
      throw new Error("Failed to prepare the Channel Combination base slot.");
   // Result is a fresh clone of the cached base; PM mutates it in place.
   var result = optCloneView(basePrepared, "Opt_CC_Compose_" + (live ? "Live" : "Full"), false);
   if (!optSafeView(result))
      throw new Error("Failed to prepare the Channel Combination compose target.");
   try {
      for (var s = highest - 1; s >= 0; --s) {
         var slot = dialog.ccSlots[s];
         if (slot.chkActive && slot.chkActive.checked !== true)
            continue;
         var overlay = optGetCachedCcSlot(dialog, slot, live, liveMaxDim);
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
            var mode = optComboText(slot.comboBlend, "Screen");
            var expr = optCcBlendExpression(mode, "$T", overlayId);
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

function optBuildPostNoiseSection(dlg) {
   dlg.postTab.addProcessSection("Noise Reduction", [{
      text: "Apply Noise Reduction",
      stage: "Noise Reduction",
      actionKey: "post_nr",
      name: "btnPostNR",
      width: 180,
      transform: function(candidate, dialog) { return optApplyPostCandidate(candidate, "post_nr", dialog); }
   }], {
      build: function(body) {
         var row = optComboRow(body, "Algorithm:", ["NoiseXTerminator", "TGVDenoise", "Cosmic Clarity (Seti Astro)", "GraXpert Denoise"], 118);
         dlg.comboPostNR = row.combo;
         body.sizer.add(row.row);
         dlg.postNXTGroup = optInnerGroup(body, "NoiseXTerminator Settings");
         dlg.ncPostNxtDenoise = optNumeric(dlg.postNXTGroup, "Denoise:", 0.0, 1.0, 0.85, 2, 150);
         dlg.ncPostNxtIter = optNumeric(dlg.postNXTGroup, "Iterations:", 1, 5, 2, 0, 150);
         dlg.chkPostNxtColorSep = new CheckBox(dlg.postNXTGroup); dlg.chkPostNxtColorSep.text = "Enable color separation"; optApplyCheckBoxTooltip(dlg.chkPostNxtColorSep);
         dlg.chkPostNxtFreqSep = new CheckBox(dlg.postNXTGroup); dlg.chkPostNxtFreqSep.text = "Enable frequency separation"; optApplyCheckBoxTooltip(dlg.chkPostNxtFreqSep);
         dlg.ncPostNxtDenoiseColor = optNumeric(dlg.postNXTGroup, "Denoise color:", 0.0, 1.0, 0.95, 2, 150);
         dlg.ncPostNxtFreqScale = optNumeric(dlg.postNXTGroup, "HF/LF scale:", 1.0, 15.0, 5.0, 1, 150);
         dlg.ncPostNxtDenoiseLF = optNumeric(dlg.postNXTGroup, "Denoise LF:", 0.0, 1.0, 0.60, 2, 150);
         dlg.ncPostNxtDenoiseLFColor = optNumeric(dlg.postNXTGroup, "Denoise LF color:", 0.0, 1.0, 1.00, 2, 150);
         dlg.postNXTGroup.sizer.add(dlg.ncPostNxtDenoise); dlg.postNXTGroup.sizer.add(dlg.ncPostNxtIter);
         dlg.postNXTGroup.sizer.add(dlg.chkPostNxtColorSep); dlg.postNXTGroup.sizer.add(dlg.chkPostNxtFreqSep);
         dlg.postNXTGroup.sizer.add(dlg.ncPostNxtDenoiseColor); dlg.postNXTGroup.sizer.add(dlg.ncPostNxtFreqScale);
         dlg.postNXTGroup.sizer.add(dlg.ncPostNxtDenoiseLF); dlg.postNXTGroup.sizer.add(dlg.ncPostNxtDenoiseLFColor);
         body.sizer.add(dlg.postNXTGroup);
         dlg.postTGVGroup = optInnerGroup(body, "TGVDenoise Settings");
         dlg.ncPostTgvStrengthL = optNumeric(dlg.postTGVGroup, "Luminance strength:", 1.0, 20.0, 5.0, 1, 150);
         dlg.ncPostTgvStrengthC = optNumeric(dlg.postTGVGroup, "Chrominance strength:", 0.0, 20.0, 3.0, 1, 150);
         dlg.ncPostTgvEdge = optNumeric(dlg.postTGVGroup, "Edge protection:", 0.0, 0.1, 0.002, 4, 150);
         dlg.ncPostTgvSmooth = optNumeric(dlg.postTGVGroup, "Smoothness:", 1.0, 10.0, 2.0, 1, 150);
         dlg.ncPostTgvIter = optNumeric(dlg.postTGVGroup, "Iterations:", 100, 3000, 500, 0, 150);
         dlg.postTGVGroup.sizer.add(dlg.ncPostTgvStrengthL); dlg.postTGVGroup.sizer.add(dlg.ncPostTgvStrengthC);
         dlg.postTGVGroup.sizer.add(dlg.ncPostTgvEdge); dlg.postTGVGroup.sizer.add(dlg.ncPostTgvSmooth); dlg.postTGVGroup.sizer.add(dlg.ncPostTgvIter);
         body.sizer.add(dlg.postTGVGroup);
         dlg.postCCNRGroup = optInnerGroup(body, "Cosmic Clarity Denoise Settings");
         dlg.comboPostCCDenoiseMode = optComboRow(dlg.postCCNRGroup, "Denoise Mode:", ["Full Image", "Luminance Only"], 150);
         dlg.comboPostCCDenoiseModel = optComboRow(dlg.postCCNRGroup, "Denoise Model:", ["Walking Noise", "Standard"], 150);
         dlg.ncPostCCNRLuma = optNumeric(dlg.postCCNRGroup, "Denoise Luma:", 0.0, 1.0, 0.50, 2, 150);
         dlg.ncPostCCNRColor = optNumeric(dlg.postCCNRGroup, "Denoise Color:", 0.0, 1.0, 0.50, 2, 150);
         dlg.chkPostCCNRRemoveAb = new CheckBox(dlg.postCCNRGroup); dlg.chkPostCCNRRemoveAb.text = "Remove Aberration First"; optApplyCheckBoxTooltip(dlg.chkPostCCNRRemoveAb);
         dlg.postCCNRGroup.sizer.add(dlg.comboPostCCDenoiseMode.row);
         dlg.postCCNRGroup.sizer.add(dlg.comboPostCCDenoiseModel.row);
         dlg.postCCNRGroup.sizer.add(dlg.ncPostCCNRLuma);
         dlg.postCCNRGroup.sizer.add(dlg.ncPostCCNRColor);
         dlg.postCCNRGroup.sizer.add(dlg.chkPostCCNRRemoveAb);
         body.sizer.add(dlg.postCCNRGroup);

         dlg.postGraXpertNRGroup = optInnerGroup(body, "GraXpert Denoise Settings");
         dlg.ncPostGraXpertStrength = optNumeric(dlg.postGraXpertNRGroup, "Strength:", 0.0, 2.0, 1.00, 2, 150);
         dlg.ncPostGraXpertBatchSize = optNumeric(dlg.postGraXpertNRGroup, "Batch size:", 1, 16, 4, 0, 150);
         dlg.postGraXpertNRGroup.sizer.add(dlg.ncPostGraXpertStrength);
         dlg.postGraXpertNRGroup.sizer.add(dlg.ncPostGraXpertBatchSize);
         body.sizer.add(dlg.postGraXpertNRGroup);

         dlg.chkPostNRUseMask = new CheckBox(body); dlg.chkPostNRUseMask.text = "Use active mask"; optApplyCheckBoxTooltip(dlg.chkPostNRUseMask); body.sizer.add(dlg.chkPostNRUseMask);
         dlg.syncPostNRPanels = function(idx) { dlg.postNXTGroup.visible = idx === 0; dlg.postTGVGroup.visible = idx === 1; dlg.postCCNRGroup.visible = idx === 2; dlg.postGraXpertNRGroup.visible = idx === 3; };
         dlg.comboPostNR.onItemSelected = function(idx) { dlg.syncPostNRPanels(idx); };
         dlg.syncPostNRPanels(0);
      }
   });

}

function optBuildPostSharpeningSection(dlg) {
   dlg.postTab.addProcessSection("Sharpening", [{
      text: "Apply Sharpening",
      stage: "Sharpening",
      actionKey: "post_sharp",
      name: "btnPostSharp",
      width: 160,
      transform: function(candidate, dialog) { return optApplyPostCandidate(candidate, "post_sharp", dialog); }
   }], {
      build: function(body) {
         var row = optComboRow(body, "Algorithm:", ["BlurXTerminator", "Unsharp Mask", "HDR Multiscale Transform", "Local Histogram Equalization", "Dark Structure Enhance", "Cosmic Clarity"], 118);
         dlg.comboPostSharp = row.combo;
         body.sizer.add(row.row);
         dlg.postBXTGroup = optInnerGroup(body, "BlurXTerminator Settings");
         dlg.ncPostBxtStars = optNumeric(dlg.postBXTGroup, "Sharpen Stars:", 0.0, 1.0, 0.13, 2, 160);
         dlg.ncPostBxtAdjustStarHalos = optNumeric(dlg.postBXTGroup, "Adjust Star Halos:", -1.0, 1.0, 0.00, 2, 160);
         dlg.chkPostBxtAutoPSF = new CheckBox(dlg.postBXTGroup); dlg.chkPostBxtAutoPSF.text = "Automatic PSF"; optApplyCheckBoxTooltip(dlg.chkPostBxtAutoPSF); dlg.chkPostBxtAutoPSF.checked = true;
         dlg.ncPostBxtPSFDiameter = optNumeric(dlg.postBXTGroup, "PSF Diameter (p):", 0.0, 12.0, 4.0, 2, 160);
         dlg.ncPostBxtSharpenNonstellar = optNumeric(dlg.postBXTGroup, "Sharpen Nonstellar:", 0.0, 1.0, 0.34, 2, 160);
         dlg.chkPostBxtCorrectOnly = new CheckBox(dlg.postBXTGroup); dlg.chkPostBxtCorrectOnly.text = "Cor. Only"; optApplyCheckBoxTooltip(dlg.chkPostBxtCorrectOnly);
         dlg.chkPostBxtLuminanceOnly = new CheckBox(dlg.postBXTGroup); dlg.chkPostBxtLuminanceOnly.text = "Lum. Only"; optApplyCheckBoxTooltip(dlg.chkPostBxtLuminanceOnly); dlg.chkPostBxtLuminanceOnly.checked = true;
         dlg.postBXTGroup.sizer.add(dlg.ncPostBxtStars); dlg.postBXTGroup.sizer.add(dlg.ncPostBxtAdjustStarHalos);
         dlg.postBXTGroup.sizer.add(dlg.chkPostBxtAutoPSF); dlg.postBXTGroup.sizer.add(dlg.ncPostBxtPSFDiameter);
         dlg.postBXTGroup.sizer.add(dlg.ncPostBxtSharpenNonstellar); dlg.postBXTGroup.sizer.add(dlg.chkPostBxtCorrectOnly); dlg.postBXTGroup.sizer.add(dlg.chkPostBxtLuminanceOnly);
         body.sizer.add(dlg.postBXTGroup);
         dlg.postUSMGroup = optInnerGroup(body, "Unsharp Mask Settings");
         dlg.ncPostUsmSigma = optNumeric(dlg.postUSMGroup, "StdDev:", 0.1, 250.0, 2.0, 2, 160);
         dlg.ncPostUsmAmount = optNumeric(dlg.postUSMGroup, "Amount:", 0.01, 1.0, 0.50, 2, 160);
         dlg.chkPostUsmDeringing = new CheckBox(dlg.postUSMGroup); dlg.chkPostUsmDeringing.text = "Deringing"; optApplyCheckBoxTooltip(dlg.chkPostUsmDeringing);
         dlg.ncPostUsmDeringDark = optNumeric(dlg.postUSMGroup, "Dark deringing:", 0.0, 1.0, 0.10, 3, 160);
         dlg.ncPostUsmDeringBright = optNumeric(dlg.postUSMGroup, "Bright deringing:", 0.0, 1.0, 0.00, 3, 160);
         dlg.postUSMGroup.sizer.add(dlg.ncPostUsmSigma); dlg.postUSMGroup.sizer.add(dlg.ncPostUsmAmount);
         dlg.postUSMGroup.sizer.add(dlg.chkPostUsmDeringing); dlg.postUSMGroup.sizer.add(dlg.ncPostUsmDeringDark); dlg.postUSMGroup.sizer.add(dlg.ncPostUsmDeringBright);
         body.sizer.add(dlg.postUSMGroup);
         dlg.postHDRGroup = optInnerGroup(body, "HDR Multiscale Transform");
         dlg.ncPostHdrLayers = optNumeric(dlg.postHDRGroup, "Layers:", 1, 12, 6, 0, 160);
         dlg.ncPostHdrIter = optNumeric(dlg.postHDRGroup, "Iterations:", 1, 10, 1, 0, 160);
         dlg.ncPostHdrOverdrive = optNumeric(dlg.postHDRGroup, "Overdrive:", 0.0, 1.0, 0.0, 2, 160);
         dlg.chkPostHdrMedian = new CheckBox(dlg.postHDRGroup); dlg.chkPostHdrMedian.text = "Median transform"; optApplyCheckBoxTooltip(dlg.chkPostHdrMedian);
         dlg.chkPostHdrLightProt = new CheckBox(dlg.postHDRGroup); dlg.chkPostHdrLightProt.text = "Lightness mask"; optApplyCheckBoxTooltip(dlg.chkPostHdrLightProt); dlg.chkPostHdrLightProt.checked = true;
         dlg.postHDRGroup.sizer.add(dlg.ncPostHdrLayers); dlg.postHDRGroup.sizer.add(dlg.ncPostHdrIter); dlg.postHDRGroup.sizer.add(dlg.ncPostHdrOverdrive); dlg.postHDRGroup.sizer.add(dlg.chkPostHdrMedian); dlg.postHDRGroup.sizer.add(dlg.chkPostHdrLightProt);
         body.sizer.add(dlg.postHDRGroup);
         dlg.postLHEGroup = optInnerGroup(body, "Local Histogram Equalization");
         dlg.ncPostLheRadius = optNumeric(dlg.postLHEGroup, "Kernel radius:", 8, 1024, 64, 0, 160);
         dlg.ncPostLheSlope = optNumeric(dlg.postLHEGroup, "Contrast limit:", 1.0, 100.0, 2.0, 1, 160);
         dlg.ncPostLheAmount = optNumeric(dlg.postLHEGroup, "Amount:", 0.0, 1.0, 0.70, 2, 160);
         dlg.chkPostLheCircular = new CheckBox(dlg.postLHEGroup); dlg.chkPostLheCircular.text = "Circular kernel"; optApplyCheckBoxTooltip(dlg.chkPostLheCircular); dlg.chkPostLheCircular.checked = true;
         dlg.postLHEGroup.sizer.add(dlg.ncPostLheRadius); dlg.postLHEGroup.sizer.add(dlg.ncPostLheSlope); dlg.postLHEGroup.sizer.add(dlg.ncPostLheAmount); dlg.postLHEGroup.sizer.add(dlg.chkPostLheCircular);
         body.sizer.add(dlg.postLHEGroup);
         dlg.postDSEGroup = optInnerGroup(body, "Dark Structure Enhance");
         dlg.ncPostDseAmount = optNumeric(dlg.postDSEGroup, "Amount:", 0.0, 1.0, 0.18, 2, 160);
         dlg.postDSEGroup.sizer.add(dlg.ncPostDseAmount);
         body.sizer.add(dlg.postDSEGroup);
         dlg.postCCSharpGroup = optInnerGroup(body, "Cosmic Clarity Settings");
         dlg.comboPostCCSharpenMode = optComboRow(dlg.postCCSharpGroup, "Mode:", ["Both", "Stellar Only", "Non-Stellar Only"], 160);
         dlg.comboPostCCSharpenModeCombo = dlg.comboPostCCSharpenMode.combo;
         dlg.ncPostCCStellarAmt = optNumeric(dlg.postCCSharpGroup, "Stellar Amount:", 0.0, 1.0, 0.90, 2, 160);
         dlg.ncPostCCNSStrength = optNumeric(dlg.postCCSharpGroup, "Non-Stellar Size:", 1.0, 8.0, 3.0, 1, 160);
         dlg.ncPostCCNSAmount = optNumeric(dlg.postCCSharpGroup, "Non-Stellar Amt:", 0.0, 1.0, 0.50, 2, 160);
         dlg.chkPostCCRemoveAb = new CheckBox(dlg.postCCSharpGroup); dlg.chkPostCCRemoveAb.text = "Remove Aberration First"; optApplyCheckBoxTooltip(dlg.chkPostCCRemoveAb);
         dlg.postCCSharpGroup.sizer.add(dlg.comboPostCCSharpenMode.row); dlg.postCCSharpGroup.sizer.add(dlg.ncPostCCStellarAmt); dlg.postCCSharpGroup.sizer.add(dlg.ncPostCCNSStrength); dlg.postCCSharpGroup.sizer.add(dlg.ncPostCCNSAmount); dlg.postCCSharpGroup.sizer.add(dlg.chkPostCCRemoveAb);
         body.sizer.add(dlg.postCCSharpGroup);
         dlg.chkPostSharpUseMask = new CheckBox(body); dlg.chkPostSharpUseMask.text = "Use active mask"; optApplyCheckBoxTooltip(dlg.chkPostSharpUseMask); body.sizer.add(dlg.chkPostSharpUseMask);
         dlg.syncPostSharpPanels = function(idx) {
            dlg.postBXTGroup.visible = idx === 0; dlg.postUSMGroup.visible = idx === 1; dlg.postHDRGroup.visible = idx === 2;
            dlg.postLHEGroup.visible = idx === 3; dlg.postDSEGroup.visible = idx === 4; dlg.postCCSharpGroup.visible = idx === 5;
         };
         dlg.comboPostSharp.onItemSelected = function(idx) { dlg.syncPostSharpPanels(idx); };
         dlg.syncPostSharpPanels(0);
      }
   });

}

function optBuildPostColorBalanceSection(dlg) {
   dlg.__sectionPostColorBalance = dlg.postTab.addProcessSection("Color Balance", [{
      text: "Apply Color Balance",
      stage: "Color Balance",
      actionKey: "post_color",
      width: 170,
      transform: function(candidate, dialog) { return optApplyPostCandidate(candidate, "post_color", dialog); }
   }], {
      build: function(body) {
         dlg.postBalanceMeanHueDeg = 0.0;
         dlg.postBalanceMeanSat = 0.0;
         dlg.postBalancePointHueDeg = 0.0;
         dlg.postBalancePointIntensity = 0.0;
         dlg.postBalanceWheelDragging = false;
         dlg.updatePostColorBalanceStats = function(force) {
            var view = dlg.postTab.preview.candidateView || dlg.postTab.preview.currentView;
            if (!optSafeView(view) || view.image.numberOfChannels < 3)
               return;
            if (force === true || !dlg.__postBalanceStatsReady) {
               var stats = optComputeViewMeanHueSat(view, 4096);
               dlg.postBalanceMeanHueDeg = stats.hueDeg;
               dlg.postBalanceMeanSat = stats.sat;
               dlg.postBalancePointHueDeg = stats.hueDeg;
               dlg.postBalancePointIntensity = Math.max(0.65, stats.sat);
               dlg.__postBalanceStatsReady = true;
            }
         };
         dlg.updatePostColorBalanceReadout = function() {
            if (!dlg.lblPostColorBalanceReadout)
               return;
            var delta = optShortestHueDeltaDegrees(dlg.postBalanceMeanHueDeg, dlg.postBalancePointHueDeg);
            dlg.lblPostColorBalanceReadout.text =
               "<b>Mean:</b> " + dlg.postBalanceMeanHueDeg.toFixed(1) + " deg / " + dlg.postBalanceMeanSat.toFixed(2) +
               " | <b>Target:</b> " + dlg.postBalancePointHueDeg.toFixed(1) + " deg / " + dlg.postBalancePointIntensity.toFixed(2) +
               " | <b>Shift:</b> " + (delta * dlg.postBalancePointIntensity).toFixed(1) + " deg";
         };
         dlg.pickPostColorBalanceWheel = function(x, y) {
            var w = dlg.postColorBalanceWheel.width;
            var h = dlg.postColorBalanceWheel.height;
            var sz = Math.min(w, h);
            var cx = w * 0.5;
            var cy = h * 0.5;
            var outer = sz * 0.5 - 2.0;
            var dx = x - cx;
            var dy = y - cy;
            var dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > outer) {
               var k = outer / Math.max(1.0e-6, dist);
               dx *= k; dy *= k; dist = outer;
            }
            dlg.postBalancePointIntensity = optClamp01(dist / Math.max(1.0e-6, outer));
            var a = Math.atan2(dy, dx) * 180.0 / Math.PI;
            dlg.postBalancePointHueDeg = ((a % 360.0) + 360.0) % 360.0;
            dlg.updatePostColorBalanceReadout();
            dlg.postColorBalanceWheel.repaint();
         };
         dlg.schedulePostColorBalanceLive = function(delayMs) {
            if (!(dlg.chkPostColorBalanceLive && dlg.chkPostColorBalanceLive.checked))
               return;
            optSchedulePostLiveCandidate(dlg, "post.colorBalance", "Color Balance", "post_color", delayMs || 160);
         };
         dlg.lblPostColorBalanceReadout = optInfoLabel(body, "<b>Mean:</b> --");
         body.sizer.add(dlg.lblPostColorBalanceReadout);
         dlg.postColorBalanceWheel = new Control(body);
         dlg.postColorBalanceWheel.setScaledFixedSize(170, 170);
         dlg.postColorBalanceWheel.cursor = new Cursor(StdCursor_Cross);
         dlg.postColorBalanceWheel.onPaint = function() {
            var g = new Graphics(this);
            try {
               var sz = Math.min(this.width, this.height);
               var cx = this.width * 0.5;
               var cy = this.height * 0.5;
               if (!dlg.postBalanceWheelBmp || dlg.postBalanceWheelBmp.width !== sz)
                  dlg.postBalanceWheelBmp = optGenerateHueWheelBitmap(sz, 0.0);
               g.drawBitmap(0, 0, dlg.postBalanceWheelBmp);
               var outer = sz * 0.5 - 2.0;
               var meanRad = dlg.postBalanceMeanHueDeg * Math.PI / 180.0;
               g.pen = new Pen(0xffffffff, 2);
               g.drawLine(cx, cy, cx + Math.cos(meanRad) * outer * 0.65, cy + Math.sin(meanRad) * outer * 0.65);
               var ptRad = dlg.postBalancePointHueDeg * Math.PI / 180.0;
               var pr = outer * optClamp01(dlg.postBalancePointIntensity);
               var px = cx + Math.cos(ptRad) * pr;
               var py = cy + Math.sin(ptRad) * pr;
               g.pen = new Pen(0xffffff00, 2);
               g.brush = new Brush(0xffffff00);
               g.drawEllipse(px - 6, py - 6, px + 6, py + 6);
            } finally {
               try { g.end(); } catch (e0) {}
            }
         };
         dlg.postColorBalanceWheel.onMousePress = function(x, y, button) {
            if (button !== OPT_MOUSE_LEFT) return;
            dlg.updatePostColorBalanceStats(false);
            dlg.postBalanceWheelDragging = true;
            dlg.pickPostColorBalanceWheel(x, y);
         };
         dlg.postColorBalanceWheel.onMouseMove = function(x, y, buttons) {
            if (!dlg.postBalanceWheelDragging) return;
            dlg.pickPostColorBalanceWheel(x, y);
         };
         dlg.postColorBalanceWheel.onMouseRelease = function(x, y, button) {
            if (button !== OPT_MOUSE_LEFT) return;
            dlg.postBalanceWheelDragging = false;
            dlg.pickPostColorBalanceWheel(x, y);
            dlg.schedulePostColorBalanceLive(160);
         };
         var wheelRow = new Control(body);
         wheelRow.sizer = new HorizontalSizer();
         wheelRow.sizer.addStretch();
         wheelRow.sizer.add(dlg.postColorBalanceWheel);
         wheelRow.sizer.addStretch();
         body.sizer.add(wheelRow);
         dlg.ncPostColorBalanceSaturation = optNumeric(body, "Hue saturation:", 0.0, 4.0, 1.00, 2, 150);
         dlg.chkPostColorBalanceLive = new CheckBox(body); dlg.chkPostColorBalanceLive.text = "Live"; optApplyCheckBoxTooltip(dlg.chkPostColorBalanceLive);
         dlg.chkPostColorBalanceLive.onCheck = function(checked) { if (checked) dlg.schedulePostColorBalanceLive(160); };
         dlg.ncPostColorBalanceSaturation.onValueUpdated = function() { dlg.schedulePostColorBalanceLive(180); };
         body.sizer.add(dlg.ncPostColorBalanceSaturation);
         body.sizer.add(dlg.chkPostColorBalanceLive);
         var btnReset = optButton(body, "Reset Hue Anchor", 140);
         btnReset.onClick = function() {
            dlg.__postBalanceStatsReady = false;
            dlg.updatePostColorBalanceStats(true);
            dlg.updatePostColorBalanceReadout();
            dlg.postColorBalanceWheel.repaint();
            dlg.schedulePostColorBalanceLive(160);
         };
         body.sizer.add(btnReset);
         dlg.ncPostBalanceR = optNumeric(body, "R multiplier:", 0.0, 2.0, 1.00, 3, 150);
         dlg.ncPostBalanceG = optNumeric(body, "G multiplier:", 0.0, 2.0, 1.00, 3, 150);
         dlg.ncPostBalanceB = optNumeric(body, "B multiplier:", 0.0, 2.0, 1.00, 3, 150);
         dlg.ncPostBalanceSat = optNumeric(body, "Saturation:", 0.0, 2.0, 1.00, 2, 150);
         dlg.chkPostBalanceSCNR = new CheckBox(body); dlg.chkPostBalanceSCNR.text = "SCNR green"; optApplyCheckBoxTooltip(dlg.chkPostBalanceSCNR);
         dlg.ncPostBalanceSCNR = optNumeric(body, "SCNR amount:", 0.0, 1.0, 0.60, 2, 150);
         dlg.chkPostColorUseMask = new CheckBox(body); dlg.chkPostColorUseMask.text = "Use active mask"; optApplyCheckBoxTooltip(dlg.chkPostColorUseMask);
         body.sizer.add(dlg.ncPostBalanceR); body.sizer.add(dlg.ncPostBalanceG); body.sizer.add(dlg.ncPostBalanceB);
         body.sizer.add(dlg.ncPostBalanceSat); body.sizer.add(dlg.chkPostBalanceSCNR); body.sizer.add(dlg.ncPostBalanceSCNR);
         body.sizer.add(dlg.chkPostColorUseMask);
      }
   });

}

function optBuildPostCurvesSection(dlg) {
   dlg.postTab.addProcessSection("Curves", [{
      text: "Apply Curves",
      stage: "Curves",
      actionKey: "post_curves",
      width: 130,
      transform: function(candidate, dialog) { return optApplyPostCandidate(candidate, "post_curves", dialog); }
   }], {
      build: function(body) {
         dlg.postCurvesPoints = { K: [[0,0],[1,1]], R: [[0,0],[1,1]], G: [[0,0],[1,1]], B: [[0,0],[1,1]], S: [[0,0],[1,1]] };
         dlg.postCurvesHistogram = null;
         dlg.computePostHistogram = function() {
            var view = dlg.postTab.preview.candidateView || dlg.postTab.preview.currentView;
            dlg.postCurvesHistogram = optSafeView(view) ? optGetCachedHistogram(view) : null;
         };
         dlg.syncPostParametricCurve = function(force) {
            var key = optPostCurvesChannelKey(dlg);
            if (force === true || !dlg.postCurvesManual)
               dlg.postCurvesPoints[key] = optPostCurvePoints(dlg);
            if (dlg.postCurvesWidget)
               dlg.postCurvesWidget.repaint();
         };
         dlg.schedulePostCurvesLive = function(delayMs) {
            if (!(dlg.chkPostCurvesLive && dlg.chkPostCurvesLive.checked))
               return;
            optSchedulePostLiveCandidate(dlg, "post.curves", "Curves", "post_curves", delayMs || 120);
         };
         dlg.updatePostCurvesWidgetVisibility = function() {
            var visible = !!(dlg.chkPostCurvesLive && dlg.chkPostCurvesLive.checked === true);
            if (dlg.postCurvesRightLabel)
               dlg.postCurvesRightLabel.visible = visible;
            if (dlg.postCurvesWidget)
               dlg.postCurvesWidget.visible = visible;
         };
         var row = optComboRow(body, "Channel:", ["RGB/K", "Red", "Green", "Blue", "Saturation"], 118);
         dlg.comboPostCurvesChan = row.combo;
         dlg.__postCurvesChannelRow = row.row;   // exposed for UI gating (policy: post.curves.color)
         dlg.comboPostCurvesChan.onItemSelected = function() {
            dlg.computePostHistogram();
            dlg.syncPostParametricCurve(false);
            dlg.schedulePostCurvesLive(140);
         };
         body.sizer.add(row.row);
         dlg.ncPostCurvesContrast = optNumeric(body, "Contrast:", 0.0, 1.0, 0.0, 2, 150);
         dlg.ncPostCurvesBright = optNumeric(body, "Brightness:", -0.5, 0.5, 0.0, 3, 150);
         dlg.ncPostCurvesShadows = optNumeric(body, "Shadows lift:", 0.0, 0.5, 0.0, 3, 150);
         dlg.ncPostCurvesHighlights = optNumeric(body, "Highlights compress:", 0.0, 0.5, 0.0, 3, 150);
         dlg.ncPostCurvesSaturation = optNumeric(body, "Saturation:", 0.0, 2.0, 1.0, 2, 150);
         dlg.chkPostCurvesLive = new CheckBox(body); dlg.chkPostCurvesLive.text = "Live"; optApplyCheckBoxTooltip(dlg.chkPostCurvesLive);
         dlg.chkPostCurvesUseMask = new CheckBox(body); dlg.chkPostCurvesUseMask.text = "Use active mask"; optApplyCheckBoxTooltip(dlg.chkPostCurvesUseMask);
         var curvesChanged = function() { dlg.postCurvesManual = false; dlg.syncPostParametricCurve(true); dlg.schedulePostCurvesLive(170); };
         dlg.ncPostCurvesContrast.onValueUpdated = curvesChanged;
         dlg.ncPostCurvesBright.onValueUpdated = curvesChanged;
         dlg.ncPostCurvesShadows.onValueUpdated = curvesChanged;
         dlg.ncPostCurvesHighlights.onValueUpdated = curvesChanged;
         dlg.ncPostCurvesSaturation.onValueUpdated = curvesChanged;
         dlg.chkPostCurvesLive.onCheck = function(checked) {
            // Update visibility first and flush the UI so the checkbox tick
            // and the widget show/hide become visible immediately. Without this,
            // the synchronous histogram compute below blocks the UI thread and
            // the click feels frozen for hundreds of ms on large images.
            dlg.updatePostCurvesWidgetVisibility();
            try { processEvents(); } catch (eFlush) {}
            if (!checked) {
               // Hiding: reset the curve state so the next time Live is enabled
               // the curve starts as a straight identity again. Reset all per
               // channel point sets, the numeric controls and the manual flag.
               dlg.postCurvesPoints = {
                  K: [[0, 0], [1, 1]],
                  R: [[0, 0], [1, 1]],
                  G: [[0, 0], [1, 1]],
                  B: [[0, 0], [1, 1]],
                  S: [[0, 0], [1, 1]]
               };
               dlg.postCurvesManual = false;
               try { dlg.ncPostCurvesContrast.setValue(0.0); } catch (eR0) {}
               try { dlg.ncPostCurvesBright.setValue(0.0); } catch (eR1) {}
               try { dlg.ncPostCurvesShadows.setValue(0.0); } catch (eR2) {}
               try { dlg.ncPostCurvesHighlights.setValue(0.0); } catch (eR3) {}
               try { dlg.ncPostCurvesSaturation.setValue(1.0); } catch (eR4) {}
               return;
            }
            dlg.computePostHistogram();
            if (dlg.postCurvesWidget) {
               dlg.postCurvesWidget.repaint();
               // Flush the paint event so the histogram is actually drawn now.
               // Without this, the widget's first paint (triggered by the show
               // above) can run with postCurvesHistogram still null and the
               // queued repaint never gets processed until another event (e.g.
               // dragging a curve point) arrives.
               try { processEvents(); } catch (eFlush2) {}
            }
            dlg.schedulePostCurvesLive(140);
         };
         body.sizer.add(dlg.ncPostCurvesContrast); body.sizer.add(dlg.ncPostCurvesBright); body.sizer.add(dlg.ncPostCurvesShadows);
         body.sizer.add(dlg.ncPostCurvesHighlights); body.sizer.add(dlg.ncPostCurvesSaturation); body.sizer.add(dlg.chkPostCurvesLive); body.sizer.add(dlg.chkPostCurvesUseMask);
         dlg.postCurvesWidget = new Control(dlg.postTab.preview.control);
         dlg.postCurvesWidget.setFixedHeight(190);
         dlg.postCurvesWidget.cursor = new Cursor(StdCursor_Cross);
         dlg.postCurvesWidget.__dragging = -1;
         dlg.postCurvesWidget.__hoverIdx = -1;
         dlg.postCurvesWidget.__pointRadius = 5;
         dlg.postCurvesWidget.xToCanvas = function(x) { var m = 10; return m + x * (this.width - 2 * m); };
         dlg.postCurvesWidget.yToCanvas = function(y) { var m = 10; return (this.height - m) - y * (this.height - 2 * m); };
         dlg.postCurvesWidget.canvasToX = function(x) { var m = 10; return (x - m) / Math.max(1, this.width - 2 * m); };
         dlg.postCurvesWidget.canvasToY = function(y) { var m = 10; return ((this.height - m) - y) / Math.max(1, this.height - 2 * m); };
         dlg.postCurvesWidget.findNearest = function(x, y) {
            var pts = dlg.postCurvesPoints[optPostCurvesChannelKey(dlg)] || [[0,0],[1,1]];
            var best = 15 * 15, idx = -1;
            for (var i = 0; i < pts.length; ++i) {
               var px = this.xToCanvas(pts[i][0]);
               var py = this.yToCanvas(pts[i][1]);
               var d = (x - px) * (x - px) + (y - py) * (y - py);
               if (d < best) { best = d; idx = i; }
            }
            return idx;
         };
         dlg.postCurvesWidget.onPaint = function() {
            var g = new Graphics(this);
            try {
               var w = this.width, h = this.height, m = 10, cw = w - 2 * m, ch = h - 2 * m;
               g.fillRect(0, 0, w, h, new Brush(0xff1a1a1a));
               g.pen = new Pen(0xff333333, 1);
               for (var gi = 0; gi <= 4; ++gi) {
                  g.drawLine(m + gi * cw / 4, m, m + gi * cw / 4, h - m);
                  g.drawLine(m, h - m - gi * ch / 4, w - m, h - m - gi * ch / 4);
               }
               g.pen = new Pen(0xff555555, 1);
               g.drawRect(m, m, w - m, h - m);
               var hist = dlg.postCurvesHistogram;
               var key = optPostCurvesChannelKey(dlg);
               if (hist) {
                  // Background histogram channels:
                  //  - RGB/K and Saturation: overlap luminance (K) + R + G + B
                  //    so the user sees the full per-channel reference.
                  //  - R / G / B: only the matching channel, to keep the
                  //    reference focused while editing that channel's curve.
                  var chans = (key === "K" || key === "S") ? ["K", "R", "G", "B"] : [key];
                  var colors = { R: 0x60ff4444, G: 0x6044ff44, B: 0x604488ff, S: 0x60ffaa00, K: 0x60dddddd };
                  var maxCount = 1;
                  for (var c = 0; c < chans.length; ++c) {
                     var data = hist[chans[c]] || hist.K;
                     for (var bi = 0; bi < data.length; ++bi)
                        if (data[bi] > maxCount) maxCount = data[bi];
                  }
                  for (var c2 = 0; c2 < chans.length; ++c2) {
                     var ck = chans[c2], d = hist[ck] || hist.K;
                     g.pen = new Pen(colors[ck] || 0x60dddddd, 1);
                     for (var bj = 1; bj < d.length - 1; ++bj) {
                        var bx = m + (bj / (d.length - 1)) * cw;
                        var bh = (d[bj] / maxCount) * ch * 0.85;
                        g.drawLine(bx, h - m, bx, h - m - bh);
                     }
                  }
               } else {
                  g.pen = new Pen(0xff707070, 1);
                  g.drawTextRect(new Rect(m, m, w - m, h - m), "Histogram", TextAlign_Center | TextAlign_VertCenter);
               }
               try { g.pen = new Pen(0xff404040, 1, PenStyle_Dash); } catch (eDash) { g.pen = new Pen(0xff404040, 1); }
               g.drawLine(m, h - m, w - m, m);
               var pts = dlg.postCurvesPoints[key] || [[0,0],[1,1]];
               var lut = optAkimaInterpolate(pts, 512);
               var curveColors = { K: 0xffffffff, R: 0xffff4444, G: 0xff44ff44, B: 0xff4488ff, S: 0xffffaa00 };
               g.antialiasing = true;
               g.pen = new Pen(curveColors[key] || 0xffffffff, 2);
               for (var si = 1; si < lut.length; ++si)
                  g.drawLine(m + ((si - 1) / (lut.length - 1)) * cw, h - m - lut[si - 1] * ch, m + (si / (lut.length - 1)) * cw, h - m - lut[si] * ch);
               for (var pi = 0; pi < pts.length; ++pi) {
                  var px = this.xToCanvas(pts[pi][0]), py = this.yToCanvas(pts[pi][1]), rr = this.__pointRadius;
                  g.pen = new Pen(0xffffffff, 1);
                  g.brush = new Brush(pi === this.__hoverIdx ? 0xffffcc00 : 0xffffffff);
                  g.fillRect(px - rr, py - rr, px + rr, py + rr, g.brush);
                  g.drawRect(px - rr, py - rr, px + rr, py + rr);
               }
            } finally {
               try { g.end(); } catch (e0) {}
            }
         };
         dlg.postCurvesWidget.onMousePress = function(x, y, button) {
            var key = optPostCurvesChannelKey(dlg);
            var pts = dlg.postCurvesPoints[key] || [[0,0],[1,1]];
            if (button === OPT_MOUSE_LEFT) {
               var idx = this.findNearest(x, y);
               if (idx < 0) {
                  var nx = optClamp01(this.canvasToX(x)), ny = optClamp01(this.canvasToY(y));
                  pts.push([nx, ny]);
                  pts.sort(function(a, b) { return a[0] - b[0]; });
                  dlg.postCurvesPoints[key] = pts;
                  idx = this.findNearest(x, y);
               }
               this.__dragging = idx;
               dlg.postCurvesManual = true;
               this.repaint();
            } else if (button === OPT_MOUSE_RIGHT) {
               var ridx = this.findNearest(x, y);
               if (ridx > 0 && ridx < pts.length - 1) {
                  pts.splice(ridx, 1);
                  dlg.postCurvesManual = true;
                  this.repaint();
                  dlg.schedulePostCurvesLive(160);
               }
            }
         };
         dlg.postCurvesWidget.onMouseMove = function(x, y) {
            var key = optPostCurvesChannelKey(dlg);
            var pts = dlg.postCurvesPoints[key] || [[0,0],[1,1]];
            if (this.__dragging >= 0 && this.__dragging < pts.length) {
               var di = this.__dragging, ny = optClamp01(this.canvasToY(y));
               if (di === 0 || di === pts.length - 1)
                  pts[di][1] = ny;
               else {
                  pts[di][0] = Math.max(pts[di - 1][0] + 0.005, Math.min(pts[di + 1][0] - 0.005, optClamp01(this.canvasToX(x))));
                  pts[di][1] = ny;
               }
               this.repaint();
            } else {
               var old = this.__hoverIdx;
               this.__hoverIdx = this.findNearest(x, y);
               if (old !== this.__hoverIdx) this.repaint();
            }
         };
         dlg.postCurvesWidget.onMouseRelease = function() {
            if (this.__dragging >= 0) {
               this.__dragging = -1;
               dlg.schedulePostCurvesLive(160);
            }
         };
         var curvesLabel = optInfoLabel(dlg.postTab.preview.control, "Curves: left click adds/drags points, right click removes points.");
         dlg.postCurvesRightLabel = curvesLabel;
         dlg.postTab.preview.control.sizer.add(curvesLabel);
         dlg.postTab.preview.control.sizer.add(dlg.postCurvesWidget);
         dlg.updatePostCurvesWidgetVisibility();
      }
   });

}

function optBuildPostMaskingSection(dlg) {
   dlg.postTab.addProcessSection("Masking", [], {
      build: function(body) {

         var maskPolarityLabel = optInfoLabel(body, "The mask are the white areas.");
         body.sizer.add(maskPolarityLabel);

         // FAME state (reset when tab is configured)
         dlg.postFameState = {
            shapes: [], currentShape: null, activeShapeIndex: -1,
            shapeType: "Freehand", isDrawing: false, isMoving: false, isTransforming: false,
            startX: 0, startY: 0, originalShape: null, transformCenter: null,
            initialAngle: 0, initialDistance: 1,
            gradientA: null, gradientB: null
         };

         // ---- live preview scheduler ----------------------------------------
         // Builds a downsampled mask (no gconv smoothing) and renders it to the
         // preview WITHOUT promoting it to postActiveMask — the live mask has
         // smaller dimensions than the source image and would not match the
         // target view of any downstream Post process. The user must click
         // "Generate Active Mask" to produce the full-resolution mask that will
         // be applied to NR / Sharpening / Curves.
         dlg.schedulePostMaskLive = function(delayMs) {
            var idx = dlg.comboPostMask.currentItem;
            if (idx === 2) {
               // FAME: just repaint overlay shapes — no mask generation
               dlg.postTab.preview.preview.viewport.repaint();
               return;
            }
            var live = (idx === 0 && dlg.chkPostRangeLive && dlg.chkPostRangeLive.checked) ||
                       (idx === 1 && dlg.chkPostMaskLive && dlg.chkPostMaskLive.checked);
            if (!live) return;
            dlg.previewScheduler.request("post.mask", function() {
               var view = dlg.postTab.preview.candidateView || dlg.postTab.preview.currentView;
               if (!optSafeView(view)) return;
               try { if (optSafeView(dlg._postLiveMask)) optCloseView(dlg._postLiveMask); } catch (eL) {}
               dlg._postLiveMask = null;
               var maskPreviewView = (idx === 1)
                  ? optBuildPostColorMaskView(view, dlg)
                  : optBuildPostRangeMaskView(view, dlg);
               dlg._postLiveMask = maskPreviewView;
               var rendered = optRenderMaskViewPreviewBitmap(maskPreviewView, dlg);
               dlg._postLiveMaskBitmap = rendered ? rendered.bitmap : null;
               dlg.postActiveMaskShown = false;
               dlg.postTab.preview.renderBitmap(
                  dlg._postLiveMaskBitmap,
                  "<b>Live:</b> " + (maskPreviewView ? maskPreviewView.id : "mask preview"),
                  false,
                  rendered ? rendered.sourceWidth : view.image.width,
                  rendered ? rendered.sourceHeight : view.image.height
               );
               if (dlg.lblPostMaskStatus)
                  dlg.lblPostMaskStatus.text = "Mask (preview): " + (maskPreviewView ? maskPreviewView.id : "live") + " - click Generate Active Mask";
            }, {
               debounceMs: delayMs || 140,
               statusLabel: dlg.postTab.preview.status,
               busyText: "<b>Live:</b> rendering mask preview...",
               doneText: "<b>Live:</b> mask preview ready.",
               errorText: "<b>Live:</b> mask preview failed.",
               busyPreviewControl: dlg.postTab.preview.preview,
               busyOverlayText: "Rendering mask",
               onError: function(k, e) {
                  console.warningln("Mask live preview: " + e.message);
                  if (e && String(e.message || "").toLowerCase().indexOf("out of memory") >= 0) {
                     try { if (dlg.postMaskLiveCache) dlg.postMaskLiveCache.release(); } catch (eC) {}
                     try {
                        if (dlg.comboPostMask.currentItem === 0 && dlg.chkPostRangeLive)
                           dlg.chkPostRangeLive.checked = false;
                        if (dlg.comboPostMask.currentItem === 1 && dlg.chkPostMaskLive)
                           dlg.chkPostMaskLive.checked = false;
                     } catch (eChk) {}
                     var src = dlg.postTab.preview.candidateView || dlg.postTab.preview.currentView;
                     if (optSafeView(src))
                        dlg.postTab.preview.render(src, false);
                     dlg.postActiveMaskShown = false;
                     if (dlg.lblPostMaskStatus)
                        dlg.lblPostMaskStatus.text = "Mask live preview disabled after out of memory. Re-enable Live to try again.";
                  }
               }
            });
         };

         // ---- FAME state label update ----------------------------------------
         dlg.updatePostFameStateLabel = function() {
            if (!dlg.lblPostFameState) return;
            var st = dlg.postFameState;
            var active = (st.activeShapeIndex >= 0 && st.activeShapeIndex < st.shapes.length)
               ? (st.activeShapeIndex + 1) + "/" + st.shapes.length : "none";
            dlg.lblPostFameState.text =
               "<b>Shapes:</b> " + (st.shapes ? st.shapes.length : 0) +
               "  <b>Active:</b> " + active +
               "  <b>Gradient A:</b> " + (st.gradientA ? "set" : "-") +
               "  <b>B:</b> " + (st.gradientB ? "set" : "-");
         };

         // ---- algorithm combo -----------------------------------------------
         var algoRow = optComboRow(body, "Algorithm:", ["Range Selection", "Color Mask", "FAME (Seti Astro)"], 118);
         dlg.comboPostMask = algoRow.combo;
         body.sizer.add(algoRow.row);

         // ---- Range Selection group -----------------------------------------
         dlg.postRangeGroup = optInnerGroup(body, "Range Selection");
         var rangeModeRow = optComboRow(dlg.postRangeGroup, "Mode:", ["Binary", "Luminance", "Brightness"], 120);
         dlg.comboPostRangeMode = rangeModeRow.combo;
         dlg.comboPostRangeMode.currentItem = 1;
         dlg.postRangeGroup.sizer.add(rangeModeRow.row);

         // Range strip (interactive gradient bar)
         dlg.postRangeStrip = new Control(dlg.postRangeGroup);
         dlg.postRangeStrip.setScaledFixedSize(220, 24);
         dlg.postRangeStrip.cursor = new Cursor(StdCursor_Cross);
         dlg.postRangeStripDragging = "";
         dlg.postRangeStrip.onPaint = function() {
            var g = new Graphics(this), w = this.width, h = this.height;
            try {
               var bmp = new Bitmap(w, h);
               for (var x = 0; x < w; ++x) {
                  var v = Math.round(255 * x / Math.max(1, w - 1));
                  var px = 0xFF000000 | (v << 16) | (v << 8) | v;
                  for (var y = 0; y < h; ++y) bmp.setPixel(x, y, px);
               }
               g.drawBitmap(0, 0, bmp);
               var low = dlg.ncPostRangeLow.value, high = dlg.ncPostRangeHigh.value;
               var lx = Math.round(low * (w - 1)), hx = Math.round(high * (w - 1));
               g.pen = new Pen(0xFFFFFFFF, 1); g.drawRect(new Rect(Math.min(lx,hx), 1, Math.max(lx,hx)+1, h-1));
               g.pen = new Pen(0xFFFFFF00, 2); g.drawLine(lx, 0, lx, h);
               g.pen = new Pen(0xFF00FFFF, 2); g.drawLine(hx, 0, hx, h);
            } finally { g.end(); }
         };
         dlg.postRangeStrip.onMousePress = function(x, y, button) {
            if (button !== OPT_MOUSE_LEFT) return;
            var lx = Math.round(dlg.ncPostRangeLow.value * (this.width - 1));
            var hx = Math.round(dlg.ncPostRangeHigh.value * (this.width - 1));
            dlg.postRangeStripDragging = (Math.abs(x - lx) <= Math.abs(x - hx)) ? "low" : "high";
            var v = Math.max(0, Math.min(1, x / Math.max(1, this.width - 1)));
            if (dlg.postRangeStripDragging === "low") dlg.ncPostRangeLow.setValue(Math.min(v, dlg.ncPostRangeHigh.value));
            else dlg.ncPostRangeHigh.setValue(Math.max(v, dlg.ncPostRangeLow.value));
            this.repaint();
         };
         dlg.postRangeStrip.onMouseMove = function(x, y) {
            if (!dlg.postRangeStripDragging) return;
            var v = Math.max(0, Math.min(1, x / Math.max(1, this.width - 1)));
            if (dlg.postRangeStripDragging === "low") dlg.ncPostRangeLow.setValue(Math.min(v, dlg.ncPostRangeHigh.value));
            else dlg.ncPostRangeHigh.setValue(Math.max(v, dlg.ncPostRangeLow.value));
            this.repaint();
         };
         dlg.postRangeStrip.onMouseRelease = function() {
            dlg.postRangeStripDragging = "";
            dlg.schedulePostMaskLive(160);
         };
         var stripRow = new HorizontalSizer(); stripRow.addStretch(); stripRow.add(dlg.postRangeStrip); stripRow.addStretch();
         dlg.postRangeGroup.sizer.add(stripRow);

         dlg.ncPostRangeLow    = optNumeric(dlg.postRangeGroup, "Low:",    0.0, 1.0, 0.15, 3, 120);
         dlg.ncPostRangeHigh   = optNumeric(dlg.postRangeGroup, "High:",   0.0, 1.0, 0.85, 3, 120);
         dlg.ncPostRangeFuzz   = optNumeric(dlg.postRangeGroup, "Fuzz:",   0.0, 0.5, 0.05, 3, 120);
         dlg.ncPostRangeSmooth = optNumeric(dlg.postRangeGroup, "Smooth:", 0.0, 10.0, 0.0, 2, 120);
         dlg.chkPostRangeInvert = new CheckBox(dlg.postRangeGroup); dlg.chkPostRangeInvert.text = "Invert"; optApplyCheckBoxTooltip(dlg.chkPostRangeInvert);
         dlg.chkPostRangeLive   = new CheckBox(dlg.postRangeGroup); dlg.chkPostRangeLive.text = "Live";
         // Use Range-Selection-specific Live tooltip, not the Channel Combination one
         try {
            var ttRangeLive = optTooltipTextByKey("post.range.live");
            if (ttRangeLive) dlg.chkPostRangeLive.toolTip = ttRangeLive;
         } catch (eRL) {}
         dlg.postRangeGroup.sizer.add(dlg.ncPostRangeLow); dlg.postRangeGroup.sizer.add(dlg.ncPostRangeHigh);
         dlg.postRangeGroup.sizer.add(dlg.ncPostRangeFuzz); dlg.postRangeGroup.sizer.add(dlg.ncPostRangeSmooth);
         dlg.postRangeGroup.sizer.add(dlg.chkPostRangeInvert); dlg.postRangeGroup.sizer.add(dlg.chkPostRangeLive);
         body.sizer.add(dlg.postRangeGroup);

         // ---- Color Mask group ---------------------------------------------
         dlg.postColorMaskGroup = optInnerGroup(body, "Color Mask");

         // Color presets
         var presetRow = optComboRow(dlg.postColorMaskGroup, "Preset:", ["(Custom)","Red","Orange","Yellow","Green","Cyan","Blue","Magenta"], 120);
         dlg.comboPostCMPreset = presetRow.combo;
         dlg.postCMPresets = [[0,30,0.20],[0,30,0.20],[20,20,0.25],[60,25,0.20],[120,40,0.15],[180,40,0.15],[240,35,0.15],[300,30,0.20]];
         dlg.comboPostCMPreset.onItemSelected = function(idx) {
            if (idx <= 0) return;
            var p = dlg.postCMPresets[idx];
            dlg.ncPostCMHue.setValue(p[0]); dlg.ncPostCMHueRange.setValue(p[1]); dlg.ncPostCMSatLow.setValue(p[2]);
            dlg.schedulePostMaskLive(140);
         };
         dlg.postColorMaskGroup.sizer.add(presetRow.row);

         // Hue wheel
         var hueWheelSz = 160;
         dlg.postHueWheel = new Control(dlg.postColorMaskGroup);
         dlg.postHueWheel.setScaledFixedSize(hueWheelSz, hueWheelSz);
         dlg.postHueWheel.cursor = new Cursor(StdCursor_Cross);
         dlg.postHueWheelDragging = false;
         dlg.postHueWheelDragMode = "";
         dlg._postHueWheelBmp = null;
         dlg.postHueWheel.onPaint = function() {
            var g = new Graphics(this);
            try {
               var sz = this.width;
               if (!dlg._postHueWheelBmp || dlg._postHueWheelBmp.width !== sz)
                  dlg._postHueWheelBmp = optBuildHueWheelBitmap(sz);
               g.drawBitmap(0, 0, dlg._postHueWheelBmp);
               // Draw center/range indicators
               var cx = sz / 2, cy = sz / 2, outerR = sz / 2 - 2;
               var hueRad = dlg.ncPostCMHue.value / 360.0 * 2 * Math.PI - Math.PI / 2;
               var hueRange = dlg.ncPostCMHueRange.value / 360.0 * 2 * Math.PI;
               g.pen = new Pen(0xFFFFFFFF, 2);
               g.drawLine(cx, cy, Math.round(cx + outerR * Math.cos(hueRad)), Math.round(cy + outerR * Math.sin(hueRad)));
               g.pen = new Pen(0xFFFFFFFF, 1);
               var r1 = hueRad - hueRange / 2, r2 = hueRad + hueRange / 2;
               g.drawLine(cx, cy, Math.round(cx + outerR * Math.cos(r1)), Math.round(cy + outerR * Math.sin(r1)));
               g.drawLine(cx, cy, Math.round(cx + outerR * Math.cos(r2)), Math.round(cy + outerR * Math.sin(r2)));
            } finally { g.end(); }
         };
         dlg.postHueWheel.onMousePress = function(x, y, button) {
            if (button !== OPT_MOUSE_LEFT) return;
            var cx = this.width / 2, cy = this.height / 2;
            var ang = Math.atan2(x - cx, -(y - cy));
            if (ang < 0) ang += 2 * Math.PI;
            var hueDeg = ang * 180 / Math.PI;
            dlg.postHueWheelDragMode = "center";
            dlg.ncPostCMHue.setValue(hueDeg);
            if (dlg.comboPostCMPreset) dlg.comboPostCMPreset.currentItem = 0;
            dlg.postHueWheelDragging = true;
            this.repaint();
         };
         dlg.postHueWheel.onMouseMove = function(x, y) {
            if (!dlg.postHueWheelDragging) return;
            var cx = this.width / 2, cy = this.height / 2;
            var ang = Math.atan2(x - cx, -(y - cy));
            if (ang < 0) ang += 2 * Math.PI;
            var hueDeg = ang * 180 / Math.PI;
            if (dlg.postHueWheelDragMode === "center") {
               dlg.ncPostCMHue.setValue(hueDeg);
            } else {
               var center = dlg.ncPostCMHue.value;
               var d = Math.abs(hueDeg - center);
               if (d > 180) d = 360 - d;
               dlg.ncPostCMHueRange.setValue(Math.max(1, Math.min(180, d)));
            }
            this.repaint();
         };
         dlg.postHueWheel.onMouseRelease = function(x, y, button) {
            if (button !== OPT_MOUSE_LEFT) return;
            dlg.postHueWheelDragging = false;
            dlg.schedulePostMaskLive(160);
         };
         var wheelRow = new HorizontalSizer(); wheelRow.addStretch(); wheelRow.add(dlg.postHueWheel); wheelRow.addStretch();
         dlg.postColorMaskGroup.sizer.add(wheelRow);

         dlg.ncPostCMHue      = optNumeric(dlg.postColorMaskGroup, "Hue deg:",   0.0, 360.0, 30.0, 1, 120);
         dlg.ncPostCMHueRange = optNumeric(dlg.postColorMaskGroup, "Hue range:", 1.0, 180.0, 40.0, 1, 120);
         dlg.ncPostCMSatLow   = optNumeric(dlg.postColorMaskGroup, "Sat min:",   0.0,   1.0,  0.10, 3, 120);
         dlg.ncPostCMSmooth   = optNumeric(dlg.postColorMaskGroup, "Smooth:",    0.0,  10.0,  0.0,  2, 120);
         dlg.chkPostCMInvert  = new CheckBox(dlg.postColorMaskGroup); dlg.chkPostCMInvert.text = "Invert";
         dlg.chkPostMaskLive  = new CheckBox(dlg.postColorMaskGroup); dlg.chkPostMaskLive.text = "Live";
         // Use Color-Mask-specific Live tooltip, not the Channel Combination one
         try {
            var ttCMLive = optTooltipTextByKey("post.colormask.live");
            if (ttCMLive) dlg.chkPostMaskLive.toolTip = ttCMLive;
         } catch (eCML) {}
         dlg.postColorMaskGroup.sizer.add(dlg.ncPostCMHue); dlg.postColorMaskGroup.sizer.add(dlg.ncPostCMHueRange);
         dlg.postColorMaskGroup.sizer.add(dlg.ncPostCMSatLow); dlg.postColorMaskGroup.sizer.add(dlg.ncPostCMSmooth);
         dlg.postColorMaskGroup.sizer.add(dlg.chkPostCMInvert); dlg.postColorMaskGroup.sizer.add(dlg.chkPostMaskLive);
         body.sizer.add(dlg.postColorMaskGroup);

         // ---- FAME group ---------------------------------------------------
         dlg.postFameGroup = optInnerGroup(body, "FAME - Manual Drawing");

         var fameInfoLbl = new Label(dlg.postFameGroup);
         fameInfoLbl.text = "Shift+drag: draw  |  Ctrl+drag: move active  |  Alt+drag: rotate/scale  |  Right-click: gradient A/B";
         fameInfoLbl.wordWrapping = true; fameInfoLbl.useRichText = false;
         dlg.postFameGroup.sizer.add(fameInfoLbl);

         var shapeRow = optComboRow(dlg.postFameGroup, "Shape:", ["Freehand","Brush","Spray Can","Ellipse","Rectangle"], 120);
         dlg.comboPostFameShape = shapeRow.combo;
         dlg.postFameGroup.sizer.add(shapeRow.row);

         var fameModeRow = optComboRow(dlg.postFameGroup, "Mask type:", ["Binary","Lightness","Chrominance","Color","Gradient"], 120);
         dlg.comboPostFameMaskMode = fameModeRow.combo;
         dlg.postFameGroup.sizer.add(fameModeRow.row);

         var fameColorRow = optComboRow(dlg.postFameGroup, "Color:", ["Red","Yellow","Green","Cyan","Blue","Magenta"], 120);
         dlg.comboPostFameColor = fameColorRow.combo;
         dlg.postFameGroup.sizer.add(fameColorRow.row);

         dlg.ncPostFameBrushRadius  = optNumeric(dlg.postFameGroup, "Brush radius:", 1, 200, 20, 0, 120);
         dlg.ncPostFameSprayDensity = optNumeric(dlg.postFameGroup, "Spray density:", 0.0, 1.0, 0.40, 2, 120);
         dlg.ncPostFameBlur         = optNumeric(dlg.postFameGroup, "Blur amount:",  0, 50, 5, 0, 120);
         dlg.postFameGroup.sizer.add(dlg.ncPostFameBrushRadius);
         dlg.postFameGroup.sizer.add(dlg.ncPostFameSprayDensity);
         dlg.postFameGroup.sizer.add(dlg.ncPostFameBlur);

         dlg.lblPostFameState = new Label(dlg.postFameGroup);
         dlg.lblPostFameState.useRichText = true;
         dlg.lblPostFameState.text = "<b>Shapes:</b> 0  <b>Active:</b> none  <b>Gradient A:</b> -  <b>B:</b> -";
         dlg.postFameGroup.sizer.add(dlg.lblPostFameState);

         var fameToolRow = new HorizontalSizer(); fameToolRow.spacing = 5;
         dlg.btnPostFameNext  = optButton(dlg.postFameGroup, "Next",  55);
         dlg.btnPostFameUndo  = optButton(dlg.postFameGroup, "Undo",  55);
         dlg.btnPostFameReset = optButton(dlg.postFameGroup, "Reset", 55);
         try {
            var ttRstFame = optTooltipTextByKey("reset.fame");
            if (ttRstFame) dlg.btnPostFameReset.toolTip = ttRstFame;
         } catch (eRstF) {}
         dlg.btnPostFameNext.onClick = function() {
            var st = dlg.postFameState;
            if (!st.shapes.length) return;
            st.activeShapeIndex = (st.activeShapeIndex + 1) % st.shapes.length;
            dlg.updatePostFameStateLabel();
            dlg.postTab.preview.preview.viewport.repaint();
         };
         dlg.btnPostFameUndo.onClick = function() {
            var st = dlg.postFameState;
            if (!st.shapes.length) return;
            var idx = st.activeShapeIndex < 0 ? st.shapes.length - 1 : st.activeShapeIndex;
            st.shapes.splice(idx, 1);
            st.activeShapeIndex = st.shapes.length ? idx % st.shapes.length : -1;
            dlg.updatePostFameStateLabel();
            dlg.postTab.preview.preview.viewport.repaint();
         };
         dlg.btnPostFameReset.onClick = function() {
            var st = dlg.postFameState;
            st.shapes = []; st.currentShape = null; st.activeShapeIndex = -1;
            st.gradientA = null; st.gradientB = null;
            dlg.updatePostFameStateLabel();
            dlg.postTab.preview.preview.viewport.repaint();
         };
         fameToolRow.add(dlg.btnPostFameNext); fameToolRow.add(dlg.btnPostFameUndo); fameToolRow.add(dlg.btnPostFameReset); fameToolRow.addStretch();
         dlg.postFameGroup.sizer.add(fameToolRow);
         body.sizer.add(dlg.postFameGroup);

         // ---- wire all change events ----------------------------------------
         // Suppress mask scheduling while user is dragging the strip handles or
         // the hue wheel — those widgets call setValue() many times per second
         // and would otherwise spam the scheduler. Each widget's onMouseRelease
         // re-schedules with a small delay once dragging stops.
         var maskChanged = function() {
            if (dlg.postRangeStripDragging || dlg.postHueWheelDragging) return;
            dlg.schedulePostMaskLive(160);
         };
         dlg.ncPostRangeLow.onValueUpdated    = function() { dlg.postRangeStrip.repaint(); maskChanged(); };
         dlg.ncPostRangeHigh.onValueUpdated   = function() { dlg.postRangeStrip.repaint(); maskChanged(); };
         dlg.ncPostRangeFuzz.onValueUpdated   = maskChanged;
         dlg.ncPostRangeSmooth.onValueUpdated = maskChanged;
         dlg.comboPostRangeMode.onItemSelected = function() { maskChanged(); };
         dlg.chkPostRangeInvert.onCheck        = maskChanged;
         dlg.chkPostRangeLive.onCheck          = function(checked) { if (checked) dlg.schedulePostMaskLive(120); };
         dlg.ncPostCMHue.onValueUpdated        = function() { dlg.postHueWheel.repaint(); maskChanged(); };
         dlg.ncPostCMHueRange.onValueUpdated   = function() { dlg.postHueWheel.repaint(); maskChanged(); };
         dlg.ncPostCMSatLow.onValueUpdated     = maskChanged;
         dlg.ncPostCMSmooth.onValueUpdated     = maskChanged;
         dlg.chkPostCMInvert.onCheck           = maskChanged;
         dlg.chkPostMaskLive.onCheck           = function(checked) { if (checked) dlg.schedulePostMaskLive(120); };
         dlg.comboPostFameMaskMode.onItemSelected = function(idx) {
            dlg.postFameGroup.sizer.visible = true;
            // Show/hide Color combo only when mode is "Color"
            fameColorRow.row.visible = (idx === 3);
         };
         dlg.comboPostFameMaskMode.onItemSelected(0);

         // ---- FAME mouse hooks on preview -----------------------------------
         var previewCtrl = dlg.postTab.preview.preview;

         dlg.installPostFameHooks = function() {
            previewCtrl.onOverlayPaint = function(g, sc, sx, sy) {
               if (dlg.comboPostMask.currentItem === 2)
                  optRenderFameOverlay(g, sc, sx, sy, dlg.postFameState, previewCtrl.imageCoordScaleX, previewCtrl.imageCoordScaleY);
            };
            previewCtrl.onImageMousePress = function(imgX, imgY, button, modifiers) {
               if (dlg.comboPostMask.currentItem !== 2) return false;
               var st = dlg.postFameState;
               var SHIFT = 0x01, CTRL = 0x02, ALT = 0x04;
               if (button === OPT_MOUSE_RIGHT) { // right-click → gradient point
                  if (!st.gradientA)       st.gradientA = [imgX, imgY];
                  else if (!st.gradientB)  st.gradientB = [imgX, imgY];
                  else { st.gradientA = [imgX, imgY]; st.gradientB = null; }
                  dlg.updatePostFameStateLabel();
                  previewCtrl.viewport.repaint();
                  return true;
               }
               if (button !== OPT_MOUSE_LEFT) return false;
               // CTRL+drag → move active shape
               if ((modifiers & CTRL) && st.shapes.length > 0) {
                  if (st.activeShapeIndex < 0 || st.activeShapeIndex >= st.shapes.length)
                     st.activeShapeIndex = st.shapes.length - 1;
                  st.isMoving = true; st.startX = imgX; st.startY = imgY;
                  st.originalShape = optPostFameCloneShape(st.shapes[st.activeShapeIndex]);
                  return true;
               }
               // ALT+drag → rotate/scale active shape
               if ((modifiers & ALT) && st.shapes.length > 0) {
                  if (st.activeShapeIndex < 0 || st.activeShapeIndex >= st.shapes.length)
                     st.activeShapeIndex = st.shapes.length - 1;
                  var shapeXf = st.shapes[st.activeShapeIndex];
                  st.isTransforming = true; st.startX = imgX; st.startY = imgY;
                  st.originalShape = optPostFameCloneShape(shapeXf);
                  st.transformCenter = optPostFameTransformCenter(shapeXf);
                  st.initialAngle = optPostFameAngle(st.transformCenter[0], st.transformCenter[1], imgX, imgY);
                  st.initialDistance = Math.max(1.0e-6, optPostFameDistance(imgX, imgY, st.transformCenter[0], st.transformCenter[1]));
                  return true;
               }
               // SHIFT+drag → draw new shape
               if (modifiers & SHIFT) {
                  st.isDrawing = true; st.startX = imgX; st.startY = imgY;
                  var stype = dlg.comboPostFameShape.itemText(dlg.comboPostFameShape.currentItem);
                  st.shapeType = stype;
                  if (stype === "Freehand")   st.currentShape = { type:"Freehand", points:[[imgX,imgY]] };
                  else if (stype === "Brush") st.currentShape = { type:"Brush", centers:[[imgX,imgY]], radius:dlg.ncPostFameBrushRadius.value };
                  else if (stype === "Spray Can") { st.currentShape = { type:"SprayCan", points:[], radius:dlg.ncPostFameBrushRadius.value, density:dlg.ncPostFameSprayDensity.value }; optPostFameAppendSprayPoints(st.currentShape, imgX, imgY, st.currentShape.radius, st.currentShape.density); }
                  else if (stype === "Ellipse")   st.currentShape = { type:"Ellipse",   points:optPostFameBuildEllipsePoints(imgX,imgY,imgX,imgY) };
                  else                             st.currentShape = { type:"Rectangle", points:optPostFameBuildRectanglePoints(imgX,imgY,imgX,imgY) };
                  previewCtrl.viewport.repaint();
                  return true;
               }
               // No modifier → let pan handle it
               return false;
            };
            previewCtrl.onImageMouseMove = function(imgX, imgY, buttons, modifiers) {
               if (dlg.comboPostMask.currentItem !== 2) return;
               var st = dlg.postFameState;
               if (st.isDrawing && st.currentShape) {
                  var stype = st.shapeType;
                  if (stype === "Freehand")        st.currentShape.points.push([imgX, imgY]);
                  else if (stype === "Ellipse")    st.currentShape.points = optPostFameBuildEllipsePoints(st.startX, st.startY, imgX, imgY);
                  else if (stype === "Rectangle")  st.currentShape.points = optPostFameBuildRectanglePoints(st.startX, st.startY, imgX, imgY);
                  else if (stype === "Brush") {
                     var centers = st.currentShape.centers, last = centers[centers.length - 1];
                     if (!last || optPostFameDistance(last[0],last[1],imgX,imgY) >= Math.max(1, st.currentShape.radius * 0.35))
                        centers.push([imgX, imgY]);
                  } else if (stype === "Spray Can") {
                     optPostFameAppendSprayPoints(st.currentShape, imgX, imgY, st.currentShape.radius, st.currentShape.density);
                  }
                  previewCtrl.viewport.repaint();
               } else if (st.isMoving && st.originalShape) {
                  st.shapes[st.activeShapeIndex] = optPostFameCloneShape(st.originalShape);
                  optPostFameMoveShape(st.shapes[st.activeShapeIndex], imgX - st.startX, imgY - st.startY);
                  previewCtrl.viewport.repaint();
               } else if (st.isTransforming && st.originalShape && st.transformCenter) {
                  var curAngle = optPostFameAngle(st.transformCenter[0], st.transformCenter[1], imgX, imgY);
                  var curDist  = Math.max(1.0e-6, optPostFameDistance(imgX, imgY, st.transformCenter[0], st.transformCenter[1]));
                  st.shapes[st.activeShapeIndex] = optPostFameCloneShape(st.originalShape);
                  optPostFameTransformShape(st.shapes[st.activeShapeIndex], curAngle - st.initialAngle, curDist / st.initialDistance, st.transformCenter[0], st.transformCenter[1]);
                  previewCtrl.viewport.repaint();
               }
            };
            previewCtrl.onImageMouseRelease = function(imgX, imgY, button, modifiers) {
               if (dlg.comboPostMask.currentItem !== 2) return;
               var st = dlg.postFameState;
               if (st.isDrawing && st.currentShape) {
                  var shape = st.currentShape;
                  st.currentShape = null; st.isDrawing = false;
                  var valid = true;
                  if (shape.type === "Freehand") { if (shape.points.length < 2) valid = false; else shape.points.push([shape.points[0][0], shape.points[0][1]]); }
                  else if (shape.type === "Brush")    valid = !!(shape.centers && shape.centers.length > 0);
                  else if (shape.type === "SprayCan") valid = !!(shape.points  && shape.points.length  > 0);
                  else valid = !!(shape.points && shape.points.length > 2);
                  if (valid) { st.shapes.push(shape); st.activeShapeIndex = st.shapes.length - 1; }
                  dlg.updatePostFameStateLabel();
                  previewCtrl.viewport.repaint();
               }
               st.isMoving = false; st.isTransforming = false;
            };
         };

         dlg.removePostFameHooks = function() {
            previewCtrl.onOverlayPaint       = null;
            previewCtrl.onImageMousePress    = null;
            previewCtrl.onImageMouseMove     = null;
            previewCtrl.onImageMouseRelease  = null;
         };

         // ---- algorithm selector -------------------------------------------
         dlg.comboPostMask.onItemSelected = function(idx) {
            dlg.postRangeGroup.visible      = (idx === 0);
            dlg.postColorMaskGroup.visible  = (idx === 1);
            dlg.postFameGroup.visible       = (idx === 2);
            if (idx === 2) dlg.installPostFameHooks();
            else           dlg.removePostFameHooks();
            // Drop any stale live preview mask and restore the source image
            // in the preview pane. If Live is enabled for the new algorithm,
            // schedule a fresh preview at low debounce.
            try { if (optSafeView(dlg._postLiveMask)) optCloseView(dlg._postLiveMask); } catch (eA) {}
            dlg._postLiveMask = null;
            dlg._postLiveMaskBitmap = null;
            if (dlg.postMaskLiveCache)
               dlg.postMaskLiveCache.release();
            dlg.postActiveMaskShown = false;
            optRenderPostSourcePreview(dlg, dlg.postTab.preview, false);
            var liveOn = (idx === 0 && dlg.chkPostRangeLive && dlg.chkPostRangeLive.checked) ||
                         (idx === 1 && dlg.chkPostMaskLive && dlg.chkPostMaskLive.checked);
            if (liveOn) dlg.schedulePostMaskLive(120);
            previewCtrl.viewport.repaint();
         };
         dlg.comboPostMask.onItemSelected(0);

         // ---- Generate / Clear buttons -------------------------------------
         var rowButtons = new HorizontalSizer(); rowButtons.spacing = 5;
         dlg.btnPostGenerateMask = optPrimaryButton(body, "Generate Active Mask", 180);
         dlg.btnPostClearMask    = optButton(body, "Clear Mask", 90);
         dlg.lblPostMaskStatus   = optInfoLabel(body, "Mask: none");
         dlg.btnPostGenerateMask.onClick = function() {
            optSafeUi("Generate Active Mask", function() {
               // Drop any low-res live preview before producing the full mask.
               try { if (optSafeView(dlg._postLiveMask)) optCloseView(dlg._postLiveMask); } catch (eG) {}
               dlg._postLiveMask = null;
               dlg._postLiveMaskBitmap = null;
               dlg.postTab.preview.preview.setBusy(true, "Generating mask");
               try {
                  var m = optGeneratePostMask(dlg);
                  dlg.lblPostMaskStatus.text = "Mask: " + m.id + " — click a memory slot to save";
               } finally {
                  dlg.postTab.preview.preview.setBusy(false);
               }
            });
         };
         dlg.btnPostClearMask.onClick = function() {
            optSafeUi("Clear Mask", function() {
               optClearPostMaskState(dlg);
            });
         };
         rowButtons.add(dlg.btnPostGenerateMask); rowButtons.add(dlg.btnPostClearMask); rowButtons.addStretch();
         body.sizer.add(rowButtons);
         body.sizer.add(dlg.lblPostMaskStatus);
      }
   });
}

PIWorkflowOptDialog.prototype.configurePostTab = function() {
   var dlg = this;
   this.postActiveMask = null;
   this.postActiveMaskShown = false;
   this.postGeneratedMask = null;
   this._postLiveMask = null;
   this._postLiveMaskBitmap = null;
   this.postFameState = null;
   this.postMaskMemory = this.postMaskMemory || new OptMaskMemoryManager(OPT_MASK_MEMORY_SLOTS);
   this.postMaskLiveCache = this.postMaskLiveCache || new OptPostMaskLiveCache();

   optBuildPostNoiseSection(dlg);
   optBuildPostSharpeningSection(dlg);
   optBuildPostColorBalanceSection(dlg);
   optBuildPostCurvesSection(dlg);
   optBuildPostMaskingSection(dlg);
   this.postTab.leftContent.sizer.addStretch();
};

PIWorkflowOptDialog.prototype.configureCcTab = function() {
   var dlg = this;
   this.ccSlots = [];
   dlg.ccAutoPreview = function() {
      if (dlg.chkCcSeeAllBlended && dlg.chkCcSeeAllBlended.checked)
         return true;
      for (var j = 0; j < dlg.ccSlots.length; ++j)
         if (dlg.ccSlots[j].chkLive && dlg.ccSlots[j].chkLive.checked)
            return true;
      return false;
   };
   dlg.ccHighestActiveKey = function() {
      for (var i = dlg.ccSlots.length - 1; i >= 0; --i) {
         var slot = dlg.ccSlots[i];
         if (slot.chkActive && slot.chkActive.checked !== true)
            continue;
         var key = optCcSlotSourceKey(slot);
         if (key && dlg.store.isAvailable(key, OPT_TAB_CC))
            return key;
      }
      return "";
   };
   dlg.ccLiveSlot = function() {
      for (var i = 0; i < dlg.ccSlots.length; ++i)
         if (dlg.ccSlots[i].chkLive && dlg.ccSlots[i].chkLive.checked)
            return dlg.ccSlots[i];
      return null;
   };
   dlg.scheduleCcSlotsPreview = function(delayMs) {
      dlg.previewScheduler.request("cc.slots", function() {
         optRefreshCcSlotCombos(dlg);
         if (dlg.chkCcSeeAllBlended && dlg.chkCcSeeAllBlended.checked) {
            var highestKey = dlg.ccHighestActiveKey();
            if (!highestKey)
               return;
            if (!dlg.ccTab.preview.activate(highestKey, false))
               return;
            if (dlg.ccTab.preview.currentKey !== highestKey && !dlg.ccTab.preview.activate(highestKey, false))
               return;
            // #4: factoryFn always returns a fresh view, so skip the
            // upfront candidate clone of currentView that beginCandidate does.
            // #3/#6d: live mode downsamples slots to the same raster size used
            // by the tab preview, then render() bypasses the second preview
            // reduction for this live candidate. This preserves zoom, pan and
            // apparent resolution instead of showing a small corner image.
            var ccLiveMaxDim = optCcLivePreviewMaxDim(dlg, dlg.ccTab.preview.currentView);
            dlg.ccTab.preview.beginCandidateFromFactory("Channel Combination (live)", function() {
               return optComposeCcSlots(dlg, { live: true, liveMaxDim: ccLiveMaxDim });
            }, "cc_combine", {
               upgradeFn: function() {
                  return optComposeCcSlots(dlg, { live: false });
               }
            });
            return;
         }
         var slot = dlg.ccLiveSlot();
         if (!slot)
            return;
         var key = optCcSlotSourceKey(slot);
         if (!key || !dlg.store.isAvailable(key, OPT_TAB_CC))
            return;
         if (!dlg.ccTab.preview.activate(key, false))
            return;
         if (dlg.ccTab.preview.currentKey !== key && !dlg.ccTab.preview.activate(key, false))
            return;
         // #4: factoryFn returns its own prepared view; skip upfront clone.
         var slotLiveMaxDim = optCcLivePreviewMaxDim(dlg, dlg.ccTab.preview.currentView);
         dlg.ccTab.preview.beginCandidateFromFactory("Image" + slot.index + " (live)", function() {
            return optPrepareCcSlotView(dlg, slot, { live: true, liveMaxDim: slotLiveMaxDim });
         }, "cc_image", {
            upgradeFn: function() {
               return optPrepareCcSlotView(dlg, slot);
            }
         });
      }, {
         debounceMs: delayMs || 160,
         statusLabel: dlg.ccTab.preview.status,
         busyText: "<b>Live:</b> rendering Channel Combination...",
         doneText: "<b>Live:</b> Channel Combination preview ready.",
         errorText: "<b>Live:</b> Channel Combination failed.",
         onError: function(k, e) { console.warningln("Channel Combination live preview error: " + e.message); }
      });
   };

   function uncheckOtherLive(activeSlot) {
      for (var i = 0; i < dlg.ccSlots.length; ++i)
         if (dlg.ccSlots[i] !== activeSlot && dlg.ccSlots[i].chkLive)
            dlg.ccSlots[i].chkLive.checked = false;
   }

   function buildCcSlotSection(slotIndex) {
      dlg.ccTab.addProcessSection("Image " + slotIndex, [], {
         build: function(body) {
            var slot = {
               index: slotIndex,
               colorMeanHueDeg: 0.0,
               colorMeanSat: 0.0,
               colorPointHueDeg: 0.0,
               colorPointIntensity: 0.75,
               curvesPoints: [[0, 0], [1, 1]],
               cachedHistogramData: null,
               sourceKeys: []
            };
            var src = optComboRow(body, "Source:", ["None"], 88);
            slot.comboSource = src.combo;
            body.sizer.add(src.row);
            var maskRow = optComboRow(body, "Mask:", ["None"], 88);
            slot.comboMask = maskRow.combo;
            slot.maskMemoryIndices = [];
            body.sizer.add(maskRow.row);
            if (slotIndex < 6) {
               var mode = optComboRow(body, "Blend mode:", OPT_CC_BLEND_MODES, 88);
               slot.comboBlend = mode.combo;
               slot.comboBlend.currentItem = 7;
               body.sizer.add(mode.row);
            } else {
               slot.comboBlend = null;
            }
            slot.ncBrightness = optNumeric(body, "Brightness:", 0.0, 2.0, 1.0, 2, 96);
            slot.ncSaturation = optNumeric(body, "Saturation:", 0.0, 2.0, 1.0, 2, 96);
            body.sizer.add(slot.ncBrightness);
            body.sizer.add(slot.ncSaturation);
            var checkRow = new Control(body);
            checkRow.sizer = new HorizontalSizer();
            checkRow.sizer.spacing = 8;
            slot.chkActive = new CheckBox(checkRow);
            slot.chkActive.text = "Active";
            slot.chkActive.checked = true;
            slot.chkLive = new CheckBox(checkRow);
            slot.chkLive.text = "Live";
            slot.chkColour = new CheckBox(checkRow);
            slot.chkColour.text = "Color";
            slot.chkHistogram = new CheckBox(checkRow);
            slot.chkHistogram.text = "Histogram";
            optApplyCheckBoxTooltip(slot.chkActive);
            optApplyCheckBoxTooltip(slot.chkLive);
            optApplyCheckBoxTooltip(slot.chkColour);
            optApplyCheckBoxTooltip(slot.chkHistogram);
            checkRow.sizer.add(slot.chkActive);
            checkRow.sizer.add(slot.chkLive);
            checkRow.sizer.add(slot.chkColour);
            checkRow.sizer.add(slot.chkHistogram);
            checkRow.sizer.addStretch();
            body.sizer.add(checkRow);
            slot.colorGroup = optInnerGroup(body, "Color Correction");
            slot.lblColorReadout = optInfoLabel(slot.colorGroup, "<b>Mean:</b> --");
            slot.colorGroup.sizer.add(slot.lblColorReadout);
            slot.colourWheel = new Control(slot.colorGroup);
            slot.colourWheel.setScaledFixedSize(140, 140);
            slot.colourWheel.cursor = new Cursor(StdCursor_Cross);
            slot.colourWheel.__slot = slot;
            slot.colourWheel.onPaint = function() {
               var s = this.__slot;
               var g = new Graphics(this);
               try {
                  g.antialiasing = true;
                  var sz = Math.min(this.width, this.height);
                  var cx = this.width / 2.0;
                  var cy = this.height / 2.0;
                  var outerR = sz / 2.0 - 2.0;
                  g.drawBitmap(0, 0, optGenerateHueWheelBitmap(sz, 0.0));
                  var meanRad = (s.colorMeanHueDeg || 0.0) * Math.PI / 180.0;
                  g.pen = new Pen(0xffffffff, 2);
                  g.drawLine(cx, cy, cx + Math.cos(meanRad) * outerR * 0.65, cy + Math.sin(meanRad) * outerR * 0.65);
                  var pointRad = (s.colorPointHueDeg || 0.0) * Math.PI / 180.0;
                  var pointR = outerR * optClamp01(s.colorPointIntensity || 0.0);
                  var px = cx + pointR * Math.cos(pointRad);
                  var py = cy + pointR * Math.sin(pointRad);
                  g.pen = new Pen(0xffffff00, 2);
                  g.brush = new Brush(0xffffff00);
                  g.drawEllipse(new Rect(px - 5, py - 5, px + 5, py + 5));
               } finally {
                  try { g.end(); } catch (e0) {}
               }
            };
            slot.colourWheel.pick = function(x, y) {
               var s = this.__slot;
               var sz = Math.min(this.width, this.height);
               var cx = this.width / 2.0;
               var cy = this.height / 2.0;
               var outerR = sz / 2.0 - 2.0;
               var dx = x - cx, dy = y - cy;
               var dist = Math.sqrt(dx * dx + dy * dy);
               if (dist > outerR) {
                  var scale = outerR / Math.max(1.0e-6, dist);
                  dx *= scale; dy *= scale; dist = outerR;
               }
               var ang = Math.atan2(dx, -dy);
               if (ang < 0.0)
                  ang += 2.0 * Math.PI;
               s.colorPointHueDeg = (ang * 180.0 / Math.PI) % 360.0;
               s.colorPointIntensity = optClamp01(dist / Math.max(1.0e-6, outerR));
               optUpdateCcSlotColorReadout(s);
               this.repaint();
            };
            slot.colourWheel.onMousePress = function(x, y, button) {
               if (button !== OPT_MOUSE_LEFT) return;
               this.__dragging = true;
               optUpdateCcSlotColorStats(dlg, this.__slot, false);
               this.pick(x, y);
            };
            slot.colourWheel.onMouseMove = function(x, y) {
               if (this.__dragging === true)
                  this.pick(x, y);
            };
            slot.colourWheel.onMouseRelease = function(x, y, button) {
               if (button !== OPT_MOUSE_LEFT) return;
               this.pick(x, y);
               this.__dragging = false;
               if (this.__slot.chkLive && this.__slot.chkLive.checked)
                  dlg.scheduleCcSlotsPreview(160);
            };
            var colorWheelRow = new Control(slot.colorGroup);
            colorWheelRow.sizer = new HorizontalSizer();
            colorWheelRow.sizer.addStretch();
            colorWheelRow.sizer.add(slot.colourWheel);
            colorWheelRow.sizer.addStretch();
            slot.colorGroup.sizer.add(colorWheelRow);
            slot.ncColorHueSaturation = optNumeric(slot.colorGroup, "Hue saturation:", 0.0, 4.0, 1.0, 2, 150);
            slot.ncColorR = optNumeric(slot.colorGroup, "R multiplier:", 0.0, 2.0, 1.0, 3, 150);
            slot.ncColorG = optNumeric(slot.colorGroup, "G multiplier:", 0.0, 2.0, 1.0, 3, 150);
            slot.ncColorB = optNumeric(slot.colorGroup, "B multiplier:", 0.0, 2.0, 1.0, 3, 150);
            slot.ncColorSaturation = optNumeric(slot.colorGroup, "Saturation:", 0.0, 2.0, 1.0, 2, 150);
            slot.chkColorSCNR = new CheckBox(slot.colorGroup); slot.chkColorSCNR.text = "SCNR green"; optApplyCheckBoxTooltip(slot.chkColorSCNR);
            slot.ncColorSCNR = optNumeric(slot.colorGroup, "SCNR amount:", 0.0, 1.0, 0.60, 2, 150);
            slot.btnColorReset = optButton(slot.colorGroup, "Reset Hue Anchor", 140);
            slot.colorGroup.sizer.add(slot.ncColorHueSaturation);
            slot.colorGroup.sizer.add(slot.ncColorR);
            slot.colorGroup.sizer.add(slot.ncColorG);
            slot.colorGroup.sizer.add(slot.ncColorB);
            slot.colorGroup.sizer.add(slot.ncColorSaturation);
            slot.colorGroup.sizer.add(slot.chkColorSCNR);
            slot.colorGroup.sizer.add(slot.ncColorSCNR);
            slot.colorGroup.sizer.add(slot.btnColorReset);
            body.sizer.add(slot.colorGroup);
            slot.histogramGroup = optInnerGroup(body, "Curves");
            slot.comboCurvesChan = optComboRow(slot.histogramGroup, "Channel:", ["RGB/K", "Red", "Green", "Blue", "Saturation"], 118);
            slot.ncCurvesContrast = optNumeric(slot.histogramGroup, "Contrast:", 0.0, 1.0, 0.0, 2, 150);
            slot.ncCurvesBright = optNumeric(slot.histogramGroup, "Brightness:", -0.5, 0.5, 0.0, 3, 150);
            slot.ncCurvesShadows = optNumeric(slot.histogramGroup, "Shadows lift:", 0.0, 0.5, 0.0, 3, 150);
            slot.ncCurvesHighlights = optNumeric(slot.histogramGroup, "Highlights compress:", 0.0, 0.5, 0.0, 3, 150);
            slot.ncCurvesSaturation = optNumeric(slot.histogramGroup, "Saturation:", 0.0, 2.0, 1.0, 2, 150);
            slot.histogramGroup.sizer.add(slot.comboCurvesChan.row);
            slot.histogramGroup.sizer.add(slot.ncCurvesContrast);
            slot.histogramGroup.sizer.add(slot.ncCurvesBright);
            slot.histogramGroup.sizer.add(slot.ncCurvesShadows);
            slot.histogramGroup.sizer.add(slot.ncCurvesHighlights);
            slot.histogramGroup.sizer.add(slot.ncCurvesSaturation);
            body.sizer.add(slot.histogramGroup);
            slot.syncCurvesFromControls = function(force) {
               var idx = slot.comboCurvesChan ? slot.comboCurvesChan.combo.currentItem : 0;
               var key = ["K", "R", "G", "B", "S"][idx] || "K";
               if (force === true || !slot.curvesManual)
                  slot.curvesPoints[key] = optCurvePointsFromControls({
                     contrast: slot.ncCurvesContrast,
                     brightness: slot.ncCurvesBright,
                     shadows: slot.ncCurvesShadows,
                     highlights: slot.ncCurvesHighlights,
                     saturation: slot.ncCurvesSaturation
                  });
               if (slot.chkHistogram && slot.chkHistogram.checked)
                  optUpdateCcCurvesWidget(dlg, slot);
            };
            var slotColorChanged = function() {
               optUpdateCcSlotColorReadout(slot);
               if (dlg.ccAutoPreview && dlg.ccAutoPreview())
                  dlg.scheduleCcSlotsPreview(160);
            };
            var slotCurvesChanged = function() {
               slot.curvesManual = false;
               slot.syncCurvesFromControls(true);
               if (dlg.ccAutoPreview && dlg.ccAutoPreview())
                  dlg.scheduleCcSlotsPreview(160);
            };
            slot.ncColorHueSaturation.onValueUpdated = slotColorChanged;
            slot.ncColorR.onValueUpdated = slotColorChanged;
            slot.ncColorG.onValueUpdated = slotColorChanged;
            slot.ncColorB.onValueUpdated = slotColorChanged;
            slot.ncColorSaturation.onValueUpdated = slotColorChanged;
            slot.chkColorSCNR.onCheck = slotColorChanged;
            slot.ncColorSCNR.onValueUpdated = slotColorChanged;
            slot.btnColorReset.onClick = function() {
               slot.__colorStatsReady = false;
               optUpdateCcSlotColorStats(dlg, slot, true);
               optUpdateCcSlotColorReadout(slot);
               if (slot.colourWheel)
                  slot.colourWheel.repaint();
               slotColorChanged();
            };
            slot.comboCurvesChan.combo.onItemSelected = function() {
               slot.syncCurvesFromControls(false);
               if (dlg.ccAutoPreview && dlg.ccAutoPreview())
                  dlg.scheduleCcSlotsPreview(140);
            };
            slot.ncCurvesContrast.onValueUpdated = slotCurvesChanged;
            slot.ncCurvesBright.onValueUpdated = slotCurvesChanged;
            slot.ncCurvesShadows.onValueUpdated = slotCurvesChanged;
            slot.ncCurvesHighlights.onValueUpdated = slotCurvesChanged;
            slot.ncCurvesSaturation.onValueUpdated = slotCurvesChanged;
            slot.comboSource.onItemSelected = function() {
               slot.__colorStatsReady = false;
               optUpdateCcSlotColorStats(dlg, slot, true);
               optUpdateCcSlotColorReadout(slot);
               optRefreshCcSlotControlState(dlg, slot);
               if (slot.chkHistogram && slot.chkHistogram.checked)
                  optUpdateCcCurvesWidget(dlg, slot);
               if (dlg.ccAutoPreview && dlg.ccAutoPreview())
                  dlg.scheduleCcSlotsPreview();
            };
            slot.comboMask.onItemSelected = function() {
               optInvalidateCcSlotCache(slot, "all");
               if (dlg.ccAutoPreview && dlg.ccAutoPreview())
                  dlg.scheduleCcSlotsPreview(120);
            };
            if (slot.comboBlend) {
               slot.comboBlend.onItemSelected = function() {
                  if (dlg.ccAutoPreview && dlg.ccAutoPreview())
                     dlg.scheduleCcSlotsPreview();
               };
            }
            slot.ncBrightness.onValueUpdated = function() { if (dlg.ccAutoPreview && dlg.ccAutoPreview()) dlg.scheduleCcSlotsPreview(); };
            slot.ncSaturation.onValueUpdated = function() { if (dlg.ccAutoPreview && dlg.ccAutoPreview()) dlg.scheduleCcSlotsPreview(); };
            slot.chkActive.onCheck = function() { if (dlg.chkCcSeeAllBlended && dlg.chkCcSeeAllBlended.checked) dlg.scheduleCcSlotsPreview(140); };
            slot.chkLive.onCheck = function(checked) {
               if (checked) {
                  if (dlg.chkCcSeeAllBlended)
                     dlg.chkCcSeeAllBlended.checked = false;
                  uncheckOtherLive(slot);
                  dlg.ccActiveSlot = slot;
                  optUpdateCcCurvesWidget(dlg, slot);
                  dlg.scheduleCcSlotsPreview(120);
               }
            };
            slot.chkColour.onCheck = function() {
               if (slot.chkColour.checked) {
                  optUpdateCcSlotColorStats(dlg, slot, false);
                  optUpdateCcSlotColorReadout(slot);
               }
               optRefreshCcSlotControlState(dlg, slot);
               if (dlg.ccAutoPreview && dlg.ccAutoPreview())
                  dlg.scheduleCcSlotsPreview(140);
            };
            slot.chkHistogram.onCheck = function(checked) {
               optRefreshCcSlotControlState(dlg, slot);
               if (checked) {
                  slot.syncCurvesFromControls(false);
                  optUpdateCcCurvesWidget(dlg, slot);
               } else if (dlg.ccActiveSlot === slot || (dlg.ccCurvesWidget && dlg.ccCurvesWidget.__slot === slot)) {
                  optUpdateCcCurvesWidget(dlg, null);
               }
            };
            dlg.ccSlots.push(slot);
            optRefreshCcSlotMaskCombo(dlg, slot);
            optRefreshCcSlotControlState(dlg, slot);
         }
      });
   }

   for (var slotIndex = 1; slotIndex <= 6; ++slotIndex)
      buildCcSlotSection(slotIndex);

   dlg.ccFooter = new Control(this.ccTab.leftContent);
   dlg.ccFooter.sizer = new VerticalSizer();
   dlg.ccFooter.sizer.spacing = 5;
   dlg.chkCcSeeAllBlended = new CheckBox(dlg.ccFooter);
   dlg.chkCcSeeAllBlended.text = "See all Images Blended";
   optApplyCheckBoxTooltip(dlg.chkCcSeeAllBlended);
   dlg.chkCcSeeAllBlended.onCheck = function(checked) {
      if (checked)
         uncheckOtherLive(null);
      dlg.scheduleCcSlotsPreview(120);
   };
   dlg.btnCcRefreshSources = optButton(dlg.ccFooter, "Refresh Sources", 130);
   dlg.btnCcRefreshSources.onClick = function() { optRefreshCcSlotCombos(dlg); };
   dlg.ccFooter.sizer.add(dlg.chkCcSeeAllBlended);
   dlg.ccFooter.sizer.add(dlg.btnCcRefreshSources);
   this.ccTab.leftContent.sizer.add(dlg.ccFooter);

   dlg.ccCurvesWidget = new Control(this.ccTab.preview.control);
         dlg.ccCurvesWidget.setFixedHeight(180);
         dlg.ccCurvesWidget.cursor = new Cursor(StdCursor_Cross);
         dlg.ccCurvesWidget.__slot = null;
         dlg.ccCurvesWidget.__hist = null;
         dlg.ccCurvesWidget.__pts = [[0, 0], [1, 1]];
         dlg.ccCurvesWidget.__dragging = -1;
         dlg.ccCurvesWidget.__hoverIdx = -1;
         dlg.ccCurvesWidget.__pointRadius = 5;
         dlg.ccCurvesWidget.xToCanvas = function(x) { var m = 8; return m + x * (this.width - 2 * m); };
         dlg.ccCurvesWidget.yToCanvas = function(y) { var m = 8; return (this.height - m) - y * (this.height - 2 * m); };
         dlg.ccCurvesWidget.canvasToX = function(x) { var m = 8; return (x - m) / Math.max(1, this.width - 2 * m); };
         dlg.ccCurvesWidget.canvasToY = function(y) { var m = 8; return ((this.height - m) - y) / Math.max(1, this.height - 2 * m); };
         dlg.ccCurvesWidget.findNearest = function(x, y) {
            var pts = this.__pts || [[0, 0], [1, 1]];
            var best = 15 * 15, idx = -1;
            for (var i = 0; i < pts.length; ++i) {
               var px = this.xToCanvas(pts[i][0]);
               var py = this.yToCanvas(pts[i][1]);
               var d = (x - px) * (x - px) + (y - py) * (y - py);
               if (d < best) { best = d; idx = i; }
            }
            return idx;
         };
         dlg.ccCurvesWidget.onPaint = function() {
            var g = new Graphics(this);
            try {
               var w = this.width, h = this.height, m = 8, cw = w - 2 * m, ch = h - 2 * m;
               g.fillRect(0, 0, w, h, new Brush(0xff1a1a1a));
               g.pen = new Pen(0xff333333, 1);
               for (var gi = 0; gi <= 4; ++gi) {
                  g.drawLine(m + gi * cw / 4, m, m + gi * cw / 4, h - m);
                  g.drawLine(m, h - m - gi * ch / 4, w - m, h - m - gi * ch / 4);
               }
               g.pen = new Pen(0xff555555, 1);
               g.drawRect(m, m, w - m, h - m);
               var hist = this.__hist;
               if (hist) {
                  var chans = hist.isRGB ? ["R", "G", "B"] : ["K"];
                  var colors = { R: 0x60ff4444, G: 0x6044ff44, B: 0x604488ff, K: 0x60dddddd };
                  var maxCount = 1;
                  for (var c = 0; c < chans.length; ++c) {
                     var data = hist[chans[c]] || hist.K;
                     for (var bi = 0; data && bi < data.length; ++bi)
                        if (data[bi] > maxCount) maxCount = data[bi];
                  }
                  for (var c2 = 0; c2 < chans.length; ++c2) {
                     var ck = chans[c2], d = hist[ck] || hist.K;
                     if (!d) continue;
                     g.pen = new Pen(colors[ck] || 0x60dddddd, 1);
                     for (var bj = 1; bj < d.length - 1; ++bj) {
                        var bx = m + (bj / (d.length - 1)) * cw;
                        var bh = (d[bj] / maxCount) * ch * 0.85;
                        g.drawLine(bx, h - m, bx, h - m - bh);
                     }
                  }
               } else {
                  g.pen = new Pen(0xff707070, 1);
                  g.drawTextRect(new Rect(m, m, w - m, h - m), "Select an Image slot to see its histogram", TextAlign_Center | TextAlign_VertCenter);
               }
               try { g.pen = new Pen(0xff404040, 1, PenStyle_Dash); } catch (eDash) { g.pen = new Pen(0xff404040, 1); }
               g.drawLine(m, h - m, w - m, m);
               var pts = this.__pts || [[0, 0], [1, 1]];
               var lut = optAkimaInterpolate(pts, 512);
               g.antialiasing = true;
               g.pen = new Pen(0xffffffff, 2);
               for (var si = 1; si < lut.length; ++si)
                  g.drawLine(m + ((si - 1) / (lut.length - 1)) * cw, h - m - lut[si - 1] * ch, m + (si / (lut.length - 1)) * cw, h - m - lut[si] * ch);
               for (var pi = 0; pi < pts.length; ++pi) {
                  var px = this.xToCanvas(pts[pi][0]), py = this.yToCanvas(pts[pi][1]), rr = this.__pointRadius;
                  g.pen = new Pen(0xffffffff, 1);
                  g.brush = new Brush(pi === this.__hoverIdx ? 0xffffcc00 : 0xffffffff);
                  g.fillRect(px - rr, py - rr, px + rr, py + rr, g.brush);
                  g.drawRect(px - rr, py - rr, px + rr, py + rr);
               }
            } finally {
               try { g.end(); } catch (e0) {}
            }
         };
         dlg.ccCurvesWidget.onMousePress = function(x, y, button) {
            if (!this.__slot)
               return;
            var pts = this.__pts || [[0, 0], [1, 1]];
            if (button === OPT_MOUSE_LEFT) {
               var idx = this.findNearest(x, y);
               if (idx < 0) {
                  var nx = optClamp01(this.canvasToX(x)), ny = optClamp01(this.canvasToY(y));
                  pts.push([nx, ny]);
                  pts.sort(function(a, b) { return a[0] - b[0]; });
                  idx = this.findNearest(x, y);
               }
               this.__dragging = idx;
               this.__slot.curvesPoints = pts;
               this.repaint();
            } else if (button === OPT_MOUSE_RIGHT) {
               var ridx = this.findNearest(x, y);
               if (ridx > 0 && ridx < pts.length - 1) {
                  pts.splice(ridx, 1);
                  this.__slot.curvesPoints = pts;
                  this.repaint();
                  if (this.__slot.chkLive && this.__slot.chkLive.checked)
                     dlg.scheduleCcSlotsPreview(160);
               }
            }
         };
         dlg.ccCurvesWidget.onMouseMove = function(x, y) {
            if (!this.__slot)
               return;
            var pts = this.__pts || [[0, 0], [1, 1]];
            if (this.__dragging >= 0 && this.__dragging < pts.length) {
               var di = this.__dragging, ny = optClamp01(this.canvasToY(y));
               if (di === 0 || di === pts.length - 1)
                  pts[di][1] = ny;
               else {
                  pts[di][0] = Math.max(pts[di - 1][0] + 0.005, Math.min(pts[di + 1][0] - 0.005, optClamp01(this.canvasToX(x))));
                  pts[di][1] = ny;
               }
               this.__slot.curvesPoints = pts;
               this.repaint();
            } else {
               var old = this.__hoverIdx;
               this.__hoverIdx = this.findNearest(x, y);
               if (old !== this.__hoverIdx) this.repaint();
            }
         };
         dlg.ccCurvesWidget.onMouseRelease = function() {
            if (this.__dragging >= 0) {
               this.__dragging = -1;
               if (this.__slot && this.__slot.chkLive && this.__slot.chkLive.checked)
                  dlg.scheduleCcSlotsPreview(160);
            }
         };
         var ccCurvesLabel = optInfoLabel(this.ccTab.preview.control, "Curves: select a slot histogram to edit its curve. Left click adds/drags points, right click removes points.");
         this.ccCurvesLabel = ccCurvesLabel;
         this.ccTab.preview.control.sizer.add(ccCurvesLabel);
         this.ccTab.preview.control.sizer.add(dlg.ccCurvesWidget);
         optRefreshCcSlotCombos(dlg);
         optUpdateCcCurvesWidget(dlg, null);
   this.ccTab.leftContent.sizer.addStretch();
};

PIWorkflowOptDialog.prototype.buildConfigPage = function() {
   var page = new Control(this);
   page.autoFillBackground = true;
   page.backgroundColor = OPT_BG;
   page.sizer = new VerticalSizer();
   page.sizer.margin = 8;
   page.sizer.spacing = 6;

   var title = new Label(page);
   title.useRichText = true;
   title.styleSheet = OPT_CSS_ENGINE_TITLE;
   title.text = "Configuration / Dependency Check";
   page.sizer.add(title);

   var info = optInfoLabel(page, "<p>Chequeo rápido de procesos, scripts e iconos críticos al iniciar. Este bloque es centralizado y se puede ampliar o recortar desde el registro de dependencias.</p>");
   page.sizer.add(info);

   this.cfgDependencySummary = optInfoLabel(page, "Dependency summary pending.");
   page.sizer.add(this.cfgDependencySummary);

   this.cfgDependencyDetails = new TextBox(page);
   this.cfgDependencyDetails.readOnly = true;
   this.cfgDependencyDetails.minWidth = 760;
   this.cfgDependencyDetails.minHeight = 340;
   this.cfgDependencyDetails.styleSheet =
      "QTextEdit { background-color:" + OPT_UI.bgInset +
      "; color:" + OPT_UI.text +
      "; border:1px solid " + OPT_UI.border +
      "; border-radius:4px; font-family:Consolas,monospace; font-size:8pt; padding:6px; }";
   page.sizer.add(this.cfgDependencyDetails, 100);

   var row = new Control(page);
   row.sizer = new HorizontalSizer();
   row.sizer.spacing = 4;
   this.btnRefreshDependencyCheck = optPrimaryButton(row, "Refresh Dependency Check", 210);
   var dlg = this;
   this.btnRefreshDependencyCheck.onClick = function() {
      optSafeUi("Refresh Dependency Check", function() {
         dlg.runDependencyChecks();
      });
   };
   row.sizer.add(this.btnRefreshDependencyCheck);
   row.sizer.addStretch();
   page.sizer.add(row);

   page.sizer.addStretch();
   return page;
};

// ============================================================================
// Centralized UI Gating Policy System (v33-opt-8k)
// ----------------------------------------------------------------------------
// Declarative registry of UI policies. Each policy declares a set of target
// controls (or sections) gated by a named predicate. A single engine evaluates
// all policies and applies enable/disable + tooltip swap uniformly.
//
// To add a new gating rule in the future:
//   1. (If new condition) add a predicate to PIWorkflowOptDialog.prototype.uiPredicates
//   2. Add an entry to buildUIPolicies()
//   3. Add the corresponding "policy.xxx" tooltip text to PI Workflow_resources.jsh
//
// Coarse (Phase 1, current): targets a whole section.body or a button.
// Granular (Phase 2, future): targets specific sub-controls inside a section.
// Both modes share the same engine — only the targets array differs.
// ============================================================================

// Helper: detect whether the canonical image of a given tab is a color (RGB) image.
PIWorkflowOptDialog.prototype.canonicalIsColor = function(tabName) {
   var tab = this.tabsByName ? this.tabsByName[tabName] : null;
   if (!tab || !tab.preview) return false;
   var view = tab.preview.candidateView || tab.preview.currentView;
   if (!optSafeView(view)) return false;
   try { return view.image.numberOfChannels >= 3; } catch (e) { return false; }
};

// Registry of predicates. Each predicate receives the dialog and returns boolean.
// Add new predicates here when introducing new gating conditions.
PIWorkflowOptDialog.prototype.uiPredicates = {
   "canonical-rgb-pre":     function(dlg) { return dlg.canonicalIsColor(OPT_TAB_PRE); },
   "canonical-rgb-stretch": function(dlg) { return dlg.canonicalIsColor(OPT_TAB_STRETCH); },
   "canonical-rgb-post":    function(dlg) { return dlg.canonicalIsColor(OPT_TAB_POST); }
};

// Registry of policies. Built once after all tabs are configured because the
// targets reference controls created during tab construction.
PIWorkflowOptDialog.prototype.buildUIPolicies = function() {
   var dlg = this;
   dlg.uiPolicies = [
      // ----- COARSE policies (Phase 1) ------------------------------------
      {
         id: "pre.colorCalibration",
         requires: "canonical-rgb-pre",
         message: "policy.requiresRGB",
         targets: function() {
            var t = [];
            if (dlg.preTab && dlg.preTab.btnPreSPCC) t.push(dlg.preTab.btnPreSPCC);
            if (dlg.preTab && dlg.preTab.btnPreALF)  t.push(dlg.preTab.btnPreALF);
            if (dlg.preTab && dlg.preTab.btnPreBN)   t.push(dlg.preTab.btnPreBN);
            return t;
         }
      },
      {
         id: "post.colorBalance",
         requires: "canonical-rgb-post",
         message: "policy.requiresRGB",
         targets: function() {
            return dlg.__sectionPostColorBalance ? [dlg.__sectionPostColorBalance] : [];
         }
      },
      {
         id: "post.colorMask",
         requires: "canonical-rgb-post",
         message: "policy.requiresRGB",
         targets: function() {
            return dlg.postColorMaskGroup ? [dlg.postColorMaskGroup] : [];
         }
      },
      // ----- GRANULAR policies (Phase 2) ----------------------------------
      {
         // Pre > Gradient Correction > MGC: G/B per-channel scales (R/K stays
         // enabled because in mono workflows the only channel maps to K).
         id: "pre.mgc.colorChannels",
         requires: "canonical-rgb-pre",
         message: "policy.requiresRGB",
         targets: function() {
            var t = [];
            if (dlg.ncMgcScaleG) t.push(dlg.ncMgcScaleG);
            if (dlg.ncMgcScaleB) t.push(dlg.ncMgcScaleB);
            return t;
         }
      },
      {
         // Stretching (both zones) > MAS > Color Saturation sub-controls.
         // Engine already skips these in mono (isRGB check at line ~7507);
         // gating just makes the inactive state visible.
         id: "stretch.mas.colorSat",
         requires: "canonical-rgb-stretch",
         message: "policy.requiresRGB",
         targets: function() {
            var t = [];
            var zones = [dlg.stretchZoneRgb, dlg.stretchZoneStars];
            for (var k = 0; k < zones.length; ++k) {
               var z = zones[k];
               if (!z) continue;
               if (z.msCS)          t.push(z.msCS);
               if (z.msCSAmount)    t.push(z.msCSAmount);
               if (z.msCSBoost)     t.push(z.msCSBoost);
               if (z.msCSLightness) t.push(z.msCSLightness);
            }
            return t;
         }
      },
      {
         // Stretching > Stars zone > Star Stretch color controls.
         // Color Boost (saturation) and Remove Green via SCNR are color-only.
         id: "stretch.starStretch.color",
         requires: "canonical-rgb-stretch",
         message: "policy.requiresRGB",
         targets: function() {
            var t = [];
            var z = dlg.stretchZoneStars;
            if (z && z.starSat)         t.push(z.starSat);
            if (z && z.starRemoveGreen) t.push(z.starRemoveGreen);
            return t;
         }
      },
      {
         // Stretching (both zones) > Curves > Channel selector + Saturation.
         // Disabling the row greys the "Channel:" label together with the combo.
         id: "stretch.curves.color",
         requires: "canonical-rgb-stretch",
         message: "policy.requiresRGB",
         targets: function() {
            var t = [];
            var zones = [dlg.stretchZoneRgb, dlg.stretchZoneStars];
            for (var k = 0; k < zones.length; ++k) {
               var z = zones[k];
               if (!z) continue;
               if (z.curvesChan && z.curvesChan.row) t.push(z.curvesChan.row);
               if (z.curvesSaturation) t.push(z.curvesSaturation);
            }
            return t;
         }
      },
      {
         // Post > Noise Reduction: per-engine chrominance/color sub-controls
         // (NXT color sep + color amounts, TGV chrominance, CC Denoise color).
         id: "post.nr.color",
         requires: "canonical-rgb-post",
         message: "policy.requiresRGB",
         targets: function() {
            var t = [];
            if (dlg.chkPostNxtColorSep)      t.push(dlg.chkPostNxtColorSep);
            if (dlg.ncPostNxtDenoiseColor)   t.push(dlg.ncPostNxtDenoiseColor);
            if (dlg.ncPostNxtDenoiseLFColor) t.push(dlg.ncPostNxtDenoiseLFColor);
            if (dlg.ncPostTgvStrengthC)      t.push(dlg.ncPostTgvStrengthC);
            if (dlg.ncPostCCNRColor)         t.push(dlg.ncPostCCNRColor);
            return t;
         }
      },
      {
         // Post > Curves > Channel selector + Saturation slider.
         id: "post.curves.color",
         requires: "canonical-rgb-post",
         message: "policy.requiresRGB",
         targets: function() {
            var t = [];
            if (dlg.__postCurvesChannelRow) t.push(dlg.__postCurvesChannelRow);
            if (dlg.ncPostCurvesSaturation) t.push(dlg.ncPostCurvesSaturation);
            return t;
         }
      }
   ];
};

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

// Engine: evaluate all policies and apply their decisions.
PIWorkflowOptDialog.prototype.applyUIPolicies = function() {
   if (!this.uiPolicies) return;
   var dlg = this;
   for (var i = 0; i < dlg.uiPolicies.length; ++i) {
      var p = dlg.uiPolicies[i];
      var pred = dlg.uiPredicates ? dlg.uiPredicates[p.requires] : null;
      if (typeof pred !== "function") continue;
      var ok = false;
      try { ok = pred(dlg) === true; } catch (ePred) { ok = false; }
      var targets = [];
      try { targets = (typeof p.targets === "function") ? (p.targets() || []) : []; } catch (eT) { targets = []; }
      var msg = "";
      try { msg = optTooltipTextByKey(p.message) || ""; } catch (eM) { msg = ""; }
      for (var j = 0; j < targets.length; ++j)
         optApplyPolicyToTarget(targets[j], ok, msg);
   }
};

PIWorkflowOptDialog.prototype.runDependencyChecks = function() {
   this.dependencyReport = optRunDependencyChecks();
   var counts = this.dependencyReport.counts || { ok: 0, warn: 0, error: 0 };
   var summaryColor = "#FF7ed89b";
   if (this.dependencyReport.worst === "warn")
      summaryColor = "#FFe5c070";
   else if (this.dependencyReport.worst === "error")
      summaryColor = "#FFe08070";
   if (this.cfgDependencySummary)
      this.cfgDependencySummary.text =
         "<b style='color:" + summaryColor + ";'>Dependency Check</b> &nbsp; " +
         "OK=" + counts.ok + " &nbsp; WARN=" + counts.warn + " &nbsp; ERROR=" + counts.error;
   if (this.cfgDependencyDetails)
      this.cfgDependencyDetails.text = optFormatDependencyReport(this.dependencyReport);
   try {
      console.noteln("=> Dependency Check: OK=" + counts.ok + " WARN=" + counts.warn + " ERROR=" + counts.error);
   } catch (e) {
   }
   try { optApplyProcessAvailabilityToUI(this); } catch (eAvail) {}
   try { this.applyUIPolicies(); } catch (ePol) {}
   return this.dependencyReport;
};

PIWorkflowOptDialog.prototype.refreshSelections = function() {
   this.preTab.refreshSelections();
   this.stretchTab.refreshSelections();
   this.postTab.refreshSelections();
   this.ccTab.refreshSelections();
};

PIWorkflowOptDialog.prototype.refreshWorkflowButtons = function() {
   this.preTab.preview.refreshButtons();
   this.stretchTab.preview.refreshButtons();
   this.postTab.preview.refreshButtons();
   this.ccTab.preview.refreshButtons();
   // Re-evaluate UI policies because workflow state (canonical image, slot
   // availability) may have changed. Cheap operation — just enable/disable
   // and tooltip swaps; no image work involved.
   try { this.applyUIPolicies(); } catch (ePol) {}
};

PIWorkflowOptDialog.prototype.refreshAllPreviews = function(fit) {
   var tabs = [this.preTab, this.stretchTab, this.postTab, this.ccTab];
   for (var i = 0; i < tabs.length; ++i) {
      var p = tabs[i].preview;
      if (optSafeView(p.candidateView || p.currentView))
         p.render(p.candidateView || p.currentView, fit === true);
   }
};

PIWorkflowOptDialog.prototype.setSharedPreviewReduction = function(value) {
   var reduction = optClampPreviewReduction(value);
   this.sharedPreviewReduction = reduction;
   if (this.__syncingSharedPreviewReduction)
      return;
   this.__syncingSharedPreviewReduction = true;
   try {
      var tabs = [this.preTab, this.stretchTab, this.postTab, this.ccTab];
      for (var i = 0; i < tabs.length; ++i) {
         var preview = tabs[i] && tabs[i].preview;
         if (!preview || !preview.resCombo)
            continue;
         try {
            if (preview.resCombo.currentItem !== reduction - 1)
               preview.resCombo.currentItem = reduction - 1;
         } catch (e0) {}
      }
   } finally {
      this.__syncingSharedPreviewReduction = false;
   }
   this.refreshAllPreviews(false);
};

PIWorkflowOptDialog.prototype.refreshRecipeButtons = function() {
   for (var i = 0; i < this.recipeButtons.length; ++i) {
      var b = this.recipeButtons[i];
      if (b.__recipe === this.selectedRecipe) {
         b.text = "[" + b.__recipe + "]";
         b.styleSheet = OPT_CSS_RECIPE_SELECTED;
      } else {
         b.text = b.__recipe;
         b.styleSheet = OPT_CSS_RECIPE;
      }
   }
};

PIWorkflowOptDialog.prototype.activeWorkflowTab = function() {
   var idx = 0;
   try { idx = this.tabs.currentPageIndex; } catch (e) { idx = 0; }
   if (idx === 0) return this.preTab;
   if (idx === 1) return this.stretchTab;
   if (idx === 2) return this.postTab;
   if (idx === 3) return this.ccTab;
   return null;
};

PIWorkflowOptDialog.prototype.ensureTabConfigured = function(tab) {
   // Tabs are built eagerly in the constructor, so this is normally a no-op.
   // Kept as a safety net in case future code defers a tab again.
   if (!tab || tab.__configured)
      return;
   tab.__configured = true;
   if (tab === this.stretchTab)
      this.configureStretchTab();
   else if (tab === this.postTab)
      this.configurePostTab();
   else if (tab === this.ccTab)
      this.configureCcTab();
   else if (tab === this.preTab)
      this.configurePreTab();
   this.collapseTabSections(tab);
};

PIWorkflowOptDialog.prototype.onTabChanged = function(index) {
   if (this.previousTabIndex !== index) {
      var oldTab = null;
      if (this.previousTabIndex === 0) oldTab = this.preTab;
      if (this.previousTabIndex === 1) oldTab = this.stretchTab;
      if (this.previousTabIndex === 2) oldTab = this.postTab;
      if (this.previousTabIndex === 3) oldTab = this.ccTab;
      if (oldTab && oldTab.preview && oldTab.preview.memory)
         oldTab.preview.memory.clear();
   }
   this.previousTabIndex = index;
   var tab = this.activeWorkflowTab();
   this.ensureTabConfigured(tab);
   this.collapseTabSections(tab);
   if (index === 3)
      optRefreshCcSlotCombos(this);
   if (tab && tab.preview && optSafeView(tab.preview.currentView))
      tab.preview.render(tab.preview.currentView, true);
};

PIWorkflowOptDialog.prototype.resolveStretchZoneKey = function(starsZone) {
   var current = this.stretchTab.preview.currentKey || "";
   if (starsZone === true) {
      if (current.indexOf("_Stars") > 0 && this.store.isAvailable(current, OPT_TAB_STRETCH))
         return current;
      var starCompanion = optBaseKey(current) + "_Stars";
      if (this.store.isAvailable(starCompanion, OPT_TAB_STRETCH))
         return starCompanion;
      var starKeys = this.store.keysForTab(OPT_TAB_STRETCH);
      for (var s = 0; s < starKeys.length; ++s)
         if (starKeys[s].indexOf("_Stars") > 0)
            return starKeys[s];
      return "";
   }
   if (current && current.indexOf("_Stars") < 0 && this.store.isAvailable(current, OPT_TAB_STRETCH))
      return current;
   var base = optBaseKey(current);
   var starlessCompanion = base + "_Starless";
   if (this.store.isAvailable(starlessCompanion, OPT_TAB_STRETCH))
      return starlessCompanion;
   if (this.store.isAvailable(base, OPT_TAB_STRETCH))
      return base;
   var keys = this.store.keysForTab(OPT_TAB_STRETCH);
   for (var i = 0; i < keys.length; ++i)
      if (keys[i].indexOf("_Stars") < 0)
         return keys[i];
   return "";
};

PIWorkflowOptDialog.prototype.sendActiveToStretch = function() {
   var key = this.preTab.preview.currentKey;
   if (!key)
      throw new Error("Select an image in Pre Processing first.");
   var rec = this.store.record(key);
   if (!optSafeView(rec.view))
      throw new Error("The selected Pre image is not valid.");
   this.store.setAvailable(key, OPT_TAB_STRETCH, true);
   this.refreshWorkflowButtons();
   this.tabs.currentPageIndex = 1;
   this.stretchTab.preview.activate(key, true);
};

PIWorkflowOptDialog.prototype.createStarSplit = function() {
   var key = this.stretchTab.preview.currentKey;
   if (!key)
      throw new Error("Select a Stretching image first.");
   var rec = this.store.record(key);
   if (!optSafeView(rec.view))
      throw new Error("The selected Stretching image is not valid.");
   var base = optBaseKey(key);
   var starlessKey = base + "_Starless";
   var starsKey = base + "_Stars";
   var starless = null;
   var stars = null;
   var busyPreview = this.stretchTab && this.stretchTab.preview ? this.stretchTab.preview.preview : null;

   if (busyPreview) {
      busyPreview.setBusy(true, "Generating Starless / Stars");
      try { processEvents(); } catch (eBusy0) {}
   }

   try {
      if (!OPT_TEST_MODE && typeof StarXTerminator !== "undefined") {
         var starlessWindow = null;
         var starsWindow = null;
         try {
            starlessWindow = new ImageWindow(
               rec.view.image.width,
               rec.view.image.height,
               rec.view.image.numberOfChannels,
               rec.view.window.bitsPerSample,
               rec.view.window.isFloatSample,
               optViewIsColor(rec.view),
               optUniqueId(rec.view.id + "_starless")
            );
            starlessWindow.mainView.beginProcess(UndoFlag_NoSwapFile);
            starlessWindow.mainView.image.assign(rec.view.image);
            starlessWindow.mainView.endProcess();
            try { starlessWindow.keywords = rec.view.window.keywords; } catch (e0) {}
            try { optCopyAstrometricSolution(starlessWindow, rec.view.window); } catch (e1) {}

            var windowsBefore = ImageWindow.windows;
            var sxt = new StarXTerminator();
            try { sxt.stars = true; } catch (e2) {}
            try { sxt.generate_stars = true; } catch (e3) {}
            try { sxt.generateStars = true; } catch (e4) {}
            try { sxt.unscreen = false; } catch (e5) {}
            try { sxt.unscreen_stars = false; } catch (e6) {}
            try { sxt.unscreenStars = false; } catch (e7) {}
            sxt.executeOn(starlessWindow.mainView);
            try { starlessWindow.hide(); } catch (e8) {}
            processEvents();

            var windowsAfter = ImageWindow.windows;
            for (var iWin = 0; iWin < windowsAfter.length; ++iWin) {
               var found = false;
               for (var jWin = 0; jWin < windowsBefore.length; ++jWin) {
                  if (windowsAfter[iWin].mainView.id === windowsBefore[jWin].mainView.id) {
                     found = true;
                     break;
                  }
               }
               if (!found && windowsAfter[iWin].mainView.id !== starlessWindow.mainView.id) {
                  starsWindow = windowsAfter[iWin];
                  break;
               }
            }

            starless = optCloneView(starlessWindow.mainView, base + "_Starless", false);
            if (starsWindow && starsWindow.mainView && !starsWindow.mainView.isNull) {
               try { starsWindow.keywords = rec.view.window.keywords; } catch (e9) {}
               try { optCopyAstrometricSolution(starsWindow, rec.view.window); } catch (e10) {}
               try { starsWindow.hide(); } catch (e11) {}
               stars = optCloneView(starsWindow.mainView, base + "_Stars", false);
            }
         } finally {
            if (starlessWindow && !starlessWindow.isNull && starlessWindow.mainView)
               optCloseView(starlessWindow.mainView);
            if (starsWindow && !starsWindow.isNull && starsWindow.mainView)
               optCloseView(starsWindow.mainView);
         }
      }
      if (!optSafeView(starless)) {
         starless = optCloneView(rec.view, base + "_Starless", false);
         optApplyFallbackTransform(starless, "darken", 0.18);
      }
      if (!optSafeView(stars)) {
         stars = optCloneView(rec.view, base + "_Stars", false);
         optApplyFallbackTransform(stars, "lift", 0.12);
      }
      this.store.setView(starlessKey, starless, true, OPT_TAB_STRETCH);
      this.store.setView(starsKey, stars, true, OPT_TAB_STRETCH);
      this.store.markStage(starlessKey, "Starless");
      this.store.markStage(starsKey, "Stars");
      this.refreshWorkflowButtons();
      this.stretchTab.preview.activate(starlessKey, true);
   } finally {
      if (busyPreview)
         busyPreview.setBusy(false);
   }
};

PIWorkflowOptDialog.prototype.sendActiveToPost = function() {
   var key = this.stretchTab.preview.currentKey;
   if (!key)
      throw new Error("Select a Stretching image first.");
   var rec = this.store.record(key);
   if (!optSafeView(rec.view))
      throw new Error("The selected Stretching image is not valid.");
   var stages = optStageList(rec);
   var stretched = false;
   for (var i = 0; i < stages.length; ++i)
      if (stages[i].indexOf("Stretch") === 0) {
         stretched = true;
         break;
      }
   if (!stretched)
      throw new Error("There is no committed stretched image available for " + optLabelForKey(key) + ". Use Preview and Set to Current first.");
   this.store.setAvailable(key, OPT_TAB_POST, true);
   this.store.setAvailable(key, OPT_TAB_CC, true);
   this.refreshWorkflowButtons();
   this.tabs.currentPageIndex = 2;
   this.postTab.preview.activate(key, true);
};

PIWorkflowOptDialog.prototype.finalCleanup = function() {
   try { if (this.previewScheduler) this.previewScheduler.cancelAll(); } catch (eS) {}
   try { if (this.preTab && this.preTab.preview) this.preTab.preview.releaseTransient(); } catch (ePre) {}
   try { if (this.stretchTab && this.stretchTab.preview) this.stretchTab.preview.releaseTransient(); } catch (eStretch) {}
   try { if (this.postTab && this.postTab.preview) this.postTab.preview.releaseTransient(); } catch (ePost) {}
   try { if (this.ccTab && this.ccTab.preview) this.ccTab.preview.releaseTransient(); } catch (eCc) {}
   if (optSafeView(this.postGeneratedMask))
      optCloseView(this.postGeneratedMask);
   if (optSafeView(this._postLiveMask)) {
      try { optCloseView(this._postLiveMask); } catch (eLM) {}
   }
   this.postGeneratedMask = null;
   this.postActiveMask = null;
   this.postActiveMaskShown = false;
   this._postLiveMask = null;
   this._postLiveMaskBitmap = null;
   if (this.postMaskLiveCache)
      try { this.postMaskLiveCache.release(); } catch (eLC) {}
   if (this.postMaskMemory) {
      try { this.postMaskMemory.clear(); } catch (eMM) {}
   }
   try { if (this.store) this.store.releaseAll(); } catch (eStore) {}
   try { optClearHistogramCache(); } catch (eHC) {}
   try { optReleaseCcSlotCaches(this); } catch (eCcC) {}
   if (this.removePostFameHooks) try { this.removePostFameHooks(); } catch (eF) {}
};

function optRunArchitectureSelfCheck() {
   var missing = [];
   if (typeof optCloseViews !== "function")
      missing.push("optCloseViews");
   if (typeof optReleaseOwnedSlotViews !== "function")
      missing.push("optReleaseOwnedSlotViews");
   if (typeof optPreparePostMaskWorkImage !== "function")
      missing.push("optPreparePostMaskWorkImage");
   if (typeof optFinishPostMaskView !== "function")
      missing.push("optFinishPostMaskView");
   if (typeof optBuildPostRangeMaskViewTiled !== "function")
      missing.push("optBuildPostRangeMaskViewTiled");
   if (typeof optBuildPostColorMaskViewTiled !== "function")
      missing.push("optBuildPostColorMaskViewTiled");
   if (typeof optRenderMaskViewInPreview !== "function")
      missing.push("optRenderMaskViewInPreview");
   if (typeof OptPostMaskLiveCache !== "function")
      missing.push("OptPostMaskLiveCache");
   if (typeof optFillRangeMaskRgbLuma !== "function")
      missing.push("optFillRangeMaskRgbLuma");
   if (typeof optFillColorMaskArray !== "function")
      missing.push("optFillColorMaskArray");
   if (typeof optGaussianKernelForSigma !== "function")
      missing.push("optGaussianKernelForSigma");
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
      throw new Error("PI Workflow Opt architecture check failed: " + missing.join(", "));
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
