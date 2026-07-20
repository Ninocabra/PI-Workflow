// ===== CONFIG-TAB-BEGIN (algorithm enable/disable registry + prefs) =====
// Master flag — set to false to remove the Configuration tab and every
// preference hook (the menus behave as before, all algorithms enabled).
var OPT_CONFIG_TAB_ENABLED = true;

// Canonical menus surfaced in the Configuration tab. Each algo `id` is a STABLE
// key used for persistence (never reorder/rename without a migration); the order
// of `algos` mirrors the corresponding combo so availability masks line up by
// index. `label` is display text.
var OPT_ALGO_MENUS = [
   { id: "preGradient", label: "Pre · Gradient Correction", algos: [
      { id: "mgc",      label: "MultiscaleGradientCorrection (MGC)" },
      { id: "autodbe",  label: "AutoDBE (SetiAstro)" },
      { id: "abe",      label: "AutomaticBackgroundExtractor (ABE)" },
      { id: "graxpert", label: "GraXpert" } ] },
   { id: "preColor", label: "Pre · Color Correction", algos: [
      { id: "spcc", label: "SPCC" },
      { id: "sssc", label: "SSSC" },
      { id: "alf",  label: "Auto Linear Fit" },
      { id: "ot",   label: "Optimal Transport" },
      { id: "bn",   label: "Background Neutralization" } ] },
   { id: "preDecon", label: "Pre · Deconvolution", algos: [
      { id: "bxt",      label: "BlurXTerminator" },
      { id: "parallax", label: "Parallax (SyQon)" },
      { id: "cc",       label: "Cosmic Clarity (SetiAstro)" } ] },
   { id: "stretchStarless", label: "Stretching · RGB / Starless", algos: [
      { id: "stf",    label: "Auto STF" },
      { id: "mas",    label: "Multiscale Adaptive Stretch" },
      { id: "ss",     label: "Statistical Stretch" },
      { id: "aghs",   label: "AutoGHS" },
      { id: "curves", label: "Curves" } ] },
   { id: "stretchStars", label: "Stretching · Stars", algos: [
      { id: "star",   label: "Star Stretch" },
      { id: "aghs",   label: "AutoGHS" },
      { id: "mas",    label: "Multiscale Adaptive Stretch" },
      { id: "stf",    label: "Auto STF" },
      { id: "curves", label: "Curves" } ] },
   { id: "starSplit", label: "Stretching · Star Split", algos: [
      { id: "sxt",      label: "StarXTerminator" },
      { id: "starnet2", label: "StarNet2" },
      { id: "syqon",    label: "SyQon Starless" } ] },
   { id: "postNR", label: "Post · Noise Reduction", algos: [
      { id: "nxt",      label: "NoiseXTerminator" },
      { id: "tgv",      label: "TGVDenoise" },
      { id: "cc",       label: "Cosmic Clarity" },
      { id: "graxpert", label: "GraXpert Denoise" },
      { id: "prism",    label: "Prism (SyQon)" },
      { id: "deepsnr",  label: "DeepSNR" } ] },
   { id: "postSharp", label: "Post · Sharpening", algos: [
      { id: "bxt",      label: "BlurXTerminator" },
      { id: "parallax", label: "Parallax (SyQon)" },
      { id: "usm",      label: "Unsharp Mask" },
      { id: "hdr",      label: "HDR Multiscale Transform" },
      { id: "lhe",      label: "Local Histogram Equalization" },
      { id: "dse",      label: "Dark Structure Enhance" },
      { id: "cc",       label: "Cosmic Clarity" } ] }
];

// Runtime state: menuId -> { algoId: bool }. An absent entry means ENABLED, so a
// fresh install (no saved prefs) keeps every algorithm on.
var OPT_ALGO_ENABLED = {};

function optAlgoPrefKey(menuId, algoId) { return "PIWorkflow/algoEnabled/" + menuId + "/" + algoId; }

function optIsAlgoEnabled(menuId, algoId) {
   var m = OPT_ALGO_ENABLED[menuId];
   if (!m) return true;
   var v = m[algoId];
   if (v === undefined || v === null) return true;
   return v === true;
}

function optSetAlgoEnabled(menuId, algoId, on) {
   if (!OPT_ALGO_ENABLED[menuId]) OPT_ALGO_ENABLED[menuId] = {};
   OPT_ALGO_ENABLED[menuId][algoId] = (on === true);
   try { Settings.write(optAlgoPrefKey(menuId, algoId), DataType_Boolean, on === true); } catch (e) {}
}

// Loads persisted prefs into OPT_ALGO_ENABLED. Only disabled (false) entries are
// recorded; missing keys stay default-on.
function optLoadAlgoPrefs() {
   for (var i = 0; i < OPT_ALGO_MENUS.length; ++i) {
      var menu = OPT_ALGO_MENUS[i];
      for (var j = 0; j < menu.algos.length; ++j) {
         var algoId = menu.algos[j].id;
         var v = null;
         try { v = Settings.read(optAlgoPrefKey(menu.id, algoId), DataType_Boolean); } catch (e) {}
         if (v === false) {
            if (!OPT_ALGO_ENABLED[menu.id]) OPT_ALGO_ENABLED[menu.id] = {};
            OPT_ALGO_ENABLED[menu.id][algoId] = false;
         }
      }
   }
}

// Combos are rebuilt to show only the visible algorithms (installed AND enabled
// in Configuration). The display order then differs from the canonical order the
// dispatch switches expect, so each filterable combo stores `__canonicalIndex`:
// an array mapping the selected display index -> canonical algorithm index. This
// helper returns the canonical index, letting the existing index-based dispatch
// switches stay untouched. Combos with no map (not filtered) pass through.
function optComboCanonicalItem(combo) {
   try {
      if (combo && combo.__canonicalIndex) {
         var di = combo.currentItem;
         if (di >= 0 && di < combo.__canonicalIndex.length)
            return combo.__canonicalIndex[di];
      }
      return combo ? combo.currentItem : 0;
   } catch (e) {
      return 0;
   }
}
// ===== CONFIG-TAB-END =====
