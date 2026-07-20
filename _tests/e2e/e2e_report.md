# E2E PI Workflow — 2026-07-08 · build 29 · RESULTADO: GREEN

## ❌ E2E fallido
- (ninguno)

## 🐌 Rendimiento: desviación >20% vs pasada anterior
- (ninguno)

## ⚠️ Calidad: desviación grande vs baseline
- (ninguna)

## ⏱️ Rendimiento por proceso (ms) · Δ% vs pasada anterior

| Imagen | E2E total | gradient | starSplit | autoghs | starReduce | denoise | finish |
|---|--:|--:|--:|--:|--:|--:|--:|
| NGC3184_RGB.xisf | 34857 (-1%) | 3155 (+2%) | 5383 (+7%) | 3397 (+1%) | 39 (0%) | 8163 (+0%) | 12855 (-1%) |
| LDu2_RGB.xisf | 35219 (-2%) | 4341 (+2%) | 5506 (+7%) | 3371 (-2%) | 44 (+7%) | 8110 (-1%) | 13239 (+2%) |
| M13_RGB.xisf | 21949 (+1%) | 2859 (-4%) | 5434 (-2%) | 3243 (-1%) | 42 (-11%) | 8227 (-0%) | 12915 (+1%) |

## 🎯 Calidad de la salida (vs baseline)

| Imagen | mediana | ruido σ | SNR | saturación % | rango din. | R/G/B med. |
|---|--:|--:|--:|--:|--:|---|
| NGC3184_RGB.xisf | 0.0819 | 6.35e-3 | 3.5 | 0.000 | 7.1 | 0.081/0.081/0.089 |
| LDu2_RGB.xisf | 0.0940 | 9.66e-3 | 3.1 | 0.000 | 6.6 | 0.094/0.094/0.092 |
| M13_RGB.xisf | 0.1630 | 1.48e-2 | 5.9 | 0.000 | 5.9 | 0.153/0.164/0.186 |

_Historial: 3 pasada(s) en perf_history.json · baseline de calidad en quality_baseline.json · 2026-07-08T16:05:59.434Z_
