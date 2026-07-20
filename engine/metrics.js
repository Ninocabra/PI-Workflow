// ===== QUALITY-METRICS-BEGIN (F7: image quality readout) =====
// Fast, deterministic image-quality statistics, reusing the same robust method
// CabraMagic uses for channel quality (luminance, 5th-percentile background,
// 1.4826*MAD noise on the dark 30%, structure SNR). Pure: depends only on the
// view's pixels. The UI surfaces these via a "Measure" button; the numbers help
// compare candidates / assess an image. No GPU / external tools.
//
// Reversibility: self-contained — remove this file + its #include and the
// Configuration-tab "Image Quality" card.

/** Median of a Float32Array (subsampled sort for speed). @returns {number} */
function optQmMedian(a) {
   var n = a.length, step = Math.max(1, Math.floor(n / 40000)), s = [];
   for (var i = 0; i < n; i += step) s.push(a[i]);
   s.sort(function(x, y) { return x - y; });
   return s.length ? s[s.length >> 1] : 0;
}

/**
 * Compute image-quality metrics for a view. Luminance-based summary plus saturation,
 * dynamic range and (for colour) per-channel medians.
 * @param {View} view
 * @returns {{width,height,channels,background,median,min,max,noise,snr,saturationPct,dynamicRange,channelMedians}}
 */
function optQualityMetrics(view) {
   if (!optSafeView(view)) throw new Error("Quality metrics: no valid image.");
   var img = view.image, w = img.width, h = img.height, nc = img.numberOfChannels;
   var count = w * h, rect = new Rect(0, 0, w, h);
   var Yf = new Float32Array(count), chMed = [];
   if (nc >= 3) {
      var R = new Float32Array(count), G = new Float32Array(count), B = new Float32Array(count);
      img.getSamples(R, rect, 0); img.getSamples(G, rect, 1); img.getSamples(B, rect, 2);
      for (var i = 0; i < count; ++i) Yf[i] = 0.2126 * R[i] + 0.7152 * G[i] + 0.0722 * B[i];
      chMed = [optQmMedian(R), optQmMedian(G), optQmMedian(B)];
   } else {
      img.getSamples(Yf, rect, 0);
   }
   // Saturation fraction on the full-resolution luminance.
   var satCount = 0;
   for (var p = 0; p < count; ++p) if (Yf[p] >= 0.999) ++satCount;
   var satPct = 100 * satCount / count;
   // Downsample for the sorted statistics (matches optCabraChannelQuality).
   var ds = optCabraBoxDown(Yf, w, h, 1500), Y = ds.a, n = ds.w * ds.h;
   var step = Math.max(1, Math.floor(n / 60000)), samp = [];
   for (var s = 0; s < n; s += step) samp.push(Y[s]);
   samp.sort(function(a, b) { return a - b; });
   var ns = samp.length;
   var bg = samp[Math.floor(ns * 0.05)] || 0, med = samp[Math.floor(ns * 0.5)] || 0;
   var mn = samp[0] || 0, mx = samp[ns - 1] || 0;
   var darkN = Math.max(8, Math.floor(ns * 0.30)), dmed = samp[Math.floor(darkN / 2)] || bg, ddev = [];
   for (var d = 0; d < darkN; ++d) ddev.push(Math.abs(samp[d] - dmed));
   ddev.sort(function(a, b) { return a - b; });
   var noise = (1.4826 * (ddev[Math.floor(ddev.length / 2)] || 0)) || 1e-5;
   var snr = (med - bg) / noise;
   var dr = (mx > bg && noise > 0) ? Math.log((mx - bg) / noise) / Math.LN2 : 0;
   return { width: w, height: h, channels: nc, background: bg, median: med, min: mn, max: mx,
            noise: noise, snr: snr, saturationPct: satPct, dynamicRange: dr, channelMedians: chMed };
}

/** Format metrics as a human-readable multi-line string. @param {Object} m @returns {string} */
function optQualityMetricsText(m) {
   var t = m.width + "×" + m.height + " px · " + m.channels + " ch\n" +
      "Background : " + m.background.toFixed(5) + "\n" +
      "Median     : " + m.median.toFixed(5) + "\n" +
      "Noise (σ)  : " + m.noise.toExponential(2) + "\n" +
      "SNR        : " + m.snr.toFixed(1) + "\n" +
      "Saturation : " + m.saturationPct.toFixed(3) + " %\n" +
      "Dyn. range : " + m.dynamicRange.toFixed(1) + " stops\n" +
      "Range      : [" + m.min.toFixed(4) + ", " + m.max.toFixed(4) + "]";
   if (m.channelMedians && m.channelMedians.length === 3)
      t += "\nR/G/B med. : " + m.channelMedians[0].toFixed(4) + " / " +
           m.channelMedians[1].toFixed(4) + " / " + m.channelMedians[2].toFixed(4);
   return t;
}
// ===== QUALITY-METRICS-END =====
