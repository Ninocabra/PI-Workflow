// AUTOGHS-ENGINE-BEGIN
// AutoGHS — iterative automatic Generalised Hyperbolic Stretch (clean-room).
// Independent implementation written from the published GHS equations
// (ghsastro.co.uk — Payne & Cranfield); NOT derived from any third-party code.
// Per iteration: robust stats (median, 1.4826*MAD) on the luminance ->
// linear black-point shift at median - k*sigma -> GHS re-anchored at
// SP = median + k*sigma with highlight protection above HP -> safety stop
// once the luminance median reaches the target. Color is handled in
// luminance mode: factor = GHS(L)/L applied to all channels, which
// preserves the RGB ratios (color) of every pixel.
var OPT_AUTOGHS_TARGET_MEDIAN     = 0.22;  // safety stop: final luminance median
var OPT_AUTOGHS_HIGHLIGHT_PROTECT = 0.92;  // HP: transform stays linear above this
var OPT_AUTOGHS_LOCAL_INTENSITY_B = 1.0;   // GHS 'b' (1 = harmonic)
var OPT_AUTOGHS_LUM_WEIGHTS       = [0.2126, 0.7152, 0.0722]; // Rec.709
var OPT_AUTOGHS_MAX_STATS_SAMPLES = 300000; // subsample size for median/MAD
// AUTOGHS-BG-FLOOR: final black-point lift so the background lands here instead of
// 0 (pure black). Applied once after the iterations as an affine map
// out = floor + in*(1-floor): 0 -> floor, 1 -> 1. Set to 0 to disable.
var OPT_AUTOGHS_BACKGROUND_FLOOR  = 0.05;
// AUTOGHS-SATURATION: in luminance mode each channel = channel * ghs(L)/L keeps the
// linear RGB ratio, which over-saturates strongly-boosted signal and lets a bright
// star's dominant channel clip to white. This blends each channel toward the stretched
// luminance Ls = ghs(L):  out = Ls + sat*(channel*ghs(L)/L - Ls).
//   sat = 1 -> full colour (legacy, byte-identical);
//   sat < 1 -> less saturation AND less core blow-out (channels pulled toward Ls <= 1).
// Per-call override via params.aghs_saturation. Set to 1 to fully revert the behaviour.
var OPT_AUTOGHS_SATURATION         = 0.92;
// AUTOGHS-NOISE-CEILING: the median-target stop forces however-much-stretch-is-needed to
// reach OPT_AUTOGHS_TARGET_MEDIAN, which on faint / low-SNR data (e.g. a dim OIII frame)
// means amplifying the sky noise (and any fixed pattern) without bound. With a ceiling > 0
// the loop ALSO stops once the post-stretch background noise (dark-population sigma) reaches
// it, so noisy data is not over-stretched. Self-discriminating: clean frames reach the
// median target before the ceiling (unchanged); noisy frames stop early. 0 = disabled
// (default; keeps the manual Stretching tab + compose paths byte-identical). The autopilot
// (optCabraMagicRun) passes a value via params.aghs_noiseCeiling.
var OPT_AUTOGHS_NOISE_CEILING      = 0;

// GHS base transform T(x) and derivative T'(x), with D = e^S - 1 and local
// intensity b selecting the curve family (log / integral / exp / harmonic /
// hyperbolic), as published at ghsastro.co.uk.
function optAutoGhsBaseT(x, D, b) {
   if (b === -1)
      return Math.log(1 + D * x);
   if (b < 0)
      return (1 - Math.pow(1 - b * D * x, (b + 1) / b)) / (D * (b + 1));
   if (b === 0)
      return 1 - Math.exp(-D * x);
   if (b === 1)
      return 1 - 1 / (1 + D * x);
   return 1 - Math.pow(1 + b * D * x, -1 / b); // b > 0, b != 1
}

function optAutoGhsBaseTp(x, D, b) {
   if (b === -1)
      return D / (1 + D * x);
   if (b < 0)
      return Math.pow(1 - b * D * x, 1 / b);
   if (b === 0)
      return D * Math.exp(-D * x);
   if (b === 1)
      return D * Math.pow(1 + D * x, -2);
   return D * Math.pow(1 + b * D * x, -(1 + b) / b); // b > 0, b != 1
}

// Full normalized GHS transform on x in [0,1]. Built in 4 regions around the
// symmetry point SP, with linear extensions below LP and above HP, then
// normalized so [T1(0), T4(1)] maps onto [0,1].
function optAutoGhsMakeTransform(D, b, SP, LP, HP) {
   if (D <= 0)
      return function(x) { return x; };
   var tpLP = optAutoGhsBaseTp(SP - LP, D, b);
   var tpHP = optAutoGhsBaseTp(HP - SP, D, b);
   var tLP  = optAutoGhsBaseT(SP - LP, D, b);
   var tHP  = optAutoGhsBaseT(HP - SP, D, b);
   var q0 = -tLP + tpLP * (0 - LP);   // T1(0)
   var q1 =  tHP + tpHP * (1 - HP);   // T4(1)
   var den = (q1 - q0) || 1e-12;
   return function(x) {
      var q;
      if (x < LP)
         q = -tLP + tpLP * (x - LP);          // T1: linear extension
      else if (x < SP)
         q = -optAutoGhsBaseT(SP - x, D, b);  // T2: reflected about SP
      else if (x < HP)
         q = optAutoGhsBaseT(x - SP, D, b);   // T3
      else
         q = tHP + tpHP * (x - HP);           // T4: linear extension
      var v = (q - q0) / den;
      return v < 0 ? 0 : (v > 1 ? 1 : v);
   };
}

// Robust median and sigma (1.4826*MAD) of a Float32Array, on a subsample for speed.
function optAutoGhsMedianMAD(arr, n, maxSamples) {
   var step = Math.max(1, Math.floor(n / maxSamples));
   var s = [];
   for (var i = 0; i < n; i += step)
      s.push(arr[i]);
   s.sort(function(a, b) { return a - b; });
   var med = s[s.length >> 1];
   var d = new Array(s.length);
   for (var j = 0; j < s.length; ++j)
      d[j] = Math.abs(s[j] - med);
   d.sort(function(a, b) { return a - b; });
   var mad = d[d.length >> 1];
   return { median: med, sigma: 1.4826 * mad };
}

// Robust BACKGROUND noise = 1.4826*MAD of the dark population (lowest 30% of a subsample),
// like the analyzer. Unlike the whole-frame MAD above, this tracks the SKY noise only, so a
// frame-filling nebula's structure does not inflate it -> safe as a noise-ceiling signal.
function optAutoGhsBgNoise(arr, n, maxSamples) {
   var step = Math.max(1, Math.floor(n / maxSamples));
   var s = [];
   for (var i = 0; i < n; i += step) s.push(arr[i]);
   s.sort(function(a, b) { return a - b; });
   var darkN = Math.max(8, Math.floor(s.length * 0.30));
   var dmed = s[darkN >> 1] || 0, dev = [];
   for (var j = 0; j < darkN; ++j) dev.push(Math.abs(s[j] - dmed));
   dev.sort(function(a, b) { return a - b; });
   return 1.4826 * (dev[dev.length >> 1] || 0);
}

function optRunAutoGhsStretch(view, params) {
   var img = view.image;
   var w = img.width, h = img.height, nc = img.numberOfChannels, n = w * h;
   var rect = new Rect(0, 0, w, h);
   var isColor = nc >= 3;
   var sigmasFromCenter = isFinite(params.aghs_sigmas) ? params.aghs_sigmas : 1.0;
   var stretchIntensity = isFinite(params.aghs_intensity) ? params.aghs_intensity : 0.7;
   var maxIterations = Math.max(1, Math.round(isFinite(params.aghs_iterations) ? params.aghs_iterations : 10));
   var blackPointSigmas = isFinite(params.aghs_bp) ? params.aghs_bp : 2.8;
   var noiseCeiling = isFinite(params.aghs_noiseCeiling) ? params.aghs_noiseCeiling : OPT_AUTOGHS_NOISE_CEILING;
   console.writeln("=> AutoGHS: " + w + "x" + h + ", " + nc + " ch, sigmas " +
      sigmasFromCenter.toFixed(2) + ", S " + stretchIntensity.toFixed(2) +
      ", iterations " + maxIterations + ", bp sigmas " + blackPointSigmas.toFixed(2) +
      (noiseCeiling > 0 ? ", noise ceiling " + noiseCeiling.toFixed(3) : ""));

   // Load channels into Float32Arrays; all iterations work in memory and the
   // result is written back to the view in a single beginProcess block.
   var ch = [];
   for (var c = 0; c < nc; ++c) {
      ch[c] = new Float32Array(n);
      img.getSamples(ch[c], rect, c);
   }
   var wl = OPT_AUTOGHS_LUM_WEIGHTS;
   var lum = new Float32Array(n);
   function computeLum() {
      if (isColor)
         for (var i = 0; i < n; ++i)
            lum[i] = wl[0] * ch[0][i] + wl[1] * ch[1][i] + wl[2] * ch[2][i];
      else
         for (var k = 0; k < n; ++k)
            lum[k] = ch[0][k];
   }

   var D = Math.exp(stretchIntensity) - 1;
   var b = OPT_AUTOGHS_LOCAL_INTENSITY_B;
   var HP = OPT_AUTOGHS_HIGHLIGHT_PROTECT;

   for (var iter = 1; iter <= maxIterations; ++iter) {
      // 1) robust stats on the current luminance
      computeLum();
      var st = optAutoGhsMedianMAD(lum, n, OPT_AUTOGHS_MAX_STATS_SAMPLES);

      // 2) black point to the LEFT of the histogram peak (background reset)
      var bp = st.median - blackPointSigmas * st.sigma;
      if (bp < 0) bp = 0;
      if (bp > st.median) bp = st.median;
      var bpDen = (1 - bp) || 1e-6;
      if (bp > 0) {
         for (var c2 = 0; c2 < nc; ++c2) {
            var a = ch[c2];
            for (var i2 = 0; i2 < n; ++i2) {
               var v = (a[i2] - bp) / bpDen;
               a[i2] = v < 0 ? 0 : v;
            }
         }
      }

      // 3) re-anchor after the black-point shift
      computeLum();
      var st2 = optAutoGhsMedianMAD(lum, n, OPT_AUTOGHS_MAX_STATS_SAMPLES);
      var SP = st2.median + sigmasFromCenter * st2.sigma;
      if (SP < 0.0001) SP = 0.0001;
      if (SP > HP - 0.0001) SP = HP - 0.0001;
      var ghs = optAutoGhsMakeTransform(D, b, SP, 0.0, HP);

      // 4) apply the transform — luminance mode, with chroma damping toward the
      //    stretched luminance (AUTOGHS-SATURATION) to tame over-saturation + core blow-out.
      if (isColor) {
         var sat = isFinite(params.aghs_saturation) ? params.aghs_saturation : OPT_AUTOGHS_SATURATION;
         if (sat < 0) sat = 0;
         for (var i4 = 0; i4 < n; ++i4) {
            var r0 = ch[0][i4], g0 = ch[1][i4], b0 = ch[2][i4];
            var L = wl[0] * r0 + wl[1] * g0 + wl[2] * b0;
            if (L < 1e-6)
               continue;
            var Ls = ghs(L);          // stretched luminance (the neutral target)
            var f = Ls / L;           // per-pixel boost (== ghs(L)/L)
            var r  = Ls + sat * (r0 * f - Ls);
            var g  = Ls + sat * (g0 * f - Ls);
            var bl = Ls + sat * (b0 * f - Ls);
            ch[0][i4] = r < 0 ? 0 : (r > 1 ? 1 : r);
            ch[1][i4] = g < 0 ? 0 : (g > 1 ? 1 : g);
            ch[2][i4] = bl < 0 ? 0 : (bl > 1 ? 1 : bl);
         }
      } else {
         for (var c3 = 0; c3 < nc; ++c3) {
            var a3 = ch[c3];
            for (var i3 = 0; i3 < n; ++i3)
               a3[i3] = ghs(a3[i3]);
         }
      }

      // 5) target-median safety stop
      computeLum();
      var st3 = optAutoGhsMedianMAD(lum, n, OPT_AUTOGHS_MAX_STATS_SAMPLES);
      var bgN3 = (noiseCeiling > 0) ? optAutoGhsBgNoise(lum, n, OPT_AUTOGHS_MAX_STATS_SAMPLES) : 0;
      console.writeln("=> AutoGHS iter " + iter + ": med " + st.median.toFixed(4) +
         " -> bp " + bp.toFixed(4) + ", SP " + SP.toFixed(4) +
         "  =>  med " + st3.median.toFixed(4) +
         (noiseCeiling > 0 ? ", bgNoise " + bgN3.toFixed(4) : ""));
      if (st3.median >= OPT_AUTOGHS_TARGET_MEDIAN) {
         console.writeln("=> AutoGHS: target median reached at iteration " + iter + ".");
         break;
      }
      // Noise-aware stop: faint/low-SNR data would need an unbounded stretch to reach the
      // median target, amplifying the sky noise. Stop once the background noise hits the ceiling.
      if (noiseCeiling > 0 && bgN3 >= noiseCeiling) {
         console.writeln("=> AutoGHS: background-noise ceiling reached (" + bgN3.toFixed(4) +
            " >= " + noiseCeiling.toFixed(3) + ") at iteration " + iter + " - stopping to avoid amplifying noise.");
         break;
      }
   }

   // AUTOGHS-BG-FLOOR-BEGIN — lift the background off pure black to the configured
   // floor (affine: 0 -> floor, 1 -> 1). One pass over all channels after the loop.
   var bgFloor = isFinite(OPT_AUTOGHS_BACKGROUND_FLOOR) ? OPT_AUTOGHS_BACKGROUND_FLOOR : 0;
   if (bgFloor > 0) {
      var bgScale = 1 - bgFloor;
      for (var cf = 0; cf < nc; ++cf) {
         var af = ch[cf];
         for (var ifx = 0; ifx < n; ++ifx) {
            var vf = bgFloor + af[ifx] * bgScale;
            af[ifx] = vf < 0 ? 0 : (vf > 1 ? 1 : vf);
         }
      }
      console.writeln("=> AutoGHS: background lifted to floor " + bgFloor.toFixed(3) + ".");
   }
   // AUTOGHS-BG-FLOOR-END

   view.beginProcess(UndoFlag_NoSwapFile);
   try {
      for (var c5 = 0; c5 < nc; ++c5)
         view.image.setSamples(ch[c5], rect, c5);
   } finally {
      view.endProcess();
   }
}
// AUTOGHS-ENGINE-END
