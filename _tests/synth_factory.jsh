// =============================================================================
// synth_factory.jsh — Fábrica de imágenes sintéticas DETERMINISTAS con ground
// truth para la batería de tests de PI Workflow (nivel 1 y 2).
// Patrón: regression_suite.js (synthArray/synthRGB/starImg generalizados).
// REGLA: nada de Math.random() en los PÍXELES (PRNG mulberry32 con seed fija);
// Math.random() SOLO para sufijos de nombre de ventana (como el patrón).
// Todas las funciones sf*() devuelven ImageWindow (el llamante hace forceClose)
// o valores puros. Ver PLAN_BATERIA_TESTS.md §Matriz sintética.
// =============================================================================

// ---- PRNG determinista (mulberry32) ----------------------------------------
function sfMulberry32(seed) {
   var a = seed >>> 0;
   return function() {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
   };
}

// Ruido ~gaussiano determinista: suma de 4 uniformes (var = 4/12) reescalada.
function sfGaussNoise(rng) {
   return ((rng() + rng() + rng() + rng()) - 2.0) * Math.sqrt(3.0); // media 0, sigma 1
}

function sfClamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

// ---- helpers de ventana -----------------------------------------------------
function sfNewWindow(W, H, channels, idBase) {
   // Math.random SOLO en el nombre (unicidad de id de ventana, como el patrón).
   return new ImageWindow(W, H, channels, 32, true, channels >= 3,
      idBase + "_" + Math.floor(Math.random() * 1e6));
}

function sfSetSamples(win, arrays) {
   var rect = new Rect(0, 0, win.mainView.image.width, win.mainView.image.height);
   win.mainView.beginProcess(UndoFlag_NoSwapFile);
   for (var c = 0; c < arrays.length; ++c)
      win.mainView.image.setSamples(arrays[c], rect, c);
   win.mainView.endProcess();
   return win;
}

// ---- 1) RGB lineal suave + estrellas dispersas (base del regression) --------
function sfRgbLinear(W, H) {
   var N = W * H, R = new Float32Array(N), G = new Float32Array(N), Bb = new Float32Array(N);
   for (var y = 0; y < H; ++y) for (var x = 0; x < W; ++x) {
      var i = y * W + x;
      R[i] = 0.18 + 0.10 * Math.sin(x * 0.2) + 0.04 * Math.cos(y * 0.13);
      G[i] = 0.16 + 0.09 * Math.sin(x * 0.2 + 0.5) + 0.03 * Math.cos(y * 0.11);
      Bb[i] = 0.20 + 0.11 * Math.sin(x * 0.2 + 1.0) + 0.05 * Math.cos(y * 0.09);
      if (((x * 3 + y * 5) % 89) === 0) { R[i] += 0.6; G[i] += 0.55; Bb[i] += 0.5; }
      R[i] = sfClamp01(R[i]); G[i] = sfClamp01(G[i]); Bb[i] = sfClamp01(Bb[i]);
   }
   return sfSetSamples(sfNewWindow(W, H, 3, "BAT_RGB"), [R, G, Bb]);
}

// ---- 2) mono por canal (seed distinta = canal distinto: R/G/B, Ha/OIII/SII) -
function sfMonoChannel(W, H, seed) {
   var N = W * H, a = new Float32Array(N);
   var p1 = 0.13 + 0.05 * (seed % 7), p2 = 0.09 + 0.03 * (seed % 5);
   for (var y = 0; y < H; ++y) for (var x = 0; x < W; ++x) {
      var i = y * W + x;
      var v = 0.10 + 0.02 * (seed % 3)
            + 0.08 * Math.sin(x * p1 + seed) * Math.cos(y * p2 + seed * 0.7)
            + 0.05 * ((x * 7 + y * 13 + seed * 17) % 11) / 11;
      if (((x * 3 + y * 5 + seed) % 97) === 0) v += 0.5; // estrellas dispersas
      a[i] = sfClamp01(v);
   }
   return sfSetSamples(sfNewWindow(W, H, 1, "BAT_MONO" + seed), [a]);
}

// ---- 3) par línea+continuo con k CONOCIDO (patrón cs_k_highpass) ------------
// continuo = gradiente + estrellas nítidas; nb = gradiente + k·estrellas + blob
// de emisión ancho (solo NB). El estimador debe recuperar k≈kTrue.
function sfLineContinuumPair(W, H, kTrue) {
   var N = W * H, ct = new Float32Array(N), nb = new Float32Array(N);
   var stars = [[Math.round(W*0.25), Math.round(H*0.28), 0.5], [Math.round(W*0.67), Math.round(H*0.44), 0.4],
                [Math.round(W*0.46), Math.round(H*0.78), 0.45], [Math.round(W*0.83), Math.round(H*0.22), 0.35],
                [Math.round(W*0.17), Math.round(H*0.67), 0.4],  [Math.round(W*0.58), Math.round(H*0.17), 0.3]];
   var cx = W * 0.5, cy = H * 0.5, sig = Math.min(W, H) * 0.28;
   for (var y = 0; y < H; ++y) for (var x = 0; x < W; ++x) {
      var i = y * W + x;
      var bgC = 0.10 + 0.00005 * x, bgN = 0.12 + 0.00004 * y;
      var em = 0.30 * Math.exp(-(((x - cx) * (x - cx) + (y - cy) * (y - cy)) / (2 * sig * sig)));
      var sc = 0;
      for (var s = 0; s < stars.length; ++s) {
         var dx = x - stars[s][0], dy = y - stars[s][1];
         sc += stars[s][2] * Math.exp(-((dx * dx + dy * dy) / (2 * 1.2 * 1.2)));
      }
      ct[i] = sfClamp01(bgC + sc);
      nb[i] = sfClamp01(bgN + kTrue * sc + em);
   }
   return {
      nbWin: sfSetSamples(sfNewWindow(W, H, 1, "BAT_NB"), [nb]),
      ctWin: sfSetSamples(sfNewWindow(W, H, 1, "BAT_CT"), [ct]),
      kTrue: kTrue
   };
}

// ---- 4) campo de estrellas RGB con PSF gaussiana conocida -------------------
// specs = [[x, y, ampR, ampG, ampB], ...]; sigmaPx = sigma de la PSF.
function sfStarField(W, H, sigmaPx, specs) {
   var N = W * H, R = new Float32Array(N), G = new Float32Array(N), Bb = new Float32Array(N);
   for (var i = 0; i < N; ++i) { R[i] = 0.03; G[i] = 0.03; Bb[i] = 0.03; }
   var s2 = 2 * sigmaPx * sigmaPx, ext = Math.ceil(4 * sigmaPx);
   for (var k = 0; k < specs.length; ++k) {
      var sp = specs[k];
      for (var dy = -ext; dy <= ext; ++dy) for (var dx = -ext; dx <= ext; ++dx) {
         var x = sp[0] + dx, y = sp[1] + dy;
         if (x < 0 || y < 0 || x >= W || y >= H) continue;
         var g = Math.exp(-(dx * dx + dy * dy) / s2), id = y * W + x;
         R[id] = sfClamp01(R[id] + sp[2] * g);
         G[id] = sfClamp01(G[id] + sp[3] * g);
         Bb[id] = sfClamp01(Bb[id] + sp[4] * g);
      }
   }
   return sfSetSamples(sfNewWindow(W, H, 3, "BAT_STARS"), [R, G, Bb]);
}

// ---- 5) gradiente lineal conocido (RGB) — corrección debe reducirlo ≥50% ----
// Plano bg + slope·(x/W) en los 3 canales + textura tenue + estrellas dispersas.
function sfGradientImg(W, H, slope) {
   var N = W * H, R = new Float32Array(N), G = new Float32Array(N), Bb = new Float32Array(N);
   for (var y = 0; y < H; ++y) for (var x = 0; x < W; ++x) {
      var i = y * W + x;
      var plane = 0.10 + slope * (x / W);
      var tex = 0.01 * Math.sin(x * 0.31) * Math.cos(y * 0.27);
      var star = (((x * 3 + y * 5) % 113) === 0) ? 0.4 : 0;
      R[i] = sfClamp01(plane + tex + star);
      G[i] = sfClamp01(plane * 0.95 + tex + star * 0.9);
      Bb[i] = sfClamp01(plane * 1.05 + tex + star * 0.8);
   }
   return sfSetSamples(sfNewWindow(W, H, 3, "BAT_GRAD"), [R, G, Bb]);
}

// Amplitud del plano de gradiente: |media(banda derecha) − media(banda izquierda)|
// sobre la luminancia media de los canales. Ground truth para P7.
function sfPlaneAmplitude(view) {
   var img = view.image, W = img.width, H = img.height, nc = img.numberOfChannels;
   var wBand = Math.max(2, Math.floor(W * 0.10));
   function bandMean(x0, x1) {
      var sum = 0, n = 0, row = new Float32Array(x1 - x0);
      for (var c = 0; c < nc; ++c)
         for (var y = 0; y < H; ++y) {
            img.getSamples(row, new Rect(x0, y, x1, y + 1), c);
            for (var k = 0; k < row.length; ++k) { sum += row[k]; ++n; }
         }
      return n ? sum / n : 0;
   }
   return Math.abs(bandMean(W - wBand, W) - bandMean(0, wBand));
}

// ---- 6) imagen ruidosa determinista (mono) — denoise debe bajar sigma -------
function sfNoisyImg(W, H, sigma, seed) {
   var N = W * H, a = new Float32Array(N), rng = sfMulberry32(seed >>> 0);
   for (var i = 0; i < N; ++i)
      a[i] = sfClamp01(0.20 + sigma * sfGaussNoise(rng));
   return sfSetSamples(sfNewWindow(W, H, 1, "BAT_NOISY"), [a]);
}

// ---- 7) casos límite ---------------------------------------------------------
function sfSaturatedImg(W, H) {  // ~99% de píxeles a 1.0
   var N = W * H, R = new Float32Array(N), G = new Float32Array(N), Bb = new Float32Array(N);
   for (var i = 0; i < N; ++i) {
      var v = ((i % 100) === 0) ? 0.95 : 1.0;
      R[i] = v; G[i] = v; Bb[i] = v;
   }
   return sfSetSamples(sfNewWindow(W, H, 3, "BAT_SAT"), [R, G, Bb]);
}

function sfNearBlackImg(W, H) {  // mediana < 0.001, con estructura tenue real
   var N = W * H, R = new Float32Array(N), G = new Float32Array(N), Bb = new Float32Array(N);
   for (var y = 0; y < H; ++y) for (var x = 0; x < W; ++x) {
      var i = y * W + x;
      var v = 0.0004 + 0.0003 * Math.sin(x * 0.17) * Math.cos(y * 0.19);
      if (((x * 3 + y * 7) % 101) === 0) v += 0.02;  // alguna estrella débil
      R[i] = sfClamp01(v); G[i] = sfClamp01(v * 0.9); Bb[i] = sfClamp01(v * 1.1);
   }
   return sfSetSamples(sfNewWindow(W, H, 3, "BAT_DARK"), [R, G, Bb]);
}

function sfTinyImg() {  // 16×16 RGB mínima
   var W = 16, H = 16, N = W * H, R = new Float32Array(N), G = new Float32Array(N), Bb = new Float32Array(N);
   for (var i = 0; i < N; ++i) { R[i] = 0.1 + 0.05 * (i % 7) / 7; G[i] = R[i] * 0.9; Bb[i] = R[i] * 1.1; }
   return sfSetSamples(sfNewWindow(W, H, 3, "BAT_TINY"), [R, G, Bb]);
}

// ---- 8) franjas de tono (para máscaras por banda del Color Mixer) -----------
// Franjas verticales, cada una un tono HSV puro (sat 0.6, val 0.5) centrado en
// los `centers` (grados). Garantiza píxeles en TODAS las bandas del mixer.
function sfHueStrips(W, H, centers) {
   var N = W * H, R = new Float32Array(N), G = new Float32Array(N), Bb = new Float32Array(N);
   function hsv(h, s, v) {   // h en grados
      var c = v * s, hp = (((h % 360) + 360) % 360) / 60, x = c * (1 - Math.abs(hp % 2 - 1)), m = v - c;
      var r = 0, g = 0, b = 0;
      if (hp < 1) { r = c; g = x; } else if (hp < 2) { r = x; g = c; }
      else if (hp < 3) { g = c; b = x; } else if (hp < 4) { g = x; b = c; }
      else if (hp < 5) { r = x; b = c; } else { r = c; b = x; }
      return [r + m, g + m, b + m];
   }
   var nS = centers.length, wS = W / nS;
   for (var y = 0; y < H; ++y) for (var x = 0; x < W; ++x) {
      var i = y * W + x, k = Math.min(nS - 1, Math.floor(x / wS));
      var rgb = hsv(centers[k], 0.6, 0.5);
      R[i] = rgb[0]; G[i] = rgb[1]; Bb[i] = rgb[2];
   }
   return sfSetSamples(sfNewWindow(W, H, 3, "BAT_HUES"), [R, G, Bb]);
}

// ---- métricas / asserts compartidos -----------------------------------------
// Nº de muestras no finitas (NaN/Inf) escaneando todos los canales.
function sfCountNonFinite(view) {
   var img = view.image, W = img.width, H = img.height, nc = img.numberOfChannels;
   var bad = 0, row = new Float32Array(W);
   for (var c = 0; c < nc; ++c)
      for (var y = 0; y < H; ++y) {
         img.getSamples(row, new Rect(0, y, W, y + 1), c);
         for (var x = 0; x < W; ++x) if (!isFinite(row[x])) ++bad;
      }
   return bad;
}

function sfChannelMedian(view, c) {
   var img = view.image;
   img.firstSelectedChannel = c; img.lastSelectedChannel = c;
   var m = img.median();
   img.resetSelections();
   return m;
}

function sfViewMedian(view) { return view.image.median(); }

function sfViewMAD(view) { return view.image.MAD(); }

// Fingerprint compacto (suma + 4 muestras) para checks de determinismo.
function sfViewFingerprint(view) {
   var img = view.image, W = img.width, H = img.height, nc = img.numberOfChannels;
   var o = [];
   for (var c = 0; c < nc; ++c) {
      img.firstSelectedChannel = c; img.lastSelectedChannel = c;
      o.push(img.median());
   }
   img.resetSelections();
   o.push(img.sample((W / 3) | 0, (H / 3) | 0, 0));
   o.push(img.sample((2 * W / 3) | 0, (2 * H / 3) | 0, nc > 1 ? 1 : 0));
   return o;
}

// Invariantes globales de la batería: sin NaN/Inf + mediana en rango.
// opts.allowEdges=true relaja mediana a [0,1] (casos límite saturada/casi negra).
function sfCheckInvariants(view, opts) {
   opts = opts || {};
   var bad = sfCountNonFinite(view);
   if (bad > 0) throw new Error("invariante: " + bad + " muestras NaN/Inf");
   var med = sfViewMedian(view);
   if (opts.allowEdges) {
      if (med < 0 || med > 1) throw new Error("invariante: mediana fuera de [0,1]: " + med);
   } else {
      if (!(med > 0 && med < 1)) throw new Error("invariante: mediana fuera de (0,1): " + med);
   }
   return med;
}
