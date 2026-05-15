# PI Workflow — Contexto de Desarrollo y Conversaciones

> **INSTRUCCIÓN PARA CLAUDE:** Leer este archivo al inicio de cada sesión sobre PI Workflow.
> Actualizar la sección "Estado Actual" y "Últimas decisiones" cuando se apliquen cambios.

---

## 1. Descripción del Proyecto

**Nombre:** PI Workflow (antes: RGB StarDoctor Suite)
**Archivo actual:** `PI Workflow_18GPT.js` (v100, ~24.000 líneas)
**Entorno:** PixInsight JavaScript Runtime (PJSR) + SpiderMonkey
**Propósito:** Suite completa de procesado de astrofotografía: preprocesado lineal, corrección de gradiente, calibración de color, stretch dual-zona, corrección cromática de estrellas y postprocesado.

---

## 2. Arquitectura General

### Pestañas (TabBox)
| Índice | Pestaña | Propósito |
|--------|---------|-----------|
| 0 | Pre-processing | Carga de imágenes, calibración de color, gradiente, BlurXTerminator |
| 1 | Stretching | Stretch dual-zona (RGB/Starless + Stars) con VeraLux, MAS, AutoSTF |
| 2 | Stars Chromatic Correction | Detección y reparación de aberración cromática en estrellas |
| 3 | Post Processing | Ruido, enfoque, curvas, blending, máscaras, Color Balance |
| 4 | Configuration | Ajustes globales del script |

### Modos de entrada (Pre-processing)
- **RGB**: imagen de color única
- **MONO**: canales R/G/B separados + L opcional (ensamblaje LRGB con CIE L*)
- **NARROWBAND**: Ha/OIII/SII + L opcional + RGB support; 12 recetas de paleta

### Modelo de memoria (desde v99)
- **Slot map canónico**: MONO (R/G/B/L), NB (H/O/S + HO/OS color), RGB
- Los slots se escriben SOLO al hacer Combine/Process, nunca al cambiar el combo box
- El slot activo se propaga entre Pre-processing, Stretching, Post Processing y Channel Combination

### Modelo de Stretching (desde v62, consolidado v73)
- Cada zona tiene: `linearSource` (inmutable) + `lastPreviewView` + `lastPreviewBitmap`
- `linearSource` se asigna SOLO al cargar una imagen nueva, NUNCA se modifica
- Todo stretch opera desde `linearSource` → doble-stretch imposible
- Roles de render: SOURCE (aplica AutoSTF), PREVIEW y MEMORY (sin AutoSTF)

---

## 3. Historial de Versiones y Decisiones Clave

### v33-opt-8g — Stretching CheckBox Tooltips Actually Applied
**Problema:** Los tooltips de checkboxes añadidos en v33-opt-8f estaban en el diccionario pero no se mostraban al hacer hover.
**Root cause:** `optBuildStretchZone` nunca llama a `optApplyCheckBoxTooltip()`. La función `optApplyContextTooltipsDeep` se ejecuta solo una vez al construir el diálogo y no re-recorre los hijos creados después en builders por-zona. En cambio, el tab Post Processing sí llama `optApplyCheckBoxTooltip()` después de cada `.text =`.
**Fix:** Añadir `optApplyCheckBoxTooltip(checkbox)` después de cada `.text =` en los 9 checkboxes del Stretching cuyos labels están en el diccionario. Para el checkbox "Live" en Curves Settings (conflicto con "check.Live" de Channel Combination), usar clave explícita `stretch.curves.live`.
**Regla permanente:** Cualquier `new CheckBox()` que se cree dinámicamente (dentro de builders, factories, o tras la construcción inicial del diálogo) DEBE llamar explícitamente a `optApplyCheckBoxTooltip()` después de asignar `.text`. NO confiar en `optApplyContextTooltipsDeep` para tooltips de controles creados tarde.

### v33-opt-8f — Stretching Tab Tooltips
**Cambio:** Tooltips contextuales específicos para los 5 algoritmos del tab Stretching (Auto STF, MAS, Statistical Stretch, Star Stretch, VeraLux). Antes mostraban texto genérico ("Drag for coarse changes...").
**Implementación:** 
  - 32 entradas nuevas en `PI Workflow_resources.jsh` siguiendo el patrón `<b>Title</b><br/>Description. Recommended: X-Y. Range: min-max.`
  - Para 4 controles con labels compartidos (Target background entre STF/MAS, Amount/Boost en MAS Color Saturation), se aplican tooltips explícitos via `optTooltipTextByKey("stretch.xxx.yyy")` justo después de su creación en `optBuildStretchZone` (línea ~7835-7910).
**Regla permanente:** Cuando dos controles distintos comparten label (`optNumeric(..., "X:", ...)`), añadir clave explícita en el diccionario (`stretch.context.name`) y aplicarla manualmente al control con `optTooltipTextByKey(key)` + asignación a `.toolTip`, `.label.toolTip`, `.slider.toolTip`, `.edit.toolTip`.

### v33-opt-8e-revert — BicubicBSpline Downsample Reverted (Performance Regression)
**Problema:** El cambio a `Interpolation_BicubicBSpline` en preview generation (intento de eliminar cuadrícula residual) causó:
  - CPU al 90%
  - Memoria al 90%
  - Combine H+O+S no mostraba nada en preview (proceso colgado)
**Root cause:** BicubicBSpline es ~5x más costoso que Bilinear. En workflows complejos (Combine NB) el preview se regenera muchas veces sobre imágenes grandes → freeze. El cambio funcionaba en imágenes pequeñas pero fallaba con resoluciones reales.
**Fix:** Revertir el commit `4b7c2e2` (revert hecho en `08b1045`). Volver a `Interpolation_Bilinear` en las 3 funciones.
**Decisión permanente:** Aceptar la cuadrícula residual parcial. El `smoothInterpolation` del paint (línea 5675) se mantiene — es la única optimización segura. NO volver a tocar la interpolación del downsampling inicial sin pruebas exhaustivas con imágenes grandes y workflows complejos (especialmente NB combine, MAS, post-processing pipelines).
**Regla permanente:** Cualquier cambio en `previewInterpolation` (líneas 1679, 1710, 1737) DEBE probarse con:
  1. Combine H+O+S a resolución completa
  2. Imágenes de al menos 6000×4000 px
  3. Múltiples iteraciones de preview (cambios de zoom, slider, etc.)

### v33-opt-8e — Preview Grid Artifact
**Problema:** En el preview aparecía una cuadrícula visible a niveles de zoom no enteros (ej. 52%) que NO existe en la imagen original. La cuadrícula desaparecía a 100%.
**Root cause:** En `viewport.onPaint` (línea ~5675), `g.drawScaledBitmap()` se llamaba sin habilitar `smoothInterpolation`. Por defecto, PixInsight usa nearest-neighbor sampling, que al escalar con factores no enteros duplica filas/columnas de forma irregular → cuadrícula visible.
**Fix:** Añadir `g.smoothInterpolation = true` antes de `drawScaledBitmap()`. Esto activa interpolación bilinear que mezcla suavemente píxeles vecinos en lugar de duplicarlos discretamente.
**Archivos:** PI Workflow.js línea 5675 (renderizador del viewport del preview)
**Regla permanente:** Cualquier llamada a `drawScaledBitmap()` para preview de usuario DEBE habilitar `smoothInterpolation`. Solo desactivarlo si el caller necesita explícitamente nearest-neighbor (raro, normalmente para máscaras pixel-perfect).

### v33-opt-8d — ImageSolverDialog Missing Dependencies (Fixed) + SXT Button Label
**Problema:** El diálogo de ImageSolver no aparecía, fallaba con "fieldLabel is not a constructor" y "STAR_CSV_FILE is not defined"
**Root cause:** Cuando `#define USE_SOLVER_LIBRARY` estaba definido, el bloque `#ifndef USE_SOLVER_LIBRARY` en ImageSolver.js se saltaba, excluyendo:
  - SearchCoordinatesDialog.js (que incluye CommonUIControls.js con fieldLabel)
  - La definición de STAR_CSV_FILE
**Fix:** Añadir antes del include de ImageSolver.js:
  - `#define STAR_CSV_FILE`
  - `#include <../src/scripts/AdP/CommonUIControls.js>`
  - `#include <../src/scripts/AdP/SearchCoordinatesDialog.js>`
**Cambio adicional:** Renombrar botón "Generate Starless / Stars" → "Generate Starless / Stars (SXT)" para claridad.
**Archivos:** PI Workflow.js líneas 86-88 (includes), líneas 8395-8396 (botón)
**Resultado:** ✅ ImageSolverDialog ahora abre y funciona correctamente cuando el solve automático falla.

### v33-opt-8c — ImageSolver Recursive Script Crash
**Problema:** Error `"Attempt to execute a Script instance recursively (view context)"` al intentar solve image.
**Root cause:** El fallback del fix anterior usaba `ProcessInstance.fromIcon("ImageSolver").executeOn()`. ImageSolver es en sí mismo un script JavaScript, y PixInsight prohíbe que un script lance otro script desde dentro de un view context.
**Fix:** Eliminar completamente el fallback de `ProcessInstance`. `ImageSolverDialog` es una clase de diálogo (no un script), por lo que es el único camino interactivo seguro desde dentro de un script. Si `ImageSolverDialog` no está disponible, se muestra un mensaje claro: `"Please run Scripts > AdP > ImageSolver manually and retry"`.
**Regla permanente:** NUNCA usar `ProcessInstance.fromIcon()` para scripts de PixInsight desde dentro de otro script en view context. Solo es seguro para procesos nativos (no scripts).
**Archivos:** PI Workflow.js líneas 3464-3510 (función `optSolveAstrometryOnWindow`)

### v33-opt-8b — ImageSolver Dialog Not Appearing
**Problema:** Cuando el plate solving automático falla, el diálogo de ImageSolver no aparece en pantalla. El código falla silenciosamente y el usuario no puede intervenir.
**Root cause:** La condición de apertura del diálogo en línea 3469 tiene dos requisitos:
  1. `typeof ImageSolverDialog === "function"` — No verificado en `optHasAdpSolverRuntime()`
  2. `metadata != null` — Falla en imágenes sin cabeceras FITS astrométricas
  Si cualquiera falla, el bloque entero se salta sin ningún mensaje visible.
**Fix:**
  1. Diagnóstico explícito: loguea cuál condición bloquea el diálogo
  2. Recuperación de metadata: dos intentos de construir metadata mínima si es null
  3. Fallback nativo: si `ImageSolverDialog` no existe, abre ImageSolver via `ProcessInstance.fromIcon()` como proceso PI estándar
**Archivos:** PI Workflow.js líneas 3464-3530 (función `optSolveAstrometryOnWindow`)

### v33-opt-8a — ImageSolver Apply Button Fix
**Problema:** Cuando ImageSolver falla automáticamente y abre el diálogo manual, el usuario hace cambios en la configuración y hace click en "Aplicar", pero la solución NO se aplica (usa la configuración por defecto).
**Root cause:** Después de que el usuario hace click en "Aplicar" en el diálogo (`dlgSolver.execute()` retorna true), la configuración actualizada del diálogo NO se sincroniza de vuelta al objeto solver antes de ejecutar `solver.SolveImage(window)`.
**Fix:** Agregar sincronización de configuración después de diálogo aceptado:
```javascript
if (accepted) {
   solver.solverCfg = dlgSolver.solverCfg;  // Sync updated config
}
```
**Archivos:** PI Workflow.js líneas 3472-3480 (función optSolveAstrometryOnWindow)
**Impacto:** Ahora los cambios del usuario en el diálogo se aplican correctamente.

### v43 — BXT/NXT snake_case (CRÍTICO)
**Problema:** BXT y NXT usan snake_case en C++ (`sharpen_stars`, `denoise`, `enable_color_separation`), no camelCase. El script usaba camelCase → JS creaba propiedades que el motor C++ nunca leía.
**Fix:** `ProcessInstance.fromIcon("BXT")` + nombres en snake_case. Misma convención para NXT.
**Regla permanente:** Todo parámetro de BXT/NXT DEBE usar snake_case.

### v57-v59 — Pre-processing workflow
- Flujo Pre: Current → Candidate → Set to Current → Memory
- Botón "Send to Stretching >>" al fondo del panel izquierdo

### v62 — Corrección del doble-stretch (CRÍTICO)
**Problema:** Set to Current promovía imagen ya stretcheada → siguiente Preview volvía a stretchear → pantalla verde/colores volados.
**Fix:** Modelo immutable linearSource. Refactoring completo del tab Stretching.
**AutoSTF fix:** La vista clonada heredaba `isLinear=true` del source → AutoSTF se aplicaba encima del stretch. Fix: render directo (sin AutoSTF) para roles PREVIEW y MEMORY.

### v65 — SpiderMonkey parser hardening
**Problema:** Asignaciones booleanas inline como `x = view.id === "RGB"` podían corromperse en copia local → SpiderMonkey las parseaba como sentencia standalone `== "RGB";`.
**Regla:** Usar siempre bloques if explícitos para asignaciones booleanas críticas.

### v66 — PenStyle fix
**Problema:** `PenStyle_Dash` no definido → crash en Curves widget.
**Fix:** `#include <pjsr/PenStyle.jsh>` + fallback a línea sólida.

### v67 — Post Masks (Range, Color, FAME)
- Range Selection: strip grayscale con límites low/high arrastrables
- Color Mask: hue wheel interactivo + Live preview
- FAME: dibujo manual (freehand, brush, spray, ellipse, rectangle) sobre preview principal

### v68-v69 — AutoDBE hardening
**v68 fix:** `AutoDBE_Engine is not defined` → wrapper directo de fallback
**v68 fix:** `executeGradientDescent` usaba `ImageWindow.activeWindow` en vez del `targetView` pasado
**v69 fix:** BackgroundNeutralization fallaba en imágenes mono → `colorSpace/numberOfChannels` para detección RGB robusta; skip con warning en mono.

### v71-v76 — MAS nativo
- Parámetros nativos exactos: `targetBackground`, `aggressiveness`, `dynamicRangeCompression`, `contrastRecovery`, `scaleSeparation`, `contrastRecoveryIntensity`, más saturation y background ROI
- Auto ROI: busca región 25×25 más oscura para `backgroundROIEnabled/X0/Y0/Width/Height`
- Valores legacy 0..5 normalizados a rango 0..1 automáticamente

### v73 — Set to Current sin doble-stretch
- Memory retiene bitmap visible + clone oculto promotable
- `SnapshotManager.releaseAll()` cierra también esos clones ocultos
- Zona buttons distinguen entre linearSource y imagen comprometida (no-lineal)

### v74 — Parser hardening
- Condiciones booleanas inline en Pre/Geometry/Stretching reescritas con early-return
- `updateModeSelection()` usa gates explícitos en vez de compound condition

### v75-v76 — Post bootstrap
**Problema:** `dlg.getPostActiveZoneView is not a function` al startup
**Root cause:** `getCurrentPostProcessingTargetView()` llamado antes de que el zone-system estuviera definido
**Fix:** Bootstrap temprano de `postActiveZone/postZoneViews` con stubs seguros

### v77 — Stretching UI + VeraLux
- Todos los sliders 0..1 usan resolución 0.01
- VeraLux optimizado: constantes hiperbólicas precalculadas, adaptive scaling/soft clipping in-place
- Zonas renombradas: "RGB / STARLESS" y "STARS"

### v80 — Stars Chromatic Correction completo
- Secciones colapsables: Detection, Shape, Manual Selection, Diagnosis, Repair
- Manual Selection: Exclude (right-click), Join, Split
- "Send to Post Processing" enruta resultado STARS al Post

### v82 — Narrowband + Visual Recipe Selector
- Modo NARROWBAND: Ha/OIII/SII + L opcional + RGB support
- 6 recetas visuales en tiles: SHO, HOO, HSO, HOS, NBRGB, HaRGB
- Assembly NB produce RGB Current normal → mismo pipeline que RGB

### v83 — Channel Balance + Autoload
- Section Channel Balance con sliders R/G/B/L (0.50 = neutro)
- Autoload: R/G/B/L en Pre-processing al startup únicamente

### v84 — Cleanup estructural
- Eliminado tab Geometry standalone (ya no expuesto en TabBox)
- Consolidados métodos duplicados Pre/Post en implementación única

### v85 — Startup hardening
- Fix crash `geoComboZoom` por binding obsoleto del tab Geometry eliminado
- Guard de propiedades opcionales en construcción del diálogo

### v86 — Channel Balance + Narrowband buttons
- Hue wheel con punto arrastrable en el ring + saturation slider
- 12 botones de receta NB: SHO, HOO, HSO, HOS, OSS, OHH, OSH, OHS, HSS, Real 1, Real 2, Foraxx
- "Process NB separately": popula flujo mono separado con Ha/SII/OIII

### v88 — LRGB CIE L* + NB preview full-res
- Luminance transfer vía CIE L*: L externo normalizado con median/MAD del RGB, blendido en lightness preservando chrominance
- NB previews construidos desde sources full-res (no clones 320px)
- Rebrand: "RGB StarDoctor Suite" → "PI Workflow"

### v89 — Color Balance Wheel + CC Histograms
- Hue wheel interactivo anclado al color medio de la imagen
- CC stage-aware: histogramas Starless/Stars/Combination con sus propias transforms

### v91 — Channel Balance PixelMath fix
**Problema:** PixelMath lvalue assignment inválido en Channel Balance live preview
**Fix:** Expresiones HSI wrapeadas que PixInsight acepta en ejecución scripted

### v97-v99 — Unified Image Selection + Slot Memory
- v97: warnings strict-mode en `computePostScalarLuminance/Brightness` → helpers locales
- v98: modelo unificado de Image Selection en Pre/Stretch/Post/CC
- v99: slot map canónico; combo box ya no crea paths implícitos; Preview forzado a Fit-to-Screen solo en load real

### v100 — SnapshotManager authority + temp-view cleanup
- Una sola implementación autoritativa de SnapshotManager (no más prototype shadowing tardío)
- Vistas internas clasificadas como workflow-owned: Blend_A/B, Memory_Snap_*, helpers LRGB, overlay helpers
- Channel Combination purga vistas temporales al salir del tab

---

## 4. AutoTester (PI_Workflow_AutoTester.js)

Creado para v14GPT. 10 grupos de tests:
1. Infraestructura (ImageWindow, estadísticas)
2. PixelMath (expresiones, paletas NB, screen-blend)
3. Canales (extraction, combination, AutoLinearFit)
4. Histograma/Stretching (HT, AutoSTF fórmula exacta)
5. Disponibilidad de procesos (DBE, ABE, SPCC, BXT, NXT)
6. Gradiente (ABE, stats, BackgroundNeutralization)
7. Calibración de color (SPCC, LinearFit, Curves)
8. Enfoque/Ruido (BXT/NXT snake_case param check)
9. Memoria (multi-window, gc, isNull guards)
10. Análisis estático del script (onClick count, try/catch, snake_case regression, linearSource guard)

---

## 5. Bugs Documentados (v19 pendientes)

### Bug #1 — AutoDBE crash en mono
- **Error:** `Image.sample(): channel index out of range`
- **Root cause:** AutoDBE.js llama `image.sample(x,y,1)` y `image.sample(x,y,2)` en imagen de 1 canal
- **Fix:** Expandir imagen mono a 3 canales RGB antes de AutoDBE, devolver canal 0
- **Estado:** Corregido en v19

### Bug #2 — Hang al cerrar el script
- **Síntoma:** PixInsight se congela al cerrar el diálogo
- **Root cause:** `nbRecipePlayTimer` y `preChannelBalanceTimer` disparaban tras cierre, accediendo a controles UI destruidos
- **Fix:** `performMemoryPolicyFinalCleanup` detiene todos los timers al inicio
- **Estado:** Corregido en v19

### Bug #3 — Console flooding en Post Color Balance
- **Síntoma:** 60+ líneas en consola al arrastrar el wheel de Color Balance
- **Root cause:** `requestPostColorBalancePreviewUpdate` llamaba `applyPostColorBalancePreview` en cada `onMouseMove` → 3× PixelMath + ChannelCombination por evento
- **Fix:** Debounce timer 300ms (`postColorBalanceDebounceTimer`)
- **Estado:** Corregido en v19

---

## 6. Reglas y Principios Establecidos

### PJSR / SpiderMonkey
- ⚠️ BXT/NXT: SIEMPRE snake_case (`sharpen_stars`, `denoise`, `enable_color_separation`)
- ⚠️ Asignaciones booleanas: SIEMPRE bloques if explícitos (nunca inline con ===)
- ⚠️ Funciones en bloque: usar function expressions, no declaraciones de función en bloque
- ⚠️ Objetos retornados inline con ternarios: vulnerable a corrupción → asignar a variable primero
- ⚠️ Todo proceso que manipule imágenes: dentro de try...finally

### Gestión de memoria
- Regla de oro: `linearSource` es INMUTABLE una vez asignado
- Roles de render: SOURCE (con AutoSTF), PREVIEW y MEMORY (sin AutoSTF)
- Vistas temporales propias del workflow: siempre con nombre clasificable (Blend_A/B, Memory_Snap_*)
- `SnapshotManager.releaseAll()` debe limpiar también clones ocultos

### UI/UX
- Timers (play, debounce): detener SIEMPRE en el cleanup final antes de cerrar
- Preview: Fit-to-Screen solo en load real o cambio de tab; preservar zoom/pan en otras operaciones
- Slots: escribir SOLO desde Combine/Process, nunca desde selector onChange

### Includes necesarios
```javascript
#include <pjsr/DataType.jsh>
#include <pjsr/SampleType.jsh>
#include <pjsr/StdCursor.jsh>
#include <pjsr/UndoFlag.jsh>
#include <pjsr/PenStyle.jsh>   // necesario para Curves widget
```

---

## 7. Estado Actual

- **Versión:** v131-OPT-rc4 (rollback probe RAM → 1.5 GB fijo)
- **Archivo:** `PI Workflow 2.js` (rama OPT-6d)
- **Estado:** Estable. Budget de memoria fijado a 1.5 GB constante. Todo el código de probe eliminado.
- **Próximas mejoras pendientes:** Probar Star2Net. Etapa 2 VeraLux. MGC H/O/S en producción. Fase B de OPT-MASK. Extracción a módulos por pestaña (refactor mayor).

### v131-OPT-rc4 — Rollback probe RAM → constante 1.5 GB — 2026-05-15

**Motivo:** Todos los métodos de detección de RAM disponible fallaron en esta build de PixInsight:
- `CoreApplication` properties → ninguna expone RAM.
- `console.beginCapture/endCapture/execute` → no son funciones.
- `ExternalProcess.start()` → retorna `false` para todos los ejecutables (powershell, wmic, cmd, rutas absolutas) tanto a nivel de módulo como diferido al constructor del diálogo.

**Cambio aplicado:**
1. Eliminadas funciones: `optParseMemorySizeToBytes`, `optProbeMemoryViaConsole`, `optProbeSystemMemoryBytes`, `optComputeMemoryBudget`, `optInitializeMemoryBudget`.
2. Eliminada flag `OPT_MEMORY_BUDGET_INITIALIZED`.
3. Restaurada constante simple en línea ~108: `var OPT_MEMORY_BUDGET_BYTES = 1.5 * 1024 * 1024 * 1024;`
4. Eliminada la llamada `optInitializeMemoryBudget()` del constructor `PIWorkflowOptDialog`.

**Consumidores no afectados:** `optEnforceMemoryBudget` y `optMemoryPreflight` leen el global directamente — siguen funcionando igual con el valor fijo.

---

### v131-OPT-rc3 — Probe de RAM disponible (REVERTIDO) — 2026-05-14

**Objetivo:** que `OPT_MEMORY_BUDGET_BYTES` se adapte a la RAM **disponible en el momento de lanzar el script** (no la total), en lugar del límite fijo de 1.5 GB.

**Fórmula final usada:** `budget = clamp(0.5 × RAM_disponible, 1.5 GB, 16 GB)`

**Métrica:** memoria DISPONIBLE (free) en el momento del arranque, no total:
- Windows → `FreePhysicalMemory` vía `Get-CimInstance Win32_OperatingSystem` (PowerShell) o `wmic OS get FreePhysicalMemory`
- macOS → `vm_stat` (Pages free + Pages inactive) × pageSize
- Linux → `/proc/meminfo` campo `MemAvailable` (fallback: `MemFree`)

**Recorrido de intentos hasta llegar al estado actual (por si hay que deshacer):**

1. **Intento 1 — Probe vía `CoreApplication` properties.** Falló: `CoreApplication` solo expone `versionBuild` como propiedad numérica en esta build. Las propiedades `availableMemory`, `physicalMemory`, etc. no existen. Dump diagnóstico lo confirmó.

2. **Intento 2 — `ExternalProcess` con `wmic ComputerSystem get TotalPhysicalMemory`.** Falló: `start()` retornó `false`. Sospecha inicial: nombre sin PATH.

3. **Intento 3 — `ExternalProcess` con rutas absolutas (`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`, `C:\Windows\System32\wbem\WMIC.exe`) + fallback `cmd /c ...`.** Falló igualmente: TODOS los `start()` retornaron `false`, incluso para `cmd` que sí funciona en otras partes del script (línea 8028 en el handler de Help).

4. **Diagnóstico clave:** `ExternalProcess.start()` falla a **tiempo de carga del módulo** (top-level `var = ...()`). La llamada de línea 8028 funciona porque está dentro de un onClick handler (runtime, tras inicialización completa de PJSR).

5. **Solución actual (rc3):** se difiere el cómputo del budget al constructor de `PIWorkflowOptDialog`:
   - Top-level: `OPT_MEMORY_BUDGET_BYTES = 1.5 GB` (fallback) + flag `OPT_MEMORY_BUDGET_INITIALIZED = false` + función `optInitializeMemoryBudget()`.
   - Constructor `PIWorkflowOptDialog` línea ~7146: llamada a `optInitializeMemoryBudget()` ANTES de cualquier `new OptImageStore()`.
   - La función llama a `optComputeMemoryBudget()` que invoca `optProbeSystemMemoryBytes()` (la implementación OS-level con PowerShell + wmic + cmd wrap + rutas absolutas).

**Localizaciones para retocar:**
- `optComputeMemoryBudget` — definida en línea ~110-180 aprox. (clamp, fracción 0.5, logging).
- `optProbeSystemMemoryBytes` — definida justo encima, con los 4 attempts en Windows.
- `optInitializeMemoryBudget` + `OPT_MEMORY_BUDGET_INITIALIZED` — definidas en línea ~190.
- Llamada de inicialización — `PIWorkflowOptDialog` constructor línea ~7146.
- Consumidores que leen `OPT_MEMORY_BUDGET_BYTES`: `optEnforceMemoryBudget`, `optMemoryPreflight` (leen el global cada llamada, no copia, así que el cambio post-init se propaga sin más).

**Cómo deshacer / volver a 1.5 GB fijo (plan B):**
1. Eliminar la llamada `optInitializeMemoryBudget();` del constructor.
2. Borrar las tres funciones `optComputeMemoryBudget`, `optProbeSystemMemoryBytes`, `optInitializeMemoryBudget`, y la flag.
3. Restaurar el top-level a: `var OPT_MEMORY_BUDGET_BYTES = 1.5 * 1024 * 1024 * 1024;`

**Alternativas a considerar si el rc3 sigue fallando:**
- **Opción A:** Settings.read/write para que el usuario configure manualmente el budget desde la pestaña Configuration. Cero detección OS, pero requiere UI.
- **Opción B:** Detectar `ExternalProcess` no funcional y limitar el budget a un valor mayor pero fijo (p. ej. 4 GB) basado en alguna heurística simple.
- **Opción C:** Hardcode 0.5 × 16 GB = 8 GB como default si no hay forma de detectar, asumiendo equipo razonable. Mucho más práctico que 1.5 GB en sistemas modernos.

**Próximo paso recomendado:** ejecutar de nuevo. Si rc3 funciona, ver línea `[Memory] Slot budget set to X.XX GB (detected RAM: Y.YY GB via OS probe)` después de las Dependency Checks. Si vuelve a fallar, considerar Opción C como solución pragmática.

**Versión:** OPT_VERSION = "31-opt-6d-rc2" (NO actualizada todavía a rc3 en el archivo; hacerlo cuando se valide).

### v131-OPT-rc2 — Budget de memoria adaptativo a la RAM del equipo — 2026-05-14

**Cambio:** `OPT_MEMORY_BUDGET_BYTES` ya no es una constante fija de 1.5 GB. Se calcula al cargar el script mediante `optComputeMemoryBudget()`:

```
budget = clamp(0.5 * availableRAM, 1.5 GB, 16 GB)
```

- Sondea `CoreApplication.availableMemory`, `physicalMemoryAvailable`, `physicalMemory`, `totalMemory` en ese orden (la propiedad exacta varía entre versiones de PixInsight). Coge la primera que devuelva un valor numérico finito > 0.
- Si ninguna responde, cae al mínimo de 1.5 GB (preserva comportamiento previo).
- Loguea en consola al startup el budget elegido y la fuente detectada.
- Tope superior 16 GB: evita que un diálogo monopolice toda la RAM en workstations grandes.
- Factor 0.5: deja la otra mitad para PixInsight, OS y la imagen activa fuera de slots.

**Versión:** OPT_VERSION = "31-opt-6d-rc2".

### v131-OPT-rc1 — Hardening pre-release tras auditoría profunda — 2026-05-14

**Contexto:** auditoría integral previa a la primera release pública. Foco: gestión de memoria con imágenes multi-GB, robustez de errores, concurrencia.

**Cambios aplicados en `PI Workflow 2.js`:**

1. **Política de memoria al cambiar de tab (mínimo footprint):** Se mantiene `memory.clear()` en `onTabChanged` (línea 11988). Cada tab gestiona memoria efímera; al salir, los slots se liberan. Decisión consciente para minimizar uso de RAM con imágenes grandes.

2. **Smart budget enforcement (#2):**
   - `optEnforceMemoryBudget(dialog, desc, protectedSlot)` ahora acepta un slot protegido explícito `{ manager, index }`.
   - `OptPreviewPane.prototype.storeMemory` reintroduce la llamada al budget enforcement, pasando el slot recién guardado como protegido. Garantiza que un guardado manual del usuario NUNCA se evicta, incluso si supera el budget.
   - Resuelve el conflicto entre v128 (protección insuficiente) y v129 (sin enforcement).

3. **try/finally en `beginCandidate` y `beginCandidateFromFactory` (#3):**
   - Ambas funciones envuelven todo el cuerpo en `try { ... } finally { setBusy(false); }`.
   - Si `optCloneView` o cualquier paso intermedio lanza excepción, `setBusy(false)` se ejecuta SIEMPRE. Resuelve el bloqueo permanente "Working..." cuando un proceso fallaba pronto.

4. **Lock de re-entrancia en `optSafeUi` (#4):**
   - Flag global `OPT_OP_IN_PROGRESS`. Si está activo, optSafeUi muestra warning y retorna sin ejecutar.
   - Cubre todos los handlers UI que pasen por optSafeUi (Preview, To Stretching, To Post, etc.). El usuario impaciente que haga doble click ya no desencadena candidatos huérfanos.

5. **Pre-flight check de memoria (#5):**
   - `optMemoryPreflight(dialog, addedBytes, context)` proyecta uso de slots + bytes nuevos, compara con budget, escribe warning informativo en consola.
   - Llamado desde `storeMemory` antes del store. Da feedback al usuario antes de que el budget enforcement haga eviction.

**Versión:** OPT_VERSION = "31-opt-6d-rc1".

**Pendiente de testing antes de release pública:**
- Probar con imágenes reales de 6000×4000+ en cada tab.
- Verificar que el warning de pre-flight aparece como esperado.
- Comprobar que la re-entrancia funciona (doble-click rápido en Preview).
- Validar que `setBusy(false)` se libera incluso si un proceso falla.

### v130-OPT — Fix integral: Recall de memoria + Set to Current + To Post Processing fallaba — 2026-05-14

**Problema:** En Stretching → Stars, tras guardar dos imágenes stretched en dos slots de memoria, recall del primero + Set to Current + To Post Processing daba error: "There is no committed stretched image available for R+G+B Stars. Use Preview and Set to Current first."

**Root cause:** El flujo recall → Set to Current → To Post depende de que `record.stages` contenga una entrada que empiece por "Stretch" (línea 12137 en `sendActiveToPost`).
- En la rama de memoria de `setToCurrent` (línea 6310-6311), solo se llama a `markStage` si `currentMemoryMeta.stage` es truthy.
- Si el usuario guardó la memoria SIN haber hecho Preview justo antes (p.ej. tras Set to Current previo, o sobre la imagen tal cual), el fallback de `storeMemory` usaba `pendingStage || "Current"` → `meta.stage = "Current"`. Entonces `markStage("Current")` no cumplía el check `indexOf("Stretch") === 0`.
- El problema estaba latente, oculto por la evicción del budget enforcement (v127). Con la persistencia real de slots (v129), salió a la luz.

**Fix integral:**

1. **Nueva helper `optDefaultTabStageLabel(tab)`** que devuelve la etiqueta canónica de etapa para cada tab:
   - `OPT_TAB_PRE` → "Pre Processing (Memory)"
   - `OPT_TAB_STRETCH` → "Stretch (Memory)"
   - `OPT_TAB_POST` → "Post Processing (Memory)"
   - `OPT_TAB_CC` → "Channel Combination (Memory)"

2. **`OptPreviewPane.prototype.setToCurrent` (rama memoria)** — además de marcar `currentMemoryMeta.stage` si existe, AHORA SIEMPRE marca también la etiqueta por defecto del tab. Garantiza que el workflow check posterior (`sendActiveToPost`, etc.) reconozca la imagen como procesada por el tab, independientemente del stage stored en el slot meta.

3. **`OptPreviewPane.prototype.storeMemory` (fallback)** — cuando no hay candidato ni `currentMemoryMeta`, ahora se usa `pendingStage || optDefaultTabStageLabel(this.tab) || "Current"` en lugar de solo `"Current"`. Asegura que slots guardados desde currentView (sin preview previo) ya nazcan con una etapa coherente con el tab.

**Por qué este enfoque:** El stage real (algoritmo concreto: "Stretch STF", "Stretch MAS"...) sigue marcándose si está disponible. La etiqueta por defecto del tab es una red de seguridad para garantizar que las gates de workflow siempre se satisfagan al commitear desde memoria. Cero side-effects en flujos normales (que ya marcaban stage correctamente vía pendingStage).

### v129-OPT — Fix: guardar en slot 2 evictaba slot 1 — 2026-05-14

**Problema:** Al guardar la primera imagen en slot 1 funcionaba bien. Al guardar una segunda imagen en slot 2, el slot 1 desaparecía y solo quedaba el slot 2.

**Root cause:** El fix v128 protegía el slot recién guardado (slot 2) durante `optEnforceMemoryBudget`, pero dejaba el slot 1 desprotegido (`isProtected: (1 === 2) = false`). El budget enforcement lo evictaba como el slot más antiguo no protegido. `optEnforceMemoryBudget` no tiene sentido en `storeMemory`: el usuario guarda manualmente, esa decisión debe respetarse.

**Fix:** Eliminada la llamada a `optEnforceMemoryBudget` de `OptPreviewPane.prototype.storeMemory` por completo. El budget enforcement sigue activo en mask memory store y otros contextos automáticos. Los guardados explícitos del usuario no se evictan.

### v128-OPT — Fix: slot de memoria se evictaba inmediatamente tras guardarlo — 2026-05-14

**Problema:** Al hacer click izquierdo en un botón de memoria tras aplicar MGC o GraXpert, el label del botón aparecía brevemente con el nombre del slot y luego desaparecía, sin guardar nada.

**Root cause:** En `OptPreviewPane.prototype.storeMemory`, después de llamar a `this.memory.store(index, ...)`, se invocaba `optEnforceMemoryBudget`. Como `recalledMemoryIndex = -1` tras `beginCandidate`, ningún slot estaba marcado como protegido. Si el slot recién guardado era el único (o el más antiguo), el LRU lo evictaba de inmediato, reseteando el label del botón al número de slot.

**Fix:** Temporalmente se protege el slot recién guardado durante la llamada a `optEnforceMemoryBudget` asignando `this.recalledMemoryIndex = index`, y se restaura el valor original (`savedRecalledIdx`) al terminar. Cambio mínimo, sin efecto secundario.

```js
// En OptPreviewPane.prototype.storeMemory (línea ~6391):
if (optSafeView(view)) {
   this.memory.store(index, this.currentKey || view.id, view, meta, gradientView);
   var savedRecalledIdx = this.recalledMemoryIndex;
   this.recalledMemoryIndex = index;
   try { optEnforceMemoryBudget(this.dialog, "image memory store"); } catch (eMB) {}
   this.recalledMemoryIndex = savedRecalledIdx;
}
```

### v127-OPT — Desactivación de controles UI para procesos no instalados — 2026-05-14

**Problema:** Los botones y combos de BXT, NXT, GraXpert, VeraLux, SPCC, etc. aparecían activos aunque el proceso no estuviera instalado en PixInsight. El usuario solo descubría la falta de instalación al intentar ejecutar el proceso.

**Root cause:** No había ningún mecanismo que conectase el sistema de detección de dependencias (`optRunDependencyChecks`) con el estado enabled/disabled de los controles UI.

**Fix:** 
- Añadida función `optApplyProcessAvailabilityToUI(dlg)` que detecta la disponibilidad de todos los procesos opcionales y aplica `btn.enabled = false` + tooltip explicativo a los controles afectados.
- Controles cubiertos por la función:
  - **Pre > SPCC** button (`btnPreSPCC`) — deshabilitado si `SpectrophotometricColorCalibration` no está.
  - **Stretch > Star Split** button (`btnCreateStarSplit`) — deshabilitado si `StarXTerminator` no está.
  - **Pre > Gradient Correction** button (`btnPreGradient`) — actualiza enabled al cambiar el combo (MGC/AutoDBE/ABE/GraXpert).
  - **Pre > Deconvolution** button (`btnPreApplyDecon`) — actualiza enabled al cambiar el combo (BXT/Cosmic Clarity).
  - **Post > Noise Reduction** button (`btnPostNR`) — actualiza enabled al cambiar el combo (NXT/TGV/CC/GraXpert).
  - **Post > Sharpening** button (`btnPostSharp`) — actualiza enabled al cambiar el combo (BXT/USM/HDR/LHE/DSE/CC).
  - **Stretch > RGB/STARLESS zone** Preview button — deshabilitado si MAS o VeraLux no están y se seleccionan.
  - **Stretch > STARS zone** Preview button — deshabilitado si VeraLux o MAS no están y se seleccionan.
- Los combos auto-seleccionan el primer algoritmo disponible al inicio si el ítem por defecto no está instalado.
- Llamada añadida al final de `PIWorkflowOptDialog.prototype.runDependencyChecks()` (ya se ejecuta al final del constructor y también al refrescar desde el panel de configuración).
- Añadido `name` property a los botones que necesitaban ser referenciados: `btnPreGradient`, `btnPreSPCC`, `btnPostNR`, `btnPostSharp`.

**Regla nueva:** Al añadir nuevas secciones de proceso que dependan de plugins opcionales, añadir el campo `name` al spec del botón en `addProcessSection` y registrar la disponibilidad en `optApplyProcessAvailabilityToUI`.

### v126-OPT — Hard includes para GraXpert y VeraLux + limpieza de funciones obsoletas — 2026-05-05

**Problema:** Tras añadir `#include <../src/scripts/Toolbox/GraXpertLib.jsh>` (hard include), el preprocessor PI expandió `GRAXPERT_SCRIPT_CONFIG` a la expresión de ruta completa en todo el script, incluyendo dentro de `optEnsureGraXpertScriptConfig()` donde aparecía como LHS de una asignación → `ReferenceError: invalid assignment left-hand side`.

**Root cause:** `GraXpertLib.jsh` define `GRAXPERT_SCRIPT_CONFIG` como macro de preprocessor (`#define`). Al incluirlo en tiempo de compilación, el preprocessor PI reemplaza TODAS las ocurrencias del identificador en el script, incluyendo las asignaciones `GRAXPERT_SCRIPT_CONFIG = detectedName` que eran válidas cuando era una variable JS pero ahora generan código inválido.

**Fix — funciones eliminadas (orphans creados por el cambio):**
- `optEnsureGraXpertScriptConfig()` — función completa eliminada (intentaba setear `GRAXPERT_SCRIPT_CONFIG` como variable JS)
- Llamadas a `optEnsureGraXpertScriptConfig()`: eliminadas del nivel de módulo y de `optRunGraXpertWorkflow()`
- `optDetectGraXpertScriptConfigName()` — eliminada (quedó sin callers)
- `optGraXpertMainScriptCandidatePaths()` — eliminada (quedó sin callers al eliminar la anterior)
- Loop `configNames` en `optRunGraXpertWorkflow()` — eliminado (intentaba `GRAXPERT_SCRIPT_CONFIG = cfgName`)
- Predefined macro `GRAXPERT_SCRIPT_CONFIG` en `optEnsureGraXpertLibLoaded()` — eliminado

**Fix — `optEnsureGraXpertLibLoaded()` simplificado:**
- Sin llamada a `optEnsureGraXpertScriptConfig()`
- Sin dict `predefinedMacros` (macros ya definidas por el hard include)
- El `typeof GraXpertLib !== "undefined"` short-circuits a `true` inmediatamente al startup

**Regla nueva — hard includes para dependencias con macros de preprocessor:**
- Si una dependencia usa `#define`/`#ifeq` en su `.jsh`, usar SIEMPRE `#include` hard en el script principal.
- El cargador dinámico (`optTryLoadOptionalScript`) NO es adecuado para archivos `.jsh` que mezclan macros de preprocessor con código JS.
- Nunca asignar a un identificador que pueda ser una macro de preprocessor de un include.

### v125-OPT — Fix GraXpert path + VeraLux not found — 2026-05-05

**Problema 1 — GraXpert: "does not have an executable path configured"**
- **Root cause:** `optPreprocessOptionalScriptText` no manejaba `#ifeq __PI_PLATFORM__` / `#endif`. Al cargar `GraXpertLib.jsh` vía eval, las tres definiciones de `GRAXPERT_SCRPT_DIR` (macOS, Windows, Linux) se procesaban sin saltar las no aplicables. La última (`LINUX`) ganaba → `hasGraXpertPath()` buscaba el archivo en la ruta Linux, nunca lo encontraba en Windows.
- **Fix:** `optPreprocessOptionalScriptText` reescrita con:
  - Detección de plataforma en runtime (`File.homeDirectory.charAt(1) === ":"` → MSWINDOWS)
  - Manejo de `#ifeq` / `#ifndef` / `#ifdef` / `#endif` con `skipDepth` counter
  - Inicialización de `macros` con `__PI_PLATFORM__` = plataforma detectada
  - Expansión multi-pass (4 iteraciones) para resolver referencias anidadas como `GRAXPERT_PATH_CONFIG → GRAXPERT_SCRPT_DIR + "/GraXpertPath.txt"`

**Problema 2 — VeraLux: "not available from a standard installed script path"**
- **Root cause:** `optVeraLuxCandidatePaths()` solo buscaba en directorios de instalación de PixInsight (`C:/Program Files/PixInsight/src/scripts/...`). VeraLux_lib.js vive en `../All scripts to learn/VeraLux_lib.js` relativo al script OPT, ruta no incluida en los candidatos.
- **Fix 1:** `OPT_SCRIPT_DIR` capturado vía `#__FILE__` (preprocessor PI en compile-time): `var OPT_SCRIPT_DIR = (function() { var f = "#__FILE__"; ... })();`
- **Fix 2:** `optVeraLuxCandidatePaths()` añade `parentDir + "/All scripts to learn/VeraLux_lib.js"` (y variantes) como candidatos adicionales al final.

**Regla nueva — preprocessor dinámico:**
- `optPreprocessOptionalScriptText` soporta `#ifeq`/`#ifdef`/`#ifndef`/`#endif` con skip depth correcto.
- La variable `__PI_PLATFORM__` se inyecta automáticamente en el dict de macros.
- La expansión se hace en múltiples pasadas para resolver macros anidadas.

### v124-OPT — Mejoras UI: Set to Current state, orden Pre-processing, altura headers — 2026-05-04

**Cambio 1 — Set to Current: estado visual y bloqueo tras aplicar**
- `OPT_CSS_SET_CURRENT` ampliado con regla `QPushButton:disabled` (gris apagado cuando no hay candidato).
- `OPT_CSS_SET_CURRENT_APPLIED`: nuevo estilo verde success (`OPT_UI.successBg / OPT_UI.success`) con regla `:disabled` para que el color verde persista aunque el botón esté deshabilitado.
- Flujo: `beginCandidate()` → botón activo (ámbar); `setToCurrent()` → botón deshabilitado verde; `activate()` → botón deshabilitado gris.
- AutoTest: nuevas assertions sobre `btnSetCurrent.enabled` en Pre, Stretch y Post.

**Cambio 2 — Pre-processing: Color Calibration movida entre Gradient Correction y Deconvolution**
- Nuevo orden: Plate Solving → Gradient Correction → **Color Calibration** → Deconvolution → RGB Geometric Correction.
- AutoTest: verifica que `idxColorCal < idxDecon` en `preTab.sections`.

**Cambio 3 — Altura fija en headers de sección**
- `optSection()`: `header.minHeight = 30; header.maxHeight = 30;` — el header no crece con el diálogo.
- `label.minHeight = 22; label.maxHeight = 24;` — la etiqueta se mantiene compacta.
- Se aplica a todos los `optSection()` del script (Pre, Stretch, Post, CC y Stretch zones).

### v121 — OPT-MASK: hot path de máscaras Post sin bucles JS por píxel — 2026-04-28

**Problema:** `buildPostRangeMaskImage` y `buildPostColorMaskImage` ejecutaban dobles bucles JS con `srcImg.sample(x,y,c)` por cada píxel → W×H×3 llamadas PJSR (costosas) por cada refresh del live preview al mover sliders.

**Root cause:** Sin caché de datos de píxeles intermedios, cada cambio de threshold relanzaba el cálculo completo incluyendo la extracción de canales. Para una imagen fast-source de 720px (~518K píxeles) = ~1.5M llamadas PJSR por frame.

**Fix:**
- `_postMaskCache`: estructura con `Float32Array` para luminancia, brillo, hue y saturación
- `ensurePostMaskCache(fastView)`: extrae todos los canales en **3 llamadas** `getSamples()` bulk (no per-pixel). Computa los 4 mapas intermedios en un único bucle JS. Se reutiliza mientras no cambie `postMaskFastSourceId`.
- `buildPostRangeMaskImage`: fast path usa `outArr = Float32Array(n)` + aritmética de array sin llamadas PJSR. Cae al slow path si cache no aplica (e.g. máscara full-res en Apply).
- `buildPostColorMaskImage`: ídem con `c.hue` y `c.sat` del cache.
- `releasePostMaskFastPreviewSource` invalida el cache atómicamente.
- Eliminadas 5 copias `new Bitmap(bmp)` innecesarias en paths de preview Post/Stretch; reemplazadas por `setWorkflowPreviewBitmap(..., { exclusive: false })`.

**Speedup esperado:** ~20-50x en la parte de computación de máscara (3 bulk calls en vez de ~1.5M calls PJSR).

**Nuevas reglas:**
- Cache `_postMaskCache` es válido SOLO mientras `sourceId === postMaskFastSourceId`. Invalidar siempre en `releasePostMaskFastPreviewSource`.
- Slow fallback (`_buildPostRangeMaskImageSlow`, `_buildPostColorMaskImageSlow`) se usa automáticamente cuando la vista full-res no coincide con la fast source.
- `setWorkflowPreviewBitmap` con `exclusive: false` NO copia el bitmap — úsalo cuando el bitmap es freshly created por `renderDirectBitmapFromView` / `renderSmartPreviewBitmapFromView`.

### v123 — Overlay inlining (Propuesta 5 Paso 2) — 2026-04-28

**Cambio estructural:** las funciones de overlay post-construcción (`applyV99Architecture` ~1380 líneas, `applyPiWorkflowFixPack` ~440 líneas) se han movido como IIFEs dentro del constructor `MasterDialog`, exactamente en la posición donde antes se llamaba `ArchitectureOverlayIntegrator.applyAll(this)`.

**Patrón aplicado:**
```javascript
// [v123 INLINE] V99 architecture overrides
(function(dlg) {
    // ...cuerpo completo de applyV99Architecture sin idempotency guard...
})(this);

// [v123 INLINE] CC/UI fix pack overrides
(function(dlg) {
    // ...cuerpo completo de applyPiWorkflowFixPack sin idempotency guard...
})(this);
```

**Eliminado:**
- `var ArchitectureOverlayIntegrator = {...}` (wrapper de un solo call site)
- `function applyV99Architecture(dlg) {...}` declaración
- `function applyPiWorkflowFixPack(dlg) {...}` declaración
- Flags vestigiales: `__v99ArchitectureApplied`, `__piWorkflowFixPackApplied`, `__architectureOverlayIntegratorApplied` (las IIFEs corren exactamente una vez como parte del constructor)
- Banner separators "V99 OVERRIDES" y "FIX PACK"

**Por qué es seguro:**
- La posición de ejecución se preserva exactamente (mismo punto del constructor)
- El binding `dlg → this` se preserva vía parámetro IIFE
- Los helpers locales de cada función (`v99GetModeForPath`, `v99GetRowView`, etc.) quedan correctamente encapsulados dentro de su IIFE — sin colisiones cross-block
- El cierre léxico (closure scope) sobre el constructor es el mismo que la function expression tenía con `dlg` como parámetro

**Resultado:** archivo termina ahora en `function main()`, no en una capa de 1870 líneas de parches. Comportamiento del diálogo definido linealmente en un solo flujo de constructor.

**NO incluido (refactor mayor pendiente):** extracción a módulos por pestaña (PreTabController, StretchTabController, PostTabController, CcTabController). Requiere resolver dependencias cross-tab que actualmente se expresan como secuencia de overrides.

**Regla nueva:** si añades comportamiento de inicialización post-UI, hazlo dentro del propio constructor (no crees nuevas funciones de overlay).

### v122 — Dead code cleanup (Propuesta 5 Paso 1) — 2026-04-28

**Eliminado:**
- `this.preBarBalance = null` — siempre fue null, todas sus ramas eran no-ops
- Rama "channel balance" de `resolvePreSectionBarFromStage` — siempre devolvía null (preBarBalance = null)
- Campo `balance` de `preSectionsVisited` — escrito, nunca leído
- Reset `preSectionsVisited.balance = false` en reset de workflow
- `if (this.preBarBalance) this.preBarBalance.setExpanded(...)` en applyV99Architecture
- `makeConfigPlaceholder` función local + `cfgStretchGroup` / `cfgPostGroup` (GroupBoxes "Reserved area for future..." sin lógica ni persistencia)
- `this.architectureOverlayIntegrator = ArchitectureOverlayIntegrator` (propiedad asignada pero nunca leída; call sites usan `ArchitectureOverlayIntegrator.applyAll` directamente)
- Comentarios obsoletos de preBarBalance en el código

**NO implementado (Paso 2 — demasiado riesgo):**
- Consolidar `applyV99Architecture` / `applyPiWorkflowFixPack` en el constructor (~1870 líneas de overrides post-UI con dependencias de ordering no verificables)
- Migrar compat accessors de `workflowState` a autoridad directa

**Regla nueva:** `applyV99Architecture` y `applyPiWorkflowFixPack` son seams de post-construcción intencionales. NO moverlos al constructor sin auditoría completa de ordering.

### v121-GPT: Cambios estructurales v24GPT → v26GPT (implementados con Codex/GPT-5.5)

**v24GPT — PreviewScheduler unificado:**
- `PreviewScheduler` centraliza timing y re-entrancy de todos los live previews (throttleMs, latestWins, dropIfBusy, statusLabel)
- Eliminados timers ad-hoc: `preChannelBalanceTimer`, `postCurvesPreviewBusy/Pending/LastMS`, etc.
- `schedulePostCurvesPreviewAfterDrag` migrado al scheduler
- Resolution factor helpers para CC y DOC tabs (`ccPreviewResolutionFactor`, `docPreviewResolutionFactor`, `sharedPreviewResolutionFactor`)
- `docComboPreviewResolution` control en tab Stars CC

**v25GPT — stretchCommitState refactorizado:**
- `stretchCommittedDescriptors` → `stretchCommitState` (objetos estado completos por zona)
- `getStretchParamsHash(algorithmId, params, sourceId, pathKey)` — hash para invalidación basada en parámetros
- `createEmptyStretchCommitState`, `getStretchCommitState`, `invalidateStretchCommitState`, `closeStretchCommitViewIfOwned`, `syncLegacyStretchCommitAliases`
- Eliminada dependencia de descriptores planos; el hash permite detectar si un commit sigue siendo válido sin re-ejecutar el stretch

**v26GPT — WorkflowBitmapLifecycle + transient registry:**
- `WorkflowBitmapLifecycle.setPreviewBitmap(control, bitmap, options)`: capa de lifecycle para bitmaps de preview. `exclusive: true` hace copia; `exclusive: false` (default) pasa referencia directa
- `cloneViewWithMetadata` ampliado con parámetros `owner`, `slot`, `kind`
- `registerWorkflowTransient / replaceWorkflowTransient / releaseWorkflowOwner / releaseWorkflowKind / pinWorkflowPersistent / unregisterWorkflowTransient` — registro centralizado de vistas transient del workflow
- `setWorkflowPreviewBitmap(control, bitmap, options)` wrapper global
- `releasePostMaskFastPreviewSource` promovida a método `this.` del diálogo

### v120 — Fix "Reduce Prev. Resol." pierde valor al cambiar de pestaña — 2026-04-27

**Bug:** El factor seleccionado manualmente en el combo "Reduce Prev. Resol." del tab Pre se reseteaba visualmente (y potencialmente en valor) al cambiar de pestaña y volver.

**Root cause:** PJSR/Qt puede resetear el `currentItem` de un ComboBox a 0 durante el ciclo hide/show de un tab page. Si el reset dispara `onItemSelected(0)` antes de que el guard `__suspendPrePreviewResolutionSync` esté activo, el handler sobreescribe `prePreviewResolutionFactor = 1` y `prePreviewResolutionUserSet = true` (con el valor incorrecto). El flag `prePreviewResolutionUserSet` permanecía `true` pero con factor 1, haciendo que la próxima llamada a `ensurePrePreviewResolutionFactor` devolviera el factor corrompido.

**Fix:** En el handler `onPageSelected` activo (línea ~25511), bloque `index === dlg.tabIndexPre`, se añade una re-sincronización del combo con el guard activo justo antes del `fitToWindow()`. Si `prePreviewResolutionUserSet === true` y `prePreviewResolutionFactor >= 1`, se llama a `setPreviewResolutionComboFactor` envuelto en `__suspendPrePreviewResolutionSync = true/false`. Esto garantiza que el combo siempre muestre el factor guardado al volver al tab Pre, sin disparar el handler.

**Ubicación:** `onPageSelected` override (línea ~25511) — bloque `if (index === dlg.tabIndexPre)`.

### v119 — Fix SPCC/ALF "Set to Current" revierte visualmente — 2026-04-27

**Bug:** Al aplicar SPCC o Auto Linear Fit en modo RGB y pulsar "Set to Current", el preview parecía revertir a la imagen sin calibración de color.

**Root cause:** Las funciones `applySPCCCandidateForWorkflow` y `applyALFCandidateForWorkflow` (CANDIDATE pattern) calculan correctamente la vista calibrada y la muestran usando `renderPreDisplayViews(..., "CANDIDATE", -1, true)` — con `useLinkedSTF = true` (linked AutoSTF preserva las proporciones entre canales → color correcto visible). Sin embargo, cuando "Set to Current" promueve el candidato a Current y llama a `showPreCurrentRGB()`, este usa AutoSTF por canal independiente. El AutoSTF por canal normaliza cada canal de forma independiente → elimina visualmente el balance de color calibrado → el resultado parece idéntico a la imagen sin SPCC/ALF aunque los datos son correctos.

**Fix:** En `commitDisplayedPreviewToCurrent`, antes de llamar a `showPreCurrentRGB()` en el path RGB, si el stage comprometido es de calibración de color (contiene "SPCC", "Linear Fit", "Color Calibration" o "Background Neutralization"), se establece `dlg.preUseLinkedSTFForRGB = true`. Esto hace que `showPreCurrentRGB()` → `renderPreDisplayViews` use linked AutoSTF, preservando la apariencia calibrada.

**Nota:** Los datos SIEMPRE fueron correctos. Solo el render del preview post-commit usaba STF por canal, que es inadecuado para calibración de color. `preUseLinkedSTFForRGB` se resetea a false cuando el usuario carga una nueva imagen.

**Ubicación:** `commitDisplayedPreviewToCurrent` → bloque `if (commitKind === "RGB")`, justo antes de `dlg.showPreCurrentRGB()`.

### v118 — MGC soporte narrowband (H/O/S) — 2026-04-27

**Feature: MGC con canales narrowband Ha/OIII/SII**
- Eliminado el guard que bloqueaba MGC para canales H, O, S
- Añadido `NB_MARS_FILTER_MAP = { "H": "Ha", "O": "OIII", "S": "SII" }` (global)
- En `applyMGCParameters`: si `getEffectivePrePathKey(dlg)` es H/O/S, se asigna `mgc.grayMARSFilter` al filtro MARS correspondiente ("Ha", "OIII", "SII")
- MARS SÍ contiene datos fotométricos para filtros narrowband — el error anterior era que se usaba "L" (luminance) o no se especificaba el filtro
- El canal se detecta vía `_preActiveTickKey` (mismo mecanismo que los section ticks)

### v117 — Tab ticks per-imagen + MGC narrowband guard + AutoDBE RGB fix — 2026-04-27

**Feature: Tab ticks per-imagen (✓ en labels de pestaña)**
- `dlg._tabProgress = { pathKey: { pre, stretch, post, cc, doc } }` — almacena progreso por imagen/pathKey
- `getEffectivePrePathKey(dlg)` — devuelve `dlg._preActiveTickKey`, que se guarda EXPLÍCITAMENTE en cada click de botón. Ya no infiere desde `preWorkflowMode` / `preActiveUnifiedPathKey` (que tienen demasiados estados compartidos). `_preActiveTickKey` se asigna en: (1) el wrapper `activateWorkflowPathInPre` ANTES de llamar al original, y (2) `handlePreChannelTool` ANTES de llamar a `showPreCurrentSlot`. Así el pathKey siempre refleja exactamente el último botón que pulsó el usuario.
- `updateTabTicksFromCurrentState(dlg)` — recalcula los 6 tabs leyendo el pathKey activo de CADA tab de forma independiente. Usa `getEffectivePrePathKey` para el tab Pre.
- `markTabProgress(dlg, pathKey, stage)` — marca un stage como completado y llama a refresh
- Hooks actualizados para usar `getEffectivePrePathKey`: Pre "Set to Current", plate solve (4 ubicaciones)
- `activateWorkflowPathInPre/Stretch/Post` wrappers llaman `updateTabTicksFromCurrentState(dlg)`
- `tabs.onPageSelected` refresca ticks al cambiar de pestaña manualmente
- **Bug adicional (root cause real):** El botón H/O/S/R/G/B del panel izquierdo llama a `handlePreChannelTool(slotName)` → `showPreCurrentSlot(slotName)` / `showPreChannelSlot(slotName)`. Estas funciones actualizan `preSeparateCurrentSlot` pero NUNCA llamaban a `updateTabTicksFromCurrentState` → los ticks del pathKey anterior quedaban congelados en pantalla. **Fix:** añadido `try { updateTabTicksFromCurrentState(dlg); } catch(e) {}` al final de AMBAS funciones `showPreCurrentSlot` (línea ~15095) y `showPreChannelSlot` (línea ~12813).
- **Regla:** Cualquier función que cambie el canal activo (`preSeparateCurrentSlot`) DEBE llamar a `updateTabTicksFromCurrentState` al finalizar.

**Bug fix: MGC falla en canales narrowband**
- **Error:** `No reference data found for filter 'R'` al aplicar MGC a canal H/O/S
- **Root cause:** MARS database solo tiene datos fotométricos broadband (B,V,R,I). Los canales narrowband nunca tienen referencia.
- **Fix:** Guard antes de ejecutar MGC: si `activePathKey` es "H", "O" o "S" → lanza error descriptivo sugiriendo AutoDBE/ABE.
- Ubicación: líneas ~7096-7114

**Bug fix: AutoDBE "channel index out of range" en imagen RGB**
- **Error:** `Image.sample(): channel index out of range` al aplicar AutoDBE a imagen RGB
- **Root cause:** `AutoDBE.js` del sistema sobrescribe `sourceImage` con `ImageWindow.activeWindow.mainView.image`. La llamada a `show()/bringToFront()` estaba solo dentro del bloque `isMono` → para RGB la ventana activa podía ser otra.
- **Fix:** Movido `workView.window.show(); workView.window.bringToFront();` fuera del bloque `isMono` para que aplique a todas las imágenes.
- Ubicación: línea ~7042

### v116 — Scripts del sistema + fixes mono para AutoDBE y GraXpert — 2026-04-21

**AutoDBE → sistema:**
- `#include "All scripts to learn/AutoDBE.js"` reemplazado por `#include <../src/scripts/AutoDBE.js>`
- El sistema AutoDBE.js no tiene guard `#ifndef __PI_WORKFLOW_LIBRARY_INCLUDE__` → su `main()` llamaba a PI Workflow's `main()` por hoisting (último gana en SpiderMonkey) abriendo el diálogo demasiado pronto
- **Fix:** `#define main __piw_adbe_main__` antes del include + `#undef main` después + `function __piw_adbe_main__() {}` no-op. El preprocesador renombra toda referencia a `main` en AutoDBE.js; la declaración no-op (posterior en source) gana el hoisting.

**VeraLux → sistema:**
- Creado `All scripts to learn/VeraLux_lib.js` — wrapper del engine (sin GUI ni `main()`) para evitar que `verlux.js` lance su diálogo standalone al ser incluido
- `#define __PI_WORKFLOW_VERALUX_EXTERNAL__` + `#include "All scripts to learn/VeraLux_lib.js"` en el bloque de includes
- Los 4 bloques inline (`VeraLuxCore`, `applyAdaptiveScaling`, `applySoftClip`, `processVeraLux`) envueltos con `#ifndef __PI_WORKFLOW_VERALUX_EXTERNAL__` / `#endif` marcados con `// STAGE 2: delete this block`
- Etapa 2 pendiente: borrar los 3 bloques `#ifndef` una vez confirmado en producción

**AutoDBE mono fix (sistema):**
- Bug en sistema AutoDBE.js: `executeGradientDescent` sobrescribe `sourceImage` con `ImageWindow.activeWindow.mainView.image` en vez de usar `targetView.image`
- El clone RGB temporal se ocultaba (`tempWin.hide()`) → ventana activa seguía siendo la mono original → `channels=3` pero imagen mono → crash
- **Fix:** `tempWin.show() + tempWin.bringToFront()` antes de `executeGradientDescent` para que el clone RGB sea la ventana activa

**GraXpert mono fix:**
- `GraXpertLib.jsh` también accede a canales RGB internamente → mismo crash en imágenes mono
- **Fix:** mismo patrón que AutoDBE: clone RGB temporal → GraXpert con `replaceTarget:true` → copiar canal 0 corregido de vuelta → cerrar clone
- Usa `new Image()` + `ImageOp_Mov` + `image.assign()` (patrón correcto de PJSR)

### v115 — CC botones encima del preview + Set to Current tras curves — 2026-04-20
- **Cambio 1 (layout):** `rowTestBtns` (Set to Current + Export) movido desde después de las curves hasta ANTES del preview (~línea 5021). Nuevo orden del `rightPanel.sizer`: path buttons → status label → **[Set to Current] [Export]** → preview → curves → snapshots → status. Consistente con Stretching y Post Processing.
- **Cambio 2 (Export style):** `btnTestExport` ahora usa `CSS_DARK_TOOL_BUTTON` para consistencia visual con botones utilitarios de otras pestañas.
- **Set to Current tras curves:** Ya funcionaba correctamente. El flujo es: `onMouseRelease` → `queueTestPreviewUpdate` → 150ms debounce → `refreshTestPreview` → `updateCcActionStates` → `btnCcSetCurrent.enabled = !!(testCurrentResultView && !testCurrentResultView.isNull)`. El botón se activa siempre que haya un resultado compuesto válido.

### v114 — Limpieza imágenes residuales + CC histogram drag — 2026-04-20
- **Problema 1 (imágenes residuales):** Al cerrar el script quedaban en memoria: `Background_Model_image`, `Extracted_Background`, `Stretch_Previous_*`, `Committed_Preview_*`, `Committed_FullRes_*`, `Post_STARLESS_Path`, `Post_STARS_Path`, `Post_RGB_Path`. Ninguno estaba en `INTERNAL_VIEW_PREFIXES` → `closeAllInternalWorkflowWindows` no los cerraba.
- **Fix 1:** Añadidos 8 nuevos prefijos a `INTERNAL_VIEW_PREFIXES` (~línea 6970): `"Committed_Preview_"`, `"Committed_FullRes_"`, `"Post_RGB_Path"`, `"Post_STARLESS_Path"`, `"Post_STARS_Path"`, `"Stretch_Previous"`, `"Background_Model"`, `"Extracted_Background"`. Las imágenes `Final_RGB` y `Final_STARS` se preservan correctamente por `shouldPreserveVisibleWindowId` (prefijo `"Final_"`).
- **Regla nueva:** Cada vez que se crea una vista temporal con nombre nuevo, verificar que su prefijo esté en `INTERNAL_VIEW_PREFIXES`.
- **Problema 2 (CC histogram drag):** En `testCurvesWidget.onMouseMove`, el bloque de Live preview throttle (30ms) disparaba `queueTestPreviewUpdate` durante el drag → procesado pesado de imagen bloqueaba el hilo UI → el punto no se podía mover.
- **Fix 2:** Eliminado el bloque Live throttle de `onMouseMove` (~línea 5204-5211). Ahora el drag solo llama `repaint()` (instantáneo). En `onMouseRelease`, `queueTestPreviewUpdate` se dispara siempre (eliminada la condición `chkLive.checked`) → el debounce interno de 150ms proporciona el "esperar un poco antes de aplicar".
- **Problema 3 (Set to Current solo activo en último slot):** Root cause: `storeCurrentPreAsSnapshot` usaba lazy promotion — guardaba solo `promotionViewId` (el ID de la vista candidata). Cuando se aplicaba una nueva corrección, `clearPreCandidateViews(true)` cerraba esa vista. El recall posterior llamaba `View.viewById(promotionViewId)` → null → `preDisplayedMainView = null` → botón desactivado.
- **Fix 3:** `storeCurrentPreAsSnapshot` (~línea 13552) ahora hace eager clone: inmediatamente crea `cloneViewWithMetadata` e inyecta el resultado directamente en `slot.viewRef` con `promotionViewId = null`. Cada slot posee su propia vista independiente que no se ve afectada por ciclos de vida futuros del candidato. La condición de habilitación del botón `preDisplayRole === "MEMORY" && preDisplayedMainView && !preDisplayedMainView.isNull` ya era correcta — solo faltaba que la vista sobreviviera.

### v101 — Separate Stars dual-method — 2026-04-19
- **Cambio:** El botón único "Generate Starless / Stars (SXT)" reemplazado por:
  - `ComboBox` (`dlg.comboSeparateMethod`): ítems "SXT (StarXTerminator)" [0] y "Star2Net" [1]
  - Botón renombrado a "Separate Stars"
- **SXT path (item 0):** lógica existente sin cambios
- **Star2Net path (item 1):** `StarNet2` con parámetros fijos:
  `stride=defStride, mask=true, linear=true, upsample=false, shadows_clipping=-2.80, target_background=0.15`
- **Detección de starsWin:** misma lógica diff de ventanas que SXT (funciona si Star2Net crea ventana nueva)
- **Mensajes de status:** usan `methodName` ("SXT" o "Star2Net") para distinguir en consola y UI
- **Archivos tocados:** líneas 14662-14687, 15664-15800, 15864, 16257

### v104 — Recipe buttons + NB source visibility — 2026-04-19
- **Recipe buttons:** CSS explícita `CSS_BTN_RECIPE_V2` / `CSS_BTN_RECIPE_SELECTED_V2` con bordes visibles; `stretch=1` para distribución equitativa 4 por fila; `spacing=6` en row y panel; `updateNarrowbandRecipeTileSelection` usa las nuevas constantes CSS
- **NB source visibility:** Ha/OIII/SII envueltos en `nbRowHaCtrl`, `nbRowOiiiCtrl`, `nbRowSiiCtrl` (Control containers). Mapa `NB_RECIPE_NEEDS` define qué canales necesita cada receta. `updateNbSourcesForRecipe(recipe)` oculta/muestra containers via `.visible`. Llamado en `selectNarrowbandRecipe` y en startup. Recetas de 2 canales: HOO/OHH (no S), OSS (no H), HSS (no O)

### v103 — Log panel en StatusBar — 2026-04-19
- **Cambio:** `buildStatusBar_v2` rediseñado con `VerticalSizer`: fila superior (etiqueta + pills) + `TextBox` (readOnly) debajo
- **Bridge:** `installConsoleToStatusBarBridge(dlg)` envuelve `console.writeln/warningln/criticalln` → los mensajes aparecen también en el TextBox del log
- **Rolling buffer:** máximo 300 líneas; al superar, se recorta a las últimas 200
- **Crecimiento:** `mainSizer.add(this.tabs, 4)` + `mainSizer.add(statusBarV2, 1)` → el log crece 1/5 del espacio extra vertical cuando se agranda la ventana
- **Regla nueva:** Todo `console.writeln/warningln/criticalln` posterior al `installConsoleToStatusBarBridge` queda automáticamente visible en el log panel

### v102 — Progress bar variable + BN botón + Recipe buttons compactos — 2026-04-19
- **Progress bar (1):** Barras de progreso con alturas variables [5,8,12,17] px → efecto de gráfica de barras creciente
- **Progress bar (2):** Cargar imagen en Pre-processing = paso 1 (`selectCurrentPreProcessingView` → `_workflowProgress ≥ 1`). Navegación de tabs: Stretch→2, Post→3, Combine→4 (antes 1,2,3)
- **Recipe Selector:** Eliminado `maxWidth=20` y factor stretch `1` de cada botón; añadido `addStretch()` al final de cada fila → botones tamaño natural sin expansión
- **Background Neutralization:** Eliminado checkbox `chkPreColorCalNeutralizeBackground`; añadido botón `btnPreBgNeutralization` DESPUÉS de ALF. El botón busca la región 50×50 más oscura (scan downsampled con `step=round(min(W,H)/60)`), asigna ROI y ejecuta `BackgroundNeutralization` con los parámetros fijos del usuario (`RescaleAsNeeded`, `targetBackground=0.001`, `backgroundHigh=0.1`)
- **Constante huérfana:** `PRE_SETTINGS_KEY_COLORCAL_NEUTRALIZE_BACKGROUND` (línea 431) queda sin usar — no eliminada por regla de código preexistente

### v113 — Cosmic Clarity integrado sin modificar ni copiar CosmicClarity_SASpro.js — 2026-04-20
- **Enfoque correcto:** CC usa `ExternalProcess` + archivos FITS temporales internamente. Toda la integración se reimplementa de forma autocontenida en PI Workflow, sin ninguna copia ni modificación del archivo original.
- **Funciones añadidas** (prefijo `_piw_cc_` para evitar colisiones): `_piw_cc_normalizePath`, `_piw_cc_saveViewToFITS`, `_piw_cc_buildArgs`, `_piw_cc_runCLI`, `_piw_cc_waitForFile`, `_piw_cc_applyOutputToView`.
- **`runCosmicClarityOnView(view, params, label)`:** (1) guarda view como FITS en `%TEMP%/PIWorkflow_CC/`; (2) construye args CLI; (3) intenta launchers en orden: `setiastrosuitepro`, `py -3 -m setiastro.saspro` (Win) / `python3 -m setiastro.saspro`, `python -m setiastro.saspro`; (4) espera el FITS de salida (timeout 5 min); (5) aplica mediante PixelMath `iif(out==0, $T, out)` para preservar píxeles donde CC devuelve 0; (6) limpia archivos temporales en bloque finally.
- **`isCosmicClarityAvailable()`:** Simplificado — verifica que `ExternalProcess` esté definido (siempre true en PI moderno). El error real aparece con mensaje claro si `setiastrosuitepro` no está en el PATH.
- **Eliminado:** `#include "All scripts to learn/CosmicClarity_SASpro.js"` y la copia local del archivo. El script original en `C:\Program Files\PixInsight\src\scripts\` no se toca en ningún momento.
- **Distribución:** PI Workflow puede distribuirse sin ningún archivo adicional de CC. Los usuarios solo necesitan tener SetiAstro Suite Pro instalado con `setiastrosuitepro` accesible en el PATH.

### v112 — Cosmic Clarity integrado via #include (igual que AutoDBE) — 2026-04-20
- **Diagnóstico correcto:** Cosmic Clarity NO usa el proceso `Script` de PixInsight. Usa `ExternalProcess` para llamar al CLI de SASpro con archivos FITS temporales. La integración correcta es `#include`, exactamente como AutoDBE.
- **Archivo de biblioteca:** Copia local en `All scripts to learn/CosmicClarity_SASpro.js` con dos modificaciones mínimas: (1) `#define VERSION "v1.4"` → `#define CC_LIB_VERSION "v1.4"` con `#ifndef VERSION` guard para evitar conflictos; (2) bloque de entrada (líneas 2661-2696: console.show, dialog, ejecución) envuelto en `#ifndef __PI_WORKFLOW_LIBRARY_INCLUDE__` ... `#endif`.
- **Inclusión:** Añadido `#include "All scripts to learn/CosmicClarity_SASpro.js"` justo después del include de AutoDBE. El `#define __PI_WORKFLOW_LIBRARY_INCLUDE__` ya existía, suprime el entry point de CC automáticamente.
- **`runCosmicClarityOnView(view, params, label)`:** Reescrito para poblar `SetiAstroSharpParameters` directamente (processMode, useGPU, removeAberrationFirst, sharpeningMode, stellarAmount, nonStellarStrength, nonStellarAmount, denoiseLuma, denoiseColor, denoiseMode, denoiseModel) y luego llamar `runCosmicClarityViaSasproCLI(targetView)`.
- **`isCosmicClarityAvailable()`:** Verifica que `runCosmicClarityViaSasproCLI` y `SetiAstroSharpParameters` estén definidos.
- **UI restaurada:** Todos los GroupBox de CC (Pre Deconvolution, Post Sharpening, Post NR) tienen controles de parámetros completos de nuevo (sliders, combos, checkboxes). Los modos de texto CC exactos de la API: "Both" / "Stellar Only" / "Non-Stellar Only" (con espacio y mayúsculas correctas); denoiseMode: "full" / "luminance"; denoiseModel: "Walking Noise" / "Standard".
- **Regla nueva:** Herramientas de terceros como CC que usen `ExternalProcess` internamente pueden integrarse con `#include` + guards, igual que AutoDBE.

### v111 — Cosmic Clarity via process icon (fix recursion error) — 2026-04-20
- **Error:** "Attempt to execute a Script instance recursively (view context)" — PixInsight bloquea la ejecución de un Script desde dentro de otro Script. Además `filePath`, `parameters`, `information` son read-only en `Script`.
- **Root cause:** Cosmic Clarity es un script .js, no un proceso nativo C++. No puede instanciarse con `new Script()` ni ejecutarse desde un script activo.
- **Fix:** `runCosmicClarityOnView` reescrito para usar `ProcessInstance.fromIcon(iconName).executeOn(view)`, igual que la integración de BXT. El usuario debe crear previamente un icono de proceso: ejecutar Cosmic Clarity desde Scripts menu → configurar → arrastrar el triángulo ▼ al escritorio.
- **UI:** Los GroupBox de CC en Pre Deconvolution, Post Sharpening y Post NR ahora contienen solo un campo de texto para el nombre del icono (default "CosmicClarity") + instrucciones de uso. Se eliminaron todos los sliders de parámetros (imposible configurar parámetros del Script externamente).
- **`isCosmicClarityAvailable(iconName)`:** Ahora usa `ProcessInstance.fromIcon(iconName)` en lugar de `new Script()`.
- **Regla nueva:** Cosmic Clarity y cualquier herramienta de terceros implementada como Script .js solo pueden integrarse via iconos de proceso pre-configurados.

### v110 — CC Live single-slot + Cosmic Clarity en Deconvolution/Sharpening/NR — 2026-04-20
- **CC Live single-slot:** `refreshTestPreview` ahora detecta si algún slot tiene `chkLive.checked`. Si sí: llama `buildTestPreparedSlotView(liveSlot)` y muestra solo esa imagen con `renderTestDisplayView`; NO llama `replaceTestResultView` para que `testCurrentResultView` (composición completa) permanezca intacta para Export/Set to Current. Si no hay Live activo: comportamiento original (composeTestResult + replaceTestResultView).
- **Pre-processing Deconvolution:** Sección renombrada a "Deconvolution". Añadido `comboPreDecon` (BXT idx=0 / Cosmic Clarity idx=1). Grupo `preCCSharpGroup` con: Sharpening Mode ComboBox (Both/Stellar/Non-Stellar), ncPreCCStellarAmt (0-1, def 0.9), ncPreCCNSStrength (1-8, def 3.0), ncPreCCNSAmount (0-1, def 0.5), chkPreCCRemoveAb, chkPreCCUseGPU. `applyPreCCSharpCandidateForWorkflow()` sigue el patrón candidato (clone → runCosmicClarityOnView → CANDIDATE). `btnBxtApply.onClick` despacha según combo; etiqueta del botón cambia dinámicamente.
- **Post Sharpening CC:** Añadido "Cosmic Clarity (SetiAstro)" como ítem 5 de `comboPostSharp`. `postCCSharpGroup` con mismos controles. `comboPostSharp.onItemSelected` actualizado para idx 0-5. Bloque `else if (algoIdx === 5)` en onClick llama `runCosmicClarityOnView` con processMode="sharpen".
- **Post NR CC:** Añadido "Cosmic Clarity (SetiAstro)" como ítem 2 de `comboPostNR`. `postCCNRGroup` con: comboPostCCDenoiseMode (Full/Luminance Only), comboPostCCDenoiseModel (Walking Noise/Standard), ncPostCCNRLuma/Color (0-1, def 0.5), chkPostCCNRUseGPU, chkPostCCNRRemoveAb. `comboPostNR.onItemSelected` actualizado para idx 0-2. `btnPostRunNR.onClick` cambiado de `else` a `else if (idx===1)` + nuevo `else if (idx===2)` llamando `runCosmicClarityOnView` con processMode="denoise".

### v109 — CC Live exclusivity fix + throttle+debounce preview — 2026-04-20
- **CC Live exclusivity (fix):** Root cause: `slot.chkLive.checked = true` se asigna en construcción, antes de que `onCheck` esté conectado → el handler no se dispara al cargar imágenes. Solución doble: (1) inicialización cambiada a `false`; (2) `assignTestSourceToSlot` activa Live en el slot receptor y desactiva todos los demás antes de expandir el header.
- **CC Preview fluido (fix):** El debounce puro de 180ms solo disparaba al PARAR de mover — si el usuario arrastraba continuamente el timer se reseteaba y el preview nunca actualizaba. Reescrito con **throttle + trailing debounce**: si han pasado ≥150ms desde el último render → render inmediato. Si no → programa trailing timer de 150ms. El primer evento siempre renderiza (elapsed=∞). `dlg.__testLastLiveRender` registra timestamp del último render.

### v108 — BN candidato + CC Live excluyentes + histograma + mono color — 2026-04-20
- **BN → Set to Current:** BN ya no modifica in-place. Crea clon (`Memory_BN_Candidate`), aplica BN sobre el clon, lo promueve como candidato (`preCandidateStage="Background Neutralization"`, `preCandidatePromotesToRGB=true`). `renderPreDisplayViews(..., "CANDIDATE", -1)` → `btnPreToolSetCurrent.enabled=true`.
- **CC Live excluyentes:** `slot.chkLive.onCheck` ahora desmarca todos los demás slots cuando se activa uno. Comportamiento radio-button: solo un Live activo a la vez.
- **CC Histograma cacheado:** `updateTestCurvesWidget` ya no llama `computeHistogramDataForViewGeneric` en cada clic. El histograma se computa una vez al asignar la fuente (`assignTestSourceToSlot`) y se guarda en `slot.cachedHistogramData`. Se limpia en `clearTestSlot`.
- **CC Preview fluido:** `queueTestPreviewUpdate` reescrito con timer debounce de 180ms. Eliminado el `buildTestPreparedSlotView` inútil que se creaba y borraba inmediatamente. `forceNow=true` sigue siendo instantáneo.
- **CC Mono → color:** `applyTestMonoColourToView` reescrito. Elimina dependencia de `Colourise` (frágil, API inconsistente). Nuevo helper `hsvPureRGB(hue01)` calcula el color puro en el hue pedido. PixelMath aplica: `R_out = G * (1-S+S*rH)`, `G_out = G * (1-S+S*gH)`, `B_out = G * (1-S+S*bH)`. Funciona en todas las versiones de PI.

### v107 — StatusBar compacta + BN preview fix — 2026-04-20
- **StatusBar margin/spacing:** `vs.margin` reducido de 6→2, `vs.spacing` de 4→2 en `buildStatusBar_v2`. Stretch factor eliminado de `mainSizer.add(statusBarV2)` (era 1). Da más espacio vertical al preview.
- **BN preview negro:** BN onClick cambiado de `dlg.updatePrePreview(false)` a `dlg.renderPreDisplayViews(targetView, null, "CURRENT", -1)`. Root cause: `updatePrePreview(false)` requiere `preHasExplicitRGBSource=true` y varias condiciones de estado; si alguna falla, `workImg=null` → pantalla negra. `renderPreDisplayViews` renderiza directamente la vista modificada por BN.

### v106 — Log panel fijo 3 líneas + preStatusLabel oculto — 2026-04-19
- **Log TextBox:** Cambiado de `setScaledMinHeight(52)` + `vs.add(logBox, 1)` (crecía con ventana) a `setScaledFixedHeight(52)` + `vs.add(logBox)` (altura fija, ~3 líneas). La barra de estado ya no ocupa espacio extra al agrandar el diálogo.
- **preStatusLabel:** Añadido `this.preStatusLabel.visible = false;` justo tras su construcción (~línea 14868). El recuadro de info (Workflow / Display / Current / Next Apply / Set to Current) desaparece del panel Pre-processing. El objeto sigue existiendo y sus actualizaciones son no-ops inofensivos; no se eliminó para no romper referencias.
- **SPCC icon lookup:** Eliminada búsqueda de icono SPCC; se usa `new SpectrophotometricColorCalibration()` directamente.
- **BN console.begin/end:** Eliminadas llamadas inexistentes `console.begin()/end()` del onClick de BN.
- **validateNarrowbandSelection recipe-aware:** Tres implementaciones ahora usan `dlg.nbRecipeNeeds` para validar solo los canales que la paleta seleccionada necesita (HOO/OHH no requieren S, OSS no requiere H, HSS no requiere O).
- **NB_RECIPE_NEEDS promovido:** Variable local `var NB_RECIPE_NEEDS` convertida a `dlg.nbRecipeNeeds` para acceso cross-scope desde el override instalado tardíamente.

### v101 FIX — GC crash en Separate Stars — 2026-04-19
- **Síntoma:** PixInsight se cerraba al ejecutar el script (Access Violation, sin mensaje en consola)
- **Root cause:** `lblSepMethod` y `sizerSepMethod` declarados con `var` (variables locales). El GC de SpiderMonkey los liberaba mientras Qt seguía referenciando los widgets nativos → puntero inválido → crash del proceso.
- **Fix:** Convertir todos los controles nuevos a propiedades de `this`:
  - `var lblSepMethod` → `this.lblSepMethod`
  - `var rowSepMethodSizer` → `this.sizerSepMethod`
- **Regla consolidada:** En PJSR, **todo control UI creado en el constructor debe ser `this.xxx`**, nunca `var`. Las variables locales son candidatas al GC aunque estén añadidas a un sizer nativo, porque SpiderMonkey no conoce esa referencia C++.

---

## 9. Análisis: Gestión Multi-Candidato de Gradient Correction

**Problema:** Cuando el usuario guarda en diferentes slots de memoria varias imágenes con distintas correcciones de gradiente, solo el último slot guardado tiene el botón "Set to Current" activo. Si quiere elegir el primer candidato, no puede.

**Root cause probable:** El botón "Set to Current" está vinculado al candidato activo en `preCandidateView`. Cuando se aplica una nueva corrección, el candidato anterior se destruye o su botón se desactiva.

### Opciones de diseño analizadas

**Opción A — Habilitar Set to Current en todos los slots ocupados**
- Los slots del SnapshotManager ya almacenan vistas completas. Solo hay que habilitar el botón en todos los que tienen vista válida (no null, no isNull).
- **Ventaja:** Implementación mínima, exacta (sin re-procesado). El usuario ve las N imágenes y elige.
- **Desventaja:** Cada slot ocupa la RAM de una imagen completa (ya ocurre hoy en el Pre-processing flow).
- **Conclusión: opción preferida.** Solo requiere cambiar la lógica de habilitación del botón en SnapshotManager.

**Opción B — Guardar parámetros y re-aplicar**
- Almacenar `{ method, params }` de la corrección (ABE degree, AutoDBE params...) y re-ejecutar desde `linearSource` al pulsar "Set to Current".
- **Ventaja:** Casi sin uso de RAM.
- **Desventaja:** AutoDBE no garantiza reproducibilidad exacta (proceso estocástico por gradient descent). MGC y ABE sí son deterministas. Lento (puede tardar 10-30s). Requiere que `linearSource` no haya cambiado.
- **Conclusión: descartada** para AutoDBE; viable para ABE/MGC pero innecesaria dado que A es mejor.

**Opción C — Thumbnails de comparación + promoción de imagen guardada**
- Igual que A pero con un pequeño bitmap 120×80 mostrado en el slot para comparar visualmente.
- **Ventaja:** El usuario puede comparar los candidatos sin activar "Set to Current".
- **Implementación:** Generar el thumbnail en el momento del guardado con `getScaledBitmap()`.
- **Conclusión: mejora deseable sobre A.** Añadir como segunda fase.

### Recomendación de implementación
1. Fase 1: Habilitar `btnSetCurrent` en todos los slots que tengan vista válida (Opción A). Cambio quirúrgico en SnapshotManager.
2. Fase 2 opcional: Añadir thumbnail 120×80 en cada slot de memoria para comparación visual (Opción C).

---

## 8. Instrucción de Actualización

Cada vez que se aplique un cambio al script, añadir una entrada aquí:

```
### vXXX — [TÍTULO BREVE] — [FECHA]
- Problema: ...
- Root cause: ...
- Fix: ...
- Nuevas reglas: ...
```

Y actualizar la sección "Estado Actual" con la nueva versión y archivo.

---

# NOTEBOOKLM_CONTEXT.md — Sesión 2 (v21GPT) — 2026-04-19

# PI Workflow Script — Contexto completo para NotebookLM
**Proyecto:** PixInsight PI Workflow  
**Archivo principal:** `PI Workflow_21GPT.js`  
**Ruta:** `C:\Users\ninoc\Documents\PixInsight\Test_Scripts\PI Workflow\Claude\`  
**Última actualización:** 2026-04-19 (sesión 2)

---

## 1. Descripción general del script

Script PixInsight PJSR (~25 700 líneas) que implementa un flujo de trabajo completo de astrofotografía:

```
Pre-processing → Stretching → Post Processing → Channel Combination → Stars Chromatic Correction → Configuration
```

### Tabs (índices)
| Index | Nombre | `dlg.pageXxx` |
|-------|--------|---------------|
| 0 | Pre Processing | `dlg.pagePre` |
| 1 | Stretching | `dlg.pageStretch` |
| 2 | Post Processing | `dlg.pagePost` |
| 3 | Channel Combination | `dlg.pageCombine` |
| 4 | Stars Chromatic Correction | `dlg.pageDoc` |
| 5 | Configuration | `dlg.pageConfig` |

> **Nota de terminología:** El usuario llama "Channel Calibration" a lo que en el código es "Channel Combination" (Tab 3).

---

## 2. Arquitectura y patrones clave

### 2.1 Modelo de estado central
- `dlg.workflowState` — estado canónico de paths y zonas
- `dlg.workflowPaths` — rutas de imágenes del workflow (RGB, STARLESS, STARS, H, O, S, etc.)
- `dlg.preSelectionMode` — modo activo de Image Selection: `"MONO"`, `"NB"`, `"RGB"`, `"SEPARATE"`
- `dlg.preWorkflowMode` — modo de trabajo actual del motor Pre: `"RGB"`, `"SEPARATE"`, etc.

### 2.2 Ciclo de vida de vistas
```
linearSource (inmutable)
    → lastPreviewView (downsampled, para Preview rápido)
    → stretchCommittedViews[zone]        (preview-size, para botones de zona)
    → stretchCommittedFullResViews[zone] (full-res, computado en Set to Current — v21)
    → Post Processing zone
```

### 2.3 Modos de Image Selection
- `"MONO"` — solo como valor por defecto al arrancar el script
- `"NB"` — narrowband; debe mantenerse al cambiar recipe, durante Play, y al pulsar STOP
- `"RGB"` — imagen RGB combinada
- `"SEPARATE"` — canales separados R/G/B

### 2.4 Función `parseModeArg(value, default)`
**Trampa conocida:** `parseModeArg(false, "MONO")` devuelve `"MONO"` porque `false` es falsy.  
**Regla:** pasar siempre `dlg.preSelectionMode` en lugar de booleanos literales.

### 2.5 Elegibilidad de paths para Post Processing
```javascript
dlg.isWorkflowPathReadyForPost(pathKey)   // true si el path pasó por Stretching → Set to Current
dlg.setWorkflowPathReadyForPost(key, true) // se llama en:
    //   • Stretching "Set to Current"
    //   • loadViewIntoPostZone() (Post Image Selection)
    //   • replacePostZoneView() (zona Post reemplazada)
    //   • promoteChannelCombinationResultToCurrent()
```

---

## 3. Secciones clave del código

### 3.1 Paleta de colores UI_V2 (~línea 481)
Todos los colores usan formato **ARGB 8 dígitos** `#FFRRGGBB`.

```javascript
var UI_V2 = {
  bg:           "#FF0e0e10",
  bgPanel:      "#FF17171a",
  bgPanelAlt:   "#FFd9a560",
  bgInset:      "#FF0a0a0b",
  border:       "#FF262629",
  borderStrong: "#FF38383e",
  text:         "#FFe8e8ea",
  textDim:      "#FF9a9aa1",
  textMute:     "#FF6b6b73",
  primary:      "#FFd9a560",   // ámbar — color principal
  primaryBg:    "#FF3a2d1a",
  primaryHover: "#FFe8e8ea",
  success:      "#FF7ed89b",
  warn:         "#FFe5c070",
  danger:       "#FFe08070",
  radius:       "4px",
  radiusLg:     "6px"
};
```

**Regla Qt para eliminar enrejado nativo:** una regla CSS necesita **`background-color` Y `border`** en la misma regla para desactivar el QStyle nativo.
- `border: 1px solid transparent` — fuerza CSS sin borde visible
- `border-image: none; outline: none;` — en la regla global `*`

### 3.2 makeViewRow — selector de vistas con filtros (~línea 11138)
```javascript
function makeViewRow(parent, labelText, options)
// options.requireColor        — solo imágenes RGB (numberOfChannels >= 3)
// options.requireMono         — solo imágenes mono
// options.allowNone           — permite selección vacía
// options.recordFilter        — función personalizada: (record) => bool
// options.startupAutoSelect   — auto-selección al iniciar
```

### 3.3 Narrowband — funciones críticas
| Función | Descripción |
|---------|-------------|
| `createNarrowbandCompositeViewFromSources(sourceMap, recipe, ...)` | Ensambla H+O+S con la paleta seleccionada |
| `prepareMedianMatchedNarrowbandViews(...)` | Normaliza canales por mediana (LENTO: 3 clones + 3 PixelMath) |
| `fastNarrowbandRecipeApply()` | Fast path: 1 PixelMath, sin normalización, `normalizeChannels: false` |
| `selectNarrowbandRecipe(name, refreshPreview)` | Selecciona recipe y opcionalmente regenera preview |

**Clave de rendimiento:** `{ normalizeChannels: false }` en `createNarrowbandCompositeViewFromSources` salta la normalización pesada.

### 3.4 Motor de Stretching (~línea 7908)
```javascript
var VeraLuxCore = { ... }           // Utilidades matemáticas (percentil, MTF, hiperbólico)
function StretchingEngine() { ... } // Motor principal
  this.runStretch(view, algoId, params) // Aplica el stretch al view en-lugar
```

Algoritmos soportados: `"STF"`, `"MAS"` (Multiscale Adaptive Stretch), `"VERALUX"`, `"STAT"`.

### 3.5 Zonas de Stretching
- `dlg.zone1` — zona RGB / STARLESS  
- `dlg.zone2` — zona STARS
- Cada zona tiene: `linearSource`, `lastPreviewView`, `lastPreviewBitmap`, `lastPreviewAlgorithmId`, `lastPreviewParams`, `lblStatus`, `btnPreview`, `btnApply`

### 3.6 Ciclo Set to Current → To Post Processing

**Diseño v21 (post-fix):**

```
Preview
  └─ workflowCloneForState(linearSource, downsampled) + runStretch
  └─ guarda: zone.lastPreviewView, zone.lastPreviewAlgorithmId, zone.lastPreviewParams

Set to Current  ← LENTO aquí (full-res), RÁPIDO en To Post
  ├─ commitPreviewView = reassignViewIdSafely(lastPreviewView, "Committed_Preview_ZONE")
  ├─ stretchCommittedViews[zone]       = commitPreviewView  (preview-size, para display)
  ├─ stretchCommittedDescriptors[zone] = null               (descriptor eliminado si full-res OK)
  ├─ fullResCommit = workflowCloneForState(linearSource) + runStretch  ← trabajo pesado aquí
  └─ stretchCommittedFullResViews[zone] = fullResCommit

To Post Processing  ← ahora INSTANTE
  ├─ SI stretchCommittedFullResViews[zone] existe → cloneViewWithMetadata (fast path)
  ├─ SINO descriptor presente → workflowCloneForState + runStretch (fallback lento)
  └─ SINO → cloneViewWithMetadata del committed view (último recurso)
```

**Estructuras de datos relevantes (~línea 17351):**
```javascript
this.stretchCommittedViews        = { RGB: null, STARLESS: null, STARS: null };
this.stretchCommittedDescriptors  = { RGB: null, STARLESS: null, STARS: null };
this.stretchCommittedFullResViews = { RGB: null, STARLESS: null, STARS: null }; // v21 NEW

this.replaceStretchCommittedView(zoneName, newView)      // limpia también fullResViews al nullear
this.replaceStretchCommittedFullResView(zoneName, newView) // helper v21
```

### 3.7 Gradient Correction (~línea 7141)
```javascript
function runAutoDBEGradientCorrection(targetView, params)
  // Wrapper que detecta imágenes mono → crea clone RGB temporal → ejecuta AutoDBE → copia canal 0 de vuelta
  // Parámetros relevantes en GradientDescentParameters:
  //   .targetView, .replaceTarget, .descentPathsInput, .tolerance, .smoothing, .discardModel

function executeGradientCorrectionForView(targetView, dlg)
  // Dispatcher según dlg.comboGrad.currentItem:
  //   0 = MGC, 1 = AutoDBE, 2 = ABE, 3 = GraXpert

this.applyGradientCandidateForWorkflow()
  // Crea candidato (clone + corrección), renderiza para revisión
  // Promueve con btnSetCurrentGradCandidate → "Set to Current"
```

### 3.8 Channel Combination (Tab 3 = pageCombine)

Filtro de path buttons (línea ~4325) — solo muestra imágenes listas para Post:
```javascript
dlg.refreshWorkflowPathButtonPanel(dlg.testSourceButtonsPanel, activeKey, function(pathKey, view) {
    if (!view || view.isNull) return false;
    return !!(dlg.isWorkflowPathReadyForPost && dlg.isWorkflowPathReadyForPost(pathKey));
});
```

`isWorkflowPathReadyForPost` devuelve `true` solo cuando el path ha sido estirado Y promovido con "Set to Current" (o cargado directamente en Post Image Selection). Las imágenes lineales en la cola de Stretching quedan excluidas.

---

## 4. Bugs encontrados y corregidos (historial completo)

### Bug #1 — Enrejado/grid en botones y combos
**Versión:** v20 → v21  
**Causa:** Qt solo desactiva el QStyle nativo cuando una regla CSS define AMBOS `background` Y `border` en la misma regla. Con solo uno de los dos, sigue dibujando la textura nativa encima.  
**Corrección:**
- Cambiar todos los `border: none` → `border: 1px solid transparent` (43 ocurrencias)
- Añadir `border-image: none; outline: none;` en la regla global `*`
- Todos los colores convertidos a ARGB 8 dígitos `#FFRRGGBB`

### Bug #2 — `Control.Get(): Internal error` (línea 407)
**Versión:** v20 → v21  
**Causa:** CSS Engine Patch usaba `Object.getOwnPropertyDescriptor(UIClass.prototype, 'styleSheet')` sobre clases C++ nativas de PJSR. SpiderMonkey crashea al acceder `.prototype` de bindings nativos.  
**Corrección:** Eliminar completamente el IIFE CSS Engine Patch (innecesario con colores ARGB estáticos).

### Bug #3 — `parseModeArg(false, "MONO")` → modo salta a MONO
**Versión:** v20 → v21  
**Causa:** `showPreCurrentRGB` llamaba `dlg.updateModeSelection(false, true)`. El booleano `false` es interpretado como `"MONO"` por `parseModeArg`.  
**Corrección:**
```javascript
// ANTES (MAL):
dlg.updateModeSelection(false, true);
// DESPUÉS (BIEN):
dlg.updateModeSelection(dlg.preSelectionMode || "MONO", true);
```

### Bug #4 — `row.sizer.count` no existe en PJSR
**Versión:** v20 → v21  
**Causa:** `HorizontalSizer` en PJSR no tiene `.count`.  
**Propiedad correcta:** `.numberOfItems`

### Bug #5 — AutoDBE: `Image.sample(): channel index out of range`
**Versión:** v21 (sesión 2)  
**Archivo afectado:** `All scripts to learn/AutoDBE.js` línea 749  
**Causa exacta:**
```javascript
// En executeGradientDescent(targetView, exclusionAreas):
let sourceImage = targetView.image;          // línea 697 — CORRECTO
let channels = sourceImage.numberOfChannels; // línea 700 — usa channels del targetView

// ERROR — línea 748-749:
let activeWindow = ImageWindow.activeWindow;
let sourceImage = activeWindow.mainView.image; // SOBREESCRIBE sourceImage con la ventana activa!
```
Resultado: `channels = 3` (del targetView RGB), pero `sourceImage` = imagen activa en PI (puede ser mono, 1 canal). Al iterar `for (c = 0; c < channels; c++)` → `sourceImage.sample(x, y, 1)` en imagen mono → crash.

**Corrección en `All scripts to learn/AutoDBE.js`:**
```javascript
// ELIMINAR la línea:
let sourceImage = activeWindow.mainView.image;
// MANTENER solo:
let activeWindow = ImageWindow.activeWindow; // necesaria para copiar WCS en bloque !replaceTarget
```
`sourceImage` permanece correctamente como `targetView.image` durante toda la función.

### Bug #6 — Channel Combination mostraba imágenes lineales sin estirar
**Versión:** v21 (sesión 2)  
**Causa:** Filtro de path buttons era `return inStretch || inPost` — incluía imágenes en cola de Stretching no estiradas.  
**Corrección:**
```javascript
// ANTES:
var inStretch = !!(dlg.isWorkflowPathOwnedByStretch && dlg.isWorkflowPathOwnedByStretch(pathKey));
var inPost    = !!(dlg.isWorkflowPathReadyForPost && dlg.isWorkflowPathReadyForPost(pathKey));
return inStretch || inPost;

// DESPUÉS:
return !!(dlg.isWorkflowPathReadyForPost && dlg.isWorkflowPathReadyForPost(pathKey));
```

### Bug #7 — "To Post Processing" muy lento para STARS (y cualquier zona)
**Versión:** v21 (sesión 2)  
**Causa:** Diseño diferido — "Set to Current" solo guardaba un preview-size + descriptor. "To Post Processing" tenía que: (1) clonar la imagen full-res y (2) re-aplicar el stretch completo cada vez.  
**Corrección:** Mover el trabajo pesado a "Set to Current":
1. Se añade `stretchCommittedFullResViews = { RGB, STARLESS, STARS }` como caché
2. "Set to Current" ejecuta `workflowCloneForState + runStretch` en full-res y lo guarda
3. "To Post Processing" solo hace `cloneViewWithMetadata` del resultado precalculado (instantáneo)
4. Si el caché no existe (fallback hacia atrás), usa el descriptor como antes

---

## 5. Archivos del proyecto

| Archivo | Descripción |
|---------|-------------|
| `PI Workflow_21GPT.js` | Script principal (versión activa) |
| `PI Workflow_20GPT.js` | Versión anterior (referencia) |
| `All scripts to learn/AutoDBE.js` | Biblioteca AutoDBE local, incluida con `#include`; contiene `executeGradientDescent()` y `GradientDescentParameters` |
| `CLAUDE.md` | Instrucciones del proyecto para el agente Claude |
| `NOTEBOOKLM_CONTEXT.md` | Este archivo |

---

## 6. Convenciones de código

### 6.1 Naming
- `camelCase` — variables y funciones
- `PascalCase` — clases
- `UPPER_CASE` — constantes

### 6.2 Includes obligatorios al inicio del script
```javascript
#include <pjsr/DataType.jsh>
#include <pjsr/SampleType.jsh>
#include <pjsr/StdCursor.jsh>
#include <pjsr/UndoFlag.jsh>
#define __PI_WORKFLOW_LIBRARY_INCLUDE__
#include "All scripts to learn/AutoDBE.js"
```

El `#define` suprime el diálogo propio de AutoDBE y su `function main()`, exponiendo solo las funciones de librería (`GradientDescentParameters`, `executeGradientDescent`).

### 6.3 Gestión de memoria — regla de oro
```javascript
// Todo proceso que manipule imágenes → try...finally
var win = new ImageWindow(...);
try {
    win.mainView.beginProcess(UndoFlag_NoSwapFile);
    // ... operaciones ...
    win.mainView.endProcess();
} finally {
    try { win.forceClose(); } catch (e) {}
}
```

### 6.4 Helpers frecuentes del workflow

| Helper | Descripción |
|--------|-------------|
| `makeUniqueImageId(base)` | Genera ID único para nueva imagen |
| `workflowCloneForState(view, id)` | Clona preservando metadatos del workflow |
| `cloneViewWithMetadata(view, id, copyWCS)` | Clona con opción de copiar WCS |
| `closeViewWindowSafely(view)` | Cierra sin error si ya estaba cerrada |
| `closeWorkflowViewSafely(view)` | Cierra view gestionada por el workflow |
| `viewIsTrueColor(view)` | `numberOfChannels >= 3` de forma segura |
| `imageIsTrueColor(image)` | Igual pero para objeto `Image` |
| `getViewIdSafe(view)` | Devuelve `""` si view es null/isNull |
| `reassignViewIdSafely(view, newId)` | Cambia ID sin duplicados |
| `replaceWorkflowPathViewByKey(dlg, key, view)` | Actualiza el path del workflow |
| `refreshStatusBar_v2(dlg)` | Refresca la barra de estado |
| `setSectionHeaderBadge(bar, type, text)` | Pone badge `'ok'`/`'warn'`/`'error'` en sección |
| `getWorkflowPathBaseKey(key)` | Extrae la clave base de un path compuesto |

### 6.5 UI helpers

| Helper | Descripción |
|--------|-------------|
| `createCollapsibleSectionHeader(parent, title)` | Crea sección colapsable con `.attachBody()` |
| `makeNumericNative(parent, label, min, max, def, decimals, labelWidth)` | NumericControl |
| `makeViewRow(parent, label, options)` | Fila con selector de vista (ComboBox con filtros) |
| `createModeButtonRow(parent, sizer)` | Fila de botones MONO/NB/RGB |
| `cssPill_v2(fg, bg)` | CSS para etiqueta tipo pill/badge |
| `setControlToolTip(ctrl, html)` | Asigna tooltip HTML |
| `CSS_BTN_PRIMARY_V2` | Stylesheet completo para botón primario (4 estados) |

---

## 7. Flujo de trabajo del usuario

```
[Pre-processing]
  Image Selection (MONO / NB / RGB / SEPARATE)
  → Gradient Correction (MGC / AutoDBE / ABE / GraXpert)
  → BlurXTerminator (deconvolución)
  → Color Calibration (SPCC / Auto Linear Fit)
  → [To Stretching]

[Stretching]
  Zone 1 (RGB / STARLESS): STF / MAS / VeraLux / Statistical
  Zone 2 (STARS):           idem
  → Preview (rápido, downsampled)
  → Set to Current (genera full-res → guarda en cache)
  → [To Post Processing]  ← instantáneo desde v21

[Post Processing]
  Image Selection (RGB / STARLESS / STARS)
  Noise Reduction → Masking → Sharpening → Blending → Color Balance → Curves
  → [Set to Current] → promueve al path del workflow

[Channel Combination]  ← solo imágenes con isWorkflowPathReadyForPost = true
  6 Image slots con blend modes, brillo, saturación, curvas
  → Set to Current → promueve al path base del workflow

[Stars Chromatic Correction]
  Detección → Reparación cromática por estrella
```

---

## 8. Contexto PJSR / SpiderMonkey

### 8.1 Características del runtime
- SpiderMonkey antiguo (pre-ES6): `let` no lanza error de re-declaración en la misma función
- `for...of` puede no funcionar; usar `for (var i = 0; i < arr.length; ++i)`
- No existe `Array.prototype.includes`; usar `arr.indexOf(x) !== -1`
- Arrow functions (`=>`) disponibles en versiones recientes de PI

### 8.2 Propiedades PJSR frecuentes
| Propiedad | Nota |
|-----------|------|
| `HorizontalSizer.numberOfItems` | ✅ correcto — NO usar `.count` |
| `VerticalSizer.numberOfItems` | ✅ correcto — NO usar `.count` |
| `view.image.numberOfChannels` | 1 = mono/gris, 3 = RGB |
| `view.image.colorSpace` | `ColorSpace_Gray`, `ColorSpace_RGB`, etc. |
| `view.image.isReal` | true para float32 |
| `ImageWindow.activeWindow` | Ventana activa del workspace PI (puede ser cualquiera) |
| `View.viewById(id)` | Busca vista por ID; lanza excepción si no existe → usar try/catch |
| `ImageWindow.windows` | Array de todas las ventanas abiertas |

### 8.3 Trampa crítica: `ImageWindow.activeWindow` en AutoDBE
El `executeGradientDescent` de AutoDBE.js usa `ImageWindow.activeWindow` como fuente de datos en vez del parámetro `targetView`. Si la ventana activa en PI no es la vista de trabajo:
- `channels` viene del `targetView` (ej. 3 para RGB)
- `sourceImage` viene de `activeWindow` (puede ser mono = 1 canal)
- `sourceImage.sample(x, y, 1)` → `Image.sample(): channel index out of range`

**Fix aplicado:** eliminada la línea `let sourceImage = activeWindow.mainView.image` de `AutoDBE.js`.

---

## 9. Patrones a seguir al añadir nuevas funciones

### Añadir una nueva sección colapsable en una tab existente
```javascript
// 1. Crear header
this.myNewBar = createCollapsibleSectionHeader(this.pagePost, "My Section");

// 2. Crear frame contenedor
this.myNewBox = new Frame(this.pagePost);
this.myNewBox.styleSheet = "QFrame { background-color:" + UI_V2.bgPanel +
    "; border:1px solid " + UI_V2.border + "; border-radius:" + UI_V2.radiusLg + "; }";

// 3. Layout interno
var sizerMyNew = new VerticalSizer(); sizerMyNew.margin = 8; sizerMyNew.spacing = 6;
// ... añadir controles ...
this.myNewBox.sizer = sizerMyNew;

// 4. Vincular al header colapsable
var myNewBody = new Control(this.pagePost);
myNewBody.sizer = new VerticalSizer(); myNewBody.sizer.spacing = 4;
myNewBody.sizer.add(this.myNewBox);
this.myNewBar.attachBody(myNewBody, "PERSIST_KEY/MySection");

// 5. Añadir al sizer principal de la tab
sizerPostMain.add(this.myNewBar);
sizerPostMain.add(myNewBody);
```

### Añadir un botón primario
```javascript
var btn = new PushButton(parent);
btn.text = "Mi Acción";
btn.styleSheet = CSS_BTN_PRIMARY_V2;
btn.toolTip = "<p>Descripción del botón.</p>";
btn.onClick = function() {
    try {
        // acción
    } catch (e) {
        console.criticalln("Error: " + e.message);
        new MessageBox("Error: " + e.message, "Error", StdIcon_Error).execute();
    }
};
```

### Añadir un selector de vista filtrado
```javascript
// Solo imágenes RGB que pasaron por Post
var rowMiVista = makeViewRow(parent, "Mi imagen:", {
    allowNone: true,
    requireColor: true,
    startupAutoSelect: false,
    recordFilter: function(record) {
        return !!(dlg.isWorkflowPathReadyForPost &&
                  dlg.isWorkflowPathReadyForPost(record.pathInfo && record.pathInfo.pathKey || ""));
    }
});
```

---

## 10. Backlog de mejoras pendientes

- [ ] Verificar que `cleanupTestTransientState` libera también `stretchCommittedFullResViews` al resetear el workflow
- [ ] Probar flujo STARLESS + STARS simultáneos con la caché full-res (dos "To Post Processing" seguidos)
- [ ] Liberar `stretchCommittedFullResViews[zone]` cuando el usuario carga una nueva imagen en esa zona de Stretching
- [ ] Verificar AutoDBE fix en producción con imagen RGB activa ≠ imagen de trabajo
- [ ] Considerar añadir barra de progreso durante "Generating full-res stretch..." en Set to Current

---

## 11. Comandos de búsqueda frecuentes en el script

```bash
# Sección concreta por nombre de función
grep -n "sendStretchCommittedToPost\|runAutoDBEGradientCorrection\|fastNarrowbandRecipeApply" "PI Workflow_21GPT.js"

# Todos los collapsible headers de una tab
grep -n "createCollapsibleSectionHeader.*pagePost" "PI Workflow_21GPT.js"
grep -n "createCollapsibleSectionHeader.*pagePre"  "PI Workflow_21GPT.js"

# Estado del workflow
grep -n "stretchCommitted\|isWorkflowPathReadyForPost\|preSelectionMode" "PI Workflow_21GPT.js" | head -20

# Todas las llamadas a runStretch
grep -n "stretchEngine\.runStretch\|runStretch(" "PI Workflow_21GPT.js"

# Todos los onClick de botones Apply/Send de zonas
grep -n "zone[12]\.btnApply\.onClick\|btnApply\.onClick" "PI Workflow_21GPT.js"
```
