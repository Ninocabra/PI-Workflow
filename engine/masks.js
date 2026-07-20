// ===== MASK-HUB-BEGIN (F7: mask maker + global library) =====
// One dispatch over the existing tiled mask builders, so a single "Mask Maker"
// UI can produce any mask type as a standalone, reusable mask window (PixInsight
// masks are global — any mask window applies to any image). The dialog keeps a
// small in-session library of the masks it made. Reuses the Post builders; no new
// mask algorithm. Star/FAME masks need the dialog's star tooling — deferred to v2.
//
// Reversibility: self-contained — remove this file + its #include and the
// Configuration-tab "Mask Maker" card.

/**
 * Build a standalone mask window from a source view, per a small spec.
 *   spec.type = "range" (luminance/range) | "color" (hue/saturation)
 *   range: low, high, fuzz(feather), invert, modeIdx(0 binary|1 range|2 brightness), smooth
 *   color: hue(0..360), hueRange(0..180), satLow(0..1), invert, smooth
 * @param {View} sourceView @param {Object} spec @returns {View} the new mask view (caller owns it).
 */
function optMakeMask(sourceView, spec) {
   if (!optSafeView(sourceView)) throw new Error("Mask: no valid source image.");
   spec = spec || {};
   var num = function(v, d) { return (typeof v === "number" && isFinite(v)) ? v : d; };
   if (spec.type === "color")
      return optBuildPostColorMaskViewTiled(sourceView,
         num(spec.hue, 0), num(spec.hueRange, 30), num(spec.satLow, 0.10),
         spec.invert === true, num(spec.smooth, 2));
   // default: luminance / range
   return optBuildPostRangeMaskViewTiled(sourceView,
      num(spec.low, 0.0), num(spec.high, 1.0), num(spec.fuzz, 0.10),
      spec.invert === true, num(spec.modeIdx, 1), num(spec.smooth, 2));
}
// ===== MASK-HUB-END =====
