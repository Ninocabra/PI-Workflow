// ===== RECIPE-ENGINE-BEGIN (F5: overridable finishing recipes) =====
// CabraMagic is metric-driven: optCabraBuildRecipe(stats) maps measured image
// statistics to a finishing-parameters object the executor consumes. A "recipe"
// here IS that object. This module formalises it so a saved / chosen recipe can
// OVERRIDE the auto-computed one (reproducibility, shareable looks), without
// re-architecting the autopilot. Phase-1 = the data model + the override hook;
// the recipe-picker UI + a built-in library are deliberate follow-ups.
//
// Reversibility: self-contained — remove this file + its #include and restore the
// one-line `var recipe = optCabraBuildRecipe(stats);` in optCabraMagicRun.

/** @const Schema version of a serialised recipe. */
var OPT_RECIPE_SCHEMA = 1;

// Canonical finishing fields with safe clamp ranges + defaults. Numeric fields are
// the knobs the executor reads; label/narrowband are informational/routing hints.
var OPT_RECIPE_NUM_FIELDS = {
   starReduce:   { min: 0, max: 1, def: 0.30 },   // star-size reduction strength
   structure:    { min: 0, max: 1, def: 0.20 },   // local-contrast / structure boost
   coreProtect:  { min: 0, max: 1, def: 0.50 },   // protect concentrated cores from over-sharpening
   detailAmount: { min: 0, max: 1, def: 0.15 },   // detail sharpening amount
   saturation:   { min: 0, max: 1, def: 0.15 }    // saturation lift
};

/**
 * Validate + clamp an arbitrary object into a canonical finishing recipe: every
 * numeric field is coerced into its safe range (missing/NaN -> default), `label`
 * is a string and `narrowband` a boolean. Always returns a complete, safe recipe.
 * @param {Object} r @returns {Object} canonical recipe.
 */
function optRecipeNormalize(r) {
   r = r || {};
   var out = {};
   for (var k in OPT_RECIPE_NUM_FIELDS) {
      if (!OPT_RECIPE_NUM_FIELDS.hasOwnProperty(k)) continue;
      var spec = OPT_RECIPE_NUM_FIELDS[k];
      var v = r[k];
      if (typeof v !== "number" || !isFinite(v)) v = spec.def;
      out[k] = v < spec.min ? spec.min : (v > spec.max ? spec.max : v);
   }
   out.label = (typeof r.label === "string" && r.label) ? r.label : "nebula";
   out.narrowband = r.narrowband === true;
   return out;
}

// Built-in INTENSITY recipes: the analysis still decides the object type and the
// base finishing parameters; a recipe only modulates how strong the finishing is.
// `gain` scales the strength knobs (starReduce/structure/detailAmount/saturation);
// the core-protection knob and the analysis labels are left untouched. "Auto" (1.0)
// applies the analysis unchanged. Order = how they appear in the picker.
var OPT_RECIPE_INTENSITY = [
   { id: "auto",     name: "Auto",     gain: 1.00 },
   { id: "gentle",   name: "Gentle",   gain: 0.60 },
   { id: "balanced", name: "Balanced", gain: 0.80 },
   { id: "punchy",   name: "Punchy",   gain: 1.40 }
];

/** Resolve an intensity spec (mode id string, or a raw numeric gain) to a gain factor. */
function optRecipeIntensityGain(intensity) {
   if (typeof intensity === "number" && isFinite(intensity)) return intensity < 0 ? 0 : intensity;
   if (typeof intensity === "string") {
      for (var i = 0; i < OPT_RECIPE_INTENSITY.length; ++i)
         if (OPT_RECIPE_INTENSITY[i].id === intensity) return OPT_RECIPE_INTENSITY[i].gain;
   }
   return 1.0;   // unknown / "auto" -> analysis unchanged
}

/**
 * Modulate an auto-built recipe by an intensity factor: the strength knobs scale by
 * `gain`; core protection and the analysis labels are preserved. Result is clamped.
 * @param {Object} base - recipe from optCabraBuildRecipe.
 * @param {(number|string)} intensity - gain or intensity-mode id.
 * @returns {Object} the modulated, normalized recipe.
 */
function optRecipeApplyIntensity(base, intensity) {
   var g = optRecipeIntensityGain(intensity);
   return optRecipeNormalize({
      starReduce:   base.starReduce   * g,
      structure:    base.structure    * g,
      detailAmount: base.detailAmount * g,
      saturation:   base.saturation   * g,
      coreProtect:  base.coreProtect,           // protection is object-driven, not aesthetic
      label:        base.label, narrowband: base.narrowband
   });
}

/**
 * Resolve the recipe an executor run should use, in precedence order:
 *   1. opts.recipe          - an explicit full override (programmatic / "capture & reuse").
 *   2. opts.recipeIntensity - an intensity mode/gain that modulates the analysis recipe.
 *   3. the metric-driven recipe built from the image stats (pure analysis).
 * The analysis ALWAYS runs (intensity modulates it; it never replaces classification).
 * @param {Object} stats - output of optCabraAnalyze.
 * @param {Object} [opts] - run options.
 * @returns {Object} the finishing recipe to execute.
 */
function optCabraResolveRecipe(stats, opts) {
   var base = optCabraBuildRecipe(stats);
   if (opts) {
      if (opts.recipe) return optRecipeNormalize(opts.recipe);
      if (opts.recipeIntensity != null) return optRecipeApplyIntensity(base, opts.recipeIntensity);
   }
   return base;
}
// ===== RECIPE-ENGINE-END =====
