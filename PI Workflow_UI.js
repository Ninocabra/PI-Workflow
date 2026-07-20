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

#include "ui/theme.js"
#include "ui/store.js"
#include "ui/widgets.js"
#include "ui/panels.js"
#include "ui/tabs_core.js"
#include "ui/dialog_chrome.js"
#include "ui/sections_pre_stretch.js"
#include "ui/sections_post.js"
#include "ui/sections_enh_cc.js"
#include "ui/sections_annotations.js"
#include "ui/dialog.js"
