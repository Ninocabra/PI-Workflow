/*
 * PI Workflow 4 — UI layer (unchanged from PI Workflow 3).
 *
 * This file is #include'd from "PI Workflow 4.js"; it is NOT a standalone
 * PixInsight script and has no #feature-id of its own. It owns:
 *   - Theme tokens, OPT_UI palette, OPT_CSS_* style sheets and theme helpers
 *   - Tooltip system
 *   - OptImageStore / memory managers (state containers used by the UI)
 *   - OptPreviewControl / OptImageCombo / OptSelectionPanel / OptPreviewPane
 *   - OptWorkflowTab and PIWorkflowOptDialog (constructor + prototype methods)
 *   - All optBuild*Section / optBuild*TitleBar / optBuildStretchZone builders
 *   - Process-availability UI sync
 *
 * The core executable file references symbols defined here (e.g. PIWorkflowOptDialog
 * in optMain), but only at call time. Function declarations are hoisted across the
 * combined translation unit, so the only thing that would be unsafe is top-level
 * code in the core file reading UI tokens at module-load time — there is none.
 */

// ============================================================================
// >>> THEME — visual redesign infrastructure (Phase 1) — easy-rollback block <<<
// ----------------------------------------------------------------------------
// Design tokens for the PI Workflow 2 visual redesign. Single source of truth
// for surfaces, borders, brand colour, text colours, channel dots, radii,
// spacing scale and typography. Subsequent phases of the migration read from
// here via the helpers below; PHASE 1 only introduces the infrastructure and
// does NOT touch any existing UI element.
//
// Reference: DESIGN_SPEC §1 (Design tokens).
// Alpha-encoded colours use the Qt-supported #RRGGBBAA notation, where AA is
// the alpha in hex (e.g. #ffffff10 == white at 6.25% opacity).
// ============================================================================
var Theme = {
   // Surfaces
   bg:            "#0e0e11",   // window background
   surface:       "#17171c",   // cards (left panel, preview panel)
   surfaceRaised: "#1f1f26",   // inputs, active tab, secondary buttons
   surfaceHover:  "#22222a",

   // Borders (hairlines)
   border:        "#ffffff10", //  6% white  - dividers
   borderStrong:  "#ffffff1c", // 11% white  - element borders

   // Brand
   amber:         "#e0a85a",   // active state, CTA
   amberBright:   "#f0b865",   // top of the CTA gradient
   amberSoft:     "#e0a85a1f", // 12% - active chip background
   amberRing:     "#e0a85a52", // 32% - active chip border

   // Text
   text:          "#f0f0f3",   // primary
   textMuted:     "#8a8a94",   // secondary, labels
   textDim:       "#52525c",   // tertiary, hints, dividers

   // Channel dots (literal colours, not tokens)
   chR:           "#e36a6a",
   chG:           "#72c98a",
   chB:           "#6aa3e3",

   // Radii (px)
   rXs:  5,
   rSm:  7,
   rMd:  8,
   rLg: 10,
   rXl: 14,

   // Spacing scale (px) - only these values may be used
   s1:  4, s2: 8, s3: 12, s4: 14, s5: 18, s6: 22, s7: 26,

   // Type
   fontUI:   "Inter, Segoe UI, sans-serif",
   fontMono: "JetBrains Mono, Consolas, monospace",
   tEyebrow: { size: 10, weight: 700, letterSpacing: 1.4, family: "fontUI" },
   tLabel:   { size: 10, weight: 600, letterSpacing: 1.2, family: "fontUI",   color: "textMuted" },
   tBody:    { size: 12, weight: 500, family: "fontUI" },
   tTitle:   { size: 14, weight: 700, letterSpacing: -0.2, family: "fontUI" },
   tMonoSm:  { size: 10, weight: 500, family: "fontMono" },
   tMonoMd:  { size: 11, weight: 500, family: "fontMono" },

   // Lazy-initialized Font cache (filled by optThemeFont on first use).
   fonts: null
};

// Resolve a token name into its Theme value. Hex strings pass through
// unchanged. Returns a safe fallback for unknown keys.
function optThemeColor(key) {
   if (!key) return "#ffffff";
   if (String(key).charAt(0) === "#") return key;
   return (Theme[key] !== undefined) ? Theme[key] : "#ffffff";
}

// Convert a Theme hex colour (or token name resolvable to one) into a
// CSS rgb()/rgba() string suitable for Qt styleSheet rules. Required
// because Qt's CSS parses 8-digit hex as #AARRGGBB, whereas our Theme
// stores values in CSS hex8 convention (#RRGGBBAA). Passing the raw
// Theme strings as styleSheet values would mis-render alpha colours
// (e.g. #ffffff1c would render as opaque yellow). Use this helper for
// every rule that involves a token containing an alpha channel.
function optThemeRgba(key) {
   var hex = optThemeColor(key);
   if (hex.charAt(0) === "#") hex = hex.substring(1);
   try {
      if (hex.length === 6) {
         var r6 = parseInt(hex.substring(0, 2), 16);
         var g6 = parseInt(hex.substring(2, 4), 16);
         var b6 = parseInt(hex.substring(4, 6), 16);
         return "rgb(" + r6 + ", " + g6 + ", " + b6 + ")";
      }
      if (hex.length === 8) {
         var rr = parseInt(hex.substring(0, 2), 16);
         var gg = parseInt(hex.substring(2, 4), 16);
         var bb = parseInt(hex.substring(4, 6), 16);
         var aa = parseInt(hex.substring(6, 8), 16);
         var alpha = (aa / 255).toFixed(3);
         return "rgba(" + rr + ", " + gg + ", " + bb + ", " + alpha + ")";
      }
   } catch (e) {}
   return "rgb(255, 255, 255)";
}

// Convert a Theme hex colour (or token name resolvable to one) into a
// 32-bit ARGB integer suitable for PJSR Brush/Pen/fill operations. Accepts
// #RRGGBB (assumed opaque) and #RRGGBBAA (alpha as the last 2 hex digits).
// Returns opaque white on parse error.
function optThemeColorInt(key) {
   var hex = optThemeColor(key);
   if (hex.charAt(0) === "#") hex = hex.substring(1);
   try {
      if (hex.length === 6)
         return (0xFF000000 | parseInt(hex, 16)) >>> 0;
      if (hex.length === 8) {
         var rr = parseInt(hex.substring(0, 2), 16);
         var gg = parseInt(hex.substring(2, 4), 16);
         var bb = parseInt(hex.substring(4, 6), 16);
         var aa = parseInt(hex.substring(6, 8), 16);
         return ((aa << 24) | (rr << 16) | (gg << 8) | bb) >>> 0;
      }
   } catch (e) {}
   return 0xFFFFFFFF;
}

// Return a PJSR Font matching the given type token (tEyebrow, tBody, etc.).
// Fonts are cached. The PJSR Font class does not expose letterSpacing, so the
// token's letterSpacing field is documented but not yet applied; we will
// compensate visually with explicit spacing in the layouts that need it.
function optThemeFont(typeKey) {
   if (!Theme.fonts) Theme.fonts = {};
   if (Theme.fonts[typeKey]) return Theme.fonts[typeKey];
   var t = Theme[typeKey];
   if (!t) return null;
   var family = (t.family === "fontMono") ? Theme.fontMono : Theme.fontUI;
   var f = null;
   try {
      f = new Font(family);
      try { f.pixelSize = t.size; } catch (e1) {
         try { f.pointSize = t.size; } catch (e2) {}
      }
      try { f.bold = (t.weight >= 700); } catch (e3) {}
   } catch (e0) {
      f = null;
   }
   Theme.fonts[typeKey] = f;
   return f;
}

// Generates a Qt-compatible styleSheet for a component+variant pair. Phase 1
// ships only the smallest catalogue needed by the tokens themselves; later
// phases extend this switch with cards, pills, segmented, etc. Returns an
// empty string for unknown components so callers can safely no-op.
function optThemeStyleSheet(component, variant) {
   variant = variant || "default";
   switch (component) {
      case "card":
         return "background-color: " + Theme.surface +
                "; border: 1px solid " + optThemeRgba("border") +
                "; border-radius: " + Theme.rXl + "px;";
      case "chip-active":
         return "background-color: " + optThemeRgba("amberSoft") +
                "; border: 1px solid " + optThemeRgba("amberRing") +
                "; border-radius: " + Theme.rSm + "px;" +
                " color: " + Theme.amber + ";";
      case "chip-neutral":
         return "background-color: " + Theme.surfaceRaised +
                "; border: 1px solid " + optThemeRgba("border") +
                "; border-radius: " + Theme.rSm + "px;" +
                " color: " + Theme.text + ";";
      default:
         return "";
   }
}

// Convenience: apply a Theme component styleSheet onto a widget. Silent no-op
// on widgets that refuse styleSheets (some PJSR widgets ignore them).
function optApplyStyle(widget, component, variant) {
   if (!widget) return;
   try { widget.styleSheet = optThemeStyleSheet(component, variant); } catch (e) {}
}
// ----------------------------------------------------------------------------
// <<< THEME — Phase 1 ends here >>>
// ============================================================================

var OPT6D_TOOLTIP_APPLIED_CONTROLS = [];

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
   "QPushButton:hover { background-color:" + OPT_UI.bgPanelAlt + "; color:" + OPT_UI.text + "; border:1px solid " + OPT_UI.borderStrong + "; background-image:none; }" +
   "QPushButton:disabled { background-color:" + OPT_UI.bgPanel + "; color:" + OPT_UI.textMute + "; border:1px solid " + OPT_UI.border + "; background-image:none; }";

var OPT_CSS_MODE_OFF =
   "QPushButton { background-color:" + OPT_UI.bgInset + "; color:" + OPT_UI.textDim + "; border:1px solid " + OPT_UI.border + "; border-radius:" + OPT_UI.radius + "; padding:4px 14px; font-weight:500; background-image:none; }" +
   "QPushButton:hover { background-color:" + OPT_UI.bgInset + "; color:" + OPT_UI.text + "; border:1px solid " + OPT_UI.border + "; background-image:none; }" +
   "QPushButton:disabled { background-color:" + OPT_UI.bgPanel + "; color:" + OPT_UI.textMute + "; border:1px solid " + OPT_UI.border + "; background-image:none; }";

var OPT_CSS_PRIMARY =
   "QPushButton { background-color:" + OPT_UI.primary + "; color:" + OPT_UI.bg + "; border:1px solid " + OPT_UI.primary + "; border-radius:" + OPT_UI.radius + "; padding:6px 14px; font-weight:600; background-image:none; }" +
   "QPushButton:hover { background-color:" + OPT_UI.primaryHover + "; color:" + OPT_UI.bg + "; border:1px solid " + OPT_UI.primaryHover + "; background-image:none; }" +
   "QPushButton:pressed { background-color:" + OPT_UI.text + "; color:" + OPT_UI.bg + "; border:1px solid " + OPT_UI.text + "; background-image:none; }" +
   "QPushButton:disabled { background-color:" + OPT_UI.bgPanel + "; color:" + OPT_UI.textMute + "; border:1px solid " + OPT_UI.border + "; background-image:none; }";

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
   "QPushButton { background-color:" + OPT_UI.bg + "; color:" + OPT_UI.textDim + "; border:1px solid " + OPT_UI.borderStrong + "; border-radius:3px; padding:1px 0px; font-size:6pt; min-height:14px; max-height:18px; text-align:center; background-image:none; }" +
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


function optShowThanksDialog(parent) {
   // Plan B (2026-05-21): the previous implementation built a modal Dialog
   // with a TextBox showing the regex-extracted section 13 slice. On this
   // PJSR build the rich-text TextBox kept the visible scroll at the
   // bottom regardless of position resets (immediate, deferred via Timer,
   // or via focus()), so the user always landed on the references list
   // rather than on the section title. The system browser respects file
   // URL fragments natively, so we delegate to it via the shared helper.
   optOpenHelpAtAnchor("sec-13");
}

function optShowRecommendedRepositoriesDialog(parent) {
   // Plan B (2026-05-21): see optShowThanksDialog for the rationale.
   // Section 3.1 is even longer than section 13 (it includes the process
   // icons table), which made the bottom-anchored scroll especially
   // disorientating. Delegating to the system browser ensures the user
   // lands on the section heading and can scroll forward naturally.
   optOpenHelpAtAnchor("sec-3-1");
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

// Every workflow key whose record currently holds a valid View, regardless
// of the per-tab availability flags. Channel Combination uses this so any
// loaded image — not just images explicitly promoted through Pre → Stretch
// → Post — can be picked as a slot source.
OptImageStore.prototype.keysWithValidView = function() {
   var out = [];
   var keys = optAllWorkflowKeys();
   for (var i = 0; i < keys.length; ++i) {
      var rec = this.record(keys[i]);
      if (optSafeView(rec.view))
         out.push(keys[i]);
   }
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
       // PRISM-INTEGRATION-BEGIN
       info.algorithm = nrIdx === 0 ? "NXT" : (nrIdx === 1 ? "TGV" : (nrIdx === 2 ? "CC" : (nrIdx === 3 ? "GraX" : "Prism")));
       info.signature = "nr" + nrIdx + "|" + optMemoryJoinSignature([
          dlg.ncPostNxtDenoise, dlg.ncPostNxtIter, dlg.chkPostNxtColorSep, dlg.chkPostNxtFreqSep, dlg.ncPostNxtDenoiseColor,
          dlg.ncPostTgvStrengthL, dlg.ncPostTgvStrengthC, dlg.ncPostTgvEdge, dlg.ncPostTgvSmooth, dlg.ncPostTgvIter,
          dlg.comboPostCCDenoiseMode.combo, dlg.comboPostCCDenoiseModel.combo, dlg.ncPostCCNRLuma, dlg.ncPostCCNRColor, dlg.chkPostCCNRRemoveAb,
          dlg.chkPostNRUseMask,
          dlg.ncPostPrismStrength, dlg.ncPostPrismTileSize, dlg.ncPostPrismOverlap, dlg.ncPostPrismPad,
          dlg.chkPostPrismUseAMP, dlg.comboPostPrismAMPDType, dlg.chkPostPrismUseCPU, dlg.chkPostPrismNoDML
       ]);
       // PRISM-INTEGRATION-END
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
   // ===== COMPARE-BEGIN — companion view for Star Split compare slots =====
   // Star Split Compare stores the starless in slot.view and the matching
   // stars layer in slot.companionView so a later "Use this Image" can
   // commit both at once without re-running the engine.
   if (slot.companionOwned)
      optCloseViews([slot.companionView]);
   // ===== COMPARE-END =====
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
         // Phase 4d: themed memory slot (empty variant).
         optThemeApplyMemorySlot(this.buttons[i], false);
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

OptMemoryManager.prototype.store = function(index, key, view, meta, gradientView, companionView) {
   if (index < 0 || index >= this.slots.length || !optSafeView(view))
      return;
   optReleaseOwnedSlotViews(this.slots[index]);
   var clone = optMemoryCloneView(view, "Opt_Memory", key, index);
   var gradClone = optMemoryCloneView(gradientView, "Opt_MemoryGradient", key, index);
   // Optional 6th argument (added for Star Split Compare in v138 Phase 2).
   // When present, it is cloned and stored as slot.companionView; the
   // setToCurrent memory branch then commits both view and companionView
   // as the Starless and Stars stage outputs respectively.
   var compClone = optMemoryCloneView(companionView, "Opt_MemoryCompanion", key, index);
   var slotMeta = meta || { image: optLabelForKey(key), menu: "M", algorithm: "IMG", signature: "IMG" };
   slotMeta.number = this.numberForSignature(slotMeta.signature);
   slotMeta.label = (slotMeta.image || optLabelForKey(key)) + " " + slotMeta.menu + " " + slotMeta.algorithm + " " + slotMeta.number;
   this.slots[index] = {
      key: key, view: clone, owned: true,
      gradientView: gradClone, gradientOwned: optSafeView(gradClone),
      companionView: compClone, companionOwned: optSafeView(compClone),
      meta: slotMeta
   };
   optTouchSlot(this.slots[index]);
   if (this.buttons[index]) {
      // Phase 4d: slot button shows only its number for the 22x22 chip; the
      // full slot label is surfaced via the toolTip.
      this.buttons[index].text = "" + (index + 1);
      this.buttons[index].toolTip = "Memory " + (index + 1) + ": " + slotMeta.label;
      optThemeApplyMemorySlot(this.buttons[index], true);
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

// Simplified mask memory manager (v33-opt-9m). Mirrors the image memory
// manager flow as closely as possible:
//   - Left-click slot  → storeAt(N, postActiveMask)
//   - Right-click slot → select(N) + activate (caller calls
//                        optSetActivePostMaskFromMemory)
//   - Single store path (storeAt) — no auto-find-empty heuristic, no
//     shared-vs-owned branching, no per-signature label counter.
// Earlier the class had storeNext / storeNextShared / preserveSharedView /
// numberForSignature methods plus signatureNumbers / nextSignatureNumber
// fields — all dead code as of v33-opt-9k (no remaining callers).
function OptMaskMemoryManager(slotCount) {
   this.slots = [];
   for (var i = 0; i < slotCount; ++i)
      this.slots.push(null);
   this.buttonSets = [];
   this.selectedIndex = -1;
}

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
         // Phase 6.10: themed mask memory slot. Always show the slot
         // number; the slot label travels via the toolTip so the 22 px
         // chip stays uniform. Filled and selected both render as the
         // amber "active" variant; the selected one is the most recent
         // recall and is distinguishable via the tool-tip + the
         // pane's preview swap.
         if (slot && optSafeView(slot.view)) {
            b.text = "" + (i + 1);
            b.toolTip = "Mask memory " + (i + 1) + ": " + slot.label;
            optThemeApplyMemorySlot(b, true);
         } else {
            b.text = "" + (i + 1);
            b.toolTip = "Empty mask memory slot";
            optThemeApplyMemorySlot(b, false);
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

OptMaskMemoryManager.prototype.storeAt = function(index, view, meta) {
   if (index < 0 || index >= this.slots.length || !optSafeView(view))
      return -1;
   optReleaseOwnedSlotViews(this.slots[index]);
   var m = meta || { code: "MASK" };
   var clone = optMemoryCloneView(view, "Opt_MaskMemory", m.code || "Mask", index);
   this.slots[index] = { view: clone, owned: true, label: (m.code || "MASK") + " " + (index + 1), meta: m };
   optTouchSlot(this.slots[index]);
   this.selectedIndex = index;
   this.refreshButtons();
   return index;
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
   this.refreshButtons();
};

function OptPreviewControl(parent) {
   this.__base__ = ScrollBox;
   this.__base__(parent);
   this.bitmap = null;
   this._paintCropBitmap = null;
   this._paintCropW = 0;
   this._paintCropH = 0;
   // >>> SPLIT COMPARE BEGIN >>>
   this.isSplitMode = false;
   this.splitFraction = 0.5;
   this.compareBitmap = null;
   this._paintCropCompareBitmap = null;
   this._paintCropCompareW = 0;
   this._paintCropCompareH = 0;
   this.isDraggingSplit = false;
   // <<< SPLIT COMPARE END <<<
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
      // >>> SPLIT COMPARE BEGIN >>>
      if (this._paintCropCompareBitmap) {
         try { this._paintCropCompareBitmap.clear(); } catch (eCompare) {}
      }
      this._paintCropCompareBitmap = null;
      this._paintCropCompareW = 0;
      this._paintCropCompareH = 0;
      // <<< SPLIT COMPARE END <<<
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
      // v33-opt-9o: capture old dimensions BEFORE oldBitmap.clear() — some
      // PJSR builds invalidate width/height after clear(), defeating the
      // rescale logic in the fit=false branch.
      var oldBitmapWidth  = (oldBitmap && oldBitmap.width  > 0) ? oldBitmap.width  : 0;
      var oldBitmapHeight = (oldBitmap && oldBitmap.height > 0) ? oldBitmap.height : 0;
      var wasFitMode = this.isFitMode === true;
      var savedCenterX = 0.5;
      var savedCenterY = 0.5;
      if (oldBitmapWidth > 0 && oldScale > 0) {
         savedCenterX = ((saved.x / oldScale) + (this.viewport.width / (2 * oldScale))) / Math.max(1, oldBitmapWidth);
         savedCenterY = ((saved.y / oldScale) + (this.viewport.height / (2 * oldScale))) / Math.max(1, oldBitmapHeight);
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
         // v33-opt-9o (strengthened from v33-opt-9n): when the bitmap is
         // swapped to a different-size one (typical of live-preview pipeline
         // changes — Masking live mask bitmap vs Curves live candidate
         // bitmap), the apparent size of the displayed source shifts unless
         // we adjust either the scale (for manual-zoom users) or refit (for
         // fit-mode users). Without this the image collapses to a tiny
         // rectangle in the upper-left corner of the viewport.
         //
         // Behaviour:
         //   - User was in fit-mode (didn't manually zoom): refit the new
         //     bitmap to the window so it fills the viewport again.
         //   - User had manually zoomed: keep their zoom intention by
         //     rescaling (scale * bitmap.width = constant) so the displayed
         //     source-pixel size stays the same across the swap.
         //
         // Uses oldBitmapWidth captured at function entry (before clear()).
         var widthChanged = oldBitmapWidth > 0 && bitmap.width > 0 &&
                            oldBitmapWidth !== bitmap.width;
         if (widthChanged && wasFitMode) {
            this.fitToWindow();
            return;
         }
         if (widthChanged) {
            var widthRatio = oldBitmapWidth / bitmap.width;
            this.scale = Math.max(0.05, Math.min(this.scale * widthRatio, 40.0));
         }
         this.updateScrollBars();
         if (oldBitmapWidth > 0 && bitmap && oldScale > 0) {
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
       var ctrl = this.parent;
       if (ctrl.bitmap) {
          try {
             var sc = ctrl.scale;
             var sx = ctrl.scrollPosition.x;
             var sy = ctrl.scrollPosition.y;

             // >>> SPLIT COMPARE BEGIN >>>
             var drawBmp = function(targetBmp, cropCacheName) {
                var srcX = Math.max(0, Math.floor(sx / sc));
                var srcY = Math.max(0, Math.floor(sy / sc));
                var srcW = Math.min(targetBmp.width - srcX, Math.ceil(this.width / sc) + 2);
                var srcH = Math.min(targetBmp.height - srcY, Math.ceil(this.height / sc) + 2);
                if (srcW > 0 && srcH > 0) {
                   var crop = ctrl[cropCacheName];
                   if (!crop || ctrl[cropCacheName + "W"] !== srcW || ctrl[cropCacheName + "H"] !== srcH) {
                      if (crop) {
                         try { crop.clear(); } catch (e) {}
                      }
                      crop = new Bitmap(srcW, srcH);
                      ctrl[cropCacheName] = crop;
                      ctrl[cropCacheName + "W"] = srcW;
                      ctrl[cropCacheName + "H"] = srcH;
                   }
                   var gcrop = new Graphics(crop);
                   try {
                      gcrop.drawBitmap(-srcX, -srcY, targetBmp);
                      try { g.smoothInterpolation = true; } catch (eSmooth) {}
                      g.drawScaledBitmap(-(sx % sc), -(sy % sc), srcW * sc, srcH * sc, crop);
                   } finally {
                      try { gcrop.end(); } catch (eGcrop) {}
                   }
                }
             }.bind(this);

             if (ctrl.isSplitMode && ctrl.compareBitmap) {
                var splitPos = Math.round(this.width * ctrl.splitFraction);

                // Left side: draw compareBitmap
                g.clipRect = new Rect(0, 0, splitPos, this.height);
                drawBmp(ctrl.compareBitmap, "_paintCropCompareBitmap");

                // Right side: draw active bitmap
                g.clipRect = new Rect(splitPos, 0, this.width, this.height);
                drawBmp(ctrl.bitmap, "_paintCropBitmap");

                // Restore clip
                g.clipRect = new Rect(0, 0, this.width, this.height);

                // Draw amber split line
                g.pen = new Pen(0xffd9a560, 2);
                g.drawLine(splitPos, 0, splitPos, this.height);

                // Draw circle handle indicator
                var handleY = Math.round(this.height / 2);
                var handleR = 12;
                g.brush = new Brush(0xff202020);
                g.pen = new Pen(0xffd9a560, 2);
                g.drawEllipse(splitPos - handleR, handleY - handleR, splitPos + handleR, handleY + handleR);

                // Draw arrows
                var font = new Font("Segoe UI");
                font.pixelSize = 10;
                font.bold = true;
                g.pen = new Pen(0xffd9a560);
                g.drawTextRect(new Rect(splitPos - handleR, handleY - handleR, splitPos + handleR, handleY + handleR), "\u25C0\u25B6", TextAlign_Center | TextAlign_VertCenter);
             } else {
                drawBmp(ctrl.bitmap, "_paintCropBitmap");
             }
             // <<< SPLIT COMPARE END >>>

             if (ctrl.onOverlayPaint)
                ctrl.onOverlayPaint(g, sc, sx, sy);
             ctrl.paintBusyOverlay(g);
          } catch (e0) {
          }
       } else {
          g.pen = new Pen(0xff808080);
          g.drawTextRect(new Rect(0, 0, this.width, this.height), "Select Image", TextAlign_Center);
          ctrl.paintBusyOverlay(g);
       }
       g.end();
    };

   this.viewport.onMousePress = function(x, y, button, buttons, modifiers) {
      var ctrl = this.parent;
      // >>> SPLIT COMPARE BEGIN >>>
      if (ctrl.isSplitMode && button === OPT_MOUSE_LEFT) {
         var splitPos = Math.round(this.width * ctrl.splitFraction);
         if (Math.abs(x - splitPos) <= 15) {
            ctrl.isDraggingSplit = true;
            this.cursor = new Cursor(StdCursor_SizeHor);
            return;
         }
      }
      // <<< SPLIT COMPARE END >>>
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
      // >>> SPLIT COMPARE BEGIN >>>
      if (ctrl.isDraggingSplit) {
         ctrl.splitFraction = Math.max(0.01, Math.min(0.99, x / this.width));
         this.repaint();
         return;
      }
      if (ctrl.isSplitMode && !ctrl.mousePressed) {
         var splitPos = Math.round(this.width * ctrl.splitFraction);
         if (Math.abs(x - splitPos) <= 15) {
            this.cursor = new Cursor(StdCursor_SizeHor);
         } else {
            this.cursor = new Cursor(StdCursor_OpenHand);
         }
      }
      // <<< SPLIT COMPARE END >>>
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
      // >>> SPLIT COMPARE BEGIN >>>
      if (ctrl.isDraggingSplit) {
         ctrl.isDraggingSplit = false;
         this.cursor = new Cursor(StdCursor_OpenHand);
         return;
      }
      // <<< SPLIT COMPARE END >>>
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
      if (delta === undefined || delta === 0 || isNaN(delta))
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
   l.textAlignment = TextAlign_Left | TextAlign_VertCenter;
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
   // Phase 4 polish: themed engine eyebrow — no surrounding card/border (the
   // left panel is already a card), Theme.amber colour, mono uppercase. The
   // previous styleSheet used 2 px letter-spacing on a 21-char string which
   // was clipped inside the 300 px left panel ("PRE PROCESSING ENGIN" was
   // missing its final E).
   var l = new Label(parent);
   l.text = text;
   l.textAlignment = TextAlign_Left | TextAlign_VertCenter;
   try {
      l.styleSheet =
         "QLabel {" +
         " color: " + Theme.amber + ";" +
         " background-color: transparent; border: 0px;" +
         " font-family: " + Theme.fontMono + ";" +
         " font-size: 8pt; font-weight: 700;" +
         " padding-top: 4px; padding-bottom: 4px;" +
         " padding-left: 2px; padding-right: 2px;" +
         "}";
   } catch (e) {}
   l.minHeight = 26;
   try { l.setFixedHeight(26); } catch (eH) {}
   optApplyTooltip(l, "title", text, "Section");
   return l;
}

function optNumeric(parent, labelText, min, max, value, precision, labelWidth) {
   var nc = new NumericControl(parent);
   nc.label.text = labelText;
   nc.label.textAlignment = TextAlign_Left | TextAlign_VertCenter;
   // Phase 6: cap labelWidth so old call-sites that asked for 150-170 px do
   // not starve the slider inside the 300 px left card. 100 px is a sweet
   // spot — wide enough for words like "Shadows", "Boost clip", "Smooth"
   // without their tail getting clipped, narrow enough to leave the slider
   // a usable track (~100 px) after the value chip.
   if (labelWidth) {
      var cappedW = Math.min(labelWidth, 100);
      nc.label.minWidth = cappedW;
      try { nc.label.maxWidth = cappedW; } catch (eMW) {}
      try { nc.adjustToContents(); } catch (eAC) {}
   }
   nc.setRange(min, max);
   nc.setPrecision(precision || 0);
   try {
      if (min >= 0 && max <= 1.0)
         nc.slider.setRange(Math.round(min * 100), Math.round(max * 100));
   } catch (e0) {}
   nc.setValue(value);
   try { nc.label.styleSheet = "QLabel { border:1px solid transparent; }"; } catch (e1) {}
   // Phase 6: auto-theme every NumericControl so callers that have not been
   // updated yet still get the amber-tinted slider, themed edit chip and
   // themed label. Idempotent on Phase 5 callers that already invoke
   // optThemeApplyNumericControl explicitly.
   try { optThemeApplyNumericControl(nc); } catch (e2) {}
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
   row.sizer.spacing = Theme.s2;       // Phase 6: tighter spacing
   // Phase 6: cap label width so the combo gets enough room inside the
   // 300 px left card. 100 px matches the optNumeric label cap.
   var cappedW = width ? Math.min(width, 100) : 100;
   var label = optLabel(row, labelText, cappedW);
   try { label.maxWidth = cappedW; } catch (eW) {}
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
   // Phase 6: auto-theme so legacy callers get the new look.
   try { optThemeApplyChannelComboStyle(combo); } catch (e3) {}
   try { optThemeApplyNumericLabel(label); } catch (e4) {}
   return { row: row, label: label, combo: combo };
}

function optInnerGroup(parent, title) {
   // Phase 6: redirect to the themed subcard. Every Stretching / Post
   // Processing / Channel Combination module that wrapped its parameters
   // in optInnerGroup(parent, "Foo Settings") now gets the new look:
   // surface bg, hairline border, rounded radius, uppercase mono header.
   // Callers continue to use .sizer.add(...) and .visible exactly the
   // same way; the QGroupBox native title is replaced by a Label header
   // inside the sizer.
   var card = optThemeBuildSubcard(parent, title);
   try { optApplyTooltip(card, "group", title, "Section"); } catch (e) {}
   return card;
}

// ============================================================================
// >>> SECTION BAR — Phase 5 — easy-rollback block <<<
// ----------------------------------------------------------------------------
// Rebuilds the section-header / body widget pair (used by Image Selection,
// Crop, Plate Solving, Gradient Correction, Color Calibration, Deconvolution,
// Star Split, and every other collapsible block) per DESIGN_SPEC §2.9.
//
// New visual:
//
//   [toggle bitmap] [Title]                                              [chevron]
//
// - toggle: a 26×15 Bitmap painted with a rounded track + circular thumb;
//   visually "on" when expanded, "off" when collapsed. Decorative — the
//   toggle does NOT add a separate on/off state to the section model.
// - title: text 10 pt / 500, color text.
// - chevron: a single glyph (▸ collapsed, ▾ expanded) in textDim 12 pt.
// - whole header is clickable; toggling cycles through expand / collapse.
// - when expanded, the header bg is amberSoft and the border is amberRing;
//   when collapsed both are transparent so the section reads as quiet.
//
// To revert: delete this block and restore the previous optSection from git.
// ============================================================================

function optThemeBuildToggleBitmap(isOn) {
   var bm = new Bitmap(26, 15);
   bm.fill(0);
   try {
      var g = new Graphics(bm);
      try {
         g.antialiasing = true;
         g.pen = new Pen(0x00000000, 1);          // no outline on the track
         // Off-state track uses textDim (#52525c) instead of surfaceRaised so
         // it stands out against the surface bg of the card; spec's
         // surfaceRaised was visually invisible at this size.
         g.brush = new Brush(isOn ? optThemeColorInt("amber")
                                  : optThemeColorInt("textDim"));
         g.drawRoundedRect(0, 0, 25, 14, 7, 7);
         var thumbX = isOn ? 13 : 2;
         var thumbY = 2;
         var thumbInt = isOn ? 0xFF15110A : optThemeColorInt("text");
         g.brush = new Brush(thumbInt);
         g.drawEllipse(thumbX, thumbY, thumbX + 10, thumbY + 10);
      } finally { g.end(); }
   } catch (e) {}
   return bm;
}

function optSection(parent, title) {
   // ------------------------------------------------------------------
   // Phase 5 v2: single-Frame painted header.
   //
   // The previous implementation built the header with a Control as the
   // container plus three child widgets (toggle Control, title Label,
   // chevron Label). PJSR's Control did not reliably fire onMousePress
   // and stretched Labels only registered clicks on their text glyph
   // area, so users reported that only the chevron at the far right
   // actually flipped the section. The multi-widget styleSheet swaps
   // also made open/close feel sluggish.
   //
   // This rewrite collapses the entire header into ONE Frame whose
   // onPaint draws the bg + border, toggle bitmap, title text and
   // chevron in a single pass. A single onMousePress on that Frame is
   // therefore guaranteed to fire anywhere inside the row. Repaints
   // happen via Frame.update() instead of styleSheet reassignment.
   // ------------------------------------------------------------------

   var header = new Frame(parent);
   header.minHeight = 44;
   header.maxHeight = 44;
   header.expanded = true;
   try {
      // Suppress Frame's native border so our painted rect is the only
      // border visible. The actual look comes from onPaint below.
      header.frameStyle = FrameStyle_Flat;
      header.styleSheet =
         "QFrame { background-color: transparent; border: 0px; }";
   } catch (eH0) {}

   // Body: vertical sizer hosted in a separate Control underneath. Phase 6:
   // apply the amber-tinted module-body styling here so EVERY section across
   // every tab gets the new look without having to touch each module's build
   // function. The Phase 5 modules that already call optThemeApplyModuleBody
   // are now redundant but harmless.
   var body = new Control(parent);
   body.sizer = new VerticalSizer();
   body.sizer.margin = Theme.s2;       // 8 px interior padding
   body.sizer.spacing = Theme.s2;
   try { optThemeApplyModuleBody(body); } catch (eB) {}

   // Cached resources for onPaint.
   var toggleBmOn  = null, toggleBmOff = null;
   try { toggleBmOn  = optThemeBuildToggleBitmap(true);  } catch (eOn)  {}
   try { toggleBmOff = optThemeBuildToggleBitmap(false); } catch (eOff) {}

   // Section header title: 15 px regular per user feedback (bold at 14 px
   // read too heavy; 13 px regular read too thin). 15 px regular sits in
   // the sweet spot between the two iterations.
   var titleFont = new Font("Segoe UI");
   try { titleFont.pixelSize = 15; } catch (eFs) {
      try { titleFont.pointSize = 11; } catch (eFs2) {}
   }
   try { titleFont.bold = false; } catch (eFb) {}

   var chevronFont = new Font("Segoe UI Symbol");
   try { chevronFont.pixelSize = 13; } catch (eCf) {
      try { chevronFont.pointSize = 10; } catch (eCf2) {}
   }
   try { chevronFont.bold = true; } catch (eCb) {}

   var section = { bar: header, body: body, expanded: true, title: title };
   header.body = body;

   // Tooltip plumbing preserved.
   var sectionTip = optTooltipFor("section", title, "Section");
   if (sectionTip && sectionTip.length > 0) {
      try { header.toolTip = sectionTip; } catch (eT0) {}
      try { body.toolTip   = sectionTip; } catch (eT2) {}
   }

   header.onPaint = function() {
      var g = new Graphics(this);
      try {
         g.antialiasing = true;
         var w = this.width;
         var h = this.height;

         // Background + border. amberSoft / amberRing are alpha-encoded
         // ARGB ints, so Qt blends them against the parent's bg.
         if (header.expanded) {
            g.brush = new Brush(optThemeColorInt("amberSoft"));
            g.pen   = new Pen(optThemeColorInt("amberRing"), 1);
            g.drawRoundedRect(0, 0, w - 1, h - 1, Theme.rLg, Theme.rLg);
         }
         // (Collapsed: no bg drawn — the section reads as a quiet row.)

         // Toggle bitmap on the left, vertically centred.
         var bm = header.expanded ? toggleBmOn : toggleBmOff;
         if (bm) {
            var bmY = Math.round((h - 15) / 2);
            g.drawBitmap(10, bmY, bm);
         }

         // Title text, just after the toggle.
         g.font = titleFont;
         g.pen  = new Pen(optThemeColorInt("text"));
         g.drawText(46, Math.round(h / 2 + 5), title);

         // Chevron on the right.
         g.font = chevronFont;
         g.pen  = new Pen(optThemeColorInt("textDim"));
         g.drawText(w - 22, Math.round(h / 2 + 5),
                    header.expanded ? "▾" : "▸");
      } finally {
         g.end();
      }
   };

   header.setExpanded = function(expanded) {
      header.expanded = expanded === true;
      section.expanded = header.expanded;
      body.visible = header.expanded;
      try { header.update(); } catch (eU) {}
   };

   header.onMousePress = function() {
      header.setExpanded(!header.expanded);
   };

   try { header.cursor = new Cursor(StdCursor_PointingHand); } catch (eCur) {}

   section.setExpanded = function(expanded) {
      header.setExpanded(expanded);
   };

   // Initial paint kicks in lazily from PJSR — no eager invalidation needed.
   return section;
}
// ----------------------------------------------------------------------------
// <<< SECTION BAR — Phase 5 ends here >>>
// ============================================================================


// ============================================================================
// >>> MEMORY BANK — Phase 4d — easy-rollback block <<<
// ----------------------------------------------------------------------------
// Styles the "Memory: 1 2 3 4 5 6 7 8  Reset" row above the preview, per
// DESIGN_SPEC §2.11. Layout:
//
//   MEMORY   [ 1 │ 2 │ 3 │ 4 │ 5 │ 6 │ 7 │ 8 ]   [RESET]
//
// - The label is uppercase, mono, textMuted (tLabel-ish).
// - The 8 slot buttons sit inside a dark rounded container (bg Theme.bg,
//   border, rMd radius). Each slot is 22×22, rounded 5, mono 9pt.
//   Filled slots flip to the amber chip variant.
// - Reset is a "ghost" button: transparent bg, hairline border, mono
//   uppercase, textMuted.
// To revert: delete this block, restore the original OPT_CSS_MEMORY_EMPTY
// / OPT_CSS_MEMORY_FILLED references and the optButton(... 82) widths.
// ============================================================================

function optThemeApplyMemoryLabel(label) {
   if (!label) return;
   try {
      label.styleSheet =
         "QLabel {" +
         " color: " + Theme.textMuted + ";" +
         " background-color: transparent; border: 0px;" +
         " font-family: " + Theme.fontMono + ";" +
         " font-size: 8pt; font-weight: 600;" +
         "}";
   } catch (e) {}
}

function optThemeApplyMemoryContainer(widget) {
   if (!widget) return;
   try {
      widget.styleSheet =
         "QWidget {" +
         " background-color: " + Theme.bg + ";" +
         " border: 1px solid " + optThemeRgba("border") + ";" +
         " border-radius: " + Theme.rMd + "px;" +
         "}";
   } catch (e) {}
}

function optThemeApplyMemorySlot(btn, isFilled) {
   if (!btn) return;
   try {
      btn.minWidth = 22;  btn.maxWidth = 22;
      btn.minHeight = 22; btn.maxHeight = 22;
      if (isFilled) {
         btn.styleSheet =
            "QPushButton {" +
            " background-color: " + optThemeRgba("amberSoft") + ";" +
            " color: " + Theme.amber + ";" +
            " border: 1px solid " + optThemeRgba("amberRing") + ";" +
            " border-radius: 5px; padding: 0px;" +
            " font-family: " + Theme.fontMono + ";" +
            " font-size: 9pt; font-weight: 700;" +
            " outline: none;" +
            "}" +
            "QPushButton:hover { background-color: " + optThemeRgba("amberSoft") +
            "; color: " + Theme.amber + "; }" +
            "QPushButton:focus { outline: none; }";
      } else {
         btn.styleSheet =
            "QPushButton {" +
            " background-color: transparent;" +
            " color: " + Theme.textMuted + ";" +
            " border: 1px solid transparent;" +
            " border-radius: 5px; padding: 0px;" +
            " font-family: " + Theme.fontMono + ";" +
            " font-size: 9pt; font-weight: 600;" +
            " outline: none;" +
            "}" +
            "QPushButton:hover { background-color: " + optThemeRgba("borderStrong") +
            "; color: " + Theme.text + "; }" +
            "QPushButton:focus { outline: none; }";
      }
   } catch (e) {}
}

function optThemeApplyMemoryReset(btn) {
   if (!btn) return;
   try {
      btn.minHeight = 28; btn.maxHeight = 28;
      btn.styleSheet =
         "QPushButton {" +
         " background-color: transparent;" +
         " color: " + Theme.textMuted + ";" +
         " border: 1px solid " + optThemeRgba("border") + ";" +
         " border-radius: " + Theme.rMd + "px;" +
         " padding-left: 12px; padding-right: 12px;" +
         " font-family: " + Theme.fontMono + ";" +
         " font-size: 9pt; font-weight: 600;" +
         " outline: none;" +
         "}" +
         "QPushButton:hover { background-color: " + Theme.surfaceHover +
         "; color: " + Theme.text + "; }" +
         "QPushButton:focus { outline: none; }";
   } catch (e) {}
}
// ----------------------------------------------------------------------------
// <<< MEMORY BANK — Phase 4d ends here >>>
// ============================================================================


// ============================================================================
// >>> ACTION BUTTONS — Phase 4e — easy-rollback block <<<
// ----------------------------------------------------------------------------
// Styles the preview-pane action buttons per DESIGN_SPEC §2.12:
//   - Toggle / Export / Export TIF (and similar): surfaceRaised bg, hairline
//     border, rMd radius, padding 0/13, height 30, tBody text.
//   - Use this Image: a "primary commit" variant of the same shape. It
//     flips between two visual states:
//       * READY  — amberSoft bg, amberRing border, amber text. Says
//         "you have a candidate; click to promote it to Current".
//       * APPLIED — transparent bg, success-green text, success-green
//         border. Says "already promoted; nothing to do here".
// To revert: delete this block and restore the original OPT_CSS_MODE_OFF /
// OPT_CSS_SET_CURRENT / OPT_CSS_SET_CURRENT_APPLIED assignments.
// ============================================================================

function optThemeApplyActionButton(btn) {
   if (!btn) return;
   try {
      btn.minHeight = 30; btn.maxHeight = 30;
      btn.styleSheet =
         "QPushButton {" +
         " background-color: " + Theme.surfaceRaised + ";" +
         " color: " + Theme.text + ";" +
         " border: 1px solid " + optThemeRgba("border") + ";" +
         " border-radius: " + Theme.rMd + "px;" +
         " padding-top: 0px; padding-bottom: 0px;" +
         " padding-left: 13px; padding-right: 13px;" +
         " font-size: 9pt; font-weight: 500;" +
         " outline: none;" +
         "}" +
         "QPushButton:hover { background-color: " + Theme.surfaceHover +
         "; color: " + Theme.text + "; }" +
         "QPushButton:disabled { color: " + Theme.textDim + "; }" +
         "QPushButton:focus { outline: none; }";
   } catch (e) {}
}

function optThemeApplyPrimaryActionButton(btn, isApplied) {
   if (!btn) return;
   // Use this Image: two visual states (READY -> ámbar, APPLIED -> green).
   try {
      btn.minHeight = 30; btn.maxHeight = 30;
      if (isApplied) {
         btn.styleSheet =
            "QPushButton {" +
            " background-color: transparent;" +
            " color: #6dbf7a;" +              // success green (text)
            " border: 1px solid #6dbf7a40;" + // success green at 25% (border)
            " border-radius: " + Theme.rMd + "px;" +
            " padding-top: 0px; padding-bottom: 0px;" +
            " padding-left: 13px; padding-right: 13px;" +
            " font-size: 9pt; font-weight: 600;" +
            " outline: none;" +
            "}" +
            "QPushButton:hover { background-color: #6dbf7a14; }" +
            "QPushButton:disabled { color: " + Theme.textDim +
            "; border-color: " + optThemeRgba("border") + "; }" +
            "QPushButton:focus { outline: none; }";
      } else {
         btn.styleSheet =
            "QPushButton {" +
            " background-color: " + optThemeRgba("amberSoft") + ";" +
            " color: " + Theme.amber + ";" +
            " border: 1px solid " + optThemeRgba("amberRing") + ";" +
            " border-radius: " + Theme.rMd + "px;" +
            " padding-top: 0px; padding-bottom: 0px;" +
            " padding-left: 13px; padding-right: 13px;" +
            " font-size: 9pt; font-weight: 600;" +
            " outline: none;" +
            "}" +
            "QPushButton:hover { background-color: " + optThemeRgba("amberSoft") +
            "; color: " + Theme.amber + "; }" +
            "QPushButton:disabled {" +
            " background-color: transparent;" +
            " color: " + Theme.textDim + ";" +
            " border-color: " + optThemeRgba("border") + "; }" +
            "QPushButton:focus { outline: none; }";
      }
   } catch (e) {}
}
// ----------------------------------------------------------------------------
// <<< ACTION BUTTONS — Phase 4e ends here >>>
// ============================================================================


// ============================================================================
// >>> STATUS CHIPS — Phase 4f — easy-rollback block <<<
// ----------------------------------------------------------------------------
// Styles the preview-pane status indicators per DESIGN_SPEC §2.13:
//   - Path chips: the [R+G+B], [H+O+S], [RGB], etc. workflow-key buttons
//     that appear above the memory bank to show which canonical path is
//     active. Rendered as fully-rounded amber pills (radius 999, bg
//     amberSoft, border amberRing, amber mono text).
//   - Status label: the "Current: ... | Preview: ..." rich-text line under
//     the action button row. Theme-coloured but keeps the rich-text body
//     intact (every callsite that re-renders this label keeps working).
// To revert: delete this block and restore the OPT_CSS_MODE_OFF / OPT_CSS_*
// styleSheet assignments on this.pathButtons[*] and this.status.
// ============================================================================

function optThemeApplyPathChip(btn, state) {
   if (!btn) return;
   // state is one of:
   //   "active" — current path (amber-filled pill)
   //   "done"   — visible path that has been processed (neutral surface pill)
   //   "off"    — visible path with no work yet (transparent ghost pill)
   var s = state || "off";
   try {
      btn.minHeight = 26; btn.maxHeight = 26;
      var bg, color, border, weight, hoverBg;
      if (s === "active") {
         bg     = optThemeRgba("amberSoft");
         color  = Theme.amber;
         border = optThemeRgba("amberRing");
         weight = "700";
         hoverBg = optThemeRgba("amberSoft");
      } else if (s === "done") {
         bg     = Theme.surfaceRaised;
         color  = Theme.text;
         border = optThemeRgba("border");
         weight = "500";
         hoverBg = Theme.surfaceHover;
      } else {
         bg     = "transparent";
         color  = Theme.textDim;
         border = optThemeRgba("border");
         weight = "500";
         hoverBg = optThemeRgba("borderStrong");
      }
      btn.styleSheet =
         "QPushButton {" +
         " background-color: " + bg + ";" +
         " color: " + color + ";" +
         " border: 1px solid " + border + ";" +
         " border-radius: 13px;" +
         " padding-top: 0px; padding-bottom: 0px;" +
         " padding-left: 11px; padding-right: 11px;" +
         " font-family: " + Theme.fontMono + ";" +
         " font-size: 9pt; font-weight: " + weight + ";" +
         " outline: none;" +
         "}" +
         "QPushButton:hover { background-color: " + hoverBg + "; }" +
         "QPushButton:focus { outline: none; }";
   } catch (e) {}
}

function optThemeApplyStatusLabel(label) {
   if (!label) return;
   try {
      label.wordWrap = true;
      label.styleSheet =
         "QLabel {" +
         " color: " + Theme.textMuted + ";" +
         " background-color: transparent; border: 0px;" +
         " font-family: " + Theme.fontMono + ";" +
         " font-size: 9pt;" +
         " padding-top: 4px; padding-bottom: 4px;" +
         "}";
   } catch (e) {}
}
// ----------------------------------------------------------------------------
// <<< STATUS CHIPS — Phase 4f ends here >>>
// ============================================================================


// ============================================================================
// >>> ZOOM CONTROLS — Phase 4g — easy-rollback block <<<
// ----------------------------------------------------------------------------
// Styles the Zoom and Preview-Resolution controls in the preview toolbar
// per DESIGN_SPEC §2.14. Each becomes a "mini-card":
//
//   ┌─────────────────────────┐
//   │ ZOOM   [Fit  ▾]         │
//   └─────────────────────────┘
//
// - container Control: Theme.bg bg, hairline border, rMd radius, 3 px pad
// - label inside the container: tLabel-ish (mono 8pt, textMuted, uppercase)
// - selector: surfaceRaised bg, rXs radius, 22 px tall, mono 9pt
//
// Three helpers in a dedicated MINI-CARD block reusable for any other
// future mini-card. To revert: delete this block and restore the old
// optLabel(...) + ComboBox additions to the toolRow sizer.
// ============================================================================

function optThemeApplyMiniCardContainer(widget) {
   if (!widget) return;
   try {
      widget.styleSheet =
         "QWidget {" +
         " background-color: " + Theme.bg + ";" +
         " border: 1px solid " + optThemeRgba("border") + ";" +
         " border-radius: " + Theme.rMd + "px;" +
         "}";
   } catch (e) {}
}

function optThemeApplyMiniCardLabel(label) {
   if (!label) return;
   try {
      label.styleSheet =
         "QLabel {" +
         " color: " + Theme.textMuted + ";" +
         " background-color: transparent; border: 0px;" +
         " font-family: " + Theme.fontMono + ";" +
         " font-size: 8pt; font-weight: 600;" +
         " padding-left: 6px; padding-right: 4px;" +
         "}";
      label.textAlignment = TextAlign_Left | TextAlign_VertCenter;
   } catch (e) {}
}

function optThemeApplyMiniCardCombo(combo) {
   if (!combo) return;
   try {
      combo.minHeight = 22; combo.maxHeight = 22;
      combo.styleSheet =
         "QComboBox {" +
         " background-color: " + Theme.surfaceRaised + ";" +
         " color: " + Theme.text + ";" +
         " border: 1px solid " + optThemeRgba("border") + ";" +
         " border-radius: " + Theme.rXs + "px;" +
         " padding-left: 10px; padding-right: 4px;" +
         " font-family: " + Theme.fontMono + ";" +
         " font-size: 9pt; font-weight: 500;" +
         " outline: none;" +
         "}" +
         "QComboBox:hover { background-color: " + Theme.surfaceHover + "; }" +
         "QComboBox::drop-down { border: 0px; width: 16px; }" +
         "QComboBox QAbstractItemView {" +
         " background-color: " + Theme.surfaceRaised + ";" +
         " color: " + Theme.text + ";" +
         " border: 1px solid " + optThemeRgba("border") + ";" +
         " selection-background-color: " + optThemeRgba("amberSoft") + ";" +
         " selection-color: " + Theme.amber + ";" +
         "}";
   } catch (e) {}
}

// Convenience: build a mini-card Control containing the supplied label text
// and combo. The combo is created by the caller (so its onItemSelected and
// items remain external) but is reparented into the card and themed here.
function optThemeBuildMiniCard(parent, labelText, combo) {
   var card = new Control(parent);
   optThemeApplyMiniCardContainer(card);
   card.sizer = new HorizontalSizer();
   card.sizer.margin = 3;
   card.sizer.spacing = 4;
   var label = new Label(card);
   label.text = labelText;
   optThemeApplyMiniCardLabel(label);
   card.sizer.add(label);
   if (combo) {
      optThemeApplyMiniCardCombo(combo);
      card.sizer.add(combo);
   }
   card.label = label;
   card.combo = combo;
   return card;
}
// ----------------------------------------------------------------------------
// <<< ZOOM CONTROLS — Phase 4g ends here >>>
// ============================================================================


// ============================================================================
// >>> PRIMARY CTA — Phase 4h — easy-rollback block <<<
// ----------------------------------------------------------------------------
// Styles the panel-footer "Continue" buttons ("To Stretching",
// "To Post Processing") per DESIGN_SPEC §2.15:
//
//   +------------------------------------------+
//   |  Continue to Stretching            ->    |   40 px tall, 100% wide
//   +------------------------------------------+
//
// - bg: linear vertical gradient amberBright -> amber.
// - text: #15110a (warm black) weight 700.
// - border-radius: rLg (10).
// - top inner highlight: 1 px white at 25% (simulates bevel).
// - Qt CSS supports `qlineargradient(...)` for gradient bg.
//
// To revert: delete this block and restore optPrimaryButton(...) calls.
// ============================================================================

// Compact CTA used by in-module action buttons (e.g. "Apply Noise
// Reduction", "Apply Sharpening"). Same gradient as the full CTA but
// 32 px tall instead of 40 — per DESIGN_SPEC §10.4, module CTAs sit
// inside the section body so they should be a touch less heavy than
// the "Continue to Stretching" tab-footer CTA.
function optThemeApplyModuleCta(btn) {
   if (!btn) return;
   try {
      btn.minHeight = 32; btn.maxHeight = 32;
      btn.styleSheet =
         "QPushButton {" +
         " background-color: " + Theme.amber + ";" +
         " background: qlineargradient(x1:0, y1:0, x2:0, y2:1, stop:0 " +
            Theme.amberBright + ", stop:1 " + Theme.amber + ");" +
         " color: #15110a;" +
         " border: 1px solid " + Theme.amber + ";" +
         " border-top: 1px solid rgba(255, 255, 255, 0.22);" +
         " border-radius: " + Theme.rMd + "px;" +
         " padding-top: 0px; padding-bottom: 0px;" +
         " padding-left: 12px; padding-right: 12px;" +
         " font-size: 9pt; font-weight: 700;" +
         " outline: none;" +
         "}" +
         "QPushButton:hover {" +
         " background: qlineargradient(x1:0, y1:0, x2:0, y2:1, stop:0 #ffc875, stop:1 #f0b865);" +
         " color: #15110a;" +
         "}" +
         "QPushButton:pressed { background: " + Theme.amber + "; }" +
         "QPushButton:disabled {" +
         " background: " + Theme.surfaceRaised + ";" +
         " color: " + Theme.textDim + ";" +
         " border: 1px solid " + optThemeRgba("border") + ";" +
         "}" +
         "QPushButton:focus { outline: none; }";
   } catch (e) {}
}

function optThemeApplyPrimaryCta(btn) {
   if (!btn) return;
   try {
      btn.minHeight = 40; btn.maxHeight = 40;
      btn.styleSheet =
         "QPushButton {" +
         " background-color: " + Theme.amber + ";" +
         " background: qlineargradient(x1:0, y1:0, x2:0, y2:1, stop:0 " +
            Theme.amberBright + ", stop:1 " + Theme.amber + ");" +
         " color: #15110a;" +
         " border: 1px solid " + Theme.amber + ";" +
         " border-top: 1px solid rgba(255, 255, 255, 0.25);" +
         " border-radius: " + Theme.rLg + "px;" +
         " padding-top: 0px; padding-bottom: 0px;" +
         " padding-left: 16px; padding-right: 16px;" +
         " font-size: 10pt; font-weight: 700;" +
         " outline: none;" +
         "}" +
         "QPushButton:hover {" +
         " background: qlineargradient(x1:0, y1:0, x2:0, y2:1, stop:0 #ffc875, stop:1 #f0b865);" +
         " color: #15110a;" +
         "}" +
         "QPushButton:pressed {" +
         " background: " + Theme.amber + ";" +
         " color: #15110a;" +
         "}" +
         "QPushButton:disabled {" +
         " background: " + Theme.surfaceRaised + ";" +
         " color: " + Theme.textDim + ";" +
         " border: 1px solid " + optThemeRgba("border") + ";" +
         "}" +
         "QPushButton:focus { outline: none; }";
   } catch (e) {}
}
// ----------------------------------------------------------------------------
// <<< PRIMARY CTA — Phase 4h ends here >>>
// ============================================================================


// ============================================================================
// >>> SLIDER + NUMERIC — Phase 5 base — easy-rollback block <<<
// ----------------------------------------------------------------------------
// Reusable theming helpers for the expanded-module body contents per
// DESIGN_SPEC §2.10 / §2.10.b. PJSR ships NumericControl (Label + Slider +
// Edit in one row); the spec explicitly tells us to re-style it instead of
// rebuilding from scratch, so this block produces the Qt styleSheets that
// turn the native widget into the new visual:
//
//   - Label (left): tBody, colour text. (Optional: replaced by a stacked
//     "label above + chip on the right" layout via optThemeBuildSliderRow.)
//   - Track (groove): 3 px tall, bg borderStrong, fully rounded.
//   - Fill (sub-page): amber, same radius.
//   - Thumb (handle): 10x10 circle, amber, soft outer halo via box-shadow
//     emulated with `border: 2px solid bg` to separate it from the track.
//   - Numeric edit: surfaceRaised chip, hairline border, rXs radius, mono.
//
// To revert: delete this block and stop calling the helpers; PJSR will
// reinstate the native NumericControl appearance.
// ============================================================================

function optThemeApplySliderStyle(slider) {
   if (!slider) return;
   try {
      slider.styleSheet =
         "QSlider {" +
         " background-color: transparent;" +
         " min-height: 18px; max-height: 18px;" +
         "}" +
         "QSlider::groove:horizontal {" +
         " background: " + optThemeRgba("borderStrong") + ";" +
         " height: 3px; border-radius: 2px;" +
         "}" +
         "QSlider::sub-page:horizontal {" +
         " background: " + Theme.amber + ";" +
         " height: 3px; border-radius: 2px;" +
         "}" +
         "QSlider::add-page:horizontal {" +
         " background: " + optThemeRgba("borderStrong") + ";" +
         " height: 3px; border-radius: 2px;" +
         "}" +
         "QSlider::handle:horizontal {" +
         " background: " + Theme.amber + ";" +
         " border: 2px solid " + Theme.surface + ";" +
         " width: 10px; height: 10px;" +
         " margin-top: -6px; margin-bottom: -6px;" +
         " border-radius: 7px;" +
         "}" +
         "QSlider::handle:horizontal:hover {" +
         " background: " + Theme.amberBright + ";" +
         "}";
   } catch (e) {}
}

function optThemeApplyNumericEdit(edit) {
   if (!edit) return;
   try {
      edit.minHeight = 22; edit.maxHeight = 22;
      edit.styleSheet =
         "QLineEdit, QSpinBox, QDoubleSpinBox {" +
         " background-color: " + Theme.surfaceRaised + ";" +
         " color: " + Theme.text + ";" +
         " border: 1px solid " + optThemeRgba("border") + ";" +
         " border-radius: " + Theme.rXs + "px;" +
         " padding-left: 6px; padding-right: 6px;" +
         " font-family: " + Theme.fontMono + ";" +
         " font-size: 9pt; font-weight: 600;" +
         " selection-background-color: " + optThemeRgba("amberSoft") + ";" +
         " selection-color: " + Theme.amber + ";" +
         "}" +
         "QLineEdit:focus, QSpinBox:focus, QDoubleSpinBox:focus {" +
         " border: 1px solid " + optThemeRgba("amberRing") + ";" +
         "}" +
         "QSpinBox::up-button, QSpinBox::down-button," +
         "QDoubleSpinBox::up-button, QDoubleSpinBox::down-button {" +
         " width: 0px; height: 0px; border: 0px; background: transparent;" +
         "}";
   } catch (e) {}
}

function optThemeApplyNumericLabel(label) {
   if (!label) return;
   try {
      label.styleSheet =
         "QLabel {" +
         " color: " + Theme.text + ";" +
         " background-color: transparent; border: 0px;" +
         " font-size: 9pt; font-weight: 500;" +
         "}";
      // Phase 6: left-align so that when a long label gets clipped by the
      // 80 px cap, the user sees the START of the word (e.g. "Shadows c…")
      // instead of just the tail ("…s clipping"). Right-aligned labels were
      // hiding the most informative part of the text.
      label.textAlignment = TextAlign_Left | TextAlign_VertCenter;
   } catch (e) {}
}

// Apply the full theme to a PJSR NumericControl in-place. NumericControl
// exposes .label / .slider / .edit (or sometimes .numericEdit) sub-widgets;
// we apply the appropriate helper to each. Safe to call multiple times.
// `in` is used (instead of bare property access) so the PJSR strict engine
// does not emit Warning 162 when the optional .numericEdit sub-widget is
// not present on this build's NumericControl.
function optThemeApplyNumericControl(nc) {
   if (!nc) return;
   try { if ("label" in nc) optThemeApplyNumericLabel(nc.label); } catch (eL) {}
   try { if ("slider" in nc) optThemeApplySliderStyle(nc.slider); } catch (eS) {}
   try { if ("edit" in nc) optThemeApplyNumericEdit(nc.edit); } catch (eE0) {}
   try { if ("numericEdit" in nc) optThemeApplyNumericEdit(nc.numericEdit); } catch (eE1) {}
}

// Apply the full theme to a bare PJSR HorizontalSlider (no NumericControl
// wrapper). Useful for module bodies that use a standalone Slider.
function optThemeApplyHorizontalSlider(slider) {
   optThemeApplySliderStyle(slider);
}
// ----------------------------------------------------------------------------
// <<< SLIDER + NUMERIC — Phase 5 base ends here >>>
// ============================================================================


// ============================================================================
// >>> SUBCARDS + MODULE BODY — Phase 5 base — easy-rollback block <<<
// ----------------------------------------------------------------------------
// Reusable helpers for the EXPANDED module body containers (§2.10.b). Every
// module with 5+ controls or with clear logical sub-groups (Deconvolution
// has Stars/Nonstellar/Output, Noise Reduction has Basic/Color/Frequency,
// etc.) wraps its controls in "subcards" inside the body.
//
//   ╭ Module expanded body (bg = Theme.bg, padding 4/12/12) ──╮
//   │ ┌ Subcard: Stars (bg surface, radio 9, padding 10/12) ┐ │
//   │ │ slider 1                                            │ │
//   │ │ slider 2                                            │ │
//   │ └─────────────────────────────────────────────────────┘ │
//   │ ┌ Subcard: Nonstellar                                 ┐ │
//   │ │ ...                                                 │ │
//   │ └─────────────────────────────────────────────────────┘ │
//   ╰─────────────────────────────────────────────────────────╯
//
// Spec details:
//   - subcard bg `surface` (lifts off the module body bg `bg`).
//   - subcard border `border` (NOT amberRing — that's reserved for the
//     module container itself).
//   - subcard radius 9 (one less than the module's rLg 10).
//   - subhead: tLabel uppercase, textMuted.
// ============================================================================

function optThemeApplyModuleBody(widget) {
   // The body container of an expanded module. Now amber-tinted (very low
   // alpha on amber) with a soft amber-ring border so the module reads as a
   // clearly delimited "active workspace" instead of blending into the
   // surrounding panel. Subcards inside still use Theme.surface and therefore
   // continue to read as elevated on top of this tinted bg.
   if (!widget) return;
   try {
      widget.styleSheet =
         "QWidget {" +
         " background-color: rgba(224, 168, 90, 0.06);" +    // ~6 % amber
         " border: 1px solid " + optThemeRgba("amberRing") + ";" +
         " border-radius: " + Theme.rLg + "px;" +
         "}";
   } catch (e) {}
}

function optThemeApplySubcard(widget) {
   if (!widget) return;
   try {
      widget.styleSheet =
         "QWidget {" +
         " background-color: " + Theme.surface + ";" +
         " border: 1px solid " + optThemeRgba("border") + ";" +
         " border-radius: 9px;" +
         "}";
   } catch (e) {}
}

function optThemeApplySubcardHeader(label) {
   if (!label) return;
   try {
      label.styleSheet =
         "QLabel {" +
         " color: " + Theme.textMuted + ";" +
         " background-color: transparent; border: 0px;" +
         " font-family: " + Theme.fontMono + ";" +
         " font-size: 8pt; font-weight: 700;" +
         "}";
      label.textAlignment = TextAlign_Left | TextAlign_VertCenter;
   } catch (e) {}
}

// Convenience builder: returns { card, body } where card is the Frame
// wrapping the subcard styling and body is the inner VerticalSizer-hosting
// Control where callers add their slider rows etc.
function optThemeBuildSubcard(parent, headerText) {
   var card = new Control(parent);
   optThemeApplySubcard(card);
   card.sizer = new VerticalSizer();
   card.sizer.margin = 8;             // tight padding to fit the 300 px card
   card.sizer.spacing = Theme.s2;     // 8 px between header and rows
   if (headerText) {
      var header = new Label(card);
      header.text = String(headerText).toUpperCase();
      optThemeApplySubcardHeader(header);
      card.sizer.add(header);
   }
   return card;
}

// Apply the spec's checkbox styling so toggles inside module bodies match
// the surrounding controls (currently PJSR's default CheckBox is too plain).
function optThemeApplyCheckBox(cb) {
   if (!cb) return;
   try {
      cb.styleSheet =
         "QCheckBox {" +
         " color: " + Theme.text + ";" +
         " background-color: transparent;" +
         " spacing: 8px;" +
         " font-size: 9pt; font-weight: 500;" +
         "}" +
         "QCheckBox::indicator {" +
         " width: 14px; height: 14px;" +
         " background-color: " + Theme.surfaceRaised + ";" +
         " border: 1px solid " + optThemeRgba("border") + ";" +
         " border-radius: 3px;" +
         "}" +
         "QCheckBox::indicator:hover {" +
         " border: 1px solid " + optThemeRgba("amberRing") + ";" +
         "}" +
         "QCheckBox::indicator:checked {" +
         " background-color: " + Theme.amber + ";" +
         " border: 1px solid " + Theme.amber + ";" +
         "}";
   } catch (e) {}
}
// ----------------------------------------------------------------------------
// <<< SUBCARDS + MODULE BODY — Phase 5 base ends here >>>
// ============================================================================


// ============================================================================
// >>> STATUS BOX — Phase 5 base — easy-rollback block <<<
// ----------------------------------------------------------------------------
// Status indicator pill used by modules that follow the Status + Action
// pattern (Plate Solving, eventually MGC progress, etc.). Per DESIGN_SPEC
// §2.10, status lines pair a coloured dot with mono text. We render the
// whole thing as a single styled Label that flips colour family between
// pending (amber), ok (green) and error (red) states.
// ============================================================================

function optThemeApplyStatusBox(label, state) {
   if (!label) return;
   var color, bg, ring;
   if (state === "ok") {
      color = "#6dbf7a";
      bg    = "rgba(109, 191, 122, 0.10)";
      ring  = "rgba(109, 191, 122, 0.30)";
   } else if (state === "error") {
      color = "#e36a6a";
      bg    = "rgba(227, 106, 106, 0.10)";
      ring  = "rgba(227, 106, 106, 0.30)";
   } else {
      // "pending" / default
      color = Theme.amber;
      bg    = optThemeRgba("amberSoft");
      ring  = optThemeRgba("amberRing");
   }
   try {
      label.styleSheet =
         "QLabel {" +
         " color: " + color + ";" +
         " background-color: " + bg + ";" +
         " border: 1px solid " + ring + ";" +
         " border-radius: " + Theme.rMd + "px;" +
         " padding-top: 6px; padding-bottom: 6px;" +
         " padding-left: 10px; padding-right: 10px;" +
         " font-family: " + Theme.fontMono + ";" +
         " font-size: 9pt; font-weight: 600;" +
         "}";
   } catch (e) {}
}

// One-shot: set the text and the state colour family in a single call.
// The text is set as plain mono — no inline <b style='color:...'> spans
// needed any more; the styleSheet carries every visual decision.
function optThemeSetStatus(label, text, state) {
   if (!label) return;
   try { label.useRichText = false; } catch (eR) {}
   try { label.text = text; } catch (e) {}
   optThemeApplyStatusBox(label, state);
}
// ----------------------------------------------------------------------------
// <<< STATUS BOX — Phase 5 base ends here >>>
// ============================================================================


// ============================================================================
// >>> ACTION CARD — Phase 5 base — easy-rollback block <<<
// ----------------------------------------------------------------------------
// Big clickable card used by the Action-only module pattern (DESIGN_SPEC
// §10.3). Color Calibration is the canonical user of this: the body shows
// three cards (SPCC, Auto Linear Fit, Background Neutralization), one of
// them marked as the primary recommendation with an amber background and
// a "BEST" badge.
//
// Layout per card:
//
//   ┌────────────────────────────────────────────────┐
//   │  [I]  Title                          [BADGE] › │
//   │       hint mono                                │
//   └────────────────────────────────────────────────┘
//
// opts = { title, hint, isPrimary, badge, iconLetter, onClick }
// ============================================================================

function optThemeBuildActionCard(parent, opts) {
   opts = opts || {};
   // `in` avoids PJSR strict Warning 162 when the caller passes opts
   // without the optional `isPrimary` key.
   var isPrimary = ("isPrimary" in opts) && opts.isPrimary === true;
   var card = new Frame(parent);
   try {
      card.styleSheet =
         "QFrame {" +
         (isPrimary
            ? " background-color: " + optThemeRgba("amberSoft") + ";" +
              " border: 1px solid " + optThemeRgba("amberRing") + ";"
            : " background-color: " + Theme.surface + ";" +
              " border: 1px solid " + optThemeRgba("border") + ";") +
         " border-radius: " + Theme.rLg + "px;" +
         "}";
   } catch (e) {}
   card.sizer = new HorizontalSizer();
   card.sizer.margin = 10;
   card.sizer.spacing = 10;

   // Square icon box (28×28).
   var iconBox = new Control(card);
   try {
      iconBox.minWidth = 28; iconBox.maxWidth = 28;
      iconBox.minHeight = 28; iconBox.maxHeight = 28;
      iconBox.styleSheet =
         "QWidget {" +
         (isPrimary
            ? " background-color: " + Theme.amber + ";"
            : " background-color: " + Theme.surfaceRaised + ";") +
         " border: 0px;" +
         " border-radius: 7px;" +
         "}";
   } catch (eIb) {}
   iconBox.sizer = new VerticalSizer();
   iconBox.sizer.margin = 0;
   if (opts.iconLetter) {
      var iconLbl = new Label(iconBox);
      iconLbl.text = String(opts.iconLetter);
      iconLbl.textAlignment = TextAlign_Center | TextAlign_VertCenter;
      try {
         iconLbl.styleSheet =
            "QLabel {" +
            (isPrimary
               ? " color: #15110a;"
               : " color: " + Theme.amber + ";") +
            " background-color: transparent; border: 0px;" +
            " font-family: " + Theme.fontMono + ";" +
            " font-size: 11pt; font-weight: 800;" +
            "}";
      } catch (eIl) {}
      iconBox.sizer.add(iconLbl, 100);
   }
   card.sizer.add(iconBox);

   // Title + hint vertical stack.
   var stack = new Control(card);
   try { stack.styleSheet = "QWidget { background-color: transparent; border: 0px; }"; } catch (eS) {}
   stack.sizer = new VerticalSizer();
   stack.sizer.margin = 0;
   stack.sizer.spacing = 2;

   var titleLbl = new Label(stack);
   titleLbl.text = opts.title || "";
   titleLbl.textAlignment = TextAlign_Left | TextAlign_VertCenter;
   try {
      titleLbl.styleSheet =
         "QLabel {" +
         " color: " + (isPrimary ? Theme.amber : Theme.text) + ";" +
         " background-color: transparent; border: 0px;" +
         " font-size: 10pt; font-weight: 600;" +
         "}";
   } catch (eT) {}
   stack.sizer.add(titleLbl);

   if (opts.hint) {
      var hintLbl = new Label(stack);
      hintLbl.text = opts.hint;
      hintLbl.textAlignment = TextAlign_Left | TextAlign_VertCenter;
      hintLbl.wordWrapping = true;
      try {
         hintLbl.styleSheet =
            "QLabel {" +
            " color: " + Theme.textDim + ";" +
            " background-color: transparent; border: 0px;" +
            " font-family: " + Theme.fontUI + ";" +
            " font-size: 8pt;" +
            "}";
      } catch (eH) {}
      stack.sizer.add(hintLbl);
   }
   card.sizer.add(stack, 100);

   // Optional pill badge ("BEST", "FAST", etc.).
   if (opts.badge) {
      var badge = new Label(card);
      badge.text = String(opts.badge);
      try {
         badge.styleSheet =
            "QLabel {" +
            " background-color: " + Theme.amber + ";" +
            " color: #15110a;" +
            " border-radius: 8px;" +
            " padding-top: 1px; padding-bottom: 1px;" +
            " padding-left: 7px; padding-right: 7px;" +
            " font-family: " + Theme.fontMono + ";" +
            " font-size: 7pt; font-weight: 800;" +
            "}";
      } catch (eB) {}
      card.sizer.add(badge);
   }

   // Chevron.
   var chevron = new Label(card);
   chevron.text = "›";
   chevron.textAlignment = TextAlign_Right | TextAlign_VertCenter;
   try {
      chevron.styleSheet =
         "QLabel {" +
         " color: " + Theme.textDim + ";" +
         " background-color: transparent; border: 0px;" +
         " font-size: 14pt;" +
         "}";
      chevron.minWidth = 12; chevron.maxWidth = 12;
   } catch (eC) {}
   card.sizer.add(chevron);

   try { card.cursor = new Cursor(StdCursor_PointingHand); } catch (eCur) {}

   // BUGFIX-SPCC-PROPAGATION-BEGIN
   if (typeof opts.onClick === "function") {
      var isClicking = false;
      var fire = function() {
         if (card.enabled === false) return;
         if (isClicking) return;
         isClicking = true;
         try {
            opts.onClick();
         } finally {
            if (typeof Timer !== "undefined") {
               var t = new Timer();
               t.singleShot = true;
               t.interval = 0.05; // 50ms
               t.onTimeout = function() {
                  isClicking = false;
                  t.stop();
               };
               t.start();
            } else {
               isClicking = false;
            }
         }
      };
      card.onMousePress = fire;
      try { iconBox.onMousePress  = fire; } catch (e1) {}
      try { stack.onMousePress    = fire; } catch (e2) {}
      try { titleLbl.onMousePress = fire; } catch (e3) {}
      try { chevron.onMousePress  = fire; } catch (e4) {}
   }
   // BUGFIX-SPCC-PROPAGATION-END

   return card;
}
// ----------------------------------------------------------------------------
// <<< ACTION CARD — Phase 5 base ends here >>>
// ============================================================================

function OptImageCombo(parent, labelText, key, requireColor) {
   this.key = key;
   this.requireColor = requireColor === true;
   this.row = new Control(parent);
   this.row.sizer = new HorizontalSizer();
   this.row.sizer.margin = 0;
   this.row.sizer.spacing = Theme.s2;     // 8 px between dot, label and combo

   // Phase 4b: coloured dot painted on a small Control via onPaint. The
   // bitmap is precomputed once per channel key and rendered every paint.
   var dotBm = null;
   try { dotBm = optThemeBuildChannelDotBitmap(key); } catch (eBm) { dotBm = null; }
   this.dot = new Control(this.row);
   try {
      this.dot.minWidth = 16; this.dot.maxWidth = 16;
      this.dot.minHeight = 16; this.dot.maxHeight = 16;
      this.dot.styleSheet = "QWidget { background-color: transparent; border: 0px; }";
   } catch (eDim) {}
   if (dotBm) {
      this.dot.onPaint = function() {
         var g = new Graphics(this);
         try { g.drawBitmap(0, 0, dotBm); } finally { g.end(); }
      };
   }

   // Phase 4b: themed label (mono, no colon, narrow fixed column).
   this.label = new Label(this.row);
   this.label.text = labelText;
   optThemeApplyChannelLabel(this.label);

   // Phase 4b: themed combo (surfaceRaised bg, hairline border, rSm radius).
   this.combo = new ComboBox(this.row);
   optThemeApplyChannelComboStyle(this.combo);

   this.views = [];
   this.records = [];
   this.onSelectionChanged = null;
   this.row.sizer.add(this.dot);
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

   // Phase 4a: mode segmented pill — three equal columns inside a dark
   // container with rLg radius. The buttons stretch to fill instead of
   // having fixed widths; this scales naturally inside the 300 px left
   // card without overflow.
   this.modeRow = new Control(this.control);
   optThemeStyleModeSegmentedContainer(this.modeRow);
   this.modeRow.sizer = new HorizontalSizer();
   this.modeRow.sizer.margin = 3;
   this.modeRow.sizer.spacing = 2;
   this.btnModeMono = optButton(this.modeRow, "R+G+B", 0);
   this.btnModeNb = optButton(this.modeRow, "NB", 0);
   this.btnModeRgb = optButton(this.modeRow, "RGB", 0);
   this.modeRow.sizer.add(this.btnModeMono, 1);
   this.modeRow.sizer.add(this.btnModeNb, 1);
   this.modeRow.sizer.add(this.btnModeRgb, 1);
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
   g.sizer.spacing = Theme.s2;     // Phase 4b: 4 -> 8 px between channel rows
   this.addCombo(g.sizer, "R", "R", false);
   this.addCombo(g.sizer, "G", "G", false);
   this.addCombo(g.sizer, "B", "B", false);
   this.addCombo(g.sizer, "L", "L", false, "L_MONO");
   // LRGB-WEIGHT-BEGIN — inline L weight slider revealed by right-click on "L:" label.
   // Hidden by default. Auto-hides when L combo is set to "None".
   (function(panel) {
      var lCombo = panel.combos["L_MONO"];
      if (!lCombo) return;
      var dialog = panel.dialog;
      var weightRow = new Control(panel.control);
      weightRow.sizer = new HorizontalSizer;
      weightRow.sizer.margin = 0;
      weightRow.sizer.spacing = 4;
      // Phase 6.10: the legacy addSpacing(52) that aligned the slider under
      // the old L combo column is removed — with the new themed channel
      // rows the slider can now use the full panel width.
      var nc = new NumericControl(weightRow);
      nc.label.text = "L wt %";
      nc.label.minWidth = 60;
      try { nc.label.maxWidth = 60; } catch (eW) {}
      nc.setRange(0, 200);
      nc.setPrecision(0);
      nc.slider.setRange(0, 200);
      nc.slider.minWidth = 80;     // a baseline; the stretch below grows it
      try { optThemeApplyNumericControl(nc); } catch (eTh) {}
      nc.toolTip =
         "<p><b>L blending weight</b> for the R+G+B+L combine.</p>" +
         "<ul>" +
         "<li><b>100%</b> — standard LRGB (default)</li>" +
         "<li><b>0%</b>   — no L influence (pure RGB)</li>" +
         "<li><b>50%</b>  — half L, half RGB luminance</li>" +
         "<li><b>200%</b> — double L influence (extrapolated; highlights may clip)</li>" +
         "</ul>" +
         "<p>Right-click the <b>L:</b> label to hide this slider.</p>";
      nc.setValue(Math.round(optGetLuminanceWeight(dialog) * 100));
      nc.onValueUpdated = function(v) {
         dialog.luminanceWeight = v / 100.0;
      };
      weightRow.sizer.add(nc, 100);
      g.sizer.add(weightRow);
      panel.lWeightRow = weightRow;
      panel.lWeightControl = nc;
      // Reserve the vertical space permanently so toggling the slider does not
      // shift the rest of the panel. We measure the row with content visible,
      // lock its height, then hide only the inner NumericControl.
      try {
         weightRow.adjustToContents();
         var reservedH = Math.max(weightRow.height, 24);
         weightRow.setFixedHeight(reservedH);
      } catch (eFH) {}
      nc.visible = false;
      // Right-click on the "L:" label toggles the slider — only when L has a real selection.
      try {
         lCombo.label.onMousePress = function(x, y, button) {
            if (button !== OPT_MOUSE_RIGHT) return;
            if (!optSafeView(lCombo.selectedView())) return;
            nc.visible = !nc.visible;
            if (nc.visible)
               nc.setValue(Math.round(optGetLuminanceWeight(dialog) * 100));
         };
         lCombo.label.toolTip =
            "<p>Luminance channel for LRGB combination.</p>" +
            "<p><b>Right-click</b> when an L image is selected to reveal the " +
            "<b>L blending weight</b> slider (0–200%, default 100%).</p>";
      } catch (eLbl) {}
      // Auto-hide slider content if L combo is set back to None (row keeps its reserved height).
      var priorOnSel = lCombo.onSelectionChanged;
      lCombo.onSelectionChanged = function(view) {
         if (!optSafeView(view))
            nc.visible = false;
         if (typeof priorOnSel === "function")
            try { priorOnSel(view); } catch (ePS) {}
      };
   })(this);
   // LRGB-WEIGHT-END
   // Phase 4c: Combine / Separately as a 2-column segmented pill (§2.8).
   // Combine takes the active (amber) variant; Separately the inactive
   // (transparent / muted) variant. Click handlers are wired elsewhere.
   var row = new Control(g);
   optThemeStyleModeSegmentedContainer(row);
   row.sizer = new HorizontalSizer();
   row.sizer.margin = 3;
   row.sizer.spacing = 2;
   this.btnCombineMono = optButton(row, "Combine RGB", 0);
   this.btnSeparateMono = optButton(row, "Separately", 0);
   optThemeStyleModeSegmentedButton(this.btnCombineMono, true);
   optThemeStyleModeSegmentedButton(this.btnSeparateMono, false);
   row.sizer.add(this.btnCombineMono, 1);
   row.sizer.add(this.btnSeparateMono, 1);
   g.sizer.add(row);
   this.control.sizer.add(g);
};

OptSelectionPanel.prototype.buildNbGroup = function() {
   var g = new Control(this.control);
   this.nbGroup = g;
   g.sizer = new VerticalSizer();
   g.sizer.margin = 0;
   g.sizer.spacing = Theme.s2;     // Phase 4b: 4 -> 8 px between channel rows
   this.addCombo(g.sizer, "H", "H", false);
   this.addCombo(g.sizer, "O", "O", false);
   this.addCombo(g.sizer, "S", "S", false);
   this.addCombo(g.sizer, "HO", "HO", true);
   this.addCombo(g.sizer, "OS", "OS", true);
   // Phase 4c: Combine / Separately as a 2-column segmented pill (§2.8).
   var row = new Control(g);
   optThemeStyleModeSegmentedContainer(row);
   row.sizer = new HorizontalSizer();
   row.sizer.margin = 3;
   row.sizer.spacing = 2;
   this.btnCombineNb = optButton(row, "Combine HOS", 0);
   this.btnSeparateNb = optButton(row, "Separately", 0);
   optThemeStyleModeSegmentedButton(this.btnCombineNb, true);
   optThemeStyleModeSegmentedButton(this.btnSeparateNb, false);
   row.sizer.add(this.btnCombineNb, 1);
   row.sizer.add(this.btnSeparateNb, 1);
   g.sizer.add(row);
   this.recipeRow = new Control(this.control);
   this.recipeRow.sizer = new VerticalSizer();
   this.recipeRow.sizer.spacing = 3;
   // Phase 6.8: 3 rows × 4 pills (was 2 × 6) — each pill is wider and
   // easier to hit.
   var recipeRow1 = new Control(this.recipeRow);
   recipeRow1.sizer = new HorizontalSizer();
   recipeRow1.sizer.spacing = 3;
   var recipeRow2 = new Control(this.recipeRow);
   recipeRow2.sizer = new HorizontalSizer();
   recipeRow2.sizer.spacing = 3;
   var recipeRow3 = new Control(this.recipeRow);
   recipeRow3.sizer = new HorizontalSizer();
   recipeRow3.sizer.spacing = 3;
   for (var i = 0; i < OPT_RECIPE_NAMES.length; ++i) {
      var recipeParent = i < 4 ? recipeRow1 : (i < 8 ? recipeRow2 : recipeRow3);
      var b = optButton(recipeParent, OPT_RECIPE_NAMES[i], 0);
      // Phase 6: themed recipe pill. No more fixed 35-40 px width — each
      // row spreads its 6 buttons evenly via stretch=1.
      optThemeApplyRecipeButton(b, false);
      b.__recipe = OPT_RECIPE_NAMES[i];
      try {
         var ttRecipe = optTooltipTextByKey("recipe." + OPT_RECIPE_NAMES[i]);
         if (ttRecipe) b.toolTip = ttRecipe;
      } catch (eRec) {}
      var dlg = this.dialog;
      b.onClick = function() {
         dlg.selectedRecipe = this.__recipe;
         dlg.recipeManuallySelected = true;
         dlg.refreshRecipeButtons();
      };
      recipeParent.sizer.add(b, 1);
      this.dialog.recipeButtons.push(b);
   }
   this.recipeRow.sizer.add(recipeRow1);
   this.recipeRow.sizer.add(recipeRow2);
   this.recipeRow.sizer.add(recipeRow3);
   g.sizer.add(this.recipeRow);
   this.control.sizer.add(g);
};

OptSelectionPanel.prototype.buildRgbGroup = function() {
   var g = new Control(this.control);
   this.rgbGroup = g;
   g.sizer = new VerticalSizer();
   g.sizer.margin = 0;
   g.sizer.spacing = Theme.s2;     // Phase 4b: 4 -> 8 px between channel rows
   this.addCombo(g.sizer, "RGB", "RGB", true);
   // Phase 4c: single Process RGB button wrapped in the same segmented
   // container as Combine / Separately, with the active (amber) variant.
   var row = new Control(g);
   optThemeStyleModeSegmentedContainer(row);
   row.sizer = new HorizontalSizer();
   row.sizer.margin = 3;
   row.sizer.spacing = 2;
   this.btnProcessRgb = optButton(row, "Process RGB", 0);
   optThemeStyleModeSegmentedButton(this.btnProcessRgb, true);
   row.sizer.add(this.btnProcessRgb, 1);
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
   // Phase 4a: replace OPT_CSS_MODE_ON / OPT_CSS_MODE_OFF with the new
   // themed segmented-pill helper. Active state uses amberSoft / amberRing;
   // inactive state is transparent with textMuted.
   optThemeStyleModeSegmentedButton(this.btnModeMono, this.mode === "MONO");
   optThemeStyleModeSegmentedButton(this.btnModeNb,   this.mode === "NB");
   optThemeStyleModeSegmentedButton(this.btnModeRgb,  this.mode === "RGB");
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
   // Cached tooltip text — looked up once instead of inside the loop because
   // every path button shares the same generic explanation (which slot,
   // bracketed = active, populated after Combine/Process). Specific slot
   // meaning is conveyed by the button label itself (R/G/B/H/RGB/...).
   var ttPathBtn = "";
   try { ttPathBtn = optTooltipTextByKey("path.button") || ""; } catch (eTP) {}
   for (var i = 0; i < keys.length; ++i) {
      var key = keys[i];
      var b = optButton(this.pathRow, optLabelForKey(key), 0);
      b.visible = false;
      // Phase 4f: path chip styled as a fully-rounded pill (§2.13). Initial
      // state is "off" (no stages yet); refreshButtons() flips this to
      // "active" / "done" as the workflow advances.
      optThemeApplyPathChip(b, "off");
      b.__pathKey = key;
      if (ttPathBtn) { try { b.toolTip = ttPathBtn; } catch (eTB) {} }
      var self = this;
      b.onClick = function() {
         self.activate(this.__pathKey, true);
      };
      this.pathButtons[key] = b;
      this.pathRow.sizer.add(b);
   }
   this.pathRow.sizer.addStretch();
   this.control.sizer.add(this.pathRow);

   // Phase 4d: themed memory bank (DESIGN_SPEC §2.11):
   //   MEMORY  [container: 1 2 3 4 5 6 7 8]   RESET (ghost)
   this.memoryRow = new Control(parent);
   this.memoryRow.sizer = new HorizontalSizer();
   this.memoryRow.sizer.spacing = Theme.s2;     // 8 px gaps
   var memLabel = new Label(this.memoryRow);
   memLabel.text = "MEMORY";
   memLabel.textAlignment = TextAlign_Left | TextAlign_VertCenter;
   optThemeApplyMemoryLabel(memLabel);
   // Phase 6.11: fixed label column so the MEMORY and MASK rows align.
   memLabel.minWidth = 60; try { memLabel.maxWidth = 60; } catch (eML) {}
   this.memoryRow.sizer.add(memLabel);

   // Pill container for the 8 slot buttons.
   var memContainer = new Control(this.memoryRow);
   optThemeApplyMemoryContainer(memContainer);
   memContainer.sizer = new HorizontalSizer();
   memContainer.sizer.margin = 3;
   memContainer.sizer.spacing = 2;

   var ttMemSlot = "";
   try { ttMemSlot = optTooltipTextByKey("memory.slot") || ""; } catch (eTM) {}
   for (var m = 0; m < OPT_MEMORY_SLOTS; ++m) {
      var mb = optButton(memContainer, "" + (m + 1), 0);
      optThemeApplyMemorySlot(mb, false);   // empty initial state
      mb.__memoryIndex = m;
      if (ttMemSlot) { try { mb.toolTip = ttMemSlot; } catch (eTMB) {} }
      this.memory.buttons.push(mb);
      var pane = this;
      mb.onClick = function() {
         pane.storeMemory(this.__memoryIndex);
      };
      mb.onMousePress = function(x, y, button) {
         if (button === OPT_MOUSE_RIGHT)
            pane.recallMemory(this.__memoryIndex);
      };
      memContainer.sizer.add(mb);
   }
   this.memoryRow.sizer.add(memContainer);

   this.btnResetMemory = optButton(this.memoryRow, "RESET", 0);
   optThemeApplyMemoryReset(this.btnResetMemory);
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
   // Phase 4e: themed action buttons (DESIGN_SPEC §2.12). Toggle / Export /
   // Export TIF use the neutral surfaceRaised look; Use this Image uses the
   // primary-action variant (amber when READY, green when APPLIED).
   this.btnToggle = optButton(this.toolRow, "Toggle", 60);
   optThemeApplyActionButton(this.btnToggle);
   // >>> SPLIT COMPARE BEGIN >>>
   this.btnSplit = optButton(this.toolRow, "Split", 60);
   optThemeApplyActionButton(this.btnSplit);
   this.btnSplit.toolTip = "<p><b>Split View Comparison</b></p><p>Toggles split-screen comparison mode. Drag the partition line to swipe between before and after images.</p>";
   // <<< SPLIT COMPARE END <<<
   this.btnSetCurrent = optButton(this.toolRow, "Use this Image", 105);
   optThemeApplyPrimaryActionButton(this.btnSetCurrent, false);   // READY state
   this.btnSetCurrent.enabled = false;
   // Phase 4g: Zoom mini-card (DESIGN_SPEC §2.14). Dark container, uppercase
   // mono label inside, themed compact combo.
   this.zoomCard = new Control(this.toolRow);
   optThemeApplyMiniCardContainer(this.zoomCard);
   this.zoomCard.sizer = new HorizontalSizer();
   this.zoomCard.sizer.margin = 3;
   this.zoomCard.sizer.spacing = 4;
   this.zoomLabel = new Label(this.zoomCard);
   this.zoomLabel.text = "ZOOM";
   optThemeApplyMiniCardLabel(this.zoomLabel);
   this.zoomCard.sizer.add(this.zoomLabel);
   this.zoomCombo = new ComboBox(this.zoomCard);
   this.zoomCombo.editEnabled = true;
   this.zoomCombo.addItem("Fit");
   this.zoomCombo.addItem("25%");
   this.zoomCombo.addItem("50%");
   this.zoomCombo.addItem("100%");
   this.zoomCombo.addItem("200%");
   optThemeApplyMiniCardCombo(this.zoomCombo);
   this.zoomCard.sizer.add(this.zoomCombo);
   try {
      var ttZoom = optTooltipTextByKey("zoom");
      if (ttZoom) {
         try { this.zoomCard.toolTip  = ttZoom; } catch (eZC0) {}
         try { this.zoomLabel.toolTip = ttZoom; } catch (eZL)  {}
         try { this.zoomCombo.toolTip = ttZoom; } catch (eZC)  {}
      }
   } catch (eZ) {}

   // Phase 4g: Reduction mini-card (same shape as Zoom).
   this.resCard = new Control(this.toolRow);
   optThemeApplyMiniCardContainer(this.resCard);
   this.resCard.sizer = new HorizontalSizer();
   this.resCard.sizer.margin = 3;
   this.resCard.sizer.spacing = 4;
   this.resLabel = new Label(this.resCard);
   this.resLabel.text = "REDUCTION";
   optThemeApplyMiniCardLabel(this.resLabel);
   this.resCard.sizer.add(this.resLabel);
   this.resCombo = new ComboBox(this.resCard);
   this.resCombo.addItem("1");
   this.resCombo.addItem("2");
   this.resCombo.addItem("3");
   this.resCombo.addItem("4");
   this.resCombo.addItem("5");
   this.resCombo.addItem("6");
   this.resCombo.currentItem = optClampPreviewReduction(dialog.sharedPreviewReduction || OPT_PREVIEW_REDUCTION_DEFAULT) - 1;
   optThemeApplyMiniCardCombo(this.resCombo);
   this.resCard.sizer.add(this.resCombo);
   try {
      var ttRes = optTooltipTextByKey("preview.resolution");
      if (ttRes) {
         try { this.resCard.toolTip  = ttRes; } catch (eRC0) {}
         try { this.resLabel.toolTip = ttRes; } catch (eRL)  {}
         try { this.resCombo.toolTip = ttRes; } catch (eRC)  {}
      }
   } catch (eR) {}

   this.toolRow.sizer.add(this.btnToggle);
   this.toolRow.sizer.add(this.btnSetCurrent);
   // Visual breathing room between the "Use this Image" button and the
   // companion "Show Gradient" checkbox — without it the two controls
   // looked glued together on the wider Pre tab tool row.
   this.toolRow.sizer.addSpacing(12);

   // Show Gradient checkbox: read as a companion toggle to "Use this
   // Image" (only Pre tab, only when a gradient model exists). Lives
   // inside the tool row so it shares horizontal alignment and theming
   // with every other checkbox in the panel; visibility is still
   // managed by updateGradientControl() below.
   this.chkShowGradient = new CheckBox(this.toolRow);
   this.chkShowGradient.text = "Show Gradient";
   this.chkShowGradient.checked = false;
   optApplyCheckBoxTooltip(this.chkShowGradient);
   optThemeApplyCheckBox(this.chkShowGradient);
   optSetControlVisible(this.chkShowGradient, false);
   this.toolRow.sizer.add(this.chkShowGradient);

   this.toolRow.sizer.addStretch();
   this.toolRow.sizer.add(this.btnSplit);
   this.toolRow.sizer.add(this.zoomCard);
   this.toolRow.sizer.add(this.resCard);
   this.control.sizer.add(this.toolRow);

   this.status = new Label(parent);
   this.status.useRichText = true;
   this.status.text = "<b>Current:</b> none";
   // Phase 4f: themed status line (mono, textMuted) per §2.13.
   optThemeApplyStatusLabel(this.status);
   this.control.sizer.add(this.status);

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
   // >>> SPLIT COMPARE BEGIN >>>
   this.btnSplit.onClick = function() { self.toggleSplitMode(); };
   // <<< SPLIT COMPARE END <<<
   this.btnSetCurrent.onClick = function() { self.setToCurrent(); };
   this.chkShowGradient.onCheck = function() {
      if (optSafeView(self.lastRenderView))
         self.render(self.lastRenderView, false, self.lastRenderGradientView);
   };
}

OptPreviewPane.prototype.toggleSplitMode = function() {
   this.preview.isSplitMode = !this.preview.isSplitMode;
   optThemeApplyActionButton(this.btnSplit, this.preview.isSplitMode ? "active" : "neutral");
   if (optSafeView(this.lastRenderView))
      this.render(this.lastRenderView, false, this.lastRenderGradientView);
};

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
      // Phase 4f: themed path chip state transitions (§2.13).
      if (!visible)
         optThemeApplyPathChip(btn, "off");
      else if (key === this.currentKey)
         optThemeApplyPathChip(btn, "active");
      else if (hasStages)
         optThemeApplyPathChip(btn, "done");
      else
         optThemeApplyPathChip(btn, "off");
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
   this.previousActiveView = null;
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
   optThemeApplyPrimaryActionButton(this.btnSetCurrent, false);  // READY
   this.btnSetCurrent.enabled = false;
   this.render(rec.view, fit !== false, this.currentGradientView);
   this.refreshButtons();
   // Re-evaluate UI gating policies because the canonical view of this tab
   // just changed (mono <-> RGB transitions need to (re)enable color sections).
   // Hooking here catches ALL paths that change currentView, not just setRecord.
   try {
      if (this.dialog && typeof this.dialog.applyUIPolicies === "function")
         this.dialog.applyUIPolicies();
   } catch (ePol) {}
   return true;
};

OptPreviewPane.prototype.updateGradientControl = function(gradientView) {
   var visible = this.tab === OPT_TAB_PRE && optSafeView(gradientView);
   // v137: the checkbox now lives directly in toolRow (no wrapping
   // gradientRow Control), so toggle its visibility on the checkbox
   // itself. The Pre-tab guard keeps it hidden on Stretching / Post /
   // CC tabs even if a gradient view happens to be valid.
   optSetControlVisible(this.chkShowGradient, visible);
   if (!visible && this.chkShowGradient)
      this.chkShowGradient.checked = false;
};

OptPreviewPane.prototype.render = function(view, fit, gradientView) {
   if (!optSafeView(view)) {
      this.preview.setBitmap(null, fit !== false);
      // >>> SPLIT COMPARE BEGIN >>>
      this.preview.compareBitmap = null;
      // <<< SPLIT COMPARE END <<<
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
   // >>> SPLIT COMPARE BEGIN >>>
   if (optSafeView(view) && this.lastRenderView !== view) {
      this.previousActiveView = this.lastRenderView;
   }
   // <<< SPLIT COMPARE END <<<
   this.lastRenderView = view;
   this.lastRenderGradientView = optSafeView(gradientView) ? gradientView : null;
   this.updateGradientControl(this.lastRenderGradientView);
   var rec = this.currentKey ? this.dialog.store.record(this.currentKey) : null;
   var stages = optStageList(rec);
   var stretchMode = "";
   if (this.tab === OPT_TAB_PRE) {
      stretchMode = (optRecordHasColorCorrection(rec) || optIsColorCorrectionStage(this.pendingStage)) ? "mad-linked" : "mad-unlinked";
   } else if (this.tab === OPT_TAB_STRETCH) {
      var recalledSlot = (this.recalledMemoryIndex >= 0) ? this.memory.slot(this.recalledMemoryIndex) : null;
      if (recalledSlot && optSafeView(recalledSlot.view) && recalledSlot.view === view) {
         if (recalledSlot.meta && (recalledSlot.meta.compareKind === "star_split_starless" || recalledSlot.meta.compareKind === "star_split_stars" || recalledSlot.meta.menu === "SS")) {
            stretchMode = "mad-linked";
         }
      }
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

   // >>> SPLIT COMPARE BEGIN >>>
   if (this.preview.isSplitMode) {
      var compareView = this.currentView;
      if (this.recalledMemoryIndex >= 0) {
         var slot = this.memory.slot(this.recalledMemoryIndex);
         if (slot && optSafeView(slot.view)) {
            if (this.previousActiveView && optSafeView(this.previousActiveView) && this.previousActiveView !== slot.view) {
               compareView = this.previousActiveView;
            }
         }
      } else if (view === this.candidateView) {
         compareView = this.currentView;
      }
      var compareBmp = null;
      if (optSafeView(compareView)) {
         var compGradient = (compareView === this.currentView) ? this.currentGradientView : null;
         if (this.recalledMemoryIndex >= 0 && compareView !== this.currentView) {
            for (var s = 0; s < OPT_MEMORY_SLOTS; ++s) {
               var sl = this.memory.slot(s);
               if (sl && optSafeView(sl.view) && sl.view === compareView) {
                  compGradient = sl.gradientView;
                  break;
               }
            }
         }
         var showCompGradient = this.chkShowGradient && this.chkShowGradient.checked === true && optSafeView(compGradient);
         compareBmp = showCompGradient ?
            optRenderStackedPreviewBitmap(compareView, compGradient, renderReduction, stretchMode) :
            optRenderPreviewBitmap(compareView, renderReduction, stretchMode);
         var showCompPostMask = this.tab === OPT_TAB_POST &&
            this.dialog &&
            this.dialog.postActiveMaskShown === true &&
            optSafeView(this.dialog.postActiveMask) &&
            compareView === this.currentView;
         if (showCompPostMask) {
            var compMaskedBmp = optRenderPreviewBitmapWithMask(compareView, this.dialog.postActiveMask, renderReduction, stretchMode);
            if (compMaskedBmp)
               compareBmp = compMaskedBmp;
         }
      }
      this.preview.compareBitmap = compareBmp;
   } else {
      this.preview.compareBitmap = null;
   }
   // <<< SPLIT COMPARE END <<<

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
      optThemeApplyPrimaryActionButton(this.btnSetCurrent, false);  // READY
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
      optThemeApplyPrimaryActionButton(this.btnSetCurrent, false);  // READY
      this.btnSetCurrent.enabled = true;
   } finally {
      this.preview.setBusy(false);
   }
};

OptPreviewPane.prototype.setToCurrent = function() {
   var fromMemory = this.recalledMemoryIndex >= 0 ? this.memory.slot(this.recalledMemoryIndex) : null;
   if (fromMemory && optSafeView(fromMemory.view)) {
      // ===== COMPARE-SS-BEGIN — single-layer Star Split commit
      // (v140 Option B). Each Star Split Compare slot holds exactly
      // one layer (Starless or Stars); committing one publishes only
      // that layer to <Base>_Starless or <Base>_Stars in the store.
      // The user is expected to repeat the action for the other layer
      // if they want to commit a different engine's stars after
      // committing one engine's starless (or vice versa). Mosaic
      // disappears on the first commit because the preview activates
      // the just-committed key. =====
      var splitMeta = fromMemory.meta || null;
      if (splitMeta && (splitMeta.compareKind === "star_split_starless" || splitMeta.compareKind === "star_split_stars")) {
         var splitBaseKey = fromMemory.key || this.currentKey || "";
         var base = optBaseKey(splitBaseKey);
         var isStars = (splitMeta.compareKind === "star_split_stars");
         var destKey = isStars ? (base + "_Stars") : (base + "_Starless");
         var destClone = optMemoryCloneView(
            fromMemory.view,
            isStars ? "Opt_CurrentSplitStars" : "Opt_CurrentSplitStarless",
            destKey, this.recalledMemoryIndex);
         if (!optSafeView(destClone))
            return;
         this.dialog.store.setView(destKey, destClone, true, OPT_TAB_STRETCH);
         this.dialog.store.markStage(destKey, isStars ? "Stars" : "Starless");
         optCloseViews([this.candidateView, this.candidateGradientView]);
         this.recalledMemoryIndex = -1;
         this.candidateView = null;
         this.candidateGradientView = null;
         this.pendingStage = "";
         this.pendingActionKey = "";
         this.pendingMemoryMeta = null;
         this.dialog.refreshWorkflowButtons();
         this.activate(destKey, true);   // shows the committed layer; mosaic disappears
         optThemeApplyPrimaryActionButton(this.btnSetCurrent, true);   // APPLIED
         this.btnSetCurrent.enabled = false;
         return;
      }
      // ===== COMPARE-SS-END =====
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
      optThemeApplyPrimaryActionButton(this.btnSetCurrent, true);   // APPLIED
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
         try { console.warningln("Use this Image upgrade failed: " + eU.message); } catch (eW) {}
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
   optThemeApplyPrimaryActionButton(this.btnSetCurrent, true);   // APPLIED
   this.btnSetCurrent.enabled = false;
};

// >>> SPLIT COMPARE BEGIN >>>
OptPreviewPane.prototype.toggleSplitMode = function() {
   this.preview.isSplitMode = !this.preview.isSplitMode;
   if (this.preview.isSplitMode) {
      this.btnSplit.text = "[Split]";
      optThemeApplyPrimaryActionButton(this.btnSplit, false);
   } else {
      this.btnSplit.text = "Split";
      optThemeApplyActionButton(this.btnSplit);
   }
   if (optSafeView(this.lastRenderView)) {
      this.render(this.lastRenderView, false, this.lastRenderGradientView);
   }
};
// <<< SPLIT COMPARE END <<<

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

OptPreviewPane.prototype.exportCurrentTiff = function() {
   var view = this.candidateView || this.currentView;
   if (!optSafeView(view))
      return;
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
         try { console.warningln("Export TIF: full-resolution upgrade failed — " + eU.message); } catch (eW) {}
      } finally {
         this.preview.setBusy(false);
      }
   }
   try {
      var fd = new SaveFileDialog();
      fd.caption = "Export 16-bit TIFF (Photoshop compatible)";
      if (!fd.execute())
         return;
      var filePath = fd.fileName;
      if (!/\.tiff?$/i.test(filePath))
         filePath += ".tif";
      var img = toExport.image;
      // Create a native 16-bit integer ImageWindow — PixInsight normalizes [0,1]→[0,65535] automatically.
      var exportWin = new ImageWindow(
         img.width, img.height, img.numberOfChannels,
         16, false, img.isColor, ""
      );
      try {
         exportWin.mainView.beginProcess(UndoFlag_NoSwapFile);
         exportWin.mainView.image.assign(img);
         exportWin.mainView.endProcess();
         // Use FileFormatInstance to write with explicit compression=none.
         // writeImage() takes exactly one argument (the image); ImageDescription is not accepted.
         var F = new FileFormat("TIFF", false, true);
         if (F.isNull)
            throw new Error("TIFF format module not available.");
         var fInst = new FileFormatInstance(F);
         if (!fInst.create(filePath, "compression none"))
            throw new Error("Cannot create file: " + filePath);
         if (!fInst.writeImage(exportWin.mainView.image))
            throw new Error("TIFF write failed for: " + filePath);
         fInst.close();
         console.writeln("Exported 16-bit TIFF (uncompressed): " + filePath +
            " (" + img.width + "x" + img.height +
            ", " + img.numberOfChannels + "ch)");
      } finally {
         exportWin.close();
      }
   } catch (eX) {
      console.warningln("Export TIF: " + eX.message);
   } finally {
      if (tempUpgraded && tempUpgraded !== view)
         try { optCloseView(tempUpgraded); } catch (eTmp) {}
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
      optThemeApplyPrimaryActionButton(this.btnSetCurrent, false);  // READY
      this.btnSetCurrent.enabled = true;
   }
};

OptPreviewPane.prototype.releaseTransient = function() {
   optCloseViews([this.previousView, this.candidateView, this.candidateGradientView, this.currentGradientView]);
   try { if (this.preview) this.preview.setBitmap(null, false); } catch (eBmp) {}
   // >>> SPLIT COMPARE BEGIN >>>
   try { if (this.preview) this.preview.compareBitmap = null; } catch (eComp) {}
   this.previousActiveView = null;
   // <<< SPLIT COMPARE END <<<
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
   // Phase 3: outer padding around the two cards (s7 = 26 px) and gap
   // between them (s5 = 18 px), per DESIGN_SPEC §2.4 / §3.
   this.page.sizer.margin = Theme.s7;
   this.page.sizer.spacing = Theme.s5;

   // -------- Phase 3: left card wraps the ScrollBox --------
   // surface bg, hairline border, rXl radius; fixed 300 px wide (was 450).
   this.leftCard = new Control(this.page);
   try {
      this.leftCard.styleSheet =
         "QWidget {" +
         " background-color: " + Theme.surface + ";" +
         " border: 1px solid " + optThemeRgba("border") + ";" +
         " border-radius: " + Theme.rXl + "px;" +
         "}";
   } catch (eLc) {}
   this.leftCard.sizer = new VerticalSizer();
   this.leftCard.sizer.margin = 0;
   this.leftCard.sizer.spacing = 0;
   this.leftCard.setFixedWidth(340);  // Phase 6.5: 300 -> 340 to give labels + sliders more horizontal room across every tab.

   this.left = new ScrollBox(this.leftCard);
   this.left.autoScroll = true;
   this.leftContent = new Control(this.left);
   this.leftContent.sizer = new VerticalSizer();
   this.leftContent.sizer.margin = 6;
   this.leftContent.sizer.spacing = 6;
   this.left.viewport.sizer = new VerticalSizer();
   this.left.viewport.sizer.add(this.leftContent);
   this.leftCard.sizer.add(this.left);

   this.headerLabel = optEngineTitle(this.leftContent, title.toUpperCase() + " ENGINE");
   this.leftContent.sizer.add(this.headerLabel);

   this.selectionSection = optSection(this.leftContent, "Image Selection");
   this.selection = new OptSelectionPanel(dialog, tabName);
   this.selectionSection.body.sizer.add(this.selection.control);
   this.sections.push(this.selectionSection);
   this.leftContent.sizer.add(this.selectionSection.bar);
   this.leftContent.sizer.add(this.selectionSection.body);

   // -------- Phase 3: preview card wraps the preview pane --------
   // Same card styleSheet as the left card.
   this.previewCard = new Control(this.page);
   try {
      this.previewCard.styleSheet =
         "QWidget {" +
         " background-color: " + Theme.surface + ";" +
         " border: 1px solid " + optThemeRgba("border") + ";" +
         " border-radius: " + Theme.rXl + "px;" +
         "}";
   } catch (ePc) {}
   this.previewCard.sizer = new VerticalSizer();
   this.previewCard.sizer.margin = 0;
   this.previewCard.sizer.spacing = 0;

   this.preview = new OptPreviewPane(dialog, tabName, this.previewCard);
   this.previewCard.sizer.add(this.preview.control);

   this.page.sizer.add(this.leftCard);
   this.page.sizer.add(this.previewCard, 100);

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

// Calculates base preview dimensions maintaining exact aspect ratio from the minor axis,
// avoiding distortion from unequal rounding or clipping.
function optCalculateCompareBaseDims(sourceW, sourceH, renderReduction, minLimit) {
   var limit = minLimit || 128;
   var w = Math.round(sourceW / renderReduction);
   var h = Math.round(sourceH / renderReduction);
   if (sourceW <= 0 || sourceH <= 0) {
      return { width: Math.max(1, w), height: Math.max(1, h) };
   }
   if (sourceW < sourceH) {
      // Width is the minor axis
      if (w < limit) {
         w = limit;
         h = Math.round(limit * (sourceH / sourceW));
      }
   } else {
      // Height is the minor axis
      if (h < limit) {
         h = limit;
         w = Math.round(limit * (sourceW / sourceH));
      }
   }
   return { width: Math.max(1, w), height: Math.max(1, h) };
}

// ===== COMPARE-BEGIN — easy-rollback block (v138 Phase 1: GC) =====
// Builds a mosaic Bitmap from tile bitmaps. Each tile is drawn scaled into its cell
// preserving its original aspect ratio, with an amber border and a labelled header strip.
// Missing tiles (algorithm not installed or failed) get a flat dark cell.
// The mosaic is sized to mosaicW x mosaicH so zoom/pan logic works without extra plumbing.
function optBuildCompareMosaicBitmap(tiles, mosaicW, mosaicH, cols) {
   var n = tiles && tiles.length ? tiles.length : 0;
   if (n < 1)
      return null;
   if (cols === undefined || cols === null) {
      // Layout: 1 tile = 1x1, 2 = 2x1, 3 = 3x1 (clean horizontal triplet),
      // 4 = 2x2. The (n <= 3) branch keeps 3-engine comparisons aligned
      // on a single row instead of falling into a 2x2 grid with one
      // empty cell, which read as broken.
      cols = (n <= 3) ? Math.max(1, n) : 2;
   }
   var rows = Math.ceil(n / cols);
   var bmp = new Bitmap(mosaicW, mosaicH);
   bmp.fill(0xFF101012);
   var g = new Graphics(bmp);
   try {
      var cellW = Math.floor(mosaicW / cols);
      var cellH = Math.floor(mosaicH / rows);
      try { g.font = new Font("Segoe UI", 10); } catch (eFont) {}
      for (var i = 0; i < n; ++i) {
         var c = i % cols;
         var r = Math.floor(i / cols);
         var x = c * cellW;
         var y = r * cellH;
         var tile = tiles[i] || {};
         // Clean cell background first
         g.fillRect(new Rect(x, y, x + cellW, y + cellH), new Brush(0xFF1f1f23));
         if (tile.bmp) {
            // Determine dimensions and scale factor to fit maintaining aspect ratio
            var tileW = tile.bmp.width;
            var tileH = tile.bmp.height;
            var scale = Math.min(cellW / Math.max(1, tileW), cellH / Math.max(1, tileH));
            var drawW = Math.round(tileW * scale);
            var drawH = Math.round(tileH * scale);
            // Center the drawn image inside the cell
            var offsetX = Math.round((cellW - drawW) / 2);
            var offsetY = Math.round((cellH - drawH) / 2);
            var targetRect = new Rect(x + offsetX, y + offsetY, x + offsetX + drawW, y + offsetY + drawH);
            try { g.drawScaledBitmap(targetRect, tile.bmp); } catch (eDS) {
               try { g.drawScaledBitmap(targetRect.left, targetRect.top, targetRect.right, targetRect.bottom, tile.bmp); } catch (eDS2) {}
            }
         }
         // Header strip with semi-transparent black band + label text.
         g.fillRect(new Rect(x + 1, y + 1, x + cellW - 1, y + 22), new Brush(0xCC000000));
         g.pen = new Pen(0xFFFFFFFF, 1);
         var labelText = (i + 1) + ". " + (tile.label || "");
         if (tile.error)
            labelText += "  [" + tile.error + "]";
         g.drawTextRect(new Rect(x + 8, y + 3, x + cellW - 8, y + 21), labelText, TextAlign_Left | TextAlign_VertCenter);
         // Cell border in theme amber.
         g.pen = new Pen(0xFFd9a560, 1);
         g.drawRect(new Rect(x, y, x + cellW - 1, y + cellH - 1));
      }
   } finally {
      try { g.end(); } catch (eG) {}
   }
   return bmp;
}

// Runs every Gradient Correction algorithm exposed by the combo against
// a clone of the currently active Pre image, stores each full-resolution
// result in the corresponding memory slot (1..N), and renders a 2x2
// labelled mosaic into the preview so the user can compare them at a
// glance. After Compare the user inspects individual variants by
// right-clicking a memory slot and commits the winner with
// "Use this Image" — the standard memory-recall path commits the
// full-resolution slot view directly without any upgrade step.
function optCompareGradientCorrection(dlg) {
   if (!dlg || !dlg.preTab || !dlg.preTab.preview)
      throw new Error("Pre Processing pane not available.");
   var pane = dlg.preTab.preview;
   if (!pane.currentKey || !optSafeView(pane.currentView))
      throw new Error("Select a Pre Processing image first.");
   var combo = dlg.comboPreGradient;
   if (!combo)
      throw new Error("Gradient Correction combo not available.");
   var sourceView = pane.currentView;
   var sourceKey = pane.currentKey;
   var sourceW = sourceView.image.width;
   var sourceH = sourceView.image.height;
   var originalIdx = -1;
   try { originalIdx = combo.currentItem; } catch (eOI) { originalIdx = 0; }
   var tiles = [];
   var renderReduction = dlg.sharedPreviewReduction || OPT_PREVIEW_REDUCTION_DEFAULT;
   var baseDims = optCalculateCompareBaseDims(sourceW, sourceH, renderReduction, 128);
   var baseW = baseDims.width;
   var baseH = baseDims.height;
   var names = ["MGC", "AutoDBE", "ABE", "GraXpert"];
   var maxItems = Math.min(names.length, (typeof combo.numberOfItems === "number") ? combo.numberOfItems : names.length);

   // Recompute availability locally — the same predicates used by
   // optApplyProcessAvailabilityToUI, but kept local so Compare does
   // not depend on stale shared state.
   var hasMGC  = optDependencyProcessExists("MultiscaleGradientCorrection");
   var hasDBE  = optIsAutoDBEAvailable();
   var hasABE  = optDependencyProcessExists("AutomaticBackgroundExtractor");
   var hasGraX = (typeof optHasGraXpertProcess === "function" ? optHasGraXpertProcess() : false) || (typeof GraXpertLib !== "undefined");
   var avail = [hasMGC, hasDBE, hasABE, hasGraX];

   pane.preview.setBusy(true, "Compare: running gradient algorithms...");
   try {
      for (var i = 0; i < maxItems; ++i) {
         var tile = { index: i, label: names[i], bmp: null, error: null };
         if (!avail[i]) {
            tile.error = "not installed";
            tiles.push(tile);
            continue;
         }
         var candidate = null;
         var resultView = null;
         var gradientView = null;
         var ownedResult = true;
         try {
            try { combo.currentItem = i; } catch (eCSet) {}
            try { if (typeof dlg.syncPreGradientPanels === "function") dlg.syncPreGradientPanels(i); } catch (eSync) {}
            try { processEvents(); } catch (ePE) {}
            candidate = optCloneView(sourceView, "Opt_Compare_GC_" + i + "_" + sourceView.id, false);
            if (!optSafeView(candidate))
               throw new Error("Could not clone source view for " + names[i] + ".");
            var result = optApplyPreCandidate(candidate, "gradient", dlg);
            resultView = candidate;
            if (result && typeof result === "object" && !optSafeView(result)) {
               if (optSafeView(result.view)) resultView = result.view;
               else if (optSafeView(result.continueView)) resultView = result.continueView;
               if (optSafeView(result.gradientView)) gradientView = result.gradientView;
               else if (result.bkgView && optSafeView(result.bkgView)) gradientView = result.bkgView;
            }
            if (!optSafeView(resultView))
               throw new Error("Algorithm " + names[i] + " returned no usable view.");
            // Memory.store clones the view internally — we can release the
            // engine output once the slot has captured its own copy.
            var meta = {
               image: optLabelForKey(sourceKey),
               menu: "GC",
               algorithm: names[i],
               stage: "Compare: " + names[i],
               signature: "Compare|GC|" + names[i],
               compareKind: "gradient",
               method: names[i]
            };
            pane.memory.store(i, sourceKey, resultView, meta, gradientView);
            // Render each tile using calculated base dimensions to prevent aspect ratio distortion
            tile.bmp = optRenderPreviewBitmapToSize(resultView, baseW, baseH, "mad-unlinked");
         } catch (eRun) {
            tile.error = (eRun && eRun.message) ? eRun.message : ("" + eRun);
            try { console.warningln("Compare GC " + names[i] + " failed: " + tile.error); } catch (eW) {}
         }
         // Cleanup transient views regardless of success.
         if (resultView && optSafeView(resultView) && (!candidate || resultView.id !== (candidate ? candidate.id : "")))
            try { optCloseView(resultView); } catch (eClR) {}
         if (candidate && optSafeView(candidate))
            try { optCloseView(candidate); } catch (eClC) {}
         if (gradientView && optSafeView(gradientView))
            try { optCloseView(gradientView); } catch (eClG) {}
         tiles.push(tile);
      }
   } finally {
      try { combo.currentItem = originalIdx; } catch (eRest) {}
      try { if (typeof dlg.syncPreGradientPanels === "function") dlg.syncPreGradientPanels(originalIdx); } catch (eSyncR) {}
      pane.preview.setBusy(false);
   }

   // Mosaic dimensions follow the grid layout so each cell stays at the
   // source's native aspect ratio (cols * baseW × rows * baseH). See the
   // matching block in optCompareCombo for the rationale; the previous
   // implementation only worked by coincidence for the 2×2 case.
   var nGC = tiles.length;
   var gcCols = (nGC <= 3) ? Math.max(1, nGC) : 2;
   var gcRows = Math.ceil(nGC / gcCols);
   var mosaicW = gcCols * baseW;
   var mosaicH = gcRows * baseH;
   // Cap mosaic so very large images do not allocate huge bitmaps.
   var MAX_MOSAIC = 2400;
   if (mosaicW > MAX_MOSAIC) { mosaicH = Math.round(mosaicH * (MAX_MOSAIC / mosaicW)); mosaicW = MAX_MOSAIC; }
   if (mosaicH > MAX_MOSAIC) { mosaicW = Math.round(mosaicW * (MAX_MOSAIC / mosaicH)); mosaicH = MAX_MOSAIC; }
   var mosaic = optBuildCompareMosaicBitmap(tiles, mosaicW, mosaicH, gcCols);
   var validCount = 0;
   for (var k = 0; k < tiles.length; ++k) if (tiles[k].bmp) ++validCount;
   var statusLabel = "<b>Compare:</b> " + validCount + "/" + tiles.length +
      " variants stored in Memory 1-" + tiles.length +
      ". Right-click a slot to inspect, then click Use this Image to commit the winner.";
   pane.renderBitmap(mosaic, statusLabel, true, gcCols * sourceW, gcRows * sourceH);
}
// ===== COMPARE-END =====

// ===== COMPARE-BEGIN — Phase 2 generic helper + wrappers =====
// Generic Compare driver shared by Decon, Noise Reduction, Stretch zones
// and Star Split. It abstracts the loop over combo items, the per-iter
// engine call (delegated to opts.runOne), the memory slot store with
// compare meta, the per-tile bitmap render and the mosaic composition.
// The existing optCompareGradientCorrection() is left untouched on
// purpose (it already works in production); this driver only services
// the new sections.
//
// opts contract:
//   pane         OptPreviewPane (target tab's preview)
//   combo        ComboBox (algorithm selector)
//   names        [string]  user-facing algorithm names; one per combo item
//   available    [bool]    parallel array; false → tile renders "not installed"
//   syncFn       optional function(idx) — updates UI before engine runs
//   menuCode     short code used in slot meta (e.g. "Dec", "NR", "RGB", "STR", "SS")
//   compareKind  meta tag consumed by setToCurrent (e.g. "decon", "nr", "stretch_rgb",
//                "stretch_stars", "star_split")
//   stretchMode  passed to optRenderPreviewBitmapToSize; "" for post-stretch tabs,
//                "mad-unlinked" for linear tabs
//   skipIndices  optional [int]  combo positions that have no comparable
//                output (e.g. interactive Curves item in Stretch zones)
//   busyText     string shown in the preview busy overlay
//   runOne       function(sourceView, idx) → view | { view, gradientView?, companionView? }
//                Responsible for cloning sourceView, running the engine
//                and freeing any intermediate views; returns the result.
function optCompareCombo(opts) {
   if (!opts || !opts.pane)
      throw new Error("optCompareCombo: opts.pane required");
   var pane = opts.pane;
   if (!pane.currentKey || !optSafeView(pane.currentView))
      throw new Error("Select an image first.");
   var combo = opts.combo;
   if (!combo)
      throw new Error("Compare: algorithm combo not available.");
   var names = opts.names || [];
   var available = opts.available || [];
   var skip = opts.skipIndices || [];
   var sourceView = pane.currentView;
   var sourceKey = pane.currentKey;
   var sourceW = sourceView.image.width;
   var sourceH = sourceView.image.height;
   var originalIdx = 0;
   try { originalIdx = combo.currentItem; } catch (eOI) { originalIdx = 0; }
   var tiles = [];
   var dlg = pane.dialog;
   var renderReduction = (dlg && dlg.sharedPreviewReduction) ? dlg.sharedPreviewReduction : (typeof OPT_PREVIEW_REDUCTION_DEFAULT !== "undefined" ? OPT_PREVIEW_REDUCTION_DEFAULT : 1);
   var baseDims = optCalculateCompareBaseDims(sourceW, sourceH, renderReduction, 128);
   var baseW = baseDims.width;
   var baseH = baseDims.height;
   var maxItems = Math.min(names.length, (typeof combo.numberOfItems === "number") ? combo.numberOfItems : names.length);
   var slotIndex = 0;

   function isSkipped(i) {
      for (var j = 0; j < skip.length; ++j) if (skip[j] === i) return true;
      return false;
   }

   pane.preview.setBusy(true, opts.busyText || "Compare: running...");
   try {
      for (var i = 0; i < maxItems; ++i) {
         if (isSkipped(i))
            continue;
         var tile = { index: i, label: names[i] || ("Item " + i), bmp: null, error: null };
         if (!available[i]) {
            tile.error = "not installed";
            tiles.push(tile);
            ++slotIndex;
            continue;
         }
         var runResult = null;
         var resultView = null;
         var gradientView = null;
         var companionView = null;
         try {
            try { combo.currentItem = i; } catch (eCSet) {}
            if (typeof opts.syncFn === "function") {
               try { opts.syncFn(i); } catch (eSync) {}
            }
            try { processEvents(); } catch (ePE) {}
            runResult = opts.runOne(sourceView, i);
            if (!runResult)
               throw new Error((names[i] || ("Item " + i)) + " returned no result.");
            if (optSafeView(runResult)) {
               resultView = runResult;
            } else if (typeof runResult === "object") {
               if (optSafeView(runResult.view)) resultView = runResult.view;
               else if (optSafeView(runResult.continueView)) resultView = runResult.continueView;
               if (optSafeView(runResult.gradientView)) gradientView = runResult.gradientView;
               else if (runResult.bkgView && optSafeView(runResult.bkgView)) gradientView = runResult.bkgView;
               if (optSafeView(runResult.companionView)) companionView = runResult.companionView;
            }
            if (!optSafeView(resultView))
               throw new Error("Algorithm " + (names[i] || ("Item " + i)) + " returned no usable view.");
            var meta = {
               image: optLabelForKey(sourceKey),
               menu: opts.menuCode || "M",
               algorithm: names[i] || ("Alg" + i),
               stage: "Compare: " + (names[i] || ("Item " + i)),
               signature: "Compare|" + (opts.menuCode || "M") + "|" + (names[i] || i),
               compareKind: opts.compareKind || "compare",
               method: names[i] || ("Item " + i)
            };
            pane.memory.store(slotIndex, sourceKey, resultView, meta, gradientView, companionView);
            // Render each tile using calculated base dimensions to prevent aspect ratio distortion
            tile.bmp = optRenderPreviewBitmapToSize(resultView, baseW, baseH, opts.stretchMode || "");
         } catch (eRun) {
            tile.error = (eRun && eRun.message) ? eRun.message : ("" + eRun);
            try { console.warningln("Compare " + (opts.menuCode || "") + " " + (names[i] || i) + " failed: " + tile.error); } catch (eW) {}
         }
         // memory.store cloned everything, so we can release the engine
         // outputs once the slot owns its own copies.
         if (resultView && optSafeView(resultView))
            try { optCloseView(resultView); } catch (eClR) {}
         if (gradientView && optSafeView(gradientView))
            try { optCloseView(gradientView); } catch (eClG) {}
         if (companionView && optSafeView(companionView))
            try { optCloseView(companionView); } catch (eClC) {}
         tiles.push(tile);
         ++slotIndex;
      }
   } finally {
      try { combo.currentItem = originalIdx; } catch (eRest) {}
      if (typeof opts.syncFn === "function") {
         try { opts.syncFn(originalIdx); } catch (eSyncR) {}
      }
      pane.preview.setBusy(false);
   }

   // Mosaic dimensions follow the grid layout — cols * baseW wide,
   // rows * baseH tall — so every cell ends up exactly source-shaped.
   // Without this the 2-tile case (cols=2, rows=1) was halving the cell
   // width while keeping full height, which stretched each tile
   // vertically. The 4-tile case (cols=2, rows=2) preserved aspect
   // accidentally because both axes were halved equally.
   var n = tiles.length;
   var cols = opts.cols || ((n <= 3) ? Math.max(1, n) : 2);
   var rows = Math.ceil(n / cols);
   var mosaicW = cols * baseW;
   var mosaicH = rows * baseH;
   var MAX_MOSAIC = 2400;
   if (mosaicW > MAX_MOSAIC) { mosaicH = Math.round(mosaicH * (MAX_MOSAIC / mosaicW)); mosaicW = MAX_MOSAIC; }
   if (mosaicH > MAX_MOSAIC) { mosaicW = Math.round(mosaicW * (MAX_MOSAIC / mosaicH)); mosaicH = MAX_MOSAIC; }
   var mosaic = optBuildCompareMosaicBitmap(tiles, mosaicW, mosaicH, cols);
   var validCount = 0;
   for (var k = 0; k < tiles.length; ++k) if (tiles[k].bmp) ++validCount;
   var statusLabel = "<b>Compare:</b> " + validCount + "/" + tiles.length +
      " variants stored in Memory 1-" + tiles.length +
      ". Right-click a slot to inspect, then click Use this Image to commit the winner.";
   // The preview's pixel-coordinate scaling assumes the bitmap represents
   // the source view, so pass the source dimensions multiplied by the
   // grid — otherwise clicking on a tile would map to wrong source
   // coordinates if any per-cell interaction is added later.
   pane.renderBitmap(mosaic, statusLabel, true, cols * sourceW, rows * sourceH);
}

// --- Wrappers --------------------------------------------------------------

function optComparePreDeconvolution(dlg) {
   if (!dlg || !dlg.preTab) throw new Error("Pre tab not available.");
   var combo = dlg.comboPreDecon;
   if (!combo) throw new Error("Deconvolution combo not available.");
   var hasBXT = (typeof BlurXTerminator !== "undefined");
   var hasCC  = (typeof optIsCosmicClarityAvailable === "function") ? optIsCosmicClarityAvailable() : false;
   optCompareCombo({
      pane: dlg.preTab.preview,
      combo: combo,
      names: ["BlurXTerminator", "Cosmic Clarity"],
      available: [hasBXT, hasCC],
      syncFn: function(idx) { if (typeof dlg.syncPreDeconPanels === "function") dlg.syncPreDeconPanels(idx); },
      menuCode: "Dec",
      compareKind: "decon",
      stretchMode: "mad-unlinked",
      busyText: "Compare: running deconvolution algorithms...",
      runOne: function(sourceView, idx) {
         var candidate = optCloneView(sourceView, "Opt_Compare_Dec_" + idx + "_" + sourceView.id, false);
         try {
            return optApplyPreCandidate(candidate, "decon", dlg);
         } catch (eR) {
            try { optCloseView(candidate); } catch (eC) {}
            throw eR;
         }
      }
   });
}

function optComparePostNoiseReduction(dlg) {
   if (!dlg || !dlg.postTab) throw new Error("Post tab not available.");
   var combo = dlg.comboPostNR;
   if (!combo) throw new Error("Noise Reduction combo not available.");
   var hasNXT = (typeof NoiseXTerminator !== "undefined") || (typeof optDependencyProcessExists === "function" && optDependencyProcessExists("NoiseXTerminator"));
   var hasTGV = (typeof optDependencyProcessExists === "function") ? optDependencyProcessExists("TGVDenoise") : (typeof TGVDenoise !== "undefined");
   var hasCC  = (typeof optIsCosmicClarityAvailable === "function") ? optIsCosmicClarityAvailable() : false;
   var hasGraX = (typeof optHasGraXpertProcess === "function" ? optHasGraXpertProcess() : false) || (typeof GraXpertLib !== "undefined");
   // PRISM-INTEGRATION-BEGIN
   var hasPrism = (typeof optIsPrismAvailable === "function") ? optIsPrismAvailable() : false;
   // PRISM-INTEGRATION-END
   optCompareCombo({
      pane: dlg.postTab.preview,
      combo: combo,
      // PRISM-INTEGRATION-BEGIN
      names: ["NoiseXTerminator", "TGVDenoise", "Cosmic Clarity", "GraXpert Denoise", "Prism (SyQon)"],
      available: [hasNXT, hasTGV, hasCC, hasGraX, hasPrism],
      // PRISM-INTEGRATION-END
      syncFn: function(idx) { if (typeof dlg.syncPostNRPanels === "function") dlg.syncPostNRPanels(idx); },
      menuCode: "NR",
      compareKind: "nr",
      stretchMode: "",                  // Post is already stretched; do not re-stretch
      busyText: "Compare: running noise-reduction algorithms...",
      runOne: function(sourceView, idx) {
         var candidate = optCloneView(sourceView, "Opt_Compare_NR_" + idx + "_" + sourceView.id, false);
         try {
            return optApplyPostCandidate(candidate, "post_nr", dlg);
         } catch (eR) {
            try { optCloseView(candidate); } catch (eC) {}
            throw eR;
         }
      }
   });
}

function optComparePostSharpening(dlg) {
   if (!dlg || !dlg.postTab) throw new Error("Post tab not available.");
   var combo = dlg.comboPostSharp;
   if (!combo) throw new Error("Sharpening combo not available.");
   var hasBXT = (typeof BlurXTerminator !== "undefined") || (typeof optDependencyProcessExists === "function" && optDependencyProcessExists("BlurXTerminator"));
   var hasUSM = true;
   var hasHDR = true;
   var hasLHE = true;
   var hasDSE = true;
   var hasCC  = (typeof optIsCosmicClarityAvailable === "function") ? optIsCosmicClarityAvailable() : false;
   optCompareCombo({
      pane: dlg.postTab.preview,
      combo: combo,
      names: ["BlurXTerminator", "Unsharp Mask", "HDR Multiscale Transform", "Local Histogram Equalization", "Dark Structure Enhance", "Cosmic Clarity"],
      available: [hasBXT, hasUSM, hasHDR, hasLHE, hasDSE, hasCC],
      cols: 3,
      syncFn: function(idx) { if (typeof dlg.syncPostSharpPanels === "function") dlg.syncPostSharpPanels(idx); },
      menuCode: "SH",
      compareKind: "post_sharp",
      stretchMode: "",                  // Post is already stretched; do not re-stretch
      busyText: "Compare: running sharpening algorithms...",
      runOne: function(sourceView, idx) {
         var candidate = optCloneView(sourceView, "Opt_Compare_SH_" + idx + "_" + sourceView.id, false);
         try {
            return optApplyPostCandidate(candidate, "post_sharp", dlg);
         } catch (eR) {
            try { optCloseView(candidate); } catch (eC) {}
            throw eR;
         }
      }
   });
}

function optCompareStretchZone(zone, dlg) {
   if (!zone || !zone.combo) throw new Error("Stretch zone combo not available.");
   var isStars = zone.isStars === true;
   var pane = dlg.stretchTab.preview;
   // Map combo items to availability and skip the interactive "Curves"
   // item; it is not a stretch algorithm that produces a comparable
   // candidate (it edits the live displayed view via point dragging).
   var labels = [];
   var avail = [];
   var skip = [];
   for (var i = 0; i < zone.combo.numberOfItems; ++i) {
      var algoId = zone.algorithmIds[i] || ("ALG" + i);
      var label = "";
      try { label = zone.combo.itemText(i); } catch (eIT) { label = algoId; }
      labels.push(label || algoId);
      // Curves is interactive — skip in Compare.
      if (algoId === "CURVES") {
         skip.push(i);
         avail.push(false);
         continue;
      }
      // Engine availability checks — assume true unless we know better.
      // VeraLux requires its support to be loaded.
      if (algoId === "VLX") {
         avail.push(typeof optVeraLuxAvailable === "function" ? optVeraLuxAvailable() : true);
         continue;
      }
      if (algoId === "MAS") {
         avail.push(typeof optDependencyProcessExists === "function" ? optDependencyProcessExists("MultiscaleAdaptiveStretch") : true);
         continue;
      }
      avail.push(true);  // STF, Statistical, Star Stretch — always available
   }
   optCompareCombo({
      pane: pane,
      combo: zone.combo,
      names: labels,
      available: avail,
      skipIndices: skip,
      syncFn: function(idx) { try { if (typeof zone.sync === "function") zone.sync(); } catch (eS) {} },
      menuCode: isStars ? "STR" : "RGB",
      compareKind: isStars ? "stretch_stars" : "stretch_rgb",
      stretchMode: "",                  // results are non-linear already; no MAD stretch
      busyText: "Compare: running " + (isStars ? "stars" : "RGB/Starless") + " stretch algorithms...",
      runOne: function(sourceView, idx) {
         var candidate = optCloneView(sourceView, "Opt_Compare_Str_" + (isStars ? "S" : "R") + idx + "_" + sourceView.id, false);
         try {
            return optApplyStretchCandidate(candidate, zone.algorithmIds[idx], zone, dlg);
         } catch (eR) {
            try { optCloseView(candidate); } catch (eC) {}
            throw eR;
         }
      }
   });
}

// ===== COMPARE-SS-BEGIN — easy-rollback block (v140 Option B) =====
// Star Split Compare uses TWO memory slots per engine: an even slot
// for the Starless layer and the next-higher (odd) slot for the
// matching Stars layer. With 2 engines, slots 1..4 are populated; with
// 3 engines, slots 1..6. The mosaic is composed as a 2-column grid
// (Starless | Stars) × N rows (one per engine), so a single glance
// answers "which engine produces the cleanest starless AND which one
// produces the cleanest stars". Slot tooltips identify each cell
// unambiguously ("Memory 1: Starless (StarXTerminator)" etc.).
//
// Commit semantics: right-clicking any slot recalls that layer; the
// first "Use this Image" promotes that single layer to the workflow
// store (<Base>_Starless or <Base>_Stars), the mosaic disappears
// because the preview activates the just-committed view. The user is
// free to recall another slot afterwards and commit it too — mixing
// engines between layers (e.g. SXT for starless + StarNet2 for stars)
// works out of the box.
//
// To revert this block to the previous "single slot + companion view"
// design, restore the earlier optCompareStarSplit + the "star_split"
// branch in setToCurrent from git history (commit fd30ab3 and the v140
// commit that introduces this block).
function optCompareStarSplit(dlg) {
   if (!dlg || !dlg.stretchTab) throw new Error("Stretch tab not available.");
   var combo = dlg.comboStarSplitAlgo;
   if (!combo) throw new Error("Star Split algorithm combo not available.");
   var pane = dlg.stretchTab.preview;
   if (!pane.currentKey || !optSafeView(pane.currentView))
      throw new Error("Select a Stretching image first.");
   var hasSXT = (typeof StarXTerminator !== "undefined");
   var hasSN2 = (typeof StarNet2 !== "undefined");
   var hasSyQonStarless = optIsSyQonStarlessAvailable();
   var available = [hasSXT, hasSN2, hasSyQonStarless];
   var names = ["StarXTerminator", "StarNet2", "SyQon Starless"];
   var sourceView = pane.currentView;
   var sourceKey = pane.currentKey;
   var sourceW = sourceView.image.width;
   var sourceH = sourceView.image.height;
   var originalIdx = 0;
   try { originalIdx = combo.currentItem; } catch (eOI) {}
   var renderReduction = dlg.sharedPreviewReduction || (typeof OPT_PREVIEW_REDUCTION_DEFAULT !== "undefined" ? OPT_PREVIEW_REDUCTION_DEFAULT : 1);
   var baseDims = optCalculateCompareBaseDims(sourceW, sourceH, renderReduction, 128);
   var baseW = baseDims.width;
   var baseH = baseDims.height;
   var maxItems = Math.min(names.length, (typeof combo.numberOfItems === "number") ? combo.numberOfItems : names.length);
   var tiles = [];  // 2 per engine: starless tile first, then stars tile
   var slotIndex = 0;
   var baseKey = optBaseKey(sourceKey);

   pane.preview.setBusy(true, "Compare: running star-removal engines...");
   try {
      for (var i = 0; i < maxItems; ++i) {
         var slTile = { index: slotIndex, label: "Starless: " + names[i], bmp: null, error: null };
         var stTile = { index: slotIndex + 1, label: "Stars: " + names[i], bmp: null, error: null };
         if (!available[i]) {
            slTile.error = "not installed";
            stTile.error = "not installed";
            tiles.push(slTile);
            tiles.push(stTile);
            slotIndex += 2;
            continue;
         }
         var result = null;
         try {
            try { combo.currentItem = i; } catch (eCSet) {}
            try { processEvents(); } catch (ePE) {}
            var rec = { view: sourceView };
            result = dlg.runStarSplitEngineOn(rec, baseKey + "_Cmp" + i, i);
            if (!result || !optSafeView(result.starless))
               throw new Error("engine returned no starless layer");

            // Store starless in the even slot of this engine's pair.
            // Meta carries compareKind/layer so setToCurrent knows
            // which workflow key to commit into on "Use this Image".
            pane.memory.store(slotIndex, sourceKey, result.starless, {
               image: optLabelForKey(sourceKey),
               menu: "SS",
               algorithm: "Starless " + names[i],
               stage: "Compare Starless: " + names[i],
               signature: "Compare|SS|Starless|" + names[i],
               compareKind: "star_split_starless",
               method: names[i],
               layer: "starless"
            });
            // Augment the slot tooltip beyond the generic
            // "Memory N: ..." that store() applies so users can
            // tell starless from stars at a glance on the chips.
            try {
               if (pane.memory.buttons[slotIndex])
                  pane.memory.buttons[slotIndex].toolTip =
                     "Memory " + (slotIndex + 1) + ": <b>Starless</b> (" + names[i] + ")\n" +
                     "Right-click to inspect. Use this Image commits as <Base>_Starless.";
            } catch (eTip0) {}

            // Store stars in the odd slot of this engine's pair.
            if (optSafeView(result.stars)) {
               pane.memory.store(slotIndex + 1, sourceKey, result.stars, {
                  image: optLabelForKey(sourceKey),
                  menu: "SS",
                  algorithm: "Stars " + names[i],
                  stage: "Compare Stars: " + names[i],
                  signature: "Compare|SS|Stars|" + names[i],
                  compareKind: "star_split_stars",
                  method: names[i],
                  layer: "stars"
               });
               try {
                  if (pane.memory.buttons[slotIndex + 1])
                     pane.memory.buttons[slotIndex + 1].toolTip =
                        "Memory " + (slotIndex + 2) + ": <b>Stars</b> (" + names[i] + ")\n" +
                        "Right-click to inspect. Use this Image commits as <Base>_Stars.";
               } catch (eTip1) {}
            } else {
               stTile.error = "no stars layer";
            }

            // Tile bitmaps using calculated base dimensions to prevent aspect ratio distortion
            slTile.bmp = optRenderPreviewBitmapToSize(result.starless, baseW, baseH, "mad-linked");
            if (optSafeView(result.stars))
               stTile.bmp = optRenderPreviewBitmapToSize(result.stars, baseW, baseH, "mad-linked");
         } catch (eRun) {
            var msg = (eRun && eRun.message) ? eRun.message : ("" + eRun);
            slTile.error = msg;
            stTile.error = msg;
            try { console.warningln("Compare SS " + names[i] + " failed: " + msg); } catch (eW) {}
         }
         // Memory.store cloned the views, so we can release the engine outputs.
         if (result) {
            if (optSafeView(result.starless)) try { optCloseView(result.starless); } catch (eC0) {}
            if (optSafeView(result.stars))    try { optCloseView(result.stars); } catch (eC1) {}
         }
         tiles.push(slTile);
         tiles.push(stTile);
         slotIndex += 2;
      }
   } finally {
      try { combo.currentItem = originalIdx; } catch (eRest) {}
      pane.preview.setBusy(false);
   }

   // Mosaic: 2 columns (Starless | Stars) × N rows (one per engine).
   // optBuildCompareMosaicBitmap already picks cols=2 for n>=4, which
   // is exactly what we want when both engines are installed (4 tiles).
   // For corner cases (single engine, only 2 tiles) the layout falls
   // back to 2×1 which still reads as Starless | Stars side by side.
   var cols = 2;
   var rows = Math.ceil(tiles.length / cols);
   var baseW = Math.max(128, Math.round(sourceW / renderReduction));
   var baseH = Math.max(128, Math.round(sourceH / renderReduction));
   var mosaicW = cols * baseW;
   var mosaicH = rows * baseH;
   var MAX_MOSAIC = 2400;
   if (mosaicW > MAX_MOSAIC) { mosaicH = Math.round(mosaicH * (MAX_MOSAIC / mosaicW)); mosaicW = MAX_MOSAIC; }
   if (mosaicH > MAX_MOSAIC) { mosaicW = Math.round(mosaicW * (MAX_MOSAIC / mosaicH)); mosaicH = MAX_MOSAIC; }
   var mosaic = optBuildCompareMosaicBitmap(tiles, mosaicW, mosaicH);
   var validCount = 0;
   for (var k = 0; k < tiles.length; ++k) if (tiles[k].bmp) ++validCount;
   var statusLabel = "<b>Compare:</b> " + validCount + "/" + tiles.length +
      " Star Split tiles in Memory 1-" + tiles.length +
      ". Layout: <b>Starless | Stars</b> per row, one row per engine. " +
      "Right-click a slot to inspect; <b>Use this Image</b> commits that single layer " +
      "(Starless or Stars) — you can mix engines (e.g. SXT starless + StarNet2 stars).";
   pane.renderBitmap(mosaic, statusLabel, true, cols * sourceW, rows * sourceH);
}
// ===== COMPARE-SS-END =====
// ===== COMPARE-END =====

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
      var width = optHasOwn(spec, "width") ? spec.width : 0;
      var isPrimary = !(optHasOwn(spec, "primary") && spec.primary === false);
      var b = isPrimary
         ? optPrimaryButton(section.body, spec.text, width)
         : optButton(section.body, spec.text, width);
      b.__stageName = optHasOwn(spec, "stage") ? spec.stage : title;
      b.__actionKey = optHasOwn(spec, "actionKey") ? spec.actionKey : "";
      var pane = this.preview;
      var tab = this;
      wireButton(b, spec, tab, pane);
      // Phase 6: in-module action buttons get the compact gradient CTA
      // (32 px) for primaries, or the neutral action style for secondaries.
      // Stretch=1 makes them share the row when there are multiple.
      if (isPrimary)
         optThemeApplyModuleCta(b);
      else
         optThemeApplyActionButton(b);
      if (buttons.length > 1) section.body.sizer.add(b, 1);
      else                    section.body.sizer.add(b);
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
   if (useL) {
      // LRGB-WEIGHT-BEGIN — capture RGB backup before LRGB if weight != 100%
      var lrgbWeight = optGetLuminanceWeight(this.dialog);
      var rgbBackup = null;
      if (lrgbWeight !== 1.0) {
         try {
            rgbBackup = optCloneView(combined, "LRGB_Weight_Backup_" + combined.id, false);
         } catch (eClone) {
            try { console.warningln("[LRGB] Could not clone RGB for weight blend; falling back to standard LRGB. " + eClone.message); } catch (eW) {}
            rgbBackup = null;
         }
      }
      // LRGB-WEIGHT-END
      optApplyLuminanceLRGB(combined, l);
      // LRGB-WEIGHT-BEGIN — blend LRGB result with RGB backup using user weight
      if (rgbBackup && optSafeView(rgbBackup)) {
         try {
            optLrgbWeightBlend(combined, rgbBackup, lrgbWeight);
            try { console.writeln("[LRGB] Applied L blending weight: " + Math.round(lrgbWeight * 100) + "%."); } catch (eC) {}
         } finally {
            try { optCloseView(rgbBackup); } catch (eClose) {}
         }
      }
      // LRGB-WEIGHT-END
   }
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
   // DBXTRACT-BEGIN — branch when both HO and OS dual-band filter images are present.
   // Extracts Ha / OIII / SII via DBXtract.js and feeds them to the recipe combiner
   // as if they were the H / O / S inputs. Default palette is HSO unless the user
   // has clicked a specific palette button. To revert: delete this entire branch.
   var hoView = this.selection.view("HO");
   var soView = this.selection.view("OS");
   if (optSafeView(hoView) && optSafeView(soView)) {
      var palette = this.dialog.recipeManuallySelected ? this.dialog.selectedRecipe : "HSO";
      console.writeln("[NB] Dual-band detected (HO + OS) → DBXtract extraction, palette: " + palette);
      try {
         var extracted;
         try {
            extracted = optRunDBXtract(hoView, soView);
         } catch (eDbx) {
            throw new Error("DBXtract path failed: " + eDbx.message +
               "\nTip: ensure HO and OS are valid RGB images of identical geometry.");
         }
         var mapDbx = { H: extracted.ha, O: extracted.oiii, S: extracted.sii };
         var recipeDbx = optRecipeChannels(palette);
         var rD = mapDbx[recipeDbx[0]];
         var gD = mapDbx[recipeDbx[1]];
         var bD = mapDbx[recipeDbx[2]];
         var combinedDbx = optCreateRgbFromChannels(rD, gD, bD, "NB_RGB_DBX_" + palette, gD || rD || bD);
         optAnnotateNarrowbandView(combinedDbx, palette, "DBXtract Combination");
         this.setRecord("HSO", combinedDbx, true);
      } finally {
         // Always clean up DBXtract intermediates, even if combine threw partway through.
         optCloseDBXtractIntermediates();
      }
      return;
   }
   // DBXTRACT-END

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

// ===== STARNET2-BEGIN — easy-rollback block (v137) =====
// Resolves the user-facing StarNet2 stride label (Large / Standard / Small)
// into the integer or prototype constant expected by the StarNet2 process.
// Tries StarNet2.prototype.Stride_<Label> first, then defStride for the
// Standard case, then falls back to a sensible integer mapping. This lets
// the call site stay agnostic of build-specific stride encodings.
function optResolveStarNet2Stride(dlg) {
   var idx = 1; // Standard default
   try {
      if (dlg && dlg.comboStarSplitStride && typeof dlg.comboStarSplitStride.currentItem === "number")
         idx = dlg.comboStarSplitStride.currentItem;
   } catch (e0) {}
   var labels = ["Large", "Standard", "Small"];
   var label = labels[idx] || "Standard";
   if (typeof StarNet2 !== "undefined" && StarNet2.prototype) {
      var key = "Stride_" + label;
      if (typeof StarNet2.prototype[key] !== "undefined")
         return StarNet2.prototype[key];
      if (label === "Standard" && typeof StarNet2.prototype.defStride !== "undefined")
         return StarNet2.prototype.defStride;
   }
   // Integer fallback if the prototype does not expose named constants.
   // Larger numerical stride = coarser grid = faster inference, so Large
   // maps to the largest value and Small to the smallest.
   if (label === "Large") return 256;
   if (label === "Small") return 64;
   return 128; // Standard
}

// Updates the Split Stars button (enabled/disabled + reason tooltip)
// based on the engine currently chosen in the Algorithm combo. Called
// both at startup (from optApplyProcessAvailabilityToUI) and whenever
// the user changes the combo selection.
function optUpdateStarSplitButtonState(dlg) {
   if (!dlg || !dlg.btnCreateStarSplit)
      return;
   var idx = 0;
   try { if (dlg.comboStarSplitAlgo) idx = dlg.comboStarSplitAlgo.currentItem; } catch (e0) {}
   var available, engineLabel;
   if (idx === 1) {
      available = (typeof StarNet2 !== "undefined");
      engineLabel = "StarNet2";
   } else if (idx === 2) {
      available = optIsSyQonStarlessAvailable();
      engineLabel = "SyQon Starless";
   } else {
      available = (typeof StarXTerminator !== "undefined");
      engineLabel = "StarXTerminator";
   }
   try {
      if (available) {
         dlg.btnCreateStarSplit.enabled = true;
         dlg.btnCreateStarSplit.toolTip = "";
      } else {
         dlg.btnCreateStarSplit.enabled = false;
         dlg.btnCreateStarSplit.toolTip = engineLabel + " no está instalado en esta build de PixInsight. Selecciona otro algoritmo en el desplegable o instala el repositorio correspondiente.";
      }
   } catch (eUI) {}
}
// ===== STARNET2-END =====

// Detects which optional third-party processes/scripts are installed in the running
// PixInsight build and enables or disables the corresponding UI controls. Called
// from runDependencyChecks() after every tab is fully constructed.
function optApplyProcessAvailabilityToUI(dlg) {
   if (!dlg) return;

   // --- Availability flags ---
   var hasBXT  = optCreateBlurXTerminatorProcessInstance() != null;
   var hasNXT  = optCreateGenericProcessInstance(["NoiseXTerminator"], ["NXT", "NoiseXTerminator"]) != null;
   var hasGraX = optHasGraXpertProcess() || (typeof GraXpertLib !== "undefined");
   // Use optVeraLuxAvailable() (not the bare resolve+hasProcess combo) so the
   // dependency probe triggers optEnsureVeraLuxSupportLoaded() — the lazy load
   // that resolves the VeraLux library from candidate paths. Without this, at
   // first call the lib has never been touched, both checks return false,
   // hasVLX stays false, and the VLX option of the Stretch Preview buttons
   // gets permanently disabled even though VeraLux is installed.
   var hasVLX  = optVeraLuxAvailable();
   var hasMAS  = optDependencyProcessExists("MultiscaleAdaptiveStretch");
   var hasSPCC = optDependencyProcessExists("SpectrophotometricColorCalibration");
   var hasTGV  = optDependencyProcessExists("TGVDenoise");
   var hasABE  = optDependencyProcessExists("AutomaticBackgroundExtractor");
   var hasCC   = optIsCosmicClarityAvailable();
   var hasDBE  = optIsAutoDBEAvailable(); // lazy-load: OPT_PIW_HAS_AUTODBE is false at module load before scripts are resolved
   var hasMGC  = optDependencyProcessExists("MultiscaleGradientCorrection");
   var hasSXT  = (typeof StarXTerminator !== "undefined");
   var hasSN2  = (typeof StarNet2 !== "undefined");

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
   // Delegate to the shared helper so the button state stays in sync
   // with the Algorithm combo selection (SXT vs StarNet2).
   if (dlg.btnCreateStarSplit)
      optUpdateStarSplitButtonState(dlg);

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
   // Items: 0=NoiseXTerminator, 1=TGVDenoise, 2=Cosmic Clarity, 3=GraXpert Denoise, 4=Prism (SyQon)
   // PRISM-INTEGRATION-BEGIN
   var hasPrism = (typeof optIsPrismAvailable === "function") ? optIsPrismAvailable() : false;
   var nrAvail = [hasNXT, hasTGV, hasCC, hasGraX, hasPrism];
   var nrNames = ["NoiseXTerminator", "TGVDenoise", "Cosmic Clarity", "GraXpert Denoise", "Prism (SyQon)"];
   // PRISM-INTEGRATION-END
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
      "VeraLux",
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
      "VeraLux",
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
   this.recipeManuallySelected = false;   // DBXtract path uses HSO as default unless user clicks a palette button
   this.recipeButtons = [];
   this.sharedPreviewReduction = OPT_PREVIEW_REDUCTION_DEFAULT;
   this.__syncingSharedPreviewReduction = false;
   this.tabsByName = {};
   this.dependencyReport = optRunDependencyChecks();
   this.luminanceWeight = 1.0;   // LRGB-WEIGHT — default 100% (current behavior). Range [0..2].
   this.postActiveMask = null;
   this.postActiveMaskShown = false;
   this._postLiveMask = null;
   this._postLiveMaskBitmap = null;
   this.postFameState = null;
   this.postMaskMemory = new OptMaskMemoryManager(OPT_MASK_MEMORY_SLOTS);
   this.postMaskLiveCache = new OptPostMaskLiveCache();
   this._postShowHideMaskButtons = [];
   this.refreshPostMaskMemoryUi = null;
   this.removePostFameHooks = null;
   this.schedulePostMaskLive = null;

   this.sizer = new VerticalSizer();
   this.sizer.margin = 6;
   this.sizer.spacing = 4;
   this.titleBar = optBuildWorkflowTitleBar(this);
   this.sizer.add(this.titleBar);

   // Phase 2b: custom pill-segmented tab bar above the TabBox. Clicks here
   // drive `this.tabs.currentPageIndex`; TabBox.onPageSelected mirrors back.
   // >>> SPLIT COMPARE BEGIN >>>
   var dialogRef = this;
   var tabRow = new Control(this);
   tabRow.sizer = new HorizontalSizer();
   tabRow.sizer.spacing = 8;

   this.customTabBar = optBuildThemedTabBar(tabRow, [
      "Pre Processing",
      "Stretching",
      "Post Processing",
      "Channel Combination"
   ]);
   tabRow.sizer.add(this.customTabBar, 100);

   this.btnGlobalExport = optButton(tabRow, "Export", 60);
   optThemeApplyActionButton(this.btnGlobalExport);
   this.btnGlobalExport.toolTip = "<p><b>Export Image</b></p><p>Clones the current candidate or active image as a new PixInsight image window with all astrometric metadata intact.</p>";
   this.btnGlobalExport.onClick = function() {
      var activeTab = null;
      var idx = dialogRef.tabs.currentPageIndex;
      if (idx === 0) activeTab = dialogRef.preTab;
      else if (idx === 1) activeTab = dialogRef.stretchTab;
      else if (idx === 2) activeTab = dialogRef.postTab;
      else if (idx === 3) activeTab = dialogRef.ccTab;
      if (activeTab && activeTab.preview) {
         activeTab.preview.exportCurrent();
      }
   };

   this.btnGlobalExportTif = optButton(tabRow, "Export TIF", 80);
   optThemeApplyActionButton(this.btnGlobalExportTif);
   this.btnGlobalExportTif.toolTip = "<p><b>Export as 16-bit TIFF</b></p><p>Saves the current preview as a 16-bit uncompressed TIFF file compatible with Photoshop.</p>";
   this.btnGlobalExportTif.onClick = function() {
      var activeTab = null;
      var idx = dialogRef.tabs.currentPageIndex;
      if (idx === 0) activeTab = dialogRef.preTab;
      else if (idx === 1) activeTab = dialogRef.stretchTab;
      else if (idx === 2) activeTab = dialogRef.postTab;
      else if (idx === 3) activeTab = dialogRef.ccTab;
      if (activeTab && activeTab.preview) {
         activeTab.preview.exportCurrentTiff();
      }
   };

   tabRow.sizer.add(this.btnGlobalExport);
   tabRow.sizer.add(this.btnGlobalExportTif);
   this.sizer.add(tabRow);
   // <<< SPLIT COMPARE END <<<

   this.tabs = new TabBox(this);
   // Phase 2b: hide the native QTabBar; the custom bar above is the UI.
   try {
      this.tabs.styleSheet =
         "QTabWidget::pane { border: 0px; }" +
         "QTabBar { height: 0px; min-height: 0px; max-height: 0px; }" +
         "QTabBar::tab { height: 0px; min-height: 0px;" +
         " padding: 0px; margin: 0px; border: 0px; }";
   } catch (eHide) {}
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
   // Phase 2b: wire custom tab bar -> TabBox.currentPageIndex.
   // PJSR's TabBox does NOT reliably fire onPageSelected when
   // `currentPageIndex` is assigned from code, so a pill click would
   // visually switch the page but skip every onTabChanged side-effect
   // (collapseTabSections, optRefreshCcSlotCombos on CC, preview render).
   // We use a small "pending" flag so we can detect whether onPageSelected
   // fired and only call onTabChanged manually as a fallback. This avoids
   // double-firing on Qt builds where the event DOES fire normally.
   this.__pendingTabClick = -1;
   this.customTabBar.onTabClicked = function(index) {
      dlg.__pendingTabClick = index;
      try { dlg.tabs.currentPageIndex = index; } catch (e) {}
      // If onPageSelected fired synchronously above, it consumed the flag.
      // If it didn't (PJSR/Qt quirk on programmatic assignment), the flag
      // is still set and we drive onTabChanged manually so the CC combo
      // refresh, section collapse and preview render still happen.
      if (dlg.__pendingTabClick === index) {
         dlg.__pendingTabClick = -1;
         dlg.onTabChanged(index);
      }
   };
   this.tabs.onPageSelected = function(index) {
      // Phase 2b: keep the custom bar visually in sync, including the case
      // where another part of the code drives `currentPageIndex = N`
      // directly (see "To Stretching" / "To Post Processing" CTAs).
      dlg.__pendingTabClick = -1;
      try { dlg.customTabBar.setActiveTab(index); } catch (e) {}
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

function optBuildStretchZone(tab, title, isStars) {
   var dlg = tab.dialog;
   var section = optSection(tab.leftContent, title);
   var body = section.body;
   var algoLabels = isStars ?
      ["Star Stretch", "VeraLux", "Multiscale Adaptive Stretch", "Auto STF (Histogram Transform)", "Curves"] :
      ["Auto STF (Histogram Transform)", "Multiscale Adaptive Stretch", "Statistical Stretch", "VeraLux", "Curves"];
   var algoIds = isStars ? ["STAR", "VLX", "MAS", "STF", "CURVES"] : ["STF", "MAS", "SS", "VLX", "CURVES"];
   var rowAlgo = optComboRow(body, "Algorithm:", algoLabels, 80);
   body.sizer.add(rowAlgo.row);

   var zone = {
      isStars: isStars === true,
      section: section,
      combo: rowAlgo.combo,
      algorithmIds: algoIds
   };

   zone.stfGroup = optInnerGroup(body, "Auto STF Settings");
   zone.stfShadow = optNumeric(zone.stfGroup, "Shad. Clip.", -10.0, 0.0, isStars ? -0.5000 : -2.8000, 4, 80);
   zone.stfMid = optNumeric(zone.stfGroup, "Targ. Bkgd", 0.0, 1.0, isStars ? 0.0300 : 0.2500, 4, 80);
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
   zone.stfBoostClip = optNumeric(zone.stfGroup, "Boost Clip", 0.0, 5.0, 0.75, 2, 80);
   zone.stfBoostBg = optNumeric(zone.stfGroup, "Boost Bkgd", 0.0, 10.0, 2.00, 2, 80);
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
   zone.msBg = optNumeric(zone.masGroup, "Targ. Bkgd", 0.0, 1.0, isStars ? 0.020 : 0.150, 3, 80);
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
   zone.msAgg = optNumeric(zone.masGroup, "Aggress.", 0.0, 1.0, isStars ? 0.10 : 0.70, 2, 80);
   zone.msDrc = optNumeric(zone.masGroup, "Dyn. Range", 0.0, 1.0, isStars ? 0.05 : 0.40, 2, 80);
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
   zone.msCSAmount = optNumeric(zone.masGroup, "Amt", 0.0, 1.0, 0.75, 3, 80);
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
      zone.statMed = optNumeric(zone.statGroup, "Targ. Med", 0.01, 1.0, 0.25, 2, 80);
      zone.statBp = optNumeric(zone.statGroup, "Bp. Sigma", 0.0, 10.0, 5.0, 2, 80);
      zone.statClip = new CheckBox(zone.statGroup);
      zone.statClip.text = "No Black Clip";
      optApplyCheckBoxTooltip(zone.statClip);
      zone.statHdr = new CheckBox(zone.statGroup);
      zone.statHdr.text = "HDR Compress";
      zone.statHdr.checked = false;
      optApplyCheckBoxTooltip(zone.statHdr);
      zone.statHdrAmt = optNumeric(zone.statGroup, "HDR Amt", 0.0, 1.0, 0.25, 2, 80);
      zone.statHdrKnee = optNumeric(zone.statGroup, "HDR Knee", 0.1, 1.0, 0.35, 2, 80);
      zone.statLuma = new CheckBox(zone.statGroup);
      zone.statLuma.text = "Luma Only (preserve color)";
      zone.statLuma.checked = false;
      optApplyCheckBoxTooltip(zone.statLuma);
      zone.statBlend = optNumeric(zone.statGroup, "Luma Blend", 0.0, 1.0, 0.60, 2, 80);
      zone.statNorm = new CheckBox(zone.statGroup);
      zone.statNorm.text = "Normalize Range [0,1]";
      optApplyCheckBoxTooltip(zone.statNorm);
      zone.statCurve = optNumeric(zone.statGroup, "Cv. Boost", 0.0, 0.5, 0.00, 2, 80);
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
      zone.starAmount = optNumeric(zone.starGroup, "Stretch Amt", 0.0, 8.0, 5.0, 2, 90);
      zone.starSat = optNumeric(zone.starGroup, "Color Boost", 0.0, 2.0, 1.0, 2, 90);
      zone.starRemoveGreen = new CheckBox(zone.starGroup);
      zone.starRemoveGreen.text = "Remove Green via SCNR";
      optApplyCheckBoxTooltip(zone.starRemoveGreen);
      zone.starGroup.sizer.add(zone.starAmount);
      zone.starGroup.sizer.add(zone.starSat);
      zone.starGroup.sizer.add(zone.starRemoveGreen);
      body.sizer.add(zone.starGroup);
   }

   zone.vlxGroup = optInnerGroup(body, "VeraLux Settings");
   zone.vlxBg = optNumeric(zone.vlxGroup, "Target Bg:", 0.01, 1.0, 0.10, 2, 120);
   zone.vlxD = optNumeric(zone.vlxGroup, "Log D", 0.0, 7.0, 2.0, 2, 80);
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
   zone.curvesShadows = optNumeric(zone.curvesGroup, "Shadows", 0.0, 0.5, 0.0, 3, 150);
   zone.curvesHighlights = optNumeric(zone.curvesGroup, "Highlights", 0.0, 0.5, 0.0, 3, 150);
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

   // Phase 6.8: status label removed. It was redundant — the preview-pane
   // status line below the image already reports state, and the "Use this
   // Image" button enables only when a candidate is ready, so the inline
   // "Status: Waiting." / "Status: Preview ready." messages added noise
   // without information.

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
   // Phase 6: stretch both buttons (no fixed widths) so they share the row
   // evenly and survive the 300 px card; shorten "To Post Processing" to
   // "To Post Proc." so it does not get center-clipped at this width.
   zone.btnPreview = optPrimaryButton(rowButtons, "Preview", 0);
   optThemeApplyActionButton(zone.btnPreview);          // neutral secondary
   zone.btnToPost = optPrimaryButton(rowButtons, "To Post", 0);
   optThemeApplyPrimaryCta(zone.btnToPost);             // amber CTA
   rowButtons.sizer.add(zone.btnPreview, 1);
   rowButtons.sizer.add(zone.btnToPost, 1);
   body.sizer.add(rowButtons);

   // ===== COMPARE-BEGIN — Stretch zone Compare button on its own row =====
   // Compare lives on a second row below Preview / To Post so the
   // primary stretch path stays visually dominant; Compare is an
   // exploratory action and reads better as a follow-up step under
   // the main pair instead of squeezed between them.
   var rowCompare = new Control(body);
   rowCompare.sizer = new HorizontalSizer();
   rowCompare.sizer.spacing = 5;
   zone.btnCompare = optButton(rowCompare, "Compare", 0);
   optThemeApplyActionButton(zone.btnCompare);
   optApplyExplicitTooltip(zone.btnCompare, "button.Compare");
   zone.btnCompare.onClick = function() {
      optSafeUi(title + " Compare", function() {
         var key = dlg.resolveStretchZoneKey(isStars);
         if (!key)
            throw new Error(isStars ? "No STARS image available. Run Star Split first." : "No RGB / STARLESS image available in Stretching.");
         if (!tab.preview.activate(key, false))
            throw new Error(optLabelForKey(key) + " image is not valid.");
         processEvents();
         if (tab.preview.currentKey !== key)
            tab.preview.activate(key, false);
         optCompareStretchZone(zone, dlg);
      });
   };
   rowCompare.sizer.add(zone.btnCompare, 1);
   body.sizer.add(rowCompare);
   // ===== COMPARE-END =====

   zone.btnPreview.onClick = function() {
      optSafeUi(title + " Preview", function() {
         var key = dlg.resolveStretchZoneKey(isStars);
         if (!key)
            throw new Error(isStars ? "No STARS image available. Run SXT first." : "No RGB / STARLESS image available in Stretching.");
         if (!tab.preview.activate(key, false))
            throw new Error(optLabelForKey(key) + " image is not valid. Please run Star Split again.");
         processEvents();
         // Re-activate after processEvents: a scheduled live-preview callback may have
         // changed currentKey/currentView to the companion image during the event flush.
         if (tab.preview.currentKey !== key)
            tab.preview.activate(key, false);
         tab.preview.beginCandidate("Stretch " + zone.getAlgorithmId(), function(candidate) {
            return optApplyStretchCandidate(candidate, zone.getAlgorithmId(), zone, dlg);
         }, "stretch_" + zone.getAlgorithmId());
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

// ============================================================================
// >>> HEADER REDESIGN — Phase 2a — easy-rollback block <<<
// ----------------------------------------------------------------------------
// Replaces the original optBuildWorkflowTitleBar with the redesigned header
// described in DESIGN_SPEC §2.2:
//   - Painted 44×44 π logo: surface bg, amber 1.5px ring, italic glyph.
//   - Title "PI Workflow" in tTitle (14pt / 700).
//   - Sub-row: mono version label + "OPTIMIZED" pill (amberSoft / amberRing).
//   - Three header buttons (Thanks, Repositories, Help) restyled with surface
//     bg, borderStrong border, radius rLg, padding 0/16, hover surfaceHover.
// Event handlers are preserved verbatim (Thanks dialog, Repositories dialog,
// Help XHTML opener). To revert this phase, restore the previous
// optBuildWorkflowTitleBar from git history and delete this block.
// ============================================================================

// Picks the most rounded serif available for the π glyph in the logo. The
// spec asks for a soft, humanist look; we prefer Palatino / Book Antiqua /
// Georgia (rounded humanist serifs that ship with Windows) over Cambria or
// DejaVu Serif (more angular). Falls back gracefully if Font.families is
// not exposed by the running PJSR build.
function optThemePickGlyphFont() {
   var preferred = [
      "Palatino Linotype",
      "Book Antiqua",
      "URW Bookman L",
      "Bookman Old Style",
      "Georgia",
      "Cambria",
      "DejaVu Serif",
      "serif"
   ];
   var available = null;
   try { available = Font.families; } catch (e) { available = null; }
   if (!available || available.length < 1)
      return preferred[0]; // best-guess; Qt will substitute if unavailable
   // Font.families is a QStringList bridge object; indexing it directly
   // makes the PJSR strict engine emit Warning 162. Copy into a plain JS
   // array first via String coercion, then iterate on that array.
   var availArr = [];
   try {
      var n = available.length;
      for (var k = 0; k < n; ++k) {
         var fam = "";
         try { fam = String(available[k] || ""); } catch (eFK) {}
         if (fam.length > 0) availArr.push(fam);
      }
   } catch (eA) {}
   if (availArr.length < 1)
      return preferred[0];
   var byLower = {};
   for (var i = 0; i < availArr.length; ++i)
      byLower[availArr[i].toLowerCase()] = availArr[i];
   for (var j = 0; j < preferred.length; ++j) {
      var hit = byLower[preferred[j].toLowerCase()];
      if (hit) return hit;
   }
   return preferred[0];
}

function optThemeBuildLogoBitmap() {
   // Paints the 44×44 π logo as a Bitmap. Returns the Bitmap, never throws.
   // The spec calls for a conic amber gradient on the ring; PJSR has no
   // ConicalGradient class, so we approximate with a solid amber stroke.
   var bm;
   try {
      bm = new Bitmap(44, 44);
      bm.fill(0); // fully transparent
      var g = new Graphics(bm);
      try {
         g.antialiasing = true;
         g.brush = new Brush(optThemeColorInt("surface"));
         g.pen = new Pen(optThemeColorInt("amber"), 1.5);
         g.drawRoundedRect(1, 1, 42, 42, Theme.rXl, Theme.rXl);
         var family = optThemePickGlyphFont();
         var f = new Font(family);
         try { f.italic = true; } catch (e0) {}
         try { f.pixelSize = 26; } catch (e1) { try { f.pointSize = 18; } catch (e2) {} }
         try { f.bold = true; } catch (e3) {}
         g.font = f;
         g.pen = new Pen(optThemeColorInt("amber"));
         var tw = 16;
         try { tw = g.textWidth("π"); } catch (eW) {}
         // Baseline at y=30 leaves ~7 px headroom above and ~7 px below for
         // a 24-px glyph — visually centred in the 44-px tile.
         g.drawText(Math.round((44 - tw) / 2), 30, "π");
      } finally {
         g.end();
      }
   } catch (eAll) {
      // Painting failed: solid amber square as last-resort fallback.
      bm = new Bitmap(44, 44);
      bm.fill(optThemeColorInt("amber"));
   }
   return bm;
}

function optThemeApplyHeaderButton(btn) {
   if (!btn) return;
   try {
      btn.minHeight = 34;
      // borderStrong is alpha-encoded → must go through optThemeRgba so Qt's
      // CSS parser does not mistake the hex8 form for #AARRGGBB.
      btn.styleSheet =
         "QPushButton {" +
         " background-color: " + Theme.surface + ";" +
         " color: " + Theme.text + ";" +
         " border: 1px solid " + optThemeRgba("borderStrong") + ";" +
         " border-radius: " + Theme.rLg + "px;" +
         " padding-top: 0px; padding-bottom: 0px;" +
         " padding-left: 16px; padding-right: 16px;" +
         " font-size: 9pt; font-weight: 500;" +
         " outline: none;" +
         "} " +
         "QPushButton:hover { background-color: " + Theme.surfaceHover +
         "; border: 1px solid " + optThemeRgba("borderStrong") + "; } " +
         "QPushButton:pressed { background-color: " + Theme.surfaceRaised +
         "; border: 1px solid " + optThemeRgba("borderStrong") + "; } " +
         "QPushButton:focus { outline: none; border: 1px solid " +
         optThemeRgba("borderStrong") + "; }";
   } catch (e) {}
}

function optBuildWorkflowTitleBar(parent) {
   var bar = new Control(parent);
   try {
      bar.styleSheet =
         "QWidget { background-color: " + Theme.bg + "; border: 0px; }";
   } catch (eBar) {}
   bar.sizer = new HorizontalSizer();
   bar.sizer.margin = Theme.s5;        // 18 px on all sides → ~80 px total height
   bar.sizer.spacing = Theme.s4;       // 14 px between logo / title / buttons

   // -------- Logo (painted on a Control via onPaint) --------
   // PJSR's Label does not have a usable icon property for arbitrary Bitmap,
   // so we use a custom Control and paint the pre-built Bitmap in its
   // onPaint handler — the canonical pattern in this codebase.
   var logoBm = null;
   try { logoBm = optThemeBuildLogoBitmap(); } catch (eBmp) { logoBm = null; }
   var logo = new Control(bar);
   try {
      logo.styleSheet =
         "QWidget { background-color: transparent; border: 0px; }";
   } catch (eLs) {}
   try {
      logo.minWidth = 44; logo.maxWidth = 44;
      logo.minHeight = 44; logo.maxHeight = 44;
   } catch (eDim) {}
   if (logoBm !== null) {
      logo.onPaint = function() {
         var g = new Graphics(this);
         try { g.drawBitmap(0, 0, logoBm); } finally { g.end(); }
      };
   } else {
      // Last-resort fallback: a styled Label with the glyph in text form.
      // Replaces the Control with a Label inline because we already added
      // the Control to the sizer; we just paint inside it instead.
      logo.onPaint = function() {
         var g = new Graphics(this);
         try {
            g.antialiasing = true;
            g.brush = new Brush(optThemeColorInt("surface"));
            g.pen = new Pen(optThemeColorInt("amber"), 1);
            g.drawRoundedRect(0, 0, 43, 43, Theme.rXl, Theme.rXl);
         } finally { g.end(); }
      };
   }
   bar.sizer.add(logo);

   // -------- Title stack (title + version row) --------
   var titleStack = new Control(bar);
   try {
      titleStack.styleSheet =
         "QWidget { background-color: transparent; border: 0px; }";
   } catch (eTs) {}
   titleStack.sizer = new VerticalSizer();
   titleStack.sizer.margin = 0;
   titleStack.sizer.spacing = Theme.s1;

   var title = new Label(titleStack);
   title.text = "PI Workflow";
   title.styleSheet =
      "QLabel {" +
      " color: " + Theme.text + ";" +
      " font-size: 14pt; font-weight: 700;" +
      " background-color: transparent; border: 0px;" +
      "}";
   optApplyTooltip(title, "title", "PI Workflow", "Section");

   var subRow = new Control(titleStack);
   try {
      subRow.styleSheet =
         "QWidget { background-color: transparent; border: 0px; }";
   } catch (eSr) {}
   subRow.sizer = new HorizontalSizer();
   subRow.sizer.margin = 0;
   subRow.sizer.spacing = Theme.s2;

   var versionLabel = new Label(subRow);
   versionLabel.text = OPT_VERSION;
   versionLabel.styleSheet =
      "QLabel {" +
      " color: " + Theme.textMuted + ";" +
      " font-family: " + Theme.fontMono + ";" +
      " font-size: 8pt; font-weight: 500;" +
      " background-color: transparent; border: 0px;" +
      "}";

   var pill = new Label(subRow);
   pill.text = "OPTIMIZED";
   // amberSoft / amberRing are alpha-encoded; go through optThemeRgba so
   // Qt does not parse the hex8 form as #AARRGGBB.
   pill.styleSheet =
      "QLabel {" +
      " background-color: " + optThemeRgba("amberSoft") + ";" +
      " border: 1px solid " + optThemeRgba("amberRing") + ";" +
      " border-radius: 9px;" +
      " padding-top: 1px; padding-bottom: 1px;" +
      " padding-left: 8px; padding-right: 8px;" +
      " color: " + Theme.amber + ";" +
      " font-family: " + Theme.fontMono + ";" +
      " font-size: 8pt; font-weight: 600;" +
      "}";

   subRow.sizer.add(versionLabel);
   subRow.sizer.add(pill);
   subRow.sizer.addStretch();

   titleStack.sizer.add(title);
   titleStack.sizer.add(subRow);
   bar.sizer.add(titleStack);
   bar.sizer.addStretch();

   // -------- Header buttons (Thanks / Repositories / Help) --------
   var thanksButton = optButton(bar, "Thanks", 80);
   thanksButton.onClick = function() { optShowThanksDialog(bar); };
   optThemeApplyHeaderButton(thanksButton);

   var repoButton = optButton(bar, "Repositories", 130);
   repoButton.onClick = function() { optShowRecommendedRepositoriesDialog(bar); };
   optThemeApplyHeaderButton(repoButton);

   var helpButton = optButton(bar, "Help", 70);
   helpButton.onClick = function() {
      var helpPath = (#__FILE__).replace(/[^\\/]+$/, "") + "PI Workflow_help.xhtml";
      optOpenPathWithSystemViewer(helpPath);
   };
   optThemeApplyHeaderButton(helpButton);

   bar.sizer.add(thanksButton);
   bar.sizer.add(repoButton);
   bar.sizer.add(helpButton);

   return bar;
}
// ----------------------------------------------------------------------------
// <<< HEADER REDESIGN — Phase 2a ends here >>>
// ============================================================================


// ============================================================================
// >>> TAB BAR REDESIGN — Phase 2b — easy-rollback block <<<
// ----------------------------------------------------------------------------
// Replaces the native TabBox tab strip with a pill-segmented bar built from
// custom Frames (per DESIGN_SPEC §2.3). Strategy: we KEEP the TabBox for
// page management — every existing read/write of `this.tabs.currentPageIndex`
// keeps working — but we hide its native QTabBar via styleSheet and overlay
// our own Frame-based pill bar above. Clicks on the pill bar drive
// `tabs.currentPageIndex`; TabBox.onPageSelected drives the visual sync back.
//
// To revert: delete this block, remove the two new sizer additions in the
// constructor (customTabBar + the optBuildThemedTabBar call), and drop the
// styleSheet assignment on `this.tabs` that hides the native bar.
// ============================================================================

function optApplyTabPillStyle(tab, isActive) {
   if (!tab) return;
   try {
      if (isActive) {
         tab.styleSheet =
            "QWidget {" +
            " background-color: " + Theme.surfaceRaised + ";" +
            " border: 1px solid " + optThemeRgba("borderStrong") + ";" +
            " border-radius: " + Theme.rMd + "px;" +
            "}";
         if (tab.numberLabel) tab.numberLabel.styleSheet =
            "QLabel {" +
            " background-color: " + Theme.amber + ";" +
            " color: #15110a;" +
            " border: 0px;" +
            " border-radius: 3px;" +
            " padding-left: 5px; padding-right: 5px;" +
            " font-family: " + Theme.fontMono + ";" +
            " font-size: 9pt; font-weight: 700;" +
            " min-width: 14px; max-width: 18px;" +
            "}";
         if (tab.titleLabel) tab.titleLabel.styleSheet =
            "QLabel {" +
            " color: " + Theme.text + ";" +
            " background-color: transparent; border: 0px;" +
            " font-size: 10pt; font-weight: 600;" +
            "}";
      } else {
         tab.styleSheet =
            "QWidget {" +
            " background-color: transparent;" +
            " border: 1px solid transparent;" +
            " border-radius: " + Theme.rMd + "px;" +
            "}";
         if (tab.numberLabel) tab.numberLabel.styleSheet =
            "QLabel {" +
            " background-color: transparent;" +
            " color: " + Theme.textMuted + ";" +
            " border: 1px solid " + optThemeRgba("borderStrong") + ";" +
            " border-radius: 3px;" +
            " padding-left: 4px; padding-right: 4px;" +
            " font-family: " + Theme.fontMono + ";" +
            " font-size: 9pt; font-weight: 600;" +
            " min-width: 14px; max-width: 18px;" +
            "}";
         if (tab.titleLabel) tab.titleLabel.styleSheet =
            "QLabel {" +
            " color: " + Theme.textMuted + ";" +
            " background-color: transparent; border: 0px;" +
            " font-size: 10pt; font-weight: 500;" +
            "}";
      }
   } catch (e) {}
}

function optBuildTabPill(parent, index, label) {
   var tab = new Frame(parent);
   tab.sizer = new HorizontalSizer();
   tab.sizer.margin = Theme.s2;     // 8 px top/bottom
   tab.sizer.spacing = Theme.s2;    // 8 px between chip and title

   tab.numberLabel = new Label(tab);
   tab.numberLabel.text = String(index);
   tab.numberLabel.textAlignment = TextAlign_Center | TextAlign_VertCenter;

   tab.titleLabel = new Label(tab);
   tab.titleLabel.text = label;
   tab.titleLabel.textAlignment = TextAlign_Left | TextAlign_VertCenter;

   tab.sizer.add(tab.numberLabel);
   tab.sizer.add(tab.titleLabel);

   try { tab.cursor = new Cursor(StdCursor_PointingHand); } catch (e) {}
   return tab;
}

function optBuildThemedTabBar(parent, labels) {
   var bar = new Control(parent);
   try {
      bar.styleSheet =
         "QWidget {" +
         " background-color: " + Theme.surface + ";" +
         " border: 1px solid " + optThemeRgba("border") + ";" +
         " border-radius: " + Theme.rXl + "px;" +
         "}";
   } catch (eBg) {}
   bar.sizer = new HorizontalSizer();
   bar.sizer.margin = Theme.s1;     // 4 px container padding
   bar.sizer.spacing = Theme.s1;    // 4 px between pills

   var tabs = [];
   for (var i = 0; i < labels.length; ++i) {
      var t = optBuildTabPill(bar, i, labels[i]);
      tabs.push(t);
      bar.sizer.add(t);
   }
   bar.sizer.addStretch();

   bar.tabs = tabs;
   bar.activeIndex = 0;
   bar.onTabClicked = null;

   bar.setActiveTab = function(idx) {
      if (idx < 0 || idx >= this.tabs.length) return;
      this.activeIndex = idx;
      for (var k = 0; k < this.tabs.length; ++k)
         optApplyTabPillStyle(this.tabs[k], k === idx);
   };

   // Wire mouse-press events on each tab Frame. We use IIFE to capture i.
   for (var j = 0; j < tabs.length; ++j) {
      (function(idx, t) {
         t.onMousePress = function() {
            bar.setActiveTab(idx);
            if (bar.onTabClicked)
               bar.onTabClicked(idx);
         };
         // Also propagate the click from the children (label clicks would
         // otherwise be swallowed by the labels themselves on some Qt builds).
         if (t.numberLabel)
            t.numberLabel.onMousePress = function() { t.onMousePress(); };
         if (t.titleLabel)
            t.titleLabel.onMousePress = function() { t.onMousePress(); };
      })(j, tabs[j]);
   }

   bar.setActiveTab(0);
   return bar;
}
// ----------------------------------------------------------------------------
// <<< TAB BAR REDESIGN — Phase 2b ends here >>>
// ============================================================================


// ============================================================================
// >>> MODE SEGMENTED — Phase 4a — easy-rollback block <<<
// ----------------------------------------------------------------------------
// Styles the three-button mode selector (R+G+B / NB / RGB) in the Image
// Selection block per DESIGN_SPEC §2.6. The container becomes a dark pill
// (Theme.bg bg, hairline border, rLg radius, 3 px padding), and each
// PushButton becomes a borderless pill that flips between transparent
// (inactive) and amberSoft / amberRing (active) styling.
//
// To revert: delete this block, restore OPT_CSS_MODE_WRAPPER on this.modeRow
// in OptSelectionPanel, and use OPT_CSS_MODE_ON / OPT_CSS_MODE_OFF in
// OptSelectionPanel.setMode().
// ============================================================================

function optThemeStyleModeSegmentedContainer(widget) {
   if (!widget) return;
   try {
      widget.styleSheet =
         "QWidget {" +
         " background-color: " + Theme.bg + ";" +
         " border: 1px solid " + optThemeRgba("border") + ";" +
         " border-radius: " + Theme.rLg + "px;" +
         "}";
   } catch (e) {}
}

function optThemeStyleModeSegmentedButton(btn, isActive) {
   if (!btn) return;
   try {
      btn.minHeight = 30;
      btn.maxHeight = 30;
      if (isActive) {
         btn.styleSheet =
            "QPushButton {" +
            " background-color: " + optThemeRgba("amberSoft") + ";" +
            " color: " + Theme.amber + ";" +
            " border: 1px solid " + optThemeRgba("amberRing") + ";" +
            " border-radius: " + Theme.rSm + "px;" +
            " padding: 0px;" +
            " font-family: " + Theme.fontMono + ";" +
            " font-size: 9pt; font-weight: 700;" +
            " outline: none;" +
            "}" +
            "QPushButton:hover { background-color: " + optThemeRgba("amberSoft") +
            "; color: " + Theme.amber + "; }" +
            "QPushButton:focus { outline: none; }";
      } else {
         btn.styleSheet =
            "QPushButton {" +
            " background-color: transparent;" +
            " color: " + Theme.textMuted + ";" +
            " border: 1px solid transparent;" +
            " border-radius: " + Theme.rSm + "px;" +
            " padding: 0px;" +
            " font-family: " + Theme.fontMono + ";" +
            " font-size: 9pt; font-weight: 600;" +
            " outline: none;" +
            "}" +
            "QPushButton:hover { background-color: " + optThemeRgba("borderStrong") +
            "; color: " + Theme.text + "; }" +
            "QPushButton:focus { outline: none; }";
      }
   } catch (e) {}
}
// ----------------------------------------------------------------------------
// <<< MODE SEGMENTED — Phase 4a ends here >>>
// ============================================================================


// ============================================================================
// >>> RECIPE BUTTONS — Phase 6 polish — easy-rollback block <<<
// ----------------------------------------------------------------------------
// 12 small palette buttons (SHO, HOO, HSO, ... FORAXX) shown when the
// Image Selection mode is set to "NB". The legacy OPT_CSS_RECIPE styling
// produced cramped 35-40 px buttons that read as a checkerboard; this
// helper restyles them as thin mono pills inside the new amber theme.
// ============================================================================
function optThemeApplyRecipeButton(btn, isActive) {
   if (!btn) return;
   try {
      btn.minHeight = 24; btn.maxHeight = 24;
      if (isActive) {
         btn.styleSheet =
            "QPushButton {" +
            " background-color: " + optThemeRgba("amberSoft") + ";" +
            " color: " + Theme.amber + ";" +
            " border: 1px solid " + optThemeRgba("amberRing") + ";" +
            " border-radius: 4px; padding: 0px;" +
            " font-family: " + Theme.fontMono + ";" +
            " font-size: 8pt; font-weight: 700;" +
            " outline: none;" +
            "}" +
            "QPushButton:hover { background-color: " + optThemeRgba("amberSoft") +
            "; color: " + Theme.amber + "; }" +
            "QPushButton:focus { outline: none; }";
      } else {
         btn.styleSheet =
            "QPushButton {" +
            " background-color: transparent;" +
            " color: " + Theme.textMuted + ";" +
            " border: 1px solid " + optThemeRgba("borderStrong") + ";" +
            " border-radius: 4px; padding: 0px;" +
            " font-family: " + Theme.fontMono + ";" +
            " font-size: 8pt; font-weight: 600;" +
            " outline: none;" +
            "}" +
            "QPushButton:hover { background-color: " + Theme.surfaceHover +
            "; color: " + Theme.text + "; }" +
            "QPushButton:focus { outline: none; }";
      }
   } catch (e) {}
}
// ----------------------------------------------------------------------------
// <<< RECIPE BUTTONS — Phase 6 polish ends here >>>
// ============================================================================


// ============================================================================
// >>> CHANNEL FIELD — Phase 4b — easy-rollback block <<<
// ----------------------------------------------------------------------------
// Restyles the R/G/B/L (and H/O/S/HO/OS/RGB) selector rows in the Image
// Selection block, per DESIGN_SPEC §2.7. Each row is now:
//
//   [●dot] [label] [—— combo dropdown ——————————— ▾]
//
// where the dot is a 16×16 Bitmap painted with a coloured dot + a soft
// halo of the same colour at low alpha. The label is mono 9pt 700 in a
// fixed 24–28 px column. The combo gets a surfaceRaised bg, hairline
// border and rSm radius. Inactive widgets are intentionally invisible
// (no separate "empty L" rule yet — that polish is a follow-up).
//
// To revert: delete this block and restore the original OptImageCombo
// constructor (label with optLabel(... 48) + combo with minWidth 210).
// ============================================================================

function optThemeChannelColorKey(channelKey) {
   var map = {
      "R":  "chR",      "G":  "chG",      "B":  "chB",
      "H":  "chR",      "O":  "chB",      "S":  "chG",
      "HO": "chR",      "OS": "chB",      "RGB": "textMuted",
      "L":  "textDim",  "L_MONO": "textDim"
   };
   return map[channelKey] || "textMuted";
}

function optThemeBuildChannelDotBitmap(channelKey) {
   // Returns a 16×16 transparent Bitmap with a 7 px coloured dot in the
   // centre and a 13 px halo of the same colour at ~18 % alpha. The slight
   // bump from spec's 13 % to 18 % works better against the dark surface.
   var hex = optThemeColor(optThemeChannelColorKey(channelKey));
   if (hex.charAt(0) === "#") hex = hex.substring(1);
   var rr = parseInt(hex.substring(0, 2), 16);
   var gg = parseInt(hex.substring(2, 4), 16);
   var bb = parseInt(hex.substring(4, 6), 16);
   var dotInt  = ((0xFF << 24) | (rr << 16) | (gg << 8) | bb) >>> 0;
   var haloA   = Math.round(255 * 0.18);
   var haloInt = ((haloA << 24) | (rr << 16) | (gg << 8) | bb) >>> 0;
   var bm = new Bitmap(16, 16);
   bm.fill(0);
   try {
      var g = new Graphics(bm);
      try {
         g.antialiasing = true;
         g.pen = new Pen(0x00000000, 1);    // transparent outline
         g.brush = new Brush(haloInt);
         g.drawEllipse(1, 1, 14, 14);       // ~13 px halo
         g.brush = new Brush(dotInt);
         g.drawEllipse(4, 4, 11, 11);       // ~7 px dot
      } finally {
         g.end();
      }
   } catch (e) {}
   return bm;
}

function optThemeApplyChannelLabel(label) {
   if (!label) return;
   try {
      label.styleSheet =
         "QLabel {" +
         " color: " + Theme.text + ";" +
         " background-color: transparent; border: 0px;" +
         " font-family: " + Theme.fontMono + ";" +
         " font-size: 9pt; font-weight: 700;" +
         "}";
      label.textAlignment = TextAlign_Left | TextAlign_VertCenter;
      label.minWidth = 22;
      label.maxWidth = 32;
   } catch (e) {}
}

function optThemeApplyChannelComboStyle(combo) {
   if (!combo) return;
   try {
      combo.minHeight = 28;
      combo.maxHeight = 28;
      combo.styleSheet =
         "QComboBox {" +
         " background-color: " + Theme.surfaceRaised + ";" +
         " color: " + Theme.text + ";" +
         " border: 1px solid " + optThemeRgba("border") + ";" +
         " border-radius: " + Theme.rSm + "px;" +
         " padding-left: 11px; padding-right: 4px;" +
         " font-family: " + Theme.fontMono + ";" +
         " font-size: 9pt; font-weight: 500;" +
         "}" +
         "QComboBox:hover { background-color: " + Theme.surfaceHover + "; }" +
         "QComboBox::drop-down { border: 0px; width: 18px; }" +
         "QComboBox QAbstractItemView {" +
         " background-color: " + Theme.surfaceRaised + ";" +
         " color: " + Theme.text + ";" +
         " border: 1px solid " + optThemeRgba("border") + ";" +
         " selection-background-color: " + optThemeRgba("amberSoft") + ";" +
         " selection-color: " + Theme.amber + ";" +
         "}";
   } catch (e) {}
}

// ----- UI Builder ------------------------------------------------------------

/**
 * Builds the Crop section into the Pre Processing tab leftContent and wires
 * the preview viewport mouse hooks (onImageMousePress/Move/Release,
 * onOverlayPaint). Called from configurePreTab BEFORE the Plate Solving
 * section so the Crop section appears between Image Selection and Plate
 * Solving in the UI.
 *
 * Hooks are installed permanently (the Pre tab does not share these callback
 * slots with any other feature — only the Post tab's FAME mode does an
 * install/remove dance because it shares its preview across mask modes).
 */
function optBuildPreCropSection(dlg) {
   dlg.cropState = optCropInitState();

   dlg.__cropSection = dlg.preTab.addProcessSection("Crop", [], {
      info: "<p>Hold <b>SHIFT</b>+drag on the preview to draw a crop rectangle, or press <b>Auto-detect Edges</b>. Drag the handles to resize, the interior to move. <b>Apply</b> removes the area outside the rectangle. Astrometric metadata (WCS) is preserved automatically.</p>",
      build: function(body) {
         // Phase 5.3: themed Crop body (Flat pattern, DESIGN_SPEC §10.2).
         //   status pill -> [Auto-detect | Clear] -> toggle -> [Apply x2]
         optThemeApplyModuleBody(body);
         dlg.__cropStatusLabel = new Label(body);
         optThemeSetStatus(dlg.__cropStatusLabel, "● No selection", "pending");
         body.sizer.add(dlg.__cropStatusLabel);

         var rowDetect = new Control(body);
         rowDetect.sizer = new HorizontalSizer();
         rowDetect.sizer.spacing = Theme.s2;
         dlg.__btnCropAuto  = optButton(rowDetect, "Auto-detect", 0);
         dlg.__btnCropClear = optButton(rowDetect, "Clear",       0);
         optThemeApplyActionButton(dlg.__btnCropAuto);
         optThemeApplyActionButton(dlg.__btnCropClear);
         rowDetect.sizer.add(dlg.__btnCropAuto,  1);
         rowDetect.sizer.add(dlg.__btnCropClear, 1);
         body.sizer.add(rowDetect);

         dlg.__chkCropReAlign = new CheckBox(body);
         dlg.__chkCropReAlign.text = "Re-align after multi-crop";
         optApplyCheckBoxTooltip(dlg.__chkCropReAlign);
         optThemeApplyCheckBox(dlg.__chkCropReAlign);
         body.sizer.add(dlg.__chkCropReAlign);

         var rowApply = new Control(body);
         rowApply.sizer = new HorizontalSizer();
         rowApply.sizer.spacing = Theme.s2;
         dlg.__btnCropApplyCurrent = optButton(rowApply, "Apply Current", 0);
         dlg.__btnCropApplyAll     = optButton(rowApply, "Apply All",     0);
         optThemeApplyPrimaryActionButton(dlg.__btnCropApplyCurrent, false);
         optThemeApplyPrimaryActionButton(dlg.__btnCropApplyAll,     false);
         rowApply.sizer.add(dlg.__btnCropApplyCurrent, 1);
         rowApply.sizer.add(dlg.__btnCropApplyAll,     1);
         body.sizer.add(rowApply);

         // ---- Status / button-enablement refresh -----------------------------
         dlg.__cropUpdateStatus = function() {
            var r = dlg.cropState ? dlg.cropState.rect : null;
            if (r) {
               optThemeSetStatus(dlg.__cropStatusLabel,
                  "● " + r.width + " × " + r.height +
                  " px @ (" + r.x + ", " + r.y + ")", "ok");
            } else {
               optThemeSetStatus(dlg.__cropStatusLabel, "● No selection", "pending");
            }
            var hasRect = !!r;
            try { dlg.__btnCropApplyCurrent.enabled = hasRect; } catch (e1) {}
            try { dlg.__btnCropApplyAll.enabled     = hasRect; } catch (e2) {}
            try { dlg.__btnCropClear.enabled        = hasRect; } catch (e3) {}
         };
         dlg.__cropUpdateStatus();

         // ---- Auto-detect ----------------------------------------------------
         dlg.__btnCropAuto.onClick = function() {
            optSafeUi("Auto-detect crop edges", function() {
               var view = dlg.preTab.preview.currentView;
               if (!optSafeView(view))
                  throw new Error("Load an image into Pre Processing first.");
               var rect = optCropDetectImageEdges(view);
               if (!rect)
                  throw new Error("Could not auto-detect valid edges (image too small or no defect pixels).");
               dlg.cropState.rect = rect;
               dlg.__cropUpdateStatus();
               try { dlg.preTab.preview.preview.viewport.repaint(); } catch (eR) {}
               console.noteln("Crop: auto-detected " + rect.width + "x" + rect.height +
                              " @ (" + rect.x + "," + rect.y + ") on " + view.id);
            });
         };

         // ---- Clear ----------------------------------------------------------
         dlg.__btnCropClear.onClick = function() {
            optSafeUi("Clear crop selection", function() {
               dlg.cropState = optCropInitState();
               dlg.__cropUpdateStatus();
               try { dlg.preTab.preview.preview.viewport.repaint(); } catch (eR) {}
            });
         };

         // ---- Apply to Current (single view) ---------------------------------
         dlg.__btnCropApplyCurrent.onClick = function() {
            optSafeUi("Apply crop to current image", function() {
               var view = dlg.preTab.preview.currentView;
               if (!optSafeView(view))    throw new Error("No active image to crop.");
               if (!dlg.cropState.rect)   throw new Error("Draw or auto-detect a crop rectangle first.");
               var ok = optCropApplyToView(view, dlg.cropState.rect);
               if (!ok) throw new Error("Crop produced no change (rectangle equals the image, or view rejected).");
               // Refresh canonical preview because the underlying view changed dimensions.
               try { dlg.preTab.preview.render(view, true, dlg.preTab.preview.currentGradientView); } catch (eR) {}
               dlg.cropState = optCropInitState();
               dlg.__cropUpdateStatus();
               console.noteln("Crop: applied to " + view.id);
            });
         };

         // ---- Apply to All (visible slot buttons above the preview) ----------
         dlg.__btnCropApplyAll.onClick = function() {
            optSafeUi("Apply crop to all loaded images", function() {
               if (!dlg.cropState.rect) throw new Error("Draw or auto-detect a crop rectangle first.");
               var rect = dlg.cropState.rect;

               // Iterate the slot buttons displayed above the preview.
               // A button is visible only when its slot has been registered
               // in this tab's store (Process Separately, Combine, Process
               // RGB, SXT split, etc.). This matches the user's mental
               // model exactly: "crop the images whose buttons I see above
               // the preview" — independent of which input mode is
               // selected in Image Selection and independent of auto-
               // detected ghosts in hidden combos.
               // Dedup by view.id covers the rare case of the same view
               // registered under multiple keys.
               var seen = {};
               var views = [];
               var pathButtons = (dlg.preTab && dlg.preTab.preview && dlg.preTab.preview.pathButtons) || {};
               for (var key in pathButtons) {
                  if (!pathButtons.hasOwnProperty(key)) continue;
                  var btn = pathButtons[key];
                  if (!btn || btn.visible !== true) continue;
                  var rec = null;
                  try { rec = dlg.store.record(key); } catch (eR0) {}
                  if (!rec || !optSafeView(rec.view)) continue;
                  if (seen[rec.view.id]) continue;
                  seen[rec.view.id] = true;
                  views.push(rec.view);
               }
               if (views.length === 0)
                  throw new Error("No slot buttons are active above the preview. Load an image and click Process Separately, Combine, or Process RGB first.");

               var cropped = [], skipped = 0;
               for (var j = 0; j < views.length; ++j) {
                  if (optCropApplyToView(views[j], rect)) cropped.push(views[j]);
                  else skipped++;
               }
               console.noteln("Crop: applied to " + cropped.length + " view(s) (matching active slot buttons)" +
                              (skipped > 0 ? ", " + skipped + " skipped (no-op or invalid)" : ""));
               for (var c = 0; c < cropped.length; ++c)
                  console.writeln("  cropped: " + cropped[c].id);

               // Optional re-alignment (only meaningful with ≥ 2 successfully cropped views).
               if (dlg.__chkCropReAlign.checked && cropped.length >= 2) {
                  var ref  = cropped[0];
                  var rest = cropped.slice(1);
                  var res  = optCropReAlignViews(rest, ref);
                  console.noteln("Crop re-align: " + res.aligned + " aligned, " +
                                 res.failed + " failed");
                  // Swap-back: copy the corrected pixels (and matching WCS)
                  // from each "_registered" output INTO its original target
                  // view, then close the now-redundant aligned view. After
                  // this, the workflow continues with R, G, B, H (their
                  // original names and slot positions) but holding the
                  // sub-pixel-corrected pixel data. The workspace stays
                  // clean of "_registered" auxiliary views.
                  if (res.pairs && res.pairs.length > 0) {
                     var swapped = 0;
                     var closedNames = [];
                     for (var p = 0; p < res.pairs.length; ++p) {
                        var pair = res.pairs[p];
                        if (optCropSwapBackAlignedPixels(pair.target, pair.aligned)) swapped++;
                        closedNames.push(pair.aligned.id);
                        optCloseView(pair.aligned);
                     }
                     console.writeln("  swapped corrected pixels into originals: " + swapped + " view(s)");
                     console.writeln("  closed _registered views: " + closedNames.join(", "));
                  }
               }
               // Refresh canonical preview.
               var cur = dlg.preTab.preview.currentView;
               if (optSafeView(cur)) {
                  try { dlg.preTab.preview.render(cur, true, dlg.preTab.preview.currentGradientView); } catch (eR) {}
               }
               dlg.cropState = optCropInitState();
               dlg.__cropUpdateStatus();
            });
         };

         // ---- Viewport mouse + overlay hooks ---------------------------------
         var ctrl = dlg.preTab.preview.preview;

         ctrl.onOverlayPaint = function(g, sc, sx, sy) {
            // Skip if the cached rect doesn't fit the currently displayed image
            // (typical when the user loads a different-sized image afterwards).
            var v = dlg.preTab.preview.currentView;
            if (optSafeView(v) && dlg.cropState && dlg.cropState.rect &&
                !optCropRectFitsImage(dlg.cropState.rect, v.image.width, v.image.height))
               return;
            optCropPaintOverlay(g, dlg.cropState, sc, sx, sy,
                                ctrl.imageCoordScaleX, ctrl.imageCoordScaleY,
                                ctrl.viewport.width, ctrl.viewport.height);
         };

         ctrl.onImageMousePress = function(imgX, imgY, button, modifiers) {
            if (button !== OPT_MOUSE_LEFT) return false;
            if (!optSafeView(dlg.preTab.preview.currentView)) return false;
            var st = dlg.cropState;
            // SHIFT held → start a new selection (replaces any existing rect).
            if (modifiers & OPT_CROP_SHIFT_MODIFIER) {
               st.rect          = { x: imgX, y: imgY, width: 1, height: 1 };
               st.drawing       = true;
               st.dragMode      = "draw";
               st.dragStartImg  = { x: imgX, y: imgY };
               st.dragStartRect = null;
               dlg.__cropUpdateStatus();
               try { ctrl.viewport.repaint(); } catch (eR) {}
               return true;   // consume → prevents the default pan
            }
            // No SHIFT: if there's a rectangle, check handle / interior hit.
            if (st.rect) {
               var hit = optCropHitTest(st.rect, imgX, imgY, ctrl.scale,
                                        ctrl.imageCoordScaleX, ctrl.imageCoordScaleY);
               if (hit === OPT_CROP_HANDLE_INSIDE) {
                  st.dragMode      = "move";
                  st.dragHandle    = OPT_CROP_HANDLE_INSIDE;
                  st.dragStartImg  = { x: imgX, y: imgY };
                  st.dragStartRect = { x: st.rect.x, y: st.rect.y, width: st.rect.width, height: st.rect.height };
                  return true;
               }
               if (hit !== OPT_CROP_HANDLE_NONE) {
                  st.dragMode      = "resize";
                  st.dragHandle    = hit;
                  st.dragStartImg  = { x: imgX, y: imgY };
                  st.dragStartRect = { x: st.rect.x, y: st.rect.y, width: st.rect.width, height: st.rect.height };
                  return true;
               }
            }
            return false;  // let pan handle it
         };

         ctrl.onImageMouseMove = function(imgX, imgY, buttons, modifiers) {
            var st = dlg.cropState;
            if (!st.dragMode) return;
            var v = dlg.preTab.preview.currentView;
            if (!optSafeView(v)) return;
            var iw = v.image.width, ih = v.image.height;
            if (st.dragMode === "draw") {
               var x1 = Math.min(st.dragStartImg.x, imgX);
               var y1 = Math.min(st.dragStartImg.y, imgY);
               var x2 = Math.max(st.dragStartImg.x, imgX);
               var y2 = Math.max(st.dragStartImg.y, imgY);
               st.rect = optCropClampRect({ x: x1, y: y1, width: x2 - x1, height: y2 - y1 }, iw, ih);
            } else if (st.dragMode === "move") {
               var dx = imgX - st.dragStartImg.x;
               var dy = imgY - st.dragStartImg.y;
               var nx = Math.max(0, Math.min(iw - st.dragStartRect.width,  st.dragStartRect.x + dx));
               var ny = Math.max(0, Math.min(ih - st.dragStartRect.height, st.dragStartRect.y + dy));
               st.rect = { x: nx, y: ny, width: st.dragStartRect.width, height: st.dragStartRect.height };
            } else if (st.dragMode === "resize") {
               st.rect = optCropResizeFromHandle(st.dragStartRect, st.dragHandle, imgX, imgY, iw, ih);
            }
            dlg.__cropUpdateStatus();
            try { ctrl.viewport.repaint(); } catch (eR) {}
         };

         ctrl.onImageMouseRelease = function(imgX, imgY, button, modifiers) {
            var st = dlg.cropState;
            if (!st.dragMode) return;
            // Discard rectangles below the minimum size (e.g. accidental click).
            if (st.rect && (st.rect.width < OPT_CROP_MIN_SIZE || st.rect.height < OPT_CROP_MIN_SIZE))
               st.rect = null;
            st.dragMode      = "";
            st.dragHandle    = OPT_CROP_HANDLE_NONE;
            st.dragStartImg  = null;
            st.dragStartRect = null;
            st.drawing       = false;
            dlg.__cropUpdateStatus();
            try { ctrl.viewport.repaint(); } catch (eR) {}
         };
      }
   });
}

// ============================================================================
// <<< END CROP SECTION — v33-opt-9 — easy-rollback block >>>
// ============================================================================

PIWorkflowOptDialog.prototype.configurePreTab = function() {
   var dlg = this;
   this.prePlateSolved = false;

   // >>> Crop section (v33-opt-9) — between Image Selection and Plate Solving.
   // Single line to delete for full rollback of the Crop feature.
   optBuildPreCropSection(this);

   this.preTab.addProcessSection("Plate Solving", [{
      text: "Solve Image",
      stage: "Plate Solving",
      width: 130,
      action: function(tab, pane) {
         if (!pane.currentKey || !optSafeView(pane.currentView))
            throw new Error("Select a Pre-processing image first.");
         // Phase 5.2: themed status pill (pending/ok/error states).
         optThemeSetStatus(dlg.preSolveStatus,
            "● Solving… (" + pane.currentView.id + ")", "pending");
         processEvents();
         dlg.prePlateSolved = optHasAstrometricSolution(pane.currentView);
         if (!dlg.prePlateSolved)
            dlg.prePlateSolved = optSolveAstrometryOnWindow(pane.currentView.window, "the current target");
         if (dlg.prePlateSolved) {
            dlg.store.markStage(pane.currentKey, "Plate Solving");
            optThemeSetStatus(dlg.preSolveStatus,
               "● Solved · " + pane.currentView.id, "ok");
         } else {
            optThemeSetStatus(dlg.preSolveStatus,
               "● Failed · " + pane.currentView.id, "error");
         }
         pane.refreshButtons();
         pane.render(pane.currentView, false);
      }
   }], {
      info: "<p>Plate solving provides the astrometric solution required by MGC, SPCC and RGB geometric correction.</p>",
      build: function(body) {
         // Phase 5.2: Status + Action pattern (DESIGN_SPEC §10.2). The body
         // is just the status pill; the "Solve Image" button lives at the
         // section level (added by addProcessSection above).
         optThemeApplyModuleBody(body);
         dlg.preSolveStatus = new Label(body);
         optThemeSetStatus(dlg.preSolveStatus, "● Not solved", "pending");
         body.sizer.add(dlg.preSolveStatus);
      }
   });

   this.preTab.addProcessSection("Gradient Correction", [{
      text: "Gradient Correction",
      stage: "Gradient Correction",
      actionKey: "gradient",
      name: "btnPreGradient",
      width: 170
   }, {
      // ===== COMPARE-BEGIN (button entry) =====
      text: "Compare",
      stage: "Compare Gradient Correction",
      name: "btnPreGradientCompare",
      width: 90,
      primary: false,
      action: function(tab, pane, btn) { optCompareGradientCorrection(tab.dialog); }
      // ===== COMPARE-END =====
   }], {
      info: "<p>Choose the background-correction engine and generate a candidate preview. External engines degrade safely when unavailable.</p>",
      build: function(body) {
         // Phase 5.4: themed Gradient Correction body (Subcards pattern,
         // DESIGN_SPEC §10.2). Full-width algorithm combo, then a stack
         // of algorithm-specific groups, each made of one or two subcards.
         optThemeApplyModuleBody(body);

         dlg.comboPreGradient = new ComboBox(body);
         dlg.comboPreGradient.addItem("MGC");
         dlg.comboPreGradient.addItem("AutoDBE (SetiAstro)");
         dlg.comboPreGradient.addItem("ABE");
         dlg.comboPreGradient.addItem("GraXpert");
         optThemeApplyChannelComboStyle(dlg.comboPreGradient);
         body.sizer.add(dlg.comboPreGradient);

         // --- MGC: 2 subcards (Gradient Model + Channel Multipliers) -------
         dlg.preMgcGroup = new Control(body);
         dlg.preMgcGroup.sizer = new VerticalSizer();
         dlg.preMgcGroup.sizer.margin = 0;
         dlg.preMgcGroup.sizer.spacing = Theme.s2;

         var mgcModel = optThemeBuildSubcard(dlg.preMgcGroup, "Gradient Model");
         dlg.comboMgcScale = { combo: new ComboBox(mgcModel) };
         ["128","256","512","1024","2048","4096","8192"].forEach(function(v){ dlg.comboMgcScale.combo.addItem(v); });
         dlg.comboMgcScale.combo.currentItem = 3;
         optThemeApplyChannelComboStyle(dlg.comboMgcScale.combo);
         dlg.comboMgcScale.row = dlg.comboMgcScale.combo;       // legacy alias
         dlg.comboMgcSep = { combo: new ComboBox(mgcModel) };
         ["1","2","3","4","5","6","7","8"].forEach(function(v){ dlg.comboMgcSep.combo.addItem(v); });
         dlg.comboMgcSep.combo.currentItem = 2;
         optThemeApplyChannelComboStyle(dlg.comboMgcSep.combo);
         dlg.comboMgcSep.row = dlg.comboMgcSep.combo;
         dlg.ncMgcSmoothness = optNumeric(mgcModel, "Smooth", 0.0, 10.0, 1.00, 2, 76);
         optThemeApplyNumericControl(dlg.ncMgcSmoothness);
         mgcModel.sizer.add(dlg.comboMgcScale.combo);
         mgcModel.sizer.add(dlg.comboMgcSep.combo);
         mgcModel.sizer.add(dlg.ncMgcSmoothness);
         dlg.preMgcGroup.sizer.add(mgcModel);

         var mgcMult = optThemeBuildSubcard(dlg.preMgcGroup, "Channel Multipliers");
         dlg.ncMgcScaleR = optNumeric(mgcMult, "R/K", 0.0, 5.0, 1.0000, 4, 60);
         dlg.ncMgcScaleG = optNumeric(mgcMult, "G",   0.0, 5.0, 1.0000, 4, 60);
         dlg.ncMgcScaleB = optNumeric(mgcMult, "B",   0.0, 5.0, 1.0000, 4, 60);
         optThemeApplyNumericControl(dlg.ncMgcScaleR);
         optThemeApplyNumericControl(dlg.ncMgcScaleG);
         optThemeApplyNumericControl(dlg.ncMgcScaleB);
         mgcMult.sizer.add(dlg.ncMgcScaleR);
         mgcMult.sizer.add(dlg.ncMgcScaleG);
         mgcMult.sizer.add(dlg.ncMgcScaleB);
         dlg.preMgcGroup.sizer.add(mgcMult);
         body.sizer.add(dlg.preMgcGroup);

         // --- AutoDBE: 1 subcard ------------------------------------------
         dlg.preAdbeGroup = new Control(body);
         dlg.preAdbeGroup.sizer = new VerticalSizer();
         dlg.preAdbeGroup.sizer.margin = 0;
         dlg.preAdbeGroup.sizer.spacing = Theme.s2;
         var adbeCard = optThemeBuildSubcard(dlg.preAdbeGroup, "AutoDBE");
         dlg.ncAdbePaths  = optNumeric(adbeCard, "Paths",     10, 200, 50, 0, 76);
         dlg.ncAdbeTol    = optNumeric(adbeCard, "Tolerance", 0.5, 5.0, 2.0, 2, 76);
         dlg.ncAdbeSmooth = optNumeric(adbeCard, "Smooth",    0.1, 0.8, 0.25, 2, 76);
         optThemeApplyNumericControl(dlg.ncAdbePaths);
         optThemeApplyNumericControl(dlg.ncAdbeTol);
         optThemeApplyNumericControl(dlg.ncAdbeSmooth);
         adbeCard.sizer.add(dlg.ncAdbePaths);
         adbeCard.sizer.add(dlg.ncAdbeTol);
         adbeCard.sizer.add(dlg.ncAdbeSmooth);
         dlg.preAdbeGroup.sizer.add(adbeCard);
         body.sizer.add(dlg.preAdbeGroup);

         // --- ABE: 1 subcard ----------------------------------------------
         dlg.preAbeGroup = new Control(body);
         dlg.preAbeGroup.sizer = new VerticalSizer();
         dlg.preAbeGroup.sizer.margin = 0;
         dlg.preAbeGroup.sizer.spacing = Theme.s2;
         var abeCard = optThemeBuildSubcard(dlg.preAbeGroup, "ABE");
         dlg.comboAbeCorrection = { combo: new ComboBox(abeCard) };
         dlg.comboAbeCorrection.combo.addItem("Subtraction");
         dlg.comboAbeCorrection.combo.addItem("Division");
         optThemeApplyChannelComboStyle(dlg.comboAbeCorrection.combo);
         dlg.comboAbeCorrection.row = dlg.comboAbeCorrection.combo;
         dlg.ncAbeFunctionDegree = optNumeric(abeCard, "Degree", 0, 8, 1, 0, 60);
         optThemeApplyNumericControl(dlg.ncAbeFunctionDegree);
         dlg.chkAbeNormalize = new CheckBox(abeCard);
         dlg.chkAbeNormalize.text = "Normalize";
         optApplyCheckBoxTooltip(dlg.chkAbeNormalize);
         optThemeApplyCheckBox(dlg.chkAbeNormalize);
         abeCard.sizer.add(dlg.comboAbeCorrection.combo);
         abeCard.sizer.add(dlg.ncAbeFunctionDegree);
         abeCard.sizer.add(dlg.chkAbeNormalize);
         dlg.preAbeGroup.sizer.add(abeCard);
         body.sizer.add(dlg.preAbeGroup);

         // --- GraXpert: 1 subcard -----------------------------------------
         dlg.preGraXpertGroup = new Control(body);
         dlg.preGraXpertGroup.sizer = new VerticalSizer();
         dlg.preGraXpertGroup.sizer.margin = 0;
         dlg.preGraXpertGroup.sizer.spacing = Theme.s2;
         var gxCard = optThemeBuildSubcard(dlg.preGraXpertGroup, "GraXpert");
         dlg.comboGraXpertCorrection = { combo: new ComboBox(gxCard) };
         dlg.comboGraXpertCorrection.combo.addItem("Subtraction");
         dlg.comboGraXpertCorrection.combo.addItem("Division");
         optThemeApplyChannelComboStyle(dlg.comboGraXpertCorrection.combo);
         dlg.comboGraXpertCorrection.row = dlg.comboGraXpertCorrection.combo;
         dlg.ncGraXpertSmoothing = optNumeric(gxCard, "Smooth", 0.0, 1.0, 0.82, 3, 76);
         optThemeApplyNumericControl(dlg.ncGraXpertSmoothing);
         gxCard.sizer.add(dlg.comboGraXpertCorrection.combo);
         gxCard.sizer.add(dlg.ncGraXpertSmoothing);
         dlg.preGraXpertGroup.sizer.add(gxCard);
         body.sizer.add(dlg.preGraXpertGroup);

         dlg.syncPreGradientPanels = function(idx) {
            dlg.preMgcGroup.visible      = idx === 0;
            dlg.preAdbeGroup.visible     = idx === 1;
            dlg.preAbeGroup.visible      = idx === 2;
            dlg.preGraXpertGroup.visible = idx === 3;
         };
         dlg.comboPreGradient.onItemSelected = function(idx) { dlg.syncPreGradientPanels(idx); };
         dlg.syncPreGradientPanels(0);
      }
   });

   // Phase 5.5: Color Calibration as Action-only flow (DESIGN_SPEC §10.2,
   // §10.3). Three big clickable action cards stacked vertically inside
   // the section body; the buttons array is empty so no native PushButton
   // is appended at the section level. Each card replicates the wireButton
   // logic that addProcessSection would have applied to the old buttons.
   this.__sectionPreColorCalibration = this.preTab.addProcessSection("Color Calibration", [], {
      info: "<p>Calibrate color balance using SPCC, Auto Linear Fit or Background Neutralization. Each action produces a candidate for Toggle and Use this Image.</p>",
      build: function(body, tab) {
         optThemeApplyModuleBody(body);

         // Eyebrow per spec §10.3: "Choose a method" header above the cards.
         var eyebrow = new Label(body);
         eyebrow.text = "CHOOSE A METHOD";
         try {
            eyebrow.styleSheet =
               "QLabel {" +
               " color: " + Theme.textDim + ";" +
               " background-color: transparent; border: 0px;" +
               " font-family: " + Theme.fontMono + ";" +
               " font-size: 8pt; font-weight: 600;" +
               " padding-top: 2px; padding-bottom: 4px;" +
               "}";
         } catch (eE) {}
         body.sizer.add(eyebrow);

         var paneRef = tab.preview;
         function runCC(stageName, actionKey) {
            optSafeUi(stageName, function() {
               paneRef.beginCandidate(stageName, function(candidate) {
                  return optApplyPreCandidate(candidate, actionKey, dlg);
               }, actionKey);
            });
         }

         var spccCard = optThemeBuildActionCard(body, {
            title: "SPCC",
            hint: "Photometric color calibration",
            isPrimary: true,
            iconLetter: "S",
            onClick: function() { runCC("Color Calibration (SPCC)", "spcc"); }
         });
         body.sizer.add(spccCard);
         dlg.preTab.btnPreSPCC = spccCard;        // legacy alias

         var alfCard = optThemeBuildActionCard(body, {
            title: "Auto Linear Fit",
            hint: "Statistical white balance",
            iconLetter: "A",
            onClick: function() { runCC("Auto Linear Fit", "alf"); }
         });
         body.sizer.add(alfCard);
         dlg.preTab.btnPreALF = alfCard;

         var bnCard = optThemeBuildActionCard(body, {
            title: "Bkg. Neutralization",
            hint: "Subtracts background colour",
            iconLetter: "B",
            onClick: function() { runCC("Background Neutralization", "bn"); }
         });
         body.sizer.add(bnCard);
         dlg.preTab.btnPreBN = bnCard;
      }
   });

   this.preTab.addProcessSection("Deconvolution", [{
      text: "Deconvolution",
      stage: "Deconvolution",
      actionKey: "decon",
      name: "btnPreApplyDecon",
      width: 150
   }, {
      // ===== COMPARE-BEGIN (button entry) =====
      text: "Compare",
      stage: "Compare Deconvolution",
      name: "btnPreDeconCompare",
      width: 90,
      primary: false,
      action: function(tab, pane, btn) { optComparePreDeconvolution(tab.dialog); }
      // ===== COMPARE-END =====
   }], {
      info: "<p>BlurXTerminator and Cosmic Clarity settings. The optimized script keeps the same controls and creates a safe candidate preview for testing.</p>",
      build: function(body) {
         // Phase 5: redesigned Deconvolution body per DESIGN_SPEC §2.10.b.
         // Layout = Algorithm combo + 3 subcards (Stars / Nonstellar /
         // Output). Variable names (dlg.ncBxt*, dlg.chkBxt*, etc.) are
         // preserved verbatim so every state-management callsite keeps
         // working unchanged.
         optThemeApplyModuleBody(body);

         // Algorithm combo: no label row (subcard headers below carry the
         // context), full-width combo to maximise text room for the
         // "BlurXTerminator" / "Cosmic Clarity (SetiAstro)" item names.
         dlg.comboPreDecon = new ComboBox(body);
         dlg.comboPreDecon.addItem("BlurXTerminator");
         dlg.comboPreDecon.addItem("Cosmic Clarity (SetiAstro)");
         optThemeApplyChannelComboStyle(dlg.comboPreDecon);
         body.sizer.add(dlg.comboPreDecon);

         // BXT group: a Control hosting 3 themed subcards. Sub-cards switch
         // visibility together with the parent group via syncPreDeconPanels.
         dlg.preBxtGroup = new Control(body);
         dlg.preBxtGroup.sizer = new VerticalSizer();
         dlg.preBxtGroup.sizer.margin = 0;
         dlg.preBxtGroup.sizer.spacing = Theme.s2;

         // --- Subcard: STARS -----------------------------------------------
         var bxtStars = optThemeBuildSubcard(dlg.preBxtGroup, "Stars");
         // Shorter labels — subcard header "STARS" already carries context.
         dlg.ncBxtStars            = optNumeric(bxtStars, "Sharpen",     0.0, 1.0, 0.27, 2, 60);
         dlg.ncBxtAdjustStarHalos  = optNumeric(bxtStars, "Halos",      -1.0, 1.0, 0.00, 2, 60);
         optThemeApplyNumericControl(dlg.ncBxtStars);
         optThemeApplyNumericControl(dlg.ncBxtAdjustStarHalos);
         bxtStars.sizer.add(dlg.ncBxtStars);
         bxtStars.sizer.add(dlg.ncBxtAdjustStarHalos);
         dlg.preBxtGroup.sizer.add(bxtStars);

         // --- Subcard: NONSTELLAR ------------------------------------------
         var bxtNs = optThemeBuildSubcard(dlg.preBxtGroup, "Nonstellar");
         dlg.chkBxtAutoPSF         = new CheckBox(bxtNs);
         dlg.chkBxtAutoPSF.text    = "Automatic PSF";
         dlg.chkBxtAutoPSF.checked = true;
         optApplyCheckBoxTooltip(dlg.chkBxtAutoPSF);
         optThemeApplyCheckBox(dlg.chkBxtAutoPSF);
         dlg.ncBxtPSFDiameter      = optNumeric(bxtNs, "PSF Ø",     0.0, 12.0, 4.0, 2, 60);
         dlg.ncBxtSharpenNonstellar = optNumeric(bxtNs, "Sharpen",      0.0,  1.0, 0.35, 2, 60);
         optThemeApplyNumericControl(dlg.ncBxtPSFDiameter);
         optThemeApplyNumericControl(dlg.ncBxtSharpenNonstellar);
         bxtNs.sizer.add(dlg.chkBxtAutoPSF);
         bxtNs.sizer.add(dlg.ncBxtPSFDiameter);
         bxtNs.sizer.add(dlg.ncBxtSharpenNonstellar);
         dlg.preBxtGroup.sizer.add(bxtNs);

         // --- Subcard: OUTPUT ---------------------------------------------
         var bxtOut = optThemeBuildSubcard(dlg.preBxtGroup, "Output");
         dlg.chkBxtCorrectOnly          = new CheckBox(bxtOut);
         dlg.chkBxtCorrectOnly.text     = "Correlation Only";
         optApplyCheckBoxTooltip(dlg.chkBxtCorrectOnly);
         optThemeApplyCheckBox(dlg.chkBxtCorrectOnly);
         dlg.chkBxtLuminanceOnly        = new CheckBox(bxtOut);
         dlg.chkBxtLuminanceOnly.text   = "Luminance Only";
         dlg.chkBxtLuminanceOnly.checked = true;
         optApplyCheckBoxTooltip(dlg.chkBxtLuminanceOnly);
         optThemeApplyCheckBox(dlg.chkBxtLuminanceOnly);
         bxtOut.sizer.add(dlg.chkBxtCorrectOnly);
         bxtOut.sizer.add(dlg.chkBxtLuminanceOnly);
         dlg.preBxtGroup.sizer.add(bxtOut);

         body.sizer.add(dlg.preBxtGroup);

         // Cosmic Clarity group: single subcard (5 controls, no sub-grouping).
         dlg.preCCSharpGroup = new Control(body);
         dlg.preCCSharpGroup.sizer = new VerticalSizer();
         dlg.preCCSharpGroup.sizer.margin = 0;
         dlg.preCCSharpGroup.sizer.spacing = Theme.s2;
         var ccCard = optThemeBuildSubcard(dlg.preCCSharpGroup, "Cosmic Clarity Sharpening");
         // Mode combo as full-width row (no label — subcard header carries it).
         dlg.comboPreCCSharpenMode = { combo: new ComboBox(ccCard) };
         dlg.comboPreCCSharpenMode.combo.addItem("Both (Stellar + Non-Stellar)");
         dlg.comboPreCCSharpenMode.combo.addItem("Stellar Only");
         dlg.comboPreCCSharpenMode.combo.addItem("Non-Stellar Only");
         optThemeApplyChannelComboStyle(dlg.comboPreCCSharpenMode.combo);
         // This combo is built without optComboRow because the subcard header
         // ("Cosmic Clarity Sharpening") already labels the section. Apply
         // the Cosmic Clarity-specific tooltip explicitly so the lookup
         // does not fall back to the generic ComboBox text.
         optApplyExplicitTooltip(dlg.comboPreCCSharpenMode.combo, "combo.Targets:");
         // The .row property is kept for legacy callers that expect it; expose
         // the combo itself so the same wiring works.
         dlg.comboPreCCSharpenMode.row = dlg.comboPreCCSharpenMode.combo;
         dlg.ncPreCCStellarAmt  = optNumeric(ccCard, "Stellar",  0.0, 1.0, 0.90, 2, 60);
         dlg.ncPreCCNSStrength  = optNumeric(ccCard, "Ns. Size", 1.0, 8.0, 3.0, 1, 60);
         dlg.ncPreCCNSAmount    = optNumeric(ccCard, "Ns. Amt",  0.0, 1.0, 0.50, 2, 60);
         optThemeApplyNumericControl(dlg.ncPreCCStellarAmt);
         optThemeApplyNumericControl(dlg.ncPreCCNSStrength);
         optThemeApplyNumericControl(dlg.ncPreCCNSAmount);
         dlg.chkPreCCRemoveAb = new CheckBox(ccCard);
         dlg.chkPreCCRemoveAb.text = "Remove Aberration First";
         optApplyCheckBoxTooltip(dlg.chkPreCCRemoveAb);
         optThemeApplyCheckBox(dlg.chkPreCCRemoveAb);
         ccCard.sizer.add(dlg.comboPreCCSharpenMode.row);
         ccCard.sizer.add(dlg.ncPreCCStellarAmt);
         ccCard.sizer.add(dlg.ncPreCCNSStrength);
         ccCard.sizer.add(dlg.ncPreCCNSAmount);
         ccCard.sizer.add(dlg.chkPreCCRemoveAb);
         dlg.preCCSharpGroup.sizer.add(ccCard);
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

   // Phase 4h: primary CTA, full-width, amber gradient (§2.15).
   this.btnToStretch = optPrimaryButton(this.preTab.leftContent, "To Stretching", 0);
   optThemeApplyPrimaryCta(this.btnToStretch);
   this.btnToStretch.onClick = function() { optSafeUi("To Stretching", function() { dlg.sendActiveToStretch(); }); };
   this.preTab.leftContent.sizer.add(this.btnToStretch);
   this.preTab.leftContent.sizer.addStretch();
};

PIWorkflowOptDialog.prototype.configureStretchTab = function() {
   var dlg = this;
   var sxt = optSection(this.stretchTab.leftContent, "Star Split");
   this.stretchTab.registerSection(sxt);
   // Saved for sendActiveToStretch, which re-expands this section after
   // the auto Pre → Stretch transition so the user lands directly on
   // the "Split Stars" CTA instead of a fully-collapsed left panel.
   this.stretchTab.starSplitSection = sxt;

   // ===== STARNET2-BEGIN — easy-rollback block (v137 dual-engine) =====
   // Algorithm selector. Default item is StarXTerminator (idx 0); the
   // alternative is StarNet2 (idx 1). The engine is chosen at runtime
   // inside createStarSplit so only the selected branch executes.
   var rowAlgo = optComboRow(sxt.body, "Algorithm:", ["StarXTerminator (SXT)", "StarNet2", "SyQon Starless"], 80);
   this.comboStarSplitAlgo = rowAlgo.combo;
   sxt.body.sizer.add(rowAlgo.row);

   // SXT parameter group: only Overlap is exposed (default 0.20).
   this.starSplitSxtGroup = optInnerGroup(sxt.body, "StarXTerminator Settings");
   this.ncStarSplitOverlap = optNumeric(this.starSplitSxtGroup, "Overlap:", 0.05, 0.75, 0.20, 2, 120);
   this.starSplitSxtGroup.sizer.add(this.ncStarSplitOverlap);
   sxt.body.sizer.add(this.starSplitSxtGroup);

   // StarNet2 parameter group: only Stride and 2x upsample exposed.
   // The remaining StarNet2 properties (linear=true, mask=false,
   // unscreen=true, shadows_clipping=-2.80, target_background=0.25)
   // are fixed at engine-call time and intentionally hidden from the
   // user to keep the panel small and the workflow opinionated.
   this.starSplitSn2Group = optInnerGroup(sxt.body, "StarNet2 Settings");
   var rowStride = optComboRow(this.starSplitSn2Group, "Stride:", ["Large", "Standard", "Small"], 120);
   this.comboStarSplitStride = rowStride.combo;
   try { this.comboStarSplitStride.currentItem = 1; } catch (eStr0) {}   // default Standard
   this.chkStarSplitUpsample = new CheckBox(this.starSplitSn2Group);
   this.chkStarSplitUpsample.text = "2x upsample";
   optApplyCheckBoxTooltip(this.chkStarSplitUpsample);
   this.starSplitSn2Group.sizer.add(rowStride.row);
   this.starSplitSn2Group.sizer.add(this.chkStarSplitUpsample);
   sxt.body.sizer.add(this.starSplitSn2Group);

   // SYQON-STARLESS-INTEGRATION-BEGIN
   this.starSplitSyQonGroup = optInnerGroup(sxt.body, "SyQon Starless Settings");
   this.ncStarSplitSyQonTileSize = optNumeric(this.starSplitSyQonGroup, "Tile Size:", 128, 2048, 512, 0, 100);
   this.ncStarSplitSyQonOverlap = optNumeric(this.starSplitSyQonGroup, "Overlap:", 8, 512, 128, 0, 100);
   this.ncStarSplitSyQonPad = optNumeric(this.starSplitSyQonGroup, "Pad:", 0, 2048, 512, 0, 100);
   
   this.chkStarSplitSyQonUseAMP = new CheckBox(this.starSplitSyQonGroup);
   this.chkStarSplitSyQonUseAMP.text = "Use AMP";
   this.chkStarSplitSyQonUseAMP.checked = false;
   optApplyExplicitTooltip(this.chkStarSplitSyQonUseAMP, "starless.useAMP");

   var ampRowObj = optComboRow(this.starSplitSyQonGroup, "AMP Type:", ["fp16", "bf16"], 100);
   this.comboStarSplitSyQonAMPDType = ampRowObj.combo;
   optApplyExplicitTooltip(this.comboStarSplitSyQonAMPDType, "starless.ampDType");
   this.chkStarSplitSyQonUseAMP.onCheck = function(checked) {
      dlg.comboStarSplitSyQonAMPDType.enabled = checked;
   };
   this.comboStarSplitSyQonAMPDType.enabled = false;

   this.chkStarSplitSyQonUseCPU = new CheckBox(this.starSplitSyQonGroup);
   this.chkStarSplitSyQonUseCPU.text = "Force CPU";
   this.chkStarSplitSyQonUseCPU.checked = false;
   optApplyExplicitTooltip(this.chkStarSplitSyQonUseCPU, "starless.useCPU");

   this.chkStarSplitSyQonNoDML = new CheckBox(this.starSplitSyQonGroup);
   this.chkStarSplitSyQonNoDML.text = "Disable DirectML";
   this.chkStarSplitSyQonNoDML.checked = false;
   optApplyExplicitTooltip(this.chkStarSplitSyQonNoDML, "starless.noDML");

   var starsModeRowObj = optComboRow(this.starSplitSyQonGroup, "Stars Mode:", ["None", "Subtraction", "Unscreen"], 100);
   this.comboStarSplitSyQonStarsMode = starsModeRowObj.combo;
   this.comboStarSplitSyQonStarsMode.currentItem = 2; // Unscreen
   optApplyExplicitTooltip(this.comboStarSplitSyQonStarsMode, "starless.starsOnlyMode");

   this.starSplitSyQonGroup.sizer.add(this.ncStarSplitSyQonTileSize);
   this.starSplitSyQonGroup.sizer.add(this.ncStarSplitSyQonOverlap);
   this.starSplitSyQonGroup.sizer.add(this.ncStarSplitSyQonPad);
   this.starSplitSyQonGroup.sizer.addSpacing(4);
   this.starSplitSyQonGroup.sizer.add(this.chkStarSplitSyQonUseAMP);
   this.starSplitSyQonGroup.sizer.add(ampRowObj.row);
   this.starSplitSyQonGroup.sizer.add(this.chkStarSplitSyQonUseCPU);
   this.starSplitSyQonGroup.sizer.add(this.chkStarSplitSyQonNoDML);
   this.starSplitSyQonGroup.sizer.add(starsModeRowObj.row);

   optApplyExplicitTooltip(this.ncStarSplitSyQonTileSize, "starless.tileSize");
   optApplyExplicitTooltip(this.ncStarSplitSyQonOverlap, "starless.overlap");
   optApplyExplicitTooltip(this.ncStarSplitSyQonPad, "starless.pad");

   try {
      var ttTile = optTooltipTextByKey("starless.tileSize");
      if (ttTile) {
         this.ncStarSplitSyQonTileSize.label.toolTip = ttTile;
         this.ncStarSplitSyQonTileSize.slider.toolTip = ttTile;
      }
   } catch(e) {}
   try {
      var ttOv = optTooltipTextByKey("starless.overlap");
      if (ttOv) {
         this.ncStarSplitSyQonOverlap.label.toolTip = ttOv;
         this.ncStarSplitSyQonOverlap.slider.toolTip = ttOv;
      }
   } catch(e) {}
   try {
      var ttPad = optTooltipTextByKey("starless.pad");
      if (ttPad) {
         this.ncStarSplitSyQonPad.label.toolTip = ttPad;
         this.ncStarSplitSyQonPad.slider.toolTip = ttPad;
      }
   } catch(e) {}

   sxt.body.sizer.add(this.starSplitSyQonGroup);
   // SYQON-STARLESS-INTEGRATION-END

   // Sync parameter-group visibility with the algorithm combo. Hooks
   // into optUpdateStarSplitButtonState so the Split Stars button
   // reflects availability of the currently selected engine.
   this.syncStarSplitPanels = function(idx) {
      try { dlg.starSplitSxtGroup.visible = idx === 0; } catch (eS0) {}
      try { dlg.starSplitSn2Group.visible = idx === 1; } catch (eS1) {}
      try { dlg.starSplitSyQonGroup.visible = idx === 2; } catch (eS1_2) {}
      try { optUpdateStarSplitButtonState(dlg); } catch (eS2) {}
   };
   this.comboStarSplitAlgo.onItemSelected = function(idx) { dlg.syncStarSplitPanels(idx); };
   this.syncStarSplitPanels(0);   // initial: SXT selected
   // ===== STARNET2-END =====

   // Primary CTA: runs the selected engine. Action label stays in
   // English for tooltip lookup and console messages. The CTA shares a
   // horizontal row with the secondary Compare button so both Star
   // Split engines can be benchmarked side by side in one click.
   var ssRow = new Control(sxt.body);
   ssRow.sizer = new HorizontalSizer();
   ssRow.sizer.spacing = 5;
   this.btnCreateStarSplit = optPrimaryButton(ssRow, "Split Stars", 0);
   optThemeApplyPrimaryCta(this.btnCreateStarSplit);
   this.btnCreateStarSplit.onClick = function() { optSafeUi("Split Stars", function() { dlg.createStarSplit(); }); };
   // ===== COMPARE-BEGIN — Star Split Compare button =====
   this.btnCreateStarSplitCompare = optButton(ssRow, "Compare", 0);
   optThemeApplyActionButton(this.btnCreateStarSplitCompare);
   optApplyExplicitTooltip(this.btnCreateStarSplitCompare, "button.Compare");
   this.btnCreateStarSplitCompare.onClick = function() {
      optSafeUi("Compare Star Split", function() { optCompareStarSplit(dlg); });
   };
   // ===== COMPARE-END =====
   ssRow.sizer.add(this.btnCreateStarSplit, 1);
   ssRow.sizer.add(this.btnCreateStarSplitCompare, 1);
   sxt.body.sizer.add(ssRow);
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
         // Phase 6 theme: surface bg, subtle white grid, amber curve.
         g.fillRect(0, 0, w, h, new Brush(optThemeColorInt("surface")));
         g.pen = new Pen(optThemeColorInt("border"), 1);
         for (var gi = 0; gi <= 4; ++gi) {
            g.drawLine(m + gi * cw / 4, m, m + gi * cw / 4, h - m);
            g.drawLine(m, h - m - gi * ch / 4, w - m, h - m - gi * ch / 4);
         }
         g.pen = new Pen(optThemeColorInt("borderStrong"), 1);
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
            g.pen = new Pen(optThemeColorInt("textMuted"), 1);
            g.drawTextRect(new Rect(m, m, w - m, h - m), "Histogram", TextAlign_Center | TextAlign_VertCenter);
         }
         var dashInt = optThemeColorInt("textDim");
         try { g.pen = new Pen(dashInt, 1, PenStyle_Dash); } catch (eDash) { g.pen = new Pen(dashInt, 1); }
         g.drawLine(m, h - m, w - m, m);
         var pts = this.__pts || [[0, 0], [1, 1]];
         var lut = optAkimaInterpolate(pts, 512);
         g.antialiasing = true;
         g.pen = new Pen(optThemeColorInt("amber"), 2);
         for (var si = 1; si < lut.length; ++si)
            g.drawLine(m + ((si - 1) / (lut.length - 1)) * cw, h - m - lut[si - 1] * ch, m + (si / (lut.length - 1)) * cw, h - m - lut[si] * ch);
         var pointFill   = optThemeColorInt("amber");
         var pointHover  = optThemeColorInt("amberBright");
         var pointBorder = optThemeColorInt("surface");
         for (var pi = 0; pi < pts.length; ++pi) {
            var px = this.xToCanvas(pts[pi][0]), py = this.yToCanvas(pts[pi][1]), rr = this.__pointRadius;
            g.pen = new Pen(pointBorder, 2);
            g.brush = new Brush(pi === this.__hoverIdx ? pointHover : pointFill);
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

function optBuildMaskMemoryPanel(dialog, parent, previewPane) {
   if (!dialog.postMaskMemory)
      dialog.postMaskMemory = new OptMaskMemoryManager(OPT_MASK_MEMORY_SLOTS);
   // Phase 6.10: themed Mask memory panel — same shape as the image memory
   // bank above the preview (MASK label + container of 8 chip buttons +
   // ghost reset, plus an extra Show/Hide button on the right).
   var row = new Control(parent);
   row.sizer = new HorizontalSizer();
   row.sizer.spacing = Theme.s2;
   var maskLabel = new Label(row);
   maskLabel.text = "MASK";
   maskLabel.textAlignment = TextAlign_Left | TextAlign_VertCenter;
   optThemeApplyMemoryLabel(maskLabel);
   // Phase 6.11: fixed label column matching the MEMORY row above.
   maskLabel.minWidth = 60; try { maskLabel.maxWidth = 60; } catch (eML) {}
   row.sizer.add(maskLabel);

   var maskContainer = new Control(row);
   optThemeApplyMemoryContainer(maskContainer);
   maskContainer.sizer = new HorizontalSizer();
   maskContainer.sizer.margin = 3;
   maskContainer.sizer.spacing = 2;

   var buttons = [];
   var ttMaskSlot = "";
   try { ttMaskSlot = optTooltipTextByKey("mask.memory.slot") || ""; } catch (eTMS) {}
   for (var i = 0; i < OPT_MASK_MEMORY_SLOTS; ++i) {
      var b = optButton(maskContainer, "" + (i + 1), 0);
      optThemeApplyMemorySlot(b, false);
      b.__maskMemoryIndex = i;
      if (ttMaskSlot) { try { b.toolTip = ttMaskSlot; } catch (eTMB) {} }
      buttons.push(b);
      // Left-click: store the current postActiveMask in this slot.
      b.onClick = function() {
         var activeMask = dialog.postActiveMask;
         if (!optSafeView(activeMask)) return;
         var m = optMaskMemoryMeta(dialog);
         dialog.postMaskMemory.storeAt(this.__maskMemoryIndex, activeMask, m);
         if (typeof dialog.refreshPostMaskMemoryUi === "function")
            dialog.refreshPostMaskMemoryUi();
      };
      // Right-click: recall AND activate in a single gesture (v33-opt-9m).
      // Mirrors image-memory's right-click=recall: the slot's mask becomes
      // the new postActiveMask immediately. Eliminates the previous two-step
      // flow that required clicking "Set to Active Mask" after recall.
      b.onMousePress = function(x, y, button) {
         if (button !== OPT_MOUSE_RIGHT) return;
         var idx = this.__maskMemoryIndex;
         optSafeUi("Recall and activate mask memory", function() {
            var slot = dialog.postMaskMemory.select(idx);
            if (!slot || !optSafeView(slot.view)) return;
            optSetActivePostMaskFromMemory(dialog, slot.view, previewPane);
         });
      };
      maskContainer.sizer.add(b);
   }
   row.sizer.add(maskContainer);

   var btnReset = optButton(row, "RESET", 0);
   optThemeApplyMemoryReset(btnReset);
   try {
      var ttRstMsk = optTooltipTextByKey("reset.mask");
      if (ttRstMsk) btnReset.toolTip = ttRstMsk;
   } catch (eRstMsk) {}
   var btnShowHide = optButton(row, "SHOW/HIDE", 0);
   optThemeApplyMemoryReset(btnShowHide);
   if (!dialog._postShowHideMaskButtons) dialog._postShowHideMaskButtons = [];
   dialog._postShowHideMaskButtons.push(btnShowHide);
   // v33-opt-9m: "Set to Active Mask" button removed — right-click on a
   // memory slot now activates directly. Image-memory parity.
   dialog.refreshPostMaskMemoryUi = function() {
      var showHideEnabled = optSafeView(dialog.postActiveMask);
      for (var k = 0; k < dialog._postShowHideMaskButtons.length; ++k)
         if (dialog._postShowHideMaskButtons[k])
            dialog._postShowHideMaskButtons[k].enabled = showHideEnabled;
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
   row.sizer.add(btnReset);
   row.sizer.add(btnShowHide);
   row.sizer.addStretch();
   dialog.postMaskMemory.registerButtons(buttons);
   dialog.refreshPostMaskMemoryUi();
   parent.sizer.add(row);
   return row;
}

function optBuildPostNoiseSection(dlg) {
   dlg.postTab.addProcessSection("Noise Reduction", [{
      text: "Apply Noise Reduction",
      stage: "Noise Reduction",
      actionKey: "post_nr",
      name: "btnPostNR",
      width: 180,
      transform: function(candidate, dialog) { return optApplyPostCandidate(candidate, "post_nr", dialog); }
   }, {
      // ===== COMPARE-BEGIN (button entry) =====
      text: "Compare",
      stage: "Compare Noise Reduction",
      name: "btnPostNRCompare",
      width: 90,
      primary: false,
      action: function(tab, pane, btn) { optComparePostNoiseReduction(tab.dialog); }
      // ===== COMPARE-END =====
   }], {
      build: function(body) {
         // PRISM-INTEGRATION-BEGIN
         var row = optComboRow(body, "Algorithm:", ["NoiseXTerminator", "TGVDenoise", "Cosmic Clarity (Seti Astro)", "GraXpert Denoise", "Prism (SyQon)"], 80);
         // PRISM-INTEGRATION-END
         dlg.comboPostNR = row.combo;
         body.sizer.add(row.row);
         dlg.postNXTGroup = optInnerGroup(body, "NoiseXTerminator Settings");
         dlg.ncPostNxtDenoise = optNumeric(dlg.postNXTGroup, "Denoise:", 0.0, 1.0, 0.85, 2, 100);
         dlg.ncPostNxtIter = optNumeric(dlg.postNXTGroup, "Iterations:", 1, 5, 2, 0, 100);
         
         dlg.chkPostNxtColorSep = new CheckBox(dlg.postNXTGroup);
         dlg.chkPostNxtColorSep.text = "Enable color separation";
         optApplyCheckBoxTooltip(dlg.chkPostNxtColorSep);
         
         dlg.chkPostNxtFreqSep = new CheckBox(dlg.postNXTGroup);
         dlg.chkPostNxtFreqSep.text = "Enable frequency separation";
         optApplyCheckBoxTooltip(dlg.chkPostNxtFreqSep);
         
         dlg.ncPostNxtDenoiseColor = optNumeric(dlg.postNXTGroup, "Denoise Color:", 0.0, 1.0, 0.95, 2, 100);
         // Override the shared "Den. Color" lookup with the NXT-specific
         // tooltip; the Cosmic Clarity denoise panel sets cc.denoise.color
         // on its own slider, so each engine gets its own help text.
         try {
            var ttNxtDenColor = optTooltipTextByKey("nxt.denoise.color");
            if (ttNxtDenColor) {
               dlg.ncPostNxtDenoiseColor.toolTip = ttNxtDenColor;
               try { dlg.ncPostNxtDenoiseColor.label.toolTip = ttNxtDenColor; } catch (eNL0) {}
               try { dlg.ncPostNxtDenoiseColor.slider.toolTip = ttNxtDenColor; } catch (eNS0) {}
            }
         } catch (eNxtDC) {}
         dlg.ncPostNxtFreqScale = optNumeric(dlg.postNXTGroup, "HF/LF Scale:", 1.0, 15.0, 5.0, 1, 100);
         dlg.ncPostNxtDenoiseLF = optNumeric(dlg.postNXTGroup, "Denoise LF:", 0.0, 1.0, 0.60, 2, 100);
         dlg.ncPostNxtDenoiseLFColor = optNumeric(dlg.postNXTGroup, "Den. LF Color:", 0.0, 1.0, 1.00, 2, 100);
         
         // Layout main settings
         dlg.postNXTGroup.sizer.add(dlg.ncPostNxtDenoise);
         dlg.postNXTGroup.sizer.add(dlg.ncPostNxtIter);
         
         // Spacing
         dlg.postNXTGroup.sizer.addSpacing(4);
         
         // Layout Color Separation section
         dlg.postNXTGroup.sizer.add(dlg.chkPostNxtColorSep);
         dlg.postNXTGroup.sizer.add(dlg.ncPostNxtDenoiseColor);
         
         // Spacing
         dlg.postNXTGroup.sizer.addSpacing(4);
         
         // Layout Frequency Separation section
         dlg.postNXTGroup.sizer.add(dlg.chkPostNxtFreqSep);
         dlg.postNXTGroup.sizer.add(dlg.ncPostNxtFreqScale);
         dlg.postNXTGroup.sizer.add(dlg.ncPostNxtDenoiseLF);
         dlg.postNXTGroup.sizer.add(dlg.ncPostNxtDenoiseLFColor);
         
         // State synchronization logic
         dlg.updateNxtUiStates = function() {
            var isRgb = true;
            try {
               if (typeof dlg.canonicalIsColor === "function") {
                  isRgb = (dlg.canonicalIsColor(OPT_TAB_POST) === true);
               }
            } catch (eRgb) {}
            
            var colorSep = dlg.chkPostNxtColorSep.checked && isRgb;
            var freqSep = dlg.chkPostNxtFreqSep.checked;
            
            dlg.ncPostNxtDenoiseColor.enabled = colorSep;
            dlg.ncPostNxtFreqScale.enabled = freqSep;
            dlg.ncPostNxtDenoiseLF.enabled = freqSep;
            dlg.ncPostNxtDenoiseLFColor.enabled = (colorSep && freqSep);
         };
         
         dlg.chkPostNxtColorSep.onCheck = function(checked) {
            dlg.updateNxtUiStates();
         };
         dlg.chkPostNxtFreqSep.onCheck = function(checked) {
            dlg.updateNxtUiStates();
         };
         
         // Initial trigger
         dlg.updateNxtUiStates();
         
         body.sizer.add(dlg.postNXTGroup);
         dlg.postTGVGroup = optInnerGroup(body, "TGVDenoise Settings");
         dlg.ncPostTgvStrengthL = optNumeric(dlg.postTGVGroup, "Lum. Str.", 1.0, 20.0, 5.0, 1, 80);
         dlg.ncPostTgvStrengthC = optNumeric(dlg.postTGVGroup, "Chr. Str.", 0.0, 20.0, 3.0, 1, 80);
         dlg.ncPostTgvEdge = optNumeric(dlg.postTGVGroup, "Edge Prot.", 0.0, 0.1, 0.002, 4, 80);
         dlg.ncPostTgvSmooth = optNumeric(dlg.postTGVGroup, "Smoothness:", 1.0, 10.0, 2.0, 1, 150);
         dlg.ncPostTgvIter = optNumeric(dlg.postTGVGroup, "Iterations:", 100, 3000, 500, 0, 150);
         dlg.postTGVGroup.sizer.add(dlg.ncPostTgvStrengthL); dlg.postTGVGroup.sizer.add(dlg.ncPostTgvStrengthC);
         dlg.postTGVGroup.sizer.add(dlg.ncPostTgvEdge); dlg.postTGVGroup.sizer.add(dlg.ncPostTgvSmooth); dlg.postTGVGroup.sizer.add(dlg.ncPostTgvIter);
         body.sizer.add(dlg.postTGVGroup);
         dlg.postCCNRGroup = optInnerGroup(body, "Cosmic Clarity Denoise Settings");
         dlg.comboPostCCDenoiseMode = optComboRow(dlg.postCCNRGroup, "Den. Mode", ["Full Image", "Luminance Only"], 80);
         dlg.comboPostCCDenoiseModel = optComboRow(dlg.postCCNRGroup, "Den. Model", ["Walking Noise", "Standard"], 80);
         dlg.ncPostCCNRLuma = optNumeric(dlg.postCCNRGroup, "Den. Luma", 0.0, 1.0, 0.50, 2, 80);
         dlg.ncPostCCNRColor = optNumeric(dlg.postCCNRGroup, "Den. Color", 0.0, 1.0, 0.50, 2, 80);
         // Override the shared "Den. Color" lookup with the Cosmic Clarity
         // specific tooltip; the NoiseXTerminator denoise panel sets
         // nxt.denoise.color on its own slider, so each engine gets its
         // own help text.
         try {
            var ttCCDenColor = optTooltipTextByKey("cc.denoise.color");
            if (ttCCDenColor) {
               dlg.ncPostCCNRColor.toolTip = ttCCDenColor;
               try { dlg.ncPostCCNRColor.label.toolTip = ttCCDenColor; } catch (eCL0) {}
               try { dlg.ncPostCCNRColor.slider.toolTip = ttCCDenColor; } catch (eCS0) {}
            }
         } catch (eCCDC) {}
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

         // PRISM-INTEGRATION-BEGIN
         dlg.postPrismGroup = optInnerGroup(body, "Prism (SyQon) Settings");
         dlg.ncPostPrismStrength = optNumeric(dlg.postPrismGroup, "Strength:", 0.0, 1.0, 0.85, 2, 100);
         dlg.ncPostPrismTileSize = optNumeric(dlg.postPrismGroup, "Tile Size:", 128, 2048, 512, 0, 100);
         dlg.ncPostPrismOverlap = optNumeric(dlg.postPrismGroup, "Overlap:", 8, 512, 128, 0, 100);
         dlg.ncPostPrismPad = optNumeric(dlg.postPrismGroup, "Pad:", 0, 2048, 512, 0, 100);
         
         optApplyExplicitTooltip(dlg.ncPostPrismStrength, "prism.strength");
         try {
            var ttStr = optTooltipTextByKey("prism.strength");
            if (ttStr) {
               dlg.ncPostPrismStrength.label.toolTip = ttStr;
               dlg.ncPostPrismStrength.slider.toolTip = ttStr;
            }
         } catch (e) {}
         
         optApplyExplicitTooltip(dlg.ncPostPrismTileSize, "prism.tileSize");
         try {
            var ttTile = optTooltipTextByKey("prism.tileSize");
            if (ttTile) {
               dlg.ncPostPrismTileSize.label.toolTip = ttTile;
               dlg.ncPostPrismTileSize.slider.toolTip = ttTile;
            }
         } catch (e) {}

         optApplyExplicitTooltip(dlg.ncPostPrismOverlap, "prism.overlap");
         try {
            var ttOverlap = optTooltipTextByKey("prism.overlap");
            if (ttOverlap) {
               dlg.ncPostPrismOverlap.label.toolTip = ttOverlap;
               dlg.ncPostPrismOverlap.slider.toolTip = ttOverlap;
            }
         } catch (e) {}

         optApplyExplicitTooltip(dlg.ncPostPrismPad, "prism.pad");
         try {
            var ttPad = optTooltipTextByKey("prism.pad");
            if (ttPad) {
               dlg.ncPostPrismPad.label.toolTip = ttPad;
               dlg.ncPostPrismPad.slider.toolTip = ttPad;
            }
         } catch (e) {}

         dlg.chkPostPrismUseAMP = new CheckBox(dlg.postPrismGroup);
         dlg.chkPostPrismUseAMP.text = "Use AMP";
         optApplyExplicitTooltip(dlg.chkPostPrismUseAMP, "prism.useAMP");
         
         var ampDTypeRowObj = optComboRow(dlg.postPrismGroup, "AMP Type:", ["fp16", "bf16"], 100);
         dlg.comboPostPrismAMPDType = ampDTypeRowObj.combo;
         optApplyExplicitTooltip(dlg.comboPostPrismAMPDType, "prism.ampDType");
         
         dlg.chkPostPrismUseCPU = new CheckBox(dlg.postPrismGroup);
         dlg.chkPostPrismUseCPU.text = "Force CPU";
         optApplyExplicitTooltip(dlg.chkPostPrismUseCPU, "prism.useCPU");
         
         dlg.chkPostPrismNoDML = new CheckBox(dlg.postPrismGroup);
         dlg.chkPostPrismNoDML.text = "Disable DirectML";
         optApplyExplicitTooltip(dlg.chkPostPrismNoDML, "prism.noDML");
         
         dlg.postPrismGroup.sizer.add(dlg.ncPostPrismStrength);
         dlg.postPrismGroup.sizer.add(dlg.ncPostPrismTileSize);
         dlg.postPrismGroup.sizer.add(dlg.ncPostPrismOverlap);
         dlg.postPrismGroup.sizer.add(dlg.ncPostPrismPad);
         dlg.postPrismGroup.sizer.addSpacing(4);
         dlg.postPrismGroup.sizer.add(dlg.chkPostPrismUseAMP);
         dlg.postPrismGroup.sizer.add(ampDTypeRowObj.row);
         dlg.postPrismGroup.sizer.add(dlg.chkPostPrismUseCPU);
         dlg.postPrismGroup.sizer.add(dlg.chkPostPrismNoDML);
         
         dlg.chkPostPrismUseAMP.onCheck = function(checked) {
            dlg.comboPostPrismAMPDType.enabled = checked;
         };
         dlg.comboPostPrismAMPDType.enabled = dlg.chkPostPrismUseAMP.checked;
         
         body.sizer.add(dlg.postPrismGroup);
         // PRISM-INTEGRATION-END

         dlg.chkPostNRUseMask = new CheckBox(body); dlg.chkPostNRUseMask.text = "Use active mask"; optApplyCheckBoxTooltip(dlg.chkPostNRUseMask); body.sizer.add(dlg.chkPostNRUseMask);
         // PRISM-INTEGRATION-BEGIN
         dlg.syncPostNRPanels = function(idx) {
            dlg.postNXTGroup.visible = idx === 0;
            dlg.postTGVGroup.visible = idx === 1;
            dlg.postCCNRGroup.visible = idx === 2;
            dlg.postGraXpertNRGroup.visible = idx === 3;
            dlg.postPrismGroup.visible = idx === 4;
         };
         // PRISM-INTEGRATION-END
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
   }, {
      text: "Compare",
      stage: "Compare Sharpening",
      name: "btnPostSharpCompare",
      width: 90,
      primary: false,
      action: function(tab, pane, btn) { optComparePostSharpening(tab.dialog); }
   }], {
      build: function(body) {
         var row = optComboRow(body, "Algorithm:", ["BlurXTerminator", "Unsharp Mask", "HDR Multiscale Transform", "Local Histogram Equalization", "Dark Structure Enhance", "Cosmic Clarity"], 80);
         dlg.comboPostSharp = row.combo;
         body.sizer.add(row.row);
         // BXT Post Sharpening uses the same 3-subcard layout (Stars,
         // Nonstellar, Output) as Pre Deconvolution BXT — identical
         // labels, widths and defaults — so users see the same control
         // surface in both BXT entry points and muscle memory carries
         // across tabs.
         dlg.postBXTGroup = new Control(body);
         dlg.postBXTGroup.sizer = new VerticalSizer();
         dlg.postBXTGroup.sizer.margin = 0;
         dlg.postBXTGroup.sizer.spacing = Theme.s2;

         // --- Subcard: STARS -----------------------------------------------
         var postBxtStars = optThemeBuildSubcard(dlg.postBXTGroup, "Stars");
         dlg.ncPostBxtStars            = optNumeric(postBxtStars, "Sharpen",     0.0, 1.0, 0.27, 2, 60);
         dlg.ncPostBxtAdjustStarHalos  = optNumeric(postBxtStars, "Halos",      -1.0, 1.0, 0.00, 2, 60);
         optThemeApplyNumericControl(dlg.ncPostBxtStars);
         optThemeApplyNumericControl(dlg.ncPostBxtAdjustStarHalos);
         postBxtStars.sizer.add(dlg.ncPostBxtStars);
         postBxtStars.sizer.add(dlg.ncPostBxtAdjustStarHalos);
         dlg.postBXTGroup.sizer.add(postBxtStars);

         // --- Subcard: NONSTELLAR ------------------------------------------
         var postBxtNs = optThemeBuildSubcard(dlg.postBXTGroup, "Nonstellar");
         dlg.chkPostBxtAutoPSF         = new CheckBox(postBxtNs);
         dlg.chkPostBxtAutoPSF.text    = "Automatic PSF";
         dlg.chkPostBxtAutoPSF.checked = true;
         optApplyCheckBoxTooltip(dlg.chkPostBxtAutoPSF);
         optThemeApplyCheckBox(dlg.chkPostBxtAutoPSF);
         dlg.ncPostBxtPSFDiameter      = optNumeric(postBxtNs, "PSF Ø",     0.0, 12.0, 4.0, 2, 60);
         dlg.ncPostBxtSharpenNonstellar = optNumeric(postBxtNs, "Sharpen",      0.0,  1.0, 0.35, 2, 60);
         optThemeApplyNumericControl(dlg.ncPostBxtPSFDiameter);
         optThemeApplyNumericControl(dlg.ncPostBxtSharpenNonstellar);
         postBxtNs.sizer.add(dlg.chkPostBxtAutoPSF);
         postBxtNs.sizer.add(dlg.ncPostBxtPSFDiameter);
         postBxtNs.sizer.add(dlg.ncPostBxtSharpenNonstellar);
         dlg.postBXTGroup.sizer.add(postBxtNs);

         // --- Subcard: OUTPUT ---------------------------------------------
         var postBxtOut = optThemeBuildSubcard(dlg.postBXTGroup, "Output");
         dlg.chkPostBxtCorrectOnly          = new CheckBox(postBxtOut);
         dlg.chkPostBxtCorrectOnly.text     = "Correlation Only";
         optApplyCheckBoxTooltip(dlg.chkPostBxtCorrectOnly);
         optThemeApplyCheckBox(dlg.chkPostBxtCorrectOnly);
         dlg.chkPostBxtLuminanceOnly        = new CheckBox(postBxtOut);
         dlg.chkPostBxtLuminanceOnly.text   = "Luminance Only";
         dlg.chkPostBxtLuminanceOnly.checked = true;
         optApplyCheckBoxTooltip(dlg.chkPostBxtLuminanceOnly);
         optThemeApplyCheckBox(dlg.chkPostBxtLuminanceOnly);
         postBxtOut.sizer.add(dlg.chkPostBxtCorrectOnly);
         postBxtOut.sizer.add(dlg.chkPostBxtLuminanceOnly);
         dlg.postBXTGroup.sizer.add(postBxtOut);

         body.sizer.add(dlg.postBXTGroup);
         dlg.postUSMGroup = optInnerGroup(body, "Unsharp Mask Settings");
         dlg.ncPostUsmSigma = optNumeric(dlg.postUSMGroup, "StdDev:", 0.1, 250.0, 2.0, 2, 160);
         dlg.ncPostUsmAmount = optNumeric(dlg.postUSMGroup, "Amount:", 0.01, 1.0, 0.50, 2, 160);
         dlg.chkPostUsmDeringing = new CheckBox(dlg.postUSMGroup); dlg.chkPostUsmDeringing.text = "Deringing"; optApplyCheckBoxTooltip(dlg.chkPostUsmDeringing);
         dlg.ncPostUsmDeringDark = optNumeric(dlg.postUSMGroup, "Dark dering", 0.0, 1.0, 0.10, 3, 90);
         dlg.ncPostUsmDeringBright = optNumeric(dlg.postUSMGroup, "Brt dering", 0.0, 1.0, 0.00, 3, 90);
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
         dlg.ncPostLheRadius = optNumeric(dlg.postLHEGroup, "Kernel rad", 8, 1024, 64, 0, 80);
         dlg.ncPostLheSlope = optNumeric(dlg.postLHEGroup, "Ctr. Limit", 1.0, 100.0, 2.0, 1, 80);
         dlg.ncPostLheAmount = optNumeric(dlg.postLHEGroup, "Amount:", 0.0, 1.0, 0.70, 2, 160);
         dlg.chkPostLheCircular = new CheckBox(dlg.postLHEGroup); dlg.chkPostLheCircular.text = "Circular kernel"; optApplyCheckBoxTooltip(dlg.chkPostLheCircular); dlg.chkPostLheCircular.checked = true;
         dlg.postLHEGroup.sizer.add(dlg.ncPostLheRadius); dlg.postLHEGroup.sizer.add(dlg.ncPostLheSlope); dlg.postLHEGroup.sizer.add(dlg.ncPostLheAmount); dlg.postLHEGroup.sizer.add(dlg.chkPostLheCircular);
         body.sizer.add(dlg.postLHEGroup);
         dlg.postDSEGroup = optInnerGroup(body, "Dark Structure Enhance");
         dlg.ncPostDseAmount = optNumeric(dlg.postDSEGroup, "Amount:", 0.0, 1.0, 0.18, 2, 160);
         dlg.postDSEGroup.sizer.add(dlg.ncPostDseAmount);
         body.sizer.add(dlg.postDSEGroup);
         dlg.postCCSharpGroup = optInnerGroup(body, "Cosmic Clarity Settings");
         dlg.comboPostCCSharpenMode = optComboRow(dlg.postCCSharpGroup, "Targets:", ["Both", "Stellar Only", "Non-Stellar Only"], 160);
         dlg.comboPostCCSharpenModeCombo = dlg.comboPostCCSharpenMode.combo;
         dlg.ncPostCCStellarAmt = optNumeric(dlg.postCCSharpGroup, "Stellar Amt", 0.0, 1.0, 0.90, 2, 90);
         dlg.ncPostCCNSStrength = optNumeric(dlg.postCCSharpGroup, "Ns. Size", 1.0, 8.0, 3.0, 1, 80);
         dlg.ncPostCCNSAmount = optNumeric(dlg.postCCSharpGroup, "Ns. Amt", 0.0, 1.0, 0.50, 2, 80);
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
               // Phase 6 theme: amber mean indicator + amber drag anchor.
               var outer = sz * 0.5 - 2.0;
               var meanRad = dlg.postBalanceMeanHueDeg * Math.PI / 180.0;
               g.pen = new Pen(optThemeColorInt("amber"), 2);
               g.drawLine(cx, cy, cx + Math.cos(meanRad) * outer * 0.65, cy + Math.sin(meanRad) * outer * 0.65);
               var ptRad = dlg.postBalancePointHueDeg * Math.PI / 180.0;
               var pr = outer * optClamp01(dlg.postBalancePointIntensity);
               var px = cx + Math.cos(ptRad) * pr;
               var py = cy + Math.sin(ptRad) * pr;
               g.pen = new Pen(optThemeColorInt("surface"), 2);
               g.brush = new Brush(optThemeColorInt("amber"));
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
         dlg.ncPostColorBalanceSaturation = optNumeric(body, "Hue sat", 0.0, 4.0, 1.00, 2, 150);
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
         dlg.ncPostBalanceR = optNumeric(body, "R mult", 0.0, 2.0, 1.00, 3, 150);
         dlg.ncPostBalanceG = optNumeric(body, "G mult", 0.0, 2.0, 1.00, 3, 150);
         dlg.ncPostBalanceB = optNumeric(body, "B mult", 0.0, 2.0, 1.00, 3, 150);
         dlg.ncPostBalanceSat = optNumeric(body, "Saturation:", 0.0, 2.0, 1.00, 2, 150);
         dlg.chkPostBalanceSCNR = new CheckBox(body); dlg.chkPostBalanceSCNR.text = "SCNR green"; optApplyCheckBoxTooltip(dlg.chkPostBalanceSCNR);
         dlg.ncPostBalanceSCNR = optNumeric(body, "SCNR amt", 0.0, 1.0, 0.60, 2, 150);
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
         dlg.ncPostCurvesShadows = optNumeric(body, "Shadows", 0.0, 0.5, 0.0, 3, 150);
         dlg.ncPostCurvesHighlights = optNumeric(body, "Highlights", 0.0, 0.5, 0.0, 3, 150);
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
               // Phase 6 theme: surface bg + subtle grid + amber-friendly border.
               g.fillRect(0, 0, w, h, new Brush(optThemeColorInt("surface")));
               g.pen = new Pen(optThemeColorInt("border"), 1);
               for (var gi = 0; gi <= 4; ++gi) {
                  g.drawLine(m + gi * cw / 4, m, m + gi * cw / 4, h - m);
                  g.drawLine(m, h - m - gi * ch / 4, w - m, h - m - gi * ch / 4);
               }
               g.pen = new Pen(optThemeColorInt("borderStrong"), 1);
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
                  g.pen = new Pen(optThemeColorInt("textMuted"), 1);
                  g.drawTextRect(new Rect(m, m, w - m, h - m), "Histogram", TextAlign_Center | TextAlign_VertCenter);
               }
               var pcDashInt = optThemeColorInt("textDim");
               try { g.pen = new Pen(pcDashInt, 1, PenStyle_Dash); } catch (eDash) { g.pen = new Pen(pcDashInt, 1); }
               g.drawLine(m, h - m, w - m, m);
               var pts = dlg.postCurvesPoints[key] || [[0,0],[1,1]];
               var lut = optAkimaInterpolate(pts, 512);
               // K and S curves use amber (the brand colour); per-channel
               // curves keep their literal RGB tint for orientation.
               var amberInt = optThemeColorInt("amber");
               var curveColors = { K: amberInt, R: 0xffff4444, G: 0xff44ff44, B: 0xff4488ff, S: amberInt };
               g.antialiasing = true;
               g.pen = new Pen(curveColors[key] || amberInt, 2);
               for (var si = 1; si < lut.length; ++si)
                  g.drawLine(m + ((si - 1) / (lut.length - 1)) * cw, h - m - lut[si - 1] * ch, m + (si / (lut.length - 1)) * cw, h - m - lut[si] * ch);
               var pcPointFill   = amberInt;
               var pcPointHover  = optThemeColorInt("amberBright");
               var pcPointBorder = optThemeColorInt("surface");
               for (var pi = 0; pi < pts.length; ++pi) {
                  var px = this.xToCanvas(pts[pi][0]), py = this.yToCanvas(pts[pi][1]), rr = this.__pointRadius;
                  g.pen = new Pen(pcPointBorder, 2);
                  g.brush = new Brush(pi === this.__hoverIdx ? pcPointHover : pcPointFill);
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
         // "Use This Mask" to produce the full-resolution mask that will
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
                  dlg.lblPostMaskStatus.text = "Mask (preview): " + (maskPreviewView ? maskPreviewView.id : "live") + " - click Use This Mask to commit";
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
         var algoRow = optComboRow(body, "Algorithm:", ["Range Selection", "Color Mask", "FAME (Seti Astro)"], 80);
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
               // Black-to-white gradient strip (intensity bar).
               var bmp = new Bitmap(w, h);
               for (var x = 0; x < w; ++x) {
                  var v = Math.round(255 * x / Math.max(1, w - 1));
                  var px = 0xFF000000 | (v << 16) | (v << 8) | v;
                  for (var y = 0; y < h; ++y) bmp.setPixel(x, y, px);
               }
               g.drawBitmap(0, 0, bmp);
               var low = dlg.ncPostRangeLow.value, high = dlg.ncPostRangeHigh.value;
               var lx = Math.round(low * (w - 1)), hx = Math.round(high * (w - 1));
               // Phase 6 theme: amber for both range markers, amberRing outline
               // for the selected band rectangle.
               g.pen = new Pen(optThemeColorInt("amberRing"), 1);
               g.drawRect(new Rect(Math.min(lx,hx), 1, Math.max(lx,hx)+1, h-1));
               g.pen = new Pen(optThemeColorInt("amber"), 2);
               g.drawLine(lx, 0, lx, h);
               g.drawLine(hx, 0, hx, h);
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
               // Phase 6 theme: amber centre line + amberRing range arms.
               var cx = sz / 2, cy = sz / 2, outerR = sz / 2 - 2;
               var hueRad = dlg.ncPostCMHue.value / 360.0 * 2 * Math.PI - Math.PI / 2;
               var hueRange = dlg.ncPostCMHueRange.value / 360.0 * 2 * Math.PI;
               g.pen = new Pen(optThemeColorInt("amber"), 2);
               g.drawLine(cx, cy, Math.round(cx + outerR * Math.cos(hueRad)), Math.round(cy + outerR * Math.sin(hueRad)));
               g.pen = new Pen(optThemeColorInt("amberRing"), 1);
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

         dlg.ncPostFameBrushRadius  = optNumeric(dlg.postFameGroup, "Brush rad", 1, 200, 20, 0, 80);
         dlg.ncPostFameSprayDensity = optNumeric(dlg.postFameGroup, "Density", 0.0, 1.0, 0.40, 2, 80);
         dlg.ncPostFameBlur         = optNumeric(dlg.postFameGroup, "Blur",  0, 50, 5, 0, 80);
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
         // v33-opt-9m: button renamed from "Generate Active Mask" to "Use This
         // Mask". Same action (commit live params → full-res postActiveMask)
         // but the new label reads as the natural verb for committing the
         // currently-designed mask. Mirrors image-memory's "Set to Current".
         dlg.btnPostGenerateMask = optPrimaryButton(body, "Use This Mask", 180);
         dlg.btnPostClearMask    = optButton(body, "Clear Mask", 90);
         dlg.lblPostMaskStatus   = optInfoLabel(body, "Mask: none");
         dlg.btnPostGenerateMask.onClick = function() {
            optSafeUi("Use This Mask", function() {
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
      // Phase 6.10: capture the section so we can refresh the Source/Mask
      // combos every time the slot is expanded. Otherwise the combos only
      // hold whatever keys were known at the last tab-change refresh —
      // images sent to CC after that read as "None" until the user clicks
      // Refresh Sources manually.
      var ccSection = dlg.ccTab.addProcessSection("Image " + slotIndex, [], {
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
                  // Phase 6 theme: amber mean indicator + amber drag anchor.
                  var meanRad = (s.colorMeanHueDeg || 0.0) * Math.PI / 180.0;
                  g.pen = new Pen(optThemeColorInt("amber"), 2);
                  g.drawLine(cx, cy, cx + Math.cos(meanRad) * outerR * 0.65, cy + Math.sin(meanRad) * outerR * 0.65);
                  var pointRad = (s.colorPointHueDeg || 0.0) * Math.PI / 180.0;
                  var pointR = outerR * optClamp01(s.colorPointIntensity || 0.0);
                  var px = cx + pointR * Math.cos(pointRad);
                  var py = cy + pointR * Math.sin(pointRad);
                  g.pen = new Pen(optThemeColorInt("surface"), 2);
                  g.brush = new Brush(optThemeColorInt("amber"));
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
            slot.ncColorHueSaturation = optNumeric(slot.colorGroup, "Hue sat", 0.0, 4.0, 1.0, 2, 150);
            slot.ncColorR = optNumeric(slot.colorGroup, "R mult", 0.0, 2.0, 1.0, 3, 150);
            slot.ncColorG = optNumeric(slot.colorGroup, "G mult", 0.0, 2.0, 1.0, 3, 150);
            slot.ncColorB = optNumeric(slot.colorGroup, "B mult", 0.0, 2.0, 1.0, 3, 150);
            slot.ncColorSaturation = optNumeric(slot.colorGroup, "Saturation:", 0.0, 2.0, 1.0, 2, 150);
            slot.chkColorSCNR = new CheckBox(slot.colorGroup); slot.chkColorSCNR.text = "SCNR green"; optApplyCheckBoxTooltip(slot.chkColorSCNR);
            slot.ncColorSCNR = optNumeric(slot.colorGroup, "SCNR amt", 0.0, 1.0, 0.60, 2, 150);
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
            slot.ncCurvesShadows = optNumeric(slot.histogramGroup, "Shadows", 0.0, 0.5, 0.0, 3, 150);
            slot.ncCurvesHighlights = optNumeric(slot.histogramGroup, "Highlights", 0.0, 0.5, 0.0, 3, 150);
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
      // Phase 6.10: every time this slot is expanded, re-read the latest
      // workflow keys from the store so the Source/Mask dropdowns reflect
      // whatever the user has produced since the last refresh.
      try {
         var origSetExpanded = ccSection.setExpanded;
         ccSection.setExpanded = function(expanded) {
            origSetExpanded(expanded);
            if (expanded) {
               try { optRefreshCcSlotCombos(dlg); } catch (eRf) {}
            }
         };
      } catch (eHk) {}
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
               // Phase 6 theme: surface bg + subtle grid.
               g.fillRect(0, 0, w, h, new Brush(optThemeColorInt("surface")));
               g.pen = new Pen(optThemeColorInt("border"), 1);
               for (var gi = 0; gi <= 4; ++gi) {
                  g.drawLine(m + gi * cw / 4, m, m + gi * cw / 4, h - m);
                  g.drawLine(m, h - m - gi * ch / 4, w - m, h - m - gi * ch / 4);
               }
               g.pen = new Pen(optThemeColorInt("borderStrong"), 1);
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
                  g.pen = new Pen(optThemeColorInt("textMuted"), 1);
                  g.drawTextRect(new Rect(m, m, w - m, h - m), "Select an Image slot to see its histogram", TextAlign_Center | TextAlign_VertCenter);
               }
               var ccDashInt = optThemeColorInt("textDim");
               try { g.pen = new Pen(ccDashInt, 1, PenStyle_Dash); } catch (eDash) { g.pen = new Pen(ccDashInt, 1); }
               g.drawLine(m, h - m, w - m, m);
               var pts = this.__pts || [[0, 0], [1, 1]];
               var lut = optAkimaInterpolate(pts, 512);
               g.antialiasing = true;
               g.pen = new Pen(optThemeColorInt("amber"), 2);
               for (var si = 1; si < lut.length; ++si)
                  g.drawLine(m + ((si - 1) / (lut.length - 1)) * cw, h - m - lut[si - 1] * ch, m + (si / (lut.length - 1)) * cw, h - m - lut[si] * ch);
               var ccPointFill   = optThemeColorInt("amber");
               var ccPointHover  = optThemeColorInt("amberBright");
               var ccPointBorder = optThemeColorInt("surface");
               for (var pi = 0; pi < pts.length; ++pi) {
                  var px = this.xToCanvas(pts[pi][0]), py = this.yToCanvas(pts[pi][1]), rr = this.__pointRadius;
                  g.pen = new Pen(ccPointBorder, 2);
                  g.brush = new Brush(pi === this.__hoverIdx ? ccPointHover : ccPointFill);
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
   if (typeof dlg.updateNxtUiStates === "function") {
      try { dlg.updateNxtUiStates(); } catch (eNxt) {}
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
      var active = b.__recipe === this.selectedRecipe;
      // Phase 6: amber colour shows selection; the [brackets] indicator is
      // no longer necessary.
      b.text = b.__recipe;
      optThemeApplyRecipeButton(b, active);
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

// Phase 2b fix: programmatic tab switches (e.g. "To Stretching" /
// "To Post Processing" CTAs) need to update BOTH the TabBox and the custom
// pill bar. PJSR's TabBox does not always fire onPageSelected when
// currentPageIndex is assigned from code, so the custom bar would otherwise
// remain stuck on the previous tab. Every callsite that wants to switch
// tabs should go through this helper instead of touching currentPageIndex
// directly.
PIWorkflowOptDialog.prototype.setActiveTab = function(index) {
   try { this.tabs.currentPageIndex = index; } catch (e0) {}
   try { this.customTabBar.setActiveTab(index); } catch (e1) {}
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
   this.setActiveTab(1);                  // Phase 2b: sync TabBox + custom bar
   this.stretchTab.preview.activate(key, true);
   // Auto-expand Star Split: the natural next step after coming from Pre.
   // Done AFTER setActiveTab because onTabChanged → collapseTabSections
   // runs synchronously inside setActiveTab and would otherwise undo this.
   if (this.stretchTab.starSplitSection &&
       typeof this.stretchTab.starSplitSection.setExpanded === "function") {
      try { this.stretchTab.starSplitSection.setExpanded(true); } catch (eExp) {}
   }
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

   // ===== STARNET2-BEGIN — easy-rollback (v137 dual-engine dispatch) =====
   // Read the algorithm combo. 0 = StarXTerminator (default), 1 = StarNet2, 2 = SyQon Starless.
   var methodIdx = 0;
   try { if (this.comboStarSplitAlgo) methodIdx = this.comboStarSplitAlgo.currentItem; } catch (eM0) { methodIdx = 0; }
   // SYQON-STARLESS-INTEGRATION-BEGIN
   var methodLabel = (methodIdx === 1) ? "StarNet2" : (methodIdx === 2 ? "SyQon Starless" : "StarXTerminator");
   // SYQON-STARLESS-INTEGRATION-END
   // ===== STARNET2-END =====

   if (busyPreview) {
      busyPreview.setBusy(true, "Generating Starless / Stars (" + methodLabel + ")");
      try { processEvents(); } catch (eBusy0) {}
   }

   try {
      if (!OPT_TEST_MODE) {
         // SYQON-STARLESS-INTEGRATION-BEGIN
         var engineAvailable = false;
         if (methodIdx === 1) {
            engineAvailable = (typeof StarNet2 !== "undefined");
         } else if (methodIdx === 2) {
            engineAvailable = optIsSyQonStarlessAvailable();
         } else {
            engineAvailable = (typeof StarXTerminator !== "undefined");
         }
         // SYQON-STARLESS-INTEGRATION-END
         if (engineAvailable) {
            var result = this.runStarSplitEngineOn(rec, base, methodIdx);
            starless = result.starless;
            stars = result.stars;
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

// ===== STARNET2-BEGIN — easy-rollback block (v137) =====
// Runs the selected star-removal engine on a clone of rec.view and returns
// { starless, stars } as fresh workflow views. WCS handling, dimension
// safety and window cleanup are the same regardless of engine; only the
// process configuration block differs between methodIdx=0 (SXT) and
// methodIdx=1 (StarNet2).
PIWorkflowOptDialog.prototype.runStarSplitEngineOn = function(rec, base, methodIdx) {
   var dlg = this;
   var starless = null;
   var stars = null;
   var starlessWindow = null;
   var starsWindow = null;

   try {
      // SYQON-STARLESS-INTEGRATION-BEGIN
      if (methodIdx === 2) {
         // ----- SyQon Starless branch --------------------------------
         var starlessParams = optBuildStarlessParamsFromDialog(dlg);
         var res = optRunSyQonStarlessOnView(rec.view, starlessParams, dlg);
         starlessWindow = res.starlessWindow;
         starsWindow = res.starsWindow;
         
         // Transfer astrometric solution and keywords to the starless output
         if (starlessWindow && !starlessWindow.isNull) {
            try { optCopyKeywordsExcludingWCS(starlessWindow, rec.view.window); } catch (e0_sl) {}
            try { optCopyAstrometricSolution(starlessWindow, rec.view.window); } catch (e1_sl) {}
            try { starlessWindow.hide(); } catch (e8_sl) {}
         }
         // Transfer astrometric solution and keywords to the stars output
         if (starsWindow && !starsWindow.isNull) {
            try { optCopyKeywordsExcludingWCS(starsWindow, rec.view.window); } catch (e0_st) {}
            try { optCopyAstrometricSolution(starsWindow, rec.view.window); } catch (e1_st) {}
            try { starsWindow.hide(); } catch (e8_st) {}
         }
      } else {
         // ----- SXT or StarNet2 branches -----------------------------
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
         // Filter WCS keywords out of the copy: PI auto-builds an
         // AstrometricMetadata on the target from any WCS keywords it
         // sees, and that build fails with "AstrometricMetadata::Write():
         // Incompatible image dimensions" when the source was cropped
         // (CRPIX shifted but stale cached W×H). optCopyAstrometricSolution
         // below handles the WCS transfer in a dim-safe way.
         try { optCopyKeywordsExcludingWCS(starlessWindow, rec.view.window); } catch (e0) {}
         try { optCopyAstrometricSolution(starlessWindow, rec.view.window); } catch (e1) {}

         var windowsBefore = ImageWindow.windows;

         if (methodIdx === 1) {
            // ----- StarNet2 branch ---------------------------------------
            // Per user spec: P.linear = true, P.mask = false and P.unscreen
            // = true are fixed; Stride and 2x upsample come from the UI.
            // shadows_clipping / target_background take their canonical
            // StarNet2 defaults explicitly so behaviour does not drift
            // when the user has set them differently in the StarNet2 GUI.
            var sn2 = new StarNet2();
            try { sn2.stride = optResolveStarNet2Stride(dlg); } catch (sn2e1) {}
            try { sn2.mask = false; } catch (sn2e2) {}
            try { sn2.unscreen = true; } catch (sn2e3) {}
            try { sn2.linear = true; } catch (sn2e4) {}
            try { sn2.upsample = (dlg.chkStarSplitUpsample && dlg.chkStarSplitUpsample.checked === true); } catch (sn2e5) {}
            try { sn2.shadows_clipping = -2.80; } catch (sn2e6) {}
            try { sn2.target_background = 0.25; } catch (sn2e7) {}
            sn2.executeOn(starlessWindow.mainView);
         } else {
            // ----- StarXTerminator branch --------------------------------
            // Overlap comes from the UI slider (default 0.20). The ai_file
            // pins the model so behaviour stays reproducible across users
            // even if SXT auto-selects a different default model.
            var sxt = new StarXTerminator();
            try { sxt.ai_file = "StarXTerminator.11.pb"; } catch (eAi) {}
            try { sxt.stars = true; } catch (e2) {}
            try { sxt.generate_stars = true; } catch (e3) {}
            try { sxt.generateStars = true; } catch (e4) {}
            try { sxt.unscreen = false; } catch (e5) {}
            try { sxt.unscreen_stars = false; } catch (e6) {}
            try { sxt.unscreenStars = false; } catch (e7) {}
            var overlap = 0.20;
            try { if (dlg.ncStarSplitOverlap) overlap = dlg.ncStarSplitOverlap.value; } catch (eOv) {}
            try { sxt.overlap = overlap; } catch (eOvSet) {}
            sxt.executeOn(starlessWindow.mainView);
         }

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
      }
      // SYQON-STARLESS-INTEGRATION-END

      starless = optCloneView(starlessWindow.mainView, base + "_Starless", false);
      if (starsWindow && starsWindow.mainView && !starsWindow.mainView.isNull) {
         try { optCopyKeywordsExcludingWCS(starsWindow, rec.view.window); } catch (e9) {}
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

   return { starless: starless, stars: stars };
};
// ===== STARNET2-END =====

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
      throw new Error("There is no committed stretched image available for " + optLabelForKey(key) + ". Click Preview and then 'Use this Image' first.");
   this.store.setAvailable(key, OPT_TAB_POST, true);
   this.store.setAvailable(key, OPT_TAB_CC, true);
   this.refreshWorkflowButtons();
   this.setActiveTab(2);                  // Phase 2b: sync TabBox + custom bar
   this.postTab.preview.activate(key, true);
};

PIWorkflowOptDialog.prototype.finalCleanup = function() {
   try { if (this.previewScheduler) this.previewScheduler.cancelAll(); } catch (eS) {}
   try { if (this.preTab && this.preTab.preview) this.preTab.preview.releaseTransient(); } catch (ePre) {}
   try { if (this.stretchTab && this.stretchTab.preview) this.stretchTab.preview.releaseTransient(); } catch (eStretch) {}
   try { if (this.postTab && this.postTab.preview) this.postTab.preview.releaseTransient(); } catch (ePost) {}
   try { if (this.ccTab && this.ccTab.preview) this.ccTab.preview.releaseTransient(); } catch (eCc) {}
   if (optSafeView(this.postActiveMask))
      optCloseView(this.postActiveMask);
   if (optSafeView(this._postLiveMask)) {
      try { optCloseView(this._postLiveMask); } catch (eLM) {}
   }
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
