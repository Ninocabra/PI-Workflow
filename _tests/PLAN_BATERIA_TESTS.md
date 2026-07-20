# PLAN — Batería de tests con imágenes (todas las funcionalidades)
**Acordado 2026-07-08 · Estado: CONSTRUIDA + VERDE (build 28, 2026-07-08). P12 corre imágenes reales del repositorio CabraSpace (override local: `_tests/images/`).**
**Último run (build 28):** `battery_report.md` **GREEN** · nivel 1 63 pass/0 fail/0 slow/1 skip (18 s, incl. 6 imágenes reales en P12) · nivel 2 GREEN 4 pass/4 skip · nivel 0 31 pass/0 fail/2 warn · regression 59/59 GREEN. Hallazgos Nº2 (DeepSNR sin help) y Nº3 (wrappers RC-Astro ignoran executeOn=false) **RESUELTOS**. Detalles en `battery_report.md`, fila build 28 y nota 2026-07-08 de `README_DEV_200.md`.

## Decisiones del usuario (cerradas — no volver a preguntar)
1. **Timing:** DESPUÉS de publicar la release 2.0. (Primero: usuario valida RC → "publica" → subir. Luego esto.)
2. **Imágenes:** sintéticas (generadas por el harness, deterministas, con ground truth) **+ recortes reales del usuario**
   (~512-1024px: Ha, OIII, RGB lineal, campo estrellado, galaxia) en `_tests/images/`. El usuario los aportará.
3. **Nivel 2 (tools externas):** SÍ — smoke tests de SXT/StarNet/BXT/NXT/GraXpert **con skip limpio** si no están instaladas.

## Arquitectura por niveles
| Nivel | Dónde corre | Qué cubre |
|---|---|---|
| 0 — node (segundos) | terminal | funciones puras, sintaxis, i18n, registro (YA EXISTE: `ann_engine_test.js` 73/73; ampliar) |
| 1 — Motor PJSR (~min) | script headless en PixInsight | **el grueso**: cada funcionalidad sobre la matriz de imágenes |
| 2 — Tools externas | PJSR, si instaladas | smoke: corre y produce salida sana; skip limpio si faltan |
| 3 — GUI | manual | checklist (NO automatizable: diálogo modal PJSR) |

## Cimientos existentes (construir SOBRE esto, no de cero)
- `_tests/regression_suite.js` — patrón a seguir: corre EN PixInsight, datos sintéticos deterministas
  (`synthArray`/`synthRGB`), baseline JSON (`regression_baseline.json`), log, PASS/FAIL con tolerancias
  (TOL_ABS 1e-7). 59/59 GREEN. Usa `#define PI_WORKFLOW_OPT_NO_MAIN 1` + `#include "../PI Workflow.js"`.
- `_tests/ann_engine_test.js` — patrón node (extrae funciones con `new Function`, evalúa contra catálogo real).
- ~70 scripts ad-hoc (sssc_*, cm_*, diag_*, repro_*) = material reciclable para packs.

## Matriz de imágenes sintéticas (Nivel 1, generadas por el harness)
- RGB lineal · mono R/G/B · **par línea+continuo con k conocido** (continuum debe recuperar k≈inyectado;
  la rama compacta debe reportarse en `r.compact`) · campo de estrellas con PSF conocida · gradiente
  sintético conocido (corrección debe reducirlo ≥X%) · ruidosa · casos límite (saturada, casi negra, mini).

## Packs de tests (Nivel 1) — por área
combinación de canales (RGB/HOO/SHO/…) · 5 stretches (STF/MAS/SS/AGHS/Curves) · continuum subtraction ·
máscaras (#12) · Color Mixer · Detail & Contrast · export + log embebido + sidecars · asserts de
invariantes (medianas/rangos/no-NaN/no-excepción), NO píxel-exacto para nada que toque AI.

## Tests "lección aprendida" (baratos, alta prioridad, pueden ir en Nivel 0)
- **Anti-drift del registro**: todo algoritmo de todo combo/action-card debe estar en `OPT_ALGO_MENUS`
  (bug SSSC build 26 — ver CONVENCIÓN en README_DEV_200.md).
- **Cobertura i18n global**: extender el test de Anotaciones (OPT_I18N_ES real, 0 faltantes) a todas las pestañas.
- **Coherencia de flags**: apagar cada `OPT_*_ENABLED` no debe dejar referencias rotas (al menos node --check
  + grep de consumidores).

## Fases de construcción (cada una = build verificado)
1. Runner + fábrica de imágenes sintéticas + report (PASS/FAIL por test × imagen, log + resumen).
2. Pack continuum + stretches (aprovechar ground truth k / PSF).
3. Pack combinación + mixer/detail + máscaras.
4. Nivel 0 ampliado (anti-drift, i18n global, flags) — se puede adelantar, es barato.
5. Nivel 2 (smoke tools con skip) + integración de recortes reales del usuario.
Runtime objetivo Nivel 1: < 5 min sin tools AI.

---

# PLAN EJECUTABLE (montado 2026-07-08 · Fable) — fuente de verdad de la implementación

## Ficheros nuevos (todos en `_tests/`, NO se toca `PI Workflow.js` ni engine/ui → no hay bump de build)
| Fichero | Nivel | Qué es |
|---|---|---|
| `synth_factory.jsh` | 1-2 | Fábrica de imágenes sintéticas deterministas con ground truth (ver matriz abajo). Sin `Math.random()` en los datos. |
| `battery_suite.js` | 1 | Runner principal PJSR (patrón `regression_suite.js`: `#define PI_WORKFLOW_OPT_NO_MAIN` + `#include "../PI Workflow.js"`). Ejecuta packs × matriz, cronometra cada test, log incremental. |
| `battery_level0.js` | 0 | Runner node: anti-drift de registro (`OPT_ALGO_MENUS`), i18n global (OPT_I18N_ES real, 0 faltantes en TODAS las pestañas), coherencia de flags `OPT_*_ENABLED`. |
| `battery_tools_smoke.js` | 2 | Smoke SXT/StarNet/BXT/NXT/GraXpert: detecta si el Process existe; si no → `SKIP` limpio (nunca FAIL). |
| `battery_report.md` | — | REPORTE generado en cada run (formato abajo). |
| `battery_suite.log` / `battery_level0.log` | — | Logs crudos (escritura incremental: si PI crashea, el log dice dónde). |
| `GUI_CHECKLIST.md` | 3 | Checklist manual de GUI (modal, no automatizable). |

## Comandos de ejecución
```
node "_tests/battery_level0.js"                                     # Nivel 0 (segundos)
"C:\Program Files\PixInsight\bin\PixInsight.exe" -n=152 --automation-mode -r="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_200/_tests/battery_suite.js" --force-exit
"...idem..." -r=".../battery_tools_smoke.js" --force-exit           # Nivel 2
```

## Matriz sintética (en `synth_factory.jsh`, cada una con ground truth)
1. `rgbLinear(W,H)` — RGB lineal suave + estrellas dispersas (base regression_suite).
2. `monoChannel(W,H,seed)` — mono por canal (R/G/B, Ha/OIII/SII se simulan con seeds distintos).
3. `lineContinuumPair(W,H,k)` — par línea+continuo con k CONOCIDO → continuum debe recuperar k≈inyectado (tol 15%) y reportar `r.compact` cuando toque.
4. `starField(W,H,fwhm,specs)` — estrellas gaussianas con PSF conocida (reutiliza `starImg` del regression).
5. `gradientImg(W,H,slope)` — gradiente lineal conocido → corrección debe reducir amplitud ≥50%.
6. `noisyImg(W,H,sigma)` — ruido determinista (PRNG con seed fijo, ej. mulberry32) → denoise debe bajar sigma sin destruir mediana.
7. Casos límite: `saturatedImg` (99% a 1.0), `nearBlackImg` (mediana <0.001), `tinyImg` (16×16).

## Inventario de packs Nivel 1 (cada test = try/catch + cronómetro + asserts de invariantes)
Invariantes globales de TODO test: no lanza excepción · sin NaN/Inf · mediana en (0,1) · no filtra ventanas
(contar `ImageWindow.windows.length` antes/después, patrón F3 del regression) · duración registrada.
- **P1 combinación de canales**: RGB, HOO, SHO (+los combos del registro que apliquen) sobre monos sintéticos; asserts: dimensiones, canales=3, medianas por canal en rango, resultado ≠ entrada.
- **P2 stretches (×5)**: STF / MAS / SS / AGHS / Curves sobre rgbLinear y nearBlack; assert: mediana sube (imagen lineal → no lineal), monotonía aproximada, sin clipping total.
- **P3 continuum subtraction**: lineContinuumPair con k=0.7 y k=1.3; assert: k recuperado (tol 15%), rama compacta reportada en `r.compact`, resultado sin negativo masivo.
- **P4 máscaras**: generación de máscara de cada tipo disponible (luminancia, estrellas, color/rango) sobre rgbLinear+starField; assert: rango [0,1], no constante, dimensiones.
- **P5 Color Mixer**: apply completo + máscara por banda (extiende los checks C del regression con más bandas/params).
- **P6 Detail & Contrast**: los 9 algoIds del regression + params extremos (strength 0 → identidad aprox; strength max → no NaN).
- **P7 gradiente**: gradientImg → corrección interna (no GraXpert); assert reducción ≥50% de amplitud del plano.
- **P8 denoise/enhance**: noisyImg → algoritmos internos; assert: desviación baja, mediana estable (tol 5%).
- **P9 export + processing log + sidecars**: exportar a carpeta temporal del harness; assert: fichero existe, tamaño >0, log embebido presente, sidecar generado; limpiar después.
- **P10 SSSC/color calibration (math)**: ya cubierto en regression (E) — la batería añade el camino sobre starField con colores conocidos.
- **P11 AutoGHS/post/pre**: smoke de cada action-card no-AI del flujo sobre rgbLinear; assert invariantes globales.
- **P12 imágenes reales** (build 28): elige directorio por prioridad — (1) `_tests/images/` como override local, (2) por defecto el repositorio `C:/Users/ninoc/Documents/PixInsight/CabraSpace/Pagina Web/Imagenes Prueba/`. Subconjunto CURADO (`REAL_IMG_SET`: rgb_linear/galaxia/campo_estrellas/SHO/HSO/banda_ancha; si un fichero no está se salta; si ninguno, cae a los primeros 6 .xisf). Abre cada una, recorta el centro ≤1024 px (`sfOpenRealCrop`, acota RAM/tiempo) y corre invariantes STF+máscara (solo invariantes, sin ground truth). Una fila por imagen con su tiempo. Si no hay ningún directorio → `SKIP` limpio.
- **P13 entrada NB (dual-band + monos H/O/S)** (2026-07-08, suite standalone `nb_dualband_suite.js`, GREEN 39/39):
  (a) rama DBXTRACT de la UI (tabs_core.js:959) con C1_HO+C2_OS reales: `optRunDBXtract` → _HA/_OIII/_SII válidos
  y distintos → combos HSO+HOO; (b) rama NO-DBXtract (monos separados) con los **másters reales del usuario**
  (trío H/O/S 300s autocrop): combinación SHO/HOO/FORAXX con **mapeo de canales verificado numéricamente**
  (mediana de cada canal == mono fuente según receta); (c) trío 180s drizzle: invariantes. SKIP limpio por
  sección si falta DBXtract.js o las imágenes. **Lección aprendida:** los másters WBPP son XISF **multi-imagen**
  (máster + mapa embebido) → `ImageWindow.open` devuelve VARIAS ventanas; todo helper de test debe cerrarlas
  TODAS (fuga cazada por los guards; corregido en nb_dualband/battery-P12/e2e). El motor no se ve afectado
  (solo reabre salidas propias); el loader de la UI ya itera todas.
- **P14 autoasignación de slots de "Load Image Files…"** (2026-07-08, build 32, en `battery_suite.js`): tabla
  de mapeo PURO nombre→slot (`optInferSlotFromName`: _HO/_OS/_SO/_Ha/_H/_OIII/_O3/_O/_SII/_S2/_S/_R/_G/_B/_L/
  _Lum/_RGB, case-insensitive, rutas completas, y null si no reconoce — nunca adivinar) + FILTER→slot
  (`optInferSlotFromFilter`: quita comillas/espacios FITS). El contrato de panel (solo slots en "None", solo
  modo activo, primero-gana) es UI → se valida en GUI (GUI_CHECKLIST.md, sección barra global).
- **P13b paleta GOLDEN** (build 31, dentro de `nb_dualband_suite.js`): GOLDEN dual-band (invariantes), GOLDEN
  monos con **pesos verificados en 3 píxeles exactos** (R=H+0.40·O · G=0.65·H+0.10·O+0.80·S · B=0.15·H+O+S,
  tol 1e-5) y GOLDEN sin SII (S opcional). GREEN 47/47 total del suite.
- **P15 SyQon V3** (2026-07-16, suite standalone `syqon_v3_smoke.js`, GREEN 7/7 con los ejecutables reales):
  S1/S2 args puros (Starless contrato Axiom V3 `-i/-o/-v/-d/-c` SIN `--gui`; Parallax `--mode` solo cuando
  es aesthetics); S3/S4 Starless headless end-to-end (starless+stars y contrato in-place `applyToTarget`;
  imágenes 768px — el exe V3 exige ≥512 por lado, tesela fija); S5/S6 Parallax v1.5 classic y aesthetics;
  S7 Prism (flags sin cambios). SKIP limpio si falta el exe. El test SyQon Starless del nivel 2
  (`battery_tools_smoke.js`) usa `applyToTarget:true` desde este cambio.
- NO píxel-exacto en nada que toque AI o tools externas: solo invariantes.

## Umbrales de tiempo (para el apartado "ha tardado demasiado")
- Por test: `SLOW` si > 20 s (constante `SLOW_MS` configurable arriba del runner).
- Total Nivel 1: WARN en el reporte si > 5 min.

## Formato de `battery_report.md` (lo que pide el usuario: solo lo malo, arriba)
```
# Batería PI Workflow — <fecha> · build <OPT_BUILD> · RESULTADO: GREEN/RED
## ❌ Falla (test · imagen · qué se esperaba vs qué salió)
## 🐌 Demasiado lento (test · duración · umbral)
## ⚠️ Erróneo / no llegó a nada (excepciones, SKIPs inesperados, resultados vacíos)
## ✅ Resumen: N pass / N fail / N slow / N skip · tiempo total
## Apéndice: tabla completa test × imagen × ms × estado
```

## MÓDULO E2E + PERF + CALIDAD (añadido 2026-07-08, carpeta `_tests/e2e/`)
Autocontenido y bien identificado (ver `_tests/e2e/README_E2E.md`). Cubre lo que la batería por-función no cubría:
- **Flujo E2E completo**: corre el pipeline real de CabraMagic RGB (`optCabraComposeRGB`) sobre imágenes reales
  recortadas (crop fijo 1024). En headless la IA degrada a motores CPU (ABE/AutoGHS/DeepSNR/TGV) → llega al final.
- **Rendimiento fino**: cronometra E2E total + cada proceso (gradient/starSplit/autoghs/starReduce/denoise/finish);
  histórico acumulado en `perf_history.json`; **aviso si un proceso se desvía >20%** vs la pasada anterior.
- **Calidad**: `optQualityMetrics` de la salida vs `quality_baseline.json` por imagen; aviso si gran desviación.
- **GUI/IA por control del PC**: plan en `_tests/e2e/GUI_AUTOMATION.md` (computer-use; lo que no es headless).
- Estado 2026-07-08: 3 pasadas GREEN, baselines establecidos, comparación validada (Δ perf <±10%, calidad estable).

## REGLA VIVA (pedida por el usuario 2026-07-08)
**Cada funcionalidad nueva del script DEBE añadir su test a esta batería en el mismo cambio** (pack nuevo o
caso en pack existente + línea en este inventario). La CONVENCIÓN de "algoritmo nuevo = 5 sitios" del
README pasa a ser **6 sitios**: registry, masking, compare arrays, tooltips ES+EN, help, **batería**.

## Orden de ejecución del agente implementador
0. Sanity: correr `regression_suite.js` → debe seguir GREEN 59/59 antes de tocar nada.
1. Fase 1 (factory + runner + report) → correr → GREEN.
2. Fase 4 adelantada (nivel 0, barato) → correr.
3. Fase 2 (P2+P3) → correr. 4. Fase 3 (P1+P4+P5+P6) → correr. 5. Resto packs (P7-P11) → correr.
6. Nivel 2 smoke + P12 (skip limpio hoy). 7. Reporte final + actualizar README_DEV_200.md + este plan.
