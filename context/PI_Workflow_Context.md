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

### v33-opt-9o — Zoom bug v2 (fit-mode refit) + astrometric warning fix (2 bugs)

**Bug 1 — Zoom seguía apareciendo pequeño tras v9n:**
**Síntoma:** Tras el fix v9n el problema persistía: al ir de Masking a Curves la imagen seguía pequeña en la esquina superior izquierda.

**Análisis profundo:** El fix v9n usaba `oldBitmap.width / bitmap.width` para reescalar `scale`, manteniendo `(scale × bitmap.width) ≈ constante`. Matemáticamente correcto, pero dos problemas:
  1. **`oldBitmap.width` se leía DESPUÉS de `oldBitmap.clear()`**, y algunas versiones de PJSR invalidan width/height tras clear() → el `oldBitmap.width > 0` check fallaba silenciosamente → no se reescalaba.
  2. **Reescalar a partir del scale previo** asume que el scale previo era correcto. Si el primer setBitmap se hizo con un bitmap pequeño (Masking live) y luego viene otro bitmap pequeño con dims distintas, el scale acumula desviaciones pequeñas. Caso típico: source bitmap (5000/3=1667 wide) → mask preview bitmap (1024/3=341 wide). Aún funcionaba, pero ratio 4.88 con clamping a 40 puede dar mal resultado en algunos escenarios.

**Fix v9o:**
  1. **Capturar dimensiones del oldBitmap ANTES de `oldBitmap.clear()`** en variables locales (`oldBitmapWidth`, `oldBitmapHeight`). Defensive — sobrevive a cualquier comportamiento de clear() en PJSR.
  2. **Capturar `wasFitMode` ANTES del swap** (porque fitToWindow lo cambia).
  3. **Lógica reforzada en el branch `fit=false`:**
     - Si `wasFitMode === true` Y bitmap width cambió → **refit completo** vía `fitToWindow()`. El usuario no había hecho zoom manual; refittear es la respuesta natural.
     - Si `wasFitMode === false` (zoom manual) Y bitmap width cambió → **rescale proporcional** (la lógica v9n) preserva la intención de zoom.
     - Si no cambia el width → preservar scale (igual que antes).
  4. **Center preservation** ahora usa `oldBitmapWidth` (variable local) en vez de leer del bitmap (posiblemente invalidado).

**Por qué v9o resuelve y v9n no:**
  - v9n confiaba en `oldBitmap.width` post-clear, podía fallar.
  - v9o captura dims al entrar, garantizado.
  - v9n siempre rescale; v9o decide entre refit (si fit-mode) y rescale (si manual zoom) — refit es más robusto en el caso típico (usuario no ha zoomeado).

**Bug 2 — Astrometric warning en Color Balance Live:**
**Síntoma reportado por el usuario en consola:**
```
ChannelCombination: Processing view: Opt_Live_post_color
*** Error: AstrometricMetadata::Write(): Incompatible image dimensions.
** Invalid astrometric solution ignored: Opt_CB_I
```

**Root cause:** El Color Balance live crea un candidate downsampleado (`Opt_Live_post_color`, ej. 1024 wide). Ese candidate hereda el WCS del view original full-res (5000+ wide) vía `optCloneView → optCopyMetadata → copyAstrometricSolution`. Cuando el WCS se copia a una view con dimensiones DISTINTAS de la fuente, PixInsight conserva la solución pero la marca como inválida (`Invalid astrometric solution ignored`). Internamente, `optApplyHueSaturationCorrectionToView` (línea ~9789) crea views intermedias (`Opt_CB_H`, `Opt_CB_S`, `Opt_CB_I`) vía `optCreateGrayExpressionView` que TAMBIÉN llama `optCopyMetadata`. Cada vez que se intenta escribir el WCS heredado a una view con dimensiones que no coinciden con el original, PixInsight emite el warning.

**Fix v9o:** En `optCopyMetadata` (línea 1350), comprobar que las dimensiones de target y source coincidan antes de copiar la solución astrométrica. Si difieren, omitir la copia. Las keywords FITS sí se siguen copiando porque son strings sin restricción dimensional.

**Resultado:** Cero warnings de astrometría durante live preview de Color Balance / Curves / NR / Sharpening / etc. cuando el candidate es downsampled. El apply full-res sigue funcionando idéntico porque cuando dimensiones coinciden, la copia se hace normalmente.

**Archivos modificados:**
  - `PI Workflow.js`:
    - `OptPreviewControl.setBitmap` línea 5510: refactor con captura early de dims + lógica refit/rescale según wasFitMode
    - `optCopyMetadata` línea 1350: comprobación de dim match antes de `copyAstrometricSolution`
  - `context/PI_Workflow_Context.md`: esta entrada

**Reglas permanentes registradas:**
  1. **Cualquier helper que copie metadata** entre views DEBE verificar compatibilidad dimensional cuando la metadata sea sensible a dims (WCS, máscaras geométricas).
  2. **`setBitmap(b, fit=false)` con bitmap-swap** debe preservar el comportamiento de fit-mode si el usuario nunca tocó el zoom: refittear al nuevo bitmap. Solo si el usuario zoomeó manualmente preservar scale-relativo-al-source.

### v33-opt-9n — Mask UX polish: zoom fix + amber overlay + manual update (3 tareas)

**Tarea A — Bug del zoom al cambiar entre secciones (Masking → Curves):**
**Síntoma reportado:** "La imagen se vuelve muy pequeña y se va a la esquina superior izquierda del preview".
**Root cause:** En `OptPreviewControl.setBitmap()` (línea 5502) con `fit=false`, el `scale` se preservaba SIN ajustar a las nuevas dimensiones del bitmap. La pipeline de live preview reemplaza el bitmap entre swaps (Masking live = bitmap del mask preview ~800px; render del source o Curves live = bitmap diferente). Como `scale` representa "viewport-pixels por bitmap-pixel", al cambiar bitmap pero mantener el mismo scale, el tamaño visible del source aparente CAMBIA proporcionalmente al ratio de anchos de bitmap. Concretamente: si el old bitmap era 800px ancho y el new es 200px (aún más reducido), con el mismo scale el new aparece 4× más pequeño en pantalla.
**Fix:** Cuando `setBitmap(b, false)` se llama y `oldBitmap.width !== bitmap.width`, ajustar scale: `scale_new = scale_old * (oldBitmap.width / bitmap.width)`. Esto mantiene constante `scale * bitmap.width` → tamaño visible del source aparente invariante across bitmap swaps del mismo view.
**Por qué no rompe el caso de tab change (cross-source):** los cambios de tab y de currentView usan `render(view, fit=true)` que va por la rama `fitToWindow()`, no por esta. El fix solo afecta a la rama `fit=false` (live previews y bitmap swaps internos).

**Tarea B — Color de máscara: rojo → ámbar dorado, FAME live: cian → ámbar:**
**Motivación:** Convención visual unificada. La interfaz usa ámbar `0xFFFFD000` para handles de Crop, acentos. La máscara debería seguir el mismo lenguaje cromático.
**Cambios:**
  1. `optRenderPreviewBitmapWithMask` (línea 1758): tinte rojo → ámbar `(R=1.0, G=0.8157, B=0.0)`. Nueva fórmula RGB:
     - R = rv * (1-a) + a * 1.0
     - G = gv * (1-a) + a * 0.8157
     - B = bv * (1-a) + a * 0.0
     (antes: R aumentaba a 1.0, G y B solo se oscurecían → tinte rojo)
  2. `optRenderFameOverlay` (línea 10184): shape activo cian `0xFF00FFFF` → ámbar `0xFFFFD000`; shape inactivo `0xFF60C0FF` → ámbar oscuro `0xFFCC9000`.
**Confirmación de convención de polaridad:** "Blanco = donde la máscara actúa" YA estaba implementado desde v9k vía `maskInverted = true` en `optApplyMaskToProcessView`. El cambio actual es solo visual; la semántica funcional ya era correcta. Documentado explícitamente en el manual.

**Tarea C — Actualizar el manual:**
**Cambio:** Sección 6.4 del help (Integrated Mask Engine) ahora documenta el flujo unificado v9m:
  - Botón único `Use This Mask` (sustituye al antiguo "Generate Active Mask" + "Set to Active Mask")
  - Left-click slot = store
  - Right-click slot = recall + activate atomic
  - Polaridad: blanco = donde la máscara actúa (con `maskInverted=true` en cada Post process)
  - Overlay ámbar dorado en lugar de rojo
Eliminada la mención al antiguo "Set Active Mask" / "Store to Mask Memory" y reemplazada por una descripción consistente con el nuevo modelo.

**Archivos modificados:**
  - `PI Workflow.js`:
    - `OptPreviewControl.setBitmap` línea 5502: bloque del `fit=false` ajusta scale proporcionalmente al ratio de anchos del bitmap antes de updateScrollBars
    - `optRenderPreviewBitmapWithMask` línea 1758: constantes TINT_R/G/B + fórmula triple por canal en lugar de solo R
    - `optRenderFameOverlay` línea 10184: pen con ámbar dorado para shapes
  - `PI Workflow_help.xhtml`: sección 6.4 callout reescrito con el flujo v9m
  - `context/PI_Workflow_Context.md`: esta entrada

**Regla permanente:**
  1. **Live preview pipelines** que cambien el bitmap activo del preview pane DEBEN tener `setBitmap(b, false)` (no fit) PERO el scale se ajustará automáticamente. Para forzar fit-to-window (cambio de canonical view, cambio de tab) usar `fit=true`.
  2. **Color de "área donde la máscara actúa"** = `0xFFFFD000` (ámbar dorado) consistente entre FAME live drawing, mask overlay, y handles de Crop. Cualquier nuevo overlay de máscara o gating debe usar este color.

### v33-opt-9m — Mask system unified with image-memory model (5-point overhaul)
**Origen:** Análisis profundo del sistema de máscaras pedido por el usuario identificó múltiples inconsistencias entre la mental model del usuario y la implementación. Decisión consensuada: alinear el flujo de máscaras al de imágenes, eliminando estado redundante y un botón de UI.

**Punto 1 — Eliminado "Set to Active Mask"; right-click memoria ahora activa directamente:**
  - Modelo anterior: dos pasos para activar una memoria. Right-click previsualizaba (sin tocar `postActiveMask`); había que pulsar "Set to Active Mask" para promoverla.
  - Modelo nuevo: right-click sobre slot llama `optSetActivePostMaskFromMemory(dialog, slot.view, previewPane)` directamente. Recall + activate en un solo gesto, igual que image-memory.
  - Eliminado: botón `btnSet` ("Set to Active Mask"), variable `dialog.btnPostSetActiveMask`, branch `if (btnSet)` en refresh y wire-up.

**Punto 2 — Renombrado "Generate Active Mask" → "Use This Mask":**
  - Mismo handler `optGeneratePostMask`, mismo flujo (commit live params → full-res `postActiveMask`).
  - Etiqueta más natural y simétrica con "Set to Current" de imagen. El usuario aprueba el nombre.
  - Tooltip `button.Generate Active Mask` reemplazado por `button.Use This Mask` en resources.jsh.

**Punto 3 — Live preview NO actualiza `postActiveMask`:**
  - Decisión consciente: mantener separación entre staging (live preview, bitmap rápido) y commit (postActiveMask, full-res). Como en imagen donde candidate ≠ currentView hasta Set to Current.
  - Razón: live preview es downsampled para responsividad; promoverlo automáticamente perdería resolución del active mask. El usuario controla cuándo hacer commit con "Use This Mask".

**Punto 4 — Eliminado `postGeneratedMask`:**
  - Era alias permanente de `postActiveMask` (siempre apuntaban a la misma view). Dos nombres = dos lugares para olvidar de mantener sincronizados.
  - Sustituidas las 6 referencias (dialog init x2, optGeneratePostMask, optSetActivePostMaskFromMemory, optClearPostMaskState, dispose).
  - Ahora `postActiveMask` es la única fuente de verdad para "la máscara activa".

**Punto 5 — Limpieza de dead code en `OptMaskMemoryManager`:**
  - Eliminados métodos sin callers: `numberForSignature`, `storeNext`, `storeNextShared`, `preserveSharedView`.
  - Eliminados campos asociados: `signatureNumbers`, `nextSignatureNumber`, `nextIndex`.
  - Conservados (con callers reales): `storeAt`, `select`, `selectedView`, `clear`, `registerButtons`, `refreshButtons`, `selectedIndex`, `slots`, `buttonSets`.
  - El bloque pasó de ~165 líneas a ~75. Comentario al inicio documenta el modelo simplificado.

**Comportamiento final unificado:**

| Acción | Imagen | Máscara (v33-opt-9m) |
|--------|--------|----------------------|
| Genera staging | Apply process → candidate | Cambio de params → live preview bitmap |
| Promover staging → activo | `Set to Current` | **`Use This Mask`** (botón único) |
| Store en memoria | Click slot N | Click slot N (left-click) |
| Recall + activar | Right-click slot N | **Right-click slot N** (un solo gesto) |
| Estado activo | `pane.currentView` | **`dialog.postActiveMask`** (variable única) |

**Archivos modificados:**
  - `PI Workflow.js`:
    - `OptMaskMemoryManager` reescrito (~75 líneas; -90 de dead code)
    - `optGeneratePostMask`, `optSetActivePostMaskFromMemory`, `optClearPostMaskState`: solo usan `postActiveMask`
    - `optBuildMaskMemoryPanel`: eliminado `btnSet`, right-click handler usa `optSetActivePostMaskFromMemory`, removido `dialog.btnPostSetActiveMask` enable/disable
    - `btnPostGenerateMask`: texto cambiado a "Use This Mask", `optSafeUi` con nuevo label
    - `lblPostMaskStatus`: texto actualizado a "click Use This Mask to commit"
    - Comentario del live preview actualizado
    - `postGeneratedMask` eliminado de 3 puntos de inicialización + cleanup en dispose
  - `PI Workflow_resources.jsh`:
    - Eliminado `button.Set to Active Mask`
    - Eliminado `button.Generate Active Mask`
    - Añadido `button.Use This Mask`
    - Actualizado tooltip `mask.memory.slot` para describir right-click=activate
    - Actualizado `section.Masking` y referencia interna `Masking` para reflejar nuevo nombre

**Regla permanente:** El modelo "imagen" es el referente. Para cualquier sistema de memoria/canvases en este script:
  1. Una sola variable de "estado activo" (no aliases redundantes)
  2. Una sola acción de promoción ("commit") via botón
  3. Right-click en memoria = recall + activate atomic (no two-step)
  4. Left-click en memoria = store al slot
  5. Sin métodos del manager que no tengan caller real

### v33-opt-9l — Mask live-preview geometry resample + duplicate tooltip key fix
**Bug 1:** Warning al iniciar el script: `property name button.Show/Hide Mask appears more than once in object literal` en `PI Workflow_resources.jsh` línea 221.
**Root cause Bug 1:** En v33-opt-9h al añadir tooltips para los controles del preview, añadí `"button.Show/Hide Mask"` sin notar que ya existía en línea 114 (añadida en v33-opt-8i durante la auditoría inicial de botones). SpiderMonkey evalúa la segunda definición (la última gana) pero emite warning.
**Fix Bug 1:** Borrada la duplicada en línea 221. La original (línea 114) era más concisa y se mantiene. Comentario inline indicando dónde está la original para futuros desarrolladores.

**Bug 2 (consecuencia directa de v9k):** "Curves live preview error: The active mask geometry does not match the target image" al activar Live + Use active mask.
**Root cause Bug 2:** En v9k corregí la polaridad de la máscara (white = process). Pero descubrí que también existía un mismatch de geometría no resuelto: `optCreateLiveCandidateView` (línea 11116) clona el view actual y lo **downsamplea** a `optLiveCandidateMaxDim` (típicamente 1024 px) para que el live preview sea responsive. La máscara activa (`dialog.postActiveMask`), sin embargo, es **full resolution** (la generada con "Generate Active Mask"). Cuando `optApplyMaskToProcessView` comparaba dimensiones lanzaba el error y abortaba el live preview.
**Fix Bug 2:** Patrón "resample-mask-on-the-fly" replicando el ya existente en `optPrepareCcSlotView` (líneas 11460-11466 — CC slots ya gestionaban este caso):
  1. `optApplyMaskToProcessView` detecta mismatch de dims
  2. Clona la máscara con `optCloneView`
  3. Resamplea el clone a las dimensiones EXACTAS del workView con `image.resample(W, H, Interpolation_Bilinear)` envuelto en beginProcess/endProcess
  4. Usa el clone como effective mask
  5. Devuelve un info object `{ transientMask: clone }` (antes devolvía boolean)
  6. `optClearProcessMask(workView, info)` ahora cierra el transient si existe
**Cambio de signature (mínimo, retrocompatible):**
  - `optApplyMaskToProcessView`: ahora devuelve `{transientMask}` o `null` (antes: `true`/`false`)
  - `optClearProcessMask`: segundo parámetro opcional `info`. Llamadas existentes sin info (CC slots, líneas 11502/11508) siguen funcionando porque allí gestionan su propio `tempMask` separadamente
  - El único caller que necesitaba update: `optRunPostOperationWithOptionalMask` — captura el info y lo pasa a clear
**Impacto:** Live preview ahora funciona con Use Active Mask para TODOS los Post processes (NR, Sharpening, Color Balance, Curves). El apply full-res sigue funcionando igual (no resampling porque dims ya coinciden).
**Por qué no apareció en v9k:** Antes del fix v9k de polaridad, mucha gente probablemente no usaba "Use Active Mask" con Live activado porque "nada cambiaba" (bug v9k). Tras v9k el efecto se ve correctamente, pero el primer click en Apply o el primer movimiento del slider con Live disparaba este error de geometría.
**Archivos modificados:**
  - `PI Workflow.js`: 
    - `optApplyMaskToProcessView` (línea 9589): reescrita ~30 líneas con clone+resample y nueva signature de retorno
    - `optClearProcessMask` (línea 9612): +1 parámetro opcional + cleanup del transient
    - `optRunPostOperationWithOptionalMask` (línea 9621): variable `maskApplied` → `maskInfo`
  - `PI Workflow_resources.jsh`: eliminada entrada duplicada `button.Show/Hide Mask` línea 221 con comentario referenciando la original

### v33-opt-9k — Mask memory labels + mask polarity for Post processes (2 bugs)
**Bug 1 reportado:** "Cuando guardo varias máscaras en memoria, parece que la última se copia a todas las demás."
**Root cause Bug 1:** Confusión visual por etiqueta no-única. `OptMaskMemoryManager.numberForSignature(sig)` (línea ~5343) asigna un número POR SIGNATURE Y LO REUSA en llamadas posteriores con la misma signature. Como la signature de máscaras es `"RS|Luminance"`, `"CM|Custom"`, etc. — depende solo del ALGORITMO + MODO, no de los parámetros concretos — tres máscaras de Range Selection con threshold distintos pero mismo modo (Luminance) generaban TODAS la etiqueta `"RS-LUM 1"`. Los datos del slot SÍ eran independientes (clones reales vía `optCloneView`), pero los botones mostraban el mismo texto → percepción de "la última sobreescribió las demás".
**Fix Bug 1:** Sustituir `numberForSignature(m.signature)` por `(index + 1)` (el índice del slot + 1) en `storeNext`, `storeNextShared` y `storeAt`. Ahora cada slot tiene etiqueta única basada en su posición: `"RS-LUM 1"`, `"RS-LUM 2"`, `"RS-LUM 3"`, etc. — refleja CORRECTAMENTE la independencia de los datos.
**Función `numberForSignature` queda dead code** en `OptMaskMemoryManager` (no en `OptMemoryManager` que sí la usa para image memories). Se conserva para no romper compatibilidad por si algún caller externo la usara; harmless.

**Bug 2 reportado:** "En Curves, al tener seleccionado 'Use Active Mask' no se aplica y las curvas no cambian ni en la zona de mascara ni en la zona sin mascara."
**Root cause Bug 2:** Polaridad invertida de la máscara. La UI dice explícitamente *"The mask are the white areas"* (línea 12225) — es decir, blanco = procesar. Pero PixInsight por defecto interpreta blanco = proteger / negro = procesar. `optApplyMaskToProcessView` (línea 9589) asignaba la máscara y la habilitaba pero **nunca seteaba `maskInverted = true`** → comportamiento opuesto a lo que la UI promete. Síntoma: con una máscara mayormente blanca (caso típico de Range Selection con threshold bajo en una imagen con nebulosa/estrellas brillantes), Curves casi no cambia nada visible porque solo procesa la pequeña zona negra restante (el fondo).
**Fix Bug 2:** Añadidas dos líneas:
  - En `optApplyMaskToProcessView`: `workView.window.maskInverted = true;` tras `maskEnabled = true`. Ahora blanco = procesa, alineado con la UI.
  - En `optClearProcessMask` (defensivo): `workView.window.maskInverted = false;` para resetear al default por si el workView sobreviviera al proceso.
**Impacto:** Afecta a TODOS los Post processes que usan máscara (NR, Sharpening, Color Balance, Curves) — todos pasan por `optApplyMaskToProcessView`. Bug 2 estaba latente desde el origen del módulo de máscaras; probablemente no se reportó antes porque NR/Sharpening son cambios sutiles donde el efecto inverso era menos visible. Curves es más localizado en tonos → el bug se hizo evidente.
**Comprobación cruzada:** Buscado `maskInverted` en todo el script → 0 ocurrencias antes del fix. Confirma que el setting nunca se tocaba.
**Archivos modificados:**
  - `PI Workflow.js`: 
    - `optApplyMaskToProcessView` (línea 9589): +2 líneas (maskInverted=true + comentario)
    - `optClearProcessMask` (línea 9602): +2 líneas (maskInverted=false defensivo + comentario)
    - `OptMaskMemoryManager.storeNext`, `storeNextShared`, `storeAt`: cambio de label en 3 sitios + comentario explicativo
**Regla permanente:** Cuando una operación en PixInsight usa máscaras, la convención de polaridad debe ser **explícita** en el código — nunca asumir el default. La UI debe coincidir con el comportamiento real: si la UI dice "white = processed", el código debe set `maskInverted = true`.

### v33-opt-9j — Rename "VeraLux HyperMetric" → "VeraLux" en UI, manual y comentarios cosméticos
**Cambio:** Renombrado el algoritmo en todos los textos visibles al usuario. "HyperMetric" desaparece de la UI, los tooltips y el manual.
**Sitios cambiados:**
  - `PI Workflow.js` (4 labels):
    - Array `stretchRgbNames` línea ~7126: opción del combo RGB/Starless
    - Array `stretchStarsNames` línea ~7156: opción del combo Stars
    - Combo de algoritmos zona Stars línea ~7881
    - Combo de algoritmos zona RGB/Starless línea ~7882
  - `PI Workflow_resources.jsh`:
    - Header de sección (línea 153): `"// --- Stretching: VeraLux HyperMetric ---"` → `"// --- Stretching: VeraLux ---"`
    - Tooltip `numeric.Log D (Stretch):` línea 155: `"(HyperMetric D parameter)"` → `"(D parameter)"`
  - `PI Workflow_help.xhtml` (4 descripciones de tablas y un párrafo):
    - Línea 438: tabla de Recommended Repositories
    - Línea 705: párrafo introductorio de Stretching engines
    - Línea 737: tabla de algoritmos zona RGB/Starless
    - Línea 765: tabla de algoritmos zona Stars
**Conservadas intencionalmente (NO cambiadas):**
  - `PI Workflow.js:1042` — comentario interno que cita el menú real de un script legacy de PixInsight (`"VHS-Porting > VeraLux HyperMetric Stretch"`). Es un literal de filesystem que existe en algunas instalaciones; cambiarlo perdería precisión técnica.
  - `PI Workflow.js:7765` — comentario interno que cita el nombre del script legacy `"HyperMetric Stretch script"` que el loader puede encontrar como segunda copia. Misma razón.
**Decisión documentada:** Mantener separación clara entre "lo que ve el usuario" (rename a VeraLux) y "lo que el código resuelve internamente" (referencias literales a nombres de script en disco). Si el día de mañana PixInsight renombra el script legacy, los dos comentarios se actualizarían en consecuencia.
**Archivos modificados:**
  - `PI Workflow.js`: 4 cambios pequeños
  - `PI Workflow_resources.jsh`: 2 cambios
  - `PI Workflow_help.xhtml`: 4 cambios
  - `context/PI_Workflow_Context.md`: esta entrada
**Regla permanente:** Cuando un nombre de algoritmo se renombre user-facing, distinguir entre (a) labels y tooltips (renombrar siempre), (b) descripciones de help (renombrar siempre), (c) comentarios que referencian filesystem/menú real de PixInsight (mantener literal para no perder precisión técnica).

### v33-opt-9i — VeraLux availability: trigger lazy-load in dependency probe
**Problema:** El usuario reportó (con R+G+B Stars en Stretching) que VeraLux salía como "no disponible" aunque estaba instalada. Ya había habido fixes previos para este síntoma (v125-OPT añadió rutas de candidates para VeraLux_lib.js, v126-OPT puso hard-includes), pero el problema reaparecía en sesiones donde el lib no se cargaba antes del primer dependency check.
**Root cause:** En `optApplyProcessAvailabilityToUI()` (línea ~6948), la flag `hasVLX` se calculaba como:
  ```javascript
  var hasVLX = optResolveVeraLuxProcessFunction() != null || optHasVeraLuxProcess();
  ```
  Ninguna de las dos llamadas dispara el **lazy load**:
  - `optResolveVeraLuxProcessFunction()` solo comprueba si `processVeraLux` está ya en el global scope
  - `optHasVeraLuxProcess()` solo busca un process icon nativo
  Si el lib aún no se había evaluado (sesión recién abierta, sin haber invocado VeraLux), ambas devolvían false → `hasVLX = false` → el botón Preview del Stretching se deshabilitaba permanentemente para la opción VLX.
  El script ya tenía un wrapper que SÍ dispara el lazy load: `optVeraLuxAvailable()` (línea 3543) que llama a `optEnsureVeraLuxSupportLoaded()`. Pero la availability UI no lo usaba.
**Fix:** Sustituir las dos comprobaciones por la llamada al wrapper que lazy-loadea:
  ```javascript
  var hasVLX = optVeraLuxAvailable();
  ```
**Coste:** El lib de VeraLux se evalúa al startup (una sola vez) en lugar de on-demand. ~100ms adicionales al arrancar el script, despreciable.
**Beneficio:**
  - `hasVLX = true` desde el primer dependency check si VeraLux está instalada en cualquier ruta candidata
  - El Preview button del Stretching (RGB/Starless y Stars) queda habilitado cuando el usuario elige VLX en el combo
  - Sin regresión: el dependency report en Configuration tab sigue funcionando porque usa su propia API (`runtime: function()` que comprueba `optResolveVeraLuxProcessFunction()` — válido tras el load)
**Verificación de scope:** Buscado en todo el script `optResolveVeraLuxProcessFunction\(\) != null \|\| optHasVeraLuxProcess` → solo 1 ocurrencia (la corregida). Sin otros sitios con el mismo patrón incompleto.
**Archivos modificados:**
  - `PI Workflow.js`: 1 línea cambiada en `optApplyProcessAvailabilityToUI` (línea ~6955) + comentario explicativo
**Regla permanente:** Cualquier feature que requiera lazy-load de scripts externos (VeraLux, GraXpert, MARS, etc.) DEBE invocar al wrapper que dispara el load (`optXxxAvailable`) en la availability probe, NO los predicados base que solo comprueban estado actual. De lo contrario el lib nunca se carga y la UI lo da como no disponible aunque esté instalado.

### v33-opt-9h — Tooltips for preview pane top controls
**Cambio:** Añadidos tooltips contextuales a los controles superiores del preview que estaban sin documentar al hover. Cubre las 4 zonas de control encima del área de imagen.
**Controles cubiertos:**
  1. **Image memory slots (8 botones "1"-"8")** — explica left-click=store, right-click=recall, scope=tab
  2. **Mask memory slots (N botones "1"-"N")** en Post y CC tabs — semántica idéntica pero sobre la active mask
  3. **Path buttons** (R, G, B, R+G+B, NB RGB, H, O, S, HO, OS, RGB + variantes _Starless/_Stars) — explica que cambian el slot activo del preview y que `[X]` marca el actual
  4. **Zoom** (label + combo) — Fit + porcentajes + scroll wheel para zoom continuo
  5. **Prev. Resol. Reduction** (label + combo) — downsampling solo del preview, exports/commits siempre full-res
  6. **Show/Hide Mask** — toggle visual entre máscara y imagen sin modificar la máscara
**Implementación:**
  - 6 entradas nuevas en `PI Workflow_resources.jsh` en bloque delimitado
  - 5 cambios pequeños en `PI Workflow.js`:
    - `OptPreviewPane` constructor: pre-cache de tooltips fuera del loop (memory slots, path buttons) + apply explícito a zoom y resolution (label + combo)
    - `optBuildMaskMemoryPanel`: pre-cache + apply en el loop de mask memory slots
  - `Show/Hide Mask` no necesitó cambio de código: `optButton(row, "Show/Hide Mask", ...)` busca automáticamente `button.Show/Hide Mask` en el diccionario vía `optApplyTooltip`
**Patrón usado:** Pre-caché de la cadena del diccionario fuera del loop (una sola llamada a `optTooltipTextByKey`) + asignación a `control.toolTip` dentro del loop, todo envuelto en try/catch para robustez. Mismo patrón que ya se usaba en `optBuildPreCropSection`.
**Ya cubierto previamente (no requirió cambios):**
  - `Toggle`, `Export`, `Set to Current`: ya tenían entrada en el diccionario (v33-opt-8i)
  - Memory `Reset` y Mask `Reset`: usan claves explícitas `reset.memory` y `reset.mask` aplicadas en los builders desde v33-opt-8i
**Archivos modificados:**
  - `PI Workflow.js`: ~25 líneas en 3 puntos (memory loop, path button loop, zoom/resolution block, mask memory loop)
  - `PI Workflow_resources.jsh`: 6 entradas nuevas en bloque delimitado
**Regla permanente reafirmada:** Para controles creados en loops (memory slots, path buttons, etc.) cachear la cadena del diccionario fuera del loop. Para labels y combos que comparten semántica con un control adyacente, aplicar el mismo tooltip a ambos (label + control activo) para que el hover funcione en cualquier zona.

### v33-opt-9g — Crop re-align: swap-back corrected pixels into originals
**Cambio de comportamiento (consciente):** Cuando Re-align está marcado en Apply to All, ahora los píxeles corregidos por StarAlignment se copian DE VUELTA a las vistas originales antes de cerrar los outputs `_registered`. Las vistas R, G, B, H mantienen su identidad (nombre, slot, posición en el workflow) pero pasan a contener los datos sub-píxel corregidos.
**Motivación:** En v9f los `_registered` se cerraban sin más → Re-align era inútil (los datos corregidos se descartaban). El usuario aclaró que su workflow real combina datos de fuentes con drift sub-píxel → necesita que Re-align CORRIJA, no solo valide.
**Implementación:**
  1. `optCropReAlignViews` ahora devuelve `result.pairs: [{target, aligned}]` (en vez de `newViews`) — preserva la relación original ↔ aligned necesaria para swap-back.
  2. Nuevo helper `optCropSwapBackAlignedPixels(target, aligned)`:
      - Verifica que dimensiones y nº de canales coincidan (defensa, ya garantizado por el same-crop previo)
      - Captura el WCS de aligned (que es el WCS del frame de referencia tras SA)
      - `target.beginProcess(UndoFlag_NoSwapFile) / target.image.assign(aligned.image) / target.endProcess()` — copia píxeles in-place con soporte de undo (mismo patrón usado en `optRunMGCCompatibleWorkflow` línea ~3833)
      - `optCropApplyWCSState(target, alignedWCS, 0, 0, w, h)` — sincroniza el WCS al nuevo contenido pixel (sin offsets porque no hay crop, mismas dimensiones)
  3. Handler de Apply to All: itera `res.pairs`, llama swap-back por cada uno, luego `optCloseView(pair.aligned)` por cada uno.
**Por qué copiar también el WCS:** Tras SA, `aligned` (ej. G_registered) lleva el WCS de la referencia (R) porque sus píxeles ahora viven en el frame de R. La vista original target (G) tenía su WCS antiguo que ya no se corresponde con los nuevos píxeles. Sincronizar WCS asegura que metadata y píxeles siguen consistentes — todo lo aguas abajo (SPCC, consultas plate-solve, etc.) sigue funcionando sin re-solver.
**Resultado completo del flujo Crop + Re-align:**
  ```
  R, G, B, H (alineadas por stacking, con WCS individuales)
     ↓ Crop con el mismo rectángulo
  R', G', B', H' (cropped, WCS ajustado con offset del crop)
     ↓ Re-align (SA con ref = R')
  Outputs: G_registered, B_registered, H_registered (en R's frame con R's WCS)
     ↓ Swap-back (assign + WCS sync)
  G' tiene píxeles de G_registered + WCS de R' (= WCS de G_registered)
  B' tiene píxeles de B_registered + WCS de R'
  H' tiene píxeles de H_registered + WCS de R'
     ↓ Close
  Workspace queda con R, G, B, H (nombres originales)
  con píxeles sub-píxel corregidos
  con WCS consistente (todos ahora compartiendo el frame de R)
  ```
**Por qué este es el comportamiento correcto:**
  - Re-align ahora CORRIGE de verdad (no solo valida)
  - Identidades preservadas (los slots siguen apuntando a R/G/B/H — el resto del workflow no necesita actualizarse)
  - Sin clutter en workspace (`_registered` cerradas)
  - WCS coherente entre canales (todos en frame R), lo que mejora SPCC, gradient correction, etc.
**Archivos modificados:**
  - `PI Workflow.js`:
    - `optCropReAlignViews`: signature cambiada (`newViews` → `pairs`)
    - Nuevo helper `optCropSwapBackAlignedPixels` (~50 líneas)
    - Handler de Apply to All actualizado para iterar pairs y hacer swap+close
**Regla permanente:** Cuando un proceso PI produce vistas auxiliares con datos derivados (no solo metadatos), siempre considerar tres opciones:
  1. **Cerrar sin más** (los datos derivados son ruido)
  2. **Swap-back** (los datos derivados son el resultado deseado, integrar in-place)
  3. **Renombrar/reemplazar slot** (los datos derivados sustituyen al original)
  El default histórico del script era (1), pero (2) es lo correcto cuando el proceso DEVUELVE una mejora real del dato. Documentar la decisión en el contexto.

### v33-opt-9f — Crop re-align: auto-close _registered output views
**Mejora:** Tras un Apply to All con Re-align marcado, las ventanas `_registered` producidas por `StarAlignment` (G_registered, B_registered, H_registered, etc.) quedaban abiertas en el workspace ocupando memoria. El usuario tenía que cerrarlas manualmente.
**Fix:** Tras el bloque de re-align, iterar `res.newViews` y cerrar cada vista con la utilidad centralizada existente `optCloseViews(views)` (línea 1587), que internamente llama `view.window.forceClose()` (línea 1582) — esta API de PJSR libera tanto la ventana del workspace COMO la memoria asignada al image.
**Por qué cerrar (y no integrar):** Las vistas `_registered` representan datos re-registrados sub-píxel respecto a la referencia, pero los crops originales ya estaban alineados a nivel de stacking (mismo offset de crop preserva la alineación relativa). Re-align actúa como pase de validación; los outputs no se integran de vuelta a los slots originales. Si en el futuro el usuario quiere ese behavior (swap-back), se haría con `originalView.image.assign(alignedView.image)` envuelto en beginProcess/endProcess antes del close.
**Aprovechamiento de infraestructura existente:** El script ya tiene 2 helpers para cierre seguro de vistas:
  - `optCloseView(view)` línea 1579 — cierra una vista única
  - `optCloseViews(views)` línea 1587 — cierra un array
  Ambos con try/catch internos. Igual patrón se usa en `optCloseAuxiliaryProcessWindows` (línea 2325) para limpiar outputs auxiliares de SPFC/SPCC/MGC tras esos procesos.
**Resultado:**
  - Workspace limpio tras Apply to All + Re-align
  - Memoria liberada (forceClose libera el Image asociado en PixInsight)
  - Console log explícito: lista los IDs cerrados ("closed _registered views: G_registered, B_registered, H_registered")
**Archivos modificados:**
  - `PI Workflow.js`: +8 líneas en el handler `dlg.__btnCropApplyAll.onClick` dentro del bloque CROP SECTION, después del log de re-align
**Regla permanente:** Cualquier feature que invoque procesos PI que produzcan vistas auxiliares NO destinadas al slot system del workflow DEBE cerrarlas explícitamente con `optCloseViews(...)`. Las vistas que sí se integran (vía `setRecord`) no se cierran — quedan bajo gestión del store. Pattern documentado: snapshot-diff para detectar las nuevas vistas + optCloseViews para limpiar las que no se conservan.

### v33-opt-9e — Crop Apply to All driven by visible slot buttons (not combos)
**Problema:** Tras varias iteraciones (v9b iteraba todos los combos → over-eager, v9c restringía al modo activo → demasiado restrictivo), el usuario reportó que con R, G, B y H cargados pero estando en modo MONO, Apply to All solo cropeaba R, G, B. H quedaba fuera aunque era una imagen legítima del workflow.
**Insight del usuario:** *"Lo que tiene que hacer el programa es ver qué botones están activos encima del preview y hacer crop en estas imágenes. No tengas en cuenta los combos sino los botones que hay encima de preview que indican qué imágenes han sido seleccionadas."*
**Modelo mental correcto:** Los botones de slot por encima del preview (R, G, B, L, H, O, S, HO, OS, MonoRGB, HSO, RGB, etc., y sus variantes _Starless/_Stars) representan **slots que el usuario ha registrado activamente en el workflow** (vía Process Separately, Combine, Process RGB, SXT). Estos son los datos del workflow real, distinguidos de:
  - **Combos de Image Selection**: pueden estar auto-rellenados por el script al detectar ventanas en el workspace con IDs coincidentes (R, G, H, etc.), sin que el usuario los haya activado en el workflow
  - **Mode-scoped slots**: subset de slots de un modo concreto, ignora slots de otros modos que el usuario sí activó
**Fix:** Iterar `dlg.preTab.preview.pathButtons` (los botones de la fila superior del preview) y filtrar por `btn.visible === true`. La visibilidad de un button se establece en `OptPreviewPane.refreshButtons()` mediante `this.dialog.store.isAvailable(key, this.tab)` — es decir, solo se hace visible cuando el slot fue registrado en el store del tab mediante `setRecord()`.
```javascript
var pathButtons = dlg.preTab.preview.pathButtons || {};
for (var key in pathButtons) {
   var btn = pathButtons[key];
   if (!btn || btn.visible !== true) continue;
   var rec = dlg.store.record(key);
   if (!rec || !optSafeView(rec.view)) continue;
   // ... dedup por view.id, push a views[]
}
```
**Beneficios:**
  - Cubre R, G, B + H + RGB + cualquier combinación cross-mode siempre que el usuario los haya registrado activamente
  - Ignora completamente las ghost views auto-detectadas en los combos
  - No depende del modo activo de Image Selection (UX consistente con lo que el usuario ve)
  - Mantiene la deduplicación por view.id (defensa contra el mismo view registrado bajo varias keys)
**Evolución completa del Apply to All:**
  - v9 inicial: solo modo activo, sin dedup → cropping anidado
  - v9b: TODOS los combos + dedup → over-eager, ghosts
  - v9c: solo modo activo + dedup → demasiado restrictivo, exclude legítimos cross-mode
  - **v9e: pathButtons visibles + dedup** ← versión correcta basada en el modelo mental del usuario
**Por qué pathButtons es la fuente correcta:**
  - Es la única estructura que refleja exactamente "imágenes activas en el workflow desde el punto de vista del usuario"
  - Independiente del estado de los combos (que pueden tener ruido auto-detectado)
  - Coherente con el flujo: el usuario carga → Process/Combine → ve los botones → trabaja con esos slots
**Archivos modificados:**
  - `PI Workflow.js`: handler `dlg.__btnCropApplyAll.onClick` reescrito (~50 líneas) dentro del bloque CROP SECTION
**Regla permanente:** Para operaciones masivas sobre "las imágenes del usuario", iterar `dlg.preTab.preview.pathButtons` filtrando por `btn.visible === true` y obtener los views desde `dlg.store.record(key).view`. NO iterar `selection.combos` (pueden tener ghosts). NO restringir por `selection.mode` (excluye slots cross-mode legítimos).

### v33-opt-9d — Crop re-align: detect output view via workspace snapshot diff
**Problema:** Tras Apply to All con Re-align marcado, la consola mostraba `Crop re-align: 0 aligned, 2 failed` aunque StarAlignment ejecutaba correctamente y generaba las vistas registradas (`G_registered`, `B_registered`).
**Root cause:** Mi código buscaba el output con `ImageWindow.windowById(v.id + "_r")`. La propiedad `StarAlignment.outputSuffix = "_r"` aplica SOLO a archivos en disco (output a fichero), NO a vistas en memoria. PixInsight nombra las vistas in-memory siempre como `<src>_registered` (o `<src>_registered2`, etc. si ya existe el nombre). Mi lookup nunca encontraba la vista → marcaba como fallida aunque el proceso hubiera tenido éxito.
**Fix:** Sustituido el lookup por nombre por el patrón **snapshot-diff** ya usado en otros sitios del script (`optRunMGCCompatibleWorkflow` línea ~3654):
  1. Antes de cada `SA.executeOn(v)`: `var beforeMap = optCaptureOpenWindowIdMap()` captura el set de IDs de ventanas abiertas en el workspace.
  2. Tras la ejecución (si `executeOn` devolvió `true`): se itera `ImageWindow.windows` y se identifica la primera ventana NUEVA (no presente en beforeMap) que NO sea la referencia.
  3. Prioriza ventanas cuyo ID empiece por `"<v.id>_"` (matchea `_registered`, `_registered2`, etc.) y mantiene un fallback a cualquier otra vista nueva por si una build inusual de PI usa otra convención.
**Por qué snapshot-diff es la forma correcta:**
  - Es robusto frente a cualquier convención de naming (presente o futura) de PixInsight
  - Detecta colisiones de nombre (cuando ya existe `G_registered`, PI usa `G_registered2`)
  - No depende de propiedades del proceso que solo afectan al disk I/O
  - Es el patrón estándar que el script ya usa para detectar outputs de procesos PI (MGC, SPCC, VeraLux, etc.)
**Eliminado:** `SA.outputSuffix = "_r"` (era inútil porque no escribíamos a disco; mantenerlo era engañoso).
**Resultado:**
  - `result.aligned` cuenta correctamente las alineaciones exitosas
  - El usuario ve `Crop re-align: 2 aligned, 0 failed` en lugar de `0 / 2 failed`
  - `result.newViews` contiene las vistas reales `<src>_registered`
**Archivos modificados:**
  - `PI Workflow.js`: helper `optCropReAlignViews` reescrito (~60 líneas) dentro del bloque CROP SECTION
**Regla permanente:** Para detectar el output de un proceso PixInsight que genera nuevas ventanas (StarAlignment, ImageIntegration, MGC, etc.), usar SIEMPRE el patrón `optCaptureOpenWindowIdMap` antes + diff después. NO depender de naming conventions ni de `outputSuffix` / `outputPrefix` (que solo aplican a archivos en disco).

### v33-opt-9c — Crop: Apply to All scoped to ACTIVE mode (revert over-eager v9b)
**Problema:** Tras v33-opt-9b (que pasaba a iterar TODOS los combos de TODOS los modos), el usuario con solo R, G, B visibles (modo MONO) reportó que Apply to All procesaba 6 vistas (R, G, B, H, L, RGB) en vez de las 3 visibles. El re-align fallaba en H/L/RGB porque son contenidos distintos (narrowband, luminance de otra sesión, RGB combinado) que no comparten patrón estelar con R/G/B.
**Root cause:** El script auto-rellena los combos de Image Selection cuando detecta ventanas en el workspace con IDs que coinciden con los nombres canónicos (H, L, RGB, etc.). El usuario podía tener esas ventanas abiertas de sesiones previas, aunque no las usara activamente. v33-opt-9b iteraba TODOS los combos (`selection.combos`) sin filtrar por modo visible → procesaba esas ventanas no deseadas.
**Mental model correcto:** "Apply to All" significa para el usuario "aplica al conjunto de imágenes que veo arriba del preview" — es decir, los slots VISIBLES en el modo activo. No los slots ocultos de otros modos.
**Fix (revert parcial de v9b):** Volver a la iteración por modo activo:
  - MONO: R, G, B, L_MONO
  - NB: H, O, S, L, HO, OS
  - RGB: RGB
  - Mantener la deduplicación por `view.id` introducida en v9b (sigue siendo necesaria por si el usuario selecciona el mismo archivo en varios slots, ej. mismo archivo en L_MONO y otro).
**Eliminado:** El truco de incluir `preview.currentView` como red de seguridad (introducido en v9b). En la práctica disparaba el mismo bug: el currentView podía ser una vista de otro modo o un output de combine que no debía cropearse en batch.
**Para outputs de combine (MonoRGB, NbRGB):** Si el usuario quiere recortarlos, usa `Apply to Current` después de combinar. Es coherente con el slot system del script (los outputs de combine viven en el store, no en los combos de Image Selection).
**Por qué dos vueltas (v9b → v9c):**
  - v9 inicial: solo modo activo, pero faltaba dedup → mismo view en varios slots se cropeaba N veces → "muy recortada"
  - v9b: dedup correcta pero amplió el alcance a TODOS los combos → procesaba slots no visibles
  - v9c: combina lo mejor de ambos — modo activo + dedup
**Aprendizaje documentado:** "Visible scope" como principio rector. La iteración para acciones masivas debe ceñirse a lo que el usuario tiene a la vista, no a todo el state interno del script. Si en el futuro se añade más auto-detección o slots compartidos entre modos, este principio debe aplicarse.
**Archivos modificados:**
  - `PI Workflow.js`: handler `dlg.__btnCropApplyAll.onClick` reescrito (~60 líneas modificadas dentro del bloque CROP SECTION)

### v33-opt-9b — Crop: Apply to All iterates ALL modes + dedup
**Problema:** Apply to All solo recortaba las imágenes del modo activo (`dlg.preTab.selection.mode`). Si el usuario tenía cargadas imágenes en distintos slots de distintos modos (R/G/B en MONO, RGB en RGB, H en NB) y estaba en NB cuando pulsó Apply to All, solo se recortaba H. Además, si la misma vista estaba seleccionada en varios slots (caso típico de usar L_MONO y L como la misma imagen), se recortaba varias veces seguidas → imagen "muy recortada" (cropping anidado destructivo).
**Síntoma observado:** Usuario con R, G, B, RGB, H cargados pulsó Apply to All → solo apareció H, y aparecía "muy recortada".
**Root cause #1 — Mode restriction:** El array `keys` se limitaba al modo activo:
  ```javascript
  if (mode === "MONO")    keys = ["R", "G", "B", "L_MONO"];
  else if (mode === "NB") keys = ["H", "O", "S", "L", "HO", "OS"];
  else                    keys = ["RGB"];
  ```
**Root cause #2 — Falta de deduplicación:** Si una misma vista (mismo `view.id`) aparecía en varios slots (ej. mismo archivo seleccionado en R, G, B), `optCropApplyToView` se ejecutaba N veces sobre ella → cada llamada cropeaba el resultado de la anterior → cropping anidado.
**Fix:**
  1. Iterar TODOS los combos disponibles en `dlg.preTab.selection.combos` independientemente del modo. Esto cubre R, G, B, L_MONO (MONO) + H, O, S, L, HO, OS (NB) + RGB (RGB).
  2. Incluir adicionalmente la vista activa del preview (`dlg.preTab.preview.currentView`) para cubrir outputs de combine que no están en ningún combo (MonoRGB, NbRGB con su recipe key, etc.).
  3. Deduplicar por `view.id` mediante un set `seen[]` antes de aplicar el crop. Cada vista única se procesa una sola vez.
  4. Log mejorado: lista los IDs de las vistas efectivamente recortadas para que el usuario pueda verificarlo en la consola.
**Resultado:**
  - Apply to All ahora recorta todas las imágenes cargadas, independientemente del modo activo
  - Imposible cropping anidado: cada vista se toca una sola vez por click
**Archivos modificados:**
  - `PI Workflow.js`: solo cambiado el handler `dlg.__btnCropApplyAll.onClick` dentro del bloque CROP SECTION (~50 líneas modificadas)

### v33-opt-9a — Crop: suppress WCS warning + preserve astrometric solution
**Problema:** Al aplicar el Crop en una vista con solución astrométrica, PixInsight mostraba un MessageBox de confirmación ("la solución astrométrica se invalidará, ¿continuar?"). Además, aunque la respuesta fuera "Sí", la solución se perdía y había que re-plate-solve.
**Root cause:** El proceso nativo `Crop` detecta la propiedad `PCL:AstrometricSolution:*` y muestra el aviso. Aunque las cabeceras FITS pudieran adaptarse, la propiedad PI se descartaba.
**Fix:** Reescritura de `optCropApplyToView` en dos partes:
  1. **Sin diálogo:** se sustituye el proceso `Crop` por la API low-level `image.cropTo(new Rect(x0, y0, x1, y1))`, que opera directamente sobre los píxeles sin disparar el sistema de procesos de PI y por tanto sin ningún MessageBox. Operación envuelta en `view.beginProcess(UndoFlag_NoSwapFile) / endProcess()` para preservar el undo del usuario.
  2. **Preservación de WCS:**
      - Antes del crop, `optCropCaptureWCSState(view)` captura:
        - Todas las propiedades `PCL:AstrometricSolution:*` (13 propiedades cubiertas)
        - Las cabeceras FITS de WCS (CRPIX, CRVAL, CD/PC, CDELT, CTYPE, CROTA, PV, LONPOLE, LATPOLE, RADESYS, EQUINOX, EPOCH)
      - Tras el crop, `optCropApplyWCSState(view, state, cropX, cropY, newW, newH)` reaplica el estado, con los siguientes ajustes:
        - `PCL:AstrometricSolution:ReferencePixel`: nueva Vector([px - cropX, py - cropY])
        - `PCL:AstrometricSolution:ProjectionOrigin`: idem (si existe)
        - Resto de propiedades: restauradas tal cual (son coordenadas del cielo o matrices de proyección que no dependen del píxel)
        - Cabecera `CRPIX1`: `n - cropX`; cabecera `CRPIX2`: `n - cropY`
        - Resto de cabeceras WCS: restauradas tal cual
        - `NAXIS1`/`NAXIS2`: actualizadas a las nuevas dimensiones
**Fallback defensivo:** Si `image.cropTo()` falla por cualquier motivo (versión de PI inusual), se cae a `new Crop()` PERO antes se borran las propiedades astrométricas con `deleteProperty` para que PI no tenga nada que invalidar y no muestre el diálogo. Después se reaplica el WCS con el mismo helper.
**Resultado:**
  - Cero diálogos modales durante el Apply
  - La solución astrométrica sobrevive al crop con CRPIX correcto
  - Plate-solve no es necesario después del crop
  - Undo funciona normalmente (UndoFlag_NoSwapFile coherente con el resto del script)
**Arquitectura:**
  - Añadidos 2 helpers nuevos (`optCropCaptureWCSState`, `optCropApplyWCSState`) dentro del bloque CROP SECTION
  - Reescrito `optCropApplyToView` (sustituye a la versión anterior)
  - Añadidas 3 constantes top-level dentro del bloque: `OPT_CROP_WCS_PROPERTIES`, `OPT_CROP_WCS_KEYWORDS_PIXELSHIFT`, `OPT_CROP_WCS_KEYWORDS_PRESERVE`
  - El bloque sigue siendo "easy-rollback" — todo dentro de los marcadores `>>> CROP SECTION` y `<<< END CROP SECTION`
**Archivos modificados:**
  - `PI Workflow.js`: bloque `optCropApplyToView` ampliado de ~30 a ~110 líneas (helpers nuevos + reescritura)
**Regla permanente:** Para cualquier operación que cambie dimensiones de píxel de un view con WCS, capturar el estado WCS antes y reaplicarlo después con los offsets ajustados. NO usar el proceso `Crop` directo si se quiere preservar la solución astrométrica sin diálogos — usar `image.cropTo()` low-level.

### v33-opt-9 — Crop section in Pre Processing (manual + auto + handles)
**Feature:** Nueva sección "Crop" en Pre Processing, entre Image Selection y Plate Solving. Permite recortar las imágenes para eliminar bordes defectuosos del stacking, con tres modos de uso que conviven:
  1. **Manual**: SHIFT + drag en el preview dibuja un rectángulo
  2. **Automático**: botón `Auto-detect Edges` detecta los bordes válidos
  3. **Edición**: 8 handles (4 esquinas + 4 medios) para redimensionar; arrastrar el interior mueve el rectángulo

**Aplicación:**
  - `Apply to Current`: recorta solo el view actualmente activo en preview
  - `Apply to All`: recorta TODOS los views cargados del modo activo con el mismo rectángulo
    - MONO: R, G, B, L
    - NB: H, O, S, L, HO, OS
    - RGB: solo el RGB
  - Como el rectángulo es idéntico, las imágenes conservan su alineación relativa pixel-perfect
  - Checkbox opcional `Re-align after multi-crop`: ejecuta `StarAlignment` con el primer view como referencia (produce vistas con sufijo `_r`)

**Tratamiento de astrometría (WCS):**
  - Se usa el proceso nativo `Crop` de PixInsight (no PixelMath ni manipulación manual)
  - `Crop` actualiza automáticamente las cabeceras astrométricas: desplaza `CRPIX1/CRPIX2` por los offsets del recorte, ajusta `NAXIS1/NAXIS2`, y mantiene `CRVAL`, matriz CD, `CTYPE` (que no cambian — son del cielo y de la proyección, no del píxel)
  - Conclusión documentada: copiar cabeceras tal cual sería incorrecto (los píxeles se han movido), pero el `Crop` nativo lo resuelve sin intervención manual

**Algoritmo de auto-detección (eficiente):**
  - Para cada fila/columna: `validez = minimum(strip) > 1e-8`
  - Los defectos de stacking tienen valor exactamente 0; los píxeles reales están por encima del piso de ruido
  - Búsqueda por borde: scan COARSE (paso 16) + refinamiento FINE dentro de la ventana de 16 px → O((W+H)/16 + 32) llamadas a `image.minimum()` por borde
  - PJSR ejecuta `minimum()` en C++ sobre el `selectedRect` → milisegundos incluso en imágenes 8K
  - Multi-canal: se toma el min entre canales (defecto = cero en todos los canales)

**Mecanismo de mouse + paint:**
  - Reutiliza el sistema de callbacks ya existente en `OptPreviewControl`: `onImageMousePress/Move/Release` y `onOverlayPaint` (líneas 5511-5516)
  - Esos callbacks reciben coordenadas YA convertidas a píxeles de imagen — no hay que hacer mapping manual
  - El overlay usa la fórmula `viewportX = (imgX / kx) * sc - sx` (mismo patrón que `optRenderFameOverlay`)
  - Visual: 4 strips translúcidos oscurecen el área fuera del rectángulo + borde ámbar 2px + 8 handles cuadrados con borde negro
  - Tolerancia de hit-test: 10 px en espacio viewport (escala con zoom)

**Arquitectura para rollback fácil:**
  - TODO el código en un bloque contiguo marcado con `>>> CROP SECTION — v33-opt-9 — easy-rollback block <<<` y `<<< END CROP SECTION — v33-opt-9 ... >>>`
  - Helpers prefijados `optCrop*`, handles UI prefijados `dlg.__crop*`, estado único `dlg.cropState`
  - UNA línea modificada en código foráneo: `optBuildPreCropSection(this);` dentro de `configurePreTab`, justo antes del addProcessSection("Plate Solving")
  - 5 entradas nuevas en `PI Workflow_resources.jsh` claramente delimitadas
  - Rollback completo: borrar el bloque + borrar la línea + borrar las entradas de tooltips

**Decisiones de diseño documentadas:**
  - `Crop` modifica el view IN PLACE → reusa el undo nativo de PixInsight; sin clutter de "_cropped" views
  - `StarAlignment` SÍ produce nuevas views `_r` (es destructivo geométricamente; PI no permite in-place); el usuario gestiona los originales
  - El rectángulo se mantiene entre cambios de canonical view si el tamaño coincide; si no, el overlay no se pinta (auto-clear visual sin tocar state — el state se limpia al Apply o Clear)
  - SHIFT como modificador para nueva selección (no interfiere con pan que es drag sin modificador)
  - Botón en lugar de checkbox para la decisión de re-alinear NO se hizo: se usó checkbox para que sea un flujo single-action (crop + opcionalmente re-align en un solo gesto)

**Archivos modificados:**
  - `PI Workflow.js`: bloque contiguo ~470 líneas antes de `configurePreTab` + 1 línea dentro de `configurePreTab`
  - `PI Workflow_resources.jsh`: 5 entradas nuevas en bloque delimitado
  - `context/PI_Workflow_Context.md`: este apartado v33-opt-9
  - `PI Workflow_help.xhtml`: nueva subsección "4.1b. Crop" (numeración no disruptiva)

**Regla permanente:** Si se añaden nuevos modos al `Image Selection`, actualizar el array `keys` en el handler de `Apply to All` (dentro de `optBuildPreCropSection`) con los nuevos slot keys.

### v33-opt-8n — UI policies re-evaluated on canonical view change
**Problema:** Al cargar una imagen H (mono) y luego cambiar a modo RGB cargando una imagen RGB y pulsando `Process RGB`, las secciones de color seguían apareciendo deshabilitadas aunque el canonical ya era RGB. El usuario tenía que cambiar de tab o forzar otro refresh para que las policies se re-evaluaran.
**Root cause:** Orden de operaciones en `OptWorkflowTab.prototype.setRecord` (línea 6828):
  ```
  1. store.setView(...)                  // canonical data updated
  2. refreshWorkflowButtons()            // -> applyUIPolicies() reads STALE preview.currentView
  3. preview.activate(key, true)         // -> sets currentView to the NEW view
  ```
  El hook de policies estaba en `refreshWorkflowButtons()` (paso 2), pero `canonicalIsColor()` consulta `tab.preview.currentView`, que todavía no se actualiza hasta el paso 3. Resultado: policies leían el view anterior y mantenían la imagen como mono.
**Fix:** Hook de `applyUIPolicies()` añadido al final de `OptPreviewPane.prototype.activate()` (línea ~6346), DESPUÉS de `this.currentView = rec.view` y `this.refreshButtons()`. De esta forma cualquier cambio de view (independientemente del caller — setRecord, recall de memoria, switch entre slots, cargar imagen nueva, etc.) dispara automáticamente la re-evaluación de policies.
**Por qué activate() es el sitio correcto:**
  - Es el único punto que actualiza `currentView` en el script.
  - Tiene ~13 callsites distintos: setRecord (combineMono/Nb, processRgb, processSeparate*), tab.preview.activate desde stretch tabs, CC tab, recall de memoria, etc. Hookear aquí cubre TODOS sin tener que añadir llamadas explícitas en cada caller.
  - Es coste despreciable: 9 policies × ~3 controles cada = ~27 micro-operaciones (`.enabled = ...`, `.toolTip = ...`) por activate.
**Mantenimiento del hook en refreshWorkflowButtons:** Se mantiene la llamada existente desde Phase 1 (línea 12407). Aunque ahora puede ejecutarse dos veces consecutivas (una desde refreshWorkflowButtons, otra desde activate inmediatamente después), no genera flicker visible — son operaciones idempotentes y muy rápidas. Mantener ambos hooks aporta robustez: si en el futuro alguien llama `refreshWorkflowButtons` SIN pasar por `activate`, las policies siguen consistentes.
**Archivos modificados:**
  - `PI Workflow.js` línea ~6346: +7 líneas (hook en activate con try/catch).
**Regla permanente:** Cualquier lugar que cambie el "canonical view" (la imagen activa para procesar) DEBE ir a través de `OptPreviewPane.prototype.activate()`. NO modificar `preview.currentView` directamente desde otros sitios, porque rompería el ciclo automático de policy + refresh.

### v33-opt-8m — CSS `:disabled` rules for primary/mode buttons
**Problema:** Los botones del tipo `optPrimaryButton` (Apply Color Balance, SPCC, Auto Linear Fit, Background Neutralization, etc.) y los botones de modo (`OPT_CSS_MODE_ON/OFF`) se deshabilitaban funcionalmente (no respondían al click) pero NO cambiaban visualmente — seguían pareciendo "activos". Los policies de v33-opt-8k/l funcionaban correctamente a nivel lógico, pero el usuario no veía feedback visual del estado deshabilitado.
**Root cause:** Cascada CSS de Qt. El stylesheet GLOBAL (`OPT_CSS_GLOBAL`, línea 170) sí define `QPushButton:disabled` correctamente, pero los stylesheets per-botón (`OPT_CSS_PRIMARY`, `OPT_CSS_MODE_ON`, `OPT_CSS_MODE_OFF`) sobrescriben al global y NO definían la pseudo-clase `:disabled`. Resultado: cuando se ponía `button.enabled = false`, Qt mantenía el fondo de color porque no había regla de fallback que cambiara el aspecto.
**Comparativa antes/después:**
  - `OPT_CSS_PRIMARY` (línea 206): ❌ sin `:disabled` → fondo primario se mantenía
  - `OPT_CSS_MODE_ON` (línea 198): ❌ sin `:disabled` → fondo bgPanelAlt se mantenía
  - `OPT_CSS_MODE_OFF` (línea 202): ❌ sin `:disabled` → fondo bgInset se mantenía
  - `OPT_CSS_SET_CURRENT` (línea 211): ✅ ya tenía `:disabled` (referencia correcta)
**Fix:** Añadida regla `QPushButton:disabled` a los 3 stylesheets afectados. Se usan los mismos colores que en `OPT_CSS_GLOBAL` y `OPT_CSS_SET_CURRENT` (`bgPanel` + `textMute` + `border`) para consistencia visual con el resto del script.
**Archivos modificados:**
  - `PI Workflow.js` líneas ~198-209: +3 líneas (una regla `:disabled` por cada CSS).
**Beneficios colaterales:**
  - Los dependency checks (SPCC/BXT/SXT/MARS no instalados) ahora también producen botones visualmente grises.
  - Cualquier futuro `enabled = false` sobre un `optPrimaryButton` o botón de modo se verá automáticamente grisado.
  - Consistencia visual global: el lenguaje "esto está deshabilitado" es ahora idéntico en todo el script.
**Regla permanente:** Cuando se cree un nuevo `OPT_CSS_xxx` para botones, **siempre** incluir la pseudo-clase `:disabled` con los colores estándar (`bgPanel` + `textMute` + `border`). Verificar que cualquier nuevo estilo siga el patrón documentado.

### v33-opt-8l — UI Gating Policies Phase 2 (granular sub-controls)
**Cambio:** Extensión del sistema declarativo introducido en v33-opt-8k. Cero cambios estructurales: solo se añaden 6 entradas al registry `uiPolicies`. El motor `applyUIPolicies()`, el helper `optApplyPolicyToTarget()` y los predicados `canonical-rgb-*` permanecen idénticos.
**Validación arquitectónica:** Phase 2 confirmó que el diseño de Phase 1 escala sin refactor. Añadir sub-controles solo requirió:
  1. Exponer un handle nuevo (`dlg.__postCurvesChannelRow`).
  2. Añadir 6 entradas al array `uiPolicies` con `targets` específicos.
**Políticas Fase 2 añadidas (granulares):**
  - `pre.mgc.colorChannels` → `ncMgcScaleG`, `ncMgcScaleB` (R/K queda enabled porque en mono el canal único mapea a K).
  - `stretch.mas.colorSat` → `msCS`, `msCSAmount`, `msCSBoost`, `msCSLightness` en **ambas zonas** (RGB y Stars).
  - `stretch.starStretch.color` → `starSat`, `starRemoveGreen` en la zona Stars (la zona RGB no tiene Star Stretch).
  - `stretch.curves.color` → `curvesChan.row` y `curvesSaturation` en **ambas zonas**.
  - `post.nr.color` → `chkPostNxtColorSep`, `ncPostNxtDenoiseColor`, `ncPostNxtDenoiseLFColor`, `ncPostTgvStrengthC`, `ncPostCCNRColor` (NXT, TGV y CC Denoise).
  - `post.curves.color` → `__postCurvesChannelRow`, `ncPostCurvesSaturation`.
**Total políticas activas tras Phase 2:** 9 (3 coarse + 6 granulares).
**Handles expuestos en Phase 2:**
  - `dlg.__postCurvesChannelRow` — guarda `row.row` en la construcción del combo Channel de Post Curves (~línea 11062-11070).
  - Resto: ya existían (`ncMgcScaleG/B`, `stretchZoneRgb/Stars` con sus propiedades zone, controles Post NR/Curves ya con prefijo `dlg.`).
**Decisiones de diseño:**
  - **Combos Channel (Curves)**: se deshabilita el `row` completo (label + combo). NO se fuerza `currentItem = 0` para evitar disparar `onItemSelected` durante el toggle. La selección previa permanece visible greyed; al rehabilitar el usuario puede cambiarla.
  - **MAS msCS checkbox**: se deshabilita el checkbox junto con sus dependientes. El engine ya rechaza color saturation en mono (`isRGB && params.ms_cs` en línea ~7507), así que el efecto era nulo; la UI ahora lo refleja.
  - **CC Denoise Mode combo** (Luminance Only vs Full Image): NO se gatea aunque sea conceptualmente redundante en mono. Decisión: mantener scope estricto a controles estrictamente color-dependientes. Si más adelante se considera ruido visual, añadir entrada con `currentItem = 0` forzado.
**Reglas permanentes confirmadas:**
  - Para gatear un sub-control basta con: 1) asegurar que existe como `dlg.xxx` o `zone.xxx`, 2) añadir entrada al array de `buildUIPolicies()`.
  - Si el handle no existe, exponerlo con la mínima modificación posible (asignar a `dlg.__nombre`).
  - Nunca hacer fuerza de currentItem en combos durante el toggle de policy (riesgo de side-effects en `onItemSelected`).
**Archivos modificados:**
  - `PI Workflow.js`: +1 línea de exposición de handle + 80 líneas de entradas en `buildUIPolicies`.

### v33-opt-8k — Centralized UI Gating Policy System (Phase 1: coarse)
**Cambio:** Sistema declarativo de políticas UI que centraliza el habilitado/deshabilitado de controles según condiciones (canonical RGB, en el futuro: máscara activa, proceso instalado, etc.).
**Motivación:** Eliminar la confusión de tener controles de color visibles (Color Calibration, Color Balance, Color Mask) cuando la imagen canónica es monocroma. El engine ya hace los checks `numberOfChannels >= 3` internamente, pero la UI no lo reflejaba.
**Arquitectura:** Tres piezas en `PI Workflow.js` (zona línea ~12378):
  1. **`canonicalIsColor(tabName)`** — helper que devuelve `true` si la imagen canónica de un tab tiene ≥3 canales.
  2. **`uiPredicates`** — registry de predicados nombrados (`canonical-rgb-pre`, `canonical-rgb-stretch`, `canonical-rgb-post`). Extensible: añadir nuevas funciones al objeto.
  3. **`uiPolicies`** (construido por `buildUIPolicies()`) — registry de reglas. Cada regla tiene `{ id, requires, message, targets }`. Extensible: añadir entradas al array.
  4. **`applyUIPolicies()`** — motor que recorre el registry, evalúa cada predicado y aplica enable/disable + tooltip swap mediante el helper `optApplyPolicyToTarget()`.
**Políticas Fase 1 (coarse, 3 secciones):**
  - `pre.colorCalibration` → botones SPCC, Auto Linear Fit, Background Neutralization
  - `post.colorBalance` → sección entera Color Balance (body, dejando el bar clickable para colapsar)
  - `post.colorMask` → grupo `postColorMaskGroup` (solo el inner group)
**Tooltip único genérico:** `policy.requiresRGB` en `PI Workflow_resources.jsh` → *"Requires an RGB image. Combine R+G+B (or H+O+S) in Image Selection first."*
**Hooks de re-evaluación automática:**
  - `runDependencyChecks()` (línea ~12378): llama `applyUIPolicies()` al final.
  - `refreshWorkflowButtons()` (línea ~12407): llama `applyUIPolicies()` al final. Este se invoca desde `setRecord`, `combineMono`, `combineNb`, `processSeparateMono`, `onTabChanged` y otros puntos de cambio de estado canónico → re-evaluación automática sin trabajo adicional.
**Handles nuevos expuestos:**
  - `dlg.preTab.btnPreALF` y `dlg.preTab.btnPreBN` (atributo `name:` añadido a los specs en `addProcessSection`).
  - `dlg.__sectionPreColorCalibration` y `dlg.__sectionPostColorBalance` (capturan el return de `addProcessSection`).
**Detalle sutil — orden de inicialización:**
  - `buildUIPolicies()` y la primera invocación de `applyUIPolicies()` se ejecutan DESPUÉS de `optApplyContextTooltipsDeep(this, 0)`. Esto es crítico porque el helper cachea el `__origTooltip` del control en su primera ejecución; si se hace antes, cachearía strings vacíos y al rehabilitar el tooltip dictionary se perdería.
**Fase 2 (granular, futuro) preparada:**
  - Misma estructura admite sub-controles (ej. MAS Color Saturation dentro de MAS, opciones R/G/B del combo Curves, controles `Denoise color` de NXT, etc.).
  - Cero refactor: solo añadir entradas al array `uiPolicies` con `targets` apuntando a los sub-controles concretos.
**Regla permanente para nuevas funciones de color:**
  1. Si requiere RGB → añadir entrada en `buildUIPolicies()` con `requires: "canonical-rgb-<tab>"`.
  2. Si requiere una nueva condición → añadir predicado en `uiPredicates` + mensaje en `PI Workflow_resources.jsh` como `policy.<nombre>`.
**Archivos modificados:**
  - `PI Workflow.js`: bloque centralizado (~100 líneas) + 4 puntos de exposición de handles + 2 hooks + reordenación de init.
  - `PI Workflow_resources.jsh`: 1 entrada `policy.requiresRGB`.
  - `PI Workflow_help.xhtml`: notas breves en secciones 4 y 5 sobre el comportamiento.

### v33-opt-8j — Remove duplicate "Assemble to RGB" button
**Cambio:** Eliminado el botón `Assemble to RGB` de Pre Processing → Color Calibration.
**Motivo:** Era un duplicado funcional del botón `Combine R+G+B` del bloque Image Selection. Ambos invocaban `tab.combineMono()`; mantener solo el del panel Image Selection clarifica el flujo (el ensamblaje pertenece a Image Selection, no a Color Calibration) y reduce ruido en la UI.
**Archivos modificados:**
  - `PI Workflow.js` línea ~8378: removida la entrada `{ text: "Assemble to RGB", stage: "Assemble RGB", action: tab.combineMono }` del array de `addProcessSection("Color Calibration", ...)`.
  - `PI Workflow_resources.jsh` línea ~217: eliminada la entrada `"button.Assemble to RGB"` del diccionario de tooltips.
  - `PI Workflow_help.xhtml` sección 4.1: actualizado el texto para referenciar el botón superviviente (`Combine R+G+B` en Image Selection).
**Preservado:** La función `OptWorkflowTab.prototype.combineMono` (línea 6838) se mantiene intacta — sigue siendo llamada por `selection.btnCombineMono` (línea 6821) en modo MONO/NARROWBAND.
**Regla permanente:** Antes de eliminar un botón, comprobar TODOS los callers de su `action` por si la función es compartida; eliminar el handler solo si nadie más la usa.

### v33-opt-8i — Specific Tooltips for All Buttons
**Cambio:** Eliminar el fallback genérico `"Runs the action named on the button"` añadiendo descripciones específicas para todos los botones del workflow.
**Cómo funciona:** `optButton()` ya llama `optApplyTooltip(b, 'button', text, 'Button')` automáticamente al crear cada botón. El sistema busca primero `button.<text>` en el diccionario; solo si no existe cae al `generic.Button`. Por tanto basta con añadir entradas específicas al diccionario para que los tooltips genéricos desaparezcan.
**Excepciones (claves explícitas en código):**
  - 3 botones "Reset" comparten label pero significan cosas distintas → `reset.memory`, `reset.mask`, `reset.fame` aplicados manualmente
  - 12 botones de paleta narrowband (SHO, HOO, ...) → `recipe.<NAME>` aplicado en el loop de construcción
**25 nuevas entradas en diccionario:**
  - Pre/Post apply buttons: Gradient Correction, Assemble to RGB, SPCC, Auto Linear Fit, Background Neutralization, Deconvolution, Apply Color Balance, Apply Curves
  - Image Selection: R+G+B, NB, RGB, Combine R+G+B, Process Separately, Combine H+O+S, Process RGB, Toggle, Export
  - Toolbar/FAME/Mask: Help, Next, Undo, Clear Mask
  - 12 paletas narrowband con descripción de mapping H/O/S → R/G/B
**Regla permanente:** Para añadir un nuevo botón con tooltip específico solo hace falta añadir `"button.<text>": "<b>...</b><br/>..."` al diccionario en `PI Workflow_resources.jsh`. La función `optButton()` lo aplica automáticamente. Usar claves explícitas SOLO cuando el mismo texto se reutiliza con significados distintos.

### v33-opt-8h — Full-Script Tooltip Audit (Pre/Post/Masks/ChannelComb)
**Cambio:** Auditoría completa del script para añadir tooltips contextuales específicos a todos los controles que mostraban texto genérico ("Slider / numeric control..." o "Check box: When enabled...").
**Inventario antes del cambio:** ~320 controles UI auditados:
  - 111 NumericControl (87 labels únicos) → 17 sin entrada en diccionario
  - 26 ComboRow → todos con cobertura ✓
  - 60 CheckBox → 1 entrada sin dict + 8 sin `optApplyCheckBoxTooltip`
  - ~20 PushButton → 8 sin entrada en diccionario
**Implementación:** 28 nuevas entradas en `PI Workflow_resources.jsh` cubriendo:
  - Pre Processing: Gradient Correction, MGC (R/K, G, B), AutoDBE (Descent Paths, Tolerance), ABE (Function degree, Normalize), GraXpert
  - Pre/Post: BlurXTerminator (Sharpen Stars, Adjust Star Halos, PSF Diameter, Sharpen Nonstellar, Automatic PSF, Cor. Only, Lum. Only)
  - Pre/Post: Cosmic Clarity Sharpening (Stellar Amount, Non-Stellar Size/Amt)
  - Post Processing: NXT (Denoise LF, Denoise LF color)
  - Mask preview: `post.range.live`, `post.colormask.live` (claves explícitas, no slot "Live")
  - 8 botones de navegación/acción
**Code:** 8 nuevos `optApplyCheckBoxTooltip` + 2 tooltips explícitos para máscaras.
**Cobertura final:** ~100% de los controles visibles al usuario en Pre, Stretching, Post, Masks y Channel Combination.

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

---

## 12. Sesión 2026-05-25 - Integración de Algoritmos SyQon (Prism y Starless)

**Archivos afectados:** `PI Workflow.js`, `PI Workflow_UI.js`, `PI Workflow_resources.jsh`, `PI Workflow_help.xhtml`, `context/PI_Workflow_Context.md`, `PI Workflow_Context.md`, `build_package.py`, `updates.xri`, `.gitignore`

### Objetivos

1. Integrar el algoritmo de reducción de ruido **SyQon Prism** y el de separación de estrellas **SyQon Starless** (modelo Axiom 2.1) en `PI Workflow` bajo ejecución headless no interactiva (usando `ExternalProcess`).
2. Resolver el bug de `preview.setBusy is not a function` en Prism y solucionar los escapes de barras de ruta de Windows (`\`) al pasarlas como argumentos de entrada/salida al CLI de SyQon.
3. Asegurar que las dependencias se detectan y se leen dinámicamente de los archivos de configuración temporal de SyQon.
4. Actualizar el manual (`PI Workflow_help.xhtml`), compilar la documentación oficial (`PI_Workflow.html`) y publicar los cambios en la carpeta de distribución (`Para publicar`) y GitHub, manteniendo la restricción de no distribuir los scripts standalone de SyQon.

### Cambios aplicados

- **Corrección en Reducción de Ruido SyQon Prism**:
  - Se corrigió `preview.setBusy` redirigiendo la referencia al control interno `.preview` del pane.
  - Se normalizaron todas las barras inversas (`\`) en los argumentos de ruta FITS a barras directas (`/`) para evitar errores de escape en el CLI de Prism.
  - La ruta del ejecutable se lee dinámicamente de `syqon_prism_config.csv`.
- **Integración de SyQon Starless**:
  - Se añadió la opción "SyQon Starless" al combo de algoritmo en la sección **Star Split** de la pestaña **Stretching**.
  - Se construyó el panel de ajustes `starSplitSyQonGroup` con sliders/combos (Tile Size, Overlap, Pad, Use AMP, AMP Type, Force CPU, Disable DirectML y Stars Mode).
  - Se implementó `optRunSyQonStarlessOnView` para ejecutar `starless_cli.exe` de forma headless, leyendo la configuración de `syqon_starless_config.csv`.
  - Se implementó la reconstrucción de la capa de estrellas mediante PixelMath (modos Subtraction o Unscreen) tras importar la imagen starless generada por el CLI.
  - Se transfiere la solución astrométrica (WCS) de forma segura y se copian metadatos FITS a ambos ImageWindows resultantes.
  - Se integró SyQon Starless en la cuadrícula de comparación de estrellas (`optCompareStarSplit`).
- **Empaquetado y Distribución**:
  - Se actualizó el manual de ayuda `PI Workflow_help.xhtml` con la descripción de SyQon Starless.
  - Se recompiló la documentación mediante `build_doc.py`.
  - Se añadieron `SyQon_Prism.js`, `SyQon_Starless.js` y `scratch_combined.js` a `.gitignore` para cumplir con las restricciones de no distribución.
  - Se regeneró `PI-Workflow.zip` y `updates.xri` con el nuevo SHA-1 del paquete.
  - Todos los cambios se empujaron con éxito a GitHub.

---

## 13. Sesión 2026-05-25 - Solución de Ejecución de Cosmic Clarity (Deconvolution / Noise Reduction)

**Archivos afectados:** `PI Workflow.js`, `PI Workflow_Context.md`, `context/PI_Workflow_Context.md`

### Objetivos

1. Resolver el fallo de ejecución de Cosmic Clarity en las funciones de deconvulación y reducción de ruido.
2. Corregir el bug del valor de retorno de `ExternalProcess.start()`, que al devolver `undefined` en PixInsight PJSR, provocaba que el script interpretara falsamente que todos los candidatos fallaban al arrancar, ejecutando en paralelo todos los candidatos (incluyendo llamadas con sintaxis errónea y llamadas con python global sin dependencias).
3. Eliminar los candidatos duplicados con prefijos redundantes `"cc"` para evitar la llamada errónea `SetiAstroSuitePro.exe cc cc ...`.
4. Compilar el script monolítico local unificado y actualizar la documentación de desarrollo (archivos de contexto).

### Cambios aplicados

- **Corrección en `optRunCosmicClarityCLI` (Detección de Arranque)**:
  - Se implementó un control de `try-catch` robusto para ejecutar `proc.start` en lugar de verificar su valor de retorno, ya que la API de PixInsight para esta llamada devuelve `undefined`.
  - Si la llamada a `proc.start` tiene éxito (no arroja excepción), la variable `started` se evalúa como `true` y el loop espera a que ese proceso finalice antes de liberar los recursos o intentar otro candidato.
  - Esto detiene la ejecución paralela caótica de múltiples candidatos de Cosmic Clarity y previene el borrado prematuro del archivo FITS de entrada en el bloque `finally` de `optRunCosmicClarityOnView`.
- **Limpieza de Candidatos CLI**:
  - Se eliminaron las variantes redundantes de candidatos con prefijo `["cc"]` para ejecutables binarios directos (`SetiAstroSuitePro.exe` y `setiastrosuitepro`), ya que la lista de argumentos `args` ya incorpora el comando `"cc"` por defecto, evitando así la duplicación no deseada.
  - Se conservaron los prefijos de entorno para ejecutores Python (`py` y `python3`).
- **Compilación de Distribución**:
  - Verificada la sintaxis de corchetes del script compilado unificado, arrojando balance perfecto.

---

## 14. Sesión 2026-05-25 - Corrección del Ajuste de Tamaño en Línea de Estado (Status Label)

**Archivos afectados:** `PI Workflow_UI.js`, `PI Workflow_Context.md`, `context/PI_Workflow_Context.md`

### Objetivos

1. Evitar que la línea de descripción de estado ("Current: ... | Preview: ...") estire la interfaz gráfica del script de manera no deseada al mostrar textos muy largos (como ocurre en las comparaciones de algoritmos).
2. Forzar que el texto largo de la línea de estado se ajuste en múltiples líneas (word wrapping) en lugar de deformar el aspecto del previsualizador o de la ventana del diálogo.

### Cambios aplicados

- **wordWrap en Status Label**:
  - Se modificó la función de tematización `optThemeApplyStatusLabel` en `PI Workflow_UI.js` para establecer `label.wordWrap = true`.
  - Al activar el ajuste de línea automático en el objeto `Label` de Qt/PJSR, el gestor de diseño (sizer) ya no necesita expandir la anchura mínima de la etiqueta para mostrar la cadena completa en una única línea, permitiendo que la interfaz permanezca compacta y conserve las proporciones correctas de la imagen activa.

---

## 15. Sesión 2026-05-25 - Adición de Repositorios SyQon en el Manual y Empaquetado

**Archivos afectados:** `PI Workflow_help.xhtml`, `doc/scripts/PI_Workflow/PI_Workflow.html`, `PI-Workflow.zip`, `updates.xri`, `PI Workflow_Context.md`, `context/PI_Workflow_Context.md`

### Objetivos

1. Añadir las URLs de los repositorios de actualización de SyQon (estándar y compatible con PixInsight 1.9.4+ / Apple Silicon) en la tabla de requisitos de instalación del manual de ayuda (`PI Workflow_help.xhtml`).
2. Recompilar el manual XHTML a formato HTML compatible con `PIScriptDoc` (`PI_Workflow.html`) y actualizar los scripts monolíticos.
3. Sincronizar todos los archivos y volver a generar el paquete ZIP de PixInsight (`PI-Workflow.zip`) junto con su checksum SHA-1 en `updates.xri`.
4. Subir todos los archivos actualizados de distribución y contexto al repositorio de GitHub.

### Cambios aplicados

- **Actualización del Manual XHTML (`PI Workflow_help.xhtml`)**:
  - Añadida una nueva fila para "SyQon AI Suite (Prism / Starless)" en la tabla de requisitos.
  - Se incluyeron los repositorios correspondientes:
    - Estándar: `https://raw.githubusercontent.com/SyQon-Hub/PixInsight_Scripts/refs/heads/main/`
    - Apple Silicon/PI 1.9.4+: `https://raw.githubusercontent.com/SyQon-Hub/PixInsight_Scripts_194/refs/heads/main/`
  - Se describieron las instrucciones de configuración (especificar rutas en los scripts standalone de SyQon para que PI Workflow lea los temporales `.csv`).
- **Copia y Publicación**:
  - Sincronizados los scripts y manuales con el directorio de distribución `Para publicar`.
  - Reconstruido el archivo comprimido `PI-Workflow.zip` y regenerado el archivo de repositorio `updates.xri` con el nuevo hash SHA-1 (`a29294850be531247af0ad87f974da778124ed45`).

---

## 16. Sesión 2026-05-25 - Depuración de Agradecimientos en el Manual

**Archivos afectados:** `PI Workflow_help.xhtml`, `doc/scripts/PI_Workflow/PI_Workflow.html`, `PI-Workflow.zip`, `updates.xri`, `PI Workflow_Context.md`, `context/PI_Workflow_Context.md`

### Objetivos

1. Eliminar a los educadores/canales "Trevor Jones and Ashley Northcotte" (AstroBackyard), "AstroIsland creator" y "Sky Story team" de la sección 13 (Agradecimientos) del manual.
2. Eliminar todos los nombres propios individuales de la entrada de agradecimiento al equipo de PixInsight ("The PixInsight Team at Pleiades Astrophoto").
3. Recompilar la documentación, empaquetar de nuevo la actualización y realizar el despliegue en GitHub.

### Cambios aplicados

- **Depuración del Manual XHTML (`PI Workflow_help.xhtml`)**:
  - Remoción completa de los elementos de lista `<li>` para Trevor Jones & Ashley Northcotte, AstroIsland y Sky Story.
  - Se modificó la entrada de Pleiades Astrophoto para quitar los nombres de Juan Conejero, Maribel Carracedo, Roberto Sartori, Edoardo Luca Radice, Vicent Peris y Alicia Lozano, dejando un agradecimiento genérico al equipo ("Thank you to the team for building the platform and official learning material...").
- **Compilación e Integración**:
  - Recompilado `PI_Workflow.html` usando `build_doc.py`.
  - Copiados los archivos modificados a la carpeta `/Para publicar`.
  - Regenerado `PI-Workflow.zip` y `updates.xri` con el nuevo SHA-1 del paquete (`9141f2647b92e947353b0efa7158acb51aa79c02`).




---

## 54. Sesión 2026-05-25 - Integración de DeepSNR en el Flujo de Trabajo Local

**Archivos afectados:** `PI Workflow_resources.jsh`, `PI Workflow.js`, `PI Workflow_UI.js`, `PI Workflow_Context.md`, `context/PI_Workflow_Context.md`

### Objetivos

1. Integrar localmente la herramienta de reducción de ruido DeepSNR como motor seleccionable en la sección de Post-Procesamiento (Noise Reduction).
2. Añadir tooltip explicativo para el parámetro "Amount" de DeepSNR en el archivo de recursos.
3. Actualizar la lógica del script principal para declarar la dependencia, detectar su disponibilidad en la plataforma PixInsight y ejecutarla correctamente pasándole el parámetro de Amount.
4. Extender la interfaz gráfica en `PI Workflow_UI.js` para añadir "DeepSNR" a la lista de algoritmos disponibles, crear el grupo visual con el deslizador del parámetro Amount, sincronizar su visibilidad y actualizar los algoritmos de comparación y la firma de cambios.
5. Recompilar el script unificado combinando los módulos en `PI Workflow.js` (directorio raíz) y verificar la consistencia sintáctica.
6. Copiar todos los archivos al directorio de distribución `/Para publicar`, actualizar el archivo ZIP de PixInsight (`PI-Workflow.zip`) con el nuevo hash SHA-1 y firmar el manifiesto de actualización `updates.xri`.

### Cambios aplicados

- **Recursos (`PI Workflow_resources.jsh`)**:
  - Se añadió la clave de tooltip `"deepsnr.amount"` con la descripción detallada del parámetro Amount de DeepSNR.
- **Script Principal (`PI Workflow.js`)**:
  - Se registró el proceso `"DeepSNR"` en la lista global de dependencias `OPT_REQUIRED_PROCESSES`.
  - Se implementó la función `optIsDeepSNRAvailable()` para verificar la presencia de la clase `DeepSNR` o de su proceso registrado.
  - Se definió la función `optExecuteDeepSNROnView(view, cfg)` que instancia el objeto de proceso `DeepSNR`, le asigna la propiedad `.amount` (con valor por defecto `0.75`) y lo ejecuta en la vista de destino.
  - Se agregaron las propiedades de configuración correspondientes en `optBuildPostCandidateConfig` y la ramificación de ejecución en `optApplyPostCandidate` bajo la opción `idx === 5`.
- **Interfaz Gráfica (`PI Workflow_UI.js`)**:
  - Se añadió la opción `"DeepSNR"` en el combobox de selección de algoritmo del panel de reducción de ruido (`comboPostNR`).
  - Se construyó el panel visual del deslizador del Amount (`ncPostDeepSNRAmount`) agrupado bajo el título "DeepSNR Settings".
  - Se actualizó la función `dlg.syncPostNRPanels` para ocultar o mostrar el panel de ajustes de DeepSNR cuando el índice seleccionado de la lista de algoritmos es `5`.
  - Se integró el soporte de DeepSNR en la función de comparación de algoritmos (`optComparePostNoiseReduction`) ampliando la rejilla comparativa a 3 columnas.
  - Se actualizó el generador de firmas de comparación (`info.signature`) para incorporar el estado del deslizador `dlg.ncPostDeepSNRAmount`.
- **Despliegue y Empaquetado**:
  - Se compilaron e inyectaron los módulos en el script monolítico unificado en la carpeta raíz `c:\Users\ninoc\Documents\PixInsight\Test_Scripts\PI Workflow\PI Workflow.js`.
  - Se verificó que el balance de corchetes del script final fuera correcto.
  - Se copiaron todos los ficheros de desarrollo a la carpeta de entrega `/Para publicar`.
  - Se re-empaquetó la suite generando `PI-Workflow.zip` y se escribió el nuevo hash SHA-1 (`264d58322a3d9c0b34d79fed75bec7a827dd71ca`) en el manifiesto XML `updates.xri`.


---

## 55. Sesión 2026-05-25 - Reordenación de Agradecimientos en el Manual

**Archivos afectados:** `PI Workflow_help.xhtml`, `doc/scripts/PI_Workflow/PI_Workflow.html`, `PI-Workflow.zip`, `updates.xri`, `PI Workflow_Context.md`, `context/PI_Workflow_Context.md`

### Objetivos

1. Reordenar la lista de educadores y canales de la sección 13 (Agradecimientos) del manual de ayuda según la relevancia definida por el usuario.
2. Añadir a Mike Cranfield de Cosmic Photons a la lista de agradecimientos.
3. Compilar la documentación manual a HTML, sincronizar todos los archivos y volver a generar el paquete ZIP de PixInsight (`PI-Workflow.zip`) junto con su checksum SHA-1 en `updates.xri`.
4. Subir todos los archivos actualizados de distribución y contexto al repositorio de GitHub.

### Cambios aplicados

- **Reordenación del Manual XHTML (`PI Workflow_help.xhtml`)**:
  - Se reordenó la lista de agradecimientos en el siguiente orden exacto: Yannick Dutertre, Franklin Marek, Sascha Wyss, Luke, Luca Bartek, Adam Jaffe and the TAIC contributors, Adam Block, Nico Carver, The PixInsight Team at Pleiades Astrophoto, Luis Miguel Azorin and Juan Diaz, Raul Hussein, Marc Abello, Mark, Nazmus Nasir, Astrocity.es team, y Ed Ting.
  - Se añadió a **Mike Cranfield** (Cosmic Photons) con un agradecimiento por el desarrollo de scripts y herramientas útiles para PixInsight (PixelMath UI, NBColourMapper, Star Reduction utility).
- **Compilación e Integración**:
  - Recompilado `PI_Workflow.html` en las carpetas de desarrollo y distribución usando `build_doc.py`.
  - Copiados los archivos modificados a la carpeta `/Para publicar` usando `copy_to_publish.py`.
  - Regenerado `PI-Workflow.zip` y `updates.xri` con el nuevo SHA-1 del paquete (`5a2448cfd0a86517dcbcd856c081cd3ce7f8e5cf`).


---

## 56. Sesión 2026-05-25 - Ajuste en el Orden de Agradecimientos (Sascha y Mike)

**Archivos afectados:** `PI Workflow_help.xhtml`, `doc/scripts/PI_Workflow/PI_Workflow.html`, `PI-Workflow.zip`, `updates.xri`, `PI Workflow_Context.md`, `context/PI_Workflow_Context.md`

### Objetivos

1. Ajustar el orden de los agradecimientos en el manual (`PI Workflow_help.xhtml`): bajar a Sascha Wyss a la posición 6 y subir a Mike Cranfield (Cosmic Photons) a la posición 13.
2. Recompilar la documentación manual a HTML, sincronizar todos los archivos y volver a generar el paquete ZIP de PixInsight (`PI-Workflow.zip`) junto con su checksum SHA-1 en `updates.xri`.
3. Subir todos los archivos actualizados de distribución y contexto al repositorio de GitHub.

### Cambios aplicados

- **Reordenación del Manual XHTML (`PI Workflow_help.xhtml`)**:
  - Se movió a **Sascha Wyss** a la 6ª posición (tras Adam Jaffe).
  - Se movió a **Mike Cranfield** a la 13ª posición (antes de Mark / Deep Sky Detail).
- **Compilación e Integración**:
  - Recompilado `PI_Workflow.html` en las carpetas de desarrollo y distribución usando `build_doc.py`.
  - Copiados los archivos modificados a la carpeta `/Para publicar` usando `copy_to_publish.py`.
  - Regenerado `PI-Workflow.zip` y `updates.xri` con el nuevo SHA-1 del paquete (`00c287b6905b1b934e11d2fb894f6c66bf505448`).


---

## 57. Sesión 2026-05-25 - Rediseño del Botón "Use this Image" (Prominencia y CTA)

**Archivos afectados:** `PI Workflow_UI.js`, `PI-Workflow.zip`, `updates.xri`, `PI Workflow_Context.md`, `context/PI_Workflow_Context.md`

### Objetivos

1. Rediseñar el botón principal de confirmación "Use this Image" para hacerlo significativamente más prominente, convirtiéndolo en una llamada a la acción (Call to Action) evidente cuando esté listo (READY) para usarse.
2. Aumentar su anchura de 105px a 130px para darle mayor peso visual en el renglón de acciones.
3. Actualizar su estilo en el estado READY a un fondo ámbar sólido con texto oscuro para máximo contraste, manteniendo el hover en ámbar brillante.
4. Compilar y reconstruir la suite de scripts unificados, generar el ZIP del paquete de actualizaciones (`PI-Workflow.zip`) y firmar el manifiesto `updates.xri`.
5. Desplegar los cambios y bitácoras al repositorio remoto de GitHub.

### Cambios aplicados

- **Estilos en la Interfaz Gráfica (`PI Workflow_UI.js`)**:
  - En la función de tematización de botones `optThemeApplyPrimaryActionButton`, se modificó el estilo del estado `isApplied = false` (READY) para establecer un fondo de color ámbar sólido (`Theme.amber`) y el color de texto a oscuro (`#17171c`), con hover a `Theme.amberBright` y texto oscuro.
  - Se modificó la instanciación de `btnSetCurrent` incrementando la anchura a `130` píxeles para ofrecer una presencia y lectura superior.
- **Empaquetado y Distribución**:
  - Compilado el archivo monolítico `PI Workflow.js` inyectando la nueva interfaz.
  - Copiados los archivos modificados a `/Para publicar`.
  - Regenerado `PI-Workflow.zip` y `updates.xri` con el nuevo SHA-1 del paquete (`612faf78e74756e797322713b16dc6599c5b9e2a`).


---

## 58. Sesión 2026-05-25 - Adición de Inspiración (Craig y Christian) en el Manual

**Archivos afectados:** `PI Workflow_help.xhtml`, `doc/scripts/PI_Workflow/PI_Workflow.html`, `PI-Workflow.zip`, `updates.xri`, `PI Workflow_Context.md`, `context/PI_Workflow_Context.md`

### Objetivos

1. Añadir a Craig y Christian de PiMagic Studio en la 1ª posición de la sección de agradecimientos del manual de ayuda (`PI Workflow_help.xhtml`) por haber sido la inspiración principal para la creación de este script.
2. Recompilar la documentación manual a HTML, sincronizar todos los archivos y volver a generar el paquete ZIP de PixInsight (`PI-Workflow.zip`) junto con su checksum SHA-1 en `updates.xri`.
3. Subir todos los archivos actualizados de distribución y contexto al repositorio de GitHub.

### Cambios aplicados

- **Actualización del Manual XHTML (`PI Workflow_help.xhtml`)**:
  - Se añadió a **Craig and Christian** (PiMagic Studio) en el puesto 1 de la lista de agradecimientos, destacando su contribución como inspiración clave del script.
- **Compilación e Integración**:
  - Recompilado `PI_Workflow.html` en las carpetas de desarrollo y distribución usando `build_doc.py`.
  - Copiados los archivos modificados a la carpeta `/Para publicar` usando `copy_to_publish.py`.
  - Regenerado `PI-Workflow.zip` y `updates.xri` con el nuevo SHA-1 del paquete (`021297bbca0fa0bfb5e0e952c43b2bc38d006d8f`).


---

## 59. Sesión 2026-05-25 - Detalle de Agradecimientos de PiMagic Studio

**Archivos afectados:** `PI Workflow_help.xhtml`, `doc/scripts/PI_Workflow/PI_Workflow.html`, `PI-Workflow.zip`, `updates.xri`, `PI Workflow_Context.md`, `context/PI_Workflow_Context.md`

### Objetivos

1. Enriquecer la información de Craig y Christian de PiMagic Studio en la sección de agradecimientos del manual de ayuda (`PI Workflow_help.xhtml`), mencionando su contribución y añadiendo el enlace a su canal de YouTube.
2. Recompilar la documentación manual a HTML, sincronizar todos los archivos y volver a generar el paquete ZIP de PixInsight (`PI-Workflow.zip`) junto con su checksum SHA-1 en `updates.xri`.
3. Subir todos los archivos actualizados de distribución y contexto al repositorio de GitHub.

### Cambios aplicados

- **Actualización del Manual XHTML (`PI Workflow_help.xhtml`)**:
  - Se extendió la descripción de **Craig and Christian** (PiMagic Studio) para incluir detalles sobre la creación de scripts y plugins de Photoshop dedicados a simplificar el post-procesamiento.
  - Se incluyó el enlace directo a su canal de YouTube (Utah Desert Remote Observatories).
- **Compilación e Integración**:
  - Recompilado `PI_Workflow.html` en las carpetas de desarrollo y distribución usando `build_doc.py`.
  - Copiados los archivos modificados a la carpeta `/Para publicar` usando `copy_to_publish.py`.
  - Regenerado `PI-Workflow.zip` y `updates.xri` con el nuevo SHA-1 del paquete (`4564f1b6717dff9bf31d42fbfb49d8b9b62a7a68`).


---

## 60. Sesión 2026-05-25 - Actualización de Referencia a Utah Desert Remote Observatories

**Archivos afectados:** `PI Workflow_help.xhtml`, `doc/scripts/PI_Workflow/PI_Workflow.html`, `PI-Workflow.zip`, `updates.xri`, `PI Workflow_Context.md`, `context/PI_Workflow_Context.md`

### Objetivos

1. Actualizar el agradecimiento a Craig y Christian en `PI Workflow_help.xhtml` para hacer referencia explícita a Utah Desert Remote Observatories (tanto en la etiqueta como en la descripción).
2. Utilizar el canal de YouTube específico: `https://www.youtube.com/channel/UCAP_JNj5koMchEFXnhirwnQ`.
3. Recompilar la documentación manual a HTML, sincronizar todos los archivos y volver a generar el paquete ZIP de PixInsight (`PI-Workflow.zip`) junto con su checksum SHA-1 en `updates.xri`.
4. Subir todos los archivos actualizados de distribución y contexto al repositorio de GitHub.

### Cambios aplicados

- **Actualización del Manual XHTML (`PI Workflow_help.xhtml`)**:
  - Se cambió el título de la entrada a: **Craig and Christian** (PiMagic Studio / Utah Desert Remote Observatories).
  - Se extendió la descripción para incluir el agradecimiento por compartir lecciones de astrofotografía e información sobre observatorios remotos.
  - Se actualizó el enlace del canal de YouTube a `https://www.youtube.com/channel/UCAP_JNj5koMchEFXnhirwnQ`.
- **Compilación e Integración**:
  - Recompilado `PI_Workflow.html` en las carpetas de desarrollo y distribución usando `build_doc.py`.
  - Copiados los archivos modificados a la carpeta `/Para publicar` usando `copy_to_publish.py`.
  - Regenerado `PI-Workflow.zip` y `updates.xri` con el nuevo SHA-1 del paquete (`24b183f0b4ec2cfb7f4d75e1c8b0fdd9fb8d743f`).


---

## 61. Sesión 2026-05-25 - Habilitación del Historial de Deshacer (Undo) para Recortes

**Archivos afectados:** `PI Workflow.js`, `PI-Workflow.zip`, `updates.xri`, `PI Workflow_Context.md`, `context/PI_Workflow_Context.md`

### Objetivos

1. Habilitar la funcionalidad de deshacer (Undo / Ctrl+Z) en PixInsight para las operaciones de recorte en el espacio de trabajo del usuario.
2. Eliminar el uso de la bandera `UndoFlag_NoSwapFile` al iniciar operaciones de recorte e integración en `PI Workflow.js` para asegurar la creación de archivos de intercambio (swap files).
3. Compilar el script monolítico unificado, empaquetar de nuevo la versión ZIP de PixInsight (`PI-Workflow.zip`), firmar el manifiesto `updates.xri` y subir todo a GitHub.

### Cambios aplicados

- **Operaciones de Recorte e Integración (`PI Workflow.js`)**:
  - En la función `optCropApplyToView`, se cambió `view.beginProcess(UndoFlag_NoSwapFile)` por `view.beginProcess()` (sin parámetros, habilitando el swap file de deshacer).
  - En la función de reemplazo de alineación `optCropSwapBackAlignedPixels`, se cambió `target.beginProcess(UndoFlag_NoSwapFile)` por `target.beginProcess()` para permitir deshacer el re-alineado por estrellas.
- **Empaquetado y Distribución**:
  - Compilado el archivo monolítico `PI Workflow.js` inyectando las nuevas modificaciones.
  - Copiados los archivos modificados a `/Para publicar`.
  - Regenerado `PI-Workflow.zip` y `updates.xri` con el nuevo SHA-1 del paquete (`8028cfade838e5a6f62b827431f130432575d5b5`).


---

## 62. Sesión 2026-05-26 - Corrección de Coordinación DPI en Ruedas de Color

**Archivos afectados:** `PI Workflow_UI.js`, `PI-Workflow.zip`, `updates.xri`, `PI Workflow_Context.md`, `context/PI_Workflow_Context.md`

### Objetivos

1. Resolver el problema de desfase de coordenadas en las ruedas de color de la interfaz de usuario en monitores de alta densidad de píxeles (High-DPI / pantallas 4K o escaladas).
2. Escalar las coordenadas lógicas del cursor obtenidas del evento de ratón (`onMousePress` / `onMouseMove`) a píxeles físicos multiplicándolas por `logicalPixelsToPhysical(1.0)` antes de realizar comparaciones con los límites del widget (que PixInsight reporta en píxeles físicos).
3. Compilar la suite de scripts unificados, generar el ZIP del paquete de actualizaciones (`PI-Workflow.zip`) y firmar el manifiesto `updates.xri`.
4. Desplegar los cambios y bitácoras al repositorio remoto de GitHub.

### Cambios aplicados

- **Corrección de Coordenadas de Rueda de Color (`PI Workflow_UI.js`)**:
  - En la función `dlg.pickPostColorBalanceWheel` (Color Balance), se multiplicó `x` e `y` por el ratio `logicalPixelsToPhysical(1.0)` de la rueda antes de calcular la distancia (`dx`/`dy`) al centro.
  - En los eventos `onMousePress` y `onMouseMove` de la rueda `dlg.postHueWheel` (Color Mask), se escaló `x` e `y` por el ratio del control antes de procesar el ángulo.
  - En la función `slot.colourWheel.pick` (Channel Combination), se aplicó el mismo escalado multiplicando por `logicalPixelsToPhysical(1.0)` antes de obtener la posición angular y de intensidad.
- **Empaquetado y Distribución**:
  - Compilado el archivo monolítico `PI Workflow.js` inyectando la nueva interfaz de usuario.
  - Copiados los archivos modificados a `/Para publicar`.
  - Regenerado `PI-Workflow.zip` y `updates.xri` con el nuevo SHA-1 del paquete (`281c219052c1cf878f161cf372d9df8aae0b86fe`).
