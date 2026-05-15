# PI_Workflow_Opt - Contexto de Desarrollo

> Leer este archivo al inicio de cualquier sesion centrada en `PI_Workflow_Opt_5.js`.
> Mantenerlo actualizado cuando cambien arquitectura, dependencias, tests o diagnosticos relevantes.

> Nota 2026-05-15: para la rama de publicacion comunitaria en esta carpeta, el archivo activo es `PI Workflow 3.js` y la base de reversion inmediata es `PI Workflow 2.js`.

---

## 1. Archivos principales

- Script en desarrollo actual: `PI_Workflow_Opt_5.js`
- Base inmediata: `PI_Workflow_Opt_4_Fase_4.js`
- Fases acumulativas de Opt_4: `PI_Workflow_Opt_4_Fase_0.js` ... `PI_Workflow_Opt_4_Fase_4.js`
- Script Opt_4 original conservado: `PI_Workflow_Opt_4.js`
- Script anterior: `PI_Workflow_Opt_3.js`
- Versiones mas antiguas: `PI_Workflow_Opt_2.js`, `PI_Workflow_Opt.js`
- AutoTest asociado a Opt_3: `PI_Workflow_Opt_3_AutoTest.js` (AutoTest para Opt_4 pendiente)
- AutoTest para Opt_5: pendiente
- Estado actual de version interna: `30-opt-5d-7`

---

## 2. Objetivo del script

`PI_Workflow_Opt.js` es un reemplazo estructural del flujo heredado de `29u` y ramas posteriores.

Objetivos principales:

- simplificar radicalmente la gestion de imagenes y memoria
- mantener la interfaz, menus y flujo de trabajo visibles
- unificar `Image Selection` y `Preview`
- reducir legacy interno y puntos de inconsistencia
- mejorar velocidad percibida y uso de memoria

No es una review de `29u`; es un script nuevo con arquitectura propia.

---

## 3. Modelo funcional actual

### 3.1 Tabs

- `Pre Processing`
- `Stretching`
- `Post Processing`
- `Channel Combination`

### 3.2 Image Selection comun

Se usa en `Pre`, `Stretching`, `Post` y `Channel Combination`.

Modos:

- `R+G+B`
- `NB`
- `RGB`

Propiedades:

- botones horizontales de modo
- primera opcion `None` en todos los combos
- autoseleccion por nombre si existe una vista equivalente en workspace
- visibilidad logica comun via `optSetControlVisible()` y `optIsControlLogicallyVisible()`

### 3.3 Preview comun

Motor unico para todas las tabs:

- `Toggle`
- `Export`
- `Set to Current`
- zoom/pan
- `Fit to Screen` al cargar desde `Image Selection`
- `Fit to Screen` al cambiar de tab
- persistencia local de zoom/pan dentro de la tab mientras no haya carga nueva

Estado actual adicional:

- combo global `Prev. Resol. Reduction`
- valores `1, 2, 3, 4, 5, 6`
- valor por defecto `3`
- el valor se comparte entre `Pre`, `Stretching`, `Post` y `Channel Combination`
- la regeneracion del bitmap intenta preservar el centro visible y el zoom dentro de la misma tab
- los combos usan ahora un fondo dorado-anaranjado para que el dropdown sea legible

### 3.4 Memoria

- 8 slots por tab
- limpieza al cambiar de tab: los botones vuelven a numeros consecutivos y se cierran las vistas clonadas de memoria
- nombres descriptivos compartidos por tabs: `tipo de imagen + acronimo de menu + acronimo de algoritmo + numero de firma de parametros`
- el numero de firma se reutiliza para la misma combinacion algoritmo/parametros y cambia cuando cambian parametros dentro de la memoria activa
- click izquierdo en un slot guarda la imagen completa actual/candidata; click derecho recupera el slot como candidato comparable
- `Set to Current` sobre una memoria recuperada clona esa memoria al registro actual conservando el tipo de imagen (`R+G+B`, `R`, `H`, etc.)
- en `Gradient Correction`, la memoria tambien puede conservar un clon del modelo de gradiente asociado
- `Show Gradient` solo aparece en el preview de `Pre Processing` cuando existe un modelo de gradiente para la imagen mostrada; al activarlo muestra imagen corregida arriba y modelo abajo
- `Toggle` conserva comparacion antes/despues del ultimo cambio

### 3.5 Flujo

- `Pre -> Stretching -> Post Processing`
- cuando una imagen llega a `Post`, tambien queda disponible en `Channel Combination`

---

## 4. Menus ya conectados

### 4.1 Pre Processing

- `Plate Solving`
- `Gradient Correction`
  - `MGC`
  - `AutoDBE`
  - `ABE`
  - `GraXpert`
- `Deconvolution`
  - `BlurXTerminator`
  - `Cosmic Clarity`
- `Color Calibration`
  - `SPCC`
  - `Auto Linear Fit`
  - `Background Neutralization`

### 4.2 Stretching

- `Star Split`
- zona `RGB / STARLESS`
- zona `STARS`
- algoritmos:
  - `Auto STF`
  - `MAS`
  - `Statistical Stretch`
  - `Star Stretch`
  - `VeraLux` cuando esta disponible

Estado estructural actual de `Stretching`:

- ya no existe boton global inferior `To Post Processing`
- cada zona tiene su propio boton `To Post Processing`
- `Stars Chromatic Correction` ha sido retirado de la interfaz

### 4.3 Post Processing

Orden actual esperado:

1. `Image Selection`
2. `Noise Reduction`
3. `Sharpening`
4. `Color Balance`
5. `Curves`
6. `Masking`

El menu `Blending` ha sido eliminado por completo de UI y codigo.

---

## 5. Dependencias y criterio de deteccion

El script tiene un bloque central de chequeo de dependencias.

### 5.1 Helpers comunes

- `optDependencyCheckRuntime`
- `optDependencyCheckProcess`
- `optDependencyCheckProcessIcon`
- `optDependencyCheckScript`
- `optDependencyCheckExternalRuntime`
- `optDependencyChecksRegistry`

### 5.2 Regla de autoridad

- `Process`: el constructor scriptable existe en la build de PixInsight que esta corriendo
- `Process icon`: ademas del proceso, existe un icono de proceso concreto en el workspace
- `Script`: existe el archivo dentro de `src/scripts` de la instalacion de PixInsight que esta corriendo
- `Runtime`: el stack ya esta cargado y usable en el runtime JS actual
- `External runtime`: hay infraestructura para lanzar herramienta externa, pero la herramienta externa real se valida al ejecutar

### 5.3 Dependencias registradas actualmente

- `AdP / ImageSolver`
- `SPFC icon`
- `MGC icon`
- `SPCC`
- `ABE`
- `AutoDBE`
- `GraXpert`
- `BlurXTerminator`
- `Cosmic Clarity`
- `StarXTerminator`
- `Multiscale Adaptive Stretch`
- `VeraLux`

---

## 6. Integraciones opcionales relevantes

### 6.1 AutoDBE

- no se incluye de forma fija al arrancar
- se detecta por presencia en `src/scripts`
- se carga bajo demanda con `optEnsureAutoDBESupportLoaded()`
- el loader opcional expande ahora `#include` recursivos y elimina llamadas triviales a `main();`
- se ampliaron rutas candidatas para `AutoDBE`, `Toolbox/AutoDBE` y `SetiAstro/AutoDBE`
- en `TEST_MODE` usa fallback sintetico

Estado actual:

- `AutoDBE` ya ha vuelto a funcionar correctamente en pruebas reales segun feedback de usuario

### 6.2 GraXpert

Orden de preferencia:

1. proceso nativo `GraXpert`
2. `GraXpertLib.jsh`

Detalles:

- `optEnsureGraXpertScriptConfig()` crea fallback para `GRAXPERT_SCRIPT_CONFIG`
- el loader opcional inyecta y sustituye `GRAXPERT_SCRIPT_DIR` y tambien la variante historicamente mal escrita `GRAXPERT_SCRPT_DIR`; esto evita que scripts externos de GraXpert fallen durante `eval` por una macro/global ausente
- el nombre configurado ya no se fija solo a `GraXpert`; ahora se intenta detectar si la instalacion usa `Graxpert.js` o `GraXpert.js`
- si `GraXpertLib` queda cargado con un nombre de configuracion sin path, `Opt_3` recarga la libreria con nombres alternativos y vuelve a instanciarla antes de fallar
- si sigue sin path, intenta aplicar rutas estandar del ejecutable standalone de GraXpert antes de emitir `[GRAXPERT/PATH]`
- el loader dinamico expande macros simples antes de `eval`
- las rutas candidatas cubren `Toolbox/GraXpertLib.jsh`, `Toolbox/GraxpertLib.jsh` y subcarpetas `Toolbox/GraXpert/...`
- si `GraXpertLib` no encuentra ruta de ejecutable, el flujo intenta reconfigurar/recargar el nombre de script, reintentar y aplicar rutas estandar de ejecutable antes de fallar
- en `TEST_MODE` usa fallback sintetico

Estado real mas reciente:

- se ha reforzado el fallback de path/configuracion en `29-opt-12`; pendiente validar dentro de PixInsight con la instalacion real

### 6.3 VeraLux

Problema historico:

- `Opt` detectaba archivos pero no cargaba el engine
- por eso `VeraLux` podia estar instalado en disco y seguir apareciendo como no disponible

Estado actual:

- existe `optVeraLuxCandidatePaths()`
- existe `optEnsureVeraLuxSupportLoaded()`
- `optVeraLuxAvailable()` acepta proceso nativo/scriptable VeraLux o carga `processVeraLux` bajo demanda
- el preprocesador `optPreprocessVeraLuxScriptText()` elimina invocaciones triviales a `main();` para evitar que scripts standalone abran UI al cargarse como libreria
- el loader opcional ahora expande `#include` recursivos
- se añadieron muchas rutas candidatas adicionales:
  - `src/scripts/VeraLux/verlux.js`
  - variantes `Toolbox/VeraLux/...`
  - variantes `VelaLux/...`
- se añadió `optResolveVeraLuxProcessFunction()` para aceptar varias exportaciones posibles y normalizarlas a una llamada comun
- `processVeraLux` se llama como `processVeraLux(image, params, progressCallback)` y su retorno se normaliza con `optNormalizeVeraLuxResult()` antes de hacer `Image.assign()`
- si VeraLux retorna una `Image`, una `View`, una `ImageWindow`, un objeto `{ image: ... }` o crea una ventana nueva compatible, se acepta; cualquier otro tipo o geometria/canales incompatibles fallan con un error explicito antes de llamar a `Image.assign()`
- la UI de `Stretching` ya ofrece `VeraLux` en `RGB / STARLESS` y en `STARS`

Limitacion:

- si la version instalada de VeraLux requiere un wrapper mas complejo que quitar `main();`, puede requerir otro ajuste especifico
- en `29-opt-12`, VeraLux tambien intenta proceso nativo/scriptable y deja de saltarse silenciosamente el stretch si no se carga

### 6.4 Cosmic Clarity

- no se trata como script/proceso de PixInsight
- se trata como integracion externa via `ExternalProcess`

---

## 7. Test mode y AutoTest

### 7.1 Flags

- `PI_WORKFLOW_OPT_NO_MAIN`
- `PI_WORKFLOW_OPT_TEST_MODE`

### 7.2 Objetivo del modo test

Evitar que el autotest dependa de:

- WCS real
- Gaia
- SPFC real
- MGC real
- SXT real
- herramientas externas

### 7.3 Cobertura actual del autotest

El autotest ya comprueba:

- constructores principales
- helpers criticos de Gradient Correction
- clasificador de residual/background
- macro fallback de GraXpert
- fallback de `GRAXPERT_SCRIPT_DIR` / `GRAXPERT_SCRPT_DIR`
- preprocesado minimo de VeraLux
- normalizacion del retorno de VeraLux antes de `Image.assign()`
- registro de dependencias
- expansor de `#include` para scripts opcionales
- preprocesado minimo de `AutoDBE`
- surface UI de Pre y Stretch
- `Image Selection`
- `Prev. Resol. Reduction`
- sincronizacion global del factor de reduccion del preview
- ausencia de `Blending`
- presencia de `VeraLux` en ambas zonas de `Stretching`
- ausencia de botones legacy en el pie de `Stretching`
- `Stars Chromatic Correction` retirado de la zona `STARS`
- orden de menus en `Post`
- ramas de `Gradient Correction` en `TEST_MODE`
  - `MGC`
  - `AutoDBE`
  - `ABE`
  - `GraXpert`
- `SPCC`
- handoff `Pre -> Stretch -> Post`
- `Star Split` en `TEST_MODE`
- `Set to Current`
- historico de stages

El autotest previo imprimia:

- `Script version: 29-opt-9`

El autotest actual de `PI_Workflow_Opt_3_AutoTest.js` debe imprimir:

- `Script version: 29-opt-13`

Para `PI_Workflow_Opt_4.js` (v29-opt-16) el AutoTest esta pendiente de crear. Cuando se cree, debera incluir:

- presencia y firma de `optBuildPostRangeMaskView(view, dialog, opts)` y `optBuildPostColorMaskView(view, dialog, opts)` con soporte de `opts.live`
- existencia de `OPT_POST_LIVE_MAX_DIM`
- presencia de hooks `OptPreviewControl.onImageMousePress/Move/Release/onOverlayPaint`
- presencia de los controles UI de Masking (Range/Color/FAME), incluyendo `comboPostMask`, `postRangeStrip`, `postHueWheel`, `comboPostFameShape`, etc.
- presencia de `dlg.installPostFameHooks` / `dlg.removePostFameHooks`
- presencia de `dlg.schedulePostMaskLive` y `dlg._postLiveMask`

---

## 8. Bugs importantes ya encontrados y corregidos

### 8.1 Stack AdP / ImageSolver

Errores vistos:

- `Ext_DataType_StringArray is not defined`
- `WCS_DEFAULT_RBF_TYPE is not defined`
- `ObjectWithSettings is not defined`

Fix:

- carga alineada con el stack AdP necesario

### 8.2 MGC / SPFC / Gaia

Diagnostico:

- muchos fallos atribuidos a MGC eran en realidad errores previos de SPFC
- caso real observado: ruta Gaia DR3/SP mal configurada

Fix:

- clasificacion mas precisa de errores:
  - `[SPFC/PARAMETERS]`
  - `[SPFC/GAIA]`
  - `[SPFC/EXECUTION]`
  - `[MGC/REFERENCE]`
  - `[MGC/SPFC]`
  - `[MGC/WCS]`
  - `[MGC/LINEARITY]`

### 8.3 Helper faltante en Gradient Correction

Error real:

- `optIsBackgroundResidualViewId is not defined`

Fix:

- helper restaurado y cubierto por autotest

### 8.4 GraXpert

Errores reales:

- `GRAXPERT_SCRIPT_CONFIG is not defined`
- `[GRAXPERT/PATH] GraXpert does not have an executable path configured...`

Fix:

- fallback global `optEnsureGraXpertScriptConfig()`
- loader con expansion de macros simples
- preferencia por proceso nativo si existe
- deteccion del nombre real del script principal (`Graxpert.js` / `GraXpert.js`)
- reintento con nombres alternativos antes de fallar por path

Estado:

- sigue pendiente confirmar que el nuevo mecanismo ya resuelve la maquina donde el usuario tiene `src/scripts/Toolbox/Graxpert.js`

### 8.5 Warning en Stretching

Warning real:

- `reference to undefined property zone.starAmount`

Fix:

- `optStretchParamsFromZone()` ya no asume que todas las zonas tienen controles `STAR`

### 8.6 Preview y UI

Cambios ya integrados:

- nuevo combo `Prev. Resol. Reduction`
- conservacion de zoom/pan dentro de una misma tab al regenerar preview
- `Fit to Window` al cambiar de tab
- estilos de `ComboBox` con fondo dorado-anaranjado
- eliminacion de `Blending` en `Post`
- reordenacion de menus de `Post`
- `Stars Chromatic Correction` retirado de la interfaz

---

## 9. Estado pendiente

Puntos que requieren validacion real en PixInsight:

- carga real de `VeraLux` segun la estructura del script instalado (`src/scripts/VeraLux/verlux.js`)
- validacion funcional de `MGC` con iconos reales `SPFC` y `MGC`
- validacion funcional de `GraXpert` en modo proceso y en modo `GraXpertLib`
- validacion real de `Plate Solving` y `SPCC`
- confirmar que el bug de Stars/Starless (seccion 15) queda resuelto en ejecucion real con SXT
- confirmar que Cosmic Clarity Denoise acepta exactamente los flags CLI mapeados

Estado por funcionalidad segun feedback actual:

- `AutoDBE`: funcionando
- `GraXpert`: reforzado en `29-opt-12` con recarga de `GraXpertLib` por nombre de configuracion y fallback de ejecutable estandar
- `VeraLux`: reforzado en `29-opt-12` con soporte de proceso nativo/scriptable y error explicito si no carga
- Script arranca sin errores tras correcciones de sesion 2026-05-06 (Warning 155, Control.Set() booleans)

---

## 10. Regla para futuras dependencias

Toda dependencia nueva debe añadirse en `optDependencyChecksRegistry()` usando los helpers comunes.

No volver a introducir checks ad hoc repartidos por el script.

---

## 11. Iteracion `PI_Workflow_Opt_2`

Fecha: 2026-05-06.

Archivos generados:

- Script nuevo: `PI_Workflow_Opt_2.js`
- AutoTest nuevo: `PI_Workflow_Opt_2_AutoTest.js`

Version interna:

- `OPT_VERSION = "29-opt-10"`
- `#feature-id Utilities > PI_Workflow_Opt_2`

Objetivo:

- implementar `Post Processing` y `Channel Combination` sobre la interfaz optimizada
- mantener store canonico, preview unico, memoria por tab, `Toggle` y `Set to Current`
- portar opciones principales desde `PI Workflow_29uGPT.js` sin reintroducir el sistema legacy completo de ventanas/snapshots/lifecycle

### 11.1 Post Processing

Orden mantenido:

1. `Image Selection`
2. `Noise Reduction`
3. `Sharpening`
4. `Color Balance`
5. `Curves`
6. `Masking`

Implementado:

- `Noise Reduction`: NoiseXTerminator, TGVDenoise, Cosmic Clarity marcado como pendiente de validacion
- `Sharpening`: BlurXTerminator, Unsharp Mask, HDR Multiscale Transform, Local Histogram Equalization, Dark Structure Enhance, Cosmic Clarity
- `Color Balance`: multiplicadores R/G/B, Saturation, SCNR green
- `Curves`: RGB/K, R, G, B, Saturation con controles parametricos
- `Masking`: Range Selection y Color Mask sinteticos en memoria, `Generate Active Mask`, `Clear Mask`
- soporte de mascara activa en NR, Sharpening y Curves

Pendiente/dudas:

- FAME no se porto en esta iteracion porque el flujo legacy depende de eventos de mouse del preview antiguo
- el hue-wheel completo de Color Balance de 29u no se porto; se sustituyo por controles RGB/Saturation/SCNR mas directos
- Cosmic Clarity denoise esta expuesto en UI pero bloqueado con error explicito hasta validar su mapeo CLI real; el wrapper optimizado actual solo esta mapeado para sharpen
- Dark Structure Enhance queda como fallback estructural, no como port completo del proceso legacy

### 11.2 Channel Combination

Modelo implementado:

- la imagen activa en `Channel Combination` es la base
- `Blend source` se rellena desde las rutas disponibles en el store para la tab CC
- `Preview Combination` genera candidato y usa `Toggle` / `Set to Current`

Opciones implementadas:

- modos: Replace, Darken/Min, Multiply, Colour burn, Linear burn, Darker colour, Lighten/Max, Screen, Colour dodge, Linear dodge/Add, Lighter colour, Overlay, Soft light, Hard light, Vivid light, Linear light, Pin light, Difference, Exclusion, Subtract, Divide, Power, Arctan, Hue, Saturation, Lightness
- opacity
- preserve base lightness
- histogram controls para base/starless y blend/stars
- filtro para blend/stars: None, Blur, High pass

Pendiente/dudas:

- no se porto el workspace multi-slot Image1..Image6 de 29u; se adapto a base+blend para encajar con el store/preview nuevo
- `Colour` mode completo de 29u no esta incluido; `Hue`, `Saturation` y `Lightness` si tienen ruta especifica con `ChannelCombination`

### 11.3 Check inicial de dependencias

Entradas nuevas en `optDependencyChecksRegistry()`:

- `NoiseXTerminator`
- `TGVDenoise`
- `Post sharpening processes` (`UnsharpMask`, `HDRMultiscaleTransform`, `LocalHistogramEqualization`)
- `CurvesTransformation`
- `ChannelCombination`

### 11.4 AutoTest

`PI_Workflow_Opt_2_AutoTest.js` cubre:

- ids nuevos de dependencias
- controles de Post y Channel Combination
- generacion de Range Mask
- candidatos en `TEST_MODE` para Noise Reduction, Sharpening, Color Balance, Curves y Channel Combination
- registro de stages via `Set to Current`

Validacion local fuera de PixInsight:

- parse JS con directivas PJSR retiradas:
  - `PI_Workflow_Opt_2.js`: OK
  - `PI_Workflow_Opt_2_AutoTest.js`: OK

No validado aun:

- ejecucion real dentro de PixInsight
- nombres reales de parametros de procesos en la build del usuario
- comportamiento real de mascara activa aplicada a clones en todos los procesos

---

## 12. Iteracion `PI_Workflow_Opt_2` - Live UI, Cosmic Clarity Denoise y Channel Combination 29u

Fecha: 2026-05-06.

Archivos actualizados:

- `PI_Workflow_Opt_2.js`
- `PI_Workflow_Opt_2_AutoTest.js`
- `PI_Workflow_Opt_Context.md`

Cambios implementados:

- cabecera superior izquierda con simbolo griego pi y nombre `PI Workflow`, tomando el criterio visual del script `PI Workflow_29uGPT.js`
- `windowTitle` cambiado a `PI Workflow`
- `OptPreviewScheduler` comun para live preview con debounce y cancelacion
- `Cosmic Clarity Denoise` en Post > Noise Reduction, con controles de luma, color, modo, modelo walking/standard y remove aberration
- `optBuildCosmicClarityArgs()` ahora soporta `sharpen`, `denoise` y `both`
- lectura opcional de launcher configurado de Cosmic Clarity antes de probar rutas por defecto
- GraXpert mantiene la logica corregida de `PI_Workflow_Opt.js` y se ampliaron candidatos `GraxPert/GraXpert` para `GraXpertLib`
- VeraLux mantiene la logica corregida de `PI_Workflow_Opt.js` y se ampliaron candidatos `.jsh` y nombres de callable (`processVeraLuxImage`, `runVeraLux`, `runVeralux`, `VeraLuxProcess`, `VeraLux`, `VeraLuxEngine`)
- Color Balance incluye rueda hue/intensity, slider saturation y `Live`
- la rueda de Color Balance no lanza preview durante drag; solo repinta la UI, y el preview se agenda al soltar con debounce corto
- Curves incluye widget de curva con histograma, puntos editables y `Live`
- Curves no lanza preview durante drag; solo repinta la UI, y el preview se agenda al soltar con debounce corto
- Masking incluye checks `Live` en Range Mask y Color Mask, con preview agendado por debounce
- Channel Combination elimina la UI antigua base+blend y usa slots `Image1` a `Image6` al estilo 29u
- `Image6` actua como base; `Image1..Image5` se componen por orden sobre la cadena
- cada slot incluye source, blend mode, brightness, saturation, `Live`, `Color` para fuentes mono y rueda hue/intensity
- actualizado: `Color` y la rueda hue/intensity estan disponibles tambien para fuentes RGB/color, aplicando un tinte al slot antes de la saturacion/curvas
- cada slot conserva sus puntos de curva, y la pestaña incluye un widget compartido de curvas/histograma como en 29u
- la composicion aplica brightness, saturation/colour, curvas por slot y luego el blend mode
- al entrar en Channel Combination se refrescan las fuentes disponibles desde el store optimizado
- se retiraron las funciones heredadas de la primera implementacion base+blend para que no coexistan dos modelos de Channel Combination

AutoTest actualizado:

- comprueba `OptPreviewScheduler`
- comprueba argumentos de `Cosmic Clarity Denoise`
- comprueba controles de rueda/live de Color Balance
- comprueba widget/histograma/live de Curves
- comprueba live de Masking
- comprueba seis slots de Channel Combination, color por slot, curvas/histograma y flujo `optComposeCcSlots()`

Validacion local fuera de PixInsight:

- parse JS con directivas PJSR retiradas:
  - `PI_Workflow_Opt_2.js`: OK
  - `PI_Workflow_Opt_2_AutoTest.js`: OK

Dudas o puntos pendientes para la siguiente iteracion:

- Cosmic Clarity Denoise queda mapeado segun el modelo CLI de 29u; falta confirmar en la maquina real que el launcher instalado acepta exactamente `--denoise-luma`, `--denoise-color`, `--denoise-mode` y `--denoise-walking`
- GraXpert/VeraLux conservan la estrategia de carga y fallback que ya funcionaba en `PI_Workflow_Opt.js`, con mas candidatos; si siguen fallando dentro de PixInsight necesitaremos el mensaje exacto de consola y la ruta real cargada por `optGetGraXpertSupportInfo()` / `optGetVeraLuxSupportInfo()`
- Channel Combination porta el modelo multi-slot principal de 29u, color por slot y curvas/histograma compartidos; no se han replicado aun los botones legacy de export/snapshot propios de 29u porque Opt_2 usa `Toggle`, `Set to Current` y memoria por tab
- Curves usa histograma calculado desde la imagen activa y curva Akima local; falta validar visualmente en PixInsight que el widget PJSR pinta igual en todas las escalas DPI

---

## 13. Iteracion `PI_Workflow_Opt_2` - Curves en Stretching y Channel Combination por menus

Fecha: 2026-05-06.

Cambios implementados:

- `Post Processing > Curves`: el widget de histograma/curva se movio del panel izquierdo al panel derecho, debajo de la imagen preview, manteniendo el mismo objeto y sus eventos de edicion/live
- `Stretching > RGB / STARLESS`: se agrego algoritmo `Curves` al final de la lista
- `Stretching > STARS`: se agrego algoritmo `Curves` al final de la lista
- `Curves` en Stretching usa los mismos controles principales que Post Curves: channel, contrast, brightness, shadows lift, highlights compress, saturation y `Live`; no incluye `Use active mask` porque Stretching no mantiene mascara activa propia
- Channel Combination ya no crea un menu contenedor `Channel Combination`
- Channel Combination crea seis menus/secciones independientes: `Image 1` a `Image 6`
- `Source` muestra los nombres de los botones/rutas del workflow (`R+G+B`, `R+G+B Stars`, etc.) en lugar de keys internas
- `Image 6` no tiene `Blend mode` porque es la capa base/final de la cascada
- cada imagen tiene `Active`, `Live`, `Color` y `Histogram`
- `Active` controla si el slot entra en la composicion final
- `Live` controla que imagen individual se ve en el Preview; solo puede estar activo en una imagen a la vez
- `See all Images blended` actua como live preview de la fusion de todas las imagenes marcadas como `Active`

Validacion local fuera de PixInsight:

- parse JS con directivas PJSR retiradas:
  - `PI_Workflow_Opt_2.js`: OK
  - `PI_Workflow_Opt_2_AutoTest.js`: OK

Pendiente de validar dentro de PixInsight:

- comportamiento visual exacto del widget de Curves movido al panel derecho
- ergonomia de `Live` individual frente a `See all Images blended` en Channel Combination

---

## 14. Sesion 2026-05-06 — Errores de arranque y bugs de boolean

Archivo actualizado: `PI_Workflow_Opt_2.js`

### Bug A: Redeclaración de `optNormalizePath` (`Warning [155]`, linea 2862)

**Root cause:** Dos declaraciones `function optNormalizePath` en el mismo scope global:
- Linea 296: normaliza a barras forward (`/`). Uso general (rutas de include, candidatos).
- Linea 2862: normaliza a barras nativas del OS (`\` en Windows). Uso exclusivo de Cosmic Clarity.

**Fix:** Funcion de linea 2862 renombrada a `optNormalizePathOS`. Sus tres llamadas en el bloque Cosmic Clarity (lineas 3033, 3034, 3037) actualizadas.

---

### Bug B: `Control.Set(): invalid argument type: boolean value expected`

**Root cause:** Patron sistematico: expresiones `&&`-chain asignadas directamente a `.visible` de un Control PJSR. Cuando el primer operando es `null`/`undefined`, la cadena cortocircuita y retorna ese valor — no un booleano. PJSR rechaza el setter con error fatal.

**Ocurrencias encontradas y corregidas:**

| Linea | Funcion | Expresion problemática |
|-------|---------|------------------------|
| 5765 | `updateStretchCurvesWidgetVisibility` | `zone && zone.getAlgorithmId && ... === true` |
| 6468 | `optSetCcActiveCurvesSlot` | `slot && slot.chkHistogram && ... === true` |
| 6901 | `updatePostCurvesWidgetVisibility` | `dlg.chkPostCurvesLive && ... === true` |

Otras ocurrencias en lineas 6440, 6448, 6449 ya estaban dentro de `try-catch` — no crasheaban pero tampoco actualizaban la visibilidad correctamente.

**Fix:** Envolver cada expresion con `!!`:
```javascript
var visible = !!(zone && zone.getAlgorithmId && zone.getAlgorithmId() === "CURVES" && ...);
```

**Regla critica:** Toda asignacion a `.visible`, `.enabled` u otra propiedad booleana de Control PJSR que provenga de una cadena `&&` DEBE envolverse con `!!`. Sin excepcion.

---

## 15. Sesion 2026-05-06 — Bug: zona STARS aplica algoritmo sobre imagen Starless

Archivo actualizado: `PI_Workflow_Opt_2.js`

**Sintoma reportado:** Al seleccionar "R+G+B Stars" y pulsar Preview en la zona STARS de Stretching, el preview muestra "R+G+B Starless" y la imagen Stars no se modifica.

**Root causes (dos posibles):**

1. **Race condition via `processEvents()`:** Entre `tab.preview.activate(key)` y `tab.preview.beginCandidate(...)` existe una llamada a `processEvents()` para actualizar la etiqueta de estado. Durante ese flush, un callback pendiente del `previewScheduler` (p.ej. Curves Live de la zona RGB/STARLESS) puede ejecutar `tab.preview.activate(starlessKey)` + `beginCandidate(starless)`, sobreescribiendo `currentKey`/`currentView` antes de que el `beginCandidate` de la zona STARS corra.

2. **Fallo silencioso de `activate`:** `OptPreviewPane.prototype.activate` retorna `false` sin excepcion cuando `optSafeView(rec.view)` falla (vista Stars invalida o ventana cerrada). El codigo no comprobaba el retorno; `beginCandidate` continuaba sobre el `currentView` anterior (la imagen Starless).

**Fix en `zone.btnPreview.onClick` (`optBuildStretchZone`):**
```javascript
if (!tab.preview.activate(key, false))
   throw new Error(optLabelForKey(key) + " image is not valid. Please run Star Split again.");
zone.status.text = "Status: Calculating preview...";
processEvents();
// Guard: re-activar tras processEvents por si un scheduler sobreescribio el estado
if (tab.preview.currentKey !== key)
   tab.preview.activate(key, false);
tab.preview.beginCandidate(...);
```

**Fix secundario en `zone.scheduleCurvesLive`:** El callback de live-curves tampoco verificaba el retorno de `activate`. Añadido guard `if (!tab.preview.activate(key, false)) return;` antes de `beginCandidate`.

**Regla critica:** Todo `tab.preview.activate(key, ...)` en un handler de onClick DEBE:
1. Verificar el valor de retorno; si `false`, lanzar error explicito.
2. Tras cualquier `processEvents()`, re-verificar `tab.preview.currentKey === key` antes de llamar a `beginCandidate`.

---

## 16. Sesion 2026-05-07 - Opt_3 GraXpert/VeraLux hardening

Archivos actualizados:

- `PI_Workflow_Opt_3.js`
- `PI_Workflow_Opt_3_AutoTest.js`
- `PI_Workflow_Opt_Context.md`

### Bug A: `Gradient Correction: GRAXPERT_SCRPT_DIR is not defined`

**Root cause:** La carga dinamica de scripts externos expandia `#define` simples, pero no garantizaba las variables/directorio que algunos scripts de GraXpert esperan durante `eval`. En particular, algunas versiones hacen referencia a `GRAXPERT_SCRPT_DIR` sin la `I` de `SCRIPT`; aunque sea un typo externo, el workflow debe ser tolerante.

**Fix:** El loader opcional ahora centraliza macros y preambulo:

- `optOptionalScriptMacros(path, predefinedMacros)` añade `GRAXPERT_SCRIPT_DIR` y `GRAXPERT_SCRPT_DIR` con el directorio real del script que se esta cargando.
- `optOptionalScriptPreamble(path)` define ambas variables antes del `eval`.
- `optTryLoadOptionalScript()` y `optReloadGraXpertLibWithConfigName()` usan ese mismo contrato, para que no haya una ruta de carga sin fallback.

### Bug B: `VeraLux => Image.assign(): invalid argument type: Image expected`

**Root cause:** El stretch VLX llamaba a `processVeraLux(...)` y pasaba el retorno directamente a `view.image.assign(...)`. Si VeraLux devolvia una `View`, `ImageWindow`, objeto wrapper, `undefined`, o creaba una ventana nueva en vez de devolver una `Image`, el error se producia en `Image.assign()` y no en el punto real de integracion.

**Fix:** `Opt_3` ahora trata VeraLux como contrato validado:

- llama `processVeraLux(view.image, params, progressCallback)`
- normaliza el retorno con `optNormalizeVeraLuxResult(result, targetView, beforeMap)`
- acepta `Image`, `View`, `ImageWindow`, `{ image: Image }`, `{ view: View }`, o una ventana nueva compatible creada por el script
- valida anchura, altura y numero de canales con `optValidateVeraLuxImageGeometry()`
- libera solo imagenes propias y cierra solo ventanas auxiliares detectadas como nuevas
- si el retorno no es compatible, falla antes de `Image.assign()` con tipo de retorno explicito

### AutoTest

`PI_Workflow_Opt_3_AutoTest.js` se crea como autotest propio de Opt_3. Cambios relevantes:

- incluye `PI_Workflow_Opt_3.js`
- elimina expectativas de `OptGeometryEngine`/`geoEngine`
- verifica que `Stars Chromatic Correction` ya no exista dentro de STARS
- cubre `GRAXPERT_SCRPT_DIR` y `GRAXPERT_SCRIPT_DIR`
- cubre `optOptionalScriptPreamble()`
- cubre `optNormalizeVeraLuxResult()` con retorno `Image`

---

## 17. Sesion 2026-05-07 - Fix GraXpert StdIcon_Error y VeraLux in-place

Archivos actualizados:

- `PI_Workflow_Opt_3.js`
- `PI_Workflow_Opt_Context.md`

### Bug A: `Could not read GraXpert path: ReferenceError: StdIcon_Error is not defined`

**Root cause:** Las constantes PJSR (`StdIcon_Error`, `StdButton_Ok`, etc.) son macros `#define` del preprocesador que se resuelven en tiempo de compilacion. En el script principal, cada referencia a `StdIcon_Error` queda sustituida por su valor entero (`3`) antes de ejecutar. Sin embargo, cuando GraXpertLib.jsh se carga via `(1, eval)(text)`, el preprocesador ya no corre; cualquier referencia a `StdIcon_Error` en el codigo eval'd es un identificador JavaScript indefinido. Si GraXpertLib tiene un handler de error que intenta `new MessageBox(..., StdIcon_Error, ...)`, lanza `ReferenceError`.

**Fix:** `optOptionalScriptPreamble(path)` ahora declara como variables JS todos los valores numericos estandar de `StdIcon_*` y `StdButton_*` antes del texto eval'd:

```javascript
var StdIcon_NoIcon=0, StdIcon_Question=1, StdIcon_Warning=2,
    StdIcon_Error=3, StdIcon_Information=4, StdIcon_Custom=5;
var StdButton_NoButton=0, StdButton_Ok=1, StdButton_Cancel=2,
    StdButton_Yes=4, StdButton_No=8, StdButton_Abort=16,
    StdButton_Retry=32, StdButton_Ignore=64;
```

Esto cubre todos los scripts de terceros cargados via eval (GraXpertLib, AutoDBE, VeraLux).

**Regla critica recordada:** Toda extension de `optOptionalScriptPreamble` debe incluir las constantes PJSR que los scripts externos puedan usar en sus handlers de error/dialogo, ya que esas constantes no son variables JS en el contexto eval.

### Bug B: `VeraLux did not return an Image-compatible result. Return type: object.`

**Root cause real (confirmado leyendo verlux.js):** `processVeraLux` en verlux.js crea explicitamente `new Image(w, h, nc, ColorSpace_RGB, 32, SampleType_Real)`. `ColorSpace_RGB` y `SampleType_Real` son constantes `#define` de PJSR. Cuando verlux.js se carga via `(1,eval)(text)`, sus `#include <pjsr/ColorSpace.jsh>` y `#include <pjsr/SampleType.jsh>` no se expanden porque los archivos `.jsh` estan en `C:/Program Files/PixInsight/include/pjsr/` y `optRunningPixInsightInstallRoots` no incluia ese directorio. En consecuencia, `new Image(w, h, nc, undefined, 32, undefined)` produce un Image de tipo incorrecto (integer en vez de real, colorspace incorrecto) que puede fallar `optIsPjsrImage` o producir resultados de pixels erroneos.

Valores canonicos verificados contra `include/pjsr/ColorSpace.jsh` y `include/pjsr/SampleType.jsh` (2025-02-19):
- `ColorSpace_Gray=0`, `ColorSpace_RGB=1` (NO 2 como se asumia)
- `SampleType_Integer=0`, `SampleType_Real=1`
- `StdIcon_Error=4` (NO 3), `StdIcon_Warning=3` (NO 2), `StdIcon_Information=2` (NO 4)

**Bug secundario identificado:** Los valores de `StdIcon_*` y `StdButton_*` en el preamble anterior eran incorrectos (inferidos de memoria, no de los archivos reales).

**Fix en `optOptionalScriptPreamble`:** Actualizar todos los valores con los correctos segun los archivos `.jsh` reales, y añadir `ColorSpace_*` y `SampleType_*`.

**Fix en `optRunningPixInsightInstallRoots`:** Añadir rutas `*/include` junto a cada raiz de instalacion para que `optExpandOptionalScriptIncludes` pueda resolver `#include <pjsr/*.jsh>` correctamente en el futuro.

**Regla critica ampliada:** Antes de añadir constantes PJSR al preamble, SIEMPRE verificar los valores contra los archivos reales en `C:/Program Files/PixInsight/include/pjsr/`. Los valores inferidos de memoria son incorrectos.

**Fix en `optNormalizeVeraLuxResult`:**
- La comprobacion de `result.image` ahora usa `typeof result.image !== "undefined"` para evitar el Warning 162 de PJSR cuando `result` no tiene propiedad `image`.

**Fix en el bloque VLX de stretch:**
- Estructura simplificada a un unico `try { veraLuxFn(...); normalize; assign } finally { endProcess() }`.
- `view.beginProcess(UndoFlag_NoSwapFile)` envuelve la llamada para que la modificacion quede registrada en el undo stack y el view se redibuje.

**Confirmado en ejecucion real (2026-05-07):** verlux.js v1.2.2 retorna directamente una `Image` PJSR via `new Image(w, h, nc, ColorSpace_RGB, 32, SampleType_Real)`. La primera rama `optIsPjsrImage(result)` de `optNormalizeVeraLuxResult` cubre el contrato real. Las ramas `View`, `ImageWindow`, `{image:...}`, `{view:...}`, `optFindNewVeraLuxImage` se mantienen como red de seguridad documentada en seccion 6.3.

**NOTA importante para futuras sesiones:** se intentaron ramas adicionales (property scan + inplace fallback) durante el debugging pero se descartaron al confirmar que el contrato real es `Image`. NO reintroducir esas ramas a menos que un VeraLux nuevo las requiera.

### Bug C: Warning 162 en linea 4852 (`replacement.bkgView`)

**Root cause:** `optSafeView(replacement.bkgView)` lanza Warning 162 cuando `bkgView` no existe como propiedad del objeto. PJSR emite este warning al acceder a una propiedad indefinida de un objeto nativo.

**Fix:** Verificar existencia de la propiedad antes de llamar a `optSafeView`:
```javascript
else if (replacement.bkgView !== undefined && optSafeView(replacement.bkgView))
```

---

## 18. Sesion 2026-05-07 - Bug: tinte verde en Stretching con imagenes SPCC calibradas

Archivos actualizados:

- `PI_Workflow_Opt_3.js`
- `PI_Workflow_Opt_Context.md`

**Sintoma:** Al aplicar MAS, VeraLux o Statistical Stretch a una imagen R+G+B o R+G+B Starless que ha sido calibrada con SPCC, la imagen resultante aparece con tinte verde. AutoSTF no produce este problema.

**Root cause (tres causas separadas):**

### A - Statistical Stretch: blackpoint y midtone compartidos entre canales (bug)

El algoritmo SS aplicaba un unico blackpoint a todos los canales en P001:
```
Med = cr*med($T[0]) + cg*med($T[1]) + cb*med($T[2]);  // media ponderada por luminancia
BP = Med - stat_bp * Sig;
Rescaled = ($T - BP) / (1 - BP);  // mismo BP para R, G y B
```
Y una unica media de canales como pivot en P002:
```
MedianColor = avg(med($T[0]),med($T[1]),med($T[2]));
((MedianColor-1)*stat_med*$T)/(MedianColor*(stat_med+$T-1)-stat_med*$T)
```
Para una imagen SPCC donde el canal G tiene mayor mediana que R/B (tipico por mayor emision del cielo o mayor eficiencia del filtro G), G queda por encima de MedianColor y se estira mas que R/B -> tinte verde sistematico. AutoSTF no tiene este problema porque aplica un histograma por canal con su propio shadow/midtone.

### B - MAS/VLX: stretch luminancia preserva ratios de color lineales

MultiscaleAdaptiveStretch y VeraLux aplican un stretch basado en luminancia (linked). Esto preserva los ratios de color del dominio lineal. Si la imagen SPCC calibrada tiene G dominante en el fondo del cielo (habitual sin Background Neutralization previa), el resultado estirado conserva ese dominio -> tinte verde. No es un bug propio del algoritmo, pero el usuario no lo percibe como correcto porque AutoSTF normaliza cada canal independientemente.

**Fixes:**

### Fix A: SS ahora usa expresiones por canal para imagenes RGB

P001 (blackpoint): en vez de un BP luminancia-ponderado comun, cada canal calcula su propio Med, MAD, BP y se reescala independientemente:
```javascript
P001.useSingleExpression = false;
var bpExpr = "Med=med($T); Sig=1.4826*MAD($T); MinC=min($T); " +
             "BPraw=Med-stat_bp*Sig; " +
             "BP=iif(noclip,MinC,iif(BPraw<MinC,MinC,BPraw)); " +
             "($T-BP)/(1-BP)";
P001.expression0 = bpExpr; P001.expression1 = bpExpr; P001.expression2 = bpExpr;
```

P002 (midtone stretch): en vez de `avg(med(R),med(G),med(B))`, cada canal usa su propia mediana como pivot:
```javascript
P002.useSingleExpression = false;
var ssExpr = "Mc=med($T); ((Mc-1)*stat_med*$T)/(Mc*(stat_med+$T-1)-stat_med*$T)";
P002.expression0 = ssExpr; P002.expression1 = ssExpr; P002.expression2 = ssExpr;
```

### Fix B: MAS/VLX con imagen calibrada aplican normalizacion de fondo antes del stretch

Se anade `optEqualizeSkyBackgroundsBeforeStretch(view)`. Esta funcion calcula la mediana de cada canal en la imagen lineal, calcula la media de esas tres medianas, y aplica un offset aditivo a cada canal para que los tres queden en la misma mediana. Esto hace que el fondo del cielo sea neutro antes del stretch linked, produciendo un resultado sin tinte de color.

Deteccion: `optRecordHasColorCorrection(rec)` comprueba si el record del store tiene etapas de Color Calibration / SPCC. Solo se aplica cuando el algoritmo es MAS o VLX Y la imagen es RGB Y hay correccion de color registrada.

Se llama desde `optApplyStretchCandidate`:
```javascript
if ((algo === "MAS" || algo === "VLX") && view.image.numberOfChannels >= 3) {
   var stretchKey = dialog.stretchTab.preview.currentKey;
   var stretchRec = dialog.store.record(stretchKey);
   if (optRecordHasColorCorrection(stretchRec)) {
      optEqualizeSkyBackgroundsBeforeStretch(view);
      console.writeln("=> " + algo + ": Color-calibrated image. Channel backgrounds equalized before stretch.");
   }
}
```

**Regla critica:** Para imagenes calibradas con SPCC sin Background Neutralization, los stretches linked (MAS, VLX) produciran tinte de color porque preservan los ratios lineales. La solucion correcta de workflow es aplicar Background Neutralization DESPUES de SPCC y ANTES del stretch. El fix implementado es una aproximacion practica equivalente (offset de mediana por canal) que funciona bien para la mayoria de los casos sin gradientes fuertes de fondo.

**Canales afectados por el fix:** Solo RGB (3 canales). Imagenes monoo grayscale conservan el comportamiento original.

---

## 19. Sesion 2026-05-07 (cont.) - Bug: tamaño del preview de gradiente varía por algoritmo

Archivos actualizados:

- `PI_Workflow_Opt_3.js`

**Sintoma:** En el panel de preview apilado (imagen principal arriba, modelo de gradiente abajo), el gradiente de GraXpert aparece el doble de grande que el de ABE o AutoDBE.

**Root cause:**

`optRenderStackedPreviewBitmap` calculaba el factor de reducción del gradiente como `optClampPreviewReduction(reductionFactor) * 2`. Esto aplica al gradiente un factor de reduccion 2x mayor que la imagen principal. Si el view de gradiente de GraXpert tiene las mismas dimensiones nativas que la imagen fuente (resolución completa), y ABE guarda su modelo de fondo a menor resolución, el mismo factor de reduccion `*2` produce bitmaps de distinto tamaño pixel.

**Fix:**

Se añade `optRenderPreviewBitmapToSize(view, targetW, targetH, stretchMode)`: variante de `optRenderPreviewBitmap` que recibe dimensiones exactas en píxeles en lugar de un factor de reducción entero. No pasa por `optClampPreviewReduction`, por lo que no está limitada al rango [1,6].

En `optRenderStackedPreviewBitmap` el gradiente se renderiza siempre a exactamente la mitad del ancho y alto del preview principal:
```javascript
var targetW = Math.max(1, Math.round(top.width / 2));
var targetH = Math.max(1, Math.round(top.height / 2));
var bottom = optRenderPreviewBitmapToSize(bottomView, targetW, targetH, "mad-unlinked");
```

Resultado: el tamaño del preview del gradiente es siempre `top.width/2 × top.height/2`, independientemente del algoritmo (ABE, AutoDBE, GraXpert) y de las dimensiones nativas del view de gradiente.

---

## 20. Sesion 2026-05-07 - Integración completa de Masking Post Processing (v29-opt-14 / PI_Workflow_Opt_4.js)

Script nuevo: `PI_Workflow_Opt_4.js` (copia de Opt_3 con todos los cambios de esta sesion).

### Nuevas funciones standalone

- `optPostRangeWeight(v, low, high, fuzz, binary)` — calculo de peso de rango con soporte modo binario
- `optBuildHueWheelBitmap(sz)` — genera bitmap del hue wheel con anillo HSV
- `optPostFameAngle/Distance/BuildEllipsePoints/BuildRectanglePoints/CloneShape/GetShapePoints/TransformCenter/MoveShape/TransformShape` — helpers geometricos FAME
- `optPostFamePixelValue(srcImg, x, y, mode, colorRange, gradState)` — calcula valor de pixel para los modos Binary/Lightness/Chrominance/Color/Gradient
- `optPostFameFillPolygon/RasterizeCircle/FillBrush/FillSpray` — rasterizadores de shapes FAME
- `optPostFameAppendSprayPoints` — genera puntos aleatorios de spray
- `optBuildPostFameMaskImage(tv, dialog)` — construye imagen de mascara FAME completa
- `optRenderFameOverlay(g, sc, sx, sy, fameState)` — dibuja shapes FAME sobre el Graphics del preview

### `OptPreviewControl` extendido

Nuevas propiedades hook (null por defecto, no-op si no se asignan):
- `onImageMousePress(imgX, imgY, button, modifiers)` → return true para consumir el evento (suprime el pan)
- `onImageMouseMove(imgX, imgY, buttons, modifiers)`
- `onImageMouseRelease(imgX, imgY, button, modifiers)`
- `onOverlayPaint(g, sc, sx, sy)` — llamado dentro de onPaint tras dibujar el bitmap

Los handlers del viewport ahora reciben y pasan `(x, y, button, buttons, modifiers)`. Las coordenadas imagen se calculan con `floor((scrollPos + viewportCoord) / scale)`.

### `optBuildPostRangeMaskView` actualizado

- Soporte de `comboPostRangeMode`: Binary (hard cutoff), Luminance (0.2126R+0.7152G+0.0722B), Brightness (max(R,G,B))
- Generacion de mascara via `getSamples()` bulk (3 llamadas en vez de W×H×3 `sample()` calls) — 3x-5x mas rapido en imagenes grandes

### `optBuildPostColorMaskView` actualizado

- Nuevo parametro `ncPostCMSmooth` — aplica `gconv()` PixelMath igual que Range
- Generacion de mascara via `getSamples()` bulk

### UI Masking section en `configurePostTab` — cambios completos

**Range Selection group:**
- Nuevo `comboPostRangeMode` (Binary/Luminance/Brightness)
- Nuevo widget interactivo `postRangeStrip` — barra gradiente 220×24 con handles Low/High arrastrables

**Color Mask group:**
- Nuevo `comboPostCMPreset` con 8 presets de color (Red/Orange/Yellow/Green/Cyan/Blue/Magenta/Custom)
- Nuevo widget interactivo `postHueWheel` (160×160) — clic/drag para hue center, shift+drag para range
- Nuevo `ncPostCMSmooth`

**FAME group (nuevo):**
- `comboPostFameShape`: Freehand / Brush / Spray Can / Ellipse / Rectangle
- `comboPostFameMaskMode`: Binary / Lightness / Chrominance / Color / Gradient
- `comboPostFameColor`: visible solo en modo Color
- `ncPostFameBrushRadius`, `ncPostFameSprayDensity`, `ncPostFameBlur`
- `lblPostFameState` — muestra numero de shapes, shape activa, puntos A/B del gradiente
- Botones Next / Undo / Reset

**Mouse wiring:**
- `dlg.installPostFameHooks()` — asigna `onImageMousePress/Move/Release` y `onOverlayPaint` al previewCtrl cuando se selecciona FAME
- `dlg.removePostFameHooks()` — limpia los hooks al cambiar a otro algoritmo o al finalCleanup
- Modificadores: Shift+drag dibuja, Ctrl+drag mueve shape activa, Alt+drag rota/escala, right-click pone puntos A/B del gradiente

**`optGeneratePostMask` actualizado:**
- Despacha a `optBuildPostRangeMaskView` (idx=0), `optBuildPostColorMaskView` (idx=1) o `optBuildPostFameMaskImage` (idx=2)
- FAME aplica blur gaussiano con `convolveSeparable` antes de crear la view

### Regla critica nueva

Los hooks `onImageMousePress/Move/Release` de `OptPreviewControl` solo deben instalarse cuando el tab correspondiente esta activo. Si se dejan instalados en otras tabs, capturaran todos los eventos de raton. El patron correcto: instalar en `comboPostMask.onItemSelected(2)` y desinstalar en `onItemSelected` con otro valor y en `finalCleanup`.

---

## 21. Sesion 2026-05-07 - Masking: bug del viewport, FAME freehand y rendimiento del live preview (v29-opt-15)

Archivos actualizados:

- `PI_Workflow_Opt_4.js`
- `PI_Workflow_Opt_Context.md`

### Bug A: TypeError en linea 8585 al cargar el script

**Sintoma:** `Warning [162]: reference to undefined property previewCtrl.viewport` y `TypeError: previewCtrl.viewport is undefined` al ejecutar el script. El error ocurre durante la inicializacion porque `comboPostMask.onItemSelected(0)` se llama inmediatamente despues de definir el handler.

**Root cause:** `dlg.postTab.preview` es un `OptPreviewPane`, y tiene dos propiedades distintas:
- `dlg.postTab.preview.control` → `Control` plano (contenedor con sizer, sin viewport)
- `dlg.postTab.preview.preview` → `OptPreviewControl` (subclase de `ScrollBox`, tiene `.viewport`, `.bitmap`, hooks delegados)

El codigo de Masking confundia ambos y asignaba los hooks FAME y llamaba `viewport.repaint()` sobre `.control` en vez de `.preview`.

**Fix:** Cambio sistematico de `dlg.postTab.preview.control.viewport` → `dlg.postTab.preview.preview.viewport` (5 ocurrencias) y `var previewCtrl = dlg.postTab.preview.control` → `dlg.postTab.preview.preview`.

### Bug B: FAME no permite dibujar a mano alzada con click izquierdo

**Sintoma:** Con FAME seleccionado y forma "Freehand", el click izquierdo simple no dibujaba; solo Shift+drag activaba el modo dibujo. La mayoria de usuarios no descubre esta interaccion.

**Root cause de UX:** El handler `onImageMousePress` de FAME requeria modificador SHIFT para la accion de dibujo. CTRL/ALT eran para mover/transformar.

**Fix:** Reordenado el handler. Ahora la jerarquia es:
1. Right-click: punto A/B del gradiente
2. CTRL+drag (con shape activo): mover el shape activo
3. ALT+drag (con shape activo): rotar/escalar el shape activo
4. Default (left-click + drag): dibujar nuevo shape

Tambien se actualizo el label informativo: `Drag: draw  |  Ctrl+drag: move active  |  Alt+drag: rotate/scale  |  Right-click: gradient A/B`.

### Bug C: Strip y hue wheel no son suaves; mascara tarda en actualizarse

**Sintomas reportados:**

1. Mover los handles de la barra de gris o el centro/range del hue wheel no es suave
2. La mascara tarda mucho en actualizarse en pantalla
3. Las actualizaciones de mascara se disparan durante el drag

**Root causes:**

1. `dlg.postRangeStrip.setValue()` y `dlg.postHueWheel.setValue()` disparaban `onValueUpdated` en cada movimiento, que llamaba a `maskChanged()` -> `schedulePostMaskLive()`. Aunque el scheduler hacia debounce, cada call reseteaba el timer y consumia ciclos.
2. `optBuildPostRangeMaskView` y `optBuildPostColorMaskView` usaban `mask.setSample(value, x, y, channel)` por pixel (W*H llamadas con `i % img.width` y `Math.floor(i / img.width)` por pixel). Para una imagen 4000x3000 son 12M llamadas a funcion + 24M divisiones.
3. Las funciones aplicaban `gconv()` PixelMath despues de generar la mascara incluso en el preview live, lo cual dobla el tiempo de generacion.

**Fixes implementados:**

1. **Suppression durante drag.** `maskChanged` chequea `dlg.postRangeStripDragging || dlg.postHueWheelDragging` y retorna sin scheduling. Las funciones `onMouseRelease` de cada widget llaman `dlg.schedulePostMaskLive(160)` directamente al soltar, asi se hace UNA sola llamada al final del drag.

2. **Bulk setSamples.** El loop por pixel ahora rellena un `Float32Array maskArr` y al final hace UNA llamada `mask.setSamples(maskArr, fullRect, 0)`. Elimina la sobrecarga de funcion por pixel y los modulos/floors.

3. **Modo live con downsample.** Las funciones aceptan `opts.live = true`. Si la imagen fuente excede `OPT_POST_LIVE_MAX_DIM` (1024) en la dimension mayor, se crea un clon Bilinear redimensionado y la mascara se construye sobre ese clon. Para una imagen 6000x4000, la mascara live se calcula en 1024x683 (~700K pixeles) en vez de 24M.

4. **Skip gconv en live.** El smoothing por `gconv()` solo se aplica en modo full (boton Generate Active Mask). El live preview lo omite.

### Cambio arquitectural: live mask separada de active mask

Antes: `optGeneratePostMask` se llamaba tanto desde el live preview como desde el boton Generate, asignando la mascara a `postActiveMask` en ambos casos. Esto significaba que durante un drag el `postActiveMask` cambiaba constantemente y, peor aun, con el modo live el postActiveMask tendria una resolucion diferente al view de destino, causando errores en procesos downstream que aplican la mascara.

Ahora:

- `dlg._postLiveMask` (nuevo): mascara generada por live preview, baja resolucion, NO se asigna a postActiveMask. Solo se renderiza en el preview pane via `dlg.postTab.preview.render(maskView, false)`.
- `dlg.postActiveMask`: solo se setea cuando el usuario hace click explicito en "Generate Active Mask". Esa mascara siempre se construye a resolucion completa con gconv smoothing si aplica.
- Cleanup: `_postLiveMask` se libera al cambiar de algoritmo, al hacer Generate, al hacer Clear, y en finalCleanup.

El status label distingue ambos estados:
- Durante live: `Mask (preview): Post_RangeMaskLive_xxx — click Generate Active Mask`
- Tras Generate: `Mask: Post_RangeMask_xxx`

### Nuevas constantes

- `OPT_POST_LIVE_MAX_DIM = 1024` — dimension maxima del lado mas largo para mascaras live.

---

## 22. Sesion 2026-05-08 - Live mask preview se mostraba mini en la esquina (v29-opt-16)

Archivos actualizados:

- `PI_Workflow_Opt_4.js`
- `PI_Workflow_Opt_Context.md`

**Sintoma:** Al activar `Live` en Range Selection o Color Mask, el preview cambiaba a un rectangulo muy pequeño en la esquina superior izquierda en vez de mantener el tamaño visual de la imagen fuente.

**Root cause:** En v29-opt-15, las funciones `optBuildPostRangeMaskView` y `optBuildPostColorMaskView` con `opts.live=true` creaban la mascara a una resolucion reducida (max 1024 en la dimension mayor) para acelerar el calculo, pero la entregaban directamente al preview pane. `OptPreviewControl.setBitmap(bitmap, false)` conservaba la escala anterior; al cambiar de un bitmap fuente de p.ej. 6000x4000 a uno de 1024x683 con la misma escala, el bitmap aparecia visualmente mucho mas pequeño en el viewport.

**Fix:** Tras computar la mascara a baja resolucion via `setSamples()`, se llama `mask.resample(srcW, srcH, Interpolation_Bilinear)` para llevarla de vuelta a las dimensiones del source. La mascara view resultante tiene exactamente las mismas dimensiones que la imagen fuente, asi que el preview pane la pinta con la misma escala/scroll/zoom que el source.

**Tradeoff:** El upsample añade trabajo, pero `Image.resample()` es nativo C++ y mucho mas rapido que un loop JS por pixel a resolucion completa. El beneficio principal sigue siendo que el calculo de pesos por pixel se hace sobre ~700K pixels en vez de 24M. La mascara final (visualmente) tiene la misma resolucion que el source pero con un suavizado bilinear inherente al upsample, que es aceptable para un preview live.

**Regla critica hasta Opt_4:** Una mask view destinada al preview pane debia tener las mismas dimensiones que el view fuente. Cualquier downsampling se revertia antes de crear el ImageWindow.

**Regla actual en Opt_5:** el live preview de mascaras Range/Color ya no crea `ImageWindow`; renderiza un `Bitmap` directo desde una `Image` temporal reducida y lo entrega al preview pane con `renderBitmap()`. La mascara activa final sigue generandose a resolucion completa con `Generate Active Mask`.

---

## 23. Sesion 2026-05-08 - Busy overlay y memorias de mascara (v29-opt-17)

Archivos actualizados:

- `PI_Workflow_Opt_4.js`
- `PI_Workflow_Opt_Context.md`

### Busy overlay

- `OptPreviewControl` incorpora un overlay grafico ligero con icono Pi centrado y pulso por `Timer`.
- `OptPreviewPane.beginCandidate()` activa/desactiva el overlay alrededor de los procesos de preview/candidato.
- `OptPreviewScheduler.request()` acepta `busyPreviewControl` y `busyOverlayText`; se usa en el live preview de mascaras.
- Limitacion PixInsight: durante procesos sincronicos largos el hilo UI puede quedar bloqueado; el overlay aparece antes del proceso y el pulso avanza cuando el event loop queda libre.

### Memorias de mascara

- Nuevo `OptMaskMemoryManager` con 8 slots compartidos entre `Post Processing` y `Channel Combination`.
- `Generate Active Mask` crea la mascara activa full-resolution y guarda automaticamente un clon en la siguiente memoria.
- Los nombres usan `RS-<modo>`, `CM-<preset>` o `F-<shape>` con numeracion por firma.
- `Set to Mask` clona la memoria seleccionada y la convierte en `postActiveMask`, separada del slot guardado para que `Reset` no invalide la mascara activa.
- `Use active mask` en Post usa `optApplyMaskToProcessView()` en Noise Reduction, Sharpening, Color Balance y Curves; la funcion valida que la geometria de `postActiveMask` coincida con el candidato antes de aplicar la mask de PixInsight.

---

## 24. Sesion 2026-05-08 - Ajustes de UI, FAME coords y overlay (v29-opt-18)

Archivos actualizados:

- `PI_Workflow_Opt_4.js`
- `PI_Workflow_Opt_Context.md`

### Cambios

- Las memorias de mascara se mueven al panel derecho del preview, inmediatamente debajo de las memorias de imagen, y se eliminan de los paneles izquierdos de `Masking` y `Channel Combination`.
- `OptPreviewControl` guarda `imageCoordScaleX/Y` al renderizar. Los eventos de mouse entregan coordenadas de la imagen real, no del bitmap reducido del preview.
- `optRenderFameOverlay()` aplica la transformacion inversa para dibujar shapes FAME full-resolution sobre el bitmap reducido. Esto corrige el desplazamiento/reescalado de formas libres al generar la mascara.
- El busy overlay deja de usar `Timer`; ahora es un indicador fijo, pequeno, en la esquina superior izquierda del preview para no tapar la imagen completa.

---

## 25. Sesion 2026-05-08 - Refinamiento Mask memories, overlay y Clear Mask (v29-opt-19)

Archivos actualizados:

- `PI_Workflow_Opt_4.js`
- `PI_Workflow_Opt_Context.md`

### Cambios

- El overlay de trabajo de preview es mas grande y ancho para textos largos, pero sigue fijo en la esquina superior izquierda y sin `Timer`.
- `Mask memories` pasa a una unica fila debajo de las memorias de imagen: etiqueta, 8 slots, `Reset` y `Set to Active Mask`.
- `Clear Mask` ahora elimina la mascara activa/live, restaura el preview de la imagen base y resetea el estado FAME (`shapes`, `currentShape`, seleccion activa y puntos de gradiente) para empezar desde cero.

---

## 26. Sesion 2026-05-08 - Fases acumulativas Opt_4 (v29-opt-20 a v29-opt-24)

Archivos creados:

- `PI_Workflow_Opt_4_Fase_0.js`
- `PI_Workflow_Opt_4_Fase_1.js`
- `PI_Workflow_Opt_4_Fase_2.js`
- `PI_Workflow_Opt_4_Fase_3.js`
- `PI_Workflow_Opt_4_Fase_4.js`

Resumen:

- **Fase 0:** limpieza inicial de codigo muerto y ajustes ligeros de busy preview.
- **Fase 1:** extraccion de constructores de secciones de `Post Processing`.
- **Fase 2:** consolidacion de helpers de mascara Range/Color y generador comun de hue wheel.
- **Fase 3:** consolidacion de cierre de vistas temporales y limpieza final del store.
- **Fase 4:** politica comun de limpieza para memorias/store y self-check arquitectonico al arrancar.

Validacion local: los cinco archivos pasan parse con Node tras filtrar directivas PJSR `#`.

---

## 27. Sesion 2026-05-08 - Fixes finales sobre Fase_4 (v29-opt-24)

Archivo actualizado:

- `PI_Workflow_Opt_4_Fase_4.js`

Cambios relevantes:

- En `Deconvolution`, el boton del menu pasa a llamarse `Deconvolution`.
- `Generate Starless / Stars` activa el overlay de trabajo durante la ejecucion.
- VeraLux acepta mas formas de retorno (`Image`, `View`, `ImageWindow`, `object.image`, `object.view`, `outputImage`, `outputView`, `outputWindow`, `result`) y tolera retorno objeto si el proceso modifica la imagen objetivo in-place.
- `Set to Active Mask` solo queda habilitado cuando hay una memoria de mascara seleccionada y valida.
- En `Noise Reduction`, `Cosmic Clarity (needs validation)` se renombra a `Cosmic Clarity (Seti Astro)`.
- `Range Selection -> Binary` fuerza salida `0/1`, desactiva smoothing y usa nombre `Post_RangeMaskBinary` para previews finales con nearest-neighbor.

Validacion local: parse OK con Node.

---

## 28. Sesion 2026-05-08 - Opt_5 optimizado para runtime V8 (v30-opt-5)

Archivo creado:

- `PI_Workflow_Opt_5.js`

Objetivo:

Aplicar mejoras de rendimiento con retorno alto/medio teniendo en cuenta que el runtime JavaScript de PixInsight integra V8. El foco no es modernizar sintaxis, sino reducir asignaciones, GC y cruces repetidos JS <-> PJSR/C++.

Cambios implementados:

- Nuevo `OptPostMaskLiveCache`: cachea la imagen de trabajo reducida para live masks y reutiliza buffers `Float32Array` (`r`, `g`, `b`, `mask`) mientras no cambie la fuente, geometria o canales.
- `optPreparePostMaskWorkImage(sourceView, live, cache)` acepta cache opcional y evita recrear/resamplear la imagen live en cada ajuste de parametros.
- `optBuildPostRangeMaskView()` especializa rutas de loop por modo:
  - mono
  - RGB luminance
  - RGB brightness
  - binario/no binario
  - invertido/no invertido
- `optBuildPostColorMaskView()` deja de crear objetos `{hue, sat}` por pixel y usa `optColorMaskWeight()` con calculo escalar directo.
- Live preview de Range/Color ya no crea `ImageWindow`: usa `asBitmap: true`, renderiza un `Bitmap` desde una `Image` temporal y lo muestra con `OptPreviewPane.renderBitmap()`.
- `OptPreviewPane.renderBitmap()` permite pintar previews no asociados a una `View`, manteniendo escala fuente/bitmap para coordenadas cuando sea necesario.
- El cache live se invalida al cambiar la imagen activa de Post, al limpiar mascara, al cambiar algoritmo de mascara y en `finalCleanup()`.
- FAME reutiliza kernels gaussianos con `optGaussianKernelForSigma()` en vez de reconstruir arrays en cada `Generate Active Mask`.
- `PIWorkflowOptDialog` inicializa campos de Post/masking/cache en el constructor para mantener formas de objeto mas estables bajo V8.
- `optRunArchitectureSelfCheck()` comprueba tambien los nuevos helpers criticos de Opt_5.

Riesgos pendientes:

- No se ha ejecutado dentro de PixInsight desde Codex; la validacion local cubre sintaxis JS tras filtrar directivas PJSR.
- El live preview por bitmap evita ventanas temporales, pero el escalado final depende de `OptPreviewControl.drawScaledBitmap()`. La mascara activa final no cambia: se sigue creando como `ImageWindow` full-resolution al pulsar `Generate Active Mask`.

---

## 29. Sesion 2026-05-08 - Benchmark comparativo Opt_5 vs Fase_4

Archivo creado:

- `PI_Workflow_Opt_Compare_5_vs_4.js`

Objetivo:

Comparar `PI_Workflow_Opt_5.js` frente a `PI_Workflow_Opt_4_Fase_4.js` en los cambios realmente introducidos entre ambas versiones, no en el script completo de forma ciega.

Metodologia del benchmark:

- carga ambos scripts como namespaces aislados con `PI_WORKFLOW_OPT_NO_MAIN=1` y `PI_WORKFLOW_OPT_TEST_MODE=1`
- genera una imagen RGB sintetica `2048x1536`
- mide tiempos medios/min/max en:
  - live preview de `Range Selection`
  - live preview de `Color Mask`
  - generacion full-resolution de `Range Mask`
  - generacion full-resolution de `Color Mask`
  - generacion full-resolution de `FAME`
- cuantifica coste de procesamiento adicional en live preview midiendo delta de `ImageWindow.windows`:
  - `Fase_4`: live Range/Color crea una `View`/`ImageWindow` temporal
  - `Opt_5`: live Range/Color devuelve `Bitmap` y no abre ventana
- cuantifica equivalencia/calidad de salida con metricas de diferencia:
  - `MAE`
  - `RMSE`
  - `MaxAbs`
  - `mismatch ratio` para `Range Binary`

Notas:

- el benchmark no necesita instanciar el dialogo completo; usa dialogs minimos/fakes con solo los controles que consumen `optBuildPostRangeMaskView`, `optBuildPostColorMaskView` y `optGeneratePostMask`
- la comparativa de calidad se hace sobre mascaras full-resolution, que es donde `Opt_5` debe conservar equivalencia funcional con `Fase_4`

---

## 30. Sesion 2026-05-08 - Fix live mask OOM en Opt_5

Archivo actualizado:

- `PI_Workflow_Opt_5.js`

Sintoma:

- La primera mascara live en `Masking -> Range Selection` funcionaba, pero los siguientes movimientos de slider emitian `Mask live preview: out of memory`.
- El intento anterior de mantener superposicion reescalaba el live bitmap a la resolucion completa de la imagen fuente, lo que creaba un pico de memoria excesivo en imagenes grandes.

Fix:

- `optRenderPostMaskBitmap()` ya no reescala a `srcW/srcH`. Ahora acepta `targetWidth/targetHeight`.
- `schedulePostMaskLive()` calcula ese target con `optPostMaskPreviewBitmapSize()`, usando la misma reduccion que `optRenderPreviewBitmap()`.
- La mascara live se calcula sobre la imagen reducida/cacheada y se renderiza al mismo tamano del bitmap de preview normal. Asi conserva zona/zoom/scroll visual sin necesitar un bitmap full-resolution.
- Se blindan accesos a `opts.live`, `opts.asBitmap`, `opts.cache`, `opts.targetWidth` y `opts.targetHeight` con `optHasOwn()` para evitar warnings de propiedades inexistentes en PixInsight.

Regla actual:

- Live preview: bitmap al tamano del preview normal, no `ImageWindow`, no full-resolution.
- Generate Active Mask: `ImageWindow` full-resolution, apta para aplicar como mascara real en procesos Post.

### Ajuste posterior por OOM acumulativo

Sintoma persistente:

- Tras varios movimientos de slider en `Range Selection`, el live preview volvia a emitir `Mask live preview: out of memory`.
- El problema ya no era solo el tamano del bitmap sino la creacion repetida de `Image -> render() -> Bitmap` en cada actualizacion live.

Fix adicional:

- `optRenderPostMaskBitmap()` ya no crea una `Image` temporal ni llama a `mask.render()` para live preview.
- `OptPostMaskLiveCache` mantiene un unico `Bitmap` reutilizable por tamano (`bitmap` + `bitmapKey`).
- El live preview escribe directamente los valores de `maskArr` en ese bitmap con `Bitmap.setPixel()`.
- Si PixInsight vuelve a lanzar OOM durante live, el handler libera el cache, desactiva el checkbox `Live`, restaura la imagen fuente en el preview y corta la cascada de nuevos jobs fallidos.

Tradeoff:

- El live preview usa muestreo nearest-neighbor desde el buffer reducido al bitmap de preview. Puede verse menos suave durante el ajuste, pero evita acumulacion de memoria. La mascara final generada con `Generate Active Mask` conserva el flujo full-resolution y smoothing correspondiente.

### Fix Generate Active Mask OOM

Sintoma:

- Tras estabilizar el live preview, `Generate Active Mask` podia fallar con `Generate Active Mask: out of memory`.

Root cause:

- La ruta full-resolution de Range/Color aun creaba arrays completos para R/G/B/mask y despues una `Image` full-resolution adicional antes de copiar a una `ImageWindow`. En imagenes grandes esto acumulaba varios buffers gigantes simultaneamente.

Fix:

- `optBuildPostRangeMaskView()` y `optBuildPostColorMaskView()` usan ahora rutas tiled cuando no son live/asBitmap.
- Nuevos helpers:
  - `optCreateEmptyMaskWindowView()`
  - `optApplyPostMaskSmoothing()`
  - `optPostMaskTileRows()`
  - `optBuildPostRangeMaskViewTiled()`
  - `optBuildPostColorMaskViewTiled()`
- La mascara final se escribe por bandas directamente en la imagen de la `ImageWindow` destino con `setSamples()`, evitando crear arrays full-frame y una `Image` intermedia full-frame.
- `Range Binary` ya sale como `0/1` desde el loop tiled y no ejecuta PixelMath adicional.

### Fix posterior: OOM al renderizar la mascara activa

Diagnostico:

- Aunque la generacion tiled evitaba buffers full-frame, `optGeneratePostMask()` seguia llamando a `postTab.preview.render(postActiveMask)`.
- Esa ruta usa `optRenderPreviewBitmap()`, que crea una `Image` full-resolution, asigna la mascara completa y luego la reduce para preview. En imagenes grandes esto puede fallar justo despues de haber generado correctamente la mascara.

Fix:

- Nuevo `optRenderMaskViewPreviewBitmap()` renderiza una mascara ya creada leyendo una fila cada vez con `getSamples()` y pintando el bitmap de preview reutilizable.
- Nuevo `optRenderMaskViewInPreview()` usa ese render especifico para:
  - mascara activa tras `Generate Active Mask`
  - `Set to Active Mask`
  - inspeccion de slots de `Mask memories`
- Las mascaras ya no pasan por `optRenderPreviewBitmap()` salvo que se usen como imagen normal fuera de estos flujos.
- `optApplyPostMaskSmoothing()` ya no aborta la mascara si `gconv()` falla por memoria; emite warning y conserva la mascara sin suavizado.

---

## 31. Sesion 2026-05-08 - Fixes arranque, live preview smooth, mascaras memoria y FAME (v30-opt-5 revisado)

Archivo actualizado:

- `PI_Workflow_Opt_5.js`

### Warning 156 - variables no declaradas (lineas 265, 274, 830)

**Root cause:** Tres asignaciones a nombres sin `var` previo, que PJSR reporta como Warning 156.

**Fix:**
- `var processVeraLux;` declarado a nivel de modulo antes de `OPT_PIW_HAS_VERALUX`.
- `var GRAXPERT_SCRIPT_CONFIG;` declarado a nivel de modulo antes de `optEnsureGraXpertScriptConfig()`.
- `fieldLabel = {...}` cambiado a `var fieldLabel = {...}` en el bloque condicional de linea 274.

### Smooth no se aplica en Live Preview de Range Selection y Color Mask

**Root cause:** Las rutas `asBitmap: true` en `optBuildPostRangeMaskView` y `optBuildPostColorMaskView` rellenaban `maskArr` y llamaban directamente a `optRenderPostMaskBitmap` sin aplicar smoothing, incluso cuando el slider Smooth tenia valor > 0.

**Fix:**
- Nueva funcion `optApplySmoothToMaskArr(maskArr, W, H, sigma)`: blur gaussiano separable 2-pass (horizontal + vertical) sobre el array Float32, usando kernels de `optGaussianKernelForSigma`. No crea ningun objeto PJSR.
- En `optBuildPostRangeMaskView` (path live/bitmap): calcula `liveSigma = smooth * work.W / work.srcW` y llama `optApplySmoothToMaskArr` antes de `optRenderPostMaskBitmap` si `liveSigma > 0.1` y modo no es Binary.
- En `optBuildPostColorMaskView` (path live/bitmap): mismo patron con `cmSmooth`.
- El sigma se escala proporcional al factor de downsampling del live preview para que el efecto visual sea equivalente al de la mascara full-resolution.

### Deshabilitar Fuzz y Smooth en modo Binary

**Root cause:** En modo Binary los sliders Fuzz y Smooth no tienen efecto (el algoritmo genera salida 0/1 hard cutoff sin fuzz ni smoothing). El usuario no tenia feedback visual de por que no hacian nada.

**Fix:** En `comboPostRangeMode.onItemSelected`, deshabilitar `ncPostRangeFuzz` y `ncPostRangeSmooth` cuando el modo es Binary (idx === 0). Re-habilitarlos al cambiar a Luminance o Brightness.

### Memorias de mascara: comportamiento alineado con memorias de imagen

**Root cause:** Los botones de memoria de mascara usaban click izquierdo para seleccionar/visualizar, sin forma de guardar manualmente una mascara en un slot especifico. Ademas, `Generate Active Mask` auto-guardaba en la siguiente memoria libre sin que el usuario lo pidiera.

**Fix:**
- Nuevo metodo `OptMaskMemoryManager.prototype.storeAt(index, view, meta)`: guarda un clon owned de `view` en el slot `index`, con nombre segun la nomenclatura habitual.
- `b.onClick` en `optBuildMaskMemoryPanel`: guarda `dialog.postActiveMask` en el slot pulsado (si hay mascara activa). Si no hay mascara activa, no hace nada.
- `b.onMousePress` con boton derecho: visualiza el contenido del slot en el preview y lo selecciona (para habilitar "Set to Active Mask").
- `Generate Active Mask`: ya no llama a `storeNextShared`. El status label indica "click a memory slot to save".

### FAME: SHIFT+drag para dibujar; Ctrl+drag y Alt+drag reparados

**Root causes:**
1. El handler `onImageMousePress` usaba plain left-drag para dibujar, consumiendo todos los clicks izquierdo sin modificador. Esto impedia el pan normal del preview.
2. Las condiciones `(modifiers & CTRL) && st.shapes[st.activeShapeIndex]` fallaban silenciosamente cuando `activeShapeIndex === -1` (ninguna forma activa), porque `st.shapes[-1]` es `undefined` (falsy). El evento caia al caso por defecto (dibujo), en vez de mover/transformar.

**Fix:**
- Nueva jerarquia en `onImageMousePress`:
  1. Right-click → punto gradiente A/B
  2. CTRL+drag → mover shape activo (si `shapes.length > 0`; auto-selecciona el ultimo si `activeShapeIndex < 0`)
  3. ALT+drag → rotar/escalar shape activo (idem)
  4. SHIFT+drag → dibujar nueva forma (consume el evento y bloquea el pan)
  5. Sin modificador → `return false` (deja el pan normal)
- Label informativo actualizado: `Shift+drag: draw  |  Ctrl+drag: move active  |  Alt+drag: rotate/scale  |  Right-click: gradient A/B`

**Regla critica — modificadores de teclado PJSR:**
Los valores de `KeyModifier_*` en PJSR (`pjsr/ButtonCodes.jsh`) son DISTINTOS a los valores Qt:
- `KeyModifier_Shift = 0x01`
- `KeyModifier_Control = 0x02`
- `KeyModifier_Alt = 0x04`
- `KeyModifier_SpaceBar = 0x08`
- `KeyModifier_Meta = 0x10`

Los botones de ratón (`MouseButton_Left = 0x01`, `MouseButton_Right = 0x02`) usan el parametro `button/buttons`, no `modifiers`. No hay colision entre ambas enumeraciones porque son parametros distintos en los callbacks de raton.

---

## 32. Sesion 2026-05-09 - Channel Combination: See all Images Blended con Blend Mode correcto

Archivo actualizado:

- `PI_Workflow_Opt_5.js`

### Modelo de composicion de Channel Combination

La convencion es: **Image 6 = capa base (fondo)**; Image 5, 4, 3, 2, 1 se componen sobre ella en ese orden descendente. El Blend Mode de cada imagen describe como esa imagen se junta con la imagen inmediatamente inferior (mayor indice de slot). Image 6 no tiene Blend mode porque es la base.

Implementacion en `optComposeCcSlots(dialog)`:
1. Busca el slot activo de mayor indice (`highest`) → base.
2. Llama `optPrepareCcSlotView(dialog, slot)` para preparar la base (brightness/saturation/curves/color wheel del slot).
3. Bucle de `s = highest-1` hasta `0`: para cada slot activo, prepara una vista overlay y aplica el blend:
   - **A** = `$T` (vista resultado acumulado, imagen inferior)
   - **B** = `overlay.id` (imagen del slot s, capa superior)
   - **mode** = blend mode del slot s
   - PixelMath ejecuta sobre `result` con expresion `optCcBlendExpression(mode, "$T", overlay.id)`
   - El overlay se cierra en `finally` despues de cada iteracion.

**Cambio clave**: se usa `"$T"` en lugar de `result.id` como primer argumento (base). `$T` es la forma idiomatica en PixelMath para referirse a la imagen target, evitando cualquier ambiguedad con self-reference por ID.

### Modos Hue, Saturation y Lightness implementados

Anteriormente estos tres modos caian al `default: return B` (comportamiento Replace incorrecto).

Implementados en `optCcBlendExpression` usando funciones CIE L\*a\*b\* de PixelMath:

**Hue** (`A` = base, `B` = overlay):
- Toma la direccion de color (matiz) de B y preserva la magnitud del croma y la luminancia de A.
- Formula: `CIEL(A) + (B - CIEL(B)) * chromaA / max(chromaB, eps)` donde `chromaX = sqrt(CIEa(X)^2 + CIEb(X)^2)`
- Fallback si cB <= eps: devuelve A sin cambios.

**Saturation** (`A` = base, `B` = overlay):
- Toma la magnitud del croma de B y preserva la direccion de color y luminancia de A.
- Formula: `CIEL(A) + (A - CIEL(A)) * chromaB / max(chromaA, eps)`
- Fallback si cA <= eps: devuelve A sin cambios.

**Lightness** (`A` = base, `B` = overlay):
- Toma la luminancia de B y preserva matiz y saturacion de A.
- Formula: `A * CIEL(B) / CIEL(A)` (escala A proporcionalmente para que tenga la luminancia de B)
- Fallback si CIEL(A) <= eps: devuelve 0 (negro).

Nota: `CIEa()` y `CIEb()` son funciones estandar del PixelMath de PixInsight (disponibles desde PI 1.8.x). Si la build instalada no las soporta, el script emitira un error de PM explicito. En ese caso, la solucion es usar ChannelExtraction + ChannelCombination como alternativa.

### Comportamiento de See all Images Blended

Cuando `chkCcSeeAllBlended` esta marcado:
1. Se desactivan todos los checkboxes `Live` individuales.
2. `scheduleCcSlotsPreview` detecta el flag y llama `optComposeCcSlots` en el callback de `beginCandidate`.
3. El resultado compuesto (todas las imagenes activas blended en orden) se muestra como candidato en el preview.
4. El usuario puede entonces hacer `Set to Current` para consolidarlo en el workflow.

Activadores de re-preview automatico:
- Cambiar `chkCcSeeAllBlended`
- Cambiar `chkActive` de cualquier slot mientras `chkCcSeeAllBlended` esta activo
- Cambiar `ncBrightness` o `ncSaturation` mientras `ccAutoPreview()` retorna true

---

## 33. Sesion 2026-05-10 - Opt_5d: tabs perezosos invisibles y Curves Live lento (v30-opt-5d-2)

**Archivo afectado:** `PI_Workflow_Opt_5d.js`
**Version interna nueva:** `30-opt-5d-2`

### Bug 1: la primera vez que se entraba a Stretching (Post / CC) solo se veia "Image Selection"

**Sintoma:** Al abrir el dialogo y hacer click por primera vez en la pestaña Stretching, en la columna izquierda solo aparecia el header `STRETCHING ENGINE` arriba y la barra `Image Selection` abajo, con un gran espacio vacio entre ambos. Las secciones `Star Split`, `RGB / STARLESS` y `STARS` no eran visibles. Al cambiar a otra pestaña (Post o Pre) y volver, todas las secciones aparecian correctamente.

**Root cause:** En Opt_5d se introdujo construccion perezosa de tabs (`ensureTabConfigured` en `onTabChanged`). Solo `Pre` se construia eager antes de `addPage`; `Stretching`, `Post` y `CC` se construian al primer `onPageSelected`. PJSR no recalcula la geometria del `viewport` de un `ScrollBox` cuando se añaden hijos al sizer interno despues de que el `ScrollBox` ya esta dentro de un `TabBox` activo y la pagina se ha mostrado. Solo el ciclo hide/show del `TabBox` al cambiar de pestaña fuerza el relayout. `adjustToContents()` sobre `leftContent`, `viewport` y `page` no era suficiente.

**Fix:** Construccion eager de TODOS los tabs antes de `addPage`:
- `PI_Workflow_Opt_5d.js:5859-5864` — añadidas las llamadas `configureStretchTab()`, `configurePostTab()`, `configureCcTab()` justo despues de `configurePreTab()` y antes de los `addPage`.
- `PI_Workflow_Opt_5d.js:10639` — `ensureTabConfigured` simplificado a no-op seguro (todos los tabs ya estan `__configured = true`).

### Bug 2: Curves Live (Post Processing) tardaba mucho en marcar/desmarcar el checkbox

**Sintoma:** En la pestaña Post Processing → seccion Curves, al pulsar el checkbox `Live` pasaba mucho tiempo desde el click hasta que la marca aparecia y se mostraba el histograma. Lo mismo al desmarcarlo.

**Root cause:** `chkPostCurvesLive.onCheck` ejecutaba siempre `dlg.computePostHistogram()`, que recorre todos los pixels de la vista (24 M para una imagen tipica) sincronicamente en JavaScript. El click se quedaba bloqueado hasta terminar el calculo. Ademas, el calculo se ejecutaba tambien al desmarcar, donde el histograma no se va a mostrar.

**Fix en `PI_Workflow_Opt_5d.js:9342`:**
1. Llamar `dlg.updatePostCurvesWidgetVisibility()` PRIMERO y `processEvents()` para que el tick del checkbox y el hide del widget se pinten antes del calculo pesado.
2. Si `checked === false`, retornar inmediatamente: el histograma no es necesario al ocultar.
3. Solo en el caso `checked === true` se llama a `computePostHistogram()`, `repaint()` y `schedulePostCurvesLive(140)`.
4. Tras el `repaint()` se ejecuta un segundo `processEvents()` para forzar que el paint event se procese **antes** de salir del handler. Sin este flush, en la primera activacion el widget pintaba una vez (con `postCurvesHistogram` todavia null durante el primer show) y el `repaint()` posterior quedaba en cola sin dispararse hasta el siguiente evento (p.ej. mover un punto de la curva); resultado visible: el histograma de fondo no aparecia hasta interactuar con la curva.

### Reglas reforzadas tras esta sesion

- **Construccion de tabs en TabBox+ScrollBox:** todos los tabs deben construirse antes de `addPage`. Construccion perezosa post-`addPage` es problematica en PJSR porque el viewport no relayouta.
- **Trabajo pesado en handlers de UI:** cualquier handler de checkbox/boton que dispare un calculo costoso (histograma, getSamples global, etc.) debe primero actualizar la UI visible y llamar `processEvents()`, y omitirse cuando el output no se va a mostrar.

---

## 34. Sesion 2026-05-10 - Curves Post: histograma RGB siempre visible y reset al desactivar Live (v30-opt-5d-3)

**Archivo afectado:** `PI_Workflow_Opt_5d.js`
**Version interna nueva:** `30-opt-5d-3`

### Cambio 1: histograma de fondo siempre RGB

**Antes:** En el widget de curvas de Post Processing, el histograma de fondo seguia el canal seleccionado del combo: si el canal era `K` (RGB/K) se pintaban R+G+B, pero si era `R`, `G`, `B` o `S` solo se pintaba ese canal individual.

**Ahora:** El histograma de fondo pinta siempre R, G y B simultaneamente sin importar el canal de curva activo. Esto da una referencia de color estable mientras se editan curvas por canal.

**Fix en `PI_Workflow_Opt_5d.js:9388`:** sustituido `var chans = key === "K" ? ["R", "G", "B"] : [key];` por `var chans = ["R", "G", "B"];` en el `onPaint` de `dlg.postCurvesWidget`.

### Cambio 2: reset de curva al desactivar Live

**Antes:** Al desmarcar el checkbox `Live` los puntos de curva (`postCurvesPoints`) y los controles numericos (`Contrast`, `Brightness`, `Shadows lift`, `Highlights compress`, `Saturation`) conservaban su estado. Al volver a activar Live aparecia la curva con los ajustes anteriores.

**Ahora:** Al desmarcar Live se reinicia todo el estado de curvas:
- `dlg.postCurvesPoints` vuelve a la identidad para `K`, `R`, `G`, `B`, `S` (`[[0,0],[1,1]]`).
- `dlg.postCurvesManual` se pone a `false`.
- Controles numericos al default: `Contrast=0`, `Brightness=0`, `Shadows lift=0`, `Highlights compress=0`, `Saturation=1.0` via `nc.setValue()`.

**Fix en `PI_Workflow_Opt_5d.js:9342`:** rama `if (!checked)` ampliada para resetear estado antes del `return`.

### Notas de implementacion

- `optNumeric()` en `PI_Workflow_Opt_5d.js:4813` retorna un `NumericControl` con metodo `setValue(v)`. Cada llamada se envuelve en `try/catch` por si el control fue destruido.
- `dlg.postCurvesPoints` se inicializa originalmente en `optBuildPostCurvesSection` (`PI_Workflow_Opt_5d.js:9296`) con la misma estructura identidad usada en el reset.
- Llamar `setValue` no dispara `onValueUpdated` (el handler `curvesChanged` que llama `syncPostParametricCurve(true)`) en PJSR; por eso es seguro resetear sin recursion.

---

## 35. Sesion 2026-05-10 - Curves Post: histograma de fondo selectivo por canal (v30-opt-5d-4)

**Archivo afectado:** `PI_Workflow_Opt_5d.js`
**Version interna nueva:** `30-opt-5d-4`

### Comportamiento final del histograma de fondo

Sustituido el comportamiento "siempre R+G+B" por un esquema condicionado al canal de curva seleccionado en el combo `Channel`:

| Canal de curva activo | Histogramas de fondo |
|-----------------------|----------------------|
| `RGB/K`               | `K` (luminancia) + `R` + `G` + `B` solapados |
| `Saturation`          | `K` (luminancia) + `R` + `G` + `B` solapados |
| `Red`                 | solo `R` |
| `Green`               | solo `G` |
| `Blue`                | solo `B` |

**Fix en `PI_Workflow_Opt_5d.js:9388`:** sustituido `var chans = ["R", "G", "B"];` por `var chans = (key === "K" || key === "S") ? ["K", "R", "G", "B"] : [key];` en `postCurvesWidget.onPaint`.

### Razon

- Cuando se edita el canal RGB/K o Saturation, el usuario quiere ver luminancia y los tres canales de color a la vez para juzgar el efecto global.
- Cuando se edita un canal de color especifico (R, G, B), pintar los otros canales en el fondo distrae y reduce el contraste visual del histograma del canal que se esta ajustando.

---

## 36. Sesion 2026-05-10 - VLX (VeraLux) intermitente: priorizar siempre el path de funcion script (v30-opt-5d-5)

**Archivo afectado:** `PI_Workflow_Opt_5d.js`
**Version interna nueva:** `30-opt-5d-5`

### Sintoma

Al ejecutar un stretch con algoritmo `VeraLux` (`VLX`) la consola solo mostraba `=> Stretch preview path: VLX` y la imagen candidato volvia sin cambios. Sin error visible. El bug era intermitente: a veces VLX si funcionaba (dependiendo del estado de la sesion).

### Root cause

VeraLux se distribuye en PixInsight como **script** (`verlux.js` / `VeraLux.js`), no como `ProcessInstance` nativo. El branch de VLX en `runStretch` probaba primero `optCreateVeraLuxProcessInstance()`:

1. `ProcessInstance.fromIcon("VeraLux")` puede devolver un icono guardado obsoleto que el usuario tenga en su workspace, totalmente inrelacionado con VeraLux real. `executeOn(view)` corre ese icono y la imagen no cambia (o cambia mal) sin lanzar excepcion.
2. `eval("VeraLux") + new VeraLux()` instancia la clase Dialog del script — `executeOn` no es un metodo valido alli y puede no producir cambios.

El path correcto, `optResolveVeraLuxProcessFunction() → processVeraLux(image, params, progressCb)`, era el fallback y solo se ejecutaba si el path de Process devolvia `null`. Cuando la sesion tenia un icono "VeraLux" guardado, el path equivocado se cogia primero.

### Fix en `PI_Workflow_Opt_5d.js:6342`

Invertida la prioridad y endurecida la validacion del fallback:

1. **Primero:** intentar siempre el path de funcion script (`processVeraLux`) si `optResolveVeraLuxProcessFunction()` la encuentra. Loggea `=> VeraLux: using script function (processVeraLux).` y emite mensajes de progreso `=> VeraLux: ...` durante la ejecucion (asi el usuario sabe que VLX si esta corriendo).
2. **Solo si la funcion no esta disponible**, probar `optCreateVeraLuxProcessInstance()`. Si devuelve un proceso, validar que **al menos un parametro** de VeraLux (`logD`/`protectB`/`convergence`/`targetBg`/`colorGrip`) sea aceptado via `optTrySetProcessPropertySilently`. Si ninguno acepta, lanzar error explicito (`"VeraLux ProcessInstance did not accept any expected parameter..."`) en lugar de ejecutar un icono dudoso silenciosamente.

### Consecuencia operativa

- VLX deja de "perderse de vez en cuando": si VeraLux script esta cargable, se ejecuta siempre por la funcion conocida.
- Si VeraLux NO esta instalado, el usuario ahora ve un error claro en lugar de un no-op silencioso.
- Si VeraLux ProcessInstance fuese real algun dia, sigue siendo usable como fallback (con validacion).

### Regla derivada

- Para herramientas que se distribuyen como **script** en PixInsight (VeraLux, BXT, NXT, GraXpert, etc.), preferir siempre el path de funcion sobre `ProcessInstance.fromIcon`. Los iconos guardados pueden ser obsoletos; las funciones script tienen API conocida y estable.

---

## 37. Sesion 2026-05-10 - VLX seguia sin funcionar: forzar carga del script (v30-opt-5d-6)

**Archivo afectado:** `PI_Workflow_Opt_5d.js`
**Version interna nueva:** `30-opt-5d-6`

### Sintoma reportado

Tras 5d-5, VLX seguia "sin hacer nada". Solo se veia `=> Stretch preview path: VLX` y el candidato volvia sin cambios. Sin error, sin log de `=> VeraLux: ...`.

### Root cause adicional descubierto

VeraLux **tambien existe como modulo nativo** de PixInsight (`bin/VeraLuxPixInsight-pxm.dll` en la instalacion). Esto cambia el comportamiento de `optVeraLuxAvailable()`:

```js
return optHasVeraLuxProcess()                       // true (PXM cargado)
    || (optResolveVeraLuxProcessFunction() != null) // never reached
    || optEnsureVeraLuxSupportLoaded();             // never reached
```

`optHasVeraLuxProcess()` devuelve `true` porque el PXM esta cargado, asi que el operador `||` cortocircuita y `optEnsureVeraLuxSupportLoaded()` nunca se llama. Resultado: el script `verlux.js` (que define `processVeraLux`) nunca se carga, y `optResolveVeraLuxProcessFunction()` devuelve `null`.

En 5d-5 cambie la prioridad para preferir el path de funcion script, pero la funcion no estaba disponible porque el script no se habia cargado nunca. El codigo caia al fallback de ProcessInstance, que crea el proceso nativo VeraLux pero le pasa parametros con nombres `logD`/`protectB`/etc. que **NO coinciden con los nombres reales del proceso nativo**. La validacion `anySet` de 5d-5 detectaba esto y lanzaba excepcion — pero la excepcion la captura `optSafeUi` y la ensea como popup (que el usuario probablemente no relacionaba con VeraLux explicitamente).

### Fix en `PI_Workflow_Opt_5d.js:6342`

Antes de llamar a `optResolveVeraLuxProcessFunction()`, forzar la carga del script con `optEnsureVeraLuxSupportLoaded()`:

```js
try { optEnsureVeraLuxSupportLoaded(); } catch (eEnsure) {}
var veraLuxFn = optResolveVeraLuxProcessFunction();
if (typeof veraLuxFn === "function") {
   // path de funcion script (correcto)
}
```

Asi `verlux.js` se carga via `optTryLoadOptionalScript`, `processVeraLux` queda definido en el scope global, y la siguiente llamada a `optResolveVeraLuxProcessFunction()` lo encuentra. La carga es idempotente (cacheada en `OPT_OPTIONAL_SCRIPT_LOAD_STATE.veralux`).

### Regla reforzada

- **`optVeraLuxAvailable` y similares** son comprobaciones de "alguna forma de soporte existe", no garantia de que el path de funcion script este cargado. Si el flujo necesita explicitamente la funcion script, llamar `optEnsureXxxSupportLoaded()` directamente antes de resolverla.
- En general, no asumir que `optXxxAvailable()` haya cargado todas las opciones; los `||` cortocircuitan en cuanto encuentran un soporte valido.

---

## 38. Sesion 2026-05-10 - VLX: resolver estricto + carga del script mas reciente (v30-opt-5d-7)

**Archivo afectado:** `PI_Workflow_Opt_5d.js`
**Version interna nueva:** `30-opt-5d-7`

### Sintoma final que persistia tras 5d-6

Tras forzar `optEnsureVeraLuxSupportLoaded()` en el branch VLX (5d-6), la consola mostraba:
```
=> Stretch preview path: VLX
=> VeraLux: using script function (processVeraLux).
```
y nada mas. Sin progress messages (`=> VeraLux: Analyzing...`), sin error. La candidata volvia sin cambios.

### Root cause definitivo

El usuario tiene **tres** fuentes de VeraLux instaladas:

| Ubicacion | Tipo | Fecha mtime | Menu PI |
|-----------|------|-------------|---------|
| `bin/VeraLuxPixInsight-pxm.dll` | Modulo nativo PXM | 2026-05-07 | (registra `VeraLux` global) |
| `verlux.js` (raiz install) | Script Suite v2.0.7 | 2025-12-25 | `VeraLux > VeraLux Suite` |
| `src/scripts/VeraLux/verlux.js` | Script VeraLux Stretch | 2025-12-14 | `VHS-Porting > VeraLux Stretch` |

`optResolveVeraLuxProcessFunction` tenia un escaneo heuristico que probaba candidatos como `"VeraLux"` y un scan global por nombres conteniendo `"veralux"`. El **modulo PXM nativo registra `VeraLux` como constructor global**. `eval("VeraLux")` lo devolvia como `function` y el resolver entregaba ese constructor como si fuese `processVeraLux`. Llamarlo sin `new` con `(image, params, callback)` no dispara el progressCallback ni hace nada visible: silencio total. El `optEnsureVeraLuxSupportLoaded` previo se saltaba la carga porque `optResolveVeraLuxProcessFunction()` ya devolvia "una funcion" (la PXM), aunque incorrecta.

Adicionalmente, los dos scripts de VeraLux tienen el mismo `processVeraLux(img, params, cb)` pero estaban en orden ascendente en `optVeraLuxCandidatePaths`, por lo que se cargaria el **mas viejo** primero.

### Fix 1: `optResolveVeraLuxProcessFunction` estricto (`PI_Workflow_Opt_5d.js:735`)

Eliminadas todas las heuristicas. Ahora solo busca el nombre exacto `processVeraLux`:
1. `typeof processVeraLux === "function"` (closure scope)
2. `eval("processVeraLux")` (direct eval)
3. `this["processVeraLux"]`
4. Si nada, devuelve `null`.

Esto evita que el modulo PXM (que expone `VeraLux`, no `processVeraLux`) confunda al resolver. La carga del script via `optEnsureVeraLuxSupportLoaded` se hace correctamente porque ahora el resolver devuelve null hasta que se carga el script real, y entonces se vuelve a llamar.

### Fix 2: `optEnsureVeraLuxSupportLoaded` carga solo la mas reciente (`PI_Workflow_Opt_5d.js:977`)

Nuevo helper `optPickNewestExistingPath(candidatePaths)` que recorre los candidatos, descarta los que no existen, y devuelve el de mayor `FileInfo.lastModified`. `optEnsureVeraLuxSupportLoaded` carga solo ese fichero. Si no encuentra ninguno con mtime, cae al comportamiento original (probar todos).

Loggea `=> VeraLux: loaded script <ruta>` para que el usuario sepa que version se cargo.

### Resultado esperado

Para el usuario, cuyo sistema tiene los tres origenes:
1. `optEnsureVeraLuxSupportLoaded` detecta `verlux.js` (raiz) como mas reciente (Dec 25 2025) y lo carga. Console: `=> VeraLux: loaded script C:/Program Files/PixInsight/verlux.js`.
2. Suite v2.0.7 define `processVeraLux` global.
3. El resolver estricto encuentra `processVeraLux` y se ejecuta la stretch real con progress messages.
4. El modulo PXM nativo (`VeraLux`) sigue siendo accesible como ProcessInstance pero ya no contamina la resolucion del script.

### Reglas derivadas

- **Resolvers de funciones script deben ser estrictos:** buscar el nombre exacto documentado por el script. Heuristicas (object methods, name scans) son dañinas cuando el mismo proyecto distribuye un PXM nativo con nombres similares.
- **Multiples scripts con la misma API:** cargar el mas reciente por mtime evita versiones obsoletas que quedan al no desinstalar correctamente. Util tambien para BXT/NXT/GraXpert si en el futuro coexisten varias versiones.

---

## 39. Sesion 2026-05-11 - PI Workflow: warnings, MGC_NB, mascaras y ayuda ampliada

**Archivos afectados:** `PI Workflow.js`, `PI Workflow_resources.jsh`, `PI Workflow_help.xhtml`

### Warnings de arranque

- Eliminada la clave duplicada `check.SCNR green` en `PI Workflow_resources.jsh`.
- Reemplazado el marcador dinamico `control.__opt6dTooltipsApplied` por una lista interna `OPT6D_TOOLTIP_APPLIED_CONTROLS`, evitando el warning PJSR por leer una propiedad inexistente del control.

### Narrowband MGC/SPCC

- `optRunMGCCompatibleWorkflow()` busca ahora un icono `MGC_NB` cuando el target tiene perfil narrowband.
- Si `MGC_NB` existe y la build no expone parametros NB scriptables, se informa como icono configurado en vez de emitir el warning generico de parametros NB no expuestos.
- `SPCC_NB` tambien suprime el warning de parametros NB scriptables cuando se usa como icono GUI configurado.

### Masking

- El texto inicial de Masking dice literalmente: `The mask are the white areas.`
- El algoritmo `FAME` se muestra como `FAME (Seti Astro)`.
- La preview live de Range Selection y Color Mask ya no calcula la mascara sobre una copia reducida de la imagen. Ahora genera la misma mascara full-resolution que `Generate Active Mask` y reduce solo la mascara terminada para mostrarla. Esto elimina la diferencia visual causada por promediar ruido/estrellas antes del umbral.

### Channel Combination

- Cada seccion `Image 1` ... `Image 6` tiene un combo `Mask:` con `None` y las mascaras guardadas en memoria.
- La mascara elegida se aplica solo a ese slot mientras se ejecutan brillo, saturacion, color y curvas del slot. Otros slots no quedan afectados.
- La geometria de la mascara debe coincidir con la fuente del slot; si no coincide se lanza error en vez de aplicar una mascara incorrecta.

### Recursos y manual

- Ampliados tooltips de Masking, Range Selection, Color Mask, FAME, Mask por slot y controles numericos.
- Manual XHTML ampliado con tabla de algoritmos/parametros de Masking, explicacion del desfase preview/final y controles por slot en Channel Combination.
- `PI Workflow_help.xhtml` validado como XML mediante `System.Xml.XmlDocument`.

---

## 40. Sesion 2026-05-11 - PI Workflow: GraXpert warning, VeraLux loader, UI GraXpert Denoise y Show/Hide Mask

**Archivos afectados:** `PI Workflow.js`, `PI Workflow_resources.jsh`, `PI Workflow_help.xhtml`

### GraXpert `view.image.isLinear`

- `optRequireLinearImage()` ya no lee directamente `view.image.isLinear`.
- Ahora comprueba primero si la propiedad existe mediante `("isLinear" in view.image)` y solo entonces lee `view.image["isLinear"]`.
- Esto evita el warning PJSR `reference to undefined property view.image.isLinear` en builds donde `Image` no expone esa propiedad.

### VeraLux

- Añadido `optTryLoadVeraLuxScript()`.
- El loader de VeraLux evalua el script dentro de una funcion envoltorio y captura explicitamente `processVeraLux`, asignandolo al symbol del script principal.
- Esto corrige el caso en que `verlux.js` existe pero el `processVeraLux` definido por `eval` no queda visible para `optResolveVeraLuxProcessFunction()`.

### GraXpert Denoise UI

- Eliminados de la interfaz los checkboxes `Disable GPU` y `Show logs`.
- Internamente `disableGPU=false` y `showLogs=false`.
- El manual se actualizo para reflejar que esos valores ya no son controles de usuario.

### Active mask visibility

- En el panel de memorias de mascara se agrego el boton `Show/Hide Mask` entre `Reset` y `Set to Active Mask`.
- `Generate Active Mask` sigue promoviendo la mascara generada a mascara activa.
- Click derecho sobre memoria solo previsualiza/selecciona la memoria.
- `Set to Active Mask` promueve la ultima memoria seleccionada a mascara activa.
- `Show/Hide Mask` alterna la visualizacion de la mascara activa en el preview sin cambiar cual mascara esta activa para procesos posteriores.

---

## 41. Sesion 2026-05-11 - PI Workflow: VeraLux disponibilidad robusta

**Archivo afectado:** `PI Workflow.js`

### Sintoma

Al ejecutar `VeraLux` en `RGB / STARLESS`, el script mostraba:

```text
RGB / STARLESS Preview: VeraLux is not available as a process or loadable script in this PixInsight runtime.
```

### Root cause

La carga introducida en la sesion anterior capturaba `processVeraLux`, pero `optEnsureVeraLuxSupportLoaded()` seguia probando solo el candidato mas reciente. En instalaciones con varias copias, el fichero mas reciente puede ser la Suite/UI y no el script VeraLux funcional. Si esa copia no exporta `processVeraLux`, el loader se rendia sin probar `src/scripts/VeraLux/verlux.js`, que era la copia que funcionaba antes.

Ademas, el branch VLX hacia un preflight `optVeraLuxAvailable()` y podia abortar antes de entrar en el flujo completo de carga/fallback.

### Fix

- `optTryLoadVeraLuxScript()` ahora acumula un reporte diagnostico de rutas existentes, export ausente o excepciones de carga.
- `optEnsureVeraLuxSupportLoaded()` usa `optOrderCandidatePathsNewestFirst()`: prueba el mas reciente primero, pero continua con todos los demas candidatos si ese no exporta `processVeraLux`.
- `optVeraLuxAvailable()` prioriza resolver/cargar script antes de aceptar un ProcessInstance.
- El branch `VLX` ya no aborta con preflight. Primero intenta cargar y ejecutar `processVeraLux`; si no existe, intenta el proceso nativo/icono; si tampoco existe, lanza un error con el reporte de carga.
- `optCreateVeraLuxProcessInstance()` ahora prefiere constructor nativo sobre iconos y valida `processId`, reduciendo el riesgo de ejecutar un icono obsoleto con nombre parecido.
- Si el ProcessInstance existe pero no acepta parametros script conocidos, se ejecuta su configuracion nativa/icono como fallback con warning, en vez de abortar por disponibilidad.

### Regla reforzada

Para scripts externos con multiples copias posibles, no basta con elegir el archivo mas reciente. La estrategia robusta es: ordenar por preferencia, probar todos los candidatos, capturar el callable real y reportar diagnosticos concretos si ninguno sirve.

---

## 42. Sesion 2026-05-11 - PI Workflow: VeraLux `missing ; before statement` / `syntax error`

**Archivo afectado:** `PI Workflow.js`

### Sintoma

Tras el hardening anterior, VeraLux ya no fallaba por "no encontrado"; el loader localizaba copias reales pero todas fallaban al evaluarse:

```text
VeraLux script loader report:
C:/Program Files/PixInsight/verlux.js => missing ; before statement
C:/Program Files/PixInsight/src/scripts/VeraLux/verlux.js => syntax error
../src/scripts/VeraLux/verlux.js => syntax error
../verlux.js => missing ; before statement
C:/Program Files/PixInsight/include/../src/scripts/VeraLux/verlux.js => syntax error
```

### Root cause probable

Los scripts PJSR externos suelen declarar `#feature-info \` y otras directivas con continuacion de linea. El preprocesador local eliminaba la linea que empieza por `#`, pero dejaba las lineas continuadas siguientes como texto/HTML dentro del JavaScript evaluado. Al cargar por `eval`, esas lineas ya no pasan por el preprocesador de PixInsight y se interpretan como codigo JS, provocando errores genericos como `missing ; before statement` o `syntax error`.

### Fix

- Añadido `optPjsrPreprocessorLineContinues()`.
- `optPreprocessOptionalScriptText()` ahora elimina tambien las continuaciones de cualquier directiva PJSR que termine en `\`.
- El cambio aplica a VeraLux y al resto de scripts externos cargados por el loader comun, evitando que `#feature-info`, `#define` multilinea u otras directivas con continuacion dejen residuos sintacticos.

### Regla reforzada

Cuando un script PJSR se carga dinamicamente por texto/eval, no basta con borrar solo las lineas que empiezan por `#`: hay que simular al menos la eliminacion de bloques de directivas continuadas. En PixInsight esos bloques los consume el preprocesador antes de compilar; dentro de `eval` no existe ese paso.

---

## 43. Sesion 2026-05-11 - PI Workflow: `Show/Hide Mask` no hacia nada

**Archivos afectados:** `PI Workflow.js`, `PI Workflow_help.xhtml`

### Sintoma

El boton `Show/Hide Mask` del panel de memorias podia no producir ningun cambio visible aunque existiera una mascara activa valida.

### Root cause

El problema no estaba en el click handler, sino en el estado `postActiveMaskShown`. Ese flag se ponia a `true` al generar o promover una mascara activa, pero varios flujos de UI volvian a pintar otra cosa en el preview sin resetear el flag:

- live preview de `Range Selection` / `Color Mask`
- cambio de algoritmo de masking
- recuperacion tras error de live preview

Resultado: el preview podia estar mostrando la imagen base o una live mask temporal mientras `postActiveMaskShown` seguia en `true`. En ese estado, el primer click de `Show/Hide Mask` intentaba "ocultar" una mascara que ya no estaba visible, asi que para el usuario no pasaba nada.

### Fix

- Nuevo helper `optRenderPostSourcePreview()` para restaurar la imagen fuente del panel Post de forma consistente.
- `schedulePostMaskLive()` ahora marca `postActiveMaskShown = false` antes de renderizar una live mask temporal.
- `comboPostMask.onItemSelected()` ahora oculta explicitamente la visualizacion de la mascara activa antes de restaurar la imagen base o recalcular live preview.
- La recuperacion tras `out of memory` en live preview tambien resetea `postActiveMaskShown = false`.
- `optSetPostActiveMaskShown(false, ...)` usa el mismo helper central para volver a la imagen fuente.

### Regla reforzada

En el tab Post existen tres conceptos distintos y no se deben mezclar:

- `postActiveMask`: la mascara real que se aplicara a procesos posteriores.
- `dlg._postLiveMask`: una preview temporal de mascara mientras se ajustan sliders.
- contenido actual del `preview pane`.

Cada vez que el preview pane deje de mostrar la mascara activa, `postActiveMaskShown` debe pasar a `false` inmediatamente. Si no, cualquier boton de toggle quedara desincronizado aunque la mascara activa siga siendo valida internamente.

---

## 44. Sesion 2026-05-11 - PI Workflow: mascara activa visible pero no aplicada de forma fiable

**Archivos afectados:** `PI Workflow.js`, `PI Workflow_help.xhtml`

### Sintoma

El usuario observaba tres sintomas relacionados:

- `Show/Hide Mask` y `Set to Active Mask` parecian no hacer nada.
- La UI podia sugerir que existia una mascara activa, pero no quedaba claro cual era.
- `Use active mask` en Post podia no producir un efecto evidente o depender del comportamiento del proceso concreto.

### Root cause

Habia dos problemas de arquitectura:

1. **Visualizacion de mascara activa.** El preview propio del script no usa la representacion en pantalla de PixInsight; renderiza bitmaps directamente desde `view.image`. Por tanto, aunque se activase `maskVisible` en una `ImageWindow`, esa visualizacion nativa no podia aparecer en el preview del script.
2. **Aplicacion de mascara a procesos Post.** La implementacion confiaba en `workView.window.mask = dialog.postActiveMask.window` + `maskEnabled = true`. Eso depende de que cada proceso respete la semantica de mascara de PixInsight durante `executeOn(view)`. Para muchos procesos funciona, pero para wrappers, herramientas externas o flujos mixtos no es una base suficientemente robusta.

### Fix

- Nuevo render de preview con overlay de mascara: `optRenderPreviewBitmapWithMask()`.
- `OptPreviewPane.render()` en el tab Post, cuando `postActiveMaskShown === true`, compone una previsualizacion propia de la imagen con la mascara superpuesta en rojo.
- `Generate Active Mask` y `Set to Active Mask` ya no sustituyen el preview por la mascara en gris; restauran la imagen Post y dejan que el render del preview superponga la mascara activa.
- Click derecho en una memoria sigue mostrando la mascara almacenada en crudo, pero ademas fuerza `postActiveMaskShown = false` para no dejar el estado visual ambiguo.
- `Use active mask` en Post deja de depender del masking nativo de la ventana. Ahora:
  - se clona el estado original de la imagen candidata,
  - se ejecuta el proceso completo sobre la candidata,
  - se mezcla el resultado procesado con la imagen original usando la mascara activa mediante PixelMath:
    - mono: `processed*mask + original*(1-mask)`
    - RGB: por canal con la misma mascara gris.

### Regla reforzada

Para los procesos Post del workflow, la mascara activa debe entenderse como **mezcla determinista entre original y procesado**, no solo como una propiedad de `ImageWindow`. Eso garantiza resultados consistentes aunque un proceso externo, un wrapper o un `executeOn()` concreto no respeten o no expongan claramente el masking nativo de PixInsight.

---

## 45. Sesion 2026-05-15 - PI Workflow 3: hardening para revision comunitaria

**Archivos afectados:** `PI Workflow 3.js`

**Archivo base intacto:** `PI Workflow 2.js`

### Objetivo

Crear una copia nueva para distribuir en la comunidad astronomica y endurecer los puntos de mayor riesgo detectados en la auditoria estatica:

- bloqueos por procesos externos
- recursos temporales no liberados si falla una operacion pesada
- errores no capturados en botones de seleccion
- combinacion de canales sin validacion previa de geometria
- ayuda dependiente solo de Windows
- identificadores y rutas personales no aptos para distribucion

### Cambios aplicados en `PI Workflow 3.js`

- Nuevo identificador de script: `Utilities > PI_Workflow_Opt_7`.
- Nueva version interna: `32-opt-7-community-rc1`.
- `optUniqueId()` ahora tiene limite defensivo para evitar un bucle indefinido si no se puede generar un id libre.
- Nuevo helper `optRequireSameGeometry()` para validar que las imagenes de entrada tienen el mismo ancho/alto antes de combinarlas.
- `optCloneView()` ahora usa cierre defensivo: si falla `beginProcess`, `assign`, `endProcess`, metadata o show/hide, cierra la ventana temporal antes de relanzar el error.
- `optCreateRgbFromChannels()` valida geometria de R/G/B y cierra la ventana temporal si `PixelMath` falla.
- `optApplyLuminanceLRGB()` valida geometria RGB/L y garantiza `endProcess()` si falla `LRGBCombination`.
- `optSaveViewToFITS()` garantiza `endProcess()` y `forceClose()` aunque falle la escritura FITS temporal.
- `optRunCosmicClarityCLI()` ahora acepta timeout, espera con `msleep(100)` y aborta el proceso externo si supera el limite.
- `optRunCosmicClarityOnView()` ahora falla de forma explicita si Cosmic Clarity no arranca o devuelve error, en lugar de esperar solo al archivo de salida.
- Los botones de seleccion (`Combine mono`, `Separate mono`, `Combine NB`, `Separate NB`, `Process RGB`) ahora pasan por `optSafeUi()`.
- El boton `Help` usa `cmd /c start` en Windows, `open` en macOS y `xdg-open` en Linux.
- `optMain()` ahora ejecuta `finalCleanup()` en `finally`, incluso si `dlg.execute()` lanza excepcion.
- `finalCleanup()` ahora es tolerante a inicializacion parcial del dialogo.
- Se eliminaron rutas personales hardcodeadas de GraXpert bajo `C:/Users/ninoc/...`.

### Validacion hecha

- Comprobacion sintactica con Node despues de retirar directivas PJSR de preprocesador y sustituir `#__FILE__`: `syntax-ok-after-pjsr-preprocessor-strip`.
- Busquedas negativas en `PI Workflow 3.js` para rutas personales `C:/Users/ninoc`, version antigua `31-opt-6d-rc3` e id antiguo `PI_Workflow_Opt_6d`.

### Reversion

Para revertir esta sesion:

- Dejar de usar `PI Workflow 3.js`.
- Volver a ejecutar/distribuir `PI Workflow 2.js`.
- No hace falta restaurar `PI Workflow 2.js`: no fue modificado.
- Si se quiere limpiar el directorio, eliminar solo `PI Workflow 3.js`.

### Riesgo pendiente conocido

Los `#include` obligatorios de AdP/ImageSolver siguen siendo dependencias de preprocesador. Si se distribuye el archivo suelto fuera de una instalacion PixInsight con esos scripts accesibles en las rutas esperadas, el fallo ocurrira antes de que el script pueda mostrar su chequeo de dependencias. Para publicacion comunitaria, acompanar `PI Workflow 3.js` con `PI Workflow_resources.jsh`, `PI Workflow_help.xhtml` y una nota de instalacion/dependencias.
