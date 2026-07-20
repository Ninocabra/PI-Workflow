// ===== IMG-ENH / COLOR-MIXER-ENGINE-BEGIN =====
// Clean-room HSL hue-band color mixer (standard colour science only): Rec.709
// luma/chroma split, per-band hue-distance selection mask with smoothstep feather,
// low-sat / shadow / highlight protection, optional luminance Range Mask, saturation
// scaling, hue rotation about the [1,1,1] neutral axis, and luminance lift.
// Independent implementation — no third-party code.
var OPT_CM_AXIS = (function () { var k = 1 / Math.sqrt(3); return [k, k, k]; })();
var OPT_CM_POS_LUM_GAIN = 0.5;   // positive luminance push is gentler than negative.

var OPT_CM_BAND_DEFS = [
   { id: "red",     center: 0,   label: "Red / H-alpha",            color: "#db534b" },
   { id: "orange",  center: 30,  label: "Orange / Galaxy Cores",    color: "#d8872f" },
   { id: "yellow",  center: 60,  label: "Yellow / Warm Stars",      color: "#d8c43f" },
   { id: "green",   center: 120, label: "Green / Cast Control",     color: "#3ba05a" },
   { id: "cyan",    center: 180, label: "Cyan / OIII",              color: "#39b7b5" },
   { id: "blue",    center: 240, label: "Blue / Reflection Nebula", color: "#4a76d4" },
   { id: "purple",  center: 275, label: "Purple / Violet Cleanup",  color: "#7a61d7" },
   { id: "magenta", center: 315, label: "Magenta / Halo Cleanup",   color: "#cb4ca8" }
];

function optCmClamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
function optCmSmoothstep(a, b, x) {
   if (a >= b) return x < a ? 0 : 1;
   var t = (x - a) / (b - a);
   t = t < 0 ? 0 : t > 1 ? 1 : t;
   return t * t * (3 - 2 * t);
}

function optColorMixerDefaultState() {
   var bands = [];
   for (var i = 0; i < OPT_CM_BAND_DEFS.length; ++i) {
      var d = OPT_CM_BAND_DEFS[i];
      bands.push({ id: d.id, center: d.center, label: d.label, color: d.color,
                   hueShift: 0, saturation: 0, vibrance: 0, luminance: 0, width: 45, feather: 0.75,
                   maskBlur: 0, maskBoost: false });
   }
   return {
      bands: bands,
      globalStrength: 1.0,
      protectStars: true,
      protectLowSat: true,
      selectivity: 0.5,   // global band width (0 narrow .. 1 wide); writes all bands' width
      satFloor: 0.015, satFull: 0.07,   // gentle low-sat background guard (auto-managed in UI)
      darkFloor: 0.0,  darkFull: 0.06,
      highlightStart: 0.92, highlightFull: 1.0,
      rangeMask: { enabled: false, low: 0.0, high: 1.0, feather: 0.10 }
   };
}

// Separable box blur for a Float32 mask array (clamped edges). Used by Band Mask
// Shaping to soften a band's selection mask. radius in pixels.
function optCmBoxBlur(src, w, h, radius) {
   var r = Math.round(radius);
   if (r < 1) return src;
   var win = 2 * r + 1;
   var tmp = new Float32Array(w * h);
   var out = new Float32Array(w * h);
   var x, y;
   for (y = 0; y < h; ++y) {
      var base = y * w, sum = 0, k;
      for (k = -r; k <= r; ++k) { var xx = k < 0 ? 0 : (k >= w ? w - 1 : k); sum += src[base + xx]; }
      for (x = 0; x < w; ++x) {
         tmp[base + x] = sum / win;
         var xo = x - r, xi = x + r + 1;
         var xoC = xo < 0 ? 0 : (xo >= w ? w - 1 : xo);
         var xiC = xi < 0 ? 0 : (xi >= w ? w - 1 : xi);
         sum += src[base + xiC] - src[base + xoC];
      }
   }
   for (x = 0; x < w; ++x) {
      var sum2 = 0, j;
      for (j = -r; j <= r; ++j) { var yy = j < 0 ? 0 : (j >= h ? h - 1 : j); sum2 += tmp[yy * w + x]; }
      for (y = 0; y < h; ++y) {
         out[y * w + x] = sum2 / win;
         var yo = y - r, yi = y + r + 1;
         var yoC = yo < 0 ? 0 : (yo >= h ? h - 1 : yo);
         var yiC = yi < 0 ? 0 : (yi >= h ? h - 1 : yi);
         sum2 += tmp[yiC * w + x] - tmp[yoC * w + x];
      }
   }
   return out;
}

// Applies one band's adjustment (saturation scale + vibrance + hue rotation + luminance
// lift) to pixel p of the running R/G/B buffers, weighted by `mask`.
// Vibrance differs from Saturation: its boost is scaled by (1 - srcSat), so it lifts
// faint/under-saturated colour strongly while leaving already-vivid pixels almost
// untouched (avoids the over-saturated, clipped look of a flat Saturation push).
function optCmApplyPixel(R, G, B, p, mask, satBase, vibBase, srcSat, lumBase, hasHue, hueRad, ax, ay, az) {
   var rr = R[p], gg = G[p], bb = B[p];
   var y = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
   var cr = rr - y, cg = gg - y, cb = bb - y;
   var satScale = 1 + (satBase + vibBase * (1 - srcSat)) * mask;
   if (satScale < 0) satScale = 0;
   cr *= satScale; cg *= satScale; cb *= satScale;
   if (hasHue) {
      var ang = hueRad * mask, cosA = Math.cos(ang), sinA = Math.sin(ang), invc = 1 - cosA;
      var dot = cr * ax + cg * ay + cb * az;
      var xr = ay * cb - az * cg, xg = az * cr - ax * cb, xb = ax * cg - ay * cr;
      cr = cr * cosA + xr * sinA + ax * dot * invc;
      cg = cg * cosA + xg * sinA + ay * dot * invc;
      cb = cb * cosA + xb * sinA + az * dot * invc;
   }
   var y2 = lumBase >= 0 ? y + (lumBase * OPT_CM_POS_LUM_GAIN) * mask * (1 - y) : y + lumBase * mask * y;
   R[p] = optCmClamp01(y2 + cr);
   G[p] = optCmClamp01(y2 + cg);
   B[p] = optCmClamp01(y2 + cb);
}

// Maps the Band Mask Shaping "Blur" preset index (0..3) to a pixel radius.
function optCmBlurRadius(blur) {
   var b = Math.round(blur);
   if (b <= 0) return 0;
   if (b === 1) return 5;
   if (b === 2) return 15;
   return 30;
}

// True if any band has a non-zero adjustment (lets callers skip work).
function optColorMixerHasWork(state) {
   if (!state || !state.bands) return false;
   for (var i = 0; i < state.bands.length; ++i) {
      var b = state.bands[i];
      if (Math.abs(b.hueShift) > 1e-6 || Math.abs(b.saturation) > 1e-6 || Math.abs(b.vibrance) > 1e-6 || Math.abs(b.luminance) > 1e-6)
         return true;
   }
   return false;
}

// Applies the full Color Mixer state to a (non-linear, RGB) view, in place.
function optRunColorMixerOnView(view, state) {
   if (!optSafeView(view))
      throw new Error("No valid target view for Color Mixer.");
   var img = view.image;
   if (img.numberOfChannels < 3)
      throw new Error("Color Mixer requires an RGB color image.");
   if (!optColorMixerHasWork(state))
      return view;

   var w = img.width, h = img.height, count = w * h;
   var rect = new Rect(0, 0, w, h);
   var R = new Float32Array(count), G = new Float32Array(count), B = new Float32Array(count);
   img.getSamples(R, rect, 0);
   img.getSamples(G, rect, 1);
   img.getSamples(B, rect, 2);

   // Source HSL computed once from the ORIGINAL pixels so overlapping bands
   // select stably (masks read source hue, edits compose on running RGB).
   var srcH = new Float32Array(count), srcS = new Float32Array(count), srcL = new Float32Array(count);
   for (var i = 0; i < count; ++i) {
      var r = R[i], g = G[i], b = B[i];
      var mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
      var mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
      var d = mx - mn;
      var li = (mx + mn) * 0.5;
      var hue = 0, sat = 0;
      if (d > 1e-7) {
         sat = li > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
         if (mx === r) hue = ((g - b) / d) % 6;
         else if (mx === g) hue = (b - r) / d + 2;
         else hue = (r - g) / d + 4;
         hue *= 60;
         if (hue < 0) hue += 360;
      }
      srcH[i] = hue; srcS[i] = sat; srcL[i] = li;
   }

   var gs = (state.globalStrength != null) ? state.globalStrength : 1;
   var protectLowSat = state.protectLowSat !== false;
   var protectStars = state.protectStars !== false;
   var rmEnabled = state.rangeMask && state.rangeMask.enabled === true;
   var rmLow = rmEnabled ? state.rangeMask.low : 0;
   var rmHigh = rmEnabled ? state.rangeMask.high : 1;
   var rmFeather = rmEnabled ? state.rangeMask.feather : 0;
   var ax = OPT_CM_AXIS[0], ay = OPT_CM_AXIS[1], az = OPT_CM_AXIS[2];

   for (var bi = 0; bi < state.bands.length; ++bi) {
      var band = state.bands[bi];
      var satBase = band.saturation / 100;
      var vibBase = (band.vibrance || 0) / 100;
      var lumBase = band.luminance / 100;
      var hueRad = band.hueShift * Math.PI / 180;
      var hasHue = Math.abs(band.hueShift) > 1e-6;
      if (Math.abs(satBase) < 1e-6 && Math.abs(vibBase) < 1e-6 && Math.abs(lumBase) < 1e-6 && !hasHue)
         continue;
      var outerW = band.width;
      var innerW = band.feather <= 1e-6 ? outerW : outerW * (1 - band.feather);
      var featherDen = outerW - innerW;
      var center = band.center;
      var blurR = optCmBlurRadius(band.maskBlur);
      var boost = band.maskBoost === true;

      // Per-pixel selection mask (hue × low-sat/shadow/highlight protection × Range
      // Mask × global strength). Called synchronously within this iteration.
      var bandMaskAt = function(p) {
         var delta = Math.abs((srcH[p] % 360) - center);
         var dist = delta < (360 - delta) ? delta : (360 - delta);
         var hueMask;
         if (dist <= innerW + 1e-6) hueMask = 1;
         else if (dist <= outerW + 1e-6 && featherDen > 1e-6) {
            var t = (dist - innerW) / featherDen;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            hueMask = 1 - (t * t * (3 - 2 * t));
         } else return 0;
         if (hueMask <= 0) return 0;
         var s = srcS[p], l = srcL[p];
         var satMask = protectLowSat ? optCmSmoothstep(state.satFloor, state.satFull, s) : 1;
         var darkMask = optCmSmoothstep(state.darkFloor, state.darkFull, l);
         var hiMask = protectStars ? (1 - optCmSmoothstep(state.highlightStart, state.highlightFull, l)) : 1;
         var rmMask = 1;
         if (rmEnabled) {
            var lo = optCmSmoothstep(rmLow - rmFeather, rmLow, l);
            var hi = 1 - optCmSmoothstep(rmHigh, rmHigh + rmFeather, l);
            rmMask = lo * hi;
         }
         return hueMask * satMask * darkMask * hiMask * rmMask * gs;
      };

      if (blurR > 0 || boost) {
         // Band Mask Shaping: materialize the mask, blur and/or boost it, then apply.
         var Mk = new Float32Array(count);
         for (var q = 0; q < count; ++q) Mk[q] = bandMaskAt(q);
         if (blurR > 0) Mk = optCmBoxBlur(Mk, w, h, blurR);
         if (boost) for (var q2 = 0; q2 < count; ++q2) { var mv = Mk[q2]; Mk[q2] = mv * (2 - mv); }
         for (var q3 = 0; q3 < count; ++q3) {
            var mm = Mk[q3];
            if (mm > 0) optCmApplyPixel(R, G, B, q3, mm, satBase, vibBase, srcS[q3], lumBase, hasHue, hueRad, ax, ay, az);
         }
      } else {
         for (var p = 0; p < count; ++p) {
            var m = bandMaskAt(p);
            if (m > 0) optCmApplyPixel(R, G, B, p, m, satBase, vibBase, srcS[p], lumBase, hasHue, hueRad, ax, ay, az);
         }
      }
   }

   view.beginProcess(UndoFlag_NoSwapFile);
   img.setSamples(R, rect, 0);
   img.setSamples(G, rect, 1);
   img.setSamples(B, rect, 2);
   view.endProcess();
   return view;
}

// Builds the EFFECTIVE selection mask (1-channel grayscale view) for a single
// band: hue-band × low-sat/shadow/highlight protection × Range Mask × global
// strength — exactly the per-pixel `mask` the engine applies. Shown as a Post-style
// overlay so the user sees what the selected band will touch.
function optBuildColorMixerMaskView(sourceView, state, bandIndex) {
   if (!optSafeView(sourceView))
      throw new Error("No source view for the Color Mixer mask.");
   var img = sourceView.image;
   if (img.numberOfChannels < 3)
      throw new Error("Color Mixer mask requires an RGB color image.");
   // bandIndex >= 0 -> that single band; bandIndex < 0 (or null) -> UNION of all bands with a
   // non-zero adjustment (what the mixer will actually touch); if none adjusted, show all bands.
   var allBands = state.bands, useBands = [];
   if (bandIndex != null && bandIndex >= 0) {
      if (!allBands[bandIndex]) throw new Error("Invalid Color Mixer band.");
      useBands = [allBands[bandIndex]];
   } else {
      for (var ub = 0; ub < allBands.length; ++ub) {
         var bb = allBands[ub];
         if (Math.abs(bb.hueShift) > 1e-6 || Math.abs(bb.saturation) > 1e-6 || Math.abs(bb.vibrance) > 1e-6 || Math.abs(bb.luminance) > 1e-6) useBands.push(bb);
      }
      if (!useBands.length) useBands = allBands.slice(0);
   }
   var w = img.width, h = img.height, count = w * h, rect = new Rect(0, 0, w, h);
   var R = new Float32Array(count), G = new Float32Array(count), B = new Float32Array(count);
   img.getSamples(R, rect, 0); img.getSamples(G, rect, 1); img.getSamples(B, rect, 2);
   var M = new Float32Array(count);
   var gs = (state.globalStrength != null) ? state.globalStrength : 1;
   var protectLowSat = state.protectLowSat !== false, protectStars = state.protectStars !== false;
   var rmEnabled = state.rangeMask && state.rangeMask.enabled === true;
   var rmLow = rmEnabled ? state.rangeMask.low : 0, rmHigh = rmEnabled ? state.rangeMask.high : 1, rmFeather = rmEnabled ? state.rangeMask.feather : 0;
   var bdefs = [];
   for (var bdi = 0; bdi < useBands.length; ++bdi) {
      var ubd = useBands[bdi], ow = ubd.width, iw = ubd.feather <= 1e-6 ? ow : ow * (1 - ubd.feather);
      bdefs.push({ center: ubd.center, outerW: ow, innerW: iw, den: ow - iw });
   }
   for (var i = 0; i < count; ++i) {
      var r = R[i], g = G[i], b = B[i];
      var mx = r > g ? (r > b ? r : b) : (g > b ? g : b), mn = r < g ? (r < b ? r : b) : (g < b ? g : b), d = mx - mn, li = (mx + mn) * 0.5, hue = 0, sat = 0;
      if (d > 1e-7) { sat = li > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
         if (mx === r) hue = ((g - b) / d) % 6; else if (mx === g) hue = (b - r) / d + 2; else hue = (r - g) / d + 4;
         hue *= 60; if (hue < 0) hue += 360; }
      var hueMask = 0;
      for (var bk = 0; bk < bdefs.length; ++bk) {
         var bd = bdefs[bk], delta = Math.abs((hue % 360) - bd.center), dist = delta < (360 - delta) ? delta : (360 - delta), hm;
         if (dist <= bd.innerW + 1e-6) hm = 1;
         else if (dist <= bd.outerW + 1e-6 && bd.den > 1e-6) { var t = (dist - bd.innerW) / bd.den; t = t < 0 ? 0 : t > 1 ? 1 : t; hm = 1 - (t * t * (3 - 2 * t)); }
         else hm = 0;
         if (hm > hueMask) hueMask = hm;
      }
      var m = 0;
      if (hueMask > 0) {
         var satMask = protectLowSat ? optCmSmoothstep(state.satFloor, state.satFull, sat) : 1;
         var darkMask = optCmSmoothstep(state.darkFloor, state.darkFull, li);
         var hiMask = protectStars ? (1 - optCmSmoothstep(state.highlightStart, state.highlightFull, li)) : 1;
         var rmMask = 1;
         if (rmEnabled) { var lo = optCmSmoothstep(rmLow - rmFeather, rmLow, li), hi = 1 - optCmSmoothstep(rmHigh, rmHigh + rmFeather, li); rmMask = lo * hi; }
         m = hueMask * satMask * darkMask * hiMask * rmMask * gs;
      }
      M[i] = m;
   }
   var win = new ImageWindow(w, h, 1, 32, true, false, "ColorMixer_Mask");
   var mv = win.mainView;
   mv.beginProcess(UndoFlag_NoSwapFile);
   mv.image.setSamples(M, rect, 0);
   mv.endProcess();
   return mv;
}

// ===== IMG-ENH / DETAIL-ENGINE-BEGIN =====
// Non-colour "finishing" enhancers (contrast / resolution / texture / structure).
// Most operate on the Rec.709 luminance with O(n) box primitives (box blur, box
// min, a-trous wavelets, guided filter) and re-apply the luminance delta to RGB so
// colour is preserved. Local Contrast uses the native UnsharpMask (C++) for speed.
var OPT_DETAIL_DEFS = [
   { id: "localContrast", label: "Local Contrast (Clarity)" },
   { id: "multiscale",    label: "Multiscale Detail Boost" },
   { id: "edgeAware",     label: "Edge-aware Detail (halo-free)" },
   { id: "highPass",      label: "High-Pass Sharpen" },
   { id: "mmtTexture",    label: "Texture (fine detail)" },
   { id: "dehaze",        label: "Dehaze / Structure Clarity" }
];

function optDetailDefaultState() {
   return {
      algoId: "localContrast",
      lcAmount: 0.20, lcRadius: 80,     // Local Contrast: unsharp amount + sigma(px)
      mdFine: 0.40, mdMedium: 0.20,     // Multiscale: fine/medium detail gain
      eaAmount: 0.70, eaRadius: 8,      // Edge-aware: detail gain + guided radius
      hpAmount: 0.50, hpRadius: 3,      // High-Pass: amount + radius
      txAmount: 0.50,                   // Texture: finest-layer gain
      dhStrength: 0.40, dhRadius: 48,   // Dehaze: contrast strength + guided radius
      hdrLayers: 5, hdrAmount: 0.50,    // HDR Multiscale: layers + compression strength
      dseLayers: 9, dseAmount: 0.30,    // Dark Structure Enhance: base layers + darken
      claTiles: 8, claClip: 2.0, claAmount: 0.40,  // CLAHE: tiles + clip limit + blend
      sigStrength: 4.0, sigBias: 0.40,  // Sigmoidal: slope + bias point
      vibAmount: 0.40,                  // Vibrance: selective saturation
      objType: "galaxy", objIntensity: 1 // By Object Type: type + intensity (0=low,1=med,2=high)
   };
}

// Separable box minimum (morphological erosion) on a Float32 array, clamped edges.
// Separable windowed extreme (min or max) on a Float32 array, clamped edges. O(n)
// regardless of radius via a monotonic-deque sliding window (van Herk style), over an
// edge-replicated extended line. Output is byte-identical to the brute-force O(n*r)
// version (the extreme of the same clamped window is the same float). PERF (F2): box-min
// at r10 on 3.2 Mpx drops from ~300 ms to ~30 ms; matters for Star Reduction's radius.
function optDetailWindowExtreme(src, w, h, r, isMax) {
   if (r < 1) return src;
   var win = 2 * r + 1, count = w * h;
   var tmp = new Float32Array(count), out = new Float32Array(count);
   var L = (w > h ? w : h) + 2 * r;
   var ext = new Float32Array(L), dq = new Int32Array(L);
   var x, y, t, head, tail, v;
   // horizontal pass (rows) -> tmp
   for (y = 0; y < h; ++y) {
      var base = y * w, we = w + 2 * r;
      for (t = 0; t < we; ++t) { var ix = t - r; ix = ix < 0 ? 0 : (ix >= w ? w - 1 : ix); ext[t] = src[base + ix]; }
      head = 0; tail = 0;
      for (t = 0; t < we; ++t) { v = ext[t];
         if (isMax) { while (tail > head && ext[dq[tail - 1]] <= v) --tail; }
         else       { while (tail > head && ext[dq[tail - 1]] >= v) --tail; }
         dq[tail++] = t;
         if (dq[head] <= t - win) ++head;
         if (t >= win - 1) tmp[base + (t - (win - 1))] = ext[dq[head]];
      }
   }
   // vertical pass (columns) -> out
   for (x = 0; x < w; ++x) {
      var he = h + 2 * r;
      for (t = 0; t < he; ++t) { var iy = t - r; iy = iy < 0 ? 0 : (iy >= h ? h - 1 : iy); ext[t] = tmp[iy * w + x]; }
      head = 0; tail = 0;
      for (t = 0; t < he; ++t) { v = ext[t];
         if (isMax) { while (tail > head && ext[dq[tail - 1]] <= v) --tail; }
         else       { while (tail > head && ext[dq[tail - 1]] >= v) --tail; }
         dq[tail++] = t;
         if (dq[head] <= t - win) ++head;
         if (t >= win - 1) out[(t - (win - 1)) * w + x] = ext[dq[head]];
      }
   }
   return out;
}
function optDetailBoxMin(src, w, h, r) { return optDetailWindowExtreme(src, w, h, r, false); }

// Separable box maximum (morphological dilation) on a Float32 array, clamped edges.
function optDetailBoxMax(src, w, h, r) { return optDetailWindowExtreme(src, w, h, r, true); }

// Reads a view, computes the new luminance via lumaFn(Y,w,h), and re-applies the
// luminance DELTA to every channel (preserves colour). Mono views map channel 0.
function optDetailApplyLuma(view, lumaFn) {
   if (!optSafeView(view)) throw new Error("No valid target view.");
   var img = view.image, w = img.width, h = img.height, count = w * h, rect = new Rect(0, 0, w, h);
   var nch = img.numberOfChannels;
   if (nch >= 3) {
      var R = new Float32Array(count), G = new Float32Array(count), B = new Float32Array(count);
      img.getSamples(R, rect, 0); img.getSamples(G, rect, 1); img.getSamples(B, rect, 2);
      var Y = new Float32Array(count);
      for (var i = 0; i < count; ++i) Y[i] = 0.2126 * R[i] + 0.7152 * G[i] + 0.0722 * B[i];
      var nY = lumaFn(Y, w, h);
      for (var j = 0; j < count; ++j) { var dlt = nY[j] - Y[j];
         R[j] = optCmClamp01(R[j] + dlt); G[j] = optCmClamp01(G[j] + dlt); B[j] = optCmClamp01(B[j] + dlt); }
      view.beginProcess(UndoFlag_NoSwapFile);
      img.setSamples(R, rect, 0); img.setSamples(G, rect, 1); img.setSamples(B, rect, 2);
      view.endProcess();
   } else {
      var C = new Float32Array(count); img.getSamples(C, rect, 0);
      var nC = lumaFn(C, w, h);
      for (var p = 0; p < count; ++p) C[p] = optCmClamp01(nC[p]);
      view.beginProcess(UndoFlag_NoSwapFile); img.setSamples(C, rect, 0); view.endProcess();
   }
   return view;
}

// a-trous (box-approx) detail boost: out = Y + sum_k gain[k]*(layer_k detail).
function optDetailAtrousLuma(Y, w, h, gains) {
   var count = w * h, out = new Float32Array(count), cur = Y, k;
   for (var i = 0; i < count; ++i) out[i] = Y[i];
   for (k = 0; k < gains.length; ++k) {
      var g = gains[k];
      var blur = optCmBoxBlur(cur, w, h, 1 << k);
      if (g !== 0) for (var p = 0; p < count; ++p) out[p] += g * (cur[p] - blur[p]);
      cur = blur;
   }
   return out;
}

// Guided-filter (He et al., box-based) detail/contrast boost on luminance.
function optDetailGuidedLuma(Y, w, h, radius, amount) {
   var count = w * h, r = Math.max(1, Math.round(radius)), eps = 1e-4;
   var meanI = optCmBoxBlur(Y, w, h, r);
   var II = new Float32Array(count); for (var i = 0; i < count; ++i) II[i] = Y[i] * Y[i];
   var meanII = optCmBoxBlur(II, w, h, r);
   var a = new Float32Array(count), b = new Float32Array(count);
   for (var p = 0; p < count; ++p) { var v = meanII[p] - meanI[p] * meanI[p]; var ap = v / (v + eps); a[p] = ap; b[p] = meanI[p] * (1 - ap); }
   var ma = optCmBoxBlur(a, w, h, r), mb = optCmBoxBlur(b, w, h, r);
   var out = new Float32Array(count);
   for (var q = 0; q < count; ++q) { var base = ma[q] * Y[q] + mb[q]; out[q] = Y[q] + amount * (Y[q] - base); }
   return out;
}

// Local Contrast / "Clarity": additive unsharp with a LARGE box-blur radius on the
// luminance (broad midtone contrast). Same controlled primitive as High-Pass but at
// a large scale; O(n) sliding-window box blur, so radius is free.
function optDetailLocalContrast(view, st) {
   return optDetailApplyLuma(view, function(Y, w, h) {
      var bl = optCmBoxBlur(Y, w, h, Math.max(2, Math.round(st.lcRadius)));
      var o = new Float32Array(w * h);
      for (var i = 0; i < o.length; ++i) o[i] = Y[i] + st.lcAmount * (Y[i] - bl[i]);
      return o;
   });
}

function optRunDetailOnView(view, st) {
   if (!optSafeView(view)) throw new Error("No valid target view for Detail & Contrast.");
   var id = st && st.algoId ? st.algoId : "localContrast";
   if (id === "byObjectType")
      return optDetailByObjectType(view, st);
   if (id === "hdrmt")
      return optDetailHdrmt(view, st);
   if (id === "dse")
      return optDetailDSE(view, st);
   if (id === "clahe")
      return optDetailClahe(view, st);
   if (id === "sigmoid")
      return optDetailSigmoid(view, st);
   if (id === "vibrance")
      return optDetailVibrance(view, st);
   if (id === "localContrast")
      return optDetailLocalContrast(view, st);
   if (id === "multiscale")
      return optDetailApplyLuma(view, function(Y, w, h) { return optDetailAtrousLuma(Y, w, h, [st.mdFine, st.mdFine, st.mdMedium, st.mdMedium]); });
   if (id === "edgeAware")
      return optDetailApplyLuma(view, function(Y, w, h) { return optDetailGuidedLuma(Y, w, h, st.eaRadius, st.eaAmount); });
   if (id === "highPass")
      return optDetailApplyLuma(view, function(Y, w, h) { var bl = optCmBoxBlur(Y, w, h, Math.max(1, Math.round(st.hpRadius))); var o = new Float32Array(w * h); for (var i = 0; i < o.length; ++i) o[i] = Y[i] + st.hpAmount * (Y[i] - bl[i]); return o; });
   if (id === "mmtTexture")
      return optDetailApplyLuma(view, function(Y, w, h) { return optDetailAtrousLuma(Y, w, h, [st.txAmount, 0, 0, 0]); });
   if (id === "dehaze")
      return optDetailApplyLuma(view, function(Y, w, h) { return optDetailGuidedLuma(Y, w, h, st.dhRadius, st.dhStrength); });
   return view;
}

// "By Object Type" detail: the user picks the object kind + intensity (low/med/high) and the
// best method+params are applied internally. Mapping from the 2026-06-18 Detail & Contrast
// A/B investigation (galaxy=broad local contrast; nebula/globular=fine texture with a strict
// noise budget; planetary=edge-aware, the only method that bites on compact high-contrast).
function optDetailByObjectType(view, st) {
   var lvl = Math.max(0, Math.min(2, Math.round(isFinite(st.objIntensity) ? st.objIntensity : 1)));
   var type = (st.objType || "galaxy");
   var d = {};
   // Mapping tuned by the 2026-06-18 sweep: CLAHE gives the clearest depth/structure pop on
   // extended objects (galaxy arms/dust, nebula filaments); fine texture for star fields;
   // edge-aware for compact high-contrast planetaries.
   if (type === "nebula") { d.algoId = "clahe"; d.claAmount = [0.30, 0.45, 0.60][lvl]; }
   else if (type === "globular" || type === "stars") { d.algoId = "mmtTexture"; d.txAmount = [0.15, 0.30, 0.50][lvl]; }
   else if (type === "planetary") { d.algoId = "edgeAware"; d.eaRadius = 8; d.eaAmount = [0.40, 0.70, 1.20][lvl]; }
   else { d.algoId = "clahe"; d.claAmount = [0.30, 0.45, 0.60][lvl]; }  // galaxy (default)
   console.noteln("=> Detail by object type: " + type + " (level " + lvl + ") -> " + d.algoId);
   return optRunDetailOnView(view, d);
}

// ===== DEPTH/CONTRAST-ENGINE-BEGIN (2026-06-18, clean-room; depth/pop methods) =====
// À-trous (box-approx) decomposition into nLayers detail layers + a smooth residual (base).
function optAtrousDecompose(Y, w, h, nLayers) {
   var n = w * h, layers = [], cur = Y;
   for (var k = 0; k < nLayers; ++k) {
      var blur = optCmBoxBlur(cur, w, h, 1 << k);
      var lay = new Float32Array(n);
      for (var i = 0; i < n; ++i) lay[i] = cur[i] - blur[i];
      layers.push(lay); cur = blur;
   }
   return { layers: layers, residual: cur };
}
// HDRMT: compress the HIGH side of the large-scale base (tame bright cores) while keeping
// the dark background untouched, and boost the detail layers -> reveals core + structure
// with more local "pop", without washing the background. (v2, after the 2026-06-18 sweep
// showed the gamma-lift v1 just flattened the image.)
function optDetailHdrmt(view, st) {
   var N = Math.max(2, Math.round(isFinite(st.hdrLayers) ? st.hdrLayers : 5));
   var amt = isFinite(st.hdrAmount) ? st.hdrAmount : 0.5;
   return optDetailApplyLuma(view, function(Y, w, h) {
      var n = w * h, dec = optAtrousDecompose(Y, w, h, N), base = dec.residual;
      var s = [], stp = Math.max(1, (n / 40000) | 0);
      for (var i = 0; i < n; i += stp) s.push(base[i]);
      s.sort(function(a, b) { return a - b; });
      var bm = s[s.length >> 1];                  // base median
      var detBoost = 1 + 0.6 * amt;               // amplify detail for crispness
      var out = new Float32Array(n);
      for (var p = 0; p < n; ++p) {
         var b = base[p];
         out[p] = (b > bm) ? (bm + (b - bm) * (1 - amt)) : b;   // tame highlights only
      }
      for (var k = 0; k < dec.layers.length; ++k) {
         var lay = dec.layers[k];
         for (var q = 0; q < n; ++q) out[q] += lay[q] * detBoost;
      }
      return out;
   });
}
// DSE (Dark Structure Enhance): deepen dark regions (gamma>1) weighted by a darkness mask
// derived from the large-scale base -> richer dust lanes / negative space, depth relief.
function optDetailDSE(view, st) {
   var N = Math.max(4, Math.round(isFinite(st.dseLayers) ? st.dseLayers : 9));
   var amt = isFinite(st.dseAmount) ? st.dseAmount : 0.30;
   return optDetailApplyLuma(view, function(Y, w, h) {
      var n = w * h, dec = optAtrousDecompose(Y, w, h, N), base = dec.residual, out = new Float32Array(n);
      for (var i = 0; i < n; ++i) {
         var m = 1 - base[i]; if (m < 0) m = 0; else if (m > 1) m = 1;
         var dk = Math.pow(Y[i], 1 + amt);
         out[i] = Y[i] * (1 - m) + dk * m;
      }
      return out;
   });
}
// CLAHE on luminance: clip-limited adaptive histogram equalization (tiled + bilinear blend).
function optDetailClahe(view, st) {
   var tiles = Math.max(2, Math.round(isFinite(st.claTiles) ? st.claTiles : 8));
   var clip = isFinite(st.claClip) ? st.claClip : 2.0;
   var amount = isFinite(st.claAmount) ? st.claAmount : 0.5;
   var BINS = 256;
   return optDetailApplyLuma(view, function(Y, w, h) {
      var n = w * h, txw = Math.ceil(w / tiles), txh = Math.ceil(h / tiles), maps = [];
      for (var ty = 0; ty < tiles; ++ty) {
         maps[ty] = [];
         for (var tx = 0; tx < tiles; ++tx) {
            var x0 = tx * txw, x1 = Math.min(w, x0 + txw), y0 = ty * txh, y1 = Math.min(h, y0 + txh);
            var hist = new Float32Array(BINS), cnt = 0;
            for (var yy = y0; yy < y1; ++yy) { var row = yy * w; for (var xx = x0; xx < x1; ++xx) { var v = Y[row + xx]; var bi = v <= 0 ? 0 : (v >= 1 ? BINS - 1 : (v * (BINS - 1)) | 0); hist[bi]++; cnt++; } }
            if (cnt < 1) { maps[ty][tx] = null; continue; }
            var limit = clip * cnt / BINS, excess = 0;
            for (var b2 = 0; b2 < BINS; ++b2) if (hist[b2] > limit) { excess += hist[b2] - limit; hist[b2] = limit; }
            var add = excess / BINS;
            var map = new Float32Array(BINS), acc = 0;
            for (var b4 = 0; b4 < BINS; ++b4) { acc += hist[b4] + add; map[b4] = acc / cnt; }
            maps[ty][tx] = map;
         }
      }
      function mp(ty, tx, bin) { var m = maps[ty] && maps[ty][tx]; return m ? m[bin] : null; }
      var out = new Float32Array(n);
      for (var y = 0; y < h; ++y) {
         var fy = (y + 0.5) / txh - 0.5, ty0 = Math.floor(fy), wy = fy - ty0;
         var tyA = ty0 < 0 ? 0 : (ty0 >= tiles ? tiles - 1 : ty0), tyB = (ty0 + 1) >= tiles ? tiles - 1 : (ty0 + 1 < 0 ? 0 : ty0 + 1);
         for (var x = 0; x < w; ++x) {
            var idx = y * w + x, v = Y[idx], bin = v <= 0 ? 0 : (v >= 1 ? BINS - 1 : (v * (BINS - 1)) | 0);
            var fx = (x + 0.5) / txw - 0.5, tx0 = Math.floor(fx), wx = fx - tx0;
            var txA = tx0 < 0 ? 0 : (tx0 >= tiles ? tiles - 1 : tx0), txB = (tx0 + 1) >= tiles ? tiles - 1 : (tx0 + 1 < 0 ? 0 : tx0 + 1);
            var m00 = mp(tyA, txA, bin); if (m00 === null) { out[idx] = v; continue; }
            var m01 = mp(tyA, txB, bin), m10 = mp(tyB, txA, bin), m11 = mp(tyB, txB, bin);
            if (m01 === null) m01 = m00; if (m10 === null) m10 = m00; if (m11 === null) m11 = m00;
            var top = m00 * (1 - wx) + m01 * wx, bot = m10 * (1 - wx) + m11 * wx, eq = top * (1 - wy) + bot * wy;
            out[idx] = v * (1 - amount) + eq * amount;
         }
      }
      return out;
   });
}
// Sigmoidal midtone contrast on luminance (S-curve; bias picks the boosted tonal zone).
function optDetailSigmoid(view, st) {
   var k = isFinite(st.sigStrength) ? st.sigStrength : 5, b = isFinite(st.sigBias) ? st.sigBias : 0.4;
   function S(x) { return 1 / (1 + Math.exp(-k * (x - b))); }
   var s0 = S(0), s1 = S(1), den = (s1 - s0) || 1e-6;
   return optDetailApplyLuma(view, function(Y, w, h) { var n = w * h, o = new Float32Array(n); for (var i = 0; i < n; ++i) o[i] = (S(Y[i]) - s0) / den; return o; });
}
// Vibrance: selective saturation (low-saturation pixels boosted most; vivid ones protected).
function optDetailVibrance(view, st) {
   var alpha = isFinite(st.vibAmount) ? st.vibAmount : 0.4;
   if (!optSafeView(view) || view.image.numberOfChannels < 3) return view;
   var im = view.image, w = im.width, h = im.height, n = w * h, rc = new Rect(0, 0, w, h);
   var R = new Float32Array(n), G = new Float32Array(n), Bc = new Float32Array(n);
   im.getSamples(R, rc, 0); im.getSamples(G, rc, 1); im.getSamples(Bc, rc, 2);
   for (var i = 0; i < n; ++i) {
      var r = R[i], g = G[i], bb = Bc[i], mx = Math.max(r, g, bb), mn = Math.min(r, g, bb);
      if (mx <= 1e-6) continue;
      var L = (mx + mn) / 2, S = (mx === mn) ? 0 : (L > 0.5 ? (mx - mn) / (2 - mx - mn) : (mx - mn) / (mx + mn));
      var boost = 1 + alpha * (1 - S), Yv = 0.2126 * r + 0.7152 * g + 0.0722 * bb;
      var nr = Yv + (r - Yv) * boost, ng = Yv + (g - Yv) * boost, nb = Yv + (bb - Yv) * boost;
      R[i] = nr < 0 ? 0 : (nr > 1 ? 1 : nr); G[i] = ng < 0 ? 0 : (ng > 1 ? 1 : ng); Bc[i] = nb < 0 ? 0 : (nb > 1 ? 1 : nb);
   }
   view.beginProcess(UndoFlag_NoSwapFile);
   im.setSamples(R, rc, 0); im.setSamples(G, rc, 1); im.setSamples(Bc, rc, 2);
   view.endProcess();
   return view;
}
// ===== DEPTH/CONTRAST-ENGINE-END =====

// Star Reduction (improved): morphological erosion (box-min) of the luminance,
// blended back GATED by a brightness smoothstep so only bright compact peaks
// (stars) shrink while faint nebula/structure is protected. `size` = erosion
// radius (px), `strength` = 0..1. Used by the Stretching > Stars zone.
function optStarReduceOnView(view, strength, size) {
   var s = (strength == null) ? 0.5 : strength;
   var r = Math.max(1, Math.round(size || 2));
   return optDetailApplyLuma(view, function(Y, w, h) {
      var er = optDetailBoxMin(Y, w, h, r);
      var o = new Float32Array(w * h);
      for (var i = 0; i < o.length; ++i) {
         var gate = optCmSmoothstep(0.10, 0.40, Y[i]);   // protect dim structure
         o[i] = Y[i] - s * gate * (Y[i] - er[i]);
      }
      return o;
   });
}
// ===== IMG-ENH / DETAIL-ENGINE-END =====

// Candidate dispatch for the Image Enhancement tab (mirrors optApplyPostCandidate).
function optApplyImageEnhCandidate(view, actionKey, dialog) {
   if (!optSafeView(view))
      throw new Error("No valid Image Enhancement candidate view.");
   var cfg = (actionKey && typeof actionKey === "object") ? actionKey : { actionKey: actionKey || "" };
   actionKey = cfg.actionKey || "";
   if (actionKey === "imgenh_colormixer") {
      var state = cfg.colorMixer || (dialog ? dialog.colorMixerState : null) || optColorMixerDefaultState();
      return optRunColorMixerOnView(view, state);
   }
   if (actionKey === "imgenh_detail") {
      var dst = cfg.detail || (dialog ? dialog.detailState : null) || optDetailDefaultState();
      return optRunDetailOnView(view, dst);
   }
   return view;
}
// ===== IMG-ENH / COLOR-MIXER-ENGINE-END =====
