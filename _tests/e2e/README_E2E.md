# E2E — Test de flujo completo + rendimiento fino + calidad (autocontenido)

**Creado 2026-07-08 (build 29+).** Todo lo de este test vive en esta carpeta `_tests/e2e/`, bien identificado.
Complementa la batería principal (`../battery_suite.js`): la batería prueba funciones **aisladas**; esto
prueba el **flujo completo end-to-end** más **rendimiento por proceso** y **calidad del resultado**, con
historial para detectar regresiones.

## Qué hace (3 cosas en una pasada)
1. **Flujo E2E completo** — corre el pipeline real de CabraMagic RGB (`optCabraComposeRGB`, el mismo camino de
   producción: gradiente → color → split de estrellas → stretch → denoise → recombinar → finish) sobre imágenes
   reales. En headless los pasos de IA degradan a motores que sí corren sin GPU (ABE, AutoGHS, DeepSNR/TGV), así
   que el flujo llega hasta el final. Verifica que el resultado es válido (dimensiones, 3 canales, sin NaN, rango
   [0,1], no idéntico a la entrada, sin fugas de ventanas).
2. **Rendimiento fino** — cronometra el E2E total y **cada proceso por separado** (gradiente, split, AutoGHS,
   star-reduce, denoise, finish). Guarda cada medida en `perf_history.json` (histórico acumulado con fecha+build).
   **Si un proceso se desvía >20% respecto a la medida anterior → aviso** (🐌 más lento / 🐇 más rápido).
3. **Calidad del resultado** — con `optQualityMetrics` mide la salida (mediana, ruido σ, SNR, % saturación, rango
   dinámico, medianas RGB) y la compara con `quality_baseline.json` para la **misma imagen**. Si algo se degrada o
   cambia mucho respecto a la referencia → aviso. La primera vez establece la línea base.

## Ficheros
| Fichero | Qué es |
|---|---|
| `e2e_suite.js` | Runner PJSR (corre en PixInsight headless). Genera todo lo demás. |
| `perf_history.json` | Historial de tiempos por proceso e imagen (acumulativo). Fuente de la comparación >20%. |
| `quality_baseline.json` | Métricas de calidad de referencia por imagen. Fuente de la comparación de calidad. |
| `e2e_report.md` | Reporte de la última pasada: E2E OK/FALLO, tabla de perf con Δ%, tabla de calidad con Δ, avisos. |
| `e2e_suite.log` | Log crudo incremental (sobrevive a crashes). |
| `README_E2E.md` | Este fichero. |

## Cómo se corre
```
"C:\Program Files\PixInsight\bin\PixInsight.exe" -n=152 --automation-mode \
  -r="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_200/_tests/e2e/e2e_suite.js" --force-exit
```
Luego leer `e2e_report.md` (no el stdout: los warnings GPU/GLES son inofensivos).

## Reglas de comparación (ajustables en la cabecera de `e2e_suite.js`)
- **Perf:** aviso si |Δ| respecto a la medida previa de ese proceso+imagen supera **20%** (`PERF_WARN_PCT`).
- **Calidad:** umbrales relativos por métrica (`QUALITY_THRESH`): mediana 15%, ruido 30%, SNR 20%, rango dinámico
  20%, medianas RGB 15%; saturación en puntos absolutos (1.0 pp). Superarlos = aviso.
- Imágenes: subconjunto curado de `CabraSpace/Pagina Web/Imagenes Prueba` (override local: `../images/`),
  recortadas al centro a tamaño fijo (`E2E_CROP`, por defecto 1024) para que los tiempos sean comparables entre
  pasadas.

## Parte NO headless (GUI / interacción / tools IA reales)
Los pasos que no se pueden validar sin GPU/GUI (que SXT/BXT/NXT **ejecutan de verdad**, interacción del diálogo
modal) se cubren por **control del PC** (computer-use). Ver `GUI_AUTOMATION.md` cuando exista + el checklist
manual en `../GUI_CHECKLIST.md`.

## Regla viva
Cada funcionalidad nueva que forme parte del flujo debe: (a) quedar cubierta por el E2E si entra en el pipeline,
(b) añadir su proceso al desglose de perf, y (c) tener su métrica de calidad si afecta al resultado.
