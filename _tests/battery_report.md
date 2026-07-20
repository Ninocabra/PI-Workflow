# Batería PI Workflow — 2026-07-16 · build 35 · RESULTADO: GREEN

## ❌ Falla (test · imagen · qué se esperaba vs qué salió)
- (ninguna)

## 🐌 Demasiado lento (test · duración · umbral)
- (ninguno)

## ⚠️ Erróneo / no llegó a nada (excepciones, SKIPs inesperados, resultados vacíos)
- [nivel 0] stretchStarless: orden de la zona difiere del registro (reorden AutoGHS-default 2026-06-29; lookup por prefId, no rompe)
- [nivel 0] stretchStars: orden de la zona difiere del registro (reorden AutoGHS-default 2026-06-29; lookup por prefId, no rompe)
- HALLAZGO Nº1 — DeepSNR se añadió al registro (OPT_ALGO_MENUS, postNR) sin recapturar el baseline del regression ni anotarlo en README_DEV_200.md (los checks session_capture/session_roundtrip pasaron a 38 algos vs 37 del baseline → RED). Drift exactamente del tipo que el nivel 0 anti-drift debe cazar. Baseline recapturado 2026-07-08 con autorización (backup: regression_baseline_pre_deepsnr.json.bak); diff verificado: SOLO cambiaron los conteos de sesión, ningún fingerprint matemático.
- HALLAZGO Nº2 — [RESUELTO 2026-07-08, build 28] DeepSNR incumplía el sitio 5 de la convención (help): no estaba documentado en PI Workflow_help.xhtml ni en PI Workflow_help_es.xhtml. Detectado por el nivel 0. Corregido: fila DeepSNR en la tabla §6.1 de ambos help (EN+ES) + encabezado/intro/TOC actualizados a 6 motores. El nivel 0 (DeepSNR sitio 5 EN/ES) debe pasar a PASS.
- HALLAZGO Nº3 — [RESUELTO 2026-07-08, build 28] Los wrappers de las tools RC-Astro/IA ignoraban el retorno de executeOn: cuando SXT/BXT/NXT/DeepSNR fallan sin excepción (executeOn devuelve false, p.ej. runtime IA sin GPU en automation-mode), continuaban en silencio con la imagen SIN modificar. Corregido: nuevo helper optAssertExecuteOk(ret, tool) en utils.js aplicado en optCabraStarless (SXT), optExecuteBlurXConfiguredOnView (BXT), optExecuteNoiseXConfiguredOnView (NXT) y optExecuteDeepSNROnView (DeepSNR) — ahora lanzan si ret===false. Esto además REPARA las cadenas de fallback de CabraMagic (deconv/denoise/star-split), que ya usaban try/catch esperando que lanzaran y por tanto nunca avanzaban al siguiente motor en headless.
- HALLAZGO Nº4 — [RESUELTO 2026-07-08, build 29] StarNet2 (cabramagic.js:1173, dentro de optCabraMakeStarless) tenía el MISMO fallo silencioso que el Nº3 pero quedó fuera del build 28 (no es RC-Astro ni DeepSNR): devolvia "StarNet2" aunque executeOn devolviera false. Corregido con optAssertExecuteOk; al estar dentro del try/catch de la cadena de fallback, ahora un fallo real cae a null (sin motor) en vez de afirmar exito. Portado a Dev_200 y RELEASE_2.0_RC1.

## ✅ Resumen: 66 pass / 0 fail / 0 slow / 1 skip · tiempo total 23 s (nivel 1)
- [nivel 0] nivel 0 GREEN — 31 pass / 0 fail / 2 warn
- [nivel 2] nivel 2 GREEN — 4 pass / 0 fail / 0 slow / 4 skip · 26 s
- SKIPs esperados de otros niveles:
  - [nivel 2] StarXTerminator (starless in-place) — instalado pero executeOn=false en automation-mode (runtime AI RC-Astro sin GPU/GLES) — validar en GUI
  - [nivel 2] BlurXTerminator (correct+sharpen suave) — instalado pero executeOn=false en automation-mode (runtime AI RC-Astro sin GPU/GLES) — validar en GUI
  - [nivel 2] NoiseXTerminator (denoise 0.5) — instalado pero executeOn=false en automation-mode (runtime AI RC-Astro sin GPU/GLES) — validar en GUI
  - [nivel 2] SyQon Starless (split externo) — esperado: SyQon Starless instalado pero sin ruta de ejecutable configurada

## Apéndice: tabla completa test × imagen × ms × estado
| Pack | Test | Imagen | ms | Estado | Nota |
|---|---|---|---:|---|---|
| P0 | rgbLinear básica | rgbLinear | 12 | PASS |  |
| P0 | determinismo (2 llamadas idénticas) | rgbLinear+noisy | 35 | PASS |  |
| P0 | ground truth (k, sigma, gradiente, límites) | matriz | 54 | PASS |  |
| P2 | stretch STF | rgbLinear | 42 | PASS |  |
| P2 | stretch MAS | rgbLinear | 72 | PASS |  |
| P2 | stretch SS | rgbLinear | 206 | PASS |  |
| P2 | stretch AGHS | rgbLinear | 50 | PASS |  |
| P2 | stretch CURVES | rgbLinear | 37 | PASS |  |
| P2 | stretch STF | nearBlack | 42 | PASS |  |
| P2 | stretch MAS | nearBlack | 72 | PASS |  |
| P2 | stretch SS | nearBlack | 195 | PASS |  |
| P2 | stretch AGHS | nearBlack | 45 | PASS |  |
| P2 | stretch CURVES | nearBlack | 27 | PASS |  |
| P3 | estimador recupera k=0.7 | lineContinuumPair | 28 | PASS |  |
| P3 | estimador recupera k=1.3 | lineContinuumPair | 19 | PASS |  |
| P3 | resta: emisión conservada, estrellas eliminadas, sin negativos | lineContinuumPair k=0.7 | 77 | PASS |  |
| P3 | decisión rama compacta (índice de concentración) | compacta vs extendida | 32 | PASS |  |
| P1 | RGB desde 3 monos (optCreateRgbFromChannels) | monoChannel×3 | 121 | PASS |  |
| P1 | paleta HOO (H+O) | monoChannel(Ha/OIII/SII) | 105 | PASS |  |
| P1 | paleta SHO (H+O+S) | monoChannel(Ha/OIII/SII) | 113 | PASS |  |
| P1 | paleta FORAXX (H+O+S) | monoChannel(Ha/OIII/SII) | 118 | PASS |  |
| P1 | paleta FORAXX (H+O) | monoChannel(Ha/OIII/SII) | 105 | PASS |  |
| P4 | máscara rango/luminancia modo binaria | rgbLinear | 13 | PASS |  |
| P4 | máscara rango/luminancia modo rango | rgbLinear | 60 | PASS |  |
| P4 | máscara rango/luminancia modo brillo | rgbLinear | 56 | PASS |  |
| P4 | máscara de color (hue verde) | rgbLinear | 63 | PASS |  |
| P4 | máscara rango sobre campo de estrellas (selección de estrellas) | starField | 57 | PASS |  |
| P4 | máscara de estrellas dedicada (motor de star split) | starField | 0 | SKIP | esperado: star mask v2 diferida en masks.js; split real via SXT/StarNet2 → nivel 2 |
| P5 | apply sin trabajo == identidad | rgbLinear | 8 | PASS |  |
| P5 | apply completo (sat+hue+vib+lum en varias bandas) | rgbLinear | 11 | PASS |  |
| P5 | máscara por banda (las 8 bandas + global -1) | hueStrips | 69 | PASS |  |
| P6 | detail localContrast (defaults) | rgbLinear | 9 | PASS |  |
| P6 | detail mmtTexture (defaults) | rgbLinear | 7 | PASS |  |
| P6 | detail edgeAware (defaults) | rgbLinear | 8 | PASS |  |
| P6 | detail hdrmt (defaults) | rgbLinear | 9 | PASS |  |
| P6 | detail dse (defaults) | rgbLinear | 8 | PASS |  |
| P6 | detail clahe (defaults) | rgbLinear | 9 | PASS |  |
| P6 | detail sigmoid (defaults) | rgbLinear | 8 | PASS |  |
| P6 | detail vibrance (defaults) | rgbLinear | 8 | PASS |  |
| P6 | detail byObjectType (defaults) | rgbLinear | 13 | PASS |  |
| P6 | extremo: strength 0 ≈ identidad (localContrast/edgeAware) | rgbLinear | 18 | PASS |  |
| P6 | extremo: strength máxima → sin NaN ni clipping total | rgbLinear | 26 | PASS |  |
| P7 | ABE reduce el plano ≥50% | gradientImg slope=0.30 | 190 | PASS |  |
| P7 | AutoDBE (SetiAstro) reduce el plano | gradientImg 512×384 slope=0.30 | 637 | PASS |  |
| P8 | TGVDenoise baja sigma sin mover la mediana | noisyImg σ=0.05 | 4146 | PASS |  |
| P8 | star reduce interno (morfológico) atenúa estrellas, fondo estable | starField | 7 | PASS |  |
| P9 | export tif/png/jpg/fits/xisf + tamaño >0 | rgbLinear 64×48 | 119 | PASS |  |
| P9 | log embebido (keywords PIW en XISF reabierto) | rgbLinear 64×48 | 62 | PASS |  |
| P9 | sidecars .txt + _astrobin.csv | rgbLinear 64×48 | 28 | PASS |  |
| P10 | fotometría recupera ratios de color inyectados (tol 15%) | starField σ=1.6 | 12 | PASS |  |
| P11 | AutoGHS saturación 0.92 + noise ceiling | rgbLinear | 18 | PASS |  |
| P11 | post UnsharpMask (nativo, defaults) | rgbLinear estirada | 81 | PASS |  |
| P11 | post HDRMultiscaleTransform (nativo, defaults) | rgbLinear estirada | 72 | PASS |  |
| P11 | post LocalHistogramEqualization (nativo, defaults) | rgbLinear estirada | 86 | PASS |  |
| P11 | pre Auto Linear Fit acerca las medianas de canal | rgbLinear | 242 | PASS |  |
| P11 | pre Background Neutralization neutraliza el fondo | rgbLinear | 371 | PASS |  |
| P11 | MAD auto-stretch del preview (Image suelta, uso de preview.js) | rgbLinear | 30 | PASS |  |
| P11 | casos límite: AutoGHS y STF no rompen (saturada, tiny) | saturada+tiny | 56 | PASS |  |
| P12 | real: STF + máscara (rgb_linear) | NGC1560_RGB_linear.xisf | 1469 | PASS |  |
| P12 | real: STF + máscara (galaxia) | NGC3184_RGB.xisf | 4028 | PASS |  |
| P12 | real: STF + máscara (campo_estrellas) | M13_RGB.xisf | 1468 | PASS |  |
| P12 | real: STF + máscara (nebulosa_SHO) | Abell39_SHO.xisf | 1412 | PASS |  |
| P12 | real: STF + máscara (nebulosa_HSO) | PK164_HSO.xisf | 1280 | PASS |  |
| P12 | real: STF + máscara (nebulosa_banda_ancha) | LDu2_RGB.xisf | 4856 | PASS |  |
| P12 | real: STF + máscara (mono_Ha_master) | masterLight_BIN-1_6248x4176_EXPOSURE-300.00s_FILTER-H_mono_autocrop.xisf | 448 | PASS |  |
| P14 | sufijo de nombre → slot | (tabla) | 0 | PASS |  |
| P14 | keyword FILTER → slot | (tabla) | 1 | PASS |  |

_Generado por battery_suite.js · SLOW_MS=20000 · 2026-07-16T20:42:22.583Z_
