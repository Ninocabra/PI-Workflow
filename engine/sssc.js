// ===== SSSC-ENGINE-BEGIN =====
// Spectrophotometric Standard Star Calibration (empirical colour calibration).
// Derives the imaging system's effective per-channel response from Gaia DR3 BP/RP
// sampled spectra (gdr3sp database) matched to stars measured in the image, so NO
// sensor QE curve or filter response has to be supplied by the user.
//   F0 (this block): plumbing — Gaia spectra query + per-channel star photometry +
//                    spectrum integration helpers.
//   F1..F3 add Stage 1 scalar gains / Stage 2 colour response / Stage 3 R(lambda).
// Reversible: the whole SSSC block can be removed without touching the rest of the
// engine (it is only referenced from the Color Calibration dispatch once F4 lands).

// Generic seed RGB bandpasses (trapezoidal; wavelength in nm). Only a starting guess
// for Stage 1; Stage 2/3 refine the effective response from the star cloud.
function optSSSCSeedBand(channel, lambda) {
   var T = channel === 0 ? [575, 600, 640, 680] :   // R (tuned 2026-06-24 vs SPCC: gR 1.33->0.84)
           channel === 1 ? [485, 510, 565, 600] :   // G (reference)
                           [400, 425, 515, 535];    // B (tuned 2026-06-24 vs SPCC: gB 0.49->0.63)
   if (lambda <= T[0] || lambda >= T[3]) return 0;
   if (lambda < T[1]) return (lambda - T[0]) / (T[1] - T[0]);
   if (lambda > T[2]) return (T[3] - lambda) / (T[3] - T[2]);
   return 1;
}

function optSSSCMedian(a) {
   if (!a.length) return 0;
   var b = a.slice(0).sort(function(x, y) { return x - y; });
   var m = b.length >> 1;
   return (b.length & 1) ? b[m] : 0.5 * (b[m - 1] + b[m]);
}

// Resolves the BP/RP sampled-spectrum wavelength grid of the configured Gaia DR3SP
// database. Reads it from the process when available; otherwise falls back to the
// standard Gaia DR3 sampled grid (336..1020 nm, 2 nm). Logs which was used.
function optSSSCSpectrumGrid(gaia, fluxLen) {
   var start = null, step = null, count = null;
   try { if (gaia && gaia.spectrumStart) start = gaia.spectrumStart; } catch (e0) {}
   try { if (gaia && gaia.spectrumStep)  step  = gaia.spectrumStep; }  catch (e1) {}
   try { if (gaia && gaia.spectrumCount) count = gaia.spectrumCount; } catch (e2) {}
   if (start == null || step == null || !count) {
      start = 336; step = 2; count = fluxLen || 343;
      console.noteln("=> SSSC: spectrum grid not reported by process; using default 336/2/" + count + " nm.");
   } else {
      console.noteln("=> SSSC: spectrum grid = start " + start + " nm, step " + step + " nm, count " + count + ".");
   }
   return { start: start, step: step, count: count };
}

// Integrates one Gaia sampled spectrum through the seed bands -> expected [r,g,b].
function optSSSCIntegrateSpectrum(flux, grid) {
   var r = 0, g = 0, b = 0, n = Math.min(flux.length, grid.count);
   for (var k = 0; k < n; ++k) {
      var lam = grid.start + k * grid.step, f = flux[k];
      if (f <= 0) continue;
      r += f * optSSSCSeedBand(0, lam);
      g += f * optSSSCSeedBand(1, lam);
      b += f * optSSSCSeedBand(2, lam);
   }
   return [r, g, b];
}

// Queries Gaia DR3SP for stars in the field of `window` and returns an array of
// { ra, dec, x, y, magG, magBP, magRP, flux }, where flux is the BP/RP sampled
// spectrum (photon-flux units). Requires (and will compute) an astrometric solution.
// NOTE: needs the DR3SP (gdr3sp) spectrum database configured in the Gaia process —
// available in the user's GUI instance; a clean headless slot will not have it.
function optSSSCQueryGaiaSpectra(window, opts) {
   opts = opts || {};
   if (!window || window.isNull)
      throw new Error("[SSSC] No image window for the Gaia query.");
   var view = window.mainView;
   if (!optHasAstrometricSolution(view))
      optSolveAstrometryOnWindow(window, "the SSSC target view");
   if (!optHasAstrometricSolution(view))
      throw new Error("[SSSC] A valid astrometric solution is required.");
   if (typeof Gaia === "undefined")
      throw new Error("[SSSC] The Gaia process is not installed.");

   var w = view.image.width, h = view.image.height;
   var c  = window.imageToCelestial(w / 2, h / 2);
   var tl = window.imageToCelestial(0, 0), tr = window.imageToCelestial(w, 0),
       bl = window.imageToCelestial(0, h), br = window.imageToCelestial(w, h);
   function angSep(a, b2) {
      var r1 = Math.rad(a.y), r2 = Math.rad(b2.y), dd = Math.rad(b2.x - a.x);
      var v = Math.sin(r1) * Math.sin(r2) + Math.cos(r1) * Math.cos(r2) * Math.cos(dd);
      v = v > 1 ? 1 : (v < -1 ? -1 : v);
      return Math.deg(Math.acos(v));
   }
   var radius = 1.02 * Math.max(angSep(c, tl), angSep(c, tr), angSep(c, bl), angSep(c, br));

   var G = new Gaia;
   G.command = "search";
   G.centerRA = c.x; G.centerDec = c.y; G.radius = radius;
   G.magnitudeLow  = (opts.magLow  != null) ? opts.magLow  : 7.0;    // skip very bright (saturated cores)
   G.magnitudeHigh = (opts.magHigh != null) ? opts.magHigh : 16.0;   // skip too faint (noisy)
   G.sourceLimit = 4294967295;
   G.requiredFlags = 0; G.inclusionFlags = 0; G.exclusionFlags = 0;
   G.normalizeSpectrum = false;
   G.photonFluxUnits = true;        // a detector integrates photons, not energy
   G.generateTextOutput = false; G.generateBinaryOutput = false;
   G.verbosity = 1;
   if (!G.executeGlobal())
      throw new Error("[SSSC] Gaia search failed (is the DR3SP spectrum database configured?).");

   var S = G.sources || [];
   if (!S.length)
      throw new Error("[SSSC] Gaia returned no sources for this field.");
   if (!S[0][9] || !S[0][9].length)
      throw new Error("[SSSC] Gaia sources carry no spectrum — select the DR3SP (gdr3sp) database in the Gaia process.");
   var grid = optSSSCSpectrumGrid(G, S[0][9].length);

   var out = [];
   for (var i = 0; i < S.length; ++i) {
      var s = S[i], flux = s[9];
      if (!flux || !flux.length) continue;
      var p = window.celestialToImage(new Point(s[0], s[1]));
      if (p.x < 0 || p.y < 0 || p.x >= w || p.y >= h) continue;
      out.push({ ra: s[0], dec: s[1], x: p.x, y: p.y,
                 magG: s[5], magBP: s[6], magRP: s[7], flux: flux });
   }
   out.grid = grid;
   console.noteln("=> SSSC: " + out.length + " Gaia stars with spectra inside the image.");
   return out;
}

// Per-channel aperture photometry for a list of catalog stars on a linear RGB view.
// Adds measured { Rm, Gm, Bm, ok, reason } to each star. Background = per-channel
// median of an annulus; stars near the edge, saturated or with non-positive net flux
// are rejected (ok=false). Returns the same array.
function optSSSCStarPhotometry(view, stars, opts) {
   opts = opts || {};
   if (!optSafeView(view) || view.image.numberOfChannels < 3)
      throw new Error("[SSSC] Photometry requires an RGB image.");
   var img = view.image, w = img.width, h = img.height;
   var rAp = opts.aperture || 4, rIn = opts.annulusIn || 7, rOut = opts.annulusOut || 11;
   var satLevel = (opts.satLevel != null) ? opts.satLevel : 0.92;
   var margin = rOut + 2, nOk = 0;
   for (var i = 0; i < stars.length; ++i) {
      var st = stars[i], cx = Math.round(st.x), cy = Math.round(st.y);
      st.ok = false;
      if (cx < margin || cy < margin || cx >= w - margin || cy >= h - margin) { st.reason = "edge"; continue; }
      var bgR = [], bgG = [], bgB = [], apR = 0, apG = 0, apB = 0, nAp = 0, sat = false;
      for (var dy = -rOut; dy <= rOut; ++dy) {
         for (var dx = -rOut; dx <= rOut; ++dx) {
            var d2 = dx * dx + dy * dy, X = cx + dx, Y = cy + dy;
            if (d2 <= rAp * rAp) {
               var r = img.sample(X, Y, 0), g = img.sample(X, Y, 1), b = img.sample(X, Y, 2);
               if (r >= satLevel || g >= satLevel || b >= satLevel) sat = true;
               apR += r; apG += g; apB += b; ++nAp;
            } else if (d2 >= rIn * rIn && d2 <= rOut * rOut) {
               bgR.push(img.sample(X, Y, 0)); bgG.push(img.sample(X, Y, 1)); bgB.push(img.sample(X, Y, 2));
            }
         }
      }
      if (sat) { st.reason = "saturated"; continue; }
      if (nAp < 4 || bgR.length < 8) { st.reason = "geometry"; continue; }
      var mR = optSSSCMedian(bgR), mG = optSSSCMedian(bgG), mB = optSSSCMedian(bgB);
      st.Rm = apR - mR * nAp; st.Gm = apG - mG * nAp; st.Bm = apB - mB * nAp;
      if (st.Rm <= 0 || st.Gm <= 0 || st.Bm <= 0) { st.reason = "lowflux"; continue; }
      st.ok = true; ++nOk;
   }
   console.noteln("=> SSSC: photometry ok on " + nOk + "/" + stars.length + " stars.");
   return stars;
}

// ---- F1: Stage 1 scalar per-channel gains -----------------------------------
// Robust ratio: median after one MAD-based 2.5-sigma clip (rejects blended/odd stars).
function optSSSCRobustRatio(vals) {
   if (!vals.length) return 1;
   var med = optSSSCMedian(vals), dev = [];
   for (var i = 0; i < vals.length; ++i) dev.push(Math.abs(vals[i] - med));
   var mad = optSSSCMedian(dev) * 1.4826;
   if (mad <= 1e-12) return med;
   var keep = [];
   for (var j = 0; j < vals.length; ++j) if (Math.abs(vals[j] - med) <= 2.5 * mad) keep.push(vals[j]);
   return keep.length ? optSSSCMedian(keep) : med;
}

// Fits Stage 1 scalar per-channel gains (relative to green) from photometered stars
// with Gaia spectra: gG = 1; gR, gB make the measured star-cloud colour match the
// colour predicted by integrating each star's spectrum through the seed bands.
// Returns { gR, gG, gB, n, stage }.
function optSSSCFitStage1Gains(stars, grid) {
   var rR = [], rB = [], used = 0;
   for (var i = 0; i < stars.length; ++i) {
      var st = stars[i];
      if (!st.ok || !st.flux) continue;
      var e = optSSSCIntegrateSpectrum(st.flux, grid);
      if (e[0] <= 0 || e[1] <= 0 || e[2] <= 0 || st.Gm <= 0) continue;
      var mR = st.Rm / st.Gm, mB = st.Bm / st.Gm;   // measured colour ratios
      var eR = e[0] / e[1], eB = e[2] / e[1];        // spectrum-predicted ratios
      if (mR <= 0 || mB <= 0) continue;
      rR.push(eR / mR); rB.push(eB / mB); ++used;
   }
   if (used < 5)
      throw new Error("[SSSC] Stage 1 needs >=5 valid stars; only " + used + " usable.");
   var gR = optSSSCRobustRatio(rR), gB = optSSSCRobustRatio(rB);
   // Clamp to a sane white-balance range: a value outside [0.25, 4] signals a bad fit
   // (too few stars / poor photometry / wrong linearity) and must never be allowed to
   // crush or saturate a channel.
   var gRc = Math.max(0.25, Math.min(4, gR)), gBc = Math.max(0.25, Math.min(4, gB));
   if (gRc !== gR || gBc !== gB)
      console.warningln("=> SSSC: gains clamped to safe range (raw R=" + gR.toFixed(3) + " B=" + gB.toFixed(3) + "); check star count / photometry / linearity.");
   gR = gRc; gB = gBc;
   console.noteln("=> SSSC Stage 1: gains R=" + gR.toFixed(4) + " G=1.0000 B=" + gB.toFixed(4) + " from " + used + " stars.");
   return { gR: gR, gG: 1.0, gB: gB, n: used, stage: 1 };
}

// Applies per-channel gains in place to a linear RGB view (no PixelMath; keeps data
// linear). Gains are renormalised so the largest is 1 (only attenuate) to avoid
// amplifying highlights/noise; the relative R:G:B balance is what calibration fixes.
function optSSSCApplyGains(view, gains) {
   if (!optSafeView(view) || view.image.numberOfChannels < 3)
      throw new Error("[SSSC] Gain application requires an RGB image.");
   var gMax = Math.max(gains.gR, gains.gG, gains.gB);
   if (gMax <= 0) gMax = 1;
   var kR = gains.gR / gMax, kG = gains.gG / gMax, kB = gains.gB / gMax;
   var img = view.image, w = img.width, h = img.height, rect = new Rect(0, 0, w, h), count = w * h;
   var R = new Float32Array(count), G = new Float32Array(count), B = new Float32Array(count);
   img.getSamples(R, rect, 0); img.getSamples(G, rect, 1); img.getSamples(B, rect, 2);
   for (var i = 0; i < count; ++i) { R[i] *= kR; G[i] *= kG; B[i] *= kB; }
   view.beginProcess(UndoFlag_NoSwapFile);
   img.setSamples(R, rect, 0); img.setSamples(G, rect, 1); img.setSamples(B, rect, 2);
   view.endProcess();
   console.noteln("=> SSSC: applied normalised gains R=" + kR.toFixed(4) + " G=" + kG.toFixed(4) + " B=" + kB.toFixed(4) + ".");
   return view;
}

// End-to-end Stage 1 on a window: Gaia spectra -> photometry -> fit gains -> apply.
// opts.measureOnly returns the gains without modifying the image.
function optRunSSSCStage1(window, dlg, opts) {
   opts = opts || {};
   var view = window.mainView;
   optRequireLinearImage(view, "SSSC");
   var stars = optSSSCQueryGaiaSpectra(window, opts);
   optSSSCStarPhotometry(view, stars, opts);
   var gains = optSSSCFitStage1Gains(stars, stars.grid);
   if (opts.measureOnly) return gains;
   optSSSCApplyGains(view, gains);
   return gains;
}

// ---- F2: Stage 2 colour-dependent band response -----------------------------
function optSSSCLog2(a, b) { return Math.log((a > 1e-12 ? a : 1e-12) / (b > 1e-12 ? b : 1e-12)) / Math.LN2; }
function optSSSCRms(arr) { var s = 0; for (var i = 0; i < arr.length; ++i) s += arr[i] * arr[i]; return arr.length ? Math.sqrt(s / arr.length) : 0; }

// Robust linear fit y ~ a + b*x: OLS, one MAD clip of residuals, refit.
function optSSSCRobustLinFit(xs, ys) {
   function ols(idx) {
      var n = idx.length, sx = 0, sy = 0, i;
      for (i = 0; i < n; ++i) { sx += xs[idx[i]]; sy += ys[idx[i]]; }
      var mx = sx / n, my = sy / n, num = 0, den = 0;
      for (i = 0; i < n; ++i) { var dx = xs[idx[i]] - mx; num += dx * (ys[idx[i]] - my); den += dx * dx; }
      var b = den > 1e-12 ? num / den : 0;
      return { a: my - b * mx, b: b };
   }
   var all = []; for (var i = 0; i < xs.length; ++i) all.push(i);
   var f = ols(all), res = [];
   for (var k = 0; k < xs.length; ++k) res.push(Math.abs(ys[k] - (f.a + f.b * xs[k])));
   var mad = optSSSCMedian(res) * 1.4826;
   if (mad > 1e-9) {
      var keep = [];
      for (var m = 0; m < xs.length; ++m) if (Math.abs(ys[m] - (f.a + f.b * xs[m])) <= 2.5 * mad) keep.push(m);
      if (keep.length >= 5) f = ols(keep);
   }
   return f;
}

// Fits Stage 2: a colour-dependent residual on top of Stage 1 scalar gains. For each
// star, x = Stage-1-balanced red/blue colour index, y_C = remaining log2 error of
// channel C; robust lines y_C ~ a_C + b_C*x capture how the effective response varies
// with star colour (what a single scalar gain cannot fix). Needs opts.minStars (50).
function optSSSCFitStage2Response(stars, grid, gains, opts) {
   opts = opts || {};
   var minStars = opts.minStars || 50;
   var xs = [], yR = [], yB = [], used = 0;
   for (var i = 0; i < stars.length; ++i) {
      var st = stars[i]; if (!st.ok || !st.flux || st.Gm <= 0) continue;
      var e = optSSSCIntegrateSpectrum(st.flux, grid);
      if (e[0] <= 0 || e[1] <= 0 || e[2] <= 0) continue;
      var Rg = gains.gR * (st.Rm / st.Gm), Bg = gains.gB * (st.Bm / st.Gm);   // Stage-1-balanced
      if (Rg <= 0 || Bg <= 0) continue;
      xs.push(optSSSCLog2(Rg, Bg));
      yR.push(optSSSCLog2(e[0] / e[1], Rg));    // residual log2 error still in R
      yB.push(optSSSCLog2(e[2] / e[1], Bg));    // ...and in B
      ++used;
   }
   if (used < minStars)
      throw new Error("[SSSC] Stage 2 needs >=" + minStars + " stars; only " + used + ".");
   var fR = optSSSCRobustLinFit(xs, yR), fB = optSSSCRobustLinFit(xs, yB);
   var r1 = [], r2 = [];
   for (var k = 0; k < xs.length; ++k) {
      r1.push(yR[k]); r1.push(yB[k]);
      r2.push(yR[k] - (fR.a + fR.b * xs[k])); r2.push(yB[k] - (fB.a + fB.b * xs[k]));
   }
   var sx = xs.slice(0).sort(function(a, b) { return a - b; });
   var model = { gR: gains.gR, gG: gains.gG, gB: gains.gB,
                 aR: fR.a, bR: fR.b, aB: fB.a, bB: fB.b,
                 xMin: sx[Math.floor(0.05 * (sx.length - 1))],
                 xMax: sx[Math.floor(0.95 * (sx.length - 1))],
                 n: used, stage: 2,
                 stage1Rms: optSSSCRms(r1), stage2Rms: optSSSCRms(r2) };
   console.noteln("=> SSSC Stage 2: slopes bR=" + fR.b.toFixed(4) + " bB=" + fB.b.toFixed(4) +
                  " | residual RMS " + model.stage1Rms.toFixed(4) + " -> " + model.stage2Rms.toFixed(4) +
                  " from " + used + " stars.");
   return model;
}

// Applies a Stage 2 model: per-pixel colour-dependent channel correction (bounded to a
// [0.5,2] factor; colour index clamped to the fitted star range to avoid extrapolation).
function optSSSCApplyColorResponse(view, model) {
   if (!optSafeView(view) || view.image.numberOfChannels < 3)
      throw new Error("[SSSC] Colour-response application requires an RGB image.");
   var gMax = Math.max(model.gR, model.gG, model.gB); if (gMax <= 0) gMax = 1;
   var kR = model.gR / gMax, kG = model.gG / gMax, kB = model.gB / gMax;
   var img = view.image, w = img.width, h = img.height, rect = new Rect(0, 0, w, h), count = w * h;
   var R = new Float32Array(count), G = new Float32Array(count), Bb = new Float32Array(count);
   img.getSamples(R, rect, 0); img.getSamples(G, rect, 1); img.getSamples(Bb, rect, 2);
   var inv = 1 / Math.LN2;
   for (var i = 0; i < count; ++i) {
      var r = R[i] * kR, g = G[i] * kG, b = Bb[i] * kB;
      if (r > 1e-9 && b > 1e-9) {
         var x = Math.log(r / b) * inv;
         if (x < model.xMin) x = model.xMin; else if (x > model.xMax) x = model.xMax;
         var eR = model.aR + model.bR * x, eB = model.aB + model.bB * x;
         if (eR > 1) eR = 1; else if (eR < -1) eR = -1;
         if (eB > 1) eB = 1; else if (eB < -1) eB = -1;
         r *= Math.pow(2, eR); b *= Math.pow(2, eB);
      }
      R[i] = r; G[i] = g; Bb[i] = b;
   }
   view.beginProcess(UndoFlag_NoSwapFile);
   img.setSamples(R, rect, 0); img.setSamples(G, rect, 1); img.setSamples(Bb, rect, 2);
   view.endProcess();
   console.noteln("=> SSSC: applied Stage 2 colour-dependent response.");
   return view;
}

// End-to-end Stage 2 on a window.
function optRunSSSCStage2(window, dlg, opts) {
   opts = opts || {};
   var view = window.mainView;
   optRequireLinearImage(view, "SSSC");
   var stars = optSSSCQueryGaiaSpectra(window, opts);
   optSSSCStarPhotometry(view, stars, opts);
   var gains = optSSSCFitStage1Gains(stars, stars.grid);
   var model = optSSSCFitStage2Response(stars, stars.grid, gains, opts);
   if (opts.measureOnly) return model;
   optSSSCApplyColorResponse(view, model);
   return model;
}

// ---- F3: Stage 3 full 3x3 colour-correction matrix (CCM) --------------------
// The most general LINEAR calibration applicable to an RGB image: a 3x3 matrix mapping
// camera RGB -> reference (seed-band) colour. Generalises Stage 1 (diagonal) and Stage 2
// (diagonal + colour term); captures cross-channel leakage they cannot. Per-star
// brightness is removed by green-normalisation; the fit is IRLS (soft outlier rejection).

// Solves the 3x3 linear system Ax=b (Gaussian elimination, partial pivot). Returns null
// if singular. `a` is row-major 3x3, `b` length 3.
function optSSSCSolve3(a, b) {
   var m = [[a[0][0], a[0][1], a[0][2], b[0]],
            [a[1][0], a[1][1], a[1][2], b[1]],
            [a[2][0], a[2][1], a[2][2], b[2]]];
   for (var c = 0; c < 3; ++c) {
      var piv = c;
      for (var r = c + 1; r < 3; ++r) if (Math.abs(m[r][c]) > Math.abs(m[piv][c])) piv = r;
      var t = m[c]; m[c] = m[piv]; m[piv] = t;
      if (Math.abs(m[c][c]) < 1e-12) return null;
      for (var r2 = 0; r2 < 3; ++r2) if (r2 !== c) {
         var f = m[r2][c] / m[c][c];
         for (var k = c; k < 4; ++k) m[r2][k] -= f * m[c][k];
      }
   }
   return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
}

// Weighted ridge least-squares for one CCM row: design rows X (3-vec/star), target y,
// weights w. `prior` + `ridgeFrac` shrink the solution toward `prior` (a row of the
// identity), preventing the ill-conditioned blow-up that a narrow stellar colour locus
// otherwise produces (e.g. a huge off-diagonal coefficient).
function optSSSCWLSRow(X, y, w, prior, ridgeFrac) {
   var ata = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], atb = [0, 0, 0];
   for (var i = 0; i < X.length; ++i) {
      var wi = w[i], xi = X[i];
      for (var r = 0; r < 3; ++r) { atb[r] += wi * xi[r] * y[i]; for (var c = 0; c < 3; ++c) ata[r][c] += wi * xi[r] * xi[c]; }
   }
   if (ridgeFrac && prior) {
      var lam = ridgeFrac * (ata[0][0] + ata[1][1] + ata[2][2]) / 3;
      for (var d = 0; d < 3; ++d) { ata[d][d] += lam; atb[d] += lam * prior[d]; }
   }
   return optSSSCSolve3(ata, atb) || (prior ? prior.slice(0) : [0, 0, 0]);
}

// Fits the 3x3 CCM from photometered stars with Gaia spectra (green-normalised both
// sides). Returns { ccm:[[..],[..],[..]], n, stage, rms }.
function optSSSCFitStage3CCM(stars, grid, opts) {
   opts = opts || {};
   var minStars = opts.minStars || 30;
   var X = [], tR = [], tG = [], tB = [], used = 0;
   for (var i = 0; i < stars.length; ++i) {
      var st = stars[i]; if (!st.ok || !st.flux || st.Gm <= 0) continue;
      var e = optSSSCIntegrateSpectrum(st.flux, grid);
      if (e[1] <= 0) continue;
      X.push([st.Rm / st.Gm, 1.0, st.Bm / st.Gm]);             // green-normalised measured
      tR.push(e[0] / e[1]); tG.push(1.0); tB.push(e[2] / e[1]); // green-normalised target
      ++used;
   }
   if (used < minStars)
      throw new Error("[SSSC] Stage 3 (CCM) needs >=" + minStars + " stars; only " + used + ".");
   var ridge = (opts.ridge != null) ? opts.ridge : 0.01;   // mild shrink toward identity (anti ill-conditioning)
   var w = []; for (var q = 0; q < used; ++q) w.push(1);
   var rowR = [1, 0, 0], rowG = [0, 1, 0], rowB = [0, 0, 1];
   for (var pass = 0; pass < 3; ++pass) {
      rowR = optSSSCWLSRow(X, tR, w, [1, 0, 0], ridge);
      rowG = optSSSCWLSRow(X, tG, w, [0, 1, 0], ridge);
      rowB = optSSSCWLSRow(X, tB, w, [0, 0, 1], ridge);
      var res = [];
      for (var j = 0; j < used; ++j) {
         var pr = rowR[0] * X[j][0] + rowR[1] * X[j][1] + rowR[2] * X[j][2];
         var pb = rowB[0] * X[j][0] + rowB[1] * X[j][1] + rowB[2] * X[j][2];
         res.push(Math.abs(pr - tR[j]) + Math.abs(pb - tB[j]));
      }
      var med = optSSSCMedian(res), dev = []; for (var d = 0; d < used; ++d) dev.push(Math.abs(res[d] - med));
      var mad = optSSSCMedian(dev) * 1.4826 + 1e-9;
      for (var jj = 0; jj < used; ++jj) { var z = (res[jj] - med) / mad; w[jj] = z > 2.5 ? (2.5 / z) : 1; }
   }
   var rr = [];
   for (var k = 0; k < used; ++k) {
      var pr2 = rowR[0] * X[k][0] + rowR[1] * X[k][1] + rowR[2] * X[k][2];
      var pg2 = rowG[0] * X[k][0] + rowG[1] * X[k][1] + rowG[2] * X[k][2];
      var pb2 = rowB[0] * X[k][0] + rowB[1] * X[k][1] + rowB[2] * X[k][2];
      if (pr2 > 0 && pg2 > 0 && pb2 > 0) {
         rr.push(optSSSCLog2(pr2, pg2) - optSSSCLog2(tR[k], tG[k]));
         rr.push(optSSSCLog2(pb2, pg2) - optSSSCLog2(tB[k], tG[k]));
      }
   }
   console.noteln("=> SSSC Stage 3 CCM (" + used + " stars):");
   console.noteln("   R' = [" + rowR.map(function(v) { return v.toFixed(4); }).join(", ") + "]");
   console.noteln("   G' = [" + rowG.map(function(v) { return v.toFixed(4); }).join(", ") + "]");
   console.noteln("   B' = [" + rowB.map(function(v) { return v.toFixed(4); }).join(", ") + "]");
   return { ccm: [rowR, rowG, rowB], n: used, stage: 3, rms: optSSSCRms(rr) };
}

// Applies a 3x3 CCM in place to a linear RGB view, then rescales all channels by a
// single factor so the green mean level is preserved (cosmetic; keeps colour transform
// intact). Negative results are clamped to 0.
function optSSSCApplyCCM(view, model) {
   if (!optSafeView(view) || view.image.numberOfChannels < 3)
      throw new Error("[SSSC] CCM application requires an RGB image.");
   var A = model.ccm, img = view.image, w = img.width, h = img.height, rect = new Rect(0, 0, w, h), count = w * h;
   var R = new Float32Array(count), G = new Float32Array(count), Bb = new Float32Array(count);
   img.getSamples(R, rect, 0); img.getSamples(G, rect, 1); img.getSamples(Bb, rect, 2);
   var preG = 0; for (var s = 0; s < count; ++s) preG += G[s];
   for (var i = 0; i < count; ++i) {
      var rr = R[i], gg = G[i], bb = Bb[i];
      var nr = A[0][0] * rr + A[0][1] * gg + A[0][2] * bb;
      var ng = A[1][0] * rr + A[1][1] * gg + A[1][2] * bb;
      var nb = A[2][0] * rr + A[2][1] * gg + A[2][2] * bb;
      R[i] = nr < 0 ? 0 : nr; G[i] = ng < 0 ? 0 : ng; Bb[i] = nb < 0 ? 0 : nb;
   }
   var postG = 0; for (var s2 = 0; s2 < count; ++s2) postG += G[s2];
   var k = (postG > 1e-9) ? (preG / postG) : 1;
   if (Math.abs(k - 1) > 1e-4)
      for (var p = 0; p < count; ++p) { R[p] *= k; G[p] *= k; Bb[p] *= k; }
   view.beginProcess(UndoFlag_NoSwapFile);
   img.setSamples(R, rect, 0); img.setSamples(G, rect, 1); img.setSamples(Bb, rect, 2);
   view.endProcess();
   console.noteln("=> SSSC: applied 3x3 CCM (green level preserved, factor " + k.toFixed(4) + ").");
   return view;
}

function optRunSSSCStage3(window, dlg, opts) {
   opts = opts || {};
   var view = window.mainView;
   optRequireLinearImage(view, "SSSC");
   var stars = optSSSCQueryGaiaSpectra(window, opts);
   optSSSCStarPhotometry(view, stars, opts);
   var model = optSSSCFitStage3CCM(stars, stars.grid, opts);
   if (opts.measureOnly) return model;
   optSSSCApplyCCM(view, model);
   return model;
}

// Trimmed RMS (drops the worst 10% |residuals|) — robust metric for model selection.
function optSSSCTrimmedRms(arr) {
   if (!arr.length) return 0;
   var a = []; for (var i = 0; i < arr.length; ++i) a.push(Math.abs(arr[i]));
   a.sort(function(x, y) { return x - y; });
   var n = Math.max(1, Math.floor(a.length * 0.9)), s = 0;
   for (var k = 0; k < n; ++k) s += a[k] * a[k];
   return Math.sqrt(s / n);
}

// Colour residual (trimmed RMS, log2 ratio space) of a fitted model evaluated on the
// star cloud — how well the model maps measured star colours to spectrum-predicted ones.
function optSSSCModelResidual(stars, grid, model) {
   var rr = [];
   for (var i = 0; i < stars.length; ++i) {
      var st = stars[i]; if (!st.ok || !st.flux || st.Gm <= 0) continue;
      var e = optSSSCIntegrateSpectrum(st.flux, grid); if (e[1] <= 0) continue;
      var eR = e[0] / e[1], eB = e[2] / e[1], mR = st.Rm / st.Gm, mB = st.Bm / st.Gm, cR, cG = 1, cB;
      if (model.stage === 1) { cR = model.gR * mR; cB = model.gB * mB; }
      else if (model.stage === 2) {
         var x = optSSSCLog2(model.gR * mR, model.gB * mB);
         if (x < model.xMin) x = model.xMin; else if (x > model.xMax) x = model.xMax;
         cR = model.gR * mR * Math.pow(2, model.aR + model.bR * x);
         cB = model.gB * mB * Math.pow(2, model.aB + model.bB * x);
      } else { var A = model.ccm; cR = A[0][0] * mR + A[0][1] + A[0][2] * mB; cG = A[1][0] * mR + A[1][1] + A[1][2] * mB; cB = A[2][0] * mR + A[2][1] + A[2][2] * mB; }
      if (cR > 0 && cG > 0 && cB > 0) { rr.push(optSSSCLog2(cR, cG) - optSSSCLog2(eR, 1)); rr.push(optSSSCLog2(cB, cG) - optSSSCLog2(eB, 1)); }
   }
   return optSSSCTrimmedRms(rr);
}

// Spectral colour span (log2 R/B) of the usable stars — conditioning indicator for the CCM.
function optSSSCColorSpan(stars, grid) {
   var xs = [];
   for (var i = 0; i < stars.length; ++i) {
      var st = stars[i]; if (!st.ok || !st.flux) continue;
      var e = optSSSCIntegrateSpectrum(st.flux, grid); if (e[2] > 0) xs.push(optSSSCLog2(e[0], e[2]));
   }
   if (xs.length < 2) return 0;
   xs.sort(function(a, b) { return a - b; });
   return xs[Math.floor(0.95 * (xs.length - 1))] - xs[Math.floor(0.05 * (xs.length - 1))];
}

// Auto SSSC: fits the applicable stages and selects the one with the LOWEST colour
// residual (a more complex stage is used only if it actually improves the fit, and the
// CCM only when the colour locus is wide enough to condition it). One Gaia query +
// photometry shared across the cascade. REAL-DATA FIX (2026-06-23): selection is by
// measured quality, not star count — narrow stellar loci made the CCM overfit otherwise.
function optRunSSSC(window, dlg, opts) {
   opts = opts || {};
   var view = window.mainView;
   optRequireLinearImage(view, "SSSC");
   var stars = optSSSCQueryGaiaSpectra(window, opts);
   optSSSCStarPhotometry(view, stars, opts);
   var grid = stars.grid;
   var nOk = 0; for (var i = 0; i < stars.length; ++i) if (stars[i].ok) ++nOk;
   var span = optSSSCColorSpan(stars, grid);
   var s2min = opts.stage2MinStars || 50, s3min = opts.stage3MinStars || 120, s3span = (opts.stage3MinSpan != null) ? opts.stage3MinSpan : 0.9;

   var best = optSSSCFitStage1Gains(stars, grid);
   var bestRms = optSSSCModelResidual(stars, grid, best);
   if (nOk >= s2min) {
      try {
         var m2 = optSSSCFitStage2Response(stars, grid, best.stage === 1 ? best : optSSSCFitStage1Gains(stars, grid), { minStars: s2min });
         var r2 = optSSSCModelResidual(stars, grid, m2);
         if (r2 < bestRms * 0.97) { best = m2; bestRms = r2; }   // require a real (>3%) improvement
      } catch (e2) { console.warningln("SSSC: Stage 2 skipped (" + e2.message + ")."); }
   }
   // Stage 3 (full 3x3 CCM) is OPT-IN only (opts.enableStage3). A CCM is a global linear
   // transform fit on STARS but applied to EVERY pixel; on emission nebulae (colours far
   // outside the stellar locus) an ill-conditioned matrix extrapolates and drives G/B
   // negative -> clamped to 0 -> a catastrophic all-red image. Empirically it also rarely
   // beats Stage 2 on real fields, so the safe default tops out at Stage 2.
   if (opts.enableStage3 === true && nOk >= s3min && span >= s3span) {
      try {
         var m3 = optSSSCFitStage3CCM(stars, grid, { minStars: 30, ridge: opts.ridge });
         // Reject ill-conditioned matrices: each row must map a neutral input to a sane,
         // positive output (row sum in [0.2, 5]); otherwise non-stellar colours blow up.
         var A = m3.ccm, safe = true;
         for (var rs = 0; rs < 3; ++rs) { var sum = A[rs][0] + A[rs][1] + A[rs][2]; if (!(sum > 0.2 && sum < 5)) safe = false; }
         var r3 = optSSSCModelResidual(stars, grid, m3);
         if (safe && r3 < bestRms * 0.95) { best = m3; bestRms = r3; }
         else if (!safe) console.warningln("=> SSSC: Stage 3 CCM rejected (ill-conditioned; would distort non-stellar colours).");
      } catch (e3) { console.warningln("SSSC: Stage 3 skipped (" + e3.message + ")."); }
   }
   console.noteln("=> SSSC: selected Stage " + best.stage + " (" + nOk + " stars, colour span " +
                  span.toFixed(2) + ", residual " + bestRms.toFixed(4) + ").");
   if (opts.measureOnly) return best;
   if (best.stage === 3) optSSSCApplyCCM(view, best);
   else if (best.stage === 2) optSSSCApplyColorResponse(view, best);
   else optSSSCApplyGains(view, best);
   // Background neutralization (as SPCC does): the star-based gains correct STAR colours,
   // but the sky background has a different spectrum (light pollution, airglow) and stays
   // tinted — a strong linked stretch then shows it as a green/yellow cast. Neutralising
   // the background here makes SSSC's output comparable to SPCC (neutral sky).
   if (opts.backgroundNeutralize !== false) {
      try { optRunBackgroundNeutralization(view); console.noteln("=> SSSC: background neutralized."); }
      catch (eBN) { console.warningln("=> SSSC: background neutralization skipped (" + eBN.message + ")."); }
   }
   return best;
}
// ===== SSSC-ENGINE-END =====
