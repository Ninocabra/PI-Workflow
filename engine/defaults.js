// ===== ANALYSIS-DEFAULTS-BEGIN (F6 v2: seed manual controls from image analysis) =====
// Projects the CabraMagic image analysis (optCabraAnalyze -> optCabraBuildRecipe)
// onto the *manual* workflow controls, so a manual user starts from an
// analysis-informed point instead of static defaults, then tweaks freely. This module
// is PURE: it only computes suggested control values; it runs no process and touches
// no view. The UI applier (PIWorkflowOptDialog.applyAnalysisDefaults) reads these and
// sets the widgets; the trigger is a button in the Pre tab.
//
// Reversibility: master flag below + three delimited blocks (this module's #include in
// the entry, the applier in ui/dialog.js, and the button in ui/sections_pre_stretch.js,
// all tagged ANALYSIS-DEFAULTS-*). Set the flag false (or remove the three blocks) and
// the feature disappears cleanly; nothing else depends on it.

/** @const Master flag — false removes the "Suggest Defaults" button + applier. */
var OPT_ANALYSIS_DEFAULTS_ENABLED = true;

/**
 * Map the analysis classification to a Detail "By Object Type" object id. The classifier
 * yields compact / starfield / nebula; a compact source with a very high concentration
 * index (a tight planetary / stellar core) maps to "planetary", otherwise "galaxy".
 * @param {Object} stats - output of optCabraAnalyze.
 * @param {Object} recipe - output of optCabraBuildRecipe (carries the label).
 * @returns {string} one of "galaxy" | "nebula" | "globular" | "planetary".
 */
function optAnalysisDefaultObjType(stats, recipe) {
   if (recipe.label === "starfield") return "globular";
   if (recipe.label === "compact")  return (stats.concentrationIndex >= 4.5) ? "planetary" : "galaxy";
   return "nebula";   // nebula / extended object (incl. galaxies)
}

/**
 * Compute analysis-driven default values for the manual controls. PURE: takes the
 * analysis stats, returns a plain object of suggested widget values. No side effects.
 *
 * Mapping rationale:
 *  - starRedStrength: the recipe's `starReduce` is already a 0..1 strength with the same
 *    meaning as the manual Star Reduction Strength control -> 1:1.
 *  - detail*: route to the "By Object Type" preset (the analysis-driven Detail path);
 *    object from the classification, intensity (0=Low/1=Medium/2=High) from the recipe's
 *    structure + detail budget.
 *  - colorMixerStrength: gentler colour on noisy / low-SNR frames, fuller on clean ones.
 *    SNR = (median - background) / noise (robust, measured). The recipe's `saturation` is
 *    deliberately NOT used: it is a fixed constant and linear statistics cannot infer
 *    colour reliably (see optCabraBuildRecipe). 0.55..1.0 is a tunable seed band.
 *
 * @param {Object} stats - output of optCabraAnalyze.
 * @returns {Object} { starRedStrength, detailObjType, detailObjIntensity,
 *                      colorMixerStrength, label, narrowband, snr }.
 */
function optAnalysisDefaults(stats) {
   function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
   var recipe = optCabraBuildRecipe(stats);

   var starRedStrength = clamp(recipe.starReduce, 0, 1);

   var detailObjType = optAnalysisDefaultObjType(stats, recipe);
   var detailBudget = recipe.structure + recipe.detailAmount;   // ~0.16 .. 0.65
   var detailObjIntensity = (detailBudget >= 0.45) ? 2 : (detailBudget >= 0.28 ? 1 : 0);

   var snr = (stats.noise > 0) ? (stats.median - stats.background) / stats.noise : 0;
   var colorMixerStrength = clamp(0.55 + 0.45 * (snr / 15), 0.55, 1.0);

   return {
      starRedStrength: Math.round(starRedStrength * 100) / 100,
      detailObjType: detailObjType,
      detailObjIntensity: detailObjIntensity,
      colorMixerStrength: Math.round(colorMixerStrength * 100) / 100,
      label: recipe.label, narrowband: recipe.narrowband,
      snr: Math.round(snr * 100) / 100
   };
}
// ===== ANALYSIS-DEFAULTS-END =====
