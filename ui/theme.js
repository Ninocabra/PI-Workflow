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
   // I18N: Spanish tooltip overrides; fall back to English when a key is absent.
   try {
      if (OPT_LANG === "es" && typeof OPT6D_TOOLTIPS_ES !== "undefined" &&
          OPT6D_TOOLTIPS_ES && typeof OPT6D_TOOLTIPS_ES[key] !== "undefined" &&
          OPT6D_TOOLTIPS_ES[key])
         return OPT6D_TOOLTIPS_ES[key];
   } catch (eI18n) {}
   try {
      if (typeof OPT6D_TOOLTIPS !== "undefined" && OPT6D_TOOLTIPS != null) {
         if (typeof OPT6D_TOOLTIPS[key] !== "undefined")
            return OPT6D_TOOLTIPS[key];
         else if (typeof OPT_TEST_MODE !== "undefined" && OPT_TEST_MODE)
            console.writeln("DEBUG: Tooltip MISSING for key: '" + key + "'");
      } else {
         if (typeof OPT_TEST_MODE !== "undefined" && OPT_TEST_MODE)
            console.writeln("DEBUG: OPT6D_TOOLTIPS is undefined or null!");
      }
   } catch (e0) {
      if (typeof OPT_TEST_MODE !== "undefined" && OPT_TEST_MODE)
         console.writeln("DEBUG: Error in optTooltipTextByKey: " + e0.message);
   }
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

var OPT_LAST_TOOLTIP_KEY = "";   // I18N: key that matched in the last optTooltipFor

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
   OPT_LAST_TOOLTIP_KEY = "";
   for (var i = 0; i < keys.length; ++i) {
      var tt = optTooltipTextByKey(keys[i]);
      if (tt && tt.length > 0) {
         OPT_LAST_TOOLTIP_KEY = keys[i];   // I18N: remember it for in-place retranslation
         return tt;
      }
   }
   return "";
}

function optApplyTooltip(control, arg2, arg3, arg4) {
   if (!control)
      return;

   // Signature 1: optApplyTooltip(control, text)
   if (arg3 === undefined && arg4 === undefined) {
      if (!arg2) return;
      try { control.toolTip = arg2; } catch (e) {}
      return;
   }

   // Signature 2: optApplyTooltip(control, kind, labelText, genericKind)
   var tt = optTooltipFor(arg2, arg3, arg4);
   if (!tt || tt.length < 1)
      return;
   try { control.toolTip = tt; } catch (e) {}
   // I18N: register by the matched key so the ES/EN toggle can re-pull it.
   if (OPT_LAST_TOOLTIP_KEY) try { optI18nRegisterTip(control, OPT_LAST_TOOLTIP_KEY); } catch (eReg) {}
}

function optApplyExplicitTooltip(control, key, fallback) {
   if (!control)
      return;
   var tt = optTooltipTextByKey(key);
   if ((!tt || tt.length < 1) && fallback)
      tt = fallback;
   if (!tt || tt.length < 1)
      return;
   optApplyTooltip(control, tt);
   // I18N: explicit-key tooltips retranslate by their key.
   try { optI18nRegisterTip(control, key); } catch (eReg) {}
}

// Apply an explicit-key tooltip to a NumericControl AND its sub-widgets (label,
// slider, edit) so the tip shows when hovering the SLIDER — not just the value
// field — and overrides the by-label auto-tooltip optNumeric set (which can resolve
// to another control's text, e.g. the "Sharpen" label collides with BXT's
// "Sharpen Stars"). Registers each widget for ES/EN live retranslation.
function optApplyNumericTooltipKey(nc, key) {
   if (!nc)
      return;
   optApplyExplicitTooltip(nc, key);
   try { optApplyExplicitTooltip(nc.label, key); } catch (e0) {}
   try { optApplyExplicitTooltip(nc.slider, key); } catch (e1) {}
   try { optApplyExplicitTooltip(nc.edit, key); } catch (e2) {}
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

// I18N: translate + register a control's caption/title in place, but ONLY when the
// English string is a known UI key (OPT_I18N_ES). Unknown text (image IDs, numbers,
// computed captions) is left untouched. __enText/__enTitle shadow the English source
// so tooltip-key derivation and retranslation stay stable across language switches.
function optI18nReflectControl(control, enText, enTitle) {
   try {
      if (enText && typeof OPT_I18N_ES !== "undefined" && OPT_I18N_ES && OPT_I18N_ES.hasOwnProperty(enText)) {
         control.__enText = enText;
         OPT_I18N_REGISTRY.push({ c: control, kind: "text", key: enText });
         control.text = optT(enText);
      }
   } catch (e) {}
   try {
      if (enTitle && typeof OPT_I18N_ES !== "undefined" && OPT_I18N_ES && OPT_I18N_ES.hasOwnProperty(enTitle)) {
         control.__enTitle = enTitle;
         OPT_I18N_REGISTRY.push({ c: control, kind: "title", key: enTitle });
         control.title = optT(enTitle);
      }
   } catch (e2) {}
}

function optApplyContextTooltipsDeep(control, depth) {
   if (!control || depth > 24)
      return;
   if (optTooltipAlreadyApplied(control))
      return;
   // I18N: derive tooltip keys from the ENGLISH caption/title (stable across langs).
   var enText = "", enTitle = "";
   try { if (typeof control.title !== "undefined" && control.title) enTitle = control.__enTitle || control.title; } catch (eT) {}
   try { if (typeof control.text !== "undefined" && control.text) enText = control.__enText || control.text; } catch (eX) {}
   try {
      if (enTitle)
         optApplyTooltip(control, "group", enTitle, "");
   } catch (e1) {}
   try {
      if (enText) {
         optApplyTooltip(control, "button", enText, "");
         optApplyTooltip(control, "check", enText, "");
         optApplyTooltip(control, "section", enText, "");
         optApplyTooltip(control, "title", enText, "");
      }
   } catch (e2) {}
   optI18nReflectControl(control, enText, enTitle);   // I18N: translate label/title
   try {
      var children = typeof control.children === "function" ? control.children() : control.children;
      if (children && typeof children.length !== "undefined") {
         for (var i = 0; i < children.length; ++i)
            optApplyContextTooltipsDeep(children[i], depth + 1);
      } else if (typeof control.dialog !== "undefined" && typeof control.controls !== "undefined") {
         // Workaround if it's a dialog and controls are kept elsewhere? But usually we can't reflect PJSR controls easily
      }
   } catch (e3) {
      console.writeln("DEBUG: e3 " + e3.message);
   }
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

